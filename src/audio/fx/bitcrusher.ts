import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatPercent, safeDisconnect } from './util';

/**
 * 比特破碎 —— 降低位深并保持采样（AudioWorklet）。
 * bits 与 downsample 在写入 AudioParam 前取整；
 *  downsample 表示「每 N 个采样才刷新一次」，读数写成 1/N。
 */
export const bitcrusherSpec: FxSpec = {
  id: 'bitcrusher',
  name: '比特破碎',
  code: 'CRUSH',
  category: 'pitch',
  blurb: '降低位深与采样率，得到 8-bit / Lo-fi 音色',
  worklet: true,
  params: [
    {
      key: 'bits',
      label: '位深',
      min: 1,
      max: 16,
      step: 1,
      default: 8,
      unit: 'bit',
      format: (v) => `${Math.round(v)} bit`,
      help: '位深越低，量化噪声越明显',
    },
    {
      key: 'downsample',
      label: '采样保持',
      min: 1,
      max: 64,
      step: 1,
      default: 6,
      format: (v) => `1/${Math.round(v)}`,
      help: '每 N 个采样才刷新一次输出，数值越大越「金属」',
    },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const node = new AudioWorkletNode(ctx, 'bit-crusher', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    const dw = createDryWet(ctx, params.mix);
    node.connect(dw.wet);
    dw.input.connect(node);

    const p = (k: string): AudioParam => node.parameters.get(k) as AudioParam;
    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      p('bits').value = Math.round(v.bits);
      p('downsample').value = Math.round(v.downsample);
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
          safeDisconnect(dw.input, node);
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          dw.input.connect(node);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, (16 - v.bits) / 15 * 0.7 + (v.downsample - 1) / 63 * 0.3),
      status: () => `${Math.round(v.bits)} bit · 1/${Math.round(v.downsample)}`,
      dispose() {
        node.disconnect();
      },
    };
  },
};
