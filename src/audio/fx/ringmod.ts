/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxOption, FxParams, FxSpec } from './types';
import { createDryWet, formatHz, formatPercent, safeDisconnect } from './util';

/** 环形调制的载波波形 */
const WAVES: FxOption[] = [
  { value: 0, label: '正弦' },
  { value: 1, label: '方波' },
];

/**
 * 环形调制 —— 振荡器幅度调制（机器人音 / 科幻音效）。
 * 载波（正弦或方波）经 depth 增益后接到 ring.gain 这个 AudioParam 上，
 * 因此 ring 的增益随载波在 -depth..+depth 之间摆动，与信号相乘完成环形调制。
 */
export const ringmodSpec: FxSpec = {
  id: 'ringmod',
  name: '环形调制',
  code: 'RING',
  category: 'modulation',
  blurb: '载波与信号相乘，得到机器人音、颤音与科幻音效',
  params: [
    {
      key: 'freq',
      label: '载波频率',
      min: 10,
      max: 2000,
      step: 1,
      default: 60,
      scale: 'log',
      format: formatHz,
      help: '载波越快越「金属」，10 Hz 附近是经典颤音',
    },
    { key: 'depth', label: '深度', min: 0, max: 1, step: 0.01, default: 0.8, format: formatPercent },
    { key: 'wave', label: '载波波形', min: 0, max: 1, step: 1, default: 0, options: WAVES },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 0.6, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    const depth = ctx.createGain();

    dw.input.connect(ring);
    ring.connect(dw.wet);
    osc.connect(depth).connect(ring.gain);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      osc.type = v.wave >= 1 ? 'square' : 'sine';
      osc.frequency.value = v.freq;
      depth.gain.value = v.depth;
      dw.setMix(v.mix);
    };
    apply();
    osc.start();

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
          safeDisconnect(dw.input, ring);
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          dw.input.connect(ring);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.depth),
      status: () => `${formatHz(v.freq)} ${WAVES.find((w) => w.value === v.wave)?.label ?? ''}`.trim(),
      dispose() {
        try {
          osc.stop();
        } catch {
          /* noop */
        }
        osc.disconnect();
        depth.disconnect();
        ring.disconnect();
      },
    };
  },
};
