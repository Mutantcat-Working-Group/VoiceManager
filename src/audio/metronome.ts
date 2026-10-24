/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 节拍器 (Metronome)
 * ---------------------------------------------------------------------------
 * 经典 lookahead 调度：setInterval 每 25ms 醒来一次，把未来 120ms 内的点击
 * 提前排到 AudioContext 的时间轴上，从而获得采样级精度，不受定时器抖动影响。
 * UI 同步通过 onBeat 回调在「排程时」立即触发，而不是等声音真正播放。
 */

import { clamp } from './fx/util';

/** 启动参数 */
export interface MetronomeOptions {
  bpm: number;
  beats: number;
  volume: number;
}

/** 调度器唤醒间隔（ms） */
const TICK_MS = 25;

/** 预排窗口（s） */
const LOOKAHEAD_S = 0.12;

/** 点击包络衰减时长（s） */
const DECAY_S = 0.035;

/** 点击尾音余量（s），确保指数衰减完成后再断开节点 */
const TAIL_S = 0.01;

/** 与 tempo.ts 保持一致的速度区间 */
const MIN_BPM = 20;
const MAX_BPM = 300;

/** 每小节拍数上限 */
const MAX_BEATS = 12;

/** 起拍提前量（s），避开 currentTime 的调度抖动 */
const LEAD_IN_S = 0.06;

const clampBpm = (v: number): number => clamp(Number.isFinite(v) ? v : 120, MIN_BPM, MAX_BPM);
const clampBeats = (v: number): number => Math.round(clamp(Number.isFinite(v) ? v : 4, 1, MAX_BEATS));

export class Metronome {
  /** 每次排程时触发（参数为 0 起步拍），供 UI 做动画同步 */
  onBeat: ((beat: number) => void) | null = null;

  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _bpm = 120;
  private _beats = 4;
  private _volume = 0.7;
  /** 下一个待排程拍点的 AudioContext 时间 */
  private nextTime = 0;
  /** 下一个待排程的拍号（0 起步拍） */
  private scheduleIndex = 0;
  /** 最近一次已排程的拍号，停止时为 -1 */
  private _currentBeat = -1;
  private _running = false;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.output = output;
  }

  /** 启动；bpm / beats / volume 立即生效（bpm 从下一个排程点开始变化） */
  start(options: MetronomeOptions): void {
    this._bpm = clampBpm(options.bpm);
    this._beats = clampBeats(options.beats);
    this._volume = clamp(Number.isFinite(options.volume) ? options.volume : 0.7, 0, 1);
    if (this._running) return;
    this._running = true;
    this._currentBeat = 0;
    this.scheduleIndex = 0;
    this.nextTime = this.ctx.currentTime + LEAD_IN_S;
    this.timer = setInterval(this.scheduler, TICK_MS);
  }

  /** 停止并清理定时器；currentBeat 复位为 -1 */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._running = false;
    this._currentBeat = -1;
    this.scheduleIndex = 0;
  }

  get running(): boolean {
    return this._running;
  }

  /** 最近一次已排程的拍号（0 起步拍），停止时为 -1 */
  get currentBeat(): number {
    return this._currentBeat;
  }

  /** 速度（BPM），从下一个排程点开始生效 */
  set bpm(v: number) {
    this._bpm = clampBpm(v);
  }

  /** 每小节拍数（1..12） */
  set beats(v: number) {
    this._beats = clampBeats(v);
  }

  /** 音量 0..1 */
  set volume(v: number) {
    this._volume = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  }

  dispose(): void {
    this.stop();
    this.onBeat = null;
  }

  /* ------------------------------- 内部实现 ------------------------------- */

  /** lookahead 调度器：把预排窗口内的拍点全部排到时间轴上 */
  private readonly scheduler = (): void => {
    if (!this._running) return; // 兜底：stop 之后迟到的 tick 不再排程
    const ahead = this.ctx.currentTime + LOOKAHEAD_S;
    while (this.nextTime < ahead) {
      const beat = this.scheduleIndex;
      this.click(beat, this.nextTime);
      this._currentBeat = beat;
      this.onBeat?.(beat);
      this.nextTime += 60 / this._bpm;
      this.scheduleIndex = (beat + 1) % this._beats;
    }
  };

  /**
   * 排一个点击：方波（重音）/ 三角波，经 35ms 指数衰减包络送入输出。
   * 包络结束后立即断开，避免节点无限堆积。
   */
  private click(beat: number, time: number): void {
    const accent = beat === 0;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = accent ? 'square' : 'triangle';
    osc.frequency.value = accent ? 1600 : 1000;
    // 指数衰减只能作用于正值，音量调到 0 时保留一个听不到的底噪
    const peak = Math.max(1e-4, this._volume * (accent ? 1 : 0.7));
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(1e-4, time + DECAY_S);
    osc.connect(gain).connect(this.output);
    osc.start(time);
    osc.stop(time + DECAY_S + TAIL_S);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
