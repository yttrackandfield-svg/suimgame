# -*- coding: utf-8 -*-
"""コーチのスプライトシートを読み取って、**切り出し座標の表（アトラス）**を書き出す。

    python tools/cut_coachsheet.py [--debug]

やっていること
  1. 方向ラベルの帯（「下向き」などの色付きの角丸）を見つける
     ＝ これが「5人 × 8方向」の升目の目印になる（キャラの間隔は一定でないので、
        等間隔グリッドでは切れない）
  2. 升目ごとに、**上の段のコマ**を左から順に切り出す
     （下の段は向きの揃っていないコマが混じるので使わない）
  3. コマの大きさを升目の中でそろえる（足元＝下端中央でそろえる）
  4. assets/characters/atlas.ts に書き出す

**画像は切らない。** ゲームはシートを1枚読み込んで、この座標表で切り出す。
ズレていたら atlas.ts の数字だけ直せばよい（画像を作り直さなくてよい）。

【向き】ゲームは「反転していない絵＝画面の右へ進む」で扱う。
シートでは右向きが左向きの絵で描かれていることがあるので、顔（肌色）がどちら寄りかを
測って、右へ進む向きの絵が左を向いていたら `flip: true` を立てる。
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cut_charsheet as cc  # noqa: E402

SHEETS = [
    {"file": "coach_normal.png", "key": "normal"},
    {"file": "coach_pro.png", "key": "pro"},
]

NAMES = {
    "normal": [
        "ベテランコーチ（男性）",
        "女性コーチ（明るい）",
        "若手男性コーチ（さわやか）",
        "ベテラン女性コーチ（落ち着き）",
        "男性コーチ（厳しめ）",
    ],
    "pro": [
        "カリスマスイムコーチ（男性）",
        "エリート女性コーチ（女性）",
        "メダリストコーチ（女性）",
        "経験豊富なベテランコーチ（男性）",
        "プレミアムコーチ（男性）",
    ],
}

# ラベルの並び順（シートのとおり）。ゲーム側の Dir8 と同じ綴り。
DIRS = ["down", "up", "left", "right", "downLeft", "downRight", "upLeft", "upRight"]
# 画面の右へ進む向き（絵が左を向いていたら反転して使う）
RIGHTWARD = {"right", "downRight", "upRight"}

# 【シートごとの向きの癖】目で確かめた結果をそのまま書いてある。
#   どちらのシートも、right / downRight / upRight の列は**ちゃんと右を向いて**描かれている。
#   （2026-08 修正：通常コーチを「左向き」と誤って書いていたため、右へ歩くコーチが
#    ぜんぶ反転して**うしろ歩き**になっていた。素の切り出しを並べて確認済み。）
# 顔（肌色）の寄りで自動判定も試したが、斜め後ろ向きは顔がほとんど見えず当てにならないので、
# ここで明示する。**シートを描き直したら、tools の --preview で見て直すこと。**
FLIP_RIGHTWARD = {"normal": False, "pro": False}

# 待機・向き変更アニメのブロックが始まる x（ここから右は歩行の升目ではない）
IDLE_X0 = 1240
# 1コマの最小幅（これより細い切れ端は捨てる）
MIN_FRAME_W = 12


def is_skin(p) -> bool:
    r, g, b = p
    return r > 185 and 110 < g < 215 and 60 < b < 180 and (r - b) > 45 and r >= g >= b


def clean_mask(im: Image.Image):
    """人物の画素だけを残したマスク（パネルの枠線・区切り線を落とす）。"""
    w, h = im.size
    label = cc.label_components(cc.load_mask(im), w, h)
    boxes = cc.boxes_of(label, w, h)
    keep = set()
    for L, b in boxes.items():
        bw = b["x1"] - b["x0"] + 1
        bh = b["y1"] - b["y0"] + 1
        if b["n"] < 25:
            continue
        if bw > 170 or bh > 170:  # パネルの枠・長い罫線
            continue
        keep.add(L)
    mask = bytearray(w * h)
    for i, L in enumerate(label):
        if L in keep:
            mask[i] = 1
    return mask, boxes, keep, label


def find_pills(im: Image.Image, boxes):
    """方向ラベルの帯（色の付いた角丸）。5行 × 8個。"""
    px = im.load()
    out = []
    for b in boxes.values():
        bw = b["x1"] - b["x0"] + 1
        bh = b["y1"] - b["y0"] + 1
        if not (55 <= bw <= 120 and 15 <= bh <= 32) or b["x0"] < 200:
            continue
        sat = n = 0
        for y in range(b["y0"], b["y1"] + 1, 2):
            for x in range(b["x0"], b["x1"] + 1, 2):
                r, g, bl = px[x, y]
                n += 1
                if max(r, g, bl) - min(r, g, bl) > 40:
                    sat += 1
        if n and sat / n > 0.5:
            out.append(b)
    out.sort(key=lambda b: (b["y0"], b["x0"]))
    rows = []
    for b in out:
        if not rows or b["y0"] - rows[-1][0]["y0"] > 20:
            rows.append([])
        rows[-1].append(b)
    for r in rows:
        r.sort(key=lambda b: b["x0"])
    return [r for r in rows if len(r) == 8]


def block_ranges(pills):
    """8つのラベルから、升目の x 範囲を作る（ラベルの中点で割る）。"""
    cx = [(p["x0"] + p["x1"]) / 2 for p in pills]
    pitch = (cx[-1] - cx[0]) / (len(cx) - 1)
    edges = [cx[0] - pitch / 2] + [(cx[i] + cx[i + 1]) / 2 for i in range(len(cx) - 1)] + [cx[-1] + pitch / 2]
    return [(int(round(edges[i])), int(round(edges[i + 1]))) for i in range(len(cx))]


def first_band(mask, w, x0, x1, y0, y1, min_h=28):
    """その升目で、上から最初に見つかる「人が並んでいる帯」。"""
    rows = []
    for y in range(y0, y1 + 1):
        n = 0
        base = y * w
        for x in range(x0, x1 + 1):
            if mask[base + x]:
                n += 1
        rows.append(n)
    bands = []
    s = None
    for i, v in enumerate(rows):
        if v > 0 and s is None:
            s = i
        elif v == 0 and s is not None:
            bands.append((s + y0, i - 1 + y0))
            s = None
    if s is not None:
        bands.append((s + y0, y1))
    for a, b in bands:
        if b - a + 1 >= min_h:
            return a, b
    return None


def row_band(mask, w, x0, x1, y0, y1, max_h=100):
    """その行の「上の段」の上下（行ぜんぶを見て決める）。

    上下2段が繋がって1本に見えたときは、**いちばん薄い行**で割って上半分を採る。
    """
    prof = []
    for y in range(y0, y1 + 1):
        base = y * w
        n = 0
        for x in range(x0, x1 + 1):
            if mask[base + x]:
                n += 1
        prof.append(n)
    bands = []
    s = None
    for i, v in enumerate(prof):
        if v > 0 and s is None:
            s = i
        elif v == 0 and s is not None:
            bands.append((s, i - 1))
            s = None
    if s is not None:
        bands.append((s, len(prof) - 1))
    bands = [b for b in bands if b[1] - b[0] + 1 >= 28]
    if not bands:
        return None
    a, b = bands[0]
    if b - a + 1 > max_h:
        lo = a + int((b - a) * 0.35)
        hi = a + int((b - a) * 0.65)
        cut = min(range(lo, hi + 1), key=lambda i: prof[i])
        b = cut
    return a + y0, b + y0


def split_frames(mask, w, x0, x1, y0, y1):
    """帯の中を、縦に画素の無い列で区切ってコマに分ける。"""
    cols = []
    for x in range(x0, x1 + 1):
        n = 0
        for y in range(y0, y1 + 1):
            if mask[y * w + x]:
                n += 1
        cols.append(n)
    parts = []
    s = None
    for i, v in enumerate(cols):
        if v > 0 and s is None:
            s = i
        elif v == 0 and s is not None:
            parts.append((s + x0, i - 1 + x0))
            s = None
    if s is not None:
        parts.append((s + x0, x1))
    return [(a, b) for a, b in parts if b - a + 1 >= MIN_FRAME_W]


def tight_box(mask, w, x0, x1, y0, y1):
    """その範囲の中で、実際に画素がある四角。"""
    bx0 = by0 = 10**9
    bx1 = by1 = -1
    for y in range(y0, y1 + 1):
        base = y * w
        for x in range(x0, x1 + 1):
            if mask[base + x]:
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
    return {"x0": bx0, "y0": by0, "x1": bx1, "y1": by1}


def unify(boxes):
    """升目の中のコマを同じ大きさにそろえる（足元＝下端中央）。"""
    w = max(b["x1"] - b["x0"] + 1 for b in boxes)
    h = max(b["y1"] - b["y0"] + 1 for b in boxes)
    out = []
    for b in boxes:
        cx = (b["x0"] + b["x1"]) / 2
        out.append((int(round(cx - w / 2)), b["y1"] - h + 1, w, h))
    return out


def write_alpha_sheet(im: Image.Image, mask, rects, dst: str) -> None:
    """背景を透過させたシートを書き出す。

    ゲームはこのシートを**アトラスの座標のまま**切り出すので、位置は元のシートと同じ。
    切り出す四角の中だけを、外周から届く背景（白・薄い灰）を消して写す。
    輪郭に囲まれた白（白いシャツなど）は外周から届かないので残る。
    """
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for x0, y0, rw, rh in rects:
        x1 = min(w - 1, x0 + rw - 1)
        y1 = min(h - 1, y0 + rh - 1)
        x0 = max(0, x0)
        y0 = max(0, y0)
        cw = x1 - x0 + 1
        ch = y1 - y0 + 1
        outside = bytearray(cw * ch)
        stack = []

        def seed(cx: int, cy: int) -> None:
            i = cy * cw + cx
            if outside[i] or mask[(y0 + cy) * w + x0 + cx]:
                return
            outside[i] = 1
            stack.append((cx, cy))

        for cx in range(cw):
            seed(cx, 0)
            seed(cx, ch - 1)
        for cy in range(ch):
            seed(0, cy)
            seed(cw - 1, cy)
        while stack:
            cx, cy = stack.pop()
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < cw and 0 <= ny < ch:
                    seed(nx, ny)
        for cy in range(ch):
            for cx in range(cw):
                if not outside[cy * cw + cx]:
                    op[x0 + cx, y0 + cy] = (*px[x0 + cx, y0 + cy], 255)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)


def facing_of(im: Image.Image, mask, w, box) -> float:
    """顔（肌色）が体の左右どちら寄りか。>0 なら右向き。"""
    px = im.load()
    head = box["y0"] + (box["y1"] - box["y0"]) * 0.45
    sx = sn = ax = an = 0
    for y in range(box["y0"], int(head) + 1):
        for x in range(box["x0"], box["x1"] + 1):
            if not mask[y * w + x]:
                continue
            ax += x
            an += 1
            if is_skin(px[x, y]):
                sx += x
                sn += 1
    if sn < 10 or an == 0:
        return 0.0
    return (sx / sn) - (ax / an)


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, ".."))
    out_path = os.path.join(root, "assets", "characters", "atlas.ts")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    debug = "--debug" in sys.argv

    patterns = []
    for sheet in SHEETS:
        src = os.path.join(here, sheet["file"])
        im = Image.open(src).convert("RGB")
        w, h = im.size
        mask, boxes, _keep, _label = clean_mask(im)
        rows = find_pills(im, boxes)
        print(f"{sheet['file']}: {w}x{h} / ラベルの行 {len(rows)}")
        if len(rows) != 5:
            raise SystemExit("  !! 5人ぶんのラベル行が見つからない")

        vis = im.copy() if debug else None
        d = ImageDraw.Draw(vis) if debug else None
        used_rects: list[tuple[int, int, int, int]] = []

        for i, pills in enumerate(rows):
            top = pills[0]["y1"] + 6
            bottom = (rows[i + 1][0]["y0"] - 12) if i + 1 < len(rows) else h - 60
            ranges = [(max(0, a), min(IDLE_X0 - 1, b)) for a, b in block_ranges(pills)]
            # 上の段の高さは**行ぜんぶを見て**決める。
            # 升目ごとに測ると、髪や足がはみ出して上下の段が繋がった升目で
            # 「2段ぶん」を1コマとして切り出してしまう。
            band = row_band(mask, w, ranges[0][0], ranges[-1][1], top, bottom)
            if not band:
                raise SystemExit(f"  !! {sheet['key']}#{i + 1}: コマの帯が見つからない")
            by0, by1 = band

            dirs = []
            for name, (bx0, bx1) in zip(DIRS, ranges):
                parts = split_frames(mask, w, bx0, bx1, by0, by1)
                cells = [tight_box(mask, w, a, b, by0, by1) for a, b in parts]
                cells = [c for c in cells if c]
                if not cells:
                    raise SystemExit(f"  !! {sheet['key']}#{i + 1} {name}: コマが取れない")
                face = sum(facing_of(im, mask, w, c) for c in cells) / len(cells)
                rects = unify(cells)
                dirs.append([name, rects, False, face])
                used_rects.extend(rects)
                if debug:
                    for r in rects:
                        d.rectangle([r[0], r[1], r[0] + r[2] - 1, r[1] + r[3] - 1], outline=(255, 0, 0))

            # 【右向きの絵が左向きで描かれていることがある】
            # 顔の寄りの絶対値だけで決めると、斜め後ろ向き（顔がほとんど見えない）で外す。
            # そこで**左右で対になる向き**と見比べて、「左の絵と同じ描かれ方」なら反転する。
            for row_d in dirs:
                row_d[2] = row_d[0] in RIGHTWARD and FLIP_RIGHTWARD[sheet["key"]]
            for name, rects, flip, face in dirs:
                print(
                    f"    {sheet['key']}#{i + 1} {name}: {len(rects)}コマ "
                    f"{rects[0][2]}x{rects[0][3]} 顔の寄り {face:+.1f}{' → 反転' if flip else ''}"
                )

            # 待機（正面）＝右の「待機・向き変更」ブロックのいちばん左
            idle_boxes = [
                b
                for b in boxes.values()
                if b["x0"] >= IDLE_X0
                and top - 40 <= b["y0"] <= bottom + 60
                and b["n"] > 800
                # 「待機・向き変更アニメーション」の見出し文字を拾わないように、
                # 人らしい大きさ（縦長）のものだけにする
                and 20 <= (b["x1"] - b["x0"] + 1) <= 100
                and (b["y1"] - b["y0"] + 1) >= 45
            ]
            idle_boxes.sort(key=lambda b: b["x0"])
            if not idle_boxes:
                raise SystemExit(f"  !! {sheet['key']}#{i + 1}: 待機の絵が見つからない")
            ib = idle_boxes[0]
            idle = (ib["x0"], ib["y0"], ib["x1"] - ib["x0"] + 1, ib["y1"] - ib["y0"] + 1)
            used_rects.append(idle)
            if debug:
                d.rectangle([idle[0], idle[1], idle[0] + idle[2] - 1, idle[1] + idle[3] - 1], outline=(0, 160, 255))
            patterns.append((sheet["key"], i, NAMES[sheet["key"]][i], idle, [(n, r, fl) for n, r, fl, _f in dirs]))

        # ゲームが読むのは**背景を透過させたシート**（座標は元のまま）
        dst = os.path.join(root, "public", "characters", "sheets", f"coach_{sheet['key']}.png")
        write_alpha_sheet(im, mask, used_rects, dst)
        print(f"  透過シート: {dst}（{len(used_rects)}枠）")

        if debug:
            p = os.path.join(here, f"vis_{sheet['key']}.png")
            vis.save(p)
            print("  確認画像:", p)

    blocks = []
    for key, i, name, idle, dirs in patterns:
        lines = []
        for dname, rects, flip in dirs:
            rs = ", ".join(f"[{r[0]},{r[1]},{r[2]},{r[3]}]" for r in rects)
            lines.append(f"      {dname}: {{ f: [{rs}]{', flip: true' if flip else ''} }},")
        blocks.append(
            f'  {{\n    id: "{key}{i + 1}",\n    sheet: "{key}",\n    label: "{name}",\n'
            f"    idle: [{idle[0]},{idle[1]},{idle[2]},{idle[3]}],\n    walk: {{\n"
            + "\n".join(lines)
            + "\n    },\n  },"
        )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(TEMPLATE.replace("__PATTERNS__", "\n".join(blocks)))
    print(f"\n{out_path} を書き出した（{len(blocks)}パターン）")


TEMPLATE = '''/**
 * コーチの切り出し座標（アトラス）。
 *
 * **`tools/cut_coachsheet.py` が書き出すが、手で直してよい。**
 * コマがズレていたら、ここの数字だけ直せば直る（画像は作り直さなくてよい）。
 *
 * 座標は元のシート（public/characters/sheets/coach_*.png）の中の位置で、
 *   [x, y, 幅, 高さ]
 * 1方向のコマは同じ大きさにそろえてあり、**足元が下端中央**に来る。
 *
 * flip: true は「絵が左を向いているので、右へ進むときは左右反転して使う」印。
 * ゲームは「反転していない絵＝画面の右へ進む」で扱う（→ gfx/coachSprites.ts）。
 */

/** [x, y, 幅, 高さ] */
export type AtlasRect = readonly [number, number, number, number];

/**
 * 8方向。**画面の見た目の向き**で決める（等角なので、マスの軸とは45度ずれる）。
 *   grid +gx … 画面の右下 → downRight
 *   grid +gy … 画面の左下 → downLeft
 */
export type Dir8 = "down" | "up" | "left" | "right" | "downLeft" | "downRight" | "upLeft" | "upRight";

export interface AtlasDir {
  /** 歩行のコマ（左から順に再生）。 */
  f: readonly AtlasRect[];
  /** 絵が左向きなので、反転して使う。 */
  flip?: boolean;
}

export interface CoachPattern {
  id: string;
  /** どのシートの絵か（public/characters/sheets/coach_<sheet>.png）。 */
  sheet: "normal" | "pro";
  label: string;
  /** 待機（正面）。歩行のコマとは大きさが違うので別に持つ。 */
  idle: AtlasRect;
  walk: Record<Dir8, AtlasDir>;
}

/** シートの置き場所（public/ の下＝そのままのパスで配信される）。 */
export const COACH_SHEETS = {
  normal: "characters/sheets/coach_normal.png",
  pro: "characters/sheets/coach_pro.png",
} as const;

/** 歩行のコマ送り（1秒あたり）。 */
export const COACH_WALK_FPS = 6;

export const COACH_PATTERNS: readonly CoachPattern[] = [
__PATTERNS__
];
'''


if __name__ == "__main__":
    main()
