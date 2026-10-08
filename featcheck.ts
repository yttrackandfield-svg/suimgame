/// <reference types="node" />
/**
 * 2026-08-07 の修正・追加ぶんの検証。
 *
 *   A-1 所持ジェムが1箇所で管理され、どこから見ても同じ額になるか
 *   A-2 クラス定員が固定（育成B24/育成A24/選手18/プロ8）で、プールを増やしても変わらないか
 *   A-3 時間割の分母（クラス定員 vs レーン枠）
 *   B   価格・入会ペース・敷地拡張・コーチのスカウト条件
 *   C   別プール同時進行／特別練習／大会の年間予定／名簿の並び替え／伸びの可視化
 *
 * 実行:
 *   npx esbuild featcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { guestRoomWeight, pickArrival, queueGiveUpChance, queueLimitOf } from "./src/sim/guests";
import { GameClock } from "./src/sim/clock";
import { CLASS_ORDER, classDef, type ClassId } from "./src/sim/classes";
import {
  practiceCapOf,
  applyTraining,
  applyStrokeTraining,
  atAgeCeiling,
  performanceIndex,
  applyRestTick,
  createStudent,
  energyMax,
  firstSnapshot,
  HISTORY_MAX,
  recordSnapshot,
  snapshotOfYear,
  statCapOf,
  STAT_KEYS,
  type Student,
} from "./src/sim/student";
import { SLOTS } from "./src/sim/timetable";
import {
  activeEntrances,
  isBuildable,
  landBounds,
  landBoundsOf,
  landExpandCost,
  landSizeOf,
  nextExpandSide,
  landInnerSize,
  placedRooms,
  touchesPerimeter,
} from "./src/sim/clubMap";
import {
  buildingWallEdges,
  fittingsOf,
  floorKindAt,
  isIndoorFloor,
  outdoorScatter,
  OUTSIDE_BANDS,
  placementZones,
  spotCount,
} from "./src/iso/facility";
import { pointOnLoop, roadLoop } from "./src/iso/traffic";
import {
  EQUIPMENT_DEFS,
  equipmentDef,
  footprintOf,
  gradeLabel,
  ROOM_GROUPS,
  ROOM_ORDER,
  type RoomKind,
  gradeEffect,
  upgradeCost,
} from "./src/sim/equipment";
import { ROOM_STYLE, WALL_H, WALL_H_OUTER, WALL_THICK, WALL_THICK_OUTER } from "./src/gfx/roomStyle";
import {
  AUTOEVENT,
  GUESTS,
  UNLOCK, ENROLL, PASSION, RECOVERY_ROOM, REST, SCALE_FINAL_WALL, SCALE_RIVAL_LEVEL, TALENT } from "./src/config/balance";
import { applyRecovery, planRecovery, recoverySlots } from "./src/sim/needs";
import { SPECIAL_MENUS } from "./src/sim/special";
import { effectiveStandard } from "./src/data/standardTimes";
import { CALENDAR, finalWallOf, rivalLevelOf } from "./src/sim/competitions";
import { CAMPAIGNS } from "./src/sim/campaign";
import { simulateRace } from "./src/sim/race";
import { coachGradeMinTier, coachSalary, makeCoach, recruitTopQuality } from "./src/sim/coach";
import { buildSave, applySave } from "./src/save/serialize";
import { monthlyAdvice } from "./src/sim/advice";
import { SAVE_VERSION } from "./src/save/types";
import { migrateSave } from "./src/save/migrate";
import { ALL_EVENTS, getStandardTime, meetsStandard } from "./src/data/standardTimes";
import { kirokukaiOf, standardKeysFor } from "./src/sim/competitions";
import { standardPoints } from "./src/sim/rank";
import {
  EQUIPMENT,
  GUESTS,
  INTAKE,
  MAP,
  SCALE_ENTRY_FEE,
  SCALE_REWARD,
  SCALE_TRAVEL_FEE,
  SPECIAL_TRAINING,
  START,
} from "./src/config/balance";

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

function rng(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const newGame = (seed = 1): GameState => new GameState(rng(seed), { clubName: "検証クラブ" });

/**
 * 検証用：コーチを n 人まで増やす。
 *
 * **コーチ室を建てるまでコーチは1人**（→ COACHING.maxCoaches）なので、
 * 複数コーチが要る検証は必ずここを通す。実際の手順（コーチ室を建てる → 雇う）を
 * そのまま踏むので、雇用のルールが壊れたらここで落ちる。
 */
function withCoaches(st: GameState, n: number): GameState {
  const keep = st.gems;
  st.gems = 99_999_999;
  while (st.coaches.length < n) {
    if (st.coachCapacity() <= st.coaches.length && !st.buyEquipment("coachroom").ok) break;
    const cand = st.generateRecruits()[0];
    if (!cand || !st.hireCoach(cand).ok) break;
  }
  st.gems = keep; // コーチ室の建設費はテストの資金計算に混ぜない
  return st;
}


// ================================================================ A-1 所持ジェム

head("A-1. 所持ジェムは1箇所（整数・どこから見ても同じ）");
{
  const st = newGame();
  ok(st.gems === START.gems, "初期値は config どおり", `◆${st.gems}`);

  // 小数を代入しても整数に丸まる（画面ごとに 1234 と 1234.6 に割れない）
  st.gems = 100.4;
  ok(Number.isInteger(st.gems) && st.gems === 100, "小数を入れても整数になる", `◆${st.gems}`);
  st.gems = -50;
  ok(st.gems === 0, "マイナスにはならない", `◆${st.gems}`);

  // 一般客の売上・月謝・売店を通しても整数のまま
  st.gems = 500;
  const clock = new GameClock();
  let allInt = true;
  for (let i = 0; i < 24; i++) {
    st.tickGuests(clock.minuteOfDay, 60);
    st.advanceMonth();
    if (!Number.isInteger(st.gems)) allInt = false;
  }
  ok(allInt, "2年まわしても所持ジェムは整数のまま", `◆${st.gems}`);

  // 収支レポートの net と、実際の増減が食い違わない（売店ぶんの入れ忘れの再発防止）
  const st2 = newGame(7);
  st2.gems = 5000;
  while (st2.expandLand().ok) st2.gems = 5000;
  st2.buyEquipment("shop");
  st2.gems = 5000;
  const before = st2.gems;
  // 内訳は月末の記録会のあと（プロの格が上がれば契約金も変わる）に締めるので、レポートの値で照らす
  const fin = st2.advanceMonth().finance;
  const expected = before + fin.tuition + fin.shop - (fin.upkeep + fin.salary + fin.dorm + fin.proSalary);
  ok(fin.shop > 0, "売店の売上が計上されている", `+${fin.shop}`);
  ok(Math.abs(st2.gems - expected) <= 1, "レポートの内訳どおりにジェムが動く", `◆${st2.gems} / 見込み ◆${expected}`);
}

// ================================================================ A-2 クラス定員

head("A-2. クラス定員は固定（プールを増やしても増えない）");
{
  const st = newGame();
  ok(classDef("ikuseiB").capacity === 24 && classDef("ikuseiA").capacity === 24, "育成B・育成A は24");
  ok(classDef("senshu").capacity === 18, "選手は18");
  ok(classDef("pro").capacity === 8, "プロは8");

  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;
  st.buyEquipment("pool6");
  st.buyEquipment("pool8");
  const caps = [st.capacityOf("ikuseiB"), st.capacityOf("ikuseiA"), st.capacityOf("senshu"), st.capacityOf("pro")];
  ok(
    caps[0] === 24 && caps[1] === 24 && caps[2] === 18 && caps[3] === 8,
    "プールを3本にしても 24/24/18/8 のまま（多重加算しない）",
    caps.join("/"),
  );
}

// ================================================================ A-3 時間割の分母

head("A-3. 時間割の分母はクラス定員（レーン枠と混同しない）");
{
  const st = newGame();
  const laneSlots = EQUIPMENT.rooms.pool6.lanes * EQUIPMENT.perLane;
  ok(laneSlots === 60, "6レーンプールの1コマの枠は60人（レーン定員）", `${laneSlots}人`);
  ok(st.capacityOf("ikuseiB") === 24, "育成Bの定員は24人（ここを分母に出す）", `${st.capacityOf("ikuseiB")}人`);
  ok(st.capacityOf("ikuseiB") !== laneSlots, "レーン枠とクラス定員は別物");
  // スクールは1コマ＝レーン枠がそのまま定員
  ok(st.capacityOf("youji") % laneSlots === 0, "スクールの定員はレーン枠の倍数", `${st.capacityOf("youji")}人`);
}

// ================================================================ B-1/B-2 価格

head("B-1/B-2. プール・設備の価格（1年で全部は買えない）");
{
  const st = newGame();
  const pool = st.equipmentCost("pool6");
  ok(pool >= 2000, "6レーンプールは大型投資", `◆${pool}`);
  ok(START.gems < pool, "所持金では最初からプールは買えない", `◆${START.gems} < ◆${pool}`);

  // 2本目はさらに高い（買い増すほど高くなる）
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;
  st.buyEquipment("pool6");
  ok(st.equipmentCost("pool6") > pool, "2本目はもっと高い", `◆${pool} → ◆${st.equipmentCost("pool6")}`);

  // 【序盤の手ざわり】初日に部屋を1つ選んで建てられること。
  // ここが0だと、月収が貯まるまで建設が何ヶ月も動かせず「することがない」になる。
  const st2 = newGame();
  const rooms = ["studio", "gym", "recovery", "meeting", "cafeteria", "clinic", "dorm", "bath", "coachroom", "shop"];
  const costs = rooms
    .map((k) => st2.equipmentCost(k as never))
    .filter((c) => c <= START.gems)
    .sort((a, b) => a - b);
  ok(costs.length > 0, "初日に部屋を1つ建てられる（最初の決断が初日に来る）", `${costs.length}種`);
  // ただし2つは建てられない＝「何から作るか」を選ぶことになる
  ok(
    costs.length < 2 || costs[0] + costs[1] > START.gems,
    "2つ同時には建てられない（どれを先に作るか選ぶ）",
    `◆${costs[0]}＋◆${costs[1] ?? 0} > ◆${START.gems}`,
  );
  ok(START.gems < st2.equipmentCost("pool6"), "それでも2本目のプールには遠い", `◆${START.gems} < ◆${st2.equipmentCost("pool6")}`);
}

// ================================================================ B-3 入会ペース

head("B-3. 受け入れ人数（序盤は少しずつ・ただし空きがあれば必ず受け入れる）");
{
  const st = newGame();
  const limit0 = st.comfortableSize();
  ok(limit0 >= INTAKE.base, "「無理なく見られる規模」の目安がある", `${limit0}人`);
  ok(limit0 < 60, "序盤はプール1本で回る人数に収まる", `${limit0}人`);

  // 人気度が上がると規模も伸びる
  st.addPopularity(300);
  ok(st.comfortableSize() > limit0, "人気度が上がると見られる規模が増える", `${limit0} → ${st.comfortableSize()}人`);

  // 【不具合の再発防止】規模を超えても、定員に空きがあるかぎり必ず受け入れる
  const st2 = newGame(3);
  const comfort = st2.comfortableSize();
  let id = 9000;
  while (st2.totalMembers() < comfort + 20) st2.students.youji.push(createStudent(rng(id), id++, "youji"));
  ok(
    st2.totalMembers() > comfort,
    "規模を超えるところまで在籍を増やした",
    `在籍${st2.totalMembers()} / 規模${comfort}`,
  );
  ok(
    st2.roomIn("youji") === st2.capacityOf("youji") - st2.students.youji.length,
    "空き枠は「定員 − 在籍数」そのもの（規模で減らさない）",
    `空き${st2.roomIn("youji")} = ${st2.capacityOf("youji")} - ${st2.students.youji.length}`,
  );
  ok(st2.roomIn("youji") > 0, "定員に空きがあるので、まだ受け入れられる");
  ok(st2.intakePressure() > 1, "そのかわり入会の間隔は延びる", `×${st2.intakePressure().toFixed(2)}`);

  // 定員がいっぱいのときだけ断る
  const st3full = newGame(31);
  while (st3full.students.youji.length < st3full.capacityOf("youji")) {
    st3full.students.youji.push(createStudent(rng(id), id++, "youji"));
  }
  ok(st3full.roomIn("youji") === 0, "定員が埋まって初めて空き枠が0になる");

  // 1年まわしたときの増えかた
  const st3 = newGame(5);
  const start = st3.totalMembers();
  for (let m = 0; m < 12; m++) {
    for (let i = 0; i < 40; i++) st3.pollAutoEvents(60);
    st3.advanceMonth();
  }
  const grown = st3.totalMembers();
  ok(grown > start, "1年で生徒は増える", `${start} → ${grown}人`);
  ok(grown <= 70, "1年目に把握できない人数まで増えない", `${grown}人`);
}

// ================================================================ B-4 敷地拡張

head("B-4. 敷地の拡張（買うほど高くなる）");
{
  ok(landInnerSize(0) === MAP.baseInner, "初期の敷地は狭い", `${landInnerSize(0)}×${landInnerSize(0)}マス`);
  // ブロック追加方式：右→下→右→下 と交互に伸びるので、面積で見る
  const areas = [0, 1, 2, 3, 4].map((k) => {
    const { w, h } = landSizeOf(k);
    return w * h;
  });
  ok(
    areas.every((v, i) => i === 0 || v > areas[i - 1]),
    "段ごとに広くなる（面積）",
    [0, 1, 2, 3, 4].map((k) => `${landSizeOf(k).w}×${landSizeOf(k).h}`).join(" → "),
  );
  // 【ブロック追加方式のいちばん大事なところ】左上の角は動かない＝既存の配置がずれない
  ok(
    [0, 1, 2, 3, 4].every((k) => landBoundsOf(k).x0 === landBoundsOf(0).x0 && landBoundsOf(k).y1 === landBoundsOf(0).y1),
    "拡張しても敷地の左下の角は動かない（配置をやり直さなくていい）",
    `(${landBoundsOf(0).x0},${landBoundsOf(0).y1})`,
  );
  ok(
    [0, 1, 2, 3].every((k) => {
      const a = landBoundsOf(k);
      const b = landBoundsOf(k + 1);
      return b.x1 >= a.x1 && b.y0 <= a.y0 && (b.x1 > a.x1) !== (b.y0 < a.y0);
    }),
    "1回の拡張で伸びるのは右か上のどちらか（＝四角いブロックが1つ付く）",
    [0, 1, 2, 3].map((k) => (nextExpandSide(k) === "right" ? "右" : "上")).join(" → "),
  );
  const costs = [0, 1, 2].map(landExpandCost);
  ok(
    costs.every((v, i) => i === 0 || v > costs[i - 1] * 1.8),
    "次の拡張は大幅に高くなる",
    costs.map((c) => `◆${c}`).join(" → "),
  );

  const st = newGame();
  ok(!st.canExpandLand().ok, "開始直後は資金が足りず広げられない", st.canExpandLand().reason ?? "");

  st.gems = 99_999_999;
  const map0 = st.map();
  const b0 = landBoundsOf(0);
  // ブロックは右（または下）に付くので、まだ買っていないのは敷地の右側
  ok(!isBuildable(map0, b0.x1 + 2, b0.y0), "買っていない土地には建てられない");

  const before = st.gems;
  const r = st.expandLand();
  ok(r.ok && (r.size ?? 0) > MAP.baseInner, "敷地を買って広げられる", `${MAP.baseInner} → ${r.size}マス`);
  ok(st.gems === before - (r.cost ?? 0), "ちょうど値段ぶん減る", `-◆${r.cost}`);
  ok(isBuildable(st.map(), b0.x1 + 2, b0.y0), "広げた土地（右のブロック）には建てられるようになる");

  // 広げても入口は機能したまま（＝全部の部屋が使えなくならない）
  ok(st.strandedRooms().length === 0, "拡張しても「行けない部屋」は出ない", `${st.strandedRooms().length}件`);

  // 【ブロック追加方式のいちばんの狙い】拡張しても、すでに置いた部屋は1マスも動かない
  {
    const st2 = newGame(77);
    st2.gems = 99_999_999;
    for (const kind of ["pool6", "studio", "gym", "shop"] as const) {
      st2.buyEquipment(kind);
      st2.gems = 99_999_999;
    }
    const snap = (): string =>
      placedRooms(st2.map())
        .map((r) => `${r.id}@${r.gx},${r.gy}`)
        .sort()
        .join("|");
    const before2 = snap();
    let moved = 0;
    while (st2.expandLand().ok) {
      st2.gems = 99_999_999;
      if (snap() !== before2) moved++;
    }
    ok(moved === 0, "拡張しても部屋は1マスも動かない（配置をやり直さなくていい）", `${moved}回 動いた`);
    ok(st2.strandedRooms().length === 0, "最大まで広げても全部の部屋に行ける");
    ok(st2.landSteps === MAP.maxLandSteps, "最大まで広げられる", `${st2.landSteps}段`);
  }
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;
  ok(st.strandedRooms().length === 0, "最大まで広げても全部の部屋に行ける");
  ok(st.trainingSlots() > 0, "プールも使えたまま", `枠${st.trainingSlots()}`);
  ok(!st.canExpandLand().ok, "上限まで買ったらそれ以上は広げられない", st.canExpandLand().reason ?? "");
}

// ================================================================ B-5 コーチのスカウト

head("B-5. 募集に来るコーチの格はクラブの格で決まる");
{
  ok(coachGradeMinTier(5) == null, "レジェンドは募集には来ない（記録会の出会いだけ）");
  ok((coachGradeMinTier(4) ?? 0) >= 4, "トップコーチは格4から", `格${coachGradeMinTier(4)}から`);
  ok(coachGradeMinTier(1) === 1, "見習いは最初から来る");
  ok(recruitTopQuality(1) < recruitTopQuality(6), "格が上がるほど良いコーチが来る", `${recruitTopQuality(1)} → ${recruitTopQuality(6)}`);

  const st = newGame();
  const cands = st.generateRecruits();
  ok(cands.every((c) => c.coach.quality <= 3), "始めたばかりのクラブに来るのは格3まで", cands.map((c) => c.coach.quality).join("/"));

  // 給料は格が上がるほど跳ね上がる
  const rand = rng(9);
  const pay = [1, 2, 3, 4, 5].map((q) => coachSalary(makeCoach(rand, q, q)));
  ok(pay[4] > pay[0] * 10, "レジェンドの月給は見習いの10倍以上", pay.map((p) => `◆${p}`).join(" / "));
}

// ================================================================ C-2 別プールでの同時進行

head("C-2. 別プールなら別のクラスを同時に回せる");
{
  const st = newGame();
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;
  st.buyEquipment("pool6");
  withCoaches(st, 2);
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  const [p1, p2] = st.placedPools();
  const slot = 3;

  const a = st.setTimetableEntry(p1.id, slot, "ikuseiB", st.coaches[0].id);
  ok(a.ok, "プール①に育成B");
  const b = st.setTimetableEntry(p2.id, slot, "senshu", st.coaches[1].id);
  ok(b.ok, "同じ時間、プール②に選手を置ける（＝並行できる）", b.reason ?? "");
  const c = st.setTimetableEntry(p2.id, slot + 1, "ikuseiA", st.coaches[1].id);
  ok(c.ok, "育成Aも別のコマに置ける", c.reason ?? "");

  const dup = st.setTimetableEntry(p2.id, slot, "ikuseiB", st.coaches[2]?.id ?? st.coaches[1].id);
  ok(!dup.ok, "同じクラスだけは同じ時間に2つ置けない", dup.reason ?? "");

  const running = st.runningLessons(SLOTS[slot].start + 10);
  ok(running.length === 2, "同じ時間に2クラスが走る", running.map((e) => e.classId).join("+"));
}

// ================================================================ C-3 特別練習

head("C-3. 特別練習（効果が高いかわりに代償がある）");
{
  const st = newGame();
  st.gems = 99_999_999;
  const s = createStudent(rng(31), 5001, "senshu");
  st.students.senshu.push(s);

  ok(SPECIAL_MENUS.length >= 3, "メニューが複数ある", `${SPECIAL_MENUS.length}種`);
  ok(SPECIAL_MENUS.every((m) => m.passion > 0), "どのメニューも情熱を使う", SPECIAL_MENUS.map((m) => m.passion).join("/"));

  // 【情熱】燃料が無ければ実施できない（お金があっても連発できない）
  st.passion = 0;
  const noFuel = st.canRunSpecial(s, "intensive");
  ok(!noFuel.ok, "情熱が無いと特別練習はできない", noFuel.reason ?? "");
  ok((noFuel.reason ?? "").includes("情熱"), "断る理由に必要量が出る", noFuel.reason ?? "");
  st.passion = PASSION.max;

  // スクール生は受けられない
  const kid = createStudent(rng(32), 5002, "youji");
  st.students.youji.push(kid);
  ok(!st.canRunSpecial(kid, "intensive").ok, "スクール生は受けられない", st.canRunSpecial(kid, "intensive").reason ?? "");

  // スタジオが無いとフォーム矯正は受けられない
  // （新規ゲームは最初からスタジオが建っている → START.equipment。撤去してから確かめる）
  for (const e of [...st.equipment]) if (e.kind === "studio") st.sellEquipment(e);
  ok(!st.canRunSpecial(s, "form").ok, "スタジオが無いとフォーム矯正はできない", st.canRunSpecial(s, "form").reason ?? "");

  const before = { ...s.stats };
  const energy0 = s.energy;
  const cond0 = s.condition;
  const gems0 = st.gems;
  const r = st.runSpecialTraining(s, "intensive");
  ok(r.ok, "短期集中特訓を実施できる", r.reason ?? "");
  const gained = STAT_KEYS.reduce((n, k) => n + (s.stats[k] - before[k]), 0);
  ok(gained > 0, "能力が伸びる", `+${gained.toFixed(2)}`);
  ok(s.energy < energy0, "体力を大きく使う", `${Math.round(energy0)} → ${Math.round(s.energy)}`);
  ok(s.condition < cond0, "コンディションも下がる", `${Math.round(cond0)} → ${Math.round(s.condition)}`);
  ok(st.gems === gems0 - (r.cost ?? 0), "費用ぶんだけ減る", `-◆${r.cost}`);
  ok(!!r.before && !!r.after, "ビフォー／アフターを返す（画面で見せられる）");
  const menuPassion = SPECIAL_MENUS.find((m) => m.id === "intensive")!.passion;
  ok(
    Math.abs(st.passion - (PASSION.max - menuPassion)) < 1e-9,
    "情熱をメニューぶん使う",
    `${PASSION.max} → ${st.passion}（-${menuPassion}）`,
  );

  /**
   * 【情熱と体力が続くかぎり何度でも】（2026-09-27）同じメニューの休み（cooldownDays）はやめた。
   * 止めるのは ①情熱 ②体力・調子 だけ。
   */
  s.energy = energyMax(s);
  s.condition = 80;
  const again = st.canRunSpecial(s, "intensive");
  ok(again.ok, "同じメニューでも、情熱と体力があればすぐ受けられる", again.reason ?? "");
  st.passion = 0;
  const noPassion = st.canRunSpecial(s, "intensive");
  ok(!noPassion.ok && (noPassion.reason ?? "").includes("情熱"), "情熱が足りなければ受けられない", noPassion.reason ?? "");
  st.passion = PASSION.max;
  s.energy = 0;
  const noEnergy = st.canRunSpecial(s, "intensive");
  ok(!noEnergy.ok && (noEnergy.reason ?? "").includes("体力"), "体力が足りなければ受けられない", noEnergy.reason ?? "");
  s.energy = energyMax(s);
  const other = st.canRunSpecial(s, "weakness");
  ok(other.ok, "別のメニューも受けられる", other.reason ?? "");

  // 通常練習より効果が大きい
  const st2 = newGame(41);
  st2.gems = 99_999_999;
  st2.passion = PASSION.max;
  const a = createStudent(rng(51), 5101, "senshu");
  const b = createStudent(rng(51), 5102, "senshu");
  st2.students.senshu.push(a, b);
  const a0 = STAT_KEYS.reduce((n, k) => n + a.stats[k], 0);
  const b0 = STAT_KEYS.reduce((n, k) => n + b.stats[k], 0);
  st2.runSpecialTraining(a, "intensive");
  st2.tickPractice("senshu", 60, undefined, [b]);
  const aGain = STAT_KEYS.reduce((n, k) => n + a.stats[k], 0) - a0;
  const bGain = STAT_KEYS.reduce((n, k) => n + b.stats[k], 0) - b0;
  ok(aGain > bGain, "特別練習は通常のコマより伸びる", `特別 +${aGain.toFixed(2)} / 通常 +${bGain.toFixed(2)}`);

  /**
   * 【上限の近くでも ±0 にならない】（2026-09-23 の修正）
   * 練習の伸びは (1−能力/上限)^2.5 で鈍るので、育った選手ほど特別練習が効かなくなり、
   * ◆と情熱を払って **+0.03（表示は ±0）** ということが起きていた（→ SPECIAL_TRAINING.dimFloor）。
   */
  const st5 = newGame(43);
  st5.gems = 999999;
  st5.passion = PASSION.max;
  const grown = createStudent(rng(53), 5150, "senshu");
  grown.grade = "高2";
  for (const k of STAT_KEYS) grown.stats[k] = practiceCapOf(grown, k) - 0.5;
  st5.students.senshu.push(grown);
  const g0 = STAT_KEYS.reduce((n, k) => n + grown.stats[k], 0);
  st5.runSpecialTraining(grown, "intensive");
  const grownGain = STAT_KEYS.reduce((n, k) => n + grown.stats[k], 0) - g0;
  ok(grownGain > 0.1, "上限の近くでも目に見えて伸びる", `+${grownGain.toFixed(2)}`);
  ok(
    STAT_KEYS.every((k) => grown.stats[k] <= practiceCapOf(grown, k) + 1e-9),
    "それでも練習の上限は超えない（最後の数ポイントは合宿）",
  );

  // セーブに載る（リロードで何度でも受けられない）
  const st3 = newGame(61);
  st3.gems = 999999;
  st3.passion = PASSION.max;
  const c = createStudent(rng(71), 5201, "senshu");
  st3.students.senshu.push(c);
  st3.runSpecialTraining(c, "weakness");
  const save = buildSave(st3, new GameClock(), 0);
  const st4 = newGame(62);
  applySave(save, st4, new GameClock());
  const restored = st4.findStudent(c.id)!;
  ok(!!restored, "読み込んでも選手は残る");
}


// ================================================================ C-3b 情熱

head("C-3b. 情熱（大会と客の満足で溜まり、特別練習で使う）");
{
  const st = newGame();
  ok(st.passion === PASSION.start, "開始時の情熱は config どおり", `${st.passion}`);
  ok(PASSION.max > 0 && PASSION.start < PASSION.max, "満タンより少ないところから始まる");

  // --- 溜まり方 ① 大会に出る ---
  st.passion = 0;
  const pool = st.placedPools()[0];
  void pool;
  const senshu = createStudent(rng(801), 5301, "senshu");
  senshu.grade = "高2";
  st.students.senshu.push(senshu);
  // 勝ち上がりの前提が無い入口の大会（地区予選）。ここなら1回目から出せる
  const ken = CALENDAR.find((c) => c.route === "high" && !c.requiresPrev)!;
  st.gems = 99_999_999;
  const r1 = st.enterCompetition([senshu], ken);
  ok(r1.passion > 0, "大会に出ると情熱が増える", `+${r1.passion}`);
  ok(r1.passion >= (PASSION.enterByScale[ken.scale] ?? 0), "少なくとも出場ぶんは入る", `${r1.passion}`);
  ok(Math.abs(st.passion - r1.passion) < 1e-9, "増えたぶんがそのままゲージに乗る");

  // --- 溜まり方 ② 大会の格が高いほど大きい ---
  ok(
    (PASSION.enterByScale.sekai ?? 0) > (PASSION.enterByScale.ken ?? 0) &&
      (PASSION.winByScale.sekai ?? 0) > (PASSION.winByScale.ken ?? 0),
    "格が高い大会ほど大きく増える",
    `県 出場${PASSION.enterByScale.ken}/優勝${PASSION.winByScale.ken} → 世界 出場${PASSION.enterByScale.sekai}/優勝${PASSION.winByScale.sekai}`,
  );
  ok(
    (PASSION.winByScale.ken ?? 0) > (PASSION.enterByScale.ken ?? 0),
    "優勝は出場よりずっと大きい",
    `出場${PASSION.enterByScale.ken} < 優勝${PASSION.winByScale.ken}`,
  );

  // --- 溜まり方 ③ 一般客の満足 ---
  const st2 = newGame(91);
  st2.passion = 0;
  const happy = st2.noteGuestSatisfied({ crowded: false, turnedAway: false, grade: 3, relaxing: true, extraStop: true });
  ok(happy.passion > 0, "満足して帰った客ぶん情熱が増える", `満足${happy.satisfaction} → +${happy.passion.toFixed(2)}`);
  const before = st2.passion;
  const away = st2.noteGuestSatisfied({ crowded: true, turnedAway: true, grade: 1, relaxing: false, extraStop: false });
  ok(away.passion === 0, "入れずに帰った客は情熱にならない");
  ok(st2.passion === before, "ゲージも動かない");
  // 満足度が高い客ほど大きい
  const st3 = newGame(92);
  st3.passion = 0;
  st3.noteGuestSatisfied({ crowded: false, turnedAway: false, grade: 3, relaxing: true, extraStop: true });
  const good = st3.passion;
  const st4 = newGame(93);
  st4.passion = 0;
  st4.noteGuestSatisfied({ crowded: true, turnedAway: false, grade: 1, relaxing: false, extraStop: false });
  ok(good > st4.passion, "満足度が高い客ほどよく溜まる", `${good.toFixed(2)} vs ${st4.passion.toFixed(2)}`);

  // --- 上限と下限 ---
  const st5 = newGame(94);
  st5.passion = PASSION.max - 1;
  ok(st5.addPassion(50) === 1, "満タンを超えて増えない（増えたぶんだけ返す）", `${st5.passion}`);
  ok(st5.passion === PASSION.max, "満タンで止まる");
  st5.passion = 5;
  ok(!st5.spendPassion(10), "足りなければ使えない");
  ok(st5.passion === 5, "使えなかったときは減らない");
  ok(st5.spendPassion(5) && st5.passion === 0, "ちょうどなら使える");

  // --- 特別練習で使い切る ＝ 連発できない ---
  const st6 = newGame(95);
  st6.gems = 999999;
  st6.passion = PASSION.max;
  const heavy = SPECIAL_MENUS.find((m) => m.id === "intensive")!;
  /**
   * 【情熱が燃料】（2026-09-23）月1回をやめたので、満タンからは何度も打てる。
   * そのかわり1回が重く（短期集中は情熱260）、同じ子には休みが要る。
   * ここで見るのは「強いメニューほど回数が少ない」という順序。
   */
  const runs = Math.floor(PASSION.max / heavy.passion);
  const light = SPECIAL_MENUS.find((m) => m.id === "weakness")!;
  const lightRuns = Math.floor(PASSION.max / light.passion);
  ok(runs >= 10 && runs <= 60, "満タンからでも回数には限りがある", `${runs}回`);
  ok(lightRuns > runs, "軽いメニューのほうが多く打てる", `弱点${lightRuns}回 > 短期集中${runs}回`);
  ok(light.passion < heavy.passion, "効果が軽いメニューは消費も軽い", `${light.passion} < ${heavy.passion}`);
  ok(heavy.cooldownDays > light.cooldownDays, "効果の高いメニューほど休みが長い", `${heavy.cooldownDays}日 > ${light.cooldownDays}日`);

  // --- セーブに載る ---
  const st7 = newGame(96);
  st7.passion = 47.5;
  const clock7 = new GameClock();
  const save7 = buildSave(st7, clock7, 0);
  ok(Math.abs(save7.game.passion - 47.5) < 0.01, "情熱が保存される", `${save7.game.passion}`);
  const st8 = newGame(97);
  applySave(JSON.parse(JSON.stringify(save7)), st8, new GameClock());
  ok(Math.abs(st8.passion - 47.5) < 0.01, "読み込むと戻る", `${st8.passion}`);
}

// ================================================================ C-5 大会の年間予定

head("C-5. 大会の年間予定（勝ち上がるまで先は見えない）");
{
  const st = newGame();
  st.month = 4;
  const s = createStudent(rng(81), 6001, "senshu");
  s.grade = "中2";
  st.students.senshu.push(s);

  const rows = st.seasonSchedule();
  ok(rows.length > 0, "年間予定が出る", `${rows.length}件`);
  ok(rows.every((r) => r.month >= 0 && r.month <= 12), "すべて開催月を持つ");
  ok(rows.some((r) => r.name.includes("地区予選")), "地区予選は最初から見える");
  ok(!rows.some((r) => r.name.includes("都道府県予選")), "その先（都道府県）はまだ見えない");
  ok(rows.some((r) => r.name === "地区記録会"), "記録会は地域だけ見える");
  ok(!rows.some((r) => r.name === "都道府県記録会"), "上の記録会はまだ見えない");

  // 地区予選を優勝したことにすると、次が現れる
  s.season.clearedStages.push("mid_area");
  const rows2 = st.seasonSchedule();
  ok(rows2.some((r) => r.name.includes("都道府県予選")), "優勝すると次の大会が一覧に現れる");
  ok(!rows2.some((r) => r.name.includes("地方ブロック")), "さらに先はまだ隠れている");

  // 開催月になると出場できる
  const apr = st.seasonSchedule().find((r) => r.name.includes("地区予選（中学）"));
  ok(!!apr && apr.month === 4, "地区予選（中学）は4月開催", `${apr?.month}月`);
  ok(!!apr?.open, "4月なので今すぐ出場できる", apr?.note ?? "");
  st.month = 9;
  const sep = st.seasonSchedule().find((r) => r.name.includes("地区予選（中学）"));
  ok(!!sep && !sep.open, "9月には出場できない（開催月の案内だけ）", sep?.note ?? "");
}

// ================================================================ C-6 伸びの可視化

head("C-6. 伸びの可視化（今月の伸び・設備の効果）");
{
  const st = newGame();
  const s = createStudent(rng(91), 7001, "senshu");
  st.students.senshu.push(s);
  ok(st.monthGainTotalOf(s) === 0, "練習前は伸び0");
  st.tickPractice("senshu", 120, undefined, [s]);
  ok(st.monthGainTotalOf(s) > 0, "練習すると今月の伸びに積まれる", `+${st.monthGainTotalOf(s).toFixed(2)}`);
  ok(st.topGrowers(3)[0]?.student.id === s.id, "いちばん伸びた選手を取り出せる");

  const roll = st.advanceMonth();
  ok(roll.growers.length > 0, "月次レポートに「よく伸びた選手」が載る", roll.growers.map((g) => g.name).join("・"));
  ok(st.monthGainTotalOf(s) === 0, "月が替わると集計は0に戻る");

  // 設備の効果（建てる前 → 建てた後）
  const st2 = newGame(95);
  st2.gems = 99_999_999;
  while (st2.expandLand().ok) st2.gems = 99_999_999;
  const before = st2.roomTrainMult("studio");
  const after = st2.roomTrainMultIfBuilt("studio");
  ok(after > before, "スタジオを建てるとフォームの伸びが上がる", `×${before.toFixed(2)} → ×${after.toFixed(2)}`);
  st2.buyEquipment("studio");
  ok(
    Math.abs(st2.roomTrainMult("studio") - after) < 0.001,
    "実際に建てると、予告どおりの倍率になる",
    `×${st2.roomTrainMult("studio").toFixed(2)}`,
  );
}

// ================================================================ C-7 体験会の削除

head("C-7. 体験会は無くなった");
{
  const st = newGame() as unknown as Record<string, unknown>;
  ok(typeof st.holdTrialEvent !== "function", "体験会の処理そのものが無い");
}

// ================================================================ 屋内施設（芝生・樹木・パラソルが残っていないこと）

head("屋内施設（屋外のものが残っていないこと）");
{
  const st = newGame();
  const map = st.map();

  // 床：敷地の中も外も「緑」であってはならない
  const isGreen = (c: number): boolean => {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    return g > r + 18 && g > b + 18;
  };
  const kinds = new Set<string>();
  for (let gy = 0; gy < MAP.rows; gy++) {
    for (let gx = 0; gx < MAP.cols; gx++) kinds.add(floorKindAt(map, gx, gy));
  }
  const greenFloors = [...kinds].filter((k) => {
    const st2 = ROOM_STYLE[k as keyof typeof ROOM_STYLE];
    return st2 && (isGreen(st2.base) || isGreen(st2.alt));
  });
  ok(greenFloors.length === 0, "床に緑（芝生）が1つも無い", greenFloors.join("・") || "なし");
  ok(!isGreen(ROOM_STYLE.grass.base), "敷地の中は屋内の床（芝生ではない）");
  ok(!isGreen(ROOM_STYLE.unowned.base), "敷地の外は舗装（芝生ではない）");

  // 屋外の飾りは「街路樹・植え込み・街灯」だけ。パラソルや岩は屋外レジャーの記号なので使わない
  const banned = ["odParasol", "odRock", "odBush"];
  // 帯は本編と同じ広さで見る（街灯は歩道＝OUTSIDE_BANDS.walk の列に立つ）
  const scatter = outdoorScatter(map, 60, OUTSIDE_BANDS.street);
  const used = new Set(scatter.map((x) => x.texture));
  ok(
    banned.every((b) => !used.has(b)),
    "ビーチパラソル・岩は使わない（屋外レジャーに見えてしまう）",
    [...used].join("・"),
  );
  // 外に置きっぱなしにするのは街路樹・植え込み・街灯だけ。車は1台残らず動かす（→ iso/traffic.ts）
  const still = new Set(["odLamp", "odTree", "odHedge"]);
  ok(
    scatter.length > 0 && scatter.every((s) => still.has(s.texture)),
    "動かない飾りは街路樹・植え込み・街灯だけ（止まったままの車を置かない）",
    [...used].join("・"),
  );
  ok(
    scatter.every((s) => floorKindAt(map, s.gx, s.gy) === "sidewalk"),
    "街路樹・植え込みは歩道の上だけ（駐車場や車道をふさがない）",
  );
  ok(
    scatter.every((s) => !isIndoorFloor(floorKindAt(map, s.gx, s.gy))),
    "建物の中には木を1本も置かない（屋内スイミングクラブ）",
  );
  ok(scatter.some((s) => s.texture === "odTree"), "車道ぞいに街路樹が並ぶ", `${scatter.filter((s) => s.texture === "odTree").length}本`);

  // プールサイドにパラソルが無い（屋内プール）
  const poolFit = fittingsOf(map).map((f) => f.texture);
  ok(!poolFit.includes("odParasol"), "プールサイドにビーチパラソルが無い");
  ok(poolFit.includes("inBench") || poolFit.includes("inSign"), "かわりに屋内の備品（ベンチ・案内表示）がある");

  // 建物の外壁がある（＝屋根のある施設に見える土台）
  const shell = buildingWallEdges(map);
  ok(shell.length > 0, "敷地をぐるりと囲む外壁がある", `${shell.length}枚`);
  // 外壁は内壁とは別の作り（outer＝厚くて高い躯体／outerGlass＝そこに入る窓）
  ok(
    shell.every((w) => w.kind === "outer" || w.kind === "outerGlass"),
    "外壁は建物用の壁でできている（部屋の仕切りの流用ではない）",
  );
  ok(
    shell.some((w) => w.kind === "outerGlass"),
    "外壁に窓がある",
    `${shell.filter((w) => w.kind === "outerGlass").length}枚`,
  );
  const land = landBounds(map);
  ok(
    shell.every((w) => w.gx >= land.x0 && w.gx <= land.x1 + 1 && w.gy >= land.y0 && w.gy <= land.y1 + 1),
    "外壁は敷地の縁に沿って立っている",
  );
  ok(WALL_H_OUTER.back > WALL_H.back, "外壁は部屋の仕切りより高い", `${WALL_H_OUTER.back} > ${WALL_H.back}`);
  ok(
    WALL_THICK_OUTER.back > WALL_THICK,
    "外壁は厚い（厚みの天面が陸屋根の見切りになる）",
    `${WALL_THICK_OUTER.back} > ${WALL_THICK}`,
  );

  // 建物の外は「歩道 → 植樹帯 → 車道」の狭い帯（芝生を敷かない、の裏返し）
  const ringKind = (d: number): string => {
    const gx = land.x1 + d;
    return floorKindAt(map, gx, land.y0);
  };
  ok(ringKind(OUTSIDE_BANDS.curb) === "sidewalk", "建物のすぐ外は歩道", ringKind(OUTSIDE_BANDS.curb));
  ok(ringKind(OUTSIDE_BANDS.walk) === "sidewalk", "その外は街路樹の植樹帯", ringKind(OUTSIDE_BANDS.walk));
  ok(ringKind(OUTSIDE_BANDS.street) === "street", "すぐ車道になる", ringKind(OUTSIDE_BANDS.street));
  ok(
    OUTSIDE_BANDS.street <= 4,
    "建物から車道までが近い（施設と道のあいだにグレーの空き地を作らない）",
    `${OUTSIDE_BANDS.street}マス`,
  );

  // 敷地の中はすべて屋内。外はすべて屋外（明るさの差がそのまま「建物の中」の手がかり）
  ok(isIndoorFloor("grass") && isIndoorFloor("lobby") && isIndoorFloor("water"), "敷地の中の床は屋内あつかい");
  ok(
    !isIndoorFloor("sidewalk") && !isIndoorFloor("street"),
    "歩道・車道は屋外あつかい（天井の照明を落とさない）",
  );
}

// ================================================================ 年間の主要大会

head("年間の主要大会（選手がいなくても、どんな大会があるか見える）");
{
  const st = newGame();
  // チュートリアルを廃止したので、新規ゲームは最初から選手・プロがいる（→ START.roster）
  ok(st.competitionAthletes().length > 0, "新規ゲームにも選手/プロがいる", `${st.competitionAthletes().length}人`);

  const rows = st.seasonSchedule();
  const names = rows.map((r) => r.name);
  ok(rows.length > 1, "年間予定が記録会だけになっていない", `${rows.length}行`);
  ok(
    rows.some((r) => r.scale !== "kirokukai" && r.month > 0),
    "記録会以外の大会が並んでいる",
    names.join("・"),
  );
  // ルートの入口はすべて見える（この先どんな大会があるかを知る唯一の場所なので）
  for (const [id, label] of [
    ["el_area", "小学ルートの入口"],
    ["mid_area", "中学ルートの入口"],
    ["hi_area", "高校ルートの入口"],
    ["gen_nihon", "日本選手権"],
  ] as const) {
    ok(rows.some((r) => r.id === id), `${label}が一覧に出る`);
  }
  /**
   * 【4月は3つのルートが同じ月に並ぶ】小中高の地区予選はどれも4月なので、
   * 出られるかどうかは**その学年の選手がいるか**だけで決まる。
   *
   * 【地区大会は育成B以上】（2026-09-23）新規ゲームには育成B（小3〜小6）と
   * 育成A（小5〜中3）の子が最初からいるので、**小学ルートの入口も開く**。
   * 選手は高2・高2・大1なので高校ルートも開く。
   */
  ok(
    rows.some((r) => r.id === "hi_area" && r.open),
    "高校生の選手がいるので高校ルートは出られる",
  );
  ok(
    rows.some((r) => r.id === "el_area" && r.open),
    "育成の小学生がいるので小学ルートも出られる（地区大会は育成から）",
  );
  ok(
    rows.filter((r) => r.month > 0 && r.open).every((r) => r.scale === "area"),
    "開いているのは入口（地区大会）だけ",
    rows.filter((r) => r.month > 0 && r.open).map((r) => r.name).join("・"),
  );
  ok(
    rows.some((r) => r.id === "gen_nihon" && !r.open && r.note.includes("標準記録")),
    "日本選手権は標準記録が要ると書いてある",
    rows.find((r) => r.id === "gen_nihon")?.note ?? "",
  );

  // 勝ち上がりの先は、優勝するまで現れない（進み具合が伝わるように）
  const after = st.seasonSchedule();

  // 勝ち上がりの先は、優勝するまで現れない（進み具合が伝わるように）
  ok(!after.some((r) => r.id === "mid_ken"), "都道府県予選は地区予選を勝つまで出てこない");
}

// ================================================================ 年齢超過は翌月で退会（猶予1ヶ月）

head("年齢超過：その場では消えず、翌月で退会する");
{
  const st = newGame(321);
  // 学童の1人を小6にして、年度更新で中1にする（学童は小6まで）
  const kid = st.students.gakudo[0];
  kid.grade = "小6";
  const id = kid.id;

  // --- 年度の変わり目：消えずに「来月で退会」が付く
  let guard = 0;
  while (st.month !== 12 && guard++ < 24) st.advanceMonth();
  const roll = st.advanceMonth(); // 12月 → 翌年1月（ここで進級）
  ok(kid.grade === "中1", "学年が上がって中1になる", kid.grade);
  ok(st.students.gakudo.includes(kid), "その場では名簿から消えない");
  ok(kid.leaveAtMonth != null, "「来月で退会」の予告が付く", `${kid.leaveAtMonth}`);
  ok(roll.leavingSoon.some((s) => s.id === id), "月送りの結果に予告が乗る", `${roll.leavingSoon.length}人`);
  ok(
    roll.ageEvents.some((e) => e.includes("来月で退会")),
    "お知らせの文にも「来月で退会」と出る",
    roll.ageEvents.find((e) => e.includes("退会")) ?? "",
  );
  ok(st.leavingStudents().some((s) => s.id === id), "退会予定の一覧から引ける");
  // 【人数で見ない】この12ヶ月のあいだに入会も進級もあるので、在籍数は増減する。
  // 見たいのは「年度更新のその月に退会した子はいない」こと。
  ok(
    !roll.ageEvents.some((e) => e.endsWith("が退会")),
    "年度更新の月には誰も退会していない",
    roll.ageEvents.filter((e) => e.endsWith("が退会")).join("・"),
  );

  // --- 翌月：予告どおり退会する
  const next = st.advanceMonth();
  ok(!st.students.gakudo.includes(kid), "翌月に名簿から外れる");
  ok(st.findStudent(id) == null, "どのクラスにもいない");
  ok(
    next.ageEvents.some((e) => e.includes("が退会")),
    "退会のお知らせが出る",
    next.ageEvents.find((e) => e.includes("退会")) ?? "",
  );
  ok(next.leavingSoon.length === 0, "同じ月に新しい予告は出ない");
}

head("猶予のあいだに昇格させれば残せる");
{
  const st = newGame(322);
  const kid = st.students.gakudo[0];
  kid.grade = "小6";
  let guard = 0;
  while (st.month !== 12 && guard++ < 24) st.advanceMonth();
  st.advanceMonth();
  ok(kid.leaveAtMonth != null, "まず予告が付く", `${kid.leaveAtMonth}`);

  // 中1は育成A（中3まで）に入れる
  const up = st.promoteStudentTo(kid, "ikuseiA");
  ok(up.ok, "育成Aへ上げられる", up.reason ?? "");
  ok(kid.leaveAtMonth === null, "上げると予告が消える");

  st.advanceMonth();
  ok(st.findStudent(kid.id) != null, "翌月になっても残っている", kid.classId);
  ok(st.leavingStudents().length === 0, "退会予定は誰もいない");
}

head("退会の予告が「今月の一手」に出る");
{
  const st = newGame(323);
  const kid = st.students.gakudo[0];
  kid.grade = "小6";
  let guard = 0;
  while (st.month !== 12 && guard++ < 24) st.advanceMonth();
  st.advanceMonth();
  const a = monthlyAdvice(st, "第1週");
  ok(!!a && a.text.includes("退会"), "案内が退会の予告になる", a?.text ?? "");
  ok(a?.go === "roster", "行き先は名簿", a?.go ?? "");
  ok(!!a && a.text.includes("残せる"), "残す手立てが書いてある", a?.text ?? "");
}

head("退会の予告はセーブに残る（v29 → v30）");
{
  const st = newGame(324);
  const kid = st.students.gakudo[0];
  kid.grade = "小6";
  let guard = 0;
  while (st.month !== 12 && guard++ < 24) st.advanceMonth();
  st.advanceMonth();
  const mark = kid.leaveAtMonth;
  ok(mark != null, "予告が付いている", `${mark}`);

  const data = buildSave(st, new GameClock(), 0);
  const st2 = new GameState(rng(9), { clubName: "読み込み" });
  applySave(JSON.parse(JSON.stringify(data)), st2, new GameClock());
  const kid2 = st2.findStudent(kid.id);
  ok(kid2?.leaveAtMonth === mark, "読み込んでも予告が同じ月のまま", `${kid2?.leaveAtMonth}`);

  // 予告を持たない古いセーブ（v29 相当）は「予定なし」で読める
  const older = JSON.parse(JSON.stringify(data)) as { game: { students: Record<string, unknown>[] } };
  for (const sv of older.game.students) delete sv.leaveAtMonth;
  const st3 = new GameState(rng(10), { clubName: "旧版" });
  applySave(older as never, st3, new GameClock());
  ok(st3.leavingStudents().length === 0, "古いセーブは予告なしで読み込まれる");
}

// ================================================================ 降格（スクールまで戻せる）

head("降格：スクールまで戻せる");
{
  const st = newGame(311);
  // 育成Bに1人だけ置いて、そこから戻す
  st.students.ikuseiB.length = 0;
  const kid = st.students.gakudo[0];
  kid.grade = "小4";
  ok(st.promoteStudent(kid).ok && kid.classId === "ikuseiB", "まず育成Bへ上げる", kid.classId);

  // --- 行き先は学年で決まる（小4なら学童）
  ok(st.demotionTargetOf(kid) === "gakudo", "小4の降格先は学童", String(st.demotionTargetOf(kid)));
  const back = st.demoteStudent(kid);
  ok(back.ok, "スクールへ降格できる", back.reason ?? "");
  ok(kid.classId === "gakudo" && back.to === "gakudo", "学童に入っている", kid.classId);
  ok(st.students.ikuseiB.indexOf(kid) < 0, "育成Bの席が空く（定員が戻る）");

  // 【戻すと何ができなくなるか】スクール生は大会に出せない
  ok(!st.timeTrialAthletes().includes(kid), "戻した子は記録会に出せない");

  // --- 上げ直せる（行き止まりにしない）
  const again = st.promoteStudent(kid);
  ok(again.ok && kid.classId === "ikuseiB", "もう一度 育成Bへ上げ直せる", kid.classId);

  // --- 小1に満たない子は幼児へ（学童は小1から）
  const st2 = newGame(312);
  const little = st2.students.youji[0];
  little.grade = "年長";
  ok(st2.promoteStudent(little).ok, "年長でも育成Bへ上げられる", little.classId);
  ok(st2.demotionTargetOf(little) === "youji", "年長の降格先は幼児（学童ではない）", String(st2.demotionTargetOf(little)));
  ok(st2.demoteStudent(little).ok && little.classId === "youji", "幼児に戻る", little.classId);

  // --- 年齢を超えているクラスへは戻せない（戻した先で退会になるため）
  const st3 = newGame(313);
  const teen = st3.students.gakudo[0];
  teen.grade = "中2";
  ok(st3.promoteStudentTo(teen, "ikuseiA").ok, "中2を育成Aへ", teen.classId);
  const r3 = st3.demoteStudent(teen);
  ok(!r3.ok, "中2は育成B（小6まで）へ戻せない", r3.reason ?? "");
  ok((r3.reason ?? "").includes("年齢"), "理由に「年齢」と出る", r3.reason ?? "");
  ok(teen.classId === "ikuseiA", "断られたらクラスは変わらない", teen.classId);

  // --- スクールが定員（コマが1つも無い）なら断る
  const st4 = newGame(314);
  const kid4 = st4.students.gakudo[0];
  kid4.grade = "小4";
  st4.promoteStudent(kid4);
  st4.timetable.length = 0; // スクールの定員は時間割のコマ数で決まる
  const r4 = st4.demoteStudent(kid4);
  ok(!r4.ok, "スクールに空きが無ければ降格できない", r4.reason ?? "");
  ok((r4.reason ?? "").includes("定員"), "理由に「定員」と出る", r4.reason ?? "");

  // --- いちばん下（幼児）からは降格できない
  const st5 = newGame(315);
  ok(st5.demotionTargetOf(st5.students.youji[0]) === null, "幼児に降格先は無い");
  ok(!st5.demoteStudent(st5.students.youji[0]).ok, "幼児は降格できない");
}

// ================================================================ 昇格と記録会の出場資格

head("昇格は幼児から／記録会は育成B以上");
{
  const st = newGame();
  // 【スクールだけの状態から確かめる】チュートリアルを廃止して、新規ゲームは
  // 最初から育成B〜プロに生徒がいる（→ START.roster）。ここで見たいのは
  // 「スクールの子を上げると記録会に出せるようになる」ことなので、上のクラスは空にする。
  for (const id of ["ikuseiB", "ikuseiA", "senshu", "pro"] as ClassId[]) st.students[id].length = 0;

  // スクール（幼児・学童）からの昇格先は、どちらも育成B
  const y = st.students.youji[0];
  const yGrade = y.grade;
  const rY = st.promoteStudent(y);
  ok(rY.ok, `幼児（${yGrade}）を昇格できる`, rY.reason ?? "");
  ok(y.classId === "ikuseiB", "幼児の昇格先は育成B（学童を経由しない）", y.classId);

  const g = st.students.gakudo[0];
  const rG = st.promoteStudent(g);
  ok(rG.ok && g.classId === "ikuseiB", "学童の昇格先も育成B", g.classId);

  // 育成Bのままで記録会に出せる
  ok(st.competitionAthletes().length === 0, "選手・プロはまだ1人もいない");
  ok(st.timeTrialAthletes().length === 2, "記録会に出せるのは育成B以上", `${st.timeTrialAthletes().length}人`);
  const comps = st.competitionsForClub();
  ok(comps.length > 0, "育成Bだけでも今月出られる大会がある", comps.map((c) => c.name).join("・"));
  /**
   * 【育成が出られるのは記録会と地区大会】（2026-09-23）
   * 地区大会（各ルートの入口）は育成B以上に開いた。都道府県予選から上は選手・プロだけ。
   */
  ok(
    comps.every((c) => c.route === "kirokukai" || c.scale === "area"),
    "ただし出られるのは記録会と地区大会だけ",
    comps.map((c) => c.name).join("・"),
  );
  ok(
    comps.some((c) => c.scale === "area"),
    "育成Bでも地区大会には出られる",
    comps.filter((c) => c.scale === "area").map((c) => c.name).join("・"),
  );
  ok(
    !comps.some((c) => c.scale === "ken" || c.scale === "block" || c.scale === "national"),
    "都道府県予選から上には出られない",
  );
  const kk = comps[0];
  ok(st.eligibleAthletesFor(kk).length === 2, "記録会には育成Bの2人とも出せる");
  ok(st.raceEntryStatus(y, kk, []).ok, "幼児から上げた子も記録会に出せる", st.raceEntryStatus(y, kk, []).reason ?? "");

  // 年間予定でも、記録会の行が「出られる」になる
  const kkRow = st.seasonSchedule().find((r) => r.id === "kk_area");
  ok(!!kkRow?.open, "年間予定の記録会が出場できる状態になる", kkRow?.note ?? "");

  // 主要大会は選手・プロのまま（育成の子は弾く）
  {
    const st2 = newGame(5);
    const kid = st2.students.gakudo.find((x) => x.grade.startsWith("中")) ?? st2.students.gakudo[0];
    st2.promoteStudent(kid); // → 育成B
    const major = { id: "mid_area", name: "地区予選（中学）", month: 4, scale: "ken", route: "middle", qualifier: true } as const;
    const status = st2.raceEntryStatus(kid, major, []);
    ok(!status.ok, "育成Bの子は予選から勝ち上がる大会には出せない", status.reason ?? "");
    // 選手まで上げれば出せる（学年条件を満たす子だけ）
    st2.promoteStudent(kid);
    st2.promoteStudent(kid);
    ok(kid.classId === "senshu", "育成B → 育成A → 選手 と上げられる", kid.classId);
  }
}


// ================================================================ 昇格先を選べる

head("昇格先は選べる（育成Bが定員でも上のクラスへ上げられる）");
{
  const st = newGame(201);
  const gen = rng(777);

  // --- 上のクラスが全部候補に出る
  const kid = st.students.gakudo.find((x) => x.grade.startsWith("小")) ?? st.students.gakudo[0];
  const targets = st.promotionTargets(kid);
  ok(
    targets.map((t) => t.classId).join(",") === "ikuseiB,ikuseiA,senshu,pro",
    "スクール生には育成B〜プロが候補に出る",
    targets.map((t) => t.label).join("・"),
  );
  ok(
    targets.every((t) => t.capacity === classDef(t.classId).capacity),
    "候補には定員が付いてくる",
    targets.map((t) => `${t.label}${t.filled}/${t.capacity}`).join(" "),
  );
  ok(
    targets.filter((t) => t.ok).length >= 3,
    "小学生なら育成B・育成A・選手を選べる",
    targets.filter((t) => t.ok).map((t) => t.label).join("・"),
  );
  const pro = targets.find((t) => t.classId === "pro")!;
  ok(!pro.ok, "プロは学年が足りず選べない", pro.reason ?? "");

  // --- 【本題】育成Bを定員まで埋めても、その上へ上げられる
  const capB = st.capacityOf("ikuseiB");
  while (st.students.ikuseiB.length < capB) {
    st.students.ikuseiB.push(createStudent(gen, 8100 + st.students.ikuseiB.length, "ikuseiB"));
  }
  ok(st.students.ikuseiB.length === capB, "育成Bを定員まで埋めた", `${st.students.ikuseiB.length}/${capB}人`);

  const full = st.promotionTargets(kid);
  const b = full.find((t) => t.classId === "ikuseiB")!;
  const a = full.find((t) => t.classId === "ikuseiA")!;
  ok(!b.ok, "育成Bは定員で選べない", b.reason ?? "");
  ok((b.reason ?? "").includes("定員"), "理由に「定員」と出る", b.reason ?? "");
  ok(a.ok, "**育成Aはそのまま選べる（詰まらない）**");

  const r = st.promoteStudentTo(kid, "ikuseiA");
  ok(r.ok, "育成Bを飛ばして育成Aへ上げられる", r.reason ?? "");
  ok(kid.classId === "ikuseiA", "本当に育成Aに入っている", kid.classId);

  // 一括昇格（名簿）も、詰まっていたら自動で上のクラスへ回す
  const other = st.students.gakudo.find((x) => x.grade.startsWith("小"))!;
  const r2 = st.promoteStudent(other);
  ok(r2.ok, "「ひとつ上」が定員でも昇格できる", r2.reason ?? "");
  ok(other.classId === "ikuseiA", "空いているいちばん下のクラスへ入る", other.classId);

  // --- 選べないクラスへは上げられない（画面をすり抜けても弾く）
  const bad = st.promoteStudentTo(other, "pro");
  ok(!bad.ok, "学年が足りないクラスへは上げられない", bad.reason ?? "");
  ok(other.classId === "ikuseiA", "弾かれたらクラスは変わらない", other.classId);

  // --- 年齢を超えているクラスは理由つきで選べない
  const st3 = newGame(202);
  const teen = st3.students.gakudo[0];
  teen.grade = "中1"; // 育成B（小6まで）は超過、育成A（中3まで）は入れる
  const t3 = st3.promotionTargets(teen);
  const b3 = t3.find((t) => t.classId === "ikuseiB")!;
  const a3 = t3.find((t) => t.classId === "ikuseiA")!;
  ok(!b3.ok, "中1は育成Bの年齢を超えている", b3.reason ?? "");
  ok((b3.reason ?? "").includes("年齢"), "理由に「年齢」と出る", b3.reason ?? "");
  ok(a3.ok, "育成Aなら入れる");
  ok(st3.promoteStudent(teen).ok && teen.classId === "ikuseiA", "自動でも育成Aへ行く", teen.classId);

  // --- 全部埋まっているときは、いちばん近いクラスの理由を返す
  const st4 = newGame(203);
  const gen4 = rng(778);
  for (const c of ["ikuseiB", "ikuseiA", "senshu"] as ClassId[]) {
    while (st4.students[c].length < st4.capacityOf(c)) {
      st4.students[c].push(createStudent(gen4, 8300 + st4.students[c].length, c));
    }
  }
  const stuck = st4.students.gakudo.find((x) => x.grade.startsWith("小"))!;
  const r4 = st4.promoteStudent(stuck);
  ok(!r4.ok, "全部定員なら昇格できない", r4.reason ?? "");
  ok((r4.reason ?? "").includes("育成B"), "理由はいちばん近いクラスのもの", r4.reason ?? "");

  // --- プロは最上位（候補なし）
  const proKid = createStudent(rng(779), 8400, "pro");
  st4.students.pro.push(proKid);
  ok(st4.promotionTargets(proKid).length === 0, "プロには上げ先が無い");
  ok(!st4.promoteStudent(proKid).ok, "プロは昇格できない", st4.promoteStudent(proKid).reason ?? "");
}

// ================================================================ 序盤の手ごたえ

head("序盤の手ごたえ（初日に決めることがあるか）");
{
  const st = newGame();
  const fin = st.monthlyFinance();
  const net = fin.tuition + fin.shop - (fin.upkeep + fin.salary + fin.dorm + fin.proSalary);
  console.log(`  1ヶ月目の月収 ◆${net}／地区記録会の優勝 ◆${SCALE_REWARD.kirokukai.gems}`);

  // 初日から出られる大会があること（記録会は参加料がほぼ無料で、毎月開かれている）
  const kid = st.students.gakudo[0];
  for (let i = 0; i < 3; i++) if (!st.promoteStudent(kid).ok) break;
  const comps = st.competitionsForClub();
  ok(comps.length > 0, "学童を選手に上げれば、初日から大会に出られる", comps.map((c) => c.name).join("・"));
  ok(comps.every((c) => st.raceEntryFee(c) <= 5), "記録会の参加料は序盤でも払える", `◆${comps.map((c) => st.raceEntryFee(c)).join("/")}`);

  // 【手ごたえ】いちばん下の段の優勝が、序盤の月収に対して意味のある額であること。
  // ここが軽いと「勝っても何も起きない」＝することがない、という手ざわりになる。
  ok(
    SCALE_REWARD.kirokukai.gems >= net * 0.3,
    "地区記録会の優勝は序盤の月収に対して手ごたえがある",
    `◆${SCALE_REWARD.kirokukai.gems} ≧ 月収◆${net} × 0.3`,
  );

  // ラダーは登るほど報酬が増え、どの段も「勝てば黒字」
  const ladder = ["kirokukai", "ken", "block", "national", "nihon", "asia", "sekai"] as const;
  let rising = true;
  for (let i = 1; i < ladder.length; i++) {
    if (SCALE_REWARD[ladder[i]].gems <= SCALE_REWARD[ladder[i - 1]].gems) rising = false;
    if (SCALE_REWARD[ladder[i]].popularity <= SCALE_REWARD[ladder[i - 1]].popularity) rising = false;
  }
  ok(rising, "段を上がるほど賞金も人気も増える", ladder.map((k) => `◆${SCALE_REWARD[k].gems}`).join("→"));
  ok(
    ladder.every((k) => SCALE_REWARD[k].gems > SCALE_ENTRY_FEE[k] + SCALE_TRAVEL_FEE[k]),
    "どの段も、優勝すれば1人ぶんの出場費より多く戻る",
  );
}

// ================================================================ 敷地の拡張と入口

head("敷地の拡張と入口（塀までついてくる・動かせる）");
{
  const st = newGame();
  st.gems = 99_999_999;
  const gate0 = placedRooms(st.map()).find((r) => r.kind === "entrance")!;
  ok(touchesPerimeter(st.map(), gate0), "最初から入口は外周の道路に面している");
  ok(landInnerSize(0) === MAP.baseInner, "初期の敷地は baseInner マス角", `${landInnerSize(0)}マス角`);
  {
    const full = landBoundsOf(MAP.maxLandSteps);
    ok(
      full.x1 <= MAP.cols - 1 - MAP.roadRing && full.y1 <= MAP.rows - 1 - MAP.roadRing,
      "最大まで広げても外周の道路がマップに収まる",
      `${landSizeOf(MAP.maxLandSteps).w}×${landSizeOf(MAP.maxLandSteps).h} / マップ ${MAP.cols}`,
    );
  }

  // 広げるたびに、入口が新しい塀の位置まで動くこと
  let steps = 0;
  let stayed = true;
  while (st.expandLand().ok) {
    st.gems = 99_999_999;
    steps++;
    const g = placedRooms(st.map()).find((r) => r.kind === "entrance")!;
    if (!touchesPerimeter(st.map(), g)) stayed = false;
  }
  ok(steps === MAP.maxLandSteps, "最大まで広げられる", `${steps}段`);
  ok(stayed, "敷地を広げても入口は新しい塀のところまでついてくる");
  ok(activeEntrances(st.map()).length > 0, "広げたあとも入口は機能している");
  ok(st.strandedRooms().length === 0, "広げたあとも全部の部屋に行ける");

  // 【再発防止】広げた土地に普通に置ける。
  // 「もしもの地図」に landSteps を渡し忘れると、買い足した土地が敷地の外あつかいになり、
  // 何を置こうとしても「通路をふさいでしまいます」で置けなくなる。
  const LB = landBounds(st.map());
  const onNewLand = st.checkPlacement("studio", LB.x0 + 1, LB.y0 + 1);
  ok(onNewLand.ok, "敷地を広げたあと、買い足した土地に置ける", onNewLand.reason ?? "");

  // 入口は別の辺へ動かせる（私道が自動で繋がるので、通路封鎖にはならない）
  const gate = placedRooms(st.map()).find((r) => r.kind === "entrance")!;
  const entF = footprintOf("entrance");
  const moveTo = { gx: LB.x0, gy: LB.y1 - entF.h + 1 };
  const canMove = st.checkPlacement("entrance", moveTo.gx, moveTo.gy, gate.id);
  ok(canMove.ok, "入口は外周に面していれば別の辺へ動かせる", canMove.reason ?? "");
  const strandedBefore = st.strandedRooms().length;
  st.placeRoom(gate, moveTo.gx, moveTo.gy, false);
  ok(
    st.strandedRooms().length <= strandedBefore,
    "動かしても行けない部屋は増えない（私道が繋がる）",
    `${strandedBefore} → ${st.strandedRooms().length}`,
  );
  ok(activeEntrances(st.map()).length > 0, "動かした先でも入口は機能している");
}

// ================================================================ 受付は廃止（入口があれば入館できる）

head("受付を無くしても一般客が入館できる");
{
  const g = newGame();
  g.gems = 9_999_999;
  while (g.expandLand().ok) g.gems = 9_999_999;
  g.buyEquipment("gym");
  g.addPopularity(300);
  ok(
    !g.equipment.some((e) => (e.kind as string) === "reception"),
    "受付という部屋がもう無い",
    g.equipment.map((e) => e.kind).join(","),
  );
  for (let m = GUESTS.openMinute; m < GUESTS.closeMinute; m += 10) g.tickGuests(m, 10);
  ok(g.guestMonth.served > 0, "受付が無くても一般客が入館する", `${g.guestMonth.served}人`);
  ok(g.staffSalary() === 0, "受付スタッフの固定費が無い");
}

// ================================================================ 建物の外を動く車

head("車（通りを流れる／駐車場に出入りする）");
{
  const st = newGame();
  const map = st.map();

  // 通りの車：一周ぐるりと回っても、必ず車道の上にいること
  for (const ring of [OUTSIDE_BANDS.walk + 1, OUTSIDE_BANDS.street]) {
    const loop = roadLoop(map, ring);
    let offRoad = 0;
    for (let s = 0; s < loop.length; s += 0.5) {
      const p = pointOnLoop(loop, s);
      if (floorKindAt(map, Math.round(p.gx), Math.round(p.gy)) !== "street") offRoad++;
    }
    ok(offRoad === 0, `${ring === OUTSIDE_BANDS.street ? "外回り" : "内回り"}は一周ずっと車道の上`, `外れ ${offRoad}`);
  }
  {
    const loop = roadLoop(map, OUTSIDE_BANDS.walk + 1);
    ok(loop.length > 0 && pointOnLoop(loop, 0).gx === pointOnLoop(loop, loop.length).gx, "一周すると元の場所に戻る");
  }

  // 車は1台残らず走っている（停めっぱなしの車は置かない）
  const still = new Set(outdoorScatter(map, 60, OUTSIDE_BANDS.street).map((x) => x.texture));
  ok(![...still].some((t) => t.startsWith("odCar")), "止まっている車が1台も無い", [...still].join("・"));
}

// ================================================================ 部屋は器具込み／グレード

head("部屋は器具込み・グレードで中身が変わる");
{
  const st = newGame(77);
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;

  // 器具も外構の装飾も「1個ずつ買って置く」仕組みは廃止（部屋のグレードに一本化）
  st.buyEquipment("gym");
  st.gems = 99_999_999;
  const gym = st.equipment.find((e) => e.kind === "gym")!;
  ok(st.gradeOfRoom(gym) === 1, "買った部屋は「小」から始まる", gradeLabel(st.gradeOfRoom(gym)));

  // 建てただけで器具が入っている＝同時に使える台数がある
  const st1 = st.stationCount("gym");
  ok(st1 > 0, "建てた時点で器具が入っている（使える台数がある）", `${st1}台`);
  const boost1 = st.gymGearBoost();
  ok(boost1 > 0, "器具を1つも買わなくてもスピードに効く", `+${boost1.toFixed(2)}`);
  const upkeep1 = st.roomUpkeep(gym);

  // グレードアップ
  const cost = st.upgradeRoomCost(gym);
  ok(cost > 0, "グレードアップに費用がかかる", `◆${cost}`);
  const gems = st.gems;
  ok(st.upgradeRoom(gym).ok, "グレードを上げられる");
  ok(st.gems === gems - cost, "上げたぶんだけジェムが減る", `◆${gems} → ◆${st.gems}`);
  ok(st.gradeOfRoom(gym) === 2, "グレードが「中」になる", gradeLabel(st.gradeOfRoom(gym)));

  const st2 = st.stationCount("gym");
  ok(st2 > st1, "同時に使える台数が増える", `${st1} → ${st2}台`);
  ok(st.gymGearBoost() > boost1, "練習効果も上がる", `+${boost1.toFixed(2)} → +${st.gymGearBoost().toFixed(2)}`);
  ok(st.roomUpkeep(gym) > upkeep1, "維持費も上がる", `◆${upkeep1} → ◆${st.roomUpkeep(gym)}`);

  st.upgradeRoom(gym);
  ok(st.gradeOfRoom(gym) === 3, "「大」まで上げられる", gradeLabel(st.gradeOfRoom(gym)));
  ok(!st.canUpgradeRoom(gym).ok, "それ以上は上げられない", st.canUpgradeRoom(gym).reason ?? "");
  ok(st.stationCount("gym") > st2, "「大」はさらに台数が多い", `${st2} → ${st.stationCount("gym")}台`);

  // グレードを持たない部屋は上げられない
  st.buyEquipment("coachroom");
  const coachroom = st.equipment.find((e) => e.kind === "coachroom")!;
  ok(!st.canUpgradeRoom(coachroom).ok, "グレードを持たない部屋は上げられない", st.canUpgradeRoom(coachroom).reason ?? "");

  // マッサージエリアは「グレードで効きも定員も伸びる」（小4・中6・大10名）
  const st3 = newGame(78);
  st3.gems = 9_999_999;
  while (st3.expandLand().ok) st3.gems = 9_999_999;
  st3.buyEquipment("recovery");
  st3.gems = 9_999_999;
  const rec = st3.equipment.find((e) => e.kind === "recovery")!;
  const seats1 = st3.recoveryCapacity();
  ok(seats1 === RECOVERY_ROOM.massageSeatsByGrade[0], "マッサージエリア（小）の定員は4名", `${seats1}席`);
  const energy1 = recoverySlots(st3.usableEquipment())[0].energy;
  st3.upgradeRoom(rec);
  st3.gems = 9_999_999;
  const energy2 = recoverySlots(st3.usableEquipment())[0].energy;
  const seats2 = st3.recoveryCapacity();
  ok(seats2 > seats1, "グレードを上げると定員が増える", `${seats1} → ${seats2}席`);
  ok(energy2 > energy1, "グレードを上げると1回の回復量が増える", `${(energy1 * 100).toFixed(0)}% → ${(energy2 * 100).toFixed(0)}%`);
  st3.upgradeRoom(rec);
  st3.gems = 9_999_999;
  const seats3 = st3.recoveryCapacity();
  ok(seats3 === RECOVERY_ROOM.massageSeatsByGrade[2], "「大」は10名", `${seats3}席`);
  // 施設をもう1つ建てれば、そのぶん同時に回復できる人数が増える
  st3.buyEquipment("bath");
  ok(
    st3.recoveryCapacity() === seats3 + RECOVERY_ROOM.seatsPerRoom,
    "施設を増やすと回せる人数が増える",
    `${st3.recoveryCapacity()}席`,
  );
}

// ================================================================ 休養（1週間まるごと）

head("休養は1週間・取り消したらすぐ練習に戻る");
{
  const st = newGame(101);
  st.gems = 99_999_999;
  // 育成Bに数人入れて、時間割に1コマ入れる（練習の顔ぶれを見るため）
  const pool = st.placedPools()[0];
  for (const e of [...st.timetable]) st.setTimetableEntry(e.poolId, e.slot, null, null);
  st.setTimetableEntry(pool.id, 1, "ikuseiB", st.coaches[0].id);
  const gen = rng(555);
  const members = [0, 1, 2].map((i) => {
    const x = createStudent(gen, 7100 + i, "ikuseiB");
    st.students.ikuseiB.push(x);
    return x;
  });
  const target = members[0];
  // 時間割の「コマ1」＝ SLOTS[1]（開店の10:00から）。SLOTS[0] は開店前のコマ。
  const minute = SLOTS[1].start + 10;
  const inLineup = (): boolean =>
    st.practicingNow(minute, "ikuseiB").some((x) => x.id === target.id);

  ok(inLineup(), "はじめは練習の顔ぶれに入っている");

  // --- 休養させる＝1週間ぶん
  const weeks = st.restStudent(target);
  ok(weeks === REST.weeks, `休養は${REST.weeks}週ぶん`, `${weeks}週`);
  ok(st.isRestingNow(target), "休養中になる");
  ok(st.restWeeksLeftOf(target) === REST.weeks, "あと何週かが分かる", `${st.restWeeksLeftOf(target)}週`);
  ok(!inLineup(), "休養中は練習の顔ぶれから外れる");
  ok(st.restScheduledCount("ikuseiB") === 1, "クラスの休養人数に数えられる");

  // --- 連打しても伸びない
  st.restStudent(target);
  ok(st.restWeeksLeftOf(target) === REST.weeks, "連打しても休みは伸びない", `${st.restWeeksLeftOf(target)}週`);

  // --- 【不具合の再現】取り消したら、その場で練習に戻る
  // 以前は「休んでいる」という旗が残り、旗を下ろす処理（練習の開始・終了）は
  // 休養中の選手を見ないため、取り消しても永久に練習へ戻らなかった。
  st.cancelRestOf(target);
  ok(!st.isRestingNow(target), "取り消すと休養が解ける");
  ok(st.restWeeksLeftOf(target) === 0, "残り週数も0になる");
  ok(inLineup(), "取り消したら**すぐ**練習の顔ぶれに戻る");

  // 練習のコマを開け閉めしても、休養に戻ったりしない（旗が残っていない証拠）
  st.beginClassSession("ikuseiB", st.practicingNow(minute, "ikuseiB"), 1);
  st.tickPractice("ikuseiB", 10, undefined, st.practicingNow(minute, "ikuseiB"));
  st.endClassSession("ikuseiB", st.practicingNow(minute, "ikuseiB"));
  ok(inLineup(), "コマをまたいでも練習に出続ける");

  // --- 週が変われば自動で復帰する
  const st2 = newGame(102);
  const who = st2.students.gakudo[0] ?? st2.students.youji[0];
  st2.restStudent(who);
  ok(st2.isRestingNow(who), "休養に入る");
  st2.onDayRoll(); // 1日＝1週
  ok(!st2.isRestingNow(who), "1週たてば自動で練習に戻る（指示し直さなくてよい）");

  // --- 休養中は体力と調子が戻る
  const st3 = newGame(103);
  st3.gems = 9_999_999;
  const tired = createStudent(rng(556), 7200, "ikuseiB");
  st3.students.ikuseiB.push(tired);
  tired.energy = 10;
  tired.condition = 30;
  st3.restStudent(tired);
  const e0 = tired.energy;
  const c0 = tired.condition;
  st3.tickPractice("ikuseiB", 60); // 休養中の選手は tickResting が面倒を見る
  ok(tired.energy > e0, "休養中は体力が戻る", `${e0.toFixed(1)} → ${tired.energy.toFixed(1)}`);
  ok(tired.condition > c0, "調子も戻る", `${c0.toFixed(1)} → ${tired.condition.toFixed(1)}`);
  ok(tired.energy <= energyMax(tired), "最大値は超えない");

  // ときどき「ぐっすり休めた」ぶんが上乗せされる（確率なので、回数を回して差を見る）
  let bonuses = 0;
  for (let i = 0; i < 400; i++) {
    const s2 = createStudent(rng(600 + i), 7300 + i, "ikuseiB");
    s2.energy = 10;
    if (applyRestTick(s2, 5, 1, rng(900 + i)).bonus) bonuses++;
  }
  ok(bonuses > 0, "たまに余分に回復する（ぐっすり休めた）", `400回中 ${bonuses}回`);
  ok(bonuses < 400, "毎回ではない");
}

// ================================================================ 回復施設（4種類・定員4名）

head("回復施設は4種類・定員4名・練習後に1コマぶん使う");
{
  const st = newGame(104);
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;

  // --- 4種類とも建てられる
  const kinds = ["sauna", "bath", "openair", "recovery"] as const;
  for (const k of kinds) {
    st.buyEquipment(k);
    st.gems = 99_999_999;
  }
  ok(
    kinds.every((k) => st.equipmentCount(k) === 1),
    "サウナ・風呂・外気浴・マッサージエリアの4種類",
    kinds.map((k) => `${equipmentDef(k).label}${st.equipmentCount(k)}`).join(" "),
  );
  ok(equipmentDef("recovery").label === "マッサージエリア", "回復エリアはマッサージエリアという名前", equipmentDef("recovery").label);

  const slots = recoverySlots(st.usableEquipment());
  for (const k of kinds) {
    const n = slots.filter((s2) => s2.kind === k).length;
    ok(n === RECOVERY_ROOM.seatsPerRoom, `${equipmentDef(k).label} の定員は4名`, `${n}席`);
  }
  ok(slots.length === kinds.length * RECOVERY_ROOM.seatsPerRoom, "4施設で合計16名", `${slots.length}席`);
  ok(
    slots.every((s2) => s2.minutes === RECOVERY_ROOM.useMinutes),
    "どの施設も1コマぶん使う",
    `${RECOVERY_ROOM.useMinutes}分`,
  );

  // --- 体力はいつも戻り、調子は確率で上がる
  ok(slots.every((s2) => s2.energy > 0), "どの施設でも体力は必ず少し戻る");
  ok(
    slots.every((s2) => s2.conditionChance > 0 && s2.conditionChance < 1),
    "調子が上がるのは確率（必ずでも、絶対でもない）",
    [...new Set(slots.map((s2) => `${Math.round(s2.conditionChance * 100)}%`))].join(" / "),
  );
  const one = slots[0];
  let condUp = 0;
  let energyUp = 0;
  for (let i = 0; i < 300; i++) {
    const s2 = createStudent(rng(700 + i), 7400 + i, "senshu");
    s2.energy = 10;
    s2.condition = 40;
    const g = applyRecovery(s2, one, rng(800 + i));
    if (g.condition > 0) condUp++;
    if (g.energy > 0) energyUp++;
  }
  ok(energyUp === 300, "体力は毎回戻る", `300回中 ${energyUp}回`);
  ok(condUp > 0 && condUp < 300, "調子は上がるときと上がらないときがある", `300回中 ${condUp}回`);

  // --- どの施設を使うかはランダム（全員が同じ施設に固まらない）
  const st5 = newGame(105);
  st5.gems = 9_999_999;
  while (st5.expandLand().ok) st5.gems = 9_999_999;
  for (const k of kinds) {
    st5.buyEquipment(k);
    st5.gems = 9_999_999;
  }
  const crowd = [];
  for (let i = 0; i < 12; i++) {
    const s2 = createStudent(rng(950 + i), 7500 + i, "senshu");
    s2.energy = 5;
    s2.recoveryNeed = 90;
    crowd.push(s2);
  }
  const report = planRecovery(crowd, recoverySlots(st5.usableEquipment()), rng(31));
  const used = new Set(report.outcomes.filter((o) => o.slot).map((o) => o.slot!.kind));
  ok(report.used > 0, "疲れた選手が回復施設を使う", `${report.used}人`);
  ok(used.size >= 2, "行き先は1か所に固まらない（ランダムに散る）", [...used].join("・"));

  // --- 定員を超えると待ち・諦めが出る
  const st6 = newGame(106);
  st6.gems = 9_999_999;
  while (st6.expandLand().ok) st6.gems = 9_999_999;
  st6.buyEquipment("bath"); // 1施設だけ＝4名まで
  const many = [];
  for (let i = 0; i < 20; i++) {
    const s2 = createStudent(rng(970 + i), 7600 + i, "senshu");
    s2.energy = 5;
    s2.recoveryNeed = 90;
    many.push(s2);
  }
  const r6 = planRecovery(many, recoverySlots(st6.usableEquipment()), rng(41));
  ok(
    r6.used <= RECOVERY_ROOM.seatsPerRoom,
    "1施設なら1コマで入れるのは定員ぶんだけ（席は1コマ埋まったまま）",
    `${r6.used}/${many.length}人`,
  );
  ok(r6.gaveUp > 0, "あぶれた選手は諦めて帰る（増設の合図になる）", `${r6.gaveUp}人`);

  // 施設を増やせば、そのぶん1コマで回復できる人数が増える
  st6.gems = 9_999_999;
  st6.buyEquipment("sauna");
  const many2 = many.map((_x, i) => {
    const s2 = createStudent(rng(990 + i), 7700 + i, "senshu");
    s2.energy = 5;
    s2.recoveryNeed = 90;
    return s2;
  });
  const r7 = planRecovery(many2, recoverySlots(st6.usableEquipment()), rng(43));
  ok(r7.used > r6.used, "施設を1つ増やすと回復できる人数が増える", `${r6.used}人 → ${r7.used}人`);
}

// ================================================================ 入会の上限

head("1回の入会は30人まで");
{
  const st = newGame(301);
  st.gems = 99_999_999;
  // 人気度をうんと上げても、1回で来るのは上限まで
  st.addPopularity(2000);
  for (const c of CLASS_ORDER) st.students[c.id].length = 0;
  st.month = 8; // 短期教室は 8・12・3月 のみ
  const before = st.students.youji.length + st.students.gakudo.length;
  const r = st.holdShortCourse();
  const added = st.students.youji.length + st.students.gakudo.length - before;
  ok(r.ok, "短期教室を開ける", r.reason ?? "");
  ok(added <= ENROLL.maxPerEvent, `人気度が高くても1回${ENROLL.maxPerEvent}人まで`, `${added}人`);
  ok(added > 0, "ちゃんと入会はする", `${added}人`);
  ok((r.turnedAway ?? 0) === 0, "上限ぶんは「断った」に数えない（そもそも来ない）", `${r.turnedAway}人`);

  // キャンペーンも同じ上限を通る
  const st2 = newGame(302);
  st2.gems = 99_999_999;
  st2.addPopularity(2000);
  for (const c of CLASS_ORDER) st2.students[c.id].length = 0;
  const b2 = st2.students.youji.length + st2.students.gakudo.length;
  const ids = CAMPAIGNS.map((c) => c.id);
  let best = 0;
  for (const id of ids) {
    const before2 = st2.students.youji.length + st2.students.gakudo.length;
    st2.gems = 99_999_999;
    st2.runCampaign(id);
    best = Math.max(best, st2.students.youji.length + st2.students.gakudo.length - before2);
  }
  void b2;
  ok(best <= ENROLL.maxPerEvent, `キャンペーンも1回${ENROLL.maxPerEvent}人まで`, `最大 ${best}人`);
}

// ================================================================ 大会の壁

head("全国決勝と世界大会には壁がある");
{
  ok(SCALE_FINAL_WALL.ken === 0 && SCALE_FINAL_WALL.block === 0, "予選（県・ブロック）に壁は無い");
  ok(SCALE_FINAL_WALL.national > 0, "全国大会の決勝には壁がある", `+${SCALE_FINAL_WALL.national}`);
  ok(
    SCALE_FINAL_WALL.sekai > SCALE_FINAL_WALL.national,
    "世界大会はいちばん高い壁",
    `全国 +${SCALE_FINAL_WALL.national} → 世界 +${SCALE_FINAL_WALL.sekai}`,
  );

  // 壁があると、同じ選手でも決勝で勝てる率が落ちる
  const ev = { stroke: "free", distance: 100 } as const;
  // 全国決勝を戦えるくらいの選手（能力95・専門度も高い）を用意する
  const mk = (): Student => {
    const x = createStudent(rng(400), 8800, "senshu");
    x.grade = "高2";
    for (const k of STAT_KEYS) {
      x.talentRank[k] = "SS";
      x.stats[k] = 88;
    }
    // 熟練度は0〜999。全国の決勝を戦う選手なので、能力を出しきれる水準にしておく
    x.strokeProf[ev.stroke] = 700;
    x.fav = { stroke: ev.stroke, distance: ev.distance };
    x.condition = 80;
    return x;
  };
  const winRate = (wall: number): number => {
    let wins = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
      const o = simulateRace(
        [{ student: mk(), extraFactor: 1 }],
        ev,
        SCALE_RIVAL_LEVEL.national,
        rng(500 + i),
        wall,
      );
      if (o.entrants[0]?.win) wins++;
    }
    return wins / runs;
  };
  const flat = winRate(0);
  const walled = winRate(SCALE_FINAL_WALL.national);
  ok(walled < flat, "壁があると決勝で勝ちにくい", `壁なし ${(flat * 100).toFixed(0)}% → 壁あり ${(walled * 100).toFixed(0)}%`);
  ok(walled > 0, "それでも勝てないわけではない（育てれば届く）", `${(walled * 100).toFixed(0)}%`);

  // 負けても「あと何秒か」が分かる
  const o = simulateRace([{ student: mk(), extraFactor: 1 }], ev, SCALE_RIVAL_LEVEL.sekai, rng(999), SCALE_FINAL_WALL.sekai);
  const me = o.entrants[0];
  ok(!!me, "結果が返る");
  ok(me.gapToWinner >= 0, "1位とのタイム差が付いてくる", `+${me.gapToWinner.toFixed(2)}秒`);
  ok(me.gapStage === "heat" || me.gapStage === "final", "どの場面での差かも分かる", me.gapStage);
  if (me.win) ok(me.gapToWinner === 0, "勝ったときの差は0");
}

// ================================================================ 記録更新の演出

head("自己新記録・大会新記録を拾えるか");
{
  const st = newGame(303);
  st.gems = 99_999_999;
  const who = createStudent(rng(401), 8900, "senshu");
  who.grade = "高2";
  for (const k of STAT_KEYS) who.stats[k] = 70;
  st.students.senshu.push(who);
  // ルートの入口（前提の無い大会＝地区予選）。ここなら勝ち上がり無しで出せる
  const comp = CALENDAR.find((c) => c.route === "high" && !c.requiresPrev)!;
  const ev = who.fav;

  const first = st.enterCompetition([who], comp, ev);
  ok(first.entries.length === 1, "1人ぶんの結果が返る");
  ok(first.entries[0].selfBest, "はじめて泳いだ種目は自己新記録になる");
  ok(!first.entries[0].meetRecord, "初出場は大会新記録にしない（毎回お祝いになってしまう）");

  // 記録は覚えている
  ok(Object.keys(st.meetRecords).length === 1, "大会ごとの記録を覚える", Object.keys(st.meetRecords)[0]);

  // 速くなれば大会新記録が出る
  for (const k of STAT_KEYS) who.stats[k] = 95;
  let sawRecord = false;
  for (let i = 0; i < 6 && !sawRecord; i++) {
    const again = st.enterCompetition([who], comp, ev);
    if (again.entries[0].meetRecord) sawRecord = true;
  }
  ok(sawRecord, "速くなれば大会新記録が出る");

  // 逆に遅くなれば出ない
  for (const k of STAT_KEYS) who.stats[k] = 30;
  const slow = st.enterCompetition([who], comp, ev);
  ok(!slow.entries[0].meetRecord, "遅ければ大会新記録にはならない");
  ok(!slow.entries[0].selfBest, "自己新記録にもならない");
}

// ================================================================ セーブ

// ================================================================ セーブ

head("セーブ v14（敷地・特別練習）");
{
  ok(SAVE_VERSION === 32, "セーブバージョンが32（v32＝施設の値上げ・払った額・記録会のコーチとの出会い）", `${SAVE_VERSION}`);
  const st = newGame();
  st.gems = 99_999_999;
  st.expandLand();
  const steps = st.landSteps;
  const save = buildSave(st, new GameClock(), 0);
  ok(save.game.landSteps === steps, "敷地の段数が保存される", `${save.game.landSteps}段`);

  const st2 = newGame(2);
  applySave(save, st2, new GameClock());
  ok(st2.landSteps === steps, "読み込んでも同じ広さ", `${st2.landSteps}段`);
  ok(st2.strandedRooms().length === 0, "読み込んだあとも全部の部屋に行ける");

  // v13（敷地の概念が無い世界）からの移行は「最大まで買ってある」扱い
  const old = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  old.version = 13;
  delete (old.game as Record<string, unknown>).landSteps;
  delete (old.game as Record<string, unknown>).specialUsed;
  const m = migrateSave(old);
  ok(m.ok, "v13 のセーブを読み込める", m.ok ? "" : m.reason);
  if (m.ok) {
    // v13 の世界は 24マス角の敷地だった。段の刻みを変えても「同じ広さ以上」を保つこと
    //（段の番号を直に書くと、baseInner を変えたときに検査だけ古い前提で残ってしまう）
    const migrated = landInnerSize(m.data.game.landSteps as number);
    ok(
      migrated >= 24,
      "古いセーブは同じ広さ以上の段に読み替わる",
      `段${m.data.game.landSteps}＝${migrated}マス角`,
    );
    const st3 = newGame(3);
    applySave(m.data, st3, new GameClock());
    ok(st3.strandedRooms().length === 0, "移行後も全部の部屋に行ける");
    ok(st3.passion === PASSION.start, "情熱が無かったセーブは開始値から始まる", `${st3.passion}`);
  }

  // v19（情熱が無い世界）からの移行
  const v19 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  v19.version = 19;
  delete (v19.game as Record<string, unknown>).passion;
  const m19 = migrateSave(v19);
  ok(m19.ok, "v19 のセーブを読み込める", m19.ok ? "" : m19.reason);
  if (m19.ok) {
    ok(m19.data.version === SAVE_VERSION, `v${SAVE_VERSION} まで引き上がる`, `${m19.data.version}`);
    ok(m19.data.game.passion === PASSION.start, "情熱は開始値が入る", `${m19.data.game.passion}`);
  }

  // v20（休養が「あと何回休む」だった世界）からの移行。
  // **旧仕様の不具合で永久に休みっぱなしになっていた選手**（resting だけ true で
  // restPending が 0）も、ここで「その週いっぱい」に読み替えられて必ず救われる。
  const v20 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  v20.version = 20;
  const g20 = v20.game as Record<string, unknown>;
  g20.dayCount = 7;
  const kids20 = g20.students as Record<string, unknown>[];
  ok(kids20.length >= 2, "移行を試すだけの選手がいる", `${kids20.length}人`);
  for (const k of kids20) delete k.restUntilDay;
  kids20[0].resting = true; // 旧仕様で固まっていた選手
  kids20[0].restPending = 0;
  kids20[1].resting = false;
  kids20[1].restPending = 2; // 休む予約が残っていた選手
  const m20 = migrateSave(v20);
  ok(m20.ok, "v20 のセーブを読み込める", m20.ok ? "" : m20.reason);
  if (m20.ok) {
    const out = m20.data.game.students as unknown as Record<string, unknown>[];
    ok(m20.data.version === SAVE_VERSION, `v${SAVE_VERSION} まで引き上がる`, `${m20.data.version}`);
    ok(out[0].restUntilDay === 8, "休んでいた選手はその週いっぱい休む扱いになる", `${out[0].restUntilDay}`);
    ok(out[1].restUntilDay === 8, "予約が残っていた選手も同じ", `${out[1].restUntilDay}`);
    ok(out.every((k) => k.restPending === undefined && k.resting === undefined), "古い持ち物は消える");
    // 読み込んで1週たてば、固まっていた選手も自動で練習に戻る
    const st4 = newGame(4);
    applySave(m20.data, st4, new GameClock());
    const stuck = st4.students[out[0].classId as ClassId].find((x) => x.id === out[0].id);
    ok(!!stuck && st4.isRestingNow(stuck), "読み込み直後はまだ休養中");
    st4.onDayRoll();
    ok(!!stuck && !st4.isRestingNow(stuck), "1週たてば練習に戻る（休みっぱなしが直る）");
  }

  // v21（才能が数値だけだった世界）からの移行。
  // talent（伸びしろ倍率）→ 3段階（無印／○／◎）→ 7段階（E〜SS）と、二段構えで読み替わること。
  const v21 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  v21.version = 21;
  const g21 = v21.game as Record<string, unknown>;
  const kids21 = g21.students as Record<string, unknown>[];
  for (const k of kids21) delete k.talentRank;
  kids21[0].talent = [1.6, 1.3, 1.0, 0.9, 1.55]; // ◎ ○ 無印 無印 ◎
  const m21 = migrateSave(v21);
  ok(m21.ok, "v21 のセーブを読み込める", m21.ok ? "" : m21.reason);
  if (m21.ok) {
    const out = m21.data.game.students as unknown as Record<string, unknown>[];
    ok(m21.data.version === SAVE_VERSION, `v${SAVE_VERSION} まで引き上がる`, `${m21.data.version}`);
    ok(
      (out[0].talentRank as string[]).join(",") === "S,B,C,C,S",
      "伸びしろの数値から7段階の才能ランクに読み替わる",
      (out[0].talentRank as string[]).join(","),
    );
    const st5 = newGame(5);
    applySave(m21.data, st5, new GameClock());
    const who = st5.students[out[0].classId as ClassId].find((x) => x.id === out[0].id)!;
    ok(who.talentRank.speed === "S", "読み込んでもランクが残る", who.talentRank.speed);
    ok(statCapOf(who, "speed") === TALENT.cap.S, "才能S の能力はSランクの上まで伸ばせる", `${statCapOf(who, "speed")}`);
    ok(statCapOf(who, "form") === TALENT.cap.C, "才能C の能力は A どまり", `${statCapOf(who, "form")}`);
  }

  // v23（才能が3段階だった世界）からの移行。none→C／good→B／great→S。
  {
    const v23 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
    v23.version = 23;
    const g23 = v23.game as Record<string, unknown>;
    const kids23 = g23.students as Record<string, unknown>[];
    kids23[0].talentRank = ["great", "good", "none", "none", "good"];
    const m23 = migrateSave(v23);
    ok(m23.ok, "v23 のセーブを読み込める", m23.ok ? "" : m23.reason);
    if (m23.ok) {
      const out23 = m23.data.game.students as unknown as Record<string, unknown>[];
      ok(m23.data.version === SAVE_VERSION, `v${SAVE_VERSION} まで引き上がる`, `${m23.data.version}`);
      ok(
        (out23[0].talentRank as string[]).join(",") === "S,B,C,C,B",
        "◎○無印が S／B／C に読み替わる",
        (out23[0].talentRank as string[]).join(","),
      );
    }
  }
}

// ================================================================ 泳法の熟練度のセーブ

head("泳法の熟練度と才能がセーブに残る（v25 → v26）");
{
  const st = newGame(35);
  const who = st.students.gakudo[0];
  who.strokeProf.free = 321.5;
  who.strokeTalent.free = 0.77;
  const save = buildSave(st, new GameClock(), 0);
  const st2 = newGame(98);
  applySave(JSON.parse(JSON.stringify(save)), st2, new GameClock());
  const back = CLASS_ORDER.flatMap((c) => st2.students[c.id]).find((x) => x.id === who.id)!;
  ok(Math.abs(back.strokeProf.free - 321.5) < 0.02, "熟練度が戻る", `${back.strokeProf.free}`);
  ok(Math.abs(back.strokeTalent.free - 0.77) < 0.002, "泳法の才能が戻る", `${back.strokeTalent.free}`);

  // v25（専門度0〜100・才能なし）からの移行
  const v25 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  v25.version = 25;
  const g25 = v25.game as Record<string, unknown>;
  const kids = g25.students as Record<string, unknown>[];
  for (const k of kids) {
    delete k.strokeTalent;
    k.strokeProf = [60, 20, 0, 10, 5]; // 旧スケール（0〜100）
  }
  const m25 = migrateSave(v25);
  ok(m25.ok, "v25 のセーブを読み込める", m25.ok ? "" : m25.reason);
  if (m25.ok) {
    ok(m25.data.version === SAVE_VERSION, `v${SAVE_VERSION} まで引き上がる`, `${m25.data.version}`);
    const out = m25.data.game.students as unknown as Record<string, unknown>[];
    const prof = out[0].strokeProf as number[];
    const tal = out[0].strokeTalent as number[];
    ok(prof[0] === 300, "専門度60 → 熟練度300（目盛りを合わせる）", `${prof[0]}`);
    ok(prof[4] === 0, "個メの欄は使わない（0にする）", `${prof[4]}`);
    ok(Array.isArray(tal) && tal.length === 4, "泳法の才能が4つ作られる", `${tal?.length}`);
    ok(tal.every((v) => v >= 0 && v <= 1), "才能は0〜1に収まる", tal.map((v) => v.toFixed(2)).join("/"));
    // いちばん鍛えていた泳法（自由形）に、いちばんの才能が来る
    ok(tal[0] === Math.max(...tal), "いちばん鍛えていた泳法に才能が寄る", tal.map((v) => v.toFixed(2)).join("/"));
    // 読み込み直しても同じ才能（id から決まる）
    const again = migrateSave(JSON.parse(JSON.stringify(v25)));
    const tal2 = again.ok ? ((again.data.game.students as unknown as Record<string, unknown>[])[0].strokeTalent as number[]) : [];
    ok(tal.join(",") === tal2.join(","), "読み込むたびに才能が変わらない");
  }
}

// ================================================================ 学年ごとの標準記録

head("標準記録は小・中・高で違う（上の学年ほど厳しい）");
{
  const ev = { stroke: "free", distance: 100 } as const;
  const sho = getStandardTime("shogaku", ev, "m")!;
  const chu = getStandardTime("zenchu", ev, "m")!;
  const ih = getStandardTime("interhigh", ev, "m")!;
  console.log(`
100m自由形（男子）  小学生 ${sho.toFixed(2)} ／ 全中 ${chu.toFixed(2)} ／ IH ${ih.toFixed(2)}`);
  ok(sho > chu && chu > ih, "小 → 中 → 高 と速くなる", `${sho} > ${chu} > ${ih}`);
  ok(ih > getStandardTime("japanOpen", ev, "m")!, "インターハイより日本トップのほうが速い");

  // 全種目で順番が崩れていないこと（片方だけ設定されている種目は飛ばす）
  let bad = 0;
  for (const e of ALL_EVENTS) {
    for (const g of ["m", "f"] as const) {
      const a = getStandardTime("shogaku", e, g);
      const b = getStandardTime("zenchu", e, g);
      const c = getStandardTime("interhigh", e, g);
      if (a != null && b != null && a <= b) bad++;
      if (b != null && c != null && b <= c) bad++;
    }
  }
  ok(bad === 0, "どの種目・どちらの性別でも順番が崩れない", `崩れ ${bad}件`);

  // 女子はジャパンオープンの男女差ぶん遅い（種目ごとに違う比）
  const f100 = getStandardTime("zenchu", ev, "f")!;
  const m100 = getStandardTime("zenchu", ev, "m")!;
  ok(f100 > m100, "女子のほうが遅いタイムになっている", `${m100} → ${f100}`);
  ok(f100 / m100 > 1.05 && f100 / m100 < 1.2, "男女差は実データの比のまま", `×${(f100 / m100).toFixed(3)}`);

  // 小学生に無い種目は「まだ挑めない」＝ null
  ok(getStandardTime("shogaku", { stroke: "free", distance: 400 }, "m") === null, "小学生に400自由形の標準は無い");
  ok(getStandardTime("zenchu", { stroke: "free", distance: 400 }, "m") !== null, "中学からは400自由形の標準がある");

  // 【参加標準記録は全世代で1つ】（2026-09-26）小学生もプロも同じ標準で判定する
  const kid = createStudent(rng(41), 7100, "senshu");
  const keysOf = (g: string): string => {
    kid.grade = g as never;
    return standardKeysFor(kid).join(",");
  };
  ok(keysOf("小3") === "nihonSenshuken", "小学生も日本選手権の参加標準記録だけを見る", keysOf("小3"));
  ok(keysOf("中2") === keysOf("小3") && keysOf("高2") === keysOf("小3"), "中学・高校も同じ標準");
  ok(keysOf("社会人") === keysOf("小3"), "社会人も同じ標準");

  // 実際に突破すると記録に残り、実績になる
  ok(standardPoints("interhigh") > standardPoints("zenchu"), "上の標準ほど実績が大きい");
  ok(standardPoints("zenchu") > standardPoints("shogaku"), "全中は小学生より大きい");
  ok(meetsStandard("zenchu", ev, "m", chu - 0.01), "標準より速ければ突破");
  ok(!meetsStandard("zenchu", ev, "m", chu + 0.01), "標準より遅ければ突破しない");
}

head("卒園したら学童へ。学童が満員なら2ヶ月待って、空かなければ退会");
{
  // --- 空きがあれば、年明けに学童へ移る
  const st = newGame(733);
  const kid = st.students.youji[0];
  kid.grade = "年長";
  let guard = 0;
  while (st.month !== 12 && guard++ < 24) st.advanceMonth();
  st.advanceMonth(); // 12月 → 1月（卒園）
  ok(kid.classId === "gakudo", "学童に空きがあれば卒園して学童へ", kid.classId);

  // --- 学童が満員：2ヶ月のあいだ待ち、毎月知らせが出る
  const st2 = newGame(734);
  const kid2 = st2.students.youji[0];
  kid2.grade = "年長";
  guard = 0;
  while (st2.month !== 12 && guard++ < 24) st2.advanceMonth();
  const fill = (): void => {
    while (st2.roomIn("gakudo") > 0) {
      const s = createStudent(rng(9000 + st2.students.gakudo.length), 90000 + st2.students.gakudo.length, "gakudo");
      s.grade = "小2";
      st2.students.gakudo.push(s);
    }
  };
  fill();
  const r1 = st2.advanceMonth(); // 1月：卒園したが学童が満員
  fill();
  ok(kid2.classId === "youji", "学童が満員なら幼児クラスに残る", kid2.classId);
  ok(r1.gakudoWaiting.some((w) => w.student.id === kid2.id && w.monthsLeft === 2), "1ヶ月目：あと2ヶ月と知らせる",
    `${r1.gakudoWaiting.map((w) => w.monthsLeft).join(",")}`);
  const r2 = st2.advanceMonth(); // 2月
  fill();
  ok(r2.gakudoWaiting.some((w) => w.student.id === kid2.id && w.monthsLeft === 1), "2ヶ月目：来月で退会と知らせる");
  ok(st2.students.youji.includes(kid2), "2ヶ月目はまだ在籍");
  st2.advanceMonth(); // 3月：空かなかったので退会
  ok(!st2.students.youji.includes(kid2) && !st2.students.gakudo.includes(kid2), "2ヶ月空かなければ退会");

  // --- 待っているあいだに学童が空けば、自動で学童へ
  const st3 = newGame(735);
  const kid3 = st3.students.youji[0];
  kid3.grade = "年長";
  guard = 0;
  while (st3.month !== 12 && guard++ < 24) st3.advanceMonth();
  while (st3.roomIn("gakudo") > 0) {
    const s = createStudent(rng(9500 + st3.students.gakudo.length), 95000 + st3.students.gakudo.length, "gakudo");
    s.grade = "小2";
    st3.students.gakudo.push(s);
  }
  st3.advanceMonth(); // 1月：待ち
  ok(kid3.classId === "youji", "（前提）満員で待っている");
  st3.students.gakudo.pop(); // 1人ぶん空く
  st3.advanceMonth(); // 2月：空いたので学童へ
  ok(kid3.classId === "gakudo", "枠が空けば翌月の頭に学童へ移る", kid3.classId);
  ok(kid3.leaveAtMonth == null, "退会の予告も消える");
}

// ================================================================ 成長の記録（年1回）

head("成長のスナップショットが年ごとに1件ずつ貯まる");
{
  const st = newGame(31);
  const who = st.students.gakudo[0];
  ok(who.history.length === 1, "入団した時点で1件ある（出発点）", `${who.history.length}件`);
  const first = firstSnapshot(who)!;
  ok(first.year === st.year, "1件目はその年のもの", `${first.year}年目`);
  ok(
    STAT_KEYS.every((k) => Math.abs(first.stats[k] - who.stats[k]) < 1e-9),
    "1件目はそのときの能力そのまま",
  );

  // 同じ年に何度呼んでも増えない（年1回だけ）
  ok(!recordSnapshot(who, st.year), "同じ年には2件目を作らない");
  ok(who.history.length === 1, "件数は増えていない", `${who.history.length}件`);

  // 1年ぶん進めると1件増える。伸びた能力は記録に残る
  const before = { ...who.stats };
  who.stats.speed = Math.min(100, who.stats.speed + 12);
  for (let i = 0; i < 12; i++) st.advanceMonth();
  ok(who.history.length === 2, "年度が変わると1件増える", `${who.history.length}件`);
  const latest = who.history[who.history.length - 1];
  ok(latest.year === st.year, "増えた1件は今年のもの", `${latest.year}年目`);
  ok(latest.stats.speed > before.speed, "その年に伸びたぶんが記録に残る", `${before.speed.toFixed(1)} → ${latest.stats.speed.toFixed(1)}`);
  ok(firstSnapshot(who)!.stats.speed === first.stats.speed, "入団時の記録は書き換わらない");
  ok(snapshotOfYear(who, latest.year) === latest, "年から記録を引ける");

  // さらに1年進めても、1年に1件のまま（データが膨らまない）。
  // 卒業・退会でクラブを離れた子はそこで止まるので、在籍している子で見る
  const roster = (): Student[] => CLASS_ORDER.flatMap((c) => st.students[c.id]);
  const target = roster().find((x) => x.history.length >= 2) ?? who;
  const n0 = target.history.length;
  for (let i = 0; i < 12; i++) st.advanceMonth();
  const stillHere = roster().some((x) => x.id === target.id);
  ok(
    !stillHere || target.history.length === n0 + 1,
    "在籍していれば1年に1件ずつ増える",
    `${n0} → ${target.history.length}件`,
  );
  ok(target.history.length <= st.year, "年数より多くはならない", `${target.history.length}件 / ${st.year}年目`);
  ok(target.history.every((h, i, a) => i === 0 || h.year > a[i - 1].year), "年の重複が無く、古い順に並ぶ");

  // 上限を超えても、入団時だけは残る
  const many = createStudent(rng(9), 7001, "senshu");
  for (let y = 1; y <= HISTORY_MAX + 6; y++) recordSnapshot(many, y);
  ok(many.history.length === HISTORY_MAX, "上限を超えたら古いほうを捨てる", `${many.history.length}件`);
  ok(many.history[0].year === 1, "ただし入団時（1件目）は残る", `${many.history[0].year}年目`);
}

head("成長の記録がセーブに残る（v24 → v25）");
{
  const st = newGame(32);
  const who = st.students.gakudo[0];
  who.stats.speed = 61.5;
  for (let i = 0; i < 12; i++) st.advanceMonth();
  const save = buildSave(st, new GameClock(), 0);
  ok(save.version === SAVE_VERSION, `v${SAVE_VERSION} で書き出せる`, `${save.version}`);

  const st2 = newGame(99);
  applySave(JSON.parse(JSON.stringify(save)), st2, new GameClock());
  const back = CLASS_ORDER.flatMap((c) => st2.students[c.id]).find((x) => x.id === who.id)!;
  ok(back.history.length === who.history.length, "件数がそのまま戻る", `${back.history.length}件`);
  ok(
    back.history.every((h, i) => h.year === who.history[i].year && h.grade === who.history[i].grade),
    "年と学年が戻る",
  );
  ok(
    STAT_KEYS.every((k) => Math.abs(back.history[0].stats[k] - who.history[0].stats[k]) < 0.01),
    "入団時の能力が戻る",
  );

  // 歴史を持たない古いセーブ（v24）は、いまの能力を1件目にして読み込む
  const v24 = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
  v24.version = 24;
  const g24 = v24.game as Record<string, unknown>;
  const kids = g24.students as Record<string, unknown>[];
  for (const k of kids) delete k.history;
  const m24 = migrateSave(v24);
  ok(m24.ok, "v24 のセーブを読み込める", m24.ok ? "" : m24.reason);
  if (m24.ok) {
    ok(m24.data.version === SAVE_VERSION, `v${SAVE_VERSION} まで引き上がる`, `${m24.data.version}`);
    const out = m24.data.game.students as unknown as Record<string, unknown>[];
    const h = out[0].history as { year: number; stats: number[] }[];
    ok(Array.isArray(h) && h.length === 1, "歴史が1件だけ作られる", `${h?.length}件`);
    ok(h[0].year === (g24.year as number), "その1件は読み込んだ年のもの", `${h[0].year}年目`);
    ok(
      h[0].stats.length === 5 && h[0].stats.every((v, i) => v === (out[0].stats as number[])[i]),
      "1件目はいまの能力（さかのぼって作らない）",
    );
  }
}

// ================================================================ 設備の解放と並び（2026-09-24）

head("はじめは入口とプールだけ");
{
  const st = newGame();
  const kinds = st.equipment.map((e) => e.kind).sort();
  ok(kinds.length === 2, "設備は2つだけ", kinds.join(","));
  ok(kinds.includes("entrance") && kinds.includes("pool6"), "入口とプール", kinds.join(","));
  ok(!kinds.includes("studio"), "スタジオは建っていない（自分で建てる）");
  // それでも遊び始められる（泳ぐ場所がある）
  ok(st.usablePools().length > 0, "使えるプールはある", `${st.usablePools().length}本`);
  ok(st.canPurchase("studio").ok, "スタジオは最初から建てられる", st.canPurchase("studio").reason ?? "");
}

head("会議室は全国区になれば建てられる");
{
  const st = newGame();
  ok(!st.canPurchase("meeting").ok, "はじめは建てられない", st.canPurchase("meeting").reason ?? "");

  // 格だけを上げる（在籍は増やさない）。お金は解放の条件ではないので足しておく
  st.gems = 99_999_999;
  st.clubAchievement = 0;
  let guard = 0;
  while (st.clubTier() < 4 && guard++ < 200) st.clubAchievement += 200;
  // 解放の判定は**保持している格**を見る（大会や月送りのときに refreshClubRank で追いつく）
  st.refreshClubRank();
  ok(st.clubTier() >= 4, "クラブの格が全国区（4）になった", `格${st.clubTier()}`);
  ok(
    st.canPurchase("meeting").ok,
    "全国区になれば在籍が少なくても建てられる",
    `${st.canPurchase("meeting").reason ?? "建てられる"}`,
  );
  ok(UNLOCK.meeting?.rank === 4, "解放条件は格4だけ", JSON.stringify(UNLOCK.meeting));
  ok(UNLOCK.meeting?.members === undefined, "在籍の条件は付いていない");
}

head("設備一覧の並びが整っている");
{
  const flat = ROOM_GROUPS.flatMap((g) => g.kinds);
  ok(flat.length === ROOM_ORDER.length, "まとまりの合計＝一覧の数", `${flat.length} / ${ROOM_ORDER.length}`);
  ok(new Set(flat).size === flat.length, "同じ部屋が2つのまとまりに入っていない");
  // 部屋の種類が増えたとき、どこかのまとまりに入れ忘れていないか
  const missing = (Object.keys(EQUIPMENT_DEFS) as RoomKind[]).filter((k) => !flat.includes(k));
  ok(missing.length === 0, "全部の部屋がどれかのまとまりに入っている", missing.join(",") || "なし");
  ok(ROOM_GROUPS.every((g) => g.kinds.length > 0), "空のまとまりが無い");

  // 大型施設（◆100万）は最後のまとまりにまとまっている
  const big = ROOM_GROUPS[ROOM_GROUPS.length - 1];
  ok(big.label.includes("大型"), "最後は大型施設のまとまり", big.label);
  ok(
    big.kinds.every((k) => equipmentDef(k).cost >= 1_000_000),
    "そこに入っているのは高い部屋だけ",
    big.kinds.map((k) => `${equipmentDef(k).label}◆${equipmentDef(k).cost}`).join(" "),
  );
  ok(
    ROOM_GROUPS.slice(0, -1).every((g) => g.kinds.every((k) => equipmentDef(k).cost < 1_000_000)),
    "大型施設がほかのまとまりに紛れていない",
  );
  // 最初のまとまりは、入口とプール（＝最初に触るもの）
  ok(ROOM_GROUPS[0].kinds[0] === "entrance", "いちばん上は入口", ROOM_GROUPS[0].kinds.join(","));
}

// ================================================================ 入会と混雑（2026-09-24）

head("人気度は「足し算」で入会に効く");
{
  const st = newGame();
  const at = (pop: number): number => {
    st.popularity = pop;
    return st.eventEnrollBonus();
  };
  ok(Math.abs(at(10) - 1) < 1e-9, "人気度10で +1人（1人多く入ったかな）", `+${at(10)}`);
  ok(Math.abs(at(100) - 10) < 1e-9, "人気度100で +10人（はっきり分かる）", `+${at(100)}`);
  ok(at(0) === 0, "人気度0では上乗せなし");
  ok(at(300) > at(100) && at(100) > at(30), "人気度が高いほど増える");

  // 毎月打てるキャンペーンは「少し足す」だけ（上限つき）
  st.popularity = 0;
  const monthly = CAMPAIGNS.filter((c) => c.months == null);
  ok(monthly.length > 0, "毎月打てるキャンペーンがある", monthly.map((c) => c.label).join("・"));
  for (const c of monthly) {
    ok(st.campaignExpected(c) <= 6, `${c.label}は人気度0だとほんの数人`, `${st.campaignExpected(c)}人`);
  }
  st.popularity = 2000;
  for (const c of monthly) {
    ok(
      st.campaignExpected(c) <= ENROLL.maxPerMonthlyEvent,
      `${c.label}は人気度が高くても上限まで`,
      `${st.campaignExpected(c)}人 / 上限${ENROLL.maxPerMonthlyEvent}`,
    );
  }

  // 季節のキャンペーンは主役（毎月のものより多い）
  st.popularity = 100;
  const seasonal = CAMPAIGNS.filter((c) => c.months != null);
  const monthlyMax = Math.max(...monthly.map((c) => st.campaignExpected(c)));
  const seasonMax = Math.max(...seasonal.map((c) => st.campaignExpected(c)));
  ok(seasonMax > monthlyMax, "季節のキャンペーンのほうが多く集まる", `${seasonMax}人 > ${monthlyMax}人`);
  ok(seasonMax < ENROLL.maxPerEvent, "それでも1回の上限には張り付かない（人気度で伸びる余地）", `${seasonMax}人`);
}

head("飛び込みの入会は「放っておくと増えない」");
{
  // 1ヶ月＝28日 × 14時間ぶんの分数で、何人入るかを見る
  const minsPerMonth = 28 * 14 * 60;
  const perMonth = (pop: number): number => {
    const st = newGame();
    st.popularity = pop;
    const mult = Math.min(AUTOEVENT.enrollMultCap, st.enrollMultiplier());
    const interval = Math.max(AUTOEVENT.enrollMinIntervalMin, AUTOEVENT.enrollBaseMin / mult);
    return minsPerMonth / interval;
  };
  ok(perMonth(0) < 6, "人気度0では月5人ほど", `${perMonth(0).toFixed(1)}人/月`);
  ok(perMonth(100) < 12, "人気度100でも月10人ほど", `${perMonth(100).toFixed(1)}人/月`);
  ok(perMonth(2000) <= perMonth(100) * 1.6, "人気度が跳ね上がっても頭打ちになる", `${perMonth(2000).toFixed(1)}人/月`);
  ok(perMonth(100) > perMonth(0), "それでも人気度が高いほうが多い");
}

head("混雑で人気度は下がらない（2026-10-09 に混雑の仕組みを廃止）");
{
  const st = newGame();
  st.popularity = 200;
  const before = st.popularity;
  const roll = st.advanceMonth();
  ok(!("crowd" in roll), "月次の結果に「使えなかった人」は載らない");
  ok(st.popularity >= before - 1e-9 || roll.guestPopularity < 0, "混雑のぶんで人気度は減らない", `${before.toFixed(0)} → ${st.popularity.toFixed(0)}`);
}

head("大きい部屋ほど一般客が来る");
{
  const small = newGame(501);
  const big = newGame(501);
  for (const st of [small, big]) {
    st.gems = 99_999_999;
    while (st.expandLand().ok) st.gems = 99_999_999;
    st.buyEquipment("gym");
    st.gems = 99_999_999;
  }
  const g = big.equipment.find((e) => e.kind === "gym")!;
  big.upgradeRoom(g);
  big.gems = 9_999_999;
  big.upgradeRoom(g);
  const room = (st: GameState) => st.guestRoomsNow(14 * 60).find((r) => r.room.kind === "gym");
  const rs = room(small);
  const rb = room(big);
  ok(!!rs && !!rb, "筋トレルームが一般開放されている");
  if (rs && rb) {
    ok(rb.capacity > rs.capacity, "「大」は受け入れ枠が大きい", `${rs.capacity} → ${rb.capacity}人`);
    ok(guestRoomWeight(rb) > guestRoomWeight(rs) * 3, "「大」は呼び込む客も多い", `${guestRoomWeight(rs)} → ${guestRoomWeight(rb)}`);
  }
}

head("満員の部屋には来ない（空いている同じ設備へ流れる）");
{
  // --- 待ちくたびれる確率：待つほど帰りやすい
  const early = queueGiveUpChance(2, 1);
  const late = queueGiveUpChance(40, 1);
  ok(early < 0.01, "並んですぐはほとんど帰らない", `${(early * 100).toFixed(2)}%/分`);
  ok(late > early * 5, "長く待つほど帰りやすい", `${(early * 100).toFixed(2)}% → ${(late * 100).toFixed(2)}%/分`);
  ok(queueGiveUpChance(GUESTS.queueMaxWait, 1) === 1, "待てる長さを超えたら必ず帰る");

  // --- 部屋の見立て（GuestRoom）を手で作って、行き先の選び方を見る
  const gymAt = (id: number, gx: number, capacity: number) => ({
    room: { id, kind: "gym", gx, gy: 2 } as never,
    category: "gym" as const,
    reachable: true,
    capacity,
    fee: 4,
  });
  const a = gymAt(1, 2, 4);
  const b = gymAt(2, 8, 4);
  const used: Record<number, number> = { 1: 4, 2: 0 };
  const occ = (id: number) => used[id] ?? 0;
  let toB = 0;
  for (let i = 0; i < 20; i++) {
    const r = pickArrival([a, b], occ, () => (i % 10) / 10)!;
    if (r.roomId === 2 && !r.queued) toB++;
  }
  ok(toB === 20, "近くに同じ設備が空いていれば、満員のほうには並ばずそちらへ行く", `${toB}/20`);

  used[2] = 1;
  used[1] = 3;
  let spreadA = 0;
  let spreadB = 0;
  for (let i = 0; i < 20; i++) {
    const r = pickArrival([a, b], occ, () => (i % 10) / 10)!;
    if (r.roomId === 1) spreadA++;
    else spreadB++;
  }
  ok(spreadB === 20, "空いているほう（使っている人が少ないほう）へ分散する", `A${spreadA}・B${spreadB}`);

  const far = gymAt(3, 2 + GUESTS.spreadDistance + 10, 4);
  used[1] = 4;
  used[3] = 0;
  const r1 = pickArrival([a], occ, () => 0)!;
  ok(r1.skip === true && !r1.queued && !r1.turnedAway && !r1.crowded, "満員なら並ばず・怒らず、来なかったことになる");
  const rFar = pickArrival([a, far], occ, () => 0)!;
  ok(rFar.roomId === 1 && rFar.skip === true, "遠くの同じ設備までは流れない");

  // --- 本物の館で：人気のわりに部屋が小さくても、行列・不満・帰る客は出ない
  const st = newGame(612);
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;
  st.buyEquipment("gym");
  st.popularity = 20_000; // 部屋1つに対して客が多すぎる状態を作る
  let queued = 0;
  let crowded = 0;
  let served = 0;
  for (let m = GUESTS.openMinute; m < GUESTS.closeMinute; m += 1) {
    for (const x of st.tickGuests(m, 1)) {
      if (x.queued) queued++;
      if (x.crowded) crowded++;
      if (!x.turnedAway) served++;
    }
    st.takeGuestQueueEvents();
  }
  ok(queued === 0, "行列はできない", `${queued}人`);
  ok(crowded === 0, "混雑で不満を持つ客はいない", `${crowded}人`);
  ok(served > 0, "定員までは客が入る", `${served}人`);
  ok(st.guestMonth.crowded === 0, "混雑の人数は数えない", `${st.guestMonth.crowded}人`);
}

head("医科学センター・低酸素トレーニングルームは時間割でクラスを入れて使う");
{
  const grow = (kind: "pool" | "altitudeLab" | "science"): Record<string, number> => {
    const st = newGame(77);
    st.gems = 99_999_999;
    while (st.expandLand().ok) st.gems = 99_999_999;
    let venueId = st.placedPools()[0].id;
    if (kind !== "pool") {
      const r = st.buyEquipment(kind);
      ok(r.ok, `${kind} を建てられる`, r.reason ?? "");
      venueId = r.item!.id;
    }
    st.timetable = [];
    ok(st.setTimetableEntry(venueId, 1, "ikuseiB", st.coaches[0]?.id ?? null).ok, `${kind} のコマに育成Bを入れられる`);
    if (kind !== "pool") {
      ok(!st.setTimetableEntry(venueId, 2, "youji", null).ok, `${kind} にスクールは入れられない`);
      ok(st.placedVenues().some((v) => v.id === venueId), "時間割の行に部屋が並ぶ");
    }
    const kids = st.students.ikuseiB;
    const before = kids.map((s) => ({ ...s.stats }));
    for (let d = 0; d < 20; d++) {
      for (const s of kids) {
        s.energy = 999;
        s.condition = 80;
      }
      st.beginClassSession("ikuseiB", kids, 1);
      st.tickPractice("ikuseiB", 90, undefined, kids);
      st.endClassSession("ikuseiB", kids, { recovery: false });
    }
    const g: Record<string, number> = {};
    for (const k of ["speed", "stamina", "form", "start", "turn"] as const) {
      g[k] = kids.reduce((a, s, i) => a + s.stats[k] - before[i][k], 0);
    }
    return g;
  };
  const pool = grow("pool");
  const alt = grow("altitudeLab");
  const sci = grow("science");
  ok(alt.stamina > pool.stamina * 3, "低酸素トレーニングルームでは持久力がしっかり伸びる", `${pool.stamina.toFixed(1)} → ${alt.stamina.toFixed(1)}`);
  ok(alt.speed === 0 && alt.form === 0, "低酸素では持久力だけを鍛える");
  const tech = (g: Record<string, number>): number => g.form + g.start + g.turn;
  ok(tech(sci) > tech(pool) * 1.5, "医科学センターではフォーム・スタート・ターンがしっかり伸びる", `${tech(pool).toFixed(1)} → ${tech(sci).toFixed(1)}`);
  ok(sci.speed === 0 && sci.stamina === 0, "医科学では技術（フォーム・スタート・ターン）だけを鍛える");
}

head("大型施設は大会のタイムと収入でも返ってくる");
{
  const st = newGame(88);
  st.gems = 99_999_999;
  while (st.expandLand().ok) st.gems = 99_999_999;
  const kid = st.students.ikuseiB[0];
  const ev100 = { stroke: "free" as const, distance: 100 };
  const ev400 = { stroke: "free" as const, distance: 400 };
  const ev50 = { stroke: "free" as const, distance: 50 };
  ok(st.bigFacilityRaceFactor(kid, ev100) === 1, "建てる前はタイムに影響しない");
  ok(st.standIncome() === 0, "大型プールが無ければ入場料は無い");
  st.popularity = 6000;
  const alt = st.buyEquipment("altitudeLab");
  ok(alt.ok, "低酸素トレーニングルームを建てられる", alt.reason ?? "");
  ok(st.bigFacilityRaceFactor(kid, ev400) < st.bigFacilityRaceFactor(kid, ev100), "低酸素は長い距離ほど効く");
  ok(st.bigFacilityRaceFactor(kid, ev50) === 1, "50mには効かない");
  st.gems = 99_999_999;
  const big = st.buyEquipment("pool10");
  if (big.ok) {
    ok(st.bigFacilityRaceFactor(kid, ev50) < 1, "大型プールは全種目で効く");
    const inc = st.standIncome();
    ok(inc >= 10_000, "観客席の入場料が毎月入る", `◆${inc}`);
    ok(st.monthlyFinance().stands === inc, "収支レポートに入場料が載る");
    const before = st.gems;
    const f = st.monthlyFinance();
    st.advanceMonth();
    ok(st.gems !== before, "月替わりで入場料が実際に入る", `net ◆${f.net}`);
  } else {
    ok(true, `（大型プールは敷地の都合で置けなかった：${big.reason}）`);
  }
  const school = st.students.gakudo[0];
  ok(st.bigFacilityRaceFactor(school, ev400) === 1, "スクール生には効かない（大会に出ない）");
}

head("大型プールのコマで練習すると伸びが大きく、大会で縮んだ秒数が出る");
{
  const grow = (big: boolean): number => {
    const st = newGame(91);
    st.gems = 99_999_999;
    while (st.expandLand().ok) st.gems = 99_999_999;
    let venueId = st.placedPools()[0].id;
    if (big) {
      const r = st.buyEquipment("pool10");
      if (!r.ok) return -1;
      venueId = r.item!.id;
    }
    st.timetable = [];
    st.setTimetableEntry(venueId, 1, "ikuseiB", st.coaches[0]?.id ?? null);
    const kids = st.students.ikuseiB;
    const sum = (): number => kids.reduce((a, k) => a + k.stats.speed + k.stats.stamina + k.stats.form, 0);
    const before = sum();
    for (let d = 0; d < 20; d++) {
      for (const k of kids) {
        k.energy = 999;
        k.condition = 80;
      }
      st.beginClassSession("ikuseiB", kids, 1);
      st.tickPractice("ikuseiB", 90, undefined, kids);
      st.endClassSession("ikuseiB", kids, { recovery: false });
    }
    return sum() - before;
  };
  const normal = grow(false);
  const big = grow(true);
  if (big >= 0) {
    ok(big > normal * 1.3, "大型プールで練習すると伸びが大きい", `${normal.toFixed(1)} → ${big.toFixed(1)}`);
    const st = newGame(92);
    st.gems = 99_999_999;
    while (st.expandLand().ok) st.gems = 99_999_999;
    st.buyEquipment("pool10");
    const s0 = st.students.senshu[0];
    const res = st.enterCompetition([s0], kirokukaiOf(st.month, 0), { stroke: "free", distance: 100 });
    const cut = res.entries[0]?.facilityCutSec ?? 0;
    ok(cut > 0.1, "大会の結果に、大型施設で縮んだ秒数が載る", `−${cut.toFixed(2)}秒`);
  } else {
    ok(true, "（大型プールは敷地の都合で置けなかった）");
  }
}

head("全国から上の大会の遠征は1週だけ（週で数える）");
{
  const st = newGame(93);
  st.gems = 99_999_999;
  const s0 = st.students.senshu[0];
  const nat = CALENDAR.find((c) => c.scale === "national")!;
  ok(st.raceAwayDays(nat) === 1, "全国大会の遠征は1週", `${st.raceAwayDays(nat)}週`);
  s0.awayDays = st.raceAwayDays(nat);
  st.onDayRoll();
  ok(s0.awayDays === 0, "1週たてば練習に戻る", `${s0.awayDays}`);
}

head("成長期の上限：小学生の天才は中学に上がるまで頭打ち、年代ごとに相手も強くなる");
{
  const kid = createStudent(rng(301), 30100, "senshu");
  kid.grade = "小6";
  for (const k of STAT_KEYS) kid.stats[k] = 95;
  for (const k of Object.keys(kid.strokeProf)) (kid.strokeProf as Record<string, number>)[k] = 90;
  ok(atAgeCeiling(kid), "能力指数が小学生の上限を超えた子は頭打ち", `${performanceIndex(kid, kid.fav).toFixed(1)}`);
  kid.energy = 999;
  const b = kid.stats.speed;
  applyTraining(kid, "speed", { rand: rng(5) });
  ok(kid.stats.speed === b, "小学生のうちは練習しても伸びない");
  kid.grade = "中1";
  ok(!atAgeCeiling(kid), "中学に上がると上限が開く");
  kid.energy = 999;
  const prof = applyStrokeTraining(kid, kid.fav.stroke).prof;
  ok(prof > 0, "中学に上がればまた伸びる（泳法の熟練度）", `+${prof.toFixed(3)}`);
  kid.grade = "小6";
  kid.energy = 999;
  ok(applyStrokeTraining(kid, kid.fav.stroke).prof === 0, "小学生のうちは熟練度も伸びない");
  // 世界大会の相手は 小 < 中 < 高 < 一般
  const lv = (id: string): number => {
    const c = CALENDAR.find((x) => x.id === id)!;
    return rivalLevelOf(c) + finalWallOf(c);
  };
  ok(lv("el_sekai") < lv("mid_sekai") && lv("mid_sekai") < lv("hi_sekai") && lv("hi_sekai") < lv("gen_sekai"),
    "世界大会の相手は 小学＜中学＜高校＜一般", `${lv("el_sekai")} / ${lv("mid_sekai")} / ${lv("hi_sekai")} / ${lv("gen_sekai")}`);
}

head("日本選手権の相手は、全員が参加標準記録より速い");
{
  const st = newGame(95);
  st.gems = 99_999_999;
  const s0 = st.students.senshu[0];
  const nihon = CALENDAR.find((c) => c.id === "gen_nihon")!;
  const ev = { stroke: "free" as const, distance: 100 };
  const std = effectiveStandard("nihonSenshuken", ev, s0.gender).time;
  let slow = 0;
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const res = st.enterCompetition([s0], nihon, ev);
    for (const r of [...res.outcome.heat, ...(res.outcome.final ?? [])]) {
      if (r.isPlayer) continue;
      total++;
      if (r.time > std + 1e-6) slow++;
    }
  }
  ok(total > 0 && slow === 0, "標準記録より遅い相手はいない", `${total}人中 ${slow}人`);
}

head("グレードアップは大きな買い物");
{
  ok(upgradeCost("studio", 1) === 50_000, "小 → 中 は ◆5万", `${upgradeCost("studio", 1)}`);
  ok(upgradeCost("studio", 2) === 100_000, "中 → 大 は ◆10万", `${upgradeCost("studio", 2)}`);
  ok(upgradeCost("studio", 3) === 0, "大の上は無い");
  // 部屋の種類で値段が変わらない（安い部屋だけ先に大にする、が起きない）
  ok(
    upgradeCost("gym", 2) === upgradeCost("studio", 2) && upgradeCost("recovery", 2) === upgradeCost("studio", 2),
    "どの部屋でも同じ額",
  );
  // 効果も伸びている
  ok(gradeEffect(3) / gradeEffect(1) >= 3, "大は小の3倍以上効く", `×${gradeEffect(3)}`);
  ok(gradeEffect(2) > gradeEffect(1) && gradeEffect(3) > gradeEffect(2), "段ごとに上がる");
}

// ================================================================

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
void CLASS_ORDER;
