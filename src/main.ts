/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * VoiceManager —— 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * 单页应用入口：状态 -> 音频引擎 -> DOM 视图。
 */

import './styles/index.css';

import { AudioEngine, type DeviceEntry, type InputSourceKind } from './audio/engine';
import { SignalChain, makeBlock } from './audio/chain';
import { FX_CATEGORY_ORDER, allFxSpecs, getFxSpec } from './audio/fx';
import { PA_PRESETS, presetsForMode, type ChainPreset } from './audio/presets';
import { setTempo } from './audio/tempo';
import { testToneModeLabel } from './audio/test-tone';
import { Metronome } from './audio/metronome';
import { Tuner } from './audio/tuner';
import { LoopStation, Recorder, type RecordingItem } from './audio/recorder';
import { createStore } from './state/store';
import { createInitialState } from './state/initial';
import { MODE_LIST, modeBlurb, modeInfo, modeName, type AppState, type FxBlockState, type ModeId } from './types';
import {
  clear,
  createKnob,
  createLed,
  createPanel,
  createSegmented,
  createSelect,
  createSlider,
  createStomp,
  createToggle,
  el,
} from './ui/components';
import { createChainView, FX_DRAG_TYPE, type ChainBlockView } from './ui/chainview';
import { createMeterBank, createSpectrum } from './ui/meters';
import { captureStaticText, retranslateStaticText } from './i18n/dom';
import { LOCALES, getLocale, initI18n, onLocaleChange, setLocale, t, type Locale } from './i18n';
import { fxBlurb, fxCategoryLabel, fxName, fxOptionLabel, fxParamFormat, fxParamLabel, presetBlurb, presetName } from './i18n/fx';

/* ------------------------------------------------------------------ */
/* 状态与引擎                                                          */
/* ------------------------------------------------------------------ */

const store = createStore<AppState>(createInitialState(), 'voicemanager:v2');
const S = () => store.getState();

const engine = new AudioEngine();
const chain = new SignalChain(engine.ctx, engine.chainInput, engine.chainOutput);
const metronome = new Metronome(engine.ctx, engine.clickOut);
const tuner = new Tuner(engine.analyserIn);
const loopStation = new LoopStation(engine.ctx, engine.clickOut);
engine.chainOutput.connect(loopStation.dest);

let chainReady = false;
let recorder: Recorder | null = null;
const recordings: RecordingItem[] = [];

setTempo(S().metronome.bpm);

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const toastHost = el('div', 'toast-host', { 'aria-live': 'polite' });
document.body.appendChild(toastHost);

function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  const t = el('div', 'toast', { 'data-kind': kind });
  t.textContent = msg;
  toastHost.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    setTimeout(() => t.remove(), 320);
  }, kind === 'error' ? 4600 : 2600);
}

const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/* ------------------------------------------------------------------ */
/* 铭牌头                                                              */
/* ------------------------------------------------------------------ */

const LOGO_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="lg" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#c9761b"/><stop offset="1" stop-color="#ffce6a"/>
  </linearGradient></defs>
  <g stroke="#4a4136" stroke-width="1.4"><line x1="8" y1="21" x2="56" y2="21"/><line x1="8" y1="45" x2="56" y2="45"/></g>
  <g fill="url(#lg)">
    <rect x="13" y="35" width="6" height="13" rx="1.5"/><rect x="23" y="25" width="6" height="23" rx="1.5"/>
    <rect x="33" y="29" width="6" height="19" rx="1.5"/><rect x="43" y="19" width="6" height="29" rx="1.5"/>
  </g>
  <circle cx="32" cy="12" r="3.2" fill="#74f59a"/>
</svg>`;

const header = el('header', 'nameplate');

const brand = el('div', 'brand');
const mark = el('div', 'brand-mark');
mark.innerHTML = LOGO_SVG;
const brandText = el('div', 'brand-text');
const brandName = el('div', 'brand-name');
brandName.textContent = 'VOICE MANAGER';
const brandSub = el('div', 'brand-sub');
brandSub.textContent = t('MUTANTCAT · VM-5000 · 浏览器音频工作站');
brandText.appendChild(brandName);
brandText.appendChild(brandSub);
brand.appendChild(mark);
brand.appendChild(brandText);

const powerCluster = el('div', 'power-cluster');
const powerSwitch = el('div', 'power-switch');
const powerBtn = el('button', 'power-btn', {
  type: 'button',
  'aria-pressed': 'false',
  'aria-label': t('电源开关'),
  title: t('开启 / 关闭扩音（空格）'),
});
const powerCap = el('div', 'power-caption');
powerCap.textContent = 'POWER';
powerSwitch.appendChild(powerBtn);
powerSwitch.appendChild(powerCap);
const masterKnob = createKnob({
  label: t('主音量'),
  min: -60,
  max: 0,
  step: 0.5,
  value: S().masterDb,
  default: -6,
  size: 54,
  format: fmtDb,
  onChange: (v) => {
    store.setState((p) => ({ ...p, masterDb: v }));
    engine.setMasterDb(v);
  },
});
powerCluster.appendChild(powerSwitch);
powerCluster.appendChild(masterKnob.el);

const ioCluster = el('div', 'io-cluster');
const kindSelect = createSelect({
  label: t('音源类型'),
  value: S().input.kind,
  options: [
    { value: 'mic', label: () => t('麦克风 / 线路输入') },
    { value: 'tab', label: () => t('标签页 / 系统音频') },
    { value: 'test', label: () => t('内置测试音源') },
  ],
});
const inputDeviceSelect = createSelect({
  label: t('输入设备'),
  value: S().input.deviceId,
  placeholder: () => t('系统默认输入'),
  options: [],
});
const outputDeviceSelect = createSelect({
  label: t('输出设备（耳机线 / USB 声卡）'),
  value: S().outputDeviceId,
  placeholder: () => t('系统默认输出'),
  options: [],
});

const statusStrip = el('div', 'status-strip');
const chipPower = el('span', 'status-chip');
const chipSr = el('span', 'status-chip');
const chipLatency = el('span', 'status-chip');
const chipEngine = el('span', 'status-chip');

function renderStatusStrip(): void {
  const s = S();
  chipPower.innerHTML = '';
  chipPower.append(t('状态 '));
  const b = el('b');
  b.textContent = s.power ? t('运行中') : t('已停止');
  chipPower.append(b);
  chipSr.innerHTML = '';
  chipSr.append(t('采样率 '));
  chipSr.append(el('b', '', {}));
  (chipSr.lastChild as HTMLElement).textContent = `${(engine.sampleRate / 1000).toFixed(1)} kHz`;
  const lat = (engine.ctx.baseLatency ?? 0) * 1000 + (engine.ctx.outputLatency ?? 0) * 1000;
  chipLatency.innerHTML = '';
  chipLatency.append(t('延迟 '));
  chipLatency.append(el('b', '', {}));
  (chipLatency.lastChild as HTMLElement).textContent = lat > 0 ? `${lat.toFixed(1)} ms` : '—';
  chipEngine.innerHTML = '';
  chipEngine.append('Worklet ');
  chipEngine.append(el('b', '', {}));
  (chipEngine.lastChild as HTMLElement).textContent = engine.supported ? t('就绪') : t('不可用');
}

statusStrip.append(chipPower, chipSr, chipLatency, chipEngine);
ioCluster.append(kindSelect.el, inputDeviceSelect.el, outputDeviceSelect.el, statusStrip);

/*
 * 语言选择放在机头铭牌最右侧，与「输入与设备」面板解耦——语言是全局偏好，
 * 不是 I/O 设置，埋在设备面板里既难找也和旁边那些设备选项语义冲突。
 * 用原生 <select>：9 个选项、一次设定后基本不再动，下拉框比一排分段按钮
 * 省下一大条横向空间，窄屏下也不会把机头撑高。
 */
const langSelect = createSelect({
  label: t('语言'),
  value: getLocale(),
  options: LOCALES.map((l) => ({ value: l.id, label: l.native })),
  onChange: (v) => setLocale(v as Locale),
});
const langCluster = el('div', 'lang-cluster');
langCluster.appendChild(langSelect.el);

header.append(brand, powerCluster, ioCluster, langCluster);

/* ------------------------------------------------------------------ */
/* 模式选择                                                            */
/* ------------------------------------------------------------------ */

const modebar = el('nav', 'modebar', { 'aria-label': t('模式选择') });
const modeButtons = new Map<ModeId, HTMLButtonElement>();
for (const m of MODE_LIST) {
  const btn = el('button', 'mode-btn', {
    type: 'button',
    'aria-pressed': 'false',
    'data-mode': m.id,
    title: modeBlurb(m.id),
  });
  const code = el('span', 'mode-code');
  code.textContent = m.code;
  const meta = el('div', 'mode-meta');
  const name = el('div', 'mode-name');
  name.textContent = m.name;
  const blurb = el('div', 'mode-blurb');
  blurb.textContent = modeBlurb(m.id);
  meta.append(name, blurb);
  btn.append(code, meta);
  btn.addEventListener('click', () => switchMode(m.id));
  modeButtons.set(m.id, btn);
  modebar.appendChild(btn);
}

/* ------------------------------------------------------------------ */
/* 信号链                                                              */
/* ------------------------------------------------------------------ */

const chainbar = el('section', 'chainbar');
const chainHead = el('div', 'chainbar-head');
const chainTitle = el('div');
chainTitle.append(el('span', 'silk'));
(chainTitle.firstChild as HTMLElement).textContent = t('信号链路 / SIGNAL PATH');
const chainHint = el('span', 'panel-hint');
chainHint.textContent = t('点击模块编辑参数 · 点灯或右键切换旁通');
const chainSwipe = el('span', 'panel-hint chain-swipe');
chainSwipe.textContent = t('← 左右滑动查看整条链 →');
chainHead.append(chainTitle, chainHint, chainSwipe);
const chainView = createChainView({
  onSelect: (uid) => selectBlock(uid),
  onToggleBypass: (uid) => toggleBypass(uid),
  onAdd: () => toggleLibrary(true),
  onReorder: (fromUid, toUid, before) => reorderBlock(fromUid, toUid, before),
  onMove: (uid, dir) => moveBlock(uid, dir),
  onInsertFx: (fxId, index) => insertBlock(fxId, index),
});
chainbar.append(chainHead, chainView.el);

/* ------------------------------------------------------------------ */
/* 工作区                                                              */
/* ------------------------------------------------------------------ */

const workarea = el('div', 'workarea');

const hero = el('section', 'mode-hero');
const heroTitle = el('div', 'mode-hero-title');
const heroH2 = el('h2');
const heroCode = el('span', 'mono');
heroTitle.append(heroH2, heroCode);
const heroP = el('p');
hero.append(heroTitle, heroP);

/* 效果器参数面板 */
const fxActions = el('div', 'fx-panel-actions');
const bypassBtn = createStomp(false, (on) => {
  const uid = selectedUid();
  if (!uid) return;
  toggleBypass(uid, on);
}, t('旁通该效果器'));
const moveUpBtn = el('button', 'btn btn-icon', { type: 'button', title: t('上移') });
moveUpBtn.textContent = '↑';
const moveDownBtn = el('button', 'btn btn-icon', { type: 'button', title: t('下移') });
moveDownBtn.textContent = '↓';
const dupBtn = el('button', 'btn btn-icon', { type: 'button', title: t('复制该效果器') });
dupBtn.textContent = '⧉';
const delBtn = el('button', 'btn btn-icon', { type: 'button', title: t('移除该效果器') });
delBtn.textContent = '✕';
const resetBtn = el('button', 'btn', { type: 'button', title: t('恢复该效果器默认参数') });
resetBtn.textContent = t('重置');
fxActions.append(bypassBtn.el, moveUpBtn, moveDownBtn, dupBtn, delBtn, resetBtn);

/* 电平 + 频谱：紧跟信号链路，监测当前这条链的输入输出 */
const meterPanel = createPanel({ title: t('电平 / 频谱'), code: 'MTR' });
const meterBank = createMeterBank();
const spectrum = createSpectrum(() => engine.analyserOut);
meterPanel.body.append(meterBank.el, spectrum.el);
workarea.append(hero, meterPanel.el);

const fxPanel = createPanel({ title: t('效果器'), code: 'FX', actions: [fxActions] });
workarea.appendChild(fxPanel.el);

/* 预设：与信号链路相邻，改完参数就能整组试听 */
const presetPanel = createPanel({ title: t('预设'), code: 'PRE' });
const presetGrid = el('div', 'preset-grid');
presetPanel.body.appendChild(presetGrid);
const presetHint = el('p', 'panel-hint');
presetHint.style.marginTop = '8px';
presetPanel.body.appendChild(presetHint);
workarea.appendChild(presetPanel.el);

/* 效果器仓库 */
const library = createPanel({ title: t('效果器仓库'), code: 'LIB', collapsible: true, startCollapsed: false });
const libBody = library.body;
/** 插入位置：链尾 / 所选模块前 / 所选模块后 */
type InsertPos = 'tail' | 'before' | 'after';
let insertPos: InsertPos = 'after';

/* 插入位置选择：点仓库里的效果器时插到哪儿 */
const insertSeg = createSegmented({
  label: t('插入位置'),
  options: [
    { value: 'after', label: t('所选后') },
    { value: 'before', label: t('所选前') },
    { value: 'tail', label: t('队尾') },
  ],
  value: insertPos,
  onChange: (v) => {
    insertPos = v as InsertPos;
    renderInsertHint();
  },
});
const insertHint = el('p', 'panel-hint insert-hint');
function renderInsertHint(): void {
  const sel = selectedBlock();
  if (insertPos === 'tail' || !sel) {
    insertHint.textContent = t('点击效果器即加到队尾；也可以直接把效果器拖到链上任意间隙插入。');
  } else {
    const spec = getFxSpec(sel.id);
    insertHint.textContent = t('将插入到「{n0}」{n1}；也可以直接把效果器拖到链上任意间隙插入。', { n0: spec ? fxName(spec) : sel.id, n1: t(insertPos === 'before' ? '之前' : '之后') });
  }
}
renderInsertHint();
const libGroups = el('div', 'fx-library');
for (const cat of FX_CATEGORY_ORDER) {
  const specs = allFxSpecs().filter((s) => s.category === cat);
  if (!specs.length) continue;
  const group = el('div', 'fx-lib-group');
  const label = el('div', 'fx-row-label');
  label.textContent = fxCategoryLabel(cat);
  const items = el('div', 'fx-lib-items');
  for (const spec of specs) {
    const chip = el('button', 'fx-chip', { type: 'button', title: fxBlurb(spec) });
    const mono = el('span', 'mono');
    mono.textContent = spec.code;
    const name = el('span');
    name.textContent = fxName(spec);
    chip.append(mono, name);
    chip.addEventListener('click', () => addBlock(spec.id));
    /* 拖到链上任意位置插入，不必只能加到队尾 */
    chip.draggable = true;
    chip.addEventListener('dragstart', (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(FX_DRAG_TYPE, spec.id);
      }
    });
    items.appendChild(chip);
  }
  group.append(label, items);
  libGroups.appendChild(group);
}
libBody.append(insertSeg.el, insertHint, libGroups);
workarea.appendChild(library.el);

/* ------------------------------------------------------------------ */
/* 侧栏                                                                */
/* ------------------------------------------------------------------ */

const sidebar = el('aside', 'sidebar', { 'aria-label': t('工具面板') });

/* 调音器 */
const tunerPanel = createPanel({ title: t('调音器'), code: 'TUNE' });
const tunerWrap = el('div', 'tuner');
const tunerNote = el('div', 'tuner-note', { 'data-state': 'idle' });
tunerNote.textContent = '—';
const tunerFreq = el('div', 'tuner-freq mono');
tunerFreq.textContent = '0.0 Hz';
const tunerNeedle = el('div', 'tuner-needle');
const needleTrack = el('div', 'tuner-needle-track');
const needleCenter = el('div', 'tuner-needle-center');
const needleMark = el('div', 'tuner-needle-mark');
tunerNeedle.append(needleTrack, needleCenter, needleMark);
const tunerCents = el('div', 'tuner-cents mono');
tunerCents.textContent = t('等待信号…');
const tunerRef = createKnob({
  label: t('A4 基准'),
  min: 415,
  max: 466,
  step: 0.5,
  value: S().tunerReference,
  default: 440,
  size: 50,
  format: (v) => `${v.toFixed(1)} Hz`,
  onChange: (v) => {
    store.setState((p) => ({ ...p, tunerReference: v }));
    tuner.setReference(v);
  },
});
const tunerToggle = createToggle({
  label: t('启用调音器'),
  checked: true,
  onChange: () => undefined,
});
tunerWrap.append(tunerNote, tunerFreq, tunerNeedle, tunerCents, tunerRef.el, tunerToggle.el);
tunerPanel.body.appendChild(tunerWrap);
sidebar.appendChild(tunerPanel.el);

/* 节拍器 */
const metroPanel = createPanel({ title: t('节拍器'), code: 'MET' });
const metroBody = el('div');
metroBody.style.display = 'flex';
metroBody.style.flexDirection = 'column';
metroBody.style.gap = '12px';
const metroBtn = el('button', 'btn', { type: 'button', 'data-variant': 'primary' });
metroBtn.textContent = t('启动节拍器');
const metroBeat = createLed(t('拍'), 'amber');
const metroKnobs = el('div', 'knob-grid');
const bpmKnob = createKnob({
  label: t('速度 BPM'),
  min: 40,
  max: 220,
  step: 1,
  value: S().metronome.bpm,
  default: 96,
  format: (v) => `${Math.round(v)}`,
  onChange: (v) => {
    store.setState((p) => ({ ...p, metronome: { ...p.metronome, bpm: v } }));
    metronome.bpm = v;
    setTempo(v);
  },
});
const beatsKnob = createKnob({
  label: t('拍号'),
  min: 1,
  max: 12,
  step: 1,
  value: S().metronome.beats,
  default: 4,
  format: (v) => `${Math.round(v)}/4`,
  onChange: (v) => {
    store.setState((p) => ({ ...p, metronome: { ...p.metronome, beats: v } }));
    metronome.beats = v;
  },
});
const metroVol = createKnob({
  label: t('音量'),
  min: 0,
  max: 1,
  step: 0.01,
  value: S().metronome.volume,
  default: 0.6,
  format: fmtPct,
  onChange: (v) => {
    store.setState((p) => ({ ...p, metronome: { ...p.metronome, volume: v } }));
    metronome.volume = v;
  },
});
metroKnobs.append(bpmKnob.el, beatsKnob.el, metroVol.el);
const metroRow = el('div');
metroRow.style.display = 'flex';
metroRow.style.alignItems = 'center';
metroRow.style.gap = '10px';
metroRow.append(metroBtn, metroBeat.el);
metroBody.append(metroKnobs, metroRow);
metroPanel.body.appendChild(metroBody);
sidebar.appendChild(metroPanel.el);

/* 循环录音 */
const loopPanel = createPanel({ title: t('循环录音'), code: 'LOOP' });
const loopBody = el('div');
loopBody.style.display = 'flex';
loopBody.style.flexDirection = 'column';
loopBody.style.gap = '10px';
const loopHint = el('p', 'panel-hint');
loopHint.textContent = t('按设定的小节数录一层，自动无缝循环；可多次叠加。');
const loopRow = el('div');
loopRow.style.display = 'flex';
loopRow.style.gap = '8px';
loopRow.style.flexWrap = 'wrap';
const loopBars = createSelect({
  label: t('循环长度'),
  value: '4',
  // 带占位符的文案必须用函数：captureStaticText 存的是插值后的「4 小节」，
  // 那不是词典键，重译时查不到，所以只能靠这里按当前语言重新求值
  options: [1, 2, 4, 8, 16].map((n) => ({ value: String(n), label: () => t('{n0} 小节', { n0: n }) })),
});
const loopArmBtn = el('button', 'btn', { type: 'button', 'data-variant': 'primary' });
loopArmBtn.textContent = t('开始循环录音');
const loopStopBtn = el('button', 'btn', { type: 'button' });
loopStopBtn.textContent = t('停止并循环');
loopStopBtn.disabled = true;
const loopClearBtn = el('button', 'btn', { type: 'button' });
loopClearBtn.textContent = t('清空');
loopClearBtn.disabled = true;
const loopStatus = el('div', 'rec-status');
const loopDot = el('span', 'rec-dot', { 'data-rec': 'false' });
const loopText = el('span');
loopText.textContent = t('未录制');
loopStatus.append(loopDot, loopText);
const loopList = el('div', 'rec-list');
loopRow.append(loopArmBtn, loopStopBtn, loopClearBtn);
loopBody.append(loopHint, loopBars.el, loopRow, loopStatus, loopList);
loopPanel.body.appendChild(loopBody);
sidebar.appendChild(loopPanel.el);

/* 录音机 */
const recPanel = createPanel({ title: t('录音机'), code: 'REC' });
const recBody = el('div', 'recorder');
const recControls = el('div', 'rec-controls');
const recBtn = el('button', 'btn', { type: 'button', 'data-variant': 'primary' });
recBtn.textContent = t('开始录音');
const recPlayBtn = el('button', 'btn', { type: 'button' });
recPlayBtn.textContent = t('播放');
recPlayBtn.disabled = true;
const recClearBtn = el('button', 'btn', { type: 'button' });
recClearBtn.textContent = t('清空列表');
recClearBtn.disabled = true;
recControls.append(recBtn, recPlayBtn, recClearBtn);
const recStatus = el('div', 'rec-status');
const recDot = el('span', 'rec-dot', { 'data-rec': 'false' });
const recTime = el('span', 'mono');
recTime.textContent = '00:00';
recStatus.append(recDot, recTime);
const recList = el('div', 'rec-list');
const recEmpty = el('div', 'empty-note');
recEmpty.textContent = t('暂无录音文件');
recList.appendChild(recEmpty);
recBody.append(recControls, recStatus, recList);
recPanel.body.appendChild(recBody);
sidebar.appendChild(recPanel.el);

/* 输入与设备 */
const ioPanel = createPanel({ title: t('输入与设备'), code: 'I/O', collapsible: true });
const ioBody = el('div');
ioBody.style.display = 'flex';
ioBody.style.flexDirection = 'column';
ioBody.style.gap = '12px';

const trimKnob = createKnob({
  label: t('输入微调'),
  min: -20,
  max: 20,
  step: 0.5,
  value: S().input.trimDb,
  default: 0,
  size: 52,
  format: fmtDb,
  onChange: (v) => {
    store.setState((p) => ({ ...p, input: { ...p.input, trimDb: v } }));
    engine.setTrimDb(v);
  },
});
const togglesWrap = el('div');
togglesWrap.style.display = 'flex';
togglesWrap.style.flexDirection = 'column';
togglesWrap.style.gap = '8px';
// 采集约束只在 getUserMedia 那一刻生效，改完必须重取流
async function reacquireInput(): Promise<void> {
  const s = S();
  if (!s.power || s.input.kind !== 'mic') return;
  try {
    await engine.setInput({
      kind: 'mic',
      deviceId: s.input.deviceId,
      echoCancellation: s.input.echoCancellation,
      noiseSuppression: s.input.noiseSuppression,
      autoGainControl: s.input.autoGainControl,
    });
  } catch (err) {
    toast(t('重新获取麦克风失败：{n0}', { n0: err instanceof Error ? err.message : String(err) }), 'error');
  }
}
const ecToggle = createToggle({
  label: t('回声消除（用扬声器放音时务必开启）'),
  checked: S().input.echoCancellation,
  onChange: (c) => {
    store.setState((p) => ({ ...p, input: { ...p.input, echoCancellation: c } }));
    renderFeedbackWarning();
    renderProfileHint();
    void reacquireInput();
  },
});
const nsToggle = createToggle({
  label: t('浏览器降噪（人声建议开启）'),
  checked: S().input.noiseSuppression,
  onChange: (c) => {
    store.setState((p) => ({ ...p, input: { ...p.input, noiseSuppression: c } }));
    renderProfileHint();
    void reacquireInput();
  },
});
const agcToggle = createToggle({
  label: t('自动增益控制（建议关闭，会放大啸叫）'),
  checked: S().input.autoGainControl,
  onChange: (c) => {
    store.setState((p) => ({ ...p, input: { ...p.input, autoGainControl: c } }));
    renderProfileHint();
    void reacquireInput();
  },
});
togglesWrap.append(ecToggle.el, nsToggle.el, agcToggle.el);

/*
 * 采集约束预设（借鉴 GuitarStack：它为了最纯的吉他音质把 goog* 系列全关）。
 * 两种取舍都合理——用扬声器放音必须开回声消除，戴耳机弹吉他则希望信号最干净。
 */
const INPUT_PROFILES = [
  {
    id: 'antifeedback',
    label: t('防啸叫优先'),
    title: t('开回声消除 + 浏览器降噪，关自动增益。用扬声器放音时用这个'),
    constraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  },
  {
    id: 'quality',
    label: t('音质优先'),
    title: t('全部关闭，拿最原始的输入信号。戴耳机弹吉他 / 贝斯时用这个'),
    constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  },
] as const;

const profileSeg = createSegmented({
  label: t('采集处理预设'),
  options: INPUT_PROFILES.map((p) => ({ value: p.id, label: t(p.label) })),
  value: 'antifeedback',
  onChange: (id) => {
    const prof = INPUT_PROFILES.find((p) => p.id === id);
    if (!prof) return;
    store.setState((p) => ({ ...p, input: { ...p.input, ...prof.constraints } }));
    ecToggle.setChecked(prof.constraints.echoCancellation);
    nsToggle.setChecked(prof.constraints.noiseSuppression);
    agcToggle.setChecked(prof.constraints.autoGainControl);
    renderFeedbackWarning();
    renderProfileHint();
    void reacquireInput();
    toast(t('采集处理已切换为「{n0}」', { n0: t(prof.label) }), 'info');
  },
});
profileSeg.el.title = t('切换浏览器对麦克风的处理程度');
const profileHint = el('p', 'panel-hint profile-hint');
function renderProfileHint(): void {
  const s = S().input;
  const hit = INPUT_PROFILES.find(
    (p) =>
      p.constraints.echoCancellation === s.echoCancellation &&
      p.constraints.noiseSuppression === s.noiseSuppression &&
      p.constraints.autoGainControl === s.autoGainControl,
  );
  profileSeg.setValue(hit?.id ?? '');
  profileHint.textContent = hit ? hit.title : t('当前是自定义组合：上面三个开关可以单独调。');
}
renderProfileHint();

/* 反馈抑制：关掉时给一句明确警示 */
const fbWarn = el('p', 'panel-hint fb-warning');
fbWarn.setAttribute('role', 'status');
function renderFeedbackWarning(): void {
  renderEchoShield(); // 回声消除一变，防护结论就变了
  const ec = S().input.echoCancellation;
  fbWarn.textContent = ec
    ? ''
    : t('⚠ 回声消除已关闭：若用扬声器放音，麦克风会拾取音箱输出，形成越拖越长的回声或啸叫。请改用耳机，或重新打开「回声消除」。');
  fbWarn.hidden = !ec ? false : true;
}
const testRow = el('div');
testRow.style.display = 'flex';
testRow.style.flexDirection = 'column';
testRow.style.gap = '8px';
const testModeSeg = createSegmented({
  label: t('测试音源'),
  value: S().input.testMode,
  options: [0, 1, 2, 3, 4].map((v) => ({ value: v, label: testToneModeLabel(v) })),
  onChange: (v) => {
    const mode = Number(v);
    store.setState((p) => ({ ...p, input: { ...p.input, testMode: mode } }));
    engine.testTone.setMode(mode);
  },
});
const testLevel = createSlider({
  label: t('测试音源电平'),
  min: 0,
  max: 1,
  step: 0.01,
  value: S().input.testLevel,
  format: fmtPct,
  onChange: (v) => {
    store.setState((p) => ({ ...p, input: { ...p.input, testLevel: v } }));
    engine.testTone.setLevel(v);
  },
});
testRow.append(testModeSeg.el, testLevel.el);
const ioHint = el('p', 'panel-hint');
ioHint.textContent =
  t('耳机线 / USB 声卡：在「输出设备」里选择对应接口即可。若列表中没有，请在系统声音设置里确认设备已被识别。追求最低延迟时，建议在 USB 声卡上做硬件直连监听。');

/* 设备列表状态：签名用于比对是否真的变了，masked 表示名称被浏览器抹掉 */
let deviceSig = '';
let deviceMasked = false;
let devicePoll: number | null = null;
const DEVICE_POLL_MS = 2500;

/* 设备授权提示：未授权麦克风时 enumerateDevices 会抹掉名称，只能看到「输入设备 1/2/3」 */
const deviceHint = el('div', 'device-hint');
const deviceHintText = el('p', 'panel-hint');
const deviceHintBtn = el('button', 'btn btn-sm', { type: 'button' });
deviceHintBtn.textContent = t('授权并刷新设备列表');
deviceHintBtn.addEventListener('click', () => void unlockDeviceLabels());
deviceHint.append(deviceHintText, deviceHintBtn);

function renderDeviceHint(): void {
  const show = deviceMasked;
  deviceHint.classList.toggle('hidden', !show);
  deviceHintText.textContent = show
    ? t('浏览器在授权麦克风前不会透露设备名称，列表里因此只有「输入设备 1/2/3」。点右侧按钮授权一次即可显示真实名称，之后打开网页会自动带上名称。')
    : '';
}

renderDeviceHint();
const fbToggle = createToggle({
  label: t('反馈抑制（自动凿掉啸叫频率）'),
  checked: S().feedbackGuard,
  onChange: (c) => {
    store.setState((p) => ({ ...p, feedbackGuard: c }));
    if (c) {
      engine.feedbackGuard.start();
      engine.feedbackGuard.setAnalysisEnabled(S().input.kind === 'mic');
    } else {
      engine.feedbackGuard.stop();
    }
    renderGuardStatus(engine.feedbackGuardState);
  },
});
const guardStatus = el('p', 'panel-hint guard-status');
guardStatus.setAttribute('role', 'status');
function renderGuardStatus(st: { count: number; freqs: number[] }): void {
  if (!S().feedbackGuard) {
    guardStatus.textContent = t('已停用');
  } else if (st.count === 0) {
    guardStatus.textContent = t('监测中 · 暂无啸叫频率');
  } else {
    guardStatus.textContent = t('已压制 {n0} 个频率：{n1}', { n0: st.count, n1: st.freqs
      .map((f) => `${(f / 1000).toFixed(2)} kHz`)
      .join(' / ') });
  }
  renderEchoShield();
}
/* ----------------------------- 回声防护自检 ----------------------------- */
/*
 * 三层防护各自独立生效，任何一层配错，回声就会回来。之前的问题是用户把
 * 噪声门阈值拖到 0 dB（门永远开着），却没有任何提示。这里把三层合成一张
 * 检查表：哪层配错就直接说原因，并给一键修复。
 */

const GATE_SAFE_DB = -45; // 人声/乐器安全阈值
const GATE_WARN_DB = -30; // 高于此值门基本关不上，挡不住回声回路
const WET_WARN = 0.4; // 混响/延迟湿声上限

const echoShield = el('div', 'echo-shield');
const shieldHead = el('div', 'echo-shield-head');
shieldHead.textContent = t('回声防护');
const shieldList = el('ul', 'echo-shield-list');
const shieldNote = el('p', 'echo-shield-note');
echoShield.append(shieldHead, shieldList, shieldNote);

function chainBlock(id: string) {
  return S().modes[S().mode].blocks.find((b) => b.id === id);
}

function shieldRow(ok: boolean, label: string, fix?: () => void): void {
  const li = el('li', 'echo-shield-row', { 'data-ok': ok ? 'true' : 'false' });
  const dot = el('span', 'echo-shield-dot');
  const text = el('span', 'echo-shield-text');
  text.textContent = label;
  li.append(dot, text);
  if (fix) {
    const btn = el('button', 'btn btn-xs', { type: 'button' });
    btn.textContent = t('修复');
    btn.addEventListener('click', fix);
    li.append(btn);
  }
  shieldList.appendChild(li);
}

function renderEchoShield(): void {
  const s = S();
  clear(shieldList);
  clear(shieldNote);

  shieldRow(s.input.echoCancellation, s.input.echoCancellation ? t('浏览器回声消除 · 已开启') : t('浏览器回声消除 · 已关闭（用扬声器放音会拾回自己的声音）'));
  shieldRow(s.feedbackGuard, s.feedbackGuard ? t('反馈抑制 · {n0}', { n0: guardStatus.textContent }) : t('反馈抑制 · 已关闭（窄带啸叫不会自动被凿掉）'));

  const gate = chainBlock('noise-gate');
  if (gate) {
    const th = gate.params.threshold as number;
    if (gate.bypassed) {
      shieldRow(false, t('噪声门 · 已旁通（没有东西能切断持续回声）'), () => toggleBypass(gate.uid));
    } else if (th > GATE_WARN_DB) {
      shieldRow(
        false,
        t('噪声门 · 阈值 {n0} dB 太高，门几乎不会关闭，挡不住回声', { n0: th.toFixed(0) }),
        () => {
          setBlockParam(gate.uid, 'threshold', GATE_SAFE_DB);
          renderFxPanel();
          toast(t('噪声门阈值已设为 {n0} dB', { n0: GATE_SAFE_DB }), 'info');
        },
      );
    } else {
      shieldRow(true, t('噪声门 · 阈值 {n0} dB，就绪', { n0: th.toFixed(0) }));
    }
  }

  // 湿声提示：混响/延迟的尾巴会被扬声器→麦克风拾回，越拖越长
  const wetNotes: string[] = [];
  for (const id of ['reverb', 'delay'] as const) {
    const b = chainBlock(id);
    if (!b || b.bypassed) continue;
    const wet = b.params.wet as number;
    if (wet > WET_WARN) {
      wetNotes.push(t('{n0} 湿声 {n1}%', { n0: (() => { const sp = getFxSpec(id); return sp ? fxName(sp) : id; })(), n1: Math.round(wet * 100) }));
    }
  }
  if (wetNotes.length > 0) {
    shieldNote.textContent = t('⚠ {n0}：湿声会被扬声器→麦克风拾回，形成越拖越长的回声。建议降到 40% 以下，或改用耳机。', { n0: wetNotes.join('、') });
  }
}

ioBody.append(
  trimKnob.el,
  deviceHint,
  echoShield,
  profileSeg.el,
  profileHint,
  togglesWrap,
  fbWarn,
  fbToggle.el,
  guardStatus,
  testRow,
  ioHint,
);
engine.onFeedbackGuard = (st) => renderGuardStatus(st);
renderGuardStatus(engine.feedbackGuardState);
renderFeedbackWarning();
ioPanel.body.appendChild(ioBody);
sidebar.appendChild(ioPanel.el);

/* 使用说明 */
const helpPanel = createPanel({ title: t('使用说明'), code: 'HELP', collapsible: true, startCollapsed: true });
/** 键帽标签；文案走 t()，切语言后一起变 */
const kbd = (key: string): string => `<span class="kbd">${t(key)}</span>`;

/** 帮助面板内容——按当前语言重绘。
 *  内联标签（<b>、键帽）用 {b} {/b} {k1} 占位，译文可以按各自语序摆放。 */
function renderHelp(): string {
  return `
  <div>
    <h4>${t('快速开始')}</h4>
    <ol>
      <li>${t('点击左上角 {b}电源{/b} 开启，浏览器会请求麦克风权限，请选择「允许」。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('在「音源类型」里选择麦克风 / 标签页音频 / 内置测试音源。')}</li>
      <li>${t('选择「输出设备」为耳机线或 USB 声卡，戴上耳机监听。')}</li>
      <li>${t('点击信号链里的模块编辑参数，点灯或右键可旁通该模块。')}</li>
      <li>${t('界面语言：机头铭牌最右侧的下拉框可以切换 9 种语言，首次打开会按浏览器语言自动选择。')}</li>
      <li>${t('也可以{b}直接拖着模块在链上换位置{/b}——比如把混响拖到音箱前面，松手即生效。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('{b}插到中间{/b}：从「效果器仓库」里把效果器直接拖到链上任意间隙，落点有竖线提示；或者用仓库顶部的「插入位置」（所选前 / 所选后 / 队尾）再点效果器。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('旁通：点模块上的小绿灯、右键、或{b}长按模块{/b}（手机上用长按，因为没法右键）。', { b: '<b>', '/b': '</b>' })}</li>
    </ol>
  </div>
  <div>
    <h4>${t('关于啸叫与回声')}</h4>
    <p>${t('扬声器放出的声音被麦克风拾回、再放大输出，就会形成越拖越长的回声，最终变成啸叫。三层防护：')}</p>
    <ul>
      <li>${t('{b}戴耳机{/b}——最彻底，声音根本不回到麦克风。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('{b}开启「回声消除」{/b}——浏览器用扬声器信号做参考，从麦克风里减掉它，效果最好。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('{b}开启「反馈抑制」{/b}——持续监测输入频谱，发现又窄又亮又持续的单峰就自动在该频率凿一道浅凹槽；频率消失约 2 秒后凹槽自动恢复，不会在音色上留疤痕。面板里能看到当前压制了哪些频率。', { b: '<b>', '/b': '</b>' })}</li>
    </ul>
    <p>${t('另外建议关闭「自动增益控制」：它会把安静的反馈残余一起放大，更容易起振。')}</p>
    <p>${t('{b}「输入与设备」面板顶部的「回声防护」检查表会实时盯着这三层。{/b}任何一层配错都会标红并说清原因，多数情况旁边就有「修复」按钮。最常见的两种配错：噪声门阈值被拖到 0 dB 以上（门永远开着，什么都挡不住），以及混响 / 延迟湿声开得太大（湿声被扬声器→麦克风拾回，越拖越长）。', { b: '<b>', '/b': '</b>' })}</p>
  </div>
  <div>
    <h4>${t('关于噪声门')}</h4>
    <p>${t('噪声门是整条链的第一级：当输入低于「阈值」时按「衰减深度」压低，信号回来时按「开启」时间平滑放开，「保持」可以避免音符之间的正常停顿被误切。吉他 / 贝斯建议阈值 -45 dB 左右，人声可到 -50 dB。')}</p>
  </div>
  <div>
    <h4>${t('手机 / 平板')}</h4>
    <ul>
      <li>${t('窄屏下三个设备下拉会自动排成两列；所有可点区域都做到了 44 px 以上。')}</li>
      <li>${t('效果器的排序：桌面端直接拖着盒子在链上换位置；触摸端 HTML5 拖放不生效，改用盒子上的 {b}▲ / ▼{/b} 按钮（仅在触摸或窄屏下显示）。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('插到链中间：从仓库把效果器拖到链上任意间隙；或先用仓库顶部的「插入位置」选好，再点效果器。')}</li>
      <li>${t('旁通模块：点小绿灯，或{b}长按模块 0.5 秒{/b}（手机上用长按代替右键）。', { b: '<b>', '/b': '</b>' })}</li>
      <li>${t('链很长时左右滑动查看，头部有「← 左右滑动查看整条链 →」提示。')}</li>
      <li>${t('旋钮 / 推子用指针事件，触摸拖动顺滑，且不会连带滚动页面。')}</li>
    </ul>
    <h4>${t('键盘快捷键')}</h4>
    <ul>
      <li>${t('{k1} 电源开关　{k2}{k3}{k4}{k5} 切换模式', { k1: kbd('空格'), k2: kbd('1'), k3: kbd('2'), k4: kbd('3'), k5: kbd('4') })}</li>
      <li>${t('{k1} 节拍器　{k2} 录音　{k3} 旁通当前模块', { k1: kbd('M'), k2: kbd('R'), k3: kbd('B') })}</li>
      <li>${t('旋钮：上下拖动调节，{k1} 微调，滚轮微调，双击复位', { k1: kbd('Shift') })}</li>
    </ul>
  </div>
  <div>
    <h4>${t('注意事项')}</h4>
    <ul>
      <li>${t('戴耳机使用，避免麦克风正对扬声器产生啸叫。')}</li>
      <li>${t('录音文件保存在浏览器内存中，刷新页面后会清空。')}</li>
      <li>${t('所有参数与预设自动保存在本地 localStorage。')}</li>
    </ul>
  </div>
`;
}

const helpBody = el('div', 'help-body');
helpBody.innerHTML = renderHelp();
helpPanel.body.appendChild(helpBody);
sidebar.appendChild(helpPanel.el);

const deckMain = el('div', 'deck-main');
deckMain.append(workarea, sidebar);

const statusbar = el('footer', 'statusbar');
const sbMode = el('span');
const sbChain = el('span');
const sbPreset = el('span');
const sbHint = el('span');
statusbar.append(sbMode, sbChain, sbPreset, sbHint);

const rack = el('div', 'rack');
rack.append(header, modebar, chainbar, deckMain, statusbar);

const appRoot = document.querySelector<HTMLElement>('#app');
if (appRoot) appRoot.appendChild(rack);
else document.body.appendChild(rack);

/*
 * 界面挂到文档后，抓一份静态文案原文（title / aria-label / 叶子节点的 textContent）。
 * 这些文案是模块加载时赋值一次的，不在任何 render 函数里，切语言时靠这份原文重译。
 * 必须在挂载之后抓，否则 document 里还找不到这些节点。
 */
captureStaticText();

/**
 * 把界面整体切到当前语言。
 *
 * 除了手动切语言，启动时也要跑一次：界面是模块加载时建的，那会儿用的还是
 * 默认语言（简体中文），而 boot() 里的 initI18n() 会按浏览器语言改掉当前
 * 语言。只靠 onLocaleChange 的话，首次探测到外语的用户会看到「html lang 是
 * en、界面却是中文、语言下拉框还停在简体中文」这种半吊子状态。
 */
function applyLocale(): void {
  retranslateStaticText();
  helpBody.innerHTML = renderHelp(); // 帮助面板是整块 innerHTML，单独重绘
  renderAll();
  // 下拉框的选中项要跟上当前语言，否则显示的和实际语言不一致
  langSelect.setValue(getLocale());
  // 选项文字是惰性求值的，重建一次才能换成新语言的译文
  kindSelect.refresh();
  inputDeviceSelect.refresh();
  outputDeviceSelect.refresh();
  loopBars.refresh();
}

onLocaleChange(applyLocale);

/* ------------------------------------------------------------------ */
/* 渲染逻辑                                                            */
/* ------------------------------------------------------------------ */

function currentMode(): ModeId {
  return S().mode;
}

function modeState() {
  return S().modes[currentMode()];
}

function selectedUid(): string | null {
  return modeState().selectedUid;
}

function selectedBlock(): FxBlockState | undefined {
  const uid = selectedUid();
  const blocks = modeState().blocks;
  return blocks.find((b) => b.uid === uid) ?? blocks[0];
}

function updateModeButtons(): void {
  for (const [id, btn] of modeButtons) {
    btn.setAttribute('aria-pressed', id === S().mode ? 'true' : 'false');
  }
}

function renderHero(): void {
  const info = modeInfo(currentMode());
  heroH2.textContent = modeName(currentMode());
  heroCode.textContent = info.code;
  heroP.textContent = modeBlurb(currentMode());
}

function renderChain(): void {
  const s = S();
  const mode = s.modes[s.mode];
  const uid = mode.selectedUid;
  const views: ChainBlockView[] = mode.blocks.map((b) => {
    const spec = getFxSpec(b.id);
    const inst = chainReady ? chain.instanceOf(b.uid) : undefined;
    return {
      uid: b.uid,
      id: b.id,
      name: spec ? fxName(spec) : b.id,
      code: spec?.code ?? '??',
      bypassed: b.bypassed,
      active: b.uid === uid,
      status: (b.bypassed ? '' : inst?.status?.()) ?? (spec ? fxBlurb(spec).slice(0, 10) : ''),
    };
  });
  chainView.update(views, s.power && engine.hasInputStream);
  renderEchoShield(); // 参数/旁通一变，回声防护结论可能就变了
}

function renderFxPanel(): void {
  const block = selectedBlock();
  if (!block) {
    fxPanel.setTitle(t('效果器'));
    clear(fxPanel.body);
    fxPanel.body.appendChild(el('div', 'empty-note')).textContent = t('当前链路为空，请从「效果器仓库」添加');
    return;
  }
  const spec = getFxSpec(block.id);
  if (!spec) return;
  fxPanel.setTitle(fxName(spec));
  fxPanel.el.querySelector('.panel-code')?.replaceChildren(document.createTextNode(spec.code));
  clear(fxPanel.body);

  const blurb = el('p', 'panel-hint');
  blurb.textContent = fxBlurb(spec);
  fxPanel.body.appendChild(blurb);

  const knobRow = el('div', 'knob-grid');
  const segRows: HTMLElement[] = [];

  for (const p of spec.params) {
    const value = block.params[p.key] ?? p.default;
    if (p.options) {
      const row = el('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.flexWrap = 'wrap';
      const label = el('span', 'silk');
      label.textContent = fxParamLabel(p);
      const seg = createSegmented({
        label: fxParamLabel(p),
        value,
        options: p.options.map((o) => ({ ...o, label: fxOptionLabel(o) })),
        onChange: (v) => setBlockParam(block.uid, p.key, Number(v)),
      });
      row.append(label, seg.el);
      segRows.push(row);
      continue;
    }
    const knob = createKnob({
      label: fxParamLabel(p),
      min: p.min,
      max: p.max,
      step: p.step,
      value,
      default: p.default,
      scale: p.scale ?? 'linear',
      bipolar: p.min < 0 && p.max > 0,
      format: (v) => fxParamFormat(p, v),
      size: p.key === 'mix' ? 54 : undefined,
      onChange: (v) => setBlockParam(block.uid, p.key, v),
    });
    knobRow.appendChild(knob.el);
  }

  fxPanel.body.appendChild(knobRow);
  for (const r of segRows) fxPanel.body.appendChild(r);

  bypassBtn.setOn(!block.bypassed);
  const idx = modeState().blocks.findIndex((b) => b.uid === block.uid);
  moveUpBtn.disabled = idx <= 0;
  moveDownBtn.disabled = idx < 0 || idx >= modeState().blocks.length - 1;
  delBtn.disabled = modeState().blocks.length <= 1;
}

function renderPresets(): void {
  clear(presetGrid);
  const presets = presetsForMode(currentMode());
  const active = modeState().presetId;
  for (const p of presets) {
    const btn = el('button', 'preset-btn', {
      type: 'button',
      'aria-pressed': p.id === active ? 'true' : 'false',
      title: presetBlurb(p),
    });
    const name = el('span', 'preset-name');
    name.textContent = presetName(p);
    const blurb = el('span', 'preset-blurb');
    blurb.textContent = presetBlurb(p);
    btn.append(name, blurb);
    btn.addEventListener('click', () => applyPreset(p));
    presetGrid.appendChild(btn);
  }

  // 变声「自定义」预设（仅扩音器模式）
  if (currentMode() === 'pa') {
    const custom = S().customVoice;
    const btn = el('button', 'preset-btn', {
      type: 'button',
      'aria-pressed': custom ? 'true' : 'false',
      title: custom ? t('恢复上次手动调好的效果') : t('把当前参数保存为自定义预设'),
    });
    const name = el('span', 'preset-name');
    name.textContent = t('自定义');
    const blurb = el('span', 'preset-blurb');
    blurb.textContent = custom ? t('点击恢复已保存的手动参数') : t('点击保存当前全部参数');
    btn.append(name, blurb);
    btn.addEventListener('click', () => {
      if (S().customVoice) applyCustomVoice();
      else saveCustomVoice();
    });
    presetGrid.appendChild(btn);
  }

  presetHint.textContent =
    currentMode() === 'pa'
      ? t('一键套用整套变声参数；手动调节后点「自定义」可保存/恢复。')
      : t('点击预设会替换整条效果链，手动修改后预设标记为「自定义」。');
}

function renderStatusbar(): void {
  const info = modeInfo(currentMode());
  const mode = modeState();
  sbMode.innerHTML = '';
  sbMode.append(t('模式 '));
  sbMode.append(el('b', '', {}));
  (sbMode.lastChild as HTMLElement).textContent = `${modeName(currentMode())} / ${info.code}`;
  sbChain.innerHTML = '';
  sbChain.append(t('链路 '));
  sbChain.append(el('b', '', {}));
  (sbChain.lastChild as HTMLElement).textContent = t('{n0} 级', { n0: mode.blocks.length });
  sbPreset.innerHTML = '';
  sbPreset.append(t('预设 '));
  sbPreset.append(el('b', '', {}));
  // 不能直接用 mode.presetName——那是应用预设时算一次存进 state 的译文快照，
  // 切语言不会更新。按 presetId 现查，每次渲染都取当前语言的译名。
  const activePreset = presetsForMode(currentMode()).find((p) => p.id === mode.presetId);
  (sbPreset.lastChild as HTMLElement).textContent = activePreset ? presetName(activePreset) : mode.presetName;
  // 快捷键提示带内联 <kbd>，只能整块 innerHTML。曾经在模块加载时写一次，
  // 而 captureStaticText 只抓「无子元素」的节点，夹在 kbd 之间的文本片段
  // 它抓不到，于是这句永远停在初始语言。放进 renderStatusbar 每次重绘。
  sbHint.innerHTML = t('提示：{k1} 电源 · {k2} 模式 · {k3} 节拍器 · {k4} 录音', {
    k1: kbd('空格'),
    k2: kbd('1-4'),
    k3: kbd('M'),
    k4: kbd('R'),
  });
}

function renderAll(): void {
  updateModeButtons();
  renderHero();
  renderChain();
  renderFxPanel();
  renderPresets();
  renderStatusbar();
  renderStatusStrip();
  renderEchoShield();
  renderInsertHint();
  // 设备授权提示也走 t()，但它平时只在设备轮询里刷新，
  // 不放进 renderAll 的话切语言后要等下一轮轮询（≤2.5s）才换文案
  renderDeviceHint();
  renderGuardStatus(engine.feedbackGuardState);
}

/* ------------------------------------------------------------------ */
/* 交互                                                                */
/* ------------------------------------------------------------------ */

function selectBlock(uid: string): void {
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], selectedUid: uid } },
  }));
  renderChain();
  renderFxPanel();
}

function toggleBypass(uid: string, force?: boolean): void {
  const s = S();
  const blocks = s.modes[s.mode].blocks;
  const next = blocks.map((b) => (b.uid === uid ? { ...b, bypassed: force ?? !b.bypassed } : b));
  store.setState((p) => ({ ...p, modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks: next } } }));
  const block = next.find((b) => b.uid === uid);
  if (block && chainReady) chain.setBypassed(uid, block.bypassed);
  renderChain();
  renderFxPanel();
}

function setBlockParam(uid: string, key: string, value: number): void {
  const s = S();
  const blocks = s.modes[s.mode].blocks.map((b) =>
    b.uid === uid ? { ...b, params: { ...b.params, [key]: value } } : b,
  );
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetId: null, presetName: t('自定义') } },
  }));
  if (chainReady) chain.setParam(uid, key, value);
  renderChain();
  renderStatusbar();
  renderPresets();
}

function rebuildChain(): void {
  chain.build(modeState().blocks);
  chainReady = true;
  renderChain();
}

async function ensureChain(): Promise<void> {
  if (chainReady) return;
  await engine.ensureWorklets();
  rebuildChain();
}

/** 插入位置：链尾 / 所选模块前 / 所选模块后 */
function insertBlock(fxId: string, index: number): void {
  const s = S();
  const blocks = [...s.modes[s.mode].blocks];
  const at = Math.max(0, Math.min(blocks.length, index));
  const block = makeBlock(fxId);
  blocks.splice(at, 0, block);
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: block.uid, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderAll();
  const spec = getFxSpec(fxId);
  const pos = at === blocks.length ? t('队尾') : t('第 {n0} 级', { n0: at + 1 });
  toast(t('「{n0}」已插入{n1}', { n0: spec ? fxName(spec) : fxId, n1: pos }), 'info');
}

function addBlock(fxId: string): void {
  const s = S();
  const blocks = [...s.modes[s.mode].blocks];
  const sel = selectedBlock();
  const selIdx = sel ? blocks.findIndex((b) => b.uid === sel.uid) : -1;
  const at =
    insertPos === 'tail' || selIdx < 0
      ? blocks.length
      : insertPos === 'before'
        ? selIdx
        : selIdx + 1;
  const block = makeBlock(fxId);
  blocks.splice(at, 0, block);
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: block.uid, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderAll();
}

function removeBlock(uid: string): void {
  const s = S();
  const blocks = s.modes[s.mode].blocks.filter((b) => b.uid !== uid);
  if (!blocks.length) return;
  store.setState((p) => ({
    ...p,
    modes: {
      ...p.modes,
      [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: blocks[0].uid, presetName: t('自定义') },
    },
  }));
  rebuildChain();
  renderFxPanel();
  renderPresets();
  renderStatusbar();
}

function moveBlock(uid: string, dir: -1 | 1): void {
  const s = S();
  const blocks = [...s.modes[s.mode].blocks];
  const i = blocks.findIndex((b) => b.uid === uid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  const [item] = blocks.splice(i, 1);
  blocks.splice(j, 0, item);
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderFxPanel();
}

function reorderBlock(fromUid: string, toUid: string, before: boolean): void {
  const s = S();
  const blocks = [...s.modes[s.mode].blocks];
  const from = blocks.findIndex((b) => b.uid === fromUid);
  if (from < 0) return;
  const [moved] = blocks.splice(from, 1);
  const to = blocks.findIndex((b) => b.uid === toUid);
  if (to < 0) return;
  blocks.splice(before ? to : to + 1, 0, moved);
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderAll();
  const spec = getFxSpec(moved.id);
  toast(t('「{n0}」已移到新位置', { n0: spec ? fxName(spec) : moved.id }), 'info');
}

function duplicateBlock(uid: string): void {
  const s = S();
  const blocks = [...s.modes[s.mode].blocks];
  const i = blocks.findIndex((b) => b.uid === uid);
  if (i < 0) return;
  const src = blocks[i];
  const copy: FxBlockState = { ...src, uid: `b_${Math.random().toString(36).slice(2, 8)}`, params: { ...src.params } };
  blocks.splice(i + 1, 0, copy);
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: copy.uid, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderFxPanel();
}

function resetBlockParams(uid: string): void {
  const s = S();
  const blocks = s.modes[s.mode].blocks.map((b) => {
    if (b.uid !== uid) return b;
    const spec = getFxSpec(b.id);
    if (!spec) return b;
    const params: Record<string, number> = {};
    for (const p of spec.params) params[p.key] = p.default;
    return { ...b, params };
  });
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderFxPanel();
  renderChain();
}

function applyPreset(preset: ChainPreset): void {
  const blocks = preset.blocks.map((b) => makeBlock(b.id, b.params, b.bypassed));
  store.setState((p) => ({
    ...p,
    modes: {
      ...p.modes,
      [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: blocks[0].uid, presetId: preset.id, presetName: presetName(preset) },
    },
  }));
  rebuildChain();
  renderFxPanel();
  renderPresets();
  renderStatusbar();
  toast(t('已套用预设：{n0}', { n0: presetName(preset) }));
}

function snapshotVoice(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const b of modeState().blocks) out[b.id] = { ...b.params };
  return out;
}

function saveCustomVoice(): void {
  store.setState((p) => ({ ...p, customVoice: snapshotVoice() }));
  renderPresets();
  toast(t('已保存为「自定义」预设'));
}

function applyCustomVoice(): void {
  const custom = S().customVoice;
  if (!custom) return;
  const blocks = modeState().blocks.map((b) => ({
    ...b,
    params: { ...b.params, ...(custom[b.id] ?? {}) },
  }));
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetId: null, presetName: t('自定义') } },
  }));
  rebuildChain();
  renderFxPanel();
  renderPresets();
  toast(t('已恢复「自定义」预设'));
}

function switchMode(mode: ModeId): void {
  if (mode === S().mode) return;
  store.setState((p) => ({ ...p, mode }));
  rebuildChain();
  renderAll();
}

/* ------------------------------ 电源 / 音源 ---------------------------- */

async function powerOn(): Promise<void> {
  try {
    await ensureChain();
    const s = S();
    await engine.setInput({
      kind: s.input.kind,
      deviceId: s.input.deviceId,
      echoCancellation: s.input.echoCancellation,
      noiseSuppression: s.input.noiseSuppression,
      autoGainControl: s.input.autoGainControl,
    });
    if (s.input.kind === 'test') {
      engine.testTone.setMode(s.input.testMode);
      engine.testTone.setLevel(s.input.testLevel);
      engine.testTone.start();
    }
    store.setState((p) => ({ ...p, power: true }));
    void refreshDevices(true); // getUserMedia 已授权，此刻才拿得到真实设备名
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast(t('无法开启音频输入：{n0}', { n0: msg }), 'error');
    store.setState((p) => ({ ...p, power: false }));
  }
  syncPowerUi();
}

function powerOff(): void {
  engine.stopInput();
  engine.testTone.stop();
  store.setState((p) => ({ ...p, power: false }));
  syncPowerUi();
}

function syncPowerUi(): void {
  const on = S().power;
  powerBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  renderStatusStrip();
  renderChain();
}

powerBtn.addEventListener('click', () => {
  if (S().power) powerOff();
  else void powerOn();
});

kindSelect.select.addEventListener('change', () => {
  const kind = kindSelect.getValue() as InputSourceKind;
  store.setState((p) => ({ ...p, input: { ...p.input, kind } }));
  inputDeviceSelect.el.classList.toggle('hidden', kind === 'tab');
  testRow.classList.toggle('hidden', kind !== 'test');
  if (S().power) {
    if (kind === 'test') {
      engine.testTone.setMode(S().input.testMode);
      engine.testTone.setLevel(S().input.testLevel);
      engine.testTone.start();
    } else {
      engine.testTone.stop();
      void powerOn();
    }
  }
});

// 点开下拉先刷一次，避免拿到过期列表
inputDeviceSelect.select.addEventListener('pointerdown', () => void refreshDevices());
outputDeviceSelect.select.addEventListener('pointerdown', () => void refreshDevices());

inputDeviceSelect.select.addEventListener('change', () => {
  const id = inputDeviceSelect.getValue();
  store.setState((p) => ({ ...p, input: { ...p.input, deviceId: id } }));
  if (S().power && S().input.kind === 'mic') void powerOn();
});

outputDeviceSelect.select.addEventListener('change', () => {
  const id = outputDeviceSelect.getValue();
  store.setState((p) => ({ ...p, outputDeviceId: id }));
  void engine.setOutputDevice(id).catch((e: unknown) => {
    toast(t('切换输出设备失败：{n0}', { n0: e instanceof Error ? e.message : String(e) }), 'error');
  });
});

engine.onStreamEnded = () => {
  toast(t('音源已停止共享'), 'info');
  powerOff();
};

engine.onDevicesChanged = () => {
  void refreshDevices();
};

/**
 * 设备列表刷新。
 *
 * 两个坑：
 * 1. 未授权麦克风时 enumerateDevices 只返回抹掉 label/deviceId 的条目，
 *    打开网页时经常就这样，用户看到的全是「输入设备 1/2/3」。
 * 2. devicechange 事件在 macOS / Chrome 上并不可靠，插拔常常不触发。
 *    所以除了事件，再加一条定时轮询做兜底，靠签名比对判断是否真的变了。
 */
function deviceSignature(inputs: DeviceEntry[], outputs: DeviceEntry[]): string {
  // 抹名时 label 是空串，光靠它分不出设备增减，所以把序号也并进签名
  return (
    inputs.map((d, i) => `i:${d.deviceId}|${d.label}|${i}`).join(';') +
    '#' +
    outputs.map((d, i) => `o:${d.deviceId}|${d.label}|${i}`).join(';')
  );
}

async function refreshDevices(force = false): Promise<void> {
  let list: Awaited<ReturnType<typeof engine.listDevices>>;
  try {
    list = await engine.listDevices();
  } catch {
    return;
  }
  const { inputs, outputs, masked } = list;
  const sig = deviceSignature(inputs, outputs);
  deviceMasked = masked;
  if (!force && sig === deviceSig) {
    renderDeviceHint();
    return;
  }
  const first = deviceSig === '';
  deviceSig = sig;

  // 抹名时的占位标签用惰性函数：这些选项会被缓存下来，切语言后靠 refresh() 重算
  inputDeviceSelect.setOptions(
    inputs.map((d, i) => ({ value: d.deviceId, label: d.label || (() => t('输入设备 {n0}', { n0: i + 1 })) })),
  );
  outputDeviceSelect.setOptions(
    outputs.map((d, i) => ({ value: d.deviceId, label: d.label || (() => t('输出设备 {n0}', { n0: i + 1 })) })),
  );

  // 已选设备被拔掉时回落到系统默认，并明确告知，避免用户以为没声音是坏了
  const s = S();
  if (s.input.deviceId && !inputs.some((d) => d.deviceId === s.input.deviceId)) {
    store.setState((p) => ({ ...p, input: { ...p.input, deviceId: '' } }));
    inputDeviceSelect.setValue('');
    if (!first) toast(t('原输入设备已移除，已切换为系统默认输入'), 'info');
  } else {
    inputDeviceSelect.setValue(s.input.deviceId);
  }
  if (s.outputDeviceId && !outputs.some((d) => d.deviceId === s.outputDeviceId)) {
    store.setState((p) => ({ ...p, outputDeviceId: '' }));
    outputDeviceSelect.setValue('');
    if (!first) {
      void engine.setOutputDevice('').catch(() => undefined);
      toast(t('原输出设备已移除，已切换为系统默认输出'), 'info');
    }
  } else {
    outputDeviceSelect.setValue(s.outputDeviceId);
  }

  renderDeviceHint();
}

/** 授权一次麦克风以解锁真实设备名；权限已授予时不会弹窗 */
async function unlockDeviceLabels(): Promise<void> {
  try {
    await engine.unlockDeviceLabels();
    await refreshDevices(true);
    if (!deviceMasked) toast(t('设备列表已刷新'), 'info');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast(t('无法获取麦克风权限：{n0}', { n0: msg }), 'error');
  }
}

function startDevicePolling(): void {
  if (devicePoll !== null) return;
  devicePoll = window.setInterval(() => {
    if (document.hidden) return; // 后台标签页不轮询，省电
    void refreshDevices();
  }, DEVICE_POLL_MS);
}

/* ------------------------------ 面板动作 ------------------------------ */

moveUpBtn.addEventListener('click', () => {
  const uid = selectedUid();
  if (uid) moveBlock(uid, -1);
});
moveDownBtn.addEventListener('click', () => {
  const uid = selectedUid();
  if (uid) moveBlock(uid, 1);
});
dupBtn.addEventListener('click', () => {
  const uid = selectedUid();
  if (uid) duplicateBlock(uid);
});
delBtn.addEventListener('click', () => {
  const uid = selectedUid();
  if (uid) removeBlock(uid);
});
resetBtn.addEventListener('click', () => {
  const uid = selectedUid();
  if (uid) resetBlockParams(uid);
});

function toggleLibrary(force?: boolean): void {
  if (force === true) library.expand();
  else library.body.classList.toggle('hidden');
  library.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ------------------------------- 节拍器 ------------------------------- */

let metroRecTimer: number | null = null;

async function startMetronome(): Promise<void> {
  void engine.ensureWorklets().then(() => {
    metronome.start({
      bpm: S().metronome.bpm,
      beats: S().metronome.beats,
      volume: S().metronome.volume,
    });
    metroBtn.textContent = t('停止节拍器');
    metroBtn.dataset.variant = 'danger';
    metronome.onBeat = (beat) => {
      metroBeat.setOn(true);
      if (metroRecTimer !== null) clearTimeout(metroRecTimer);
      metroRecTimer = setTimeout(() => metroBeat.setOn(false), 90) as unknown as number;
      void beat;
    };
  });
}

function stopMetronome(): void {
  metronome.stop();
  metronome.onBeat = null;
  metroBtn.textContent = t('启动节拍器');
  metroBtn.dataset.variant = 'primary';
  metroBeat.setOn(false);
}

metroBtn.addEventListener('click', () => {
  if (metronome.running) stopMetronome();
  else startMetronome();
});

/* ------------------------------- 循环录音 ------------------------------ */

function renderLoopList(): void {
  clear(loopList);
  const layers = loopStation.layers;
  if (!layers.length) {
    loopList.appendChild(el('div', 'empty-note')).textContent = t('还没有循环层');
    return;
  }
  layers.forEach((layer, i) => {
    const item = el('div', 'rec-item');
    const name = el('span', 'rec-item-name');
    name.textContent = t('第 {n0} 层', { n0: i + 1 });
    const del = el('button', 'btn btn-icon', { type: 'button', title: t('删除该层') });
    del.textContent = '✕';
    del.addEventListener('click', () => {
      loopStation.removeLayer(layer.id);
      renderLoopList();
      loopClearBtn.disabled = loopStation.layers.length === 0;
    });
    item.append(name, del);
    loopList.appendChild(item);
  });
}

loopArmBtn.addEventListener('click', () => {
  void engine.resume().then(() => {
    const bars = Number(loopBars.getValue()) || 4;
    loopStation.arm(bars, S().metronome.bpm, S().metronome.beats);
    loopArmBtn.disabled = true;
    loopStopBtn.disabled = false;
    loopText.textContent = t('等待第 1 个小节开始…');
  });
});

loopStopBtn.addEventListener('click', () => {
  void loopStation.commit().then((layer) => {
    if (layer) toast(t('已加入一层循环'));
    loopArmBtn.disabled = false;
    loopStopBtn.disabled = true;
    loopClearBtn.disabled = loopStation.layers.length === 0;
    renderLoopList();
  });
});

loopClearBtn.addEventListener('click', () => {
  loopStation.clear();
  loopArmBtn.disabled = false;
  loopStopBtn.disabled = true;
  loopClearBtn.disabled = true;
  renderLoopList();
});

/* -------------------------------- 录音机 ------------------------------- */

let recTimer: number | null = null;
let recStart = 0;

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderRecList(): void {
  clear(recList);
  if (!recordings.length) {
    recList.appendChild(el('div', 'empty-note')).textContent = t('暂无录音文件');
    return;
  }
  for (const item of recordings) {
    const row = el('div', 'rec-item');
    const name = el('span', 'rec-item-name');
    name.textContent = `${item.name} · ${fmtTime(item.duration)}`;
    name.title = item.name;
    const play = el('button', 'btn btn-icon', { type: 'button', title: t('播放') });
    play.textContent = '▶';
    const dl = el('a', 'btn btn-icon', { href: item.url, download: `${item.name}.webm`, title: t('保存到本地') });
    dl.textContent = '⤓';
    const rm = el('button', 'btn btn-icon', { type: 'button', title: t('删除') });
    rm.textContent = '✕';
    play.addEventListener('click', () => {
      const audio = new Audio(item.url);
      void audio.play().catch(() => toast(t('播放失败'), 'error'));
    });
    rm.addEventListener('click', () => {
      const i = recordings.indexOf(item);
      if (i >= 0) recordings.splice(i, 1);
      URL.revokeObjectURL(item.url);
      renderRecList();
    });
    row.append(name, play, dl, rm);
    recList.appendChild(row);
  }
}

recBtn.addEventListener('click', () => {
  if (recorder?.recording) {
    void recorder.stop().then((item) => {
      if (item) recordings.unshift(item);
      renderRecList();
      recBtn.textContent = t('开始录音');
      recBtn.dataset.variant = 'primary';
      recDot.dataset.rec = 'false';
      recPlayBtn.disabled = recordings.length === 0;
      recClearBtn.disabled = recordings.length === 0;
      if (recTimer !== null) clearInterval(recTimer);
      recTimer = null;
    });
    return;
  }
  if (!S().power) {
    toast(t('请先开启电源再录音'), 'error');
    return;
  }
  try {
    recorder = new Recorder(engine.recDest.stream);
    recorder.start();
    recStart = performance.now();
    recBtn.textContent = t('停止录音');
    recBtn.dataset.variant = 'danger';
    recDot.dataset.rec = 'true';
    recTimer = setInterval(() => {
      recTime.textContent = fmtTime((performance.now() - recStart) / 1000);
    }, 200) as unknown as number;
  } catch (err) {
    toast(t('录音启动失败：{n0}', { n0: err instanceof Error ? err.message : String(err) }), 'error');
  }
});

recPlayBtn.addEventListener('click', () => {
  const first = recordings[0];
  if (!first) return;
  const audio = new Audio(first.url);
  void audio.play().catch(() => toast(t('播放失败'), 'error'));
});

recClearBtn.addEventListener('click', () => {
  for (const r of recordings) URL.revokeObjectURL(r.url);
  recordings.length = 0;
  renderRecList();
  recPlayBtn.disabled = true;
  recClearBtn.disabled = true;
});

/* ------------------------------ 快捷键 ------------------------------- */

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (e.key === ' ') {
    e.preventDefault();
    powerBtn.click();
  } else if (e.key >= '1' && e.key <= '4') {
    const m = MODE_LIST[Number(e.key) - 1];
    if (m) void switchMode(m.id);
  } else if (e.key === 'm' || e.key === 'M') {
    metroBtn.click();
  } else if (e.key === 'r' || e.key === 'R') {
    recBtn.click();
  } else if (e.key === 'b' || e.key === 'B') {
    const uid = selectedUid();
    if (uid) toggleBypass(uid);
  }
});

/* ------------------------------------------------------------------ */
/* 主循环                                                              */
/* ------------------------------------------------------------------ */

let tunerOn = true;
tunerToggle.el.addEventListener('click', () => {
  tunerOn = tunerToggle.getChecked();
});

function frame(): void {
  meterBank.update(engine.getLevels());
  if (tunerOn && S().power) {
    const reading = tuner.update();
    if (reading && reading.clarity > 0.5 && reading.frequency > 0) {
      const cents = Math.max(-50, Math.min(50, reading.cents));
      const state = Math.abs(cents) < 5 ? 'intune' : cents > 0 ? 'sharp' : 'flat';
      tunerNote.textContent = `${reading.note}${reading.octave}`;
      tunerNote.dataset.state = state;
      tunerFreq.textContent = `${reading.frequency.toFixed(1)} Hz`;
      tunerCents.textContent = t('{n0}{n1} 音分', { n0: cents > 0 ? '+' : '', n1: cents.toFixed(0) });
      needleMark.style.setProperty('--rot', `${cents * 0.9}deg`);
    } else {
      tunerNote.textContent = '—';
      tunerNote.dataset.state = 'idle';
      tunerFreq.textContent = '0.0 Hz';
      tunerCents.textContent = t('等待信号…');
      needleMark.style.setProperty('--rot', '0deg');
    }
  } else {
    tunerNote.textContent = '—';
    tunerNote.dataset.state = 'idle';
  }

  if (loopStation.recording) {
    loopText.textContent = t('录音中 {n0}%', { n0: Math.round(loopStation.progress * 100) });
  } else if (loopStation.armed) {
    loopText.textContent = t('已待命，等下一小节开始');
  } else if (loopStation.hasPending) {
    loopText.textContent = t('本层已录完，点「停止并循环」加入');
  } else if (loopStation.layers.length) {
    loopText.textContent = t('循环中 · {n0} 层', { n0: loopStation.layers.length });
  }

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

function boot(): void {
  initI18n();
  // initI18n 可能把语言改成浏览器语言，得把界面整体刷一遍（见 applyLocale 注释）
  applyLocale();
  testRow.classList.toggle('hidden', S().input.kind !== 'test');
  inputDeviceSelect.el.classList.toggle('hidden', S().input.kind === 'tab');
  renderAll();
  renderLoopList();
  renderRecList();
  spectrum.start();
  if (S().feedbackGuard) {
    engine.feedbackGuard.start();
    engine.feedbackGuard.setAnalysisEnabled(S().input.kind === 'mic');
  }
  requestAnimationFrame(frame);

  void refreshDevices(true);
  startDevicePolling(); // devicechange 在 macOS/Chrome 上不可靠，轮询兜底
  void engine.ensureWorklets().then(() => {
    rebuildChain();
    if (S().outputDeviceId) void engine.setOutputDevice(S().outputDeviceId).catch(() => undefined);
  });
  engine.setStreamEndedHandler(() => powerOff());
  metronome.onBeat = null;
}

boot();

// 供调试与后续扩展
declare global {
  interface Window {
    __VOICE_MANAGER__?: unknown;
  }
}
window.__VOICE_MANAGER__ = { engine, chain, store, metronome, tuner, loopStation, PA_PRESETS };
