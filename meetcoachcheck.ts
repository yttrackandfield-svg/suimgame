/// <reference types="node" />
/**
 * コーチの入手（2026-10-02）の検証。
 *
 *   1. 記録会での出会い：段ごとの格の出方（名コーチ以上だけ・上の段ほど高い・レジェンドは上の段だけ）
 *   2. 出会いの確率と天井：優勝した記録会だけで抽選・約3割／外れが続いても pityAfter で必ず出会う／
 *      記録会1つにつき1回・月に1人まで／優勝しなければ天井の状態でも出会わない（2026-10-05）
 *   3. 募集名簿：応募者の格はクラブの格で決まる（抽選しない）・レジェンドは来ない
 *   4. 名簿があふれても、出会ったコーチは押し出されない
 *   5. セーブして読み込んでも、天井の数と出会いの印が残る
 *
 * 実行:
 *   npx esbuild meetcoachcheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { kirokukaiOf, KIROKUKAI_LADDER } from "./src/sim/competitions";
import { recruitQualitiesFor, rollMeetCoachQuality } from "./src/sim/coach";
import { COACHING, MEET_COACH } from "./src/config/balance";
import { applySave, buildSave } from "./src/save/serialize";
import { STAT_KEYS, type Student } from "./src/sim/student";

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
function head(s: string): void {
  console.log(`\n=== ${s} ===`);
}

/**
 * 地区記録会で必ず優勝できるくらい強くする（出会いは優勝したときだけ抽選するので）。
 * 速さを決める能力と、得意泳法の熟練度を上げきっておく。
 */
function champion(s: Student): Student {
  for (const k of STAT_KEYS) s.stats[k] = 100;
  s.strokeProf[s.fav.stroke] = 999;
  s.condition = 100;
  return s;
}

// ------------------------------------------------------------------ 1. 段ごとの格
head("1. 記録会の段ごとに出会うコーチの格");
{
  const N = 20000;
  const means: number[] = [];
  let allHigh = true;
  for (let t = 0; t < KIROKUKAI_LADDER.length; t++) {
    const count = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) count[rollMeetCoachQuality(t, rand)]++;
    if (count[1] + count[2] > 0) allHigh = false;
    const mean = count.reduce((a, c, q) => a + c * q, 0) / N;
    means.push(mean);
    const pct = (q: number): string => `${((count[q] / N) * 100).toFixed(0)}%`;
    console.log(`  ${KIROKUKAI_LADDER[t].name.padEnd(10, "　")} 名コーチ ${pct(3)}  トップ ${pct(4)}  レジェンド ${pct(5)}`);
    if (t <= 1) ok(count[5] === 0, `${KIROKUKAI_LADDER[t].name}ではレジェンドに出会わない`);
  }
  ok(allHigh, "出会うのは名コーチ以上だけ");
  ok(means.every((m, i) => i === 0 || m > means[i - 1]), "上の段ほど格の高いコーチに出会う", means.map((m) => m.toFixed(2)).join(" → "));
}

// ------------------------------------------------------------------ 2. 確率と天井
head("2. 出会いの確率と天井");
{
  const st = new GameState(rand);
  const athlete = champion(st.students.ikuseiB[0]);
  let met = 0;
  let rolls = 0;
  let streak = 0;
  let maxStreak = 0;
  const MONTHS = 3000;
  for (let m = 0; m < MONTHS; m++) {
    st.monthCount = 100 + m;
    const comp = kirokukaiOf(4, 0);
    // 同じ記録会に3種目出しても、抽選は1回
    let metThisMeet = 0;
    for (let k = 0; k < 3; k++) {
      const r = st.enterCompetition([athlete], comp, athlete.fav);
      if (!r.entries.some((e) => e.entrant.win)) ok(false, "検査の前提：地区記録会で優勝できる");
      if (r.coachMet) metThisMeet++;
    }
    rolls++;
    if (metThisMeet > 0) {
      met++;
      streak = 0;
    } else {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    }
    if (metThisMeet > 1) ok(false, "同じ記録会で2人に出会わない");
  }
  const rate = met / rolls;
  ok(rate > 0.3 && rate < 0.42, "出会いは優勝した記録会の3回に1回くらい（天井込み）", `${(rate * 100).toFixed(1)}%`);
  ok(maxStreak <= MEET_COACH.pityAfter, `${MEET_COACH.pityAfter}回続けて外れたら次は必ず出会う`, `最長の外れ ${maxStreak}回`);

  // 月に1人まで：同じ月に2つの段に出ても、出会えるのは1人
  const st2 = new GameState(rand);
  const a2 = champion(st2.students.ikuseiB[0]);
  a2.season.clearedStages.push(`kk_area@${a2.fav.stroke}-${a2.fav.distance}`);
  let twice = 0;
  for (let m = 0; m < 2000; m++) {
    st2.monthCount = 100 + m;
    st2.meetCoachMiss = MEET_COACH.pityAfter; // 両方とも天井で必ず当たる状態にする
    const r1 = st2.enterCompetition([a2], kirokukaiOf(4, 0), a2.fav);
    const r2 = st2.enterCompetition([a2], kirokukaiOf(4, 1), a2.fav);
    if (r1.coachMet && r2.coachMet) twice++;
  }
  ok(twice === 0, "同じ月に出会えるのは1人まで");

  // 優勝しなければ、天井の状態でも出会わない（出場しただけでは抽選しない）
  const st3 = new GameState(rand);
  const weak = st3.students.ikuseiB[0];
  for (const k of STAT_KEYS) weak.stats[k] = 1;
  let lostMeets = 0;
  let metWithoutWin = 0;
  for (let m = 0; m < 200; m++) {
    st3.monthCount = 100 + m;
    st3.meetCoachMiss = MEET_COACH.pityAfter;
    const r = st3.enterCompetition([weak], kirokukaiOf(4, 0), weak.fav);
    if (r.entries.some((e) => e.entrant.win)) continue;
    lostMeets++;
    if (r.coachMet) metWithoutWin++;
  }
  ok(lostMeets > 0 && metWithoutWin === 0, "優勝しなければ出会わない（天井の状態でも）", `負けた記録会 ${lostMeets}回`);
  ok(st3.meetCoachMiss === MEET_COACH.pityAfter, "負けた記録会は外れに数えない", `${st3.meetCoachMiss}`);
}

// ------------------------------------------------------------------ 3. 募集名簿
head("3. 募集名簿の格はクラブの格で決まる");
{
  for (let tier = 1; tier <= 6; tier++) {
    const qs: number[] = [];
    for (let m = 0; m < 12; m++) qs.push(...recruitQualitiesFor(tier, m, COACHING.recruit.perMonth));
    const top = Math.max(...qs);
    const avg = qs.reduce((a, b) => a + b, 0) / qs.length;
    console.log(`  格${tier}: 1年の応募 ${qs.join("")}  （平均 ${avg.toFixed(2)}・最高 ${top}）`);
    ok(top < 5, `格${tier}でもレジェンドは応募してこない`);
  }
  const same = recruitQualitiesFor(3, 7, 2).join() === recruitQualitiesFor(3, 7, 2).join();
  ok(same, "同じ格・同じ月なら応募者の格は同じ（抽選しない）");
  const avgOf = (t: number): number => {
    const qs: number[] = [];
    for (let m = 0; m < 12; m++) qs.push(...recruitQualitiesFor(t, m, 2));
    return qs.reduce((a, b) => a + b, 0) / qs.length;
  };
  ok([1, 2, 3, 4, 5, 6].every((t, i, a) => i === 0 || avgOf(t) > avgOf(a[i - 1])), "格が上がるほど応募者の格も上がる");

  const st = new GameState(rand);
  for (let m = 0; m < 24; m++) {
    st.monthCount = m;
    st.refillRecruitPool();
  }
  ok(st.recruitPool.every((c) => c.coach.quality < 5), "名簿にレジェンドは混じらない");
}

// ------------------------------------------------------------------ 4. あふれても押し出されない
head("4. 名簿があふれても、出会ったコーチは残る");
{
  const st = new GameState(rand);
  const a = champion(st.students.ikuseiB[0]);
  st.monthCount = 50;
  st.meetCoachMiss = MEET_COACH.pityAfter;
  const r = st.enterCompetition([a], kirokukaiOf(4, 0), a.fav);
  ok(r.coachMet != null, "天井の状態なら必ず出会う", r.coachMet ? `${r.coachMet.coach.name}（★${r.coachMet.coach.quality}）` : "");
  ok(r.coachMet?.metAt === "地区記録会", "どの記録会で出会ったかが残る", r.coachMet?.metAt ?? "");
  ok(
    st.generateRecruits().length === COACHING.recruit.initialCount + 1,
    "名簿を開く前に出会っても、ふつうの応募者も最初から居る",
    `${st.recruitPool.length}人`,
  );
  // 同じ月のうちに名簿を何度もあふれさせる
  for (let i = 0; i < 10; i++) st.refillRecruitPool();
  ok(st.recruitPool.length <= COACHING.recruit.poolMax, "名簿は上限を超えない", `${st.recruitPool.length}人`);
  ok(st.recruitPool.some((c) => c.coach.id === r.coachMet?.coach.id), "出会ったコーチは押し出されない");

  // 雇える（一時金はふつうの応募と同じ表）
  st.gems = 9_999_999;
  st.buyEquipment("coachroom"); // 開始時はコーチ1人が定員なので、枠を空ける
  const before = st.coaches.length;
  const hired = r.coachMet ? st.hireCoach(r.coachMet) : { ok: false };
  ok(hired.ok && st.coaches.length === before + 1, "出会ったコーチを雇える");
}

// ------------------------------------------------------------------ 5. セーブ
head("5. セーブして読み込んでも残る");
{
  const st = new GameState(rand);
  const a = champion(st.students.ikuseiB[0]);
  st.monthCount = 60;
  st.meetCoachMiss = MEET_COACH.pityAfter;
  const r = st.enterCompetition([a], kirokukaiOf(4, 0), a.fav);
  st.meetCoachMiss = 3;
  const data = buildSave(st, new GameClock(), 0);
  const st2 = new GameState(rand);
  applySave(JSON.parse(JSON.stringify(data)), st2, new GameClock());
  ok(st2.meetCoachMiss === 3, "外れの数が残る（天井がリセットされない）", `${st2.meetCoachMiss}`);
  ok(st2.meetCoachMetMonth === 60, "今月もう出会ったことが残る");
  const c = st2.recruitPool.find((x) => x.coach.id === r.coachMet?.coach.id);
  ok(c?.metAt === "地区記録会", "名簿の「出会った」印が残る", c?.metAt ?? "なし");
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
