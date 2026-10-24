/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/** dB -> 线性增益 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** 线性增益 -> dB */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-7));
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 线性域 <-> 旋钮行程域（支持 log 映射） */
export function paramToKnob(v: number, min: number, max: number, scale: 'linear' | 'log' = 'linear'): number {
  if (scale === 'log') {
    const lo = Math.log(Math.max(min, 1e-6));
    const hi = Math.log(Math.max(max, 1e-6));
    return (Math.log(clamp(v, min, max)) - lo) / (hi - lo);
  }
  return (clamp(v, min, max) - min) / (max - min);
}

export function knobToParam(t: number, min: number, max: number, scale: 'linear' | 'log' = 'linear'): number {
  const x = clamp(t, 0, 1);
  if (scale === 'log') {
    const lo = Math.log(Math.max(min, 1e-6));
    const hi = Math.log(Math.max(max, 1e-6));
    return Math.exp(lo + x * (hi - lo));
  }
  return min + x * (max - min);
}

/* ---------------------------------- 格式化 --------------------------------- */

export function formatDb(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
}

export function formatDbInt(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v)} dB`;
}

export function formatHz(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`;
}

export function formatMs(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
}

export function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function formatPercentRaw(v: number): string {
  return `${Math.round(v)}%`;
}

export function formatSemitones(v: number): string {
  const s = v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
  return `${s} 半音`;
}

export function formatRatio(v: number): string {
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}:1`;
}

export function formatRatioRaw(v: number): string {
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}:1`;
}

export function formatIndex(v: number, labels: string[]): string {
  return labels[clamp(Math.round(v), 0, labels.length - 1)] ?? '';
}

/* ------------------------------- 失真曲线生成 ------------------------------- */

export type DriveCurve = 'overdrive' | 'distortion' | 'fuzz' | 'tube' | 'softclip';

/**
 * 生成 WaveShaper 曲线。
 * amount: 0..1（0 = 几乎透明，1 = 极端）
 */
export function makeDriveCurve(
  type: DriveCurve,
  amount: number,
  samples = 4096,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const a = clamp(amount, 0, 1);
  const k = 1 + a * 40; // 驱动强度
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = shapeSample(type, x, k, a);
  }
  return curve;
}

function shapeSample(type: DriveCurve, x: number, k: number, a: number): number {
  switch (type) {
    case 'softclip':
      return Math.tanh(x * k) / Math.tanh(k);
    case 'overdrive': {
      // 不对称软削波，模拟二极管桥
      const bias = 0.08 * a;
      const y = x + bias;
      const t = Math.tanh(y * k * 0.35);
      return (t - Math.tanh(bias * k * 0.35)) / Math.tanh(k * 0.35);
    }
    case 'distortion': {
      // 硬削波 + 少量软化
      const t = x * k * 0.5;
      const soft = Math.sign(t) * Math.pow(Math.abs(t), 0.82);
      return clamp(soft, -0.98, 0.98) * 0.92;
    }
    case 'fuzz': {
      // 极端不对称 + 八度感（平方项）
      const t = x * (1 + a * 6);
      const sq = Math.sign(t) * Math.pow(Math.abs(t), 0.55);
      return clamp(sq * 0.95 + 0.22 * t * t * Math.sign(t), -0.99, 0.99);
    }
    case 'tube': {
      // 电子管：偶次谐波为主，正负半周不对称
      const t = x * (0.6 + a * 5);
      const pos = 1 - Math.exp(-t);
      const neg = -1 + Math.exp(t);
      return t >= 0 ? pos * 0.95 : neg * 1.12;
    }
  }
}

/* --------------------------------- 干湿混合 -------------------------------- */

export interface DryWet {
  input: GainNode;
  output: GainNode;
  /** 干声增益节点（外部效果器不接它） */
  dry: GainNode;
  /** 湿声增益节点：效果器输出接到这里 */
  wet: GainNode;
  setMix(mix: number): void;
  getMix(): number;
}

/** 创建等功率干湿混合节点；mix: 0..1 */
export function createDryWet(ctx: BaseAudioContext, mix = 1): DryWet {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const output = ctx.createGain();
  input.connect(dry).connect(output);
  // 注意：wet 总线只能由效果器输出馈入（effect.connect(wet)），
  // 绝不能把 input 直连到 wet，否则会形成一条绕过效果器的满音量干信号通路。
  wet.connect(output);
  let current = clamp(mix, 0, 1);
  const apply = (m: number) => {
    current = clamp(m, 0, 1);
    // 等功率交叉淡变
    dry.gain.value = Math.cos(current * Math.PI * 0.5);
    wet.gain.value = Math.sin(current * Math.PI * 0.5);
  };
  apply(current);
  return {
    input,
    output,
    wet,
    dry,
    setMix: apply,
    getMix: () => current,
  };
}

/* ------------------------------- 通用旁通辅助 ------------------------------- */

/** 把实例在「旁通」与「启用」之间切换：旁通时 input 直连 output */
export function applyBypass(instance: {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
  setBypassed(b: boolean): void;
  isBypassed(): boolean;
}): void {
  const { input, output, nodes } = instance;
  if (instance.isBypassed()) {
    for (const n of nodes) {
      try {
        input.disconnect(n);
      } catch {
        /* noop */
      }
    }
    input.connect(output);
  } else {
    try {
      input.disconnect(output);
    } catch {
      /* noop */
    }
    for (const n of nodes) input.connect(n);
  }
}

/** 安全断开：目标未连接时不会抛 InvalidAccessError */
export function safeDisconnect(node: AudioNode, dest?: AudioNode | AudioParam): void {
  try {
    if (dest === undefined) node.disconnect();
    else if ('automationRate' in dest) node.disconnect(dest);
    else node.disconnect(dest);
  } catch {
    /* noop */
  }
}
