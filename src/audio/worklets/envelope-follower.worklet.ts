/**
 * 包络跟随 (Envelope Follower) — AudioWorklet
 * 输出音频速率的控制信号 (0..1)，可直接接入 BiquadFilter.frequency 等
 * AudioParam，用于自动哇音 / 动态滤波。
 */

class EnvelopeFollowerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioWorkletProcessorParameterDescriptor[] {
    return [
      { name: 'attack', defaultValue: 0.005, minValue: 0.0005, maxValue: 0.2, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.12, minValue: 0.005, maxValue: 1, automationRate: 'k-rate' },
      { name: 'sensitivity', defaultValue: 1, minValue: 0.1, maxValue: 8, automationRate: 'k-rate' },
      { name: 'floor', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  private env = 0;

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
    const attack = params.attack[0];
    const release = params.release[0];
    const sens = params.sensitivity[0];
    const floor = params.floor[0];
    const atkCoef = Math.exp(-1 / Math.max(attack * sampleRate, 1));
    const relCoef = Math.exp(-1 / Math.max(release * sampleRate, 1));

    for (let i = 0; i < out.length; i++) {
      const a = Math.abs(src[i]) * sens;
      const coef = a > this.env ? atkCoef : relCoef;
      this.env = a + (this.env - a) * coef;
      const v = Math.min(1, floor + this.env * (1 - floor));
      out[i] = v;
      for (let c = 1; c < output.length; c++) output[c][i] = v;
    }
    return true;
  }
}

registerProcessor('envelope-follower', EnvelopeFollowerProcessor);
