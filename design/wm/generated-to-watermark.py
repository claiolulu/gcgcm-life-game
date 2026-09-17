#!/usr/bin/env python3
"""把新增的透明地标插画压成和旧版一致的酒红色 PNG8 水印。"""
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "design" / "wm" / "src"
TARGET = ROOT / "web" / "public" / "wm"
NAMES = ("central-station-v2", "peoples-palace-v2", "necropolis-v2")
INK = (0x5C, 0x1A, 0x22)

for name in (sys.argv[1:] or NAMES):
    if name not in NAMES:
        raise ValueError(f"未知地标：{name}")
    rgba = Image.open(SOURCE / f"{name}.png").convert("RGBA")
    if not rgba.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox():
        raise ValueError(f"{name}: 透明图没有可见内容")
    # v2 特意在建筑周围留了云和空白；不能自动裁切，否则会重新放大主体。
    crop = rgba
    darkness = ImageOps.invert(ImageOps.grayscale(crop.convert("RGB")))
    strength = darkness.point(lambda d: round((max(0, (d / 255 - 0.12) / 0.88) ** 0.85) * 255))
    image = ImageChops.multiply(strength, crop.getchannel("A"))
    image.thumbnail((600, 700), Image.Resampling.LANCZOS)
    image = image.convert("P")
    image.putpalette(list(INK) * 256)
    image.info["transparency"] = bytes(range(256))
    output = TARGET / f"{name}.png"
    image.save(output, optimize=True, transparency=bytes(range(256)))
    print(f"{name}: {image.width}x{image.height}, {output.stat().st_size / 1024:.1f} KB")
