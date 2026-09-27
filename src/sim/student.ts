import type { ClassId } from "./classes";
import {
  clampCondition,
  conditionLevel,
  conditionTrainingMult,
  isRiskyCondition,
  type ConditionLevel,
} from "./condition";
import {
  careerGrowthMultiplier,
  careerPhaseOf,
  estimatedAge,
  growthPhaseMultiplier,
  lifeStageOf,
  randomGrowthType,
  retireAgeOf,
  type GrowthType,
} from "./growth";
import { anchorStandard } from "../data/standardTimes";
import {
  AGING,
  APTITUDE,
  CLASSFIT,
  COACH,
  CONDITION,
  GEN,
  INJURY,
  NEEDS,
  CLASS_FOCUS,
  CLASS_TRAINING,
  DIFFICULTY,
  PRACTICE,
  REST,
  SATISFACTION,
  STAMINA,
  TALENT,
  TALENT_ROLL,
  type TalentRankId,
  STROKE,
  TIME,
  TRAINING,
  YOUTH_FORM, AGE_STAT_CAP } from "../config/balance";

/**
 * 育成の核：1人の選手のステータス・才能・練習ロジック。
 * Phaser には依存しない純ロジック（テスト・調整しやすいように分離）。
 *
 * 設計の要：
 *  - フォームは土台。実効スピード = スピード × (フォーム/100)^1.4。
 *    フォームが落ちると実効スピードが劇的に下がる。
 *  - スピード/持久力を偏って続けると、他ステータスが低下する（トレードオフ）。
 *  - 練習は体力を消費。同じ練習を続けるほど体力コストが増え、偏りを自然に抑制。
 *  - ターンは長距離ほどタイムに効く（距離別の重み付け）。
 *  - 才能＝成長率は隠す。育てると伸びの差で等級が見えてくる。
 */

export type StatKey = "speed" | "stamina" | "form" | "start" | "turn";

/** 表示は5ステータス。系統A（能力練習）ではこの5つすべてを選択できる。 */
export const STAT_KEYS: readonly StatKey[] = ["speed", "stamina", "form", "start", "turn"];
/** 練習で鍛えられるステータス（系統Aの選択肢＝全5種）。 */
export const TRAINABLE_KEYS: readonly StatKey[] = ["speed", "stamina", "form", "start", "turn"];

export const STAT_LABEL: Record<StatKey, string> = {
  speed: "スピード",
  stamina: "持久力",
  form: "フォーム",
  start: "スタート",
  turn: "ターン",
};

export const STAT_COLOR: Record<StatKey, number> = {
  speed: 0xe74c3c,
  stamina: 0x3498db,
  form: 0x2ecc71,
  start: 0xf39c12,
  turn: 0x9b59b6,
};

export type Stroke = "free" | "back" | "breast" | "fly" | "im";

export const STROKE_LABEL: Record<Stroke, string> = {
  free: "自由形",
  back: "背泳ぎ",
  breast: "平泳ぎ",
  fly: "バタフライ",
  im: "個人メドレー",
};

/**
 * 狭いところ用の短い呼び名（HUD の札・一覧の行）。
 * 「自由形100m」では入らない場所に `自由100` と書くために使う。
 */
export const STROKE_SHORT: Record<Stroke, string> = {
  free: "自由",
  back: "背",
  breast: "平",
  fly: "バタ",
  im: "個メ",
};

/** 泳法ごとに存在する距離（設計の大会種目に準拠）。 */
export const STROKE_DISTANCES: Record<Stroke, readonly number[]> = {
  free: [50, 100, 200, 400, 800, 1500],
  back: [50, 100, 200],
  breast: [50, 100, 200],
  fly: [50, 100, 200],
  im: [100, 200, 400],
};

export interface RaceEvent {
  stroke: Stroke;
  distance: number;
}

export const STROKE_KEYS: readonly Stroke[] = ["free", "back", "breast", "fly", "im"];

/**
 * 実体のある4泳法（個人メドレーを除く）。
 * 熟練度と泳法の才能はこの4つにだけ持たせ、個人メドレーは4つの平均で表す
 *（個メは4泳法の集合なので、専用の熟練度を持たせると二重管理になる）。
 */
export type StrokeCore = "free" | "back" | "breast" | "fly";
export const CORE_STROKES: readonly StrokeCore[] = ["free", "back", "breast", "fly"];

/**
 * 全体練習で選べる「スタイル1」＝**各自の一番得意な種目**。
 *
 * クラス全員に同じ泳法をやらせると、平泳ぎが得意な子にもバタフライをさせることになる。
 * これを選ぶと、ひとりひとりが自分の得意種目を泳ぐ（能力の指定はそのまま全体で共通）。
 */
export const OWN_STYLE = "style1" as const;
export type OwnStyle = typeof OWN_STYLE;
/** 練習メニューで指定できる泳法（実際の泳法＋「各自の得意」）。 */
export type PlanStroke = Stroke | OwnStyle;

export const PLAN_STROKE_LABEL: Record<PlanStroke, string> = {
  ...STROKE_LABEL,
  [OWN_STYLE]: "スタイル1（各自の得意）",
};

/** その選手が「スタイル1」で実際に泳ぐ泳法。 */
export function resolveStroke(s: Student, stroke: PlanStroke): Stroke {
  return stroke === OWN_STYLE ? s.fav.stroke : stroke;
}

/**
 * 事前に選んでおく練習内容（育成B/A/選手/プロ）。
 *  系統A：能力練習（ability）— 選んだ能力が自動で上がる
 *  系統B：泳法（stroke）— 選んだ泳法の熟練度が上がる
 * 2系統は独立に選べ、練習時間内に同時に働く。
 */
export interface PracticePlan {
  ability: StatKey; // 系統A
  stroke: PlanStroke; // 系統B（"style1" ＝ 各自の得意種目）
}

/** 実際に行うメニュー（"style1" を本人の得意泳法に解決したもの）。 */
export interface ResolvedPlan {
  ability: StatKey;
  stroke: Stroke;
}

/**
 * その選手がどのメニューで練習するか。
 *  class … クラスの「全体練習」に従う（既定）
 *  self  … 個人指定したメニューが全体指定を上書きする
 * 全体を同じ練習にしつつ、一部の子だけ別メニューにできる。
 */
export type PlanMode = "class" | "self";

export type Gender = "m" | "f";
export const GENDER_LABEL: Record<Gender, string> = { m: "男子", f: "女子" };

/** 大会の勝ち上がりと参加標準記録（年度が変わったときの扱い → competitions.ts の ensureSeason）。 */
export interface SeasonProgress {
  year: number;
  clearedStages: string[]; // 勝ち上がった段と種目（段のキー@泳法-距離 → stageEventKey）
  standards: string[]; // その年度に突破した参加標準記録（StandardKey の文字列。年度が変わると取り直し）
  standardEvents: string[]; // 標準記録を出した種目（キー@泳法-距離。年度が変わると取り直し）
}

/**
 * ある年度のはじめに撮った能力の記録。
 * 学年も一緒に残しておく（「3年目 小4のとき」と言えるように）。
 */
export interface StatSnapshot {
  /** ゲーム内の「◯年目」。 */
  year: number;
  /** そのときの学年。 */
  grade: string;
  /** そのときの5能力。 */
  stats: Record<StatKey, number>;
}

export interface Student {
  id: number;
  name: string;
  grade: string; // 学年ラベル（例：小5）
  gender: Gender; // 性別（標準記録の男女別基準に使う）
  classId: ClassId;
  tint: number; // 表示色

  stats: Record<StatKey, number>; // 0–100
  /**
   * 才能ランク（能力ごと）。E〜SS の7段階で、**その能力の成長速度**を表す。
   * 速く伸びる能力ほど到達できる上限も高い（→ config の TALENT）。
   * 隠さず最初から見せる（どの能力を伸ばすと報われるかが分かるように）。
   */
  talentRank: Record<StatKey, TalentRankId>;
  /** 隠し成長率。才能ランクの範囲から抽選した細かい倍率（同じ◎でも少し差が出る）。 */
  talent: Record<StatKey, number>;
  trainCount: Record<StatKey, number>; // 育成の見える化に使う
  streak: Record<StatKey, number>; // 連続同一練習（偏り）
  /**
   * 泳法ごとの**熟練度** 0〜999（系統Bの練習と大会で上がる）。
   * 個人メドレーの欄は使わない（4泳法の平均で表す → strokeProfOf）。
   */
  strokeProf: Record<Stroke, number>;
  /**
   * 泳法ごとの**才能** 0〜1（生成時に決まる、先天的な向き不向き）。
   * 熟練度の「上がりやすさ」と「届く上限」を決める（→ config の STROKE.talent）。
   */
  strokeTalent: Record<StrokeCore, number>;

  energy: number; // 体力（現在値。stats.stamina とは別物）
  fav: RaceEvent; // 得意種目
  plan: PracticePlan; // 個人指定の練習（系統A/系統B）
  planMode: PlanMode; // class＝全体練習に従う / self＝個人指定を優先
  practiceAccum: number; // 自動練習の未消化ゲーム分（クラス時間内に溜まる）

  /**
   * --- 休養（1週間まるごと練習を休む） ---
   * いつまで休むか（通算の日数＝週。0＝休んでいない）。
   * `GameState.dayCount` がこの値**未満**のあいだ休養中で、週が変われば自動で復帰する。
   * 「休んでいる」という旗を別に持たないので、取り消せば**その場で**練習に戻る。
   */
  restUntilDay: number;

  // --- 欲求（回復設備を使いに行くかの判断） ---
  recoveryNeed: number; // 「回復したい」欲求 0–100（体力が減るほど強くなる）

  /**
   * 満足度（機嫌）0–100。
   * 良い設備を使えた・練習がうまくいった・伸びた → 上がる。
   * 混雑で待たされた・疲れきった・ケガ → 下がる。
   * 何もなければ毎日「ふつう」へ戻る（→ sim/satisfaction.ts）。
   */
  mood: number;

  // --- 成績（格の判定に使う。能力値ではなく実際に出した記録・順位） ---
  achievePoints: number; // 大会成績・標準記録突破の累積ポイント
  bestTimeScore: number; // 自己ベスト由来の到達点（更新時のみ上がる）
  bestTimeSec: number; // 自己ベストの秒（0＝未計測）
  bestTimeEvent: RaceEvent | null; // 自己ベストを出した種目
  rankTier: number; // 現在の格 1–8（演出のため保持する）
  wins: number; // 通算優勝回数（プロフィール文に使う）

  // --- 隠しパラメータ / コンディション ---
  growthType: GrowthType; // 成長タイプ（隠し）
  growthObserved: number; // 観察度 0–100（成長タイプ推測の進み具合）
  condition: number; // コンディション 0–100（5段階に落とす）
  season: SeasonProgress; // 大会の年度フラグ

  /**
   * 幼少期（幼児・学童）に到達したフォームの最高値。
   * 「フォームは土台」というルールはそのままに、幼いうちにフォームを作った子ほど
   * 中学以降の伸びが良くなる＝早い段階で見出して鍛える価値になる。
   * 幼少期のあいだは毎回更新され、卒業後は凍結される。
   */
  youthForm: number;
  /**
   * 年齢。年度の変わり目に1つ増える。
   *
   * 【学年から逆算しない】学年は「社会人」で止まるので、そこから先の一生
   *（ピーク・衰え・引退）を年齢で扱えなくなる。実年齢を持たせておく。
   */
  age: number;
  /** 寮に入っているか（回復が速くなる）。 */
  inDorm: boolean;
  /**
   * 【退会の予告】この通算月数（GameState.monthCount）になったら退会する。null＝予定なし。
   *
   * 学年が上がってクラスの年齢を超えた子に付く印。**その場では消さず、1ヶ月の猶予を置く**。
   * 年度の変わり目に黙って消えると、プレイヤーには「育てていた子が勝手に居なくなった」
   * としか見えない（学年が上がった瞬間と退会が同じ1コマで起きるため、
   * 手の打ちようが無い）。猶予の1ヶ月のあいだに入れるクラスへ昇格させれば、印は消えて残る。
   */
  leaveAtMonth: number | null;
  /**
   * 【注目選手】HUD に小さく出して追いかける印（★）。
   *
   * 在籍が100人を超えると「誰を見ればいいか」が分からなくなり、
   * 成長が遅いこの遊びでは**自分の子が居ない**まま数年が過ぎてしまう。
   * 印を付けた選手だけは、自己ベストや昇格がその場で HUD に流れる。
   * 付けられる人数は `PIN_MAX`（→ sim/state.ts）で絞る。多いと追えない。
   */
  pinned: boolean;

  /**
   * 【成長の歴史】年度ごとの能力の記録。
   *
   * 入団した年度に1つ、そのあとは年度の変わり目ごとに1つ。**1年に1回だけ**。
   * これがあると「入団時の小さな五角形が、いまはここまで大きくなった」を
   * レーダーチャートに重ねて見せられる（→ ui/PlayerCardModal）。
   * 1人あたり年1つなので、選手生活まるごとでも20件ほどにしかならない。
   */
  history: StatSnapshot[];

  /**
   * 【廃止】専属コーチの id（2026-09-27 に機能ごと無くした）。
   * 古いセーブを読み書きできるように項目だけ残してある。どこからも使わない（常に null）。
   */
  personalCoachId: number | null;

  // --- ケガ・合宿の後遺 ---
  /** 残りのケガ日数（0＝健康）。ドクター・温泉リハビリで早く減る。 */
  injuryDays: number;
  /**
   * クリニックでリハビリ中か（受診させると入る）。
   * リハビリ中は練習に出ず、そのぶんケガの治りとコンディションの戻りが速い。
   * 治りきると自動的に外れる。
   */
  inRehab: boolean;
  /**
   * 大会遠征でクラブを空けている残り日数（0＝クラブにいる）。
   * 地方ブロックより上の大会に出ると1週間ぶん入る。その間は練習に参加しない。
   */
  awayDays: number;
  /**
   * 高地合宿から降りたあとの状態（sim/camp.ts の AltitudeState）。
   * 下山からの日数で大会のタイムが変わる。効果が切れたら null に戻る。
   * 型は sim/camp.ts に置いてあるので、循環参照を避けてここでは構造だけ書いている。
   */
  altitude: {
    descentDay: number;
    adaptation: number;
    failed: boolean;
    sprintDull: number;
    stayDays: number;
  } | null;
}

/** ケガをしているか。 */
export function isInjured(s: Student): boolean {
  return s.injuryDays > 0;
}

// ------------------------------------------------------------------ 派生値
// 調整値は config/balance.ts に集約（TRAINING / TIME / APTITUDE / CLASSFIT / GEN / CONDITION）。

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * 体力の最大値。持久力ステータスがそのまま効く（＝たくさん練習できる）。
 *
 * 持久力10 → 57 ／ 40 → 86 ／ 80 → 124。
 * 「持久力を鍛えた」手ごたえが体力ゲージの長さに出るよう、幅を大きく取ってある。
 */
export function energyMax(s: Student): number {
  return STAMINA.energyBase + STAMINA.energyPerPoint * clamp(s.stats.stamina, 0, 100);
}

/**
 * 持久力による体力消費の倍率（1.25 → 0.4）。
 * 持久力の低い子ははっきり損をし、鍛えた子は同じ練習をしても疲れない。
 */
export function staminaCostMult(s: Student): number {
  const t = clamp(s.stats.stamina, 0, 100) / 100;
  return STAMINA.costAtZero + (STAMINA.costAtMax - STAMINA.costAtZero) * t;
}

/**
 * コマの合間の休憩で戻る体力（最大値に対する割合）。持久力が高いほどよく戻る。
 * 消費（staminaCostMult）と合わせて「持久力があれば1日に何コマでも練習できる」を作る。
 */
export function restRefillRatio(s: Student): number {
  const t = clamp(s.stats.stamina, 0, 100) / 100;
  return STAMINA.refillAtZero + (STAMINA.refillAtMax - STAMINA.refillAtZero) * t;
}

/** フォーム倍率（土台）。フォームが落ちると急激に下がる。 */
export function formMultiplier(s: Student): number {
  return Math.pow(clamp(s.stats.form, 0, 100) / 100, TIME.formExponent);
}

/** 実効スピード。フォームで大きく変わる。 */
export function effectiveSpeed(s: Student): number {
  return s.stats.speed * formMultiplier(s);
}

/**
 * その練習1ステップの体力コスト（連続するほど高い＝偏りを抑制）。
 * 1ステップぶんなので小さい（1コマ＝6ステップ）。**丸めない**：
 * 整数に丸めると、クラスの fatigue と持久力の割引がほとんど効かなくなる。
 */
export function trainingCost(s: Student, key: StatKey): number {
  const streakMul = 1 + TRAINING.energyStreakMul * s.streak[key];
  return TRAINING.energyCost[key] * streakMul * staminaCostMult(s);
}

export function canTrain(s: Student, key: StatKey): boolean {
  return s.energy >= trainingCost(s, key);
}

/** 距離ラダー（適性の距離差を測る用）。 */
const DIST_LADDER = [50, 100, 200, 400, 800, 1500];

// ------------------------------------------------------------------ 泳法の熟練度

/** その泳法の熟練度。個人メドレーは**4泳法の平均**（専用の熟練度は持たない）。 */
export function strokeProfOf(s: Student, stroke: Stroke): number {
  if (stroke === "im") {
    const sum = CORE_STROKES.reduce((n, k) => n + (s.strokeProf?.[k] ?? 0), 0);
    return sum / CORE_STROKES.length;
  }
  return clamp(s.strokeProf?.[stroke] ?? 0, 0, STROKE.max);
}

/** その泳法の才能（0〜1）。個人メドレーは4泳法の平均。 */
export function strokeTalentOf(s: Student, stroke: Stroke): number {
  if (stroke === "im") {
    const sum = CORE_STROKES.reduce((n, k) => n + (s.strokeTalent?.[k] ?? 0.5), 0);
    return sum / CORE_STROKES.length;
  }
  return clamp(s.strokeTalent?.[stroke as StrokeCore] ?? 0.5, 0, 1);
}

/** その泳法で届く熟練度の上限（才能で決まる）。 */
export function strokeCapOf(s: Student, stroke: Stroke): number {
  const t = strokeTalentOf(s, stroke);
  return STROKE.talent.capMin + (STROKE.talent.capMax - STROKE.talent.capMin) * t;
}

/** その泳法の熟練度の上がりやすさ（才能で決まる）。 */
export function strokeGrowthOf(s: Student, stroke: Stroke): number {
  const t = strokeTalentOf(s, stroke);
  return STROKE.talent.growthMin + (STROKE.talent.growthMax - STROKE.talent.growthMin) * t;
}

/**
 * 【発揮率】その泳法で、能力を何割出せるか。
 *
 * 熟練度0で execMin（8割）、execRef で 1.0（能力を出しきる）、
 * 999 まで育てると 1.0 + execOver。タイムに秒を足し引きせず、
 * **能力そのものに掛ける**ので、距離が変わっても同じ意味で効く。
 */
export function strokeExecution(s: Student, stroke: Stroke): number {
  const p = strokeProfOf(s, stroke);
  const t = clamp(p / STROKE.execRef, 0, 1);
  const base = STROKE.execMin + (1 - STROKE.execMin) * Math.pow(t, STROKE.execCurve);
  if (p <= STROKE.execRef) return base;
  const over = (p - STROKE.execRef) / Math.max(1, STROKE.max - STROKE.execRef);
  return base + STROKE.execOver * clamp(over, 0, 1);
}

/** いちばん熟練している泳法（＝後天的に決まる「得意」）。 */
export function bestStrokeOf(s: Student): StrokeCore {
  return CORE_STROKES.reduce((a, b) => (strokeProfOf(s, a) >= strokeProfOf(s, b) ? a : b));
}

/** いちばん才能のある泳法（＝これから伸ばすと得な泳法）。 */
export function bestStrokeTalentOf(s: Student): StrokeCore {
  return CORE_STROKES.reduce((a, b) => (strokeTalentOf(s, a) >= strokeTalentOf(s, b) ? a : b));
}

/** 距離適性（得意距離からの距離差で減衰）。 */
export function distanceAptitude(s: Student, distance: number): number {
  const a = DIST_LADDER.indexOf(distance);
  const b = DIST_LADDER.indexOf(s.fav.distance);
  const steps = a < 0 || b < 0 ? 0 : Math.abs(a - b);
  return Math.max(APTITUDE.distMin, APTITUDE.distSame - steps * APTITUDE.distStepPenalty);
}

/**
 * 能力指数 P（0–100）。ステータス（距離別重み）×フォーム土台×適性。
 * P=TIME.powerAtStandard で標準記録ちょうど＝トップレベル。
 */
export function performanceIndex(s: Student, ev: RaceEvent): number {
  const w = TIME.distanceWeights[ev.distance];
  const p0 =
    w.speed * effectiveSpeed(s) + w.stamina * s.stats.stamina + w.start * s.stats.start + w.turn * s.stats.turn;
  // 【能力 × 発揮率 × 距離適性】発揮率は熟練度から（→ strokeExecution）。
  // 得意泳法の固定ボーナスは廃止した。得意かどうかは「鍛えた熟練度」で決まる。
  const apt = strokeExecution(s, ev.stroke) * distanceAptitude(s, ev.distance);
  return clamp(p0 * apt, 0, 100);
}

/**
 * 能力値→タイム予測（秒）。ジャパンオープン標準記録（男女別）をアンカーにする。
 * P=powerAtStandard で標準ちょうど。下回るほど timeSlope に従って遅くなる。
 */
export function predictTime(s: Student, ev: RaceEvent): number {
  const anchor = anchorStandard(ev, s.gender);
  const p = performanceIndex(s, ev);
  return anchor * (1 + TIME.timeSlope * (TIME.powerAtStandard - p) / 100);
}

/** 秒を mm:ss.x / ss.x 表記に。 */
export function formatTime(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }
  return sec.toFixed(2);
}

/**
 * 才能ランクの表示。
 *
 * 才能ランクは**その能力の成長速度**（→ config の TALENT）。
 * SS がいちばん速く、E がいちばん遅い。速く伸びる能力ほど、到達できる上限も高い。
 * **最初から見える**（隠さない）。どの能力を伸ばすと報われるかが、最初の1分で分かる。
 */
export const TALENT_COLOR: Record<TalentRankId, string> = TALENT.color;
export const TALENT_NOTE: Record<TalentRankId, string> = TALENT.note;

/** 才能ランクを低い順に並べたもの（凡例や検査に使う）。 */
export const TALENT_ORDER: readonly TalentRankId[] = TALENT.order;

/** その能力の才能ランク（＝成長速度）。 */
export function talentRankOf(s: Student, key: StatKey): TalentRankId {
  return s.talentRank?.[key] ?? "C";
}

/**
 * その能力が到達できる上限（才能ランクで決まる）。
 * 練習の伸びはここで頭打ちになる＝「この子はどこまで行けるか」が才能で決まる。
 */
export function statCapOf(s: Student, key: StatKey): number {
  return TALENT.cap[talentRankOf(s, key)] ?? 100;
}

/**
 * 【成長期の上限に届いているか】（→ AGE_STAT_CAP）
 *
 * 年代ごとの上限は**能力指数（大会のタイムの元 → performanceIndex）**で持つ。
 * 能力の数字そのものは指数と一直線ではない（全部100でも指数は約79で、
 * 残りは泳法の熟練度や幼少期のフォームで決まる）ので、能力で止めると狙いがずれる。
 * 届いている子は、その年代のうちは能力も熟練度も伸びない（上の年代に上がると再び伸びる）。
 * ふつうに育てた子はこの上限の手前にいるので、伸びは遅くならない。
 */
export function atAgeCeiling(s: Student): boolean {
  const cap = AGE_STAT_CAP[lifeStageOf(s.grade)] ?? 100;
  if (cap >= 100) return false;
  return performanceIndex(s, { stroke: s.fav.stroke, distance: s.fav.distance }) >= cap;
}

/** その能力の伸びしろ倍率（成長速度）。 */
export function talentGrowthOf(s: Student, key: StatKey): number {
  return TALENT.growthMult[talentRankOf(s, key)] ?? 1;
}

/**
 * 【日々の練習で届く上限】才能の上限より TALENT.practiceMargin ぶん手前。
 *
 * 残りは合宿（→ GameState.runCamp）でしか埋まらない。
 * 「練習だけで完成する選手はいない」＝最後の仕上げにはお金が要る、という形にするため。
 */
export function practiceCapOf(s: Student, key: StatKey): number {
  return Math.max(0, statCapOf(s, key) - TALENT.practiceMargin);
}

// ------------------------------------------------------------------ 幼少期のフォームと将来性

/** 今、幼少期（幼児・学童）か。 */
export function isYouthStage(s: Student): boolean {
  return (YOUTH_FORM.stages as readonly string[]).includes(lifeStageOf(s.grade));
}

/**
 * 幼少期フォームの記録を更新する（幼少期のあいだだけ伸びる）。
 * 練習のたびに呼ぶ。卒業後は値が凍結され、そのまま将来性になる。
 */
export function updateYouthForm(s: Student): void {
  if (!isYouthStage(s)) return;
  s.youthForm = Math.max(s.youthForm ?? 0, s.stats.form);
}

/**
 * 幼少期フォームからくる将来性の倍率。
 * 幼少期のあいだは 1.0（二重取りしない）。中学以降にだけ効く。
 * baseline を上回っていた子ほど伸びが良く、下回っていた子はわずかに鈍い。
 */
export function youthPotential(s: Student): number {
  if (isYouthStage(s)) return 1;
  const recorded = s.youthForm ?? 0;
  if (recorded <= 0) return 1; // 中学以降に入団した子は対象外（記録が無い）
  const diff = recorded - YOUTH_FORM.baseline;
  return clamp(1 + diff * YOUTH_FORM.perPoint, YOUTH_FORM.minMult, YOUTH_FORM.maxMult);
}

/**
 * コーチが見抜いた「将来性」のヒント。
 * 質の低いコーチには分からない。質が高いほど段階が細かく見える。
 * 幼少期の子にだけ意味がある（見出して育てるための情報）。
 */
export function youthPotentialHint(s: Student, coachQuality: number): string | null {
  if (!isYouthStage(s)) return null;
  if (coachQuality < YOUTH_FORM.hintMinQuality) return null;
  const recorded = Math.max(s.youthForm ?? 0, s.stats.form);
  const diff = recorded - YOUTH_FORM.baseline;
  const tiers = YOUTH_FORM.hintTiers;
  // 質が低いと上位の段階までは見抜けない（分かる段階の数を質で絞る）
  const visible = Math.min(tiers.length, Math.max(2, coachQuality));
  let tier = 0;
  if (diff > 4) tier = 1;
  if (diff > 12) tier = 2;
  if (diff > 22) tier = 3;
  return tiers[Math.min(tier, visible - 1)];
}

// ------------------------------------------------------------------ クラス平均と練習効率

/** その選手の総合能力（クラス平均比較に使う）。 */
export function overallAbility(s: Student): number {
  return (s.stats.speed + s.stats.stamina + s.stats.form + s.stats.start + s.stats.turn) / 5;
}

export type ClassFitStatus = "tooLow" | "good" | "tooHigh";

/** クラス平均との差から見た「合っているか」。tooHigh は上振れ罰のあるクラスのみ。 */
export function classFitStatus(s: Student, classAvg: number): ClassFitStatus {
  const diff = overallAbility(s) - classAvg;
  if (diff < -CLASSFIT.tooLowGap) return "tooLow";
  if (diff > CLASSFIT.tooHighGap && !CLASSFIT.noOverPenalty[s.classId]) return "tooHigh";
  return "good";
}

/**
 * クラス平均に対する練習効率補正。
 * 平均付近が最適。大きく下回ると「ついていけず」効率低下。
 * 育成B/A は大きく上回っても「物足りず」効率低下（＝上げ時のサイン）。
 * 選手/プロは上振れでは下がらない（高強度環境）。
 */
export function classFitMultiplier(s: Student, classAvg: number): number {
  const diff = overallAbility(s) - classAvg;
  const mag = Math.min(CLASSFIT.maxGapConsidered, Math.max(0, Math.abs(diff) - CLASSFIT.sweetBand));
  if (mag === 0) return 1.0;
  if (diff < 0) return Math.max(CLASSFIT.minMult, 1 - CLASSFIT.belowPenaltyPer * mag);
  if (CLASSFIT.noOverPenalty[s.classId]) return 1.0; // 選手/プロは上振れ罰なし
  return Math.max(CLASSFIT.minMult, 1 - CLASSFIT.abovePenaltyPer * mag);
}

// ------------------------------------------------------------------ 練習

export interface TrainOptions {
  coachMult?: number; // 監督コーチの成長スピード補正（既定1.0）
  coachQuality?: number; // 観察度の増分に使う（既定0）
  classFitMult?: number; // クラス平均に対する練習効率補正（既定1.0）
  facilityMult?: number; // 設備（スタジオ=フォーム/筋トレ=スピード）の補正（既定1.0）
  itemTrainMult?: number; // アイテム（縄跳び）の練習効率補正（既定1.0）
  itemFatigueMult?: number; // アイテム（ストレッチマット）の疲労軽減（既定1.0）
  /** 研究（会議室）で得た成長率の上乗せ。ステータス別＋全体ぶんを掛けたもの（既定1.0）。 */
  researchMult?: number;
  /** 研究による故障率の倍率（既定1.0。小さいほど故障しにくい）。 */
  researchInjuryMult?: number;
  /** 研究による観察度（成長タイプの見抜きやすさ）の倍率（既定1.0）。 */
  researchObserveMult?: number;
  /** 専門スタッフ（栄養士）ぶんの練習効率の倍率（既定1.0）。 */
  staffTrainMult?: number;
  /** 専門スタッフ（栄養士）ぶんの疲労軽減（既定1.0）。 */
  staffFatigueMult?: number;
  /** 専門スタッフ（ドクター）ぶんの故障率の倍率（既定1.0）。 */
  staffInjuryMult?: number;
  /** 監督コーチの専門種目が一致したときの倍率（既定1.0）。 */
  specialtyMult?: number;
  /**
   * 伸びの鈍り（dim）の下限（既定0＝床なし）。
   *
   * 日々の練習は上限の近くでほぼ0になるが、**特別練習や合宿はそこでこそ効いてほしい**。
   * 床を置いても `practiceCapOf` は超えないので、
   * 「最後の数ポイントは合宿でしか埋まらない」という決めごとは壊れない。
   */
  dimFloor?: number;
  rand?: () => number; // 故障判定などの乱数
}

export interface TrainResult {
  delta: Record<StatKey, number>; // 各ステータスの増減
  cost: number; // 消費体力
  conditionLevel: ConditionLevel; // 練習後のコンディション
  strain: boolean; // 不調/疲労で追い込んだ
  formInjury: boolean; // フォーム低下（故障気味）が起きた
  /** 本当のケガ（練習を休む）になった日数。0＝ケガはしていない。 */
  injuredDays: number;
}

/**
 * 1回練習する。ターゲットを伸ばしつつ、偏りが続けばトレードオフで他が下がる。
 * 成長タイプ・コンディション・コーチの質が伸びに乗る。
 */
export function applyTraining(s: Student, key: StatKey, opts: TrainOptions = {}): TrainResult {
  const rand = opts.rand ?? Math.random;
  const coachMult = opts.coachMult ?? 1.0;
  const classFitMult = opts.classFitMult ?? 1.0;
  // クラスが上がるほど「よく伸びる・きつい」（幼児 → … → プロ）
  const cls = CLASS_TRAINING[s.classId] ?? { growth: 1, fatigue: 1 };
  // アイテム：縄跳び＝効率up、ストレッチマット＝疲労軽減（所持数を超える人には効かない）
  const itemTrainMult = opts.itemTrainMult ?? 1.0;
  // 疲労軽減はアイテム（マット）と栄養士のぶんが重なる
  const itemFatigueMult = (opts.itemFatigueMult ?? 1.0) * (opts.staffFatigueMult ?? 1.0);
  const before: Record<StatKey, number> = { ...s.stats };
  const cost = trainingCost(s, key) * itemFatigueMult * cls.fatigue;
  const levelBefore = conditionLevel(s.condition);

  // 連続カウント：対象は+1、他は-1（偏りは記憶されるが変化で解ける）
  // 上限を設けないと体力コストが際限なく増え、練習そのものができなくなる
  for (const k of TRAINABLE_KEYS) {
    s.streak[k] = k === key ? Math.min(TRAINING.streakMax, s.streak[k] + 1) : Math.max(0, s.streak[k] - 1);
  }
  s.trainCount[key] += 1;

  // 上昇：才能 × 伸びしろ × 体力 × コンディション × 成長タイプ×ステージ × コーチ × クラス環境 × 設備
  // 【伸びしろは「その子の上限」に対して測る】才能ランクが上限を決める（→ statCapOf）。
  // 100 に対して測ると、上限89の能力が「まだ伸びる」ように見えて実際は頭打ち、になる。
  // 【伸びの鈍り方は才能の上限で測り、止まるのはその手前】
  // dim（鈍化）は本来の上限に対して測るので、カーブの形は今までどおり。
  // ただし練習で積めるのは practiceCapOf まで＝最後の数ポイントは合宿の領分。
  const cap = statCapOf(s, key);
  const reach = practiceCapOf(s, key);
  const dim = Math.max(opts.dimFloor ?? 0, Math.pow(Math.max(0, 1 - s.stats[key] / cap), TRAINING.dimExponent));
  // 疲れると伸びが落ちるが、**落ち幅は小さい**（→ TRAINING.tiredGainFloor）。
  // 疲れの罰は下の「調子の消耗」と「ケガ」が受け持つ。
  const energyRatio = clamp(s.energy / energyMax(s), 0, 1);
  const floor = TRAINING.tiredGainFloor;
  const energyCond = floor + (1 - floor) * energyRatio;
  const condMult = conditionTrainingMult(levelBefore);
  // 【年齢の時期】ライフステージ（学年）の倍率に、年齢の時期の倍率を掛ける。
  // ピークに入ると伸びは緩やかになり、衰え期に入るともう伸びない（→ AGING.growMult）。
  const phaseMult =
    growthPhaseMultiplier(s.growthType, lifeStageOf(s.grade)) * careerGrowthMultiplier(s.growthType, s.age);
  const facilityMult = opts.facilityMult ?? 1.0;
  // ケガ中は伸びが落ちる（治るまで無理をさせても効率が悪い）
  const injuryMult = isInjured(s) ? INJURY.trainMult : 1;
  // 幼少期にフォームを作った子ほど、中学以降の伸びが良い
  const potentialMult = youthPotential(s);
  // クラスの個性：そのクラスで伸びやすい能力（→ CLASS_FOCUS）。才能ランクと掛け算になる
  const focus = CLASS_FOCUS[s.classId]?.[key] ?? 1;
  const gain =
    TRAINING.baseGain *
    DIFFICULTY.growthScale *
    cls.growth *
    focus *
    s.talent[key] *
    dim *
    energyCond *
    condMult *
    phaseMult *
    potentialMult *
    coachMult *
    classFitMult *
    facilityMult *
    itemTrainMult *
    injuryMult *
    (opts.staffTrainMult ?? 1) *
    (opts.specialtyMult ?? 1) *
    (opts.researchMult ?? 1);
  // 成長期の上限に届いている子は、この年代のうちは伸びない（→ atAgeCeiling）
  if (!atAgeCeiling(s)) s.stats[key] = clamp(s.stats[key] + gain, 0, Math.max(reach, s.stats[key]));

  // 【練習した能力が上がるだけ】以前はスピード／持久力を偏って続けると
  // 他の能力が下がっていたが、「鍛えたのに弱くなる」は遊んでいて分かりにくいので廃止した。
  // 偏りの罰は下の「疲れ方」（体力コストと調子の消耗）だけが受け持つ。

  // コンディション消耗。追い込み（高強度 or 偏り超）を不調/疲労でやるとリスク。
  const over = s.streak[key] - TRAINING.tradeoffThreshold;
  // 「追い込み」＝ 偏らせすぎ、または**体力が残り少ないのに続けている**。
  // 体力そのものは減りにくくしたので、詰め込みの歯止めはここから先が受け持つ。
  const hardPush = over > 0 || energyRatio <= CONDITION.hardPushEnergy;
  const strain = hardPush && isRiskyCondition(levelBefore);
  let formInjury = false;
  let injuredDays = 0;
  let fatigue =
    (CONDITION.fatigueBase +
      cost * CONDITION.fatigueCostRate +
      CONDITION.fatigueWhenEmpty * (1 - energyRatio) + // 疲れているほど調子が落ちる
      (over > 0 ? over * CONDITION.fatigueStreakRate : 0)) *
    itemFatigueMult;
  if (strain) {
    fatigue += CONDITION.strainExtraFatigue;
    // 研究（コンディション管理）とドクターが進んでいると故障しにくくなる
    if (rand() < CONDITION.injuryChance * (opts.researchInjuryMult ?? 1) * (opts.staffInjuryMult ?? 1)) {
      s.stats.form = clamp(s.stats.form - (CONDITION.injuryFormLoss.base + rand() * CONDITION.injuryFormLoss.spread), 0, 100);
      formInjury = true;
      // そのうちいくらかは本当のケガになる（しばらく練習を休む）。
      // 「疲労が溜まる → 調子が落ちる → まれにケガ」という順番になっている。
      if (rand() < CONDITION.injuryDaysChance) {
        injuredDays = Math.round(CONDITION.injuryDays.base + rand() * CONDITION.injuryDays.spread);
        s.injuryDays = Math.max(s.injuryDays, injuredDays);
      }
    }
  }
  s.condition = clampCondition(s.condition - fatigue);

  // 観察度（成長タイプのヒント進行）。良いコーチほど早く見抜く。
  // 研究（指導法）が進んでいるとさらに早くなる。
  s.growthObserved = Math.min(
    100,
    s.growthObserved +
      (COACH.observePerTrain + (opts.coachQuality ?? 0) * COACH.observePerQuality) *
        (opts.researchObserveMult ?? 1),
  );

  s.energy = Math.max(0, s.energy - cost);
  raiseRecoveryNeed(s); // 疲れるほど「回復したい」欲求が強くなる
  updateYouthForm(s); // 幼少期のうちはフォームの最高値を将来性として記録する

  const delta = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) delta[k] = s.stats[k] - before[k];

  return {
    delta,
    cost,
    conditionLevel: conditionLevel(s.condition),
    strain,
    formInjury,
    injuredDays,
  };
}

// ------------------------------------------------------------------ 一生（加齢・衰え・引退）

/** その選手の今の時期（急成長期／ピーク／衰え始め／限界）。 */
export function phaseOf(s: Student): ReturnType<typeof careerPhaseOf> {
  return careerPhaseOf(s.growthType, s.age);
}

/** 引退する年齢に達しているか。 */
export function isRetireAge(s: Student): boolean {
  return s.age >= retireAgeOf(s.growthType);
}

/**
 * 【1年ぶん歳を取る】年度の変わり目に呼ぶ。
 *
 * 衰え期に入っていれば能力が落ちる。**落ち方は能力で違う**
 *（スピードとスタートから先に落ち、フォームとターンは残る → AGING.declineBy）。
 * 泳法の熟練度には手を付けない。体は衰えても技術と経験は残るので、
 * ベテランは高い発揮率で衰えを補って戦える。
 *
 * @returns 落ちた量（能力ごと。伸びも衰えも無ければ全部0）
 */
export function applyAging(s: Student): Record<StatKey, number> {
  s.age += 1;
  const lost = { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 } as Record<StatKey, number>;
  const phase = phaseOf(s);
  const base = AGING.declinePerYear[phase] ?? 0;
  if (base <= 0) return lost;
  for (const k of STAT_KEYS) {
    const rate = AGING.declineBy[k] ?? 0.5;
    const before = s.stats[k];
    s.stats[k] = clamp(before - base * rate, 0, 100);
    lost[k] = before - s.stats[k];
  }
  return lost;
}

// ------------------------------------------------------------------ 成長の記録（年1回）

/**
 * 1人ぶんの記録の上限。
 *
 * 幼児から引退までを1年1つで数えても20年ほど。少し余裕を持たせてある。
 * 万一あふれたら、**入団時（いちばん古い1件）は残したまま**その次を捨てる。
 * 「どこから始まったか」が消えると、成長の比較そのものができなくなるため。
 */
export const HISTORY_MAX = 32;

/**
 * その年の能力を記録する。**同じ年に2回は記録しない**（年1回だけ）。
 *
 * @returns 記録したら true（すでにその年のぶんがあれば false）
 */
export function recordSnapshot(s: Student, year: number): boolean {
  if (!Array.isArray(s.history)) s.history = [];
  if (s.history.some((h) => h.year === year)) return false;
  s.history.push({ year, grade: s.grade, stats: { ...s.stats } });
  s.history.sort((a, b) => a.year - b.year);
  if (s.history.length > HISTORY_MAX) s.history.splice(1, s.history.length - HISTORY_MAX);
  return true;
}

/** 入団時（いちばん古い記録）。まだ無ければ null。 */
export function firstSnapshot(s: Student): StatSnapshot | null {
  return s.history?.[0] ?? null;
}

/** その年の記録（無ければ null）。 */
export function snapshotOfYear(s: Student, year: number): StatSnapshot | null {
  return s.history?.find((h) => h.year === year) ?? null;
}

// ------------------------------------------------------------------ 休養（1週間まるごと休む）

/**
 * 休養を指示する。即座には回復しない。
 * 「今週から REST.weeks 週ぶん、クラス練習に来ない」という**期間**の指示で、
 * 休んでいる時間のぶんだけ体力とコンディションが戻る。
 *
 * @param today いまの通算日数（＝週。GameState.dayCount）
 * @returns 実際に休むことになった週数（すでに同じだけ休んでいれば 0）
 */
export function orderRest(s: Student, today: number, weeks: number = REST.weeks): number {
  const until = today + Math.max(1, Math.round(weeks));
  if (s.restUntilDay >= until) return 0; // すでにそれ以上休んでいる（連打しても伸びない）
  s.restUntilDay = until;
  // 休むと「同じ練習を続けた」カウントがほどける
  for (const k of TRAINABLE_KEYS) s.streak[k] = Math.max(0, s.streak[k] - REST.streakRelief);
  return until - today;
}

/**
 * 休養を取り消す。
 * 期間そのものを消すので、**次の練習からすぐ**顔ぶれに戻る
 * （以前は「休んでいる」旗が残り、取り消しても永久に戻らなかった）。
 */
export function cancelRest(s: Student): void {
  s.restUntilDay = 0;
}

/** いま休養中か。 */
export function isResting(s: Student, today: number): boolean {
  return s.restUntilDay > today;
}

/** あと何週休むか（0＝休養なし）。 */
export function restWeeksLeft(s: Student, today: number): number {
  return Math.max(0, s.restUntilDay - today);
}

/**
 * 休んでいる選手の1tick。練習はせず（＝この回の成長は無い）、
 * 経過したゲーム分のぶんだけ体力・コンディションが戻り、欲求も落ち着く。
 *
 * `rand` を渡すと、ときどき「ぐっすり休めた」ぶんが上乗せされる（→ REST.bonusChance）。
 * 戻り値は戻った体力。
 */
export function applyRestTick(
  s: Student,
  minutes: number,
  recoveryMult = 1,
  rand?: () => number,
): { energy: number; condition: number; bonus: boolean } {
  if (minutes <= 0) return { energy: 0, condition: 0, bonus: false };
  const em = energyMax(s);
  const beforeE = s.energy;
  const beforeC = s.condition;
  let energy = em * REST.energyPerMinute * minutes * recoveryMult;
  let condition = REST.conditionPerMinute * minutes * recoveryMult;
  // ときどき「ぐっすり休めた」＝体力も調子も余分に戻る
  const bonus = !!rand && rand() < REST.bonusChance;
  if (bonus) {
    energy += em * REST.bonusEnergy * recoveryMult;
    condition += REST.bonusCondition * recoveryMult;
  }
  s.energy = Math.min(em, s.energy + energy);
  s.condition = clampCondition(s.condition + condition);
  s.recoveryNeed = Math.max(0, s.recoveryNeed - NEEDS.relaxPerRestMinute * minutes);
  return { energy: s.energy - beforeE, condition: s.condition - beforeC, bonus };
}

// ------------------------------------------------------------------ 欲求（回復設備を使いたい）

/**
 * 練習1回ぶんの「回復したい」欲求の増加。
 * 体力が減っているほど、コンディションが悪いほど強くなる。
 */
export function raiseRecoveryNeed(s: Student): void {
  const energyRatio = clamp(s.energy / Math.max(1, energyMax(s)), 0, 1);
  const condLack = clamp(1 - s.condition / 100, 0, 1);
  const gain =
    NEEDS.gainPerStep * (1 + NEEDS.energyWeight * (1 - energyRatio)) + NEEDS.conditionWeight * condLack;
  s.recoveryNeed = clamp(s.recoveryNeed + gain, 0, NEEDS.max);
}

/** その選手は回復設備を使いに行きたいか（閾値超え）。 */
export function wantsRecovery(s: Student): boolean {
  return s.recoveryNeed >= NEEDS.threshold;
}

/**
 * 系統B：泳法の練習を1ステップ。
 *
 * 上がるのは
 *   ・その泳法の**熟練度**（才能で上がりやすさと上限が変わる）
 *   ・その泳法に関係する**5能力**（副産物。系統Aほどではない → STROKE.statFocus）
 *
 * 個人メドレーを選んだときは4泳法にまんべんなく積む（個メ専用の熟練度は持たない）。
 */
export function applyStrokeTraining(
  s: Student,
  stroke: Stroke,
  opts: {
    coachMult?: number;
    classFitMult?: number;
    gainBase?: number;
    researchMult?: number;
    /** 監督コーチの専門泳法と一致したときの倍率。 */
    specialtyMult?: number;
    /**
     * 入寮している選手の上乗せ（→ DORM.strokeGrowthMult）。
     * 住み込みで泳ぎ込む時間が取れるぶん、**熟練度だけ**が大きく伸びる。
     * 能力（副産物）には掛けない。
     */
    dormMult?: number;
    /**
     * 泳法ごとの能力の寄り（副産物）を出すか。既定は出す。
     * スクール（幼児・学童）の全体練習は「泳法を専門に泳ぎ込むコマ」ではないので
     * false にする。ここを true にすると、スクールの伸びが二重に乗ってしまう。
     */
    statFocus?: boolean;
  } = {},
): { prof: number; stats: Record<StatKey, number> } {
  // 成長期の上限に届いている子は、この年代のうちは熟練度も能力も伸びない（→ atAgeCeiling）
  if (atAgeCeiling(s)) return { prof: 0, stats: { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 } };
  const coachMult = opts.coachMult ?? 1.0;
  const classFitMult = opts.classFitMult ?? 1.0;
  const gainBase = opts.gainBase ?? STROKE.trainGain;
  const potentialMult = 1 + (youthPotential(s) - 1) * YOUTH_FORM.talentShare;
  // 【疲れていると身につきにくい】系統A（能力練習）と同じ damping を掛ける。
  // これが無いと、泳法練習だけは疲れていても満額入り、
  // 「コマを詰め込むほど得」になってしまう（＝休ませる判断が要らなくなる）。
  const energyRatio = clamp(s.energy / energyMax(s), 0, 1);
  const tired = TRAINING.tiredGainFloor + (1 - TRAINING.tiredGainFloor) * energyRatio;
  const condMult = conditionTrainingMult(conditionLevel(s.condition));
  const env =
    potentialMult *
    tired *
    condMult *
    coachMult *
    classFitMult *
    (opts.specialtyMult ?? 1) *
    (opts.researchMult ?? 1);

  // --- 熟練度。個メは4泳法へ分けて積む
  // 入寮の上乗せは熟練度にだけ掛ける（下の「副産物の能力」には掛けない）
  const dormMult = opts.dormMult ?? 1;
  const targets: StrokeCore[] = stroke === "im" ? [...CORE_STROKES] : [stroke as StrokeCore];
  const share = stroke === "im" ? 1 / CORE_STROKES.length : 1;
  let prof = 0;
  for (const k of targets) {
    prof += raiseStrokeProf(s, k, gainBase * share * env * dormMult);
  }

  // --- 副産物の能力（泳法ごとの寄り）
  const focus = opts.statFocus === false ? {} : (STROKE.statFocus[stroke] ?? {});
  const stats = { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 } as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    const w = focus[k] ?? 0;
    if (w <= 0) continue;
    const cap = statCapOf(s, k);
    // 泳法練習の副産物も「日々の練習」なので、届くのは practiceCapOf まで
    const reach = practiceCapOf(s, k);
    const dim = Math.pow(Math.max(0, 1 - s.stats[k] / cap), DIFFICULTY.dimExponent);
    const gain = STROKE.statGainBase * w * dim * env * talentGrowthOf(s, k);
    if (gain <= 0) continue;
    const before = s.stats[k];
    s.stats[k] = clamp(before + gain, 0, Math.max(reach, before));
    stats[k] = s.stats[k] - before;
  }
  return { prof, stats };
}

/** 1泳法ぶんの熟練度を上げる（才能で伸びと上限が変わる）。戻り値は実際に増えた量。 */
export function raiseStrokeProf(s: Student, stroke: StrokeCore, amount: number): number {
  const cap = strokeCapOf(s, stroke);
  const cur = clamp(s.strokeProf[stroke] ?? 0, 0, STROKE.max);
  if (cur >= cap) return 0;
  // 上限に近づくほど鈍る。得意（登録）種目は少し伸びやすい
  const dim = Math.pow(Math.max(0, 1 - cur / cap), STROKE.dimExponent);
  const favBonus = stroke === s.fav.stroke ? STROKE.favGrowth : 1;
  const gain = amount * dim * favBonus * strokeGrowthOf(s, stroke);
  const next = clamp(cur + gain, 0, Math.min(cap, STROKE.max));
  s.strokeProf[stroke] = next;
  return next - cur;
}

/**
 * 大会で泳いだぶんの熟練度（練習よりまとまって上がる）。
 * 個人メドレーの種目は4泳法へ分けて積む。
 */
export function addMeetStrokeProf(s: Student, stroke: Stroke, amount: number): number {
  const targets: StrokeCore[] = stroke === "im" ? [...CORE_STROKES] : [stroke as StrokeCore];
  const share = stroke === "im" ? 1 / CORE_STROKES.length : 1;
  let total = 0;
  for (const k of targets) total += raiseStrokeProf(s, k, amount * share);
  return total;
}

/**
 * スクール生（幼児/学童）の全体練習を1回。
 * 練習は選択できず、全能力が均等・低速に上がる（成長スピードは遅い）。
 * 才能（伸びしろ）とコーチ支援は薄く効くが、偏り・トレードオフはない。
 * 戻り値は各ステータスの上昇量（演出で「+1」を出すのに使う）。
 */
export function applySchoolPractice(
  s: Student,
  opts: { coachMult?: number; gainBase?: number } = {},
): Record<StatKey, number> {
  const coachMult = opts.coachMult ?? 1.0;
  // クラス倍率（幼児 < 学童）と全体の難易度をここでも掛ける
  const cls = CLASS_TRAINING[s.classId] ?? { growth: 1, fatigue: 1 };
  const gainBase = (opts.gainBase ?? PRACTICE.schoolGainBase) * DIFFICULTY.growthScale * cls.growth;
  const ceiling = atAgeCeiling(s);
  const delta = { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 } as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    const cap = statCapOf(s, k);
    const dim = Math.pow(Math.max(0, 1 - s.stats[k] / cap), TRAINING.dimExponent);
    // 才能はごく薄く反映（均等成長を保つため 0.5 に寄せる）
    const talentMix = 0.5 + 0.5 * s.talent[k];
    // 【スクールの取り柄】フォームに寄せて伸ばす（→ CLASS_FOCUS）。
    // 幼少期のフォームはそのまま将来性（youthPotential）になるので、
    // 「幼児・学童でしっかり形を作る」ことが中学以降の伸びに効いてくる。
    const focus = CLASS_FOCUS[s.classId]?.[k] ?? 1;
    const before = s.stats[k];
    // 成長期の上限に届いている子は、この年代のうちは伸びない（→ atAgeCeiling）
    const add = ceiling ? 0 : gainBase * focus * dim * talentMix * coachMult;
    s.stats[k] = clamp(s.stats[k] + add, 0, cap);
    delta[k] = s.stats[k] - before;
    s.trainCount[k] += 1; // 才能等級が見えてくる（均等に鍛えるため全種で進む）
  }
  // 得意泳法の熟練度も薄く伸びる（能力の寄りは付けない。上で5能力を伸ばしたばかりなので）
  applyStrokeTraining(s, s.fav.stroke, {
    gainBase: PRACTICE.schoolStrokeGain,
    coachMult,
    statFocus: false,
  });
  // スクール生も体力を使う（幼児はいちばん軽い）。1コマで使い切らない程度。
  s.energy = Math.max(0, s.energy - PRACTICE.schoolEnergyCost * cls.fatigue);
  // 観察度も少し進む
  s.growthObserved = Math.min(100, s.growthObserved + COACH.observePerTrain * 0.5);
  raiseRecoveryNeed(s); // スクール生も疲れる（回復設備を使いに行く対象になる）
  updateYouthForm(s); // スクール生＝幼少期。ここで作ったフォームが将来性になる
  return delta;
}

// ------------------------------------------------------------------ 練習メニューの解決

/**
 * その選手が実際に行う練習メニュー。
 * 個人指定（planMode="self"）があればそれが最優先。無ければクラスの全体練習に従う。
 * classPlan が未設定のクラスでは、従来どおり各自の plan を使う。
 */
export function effectivePlan(s: Student, classPlan: PracticePlan | null | undefined): ResolvedPlan {
  const plan = s.planMode === "self" ? s.plan : classPlan ?? s.plan;
  // 「スタイル1」はここで本人の得意種目に置き換える。
  // これより下（練習の適用・表示）は、いつも実在する泳法だけを見ればよくなる。
  return { ability: plan.ability, stroke: resolveStroke(s, plan.stroke) };
}


// ------------------------------------------------------------------ 才能の抽選（二段階）

/**
 * 【1段目】その子のレア度（才能の総量）を1回だけ引く。
 * 重みがそのまま出現率になるので、「1000人に1人」を config に直接書ける。
 */
function rollTalentTier(rand: () => number): (typeof TALENT_ROLL.tiers)[number] {
  const total = TALENT_ROLL.tiers.reduce((n, t) => n + t.weight, 0);
  let r = rand() * total;
  for (const t of TALENT_ROLL.tiers) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TALENT_ROLL.tiers[TALENT_ROLL.tiers.length - 1];
}

/**
 * 【2段目】どの能力に才能が付くかを決める。
 *
 * 得意種目に寄せる（→ TALENT_ROLL.favBias）。短距離の子はスピード・スタート、
 * 長距離の子は持久力・ターンから先に埋まるので、「短距離が得意なのに持久力だけ天才」
 * のようなちぐはぐな選手が出にくい。フォームはどの子にも付きうる土台の能力。
 */
function talentPriority(rand: () => number, fav: RaceEvent): StatKey[] {
  const sprint = fav.distance <= 100;
  const distance = fav.distance >= 400;
  const favored: StatKey[] = sprint
    ? ["speed", "start", "form"]
    : distance
      ? ["stamina", "turn", "form"]
      : ["form", "speed", "stamina"];
  // 得意方向を前に置きつつ、favBias の確率でしか従わない（ときどき意外な才能が出る）
  const rest = STAT_KEYS.filter((k) => !favored.includes(k));
  const pool = [...favored, ...rest];
  const out: StatKey[] = [];
  const left = [...pool];
  while (left.length > 0) {
    const useFav = rand() < TALENT_ROLL.favBias;
    const i = useFav ? 0 : Math.floor(rand() * left.length);
    out.push(left.splice(Math.min(i, left.length - 1), 1)[0]);
  }
  return out;
}

/** 範囲から1つ引く（両端を含む整数）。 */
function pickCount(rand: () => number, range: readonly [number, number]): number {
  const [lo, hi] = range;
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/**
 * 才能を二段階で決める。
 *
 * 1段目：レア度（ずば抜けた能力を何個・どのランクで持つか）
 * 2段目：どの能力に付くか。残りの能力は「ふつうの山」（restWeights）から引く
 *
 * @returns rank＝能力ごとの才能ランク／talent＝そのランクの伸びしろ倍率
 */
export function rollTalent(
  rand: () => number,
  fav: RaceEvent,
  gifted = false,
): { rank: Record<StatKey, TalentRankId>; talent: Record<StatKey, number>; tier: string } {
  // 1段目：レア度。「才能ある子」として作るときは、一般より上のレア度を引き直す
  let tier = rollTalentTier(rand);
  if (gifted) {
    for (let i = 0; i < 6 && tier.id === "common"; i++) tier = rollTalentTier(rand);
  }

  // 2段目：まず「ふつうの山」で全部を埋めてから、ずば抜けた能力を上書きする
  const rank = {} as Record<StatKey, TalentRankId>;
  for (const k of STAT_KEYS) rank[k] = pickRestRank(rand);

  const order = talentPriority(rand, fav);
  const n = pickCount(rand, tier.count);
  for (let i = 0; i < n && i < order.length; i++) rank[order[i]] = tier.top;

  // 伸びしろ倍率はランクから引く（同じランクなら同じ速さ＝表示と食い違わない）
  const talent = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) talent[k] = TALENT.growthMult[rank[k]];
  return { rank, talent, tier: tier.id };
}

/** ずば抜けた能力**以外**の才能ランクを1つ引く（C を山にした重み → TALENT_ROLL.restWeights）。 */
function pickRestRank(rand: () => number): TalentRankId {
  const w = TALENT_ROLL.restWeights;
  const keys = Object.keys(w) as TalentRankId[];
  const total = keys.reduce((n, k) => n + (w[k] ?? 0), 0);
  let r = rand() * total;
  for (const k of keys) {
    r -= w[k] ?? 0;
    if (r <= 0) return k;
  }
  return "C";
}

// ------------------------------------------------------------------ 生成

const FAMILY = ["佐藤", "鈴木", "高橋", "田中", "渡辺", "伊藤", "山本", "中村", "小林", "加藤", "吉田", "山田"];
const GIVEN = ["はると", "ゆい", "そうた", "あおい", "みなと", "ひなた", "りく", "つむぎ", "ゆうと", "さくら", "かなで", "いつき"];

/** クラスごとの学年候補（初期ステータスの目安は GEN.classBase）。 */
const CLASS_GRADES: Record<ClassId, string[]> = {
  youji: ["年少", "年中", "年長"],
  gakudo: ["小1", "小2", "小3", "小4", "小5", "小6"],
  ikuseiB: ["小3", "小4", "小5", "小6"],
  ikuseiA: ["小5", "小6", "中1", "中2", "中3"],
  senshu: ["中2", "中3", "高1", "高2", "高3"],
  pro: ["大1", "大2", "社会人"],
};

/** 才能ある子に付きやすい（伸びしろの良い）成長タイプ。 */
const GIFTED_GROWTH: readonly GrowthType[] = ["early", "late", "sustained", "normal"];

export interface StudentGenOptions {
  /** true にすると才能ある子として生成（初期値ではなく成長タイプ＋伸びしろが優秀）。 */
  gifted?: boolean;
}

/**
 * 選手を1人生成する。rand は 0..1 の乱数を返す関数（Phaser非依存にするため注入）。
 * スクール生は標準記録スケール上で「かなり下」からスタート。大半はトップに届かない。
 * まれに才能ある子（成長タイプ＋才能が優秀）が出る。
 */
export function createStudent(
  rand: () => number,
  id: number,
  classId: ClassId,
  opts: StudentGenOptions = {},
): Student {
  const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  const gifted = opts.gifted || rand() < GEN.giftedChance;

  // 【泳法の才能を先に決める】どの泳法に向いているかは生まれつき。
  // 登録種目（fav）は、その才能に沿って選ぶ——「向いている泳法から始める」だけで、
  // 実際に得意になるかは、そのあと熟練度をどれだけ積むかで決まる（→ strokeExecution）。
  const strokeTalent = rollStrokeTalent(rand);
  const topStroke = CORE_STROKES.reduce((a, b) => (strokeTalent[a] >= strokeTalent[b] ? a : b));
  // たまに個人メドレーを登録種目にする子もいる（4泳法をまんべんなく育てる道）
  const stroke: Stroke = rand() < GEN.imFavChance ? "im" : topStroke;
  const distance = pick(STROKE_DISTANCES[stroke]);
  const fav: RaceEvent = { stroke, distance };

  const base = GEN.classBase[classId];
  const mkStat = (bias = 0): number =>
    clamp(base + bias + between(-GEN.statJitter, GEN.statJitter), GEN.statMin, GEN.statMax);

  const stats: Record<StatKey, number> = {
    speed: mkStat(),
    stamina: mkStat(),
    form: mkStat(GEN.formBias), // 土台は少し高めスタート
    start: mkStat(),
    turn: mkStat(),
  };

  // 才能（二段階抽選）。まずレア度、それからどの能力に付くかを決める（→ rollTalent）。
  const { rank: talentRank, talent } = rollTalent(rand, fav, gifted);

  // 【才能のある能力は初期値も高い】◎〇が付いた能力は、最初から少し得意な状態で入団する。
  // 「この子はスピードの子だ」が、鍛える前の数字を見ただけでも何となく伝わるようにするため。
  for (const k of STAT_KEYS) {
    const bonus = TALENT.startBonus[talentRank[k]] ?? 0;
    if (bonus > 0) stats[k] = clamp(stats[k] + bonus, GEN.statMin, GEN.statMax);
  }

  const zero: Record<StatKey, number> = { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 };
  // 熟練度：才能のある泳法ほど、少しだけ積んだ状態で入ってくる（0〜999のうちのごく序盤）。
  // im の欄は使わない（4泳法の平均で表す → strokeProfOf）。
  const strokeProf: Record<Stroke, number> = { free: 0, back: 0, breast: 0, fly: 0, im: 0 };
  for (const k of CORE_STROKES) {
    strokeProf[k] = between(GEN.strokeProfStart[0], GEN.strokeProfStart[1]) * strokeTalent[k];
  }
  if (stroke !== "im") strokeProf[stroke] += between(GEN.strokeProfFav[0], GEN.strokeProfFav[1]);

  const s: Student = {
    id,
    name: `${pick(FAMILY)} ${pick(GIVEN)}`,
    grade: pick(CLASS_GRADES[classId]),
    gender: rand() < 0.5 ? "m" : "f",
    classId,
    tint: pick([0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xff7fb0]),
    stats,
    talentRank,
    talent,
    trainCount: { ...zero },
    streak: { ...zero },
    strokeProf,
    strokeTalent,
    energy: 0,
    fav,
    // 系統A の初期選択：得意距離に効く能力を既定に。系統B は得意泳法を既定に。
    // 既定は「全体練習に従う」。パネルでメニューを選ぶと個人指定（self）に切り替わる。
    plan: { ability: defaultAbilityFor(fav), stroke },
    planMode: "class",
    practiceAccum: 0,
    restUntilDay: 0,
    recoveryNeed: 0,
    // 入ってきたばかりの子は「ふつう」から始まる（→ sim/satisfaction.ts）
    mood: SATISFACTION.baseline,
    achievePoints: 0,
    bestTimeScore: 0,
    bestTimeSec: 0,
    bestTimeEvent: null,
    rankTier: 1,
    wins: 0,
    // 才能ある子は伸びの良い成長タイプ。そうでなければ完全ランダム。
    growthType: gifted ? pick(GIFTED_GROWTH) : randomGrowthType(rand),
    growthObserved: 0,
    condition: clamp(58 + between(-6, 14), 0, 100), // 普通〜好調で開始
    season: { year: -1, clearedStages: [], standards: [], standardEvents: [] }, // -1: まだ大会の年度を見ていない
    leaveAtMonth: null,
    injuryDays: 0,
    inRehab: false,
    awayDays: 0,
    altitude: null,
    // 幼少期スタートの子は今のフォームが記録の出発点。中学以降で入った子は対象外（0）。
    youthForm: 0,
    inDorm: false,
    pinned: false,
    personalCoachId: null,
    history: [],
    age: 0,
  };
  s.age = estimatedAge(s.grade);
  s.energy = energyMax(s);
  updateYouthForm(s);
  return s;
}

/**
 * 泳法の才能を4つ引く（0〜1）。
 *
 * 一様乱数のままだと「全部そこそこ」の子ばかりになって向き不向きが見えないので、
 * rollCurve で低いほうへ歪めてから、いちばん高い泳法だけさらに上乗せする
 *（＝ひとつ尖った泳法を持つ子が生まれる）。
 */
export function rollStrokeTalent(rand: () => number): Record<StrokeCore, number> {
  const out = {} as Record<StrokeCore, number>;
  for (const k of CORE_STROKES) out[k] = Math.pow(rand(), STROKE.talent.rollCurve);
  const top = CORE_STROKES.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[top] = clamp(out[top] + STROKE.talent.topBonus, 0, 1);
  return out;
}

/** 得意種目に応じた系統Aの既定能力（短距離はスピード、長距離は持久力）。 */
function defaultAbilityFor(fav: RaceEvent): StatKey {
  if (fav.distance <= 100) return "speed";
  if (fav.distance >= 400) return "stamina";
  return "form";
}
