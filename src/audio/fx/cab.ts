/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { CabModel } from './ir';
import type { FxInstance, FxParams, FxSpec } from './types';
import { generateCabIR } from './ir';
import { createDryWet, formatDbInt, formatPercent, safeDisconnect } from './util';

const MODELS: { id: CabModel; label: string }[] = [
  { id: '1x12', label: '1×12 开放式' },
  { id: '2x12', label: '2×12 组合' },
  { id: '4x12', label: '4×12 直排' },
  { id: '8x10', label: '8×10 贝斯' },
  { id: 'di', label: 'DI 直出' },
];

/**
 * 箱体模拟 —— 卷积箱体 IR + 低切 + 空气感。
 */
export const cabSpec: FxSpec = {
  id: 'cab',
  name: '箱体模拟',
  code: 'CAB',
  category: 'amp',
  blurb: '五种箱体，脉冲响应实时生成，可直出 DI',
  params: [
    {
      key: 'model',
      label: '箱体型号',
      min: 0,
      max: 4,
      step: 1,
      default: 1,
      options: MODELS.map((m, i) => ({ value: i, label: m.label })),
    },
    {
      key: 'lowCut',
      label: '低切',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.35,
      format: (v) => `${Math.round(40 + v * 80)} Hz`,
    },
    { key: 'air', label: '空气感', min: 0, max: 1, step: 0.01, default: 0.35, format: formatPercent },
    { key: 'level', label: '输出电平', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    const conv = ctx.createConvolver();
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 6000;
    const level = ctx.createGain();

    dw.input.connect(hp);
    hp.connect(conv);
    conv.connect(air);
    air.connect(level);
    level.connect(dw.wet);

    const v: FxParams = { ...params };
    let bypassed = false;
    let irKey = '';

    const applyIr = () => {
      const model = MODELS[Math.max(0, Math.min(4, Math.round(v.model)))].id;
      if (model === 'di') {
        conv.buffer = null;
        hp.connect(air);
        return;
      }
      try {
        safeDisconnect(hp, air);
      } catch {
        /* noop */
      }
      const key = `${model}|${ctx.sampleRate}`;
      if (key !== irKey) {
        irKey = key;
        conv.buffer = generateCabIR(ctx, model);
      }
      hp.connect(conv);
      conv.connect(air);
    };

    const apply = () => {
      hp.frequency.value = 40 + v.lowCut * 80;
      air.gain.value = v.air * 8;
      level.gain.value = Math.pow(10, v.level / 20);
      applyIr();
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
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.mix),
      status: () => MODELS[Math.round(v.model)].label,
      dispose() {
        conv.buffer = null;
        hp.disconnect();
        air.disconnect();
        level.disconnect();
      },
    };
  },
};
