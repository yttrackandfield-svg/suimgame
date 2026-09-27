/**
 * 育成〜プロの「コマを増やすと何が変わるか」の検証。
 *
 * 決めごと：
 *   ・コマを増やしても**定員は増えない**（定員はプールのレーン数だけで決まる）
 *   ・そのかわり**練習回数が増える**ので、伸びは大きくなる
 *   ・ただし**疲労が溜まりやすくなる**（体力・コンディションが落ち、ケガも増える）
 * ＝「詰め込めば強くなるが、潰れるかもしれない」という選択にする。
 *
 * 実行:
 *   npx esbuild slotcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { CLASS_ORDER, type ClassId } from "./src/sim/classes";
import { membersOfClass } from "./src/sim/lineup";
import { CLOCK } from "./src/config/balance";
import { createStudent, energyMax, overallAbility, type Student } from "./src/sim/student";
import { laneSlotsOf } from "./src/sim/equipment";
import { slotAtMinute, SLOTS } from "./src/sim/timetable";

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

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/**
 * FacilityScene.update() と同じ順序で1フレーム進める。
 *
 * **コマが終わったら endClassSession を呼ぶ**ところが肝。
 * 実機は syncActiveClass がクラスの切り替わりで呼んでいて、そこで
 * 「コマの合間の休憩（体力が少し戻る）」が起きる。ここを省くと
 * 2コマ目以降がまるごと空振りになり、測定結果が実機とずれる。
 */
function frame(st: GameState, clock: GameClock, live: Set<ClassId>): void {
  const res = clock.tick(CLOCK.msPerMinute * 5);
  const lineup = st.lineupAt(clock.minuteOfDay);
  const running = st.activeClassIds(clock.minuteOfDay);
  const members = new Map<ClassId, Student[]>();
  for (const cls of running) members.set(cls, membersOfClass(lineup, cls));

  // 終わったコマを閉じる（合間の休憩＝体力が一部戻る）
  for (const cls of [...live]) {
    if (!running.includes(cls)) {
      st.endClassSession(cls);
      live.delete(cls);
    }
  }
  const slot = slotAtMinute(clock.minuteOfDay);
  for (const cls of running) {
    const mem = members.get(cls) ?? [];
    st.beginClassSession(cls, mem, slot);
    live.add(cls);
    if (res.minutesAdvanced > 0) st.tickPractice(cls, res.minutesAdvanced, undefined, mem);
  }
  if (res.dayRolled) {
    for (const c of CLASS_ORDER) {
      st.endClassSession(c.id);
      live.delete(c.id);
    }
    st.onDayRoll();
    if (res.weekToMonth) st.advanceMonth();
  }
}

interface Measured {
  slots: number;
  capacity: number;
  gain: number; // 総合能力の伸び（平均）
  steps: number; // 練習した回数（平均）
  energy: number; // 1日の底の体力（平均％）
  condition: number; // 日々のコンディション（平均）
  injuries: number; // 期間中に起きたケガの回数
  sessions: number; // 開講できたコマ数
}

/**
 * ikuseiA に n コマ割り当てて days 日ぶん回し、伸びと疲れを測る。
 * support＝回復の手当て（大浴場・サウナ・食堂＋栄養士）をした状態で測る。
 */
function runOnce(classId: ClassId, slotCount: number, days: number, support: boolean, seed: number): Measured {
  const st = new GameState(rng(seed), { clubName: "コマ検証" });
  const clock = new GameClock();
  st.gems = 999999;

  // コーチを一通り雇う（コマごとに別のコーチが要る）
  for (let i = 0; i < 3; i++) {
    for (const cand of st.generateRecruits()) st.hireCoach(cand);
  }

  // 疲労の手当て：大浴場・サウナで抜き、栄養士で回復を底上げする
  if (support) {
    st.buyEquipment("bath");
    st.buyEquipment("sauna");
    st.buyEquipment("cafeteria");
    st.hireStaff("nutritionist");
    st.hireStaff("nutritionist");
  }

  // 対象クラス以外のコマは外し、対象クラスを slotCount コマ入れる
  st.timetable = [];
  const pool = st.equipment.find((e) => e.gx != null && (e.kind === "pool6" || e.kind === "pool8"));
  if (!pool) throw new Error("プールが無い");
  for (let i = 0; i < slotCount; i++) {
    st.setTimetableEntry(pool.id, i % SLOTS.length, classId, null);
  }
  st.autoAssignCoaches();

  // 同じ顔ぶれで比べる（種を固定して作る）
  st.students[classId] = [];
  const squad: Student[] = [];
  for (let i = 0; i < 8; i++) {
    const s = createStudent(rng(seed * 7 + 9000 + i), 30000 + i, classId);
    s.grade = "高1";
    s.injuryDays = 0;
    s.condition = 70;
    squad.push(s);
  }
  st.students[classId].push(...squad);
  const before = squad.map((s) => overallAbility(s));

  const live = new Set<ClassId>();
  let dayCount = 0;
  let guard = 0;
  // 体力は「1日の底」、コンディションは「日々の平均」で見る（day roll で戻る前後を混ぜない）
  let energyFloor = 100;
  let condSum = 0;
  let condSamples = 0;
  let injuries = 0;
  const hurt = new Set<number>();
  while (dayCount < days && guard < 2_000_000) {
    guard++;
    const before = st.dayCount;
    frame(st, clock, live);
    for (const s of squad) {
      energyFloor = Math.min(energyFloor, (s.energy / Math.max(1, energyMax(s))) * 100);
      // 同じケガを何度も数えない（治ってから再発したら1回と数える）
      if (s.injuryDays > 0 && !hurt.has(s.id)) {
        hurt.add(s.id);
        injuries++;
      } else if (s.injuryDays <= 0) {
        hurt.delete(s.id);
      }
    }
    if (st.dayCount !== before) {
      dayCount++;
      condSum += squad.reduce((n, s) => n + s.condition, 0) / squad.length;
      condSamples++;
    }
  }
  // 実際に開講できたコマ数（コーチが足りなければここが減る）
  const sessions = st.activeTimetable().filter((e) => e.classId === classId).length;

  const after = squad.map((s) => overallAbility(s));
  const gain = after.reduce((n, v, i) => n + (v - before[i]), 0) / squad.length;
  const steps =
    squad.reduce((n, s) => n + Object.values(s.trainCount).reduce((a, b) => a + b, 0), 0) / squad.length;
  const energy = energyFloor;
  const condition = condSamples > 0 ? condSum / condSamples : 0;

  return { slots: slotCount, capacity: st.capacityOf(classId), gain, steps, energy, condition, injuries, sessions };
}

/**
 * 同じ条件を何度か回して平均を取る。
 * ケガやコンディションの揺れで1回きりの測定はぶれるので、傾向はこちらで見る。
 */
function run(classId: ClassId, slotCount: number, days: number, support = false): Measured {
  const seeds = [4242, 8181, 1357, 9753];
  const runs = seeds.map((seed) => runOnce(classId, slotCount, days, support, seed));
  const avg = (pick: (m: Measured) => number): number => runs.reduce((n, r) => n + pick(r), 0) / runs.length;
  return {
    slots: slotCount,
    capacity: runs[0].capacity,
    gain: avg((r) => r.gain),
    steps: avg((r) => r.steps),
    energy: avg((r) => r.energy),
    condition: avg((r) => r.condition),
    injuries: avg((r) => r.injuries),
    sessions: runs[0].sessions,
  };
}

// ------------------------------------------------------------------ 1. 定員はコマで増えない

head("1. 育成〜プロは、コマを増やしても定員が増えない");
{
  for (const cls of ["ikuseiB", "ikuseiA", "senshu", "pro"] as ClassId[]) {
    const a = run(cls, 1, 2);
    const b = run(cls, 3, 2);
    ok(a.capacity === b.capacity, `${cls}：1コマでも3コマでも定員は同じ`, `${a.capacity}人`);
  }
}

// ------------------------------------------------------------------ 2. コマを増やすと伸びる・疲れる

head("2. コマを増やすと練習回数が増え、伸びるが疲れる（育成A・2週間）");
{
  const days = 14;
  const rows = [1, 2, 3, 4].map((n) => run("ikuseiA", n, days));
  console.log("  コマ  定員   練習回数   伸び    体力の底   調子(平均)   ケガ");
  for (const r of rows) {
    console.log(
      `   ${r.slots}    ${String(r.capacity).padStart(3)}   ${r.steps.toFixed(0).padStart(6)}  ${r.gain.toFixed(2).padStart(6)}  ` +
        `${r.energy.toFixed(0).padStart(8)}%  ${r.condition.toFixed(0).padStart(9)}   ${r.injuries}回`,
    );
  }
  ok(rows[1].steps > rows[0].steps * 1.15, "2コマは練習回数が増える", `${rows[0].steps.toFixed(0)} → ${rows[1].steps.toFixed(0)}回`);
  ok(rows[2].steps > rows[1].steps, "3コマはさらに増える", `${rows[1].steps.toFixed(0)} → ${rows[2].steps.toFixed(0)}回`);
  ok(rows[1].gain > rows[0].gain * 1.05, "2コマはそのぶん伸びる", `${rows[0].gain.toFixed(2)} → ${rows[1].gain.toFixed(2)}`);
  // 3コマ目からは「回数は増えるのに、疲労で相殺されて伸びない」。
  // 伸ばしたければ回復の手当て（風呂・サウナ・栄養士）が要る＝3の節で確かめる。
  // 【1.10 まで許す理由】泳法練習に「関係する能力が少し伸びる」副産物が付いた（→ STROKE.statFocus）。
  // そのぶんコマ数に比例する成分がわずかに残るので、完全な横ばいにはならない。
  // 見たいのは「1→2コマの伸び幅（+30%以上）に比べて、2→3コマはごくわずか」という形。
  // 【伸びの形で見る】育成の速さを落としたので（能力が上限に届くのはプロになってから）、
  // 固定の幅（2→3コマで +10% まで）では測れなくなった。見たいのは形なので、
  // 「2→3コマの伸び率が、1→2コマの伸び率の 1/3 程度まで落ちる」ことを見る。
  ok(
    (rows[2].gain - rows[1].gain) / rows[1].gain <= ((rows[1].gain - rows[0].gain) / rows[0].gain) * 0.35,
    "3コマ以上は頭打ちに近づく（疲労で相殺される）",
    `1→2コマ +${(((rows[1].gain - rows[0].gain) / rows[0].gain) * 100).toFixed(0)}% ／ ` +
      `2→3コマ +${(((rows[2].gain - rows[1].gain) / rows[1].gain) * 100).toFixed(0)}%`,
  );
  ok(
    rows[2].steps < rows[0].steps * 3,
    "ただし回数はコマ数ぶんまで増えない（体力が続かない）",
    `1コマ×3=${(rows[0].steps * 3).toFixed(0)} / 3コマ=${rows[2].steps.toFixed(0)}回`,
  );
  // 【なぜ 1.05 まで許すか】持久力を鍛えた選手は4コマ目も泳ぎきれる設計なので、
  // ぴったり頭打ちにはならない。「増えてもごくわずか（＝割に合わない）」を見る
  ok(
    rows[3].gain <= rows[2].gain * 1.05,
    "4コマは詰め込みすぎ（回数だけ増えて伸びはほとんど増えない）",
    `3コマ ${rows[2].gain.toFixed(2)} → 4コマ ${rows[3].gain.toFixed(2)}`,
  );
  ok(
    rows[3].condition < rows[0].condition - 10,
    "コマが多いほど調子が落ちる（疲労が溜まる）",
    `1コマ ${rows[0].condition.toFixed(0)} → 4コマ ${rows[3].condition.toFixed(0)}`,
  );
}

// ------------------------------------------------------------------ 3. 手当てをすれば詰め込みが活きる

head("3. 回復設備と栄養士があれば、コマを増やした甲斐がある（育成A・2週間）");
{
  const days = 14;
  const bare = [1, 2, 3].map((n) => run("ikuseiA", n, days));
  const kept = [1, 2, 3].map((n) => run("ikuseiA", n, days, true));
  console.log("  コマ   手当てなし(伸び/調子)   手当てあり(伸び/調子)");
  for (let i = 0; i < bare.length; i++) {
    console.log(
      `   ${bare[i].slots}        ${bare[i].gain.toFixed(2)} / ${bare[i].condition.toFixed(0)}` +
        `            ${kept[i].gain.toFixed(2)} / ${kept[i].condition.toFixed(0)}`,
    );
  }
  ok(
    kept[2].condition > bare[2].condition,
    "手当てをすると3コマでも調子が保てる",
    `${bare[2].condition.toFixed(0)} → ${kept[2].condition.toFixed(0)}`,
  );
  ok(kept[2].gain > kept[1].gain, "手当てがあれば3コマは2コマより伸びる", `${kept[1].gain.toFixed(2)} → ${kept[2].gain.toFixed(2)}`);
  ok(kept[2].gain > bare[2].gain, "同じ3コマでも手当てをした方が伸びる", `${bare[2].gain.toFixed(2)} → ${kept[2].gain.toFixed(2)}`);
}

// ------------------------------------------------------------------ 4. スクールはコマごとに別の子が来る

head("4. 幼児・学童はコマを増やすと受け入れ人数が増える（1人は1コマだけ）");
{
  const st = new GameState(rng(555), { clubName: "スクール検証" });
  const clock = new GameClock();
  st.gems = 999999;
  for (let i = 0; i < 3; i++) for (const cand of st.generateRecruits()) st.hireCoach(cand);
  st.timetable = [];
  const pool = st.equipment.find((e) => e.gx != null && (e.kind === "pool6" || e.kind === "pool8"));
  if (!pool) throw new Error("プールが無い");
  st.setTimetableEntry(pool.id, 1, "gakudo", null);
  st.setTimetableEntry(pool.id, 2, "gakudo", null);
  st.autoAssignCoaches();

  const cap1 = laneSlotsOf(pool.kind);
  ok(st.capacityOf("gakudo") === cap1 * 2, "コマを2つにすると定員が2倍", `${st.capacityOf("gakudo")}人`);

  // 1コマの枠より多い人数を入れる（＝2コマ目にあふれる）
  st.students.gakudo = [];
  const kids: Student[] = [];
  for (let i = 0; i < cap1 + 12; i++) {
    const s = createStudent(rng(7000 + i), 40000 + i, "gakudo");
    kids.push(s);
  }
  st.students.gakudo.push(...kids);

  const live = new Set<ClassId>();
  let day = 0;
  let guard = 0;
  while (day < 3 && guard < 200000) {
    guard++;
    const before = st.dayCount;
    frame(st, clock, live);
    if (st.dayCount !== before) day++;
  }

  const counts = kids.map((s) => Object.values(s.trainCount).reduce((a, b) => a + b, 0));
  const trained = counts.filter((n) => n > 0).length;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  ok(trained === kids.length, "全員がどこかのコマで練習している", `${trained}/${kids.length}人`);
  // 1人1コマなので、練習回数は全員だいたい同じ（2コマぶん練習する子がいない）
  ok(max <= min * 1.35 + 2, "同じ子が2コマぶん練習していない", `最多${max}回 / 最少${min}回`);
}

// ================================================================ 同じ時間に2プール

head("5. 幼児・学童は同じ時間に2プールで開ける（育成以上は開けない）");
{
  const st = new GameState(rng(556), { clubName: "同時開講検証" });
  st.gems = 9_999_999;
  while (st.expandLand().ok) st.gems = 9_999_999; // 2本目のプールを置く場所
  st.buyEquipment("pool6");
  // 2本並べるにはコーチが2人要る。コーチ室を建てないと雇用上限が1人のまま
  // （UNLOCK.coachroom はクラブの格2が要るので、先にクラブを育てた状態にする）
  st.popularity = 600;
  st.clubAchievement = 2000;
  st.refreshClubRank();
  while (st.coaches.length < 3) {
    if (st.coachCapacity() <= st.coaches.length && !st.buyEquipment("coachroom").ok) break;
    const cand = st.generateRecruits()[0];
    if (!cand || !st.hireCoach(cand).ok) break;
  }
  ok(st.coaches.length >= 2, "コーチが2人以上いる", `${st.coaches.length}人`);
  st.timetable = [];
  const [p1, p2] = st.placedPools();
  ok(!!p1 && !!p2, "プールが2本ある", `${st.placedPools().length}本`);

  // --- スクールは同じ時間に重ねられる
  const a = st.setTimetableEntry(p1.id, 2, "gakudo", st.coaches[0].id);
  ok(a.ok, "1本目に学童を入れられる", a.reason ?? "");
  const b = st.setTimetableEntry(p2.id, 2, "gakudo", st.coaches[1].id);
  ok(b.ok, "同じ時間に2本目でも学童を開ける", b.reason ?? "");

  // 定員はプール2本ぶんに増える
  const want = laneSlotsOf(p1.kind) + laneSlotsOf(p2.kind);
  ok(st.capacityOf("gakudo") === want, "定員が2本ぶんになる", `${st.capacityOf("gakudo")}人`);

  // --- 同じ子が2箇所に出ない（1人は1コマだけ）
  st.students.gakudo = [];
  for (let i = 0; i < laneSlotsOf(p1.kind) + 12; i++) {
    st.students.gakudo.push(createStudent(rng(7700 + i), 41000 + i, "gakudo"));
  }
  const lineup = st.lineupAt(SLOTS[2].start + 10);
  const ids = lineup.flatMap((l) => l.members.map((m) => m.id));
  ok(ids.length === new Set(ids).size, "同じ子が2箇所に出ない", `${ids.length}人`);
  ok(
    membersOfClass(lineup, "gakudo").length === st.students.gakudo.length,
    "在籍ぜんいんがどちらかのプールに入る",
    `${membersOfClass(lineup, "gakudo").length}/${st.students.gakudo.length}人`,
  );
  // 1本目から順に埋まる（あとから足したコマに、あふれたぶんだけ入る）
  ok(st.assignedCount(p1.id, 2) === laneSlotsOf(p1.kind), "1本目は枠いっぱい", `${st.assignedCount(p1.id, 2)}人`);
  ok(st.assignedCount(p2.id, 2) === 12, "あふれた12人が2本目へ", `${st.assignedCount(p2.id, 2)}人`);

  // --- 実際に回しても、二重に練習しない（1人1コマ）
  {
    const live = new Set<ClassId>();
    const clock = new GameClock();
    let day = 0;
    let guard = 0;
    while (day < 2 && guard < 200000) {
      guard++;
      const before = st.dayCount;
      frame(st, clock, live);
      if (st.dayCount !== before) day++;
    }
    const counts = st.students.gakudo.map((s) => Object.values(s.trainCount).reduce((a, b) => a + b, 0));
    const trained = counts.filter((n) => n > 0).length;
    ok(trained === counts.length, "2本とも回って全員が練習する", `${trained}/${counts.length}人`);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    ok(max <= min * 1.35 + 2, "同じ子が2本ぶん練習していない", `最多${max}回 / 最少${min}回`);
  }

  // --- コーチは体が1つ。2本並べるならコーチも2人要る
  st.setTimetableEntry(p2.id, 2, null, null);
  const sameCoach = st.setTimetableEntry(p2.id, 2, "gakudo", st.coaches[0].id);
  ok(!sameCoach.ok, "同じコーチに2本は持たせられない", sameCoach.reason ?? "");

  // --- 育成以上は今までどおり重ねられない
  st.setTimetableEntry(p1.id, 4, "ikuseiA", st.coaches[0].id);
  const dup = st.setTimetableEntry(p2.id, 4, "ikuseiA", st.coaches[1].id);
  ok(!dup.ok, "育成Aは同じ時間に2本開けない", dup.reason ?? "");
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
