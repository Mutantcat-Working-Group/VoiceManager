/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxParams, FxSpec } from './types';
import { formatDbInt, formatHz, safeDisconnect } from './util';

interface Band {
  key: string;
  label: string;
  freq: number;
  type: BiquadFilterType;
  q: number;
}

const BANDS: Band[] = [
  { key: 'g60', label: '低频 60Hz', freq: 60, type: 'lowshelf', q: 0.7 },
  { key: 'g230', label: '中低频 230Hz', freq: 230, type: 'peaking', q: 1.1 },
  { key: 'g910', label: '中频 910Hz', freq: 910, type: 'peaking', q: 1.1 },
  { key: 'g3600', label: '中高频 3.6kHz', freq: 3600, type: 'peaking', q: 1.1 },
  { key: 'g14000', label: '高频 14kHz', freq: 14000, type: 'highshelf', q: 0.7 },
];

/** 五段图示均衡器，频点与参考站一致 */
export const eqSpec: FxSpec = {
  id: 'eq',
  name: '均衡器',
  code: 'EQ',
  category: 'filter',
  blurb: '五段图示均衡：分别增强或减弱低音、中音、高音',
  params: BANDS.map((b) => ({
    key: b.key,
    label: b.label,
    min: -18,
    max: 18,
    step: 0.5,
    default: 0,
    unit: 'dB',
    format: formatDbInt,
  })),
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const filters: BiquadFilterNode[] = BANDS.map((b) => {
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = params[b.key];
      return f;
    });
    input.connect(filters[0]);
    for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
    filters[filters.length - 1].connect(output);

    const v: FxParams = { ...params };
    let bypassed = false;

    return {
      input,
      output,
      setParam(key, value) {
        v[key] = value;
        const i = BANDS.findIndex((b) => b.key === key);
        if (i >= 0) filters[i].gain.value = value;
      },
      getParam(key) {
        return v[key];
      },
      setBypassed(b) {
        bypassed = b;
        if (b) {
          for (const f of filters) {
            try {
              safeDisconnect(input, f);
            } catch {
              /* noop */
            }
          }
          filters[filters.length - 1].disconnect(output);
          input.connect(output);
        } else {
          try {
            safeDisconnect(input, output);
          } catch {
            /* noop */
          }
          input.connect(filters[0]);
          filters[filters.length - 1].connect(output);
        }
      },
      isBypassed: () => bypassed,
      meter: () => {
        let sum = 0;
        for (const b of BANDS) sum += Math.abs(v[b.key]);
        return Math.min(1, sum / 36);
      },
      dispose() {
        for (const f of filters) f.disconnect();
      },
    };
  },
};

export const EQ_FREQ_LABEL = formatHz;
