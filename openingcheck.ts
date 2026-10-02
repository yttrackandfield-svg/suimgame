/// <reference types="node" />
/**
 * 初年度（4月の地区予選）の手応えの検証。
 *
 * ゲームは4月＝地区予選の月から始まるので、**初期名簿の強さがそのまま初日の祝い金になる**。
 * 2026-10-02 までは新規ゲームの 89% が初日に地区予選で優勝し（◆1万）、
 * 県予選を勝ってブロックまで進むこともあった。狙いは「誰かが地区予選の決勝に残る」くらい。
 *
 * 新規ゲームを N 回作り、育成B以上の全員について
 *   ・地区予選：得意な順に3種目まで出す（決勝に残るか・優勝するか）
 *   ・勝てば（選手・プロだけ）県予選 → ブロック予選
 *   ・記録会ラダー：1年（12回）でどの段まで登れるか
 * を数える。練習による伸びは入れていない（4〜6月の伸びは小さい）。
 *
 * 実行:
 *   npx esbuild openingcheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { performanceIndex, type RaceEvent, type Student } from "./src/sim/student";
import { CALENDAR, areaEventsFor, finalWallOf, kirokukaiOf, rivalLevelOf } from "./src/sim/competitions";
import { simulateRace } from "./src/sim/race";
import { lifeStageOf } from "./src/sim/growth";
import { CLASS_ORDER, canEnterCompetition } from "./src/sim/classes";

const N = 400;
let seed = 20261002;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail = ""): void {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "ok" : "NG"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const race = (s: Student, ev: RaceEvent, comp: (typeof CALENDAR)[number]) =>
  simulateRace([{ student: s, extraFactor: 1 }], ev, rivalLevelOf(comp), rand, finalWallOf(comp)).entrants[0];

let areaFinal = 0;
let areaWin = 0;
let kenWin = 0;
let kk2 = 0;
const piByClass: Record<string, number[]> = {};

for (let g = 0; g < N; g++) {
  const st = new GameState(rand);
  let final = false;
  let win = false;
  let ken = false;
  let kkTop = 0;
  for (const c of CLASS_ORDER) {
    if (!["ikuseiB", "ikuseiA", "senshu", "pro"].includes(c.id)) continue;
    for (const s of st.students[c.id]) {
      const evs = [...areaEventsFor(s)].sort((a, b) => performanceIndex(s, b) - performanceIndex(s, a));
      (piByClass[c.id] ??= []).push(performanceIndex(s, evs[0] ?? s.fav));

      // 記録会ラダー（毎月1回、勝てば次の段へ）
      let tier = 0;
      for (let m = 0; m < 12 && tier < 6; m++) {
        if (race(s, evs[0] ?? s.fav, kirokukaiOf(4, tier)).win) tier++;
      }
      kkTop = Math.max(kkTop, tier);

      const stage = lifeStageOf(s.grade);
      if (stage !== "elementary" && stage !== "middle" && stage !== "high") continue;
      const ladder = CALENDAR.filter((x) => x.route === stage).sort((a, b) => a.month - b.month);
      let wonEv: RaceEvent | null = null;
      for (const ev of evs.slice(0, 3)) {
        const e = race(s, ev, ladder[0]);
        if (e.advanced) final = true;
        if (e.win && !wonEv) wonEv = ev;
      }
      if (!wonEv) continue;
      win = true;
      if (!canEnterCompetition(c.id)) continue;
      if (race(s, wonEv, ladder[1]).win) ken = true;
    }
  }
  if (final) areaFinal++;
  if (win) areaWin++;
  if (ken) kenWin++;
  if (kkTop >= 2) kk2++;
}

const pct = (n: number): string => `${((n / N) * 100).toFixed(0)}%`;
console.log(`\n=== 初期名簿の能力指数（得意種目） 新規ゲーム ${N} 回 ===`);
for (const [k, v] of Object.entries(piByClass)) {
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(`  ${k.padEnd(8)} 平均 ${avg.toFixed(1)}  最大 ${Math.max(...v).toFixed(1)}`);
}
console.log("\n=== 初日の地区予選 ===");
ok(areaFinal / N >= 0.9, "ほぼ毎回、誰かが地区予選の決勝に残る", pct(areaFinal));
ok(areaWin / N <= 0.2, "地区予選の優勝はたまに", pct(areaWin));
ok(kenWin / N <= 0.02, "県予選まで勝ち抜くことはまず無い", pct(kenWin));
ok(kk2 / N <= 0.05, "1年目の記録会で県記録会より上には登れない", pct(kk2));

console.log(`\n${pass} ok / ${fail} NG`);
if (fail > 0) process.exitCode = 1;
