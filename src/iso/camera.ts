/**
 * カメラ送りの計算（純関数・Phaser 非依存）。
 *
 * 建設・配置モードでは画面のドラッグが「ゴーストを動かす」に取られるため、
 * ふつうの方法ではカメラを動かせない。そこで
 *   ・指がステージの端に近づいたら、その方向へ自動で送る（edgeScrollVector）
 *   ・置こうとしているものが画面の外にいたら、見えるところまで寄せる（keepInViewOffset）
 * の2つで「画面外にも手が届く」ようにしている。
 */

/** 画面上の矩形（ステージの見えている範囲や、対象の外接矩形）。 */
export interface ViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Vec2 {
  dx: number;
  dy: number;
}

/**
 * 端をなぞったときにカメラを送る向きと強さ（各成分 -1〜1）。
 *
 * 端から margin px の帯に入ると効きはじめ、いちばん端で 1.0 になる。
 * 帯の浅いところではゆっくり動くので、狙った場所で止めやすい。
 * 符号は「カメラの位置に足す向き」＝指が左端なら右へ送る（+）。
 */
export function edgeScrollVector(px: number, py: number, view: ViewRect, margin: number): Vec2 {
  if (margin <= 0) return { dx: 0, dy: 0 };
  const push = (dist: number): number => Math.min(1, Math.max(0, (margin - dist) / margin));

  let dx = 0;
  let dy = 0;
  if (px < view.left + margin) dx = push(px - view.left);
  else if (px > view.right - margin) dx = -push(view.right - px);
  if (py < view.top + margin) dy = push(py - view.top);
  else if (py > view.bottom - margin) dy = -push(view.bottom - py);
  return { dx, dy };
}

/**
 * 対象（box）を画面（view）の中へ入れるために、カメラを動かす量。
 * すでに入っていれば 0。対象が画面より大きいときは左上に合わせる。
 */
export function keepInViewOffset(box: ViewRect, view: ViewRect, margin: number): Vec2 {
  let dx = 0;
  let dy = 0;
  if (box.left < view.left + margin) dx = view.left + margin - box.left;
  else if (box.right > view.right - margin) dx = view.right - margin - box.right;
  if (box.top < view.top + margin) dy = view.top + margin - box.top;
  else if (box.bottom > view.bottom - margin) dy = view.bottom - margin - box.bottom;
  return { dx, dy };
}

/** 4隅の点から外接矩形を作る。 */
export function boundsOf(points: readonly { x: number; y: number }[]): ViewRect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
