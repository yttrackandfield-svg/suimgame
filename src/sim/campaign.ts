import { CAMPAIGN } from "../config/balance";

/**
 * 集客キャンペーン。
 *
 *  通常（毎月選べる）  … 入会金無料 / 友達紹介
 *  季節限定（該当月のみ）… クリスマス(12月) / 新春(1月) / 新学期(4月)
 *                          通常の数倍〜十数倍の集客効果
 *  集客キャンプ(7・8月) … 人気度を大きく上げる（選手を鍛える「合宿」とは別物）
 *
 * どのキャンペーンも開催は「月1回まで」（GameState が heldThisMonth で管理）。
 * 数値は config/balance.ts の CAMPAIGN に集約。
 */

export type CampaignId =
  | "freeAdmission"
  | "referral"
  | "christmas"
  | "newYear"
  | "newTerm"
  | "popCamp";

export interface CampaignDef {
  id: CampaignId;
  label: string;
  note: string;
  cost: number; // 開催費用（ジェム）
  /** 集まる基礎人数（これ × 効果倍率 × 集客倍率(人気度)）。 */
  base: number;
  /** 季節限定の効果倍率（通常は1）。 */
  mult: number;
  /** 上がる人気度。 */
  popularity: number;
  /** 幼児への振り分け比率（残りは学童）。 */
  youjiRatio: number;
  /** 開催できる月（null＝毎月）。 */
  months: readonly number[] | null;
  /** 季節限定・特別枠かどうか（一覧で強調する）。 */
  special: boolean;
}

const c = CAMPAIGN.common;
const s = CAMPAIGN.seasonal;

export const CAMPAIGNS: readonly CampaignDef[] = [
  {
    id: "freeAdmission",
    label: c.freeAdmission.label,
    note: "入会金をタダにして入りやすくする。毎月ひらける定番の集客。",
    cost: c.freeAdmission.cost,
    base: c.freeAdmission.base,
    mult: 1,
    popularity: c.freeAdmission.popularity,
    youjiRatio: c.freeAdmission.youjiRatio,
    months: null,
    special: false,
  },
  {
    id: "referral",
    label: c.referral.label,
    note: "在籍者に友達を連れてきてもらう。人気度も上がりやすい。",
    cost: c.referral.cost,
    base: c.referral.base,
    mult: 1,
    popularity: c.referral.popularity,
    youjiRatio: c.referral.youjiRatio,
    months: null,
    special: false,
  },
  {
    id: "christmas",
    label: s.christmas.label,
    note: `12月だけの特大集客。通常キャンペーンの約${s.christmas.mult}倍。`,
    cost: s.christmas.cost,
    base: s.christmas.base,
    mult: s.christmas.mult,
    popularity: s.christmas.popularity,
    youjiRatio: s.christmas.youjiRatio,
    months: [s.christmas.month],
    special: true,
  },
  {
    id: "newYear",
    label: s.newYear.label,
    note: `1月だけの特大集客。通常キャンペーンの約${s.newYear.mult}倍。`,
    cost: s.newYear.cost,
    base: s.newYear.base,
    mult: s.newYear.mult,
    popularity: s.newYear.popularity,
    youjiRatio: s.newYear.youjiRatio,
    months: [s.newYear.month],
    special: true,
  },
  {
    id: "newTerm",
    label: s.newTerm.label,
    note: `4月だけの最大の書き入れ時。通常キャンペーンの約${s.newTerm.mult}倍。`,
    cost: s.newTerm.cost,
    base: s.newTerm.base,
    mult: s.newTerm.mult,
    popularity: s.newTerm.popularity,
    youjiRatio: s.newTerm.youjiRatio,
    months: [s.newTerm.month],
    special: true,
  },
  {
    id: "popCamp",
    label: CAMPAIGN.camp.label,
    note: "夏のキャンプでクラブの評判を大きく上げる。以後の集客がぐっと楽になる。",
    cost: CAMPAIGN.camp.cost,
    base: CAMPAIGN.camp.base,
    mult: 1,
    popularity: CAMPAIGN.camp.popularity,
    youjiRatio: CAMPAIGN.camp.youjiRatio,
    months: CAMPAIGN.camp.months,
    special: true,
  },
];

const BY_ID = new Map(CAMPAIGNS.map((d) => [d.id, d]));

export function campaignDef(id: CampaignId): CampaignDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`unknown campaign: ${id}`);
  return d;
}

/** その月に開催できるキャンペーンか。 */
export function campaignInSeason(def: CampaignDef, month: number): boolean {
  return def.months === null || def.months.includes(month);
}

/** 開催できない理由（月が合わない場合）。 */
export function campaignSeasonLabel(def: CampaignDef): string {
  return def.months === null ? "毎月ひらける" : `${def.months.join("・")}月 のみ`;
}
