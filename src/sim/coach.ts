import type { ClassId } from "./classes";
import type { ClassFitStatus, StatKey, Stroke, Student } from "./student";
import { STAT_LABEL, STROKE_KEYS, STROKE_LABEL } from "./student";
import { GROWTH_LABEL, growthHintLevel, type GrowthType, type LifeStage } from "./growth";
import { CONDITION_LABEL, type ConditionLevel } from "./condition";
import { COACH, COACHING, MEET_COACH } from "../config/balance";

/**
 * コーチ。質（1〜5）が成長スピードとコメントの的確さに効く。
 * assigned にクラスがセットされていれば、そのクラスの監督（担当）。
 * 監督でないコーチ（assigned=null）はスクール全体のレベル上げに貢献する。
 *
 * 質1〜5には「格」の呼び名が付く（見習い＜指導員＜名コーチ＜トップコーチ＜レジェンド）。
 * 格が上がるほど練習効率そのものが上がり、さらに
 * 「得意泳法が選手と一致していると、その選手の伸びが大きい」という専門種目マッチングが乗る。
 */
/**
 * 担当時間外の過ごし方。
 *  idle     … コーチ室で待機（たまに館内の掃除に出る）
 *  research … 会議室にこもって研究する（指導は通常どおり行う）
 */
export type CoachDuty = "idle" | "research";

export interface Coach {
  id: number;
  name: string;
  quality: number; // 1〜5（＝格。1が見習い、5がレジェンド）
  assigned: ClassId | null; // 監督担当クラス（育成B/A/選手/プロのいずれか）or null
  /** 担当時間外に何をするか。研究に回すと会議室へ行く。 */
  duty: CoachDuty;
  /** 得意泳法。担当する選手の得意泳法と一致すると練習効率が大幅に上がる。 */
  specialty: Stroke;
  /**
   * 指導力（0〜100）。**格とは別の、後から伸びる能力**。
   *
   * 会議室の研究に参加すると毎月伸びる。練習効率に
   * `1 + 指導力/100 × COACH.teach.bonusMax` として掛かるので、
   * 見習い（★1）でも育てれば戦力になる。
   * 雇うときの初期値は格から決まる（→ makeCoach）。
   */
  teaching: number;
}

// ------------------------------------------------------------------ 格（5段階）

const GRADES = COACH.grades;
/** 格の数（＝quality の最大値）。 */
export const COACH_MAX_GRADE = GRADES.length;

const gradeIndex = (quality: number): number =>
  Math.min(GRADES.length - 1, Math.max(0, Math.round(quality) - 1));

/** 格の呼び名（見習い／指導員／名コーチ／トップコーチ／レジェンド）。 */
export function coachGradeLabel(quality: number): string {
  return GRADES[gradeIndex(quality)].label;
}

/** 一覧用の短い呼び名。 */
export function coachGradeShort(quality: number): string {
  return GRADES[gradeIndex(quality)].short;
}

export function coachGradeColor(quality: number): string {
  return GRADES[gradeIndex(quality)].color;
}

/** 格による練習効率の上乗せ（1.0＝見習い）。 */
export function coachGradeMult(quality: number): number {
  return GRADES[gradeIndex(quality)].gradeMult;
}

/** 成長スピード補正（質そのもの × 格）。数値は config/balance.ts の COACH。 */
export function coachGrowthMult(quality: number): number {
  return COACH.growthMult(quality) * coachGradeMult(quality);
}

// ------------------------------------------------------------------ 指導力（後天的に伸びる）

/** 指導力による練習効率の上乗せ（1.0＝指導力0）。 */
export function teachingMult(teaching: number): number {
  return 1 + (clampTeaching(teaching) / 100) * COACH.teach.bonusMax;
}

/**
 * そのコーチの練習効率（格 × 指導力）。
 * **選手の練習に掛けるのは必ずこれ**。`coachGrowthMult(quality)` だけを使うと
 * 指導力を育てた意味が消える。
 */
export function coachTrainMult(coach: Coach | undefined | null): number {
  if (!coach) return 1;
  return coachGrowthMult(coach.quality) * teachingMult(coach.teaching);
}

export function clampTeaching(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** 指導力の呼び名（未熟／駆け出し／中堅／熟練／名伯楽）。 */
export function teachingLabel(teaching: number): string {
  const v = clampTeaching(teaching);
  return (COACH.teach.labels.find((l) => v >= l.min) ?? COACH.teach.labels[COACH.teach.labels.length - 1]).label;
}

export function teachingColor(teaching: number): string {
  const v = clampTeaching(teaching);
  return (COACH.teach.labels.find((l) => v >= l.min) ?? COACH.teach.labels[COACH.teach.labels.length - 1]).color;
}

/** 雇ったときの初期指導力（格が高いほど少し高いところから始まる）。 */
export function startingTeaching(quality: number, rand: () => number): number {
  const base = quality * COACH.teach.startPerQuality;
  return clampTeaching(Math.round(base + (rand() * 2 - 1) * COACH.teach.startJitter));
}

/** 質のランク表示（★の数）。 */
export function coachRankLabel(quality: number): string {
  return "★".repeat(quality) + "☆".repeat(Math.max(0, COACH_MAX_GRADE - quality));
}

// ------------------------------------------------------------------ 専門種目マッチング

/** そのコーチの得意泳法の表示。 */
export function coachSpecialtyLabel(coach: Coach): string {
  return STROKE_LABEL[coach.specialty];
}

/** そのコーチと選手の得意泳法が一致しているか。 */
export function coachMatchesStudent(coach: Coach | undefined, s: Student): boolean {
  return !!coach && coach.specialty === s.fav.stroke;
}

/**
 * 専門種目マッチングによる練習効率の倍率（1.0＝一致していない）。
 * 格が高いほど、噛み合ったときの効きも大きい。
 */
export function specialtyTrainMult(coach: Coach | undefined, s: Student): number {
  if (!coachMatchesStudent(coach, s)) return 1;
  const grade = gradeIndex(coach!.quality);
  return COACH.specialty.matchMult + grade * COACH.specialty.perGradeBonus;
}

/**
 * 泳法の熟練度の伸びへの倍率。
 * 鍛えている泳法がコーチの専門と一致しているときだけ効く。
 */
export function specialtyStrokeMult(coach: Coach | undefined, stroke: Stroke): number {
  if (!coach || coach.specialty !== stroke) return 1;
  return COACH.specialty.matchStrokeMult;
}

// ------------------------------------------------------------------ 生成

/**
 * 月給。格が高いほど高く、**担当コマが増えるほど高くなる**。
 * duties には、その人が時間割で担当しているコマ数を渡すこと
 * （渡さないと担当なしの基本給になる）。
 */
export function coachSalary(coach: Coach, duties = 0): number {
  const base = COACHING.salaryByQuality[coach.quality] ?? 4;
  const head = coach.assigned ? COACHING.headSalaryMult : 1;
  return Math.round(base * head * dutyLoad(coach.quality, duties));
}

/**
 * 掛け持ちによる給料の倍率。
 * 格が高いほど1コマあたりの上乗せが大きい＝**良いコーチほど掛け持ちさせにくい**。
 */
export function dutyLoad(quality: number, duties: number): number {
  const per = COACHING.dutySalaryPer * (1 + Math.max(0, quality - 1) * COACHING.dutySalaryPerGrade);
  return 1 + Math.max(0, duties) * per;
}

/** そのコーチにもう1コマ持たせたときの月給の増えぶん（時間割の表示に使う）。 */
export function coachSalaryDelta(coach: Coach, duties: number): number {
  return coachSalary(coach, duties + 1) - coachSalary(coach, duties);
}

const COACH_FAMILY = ["岸", "北島", "入江", "瀬戸", "萩野", "松田", "寺川", "古賀", "宮本", "森", "青木", "白井"];

export function makeCoach(rand: () => number, id: number, quality?: number, specialty?: Stroke): Coach {
  const q = quality ?? 1 + Math.floor(rand() * COACH_MAX_GRADE);
  const name = `${COACH_FAMILY[Math.floor(rand() * COACH_FAMILY.length)]}コーチ`;
  const sp = specialty ?? STROKE_KEYS[Math.floor(rand() * STROKE_KEYS.length)];
  return { id, name, quality: q, assigned: null, duty: "idle", specialty: sp, teaching: startingTeaching(q, rand) };
}

/**
 * 募集に応募してくるコーチの格の並び（クラブの格ごと → COACHING.recruit.byClubTier）。
 * 表に無い格は、そのまま一番近い格の並びを使う。
 */
function recruitCycleOf(clubTier: number): readonly number[] {
  const table = COACHING.recruit.byClubTier;
  const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
  const t = tiers.reduce((best, x) => (x <= clubTier ? x : best), tiers[0]);
  return table[t];
}

/**
 * 今月の応募者の格（**抽選しない**。クラブの格で決まった並びを順に回す）。
 *
 * monthCount（通算の月）から並びのどこを使うかを決めるので、
 * 同じ格のクラブなら「2ヶ月に1人、名コーチが来る」のように毎月の顔ぶれが読める。
 * tierBoost は合宿の「名コーチとの出会い」で、次の1回だけ1つ上の格の並びを使う。
 */
export function recruitQualitiesFor(clubTier: number, monthCount: number, count: number, tierBoost = 0): number[] {
  const cycle = recruitCycleOf(Math.round(clubTier) + tierBoost);
  const out: number[] = [];
  const start = Math.max(0, Math.floor(monthCount)) * count;
  for (let i = 0; i < count; i++) out.push(cycle[(start + i) % cycle.length]);
  return out;
}

/** 募集に来るいちばん上の格（そのクラブの格のとき）。 */
export function recruitTopQuality(clubTier: number): number {
  return Math.max(...recruitCycleOf(Math.round(clubTier)));
}

/** その格のコーチが募集に来はじめるクラブの格（募集では来ない格は null）。 */
export function coachGradeMinTier(quality: number): number | null {
  const table = COACHING.recruit.byClubTier;
  const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const t of tiers) if (table[t].includes(Math.round(quality))) return t;
  return null;
}

/**
 * 次に募集に来るようになる格の案内（募集画面に出して、目標を示す）。
 * 例：「トップコーチが応募してくるのはクラブの格4から」。全部来ているなら null。
 */
export function coachGradeLockedNote(clubTier: number): string | null {
  const top = recruitTopQuality(clubTier);
  for (let q = top + 1; q <= COACH_MAX_GRADE; q++) {
    const need = coachGradeMinTier(q);
    if (need != null) return `${COACH.grades[q - 1].label}が応募してくるのはクラブの格${need}から`;
  }
  return null;
}

/**
 * 記録会での出会い（→ MEET_COACH）で会えるコーチの格を、その段の重みから1つ引く。
 * tier は記録会の段（0＝地区 … 5＝世界）。
 */
export function rollMeetCoachQuality(tier: number, rand: () => number): number {
  const rows = MEET_COACH.byTier;
  const row = rows[Math.max(0, Math.min(rows.length - 1, Math.floor(tier)))];
  const entries = Object.entries(row).map(([q, w]) => [Number(q), w] as const);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [q, w] of entries) {
    r -= w;
    if (r < 0) return q;
  }
  return entries[entries.length - 1][0];
}

// ------------------------------------------------------------ 練習後コメント

export interface CommentContext {
  key: StatKey;
  delta: Record<StatKey, number>;
  revealedTalent: StatKey | null;
  strain: boolean; // 不調/疲労で追い込んだ
  formInjury: boolean; // フォーム低下が起きた
  conditionLevel: ConditionLevel;
  growthObserved: number;
  growthType: GrowthType;
  lifeStage: LifeStage;
  fitStatus: ClassFitStatus; // クラスが合っているか（tooLow/good/tooHigh）
}

const pick = (rand: () => number, arr: string[]): string => arr[Math.floor(rand() * arr.length)];

/**
 * 成長タイプのヒントコメント（隠し情報への窓口）。
 * 質が高いほど的確で、低いと的外れ・保留になりやすい。
 */
function growthComment(coach: Coach, ctx: CommentContext, rand: () => number): string | null {
  const level = growthHintLevel(ctx.growthObserved);
  if (level === 0) return null;

  // 質が低いと踏み込まない
  if (coach.quality <= 2 && level < 2) {
    return pick(rand, ["まだこの子の伸び方は読めないな", "もう少し見てみないと分からん"]);
  }

  const t = ctx.growthType;
  const stage = ctx.lifeStage;

  if (level >= 3 && coach.quality >= 4) {
    // 確定的で的確
    return `見立てはついた。この子は${GROWTH_LABEL[t]}型だ`;
  }

  // タイプ＋現在ステージに応じた含みのあるヒント
  if (t === "superEarly") {
    return stage === "elementary"
      ? "今がピークかもしれない。上げる時期を誤るな"
      : "早くに完成しすぎた。ここからは苦しいぞ";
  }
  if (t === "early") {
    return stage === "middle" ? "今が伸び盛りだ、一気に押し上げよう" : "伸びが鈍ってきたな";
  }
  if (t === "late") {
    return "この子は伸びるのが遅いが、まだ諦めるのは早い";
  }
  if (t === "sustained") {
    return "派手さはないが、長く伸び続けるタイプに見える";
  }
  return "クセのない、順当な伸び方だ";
}

/**
 * 練習1回のあとにコーチが出すコメント。推測のヒントになる。
 */
export function coachComment(coach: Coach, ctx: CommentContext, rand: () => number): string {
  // 優先度：才能開花 > 故障/追い込み > コンディション注意 > フォーム > 成長ヒント > 汎用
  if (ctx.revealedTalent) {
    const lbl = STAT_LABEL[ctx.revealedTalent];
    return coach.quality >= 3
      ? `${lbl}の才能は本物だ。ここを伸ばそう`
      : `${lbl}が良くなってきた気がする`;
  }
  if (ctx.formInjury) {
    return "無理をさせた。フォームが崩れてきたぞ、基礎に戻そう";
  }
  if (ctx.strain) {
    return pick(rand, ["追い込みすぎかもしれない", "少し休ませたほうがいい"]);
  }
  // クラスが合っているか（隠し情報：練習効率の窓口）
  if (ctx.fitStatus === "tooLow" && rand() < 0.7) {
    return pick(rand, ["練習についていけていないようだ", "この環境はまだ厳しいかもしれない"]);
  }
  if (ctx.fitStatus === "tooHigh" && rand() < 0.7) {
    return pick(rand, ["物足りなさそうにしている。上のクラスを考えては", "ここでは伸び悩む。そろそろ上へ"]);
  }
  if (ctx.conditionLevel === "tired") {
    return `${CONDITION_LABEL[ctx.conditionLevel]}気味だ。今日はここまでにしよう`;
  }
  if (ctx.delta.form <= -0.8) {
    return "フォームが乱れている。土台を固め直そう";
  }
  if (ctx.key === "form" && ctx.delta.form > 0) {
    return "フォームが安定してきたな";
  }

  const g = growthComment(coach, ctx, rand);
  if (g && rand() < 0.7) return g;

  return pick(rand, ["いい調子だ", "この積み重ねが効いてくる", "よく食らいついている"]);
}
