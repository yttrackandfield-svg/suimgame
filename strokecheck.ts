/// <reference types="node" />
/**
 * 泳法の熟練度（0〜999）と発揮率の検証。
 *
 * 見たいこと
 *   ・熟練度は**プロを引退するまで育ててもカンストしない**ゆっくりさか
 *   ・能力が同じで熟練度だけ違う2人に、どれくらいタイム差が出るか
 *   ・泳法の才能が、上がりやすさと上限にちゃんと効いているか
 *   ・泳法ごとに伸びる能力の寄り・体力消費の差が出ているか
 *
 * 実行:
 *   npx esbuild strokecheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { CLASS_ORDER, type ClassId } from "./src/sim/classes";
import { membersOfClass } from "./src/sim/lineup";
import { CLOCK, STROKE } from "./src/config/balance";
import {
  addMeetStrokeProf,
  applyStrokeTraining,
  CORE_STROKES,
  createStudent,
  formatTime,
  predictTime,
  STAT_KEYS,
  strokeCapOf,
  strokeExecution,
  strokeGrowthOf,
  strokeProfOf,
  trainingCost,
  type StrokeCore,
  type Student,
} from "./src/sim/student";
import { slotAtMinute } from "./src/sim/timetable";

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

// ================================================================ 1. 発揮率の形

head("1. 発揮率（熟練度 → 能力を何割出せるか）");
{
  const s = createStudent(rng(11), 9001, "senshu");
  const show = (p: number): number => {
    s.strokeProf.free = p;
    return strokeExecution(s, "free");
  };
  const rows = [0, 100, 200, 350, 500, 700, 850, 999];
  console.log("\n熟練度 → 発揮率");
  for (const p of rows) console.log(`  ${String(p).padStart(3)}  ${(show(p) * 100).toFixed(1)}%`);

  ok(Math.abs(show(0) - STROKE.execMin) < 1e-9, "熟練度0は能力の8割", `${(show(0) * 100).toFixed(0)}%`);
  ok(Math.abs(show(STROKE.execRef) - 1) < 1e-6, "名選手級（execRef）でちょうど10割", `${STROKE.execRef}`);
  ok(show(999) > 1 && show(999) < 1.1, "999でも1.0を少し超えるだけ", `${(show(999) * 100).toFixed(1)}%`);
  let mono = true;
  for (let p = 1; p <= 999; p++) if (show(p) < show(p - 1)) mono = false;
  ok(mono, "熟練度が上がるほど発揮率も上がる（下がらない）");
}

// ================================================================ 2. 同じ能力・違う熟練度

head("2. 能力が同じで熟練度だけ違う2人のタイム差");
{
  const mk = (prof: number): Student => {
    const s = createStudent(rng(21), 9100, "senshu");
    s.grade = "高2";
    for (const k of STAT_KEYS) s.stats[k] = 80;
    s.fav = { stroke: "free", distance: 100 };
    for (const k of CORE_STROKES) s.strokeProf[k] = prof;
    // 才能は同じにして、熟練度だけの差を見る
    for (const k of CORE_STROKES) s.strokeTalent[k] = 1;
    return s;
  };
  console.log("\n能力80でそろえた選手（自由形100m / 200m / 1500m）");
  const rows = [0, 200, 400, 700, 999];
  const base: Record<number, number> = {};
  for (const p of rows) {
    const s = mk(p);
    const t100 = predictTime(s, { stroke: "free", distance: 100 });
    const t200 = predictTime(s, { stroke: "free", distance: 200 });
    const t1500 = predictTime(s, { stroke: "free", distance: 1500 });
    base[p] = t100;
    console.log(
      `  熟練度 ${String(p).padStart(3)}（発揮率 ${(strokeExecution(s, "free") * 100).toFixed(0)}%）  ` +
        `100m ${formatTime(t100)}  200m ${formatTime(t200)}  1500m ${formatTime(t1500)}`,
    );
  }
  const gap = base[0] - base[700];
  ok(gap > 0, "熟練度が高いほど速い", `熟練度0 → 700 で ${gap.toFixed(2)}秒`);
  ok(base[700] - base[999] > 0, "999まで育てるとさらに少しだけ速い", `${(base[700] - base[999]).toFixed(2)}秒`);
  // 距離が変わっても「割合」で同じだけ効く（秒を足し引きしていないことの確認）
  const s0 = mk(0);
  const s7 = mk(700);
  const r100 =
    predictTime(s0, { stroke: "free", distance: 100 }) / predictTime(s7, { stroke: "free", distance: 100 });
  const r1500 =
    predictTime(s0, { stroke: "free", distance: 1500 }) / predictTime(s7, { stroke: "free", distance: 1500 });
  /**
   * 【距離適性のぶんだけ差が出る】熟練度そのものは割合で効くが、
   * 能力指数には**距離適性**（得意距離から離れるほど下がる）も掛かるので、
   * 得意距離から5段離れた1500mでは効き目がわずかに小さくなる。
   * 2026-09-23 に距離適性を強めた（1段 −5%・下限 0.78）ぶん、差もその範囲で開く。
   */
  ok(Math.abs(r100 - r1500) < 0.05, "短距離でも長距離でも効き目はほぼ同じ割合", `100m ×${r100.toFixed(3)} / 1500m ×${r1500.toFixed(3)}`);
}

// ================================================================ 3. 才能

head("3. 泳法の才能（上がりやすさと上限）");
{
  const s = createStudent(rng(31), 9200, "senshu");
  s.strokeTalent = { free: 1, back: 0.5, breast: 0, fly: 0.5 };
  ok(strokeCapOf(s, "free") > strokeCapOf(s, "breast"), "才能が高いほど上限も高い", `${Math.round(strokeCapOf(s, "free"))} / ${Math.round(strokeCapOf(s, "breast"))}`);
  ok(strokeGrowthOf(s, "free") > strokeGrowthOf(s, "breast"), "才能が高いほど上がりやすい", `×${strokeGrowthOf(s, "free").toFixed(2)} / ×${strokeGrowthOf(s, "breast").toFixed(2)}`);
  ok(Math.abs(strokeCapOf(s, "free") - STROKE.max) < 1, "才能1.0なら999まで届く", `${Math.round(strokeCapOf(s, "free"))}`);

  // 上限で止まる
  const capped = createStudent(rng(32), 9201, "senshu");
  capped.strokeTalent = { free: 0, back: 0, breast: 0, fly: 0 };
  for (let i = 0; i < 20000; i++) applyStrokeTraining(capped, "free", { coachMult: 3 });
  ok(
    capped.strokeProf.free <= strokeCapOf(capped, "free") + 1e-6,
    "才能で決まる上限を超えない",
    `${capped.strokeProf.free.toFixed(0)} / 上限 ${Math.round(strokeCapOf(capped, "free"))}`,
  );

  // 個人メドレーは4泳法の平均
  const im = createStudent(rng(33), 9202, "senshu");
  im.strokeProf = { free: 400, back: 200, breast: 0, fly: 200, im: 0 };
  ok(Math.abs(strokeProfOf(im, "im") - 200) < 1e-9, "個メは4泳法の平均", `${strokeProfOf(im, "im")}`);
  applyStrokeTraining(im, "im", {});
  ok(
    CORE_STROKES.every((k) => im.strokeProf[k] > 0),
    "個メの練習は4泳法すべてに積まれる",
    CORE_STROKES.map((k) => im.strokeProf[k].toFixed(1)).join("/"),
  );
}

// ================================================================ 4. 泳法ごとの寄りと体力

head("4. 泳法ごとの伸びる能力と体力消費");
{
  const mk = (): Student => {
    const s = createStudent(rng(41), 9300, "senshu");
    for (const k of STAT_KEYS) s.stats[k] = 40;
    for (const k of CORE_STROKES) s.strokeTalent[k] = 0.5;
    s.condition = 70;
    return s;
  };
  console.log("\n泳法練習を100回：伸びた能力（副産物）");
  for (const stroke of ["free", "back", "breast", "fly", "im"] as const) {
    const s = mk();
    const before = { ...s.stats };
    for (let i = 0; i < 100; i++) applyStrokeTraining(s, stroke, {});
    const line = STAT_KEYS.map((k) => `${k} +${(s.stats[k] - before[k]).toFixed(1)}`).join(" ");
    console.log(`  ${stroke.padEnd(7)} ${line}`);
  }
  const free = mk();
  for (let i = 0; i < 100; i++) applyStrokeTraining(free, "free", {});
  const back = mk();
  for (let i = 0; i < 100; i++) applyStrokeTraining(back, "back", {});
  ok(free.stats.speed > free.stats.form, "自由形はスピード寄り", `速${free.stats.speed.toFixed(1)} / 形${free.stats.form.toFixed(1)}`);
  ok(back.stats.form > back.stats.speed, "背泳ぎはフォーム寄り", `形${back.stats.form.toFixed(1)} / 速${back.stats.speed.toFixed(1)}`);
  const breast = mk();
  for (let i = 0; i < 100; i++) applyStrokeTraining(breast, "breast", {});
  ok(breast.stats.turn > breast.stats.start, "平泳ぎはターン寄り", `回${breast.stats.turn.toFixed(1)} / 発${breast.stats.start.toFixed(1)}`);
  const im = mk();
  for (let i = 0; i < 100; i++) applyStrokeTraining(im, "im", {});
  // 【均等さは「他の泳法より平ら」で見る】能力ごとの才能ランクで伸びに差が出るので、
  // 完全に同じ数字にはならない。1泳法に寄せたときより平らであればよい。
  const spreadOf = (x: Student): number =>
    Math.max(...STAT_KEYS.map((k) => x.stats[k])) - Math.min(...STAT_KEYS.map((k) => x.stats[k]));
  ok(spreadOf(im) < spreadOf(free), "個メは1泳法より平ら（全能力を薄く）", `個メ ${spreadOf(im).toFixed(2)} / 自由形 ${spreadOf(free).toFixed(2)}`);
  ok(
    STAT_KEYS.every((k) => im.stats[k] > 40),
    "個メは5能力すべてが伸びる",
    STAT_KEYS.map((k) => (im.stats[k] - 40).toFixed(1)).join("/"),
  );

  ok(STROKE.energyCost.fly > STROKE.energyCost.free, "バタフライは疲れる", `×${STROKE.energyCost.fly}`);
  ok(STROKE.energyCost.im > STROKE.energyCost.free, "個メも疲れる", `×${STROKE.energyCost.im}`);
  ok(STROKE.energyCost.breast < STROKE.energyCost.free, "平泳ぎは軽い", `×${STROKE.energyCost.breast}`);
  void trainingCost;
}

// ================================================================ 4b. 大会でまとまって上がる

head("4b. 大会に出ると練習よりまとまって上がる");
{
  const mk = (): Student => {
    const s = createStudent(rng(45), 9350, "senshu");
    s.grade = "高2";
    s.fav = { stroke: "free", distance: 100 };
    for (const k of CORE_STROKES) {
      s.strokeProf[k] = 100;
      s.strokeTalent[k] = 0.6;
    }
    return s;
  };
  const byTrain = mk();
  applyStrokeTraining(byTrain, "free", {});
  const trainGain = byTrain.strokeProf.free - 100;

  const byMeet = mk();
  addMeetStrokeProf(byMeet, "free", STROKE.meetGain);
  const meetGain = byMeet.strokeProf.free - 100;

  const byWin = mk();
  addMeetStrokeProf(byWin, "free", STROKE.meetGain + STROKE.winBonus);
  const winGain = byWin.strokeProf.free - 100;

  console.log(`
1回ぶんの上がり幅  練習 ${trainGain.toFixed(3)} ／ 大会 ${meetGain.toFixed(2)} ／ 優勝 ${winGain.toFixed(2)}`);
  ok(meetGain > trainGain * 20, "大会1回は練習1回よりずっと大きい", `×${(meetGain / trainGain).toFixed(0)}`);
  ok(winGain > meetGain, "優勝するとさらに上乗せ", `${meetGain.toFixed(1)} → ${winGain.toFixed(1)}`);

  // 個メの種目に出ると4泳法へ分かれて積まれる
  const imRunner = mk();
  addMeetStrokeProf(imRunner, "im", STROKE.meetGain);
  ok(
    CORE_STROKES.every((k) => imRunner.strokeProf[k] > 100),
    "個メの大会は4泳法すべてに積まれる",
    CORE_STROKES.map((k) => imRunner.strokeProf[k].toFixed(1)).join("/"),
  );
}

// ================================================================ 5. 何年で どこまで育つか

head("5. 選手生活で熟練度はどこまで伸びるか（カンストしないこと）");
{
  /** 1日ぶん回す（FacilityScene と同じ順序）。 */
  function runYears(years: number, slots: number, meetsPerYear: number, dorm = false, talent = 0.85): Student {
    const st = new GameState(rng(51), { clubName: "熟練度しらべ" });
    const clock = new GameClock();
    st.gems = 9_999_999;
    for (let i = 0; i < 4; i++) for (const c of st.generateRecruits()) st.hireCoach(c);
    const cls: ClassId = "senshu";
    for (const c of CLASS_ORDER) st.students[c.id] = [];
    const s = createStudent(rng(52), 9400, cls);
    s.grade = "高1";
    s.condition = 70;
    s.fav = { stroke: "free", distance: 100 };
    s.strokeTalent = { free: talent, back: 0.4, breast: 0.2, fly: 0.4 };
    for (const k of CORE_STROKES) s.strokeProf[k] = 0;
    s.plan = { ability: "speed", stroke: "free" };
    s.planMode = "self";
    s.inDorm = dorm;
    st.students[cls].push(s);

    const pool = st.equipment.find((e) => e.gx != null && (e.kind === "pool6" || e.kind === "pool8"));
    if (!pool) throw new Error("プールが無い");
    st.timetable = [];
    for (let i = 0; i < slots; i++) st.setTimetableEntry(pool.id, i, cls, null);
    st.autoAssignCoaches();

    const live = new Set<ClassId>();
    let days = 0;
    let guard = 0;
    const totalDays = years * 360;
    // 大会は「年に meetsPerYear 回、優勝1/3」くらいの想定で足す
    const meetEvery = meetsPerYear > 0 ? Math.floor(360 / meetsPerYear) : 0;
    while (days < totalDays && guard < 20_000_000) {
      guard++;
      const res = clock.tick(CLOCK.msPerMinute * 5);
      const lineup = st.lineupAt(clock.minuteOfDay);
      const running = st.activeClassIds(clock.minuteOfDay);
      const members = new Map<ClassId, Student[]>();
      for (const c of running) members.set(c, membersOfClass(lineup, c));
      for (const c of [...live]) {
        if (!running.includes(c)) {
          st.endClassSession(c);
          live.delete(c);
        }
      }
      const slot = slotAtMinute(clock.minuteOfDay);
      for (const c of running) {
        const mem = members.get(c) ?? [];
        st.beginClassSession(c, mem, slot);
        live.add(c);
        if (res.minutesAdvanced > 0) st.tickPractice(c, res.minutesAdvanced, undefined, mem);
      }
      if (res.dayRolled) {
        for (const c of CLASS_ORDER) {
          st.endClassSession(c.id);
          live.delete(c.id);
        }
        st.onDayRoll();
        days++;
        if (meetEvery > 0 && days % meetEvery === 0) {
          // 大会1回ぶんの熟練度（3回に1回優勝する想定）
          const win = days % (meetEvery * 3) === 0;
          st.enterCompetition([s], { id: "kk_area_1", name: "地区記録会", month: 1, scale: "kirokukai", route: "kirokukai" }, s.fav);
          void win;
        }
        if (res.weekToMonth) st.advanceMonth();
      }
    }
    return s;
  }

  console.log("\n1日2コマ・年6大会で、自由形（才能0.85／上限 " + Math.round(0.85 * (STROKE.talent.capMax - STROKE.talent.capMin) + STROKE.talent.capMin) + "）を鍛え続けたとき");
  console.log("年数   自由形の熟練度   発揮率");
  let last = 0;
  for (const y of [1, 3, 6, 10]) {
    const s = runYears(y, 2, 6);
    last = s.strokeProf.free;
    console.log(`  ${String(y).padStart(2)}年   ${last.toFixed(0).padStart(6)}        ${(strokeExecution(s, "free") * 100).toFixed(0)}%`);
  }
  ok(last < STROKE.max, "10年続けても999にはならない", `${last.toFixed(0)}`);
  ok(last > 200, "10年でそれなりの熟練度にはなる", `${last.toFixed(0)}`);

  // ============================================================== 6. 寮
  //
  // 【入寮の狙い】（2026-09-20）寮は◆100万の大型施設なので、見返りは
  // 「泳法の熟練度がぐんと伸びる」に置いてある（`DORM.strokeGrowthMult`）。
  // 目安は **高校から引退まで入れっぱなしで、得意な1泳法がカンストするかしないか**。
  // 上限に貼り付いてしまうと寮が「入れたら終わり」になり、
  // 届かなさすぎると◆100万に見合わない。数字を触ったらここで測り直すこと。
  head("6. 寮に入ると熟練度がよく伸びる（引退まで入れて、カンストするかしないか）");

  // 高1（15歳）から `AGE_CURVE.normal.retire`（30歳）まで＝15年が「引退まで」。
  console.log("\n高1から引退まで15年（1日2コマ・年6大会）自由形だけを鍛えたとき");
  console.log("泳法の才能   通い（上限の%）   入寮（上限の%）   上限");
  let closedMin = 9; // 上限までの残りを、寮がどれだけ詰めたか
  let gainMin = 1e9;
  let rateLow = 9;
  let rateHigh = 0;
  let over = false;
  for (const talent of [0.4, 0.85]) {
    const away = runYears(15, 2, 6, false, talent);
    const lived = runYears(15, 2, 6, true, talent);
    const cap = strokeCapOf(away, "free");
    const rate = lived.strokeProf.free / cap;
    // 【割合で比べない】一生ぶん回すと通いも寮も上限に張り付くので、
    // 「何倍伸びたか」では差が見えなくなる（×1.15 にしかならない）。
    // 寮の値打ちは**上限までの残りをどれだけ詰めたか**で測る。
    const awayRate = away.strokeProf.free / cap;
    closedMin = Math.min(closedMin, (rate - awayRate) / Math.max(0.01, 1 - awayRate));
    gainMin = Math.min(gainMin, lived.strokeProf.free - away.strokeProf.free);
    rateLow = Math.min(rateLow, rate);
    rateHigh = Math.max(rateHigh, rate);
    if (lived.strokeProf.free > cap + 0.5) over = true;
    console.log(
      `   ${talent.toFixed(2)}      ${away.strokeProf.free.toFixed(0).padStart(4)}（${((away.strokeProf.free / cap) * 100).toFixed(0).padStart(3)}%）` +
        `      ${lived.strokeProf.free.toFixed(0).padStart(4)}（${(rate * 100).toFixed(0).padStart(3)}%）` +
        `      ${cap.toFixed(0)}`,
    );
  }

  ok(closedMin > 0.35, "寮は上限までの残りを大きく詰める", `残りの ${(closedMin * 100).toFixed(0)}% を詰めた`);
  ok(gainMin > 60, "通いとの差は発揮率で分かるくらい開く", `+${gainMin.toFixed(0)}`);
  ok(rateLow >= 0.75, "引退まで入れれば上限の手前まで届く", `上限の ${(rateLow * 100).toFixed(0)}%`);
  ok(rateHigh < 0.995, "才能が高い選手はカンストまでは行かない", `上限の ${(rateHigh * 100).toFixed(0)}%`);
  ok(!over, "才能で決まる上限は超えない");
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
