import type Phaser from "phaser";

/**
 * 【接地影】立ち絵が床から浮いて見えるのを防ぐ、足元の楕円の影。
 *
 * 什器には前からこの影が入っている（→ gfx/furniture.ts の shadow）。
 * 人には無かったので、**立ち止まっている人が板を立てたように見えていた**。
 * 影は「その人の地面の位置」に置いて、体だけを上下させると、
 * 一枚絵でも「地面に立っている・足を上げた」ように見える。
 *
 * 絵は1枚だけ作って全員で使い回す（人数が増えても増えない）。
 */
export const GROUND_SHADOW_KEY = "charGroundShadow";

/** 影の絵の大きさ（この解像度で作って、表示するときに縮める）。 */
const W = 96;
const H = 40;
/** ぼかしの段数。多いほど滑らかだが、作るのは起動時の1回だけ。 */
const STEPS = 7;

/** まだ無ければ影のテクスチャを作る（何度呼んでもよい）。 */
export function ensureGroundShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists(GROUND_SHADOW_KEY)) return;
  const g = scene.add.graphics();
  for (let i = 0; i < STEPS; i++) {
    const k = 1 - i / STEPS;
    g.fillStyle(0x0d1620, 0.065);
    g.fillEllipse(W / 2, H / 2, W * k, H * k);
  }
  g.generateTexture(GROUND_SHADOW_KEY, W, H);
  g.destroy();
}

/**
 * その背丈の人に合う影の大きさ（表示倍率）。
 * 横は背丈のおよそ半分、縦はその 0.36 倍にすると、等角の床に馴染む。
 */
export function groundShadowScale(bodyHeight: number): { x: number; y: number } {
  const w = bodyHeight * 0.52;
  return { x: w / W, y: (w * 0.36) / H };
}
