/// <reference types="node" />
/**
 * 温浴施設（風呂・サウナ・外気浴）の検証。
 *
 *   1. 3施設が「独立して」建てられるか（好きなものだけ建てられる／グレードは無い）
 *   2. 効果の棲み分け（風呂＝体力／サウナ＝体力＋調子／外気浴＝調子）
 *   3. ととのう（サウナの近くに建てた外気浴だけ効果が上がる）
 *   4. 一般客が利用して収入になるか（レッスン中でも開いている）
 *   5. マッサージエリア（器具）と役割が重なっていないか
 *   6. 既存セーブ（温浴施設が無いデータ）がそのまま読めるか
 *
 * 実行:
 *   npx esbuild bathcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { RECOVERY_ROOM, BATHING, EQUIPMENT } from "./src/config/balance";
import {
  BATH_ROOMS,
  equipmentDef,
  hasGrade,
  hasSaunaNearby,
  guestRoomCategory,
  roomGap,
  type Equipment,
} from "./src/sim/equipment";
import { recoverySlots } from "./src/sim/needs";
import { openRoomsAt } from "./src/sim/guests";
import { bathPoseOf, bathSeatCells, floorKindAt, isBathWaterCell, roomFloorKind } from "./src/iso/facility";
import { ROOM_STYLE } from "./src/gfx/roomStyle";
import { POSE_STYLE, applyPose } from "./src/iso/people";
import { modesFor } from "./src/gfx/charSprites";
import { buildSave, applySave } from "./src/save/serialize";
import { createStudent } from "./src/sim/student";

let seed = 51423;
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

/** 土地と資金を用意したクラブ。 */
function newClub(): GameState {
  const st = new GameState(rand, { clubName: "温浴チェックSC" });
  st.gems = 900_000;
  while (st.expandLand().ok) st.gems = 900_000;
  return st;
}

// ================================================================ 1. 独立した3施設
line("\n=== 1. 風呂・サウナ・外気浴は独立した部屋（グレードなし） ===");
{
  for (const kind of BATH_ROOMS) {
    const def = equipmentDef(kind);
    check(`${def.label} が設備一覧にある`, def.cost > 0 && def.upkeep > 0, `◆${def.cost} / 維持 ◆${def.upkeep}`);
    check(`${def.label} はグレードを持たない`, !hasGrade(kind));
  }

  // 好きなものだけ建てられる（サウナだけのクラブ）
  const st = newClub();
  const r = st.buyEquipment("sauna");
  check("サウナだけを建てられる", r.ok && st.equipmentCount("sauna") === 1 && st.equipmentCount("bath") === 0);
  check("風呂を建てていなくても回復の席がある", recoverySlots(st.usableEquipment()).length > 0);

  // 3つ全部を建てられる
  const st3 = newClub();
  for (const kind of BATH_ROOMS) st3.buyEquipment(kind);
  check(
    "3施設を並べて建てられる",
    BATH_ROOMS.every((k) => st3.equipmentCount(k) === 1),
    BATH_ROOMS.map((k) => `${equipmentDef(k).label}${st3.equipmentCount(k)}`).join(" "),
  );
  const upkeep = BATH_ROOMS.reduce((n, k) => n + equipmentDef(k).upkeep, 0);
  check("3施設ぶんの維持費が毎月かかる", st3.monthlyUpkeep() >= upkeep, `維持 ◆${upkeep}/月 以上`);
}

// ================================================================ 2. 効果の棲み分け
line("\n=== 2. 効果の棲み分け（風呂＝体力／サウナ＝＋調子／外気浴＝調子） ===");
{
  const one = (
    kind: (typeof BATH_ROOMS)[number],
  ): { energy: number; condition: number; seats: number; minutes: number } => {
    const st = newClub();
    st.buyEquipment(kind);
    const slots = recoverySlots(st.usableEquipment());
    return { energy: slots[0].energy, condition: slots[0].condition, seats: slots.length, minutes: slots[0].minutes };
  };
  const bath = one("bath");
  const sauna = one("sauna");
  const open = one("openair");
  const bathSlot = bath.minutes;
  const saunaSlot = sauna.minutes;
  const openSlot = open.minutes;
  line(`  風呂    体力 +${(bath.energy * 100).toFixed(0)}%  調子 +${bath.condition}  席 ${bath.seats}`);
  line(`  サウナ  体力 +${(sauna.energy * 100).toFixed(0)}%  調子 +${sauna.condition}  席 ${sauna.seats}`);
  line(`  外気浴  体力 +${(open.energy * 100).toFixed(0)}%  調子 +${open.condition}  席 ${open.seats}`);

  check("風呂がいちばん体力を戻す", bath.energy > sauna.energy && bath.energy > open.energy);
  // 【定員はそろえてある】4施設とも4名（→ RECOVERY_ROOM.seatsPerRoom）。
  // 差が付くのは「どれだけ戻るか」であって「何人入れるか」ではない。
  check(
    "3施設とも定員は同じ4名",
    bath.seats === RECOVERY_ROOM.seatsPerRoom &&
      sauna.seats === RECOVERY_ROOM.seatsPerRoom &&
      open.seats === RECOVERY_ROOM.seatsPerRoom,
    `${bath.seats} / ${sauna.seats} / ${open.seats}`,
  );
  check("サウナは風呂より調子が戻る", sauna.condition > bath.condition);
  check("外気浴は調子がいちばん戻る（体力は控えめ）", open.condition > sauna.condition && open.energy < sauna.energy);
  check(
    "調子が上がる確率は 外気浴 > サウナ > 風呂",
    BATHING.rooms.openair.conditionChance > BATHING.rooms.sauna.conditionChance &&
      BATHING.rooms.sauna.conditionChance > BATHING.rooms.bath.conditionChance,
    [BATHING.rooms.bath, BATHING.rooms.sauna, BATHING.rooms.openair]
      .map((r) => `${Math.round(r.conditionChance * 100)}%`)
      .join(" / "),
  );
  check(
    "どの施設も1回の利用は1コマぶん",
    [bathSlot, saunaSlot, openSlot].every((m) => m === RECOVERY_ROOM.useMinutes),
    `${RECOVERY_ROOM.useMinutes}分`,
  );

  // 回復量は「体力最大値に対する割合」。1回で満タンになるような値になっていないこと
  // （以前ここに点数（22・30）が入っていて、1回で全回復してしまっていた）
  check(
    "回復量は割合として妥当（1回で満タンにならない）",
    BATH_ROOMS.every((k) => BATHING.rooms[k].energy > 0 && BATHING.rooms[k].energy < 0.6),
    BATH_ROOMS.map((k) => `${equipmentDef(k).label} ${BATHING.rooms[k].energy}`).join(" / "),
  );

  // 実際に選手を回復させてみる
  const st = newClub();
  st.buyEquipment("bath");
  const s = createStudent(rand, 9001, "senshu");
  s.energy = 10;
  s.condition = 40;
  const before = { e: s.energy, c: s.condition };
  const slot = recoverySlots(st.usableEquipment())[0];
  // needs.applyRecovery 相当（GameState 経由ではなく席1つぶんの効果を直接見る）
  const em = 100;
  const gained = Math.min(em, s.energy + em * slot.energy) - before.e;
  check("風呂に入ると体力が戻る", gained > 0, `+${gained.toFixed(0)}`);
}

// ================================================================ 3. ととのう（サウナ × 外気浴）
line("\n=== 3. ととのう（サウナの近くの外気浴だけ効果が上がる） ===");
{
  const place = (st: GameState, kind: (typeof BATH_ROOMS)[number], gx: number, gy: number): Equipment => {
    st.buyEquipment(kind);
    const e = [...st.equipment].reverse().find((x) => x.kind === kind) as Equipment;
    e.gx = gx;
    e.gy = gy;
    st.invalidateMap();
    return e;
  };

  // 隣り合わせに置く
  const near = newClub();
  const sauna = place(near, "sauna", 12, 12);
  const openNear = place(near, "openair", 12, 16); // サウナ（3×3）の下に隣接
  check("隣り合わせなら連携する", hasSaunaNearby(openNear, near.equipment), `隙間 ${roomGap(openNear, sauna)}マス`);

  // 遠くに置く
  const far = newClub();
  place(far, "sauna", 4, 4);
  const openFar = place(far, "openair", 24, 24);
  check("離れていれば連携しない", !hasSaunaNearby(openFar, far.equipment), `隙間 ${roomGap(openFar, far.equipment[far.equipment.length - 2])}マス`);

  const slotOf = (st: GameState): { energy: number; condition: number } => {
    const s = recoverySlots(st.equipment).filter((x) => x.kind === "openair")[0];
    return { energy: s.energy, condition: s.condition };
  };
  const a = slotOf(near);
  const b = slotOf(far);
  line(`  ととのう   体力 +${(a.energy * 100).toFixed(0)}%  調子 +${a.condition.toFixed(1)}`);
  line(`  単独       体力 +${(b.energy * 100).toFixed(0)}%  調子 +${b.condition.toFixed(1)}`);
  check("連携すると調子の回復が大きくなる", a.condition > b.condition * 1.5);
  check("連携すると体力の回復も少し上がる", a.energy > b.energy);
  check("連携していない外気浴は据え置き", Math.abs(b.condition - BATHING.rooms.openair.condition) < 0.001);

  // サウナが無ければ、外気浴だけ建てても連携しない
  const alone = newClub();
  const only = place(alone, "openair", 12, 12);
  check("サウナが無ければ連携しない", !hasSaunaNearby(only, alone.equipment));
}

// ================================================================ 4. 一般客の利用（収入）
line("\n=== 4. 一般客が温浴施設を使いに来る（収入になる） ===");
{
  for (const kind of BATH_ROOMS) {
    check(`${equipmentDef(kind).label} は一般開放できる`, guestRoomCategory(kind) === kind);
  }

  const st = newClub();
  for (const kind of BATH_ROOMS) st.buyEquipment(kind);
  st.addPopularity(400);
  const usable = st.usableRoomIds();
  const rooms = openRoomsAt(st.equipment, st.timetable, 0, (id) => usable.has(id));
  const bathRooms = rooms.filter((r) => (BATH_ROOMS as readonly string[]).includes(r.room.kind));
  check("温浴施設が一般開放の一覧に出る", bathRooms.length === 3, `${bathRooms.length}室`);
  check("道が繋がっていて客が行ける", bathRooms.every((r) => r.reachable));
  check(
    "部屋ごとに料金と定員が設定されている",
    bathRooms.every((r) => r.fee > 0 && r.capacity > 0),
    bathRooms.map((r) => `${equipmentDef(r.room.kind).label} ◆${r.fee}/${r.capacity}人`).join(" "),
  );

  // レッスン中でも温浴は開いている（プールは選手が専有する）
  const busySlot = st.timetable.length > 0 ? 5 : 0;
  const during = openRoomsAt(st.equipment, st.timetable, busySlot, (id) => usable.has(id));
  const bathDuring = during.filter((r) => (BATH_ROOMS as readonly string[]).includes(r.room.kind));
  check("レッスン中も温浴施設は開いている", bathDuring.length === 3);
  check(
    "レッスン中でも温浴の定員は減らない",
    bathDuring.every((r) => r.capacity === BATHING.rooms[r.room.kind].guestCap),
  );

  // ととのう外気浴は少し高く取れる
  const tuned = newClub();
  tuned.buyEquipment("sauna");
  tuned.buyEquipment("openair");
  const t = [...tuned.equipment].reverse().find((e) => e.kind === "openair") as Equipment;
  const sa = [...tuned.equipment].reverse().find((e) => e.kind === "sauna") as Equipment;
  t.gx = (sa.gx as number) + 3;
  t.gy = sa.gy;
  tuned.invalidateMap();
  const ids = tuned.usableRoomIds();
  const tr = openRoomsAt(tuned.equipment, tuned.timetable, 0, (id) => ids.has(id)).find((r) => r.room.kind === "openair");
  check(
    "ととのう外気浴は利用料が上がる",
    (tr?.fee ?? 0) === BATHING.rooms.openair.guestFee + BATHING.synergy.guestFeeBonus,
    `◆${tr?.fee}`,
  );

  // 実際にお金が入るか（1日ぶん時間を進める）
  const money = newClub();
  for (const kind of BATH_ROOMS) money.buyEquipment(kind);
  money.addPopularity(600);
  const gems0 = money.gems;
  let arrivals = 0;
  let bathArrivals = 0;
  // 営業時間（8:00〜20:00）を1分きざみで回す
  for (let minute = 8 * 60; minute < 20 * 60; minute++) {
    const got = money.tickGuests(minute, 1);
    arrivals += got.length;
    bathArrivals += got.filter((a) =>
      (BATH_ROOMS as readonly string[]).includes(money.equipment.find((e) => e.id === a.roomId)?.kind ?? ""),
    ).length;
  }
  check("一般客が来る", arrivals > 0, `${arrivals}人`);
  check("温浴施設にも客が来る", bathArrivals > 0, `${bathArrivals}人`);
  check("利用料が収入になっている", money.gems > gems0, `◆${money.gems - gems0}`);
}

// ================================================================ 5. マッサージエリアとの棲み分け
line("\n=== 5. マッサージエリア（器具）と温浴（お湯）の棲み分け ===");
{
  const st = newClub();
  st.buyEquipment("recovery"); // グレード小
  st.buyEquipment("bath");
  const slots = recoverySlots(st.usableEquipment());
  const rec = slots.filter((s) => s.kind === "recovery");
  const bath = slots.filter((s) => s.kind === "bath");
  check("両方が回復の席として並ぶ", rec.length > 0 && bath.length > 0, `器具 ${rec.length}席 / 湯 ${bath.length}席`);
  check(
    "どちらも定員は4名（施設を増やすほど回せる人数が増える）",
    bath.length === RECOVERY_ROOM.seatsPerRoom && rec.length === RECOVERY_ROOM.seatsPerRoom,
    `器具 ${rec.length}席 / 湯 ${bath.length}席`,
  );
  check("マッサージエリアは一般開放しない（選手のケア専用）", guestRoomCategory("recovery") === null);
}

// ================================================================ 6. 見た目（床・席・姿勢）
line("\n=== 6. 見た目（床の描き分け・席・姿勢） ===");
{
  check("風呂・外気浴の床の色が定義されている", !!ROOM_STYLE.bath && !!ROOM_STYLE.bathWater && !!ROOM_STYLE.openair);
  const bases = new Set(Object.values(ROOM_STYLE).map((s) => s.base));
  check("床の色に重複がない", bases.size === Object.keys(ROOM_STYLE).length);
  check("サウナと外気浴の床が別の色", ROOM_STYLE.sauna.base !== ROOM_STYLE.openair.base);
  check("湯と部屋の床（洗い場）が別の色", ROOM_STYLE.bathWater.base !== ROOM_STYLE.bath.base);
  check("湯とプールの水が別の色", ROOM_STYLE.bathWater.base !== ROOM_STYLE.water.base);

  const st = newClub();
  for (const kind of BATH_ROOMS) st.buyEquipment(kind);
  const map = st.map();
  const bathRoom = st.equipment.find((e) => e.kind === "bath") as Equipment;
  const f = equipmentDef("bath").size;
  let water = 0;
  let wash = 0;
  for (let dy = 0; dy < f.h; dy++) {
    for (let dx = 0; dx < f.w; dx++) {
      const kind = floorKindAt(map, (bathRoom.gx as number) + dx, (bathRoom.gy as number) + dy);
      if (kind === "bathWater") water++;
      else if (kind === "bath") wash++;
    }
  }
  check("風呂は「洗い場＋湯船」に描き分けられる", water > 0 && wash > 0, `湯 ${water}マス / 洗い場 ${wash}マス`);
  check("湯船のほうが広い", water > wash);
  check("洗い場は奥の1行だけ", wash === f.w);
  check("湯船のマス判定が床の種類と一致する", isBathWaterCell(bathRoom, bathRoom.gx as number, (bathRoom.gy as number) + 1));

  for (const kind of BATH_ROOMS) {
    const room = st.equipment.find((e) => e.kind === kind) as Equipment;
    const seats = bathSeatCells(room, RECOVERY_ROOM.seatsPerRoom);
    check(`${equipmentDef(kind).label} の席が定員ぶんある`, seats.length === RECOVERY_ROOM.seatsPerRoom);
    const inside = seats.every(
      (c) =>
        c.gx >= (room.gx as number) - 0.1 &&
        c.gy >= (room.gy as number) - 0.1 &&
        c.gx <= (room.gx as number) + equipmentDef(kind).size.w &&
        c.gy <= (room.gy as number) + equipmentDef(kind).size.h,
    );
    check(`${equipmentDef(kind).label} の席が部屋の中に収まる`, inside);
  }
  check("風呂の席は湯船の中", bathSeatCells(bathRoom, 4).every((c) => isBathWaterCell(bathRoom, c.gx, c.gy)));
  check("姿勢は施設ごとに違う", bathPoseOf("bath") === "soak" && bathPoseOf("sauna") === "sit" && bathPoseOf("openair") === "relax");
  check("床の種類が部屋ごとに割り当てられている", roomFloorKind("openair") === "openair" && roomFloorKind("sauna") === "sauna");
}

// ================================================================ 7. 既存セーブを壊さない
line("\n=== 7. 既存のセーブ（温浴施設が無いデータ）を読み込む ===");
{
  const st = newClub();
  st.buyEquipment("pool6");
  st.buyEquipment("recovery");
  const pools = st.equipmentCount("pool6"); // 新規クラブは最初からプールを1本持っている
  const clock = new GameClock();
  const save = buildSave(st, clock, 1);
  // 温浴施設をひとつも持たないセーブ
  const st2 = new GameState(rand, { clubName: "読み込み先" });
  const clock2 = new GameClock();
  applySave(save, st2, clock2);
  check(
    "温浴施設が無いセーブがそのまま読める",
    st2.equipmentCount("pool6") === pools && st2.equipmentCount("recovery") === 1,
    `プール${st2.equipmentCount("pool6")} 回復${st2.equipmentCount("recovery")}`,
  );
  check("温浴施設は0のまま", BATH_ROOMS.every((k) => st2.equipmentCount(k) === 0));

  // 建ててからセーブ → ロードで残る
  for (const kind of BATH_ROOMS) st2.buyEquipment(kind);
  const save2 = buildSave(st2, clock2, 1);
  const st3 = new GameState(rand, { clubName: "読み込み先2" });
  applySave(save2, st3, new GameClock());
  check(
    "建てた温浴施設がセーブ・ロードで残る",
    BATH_ROOMS.every((k) => st3.equipmentCount(k) === 1),
    BATH_ROOMS.map((k) => `${equipmentDef(k).label}${st3.equipmentCount(k)}`).join(" "),
  );
  check("読み込んだ温浴施設が配置されている", st3.equipment.filter((e) => (BATH_ROOMS as readonly string[]).includes(e.kind)).every((e) => e.gx != null));
  // 設備の総数の上限に温浴施設が食い込みすぎていないか（建てられる余地が残る）
  check("設備の上限に余裕がある", st3.equipment.length < EQUIPMENT.maxTotal);
}


line("\n=== 8. 姿勢（寝そべる・腰かける・浸かる） ===");
{
  // 【元の不具合】外気浴が 0.24rad（14度）しか倒れておらず、しかも足を切り落として
  // 地面の高さに置いていたので、寝椅子の脇に「足が埋まった立ち姿」が出ていた。
  check("外気浴は体を切り落とさない（寝るので全身が見える）", POSE_STYLE.relax.hide === 0);
  check("外気浴は寝椅子の角度まで倒す", POSE_STYLE.relax.rot > 0.6, `${POSE_STYLE.relax.rot}rad`);
  check("寝椅子の面の高さぶん持ち上げる", POSE_STYLE.relax.seat.y < -20, `${POSE_STYLE.relax.seat.y}px`);
  check("サウナは倒さない（腰かける）", POSE_STYLE.sit.rot === 0);
  // 【隠しすぎない】0.4 だと腰の上で切れて胴が短く見え、「ベンチに埋まっている」印象になった。
  // 太ももが少し座面に乗るくらい（0.25〜0.35）に収める（2026-09-18）。
  check(
    "サウナは腰から下を隠す（座って見える）",
    POSE_STYLE.sit.hide >= 0.25 && POSE_STYLE.sit.hide <= 0.35,
    `${POSE_STYLE.sit.hide}`,
  );
  // 座面は等角なので上下に幅を持つ。切り口をその**奥の縁**まで上げないと、
  // 座面の絵が体に重なって埋まって見える（→ POSE_STYLE.sit のコメント）。
  check("切り口を座面の奥の縁まで上げる", POSE_STYLE.sit.seat.y <= -30, `${POSE_STYLE.sit.seat.y}px`);
  check("ベンチの座面まで持ち上げる", POSE_STYLE.sit.seat.y < 0, `${POSE_STYLE.sit.seat.y}px`);
  check("湯船はサウナより深く隠れる（腰まで浸かる）", POSE_STYLE.soak.hide > POSE_STYLE.sit.hide);

  // 実際に姿勢を掛けたときの座標。背丈100pxのスプライトで確かめる
  const fake = {
    height: 100,
    width: 40,
    scaleY: 1,
    cropped: null as number | null,
    setCrop(_x?: number, _y?: number, _w?: number, h?: number) {
      fake.cropped = h ?? null;
    },
  };
  const sprite = fake as unknown as Parameters<typeof applyPose>[0];

  const relax = applyPose(sprite, "relax", 0, 0);
  check("寝そべるときは切り取らない", fake.cropped === null);
  check("傾きがそのまま出る", relax.rot === POSE_STYLE.relax.rot);
  // 体の「along の位置」が寝椅子の面に乗っているか（軸＝足元から along×背丈のところ）
  const ang = Math.PI / 2 - POSE_STYLE.relax.rot;
  const d = POSE_STYLE.relax.along * 100;
  const onSeat = { x: relax.ox + d * Math.cos(ang), y: relax.oy - d * Math.sin(ang) };
  check("体の重心が椅子の真上に来る", Math.abs(onSeat.x - POSE_STYLE.relax.seat.x) < 0.01, `x=${onSeat.x.toFixed(1)}`);
  check("体の重心が椅子の面の高さに来る", Math.abs(onSeat.y - POSE_STYLE.relax.seat.y) < 1.5, `y=${onSeat.y.toFixed(1)}`);
  check("足元は椅子の手前側へずれる（頭が背もたれ側）", relax.ox < -10, `ox=${relax.ox.toFixed(0)}`);

  const sit = applyPose(sprite, "sit", 0, 0);
  check("腰から下を切り落とす", fake.cropped !== null && fake.cropped < 78, `残り${fake.cropped}px`);
  check(
    "切り口が座面の高さに来る",
    Math.abs(sit.oy - (100 * POSE_STYLE.sit.hide + POSE_STYLE.sit.seat.y)) < 1.5,
    `oy=${sit.oy.toFixed(1)}`,
  );
  check("腰かけるときは傾けない", sit.rot === 0);

  const soak = applyPose(sprite, "soak", 0, 0);
  check(
    "湯面＝床なので、切り口がマスの高さに来る",
    Math.abs(soak.oy - 100 * POSE_STYLE.soak.hide) < 1.5,
    `oy=${soak.oy.toFixed(1)}`,
  );

  applyPose(sprite, null, 0, 0);
  check("姿勢を外すと切り取りも外れる", fake.cropped === null);

  // 一般客も水着で入る（これが無いと私服のまま湯船に浸かる）
  check("一般客は水着の姿を持つ", modesFor("guest").includes("suit"), modesFor("guest").join("/"));
  check("泳ぎの姿は持たない（見学・入浴だけ）", !modesFor("guest").includes("swimFree"));
}

line(`\n${failures === 0 ? "全て通過" : `${failures} 件 失敗`}`);
process.exit(failures === 0 ? 0 : 1);
