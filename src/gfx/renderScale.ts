import type Phaser from "phaser";
import { textResolution } from "./textStyle";

/**
 * 画面を描くきめ細かさ（1＝論理540×960の画素のまま／2＝縦横2倍の画素で描く）。
 *
 * 【なぜ要るか】このゲームは論理540×960で組み、Scale.FIT で端末いっぱいに引き伸ばす。
 * canvas そのものが540×960の画素しか持たないと、スマホ（実画面1080px前後）では
 * **画面全体が約2倍に引き伸ばされ**、文字の輪郭がにじむ。
 * 文字だけ細かく描いても（textStyle の resolution）、540pxの canvas に縮めて貼った時点で
 * 細かさは失われるので、canvas の画素そのものを増やす必要がある。
 *
 * 【どう描くか】canvas を RENDER_SCALE 倍の大きさで作り（main.ts）、
 * 各シーンのメインカメラを RENDER_SCALE 倍にズームする（原点は左上）。
 * これで**すべての座標は論理540×960のまま**、画素だけが細かくなる。
 *
 * 【気を付けること】指の座標（pointer.x／y・getDistance）だけは canvas の画素で届く。
 * 画面の座標と比べるときは、必ず logicalPoint／logicalDistance を通すこと。
 * オブジェクトの pointerdown などの当たり判定は、Phaser がカメラを通して計算するので変換は要らない。
 *
 * 画素密度1の端末（PCのふつうの画面）では 1 になり、今までと全く同じに描かれる。
 */
export const RENDER_SCALE = textResolution();

/** シーンのメインカメラを、論理座標のまま RENDER_SCALE 倍の画素で描くようにする。create の最初に呼ぶ。 */
export function applyRenderScale(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(RENDER_SCALE);
}

/** 指の位置（canvas の画素）→ 論理座標（540×960）。 */
export function logicalPoint(p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x / RENDER_SCALE, y: p.y / RENDER_SCALE };
}

/** 押してから動いた距離（論理px）。 */
export function logicalDistance(p: Phaser.Input.Pointer): number {
  return p.getDistance() / RENDER_SCALE;
}
