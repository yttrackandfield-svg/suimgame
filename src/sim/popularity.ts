import { GUESTS, POPULARITY } from "../config/balance";

/**
 * 人気度の効き目（純ロジック・Phaser 非依存）。
 *
 * 【人気度に上限は無い】以前は 999 で頭打ちだったが、いまはどこまでも伸びる。
 * そのかわり、以前の上限（POPULARITY.softKnee）を超えたぶんは効き目を緩やかにしてある。
 * softKnee までは今までとまったく同じ効き方なので、序盤〜中盤の手触りは変わらない。
 *
 * 上限を外すと青天井になりそうなものは、次のように抑えている。
 *   ・入会   … 超えたぶんは softSlope 倍でしか効かない。実際の人数はクラスの定員で止まる
 *   ・一般客 … 来場の倍率は伸び続けるが、入れる人数は部屋の定員で止まる（＝部屋を建てる動機）
 *   ・才能   … softKnee ぶんで打ち止め（確率がもともと十分高いため）
 *   ・放っておいて増える分 … 人気が高いほど伸びにくい（ただし0にはならない）
 */

/** 効き目としての人気度。knee までは実際の値、超えたぶんは slope 倍。 */
export function softPopularity(pop: number, knee: number, slope: number): number {
  const p = Math.max(0, pop);
  return p <= knee ? p : knee + (p - knee) * slope;
}

/** 入会の集客倍率・受け入れ規模に使う人気度。 */
export function enrollPopularity(pop: number): number {
  return softPopularity(pop, POPULARITY.softKnee, POPULARITY.softSlope);
}

/** 一般客の来場倍率（上限なし。→ GUESTS.demandKnee / demandSlope）。 */
export function guestDemandOf(pop: number): number {
  return 1 + softPopularity(pop, GUESTS.demandKnee, GUESTS.demandSlope) / GUESTS.demandPerFactor;
}

/** 才能ある子が混じる確率に使う人気度（softKnee で打ち止め）。 */
export function talentPopularity(pop: number): number {
  return Math.min(Math.max(0, pop), POPULARITY.softKnee);
}

/**
 * 「放っておいても増える人気度」に掛ける倍率。
 * 人気が高いほど伸びにくい（有名になるほど、さらに有名になるのは難しい）が、0 にはならない。
 */
export function passivePopularityFactor(pop: number): number {
  const ratio = Math.min(1, Math.max(0, pop) / POPULARITY.softKnee);
  return Math.max(POPULARITY.passiveFloor, 1 - POPULARITY.passiveFalloff * ratio);
}

/**
 * 画面の人気度ゲージの「満タン」。
 * 上限が無いので、次の目標まで貯まっていく棒にする。目標を超えるたびに1段先へ
 * （100 → 250 → 500 → 1000 → 2000 → 5000 → 10000 → 20000 → …）。
 */
export function popularityGaugeGoal(pop: number): number {
  const goals = POPULARITY.gaugeGoals;
  for (const g of goals) if (pop < g) return g;
  let goal = goals[goals.length - 1];
  while (pop >= goal) goal *= 2;
  return goal;
}
