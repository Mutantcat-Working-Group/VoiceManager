/**
 * 信号链视图 —— 输入 -> 各级效果器 -> 输出，带插头/线缆/旁通灯。
 */

import { createLed, el } from './components';

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
}

export interface ChainViewHandle {
  el: HTMLElement;
  update(blocks: ChainBlockView[], live: boolean): void;
}

interface Entry {
  box: HTMLElement;
  led: ReturnType<typeof createLed>;
  status: HTMLElement;
}

export function createChainView(handlers: ChainHandlers): ChainViewHandle {
  const root = el('div', 'chain-track');
  const built = new Map<string, Entry>();

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
      title: `${b.name}（点击编辑，点灯或右键切换旁通）`,
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
    box.appendChild(top);
    box.appendChild(name);
    box.appendChild(status);
    box.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.led')) handlers.onToggleBypass(b.uid);
      else handlers.onSelect(b.uid);
    });
    box.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      handlers.onToggleBypass(b.uid);
    });
    return { box, led, status };
  };

  return {
    el: root,
    update(blocks, live) {
      const scroll = root.scrollLeft;
      while (root.firstChild) root.removeChild(root.firstChild);

      root.appendChild(makeJack('输入'));
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
        entry.status.textContent = b.bypassed ? '旁通' : b.status || '启用';
        root.appendChild(entry.box);
      });
      root.appendChild(el('div', 'chain-cable'));
      root.appendChild(makeJack('输出'));

      if (handlers.onAdd && handlers.canAdd !== false) {
        const add = el('button', 'chain-add', {
          type: 'button',
          'aria-label': '添加效果器',
          title: '添加效果器',
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
