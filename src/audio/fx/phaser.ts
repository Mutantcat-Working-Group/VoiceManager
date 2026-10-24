/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatHz, formatPercent } from './util';

const STAGE_COUNTS = [2, 4, 6, 8];

/**
 * 移相器 —— 多级全通滤波器 + LFO 扫频，经典「嗖嗖」声。
 */
export const phaserSpec: FxSpec = {
  id: 'phaser',
  name: '移相器',
  code: 'PHA',
  category: 'modulation',
  blurb: '多级全通扫频，制造相位移动的空灵感',
  params: [
    { key: 'rate', label: '速率', min: 0.05, max: 5, step: 0.05, default: 0.4, format: (v) => `${v.toFixed(2)} Hz` },
    { key: 'depth', label: '深度', min: 0, max: 1, step: 0.01, default: 0.7, format: formatPercent },
    { key: 'base', label: '中心频率', min: 200, max: 2000, step: 10, default: 600, scale: 'log', format: formatHz },
    {
      key: 'stages',
      label: '级数',
      min: 0,
      max: 3,
      step: 1,
      default: 1,
      options: [
        { value: 0, label: '2 级' },
        { value: 1, label: '4 级' },
        { value: 2, label: '6 级' },
        { value: 3, label: '8 级' },
      ],
    },
    { key: 'feedback', label: '反馈', min: 0, max: 0.9, step: 0.01, default: 0.3, format: formatPercent },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 0.5, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const lfoGain = ctx.createGain();
    lfo.connect(lfoGain);
    lfo.start();

    const v: FxParams = { ...params };
    let bypassed = false;
    let stages: BiquadFilterNode[] = [];
    let fbGain: GainNode | null = null;

    /** 按级数重建全通链 */
    const rebuild = () => {
      for (const s of stages) {
        try {
          s.disconnect();
        } catch {
          /* noop */
        }
      }
      stages = [];
      if (fbGain) {
        try {
          fbGain.disconnect();
        } catch {
          /* noop */
        }
        fbGain = null;
      }
      const n = STAGE_COUNTS[Math.max(0, Math.min(3, Math.round(v.stages)))];
      const first = ctx.createBiquadFilter();
      first.type = 'allpass';
      first.frequency.value = v.base;
      first.Q.value = 0.7;
      let prev: BiquadFilterNode = first;
      stages.push(first);
      for (let i = 1; i < n; i++) {
        const f = ctx.createBiquadFilter();
        f.type = 'allpass';
        f.frequency.value = v.base;
        f.Q.value = 0.7;
        prev.connect(f);
        prev = f;
        stages.push(f);
      }
      lfoGain.disconnect();
      for (const s of stages) lfoGain.connect(s.frequency);
      const fb = ctx.createGain();
      fb.gain.value = v.feedback * 0.9;
      prev.connect(fb);
      fb.connect(first);
      fbGain = fb;
      if (!bypassed) {
        dw.input.disconnect();
        dw.input.connect(dw.dry);
        dw.input.connect(first);
        prev.connect(dw.wet);
      }
    };

    const apply = () => {
      lfo.frequency.value = v.rate;
      lfoGain.gain.value = v.depth * v.base * 0.8;
      if (fbGain) fbGain.gain.value = v.feedback * 0.9;
      dw.setMix(v.mix);
      rebuild();
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
        rebuild();
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.mix),
      status: () => `${STAGE_COUNTS[Math.round(v.stages)]} 级 · ${v.rate.toFixed(2)} Hz`,
      dispose() {
        try {
          lfo.stop();
        } catch {
          /* noop */
        }
        lfo.disconnect();
        lfoGain.disconnect();
        for (const s of stages) s.disconnect();
      },
    };
  },
};
