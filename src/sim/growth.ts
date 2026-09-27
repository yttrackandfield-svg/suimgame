/**
 * 成長タイプ（才能の質）。隠しパラメータ。
 * ライフステージ（小/中/高/成人）ごとに伸びやすさが変わる。
 * 例）超早熟を選手クラス（高校）に上げると伸びず失敗、が起こりうる。
 */

import { AGE_CURVE, AGING, GROWTH_PHASE_MULT } from "../config/balance";
export { GROWTH_PHASE_MULT } from "../config/balance";

export type GrowthType = "superEarly" | "early" | "normal" | "late" | "sustained";

export const GROWTH_TYPES: readonly GrowthType[] = [
  "superEarly",
  "early",
  "normal",
  "late",
  "sustained",
];

export const GROWTH_LABEL: Record<GrowthType, string> = {
  superEarly: "超早熟",
  early: "早熟",
  normal: "普通",
  late: "晩成",
  sustained: "持続型",
};

export type LifeStage = "preschool" | "elementary" | "middle" | "high" | "adult";

export const LIFESTAGE_LABEL: Record<LifeStage, string> = {
  preschool: "未就学",
  elementary: "小学",
  middle: "中学",
  high: "高校",
  adult: "成人",
};

/** 学年ラベル（年長 / 小5 / 中2 / 高1 / 大1 / 社会人）からライフステージを判定。 */
export function lifeStageOf(grade: string): LifeStage {
  const head = grade.charAt(0);
  if (head === "年") return "preschool"; // 年少/年中/年長
  if (head === "小") return "elementary";
  if (head === "中") return "middle";
  if (head === "高") return "high";
  return "adult";
}

/** 成長タイプ × ライフステージ の伸び補正（数値は config/balance.ts の GROWTH_PHASE_MULT）。 */
export function growthPhaseMultiplier(type: GrowthType, stage: LifeStage): number {
  return GROWTH_PHASE_MULT[type][stage];
}

export function randomGrowthType(rand: () => number): GrowthType {
  return GROWTH_TYPES[Math.floor(rand() * GROWTH_TYPES.length)];
}

// ------------------------------------------------------------------ 一生のカーブ（年齢）

/**
 * 選手の一生の時期。
 *   grow    … 急成長期（ぐんぐん伸びる）
 *   peak    … ピーク（伸びは緩やか、いちばん高い水準で安定）
 *   decline … 衰え始め（能力が落ち始める）
 *   limit   … 限界（大きく衰える。引退が近い）
 */
export type CareerPhase = "grow" | "peak" | "decline" | "limit";

export const CAREER_PHASE_LABEL: Record<CareerPhase, string> = {
  grow: "急成長期",
  peak: "ピーク",
  decline: "衰え始め",
  limit: "限界",
};

export const CAREER_PHASE_COLOR: Record<CareerPhase, string> = {
  grow: "#7fd8c0",
  peak: "#f7dc6f",
  decline: "#e59866",
  limit: "#c0787a",
};

/** その年齢がどの時期か（成長タイプごとに境目が違う → AGE_CURVE）。 */
export function careerPhaseOf(type: GrowthType, age: number): CareerPhase {
  const c = AGE_CURVE[type];
  if (age >= c.limit) return "limit";
  if (age >= c.decline) return "decline";
  if (age >= c.peak) return "peak";
  return "grow";
}

/** 引退する年齢（成長タイプごと）。 */
export function retireAgeOf(type: GrowthType): number {
  return AGE_CURVE[type].retire;
}

/** その時期の練習の伸び倍率（衰え期は0＝もう伸びない）。 */
export function careerGrowthMultiplier(type: GrowthType, age: number): number {
  return AGING.growMult[careerPhaseOf(type, age)] ?? 1;
}

/** 引退まであと何年か（0＝今年で引退）。 */
export function yearsLeftOf(type: GrowthType, age: number): number {
  return Math.max(0, retireAgeOf(type) - age);
}

/** 学年をひとつ上げる（年度更新用）。上限を超えたら次のステージへ。 */
export function nextGrade(grade: string): string {
  const i = GRADE_SEQ.indexOf(grade);
  if (i < 0 || i >= GRADE_SEQ.length - 1) return "社会人";
  return GRADE_SEQ[i + 1];
}

/** 学年の並び（幼児の年少から社会人まで）。年度更新で1つ進む。 */
export const GRADE_SEQ: readonly string[] = [
  "年少", "年中", "年長",
  "小1", "小2", "小3", "小4", "小5", "小6",
  "中1", "中2", "中3",
  "高1", "高2", "高3",
  "大1", "大2", "大3", "大4",
  "社会人",
];

/** 学年からおおよその年齢（年少=4歳、以降1つ上がるごとに+1、社会人は23歳扱い）。 */
export function estimatedAge(grade: string): number {
  const i = GRADE_SEQ.indexOf(grade);
  if (i < 0) return 23; // 社会人など末端
  return 4 + i;
}

// ------------------------------------------------------------ 成長タイプの推測

export type GrowthHintLevel = 0 | 1 | 2 | 3;

/** 観察度から推測レベルを決める。 */
export function growthHintLevel(growthObserved: number): GrowthHintLevel {
  if (growthObserved >= 90) return 3;
  if (growthObserved >= 55) return 2;
  if (growthObserved >= 25) return 1;
  return 0;
}

/** 各タイプの「ざっくり方向性」（レベル1のヒント）。 */
const DIRECTION_HINT: Record<GrowthType, string> = {
  superEarly: "早い時期に一気に伸びるタイプ？",
  early: "早い時期に一気に伸びるタイプ？",
  normal: "クセのない伸び方に見える",
  late: "今は平凡だが大器晩成の気配？",
  sustained: "伸びは緩やかだが長く続きそう",
};

/** レベル2で提示する2候補（真のタイプを含める）。 */
const PAIR_HINT: Record<GrowthType, string> = {
  superEarly: "超早熟／早熟のどちらか",
  early: "早熟／超早熟のどちらか",
  normal: "普通／持続型のどちらか",
  late: "晩成／持続型のどちらか",
  sustained: "持続型／普通のどちらか",
};

/**
 * 現在の観察度で見えている成長タイプのヒント。
 * level3 で確定表示。プレイヤーの「推測」の窓口。
 */
export function growthHint(type: GrowthType, growthObserved: number): { level: GrowthHintLevel; text: string } {
  const level = growthHintLevel(growthObserved);
  switch (level) {
    case 3:
      return { level, text: `${GROWTH_LABEL[type]}型` };
    case 2:
      return { level, text: PAIR_HINT[type] };
    case 1:
      return { level, text: DIRECTION_HINT[type] };
    default:
      return { level, text: "まだ分からない" };
  }
}
