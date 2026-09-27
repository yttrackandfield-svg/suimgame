import type { ClassId } from "./classes";
import type { ClassFitStatus, StatKey, Stroke, Student } from "./student";
import { STAT_LABEL, STROKE_KEYS, STROKE_LABEL } from "./student";
import { GROWTH_LABEL, growthHintLevel, type GrowthType, type LifeStage } from "./growth";
import { CONDITION_LABEL, type ConditionLevel } from "./condition";
import { COACH, COACHING } from "../config/balance";

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
 * 募集候補。クラブ力（人気度＋通算優勝＋クラブの格）が高いほど質の期待値が上がる。
 *
 * さらに格ごとの下限（COACH.recruitMinTier）があり、クラブの格が足りないと
 * その格のコーチはそもそも現れない。レジェンドは名門クラブにしか来ない。
 * strength / clubTier は呼び出し側（GameState）が算出する。
 */
export function makeRecruitCandidate(
  rand: () => number,
  id: number,
  strength: number,
  clubTier = 1,
  popularity = 0,
): Coach {
  /**
   * 期待される格。
   *
   * 【頭打ちさせない】以前は `1 + clubStrength/55` で、クラブ力が 220 を超えると
   * 期待値が最大格を振り切り、**候補が全員トップコーチ**になっていた
   *（実測：クラブ力678 で100人抽選して質4が100人）。「同じレベルの人しか来ない」の正体はこれ。
   * 伸びを緩くしたうえで、最大格の少し手前で止める。こうすると強いクラブでも
   * 「見習いから伝説まで混ざった名簿」になり、選ぶ意味が残る。
   */
  const expected = Math.min(
    COACH_MAX_GRADE - 0.5,
    1 + strength / COACHING.recruit.strengthPerQuality,
  );
  /**
   * 【同じ格ばかりにならないように】以前は ±1 の一様乱数を足して四捨五入していた。
   * 期待値が 2.4 のクラブでは候補がほぼ全員「2」になり、何人見ても同じ顔ぶれだった。
   *
   * いまは一様乱数を3つ足して**釣鐘形（おおよそ正規分布・標準偏差1）**にし、
   * それを qualitySpread 倍して散らす。期待値まわりがいちばん出やすいのは同じだが、
   * ±2格ぶんまでは普通に現れる＝「今月は当たりが来た」が起こる。
   */
  const bell = (rand() + rand() + rand() - 1.5) * 2;
  let q = Math.max(1, Math.min(COACH_MAX_GRADE, Math.round(expected + bell * COACHING.recruit.qualitySpread)));
  // クラブの格・人気度が足りない格は現れない（届く範囲まで落とす）。
  // トップコーチは全国区、レジェンドは日本の名門にならないと来ない。
  while (q > 1 && !coachGradeAvailable(q, clubTier, popularity)) q--;
  return makeCoach(rand, id, q);
}

/** その格のコーチが現れるのに必要なクラブの格。 */
export function coachGradeMinTier(quality: number): number {
  return COACH.recruitMinTier[Math.round(quality)] ?? 1;
}

/** その格のコーチが現れるのに必要な人気度。 */
export function coachGradeMinPopularity(quality: number): number {
  return COACH.recruitMinPop[Math.round(quality)] ?? 0;
}

/** いまのクラブに、その格のコーチが現れうるか。 */
export function coachGradeAvailable(quality: number, clubTier: number, popularity: number): boolean {
  return coachGradeMinTier(quality) <= clubTier && coachGradeMinPopularity(quality) <= popularity;
}

/**
 * まだ現れない格の説明（募集画面に出して、目標を示す）。
 * 「レジェンドはクラブの格が足りない」と分かれば、何を目指せばよいかが伝わる。
 */
export function coachGradeLockedNote(clubTier: number, popularity: number): string | null {
  for (let q = COACH_MAX_GRADE; q >= 2; q--) {
    if (coachGradeAvailable(q, clubTier, popularity)) return null;
    const needTier = coachGradeMinTier(q) > clubTier;
    const needPop = coachGradeMinPopularity(q) > popularity;
    if (!needTier && !needPop) continue;
    const parts: string[] = [];
    if (needTier) parts.push(`クラブの格 ${coachGradeMinTier(q)}以上`);
    if (needPop) parts.push(`人気度 ${coachGradeMinPopularity(q)}以上`);
    return `${COACH.grades[q - 1].label}が来るには ${parts.join("・")} が要る`;
  }
  return null;
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
