/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatMs, formatPercent, safeDisconnect } from './util';

const PANS = [-0.75, 0.75, 0];

/**
 * 合唱 —— 多声部短延迟 + LFO 调制，声音更宽更厚。
 */
export const chorusSpec: FxSpec = {
  id: 'chorus',
  name: '合唱',
  code: 'CHO',
  category: 'modulation',
  blurb: '多声部叠加，让单音变成一片',
  params: [
    { key: 'rate', label: '速率', min: 0.1, max: 8, step: 0.05, default: 1.2, format: (v) => `${v.toFixed(2)} Hz` },
    { key: 'depth', label: '深度', min: 0, max: 1, step: 0.01, default: 0.5, format: formatPercent },
    { key: 'delay', label: '基础延迟', min: 5, max: 30, step: 0.5, default: 12, unit: 'ms', format: formatMs },
    {
      key: 'voices',
      label: '声部数',
      min: 1,
      max: 3,
      step: 1,
      default: 2,
      options: [
        { value: 1, label: '单声部' },
        { value: 2, label: '双声部' },
        { value: 3, label: '三声部' },
      ],
    },
    { key: 'spread', label: '声场宽度', min: 0, max: 1, step: 0.01, default: 0.6, format: formatPercent },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 0.4, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const oscs: OscillatorNode[] = [];
    const mods: GainNode[] = [];
    const delays: DelayNode[] = [];
    const panners: StereoPannerNode[] = [];

    for (let i = 0; i < 3; i++) {
      const d = ctx.createDelay(0.2);
      d.delayTime.value = 0.012;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1.2 * (1 + i * 0.13);
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner();
      p.pan.value = PANS[i];
      osc.connect(g);
      g.connect(d.delayTime);
      dw.input.connect(d);
      d.connect(p);
      p.connect(dw.wet);
      osc.start();
      oscs.push(osc);
      mods.push(g);
      delays.push(d);
      panners.push(p);
    }

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      const n = Math.max(1, Math.min(3, Math.round(v.voices)));
      for (let i = 0; i < 3; i++) {
        const on = i < n;
        oscs[i].frequency.value = v.rate * (1 + i * 0.13);
        mods[i].gain.value = on ? v.depth * 0.0045 : 0;
        delays[i].delayTime.value = v.delay / 1000;
        panners[i].pan.value = PANS[i] * v.spread;
        if (!on) {
          try {
            delays[i].disconnect(panners[i]);
          } catch {
            /* noop */
          }
        } else {
          delays[i].connect(panners[i]);
        }
      }
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
          for (const d of delays) {
            try {
              safeDisconnect(dw.input, d);
            } catch {
              /* noop */
            }
          }
          dw.input.connect(dw.output);
        } else {
          safeDisconnect(dw.input, dw.output);
          dw.input.connect(dw.dry);
          for (const d of delays) dw.input.connect(d);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.mix),
      status: () => `${Math.round(v.voices)} 声部 · ${v.rate.toFixed(1)} Hz`,
      dispose() {
        for (const o of oscs) {
          try {
            o.stop();
          } catch {
            /* noop */
          }
          o.disconnect();
        }
        for (const d of delays) d.disconnect();
      },
    };
  },
};
