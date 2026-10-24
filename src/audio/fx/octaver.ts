/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import type { FxInstance, FxOption, FxParams, FxSpec } from './types';
import { formatPercent, safeDisconnect } from './util';

/** 八度音选项：整数倍八度平移 */
const OCTAVES: FxOption[] = [
  { value: -2, label: '低两个八度' },
  { value: -1, label: '低八度' },
  { value: 1, label: '高八度' },
  { value: 2, label: '高两个八度' },
];

/** 八度音的低通截止：旋钮 0..1 映射到 300 Hz..6 kHz */
function toneHz(tone: number): number {
  return Math.round(300 * Math.pow(6000 / 300, tone));
}

function octaveLabel(octave: number): string {
  return OCTAVES.find((o) => o.value === octave)?.label ?? '原始音高';
}

/**
 * 八度音 —— 在干声之上叠加一个整八度平移声，模拟「贝斯/吉他八度效果器」。
 * 干声与八度声是两路独立电平（不走等功率干湿混合），
 * 八度声经过低通滤波以抑制变调颗粒噪声。
 */
export const octaverSpec: FxSpec = {
  id: 'octaver',
  name: '八度音',
  code: 'OCT',
  category: 'pitch',
  blurb: '干声 + 整八度变调，做出低两个八度的贝斯感或高八度的尖锐音色',
  worklet: true,
  params: [
    { key: 'octave', label: '八度', min: -2, max: 2, step: 1, default: -1, options: OCTAVES },
    { key: 'dry', label: '干声比例', min: 0, max: 1, step: 0.01, default: 0.7, format: formatPercent },
    { key: 'wet', label: '八度声比例', min: 0, max: 1, step: 0.01, default: 0.8, format: formatPercent },
    {
      key: 'tone',
      label: '音色',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.35,
      format: (v) => `${toneHz(v)} Hz`,
      help: '低通截止频率，抑制八度声里的变调颗粒噪声',
    },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';

    const node = new AudioWorkletNode(ctx, 'pitch-shifter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    input.connect(dryGain).connect(output);
    input.connect(node);
    node.connect(lp).connect(wetGain).connect(output);

    const p = (k: string): AudioParam => node.parameters.get(k) as AudioParam;
    const v: FxParams = { ...params };
    let bypassed = false;

    const apply = () => {
      // 八度 = 12 半音的整数倍
      p('pitch').value = v.octave * 12;
      p('grain').value = 0.06; // 60 ms
      p('feedback').value = 0;
      dryGain.gain.value = v.dry;
      wetGain.gain.value = v.wet;
      lp.frequency.value = toneHz(v.tone);
    };
    apply();

    return {
      input,
      output,
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
          try {
            safeDisconnect(input, dryGain);
          } catch {
            /* noop */
          }
          try {
            safeDisconnect(input, node);
          } catch {
            /* noop */
          }
          input.connect(output);
        } else {
          try {
            safeDisconnect(input, output);
          } catch {
            /* noop */
          }
          input.connect(dryGain);
          input.connect(node);
        }
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, (Math.abs(v.octave) / 2) * 0.6 + v.wet * 0.4),
      status: () => octaveLabel(v.octave),
      dispose() {
        node.disconnect();
        lp.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
      },
    };
  },
};
