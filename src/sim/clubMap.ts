import { MAP, ROUTE } from "../config/balance";
import { equipmentDef, footprintOf, roomSize, type Equipment, type RoomKind, type RoomRot } from "./equipment";

/**
 * クラブの敷地＝正方形のマス目マップ。
 *
 * 【基本ルール】
 *  ・敷地の外周は道路（ぐるりと1周）。ここは建てられないし、剥がせない。
 *  ・部屋は EQUIPMENT.rooms[kind].size のマス数ぶん長方形で場所を取る。
 *  ・道は敷地の中に1マス単位で自由に敷ける。
 *  ・入口（entrance）は外周の道路に面していないと機能しない＝そこが敷地の出入口。
 *  ・部屋は「敷地内の道」に接していないと使えない（人が辿り着けない）。
 *
 * 【経路】
 *  入口に接する道マスから幅優先探索で敷地内の道を辿る。届いた道に接している部屋だけが
 *  「繋がっている部屋」。入口からの距離が近いほど移動に時間を取られず、効率が良い。
 *
 * このモジュールは Phaser 非依存の純ロジック（ヘッドレスでテストできる）。
 */

export interface Cell {
  gx: number;
  gy: number;
}

/**
 * マップの状態。
 * rooms は GameState.equipment をそのまま渡す（配置済み＝gx/gy が数値、未配置＝null）。
 */
export interface ClubMap {
  cols: number;
  rows: number;
  rooms: readonly Equipment[];
  /** 買い足した敷地の段数（0＝初期の広さ）。→ landBounds */
  landSteps: number;
}

export function makeMap(rooms: readonly Equipment[], landSteps = 0): ClubMap {
  return {
    cols: MAP.cols,
    rows: MAP.rows,
    rooms,
    landSteps: clampLandSteps(landSteps),
  };
}

// ------------------------------------------------------------------ 敷地の広さ（拡張）

/**
 * 【敷地は買って広げる】
 *
 * マスの配列そのもの（MAP.cols × MAP.rows）は最初から最大の大きさで持っている。
 * 変わるのは「どこまでが自分の敷地か」だけ。
 * こうしておくと、道のマス番号がセーブと一致したまま拡張できる
 *（配列を作り直すと、敷いた道の位置が全部ずれる）。
 *
 * 敷地は中央を保ったまま四方に広がる。外周1マスは常に道路で、
 * 拡張するとその道路も一緒に外へ動く。
 */
export function clampLandSteps(steps: number): number {
  return Math.max(0, Math.min(MAP.maxLandSteps, Math.floor(steps)));
}

/**
 * その段数のときの敷地の広さ（マス）。
 *
 * 【ブロック追加方式】左下の角は動かさず、右→上→右→上 と交互にブロックを足す。
 *   0: 15×15 ／ 1: 25×15 ／ 2: 25×25 ／ 3: 35×25 ／ 4: 35×35
 * 既存の部屋は1マスも動かない（＝拡張しても配置をやり直さなくていい）。
 */
export function landSizeOf(steps: number): { w: number; h: number } {
  const k = clampLandSteps(steps);
  const maxW = MAP.cols - MAP.roadRing - MAP.landOrigin;
  const maxH = MAP.rows - MAP.roadRing - MAP.landOrigin;
  // 右に付くのは奇数段目、上に付くのは偶数段目
  const right = Math.ceil(k / 2);
  const down = Math.floor(k / 2);
  return {
    w: Math.min(maxW, MAP.baseInner + right * MAP.expandStep),
    h: Math.min(maxH, MAP.baseInner + down * MAP.expandStep),
  };
}

/** その段数のときの、建てられる範囲の一辺（表示用。長いほうを返す）。 */
export function landInnerSize(steps: number): number {
  const { w, h } = landSizeOf(steps);
  return Math.max(w, h);
}

/** 次の拡張でどちらに伸びるか（画面の案内に使う）。 */
export function nextExpandSide(steps: number): "right" | "up" {
  return clampLandSteps(steps) % 2 === 0 ? "right" : "up";
}

export interface LandBounds {
  /** 建てられる範囲（両端を含む）。 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 建てられる範囲。**左下の角は段数によらず固定**で、
 * 拡張したぶんだけ右・上へ伸びる（→ landSizeOf）。
 *
 * 左下を固定するのは、**入口が敷地の下辺に面している**から。
 * 下辺が動かなければ入口は永久にそのままで、拡張のたびに引っ越さなくていい。
 * （画面の手前側＝下辺が「表通り」なので、入口の絵もそこを向いている）
 */
export function landBoundsOf(steps: number): LandBounds {
  const { w, h } = landSizeOf(steps);
  const full = landSizeOf(MAP.maxLandSteps);
  const x0 = MAP.landOrigin;
  const y1 = MAP.landOrigin + full.h - 1; // 下辺は最大まで広げたときの位置で固定
  return { x0, y0: y1 - h + 1, x1: x0 + w - 1, y1 };
}

export function landBounds(map: ClubMap): LandBounds {
  return landBoundsOf(map.landSteps);
}

/**
 * 次の1段を買う費用。
 * 表（MAP.landCosts）をそのまま使い、表より先は最後の値に倍率を掛けて伸ばす。
 */
export function landExpandCost(steps: number): number {
  const n = Math.max(0, steps);
  const table = MAP.landCosts;
  if (n < table.length) return table[n];
  const last = table[table.length - 1];
  return Math.round(last * Math.pow(MAP.landCostGrowth, n - table.length + 1));
}

/** まだ広げられるか。 */
export function canExpandLand(steps: number): boolean {
  if (clampLandSteps(steps) >= MAP.maxLandSteps) return false;
  const a = landSizeOf(steps);
  const b = landSizeOf(steps + 1);
  return b.w > a.w || b.h > a.h;
}

/**
 * その部屋が全部おさまる最小の段数（古いセーブの救済に使う）。
 * 敷地を狭くしたときに、すでに建っている部屋が敷地の外に出ないようにする。
 */
export function minLandStepsFor(rooms: readonly Equipment[]): number {
  let need = 0;
  for (const e of rooms) {
    if (e.gx == null || e.gy == null) continue;
    const f = roomSize(e);
    for (let s = need; s <= MAP.maxLandSteps; s++) {
      const b = landBoundsOf(s);
      if (e.gx >= b.x0 && e.gy >= b.y0 && e.gx + f.w - 1 <= b.x1 && e.gy + f.h - 1 <= b.y1) {
        need = s;
        break;
      }
      if (s === MAP.maxLandSteps) need = MAP.maxLandSteps;
    }
  }
  return need;
}

// ------------------------------------------------------------------ マスの判定

export function idxOf(map: ClubMap, gx: number, gy: number): number {
  return gy * map.cols + gx;
}

export function inBounds(map: ClubMap, gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < map.cols && gy < map.rows;
}

/**
 * 外周の道路か（建てられない・剥がせない）。
 * 敷地を買い足すと、この道路も一緒に外側へ動く。
 */
export function isPerimeter(map: ClubMap, gx: number, gy: number): boolean {
  if (!inBounds(map, gx, gy)) return false;
  const b = landBounds(map);
  const r = MAP.roadRing;
  if (gx < b.x0 - r || gy < b.y0 - r || gx > b.x1 + r || gy > b.y1 + r) return false; // 敷地の外（未購入）
  return gx < b.x0 || gy < b.y0 || gx > b.x1 || gy > b.y1;
}

/** 部屋や道を置ける（＝買ってある敷地の中の）マスか。 */
export function isBuildable(map: ClubMap, gx: number, gy: number): boolean {
  if (!inBounds(map, gx, gy)) return false;
  const b = landBounds(map);
  return gx >= b.x0 && gy >= b.y0 && gx <= b.x1 && gy <= b.y1;
}

/** まだ買っていない土地か（画面では暗く表示する）。 */
export function isUnownedLand(map: ClubMap, gx: number, gy: number): boolean {
  return inBounds(map, gx, gy) && !isBuildable(map, gx, gy) && !isPerimeter(map, gx, gy);
}

/**
 * 【道は敷かない】
 *
 * 以前は1マスずつ道を敷き、その上しか歩けなかった。いまは
 * **部屋が建っていない敷地はどこでも歩ける**（＝敷地そのものが通路）。
 * 道を敷き忘れて部屋が使えない、という詰まり方がなくなる。
 */

/**
 * 敷地の中の「部屋が建っていない」マスか。経路探索はここだけを辿る。
 * 部屋の中は通り抜けできない（出入口から入る）。
 */
export function isOpenGround(map: ClubMap, gx: number, gy: number): boolean {
  return isBuildable(map, gx, gy) && roomAt(map, gx, gy) === null;
}

/** 配置済みの部屋だけを取り出す。 */
export function placedRooms(map: ClubMap): Equipment[] {
  return map.rooms.filter((e) => e.gx != null && e.gy != null);
}

/** 未配置（倉庫にある）部屋。 */
export function unplacedRooms(map: ClubMap): Equipment[] {
  return map.rooms.filter((e) => e.gx == null || e.gy == null);
}

/** その部屋が占有する全マス。 */
export function cellsOf(e: Equipment): Cell[] {
  if (e.gx == null || e.gy == null) return [];
  const f = roomSize(e);
  const out: Cell[] = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) out.push({ gx: e.gx + x, gy: e.gy + y });
  }
  return out;
}

/** その部屋の中心（描画・移動先の基準）。 */
export function centerOf(e: Equipment): Cell {
  const f = roomSize(e);
  return { gx: (e.gx ?? 0) + (f.w - 1) / 2, gy: (e.gy ?? 0) + (f.h - 1) / 2 };
}

export function coversCell(e: Equipment, gx: number, gy: number): boolean {
  if (e.gx == null || e.gy == null) return false;
  const f = roomSize(e);
  return gx >= e.gx && gx < e.gx + f.w && gy >= e.gy && gy < e.gy + f.h;
}

/** そのマスを占有している部屋（無ければ null）。 */
export function roomAt(map: ClubMap, gx: number, gy: number): Equipment | null {
  for (const e of map.rooms) {
    if (coversCell(e, gx, gy)) return e;
  }
  return null;
}

/** 部屋の外周に接するマス（上下左右）。敷地の外は含まない。 */
export function borderCells(map: ClubMap, e: Equipment): Cell[] {
  if (e.gx == null || e.gy == null) return [];
  const f = roomSize(e);
  const out: Cell[] = [];
  for (let x = e.gx; x < e.gx + f.w; x++) {
    for (const gy of [e.gy - 1, e.gy + f.h]) {
      if (inBounds(map, x, gy)) out.push({ gx: x, gy });
    }
  }
  for (let y = e.gy; y < e.gy + f.h; y++) {
    for (const gx of [e.gx - 1, e.gx + f.w]) {
      if (inBounds(map, gx, y)) out.push({ gx, gy: y });
    }
  }
  return out;
}

// ------------------------------------------------------------------ 配置の可否

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
}

/**
 * その位置にその部屋を置けるか。
 * ignoreId を渡すと、その部屋自身との重なりは無視する（＝移動のときに使う）。
 */
export function canPlaceAt(
  map: ClubMap,
  kind: RoomKind,
  gx: number,
  gy: number,
  ignoreId?: number,
  /** 向き（1＝縦横を入れ替えて置く）。 */
  rot: RoomRot = 0,
): PlaceCheck {
  const f = footprintOf(kind, rot);
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const cx = gx + x;
      const cy = gy + y;
      if (!inBounds(map, cx, cy)) return { ok: false, reason: "敷地からはみ出す" };
      if (isPerimeter(map, cx, cy)) return { ok: false, reason: "外周の道路には建てられない" };
      // まだ買っていない土地には建てられない（→ 建設モードの「敷地を買う」）
      if (!isBuildable(map, cx, cy)) return { ok: false, reason: "まだ買っていない土地（敷地を広げよう）" };
      const other = roomAt(map, cx, cy);
      if (other && other.id !== ignoreId) return { ok: false, reason: `${equipmentDef(other.kind).label}と重なる` };
    }
  }
  if (kind === "entrance") {
    // 入口は「表通りに出られる場所」に置く。
    // 外周の道路に face していればもちろん OK だが、**敷地の中の道を辿って
    // 表通りに出られる**なら私道として認める（敷地を広げたあとも置き直せる）。
    const probe: Equipment = { id: ignoreId ?? -1, kind, gx, gy, rot };
    if (!entranceOpen(map, probe)) {
      return { ok: false, reason: "入口は外周の道路（塀ぎわ）か、そこへ道が続く場所に置く" };
    }
  }
  return { ok: true };
}

/** その部屋が外周の道路に接しているか（入口の条件）。 */
export function touchesPerimeter(map: ClubMap, e: Equipment): boolean {
  return borderCells(map, e).some((c) => isPerimeter(map, c.gx, c.gy));
}

// ------------------------------------------------------------------ 経路探索

const DIRS: readonly Cell[] = [
  { gx: 1, gy: 0 },
  { gx: -1, gy: 0 },
  { gx: 0, gy: 1 },
  { gx: 0, gy: -1 },
];

export interface DistField {
  /** 各マスの歩数（-1＝辿り着けない）。 */
  dist: Int32Array;
  /** 経路復元用の1つ前のマス（-1＝なし）。 */
  prev: Int32Array;
}

/** 敷地内の道だけを辿る幅優先探索。 */
export function bfsRoads(map: ClubMap, sources: readonly Cell[]): DistField {
  const n = map.cols * map.rows;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    if (!isOpenGround(map, s.gx, s.gy)) continue;
    const i = idxOf(map, s.gx, s.gy);
    if (dist[i] >= 0) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const gx = i % map.cols;
    const gy = Math.floor(i / map.cols);
    for (const d of DIRS) {
      const nx = gx + d.gx;
      const ny = gy + d.gy;
      if (!isOpenGround(map, nx, ny)) continue;
      const ni = idxOf(map, nx, ny);
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[i] + 1;
      prev[ni] = i;
      queue.push(ni);
    }
  }
  return { dist, prev };
}

/**
 * その入口が出入口として機能しているか。
 *
 * **外周の道路に面していること。** 道を敷く仕組みをやめたので、
 * 「私道で表通りまで繋ぐ」という抜け道は無くなった（敷地の中はどこでも歩けるが、
 * 敷地の真ん中に玄関があるのは建物として成り立たない）。
 * 敷地を買い足したときは、入口そのものを新しい縁まで動かす
 *（→ GameState.moveEntrancesToEdge）。
 */
export function entranceOpen(map: ClubMap, e: Equipment): boolean {
  return touchesPerimeter(map, e);
}

/** 機能している入口（配置済み・表通りに出られる）。 */
export function activeEntrances(map: ClubMap): Equipment[] {
  return placedRooms(map).filter((e) => e.kind === "entrance" && entranceOpen(map, e));
}

/** 入口に接している敷地内の道マス（ここが全ての経路の起点）。 */
export function entranceRoadCells(map: ClubMap): Cell[] {
  const out: Cell[] = [];
  const seen = new Set<number>();
  for (const e of activeEntrances(map)) {
    for (const c of borderCells(map, e)) {
      if (!isOpenGround(map, c.gx, c.gy)) continue;
      const i = idxOf(map, c.gx, c.gy);
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(c);
    }
  }
  return out;
}

/** 入口からの距離場（全ての「繋がっているか」判定の土台）。 */
export function entranceField(map: ClubMap): DistField {
  return bfsRoads(map, entranceRoadCells(map));
}

export interface RoomAccess {
  /** 入口から道を辿って行けるか。 */
  reachable: boolean;
  /** 入口からの歩数（-1＝行けない）。 */
  dist: number;
  /** 出入りに使う道マス（部屋に接していて、いちばん入口に近いところ）。 */
  door: Cell | null;
  /** 道に一度も接していない（＝道を敷けば繋がる、という案内を分けるため）。 */
  noRoad: boolean;
}

/** その部屋への行き方（入口からの距離つき）。 */
export function accessOf(map: ClubMap, e: Equipment, field: DistField): RoomAccess {
  if (e.gx == null || e.gy == null) return { reachable: false, dist: -1, door: null, noRoad: true };
  if (e.kind === "entrance") {
    // 入口そのものは「表通りに出られれば使える」（面していなくても私道があればよい）。
    const ok = entranceOpen(map, e);
    return { reachable: ok, dist: 0, door: null, noRoad: !ok };
  }
  let best = -1;
  let door: Cell | null = null;
  let anyRoad = false;
  for (const c of borderCells(map, e)) {
    if (!isOpenGround(map, c.gx, c.gy)) continue;
    anyRoad = true;
    const d = field.dist[idxOf(map, c.gx, c.gy)];
    if (d < 0) continue;
    if (best < 0 || d < best) {
      best = d;
      door = c;
    }
  }
  return { reachable: best >= 0, dist: best < 0 ? -1 : best + 1, door, noRoad: !anyRoad };
}

/** マップ全体の「行けるか」一覧（部屋ID→アクセス）。 */
export function accessMap(map: ClubMap): Map<number, RoomAccess> {
  const field = entranceField(map);
  const out = new Map<number, RoomAccess>();
  for (const e of placedRooms(map)) out.set(e.id, accessOf(map, e, field));
  return out;
}

/**
 * 歩いて行けない部屋の一覧（警告に出す）。
 * 未配置の部屋は「そもそも建っていない」ので別扱い。
 */
export function strandedRooms(map: ClubMap): { room: Equipment; access: RoomAccess }[] {
  const field = entranceField(map);
  const out: { room: Equipment; access: RoomAccess }[] = [];
  for (const e of placedRooms(map)) {
    const a = accessOf(map, e, field);
    if (!a.reachable) out.push({ room: e, access: a });
  }
  return out;
}

/** 部屋Aの出入口から部屋Bの出入口までの道のり（歩数）。行けなければ -1。 */
export function distanceBetween(map: ClubMap, a: Equipment, b: Equipment): number {
  const from = doorCellsOf(map, a);
  if (from.length === 0) return -1;
  const field = bfsRoads(map, from);
  let best = -1;
  for (const c of doorCellsOf(map, b)) {
    const d = field.dist[idxOf(map, c.gx, c.gy)];
    if (d < 0) continue;
    if (best < 0 || d < best) best = d;
  }
  return best;
}

/** その部屋に接している道マス（出入口の候補）。 */
export function doorCellsOf(map: ClubMap, e: Equipment): Cell[] {
  return borderCells(map, e).filter((c) => isOpenGround(map, c.gx, c.gy));
}

/**
 * 道を辿る経路（マスの並び）。from も to も道マスであること。
 * 行けなければ null。
 */
export function pathBetweenCells(map: ClubMap, from: Cell, to: Cell): Cell[] | null {
  if (!isOpenGround(map, from.gx, from.gy) || !isOpenGround(map, to.gx, to.gy)) return null;
  const field = bfsRoads(map, [from]);
  const goal = idxOf(map, to.gx, to.gy);
  if (field.dist[goal] < 0) return null;
  const out: Cell[] = [];
  let cur = goal;
  while (cur >= 0) {
    out.push({ gx: cur % map.cols, gy: Math.floor(cur / map.cols) });
    cur = field.prev[cur];
  }
  return out.reverse();
}

/**
 * 部屋から部屋へ歩く道順（出発の部屋の中心 → 道 → 到着の部屋の中心）。
 * 道が繋がっていなければ null。
 */
export function routeBetweenRooms(
  map: ClubMap,
  from: Equipment,
  to: Equipment,
  /** 目的の部屋の「どの出入口から入るか」。省略すると全部の出入口が候補。 */
  goalCells?: readonly Cell[],
): Cell[] | null {
  const starts = doorCellsOf(map, from);
  const goals = goalCells && goalCells.length > 0 ? goalCells : doorCellsOf(map, to);
  if (starts.length === 0 || goals.length === 0) return null;
  const field = bfsRoads(map, starts);
  let best = -1;
  let bestIdx = -1;
  for (const c of goals) {
    const i = idxOf(map, c.gx, c.gy);
    const d = field.dist[i];
    if (d < 0) continue;
    if (best < 0 || d < best) {
      best = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  const road: Cell[] = [];
  let cur = bestIdx;
  while (cur >= 0) {
    road.push({ gx: cur % map.cols, gy: Math.floor(cur / map.cols) });
    cur = field.prev[cur];
  }
  road.reverse();
  return [centerOf(from), ...road, centerOf(to)];
}

/**
 * 入口から部屋まで歩く道順。
 * 「敷地の外 → 入口 → 道 → 部屋」の順に並ぶ。行けなければ null。
 */
export function routeFromEntrance(
  map: ClubMap,
  to: Equipment,
  entrance?: Equipment,
  /** 目的の部屋の「どの出入口から入るか」。省略すると全部の出入口が候補。 */
  goalCells?: readonly Cell[],
): Cell[] | null {
  const gate = entrance ?? nearestEntrance(map, to);
  if (!gate) return null;
  if (to.id === gate.id) return [outsideCellOf(map, gate), centerOf(gate)];
  const starts = borderCells(map, gate).filter((c) => isOpenGround(map, c.gx, c.gy));
  if (starts.length === 0) return null;
  const field = bfsRoads(map, starts);
  const goals = goalCells && goalCells.length > 0 ? goalCells : doorCellsOf(map, to);
  let best = -1;
  let bestIdx = -1;
  for (const c of goals) {
    const i = idxOf(map, c.gx, c.gy);
    const d = field.dist[i];
    if (d < 0) continue;
    if (best < 0 || d < best) {
      best = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  const road: Cell[] = [];
  let cur = bestIdx;
  while (cur >= 0) {
    road.push({ gx: cur % map.cols, gy: Math.floor(cur / map.cols) });
    cur = field.prev[cur];
  }
  road.reverse();
  return [outsideCellOf(map, gate), centerOf(gate), ...road, centerOf(to)];
}

/** その部屋にいちばん近い（＝距離の短い）入口。 */
export function nearestEntrance(map: ClubMap, to: Equipment): Equipment | null {
  const gates = activeEntrances(map);
  if (gates.length === 0) return null;
  if (to.kind === "entrance") return gates.find((g) => g.id === to.id) ?? gates[0];
  let best: Equipment | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const g of gates) {
    const starts = borderCells(map, g).filter((c) => isOpenGround(map, c.gx, c.gy));
    if (starts.length === 0) continue;
    const field = bfsRoads(map, starts);
    for (const c of doorCellsOf(map, to)) {
      const d = field.dist[idxOf(map, c.gx, c.gy)];
      if (d >= 0 && d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
  }
  return best;
}

/** 入口の外側（敷地の外の道路）のマス。人はここから現れ、ここへ帰る。 */
export function outsideCellOf(map: ClubMap, gate: Equipment): Cell {
  const outer = borderCells(map, gate).filter((c) => isPerimeter(map, c.gx, c.gy));
  if (outer.length > 0) {
    const c = outer[Math.floor(outer.length / 2)];
    // さらに1マス外へ逃がして、画面の外から歩いてくるように見せる
    const ctr = centerOf(gate);
    const dx = Math.sign(c.gx - ctr.gx);
    const dy = Math.sign(c.gy - ctr.gy);
    return { gx: c.gx + dx * 0.6, gy: c.gy + dy * 0.6 };
  }
  return centerOf(gate);
}

// ------------------------------------------------------------------ 導線の良さ

/**
 * 入口からの距離を「効率」に翻訳する（1.0＝理想的に近い）。
 * 近いほど移動に時間を取られず、練習に使える時間が増える、という表現。
 */
export function routeEfficiency(dist: number): number {
  if (dist < 0) return 0;
  const over = Math.max(0, dist - ROUTE.idealDist);
  return Math.max(ROUTE.minEfficiency, 1 - over * ROUTE.penaltyPerTile);
}

/** 効率の呼び名（UIに出す）。 */
export function routeEfficiencyLabel(eff: number): string {
  if (eff <= 0) return "行けない";
  if (eff >= 0.99) return "とても良い";
  if (eff >= 0.94) return "良い";
  if (eff >= 0.85) return "ふつう";
  if (eff >= 0.72) return "遠い";
  return "かなり遠い";
}

/**
 * 施設全体の動線の良さ（練習に効く倍率）。
 * 練習で使う部屋（プール・スタジオ・筋トレルーム）の平均で決まる。
 */
export function facilityRouteEfficiency(map: ClubMap): number {
  const field = entranceField(map);
  const targets = placedRooms(map).filter(
    (e) => equipmentDef(e.kind).lanes > 0 || e.kind === "studio" || e.kind === "gym",
  );
  if (targets.length === 0) return 1;
  let sum = 0;
  let n = 0;
  for (const e of targets) {
    const a = accessOf(map, e, field);
    if (!a.reachable) continue;
    sum += routeEfficiency(a.dist);
    n++;
  }
  return n === 0 ? ROUTE.minEfficiency : sum / n;
}

/** 変化を検出するための署名（描画の作り直し判定に使う）。 */
export function mapSignature(map: ClubMap): string {
  // 【グレードも署名に入れる】部屋の見た目はグレードで変わる（→ gfx/roomStyle）。
  // 位置と種類だけで署名を作っていたころは、グレードアップしても署名が変わらず、
  // **タイトルに戻って入り直すまで古い見た目のまま**だった。
  const rooms = placedRooms(map)
    // 向きも入れる（回したら床・壁・什器を描き直す）
    .map((e) => `${e.id}:${e.kind}@${e.gx},${e.gy}g${e.grade ?? 1}r${e.rot ?? 0}`)
    .sort()
    .join("|");
  // 敷地の広さも署名に入れる（広げたら床を描き直す必要があるため）
  return `${map.cols}x${map.rows}L${map.landSteps}/${rooms}`;
}
