/// <reference types="node" />
/**
 * 「部屋が画面に出ない／器具が重なる／グレーで見分けられない」の再発防止（ヘッドレス）。
 *
 *   1. 部屋を買う・動かすと描画の署名（mapSignature）が必ず変わるか
 *   2. 什器・器具が部屋についてきて、同じマスに重ならないか
 *   3. 器具が色分けされ、床とのコントラストが付いているか
 *
 * マップが「決まったかたち」から「プレイヤーが自由に置くマス目」に変わったので、
 * 1・2 は新しい仕組み（mapSignature / 部屋ごとの placementZones）で確かめている。
 * Phaser を読まない sim / iso / gfx の純データだけを叩く。
 */
import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { mapSignature, placedRooms, cellsOf as roomCells } from "./src/sim/clubMap";
import { fittingsOf, gearSpecsFor, innerCellsOf } from "./src/iso/facility";
import { GEAR_ACCENT } from "./src/gfx/furniture";
import { ROOM_STYLE } from "./src/gfx/roomStyle";
import { footprintOf, ROOM_ORDER, type RoomKind } from "./src/sim/equipment";
import { buildSave, applySave } from "./src/save/serialize";

let seed = 24680;
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

// ================================================================ 1. 買った部屋が必ず画面に出る
line("\n=== 1. 部屋を買うと描画が作り直されるか（mapSignature） ===");
const st = new GameState(rand, { clubName: "修正確認SC" });
st.gems = 900000;
// 敷地は買って広げる仕組みなので、全種類を建てるだけの土地を先に確保する
while (st.expandLand().ok) st.gems = 900000;

const seen = new Map<string, string>();
seen.set(mapSignature(st.map()), "(初期)");
for (const kind of ROOM_ORDER) {
  const before = mapSignature(st.map());
  const r = st.buyEquipment(kind as RoomKind);
  if (!r.ok) {
    // プールの上限など、買えないことに理由があるものは飛ばす
    line(`  --  ${kind} は買えない（${r.reason ?? ""}）`);
    continue;
  }
  const after = mapSignature(st.map());
  check(`${kind} を買うと署名が変わる（＝作り直される）`, after !== before, r.placed ? "自動配置" : "未配置");
  if (seen.has(after)) check(`  ${kind} の署名が他と衝突しない`, false, `${seen.get(after)} と同じ`);
  seen.set(after, kind);
}

line("\n=== 1b. 部屋を動かす・撤去するでも署名が変わるか ===");
{
  const room = placedRooms(st.map()).find((e) => e.kind === "studio");
  if (!room) check("スタジオが配置されている", false);
  else {
    const before = mapSignature(st.map());
    // 空いているマスを探して動かす
    let moved = false;
    for (let gy = 2; gy < 20 && !moved; gy++) {
      for (let gx = 2; gx < 20 && !moved; gx++) {
        if (st.placeRoom(room, gx, gy, false).ok) moved = true;
      }
    }
    check("部屋を動かせた", moved);
    check("動かすと署名が変わる", mapSignature(st.map()) !== before);

    const before2 = mapSignature(st.map());
    st.gems = 999999;
    check("部屋を建てられた", st.buyEquipment("shop").ok);
    check("部屋を建てても署名が変わる", mapSignature(st.map()) !== before2);
  }
}

line("\n=== 1c. 什器が部屋についてくるか（部屋の中に収まる） ===");
{
  const map = st.map();
  const fits = fittingsOf(map);
  check("什器が生成されている", fits.length > 0, `${fits.length}個`);
  // すべての什器が、どこかの部屋の footprint の内側にある
  const inside = fits.every((f) =>
    placedRooms(map).some((r) => {
      const cells = roomCells(r);
      return cells.some((c) => Math.abs(c.gx - f.cell.gx) < 1.5 && Math.abs(c.gy - f.cell.gy) < 1.5);
    }),
  );
  check("什器はすべて部屋の中にある（部屋を動かせばついてくる）", inside);

  // 部屋を増やすと什器も増える
  const before = fittingsOf(st.map()).length;
  st.buyEquipment("coachroom");
  const after = fittingsOf(st.map()).length;
  check("コーチ室を増やすと什器が増える", after > before, `${before} → ${after}`);
}

// ================================================================ 2. 部屋に同梱された器具
line("\n=== 2. 部屋の器具（同梱・グレードで増える）===");
const st3 = new GameState(rand, { clubName: "配置確認SC" });
st3.gems = 900000;
while (st3.expandLand().ok) st3.gems = 900000;
for (const kind of ["gym", "studio", "recovery"] as const) {
  st3.buyEquipment(kind);
  st3.gems = 900000;
}

/** その部屋に置かれている器具の位置（重なりを見る）。 */
const gearCells = (kind: "gym" | "studio" | "recovery"): string[] => {
  const room = placedRooms(st3.map()).find((e) => e.kind === kind)!;
  return gearSpecsFor(kind, st3.gradeOfRoom(room)).map(
    (spec) => `${((room.gx as number) + spec.dx).toFixed(2)},${((room.gy as number) + spec.dy).toFixed(2)}`,
  );
};

for (const kind of ["gym", "studio", "recovery"] as const) {
  const room = placedRooms(st3.map()).find((e) => e.kind === kind)!;
  const small = gearCells(kind);
  line(`  ${kind} 小：器具 ${small.length}個`);
  check(`${kind} は建てただけで器具が入っている`, small.length > 0, `${small.length}個`);
  check(`${kind} の器具どうしが重ならない（小）`, new Set(small).size === small.length);

  // 器具が部屋からはみ出さない
  const f = footprintOf(kind);
  const inside = gearSpecsFor(kind, 3).every(
    (spec) => spec.dx >= -0.6 && spec.dy >= -0.6 && spec.dx <= f.w - 0.2 && spec.dy <= f.h - 0.2,
  );
  check(`${kind} の器具は部屋の中に収まる（大）`, inside, `${f.w}×${f.h}マス`);

  st3.upgradeRoom(room);
  st3.upgradeRoom(room);
  const big = gearCells(kind);
  line(`  ${kind} 大：器具 ${big.length}個`);
  check(`${kind} はグレードを上げると器具が増える`, big.length > small.length, `${small.length} → ${big.length}個`);
  check(`${kind} の器具どうしが重ならない（大）`, new Set(big).size === big.length);
}

line("\n=== 3. 器具の色分けと床とのコントラスト ===");
const lum = (c: number): number => {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const sat = (c: number): number => {
  const r = ((c >> 16) & 0xff) / 255;
  const g = ((c >> 8) & 0xff) / 255;
  const b = (c & 0xff) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

const floor = ROOM_STYLE.gym.base;
line(`  筋トレルームの床 ${hex(floor)}  明度 ${lum(floor).toFixed(3)}`);

const gearKeys = Object.keys(GEAR_ACCENT).filter((k) => k.startsWith("gym"));
for (const key of gearKeys) {
  const c = GEAR_ACCENT[key];
  line(
    `  ${key.padEnd(14, " ")} ${hex(c)}  明度 ${lum(c).toFixed(3)}  彩度 ${sat(c).toFixed(2)}  ` +
      `床との差 ${Math.abs(lum(c) - lum(floor)).toFixed(3)}`,
  );
}
check("筋トレ器具すべてに色が割り当てられている", gearKeys.every((k) => GEAR_ACCENT[k] !== undefined), gearKeys.join(","));
check(
  "筋トレ器具の色がすべて違う",
  new Set(gearKeys.map((k) => GEAR_ACCENT[k])).size === gearKeys.length,
  `${new Set(gearKeys.map((k) => GEAR_ACCENT[k])).size}色 / ${gearKeys.length}種`,
);
// 【方針変更】以前は「器具ごとに原色を割り当てて見分ける」だったが、
// 参考画像のジムに合わせて**グラファイトのグレー＋シルエットで見分ける**に変えた。
// そのぶん、床との**明度差**が唯一の見分けの担保になる（下の検査がそれ）。
check("器具はグレー系でそろっている（原色で塗り分けない）", gearKeys.every((k) => sat(GEAR_ACCENT[k]) < 0.35));
check(
  "どの器具も床と明度差がある",
  gearKeys.every((k) => Math.abs(lum(GEAR_ACCENT[k]) - lum(floor)) > 0.15),
  gearKeys.map((k) => Math.abs(lum(GEAR_ACCENT[k]) - lum(floor)).toFixed(2)).join(","),
);
check("器具はすべて床より明るい（明度の向きがそろっている）", gearKeys.every((k) => lum(GEAR_ACCENT[k]) > lum(floor)));
check("器具の色は互いに離れている", new Set(Object.values(GEAR_ACCENT)).size === Object.keys(GEAR_ACCENT).length);

line("\n=== 3b. 部屋の床がそれぞれ違う色か ===");
{
  const bases = Object.entries(ROOM_STYLE).map(([k, v]) => [k, v.base] as const);
  check("部屋の床色に重複がない", new Set(bases.map(([, c]) => c)).size === bases.length);
  for (const room of ["gym", "coachroom", "deck", "studio", "road", "grass", "dorm"] as const) {
    line(`  ${room.padEnd(8, " ")} ${hex(ROOM_STYLE[room].base)}  明度 ${lum(ROOM_STYLE[room].base).toFixed(3)}`);
  }
  check(
    "筋トレルームの床はコーチ室・プールサイドと明度が違う",
    Math.abs(lum(ROOM_STYLE.gym.base) - lum(ROOM_STYLE.coachroom.base)) > 0.05 &&
      Math.abs(lum(ROOM_STYLE.gym.base) - lum(ROOM_STYLE.deck.base)) > 0.1,
  );
  check(
    "道と空き地がはっきり違う（敷いた道が見分けられる）",
    Math.abs(lum(ROOM_STYLE.road.base) - lum(ROOM_STYLE.grass.base)) > 0.05,
    `${lum(ROOM_STYLE.road.base).toFixed(3)} vs ${lum(ROOM_STYLE.grass.base).toFixed(3)}`,
  );
}

line(`\n${failures === 0 ? "全て通過" : `${failures} 件 失敗`}`);
process.exit(failures === 0 ? 0 : 1);
