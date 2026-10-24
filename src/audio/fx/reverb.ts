import type { FxInstance, FxParams, FxSpec } from './types';
import { generateReverbIR, type ReverbModel } from './ir';
import { createDryWet, formatMs, formatPercent, safeDisconnect } from './util';

const MODELS: ReverbModel[] = ['room', 'hall', 'plate', 'church', 'spring'];
const MODEL_LABELS = ['房间', '大厅', '钢板', '教堂', '弹簧'];

/**
 * 混响 —— 卷积混响，脉冲响应由程序实时生成（无外部音频文件）。
 */
export const reverbSpec: FxSpec = {
  id: 'reverb',
  name: '混响',
  code: 'REV',
  category: 'time',
  blurb: '空间感混响，从房间到教堂五种声学空间',
  params: [
    {
      key: 'model',
      label: '空间类型',
      min: 0,
      max: 4,
      step: 1,
      default: 1,
      options: MODEL_LABELS.map((l, i) => ({ value: i, label: l })),
    },
    { key: 'size', label: '衰减时间', min: 0.3, max: 4, step: 0.05, default: 1.8, unit: 's', format: formatMs },
    { key: 'predelay', label: '预延迟', min: 0, max: 150, step: 1, default: 20, unit: 'ms', format: formatMs },
    { key: 'damp', label: '高频衰减', min: 0, max: 1, step: 0.01, default: 0.4, format: formatPercent },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 0.2, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const pre = ctx.createDelay(1);
    const conv = ctx.createConvolver();
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 4000;

    dw.input.connect(pre);
    pre.connect(conv);
    conv.connect(damp);
    damp.connect(dw.wet);

    const v: FxParams = { ...params };
    let bypassed = false;
    let irKey = '';

    const applyIr = () => {
      const model = MODELS[Math.max(0, Math.min(4, Math.round(v.model)))];
      const size = Math.max(0.3, Math.min(4, v.size));
      const brightness = 1 - Math.max(0, Math.min(1, v.damp));
      const key = `${model}|${size.toFixed(2)}|${brightness.toFixed(2)}`;
      if (key === irKey) return;
      irKey = key;
      try {
        conv.buffer = generateReverbIR(ctx, model, size, brightness);
      } catch (err) {
        console.warn('[VoiceManager] 混响 IR 生成失败', err);
      }
    };

    const apply = () => {
      pre.delayTime.value = v.predelay / 1000;
      damp.frequency.value = 1000 * Math.pow(8, 1 - v.damp);
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
      status: () => `${MODEL_LABELS[Math.round(v.model)]} · ${formatMs(v.size)}`,
      dispose() {
        conv.buffer = null;
        pre.disconnect();
        conv.disconnect();
        damp.disconnect();
      },
    };
  },
};
