import { PROFILE } from "../config/balance";
import { conditionLevel } from "./condition";
import { growthHintLevel, growthPhaseMultiplier, lifeStageOf, type GrowthType, type LifeStage } from "./growth";
import { rankProgress, RANK_MAX_TIER } from "./rank";
import {
  STAT_LABEL,
  STROKE_LABEL,
  talentRankOf,
  type RaceEvent,
  type StatKey,
  type Student,
} from "./student";

/**
 * 選手カードのプロフィール文（サカつく風）。
 *
 * ランダムな文言ではなく、条件から規則的に組み立てる。同じ状態なら必ず同じ文になり、
 * 状態が変われば文も変わる。文言は下のデータテーブルにまとまっているので、
 * 条件と文を足すだけで表現を増やせる。
 *
 *  1行目：泳ぎの特徴を比喩で（最も突出したステータスから決定）
 *  2行目：格＋得意種目
 *  3行目：成長の状態（成長タイプと年齢から決定）
 *  4行目：持ち味・補足（該当が無ければ省略）
 */

export interface ProfileContext {
  /** クラス平均（「環境が合っていない」の判定に使う）。 */
  classAvg?: number;
  /** 突破済みの参加標準記録があるか。 */
  hasStandard?: boolean;
}

export interface ProfileText {
  lines: string[];
  /** 1行目の根拠になった突出ステータス（強調表示に使える）。 */
  highlight: StatKey;
}

// ------------------------------------------------------------------ 1行目：泳ぎの比喩

/**
 * ステータスごとの比喩。
 * [0]=まだ粗い / [1]=形になってきた / [2]=武器になっている の3段階。
 * 同じ段階の中は選手ごとに固定で選ばれる（毎回変わらない）。
 */
const METAPHOR: Record<StatKey, [string[], string[], string[]]> = {
  speed: [
    ["水をかく力はまだ細いが、前へ出ようとする意志がある。", "序盤から飛び出したがる、気の早い泳ぎ。"],
    ["伸びのあるストロークで、じわりと前に出る。", "水をとらえる感覚が育ってきた泳ぎ。"],
    ["力強いストロークは「水を切る刃」。", "一かきごとに水を置き去りにしていく。"],
  ],
  stamina: [
    ["後半に失速する、まだ線の細い泳ぎ。", "距離が伸びると顔が上がってくる。"],
    ["終盤まで大きく崩れない粘りがある。", "淡々と刻み続けられるタフさがある。"],
    ["終盤に強い泳ぎは「止まらない水車」。", "後半こそ速くなる、底の知れないエンジン。"],
  ],
  form: [
    ["姿勢が起きがちで、水の抵抗を受けている。", "泳ぎに無駄が多く、力が前に伝わらない。"],
    ["水平に伸びた、素直なフォーム。", "抵抗の少ない、整った泳ぎ。"],
    ["一本の線のようなフォームは「水面を滑る板」。", "水の抵抗をほとんど感じさせない美しい泳ぎ。"],
  ],
  start: [
    ["号砲への反応が鈍く、出遅れが目立つ。", "飛び込みで置いていかれることが多い。"],
    ["台の上で落ち着いていられる。", "入水が鋭く、最初の一伸びが効く。"],
    ["台を蹴る一瞬は「放たれた矢」。", "号砲と同時に、もう水中で加速している。"],
  ],
  turn: [
    ["壁際で失速する、もったいない泳ぎ。", "折り返しのたびにリズムを崩す。"],
    ["壁を確実に処理できる堅実さがある。", "折り返しで流れを切らさない。"],
    ["壁を蹴る一瞬は「跳ね返るバネ」。", "折り返しのたびに順位を上げていく。"],
  ],
};

/** 最も突出したステータス（本人の平均からの離れ具合で判定）。 */
export function standoutStat(s: Student): StatKey {
  const keys: StatKey[] = ["speed", "stamina", "form", "start", "turn"];
  const avg = keys.reduce((n, k) => n + s.stats[k], 0) / keys.length;
  let best: StatKey = "form";
  let bestDiff = -Infinity;
  for (const k of keys) {
    const diff = s.stats[k] - avg;
    if (diff > bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return best;
}

/** 絶対値から比喩の段階（0..2）を決める。 */
function metaphorLevel(value: number): 0 | 1 | 2 {
  if (value >= 70) return 2;
  if (value >= 40) return 1;
  return 0;
}

// ------------------------------------------------------------------ 2行目：格＋得意種目

/** 格ごとの言い回し（RANK.tiers の呼称を、文の中で使える形にしたもの）。 */
const TIER_PHRASE: readonly string[] = [
  "どこにでもいる",
  "クラブで期待される",
  "地域で名の知れた",
  "県を代表する",
  "日本を代表する",
  "世界屈指の",
  "世界トップクラスの",
  "神の領域に達した",
];

/** 「次の格に手が届きかけている」ときの言い回し（添字＝目指している格）。 */
const APPROACH_PHRASE: Record<number, string> = {
  2: "クラブでの期待が高まる",
  3: "地域で名が知られはじめた",
  4: "県内でも指折りの",
  5: "日本の舞台が見えてきた",
  6: "世界が視野に入りはじめた",
  7: "世界トップに手が届きかけている",
  8: "神の領域に近づく",
};

/** 得意種目 → 「〜スプリンター」「〜の長距離スイマー」など。 */
export function eventNoun(fav: RaceEvent): string {
  if (fav.stroke === "im") return "個人メドレーヤー";
  const stroke = STROKE_LABEL[fav.stroke];
  if (fav.distance <= 100) return `${stroke}スプリンター`;
  if (fav.distance >= 400) return `${stroke}の長距離スイマー`;
  return `${stroke}のスイマー`;
}

// ------------------------------------------------------------------ 3行目：成長の状態

type GrowthPhase = "potential" | "peak" | "declining" | "done";

const STAGE_SEQ: readonly LifeStage[] = ["preschool", "elementary", "middle", "high", "adult"];

/** 成長タイプ×年齢から、今どの段階にいるかを判定する。 */
export function growthPhaseOf(type: GrowthType, grade: string): GrowthPhase {
  const stage = lifeStageOf(grade);
  const i = STAGE_SEQ.indexOf(stage);
  const now = growthPhaseMultiplier(type, stage);
  const laterStages = STAGE_SEQ.slice(i + 1);
  const ahead = laterStages.length === 0 ? 0 : Math.max(...laterStages.map((st) => growthPhaseMultiplier(type, st)));

  if (ahead > now * PROFILE.aheadRatioForPotential) return "potential";
  if (now < PROFILE.declinedPhaseMult) return "done";
  if (ahead >= now * 0.85) return "peak";
  return "declining";
}

/**
 * 成長の状態の文。
 * 同じ「伸びしろが大きい」でも、成長タイプによって言い回しが変わる。
 */
const GROWTH_LINE: Record<GrowthPhase, Partial<Record<GrowthType, string[]>> & { default: string[] }> = {
  potential: {
    default: ["まだ伸びしろは大きく、これからが楽しみ。", "これから伸びる時期を迎える。"],
    late: ["今は平凡だが、伸びるのはこれから先。焦らず育てたい。", "大器晩成型らしく、まだ本領を現していない。"],
    sustained: ["派手さはないが、長く伸び続けられる下地がある。", "急がずとも、積み上げただけ返ってくる。"],
    superEarly: ["今まさに伸び盛り。この時期を逃したくない。", "早い時期に一気に来るタイプ。今が勝負どころ。"],
  },
  peak: {
    default: ["ちょうど今が伸び盛りで、鍛えただけ返ってくる。", "成長曲線の頂点にいる。"],
    early: ["伸び盛りの真っただ中。一気に押し上げたい。"],
    sustained: ["緩やかだが、着実に積み上がり続けている。"],
  },
  declining: {
    default: ["以前よりも成長は落ちてきたが、泳ぎに円熟味が増している。", "伸びは鈍ってきたが、泳ぎの精度は増している。"],
    superEarly: ["早くに完成してしまい、ここからの上積みは小さい。", "ピークを過ぎ、伸びよりも維持が課題になってきた。"],
    early: ["伸び盛りは過ぎたが、身につけたものは失っていない。"],
  },
  done: {
    default: [
      "成長こそ望めないが、ベテランらしいレース運びでその分を補っている。",
      "ここから能力が伸びることはないが、経験がその穴を埋めている。",
    ],
    sustained: ["伸びは止まったが、衰えも遅い。長く戦える。"],
  },
};

/** 観察度が低いうちに使う、当たり障りのない言い回し（PROFILE.respectHiddenGrowth 用）。 */
const UNKNOWN_GROWTH_LINE = ["伸び方はまだ読み切れない。", "どう育つかは、これから見えてくる。"];

// ------------------------------------------------------------------ 4行目：持ち味・補足

const CONDITION_LINE: Record<string, string[]> = {
  peak: ["今は体が軽く、何をやってもうまくいく時期。"],
  tired: ["疲れが抜けきっておらず、本来の泳ぎができていない。"],
  poor: ["調子を落としており、本調子には遠い。"],
};

// ------------------------------------------------------------------ 組み立て

/** 選手ごとに固定の選択（同じ状態なら毎回同じ文になる）。 */
function pickFixed<T>(arr: readonly T[], id: number, salt: number): T {
  if (arr.length === 0) throw new Error("empty");
  const h = Math.abs(Math.imul(id + salt * 7919, 2654435761) >>> 0);
  return arr[h % arr.length];
}

function line1(s: Student, highlight: StatKey): string {
  const level = metaphorLevel(s.stats[highlight]);
  return pickFixed(METAPHOR[highlight][level], s.id, 1 + level);
}

function line2(s: Student): string {
  const p = rankProgress(s);
  const noun = eventNoun(s.fav);
  // 次の格に手が届きかけているときは「〜に近づく」表現にする
  if (p.tier < RANK_MAX_TIER && p.ratio >= PROFILE.approachRatio) {
    const phrase = APPROACH_PHRASE[p.tier + 1];
    if (phrase) return `${phrase}${noun}。`;
  }
  return `${TIER_PHRASE[p.tier - 1]}${noun}。`;
}

function line3(s: Student): string {
  if (PROFILE.respectHiddenGrowth && growthHintLevel(s.growthObserved) === 0) {
    return pickFixed(UNKNOWN_GROWTH_LINE, s.id, 5);
  }
  const phase = growthPhaseOf(s.growthType, s.grade);
  const table = GROWTH_LINE[phase];
  const arr = table[s.growthType] ?? table.default;
  return pickFixed(arr, s.id, 3);
}

function line4(s: Student, ctx: ProfileContext): string | null {
  // 優先度の高い順に、当てはまった1つだけを出す（無ければ省略）
  if (s.wins > 0) {
    return s.wins >= 5
      ? "幾度も表彰台の頂点に立ってきた、勝ち方を知る選手。"
      : "大舞台で勝った経験を持っている。";
  }
  if (ctx.hasStandard) return "すでに参加標準記録を突破しており、全国の舞台が視野に入っている。";

  const level = conditionLevel(s.condition);
  const cond = CONDITION_LINE[level];
  if (cond) return pickFixed(cond, s.id, 4);

  // 才能ランクがずば抜けている能力（S 以上）
  for (const k of ["speed", "stamina", "form", "start", "turn"] as StatKey[]) {
    const r = talentRankOf(s, k);
    if (r === "S" || r === "SS") {
      return `${STAT_LABEL[k]}の才能は本物で、鍛えるほどに応えてくる。`;
    }
  }

  // 泳法の熟練度が高い＝その泳ぎの専門家
  const prof = s.strokeProf[s.fav.stroke] ?? 0;
  if (prof >= PROFILE.strokeProfMastery) {
    return `${STROKE_LABEL[s.fav.stroke]}を磨き込んできた専門家。`;
  }

  // 環境が合っていない（クラス平均を大きく上回っている）
  if (ctx.classAvg != null) {
    const own = (s.stats.speed + s.stats.stamina + s.stats.form + s.stats.start + s.stats.turn) / 5;
    if (own - ctx.classAvg > 10) return "今の環境では物足りなさそうにしている。";
    if (ctx.classAvg - own > 10) return "周りについていくだけで精一杯に見える。";
  }

  if (s.stats.form < 35) return "フォームが崩れており、持ち味を活かしきれていない。";
  return null;
}

/** 4行構成のプロフィール文を組み立てる（4行目は該当が無ければ省略）。 */
export function buildProfile(s: Student, ctx: ProfileContext = {}): ProfileText {
  const highlight = standoutStat(s);
  const lines = [line1(s, highlight), line2(s), line3(s)];
  const extra = line4(s, ctx);
  if (extra) lines.push(extra);
  return { lines, highlight };
}
