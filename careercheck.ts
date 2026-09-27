/**
 * 育成の「速さ」と「難易度」の実測（ヘッドレス）。
 *
 * ① 1コマの練習で、クラスごとにどれだけ伸びるか（成長スピードの順番）
 * ② 体力をどれだけ使うか（疲労度の順番）
 * ③ ふつうに10年・20年遊んだとき、選手がどこまで届くか（格・オリンピック）
 *
 * 目標（ユーザー仕様）:
 *   成長スピード・練習強度・疲労度は 幼児 < 学童 < 育成B < 育成A < 選手 < プロ の順
 *   大半の子は「県を代表する」あたりで頭打ち
 *   10年でオリンピック級（格7＝世界トップ）を1人出せるかどうか
 *   20年でその頂点（格8）に届くかどうか
 *
 * 実行:
 *   npx esbuild careercheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { CLASS_ORDER, classLabel, isSchoolClass, type ClassId } from "./src/sim/classes";
import { createStudent, performanceIndex, STAT_KEYS, type StatKey, type Student } from "./src/sim/student";
import { rankOf, rankScore, RANK_TIERS } from "./src/sim/rank";
import { membersOfClass } from "./src/sim/lineup";
import { CLOCK, RANK, TIME } from "./src/config/balance";
import { slotAtMinute, SLOTS } from "./src/sim/timetable";
import { CAMP_ORDER, type CampId } from "./src/sim/camp";
import { estimatedAge } from "./src/sim/growth";

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

let warnings = 0;
function warn(bad: boolean, msg: string, detail = ""): void {
  if (bad) {
    warnings++;
    console.log(`  ⚠ ${msg}${detail ? `  — ${detail}` : ""}`);
  } else {
    console.log(`  ok ${msg}${detail ? `  — ${detail}` : ""}`);
  }
}
function head(s: string): void {
  console.log(`\n=== ${s} ===`);
}

/**
 * 比較は「同じ子が、そのクラスにいたら」でそろえる。
 * 学年を変えると成長タイプ×ライフステージの補正が混ざり、
 * クラスの練習強度そのものを比べられない。
 */
const MEASURE_GRADE = "中2";
const MEASURE_STAT = 40;

/**
 * 実際のプレイでの姿（そのクラスにいる子の、ふつうの学年と能力）。
 * 若いほど伸びしろ（dim）が大きいので、条件をそろえた比較だけでは
 * 「プレイヤーが画面で見ている速さ」を測れない。
 */
const TYPICAL: Record<ClassId, { grade: string; stat: number }> = {
  youji: { grade: "年長", stat: 14 },
  gakudo: { grade: "小4", stat: 28 },
  ikuseiB: { grade: "小5", stat: 42 },
  ikuseiA: { grade: "中1", stat: 55 },
  senshu: { grade: "高1", stat: 68 },
  pro: { grade: "大1", stat: 80 },
};

// ------------------------------------------------------------------ ① 1コマの伸びと疲労

head("1コマの練習（クラス別の成長スピード・疲労度）");

interface Measure {
  classId: ClassId;
  gain: number; // 5能力の合計上昇
  drain: number; // 使った体力
}

function measureLesson(classId: ClassId): Measure {
  const st = new GameState(rng(31), { clubName: "計測" });
  st.gems = 999999;
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;
  const s = createStudent(rng(7), 500, classId);
  // 条件をそろえる（学年・**年齢**・能力・才能・体力・調子）
  //
  // 【年齢をそろえ忘れると測れない】createStudent はクラス相応の学年で作るので、
  // 学年だけ書き換えると age がクラスごとにバラバラのまま残る。
  // 年齢は「一生のどの時期か」（急成長期／ピーク／衰え）を決めていて、
  // プロの既定の年齢（23歳＝ピーク）では伸びが 0.4倍になる。
  // その状態で比べると「上のクラスほど伸びない」という逆の結果が出る。
  s.grade = MEASURE_GRADE;
  s.age = estimatedAge(MEASURE_GRADE);
  for (const k of STAT_KEYS) {
    s.stats[k] = MEASURE_STAT;
    s.talent[k] = 1;
    s.streak[k] = 0;
  }
  s.condition = 78;
  s.energy = 999; // 体力切れで止まらないようにして「1回ぶんの強度」を測る
  st.students[classId].push(s);

  const before = { ...s.stats };
  const e0 = s.energy;
  /**
   * 【5能力を1回ずつ】1回だけ回すと、そのクラスが得意な能力（→ CLASS_FOCUS）を
   * 引いたかどうかで結果が変わってしまう（選手はスピード1.5・フォーム1.0）。
   * 5能力を順に1回ずつ鍛えて合計を取れば、クラスの練習強度そのものを比べられる。
   */
  // 個人メニューで指定する（クラス全体のメニューは自動割り当てのクラスがあり、
  // setClassPlan では育成B/A の狙いを上書きできない → planFor が返す値で確かめてある）
  for (const k of STAT_KEYS) {
    st.setIndividualPlan(s, { ability: k });
    st.tickPractice(classId, 20, undefined, [s]);
  }
  let total = 0;
  for (const k of STAT_KEYS) total += s.stats[k] - before[k];
  return { classId, gain: total, drain: e0 - s.energy };
}

const measures = CLASS_ORDER.map((c) => measureLesson(c.id));
console.log("  クラス     5能力を1回ずつ鍛えた伸び   体力消費");
for (const m of measures) {
  console.log(
    `  ${classLabel(m.classId).padEnd(5, "　")}  ${m.gain.toFixed(3).padStart(8)}          ${m.drain.toFixed(1).padStart(6)}`,
  );
}

/**
 * 【スクールと育成は1ステップでは比べられない】
 *
 * 幼児・学童は**全体練習**なので、1ステップで5能力すべてが同時に上がる
 *（そのぶん1つあたりは小さい → PRACTICE.schoolFocus）。育成以上は
 * 1ステップで1能力だけ。5能力ぶんを足し合わせると、スクールだけ
 * 「5回ぶん × 5能力」で数えることになり、必ず大きく出る。
 *
 * そこでここでは **育成B以上の並び**だけを見る。
 * スクール → 育成の段差は、下の「1ヶ月まるごと回したとき」で見ている
 *（学童 1.3 → 育成B 2.8 と、はっきり段差が付く）。
 */
const ladder = measures.filter((m) => !isSchoolClass(m.classId));
for (let i = 1; i < ladder.length; i++) {
  const a = ladder[i - 1];
  const b = ladder[i];
  warn(
    b.gain <= a.gain,
    `${classLabel(a.classId)} < ${classLabel(b.classId)}（成長スピード）`,
    `${a.gain.toFixed(3)} → ${b.gain.toFixed(3)}`,
  );
}
warn(
  measures[0].gain >= measures[1].gain,
  `${classLabel(measures[0].classId)} < ${classLabel(measures[1].classId)}（成長スピード）`,
  `${measures[0].gain.toFixed(3)} → ${measures[1].gain.toFixed(3)}`,
);
for (let i = 1; i < measures.length; i++) {
  const a = measures[i - 1];
  const b = measures[i];
  warn(
    b.drain <= a.drain,
    `${classLabel(a.classId)} < ${classLabel(b.classId)}（疲労度）`,
    `${a.drain.toFixed(1)} → ${b.drain.toFixed(1)}`,
  );
}

// ------------------------------------------------------------------ ①b 1ヶ月まるごと回したときの伸び

head("1ヶ月の練習（実際のプレイでの成長スピード）");

/**
 * 実際に遊んでいるときと同じ条件で1ヶ月回す。
 * 体力切れ・コンディション・故障・日次回復まで全部込みの「体感」を測る。
 */
function measureMonth(
  classId: ClassId,
  lessons: number,
  typical = false,
): { gain: number; cond: number; energy: number } {
  const st = new GameState(rng(41), { clubName: "計測" });
  st.gems = 999999;
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;
  const s = createStudent(rng(7), 500, classId);
  s.grade = typical ? TYPICAL[classId].grade : MEASURE_GRADE;
  s.age = estimatedAge(s.grade); // 年齢もそろえる（→ measureLesson の注記）
  s.growthType = "normal";
  for (const k of STAT_KEYS) {
    s.stats[k] = typical ? TYPICAL[classId].stat : MEASURE_STAT;
    s.talent[k] = 1;
    s.streak[k] = 0;
  }
  s.condition = 78;
  s.energy = 999;
  s.planMode = "self";
  st.students[classId].push(s);

  // そのクラスを lessons コマ入れる
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const pool = st.placedPools()[0];
  for (let slot = 0; slot < lessons; slot++) {
    const coach = st.availableCoachesFor(slot, pool.id)[0];
    if (coach) st.setTimetableEntry(pool.id, slot, classId, coach.id);
  }

  const before = { ...s.stats };
  const clock = new GameClock();
  const stepMs = CLOCK.msPerMinute * 5;
  const month = st.month;
  let guard = 0;
  while (st.month === month && guard < 200000) {
    guard++;
    const res = clock.tick(stepMs);
    const lineup = st.lineupAt(clock.minuteOfDay);
    for (const cls of st.activeClassIds(clock.minuteOfDay)) {
      const mem = membersOfClass(lineup, cls);
      // コマ（slot）を渡す＝実機と同じ。同じクラスを2コマ入れたら2回練習になる。
      st.beginClassSession(cls, mem, slotAtMinute(clock.minuteOfDay));
      if (res.minutesAdvanced > 0) st.tickPractice(cls, res.minutesAdvanced, undefined, mem);
    }
    if (res.dayRolled) {
      for (const c of CLASS_ORDER) st.endClassSession(c.id);
      st.onDayRoll();
      if (res.weekToMonth) st.advanceMonth();
    }
    // いちばん低い能力を鍛える（ふつうの育て方）
    let lowest: StatKey = "form";
    for (const k of STAT_KEYS) if (s.stats[k] < s.stats[lowest]) lowest = k;
    s.plan.ability = lowest;
  }
  let total = 0;
  for (const k of STAT_KEYS) total += s.stats[k] - before[k];
  return { gain: total, cond: s.condition, energy: s.energy };
}

for (const mode of [false, true]) {
  console.log(`
  --- 2コマ/日 ${mode ? "（実際の学年・能力：プレイヤーが見ている速さ）" : "（条件をそろえた比較）"} ---`);
  console.log("  クラス     1ヶ月の伸び(5能力計)  能力  月末の調子");
  const rows = CLASS_ORDER.map((c) => ({
    id: c.id,
    stat: mode ? TYPICAL[c.id].stat : MEASURE_STAT,
    ...measureMonth(c.id, 2, mode),
  }));
  for (const r of rows) {
    console.log(
      `  ${classLabel(r.id).padEnd(5, "　")}  ${r.gain.toFixed(1).padStart(8)}          ${String(r.stat).padStart(4)}      ${r.cond.toFixed(0).padStart(4)}`,
    );
  }
  /**
   * 【階段を見るのは「条件をそろえた比較」のほうだけ】
   *
   * 「実際の姿」は学年も能力も違う子を並べているので、上のクラスほど
   * **自分の上限に近い**＝伸びが小さくなるのが正しい。
   * 上のクラスほど数字が小さくなるのはそのため（練習で届くのは
   * 才能の上限−4 まで → student.practiceCapOf）。ここは眺めるための表で、
   * クラス設定の良し悪しは上の「条件をそろえた比較」で見る。
   */
  if (mode) continue;
  for (let i = 1; i < rows.length; i++) {
    warn(
      rows[i].gain <= rows[i - 1].gain,
      `${classLabel(rows[i - 1].id)} < ${classLabel(rows[i].id)}`,
      `${rows[i - 1].gain.toFixed(1)} → ${rows[i].gain.toFixed(1)}`,
    );
  }
}

// ------------------------------------------------------------------ ② 長期プレイ（何年で どこまで）

head("長期プレイ：ふつうに育てて何年でどこまで届くか");

/** 1人の選手を「ちゃんと育てた」ときの到達点を年ごとに追う。 */
function career(years: number, seed: number, gifted: boolean): { year: number; p: number; tier: number; score: number }[] {
  const st = new GameState(rng(seed), { clubName: "育成" });
  st.gems = 9_999_999;
  const clock = new GameClock();

  // 才能ある子を1人、幼児から育てる
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;
  const star = createStudent(rng(seed + 1), 900, "youji", { gifted });
  star.grade = "年長";
  st.students.youji.push(star);

  // コーチを最上級でそろえる（＝プレイヤーが最善を尽くした場合）
  for (const cand of st.generateRecruits()) st.hireCoach(cand);
  for (const c of st.coaches) c.quality = 5;

  const out: { year: number; p: number; tier: number; score: number }[] = [];
  const stepMs = CLOCK.msPerMinute * 5;

  for (let y = 0; y < years; y++) {
    for (let m = 0; m < 12; m++) {
      // その子のクラスに合わせて時間割を組み直す（毎コマ練習させる＝最善手）
      retime(st, star.classId, 2);
      coachUp(st, star);
      let guard = 0;
      let month = st.month;
      while (st.month === month && guard < 200000) {
        guard++;
        const res = clock.tick(stepMs);
        const lineup = st.lineupAt(clock.minuteOfDay);
        for (const cls of st.activeClassIds(clock.minuteOfDay)) {
          const mem = membersOfClass(lineup, cls);
          st.beginClassSession(cls, mem, slotAtMinute(clock.minuteOfDay));
          if (res.minutesAdvanced > 0) st.tickPractice(cls, res.minutesAdvanced, undefined, mem);
        }
        if (res.dayRolled) {
          for (const c of CLASS_ORDER) st.endClassSession(c.id);
          st.onDayRoll();
          if (res.weekToMonth) st.advanceMonth();
        }
      }
      // 昇格できるなら上げる（プレイヤーの最善手）。学年が足りなければ通らない。
      st.promoteStudent(star);
      // 【合宿も最善手のうち】練習で届くのは「才能の上限−4」まで（→ student.practiceCapOf）。
      // 最後のひと伸びは合宿でしか埋まらないので、打てる月は必ず打つ。
      // ここを入れないと「ちゃんと育てた選手」を過小に見積もることになる。
      if (st.campEligible(star).ok) {
        const best = affordableCamp(st, 1);
        if (best) st.runCamp([star], { id: best, stayDays: 9, intensity: 1 });
      }
    }
    out.push({
      year: y + 1,
      p: performanceIndex(star, star.fav),
      tier: rankOf(star),
      score: rankScore(star),
    });
  }
  return out;
}

/** いま打てる合宿のうち、いちばん効果の大きいもの（＝お金を惜しまないプレイヤー）。 */
function affordableCamp(st: GameState, heads: number): CampId | null {
  const order = [...CAMP_ORDER].reverse(); // 海外の高いほうから見る
  for (const id of order) {
    if (!st.campTypeStatus(id).ok) continue;
    if (st.gems < st.campCostFor(heads, id)) continue;
    return id;
  }
  return null;
}

/**
 * 時間割を組む（ちゃんと考えるプレイヤーを模す）。
 *  ・幼児・学童のコマは必ず1つ残す（残さないと、卒園した子の入る先が無くて退会する）
 *  ・育てている子のクラスは lessons コマ（詰め込みすぎるとコンディションが落ちて故障する）
 */
function retime(st: GameState, classId: ClassId, lessons: number): void {
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const pool = st.placedPools()[0];
  if (!pool) return;
  const plan: (ClassId | null)[] = ["youji", "gakudo"];
  for (let i = 0; i < lessons; i++) plan.push(classId);
  while (plan.length < SLOTS.length) plan.push(null);
  for (let slot = 0; slot < SLOTS.length; slot++) {
    if (!plan[slot]) continue;
    const coach = st.availableCoachesFor(slot, pool.id)[0];
    if (!coach) break;
    st.setTimetableEntry(pool.id, slot, plan[slot], coach.id);
  }
}

/**
 * 育て方（＝プレイヤーの腕）。
 * いちばん低い能力を鍛える＝バランス良く伸ばす、という素直な戦略。
 * コンディションが落ちていたら休ませる。
 */
function coachUp(st: GameState, s: Student): void {
  s.planMode = "self";
  let lowest: StatKey = "form";
  for (const k of STAT_KEYS) if (s.stats[k] < s.stats[lowest]) lowest = k;
  s.plan.ability = lowest;
  s.plan.stroke = s.fav.stroke;
  // 疲れているなら1回休ませる（無理をさせると故障してフォームが落ちる）
  if (s.condition < 45 && !st.isRestingNow(s)) st.restStudent(s);
}

const star = career(20, 202, true);
console.log("  年   能力指数P   格スコア   格");
for (const row of star) {
  if (row.year % 2 === 0 || row.year <= 3) {
    console.log(
      `  ${String(row.year).padStart(2)}   ${row.p.toFixed(1).padStart(6)}  ${String(Math.round(row.score)).padStart(6)}   ${RANK_TIERS[row.tier - 1]?.label ?? "-"}`,
    );
  }
}

const y10 = star[9];
const y20 = star[19];
console.log(`\n  10年後：P=${y10.p.toFixed(1)}（標準=${TIME.powerAtStandard}）／格${y10.tier}`);
console.log(`  20年後：P=${y20.p.toFixed(1)}／格${y20.tier}`);

/**
 * 【育成のペース（2026-09-17 に置き直した）】
 *
 * 「グラフではなかなか成果が見えないくらい」まで全体を遅くしたので、
 * 格の上がり方も一段ゆっくりになった。ちゃんと育てた1人の目安：
 *   10年 … 地域で有名（格3）
 *   14年 … 県を代表（格4）
 *   18年 … 日本を代表（格5）
 *   そこから全国・アジアで勝てば 世界屈指（格6）、世界で勝ち続けて 格7
 * 大半の子は「県を代表する」あたりで頭打ちになる、は変わらない。
 */
warn(y10.tier < 3, "10年で地域級（格3）には届く", `格${y10.tier}`);
warn(star[13].tier < 4, "14年で県代表級（格4）に届く", `格${star[13].tier}`);
warn(star[17].tier < 5, "18年あれば日本代表級（格5）に届く", `格${star[17].tier}`);
warn(y10.tier >= 6, "10年では世界屈指（格6）にはならない", `格${y10.tier}`);
// 上の格は「勝った実績」でしか届かない＝オリンピックの重み
warn(y20.tier >= 6, "練習だけでは世界屈指（格6）に届かない", `格${y20.tier}（スコア${Math.round(y20.score)}）`);

// 大会で勝つと、そこから上の格へ手が届く
{
  const withWins = y20.score + RANK.scalePoints.nihon + RANK.scalePoints.asia;
  const withWorld = withWins + RANK.scalePoints.sekai * 2;
  const tierOf = (v: number): number => {
    let t = 1;
    for (let i = 0; i < RANK_TIERS.length; i++) if (v >= RANK_TIERS[i].need) t = i + 1;
    return t;
  };
  console.log(
    `  ＋日本選手権・アジア優勝 → スコア${Math.round(withWins)}／格${tierOf(withWins)}` +
      `　＋世界大会2勝 → スコア${Math.round(withWorld)}／格${tierOf(withWorld)}`,
  );
  warn(tierOf(withWins) < 6, "全国・アジアで勝てば世界屈指（格6）に届く", `格${tierOf(withWins)}`);
  warn(tierOf(withWorld) < 7, "世界大会で勝ち続ければ格7に届く", `格${tierOf(withWorld)}`);
}

// ふつうの子（才能なし）はどこで止まるか
const plain = career(12, 77, false);
const p12 = plain[11];
console.log(`\n  才能のない子の12年後：P=${p12.p.toFixed(1)}／格${p12.tier}（${RANK_TIERS[p12.tier - 1]?.label}）`);
warn(p12.tier >= 5, "ふつうの子は県代表どまり（日本代表にはならない）", `格${p12.tier}`);
warn(p12.tier < 3, "ふつうの子でも地域〜県レベルには届く", `格${p12.tier}`);

console.log(`\n${warnings === 0 ? "気になる点なし" : `${warnings}件 気になる`}`);
