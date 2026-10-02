/// <reference types="node" />
/**
 * マップ（マス目・自由配置・導線）／時間割／一般客／寮／幼少期フォームの検証。
 *
 * 実行:
 *   npx esbuild mapcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import {
  accessOf,
  canPlaceAt,
  cellsOf,
  entranceField,
  isBuildable,
  isPerimeter,
  landBounds,
  isOpenGround,
  mapSignature,
  placedRooms,
  roomAt,
  routeEfficiency,
  routeFromEntrance,
  strandedRooms,
} from "./src/sim/clubMap";
import { EQUIPMENT_ORDER, footprintOf, isEquipmentKind, isPool, type Equipment } from "./src/sim/equipment";
import { SLOTS, slotAtMinute } from "./src/sim/timetable";
import { groupByClass, poolLineup, splitAcrossPools } from "./src/sim/lineup";
import { CLASS_ORDER } from "./src/sim/classes";
import { StaffPerson } from "./src/iso/staff";
import { coachSalary } from "./src/sim/coach";
import { buildSave, applySave } from "./src/save/serialize";
import { migrateSave } from "./src/save/migrate";
import { SAVE_VERSION } from "./src/save/types";
import { CLOCK, DORM, EQUIPMENT, INJURY, MAP, YOUTH_FORM } from "./src/config/balance";
import {
  applyTraining,
  createStudent,
  OWN_STYLE,
  STAT_KEYS,
  youthPotential,
  youthPotentialHint,
} from "./src/sim/student";
import {
  doorMarks,
  fittingsOf,
  floorKindAt,
  innerCellsOf,
  approachInside,
  bathSeatCells,
  isBathWaterCell,
  isOverPoolWater,
  laneRopesOf,
  leaveRoute,
  moveRoute,
  ontoDry,
  poolDeckAt,
  placementZones,
  roomLabelsOf,
  standCellsOf,
  startBlockCellsOf,
  swimLanesOf,
  visitRoute,
  wallEdgesOf,
} from "./src/iso/facility";
import { centerOf } from "./src/sim/clubMap";
import { buildWallEdges, edgeKey, hasOpenDoor, isPassable, wallLookup } from "./src/sim/walls";
import { wouldStrand } from "./src/sim/placement";
import { WALL_H } from "./src/gfx/roomStyle";
import { boundsOf, edgeScrollVector, keepInViewOffset } from "./src/iso/camera";
import { CAMERA, COACHING } from "./src/config/balance";

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

/** 決定的な乱数（テストを再現可能にする）。 */
function rng(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const newGame = (seed = 1): GameState => new GameState(rng(seed), { clubName: "テストクラブ" });

/**
 * 検証用：大型施設（◆100万）を建てられるクラブにする。
 *
 * アスリート寮・大型プール・医科学センター・高地トレーニング棟は
 * `UNLOCK` でクラブの格と在籍数の鍵が掛かっている（→ config/balance.ts）。
 * 建てる手順そのものを試す検査では、先にここを通して鍵を開ける。
 */
function readyForBigFacility(st: GameState): void {
  st.gems = 20_000_000;
  st.popularity = 6000;
  st.clubAchievement = 40_000;
  st.refreshClubRank();
  while (st.totalMembers() < 90) st.addDevMember();
  for (let i = 0; i < 2; i++) st.expandLand();
}

/**
 * 検証用：コーチを n 人まで増やす。
 *
 * **コーチ室を建てるまでコーチは1人**（→ COACHING.maxCoaches）なので、
 * 複数コーチが要る検証は必ずここを通す。実際の手順（コーチ室を建てる → 雇う）を
 * そのまま踏むので、雇用のルールが壊れたらここで落ちる。
 */
function withCoaches(st: GameState, n: number): GameState {
  const keep = st.gems;
  st.gems = 9_999_999;
  while (st.coaches.length < n) {
    if (st.coachCapacity() <= st.coaches.length && !st.buyEquipment("coachroom").ok) break;
    const cand = st.generateRecruits()[0];
    if (!cand || !st.hireCoach(cand).ok) break;
  }
  st.gems = keep; // コーチ室の建設費はテストの資金計算に混ぜない
  return st;
}


// ------------------------------------------------------------------ 1. マス目マップ

head("1. マス目マップと初期配置");
{
  const st = newGame();
  const map = st.map();
  ok(map.cols === MAP.cols && map.rows === MAP.rows, "マップの寸法が config どおり", `${map.cols}x${map.rows}`);

  // 敷地（買ってある範囲）の外周は必ず道路。敷地を広げると道路も外へ動く。
  const lb = landBounds(map);
  let ringOk = true;
  for (let gx = lb.x0 - 1; gx <= lb.x1 + 1; gx++) {
    if (!isPerimeter(map, gx, lb.y0 - 1) || !isPerimeter(map, gx, lb.y1 + 1)) ringOk = false;
    if (!isPerimeter(map, gx, lb.y0 - 1)) ringOk = false;
  }
  for (let gy = lb.y0 - 1; gy <= lb.y1 + 1; gy++) {
    if (!isPerimeter(map, lb.x0 - 1, gy) || !isPerimeter(map, lb.x1 + 1, gy)) ringOk = false;
  }
  ok(ringOk, "敷地の外周がぐるりと道路になっている", `${map.landSteps}段 ${lb.x0}-${lb.x1}`);
  // まだ買っていない土地＝敷地の右のブロック（外周の道路より外側）
  ok(
    !isBuildable(map, lb.x1 + 3, lb.y0) && !isPerimeter(map, lb.x1 + 3, lb.y0),
    "買っていない土地は敷地の外",
  );

  // 部屋は決められたマス数を占有する
  const rooms = placedRooms(map);
  // 【初期配置は2つ】入口とプールだけ（2026-09-24）。
  // スタジオは「自分で建てる最初の設備」にした（→ START.equipment ／ STARTER_LAYOUT）
  ok(rooms.length === 2, "初期配置＝入口とプールだけ", rooms.map((r) => r.kind).join(","));
  ok(
    rooms.some((r) => r.kind === "entrance") && rooms.some((r) => r.kind === "pool6"),
    "入口からプールへ歩ける形から始まる",
  );
  const pool = rooms.find((r) => isPool(r.kind));
  ok(!!pool, "プールが配置されている");
  if (pool) {
    const f = footprintOf(pool.kind);
    ok(cellsOf(pool).length === f.w * f.h, "プールが footprint ぶんのマスを占有", `${f.w}x${f.h}=${f.w * f.h}マス`);
  }

  // 重なりが無い
  const seen = new Set<string>();
  let overlap = false;
  for (const r of rooms) for (const c of cellsOf(r)) {
    const k = `${c.gx},${c.gy}`;
    if (seen.has(k)) overlap = true;
    seen.add(k);
  }
  ok(!overlap, "初期配置に重なりが無い");

  // 外周に建てられない
  ok(!canPlaceAt(map, "studio", 0, 0).ok, "外周の道路には建てられない");
  ok(!canPlaceAt(map, "studio", MAP.cols - 2, 3).ok, "敷地からはみ出す位置には建てられない");
}

// ------------------------------------------------------------------ 2. 導線（道が繋がっていないと使えない）

head("2. 導線と経路探索");
{
  const st = newGame();
  const map = st.map();
  const field = entranceField(map);

  for (const r of placedRooms(map)) {
    const a = accessOf(map, r, field);
    ok(a.reachable, `初期配置：${r.kind} に入口から道が繋がっている`, a.dist >= 0 ? `${a.dist}マス` : "");
  }
  ok(st.strandedRooms().length === 0, "最初は「行けない部屋」が無い");

  // 入口 → プール の道順が引ける（更衣室は廃止＝寄り道しない）
  const pool = placedRooms(map).find((r) => isPool(r.kind))!;
  const route = visitRoute(map, pool, { suit: true });
  ok(!!route && route.length > 3, "入口→プールの道順が引ける", `${route?.length ?? 0}地点`);
  ok(!!route?.some((w) => w.change === "suit"), "プールに着いたところで水着になる指示が入っている");
  ok(
    route?.findIndex((w) => w.change === "suit") === (route?.length ?? 0) - 1,
    "着替えるのは道順の終点（歩いている間はずっと私服）",
  );

  // 【道は敷かない】部屋は建てただけで使える
  const st2 = newGame();
  st2.gems += 5000; // 部屋の値段を上げたので、テスト用に資金を足す
  const gym = st2.buyEquipment("gym");
  ok(gym.ok && gym.placed === true, "買った部屋は自動でマップに置かれる", gym.reason ?? "");
  ok(st2.isRoomUsable(gym.item!), "道を敷かなくても、建てた部屋はそのまま使える");
  ok(st2.strandedRooms().length === 0, "「行けない部屋」は出ない");
  const lb2 = landBounds(st2.map());
  ok(isOpenGround(st2.map(), lb2.x0, lb2.y0), "部屋の建っていない敷地はどこでも歩ける");
  ok(!isOpenGround(st2.map(), gym.item!.gx as number, gym.item!.gy as number), "部屋の中は通り抜けできない");

  // 入口が無くなると、どの部屋にも行けなくなる（唯一の「行けない」条件）
  const st3 = newGame();
  const before = st3.trainingSlots();
  ok(before > 0, "はじめは練習枠がある", `${before}人`);
  const gate3 = st3.equipment.find((e) => e.kind === "entrance")!;
  const gpos = { gx: gate3.gx as number, gy: gate3.gy as number };
  st3.storeRoom(gate3);
  ok(st3.trainingSlots() === 0, "入口をしまうとプールの練習枠も0になる");
  ok(st3.strandedRooms().length > 0, "「行けない部屋」として警告対象になる", `${st3.strandedRooms().length}件`);
  st3.placeRoom(gate3, gpos.gx, gpos.gy, false);
  ok(st3.trainingSlots() === before, "入口を戻せば練習枠も戻る", `${st3.trainingSlots()}人`);
}

// ------------------------------------------------------------------ 3. 自由配置（移動・撤去・入口の増設）

head("3. 自由配置（置く・動かす・撤去する）");
{
  const st = newGame();
  st.gems = 99999;
  // 初期の敷地は10×10でほぼ埋まっているので、動かす余地を作ってから試す
  while (st.expandLand().ok) st.gems = 99999;
  const r = st.buyEquipment("studio");
  const room = r.item!;
  const from = { gx: room.gx, gy: room.gy };

  // 動かせる（座標は「買ってある敷地」の中から取る）
  const LB = landBounds(st.map());
  const spot = { gx: LB.x0, gy: LB.y0 + 5 };
  const moved = st.placeRoom(room, spot.gx, spot.gy);
  ok(moved.ok, "部屋を好きな位置へ動かせる", `${from.gx},${from.gy} → ${spot.gx},${spot.gy}`);
  ok(room.gx === spot.gx && room.gy === spot.gy, "移動後の座標が反映されている");

  // 重なる位置には置けない
  const pool = placedRooms(st.map()).find((x) => isPool(x.kind))!;
  const bad = st.placeRoom(room, pool.gx as number, pool.gy as number);
  ok(!bad.ok, "他の部屋と重なる位置には置けない", bad.reason ?? "");

  // 倉庫へ戻す／また置く
  ok(st.storeRoom(room).ok, "部屋を倉庫（未配置）に戻せる");
  ok(st.unplacedEquipment().some((e) => e.id === room.id), "未配置一覧に出る");
  ok(!st.isRoomUsable(room), "未配置の部屋は使えない");
  ok(st.placeRoom(room, spot.gx, spot.gy).ok, "また置き直せる");

  // 入口の増設
  const g2 = st.buyEquipment("entrance");
  ok(g2.ok, "入口を増設できる");
  const gates = placedRooms(st.map()).filter((e) => e.kind === "entrance");
  ok(gates.length === 2, "入口が2つになった");
  // 入口は外周に面していないと置けない
  const inner = st.placeRoom(g2.item!, LB.x0 + 2, LB.y0 + 9);
  ok(!inner.ok, "入口は敷地の内側には置けない（外周の道路に面する必要がある）", inner.reason ?? "");

}

// ------------------------------------------------------------------ 4. 複数プールと時間割

head("4. 複数プールと時間割編成");
{
  const st = newGame();
  st.gems = 999999;
  // プールを何本も建てるには敷地を広げる必要がある（初期の12×12には1本しか入らない）
  while (st.expandLand().ok) st.gems = 999999;
  ok(EQUIPMENT.maxPools === 4, "プールの上限は4", `${EQUIPMENT.maxPools}`);

  ok(st.timetable.length > 0, "初期の時間割が入っている", `${st.timetable.length}コマ`);
  ok(st.activeTimetable().length > 0, "コーチが割り当たって開講できている", `${st.activeTimetable().length}コマ`);

  // 2つ目のプールを建てて、同じコマに別クラスを並行させる
  const p2 = st.buyEquipment("pool6");
  ok(p2.ok && p2.placed, "2つ目のプールを建てられる");
  const pools = st.placedPools();
  ok(pools.length === 2, "配置済みのプールが2本");

  const slot = 3; // 14-15（初期の時間割では育成Bが入っている）
  withCoaches(st, 2); // 並行して開講するには、その時間に空いているコーチが要る
  const coach = st.coaches[1] ?? st.coaches[0];
  // 【時間割のきまり】別のクラスなら、別のプールで同じ時間に並行してよい
  const twin = st.setTimetableEntry(pools[1].id, slot, "ikuseiA", coach.id);
  ok(twin.ok, "別プールなら育成Aと育成Bを同じ時間に組める", twin.reason ?? "");
  // 同じクラスは同じ時間に2つ入れられない
  const sameCls = st.timetableEntryAt(pools[0].id, slot)?.classId ?? "ikuseiB";
  const dupCls = st.setTimetableEntry(pools[1].id, slot, sameCls, coach.id);
  ok(!dupCls.ok, "同じクラスは同じ時間に2つ組めない", dupCls.reason ?? "");
  // スクールも同じ扱い（別クラスなら並行できる）
  const set = st.setTimetableEntry(pools[1].id, slot, "gakudo", coach.id);
  ok(set.ok, "2つ目のプールに同じコマでスクールを組める");
  const running = st.runningLessons(SLOTS[slot].start + 10);
  ok(running.length === 2, "同じ時間に2クラスが並行して走る", running.map((e) => e.classId).join("+"));

  // 同じコーチを同じ時間に二重に入れられない
  const dup = st.setTimetableEntry(pools[1].id, slot, "gakudo", st.timetableEntryAt(pools[0].id, slot)?.coachId ?? -1);
  ok(!dup.ok, "同じコーチを同じコマに二重配置できない", dup.reason ?? "");

  // 3本目・4本目・5本目
  ok(st.buyEquipment("pool6").ok, "3本目のプールを建てられる");
  ok(st.buyEquipment("pool8").ok, "4本目のプールを建てられる");
  const fifth = st.canBuyEquipment("pool6");
  ok(!fifth.ok, "5本目は建てられない（上限4）", fifth.reason ?? "");

  ok(slotAtMinute(SLOTS[0].start) === 0, "時刻からコマを引ける");
  ok(slotAtMinute(SLOTS[SLOTS.length - 1].end) === -1, "営業時間外はコマ無し");
}

// ------------------------------------------------------------------ 4b. プールを増やしても人は増えない（定員だけ）

head("4b. コマと定員（1人が練習するのは1コマだけ）");
{
  const st = newGame();
  st.gems = 999999;
  while (st.expandLand().ok) st.gems = 999999; // 2本目のプールを置く場所を作る
  st.buyEquipment("pool6");
  const pools = st.placedPools();
  ok(pools.length === 2, "プールが2本", `${pools.length}本`);

  // 学童を50人にして、学童のコマを2つだけにする
  //（同じクラスは同じ時間に2つ入れられないので、別々のコマに置く）
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  st.students.gakudo.length = 0;
  for (let i = 0; i < 50; i++) st.students.gakudo.push(createStudent(rng(i + 3), 600 + i, "gakudo"));

  const slot = 3;
  const slot2 = 4;
  const coachA = st.coaches[0];
  const coachB = st.coaches[1] ?? st.coaches[0];
  st.setTimetableEntry(pools[0].id, slot, "gakudo", coachA.id);
  const dupSlot = st.setTimetableEntry(pools[1].id, slot, "gakudo", coachB.id);
  ok(!dupSlot.ok, "同じクラスは同じ時間に2つ入れられない", dupSlot.reason ?? "");
  const setB = st.setTimetableEntry(pools[1].id, slot2, "gakudo", coachB.id);
  ok(setB.ok, "時間をずらせば2コマ目を開講できる", setB.reason ?? "");

  ok(st.capacityOf("gakudo") === 120, "コマを2つにすると定員は120人", `${st.capacityOf("gakudo")}人`);

  // 本題：50人なら1コマ目に50人ぜんぶ入り、2コマ目は誰も使わない
  ok(st.assignedCount(pools[0].id, slot) === 50, "1コマ目に50人", `${st.assignedCount(pools[0].id, slot)}人`);
  ok(st.assignedCount(pools[1].id, slot2) === 0, "2コマ目は誰も使わない", `${st.assignedCount(pools[1].id, slot2)}人`);

  const line = st.lineupAt(SLOTS[slot].start + 10);
  const ids = line.flatMap((l) => l.members.map((m) => m.id));
  ok(ids.length === 50 && ids.length === new Set(ids).size, "画面に出るのは50人・複製なし", `${ids.length}人`);

  // 70人に増やすと、あふれた10人だけが2コマ目へ
  for (let i = 50; i < 70; i++) st.students.gakudo.push(createStudent(rng(i + 3), 600 + i, "gakudo"));
  ok(st.assignedCount(pools[0].id, slot) === 60, "1コマ目は練習枠ぶん（60人）", `${st.assignedCount(pools[0].id, slot)}人`);
  ok(st.assignedCount(pools[1].id, slot2) === 10, "あふれた10人だけが2コマ目へ", `${st.assignedCount(pools[1].id, slot2)}人`);
  const ids2 = [
    ...st.lineupAt(SLOTS[slot].start + 10).flatMap((l) => l.members.map((m) => m.id)),
    ...st.lineupAt(SLOTS[slot2].start + 10).flatMap((l) => l.members.map((m) => m.id)),
  ];
  ok(ids2.length === 70 && ids2.length === new Set(ids2).size, "70人が1回ずつ", `${ids2.length}人`);

  // 時間の違うコマでも同じ（＝週に何度も練習はしない）
  const st2 = newGame();
  st2.gems = 999999;
  for (const e of [...st2.timetable]) st2.setTimetableEntry(e.poolId, e.slot, null, null);
  st2.students.gakudo.length = 0;
  for (let i = 0; i < 50; i++) st2.students.gakudo.push(createStudent(rng(i + 9), 600 + i, "gakudo"));
  const pool2 = st2.placedPools()[0];
  const slotA = 2;
  const slotB = 4;
  st2.setTimetableEntry(pool2.id, slotA, "gakudo", st2.coaches[0].id);
  st2.setTimetableEntry(pool2.id, slotB, "gakudo", st2.coaches[0].id); // 時間が違うので同じコーチでよい
  ok(st2.assignedCount(pool2.id, slotA) === 50, "早い時間のコマに50人ぜんぶ入る", `${st2.assignedCount(pool2.id, slotA)}人`);
  ok(st2.assignedCount(pool2.id, slotB) === 0, "遅い時間のコマは誰も来ない", `${st2.assignedCount(pool2.id, slotB)}人`);
  const lateIds = st2.lineupAt(SLOTS[slotB].start + 10).flatMap((l) => l.members.map((m) => m.id));
  ok(lateIds.length === 0, "2コマ目の時間はプールが空", `${lateIds.length}人`);

  // 練習も1回だけ（2コマ入れても2倍にならない）
  const one = newGame();
  one.gems = 999999;
  for (const e of [...one.timetable]) one.setTimetableEntry(e.poolId, e.slot, null, null);
  one.students.gakudo.length = 0;
  for (let i = 0; i < 10; i++) one.students.gakudo.push(createStudent(rng(i + 5), 600 + i, "gakudo"));
  const poolOne = one.placedPools()[0];
  one.setTimetableEntry(poolOne.id, slotA, "gakudo", one.coaches[0].id);
  const target = one.students.gakudo[0];
  const before = target.stats.form;
  // 1コマだけのとき
  one.tickPractice("gakudo", 60, undefined, one.practicingNow(SLOTS[slotA].start + 10, "gakudo"));
  const gain1 = target.stats.form - before;
  // コマを2つに増やして、両方の時間ぶん練習させる
  one.setTimetableEntry(poolOne.id, slotB, "gakudo", one.coaches[0].id);
  const mid = target.stats.form;
  one.tickPractice("gakudo", 60, undefined, one.practicingNow(SLOTS[slotA].start + 10, "gakudo"));
  one.tickPractice("gakudo", 60, undefined, one.practicingNow(SLOTS[slotB].start + 10, "gakudo"));
  const gain2 = target.stats.form - mid;
  ok(gain1 > 0, "1コマで練習の効果がある", `+${gain1.toFixed(2)}`);
  ok(
    Math.abs(gain2 - gain1) < gain1 * 0.35,
    "コマを2つにしても、その人の練習量は増えない",
    `1コマ +${gain1.toFixed(2)} / 2コマ +${gain2.toFixed(2)}`,
  );

  // 万が一「同じ人が2つのクラスの名簿に入っている」状態でも、画面には1人しか出さない
  const victim = st.students.gakudo[0];
  st.students.youji.push(victim);
  const broken = st.lineupAt(SLOTS[slot].start + 10).flatMap((l) => l.members.map((m) => m.id));
  ok(broken.length === new Set(broken).size, "名簿が壊れていても複製しない（最後の砦）", `${broken.length}人`);
  st.students.youji.pop();
}

// ------------------------------------------------------------------ 4b-1. 育成〜プロは何度でも練習できる

head("4b-1. 育成〜プロ（同じ時間は1プールだけ／コマのぶんだけ練習できる）");
{
  const st = newGame();
  st.gems = 999999;
  while (st.expandLand().ok) st.gems = 999999; // 2本目のプールを置く場所を作る
  st.buyEquipment("pool6");
  withCoaches(st, 2);
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const [p1, p2] = st.placedPools();
  // 新規ゲームにも最初から選手がいる（→ START.roster）ので、数を数える検査では空にしてから足す
  st.students.senshu.length = 0;
  for (let i = 0; i < 8; i++) st.students.senshu.push(createStudent(rng(i + 11), 900 + i, "senshu"));

  // 同じクラスは同じ時間に2つのプールへは分けられない（体は1つ）
  ok(st.setTimetableEntry(p1.id, 2, "senshu", st.coaches[0].id).ok, "選手クラスのコマを入れられる");
  const twin = st.setTimetableEntry(p2.id, 2, "senshu", st.coaches[1].id);
  ok(!twin.ok, "同じ時間に別のプールで同じクラスは開けない", twin.reason ?? "");
  // 別のクラスなら並行してよい（スクールでも育成でも）
  ok(st.setTimetableEntry(p2.id, 2, "gakudo", st.coaches[1].id).ok, "別クラスなら同じ時間に並行できる");
  ok(st.setTimetableEntry(p2.id, 5, "ikuseiA", st.coaches[1].id).ok, "育成Aも別のコマに置ける");

  // 時間が違えば何コマでも入れられる＝全員がそのぶん練習する
  ok(st.setTimetableEntry(p1.id, 3, "senshu", st.coaches[0].id).ok, "別の時間にもう1コマ入れられる");
  ok(st.setTimetableEntry(p1.id, 4, "senshu", st.coaches[0].id).ok, "さらにもう1コマ");
  ok(st.assignedCount(p1.id, 2) === 8, "1コマ目に全員（8人）", `${st.assignedCount(p1.id, 2)}人`);
  ok(st.assignedCount(p1.id, 3) === 8, "2コマ目にも全員が出る", `${st.assignedCount(p1.id, 3)}人`);
  ok(st.assignedCount(p1.id, 4) === 8, "3コマ目にも全員が出る", `${st.assignedCount(p1.id, 4)}人`);

  // どの時刻でも、同じ人が2箇所に出ることはない
  let dup = 0;
  for (let m = 0; m < 24 * 60; m += 10) {
    const ids = st.lineupAt(m).flatMap((l) => l.members.map((s) => s.id));
    dup += ids.length - new Set(ids).size;
  }
  ok(dup === 0, "どの時刻でも複製されない", `${dup}件`);

  // 練習すると疲労が溜まる：コマを増やすほど体力が減り、伸びも小さくなる
  const s0 = st.students.senshu[0];
  const key = st.planFor(s0).ability; // その選手が実際に鍛えている能力
  const full = s0.energy;
  const base0 = s0.stats[key];
  st.tickPractice("senshu", 60, undefined, st.practicingNow(SLOTS[2].start + 10, "senshu"));
  const after1 = s0.energy;
  const gain1 = s0.stats[key] - base0;
  ok(after1 < full, "1コマ練習すると体力が減る", `${Math.round(full)} → ${Math.round(after1)}`);
  ok(gain1 > 0, "1コマ目で伸びる", `+${gain1.toFixed(2)}`);

  // コマとコマの間は休憩（体力が一部だけ戻る）→ 2コマ目も練習になるが、伸びは小さい
  st.endClassSession("senshu", st.practicingNow(SLOTS[2].start + 10, "senshu"));
  const rested = s0.energy;
  ok(rested > after1, "コマの合間の休憩で体力が少し戻る", `${Math.round(after1)} → ${Math.round(rested)}`);

  const base1 = s0.stats[key];
  st.tickPractice("senshu", 60, undefined, st.practicingNow(SLOTS[3].start + 10, "senshu"));
  const gain2 = s0.stats[key] - base1;
  ok(gain2 > 0, "2コマ目も伸びる（練習を増やす意味はある）", `+${gain2.toFixed(2)}`);
  ok(s0.energy < rested, "2コマ目でまた体力が減る", `${Math.round(rested)} → ${Math.round(s0.energy)}`);
  ok(
    gain2 < gain1,
    "2コマ目の伸びは1コマ目より小さい（疲れているぶん）",
    `1コマ目 +${gain1.toFixed(2)} / 2コマ目 +${gain2.toFixed(2)}`,
  );

  // 体力を使い切ると、それ以上は伸びない
  s0.energy = 0;
  const stuck = s0.stats.form;
  const stuckStroke = s0.strokeProf[st.planFor(s0).stroke];
  st.tickPractice("senshu", 120, undefined, [s0]);
  ok(s0.stats.form === stuck, "体力が尽きたら能力は伸びない");
  ok(s0.strokeProf[st.planFor(s0).stroke] === stuckStroke, "泳法の専門度も伸びない（＝休ませるしかない）");
}

// ------------------------------------------------------------------ 4b-1b. 専属コーチは廃止（2026-09-27）

head("4b-1b. 専属コーチは廃止（プロもクラスの監督が見る）");
{
  const st = newGame();
  const s = createStudent(rng(21), 950, "pro");
  s.personalCoachId = 1; // 古いセーブで指名していた子
  st.students.pro.push(s);
  const api = st as unknown as Record<string, unknown>;
  ok(api.setPersonalCoach === undefined && api.personalCoachOf === undefined, "専属コーチを付ける機能は無い");
}

// ------------------------------------------------------------------ 4b-2. コーチの掛け持ち禁止

head("4b-2. コーチは同じ時間に1つのプールだけ");
{
  const st = newGame();
  st.gems = 999999;
  while (st.expandLand().ok) st.gems = 999999; // 2本目のプールを置く場所を作る
  st.buyEquipment("pool6");
  withCoaches(st, 2);
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const [p1, p2] = st.placedPools();
  const slot = 3;
  const coach = st.coaches[0];

  // クラスは別（幼児／学童）にして、コーチの掛け持ちだけを試す
  st.setTimetableEntry(p1.id, slot, "youji", coach.id);
  const dup = st.setTimetableEntry(p2.id, slot, "gakudo", coach.id);
  ok(!dup.ok, "同じ時間・別のプールに同じコーチは入れられない", dup.reason ?? "");

  // 選択肢にも出てこない
  ok(
    !st.availableCoachesFor(slot, p2.id).some((c) => c.id === coach.id),
    "その時間ふさがっているコーチは候補に出ない",
  );
  // 時間が違えば同じコーチでよい
  const other = st.setTimetableEntry(p2.id, slot + 1, "gakudo", coach.id);
  ok(other.ok, "時間が違えば同じコーチを担当にできる", other.reason ?? "");

  // 別のコーチなら並行して開講できる
  const coach2 = st.coaches.find((c) => c.id !== coach.id)!;
  const ok2 = st.setTimetableEntry(p2.id, slot, "gakudo", coach2.id);
  ok(ok2.ok, "別のコーチなら同じ時間に2本目を開講できる", ok2.reason ?? "");
  ok(st.runningLessons(SLOTS[slot].start + 10).length === 2, "2本とも走る", "2コマ");

  // 直接データを壊した場合（古いセーブなど）は、開講できない扱いにして自動で直す
  const e2 = st.timetableEntryAt(p2.id, slot)!;
  e2.coachId = coach.id; // わざと掛け持ちさせる
  const status = st.timetableStatus(e2);
  ok(!status.ok, "掛け持ちしているコマは開講できない", status.reason ?? "");
  ok(st.runningLessons(SLOTS[slot].start + 10).length === 1, "走るのは1本だけになる");
  const fixed = st.resolveCoachConflicts();
  ok(fixed === 1, "掛け持ちを1件外した", `${fixed}件`);
  ok(st.timetableEntryAt(p2.id, slot)?.coachId == null, "外された枠は担当なしに戻る");

  // 同じ時間に同じコーチが2箇所に立つことは、どの時刻でも起こらない
  let clash = 0;
  st.syncTimetable(); // おまかせで埋め直す
  for (let m = 0; m < 24 * 60; m += 10) {
    const seen = new Set<number>();
    for (const e of st.runningLessons(m)) {
      if (e.coachId == null) continue;
      if (seen.has(e.coachId)) clash++;
      seen.add(e.coachId);
    }
  }
  ok(clash === 0, "1日じゅう、同じコーチが2箇所に立つことはない", `${clash}件`);
}

// ------------------------------------------------------------------ 4b-2b. 職員の道順

head("4b-2b. 職員の道順（繋がっている部屋どうしは必ず行ける）");
{
  // moveRoute は「道が繋がっていなければ null」を返す（壁を突っ切らせないため）。
  // ここが甘いと、**普通に建てた施設でコーチが1歩も動かなくなる**ので、
  // 「道が繋がっている部屋（usableEquipment）どうしは必ず行ける」ことを確かめる。
  const st = newGame(7);
  st.gems = 9_999_999;
  while (st.expandLand().ok) st.gems = 9_999_999;
  for (const kind of ["coachroom", "pool6", "pool8", "gym", "studio", "shop", "meeting"] as const) {
    st.buyEquipment(kind);
    st.gems = 9_999_999;
  }
  const map = st.map();
  const usable = st.usableEquipment();
  ok(usable.length >= 3, "道が繋がっている部屋が3つ以上ある", `${usable.length}個`);
  let unreachable = 0;
  let pairs = 0;
  for (const a of usable) {
    for (const b of usable) {
      if (a.id === b.id) continue;
      pairs++;
      if (!moveRoute(map, a, b, { gx: 0, gy: 0 })) unreachable++;
    }
  }
  ok(unreachable === 0, "繋がっている部屋どうしは必ず道順が引ける", `${pairs}通り中 ${unreachable}件が不通`);

  // プールへは「プールサイド側の出入口」から入る（水の上を横切らせない）
  const coachroom = usable.find((e) => e.kind === "coachroom");
  const pool = usable.find((e) => isPool(e.kind));
  if (coachroom && pool) {
    const road = moveRoute(map, coachroom, pool, { gx: 0, gy: 0 }) ?? [];
    const inWater = road.filter((c) => {
      const r = st.roomAtCell(Math.round(c.gx), Math.round(c.gy));
      // 回したプールでも同じ判定になるよう、プールの向きに合わせて水の上かを見る
      return r != null && isPool(r.kind) && isOverPoolWater(r, { gx: Math.round(c.gx), gy: Math.round(c.gy) });
    });
    ok(inWater.length === 0, "コーチ室 → プールの道順が水の上を通らない", `${inWater.length}マス`);
  }
}

// ------------------------------------------------------------------ 4b-3. コーチがプールへ出動する

head("4b-3. コーチの出動（担当替えで歩き直すか）");
{
  // StaffPerson は Phaser を型としてしか使っていないので、偽のシーンで動かせる
  const sprite = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    displayHeight: 80,
    setOrigin: () => sprite,
    setScale: () => sprite,
    setInteractive: () => sprite,
    setPosition: () => sprite,
    setRotation: () => sprite,
    setDepth: () => sprite,
    setFlipX: () => sprite,
    setAlpha: () => sprite,
    setVisible: () => sprite,
    setTexture: () => sprite,
    on: () => sprite,
    destroy: () => undefined,
    // コーチは Sprite（アニメーション）になったので、その受け皿も用意する。
    // 歩きのコマ送りは「歩いた距離」で選ぶので、コマを差し替える口も要る（→ iso/walkCycle.ts）
    anims: {
      isPlaying: false,
      isPaused: false,
      currentAnim: null,
      currentFrame: null,
      stop: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      setCurrentFrame: () => undefined,
    },
    play: () => sprite,
  };
  // 接地影（→ gfx/groundShadow.ts）を作るので、テクスチャの有無も答えられるようにする
  const scene = {
    add: { image: () => sprite, sprite: () => sprite },
    textures: { exists: () => true },
  } as never;
  const world = { add: () => undefined } as never;

  const home = { gx: 2, gy: 2 };
  const p = new StaffPerson(scene, world, "coach", "st_coach0", home);
  ok(p.currentTask === "room", "はじめはコーチ室で待機");

  const poolA = { gx: 10, gy: 5 };
  const poolB = { gx: 20, gy: 5 };

  // プール①へ出動
  p.goCoaching([home, poolA], poolA);
  ok(p.currentTask === "toPool", "担当コマになるとプールへ向かう");
  for (let i = 0; i < 300; i++) p.update(0.1, i * 0.1);
  ok(p.currentTask === "coaching", "着いたら指導を始める");
  ok(p.destination?.gx === poolA.gx, "プール①に立っている", `gx=${p.destination?.gx}`);

  // 同じプールへの再指示では歩き直さない（毎フレーム経路を引き直さないため）
  p.goCoaching([poolA, poolA], poolA);
  ok(p.currentTask === "coaching", "同じプールなら動かない");

  // ★本題：担当が別のプールに変わったら歩き直す
  p.goCoaching([poolA, poolB], poolB);
  ok(p.currentTask === "toPool", "担当が変わったら歩き出す（前のプールに居座らない）");
  for (let i = 0; i < 300; i++) p.update(0.1, i * 0.1);
  ok(p.destination?.gx === poolB.gx, "プール②へ移った", `gx=${p.destination?.gx}`);

  // 担当が終わればコーチ室へ帰る
  p.goHome([poolB, home]);
  ok(p.currentTask === "toRoom", "担当が終わるとコーチ室へ帰る");
  for (let i = 0; i < 300; i++) p.update(0.1, i * 0.1);
  ok(p.currentTask === "room", "コーチ室に着いた");
}

// ------------------------------------------------------------------ 4b-4. 昇格の下限学年とリハビリ

head("4b-4. 昇格の下限学年（プロは高校卒業から）");
{
  const st = newGame();
  st.gems = 999999;
  const kid = createStudent(rng(3), 700, "gakudo");
  kid.grade = "小1";
  st.students.gakudo.push(kid);

  // 育成B・育成A・選手は小1から上げられる（見込みがあれば早くから）
  ok(st.promoteStudent(kid).ok, "小1でも育成Bに上がれる");
  ok(st.promoteStudent(kid).ok, "小1でも育成Aに上がれる");
  ok(st.promoteStudent(kid).ok, "小1でも選手に上がれる");
  const tooEarly = st.promoteStudent(kid);
  ok(!tooEarly.ok, "小1ではプロに上がれない（高校卒業から）", tooEarly.reason ?? "");
  kid.grade = "高3";
  ok(!st.promoteStudent(kid).ok, "高3でもまだプロに上がれない");
  kid.grade = "大1";
  ok(st.promoteStudent(kid).ok, "高校を出たらプロに上がれる");
  ok(kid.classId === "pro", "プロまで上がった");
}

head("4b-5. クリニックで受診・リハビリ");
{
  const st = newGame();
  st.gems = 999999;
  const s = createStudent(rng(9), 710, "senshu");
  s.grade = "高1";
  st.students.senshu.push(s);
  s.injuryDays = 30;

  ok(st.rehabCapacity() === 0, "クリニックが無ければ受診できない枠は0");
  const noRoom = st.canRehab(s);
  ok(!noRoom.ok, "クリニックが無いと受診できない", noRoom.reason ?? "");

  ok(st.buyEquipment("clinic").ok, "クリニックを建てられる");
  ok(st.rehabCapacity() === INJURY.rehab.perRoom, `1部屋で${INJURY.rehab.perRoom}人まで`, `${st.rehabCapacity()}人`);

  ok(st.startRehab(s).ok, "ケガをした選手を受診させられる");
  ok(s.inRehab, "リハビリ中になる");
  ok(st.rehabUsed() === 1, "枠を1つ使う");

  // リハビリ中は練習に来ない
  const inLesson = st.lineupAt(SLOTS[5].start + 10).flatMap((l) => l.members.map((m) => m.id));
  ok(!inLesson.includes(s.id), "リハビリ中は練習に出てこない");

  // 治りが速い
  const other = createStudent(rng(10), 711, "senshu");
  other.grade = "高1";
  other.injuryDays = 30;
  st.students.senshu.push(other);
  const before = { rehab: s.injuryDays, plain: other.injuryDays };
  st.onDayRoll();
  const healRehab = before.rehab - s.injuryDays;
  const healPlain = before.plain - other.injuryDays;
  ok(healRehab > healPlain, "リハビリすると治りが速い", `${healRehab.toFixed(1)}日 vs ${healPlain.toFixed(1)}日`);

  // 部屋を増やすと同時に診られる人数が増える
  st.buyEquipment("clinic");
  ok(st.rehabCapacity() === INJURY.rehab.perRoom * 2, "部屋を増やすと枠も増える", `${st.rehabCapacity()}人`);

  // 満員なら断る
  const many: typeof s[] = [];
  for (let i = 0; i < 8; i++) {
    const x = createStudent(rng(20 + i), 720 + i, "senshu");
    x.grade = "高1";
    x.injuryDays = 20;
    st.students.senshu.push(x);
    many.push(x);
    st.startRehab(x);
  }
  const full = st.canRehab(many[many.length - 1]);
  ok(st.rehabUsed() <= st.rehabCapacity(), "枠を超えて受診させられない", `${st.rehabUsed()}/${st.rehabCapacity()}`);
  void full;

  // 治りきったらリハビリは自動で終わる
  s.injuryDays = 1;
  st.onDayRoll();
  ok(s.injuryDays === 0 && !s.inRehab, "治ったらリハビリが終わって枠が空く");
}

// ------------------------------------------------------------------ 4b-5b. コマを足しても顔ぶれが動かない

head("4b-5b. コマを足しても、今いる子は動かない");
{
  const st = newGame();
  st.gems = 999999;
  while (st.expandLand().ok) st.gems = 999999; // 2本目のプールを置く場所を作る
  st.buyEquipment("pool6");
  // 時間割を空にしてから、こちらの意図した順にコマを作る
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const [p1, p2] = st.placedPools();
  st.students.youji.length = 0;
  for (let i = 0; i < 40; i++) st.students.youji.push(createStudent(rng(200 + i), 4000 + i, "youji"));

  const slot = 3;
  st.setTimetableEntry(p1.id, slot, "youji", st.coaches[0].id);
  const idsAt = (poolId: number, sl: number) =>
    (st.rosterAssignment().get(`${poolId}:${sl}`) ?? []).map((s) => s.id);

  const before = idsAt(p1.id, slot);
  ok(before.length === 40, "はじめは1コマ目に40人ぜんぶ", `${before.length}人`);

  // ① 別のプール・別の時間にコマを足す（同じクラスは同じ時間に2つ入れられない）
  const free = st.coaches.find((c) => !st.timetable.some((e) => e.slot === slot + 1 && e.coachId === c.id));
  st.setTimetableEntry(p2.id, slot + 1, "youji", free!.id);
  ok(
    idsAt(p1.id, slot).join(",") === before.join(","),
    "2コマ目を足しても、1コマ目の顔ぶれは変わらない",
    `${idsAt(p1.id, slot).length}人`,
  );
  ok(idsAt(p2.id, slot + 1).length === 0, "あふれていないので2コマ目は空", `${idsAt(p2.id, slot + 1).length}人`);

  // ② もっと早い時間にコマを足しても動かない（ここが今回のバグ）
  st.setTimetableEntry(p2.id, 1, "youji", (st.coaches[1] ?? st.coaches[0]).id);
  ok(
    idsAt(p1.id, slot).join(",") === before.join(","),
    "早い時間にコマを足しても、今いる子は移動しない",
    `${idsAt(p1.id, slot).length}人`,
  );
  ok(idsAt(p2.id, 1).length === 0, "新しく足したコマにはあふれたぶんだけ入る", `${idsAt(p2.id, 1).length}人`);

  // ③ あふれていれば、新しいコマに入る
  for (let i = 40; i < 75; i++) st.students.youji.push(createStudent(rng(200 + i), 4000 + i, "youji"));
  const first = idsAt(p1.id, slot);
  ok(first.length === 60, "1コマ目は練習枠まで埋まる", `${first.length}人`);
  ok(
    idsAt(p2.id, slot + 1).length + idsAt(p2.id, 1).length === 15,
    "あふれた15人が新しいコマへ",
    `${idsAt(p2.id, slot).length} + ${idsAt(p2.id, 1).length}人`,
  );

  // ④ 担当コーチを変えただけでも顔ぶれは動かない
  const other = st.coaches.find((c) => !st.timetable.some((e) => e.slot === slot && e.coachId === c.id));
  if (other) st.setTimetableEntry(p1.id, slot, "youji", other.id);
  ok(
    idsAt(p1.id, slot).join(",") === first.join(","),
    "コーチを変えても顔ぶれは動かない",
    `${idsAt(p1.id, slot).length}人`,
  );
}

head("4b-5c. 監督は時間割から自動で決まる／掛け持ちのコスト");
{
  const st = withCoaches(newGame(), 2);
  st.gems = 999999;
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const pool = st.placedPools()[0];
  const a = st.coaches[0];
  const b = st.coaches[1];

  st.setTimetableEntry(pool.id, 1, "youji", a.id);
  st.setTimetableEntry(pool.id, 2, "youji", a.id);
  st.setTimetableEntry(pool.id, 3, "youji", b.id);
  ok(st.headCoachOf("youji")?.id === a.id, "いちばん多く見ている人が監督になる", st.headCoachOf("youji")?.name ?? "-");

  // 担当を入れ替えると監督も入れ替わる
  st.setTimetableEntry(pool.id, 1, "youji", b.id);
  st.setTimetableEntry(pool.id, 2, "youji", b.id);
  st.setTimetableEntry(pool.id, 3, "youji", b.id);
  ok(st.headCoachOf("youji")?.id === b.id, "担当を移すと監督も移る", st.headCoachOf("youji")?.name ?? "-");
  ok(a.assigned === null, "外れた人は監督ではなくなる");

  // 格が高いほど掛け持ちが高くつく
  const rookie = { ...a, quality: 1, assigned: null };
  const legend = { ...a, quality: 5, assigned: null };
  const rookieUp = coachSalary(rookie, 3) / coachSalary(rookie, 0);
  const legendUp = coachSalary(legend, 3) / coachSalary(legend, 0);
  ok(
    legendUp > rookieUp * 1.5,
    "格が高いほど掛け持ちの割増が大きい",
    `見習い ×${rookieUp.toFixed(2)} / レジェンド ×${legendUp.toFixed(2)}`,
  );
  ok(
    coachSalary(legend, 3) > coachSalary(rookie, 3) * 8,
    "レジェンドに3コマ持たせるとかなり高い",
    `◆${coachSalary(rookie, 3)} vs ◆${coachSalary(legend, 3)}`,
  );
}

// ------------------------------------------------------------------ 4b-6. 寮・給料・スタイル1

head("4b-6. アスリート寮（高校生以上・1棟12人・ポッド）");
{
  const st = newGame();
  readyForBigFacility(st); // 寮は大型施設（◆100万）になった（2026-09-18）
  ok(DORM.capacityPerRoom === 12, "1棟のポッドは12人ぶん", `${DORM.capacityPerRoom}`);
  ok(st.buyEquipment("dorm").ok, "アスリート寮を建てられる");
  ok(st.dormCapacity() === DORM.capacityPerRoom, "アスリート寮1棟で12人", `${st.dormCapacity()}人`);

  const mid = createStudent(rng(51), 810, "ikuseiA");
  mid.grade = "中2";
  st.students.ikuseiA.push(mid);
  const no = st.enterDorm(mid);
  ok(!no.ok, "中学生は入寮できない", no.reason ?? "");
  ok(!st.dormEligible(mid), "候補にも入らない");

  const hi = createStudent(rng(52), 811, "senshu");
  hi.grade = "高2";
  st.students.senshu.push(hi);
  ok(st.dormEligible(hi), "高校生は入寮できる");
  ok(st.enterDorm(hi).ok, "入寮できた");
  ok(st.dormCandidates().every((s) => s.id !== hi.id), "入寮済みは候補から外れる");

  // スリープポッドが定員の半分ぶん描かれている（1基＝2段＝2人ぶん → gfx/bigFacility.ts）
  const pods = fittingsOf(st.map()).filter((f) => f.texture === "fnSleepPod");
  ok(pods.length === DORM.capacityPerRoom / 2, "ポッドが定員の半分ぶん置かれる（1基2人）", `${pods.length}基`);

  // 定員まで入れたら満室（すでに1人入っているので、残りぶん入れる）
  for (let i = 0; i < DORM.capacityPerRoom; i++) {
    const x = createStudent(rng(60 + i), 820 + i, "senshu");
    x.grade = "高3";
    st.students.senshu.push(x);
    st.enterDorm(x);
  }
  ok(st.dormFree() === 0, "定員で満室", `${st.dormResidents().length}/${st.dormCapacity()}`);
}

head("4b-7. コーチの給料は担当コマ数で上がる");
{
  const st = newGame();
  st.gems = 999999;
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const c = st.coaches[0];
  c.assigned = null;
  const pool = st.placedPools()[0];

  const base = coachSalary(c, st.coachDutyCount(c.id));
  st.setTimetableEntry(pool.id, 1, "youji", c.id);
  const one = coachSalary(c, st.coachDutyCount(c.id));
  st.setTimetableEntry(pool.id, 2, "gakudo", c.id);
  const two = coachSalary(c, st.coachDutyCount(c.id));

  ok(one > base, "1コマ持たせると給料が上がる", `◆${base} → ◆${one}`);
  ok(two > one, "2コマ目でさらに上がる", `◆${one} → ◆${two}`);
  ok(st.coachDutyCount(c.id) === 2, "担当コマ数を数えられる");
}

head("4b-8. 全体練習のスタイル1（各自の得意種目）");
{
  const st = newGame();
  const a = createStudent(rng(71), 830, "senshu");
  const b = createStudent(rng(72), 831, "senshu");
  a.fav = { stroke: "breast", distance: 100 };
  b.fav = { stroke: "fly", distance: 200 };
  a.planMode = "class";
  b.planMode = "class";
  st.students.senshu.push(a, b);

  st.setClassPlan("senshu", { ability: "speed", stroke: OWN_STYLE });
  const planA = st.planFor(a);
  const planB = st.planFor(b);
  ok(planA.ability === "speed" && planB.ability === "speed", "能力の指定は全員共通（スピード）");
  ok(planA.stroke === "breast", "平泳ぎが得意な子は平泳ぎを泳ぐ", planA.stroke);
  ok(planB.stroke === "fly", "バタフライが得意な子はバタフライを泳ぐ", planB.stroke);

  // 実際にその泳法の専門度が伸びる
  const before = { a: a.strokeProf.breast, b: b.strokeProf.fly };
  st.tickPractice("senshu", 60, undefined, [a, b]);
  ok(a.strokeProf.breast > before.a, "得意泳法の専門度が伸びる（平泳ぎ）");
  ok(b.strokeProf.fly > before.b, "得意泳法の専門度が伸びる（バタフライ）");

  // ふつうの泳法指定はこれまでどおり全員そろう
  st.setClassPlan("senshu", { stroke: "free" });
  ok(st.planFor(a).stroke === "free" && st.planFor(b).stroke === "free", "泳法を指定すれば全員そろう");
}

head("4b-9. 能力が上がるほど伸びにくい（経験値は才能と成長タイプで決まる）");
{
  const st = newGame();
  // 同じ子でも、能力が高いほど1回の伸びは小さい
  const low = createStudent(rng(81), 840, "senshu");
  const high = createStudent(rng(81), 841, "senshu");
  for (const s of [low, high]) {
    s.grade = "高1";
    s.talent = { speed: 1, stamina: 1, form: 1, start: 1, turn: 1 };
    s.growthType = "normal";
    s.planMode = "self";
    s.plan = { ability: "form", stroke: "free" };
  }
  for (const k of STAT_KEYS) low.stats[k] = 30;
  for (const k of STAT_KEYS) high.stats[k] = 80;
  st.students.senshu.push(low, high);
  const b1 = low.stats.form;
  const b2 = high.stats.form;
  st.tickPractice("senshu", 20, undefined, [low, high]);
  const gLow = low.stats.form - b1;
  const gHigh = high.stats.form - b2;
  ok(gLow > gHigh * 2, "能力が高いほど同じ練習で伸びない", `能力30 +${gLow.toFixed(3)} / 能力80 +${gHigh.toFixed(3)}`);

  // 才能が高いほどよく伸びる
  const dull = createStudent(rng(91), 850, "senshu");
  const gifted = createStudent(rng(91), 851, "senshu");
  for (const s of [dull, gifted]) {
    s.grade = "高1";
    s.growthType = "normal";
    s.planMode = "self";
    s.plan = { ability: "form", stroke: "free" };
    for (const k of STAT_KEYS) s.stats[k] = 40;
  }
  dull.talent = { speed: 0.6, stamina: 0.6, form: 0.6, start: 0.6, turn: 0.6 };
  gifted.talent = { speed: 1.6, stamina: 1.6, form: 1.6, start: 1.6, turn: 1.6 };
  st.students.senshu.push(dull, gifted);
  const d0 = dull.stats.form;
  const g0 = gifted.stats.form;
  st.tickPractice("senshu", 20, undefined, [dull, gifted]);
  ok(
    gifted.stats.form - g0 > (dull.stats.form - d0) * 2,
    "才能が高いほどよく伸びる",
    `才能0.6 +${(dull.stats.form - d0).toFixed(3)} / 才能1.6 +${(gifted.stats.form - g0).toFixed(3)}`,
  );

  // 成長タイプ×年代でも変わる（晩成は高校で伸びる）
  const early = createStudent(rng(95), 860, "senshu");
  const late = createStudent(rng(95), 861, "senshu");
  for (const s of [early, late]) {
    s.grade = "高1";
    s.planMode = "self";
    s.plan = { ability: "form", stroke: "free" };
    s.talent = { speed: 1, stamina: 1, form: 1, start: 1, turn: 1 };
    for (const k of STAT_KEYS) s.stats[k] = 40;
  }
  early.growthType = "superEarly";
  late.growthType = "late";
  st.students.senshu.push(early, late);
  const e0 = early.stats.form;
  const l0 = late.stats.form;
  st.tickPractice("senshu", 20, undefined, [early, late]);
  ok(
    late.stats.form - l0 > early.stats.form - e0,
    "高校生では晩成型のほうが伸びる（成長タイプが効く）",
    `超早熟 +${(early.stats.form - e0).toFixed(3)} / 晩成 +${(late.stats.form - l0).toFixed(3)}`,
  );
}

// ------------------------------------------------------------------ 4c. 育成〜プロの定員は固定

head("4c. 育成〜プロの定員（固定。プールを増やしても変わらない）");
{
  const st = newGame();
  st.gems = 999999;
  const base = {
    ikuseiB: st.capacityOf("ikuseiB"),
    ikuseiA: st.capacityOf("ikuseiA"),
    senshu: st.capacityOf("senshu"),
    pro: st.capacityOf("pro"),
  };
  ok(base.ikuseiB === 24 && base.ikuseiA === 24, "育成B24・育成A24", `${base.ikuseiB} / ${base.ikuseiA}`);
  ok(base.senshu === 18 && base.pro === 8, "選手18・プロ8", `${base.senshu} / ${base.pro}`);

  // プールを何本足しても定員は増えない（＝勝手に増える不具合の再発防止）
  while (st.expandLand().ok) st.gems = 999999;
  st.buyEquipment("pool6");
  st.buyEquipment("pool8");
  ok(
    st.capacityOf("ikuseiB") === 24 &&
      st.capacityOf("ikuseiA") === 24 &&
      st.capacityOf("senshu") === 18 &&
      st.capacityOf("pro") === 8,
    "プールを3本にしても定員は変わらない",
    `${st.capacityOf("ikuseiB")}/${st.capacityOf("ikuseiA")}/${st.capacityOf("senshu")}/${st.capacityOf("pro")}`,
  );

  // 倉庫にしまっても変わらない
  const stored = st.storeRoom(st.placedPools()[1]);
  ok(stored.ok, "プールを倉庫へ戻せる", stored.reason ?? "");
  ok(st.capacityOf("ikuseiB") === 24, "しまっても定員は24のまま", `${st.capacityOf("ikuseiB")}人`);

  // プールが1本も無くても定員は変わらない
  const bare = newGame();
  for (const p of [...bare.placedPools()]) bare.storeRoom(p);
  ok(bare.capacityOf("ikuseiB") === 24, "プールが無くても定員は24", `${bare.capacityOf("ikuseiB")}人`);
}

// ------------------------------------------------------------------ 5. 幼児・学童の定員（コマ数で増える）

head("5. スクールのクラス枠と定員");
{
  const st = newGame();
  st.gems = 999999;
  const base = st.capacityOf("youji");
  ok(base > 0, "幼児の定員がある（初期の時間割に幼児のコマがある）", `${base}人`);

  const slots0 = st.slotCountFor("youji");
  // 空きコマに幼児をもう1枠足す（2本目のプールを建てて枠を作る）
  st.buyEquipment("pool6");
  const pool = st.placedPools()[1] ?? st.placedPools()[0];
  const freeSlot = SLOTS.findIndex((_, i) => !st.timetableEntryAt(pool.id, i));
  const coach = st.coaches.find((c) => !st.timetable.some((e) => e.slot === freeSlot && e.coachId === c.id));
  ok(freeSlot >= 0 && !!coach, "空きコマと空いているコーチがある");
  if (freeSlot >= 0 && coach) {
    st.setTimetableEntry(pool.id, freeSlot, "youji", coach.id);
    ok(st.slotCountFor("youji") === slots0 + 1, "幼児のコマを1つ増やせた");
    ok(st.capacityOf("youji") > base, "コマを増やすと定員が増える", `${base} → ${st.capacityOf("youji")}人`);
  }

  // コーチを外すと開講できない＝定員に数えない
  const capWith = st.capacityOf("youji");
  for (const e of st.timetable) if (e.classId === "youji") e.coachId = null;
  ok(st.capacityOf("youji") === 0, "担当コーチが居ないコマは定員に数えない", `${capWith} → 0`);
}

// ------------------------------------------------------------------ 6. 一般客

head("6. 一般客（空きコマの収入）");
{
  const st = newGame();
  st.gems = 1000;
  st.popularity = 400;
  const clock = new GameClock();

  // 空きコマを探す（レッスンが入っていない時間）
  let openSlot = -1;
  for (let i = 0; i < SLOTS.length; i++) {
    if (st.timetable.every((e) => e.slot !== i)) openSlot = i;
  }
  ok(openSlot >= 0, "レッスンの入っていない空きコマがある");
  clock.minuteOfDay = SLOTS[Math.max(0, openSlot)].start + 5;

  const rooms = st.guestRoomsNow(clock.minuteOfDay);
  ok(rooms.length > 0, "空きコマの部屋が一般開放される", `${rooms.length}か所`);
  ok(rooms.every((r) => r.reachable), "道が繋がっているので使える");

  const gemsBefore = st.gems;
  let arrivals = 0;
  for (let i = 0; i < 40; i++) arrivals += st.tickGuests(clock.minuteOfDay, 5).length;
  ok(arrivals > 0, "一般客が来場する", `${arrivals}人`);
  ok(st.gems > gemsBefore, "利用料が収入になる", `◆${gemsBefore} → ◆${st.gems}`);
  ok(st.guestMonth.served > 0, "月次の集計に入る", `${st.guestMonth.served}人`);

  // レッスン中のプールは開放しない
  const busy = st.timetable[0];
  const busyMin = SLOTS[busy.slot].start + 5;
  const openWhileClass = st.guestRoomsNow(busyMin).some((r) => r.room.id === busy.poolId);
  ok(!openWhileClass, "レッスン中のプールは一般開放されない");

  // 入口が無いと辿り着けずに帰る
  const st2 = newGame();
  st2.popularity = 400;
  const gate2 = st2.equipment.find((e) => e.kind === "entrance")!;
  st2.storeRoom(gate2);
  const g2 = st2.gems;
  let turned = 0;
  for (let i = 0; i < 40; i++) {
    for (const a of st2.tickGuests(clock.minuteOfDay, 5)) if (a.turnedAway) turned++;
  }
  ok(turned > 0, "道が繋がっていないと客は使えずに帰る", `${turned}人`);
  ok(st2.gems === g2, "帰った客は料金を落とさない");
}

// ------------------------------------------------------------------ 7. 寮

head("7. アスリート寮（回復と熟練度）");
{
  const st = newGame();
  readyForBigFacility(st);
  ok(st.dormCapacity() === 0, "最初は寮が無い");

  const dorm = st.buyEquipment("dorm");
  ok(dorm.ok && dorm.placed, "寮を建てて配置できる");
  ok(st.dormCapacity() === DORM.capacityPerRoom, "寮1棟ぶんの収容人数", `${st.dormCapacity()}人`);

  ok(st.dormFree() === DORM.capacityPerRoom, "建てた直後は全部屋が空いている", `${st.dormFree()}人`);

  // 入寮すると回復が速い
  const a = createStudent(rng(7), 901, "senshu");
  const b = createStudent(rng(7), 902, "senshu");
  b.inDorm = true;
  a.energy = 10;
  b.energy = 10;
  a.condition = 30;
  b.condition = 30;
  a.recoveryNeed = 50;
  b.recoveryNeed = 50;
  st.students.senshu.push(a, b);
  st.onDayRoll();
  ok(b.condition > a.condition, "入寮した選手はコンディションの戻りが速い", `${a.condition.toFixed(1)} vs ${b.condition.toFixed(1)}`);
  ok(b.recoveryNeed < a.recoveryNeed, "疲れも抜けやすい", `${a.recoveryNeed.toFixed(1)} vs ${b.recoveryNeed.toFixed(1)}`);

  // 日中の休養：寮の選手のほうが体力の戻りが大きい
  a.energy = 10;
  b.energy = 10;
  st.restStudent(a);
  st.restStudent(b);
  st.tickPractice("senshu", 40);
  ok(b.energy > a.energy, "休養中の体力の戻りも速い", `${a.energy.toFixed(1)} vs ${b.energy.toFixed(1)}`);
  st.cancelRestOf(a);
  st.cancelRestOf(b);

  // 定員を超えたら退寮
  const dormRoom = placedRooms(st.map()).find((e) => e.kind === "dorm")!;
  for (let i = 0; i < DORM.capacityPerRoom; i++) {
    const s = createStudent(rng(20 + i), 950 + i, "senshu");
    st.students.senshu.push(s);
    st.enterDorm(s);
  }
  const before = st.dormResidents().length;
  st.sellEquipment(dormRoom);
  ok(st.dormResidents().length === 0, "寮を撤去すると全員が退寮する", `${before} → 0`);
}

// ------------------------------------------------------------------ 8. 幼少期のフォームと将来性

head("8. 幼少期のフォームと将来性");
{
  ok(YOUTH_FORM.stages.includes("preschool"), "幼児期が対象ステージに入っている");

  // 幼少期のうちはフォームが記録される
  const kid = createStudent(rng(3), 1001, "youji");
  kid.stats.form = 20;
  applyTraining(kid, "form", { rand: rng(4) });
  ok(kid.youthForm >= 20, "幼少期のフォームが記録される", `${kid.youthForm.toFixed(1)}`);
  ok(Math.abs(youthPotential(kid) - 1) < 1e-9, "幼少期のあいだは将来性の倍率は掛からない（二重取りしない）");

  // 幼少期に高いフォームを作った子は、中学以降の伸びが良い
  const good = createStudent(rng(5), 1002, "senshu");
  const poor = createStudent(rng(5), 1003, "senshu");
  good.grade = "中1";
  poor.grade = "中1";
  good.youthForm = YOUTH_FORM.baseline + 30;
  poor.youthForm = YOUTH_FORM.baseline;
  ok(youthPotential(good) > youthPotential(poor), "幼少期フォームが高いほど将来性の倍率が大きい",
    `${youthPotential(good).toFixed(3)} vs ${youthPotential(poor).toFixed(3)}`);
  ok(youthPotential(good) <= YOUTH_FORM.maxMult + 1e-9, "上限を超えない");

  // 同じ条件で練習させると伸びに差が出る
  const g2 = { ...good, stats: { ...good.stats }, talent: { ...good.talent }, streak: { ...good.streak }, trainCount: { ...good.trainCount } };
  const p2 = { ...poor, stats: { ...poor.stats }, talent: { ...poor.talent }, streak: { ...poor.streak }, trainCount: { ...poor.trainCount } };
  p2.talent = { ...g2.talent }; // 才能を揃えて将来性の差だけを見る
  p2.stats = { ...g2.stats };
  p2.energy = g2.energy;
  p2.condition = g2.condition;
  const rg = applyTraining(g2, "speed", { rand: rng(9) });
  const rp = applyTraining(p2, "speed", { rand: rng(9) });
  ok(rg.delta.speed > rp.delta.speed, "実際の練習でも伸びが大きい",
    `+${rg.delta.speed.toFixed(3)} vs +${rp.delta.speed.toFixed(3)}`);

  // コーチの見抜く力でヒントが出る
  const promising = createStudent(rng(11), 1004, "youji");
  promising.youthForm = YOUTH_FORM.baseline + 26;
  ok(youthPotentialHint(promising, 1) === null, "質の低いコーチには将来性が分からない");
  const hint = youthPotentialHint(promising, 5);
  ok(hint !== null && hint !== YOUTH_FORM.hintTiers[0], "質の高いコーチは見どころを言い当てる", hint ?? "");
  const senshu = createStudent(rng(12), 1005, "senshu");
  ok(youthPotentialHint(senshu, 5) === null, "幼少期を過ぎた選手にはヒントを出さない");
}

// ------------------------------------------------------------------ 9. 導線の良し悪しが効率に効く

head("9. 導線の良さ");
{
  ok(routeEfficiency(0) === 1, "入口のすぐそばなら効率1.0");
  ok(routeEfficiency(200) < 1, "遠いほど効率が落ちる", `${routeEfficiency(200).toFixed(3)}`);
  ok(routeEfficiency(9999) >= 0.6, "下限より下がらない", `${routeEfficiency(9999).toFixed(3)}`);
  ok(routeEfficiency(-1) === 0, "行けない部屋は0");

  const st = newGame();
  ok(st.routeEfficiency() > 0.9, "初期配置の動線は良い", st.routeEfficiency().toFixed(3));
}

// ------------------------------------------------------------------ 10. セーブ（v9）

head(`10. セーブ v${SAVE_VERSION}`);
{
  ok(SAVE_VERSION === 32, "セーブバージョンが32（v32＝施設の値上げ・払った額・記録会のコーチとの出会い）", `${SAVE_VERSION}`);

  const st = newGame();
  readyForBigFacility(st);
  while (st.expandLand().ok) st.gems = 20_000_000; // 2本目のプールを置く土地を確保する
  st.buyEquipment("gym");
  st.buyEquipment("dorm");
  const pool2 = st.buyEquipment("pool6");
  st.setTimetableEntry(pool2.item!.id, 3, "ikuseiA", st.coaches[0].id);
  const clock = new GameClock();
  const save = buildSave(st, clock, 1000);

  ok(save.version === SAVE_VERSION, `v${SAVE_VERSION} で書き出せる`);
  ok(save.game.equipment.every((e) => "gx" in e && "gy" in e), "部屋の位置が保存される");
  ok(save.game.timetable.length > 0, "時間割が保存される", `${save.game.timetable.length}コマ`);

  const st2 = newGame(99);
  const clock2 = new GameClock();
  applySave(JSON.parse(JSON.stringify(save)), st2, clock2);
  ok(st2.equipment.length === st.equipment.length, "部屋の数が一致");
  const same = st2.equipment.every((e) => {
    const o = st.equipment.find((x) => x.id === e.id);
    return o && o.gx === e.gx && o.gy === e.gy;
  });
  ok(same, "部屋の位置が完全に復元される");
  ok(st2.timetable.length === st.timetable.length, "時間割が復元される");
  ok(st2.strandedRooms().length === st.strandedRooms().length, "ロード後も導線が同じ");
  ok(st2.capacityOf("youji") === st.capacityOf("youji"), "スクールの定員が一致", `${st2.capacityOf("youji")}人`);
  ok(
    st2.capacityOf("ikuseiB") === st.capacityOf("ikuseiB"),
    "育成の定員も一致（プールを先に復元してから在籍者を入れている）",
    `${st2.capacityOf("ikuseiB")}人`,
  );

  // 名簿が二重になっているセーブ（古い版のバグ）は、読み込むときに直す
  const dirty = JSON.parse(JSON.stringify(save));
  const first = dirty.game.students[0];
  dirty.game.students.push(JSON.parse(JSON.stringify(first)));
  const st3 = newGame(7);
  applySave(dirty, st3, new GameClock());
  const allIds = CLASS_ORDER.flatMap((c) => st3.students[c.id].map((s) => s.id));
  ok(allIds.length === new Set(allIds).size, "同じ人が2回入ったセーブを読んでも1人になる", `${allIds.length}人`);

  // 在籍者は1人も減らない（「タイトルへ戻るたびに人数が変わる」バグの再発防止）
  {
    const play = newGame(11);
    play.gems = 999999;
    // ふつうに遊んだ状態を作る：コーチを雇い、プールとコマを増やし、生徒を入れる
    for (const cand of play.generateRecruits()) play.hireCoach(cand);
    play.buyEquipment("pool6");
    const pools = play.placedPools();
    for (const pool of pools) {
      for (let slot = 0; slot < SLOTS.length; slot++) {
        const coach = play.availableCoachesFor(slot, pool.id)[0];
        if (!coach) break;
        play.setTimetableEntry(pool.id, slot, slot % 2 === 0 ? "youji" : "gakudo", coach.id);
      }
    }
    // **定員ぎりぎりまで**入れる。定員は時間割・コーチから毎回計算されるので、
    // 読み込みの途中で少しでも小さく見えると、ここの子が捨てられて人数が変わる。
    const capY = play.capacityOf("youji");
    const capG = play.capacityOf("gakudo");
    for (let i = 0; i < capY; i++) play.students.youji.push(createStudent(rng(300 + i), 3000 + i, "youji"));
    for (let i = 0; i < capG; i++) play.students.gakudo.push(createStudent(rng(400 + i), 10000 + i, "gakudo"));
    for (let i = 0; i < play.capacityOf("senshu"); i++) {
      play.students.senshu.push(createStudent(rng(500 + i), 20000 + i, "senshu"));
    }

    const before = play.totalMembers();
    // セーブ → ロード を3回くり返しても、1人も減らない・増えない
    let data = buildSave(play, new GameClock(), 0);
    const counts: number[] = [];
    for (let round = 0; round < 3; round++) {
      const loaded = newGame(99 + round);
      applySave(JSON.parse(JSON.stringify(data)), loaded, new GameClock());
      counts.push(loaded.totalMembers());
      data = buildSave(loaded, new GameClock(), 0);
    }
    ok(
      counts.every((n) => n === before),
      "タイトルへ戻って読み直しても在籍者が変わらない",
      `${before}人 → ${counts.join(" → ")}人`,
    );

    // コーチも時間割も保たれている（定員が縮まないこと）
    const loaded = newGame(7);
    applySave(JSON.parse(JSON.stringify(data)), loaded, new GameClock());
    ok(loaded.coaches.length === play.coaches.length, "コーチの人数が一致", `${loaded.coaches.length}人`);
    ok(
      loaded.capacityOf("youji") === play.capacityOf("youji"),
      "読み込み後もスクールの定員が同じ",
      `${play.capacityOf("youji")} → ${loaded.capacityOf("youji")}人`,
    );
    ok(
      loaded.activeTimetable().length === play.activeTimetable().length,
      "開講できているコマ数も同じ",
      `${play.activeTimetable().length}コマ`,
    );
  }

  // タイトルへ行って戻るだけでは人数が増えない
  // （自動イベントのタイマーが0のままだと、読み込んだ直後の1フレームで入会が起きる）
  {
    const play = newGame(21);
    play.gems = 999999;
    const clock = new GameClock();
    // 少し遊んで、自動イベントが動く状態にする
    const step = (st: GameState, ck: GameClock, ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        const res = ck.tick(CLOCK.msPerMinute * 5);
        if (res.minutesAdvanced > 0) st.pollAutoEvents(res.minutesAdvanced);
        if (res.dayRolled) {
          st.onDayRoll();
          if (res.weekToMonth) st.advanceMonth();
        }
      }
    };
    step(play, clock, 600);

    let data = buildSave(play, clock, 0);
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const loaded = newGame(500 + i);
      const ck = new GameClock();
      applySave(JSON.parse(JSON.stringify(data)), loaded, ck);
      step(loaded, ck, 3); // 画面を開いた直後の数フレームぶんだけ動かす
      counts.push(loaded.totalMembers());
      data = buildSave(loaded, ck, 0);
    }
    ok(
      counts.every((n) => n === counts[0]),
      "タイトルへ行って戻るだけでは人数が増えない",
      `${counts.join(" → ")}人`,
    );
  }

  // 同じセーブから始めれば、毎回まったく同じことが起きる
  // （乱数の状態を保存していないと、読み込むたびに入会する子のクラスなどが変わる
  //  ＝「セーブせずに戻るたびに名簿の内訳が違う」の原因になる）
  {
    const play = newGame(33);
    play.gems = 999999;
    const clock = new GameClock();
    const step = (st: GameState, ck: GameClock, ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        const res = ck.tick(CLOCK.msPerMinute * 5);
        if (res.minutesAdvanced > 0) st.pollAutoEvents(res.minutesAdvanced);
        if (res.dayRolled) {
          st.onDayRoll();
          if (res.weekToMonth) st.advanceMonth();
        }
      }
    };
    step(play, clock, 900);
    const data = buildSave(play, clock, 0);

    const results: string[] = [];
    for (let i = 0; i < 6; i++) {
      // 毎回ちがう種で GameState を作る（実機と同じ：時刻から種を作る）
      const loaded = newGame(700 + i * 37);
      const ck = new GameClock();
      applySave(JSON.parse(JSON.stringify(data)), loaded, ck);
      step(loaded, ck, 200);
      results.push(CLASS_ORDER.map((c) => `${c.id}:${loaded.students[c.id].length}`).join(" "));
    }
    ok(
      results.every((r) => r === results[0]),
      "同じセーブから始めれば、名簿の内訳まで毎回同じになる",
      results[0],
    );
  }

  // v10：専属コーチは廃止。古いセーブに指名が残っていても読み捨てる（2026-09-27）
  const st4 = newGame(5);
  st4.students.pro.push(createStudent(rng(41), 960, "pro"));
  const pro = st4.students.pro[0];
  pro.personalCoachId = st4.coaches[0].id;
  const saved4 = buildSave(st4, new GameClock(), 0);
  const st5 = newGame(6);
  applySave(JSON.parse(JSON.stringify(saved4)), st5, new GameClock());
  const back = st5.students.pro.find((s) => s.id === pro.id);
  ok(!!back && back.personalCoachId === null, "古い専属コーチの指名は読み捨てる", `${back?.personalCoachId}`);
}

// ------------------------------------------------------------------ 11. 古いセーブの移行（v8 → v9）

head("11. v8 → v10 の移行");
{
  // v8 相当の素データを作る（位置を持たない部屋の一覧）
  const v8 = {
    version: 8,
    savedAt: Date.now(),
    playTimeMs: 0,
    game: {
      clubName: "むかしのクラブ",
      popularity: 120,
      gems: 800,
      year: 2,
      month: 6,
      championships: 3,
      currentClassId: null,
      nextStudentId: 40,
      nextCoachId: 5,
      nextEquipmentId: 6,
      students: [
        {
          id: 1,
          name: "旧 せんしゅ",
          grade: "高1",
          gender: "m",
          classId: "senshu",
          tint: 0xffffff,
          stats: [40, 40, 40, 40, 40],
          talent: [1, 1, 1, 1, 1],
          trainCount: [0, 0, 0, 0, 0],
          streak: [0, 0, 0, 0, 0],
          strokeProf: [10, 0, 0, 0, 0],
          energy: 50,
          fav: { stroke: "free", distance: 100 },
          plan: { ability: "speed", stroke: "free" },
          practiceAccum: 0,
          growthType: "normal",
          growthObserved: 0,
          condition: 60,
          season: { year: 2, clearedStages: [], standards: [] },
          planMode: "self",
          restPending: 0,
          resting: false,
          recoveryNeed: 0,
          achievePoints: 100,
          bestTimeScore: 200,
          bestTimeSec: 55,
          bestTimeEvent: { stroke: "free", distance: 100 },
          rankTier: 3,
          wins: 1,
          injuryDays: 0,
          altitude: null,
        },
      ],
      coaches: [{ id: 1, name: "旧コーチ", quality: 3, assigned: "senshu", duty: "idle", specialty: "free" }],
      equipment: [
        { id: 1, kind: "pool6" },
        { id: 2, kind: "studio" },
        { id: 3, kind: "gym" },
      ],
      heldThisMonth: [],
      tutorialStep: -1,
      monthEnrolled: 0,
      monthTurnedAway: 0,
      items: { stretchMat: 2, dumbbell: 1 },
      classPlans: {},
      clubAchievement: 500,
      clubRankTier: 2,
      itemPlacements: {},
      research: null,
      doneResearch: [],
      staff: [],
      nextStaffId: 1,
      dayCount: 30,
      scoutBoost: 0,
    },
    clock: { minuteOfDay: 600, week: 2, speed: 1 },
  };

  const res = migrateSave(v8);
  ok(res.ok, "v8 のセーブを読める", res.ok ? "" : res.reason);
  if (res.ok) {
    ok(res.data.version === SAVE_VERSION, "最新バージョンに上がる", `v${res.data.version}`);
    const st = newGame(7);
    const clock = new GameClock();
    applySave(res.data, st, clock);

    ok(st.clubName === "むかしのクラブ", "クラブ名が保たれる");
    ok(st.championships === 3, "通算優勝が保たれる");
    ok(st.students.senshu.length === 1, "選手が復元される");
    ok(st.students.senshu[0].youthForm === 0, "幼少期フォームは記録なしで始まる（遡って足さない）");
    ok(st.students.senshu[0].inDorm === false, "入寮していない状態で始まる");

    const kinds = st.equipment.map((e) => e.kind);
    ok(kinds.includes("entrance"), "入口が無いセーブには入口を補う");
    ok(kinds.includes("pool6") && kinds.includes("studio") && kinds.includes("gym"), "元の部屋は残る");

    const placed = placedRooms(st.map());
    ok(placed.length === st.equipment.length, "全ての部屋がマップに配置される", `${placed.length}/${st.equipment.length}`);
    ok(st.strandedRooms().length === 0, "全ての部屋に道が繋がっている");
    ok(st.trainingSlots() > 0, "練習枠が生きている", `${st.trainingSlots()}人`);
    ok(st.timetable.length > 0, "時間割が入る", `${st.timetable.length}コマ`);
    ok(st.capacityOf("youji") > 0, "スクールの定員が0にならない", `${st.capacityOf("youji")}人`);

    // 重なりが無い
    const seen = new Set<string>();
    let overlap = false;
    for (const r of placed) for (const c of cellsOf(r)) {
      const k = `${c.gx},${c.gy}`;
      if (seen.has(k)) overlap = true;
      seen.add(k);
    }
    ok(!overlap, "並べ直した配置に重なりが無い");

    // もう一度保存して読み直しても同じ
    const again = buildSave(st, clock, 0);
    const st2 = newGame(8);
    applySave(JSON.parse(JSON.stringify(again)), st2, new GameClock());
    ok(st2.strandedRooms().length === 0, "再保存→再読込でも導線が保たれる");
  }
}

// ------------------------------------------------------------------ 12. 経路探索の性能と安全性

head("12. 経路探索の頑健さ");
{
  const st = newGame();
  const map = st.map();
  // 入口が無いときは経路が引けない（クラッシュしない）
  const st2 = newGame();
  const gate = st2.equipment.find((e) => e.kind === "entrance")!;
  st2.storeRoom(gate);
  ok(st2.strandedRooms().length > 0, "入口を外すと全ての部屋へ行けなくなる", `${st2.strandedRooms().length}件`);
  const pool = placedRooms(st2.map()).find((r) => isPool(r.kind))!;
  ok(routeFromEntrance(st2.map(), pool) === null, "入口が無ければ道順は null（例外にしない）");

  // 経路探索は十分速い（毎フレーム呼んでも問題ない規模か）
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    entranceField(map);
  }
  const ms = Date.now() - t0;
  ok(ms < 800, "距離場の計算200回が1秒以内", `${ms}ms`);

  // 部屋を並べても全ての部屋に行ける（更地はどこでも歩けるので、置いただけで繋がる）
  const st3 = newGame();
  st3.gems = 9_999_999;
  while (st3.expandLand().ok) st3.gems = 9_999_999;
  for (const k of ["gym", "studio", "coachroom", "bath", "shop"] as const) {
    st3.gems = 9_999_999;
    st3.buyEquipment(k);
  }
  ok(st3.strandedRooms().length === 0, "部屋を並べても全ての部屋に行ける", `${st3.equipment.length}部屋`);
}

// ------------------------------------------------------------------ 13. 月次の収支に一般客と寮費が乗る

head("13. 月次の収支");
{
  const st = newGame();
  readyForBigFacility(st);
  st.buyEquipment("dorm");
  const s = createStudent(rng(31), 2001, "senshu");
  s.grade = "高1"; // 入寮できるのは高校生から
  st.students.senshu.push(s);
  ok(st.enterDorm(s).ok, "高校生は入寮できる");
  st.guestMonth.income = 120;

  const fin = st.monthlyFinance();
  ok(fin.guest === 120, "一般客の売上が収支に出る", `◆${fin.guest}`);
  ok(fin.dorm === DORM.costPerHead, "入寮者ぶんの寮費が掛かる", `◆${fin.dorm}`);
  // スポンサー収入と売店の売上も net に入る（→ GameState.monthlyFinance）
  ok(
    fin.net === fin.tuition + fin.sponsor + fin.guest + fin.shop - fin.upkeep - fin.salary - fin.dorm,
    "収支の式が合っている",
    `net=${fin.net}`,
  );

  const roll = st.advanceMonth();
  ok(roll.guests.income === 120, "月次レポートに一般客の売上が入る");
  ok(st.guestMonth.income === 0, "月が替わると一般客の集計はリセットされる");
}

// ------------------------------------------------------------------ 14. 描画データ（画面が組み立てられるか）

head("14. 描画に渡すデータ");
{
  // シーンが毎回呼ぶ関数を、いろいろなマップの状態で通す（例外を出さないこと）。
  const cases: { label: string; make: () => GameState }[] = [
    { label: "初期状態", make: () => newGame() },
    {
      label: "部屋を一通り建てた",
      make: () => {
        const s = newGame();
        s.gems = 999999;
        for (const k of ["studio", "gym", "recovery", "meeting", "coachroom", "cafeteria", "clinic", "dorm"] as const) {
          s.buyEquipment(k);
        }
        return s;
      },
    },
    {
      label: "入口が無い",
      make: () => {
        const s = newGame();
        const gate = s.equipment.find((e) => e.kind === "entrance")!;
        s.storeRoom(gate);
        return s;
      },
    },
    {
      label: "部屋が全部倉庫",
      make: () => {
        const s = newGame();
        for (const e of [...s.equipment]) s.storeRoom(e);
        return s;
      },
    },
  ];

  for (const c of cases) {
    let error = "";
    try {
      const s = c.make();
      const map = s.map();
      const walls = wallEdgesOf(map);
      const fits = fittingsOf(map);
      const labels = roomLabelsOf(map);
      const doors = doorMarks(map);
      const zones = placementZones(map, "gym");
      // 床は全マス引ける
      let floors = 0;
      for (let gy = 0; gy < map.rows; gy++) {
        for (let gx = 0; gx < map.cols; gx++) {
          floorKindAt(map, gx, gy);
          floors++;
        }
      }
      // 人の道順（行けないときは null が返るだけで例外にしない）
      const usable = new Set(s.usableEquipment().map((e) => e.id));
      for (const room of placedRooms(map)) {
        visitRoute(map, room, { suit: true });
        leaveRoute(map, centerOf(room), room);
        moveRoute(map, null, room, centerOf(room));
        if (isPool(room.kind)) {
          swimLanesOf(room);
          laneRopesOf(room);
        }
        standCellsOf(room, 6);
      }
      ok(
        true,
        `${c.label}：描画データを組み立てられる`,
        `床${floors} 壁${walls.length} 什器${fits.length} 札${labels.length} 扉${doors.length} 枠${zones.length}`,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      ok(false, `${c.label}：描画データを組み立てられる`, error);
    }
  }

}

// ------------------------------------------------------------------ 15. 壁（エッジウォール方式）

head("15. 壁がセル境界に立つか");
{
  const st = newGame(5);
  st.gems = 999999;
  st.buyEquipment("gym");
  const map = st.map();
  const edges = buildWallEdges(map);
  const lookup = wallLookup(edges);

  ok(edges.length > 0, "壁が生成される", `${edges.length}枚`);
  ok(
    edges.every((e) => e.dir === "n" || e.dir === "w"),
    "壁はセルの北辺・西辺だけに持つ（南辺・東辺は隣セルの北辺・西辺として持つ＝二重管理しない）",
  );
  // 同じ辺に2枚立たない
  const keys = edges.map((e) => edgeKey(e.gx, e.gy, e.dir));
  ok(new Set(keys).size === keys.length, "同じ辺に壁が二重に立たない", `${new Set(keys).size}/${keys.length}`);

  // 部屋の外周に沿っている（部屋のマスか、その1つ外のマスに属する辺）
  const pool = placedRooms(map).find((r) => isPool(r.kind))!;
  const f = footprintOf(pool.kind);
  const x0 = pool.gx as number;
  const y0 = pool.gy as number;
  const poolEdges = edges.filter((e) => e.roomId === pool.id);
  ok(poolEdges.length > 0, "プールに壁がついている", `${poolEdges.length}枚`);
  ok(
    poolEdges.every(
      (e) => e.gx >= x0 && e.gx <= x0 + f.w && e.gy >= y0 && e.gy <= y0 + f.h,
    ),
    "壁は部屋の外周からはみ出さない",
  );

  // 奥（北辺・西辺）は front=false、手前（南辺・東辺）は front=true
  const back = poolEdges.filter((e) => !e.front);
  const front = poolEdges.filter((e) => e.front);
  ok(back.length > 0 && front.length > 0, "奥の壁と手前の壁が両方ある", `奥${back.length} 手前${front.length}`);
  ok(
    back.every((e) => (e.dir === "n" ? e.gy === y0 : e.gx === x0)),
    "奥の壁は部屋の北辺・西辺",
  );
  ok(
    front.every((e) => (e.dir === "n" ? e.gy === y0 + f.h : e.gx === x0 + f.w)),
    "手前の壁は部屋の南辺・東辺（＝隣セルの北辺・西辺）",
  );

  // 手前は低く描かれる（高さの定義が奥より小さい）
  ok(WALL_H.front < WALL_H.back, "手前の壁は奥より低い（中が隠れない）", `${WALL_H.front} < ${WALL_H.back}`);
  ok(WALL_H.fence < WALL_H.back, "柵は低い", `${WALL_H.fence}`);

  // 出入口はドアになっていて通れる
  const doors = edges.filter((e) => e.kind === "door");
  ok(doors.length > 0, "道に接した辺がドアになる", `${doors.length}箇所`);
  ok(doors.every((e) => isPassable(e.kind)), "ドアは通れる");
  ok(!isPassable("wall") && !isPassable("glass") && !isPassable("fence"), "壁・ガラス・柵は通れない");
  for (const room of placedRooms(map)) {
    if (!st.isRoomUsable(room)) continue;
    ok(hasOpenDoor(map, room, lookup), `${room.kind} に通れる出入口がある`);
  }

  // 壁がマスを占有しない＝部屋の中のマスは全部使える
  const inner = innerCellsOf(pool);
  ok(
    inner.every((c) => roomAtCellIsPool(map, c.gx, c.gy, pool.id)),
    "部屋の内側のマスは壁に取られず、そのまま使える",
    `${inner.length}マス`,
  );
}

// ------------------------------------------------------------------ 16. 配置モード（買ってから置く）

head("16. 配置モードの可否判定");
{
  const st = newGame(9);
  st.gems = 99999;
  // 初期の10×10はほぼ埋まっているので、空きマスを使う判定は敷地を広げてから見る
  while (st.expandLand().ok) st.gems = 99999;
  const map = st.map();
  const pool = placedRooms(map).find((r) => isPool(r.kind))!;

  // --- 置けない理由が日本語1行で返る ---
  const outside = st.checkPlacement("studio", 0, 0);
  ok(!outside.ok && outside.reason === "敷地の外です", "敷地の外は置けない", outside.reason ?? "");

  const onRoom = st.checkPlacement("studio", pool.gx as number, pool.gy as number);
  ok(!onRoom.ok && (onRoom.reason ?? "").startsWith("他の設備と重なっています"), "重なりを弾く", onRoom.reason ?? "");

  // --- 設備ごとのきまり（入口は外周の道路に面する） ---
  // 初期の敷地は狭いので、空きマスを使う判定は敷地を広げてから見る
  const LB2 = landBounds(map);
  const gateInner = st.checkPlacement("entrance", LB2.x0 + 2, LB2.y0 + 9);
  ok(!gateInner.ok && (gateInner.reason ?? "").includes("外周"), "入口は敷地の内側に置けない", gateInner.reason ?? "");
  const gate = placedRooms(map).find((r) => r.kind === "entrance")!;
  const gateOk = st.checkPlacement("entrance", LB2.x0, gate.gy as number, 0);
  ok(gateOk.ok, "外周に面していれば入口を置ける", gateOk.reason ?? "");

  // --- 更地はどこでもそのまま置ける（道を敷く必要が無いので警告も出ない） ---
  const far = st.checkPlacement("studio", LB2.x0, LB2.y0 + 9);
  ok(far.ok, "入口から離れた更地にも置ける", far.reason ?? "");
  ok(!far.warning, "道を敷く必要が無いので警告も出ない", far.warning ?? "");

  // --- 入口の移設：道から離れた辺へ動かしても、私道が自動で繋がるので置ける ---
  // （繋ぎ直しを見ないと「動かした瞬間はどこにも行けない」が必ず成立して、
  //   通路封鎖チェックに引っかかり、入口がどこへも動かせなくなる）
  // 入口は 3×2 なので、敷地の下辺に置くには高さぶん上げる
  const entF = footprintOf("entrance");
  const away = { gx: LB2.x0, gy: LB2.y1 - entF.h + 1 };
  // 5つ目の引数は向き（rot）。動かす入口自身との重なりは ignoreId で外す
  const moved = st.checkPlacement("entrance", away.gx, away.gy, gate.id);
  const stranded = wouldStrand(map, { kind: "entrance", gx: away.gx, gy: away.gy, ignoreId: gate.id });
  ok(stranded.length === 0, "入口を別の辺へ動かしても行けなくなる部屋は出ない", `${stranded.length}件`);
  ok(moved.ok, "入口は外周に面していればどこへでも動かせる", moved.reason ?? "");

  // --- 通路封鎖チェック（BFS）はまだ効いている：部屋で通路を塞ぐ配置は拒否する ---
  {
    const st2 = newGame();
    st2.gems = 999999;
    const m2 = st2.map();
    const g2 = placedRooms(m2).find((r) => r.kind === "entrance")!;
    // 入口の真上（＝背骨の道）をふさぐと、その先の部屋へ行けなくなる
    const road = { gx: g2.gx as number, gy: (g2.gy as number) - 1 };
    const cover = st2.checkPlacement("studio", road.gx, road.gy);
    ok(!cover.ok, "通路をふさぐ配置はいまでも拒否される", cover.reason ?? "");
  }

  // --- 確定するまで課金しない ---
  const before = st.gems;
  for (let i = 0; i < 5; i++) st.checkPlacement("studio", LB2.x0 + i, LB2.y0 + 9);
  ok(st.gems === before, "可否を何度確かめてもお金は減らない", `◆${st.gems}`);

  const bad = st.buyAndPlaceRoom("studio", pool.gx as number, pool.gy as number);
  ok(!bad.ok, "置けない場所には買えない", bad.reason ?? "");
  ok(st.gems === before, "失敗したときもお金は減らない", `◆${st.gems}`);

  const cost = st.equipmentCost("studio");
  const good = st.buyAndPlaceRoom("studio", LB2.x0, LB2.y0 + 9);
  ok(good.ok, "置ける場所なら買って置ける");
  ok(st.gems === before - cost, "確定したときだけ、ちょうど1回ぶん減る", `◆${before} → ◆${st.gems}（-${cost}）`);
  ok(good.item?.gx === LB2.x0 && good.item?.gy === LB2.y0 + 9, "指定した場所に置かれている");

  // --- ゴーストの大きさ＝実際に占める大きさ（回転はやめたので、必ず一致すること）---
  {
    const f = footprintOf("pool6");
    const st2 = newGame(21);
    st2.gems = 999999;
    const lb = landBounds(st2.map());
    let put: { gx: number; gy: number } | null = null;
    for (let y = lb.y0; y <= lb.y1 && !put; y++) {
      for (let x = lb.x0; x <= lb.x1 && !put; x++) {
        if (st2.checkPlacement("pool6", x, y).ok) put = { gx: x, gy: y };
      }
    }
    ok(!!put, "検証用に 25mプールを置ける場所がある");
    if (put) {
      const r = st2.buyAndPlaceRoom("pool6", put.gx, put.gy);
      ok(r.ok, "25mプールを置けた", r.reason ?? "");
      const m2 = st2.map();
      let cells = 0;
      for (let y = 0; y < m2.rows; y++) {
        for (let x = 0; x < m2.cols; x++) if (roomAt(m2, x, y)?.id === r.item?.id) cells++;
      }
      ok(cells === f.w * f.h, "占有マスは設備の大きさどおり", `${cells}マス（${f.w}×${f.h}）`);
      const sum = st2.placementSummary({ kind: "pool6", existing: null, cost: 0, moving: false });
      ok(sum.includes(`${f.w}×${f.h}`), "配置モードの案内も同じ大きさを出す", sum);
    }
  }

  // --- 資金が足りなければ買えない ---
  st.gems = 0;
  const poor = st.buyAndPlaceRoom("gym", 6, 3);
  ok(!poor.ok, "資金不足なら置けない", poor.reason ?? "");
}

// ------------------------------------------------------------------ 16b. コーチ室と雇用上限

head("16b. コーチ室で雇えるコーチが増える");
{
  const st = newGame(11);
  st.gems = 999999;
  const base = st.coachCapacity();
  ok(base === COACHING.maxCoaches, "コーチ室が無いときは基本値どおり", `${base}人`);

  const r1 = st.buyEquipment("coachroom");
  ok(r1.ok && r1.placed === true, "コーチ室を建てられる");
  ok(
    st.coachCapacity() === base + EQUIPMENT.coachesPerCoachRoom,
    "コーチ室1つで雇える人数が増える",
    `${base} → ${st.coachCapacity()}人（+${EQUIPMENT.coachesPerCoachRoom}）`,
  );
  ok(EQUIPMENT.coachesPerCoachRoom === 3, "1棟あたり3人", `${EQUIPMENT.coachesPerCoachRoom}人`);
  ok(COACHING.maxCoaches === 1, "コーチ室が無いあいだはコーチ1人だけ", `${COACHING.maxCoaches}人`);

  // 上限まで建てたときの最大値
  while (st.canBuyEquipment("coachroom").ok) st.buyEquipment("coachroom");
  const rooms = st.usableCount("coachroom");
  ok(
    st.coachCapacity() === COACHING.maxCoaches + rooms * EQUIPMENT.coachesPerCoachRoom,
    "最大まで建てたときの上限",
    `コーチ室${rooms}棟 → ${st.coachCapacity()}人`,
  );

  // 入口から行けない部屋は数えない（usableCount を使っているため）
  const capBefore = st.coachCapacity();
  const gate16 = st.equipment.find((e) => e.kind === "entrance")!;
  st.storeRoom(gate16);
  ok(st.coachCapacity() === COACHING.maxCoaches, "入口が無いとコーチ室は数えない", `${capBefore} → ${st.coachCapacity()}人`);
}

// ------------------------------------------------------------------ 17. 配置中のカメラ追従

head("17. 画面外へ置くときのカメラ送り");
{
  // 実機と同じステージ（HUDとフッターの間）
  const view = { left: 0, top: 88, right: 540, bottom: 810 };
  const m = CAMERA.edgeScrollMargin;

  // 真ん中では動かない
  const mid = edgeScrollVector(270, 450, view, m);
  ok(mid.dx === 0 && mid.dy === 0, "画面の真ん中をなぞってもカメラは動かない");

  // 左端 → 右へ送る（カメラ位置を +x する＝景色が右へ動く）
  const left = edgeScrollVector(2, 450, view, m);
  ok(left.dx > 0.9 && left.dy === 0, "左端では右向きに強く送る", `dx=${left.dx.toFixed(2)}`);
  const right = edgeScrollVector(538, 450, view, m);
  ok(right.dx < -0.9, "右端では逆向きに送る", `dx=${right.dx.toFixed(2)}`);
  const up = edgeScrollVector(270, view.top + 2, view, m);
  ok(up.dy > 0.9, "上端でも送る", `dy=${up.dy.toFixed(2)}`);
  const down = edgeScrollVector(270, view.bottom - 2, view, m);
  ok(down.dy < -0.9, "下端でも送る", `dy=${down.dy.toFixed(2)}`);

  // 帯の浅いところではゆっくり（狙った場所で止められる）
  const shallow = edgeScrollVector(m - 6, 450, view, m);
  ok(shallow.dx > 0 && shallow.dx < 0.2, "帯に入ったばかりのところではゆっくり", `dx=${shallow.dx.toFixed(2)}`);

  // 角では斜めに送る
  const corner = edgeScrollVector(2, view.top + 2, view, m);
  ok(corner.dx > 0 && corner.dy > 0, "角では斜めに送る");

  // ---- 画面外のゴーストを引き戻す ----
  const km = CAMERA.keepInViewMargin;
  const inside = keepInViewOffset({ left: 200, right: 300, top: 300, bottom: 400 }, view, km);
  ok(inside.dx === 0 && inside.dy === 0, "画面に入っているものは動かさない");

  const offLeft = keepInViewOffset({ left: -400, right: -300, top: 300, bottom: 400 }, view, km);
  ok(offLeft.dx > 0, "左の画面外にあれば右へ寄せる", `dx=${offLeft.dx}`);
  ok(offLeft.dx === km - -400, "余白ぶんだけ内側に入る", `${offLeft.dx}`);

  const offBottom = keepInViewOffset({ left: 200, right: 300, top: 900, bottom: 1000 }, view, km);
  ok(offBottom.dy < 0, "下の画面外にあれば上へ寄せる", `dy=${offBottom.dy}`);

  // 画面より大きいものは左上に合わせる（両側にはみ出しても破綻しない）
  const huge = keepInViewOffset({ left: -100, right: 900, top: 0, bottom: 1200 }, view, km);
  ok(Number.isFinite(huge.dx) && Number.isFinite(huge.dy), "画面より大きくても計算が壊れない");

  // 外接矩形
  const b = boundsOf([
    { x: 10, y: 5 },
    { x: -3, y: 40 },
    { x: 7, y: 12 },
  ]);
  ok(b.left === -3 && b.right === 10 && b.top === 5 && b.bottom === 40, "4隅から外接矩形を作れる");
}

function roomAtCellIsPool(map: ReturnType<GameState["map"]>, gx: number, gy: number, id: number): boolean {
  const r = placedRooms(map).find((e) => {
    const f = footprintOf(e.kind);
    return gx >= (e.gx ?? 0) && gx < (e.gx ?? 0) + f.w && gy >= (e.gy ?? 0) && gy < (e.gy ?? 0) + f.h;
  });
  return !!r && r.id === id;
}

// ------------------------------------------------------------------ 18. 更衣室の廃止

head("18. 更衣室を廃止した（そのままプールへ行って泳ぐ）");
{
  ok(!isEquipmentKind("locker"), "更衣室はもう部屋の種類として存在しない");
  ok(!EQUIPMENT_ORDER.includes("locker" as never), "購入画面の並びにも出てこない");

  const st = newGame();
  ok(!st.equipment.some((e) => e.kind === ("locker" as never)), "初期設備に更衣室が無い");

  // 入口 → プール がまっすぐ（寄り道の分だけ長くならない）
  const pool = placedRooms(st.map()).find((r) => isPool(r.kind))!;
  const route = visitRoute(st.map(), pool, { suit: true })!;
  const direct = routeFromEntrance(st.map(), pool)!;
  ok(route.length === direct.length, "道順に寄り道が無い（入口→プールの最短と同じ長さ）", `${route.length}地点`);
  ok(route[route.length - 1].change === "suit", "水着になるのは終点だけ");
  ok(route.filter((w) => w.change === "suit").length === 1, "着替えの指示は1回だけ");

  // 古いセーブの更衣室は取り除かれ、建設費が返る
  const raw = {
    version: 18,
    savedAt: 0,
    playTimeMs: 0,
    clock: { day: 1, minuteOfDay: 600, speed: 1 },
    game: {
      students: [],
      gems: 100,
      equipment: [
        { id: 1, kind: "entrance", gx: 2, gy: 2 },
        { id: 2, kind: "locker", gx: 5, gy: 5 },
        { id: 3, kind: "pool6", gx: 8, gy: 8 },
      ],
    },
  };
  const m = migrateSave(raw);
  ok(m.ok, "v18 のセーブが読める", m.ok ? "" : m.reason);
  if (m.ok) {
    const kinds = (m.data.game.equipment as { kind: string }[]).map((e) => e.kind);
    ok(!kinds.includes("locker"), "更衣室はセーブから取り除かれる", kinds.join(","));
    ok(kinds.includes("entrance") && kinds.includes("pool6"), "ほかの部屋は残る");
    ok(m.data.game.gems === 500, "建設費 ◆400 が返る（黙って資産を消さない）", `◆${m.data.game.gems}`);
  }
}

// ------------------------------------------------------------------ 19. コーチはコーチ室で増やす

head("19. 初期はコーチ1人／コーチ室で増やせる");
{
  const st = newGame(5);
  ok(st.coaches.length === 1, "ゲーム開始時のコーチは1人", `${st.coaches.length}人`);
  ok(st.coachCapacity() === 1, "コーチ室が無いあいだの定員も1人", `${st.coachCapacity()}人`);

  // 定員いっぱい＝雇えない。理由に「コーチ室」が出る
  st.gems = 999999;
  const cand = st.generateRecruits()[0];
  const blocked = st.hireCoach(cand);
  ok(!blocked.ok, "コーチ室が無いと雇えない", blocked.reason ?? "");
  ok((blocked.reason ?? "").includes("コーチ室"), "断る理由に「コーチ室」が出る", blocked.reason ?? "");

  // コーチ室を建てれば雇える
  const room = st.buyEquipment("coachroom");
  ok(room.ok && room.placed === true, "コーチ室を建てられる", room.reason ?? "");
  ok(st.coachCapacity() === 1 + EQUIPMENT.coachesPerCoachRoom, "定員が増える", `${st.coachCapacity()}人`);
  const hired = st.hireCoach(st.generateRecruits()[0]);
  ok(hired.ok, "コーチ室を建てたら雇える", hired.reason ?? "");
  ok(st.coaches.length === 2, "コーチが2人になった", `${st.coaches.length}人`);

  // 初期の時間割は、コーチ1人でも全コマ開講できる（1人が別の時間を掛け持ちする）
  const solo = newGame(6);
  ok(solo.activeTimetable().length === solo.timetable.length, "コーチ1人でも初期の時間割は全部開講できる", `${solo.activeTimetable().length}/${solo.timetable.length}コマ`);
}

// ------------------------------------------------------------------ 20. 人がその場で消えない

head("20. 帰り道は必ず敷地の外で終わる（人がその場で消えない）");
{
  // 歩き切ったところで人は消えるので、敷地の中で終わる道順を返すと
  // **施設の真ん中で人が突然消える**。入口が無い／辿り着けない場合も含めて確かめる。
  const st = newGame();
  const map = st.map();
  const lb = landBounds(map);
  const outside = (c: { gx: number; gy: number }): boolean =>
    c.gx < lb.x0 || c.gx > lb.x1 || c.gy < lb.y0 || c.gy > lb.y1;

  const pool = placedRooms(map).find((r) => isPool(r.kind))!;
  const home = leaveRoute(map, centerOf(pool), pool);
  ok(home.length >= 2, "帰り道が1地点で終わらない", `${home.length}地点`);
  ok(outside(home[home.length - 1]), "帰り道の終点は敷地の外", `(${home[home.length - 1].gx},${home[home.length - 1].gy})`);

  // 入口が1つも無いマップ（道を引き直している最中など）でも敷地の外へ逃がす
  const noGate = { ...map, rooms: [] as Equipment[] } as typeof map;
  const escape = leaveRoute(noGate, { gx: lb.x0 + 3, gy: lb.y0 + 3 }, null);
  ok(escape.length >= 2, "入口が無くても道順が1地点にならない", `${escape.length}地点`);
  ok(outside(escape[escape.length - 1]), "入口が無くても敷地の外で終わる", `(${escape[escape.length - 1].gx.toFixed(1)},${escape[escape.length - 1].gy.toFixed(1)})`);
  ok(escape[escape.length - 1].change === "street", "外へ出る前に私服へ戻る");
}

// ------------------------------------------------------------------ 21. 設備に入る導線

head("21. 設備に入る導線（入口からいきなり湯船に入らない）");
{
  const st = newGame(3);
  st.gems = 9_999_999;
  while (st.expandLand().ok) st.gems = 9_999_999;
  const bath = st.buyEquipment("bath").item!;
  const map = st.map();
  const wash = bath.gy as number; // 洗い場＝最奥の行

  ok(ontoDry(bath, centerOf(bath))?.gy === wash, "風呂の「陸」は洗い場（最奥の行）", `gy=${ontoDry(bath, centerOf(bath))?.gy}`);
  const pool = placedRooms(map).find((r) => isPool(r.kind))!;
  ok(ontoDry(pool, centerOf(pool))?.gy === poolDeckAt(pool, 0).gy, "プールの「陸」はプールサイド（最下行）");
  ok(ontoDry(st.buyEquipment("sauna").item!, { gx: 0, gy: 0 }) === null, "水の無い部屋には「陸」の指定が無い");

  // 出入口は陸の側から。湯船の側（手前）から入らせない
  const route = visitRoute(map, bath, { suit: true });
  ok(!!route, "風呂への道順が引ける");
  if (route && route.length >= 2) {
    const door = route[route.length - 2];
    ok(door.gy <= wash, "部屋に入る1歩手前は洗い場の側", `gy=${door.gy} / 洗い場 ${wash}`);
  }

  // 席（湯船）へは、洗い場をひと足はさんでから入る
  const seat = bathSeatCells(bath, 1)[0];
  const app = approachInside(bath, seat);
  ok(app.length === 2, "席へ入る前に1歩はさむ", `${app.length}地点`);
  ok(app[0].gy === wash, "はさむのは洗い場の行（体を流してから）", `gy=${app[0].gy}`);
  ok(app[1].gy > wash && Math.abs(app[1].gx - seat.gx) < 0.001, "そのあと湯船の席へ入る", `gy=${app[1].gy.toFixed(1)}`);
  // サウナ・外気浴は席へ直行（水が無いので寄り道しない）
  const sauna = placedRooms(st.map()).find((r) => r.kind === "sauna")!;
  ok(approachInside(sauna, bathSeatCells(sauna, 1)[0]).length === 1, "水の無い部屋は席へ直行");
}

// ------------------------------------------------------------------ 22. 道を敷く仕組みが残っていないか

head("22. 道は敷かない（更地はどこでも歩ける）");
{
  const st = newGame();
  const map = st.map();
  const b = landBounds(map);
  // 敷地のうち部屋の建っていないマスは、全部歩ける
  let open = 0;
  let blocked = 0;
  for (let gy = b.y0; gy <= b.y1; gy++) {
    for (let gx = b.x0; gx <= b.x1; gx++) {
      if (roomAt(map, gx, gy)) blocked++;
      else if (isOpenGround(map, gx, gy)) open++;
    }
  }
  const inner = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  ok(open + blocked === inner, "敷地のマスは「部屋」か「歩ける更地」のどちらか", `${open}歩ける / ${blocked}部屋`);
  ok(open > 0, "歩ける更地がある", `${open}マス`);

  // 床の見た目も1種類（通路と空き地の区別が無くなった）
  ok(floorKindAt(map, b.x0, b.y0) === "road", "部屋の無いマスはすべて通路として描く");

  // 敷地の使用率は「部屋が占めるぶん」だけ
  const usage = st.landUsage();
  ok(usage.rooms + usage.free === usage.total, "使用率＝部屋＋更地", `${usage.rooms}+${usage.free}/${usage.total}`);
  ok(usage.rooms === blocked, "部屋のマス数が一致", `${usage.rooms}`);
}

// ------------------------------------------------------------------ グレードアップの見た目

head("グレードを上げたら、その場で描き直す");
{
  const st = new GameState(rng(77), { clubName: "見た目チェック" });
  st.gems = 9_999_999;
  // グレードを持つ部屋（筋トレルーム・スタジオ・マッサージエリア）を1つ建てる
  st.buyEquipment("gym");
  const room = placedRooms(st.map()).find((e) => st.upgradeRoomCost(e) > 0);
  ok(!!room, "グレードを上げられる部屋がある", room ? room.kind : "なし");
  if (room) {
    // 【なぜ署名を見るか】画面（FacilityScene.syncLayout）は
    // 「マップの署名が変わったときだけ」建物を描き直す。
    // 署名に部屋の見た目を決めるもの（＝グレード）が入っていないと、
    // グレードアップしても描き直されず、タイトルに戻るまで古い姿のままになる。
    const before = mapSignature(st.map());
    const r = st.upgradeRoom(room);
    ok(r.ok, "グレードを上げられる", r.ok ? `${r.grade}` : (r.reason ?? ""));
    const after = mapSignature(st.map());
    ok(after !== before, "マップの署名が変わる（＝その場で描き直す）");
    ok(after.includes(`g${room.grade ?? 1}`), "署名にグレードが入っている");
  }
}

// ------------------------------------------------------------------ 結果

head("22. 部屋の回転（縦と横を入れ替えて置く）");
{
  const st = newGame(5);
  st.gems = 9_999_999;
  while (st.expandLand().ok) st.gems = 9_999_999;

  const f0 = footprintOf("pool8");
  const f1 = footprintOf("pool8", 1);
  ok(f1.w === f0.h && f1.h === f0.w, "回すと占有マスの縦横が入れ替わる", `${f0.w}×${f0.h} → ${f1.w}×${f1.h}`);

  /** その向きで、通路をふさがず歩いて行ける場所（無ければ null）。 */
  const spotFor = (kind: Equipment["kind"], rot: 0 | 1, ignoreId?: number): { gx: number; gy: number } | null => {
    const map = st.map();
    const b = landBounds(map);
    const f = footprintOf(kind, rot);
    for (let gy = b.y0; gy + f.h - 1 <= b.y1; gy++) {
      for (let gx = b.x0; gx + f.w - 1 <= b.x1; gx++) {
        if (!canPlaceAt(map, kind, gx, gy, ignoreId, rot).ok) continue;
        const c = st.checkPlacement(kind, gx, gy, ignoreId, rot);
        if (c.ok && !c.warning) return { gx, gy };
      }
    }
    return null;
  };

  const at = spotFor("pool8", 1);
  const bought = at ? st.buyAndPlaceRoom("pool8", at.gx, at.gy, 1) : null;
  ok(!!bought?.ok, "回した向きで買って置ける", bought?.reason ?? "");
  const pool = bought?.item ?? null;
  if (pool && pool.gx != null && pool.gy != null) {
    const map = st.map();
    const x0 = pool.gx;
    const y0 = pool.gy;
    const x1 = x0 + f1.w - 1;
    const y1 = y0 + f1.h - 1;
    ok(pool.rot === 1, "部屋が向きを覚えている");
    const cells = cellsOf(pool);
    ok(
      cells.length === f1.w * f1.h && cells.every((c) => c.gx >= x0 && c.gx <= x1 && c.gy >= y0 && c.gy <= y1),
      "占有マスが回した大きさぶん",
      `${cells.length}マス`,
    );
    ok(roomAt(map, x0 + f0.w - 1, y0)?.id !== pool.id, "回す前の大きさのマスは占有しない");

    let deck = 0;
    let deckElsewhere = 0;
    for (const c of cells) {
      if (floorKindAt(map, c.gx, c.gy) !== "deck") continue;
      if (c.gx === x1) deck++;
      else deckElsewhere++;
    }
    ok(deck === f1.h && deckElsewhere === 0, "プールサイドは東端の列にまとまる", `東端${deck}マス／ほか${deckElsewhere}マス`);

    const lanes = swimLanesOf(pool);
    ok(lanes.length === EQUIPMENT.rooms.pool8.lanes, "レーンの数は回しても同じ", `${lanes.length}`);
    ok(
      lanes.every((l) => l.axis === "gy" && l.s0 < l.s1 && l.s0 >= y0 && l.s1 <= y1 && l.at > x0 && l.at < x1),
      "回したプールは縦（gy の向き）に泳ぎ、レーンは水の上に収まる",
    );
    ok(
      startBlockCellsOf(pool).every((c) => c.gx > x0 && c.gx < x1 && Math.abs(c.gy - (y0 + 0.1)) < 1e-9),
      "飛び込み台は回したプールの奥の端に並ぶ",
    );
    ok(laneRopesOf(pool).every((r) => r.from.gx === r.to.gx), "レーンロープも縦に張られる");

    const dry = ontoDry(pool, centerOf(pool));
    ok(!!dry && Math.abs(dry.gx - x1) < 1e-9, "水から上がる先は東端のプールサイド", dry ? `gx=${dry.gx}` : "なし");
    ok(
      isOverPoolWater(pool, centerOf(pool)) && !isOverPoolWater(pool, poolDeckAt(pool, 2)),
      "水の上／プールサイドの判定が回した向きに合う",
    );
    const road = moveRoute(map, null, pool, { gx: 0, gy: 0 }) ?? [];
    const last = road[road.length - 1];
    ok(
      road.length > 0 && !!last && !isOverPoolWater(pool, last),
      "回したプールへの道順はプールサイドで終わる",
      last ? `(${last.gx.toFixed(1)},${last.gy.toFixed(1)})` : "道順なし",
    );

    const edges = buildWallEdges(map).filter((e) => e.roomId === pool.id);
    ok(
      edges.length > 0 && edges.every((e) => e.gx >= x0 && e.gx <= x1 + 1 && e.gy >= y0 && e.gy <= y1 + 1),
      "壁は回した部屋の外周に沿う",
      `${edges.length}枚`,
    );
    const flipped = fittingsOf(map).filter((f) => f.flipX);
    ok(
      flipped.length > 0 &&
        flipped.every((f) => f.cell.gx >= x0 - 0.01 && f.cell.gx <= x1 + 1 && f.cell.gy >= y0 - 0.01 && f.cell.gy <= y1 + 1),
      "回した部屋の什器は反転して、部屋の中に並ぶ",
      `${flipped.length}個`,
    );
  }

  const bathAt = spotFor("bath", 1);
  const bath = bathAt ? (st.buyAndPlaceRoom("bath", bathAt.gx, bathAt.gy, 1).item ?? null) : null;
  ok(!!bath, "風呂も回して置ける");
  if (bath && bath.gx != null && bath.gy != null) {
    const map = st.map();
    const fb = footprintOf("bath", 1);
    let wash = 0;
    let washElsewhere = 0;
    for (const c of cellsOf(bath)) {
      if (floorKindAt(map, c.gx, c.gy) !== "bath") continue;
      if (c.gx === bath.gx) wash++;
      else washElsewhere++;
    }
    ok(wash === fb.h && washElsewhere === 0, "回した風呂の洗い場は西端の列", `西端${wash}／ほか${washElsewhere}`);
    const seats = bathSeatCells(bath, 6);
    ok(seats.every((c) => isBathWaterCell(bath, c.gx, c.gy)), "回した風呂の席も湯船の中");
    const legs = approachInside(bath, seats[0]);
    ok(legs.length === 2 && Math.abs(legs[0].gx - bath.gx) < 1e-9, "湯船へは西端の洗い場をひと足はさんで入る");
  }

  const save = buildSave(st, new GameClock(), 0);
  const loaded = newGame(6);
  applySave(JSON.parse(JSON.stringify(save)), loaded, new GameClock());
  const turned = st.equipment.filter((e) => e.rot === 1);
  const kept = turned.every((e) => {
    const o = loaded.equipment.find((x) => x.id === e.id);
    return !!o && o.rot === 1 && o.gx === e.gx && o.gy === e.gy;
  });
  ok(turned.length > 0 && kept, "回した向きと位置がセーブ→ロードで戻る", `${turned.length}部屋`);
  ok(
    save.game.equipment.filter((e) => !turned.some((t) => t.id === e.id)).every((e) => !("rot" in e)),
    "回していない部屋は向きを書き出さない（セーブの形は今までどおり）",
  );

  if (pool) {
    const before = mapSignature(st.map());
    const back = spotFor("pool8", 0, pool.id);
    const r = back ? st.placeRoom(pool, back.gx, back.gy, false, 0) : { ok: false };
    ok(r.ok && pool.rot === undefined, "もとの向きに戻せる（向きの印も消える）");
    ok(mapSignature(st.map()) !== before, "向きを変えるとマップの署名が変わる（＝その場で描き直す）");
  }
  ok(
    st.placementSummary({ kind: "pool8", existing: null, cost: 0, moving: false }, 1).includes("（回転）"),
    "配置モードの案内に「回転」と出る",
  );
}

// ------------------------------------------------------------------ 結果（22 まで）

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exit(1);
