/**
 * セーブ・ロードの安定性の検証（「タイトルに行くと人数が変わる」の再発防止）。
 *
 * 実機と同じ流れをそのままなぞる：
 *   遊ぶ → セーブ → タイトルへ → つづきから → 遊ぶ → タイトルへ（セーブしない）→ …
 * ロードのたびに GameState を**別の種**で作り直す（実機は時刻から種を作るため）。
 *
 * ここが崩れると「同じところから始めたのに人数・内訳が毎回ちがう」になる。
 *
 * 実行:
 *   npx esbuild savecheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState, PIN_MAX } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { CLASS_ORDER } from "./src/sim/classes";
import { membersOfClass } from "./src/sim/lineup";
import { CLOCK } from "./src/config/balance";
import { slotAtMinute } from "./src/sim/timetable";
import { applySave, buildSave, headerOf } from "./src/save/serialize";
import { applyMood } from "./src/sim/satisfaction";
import { SATISFACTION } from "./src/config/balance";
import { migrateSave } from "./src/save/migrate";
import { SAVE_VERSION, type SaveData } from "./src/save/types";
import { createStudent } from "./src/sim/student";

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

/** FacilityScene.update() と同じ順序で1フレーム進める。 */
function frame(st: GameState, clock: GameClock): void {
  const res = clock.tick(CLOCK.msPerMinute * 5);
  const lineup = st.lineupAt(clock.minuteOfDay);
  for (const cls of st.activeClassIds(clock.minuteOfDay)) {
    const mem = membersOfClass(lineup, cls);
    st.beginClassSession(cls, mem, slotAtMinute(clock.minuteOfDay));
    if (res.minutesAdvanced > 0) st.tickPractice(cls, res.minutesAdvanced, undefined, mem);
  }
  if (res.minutesAdvanced > 0) {
    st.tickGuests(clock.minuteOfDay, res.minutesAdvanced);
    st.pollAutoEvents(res.minutesAdvanced);
  }
  if (res.dayRolled) {
    for (const c of CLASS_ORDER) st.endClassSession(c.id);
    st.onDayRoll();
    if (res.weekToMonth) st.advanceMonth();
  }
}

function play(st: GameState, clock: GameClock, frames: number): void {
  for (let i = 0; i < frames; i++) frame(st, clock);
}

/** クラス別の人数（内訳まで見る）。 */
function roster(st: GameState): string {
  return CLASS_ORDER.map((c) => `${classShort(c.id)}${st.students[c.id].length}`).join("/");
}
function classShort(id: string): string {
  return { youji: "幼", gakudo: "学", ikuseiB: "B", ikuseiA: "A", senshu: "選", pro: "プ" }[id] ?? id;
}

/** セーブを読み込む（実機と同じで、毎回ちがう種の GameState に載せる）。 */
function load(data: SaveData, seed: number): { st: GameState; clock: GameClock } {
  const st = new GameState(rng(seed), { clubName: "検証" });
  const clock = new GameClock();
  applySave(JSON.parse(JSON.stringify(data)) as SaveData, st, clock);
  return { st, clock };
}

// ------------------------------------------------------------------ 1. セーブせずに戻るをくり返す

head("1. セーブせずにタイトルへ戻る、をくり返す");
{
  const st = new GameState(rng(3), { clubName: "検証" });
  const clock = new GameClock();
  play(st, clock, 900); // しばらく遊ぶ
  const saved = buildSave(st, clock, 0);
  console.log(`  セーブ時: ${roster(st)}（計${st.totalMembers()}人）  ${st.year}年${st.month}月`);

  // 同じセーブから「読み込む → 少し遊ぶ → セーブせずに戻る」を10回
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    const g = load(saved, 1000 + i * 7919); // 毎回ちがう種＝実機と同じ条件
    play(g.st, g.clock, 150);
    seen.push(`${roster(g.st)}(計${g.st.totalMembers()})`);
  }
  console.log(`  10回ぶんの結果: ${[...new Set(seen)].join(" / ")}`);
  ok(new Set(seen).size === 1, "10回とも、人数も内訳もまったく同じ", seen[0]);
}

// ------------------------------------------------------------------ 2. 年度更新の直前でも同じか

head("2. 年度更新（4月）をまたぐ直前のセーブでも同じか");
{
  const st = new GameState(rng(11), { clubName: "検証" });
  const clock = new GameClock();
  let guard = 0;
  while (!(st.month === 3 && clock.week === 4) && guard < 3_000_000) {
    guard++;
    frame(st, clock);
  }
  const saved = buildSave(st, clock, 0);
  console.log(`  セーブ時: ${roster(st)}（計${st.totalMembers()}人）  ${st.year}年${st.month}月${clock.week}週`);

  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    const g = load(saved, 5000 + i * 104729);
    play(g.st, g.clock, 400); // 年度更新をまたぐ
    seen.push(`${roster(g.st)}(計${g.st.totalMembers()})`);
  }
  console.log(`  8回ぶんの結果: ${[...new Set(seen)].join(" / ")}`);
  ok(new Set(seen).size === 1, "年度更新をまたいでも毎回同じ", seen[0]);
}

// ------------------------------------------------------------------ 3. セーブ→ロード→セーブ が完全に一致するか

head("3. セーブ → ロード → セーブ で、データが1バイトも変わらない");
{
  const st = new GameState(rng(21), { clubName: "検証" });
  const clock = new GameClock();
  play(st, clock, 1500);
  const a = buildSave(st, clock, 12345);

  const g = load(a, 777);
  const b = buildSave(g.st, g.clock, 12345);

  // savedAt は書き出した時刻なので比べない
  const strip = (d: SaveData): string => JSON.stringify({ ...d, savedAt: 0 });
  ok(strip(a) === strip(b), "読み込んで書き出し直しても同じデータになる");

  const ha = headerOf(a);
  const hb = headerOf(b);
  ok(ha.members === hb.members, "一覧に出る在籍数も一致", `${ha.members} / ${hb.members}`);

  // もう一往復しても変わらない
  const g2 = load(b, 888);
  const c = buildSave(g2.st, g2.clock, 12345);
  ok(strip(b) === strip(c), "2往復しても変わらない");
}

// ------------------------------------------------------------------ 4. 定員ぎりぎりでも減らない

head("4. 定員ぎりぎりでも、読み込みで減らない");
{
  const st = new GameState(rng(31), { clubName: "検証" });
  st.gems = 999999;
  const clock = new GameClock();
  for (const cand of st.generateRecruits()) st.hireCoach(cand);
  // 幼児・学童を定員いっぱいまで入れる
  const capY = st.capacityOf("youji");
  const capG = st.capacityOf("gakudo");
  for (let i = 0; i < capY; i++) st.students.youji.push(createStudent(rng(400 + i), 50000 + i, "youji"));
  for (let i = 0; i < capG; i++) st.students.gakudo.push(createStudent(rng(500 + i), 60000 + i, "gakudo"));
  const before = st.totalMembers();

  let data = buildSave(st, clock, 0);
  const counts: number[] = [];
  for (let i = 0; i < 4; i++) {
    const g = load(data, 9000 + i);
    counts.push(g.st.totalMembers());
    data = buildSave(g.st, g.clock, 0);
  }
  ok(counts.every((n) => n === before), "定員いっぱいでも1人も減らない", `${before} → ${counts.join(" → ")}`);
}

// ------------------------------------------------------------------ 5. 古いセーブの移行

head("5. 古いバージョンのセーブも読める");
{
  const st = new GameState(rng(41), { clubName: "移行" });
  const clock = new GameClock();
  play(st, clock, 300);
  const cur = buildSave(st, clock, 0);

  // v11 相当（乱数の状態が無い）に落として読ませる
  const old = JSON.parse(JSON.stringify(cur)) as Record<string, unknown>;
  old.version = 11;
  const game = old.game as Record<string, unknown>;
  delete game.rngState;
  delete game.enrollTimer;
  delete game.flavorTimer;

  const r = migrateSave(old);
  ok(r.ok, "v11 のセーブを読める", r.ok ? `v${r.data.version}` : r.reason);
  if (r.ok) {
    ok(r.data.version === SAVE_VERSION, "最新バージョンに上がる", `v${r.data.version}`);
    // 移行後も、読み込むたびに結果が変わらないこと
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const g = load(r.data, 20000 + i * 31);
      play(g.st, g.clock, 150);
      seen.push(roster(g.st));
    }
    ok(new Set(seen).size === 1, "移行したセーブも毎回同じ結果になる", seen[0]);
  }
}


// ------------------------------------------------------------------ 6. v12 → v13（サウナの部屋化・キャンペーン回数）

head("6. v12 のセーブ（サウナは器具だった）を読み込む");
{
  const st = new GameState(rng(51), { clubName: "サウナ" });
  const clock = new GameClock();
  play(st, clock, 200);
  const cur = buildSave(st, clock, 0);

  // v12 相当に落とす：サウナは「マッサージエリアに置く器具」を2つ持っていた
  const old = JSON.parse(JSON.stringify(cur)) as Record<string, unknown>;
  old.version = 12;
  const game = old.game as Record<string, unknown>;
  delete game.campaignRepeats;
  const before = (game.equipment as unknown[]).length;
  game.items = { ...((game.items ?? {}) as Record<string, number>), sauna: 2 };
  game.itemPlacements = { ...((game.itemPlacements ?? {}) as Record<string, number[]>), sauna: [0, 1] };

  const r = migrateSave(old);
  ok(r.ok, "v12 のセーブを読める", r.ok ? `v${r.data.version}` : r.reason);
  if (r.ok) {
    const g2 = load(r.data, 61);
    ok(g2.st.equipmentCount("sauna") === 2, "サウナ2つが部屋に置き換わる", `${g2.st.equipmentCount("sauna")}室`);
    ok(g2.st.equipment.length === before + 2, "他の設備は消えない", `${before} → ${g2.st.equipment.length}`);
    ok(Object.keys(g2.st.campaignRepeats).length === 0, "キャンペーンの回数は0から始まる");
  }
}

// ------------------------------------------------------------------ 7. キャンペーンの回数が保存される

head("7. キャンペーンを打った回数が保存される");
{
  const st = new GameState(rng(71), { clubName: "回数" });
  const clock = new GameClock();
  st.gems = 99999;
  const first = st.runCampaign("freeAdmission");
  const fresh1 = st.campaignFreshness("freeAdmission");
  const data = buildSave(st, clock, 0);
  const g = load(data, 72);
  ok(first.ok, "キャンペーンを開催できた", first.ok ? "" : (first.reason ?? ""));
  ok(
    g.st.campaignFreshness("freeAdmission") === fresh1,
    "読み込んでも効果の落ち具合が同じ",
    `${g.st.campaignFreshness("freeAdmission")}`,
  );
  ok(!g.st.campaignStatus("referral").ok, "通常キャンペーンは月に1つだけ", g.st.campaignStatus("referral").reason ?? "");
}

// ------------------------------------------------------------------ 8. 満足度（機嫌）が保存される

head("8. 満足度（機嫌）が保存される");
{
  const st = new GameState(rng(81), { clubName: "機嫌" });
  const clock = new GameClock();
  const one = st.students.gakudo[0];
  ok(!!one, "学童に生徒がいる");
  // わざと機嫌を動かしてから保存する（既定値のままだと保存されているか分からない）
  applyMood(one, "win");
  applyMood(one, "win");
  const before = one.mood;
  ok(before > SATISFACTION.baseline, "機嫌が既定値から動いている", `${before.toFixed(1)}`);

  const data = buildSave(st, clock, 0);
  const g = load(data, 82);
  const same = g.st.students.gakudo.find((x) => x.id === one.id);
  ok(!!same && Math.abs(same.mood - before) < 0.05, "読み込んでも機嫌が同じ", `${same?.mood?.toFixed(1)}`);

  // 古いセーブ（機嫌を持たない）を読んでも壊れない＝新規生成の既定値になる
  const raw = JSON.parse(JSON.stringify(data)) as SaveData;
  for (const sv of raw.game.students) delete (sv as unknown as Record<string, unknown>).mood;
  const g2 = load(raw, 83);
  const revived = g2.st.students.gakudo.find((x) => x.id === one.id);
  ok(
    !!revived && Math.abs(revived.mood - SATISFACTION.baseline) < 0.05,
    "機嫌を持たない古いセーブは「ふつう」で読み込まれる",
    `${revived?.mood?.toFixed(1)}`,
  );
}

head("9. 注目選手の★が保存される");
{
  const st = new GameState(rng(91), { clubName: "注目" });
  const clock = new GameClock();
  const list = st.students.gakudo;
  ok(list.length >= 4, "学童が4人以上いる", `${list.length}人`);

  // 上限まで付けて、さらに1人付けようとすると断られること
  for (let i = 0; i < PIN_MAX; i++) ok(st.togglePin(list[i]).pinned, `${i + 1}人目に★を付けられる`);
  const over = st.togglePin(list[PIN_MAX]);
  ok(!over.ok, "上限を超えると付けられない", over.reason ?? "");
  // 【勝手に外さない】上限に当たったとき、古い★を黙って外す作りにすると
  // 「付けたはずの子が消えている」になる。断るだけが正しい。
  ok(list[0].pinned, "上限に当たっても古い★は外れない");
  ok(st.pinnedStudents().length === PIN_MAX, `注目は${PIN_MAX}人まで`, `${st.pinnedStudents().length}人`);

  const data = buildSave(st, clock, 0);
  const g = load(data, 92);
  const revived = g.st.pinnedStudents();
  ok(revived.length === PIN_MAX, "読み込んでも★の人数が同じ", `${revived.length}人`);
  ok(
    revived.every((s, i) => s.id === list[i].id),
    "読み込んでも★が付いているのは同じ選手",
    revived.map((s) => s.name).join("・"),
  );

  // 外せること（付け外しが片道だと、選び直せなくなる）
  st.togglePin(list[0]);
  ok(!list[0].pinned, "★を外せる");
  ok(st.pinnedStudents().length === PIN_MAX - 1, "外すと人数が減る", `${st.pinnedStudents().length}人`);

  // 印を持たない古いセーブを読んでも壊れない
  const raw = JSON.parse(JSON.stringify(data)) as SaveData;
  for (const sv of raw.game.students) delete (sv as unknown as Record<string, unknown>).pinned;
  const g2 = load(raw, 93);
  ok(g2.st.pinnedStudents().length === 0, "印を持たない古いセーブは★なしで読み込まれる");
}

head("10. 値上げ前（v31）のセーブ：払った額と返金（2026-10-02）");
{
  const st = new GameState(rng(101));
  const clock = new GameClock();
  st.gems = 9_999_999;
  const price = st.equipmentCost("studio");
  const bought = st.buyEquipment("studio");
  ok(bought.ok && bought.item?.paid === price, "買った部屋は払った額を覚える", `◆${bought.item?.paid}`);
  const data = buildSave(st, clock, 0);

  // v31 当時の形に戻す（paid を持たない）
  const old = JSON.parse(JSON.stringify(data)) as Record<string, unknown> & { game: Record<string, unknown> };
  old.version = 31;
  for (const e of old.game.equipment as Record<string, unknown>[]) delete e.paid;
  const r = migrateSave(old);
  ok(r.ok, "v31 のセーブを読める", r.ok ? `v${r.data.version}` : r.reason);
  if (r.ok) {
    const g = load(r.data, 102);
    const studio = g.st.equipment.find((e) => e.kind === "studio");
    ok(studio?.paid === 760, "値上げ前の部屋は当時の値段を払ったことになる", `◆${studio?.paid}`);
    ok(g.st.priceRevisedNotice, "値上げのお知らせを出す印が立つ");
    ok(g.st.gems === st.gems, "所持金はそのまま", `◆${g.st.gems}`);
    const r2 = g.st.sellEquipment(studio!);
    ok(r2.ok && r2.refund === Math.round(760 * 0.35), "撤去の返金は払った額から（値上げ後の値段からではない）", `◆${r2.refund}`);
  }
  // 開始時から建っている部屋（ただでもらった）は返金しない
  const st3 = new GameState(rng(103));
  const entrance = st3.equipment.find((e) => e.kind === "entrance")!;
  ok((entrance.paid ?? 0) === 0, "開始時の入口は払った額 0");
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
