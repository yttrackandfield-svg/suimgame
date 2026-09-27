import { RACE } from "../config/balance";
import { hasClearedStage, stageEventKey } from "./competitions";
import { timeFromPower, raceTimeFor } from "./race";
import { bandOf, nationBonus, NATIONS, rivalNameOf, seededRandom, type Nation } from "./rivals";
import type { Gender, RaceEvent, Stroke, Student } from "./student";

/**
 * 400mメドレーリレー（12月の世界選手権）。
 *
 * 【誰が泳ぐか】10月の日本選手権で**100mの各泳法で優勝した選手**が日本代表になる。
 * 泳法ごとに1人なので、背泳ぎ・平泳ぎ・バタフライ・自由形の4枠。
 * 自クラブから埋まらなかった枠は、**ほかのクラブの日本代表**（CP）が埋める
 *  ＝1人しか優勝していなくても、その1人は日本代表としてリレーを泳げる。
 *
 * 【個人種目との違い】リレーは
 *   ・チームの合計タイムで competing する（1人が遅れても他の3人で取り返せる）
 *   ・予選が無い（決勝だけ）。年に1度しか泳げない
 *   ・泳ぐのは各自の**得意ではなく、担当の泳法**（背泳ぎ優勝者は背泳ぎを泳ぐ）
 *
 * 【1年に1度だけ】泳いだ記録は選手の season に付ける（→ RELAY_STAGE）。
 * season は年度が変わると消えるので、**新しい年になればまた泳げる**。
 * このためにセーブを増やす必要がない。
 */

/** メドレーリレーの泳ぐ順（背→平→バタ→自由）。 */
export const RELAY_ORDER: readonly Stroke[] = ["back", "breast", "fly", "free"];

/** 1人が泳ぐ距離。 */
export const RELAY_DISTANCE = 100;

/** 「今年のリレーは泳いだ」を選手に付けるための段のキー。 */
export const RELAY_STAGE = "gen_relay";

/** リレーを1つの種目として扱うときの見かけ（400mメドレー）。 */
export const RELAY_EVENT: RaceEvent = { stroke: "im", distance: 400 };

/** 日本代表を選ぶ大会（10月の日本選手権）。 */
export const RELAY_SOURCE_COMP = "gen_nihon";

/** リレーに出るチームの数（レーン数と同じ）。 */
const RELAY_TEAMS = RACE.lanes;

export interface RelayLeg {
  stroke: Stroke;
  /** 自クラブの選手（日本代表に選ばれた子）。よそのクラブの代表なら null。 */
  student: Student | null;
  name: string;
  /** その100mのタイム（秒）。 */
  time: number;
}

export interface RelayTeam {
  /** 「日本」「アメリカ」。 */
  name: string;
  nation?: Nation;
  /** 自クラブの選手が入っているチーム（＝日本）。 */
  isPlayer: boolean;
  legs: RelayLeg[];
  /** 4人の合計タイム。 */
  total: number;
}

export interface RelayOutcome {
  /** 速い順。 */
  teams: RelayTeam[];
  /** 日本のチーム。 */
  japan: RelayTeam;
  /** 日本の順位（1〜RELAY_TEAMS）。 */
  rank: number;
  gender: Gender;
  /** 自クラブから出た選手（報酬をこの人たちに配る）。 */
  members: Student[];
}

/** その選手が日本選手権の 100m その泳法で優勝しているか。 */
export function isRelayChampion(s: Student, stroke: Stroke): boolean {
  return hasClearedStage(s, RELAY_SOURCE_COMP, { stroke, distance: RELAY_DISTANCE });
}

/** 今年もうリレーを泳いだか。 */
export function relayAlreadySwum(s: Student): boolean {
  return hasClearedStage(s, RELAY_STAGE);
}

/**
 * 日本代表の枠（RELAY_ORDER 順）。埋まらない枠は null。
 *
 * 同じ選手が2つの泳法で優勝していたら、**前の枠に入れて後ろは空ける**
 *（1人が2回泳ぐリレーは無いので）。
 */
export function relaySelection(students: readonly Student[], gender: Gender): (Student | null)[] {
  const used = new Set<number>();
  return RELAY_ORDER.map((stroke) => {
    const who = students.find((s) => s.gender === gender && !used.has(s.id) && isRelayChampion(s, stroke));
    if (who) used.add(who.id);
    return who ?? null;
  });
}

/**
 * リレーを組める性別（リレーは男女別）。
 * 両方に代表がいるときは**人数の多いほう**。同数なら男子。
 */
export function pickRelayGender(students: readonly Student[]): Gender | null {
  const count = (g: Gender): number => relaySelection(students, g).filter((s) => s != null).length;
  const m = count("m");
  const f = count("f");
  if (m === 0 && f === 0) return null;
  return f > m ? "f" : "m";
}

/**
 * よそのクラブの日本代表（空いた枠を埋めるCP）の名前。
 * 泳法と性別から決まる固定の名前なので、**毎年同じ人が同じ枠を埋める**
 *（自分の子が優勝すればその枠を奪える、という見え方になる）。
 */
function domesticName(stroke: Stroke, gender: Gender): string {
  return rivalNameOf(null, gender, seededRandom(`jpn-relay|${stroke}|${gender}`));
}

/**
 * リレーをシミュレートする。
 *
 * `level` は相手の強さの中心（→ competitions.rivalLevelOf の世界大会ぶん）。
 * 日本の空き枠も、そのくらいの強さの代表が埋める（世界大会に出てくる日本なので）。
 *
 * 【相手の国は毎年同じ7か国】固定の種で選ぶので、「いつもの顔ぶれ」になる。
 * 100mが4本なので、得手不得手は短距離の値で見る（→ nationBonus）。
 */
export function simulateRelay(
  students: readonly Student[],
  gender: Gender,
  level: number,
  rand: () => number,
  extraFactorOf: (s: Student, ev: RaceEvent) => number = () => 1,
): RelayOutcome {
  const picked = relaySelection(students, gender);
  const members = picked.filter((s): s is Student => s != null);

  // --- 日本（自クラブの代表＋空き枠はよそのクラブの代表）
  const jpLegs: RelayLeg[] = RELAY_ORDER.map((stroke, i) => {
    const s = picked[i];
    const ev: RaceEvent = { stroke, distance: RELAY_DISTANCE };
    if (s) return { stroke, student: s, name: s.name, time: raceTimeFor(s, ev, rand, extraFactorOf(s, ev)) };
    // 空き枠：世界大会に出てくる日本代表なので、相手と同じくらいの強さ
    const power = level - 2 + (rand() * 2 - 1) * (RACE.rivalSpread / 3);
    return { stroke, student: null, name: domesticName(stroke, gender), time: timeFromPower(ev, power, gender) };
  });
  const japan: RelayTeam = {
    name: "日本",
    isPlayer: true,
    legs: jpLegs,
    total: jpLegs.reduce((a, l) => a + l.time, 0),
  };

  // --- 相手の国（毎年同じ7か国。短距離が得意な国から選ぶ）
  const band = bandOf(RELAY_DISTANCE);
  const nations = [...NATIONS].sort((a, b) => nationBonus(b, band) - nationBonus(a, band)).slice(0, RELAY_TEAMS - 1);
  const teams: RelayTeam[] = [japan];
  for (const n of nations) {
    const seeded = seededRandom(`relay|${n.code}|${gender}`);
    // チームの地力は固定（いつも同じ強さの国）。当日のタイムだけが揺れる
    const base = level + (seeded() * 2 - 1) * (RACE.rivalSpread / 2) + nationBonus(n, band);
    const legs: RelayLeg[] = RELAY_ORDER.map((stroke) => {
      const ev: RaceEvent = { stroke, distance: RELAY_DISTANCE };
      // 泳法ごとの得手不得手（国ごとに固定）＋当日の揺らぎ
      const perStroke = (seeded() * 2 - 1) * 4;
      const variance = 1 + (rand() * 2 - 1) * RACE.variance;
      // 【名前はそのチームの国から】国を引き直すと、イギリス代表にアメリカ人が並ぶ
      return {
        stroke,
        student: null,
        name: rivalNameOf(n, gender, seededRandom(`relay|${n.code}|${gender}|${stroke}`)),
        time: timeFromPower(ev, base + perStroke, gender) * variance,
      };
    });
    teams.push({
      name: n.label,
      nation: n,
      isPlayer: false,
      legs,
      total: legs.reduce((a, l) => a + l.time, 0),
    });
  }

  teams.sort((a, b) => a.total - b.total);
  return { teams, japan, rank: teams.indexOf(japan) + 1, gender, members };
}

/** 泳ぎ終えた選手に「今年は泳いだ」を付ける。 */
export function markRelaySwum(members: readonly Student[]): void {
  for (const s of members) {
    const key = stageEventKey(RELAY_STAGE, RELAY_EVENT);
    if (!s.season.clearedStages.includes(key)) s.season.clearedStages.push(key);
  }
}
