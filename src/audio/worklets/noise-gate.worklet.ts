/**
 * 噪声门 (Noise Gate) — AudioWorklet
 * ---------------------------------------------------------------------------
 * 峰值包络检波 + 开启/保持/关闭 三态状态机，等值平滑增益避免咔哒声。
 * 参数（k-rate）：
 *   threshold  开门阈值 dB
 *   attack     开启时间 s
 *   hold       保持时间 s
 *   release    关闭时间 s
 *   range      关闭时的地板增益 dB（-120 = 完全静音硬门）
 *   hysteresis 关门回差 dB
 *   makeup     输出补偿 dB
 */

const dbToGain = (db: number): number => Math.pow(10, db / 20);

class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioWorkletProcessorParameterDescriptor[] {
    return [
      { name: 'threshold', defaultValue: -45, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 0.002, minValue: 0.0002, maxValue: 0.1, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 0.15, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.25, minValue: 0.01, maxValue: 2, automationRate: 'k-rate' },
      { name: 'range', defaultValue: -80, minValue: -120, maxValue: 0, automationRate: 'k-rate' },
      { name: 'hysteresis', defaultValue: 4, minValue: 0, maxValue: 24, automationRate: 'k-rate' },
      { name: 'makeup', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
    ];
  }

  private env = 0;
  private gain = 0;
  private open = false;
  private holdCounter = 0;
  private reported: boolean | null = null;

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
      for (let c = 1; c < output.length; c++) output[c].fill(0);
      return true;
    }

    const src = input[0];
    const threshold = params.threshold[0];
    const attack = params.attack[0];
    const hold = params.hold[0];
    const release = params.release[0];
    const range = params.range[0];
    const hyst = params.hysteresis[0];
    const makeup = params.makeup[0];

    const openGain = dbToGain(makeup);
    const closedGain = dbToGain(range + makeup);
    const openThresh = dbToGain(threshold);
    const closeThresh = dbToGain(threshold - hyst);
    // 时间常数取标称值的 1/5：保证在标注的 attack/release 时间内衰减 99% 以上
    const openCoef = Math.exp(-5 / Math.max(attack * sampleRate, 1));
    const closeCoef = Math.exp(-5 / Math.max(release * sampleRate, 1));
    const holdSamples = Math.round(hold * sampleRate);
    const envDecay = Math.exp(-1 / (0.06 * sampleRate)); // 60ms 包络衰减
    const n = out.length;

    for (let i = 0; i < n; i++) {
      const x = src[i];
      const a = Math.abs(x);
      this.env = a > this.env ? a : this.env * envDecay;

      if (!this.open) {
        if (this.env > openThresh) {
          this.open = true;
          this.holdCounter = holdSamples;
        }
      } else if (this.env < closeThresh) {
        if (this.holdCounter <= 0) this.open = false;
        else this.holdCounter--;
      } else {
        this.holdCounter = holdSamples;
      }

      const target = this.open ? openGain : closedGain;
      const coef = target > this.gain ? openCoef : closeCoef;
      this.gain += (target - this.gain) * (1 - coef);

      const y = x * this.gain;
      out[i] = y;
      for (let c = 1; c < output.length; c++) {
        const ch = input[c];
        output[c][i] = ch ? ch[i] * this.gain : y;
      }
    }

    if (this.open !== this.reported) {
      this.reported = this.open;
      this.port.postMessage({ type: 'state', open: this.open });
    }
    return true;
  }
}

registerProcessor('noise-gate', NoiseGateProcessor);
