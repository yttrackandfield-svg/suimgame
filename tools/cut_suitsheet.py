# -*- coding: utf-8 -*-
"""水着シートから「水着の立ち姿（suit）」を切り出す。

    python tools/cut_suitsheet.py tools/suitsheet.png [--debug]

シートは1タイプにつき「立ち姿6方向 → 歩き6方向 → 決めポーズ＋泳ぎ」の3行。
ゲームの `suit` は**プールサイドで待つ／更衣室から歩いてくる**ときの1枚なので、
各タイプの**1行目のいちばん左＝正面の立ち姿**だけを使う。

（歩きのコマも入っているが、`suit` は立ち止まっている時間も長いので、
　正面の立ち姿1枚のほうが破綻しない。動かしたくなったら FRAMES を増やす。）
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from charmanifest import merge_manifest  # noqa: E402
import cut_charsheet as cc  # noqa: E402

# セクション（行1の y の目安, 5つのタイプの x 範囲, タイプID）
SECTIONS = [
    {
        "row1": (130, 170),
        "blocks": [(10, 320), (321, 620), (621, 910), (911, 1210), (1211, 1530)],
        "types": ["m_sporty", "m_muscle", "m_student", "m_office", "m_senior"],
    },
    {
        "row1": (455, 480),
        "blocks": [(10, 320), (321, 620), (621, 910), (911, 1210), (1211, 1530)],
        "types": ["f_energetic", "f_cool", "f_student", "f_adult", "f_senior"],
    },
    {
        "row1": (728, 748),
        "blocks": [(10, 160), (161, 310), (311, 460), (461, 600), (601, 745)],
        "types": ["b_genki", "b_ottori", "b_yancha", "b_oshare", "b_nakimushi"],
    },
    {
        "row1": (728, 748),
        "blocks": [(750, 900), (901, 1050), (1051, 1200), (1201, 1350), (1351, 1530)],
        "types": ["g_genki", "g_ottori", "g_yancha", "g_oshare", "g_nakimushi"],
    },
]

# 1タイプにつき、行の左から何コマ使うか（1＝正面の立ち姿だけ）
FRAMES = 1


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    debug = "--debug" in sys.argv
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(here, "..", "public", "characters"))

    im = Image.open(src).convert("RGB")
    w, h = im.size
    label = cc.label_components(cc.load_mask(im), w, h)
    figs = cc.figures(label, w, h)
    print(f"{src}: {w}x{h} / 人の塊 {len(figs)} 個")

    vis = im.copy() if debug else None
    d = ImageDraw.Draw(vis) if debug else None

    written = {}
    for sec in SECTIONS:
        y0, y1 = sec["row1"]
        row = [c for c in figs if y0 <= c["y0"] <= y1]
        if not row:
            continue
        # 上下の行とくっついた塊があるので、**この行の下端**を多数決で決めて切り落とす
        ends = sorted(c["y1"] for c in row)
        row_bottom = ends[len(ends) // 2]
        for (bx0, bx1), type_id in zip(sec["blocks"], sec["types"]):
            cell = sorted([c for c in row if bx0 <= c["x0"] <= bx1], key=lambda c: c["x0"])
            if not cell:
                print(f"  !! {type_id}/suit: 立ち姿が見つからない")
                continue
            # 上の顔絵とくっついた塊があるので、**行とタイプの枠で切り落とす**
            use = [
                {
                    **c,
                    "y0": max(c["y0"], y0 - 6),
                    "y1": min(c["y1"], row_bottom),
                    "x0": max(c["x0"], bx0),
                    "x1": min(c["x1"], bx1),
                }
                for c in cell[:FRAMES]
            ]
            imgs = [cc.cut(im, label, c) for c in use]
            strip = cc.compose(imgs)
            dst = os.path.join(out_dir, type_id)
            os.makedirs(dst, exist_ok=True)
            strip.save(os.path.join(dst, "suit.png"))
            written[f"{type_id}/suit.png"] = {"frames": len(imgs), "fps": 4}
            if debug:
                for c in use:
                    d.rectangle([c["x0"], c["y0"], c["x1"], c["y1"]], outline=(255, 0, 0))
            print(f"  {type_id}/suit.png  {len(imgs)}コマ x {strip.width // len(imgs)}x{strip.height}")

    if debug:
        vis.save(os.path.join(here, "vis_suit.png"))
        print("確認画像:", os.path.join(here, "vis_suit.png"))
    merge_manifest(out_dir, written)


if __name__ == "__main__":
    main()
