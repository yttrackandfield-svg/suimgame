import Phaser from "phaser";
import { FATIGUE_MARK } from "../config/balance";

/**
 * 疲れマーク（キャラの頭の上）。
 *
 * 体力は育成パネルを開かないと見えなかったので、館内を眺めているだけでは
 * 「この子はもう限界」に気づけなかった。丸い印を頭の上に出して、
 * **見るだけで疲れが分かる**ようにする。段階は2つ。
 *
 *   💧 疲れた（青）    … 休ませるか、回復設備を使わせたい
 *   😵 もう限界（赤）  … このまま練習させても伸びない
 *
 * 【画面座標に置く】ワールド（施設）は 0.4〜2.2倍に拡大縮小されるので、
 * その中に置くと引きの絵で潰れて読めない。吹き出し（SpeechBubble）や
 * 「+1」（GainPopup）と同じく画面のレイヤに置き、**毎フレーム頭の上へ合わせ直す**。
 *
 * 軽さのための約束（吹き出しと同じ）：
 *  - Graphics / Text はプールして使い回す（毎回 new しない）
 *  - 下地の丸は**段階が変わったときだけ**描き直す
 *  - 誰に出すかの選び直しは間引く（→ FATIGUE_MARK.refreshSec）
 */

/** 疲れの段階。 */
export type FatigueLevel = "tired" | "exhausted";

/** どのくらい疲れているか。印を出さないときは null。 */
export function fatigueLevelOf(ratio: number): FatigueLevel | null {
  if (ratio <= FATIGUE_MARK.exhausted) return "exhausted";
  if (ratio <= FATIGUE_MARK.tired) return "tired";
  return null;
}

/** 印がついていく先（ワールド座標の頭の上）。null を返すと消える。 */
export type MarkAnchor = () => { x: number; y: number } | null;

/** 印を出す相手1人ぶん。 */
export interface FatigueTarget {
  /** 誰の印か（選手ID）。同じ人には同じ印を使い回す。 */
  id: number;
  anchor: MarkAnchor;
  level: FatigueLevel;
}

interface Mark {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  /** 割り当てられている選手ID（-1＝未使用）。 */
  id: number;
  anchor: MarkAnchor | null;
  level: FatigueLevel | null;
  /** ふわふわの位相（全員が同じ動きにならないようにずらす）。 */
  phase: number;
}

const GLYPH: Record<FatigueLevel, string> = { tired: "💧", exhausted: "😵" };

export class FatigueMarkLayer {
  private readonly pool: Mark[] = [];

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    for (let i = 0; i < FATIGUE_MARK.maxMarks; i++) {
      const bg = scene.add.graphics();
      const text = scene.add
        .text(0, 0, "", {
          fontFamily: "sans-serif",
          fontSize: `${Math.round(FATIGUE_MARK.size * 0.62)}px`,
          color: "#ffffff",
        })
        .setOrigin(0.5, 0.5);
      const root = scene.add.container(0, 0, [bg, text]).setVisible(false);
      parent.add(root);
      this.pool.push({ root, bg, text, id: -1, anchor: null, level: null, phase: i * 0.7 });
    }
  }

  /**
   * 「いま誰に印を出すか」を入れ替える。
   *
   * 同じ選手にはできるだけ同じ印を使い回す（＝印が付け替わってチカチカしない）。
   * 渡された人数が maxMarks を超えるぶんは切り捨てるので、
   * 呼ぶ側で**疲れている順に並べてから**渡すこと。
   */
  set(targets: readonly FatigueTarget[]): void {
    const want = new Map<number, FatigueTarget>();
    for (const t of targets) {
      if (want.size >= this.pool.length) break;
      if (!want.has(t.id)) want.set(t.id, t);
    }

    // すでに出ている印は、そのまま持ち主のところに残す
    for (const m of this.pool) {
      if (m.id < 0) continue;
      const t = want.get(m.id);
      if (!t) {
        this.release(m);
        continue;
      }
      m.anchor = t.anchor;
      this.setLevel(m, t.level);
      want.delete(m.id);
    }
    // 残った人に空いている印を割り当てる
    for (const t of want.values()) {
      const free = this.pool.find((m) => m.id < 0);
      if (!free) break;
      free.id = t.id;
      free.anchor = t.anchor;
      this.setLevel(free, t.level);
    }
  }

  /**
   * 位置合わせ。
   * @param toScreen ワールド座標 → 画面座標（world コンテナの位置と倍率で決まる）
   * @param view 施設が見えている範囲（画面座標）。この外に出た印は隠す
   */
  update(
    t: number,
    toScreen: (p: { x: number; y: number }) => { x: number; y: number },
    view: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    for (const m of this.pool) {
      if (m.id < 0) continue;
      const at = m.anchor?.() ?? null;
      // 持ち主が帰った／消えたら、そこで終わり
      if (!at) {
        this.release(m);
        continue;
      }
      const s = toScreen(at);
      const y = s.y - FATIGUE_MARK.lift + Math.sin(t * FATIGUE_MARK.bobSpeed + m.phase) * FATIGUE_MARK.bob;
      // 画面の外にいる人の印は出さない（端に印だけ貼りつくのを防ぐ）
      if (s.x < view.x0 || s.x > view.x1 || y < view.y0 || s.y > view.y1) {
        m.root.setVisible(false);
        continue;
      }
      m.root.setVisible(true);
      m.root.setPosition(s.x, y);
    }
  }

  /** 画面切り替えなどで一斉に消す。 */
  clear(): void {
    for (const m of this.pool) this.release(m);
  }

  private release(m: Mark): void {
    m.id = -1;
    m.anchor = null;
    m.level = null;
    m.root.setVisible(false);
  }

  /** 段階が変わったときだけ描き直す（毎フレーム Graphics を触らない）。 */
  private setLevel(m: Mark, level: FatigueLevel): void {
    if (m.level === level) return;
    m.level = level;
    m.text.setText(GLYPH[level]);
    const r = FATIGUE_MARK.size / 2;
    const look = FATIGUE_MARK.color[level];
    const g = m.bg;
    g.clear();
    // 影 → 明るい下地 → 段階の色のフチ。
    // 下地を明るくしておかないと、絵文字（💧＝青／😵＝黄）が沈んで丸にしか見えない。
    g.fillStyle(0x101c28, 0.3);
    g.fillCircle(0.5, 2, r);
    g.fillStyle(look.fill, 0.97);
    g.fillCircle(0, 0, r);
    g.lineStyle(2.5, look.ring, 1);
    g.strokeCircle(0, 0, r);
  }
}
