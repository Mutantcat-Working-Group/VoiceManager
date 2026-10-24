/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/** 全局节拍（BPM），供节拍器、延迟同步等模块共享 */
let tempo = 120;

export function setTempo(bpm: number): void {
  tempo = Math.max(20, Math.min(300, bpm));
}

export function getTempo(): number {
  return tempo;
}

const DIVISIONS = [
  { label: '1/1', beats: 4 },
  { label: '1/2', beats: 2 },
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/8T', beats: 1 / 3 },
  { label: '1/16', beats: 0.25 },
];

export function noteToMs(division: number): number {
  return (60 / getTempo()) * 1000 * DIVISIONS[division].beats;
}

export const DELAY_DIVISIONS = DIVISIONS;
