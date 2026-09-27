import Phaser from "phaser";

/**
 * 練習中の「+1」演出。
 *
 * 能力が上がるたびに、キャラの近くに上昇量の数字をポンッと出す。
 * 数字を囲む円の色でどのステータスが上がったか分かる（色は STAT_COLOR）。
 *
 * たくさん出ても重くならないよう：
 *  - Text / Image はプールして使い回す（毎回 new しない）
 *  - tween を使わず update() で手計算（TweenManager に大量登録しない）
 *  - 上限に達したら最も古いものを再利用する
 */

const POOL_SIZE = 48;
const LIFE = 0.85; // 表示時間（秒）
const RISE = 34; // 上に浮く距離（px）

interface Popup {
  root: Phaser.GameObjects.Container;
  disc: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  t: number; // 経過（秒）。-1 で未使用
  x: number;
  y: number;
  seq: number; // 使い始めた順（古いものから再利用）
}

export class GainPopupLayer {
  private readonly pool: Popup[] = [];
  private seq = 0;

  /**
   * @param parent 画面座標系のコンテナ（ワールドではなく画面に重ねる。
   *               ワールドは縮小表示されるため、文字が潰れないように）
   */
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const disc = scene.add.image(0, 0, "gainDisc").setOrigin(0.5);
      const text = scene.add
        .text(0, 0, "", {
          fontFamily: "sans-serif",
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#12324a",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const root = scene.add.container(0, 0, [disc, text]).setVisible(false);
      parent.add(root);
      this.pool.push({ root, disc, text, t: -1, x: 0, y: 0, seq: 0 });
    }
  }

  /** 1つ出す。x/y は画面座標。 */
  spawn(x: number, y: number, amount: number, color: number): void {
    const p = this.take();
    p.t = 0;
    p.x = x + (Math.random() - 0.5) * 14;
    p.y = y;
    p.seq = ++this.seq;
    p.text.setText(`+${amount}`);
    p.text.setColor("#ffffff");
    p.disc.setTint(color).setVisible(true);
    // 大きい上昇ほど少し大きく出す（気持ちよさ優先）
    const big = Math.min(1.5, 1 + (amount - 1) * 0.12);
    p.root.setScale(big * 0.6).setAlpha(1).setVisible(true);
    p.root.setPosition(p.x, p.y);
    p.root.setData("big", big);
  }

  /**
   * ごく小さな「伸びている」印（▲）。
   *
   * 能力は1回の練習で 0.1 前後しか上がらないので、「+1」だけだと
   * ひとりの子を見ていてもめったに出ない。**上がっているあいだ中ずっと**
   * 能力の色の小さな印を出して、育っていることが目で分かるようにする。
   * 数字（+1）は、育成パネルの整数が繰り上がった瞬間だけ出る。
   */
  spawnTick(x: number, y: number, color: number): void {
    const p = this.take();
    p.t = 0;
    p.x = x + (Math.random() - 0.5) * 16;
    p.y = y;
    p.seq = ++this.seq;
    p.text.setText("▲");
    p.text.setColor(`#${(color >>> 0).toString(16).padStart(6, "0")}`);
    p.disc.setVisible(false);
    p.root.setScale(0.5).setAlpha(0.95).setVisible(true);
    p.root.setPosition(p.x, p.y);
    p.root.setData("big", 0.62);
  }

  /**
   * 記号だけを1つ出す（一般客の「満足」マークなど）。
   *
   * 数字と同じ浮かび方・同じプールを使う。**円は出さない**ので、
   * 「能力が上がった数字」と「気分のマーク」が見分けられる。
   */
  spawnMark(x: number, y: number, mark: string, color: number): void {
    const p = this.take();
    p.t = 0;
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y;
    p.seq = ++this.seq;
    p.text.setText(mark);
    p.text.setColor(`#${(color >>> 0).toString(16).padStart(6, "0")}`);
    p.disc.setVisible(false);
    p.root.setScale(0.6).setAlpha(1).setVisible(true);
    p.root.setPosition(p.x, p.y);
    p.root.setData("big", 1.35);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.t < 0) continue;
      p.t += dt;
      const k = p.t / LIFE;
      if (k >= 1) {
        p.t = -1;
        p.root.setVisible(false);
        continue;
      }
      const big = (p.root.getData("big") as number) ?? 1;
      // 出はじけて → ゆっくり浮きながら消える
      const pop = k < 0.18 ? 0.6 + (k / 0.18) * 0.5 : 1.1 - (k - 0.18) * 0.12;
      p.root.setScale(big * pop);
      p.root.setPosition(p.x, p.y - RISE * Math.pow(k, 0.65));
      p.root.setAlpha(k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
    }
  }

  /** 画面切り替えなどで一斉に消す。 */
  clear(): void {
    for (const p of this.pool) {
      p.t = -1;
      p.root.setVisible(false);
    }
  }

  private take(): Popup {
    let free = this.pool.find((p) => p.t < 0);
    if (!free) {
      // 全部使用中：いちばん古いものを奪う
      free = this.pool.reduce((a, b) => (a.seq <= b.seq ? a : b));
    }
    return free;
  }
}
