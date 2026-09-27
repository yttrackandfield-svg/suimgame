import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, COLORS } from "./config";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { SlotScene } from "./scenes/SlotScene";
import { FacilityScene } from "./scenes/FacilityScene";
import { MeetScene } from "./scenes/MeetScene";
import { installTextDefaults } from "./gfx/textStyle";
import { installShapeDefaults } from "./gfx/shapes";
import { RENDER_SCALE } from "./gfx/renderScale";

// 文字のフォントと描画のきめ細かさを決める。ゲームを作る前に呼ぶこと。
installTextDefaults();
// 角丸・円の分割を、スマホでも耐えられる細かさに落とす（→ gfx/shapes.ts）。
// これも Graphics を作る前＝ゲームを作る前に呼ぶ必要がある。
installShapeDefaults(Phaser.GameObjects.Graphics);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  // 座標は論理540×960のまま、canvas の画素だけ RENDER_SCALE 倍にする
  // （スマホで画面ごと引き伸ばされて文字がにじむのを防ぐ → gfx/renderScale.ts）
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  backgroundColor: COLORS.bgDeep,
  /**
   * pixelArt を全体に掛けると、文字（Text）まで NEAREST で拡大されて潰れる。
   * スマホは論理540pxを2倍前後に引き伸ばすので、文字がいちばん読みづらくなる。
   * そこで全体は滑らかに描き、ドット絵のテクスチャだけ個別に NEAREST を指定している
   * （gfx/textures.ts の createTextures の最後で設定）。
   */
  pixelArt: false,
  antialias: true,
  /**
   * WebGL のマルチサンプリング（MSAA）は切る。
   * antialias:true はテクスチャの補間（＝文字がにじまない）ために要るが、
   * それとは別に MSAA が有効になると、スマホの GPU では目に見えて重くなる。
   */
  antialiasGL: false,
  powerPreference: "high-performance",
  roundPixels: true, // 描画座標を整数に丸める（にじみ・ちらつき対策）
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, SlotScene, FacilityScene, MeetScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
