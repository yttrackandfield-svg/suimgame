import { CHATTER } from "../config/balance";

/**
 * キャラの吹き出し（セリフ・気持ち）。
 *
 * 「いま何をしているか」＋「機嫌・体力」から**規則的に**状況を決め、
 * その状況に用意した短いセリフを1つ選ぶ。文言はここのデータ表だけを
 * 足せば増やせる（画面側もロジック側も触らなくてよい）。
 *
 * 純ロジック（Phaser 非依存）。実際に吹き出しを描くのは gfx/SpeechBubble.ts。
 */

// ------------------------------------------------------------------ 状況

/**
 * いま何をしているか（呼び出し側が渡す「素の行動」）。
 * 状況（ChatterSituation）は、これに機嫌・体力を掛け合わせて決まる。
 */
export type ChatterActivity =
  | "walk" // 移動中
  | "wait" // 立ち止まって待っている
  | "arrive" // 来たところ
  | "swim" // 泳いでいる
  | "train" // 器具・スタジオで練習している
  | "afterSwim" // 泳ぎ終わって上がったところ
  | "bath" // 風呂に浸かっている
  | "sauna" // サウナ・外気浴
  | "meal" // 売店・食堂
  | "leave" // 満足して帰るところ
  | "grew" // 能力が伸びた
  | "coaching" // 指導中（コーチ）
  | "cleaning" // 掃除中（コーチ）
  | "research" // 研究中（コーチ）
  | "deskwork" // 持ち場で働いている（専門スタッフ）
  | "measure" // 医科学センターで測定・ケアを受けている
  | "watch"; // 観客席・プールサイドで練習を見ている

/** セリフの分類。データを足すときはここに1行足す。 */
export type ChatterSituation =
  | "walk"
  | "wait"
  | "arrive"
  | "swim"
  | "swimHard"
  | "train"
  | "trainHard"
  | "afterSwim"
  | "bath"
  | "sauna"
  | "meal"
  | "satisfied"
  | "unsatisfied"
  | "grew"
  | "coaching"
  | "cleaning"
  | "research"
  | "deskwork"
  | "measure"
  | "watch";

/** 吹き出しの雰囲気（色を少しだけ変える）。 */
export type ChatterTone = "happy" | "tired" | "calm" | "plain";

// ------------------------------------------------------------------ セリフのデータ表
// **ここを足すだけで増やせる。** 1つ12文字くらいまで（吹き出しが横に伸びると施設が隠れる）。

export const CHATTER_LINES: Record<ChatterSituation, readonly string[]> = {
  walk: ["さてと", "こっちかな", "いい施設だね", "ひさしぶり", "今日もがんばろ"],
  wait: ["まだかな", "ちょっと休憩", "順番待ち…", "ふぅ", "のんびり待とう"],
  arrive: ["きた〜！", "こんにちは", "今日も来たよ", "いい天気", "わくわく"],
  swim: ["すいすい", "いい感じ！", "もう1本！", "水が気持ちいい", "リズムよく"],
  swimHard: ["きつい…", "あと少し！", "はぁ…はぁ…", "うでが重い", "ここが踏ん張り"],
  train: ["ふんっ", "きまった！", "いい調子", "もう1セット", "体が動く"],
  trainHard: ["うぐぐ…", "あと3回…", "きつい…", "限界かも", "負けるか！"],
  afterSwim: ["はぁ…", "気持ちいい", "泳ぎきった！", "つかれた〜", "いい練習だった"],
  bath: ["ふ〜", "生き返る…", "極楽ごくらく", "あったまる", "ほぐれる〜"],
  sauna: ["ととのう", "あつい〜", "ととのった…", "汗が出る", "整い待ち"],
  meal: ["もぐもぐ", "いただきます", "おいしい！", "お腹すいた", "ごちそうさま"],
  satisfied: ["楽しい！", "また来よう", "いい汗かいた", "満足まんぞく", "来てよかった"],
  unsatisfied: ["混んでるな…", "待たされた…", "ちょっと残念", "next time…", "また今度"],
  grew: ["うまくなった気がする", "手ごたえあり！", "伸びてる？", "つかんだかも", "いい感じ！"],
  coaching: ["いいぞ！", "もう1本！", "そこだ！", "水をつかめ", "フォーム意識！"],
  cleaning: ["ピカピカに", "よし、きれい", "ふきふき", "ここも磨こう"],
  research: ["なるほど…", "データを見よう", "仮説どおりだ", "うーん", "これは使える"],
  deskwork: ["おつかれさま", "順調です", "記録しておこう", "本日も安全に"],
  measure: ["フォーム撮影中", "数値どうかな", "乳酸値チェック", "データで見ると…", "ここが課題か"],
  watch: ["がんばれー！", "速いなあ", "いい泳ぎ！", "あの子すごい", "応援してるよ", "未来の代表かも"],
};

/** 状況ごとの雰囲気（吹き出しの色に使う）。 */
export const CHATTER_TONE: Record<ChatterSituation, ChatterTone> = {
  walk: "plain",
  wait: "plain",
  arrive: "happy",
  swim: "happy",
  swimHard: "tired",
  train: "happy",
  trainHard: "tired",
  afterSwim: "tired",
  bath: "calm",
  sauna: "calm",
  meal: "happy",
  satisfied: "happy",
  unsatisfied: "tired",
  grew: "happy",
  coaching: "plain",
  cleaning: "plain",
  research: "plain",
  deskwork: "plain",
  measure: "calm",
  watch: "happy",
};

// ------------------------------------------------------------------ 状況を決める（規則的）

export interface ChatterState {
  /** 機嫌 0-100（分からなければ省略）。 */
  mood?: number;
  /** 体力の残り割合 0-1（分からなければ省略）。 */
  energy01?: number;
}

/**
 * 行動＋状態 → 状況。
 *
 * ・練習は**体力が減っていれば「きつい」側**の言葉になる（同じ行動でも変わる）
 * ・帰りぎわは**機嫌**で「また来よう」／「混んでるな…」に分かれる
 * これで「規則的に内容が変わる」＝見ている人が状態を読み取れる。
 */
export function chatterSituationOf(activity: ChatterActivity, st: ChatterState = {}): ChatterSituation {
  const tired = (st.energy01 ?? 1) <= CHATTER.tiredEnergy;
  switch (activity) {
    case "swim":
      return tired ? "swimHard" : "swim";
    case "train":
      return tired ? "trainHard" : "train";
    case "leave":
      return (st.mood ?? 100) < CHATTER.unhappyMood ? "unsatisfied" : "satisfied";
    default:
      return activity;
  }
}

/** その状況のセリフを1つ選ぶ（rand は 0..1）。 */
export function pickChatterLine(sit: ChatterSituation, rand: () => number): string {
  const lines = CHATTER_LINES[sit];
  if (!lines || lines.length === 0) return "";
  return lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
}

/**
 * 吹き出しを1つぶん組み立てる。
 * 出すかどうか（頻度・上限）は呼び出し側が決める（→ FacilityScene の吹き出しの間引き）。
 */
export interface Chatter {
  text: string;
  situation: ChatterSituation;
  tone: ChatterTone;
}

export function makeChatter(activity: ChatterActivity, st: ChatterState, rand: () => number): Chatter | null {
  const situation = chatterSituationOf(activity, st);
  const text = pickChatterLine(situation, rand);
  if (!text) return null;
  return { text, situation, tone: CHATTER_TONE[situation] };
}
