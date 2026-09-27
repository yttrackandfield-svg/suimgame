/**
 * 体力（スタミナ）の見せ方をまとめたところ。
 *
 * 体力そのものは Student.energy（0〜energyMax）だが、遊ぶ側が知りたいのは
 * 「あと何回練習できるのか」＝**どのくらい疲れているか**。ここで割合を段階に落とす。
 *
 * 【1か所にまとめる理由】
 * 頭上の疲れマーク（gfx/FatigueMark.ts）と、育成パネル・選手カードの体力表示が
 * 別々の閾値を持つと、「マークは出ているのにパネルは元気と言う」がすぐ起きる。
 * 段階のさかいめは config/balance.ts の FATIGUE_MARK と共有する。
 */

import { FATIGUE_MARK } from "../config/balance";
import { energyMax, type Student } from "./student";

export type StaminaLevel = "fresh" | "fine" | "warm" | "tired" | "empty";

/** 良い→悪い の順。 */
export const STAMINA_ORDER: readonly StaminaLevel[] = ["fresh", "fine", "warm", "tired", "empty"];

export const STAMINA_LABEL: Record<StaminaLevel, string> = {
  fresh: "絶好調",
  fine: "元気",
  warm: "少し疲れ",
  tired: "疲れた",
  empty: "もう限界",
};

/** 目で分かる印（頭上のマークと同じ絵文字を使う）。 */
export const STAMINA_ICON: Record<StaminaLevel, string> = {
  fresh: "◎",
  fine: "○",
  warm: "◇",
  tired: "💧",
  empty: "😵",
};

export const STAMINA_COLOR: Record<StaminaLevel, string> = {
  fresh: "#f7dc6f",
  fine: "#2ecc71",
  warm: "#f1c40f",
  tired: "#e67e22",
  empty: "#e74c3c",
};

/** ゲージの色（Graphics 用）。文字色と同じ意味の色。 */
export const STAMINA_BAR: Record<StaminaLevel, number> = {
  fresh: 0xf7dc6f,
  fine: 0x2ecc71,
  warm: 0xf1c40f,
  tired: 0xe67e22,
  empty: 0xe74c3c,
};

/** ひとこと説明（何をすればいいか）。 */
export const STAMINA_NOTE: Record<StaminaLevel, string> = {
  fresh: "まだまだ練習できる",
  fine: "このまま練習を続けられる",
  warm: "そろそろ回復設備を使わせたい",
  tired: "伸びが落ちている。休養させるか回復設備へ",
  empty: "これ以上練習しても伸びない。休ませること",
};

/**
 * 体力の割合（0-1）から段階を決める。
 * 下2段は頭上の疲れマークのさかいめと同じ（→ FATIGUE_MARK）。
 */
export function staminaLevelOf(ratio: number): StaminaLevel {
  if (ratio <= FATIGUE_MARK.exhausted) return "empty";
  if (ratio <= FATIGUE_MARK.tired) return "tired";
  if (ratio < 0.6) return "warm";
  if (ratio < 0.85) return "fine";
  return "fresh";
}

/** その選手の体力の状態（表示に必要なものを一式）。 */
export function staminaOf(s: Student): {
  value: number;
  max: number;
  ratio: number;
  level: StaminaLevel;
} {
  const max = energyMax(s);
  const ratio = Math.max(0, Math.min(1, s.energy / Math.max(1, max)));
  return { value: s.energy, max, ratio, level: staminaLevelOf(ratio) };
}
