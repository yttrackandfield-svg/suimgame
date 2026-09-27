import type { Gender, RaceEvent, Stroke } from "../sim/student";
import type { LifeStage } from "../sim/growth";

/**
 * 参加標準記録テーブル。
 * japanOpen は実データ（ジャパンオープン参加標準記録, 男女別）を実装済み。
 * これを「トップレベルの基準点」として能力値→タイム算出のアンカーに使う。
 *
 * ★後から差し替え/追記する箇所★
 *  - im-100（100m個人メドレー）は一覧に無いため未設定（null）。後で実数を入れる。
 *  - nihonSenshuken / jo は枠だけ（全 null）。実数が来たら差し込む。
 *  - 未設定は effectiveStandard() が仮値で暫定運用（provisional=true）。
 */

export type StandardKey =
  | "shogaku"
  | "zenchu"
  | "interhigh"
  | "japanOpen"
  | "nihonSenshuken"
  | "jo";

export const STANDARD_LABEL: Record<StandardKey, string> = {
  shogaku: "小学生 標準記録",
  zenchu: "全中 標準記録",
  interhigh: "インターハイ 標準記録",
  // ジャパンオープンという大会は無くなったが、この表は
  // **能力→タイムの基準アンカー**であり、日本選手権の一段下の目標としても残してある
  japanOpen: "全国標準記録",
  nihonSenshuken: "参加標準記録（日本選手権）",
  jo: "（廃止）ジュニアオリンピック 標準記録",
};

/** 短い見出し（種目の横に添える用）。 */
export const STANDARD_SHORT: Record<StandardKey, string> = {
  shogaku: "小学生標準",
  zenchu: "全中標準",
  interhigh: "IH標準",
  japanOpen: "全国標準",
  nihonSenshuken: "参加標準",
  jo: "（廃止）",
};

/** 男女別タイム（秒）。null=未設定。 */
export interface GenderTimes {
  m: number | null;
  f: number | null;
}

const g = (m: number | null, f: number | null): GenderTimes => ({ m, f });

/**
 * ▼ ジャパンオープン参加標準記録（実データ）。単位＝秒。
 *   例）2:03.16 → 123.16、8:12.89 → 492.89
 */
const JAPAN_OPEN: Record<string, GenderTimes> = {
  "free-50": g(22.98, 25.95),
  "free-100": g(50.3, 56.66),
  "free-200": g(110.69, 123.16),
  "free-400": g(236.01, 260.39),
  "free-800": g(492.89, 537.08),
  "free-1500": g(940.37, 1034.83),
  "back-50": g(26.29, 29.53),
  "back-100": g(56.24, 63.0),
  "back-200": g(122.73, 136.28),
  "breast-50": g(28.35, 32.91),
  "breast-100": g(62.12, 70.59),
  "breast-200": g(134.35, 150.39),
  "fly-50": g(24.47, 27.6),
  "fly-100": g(53.96, 60.85),
  "fly-200": g(120.92, 134.87),
  "im-100": g(null, null), // ★一覧に無し。後で実数を追加する枠。
  "im-200": g(123.71, 138.21),
  "im-400": g(265.15, 292.54),
};


/**
 * ▼ 学年段階ごとの標準記録（小学生・全中・インターハイ）。単位＝秒。
 *
 * 【なぜ3段に分けるか】同じ「標準記録」でも、小学生と高校生では意味がまるで違う。
 * 育てている子の学年に合った目標が出ていないと、
 * 「あと何秒縮めればいいのか」が分からず、大会に出す意味が薄くなる。
 *  小学生（11〜12歳）→ 全中 → インターハイ、と段が上がるたびに壁が厚くなる。
 *
 * 表の数字は**男子**。女子はジャパンオープンの男女差（種目ごとの実測比）を掛けて出す
 *（→ femaleOf）。種目によって男女差は違うので、一律の係数にはしない。
 *
 * 小学生に「—」の種目（400自由形・200背泳ぎ・200平泳ぎ・200バタフライ・400個メ）は
 * 標準記録そのものが無い＝**その学年ではまだ挑めない種目**として null にしてある。
 */
const SCHOOL_MALE: Record<"shogaku" | "zenchu" | "interhigh", Record<string, number | null>> = {
  // 小学生（11〜12歳）
  shogaku: {
    "free-50": 27.11,
    "free-100": 59.22,
    "free-200": 128.8,
    "free-400": null,
    "back-100": 67.66,
    "back-200": null,
    "breast-100": 74.34,
    "breast-200": null,
    "fly-100": 64.81,
    "fly-200": null,
    "im-200": 144.78,
    "im-400": null,
  },
  // 中学生（全国中学＝全中）
  zenchu: {
    "free-50": 25.79,
    "free-100": 55.89,
    "free-200": 121.44,
    "free-400": 257.2,
    "back-100": 62.69,
    "back-200": 135.15,
    "breast-100": 69.09,
    "breast-200": 148.69,
    "fly-100": 59.6,
    "fly-200": 132.24,
    "im-200": 136.82,
    "im-400": 291.41,
  },
  // 高校生（インターハイ）
  interhigh: {
    "free-50": 24.26,
    "free-100": 52.66,
    "free-200": 114.61,
    "free-400": 243.19,
    "back-100": 58.83,
    "back-200": 128.2,
    "breast-100": 64.99,
    "breast-200": 139.98,
    "fly-100": 56.0,
    "fly-200": 124.05,
    "im-200": 126.94,
    "im-400": 272.98,
  },
};

/**
 * 男子タイムから女子タイムを出す。
 * ジャパンオープンの男女比（種目ごと）をそのまま使う。比が取れない種目は 1.12。
 */
function femaleOf(key: string, male: number): number {
  const jo = JAPAN_OPEN[key];
  const ratio = jo && jo.m != null && jo.f != null ? jo.f / jo.m : 1.12;
  return Math.round(male * ratio * 100) / 100;
}

/** 学年段階の表を、男女そろった形に広げる。 */
function schoolTable(level: "shogaku" | "zenchu" | "interhigh"): Record<string, GenderTimes> {
  const out: Record<string, GenderTimes> = {};
  for (const k of Object.keys(JAPAN_OPEN)) {
    const male = SCHOOL_MALE[level][k];
    out[k] = male == null ? g(null, null) : g(male, femaleOf(k, male));
  }
  return out;
}

/** 空テーブル（全 null）。 */
function emptyTable(): Record<string, GenderTimes> {
  const t: Record<string, GenderTimes> = {};
  for (const k of Object.keys(JAPAN_OPEN)) t[k] = g(null, null);
  return t;
}

/**
 * ▼ 日本選手権 参加標準記録。
 *
 * 【プロに合わせた高さ】ジャパンオープン標準の **0.97 倍**（＝3%速い）に置いてある。
 * タイムの式は `standard × (1 + 1.15 × (90 − P) / 100)`（→ config の TIME）なので、
 * 0.97 倍のタイムを出すのに必要な能力指数は **P ≒ 92.6**。
 * 「格は 18年で日本代表級」という育成のペース（→ careercheck）だと、
 * ここに届くのは**育て上げたプロだけ**になる。学年の大会（4〜8月）は誰でも入口に立てるが、
 * 日本選手権は「タイムが届いた者だけ」の場、という段差をこの1つの数字で作っている。
 *
 * ★実数が手に入ったら、この掛け算をやめて表を直書きすること★
 */
const NIHON_MULT = 0.97;

function scaledFrom(src: Record<string, GenderTimes>, mult: number): Record<string, GenderTimes> {
  const out: Record<string, GenderTimes> = {};
  for (const [k, v] of Object.entries(src)) {
    const f = (t: number | null): number | null => (t == null ? null : Math.round(t * mult * 100) / 100);
    out[k] = g(f(v.m), f(v.f));
  }
  return out;
}

export const STANDARD_TIMES: Record<StandardKey, Record<string, GenderTimes>> = {
  shogaku: schoolTable("shogaku"),
  zenchu: schoolTable("zenchu"),
  interhigh: schoolTable("interhigh"),
  japanOpen: JAPAN_OPEN,
  nihonSenshuken: scaledFrom(JAPAN_OPEN, NIHON_MULT),
  // ジュニアオリンピックは大会ごと無くなった（2026-09-21 の組み直し）。
  // 古いセーブが持っている記録を読めるようにキーだけ残してある（判定はしない → STANDARD_KEYS）。
  jo: emptyTable(),
};

export function eventKey(ev: RaceEvent): string {
  return `${ev.stroke}-${ev.distance}`;
}

/** 全18種目（テーブルのキーから生成）。 */
export const ALL_EVENTS: readonly RaceEvent[] = Object.keys(JAPAN_OPEN).map((k) => {
  const [stroke, distance] = k.split("-");
  return { stroke: stroke as Stroke, distance: Number(distance) };
});

/** 設定済みの実数（秒）を返す。未設定なら null。 */
export function getStandardTime(key: StandardKey, ev: RaceEvent, gender: Gender): number | null {
  return STANDARD_TIMES[key][eventKey(ev)]?.[gender] ?? null;
}

/** im-100 の仮アンカー（ジャパンオープン未収載のため。★仮★ 後で実数に差し替え）。 */
const PROVISIONAL_IM100: Record<Gender, number> = { m: 55.6, f: 62.6 };

/** 標準どうしの相対（実数未設定時のフォールバック。★すべて仮★）。 */
const PROVISIONAL_REL: Record<StandardKey, number> = {
  // 学年段階の表に無い種目（小学生の400自由形など）は「その学年では挑めない」ので、
  // 仮値を出さない代わりに、ここでは一番緩い値を置いておく（→ hasSchoolStandard で弾く）
  shogaku: 1.3,
  zenchu: 1.18,
  interhigh: 1.08,
  japanOpen: 1.0,
  nihonSenshuken: NIHON_MULT, // 表に無い種目（100m個メ）もこの比で
  jo: 1.08, // 使われていない（大会が無い）
};

/**
 * 実効的な標準タイム。設定済みなら実数、未設定なら仮値で暫定。
 * japanOpen が能力値→タイム算出の基準アンカー。
 */
export function effectiveStandard(key: StandardKey, ev: RaceEvent, gender: Gender): { time: number; provisional: boolean } {
  const configured = getStandardTime(key, ev, gender);
  if (configured != null) return { time: configured, provisional: false };

  const jo = getStandardTime("japanOpen", ev, gender);
  const anchor = jo != null ? jo : PROVISIONAL_IM100[gender];
  return { time: anchor * PROVISIONAL_REL[key], provisional: true };
}

/** 能力値→タイム算出の基準（ジャパンオープン標準を使う）。 */
export function anchorStandard(ev: RaceEvent, gender: Gender): number {
  return effectiveStandard("japanOpen", ev, gender).time;
}

/**
 * その学年の子が目標にする標準記録（小学生／全中／インターハイ）。
 * 未就学と成人は学校の大会が無いので null。
 */
export function schoolStandardKeyOf(stage: LifeStage): StandardKey | null {
  if (stage === "elementary") return "shogaku";
  if (stage === "middle") return "zenchu";
  if (stage === "high") return "interhigh";
  return null;
}

/** その学年段階に、その種目の標準記録があるか（小学生の400mなどは無い）。 */
export function hasSchoolStandard(key: StandardKey, ev: RaceEvent, gender: Gender): boolean {
  return getStandardTime(key, ev, gender) != null;
}

/** タイムが標準を突破しているか。 */
export function meetsStandard(key: StandardKey, ev: RaceEvent, gender: Gender, time: number): boolean {
  return time <= effectiveStandard(key, ev, gender).time;
}
