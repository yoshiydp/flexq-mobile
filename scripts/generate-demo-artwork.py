#!/usr/bin/env python3
"""ストア審査用デモアカウントのアートワーク・プロフィール画像を生成する。

著作権フリー素材を探す手間とライセンスリスクを避けるため、ジャケット画像は
アプリのカラーパレット（src/globalStyles/colors.ts のダーク + ゴールド）に
合わせて手続き的に生成する。

  python3 -m venv .venv && .venv/bin/pip install pillow
  .venv/bin/python scripts/generate-demo-artwork.py demo-assets/artworks
"""

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1400  # 生成解像度（最後に 1000px へ縮小してアンチエイリアスをかける）
OUTPUT_SIZE = 1000

BG = (13, 13, 13)
GOLD = (255, 215, 0)
PURPLE = (108, 52, 131)
RECORD_RED = (193, 39, 45)
NAVY = (25, 33, 38)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def base_canvas(top, bottom):
    """縦方向のグラデーションを敷いた下地を作る。"""
    img = Image.new('RGB', (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)
    for y in range(SIZE):
        draw.line([(0, y), (SIZE, y)], fill=lerp(top, bottom, y / SIZE))
    return img


def glow(img, layer, radius):
    """発光レイヤーをぼかして加算合成する。"""
    return Image.blend(img, Image.composite(layer, img, layer.convert('L').point(lambda v: min(v * 3, 255)))
                       .filter(ImageFilter.GaussianBlur(radius)), 0.55)


def add_grain(img, amount=9, seed=0):
    """わずかなノイズを乗せてベタ塗り感を消す。"""
    rng = random.Random(seed)
    px = img.load()
    for y in range(0, SIZE, 2):
        for x in range(0, SIZE, 2):
            n = rng.randint(-amount, amount)
            r, g, b = px[x, y]
            px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return img.filter(ImageFilter.SMOOTH)


def art_grooves(seed):
    """レコードの溝を思わせる同心円。"""
    img = base_canvas((26, 30, 36), BG)
    draw = ImageDraw.Draw(img, 'RGBA')
    cx, cy = SIZE * 0.5, SIZE * 0.47
    # 内側ほど太く明るくして中心に視線を集める
    for i in range(42):
        r = SIZE * 0.09 + i * SIZE * 0.0098
        t = i / 42
        color = lerp(GOLD, PURPLE, t ** 1.4) + (int(255 - 130 * t),)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=8 if i % 5 == 0 else 3)
    # 溝の一部を欠けさせて、針が乗っているような余白を作る
    draw.pieslice([cx - SIZE, cy - SIZE, cx + SIZE, cy + SIZE], -24, 8, fill=BG + (215,))
    r = SIZE * 0.07
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (255,))
    return add_grain(img, seed=seed)


def art_waveform(seed):
    """縦バーの波形。アプリの波形 UI と揃えたモチーフ。"""
    rng = random.Random(seed)
    img = base_canvas(BG, (30, 22, 36))
    draw = ImageDraw.Draw(img, 'RGBA')
    bars, gap = 46, SIZE / 46
    mid = SIZE * 0.5
    for i in range(bars):
        # 中央が高く端が低いエンベロープに乱数を乗せる
        env = math.sin(math.pi * i / (bars - 1)) ** 0.65
        h = SIZE * 0.42 * env * rng.uniform(0.35, 1.0)
        x = i * gap + gap * 0.22
        w = gap * 0.56
        color = lerp(PURPLE, GOLD, env) + (245,)
        draw.rounded_rectangle([x, mid - h, x + w, mid + h], radius=w / 2, fill=color)
    return add_grain(img, seed=seed)


def art_horizon(seed):
    """水平線に沈む円。Lo-fi 系ジャケットの定番構図。"""
    img = base_canvas((36, 24, 44), (10, 12, 16))
    draw = ImageDraw.Draw(img, 'RGBA')
    cx, cy, r = SIZE * 0.5, SIZE * 0.44, SIZE * 0.23
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (255,))
    # 円を水平のスリットで切り、レトロなグラデーションを作る
    for i in range(11):
        y = cy + r * 0.12 + i * r * 0.085
        draw.rectangle([cx - r, y, cx + r, y + r * 0.02 + i * r * 0.006], fill=(10, 12, 16, 255))
    horizon = SIZE * 0.68
    draw.rectangle([0, horizon, SIZE, SIZE], fill=(8, 10, 13, 255))
    for i in range(16):
        y = horizon + (SIZE - horizon) * (i / 16) ** 1.8
        draw.line([(0, y), (SIZE, y)], fill=GOLD + (max(0, 80 - i * 5),), width=2)
    return add_grain(img, seed=seed)


def art_mesh(seed):
    """斜めのラインが重なるミニマルな幾何パターン。"""
    rng = random.Random(seed)
    img = base_canvas((14, 16, 20), (26, 20, 14))
    draw = ImageDraw.Draw(img, 'RGBA')
    for i in range(-14, 30):
        x = i * SIZE / 16
        alpha = rng.randint(40, 190)
        color = (GOLD if i % 3 else PURPLE) + (alpha,)
        draw.line([(x, 0), (x + SIZE * 0.55, SIZE)], fill=color, width=rng.choice([2, 3, 7]))
    # 円の内側だけラインを反転させ、ダブルトーンの抜きを作る
    r = SIZE * 0.31
    box = [SIZE * 0.5 - r, SIZE * 0.5 - r, SIZE * 0.5 + r, SIZE * 0.5 + r]
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    disc = Image.new('RGB', (SIZE, SIZE), GOLD)
    disc_draw = ImageDraw.Draw(disc, 'RGBA')
    for i in range(-14, 30):
        x = i * SIZE / 16
        disc_draw.line([(x, 0), (x + SIZE * 0.55, SIZE)], fill=BG + (230,), width=rng.choice([3, 5, 11]))
    img.paste(disc, (0, 0), mask)
    draw.ellipse(box, outline=BG + (255,), width=14)
    return add_grain(img, seed=seed)


def art_profile(seed):
    """プロフィール画像。中央に寄せた同心円のシンプルなマーク。"""
    img = base_canvas((30, 26, 22), BG)
    draw = ImageDraw.Draw(img, 'RGBA')
    cx = cy = SIZE * 0.5
    for i, (r, w, color) in enumerate([
        (SIZE * 0.34, 10, GOLD),
        (SIZE * 0.26, 5, PURPLE),
        (SIZE * 0.18, 3, GOLD),
    ]):
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color + (230 - i * 40,), width=w)
    r = SIZE * 0.09
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (255,))
    return add_grain(img, seed=seed)


ARTWORKS = [
    ('track-01-grooves', art_grooves),
    ('track-02-waveform', art_waveform),
    ('track-03-horizon', art_horizon),
    ('track-04-mesh', art_mesh),
    ('profile', art_profile),
]


def main():
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else 'demo-assets/artworks')
    out_dir.mkdir(parents=True, exist_ok=True)
    for seed, (name, fn) in enumerate(ARTWORKS, start=1):
        img = fn(seed * 17).resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)
        path = out_dir / f'{name}.jpg'
        img.save(path, 'JPEG', quality=88, optimize=True)
        print(f'{path}  {path.stat().st_size / 1024:.0f}KB')


if __name__ == '__main__':
    main()
