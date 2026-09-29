"""
アプリのアイコンを作る（Google Play の 512px と、Android のランチャー用一式）。

  python tools/make_icon.py

絵の中身：
  背景  … 空色からプールの水色へのグラデーション＋コースロープ（赤白・黄青）
  主役  … 水から顔を出した、赤い水泳帽とゴーグルの子（大きく描いてくっきりさせる）＋水しぶき
  目標  … 大きな金メダル（リボン・星・照り）とキラキラ
ゲームの選手の絵は小さい（60px ほど）ので、引き伸ばすとぼやける。アイコンの子はここで直接描く。
4倍の大きさで描いてから縮めて、ふちをなめらかにする。

出力：
  release/icon/icon-512.png                     … Google Play のアプリアイコン
  release/icon/feature-1024x500.png             … Google Play の「フィーチャー グラフィック」
  android/app/src/main/res/mipmap-*/ic_launcher*.png  … ランチャー（アダプティブ＋旧式）
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # 描くときの倍率
N = 512 * SS


def grad(size, top, bottom):
    w, h = size
    im = Image.new("RGBA", size)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (w, y)], fill=c)
    return im


def water_line(scale):
    """子の肩が水に入る高さ（画像の高さに対する割合）。背景の水面もここにそろえる。"""
    return 0.5 + 0.36 * 0.84 * scale


def background(w, h, water=0.66):
    """空→水面→水の中。コースロープを2本。water＝水面の高さ（割合）。"""
    im = grad((w, h), (130, 210, 255), (80, 180, 245))
    d = ImageDraw.Draw(im)
    water_top = int(h * water)
    pool = grad((w, h - water_top), (40, 160, 235), (10, 90, 190))
    im.alpha_composite(pool, (0, water_top))
    for i in range(10):
        x = (i * 0.137 % 1) * w
        y = water_top + (i * 0.311 % 1) * (h - water_top) * 0.8 + 10 * SS
        d.rounded_rectangle([x, y, x + w * 0.06, y + 3 * SS], radius=2 * SS, fill=(255, 255, 255, 70))
    for row, cols in ((water + 0.06, [(230, 60, 60), (250, 250, 250)]), (water + (1 - water) * 0.75, [(250, 200, 40), (40, 110, 220)])):
        y = h * row
        r = h * 0.022
        k = 0
        x = -r
        while x < w + r:
            c = cols[k % 2]
            d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=c + (255,), outline=(20, 50, 90, 120), width=max(1, SS))
            x += r * 2.1
            k += 1
    return im


def medal(size):
    """リボン付きの金メダル（size×size）。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = size / 2
    cy = size * 0.62
    R = size * 0.30
    rw = size * 0.13
    for side in (-1, 1):
        x0 = cx + side * size * 0.22
        d.polygon([(x0 - rw, 0), (x0 + rw, 0), (cx + side * rw * 0.5, cy - R * 0.6), (cx - side * rw * 0.2, cy - R * 0.9)], fill=(220, 40, 60, 255))
        d.polygon([(x0 - rw * 0.25, 0), (x0 + rw * 0.25, 0), (cx + side * rw * 0.2, cy - R * 0.75), (cx - side * rw * 0.05, cy - R * 0.85)], fill=(255, 255, 255, 255))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(190, 120, 10, 255))
    d.ellipse([cx - R * 0.92, cy - R * 0.92, cx + R * 0.92, cy + R * 0.92], fill=(250, 200, 40, 255))
    d.ellipse([cx - R * 0.72, cy - R * 0.72, cx + R * 0.72, cy + R * 0.72], fill=(255, 222, 90, 255))
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = R * (0.55 if i % 2 == 0 else 0.23)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=(255, 245, 190, 255), outline=(200, 130, 20, 255))
    shine = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shine).ellipse([cx - R * 0.7, cy - R * 0.85, cx - R * 0.05, cy - R * 0.35], fill=(255, 255, 255, 110))
    im.alpha_composite(shine)
    return im


def sparkle(d, x, y, s, color=(255, 255, 255, 235)):
    d.polygon([(x, y - s), (x + s * 0.25, y - s * 0.25), (x + s, y), (x + s * 0.25, y + s * 0.25),
               (x, y + s), (x - s * 0.25, y + s * 0.25), (x - s, y), (x - s * 0.25, y - s * 0.25)], fill=color)


def kid(size):
    """水から顔を出した、赤い水泳帽とゴーグルの子（size×size の透明画像。座標は 512 基準）。"""
    k = size / 512
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    OUT = (40, 30, 30, 255)
    SKIN = (255, 214, 172, 255)
    SKIN_D = (240, 180, 140, 255)

    def E(d, cx, cy, rx, ry, fill, outline=None, w=0):
        d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=fill, outline=outline, width=max(0, int(w * k)))

    d = ImageDraw.Draw(im)
    E(d, 256, 452, 176, 96, SKIN, OUT, 7)  # 肩
    E(d, 132, 244, 26, 32, SKIN, OUT, 7)  # 耳
    E(d, 380, 244, 26, 32, SKIN, OUT, 7)
    E(d, 256, 234, 130, 126, SKIN, OUT, 8)  # 顔
    # 水泳帽（上だけ見せる）
    cap = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cap)
    cd.ellipse([(256 - 138) * k, (208 - 138) * k, (256 + 138) * k, (208 + 138) * k], fill=(225, 45, 55, 255), outline=OUT, width=int(8 * k))
    cd.rounded_rectangle([246 * k, 70 * k, 266 * k, 200 * k], radius=int(8 * k), fill=(255, 255, 255, 255))
    keep = Image.new("L", (size, size), 0)
    ImageDraw.Draw(keep).rectangle([0, 0, size, int(198 * k)], fill=255)
    cap.putalpha(Image.composite(cap.getchannel("A"), Image.new("L", (size, size), 0), keep))
    im.alpha_composite(cap)
    d = ImageDraw.Draw(im)
    d.line([(122 * k, 198 * k), (390 * k, 198 * k)], fill=OUT, width=int(8 * k))  # 帽子のふち
    # ゴーグル（帽子の上にのせている）
    d.line([(128 * k, 150 * k), (384 * k, 150 * k)], fill=(30, 60, 110, 255), width=int(11 * k))
    for gx in (206, 306):
        E(d, gx, 150, 42, 31, (60, 170, 240, 255), OUT, 7)
        E(d, gx - 13, 141, 13, 8, (230, 250, 255, 255))
    # 目（大きく・きらきら）
    for ex in (206, 306):
        E(d, ex, 244, 23, 31, (45, 30, 25, 255))
        E(d, ex - 7, 232, 8, 10, (255, 255, 255, 255))
        E(d, ex + 8, 256, 4, 5, (255, 255, 255, 230))
    # ほっぺ
    blush = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blush)
    bd.ellipse([148 * k, 266 * k, 196 * k, 294 * k], fill=(255, 120, 130, 130))
    bd.ellipse([316 * k, 266 * k, 364 * k, 294 * k], fill=(255, 120, 130, 130))
    im.alpha_composite(blush.filter(ImageFilter.GaussianBlur(4 * k)))
    d = ImageDraw.Draw(im)
    # 口（大きく笑う）と鼻
    d.chord([214 * k, 252 * k, 298 * k, 338 * k], start=0, end=180, fill=(180, 40, 50, 255), outline=OUT, width=int(7 * k))
    d.chord([234 * k, 296 * k, 278 * k, 332 * k], start=0, end=180, fill=(255, 130, 140, 255))
    E(d, 256, 266, 7, 5, SKIN_D)
    return im


def foreground(w, h, scale=1.0):
    """水から顔を出した子＋金メダル＋しぶき＋キラキラ（透明の上に描く）。scale で全体の大きさを変える。"""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ks = int(w * 0.84 * scale)
    kx = int(w / 2 - ks / 2 - w * 0.05 * scale)
    ky = int(h / 2 - ks * 0.44)
    # 水面より下は描かない（背景の水の中に沈んでいる）。半透明の水で隠すと肩の線が透けて見えた
    water_y = int(ky + ks * 0.80)
    body = kid(ks)
    cut = Image.new("L", body.size, 0)
    ImageDraw.Draw(cut).rectangle([0, 0, body.width, water_y - ky], fill=255)
    body.putalpha(Image.composite(body.getchannel("A"), Image.new("L", body.size, 0), cut))
    im.alpha_composite(body, (kx, ky))
    # しぶき（水面にそって白い泡）
    wl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wl)
    cx = kx + ks / 2
    for i in range(11):
        ex = cx + (i - 5) * ks * 0.085
        r = ks * (0.06 - 0.005 * abs(i - 5))
        wd.ellipse([ex - r, water_y - r * 0.55, ex + r, water_y + r * 0.45], fill=(255, 255, 255, 235))
    im.alpha_composite(wl.filter(ImageFilter.GaussianBlur(1.2 * SS)))
    # 金メダル（右上。リボンは上へ）
    ms = int(w * 0.40 * scale)
    mx = int(w / 2 + w * 0.26 * scale)
    my = int(h / 2 - h * 0.47 * scale)
    im.alpha_composite(medal(ms), (mx - ms // 2, my))
    # キラキラ
    d = ImageDraw.Draw(im)
    for (fx, fy, fs) in ((0.13, 0.16, 0.05), (0.93, 0.52, 0.035), (0.10, 0.44, 0.03), (0.50, 0.07, 0.03)):
        sx = w / 2 + (fx - 0.5) * w * scale
        sy = h / 2 + (fy - 0.5) * h * scale
        sparkle(d, sx, sy, w * fs * scale, (255, 250, 200, 245))
    return im


def save_scaled(im, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.resize((size, size), Image.LANCZOS).save(path)


def main():
    # --- Google Play の 512px アイコン（全面。角はストア側が丸める）
    full = background(N, N, water_line(1.0))
    full.alpha_composite(foreground(N, N, 1.0))
    out = os.path.join(ROOT, "release", "icon")
    save_scaled(full, os.path.join(out, "icon-512.png"), 512)

    # --- フィーチャー グラフィック（1024×500）
    fw, fh = 1024 * 2, 500 * 2
    feat = background(fw, fh, water_line(0.95))
    feat.alpha_composite(foreground(fh, fh, 0.95), (int(fw * 0.66 - fh / 2), 0))
    # 左の空いているところに題名と一言（Windows の游ゴシック Bold。無ければ文字なし）
    font_path = "C:/Windows/Fonts/YuGothB.ttc"
    if os.path.exists(font_path):
        from PIL import ImageFont
        d = ImageDraw.Draw(feat)
        title = ImageFont.truetype(font_path, int(fh * 0.13))
        sub = ImageFont.truetype(font_path, int(fh * 0.075))
        tx, ty = int(fw * 0.05), int(fh * 0.26)
        d.text((tx, ty), "マイスイミング", font=title, fill=(255, 255, 255, 255), stroke_width=int(fh * 0.014), stroke_fill=(20, 70, 130, 255))
        d.text((tx, ty + int(fh * 0.16)), "クラブ", font=title, fill=(255, 255, 255, 255), stroke_width=int(fh * 0.014), stroke_fill=(20, 70, 130, 255))
        d.text((tx + int(fh * 0.01), ty + int(fh * 0.36)), "育てて、勝って、世界一へ！", font=sub, fill=(255, 230, 90, 255), stroke_width=int(fh * 0.009), stroke_fill=(20, 70, 130, 255))
    feat.resize((1024, 500), Image.LANCZOS).convert("RGB").save(os.path.join(out, "feature-1024x500.png"))

    # --- Android ランチャー
    res = os.path.join(ROOT, "android", "app", "src", "main", "res")
    legacy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    adaptive = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    # アダプティブの前景は、真ん中の 66% だけが必ず見える（外側は機種の形で切られる）ので小さめに描く
    fg_ad = foreground(N, N, 0.64)
    bg_ad = background(N, N, water_line(0.64))
    mask = Image.new("L", (N, N), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, N, N], fill=255)
    round_icon = full.copy()
    round_icon.putalpha(mask)
    for dpi, s in legacy.items():
        save_scaled(full, os.path.join(res, f"mipmap-{dpi}", "ic_launcher.png"), s)
        save_scaled(round_icon, os.path.join(res, f"mipmap-{dpi}", "ic_launcher_round.png"), s)
    for dpi, s in adaptive.items():
        save_scaled(fg_ad, os.path.join(res, f"mipmap-{dpi}", "ic_launcher_foreground.png"), s)
        save_scaled(bg_ad, os.path.join(res, f"mipmap-{dpi}", "ic_launcher_background.png"), s)
    print("ok")


if __name__ == "__main__":
    main()
