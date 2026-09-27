import type Phaser from "phaser";

/**
 * 角丸・円の描き方を、スマホでも耐えられる細かさに置き換える。
 *
 * 【何が問題だったか】
 * Phaser の Graphics は「描いた絵」を持たず、**毎フレーム描画命令をやり直す**。
 * その中で arc（円弧）は、半径に関係なく必ず **100 個の点**に分割される
 * （node_modules/phaser の GraphicsWebGLRenderer に iterStep = 0.01 と直書きされている）。
 *
 * ボタン1つは「影の角丸＋本体の角丸＋外枠の角丸」の3回で、角は 4×3＝12 個。
 * つまり **1フレームあたり約1200個の点オブジェクトが作られては捨てられる**。
 * フッターだけでボタンは14個あるので、毎秒 100万個 近い使い捨てが起きていた。
 * これがスマホでのゴミ集め（GC）の山を作り、「一瞬固まる」の正体になっていた。
 *
 * 【どう直すか】
 * 角丸の半径は 6〜12px しかないのに、100分割は明らかに過剰。
 * 半径に応じて 2〜12 分割に落とす。半径8pxを4分割したときの実際のズレは
 * 0.15px（＝目では分からない）だが、点の数は 1/17 になる。
 *
 * Phaser 本体を書き換えるのではなく、起動時にメソッドを差し替える方式にしてある。
 * 呼び出し側（Button / Modal / Gauge …）は一切変えなくてよく、
 * Phaser を更新しても差し替えが外れるだけで壊れない。
 *
 * main.ts で、ゲームを作る前に installShapeDefaults(Phaser.GameObjects.Graphics) を呼ぶこと。
 * Phaser は型としてだけ読み込んでいる（ブラウザ無しの検証スクリプトから
 * 分割数の計算を確かめられるようにするため。roomStyle.ts と同じ方針）。
 */

type Radius = number | { tl?: number; tr?: number; bl?: number; br?: number };

/**
 * 円弧ひとつ（90度ぶん）の分割数。
 * 半径が小さいほど粗くてよい。上限を決めておかないと大きな円で元の木阿弥になる。
 */
function quarterSteps(radius: number): number {
  return Math.max(2, Math.min(12, Math.ceil(radius / 2)));
}

/** 円ひとまわりの分割数。 */
function circleSteps(radius: number): number {
  return Math.max(6, Math.min(48, Math.ceil(radius * 1.2)));
}

const HALF_PI = Math.PI / 2;

/** 円弧を折れ線として足す（始点は呼び出し側が置いてある前提）。 */
function arcTo(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  steps: number,
): void {
  for (let i = 1; i <= steps; i++) {
    const a = from + (to - from) * (i / steps);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

/** 角丸の輪郭を、折れ線だけで組み立てる（arc を使わない）。 */
function roundedPath(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: Radius,
): void {
  const max = Math.min(Math.abs(w), Math.abs(h)) / 2;
  const clamp = (v: number): number => Math.min(Math.abs(v), max);

  let tl: number;
  let tr: number;
  let bl: number;
  let br: number;
  if (typeof radius === "number") {
    tl = tr = bl = br = clamp(radius);
  } else {
    tl = clamp(radius.tl ?? 20);
    tr = clamp(radius.tr ?? 20);
    bl = clamp(radius.bl ?? 20);
    br = clamp(radius.br ?? 20);
  }

  g.beginPath();
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  if (tr > 0) arcTo(g, x + w - tr, y + tr, tr, -HALF_PI, 0, quarterSteps(tr));
  g.lineTo(x + w, y + h - br);
  if (br > 0) arcTo(g, x + w - br, y + h - br, br, 0, HALF_PI, quarterSteps(br));
  g.lineTo(x + bl, y + h);
  if (bl > 0) arcTo(g, x + bl, y + h - bl, bl, HALF_PI, Math.PI, quarterSteps(bl));
  g.lineTo(x, y + tl);
  if (tl > 0) arcTo(g, x + tl, y + tl, tl, Math.PI, Math.PI + HALF_PI, quarterSteps(tl));
}

/** 円の輪郭を折れ線として組み立てる。 */
function circlePath(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  const steps = circleSteps(r);
  g.beginPath();
  g.moveTo(x + r, y);
  arcTo(g, x, y, r, 0, Math.PI * 2, steps);
}

/** 一度だけ差し替える（二重に呼んでも安全）。 */
let installed = false;

export function installShapeDefaults(graphicsClass: typeof Phaser.GameObjects.Graphics): void {
  if (installed) return;
  installed = true;

  const proto = graphicsClass.prototype;

  proto.fillRoundedRect = function (x: number, y: number, w: number, h: number, radius: Radius = 20) {
    roundedPath(this, x, y, w, h, radius);
    this.fillPath();
    return this;
  };

  proto.strokeRoundedRect = function (x: number, y: number, w: number, h: number, radius: Radius = 20) {
    roundedPath(this, x, y, w, h, radius);
    this.strokePath();
    return this;
  };

  proto.fillCircle = function (x: number, y: number, radius: number) {
    circlePath(this, x, y, radius);
    this.fillPath();
    return this;
  };

  proto.strokeCircle = function (x: number, y: number, radius: number) {
    circlePath(this, x, y, radius);
    this.strokePath();
    return this;
  };
}

/**
 * 角丸ひとつを描くのに作られる点の数（検証用）。
 * 差し替え前の Phaser は、角の数 × 100 ＋ 直線4 で必ず 404 個だった。
 */
export function roundedRectPointCount(w: number, h: number, radius: number): number {
  const r = Math.min(Math.abs(radius), Math.min(Math.abs(w), Math.abs(h)) / 2);
  if (r <= 0) return 4;
  return 4 + 4 * quarterSteps(r);
}

/** 円ひとつを描くのに作られる点の数（検証用）。 */
export function circlePointCount(radius: number): number {
  return 1 + circleSteps(radius);
}

/** 差し替え前の Phaser が作っていた点の数（検証用の比較対象）。 */
export const PHASER_ARC_POINTS = 100;
