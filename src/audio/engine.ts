/**
 * 音频引擎 —— 设备管理 + 主链路
 * ---------------------------------------------------------------------------
 * 信号流：
 *   输入(麦克风/线路/USB 声卡/标签页音频/测试音源)
 *     -> trim(输入微调) -> chainInput -> [效果链] -> chainOutput
 *     -> limiter(安全限幅) -> master(主音量)
 *     -> 输出设备(耳机线 / USB 设备 / 系统默认)
 * 同时并联：analyserIn(输入电平) / analyserOut(输出电平) / recDest(录音)
 */

import { registerWorklets, workletsSupported } from './worklets';
import { TestTone } from './test-tone';

export type InputSourceKind = 'mic' | 'tab' | 'test';

export interface EngineLevels {
  inRms: number;
  inPeak: number;
  outRms: number;
  outPeak: number;
}

export interface DeviceEntry {
  deviceId: string;
  label: string;
}

export interface InputOptions {
  kind: InputSourceKind;
  deviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

const INPUT_KIND_LABEL: Record<InputSourceKind, string> = {
  mic: '麦克风 / 线路输入',
  tab: '标签页 / 系统音频',
  test: '内置测试音源',
};

export function inputKindLabel(kind: InputSourceKind): string {
  return INPUT_KIND_LABEL[kind];
}

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function peak(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  /** 效果链入口 */
  readonly chainInput: GainNode;
  /** 效果链出口 */
  readonly chainOutput: GainNode;
  readonly analyserIn: AnalyserNode;
  readonly analyserOut: AnalyserNode;
  /** 录音用（MediaRecorder 接这里；取自限幅器之后、主音量之前，节拍器不会被录进去） */
  readonly recDest: MediaStreamAudioDestinationNode;
  /** 节拍器等提示音入口，直通主音量但不进录音 */
  readonly clickOut: GainNode;
  readonly testTone: TestTone;

  private trim: GainNode;
  private limiter: DynamicsCompressorNode;
  private master: GainNode;
  private silentIn: GainNode;
  private silentOut: GainNode;
  private sinkDest: MediaStreamAudioDestinationNode | null = null;
  private sinkEl: HTMLAudioElement | null = null;
  private sinkMode: 'context' | 'element' = 'context';
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputKind: InputSourceKind = 'mic';
  private masterDb = -6;
  private trimDb = 0;
  private timeBufIn = new Float32Array(1024);
  private timeBufOut = new Float32Array(1024);
  private deviceChangeHandler: (() => void) | null = null;
  private streamEndedHandler: (() => void) | null = null;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });

    this.trim = this.ctx.createGain();
    this.chainInput = this.ctx.createGain();
    this.chainOutput = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain();
    this.recDest = this.ctx.createMediaStreamDestination();

    // 分析节点挂一个静音 Gain 保证被拉取
    this.silentIn = this.ctx.createGain();
    this.silentIn.gain.value = 0;
    this.silentOut = this.ctx.createGain();
    this.silentOut.gain.value = 0;

    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;

    this.trim.channelCount = 2;
    this.trim.channelCountMode = 'explicit';

    this.trim.connect(this.chainInput);
    this.chainOutput.connect(this.limiter);
    this.limiter.connect(this.master);
    this.limiter.connect(this.recDest);
    this.clickOut = this.ctx.createGain();
    this.clickOut.connect(this.master);

    this.analyserIn = this.ctx.createAnalyser();
    this.analyserIn.fftSize = 2048;
    this.analyserIn.smoothingTimeConstant = 0.72;
    this.trim.connect(this.analyserIn);
    this.analyserIn.connect(this.silentIn);
    this.silentIn.connect(this.ctx.destination);

    this.analyserOut = this.ctx.createAnalyser();
    this.analyserOut.fftSize = 2048;
    this.analyserOut.smoothingTimeConstant = 0.7;

    this.testTone = new TestTone(this.ctx);

    this.applyMaster();
    this.connectOutput();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      this.deviceChangeHandler = () => this.onDevicesChanged?.();
      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
    }
  }

  /* ------------------------------ 事件回调 ------------------------------ */

  onDevicesChanged: (() => void) | null = null;
  onStreamEnded: (() => void) | null = null;

  /* ------------------------------ 基础能力 ------------------------------ */

  get supported(): boolean {
    return !!this.ctx && workletsSupported();
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get state(): AudioContextState {
    return this.ctx.state;
  }

  /** 恢复音频上下文（需在用户手势中调用） */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** 注册所有 AudioWorklet；不依赖用户手势，页面加载时即可完成 */
  ensureWorklets(): Promise<void> {
    return registerWorklets(this.ctx).catch(() => undefined);
  }

  get currentInputKind(): InputSourceKind {
    return this.inputKind;
  }

  get hasInputStream(): boolean {
    return this.stream !== null || this.inputKind === 'test';
  }

  /* ------------------------------ 输入管理 ------------------------------ */

  async setInput(opts: InputOptions): Promise<void> {
    await this.resume();

    if (opts.kind === 'test') {
      this.releaseStream();
      this.inputKind = 'test';
      this.testTone.output.connect(this.trim);
      return;
    }

    let stream: MediaStream;
    if (opts.kind === 'tab') {
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
      };
      if (!md.getDisplayMedia) throw new Error('当前浏览器不支持捕获标签页音频，请使用 Chrome / Edge');
      stream = await md.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      for (const t of stream.getVideoTracks()) t.enabled = false;
    } else {
      const audio: MediaTrackConstraints = {
        deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
        echoCancellation: opts.echoCancellation,
        noiseSuppression: opts.noiseSuppression,
        autoGainControl: opts.autoGainControl,
      };
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    }

    this.releaseStream();
    this.stream = stream;
    this.inputKind = opts.kind;
    this.sourceNode = this.ctx.createMediaStreamSource(stream);
    this.sourceNode.connect(this.trim);

    const track = stream.getAudioTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        this.streamEndedHandler?.();
      });
    }
  }

  private releaseStream(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect(this.trim);
      } catch {
        /* noop */
      }
      this.sourceNode = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    try {
      this.testTone.output.disconnect(this.trim);
    } catch {
      /* noop */
    }
  }

  stopInput(): void {
    this.releaseStream();
    this.inputKind = 'mic';
  }

  setStreamEndedHandler(fn: (() => void) | null): void {
    this.streamEndedHandler = fn;
  }

  /* ------------------------------ 输出管理 ------------------------------ */

  async setOutputDevice(deviceId: string): Promise<void> {
    await this.resume();
    const ctxAny = this.ctx as unknown as {
      setSinkId?: (id: string) => Promise<void>;
      sinkId?: string;
    };

    if (deviceId && typeof ctxAny.setSinkId === 'function') {
      try {
        await ctxAny.setSinkId(deviceId);
        this.sinkMode = 'context';
        this.connectOutput();
        return;
      } catch {
        /* 落到 audio element 方案 */
      }
    }

    if (!this.sinkDest) this.sinkDest = this.ctx.createMediaStreamDestination();
    if (!this.sinkEl) {
      const el = new Audio();
      el.autoplay = true;
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this.sinkEl = el;
    }
    const el = this.sinkEl;
    el.srcObject = this.sinkDest.stream;
    if (deviceId && typeof el.setSinkId === 'function') {
      try {
        await el.setSinkId(deviceId);
      } catch {
        /* 保持系统默认输出 */
      }
    }
    this.sinkMode = 'element';
    this.connectOutput();
    void el.play().catch(() => undefined);
  }

  private connectOutput(): void {
    try {
      this.master.disconnect();
    } catch {
      /* noop */
    }
    this.master.connect(this.analyserOut);
    if (this.sinkMode === 'element' && this.sinkDest) {
      this.master.connect(this.sinkDest);
    } else {
      this.master.connect(this.ctx.destination);
    }
  }

  /* ------------------------------ 设备枚举 ------------------------------ */

  async listDevices(): Promise<{ inputs: DeviceEntry[]; outputs: DeviceEntry[] }> {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs: DeviceEntry[] = [];
    const outputs: DeviceEntry[] = [];
    list.forEach((d, i) => {
      const entry: DeviceEntry = {
        deviceId: d.deviceId,
        label: d.label || (d.kind === 'audioinput' ? `输入设备 ${i + 1}` : `输出设备 ${i + 1}`),
      };
      if (d.kind === 'audioinput') inputs.push(entry);
      else if (d.kind === 'audiooutput') outputs.push(entry);
    });
    return { inputs, outputs };
  }

  /* ------------------------------ 电平 / 音量 ---------------------------- */

  setMasterDb(db: number): void {
    this.masterDb = db;
    this.applyMaster();
  }

  getMasterDb(): number {
    return this.masterDb;
  }

  setTrimDb(db: number): void {
    this.trimDb = db;
    this.trim.gain.setTargetAtTime(Math.pow(10, db / 20), this.ctx.currentTime, 0.02);
  }

  getTrimDb(): number {
    return this.trimDb;
  }

  private applyMaster(): void {
    this.master.gain.setTargetAtTime(Math.pow(10, this.masterDb / 20), this.ctx.currentTime, 0.02);
  }

  getLevels(): EngineLevels {
    this.analyserIn.getFloatTimeDomainData(this.timeBufIn);
    this.analyserOut.getFloatTimeDomainData(this.timeBufOut);
    return {
      inRms: rms(this.timeBufIn),
      inPeak: peak(this.timeBufIn),
      outRms: rms(this.timeBufOut),
      outPeak: peak(this.timeBufOut),
    };
  }

  get limiterNode(): DynamicsCompressorNode {
    return this.limiter;
  }

  dispose(): void {
    this.releaseStream();
    this.testTone.dispose();
    if (this.deviceChangeHandler && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
    }
    if (this.sinkEl) {
      this.sinkEl.srcObject = null;
      this.sinkEl.remove();
    }
    void this.ctx.close().catch(() => undefined);
  }
}
