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

import { AudioEngine, type InputSourceKind } from './audio/engine';
import { SignalChain, makeBlock } from './audio/chain';
import { FX_CATEGORY_LABEL, FX_CATEGORY_ORDER, allFxSpecs, getFxSpec } from './audio/fx';
import { PA_PRESETS, presetsForMode, type ChainPreset } from './audio/presets';
import { setTempo } from './audio/tempo';
import { testToneModeLabel } from './audio/test-tone';
import { Metronome } from './audio/metronome';
import { Tuner } from './audio/tuner';
import { LoopStation, Recorder, type RecordingItem } from './audio/recorder';
import { createStore } from './state/store';
import { createInitialState } from './state/initial';
import { MODE_LIST, modeInfo, type AppState, type FxBlockState, type ModeId } from './types';
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
import { createChainView, type ChainBlockView } from './ui/chainview';
import { createMeterBank, createSpectrum } from './ui/meters';

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
brandSub.textContent = 'MUTANTCAT · VM-5000 · 浏览器音频工作站';
brandText.appendChild(brandName);
brandText.appendChild(brandSub);
brand.appendChild(mark);
brand.appendChild(brandText);

const powerCluster = el('div', 'power-cluster');
const powerSwitch = el('div', 'power-switch');
const powerBtn = el('button', 'power-btn', {
  type: 'button',
  'aria-pressed': 'false',
  'aria-label': '电源开关',
  title: '开启 / 关闭扩音（空格）',
});
const powerCap = el('div', 'power-caption');
powerCap.textContent = 'POWER';
powerSwitch.appendChild(powerBtn);
powerSwitch.appendChild(powerCap);
const masterKnob = createKnob({
  label: '主音量',
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
  label: '音源类型',
  value: S().input.kind,
  options: [
    { value: 'mic', label: '麦克风 / 线路输入' },
    { value: 'tab', label: '标签页 / 系统音频' },
    { value: 'test', label: '内置测试音源' },
  ],
});
const inputDeviceSelect = createSelect({
  label: '输入设备',
  value: S().input.deviceId,
  placeholder: '系统默认输入',
  options: [],
});
const outputDeviceSelect = createSelect({
  label: '输出设备（耳机线 / USB 声卡）',
  value: S().outputDeviceId,
  placeholder: '系统默认输出',
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
  chipPower.append('状态 ');
  const b = el('b');
  b.textContent = s.power ? '运行中' : '已停止';
  chipPower.append(b);
  chipSr.innerHTML = '';
  chipSr.append('采样率 ');
  chipSr.append(el('b', '', {}));
  (chipSr.lastChild as HTMLElement).textContent = `${(engine.sampleRate / 1000).toFixed(1)} kHz`;
  const lat = (engine.ctx.baseLatency ?? 0) * 1000 + (engine.ctx.outputLatency ?? 0) * 1000;
  chipLatency.innerHTML = '';
  chipLatency.append('延迟 ');
  chipLatency.append(el('b', '', {}));
  (chipLatency.lastChild as HTMLElement).textContent = lat > 0 ? `${lat.toFixed(1)} ms` : '—';
  chipEngine.innerHTML = '';
  chipEngine.append('Worklet ');
  chipEngine.append(el('b', '', {}));
  (chipEngine.lastChild as HTMLElement).textContent = engine.supported ? '就绪' : '不可用';
}

statusStrip.append(chipPower, chipSr, chipLatency, chipEngine);
ioCluster.append(kindSelect.el, inputDeviceSelect.el, outputDeviceSelect.el, statusStrip);
header.append(brand, powerCluster, ioCluster);

/* ------------------------------------------------------------------ */
/* 模式选择                                                            */
/* ------------------------------------------------------------------ */

const modebar = el('nav', 'modebar', { 'aria-label': '模式选择' });
const modeButtons = new Map<ModeId, HTMLButtonElement>();
for (const m of MODE_LIST) {
  const btn = el('button', 'mode-btn', {
    type: 'button',
    'aria-pressed': 'false',
    'data-mode': m.id,
    title: m.blurb,
  });
  const code = el('span', 'mode-code');
  code.textContent = m.code;
  const meta = el('div', 'mode-meta');
  const name = el('div', 'mode-name');
  name.textContent = m.name;
  const blurb = el('div', 'mode-blurb');
  blurb.textContent = m.blurb;
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
(chainTitle.firstChild as HTMLElement).textContent = '信号链路 / SIGNAL PATH';
const chainHint = el('span', 'panel-hint');
chainHint.textContent = '点击模块编辑参数 · 点灯或右键切换旁通';
chainHead.append(chainTitle, chainHint);
const chainView = createChainView({
  onSelect: (uid) => selectBlock(uid),
  onToggleBypass: (uid) => toggleBypass(uid),
  onAdd: () => toggleLibrary(true),
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
}, '旁通该效果器');
const moveUpBtn = el('button', 'btn btn-icon', { type: 'button', title: '上移' });
moveUpBtn.textContent = '↑';
const moveDownBtn = el('button', 'btn btn-icon', { type: 'button', title: '下移' });
moveDownBtn.textContent = '↓';
const dupBtn = el('button', 'btn btn-icon', { type: 'button', title: '复制该效果器' });
dupBtn.textContent = '⧉';
const delBtn = el('button', 'btn btn-icon', { type: 'button', title: '移除该效果器' });
delBtn.textContent = '✕';
const resetBtn = el('button', 'btn', { type: 'button', title: '恢复该效果器默认参数' });
resetBtn.textContent = '重置';
fxActions.append(bypassBtn.el, moveUpBtn, moveDownBtn, dupBtn, delBtn, resetBtn);

/* 电平 + 频谱：紧跟信号链路，监测当前这条链的输入输出 */
const meterPanel = createPanel({ title: '电平 / 频谱', code: 'MTR' });
const meterBank = createMeterBank();
const spectrum = createSpectrum(() => engine.analyserOut);
meterPanel.body.append(meterBank.el, spectrum.el);
workarea.append(hero, meterPanel.el);

const fxPanel = createPanel({ title: '效果器', code: 'FX', actions: [fxActions] });
workarea.appendChild(fxPanel.el);

/* 预设：与信号链路相邻，改完参数就能整组试听 */
const presetPanel = createPanel({ title: '预设', code: 'PRE' });
const presetGrid = el('div', 'preset-grid');
presetPanel.body.appendChild(presetGrid);
const presetHint = el('p', 'panel-hint');
presetHint.style.marginTop = '8px';
presetPanel.body.appendChild(presetHint);
workarea.appendChild(presetPanel.el);

/* 效果器仓库 */
const library = createPanel({ title: '效果器仓库', code: 'LIB', collapsible: true, startCollapsed: false });
const libBody = library.body;
const libGroups = el('div', 'fx-library');
for (const cat of FX_CATEGORY_ORDER) {
  const specs = allFxSpecs().filter((s) => s.category === cat);
  if (!specs.length) continue;
  const group = el('div', 'fx-lib-group');
  const label = el('div', 'fx-row-label');
  label.textContent = FX_CATEGORY_LABEL[cat];
  const items = el('div', 'fx-lib-items');
  for (const spec of specs) {
    const chip = el('button', 'fx-chip', { type: 'button', title: spec.blurb });
    const mono = el('span', 'mono');
    mono.textContent = spec.code;
    const name = el('span');
    name.textContent = spec.name;
    chip.append(mono, name);
    chip.addEventListener('click', () => addBlock(spec.id));
    items.appendChild(chip);
  }
  group.append(label, items);
  libGroups.appendChild(group);
}
libBody.appendChild(libGroups);
workarea.appendChild(library.el);

/* ------------------------------------------------------------------ */
/* 侧栏                                                                */
/* ------------------------------------------------------------------ */

const sidebar = el('aside', 'sidebar', { 'aria-label': '工具面板' });

/* 调音器 */
const tunerPanel = createPanel({ title: '调音器', code: 'TUNE' });
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
tunerCents.textContent = '等待信号…';
const tunerRef = createKnob({
  label: 'A4 基准',
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
  label: '启用调音器',
  checked: true,
  onChange: () => undefined,
});
tunerWrap.append(tunerNote, tunerFreq, tunerNeedle, tunerCents, tunerRef.el, tunerToggle.el);
tunerPanel.body.appendChild(tunerWrap);
sidebar.appendChild(tunerPanel.el);

/* 节拍器 */
const metroPanel = createPanel({ title: '节拍器', code: 'MET' });
const metroBody = el('div');
metroBody.style.display = 'flex';
metroBody.style.flexDirection = 'column';
metroBody.style.gap = '12px';
const metroBtn = el('button', 'btn', { type: 'button', 'data-variant': 'primary' });
metroBtn.textContent = '启动节拍器';
const metroBeat = createLed('拍', 'amber');
const metroKnobs = el('div', 'knob-grid');
const bpmKnob = createKnob({
  label: '速度 BPM',
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
  label: '拍号',
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
  label: '音量',
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
const loopPanel = createPanel({ title: '循环录音', code: 'LOOP' });
const loopBody = el('div');
loopBody.style.display = 'flex';
loopBody.style.flexDirection = 'column';
loopBody.style.gap = '10px';
const loopHint = el('p', 'panel-hint');
loopHint.textContent = '按设定的小节数录一层，自动无缝循环；可多次叠加。';
const loopRow = el('div');
loopRow.style.display = 'flex';
loopRow.style.gap = '8px';
loopRow.style.flexWrap = 'wrap';
const loopBars = createSelect({
  label: '循环长度',
  value: '4',
  options: [1, 2, 4, 8, 16].map((n) => ({ value: String(n), label: `${n} 小节` })),
});
const loopArmBtn = el('button', 'btn', { type: 'button', 'data-variant': 'primary' });
loopArmBtn.textContent = '开始循环录音';
const loopStopBtn = el('button', 'btn', { type: 'button' });
loopStopBtn.textContent = '停止并循环';
loopStopBtn.disabled = true;
const loopClearBtn = el('button', 'btn', { type: 'button' });
loopClearBtn.textContent = '清空';
loopClearBtn.disabled = true;
const loopStatus = el('div', 'rec-status');
const loopDot = el('span', 'rec-dot', { 'data-rec': 'false' });
const loopText = el('span');
loopText.textContent = '未录制';
loopStatus.append(loopDot, loopText);
const loopList = el('div', 'rec-list');
loopRow.append(loopArmBtn, loopStopBtn, loopClearBtn);
loopBody.append(loopHint, loopBars.el, loopRow, loopStatus, loopList);
loopPanel.body.appendChild(loopBody);
sidebar.appendChild(loopPanel.el);

/* 录音机 */
const recPanel = createPanel({ title: '录音机', code: 'REC' });
const recBody = el('div', 'recorder');
const recControls = el('div', 'rec-controls');
const recBtn = el('button', 'btn', { type: 'button', 'data-variant': 'primary' });
recBtn.textContent = '开始录音';
const recPlayBtn = el('button', 'btn', { type: 'button' });
recPlayBtn.textContent = '播放';
recPlayBtn.disabled = true;
const recClearBtn = el('button', 'btn', { type: 'button' });
recClearBtn.textContent = '清空列表';
recClearBtn.disabled = true;
recControls.append(recBtn, recPlayBtn, recClearBtn);
const recStatus = el('div', 'rec-status');
const recDot = el('span', 'rec-dot', { 'data-rec': 'false' });
const recTime = el('span', 'mono');
recTime.textContent = '00:00';
recStatus.append(recDot, recTime);
const recList = el('div', 'rec-list');
const recEmpty = el('div', 'empty-note');
recEmpty.textContent = '暂无录音文件';
recList.appendChild(recEmpty);
recBody.append(recControls, recStatus, recList);
recPanel.body.appendChild(recBody);
sidebar.appendChild(recPanel.el);

/* 输入与设备 */
const ioPanel = createPanel({ title: '输入与设备', code: 'I/O', collapsible: true });
const ioBody = el('div');
ioBody.style.display = 'flex';
ioBody.style.flexDirection = 'column';
ioBody.style.gap = '12px';
const trimKnob = createKnob({
  label: '输入微调',
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
    toast(`重新获取麦克风失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}
const ecToggle = createToggle({
  label: '回声消除（用扬声器放音时务必开启）',
  checked: S().input.echoCancellation,
  onChange: (c) => {
    store.setState((p) => ({ ...p, input: { ...p.input, echoCancellation: c } }));
    renderFeedbackWarning();
    void reacquireInput();
  },
});
const nsToggle = createToggle({
  label: '浏览器降噪（人声建议开启）',
  checked: S().input.noiseSuppression,
  onChange: (c) => {
    store.setState((p) => ({ ...p, input: { ...p.input, noiseSuppression: c } }));
    void reacquireInput();
  },
});
const agcToggle = createToggle({
  label: '自动增益控制（建议关闭，会放大啸叫）',
  checked: S().input.autoGainControl,
  onChange: (c) => {
    store.setState((p) => ({ ...p, input: { ...p.input, autoGainControl: c } }));
    void reacquireInput();
  },
});
togglesWrap.append(ecToggle.el, nsToggle.el, agcToggle.el);

/* 反馈抑制：关掉时给一句明确警示 */
const fbWarn = el('p', 'panel-hint fb-warning');
fbWarn.setAttribute('role', 'status');
function renderFeedbackWarning(): void {
  const ec = S().input.echoCancellation;
  fbWarn.textContent = ec
    ? ''
    : '⚠ 回声消除已关闭：若用扬声器放音，麦克风会拾取音箱输出，形成越拖越长的回声或啸叫。请改用耳机，或重新打开「回声消除」。';
  fbWarn.hidden = !ec ? false : true;
}
renderFeedbackWarning();
const testRow = el('div');
testRow.style.display = 'flex';
testRow.style.flexDirection = 'column';
testRow.style.gap = '8px';
const testModeSeg = createSegmented({
  label: '测试音源',
  value: S().input.testMode,
  options: [0, 1, 2, 3, 4].map((v) => ({ value: v, label: testToneModeLabel(v) })),
  onChange: (v) => {
    store.setState((p) => ({ ...p, input: { ...p.input, testMode: v } }));
    engine.testTone.setMode(v);
  },
});
const testLevel = createSlider({
  label: '测试音源电平',
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
  '耳机线 / USB 声卡：在「输出设备」里选择对应接口即可。若列表中没有，请在系统声音设置里确认设备已被识别。追求最低延迟时，建议在 USB 声卡上做硬件直连监听。';
const fbToggle = createToggle({
  label: '反馈抑制（自动凿掉啸叫频率）',
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
    guardStatus.textContent = '已停用';
  } else if (st.count === 0) {
    guardStatus.textContent = '监测中 · 暂无啸叫频率';
  } else {
    guardStatus.textContent = `已压制 ${st.count} 个频率：${st.freqs
      .map((f) => `${(f / 1000).toFixed(2)} kHz`)
      .join(' / ')}`;
  }
}
engine.onFeedbackGuard = (st) => renderGuardStatus(st);
renderGuardStatus(engine.feedbackGuardState);
ioBody.append(trimKnob.el, togglesWrap, fbWarn, fbToggle.el, guardStatus, testRow, ioHint);
ioPanel.body.appendChild(ioBody);
sidebar.appendChild(ioPanel.el);

/* 使用说明 */
const helpPanel = createPanel({ title: '使用说明', code: 'HELP', collapsible: true, startCollapsed: true });
const helpBody = el('div', 'help-body');
helpBody.innerHTML = `
  <div>
    <h4>快速开始</h4>
    <ol>
      <li>点击左上角 <b>电源</b> 开启，浏览器会请求麦克风权限，请选择「允许」。</li>
      <li>在「音源类型」里选择麦克风 / 标签页音频 / 内置测试音源。</li>
      <li>选择「输出设备」为耳机线或 USB 声卡，戴上耳机监听。</li>
      <li>点击信号链里的模块编辑参数，点灯或右键可旁通该模块。</li>
    </ol>
  </div>
  <div>
    <h4>关于啸叫与回声</h4>
    <p>扬声器放出的声音被麦克风拾回、再放大输出，就会形成越拖越长的回声，最终变成啸叫。三层防护：</p>
    <ul>
      <li><b>戴耳机</b>——最彻底，声音根本不回到麦克风。</li>
      <li><b>开启「回声消除」</b>——浏览器用扬声器信号做参考，从麦克风里减掉它，效果最好。</li>
      <li><b>开启「反馈抑制」</b>——持续监测输入频谱，发现又窄又亮又持续的单峰就自动在该频率凿一道浅凹槽；
        频率消失约 2 秒后凹槽自动恢复，不会在音色上留疤痕。面板里能看到当前压制了哪些频率。</li>
    </ul>
    <p>另外建议关闭「自动增益控制」：它会把安静的反馈残余一起放大，更容易起振。</p>
  </div>
  <div>
    <h4>关于噪声门</h4>
    <p>噪声门是整条链的第一级：当输入低于「阈值」时按「衰减深度」压低，信号回来时按「开启」时间平滑放开，
    「保持」可以避免音符之间的正常停顿被误切。吉他 / 贝斯建议阈值 -45 dB 左右，人声可到 -50 dB。</p>
  </div>
  <div>
    <h4>键盘快捷键</h4>
    <ul>
      <li><span class="kbd">空格</span> 电源开关　<span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span><span class="kbd">4</span> 切换模式</li>
      <li><span class="kbd">M</span> 节拍器　<span class="kbd">R</span> 录音　<span class="kbd">B</span> 旁通当前模块</li>
      <li>旋钮：上下拖动调节，<span class="kbd">Shift</span> 微调，滚轮微调，双击复位</li>
    </ul>
  </div>
  <div>
    <h4>注意事项</h4>
    <ul>
      <li>戴耳机使用，避免麦克风正对扬声器产生啸叫。</li>
      <li>录音文件保存在浏览器内存中，刷新页面后会清空。</li>
      <li>所有参数与预设自动保存在本地 localStorage。</li>
    </ul>
  </div>
`;
helpPanel.body.appendChild(helpBody);
sidebar.appendChild(helpPanel.el);

const deckMain = el('div', 'deck-main');
deckMain.append(workarea, sidebar);

const statusbar = el('footer', 'statusbar');
const sbMode = el('span');
const sbChain = el('span');
const sbPreset = el('span');
const sbHint = el('span');
sbHint.innerHTML = '提示：<span class="kbd">空格</span> 电源 · <span class="kbd">1-4</span> 模式 · <span class="kbd">M</span> 节拍器 · <span class="kbd">R</span> 录音';
statusbar.append(sbMode, sbChain, sbPreset, sbHint);

const rack = el('div', 'rack');
rack.append(header, modebar, chainbar, deckMain, statusbar);
const appRoot = document.querySelector<HTMLElement>('#app');
if (appRoot) appRoot.appendChild(rack);
else document.body.appendChild(rack);

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
  heroH2.textContent = info.name;
  heroCode.textContent = info.code;
  heroP.textContent = info.blurb;
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
      name: spec?.name ?? b.id,
      code: spec?.code ?? '??',
      bypassed: b.bypassed,
      active: b.uid === uid,
      status: (b.bypassed ? '' : inst?.status?.()) ?? spec?.blurb.slice(0, 10) ?? '',
    };
  });
  chainView.update(views, s.power && engine.hasInputStream);
}

function renderFxPanel(): void {
  const block = selectedBlock();
  if (!block) {
    fxPanel.setTitle('效果器');
    clear(fxPanel.body);
    fxPanel.body.appendChild(el('div', 'empty-note')).textContent = '当前链路为空，请从「效果器仓库」添加';
    return;
  }
  const spec = getFxSpec(block.id);
  if (!spec) return;
  fxPanel.setTitle(spec.name);
  fxPanel.el.querySelector('.panel-code')?.replaceChildren(document.createTextNode(spec.code));
  clear(fxPanel.body);

  const blurb = el('p', 'panel-hint');
  blurb.textContent = spec.blurb;
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
      label.textContent = p.label;
      const seg = createSegmented({
        label: p.label,
        value,
        options: p.options,
        onChange: (v) => setBlockParam(block.uid, p.key, v),
      });
      row.append(label, seg.el);
      segRows.push(row);
      continue;
    }
    const knob = createKnob({
      label: p.label,
      min: p.min,
      max: p.max,
      step: p.step,
      value,
      default: p.default,
      scale: p.scale ?? 'linear',
      bipolar: p.min < 0 && p.max > 0,
      format: p.format,
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
      title: p.blurb,
    });
    const name = el('span', 'preset-name');
    name.textContent = p.name;
    const blurb = el('span', 'preset-blurb');
    blurb.textContent = p.blurb;
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
      title: custom ? '恢复上次手动调好的效果' : '把当前参数保存为自定义预设',
    });
    const name = el('span', 'preset-name');
    name.textContent = '自定义';
    const blurb = el('span', 'preset-blurb');
    blurb.textContent = custom ? '点击恢复已保存的手动参数' : '点击保存当前全部参数';
    btn.append(name, blurb);
    btn.addEventListener('click', () => {
      if (S().customVoice) applyCustomVoice();
      else saveCustomVoice();
    });
    presetGrid.appendChild(btn);
  }

  presetHint.textContent =
    currentMode() === 'pa'
      ? '一键套用整套变声参数；手动调节后点「自定义」可保存/恢复。'
      : '点击预设会替换整条效果链，手动修改后预设标记为「自定义」。';
}

function renderStatusbar(): void {
  const info = modeInfo(currentMode());
  const mode = modeState();
  sbMode.innerHTML = '';
  sbMode.append('模式 ');
  sbMode.append(el('b', '', {}));
  (sbMode.lastChild as HTMLElement).textContent = `${info.name} / ${info.code}`;
  sbChain.innerHTML = '';
  sbChain.append('链路 ');
  sbChain.append(el('b', '', {}));
  (sbChain.lastChild as HTMLElement).textContent = `${mode.blocks.length} 级`;
  sbPreset.innerHTML = '';
  sbPreset.append('预设 ');
  sbPreset.append(el('b', '', {}));
  (sbPreset.lastChild as HTMLElement).textContent = mode.presetName;
}

function renderAll(): void {
  updateModeButtons();
  renderHero();
  renderChain();
  renderFxPanel();
  renderPresets();
  renderStatusbar();
  renderStatusStrip();
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
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetId: null, presetName: '自定义' } },
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

function addBlock(fxId: string): void {
  const s = S();
  const blocks = [...s.modes[s.mode].blocks];
  const sel = selectedBlock();
  const at = sel ? blocks.findIndex((b) => b.uid === sel.uid) + 1 : blocks.length;
  const block = makeBlock(fxId);
  blocks.splice(at, 0, block);
  store.setState((p) => ({
    ...p,
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: block.uid, presetName: '自定义' } },
  }));
  rebuildChain();
  renderFxPanel();
  renderPresets();
  renderStatusbar();
  library.collapse();
}

function removeBlock(uid: string): void {
  const s = S();
  const blocks = s.modes[s.mode].blocks.filter((b) => b.uid !== uid);
  if (!blocks.length) return;
  store.setState((p) => ({
    ...p,
    modes: {
      ...p.modes,
      [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: blocks[0].uid, presetName: '自定义' },
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
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetName: '自定义' } },
  }));
  rebuildChain();
  renderFxPanel();
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
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: copy.uid, presetName: '自定义' } },
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
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetName: '自定义' } },
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
      [p.mode]: { ...p.modes[p.mode], blocks, selectedUid: blocks[0].uid, presetId: preset.id, presetName: preset.name },
    },
  }));
  rebuildChain();
  renderFxPanel();
  renderPresets();
  renderStatusbar();
  toast(`已套用预设：${preset.name}`);
}

function snapshotVoice(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const b of modeState().blocks) out[b.id] = { ...b.params };
  return out;
}

function saveCustomVoice(): void {
  store.setState((p) => ({ ...p, customVoice: snapshotVoice() }));
  renderPresets();
  toast('已保存为「自定义」预设');
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
    modes: { ...p.modes, [p.mode]: { ...p.modes[p.mode], blocks, presetId: null, presetName: '自定义' } },
  }));
  rebuildChain();
  renderFxPanel();
  renderPresets();
  toast('已恢复「自定义」预设');
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast(`无法开启音频输入：${msg}`, 'error');
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

inputDeviceSelect.select.addEventListener('change', () => {
  const id = inputDeviceSelect.getValue();
  store.setState((p) => ({ ...p, input: { ...p.input, deviceId: id } }));
  if (S().power && S().input.kind === 'mic') void powerOn();
});

outputDeviceSelect.select.addEventListener('change', () => {
  const id = outputDeviceSelect.getValue();
  store.setState((p) => ({ ...p, outputDeviceId: id }));
  void engine.setOutputDevice(id).catch((e: unknown) => {
    toast(`切换输出设备失败：${e instanceof Error ? e.message : String(e)}`, 'error');
  });
});

engine.onStreamEnded = () => {
  toast('音源已停止共享', 'info');
  powerOff();
};

engine.onDevicesChanged = () => {
  void refreshDevices();
};

async function refreshDevices(): Promise<void> {
  const { inputs, outputs } = await engine.listDevices();
  inputDeviceSelect.setOptions(inputs.map((d) => ({ value: d.deviceId, label: d.label })));
  outputDeviceSelect.setOptions(outputs.map((d) => ({ value: d.deviceId, label: d.label })));
  const s = S();
  if (s.input.deviceId) inputDeviceSelect.setValue(s.input.deviceId);
  if (s.outputDeviceId) outputDeviceSelect.setValue(s.outputDeviceId);
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
    metroBtn.textContent = '停止节拍器';
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
  metroBtn.textContent = '启动节拍器';
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
    loopList.appendChild(el('div', 'empty-note')).textContent = '还没有循环层';
    return;
  }
  layers.forEach((layer, i) => {
    const item = el('div', 'rec-item');
    const name = el('span', 'rec-item-name');
    name.textContent = `第 ${i + 1} 层`;
    const del = el('button', 'btn btn-icon', { type: 'button', title: '删除该层' });
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
    loopText.textContent = `等待第 1 个小节开始…`;
  });
});

loopStopBtn.addEventListener('click', () => {
  void loopStation.commit().then((layer) => {
    if (layer) toast('已加入一层循环');
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
    recList.appendChild(el('div', 'empty-note')).textContent = '暂无录音文件';
    return;
  }
  for (const item of recordings) {
    const row = el('div', 'rec-item');
    const name = el('span', 'rec-item-name');
    name.textContent = `${item.name} · ${fmtTime(item.duration)}`;
    name.title = item.name;
    const play = el('button', 'btn btn-icon', { type: 'button', title: '播放' });
    play.textContent = '▶';
    const dl = el('a', 'btn btn-icon', { href: item.url, download: `${item.name}.webm`, title: '保存到本地' });
    dl.textContent = '⤓';
    const rm = el('button', 'btn btn-icon', { type: 'button', title: '删除' });
    rm.textContent = '✕';
    play.addEventListener('click', () => {
      const audio = new Audio(item.url);
      void audio.play().catch(() => toast('播放失败', 'error'));
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
      recBtn.textContent = '开始录音';
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
    toast('请先开启电源再录音', 'error');
    return;
  }
  try {
    recorder = new Recorder(engine.recDest.stream);
    recorder.start();
    recStart = performance.now();
    recBtn.textContent = '停止录音';
    recBtn.dataset.variant = 'danger';
    recDot.dataset.rec = 'true';
    recTimer = setInterval(() => {
      recTime.textContent = fmtTime((performance.now() - recStart) / 1000);
    }, 200) as unknown as number;
  } catch (err) {
    toast(`录音启动失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  }
});

recPlayBtn.addEventListener('click', () => {
  const first = recordings[0];
  if (!first) return;
  const audio = new Audio(first.url);
  void audio.play().catch(() => toast('播放失败', 'error'));
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
      tunerCents.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)} 音分`;
      needleMark.style.setProperty('--rot', `${cents * 0.9}deg`);
    } else {
      tunerNote.textContent = '—';
      tunerNote.dataset.state = 'idle';
      tunerFreq.textContent = '0.0 Hz';
      tunerCents.textContent = '等待信号…';
      needleMark.style.setProperty('--rot', '0deg');
    }
  } else {
    tunerNote.textContent = '—';
    tunerNote.dataset.state = 'idle';
  }

  if (loopStation.recording) {
    loopText.textContent = `录音中 ${Math.round(loopStation.progress * 100)}%`;
  } else if (loopStation.armed) {
    loopText.textContent = '已待命，等下一小节开始';
  } else if (loopStation.hasPending) {
    loopText.textContent = '本层已录完，点「停止并循环」加入';
  } else if (loopStation.layers.length) {
    loopText.textContent = `循环中 · ${loopStation.layers.length} 层`;
  }

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

function boot(): void {
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

  void refreshDevices();
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
