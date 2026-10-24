/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 效果器模块契约 (FX contract)
 * ---------------------------------------------------------------------------
 * 所有效果器都实现 FxSpec / FxInstance。引擎只依赖这两个接口，
 * 因此可以任意增删、重排效果器而无需改动音频引擎。
 */

export type FxCategory =
  | 'dynamics' // 噪声门 / 压缩 / 限幅
  | 'filter' // 均衡 / 滤波 / 哇音
  | 'drive' // 过载 / 失真 / 法兹 / 激励
  | 'amp' // 音箱模拟 / 箱体
  | 'modulation' // 合唱 / 颤音 / 移相 / 法兰 / 震音
  | 'time' // 延迟 / 混响
  | 'pitch' // 变调 / 八度 / 比特破碎
  | 'utility'; // 音量 / 声场

export interface FxOption {
  value: number;
  label: string;
}

export interface FxParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  /** 数值显示格式 */
  format?: (v: number) => string;
  /** 旋钮行程映射，默认 linear；log 适合频率/时间类参数 */
  scale?: 'linear' | 'log';
  /** 离散选项（存在时渲染为分段开关） */
  options?: FxOption[];
  help?: string;
}

/** 单个效果器实例（已连接到 AudioContext） */
export interface FxInstance {
  /** 信号入口，前级 output 连接到这个节点 */
  readonly input: AudioNode;
  /** 信号出口，连接到后级 input */
  readonly output: AudioNode;
  setParam(key: string, value: number): void;
  getParam(key: string): number;
  setBypassed(bypassed: boolean): void;
  isBypassed(): boolean;
  /** 0..1 的活动量，用于 LED 指示灯；返回 null 表示无指示 */
  meter?(): number | null;
  /** 例如噪声门 "开启/关闭"、调音器音名 */
  status?(): string | null;
  dispose?(): void;
}

export interface FxSpec {
  id: string;
  /** 中文名，例如「噪声门」 */
  name: string;
  /** 设备铭牌上的短代码，例如 GATE */
  code: string;
  category: FxCategory;
  blurb: string;
  params: FxParamSpec[];
  /** 该效果器是否需要 AudioWorklet（创建前会确保已注册） */
  worklet?: boolean;
  create(ctx: AudioContext, params: Record<string, number>): FxInstance;
}

export type FxParams = Record<string, number>;

export function defaultParams(spec: FxSpec): FxParams {
  const out: FxParams = {};
  for (const p of spec.params) out[p.key] = p.default;
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clampParam(spec: FxParamSpec, v: number): number {
  return clamp(v, spec.min, spec.max);
}
