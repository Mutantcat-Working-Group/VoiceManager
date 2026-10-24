import type { FxCategory, FxSpec } from './types';
import { noiseGateSpec } from './noise-gate';
import { eqSpec } from './eq';
import { compressorSpec } from './compressor';
import { limiterSpec } from './limiter';
import { volumeSpec } from './volume';
import { driveSpec } from './drive';
import { boosterSpec } from './booster';
import { ampSpec } from './amp';
import { cabSpec } from './cab';
import { delaySpec } from './delay';
import { reverbSpec } from './reverb';
import { chorusSpec } from './chorus';
import { phaserSpec } from './phaser';
import { flangerSpec } from './flanger';
import { tremoloSpec } from './tremolo';
import { ringmodSpec } from './ringmod';
import { pitchSpec } from './pitch';
import { octaverSpec } from './octaver';
import { bitcrusherSpec } from './bitcrusher';
import { autowahSpec } from './autowah';
import { filterSpec } from './filter';

export const FX_SPECS: FxSpec[] = [
  noiseGateSpec,
  compressorSpec,
  limiterSpec,
  eqSpec,
  filterSpec,
  autowahSpec,
  driveSpec,
  boosterSpec,
  ampSpec,
  cabSpec,
  chorusSpec,
  phaserSpec,
  flangerSpec,
  tremoloSpec,
  ringmodSpec,
  delaySpec,
  reverbSpec,
  pitchSpec,
  octaverSpec,
  bitcrusherSpec,
  volumeSpec,
];

export const FX_BY_ID: Map<string, FxSpec> = new Map(FX_SPECS.map((s) => [s.id, s]));

export function getFxSpec(id: string): FxSpec | undefined {
  return FX_BY_ID.get(id);
}

export function allFxSpecs(): readonly FxSpec[] {
  return FX_SPECS;
}

export const FX_CATEGORY_LABEL: Record<FxCategory, string> = {
  dynamics: '动态',
  filter: '滤波',
  drive: '失真',
  amp: '音箱',
  modulation: '调制',
  time: '空间',
  pitch: '音高',
  utility: '工具',
};

export const FX_CATEGORY_ORDER: FxCategory[] = [
  'dynamics',
  'filter',
  'drive',
  'amp',
  'modulation',
  'time',
  'pitch',
  'utility',
];

export * from './types';
export { defaultParams, clamp, clampParam } from './types';
