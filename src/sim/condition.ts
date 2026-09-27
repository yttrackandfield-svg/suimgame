/**
 * コンディション（5段階）。日々変動し、練習効果とレースタイムに影響する。
 * 内部は 0–100 の数値で持ち、バンドで5段階に落とす。数値は config/balance.ts。
 */

import { CONDITION } from "../config/balance";

export type ConditionLevel = "peak" | "good" | "normal" | "poor" | "tired";

/** 悪い→良い の順。 */
export const CONDITION_ORDER: readonly ConditionLevel[] = ["tired", "poor", "normal", "good", "peak"];

export const CONDITION_LABEL: Record<ConditionLevel, string> = {
  peak: "絶好調",
  good: "好調",
  normal: "普通",
  poor: "不調",
  tired: "疲労",
};

/** 目視用アイコン（記号）と色。 */
export const CONDITION_ICON: Record<ConditionLevel, string> = {
  peak: "◎",
  good: "○",
  normal: "◇",
  poor: "△",
  tired: "▼",
};

export const CONDITION_COLOR: Record<ConditionLevel, string> = {
  peak: "#f7dc6f",
  good: "#2ecc71",
  normal: "#95a5a6",
  poor: "#e67e22",
  tired: "#e74c3c",
};

export function conditionLevel(value: number): ConditionLevel {
  if (value >= 85) return "peak";
  if (value >= 68) return "good";
  if (value >= 45) return "normal";
  if (value >= 25) return "poor";
  return "tired";
}

/** 練習効果の補正。不調ほど伸びが悪い。 */
export function conditionTrainingMult(level: ConditionLevel): number {
  return CONDITION.trainingMult[level];
}

/** レースタイムの補正（1.0未満で速い）。絶好調ほど良いタイム。 */
export function conditionTimeFactor(level: ConditionLevel): number {
  return CONDITION.timeFactor[level];
}

/** 不調・疲労では追い込み練習のリスクが高い。 */
export function isRiskyCondition(level: ConditionLevel): boolean {
  return level === "poor" || level === "tired";
}

const clamp = (v: number): number => Math.min(100, Math.max(0, v));

/** 基準値へ向けて回復（月送りなどで使う）。 */
export function recoverToward(value: number, baseline = 65, rate = 0.5): number {
  return clamp(value + (baseline - value) * rate);
}

export const clampCondition = clamp;
