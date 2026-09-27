# -*- coding: utf-8 -*-
"""泳ぎのシート（1枚絵）を、コマを横に並べた PNG に切り分ける。

    python tools/cut_swimsheet.py tools/swimsheet.png [--debug]

シートの並び（タイプ5列 × 泳法の行）は下の SECTIONS に書いてある。
やっていること
  1. 背景（ほぼ白）以外を連結成分に分ける
  2. 行帯 × タイプの枠のなかで、左から順に「コマ」にまとめる
     （水しぶきで隣とくっついた塊は、いちばん細いところで割る）
  3. コマごとに切り抜いて（背景は透過）、**水面と体の中心をそろえて**横に並べる
  4. public/characters/<タイプID>/<姿>.png と manifest.json（コマ数つき）を書く

そろえ方が肝心：コマごとに「体の左右の中心」と「水面の高さ」を測り、
それが毎コマ同じ位置に来るように置く。ゲームは原点 (0.5, 0.64) で水面に合わせるので、
書き出したコマも**上から64%が水面**になるようにしてある。
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from charmanifest import merge_manifest  # noqa: E402

BG = 231

# 泳ぎの行（上から）。大人は4泳法＋潜る・浮上、幼児はバタ足3種。
ADULT_MODES = ["swimFree", "swimBreast", "swimBack", "swimFly", "dive"]
KID_MODES = ["kick", "float", "swim"]

# 同じ絵を別の姿にも使う。
#
# 大人タイプは**学童（小学生）も使う**ので、学童の水中の姿（kick＝ビート板バタ足／
# float＝浮く基礎練習）も要る。シートには大人のバタ足が無いので、
# クロールと平泳ぎで代用する（無いとその姿だけコード生成のドット絵に戻り、
# 学童がプールに入った瞬間だけ絵柄が変わってしまう）。
ALIAS_ADULT = {"swimFree": ["swim", "kick"], "swimBreast": ["float"]}
ALIAS_KID: dict[str, list[str]] = {}

SECTIONS = [
    {
        "name": "male",
        "rows": [(105, 144), (148, 184), (192, 223), (231, 260), (269, 306)],
        "modes": ADULT_MODES,
        "blocks": [(105, 371), (372, 637), (638, 908), (909, 1189), (1190, 1530)],
        "types": ["m_sporty", "m_muscle", "m_student", "m_office", "m_senior"],
        "alias": ALIAS_ADULT,
    },
    {
        "name": "female",
        "rows": [(413, 454), (459, 495), (502, 533), (541, 575), (583, 626)],
        "modes": ADULT_MODES,
        "blocks": [(105, 370), (371, 637), (638, 908), (909, 1190), (1191, 1530)],
        "types": ["f_energetic", "f_cool", "f_student", "f_adult", "f_senior"],
        "alias": ALIAS_ADULT,
    },
    {
        "name": "boys",
        "rows": [(716, 753), (769, 807), (824, 860)],
        "modes": KID_MODES,
        "blocks": [(85, 211), (212, 338), (339, 465), (466, 589), (590, 750)],
        "types": ["b_genki", "b_ottori", "b_yancha", "b_oshare", "b_nakimushi"],
        "alias": ALIAS_KID,
    },
    {
        "name": "girls",
        "rows": [(715, 751), (769, 806), (823, 858)],
        "modes": KID_MODES,
        "blocks": [(830, 956), (957, 1088), (1089, 1226), (1227, 1363), (1364, 1530)],
        "types": ["g_genki", "g_ottori", "g_yancha", "g_oshare", "g_nakimushi"],
        "alias": ALIAS_KID,
    },
]

FPS = {"swimFree": 7, "swimBreast": 6, "swimBack": 6, "swimFly": 7, "dive": 5, "kick": 7, "float": 5, "swim": 7}


# ---------------------------------------------------------------- 画素の判定
def is_bg(p) -> bool:
    r, g, b = p
    return r >= BG and g >= BG and b >= BG and (max(r, g, b) - min(r, g, b)) <= 14


def is_water(p) -> bool:
    """水しぶき・水面（明るい水色）。紺色の水着を water と間違えないように g も見る。"""
    r, g, b = p
    if b >= 195 and g >= 165 and (b - r) >= 35:
        return True
    return r >= 232 and g >= 232 and b >= 232  # 泡（白）


def is_arrow(im: Image.Image, b) -> bool:
    """コマとコマの間に描いてある灰色の矢印か（小さくて色が無い塊）。"""
    w = b["x1"] - b["x0"] + 1
    h = b["y1"] - b["y0"] + 1
    if w > 30 or h > 30:
        return False
    px = im.load()
    sat = 0
    n = 0
    for y in range(b["y0"], b["y1"] + 1):
        for x in range(b["x0"], b["x1"] + 1):
            r, g, bl = px[x, y]
            if is_bg((r, g, bl)):
                continue
            n += 1
            if max(r, g, bl) - min(r, g, bl) > 26:
                sat += 1
    return n > 0 and sat / n < 0.2


def load_components(im: Image.Image):
    w, h = im.size
    px = im.load()
    mask = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            if not is_bg(px[x, y]):
                mask[row + x] = 1
    label = [0] * (w * h)
    nb = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1))
    cur = 0
    boxes = {}
    for sy in range(h):
        base = sy * w
        for sx in range(w):
            i = base + sx
            if not mask[i] or label[i]:
                continue
            cur += 1
            label[i] = cur
            stack = [(sx, sy)]
            x0 = x1 = sx
            y0 = y1 = sy
            n = 0
            while stack:
                cx, cy = stack.pop()
                n += 1
                if cx < x0:
                    x0 = cx
                if cx > x1:
                    x1 = cx
                if cy < y0:
                    y0 = cy
                if cy > y1:
                    y1 = cy
                for dx, dy in nb:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if mask[j] and not label[j]:
                            label[j] = cur
                            stack.append((nx, ny))
            boxes[cur] = {"id": cur, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "n": n}
    return label, boxes


def split_frames(cell, im: Image.Image, label, min_w=26):
    """1マスぶんの塊を「コマ」に割る。

    コマとコマは、水しぶきの細い筋で繋がっていたり、離れていたりする。
    幅で割ろうとすると、しぶきの長いコマと2コマぶんの区別が付かない。
    そこで**縦に何画素あるか（列のプロフィール）**を見て、
    体がある列＝高い／コマの切れ目＝ほぼ0、の谷で割る。
    """
    if not cell:
        return []
    w, _ = im.size
    ids = {c["id"] for c in cell}
    x0 = min(c["x0"] for c in cell)
    x1 = max(c["x1"] for c in cell)
    y0 = min(c["y0"] for c in cell)
    y1 = max(c["y1"] for c in cell)

    cols = []
    for x in range(x0, x1 + 1):
        n = 0
        for y in range(y0, y1 + 1):
            if label[y * w + x] in ids:
                n += 1
        cols.append(n)

    # 切れ目＝縦の画素が LOW 以下の列が続くところ
    low = max(3, int(max(cols) * 0.12))
    edges = []
    run = None
    for i, v in enumerate(cols):
        if v <= low and run is None:
            run = i
        elif v > low and run is not None:
            if i - run >= 2:
                edges.append((run + i - 1) // 2)
            run = None
    parts = []
    start = 0
    for e in edges:
        parts.append((start, e))
        start = e + 1
    parts.append((start, len(cols) - 1))
    # 細すぎる断片は隣にくっつける（しぶきの粒・矢印のなごり）
    merged = []
    for a, b in parts:
        if b - a + 1 < min_w and merged:
            merged[-1] = (merged[-1][0], b)
        elif b - a + 1 < min_w and not merged:
            merged.append((a, b))
        else:
            merged.append((a, b))
    out = []
    for a, b in merged:
        if b - a + 1 < min_w:
            continue
        out.append({"x0": x0 + a, "x1": x0 + b, "y0": y0, "y1": y1, "ids": ids})
    return out


def cut_frame(im: Image.Image, label, g):
    """1コマぶんを RGBA で切り出し、体の中心と水面の位置も返す。"""
    w, _ = im.size
    px = im.load()
    x0, y0, x1, y1 = g["x0"], g["y0"], g["x1"], g["y1"]
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    ids = g["ids"]

    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    op = out.load()
    bx0 = by0 = 10**9
    bx1 = by1 = -1
    wsum = 0
    wn = 0
    body = []
    for y in range(ch):
        row = (y0 + y) * w
        for x in range(cw):
            if label[row + x0 + x] not in ids:
                continue
            p = px[x0 + x, y0 + y]
            op[x, y] = (*p, 255)
            if is_water(p):
                wsum += y
                wn += 1
            else:
                body.append((x, y))
                if x < bx0:
                    bx0 = x
                if x > bx1:
                    bx1 = x
                if y < by0:
                    by0 = y
                if y > by1:
                    by1 = y
    if bx1 < 0:
        return None
    # 【向きをそろえる】シートの泳ぎは**左向き**に描かれているが、
    # ゲームは「反転していない絵＝画面の右へ進む」で扱う（people.ts の setFlipX）。
    # ここで左右を返しておかないと、頭の向きと進む向きが逆になる。
    out = out.transpose(Image.FLIP_LEFT_RIGHT)
    bx0, bx1 = cw - 1 - bx1, cw - 1 - bx0
    body_cx = (bx0 + bx1) / 2
    # 水面＝水色の画素の平均の高さ。水が無いコマは体の下から1/4を水面とみなす
    water_y = (wsum / wn) if wn > 20 else by0 + (by1 - by0) * 0.75
    # 頭がどちら側にあるか（＝向きの確認用）。泳ぐ人は頭が上にあるので、
    # 体の上のほう35%にある画素の左右の平均を「頭の位置」とみなす。
    head_cut = by0 + max(2, (by1 - by0) * 0.35)
    top = [cw - 1 - bx for bx, by in body if by <= head_cut]
    head_x = (sum(top) / len(top)) if top else body_cx
    return {
        "img": out,
        "cx": body_cx,
        "cy": water_y,
        "bw": bx1 - bx0 + 1,
        "bh": by1 - by0 + 1,
        "faces_right": head_x >= body_cx,
    }


def compose(frames):
    """コマを、体の中心と水面をそろえて横に並べる（上から64%が水面）。"""
    left = max(f["cx"] for f in frames)
    right = max(f["img"].width - 1 - f["cx"] for f in frames)
    half = int(round(max(left, right))) + 1
    fw = half * 2
    top = max(f["cy"] for f in frames)
    bot = max(f["img"].height - 1 - f["cy"] for f in frames)
    fh = int(round(max(top / 0.64, bot / 0.36))) + 1
    anchor_y = int(round(fh * 0.64))
    strip = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        ox = i * fw + half - int(round(f["cx"]))
        oy = anchor_y - int(round(f["cy"]))
        strip.alpha_composite(f["img"], (ox, oy))
    return strip, fw, fh


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    debug = "--debug" in sys.argv
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(here, "..", "public", "characters"))

    im = Image.open(src).convert("RGB")
    label, boxes = load_components(im)
    print(f"{src}: {im.size[0]}x{im.size[1]} / 塊 {len(boxes)}")

    vis = im.copy() if debug else None
    d = ImageDraw.Draw(vis) if debug else None

    written = {}
    for sec in SECTIONS:
        for ri, (ry0, ry1) in enumerate(sec["rows"]):
            mode = sec["modes"][ri]
            row = [
                b
                for b in boxes.values()
                if b["y0"] >= ry0 - 4 and b["y1"] <= ry1 + 4 and (b["x1"] - b["x0"]) < 300
            ]
            for bi, (bx0, bx1) in enumerate(sec["blocks"]):
                type_id = sec["types"][bi]
                cell = [
                    b
                    for b in row
                    if bx0 <= (b["x0"] + b["x1"]) / 2 <= bx1 and not is_arrow(im, b)
                ]
                if not cell:
                    print(f"  !! {type_id}/{mode}: 塊が無い")
                    continue
                groups = split_frames(cell, im, label)
                frames = [cut_frame(im, label, g) for g in groups]
                frames = [f for f in frames if f]
                if not frames:
                    print(f"  !! {type_id}/{mode}: コマが無い")
                    continue
                strip, fw, fh = compose(frames)
                for name in [mode] + sec.get("alias", {}).get(mode, []):
                    dst = os.path.join(out_dir, type_id, name + ".png")
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    strip.save(dst)
                    written[f"{type_id}/{name}.png"] = {"frames": len(frames), "fps": FPS.get(name, 7)}
                if debug:
                    for g in groups:
                        d.rectangle([g["x0"], g["y0"], g["x1"], g["y1"]], outline=(255, 0, 0))
                back = sum(1 for f in frames if not f["faces_right"])
                warn = f"  ← ⚠ {back}コマが左を向いている（進む向きと逆になる）" if back else ""
                print(f"  {type_id}/{mode}.png  {len(frames)}コマ x {fw}x{fh}{warn}")

    if debug:
        vis.save(os.path.join(here, "vis_swim.png"))
        print("確認画像:", os.path.join(here, "vis_swim.png"))

    merge_manifest(out_dir, written)


if __name__ == "__main__":
    main()
