#!/usr/bin/env python3
"""从 data*.py 重新生成 src/i18n/locales/*.ts 八个词典。

用法：
    python3 tools/i18n/gen.py

翻译数据在 tools/i18n/.data*.py 里，每行一条：

    ROWS = [ (中文键, en, ja, fr, de, es, pt-BR, ru, ko), ... ]

约定：
  * 键就是简体中文原文（「中文即键」），运行时未收录的键原样返回中文
  * 数据占位符一律写成 {n0} {n1} ...（按出现顺序编号），生成时会自动对齐
  * 内联标签占位符 {b} {/b} {k1} {k2} ... 保持原样，交给译文按语序摆放：
        {b}  = <b>      {/b} = </b>      {k1} = <span class="kbd">
  * 引号按语言转换：en “ ” / ja 「 」 / fr « » / de „ “ / ko ' '
"""
import importlib.util
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'src' / 'i18n' / 'locales'

LOCALES = ['en', 'ja', 'fr', 'de', 'es', 'pt-BR', 'ru', 'ko']
NATIVE = {
    'en': 'English', 'ja': '日本語', 'fr': 'Français', 'de': 'Deutsch',
    'es': 'Español', 'pt-BR': 'Português (Brasil)', 'ru': 'Русский', 'ko': '한국어',
}
QUOTES = {
    'en': ('“', '”'), 'ja': ('「', '」'), 'fr': ('«', '»'),
    'de': ('„', '“'), 'es': ('«', '»'), 'pt-BR': ('«', '»'),
    'ru': ('«', '»'), 'ko': ("'", "'"),
}
# 内联标签占位符不参与位置编号
TAGS = {'b', '/b'} | {'k%d' % i for i in range(1, 10)}

PLACEHOLDER = re.compile(r'\{([\w/]+)\}')


def load_rows():
    rows = []
    for f in sorted(HERE.glob('.data*.py')):
        spec = importlib.util.spec_from_file_location('i18n_' + f.stem, f)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        rows += list(mod.ROWS)
    # 后写的覆盖先写的
    seen = {}
    for r in rows:
        seen[r[0]] = r
    return list(seen.values())


def align_placeholders(row):
    """把数据里手写的 {id} {db} 之类的名字统一成 {n0} {n1}（按出现顺序）。"""
    key = row[0]
    names = []
    for m in PLACEHOLDER.finditer(key):
        n = m.group(1)
        if n not in TAGS and n not in names:
            names.append(n)
    if not names:
        return row
    mapping = {n: 'n%d' % i for i, n in enumerate(names)}
    ren = lambda s: PLACEHOLDER.sub(lambda m: '{' + mapping.get(m.group(1), m.group(1)) + '}', s)
    return tuple([ren(key)] + [ren(v) for v in row[1:]])


def localize(s, loc):
    o, c = QUOTES[loc]
    return s.replace('「', o).replace('」', c)


def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')


def export_name(loc):
    return 'en' if loc == 'en' else loc.replace('-', '')


def main():
    rows = [align_placeholders(r) for r in load_rows()]
    for loc in LOCALES:
        idx = LOCALES.index(loc) + 1
        lines = [
            '/**',
            ' * VoiceManager — %s 词典' % NATIVE[loc],
            ' * Copyright (C) 2026 Mutantcat Working Group',
            ' * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>',
            ' *',
            ' * 键为简体中文原文，值为译文；未收录的键运行时原样返回（即简体中文）。',
            ' * {n0} {n1} 为数据占位符；{b} {/b} {k1} 为内联标签占位符。',
            ' */',
            "import type { Dict } from '../index';",
            '',
            'export const %s: Dict = {' % export_name(loc),
        ]
        for r in rows:
            lines.append("  '%s': '%s'," % (esc(r[0]), esc(localize(r[idx], loc))))
        lines.append('};')
        (OUT / ('%s.ts' % loc)).write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('已生成 %d 个词典，各 %d 条' % (len(LOCALES), len(rows)))


if __name__ == '__main__':
    sys.exit(main())
