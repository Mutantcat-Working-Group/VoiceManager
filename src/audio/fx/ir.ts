/**
 * 程序化脉冲响应 (IR) 生成 —— 不依赖任何外部音频文件。
 * 用 RBJ 食谱双二阶滤波器 + 确定性 PRNG 实时合成箱体与混响 IR。
 */

export type CabModel = '1x12' | '2x12' | '4x12' | '8x10' | 'di';
export type ReverbModel = 'room' | 'hall' | 'plate' | 'church' | 'spring';

/* ------------------------------ 双二阶系数 ------------------------------ */

interface Coef {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function lowpass(f0: number, q: number, sr: number): Coef {
  const w0 = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cos) / 2) / a0,
    b1: (1 - cos) / a0,
    b2: ((1 - cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function highpass(f0: number, q: number, sr: number): Coef {
  const w0 = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function peaking(f0: number, q: number, gainDb: number, sr: number): Coef {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha / A;
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / A) / a0,
  };
}

/** 对单声道数据依次应用一串双二阶滤波器（原地） */
function applyChain(d: Float32Array, chain: Coef[]): void {
  for (const c of chain) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      d[i] = y;
    }
  }
}

/** 随时间推进的低通（尾音越来越暗） */
function applyProgressiveLowpass(d: Float32Array, sr: number, cutoff: number, dur: number): void {
  let z = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const f = cutoff * Math.max(0.06, Math.pow(0.45, t / Math.max(0.1, dur * 0.45)));
    const a = 1 - Math.exp((-2 * Math.PI * f) / sr);
    z += a * (d[i] - z);
    d[i] = z;
  }
}

/** 确定性 PRNG，保证每次刷新得到相同的 IR */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------- 箱体 IR ------------------------------- */

interface CabSpec {
  seconds: number;
  lowCut: number;
  highCut: number;
  peaks: [number, number, number][];
  speakers: number;
  spreadMs: number;
  seed: number;
}

const CAB_SPECS: Record<CabModel, CabSpec> = {
  '1x12': {
    seconds: 0.062,
    lowCut: 92,
    highCut: 5200,
    peaks: [
      [112, 2.4, 4.5],
      [1620, 3, 3.2],
      [3050, 2, 2],
    ],
    speakers: 1,
    spreadMs: 0,
    seed: 1013,
  },
  '2x12': {
    seconds: 0.078,
    lowCut: 86,
    highCut: 5000,
    peaks: [
      [100, 2.2, 4.2],
      [1520, 3, 3],
      [2820, 2.4, 2.6],
    ],
    speakers: 2,
    spreadMs: 15,
    seed: 2027,
  },
  '4x12': {
    seconds: 0.088,
    lowCut: 82,
    highCut: 4700,
    peaks: [
      [97, 2.2, 5],
      [1450, 3.2, 3.6],
      [2700, 2.6, 3],
    ],
    speakers: 4,
    spreadMs: 11,
    seed: 3041,
  },
  '8x10': {
    seconds: 0.1,
    lowCut: 64,
    highCut: 3400,
    peaks: [
      [70, 2, 4.5],
      [900, 2.5, 2.2],
      [2200, 2, 1.6],
    ],
    speakers: 4,
    spreadMs: 8,
    seed: 4057,
  },
  di: {
    seconds: 0.004,
    lowCut: 20,
    highCut: 18000,
    peaks: [],
    speakers: 1,
    spreadMs: 0,
    seed: 5077,
  },
};

const cabCache = new Map<string, AudioBuffer>();

export function generateCabIR(ctx: BaseAudioContext, model: CabModel): AudioBuffer {
  const spec = CAB_SPECS[model] ?? CAB_SPECS['2x12'];
  const sr = ctx.sampleRate;
  const key = `cab|${model}|${sr}`;
  const cached = cabCache.get(key);
  if (cached) return cached;

  const len = Math.max(64, Math.floor(sr * spec.seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const rnd = mulberry32(spec.seed);
  const chain: Coef[] = [
    highpass(spec.lowCut, 0.71, sr),
    ...spec.peaks.map(([f, q, g]) => peaking(f, q, g, sr)),
    lowpass(spec.highCut, 0.71, sr),
  ];

  // 每个喇叭一份独立滤波后的噪声
  const speakers: Float32Array[] = [];
  for (let s = 0; s < spec.speakers; s++) {
    const n = new Float32Array(len);
    for (let i = 0; i < len; i++) n[i] = rnd() * 2 - 1;
    applyChain(n, chain);
    speakers.push(n);
  }

  const tau = spec.seconds * 0.32;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let s = 0; s < speakers.length; s++) {
      const offset = Math.round(((s * spec.spreadMs + c * (spec.spreadMs * 0.45 + 3)) / 1000) * sr);
      const amp = 1 / (1 + s * 0.75);
      const src = speakers[s];
      for (let i = 0; i < len; i++) {
        const j = i - offset;
        if (j < 0 || j >= len) continue;
        const t = i / sr;
        d[i] += src[j] * amp * Math.exp(-t / tau) * (1 - Math.exp(-i / 180));
      }
    }
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0) {
      const g = 0.82 / peak;
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }

  cabCache.set(key, buf);
  return buf;
}

/* ------------------------------- 混响 IR ------------------------------- */

interface ReverbSpec {
  lengthScale: number;
  tailScale: number;
  cutoff: number;
  earlyTaps: [number, number][];
  comb: boolean;
  seed: number;
}

const REVERB_SPECS: Record<ReverbModel, ReverbSpec> = {
  room: {
    lengthScale: 1,
    tailScale: 0.42,
    cutoff: 6200,
    earlyTaps: [
      [11, 0.5],
      [17, 0.34],
      [23, 0.27],
      [31, 0.2],
    ],
    comb: false,
    seed: 6101,
  },
  hall: {
    lengthScale: 1.35,
    tailScale: 0.82,
    cutoff: 5000,
    earlyTaps: [
      [19, 0.4],
      [27, 0.3],
      [38, 0.24],
      [52, 0.19],
      [71, 0.14],
    ],
    comb: false,
    seed: 6203,
  },
  plate: {
    lengthScale: 0.7,
    tailScale: 0.55,
    cutoff: 7200,
    earlyTaps: [],
    comb: false,
    seed: 6307,
  },
  church: {
    lengthScale: 1.9,
    tailScale: 1.05,
    cutoff: 4200,
    earlyTaps: [
      [28, 0.35],
      [41, 0.28],
      [63, 0.22],
      [89, 0.17],
      [122, 0.13],
    ],
    comb: false,
    seed: 6411,
  },
  spring: {
    lengthScale: 0.55,
    tailScale: 0.5,
    cutoff: 6600,
    earlyTaps: [
      [9, 0.42],
      [14, 0.5],
      [21, 0.3],
      [33, 0.22],
    ],
    comb: true,
    seed: 6523,
  },
};

const reverbCache = new Map<string, AudioBuffer>();

export function generateReverbIR(
  ctx: BaseAudioContext,
  model: ReverbModel,
  seconds: number,
  brightness = 0.6,
): AudioBuffer {
  const spec = REVERB_SPECS[model] ?? REVERB_SPECS.hall;
  const sr = ctx.sampleRate;
  const dur = Math.max(0.15, Math.min(8, seconds)) * spec.lengthScale;
  const b = Math.max(0, Math.min(1, brightness));
  const key = `rev|${model}|${dur.toFixed(2)}|${b.toFixed(2)}|${sr}`;
  const cached = reverbCache.get(key);
  if (cached) return cached;

  const len = Math.max(256, Math.floor(sr * dur));
  const buf = ctx.createBuffer(2, len, sr);
  const rnd = mulberry32(spec.seed);

  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (const [ms, gain] of spec.earlyTaps) {
      const idx = Math.floor((ms / 1000) * sr) + (c === 1 ? Math.floor((ms * 0.14) / 1000 * sr) : 0);
      if (idx < len) d[idx] += gain;
    }
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] += (rnd() * 2 - 1) * Math.exp(-t / (dur * spec.tailScale));
    }
    if (spec.comb) {
      // 弹簧的轻微色散感
      const delays = [0.0031, 0.0047, 0.0069, 0.0091];
      const tmp = new Float32Array(d);
      for (const dl of delays) {
        const n = Math.floor(dl * sr);
        for (let i = n; i < len; i++) d[i] += tmp[i - n] * 0.16;
      }
    }
    applyProgressiveLowpass(d, sr, spec.cutoff * (0.45 + b * 0.75), dur);
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0) {
      const g = 0.7 / peak;
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }

  reverbCache.set(key, buf);
  return buf;
}
