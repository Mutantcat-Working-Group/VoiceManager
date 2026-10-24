/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatMs, formatPercent, formatSemitones, safeDisconnect } from './util';
import { t } from '../../i18n';

/**
 * 变调 —— 颗粒式实时变调（AudioWorklet）。
 * semitones 映射到 worklet 的 pitch 参数（半音），grain 以毫秒给出、
 * 内部换算成秒；feedback 把变调结果送回环形缓冲，可做出阶梯状金属音。
 */
export const pitchSpec: FxSpec = {
  id: 'pitch',
  name: '变调',
  code: 'PITCH',
  category: 'pitch',
  blurb: '颗粒式实时变调：±24 半音，做和声、升降调与特殊音色',
  worklet: true,
  params: [
    {
      key: 'semitones',
      label: '变调量',
      min: -24,
      max: 24,
      step: 0.5,
      default: 0,
      unit: '半音',
      format: formatSemitones,
      help: '正数为升高，负数为降低，0 为原始音高',
    },
    {
      key: 'grain',
      label: '颗粒长度',
      min: 20,
      max: 250,
      step: 5,
      default: 80,
      unit: 'ms',
      format: formatMs,
      help: '颗粒越短越细腻，越长越像「唱片变速」的拖尾',
    },
    {
      key: 'feedback',
      label: '反馈',
      min: 0,
      max: 0.85,
      step: 0.01,
      default: 0,
      format: formatPercent,
      help: '把变调结果送回缓冲，制造无穷上升的金属音',
    },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const node = new AudioWorkletNode(ctx, 'pitch-shifter', {
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
      p('pitch').value = v.semitones;
      p('grain').value = v.grain / 1000;
      p('feedback').value = v.feedback;
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
      meter: () => Math.min(1, Math.abs(v.semitones) / 12),
      status: () => (v.semitones === 0 ? t('原始音高') : formatSemitones(v.semitones)),
      dispose() {
        node.disconnect();
      },
    };
  },
};
