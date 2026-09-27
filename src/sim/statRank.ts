import { STAT_RANK } from "../config/balance";

/**
 * 能力値（0〜100）のランク表示。
 *
 * 数字だけだと「45 は強いのか弱いのか」が伝わらないので、
 * G F E D C B A S SS の9段階でも見せる。**SS は神の領域**で、
 * ひとつの能力を100近くまで持っていって初めて届く。
 *
 * さかいめは config/balance.ts の STAT_RANK。上に行くほど帯が狭い
 * ＝上位のランクほど1つ上げる価値が大きい。
 */

/** 低い順の並び。 */
export const STAT_RANK_ORDER: readonly string[] = STAT_RANK.bands.map((b) => b.rank);

/** ランクごとの色（低い＝灰、高い＝金）。 */
const RANK_COLOR: Record<string, string> = {
  G: "#7f8c8d",
  F: "#95a5a6",
  E: "#7fb3d5",
  D: "#5dade2",
  C: "#48c9b0",
  B: "#58d68d",
  A: "#f5b041",
  S: "#f7dc6f",
  SS: "#ff6bcb",
};

/** そのランクの言い回し（説明に出す）。 */
const RANK_NOTE: Record<string, string> = {
  G: "これから",
  F: "初心者",
  E: "かけ出し",
  D: "ふつう",
  C: "なかなか",
  B: "上級",
  A: "一流",
  S: "超一流",
  SS: "神の領域",
};

/** 能力値からランクの文字（G〜SS）。 */
export function statRank(value: number): string {
  const v = Math.max(0, Math.min(100, value));
  let rank = STAT_RANK.bands[0].rank;
  for (const b of STAT_RANK.bands) {
    if (v >= b.min) rank = b.rank;
  }
  return rank;
}

/** ランクの色（文字色として使う）。 */
export function statRankColor(rank: string): string {
  return RANK_COLOR[rank] ?? "#ecf0f1";
}

/** ランクの言い回し（「S 超一流」のように添える）。 */
export function statRankNote(rank: string): string {
  return RANK_NOTE[rank] ?? "";
}

/** 能力値から「43 E」のような表示文字列を作る。 */
export function statLabelOf(value: number): { text: string; rank: string; color: string } {
  const rank = statRank(value);
  return { text: `${Math.round(value)} ${rank}`, rank, color: statRankColor(rank) };
}

/**
 * 次のランクまであといくつか（すでに最高なら null）。
 * 「あと3でBになる」が見えると、どの能力を伸ばすかの判断材料になる。
 */
export function toNextRank(value: number): { rank: string; need: number } | null {
  const v = Math.max(0, Math.min(100, value));
  const next = STAT_RANK.bands.find((b) => v < b.min);
  return next ? { rank: next.rank, need: Math.ceil(next.min - v) } : null;
}
