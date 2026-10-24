import type { FxInstance, FxParams, FxSpec } from './types';
import { formatDbInt, formatPercent, makeDriveCurve, safeDisconnect } from './util';

/**
 * 激励器 —— 干净增益提升 + 高频提亮，用来推后级的音箱或失真。
 */
export const boosterSpec: FxSpec = {
  id: 'booster',
  name: '激励器',
  code: 'BOOST',
  category: 'drive',
  blurb: '提升电平与高频亮度，把后级推得更狠',
  params: [
    { key: 'gain', label: '提升量', min: 0, max: 30, step: 0.5, default: 6, unit: 'dB', format: formatDbInt },
    { key: 'bright', label: '亮度', min: 0, max: 1, step: 0.01, default: 0.4, format: formatPercent },
    { key: 'clip', label: '软削波', min: 0, max: 1, step: 0.01, default: 0.25, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const inG = ctx.createGain();
    const ws = ctx.createWaveShaper();
    ws.oversample = '4x';
    const bright = ctx.createBiquadFilter();
    bright.type = 'highshelf';
    bright.frequency.value = 2500;
    const out = ctx.createGain();

    inG.connect(ws);
    ws.connect(bright);
    bright.connect(out);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      inG.gain.value = Math.pow(10, v.gain / 20);
      ws.curve = v.clip > 0.005 ? makeDriveCurve('softclip', v.clip, 2048) : null;
      bright.gain.value = v.bright * 10;
      out.gain.value = 1 / Math.max(1, Math.pow(10, v.gain / 20) * 0.85);
    };
    apply();

    return {
      input: inG,
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
          safeDisconnect(inG, ws);
          inG.connect(out);
        } else {
          safeDisconnect(inG, out);
          inG.connect(ws);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.gain / 24),
      status: () => `+${v.gain.toFixed(1)} dB`,
      dispose() {
        ws.curve = null;
        inG.disconnect();
        out.disconnect();
      },
    };
  },
};
