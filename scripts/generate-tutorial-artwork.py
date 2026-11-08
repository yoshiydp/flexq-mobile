#!/usr/bin/env python3
"""チュートリアル動画（TASK-139）の撮影用トラック「Sample Beat」のアートワークを生成する。

動画に映るため、写真・イラスト素材は使わず手続き的に描く（著作権・肖像権のリスクを避ける）。
配色はアプリのパレット（src/globalStyles/colors.ts）、題字はアプリの見出しと同じ Bebas Neue（OFL）。
モチーフはレトロサンセット（縞で切った太陽 + 紫のグリッドの地平線）。

  python3 -m venv .venv && .venv/bin/pip install pillow
  .venv/bin/python scripts/generate-tutorial-artwork.py .maestro/tutorial/assets/sample-beat-artwork.jpg
"""

import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = Path('node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf')
TITLE = 'SAMPLE BEAT'
W = 2000  # 描画解像度（最後に 1000px へ縮小してアンチエイリアスをかける）
OUTPUT_SIZE = 1000

BG = (13, 13, 13)
GOLD = (255, 215, 0)
PURPLE = (108, 52, 131)
RED = (193, 39, 45)
WHITE = (240, 240, 240)


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(top, bottom):
    img = Image.new('RGB', (W, W))
    d = ImageDraw.Draw(img)
    for y in range(W):
        d.line([(0, y), (W, y)], fill=mix(top, bottom, y / (W - 1)))
    return img


def add_grain(img, amount=7, seed=1):
    rnd = random.Random(seed)
    n = Image.new('L', (W // 4, W // 4))
    n.putdata([128 + rnd.randint(-amount, amount) for _ in range((W // 4) ** 2)])
    return Image.blend(img, n.resize((W, W)).convert('RGB'), 0.06)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else '.maestro/tutorial/assets/sample-beat-artwork.jpg')
    img = gradient((30, 14, 40), BG)

    # 太陽（ゴールド → 赤の縦グラデーションを、縞を抜いた円でマスクする）
    cx, cy, r = W // 2, int(W * 0.52), 560
    sun = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    for y in range(cy - r, cy + r):
        sd.line([(0, y), (W, y)], fill=mix(GOLD, RED, (y - (cy - r)) / (2 * r)) + (255,))
    mask = Image.new('L', (W, W), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    for i in range(7):
        y0 = cy + 40 + i * 70
        md.rectangle([0, y0, W, y0 + 12 + i * 5], fill=0)
    layer = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    layer.paste(sun, (0, 0), mask)
    halo = layer.filter(ImageFilter.GaussianBlur(40))
    img.paste(halo, (0, 0), halo)
    img.paste(layer, (0, 0), layer)

    # 地平線のグリッド（奥ほど詰まる横線 + 消失点へ向かう縦線）
    d = ImageDraw.Draw(img)
    horizon = int(W * 0.70)
    d.rectangle([0, horizon, W, W], fill=BG)
    for i in range(1, 12):
        y = horizon + int((i / 11) ** 2 * (W - horizon))
        d.line([(0, y), (W, y)], fill=PURPLE, width=4)
    for i in range(-14, 15):
        d.line([(W // 2 + i * 40, horizon), (W // 2 + i * 260, W)], fill=PURPLE, width=4)

    d.text((W // 2, int(W * 0.17)), TITLE, font=ImageFont.truetype(str(FONT), 300), fill=WHITE, anchor='ms')

    out.parent.mkdir(parents=True, exist_ok=True)
    add_grain(img).resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS).save(out, 'JPEG', quality=90, optimize=True)
    print(out)


if __name__ == '__main__':
    main()
