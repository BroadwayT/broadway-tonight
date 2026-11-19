#!/usr/bin/env python3
"""Rebuild maskable icons, the 180px apple-touch-icon, and iOS splash images from public/icon-512.png."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'public'
SRC = Image.open(ROOT / 'icon-512.png').convert('RGB')
BG = (7, 6, 10)

def content_bbox(im, bg=BG):
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y] != bg:
                xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)

def place(size, content, pad_ratio):
    canvas = Image.new('RGB', (size, size), BG)
    inner = int(round(size * (1 - 2 * pad_ratio)))
    logo = content.resize((inner, inner), Image.Resampling.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(logo, (off, off))
    return canvas

bbox = content_bbox(SRC)
l, t, r, b = bbox
pad = 4
l, t = max(0, l - pad), max(0, t - pad)
r, b = min(SRC.width, r + pad), min(SRC.height, b + pad)
side = max(r - l, b - t)
cx, cy = (l + r) / 2, (t + b) / 2
l, t = int(round(cx - side / 2)), int(round(cy - side / 2))
crop = Image.new('RGB', (side, side), BG)
src_box = (max(0, l), max(0, t), min(SRC.width, l + side), min(SRC.height, t + side))
dst = (src_box[0] - l, src_box[1] - t)
crop.paste(SRC.crop(src_box), dst)

for size in (192, 512):
    place(size, crop, 0.20).save(ROOT / f'icon-maskable-{size}.png', 'PNG', optimize=True)
place(180, crop, 0.125).save(ROOT / 'apple-touch-icon.png', 'PNG', optimize=True)

SPLASHES = [
    (1170, 2532), (1179, 2556), (1206, 2622), (1284, 2778), (1290, 2796),
    (1320, 2868), (1125, 2436), (1242, 2688), (828, 1792), (750, 1334),
]
splash_dir = ROOT / 'splash'
splash_dir.mkdir(exist_ok=True)
for w, h in SPLASHES:
    canvas = Image.new('RGB', (w, h), BG)
    mark = int(min(w, h) * 0.22)
    logo = crop.resize((mark, mark), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((w - mark) // 2, (h - mark) // 2))
    canvas.save(splash_dir / f'{w}x{h}.png', 'PNG', optimize=True)
print('wrote maskable icons, apple-touch-icon, and splash images')
