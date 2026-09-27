import { ALTITUDE, CAMP, CAMP_EVENTS, CAMP_TYPES, type CampEventCfg } from "../config/balance";
import type { StatKey, Student } from "./student";

/**
 * 合宿の定義と、高地トレーニングの効果判定。
 *
 * 合宿は「タイプを選ぶ → 対象選手を選ぶ → 1人あたりの費用を払う」。
 * 費用が必ず人数ぶんかかるので、全員をまとめて強化することはできない。
 *
 * 高地だけは特別で、下山から大会までの日数（＝効果帯）で結果が大きく変わる。
 * 数値はすべて config/balance.ts（CAMP / CAMP_TYPES / ALTITUDE / CAMP_EVENTS）。
 */

export type CampId = keyof typeof CAMP_TYPES;
export type CampRegion = "domestic" | "overseas";

export interface CampDef {
  id: CampId;
  label: string;
  note: string;
  region: CampRegion;
  costPerHead: number;
  weights: Partial<Record<StatKey, number>>;
  mult: number;
  strokeGain: number;
  conditionCost: number;
  moraleGain: number;
  injuryHealMult: number;
  injuryChanceMult: number;
  longBoost: number;
  sprintBoost: number;
  juniorBoost: number;
  eventChance: number;
  isAltitude: boolean;
  minClubTier: number;
  minGems: number;
  observeBonus: number;
}

/** 一覧・選択画面の並び（国内 → 海外、それぞれ安い順）。 */
export const CAMP_ORDER: readonly CampId[] = [
  "onsen",
  "sea",
  "univ",
  "dual",
  "altitude",
  "hawaii",
  "italy",
  "australia",
  "ncaa",
];

const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);

export const CAMP_DEFS: Record<CampId, CampDef> = Object.fromEntries(
  CAMP_ORDER.map((id) => {
    const c = CAMP_TYPES[id] as Record<string, unknown>;
    return [
      id,
      {
        id,
        label: String(c.label),
        note: String(c.note),
        region: c.region as CampRegion,
        costPerHead: num(c.costPerHead, 0),
        weights: (c.weights ?? {}) as Partial<Record<StatKey, number>>,
        mult: num(c.mult, 1),
        strokeGain: num(c.strokeGain, 0),
        conditionCost: num(c.conditionCost, 0),
        moraleGain: num(c.moraleGain, 0),
        injuryHealMult: num(c.injuryHealMult, 1),
        injuryChanceMult: num(c.injuryChanceMult, 1),
        longBoost: num(c.longBoost, 1),
        sprintBoost: num(c.sprintBoost, 1),
        juniorBoost: num(c.juniorBoost, 1),
        eventChance: num(c.eventChance, 0),
        isAltitude: c.altitude === true,
        minClubTier: num(c.minClubTier, 1),
        minGems: num(c.minGems, 0),
        observeBonus: num(c.observeBonus, 0),
      },
    ];
  }),
) as Record<CampId, CampDef>;

export function campDef(id: CampId): CampDef {
  return CAMP_DEFS[id];
}

export function isCampId(v: string): v is CampId {
  return (CAMP_ORDER as readonly string[]).includes(v);
}

export const DOMESTIC_CAMPS: readonly CampId[] = CAMP_ORDER.filter((id) => CAMP_DEFS[id].region === "domestic");
export const OVERSEAS_CAMPS: readonly CampId[] = CAMP_ORDER.filter((id) => CAMP_DEFS[id].region === "overseas");

/** ステータス別の伸びの重み（未指定は 0.5）。 */
export function campWeight(def: CampDef, key: StatKey): number {
  return def.weights[key] ?? 0.5;
}

// ------------------------------------------------------------------ 高地：滞在期間・強度

export type StayOption = (typeof ALTITUDE.stays)[number];
export type IntensityOption = (typeof ALTITUDE.intensities)[number];

export const ALTITUDE_STAYS = ALTITUDE.stays;
export const ALTITUDE_INTENSITIES = ALTITUDE.intensities;

export function stayOption(days: number): StayOption {
  return ALTITUDE_STAYS.find((s) => s.days === days) ?? ALTITUDE_STAYS[1];
}

export function intensityOption(id: string): IntensityOption {
  return ALTITUDE_INTENSITIES.find((i) => i.id === id) ?? ALTITUDE_INTENSITIES[1];
}

/** プレイヤーが選ぶ合宿の設定（高地以外は stay/intensity を無視する）。 */
export interface CampPlan {
  id: CampId;
  /** 高地：滞在日数。 */
  stayDays: number;
  /** 高地：練習強度。 */
  intensity: string;
}

export function defaultCampPlan(id: CampId): CampPlan {
  return { id, stayDays: ALTITUDE_STAYS[1].days, intensity: ALTITUDE_INTENSITIES[1].id };
}

// ------------------------------------------------------------------ 高地：下山後の状態

/**
 * 高地から降りたあとの体の状態。選手が持ち、大会のタイムに効く。
 * expireDay を過ぎたら state 側で捨てる。
 */
export interface AltitudeState {
  /** 下山した日（GameState.dayCount を暦日に直した値）。 */
  descentDay: number;
  /** 順応の質 0〜1。効果の振れ幅そのもの。 */
  adaptation: number;
  /** 順応に失敗した（プラスの帯が出ない）。 */
  failed: boolean;
  /** スプリント感覚の鈍り。speed 練習を積むと減る。 */
  sprintDull: number;
  /** 滞在日数（表示用）。 */
  stayDays: number;
}

export type AltitudeBand = (typeof ALTITUDE.bands)[number];

/** 下山から days 日後がどの効果帯か（範囲外は null）。 */
export function altitudeBand(days: number): AltitudeBand | null {
  if (days < 0 || days >= ALTITUDE.expireDay) return null;
  return ALTITUDE.bands.find((b) => days >= b.from && days <= b.to) ?? null;
}

/** その効果帯の呼び名（画面表示用。範囲外は「効果なし」）。 */
export function altitudeBandLabel(days: number): string {
  const b = altitudeBand(days);
  return b ? b.label : "効果なし";
}

/**
 * 高地効果によるレースタイムの倍率（1.0＝素、1.0未満で速い）。
 *
 *   帯ごとの timeFactor を、順応の質と種目の向き不向きで 1.0 側へ引き戻す。
 *   ＝ 順応が浅い／短距離だと、良いことも悪いことも起きにくい。
 * スプリント感覚の鈍りは、それとは別に必ずマイナスとして乗る。
 */
export function altitudeTimeFactor(alt: AltitudeState, today: number, distance: number): number {
  const days = today - alt.descentDay;
  const band = altitudeBand(days);
  let factor = 1;

  if (band) {
    let strength = band.timeFactor >= 1 ? 1 : alt.failed ? ALTITUDE.failedAdaptation : alt.adaptation;
    // 中長距離ほど恩恵が大きい。スプリントは恩恵が薄い（マイナス側はそのまま来る）。
    if (band.timeFactor < 1) {
      strength *= distance >= ALTITUDE.longDistanceFrom ? ALTITUDE.longGainMult : ALTITUDE.sprintGainMult;
      // 減衰帯は日が経つほど薄れる
      if (ALTITUDE.fadeLinear && band.id === "fade") {
        const span = Math.max(1, ALTITUDE.expireDay - band.from);
        strength *= Math.max(0, 1 - (days - band.from) / span);
      }
    }
    factor *= 1 + (band.timeFactor - 1) * strength;
  }

  // スプリント感覚の鈍り（下山後にスピード練習を挟まないと残る）
  if (alt.sprintDull > 0 && distance < ALTITUDE.longDistanceFrom) {
    factor *= 1 + ALTITUDE.sprintDullTimePenalty * alt.sprintDull;
  }
  return factor;
}

/** 高地効果がもう切れているか（state 側の掃除に使う）。 */
export function altitudeExpired(alt: AltitudeState, today: number): boolean {
  return today - alt.descentDay >= ALTITUDE.expireDay && alt.sprintDull <= 0;
}

/**
 * 高地順応に失敗する確率。
 * コンディションが悪いほど、強度が高いほど上がる。
 */
export function altitudeFailChance(condition: number, intensity: IntensityOption): number {
  const lack = Math.max(0, ALTITUDE.failConditionRef - condition) / 100;
  const p = ALTITUDE.failBase + lack * ALTITUDE.failConditionWeight + intensity.failAdd;
  return Math.min(ALTITUDE.failMax, Math.max(0, p));
}

/** 順応の質（0〜1）。滞在期間と強度で決まる。 */
export function altitudeAdaptation(stay: StayOption, intensity: IntensityOption): number {
  return Math.min(1, Math.max(0, stay.adapt * intensity.adapt));
}

/** その選手はスプリンター寄りか（高地の向き不向きの判定）。 */
export function isSprinter(s: Student): boolean {
  return s.fav.distance < ALTITUDE.longDistanceFrom;
}

// ------------------------------------------------------------------ ランダムイベント

export type CampEventKind = "good" | "bad" | "special";

export interface CampEvent extends CampEventCfg {
  kind: CampEventKind;
}

const withKind = (kind: CampEventKind, list: readonly CampEventCfg[]): CampEvent[] =>
  list.map((e) => ({ ...e, kind }));

export const CAMP_EVENT_LIST: readonly CampEvent[] = [
  ...withKind("good", CAMP_EVENTS.good),
  ...withKind("bad", CAMP_EVENTS.bad),
  ...withKind("special", CAMP_EVENTS.special),
];

export const CAMP_EVENT_COLOR: Record<CampEventKind, string> = {
  good: "#2ecc71",
  bad: "#e74c3c",
  special: "#f7dc6f",
};

export const CAMP_EVENT_ICON: Record<CampEventKind, string> = {
  good: "✦",
  bad: "⚠",
  special: "★",
};

function pickWeighted(list: readonly CampEvent[], rand: () => number): CampEvent | null {
  const total = list.reduce((n, e) => n + e.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return list[list.length - 1] ?? null;
}

/**
 * 合宿中にイベントが起きたか判定して1つ返す（起きなければ null）。
 * 海外合宿は特殊イベントが出やすい。
 */
export function rollCampEvent(def: CampDef, rand: () => number): CampEvent | null {
  if (rand() >= def.eventChance) return null;

  const base = CAMP_EVENTS.kindWeights;
  const w: Record<CampEventKind, number> = { good: base.good, bad: base.bad, special: base.special };
  if (def.region === "overseas") {
    // 海外は特殊イベントが出やすい（そのぶん悪いイベントが減る）
    w.special += CAMP_EVENTS.overseasSpecialBonus;
    w.bad = Math.max(0, w.bad - CAMP_EVENTS.overseasSpecialBonus);
  }
  const total = w.good + w.bad + w.special;
  let r = rand() * total;
  let kind: CampEventKind = "good";
  if ((r -= w.good) > 0) kind = (r -= w.bad) > 0 ? "special" : "bad";

  return pickWeighted(CAMP_EVENT_LIST.filter((e) => e.kind === kind), rand);
}

// ------------------------------------------------------------------ 表示用

/** 1人あたりの費用（表示・計算の一点）。 */
export function campCostPerHead(id: CampId): number {
  return CAMP_DEFS[id].costPerHead;
}

/** 参加人数ぶんの総額。 */
export function campTotalCost(id: CampId, count: number): number {
  return campCostPerHead(id) * Math.max(0, count);
}

/** そのタイプが伸ばす能力の要約（一覧に出す）。 */
export function campFocusLabel(def: CampDef, statLabel: Record<StatKey, string>): string {
  const keys = (Object.keys(def.weights) as StatKey[])
    .filter((k) => (def.weights[k] ?? 0) >= 1.2)
    .sort((a, b) => (def.weights[b] ?? 0) - (def.weights[a] ?? 0));
  if (keys.length === 0) return "全能力を均等に";
  return keys.slice(0, 3).map((k) => statLabel[k]).join("・");
}

export { CAMP as CAMP_BASE, ALTITUDE as ALTITUDE_CFG };
