import Phaser from "phaser";
import { SATISFACTION } from "../config/balance";
import { moodColor, moodStars, MOOD_MAX } from "../sim/satisfaction";

/**
 * 満足度（機嫌）の★ゲージ。
 *
 * 参考画像の★ゲージと同じで、**じわじわ伸びる**のが肝。
 * 値が変わっても一気に切り替えず、毎フレーム少しずつ目標へ近づける。
 *
 * 使い道は2つ：
 *   StarMeter      … HUD や育成パネルに置く固定のゲージ
 *   MoodGaugeLayer … キャラの頭上に一時的に出すゲージ（プールして使い回す）
 *
 * 星の描き方は共通（drawStarBar）。1つの★は
 *   ・空の星（暗い下地）を必ず描く
 *   ・満ちているぶんだけ、色つきの星を**大きさと濃さ**で重ねる
 * ので、端数がそのまま「育ちかけの星」に見える。
 */

/** 星ひとつぶんの多角形（頂点10個。中心 (cx,cy)、外径 r）。 */
function starPath(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(rad) * rr;
    const y = cy + Math.sin(rad) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

export interface StarBarOptions {
  /** 星ひとつの外径（px）。 */
  radius?: number;
  /** 星と星の間隔（px）。省略すると radius から決まる。 */
  gap?: number;
  /** 星の色（省略すると満足度から決まる）。 */
  color?: number;
  /** 空の星の色。 */
  emptyColor?: number;
  /** 左端の座標を x にそろえる（既定は中央ぞろえ）。 */
  align?: "center" | "left";
}

/** ★ゲージ全体の横幅（配置の計算に使う）。 */
export function starBarWidth(count: number, radius: number, gap?: number): number {
  const step = radius * 2 + (gap ?? radius * 0.5);
  return step * count - (gap ?? radius * 0.5);
}

/**
 * ★ゲージを1つ描く（Graphics は呼び出し側が clear する）。
 * @param value 満足度 0-100
 */
export function drawStarBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  value: number,
  opts: StarBarOptions = {},
): void {
  const count = SATISFACTION.starCount;
  const r = opts.radius ?? 6;
  const gap = opts.gap ?? r * 0.5;
  const step = r * 2 + gap;
  const color = opts.color ?? moodColor(value);
  const empty = opts.emptyColor ?? 0x27384a;
  const filled = moodStars(value);
  const left = opts.align === "left" ? x + r : x - (step * count - gap) / 2 + r;

  for (let i = 0; i < count; i++) {
    const cx = left + i * step;
    // 空の星（下地）。これがあるので「あと何個ぶん伸びるか」が分かる
    g.fillStyle(empty, 0.85);
    starPath(g, cx, y, r);
    g.fillPath();
    const k = Math.max(0, Math.min(1, filled - i));
    if (k <= 0.02) continue;
    // 満ちているぶん。端数の星は小さく薄く出て、伸びるにつれ育っていく
    g.fillStyle(color, 0.35 + 0.65 * k);
    starPath(g, cx, y, r * (0.55 + 0.45 * k));
    g.fillPath();
  }
}

/**
 * 固定表示の★ゲージ（HUD・育成パネル）。
 * setValue で目標を決めると、update のたびにじわじわ近づく。
 */
export class StarMeter {
  readonly graphics: Phaser.GameObjects.Graphics;
  private shown = 0;
  private target = 0;
  /** 前に描いた値（変わらなければ描き直さない）。 */
  private drawn = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly opts: StarBarOptions = {},
  ) {
    this.graphics = scene.add.graphics();
  }

  /** いまの表示値（0-100）。 */
  get value(): number {
    return this.shown;
  }

  /** 目標値を決める。表示は update で少しずつ近づく。 */
  setValue(v: number, immediate = false): void {
    this.target = Math.max(0, Math.min(MOOD_MAX, v));
    if (immediate) this.shown = this.target;
  }

  update(dt: number): void {
    if (Math.abs(this.target - this.shown) > 0.1) {
      // 「じわじわ伸びる」＝1秒あたり gaugeFillPerSec 割ぶんだけ差を詰める
      const k = Math.min(1, dt * SATISFACTION.gaugeFillPerSec);
      this.shown += (this.target - this.shown) * k;
    } else {
      this.shown = this.target;
    }
    // 0.5点きざみでだけ描き直す（毎フレーム Graphics を描き直さない）
    const q = Math.round(this.shown * 2) / 2;
    if (q === this.drawn) return;
    this.drawn = q;
    this.graphics.clear();
    drawStarBar(this.graphics, this.x, this.y, this.shown, this.opts);
  }

  setVisible(v: boolean): void {
    this.graphics.setVisible(v);
  }

  setDepth(d: number): void {
    this.graphics.setDepth(d);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

// ------------------------------------------------------------------ 頭上のゲージ

/** ゲージがついていく先（ワールド座標の頭の上）。null を返すと消える。 */
export type GaugeAnchor = () => { x: number; y: number } | null;

interface Overhead {
  g: Phaser.GameObjects.Graphics;
  /** 経過（秒）。-1 で未使用。 */
  t: number;
  /** 表示中の値と目標値（じわじわ伸ばすため2つ持つ）。 */
  shown: number;
  target: number;
  anchor: GaugeAnchor | null;
  /** 一時表示か（false＝選んでいる人につけっぱなし）。 */
  sticky: boolean;
  drawn: number;
  seq: number;
}

/** 頭上の★ゲージの数（同時に出せる人数）。 */
const OVERHEAD_POOL = 6;

/** 頭の上どれだけ浮かせるか（px）。吹き出しと重ならない高さにしてある。 */
const OVERHEAD_LIFT = 8;

/**
 * キャラの頭上に出す★ゲージ。
 * 満足して帰る客・回復した選手・タップして選んでいる人に出す。
 */
export class MoodGaugeLayer {
  private readonly pool: Overhead[] = [];
  private seq = 0;

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    for (let i = 0; i < OVERHEAD_POOL; i++) {
      const g = scene.add.graphics().setVisible(false);
      parent.add(g);
      this.pool.push({ g, t: -1, shown: 0, target: 0, anchor: null, sticky: false, drawn: -1, seq: 0 });
    }
  }

  /**
   * 1つ出す。
   * @param from 伸び始める値（省略すると 0 から伸びる＝「じわじわ伸びる」演出）
   * @param sticky true＝時間で消えない（選んでいる人につけっぱなしにする）
   */
  spawn(anchor: GaugeAnchor, value: number, from = 0, sticky = false): void {
    const o = this.take();
    o.t = 0;
    o.anchor = anchor;
    o.shown = Math.max(0, Math.min(MOOD_MAX, from));
    o.target = Math.max(0, Math.min(MOOD_MAX, value));
    o.sticky = sticky;
    o.drawn = -1;
    o.seq = ++this.seq;
    o.g.setVisible(true).setAlpha(1);
  }

  /** つけっぱなしのゲージを消す（選択を外したとき）。 */
  clearSticky(): void {
    for (const o of this.pool) {
      if (!o.sticky) continue;
      o.t = -1;
      o.anchor = null;
      o.sticky = false;
      o.g.setVisible(false);
    }
  }

  /** つけっぱなしのゲージが出ているか。 */
  hasSticky(): boolean {
    return this.pool.some((o) => o.sticky && o.t >= 0);
  }

  /** つけっぱなしのゲージの値を更新する（練習中に機嫌が動くので）。 */
  updateSticky(value: number): void {
    for (const o of this.pool) {
      if (o.sticky && o.t >= 0) o.target = Math.max(0, Math.min(MOOD_MAX, value));
    }
  }

  /**
   * @param view 施設が見えている範囲（画面座標）。この外に出たゲージは隠す
   *             （持ち主が画面の外にいるのに、端に★だけ残るのを防ぐ）
   */
  update(
    dt: number,
    toScreen: (p: { x: number; y: number }) => { x: number; y: number },
    view: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const life = SATISFACTION.gaugeShowSec;
    for (const o of this.pool) {
      if (o.t < 0) continue;
      o.t += dt;
      const at = o.anchor?.() ?? null;
      if (!at || (!o.sticky && o.t >= life)) {
        o.t = -1;
        o.anchor = null;
        o.sticky = false;
        o.g.setVisible(false);
        continue;
      }
      // じわじわ伸びる
      const k = Math.min(1, dt * SATISFACTION.gaugeFillPerSec);
      o.shown += (o.target - o.shown) * k;
      const s = toScreen(at);
      if (s.x < view.x0 || s.x > view.x1 || s.y < view.y0 || s.y > view.y1) {
        o.g.setVisible(false);
        continue;
      }
      o.g.setVisible(true);
      o.g.setPosition(s.x, s.y - OVERHEAD_LIFT);
      // 一時表示は最後にすっと消える
      o.g.setAlpha(o.sticky ? 1 : o.t > life * 0.75 ? 1 - (o.t - life * 0.75) / (life * 0.25) : 1);
      const q = Math.round(o.shown * 2) / 2;
      if (q === o.drawn) continue;
      o.drawn = q;
      o.g.clear();
      drawStarBar(o.g, 0, 0, o.shown, { radius: 5.5 });
    }
  }

  clear(): void {
    for (const o of this.pool) {
      o.t = -1;
      o.anchor = null;
      o.sticky = false;
      o.g.setVisible(false);
    }
  }

  private take(): Overhead {
    const free = this.pool.find((o) => o.t < 0);
    if (free) return free;
    // 全部使用中：つけっぱなしでないものから、いちばん古いものを奪う
    const cands = this.pool.filter((o) => !o.sticky);
    const from = cands.length > 0 ? cands : this.pool;
    return from.reduce((a, b) => (a.seq <= b.seq ? a : b));
  }
}
