import noiseGateUrl from './noise-gate.worklet.ts?worker&url';
import pitchShifterUrl from './pitch-shift.worklet.ts?worker&url';
import bitCrusherUrl from './bit-crusher.worklet.ts?worker&url';
import envelopeFollowerUrl from './envelope-follower.worklet.ts?worker&url';

const WORKLET_URLS: string[] = [
  noiseGateUrl,
  pitchShifterUrl,
  bitCrusherUrl,
  envelopeFollowerUrl,
];

let pending: Promise<void> | null = null;

/** 注册所有 AudioWorklet 处理器（幂等，重复调用返回同一个 Promise） */
export function registerWorklets(ctx: AudioContext): Promise<void> {
  if (!pending) {
    pending = Promise.all(WORKLET_URLS.map((url) => ctx.audioWorklet.addModule(url))).then(() => undefined);
  }
  return pending;
}

export function workletsSupported(): boolean {
  return typeof globalThis.AudioWorkletNode !== 'undefined' && !!globalThis.AudioWorkletNode;
}
