import {
  borderCells,
  doorCellsOf,
  isOpenGround,
  placedRooms,
  roomAt,
  type Cell,
  type ClubMap,
} from "./clubMap";
import { isPool, roomSize, type Equipment } from "./equipment";

/**
 * 壁（エッジウォール方式）。
 *
 * 【方針】セルは壁を持たない。壁は**セルの「北辺」と「西辺」だけ**に持たせる。
 *   ・あるセルの南辺 ＝ 南隣セルの北辺
 *   ・あるセルの東辺 ＝ 東隣セルの西辺
 * こうすると1枚の壁が2箇所に現れず、二重管理にならない。
 *
 * 【なぜ変えたか】以前は「壁が1マスを丸ごと占有する立方体」だったため、
 * 面積を食い、部屋の中が見えなかった。境界に薄板を立てる方式にすると
 * マスは部屋の中身に使えるようになり、俯瞰で中身が全部見える。
 *
 * 【手前の壁】部屋の南辺・東辺は視点から見て手前にあたるので、低く描く
 * （`front: true`）。中が隠れないようにするための基本手法。
 *
 * このモジュールは Phaser 非依存の純ロジック。
 */

export type WallKind = "none" | "wall" | "glass" | "door" | "fence";

/** 壁を持つ辺の向き。n＝そのセルの北辺、w＝そのセルの西辺。 */
export type EdgeDir = "n" | "w";

/** 通り抜けられるか（door と none だけ通れる。柵は低いが通れない）。 */
export function isPassable(kind: WallKind): boolean {
  return kind === "none" || kind === "door";
}

/** 向こう側が透けて見えるか（描画の不透明度に使う）。 */
export function isSeeThrough(kind: WallKind): boolean {
  return kind === "glass" || kind === "fence" || kind === "door" || kind === "none";
}

export interface WallEdge {
  /** 壁を持つセル（このセルの北辺／西辺に立つ）。 */
  gx: number;
  gy: number;
  dir: EdgeDir;
  kind: WallKind;
  /**
   * 部屋から見て手前側（南辺・東辺）か。
   * true なら低く描いて中を見せる。
   */
  front: boolean;
  /** 面している部屋（色を合わせるのに使う）。 */
  roomId: number;
}

/** 辺の識別子（重複を避けるためのキー）。 */
export function edgeKey(gx: number, gy: number, dir: EdgeDir): string {
  return `${dir}${gx},${gy}`;
}

/**
 * 隣り合う2マスの間の辺は、どちらのセルのどの向きに保存されるか。
 * 斜め・離れている場合は null。
 */
export function edgeBetween(a: Cell, b: Cell): { gx: number; gy: number; dir: EdgeDir } | null {
  if (a.gx === b.gx) {
    if (b.gy === a.gy + 1) return { gx: a.gx, gy: b.gy, dir: "n" }; // b は a の南 → b の北辺
    if (b.gy === a.gy - 1) return { gx: a.gx, gy: a.gy, dir: "n" }; // a は b の南 → a の北辺
    return null;
  }
  if (a.gy === b.gy) {
    if (b.gx === a.gx + 1) return { gx: b.gx, gy: a.gy, dir: "w" }; // b は a の東 → b の西辺
    if (b.gx === a.gx - 1) return { gx: a.gx, gy: a.gy, dir: "w" }; // a は b の東 → a の西辺
    return null;
  }
  return null;
}

/** 部屋の種類ごとの壁の作り。 */
function wallKindFor(room: Equipment, front: boolean): WallKind {
  if (room.kind === "entrance") {
    // 玄関は「門」。奥に壁を立て、手前は開けておく。
    return front ? "none" : "wall";
  }
  if (isPool(room.kind)) {
    // プールは屋内ホール。奥は壁、プールサイド側は低い安全柵にして水面を見せる。
    return front ? "fence" : "wall";
  }
  if (room.kind === "openair") {
    // 外気浴は「屋内の一角にある外の空間」。手前を柵にして開けた場所に見せる。
    return front ? "fence" : "wall";
  }
  if (room.kind === "bath") {
    // 風呂は湯気がこもるので囲うが、手前だけガラスにして中の湯船を見せる。
    return front ? "glass" : "wall";
  }
  return "wall";
}

/**
 * 今のマップから壁の一覧を作る（部屋の外周に自動生成）。
 *
 * ・部屋の北辺・西辺 → 奥の壁（front=false, 高い）
 * ・部屋の南辺・東辺 → 手前の壁（front=true, 低い）
 * ・道に接している辺 → ドア（通れる開口）
 *
 * 同じ辺に2つの部屋が面したときは、先に登録したほう（奥側の部屋）を残す。
 */
export function buildWallEdges(map: ClubMap): WallEdge[] {
  const byKey = new Map<string, WallEdge>();

  const put = (gx: number, gy: number, dir: EdgeDir, kind: WallKind, front: boolean, roomId: number): void => {
    const key = edgeKey(gx, gy, dir);
    const prev = byKey.get(key);
    // 奥の壁（front=false）を優先して残す＝部屋どうしが背中合わせでも1枚だけ立つ
    if (prev && !prev.front) return;
    byKey.set(key, { gx, gy, dir, kind, front, roomId });
  };

  for (const room of placedRooms(map)) {
    const f = roomSize(room);
    const x0 = room.gx as number;
    const y0 = room.gy as number;
    const x1 = x0 + f.w - 1;
    const y1 = y0 + f.h - 1;
    const backKind = wallKindFor(room, false);
    const frontKind = wallKindFor(room, true);

    // 北辺（奥）：セル(gx, y0) の北辺
    for (let gx = x0; gx <= x1; gx++) {
      if (backKind !== "none") put(gx, y0, "n", backKind, false, room.id);
    }
    // 西辺（奥）：セル(x0, gy) の西辺
    for (let gy = y0; gy <= y1; gy++) {
      if (backKind !== "none") put(x0, gy, "w", backKind, false, room.id);
    }
    // 南辺（手前）：セル(gx, y1+1) の北辺
    for (let gx = x0; gx <= x1; gx++) {
      if (frontKind !== "none") put(gx, y1 + 1, "n", frontKind, true, room.id);
    }
    // 東辺（手前）：セル(x1+1, gy) の西辺
    for (let gy = y0; gy <= y1; gy++) {
      if (frontKind !== "none") put(x1 + 1, gy, "w", frontKind, true, room.id);
    }
  }

  // 道に接している辺はドア（通れる開口）にする。
  // 「行ける部屋」は必ずどこかで道に接しているので、ここで必ず出入口ができる。
  for (const room of placedRooms(map)) {
    for (const d of doorCellsOf(map, room)) {
      const inner = roomCellNextTo(map, room, d);
      if (!inner) continue;
      const e = edgeBetween(inner, d);
      if (!e) continue;
      const key = edgeKey(e.gx, e.gy, e.dir);
      const prev = byKey.get(key);
      byKey.set(key, {
        gx: e.gx,
        gy: e.gy,
        dir: e.dir,
        kind: "door",
        front: prev?.front ?? false,
        roomId: room.id,
      });
    }
  }

  return [...byKey.values()];
}

/** その道マスに接している、部屋のがわのマス。 */
function roomCellNextTo(map: ClubMap, room: Equipment, road: Cell): Cell | null {
  for (const n of [
    { gx: road.gx + 1, gy: road.gy },
    { gx: road.gx - 1, gy: road.gy },
    { gx: road.gx, gy: road.gy + 1 },
    { gx: road.gx, gy: road.gy - 1 },
  ]) {
    const r = roomAt(map, n.gx, n.gy);
    if (r && r.id === room.id) return n;
  }
  return null;
}

/** 辺の一覧を引きやすい形にする（当たり判定用）。 */
export interface WallLookup {
  get(gx: number, gy: number, dir: EdgeDir): WallKind;
  /** 2マスの間を通れるか。 */
  passable(a: Cell, b: Cell): boolean;
}

export function wallLookup(edges: readonly WallEdge[]): WallLookup {
  const map = new Map<string, WallKind>();
  for (const e of edges) map.set(edgeKey(e.gx, e.gy, e.dir), e.kind);
  return {
    get(gx, gy, dir) {
      return map.get(edgeKey(gx, gy, dir)) ?? "none";
    },
    passable(a, b) {
      const e = edgeBetween(a, b);
      if (!e) return false;
      return isPassable(map.get(edgeKey(e.gx, e.gy, e.dir)) ?? "none");
    },
  };
}

/**
 * その部屋に「通れる出入口」があるか。
 * 壁で囲みきってしまった部屋を検出するのに使う（道が繋がっていても入れない状態の検出）。
 */
export function hasOpenDoor(map: ClubMap, room: Equipment, lookup: WallLookup): boolean {
  for (const c of borderCells(map, room)) {
    if (!isOpenGround(map, c.gx, c.gy)) continue;
    const inner = roomCellNextTo(map, room, c);
    if (inner && lookup.passable(inner, c)) return true;
  }
  return false;
}
