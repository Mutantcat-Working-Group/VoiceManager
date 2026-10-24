/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { DriveCurve } from './util';
import type { FxInstance, FxParams, FxSpec } from './types';
import { formatDbInt, formatPercent, makeDriveCurve, safeDisconnect } from './util';
import { t } from '../../i18n';

interface AmpModel {
  label: string;
  curve: DriveCurve;
  /** 前级增益范围 */
  drive: [number, number];
  bass: number;
  mid: number;
  treble: number;
}

const MODELS: AmpModel[] = [
  { label: '清音电子管', curve: 'tube', drive: [1, 4], bass: 0, mid: 0, treble: 1 },
  { label: '英式摇滚', curve: 'tube', drive: [2, 12], bass: 1, mid: 1.5, treble: 2 },
  { label: '高增益', curve: 'distortion', drive: [4, 24], bass: 2, mid: -1, treble: 3 },
  { label: '贝斯翻顶', curve: 'tube', drive: [1.5, 9], bass: 2.5, mid: 0, treble: 1.5 },
  { label: '爵士俱乐部', curve: 'softclip', drive: [1, 5], bass: 1.5, mid: -1, treble: 1 },
];

/**
 * 音箱模拟 —— 前级波形整形 + 三段音色 + Presence + Master。
 */
export const ampSpec: FxSpec = {
  id: 'amp',
  name: '音箱模拟',
  code: 'AMP',
  category: 'amp',
  blurb: '五种音箱头：清音、英式、高增益、贝斯、爵士',
  params: [
    {
      key: 'model',
      label: '音箱型号',
      min: 0,
      max: 4,
      step: 1,
      default: 1,
      options: MODELS.map((m, i) => ({ value: i, label: m.label })),
    },
    { key: 'gain', label: '前级增益', min: 0, max: 1, step: 0.01, default: 0.5, format: formatPercent },
    { key: 'bass', label: '低频', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'mid', label: '中频', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'treble', label: '高频', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'presence', label: '临场', min: -12, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
    { key: 'master', label: '总音量', min: -20, max: 12, step: 0.5, default: 0, unit: 'dB', format: formatDbInt },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const inG = ctx.createGain();
    const ws = ctx.createWaveShaper();
    ws.oversample = '4x';
    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 120;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 700;
    mid.Q.value = 0.8;
    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 3200;
    const presence = ctx.createBiquadFilter();
    presence.type = 'highshelf';
    presence.frequency.value = 5000;
    const out = ctx.createGain();

    inG.connect(ws);
    ws.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(presence);
    presence.connect(out);

    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      const m = MODELS[Math.max(0, Math.min(MODELS.length - 1, Math.round(v.model)))];
      inG.gain.value = m.drive[0] + v.gain * (m.drive[1] - m.drive[0]);
      ws.curve = makeDriveCurve(m.curve, Math.min(1, 0.18 + v.gain * 0.82));
      bass.gain.value = v.bass + m.bass;
      mid.gain.value = v.mid + m.mid;
      treble.gain.value = v.treble + m.treble;
      presence.gain.value = v.presence;
      out.gain.value = Math.pow(10, v.master / 20);
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
      meter: () => Math.min(1, v.gain),
      status: () => t(MODELS[Math.round(v.model)].label),
      dispose() {
        ws.curve = null;
        inG.disconnect();
        out.disconnect();
      },
    };
  },
};
