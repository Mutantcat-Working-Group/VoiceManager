/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 电平表与频谱 —— VU 表头（带峰值保持）+ 对数频率频谱。
 */

import { el } from './components';

export interface MeterLevels {
  inRms: number;
  inPeak: number;
  outRms: number;
  outPeak: number;
}

const DB_MIN = -54;
const DB_MAX = 3;

function dbToPos(db: number): number {
  const t = (db - DB_MIN) / (DB_MAX - DB_MIN);
  return Math.min(1, Math.max(0, t));
}

function gainToDb(g: number): number {
  return 20 * Math.log10(Math.max(g, 1e-6));
}

interface VuState {
  rms: number;
  peak: number;
  hold: number;
  holdT: number;
  clipT: number;
}

function makeVu(label: string): { el: HTMLElement; update: (rms: number, peak: number) => void } {
  const root = el('div', 'vu');
  const head = el('div', 'vu-head');
  const t = el('span', 'silk');
  t.textContent = label;
  const val = el('span', 'vu-value mono');
  head.appendChild(t);
  head.appendChild(val);
  const scale = el('div', 'vu-scale');
  const fill = el('div', 'vu-fill');
  const peakMark = el('div', 'vu-peak');
  const grid = el('div', 'vu-grid');
  scale.appendChild(fill);
  scale.appendChild(peakMark);
  scale.appendChild(grid);
  const labels = el('div', 'vu-labels');
  for (const l of ['-54', '-36', '-18', '-6', '0', '+3']) {
    const s = el('span');
    s.textContent = l;
    labels.appendChild(s);
  }
  root.appendChild(head);
  root.appendChild(scale);
  root.appendChild(labels);

  const st: VuState = { rms: 0, peak: 0, hold: 0, holdT: 0, clipT: 0 };

  return {
    el: root,
    update(rms, peak) {
      const target = gainToDb(rms);
      const peakDb = gainToDb(peak);
      // 模拟表头惯性：上升快、下降慢
      st.rms = target > st.rms ? st.rms + (target - st.rms) * 0.55 : st.rms + (target - st.rms) * 0.12;
      // 峰值保持：立即跟随，缓慢回落
      if (peak > st.peak) st.peak = peak;
      else st.peak *= 0.86;
      fill.style.width = `${dbToPos(st.rms) * 100}%`;
      peakMark.style.left = `${dbToPos(gainToDb(st.peak)) * 100}%`;
      val.textContent = `${st.rms.toFixed(1)} dB`;

      const now = performance.now();
      if (peakDb > -0.4) st.clipT = now;
      const clipping = now - st.clipT < 900;
      root.classList.toggle('clip', clipping);
    },
  };
}

export function createMeterBank(): { el: HTMLElement; update: (l: MeterLevels) => void } {
  const root = el('div', 'meter-bank');
  const inVu = makeVu('输入 IN');
  const outVu = makeVu('输出 OUT');
  root.appendChild(inVu.el);
  root.appendChild(outVu.el);
  return {
    el: root,
    update(l) {
      inVu.update(l.inRms, l.inPeak);
      outVu.update(l.outRms, l.outPeak);
    },
  };
}

/* -------------------------------- 频谱仪 -------------------------------- */

export function createSpectrum(getAnalyser: () => AnalyserNode | null): {
  el: HTMLElement;
  start(): void;
  stop(): void;
} {
  const wrap = el('div', 'spectrum-wrap');
  const canvas = el('canvas');
  wrap.appendChild(canvas);
  const ctx2d = canvas.getContext('2d');

  let raf = 0;
  let data: Uint8Array<ArrayBuffer> | null = null;

  const resize = () => {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(80, Math.floor(r.width * dpr));
    canvas.height = Math.max(60, Math.floor(r.height * dpr));
  };

  const draw = () => {
    raf = requestAnimationFrame(draw);
    const analyser = getAnalyser();
    if (!ctx2d) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);

    // 网格
    ctx2d.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx2d.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = (h / 5) * i;
      ctx2d.beginPath();
      ctx2d.moveTo(0, y);
      ctx2d.lineTo(w, y);
      ctx2d.stroke();
    }

    if (!analyser) return;
    if (!data || data.length !== analyser.frequencyBinCount) {
      data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    analyser.getByteFrequencyData(data);

    const bins = data.length;
    const nyquist = analyser.context.sampleRate / 2;
    const fMin = 30;
    const fMax = Math.min(18000, nyquist);
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);

    const grad = ctx2d.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(242,169,43,0.95)');
    grad.addColorStop(0.6, 'rgba(255,200,97,0.9)');
    grad.addColorStop(1, 'rgba(255,233,190,0.95)');

    ctx2d.fillStyle = grad;
    const bars = Math.max(24, Math.floor(w / 6));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const f0 = Math.pow(10, logMin + (i / bars) * (logMax - logMin));
      const f1 = Math.pow(10, logMin + ((i + 1) / bars) * (logMax - logMin));
      let b0 = Math.floor((f0 / nyquist) * bins);
      let b1 = Math.ceil((f1 / nyquist) * bins);
      b0 = Math.max(0, Math.min(bins - 1, b0));
      b1 = Math.max(b0 + 1, Math.min(bins, b1));
      let sum = 0;
      for (let b = b0; b < b1; b++) sum += data[b];
      const v = sum / (b1 - b0) / 255;
      const bh = Math.max(1, v * h * 0.94);
      ctx2d.fillRect(i * bw + 0.5, h - bh, bw - 1, bh);
    }
  };

  return {
    el: wrap,
    start() {
      resize();
      if (!raf) raf = requestAnimationFrame(draw);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
