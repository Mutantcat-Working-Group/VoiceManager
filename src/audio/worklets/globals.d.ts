/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * AudioWorklet 全局作用域类型声明。
 * worklet 文件被 Vite 以 classic script 打包后由 ctx.audioWorklet.addModule() 加载，
 * 运行在 AudioWorkletGlobalScope 中，DOM 的 lib.dom 不包含这些全局。
 */

interface AudioWorkletProcessorParameterDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: 'a-rate' | 'k-rate';
}

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    params: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  ctor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

/** AudioWorkletGlobalScope 全局：当前渲染量子对应的采样率 */
declare const sampleRate: number;

/** AudioWorkletGlobalScope 全局：当前渲染量子的帧数（固定 128） */
declare const currentFrame: number;

/** AudioWorkletGlobalScope 全局：当前时间（秒） */
declare const currentTime: number;
