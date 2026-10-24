/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 反馈抑制器（Feedback Suppressor）
 * ---------------------------------------------------------------------------
 * 啸叫 / 回声的成因：扬声器输出被麦克风拾回，经过扩音再出来，某个频率被
 * 反复放大，形成越来越响的窄带共振，听感就是「反复回声刚才的声音」。
 *
 * 人声与乐器是宽带的（频谱铺开），啸叫是又窄又亮又持续的单峰 —— 与硬件
 * 反馈抑制器同思路，只对满足这三个条件的峰动手。
 *
 * 实现：MAX_NOTCHES 个 peaking 滤波器串联在信号路径上。检测到持续
 * SUSTAIN_MS 以上的窄峰后，把对应滤波器的 gain 压到 NOTCH_DB；该频率
 * 消失 RELEASE_MS 后 gain 缓慢回 0，不会在音色上留永久疤痕。
 */

/** 最多同时凿几个凹槽；再多会开始伤音色 */
const MAX_NOTCHES = 6;
/** 频谱分辨率：bin 宽度 = sampleRate / FFT_SIZE ≈ 10.8 Hz @48k */
const FFT_SIZE = 4096;
/** 分析间隔 */
const TICK_MS = 60;
/** 峰需持续这么久才认定为啸叫，滤掉敲击、爆破音等瞬态 */
const SUSTAIN_MS = 300;
/** 峰消失多久后凹槽开始恢复。恢复快一点，误判不会长时间残留 */
const RELEASE_MS = 2200;
/** 凹槽 Q 值：越高越窄，越不容易伤到邻近频率 */
const NOTCH_Q = 22;
/** 单点压制深度（dB）。刻意做浅：啸叫通常只需 6-8 dB 就能压住，
 *  万一误判在持续音上，也只是一道很轻的凹陷，不会出现音色空洞 */
const NOTCH_DB = -10;
/**
 * 只有超过这个电平的峰才考虑（注意：这是 FFT bin 电平，比整体 RMS 低约 11 dB，
 * 因为正弦能量集中在一个 bin 上）。啸叫会越振越响，所以门限可以定高一些，
 * 既保证只在「明显在叫」时介入，也不会误伤正常的演奏电平。
 */
const OPEN_DB = -30;
/** 峰高出局部平均这么多才算「窄」；宽带人声 / 乐器的峰会很平，通不过 */
const NARROW_DB = 12;
/** 峰的宽度判据：比峰低 PEAK_WIDTH_DB 以内的 bin 数。啸叫是极窄的共振，
 *  人声共振峰（约 300 Hz 宽 ≈ 28 bin）和乐器谐波族会宽得多，直接排除 */
const PEAK_WIDTH_DB = 8;
const MAX_WIDTH_BINS = 8;
/** 只在容易发生声学反馈的频段内工作 */
const FREQ_MIN = 120;
const FREQ_MAX = 9000;
/** 局部平均的取样半径（bin） */
const LOCAL_RADIUS = 8;
/** 同一个峰的频率漂移容差 */
const FREQ_TOLERANCE = 0.03;
/** 每 tick 的增益爬升系数，决定凹槽建立/恢复的快慢 */
const RAMP = 0.22;

export interface FeedbackGuardStatus {
  /** 生效中的凹槽数量 */
  count: number;
  /** 生效中的频率（Hz，升序） */
  freqs: number[];
}

interface Slot {
  readonly filter: BiquadFilterNode;
  /** 目标频率 */
  freq: number;
  /** 上次确认该频率仍在的时间戳 */
  lastSeen: number;
  /** 是否已被认定（用于状态回报） */
  engaged: boolean;
}

export class FeedbackGuard {
  /** 入口：接在 trim 之后 */
  readonly input: GainNode;
  /** 出口：接往 chainInput */
  readonly output: GainNode;

  private readonly ctx: BaseAudioContext;
  private readonly analyser: AnalyserNode;
  private readonly silent: GainNode;
  private readonly bins: Float32Array<ArrayBuffer>;
  private readonly slots: Slot[] = [];
  /** 待确认的候选峰：必须持续够久才动手 */
  private candidate: { freq: number; since: number } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 是否在分析（测试音源下不分析，否则会把测试音本身凿掉） */
  private analysing = false;

  onStatus: ((s: FeedbackGuardStatus) => void) | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // AnalyserNode 必须被拉取才有数据：挂一个 0 增益的静音支路到 destination
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.35;
    this.silent = ctx.createGain();
    this.silent.gain.value = 0;
    this.input.connect(this.analyser);
    this.analyser.connect(this.silent);
    this.silent.connect(ctx.destination);
    this.bins = new Float32Array(new ArrayBuffer(this.analyser.frequencyBinCount * 4));

    let prev: AudioNode = this.input;
    for (let i = 0; i < MAX_NOTCHES; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = 1000;
      f.Q.value = NOTCH_Q;
      f.gain.value = 0;
      prev.connect(f);
      prev = f;
      this.slots.push({ filter: f, freq: 0, lastSeen: -1e9, engaged: false });
    }
    prev.connect(this.output);
  }

  /** 开始 / 停止分析循环 */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.reset();
  }

  /** 是否分析输入频谱。测试音源 / 标签页数字音频下没有声学回路，关掉即可 */
  setAnalysisEnabled(on: boolean): void {
    this.analysing = on;
    if (!on) this.reset();
  }

  /** 清空所有凹槽，恢复平直响应 */
  reset(): void {
    this.candidate = null;
    for (const s of this.slots) {
      s.freq = 0;
      s.lastSeen = -1e9;
      s.engaged = false;
      s.filter.gain.value = 0;
    }
    this.report();
  }

  get status(): FeedbackGuardStatus {
    const freqs = this.slots
      .filter((s) => s.engaged && s.filter.gain.value < -0.5)
      .map((s) => s.freq)
      .sort((a, b) => a - b);
    return { count: freqs.length, freqs };
  }

  /* ------------------------------ 检测主循环 ------------------------------ */

  private tick(): void {
    if (!this.analysing) return;
    const now = this.ctx.currentTime * 1000;
    this.analyser.getFloatFrequencyData(this.bins);

    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const lo = Math.max(1, Math.floor(FREQ_MIN / binHz));
    const hi = Math.min(this.bins.length - 1, Math.ceil(FREQ_MAX / binHz));

    // 找最响的 bin
    let peakBin = -1;
    let peakDb = -Infinity;
    for (let i = lo; i <= hi; i++) {
      const v = this.bins[i];
      if (Number.isFinite(v) && v > peakDb) {
        peakDb = v;
        peakBin = i;
      }
    }

    if (peakBin < 0 || peakDb < OPEN_DB) {
      this.candidate = null;
    } else {
      // 窄度：与 ±LOCAL_RADIUS 的局部平均比较
      let sum = 0;
      let n = 0;
      for (let i = peakBin - LOCAL_RADIUS; i <= peakBin + LOCAL_RADIUS; i++) {
        if (i < lo || i > hi || Math.abs(i - peakBin) <= 1) continue;
        const v = this.bins[i];
        if (Number.isFinite(v)) {
          sum += v;
          n++;
        }
      }
      const localMean = n > 0 ? sum / n : -140;
      const narrow = peakDb - localMean >= NARROW_DB;

      // 宽度：从峰向两侧数，看有多少 bin 仍不低于「峰 - PEAK_WIDTH_DB」
      let width = 1;
      for (let i = peakBin - 1; i >= lo; i--) {
        const v = this.bins[i];
        if (Number.isFinite(v) && v >= peakDb - PEAK_WIDTH_DB) width++;
        else break;
      }
      for (let i = peakBin + 1; i <= hi; i++) {
        const v = this.bins[i];
        if (Number.isFinite(v) && v >= peakDb - PEAK_WIDTH_DB) width++;
        else break;
      }
      const isResonance = narrow && width <= MAX_WIDTH_BINS;

      if (!isResonance) {
        this.candidate = null;
      } else {
        const freq = peakBin * binHz;
        if (this.candidate && Math.abs(this.candidate.freq - freq) / freq < FREQ_TOLERANCE) {
          this.candidate.freq = (this.candidate.freq + freq) / 2;
        } else {
          this.candidate = { freq, since: now };
        }
        if (now - this.candidate.since >= SUSTAIN_MS) {
          this.engage(this.candidate.freq, now);
          this.candidate = null;
        }
      }
    }

    this.ramp(now);
  }

  /** 为某个频率分配（或复用）一个凹槽 */
  private engage(freq: number, now: number): void {
    // 已经有一个凹槽覆盖这个频率就直接续期
    for (const s of this.slots) {
      if (s.freq > 0 && Math.abs(s.freq - freq) / freq < FREQ_TOLERANCE) {
        s.lastSeen = now;
        s.engaged = true;
        s.filter.frequency.value = freq;
        return;
      }
    }
    // 找空闲槽
    for (const s of this.slots) {
      if (s.filter.gain.value > -0.5) {
        s.freq = freq;
        s.lastSeen = now;
        s.engaged = true;
        s.filter.frequency.value = freq;
        return;
      }
    }
    // 都占着：抢最久没被续期的那个
    let oldest = this.slots[0];
    for (const s of this.slots) if (s.lastSeen < oldest.lastSeen) oldest = s;
    oldest.freq = freq;
    oldest.lastSeen = now;
    oldest.engaged = true;
    oldest.filter.frequency.value = freq;
  }

  /** 按时间推进每个凹槽的增益：该在的压下去，该消失的慢慢回来 */
  private ramp(now: number): void {
    let changed = false;
    for (const s of this.slots) {
      const target = now - s.lastSeen < RELEASE_MS ? NOTCH_DB : 0;
      const cur = s.filter.gain.value;
      if (Math.abs(target - cur) < 0.05) {
        if (cur !== target) {
          s.filter.gain.value = target;
          changed = true;
        }
        if (target === 0 && s.engaged) {
          s.engaged = false;
          s.freq = 0;
          changed = true;
        }
      } else {
        s.filter.gain.value = cur + (target - cur) * RAMP;
        changed = true;
      }
    }
    if (changed) this.report();
  }

  private report(): void {
    this.onStatus?.(this.status);
  }
}
