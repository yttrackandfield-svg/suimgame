import { STAFF } from "../config/balance";
import type { RoomKind } from "./equipment";

/**
 * 専門スタッフ（栄養士・ドクター）。
 *
 * コーチとは別枠で、選手ひとりひとりに割り当てるのではなく
 * 「雇った人数ぶん、クラブ全体に効く」方式にしてある。
 *   栄養士 … 疲労が抜けやすくなり、成長が底上げされる
 *   ドクター … ケガの回復が早まり、そもそもケガをしにくくなる
 * 複数人雇うと効果が積み上がるが、上限があるので並べるだけでは無双できない。
 *
 * 雇うには対応する部屋が要る（栄養士＝食堂／ドクター＝ドクタールーム）。
 * 部屋1つにつき capacityPerRoom 人まで働ける。
 *
 * 数値はすべて config/balance.ts の STAFF。
 */

export type StaffKind = "nutritionist" | "doctor";

export const STAFF_ORDER: readonly StaffKind[] = ["nutritionist", "doctor"];

export interface StaffDef {
  kind: StaffKind;
  label: string;
  note: string;
  /** 働くために必要な部屋。 */
  room: RoomKind;
  hireCost: number;
  salary: number;
  capacityPerRoom: number;
}

export const STAFF_DEFS: Record<StaffKind, StaffDef> = {
  nutritionist: {
    kind: "nutritionist",
    label: STAFF.nutritionist.label,
    note: STAFF.nutritionist.note,
    room: STAFF.nutritionist.room as RoomKind,
    hireCost: STAFF.nutritionist.hireCost,
    salary: STAFF.nutritionist.salary,
    capacityPerRoom: STAFF.nutritionist.capacityPerRoom,
  },
  doctor: {
    kind: "doctor",
    label: STAFF.doctor.label,
    note: STAFF.doctor.note,
    room: STAFF.doctor.room as RoomKind,
    hireCost: STAFF.doctor.hireCost,
    salary: STAFF.doctor.salary,
    capacityPerRoom: STAFF.doctor.capacityPerRoom,
  },
};

export function staffDef(kind: StaffKind): StaffDef {
  return STAFF_DEFS[kind];
}

export function isStaffKind(v: string): v is StaffKind {
  return v === "nutritionist" || v === "doctor";
}

/** 雇っているスタッフ1人。 */
export interface StaffMember {
  id: number;
  name: string;
  kind: StaffKind;
}

const GIVEN_SUFFIX: Record<StaffKind, string> = {
  nutritionist: "栄養士",
  doctor: "ドクター",
};

export function makeStaff(rand: () => number, id: number, kind: StaffKind): StaffMember {
  const family = STAFF.familyNames[Math.floor(rand() * STAFF.familyNames.length)];
  return { id, name: `${family}${GIVEN_SUFFIX[kind]}`, kind };
}

// ------------------------------------------------------------------ 効果の集計

/**
 * クラブ全体に効く、専門スタッフぶんの補正。
 * 「雇った人数」だけを材料に組み立てる（誰をどこに配属するかは考えなくてよい）。
 */
export interface StaffBonus {
  /** 休養・日次回復の速さの倍率（1.0＝効果なし）。 */
  recoveryMult: number;
  /** 練習効率の倍率。 */
  growthMult: number;
  /** 練習の疲労の倍率（小さいほど疲れにくい）。 */
  fatigueMult: number;
  /** 故障確率の倍率（小さいほどケガしにくい）。 */
  injuryChanceMult: number;
  /** ケガ回復速度の倍率。 */
  injuryHealMult: number;
  /** 月替わりのコンディション回復の上乗せ倍率。 */
  conditionMult: number;
}

export function emptyStaffBonus(): StaffBonus {
  return {
    recoveryMult: 1,
    growthMult: 1,
    fatigueMult: 1,
    injuryChanceMult: 1,
    injuryHealMult: 1,
    conditionMult: 1,
  };
}

const capped = (per: number, n: number, max: number): number => Math.min(max, per * Math.max(0, n));

/** 栄養士 n 人・ドクター m 人ぶんの補正を組み立てる。 */
export function staffBonusOf(nutritionists: number, doctors: number): StaffBonus {
  const nut = STAFF.nutritionist;
  const doc = STAFF.doctor;

  return {
    recoveryMult: 1 + capped(nut.recoveryPer, nutritionists, nut.recoveryMax),
    growthMult: 1 + capped(nut.growthPer, nutritionists, nut.growthMax),
    fatigueMult: 1 - capped(nut.fatiguePer, nutritionists, nut.fatigueMax),
    // ドクターは複利で効くが、下限を割らない
    injuryChanceMult: Math.max(doc.injuryChanceMin, Math.pow(doc.injuryChancePer, Math.max(0, doctors))),
    injuryHealMult: 1 + capped(doc.healPer, doctors, doc.healMax),
    conditionMult: 1 + capped(doc.conditionPer, doctors, doc.conditionMax),
  };
}

/** そのスタッフの説明に出す「今の効果」の要約。 */
export function staffEffectLabel(kind: StaffKind, count: number): string {
  const b = staffBonusOf(kind === "nutritionist" ? count : 0, kind === "doctor" ? count : 0);
  if (kind === "nutritionist") {
    return `疲労回復 +${Math.round((b.recoveryMult - 1) * 100)}%／成長 +${Math.round((b.growthMult - 1) * 100)}%`;
  }
  return `ケガ率 -${Math.round((1 - b.injuryChanceMult) * 100)}%／回復 +${Math.round((b.injuryHealMult - 1) * 100)}%`;
}
