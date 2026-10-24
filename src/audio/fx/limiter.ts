import type { FxInstance, FxParams, FxSpec } from './types';
import { formatDbInt, formatMs, safeDisconnect } from './util';

/** 限幅器：最后一级保护，防止削波与啸叫刺耳 */
export const limiterSpec: FxSpec = {
  id: 'limiter',
  name: '限幅器',
  code: 'LIMIT',
  category: 'dynamics',
  blurb: '死死压住峰值，防止扩音与耳机监听时爆音',
  params: [
    { key: 'threshold', label: '阈值', min: -24, max: 0, step: 0.5, default: -3, unit: 'dB', format: formatDbInt },
    { key: 'attack', label: '启动', min: 0.1, max: 20, step: 0.1, default: 0.3, unit: 'ms', format: formatMs },
    { key: 'release', label: '释放', min: 5, max: 300, step: 5, default: 60, unit: 'ms', format: formatMs },
    { key: 'makeup', label: '输出增益', min: 0, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const comp = ctx.createDynamicsCompressor();
    const out = ctx.createGain();
    comp.connect(out);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      comp.threshold.value = v.threshold;
      comp.ratio.value = 20;
      comp.knee.value = 0;
      comp.attack.value = v.attack / 1000;
      comp.release.value = v.release / 1000;
      out.gain.value = Math.pow(10, v.makeup / 20);
    };
    apply();

    return {
      input: comp,
      output: out,
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
            safeDisconnect(comp, out);
          } catch {
            /* noop */
          }
        } else {
          comp.connect(out);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, Math.max(0, -comp.reduction / 12)),
      status: () => (comp.reduction < -0.2 ? `限幅 ${Math.abs(comp.reduction).toFixed(1)} dB` : '通过'),
      dispose() {
        comp.disconnect();
        out.disconnect();
      },
    };
  },
};
