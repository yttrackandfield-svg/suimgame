import { RESEARCH, type ResearchTopicConfig } from "../config/balance";
import type { StatKey, Stroke } from "./student";

/**
 * 研究（会議室）。
 *
 * 会議室を建てると、担当時間外のコーチを研究に回せるようになる。
 * 研究にはテーマごとに期間（研究ポイント）と費用がかかり、
 * 参加コーチの人数と質が高いほど早く終わる。
 * 完了するとクラブ全体に恒久的な効果が付く（選手の入れ替わりでは消えない）。
 *
 * 「指導に専念させるか、研究に回すか」という判断を作るのが目的。
 * 効果量・期間・費用はすべて config/balance.ts の RESEARCH.topics。
 */

export type ResearchId = string;

export interface ResearchTopic extends ResearchTopicConfig {
  /** 効果の要約（一覧に出す1行）。 */
  summary: string;
}

const STAT_LABEL_MIN: Record<string, string> = {
  speed: "スピード",
  stamina: "持久力",
  form: "フォーム",
  start: "スタート",
  turn: "ターン",
};

const STROKE_LABEL_MIN: Record<string, string> = {
  free: "自由形",
  back: "背泳ぎ",
  breast: "平泳ぎ",
  fly: "バタフライ",
  im: "個人メドレー",
};

const pct = (v: number): string => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

/** 効果を1行の日本語にする（「どこに効いているか」を見せるため）。 */
export function effectSummary(t: ResearchTopicConfig): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(t.effect.stat ?? {})) {
    if (v) parts.push(`${STAT_LABEL_MIN[k] ?? k}の成長 ${pct(v)}`);
  }
  for (const [k, v] of Object.entries(t.effect.stroke ?? {})) {
    if (v) parts.push(`${STROKE_LABEL_MIN[k] ?? k}の伸び ${pct(v)}`);
  }
  if (t.effect.train) parts.push(`練習効率 ${pct(t.effect.train)}`);
  if (t.effect.conditionRecover) parts.push(`日々の回復 ${pct(t.effect.conditionRecover)}`);
  if (t.effect.injury) parts.push(`故障率 ${pct(t.effect.injury)}`);
  if (t.effect.recovery) parts.push(`回復設備の効果 ${pct(t.effect.recovery)}`);
  if (t.effect.talent) parts.push(`才能ある子の出現 ${pct(t.effect.talent)}`);
  if (t.effect.observe) parts.push(`成長タイプの見抜き ${pct(t.effect.observe)}`);
  return parts.join(" / ") || "－";
}

export const RESEARCH_TOPICS: readonly ResearchTopic[] = RESEARCH.topics.map((t) => ({
  ...t,
  summary: effectSummary(t),
}));

const BY_ID = new Map<ResearchId, ResearchTopic>(RESEARCH_TOPICS.map((t) => [t.id, t]));

export function researchTopic(id: ResearchId): ResearchTopic | undefined {
  return BY_ID.get(id);
}

/**
 * 進行中の研究（会議室1部屋につき1件）。
 *
 * roomId … どの会議室で進めているか（部屋を撤去したら止まる）
 * coachIds … 研究班。**RESEARCH.groupSize 人そろって初めて進む**
 * targetLevel … いま目指しているレベル（現在のレベル+1）
 */
export interface ResearchProject {
  roomId: number;
  id: ResearchId;
  /** 貯まった研究ポイント。 */
  progress: number;
  /** 研究班のコーチID。 */
  coachIds: number[];
  /** このプロジェクトで到達を目指すレベル。 */
  targetLevel: number;
}

/** 後方互換（v14 までの「同時に1つだけ」の形）。 */
export interface ActiveResearch {
  id: ResearchId;
  progress: number;
}

/** テーマごとの到達レベル（0＝まだ研究していない）。 */
export type ResearchLevels = Record<ResearchId, number>;

/** 月替わりに1件ぶん返る、研究の結末（月次レポートと演出に使う）。 */
export interface ResearchOutcome {
  id: ResearchId;
  label: string;
  /** 目指していたレベル（成功ならこのレベルに到達した）。 */
  level: number;
  success: boolean;
  /** 研究班の顔ぶれ（指導力が伸びた人たち）。 */
  members: string[];
}

// ------------------------------------------------------------------ レベル

/** そのテーマのいまのレベル。 */
export function levelOf(levels: ResearchLevels, id: ResearchId): number {
  return Math.max(0, Math.floor(levels[id] ?? 0));
}

/** もうこれ以上レベルを上げられないか。 */
export function isMaxLevel(level: number): boolean {
  return level >= RESEARCH.maxLevel;
}

/**
 * レベル L を目指すときの費用。
 * Lv1（初めて）は素の cost、そこから1段ごとに levelCostGrowth 倍。
 */
export function researchCostFor(topic: ResearchTopic, targetLevel: number): number {
  const step = Math.max(0, targetLevel - 1);
  return Math.round(topic.cost * RESEARCH.costMult * Math.pow(RESEARCH.levelCostGrowth, step));
}

/** レベル L を目指すときに必要な研究ポイント。 */
export function researchPointsFor(topic: ResearchTopic, targetLevel: number): number {
  const step = Math.max(0, targetLevel - 1);
  return Math.round(topic.points * Math.pow(RESEARCH.levelPointGrowth, step));
}

/**
 * レベル L を目指すときの失敗率。
 *
 * Lv1 は必ず成功する（最初の一歩でつまずかせない）。
 * Lv2 以降は1段ごとに failPerLevel ずつ増え、**研究班の平均指導力で軽減される**
 * ＝良いコーチを育てるほど、高いレベルに手が届くようになる。
 */
export function researchFailChance(targetLevel: number, avgTeaching = 0): number {
  const step = Math.max(0, targetLevel - 1);
  if (step <= 0) return 0;
  const base = RESEARCH.failPerLevel * step;
  const relief = 1 - (Math.max(0, Math.min(100, avgTeaching)) / 100) * RESEARCH.failTeachReduce;
  return Math.max(RESEARCH.failMin, base * relief);
}

/**
 * 完了した研究をまとめた、クラブ全体に効く補正。
 * 練習・回復・入会のあちこちから参照する。
 */
export interface ResearchBonus {
  /** ステータス別の成長倍率（1.0＝効果なし）。 */
  stat: Record<StatKey, number>;
  /** 泳法別の伸び倍率。 */
  stroke: Record<Stroke, number>;
  /** すべての練習に乗る倍率。 */
  train: number;
  /** 日々のコンディション回復の倍率。 */
  conditionRecover: number;
  /** 故障確率の倍率（小さいほど故障しにくい）。 */
  injury: number;
  /** 回復設備の回復量の倍率。 */
  recovery: number;
  /** 才能ある子の出現率の倍率。 */
  talent: number;
  /** 観察度の倍率。 */
  observe: number;
}

export function emptyResearchBonus(): ResearchBonus {
  return {
    stat: { speed: 1, stamina: 1, form: 1, start: 1, turn: 1 },
    stroke: { free: 1, back: 1, breast: 1, fly: 1, im: 1 },
    train: 1,
    conditionRecover: 1,
    injury: 1,
    recovery: 1,
    talent: 1,
    observe: 1,
  };
}

/**
 * テーマごとの到達レベルから、実際に効いている補正を組み立てる。
 * **効果はレベルに比例する**（Lv3 なら素の効果の3倍）。
 */
export function researchBonusOf(levels: ResearchLevels): ResearchBonus {
  const b = emptyResearchBonus();
  for (const [id, lvRaw] of Object.entries(levels)) {
    const t = BY_ID.get(id);
    const lv = Math.max(0, Math.floor(lvRaw ?? 0));
    if (!t || lv <= 0) continue;
    for (const [k, v] of Object.entries(t.effect.stat ?? {})) {
      if (v) b.stat[k as StatKey] = (b.stat[k as StatKey] ?? 1) + v * lv;
    }
    for (const [k, v] of Object.entries(t.effect.stroke ?? {})) {
      if (v) b.stroke[k as Stroke] = (b.stroke[k as Stroke] ?? 1) + v * lv;
    }
    if (t.effect.train) b.train += t.effect.train * lv;
    if (t.effect.conditionRecover) b.conditionRecover += t.effect.conditionRecover * lv;
    if (t.effect.injury) b.injury = Math.max(0.1, b.injury + t.effect.injury * lv);
    if (t.effect.recovery) b.recovery += t.effect.recovery * lv;
    if (t.effect.talent) b.talent += t.effect.talent * lv;
    if (t.effect.observe) b.observe += t.effect.observe * lv;
  }
  return b;
}

/** そのレベルでの効果の要約（一覧に出す1行）。 */
export function effectSummaryAt(t: ResearchTopicConfig, level: number): string {
  const lv = Math.max(1, level);
  const scaled: ResearchTopicConfig = {
    ...t,
    effect: {
      stat: Object.fromEntries(Object.entries(t.effect.stat ?? {}).map(([k, v]) => [k, (v ?? 0) * lv])),
      stroke: Object.fromEntries(Object.entries(t.effect.stroke ?? {}).map(([k, v]) => [k, (v ?? 0) * lv])),
      train: (t.effect.train ?? 0) * lv || undefined,
      conditionRecover: (t.effect.conditionRecover ?? 0) * lv || undefined,
      injury: (t.effect.injury ?? 0) * lv || undefined,
      recovery: (t.effect.recovery ?? 0) * lv || undefined,
      talent: (t.effect.talent ?? 0) * lv || undefined,
      observe: (t.effect.observe ?? 0) * lv || undefined,
    },
  } as ResearchTopicConfig;
  return effectSummary(scaled);
}

/** 研究班1人ぶんの情報（進捗の計算に使う）。 */
export interface ResearchMember {
  quality: number;
  teaching: number;
}

/**
 * 1つの研究班が1ヶ月に進めるポイント。
 * **人数が groupSize に満たなければ 0**（班が揃うまで研究は始まらない・進まない）。
 * 会議室が多いほど資料が揃うので、少しだけ速くなる。
 */
export function monthlyResearchPoints(members: readonly ResearchMember[], rooms: number): number {
  if (rooms <= 0) return 0;
  if (members.length < RESEARCH.groupSize) return 0;
  const base = members.reduce(
    (n, m) =>
      n +
      RESEARCH.pointsPerCoach +
      m.quality * RESEARCH.pointsPerQuality +
      (Math.max(0, Math.min(100, m.teaching)) / 100) * RESEARCH.pointsPerTeach,
    0,
  );
  return base * (1 + Math.max(0, rooms - 1) * RESEARCH.roomBonus);
}

/** 完了までの残り月数の見込み（0以下なら今月中に終わる）。 */
export function monthsRemaining(needPoints: number, progress: number, perMonth: number): number | null {
  if (perMonth <= 0) return null; // 班が揃っていない＝進まない
  return Math.max(0, Math.ceil((needPoints - progress) / perMonth));
}

/** 研究の開始費用（後方互換：Lv1 ぶん）。 */
export function researchCost(topic: ResearchTopic): number {
  return researchCostFor(topic, 1);
}
