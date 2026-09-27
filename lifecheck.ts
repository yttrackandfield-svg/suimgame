/// <reference types="node" />
/**
 * 選手の一生（成長タイプ別のカーブ・衰え・引退・コーチ化）の検証。
 *
 * 見たいこと
 *   ・タイプごとに「いつ伸び／いつピーク／いつ衰え／いつ引退」がずれているか
 *   ・衰え期に落ちるのは**スピードとスタートから**で、フォームとターンは残るか
 *   ・**泳法の熟練度は歳を取っても落ちない**か（＝経験で戦えるか）
 *   ・引退したあと、熟練度の高い選手ほどコーチとして残るか
 *
 * 実行:
 *   npx esbuild lifecheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { CLASS_ORDER } from "./src/sim/classes";
import { AGE_CURVE, AGING, RETIRE } from "./src/config/balance";
import {
  CAREER_PHASE_LABEL,
  careerPhaseOf,
  GROWTH_LABEL,
  GROWTH_TYPES,
  retireAgeOf,
  yearsLeftOf,
  type GrowthType,
} from "./src/sim/growth";
import {
  applyAging,
  applyTraining,
  createStudent,
  CORE_STROKES,
  isRetireAge,
  STAT_KEYS,
  strokeProfOf,
  type Student,
} from "./src/sim/student";
import { careerLine } from "./src/data/careerLines";

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

// ================================================================ 1. タイプごとの時期

head("1. 成長タイプごとの一生（幼児から追う）");
{
  console.log("\nタイプ      急成長期      ピーク       衰え始め      限界      引退");
  for (const t of GROWTH_TYPES) {
    const c = AGE_CURVE[t];
    console.log(
      `  ${GROWTH_LABEL[t].padEnd(5)} 〜${String(c.peak - 1).padStart(2)}歳    ` +
        `${String(c.peak).padStart(2)}〜${String(c.decline - 1).padStart(2)}歳    ` +
        `${String(c.decline).padStart(2)}〜${String(c.limit - 1).padStart(2)}歳    ` +
        `${String(c.limit).padStart(2)}〜${String(c.retire - 1).padStart(2)}歳   ${c.retire}歳`,
    );
  }
  // 早いほうから順にピークが来て、引退も早い
  // 【持続型はここに並べない】持続型は「ピークが遅い」タイプではなく「ピークが長い」タイプ。
  // ピークの入り口は晩成より早くても、抜けるのがいちばん遅い。
  const timing: GrowthType[] = ["superEarly", "early", "normal", "late"];
  const order: GrowthType[] = [...timing, "sustained"];
  let peakOk = true;
  let retireOk = true;
  for (let i = 1; i < timing.length; i++) {
    if (AGE_CURVE[timing[i]].peak <= AGE_CURVE[timing[i - 1]].peak) peakOk = false;
  }
  for (let i = 1; i < order.length; i++) {
    if (AGE_CURVE[order[i]].retire <= AGE_CURVE[order[i - 1]].retire) retireOk = false;
  }
  ok(peakOk, "超早熟 → 晩成 の順にピークが遅くなる", timing.map((t) => AGE_CURVE[t].peak).join(" → "));
  ok(retireOk, "超早熟 → 持続 の順に長く現役でいられる", order.map((t) => AGE_CURVE[t].retire).join(" → "));
  const span = (t: GrowthType): number => AGE_CURVE[t].decline - AGE_CURVE[t].peak;
  ok(
    timing.every((t) => span("sustained") > span(t)),
    "持続型はピークがいちばん長い",
    order.map((t) => `${GROWTH_LABEL[t]}${span(t)}年`).join(" / "),
  );
  ok(retireAgeOf("superEarly") <= 26, "超早熟は20代半ばで引退", `${retireAgeOf("superEarly")}歳`);
  ok(retireAgeOf("sustained") >= 35, "持続型は30代半ばまで現役", `${retireAgeOf("sustained")}歳`);

  // 時期の判定がカーブどおりか
  for (const t of GROWTH_TYPES) {
    const c = AGE_CURVE[t];
    ok(
      careerPhaseOf(t, c.peak - 1) === "grow" &&
        careerPhaseOf(t, c.peak) === "peak" &&
        careerPhaseOf(t, c.decline) === "decline" &&
        careerPhaseOf(t, c.limit) === "limit",
      `${GROWTH_LABEL[t]}：境目どおりに時期が変わる`,
    );
  }
}

// ================================================================ 2. 伸びと衰えの実測

head("2. 幼児から引退まで、能力がどう動くか");
{
  /** 1年ぶん「そこそこ練習した」ことにして進める。 */
  function liveOneYear(s: Student): void {
    for (let i = 0; i < 220; i++) {
      s.energy = 999;
      s.condition = 75;
      applyTraining(s, STAT_KEYS[i % STAT_KEYS.length], { rand: rng(7 + i) });
    }
    applyAging(s);
  }

  for (const t of GROWTH_TYPES) {
    const s = createStudent(rng(101), 9500, "gakudo");
    s.growthType = t;
    s.age = 8;
    s.grade = "小3";
    for (const k of STAT_KEYS) s.stats[k] = 20;
    for (const k of CORE_STROKES) s.strokeProf[k] = 300;

    const marks: string[] = [];
    let peakAbility = 0;
    let peakAge = 0;
    let lastPhase = "";
    while (!isRetireAge(s)) {
      const avg = STAT_KEYS.reduce((n, k) => n + s.stats[k], 0) / STAT_KEYS.length;
      if (avg > peakAbility) {
        peakAbility = avg;
        peakAge = s.age;
      }
      const phase = careerPhaseOf(s.growthType, s.age);
      if (phase !== lastPhase) {
        marks.push(`${s.age}歳:${CAREER_PHASE_LABEL[phase]}(能力${avg.toFixed(0)})`);
        lastPhase = phase;
      }
      // 学年も進める（ライフステージの倍率のため）
      if (s.age >= 19) s.grade = "社会人";
      else if (s.age >= 16) s.grade = "高2";
      else if (s.age >= 13) s.grade = "中2";
      liveOneYear(s);
    }
    const end = STAT_KEYS.reduce((n, k) => n + s.stats[k], 0) / STAT_KEYS.length;
    console.log(`\n${GROWTH_LABEL[t]}`);
    console.log(`  ${marks.join(" → ")}`);
    console.log(`  最高 ${peakAbility.toFixed(0)}（${peakAge}歳） → 引退時 ${end.toFixed(0)}（${s.age}歳）`);
    ok(peakAbility > 30, `${GROWTH_LABEL[t]}：ちゃんと伸びる`, `最高 ${peakAbility.toFixed(0)}`);
    ok(end < peakAbility, `${GROWTH_LABEL[t]}：引退時は全盛期より落ちている`, `${peakAbility.toFixed(0)} → ${end.toFixed(0)}`);
    ok(
      CORE_STROKES.every((k) => Math.abs(s.strokeProf[k] - 300) < 1e-6),
      `${GROWTH_LABEL[t]}：熟練度は歳を取っても落ちない`,
      `${s.strokeProf.free.toFixed(0)}`,
    );
  }
}

// ================================================================ 3. 衰え方の違い

head("3. 衰えるのはスピードから（技術は残る）");
{
  const s = createStudent(rng(111), 9600, "senshu");
  s.growthType = "normal";
  s.age = AGE_CURVE.normal.decline;
  for (const k of STAT_KEYS) s.stats[k] = 80;
  const before = { ...s.stats };
  for (let i = 0; i < 3; i++) applyAging(s);
  console.log("\n衰え期に3年（能力80から）");
  for (const k of STAT_KEYS) console.log(`  ${k.padEnd(8)} ${before[k].toFixed(0)} → ${s.stats[k].toFixed(1)}`);
  ok(s.stats.speed < s.stats.form, "スピードのほうがフォームより落ちる", `速${s.stats.speed.toFixed(1)} / 形${s.stats.form.toFixed(1)}`);
  ok(s.stats.start < s.stats.turn, "スタートのほうがターンより落ちる", `発${s.stats.start.toFixed(1)} / 回${s.stats.turn.toFixed(1)}`);
  ok(s.stats.stamina < s.stats.form && s.stats.stamina > s.stats.speed, "持久力はその中間");
  ok(AGING.strokeDecline === 0, "熟練度は加齢で落ちない設定");

  // 限界期はもっと落ちる
  const hard = createStudent(rng(112), 9601, "senshu");
  hard.growthType = "normal";
  hard.age = AGE_CURVE.normal.limit;
  for (const k of STAT_KEYS) hard.stats[k] = 80;
  applyAging(hard);
  const declineLoss = 80 - (80 - AGING.declinePerYear.decline * AGING.declineBy.speed);
  ok(80 - hard.stats.speed > declineLoss, "限界期は衰え期より落ち幅が大きい", `${(80 - hard.stats.speed).toFixed(1)}/年`);
}

// ================================================================ 4. 引退とコーチ化

head("4. 引退とコーチ化");
{
  const st = new GameState(rng(121), { clubName: "一生しらべ" });
  st.gems = 9_999_999;
  const s = st.students.gakudo[0];
  s.growthType = "normal";
  s.age = retireAgeOf("normal");
  const before = st.students[s.classId].length;
  const rec = st.retireStudent(s, true);
  ok(st.students[s.classId].length === before - 1, "引退すると名簿から外れる");
  ok(st.retired[0]?.studentId === s.id, "引退の記録が残る", rec.name);
  ok(rec.byChoice, "自分で決めた引退として記録される");

  // 熟練度が高いほどコーチの声が掛かる
  const trial = (prof: number, runs = 400): number => {
    let offers = 0;
    for (let i = 0; i < runs; i++) {
      const g = new GameState(rng(200 + i), { clubName: "コーチ化しらべ" });
      const x = g.students.gakudo[0];
      x.achievePoints = 1200;
      for (const k of CORE_STROKES) x.strokeProf[k] = prof;
      if (g.retireStudent(x, false).coachOffer) offers++;
    }
    return offers / runs;
  };
  const low = trial(100);
  const mid = trial(500);
  const high = trial(950);
  console.log(`\nコーチの声が掛かる割合  熟練度100 ${(low * 100).toFixed(0)}% / 500 ${(mid * 100).toFixed(0)}% / 950 ${(high * 100).toFixed(0)}%`);
  ok(low === 0, "熟練度が低いと声は掛からない", `${(low * 100).toFixed(0)}%`);
  ok(mid > 0 && mid < 1, "名選手級で、掛かることがある（全員ではない）", `${(mid * 100).toFixed(0)}%`);
  ok(high > mid, "熟練度が高いほど掛かりやすい", `${(mid * 100).toFixed(0)}% → ${(high * 100).toFixed(0)}%`);

  // 得意だった泳法の指導が得意になる
  const g2 = new GameState(rng(333), { clubName: "得意しらべ" });
  const ace = g2.students.gakudo[0];
  ace.strokeProf = { free: 200, back: 900, breast: 100, fly: 150, im: 0 };
  ace.achievePoints = 2000;
  let offer = null;
  for (let i = 0; i < 60 && !offer; i++) {
    const g3 = new GameState(rng(400 + i), { clubName: "得意しらべ" });
    const x = g3.students.gakudo[0];
    x.strokeProf = { free: 200, back: 900, breast: 100, fly: 150, im: 0 };
    x.achievePoints = 2000;
    offer = g3.retireStudent(x, false).coachOffer;
  }
  ok(!!offer, "名選手はいずれコーチの誘いを受ける");
  if (offer) {
    ok(offer.coach.specialty === "back", "現役時代の得意泳法が指導の得意になる", offer.coach.specialty);
    ok(offer.coach.quality >= RETIRE.coach.qualityMin, "格は下限以上", `${offer.coach.quality}`);
    ok(offer.coach.name.includes("コーチ"), "名前が引き継がれる", offer.coach.name);
  }

  // 年度をまたぐと自動で引退する
  const g4 = new GameState(rng(555), { clubName: "自動引退しらべ" });
  const old = g4.students.gakudo[0];
  old.growthType = "superEarly";
  old.age = retireAgeOf("superEarly") - 1;
  const id = old.id;
  for (let i = 0; i < 12; i++) g4.advanceMonth();
  const still = CLASS_ORDER.flatMap((c) => g4.students[c.id]).some((x) => x.id === id);
  ok(!still, "引退年齢に達したら年度の変わり目に引退する");
  ok(g4.retired.some((r) => r.studentId === id), "自動引退も記録に残る");
}

// ================================================================ 5. 成長段階のコメント

head("5. 年齢×タイプのコメント");
{
  console.log("");
  for (const t of GROWTH_TYPES) {
    const c = AGE_CURVE[t];
    const ages = [10, c.peak, c.decline, c.limit];
    for (const age of ages) {
      const phase = careerPhaseOf(t, age);
      const line = careerLine(phase, t, age, yearsLeftOf(t, age), 3);
      console.log(`  ${GROWTH_LABEL[t].padEnd(5)} ${String(age).padStart(2)}歳 ${CAREER_PHASE_LABEL[phase].padEnd(5)} ${line}`);
    }
  }
  let allHave = true;
  for (const t of GROWTH_TYPES) {
    for (let age = 6; age <= retireAgeOf(t); age++) {
      for (let seed = 0; seed < 4; seed++) {
        const phase = careerPhaseOf(t, age);
        if (!careerLine(phase, t, age, yearsLeftOf(t, age), seed)) allHave = false;
      }
    }
  }
  ok(allHave, "どの年齢・タイプでもコメントが出る");
  const lateYoung = careerLine("grow", "late", 15, 18, 0);
  ok(lateYoung.includes("これから") || lateYoung.includes("もがい") || lateYoung.includes("遅れて"), "晩成の若いころは「これから」の言い回し", lateYoung);
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
