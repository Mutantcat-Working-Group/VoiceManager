/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatDbInt, formatPercent, safeDisconnect } from './util';

/**
 * 噪声门 —— 抑制无信号时的底噪、电流声与环境噪声。
 * 低于阈值的声音按「衰减深度」压低，信号回来时按「开启」时间平滑放开。
 */
export const noiseGateSpec: FxSpec = {
  id: 'noise-gate',
  name: '噪声门',
  code: 'GATE',
  category: 'dynamics',
  blurb: '低于阈值时静音，消除吉他/贝斯/麦克风的底噪与电流声',
  worklet: true,
  params: [
    {
      key: 'threshold',
      label: '阈值',
      min: -90,
      max: 0,
      step: 0.5,
      default: -45,
      unit: 'dB',
      format: formatDbInt,
      help: '超过这个电平门才会打开',
    },
    { key: 'attack', label: '开启', min: 0.2, max: 50, step: 0.1, default: 2, unit: 'ms', format: (v) => `${v.toFixed(1)} ms` },
    { key: 'hold', label: '保持', min: 0, max: 1000, step: 5, default: 150, unit: 'ms', format: (v) => `${Math.round(v)} ms` },
    {
      key: 'release',
      label: '关闭',
      min: 10,
      max: 1500,
      step: 5,
      default: 250,
      unit: 'ms',
      format: (v) => `${Math.round(v)} ms`,
      help: '信号掉到阈值以下后，延迟多久开始关门',
    },
    {
      key: 'range',
      label: '衰减深度',
      min: -120,
      max: 0,
      step: 1,
      default: -80,
      unit: 'dB',
      format: formatDbInt,
      help: '-120 dB 为完全静音；调小可保留一点「呼吸感」',
    },
    { key: 'hysteresis', label: '回差', min: 0, max: 20, step: 0.5, default: 4, unit: 'dB', format: formatDbInt },
    { key: 'makeup', label: '输出补偿', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 1, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const node = new AudioWorkletNode(ctx, 'noise-gate', {
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
    let open = true;

    const apply = () => {
      p('threshold').value = v.threshold;
      p('attack').value = v.attack / 1000;
      p('hold').value = v.hold / 1000;
      p('release').value = v.release / 1000;
      p('range').value = v.range;
      p('hysteresis').value = v.hysteresis;
      p('makeup').value = v.makeup;
      dw.setMix(v.mix);
    };
    apply();

    node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; open?: boolean };
      if (d && d.type === 'state') open = !!d.open;
    };

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
      meter: () => (open ? 1 : 0.12),
      status: () => (open ? '开启' : '关闭'),
      dispose() {
        node.port.onmessage = null;
        node.disconnect();
      },
    };
  },
};
