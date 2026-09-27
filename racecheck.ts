/// <reference types="node" />
/**
 * 複数選手の同一レース出場の動作確認（ヘッドレス）。
 * Phaser を読まない sim / save 層だけを叩く。
 */
import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { createStudent, type StatKey, type Student } from "./src/sim/student";
import {
  bestEntrant,
  maxRaceEntries,
  outcomeOf,
  placementLabelOf,
  simulateRace,
  type RaceEntry,
} from "./src/sim/race";
import {
  clearedEventsOf,
  ensureSeason,
  stageEventKey,
  withEventKeys,
  eligibleCompetitions,
  KIROKUKAI_LADDER,
  kirokukaiFor,
  kirokukaiOf,
  resolveCompetition,
  type Competition,
} from "./src/sim/competitions";
import { competitionPoints } from "./src/sim/rank";
import { RACE } from "./src/config/balance";
import { buildSave, applySave } from "./src/save/serialize";
import { SAVE_VERSION } from "./src/save/types";

let seed = 987654321;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const line = (s: string): void => console.log(s);
let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) failures++;
  line(`${ok ? "  ok " : "  NG "} ${name}${extra ? "  — " + extra : ""}`);
};

const setStats = (s: Student, v: number): Student => {
  for (const k of ["speed", "stamina", "form", "start", "turn"] as StatKey[]) s.stats[k] = v;
  return s;
};

const st = new GameState(rand, { clubName: "レース確認SC" });
st.students.senshu = [];
st.students.pro = [];

// 実力に差をつけた6人（すべて男子・自由形200m 得意）
const powers = [92, 84, 76, 68, 60, 52];
const squad: Student[] = powers.map((p, i) => {
  const s = createStudent(rand, 700 + i, "senshu");
  s.gender = "m";
  s.name = `選手${i + 1}(${p})`;
  s.fav = { stroke: "free", distance: 200 };
  s.condition = 60;
  s.injuryDays = 0;
  s.altitude = null;
  return setStats(s, p);
});
st.students.senshu.push(...squad);

// 女子を1人（男女別レースの確認用）
const girl = setStats(createStudent(rand, 800, "senshu"), 80);
girl.gender = "f";
girl.name = "女子選手";
girl.fav = { stroke: "free", distance: 200 };
girl.injuryDays = 0;
girl.altitude = null;
st.students.senshu.push(girl);

const EV = { stroke: "free", distance: 200 } as const;
const comp: Competition = kirokukaiOf(st.month);
const entriesOf = (list: Student[]): RaceEntry[] => list.map((s) => ({ student: s, extraFactor: 1 }));

line("\n=== 1. レーン数と出場人数の上限 ===");
line(`  1組 ${RACE.lanes}レーン／必ず残す相手 ${RACE.minRivals}人／決勝進出 ${RACE.advanceCount}人`);
check("自クラブの上限は lanes - minRivals", maxRaceEntries() === RACE.lanes - RACE.minRivals, `${maxRaceEntries()}人`);
check("state からも同じ値が引ける", st.maxRaceEntries() === maxRaceEntries());

line("\n=== 2. 1人で出したとき（従来と同じ形） ===");
const solo = simulateRace(entriesOf([squad[0]]), EV, 45, rand);
check("予選は8人", solo.heat.length === RACE.lanes, `${solo.heat.length}人`);
check("自クラブは1人だけ", solo.heat.filter((r) => r.isPlayer).length === 1);
check("entrants は1人", solo.entrants.length === 1);
check("studentId が入っている", solo.heat.find((r) => r.isPlayer)?.studentId === squad[0].id);

line("\n=== 3. 4人を同じレースに出す ===");
const four = squad.slice(0, 4);
const o4 = simulateRace(entriesOf(four), EV, 45, rand);
check("予選は8人のまま", o4.heat.length === RACE.lanes, `${o4.heat.length}人`);
check("うち自クラブが4人", o4.heat.filter((r) => r.isPlayer).length === 4);
check("相手は4人", o4.heat.filter((r) => !r.isPlayer).length === RACE.lanes - 4);
check("entrants は4人", o4.entrants.length === 4);
const ranks = o4.entrants.map((e) => e.heatRank);
check("予選順位が全員ちがう", new Set(ranks).size === 4, ranks.join(","));
check("予選順位は1〜8の範囲", ranks.every((r) => r >= 1 && r <= RACE.lanes));
for (const e of o4.entrants) {
  line(
    `  ${e.name.padEnd(14, " ")} 予選${e.heatRank}位 ${e.advanced ? "→ 決勝" + e.finalRank + "位" : "（敗退）"}` +
      `  ${e.bestTime.toFixed(2)}秒  ${placementLabelOf(e)}`,
  );
}
const advanced = o4.entrants.filter((e) => e.advanced);
check("決勝に上がったのは4人以内", advanced.length <= RACE.advanceCount, `${advanced.length}人`);
check("決勝が組まれた", o4.final !== null && o4.final.length === RACE.lanes, `${o4.final?.length ?? 0}人`);
check("決勝の自クラブ人数＝進出者数", (o4.final ?? []).filter((r) => r.isPlayer).length === advanced.length);
check("敗退者の決勝順位は null", o4.entrants.filter((e) => !e.advanced).every((e) => e.finalRank === null));
check("進出者の決勝順位は 1〜8", advanced.every((e) => (e.finalRank ?? 0) >= 1 && (e.finalRank ?? 0) <= RACE.lanes));
check(
  "自己ベストは予選・決勝の速い方",
  o4.entrants.every((e) => {
    const h = o4.heat.find((r) => r.studentId === e.studentId)!.time;
    const f = o4.final?.find((r) => r.studentId === e.studentId)?.time ?? Infinity;
    return Math.abs(e.bestTime - Math.min(h, f)) < 1e-9;
  }),
);
check("優勝は決勝1位のみ", o4.entrants.filter((e) => e.win).length === (advanced.some((e) => e.finalRank === 1) ? 1 : 0));

line("\n=== 4. 最上位の取り出し ===");
const top = bestEntrant(o4)!;
check("bestEntrant が進出者から選ばれる", advanced.length === 0 || top.advanced, `${top.name}`);
check("outcomeOf で個別に引ける", outcomeOf(o4, four[0].id)?.studentId === four[0].id);
check("出していない選手は null", outcomeOf(o4, girl.id) === null);

line("\n=== 5. 上限を超えて渡しても8レーンに収まる ===");
const o10 = simulateRace(entriesOf([...squad, ...squad]), EV, 45, rand);
check("自クラブは上限人数まで", o10.heat.filter((r) => r.isPlayer).length === maxRaceEntries(), `${o10.heat.filter((r) => r.isPlayer).length}人`);
check("予選は8人", o10.heat.length === RACE.lanes);
check("相手は minRivals 人残る", o10.heat.filter((r) => !r.isPlayer).length === RACE.minRivals);

line("\n=== 6. 実力どおりに並ぶか（100回の平均順位） ===");
const sum = new Map<number, number>();
for (let i = 0; i < 100; i++) {
  const o = simulateRace(entriesOf(squad.slice(0, 4)), EV, 45, rand);
  for (const e of o.entrants) sum.set(e.studentId, (sum.get(e.studentId) ?? 0) + e.heatRank);
}
const avg = squad.slice(0, 4).map((s) => ({ name: s.name, v: (sum.get(s.id) ?? 0) / 100 }));
for (const a of avg) line(`  ${a.name.padEnd(14, " ")} 平均予選順位 ${a.v.toFixed(2)}`);
check("強い順に平均順位が良い", avg.every((a, i) => i === 0 || avg[i - 1].v < a.v), avg.map((a) => a.v.toFixed(2)).join(" < "));

// 実力が近いと順位が入れ替わる（＝毎回同じ結果にならない）
const close = [80, 79.4, 78.8, 78.2].map((p, i) => {
  const s = setStats(createStudent(rand, 750 + i, "senshu"), p);
  s.gender = "m";
  s.name = `互角${i + 1}`;
  s.fav = { stroke: "free", distance: 200 };
  s.condition = 60;
  s.injuryDays = 0;
  s.altitude = null;
  return s;
});
let upsets = 0;
for (let i = 0; i < 100; i++) {
  const o = simulateRace(entriesOf(close), EV, 45, rand);
  const mine = o.entrants.slice().sort((a, b) => a.heatRank - b.heatRank);
  if (mine[0].studentId !== close[0].id) upsets++;
}
line(`  実力が近い4人 → 100回のうち ${upsets}回 は1番手が入れ替わった`);
check("互角なら結果が揺れる", upsets > 0 && upsets < 100, `${upsets}回`);

line("\n=== 7. 出場の可否（男女別・レーン数・ケガ） ===");
check("最初の1人は選べる", st.raceEntryStatus(squad[0], comp, []).ok);
const mixed = st.raceEntryStatus(girl, comp, [squad[0]]);
check("男子を選んだ後に女子は選べない", !mixed.ok, mixed.reason ?? "");
check("女子だけなら選べる", st.raceEntryStatus(girl, comp, []).ok);
// 上限人数ぶん選んだ状態で、まだ選んでいない選手を足そうとする
const extra = setStats(createStudent(rand, 850, "senshu"), 70);
extra.gender = "m";
extra.name = "補欠選手";
extra.injuryDays = 0;
extra.altitude = null;
st.students.senshu.push(extra);
const fullRoster = squad.slice(0, maxRaceEntries());
check("上限ぴったりまでは選べている", fullRoster.length === maxRaceEntries(), `${fullRoster.length}人`);
const full = st.raceEntryStatus(extra, comp, fullRoster);
check("レーンが埋まると選べない", !full.ok, full.reason ?? "");
check("すでに選んでいる人は外せる（ok扱い）", st.raceEntryStatus(squad[0], comp, [squad[0], squad[1]]).ok);
squad[5].injuryDays = 9;
const hurt = st.raceEntryStatus(squad[5], comp, []);
check("ケガ中は選べない", !hurt.ok, hurt.reason ?? "");
squad[5].injuryDays = 0;
const school = createStudent(rand, 999, "youji");
check("スクール生は選べない", !st.raceEntryStatus(school, comp, []).ok, st.raceEntryStatus(school, comp, []).reason ?? "");

line("\n=== 8. enterCompetition（報酬・実績・格） ===");
const gemsBefore = st.gems;
const popBefore = st.popularity;
const champBefore = st.championships;
const achieveBefore = four.map((s) => s.achievePoints ?? 0);
const res = st.enterCompetition(four, comp, EV);
check("出場人数ぶんの明細が返る", res.entries.length === 4, `${res.entries.length}件`);
check("best が入っている", res.best !== null, res.best?.student.name ?? "");
const sumGems = res.entries.reduce((n, e) => n + e.reward.gems, 0);
const sumPop = res.entries.reduce((n, e) => n + e.reward.popularity, 0);
check("合計◆が明細の合計と一致", res.totalGems === sumGems, `${res.totalGems} vs ${sumGems}`);
check("合計人気度が一致", res.totalPopularity === sumPop, `${res.totalPopularity} vs ${sumPop}`);
// 出場費（参加料＋遠征費）は先に引かれる
check(
  "所持◆が「賞金 − 出場費」ぶん動く",
  Math.abs(st.gems - (gemsBefore + res.totalGems - res.entryCost)) < 1e-9,
  `${gemsBefore}→${st.gems}（賞金${res.totalGems} 出場費${res.entryCost}）`,
);
check("人気度が増えた", st.popularity >= popBefore);
for (const e of res.entries) {
  line(`  ${e.student.name.padEnd(14, " ")} ${e.reward.placementLabel.padEnd(14, "　")} ◆+${e.reward.gems}　人気+${e.reward.popularity}`);
}
const winners = res.entries.filter((e) => e.entrant.win);
check("優勝は最大1人", winners.length <= 1, `${winners.length}人`);
check("優勝ぶんだけ championships が増える", st.championships === champBefore + winners.length, `${champBefore}→${st.championships}`);
check("優勝者の wins が増えている", winners.every((e) => e.student.wins >= 1));
check("全員に実績ポイントが入る", four.every((s, i) => (s.achievePoints ?? 0) > achieveBefore[i]));
check("全員に自己ベストが記録される", four.every((s) => (s.bestTimeSec ?? 0) > 0));
check(
  "順位が上の方が実績ポイントが多い",
  (() => {
    const sorted = [...res.entries].sort((a, b) => a.entrant.heatRank - b.entrant.heatRank);
    const pts = sorted.map((e) => competitionPoints(comp.scale, e.entrant));
    return pts.every((p, i) => i === 0 || pts[i - 1] >= p);
  })(),
);

line("\n=== 9. 出場0人・資格なしのときも壊れない ===");
const empty = st.enterCompetition([], comp, EV);
check("空エントリーは空の結果", empty.entries.length === 0 && empty.best === null && empty.totalGems === 0);
const onlySchool = st.enterCompetition([school], comp, EV);
check("スクール生だけなら実行されない", onlySchool.entries.length === 0 && onlySchool.totalGems === 0);

line("\n=== 10. resolveCompetition は1人ずつ独立して効く ===");
const o2 = simulateRace(entriesOf(squad.slice(0, 2)), EV, 88, rand);
const r0 = resolveCompetition(squad[0], comp, o2.entrants[0], EV);
const r1 = resolveCompetition(squad[1], comp, o2.entrants[1], EV);
check("報酬ラベルが順位を反映する", r0.placementLabel === placementLabelOf(o2.entrants[0]), r0.placementLabel);
check("2人ぶん別々のラベルが出る", r1.placementLabel === placementLabelOf(o2.entrants[1]), r1.placementLabel);

line("\n=== 10b. 記録会のラダー（地域→都道府県→…→世界） ===");
{
  const runner = st.students.senshu[0];
  runner.grade = "高2";
  runner.season = { year: st.year, clearedStages: [], standards: [], standardEvents: [] };
  ensureSeason(runner, st.year);

  const first = kirokukaiFor(runner, st.month, st.year);
  check("最初は地区記録会だけ", first.length === 1 && first[0].name === "地区記録会", first.map((c) => c.name).join("/"));

  // 各段で「優勝した」ことにして上へ進む
  const names: string[] = [];
  for (let i = 0; i < KIROKUKAI_LADDER.length; i++) {
    const list = kirokukaiFor(runner, st.month, st.year);
    const top = list[list.length - 1];
    names.push(top.name);
    resolveCompetition(
      runner,
      top,
      { studentId: runner.id, bestTime: 999, win: true, finalRank: 1, heatRank: 1, advanced: true },
      { stroke: "free", distance: 200 },
    );
  }
  check(
    "優勝を重ねると上の記録会へ進む",
    names.join("→") === "地区記録会→都道府県記録会→地域ブロック記録会→全国記録会→アジア記録会→世界記録会",
    names.join("→"),
  );
  check("最上段（世界）で頭打ちになる", kirokukaiFor(runner, st.month, st.year).length === KIROKUKAI_LADDER.length);

  // 負けた選手は上へ行けない
  const loser = st.students.senshu[1];
  loser.grade = "高2";
  loser.season = { year: st.year, clearedStages: [], standards: [], standardEvents: [] };
  resolveCompetition(
    loser,
    kirokukaiOf(st.month, 0),
    { studentId: loser.id, bestTime: 999, win: false, finalRank: 4, heatRank: 4, advanced: true },
    { stroke: "free", distance: 200 },
  );
  check("優勝しなければ次の段に出られない", kirokukaiFor(loser, st.month, st.year).length === 1);

  // --- 勝ち上がるのは「その子」ではなく「その子のその種目」
  {
    const per = st.students.senshu[3] ?? st.students.senshu[0];
    per.grade = "高2";
    per.season = { year: st.year, clearedStages: [], standards: [], standardEvents: [] };
    const freeEv = { stroke: "free", distance: 100 } as const;
    const breastEv = { stroke: "breast", distance: 100 } as const;
    // 100m自由形で地域を優勝
    resolveCompetition(
      per,
      kirokukaiOf(st.month, 0),
      { studentId: per.id, bestTime: 60, win: true, finalRank: 1, heatRank: 1, advanced: true },
      freeEv,
    );
    check("勝った種目つきで記録される", per.season.clearedStages[0] === "kk_area@free-100", per.season.clearedStages.join(","));
    check("次の段（都道府県）が一覧に出る", kirokukaiFor(per, st.month, st.year).length === 2);

    const ken = kirokukaiOf(st.month, 1);
    check(
      "勝った種目なら次の段に出られる",
      st.raceEntryStatus(per, ken, [], freeEv).ok,
      st.raceEntryStatus(per, ken, [], freeEv).reason ?? "",
    );
    const other = st.raceEntryStatus(per, ken, [], breastEv);
    check("別の種目では出られない", !other.ok, other.reason ?? "");
    check("理由に勝ち上がった種目が出る", (other.reason ?? "").includes("自由形100m"), other.reason ?? "");
    check(
      "突破した種目を引ける",
      clearedEventsOf(per, "kk_area").map((e) => `${e.stroke}-${e.distance}`).join(",") === "free-100",
      clearedEventsOf(per, "kk_area").map((e) => `${e.stroke}-${e.distance}`).join(","),
    );

    // 別の種目でも勝てば、その種目でも上がれる
    resolveCompetition(
      per,
      kirokukaiOf(st.month, 0),
      { studentId: per.id, bestTime: 70, win: true, finalRank: 1, heatRank: 1, advanced: true },
      breastEv,
    );
    check("別の種目で勝てばその種目でも上がれる", st.raceEntryStatus(per, ken, [], breastEv).ok);
    check("段の一覧は増えない（同じ段のまま）", kirokukaiFor(per, st.month, st.year).length === 2);

    // 種目を指定しなければ、これまでどおり「段を突破しているか」だけを見る
    check("種目を渡さなければ段だけで判定する", st.raceEntryStatus(per, ken, []).ok);

    // 古いセーブ（種目の付いていない記録）は、読み込むときに得意種目の記録へ直す（→ withEventKeys）。
    // 直す前の記録のままでは、どの種目でも次の段には出られない（優勝した種目でだけ上がれる）
    const legacy = st.students.senshu[4] ?? st.students.senshu[1];
    legacy.grade = "高2";
    legacy.season = { year: st.year, clearedStages: ["kk_area"], standards: [], standardEvents: [] };
    check("種目の付いていない記録だけでは次の段に出られない", !st.raceEntryStatus(legacy, ken, [], breastEv).ok);
    legacy.fav = { ...breastEv };
    legacy.season.clearedStages = withEventKeys(legacy.season.clearedStages, legacy.fav);
    check("古い記録は得意種目つきに直る", legacy.season.clearedStages.join(",") === "kk_area@breast-100", legacy.season.clearedStages.join(","));
    check("直したあとは得意種目で次の段に出られる", st.raceEntryStatus(legacy, ken, [], breastEv).ok);
    check("得意種目以外の種目ではやはり出られない", !st.raceEntryStatus(legacy, ken, [], freeEv).ok);
  }

  // 年度が変わっても勝ち上がりは残る（毎年地域からやり直しにはしない）
  runner.season.standards.push("jo");
  ensureSeason(runner, st.year + 1);
  const nextYear = kirokukaiFor(runner, st.month, st.year + 1).length;
  check("年度が変わっても勝ち上がった段は残る", nextYear === KIROKUKAI_LADDER.length, `${nextYear}段`);
  check("年度が変わると参加標準記録は取り直し", !runner.season.standards.includes("jo"));
  ensureSeason(runner, st.year);
  const top = kirokukaiOf(st.month, KIROKUKAI_LADDER.length - 1);
  const topFree = st.raceEntryStatus(runner, top, [], { stroke: "free", distance: 200 });
  check("勝ち上がった種目なら、年をまたいでも最上段に出られる", topFree.ok, topFree.reason ?? "");
  check(
    "勝っていない種目では最上段に出られない",
    !st.raceEntryStatus(runner, top, [], { stroke: "back", distance: 100 }).ok,
  );

  // 参加料・遠征費・遠征日数
  const area = kirokukaiOf(st.month, 0);
  const world = kirokukaiOf(st.month, KIROKUKAI_LADDER.length - 1);
  check(
    "上の記録会ほど出場費が高い",
    st.raceEntryCost(world, 1) > st.raceEntryCost(area, 1) * 20,
    `地域◆${st.raceEntryCost(area, 1)} / 世界◆${st.raceEntryCost(world, 1)}`,
  );
  check("出場費は参加料＋遠征費", st.raceEntryCost(world, 2) === (st.raceEntryFee(world) + st.raceTravelFee(world)) * 2);
  check("地域ブロックまでは遠征なし", st.raceAwayDays(kirokukaiOf(st.month, 2)) === 0);
  check("全国から上は1週（1ステップ）練習に出られない", st.raceAwayDays(kirokukaiOf(st.month, 3)) === 1);

  // 実際に出場すると遠征日数が入り、練習にも大会にも出られなくなる
  const away = st.students.senshu[2];
  away.grade = "高2";
  away.awayDays = 0;
  away.season = {
    year: st.year,
    clearedStages: KIROKUKAI_LADDER.slice(0, 3).map((t) => stageEventKey(t.key, { stroke: "free", distance: 200 })),
    standards: [],
    standardEvents: [],
  };
  st.gems = 99999;
  st.enterCompetition([away], kirokukaiOf(st.month, 3), { stroke: "free", distance: 200 });
  check("全国記録会に出ると遠征が1週入る", away.awayDays === 1, `${away.awayDays}週`);
  check("遠征中は大会にも出せない", !st.raceEntryStatus(away, kirokukaiOf(st.month, 0), []).ok);

  // 記録会は大会一覧にも並ぶ
  const listed = eligibleCompetitions(runner, st.month, st.year + 1).map((c) => c.name);
  check("大会一覧に記録会が並ぶ", listed.includes("地区記録会"), listed.join("/"));
}

line("\n=== 11. セーブ往復に影響がないか ===");
const clock = new GameClock();
const saved = buildSave(st, clock, 1);
check("最新バージョンで書き出せる", saved.version === SAVE_VERSION, String(saved.version));
const st2 = new GameState(rand);
applySave(JSON.parse(JSON.stringify(saved)), st2, new GameClock());
const before = four[0];
const after = st2.students.senshu.find((s) => s.id === before.id);
check("優勝数が保たれる", after?.wins === before.wins, `${after?.wins} vs ${before.wins}`);
check("実績ポイントが保たれる", Math.abs((after?.achievePoints ?? -1) - (before.achievePoints ?? 0)) < 0.01);
check("自己ベストが保たれる", Math.abs((after?.bestTimeSec ?? -1) - (before.bestTimeSec ?? 0)) < 0.01);
{
  // 種目の付いていない古い記録は、読み込みで得意種目つきに直る（同じになる記録は1つにまとまる）
  const old = JSON.parse(JSON.stringify(saved));
  const d0 = old.game.students.find((x: { classId: string }) => x.classId === "senshu");
  d0.fav = { stroke: "free", distance: 100 };
  d0.season = { year: 1, clearedStages: ["kk_area", "kk_area@free-100", "kk_ken@back-50"], standards: [], standardEvents: [] };
  const st3 = new GameState(rand);
  applySave(old, st3, new GameClock());
  const got = st3.students.senshu.find((x) => x.id === d0.id)?.season.clearedStages.join(",");
  check("古いセーブの種目なし記録は、読み込みで得意種目つきに直る", got === "kk_area@free-100,kk_ken@back-50", got ?? "");
}
check("championships が保たれる", st2.championships === st.championships, `${st2.championships} vs ${st.championships}`);

line("\n=== 12. エントリーは開催日を待つ（記録会は2週間後・主要大会は出場確認） ===");
{
  const g = new GameState(rand, { clubName: "日程確認SC" });
  g.students.senshu = [];
  g.students.pro = [];
  const mk = (list: GameState, id: number, gender: "m" | "f", grade: string, fav: { stroke: "free" | "breast" | "back"; distance: number }): Student => {
    const s = setStats(createStudent(rand, id, "senshu"), 80);
    s.gender = gender;
    s.grade = grade;
    s.fav = { ...fav };
    s.injuryDays = 0;
    s.awayDays = 0;
    s.altitude = null;
    list.students.senshu.push(s);
    return s;
  };
  const free100 = { stroke: "free", distance: 100 } as const;
  const a = mk(g, 9001, "m", "高2", free100);
  const b = mk(g, 9002, "m", "高2", free100);
  g.gems = 99999;
  const trial = kirokukaiOf(g.month, 0);
  const gemsBefore = g.gems;
  const res = g.reserveTimeTrial([a, b], trial, free100);
  check("記録会にエントリーできる", !!res.race, res.reason ?? "");
  check("泳ぐのはエントリーの2週間後", res.race?.raceDay === g.dayCount + 2, `${res.race?.raceDay} / 今日${g.dayCount}`);
  check("出場費はエントリーしたときに払う", gemsBefore - g.gems === g.raceEntryCost(trial, 2), `◆${gemsBefore - g.gems}`);
  check("すぐには泳がない", g.racesDue().length === 0);
  const twice = g.raceEntryStatus(a, trial, [], free100);
  check("同じ週のレースに二重にはエントリーできない", !twice.ok, twice.reason ?? "");
  g.onDayRoll();
  check("1週間後はまだ泳がない", g.racesDue().length === 0);
  g.onDayRoll();
  check("2週間後に開催日になる", g.racesDue().length === 1);
  b.injuryDays = 3;
  const plan = g.takePendingRace(g.racesDue()[0]);
  check("当日ケガの選手は欠場になる", plan.roster.length === 1 && plan.withdrawn[0]?.id === b.id);
  check("欠場ぶんの出場費は返る", plan.refund === g.raceEntryFee(trial) + g.raceTravelFee(trial), `◆${plan.refund}`);
  check("取り出したレースは待ちの一覧から消える", g.pendingRaces.length === 0);
  const g0 = g.gems;
  const ran = g.enterCompetition(plan.roster, plan.comp!, plan.event, { prepaid: plan.prepaid });
  check("払い済みのレースは出場費を二重に引かない", ran.entryCost === plan.prepaid && g.gems === g0 + ran.totalGems);

  // 主要大会：開催の2週間前に、条件を満たした選手と種目の出場確認が出る
  const h = new GameState(rand, { clubName: "出場確認SC" });
  h.students.senshu = [];
  h.students.pro = [];
  // 地区予選は4月（2026-09-21 にカレンダーを組み直した。小中高とも4月が入口）
  h.month = 4;
  h.dayCount = 4; // 月の第1週
  h.gems = 99999;
  mk(h, 9101, "m", "高2", { stroke: "breast", distance: 200 });
  mk(h, 9102, "m", "高2", { stroke: "breast", distance: 200 });
  const area = h.majorsNeedingConfirm().find((c) => c.id === "hi_area");
  check("主要大会の2週間前に出場確認が必要になる", !!area, h.majorsNeedingConfirm().map((c) => c.id).join(","));
  if (area) {
    /**
     * 【地区大会は種目を選べる】（2026-09-23）1人につき何種目も並ぶようになったので、
     * 「候補＝得意種目1つ」ではなくなった。ここで見るのは
     *   ・得意種目がちゃんと候補に入っていること
     *   ・その得意種目で2人まとめてエントリーできること
     */
    const cands = h.majorConfirmCandidates(area);
    const fav = cands.filter((c) => c.event.stroke === "breast" && c.event.distance === 200);
    check("入口の大会は種目を選べる（得意種目も入っている）", fav.length === 2 && cands.length > 2, `候補${cands.length}件`);
    const set = h.setMajorEntries(area, fav);
    check("まとめてエントリーできる", set.ok && set.count === 2, set.reason ?? "");
    check("主要大会は第3週に泳ぐ", h.pendingRaces.length > 0 && h.pendingRaces.every((r) => r.raceDay === 6));
    check("種目・性別が同じなら1レースにまとまる", h.pendingRaces.length === 1);
    h.markConfirmAsked(area.id);
    check("一度出した確認は自動では出し直さない", !h.majorsNeedingConfirm().some((c) => c.id === area.id));
    check("大会画面からは開き直せる", h.majorsInConfirmWindow().some((c) => c.id === area.id));
    const g1 = h.gems;
    const cancel = h.setMajorEntries(area, []);
    check("すべて見送ると払った出場費が返る", cancel.ok && h.gems - g1 === h.raceEntryCost(area, 2) && h.pendingRaces.length === 0);
  }
  h.dayCount = 6;
  check("開催週に入ったら出場確認は出さない", h.majorsInConfirmWindow().length === 0);

  // 勝ち上がりの大会は、前の段で優勝した種目で並ぶ
  const k = new GameState(rand, { clubName: "種目確認SC" });
  k.students.senshu = [];
  k.students.pro = [];
  // 都道府県予選は5月（地区予選＝4月の次の段）
  k.month = 5;
  k.dayCount = 8;
  const ks = mk(k, 9201, "f", "高1", { stroke: "free", distance: 50 });
  ks.season = { year: k.year, clearedStages: [stageEventKey("hi_area", { stroke: "back", distance: 100 })], standards: [], standardEvents: [] };
  const ken = k.majorsNeedingConfirm().find((c) => c.id === "hi_ken");
  const kc = ken ? k.majorConfirmCandidates(ken) : [];
  check(
    "勝ち上がりの大会は前の段で優勝した種目で並ぶ",
    kc.length === 1 && kc[0].event.stroke === "back" && kc[0].event.distance === 100,
    kc.map((c) => `${c.event.stroke}-${c.event.distance}`).join(","),
  );

  // 年度が変わると、予選の勝ち上がりと標準記録は取り直し・記録会の段は残る
  ks.season.clearedStages.push(stageEventKey("kk_area", { stroke: "back", distance: 100 }));
  ks.season.standards.push("jo");
  ks.season.standardEvents.push(stageEventKey("jo", { stroke: "back", distance: 100 }));
  ensureSeason(ks, k.year + 1);
  check("年度が変わると予選の勝ち上がりは地区予選から", !ks.season.clearedStages.some((x) => x.startsWith("hi_area")));
  check("記録会の段は年度をまたいでも残る", ks.season.clearedStages.some((x) => x.startsWith("kk_area@")));
  check("標準記録とその種目の記録も取り直し", ks.season.standards.length === 0 && ks.season.standardEvents.length === 0);

  // 標準記録を出した種目を覚える
  const fast = setStats(createStudent(rand, 9301, "senshu"), 99);
  fast.gender = "m";
  fast.grade = "高2";
  fast.season = { year: 1, clearedStages: [], standards: [], standardEvents: [] };
  resolveCompetition(fast, kirokukaiOf(4, 0), { studentId: fast.id, bestTime: 1, win: false, finalRank: 4, heatRank: 4, advanced: true }, free100);
  check(
    "標準記録を出した種目も覚える",
    fast.season.standards.length > 0 && fast.season.standardEvents.some((x) => x.endsWith("@free-100")),
    fast.season.standardEvents.join(","),
  );

  // セーブ往復：待っているレースと出場確認の印が残る
  g.gems = 99999;
  const again = g.reserveTimeTrial([a], kirokukaiOf(g.month, 0), free100);
  g.markConfirmAsked("hi_area");
  const sv = buildSave(g, new GameClock(), 0);
  const g2 = new GameState(rand);
  applySave(JSON.parse(JSON.stringify(sv)), g2, new GameClock());
  check(
    "待っているレースがセーブ→ロードで戻る",
    g2.pendingRaces.length === 1 && g2.pendingRaces[0].raceDay === again.race?.raceDay && g2.pendingRaces[0].studentIds[0] === a.id,
    JSON.stringify(g2.pendingRaces),
  );
  check("出場確認の印もセーブ→ロードで戻る", g2.meetConfirmAsked.length === 1);
}

line(`\n${failures === 0 ? "全て通過" : `${failures} 件 失敗`}`);
process.exit(failures === 0 ? 0 : 1);
