#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""筋トレルーム用ドット絵スプライト生成スクリプト。

カイロソフト風の経営ゲーム向けに、筋トレ器具の 2D スプライト(PNG)を出力する。
生成物は Aseprite での手直し前提なので、1文字 = 1ドットの ASCII マップと
PALETTE 辞書だけで全ドットが決まる構造にしてある。

    python tools/gen_gym_sprites.py

出力先は tools/out/ （スクリプトからの相対）。

--------------------------------------------------------------------------
ドット絵のルール（触るときは必ず守ること）
--------------------------------------------------------------------------
* 視点は「ほぼ正面 + 上面が 1〜2 ドット見える」で全スプライト統一。
  上面は outline_rect(..., top=...) で 1 ドット明るくして表現する。
* 1 マテリアルにつき ベース / 影 / ハイライト の 3 階調まで。
* 輪郭は黒ではなく暗い紫寄り (43, 34, 48)。'k'。
* 全スプライトに接地影を入れる（無いと家具が浮いて見える）。
* 器具は放っておくと全部グレーになるので、
  プレート = 赤、ベンチパッド = 青 のように必ず色のアクセントを入れる。
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow が必要です:  pip install pillow")


OUT_DIR = Path(__file__).resolve().parent / "out"
PREVIEW_SCALE = 6   # 拡大は必ず NEAREST（ぼかさない）
PREVIEW_PAD = 3     # 等倍でのスプライト間の余白


# ==========================================================================
# PALETTE : ここを書き換えるだけで全スプライトの色調が変わる
# ==========================================================================
# 1 マテリアル = ハイライト / ベース / 影 の 3 階調。
PALETTE: dict[str, tuple[int, int, int, int]] = {
    ".": (0, 0, 0, 0),          # 透明

    "k": (43, 34, 48, 255),     # 輪郭（黒ではなく暗い紫寄り）

    # スチール（バー・ハンドル・脚まわりの明るい金属）
    "W": (212, 218, 228, 255),  # highlight
    "M": (154, 162, 176, 255),  # base
    "m": (104, 112, 130, 255),  # shadow

    # フレーム（ラック本体の暗い金属。スチールと差をつけて手前後ろを出す）
    "N": (138, 146, 164, 255),  # highlight
    "F": (96, 104, 122, 255),   # base
    "f": (62, 68, 84, 255),     # shadow

    # 赤プレート（アクセント）
    "H": (232, 112, 96, 255),   # highlight
    "R": (196, 62, 62, 255),    # base
    "r": (140, 38, 52, 255),    # shadow

    # 青パッド（アクセント）
    "L": (104, 158, 226, 255),  # highlight
    "B": (58, 108, 190, 255),   # base
    "b": (36, 68, 136, 255),    # shadow

    "s": (43, 34, 48, 90),      # 接地影（半透明）
}

TRANSPARENT = "."
EDGE = "k"
SHADOW = "s"


# ==========================================================================
# Canvas
# ==========================================================================
class Canvas:
    """1 文字 = 1 ドットのグリッド。'.' が透明。"""

    def __init__(self, w: int, h: int) -> None:
        self.w = w
        self.h = h
        self.g = [[TRANSPARENT] * w for _ in range(h)]

    # -- 基本 --------------------------------------------------------------
    def px(self, x: int, y: int, char: str) -> None:
        """1 ドット打つ。範囲外は無視。"""
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = char

    def rect(self, x: int, y: int, w: int, h: int, char: str) -> None:
        """塗りつぶし矩形。"""
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, char)

    def outline_rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        fill: str,
        edge: str = EDGE,
        top: str | None = None,
    ) -> None:
        """輪郭付きの箱。

        top を指定すると内側の一番上の 1 ドット列を top 色にする
        （= 上面が 1 ドット見えている表現）。
        """
        self.rect(x, y, w, h, edge)
        if w > 2 and h > 2:
            self.rect(x + 1, y + 1, w - 2, h - 2, fill)
            if top is not None:
                self.rect(x + 1, y + 1, w - 2, 1, top)

    # -- ASCII マップ ------------------------------------------------------
    def stamp(self, ascii_art: str, ox: int, oy: int) -> None:
        """ASCII マップを (ox, oy) に貼る。'.' と ' ' は透過（下を残す）。"""
        for dy, line in enumerate(_art_rows(ascii_art)):
            for dx, char in enumerate(line):
                if char in (TRANSPARENT, " "):
                    continue
                self.px(ox + dx, oy + dy, char)

    # -- 接地影 ------------------------------------------------------------
    def shadow(self, cx: float, cy: float, rx: float, ry: float,
               char: str = SHADOW) -> None:
        """楕円の接地影。既に何か描かれているドットは塗らない。"""
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != TRANSPARENT:
                    continue
                dx = (x + 0.5 - cx) / rx
                dy = (y + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    self.g[y][x] = char

    # -- 出力 --------------------------------------------------------------
    def to_image(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        put = img.putpixel
        for y, row in enumerate(self.g):
            for x, char in enumerate(row):
                if char == TRANSPARENT:
                    continue
                try:
                    put((x, y), PALETTE[char])
                except KeyError:
                    raise KeyError(
                        f"PALETTE に '{char}' がありません (x={x}, y={y})"
                    ) from None
        return img


def _art_rows(ascii_art: str) -> list[str]:
    """前後の空行を落として行リストにする。

    行の長さが揃っていないと右側のドットが 1 ずれる（気付きにくい）ので、
    ここで矩形であることを検査する。
    """
    rows = ascii_art.strip("\n").split("\n")
    widths = {len(r) for r in rows}
    if len(widths) != 1:
        bad = [f"row {i}: {len(r)}" for i, r in enumerate(rows)
               if len(r) != len(rows[0])]
        raise ValueError(
            f"ASCII マップの行幅が揃っていません（期待 {len(rows[0])}）: "
            + ", ".join(bad)
        )
    return rows


def art_size(ascii_art: str) -> tuple[int, int]:
    rows = _art_rows(ascii_art)
    return (max(len(r) for r in rows), len(rows))


# ==========================================================================
# ASCII パーツ
# ==========================================================================

# 小ダンベル 9x5（プレート 4 ドット幅 + ハンドル 1 ドット）
SMALL_DUMBBELL = """
.kk...kk.
kHRk.kHRk
kRRkWkRRk
krrkkkrrk
.kk...kk.
"""

# 大ダンベル 13x7（プレート 5 ドット幅 + ハンドル 3 ドット）
BIG_DUMBBELL = """
.kkk.....kkk.
kHHRkWWWkHHRk
kHRRkMMMkHRRk
kRRRkkkkkRRRk
kRrrk...kRrrk
krrrk...krrrk
.kkk.....kkk.
"""

# スクワットラック用の大プレート 8x18（縦長：ラックに掛かった状態）
# row 8-10 がバーのハブ位置。バーは先に描いてこれを上から重ねる。
PLATE_BIG = """
..kkkk..
.kHHHRk.
kHHRRRRk
kHRRRRRk
kHRRRRRk
kRRRRRRk
kRRRRRRk
kRRRRRRk
kRRkkRRk
kRkWWkRk
kRRkkRRk
kRRRRRRk
kRRRRRRk
kRrrrrRk
kRrrrrrk
.krrrrk.
.krrrrk.
..kkkk..
"""

# 床置きバーベル用プレート 10x11（正面から見た円盤）
# row 5-6 がバーのハブ位置。
PLATE_FLOOR = """
...kkkk...
..kHHHRk..
.kHHRRRRk.
kHHRRRRRRk
kHRRRRRRRk
kRRkWWkRRk
kRRkmmkRRk
kRrRRRRRrk
.krrrrrrk.
..krrrrk..
...kkkk...
"""


# ==========================================================================
# スプライト
# ==========================================================================
def dumbbell_rack() -> Canvas:
    """30x26 : 2 段ラック。上段に小ダンベル x3、下段に大ダンベル x2。

    ダンベル単体だと小さすぎるので、ラックごと 1 オブジェクトにしてある。
    """
    c = Canvas(30, 26)

    # 支柱（一番奥）
    c.outline_rect(1, 9, 4, 13, "F", top="N")
    c.outline_rect(25, 9, 4, 13, "F", top="N")

    # 上段の棚 / 下段の棚
    c.outline_rect(0, 6, 30, 4, "F", top="N")
    c.outline_rect(0, 18, 30, 4, "F", top="N")

    # 接地する脚
    c.outline_rect(0, 21, 7, 3, "F", top="N")
    c.outline_rect(23, 21, 7, 3, "F", top="N")

    # 上段：小ダンベル x3（棚の上に乗る）
    for x in (1, 11, 21):
        c.stamp(SMALL_DUMBBELL, x, 1)

    # 下段：大ダンベル x2（支柱より手前に置いて奥行きを出す）
    for x in (1, 16):
        c.stamp(BIG_DUMBBELL, x, 11)

    c.shadow(15, 24, 15, 2.2)
    return c


def squat_rack() -> Canvas:
    """32x40 : 縦 2 本の支柱 + 横バー + 左右に大きい赤プレート。"""
    c = Canvas(32, 40)

    # 支柱
    c.outline_rect(4, 2, 5, 32, "F", top="N")
    c.outline_rect(23, 2, 5, 32, "F", top="N")

    # 支柱の穴（ラックらしさ）
    for y in range(7, 31, 4):
        c.px(6, y, "f")
        c.px(25, y, "f")

    # 上下のクロスビーム
    c.outline_rect(4, 2, 24, 4, "F", top="N")
    c.outline_rect(4, 26, 24, 4, "F", top="N")

    # 横バー → J フック（バーを抱える形）→ 大プレート の順に重ねる
    c.outline_rect(0, 12, 32, 4, "M", top="W")

    # J フック（赤いアクセント）
    c.outline_rect(8, 11, 4, 5, "R", top="H")
    c.outline_rect(20, 11, 4, 5, "R", top="H")

    c.stamp(PLATE_BIG, 0, 5)
    c.stamp(PLATE_BIG, 24, 5)

    # 接地する脚
    c.outline_rect(1, 33, 11, 4, "F", top="N")
    c.outline_rect(20, 33, 11, 4, "F", top="N")

    c.shadow(16, 37, 15.5, 2.2)
    return c


def bench() -> Canvas:
    """26x20 : 青いパッド + 金属脚 2 本。"""
    c = Canvas(26, 20)

    # パッド（上面 2 ドットを明るく → 少し見下ろした視点）
    c.outline_rect(1, 1, 24, 9, "B", top="L")
    c.rect(2, 3, 22, 1, "L")
    c.rect(2, 7, 22, 2, "b")
    # 四隅を落として角を丸める（他のスプライトの丸みに合わせる）
    for cx, cy in ((1, 1), (24, 1), (1, 9), (24, 9)):
        c.px(cx, cy, ".")

    # 脚
    c.outline_rect(4, 9, 5, 6, "M", top="W")
    c.outline_rect(17, 9, 5, 6, "M", top="W")

    # 接地するフット
    c.outline_rect(2, 13, 9, 3, "M", top="W")
    c.outline_rect(15, 13, 9, 3, "M", top="W")

    c.shadow(13, 17, 12, 2.0)
    return c


def barbell_floor() -> Canvas:
    """32x14 : 床置きバーベル。"""
    c = Canvas(32, 14)

    # シャフト → 左右のプレートを上から重ねる
    c.outline_rect(7, 4, 18, 4, "M", top="W")
    c.stamp(PLATE_FLOOR, 0, 0)
    c.stamp(PLATE_FLOOR, 22, 0)

    c.shadow(16, 11.5, 15.5, 1.8)
    return c


SPRITES = [
    ("dumbbell_rack", dumbbell_rack),
    ("squat_rack", squat_rack),
    ("bench", bench),
    ("barbell_floor", barbell_floor),
]


# ==========================================================================
# プレビュー
# ==========================================================================
PREVIEW_CHECKER = ((226, 223, 232, 255), (242, 240, 246, 255))
PREVIEW_TEXT = (86, 78, 96, 255)
PREVIEW_LABEL_H = 20


def _checkerboard(w: int, h: int, cell: int) -> Image.Image:
    img = Image.new("RGBA", (w, h), PREVIEW_CHECKER[0])
    d = ImageDraw.Draw(img)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1],
                            fill=PREVIEW_CHECKER[1])
    return img


def build_preview(sprites: list[tuple[str, Image.Image]]) -> Image.Image:
    """全スプライトを横並び・下端揃えにした 6 倍プレビュー。"""
    pad = PREVIEW_PAD
    sheet_w = sum(im.width for _, im in sprites) + pad * (len(sprites) + 1)
    sheet_h = max(im.height for _, im in sprites) + pad * 2

    # まず等倍で並べてから NEAREST で拡大する（絶対にぼかさない）
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    x = pad
    for _, im in sprites:
        sheet.alpha_composite(im, (x, sheet_h - pad - im.height))
        x += im.width + pad

    scale = PREVIEW_SCALE
    big = sheet.resize((sheet_w * scale, sheet_h * scale), Image.NEAREST)

    out = _checkerboard(big.width, big.height + PREVIEW_LABEL_H, scale * 2)
    d = ImageDraw.Draw(out)
    d.rectangle([0, big.height, out.width, out.height], fill=PREVIEW_CHECKER[1])
    out.alpha_composite(big, (0, 0))

    try:
        font = ImageFont.load_default(size=13)
    except TypeError:  # 古い Pillow
        font = ImageFont.load_default()

    x = pad * scale
    for name, im in sprites:
        w = im.width * scale
        label = f"{name} {im.width}x{im.height}"
        tw = d.textlength(label, font=font)
        d.text((x + (w - tw) / 2, big.height + 4), label,
               fill=PREVIEW_TEXT, font=font)
        x += w + pad * scale

    return out


# ==========================================================================
def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    built: list[tuple[str, Image.Image]] = []
    for name, fn in SPRITES:
        img = fn().to_image()
        path = OUT_DIR / f"{name}.png"
        img.save(path)
        built.append((name, img))
        print(f"  {path.name:<20} {img.width}x{img.height}")

    preview_path = OUT_DIR / "_preview.png"
    preview = build_preview(built)
    preview.save(preview_path)
    print(f"  {preview_path.name:<20} {preview.width}x{preview.height} "
          f"({PREVIEW_SCALE}x)")
    print(f"\n-> {OUT_DIR}")


if __name__ == "__main__":
    main()
