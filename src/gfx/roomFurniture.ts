import type Phaser from "phaser";
import { TILE_H, TILE_W } from "../config";
import { OUTLINE, box, darken, disc, lighten, outlineRect, part, shadow } from "./furniture";

/**
 * 部屋の什器（マッサージエリア・会議室・コーチ室・ドクタールーム・自販機・寮）。
 *
 * はじめは 32px の小さな箱で描いていて、遠目には「何の部屋か」が分からなかった。
 * スタジオ（furniture.ts の fnStudioMirror など）と同じ描き方で作り直してある：
 *   ・床に置く長いもの（ベッド・机）… **マスの向きにそろえた板**で描く（→ slab）
 *   ・壁に掛けるもの（ボード・シャーカステン）… **奥の壁の傾き**に倒した平行四辺形（→ wallQuad）
 *   ・小物（棚・椅子・ワゴン）… 正面向きの絵に、上の照りと接地影を入れる（足元が絵の下端）
 * 回した部屋では什器が左右反転する（→ iso/facility.ts の Fitting.flipX）ので、向きもそのまま合う。
 *
 * 【原点】板の絵と壁の絵は「床に置く点」が絵の下端ではない。置くときは
 * iso/facility.ts の什器表で originY を渡すこと（値は各テクスチャの見出しに書いてある）。
 */

type G = Phaser.GameObjects.Graphics;
export type Pt = { x: number; y: number };

export const HX = TILE_W / 2;
export const HY = TILE_H / 2;
/** 奥の壁の傾き（画面で右下がり）。 */
export const SLOPE = HY / HX;

export const ROOM_FURNITURE_KEYS = [
  // マッサージエリア
  "fnTreatBed",
  "fnMassageChair",
  "fnPartition",
  "fnTowelCart",
  "fnAromaTable",
  // 会議室・コーチ室
  "fnChairFront",
  "fnChairBack",
  "fnConfTable",
  "fnWallBoard",
  "fnTrophyCase",
  "fnMonitorStand",
  "fnCoachDesk",
  "fnCorkBoard",
  "fnFileCabinet",
  "fnKickboardRack",
  // ドクタールーム
  "fnDoctorDesk",
  "fnExamBed",
  "fnMedCabinet",
  "fnXrayBoard",
  "fnHeightScale",
  // 自販機
  "fnVendingRed",
  // 寮
  "fnDormBedBlue",
  "fnDormBedGreen",
  "fnDormBedOrange",
  "fnDormBedPink",
  "fnStudyDesk",
  "fnNightstand",
  // 食堂
  "fnServeLine",
  "fnTrayReturn",
  "fnRiceSoup",
  "fnDinerLongTable",
  "fnDinerChairF",
  "fnDinerChairB",
  "fnMenuWall",
  // カフェ
  "fnCafeBar",
  "fnCafeRound",
  "fnCafeChairF",
  "fnCafeChairB",
  "fnCafeSofa",
] as const;

export const fill = (g: G, pts: Pt[], color: number, alpha = 1): void => {
  g.fillStyle(color, alpha);
  g.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true);
};
export const stroke = (g: G, pts: Pt[], alpha = 0.85, width = 1.3): void => {
  g.lineStyle(width, OUTLINE, alpha);
  g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], true);
};
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const lift = (pts: Pt[], h: number): Pt[] => pts.map((p) => ({ x: p.x, y: p.y - h }));

/**
 * 床に寝かせた長方形の四隅（奥・右・手前・左の順）。
 * along＝gx の向き（画面の右下がり）の半分、across＝gy の向きの半分（どちらもマス）。
 */
export function floorQuad(cx: number, cy: number, along: number, across: number): Pt[] {
  const ax = HX * along;
  const ay = HY * along;
  const bx = HX * across;
  const by = HY * across;
  return [
    { x: cx - ax + bx, y: cy - ay - by },
    { x: cx + ax + bx, y: cy + ay - by },
    { x: cx + ax - bx, y: cy + ay + by },
    { x: cx - ax - bx, y: cy - ay + by },
  ];
}

/**
 * 床から elev の高さに浮かせた、厚さ thick の板（机の天板・ベッドのマット）。
 * 見える面は 上面・左手前（長い辺）・右手前（短い辺）の3つ。戻り値は上面の四隅（floorQuad と同じ順）。
 */
export function slab(g: G, q: Pt[], elev: number, thick: number, top: number, left = darken(top, 0.8), right = darken(top, 0.64)): Pt[] {
  const t = lift(q, elev + thick);
  const b = lift(q, elev);
  const leftFace = [t[3], t[2], b[2], b[3]];
  const rightFace = [t[2], t[1], b[1], b[2]];
  fill(g, leftFace, left);
  fill(g, rightFace, right);
  fill(g, t, top);
  stroke(g, leftFace, 0.8, 1.2);
  stroke(g, rightFace, 0.8, 1.2);
  stroke(g, t);
  return t;
}

/** 板の脚。見える3本（右・左・手前の角の少し内側）だけ描く。 */
export function legs(g: G, q: Pt[], elev: number, color: number, inset = 0.14, w = 2.4): void {
  const c = mid(q[0], q[2]);
  for (const i of [1, 3, 2]) {
    const p = lerp(q[i], c, inset);
    g.fillStyle(color, 1);
    g.fillRect(p.x - w / 2, p.y - elev, w, elev);
    g.lineStyle(1, OUTLINE, 0.6);
    g.strokeRect(p.x - w / 2, p.y - elev, w, elev);
  }
}

/** 板の上面の中の位置（u＝頭側→足側、v＝奥→手前。どちらも 0〜1）。 */
export const onTop = (t: Pt[], u: number, v: number): Pt => lerp(lerp(t[0], t[1], u), lerp(t[3], t[2], u), v);

/** 奥の壁に掛けた板（上辺・下辺を壁の傾きに倒す）。top／bottom は絵の左端 x=0 での高さ。 */
export function wallQuad(x0: number, x1: number, top: number, bottom: number): Pt[] {
  return [
    { x: x0, y: top + x0 * SLOPE },
    { x: x1, y: top + x1 * SLOPE },
    { x: x1, y: bottom + x1 * SLOPE },
    { x: x0, y: bottom + x0 * SLOPE },
  ];
}

/** 壁の傾きにそった線（線の色・太さは呼ぶ前に lineStyle で決める）。 */
export function wallLine(g: G, x0: number, x1: number, y: number): void {
  g.lineBetween(x0, y + x0 * SLOPE, x1, y + x1 * SLOPE);
}

export function createRoomFurnitureTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key: string, w: number, h: number): void => {
    g.generateTexture(key, w, h);
    g.clear();
  };

  // ================================================================ マッサージエリア

  // --- 施術ベッド（96×74。板のまん中は (48,48) → originY 0.65）---
  {
    const q = floorQuad(48, 48, 0.5, 0.2);
    fill(g, floorQuad(50, 51, 0.54, 0.26), 0x000000, 0.2);
    legs(g, q, 15, 0x6c7a86);
    const t = slab(g, q, 15, 7, 0x3f9aa0, 0x2f7d83, 0x266a70);
    g.lineStyle(1.2, 0xffffff, 0.32); // 表面の照り
    g.lineBetween(t[0].x + 2, t[0].y + 1.5, t[1].x - 2, t[1].y + 1.5);
    const s0 = onTop(t, 0.42, 0);
    const s1 = onTop(t, 0.42, 1);
    g.lineStyle(1, 0x245f64, 0.8); // クッションの継ぎ目
    g.lineBetween(s0.x, s0.y, s1.x, s1.y);
    const hole = onTop(t, 0.18, 0.5); // 顔を入れる穴（頭側）
    g.fillStyle(0x1c4f53, 1);
    g.fillEllipse(hole.x, hole.y, 8, 4.4);
    const towel = onTop(t, 0.78, 0.5); // 足側に畳んだタオル
    const tq = floorQuad(towel.x, towel.y, 0.12, 0.15);
    fill(g, [tq[3], tq[2], { x: tq[2].x, y: tq[2].y + 2 }, { x: tq[3].x, y: tq[3].y + 2 }], 0xc9d3dd);
    fill(g, tq, 0xf4f6f7);
    stroke(g, tq, 0.6, 1);
    make("fnTreatBed", 96, 74);
  }

  // --- マッサージチェア（48×58、足元が下端）---
  {
    shadow(g, 24, 54, 38);
    part(g, 10, 46, 28, 7, 0x3b2a22, 3); // 台座
    part(g, 11, 5, 26, 30, 0x6b4636, 9); // 背もたれ
    g.fillStyle(0x86594a, 1);
    g.fillRoundedRect(14, 9, 20, 22, 6);
    g.fillStyle(0x5a3a2e, 0.75); // もみ玉の縫い目
    for (let i = 0; i < 3; i++) g.fillRect(16, 14 + i * 6, 16, 1.2);
    part(g, 16, 2, 16, 8, 0xefe3d3, 3); // 枕
    part(g, 8, 30, 32, 12, 0x7a5040, 5); // 座面
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(11, 31.5, 26, 2);
    part(g, 3, 23, 9, 19, 0x5a3a2e, 4); // ひじ掛け
    part(g, 36, 23, 9, 19, 0x5a3a2e, 4);
    g.fillStyle(0x6fd0ff, 1); // 操作パネル
    g.fillRect(38, 27, 5, 3);
    g.fillStyle(0xf5b35b, 1);
    g.fillRect(5, 27, 5, 1.6);
    part(g, 16, 40, 16, 11, 0x6b4636, 3); // 足置き
    g.fillStyle(0x5a3a2e, 0.7);
    g.fillRect(19, 44, 10, 1.2);
    make("fnMassageChair", 48, 58);
  }

  /** ついたて（3枚折り。56×62、足元が下端）。 */
  const screenPanels = (key: string, fabric: number, frame: number): void => {
    shadow(g, 28, 58, 46);
    const xs = [4, 20, 36, 52];
    const off = [0, 4, 0, 4]; // 折れ目ごとに前後へずらす
    for (let i = 0; i < 3; i++) {
      const outer: Pt[] = [
        { x: xs[i], y: 6 + off[i] },
        { x: xs[i + 1], y: 6 + off[i + 1] },
        { x: xs[i + 1], y: 50 + off[i + 1] },
        { x: xs[i], y: 50 + off[i] },
      ];
      fill(g, outer, frame);
      const inner: Pt[] = [
        { x: xs[i] + 2, y: 9 + off[i] },
        { x: xs[i + 1] - 2, y: 9 + off[i + 1] },
        { x: xs[i + 1] - 2, y: 47 + off[i + 1] },
        { x: xs[i] + 2, y: 47 + off[i] },
      ];
      fill(g, inner, i % 2 === 0 ? fabric : darken(fabric, 0.86));
      const mx = (xs[i] + xs[i + 1]) / 2;
      const my = (off[i] + off[i + 1]) / 2;
      g.lineStyle(1, darken(fabric, 0.72), 0.5); // 布のひだ
      g.lineBetween(mx - 3, 11 + my, mx - 3, 45 + my);
      g.lineBetween(mx + 3, 11 + my, mx + 3, 45 + my);
      stroke(g, outer, 0.85, 1.2);
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle(frame, 1); // 脚
      g.fillRect(xs[i] - 1.2, 50 + off[i], 2.4, 6);
    }
    make(key, 56, 62);
  };
  screenPanels("fnPartition", 0xf3e6cf, 0x9a6b3f);

  // --- タオルワゴン（40×52、足元が下端）---
  {
    shadow(g, 20, 48, 32);
    part(g, 4, 8, 3, 38, 0x9aa7b4);
    part(g, 33, 8, 3, 38, 0x9aa7b4);
    for (const [c, x] of [[0xd98c3a, 7], [0x7fb86a, 12.5], [0xc9a2e0, 18]] as const) {
      g.fillStyle(c, 1); // オイルの瓶
      g.fillRoundedRect(x, 3, 4.4, 7.5, 1.2);
      g.fillStyle(0xf4f6f7, 1);
      g.fillRect(x + 1, 1, 2.4, 2.4);
    }
    part(g, 24, 5, 11, 5, 0xffffff, 1); // 畳んだタオル
    for (const y of [10, 25, 40]) part(g, 2, y, 36, 3, 0xc9d3dd, 1); // 棚板
    for (let i = 0; i < 4; i++) {
      const c = i % 2 === 0 ? 0xffffff : 0xaed6f1; // 丸めたタオル
      const x = 8.5 + i * 7.6;
      g.fillStyle(OUTLINE, 0.7);
      g.fillCircle(x, 20.5, 4.4);
      g.fillStyle(c, 1);
      g.fillCircle(x, 20.5, 3.6);
      g.fillStyle(darken(c, 0.8), 1);
      g.fillCircle(x, 20.5, 1.3);
    }
    part(g, 6, 31, 13, 9, 0xf4f6f7, 1); // 下段のタオル
    part(g, 21, 32, 13, 8, 0x9fd3c7, 1);
    g.fillStyle(0x000000, 0.12);
    g.fillRect(7, 35, 11, 1);
    g.fillRect(22, 35.5, 11, 1);
    g.fillStyle(0x2c3440, 1); // キャスター
    g.fillCircle(5.5, 47, 2.2);
    g.fillCircle(34.5, 47, 2.2);
    make("fnTowelCart", 40, 52);
  }

  // --- アロマの小卓（32×46、足元が下端）---
  {
    shadow(g, 16, 42, 22);
    part(g, 7, 38, 18, 3, 0x6d4a2a, 1);
    part(g, 14.5, 21, 3, 18, 0x8a6236);
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(16, 21, 27, 10);
    g.fillStyle(0xc8965d, 1);
    g.fillEllipse(16, 20.5, 25, 8);
    g.fillStyle(0xe6bb82, 1);
    g.fillEllipse(14.5, 19.6, 15, 3.4);
    g.fillStyle(OUTLINE, 0.8); // ディフューザー
    g.fillEllipse(11, 14.5, 10, 11);
    g.fillStyle(0xf4f1ea, 1);
    g.fillEllipse(11, 14.5, 8.4, 9.4);
    g.fillStyle(0x7fc8b8, 1);
    g.fillRect(7.5, 15, 7, 1.6);
    g.fillStyle(0xffffff, 0.5); // 立ちのぼるミスト
    g.fillCircle(11.5, 7.5, 2.6);
    g.fillCircle(13.5, 4, 2);
    g.fillCircle(11, 1.8, 1.4);
    part(g, 18.5, 13.5, 6, 5.5, 0xf7e7c4, 1); // キャンドル
    g.fillStyle(0xf5b35b, 1);
    g.fillCircle(21.5, 11.8, 1.4);
    make("fnAromaTable", 32, 46);
  }

  // ================================================================ 会議室・コーチ室

  /** 事務椅子（28×36、足元が下端）。front＝こちら向き（机の奥に座る）／false＝背中向き（机の手前）。 */
  const officeChair = (key: string, front: boolean): void => {
    shadow(g, 14, 32, 20);
    g.lineStyle(2, 0x2c3440, 1); // 5本脚
    g.lineBetween(14, 28, 5, 31);
    g.lineBetween(14, 28, 23, 31);
    g.lineBetween(14, 28, 14, 32);
    g.fillStyle(0x1d232b, 1);
    g.fillCircle(5, 32, 1.6);
    g.fillCircle(23, 32, 1.6);
    g.fillCircle(14, 33.5, 1.6);
    part(g, 12.8, 19, 2.4, 9, 0x5c6670);
    if (front) {
      part(g, 6, 1, 16, 15, 0x3b4450, 4); // 背もたれ（メッシュ）
      g.fillStyle(0x5c6878, 1);
      g.fillRoundedRect(8, 3, 12, 11, 3);
      g.fillStyle(0x3b4450, 0.6);
      for (let i = 0; i < 4; i++) g.fillRect(9, 5 + i * 2.5, 10, 0.8);
      part(g, 4, 15, 20, 7, 0x4a5563, 3); // 座面
      g.fillStyle(0xffffff, 0.22);
      g.fillRect(6, 16, 16, 1.6);
    } else {
      part(g, 4, 14, 20, 6, 0x4a5563, 3); // 座面（背もたれの向こうに少し見える）
      part(g, 6, 2, 16, 18, 0x2c3440, 4); // 背もたれの裏
      g.fillStyle(0x3b4450, 1);
      g.fillRoundedRect(8, 4, 12, 13, 3);
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(9, 5, 10, 1.4);
    }
    part(g, 2, 12, 3, 8, 0x2c3440, 1); // ひじ掛け
    part(g, 23, 12, 3, 8, 0x2c3440, 1);
    make(key, 28, 36);
  };
  officeChair("fnChairFront", true);
  officeChair("fnChairBack", false);

  // --- 会議テーブル（150×112。板のまん中は (75,70) → originY 0.625）---
  {
    const q = floorQuad(75, 70, 0.9, 0.32);
    fill(g, floorQuad(77, 73, 0.94, 0.38), 0x000000, 0.18);
    legs(g, q, 17, 0x4a5560, 0.08, 3);
    const t = slab(g, q, 17, 5, 0xd2a86e, 0xa57c47, 0x8a6538);
    g.lineStyle(1, 0x9b7446, 0.35); // 木目
    for (const v of [0.3, 0.55, 0.8]) {
      const a = onTop(t, 0.02, v);
      const b = onTop(t, 0.98, v);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.lineStyle(1.2, 0xffffff, 0.3);
    g.lineBetween(t[0].x + 3, t[0].y + 1.5, t[1].x - 3, t[1].y + 1.5);
    for (const [u, v] of [[0.44, 0.7], [0.62, 0.66]] as const) {
      const p = onTop(t, u, v); // 資料
      const sheet = floorQuad(p.x, p.y, 0.08, 0.1);
      fill(g, sheet, 0xfbfbf7);
      stroke(g, sheet, 0.45, 1);
    }
    for (const [u, v] of [[0.12, 0.66], [0.9, 0.62]] as const) {
      const p = onTop(t, u, v); // コーヒーカップ
      g.fillStyle(0xffffff, 1);
      g.fillRect(p.x - 3, p.y - 2, 6, 3.4);
      g.fillEllipse(p.x, p.y - 2, 6, 3.2);
      g.fillStyle(0x6d4a2a, 1);
      g.fillEllipse(p.x, p.y - 2, 4.4, 2);
    }
    for (const u of [0.27, 0.72]) {
      const p = onTop(t, u, 0.36); // ノートパソコン（画面はこちら向き）
      const base = floorQuad(p.x, p.y, 0.12, 0.08);
      fill(g, base, 0xc9d0d6);
      stroke(g, base, 0.6, 1);
      const scr: Pt[] = [{ x: base[0].x, y: base[0].y - 12 }, { x: base[1].x, y: base[1].y - 12 }, base[1], base[0]];
      fill(g, scr, 0x2c3440);
      fill(g, [lerp(scr[0], scr[2], 0.12), lerp(scr[1], scr[3], 0.12), lerp(scr[2], scr[0], 0.12), lerp(scr[3], scr[1], 0.12)], 0x5fa8e0);
      stroke(g, scr, 0.8, 1);
    }
    make("fnConfTable", 150, 112);
  }

  // --- 壁掛けのホワイトボード（レースの作戦。64×76、壁ぎわの床は (32,72) → originY 0.95）---
  {
    const frame = wallQuad(1, 63, 4, 39);
    fill(g, frame, 0xaeb8c1);
    fill(g, wallQuad(3.5, 60.5, 6.5, 35.5), 0xf7f9fa);
    g.lineStyle(1, 0x5dade2, 0.9); // レーンの図
    for (let i = 0; i < 4; i++) wallLine(g, 7, 31, 11 + i * 5.5);
    g.lineStyle(1.4, 0xe74c3c, 1); // 泳ぐ向きの矢印
    wallLine(g, 9, 27, 13.7);
    wallLine(g, 9, 27, 24.7);
    g.fillStyle(0x2c5f8f, 1); // 記録の棒グラフ
    [8, 13, 10, 16].forEach((h, i) => {
      const x = 38 + i * 5;
      g.fillRect(x, 31 + x * SLOPE - h, 3.2, h);
    });
    g.fillStyle(0xe74c3c, 1);
    g.fillRect(53, 31 + 53 * SLOPE - 16, 3.2, 3);
    fill(g, wallQuad(6, 58, 39, 42), 0x8e99a3); // 受け皿とマーカー
    g.fillStyle(0xe74c3c, 1);
    g.fillRect(14, 38.5 + 14 * SLOPE, 6, 1.6);
    g.fillStyle(0x2c5f8f, 1);
    g.fillRect(24, 38.5 + 24 * SLOPE, 6, 1.6);
    stroke(g, frame);
    make("fnWallBoard", 64, 76);
  }

  // --- トロフィー棚（40×60、足元が下端）---
  {
    shadow(g, 20, 56, 32);
    part(g, 3, 7, 34, 47, 0x6d4a2a, 2);
    part(g, 1, 3, 38, 6, 0x8a6236, 1);
    g.fillStyle(0xcfe8f5, 0.5);
    g.fillRect(6, 10, 28, 29);
    part(g, 6, 22, 28, 2, 0x8a6236);
    part(g, 6, 37, 28, 2, 0x8a6236);
    const cup = (x: number, base: number, color: number): void => {
      g.fillStyle(darken(color, 0.7), 1);
      g.fillRect(x - 3, base - 2.5, 6, 2.5);
      g.fillRect(x - 0.8, base - 5.5, 1.6, 3);
      g.lineStyle(1.2, color, 1);
      g.strokeCircle(x - 3.6, base - 8.5, 1.8);
      g.strokeCircle(x + 3.6, base - 8.5, 1.8);
      g.fillStyle(color, 1);
      g.fillRoundedRect(x - 3.2, base - 11.5, 6.4, 6.5, 2);
      g.fillStyle(0xffffff, 0.5);
      g.fillRect(x - 2, base - 10.5, 1.2, 4);
    };
    cup(12, 22, 0xf1c40f);
    cup(20.5, 22, 0xf1c40f);
    cup(29, 22, 0xc0c7ce);
    [0xf1c40f, 0xc0c7ce, 0xcd7f32].forEach((c, i) => {
      const x = 11 + i * 9; // メダル
      g.fillStyle(i === 1 ? 0x3d8fd0 : 0xd94a3d, 1);
      g.fillRect(x - 1.5, 25, 3, 5);
      disc(g, x, 32, 2.6, c);
    });
    part(g, 6, 41, 13, 11, 0x8a6236, 1); // 下の扉
    part(g, 21, 41, 13, 11, 0x8a6236, 1);
    g.fillStyle(0xe6bb82, 1);
    g.fillRect(16.5, 45, 1.4, 3);
    g.fillRect(22.2, 45, 1.4, 3);
    g.fillStyle(0xffffff, 0.35); // ガラスの映り込み
    g.fillRect(8, 11, 1.4, 10);
    g.fillRect(8, 25, 1.4, 10);
    outlineRect(g, 6, 10, 28, 29, 0, 0.6);
    make("fnTrophyCase", 40, 60);
  }

  // --- 大型モニタ（レース映像の分析。46×62、足元が下端）---
  {
    shadow(g, 23, 58, 30);
    part(g, 9, 54, 28, 4, 0x2c3440, 2);
    part(g, 21.5, 30, 3, 25, 0x5c6670);
    part(g, 2, 3, 42, 28, 0x1d232b, 2);
    g.fillStyle(0x10263d, 1);
    g.fillRect(4.5, 5.5, 37, 23);
    g.fillStyle(0x2f86c8, 1); // プールの映像
    g.fillRect(6, 7.5, 19, 19);
    g.fillStyle(0xffffff, 0.7);
    for (let i = 1; i < 4; i++) g.fillRect(6, 7.5 + i * 4.75, 19, 0.7);
    g.fillStyle(0xf5b35b, 1);
    g.fillCircle(12, 10, 1.3);
    g.fillCircle(18, 14.8, 1.3);
    g.fillCircle(10, 19.5, 1.3);
    g.lineStyle(1.2, 0x35e07a, 1); // 速度の折れ線
    g.beginPath();
    g.moveTo(27, 24);
    g.lineTo(31, 18);
    g.lineTo(34, 20);
    g.lineTo(38, 11);
    g.strokePath();
    g.fillStyle(0xf2f6f8, 0.8);
    g.fillRect(27, 8, 12, 1.6);
    g.fillStyle(0x35e07a, 1);
    g.fillCircle(41, 29.5, 0.9);
    make("fnMonitorStand", 46, 62);
  }

  /**
   * 事務机（90×92。板のまん中は (45,66) → originY 0.72）。
   * doctor＝心電図の画面と聴診器・カルテ、false＝ラップタイムの画面とストップウォッチ・マグカップ。
   */
  const officeDesk = (key: string, doctor: boolean): void => {
    const q = floorQuad(45, 66, 0.45, 0.25);
    fill(g, floorQuad(47, 69, 0.5, 0.3), 0x000000, 0.18);
    legs(g, q, 16, 0x4a5560, 0.08, 2.6);
    const t = slab(g, q, 16, 4, 0xe9ecef, 0xb5bcc3, 0x98a1a9);
    const m = onTop(t, 0.5, 0.28); // モニタ
    g.fillStyle(0x2c3440, 1);
    g.fillEllipse(m.x, m.y, 10, 4);
    g.fillRect(m.x - 1.4, m.y - 9, 2.8, 9);
    part(g, m.x - 16, m.y - 27, 32, 19, 0x1d232b, 2);
    g.fillStyle(doctor ? 0x0b2a1f : 0x10263d, 1);
    g.fillRect(m.x - 13.5, m.y - 24.5, 27, 14);
    if (doctor) {
      g.lineStyle(1.2, 0x35e07a, 1); // 心電図
      g.beginPath();
      g.moveTo(m.x - 12, m.y - 17);
      g.lineTo(m.x - 5, m.y - 17);
      g.lineTo(m.x - 3, m.y - 23);
      g.lineTo(m.x - 1, m.y - 12);
      g.lineTo(m.x + 1, m.y - 17);
      g.lineTo(m.x + 12, m.y - 17);
      g.strokePath();
    } else {
      for (let i = 0; i < 4; i++) {
        g.fillStyle(i === 0 ? 0xf7dc6f : 0xdfe6ec, 0.9); // ラップタイムの表
        g.fillRect(m.x - 12, m.y - 23 + i * 3.2, 11, 1.6);
      }
      g.fillStyle(0x3d8fd0, 1);
      [5, 8, 6, 10].forEach((h, i) => g.fillRect(m.x + 2 + i * 2.8, m.y - 12 - h, 2, h));
    }
    const k = onTop(t, 0.5, 0.72); // キーボード
    const kq = floorQuad(k.x, k.y, 0.14, 0.05);
    fill(g, kq, 0x3b4450);
    stroke(g, kq, 0.5, 1);
    const left = onTop(t, 0.17, 0.62);
    const right = onTop(t, 0.84, 0.55);
    const pad = floorQuad(right.x, right.y, 0.08, 0.1); // カルテ／書類
    fill(g, pad, doctor ? 0x8a6236 : 0xfbfbf7);
    if (doctor) fill(g, floorQuad(right.x, right.y, 0.06, 0.08), 0xfbfbf7);
    stroke(g, pad, 0.5, 1);
    if (doctor) {
      g.lineStyle(1.4, 0x2c3440, 1); // 聴診器
      g.strokeCircle(left.x - 2, left.y - 1, 3);
      g.lineBetween(left.x + 1, left.y - 1, left.x + 5, left.y + 2);
      g.fillStyle(0x9aa7b4, 1);
      g.fillCircle(left.x + 5.5, left.y + 2.2, 1.6);
    } else {
      disc(g, left.x, left.y - 2, 3, 0xdfe6ec, 0x2c3440); // ストップウォッチ
      g.fillStyle(0xe74c3c, 1);
      g.fillRect(left.x - 0.8, left.y - 6.8, 1.6, 1.6);
      const mug = onTop(t, 0.2, 0.25); // マグカップ
      g.fillStyle(0xd94a3d, 1);
      g.fillRect(mug.x - 2.5, mug.y - 5, 5, 5);
      g.fillStyle(0x6d4a2a, 1);
      g.fillEllipse(mug.x, mug.y - 5, 5, 1.8);
    }
    make(key, 90, 92);
  };
  officeDesk("fnCoachDesk", false);
  officeDesk("fnDoctorDesk", true);

  // --- 壁掛けのコルクボード（練習メニュー表。64×76 → originY 0.95）---
  {
    const frame = wallQuad(1, 63, 4, 40);
    fill(g, frame, 0x8a6236);
    fill(g, wallQuad(4, 60, 7, 37), 0xc9a06a);
    g.fillStyle(0xa87f4c, 0.55);
    for (let i = 0; i < 26; i++) {
      const x = 6 + ((i * 7.3) % 52);
      const y = 9 + ((i * 5.1) % 26);
      g.fillRect(x, y + x * SLOPE, 1.2, 1.2);
    }
    fill(g, wallQuad(8, 27, 10, 33), 0xfbfbf7); // 練習メニュー
    fill(g, wallQuad(8, 27, 10, 13.5), 0x3d8fd0);
    g.lineStyle(0.9, 0x5d6d7e, 0.75);
    for (let r = 0; r < 5; r++) wallLine(g, 10, 25, 16.5 + r * 3.3);
    fill(g, wallQuad(30, 45, 12, 31), 0xffffff); // 記録表
    g.lineStyle(0.9, 0xd94a3d, 0.7);
    for (let r = 0; r < 4; r++) wallLine(g, 32, 43, 15.5 + r * 3.6);
    fill(g, wallQuad(48, 57, 10, 18), 0xf7dc6f); // 付箋
    fill(g, wallQuad(48.5, 57.5, 21, 29), 0xaed6f1);
    g.fillStyle(0xe74c3c, 1); // 画びょう
    for (const x of [17.5, 37.5, 52.5]) g.fillCircle(x, 11.5 + x * SLOPE, 1.4);
    stroke(g, frame);
    make("fnCorkBoard", 64, 76);
  }

  // --- スチールの書類棚（28×46、足元が下端）---
  {
    shadow(g, 14, 42, 22);
    box(g, 14, 41, 22, 8, 36, 0xc9d1d8, 0xa3adb6, 0x86919b);
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        g.lineStyle(1, 0x5c6670, 0.8); // 引き出しの継ぎ目（左の面の傾きにそろえる）
        g.lineBetween(3, 5 + i * 12, 14, 9 + i * 12);
      }
      g.fillStyle(0x4a5560, 1); // 取っ手
      g.fillRect(6.2, 11.5 + i * 12, 5, 1.8);
    }
    make("fnFileCabinet", 28, 46);
  }

  // --- ビート板の棚（46×52、足元が下端）---
  {
    shadow(g, 23, 48, 38);
    part(g, 3, 16, 3, 30, 0x9aa7b4);
    part(g, 40, 16, 3, 30, 0x9aa7b4);
    [0xf5c342, 0x3d8fd0, 0xe2553f, 0x3fbfae, 0xf5c342].forEach((c, i) => {
      const x = 7.5 + i * 6.3;
      const y = 14 + (i % 2) * 3;
      part(g, x, y, 6, 29 - (i % 2) * 3, c, 3);
      g.fillStyle(lighten(c, 1.25), 1);
      g.fillRect(x + 1.2, y + 3, 1.3, 18);
    });
    part(g, 2, 30, 42, 2.6, 0xc9d3dd, 1); // 押さえの横棒
    part(g, 2, 43, 42, 3, 0x9aa7b4, 1); // 下の受け
    g.fillStyle(0x6fbf73, 1); // プルブイ
    g.fillEllipse(12, 47.5, 7, 4);
    g.fillEllipse(17, 47.5, 7, 4);
    g.fillStyle(0x4f9a53, 1);
    g.fillRect(13.5, 46.5, 2, 2);
    make("fnKickboardRack", 46, 52);
  }

  // ================================================================ ドクタールーム

  // --- 診察台（背もたれを起こしてある。96×86。板のまん中は (48,58) → originY 0.67）---
  {
    const q = floorQuad(48, 58, 0.5, 0.2);
    fill(g, floorQuad(50, 61, 0.54, 0.26), 0x000000, 0.2);
    legs(g, q, 14, 0x9aa7b4);
    const t = slab(g, q, 14, 6, 0xf4f6f7, 0xa9d3c0, 0x8cbfa8);
    const i0 = onTop(t, 0.32, 0);
    const i1 = onTop(t, 0.32, 1);
    const back: Pt[] = [{ x: t[0].x, y: t[0].y - 15 }, { x: t[3].x, y: t[3].y - 15 }, i1, i0];
    fill(g, back, 0xe3ebee);
    fill(g, [back[0], back[1], lerp(back[1], i1, 0.25), lerp(back[0], i0, 0.25)], 0xffffff, 0.8);
    stroke(g, back, 0.8, 1.2);
    const pc = lerp(mid(back[0], back[1]), mid(i0, i1), 0.35); // 枕
    g.fillStyle(OUTLINE, 0.7);
    g.fillEllipse(pc.x, pc.y, 15, 8);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(pc.x, pc.y - 0.5, 13, 6.4);
    const paper: Pt[] = [onTop(t, 0.36, 0.25), onTop(t, 0.98, 0.25), onTop(t, 0.98, 0.75), onTop(t, 0.36, 0.75)];
    fill(g, paper, 0xffffff, 0.95); // 敷き紙
    g.lineStyle(1, 0xc9d3dd, 0.8);
    g.lineBetween(paper[0].x, paper[0].y, paper[3].x, paper[3].y);
    make("fnExamBed", 96, 86);
  }

  // --- 薬品棚（36×58、足元が下端）---
  {
    shadow(g, 18, 54, 28);
    part(g, 3, 8, 30, 46, 0xf2f5f7, 2);
    g.fillStyle(0xcfe8f5, 0.9); // ガラス戸
    g.fillRect(6, 11, 11.5, 24);
    g.fillRect(18.5, 11, 11.5, 24);
    g.fillStyle(0xb9c3cb, 1);
    g.fillRect(6, 22, 24, 1.5);
    const bottles = [0xa0522d, 0xffffff, 0x5dade2, 0xf5b041, 0x7fb86a];
    for (let i = 0; i < 5; i++) {
      g.fillStyle(bottles[i], 1);
      g.fillRect(7.5 + i * 4.6, 15 + (i % 2), 3, 7 - (i % 2));
      g.fillStyle(bottles[(i + 2) % 5], 1);
      g.fillRect(7.5 + i * 4.6, 27 + ((i + 1) % 2), 3, 8 - ((i + 1) % 2));
    }
    g.fillStyle(0xffffff, 0.45);
    g.fillRect(8, 12, 1.2, 9);
    g.fillRect(20.5, 12, 1.2, 9);
    outlineRect(g, 6, 11, 11.5, 24, 0, 0.6);
    outlineRect(g, 18.5, 11, 11.5, 24, 0, 0.6);
    part(g, 6, 38, 24, 7, 0xe1e7eb, 1); // 引き出し
    part(g, 6, 46, 24, 6, 0xe1e7eb, 1);
    g.fillStyle(0x7f8c8d, 1);
    g.fillRect(16, 40.5, 4, 1.4);
    g.fillRect(16, 48.5, 4, 1.4);
    part(g, 12, 0.5, 12, 9, 0xffffff, 2); // 赤十字
    g.fillStyle(0xe74c3c, 1);
    g.fillRect(16.8, 2, 2.4, 6);
    g.fillRect(15, 3.8, 6, 2.4);
    make("fnMedCabinet", 36, 58);
  }

  // --- シャーカステン（レントゲンを見る光る板。64×76 → originY 0.95）---
  {
    const frame = wallQuad(1, 63, 4, 39);
    fill(g, frame, 0xdfe6ec);
    fill(g, wallQuad(4, 31, 7, 34), 0xeaf6ff);
    fill(g, wallQuad(33, 60, 7, 34), 0xeaf6ff);
    fill(g, wallQuad(4, 60, 7, 12), 0xffffff, 0.55);
    fill(g, wallQuad(8, 27, 9.5, 31.5), 0x25303a); // フィルム（胸）
    fill(g, wallQuad(37, 56, 9.5, 31.5), 0x25303a); // フィルム（ひざ）
    g.lineStyle(1.2, 0xdfe9f0, 0.85);
    g.lineBetween(17.5, 11 + 17.5 * SLOPE, 17.5, 30 + 17.5 * SLOPE);
    for (let r = 0; r < 4; r++) {
      wallLine(g, 10.5, 16, 14 + r * 4);
      wallLine(g, 19, 24.5, 14 + r * 4);
    }
    g.lineStyle(2.4, 0xdfe9f0, 0.85);
    g.lineBetween(45.5, 11 + 45.5 * SLOPE, 46.5, 19 + 46.5 * SLOPE);
    g.lineBetween(46.5, 22.5 + 46.5 * SLOPE, 47.5, 30 + 47.5 * SLOPE);
    g.fillStyle(0xdfe9f0, 0.85);
    g.fillCircle(46.3, 20.8 + 46.3 * SLOPE, 2.4);
    g.fillStyle(0x35e07a, 1);
    g.fillCircle(58, 36.5 + 58 * SLOPE, 1.1);
    stroke(g, frame);
    make("fnXrayBoard", 64, 76);
  }

  // --- 身長体重計（26×72、足元が下端）---
  {
    shadow(g, 13, 68, 22);
    part(g, 3, 60, 20, 7, 0xdfe6ec, 2);
    g.fillStyle(0x3b4450, 1);
    g.fillRect(6, 62, 14, 2.4);
    part(g, 15, 7, 4, 54, 0xc9d3dd, 1);
    g.fillStyle(0x5d6d7e, 0.8); // 目盛り
    for (let i = 0; i < 10; i++) g.fillRect(15.5, 12 + i * 4.8, i % 2 === 0 ? 3 : 2, 0.8);
    part(g, 5, 18, 14, 3, 0x9aa7b4, 1); // 頭に当てる板
    part(g, 11, 1, 13, 8, 0x3b4450, 1); // 表示
    g.fillStyle(0x6fe3a0, 1);
    g.fillRect(13, 3, 9, 4);
    make("fnHeightScale", 26, 72);
  }

  // ================================================================ 自販機

  // --- スポーツドリンクの自販機（赤。fnVendingTall と並べる。36×48、足元が下端）---
  {
    shadow(g, 18, 44, 26);
    g.fillStyle(0xd9433a, 1);
    g.fillRoundedRect(3, 3, 30, 41, 2);
    g.fillStyle(0xf4f6f7, 1); // ロゴの帯
    g.fillRect(3, 3, 30, 7);
    g.fillStyle(0x3d8fd0, 1);
    g.fillRect(6, 5, 15, 3);
    g.fillStyle(0xd9433a, 1);
    g.fillRect(23, 5, 7, 3);
    g.fillStyle(0x16212b, 1);
    g.fillRect(6, 12, 19, 23);
    const cans = [0x3d8fd0, 0xf4f6f7, 0xf2c53d, 0x6fbf73, 0xe8863d];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        g.fillStyle(cans[(row + i * 2) % cans.length], 1);
        g.fillRect(7.5 + i * 4.4, 13.5 + row * 7.4, 3.4, 5.6);
        g.fillStyle(0xffffff, 0.45);
        g.fillRect(7.5 + i * 4.4, 13.5 + row * 7.4, 3.4, 1.1);
      }
    }
    g.fillStyle(0xf4f6f7, 1); // ボタン列
    g.fillRect(27, 12, 4, 23);
    g.fillStyle(0x3d8fd0, 1);
    for (let i = 0; i < 4; i++) g.fillRect(27.6, 14 + i * 5, 2.8, 2.4);
    g.fillStyle(0x2c3e50, 1); // 取り出し口
    g.fillRect(8, 37.5, 16, 4.5);
    g.fillStyle(0x000000, 0.12); // 側面の陰
    g.fillRect(29.5, 3, 3.5, 41);
    outlineRect(g, 3, 3, 30, 41, 2);
    make("fnVendingRed", 36, 48);
  }

  // ================================================================ 寮

  /** 寮のベッド（98×84。板のまん中は (48,56) → originY 0.667）。布団の色ちがいで4種類。 */
  const dormBed = (key: string, duvet: number): void => {
    const q = floorQuad(48, 56, 0.5, 0.24);
    fill(g, floorQuad(49, 58, 0.52, 0.27), 0x000000, 0.18);
    const hb: Pt[] = [
      { x: q[0].x, y: q[0].y - 24 },
      { x: q[3].x, y: q[3].y - 24 },
      q[3],
      q[0],
    ];
    fill(g, hb, 0x8a5d34); // ヘッドボード（頭側の端に立つ板）
    fill(g, [hb[0], hb[1], { x: hb[1].x, y: hb[1].y + 3 }, { x: hb[0].x, y: hb[0].y + 3 }], 0xb07f4c);
    stroke(g, hb, 0.85, 1.2);
    slab(g, q, 0, 8, 0x9a6b3f, 0x7d5530, 0x684526); // 木の枠
    const mat = slab(g, floorQuad(48, 56, 0.47, 0.21), 8, 5, 0xf4f6f7, 0xdfe4e8, 0xc9d0d6);
    const d: Pt[] = [onTop(mat, 0.36, -0.06), onTop(mat, 1.03, -0.06), onTop(mat, 1.03, 1.06), onTop(mat, 0.36, 1.06)].map(
      (p) => ({ x: p.x, y: p.y - 2 }),
    );
    const drop = 6; // 手前に垂れた布団
    fill(g, [d[3], d[2], { x: d[2].x, y: d[2].y + drop }, { x: d[3].x, y: d[3].y + drop }], darken(duvet, 0.8));
    fill(g, [d[2], d[1], { x: d[1].x, y: d[1].y + drop }, { x: d[2].x, y: d[2].y + drop }], darken(duvet, 0.66));
    fill(g, d, duvet);
    fill(g, [d[0], lerp(d[0], d[1], 0.13), lerp(d[3], d[2], 0.13), d[3]], 0xffffff, 0.92); // 折り返したシーツ
    g.lineStyle(1, lighten(duvet, 1.3), 0.7); // 布団の柄
    for (const u of [0.42, 0.66, 0.9]) {
      const a = lerp(d[0], d[1], u);
      const b = lerp(d[3], d[2], u);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    stroke(g, d, 0.8, 1.2);
    const pc = onTop(mat, 0.17, 0.5); // 枕
    g.fillStyle(OUTLINE, 0.75);
    g.fillEllipse(pc.x, pc.y - 2, 22, 12);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(pc.x, pc.y - 2.5, 20, 10);
    g.fillStyle(0xe3e8ec, 1);
    g.fillEllipse(pc.x + 1.5, pc.y - 0.5, 12, 3.6);
    make(key, 98, 84);
  };
  dormBed("fnDormBedBlue", 0x5b9bd5);
  dormBed("fnDormBedGreen", 0x6fbf73);
  dormBed("fnDormBedOrange", 0xf0a04b);
  dormBed("fnDormBedPink", 0xe98fb5);

  // --- 勉強机（棚つき。44×54、足元が下端）---
  {
    shadow(g, 22, 50, 36);
    part(g, 4, 5, 36, 21, 0x9a6b3f, 1); // 上の棚
    g.fillStyle(0x6d4a2a, 1);
    g.fillRect(6.5, 7.5, 31, 16);
    [0xd94a3d, 0x4f9ed8, 0x6fbf73, 0xf2c53d, 0xf4f6f7, 0xd98cc0].forEach((c, i) => {
      const h = 10 + (i % 3) * 2;
      g.fillStyle(c, 1);
      g.fillRect(8 + i * 3.3, 23.5 - h, 2.6, h);
    });
    part(g, 2, 25, 40, 5, 0xc8965d, 1); // 天板
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(3, 26, 38, 1.4);
    part(g, 3, 30, 4, 18, 0x9a6b3f); // 脚
    part(g, 37, 30, 4, 18, 0x9a6b3f);
    part(g, 26, 30, 11, 8, 0xb07f4c, 1); // 引き出し
    g.fillStyle(0x6d4a2a, 1);
    g.fillRect(29.5, 33, 4, 1.4);
    g.lineStyle(1.6, 0x2c3440, 1); // スタンドライト
    g.lineBetween(34, 25, 36, 15);
    g.lineBetween(36, 15, 30, 11);
    part(g, 25, 9, 8, 4, 0xf5b35b, 2);
    g.fillStyle(0xfff3c4, 0.45);
    g.fillEllipse(27, 25.5, 16, 3);
    part(g, 9, 22, 11, 3, 0x3d8fd0, 1); // ノート
    part(g, 13, 36, 17, 12, 0x5b9bd5, 3); // しまった椅子の背
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(15, 37.5, 13, 1.6);
    make("fnStudyDesk", 44, 54);
  }

  // --- ベッドわきの小棚（スタンドと目覚まし時計。24×34、足元が下端）---
  {
    shadow(g, 12, 30, 18);
    part(g, 3, 14, 18, 15, 0x9a6b3f, 2);
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(4, 15, 16, 1.4);
    g.lineStyle(1, 0x6d4a2a, 0.9);
    g.lineBetween(4, 21.5, 20, 21.5);
    g.fillStyle(0xe6bb82, 1);
    g.fillRect(10.5, 17, 3, 1.4);
    g.fillRect(10.5, 24, 3, 1.4);
    part(g, 7, 8, 2.4, 6, 0xe8e0d0); // スタンド
    const shade: Pt[] = [{ x: 3, y: 2 }, { x: 13, y: 2 }, { x: 14.5, y: 9 }, { x: 1.5, y: 9 }];
    fill(g, shade, 0xf5d98b);
    stroke(g, shade, 0.8, 1.1);
    disc(g, 17.5, 11, 2.8, 0xffffff); // 目覚まし時計
    g.lineStyle(0.8, 0x2c3440, 1);
    g.lineBetween(17.5, 11, 17.5, 9.2);
    g.lineBetween(17.5, 11, 18.8, 11);
    make("fnNightstand", 24, 34);
  }


  // ================================================================ 食堂（配膳まわり）

  // --- 配膳ライン（ステンレスの台に料理が並び、手前にトレイのレール）---
  // 144×124。板のまん中は (72,83) → originY 0.67
  {
    const q = floorQuad(72, 83, 0.9, 0.28);
    fill(g, floorQuad(74, 86, 0.94, 0.33), 0x000000, 0.18);
    slab(g, q, 0, 16, 0xc08e57, 0x9a6b3f, 0x7d5530); // 木の台
    const t = slab(g, q, 16, 5, 0xc6d2da, 0xa3b0ba, 0x8a97a2); // ステンレスの天板
    const dishes = [0xe8863d, 0xf2c53d, 0x7fbf6a, 0xd94a3d, 0xf4e3c8];
    dishes.forEach((c, i) => {
      const p = onTop(t, 0.14 + i * 0.18, 0.42); // 料理のバット
      const bq = floorQuad(p.x, p.y, 0.07, 0.11);
      fill(g, bq, 0x8f9aa3);
      fill(g, floorQuad(p.x, p.y - 1.5, 0.055, 0.09), darken(c, 0.78));
      fill(g, floorQuad(p.x, p.y - 2.6, 0.045, 0.075), c);
      stroke(g, bq, 0.6, 1);
    });
    const guard: Pt[] = [t[0], t[1], { x: t[1].x, y: t[1].y - 26 }, { x: t[0].x, y: t[0].y - 26 }];
    fill(g, guard, 0xd8eef6, 0.5); // サニタリーガード（奥の立ち板）
    stroke(g, guard, 0.5, 1);
    const eave: Pt[] = [
      { x: t[0].x, y: t[0].y - 26 },
      { x: t[1].x, y: t[1].y - 26 },
      { x: onTop(t, 1, 0.62).x, y: onTop(t, 1, 0.62).y - 22 },
      { x: onTop(t, 0, 0.62).x, y: onTop(t, 0, 0.62).y - 22 },
    ];
    fill(g, eave, 0xe6f5fb, 0.55); // 手前へ張り出す庇
    stroke(g, eave, 0.45, 1);
    g.lineStyle(2.6, 0xb9c6d0, 1); // トレイをすべらせるレール
    g.lineBetween(t[3].x, t[3].y + 4, t[2].x, t[2].y + 4);
    g.lineStyle(1, OUTLINE, 0.6);
    g.lineBetween(t[3].x, t[3].y + 5.6, t[2].x, t[2].y + 5.6);
    make("fnServeLine", 144, 124);
  }

  // --- トレイ返却の棚（44×56、足元が下端）---
  {
    shadow(g, 22, 52, 34);
    part(g, 4, 12, 4, 38, 0x9aa7b4); // 支柱
    part(g, 36, 12, 4, 38, 0x9aa7b4);
    for (let i = 0; i < 5; i++) {
      const c = i % 2 === 0 ? 0x7fbf6a : 0xdfe6ec; // 重ねたトレイ
      part(g, 8, 5 + i * 1.9, 24, 2.3, c, 1);
    }
    for (const y of [14, 30, 44]) part(g, 2, y, 40, 3, 0xc6d2da, 1); // 棚板
    g.fillStyle(0xf4f6f7, 1); // 返された食器
    g.fillEllipse(13, 27, 14, 5.4);
    g.fillEllipse(25, 27.6, 11, 4.4);
    g.fillStyle(0xc9d3dd, 1);
    g.fillEllipse(13, 26.2, 9, 3.2);
    part(g, 30, 21, 9, 7, 0xd94a3d, 1); // はしのかご
    part(g, 6, 34, 30, 9, 0x4f9ed8, 2); // 下段のコンテナ
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(8, 35.5, 26, 1.6);
    g.fillStyle(0x2c3440, 1); // キャスター
    g.fillCircle(7, 51, 2.2);
    g.fillCircle(37, 51, 2.2);
    make("fnTrayReturn", 44, 56);
  }

  // --- ごはんと汁物の台（88×92。板のまん中は (44,66) → originY 0.72）---
  {
    const q = floorQuad(44, 66, 0.45, 0.25);
    fill(g, floorQuad(46, 69, 0.5, 0.3), 0x000000, 0.18);
    slab(g, q, 0, 14, 0xc08e57, 0x9a6b3f, 0x7d5530);
    const t = slab(g, q, 14, 4, 0xc6d2da, 0xa3b0ba, 0x8a97a2);
    const rice = onTop(t, 0.3, 0.45); // 炊飯ジャー
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(rice.x, rice.y - 10, 26, 13);
    g.fillStyle(0xe6ebef, 1);
    g.fillEllipse(rice.x, rice.y - 11, 24, 11);
    part(g, rice.x - 12, rice.y - 20, 24, 10, 0xdfe6ec, 3);
    g.fillStyle(0x9aa7b4, 1);
    g.fillEllipse(rice.x, rice.y - 20, 22, 7); // ふた
    g.fillStyle(0xf4f6f7, 1);
    g.fillEllipse(rice.x, rice.y - 21, 18, 5);
    const soup = onTop(t, 0.75, 0.5); // 汁物の鍋
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(soup.x, soup.y - 8, 22, 11);
    g.fillStyle(0x8a97a2, 1);
    g.fillEllipse(soup.x, soup.y - 9, 20, 9);
    g.fillStyle(0xc08457, 1);
    g.fillEllipse(soup.x, soup.y - 10, 15, 6);
    g.fillStyle(0x7fbf6a, 1);
    g.fillEllipse(soup.x - 2, soup.y - 10.5, 4.5, 2.2);
    g.fillStyle(0xffffff, 0.4); // 湯気
    g.fillCircle(soup.x - 1, soup.y - 18, 3);
    g.fillCircle(soup.x + 2, soup.y - 23, 2.2);
    g.fillCircle(soup.x - 2, soup.y - 27, 1.6);
    g.lineStyle(1.6, 0x9aa7b4, 1); // おたま
    g.lineBetween(soup.x + 9, soup.y - 12, soup.x + 13, soup.y - 22);
    make("fnRiceSoup", 88, 92);
  }

  // --- 食堂の長テーブル（トレイの食事が並ぶ）---
  // 136×102。板のまん中は (68,64) → originY 0.63
  {
    const q = floorQuad(68, 64, 0.8, 0.3);
    fill(g, floorQuad(70, 67, 0.84, 0.35), 0x000000, 0.18);
    legs(g, q, 17, 0x9c7546, 0.1, 3);
    const t = slab(g, q, 17, 5, 0xe0bd93, 0xb08a5e, 0x94714a);
    g.lineStyle(1, 0xa8845a, 0.35); // 木目
    for (const v of [0.35, 0.65]) {
      const a = onTop(t, 0.03, v);
      const b = onTop(t, 0.97, v);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.lineStyle(1.2, 0xffffff, 0.3);
    g.lineBetween(t[0].x + 3, t[0].y + 1.5, t[1].x - 3, t[1].y + 1.5);
    // 4人ぶんの配膳（トレイ・ごはん・汁物・おかず・はし）
    for (const [u, v] of [[0.22, 0.28], [0.62, 0.28], [0.4, 0.74], [0.8, 0.74]] as const) {
      const p = onTop(t, u, v);
      const tray = floorQuad(p.x, p.y, 0.1, 0.13);
      fill(g, tray, 0x7fbf6a);
      fill(g, floorQuad(p.x, p.y - 1, 0.085, 0.11), 0x96cf84);
      stroke(g, tray, 0.6, 1);
      g.fillStyle(0xf4f6f7, 1); // ごはん茶碗
      g.fillEllipse(p.x - 5, p.y - 1.5, 8, 4);
      g.fillStyle(0xfdfdfb, 1);
      g.fillEllipse(p.x - 5, p.y - 2.5, 6, 2.6);
      g.fillStyle(0x8a5a33, 1); // 汁椀
      g.fillEllipse(p.x + 4, p.y + 0.5, 7.5, 3.6);
      g.fillStyle(0xc08457, 1);
      g.fillEllipse(p.x + 4, p.y - 0.2, 5.6, 2.4);
      g.fillStyle(0xdfe6ec, 1); // おかずの皿
      g.fillEllipse(p.x, p.y - 5, 9, 4);
      g.fillStyle(0xe8863d, 1);
      g.fillEllipse(p.x - 1, p.y - 5.4, 4.4, 2.2);
      g.fillStyle(0x6fbf73, 1);
      g.fillEllipse(p.x + 2.5, p.y - 5.6, 3, 1.6);
      g.lineStyle(1, 0x8a6236, 0.9); // はし
      g.lineBetween(p.x + 7, p.y + 3.4, p.x + 12, p.y + 1.4);
    }
    make("fnDinerLongTable", 136, 102);
  }

  /** 食堂の椅子（28×38、足元が下端）。front＝こちら向き（テーブルの奥側）／false＝背中向き。 */
  const dinerChair = (key: string, front: boolean): void => {
    shadow(g, 14, 34, 20);
    g.fillStyle(0x9c7546, 1); // 脚
    g.fillRect(5, 22, 2.6, 11);
    g.fillRect(20.4, 22, 2.6, 11);
    g.fillRect(8, 24, 12, 2);
    if (front) {
      part(g, 6, 3, 16, 14, 0x3f6f9e, 3); // 背もたれ
      g.fillStyle(0x5d8cbb, 1);
      g.fillRoundedRect(7.5, 4.5, 13, 9, 2);
      g.fillStyle(0xffffff, 0.18);
      g.fillRect(8.5, 5.5, 11, 1.6);
      part(g, 3, 17, 22, 7, 0x3f6f9e, 3); // 座面
      g.fillStyle(0x5d8cbb, 1);
      g.fillRect(5, 18, 18, 2.4);
    } else {
      part(g, 3, 16, 22, 6, 0x3f6f9e, 3); // 座面（背の向こうに少し）
      part(g, 6, 4, 16, 15, 0x35608a, 3); // 背もたれの裏
      g.fillStyle(0x3f6f9e, 1);
      g.fillRoundedRect(7.5, 5.5, 13, 10, 2);
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(8.5, 6.5, 11, 1.4);
    }
    make(key, 28, 38);
  };
  dinerChair("fnDinerChairF", true);
  dinerChair("fnDinerChairB", false);

  // --- 壁のメニュー表（今日の献立。64×76 → originY 0.95）---
  {
    const frame = wallQuad(1, 63, 4, 40);
    fill(g, frame, 0x2b3038);
    fill(g, wallQuad(3.5, 60.5, 6.5, 37.5), 0x39404a);
    fill(g, wallQuad(4, 60, 6.5, 12), 0xd94a3d); // 見出しの帯
    g.fillStyle(0xf7fbfd, 0.95);
    g.fillRect(8, 8 + 8 * SLOPE, 20, 2.4);
    // 献立の行（色の四角＝料理の写真、帯＝品名）
    const photo = [0xe8863d, 0x7fbf6a, 0xf2c53d, 0x4f9ed8];
    for (let i = 0; i < 4; i++) {
      const y = 15 + i * 5.6;
      fill(g, wallQuad(7, 13, y, y + 4.4), photo[i]);
      g.fillStyle(0xf2f6f8, 0.9);
      g.fillRect(15, y + 1 + 15 * SLOPE, 22 - i * 3, 2);
      g.fillStyle(0xf2c53d, 0.85);
      g.fillRect(41, y + 1 + 41 * SLOPE, 8, 2);
    }
    stroke(g, frame);
    make("fnMenuWall", 64, 76);
  }

  // ================================================================ カフェ

  // --- カウンター（エスプレッソマシン・ミル・レジ・ケーキドーム）---
  // 136×124。板のまん中は (68,87) → originY 0.70
  {
    const q = floorQuad(68, 87, 0.8, 0.3);
    fill(g, floorQuad(70, 90, 0.84, 0.35), 0x000000, 0.18);
    slab(g, q, 0, 18, 0xa5713f, 0x86592f, 0x6d4a2a); // 木の腰板
    // 腰板の板目（縦に割らないと、ただの大きな茶色い箱に見える）
    g.lineStyle(1, 0x6d4a2a, 0.55);
    for (let k = 1; k < 7; k++) {
      const p = lerp(q[3], q[2], k / 7);
      g.lineBetween(p.x, p.y - 17, p.x, p.y - 2);
    }
    for (let k = 1; k < 3; k++) {
      const p = lerp(q[2], q[1], k / 3);
      g.lineBetween(p.x, p.y - 17, p.x, p.y - 2);
    }
    const sign = lerp(q[3], q[2], 0.45); // 正面に下げた黒板
    part(g, sign.x - 9, sign.y - 15, 18, 11, 0x2f3a35, 1);
    g.fillStyle(0xf2f6f8, 0.9);
    g.fillRect(sign.x - 6, sign.y - 12, 12, 1.6);
    g.fillStyle(0xe8c9a0, 0.85);
    g.fillRect(sign.x - 6, sign.y - 9, 8, 1.4);
    const t = slab(g, q, 18, 5, 0xc08e57, 0x9a6b3f, 0x86592f); // 天板
    g.lineStyle(1.2, 0xffffff, 0.28);
    g.lineBetween(t[0].x + 3, t[0].y + 1.5, t[1].x - 3, t[1].y + 1.5);
    const cups = onTop(t, 0.18, 0.72); // 重ねたカップ
    for (let k = 0; k < 3; k++) {
      g.fillStyle(0xf4f6f7, 1);
      g.fillEllipse(cups.x, cups.y - 2 - k * 2.6, 9, 4);
      g.fillStyle(0xd9e2e8, 1);
      g.fillEllipse(cups.x, cups.y - 3 - k * 2.6, 7, 2.6);
    }
    const nap = onTop(t, 0.45, 0.74); // ナプキン立てと砂糖
    part(g, nap.x - 4, nap.y - 8, 8, 7, 0xdfe6ec, 1);
    g.fillStyle(0xf4f6f7, 1);
    g.fillRect(nap.x - 2.6, nap.y - 10, 5.2, 2.4);
    g.fillStyle(0xc9a06a, 1);
    g.fillRect(nap.x + 6, nap.y - 6, 5, 5);
    const mach = onTop(t, 0.32, 0.4); // エスプレッソマシン
    part(g, mach.x - 15, mach.y - 26, 30, 20, 0xb6c0c9, 2);
    g.fillStyle(0x8a939c, 1);
    g.fillRect(mach.x - 13, mach.y - 24, 26, 4);
    g.fillStyle(0x2b2f34, 1); // 抽出口
    g.fillRect(mach.x - 11, mach.y - 13, 9, 5);
    g.fillRect(mach.x + 2, mach.y - 13, 9, 5);
    g.fillStyle(0xd94a3d, 1);
    g.fillRect(mach.x - 11, mach.y - 18, 3, 2);
    g.fillStyle(0x9fd8c8, 1);
    g.fillRect(mach.x + 4, mach.y - 18, 7, 2);
    g.fillStyle(0xf4f6f7, 1); // 温めているカップ
    g.fillRect(mach.x - 9, mach.y - 28.4, 4, 2.6);
    g.fillRect(mach.x - 3, mach.y - 28.4, 4, 2.6);
    g.fillRect(mach.x + 3, mach.y - 28.4, 4, 2.6);
    const mill = onTop(t, 0.56, 0.36); // ミル
    part(g, mill.x - 5, mill.y - 24, 10, 18, 0xa8b1b9, 2);
    g.fillStyle(0x2b2f34, 1);
    g.fillRect(mill.x - 3.6, mill.y - 30, 7.2, 6.5); // 豆のホッパー
    g.fillStyle(0x8c5a30, 0.9);
    g.fillRect(mill.x - 2.6, mill.y - 28.5, 5.2, 3);
    const dome = onTop(t, 0.8, 0.45); // ケーキドーム
    g.fillStyle(0xdfe6ec, 1);
    g.fillEllipse(dome.x, dome.y - 3, 22, 8);
    g.fillStyle(0xe8b06a, 1);
    g.fillEllipse(dome.x, dome.y - 6, 15, 6);
    g.fillStyle(0xd94a3d, 1);
    g.fillEllipse(dome.x - 3, dome.y - 8, 4, 2.4);
    g.fillStyle(0xd8eef6, 0.5);
    g.fillEllipse(dome.x, dome.y - 10, 22, 18);
    g.lineStyle(1, OUTLINE, 0.5);
    g.strokeEllipse(dome.x, dome.y - 10, 22, 18);
    g.fillStyle(0x9aa7b4, 1);
    g.fillCircle(dome.x, dome.y - 19.5, 1.6); // ドームのつまみ
    const reg = onTop(t, 0.08, 0.5); // レジ
    part(g, reg.x - 8, reg.y - 15, 16, 11, 0x4c525c, 2);
    g.fillStyle(0x9fd8c8, 1);
    g.fillRect(reg.x - 6, reg.y - 13, 12, 5);
    make("fnCafeBar", 136, 124);
  }

  // --- カフェの丸テーブル（カップとケーキ。56×48、足元が下端）---
  {
    shadow(g, 28, 44, 34);
    g.fillStyle(0x6d4a2a, 1); // 台座と支柱
    g.fillEllipse(28, 41, 22, 8);
    g.fillRect(25.5, 26, 5, 15);
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(28, 25, 46, 17);
    g.fillStyle(0x9a6b3f, 1);
    g.fillEllipse(28, 25.5, 43, 15); // 天板の小口
    g.fillStyle(0xc08e57, 1);
    g.fillEllipse(28, 23, 43, 15);
    g.fillStyle(0xd6a878, 1);
    g.fillEllipse(26, 21.5, 30, 9); // 上を向いた面の照り
    g.fillStyle(0xf4f6f7, 1); // ソーサーとカップ
    g.fillEllipse(19, 23, 13, 5);
    g.fillRoundedRect(16, 17, 7, 5.5, 1.5);
    g.fillStyle(0x8c5a30, 1);
    g.fillRect(17, 18, 5, 1.8);
    g.fillStyle(0xdfe6ec, 1); // ケーキの皿
    g.fillEllipse(37, 25, 14, 5.4);
    g.fillStyle(0xe8b06a, 1);
    g.fillRect(33, 20, 8, 5);
    g.fillStyle(0xd94a3d, 1);
    g.fillEllipse(37, 20, 4.4, 2.4);
    outlineRect(g, 33, 20, 8, 5, 1);
    make("fnCafeRound", 56, 48);
  }

  /** カフェの椅子（曲げ木＋緑のクッション。28×38、足元が下端）。front＝こちら向き。 */
  const cafeChair = (key: string, front: boolean): void => {
    shadow(g, 14, 34, 20);
    g.fillStyle(0x6d4a2a, 1); // 脚
    g.fillRect(5, 22, 2.6, 11);
    g.fillRect(20.4, 22, 2.6, 11);
    g.fillRect(8, 25, 12, 2);
    if (front) {
      g.fillStyle(0x8a6236, 1); // 背もたれ（曲げ木の枠）
      g.fillRoundedRect(6, 2, 16, 15, 6);
      g.fillStyle(0x4f7d63, 1);
      g.fillRoundedRect(8, 4.5, 12, 10, 4);
      g.fillStyle(0x6d9c80, 1);
      g.fillRect(9, 5.5, 10, 1.8);
      part(g, 3, 17, 22, 7, 0x4f7d63, 3); // 座面
      g.fillStyle(0x6d9c80, 1);
      g.fillRect(5, 18, 18, 2.4);
    } else {
      part(g, 3, 16, 22, 6, 0x4f7d63, 3);
      g.fillStyle(0x6d4a2a, 1);
      g.fillRoundedRect(6, 3, 16, 16, 6); // 背もたれの裏
      g.fillStyle(0x8a6236, 1);
      g.fillRoundedRect(8, 5, 12, 11, 4);
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(9, 6, 10, 1.4);
    }
    make(key, 28, 38);
  };
  cafeChair("fnCafeChairF", true);
  cafeChair("fnCafeChairB", false);

  // --- 窓ぎわのベンチソファ（64×46、足元が下端）---
  {
    shadow(g, 32, 42, 50);
    part(g, 4, 8, 56, 16, 0x6d4a2a, 3); // 背もたれ
    g.fillStyle(0x8a6236, 1);
    g.fillRect(6, 10, 52, 3);
    part(g, 2, 22, 60, 12, 0x5c8f72, 4); // 座面
    g.fillStyle(0x76a88a, 1);
    g.fillRect(5, 23.5, 54, 3);
    g.lineStyle(1, 0x3f6b55, 0.8); // クッションの切れ目
    g.lineBetween(22, 23, 22, 33);
    g.lineBetween(42, 23, 42, 33);
    g.fillStyle(0x6d4a2a, 1); // 脚
    g.fillRect(6, 34, 4, 7);
    g.fillRect(54, 34, 4, 7);
    part(g, 12, 12, 10, 9, 0xe8c9a0, 2); // クッション
    part(g, 42, 13, 10, 8, 0xd98c6a, 2);
    make("fnCafeSofa", 64, 46);
  }
  g.destroy();
}
