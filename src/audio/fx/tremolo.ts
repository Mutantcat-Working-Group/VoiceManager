/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatPercent, safeDisconnect } from './util';

const SHAPES: OscillatorType[] = ['sine', 'square', 'triangle'];

/**
 * 颤音 / 震音 —— 音量周期起伏，可选声场摆动。
 */
export const tremoloSpec: FxSpec = {
  id: 'tremolo',
  name: '颤音 / 震音',
  code: 'TREM',
  category: 'modulation',
  blurb: '音量周期起伏，制造脉动与摇摆感',
  params: [
    { key: 'rate', label: '速率', min: 0.1, max: 20, step: 0.05, default: 5, format: (v) => `${v.toFixed(2)} Hz` },
    { key: 'depth', label: '深度', min: 0, max: 1, step: 0.01, default: 0.6, format: formatPercent },
    {
      key: 'shape',
      label: '波形',
      min: 0,
      max: 2,
      step: 1,
      default: 0,
      options: [
        { value: 0, label: '正弦' },
        { value: 1, label: '方波' },
        { value: 2, label: '三角' },
      ],
    },
    { key: 'spread', label: '声场摆动', min: 0, max: 1, step: 0.01, default: 0, format: formatPercent },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;
    trem.connect(panner);
    panner.connect(dw.wet);
    dw.input.connect(trem);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(trem.gain);
    lfo.start();

    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(panner.pan);
    lfo2.start();

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      lfo.type = SHAPES[Math.max(0, Math.min(2, Math.round(v.shape)))];
      lfo2.type = SHAPES[Math.max(0, Math.min(2, Math.round(v.shape)))];
      lfo.frequency.value = v.rate;
      lfo2.frequency.value = v.rate;
      const depth = Math.min(0.95, v.depth);
      lfoGain.gain.value = (depth / 2) * 0.95;
      trem.gain.value = 1 - depth / 2;
      lfo2Gain.gain.value = v.spread * 0.9;
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
          safeDisconnect(dw.input, trem);
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          dw.input.connect(trem);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.depth),
      status: () => `${SHAPES[Math.round(v.shape)]} · ${v.rate.toFixed(1)} Hz`,
      dispose() {
        for (const o of [lfo, lfo2]) {
          try {
            o.stop();
          } catch {
            /* noop */
          }
          o.disconnect();
        }
        trem.disconnect();
        panner.disconnect();
      },
    };
  },
};
