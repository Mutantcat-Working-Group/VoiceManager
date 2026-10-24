/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 基础 UI 组件 —— 旋钮 / 推子 / 开关 / 分段 / 下拉 / LED / 面板
 * 全部手写 DOM + SVG，无第三方依赖。
 */

import { paramToKnob } from '../audio/fx/util';
import { t } from '../i18n';

/* --------------------------------- 工具 --------------------------------- */

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  attrs?: Attrs,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    }
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      node.setAttribute(k, String(v));
    }
  }
  return node;
}

/* --------------------------------- 旋钮 --------------------------------- */

const KNOB_SWEEP = 270;
const KNOB_START = -135;

let knobDefsInstalled = false;

function installKnobDefs(): void {
  if (knobDefsInstalled) return;
  knobDefsInstalled = true;
  const svg = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true' });
  svg.style.position = 'absolute';
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', {
    id: 'knobBody',
    x1: '0',
    y1: '0',
    x2: '0.35',
    y2: '1',
  });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#6e6455' }));
  grad.appendChild(svgEl('stop', { offset: '38%', 'stop-color': '#39332a' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#100e0b' }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

export interface KnobOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  default?: number;
  format?: (v: number) => string;
  scale?: 'linear' | 'log';
  size?: number;
  bipolar?: boolean;
  onChange?: (v: number) => void;
}

export interface KnobHandle {
  el: HTMLElement;
  setValue(v: number): void;
  getValue(): number;
}

export function createKnob(o: KnobOptions): KnobHandle {
  installKnobDefs();
  const size = o.size ?? 62;
  const scale = o.scale ?? 'linear';
  const format = o.format ?? ((v: number) => v.toFixed(2));
  const fallback = o.default ?? o.min;

  const root = el('div', 'knob', {
    'data-bipolar': o.bipolar ? 'true' : 'false',
    role: 'slider',
    tabindex: '0',
    'aria-label': o.label,
    'aria-valuemin': String(o.min),
    'aria-valuemax': String(o.max),
  });
  root.style.setProperty('--knob-size', `${size}px`);

  const dial = svgEl('svg', { class: 'knob-dial', viewBox: '0 0 100 100' });

  // 刻度
  const ticks = svgEl('g', { class: 'knob-ticks' });
  const tickEls: SVGLineElement[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = ((KNOB_START + (i / 10) * KNOB_SWEEP) * Math.PI) / 180;
    const r1 = 44;
    const r2 = i % 5 === 0 ? 38 : 41;
    const line = svgEl('line', {
      x1: (50 + Math.cos(a) * r1).toFixed(2),
      y1: (50 + Math.sin(a) * r1).toFixed(2),
      x2: (50 + Math.cos(a) * r2).toFixed(2),
      y2: (50 + Math.sin(a) * r2).toFixed(2),
    });
    ticks.appendChild(line);
    tickEls.push(line);
  }

  const arcBg = svgEl('circle', { class: 'knob-arc-bg', cx: 50, cy: 50, r: 34 });
  arcBg.setAttribute('stroke-dasharray', `${((KNOB_SWEEP / 360) * 2 * Math.PI * 34).toFixed(1)} 999`);
  arcBg.setAttribute('transform', `rotate(${KNOB_START + 90} 50 50)`);

  const arc = svgEl('circle', { class: 'knob-arc', cx: 50, cy: 50, r: 34 });
  arc.setAttribute('stroke-dasharray', '0 999');
  arc.setAttribute('transform', `rotate(${KNOB_START + 90} 50 50)`);

  // 滚花
  const knurl = svgEl('g', { class: 'knob-knurl' });
  for (let i = 0; i < 28; i++) {
    const a = ((i / 28) * 360 * Math.PI) / 180;
    knurl.appendChild(
      svgEl('line', {
        x1: (50 + Math.cos(a) * 32).toFixed(2),
        y1: (50 + Math.sin(a) * 32).toFixed(2),
        x2: (50 + Math.cos(a) * 35.5).toFixed(2),
        y2: (50 + Math.sin(a) * 35.5).toFixed(2),
      }),
    );
  }

  const cap = svgEl('circle', { class: 'knob-cap', cx: 50, cy: 50, r: 32 });
  const ring = svgEl('circle', { class: 'knob-ring', cx: 50, cy: 50, r: 26 });
  const pointer = svgEl('line', { class: 'knob-pointer', x1: 50, y1: 22, x2: 50, y2: 33 });
  const hub = svgEl('circle', { class: 'knob-hub', cx: 50, cy: 50, r: 7 });

  dial.appendChild(ticks);
  dial.appendChild(arcBg);
  dial.appendChild(arc);
  dial.appendChild(knurl);
  dial.appendChild(cap);
  dial.appendChild(ring);
  dial.appendChild(pointer);
  dial.appendChild(hub);

  const label = el('div', 'knob-label', { title: o.label });
  label.textContent = o.label;
  const value = el('div', 'knob-value mono');

  root.appendChild(dial);
  root.appendChild(label);
  root.appendChild(value);

  let current = clampStep(o.value);
  const arcLen = (KNOB_SWEEP / 360) * 2 * Math.PI * 34;

  function clampStep(v: number): number {
    const c = Math.min(o.max, Math.max(o.min, v));
    const snapped = Math.round((c - o.min) / o.step) * o.step + o.min;
    return Math.min(o.max, Math.max(o.min, Number(snapped.toFixed(6))));
  }

  function render(): void {
    const t = paramToKnob(current, o.min, o.max, scale);
    const angle = KNOB_START + t * KNOB_SWEEP;
    pointer.setAttribute('transform', `rotate(${angle} 50 50)`);
    arc.setAttribute('stroke-dasharray', `${(t * arcLen).toFixed(1)} 999`);
    const lit = Math.round(t * 10);
    tickEls.forEach((line, i) => {
      if (i <= lit) line.classList.add('on');
      else line.classList.remove('on');
    });
    value.textContent = format(current);
    root.setAttribute('aria-valuenow', current.toFixed(3));
    root.setAttribute('aria-valuetext', format(current));
  }

  let dragging = false;
  let startY = 0;
  let startVal = 0;

  dial.addEventListener('pointerdown', (e) => {
    dragging = true;
    startY = e.clientY;
    startVal = current;
    dial.setPointerCapture(e.pointerId);
    root.dataset.active = 'true';
    e.preventDefault();
  });

  dial.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    const fine = e.shiftKey ? 0.12 : 1;
    const next = startVal + (dy / 170) * (o.max - o.min) * fine;
    const clamped = clampStep(next);
    if (clamped !== current) {
      current = clamped;
      render();
      o.onChange?.(current);
    }
  });

  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    root.dataset.active = 'false';
    try {
      dial.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  dial.addEventListener('pointerup', end);
  dial.addEventListener('pointercancel', end);

  dial.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const fine = e.shiftKey ? 0.2 : 1;
      const next = current + dir * o.step * fine * Math.max(1, (o.max - o.min) / 60);
      current = clampStep(next);
      render();
      o.onChange?.(current);
    },
    { passive: false },
  );

  // 双击复位：整个旋钮区域都可触发（dial 与 root 都挂一份，避免重复触发）
  let lastReset = 0;
  const resetToDefault = () => {
    const now = performance.now();
    if (now - lastReset < 300) return;
    lastReset = now;
    current = clampStep(fallback);
    render();
    o.onChange?.(current);
  };
  dial.addEventListener('dblclick', resetToDefault);
  root.addEventListener('dblclick', resetToDefault);

  root.addEventListener('keydown', (e) => {
    const big = (o.max - o.min) / 10;
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = current + (e.shiftKey ? big : o.step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = current - (e.shiftKey ? big : o.step);
    else if (e.key === 'Home') next = o.min;
    else if (e.key === 'End') next = o.max;
    else if (e.key === 'PageUp') next = current + big;
    else if (e.key === 'PageDown') next = current - big;
    if (next === null) return;
    e.preventDefault();
    current = clampStep(next);
    render();
    o.onChange?.(current);
  });

  render();

  return {
    el: root,
    setValue(v) {
      const c = clampStep(v);
      if (c === current) return;
      current = c;
      render();
    },
    getValue: () => current,
  };
}

/* --------------------------------- 推子 --------------------------------- */

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  bipolar?: boolean;
  onChange?: (v: number) => void;
}

export interface SliderHandle {
  el: HTMLElement;
  setValue(v: number): void;
  getValue(): number;
}

export function createSlider(o: SliderOptions): SliderHandle {
  const format = o.format ?? ((v: number) => v.toFixed(2));
  const root = el('div', 'slider', {
    'data-bipolar': o.bipolar ? 'true' : 'false',
    role: 'slider',
    tabindex: '0',
    'aria-label': o.label,
  });

  const head = el('div', 'slider-head');
  const label = el('span', 'slider-label');
  label.textContent = o.label;
  const value = el('span', 'slider-value mono');
  head.appendChild(label);
  head.appendChild(value);

  const track = el('div', 'slider-track');
  const rail = el('div', 'slider-rail');
  const fill = el('div', 'slider-fill');
  const cap = el('div', 'slider-cap');
  rail.appendChild(fill);
  track.appendChild(rail);
  track.appendChild(cap);

  root.appendChild(head);
  root.appendChild(track);

  let current = Math.min(o.max, Math.max(o.min, o.value));

  const clampStep = (v: number) => {
    const c = Math.min(o.max, Math.max(o.min, v));
    return Number((Math.round((c - o.min) / o.step) * o.step + o.min).toFixed(6));
  };

  function render(): void {
    const t = (current - o.min) / (o.max - o.min || 1);
    fill.style.width = `${t * 100}%`;
    cap.style.left = `${t * 100}%`;
    value.textContent = format(current);
    root.setAttribute('aria-valuenow', current.toFixed(3));
  }

  const setFromClientX = (clientX: number) => {
    const r = track.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
    const next = clampStep(o.min + t * (o.max - o.min));
    if (next !== current) {
      current = next;
      render();
      o.onChange?.(current);
    }
  };

  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
    e.preventDefault();
  });
  track.addEventListener('pointermove', (e) => {
    if (dragging) setFromClientX(e.clientX);
  });
  const end = (e: PointerEvent) => {
    dragging = false;
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);

  root.addEventListener('keydown', (e) => {
    const big = (o.max - o.min) / 10;
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = current + (e.shiftKey ? big : o.step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = current - (e.shiftKey ? big : o.step);
    else if (e.key === 'Home') next = o.min;
    else if (e.key === 'End') next = o.max;
    if (next === null) return;
    e.preventDefault();
    current = clampStep(next);
    render();
    o.onChange?.(current);
  });

  render();

  return {
    el: root,
    setValue(v) {
      const c = clampStep(v);
      if (c === current) return;
      current = c;
      render();
    },
    getValue: () => current,
  };
}

/* --------------------------------- 开关 --------------------------------- */

export interface ToggleOptions {
  label: string;
  checked: boolean;
  hint?: string;
  onChange?: (checked: boolean) => void;
}

export interface ToggleHandle {
  el: HTMLElement;
  setChecked(b: boolean): void;
  getChecked(): boolean;
}

export function createToggle(o: ToggleOptions): ToggleHandle {
  const root = el('button', 'switch', {
    type: 'button',
    role: 'switch',
    'aria-checked': o.checked ? 'true' : 'false',
  });
  const box = el('span', 'switch-box');
  const text = el('span', 'switch-text');
  text.textContent = o.label;
  root.appendChild(box);
  root.appendChild(text);
  if (o.hint) root.title = o.hint;

  let checked = o.checked;
  root.addEventListener('click', () => {
    checked = !checked;
    root.setAttribute('aria-checked', checked ? 'true' : 'false');
    o.onChange?.(checked);
  });

  return {
    el: root,
    setChecked(b) {
      checked = b;
      root.setAttribute('aria-checked', b ? 'true' : 'false');
    },
    getChecked: () => checked,
  };
}

/* ------------------------------- 分段选择器 ------------------------------ */

export interface SegmentedOptions {
  label?: string;
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange?: (v: string | number) => void;
}

export interface SegmentedHandle {
  el: HTMLElement;
  setValue(v: string | number): void;
  getValue(): string | number;
}

export function createSegmented(o: SegmentedOptions): SegmentedHandle {
  const root = el('div', 'segmented', { role: 'group', 'aria-label': o.label ?? t('选项') });
  const buttons: HTMLButtonElement[] = [];
  for (const opt of o.options) {
    const b = el('button', '', { type: 'button', 'aria-pressed': 'false', 'data-value': String(opt.value) });
    b.textContent = opt.label;
    b.addEventListener('click', () => {
      setValue(opt.value);
      o.onChange?.(opt.value);
    });
    buttons.push(b);
    root.appendChild(b);
  }
  let current = o.value;
  function render(): void {
    for (const b of buttons) {
      // 用字符串比对，数值和字符串两种 value 都能正确匹配
      b.setAttribute('aria-pressed', String(b.dataset.value) === String(current) ? 'true' : 'false');
    }
  }
  function setValue(v: string | number): void {
    current = v;
    render();
  }
  render();
  return { el: root, setValue, getValue: () => current };
}

/* --------------------------------- 下拉 --------------------------------- */

/**
 * 选项标签。传字符串就是定值（设备真名这类不该翻译的内容）；
 * 传函数则每次重建都重新求值——切语言时要靠它拿到新译文。
 *
 * 曾经这里只收字符串，调用方在模块加载时算一次 t()，于是选项文字冻在
 * 建界面时的语言上；而 captureStaticText 那套只能救第一跳，一旦
 * setOptions() 重建过就全被冲掉。改成惰性求值，让译文跟着语言走。
 */
export type SelectLabel = string | (() => string);

export interface SelectOptions {
  label?: string;
  options: { value: string; label: SelectLabel }[];
  value: string;
  placeholder?: SelectLabel;
  onChange?: (v: string) => void;
}

export interface SelectHandle {
  el: HTMLElement;
  select: HTMLSelectElement;
  setValue(v: string): void;
  getValue(): string;
  setOptions(options: { value: string; label: SelectLabel }[]): void;
  /** 语言切换后重填，让函数型标签按新语言重算 */
  refresh(): void;
}

export function createSelect(o: SelectOptions): SelectHandle {
  const root = el('label', 'select');
  const select = el('select');
  if (o.label) {
    select.setAttribute('aria-label', o.label);
    root.title = o.label;
  }

  const textOf = (l: SelectLabel): string => (typeof l === 'function' ? l() : l);

  const addPlaceholder = (): void => {
    if (!o.placeholder) return;
    const opt = el('option', '', { value: '' });
    opt.textContent = textOf(o.placeholder);
    select.appendChild(opt);
  };

  const appendOptions = (list: { value: string; label: SelectLabel }[]): void => {
    for (const op of list) {
      const opt = el('option', '', { value: op.value });
      opt.textContent = textOf(op.label);
      select.appendChild(opt);
    }
  };

  // 设备列表这类动态选项一旦设置就接管下拉；否则用构造时的静态选项
  let dynamic: { value: string; label: SelectLabel }[] | null = null;

  const render = (): void => {
    const prev = select.value;
    clear(select);
    addPlaceholder();
    appendOptions(dynamic ?? o.options);
    // 尽量保住当前选中项，别因为重建把用户的选择打掉
    if ([...select.options].some((x) => x.value === prev)) select.value = prev;
  };

  render();
  select.value = o.value;
  select.addEventListener('change', () => o.onChange?.(select.value));
  root.appendChild(select);

  return {
    el: root,
    select,
    setValue(v) {
      select.value = v;
    },
    getValue: () => select.value,
    setOptions(options) {
      dynamic = options;
      const prev = select.value;
      render();
      // 原语义：旧值不在新列表里就落到第一项
      if (![...select.options].some((x) => x.value === prev)) {
        select.value = options[0]?.value ?? '';
      }
    },
    refresh: render,
  };
}

/* ---------------------------------- LED --------------------------------- */

export interface LedHandle {
  el: HTMLElement;
  setOn(on: boolean): void;
}

export function createLed(label?: string, color: 'green' | 'amber' | 'red' | 'blue' = 'green'): LedHandle {
  const root = el('span', 'led-row');
  const dot = el('span', 'led', { 'data-on': 'false', 'data-color': color });
  root.appendChild(dot);
  if (label) {
    const t = el('span', 'led-label');
    t.textContent = label;
    root.appendChild(t);
  }
  return {
    el: root,
    setOn(on) {
      dot.dataset.on = on ? 'true' : 'false';
    },
  };
}

/* --------------------------------- 面板 --------------------------------- */

export interface PanelOptions {
  title: string;
  code?: string;
  actions?: HTMLElement[];
  collapsible?: boolean;
  startCollapsed?: boolean;
}

export interface PanelHandle {
  el: HTMLElement;
  body: HTMLElement;
  setTitle(t: string): void;
  collapse(): void;
  expand(): void;
}

export function createPanel(o: PanelOptions): PanelHandle {
  const root = el('section', 'panel');
  const head = el('header', 'panel-head');
  const title = el('h3', 'panel-title');
  title.textContent = o.title;
  head.appendChild(title);
  if (o.code) {
    const code = el('span', 'panel-code mono');
    code.textContent = o.code;
    head.appendChild(code);
  }
  if (o.actions?.length) {
    const wrap = el('div', 'fx-panel-actions');
    for (const a of o.actions) wrap.appendChild(a);
    head.appendChild(wrap);
  }
  const body = el('div', 'panel-body');
  root.appendChild(head);
  root.appendChild(body);

  if (o.collapsible) {
    const btn = el('button', 'btn btn-icon', { type: 'button', 'aria-label': t('折叠/展开') });
    btn.textContent = o.startCollapsed ? '+' : '−';
    btn.addEventListener('click', () => {
      body.classList.toggle('hidden');
      btn.textContent = body.classList.contains('hidden') ? '+' : '−';
    });
    head.insertBefore(btn, head.firstChild);
    if (o.startCollapsed) body.classList.add('hidden');
  }

  return {
    el: root,
    body,
    setTitle(t) {
      title.textContent = t;
    },
    collapse() {
      body.classList.add('hidden');
    },
    expand() {
      body.classList.remove('hidden');
    },
  };
}

/* ------------------------------- 旁通按钮 ------------------------------- */

export interface StompHandle {
  el: HTMLElement;
  setOn(on: boolean): void;
  getOn(): boolean;
}

/** 单块旁通开关：亮 = 启用，暗 = 旁通 */
export function createStomp(initial: boolean, onChange?: (on: boolean) => void, title = t('旁通')): StompHandle {
  const btn = el('button', 'stomp', {
    type: 'button',
    'aria-pressed': initial ? 'true' : 'false',
    'aria-label': title,
    title,
  });
  let on = initial;
  btn.addEventListener('click', () => {
    on = !on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    onChange?.(on);
  });
  return {
    el: btn,
    setOn(v) {
      on = v;
      btn.setAttribute('aria-pressed', v ? 'true' : 'false');
    },
    getOn: () => on,
  };
}
