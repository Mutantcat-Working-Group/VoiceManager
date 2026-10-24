/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { DriveCurve } from './util';
import type { FxInstance, FxParams, FxSpec } from './types';
import { formatDbInt, formatPercent, makeDriveCurve, safeDisconnect } from './util';
import { t } from '../../i18n';

const TYPES: { type: DriveCurve; label: string }[] = [
  { type: 'overdrive', label: '过载 Overdrive' },
  { type: 'distortion', label: '失真 Distortion' },
  { type: 'fuzz', label: '法兹 Fuzz' },
  { type: 'tube', label: '电子管 Tube' },
];

/**
 * 失真 / 过载 —— 前级驱动 + 波形整形 + 音色低通 + Presence。
 */
export const driveSpec: FxSpec = {
  id: 'drive',
  name: '失真 / 过载',
  code: 'DRIVE',
  category: 'drive',
  blurb: '四种削波特性：过载、失真、法兹、电子管',
  params: [
    {
      key: 'type',
      label: '类型',
      min: 0,
      max: 3,
      step: 1,
      default: 0,
      options: TYPES.map((t, i) => ({ value: i, label: t.label })),
    },
    { key: 'drive', label: '驱动量', min: 0, max: 1, step: 0.01, default: 0.4, format: formatPercent },
    {
      key: 'tone',
      label: '音色',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.5,
      format: (v) => `${Math.round(1200 * Math.pow(8000 / 1200, v))} Hz`,
    },
    { key: 'presence', label: '临场度', min: -6, max: 6, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'level', label: '输出电平', min: -20, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const inG = ctx.createGain();
    const ws = ctx.createWaveShaper();
    ws.oversample = '4x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const pres = ctx.createBiquadFilter();
    pres.type = 'highshelf';
    pres.frequency.value = 4000;
    const out = ctx.createGain();

    inG.connect(ws);
    ws.connect(lp);
    lp.connect(pres);
    pres.connect(out);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      inG.gain.value = 0.5 + v.drive * 12;
      ws.curve = makeDriveCurve(TYPES[Math.round(v.type)].type, v.drive);
      lp.frequency.value = 1200 * Math.pow(8000 / 1200, v.tone);
      pres.gain.value = v.presence;
      out.gain.value = Math.pow(10, v.level / 20);
    };
    apply();

    return {
      input: inG,
      output: out,
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
          safeDisconnect(inG, ws);
          inG.connect(out);
        } else {
          safeDisconnect(inG, out);
          inG.connect(ws);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.drive),
      status: () => t(TYPES[Math.round(v.type)].label).split(' ')[0],
      dispose() {
        ws.curve = null;
        inG.disconnect();
        out.disconnect();
      },
    };
  },
};
