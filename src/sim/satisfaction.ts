import { SATISFACTION } from "../config/balance";

/**
 * 満足度（機嫌）。
 *
 * 選手も一般客も「気持ちよく過ごせたか」を 0-100 で持つ。
 *   上がる … 良い設備を使えた・練習がうまくいった・休めた・伸びた
 *   下がる … 混雑・待たされた・疲れきった・ケガ
 *
 * 選手の満足度は Student.mood としてセーブされ、
 * 一般客の満足度は**その来場1回ぶん**（帰ると消える）。
 * 満足して帰った客は「貢献値」を落とし、月末にまとめて人気度になる。
 *
 * 純ロジック（Phaser 非依存）。表示は gfx/MoodGauge.ts。
 */

export const MOOD_MAX = 100;

const clamp = (v: number): number => Math.min(MOOD_MAX, Math.max(0, v));

// ------------------------------------------------------------------ 選手の機嫌

/**
 * 機嫌が動く出来事。**足すときはここと SATISFACTION.events の両方に1行**。
 * 値（何点動くか）は config/balance.ts 側に置いてあるので、調整はそちらで完結する。
 */
export type MoodEvent =
  | "recovered" // 風呂・サウナ・マッサージエリアを使えた
  | "gaveUpRecovery" // 混んでいて使えず諦めた
  | "noRecovery" // 使いたかったのに設備が無い
  | "goodPractice" // 気持ちよく練習できた（体力に余裕がある）
  | "hardPractice" // 疲れた状態で練習した
  | "exhausted" // 体力を使い切った
  | "rested" // 休養した
  | "grew" // 能力が伸びた（整数が上がった）
  | "rankUp" // 格が上がった
  | "win" // 大会で優勝した
  | "lost" // 大会で振るわなかった
  | "injured" // ケガをした
  | "dorm"; // 寮で過ごした

export interface HasMood {
  mood: number;
}

/** 出来事1つぶん機嫌を動かす（weight で強さを変えられる）。戻り値は実際に動いた量。 */
export function applyMood(target: HasMood, ev: MoodEvent, weight = 1): number {
  const before = target.mood;
  const delta = (SATISFACTION.events[ev] ?? 0) * weight;
  target.mood = clamp(before + delta);
  return target.mood - before;
}

/**
 * 何もしなければ「ふつう」へ戻る（日次）。
 * 良い状態も悪い状態も、放っておけば薄れる＝毎日の運営が効き続ける。
 */
export function relaxMood(target: HasMood): void {
  const base = SATISFACTION.baseline;
  const k = SATISFACTION.dailyReturn;
  target.mood = clamp(target.mood + (base - target.mood) * k);
}

// ------------------------------------------------------------------ 表示

/** 星いくつぶんか（0〜starCount の実数。じわじわ伸びるゲージに使う）。 */
export function moodStars(mood: number): number {
  return (clamp(mood) / MOOD_MAX) * SATISFACTION.starCount;
}

/** 5段階の呼称。 */
export function moodLabel(mood: number): string {
  const v = clamp(mood);
  for (const t of SATISFACTION.tiers) if (v >= t.min) return t.label;
  return SATISFACTION.tiers[SATISFACTION.tiers.length - 1].label;
}

/** ゲージの色（機嫌が良いほど暖かい色）。 */
export function moodColor(mood: number): number {
  const v = clamp(mood);
  for (const t of SATISFACTION.tiers) if (v >= t.min) return t.color;
  return SATISFACTION.tiers[SATISFACTION.tiers.length - 1].color;
}

/** クラブ全体の平均（HUD の★ゲージ）。人がいなければ基準値。 */
export function averageMood(list: readonly HasMood[]): number {
  if (list.length === 0) return SATISFACTION.baseline;
  let sum = 0;
  for (const m of list) sum += m.mood;
  return sum / list.length;
}

// ------------------------------------------------------------------ 一般客の満足度

export interface GuestVisitContext {
  /** 混んでいる部屋だったか。 */
  crowded: boolean;
  /** 入れずに帰ったか。 */
  turnedAway: boolean;
  /** 部屋のグレード（1=小 2=中 3=大）。良い設備ほど満足する。 */
  grade: number;
  /** 温浴施設（風呂・サウナ・外気浴）だったか。ゆっくりできるぶん満足が高い。 */
  relaxing: boolean;
  /** 売店・食堂にも寄れたか。 */
  extraStop: boolean;
}

/**
 * 来場1回ぶんの満足度（0-100）。
 * 「良い設備を使えた・空いていた・ゆっくりできた」を足し引きするだけの素直な式。
 */
export function guestSatisfaction(ctx: GuestVisitContext): number {
  const c = SATISFACTION.guest;
  if (ctx.turnedAway) return clamp(c.turnedAway);
  let v = c.base;
  v += (Math.max(1, ctx.grade) - 1) * c.perGrade;
  if (ctx.crowded) v += c.crowded; // 負の値
  if (ctx.relaxing) v += c.relaxing;
  if (ctx.extraStop) v += c.extraStop;
  return clamp(v);
}

/**
 * 満足して帰る客が落とす「貢献値」（画面に `+9` と出る数）。
 *
 * 満足度が高いほど大きい。月末に人気度へ換算されるので、
 * **良い設備を用意して混雑を避けるほど人気が伸びる**という筋道になる。
 */
export function guestContribution(satisfaction: number): number {
  const c = SATISFACTION.guest;
  const k = clamp(satisfaction) / MOOD_MAX;
  if (k < c.contributionMinRatio) return 0;
  return Math.max(1, Math.round(c.contributionMax * Math.pow(k, c.contributionCurve)));
}

/** 満足度が高いほど口コミが出やすい（noteGuestSatisfied の抽選に掛ける倍率）。 */
export function wordOfMouthMultiplier(satisfaction: number): number {
  const c = SATISFACTION.guest;
  return c.wordOfMouthFloor + (1 - c.wordOfMouthFloor) * (clamp(satisfaction) / MOOD_MAX) * c.wordOfMouthGain;
}
