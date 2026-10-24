/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 内置测试音源 —— 没有乐器/麦克风时也能试听整条效果链。
 * 模式：正弦 / 粉噪 / 拨弦(Karplus-Strong) / 扫频 / 和弦
 * 全部用原生 Web Audio 节点 + 预生成缓冲实现，不依赖 AudioWorklet。
 */

export type TestToneMode = 0 | 1 | 2 | 3 | 4;

const MODE_LABELS = ['正弦波', '粉红噪声', '拨弦(吉他)', '扫频', '和弦'];

export function testToneModeLabel(mode: number): string {
  return MODE_LABELS[Math.max(0, Math.min(MODE_LABELS.length - 1, Math.round(mode)))] ?? '正弦波';
}

/** 粉红噪声（Paul Kellet 近似） */
function makePinkNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      d[i] = pink;
    }
  }
  return buf;
}

/** Karplus-Strong 拨弦合成，预生成一组长短不同的拨弦缓冲 */
function makePluck(ctx: BaseAudioContext, freq: number, seconds = 1.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const period = Math.max(2, Math.round(ctx.sampleRate / freq));
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const v = (cur + last) * 0.5 * 0.996; // 一阶低通 + 衰减
      line[idx] = v;
      last = cur;
      idx = (idx + 1) % period;
      d[i] = v;
    }
  }
  return buf;
}

const CHORD_FREQS = [110, 164.81, 220, 277.18, 329.63, 440]; // Am 类开放和弦

export class TestTone {
  private osc: OscillatorNode | null = null;
  private oscGain: GainNode | null = null;
  private extraOscs: OscillatorNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private pluckTimer: number | null = null;
  private pinkBuffer: AudioBuffer;
  private pluckBuffers: AudioBuffer[] = [];
  private out: GainNode;
  private _mode: TestToneMode = 2;
  private _freq = 220;
  private _level = 0.5;
  private _running = false;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pinkBuffer = makePinkNoise(ctx);
    this.pluckBuffers = [82.41, 110, 146.83, 196, 246.94].map((f) => makePluck(ctx, f));
  }

  get output(): AudioNode {
    return this.out;
  }

  get mode(): TestToneMode {
    return this._mode;
  }

  setMode(m: number): void {
    this._mode = Math.max(0, Math.min(4, Math.round(m))) as TestToneMode;
    if (this._running) this.restart();
  }

  setFreq(hz: number): void {
    this._freq = Math.max(20, Math.min(4000, hz));
    if (this.osc && this._running) this.osc.frequency.setTargetAtTime(this._freq, this.ctx.currentTime, 0.02);
  }

  setLevel(v: number): void {
    this._level = Math.max(0, Math.min(1, v));
    this.out.gain.setTargetAtTime(this._running ? this._level * 0.35 : 0, this.ctx.currentTime, 0.03);
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.out.gain.setTargetAtTime(this._level * 0.35, this.ctx.currentTime, 0.05);
    this.spawn();
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    this.teardown();
  }

  dispose(): void {
    this.stop();
    this.out.disconnect();
  }

  private restart(): void {
    this.teardown();
    this.spawn();
  }

  private teardown(): void {
    if (this.osc) {
      try {
        this.osc.stop();
      } catch {
        /* noop */
      }
      this.osc.disconnect();
      this.oscGain?.disconnect();
      this.osc = null;
      this.oscGain = null;
    }
    for (const o of this.extraOscs) {
      try {
        o.stop();
      } catch {
        /* noop */
      }
      o.disconnect();
    }
    this.extraOscs = [];
    if (this.noiseSrc) {
      try {
        this.noiseSrc.stop();
      } catch {
        /* noop */
      }
      this.noiseSrc.disconnect();
      this.noiseSrc = null;
    }
    if (this.pluckTimer !== null) {
      clearInterval(this.pluckTimer);
      this.pluckTimer = null;
    }
  }

  private spawn(): void {
    const t = this.ctx.currentTime;
    switch (this._mode) {
      case 0: {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = this._freq;
        osc.connect(this.out);
        osc.start(t);
        this.osc = osc;
        break;
      }
      case 1: {
        const src = this.ctx.createBufferSource();
        src.buffer = this.pinkBuffer;
        src.loop = true;
        src.connect(this.out);
        src.start(t);
        this.noiseSrc = src;
        break;
      }
      case 2: {
        // 每 900ms 随机拨一根弦
        const pluckOnce = () => {
          const src = this.ctx.createBufferSource();
          src.buffer = this.pluckBuffers[Math.floor(Math.random() * this.pluckBuffers.length)];
          const g = this.ctx.createGain();
          g.gain.value = 0.9;
          src.connect(g).connect(this.out);
          src.start();
          src.onended = () => {
            src.disconnect();
            g.disconnect();
          };
        };
        pluckOnce();
        this.pluckTimer = setInterval(pluckOnce, 900) as unknown as number;
        break;
      }
      case 3: {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.linearRampToValueAtTime(3000, t + 3);
        osc.frequency.linearRampToValueAtTime(80, t + 6);
        const g = this.ctx.createGain();
        g.gain.value = 0.6;
        osc.connect(g).connect(this.out);
        osc.start(t);
        osc.stop(t + 6.2);
        this.osc = osc;
        this.oscGain = g;
        // 循环播放
        const reloop = () => {
          if (!this._running) return;
          const nt = this.ctx.currentTime;
          osc.frequency.cancelScheduledValues(nt);
          osc.frequency.setValueAtTime(80, nt);
          osc.frequency.linearRampToValueAtTime(3000, nt + 3);
          osc.frequency.linearRampToValueAtTime(80, nt + 6);
        };
        this.pluckTimer = setInterval(reloop, 6000) as unknown as number;
        break;
      }
      case 4: {
        const group = this.ctx.createGain();
        group.connect(this.out);
        const oscs: OscillatorNode[] = [];
        for (const f of CHORD_FREQS) {
          const osc = this.ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          const g = this.ctx.createGain();
          g.gain.value = 0.18;
          osc.connect(g).connect(group);
          osc.start(t);
          oscs.push(osc);
        }
        this.extraOscs = oscs;
        this.oscGain = group;
        break;
      }
    }
  }
}
