import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatHz, formatMs, formatPercent, safeDisconnect } from './util';

/**
 * 自动哇音 —— 包络跟随驱动的带通滤波（AudioWorklet）。
 * 输入分两路：一路进带通滤波器，一路进包络跟随器；
 * 包络（0..1）经 (maxFreq - minFreq) 缩放后叠加一个 minFreq 的恒定信号源，
 * 驱动 filter.frequency —— 这样即使信号停歇，滤波器也停在最低频率。
 */
export const autowahSpec: FxSpec = {
  id: 'autowah',
  name: '自动哇音',
  code: 'WAH',
  category: 'filter',
  blurb: '弹奏音量自动扫动带通频率，得到「哇哇」效果，无需踩踏板',
  worklet: true,
  params: [
    {
      key: 'sensitivity',
      label: '灵敏度',
      min: 0.1,
      max: 8,
      step: 0.1,
      default: 2.5,
      format: (v) => `${v.toFixed(1)}×`,
      help: '包络跟随的输入增益，越大越容易被触发',
    },
    { key: 'attack', label: '上扫', min: 0.5, max: 30, step: 0.5, default: 3, unit: 'ms', format: formatMs },
    { key: 'release', label: '回落', min: 5, max: 500, step: 5, default: 90, unit: 'ms', format: formatMs },
    {
      key: 'minFreq',
      label: '最低频率',
      min: 100,
      max: 800,
      step: 10,
      default: 180,
      scale: 'log',
      format: formatHz,
    },
    {
      key: 'maxFreq',
      label: '最高频率',
      min: 800,
      max: 5000,
      step: 50,
      default: 1800,
      scale: 'log',
      format: formatHz,
    },
    { key: 'q', label: '共振', min: 1, max: 20, step: 0.5, default: 6, help: 'Q 越高，哇音越尖' },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    dw.input.connect(filter);
    filter.connect(dw.wet);

    // 包络跟随：输入 -> 0..1 控制信号
    const env = new AudioWorkletNode(ctx, 'envelope-follower', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    dw.input.connect(env);

    // 映射：filter.frequency = 包络 * (max - min) + min
    const map = ctx.createGain();
    const base = ctx.createConstantSource();
    base.offset.value = params.minFreq;
    env.connect(map);
    base.connect(map);
    map.connect(filter.frequency);
    base.start();

    const p = (k: string): AudioParam => env.parameters.get(k) as AudioParam;
    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      p('attack').value = v.attack / 1000;
      p('release').value = v.release / 1000;
      p('sensitivity').value = v.sensitivity;
      p('floor').value = 0;
      filter.Q.value = v.q;
      map.gain.value = Math.max(0, v.maxFreq - v.minFreq);
      base.offset.value = v.minFreq;
      dw.setMix(v.mix);
    };
    apply();

    return {
      input: dw.input,
      output: dw.output,
      setParam(key, value) {
        v[key] = value;
        apply();
      },
      getParam(key) {
        return v[key];
      },
      setBypassed(b) {
        bypassed = b;
        if (b) {
          safeDisconnect(dw.input, dw.dry);
          safeDisconnect(dw.input, dw.wet);
          safeDisconnect(dw.input, filter);
          safeDisconnect(dw.input, env);
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          dw.input.connect(filter);
          dw.input.connect(env);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.sensitivity / 8),
      status: () => `${formatHz(v.minFreq)} – ${formatHz(v.maxFreq)}`,
      dispose() {
        try {
          base.stop();
        } catch {
          /* noop */
        }
        base.disconnect();
        env.disconnect();
        map.disconnect();
        filter.disconnect();
      },
    };
  },
};
