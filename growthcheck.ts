/// <reference types="node" />
/**
 * クラス別の成長率の実測（ヘッドレス）。
 *
 * 「学童だけ異常に伸びる」「育成以上が大会で戦えない」といったバランスは、
 * config の数字を眺めていても分からない。**1日ぶん実際に回して測る**のがこの検査。
 *
 * FacilityScene.update() と同じ順序で1日を回す：
 *   コマの開始（beginClassSession）→ 5分ごとに tickPractice → コマの終了（endClassSession）
 * コーチはどのクラスも**同じ1人**にそろえるので、出た差は純粋にクラスの設定差になる。
 *
 * 実行:
 *   npx esbuild growthcheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import {
  applyTraining,
  createStudent,
  energyMax,
  STAT_KEYS,
  STAT_LABEL,
  statCapOf,
  talentRankOf,
  talentGrowthOf,
  TALENT_COLOR,
  TALENT_NOTE,
  TALENT_ORDER,
  TRAINABLE_KEYS,
  type Student,
} from "./src/sim/student";
import { statRank, statRankColor, statRankNote, STAT_RANK_ORDER, toNextRank } from "./src/sim/statRank";
import { radarRatio } from "./src/gfx/StatRadar";
import { CLASS_ORDER, classDef, isSchoolClass, type ClassId } from "./src/sim/classes";
import { groupByClass, membersOfClass } from "./src/sim/lineup";
import { SLOTS } from "./src/sim/timetable";
import { conditionLevel, CONDITION_LABEL } from "./src/sim/condition";
import { CLASS_FOCUS, CLASS_TRAINING, GEN, STAMINA, STAT_RANK, TALENT, TALENT_ROLL, TRAINING, YOUTH_FORM } from "./src/config/balance";

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let failed = 0;
function ok(cond: boolean, label: string, detail = ""): void {
  if (!cond) failed++;
  console.log(`${cond ? "  ok  " : " FAIL "} ${label}${detail ? `  … ${detail}` : ""}`);
}
function head(s: string): void {
  console.log(`\n=== ${s} ===`);
}

/** 5能力の合計（「伸び」はいつもこの合計で測る）。 */
function total(s: Student): number {
  return STAT_KEYS.reduce((n, k) => n + s.stats[k], 0);
}

/**
 * そのクラスに「学年相応の生徒」を作る。
 *
 * クラスが上がるほど学年も能力も上なので、同じ小4を全クラスに入れて比べても
 * 実際のプレイとはかけ離れた数字しか出ない。伸びしろ（dim）は能力が高いほど
 * 小さくなるので、**そのクラスにいそうな生徒**で測ること。
 */
const GRADE_OF: Record<ClassId, string> = {
  youji: "年長",
  gakudo: "小4",
  ikuseiB: "小5",
  ikuseiA: "中1",
  senshu: "高1",
  pro: "大1",
};

interface Measured {
  classId: ClassId;
  label: string;
  people: number;
  minutes: number;
  perStudent: number;
  classTotal: number;
  energyLeft: number;
  /** 最後に到達した5能力の平均（伸びすぎていないかの目安）。 */
  endAvg: number;
}

/**
 * そのクラスだけを slots コマぶん時間割に入れて、days 日ぶん回す。
 * コーチは coaches[0]（クラブ開始時の1人）で固定する。
 */
function measure(
  classId: ClassId,
  roster: number,
  slots = 1,
  seed = 7,
  days = 1,
  /** 日ごとに系統Aのメニューを替える（＝ふつうに遊んだときの回し方）。 */
  rotate = false,
  /**
   * 「同じ生徒」を各クラスに置いて比べるモード。
   *
   * クラス相応の生徒どうしで比べると、上のクラスほど能力が高い＝伸びしろ（dim）が
   * 小さいぶん不利になり、**クラスの設定の差**が読み取れない。
   * 昇格の意味を測りたいときは、学年も能力も才能もそろえた生徒を各クラスに置く。
   */
  sameStudent = false,
): Measured {
  const st = new GameState(rng(seed), { clubName: "計測" });
  st.gems = 9_999_999;
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;

  const kids: Student[] = [];
  for (let i = 0; i < roster; i++) {
    // 同じ種で作る＝どのクラスでも顔ぶれ（能力・才能）がまったく同じになる
    const s = createStudent(rng(seed * 31 + 5 + i * 7), 9000 + i, sameStudent ? "ikuseiB" : classId);
    s.classId = classId;
    s.grade = sameStudent ? "中1" : GRADE_OF[classId];
    s.growthType = "normal"; // 早熟・晩成のばらつきを消して、クラス差だけを見る
    s.energy = energyMax(s);
    st.students[classId].push(s);
    kids.push(s);
  }

  // 時間割を作り直す（開始時の割り当てを消して、測りたいクラスだけ入れる）
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const pool = st.placedPools()[0];
  const coach = st.coaches[0];
  for (let i = 0; i < slots; i++) st.setTimetableEntry(pool.id, i + 1, classId, coach.id);

  const before = kids.map(total);
  const mins = new Map<number, number>();
  const practised: Student[] = [];
  let energyLeft = 1;

  // FacilityScene.update と同じ刻み（5分）で1日を回す
  const step = 5;
  for (let day = 0; day < days; day++) {
    if (rotate) st.setClassPlan(classId, { ability: TRAINABLE_KEYS[day % TRAINABLE_KEYS.length] });
    let open = false;
    for (let m = SLOTS[0].start; m < SLOTS[SLOTS.length - 1].end; m += step) {
      const running = st.runningLessons(m);
      if (running.length === 0) {
        if (open) {
          st.endClassSession(classId, undefined, { recovery: false });
          open = false;
        }
        continue;
      }
      const lineup = st.lineupAt(m);
      const slotOf = running.find((e) => e.classId === classId)?.slot;
      st.beginClassSession(classId, membersOfClass(lineup, classId), slotOf);
      open = true;

      const members = new Map<ClassId, Student[]>();
      for (const l of lineup) {
        const cur = members.get(l.classId);
        if (cur) cur.push(...l.members);
        else members.set(l.classId, [...l.members]);
      }
      for (const g of groupByClass(running, st.equipment)) {
        const list = members.get(g.classId);
        st.tickPractice(g.classId, step, undefined, list);
        for (const s of list ?? []) {
          if (day === 0) mins.set(s.id, (mins.get(s.id) ?? 0) + step);
          if (!practised.includes(s)) practised.push(s);
        }
      }
    }
    if (open) st.endClassSession(classId, undefined, { recovery: false });
    // 体力は日をまたぐ前に読む（onDayRoll で満タンに戻るため）
    energyLeft =
      practised.length > 0 ? practised.reduce((n, s) => n + s.energy / energyMax(s), 0) / practised.length : 1;
    st.onDayRoll(); // 日次回復（体力全回復・コンディションが少し戻る）
  }

  const gains = kids.map((s, i) => (total(s) - before[i]) / days);
  const trained = gains.filter((g) => g > 0.001);
  return {
    classId,
    label: classDef(classId).label,
    people: trained.length,
    minutes: practised.length > 0 ? Math.max(...practised.map((s) => mins.get(s.id) ?? 0)) : 0,
    perStudent: trained.length > 0 ? trained.reduce((a, b) => a + b, 0) / trained.length : 0,
    classTotal: gains.reduce((a, b) => a + b, 0),
    energyLeft,
    endAvg:
      practised.length > 0 ? practised.reduce((n, s) => n + total(s) / STAT_KEYS.length, 0) / practised.length : 0,
  };
}

// ================================================================ 1日の伸び

head("1. クラス別の1日の伸び（コーチは同じ1人・1コマ）");

// 定員ぶん在籍させる（スクールは1コマの定員＝60人、育成以上はクラス定員）
const ROSTER: Record<ClassId, number> = {
  youji: 60,
  gakudo: 60,
  ikuseiB: 24,
  ikuseiA: 24,
  senshu: 18,
  pro: 8,
};

// 【昇格の意味】まったく同じ顔ぶれ（中1・同じ能力・同じ才能）を各クラスに置いて比べる。
// クラス相応の生徒どうしだと、上のクラスほど能力が高い＝伸びしろが小さいぶん不利になり、
// 「クラスを上げたら伸びるようになったのか」が読み取れない。
const same = CLASS_ORDER.map((c) => measure(c.id, 16, 1, 7, 1, false, true));

console.log("\n【同じ生徒を各クラスに置いたとき＝昇格の効果】");
console.log("クラス   growth  1人あたりの伸び  クラス合計  残り体力");
for (const r of same) {
  console.log(
    `${r.label.padEnd(4, "　")}  ${String(CLASS_TRAINING[r.classId].growth).padStart(6)}  ` +
      `${r.perStudent.toFixed(2).padStart(13)}  ${r.classTotal.toFixed(1).padStart(9)}  ` +
      `${(r.energyLeft * 100).toFixed(0).padStart(6)}%`,
  );
}

const rows = CLASS_ORDER.map((c) => measure(c.id, ROSTER[c.id]));

console.log("\n【クラス相応の生徒での実測＝実際の遊びに近い数字】");
console.log("クラス   練習人数  練習分数  1人あたりの伸び  クラス合計  残り体力");
for (const r of rows) {
  console.log(
    `${r.label.padEnd(4, "　")}  ` +
      `${String(r.people).padStart(6)}人  ${String(r.minutes).padStart(6)}分  ` +
      `${r.perStudent.toFixed(2).padStart(13)}  ${r.classTotal.toFixed(1).padStart(9)}  ` +
      `${(r.energyLeft * 100).toFixed(0).padStart(6)}%`,
  );
}

// ---- 昇格するほど伸びる階段になっているか（学童 < 育成B < 育成A < 選手 < プロ）
head("2. クラスの階段（同じ生徒なら、上のクラスほどよく伸びる）");

const ladder: ClassId[] = ["gakudo", "ikuseiB", "ikuseiA", "senshu", "pro"];
const per = new Map(same.map((r) => [r.classId, r.perStudent]));
for (let i = 1; i < ladder.length; i++) {
  const lo = ladder[i - 1];
  const hi = ladder[i];
  ok(
    (per.get(hi) ?? 0) > (per.get(lo) ?? 0),
    `${classDef(lo).label} < ${classDef(hi).label}`,
    `${(per.get(lo) ?? 0).toFixed(2)} → ${(per.get(hi) ?? 0).toFixed(2)}`,
  );
}
ok(
  (per.get("youji") ?? 0) < (per.get("gakudo") ?? 0),
  "幼児 < 学童",
  `${(per.get("youji") ?? 0).toFixed(2)} → ${(per.get("gakudo") ?? 0).toFixed(2)}`,
);

// ---- 行きすぎていないか（1日で能力が跳ね上がらない）
head("3. 行きすぎの検査（1日で伸びすぎない）");

// 行きすぎの判定は「実際の遊びに近い数字」（クラス相応の生徒）で見る。
// 同じ生徒を各クラスに置いた数字は、上のクラスほど伸びしろが余っているぶん大きく出るので、
// 階段の向きを見るためだけに使う。
for (const r of rows) {
  ok(r.perStudent < 12, `${r.label}は1日で伸びすぎない（5能力の合計 < 12）`, r.perStudent.toFixed(2));
}
const proStep = (per.get("pro") ?? 0) / Math.max(0.01, per.get("gakudo") ?? 0);
ok(proStep < 20, "プロでも学童の20倍までに収まる", `×${proStep.toFixed(2)}`);
ok(proStep > 3, "上まで上げた見返りが大きい（学童の3倍以上）", `×${proStep.toFixed(2)}`);

// ---- 育成以上がちゃんと伸びているか
head("4. 育成以上が「伸びない」状態になっていないか");

for (const id of ["ikuseiB", "ikuseiA", "senshu", "pro"] as ClassId[]) {
  const r = rows.find((x) => x.classId === id)!;
  // 【上限の近くでは伸びが小さい】「グラフではなかなか成果が見えないくらい」まで
  // 全体を遅くしたので、能力の高いプロは1日 0.2 前後しか伸びない（1年＝48日で +8〜9）。
  // ここで見たいのは速さではなく「ゼロで止まっていないこと」だけ。
  ok(r.perStudent > 0.1, `${r.label}は1日で伸びが止まっていない（0.1以上）`, r.perStudent.toFixed(2));
  ok(r.people === ROSTER[id], `${r.label}は全員が練習できている`, `${r.people}/${ROSTER[id]}人`);
}

// ================================================================ コマを増やしたとき

head("5. コマを増やしたとき（スクールは人数が増え、育成は1人の練習量が増える）");

const g1 = measure("gakudo", 67, 1);
const g2 = measure("gakudo", 67, 2);
ok(g2.people > g1.people, "学童：コマを足すと練習できる人数が増える", `${g1.people}人 → ${g2.people}人`);
ok(
  Math.abs(g2.perStudent - g1.perStudent) < 0.05,
  "学童：1人あたりの練習量は変わらない（二重に練習しない）",
  `${g1.perStudent.toFixed(2)} → ${g2.perStudent.toFixed(2)}`,
);

const b1 = measure("ikuseiB", 12, 1);
const b2 = measure("ikuseiB", 12, 2);
ok(b2.minutes > b1.minutes, "育成B：コマを足すと1人の練習時間が増える", `${b1.minutes}分 → ${b2.minutes}分`);
ok(
  b2.perStudent > b1.perStudent * 1.05,
  "育成B：2コマ目もちゃんと伸びる（体力切れで空振りしない）",
  `${b1.perStudent.toFixed(2)} → ${b2.perStudent.toFixed(2)}`,
);
ok(
  b2.perStudent < b1.perStudent * 2,
  "育成B：コマを詰め込むだけで倍にはならない（休ませる判断が要る）",
  `×${(b2.perStudent / Math.max(0.01, b1.perStudent)).toFixed(2)}`,
);

// ================================================================ 伸びすぎの検査（長期）

head("6. 1か月（20日）続けたときの到達値（伸びすぎていないか）");

// 系統Aを固定したまま毎日同じ練習をすると、連続ペナルティ（TRAINING.streak/tradeoff）で
// 伸びが落ちていく。ふつうに遊べばメニューを回すので、両方を出して比べる。
const fixed = CLASS_ORDER.map((c) => measure(c.id, ROSTER[c.id], 1, 7, 20, false));
const month = CLASS_ORDER.map((c) => measure(c.id, ROSTER[c.id], 1, 7, 20, true));
console.log("\nクラス   1日あたりの伸び（メニュー固定 / 日替わり）  20日後の能力平均");
for (let i = 0; i < month.length; i++) {
  const r = month[i];
  console.log(
    `${r.label.padEnd(4, "　")}  ${fixed[i].perStudent.toFixed(2).padStart(12)} / ${r.perStudent
      .toFixed(2)
      .padStart(6)}  ${r.endAvg.toFixed(1).padStart(20)}`,
  );
}
for (const r of month) {
  // 伸びしろ（dim）が効くので、毎日練習しても1か月で頭打ちにはならない
  ok(r.endAvg < 100, `${r.label}は1か月で能力が振り切らない`, r.endAvg.toFixed(1));
}
const proMonth = month.find((r) => r.classId === "pro")!;
ok(proMonth.endAvg < 92, "プロでも1か月で完成しない（伸びしろが残る）", proMonth.endAvg.toFixed(1));
// 【1か月後は「伸び率」ではなく「到達値」で見る】
// 才能ランクが能力の上限を決めるようになったので、上のクラスほど早く上限に届き、
// 1日の伸びは頭打ちになる。大事なのは「上のクラスにいた子ほど強くなっているか」。
const endAvg = new Map(month.map((r) => [r.classId, r.endAvg]));
for (let i = 1; i < ladder.length; i++) {
  const lo = ladder[i - 1];
  const hi = ladder[i];
  ok(
    (endAvg.get(hi) ?? 0) > (endAvg.get(lo) ?? 0),
    `1か月後の到達値 ${classDef(lo).label} < ${classDef(hi).label}`,
    `${(endAvg.get(lo) ?? 0).toFixed(1)} → ${(endAvg.get(hi) ?? 0).toFixed(1)}`,
  );
}

// ================================================================ 才能SSが上限に届くまで

head("6b. 才能SSでも、上限の近くに届くのはプロになってから（1日2コマ・2能力を交互）");
{
  // 【このゲームの形】才能SSの能力が育成Bの1年でほぼ上限、だとプロまで育てる意味が無い。
  // 1年＝48ゲーム日（4日で1ヶ月×12ヶ月）。スピードと持久力を才能SSにして、1日ずつ交互に鍛える。
  const ssRun = (classId: ClassId, days: number): { start: number; end: number } => {
    const st = new GameState(rng(11), { clubName: "計測" });
    st.gems = 9_999_999;
    for (const c of CLASS_ORDER) st.students[c.id].length = 0;
    const kids: Student[] = [];
    for (let i = 0; i < 6; i++) {
      const s = createStudent(rng(11 * 17 + i * 13), 9700 + i, classId);
      s.grade = GRADE_OF[classId];
      s.growthType = "normal";
      for (const k of ["speed", "stamina"] as const) {
        s.stats[k] = Math.max(0, s.stats[k] - (TALENT.startBonus[s.talentRank[k]] ?? 0) + TALENT.startBonus.SS);
        s.talentRank[k] = "SS";
        s.talent[k] = TALENT.growthMult.SS;
      }
      s.energy = energyMax(s);
      st.students[classId].push(s);
      kids.push(s);
    }
    for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
    const pool = st.placedPools()[0];
    for (let i = 0; i < 2; i++) st.setTimetableEntry(pool.id, i + 1, classId, st.coaches[0].id);
    const avg = (): number => kids.reduce((n, s) => n + s.stats.speed, 0) / kids.length;
    const start = avg();
    for (let day = 0; day < days; day++) {
      st.setClassPlan(classId, { ability: day % 2 === 0 ? "speed" : "stamina" });
      let open = false;
      for (let m = SLOTS[0].start; m < SLOTS[SLOTS.length - 1].end; m += 5) {
        const running = st.runningLessons(m);
        if (running.length === 0) {
          if (open) {
            st.endClassSession(classId, undefined, { recovery: false });
            open = false;
          }
          continue;
        }
        const lineup = st.lineupAt(m);
        st.beginClassSession(classId, membersOfClass(lineup, classId), running.find((e) => e.classId === classId)?.slot);
        open = true;
        const members = new Map<ClassId, Student[]>();
        for (const l of lineup) {
          const cur = members.get(l.classId);
          if (cur) cur.push(...l.members);
          else members.set(l.classId, [...l.members]);
        }
        for (const g of groupByClass(running, st.equipment)) st.tickPractice(g.classId, 5, undefined, members.get(g.classId));
      }
      if (open) st.endClassSession(classId, undefined, { recovery: false });
      st.takeTrainingInjuries();
      st.onDayRoll();
    }
    return { start, end: avg() };
  };
  const YEAR = 48;
  const b = ssRun("ikuseiB", YEAR);
  ok(b.end < TALENT.cap.SS - 30, "才能SSでも育成Bの1年では上限に遠い", `${b.start.toFixed(0)} → ${b.end.toFixed(0)}`);
  const s3 = ssRun("senshu", YEAR * 3);
  ok(s3.end < TALENT.cap.SS - 8, "選手の3年でも上限-8 には届かない（仕上げはプロ）", `${s3.start.toFixed(0)} → ${s3.end.toFixed(1)}`);
  const p3 = ssRun("pro", YEAR * 3);
  ok(p3.end >= TALENT.cap.SS - 12, "プロの3年で S ランクの上まで来る", `${p3.start.toFixed(0)} → ${p3.end.toFixed(1)}`);
  /**
   * 【最後のひと伸びは練習では埋まらない】練習で届くのは cap − practiceMargin まで。
   * 何年回しても上限そのものには乗らない（残りは合宿の領分 → GameState.runCamp）。
   */
  const long = ssRun("pro", YEAR * 12);
  ok(
    long.end <= TALENT.cap.SS - TALENT.practiceMargin + 0.01,
    "練習だけでは上限に届かない（最後の4は合宿でしか埋まらない）",
    `12年回して ${long.end.toFixed(1)} ／ 練習の上限 ${TALENT.cap.SS - TALENT.practiceMargin}`,
  );
}

// ================================================================ 設定の並び

head("7. config の並び（あとから調整するときの目印）");

// 学童はスクールの練習（全能力が少しずつ上がる別の式）なので、growth の数字は育成以上と比べられない。
// 学童 < 育成B は 2. の実測で見ている。ここは同じ式を使う 育成B〜プロ の並びだけを見る。
for (let i = 2; i < ladder.length; i++) {
  const lo = CLASS_TRAINING[ladder[i - 1]].growth;
  const hi = CLASS_TRAINING[ladder[i]].growth;
  ok(hi > lo, `growth ${classDef(ladder[i - 1]).label} < ${classDef(ladder[i]).label}`, `${lo} → ${hi}`);
}
ok(CLASS_TRAINING.gakudo.growth === 0.85, "学童の growth は 0.85 のまま", `${CLASS_TRAINING.gakudo.growth}`);
for (const c of CLASS_ORDER) {
  if (isSchoolClass(c.id)) continue;
  ok(CLASS_TRAINING[c.id].fatigue > 0, `${c.label} の fatigue が入っている`, `${CLASS_TRAINING[c.id].fatigue}`);
}


// ================================================================ 疲れ方（体力・調子・ケガ）

/**
 * コマ数と持久力を変えて days 日回し、1日の終わりの体力・調子・ケガを測る。
 *
 * 【この検査で守りたいこと】
 * 練習を止めるのは**体力ではなく調子**。体力は持久力を鍛えれば持つようになり、
 * 詰め込みすぎの歯止めは「調子が落ちる → まれにケガ」が受け持つ。
 */
function stress(
  classId: ClassId,
  slots: number,
  stamina: number,
  days = 12,
): { gain: number; energyLeft: number; condition: number; injuryPerDay: number } {
  const st = new GameState(rng(7), { clubName: "計測" });
  st.gems = 9_999_999;
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;
  const make = rng(99);
  const kids: Student[] = [];
  for (let i = 0; i < 12; i++) {
    const s = createStudent(make, 9500 + i, classId);
    s.grade = GRADE_OF[classId];
    s.growthType = "normal";
    s.stats.stamina = stamina;
    s.energy = energyMax(s);
    st.students[classId].push(s);
    kids.push(s);
  }
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const pool = st.placedPools()[0];
  for (let i = 0; i < slots; i++) st.setTimetableEntry(pool.id, i + 1, classId, st.coaches[0].id);

  const before = kids.map(total);
  let injuries = 0;
  let energyLeft = 1;
  let condition = 0;
  for (let day = 0; day < days; day++) {
    // ふつうに遊ぶときの回し方（メニューを日替わりにする）
    st.setClassPlan(classId, { ability: TRAINABLE_KEYS[day % TRAINABLE_KEYS.length] });
    let open = false;
    for (let m = SLOTS[0].start; m < SLOTS[SLOTS.length - 1].end; m += 5) {
      const running = st.runningLessons(m);
      if (running.length === 0) {
        if (open) {
          st.endClassSession(classId, undefined, { recovery: false });
          open = false;
        }
        continue;
      }
      const lineup = st.lineupAt(m);
      st.beginClassSession(classId, membersOfClass(lineup, classId), running.find((e) => e.classId === classId)?.slot);
      open = true;
      const members = new Map<ClassId, Student[]>();
      for (const l of lineup) {
        const cur = members.get(l.classId);
        if (cur) cur.push(...l.members);
        else members.set(l.classId, [...l.members]);
      }
      for (const g of groupByClass(running, st.equipment)) {
        st.tickPractice(g.classId, 5, undefined, members.get(g.classId));
      }
    }
    // 1日の終わり（コマ間の休憩や日次回復が入る前）の状態を見る
    energyLeft = kids.reduce((n, s) => n + s.energy / energyMax(s), 0) / kids.length;
    condition = kids.reduce((n, s) => n + s.condition, 0) / kids.length;
    if (open) st.endClassSession(classId, undefined, { recovery: false });
    injuries += st.takeTrainingInjuries().length;
    for (const s of kids) s.injuryDays = 0; // 日ごとの発生率を見たいので消す
    st.onDayRoll();
  }
  const gains = kids.map((s, i) => (total(s) - before[i]) / days);
  return {
    gain: gains.reduce((a, b) => a + b, 0) / gains.length,
    energyLeft,
    condition,
    injuryPerDay: injuries / (kids.length * days),
  };
}

head("8. 持久力を鍛えた手ごたえ（育成B・3コマ）");

console.log("\n持久力  体力上限  1日の伸び  1日の終わりの体力  調子  ケガ率/人日");
const byStamina = [5, 20, 40, 60, 80, 95].map((v) => ({ v, r: stress("ikuseiB", 3, v) }));
for (const { v, r } of byStamina) {
  const em = STAMINA.energyBase + STAMINA.energyPerPoint * v;
  console.log(
    `${String(v).padStart(6)}  ${em.toFixed(0).padStart(8)}  ${r.gain.toFixed(2).padStart(9)}  ` +
      `${(r.energyLeft * 100).toFixed(0).padStart(15)}%  ${CONDITION_LABEL[conditionLevel(r.condition)]}  ` +
      `${(r.injuryPerDay * 100).toFixed(1)}%`,
  );
}
const lowSta = byStamina[0].r;
const highSta = byStamina[byStamina.length - 1].r;
ok(
  highSta.energyLeft > lowSta.energyLeft + 0.4,
  "持久力が高いほど1日の終わりに体力が残る",
  `持久力5 ${(lowSta.energyLeft * 100).toFixed(0)}% → 95 ${(highSta.energyLeft * 100).toFixed(0)}%`,
);
ok(
  highSta.energyLeft > 0.6,
  "持久力を鍛えれば3コマ入れても半分以上残る",
  `${(highSta.energyLeft * 100).toFixed(0)}%`,
);
// 【満タンには戻らない】練習した手ごたえが体力バーに残ること。
// コマの合間の回復を「最大値の割合」で戻していたころは、消費の小さい選手が
// 毎コマ満タンに戻り、1日じゅうバーが振り切れたままだった（→ STAMINA.refillAtZero）。
ok(
  highSta.energyLeft < 0.95,
  "ただし満タンにはならない（練習した跡が残る）",
  `${(highSta.energyLeft * 100).toFixed(0)}%`,
);
ok(lowSta.energyLeft < 0.45, "持久力が低いと3コマで空になりかける", `${(lowSta.energyLeft * 100).toFixed(0)}%`);
// 体力の3要素（上限・消費・回復）がぜんぶ持久力で動く
ok(
  STAMINA.energyPerPoint * 100 > STAMINA.energyBase,
  "体力の上限は持久力でおよそ倍以上になる",
  `${STAMINA.energyBase} → ${(STAMINA.energyBase + STAMINA.energyPerPoint * 100).toFixed(0)}`,
);
ok(
  STAMINA.costAtMax < STAMINA.costAtZero,
  "持久力が高いほど練習で減る体力が少ない",
  `×${STAMINA.costAtZero} → ×${STAMINA.costAtMax}`,
);
ok(
  STAMINA.refillAtMax > STAMINA.refillAtZero,
  "持久力が高いほどコマの合間に戻る",
  `${STAMINA.refillAtZero} → ${STAMINA.refillAtMax}`,
);

head("9. 詰め込みの歯止めは「体力」ではなく「調子とケガ」");

console.log("\nコマ  1日の伸び  1日の終わりの体力  調子      ケガ率/人日");
const bySlots = [1, 2, 3, 4, 5].map((n) => ({ n, r: stress("ikuseiB", n, 40) }));
for (const { n, r } of bySlots) {
  console.log(
    `${String(n).padStart(3)}  ${r.gain.toFixed(2).padStart(9)}  ${(r.energyLeft * 100).toFixed(0).padStart(15)}%  ` +
      `${CONDITION_LABEL[conditionLevel(r.condition)].padEnd(4, "　")}  ${(r.injuryPerDay * 100).toFixed(1)}%`,
  );
}
const slot1 = bySlots[0].r;
const slot2 = bySlots[1].r;
const slot5 = bySlots[4].r;
ok(slot2.gain > slot1.gain * 1.3, "2コマ目はちゃんと効く（効率の落ちは少し）", `${slot1.gain.toFixed(2)} → ${slot2.gain.toFixed(2)}`);
ok(slot5.gain > slot2.gain, "詰め込めば伸びは増える", `${slot2.gain.toFixed(2)} → ${slot5.gain.toFixed(2)}`);
ok(slot5.gain < slot2.gain * 1.6, "ただし頭打ちになる（青天井ではない）", `×${(slot5.gain / slot2.gain).toFixed(2)}`);
ok(
  slot1.condition > slot5.condition + 20,
  "詰め込むほど調子が落ちる",
  `${slot1.condition.toFixed(0)} → ${slot5.condition.toFixed(0)}`,
);
ok(conditionLevel(slot1.condition) !== "tired", "1コマなら調子は保てる", CONDITION_LABEL[conditionLevel(slot1.condition)]);
ok(slot1.injuryPerDay === 0, "ふつうに回している間はケガしない");
ok(slot5.injuryPerDay > 0, "詰め込むとケガのリスクが出る", `${(slot5.injuryPerDay * 100).toFixed(1)}%/人日`);
ok(slot5.injuryPerDay < 0.15, "それでもケガはまれ（1日1割未満）", `${(slot5.injuryPerDay * 100).toFixed(1)}%/人日`);
ok(TRAINING.tiredGainFloor >= 0.8, "疲れても練習の効率は少ししか落ちない", `体力0でも ×${TRAINING.tiredGainFloor}`);

head("10. スクール（幼児・学童）はフォームが集中して伸びる");

/** 1ゲーム年＝48日（4日で1ヶ月×12ヶ月）。 */
const SCHOOL_YEAR_DAYS = 48;

{
  const st = new GameState(rng(11), { clubName: "計測" });
  st.gems = 9_999_999;
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;
  const make = rng(12);
  const kids: Student[] = [];
  for (let i = 0; i < 20; i++) {
    const s = createStudent(make, 9700 + i, "gakudo");
    s.grade = "小4";
    s.growthType = "normal";
    st.students.gakudo.push(s);
    kids.push(s);
  }
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  st.setTimetableEntry(st.placedPools()[0].id, 1, "gakudo", st.coaches[0].id);
  const before = kids.map((s) => ({ ...s.stats }));
  // 【1年ぶん回す】小学生の伸びを大きく抑えた（GROWTH_PHASE_MULT.elementary）ので、
  // 20日では幼少期フォームが「並」（YOUTH_FORM.baseline）に届かない。
  // 幼少期フォームは**学童の数年ぶんを積む**値なので、1年（48日）で測る。
  for (let day = 0; day < SCHOOL_YEAR_DAYS; day++) {
    let open = false;
    for (let m = SLOTS[0].start; m < SLOTS[SLOTS.length - 1].end; m += 5) {
      const running = st.runningLessons(m);
      if (running.length === 0) {
        if (open) {
          st.endClassSession("gakudo", undefined, { recovery: false });
          open = false;
        }
        continue;
      }
      const lineup = st.lineupAt(m);
      st.beginClassSession("gakudo", membersOfClass(lineup, "gakudo"), running.find((e) => e.classId === "gakudo")?.slot);
      open = true;
      for (const g of groupByClass(running, st.equipment)) {
        st.tickPractice(g.classId, 5, undefined, membersOfClass(lineup, g.classId));
      }
    }
    if (open) st.endClassSession("gakudo", undefined, { recovery: false });
    st.onDayRoll();
  }
  const gain: Record<string, number> = {};
  for (const k of STAT_KEYS) gain[k] = kids.reduce((n, s, i) => n + (s.stats[k] - before[i][k]), 0) / kids.length;
  console.log(`\n学童を${SCHOOL_YEAR_DAYS}日（1年）：能力別の伸び`);
  for (const k of STAT_KEYS) console.log(`  ${STAT_LABEL[k].padEnd(5, "　")} +${gain[k].toFixed(1)}`);

  const others = STAT_KEYS.filter((k) => k !== "form").map((k) => gain[k]);
  const maxOther = Math.max(...others);
  ok(
    gain.form > maxOther * 2,
    "フォームがほかの能力の2倍以上伸びる",
    `フォーム +${gain.form.toFixed(1)} ／ 他 最大 +${maxOther.toFixed(1)}`,
  );
  ok(others.every((v) => v > 0), "ほかの能力も伸びる（フォーム専用ではない）");
  const youth = kids.reduce((n, s) => n + s.youthForm, 0) / kids.length;
  ok(youth > YOUTH_FORM.baseline, "幼少期フォームが「並」を超える＝将来性になる", `${youth.toFixed(1)} > ${YOUTH_FORM.baseline}`);
  ok(
    CLASS_FOCUS.gakudo.form > 1 && STAT_KEYS.every((k) => CLASS_FOCUS.gakudo[k] > 0),
    "config でもフォームに寄せてある",
    STAT_KEYS.map((k) => `${STAT_LABEL[k]}${CLASS_FOCUS.gakudo[k]}`).join(" "),
  );
}


// ================================================================ 練習した能力が上がるだけ

head("11. 練習しても他の能力は下がらない");

{
  const st = new GameState(rng(21), { clubName: "計測" });
  st.gems = 9_999_999;
  const who = createStudent(rng(22), 9900, "senshu");
  who.grade = "高1";
  who.growthType = "normal";
  st.students.senshu.push(who);

  // 同じ練習を上限まで偏らせる（以前はここで他の能力が削られていた）
  const before = { ...who.stats };
  for (let i = 0; i < 12; i++) applyTraining(who, "speed", { rand: rng(30 + i) });
  const after = { ...who.stats };

  ok(after.speed > before.speed, "鍛えた能力は上がる", `${before.speed.toFixed(1)} → ${after.speed.toFixed(1)}`);
  for (const k of STAT_KEYS) {
    if (k === "speed") continue;
    ok(
      after[k] >= before[k] - 1e-9,
      `${STAT_LABEL[k]}は下がらない`,
      `${before[k].toFixed(1)} → ${after[k].toFixed(1)}`,
    );
  }
  ok(who.streak.speed === TRAINING.streakMax, "偏りは記録されている（疲れ方に効く）", `${who.streak.speed}`);
  ok(who.condition < 100, "偏りの罰は調子のほうに出る", `調子 ${who.condition.toFixed(0)}`);

  // 持久力に偏らせても同じ（以前はスピードとフォームが削られていた）
  const st2 = createStudent(rng(23), 9901, "senshu");
  st2.grade = "高1";
  const b2 = { ...st2.stats };
  for (let i = 0; i < 12; i++) applyTraining(st2, "stamina", { rand: rng(40 + i) });
  ok(st2.stats.speed >= b2.speed - 1e-9, "持久力を続けてもスピードは下がらない", `${b2.speed.toFixed(1)} → ${st2.stats.speed.toFixed(1)}`);
  ok(st2.stats.form >= b2.form - 1e-9, "フォームも下がらない", `${b2.form.toFixed(1)} → ${st2.stats.form.toFixed(1)}`);
}

// ================================================================ 才能ランクと能力ランク

head("12. 才能は7段階（E〜SS）／能力は数値＋ランク（G〜SS）");

{
  // --- 才能ランクは7段階で、最初から見える（隠さない）
  ok(TALENT_ORDER.join(" ") === "E D C B A S SS", "才能ランクは E→SS の7段階", TALENT_ORDER.join(" "));
  ok(
    TALENT_ORDER.every((r) => TALENT_COLOR[r] !== "" && TALENT_NOTE[r] !== ""),
    "どのランクにも色と言い回しがある",
    `E＝${TALENT_NOTE.E} ／ SS＝${TALENT_NOTE.SS}`,
  );
  // 上のランクほど速く伸びる（順番が入れ替わらない）
  let growMono = true;
  let capMono = true;
  for (let i = 1; i < TALENT_ORDER.length; i++) {
    const lo = TALENT_ORDER[i - 1];
    const hi = TALENT_ORDER[i];
    if (TALENT.growthMult[hi] <= TALENT.growthMult[lo]) growMono = false;
    if (TALENT.cap[hi] <= TALENT.cap[lo]) capMono = false;
  }
  ok(growMono, "ランクが上がるほど速く伸びる", TALENT_ORDER.map((r) => `${r}${TALENT.growthMult[r]}`).join(" "));
  ok(capMono, "ランクが上がるほど上限も高い", TALENT_ORDER.map((r) => `${r}${TALENT.cap[r]}`).join(" "));

  const st = createStudent(rng(24), 9910, "senshu");
  st.talentRank.speed = "SS";
  st.talentRank.stamina = "A";
  st.talentRank.form = "E";
  ok(talentRankOf(st, "speed") === "SS", "才能ランクは鍛える前から読める（隠さない）", talentRankOf(st, "speed"));
  ok(talentGrowthOf(st, "speed") > talentGrowthOf(st, "form"), "SS は E よりはっきり速い", `${talentGrowthOf(st, "speed")} / ${talentGrowthOf(st, "form")}`);

  // --- 才能ランクは「到達できる上限」も決める
  ok(statCapOf(st, "speed") === TALENT.cap.SS, "才能SS は SS の領域まで行ける", `上限 ${statCapOf(st, "speed")}`);
  ok(statCapOf(st, "stamina") === TALENT.cap.A, "才能A は A どまり", `上限 ${statCapOf(st, "stamina")}`);
  ok(
    statRank(TALENT.cap.SS) === "SS" && TALENT_ORDER.filter((r) => r !== "SS").every((r) => statRank(TALENT.cap[r]) !== "SS"),
    "神の領域（SS）に届くのは才能SS の能力だけ",
    TALENT_ORDER.map((r) => `${r}→${statRank(TALENT.cap[r])}`).join(" "),
  );
  // 上限まで鍛えても、それ以上は伸びない
  const capped = createStudent(rng(26), 9912, "senshu");
  capped.talentRank.speed = "D";
  capped.stats.speed = TALENT.cap.D - 0.5;
  for (let i = 0; i < 40; i++) applyTraining(capped, "speed", { rand: rng(60 + i), coachMult: 3 });
  ok(capped.stats.speed <= TALENT.cap.D + 1e-9, "才能D は上限を超えない", `${capped.stats.speed.toFixed(1)}`);

  // --- 才能の高い能力は「よく伸びる」うえに「初期値も高い」
  const many = Array.from({ length: 400 }, (_, i) => createStudent(rng(300 + i), 9920 + i, "ikuseiB"));
  const high: number[] = [];
  const low: number[] = [];
  for (const s2 of many) {
    for (const k of STAT_KEYS) {
      if (TALENT_ORDER.indexOf(s2.talentRank[k]) >= TALENT_ORDER.indexOf("A")) high.push(s2.stats[k]);
      else low.push(s2.stats[k]);
    }
  }
  const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  ok(high.length > 0 && low.length > 0, "才能の高い能力・低い能力の両方が生まれる", `${high.length} / ${low.length}`);
  ok(
    avg(high) > avg(low),
    "才能の高い能力は初期値も高い",
    `A以上 ${avg(high).toFixed(1)} / それ未満 ${avg(low).toFixed(1)}`,
  );
  ok(TALENT.startBonus.SS > TALENT.startBonus.A, "SS のほうが初期値の上乗せも大きい");

  // --- 二段階抽選が狙った頻度になっているか（config の TALENT_ROLL）
  const N = 20000;
  let all5 = 0;
  let g23 = 0;
  let g1 = 0;
  let a3 = 0;
  let marked = 0;
  const dist: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const s2 = createStudent(rng(7777 + i * 13), 20000 + i, "gakudo");
    let ss = 0;
    let a = 0;
    for (const k of STAT_KEYS) {
      const r = s2.talentRank[k];
      dist[r] = (dist[r] ?? 0) + 1;
      if (r === "SS") ss++;
      if (TALENT_ORDER.indexOf(r) >= TALENT_ORDER.indexOf("A")) a++;
    }
    if (ss === 5) all5++;
    else if (ss >= 2) g23++;
    else if (ss === 1) g1++;
    if (a >= 3) a3++;
    if (a >= 1) marked++;
  }
  const per1000 = (n: number): string => (n > 0 ? `${Math.round(N / n)}人に1人` : "出ない");
  console.log(`
才能の抽選（${N}人ぶん）`);
  console.log(`  全能力SS（伝説）    ${per1000(all5)}`);
  console.log(`  SS2〜3個（大器）    ${per1000(g23)}`);
  console.log(`  SS1個（エース候補） ${per1000(g1)}`);
  console.log(`  A以上を3個（有望株） ${((a3 / N) * 100).toFixed(1)}%`);
  console.log(`  A以上が1個以上       ${((marked / N) * 100).toFixed(1)}%`);
  console.log("  ランクの出方 " + TALENT_ORDER.map((r) => `${r}:${(((dist[r] ?? 0) / (N * 5)) * 100).toFixed(1)}%`).join(" "));
  ok(all5 > 0 && N / all5 > 500 && N / all5 < 2000, "全能力SSは約1000人に1人", per1000(all5));
  ok(g23 > 0 && N / g23 > 150 && N / g23 < 600, "SS2〜3個は約300人に1人", per1000(g23));
  ok(g1 > 0 && N / g1 > 20 && N / g1 < 80, "SS1個は数十人に1人", per1000(g1));
  ok(a3 / N > 0.15 && a3 / N < 0.26, "A以上を3個は約20%", `${((a3 / N) * 100).toFixed(1)}%`);
  ok(marked / N > 0.44 && marked / N < 0.58, "A以上が1個以上は約50%", `${((marked / N) * 100).toFixed(1)}%`);
  ok(
    Math.abs(TALENT_ROLL.tiers.reduce((n, t) => n + t.weight, 0) - 1) < 1e-6,
    "レア度の重みの合計は1",
    TALENT_ROLL.tiers.map((t) => `${t.label}${(t.weight * 100).toFixed(2)}%`).join(" "),
  );
  ok(
    TALENT_ORDER.every((r) => (dist[r] ?? 0) > 0),
    "7段階ぜんぶが実際に出る",
    TALENT_ORDER.map((r) => `${r}${dist[r] ?? 0}`).join(" "),
  );

  // --- レーダーチャート：育つほど大きくなるが、枠は超えない
  ok(radarRatio(0) > 0 && radarRatio(0) < 0.1, "0 でも点はつぶれない", `${radarRatio(0)}`);
  ok(radarRatio(50) > radarRatio(20), "能力が上がるほど外へ伸びる", `20→${radarRatio(20)} 50→${radarRatio(50)}`);
  ok(radarRatio(100) === 1, "100 でちょうど枠");
  ok(radarRatio(140) === 1, "上限を超える値でも枠を出ない", `${radarRatio(140)}`);

  // --- 能力ランク（G〜SS）
  console.log("\n能力値 → ランク");
  const samples = [0, 10, 20, 35, 50, 62, 74, 85, 93, 98, 100];
  console.log("  " + samples.map((v) => `${v}:${statRank(v)}`).join("  "));
  ok(statRank(0) === "G", "0 は G");
  ok(statRank(100) === "SS", "100 は SS（神の領域）");
  ok(statRank(96) === "S" && statRank(97) === "SS", "SS は97から（そこまでは S）");
  ok(STAT_RANK_ORDER.join("") === "GFEDCBASSS", "並びは G F E D C B A S SS", STAT_RANK_ORDER.join(" "));
  // 値が上がるほどランクも上がる（戻らない）
  let last = -1;
  let monotone = true;
  for (let v = 0; v <= 100; v++) {
    const i = STAT_RANK_ORDER.indexOf(statRank(v));
    if (i < last) monotone = false;
    last = i;
  }
  ok(monotone, "能力が上がるほどランクも上がる（下がらない）");
  ok(STAT_RANK_ORDER.every((r) => statRankColor(r) !== ""), "どのランクにも色がある");
  ok(statRankNote("SS") !== "" && statRankNote("G") !== "", "どのランクにも言い回しがある", `G＝${statRankNote("G")} ／ SS＝${statRankNote("SS")}`);
  // 上のランクほど帯が狭い＝1つ上げる価値が大きい
  const widths = STAT_RANK.bands.map((b, i) => (i + 1 < STAT_RANK.bands.length ? STAT_RANK.bands[i + 1].min - b.min : 100 - b.min));
  ok(widths[widths.length - 2] < widths[0], "上のランクほど到達が難しい", `G ${widths[0]} → S ${widths[widths.length - 2]}`);
  // 次のランクまでの案内
  const next = toNextRank(50);
  ok(next !== null && next.rank === "C", "次のランクが分かる", next ? `${next.rank}まであと${next.need}` : "");
  ok(toNextRank(100) === null, "SS のうえは無い");
}

console.log(`\n${failed === 0 ? "すべて OK" : `${failed} 件 FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
