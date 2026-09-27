import { CLUBRANK } from "../config/balance";

/**
 * クラブの格。選手ひとりの格（sim/rank.ts）とは別に、クラブ全体の到達度を表す。
 *
 *   スコア = 人気度 × popularityWeight ＋ 大会実績 ＋ 通算優勝 × winWeight
 *
 * 大会実績は、選手が大会で稼いだ実績ポイントの一部がクラブにも積まれる。
 * 格が上がると
 *   ・良いコーチが集まりやすくなる（clubStrength への加算）
 *   ・入会が増える（集客倍率への上乗せ）
 * という形で経営が楽になる。呼称・基準はすべて config/balance.ts の CLUBRANK。
 */

export const CLUB_TIERS = CLUBRANK.tiers;
export const CLUB_MAX_TIER = CLUB_TIERS.length;

function clampTier(t: number): number {
  return Math.min(CLUB_MAX_TIER, Math.max(1, Math.round(t)));
}

export function clubRankLabel(tier: number): string {
  return CLUB_TIERS[clampTier(tier) - 1].label;
}

export function clubRankShort(tier: number): string {
  return CLUB_TIERS[clampTier(tier) - 1].short;
}

const TIER_COLOR = ["#95a5a6", "#7fb0d8", "#4fc3a1", "#f5b041", "#e67e22", "#f7dc6f"];

export function clubRankColor(tier: number): string {
  return TIER_COLOR[Math.min(TIER_COLOR.length - 1, clampTier(tier) - 1)];
}

export interface ClubRankInput {
  popularity: number;
  achievement: number;
  championships: number;
}

/** クラブスコア。 */
export function clubScore(v: ClubRankInput): number {
  return (
    v.popularity * CLUBRANK.popularityWeight + Math.max(0, v.achievement) + v.championships * CLUBRANK.winWeight
  );
}

export function clubTierOfScore(score: number): number {
  let tier = 1;
  for (let i = 0; i < CLUB_TIERS.length; i++) {
    if (score >= CLUB_TIERS[i].need) tier = i + 1;
  }
  return tier;
}

export function clubTierOf(v: ClubRankInput): number {
  return clubTierOfScore(clubScore(v));
}

/** 次の格までの進み具合（ゲージ表示に使う）。 */
export function clubProgress(v: ClubRankInput): {
  tier: number;
  score: number;
  need: number;
  nextNeed: number | null;
  ratio: number;
} {
  const score = clubScore(v);
  const tier = clubTierOfScore(score);
  const need = CLUB_TIERS[tier - 1].need;
  const nextNeed = tier < CLUB_MAX_TIER ? CLUB_TIERS[tier].need : null;
  const ratio = nextNeed === null ? 1 : Math.min(1, Math.max(0, (score - need) / (nextNeed - need)));
  return { tier, score, need, nextNeed, ratio };
}

/** クラブの格がコーチ募集の質に与える底上げ。 */
export function clubStrengthBonus(tier: number): number {
  return (clampTier(tier) - 1) * CLUBRANK.strengthPerTier;
}

/** クラブの格が集客倍率に与える上乗せ（1.0＝効果なし）。 */
export function clubEnrollBonus(tier: number): number {
  return 1 + (clampTier(tier) - 1) * CLUBRANK.enrollBonusPerTier;
}

/** クラブの格が上がったときの通知。 */
export interface ClubRankUpEvent {
  from: number;
  to: number;
  label: string;
}
