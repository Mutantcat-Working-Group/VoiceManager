/**
 * 变调 (Granular Pitch Shifter) — AudioWorklet
 * ---------------------------------------------------------------------------
 * 双颗粒交叉淡变：环形缓冲 + Hann 窗，两个相距半个颗粒长度的读指针
 * 以 ratio = 2^(semitones/12) 的速度推进，实现无抖动的实时变调。
 */

const MAX_BUFFER = 2 * 48000; // 2 秒环形缓冲

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioWorkletProcessorParameterDescriptor[] {
    return [
      { name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
      { name: 'grain', defaultValue: 0.08, minValue: 0.02, maxValue: 0.25, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 0.85, automationRate: 'k-rate' },
    ];
  }

  private buf = new Float32Array(MAX_BUFFER);
  private w = 0;
  private readA = 0;
  private readB = 0;

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
    const pitch = params.pitch[0];
    const grain = params.grain[0];
    const feedback = params.feedback[0];
    const ratio = Math.pow(2, pitch / 12);
    const n = Math.min(Math.round(grain * sampleRate), MAX_BUFFER - 1);
    const n2 = n / 2;
    const inv = 1 / n;

    for (let i = 0; i < out.length; i++) {
      const x = src[i];
      const idxA = ((this.readA % MAX_BUFFER) + MAX_BUFFER) % MAX_BUFFER;
      const idxB = ((this.readB % MAX_BUFFER) + MAX_BUFFER) % MAX_BUFFER;
      const a = this.buf[idxA | 0];
      const b = this.buf[idxB | 0];

      const dA = ((this.w - this.readA) % n + n) % n;
      const dB = ((dA - n2) % n + n) % n;
      const wA = 0.5 * (1 - Math.cos(2 * Math.PI * dA * inv));
      const wB = 0.5 * (1 - Math.cos(2 * Math.PI * dB * inv));

      const y = wA * a + wB * b;

      this.buf[this.w % MAX_BUFFER] = x + y * feedback;
      this.w++;
      this.readA += ratio;
      this.readB += ratio;

      out[i] = y;
      for (let c = 1; c < output.length; c++) output[c][i] = y;
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor);
