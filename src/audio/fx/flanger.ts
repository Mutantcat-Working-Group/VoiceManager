import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatPercent, safeDisconnect } from './util';

/**
 * 法兰 (Flanger) —— 极短延迟 + 反馈 + LFO，梳状滤波扫频。
 */
export const flangerSpec: FxSpec = {
  id: 'flanger',
  name: '法兰',
  code: 'FLG',
  category: 'modulation',
  blurb: '短延迟反馈扫频，经典的喷气机声',
  params: [
    { key: 'rate', label: '速率', min: 0.05, max: 4, step: 0.05, default: 0.3, format: (v) => `${v.toFixed(2)} Hz` },
    { key: 'depth', label: '深度', min: 0, max: 1, step: 0.01, default: 0.6, format: formatPercent },
    { key: 'delay', label: '延迟', min: 0.1, max: 10, step: 0.1, default: 2, format: (v) => `${v.toFixed(1)} ms` },
    { key: 'feedback', label: '反馈', min: 0, max: 0.9, step: 0.01, default: 0.4, format: formatPercent },
    { key: 'manual', label: '手动', min: 0, max: 1, step: 0.01, default: 0.3, format: formatPercent },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 0.45, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const d = ctx.createDelay(0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4000;
    const fb = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(d.delayTime);
    lfo.start();

    dw.input.connect(d);
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d);
    lp.connect(dw.wet);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      d.delayTime.value = 0.0001 + v.manual * 0.0079 + v.delay / 1000;
      lfo.frequency.value = v.rate;
      lfoGain.gain.value = v.depth * 0.004;
      fb.gain.value = Math.min(0.85, v.feedback * 0.9);
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
          safeDisconnect(dw.input, d);
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          dw.input.connect(d);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.mix),
      status: () => `${v.rate.toFixed(2)} Hz · ${Math.round(v.feedback * 100)}%`,
      dispose() {
        try {
          lfo.stop();
        } catch {
          /* noop */
        }
        lfo.disconnect();
        lfoGain.disconnect();
        d.disconnect();
      },
    };
  },
};
