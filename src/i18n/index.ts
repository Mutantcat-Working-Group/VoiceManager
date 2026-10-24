/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 *
 * 多语言核心
 * ---------------------------------------------------------------------------
 * 采用「中文即键」（keyless i18n）：词典的键就是简体中文原文，未收录的键
 * 原样返回。这样有两点好处：
 *   1. 不用给几百条文案编一套 ID，改动最小；
 *   2. 简体中文永远是完整可用的，缺译时优雅退化为原文而不是显示键名。
 *
 * 插值用 `{name}` 占位符，见 t() 的 params 参数。
 */

export type Locale = 'zh-CN' | 'en' | 'ja' | 'fr' | 'de' | 'es' | 'pt-BR' | 'ru' | 'ko';

export interface LocaleMeta {
  id: Locale;
  /** 该语言自己的写法，例如「Français」——语言选择器里显示这个 */
  native: string;
  /** 英文名，次要显示 */
  english: string;
  /** 对应的 BCP-47 lang 属性，用于 <html lang> */
  langAttr: string;
}

/** 语言列表：顺序即选择器里的顺序，简体中文置首（源语言） */
export const LOCALES: readonly LocaleMeta[] = [
  { id: 'zh-CN', native: '简体中文', english: 'Simplified Chinese', langAttr: 'zh-CN' },
  { id: 'en', native: 'English', english: 'English', langAttr: 'en' },
  { id: 'ja', native: '日本語', english: 'Japanese', langAttr: 'ja' },
  { id: 'fr', native: 'Français', english: 'French', langAttr: 'fr' },
  { id: 'de', native: 'Deutsch', english: 'German', langAttr: 'de' },
  { id: 'es', native: 'Español', english: 'Spanish', langAttr: 'es' },
  { id: 'pt-BR', native: 'Português', english: 'Portuguese (Brazil)', langAttr: 'pt-BR' },
  { id: 'ru', native: 'Русский', english: 'Russian', langAttr: 'ru' },
  { id: 'ko', native: '한국어', english: 'Korean', langAttr: 'ko' },
] as const;

const LOCALE_IDS = new Set<string>(LOCALES.map((l) => l.id));

/** localStorage 键。与业务存档（voicemanager:v2）分开，互不干扰 */
const STORAGE_KEY = 'voicemanager:locale';

/* ------------------------------- 词典导入 ------------------------------- */

import { en } from './locales/en';
import { ja } from './locales/ja';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { es } from './locales/es';
import { ptBR } from './locales/pt-BR';
import { ru } from './locales/ru';
import { ko } from './locales/ko';

export type Dict = Record<string, string>;

/** zh-CN 不需要词典：键本身就是中文 */
const DICTS: Record<Locale, Dict> = {
  'zh-CN': {},
  en,
  ja,
  fr,
  de,
  es,
  'pt-BR': ptBR,
  ru,
  ko,
};

/* -------------------------------- 当前语言 -------------------------------- */

let current: Locale = 'zh-CN';
const listeners = new Set<() => void>();

/** 把 `{name}` 占位符替换成 params 里的值 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{([\w/]+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * 取当前语言下的文案。未收录时返回 key 本身（简体中文原文）。
 * @param key 简体中文原文，可含 `{name}` 占位符
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current];
  const hit = current === 'zh-CN' ? key : dict[key];
  return interpolate(hit === undefined ? key : hit, params);
}

export function getLocale(): Locale {
  return current;
}

export function localeMeta(l: Locale = current): LocaleMeta {
  return LOCALES.find((x) => x.id === l) ?? LOCALES[0];
}

/** 某语言已收录的文案条数，供「翻译进度」类 UI 使用 */
export function coverage(l: Locale): { done: number; total: number } {
  const total = Object.keys(DICTS.en).length;
  return { done: Object.keys(DICTS[l]).length, total: total || 1 };
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 切换语言：持久化、同步 <html lang>、通知所有订阅者重绘 */
export function setLocale(l: Locale): void {
  if (!LOCALE_IDS.has(l) || l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* 隐私模式下忽略 */
  }
  document.documentElement.lang = localeMeta(l).langAttr;
  for (const fn of listeners) fn();
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && LOCALE_IDS.has(v);
}

/**
 * 把浏览器语言标签匹配到受支持的语言。
 * 依次尝试：精确匹配 → 主语言匹配 → 特殊回退。
 */
export function matchLocale(tag: string): Locale | null {
  if (!tag) return null;
  const norm = tag.toLowerCase().replace('_', '-');
  for (const m of LOCALES) if (m.id.toLowerCase() === norm) return m.id;
  const base = norm.split('-')[0];
  for (const m of LOCALES) if (m.id.toLowerCase().split('-')[0] === base) return m.id;
  /* 已知的方言回退 */
  if (base === 'zh') return 'zh-CN'; // zh-TW / zh-HK / zh-MO 都先用简体中文
  if (base === 'pt') return 'pt-BR';
  return null;
}

/**
 * 首次打开时的默认语言：
 *   1. 上次手动选过的（localStorage）优先
 *   2. 否则按 navigator.languages 逐个匹配
 *   3. 都不中就简体中文
 */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* noop */
  }
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav) {
    const list: string[] =
      Array.isArray(nav.languages) && nav.languages.length
        ? nav.languages
        : nav.language
          ? [nav.language]
          : [];
    for (const tag of list) {
      const hit = matchLocale(tag);
      if (hit) return hit;
    }
  }
  return 'zh-CN';
}

/** 在应用启动早期调用一次：定好语言并同步 <html lang> */
export function initI18n(): Locale {
  current = detectLocale();
  document.documentElement.lang = localeMeta(current).langAttr;
  return current;
}
