import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatDbInt, formatMs, formatPercent, formatRatio, safeDisconnect } from './util';

/** 压缩器：缩小动态范围，让人声/乐器更平稳 */
export const compressorSpec: FxSpec = {
  id: 'compressor',
  name: '压缩',
  code: 'COMP',
  category: 'dynamics',
  blurb: '缩小动态范围，让小声更清楚、大声不爆',
  params: [
    { key: 'threshold', label: '阈值', min: -60, max: 0, step: 0.5, default: -24, unit: 'dB', format: formatDbInt },
    { key: 'ratio', label: '比例', min: 1, max: 20, step: 0.5, default: 4, unit: ':1', format: formatRatio },
    { key: 'attack', label: '启动', min: 0.1, max: 100, step: 0.1, default: 3, unit: 'ms', format: formatMs },
    { key: 'release', label: '释放', min: 10, max: 1000, step: 5, default: 250, unit: 'ms', format: formatMs },
    { key: 'knee', label: '拐点', min: 0, max: 40, step: 1, default: 12, unit: 'dB', format: formatDbInt },
    { key: 'makeup', label: '输出增益', min: -12, max: 24, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    const dw = createDryWet(ctx, params.mix);
    comp.connect(makeup).connect(dw.wet);
    dw.input.connect(comp);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      comp.threshold.value = v.threshold;
      comp.ratio.value = v.ratio;
      comp.attack.value = v.attack / 1000;
      comp.release.value = v.release / 1000;
      comp.knee.value = v.knee;
      makeup.gain.value = Math.pow(10, v.makeup / 20);
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
          safeDisconnect(dw.input, comp);
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          dw.input.connect(comp);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, Math.max(0, -comp.reduction / 20)),
      status: () => (comp.reduction < -0.1 ? `-${Math.abs(comp.reduction).toFixed(1)} dB` : '0 dB'),
      dispose() {
        comp.disconnect();
        makeup.disconnect();
      },
    };
  },
};
