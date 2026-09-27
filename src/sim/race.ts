import { predictTime, type Gender, type RaceEvent, type Student } from "./student";
import { conditionLevel, conditionTimeFactor } from "./condition";
import { anchorStandard } from "../data/standardTimes";
import { makeRivalSpecs, type Nation, type RivalContext } from "./rivals";
import { MAX_RACE_ENTRIES, RACE, TIME } from "../config/balance";

/**
 * レースのシミュレート（予選8レーン → 上位4人が決勝）。
 *
 * 自クラブから複数人を同じレースに出せる。同じ組で泳ぐので、
 * チームメイト同士が順位を取り合うことになる（＝出す人数だけ得、とはならない）。
 * 相手は必ず RACE.minRivals 人残るため、自クラブは MAX_RACE_ENTRIES 人まで。
 *
 * 男女で標準記録が違うので、1レースは同性のみ（相手の実力もその性別で組む）。
 * 数値はすべて config/balance.ts の RACE。
 */

/** 実力値 power(0–100) からの想定タイム（predictTime と同じ式・男女別アンカー）。 */
export function timeFromPower(ev: RaceEvent, power: number, gender: Gender): number {
  const p = Math.min(100, Math.max(0, power));
  return anchorStandard(ev, gender) * (1 + TIME.timeSlope * (TIME.powerAtStandard - p) / 100);
}

export interface Racer {
  name: string;
  time: number;
  /** 自クラブの選手か（会場での色分け・掲示板の★に使う）。 */
  isPlayer: boolean;
  /** 自クラブの選手なら誰か。相手選手は undefined。 */
  studentId?: number;
  /** その大会にいつも居る強豪か（掲示板で名前を明るく出す）。 */
  named?: boolean;
  /** 外国の選手ならその国（世界大会のみ）。 */
  nation?: Nation;
}

/** 出場させる1人ぶんの指定。extraFactor は高地・ケガなどタイムに乗る倍率。 */
export interface RaceEntry {
  student: Student;
  extraFactor: number;
}

/**
 * 自クラブの選手1人ぶんの結果。
 * 報酬・実績ポイント・自己ベストの判定はすべてこれを材料にする。
 */
export interface EntrantOutcome {
  studentId: number;
  name: string;
  /** 予選の順位（1〜lanes）。 */
  heatRank: number;
  advanced: boolean;
  /** 決勝の順位（進めなかったときは null）。 */
  finalRank: number | null;
  /** 予選・決勝のうち速かったタイム。 */
  bestTime: number;
  /** 決勝1位。 */
  win: boolean;
  /**
   * 1位とのタイム差（秒）。勝ったときは 0。
   * 「あと0.4秒」が見えると、壁の手前で止まっても次に何をすればいいかが分かる。
   */
  gapToWinner: number;
  /** そのタイム差が付いた場面（予選で敗退したのか、決勝で負けたのか）。 */
  gapStage: "heat" | "final";
}

export interface RaceOutcome {
  /** 予選（タイム昇順）。 */
  heat: Racer[];
  /** 決勝（自クラブの誰も上がれなくても、上位4人の争いは行われる）。 */
  final: Racer[] | null;
  /** 自クラブぶんの結果（エントリー順）。 */
  entrants: EntrantOutcome[];
}

/** 1レースに出せる自クラブの人数の上限。 */
export function maxRaceEntries(): number {
  return MAX_RACE_ENTRIES;
}

/**
 * 選手のレースタイム（コンディション＋わずかな揺らぎ）。
 *
 * extraFactor は、コンディション以外でタイムに乗る倍率をまとめて受け取る口。
 * 高地合宿の効果帯（下山からの日数）やケガの影響を GameState が計算して渡す。
 * 1.0 未満で速く、1.0 超で遅くなる。
 */
export function raceTimeFor(s: Student, ev: RaceEvent, rand: () => number, extraFactor = 1): number {
  const level = conditionLevel(s.condition);
  const variance = 1 + (rand() * 2 - 1) * RACE.variance;
  return predictTime(s, ev) * conditionTimeFactor(level) * variance * extraFactor;
}

/**
 * 相手を count 人ぶん作る。
 *
 * 名前と実力は `sim/rivals.ts` が決める（同じ大会にはいつも同じ強豪が居る）。
 * ctx を渡さない呼び出し（検査など）では、大会の区別のない種で作る。
 */
function makeRivals(
  ev: RaceEvent,
  level: number,
  count: number,
  rand: () => number,
  gender: Gender,
  ctx?: RivalContext,
): Racer[] {
  if (count <= 0) return [];
  const c: RivalContext = ctx ?? { compId: "generic", world: false, event: ev, gender };
  return makeRivalSpecs(c, level, count, rand).map((r) => {
    const variance = 1 + (rand() * 2 - 1) * RACE.variance;
    let time = timeFromPower(ev, r.power, gender) * variance;
    // 参加標準記録のある大会の相手は、全員その記録を切ってきた選手（標準より遅くしない）。
    // 標準ぎりぎり〜2%速い、のあいだに散らす
    if (c.timeCap != null && time > c.timeCap) time = c.timeCap * (1 - rand() * 0.02);
    return {
      name: r.name,
      time,
      isPlayer: false,
      named: r.named,
      nation: r.nation,
    };
  });
}

const bySpeed = (a: Racer, b: Racer): number => a.time - b.time;

/** 自クラブの選手を1人ぶんの Racer にする。 */
function racerOf(e: RaceEntry, ev: RaceEvent, rand: () => number): Racer {
  return {
    name: e.student.name,
    time: raceTimeFor(e.student, ev, rand, e.extraFactor),
    isPlayer: true,
    studentId: e.student.id,
  };
}

/**
 * 予選→決勝をシミュレート。
 *
 * rivalLevel は相手の実力の目安（大会規模が大きいほど高い）。
 * 予選の相手は heatRivalPenalty ぶん弱く、決勝の相手は他の組から上がってきた
 * 強い選手として rivalLevel ちょうどで組む（＝1人で出したときの従来の挙動と同じ）。
 */
export function simulateRace(
  entries: readonly RaceEntry[],
  ev: RaceEvent,
  rivalLevel: number,
  rand: () => number,
  /** 決勝でだけ相手が強くなる量（大会の壁 → SCALE_FINAL_WALL）。 */
  finalWall = 0,
  /** どの大会のどの種目か（相手の名前・国を決める → sim/rivals.ts）。 */
  ctx?: RivalContext,
): RaceOutcome {
  const list = entries.slice(0, MAX_RACE_ENTRIES);
  if (list.length === 0) return { heat: [], final: null, entrants: [] };

  // 男女別レース。相手の実力は先頭の選手の性別で組む（UI 側で同性に揃えている）。
  const gender = list[0].student.gender;

  // --- 予選：自クラブ＋相手で lanes 人。上位 advanceCount 人が決勝へ。
  const heatMine = list.map((e) => racerOf(e, ev, rand));
  const heat = [
    ...makeRivals(ev, rivalLevel - RACE.heatRivalPenalty, RACE.lanes - heatMine.length, rand, gender, ctx),
    ...heatMine,
  ].sort(bySpeed);
  const rankIn = (racers: Racer[], studentId: number): number => racers.findIndex((r) => r.studentId === studentId) + 1;

  const advancedIds = new Set(
    heat
      .slice(0, RACE.advanceCount)
      .filter((r) => r.isPlayer && r.studentId != null)
      .map((r) => r.studentId as number),
  );

  // --- 決勝：上がった自クラブの選手が泳ぎ直し、残りのレーンは他の組の勝ち上がりで埋まる。
  let final: Racer[] | null = null;
  if (advancedIds.size > 0) {
    const finalMine = list.filter((e) => advancedIds.has(e.student.id)).map((e) => racerOf(e, ev, rand));
    // 【壁】全国の決勝・世界大会は、ここで相手が一段強くなる（→ SCALE_FINAL_WALL）
    final = [
      ...makeRivals(ev, rivalLevel + finalWall, RACE.lanes - finalMine.length, rand, gender, ctx),
      ...finalMine,
    ].sort(bySpeed);
  }

  const entrants: EntrantOutcome[] = list.map((e) => {
    const id = e.student.id;
    const heatTime = heat.find((r) => r.studentId === id)?.time ?? Number.POSITIVE_INFINITY;
    const advanced = advancedIds.has(id);
    const finalRank = advanced && final ? rankIn(final, id) : null;
    const finalTime = advanced && final ? (final.find((r) => r.studentId === id)?.time ?? heatTime) : heatTime;
    // 泳いだ場のトップとの差（決勝まで行った子は決勝、予選止まりの子は予選で測る）
    const stageRacers = advanced && final ? final : heat;
    const myTime = advanced && final ? finalTime : heatTime;
    const topTime = stageRacers.length > 0 ? stageRacers[0].time : myTime;
    return {
      studentId: id,
      name: e.student.name,
      heatRank: rankIn(heat, id),
      advanced,
      finalRank,
      bestTime: Math.min(heatTime, finalTime),
      win: finalRank === 1,
      gapToWinner: Math.max(0, myTime - topTime),
      gapStage: advanced && final ? "final" : "heat",
    };
  });

  return { heat, final, entrants };
}

// ------------------------------------------------------------------ 結果の取り出し

/** その選手ぶんの結果（出していなければ null）。 */
export function outcomeOf(o: RaceOutcome, studentId: number): EntrantOutcome | null {
  return o.entrants.find((e) => e.studentId === studentId) ?? null;
}

/** 自クラブで最も上位だった選手の結果（見出しに出す）。 */
export function bestEntrant(o: RaceOutcome): EntrantOutcome | null {
  if (o.entrants.length === 0) return null;
  // 決勝に上がった方が上、同じ土俵なら順位が上の方。
  return [...o.entrants].sort((a, b) => {
    if (a.advanced !== b.advanced) return a.advanced ? -1 : 1;
    if (a.advanced) return (a.finalRank ?? 99) - (b.finalRank ?? 99);
    return a.heatRank - b.heatRank;
  })[0];
}

/** その大会でのその選手の成績の呼び名（「優勝」「3位（表彰台）」など）。 */
export function placementLabelOf(e: EntrantOutcome): string {
  if (e.win) return "優勝";
  if (e.finalRank != null && e.finalRank <= 3) return `${e.finalRank}位（表彰台）`;
  if (e.finalRank != null) return `決勝${e.finalRank}位`;
  return `予選${e.heatRank}位（敗退）`;
}
