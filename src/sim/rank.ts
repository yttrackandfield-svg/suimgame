import { RANK } from "../config/balance";
import { anchorStandard, type StandardKey } from "../data/standardTimes";
import type { EntrantOutcome } from "./race";
import type { Gender, RaceEvent, Student } from "./student";
import type { Scale } from "./competitions";

/**
 * 格（8段階）。その選手がどこまで到達したかを表す。
 *
 * 重要：能力値ではなく「実際の成績」で決まる。
 *   - 大会の成績（どの大会で何位か。大会の格が高いほど大きい）
 *   - 記録会で出したタイム（自己ベスト）
 *   - 参加標準記録の突破状況（ジャパンオープン等）
 *
 * 大会に出られない育成B・育成A・スクール生でも、毎月の記録会（自動）で
 * タイムを計測しているので、そこで格が上がっていく。
 * 有望な子が育成段階から「地域で有名なスイマー」になる実感が得られる。
 *
 * 呼称・判定基準はすべて config/balance.ts の RANK。
 */

export const RANK_TIERS = RANK.tiers;
export const RANK_MAX_TIER = RANK_TIERS.length; // 8

/** 1..8 に丸める。 */
function clampTier(tier: number): number {
  return Math.min(RANK_MAX_TIER, Math.max(1, Math.round(tier)));
}

export function rankLabel(tier: number): string {
  return RANK_TIERS[clampTier(tier) - 1].label;
}

/** 一覧用の短い呼称（「県」「日本」など）。 */
export function rankShort(tier: number): string {
  return RANK_TIERS[clampTier(tier) - 1].short;
}

/** 格ごとの表示色（低い順に地味→派手）。 */
const TIER_COLOR = [
  "#95a5a6", // 1 どこにでもいる
  "#7fb0d8", // 2 クラブで期待される
  "#4fc3a1", // 3 地域で有名
  "#5dade2", // 4 県を代表
  "#f5b041", // 5 日本を代表
  "#e67e22", // 6 世界屈指
  "#e74c3c", // 7 世界トップクラス
  "#f7dc6f", // 8 神の領域
];

export function rankColor(tier: number): string {
  return TIER_COLOR[clampTier(tier) - 1];
}

// ------------------------------------------------------------------ スコア

/**
 * 自己ベストのタイム → 到達点スコア。
 * ratio = 標準記録 / タイム（1.0で標準ちょうど＝日本トップ）。
 * 急なカーブなので、標準に近づくほど格が跳ね上がる。
 */
export function timeScoreOf(ev: RaceEvent, gender: Gender, time: number): number {
  if (!(time > 0)) return 0;
  const anchor = anchorStandard(ev, gender);
  if (!(anchor > 0)) return 0;
  const ratio = anchor / time;
  if (ratio < RANK.timeScoreMinRatio) return 0;
  return RANK.timeScoreBase * Math.pow(ratio, RANK.timeScoreExp);
}

/** その選手の総合スコア（自己ベスト到達点＋大会・標準の実績）。 */
export function rankScore(s: Student): number {
  return (s.bestTimeScore ?? 0) + (s.achievePoints ?? 0);
}

/** スコアから格（1..8）を求める。 */
export function tierOfScore(score: number): number {
  let tier = 1;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (score >= RANK_TIERS[i].need) tier = i + 1;
  }
  return tier;
}

/** その選手の現在の格（スコアから毎回計算する）。 */
export function rankOf(s: Student): number {
  return tierOfScore(rankScore(s));
}

/** 次の格までの進み具合（ゲージ表示に使う）。 */
export function rankProgress(s: Student): {
  tier: number;
  score: number;
  need: number;
  nextNeed: number | null;
  ratio: number;
} {
  const score = rankScore(s);
  const tier = tierOfScore(score);
  const need = RANK_TIERS[tier - 1].need;
  const nextNeed = tier < RANK_MAX_TIER ? RANK_TIERS[tier].need : null;
  const ratio = nextNeed === null ? 1 : Math.min(1, Math.max(0, (score - need) / (nextNeed - need)));
  return { tier, score, need, nextNeed, ratio };
}

// ------------------------------------------------------------------ 成績の記録

/**
 * タイムを1本記録する（記録会・大会・月例計測すべて共通）。
 * 自己ベスト（＝スコアが最も高い記録）を更新したときだけ true。
 */
export function recordTime(s: Student, ev: RaceEvent, time: number): boolean {
  const score = timeScoreOf(ev, s.gender, time);
  if (score <= (s.bestTimeScore ?? 0)) return false;
  s.bestTimeScore = score;
  s.bestTimeSec = time;
  s.bestTimeEvent = { stroke: ev.stroke, distance: ev.distance };
  return true;
}

/** 順位に応じた実績ポイントの取り分（自クラブの選手1人ぶん）。 */
export function placementFactor(e: EntrantOutcome): number {
  if (e.win) return RANK.placement.win;
  if (e.finalRank != null && e.finalRank <= 3) return RANK.placement.podium;
  if (e.finalRank != null) return RANK.placement.final;
  return RANK.placement.heat;
}

/** 大会の成績で入る実績ポイント（大会の格が高いほど大きい）。 */
export function competitionPoints(scale: Scale, e: EntrantOutcome): number {
  return (RANK.scalePoints[scale] ?? 0) * placementFactor(e);
}

/** 参加標準記録の突破で入る実績ポイント。 */
export function standardPoints(key: StandardKey): number {
  return RANK.standardPoints[key] ?? 0;
}

export function addAchievement(s: Student, points: number): void {
  if (!(points > 0)) return;
  s.achievePoints = (s.achievePoints ?? 0) + points;
}

// ------------------------------------------------------------------ 昇格の検知

/** 格が上がったときの通知（演出に使う）。 */
export interface RankUpEvent {
  student: Student;
  from: number;
  to: number;
  label: string;
}

/**
 * 保持している rankTier を現在のスコアに合わせ直す。
 * 上がっていれば通知を返す（演出はシーン側が出す）。
 */
export function refreshRank(s: Student): RankUpEvent | null {
  const now = rankOf(s);
  const before = clampTier(s.rankTier ?? 1);
  s.rankTier = now;
  if (now <= before) return null;
  return { student: s, from: before, to: now, label: rankLabel(now) };
}
