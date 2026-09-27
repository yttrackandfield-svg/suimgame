import {
  borderCells,
  canPlaceAt,
  landBounds,
  landBoundsOf,
  cellsOf,
  idxOf,
  isOpenGround,
  roomAt,
  isPerimeter,
  makeMap,
  placedRooms,
  strandedRooms,
  type Cell,
  type ClubMap,
} from "./clubMap";
import { footprintOf, type Equipment, type RoomKind } from "./equipment";

/**
 * マップの初期配置と、自動で置く／道を繋ぐ処理。
 *
 *  ・新規ゲーム   … STARTER_LAYOUT の並び
 *  ・部屋を買った … autoPlaceRoom で入口に近い空きへ置く
 *  ・古いセーブ   … arrangeExisting で持っている部屋を全部並べ直す
 *
 * **道は敷かない**（部屋が建っていない敷地はどこでも歩ける → clubMap.isOpenGround）ので、
 * ここがすることは「重ならずに置く」だけ。置けなかったときは未配置（倉庫）のままにして、
 * 建設モードでプレイヤーが置けるようにする。
 */

export interface PresetRoom {
  kind: RoomKind;
  gx: number;
  gy: number;
}

/**
 * 初期の敷地（landSteps=0）の範囲。
 * 敷地は買って広げるので、初期配置はこの枠の中に収める。
 */
const L0 = landBoundsOf(0);

/**
 * 初期配置のかたまりの大きさ（9×10マス）。
 *
 * **敷地の下辺に寄せる。** 入口は外周の道路に面していないと機能しない。
 * 敷地はブロック追加方式で**右・上にだけ**伸びるので、下辺と左辺は永久に動かない。
 * ここに入口を付けておけば、何度拡張しても入口はそのまま外周に面したままで、
 * 引っ越さなくていい（＝拡張しても配置が1マスも動かない）。
 */
const START_W = 9;
const START_H = 10;
/** 初期配置の左上マス。 */
const OX = L0.x0 + Math.floor((L0.x1 - L0.x0 + 1 - START_W) / 2);
const OY = L0.y1 - (START_H - 1);

/** 入口を置く列（初期配置の中央寄り）。 */
const GATE_X = OX + 4;
/**
 * 新規ゲームの初期配置（START.equipment と同じ並び・同じ数だけ用意する）。
 *
 * プールと入口を上下に置いた形（9×10マス）。あいだは更地＝そのまま歩ける。
 * **敷地の下辺に寄せて置くので、入口は必ず外周の道路に面する**。
 * 下辺は拡張しても動かないので、入口はずっとここのまま。
 *
 *   +0..3  6レーンプール（8×4）
 *   +4..6  スタジオ（4×3。プールの真下に寄せる）
 *   +7     更地（歩いて通り抜けられる）
 *   +8..9  フロント（3×2。外周の道路に面する＝敷地の下辺）
 *
 * 敷地の残り（初期は 15×15 なので上に5行ぶん）は更地。
 * 2本目のプールや筋トレルームは、そこへ建てるか、敷地を広げて足す。
 *
 * 【最初は入口とプールだけ】（2026-09-24）
 * 一時はスタジオも建てた状態で始めていたが、
 * 「最初に何を建てるか」という判断が1つ減ってしまうのでやめた。
 * スタジオを建てる場所（入口とプールのあいだ）はちゃんと空けてある。
 */
export const STARTER_LAYOUT: readonly PresetRoom[] = [
  { kind: "entrance", gx: OX + 3, gy: OY + 8 },
  { kind: "pool6", gx: OX + 1, gy: OY },
];

/** 新規ゲームのマップ（部屋は呼び出し側が Equipment として作る）。 */
export function starterPlacementFor(kind: RoomKind, used: Set<number>): PresetRoom | null {
  for (let i = 0; i < STARTER_LAYOUT.length; i++) {
    if (used.has(i)) continue;
    if (STARTER_LAYOUT[i].kind === kind) {
      used.add(i);
      return STARTER_LAYOUT[i];
    }
  }
  return null;
}

// ------------------------------------------------------------------ 自動配置

/**
 * 買った部屋を自動で置く場所を探す。
 * **入口に近い空き**を優先する（道は要らないので、置ければそのまま使える）。
 * プレイヤーは後から建設モードで動かせる。
 */
export function autoPlaceRoom(map: ClubMap, kind: RoomKind, ignoreId?: number): Cell | null {
  const f = footprintOf(kind);
  // 探す範囲は「いま買ってある敷地」だけ（拡張していない土地には置かない）
  const b = landBounds(map);
  const gate = placedRooms(map).find((e) => e.kind === "entrance");
  const anchor: Cell = gate ? { gx: (gate.gx ?? GATE_X) + 0.5, gy: gate.gy ?? b.y1 } : { gx: GATE_X, gy: b.y1 };

  // 入口に近い順に候補を並べる
  const cands: { cell: Cell; score: number }[] = [];
  for (let gy = b.y0; gy + f.h - 1 <= b.y1; gy++) {
    for (let gx = b.x0; gx + f.w - 1 <= b.x1; gx++) {
      if (!canPlaceAt(map, kind, gx, gy, ignoreId).ok) continue;
      const probe: Equipment = { id: ignoreId ?? -1, kind, gx, gy };
      // 入口は外周に面していないと置けない
      if (kind === "entrance" && !borderCells(map, probe).some((c) => isPerimeter(map, c.gx, c.gy))) continue;
      const cx = gx + (f.w - 1) / 2;
      const cy = gy + (f.h - 1) / 2;
      cands.push({ cell: { gx, gy }, score: Math.abs(cx - anchor.gx) + Math.abs(cy - anchor.gy) });
    }
  }
  cands.sort((a, c) => a.score - c.score);

  // 【壁で囲ってしまわない】道が無くなったぶん、部屋どうしを詰めて置くと
  // 入口や奥の部屋を四方から塞いでしまう。近い順に、
  // **置いたあとも全部の部屋へ歩いて行けるもの**を選ぶ。
  // 全候補を試すと重いので、近いところから決められた数だけ確かめる。
  // まずは「まわりに通路（1マス）が残る置き方」を探す。見つからなければ条件をゆるめる。
  for (const c of cands.slice(0, AUTO_PLACE_TRIES)) {
    if (keepsEveryoneConnected(map, kind, c.cell, ignoreId) && keepsWalkway(map, kind, c.cell, ignoreId)) {
      return c.cell;
    }
  }
  for (const c of cands.slice(0, AUTO_PLACE_TRIES)) {
    if (keepsEveryoneConnected(map, kind, c.cell, ignoreId)) return c.cell;
  }
  return cands[0]?.cell ?? null;
}

/** 自動配置で「囲ってしまわないか」を確かめる候補の数（近い順）。 */
const AUTO_PLACE_TRIES = 60;

/** そこへ置いても、配置済みの部屋が全部「入口から歩いて行ける」ままか。 */
function keepsEveryoneConnected(map: ClubMap, kind: RoomKind, at: Cell, ignoreId?: number): boolean {
  const probe: Equipment = { id: ignoreId ?? -1, kind, gx: at.gx, gy: at.gy };
  const rooms = map.rooms.filter((e) => e.id !== probe.id).concat(probe);
  return strandedRooms(makeMap(rooms, map.landSteps)).length === 0;
}

/**
 * そこへ置いても、部屋のまわりに**1マスの通路**が残るか。
 *
 * 「入口から歩いて行けるか」だけだと、部屋どうしがぴったり密着して並び、
 * 先に建っていた部屋の**使う辺**（プールサイド・洗い場など）が塞がってしまう。
 * 見た目は繋がっているのに、そこへ向かう道順が引けない部屋ができる。
 *
 * 新しく置く部屋の四辺すべてに、既存の部屋と接しない空きマスを1マスぶん残す。
 * ゆとりを持って並ぶので、あとから建てても既存の部屋の動線を潰さない。
 */
function keepsWalkway(map: ClubMap, kind: RoomKind, at: Cell, ignoreId?: number): boolean {
  const f = footprintOf(kind);
  for (let y = -1; y <= f.h; y++) {
    for (let x = -1; x <= f.w; x++) {
      const inside = x >= 0 && x < f.w && y >= 0 && y < f.h;
      if (inside) continue; // 部屋そのもののマス
      const gx = at.gx + x;
      const gy = at.gy + y;
      const other = roomAt(map, gx, gy);
      if (other && other.id !== ignoreId) return false; // まわりに部屋が接している
    }
  }
  return true;
}

/** 入口から歩いてその部屋に行けるか（配置したあとの確認に使う）。 */
export function connectedToEntrance(map: ClubMap, room: Equipment): boolean {
  const gates = placedRooms(map).filter((e) => e.kind === "entrance");
  if (gates.length === 0) return false;
  const sources: Cell[] = [];
  for (const g of gates) {
    for (const c of borderCells(map, g)) {
      if (isOpenGround(map, c.gx, c.gy)) sources.push(c);
    }
  }
  if (sources.length === 0) return false;
  const seen = new Set<number>();
  const queue: Cell[] = [];
  for (const c of sources) {
    const i = idxOf(map, c.gx, c.gy);
    if (seen.has(i)) continue;
    seen.add(i);
    queue.push(c);
  }
  for (let head = 0; head < queue.length; head++) {
    const { gx, gy } = queue[head];
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const nx = gx + d.x;
      const ny = gy + d.y;
      if (!isOpenGround(map, nx, ny)) continue;
      const ni = idxOf(map, nx, ny);
      if (seen.has(ni)) continue;
      seen.add(ni);
      queue.push({ gx: nx, gy: ny });
    }
  }
  return borderCells(map, room).some((c) => seen.has(idxOf(map, c.gx, c.gy)));
}

// ------------------------------------------------------------------ 古いセーブの並べ直し

/**
 * 部屋の並び順（大きいものから置くと隙間が減る）。
 * 入口は必ず最初（外周に面する必要があるため）。
 */
function arrangeOrder(rooms: readonly Equipment[]): Equipment[] {
  return [...rooms].sort((a, b) => {
    if (a.kind === "entrance" !== (b.kind === "entrance")) return a.kind === "entrance" ? -1 : 1;
    const fa = footprintOf(a.kind);
    const fb = footprintOf(b.kind);
    return fb.w * fb.h - fa.w * fa.h;
  });
}

/**
 * 持っている部屋を全部マップに並べ直す（v8→v9 の移行に使う）。
 * 置ききれなかった部屋は未配置（倉庫）のまま返す。
 */
export function arrangeExisting(rooms: Equipment[], landSteps = 0): { unplaced: Equipment[] } {
  for (const e of rooms) {
    e.gx = null;
    e.gy = null;
    delete e.rot; // 並べ直しは買ったときの向きで置く（autoPlaceRoom が回さないため）
  }
  const map = makeMap(rooms, landSteps);

  const unplaced: Equipment[] = [];
  for (const e of arrangeOrder(rooms)) {
    const spot = autoPlaceRoom(map, e.kind, e.id);
    if (!spot) {
      unplaced.push(e);
      continue;
    }
    e.gx = spot.gx;
    e.gy = spot.gy;
  }
  return { unplaced };
}

/** 配置済みの部屋が占めるマスを数える（UIの「敷地の使用率」表示用）。 */
export function usedCells(map: ClubMap): { rooms: number; free: number; total: number } {
  let roomCells = 0;
  for (const e of placedRooms(map)) roomCells += cellsOf(e).length;
  const b = landBounds(map);
  const inner = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  return { rooms: roomCells, free: inner - roomCells, total: inner };
}
