import type { FxParams } from './audio/fx/types';

export type ModeId = 'pa' | 'guitar' | 'bass' | 'fx';

export type InputKind = 'mic' | 'tab' | 'test';

/** 效果链中的一个模块实例 */
export interface FxBlockState {
  /** 实例唯一 id（同一效果器可重复出现） */
  uid: string;
  /** 效果器规格 id */
  id: string;
  params: FxParams;
  bypassed: boolean;
}

export interface ModeState {
  blocks: FxBlockState[];
  selectedUid: string | null;
  presetId: string | null;
  presetName: string;
}

export interface InputState {
  kind: InputKind;
  deviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  trimDb: number;
  /** 测试音源模式 0..4 */
  testMode: number;
  /** 测试音源电平 0..1 */
  testLevel: number;
}

export interface MetronomeState {
  bpm: number;
  beats: number;
  volume: number;
}

export interface AppState {
  version: number;
  mode: ModeId;
  power: boolean;
  masterDb: number;
  outputDeviceId: string;
  input: InputState;
  modes: Record<ModeId, ModeState>;
  metronome: MetronomeState;
  tunerReference: number;
  /** 变声「自定义」预设快照 */
  customVoice: Record<string, FxParams> | null;
}

export const MODE_LIST: { id: ModeId; name: string; code: string; blurb: string }[] = [
  { id: 'pa', name: '在线扩音器', code: 'PA', blurb: '麦克风变扩音器：均衡 / 混响 / 压缩 / 变声 / 录音' },
  { id: 'guitar', name: '电吉他', code: 'GTR', blurb: '吉他监听与效果器：噪声门 / 过载 / 音箱 / 延迟' },
  { id: 'bass', name: '贝斯', code: 'BASS', blurb: '贝斯监听与效果器：压缩 / DI / 法兹 / 箱体' },
  { id: 'fx', name: '效果器架', code: 'FX', blurb: '自由搭建效果链，任意顺序、任意数量' },
];

export function modeInfo(id: ModeId) {
  return MODE_LIST.find((m) => m.id === id) ?? MODE_LIST[0];
}
