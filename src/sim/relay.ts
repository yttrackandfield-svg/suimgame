import { RACE, RELAY } from "../config/balance";
import { hasClearedStage, stageEventKey } from "./competitions";
import { timeFromPower, raceTimeFor } from "./race";
import { bandOf, nationBonus, NATIONS, rivalNameOf, seededRandom, type Nation } from "./rivals";
import { predictTime, type Gender, type RaceEvent, type Stroke, type Student } from "./student";

/**
 * 400mメドレーリレー（11月のアジア選手権 → 12月の世界選手権）。
 *
 * 【2段の勝ち上がり】（2026-10-13）まず11月のアジア選手権でリレーを泳ぎ、
 * **優勝した性別だけ**が12月の世界選手権のリレーへ進む（→ RELAY_ASIA_WIN）。
 * 男女は別のリレー。両方に代表がいれば、どちらも泳げる。
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

/** リレーの段（アジア選手権／世界選手権）。 */
export type RelayStage = "asia" | "sekai";

/** その段のリレーを泳ぐ大会。 */
export const RELAY_COMP: Record<RelayStage, string> = { asia: "gen_asia", sekai: "gen_sekai" };

/**
 * 「今年のその段のリレーは泳いだ」を選手に付けるための段のキー。
 * 世界は以前から使っていた "gen_relay" のまま（古いセーブの記録をそのまま読めるように）。
 */
export const RELAY_STAGE: Record<RelayStage, string> = { asia: "gen_relay_asia", sekai: "gen_relay" };

/** アジア選手権のリレーで優勝した印（世界選手権のリレーに出られる）。 */
export const RELAY_ASIA_WIN = "gen_relay_asia_win";

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

/** 今年もうその段のリレーを泳いだか。 */
export function relayAlreadySwum(s: Student, stage: RelayStage): boolean {
  return hasClearedStage(s, RELAY_STAGE[stage]);
}

/** 今年のアジア選手権のリレーで優勝したか。 */
export function wonAsiaRelay(s: Student): boolean {
  return hasClearedStage(s, RELAY_ASIA_WIN);
}

/** 空き枠を泳ぐ、よそのクラブの日本代表のタイム（揺らぎ無しの目安）。 */
function fillTimeOf(stroke: Stroke, gender: Gender): number {
  return timeFromPower({ stroke, distance: RELAY_DISTANCE }, RELAY.fillPower, gender);
}

/**
 * 日本代表の枠（RELAY_ORDER 順）。埋まらない枠は null。
 *
 * **1人が泳ぐのは1枠だけ**（同じ選手が2つの泳法で優勝していても、2回は泳がない）。
 * 2つの泳法で優勝した子がいるときは、全部の組み合わせを試して
 *   ① 自クラブの子が入る枠がいちばん多い
 *   ② そのうえで、チームの予想タイムがいちばん速い
 * 並びを選ぶ（以前は「前の枠に入れる」だけで、得意でない泳法に回ることがあった）。
 * 自クラブから何人入ってもよい（4枠すべて自クラブでもかまわない）。
 */
export function relaySelection(students: readonly Student[], gender: Gender): (Student | null)[] {
  const options = RELAY_ORDER.map((stroke) =>
    students.filter((s) => s.gender === gender && isRelayChampion(s, stroke)),
  );
  let best: (Student | null)[] = RELAY_ORDER.map(() => null);
  let bestCount = 0;
  let bestTime = Infinity;
  const cur: (Student | null)[] = [];
  const used = new Set<number>();
  const legTime = (s: Student | null, k: number): number =>
    s ? predictTime(s, { stroke: RELAY_ORDER[k], distance: RELAY_DISTANCE }) : fillTimeOf(RELAY_ORDER[k], gender);
  const walk = (i: number): void => {
    if (i === RELAY_ORDER.length) {
      const count = cur.filter((s) => s != null).length;
      const time = cur.reduce((sum, s, k) => sum + legTime(s, k), 0);
      if (count > bestCount || (count === bestCount && time < bestTime)) {
        best = [...cur];
        bestCount = count;
        bestTime = time;
      }
      return;
    }
    for (const s of options[i]) {
      if (used.has(s.id)) continue;
      used.add(s.id);
      cur.push(s);
      walk(i + 1);
      cur.pop();
      used.delete(s.id);
    }
    cur.push(null);
    walk(i + 1);
    cur.pop();
  };
  walk(0);
  return best;
}

/**
 * アジア選手権のリレーに出てくる国（日本のほかに7か国）。
 * 世界の表（NATIONS）にあるアジアの国は中国と韓国だけなので、リレー用に足してある。
 * 個人種目の相手の抽選には混ぜない（世界大会の顔ぶれが変わってしまうため）。
 * 得手不得手は NATIONS と同じ物差し（短距離の値だけ使う）。
 */
const ASIA_EXTRA: readonly Nation[] = [
  { code: "TPE", short: "台", label: "チャイニーズタイペイ", sprint: -3, middle: -3, distance: -3, family: ["リン", "ホアン", "ツァイ", "ヤン"] },
  { code: "HKG", short: "港", label: "香港", sprint: -2, middle: -4, distance: -5, family: ["ウォン", "リョン", "ホー", "チョン"] },
  { code: "SGP", short: "星", label: "シンガポール", sprint: -2, middle: -5, distance: -6, family: ["タン", "リム", "テオ", "ゴー"] },
  { code: "THA", short: "タイ", label: "タイ", sprint: -5, middle: -5, distance: -5, family: ["スリヤ", "ブンマー", "チャイヤ", "ウォンサ"] },
  { code: "KAZ", short: "カザ", label: "カザフスタン", sprint: -5, middle: -4, distance: -3, family: ["アバエフ", "セリコフ", "ヌルラノフ", "ベコフ"] },
];
const ASIA_NATIONS: readonly Nation[] = [...NATIONS.filter((n) => n.code === "CHN" || n.code === "KOR"), ...ASIA_EXTRA];

/** その段のリレーの相手の国（毎年同じ顔ぶれ）。 */
export function relayNations(stage: RelayStage): readonly Nation[] {
  const band = bandOf(RELAY_DISTANCE);
  const pool = stage === "asia" ? ASIA_NATIONS : NATIONS;
  return [...pool].sort((a, b) => nationBonus(b, band) - nationBonus(a, band)).slice(0, RELAY_TEAMS - 1);
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
 * 相手の強さは段ごとに RELAY.level。日本の空き枠は RELAY.fillPower の代表が埋める
 *（弱めにしてあるので、勝つには自クラブの子が何人も要る）。
 *
 * 【相手の国は毎年同じ7か国】固定の種で選ぶので、「いつもの顔ぶれ」になる。
 * 100mが4本なので、得手不得手は短距離の値で見る（→ nationBonus）。
 */
export function simulateRelay(
  students: readonly Student[],
  gender: Gender,
  stage: RelayStage,
  rand: () => number,
  extraFactorOf: (s: Student, ev: RaceEvent) => number = () => 1,
): RelayOutcome {
  const level = RELAY.level[stage];
  const picked = relaySelection(students, gender);
  const members = picked.filter((s): s is Student => s != null);

  // --- 日本（自クラブの代表＋空き枠はよそのクラブの代表）
  const jpLegs: RelayLeg[] = RELAY_ORDER.map((stroke, i) => {
    const s = picked[i];
    const ev: RaceEvent = { stroke, distance: RELAY_DISTANCE };
    if (s) return { stroke, student: s, name: s.name, time: raceTimeFor(s, ev, rand, extraFactorOf(s, ev)) };
    // 空き枠：よそのクラブの日本代表（RELAY.fillPower 前後）
    const power = RELAY.fillPower + (rand() * 2 - 1) * (RACE.rivalSpread / 3);
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
  const teams: RelayTeam[] = [japan];
  // 世界の種は以前のまま（いつもの強さの国が変わらないように）。アジアは別の種
  const seedHead = stage === "sekai" ? "relay" : "relay-asia";
  for (const n of relayNations(stage)) {
    const seeded = seededRandom(`${seedHead}|${n.code}|${gender}`);
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
        name: rivalNameOf(n, gender, seededRandom(`${seedHead}|${n.code}|${gender}|${stroke}`)),
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

/** 泳ぎ終えた選手に「今年はその段を泳いだ」を付ける。 */
export function markRelaySwum(members: readonly Student[], stage: RelayStage): void {
  markStage(members, RELAY_STAGE[stage]);
}

/** アジア選手権のリレーで優勝した選手に印を付ける（世界選手権のリレーへ進める）。 */
export function markAsiaRelayWin(members: readonly Student[]): void {
  markStage(members, RELAY_ASIA_WIN);
}

function markStage(members: readonly Student[], stage: string): void {
  for (const s of members) {
    const key = stageEventKey(stage, RELAY_EVENT);
    if (!s.season.clearedStages.includes(key)) s.season.clearedStages.push(key);
  }
}
