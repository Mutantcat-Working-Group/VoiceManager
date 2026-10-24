/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 比特破碎 (Bit Crusher) — AudioWorklet
 * 降低位深 + 采样率保持，制造 Lo-fi / 8-bit 音色。
 */

class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioWorkletProcessorParameterDescriptor[] {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 4, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
    ];
  }

  private held = 0;
  private counter = 0;

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    params: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const out = output[0];

    if (!input || input.length === 0) {
      out.fill(0);
      return true;
    }

    const src = input[0];
    const bits = Math.round(params.bits[0]);
    const ds = Math.max(1, Math.round(params.downsample[0]));
    const levels = Math.pow(2, bits) - 1;

    for (let i = 0; i < out.length; i++) {
      if (this.counter <= 0) {
        this.counter = ds;
        this.held = Math.round(src[i] * levels) / levels;
      }
      this.counter--;
      out[i] = this.held;
      for (let c = 1; c < output.length; c++) output[c][i] = this.held;
    }
    return true;
  }
}

registerProcessor('bit-crusher', BitCrusherProcessor);
