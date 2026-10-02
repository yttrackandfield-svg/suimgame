/// <reference types="node" />
/**
 * 研究（会議室）とコーチの指導力の検証。
 *
 *   ・会議室1部屋につき1つの研究（部屋を増やすと並行して進む）
 *   ・コーチ4人1組。班が欠けると止まる
 *   ・同じテーマを重ねてレベルを上げる。上げるほど 効果↑／費用↑／必要ポイント↑／失敗率↑
 *   ・失敗すると費用は戻らず、進捗が半分になって再挑戦
 *   ・研究に参加したコーチは指導力が伸び、指導力は練習効率に効く
 *
 * 実行:
 *   npx esbuild researchcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { createStudent, STAT_KEYS } from "./src/sim/student";
import {
  coachTrainMult,
  coachGrowthMult,
  makeCoach,
  startingTeaching,
  teachingLabel,
  teachingMult,
} from "./src/sim/coach";
import {
  effectSummaryAt,
  isMaxLevel,
  monthlyResearchPoints,
  researchBonusOf,
  researchCostFor,
  researchFailChance,
  researchPointsFor,
  researchTopic,
} from "./src/sim/research";
import { buildSave, applySave } from "./src/save/serialize";
import { migrateSave } from "./src/save/migrate";
import { SAVE_VERSION } from "./src/save/types";
import { COACH, RESEARCH } from "./src/config/balance";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ok  ${label}${detail ? `  — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  NG  ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
function head(s: string): void {
  console.log(`\n=== ${s} ===`);
}

function rng(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const newGame = (seed = 1): GameState => new GameState(rng(seed), { clubName: "研究クラブ" });

/** 会議室と、班を組めるだけのコーチを用意した状態を作る。 */
function ready(seed = 1, rooms = 1, coaches = RESEARCH.groupSize): GameState {
  const st = newGame(seed);
  st.gems = 999999;
  while (st.expandLand().ok) st.gems = 999999;
  for (let i = 0; i < rooms; i++) st.buyEquipment("meeting");
  const rand = rng(seed + 500);
  while (st.coaches.length < coaches) st.coaches.push(makeCoach(rand, st.coaches.length + 100, 3));
  st.gems = 999999;
  return st;
}

// ================================================================ 指導力

head("コーチの指導力（格とは別の、後から伸びる能力）");
{
  const rand = rng(7);
  const rookie = makeCoach(rand, 1, 1);
  const legend = makeCoach(rand, 2, 5);
  ok(rookie.teaching >= 0 && rookie.teaching <= 100, "指導力は0〜100", `${rookie.teaching}`);
  ok(legend.teaching > rookie.teaching, "格が高いほど初期の指導力も高い", `見習い${rookie.teaching} / 伝説${legend.teaching}`);
  ok(startingTeaching(3, rng(1)) > 0, "初期値は格から決まる");

  ok(teachingMult(0) === 1, "指導力0では上乗せなし");
  ok(Math.abs(teachingMult(100) - (1 + COACH.teach.bonusMax)) < 1e-9, "指導力100で上限の上乗せ", `×${teachingMult(100)}`);

  // 同じ格でも指導力で差が出る
  const a = makeCoach(rng(11), 3, 3);
  const b = makeCoach(rng(11), 4, 3);
  a.teaching = 10;
  b.teaching = 90;
  ok(coachTrainMult(b) > coachTrainMult(a), "同じ格でも指導力が高いほど練習効率が良い", `×${coachTrainMult(a).toFixed(2)} → ×${coachTrainMult(b).toFixed(2)}`);
  ok(coachTrainMult(a) >= coachGrowthMult(a.quality), "格ぶんの効果は残る");
  ok(teachingLabel(90) !== teachingLabel(10), "呼び名が変わる", `${teachingLabel(10)} → ${teachingLabel(90)}`);

  // 実際に選手の伸びに効く
  const st = newGame(21);
  const low = makeCoach(rng(31), 900, 3);
  low.teaching = 0;
  st.coaches = [low];
  st.assignHead(low, "senshu");
  const s1 = createStudent(rng(41), 7001, "senshu");
  const s2 = createStudent(rng(41), 7002, "senshu");
  st.students.senshu.push(s1);
  const before1 = STAT_KEYS.reduce((n, k) => n + s1.stats[k], 0);
  st.tickPractice("senshu", 120, undefined, [s1]);
  const gain1 = STAT_KEYS.reduce((n, k) => n + s1.stats[k], 0) - before1;

  const st2 = newGame(21);
  const high = makeCoach(rng(31), 900, 3);
  high.teaching = 100;
  st2.coaches = [high];
  st2.assignHead(high, "senshu");
  st2.students.senshu.push(s2);
  const before2 = STAT_KEYS.reduce((n, k) => n + s2.stats[k], 0);
  st2.tickPractice("senshu", 120, undefined, [s2]);
  const gain2 = STAT_KEYS.reduce((n, k) => n + s2.stats[k], 0) - before2;
  ok(gain2 > gain1, "指導力の高いコーチのほうが選手が伸びる", `+${gain1.toFixed(3)} → +${gain2.toFixed(3)}`);
}

// ================================================================ 部屋と班

head("会議室1部屋につき1つ・コーチ4人1組");
{
  ok(RESEARCH.groupSize === 4, "研究班は4人", `${RESEARCH.groupSize}人`);

  const st = newGame(3);
  st.gems = 999999;
  ok(!st.canStartResearch("form").ok, "会議室が無いと始められない", st.canStartResearch("form").reason ?? "");

  // 会議室はあるが、コーチが足りない
  const few = ready(4, 1, RESEARCH.groupSize - 1);
  const r0 = few.canStartResearch("form");
  ok(!r0.ok, "コーチが3人では始められない", r0.reason ?? "");

  const st1 = ready(5, 1);
  ok(st1.researchSlots() === 1, "会議室1部屋＝研究は1件まで", `${st1.researchSlots()}件`);
  const start = st1.startResearch("form");
  ok(start.ok, "研究を始められる", start.reason ?? "");
  ok(st1.researchProjects.length === 1, "プロジェクトが1件できた");
  const p = st1.researchProjects[0]!;
  ok(p.coachIds.length === RESEARCH.groupSize, "自動で4人の班が組まれる", `${p.coachIds.length}人`);
  ok(st1.membersOf(p).every((c) => c.duty === "research"), "班のコーチは研究に回る");
  ok(!st1.canStartResearch("menu").ok, "部屋が埋まっていると2件目は始められない", st1.canStartResearch("menu").reason ?? "");

  // 2部屋あれば並行できる
  const st2 = ready(6, 2, RESEARCH.groupSize * 2);
  ok(st2.researchSlots() === 2, "会議室2部屋＝2件まで");
  ok(st2.startResearch("form").ok, "1件目");
  const second = st2.startResearch("menu");
  ok(second.ok, "別の部屋で2件目を始められる", second.reason ?? "");
  ok(st2.researchProjects.length === 2, "2件が並行して進む");
  ok(!st2.canStartResearch("start").ok, "3件目は部屋が無い", st2.canStartResearch("start").reason ?? "");

  // 班が欠けると止まる
  const st3 = ready(7, 1);
  st3.startResearch("form");
  const proj = st3.researchProjects[0]!;
  const rateFull = st3.projectRate(proj);
  ok(rateFull > 0, "4人そろっていれば進む", `${Math.round(rateFull)}/月`);
  st3.removeResearchMember(proj.roomId, proj.coachIds[0]!);
  ok(st3.projectRate(proj) === 0, "1人でも欠けると進まない", `${proj.coachIds.length}/${RESEARCH.groupSize}人`);
  ok(st3.fillResearchGroup(proj.roomId) === 1, "空き枠を埋め直せる");
  ok(st3.projectRate(proj) > 0, "そろえばまた進む");

  // 同じコーチを2つの班に入れられない
  const st4 = ready(8, 2, RESEARCH.groupSize * 2);
  st4.startResearch("form");
  const a = st4.researchProjects[0]!;
  st4.startResearch("menu");
  const b = st4.researchProjects[1]!;
  st4.removeResearchMember(b.roomId, b.coachIds[0]!); // 1枠あける
  const dup = st4.addResearchMember(b.roomId, a.coachIds[0]!);
  ok(!dup.ok, "同じコーチは2つの班に入れない", dup.reason ?? "");

  // 会議室を撤去したら研究は止まる（または別の部屋へ移る）
  const st5 = ready(9, 1);
  st5.startResearch("form");
  const room = st5.meetingRooms()[0]!;
  st5.sellEquipment(room);
  ok(st5.researchProjects.length === 0, "会議室を撤去すると研究は止まる");
  ok(st5.coaches.every((c) => c.duty === "idle"), "班のコーチは指導へ戻る");
}

// ================================================================ レベル

head("レベル制（重ねるほど強く・高く・危なく）");
{
  const topic = researchTopic("form")!;
  const costs = [1, 2, 3].map((lv) => researchCostFor(topic, lv));
  ok(
    costs.every((v, i) => i === 0 || v > costs[i - 1]),
    "レベルが上がると費用が上がる",
    costs.map((c) => `◆${c}`).join(" → "),
  );
  const pts = [1, 2, 3].map((lv) => researchPointsFor(topic, lv));
  ok(
    pts.every((v, i) => i === 0 || v > pts[i - 1]),
    "必要ポイントも増える",
    pts.join(" → "),
  );
  ok(researchFailChance(1) === 0, "Lv1（初めての研究）は必ず成功する");
  const fails = [2, 3, 4].map((lv) => researchFailChance(lv));
  ok(
    fails.every((v, i) => i === 0 || v > fails[i - 1]),
    "Lv2以降は上げるほど失敗しやすい",
    fails.map((f) => `${Math.round(f * 100)}%`).join(" → "),
  );
  ok(
    researchFailChance(3, 100) < researchFailChance(3, 0),
    "指導力が高い班ほど失敗しにくい",
    `${Math.round(researchFailChance(3, 0) * 100)}% → ${Math.round(researchFailChance(3, 100) * 100)}%`,
  );

  // 効果はレベルに比例
  const b1 = researchBonusOf({ form: 1 });
  const b3 = researchBonusOf({ form: 3 });
  ok(b3.stat.form > b1.stat.form, "レベルが上がると効果が強くなる", `×${b1.stat.form.toFixed(2)} → ×${b3.stat.form.toFixed(2)}`);
  ok(
    Math.abs(b3.stat.form - 1 - (b1.stat.form - 1) * 3) < 1e-9,
    "効果はレベルに比例する（Lv3＝3倍）",
  );
  ok(effectSummaryAt(topic, 3) !== effectSummaryAt(topic, 1), "説明文もレベルで変わる", effectSummaryAt(topic, 3));
  ok(isMaxLevel(RESEARCH.maxLevel), `Lv${RESEARCH.maxLevel} で打ち止め`);
}

// ================================================================ 進行・成功・失敗

head("月ごとの進行（成功／失敗と指導力の伸び）");
{
  // Lv1 は必ず成功する
  const st = ready(11, 1);
  st.startResearch("start");
  const proj = st.researchProjects[0]!;
  const before = new Map(st.membersOf(proj).map((c) => [c.id, c.teaching]));
  const memberIds = [...before.keys()];
  let done: ReturnType<GameState["advanceMonth"]>["researchDone"] = [];
  for (let m = 0; m < 24 && done.length === 0; m++) done = st.advanceMonth().researchDone;
  ok(done.length === 1 && done[0]!.success, "Lv1 の研究は成功する", done[0] ? `${done[0].label} Lv${done[0].level}` : "");
  ok(st.researchLevelOf("start") === 1, "テーマが Lv1 になった");
  ok(st.researchBonus().stat.start > 1, "効果が効きはじめた", `×${st.researchBonus().stat.start.toFixed(2)}`);
  ok(st.researchProjects.length === 0, "終わった研究は片付く（班は解散）");
  ok(st.coaches.every((c) => c.duty === "idle"), "コーチは指導へ戻る");
  const after = st.coaches.filter((c) => before.has(c.id));
  ok(
    after.length === memberIds.length && after.every((c) => c.teaching > (before.get(c.id) ?? 0)),
    "研究に参加したコーチ全員の指導力が伸びた",
    `${Math.round(before.get(memberIds[0]!) ?? 0)} → ${Math.round(after[0]?.teaching ?? 0)}`,
  );

  // 研究中は毎月ちょっとずつ伸びる
  const st2 = ready(12, 1);
  st2.startResearch("menu");
  const p2 = st2.researchProjects[0]!;
  const t0 = st2.membersOf(p2)[0]!.teaching;
  st2.advanceMonth();
  const t1 = st2.membersOf(p2)[0]?.teaching ?? t0;
  ok(t1 > t0, "研究の途中でも指導力は伸びる", `${t0.toFixed(1)} → ${t1.toFixed(1)}`);

  // 失敗すると進捗が半分になり、レベルは上がらない
  const st3 = ready(13, 1);
  st3.setResearch([], { turn: 3 }); // Lv4 を狙う＝失敗しやすい
  st3.startResearch("turn");
  const p3 = st3.researchProjects[0]!;
  const need = st3.projectPoints(p3);
  ok(st3.projectFailChance(p3) > 0, "高いレベルには失敗の見込みがある", `${Math.round(st3.projectFailChance(p3) * 100)}%`);

  // 必ず失敗させる（乱数を固定して判定を通す）
  p3.progress = need;
  (st3 as unknown as { rand: () => number }).rand = () => 0; // 0 < 失敗率 → 失敗
  const r3 = st3.advanceMonth().researchDone;
  ok(r3.length === 1 && !r3[0]!.success, "失敗することがある");
  ok(st3.researchLevelOf("turn") === 3, "失敗ではレベルが上がらない", `Lv${st3.researchLevelOf("turn")}`);
  ok(st3.researchProjects.length === 1, "研究はそのまま残る（再挑戦できる）");
  ok(
    st3.researchProjects[0]!.progress <= need * RESEARCH.failKeepProgress + 1,
    "進捗が半分に減る",
    `${need} → ${Math.round(st3.researchProjects[0]!.progress)}`,
  );

  // 必ず成功させる
  (st3 as unknown as { rand: () => number }).rand = () => 1;
  st3.researchProjects[0]!.progress = need;
  const r4 = st3.advanceMonth().researchDone;
  ok(r4.length === 1 && r4[0]!.success, "もう一度挑戦して成功できる");
  ok(st3.researchLevelOf("turn") === 4, "レベルが1つ上がる", `Lv${st3.researchLevelOf("turn")}`);
}

// ================================================================ 進捗の速さ

head("進捗の速さ（人数・格・指導力・部屋数）");
{
  const g = (q: number, t: number) => ({ quality: q, teaching: t });
  const four = [g(3, 0), g(3, 0), g(3, 0), g(3, 0)];
  ok(monthlyResearchPoints(four.slice(0, 3), 1) === 0, "3人では進まない");
  ok(monthlyResearchPoints(four, 1) > 0, "4人そろえば進む", `${Math.round(monthlyResearchPoints(four, 1))}/月`);
  ok(
    monthlyResearchPoints([g(5, 0), g(5, 0), g(5, 0), g(5, 0)], 1) > monthlyResearchPoints(four, 1),
    "格が高い班のほうが速い",
  );
  ok(
    monthlyResearchPoints([g(3, 100), g(3, 100), g(3, 100), g(3, 100)], 1) > monthlyResearchPoints(four, 1),
    "指導力が高い班のほうが速い",
  );
  ok(monthlyResearchPoints(four, 2) > monthlyResearchPoints(four, 1), "会議室が多いほど少し速い");
  ok(monthlyResearchPoints(four, 0) === 0, "会議室が無ければ進まない");
}

// ================================================================ セーブ

head(`セーブ v${SAVE_VERSION}`);
{
  ok(SAVE_VERSION === 32, "セーブバージョンが32（v32＝施設の値上げ・払った額・記録会のコーチとの出会い）", `${SAVE_VERSION}`);

  const st = ready(21, 2, RESEARCH.groupSize * 2);
  st.startResearch("form");
  st.startResearch("menu");
  st.setResearch(st.researchProjects, { ...st.researchLevels, start: 2 });
  st.coaches[0]!.teaching = 77;
  const save = buildSave(st, new GameClock(), 0);

  ok(save.game.researchProjects.length === 2, "進行中の研究が保存される");
  ok(save.game.researchLevels.start === 2, "到達レベルが保存される");
  ok(save.game.coaches[0]!.teaching === 77, "指導力が保存される");

  const st2 = newGame(22);
  applySave(JSON.parse(JSON.stringify(save)), st2, new GameClock());
  ok(st2.researchProjects.length === 2, "読み込んでも2件のまま");
  ok(st2.researchLevelOf("start") === 2, "レベルも戻る");
  ok(st2.coaches.find((c) => c.id === st.coaches[0]!.id)?.teaching === 77, "指導力も戻る");
  ok(
    st2.researchProjects.every((p) => p.coachIds.length === RESEARCH.groupSize),
    "班の顔ぶれも戻る",
    st2.researchProjects.map((p) => p.coachIds.length).join("/"),
  );
  ok(st2.researchCoaches().every((c) => c.duty === "research"), "duty も揃っている");

  // v14（同時に1つ・doneResearch）からの移行
  const v14 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  v14.version = 14;
  const game = v14.game as Record<string, unknown>;
  delete game.researchProjects;
  delete game.researchLevels;
  game.research = { id: "power", progress: 30 };
  game.doneResearch = ["form", "menu"];
  for (const c of game.coaches as Record<string, unknown>[]) delete c.teaching;

  const m = migrateSave(v14);
  ok(m.ok, "v14 のセーブを読み込める", m.ok ? "" : m.reason);
  if (m.ok) {
    ok(m.data.game.researchLevels.form === 1, "完了済みの研究は Lv1 として引き継ぐ");
    ok(m.data.game.researchLevels.menu === 1, "もう1件も Lv1");
    ok(m.data.game.researchProjects.length === 1, "進行中だった研究は残る");
    ok(m.data.game.researchProjects[0]!.targetLevel === 1, "Lv1 を目指す途中として引き継ぐ");
    ok((m.data.game.coaches[0]!.teaching ?? 0) > 0, "指導力は格から見積もる", `${m.data.game.coaches[0]!.teaching}`);

    const st3 = newGame(23);
    applySave(m.data, st3, new GameClock());
    ok(st3.researchLevelOf("form") === 1, "移行後も効果が残っている");
    ok(st3.researchBonus().stat.form > 1, "フォームの補正が効いている", `×${st3.researchBonus().stat.form.toFixed(2)}`);
    ok(st3.researchProjects.every((p) => p.roomId >= 0), "研究は会議室に割り当て直される");
  }
}

// ================================================================

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
