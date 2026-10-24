/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
/**
 * 信号链视图 —— 输入 -> 各级效果器 -> 输出，带插头/线缆/旁通灯。
 */

import { createLed, el } from './components';
import { t } from '../i18n';

export interface ChainBlockView {
  uid: string;
  id: string;
  name: string;
  code: string;
  bypassed: boolean;
  active: boolean;
  status: string;
}

export interface ChainHandlers {
  onSelect(uid: string): void;
  onToggleBypass(uid: string): void;
  onAdd?(): void;
  canAdd?: boolean;
  /** 拖拽排序：把 fromUid 移到 toUid 之前/之后 */
  onReorder?(fromUid: string, toUid: string, before: boolean): void;
  /** 触屏排序：HTML5 拖放在触摸设备上不生效，用上下按钮代替 */
  onMove?(uid: string, dir: -1 | 1): void;
  /** 从效果器仓库拖入：在 index 处插入新效果器 */
  onInsertFx?(fxId: string, index: number): void;
}

export interface ChainViewHandle {
  el: HTMLElement;
  update(blocks: ChainBlockView[], live: boolean): void;
}

interface Entry {
  box: HTMLElement;
  led: ReturnType<typeof createLed>;
  name: HTMLElement;
  status: HTMLElement;
}

/** 拖拽数据里用来区分"仓库新效果器"和"链上既有模块"的自定义类型 */
export const FX_DRAG_TYPE = 'application/x-voicemanager-fx';

export function createChainView(handlers: ChainHandlers): ChainViewHandle {
  const root = el('div', 'chain-track');
  const built = new Map<string, Entry>();
  let dragUid: string | null = null;

  const clearDropMarks = () => {
    root.querySelectorAll<HTMLElement>('.stompbox[data-drop]').forEach((n) => {
      delete n.dataset.drop;
    });
  };

  const makeJack = (label: string): HTMLElement => {
    const wrap = el('div', 'chain-io');
    const j = el('div', 'chain-jack');
    wrap.appendChild(j);
    const t = el('div', 'silk');
    t.textContent = label;
    wrap.appendChild(t);
    return wrap;
  };

  const makeBox = (b: ChainBlockView): Entry => {
    const box = el('button', 'stompbox', {
      type: 'button',
      'data-uid': b.uid,
      'data-active': 'false',
      'data-bypassed': 'false',
      title: t('{n0}（点击编辑，点灯或右键切换旁通）', { n0: b.name }),
    });
    const top = el('div', 'stompbox-top');
    const code = el('span', 'stompbox-code');
    code.textContent = b.code;
    const led = createLed('', 'green');
    top.appendChild(code);
    top.appendChild(led.el);
    const name = el('div', 'stompbox-name');
    name.textContent = b.name;
    const status = el('div', 'stompbox-status mono');
    /* 触屏排序按钮：桌面端隐藏（有拖拽），触摸端显示 */
    const moves = el('div', 'stompbox-moves');
    const up = el('button', 'stompbox-move', { type: 'button', 'aria-label': t('上移'), title: t('上移一级') });
    up.textContent = '▲';
    const down = el('button', 'stompbox-move', { type: 'button', 'aria-label': t('下移'), title: t('下移一级') });
    down.textContent = '▼';
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onMove?.(b.uid, -1);
    });
    down.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onMove?.(b.uid, 1);
    });
    moves.append(up, down);
    box.appendChild(top);
    box.appendChild(name);
    box.appendChild(moves);
    box.appendChild(status);
    box.addEventListener('click', (e) => {
      if (holdFired) return; // 长按已处理，这一次点击忽略
      const target = e.target as HTMLElement;
      if (target.closest('.led')) handlers.onToggleBypass(b.uid);
      else if (target.closest('.stompbox-move')) return; // 排序按钮自己处理
      else handlers.onSelect(b.uid);
    });
    box.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      handlers.onToggleBypass(b.uid);
    });

    /*
     * 长按旁通 —— 手机上没法右键，用长按代替。
     * 按住 480ms 触发，触发后抑制随后的 click（否则会变成"选中该模块"）。
     * 手指一动浏览器会发 pointercancel，计时器随之取消，不会和滚动打架。
     */
    let holdTimer: number | null = null;
    let holdFired = false;
    const cancelHold = () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      delete box.dataset.hold;
    };
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      holdFired = false;
      cancelHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        holdFired = true;
        box.dataset.hold = 'true';
        handlers.onToggleBypass(b.uid);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 480);
    });
    box.addEventListener('pointerup', cancelHold);
    box.addEventListener('pointercancel', cancelHold);
    box.addEventListener('pointerleave', cancelHold);
    box.addEventListener('click', (e) => {
      if (holdFired) {
        holdFired = false;
        e.preventDefault();
        e.stopPropagation();
        cancelHold();
      }
    }, true);

    /* 拖拽排序：直接拖着效果器盒在链上换位置（借鉴 GuitarStack 的 pedalboard 交互） */
    box.draggable = true;
    box.addEventListener('dragstart', (e) => {
      dragUid = b.uid;
      box.dataset.dragging = 'true';
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', b.uid);
      }
    });
    box.addEventListener('dragend', () => {
      dragUid = null;
      delete box.dataset.dragging;
      clearDropMarks();
    });
    box.addEventListener('dragover', (e) => {
      if (!dragUid || dragUid === b.uid) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const r = box.getBoundingClientRect();
      clearDropMarks();
      box.dataset.drop = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
    });
    box.addEventListener('dragleave', () => {
      delete box.dataset.drop;
    });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const from = dragUid || e.dataTransfer?.getData('text/plain') || '';
      const r = box.getBoundingClientRect();
      const before = e.clientX < r.left + r.width / 2;
      delete box.dataset.drop;
      if (from && from !== b.uid) handlers.onReorder?.(from, b.uid, before);
    });
    return { box, led, name, status };
  };

  /* 拖入落点指示线 */
  const marker = el('div', 'chain-insert-marker');
  marker.dataset.on = 'false';

  const clearMarker = () => {
    if (marker.parentNode) marker.parentNode.removeChild(marker);
  };

  /** 按 clientX 算出应该插到第几个效果器之前 */
  const indexAt = (x: number): number => {
    const boxes = [...root.querySelectorAll<HTMLElement>('.stompbox')];
    for (let i = 0; i < boxes.length; i++) {
      const r = boxes[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return i;
    }
    return boxes.length;
  };

  const showMarker = (x: number): void => {
    const idx = indexAt(x);
    const boxes = [...root.querySelectorAll<HTMLElement>('.stompbox')];
    clearMarker();
    if (idx >= boxes.length) root.appendChild(marker);
    else root.insertBefore(marker, boxes[idx]);
    marker.dataset.on = 'true';
  };

  root.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types;
    if (!types || !types.includes(FX_DRAG_TYPE)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    showMarker(e.clientX);
  });
  root.addEventListener('dragleave', (e) => {
    if (e.target === root) clearMarker();
  });
  root.addEventListener('drop', (e) => {
    const fxId = e.dataTransfer?.getData(FX_DRAG_TYPE);
    if (!fxId) return;
    e.preventDefault();
    e.stopPropagation();
    const idx = indexAt(e.clientX);
    clearMarker();
    handlers.onInsertFx?.(fxId, idx);
  });

  return {
    el: root,
    update(blocks, live) {
      const scroll = root.scrollLeft;
      while (root.firstChild) root.removeChild(root.firstChild);

      root.appendChild(makeJack(t('输入')));
      blocks.forEach((b, i) => {
        if (i > 0) root.appendChild(el('div', 'chain-cable'));
        let entry = built.get(b.uid);
        if (!entry) {
          entry = makeBox(b);
          built.set(b.uid, entry);
        }
        entry.box.dataset.active = b.active ? 'true' : 'false';
        entry.box.dataset.bypassed = b.bypassed ? 'true' : 'false';
        entry.led.setOn(!b.bypassed);
        /* 盒子是复用的，切语言后要把名称和标题一起换掉 */
        entry.name.textContent = b.name;
        entry.box.title = t('{n0}（点击编辑，点灯或右键切换旁通）', { n0: b.name });
        entry.status.textContent = b.bypassed ? t('旁通') : b.status || t('启用');
        root.appendChild(entry.box);
      });
      root.appendChild(el('div', 'chain-cable'));
      root.appendChild(makeJack(t('输出')));

      if (handlers.onAdd && handlers.canAdd !== false) {
        const add = el('button', 'chain-add', {
          type: 'button',
          'aria-label': t('添加效果器'),
          title: t('添加效果器'),
        });
        add.textContent = '+';
        add.addEventListener('click', () => handlers.onAdd?.());
        root.appendChild(add);
      }

      root.scrollLeft = scroll;
      const bar = root.closest<HTMLElement>('.chainbar');
      if (bar) bar.dataset.live = live ? 'true' : 'false';
    },
  };
}
