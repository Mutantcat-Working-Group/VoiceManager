/**
 * 信号链构建器 —— 按 FxBlockState 顺序实例化并连接效果器。
 * 效果链可随时整体重建（增删、排序），参数变化走 setParam 热更新。
 */

import { getFxSpec, defaultParams } from './fx';
import type { FxInstance } from './fx/types';
import type { FxBlockState } from '../types';

let uidCounter = 0;

export function newBlockUid(): string {
  uidCounter += 1;
  return `b${uidCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function makeBlock(id: string, params?: Record<string, number>, bypassed = false): FxBlockState {
  const spec = getFxSpec(id);
  if (!spec) throw new Error(`未知效果器: ${id}`);
  return {
    uid: newBlockUid(),
    id,
    params: { ...defaultParams(spec), ...(params ?? {}) },
    bypassed,
  };
}

export class SignalChain {
  private instances: FxInstance[] = [];
  private blocks: FxBlockState[] = [];
  private byUid = new Map<string, FxInstance>();
  private inNode: AudioNode;
  private outNode: AudioNode;
  private ctx: AudioContext;

  constructor(ctx: AudioContext, inNode: AudioNode, outNode: AudioNode) {
    this.ctx = ctx;
    this.inNode = inNode;
    this.outNode = outNode;
  }

  get currentBlocks(): readonly FxBlockState[] {
    return this.blocks;
  }

  getInstances(): readonly FxInstance[] {
    return this.instances;
  }

  instanceOf(uid: string): FxInstance | undefined {
    return this.byUid.get(uid);
  }

  /** 整体重建效果链 */
  build(blocks: FxBlockState[]): void {
    this.dispose();
    this.blocks = blocks.map((b) => ({ ...b, params: { ...b.params } }));

    let prev: AudioNode = this.inNode;
    for (const block of this.blocks) {
      const spec = getFxSpec(block.id);
      if (!spec) continue;
      let inst: FxInstance;
      try {
        // 合并默认参数：即使调用方漏传，也保证所有 AudioParam 都是有限数值
        inst = spec.create(this.ctx, { ...defaultParams(spec), ...block.params });
      } catch (err) {
        console.warn(`[VoiceManager] 效果器 ${block.id} 创建失败，已跳过`, err);
        continue;
      }
      inst.setBypassed(block.bypassed);
      prev.connect(inst.input);
      prev = inst.output;
      this.instances.push(inst);
      this.byUid.set(block.uid, inst);
    }
    prev.connect(this.outNode);
  }

  setParam(uid: string, key: string, value: number): void {
    this.byUid.get(uid)?.setParam(key, value);
  }

  setBypassed(uid: string, bypassed: boolean): void {
    this.byUid.get(uid)?.setBypassed(bypassed);
  }

  dispose(): void {
    for (const inst of this.instances) inst.dispose?.();
    this.instances = [];
    this.byUid.clear();
    try {
      this.inNode.disconnect();
    } catch {
      /* noop */
    }
  }
}
