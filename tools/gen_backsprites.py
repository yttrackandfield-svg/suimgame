# -*- coding: utf-8 -*-
"""【後ろ姿の書き起こし】正面の歩き（walk.png）から、奥へ歩くときの絵（walkBack.png）を作る。

奥（画面の上）へ歩く人は背中を見せる約束（→ src/iso/people.ts の faceMoving）だが、
幼児・学童の walkBack.png は walk.png のコピーのままで**後ろ姿が描かれていなかった**ため、
どちらへ歩いてもこちらを向いて見えていた。

顔だけを取り除いて、**その絵にすでにある髪を広げて後頭部にする**。
色を新しく作らないので、髪の色みも陰影もその絵のまま繋がる。

  1. 顔（肌のいちばん大きなかたまり）を見つけ、その下端を首とする
  2. 首から上の「髪でないところ」（顔・目・口・ほお・あご）を消す範囲にする
  3. まわりの髪を流し込んで埋める
  4. うなじ側をわずかに落とし、**その絵が実際に使っている髪の色に寄せ直す**

4 が要。流し込んだままだと、くっきりしたドット絵の中で頭だけが滲んで見える。

【実行】walkBack.png が walk.png と同じ（＝後ろ姿が無い）タイプだけ作り直す。
  python tools/gen_backsprites.py            … 対象を一覧するだけ
  python tools/gen_backsprites.py --write    … public/characters/*/walkBack.png を書き出す
  python tools/gen_backsprites.py --write b_genki g_genki   … タイプを指定して書き出す

手描きの後ろ姿を置いたタイプ（大人 m_* / f_*）は**触らない**（同じ絵でないので対象外）。
"""
import filecmp
import os
import sys
from collections import Counter
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "characters")


def is_skin(c):
    r, g, b = c[0], c[1], c[2]
    return r > 190 and 140 < g < 232 and 105 < b < 210 and r > g > b and r - b > 40


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def neck_row(op, W, H, top, bottom):
    """頭と体の境。頭のいちばん広い行から下へ見て、横幅が最も細くなる行。"""
    width = [sum(1 for x in range(W) if op[x][y]) for y in range(H)]
    head_end = top + int((bottom - top) * 0.75)
    widest = max(range(top, min(head_end, H)), key=lambda y: width[y])
    lo = widest + 3
    hi = min(H - 1, top + int((bottom - top) * 0.68))
    if lo >= hi:
        return min(H - 1, widest + 8)
    return min(range(lo, hi + 1), key=lambda y: (width[y], y))


def make_back(im):
    W, H = im.size
    px = im.load()
    op = [[px[x, y][3] > 40 for y in range(H)] for x in range(W)]
    ys = [y for y in range(H) for x in range(W) if op[x][y]]
    if not ys:
        return None
    top, bottom = min(ys), max(ys)

    # --- 頭の下端＝顔の肌がどこまで続くか（あご〜襟）。開いた口の下まで確実に含める ---
    limit = top + int((bottom - top) * 0.72)
    skin_all = [(x, y) for x in range(W) for y in range(top, limit + 1) if op[x][y] and is_skin(px[x, y])]
    if len(skin_all) < 40:
        return None
    # 顔＝肌のかたまりのうち**いちばん大きいもの**（手・耳・こめかみの小片を拾わない）
    skinset = set(skin_all)
    seen = set()
    best = []
    for s0 in skin_all:
        if s0 in seen:
            continue
        comp = [s0]
        seen.add(s0)
        i = 0
        while i < len(comp):
            x, y = comp[i]
            i += 1
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in skinset and n not in seen:
                        seen.add(n)
                        comp.append(n)
        if len(comp) > len(best):
            best = comp
    face = best
    if len(face) < 40:
        return None
    fy0 = min(y for _, y in face)
    fx0 = min(x for x, _ in face)
    fx1 = max(x for x, _ in face)
    fy1 = max(y for _, y in face)
    neck = min(H - 1, fy1)

    # --- 髪の色（顔より上の帯から）---
    hair_px = [px[x, y][:3] for x in range(W) for y in range(top, fy0)
               if op[x][y] and px[x, y][3] > 200 and lum(px[x, y]) > 24]
    if len(hair_px) < 25:
        return None
    palette = [c for c, _ in Counter(hair_px).most_common(8)]
    hair_set = palette[:6]

    def hair_like(c):
        if is_skin(c):
            return False
        return min(dist2(c[:3], h) for h in hair_set) < 2000

    def outer_edge(x, y):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < H) or not op[nx][ny]:
                return True
        return False

    # --- 消す範囲＝首から上の「髪でない」ところ（顔・目・口・ほお・あご）---
    mask = [[False] * H for _ in range(W)]
    for x in range(W):
        for y in range(top, neck + 1):
            if not op[x][y]:
                continue
            if hair_like(px[x, y]):
                continue
            if outer_edge(x, y) and lum(px[x, y]) < 60:
                continue  # 外側の輪郭線は残す（シルエットが崩れる）
            mask[x][y] = True

    # 髪だと判定された線でも、まわりが全部「消す範囲」なら一緒に消す（口の輪郭など）
    bx0, bx1 = max(0, fx0 - 3), min(W - 1, fx1 + 3)
    by0, by1 = top, neck
    seen = [[False] * H for _ in range(W)]
    stack = []
    for x in range(bx0, bx1 + 1):
        for y in (by0, by1):
            if not mask[x][y] and not seen[x][y]:
                seen[x][y] = True
                stack.append((x, y))
    for y in range(by0, by1 + 1):
        for x in (bx0, bx1):
            if not mask[x][y] and not seen[x][y]:
                seen[x][y] = True
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if bx0 <= nx <= bx1 and by0 <= ny <= by1 and not seen[nx][ny] and not mask[nx][ny]:
                seen[nx][ny] = True
                stack.append((nx, ny))
    for x in range(bx0, bx1 + 1):
        for y in range(by0, by1 + 1):
            if op[x][y] and not mask[x][y] and not seen[x][y]:
                mask[x][y] = True

    todo = [(x, y) for x in range(W) for y in range(H) if mask[x][y]]
    if not todo:
        return None

    # --- 髪を流し込む。種は「首から上の、髪として残っている画素」だけ ---
    val = [[None] * H for _ in range(W)]
    for x in range(W):
        for y in range(top, neck + 1):
            if op[x][y] and not mask[x][y] and lum(px[x, y]) > 24:
                c = px[x, y]
                val[x][y] = (float(c[0]), float(c[1]), float(c[2]))
    for _ in range(320):
        for x, y in todo:
            acc = [0.0, 0.0, 0.0]
            n = 0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and val[nx][ny] is not None:
                    v = val[nx][ny]
                    acc[0] += v[0]
                    acc[1] += v[1]
                    acc[2] += v[2]
                    n += 1
            if n:
                val[x][y] = (acc[0] / n, acc[1] / n, acc[2] / n)

    out = im.copy()
    dst = out.load()
    cx = (fx0 + fx1) / 2
    cy = (fy0 + fy1) / 2
    rx = max(1.0, (fx1 - fx0) / 2)
    ry = max(1.0, (fy1 - fy0) / 2)
    fallback = palette[0]
    for x, y in todo:
        v = val[x][y] or fallback
        u = (x - cx) / rx
        w = (y - cy) / ry
        # 光源は左上。右下（うなじ）へ向かってゆるく落とし、左上はわずかに起こす
        k = 1.0 - 0.17 * max(0.0, (u + w) / 2) + 0.08 * max(0.0, -(u + w) / 2)
        shaded = (v[0] * k, v[1] * k, v[2] * k)
        near = min(palette, key=lambda c: dist2(c, shaded))
        dst[x, y] = (near[0], near[1], near[2], px[x, y][3])
    return out


def needs_back(type_dir):
    """後ろ姿がまだ無い（walkBack が walk のコピー）タイプか。"""
    walk = os.path.join(type_dir, "walk.png")
    back = os.path.join(type_dir, "walkBack.png")
    if not (os.path.exists(walk) and os.path.exists(back)):
        return False
    return filecmp.cmp(walk, back, shallow=False)


def main(argv):
    write = "--write" in argv
    only = [a for a in argv if not a.startswith("--")]
    targets = []
    for name in sorted(os.listdir(SRC)):
        d = os.path.join(SRC, name)
        if not os.path.isdir(d):
            continue
        if only and name not in only:
            continue
        if needs_back(d):
            targets.append(name)
    if not targets:
        print("後ろ姿が無いタイプはありません")
        return 0
    print(f"後ろ姿を作るタイプ: {len(targets)}件")
    for name in targets:
        im = Image.open(os.path.join(SRC, name, "walk.png")).convert("RGBA")
        out = make_back(im)
        if out is None:
            print(f"  {name}: 顔を見つけられず（手で描いてください）")
            continue
        if write:
            out.save(os.path.join(SRC, name, "walkBack.png"))
            print(f"  {name}: 書き出した {out.size}")
        else:
            print(f"  {name}: 作れる {out.size}")
    if not write:
        print("\n" + "--write を付けると public/characters/*/walkBack.png に書き出します")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
