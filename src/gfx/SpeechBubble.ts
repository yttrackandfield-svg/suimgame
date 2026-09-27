import Phaser from "phaser";
import { CHATTER } from "../config/balance";
import type { ChatterTone } from "../sim/chatter";

/**
 * キャラの頭上に出る吹き出し。
 *
 * 丸っこい白い吹き出し＋短いセリフ。ポンと出て、少し浮かんで消える。
 *
 * 【画面座標に置く】ワールド（施設）は 0.4〜2.2 倍に拡大縮小されるので、
 * その中に文字を置くと引きの絵で読めなくなる。「+1」演出（GainPopup）と同じく
 * 画面のレイヤに置き、**毎フレーム持ち主の頭の上へ位置を合わせ直す**。
 *
 * 軽さのための約束（GainPopup と同じ）：
 *  - Graphics / Text はプールして使い回す（毎回 new しない）
 *  - tween を使わず update() で手計算する
 *  - 下地（角丸＋しっぽ）は**文字の幅が変わったときだけ**描き直す
 */

/** 吹き出しがついていく先（ワールド座標の頭の上）。null を返すと消える。 */
export type BubbleAnchor = () => { x: number; y: number } | null;

interface Bubble {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  /** 経過（秒）。-1 で未使用。 */
  t: number;
  anchor: BubbleAnchor | null;
  /** 前に描いた下地の大きさ（変わらなければ描き直さない）。 */
  drawnW: number;
  drawnH: number;
  seq: number;
}

export class SpeechBubbleLayer {
  private readonly pool: Bubble[] = [];
  private seq = 0;

  /**
   * @param parent 画面座標系のコンテナ（ワールドではなく画面に重ねる）
   */
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    const look = CHATTER.look;
    for (let i = 0; i < CHATTER.maxConcurrent; i++) {
      const bg = scene.add.graphics();
      const text = scene.add
        .text(0, 0, "", {
          fontFamily: "sans-serif",
          fontSize: `${look.fontSize}px`,
          color: CHATTER.toneColor.plain,
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5);
      const root = scene.add.container(0, 0, [bg, text]).setVisible(false);
      parent.add(root);
      this.pool.push({ root, bg, text, t: -1, anchor: null, drawnW: -1, drawnH: -1, seq: 0 });
    }
  }

  /** 今しゃべっている数（出しすぎないための判断に使う）。 */
  activeCount(): number {
    let n = 0;
    for (const b of this.pool) if (b.t >= 0) n++;
    return n;
  }

  /** 1つ出す。anchor はワールド座標（頭の上）を返す関数。 */
  spawn(anchor: BubbleAnchor, text: string, tone: ChatterTone): void {
    const b = this.take();
    b.t = 0;
    b.anchor = anchor;
    b.seq = ++this.seq;
    b.text.setText(text);
    b.text.setColor(CHATTER.toneColor[tone] ?? CHATTER.toneColor.plain);
    this.redraw(b);
    b.root.setVisible(true).setAlpha(1).setScale(0.5);
  }

  /**
   * 位置合わせと寿命の進行。
   * @param toScreen ワールド座標 → 画面座標（world コンテナの位置と倍率で決まる）
   * @param view 施設が見えている範囲（画面座標）。この外に出た吹き出しは隠す
   */
  update(
    dt: number,
    toScreen: (p: { x: number; y: number }) => { x: number; y: number },
    view: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const life = CHATTER.lifeSec;
    for (const b of this.pool) {
      if (b.t < 0) continue;
      b.t += dt;
      const at = b.anchor?.() ?? null;
      // 持ち主が消えた（帰った・画面から外れた）ら、そこで終わり
      if (!at || b.t >= life) {
        b.t = -1;
        b.anchor = null;
        b.root.setVisible(false);
        continue;
      }
      const k = b.t / life;
      const s = toScreen(at);
      const y = s.y - CHATTER.look.lift - k * 6;
      // 【画面の外に出た人の吹き出しは出さない】
      // スクロールや拡大で持ち主が画面の外へ出たとき、端に貼りついた吹き出しだけが
      // 残ると「誰がしゃべっているのか分からない上に、文字が切れる」。
      if (s.x < view.x0 || s.x > view.x1 || y < view.y0 || s.y > view.y1) {
        b.root.setVisible(false);
        continue;
      }
      // 端に寄りすぎたら、吹き出しが切れないところまで押し戻す（しっぽは持ち主を指したまま）
      const half = b.drawnW / 2 + 4;
      const x = Math.min(view.x1 - half, Math.max(view.x0 + half, s.x));
      // 出はじけて → ゆっくり浮きながら消える
      const pop = k < 0.16 ? 0.5 + (k / 0.16) * 0.55 : 1.05 - Math.min(0.05, (k - 0.16) * 0.1);
      b.root.setVisible(true);
      b.root.setScale(pop);
      b.root.setPosition(x, y);
      b.root.setAlpha(k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
    }
  }

  /** 画面切り替えなどで一斉に消す。 */
  clear(): void {
    for (const b of this.pool) {
      b.t = -1;
      b.anchor = null;
      b.root.setVisible(false);
    }
  }

  /**
   * 下地（角丸の吹き出し＋下向きのしっぽ）を描く。
   * 文字の幅が変わったときだけ描き直すので、毎フレームの負担は無い。
   */
  private redraw(b: Bubble): void {
    const look = CHATTER.look;
    const w = Math.ceil(b.text.width) + look.padX * 2;
    const h = Math.ceil(b.text.height) + look.padY * 2;
    if (w === b.drawnW && h === b.drawnH) return;
    b.drawnW = w;
    b.drawnH = h;
    const r = Math.min(look.radius, h / 2);
    const g = b.bg;
    g.clear();
    // 影（ほんの少しだけ。浮いて見せる）
    g.fillStyle(0x14202c, 0.16);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, r);
    // 本体（白＋やわらかい縁）
    g.fillStyle(0xffffff, 0.97);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(2, 0xd8e2ea, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    // しっぽ（下向きの三角。頭のほうを指す）
    const tail = look.tail;
    g.fillStyle(0xffffff, 0.97);
    g.beginPath();
    g.moveTo(-tail * 0.8, h / 2 - 1);
    g.lineTo(tail * 0.8, h / 2 - 1);
    g.lineTo(0, h / 2 + tail);
    g.closePath();
    g.fillPath();
  }

  private take(): Bubble {
    const free = this.pool.find((b) => b.t < 0);
    if (free) return free;
    // 全部使用中：いちばん古いものを奪う
    return this.pool.reduce((a, b) => (a.seq <= b.seq ? a : b));
  }
}
