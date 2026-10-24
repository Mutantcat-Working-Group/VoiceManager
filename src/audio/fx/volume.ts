/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { formatDbInt, safeDisconnect } from './util';

/** 增益/音量模块：链路里的推子 */
export const volumeSpec: FxSpec = {
  id: 'volume',
  name: '增益',
  code: 'GAIN',
  category: 'utility',
  blurb: '链路内的电平推子，用于各级之间的音量匹配',
  params: [
    { key: 'gain', label: '增益', min: -40, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'pan', label: '声场', min: -1, max: 1, step: 0.02, default: 0, format: (v) => (Math.abs(v) < 0.03 ? '居中' : `${v < 0 ? '左' : '右'} ${Math.round(Math.abs(v) * 100)}%`) },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();
    g.connect(panner);

    const v: FxParams = { ...params };
    let bypassed = false;
    const apply = () => {
      g.gain.value = Math.pow(10, v.gain / 20);
      panner.pan.value = v.pan;
    };
    apply();

    return {
      input: g,
      output: panner,
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
          safeDisconnect(g, panner);
          g.gain.value = 1;
        } else {
          g.connect(panner);
          apply();
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, Math.abs(v.gain) / 24),
      dispose() {
        g.disconnect();
        panner.disconnect();
      },
    };
  },
};
