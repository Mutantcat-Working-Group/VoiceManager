import type { FxInstance, FxOption, FxParams, FxSpec } from './types';
import { dbToGain, formatDbInt, formatHz, safeDisconnect } from './util';

/** 滤波器类型选项 */
const FILTER_TYPES: FxOption[] = [
  { value: 0, label: '低通' },
  { value: 1, label: '高通' },
  { value: 2, label: '带通' },
];

function filterTypeOf(v: number): BiquadFilterType {
  if (v === 1) return 'highpass';
  if (v === 2) return 'bandpass';
  return 'lowpass';
}

function filterLabel(v: number): string {
  return FILTER_TYPES.find((t) => t.value === v)?.label ?? '低通';
}

/**
 * 滤波 / 哇音 —— 手动扫频的滤波器 + 输出电平。
 * 没有干湿混合：它就是链路里的一个固定频点滤波器（踏板哇音的手动版本）。
 */
export const filterSpec: FxSpec = {
  id: 'filter',
  name: '滤波 / 哇音',
  code: 'FILT',
  category: 'filter',
  blurb: '手动低通/高通/带通滤波，拧频率就像踩哇音踏板',
  params: [
    { key: 'type', label: '类型', min: 0, max: 2, step: 1, default: 0, options: FILTER_TYPES },
    {
      key: 'freq',
      label: '频率',
      min: 50,
      max: 8000,
      step: 10,
      default: 1200,
      scale: 'log',
      format: formatHz,
    },
    { key: 'q', label: '共振', min: 0.5, max: 20, step: 0.5, default: 1.2, help: 'Q 越高，截止点越尖' },
    { key: 'level', label: '电平', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    input.connect(filter).connect(output);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      filter.type = filterTypeOf(v.type);
      filter.frequency.value = v.freq;
      filter.Q.value = v.q;
      output.gain.value = dbToGain(v.level);
    };
    apply();

    return {
      input,
      output,
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
          try {
            safeDisconnect(input, filter);
          } catch {
            /* noop */
          }
          try {
            safeDisconnect(filter, output);
          } catch {
            /* noop */
          }
          input.connect(output);
        } else {
          try {
            safeDisconnect(input, output);
          } catch {
            /* noop */
          }
          input.connect(filter);
          filter.connect(output);
        }
      },
      isBypassed: () => bypassed,
      meter: () => null,
      status: () => `${filterLabel(v.type)} ${formatHz(v.freq)}`,
      dispose() {
        filter.disconnect();
        input.disconnect();
        output.disconnect();
      },
    };
  },
};
