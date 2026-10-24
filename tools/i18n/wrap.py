#!/usr/bin/env python3
"""把源码里的中文字符串字面量包成 t('...') / t('...', {n: expr})。

只处理「字符串字面量」：注释、模板里的纯文本都不碰。
遇到带 ${...} 的模板串，转成 {n1} {n2} 占位符 + params 对象。
"""
import re, sys, pathlib

CJK = re.compile(r'[一-龥]')


class Scanner:
    def __init__(self, src, skip_ranges=()):
        self.src = src
        self.out = []
        self.i = 0
        self.n = len(src)
        self.skip = skip_ranges  # [(start,end)] 不处理
        self.changed = 0

    def in_skip(self, pos):
        for a, b in self.skip:
            if a <= pos < b:
                return True
        return False

    def run(self):
        src, n = self.src, self.n
        while self.i < n:
            c = src[self.i]
            # 行注释
            if c == '/' and self.i + 1 < n and src[self.i + 1] == '/':
                j = src.find('\n', self.i)
                j = n if j < 0 else j
                self.out.append(src[self.i:j]); self.i = j; continue
            # 块注释
            if c == '/' and self.i + 1 < n and src[self.i + 1] == '*':
                j = src.find('*/', self.i)
                j = n if j < 0 else j + 2
                self.out.append(src[self.i:j]); self.i = j; continue
            # 字符串
            if c in ('"', "'", '`'):
                self.read_string(c); continue
            self.out.append(c); self.i += 1
        return ''.join(self.out)

    def read_string(self, q):
        src, n = self.src, self.n
        start = self.i
        i = self.i + 1
        parts = []          # ('lit', text) / ('expr', code)
        buf = []
        closed = False
        while i < n:
            ch = src[i]
            if ch == '\\':
                buf.append(src[i:i + 2]); i += 2; continue
            if q == '`' and ch == '$' and i + 1 < n and src[i + 1] == '{':
                parts.append(('lit', ''.join(buf))); buf = []
                depth = 1; j = i + 2
                while j < n and depth:
                    if src[j] == '{': depth += 1
                    elif src[j] == '}': depth -= 1
                    if depth == 0: break
                    j += 1
                parts.append(('expr', src[i + 2:j]))
                i = j + 1; continue
            if ch == q:
                closed = True; i += 1; break
            if q != '`' and ch == '\n':
                break  # 单/双引号不跨行，异常情况直接放弃
            buf.append(ch); i += 1
        if not closed:
            # 没能完整读到的串，原样吐出
            self.out.append(src[start:i]); self.i = i; return
        parts.append(('lit', ''.join(buf)))
        raw = src[start:i]
        text = ''.join(p[1] for p in parts if p[0] == 'lit')
        if not CJK.search(text) or self.in_skip(start):
            self.out.append(raw); self.i = i; return
        self.out.append(self.build(parts, q))
        self.i = i
        self.changed += 1

    def build(self, parts, q):
        exprs = [p[1] for p in parts if p[0] == 'expr']
        # 拼出带 {n} 占位符的模板
        tpl = []
        k = 0
        for kind, val in parts:
            if kind == 'lit':
                tpl.append(val)
            else:
                tpl.append('{n%d}' % k); k += 1
        template = ''.join(tpl)
        key = "'" + template.replace('\\', '\\\\').replace("'", "\\'") + "'"
        if not exprs:
            return 't(%s)' % key
        params = ', '.join('n%d: %s' % (idx, e.strip()) for idx, e in enumerate(exprs))
        return 't(%s, { %s })' % (key, params)


def process(path, skip_ranges=()):
    p = pathlib.Path(path)
    src = p.read_text(encoding='utf-8')
    s = Scanner(src, skip_ranges)
    out = s.run()
    if s.changed:
        p.write_text(out, encoding='utf-8')
    print('%-34s 包装 %3d 处' % (path, s.changed))
    return s.changed


if __name__ == '__main__':
    total = 0
    for f in sys.argv[1:]:
        total += process(f)
    print('合计', total)
