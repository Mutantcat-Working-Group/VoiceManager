/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 *
 * 效果器 / 预设数据的多语言访问器
 * ---------------------------------------------------------------------------
 * FxSpec 与预设都是模块级的常量对象，里面存的是简体中文。如果在定义处直接包
 * t()，值就会在模块加载时被冻住，切语言后不会变。所以一律在使用点取译文：
 *
 *   fxName(spec)          → 效果器名
 *   fxBlurb(spec)         → 一句话简介
 *   fxParamLabel(p)       → 参数名
 *   fxParamHelp(p)        → 参数说明
 *   fxOptionLabel(o)      → 离散选项名
 *   fxCategoryLabel(cat)  → 分类名
 *   fxParamFormat(p, v)   → 参数值显示（含「半音」这类需要翻译的单位词）
 *   presetName(p) / presetDesc(p)
 */
import type { FxOption, FxParamSpec, FxSpec, FxCategory } from '../audio/fx/types';
import type { ChainPreset } from '../audio/presets';
import { t } from './index';

export const FX_CATEGORY_LABEL: Record<FxCategory, string> = {
  dynamics: '动态',
  filter: '滤波',
  drive: '失真',
  amp: '音箱',
  modulation: '调制',
  time: '空间',
  pitch: '音高',
  utility: '工具',
};

export const fxCategoryLabel = (c: FxCategory): string => t(FX_CATEGORY_LABEL[c]);
export const fxName = (spec: FxSpec): string => t(spec.name);
export const fxBlurb = (spec: FxSpec): string => t(spec.blurb);
export const fxParamLabel = (p: FxParamSpec): string => t(p.label);
export const fxParamHelp = (p: FxParamSpec): string | undefined => (p.help ? t(p.help) : undefined);
export const fxOptionLabel = (o: FxOption): string => t(o.label);
export const fxParamFormat = (p: FxParamSpec, v: number): string =>
  p.format ? t(p.format(v)) : String(v);

export const presetName = (p: ChainPreset): string => t(p.name);
export const presetBlurb = (p: ChainPreset): string => t(p.blurb);
