/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 出厂预设 —— 每个模式一条完整效果链。
 * blocks 中的 params 只写与默认值不同的项，其余走效果器默认值。
 */

import type { ModeId } from '../types';

export interface PresetBlock {
  id: string;
  params?: Record<string, number>;
  bypassed?: boolean;
}

export interface ChainPreset {
  id: string;
  name: string;
  blurb: string;
  mode: ModeId;
  blocks: PresetBlock[];
}

/* ------------------------------------------------------------------ */
/* 在线扩音器 —— 变声预设（与参考站一致的快捷风格）                        */
/* ------------------------------------------------------------------ */

export const PA_PRESETS: ChainPreset[] = [
  {
    id: 'pa-original',
    name: '原声',
    blurb: '干净直出，只保留噪声门与压缩',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50, range: -90 } },
      { id: 'eq' },
      { id: 'compressor', params: { threshold: -24, ratio: 3, makeup: 2 } },
      { id: 'pitch', bypassed: true },
      { id: 'drive', bypassed: true },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', bypassed: true },
      { id: 'filter', bypassed: true },
      { id: 'delay', bypassed: true },
      { id: 'reverb', bypassed: true },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'pa-loli',
    name: '萝莉音',
    blurb: '音高 +5 半音，中高频提亮，加一点空间感',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -48, range: -85 } },
      { id: 'eq', params: { g230: -2, g910: 3, g3600: 3, g14000: 1 } },
      { id: 'compressor', params: { threshold: -26, ratio: 4, makeup: 3 } },
      { id: 'pitch', params: { semitones: 5, grain: 70 } },
      { id: 'drive', bypassed: true },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', bypassed: true },
      { id: 'filter', bypassed: true },
      { id: 'delay', params: { time: 180, feedback: 0.25, mix: 0.14 } },
      { id: 'reverb', params: { model: 0, size: 0.8, mix: 0.16 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'pa-robot',
    name: '机器人音',
    blurb: '环形调制 + 比特破碎，金属质感',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -45, range: -80 } },
      { id: 'eq', params: { g60: -4, g230: 2, g910: 4, g3600: 2 } },
      { id: 'compressor', params: { threshold: -28, ratio: 6, makeup: 4 } },
      { id: 'pitch', params: { semitones: 0 }, bypassed: true },
      { id: 'drive', params: { type: 1, drive: 0.35, level: -4 } },
      { id: 'ringmod', params: { freq: 78, depth: 0.85, mix: 0.75 } },
      { id: 'bitcrusher', params: { bits: 6, downsample: 8, mix: 0.5 } },
      { id: 'filter', params: { type: 0, freq: 4200, q: 0.8 } },
      { id: 'delay', bypassed: true },
      { id: 'reverb', params: { model: 2, size: 0.6, mix: 0.1 } },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
  {
    id: 'pa-ethereal',
    name: '空灵音',
    blurb: '+2 半音 + 长混响 + 延迟，仙气飘飘',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50, range: -88 } },
      { id: 'eq', params: { g60: -3, g230: -1, g910: 1, g3600: 4, g14000: 3 } },
      { id: 'compressor', params: { threshold: -30, ratio: 3, makeup: 2 } },
      { id: 'pitch', params: { semitones: 2, grain: 100 } },
      { id: 'drive', bypassed: true },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', bypassed: true },
      { id: 'filter', bypassed: true },
      { id: 'delay', params: { time: 340, feedback: 0.42, mix: 0.28 } },
      { id: 'reverb', params: { model: 1, size: 3, predelay: 40, damp: 0.5, mix: 0.38 } },
      { id: 'limiter', params: { threshold: -4 } },
    ],
  },
  {
    id: 'pa-uncle',
    name: '大叔音',
    blurb: '音高 -5 半音，低频厚重',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -48, range: -85 } },
      { id: 'eq', params: { g60: 6, g230: 3, g910: -2, g3600: -1, g14000: -3 } },
      { id: 'compressor', params: { threshold: -26, ratio: 5, makeup: 3 } },
      { id: 'pitch', params: { semitones: -5, grain: 90 } },
      { id: 'drive', bypassed: true },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', bypassed: true },
      { id: 'filter', bypassed: true },
      { id: 'delay', bypassed: true },
      { id: 'reverb', params: { model: 0, size: 0.7, mix: 0.12 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'pa-phone',
    name: '电话音',
    blurb: '带通 + 轻失真，老旧电话听感',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -45, range: -80 } },
      { id: 'eq', params: { g60: -14, g230: 2, g910: 5, g3600: 3, g14000: -12 } },
      { id: 'compressor', params: { threshold: -30, ratio: 8, makeup: 5 } },
      { id: 'pitch', bypassed: true },
      { id: 'drive', params: { type: 1, drive: 0.25, tone: 0.45, level: -3 } },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', params: { bits: 8, downsample: 3, mix: 0.35 } },
      { id: 'filter', params: { type: 2, freq: 1700, q: 1.4 } },
      { id: 'delay', bypassed: true },
      { id: 'reverb', bypassed: true },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
  {
    id: 'pa-monster',
    name: '怪兽音',
    blurb: '-12 半音 + 重失真 + 低频轰鸣',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -45, range: -80 } },
      { id: 'eq', params: { g60: 8, g230: 4, g910: -3, g3600: 2, g14000: -2 } },
      { id: 'compressor', params: { threshold: -24, ratio: 6, makeup: 3 } },
      { id: 'pitch', params: { semitones: -12, grain: 110 } },
      { id: 'drive', params: { type: 2, drive: 0.65, tone: 0.35, level: -6 } },
      { id: 'ringmod', params: { freq: 42, depth: 0.7, mix: 0.4 } },
      { id: 'bitcrusher', params: { bits: 7, downsample: 5, mix: 0.3 } },
      { id: 'filter', params: { type: 0, freq: 2600, q: 0.7 } },
      { id: 'delay', params: { time: 220, feedback: 0.2, mix: 0.1 } },
      { id: 'reverb', params: { model: 3, size: 1.4, mix: 0.18 } },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
  {
    id: 'pa-speech',
    name: '清晰讲话',
    blurb: '会议 / 讲课扩音，人声明亮不刺耳',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -46, range: -85 } },
      { id: 'eq', params: { g60: -3, g230: -1, g910: 3, g3600: 2, g14000: 1 } },
      { id: 'compressor', params: { threshold: -22, ratio: 4, attack: 5, makeup: 3 } },
      { id: 'pitch', bypassed: true },
      { id: 'drive', bypassed: true },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', bypassed: true },
      { id: 'filter', bypassed: true },
      { id: 'delay', bypassed: true },
      { id: 'reverb', params: { model: 0, size: 0.5, mix: 0.06 } },
      { id: 'limiter', params: { threshold: -4 } },
    ],
  },
  {
    id: 'pa-stage',
    name: '舞台喊话',
    blurb: '大声压、强压缩，带一点混响厚度',
    mode: 'pa',
    blocks: [
      { id: 'noise-gate', params: { threshold: -42, range: -80 } },
      { id: 'eq', params: { g60: 4, g230: 2, g910: 2, g3600: 3, g14000: 2 } },
      { id: 'compressor', params: { threshold: -18, ratio: 8, attack: 2, makeup: 6 } },
      { id: 'pitch', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.18, level: -2 } },
      { id: 'ringmod', bypassed: true },
      { id: 'bitcrusher', bypassed: true },
      { id: 'filter', bypassed: true },
      { id: 'delay', bypassed: true },
      { id: 'reverb', params: { model: 1, size: 1.2, mix: 0.16 } },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 电吉他                                                              */
/* ------------------------------------------------------------------ */

export const GUITAR_PRESETS: ChainPreset[] = [
  {
    id: 'gtr-clean',
    name: '清音晨光',
    blurb: '干净的电子管清音，适合指弹与分解和弦',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -52, range: -95 } },
      { id: 'compressor', params: { threshold: -30, ratio: 3, attack: 8, release: 180, makeup: 3 } },
      { id: 'autowah', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.12, level: -3 } },
      { id: 'amp', params: { model: 0, gain: 0.2, bass: 1, mid: 0, treble: 2, presence: 2, master: -2 } },
      { id: 'cab', params: { model: 0, lowCut: 0.3, air: 0.45, mix: 0.85 } },
      { id: 'eq', params: { g60: -1, g230: -1, g910: 1, g3600: 2, g14000: 2 } },
      { id: 'chorus', params: { rate: 0.9, depth: 0.3, mix: 0.22 } },
      { id: 'delay', params: { time: 280, feedback: 0.22, mix: 0.14 } },
      { id: 'reverb', params: { model: 1, size: 1.6, mix: 0.18 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'gtr-blues',
    name: '布鲁斯过载',
    blurb: '中性过载，推弦有歌唱性',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50, range: -92 } },
      { id: 'compressor', params: { threshold: -26, ratio: 4, attack: 6, makeup: 3 } },
      { id: 'autowah', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.42, tone: 0.55, level: -4 } },
      { id: 'amp', params: { model: 1, gain: 0.45, bass: 1, mid: 1, treble: 2, presence: 2, master: -3 } },
      { id: 'cab', params: { model: 1, lowCut: 0.32, air: 0.4, mix: 0.9 } },
      { id: 'eq', params: { g60: 0, g230: 1, g910: 2, g3600: 1, g14000: 1 } },
      { id: 'chorus', bypassed: true },
      { id: 'delay', params: { time: 320, feedback: 0.18, mix: 0.12 } },
      { id: 'reverb', params: { model: 1, size: 1.4, mix: 0.16 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'gtr-british',
    name: '英式摇滚',
    blurb: 'Plexi 风格，中频突出、有力',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -48, range: -90 } },
      { id: 'compressor', params: { threshold: -24, ratio: 5, attack: 4, makeup: 3 } },
      { id: 'autowah', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.55, tone: 0.6, level: -5 } },
      { id: 'amp', params: { model: 1, gain: 0.62, bass: 2, mid: 3, treble: 3, presence: 3, master: -4 } },
      { id: 'cab', params: { model: 2, lowCut: 0.35, air: 0.35, mix: 0.92 } },
      { id: 'eq', params: { g60: 1, g230: 2, g910: 2, g3600: 2, g14000: 2 } },
      { id: 'chorus', bypassed: true },
      { id: 'delay', params: { time: 380, feedback: 0.24, mix: 0.14 } },
      { id: 'reverb', params: { model: 1, size: 1.5, mix: 0.15 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'gtr-metal',
    name: '高增益金属',
    blurb: '紧实的噪声门 + 高增益，适合速弹',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -44, attack: 0.6, hold: 90, release: 120, range: -110 } },
      { id: 'compressor', params: { threshold: -28, ratio: 6, attack: 2, release: 120, makeup: 4 } },
      { id: 'autowah', bypassed: true },
      { id: 'drive', params: { type: 1, drive: 0.78, tone: 0.5, presence: 2, level: -8 } },
      { id: 'amp', params: { model: 2, gain: 0.85, bass: 3, mid: -2, treble: 4, presence: 5, master: -5 } },
      { id: 'cab', params: { model: 2, lowCut: 0.4, air: 0.3, mix: 0.95 } },
      { id: 'eq', params: { g60: 2, g230: -2, g910: -3, g3600: 2, g14000: 3 } },
      { id: 'chorus', bypassed: true },
      { id: 'delay', params: { time: 420, feedback: 0.2, mix: 0.1 } },
      { id: 'reverb', params: { model: 2, size: 1.1, mix: 0.12 } },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
  {
    id: 'gtr-funk',
    name: '放克净音',
    blurb: '自动哇音 + 压缩，节奏干净有力',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50, range: -92 } },
      { id: 'compressor', params: { threshold: -28, ratio: 6, attack: 3, release: 140, makeup: 4 } },
      { id: 'autowah', params: { sensitivity: 3.5, minFreq: 220, maxFreq: 1900, q: 8, mix: 0.8 } },
      { id: 'drive', params: { type: 0, drive: 0.1, level: -2 } },
      { id: 'amp', params: { model: 0, gain: 0.22, bass: 2, mid: 1, treble: 3, presence: 3, master: -2 } },
      { id: 'cab', params: { model: 1, lowCut: 0.35, air: 0.4, mix: 0.85 } },
      { id: 'eq', params: { g60: -2, g230: 1, g910: 2, g3600: 3, g14000: 2 } },
      { id: 'chorus', bypassed: true },
      { id: 'delay', bypassed: true },
      { id: 'reverb', params: { model: 0, size: 0.6, mix: 0.1 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'gtr-ambient',
    name: '氛围太空',
    blurb: '长延迟 + 大混响 + 八度音',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -54, range: -95 } },
      { id: 'compressor', params: { threshold: -30, ratio: 3, makeup: 2 } },
      { id: 'autowah', bypassed: true },
      { id: 'drive', params: { type: 3, drive: 0.2, level: -4 } },
      { id: 'amp', params: { model: 0, gain: 0.25, master: -3 } },
      { id: 'cab', params: { model: 0, lowCut: 0.28, air: 0.5, mix: 0.8 } },
      { id: 'eq', params: { g60: -2, g230: -1, g910: 0, g3600: 3, g14000: 4 } },
      { id: 'chorus', params: { rate: 0.5, depth: 0.6, mix: 0.4 } },
      { id: 'delay', params: { time: 620, feedback: 0.55, tone: 0.4, mix: 0.4 } },
      { id: 'reverb', params: { model: 3, size: 3.6, predelay: 60, damp: 0.45, mix: 0.5 } },
      { id: 'limiter', params: { threshold: -4 } },
    ],
  },
  {
    id: 'gtr-bedroom',
    name: '卧室练习',
    blurb: '小音量、耳机友好，夜里练琴不扰民',
    mode: 'guitar',
    blocks: [
      { id: 'noise-gate', params: { threshold: -52, range: -95 } },
      { id: 'compressor', params: { threshold: -30, ratio: 4, makeup: 2 } },
      { id: 'autowah', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.3, level: -6 } },
      { id: 'amp', params: { model: 1, gain: 0.4, master: -8 } },
      { id: 'cab', params: { model: 0, lowCut: 0.4, air: 0.35, mix: 0.75 } },
      { id: 'eq', params: { g60: -3, g230: -1, g910: 1, g3600: 2, g14000: 1 } },
      { id: 'chorus', bypassed: true },
      { id: 'delay', params: { time: 250, feedback: 0.15, mix: 0.1 } },
      { id: 'reverb', params: { model: 0, size: 0.8, mix: 0.1 } },
      { id: 'limiter', params: { threshold: -4 } },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 贝斯                                                               */
/* ------------------------------------------------------------------ */

export const BASS_PRESETS: ChainPreset[] = [
  {
    id: 'bass-finger',
    name: '指弹',
    blurb: '圆润饱满，适合 fingerstyle',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50, range: -92 } },
      { id: 'compressor', params: { threshold: -30, ratio: 4, attack: 12, release: 220, makeup: 4 } },
      { id: 'filter', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.14, tone: 0.35, level: -3 } },
      { id: 'amp', params: { model: 3, gain: 0.3, bass: 3, mid: 0, treble: 1, presence: 1, master: -2 } },
      { id: 'cab', params: { model: 3, lowCut: 0.25, air: 0.25, mix: 0.85 } },
      { id: 'eq', params: { g60: 3, g230: 1, g910: 0, g3600: 1, g14000: 0 } },
      { id: 'octaver', bypassed: true },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'bass-pick',
    name: '拨片',
    blurb: '有攻击力，适合 Plectrum 演奏',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -48, range: -90 } },
      { id: 'compressor', params: { threshold: -26, ratio: 6, attack: 6, release: 160, makeup: 5 } },
      { id: 'filter', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.3, tone: 0.45, level: -4 } },
      { id: 'amp', params: { model: 3, gain: 0.45, bass: 2, mid: 1, treble: 3, presence: 3, master: -3 } },
      { id: 'cab', params: { model: 3, lowCut: 0.28, air: 0.3, mix: 0.88 } },
      { id: 'eq', params: { g60: 2, g230: 1, g910: 1, g3600: 3, g14000: 1 } },
      { id: 'octaver', bypassed: true },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'bass-slap',
    name: '拍弦 Slap',
    blurb: '强压缩 + 提亮， slap 音头清晰',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -46, range: -90 } },
      { id: 'compressor', params: { threshold: -24, ratio: 10, attack: 2, release: 120, makeup: 6 } },
      { id: 'filter', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.22, tone: 0.6, level: -4 } },
      { id: 'amp', params: { model: 3, gain: 0.4, bass: 1, mid: 2, treble: 4, presence: 4, master: -3 } },
      { id: 'cab', params: { model: 3, lowCut: 0.32, air: 0.35, mix: 0.85 } },
      { id: 'eq', params: { g60: -1, g230: 1, g910: 2, g3600: 4, g14000: 2 } },
      { id: 'octaver', bypassed: true },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
  {
    id: 'bass-fuzz',
    name: '法兹',
    blurb: '经典 fuzz，粗野有颗粒感',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -46, range: -90 } },
      { id: 'compressor', params: { threshold: -28, ratio: 5, makeup: 4 } },
      { id: 'filter', params: { type: 0, freq: 3200, q: 0.7 } },
      { id: 'drive', params: { type: 2, drive: 0.7, tone: 0.4, level: -8 } },
      { id: 'amp', params: { model: 3, gain: 0.7, bass: 3, mid: 1, treble: 2, presence: 2, master: -5 } },
      { id: 'cab', params: { model: 3, lowCut: 0.3, air: 0.3, mix: 0.9 } },
      { id: 'eq', params: { g60: 3, g230: 1, g910: 0, g3600: 2, g14000: 1 } },
      { id: 'octaver', params: { octave: -1, dry: 0.85, wet: 0.35 } },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -2 } },
    ],
  },
  {
    id: 'bass-tube',
    name: '复古电子管',
    blurb: '温暖略糊的电子管音色',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50, range: -92 } },
      { id: 'compressor', params: { threshold: -30, ratio: 3, attack: 15, release: 250, makeup: 3 } },
      { id: 'filter', bypassed: true },
      { id: 'drive', params: { type: 3, drive: 0.25, tone: 0.3, level: -3 } },
      { id: 'amp', params: { model: 4, gain: 0.35, bass: 2, mid: -1, treble: 1, presence: 0, master: -2 } },
      { id: 'cab', params: { model: 3, lowCut: 0.22, air: 0.2, mix: 0.82 } },
      { id: 'eq', params: { g60: 2, g230: 1, g910: -1, g3600: 1, g14000: -1 } },
      { id: 'octaver', bypassed: true },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'bass-di',
    name: '纯净 DI',
    blurb: '不走箱体，直接进调音台的声音',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -52, range: -95 } },
      { id: 'compressor', params: { threshold: -28, ratio: 4, attack: 10, makeup: 4 } },
      { id: 'filter', params: { type: 1, freq: 35, q: 0.7 }, bypassed: true },
      { id: 'drive', bypassed: true },
      { id: 'amp', bypassed: true },
      { id: 'cab', params: { model: 4, lowCut: 0.2, air: 0.15, mix: 0.4 } },
      { id: 'eq', params: { g60: 2, g230: 0, g910: 1, g3600: 1, g14000: 0 } },
      { id: 'octaver', bypassed: true },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -4 } },
    ],
  },
  {
    id: 'bass-bedroom',
    name: '卧室练习',
    blurb: '小音量、耳机友好',
    mode: 'bass',
    blocks: [
      { id: 'noise-gate', params: { threshold: -52, range: -95 } },
      { id: 'compressor', params: { threshold: -30, ratio: 4, makeup: 3 } },
      { id: 'filter', bypassed: true },
      { id: 'drive', params: { type: 0, drive: 0.18, level: -5 } },
      { id: 'amp', params: { model: 3, gain: 0.35, master: -8 } },
      { id: 'cab', params: { model: 3, lowCut: 0.3, air: 0.25, mix: 0.8 } },
      { id: 'eq', params: { g60: -2, g230: 0, g910: 1, g3600: 1, g14000: 0 } },
      { id: 'octaver', bypassed: true },
      { id: 'chorus', bypassed: true },
      { id: 'limiter', params: { threshold: -4 } },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 效果器架（自由链路）预设                                            */
/* ------------------------------------------------------------------ */

export const FX_PRESETS: ChainPreset[] = [
  {
    id: 'fx-starter',
    name: '基础链路',
    blurb: '噪声门 → 均衡 → 失真 → 延迟 → 混响，最常用的骨架',
    mode: 'fx',
    blocks: [
      { id: 'noise-gate', params: { threshold: -48 } },
      { id: 'eq' },
      { id: 'drive', params: { type: 0, drive: 0.35 } },
      { id: 'delay', params: { mix: 0.2 } },
      { id: 'reverb', params: { mix: 0.18 } },
      { id: 'limiter' },
    ],
  },
  {
    id: 'fx-lofi',
    name: 'Lo-Fi 磁带',
    blurb: '比特破碎 + 滤波 + 短混响，复古低保真',
    mode: 'fx',
    blocks: [
      { id: 'noise-gate', params: { threshold: -50 } },
      { id: 'bitcrusher', params: { bits: 10, downsample: 3, mix: 0.55 } },
      { id: 'filter', params: { type: 0, freq: 2600, q: 0.8 } },
      { id: 'eq', params: { g60: 3, g230: 1, g910: -2, g3600: -1, g14000: -4 } },
      { id: 'chorus', params: { rate: 0.7, depth: 0.35, mix: 0.3 } },
      { id: 'reverb', params: { model: 2, size: 0.9, damp: 0.7, mix: 0.22 } },
      { id: 'limiter' },
    ],
  },
  {
    id: 'fx-space',
    name: '宇宙 Pad',
    blurb: '合唱 + 移相 + 长延迟，铺底的太空感',
    mode: 'fx',
    blocks: [
      { id: 'noise-gate', params: { threshold: -55 } },
      { id: 'chorus', params: { rate: 0.35, depth: 0.7, voices: 3, spread: 0.8, mix: 0.5 } },
      { id: 'phaser', params: { rate: 0.2, depth: 0.8, stages: 8, feedback: 0.5, mix: 0.45 } },
      { id: 'delay', params: { time: 700, feedback: 0.6, mix: 0.45 } },
      { id: 'reverb', params: { model: 3, size: 4, damp: 0.5, mix: 0.55 } },
      { id: 'limiter', params: { threshold: -5 } },
    ],
  },
  {
    id: 'fx-vocal',
    name: '人声后期',
    blurb: '压缩 + 均衡 + 去齿音倾向的滤波，适合直播',
    mode: 'fx',
    blocks: [
      { id: 'noise-gate', params: { threshold: -46 } },
      { id: 'filter', params: { type: 1, freq: 90, q: 0.7 } },
      { id: 'compressor', params: { threshold: -22, ratio: 4, makeup: 3 } },
      { id: 'eq', params: { g60: -3, g230: -1, g910: 2, g3600: 3, g14000: 1 } },
      { id: 'reverb', params: { model: 0, size: 0.9, mix: 0.14 } },
      { id: 'limiter', params: { threshold: -3 } },
    ],
  },
  {
    id: 'fx-wah',
    name: '哇音节奏',
    blurb: '自动哇音 + 颤音 + 延迟，节奏感强',
    mode: 'fx',
    blocks: [
      { id: 'noise-gate', params: { threshold: -48 } },
      { id: 'autowah', params: { sensitivity: 3, minFreq: 200, maxFreq: 2000, q: 7 } },
      { id: 'drive', params: { type: 0, drive: 0.4 } },
      { id: 'tremolo', params: { rate: 4.5, depth: 0.4, mix: 0.8 } },
      { id: 'delay', params: { time: 260, feedback: 0.3, mix: 0.2 } },
      { id: 'reverb', params: { model: 1, size: 1.2, mix: 0.16 } },
      { id: 'limiter' },
    ],
  },
];

export function presetsForMode(mode: ModeId): ChainPreset[] {
  if (mode === 'pa') return PA_PRESETS;
  if (mode === 'guitar') return GUITAR_PRESETS;
  if (mode === 'bass') return BASS_PRESETS;
  return FX_PRESETS;
}
