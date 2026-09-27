/**
 * 「動かない絵」を一度だけ描いて焼き付けるときの、分割の計算（純ロジック・Phaser 非依存）。
 *
 * **なぜ焼くのか**
 * Phaser の Graphics は描いた結果を絵として持たず、毎フレーム描画命令をぜんぶやり直す。
 * 26x26 マスの床をそのまま Graphics で持つと、1フレームあたり 2万個の命令と
 * 800回以上の多角形分割（earcut）が走り、スマホでは操作できないほど重くなる。
 * 一度だけ描いてテクスチャに焼いてしまえば、毎フレームの仕事は
 * 「四角い絵を数枚貼る」だけになる。
 *
 * **なぜ分けるのか**
 * 端末が1枚のテクスチャに使える大きさには上限がある（古い機種ほど小さい）。
 * 上限を超えそうなときは格子に分けて焼く。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 1枚のテクスチャに使ってよい最大の辺（px）。
 * WebGL が動く端末なら、この大きさはまず確実に作れる。
 */
export const BAKE_MAX = 2048;

/**
 * 分けて焼くときに、となり合う絵を重ねる幅（px）。
 * 拡大縮小したときに継ぎ目へ髪の毛のような隙間が出るのを防ぐ。
 * 重なった部分は同じ絵なので、二重に描いても見た目は変わらない。
 */
export const BAKE_OVERLAP = 2;

/**
 * area を、1辺が max を超えないタイルに分ける。
 * 1枚で足りるときは重なりを付けずにそのまま1枚返す。
 *
 * 返るタイルは area 全体を必ず覆う（欠けは出ない）。
 */
/** 切り上げて偶数にする。 */
function even(v: number): number {
  return Math.ceil(v / 2) * 2;
}

export function bakeChunks(area: Rect, max = BAKE_MAX, overlap = BAKE_OVERLAP): Rect[] {
  const w = Math.max(1, Math.ceil(area.w));
  const h = Math.max(1, Math.ceil(area.h));
  const cols = Math.max(1, Math.ceil(w / max));
  const rows = Math.max(1, Math.ceil(h / max));
  // Phaser は RenderTexture の縦横を偶数に丸めるので、こちらで偶数にそろえておく
  // （切り捨てられて 1px 足りなくなり、継ぎ目に線が出るのを防ぐ）
  const cw = even(w / cols);
  const ch = even(h / rows);
  const pad = cols > 1 || rows > 1 ? overlap : 0;

  const out: Rect[] = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      out.push({
        x: area.x + rx * cw - pad,
        y: area.y + ry * ch - pad,
        w: cw + pad * 2,
        h: ch + pad * 2,
      });
    }
  }
  return out;
}
