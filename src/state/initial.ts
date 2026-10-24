/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import { makeBlock } from '../audio/chain';
import { presetsForMode } from '../audio/presets';
import type { AppState, ModeId, ModeState } from '../types';

export function defaultModeState(mode: ModeId): ModeState {
  const preset = presetsForMode(mode)[0];
  const blocks = preset.blocks.map((b) => makeBlock(b.id, b.params, b.bypassed));
  return {
    blocks,
    selectedUid: blocks[0]?.uid ?? null,
    presetId: preset.id,
    presetName: preset.name,
  };
}

export function createInitialState(): AppState {
  return {
    version: 1,
    mode: 'pa',
    power: false,
    masterDb: -6,
    outputDeviceId: '',
    input: {
      kind: 'mic',
      deviceId: '',
      // 默认开启浏览器回声消除：关闭时麦克风会拾取扬声器输出，
      // 形成越拖越长的「反复回声」。需要最纯净音质时可手动关掉。
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      trimDb: 0,
      testMode: 2,
      testLevel: 0.5,
    },
    modes: {
      pa: defaultModeState('pa'),
      guitar: defaultModeState('guitar'),
      bass: defaultModeState('bass'),
      fx: defaultModeState('fx'),
    },
    metronome: { bpm: 96, beats: 4, volume: 0.6 },
    tunerReference: 440,
    customVoice: null,
    feedbackGuard: true,
  };
}
