# -*- coding: utf-8 -*-
"""キャラ素材シート（1枚絵）を public/characters/ の PNG に切り分ける。

    python tools/cut_charsheet.py tools/charsheet.png

やっていること
  1. 背景（ほぼ白）以外を拾って、**人ひとつぶんの塊**（連結成分）に分ける
  2. その塊だけを残して切り抜く（背景は透過）
  3. 輪郭に囲まれた白（白いシャツなど）は穴埋めで戻す
  4. 足元が画像の下端中央に来るように左右へ余白を足す
     （ゲーム側は原点 0.5,1 で置くので、これで立ち位置がズレない）
  5. public/characters/<タイプID>/<姿>.png と manifest.json を書く

大きさは合わせなくてよい。**縦＝背丈**として扱い、表示のときに
gfx/charAssets.ts の charAssetScale() が体型ごとの背丈に直す。

【シートを描き直したら】下の ASSIGN（どの塊がどのタイプのどの姿か）を直すこと。
`--debug` を付けると、塊に番号を振った vis.png を書き出すので、その番号で指定する。
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from charmanifest import merge_manifest  # noqa: E402

# 背景とみなす明るさ（これ以上の明るさで、色が付いていない画素）
BG = 231
# 小さすぎる塊は文字・飾りなので捨てる
MIN_W, MIN_H, MIN_PIXELS = 12, 16, 400

# --------------------------------------------------------------------------
# どの塊が、どのタイプのどの姿か。
#   (タイプID, 姿, [(塊の番号, その塊の左上座標, 左右反転), ...])
#
# コマを2つ以上書くと**歩くアニメーション**になる（横に並べた1枚のPNGになる）。
# 同じ行から、向きがそろっていて足の位置が違う2つを選ぶこと。
# 向きは「右向き」にそろえる：ゲームは進行方向で左右反転するので、
# 反転していない絵は**画面の右へ歩くとき**に出る（左向きの絵だと後ろ歩きに見える）。
#
# 座標は「シートを差し替えたのに番号だけ直し忘れた」を検出するための保険。
# 番号は `--debug` で出る vis.png の赤枠の数字。
# --------------------------------------------------------------------------
ASSIGN = [
    # 男性 ------------------------------------------------------------------
    ("m_sporty", "walk", [(25, (45, 130), False), (30, (108, 131), False)]),
    ("m_sporty", "walkBack", [(33, (176, 132), True)]),  # 背面が無いので横向きで代用
    ("m_sporty", "train", [(43, (35, 232), False)]),
    ("m_muscle", "walk", [(23, (325, 129), False), (24, (459, 129), False)]),
    ("m_muscle", "walkBack", [(22, (526, 128), False)]),
    ("m_muscle", "train", [(51, (312, 234), False)]),
    ("m_student", "walk", [(27, (613, 130), False), (32, (684, 131), False)]),
    ("m_student", "walkBack", [(29, (827, 130), False)]),
    ("m_student", "train", [(52, (591, 234), False)]),
    ("m_office", "walk", [(34, (911, 132), False), (35, (979, 132), False)]),
    ("m_office", "walkBack", [(38, (1114, 133), False)]),
    # 社会人・シニア・大人女子のトレーニング姿は、シートではマシンごと描かれている。
    # 施設にはマシンの絵が既に置いてあって二重になるので、立ち姿で代用する
    # （用意しないとその姿だけドット絵に戻り、筋トレルームで絵柄が混ざる）。
    ("m_office", "train", [(34, (911, 132), False)]),
    ("m_senior", "walk", [(36, (1199, 132), False), (39, (1271, 134), False)]),
    ("m_senior", "walkBack", [(41, (1422, 134), False)]),
    ("m_senior", "train", [(36, (1199, 132), False)]),
    # 女性 ------------------------------------------------------------------
    ("f_energetic", "walk", [(81, (23, 455), False), (75, (171, 452), False)]),
    ("f_energetic", "walkBack", [(76, (255, 452), False)]),
    ("f_energetic", "train", [(91, (20, 578), False)]),
    # クール系は正面向きが1つしか無い（もう1つは左向きで、混ぜると振り向いて見える）
    ("f_cool", "walk", [(78, (412, 453), False)]),
    ("f_cool", "walkBack", [(66, (483, 451), False), (67, (552, 451), False)]),
    ("f_cool", "train", [(86, (488, 573), False)]),
    ("f_student", "walk", [(68, (634, 451), False)]),
    ("f_student", "walkBack", [(70, (772, 451), False), (71, (837, 451), False)]),
    ("f_student", "train", [(92, (640, 578), False)]),
    ("f_adult", "walk", [(77, (987, 452), True)]),
    ("f_adult", "walkBack", [(73, (1114, 451), False)]),
    ("f_adult", "train", [(77, (987, 452), True)]),
    ("f_senior", "walk", [(84, (1271, 456), True), (83, (1347, 455), True)]),
    ("f_senior", "walkBack", [(85, (1421, 456), False)]),
    ("f_senior", "train", [(90, (1322, 577), False)]),
    # 幼児（歩きのコマがシートに無いので立ち姿1枚）--------------------------
    ("b_genki", "walk", [(113, (59, 762), False)]),
    ("b_ottori", "walk", [(114, (202, 762), False)]),
    ("b_yancha", "walk", [(110, (344, 761), False)]),
    ("b_oshare", "walk", [(115, (491, 763), False)]),
    ("b_nakimushi", "walk", [(118, (629, 766), False)]),
    ("g_genki", "walk", [(116, (782, 763), False)]),
    ("g_ottori", "walk", [(111, (944, 761), False)]),
    ("g_yancha", "walk", [(117, (1085, 763), False)]),
    ("g_oshare", "walk", [(112, (1254, 761), False)]),
    ("g_nakimushi", "walk", [(119, (1402, 766), False)]),
]

# 歩きのコマ送りの早さ（遅いと足踏み、速いと小走りに見える）
WALK_FPS = 5

# 幼児は背面の絵がシートに無い。正面をそのまま背面にも使う
# （用意しないとその姿だけコード生成のドット絵に戻り、歩くたびに絵柄が入れ替わってしまう）。
KID_TYPES = (
    "b_genki", "b_ottori", "b_yancha", "b_oshare", "b_nakimushi",
    "g_genki", "g_ottori", "g_yancha", "g_oshare", "g_nakimushi",
)


def load_mask(im: Image.Image) -> bytearray:
    """背景でない画素を 1 にした配列。"""
    w, h = im.size
    px = im.load()
    mask = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            if r >= BG and g >= BG and b >= BG and (max(r, g, b) - min(r, g, b)) <= 14:
                continue
            mask[row + x] = 1
    return mask


def label_components(mask: bytearray, w: int, h: int) -> list[int]:
    """8近傍で塊に番号を振る（0＝背景）。"""
    label = [0] * (w * h)
    nb = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1))
    cur = 0
    for sy in range(h):
        base = sy * w
        for sx in range(w):
            i = base + sx
            if not mask[i] or label[i]:
                continue
            cur += 1
            label[i] = cur
            stack = [(sx, sy)]
            while stack:
                cx, cy = stack.pop()
                for dx, dy in nb:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if mask[j] and not label[j]:
                            label[j] = cur
                            stack.append((nx, ny))
    return label


def boxes_of(label: list[int], w: int, h: int) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for y in range(h):
        row = y * w
        for x in range(w):
            L = label[row + x]
            if not L:
                continue
            b = out.get(L)
            if b is None:
                out[L] = {"x0": x, "y0": y, "x1": x, "y1": y, "n": 1}
            else:
                if x < b["x0"]:
                    b["x0"] = x
                if x > b["x1"]:
                    b["x1"] = x
                if y > b["y1"]:
                    b["y1"] = y
                b["n"] += 1
    return out


def gap(a: dict, b: dict) -> int:
    dx = max(0, max(a["x0"], b["x0"]) - min(a["x1"], b["x1"]))
    dy = max(0, max(a["y0"], b["y0"]) - min(a["y1"], b["y1"]))
    return max(dx, dy)


def figures(label: list[int], w: int, h: int) -> list[dict]:
    """塊を「人ひとり」の単位にまとめる。

    持っているボール・落ちている影・離れた手足は別の塊になるので、
    すぐ隣（3px 以内）にある小さい塊は本体に合体させる。
    合体させすぎると隣の人とくっつくので、大きさに上限を置く。
    """
    boxes = boxes_of(label, w, h)
    items = []
    for L, b in boxes.items():
        if b["n"] < 40:
            continue
        b["labels"] = {L}
        items.append(b)

    changed = True
    while changed:
        changed = False
        items.sort(key=lambda c: -c["n"])
        merged: list[dict] = []
        used = [False] * len(items)
        for i, a in enumerate(items):
            if used[i]:
                continue
            cur = a
            for j in range(i + 1, len(items)):
                if used[j]:
                    continue
                b = items[j]
                if gap(cur, b) <= 3 and (b["n"] < 900 or gap(cur, b) == 0):
                    m = {
                        "x0": min(cur["x0"], b["x0"]),
                        "y0": min(cur["y0"], b["y0"]),
                        "x1": max(cur["x1"], b["x1"]),
                        "y1": max(cur["y1"], b["y1"]),
                        "n": cur["n"] + b["n"],
                        "labels": cur["labels"] | b["labels"],
                    }
                    if m["y1"] - m["y0"] <= 130 and m["x1"] - m["x0"] <= 150:
                        cur = m
                        used[j] = True
                        changed = True
            merged.append(cur)
        items = merged

    items = [
        c
        for c in items
        if (c["x1"] - c["x0"]) >= MIN_W and (c["y1"] - c["y0"]) >= MIN_H and c["n"] >= MIN_PIXELS
    ]
    items.sort(key=lambda c: (c["y0"], c["x0"]))
    return items


def cut(im: Image.Image, label: list[int], fig: dict) -> Image.Image:
    """1体ぶんを RGBA で切り出す。"""
    w, _ = im.size
    px = im.load()
    x0, y0, x1, y1 = fig["x0"], fig["y0"], fig["x1"], fig["y1"]
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    labels = fig["labels"]

    keep = bytearray(cw * ch)
    for y in range(ch):
        row = (y0 + y) * w
        for x in range(cw):
            if label[row + x0 + x] in labels:
                keep[y * cw + x] = 1

    # 外周から届かない「非keep」は輪郭の内側＝白いシャツなど。透過させずに残す。
    outside = bytearray(cw * ch)
    stack = []

    def seed(x: int, y: int) -> None:
        i = y * cw + x
        if not keep[i] and not outside[i]:
            outside[i] = 1
            stack.append((x, y))

    for x in range(cw):
        seed(x, 0)
        seed(x, ch - 1)
    for y in range(ch):
        seed(0, y)
        seed(cw - 1, y)
    while stack:
        cx, cy = stack.pop()
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < cw and 0 <= ny < ch:
                seed(nx, ny)

    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    op = out.load()
    for y in range(ch):
        for x in range(cw):
            if not outside[y * cw + x]:
                op[x, y] = (*px[x0 + x, y0 + y], 255)

    # 足元（下から12%）の左右の真ん中を画像の中央に持ってくる
    foot_rows = max(2, int(ch * 0.12))
    lo = hi = None
    for y in range(ch - foot_rows, ch):
        for x in range(cw):
            if op[x, y][3]:
                lo = x if lo is None else min(lo, x)
                hi = x if hi is None else max(hi, x)
    if lo is None:
        lo, hi = 0, cw - 1
    fc = (lo + hi) / 2
    left = max(0, int(round(cw - 1 - 2 * fc)))
    right = max(0, int(round(2 * fc - (cw - 1))))
    canvas = Image.new("RGBA", (cw + left + right, ch), (0, 0, 0, 0))
    canvas.paste(out, (left, 0))
    return canvas


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    debug = "--debug" in sys.argv
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(here, "..", "public", "characters"))

    im = Image.open(src).convert("RGB")
    w, h = im.size
    label = label_components(load_mask(im), w, h)
    figs = figures(label, w, h)
    print(f"{src}: {w}x{h} / 人の塊 {len(figs)} 個")

    if debug:
        vis = im.copy()
        d = ImageDraw.Draw(vis)
        for k, c in enumerate(figs):
            d.rectangle([c["x0"], c["y0"], c["x1"], c["y1"]], outline=(255, 0, 0))
            d.text((c["x0"] + 1, c["y0"] + 1), str(k), fill=(180, 0, 0))
        vis.save(os.path.join(here, "vis.png"))
        print("番号つきの確認画像:", os.path.join(here, "vis.png"))

    todo = list(ASSIGN)
    for t in KID_TYPES:
        src_row = next(a for a in todo if a[0] == t and a[1] == "walk")
        todo.append((t, "walkBack", src_row[2]))

    written = {}
    for type_id, mode, frames in todo:
        imgs = []
        for k, expect, flip in frames:
            if k >= len(figs):
                raise SystemExit(f"{type_id}/{mode}: 塊 {k} が無い（シートを差し替えたら ASSIGN を直すこと）")
            c = figs[k]
            if (c["x0"], c["y0"]) != tuple(expect):
                raise SystemExit(
                    f"{type_id}/{mode}: 塊 {k} の位置が変わっている "
                    f"（いま {(c['x0'], c['y0'])} / 期待 {tuple(expect)}）。--debug で番号を取り直すこと"
                )
            img = cut(im, label, c)
            if flip:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            imgs.append(img)
        strip = compose(imgs)
        d = os.path.join(out_dir, type_id)
        os.makedirs(d, exist_ok=True)
        strip.save(os.path.join(d, mode + ".png"))
        written[f"{type_id}/{mode}.png"] = {"frames": len(imgs), "fps": WALK_FPS}
        print(f"  {type_id}/{mode}.png  {len(imgs)}コマ x {strip.width // len(imgs)}x{strip.height}")

    merge_manifest(out_dir, written)


def compose(imgs):
    """コマを横に並べる。**足元は下端の中央**（cut がそこにそろえてある）。

    コマごとに背丈が少し違うので、いちばん高いコマに合わせて下ぞろえにする。
    歩きは足を上げたコマのほうが少し低くなるので、この差がそのまま
    「歩くときの上下の揺れ」になる。
    """
    fw = max(i.width for i in imgs)
    fh = max(i.height for i in imgs)
    strip = Image.new("RGBA", (fw * len(imgs), fh), (0, 0, 0, 0))
    for i, img in enumerate(imgs):
        strip.alpha_composite(img, (i * fw + (fw - img.width) // 2, fh - img.height))
    return strip


if __name__ == "__main__":
    main()
