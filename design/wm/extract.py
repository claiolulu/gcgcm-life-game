#!/usr/bin/env python3
"""
把地标插画提取成护照页水印。

输入：
  design/wm/src/grid.png        10 个地标的宫格图（2 行 5 列，每格下面带中文标注）
  design/wm/src/wellington.png  威灵顿像单图

输出：
  web/public/wm/<key>.png       预先染成护照油墨色的 RGBA 图
  design/wm/contact-sheet.png   按实际显示效果（13% 不透明度、纸色背景）排的对照图

为什么不是 SVG：原图是位图插画，没有矢量源。硬描摹成路径既丢线条粗细
变化，又会因为节点太多反而比 PNG 还大。水印只是 background-image，
位图完全够用 —— 但必须压到实际显示尺寸，见下面 MAXW 的说明。

用法：
  python3 design/wm/extract.py            # 全部重新生成
  python3 design/wm/extract.py --floor .18 --gamma .8   # 调线条取舍
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "design" / "wm" / "src"
OUT = ROOT / "web" / "public" / "wm"

INK = (0x5c, 0x1a, 0x22)     # 护照正文的暗红，和现有水印一致
PAPER = (0xf3, 0xed, 0xe0)   # 对照图的纸色背景
OPACITY = 0.13               # 与 PassportBookView 里的 opacity 保持一致

# 水印在手机上最宽约占屏幕 40%，2x 屏下 600px 已经绰绰有余。
# 这个项目的前提是现场 50 台手机、网络很差，水印是装饰性资源，
# 不值得为它多塞几百 KB 进预缓存。
MAXW = 600
MAXH = 700

# 宫格从左到右、从上到下，对应 config.js 里的 landmarkKey
GRID_KEYS = [
    "city-chambers", "clyde-auditorium", "cathedral", "university", "clyde-arc",
    "riverside", "george-square", "botanic", "crane", "kelvingrove",
]


def content_mask(rgb, white=245):
    """非白像素。彩色的浅蓝天空、浅绿树也算内容，用于切格子和找边界。"""
    return (rgb < white).any(axis=2)


def runs(flags, min_gap=1):
    """把一维布尔数组切成连续 True 的区间 [(start, end), ...]。"""
    out, s = [], None
    gap = 0
    for i, v in enumerate(flags):
        if v:
            if s is None:
                s = i
            gap = 0
        else:
            if s is not None:
                gap += 1
                if gap >= min_gap:
                    out.append((s, i - gap + 1))
                    s = None
    if s is not None:
        out.append((s, len(flags)))
    return out


def split_grid(mask, ncol, nrow):
    """靠整列/整行的空白切分宫格；切不出预期数量就退回等分。"""
    colbands = runs(mask.any(axis=0), min_gap=12)
    rowbands = runs(mask.any(axis=1), min_gap=12)

    if len(colbands) != ncol:
        print(f"  ! 列切分检测到 {len(colbands)} 段（应为 {ncol}），改用等分", file=sys.stderr)
        w = mask.shape[1] / ncol
        colbands = [(int(i * w), int((i + 1) * w)) for i in range(ncol)]
    if len(rowbands) != nrow:
        print(f"  ! 行切分检测到 {len(rowbands)} 段（应为 {nrow}），改用等分", file=sys.stderr)
        h = mask.shape[0] / nrow
        rowbands = [(int(i * h), int((i + 1) * h)) for i in range(nrow)]
    return colbands, rowbands


def drop_caption(cell_mask):
    """
    去掉格子底部的中文标注。

    一个格子里内容分成上下两块：插画（高）和标注文字（矮），中间有明显空白。
    所以按行找内容带，末尾那条又矮又靠下的就是标注。
    """
    bands = runs(cell_mask.any(axis=1), min_gap=6)
    if len(bands) < 2:
        return bands[0] if bands else (0, cell_mask.shape[0])
    h = cell_mask.shape[0]
    last = bands[-1]
    if (last[1] - last[0]) < 0.18 * h:
        bands = bands[:-1]
    return (bands[0][0], bands[-1][1])


def to_watermark(rgb_crop, floor, gamma):
    """
    彩色插画 -> 单色水印。

    取亮度的反相当作墨量：线条最黑 -> 最不透明；浅色填充（天空、树）
    压到 floor 以下直接抹掉，否则在 13% 叠加下会糊成一片红雾。
    """
    lum = rgb_crop.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    ink = 1.0 - lum / 255.0
    ink = np.clip((ink - floor) / max(1e-6, 1.0 - floor), 0.0, 1.0)
    if gamma != 1.0:
        ink = ink ** gamma
    return (ink * 255).astype(np.uint8)


def save(alpha, path):
    """
    存成 PNG8：调色板 256 格全填同一个油墨色，透明度靠 tRNS 表逐格给出。

    水印是单色的，RGB 三个通道存的是同一个值纯属浪费。这样每像素只占
    1 字节而不是 RGBA 的 4 字节，仍然保留 256 级灰度过渡，肉眼无差别。
    """
    h, w = alpha.shape
    scale = min(MAXW / w, MAXH / h, 1.0)
    if scale < 1.0:
        w, h = max(1, round(w * scale)), max(1, round(h * scale))
        alpha = np.array(Image.fromarray(alpha).resize((w, h), Image.LANCZOS))

    img = Image.fromarray(alpha, mode="L").convert("P")
    img.putpalette(list(INK) * 256)
    img.info["transparency"] = bytes(range(256))

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True, transparency=bytes(range(256)))
    return img.convert("RGBA"), path.stat().st_size


def tight(mask, box):
    """在给定行区间内收紧左右边界。"""
    y0, y1 = box
    sub = mask[y0:y1]
    cols = np.where(sub.any(axis=0))[0]
    rows = np.where(sub.any(axis=1))[0]
    if len(cols) == 0 or len(rows) == 0:
        return None
    return (y0 + rows[0], y0 + rows[-1] + 1, cols[0], cols[-1] + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor", type=float, default=0.16,
                    help="低于这个墨量的浅色填充直接抹掉（0-1，越大保留的线条越少）")
    ap.add_argument("--gamma", type=float, default=0.85,
                    help="<1 加重中间调，让细线更实")
    a = ap.parse_args()

    grid_p = SRC / "grid.png"
    well_p = SRC / "wellington.png"
    missing = [p.name for p in (grid_p, well_p) if not p.exists()]
    if missing:
        print(f"缺少源图：{', '.join(missing)}\n请放到 {SRC}", file=sys.stderr)
        return 1

    made = []

    # --- 宫格图 ---
    g = np.array(Image.open(grid_p).convert("RGB"))
    gm = content_mask(g)
    colbands, rowbands = split_grid(gm, ncol=5, nrow=2)
    print(f"grid.png {g.shape[1]}x{g.shape[0]} -> {len(colbands)} 列 x {len(rowbands)} 行")

    for ri, (ry0, ry1) in enumerate(rowbands):
        for ci, (cx0, cx1) in enumerate(colbands):
            idx = ri * len(colbands) + ci
            if idx >= len(GRID_KEYS):
                continue
            key = GRID_KEYS[idx]
            cell = gm[ry0:ry1, cx0:cx1]
            band = drop_caption(cell)
            box = tight(cell, band)
            if box is None:
                print(f"  ! {key} 是空的，跳过", file=sys.stderr)
                continue
            y0, y1, x0, x1 = box
            crop = g[ry0 + y0:ry0 + y1, cx0 + x0:cx0 + x1]
            alpha = to_watermark(crop, a.floor, a.gamma)
            img, size = save(alpha, OUT / f"{key}.png")
            made.append((key, img))
            print(f"  {key:18s} {img.width}x{img.height}  {size/1024:.1f} KB")

    # --- 威灵顿单图 ---
    w = np.array(Image.open(well_p).convert("RGB"))
    wm = content_mask(w)
    rows = np.where(wm.any(axis=1))[0]
    cols = np.where(wm.any(axis=0))[0]
    crop = w[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    alpha = to_watermark(crop, a.floor, a.gamma)
    img, size = save(alpha, OUT / "wellington.png")
    made.append(("wellington", img))
    print(f"  {'wellington':18s} {img.width}x{img.height}  {size/1024:.1f} KB")

    # --- 对照图：按现场实际观感排一张 ---
    cw, ch, pad = 260, 260, 14
    ncol = 4
    nrow = (len(made) + ncol - 1) // ncol
    sheet = Image.new("RGB", (ncol * (cw + pad) + pad, nrow * (ch + pad) + pad), PAPER)
    for i, (key, im) in enumerate(made):
        s = im.copy()
        s.thumbnail((cw, ch - 24), Image.LANCZOS)
        faded = s.copy()
        faded.putalpha(s.getchannel("A").point(lambda v: int(v * OPACITY)))
        x = pad + (i % ncol) * (cw + pad) + (cw - s.width) // 2
        y = pad + (i // ncol) * (ch + pad) + (ch - 24 - s.height) // 2
        sheet.paste(faded, (x, y), faded)
    cs = ROOT / "design" / "wm" / "contact-sheet.png"
    sheet.save(cs)

    total = sum((OUT / f"{k}.png").stat().st_size for k, _ in made)
    print(f"\n共 {len(made)} 张，合计 {total/1024:.0f} KB")
    print(f"对照图（已按 {int(OPACITY*100)}% 不透明度叠在纸色上）：{cs}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
