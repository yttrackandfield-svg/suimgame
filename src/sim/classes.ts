/**
 * 育成クラス＋スクール区分の定義（state と student の双方から参照するので独立ファイルに）。
 *
 * クラスは下から上へ 6 段：
 *   幼児(スクール) → 学童(スクール) → 育成B → 育成A → 選手 → プロ
 * スクール（幼児/学童）は「全体練習のみ・選択不可」。育成以上は「練習を事前選択」。
 * 昇格はこの並びの一つ上へ（幼児→学童は年齢で自動、学童→育成Bから手動）。
 */

export type ClassId = "youji" | "gakudo" | "ikuseiB" | "ikuseiA" | "senshu" | "pro";

/** クラスの運用種別。school=スクール生（練習指定不可）、ikusei=育成（練習を事前選択）。 */
export type ClassKind = "school" | "ikusei";

export interface ClassDef {
  id: ClassId;
  label: string; // 表示名
  capacity: number; // 定員
  kind: ClassKind;
}

/**
 * 下から上への並び（昇降格ラダー・名簿・時間割はこの順を基準にする）。
 * スクールは幼児/学童の2区分。育成B/A/選手/プロが育成ラダー。
 */
/**
 * 【育成B〜プロの定員はここに書いた値がそのまま定員】
 *
 * 育成以上は「少人数の特別クラス」なので、プールを何本建てても定員は増えない。
 * （以前はプール1本ごとにレーン比で加算していたため、プールを2本建てただけで
 *   育成B 36→72・選手 18→36 と勝手に増えていた。定員が二重に積まれる作りだった）
 * プールを増やして得られるのは「同じ時間に別のクラスも練習できる」こと。
 *
 * スクール（幼児・学童）の定員だけは時間割のコマ数で決まるので、
 * ここの値は使わない（→ timetable.schoolCapacity）。
 */
export const CLASS_ORDER: readonly ClassDef[] = [
  { id: "youji", label: "幼児", capacity: 100, kind: "school" },
  { id: "gakudo", label: "学童", capacity: 100, kind: "school" },
  { id: "ikuseiB", label: "育成B", capacity: 24, kind: "ikusei" },
  { id: "ikuseiA", label: "育成A", capacity: 24, kind: "ikusei" },
  { id: "senshu", label: "選手", capacity: 18, kind: "ikusei" },
  { id: "pro", label: "プロ", capacity: 8, kind: "ikusei" },
] as const;

/**
 * そのクラスに上がれる最低学年（sim/growth の GRADE_SEQ の位置）。
 *   年少0 年中1 年長2 小1..小6=3..8 中1..中3=9..11 高1..高3=12..14 大1..大4=15..18 社会人19
 *
 * 「いつ上げるか」を選ばせるための下限。これが無いと小1をいきなりプロにできてしまう。
 * 上限（年齢超過での退会）は state.maxStageIndex 側にある。
 */
export const CLASS_MIN_GRADE: Record<ClassId, number> = {
  youji: 0,
  gakudo: 3, // 小1
  ikuseiB: 0, // 年少から（見込みがあれば幼児のうちに育成へ入れる）
  ikuseiA: 3, // 小1
  senshu: 3, // 小1
  pro: 12, // 高1から（2026-10-05・ユーザー指示。以前は高校卒業＝大1から）
};

/** 表示用（昇格できない理由に出す）。 */
export const CLASS_MIN_GRADE_LABEL: Record<ClassId, string> = {
  youji: "年少",
  gakudo: "小1",
  ikuseiB: "年少",
  ikuseiA: "小1",
  senshu: "小1",
  pro: "高1",
};

/** 育成クラス（練習を事前選択できる）だけの並び。 */
export const IKUSEI_ORDER: readonly ClassDef[] = CLASS_ORDER.filter((c) => c.kind === "ikusei");

/** スクールクラス（全体練習のみ）だけの並び。 */
export const SCHOOL_ORDER: readonly ClassDef[] = CLASS_ORDER.filter((c) => c.kind === "school");

const BY_ID: Record<ClassId, ClassDef> = Object.fromEntries(
  CLASS_ORDER.map((c) => [c.id, c]),
) as Record<ClassId, ClassDef>;

export function classDef(id: ClassId): ClassDef {
  return BY_ID[id];
}

export function classLabel(id: ClassId): string {
  return BY_ID[id].label;
}

export function isSchoolClass(id: ClassId): boolean {
  return BY_ID[id].kind === "school";
}

/**
 * そのクラスは**主要大会**に出場できるか（設計：選手・プロのみ）。
 * 予選から勝ち上がる大会は、選手クラスに上げてから。
 */
export function canEnterCompetition(id: ClassId): boolean {
  return id === "senshu" || id === "pro";
}

/**
 * そのクラスは**記録会**に出られるか（育成B以上）。
 *
 * 記録会はタイムを測りに行く場なので、選手クラスまで上げなくても出せる。
 * 育成に上げた子をすぐ記録会に連れていける＝序盤から回せる目標になる。
 * スクール（幼児・学童）は全体練習だけのクラスなので、まだ出さない。
 */
export function canEnterTimeTrial(id: ClassId): boolean {
  return !isSchoolClass(id);
}
