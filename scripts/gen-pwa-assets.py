#!/usr/bin/env python3
"""Rebuild app icons and iOS splash images from the Broadway Tonight logo.

The source is scripts/broadway-tonight-logo.png, the official Instagram/TikTok
profile picture: pink/yellow neon "BROADWAY TONIGHT" wordmark with guitar and
star, on black.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
SRC_PATH = Path(__file__).resolve().parent / 'broadway-tonight-logo.png'
BG = (0, 0, 0)

def as_rgb(im):
    if im.mode == 'RGB':
        return im
    canvas = Image.new('RGB', im.size, BG)
    if im.mode in ('RGBA', 'LA'):
        canvas.paste(im, mask=im.split()[-1])
        return canvas
    return im.convert('RGB')

def place(size, logo, pad_ratio):
    canvas = Image.new('RGB', (size, size), BG)
    inner = max(1, int(round(size * (1 - 2 * pad_ratio))))
    fitted = logo.resize((inner, inner), Image.Resampling.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(fitted, (off, off))
    return canvas

logo = as_rgb(Image.open(SRC_PATH))

# "any" icons and the iOS apple-touch-icon: modest padding keeps the circular
# logo and wordmark inside iOS rounded corners.
ANY_PAD = 0.10
APPLE_PAD = 0.10
MASKABLE_PAD = 0.20  # inner 80% safe zone

for size in (192, 512):
    place(size, logo, ANY_PAD).save(PUBLIC / f'icon-{size}.png', 'PNG', optimize=True)
    place(size, logo, MASKABLE_PAD).save(PUBLIC / f'icon-maskable-{size}.png', 'PNG', optimize=True)
place(180, logo, APPLE_PAD).save(PUBLIC / 'apple-touch-icon.png', 'PNG', optimize=True)

SPLASHES = [
    (1170, 2532), (1179, 2556), (1206, 2622), (1284, 2778), (1290, 2796),
    (1320, 2868), (1125, 2436), (1242, 2688), (828, 1792), (750, 1334),
]
splash_dir = PUBLIC / 'splash'
splash_dir.mkdir(exist_ok=True)
for w, h in SPLASHES:
    canvas = Image.new('RGB', (w, h), BG)
    mark = int(min(w, h) * 0.36)
    fitted = logo.resize((mark, mark), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((w - mark) // 2, (h - mark) // 2))
    canvas.save(splash_dir / f'{w}x{h}.png', 'PNG', optimize=True)
print('wrote any/maskable icons, apple-touch-icon, and splash images from', SRC_PATH.name)
