import type { CareerPhase } from "../sim/growth";
import type { GrowthType } from "../sim/growth";

/**
 * 成長段階のひとこと（選手カードに出す）。
 *
 * 【データにしてある理由】年齢 × 成長タイプの組み合わせは多く、
 * コードの中に文字列を散らすと、あとから足すのも直すのも面倒になる。
 * ここに条件と文言を並べておけば、行を1つ足すだけで言い回しが増える。
 *
 * 選び方は上から順で、**条件に合った最初の行**を使う（特別な言い回しを上に置くこと）。
 * 同じ行が続くと飽きるので、候補が複数あるときは選手ごとに固定で1つ選ぶ
 *（→ careerLine。日替わりにはしない。カードを開くたびに変わると落ち着かない）。
 */
export interface CareerLine {
  /** どの時期か（省略＝どの時期でも）。 */
  phase?: CareerPhase;
  /** どの成長タイプか（省略＝どのタイプでも）。 */
  type?: GrowthType;
  /** 何歳以上か（省略＝下限なし）。 */
  minAge?: number;
  /** 何歳以下か（省略＝上限なし）。 */
  maxAge?: number;
  /** 引退まであと何年以下か（省略＝みない）。 */
  yearsLeftAtMost?: number;
  /** 言い回し（複数あれば選手ごとに1つ選ぶ）。 */
  lines: readonly string[];
}

export const CAREER_LINES: readonly CareerLine[] = [
  // ---- 特別な言い回し（上に置くほど優先）----
  {
    // 晩成の若いころ。伸び悩んで見えるが、これからの子
    phase: "grow",
    type: "late",
    minAge: 13,
    lines: [
      "いまはもがいている。芽が出るのはこれからだ",
      "タイムは伸び悩んでいるが、体はまだ出来上がっていない",
      "遅れて咲くタイプ。焦らず泳ぎ込ませたい",
    ],
  },
  {
    // 超早熟の幼いころ。同学年より頭ひとつ抜けている
    phase: "grow",
    type: "superEarly",
    maxAge: 12,
    lines: [
      "同学年ではもう抜けている。水の中での落ち着きが違う",
      "幼いのに、すでにレースの泳ぎができている",
    ],
  },
  {
    // 持続型のピーク。長く高いところにいられる
    phase: "peak",
    type: "sustained",
    lines: [
      "崩れる気配がない。この状態が長く続きそうだ",
      "毎年きちんとタイムを出してくる。安定そのもの",
    ],
  },
  {
    // 引退が目前
    yearsLeftAtMost: 1,
    lines: [
      "そろそろ、水から上がる日を考える時期だ",
      "最後の一年になるかもしれない。悔いのないように",
    ],
  },

  // ---- ふつうの言い回し（時期ごと）----
  {
    phase: "grow",
    maxAge: 11,
    lines: [
      "水をつかむ感覚が、日に日に良くなっている",
      "泳ぐたびに何かを覚えていく",
      "まだ形はばらばらだが、伸びしろは大きい",
    ],
  },
  {
    phase: "grow",
    lines: [
      "めきめきとタイムを縮めている",
      "水をつかむ感覚が急速に良くなっている",
      "練習したぶんが、そのままタイムに出る時期",
      "体つきが変わってきた。スピードが乗り始めている",
    ],
  },
  {
    phase: "peak",
    lines: [
      "いまがまさに全盛期",
      "泳ぎが完成の域にある",
      "どの距離でも、狙ったタイムを出せる",
      "力み無く速い。いちばん良い時期に入っている",
    ],
  },
  {
    phase: "decline",
    lines: [
      "以前より伸びは落ちてきたが、泳ぎに円熟味が増している",
      "スピードは全盛期に及ばない。それでも運びで見せる",
      "無駄のない泳ぎになった。体力の使いどころを知っている",
    ],
  },
  {
    phase: "limit",
    lines: [
      "選手としての限界が近づいている",
      "気持ちはまだ水にある。ただ、体がついてこない",
      "積み上げた技術で、なんとか食らいついている",
    ],
  },
];

/** 条件に合う行を選ぶ（上から順。seed は選手ごとに固定の言い回しを選ぶため）。 */
export function careerLine(
  phase: CareerPhase,
  type: GrowthType,
  age: number,
  yearsLeft: number,
  seed: number,
): string {
  for (const c of CAREER_LINES) {
    if (c.phase && c.phase !== phase) continue;
    if (c.type && c.type !== type) continue;
    if (c.minAge != null && age < c.minAge) continue;
    if (c.maxAge != null && age > c.maxAge) continue;
    if (c.yearsLeftAtMost != null && yearsLeft > c.yearsLeftAtMost) continue;
    return c.lines[Math.abs(seed) % c.lines.length];
  }
  return "";
}
