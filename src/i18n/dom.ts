/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 *
 * 静态文案的抓取与重译
 * ---------------------------------------------------------------------------
 * 界面里有大量「模块加载时赋值一次」的静态文案（title、aria-label、
 * textContent），它们不在任何 render 函数里，切语言时不会自己更新。
 * 逐个改成 render 调用改动面太大，所以改成：
 *
 *   1. 界面建好后 captureStaticText() 把所有含中文的静态文案连同原文记下来
 *   2. 切语言时 retranslateStaticText() 按原文重新取译文
 *
 * 只重译「自上次以来没被动态改过」的节点：如果某个节点的当前值和上次我们写入的
 * 值不一致，说明它被 render 函数接管了（例如状态行、表头读数），就跳过它，
 * 免得把动态内容覆盖回静态文案。动态内容本身走 renderAll() 里的 t()。
 */
import { t } from './index';

interface Snap {
  text?: string;
  title?: string;
  aria?: string;
}

const snaps = new WeakMap<Element, Snap>();

function hasCJK(s: string | null | undefined): boolean {
  return !!s && /[一-龥]/.test(s);
}

/** 记录当前文档里所有静态中文文案 */
export function captureStaticText(root: ParentNode = document): void {
  const walk = (node: ParentNode): void => {
    for (const el of Array.from(node.children)) {
      const snap: Snap = {};
      const text = el.textContent;
      // 只在叶子节点上记 textContent，否则会把后代的中文一起算进来
      if (!el.children.length && hasCJK(text)) snap.text = text ?? '';
      if (hasCJK(el.getAttribute('title'))) snap.title = el.getAttribute('title') ?? '';
      if (hasCJK(el.getAttribute('aria-label'))) snap.aria = el.getAttribute('aria-label') ?? '';
      if (snap.text !== undefined || snap.title !== undefined || snap.aria !== undefined) {
        snaps.set(el, snap);
      }
      walk(el);
    }
  };
  walk(root);
}

/** 切语言后按原文重译静态文案 */
export function retranslateStaticText(root: ParentNode = document): void {
  const walk = (node: ParentNode): void => {
    for (const el of Array.from(node.children)) {
      const snap = snaps.get(el);
      if (snap) {
        if (snap.text !== undefined && el.textContent === snap.text) {
          const next = t(snap.text);
          el.textContent = next;
          snap.text = next;
        }
        if (snap.title !== undefined && el.getAttribute('title') === snap.title) {
          const next = t(snap.title);
          el.setAttribute('title', next);
          snap.title = next;
        }
        if (snap.aria !== undefined && el.getAttribute('aria-label') === snap.aria) {
          const next = t(snap.aria);
          el.setAttribute('aria-label', next);
          snap.aria = next;
        }
      }
      walk(el);
    }
  };
  walk(root);
}

/**
 * 单条静态文案的便捷入口：立即按当前语言设置，并登记以便切语言时更新。
 * 适合模块加载时就要写好的文案。
 */
export function bindText(
  el: Element,
  attr: 'textContent' | 'title' | 'aria-label',
  key: string,
): void {
  const value = t(key);
  if (attr === 'textContent') el.textContent = value;
  else el.setAttribute(attr, value);
  const snap = snaps.get(el) ?? {};
  if (attr === 'textContent') snap.text = key;
  else if (attr === 'title') snap.title = key;
  else snap.aria = key;
  snaps.set(el, snap);
}
