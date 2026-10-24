/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/** 极简响应式状态容器 + localStorage 持久化 */

export interface StoreApi<T> {
  getState(): T;
  setState(updater: T | ((prev: T) => T)): void;
  subscribe(fn: (state: T) => void): () => void;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 用 defaults 补齐缺失字段（浅合并到第二层，足够覆盖本应用的状态结构） */
export function hydrate<T>(saved: unknown, defaults: T): T {
  if (!isPlainObject(saved)) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) continue;
    const d = out[k];
    if (isPlainObject(v) && isPlainObject(d)) out[k] = hydrate(v, d);
    else out[k] = v;
  }
  return out as T;
}

export function createStore<T extends object>(initial: T, persistKey?: string): StoreApi<T> {
  let state = initial;
  const listeners = new Set<(s: T) => void>();

  if (persistKey && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) state = hydrate(JSON.parse(raw) as unknown, initial);
    } catch {
      /* 忽略损坏的本地数据 */
    }
  }

  let saveTimer: number | null = null;
  const persist = () => {
    if (!persistKey || typeof localStorage === 'undefined') return;
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify(state));
      } catch {
        /* 隐私模式等场景下忽略 */
      }
    }, 250) as unknown as number;
  };

  return {
    getState: () => state,
    setState(updater) {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(state) : updater;
      if (next === state) return;
      state = next;
      persist();
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
