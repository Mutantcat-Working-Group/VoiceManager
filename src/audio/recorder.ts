/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 录音 + 循环录放音 (Loop Station)
 * ---------------------------------------------------------------------------
 * Recorder：用 MediaRecorder 录一段音频，产出带对象 URL 的录音条目。
 * LoopStation：以「小节」为单位的循环叠录——先 arm() 等待下一个小节边界，
 * 录满 N 个小节后自动停止；commit() 把片段解码成 AudioBuffer，用一个
 * loop=true 的 BufferSourceNode 按同一相位循环播放，从而支持无限叠录。
 */

import { clamp } from './fx/util';

/** 一条录音 */
export interface RecordingItem {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  /** 时长（秒） */
  duration: number;
  mimeType: string;
  createdAt: number;
}

/** 一个循环层 */
export interface LoopLayer {
  id: number;
  url: string;
  buffer: AudioBuffer;
  gain: number;
}

/** 按优先级排列的容器/编码候选 */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

/** 默认容器（浏览器自选时的兜底） */
const FALLBACK_MIME = 'audio/webm';

/** 小节边界轮询间隔（ms） */
const BAR_POLL_MS = 20;

/** 循环层增益上限（线性） */
const MAX_LAYER_GAIN = 4;

/** 单次 arm 的最大小节数，防止误操作造成超长录音 */
const MAX_BARS = 64;

/** 内部记录：循环层 + 它独占的播放节点 */
interface LayerRecord {
  layer: LoopLayer;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** 挑选首个受支持的 mimeType；完全不支持 MediaRecorder 时返回 null */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* 个别实现会抛异常，按不支持继续尝试 */
    }
  }
  return '';
}

/** 生成 VoiceManager-YYYYMMDD-HHMMSS 形式的名称 */
function formatName(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `VoiceManager-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export class Recorder {
  private readonly recorder: MediaRecorder;
  private readonly mimeType: string;
  private chunks: Blob[] = [];
  /** 首个/末个分片的时间戳（ms），作为时长的兜底计量 */
  private firstChunkAt = 0;
  private lastChunkAt = 0;
  /** 起停时钟（ms），时长优先取这里 */
  private clockStart = 0;
  private clockEnd = 0;
  private _recording = false;
  /** stop() 的等待者，由 onstop 兑现 */
  private finish: ((item: RecordingItem | null) => void) | null = null;

  constructor(stream: MediaStream) {
    const mime = pickMimeType();
    if (mime === null) throw new Error('当前浏览器不支持 MediaRecorder，无法录音');
    try {
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      throw new Error('无法创建录音器：浏览器拒绝了所选的音频格式');
    }
    this.mimeType = mime || this.recorder.mimeType || FALLBACK_MIME;

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return;
      if (this.chunks.length === 0) this.firstChunkAt = e.timeStamp;
      this.lastChunkAt = e.timeStamp;
      this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.build();
    this.recorder.onerror = () => {
      const resolve = this.finish;
      this.finish = null;
      this._recording = false;
      resolve?.(null);
    };
  }

  get recording(): boolean {
    return this._recording;
  }

  /** 开始录音；重复调用无副作用 */
  start(): void {
    if (this._recording || this.recorder.state === 'recording') return;
    this.chunks = [];
    this.firstChunkAt = 0;
    this.lastChunkAt = 0;
    this._recording = true;
    this.clockStart = Date.now();
    this.clockEnd = 0;
    try {
      this.recorder.start();
    } catch {
      this._recording = false;
    }
  }

  /** 停止并产出条目；没有采集到内容时 resolve null */
  stop(): Promise<RecordingItem | null> {
    if (!this._recording || this.recorder.state !== 'recording') {
      this._recording = false;
      return Promise.resolve(null);
    }
    this.clockEnd = Date.now();
    return new Promise<RecordingItem | null>((resolve) => {
      this.finish = resolve;
      try {
        this.recorder.stop();
      } catch {
        this.finish = null;
        resolve(null);
      }
    });
  }

  /** 释放录音器；进行中的录音会被丢弃（不产出条目） */
  dispose(): void {
    const resolve = this.finish;
    this.finish = null;
    this._recording = false;
    this.chunks = [];
    if (this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        /* 已经停了 */
      }
    }
    resolve?.(null);
  }

  /* ------------------------------- 内部实现 ------------------------------- */

  /** onstop：拼接分片、计量时长并生成条目 */
  private build(): void {
    const resolve = this.finish;
    this.finish = null;
    this._recording = false;
    const chunks = this.chunks;
    this.chunks = [];
    if (!resolve) return;
    if (chunks.length === 0) {
      resolve(null);
      return;
    }
    const blob = new Blob(chunks, { type: this.mimeType });
    const now = Date.now();
    resolve({
      id: `rec-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: formatName(now),
      blob,
      url: URL.createObjectURL(blob),
      duration: this.measureDuration(),
      mimeType: this.mimeType,
      createdAt: now,
    });
  }

  /** 时长优先取起停时钟，其次取首尾分片时间戳 */
  private measureDuration(): number {
    const byClock = (this.clockEnd - this.clockStart) / 1000;
    if (Number.isFinite(byClock) && byClock > 0) return byClock;
    const byChunks = (this.lastChunkAt - this.firstChunkAt) / 1000;
    return Number.isFinite(byChunks) && byChunks > 0 ? byChunks : 0;
  }
}

export class LoopStation {
  /** 录音取流节点：由 LoopStation 创建并持有，UI 把主总线接到这里 */
  readonly dest: MediaStreamAudioDestinationNode;

  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly layerList: LayerRecord[] = [];
  private nextLayerId = 1;
  /** 第 0 层的起播时刻，所有层都以它为相位基准 */
  private firstStart = 0;
  /** 本次录音的起播时刻，供进度显示使用 */
  private recordStart = 0;
  /** 一个小节循环的长度（秒） */
  private loopLength = 0;
  /** 小节网格原点：首次 arm 的时刻，之后保持不变以保证相位一致 */
  private origin = 0;
  private armedFlag = false;
  private recordingFlag = false;
  private disposed = false;
  private recorder: MediaRecorder | null = null;
  private recordMime = FALLBACK_MIME;
  private chunks: Blob[] = [];
  /** 已录完但尚未 commit 的数据 */
  private lastBlob: Blob | null = null;
  private barTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** commit() 的等待者，由 onstop 兑现 */
  private stopResolve: ((blob: Blob | null) => void) | null = null;
  /** 进行中的 stop 请求，避免并发 commit 丢掉回调 */
  private stopPromise: Promise<Blob | null> | null = null;
  /** 防止同一次录音被重复提交 */
  private commitBusy = false;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.output = output;
    this.dest = ctx.createMediaStreamDestination();
  }

  /**
   * 准备录音：从下一个完整小节边界开始，录 bars 个小节。
   * 小节网格以首次 arm 的时刻为原点，因此多次叠录天然同相位。
   */
  arm(bars: number, bpm: number, beatsPerBar: number): void {
    if (this.disposed) throw new Error('循环站已释放，无法准备录音');
    if (this.recordingFlag) return; // 正在录音时忽略新的准备请求
    if (pickMimeType() === null) throw new Error('当前浏览器不支持 MediaRecorder，无法循环录音');
    this.cancelPending();
    const b = clamp(Math.round(bars), 1, MAX_BARS);
    const beats = clamp(Math.round(beatsPerBar), 1, 16);
    const tempo = clamp(bpm, 20, 300);
    this.loopLength = b * beats * (60 / tempo);
    if (this.layerList.length === 0) this.origin = this.ctx.currentTime;
    this.armedFlag = true;
    this.waitForBar();
  }

  /** 停止录音并把刚才那一层转为循环播放；未在录音时无操作并 resolve null */
  async commit(): Promise<LoopLayer | null> {
    if (this.disposed || this.commitBusy) return null;
    // 既没在录音、也没有录完待提交的数据（例如仅处于等待小节阶段）
    if (!this.recordingFlag && !this.lastBlob) return null;
    this.commitBusy = true;
    try {
      const blob = await this.requestStop();
      this.armedFlag = false;
      if (!blob || blob.size === 0) return null;

      let buffer: AudioBuffer;
      try {
        buffer = await this.ctx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        throw new Error('循环层解码失败：这段录音无法被解析');
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 1;
      source.connect(gain).connect(this.output);

      // 与第 0 层同相位：落到 firstStart 网格上、且不早于当前时刻的边界
      const cycles = Math.max(0, Math.ceil((this.ctx.currentTime - this.firstStart) / this.loopLength));
      const when = this.firstStart + cycles * this.loopLength;
      source.start(when);

      const layer: LoopLayer = {
        id: this.nextLayerId++,
        url: URL.createObjectURL(blob),
        buffer,
        gain: 1,
      };
      this.layerList.push({ layer, source, gain });
      return layer;
    } finally {
      this.commitBusy = false;
    }
  }

  /** 设置某层增益（线性 0..4） */
  setLayerGain(id: number, gain: number): void {
    const record = this.layerList.find((r) => r.layer.id === id);
    if (!record) return;
    const g = clamp(Number.isFinite(gain) ? gain : 1, 0, MAX_LAYER_GAIN);
    record.layer.gain = g;
    record.gain.gain.value = g;
  }

  /** 移除一层并释放它的播放节点（URL 不回收，UI 可能仍在引用） */
  removeLayer(id: number): void {
    const index = this.layerList.findIndex((r) => r.layer.id === id);
    if (index < 0) return;
    const record = this.layerList[index];
    this.layerList.splice(index, 1);
    this.releaseRecord(record);
  }

  /** 清空所有层 */
  clear(): void {
    for (const record of this.layerList) this.releaseRecord(record);
    this.layerList.length = 0;
  }

  get layers(): readonly LoopLayer[] {
    return this.layerList.map((r) => r.layer);
  }

  /** 已进入准备状态（含等待小节开始与录音中），commit 后清除 */
  get armed(): boolean {
    return this.armedFlag;
  }

  /** 已录完一层、等待 commit() 提交 */
  get hasPending(): boolean {
    return !this.recordingFlag && !this.armedFlag && this.lastBlob !== null;
  }

  get recording(): boolean {
    return this.recordingFlag;
  }

  /** 录音进度 0..1；未录音时为 0 */
  get progress(): number {
    if (!this.recordingFlag || this.loopLength <= 0) return 0;
    return clamp((this.ctx.currentTime - this.recordStart) / this.loopLength, 0, 1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
    this.armedFlag = false;
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.recordingFlag = false;
    this.stopResolve = null;
    this.stopPromise = null;
    this.commitBusy = false;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop();
      } catch {
        /* 已经停了 */
      }
    }
    this.chunks = [];
    this.lastBlob = null;
    this.clear();
    this.dest.disconnect();
  }

  /* ------------------------------- 内部实现 ------------------------------- */

  /** 取消「等待小节边界」的轮询 */
  private cancelPending(): void {
    if (this.barTimer !== null) {
      clearTimeout(this.barTimer);
      this.barTimer = null;
    }
    if (!this.recordingFlag) this.armedFlag = false;
  }

  /** 轮询到下一个小节边界（严格晚于当前时刻）后开始录音 */
  private waitForBar(): void {
    if (!this.armedFlag || this.disposed) return;
    const now = this.ctx.currentTime;
    const cycles = Math.max(1, Math.ceil((now - this.origin) / this.loopLength));
    const start = this.origin + cycles * this.loopLength;
    if (start - now <= 0.002) {
      this.beginRecording(start);
      return;
    }
    this.barTimer = setTimeout(() => this.waitForBar(), BAR_POLL_MS);
  }

  /** 在指定小节边界开始录音，并在 loopLength 后自动停止 */
  private beginRecording(start: number): void {
    if (this.disposed || !this.armedFlag) return;
    const mime = pickMimeType();
    if (mime === null) throw new Error('当前浏览器不支持 MediaRecorder，无法循环录音');

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(this.dest.stream, mime ? { mimeType: mime } : undefined);
    } catch {
      throw new Error('无法开始循环录音：浏览器拒绝了所选的音频格式');
    }
    this.recorder = recorder;
    this.recordMime = mime || recorder.mimeType || FALLBACK_MIME;
    this.chunks = [];
    this.lastBlob = null;
    this.recordStart = start;
    // 只有第 0 层定义相位基准，后续叠录一律对齐到它
    if (this.layerList.length === 0) this.firstStart = start;
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.onstop = () => this.handleStop();
    recorder.onerror = () => this.abortStop();
    try {
      recorder.start();
    } catch {
      this.recorder = null;
      throw new Error('无法开始循环录音：MediaRecorder 启动失败');
    }
    this.recordingFlag = true;

    const remainMs = Math.max(0, (start + this.loopLength - this.ctx.currentTime) * 1000);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      void this.requestStop();
    }, remainMs);
  }

  /** onstop：汇总分片并交给等待中的 commit() */
  private handleStop(): void {
    const resolve = this.stopResolve;
    this.stopResolve = null;
    this.stopPromise = null;
    this.recordingFlag = false;
    this.armedFlag = false; // 录音已结束，不再是「等待小节」状态
    const chunks = this.chunks;
    this.chunks = [];
    const blob = chunks.length > 0 ? new Blob(chunks, { type: this.recordMime }) : null;
    this.lastBlob = blob;
    resolve?.(blob);
  }

  /** onerror：中断等待，避免 commit 永远挂起 */
  private abortStop(): void {
    const resolve = this.stopResolve;
    this.stopResolve = null;
    this.stopPromise = null;
    this.recordingFlag = false;
    this.armedFlag = false;
    resolve?.(null);
  }

  /** 请求停止当前录音；已停止时直接返回上次录得的数据 */
  private requestStop(): Promise<Blob | null> {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const recorder = this.recorder;
    if (!recorder || recorder.state !== 'recording') {
      const blob = this.lastBlob;
      this.lastBlob = null;
      return Promise.resolve(blob);
    }
    // 已经有 stop 在飞行中（例如定时器和 commit 同时触发），复用同一个承诺
    if (this.stopPromise) return this.stopPromise;
    const promise = new Promise<Blob | null>((resolve) => {
      this.stopResolve = resolve;
      try {
        recorder.stop();
      } catch {
        this.stopResolve = null;
        this.stopPromise = null;
        resolve(null);
      }
    });
    this.stopPromise = promise;
    return promise;
  }

  /** 停止并释放一层独占的播放节点 */
  private releaseRecord(record: LayerRecord): void {
    try {
      record.source.stop();
    } catch {
      /* 还没启动过 */
    }
    record.source.disconnect();
    record.gain.disconnect();
  }
}
