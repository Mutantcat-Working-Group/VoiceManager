#!/usr/bin/env python3
"""生成社交分享图 og-cover.png（1200×630）。

风格与界面一致：工业音频机架 —— 深色拉丝金属机身、丝印标签、
琥珀色表头背光、DM Mono 等宽字。文案直接取自页面 <title> / og:title，
避免分享图和落地页说的是两件事。

用法：
    python3 tools/og/make_cover.py

依赖 Pillow；字体首次运行时从 CDN 抓到 /tmp/ogfonts：
    Oswald 600 / DM Mono 500 / Noto Sans SC（中文，与界面同款）
"""
import math
import pathlib
import random
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / 'public' / 'og-cover.png'
ICON = ROOT / 'icon.png'
FONTS = pathlib.Path('/tmp/ogfonts')

W, H = 1200, 630

# ---- 取自 src/styles/tokens.css ----
VOID = (6, 5, 5)
CHASSIS = (16, 14, 11)
PANEL = (28, 24, 18)
PANEL_2 = (36, 31, 24)
EDGE = (59, 52, 43)
INK = (237, 230, 216)
INK_2 = (168, 158, 139)
INK_3 = (117, 109, 94)
AMBER = (242, 169, 43)
AMBER_HI = (255, 200, 97)
AMBER_DIM = (109, 74, 16)
GREEN = (116, 245, 154)
RED = (255, 83, 67)

EYEBROW = 'MUTANTCAT  ·  VM-5000'
TITLE = 'VOICE MANAGER'
SUB = ['在线扩音器 / 电吉他 / 贝斯', '监听与效果器']
TAGLINE = '浏览器音频工作站'
CHIPS = ['噪声门', '21 个效果器', '9 种语言', '耳机 / USB 监听']
DOMAIN = 'voicemanager.mutantcat.org'
FX = ['GATE', 'EQ', 'COMP', 'DRIVE', 'AMP', 'CAB', 'DELAY', 'REVERB']
MODES = ['PA', 'GTR', 'BASS', 'FX']

FONT_FILES = {
    'oswald600.woff': 'https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.19/files/oswald-latin-600-normal.woff',
    'dmmono500.woff': 'https://cdn.jsdelivr.net/npm/@fontsource/dm-mono@5.0.20/files/dm-mono-latin-500-normal.woff',
    'sc500.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.0.20/files/noto-sans-sc-chinese-simplified-500-normal.woff2',
    'sc400.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.0.20/files/noto-sans-sc-chinese-simplified-400-normal.woff2',
}


def ensure_fonts():
    FONTS.mkdir(parents=True, exist_ok=True)
    for name, url in FONT_FILES.items():
        p = FONTS / name
        if p.exists() and p.stat().st_size > 1000:
            continue
        print('下载字体 %s …' % name)
        urllib.request.urlretrieve(url, p)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def tw(d, s, f):
    b = d.textbbox((0, 0), s, font=f)
    return b[2] - b[0]


def rounded(d, box, r, **kw):
    d.rounded_rectangle(box, radius=r, **kw)


def brushed_metal(size, base, streaks=700, seed=20261024):
    """深色拉丝金属：横向细密噪点条。"""
    rng = random.Random(seed)
    img = Image.new('RGB', size, base)
    d = ImageDraw.Draw(img)
    w, h = size
    for _ in range(streaks):
        y = rng.randrange(h)
        ln = rng.randrange(40, w)
        x = rng.randrange(max(1, w - ln))
        v = rng.randrange(-8, 9)
        c = tuple(max(0, min(255, b + v)) for b in base)
        d.line([(x, y), (x + ln, y)], fill=c, width=1)
    return img


def screw(d, cx, cy, r=7):
    """机箱螺丝：外圈 + 一道十字槽。"""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(11, 10, 8), outline=EDGE, width=1)
    d.line([(cx - r + 2, cy), (cx + r - 2, cy)], fill=EDGE, width=2)
    d.line([(cx, cy - r + 2), (cx, cy + r - 2)], fill=EDGE, width=2)


def main():
    ensure_fonts()

    oswald = font('oswald600.woff', 92)
    dm = font('dmmono500.woff', 24)
    dm_s = font('dmmono500.woff', 19)
    dm_xs = font('dmmono500.woff', 15)
    sc38 = font('sc500.woff2', 38)
    sc20 = font('sc400.woff2', 20)
    sc16 = font('sc400.woff2', 16)

    img = brushed_metal((W, H), CHASSIS)
    d = ImageDraw.Draw(img)

    # 四角压暗，让中部内容更突出
    vig = Image.new('L', (W, H), 0)
    vd = ImageDraw.Draw(vig)
    for y in range(H):
        vd.line([(0, y), (W, y)], fill=int(150 * (1 - math.cos(y / (H - 1) * math.pi)) / 2))
    img = Image.composite(Image.new('RGB', (W, H), VOID), img, vig)
    d = ImageDraw.Draw(img)

    # 顶部 / 底部机架导轨
    d.rectangle([0, 0, W, 10], fill=(23, 20, 16))
    d.rectangle([0, H - 10, W, H], fill=(23, 20, 16))
    d.line([(0, 10), (W, 10)], fill=(48, 42, 34), width=1)
    d.line([(0, H - 11), (W, H - 11)], fill=(48, 42, 34), width=1)

    # ================= 左栏：主文案 =================
    LX = 56
    if ICON.exists():
        ic = Image.open(ICON).convert('RGB').resize((72, 72), Image.LANCZOS)
        rounded(d, [LX - 6, 84, LX + 78, 168], 10, fill=(20, 17, 13), outline=EDGE, width=1)
        img.paste(ic, (LX, 90))
        d = ImageDraw.Draw(img)

    d.text((LX + 100, 104), EYEBROW, font=dm, fill=AMBER_HI)

    # 琥珀色竖条
    d.rectangle([LX, 196, LX + 5, 430], fill=AMBER)

    d.text((LX + 22, 190), TITLE, font=oswald, fill=INK)
    y = 300
    for line in SUB:
        d.text((LX + 22, y), line, font=sc38, fill=INK_2)
        y += 50
    d.text((LX + 22, 414), TAGLINE, font=sc20, fill=INK_3)

    # 特性胶囊
    cy, cx = 462, LX + 22
    for c in CHIPS:
        pw = tw(d, c, sc16) + 30
        rounded(d, [cx, cy, cx + pw, cy + 36], 18, fill=(24, 21, 16), outline=EDGE, width=1)
        d.ellipse([cx + 12, cy + 14, cx + 20, cy + 22], fill=AMBER)
        d.text((cx + 28, cy + 18), c, font=sc16, fill=INK_2, anchor='lm')
        cx += pw + 12

    d.text((LX + 22, 534), DOMAIN, font=dm, fill=INK_3)

    # ================= 右栏：机架面板 =================
    P = [730, 96, 1144, 538]
    rounded(d, P, 12, fill=PANEL, outline=EDGE, width=2)
    d.rectangle([P[0] + 2, P[1] + 2, P[2] - 2, P[1] + 4], fill=(20, 17, 13))
    for yy in range(P[1] + 12, P[3] - 8, 3):
        d.line([(P[0] + 10, yy), (P[2] - 10, yy)], fill=(32, 28, 22), width=1)

    # 面板头
    d.text((P[0] + 22, P[1] + 18), 'SIGNAL CHAIN', font=dm_s, fill=INK_3)
    hl = tw(d, 'SIGNAL CHAIN', dm_s)
    d.line([(P[0] + 22, P[1] + 44), (P[0] + 22 + hl, P[1] + 44)], fill=AMBER_DIM, width=1)

    # 效果器盒子：两排四列
    inner = P[2] - 22 - (P[0] + 22)
    bw = (inner - 3 * 8) // 4
    bh = 88
    for i, name in enumerate(FX):
        col, row = i % 4, i // 4
        x0 = P[0] + 22 + col * (bw + 8)
        y0 = P[1] + 60 + row * (bh + 12)
        rounded(
            d, [x0, y0, x0 + bw, y0 + bh], 5,
            fill=PANEL_2 if (i % 2 == 0) else PANEL, outline=EDGE, width=1,
        )
        d.line([(x0 + 2, y0 + 2), (x0 + bw - 2, y0 + 2)], fill=(48, 42, 33), width=1)
        d.text((x0 + bw // 2, y0 + 28), name, font=dm_xs, fill=INK_2, anchor='mm')
        d.text((x0 + bw // 2, y0 + 52), 'FX', font=dm_xs, fill=(74, 68, 58), anchor='mm')
        led_c = GREEN if i < 3 else AMBER
        d.ellipse([x0 + bw // 2 - 5, y0 + bh - 24, x0 + bw // 2 + 5, y0 + bh - 14], fill=led_c)
        d.ellipse(
            [x0 + bw // 2 - 8, y0 + bh - 27, x0 + bw // 2 + 8, y0 + bh - 11],
            outline=(30, 26, 20), width=1,
        )

    # 级联箭头（信号流）
    for row in range(2):
        ay = P[1] + 60 + row * (bh + 12) + bh // 2
        for col in range(3):
            x0 = P[0] + 22 + col * (bw + 8) + bw + 1
            d.line([(x0, ay), (x0 + 6, ay)], fill=(87, 77, 64), width=2)

    # 输出表头背光
    vu_y = P[1] + 60 + 2 * (bh + 12) + 12
    d.text((P[0] + 22, vu_y), 'OUTPUT', font=dm_s, fill=INK_3)
    seg_y = vu_y + 30
    segs = 30
    seg_w = (inner - 8) / segs
    for i in range(segs):
        x0 = P[0] + 22 + i * seg_w
        frac = i / (segs - 1)
        c = AMBER_DIM if frac < 0.62 else (AMBER if frac < 0.84 else RED)
        hh = 14 if i % 4 else 22
        d.rectangle([x0, seg_y + 24 - hh, x0 + seg_w - 3, seg_y + 24], fill=c)

    # 模式分段
    md_y = seg_y + 44
    d.text((P[0] + 22, md_y), 'MODE', font=dm_s, fill=INK_3)
    mw = (inner - 3 * 6) // 4
    for i, m in enumerate(MODES):
        x0 = P[0] + 22 + i * (mw + 6)
        on = i == 0
        rounded(
            d, [x0, md_y + 26, x0 + mw, md_y + 62], 4,
            fill=(38, 32, 24) if on else (24, 21, 16),
            outline=AMBER_DIM if on else EDGE, width=1,
        )
        d.text((x0 + mw // 2, md_y + 44), m, font=dm_xs, fill=AMBER_HI if on else INK_3, anchor='mm')

    # 面板螺丝
    for sx, sy in [(P[0] + 16, P[1] + 16), (P[2] - 16, P[1] + 16),
                   (P[0] + 16, P[3] - 16), (P[2] - 16, P[3] - 16)]:
        screw(d, sx, sy, 6)

    # 机身四角螺丝
    for sx, sy in [(30, 30), (W - 30, 30), (30, H - 30), (W - 30, H - 30)]:
        screw(d, sx, sy, 7)

    # 外框
    d.rectangle([0, 0, W - 1, H - 1], outline=(43, 37, 30), width=2)

    # 轻微颗粒，避免大色块出现色带
    noise = Image.effect_noise((W, H), 9)
    img = Image.blend(img, Image.merge('RGB', (noise, noise, noise)), 0.025)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, 'PNG', optimize=True)
    print('已生成 %s (%d×%d, %.1f KB)' % (OUT, W, H, OUT.stat().st_size / 1024))


if __name__ == '__main__':
    sys.exit(main())
