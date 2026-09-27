import { AUTOEVENT } from "../config/balance";

/**
 * 自動発生イベント（プレイヤーが選ぶイベントとは別系統）。
 *
 * 目的は「賑やかし」とテンポ。時間が流れるだけの間を作らないように、
 * 入会・コンディション変化・コーチの一言・小さな出来事を勝手に流す。
 * 通知として出し、詳細は見たい人だけ開く（割り込みすぎない）。
 *
 * ここには「文言」と「発生間隔の計算」だけを置く。
 * 実際に誰が入会するか等の状態変化は GameState 側が行う。
 */

export type AutoEventKind = "enroll" | "condition" | "coach" | "news";

export interface AutoEvent {
  kind: AutoEventKind;
  icon: string;
  title: string; // 通知に出す1行
  detail?: string; // 通知をタップしたときの補足
  /** 詳細を開ける対象（入会・コンディション変化）。 */
  studentId?: number;
  color: string;
}

export const AUTO_EVENT_COLOR: Record<AutoEventKind, string> = {
  enroll: "#2ecc71",
  condition: "#f1c40f",
  coach: "#aed6f1",
  news: "#e8f0f6",
};

/**
 * 次の入会までの間隔（ゲーム内分）。
 * 人気度が高いほど短く、在籍が少ない序盤はさらに短くする（手が空かないように）。
 */
export function nextEnrollInterval(
  enrollMult: number,
  members: number,
  rand: () => number,
  /** 在籍が「無理なく見られる規模」を超えているぶんの重さ（1.0＝そのまま）。 */
  pressure = 1,
): number {
  const early = members < AUTOEVENT.earlyMembers ? AUTOEVENT.earlyIntervalMult : 1;
  // 人気度ぶんの集客倍率は**蓋をして**効かせる（→ AUTOEVENT.enrollMultCap）。
  // 飛び込みの入会が人気度で無限に速くなると、イベントを打つ意味が無くなる。
  const mult = Math.min(AUTOEVENT.enrollMultCap, Math.max(0.2, enrollMult));
  const base = (AUTOEVENT.enrollBaseMin / mult) * early * Math.max(1, pressure);
  const jitter = 0.7 + rand() * 0.6;
  return Math.max(AUTOEVENT.enrollMinIntervalMin, base * jitter);
}

/** 次の賑やかしイベントまでの間隔（ゲーム内分）。 */
export function nextFlavorInterval(members: number, rand: () => number): number {
  const early = members < AUTOEVENT.earlyMembers ? AUTOEVENT.earlyIntervalMult : 1;
  return (AUTOEVENT.flavorBaseMin + rand() * AUTOEVENT.flavorJitterMin) * early;
}

// ------------------------------------------------------------------ 文言

const pick = <T>(arr: readonly T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)];

/** 入会の見出し（設計の「◯◯さんが入会しました！」）。 */
export function enrollTitle(name: string): string {
  return `${name} さんが入会しました！`;
}

const ENROLL_DETAIL = [
  "タップすると能力や得意種目を確認できる",
  "見学のあと、すぐに入会を決めたそうだ",
  "お母さんに連れられてやってきた",
  "友達に誘われて入ったらしい",
];

export function enrollDetail(rand: () => number): string {
  return pick(ENROLL_DETAIL, rand);
}

/** 満員で入会を断ったときの通知。 */
export function fullPoolTitle(): string {
  return "入会希望を断ってしまった…";
}

export const FULL_POOL_DETAIL = "プールの練習枠がいっぱい。時間割にコマを足すか、プールを増やそう";


const CONDITION_UP = ["の調子が上がってきた", "が気持ちよさそうに泳いでいる", "の動きが良くなってきた"];
const CONDITION_DOWN = ["が少し疲れているようだ", "の動きが重い", "が本調子ではなさそう"];

export function conditionTitle(name: string, up: boolean, rand: () => number): string {
  return `${name}${pick(up ? CONDITION_UP : CONDITION_DOWN, rand)}`;
}

const COACH_LINES = [
  "「今日はみんな集中できているな」",
  "「基礎をていねいにやろう」",
  "「あの子、伸びる気がするんだ」",
  "「水を感じる練習を増やしたい」",
  "「無理をさせない範囲で追い込もう」",
  "「フォームが崩れたら基礎に戻す。それだけだ」",
  "「うちのクラブ、雰囲気が良くなってきた」",
];

export function coachTitle(coachName: string, rand: () => number): string {
  return `${coachName}：${pick(COACH_LINES, rand)}`;
}

/** 小さな出来事（人気度がわずかに動くものもある）。 */
export interface NewsLine {
  text: string;
  popularity: number;
}

const NEWS: readonly NewsLine[] = [
  { text: "見学の親子がプールをのぞいていった", popularity: 1 },
  { text: "地元の掲示板にクラブの張り紙が出た", popularity: 1 },
  { text: "水質検査に無事合格した", popularity: 0 },
  { text: "近所の小学校で水泳の授業が始まった", popularity: 2 },
  { text: "OBが差し入れを持ってきてくれた", popularity: 1 },
  { text: "プールサイドのすべり止めを張り替えた", popularity: 0 },
  { text: "地元紙にクラブの記事が小さく載った", popularity: 3 },
  { text: "夕方の回の見学希望が増えているらしい", popularity: 2 },
  { text: "プールの水温をこまめに調整した", popularity: 0 },
];

export function newsLine(rand: () => number): NewsLine {
  return pick(NEWS, rand);
}
