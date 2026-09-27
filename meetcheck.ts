/// <reference types="node" />
/**
 * 年間カレンダー・相手（CP選手）の名前・メドレーリレーの検証。
 *
 * 2026-09-21 に大会まわりを組み直したぶん。
 *   1. 小中高が同じ段（4月地域→5月都道府県→6月ブロック→7月全国→8月世界）を歩く
 *   2. 一般は 10月 日本選手権（全世代共通の参加標準記録）→ 11月 アジア選手権 → 12月 世界選手権
 *   3. 相手の名前：強豪は使い回し／モブは毎回ちがう／世界大会は外国の選手
 *   4. メドレーリレー：日本選手権の100m優勝者が日本代表になる
 *
 * 実行:
 *   npx esbuild meetcheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { createStudent, type RaceEvent, type StatKey, type Stroke, type Student } from "./src/sim/student";
import {
  CALENDAR,
  canEnterOf,
  confirmEventsFor,
  ensureSeason,
  rivalLevelOf,
  stageEventKey,
  type Competition,
} from "./src/sim/competitions";
import { makeRivalSpecs, NATIONS, nationBonus } from "./src/sim/rivals";
import { SCALE_MAYOR_PRIZE } from "./src/config/balance";
import { RELAY_ORDER } from "./src/sim/relay";
import { timeFromPower } from "./src/sim/race";
import { ALL_EVENTS, getStandardTime } from "./src/data/standardTimes";
import { lifeStageOf } from "./src/sim/growth";

let seed = 20260921;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

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

/** 検証用の選手を1人作って入れる。 */
function mk(g: GameState, id: number, gender: "m" | "f", grade: string, fav: { stroke: Stroke; distance: number }): Student {
  const s = createStudent(rand, id, "pro");
  s.gender = gender;
  s.grade = grade;
  s.fav = { ...fav };
  for (const k of ["speed", "stamina", "form", "start", "turn"] as StatKey[]) s.stats[k] = 92;
  s.strokeProf[fav.stroke] = 880;
  s.season = { year: g.year, clearedStages: [], standards: [], standardEvents: [] };
  g.students.pro.push(s);
  return s;
}

// ================================================================ 1. 年間カレンダー

head("小中高が同じ段を同じ月に歩く");
{
  const byRoute = (route: string): Competition[] =>
    CALENDAR.filter((c) => c.route === route).sort((a, b) => a.month - b.month);

  for (const [route, label] of [
    ["elementary", "小学"],
    ["middle", "中学"],
    ["high", "高校"],
  ] as const) {
    const ladder = byRoute(route);
    ok(ladder.length === 6, `${label}ルートは6段`, ladder.map((c) => c.name).join("→"));
    ok(
      ladder.map((c) => c.month).join(",") === "4,5,6,7,8,9",
      `${label}は4→5→6→7→8→9月`,
      ladder.map((c) => `${c.month}月`).join(","),
    );
    ok(
      ladder[4].scale === "asia" && ladder[5].scale === "sekai",
      `${label}は全国の次がアジア、その次が世界`,
      `${ladder[4].name}→${ladder[5].name}`,
    );
    ok(
      !ladder[0].requiresPrev && ladder.slice(1).every((c) => !!c.requiresPrev),
      `${label}の入口だけ前提が無い`,
    );
    ok(
      ladder.slice(1).every((c, i) => c.requiresPrev === ladder[i].id),
      `${label}は前の段で優勝すると次に出られる`,
      ladder.map((c) => c.requiresPrev ?? "－").join(","),
    );
    ok(
      ladder[5].scale === "sekai" && !ladder[5].qualifier,
      `${label}の最後は世界大会（その先は無い）`,
      `${ladder[5].name}`,
    );
  }

  // 相手の強さは年代で変わる（同じ「世界大会」でも別物）
  const el = rivalLevelOf(byRoute("elementary")[5]);
  const mid = rivalLevelOf(byRoute("middle")[5]);
  const hi = rivalLevelOf(byRoute("high")[5]);
  const gen = rivalLevelOf(CALENDAR.find((c) => c.id === "gen_sekai")!);
  ok(el < mid && mid < hi && hi < gen, "世界大会の相手は 小 < 中 < 高 < 一般", `${el} < ${mid} < ${hi} < ${gen}`);
  ok(el > 20, "小学生の世界大会でも相手はそれなりに速い", `${el}`);

  // 4月は3ルートが並ぶ
  const april = CALENDAR.filter((c) => c.month === 4);
  ok(april.length === 3, "4月は3つの地区予選（小中高）", april.map((c) => c.name).join("・"));
  // アジアは世界の1つ手前（強さも1段下）
  const asia = rivalLevelOf(byRoute("high")[4]);
  ok(asia < hi, "アジアは世界より1段やさしい", `アジア${asia} < 世界${hi}`);
}

head("一般は 10月 日本選手権 → 11月 アジア選手権 → 12月 世界選手権");
{
  const nihon = CALENDAR.find((c) => c.id === "gen_nihon")!;
  const asiaC = CALENDAR.find((c) => c.id === "gen_asia")!;
  const sekai = CALENDAR.find((c) => c.id === "gen_sekai")!;
  ok(nihon.month === 10, "日本選手権は10月", `${nihon.month}月`);
  ok(asiaC.month === 11 && asiaC.requiresPrev === "gen_nihon" && asiaC.qualifier, "アジア選手権は11月・日本選手権の優勝者");
  // 【クラスで閉ざさない】標準記録を切れば育成Bでも出られる
  for (const c of [nihon, asiaC, sekai]) {
    ok(canEnterOf(c)("ikuseiB") && canEnterOf(c)("ikuseiA"), `${c.name}は育成B・育成Aでも出られる`);
    ok(!canEnterOf(c)("gakudo"), `${c.name}にスクール生は出られない`);
  }
  ok(
    nihon.requiresStandard === "nihonSenshuken" && !nihon.requiresPrev,
    "日本選手権は標準記録で出場（勝ち上がりではない）",
  );
  ok(nihon.qualifier, "日本選手権の優勝が次につながる");
  ok(sekai.month === 12, "世界選手権は12月", `${sekai.month}月`);
  ok(sekai.requiresPrev === "gen_asia", "世界選手権はアジア選手権の優勝者だけ");

  // 無くなった大会が残っていないこと
  for (const gone of ["jo_main", "gen_jo"]) {
    ok(!CALENDAR.some((c) => c.id === gone), `${gone} は無くなっている`);
  }
}

head("日本選手権の標準記録はプロに合わせた高さ");
{
  const ev: RaceEvent = { stroke: "free", distance: 100 };
  const jo = getStandardTime("japanOpen", ev, "m")!;
  const nihon = getStandardTime("nihonSenshuken", ev, "m")!;
  ok(nihon < jo, "日本選手権標準は全国標準より速い", `${nihon} < ${jo}`);
  ok(Math.abs(nihon / jo - 0.97) < 0.001, "その差は3%ほど", `${(nihon / jo).toFixed(4)}`);

  // どのくらいの能力で届くか（P=90 で全国標準ちょうど）
  let need = 999;
  for (let p = 80; p <= 100; p += 0.1) {
    if (timeFromPower(ev, p, "m") <= nihon) {
      need = p;
      break;
    }
  }
  ok(need > 92 && need < 94, "届くのは能力指数92以上（＝育て上げたプロ）", `P=${need.toFixed(1)}`);

  const missing = ALL_EVENTS.filter((e) => getStandardTime("nihonSenshuken", e, "m") == null);
  ok(missing.length <= 1, "男子はほぼ全種目に標準がある", `未設定 ${missing.map((e) => `${e.stroke}-${e.distance}`).join(",") || "なし"}`);
}

// ================================================================ 2. 相手（CP選手）の名前

head("強豪は使い回し、モブは毎回ちがう");
{
  const ctx = {
    compId: "mid_area",
    world: false,
    event: { stroke: "free", distance: 100 } as RaceEvent,
    gender: "m" as const,
  };
  const a = makeRivalSpecs(ctx, 50, 7, rand);
  const b = makeRivalSpecs(ctx, 50, 7, rand);
  const namedA = a.filter((r) => r.named).map((r) => r.name);
  const namedB = b.filter((r) => r.named).map((r) => r.name);
  ok(namedA.length === 3, "強豪は3人", namedA.join("・"));
  ok(namedA.join(",") === namedB.join(","), "強豪はいつも同じ顔ぶれ", namedA.join("・"));
  const mobA = a.filter((r) => !r.named).map((r) => r.name);
  const mobB = b.filter((r) => !r.named).map((r) => r.name);
  ok(mobA.join(",") !== mobB.join(","), "モブは毎回ちがう", `${mobA[0]} → ${mobB[0]}`);
  ok(new Set(a.map((r) => r.name)).size === a.length, "同じレースに同じ名前は並ばない");
  ok(
    a.every((r) => !/強豪|宿敵|ライバル|実力者|伏兵/.test(r.name)),
    "記号のような名前になっていない",
    a.map((r) => r.name).join("・"),
  );
  ok(
    a.every((r) => r.name.includes(" ") && !r.name.includes("（")),
    "国内の大会は日本の名前（姓と名）",
    a[3].name,
  );

  const other = makeRivalSpecs({ ...ctx, compId: "hi_area" }, 50, 7, rand)
    .filter((r) => r.named)
    .map((r) => r.name);
  ok(other.join(",") !== namedA.join(","), "大会が違えば強豪も別人", other.join("・"));
  const otherEv = makeRivalSpecs({ ...ctx, event: { stroke: "back", distance: 200 } }, 50, 7, rand)
    .filter((r) => r.named)
    .map((r) => r.name);
  ok(otherEv.join(",") !== namedA.join(","), "種目が違えば強豪も別人", otherEv.join("・"));
  const otherGender = makeRivalSpecs({ ...ctx, gender: "f" }, 50, 7, rand)
    .filter((r) => r.named)
    .map((r) => r.name);
  ok(otherGender.join(",") !== namedA.join(","), "男女で別の顔ぶれ", otherGender.join("・"));
}

head("世界大会の相手は外国の選手（国ごとに得手不得手）");
{
  const sprint = {
    compId: "gen_sekai",
    world: true,
    event: { stroke: "free", distance: 100 } as RaceEvent,
    gender: "m" as const,
  };
  const list = makeRivalSpecs(sprint, 70, 7, rand);
  ok(list.every((r) => !!r.nation), "全員に国が付く", list.map((r) => r.nation?.short).join(""));
  ok(list.every((r) => r.name.includes("（")), "名前に国が入る", list[0].name);

  for (const band of ["sprint", "middle", "distance"] as const) {
    const sum = NATIONS.reduce((n, x) => n + nationBonus(x, band), 0);
    ok(Math.abs(sum) < 1e-6, `${band} の上乗せは平均0（相手全体の強さを変えない）`, `${sum.toFixed(8)}`);
  }
  const usa = NATIONS.find((n) => n.code === "USA")!;
  const chn = NATIONS.find((n) => n.code === "CHN")!;
  ok(
    nationBonus(usa, "sprint") > nationBonus(chn, "sprint"),
    "短距離はアメリカが速い",
    `米${nationBonus(usa, "sprint").toFixed(1)} > 中${nationBonus(chn, "sprint").toFixed(1)}`,
  );
  ok(
    nationBonus(chn, "distance") > nationBonus(usa, "distance"),
    "長距離は中国が強い",
    `中${nationBonus(chn, "distance").toFixed(1)} > 米${nationBonus(usa, "distance").toFixed(1)}`,
  );
  ok(
    nationBonus(usa, "sprint") > nationBonus(usa, "distance"),
    "アメリカは短距離のほうが得意",
    `短${nationBonus(usa, "sprint").toFixed(1)} > 長${nationBonus(usa, "distance").toFixed(1)}`,
  );

  // 強豪を入れても「いちばん速い相手」は従来どおり（勝率が変わらない）
  let sum = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) sum += Math.max(...makeRivalSpecs(sprint, 70, 7, rand).map((r) => r.power));
  const avgMax = sum / N;
  ok(avgMax > 70 + 9 && avgMax < 70 + 16, "いちばん速い相手の強さは従来どおり", `平均 ${avgMax.toFixed(1)}`);
}

// ================================================================ 3. メドレーリレー

head("リレー：日本選手権の100m優勝者が日本代表になる");
{
  const g = new GameState(rand, { clubName: "リレーSC" });
  g.month = 12;
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  ok(g.relayEntry() === null, "代表が1人もいなければリレーは無い");

  const back = mk(g, 9301, "m", "大2", { stroke: "back", distance: 100 });
  back.season.clearedStages.push(stageEventKey("gen_nihon", { stroke: "back", distance: 100 }));
  const one = g.relayEntry();
  ok(!!one, "1人でもリレーに出られる", one ? one.members.map((s) => s.name).join("・") : "");
  ok(one != null && one.slots.filter((s) => s == null).length === 3, "空いた枠は3つ");
  ok(RELAY_ORDER.join(",") === "back,breast,fly,free", "枠の順は背→平→バタ→自由");
  ok(one?.slots[0]?.id === back.id, "背泳ぎの枠に入っている");

  // 200mの優勝では代表にならない（100mだけ）
  const two = mk(g, 9302, "m", "大2", { stroke: "fly", distance: 200 });
  two.season.clearedStages.push(stageEventKey("gen_nihon", { stroke: "fly", distance: 200 }));
  ok(g.relayEntry()?.members.length === 1, "200mの優勝では代表にならない", `${g.relayEntry()?.members.length}人`);

  for (const [id, stroke] of [
    [9303, "breast"],
    [9304, "fly"],
    [9305, "free"],
  ] as const) {
    const s = mk(g, id, "m", "大2", { stroke, distance: 100 });
    s.season.clearedStages.push(stageEventKey("gen_nihon", { stroke, distance: 100 }));
  }
  const full = g.relayEntry()!;
  ok(full.members.length === 4, "4人そろう", full.members.map((s) => s.name).join("・"));
  ok(full.members.every((s) => s.gender === full.gender), "男女は混ぜない");

  const r = g.runRelay()!;
  ok(!!r, "結果が返る");
  ok(r.outcome.teams.length === 8, "8チームで泳ぐ", `${r.outcome.teams.length}チーム`);
  ok(r.outcome.teams.some((tm) => tm.isPlayer && tm.name === "日本"), "日本のチームがある");
  ok(r.outcome.teams.every((tm) => tm.legs.length === 4), "1チーム4人");
  ok(
    r.outcome.teams.every((tm) => Math.abs(tm.total - tm.legs.reduce((a, l) => a + l.time, 0)) < 1e-6),
    "合計タイムは4人ぶんの和",
  );
  ok(
    r.outcome.teams.every((tm, i) => i === 0 || r.outcome.teams[i - 1].total <= tm.total),
    "速い順に並んでいる",
  );
  ok(r.outcome.rank >= 1 && r.outcome.rank <= 8, "日本の順位が出る", `${r.outcome.rank}位`);
  ok(r.entries.length === 4, "自クラブの4人が泳いだ", r.entries.map((e) => `${e.student.name}(${e.stroke})`).join("・"));
  ok(
    r.entries.every((e) => RELAY_ORDER.includes(e.stroke)),
    "担当の泳法を泳いでいる（得意ではなく）",
    r.entries.map((e) => e.stroke).join(","),
  );
  ok(
    r.outcome.teams
      .filter((tm) => !tm.isPlayer)
      .every((tm) => tm.legs.every((l) => l.name.includes(`（${tm.nation!.short}）`))),
    "外国のチームは同じ国の4人",
    r.outcome.teams.find((tm) => !tm.isPlayer)!.legs.map((l) => l.name).join("・"),
  );
  ok(r.totalGems > 0, "報酬が入る", `◆${r.totalGems}`);
  ok(r.entries.every((e) => e.time > 0), "1人ずつのタイムが残る");

  // 1年に1回だけ
  ok(g.relayEntry() === null, "同じ年に2回は泳げない");
  for (const s of g.students.pro) {
    ensureSeason(s, g.year + 1);
    s.season.clearedStages.push(stageEventKey("gen_nihon", { stroke: "back", distance: 100 }));
  }
  g.year += 1;
  ok(g.relayEntry() !== null, "年が変われば泳げる");
}

head("リレー：空いた枠はよそのクラブの代表が埋める");
{
  const g = new GameState(rand, { clubName: "1人SC" });
  g.month = 12;
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  const solo = mk(g, 9401, "f", "大2", { stroke: "free", distance: 100 });
  solo.season.clearedStages.push(stageEventKey("gen_nihon", { stroke: "free", distance: 100 }));
  const r = g.runRelay()!;
  const jp = r.outcome.japan;
  ok(jp.legs.length === 4, "日本の4枠は埋まる");
  ok(jp.legs.filter((l) => l.student != null).length === 1, "自クラブは1人だけ");
  ok(
    jp.legs.filter((l) => l.student == null).length === 3,
    "残り3人はよそのクラブの代表",
    jp.legs.filter((l) => !l.student).map((l) => l.name).join("・"),
  );
  ok(
    jp.legs.filter((l) => !l.student).every((l) => !l.name.includes("（")),
    "よその代表も日本の名前",
    jp.legs.find((l) => !l.student)!.name,
  );
  ok(jp.legs[3].student?.id === solo.id, "自クラブの選手は自由形（優勝した泳法）の枠");
  ok(r.entries.length === 1, "報酬は1人ぶん");
  ok(r.outcome.gender === "f", "女子のリレーになる", r.outcome.gender);
}

// ================================================================ 4. 地区大会（入口）の決めごと

head("地区大会は育成から出られる");
{
  const g = new GameState(rand, { clubName: "地域SC" });
  g.month = 4;
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  // 小6の育成Bを1人
  const kid = createStudent(rand, 9501, "ikuseiB");
  kid.gender = "m";
  kid.grade = "小6";
  kid.fav = { stroke: "free", distance: 50 };
  kid.season = { year: g.year, clearedStages: [], standards: [], standardEvents: [] };
  g.students.ikuseiB.push(kid);

  const area = CALENDAR.find((c) => c.id === "el_area")!;
  const ken = CALENDAR.find((c) => c.id === "el_ken")!;
  ok(canEnterOf(area)(kid.classId), "育成Bは地区大会に出られる");
  ok(!canEnterOf(ken)(kid.classId), "都道府県予選からは出られない（選手・プロだけ）");
  ok(canEnterOf(area)("senshu") && canEnterOf(area)("pro"), "選手・プロも出られる");
  ok(!canEnterOf(area)("gakudo") && !canEnterOf(area)("youji"), "スクール生は出られない");

  const cands = g.majorConfirmCandidates(area);
  ok(cands.some((c) => c.student.id === kid.id), "出場確認に育成Bの子が並ぶ", `${cands.length}件`);
  // 新規ゲームには育成B・育成Aの子が最初からいる（→ START.roster）ので、その子たちも並ぶ
  ok(
    cands.every((c) => canEnterOf(area)(c.student.classId)),
    "並ぶのは育成B以上だけ",
    [...new Set(cands.map((c) => c.student.classId))].join(","),
  );
  ok(
    cands.every((c) => lifeStageOf(c.student.grade) === "elementary"),
    "小学ルートなので小学生だけ",
    [...new Set(cands.map((c) => c.student.grade))].join(","),
  );
  ok(g.raceEntryStatus(kid, area, []).ok, "エントリーできる", g.raceEntryStatus(kid, area, []).reason ?? "");
  ok(!g.raceEntryStatus(kid, ken, []).ok, "都道府県予選にはエントリーできない");
  ok(g.competitionsForClub().some((c) => c.id === area.id), "今月出られる大会に地区大会が出る");
}

head("地区大会は種目を選べる");
{
  const g = new GameState(rand, { clubName: "種目SC" });
  g.month = 4;
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  const sprinter = createStudent(rand, 9601, "senshu");
  sprinter.gender = "m";
  sprinter.grade = "高2";
  sprinter.fav = { stroke: "free", distance: 50 };
  sprinter.season = { year: g.year, clearedStages: [], standards: [], standardEvents: [] };
  g.students.senshu.push(sprinter);

  const area = CALENDAR.find((c) => c.id === "hi_area")!;
  const evs = confirmEventsFor(sprinter, area);
  const keys = evs.map((e) => `${e.stroke}-${e.distance}`);
  ok(evs.length > 1, "1つではなく何種目も選べる", `${evs.length}種目`);
  ok(keys.includes("free-50"), "得意種目は入っている");
  ok(keys.includes("free-400") && keys.includes("free-1500"), "同じ泳法の長い距離も選べる", keys.join(","));
  ok(keys.includes("back-50") && keys.includes("breast-50") && keys.includes("fly-50"), "ほかの泳法（得意距離）も選べる");
  ok(!keys.includes("back-1500"), "鍛えていない泳法の全距離までは出さない");
  ok(new Set(keys).size === keys.length, "同じ種目が二重に並ばない");
  ok(evs.length <= 10, "1人ぶんが多すぎない（一覧が読める）", `${evs.length}種目`);

  // 勝ち上がりの大会は、勝った種目だけ（種目えらびは入口の大会だけ）
  const ken = CALENDAR.find((c) => c.id === "hi_ken")!;
  sprinter.season.clearedStages.push(stageEventKey("hi_area", { stroke: "free", distance: 400 }));
  const kenEvs = confirmEventsFor(sprinter, ken);
  ok(kenEvs.length === 1 && kenEvs[0].distance === 400, "都道府県予選は勝った種目だけ", `${kenEvs.length}種目`);
}

head("申し込みは のべ8人まで");
{
  const g = new GameState(rand, { clubName: "上限SC" });
  g.month = 4;
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  const area = CALENDAR.find((c) => c.id === "hi_area")!;
  ok(g.maxMeetEntries() === 8, "1大会の上限は8人", `${g.maxMeetEntries()}人`);
  ok(g.maxRaceEntries() === 6, "1レースの上限は6人", `${g.maxRaceEntries()}人`);

  for (let i = 0; i < 10; i++) {
    const s = createStudent(rand, 9700 + i, "senshu");
    s.gender = "m";
    s.grade = "高2";
    s.fav = { stroke: "free", distance: 100 };
    s.season = { year: g.year, clearedStages: [], standards: [], standardEvents: [] };
    g.students.senshu.push(s);
  }
  const all = g.students.senshu.map((s) => ({ student: s, event: { stroke: "free" as const, distance: 100 } }));
  const over = g.setMajorEntries(area, all);
  ok(!over.ok, "1レースの上限を超えると断る", over.reason ?? "");

  // 種目を散らせば8人まで入る
  const spread = g.students.senshu.slice(0, 8).map((s, i) => ({
    student: s,
    event: { stroke: "free" as const, distance: i < 4 ? 100 : 200 },
  }));
  const okRes = g.setMajorEntries(area, spread);
  ok(okRes.ok && okRes.count === 8, "種目を散らせば8人まで入る", `${okRes.count}人`);

  const nine = g.students.senshu.slice(0, 9).map((s, i) => ({
    student: s,
    event: { stroke: "free" as const, distance: i < 3 ? 100 : i < 6 ? 200 : 400 },
  }));
  const tooMany = g.setMajorEntries(area, nine);
  ok(!tooMany.ok, "9人めは断る", tooMany.reason ?? "");
  ok((tooMany.reason ?? "").includes("8"), "理由に上限の数が出る", tooMany.reason ?? "");
}

head("勝ち上がると次の大会に自動でエントリーされる");
{
  const g = new GameState(rand, { clubName: "自動SC" });
  g.month = 5; // 都道府県予選の月
  g.dayCount = 4; // 第1週（出場確認の窓）
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  const won = createStudent(rand, 9801, "senshu");
  won.gender = "m";
  won.grade = "高2";
  won.fav = { stroke: "free", distance: 100 };
  // 4月の地区予選を 400m で勝った
  won.season = {
    year: g.year,
    clearedStages: [stageEventKey("hi_area", { stroke: "free", distance: 400 })],
    standards: [],
    standardEvents: [],
  };
  g.students.senshu.push(won);

  const ken = CALENDAR.find((c) => c.id === "hi_ken")!;
  ok(g.majorsNeedingConfirm().some((c) => c.id === ken.id), "都道府県予選の出場確認が出る");
  ok(g.majorEntriesOf(ken).length === 0, "まだ何もエントリーしていない");

  const gems0 = g.gems;
  const auto = g.autoEnterQualified(ken);
  ok(auto.length === 1, "勝ち上がった1人が自動で入る", auto.map((c) => c.student.name).join("・"));
  ok(auto[0].event.distance === 400, "入るのは勝った種目（400m）", `${auto[0].event.distance}m`);
  ok(g.majorEntriesOf(ken).length === 1, "エントリーに乗っている");
  ok(g.gems < gems0, "出場費は引かれている", `◆${gems0 - g.gems}`);

  // もう一度呼んでも二重にならない
  const again = g.autoEnterQualified(ken);
  ok(again.length === 0, "二重にはエントリーしない");
  ok(g.majorEntriesOf(ken).length === 1, "人数も増えない");

  // 見送れば返金される
  const before = g.gems;
  const cancel = g.setMajorEntries(ken, []);
  ok(cancel.ok && g.gems > before, "見送ると出場費が返る", `◆${g.gems - before}`);

  // 入口の大会（地区予選）は自動エントリーの対象外（勝ち上がりではないので）
  const area = CALENDAR.find((c) => c.id === "hi_area")!;
  ok(g.autoEnterQualified(area).length === 0, "地区大会は自分で選ぶ（自動では入らない）");
}

head("優勝すると市長から祝い金が出る");
{
  const g = new GameState(rand, { clubName: "祝い金SC" });
  g.month = 4;
  g.gems = 999999;
  g.students.senshu = [];
  g.students.pro = [];
  const area = CALENDAR.find((c) => c.id === "hi_area")!;
  ok(SCALE_MAYOR_PRIZE[area.scale] === 10_000, "地区大会は◆1万", `${SCALE_MAYOR_PRIZE[area.scale]}`);
  ok(SCALE_MAYOR_PRIZE.ken === 20_000, "都道府県は◆2万");
  ok(SCALE_MAYOR_PRIZE.sekai === 500_000, "世界大会は◆50万");
  ok(SCALE_MAYOR_PRIZE.kirokukai === 0, "記録会には出ない");
  ok(
    SCALE_MAYOR_PRIZE.area < SCALE_MAYOR_PRIZE.ken &&
      SCALE_MAYOR_PRIZE.ken < SCALE_MAYOR_PRIZE.block &&
      SCALE_MAYOR_PRIZE.block < SCALE_MAYOR_PRIZE.national &&
      SCALE_MAYOR_PRIZE.national < SCALE_MAYOR_PRIZE.asia &&
      SCALE_MAYOR_PRIZE.asia < SCALE_MAYOR_PRIZE.sekai,
    "段が上がるほど大きい",
  );

  // 勝てる相手（地区大会・相手32）に強い選手を出す
  const win = mk(g, 9901, "m", "高2", { stroke: "free", distance: 100 });
  win.classId = "senshu";
  g.students.pro = [];
  g.students.senshu.push(win);
  const gems0 = g.gems;
  const r = g.enterCompetition([win], area, { stroke: "free", distance: 100 });
  const won = r.entries.some((e) => e.entrant.win);
  ok(won ? r.mayorPrize === 10_000 : r.mayorPrize === 0, "優勝したときだけ出る", `優勝=${won} 祝い金=${r.mayorPrize}`);
  if (won) {
    ok(g.gems - gems0 > 9_000, "所持ジェムに入っている", `+${g.gems - gems0}`);
  }

  // 同じ大会で2種目優勝しても祝い金は1回ぶん
  const a = mk(g, 9902, "m", "高2", { stroke: "free", distance: 100 });
  const b = mk(g, 9903, "m", "高2", { stroke: "back", distance: 100 });
  a.classId = "senshu";
  b.classId = "senshu";
  g.students.pro = [];
  g.students.senshu.push(a, b);
  const r2 = g.enterCompetition([a, b], area, { stroke: "free", distance: 100 });
  ok(r2.mayorPrize <= 10_000, "1レースに2人出しても祝い金は1回ぶん", `${r2.mayorPrize}`);
}

// ================================================================

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
