/// <reference types="node" />
/**
 * 勝ち上がりの通し検証（2026-10-09）。
 *
 * 「小学生が地区予選で優勝したのに、都道府県予選にエントリーされない」の再現と確認。
 * 画面（FacilityScene.checkMeets / runNextRace）と同じ順で、週ごとに
 *   出場確認（地区は候補をそのまま申し込む／その先は autoEnterQualified）→ 開催日のレースを泳ぐ
 * を回し、4月の地区予選から9月の世界大会まで、**勝ったら次にエントリーされているか**を見る。
 * 小・中・高それぞれ、育成B／育成A／選手のクラスに1人ずつ置く。
 *
 * 実行:
 *   npx esbuild meetflowcheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { createStudent, type StatKey, type Student } from "./src/sim/student";
import { CALENDAR, hasClearedStage, type Competition } from "./src/sim/competitions";
import type { ClassId } from "./src/sim/classes";

let seed = 20261009;
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

const g = new GameState(rand);
g.gems = 10_000_000;
// 開始時の生徒は外す（検証する子だけにする）
for (const k of Object.keys(g.students) as ClassId[]) g.students[k] = [];

let nextId = 90000;
/** 年代の上限いっぱいまで育てた子（勝ち上がれる強さ）。 */
function mk(classId: ClassId, grade: string): Student {
  const s = createStudent(rand, nextId++, classId);
  s.grade = grade;
  s.gender = "m";
  s.fav = { stroke: "free", distance: 100 };
  for (const k of ["speed", "stamina", "form", "start", "turn"] as StatKey[]) s.stats[k] = 100;
  s.strokeProf.free = 999;
  s.injuryDays = 0;
  s.season = { year: g.year, clearedStages: [], standards: [], standardEvents: [] };
  g.students[classId].push(s);
  return s;
}

/** 検証する子：小中高 × 育成B・育成A・選手。種目を分けて、同じレースで潰し合わないようにする。 */
const kids: { s: Student; label: string; route: "el" | "mid" | "hi" }[] = [];
const strokes = ["free", "back", "breast"] as const;
for (const [route, grade, label] of [
  ["el", "小5", "小学生"],
  ["mid", "中2", "中学生"],
  ["hi", "高2", "高校生"],
] as const) {
  (["ikuseiB", "ikuseiA", "senshu"] as ClassId[]).forEach((cls, i) => {
    const s = mk(cls, grade);
    s.fav = { stroke: strokes[i], distance: 100 };
    s.strokeProf[strokes[i]] = 999;
    kids.push({ s, label: `${label}（${cls}）`, route });
  });
}

/** 何に出て、どこまで勝ったか。 */
const entered = new Map<number, string[]>();
const won = new Map<number, string[]>();

/** 画面の checkMeets と同じ：開催日のレースを泳ぐ → 出場確認を出す。 */
function checkMeets(): void {
  for (const race of g.racesDue()) {
    const go = g.takePendingRace(race);
    if (!go.comp || go.roster.length === 0) continue;
    const r = g.enterCompetition(go.roster, go.comp, go.event, { prepaid: go.prepaid });
    for (const e of r.entries) {
      if (e.entrant.win) won.set(e.student.id, [...(won.get(e.student.id) ?? []), go.comp.id]);
    }
  }
  for (const comp of g.majorsNeedingConfirm()) {
    g.markConfirmAsked(comp.id);
    // 地区は自分で選ぶ（候補を全部申し込む）。その先は勝ち上がった子が自動で入る
    if (comp.requiresPrev) g.autoEnterQualified(comp);
    else {
      // 地区は1人につき種目が何行も並ぶので、得意種目だけ（のべ上限に引っかからないように）
      const picks = g
        .majorConfirmCandidates(comp)
        .filter((c) => c.event.stroke === c.student.fav.stroke && c.event.distance === c.student.fav.distance);
      const r = g.setMajorEntries(comp, picks);
      if (!r.ok) console.log(`  (${comp.name} の申し込みに失敗：${r.reason})`);
    }
    for (const c of g.majorEntriesOf(comp)) {
      entered.set(c.student.id, [...(entered.get(c.student.id) ?? []), comp.id]);
    }
  }
}

// 4月第1週 → 10月の頭まで（4〜9月の6段ぶん）
console.log(`開始：${g.year}年 ${g.month}月 dayCount=${g.dayCount}`);
checkMeets();
while (g.month < 10) {
  g.onDayRoll();
  if (g.dayCount % 4 === 0) g.advanceMonth();
  if (g.month >= 10) break; // 10月からは一般ルート（日本選手権）。ここでは見ない
  // ケガ・遠征で「勝ったのに出られない」を混ぜない（ここで見たいのはエントリーの仕組み）
  for (const k of kids) {
    k.s.injuryDays = 0;
    k.s.awayDays = 0;
  }
  checkMeets();
}

console.log("\n=== 勝ったら次の大会にエントリーされるか（小・中・高 × 育成B・育成A・選手）===");
const ladderOf = (route: string): Competition[] =>
  CALENDAR.filter((c) => c.id.startsWith(`${route}_`)).sort((a, b) => a.month - b.month);
for (const k of kids) {
  const ladder = ladderOf(k.route);
  const ent = entered.get(k.s.id) ?? [];
  const w = won.get(k.s.id) ?? [];
  const path = ladder.map((c) => `${c.name.replace(/（.*）/, "")}${w.includes(c.id) ? "◎" : ent.includes(c.id) ? "×" : "－"}`);
  console.log(`\n  ${k.label}  ${path.join(" → ")}`);
  ok(ent.includes(ladder[0].id), `${k.label} 地区予選にエントリー`);
  for (let i = 0; i < ladder.length - 1; i++) {
    if (!w.includes(ladder[i].id)) continue;
    ok(
      ent.includes(ladder[i + 1].id),
      `${k.label} ${ladder[i].name}で優勝 → ${ladder[i + 1].name}にエントリー`,
      hasClearedStage(k.s, ladder[i].id) ? "" : "（勝ち上がりの記録が無い）",
    );
  }
  const reached = ladder.filter((c) => ent.includes(c.id)).length;
  ok(reached === ladder.length, `${k.label} 世界大会まで出場`, `${reached}/${ladder.length}段`);
}

console.log(`\n${pass} ok / ${fail} NG`);
process.exit(fail > 0 ? 1 : 0);
