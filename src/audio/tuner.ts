/**
 * 调音器 (Tuner)
 * ---------------------------------------------------------------------------
 * 归一化自相关（normalized autocorrelation）音高检测：在由参考音 A4 推导出的
 * 滞后区间内搜索周期相关系数的峰值，再用抛物线插值细化到亚采样精度，
 * 最后按十二平均律换算成音名、八度与音分偏差。
 * 纯计算模块：不创建任何音频节点，只读取 AnalyserNode 的时域数据。
 */

import { clamp } from './fx/util';

/** 一帧调音结果 */
export interface TunerReading {
  /** 基频 Hz；无信号时为 0 */
  frequency: number;
  /** 'C'..'B'（只用升号）；无信号时为 '--' */
  note: string;
  /** 科学音高记号八度（C4 = 中央 C）；无信号时为 0 */
  octave: number;
  /** 相对最近半音的偏差 -50..+50 */
  cents: number;
  /** 信号可信度 0..1，低于阈值即判定为无信号 */
  clarity: number;
}

/** 十二平均律音名（仅升号，与 MIDI 音高类取模对齐） */
const NOTE_NAMES: readonly string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 无信号时的音名占位 */
const NO_SIGNAL = '--';

/** 时域分析缓冲长度（样本） */
const BUFFER_LENGTH = 2048;

/** 清晰度阈值：低于该值视为无信号 */
const CLARITY_THRESHOLD = 0.5;

/** 静音门限（RMS），全零/极低电平直接判定为无信号 */
const SILENCE_RMS = 1e-4;

/** 搜索下限 = a4 / LOW_DIVISOR（440/8 = 55 Hz），覆盖贝斯低音区 */
const LOW_DIVISOR = 8;

/** 搜索上限 = a4 * HIGH_RATIO（440 * 1200/440 = 1200 Hz），覆盖吉他高音区 */
const HIGH_RATIO = 1200 / 440;

/** 滞后区间跨度超过该值时按 2 抽样，牺牲少量精度换取速度 */
const STRIDE_THRESHOLD = 512;

export class Tuner {
  private readonly source: AnalyserNode;
  /** 时域缓冲，构造时一次性分配 */
  private readonly buffer: Float32Array<ArrayBuffer>;
  /** 相关系数缓存（按滞后索引），供抛物线插值复用 */
  private readonly corr: Float32Array;
  private readonly sampleRate: number;
  private reference = 440;
  private disposed = false;

  constructor(source: AnalyserNode) {
    this.source = source;
    this.buffer = new Float32Array(BUFFER_LENGTH);
    this.corr = new Float32Array(BUFFER_LENGTH);
    this.sampleRate = source.context.sampleRate > 0 ? source.context.sampleRate : 44100;
    // fftSize 小于缓冲长度时，尾部样本会保留上一次的残留数据
    if (source.fftSize < BUFFER_LENGTH) source.fftSize = BUFFER_LENGTH;
  }

  /** 设置参考音 A4 的频率（Hz），非法值忽略；默认 440 */
  setReference(a4: number): void {
    if (!Number.isFinite(a4) || a4 <= 0) return;
    this.reference = a4;
  }

  /** 每帧调用一次；dispose 之后返回 null */
  update(): TunerReading | null {
    if (this.disposed) return null;
    this.source.getFloatTimeDomainData(this.buffer);
    const hit = this.analyze(this.buffer);
    if (!hit) return { frequency: 0, note: NO_SIGNAL, octave: 0, cents: 0, clarity: 0 };

    const midi = 69 + 12 * Math.log2(hit.frequency / this.reference);
    if (!Number.isFinite(midi)) return { frequency: 0, note: NO_SIGNAL, octave: 0, cents: 0, clarity: 0 };

    const nearest = Math.round(midi);
    return {
      frequency: hit.frequency,
      note: NOTE_NAMES[((nearest % 12) + 12) % 12],
      octave: Math.floor(nearest / 12) - 1,
      cents: clamp(100 * (midi - nearest), -50, 50),
      clarity: hit.clarity,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.buffer.fill(0);
    this.corr.fill(0);
  }

  /* ------------------------------- 内部实现 ------------------------------- */

  /** 自相关检测；返回 null 表示静音、非有限值或清晰度不足 */
  private analyze(buf: Float32Array): { frequency: number; clarity: number } | null {
    const n = buf.length;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      if (!Number.isFinite(x)) return null;
      sumSq += x * x;
    }
    if (Math.sqrt(sumSq / n) < SILENCE_RMS) return null;

    const minFreq = Math.max(20, this.reference / LOW_DIVISOR);
    const maxFreq = Math.min(this.sampleRate / 4, this.reference * HIGH_RATIO);
    let maxLag = Math.min(n - 1, Math.floor(this.sampleRate / minFreq));
    let minLag = Math.max(2, Math.floor(this.sampleRate / maxFreq));
    if (maxLag <= minLag) {
      // 采样率异常时的兜底区间
      minLag = 2;
      maxLag = Math.min(n - 1, 1024);
      if (maxLag <= minLag) return null;
    }

    const stride = maxLag - minLag > STRIDE_THRESHOLD ? 2 : 1;
    let bestLag = -1;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag += stride) {
      const c = this.correlationAt(buf, lag);
      this.corr[lag] = c;
      // 严格大于：相关度打平时取更短的周期，即基频而非子八度
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    if (bestLag < 0 || best < CLARITY_THRESHOLD) return null;

    // 八度校正：真实周期的整数倍（尤其两倍周期）往往比基频周期对齐得更好，
    // 只取全局最大容易低八度。相关度在逼近真实周期时单调上升，因此从最短滞后
    // 开始取第一个达到全局峰值 90% 的局部峰，即为基频周期。
    const gridEnd = minLag + Math.floor((maxLag - minLag) / stride) * stride;
    const threshold = best * 0.9;
    for (let lag = minLag + stride; lag <= gridEnd - stride; lag += stride) {
      const c = this.corr[lag];
      if (c >= threshold && c >= this.corr[lag - stride] && c >= this.corr[lag + stride]) {
        bestLag = lag;
        best = c;
        break;
      }
    }

    // 抛物线插值：用同一网格上的左右邻点把峰值细化到亚采样精度
    let lag = bestLag;
    if (bestLag - stride >= minLag && bestLag + stride <= maxLag) {
      const y0 = this.corr[bestLag - stride];
      const y1 = this.corr[bestLag];
      const y2 = this.corr[bestLag + stride];
      const denom = y0 - 2 * y1 + y2;
      if (denom !== 0 && Number.isFinite(denom)) {
        const delta = (stride * (y0 - y2)) / (2 * denom);
        if (Number.isFinite(delta) && Math.abs(delta) < stride) lag = bestLag + delta;
      }
    }

    const frequency = this.sampleRate / lag;
    if (!Number.isFinite(frequency) || frequency <= 0) return null;
    return { frequency, clarity: clamp(best, 0, 1) };
  }

  /** 归一化互相关系数（-1..1），已扣除两端能量差异 */
  private correlationAt(buf: Float32Array, lag: number): number {
    const n = buf.length;
    const m = n - lag;
    let sum = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < m; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      sum += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const norm = Math.sqrt(e1 * e2);
    return norm > 1e-12 ? sum / norm : 0;
  }
}
