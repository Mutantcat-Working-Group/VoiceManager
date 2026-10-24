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
      echoCancellation: false,
      noiseSuppression: false,
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
  };
}
