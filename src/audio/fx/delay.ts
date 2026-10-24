/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import { getTempo, noteToMs } from '../tempo';
import type { FxInstance, FxParams, FxSpec } from './types';
import { createDryWet, formatMs, formatPercent, safeDisconnect } from './util';

/**
 * 延迟 —— 回声 / Delay，支持手动时间、跟随节拍、乒乓立体声与调制。
 */
export const delaySpec: FxSpec = {
  id: 'delay',
  name: '延迟',
  code: 'DLY',
  category: 'time',
  blurb: '回声效果，可手动设定时间或跟随节拍器速度',
  params: [
    { key: 'time', label: '延迟时间', min: 10, max: 1200, step: 1, default: 300, unit: 'ms', format: formatMs },
    {
      key: 'division',
      label: '音符时值',
      min: 0,
      max: 5,
      step: 1,
      default: 2,
      options: [
        { value: 0, label: '1/1' },
        { value: 1, label: '1/2' },
        { value: 2, label: '1/4' },
        { value: 3, label: '1/8' },
        { value: 4, label: '1/8T' },
        { value: 5, label: '1/16' },
      ],
    },
    {
      key: 'sync',
      label: '速度同步',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      options: [
        { value: 0, label: '手动' },
        { value: 1, label: '跟随节拍' },
      ],
    },
    { key: 'feedback', label: '反馈', min: 0, max: 0.95, step: 0.01, default: 0.35, format: formatPercent },
    { key: 'tone', label: '音色', min: 0, max: 1, step: 0.01, default: 0.55, format: (v) => `${Math.round(400 * Math.pow(8000 / 400, v))} Hz` },
    { key: 'mod', label: '调制', min: 0, max: 1, step: 0.01, default: 0, format: formatPercent },
    {
      key: 'pingpong',
      label: '立体声',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      options: [
        { value: 0, label: '单声道' },
        { value: 1, label: '乒乓' },
      ],
    },
    { key: 'mix', label: '干湿比', min: 0, max: 1, step: 0.01, default: 0.25, format: formatPercent },
  ],
  create(ctx: AudioContext, params: FxParams): FxInstance {
    const dw = createDryWet(ctx, params.mix);
    const dL = ctx.createDelay(3);
    const dR = ctx.createDelay(3);
    const toneL = ctx.createBiquadFilter();
    const toneR = ctx.createBiquadFilter();
    toneL.type = 'lowpass';
    toneR.type = 'lowpass';
    const fb = ctx.createGain();
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -1;
    panR.pan.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const modGain = ctx.createGain();
    modGain.gain.value = 0;
    lfo.connect(modGain);
    modGain.connect(dL.delayTime);
    modGain.connect(dR.delayTime);
    lfo.start();

    const v: FxParams = { ...params };
    let bypassed = false;

    const applyTone = () => {
      const f = 400 * Math.pow(8000 / 400, v.tone);
      toneL.frequency.value = f;
      toneR.frequency.value = f;
    };

    const applyTime = () => {
      const ms = v.sync > 0.5 ? noteToMs(v.division) : v.time;
      const s = Math.max(0.005, Math.min(2.9, ms / 1000));
      dL.delayTime.setTargetAtTime(s, ctx.currentTime, 0.03);
      dR.delayTime.setTargetAtTime(s, ctx.currentTime, 0.03);
    };

    const applyAll = () => {
      fb.gain.value = v.feedback * 0.9;
      modGain.gain.value = v.mod * 0.004;
      applyTone();
      applyTime();
      dw.setMix(v.mix);
    };

    /** 按「乒乓 / 单声道」重排内部连线 */
    const wire = () => {
      dw.input.disconnect();
      dL.disconnect();
      dR.disconnect();
      toneL.disconnect();
      toneR.disconnect();
      fb.disconnect();
      panL.disconnect();
      panR.disconnect();
      dw.input.connect(dw.dry);
      dw.input.connect(dL);
      if (v.pingpong > 0.5) {
        dL.connect(toneL);
        dL.connect(dR);
        dR.connect(toneR);
        toneR.connect(fb);
        fb.connect(dL);
        toneL.connect(panL);
        panL.connect(dw.wet);
        toneR.connect(panR);
        panR.connect(dw.wet);
      } else {
        dL.connect(toneL);
        toneL.connect(fb);
        fb.connect(dL);
        toneL.connect(panL);
        panL.connect(dw.wet);
      }
      if (bypassed) {
        safeDisconnect(dw.input, dw.dry);
        safeDisconnect(dw.input, dw.wet);
        safeDisconnect(dw.input, dL);
        dw.input.connect(dw.output);
      }
    };

    applyAll();
    wire();

    // 节拍变化时刷新同步时间
    let lastTempo = getTempo();
    const timer = setInterval(() => {
      const t = getTempo();
      if (t !== lastTempo) {
        lastTempo = t;
        if (v.sync > 0.5) applyTime();
      }
    }, 200) as unknown as number;

    return {
      input: dw.input,
      output: dw.output,
      setParam(key, value) {
        v[key] = value;
        if (key === 'pingpong') wire();
        else applyAll();
      },
      getParam(key) {
        return v[key];
      },
      setBypassed(b) {
        bypassed = b;
        wire();
      },
      isBypassed: () => bypassed,
      meter: () => Math.min(1, v.mix),
      status: () => (v.sync > 0.5 ? `同步 ${getTempo()} BPM` : formatMs(v.time)),
      dispose() {
        clearInterval(timer);
        try {
          lfo.stop();
        } catch {
          /* noop */
        }
        lfo.disconnect();
        modGain.disconnect();
      },
    };
  },
};
