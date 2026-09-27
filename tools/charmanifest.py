# -*- coding: utf-8 -*-
"""public/characters/manifest.json の読み書き（切り出しツール共通）。

シートが3枚（私服／泳ぎ／水着）に分かれていて、それぞれ別のツールが書き込むので、
**自分が書いたぶんだけを差し替えて、他のシート由来の行は残す**ようにしてある。
"""
from __future__ import annotations

import json
import os


def merge_manifest(out_dir: str, written: dict[str, dict]) -> None:
    """written = {"m_sporty/walk.png": {"frames": 2, "fps": 6}, ...}"""
    path = os.path.join(out_dir, "manifest.json")
    files = []
    if os.path.exists(path):
        try:
            files = json.load(open(path, encoding="utf-8")).get("files", [])
        except Exception:
            files = []
    keep = [e for e in files if (e if isinstance(e, str) else e.get("file", "")) not in written]
    for name, info in written.items():
        frames = int(info.get("frames", 1))
        if frames > 1:
            keep.append({"file": name, "frames": frames, "fps": int(info.get("fps", 7))})
        else:
            keep.append(name)
    keep.sort(key=lambda e: e if isinstance(e, str) else e["file"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"files": keep}, f, ensure_ascii=False, indent=2)
    print(f"manifest.json: {len(keep)} 枚（うち今回 {len(written)} 枚）")
