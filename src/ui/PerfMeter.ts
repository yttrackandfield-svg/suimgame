import Phaser from "phaser";
import { HUD_H } from "../config";
import { settings } from "../save/settings";

/**
 * 動作の重さを画面で確かめるための表示。
 *
 * スマホは実機で触るまで重さが分からないので、
 *   FPS  … 動きの滑らかさ（60 が上限。30を切ると目に見えてカクつく）
 *   表示 … いま画面に出ている表示物の数
 *   施設 … 施設の絵（world）に入っている表示物の数＝毎フレーム並べ替えている数
 *   組立 … 直前に開いたパネルの組み立てにかかった時間（ms）
 * を出しておく。「開いた瞬間だけ固まる」のか「ずっと重い」のかを切り分けられる。
 *
 * 【出す・出さないは設定の1つだけで決まる】
 * 既定は **オフ**（設定 → 動作の重さを表示）。開発中でも勝手には出さない。
 * 以前は npm run dev で常に出していたが、通知やゲーム画面に重なって邪魔だった。
 *
 * 置き場所は**ステージの左上**。通知は右上に出るので重ならない。
 * 文字も2行に分けて短くし、横幅が通知の領域まで伸びないようにしてある。
 */
export class PerfMeter {
  private readonly text: Phaser.GameObjects.Text;
  private acc = 0;
  private frames = 0;
  private fps = 0;
  private worst = 999;
  private lastBuildMs = 0;
  private lastBuildLabel = "";
  /** 施設の絵（world コンテナ）。毎フレーム深度で並べ替えている対象。 */
  private world?: Phaser.GameObjects.Container;
  /** パネルを開いている間は隠す（UIの文字に重ならないように）。 */
  private suppressed = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      // ステージの左上に小さく置く。
      // 通知は右上（NoticeFeed）なので、ここなら重ならない。
      .text(6, HUD_H + 4, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#7fd1ae",
        backgroundColor: "#0a1622cc",
        padding: { x: 4, y: 2 },
        // 通知の領域（右側）まで伸びないように、横幅を左の余白ぶんに抑える
        fixedWidth: 118,
      })
      .setOrigin(0, 0)
      .setDepth(4000)
      .setScrollFactor(0)
      .setVisible(false);
  }

  destroy(): void {
    this.text.destroy();
  }

  /** 並べ替えの対象になっているコンテナを教える（数を出すため）。 */
  watch(world: Phaser.GameObjects.Container): void {
    this.world = world;
  }

  /** パネルなどの組み立てにかかった時間を記録する。 */
  noteBuild(label: string, ms: number): void {
    this.lastBuildMs = ms;
    this.lastBuildLabel = label;
  }

  /**
   * 一時的に隠す（画面を覆うパネルを開いている間）。
   * 計測は続けるので、閉じたときの数字はそのまま読める。
   */
  setSuppressed(v: boolean): void {
    this.suppressed = v;
  }

  update(dtSeconds: number): void {
    const on = settings().showFps && !this.suppressed;
    if (!on) {
      if (this.text.visible) this.text.setVisible(false);
      return;
    }
    if (!this.text.visible) this.text.setVisible(true);

    this.acc += dtSeconds;
    this.frames++;
    if (this.acc < 0.35) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    this.worst = Math.min(this.worst, this.fps);

    const objects = this.scene.children.list.length;
    const inWorld = this.world ? this.world.list.length : 0;
    // 2行に分けて短く（1行に詰めると横に伸びて通知に重なる）
    const build = this.lastBuildLabel ? `\n${this.lastBuildLabel} ${this.lastBuildMs.toFixed(0)}ms` : "";
    this.text
      .setText(
        `FPS ${this.fps.toFixed(0)} (最低${this.worst.toFixed(0)})\n` +
          `物 ${objects} / 施設 ${inWorld}${build}`,
      )
      .setColor(this.fps < 30 ? "#f87171" : this.fps < 50 ? "#f7dc6f" : "#7fd1ae");
  }
}

/**
 * 計測表示を作る。
 * 出すかどうかは update() のたびに設定を見るので、遊んでいる最中に切り替えられる。
 */
export function createPerfMeter(scene: Phaser.Scene): PerfMeter {
  return new PerfMeter(scene);
}
