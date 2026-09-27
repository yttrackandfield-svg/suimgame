import { MAP } from "../config/balance";
import {
  cellsOf,
  centerOf,
  doorCellsOf,
  isBuildable,
  isPerimeter,
  landBounds,
  mapSignature,
  nearestEntrance,
  outsideCellOf,
  placedRooms,
  roomAt,
  routeBetweenRooms,
  routeFromEntrance,
  type Cell,
  type ClubMap,
} from "../sim/clubMap";
import {
  equipmentDef,
  footprintOf,
  gradeOf,
  isPool,
  roomLocal,
  roomPoint,
  roomSize,
  rotOf,
  standRowsOf,
  type Equipment,
  type RoomKind,
} from "../sim/equipment";
import { buildWallEdges, type EdgeDir, type WallEdge, type WallKind } from "../sim/walls";
import { BUILDING_TINT } from "../gfx/roomStyle";

export type { WallKind, WallEdge } from "../sim/walls";

/**
 * マップ（マス目）をクォータービューに描くための情報。
 *
 * 以前は施設のかたちを固定で持っていたが、いまはプレイヤーが自由に配置するので、
 * このモジュールは「今のマップから、床・壁・什器・立ち位置・歩く道順を導く」役になっている。
 *
 * 投影は depth = gx + gy。gx/gy が小さいほど奥。
 *   ・部屋の上端行と左端列 → 奥の壁（高く立てる）
 *   ・部屋の下端行と右端列 → 手前の縁（低くして中を見せる）
 * 出入口（道に接しているマス）の正面だけ壁を抜いて開口部にする。
 */

export type { Cell } from "../sim/clubMap";

export interface Waypoint extends Cell {
  /** そのマスに着いたときの着替え（"suit"＝水着になる／"street"＝私服に戻る）。 */
  change?: "suit" | "street";
}

// ------------------------------------------------------------------ 床

export type FloorKind =
  | "grass"
  | "unowned" // まだ買っていない土地（暗く描く）
  | "sidewalk" // 建物の外：歩道
  | "street" // 建物の外：車道
  | "road"
  | "entrance" // フロントの土間（入口の床。館内とは色を変えて「ここから入る」と分かるように）
  | "approach" // 建物の外：入口の前だけ舗装した車寄せ
  | "water"
  | "deck"
  | "stand" // 大型プールの観客席（段になったスタンド）
  | "lobby"
  | "studio"
  | "science" // 医科学センター（大型施設）
  | "altitudeLab" // 高地トレーニング棟（大型施設）
  | "gym"
  | "recovery"
  | "coachroom"
  | "meeting"
  | "cafeteria"
  | "clinic"
  | "dorm"
  | "sauna"
  | "bath" // 風呂の洗い場・湯船のふち（タイル）
  | "bathWater" // 湯船の中（お湯）
  | "openair" // 外気浴のウッドデッキ
  | "shop"
  // 賑わいスペース（一般客向け）
  | "cafe"
  | "lounge"
  | "kids"
  | "vending";

/** 部屋の種類 → 床の種類。 */
export function roomFloorKind(kind: RoomKind): FloorKind {
  switch (kind) {
    case "cafe":
      return "cafe";
    case "lounge":
      return "lounge";
    case "kids":
      return "kids";
    case "vending":
      return "vending";
    case "pool6":
    case "pool8":
    case "pool10":
      return "water";
    case "science":
      return "science";
    case "altitudeLab":
      return "altitudeLab";
    case "studio":
      return "studio";
    case "gym":
      return "gym";
    case "recovery":
      return "recovery";
    case "meeting":
      return "meeting";
    case "cafeteria":
      return "cafeteria";
    case "clinic":
      return "clinic";
    case "coachroom":
      return "coachroom";
    case "dorm":
      return "dorm";
    case "sauna":
      return "sauna";
    case "bath":
      return "bath";
    case "openair":
      return "openair";
    case "shop":
      return "shop";
    case "entrance":
      return "entrance";
    default:
      return "lobby";
  }
}

export const ROOM_LABEL: Partial<Record<FloorKind, string>> = {
  sauna: "サウナ",
  bath: "風呂",
  bathWater: "湯船",
  openair: "外気浴",
  shop: "売店",
  water: "プール",
  deck: "プールサイド",
  lobby: "フロント",
  studio: "スタジオ",
  gym: "筋トレルーム",
  recovery: "マッサージエリア",
  cafe: "カフェ",
  lounge: "休憩ラウンジ",
  kids: "キッズコーナー",
  vending: "自販機",
  coachroom: "コーチ室",
  meeting: "会議室",
  cafeteria: "食堂",
  clinic: "ドクタールーム",
  dorm: "寮",
  road: "通路",
  grass: "空き地",
  sidewalk: "歩道",
  street: "道",
};

/**
 * 【建物の外】敷地から何マス外か。
 * 建物の中（＝買ってある敷地）は 0、外周の歩道が 1、そこから外へ数える。
 */
export function outsideRing(map: ClubMap, gx: number, gy: number): number {
  const b = landBounds(map);
  return Math.max(0, b.x0 - gx, gx - b.x1, b.y0 - gy, gy - b.y1);
}

/**
 * 建物の外の帯（歩道 → 植樹帯 → 車道）。
 *
 * **帯は狭く、中身は詰める。** 広く取ると、そこが空き地に見えて
 * 「施設と道のあいだにグレーの空間がある」という見え方になってしまう。
 * 建物のすぐ外を街路樹で縁取り、その先はもう車道、という詰まった作りにしてある。
 *
 * 敷地を買い足すと帯ごと外へ動く（landBounds からの距離で決めているため）。
 */
export const OUTSIDE_BANDS = {
  /** 建物ぎわの歩道（＝外周の道路リング。人はここを歩く）。 */
  curb: 1,
  /** 街路樹の並ぶ植樹帯（ここまで）。 */
  walk: 2,
  /** 車道（ここまで。上り下りの2車線）。 */
  street: 4,
} as const;

// approach（入口前の車寄せ）は**建物の外**。屋内の質感（天井照明）は乗せない。
const OUTDOOR_FLOORS: ReadonlySet<FloorKind> = new Set(["unowned", "sidewalk", "street", "approach"]);

/** 建物の中の床か（天井の照明・屋内の質感をのせる対象）。 */
export function isIndoorFloor(kind: FloorKind): boolean {
  return !OUTDOOR_FLOORS.has(kind);
}

/**
 * 建物の外のマスが、建物のどちら側にあるか。
 * 駐車枠の白線や車道のセンターラインを、建物の辺と平行に引くために使う。
 * "x" ＝ 東西（左右）の帯、"y" ＝ 南北（上下）の帯。
 */
export function outsideAxis(map: ClubMap, gx: number, gy: number): "x" | "y" {
  const b = landBounds(map);
  const dx = Math.max(b.x0 - gx, gx - b.x1);
  const dy = Math.max(b.y0 - gy, gy - b.y1);
  return dx >= dy ? "x" : "y";
}

export function outsideFloorKind(map: ClubMap, gx: number, gy: number): FloorKind {
  const d = outsideRing(map, gx, gy);
  if (d <= OUTSIDE_BANDS.walk) return "sidewalk";
  if (d <= OUTSIDE_BANDS.street) return "street";
  return "unowned";
}

/**
 * プールの手前の1列はプールサイド（飛び込み台・コーチが立つ場所）。
 * 「手前」は回す前の向きでの最下行。回したプールでは東端の列になる（→ roomLocal）。
 */
export function isPoolDeckCell(room: Equipment, gx: number, gy: number): boolean {
  if (!isPool(room.kind) || room.gx == null || room.gy == null) return false;
  return Math.floor(roomLocal(room, gx, gy).dy) === footprintOf(room.kind).h - 1;
}

/**
 * 【観客席】大型プールだけが持つ、奥の段になった客席（→ EQUIPMENT.rooms.pool10.standRows）。
 *
 * プールの行は奥から「観客席 → 水面 → プールサイド」の3層。
 * standRows が 0 の普通のプールでは、この関数は常に false を返すので、
 * 6/8レーンプールの見た目と当たり判定は今までどおり。
 */
export function isPoolStandCell(room: Equipment, gx: number, gy: number): boolean {
  if (!isPool(room.kind) || room.gx == null || room.gy == null) return false;
  const rows = standRowsOf(room.kind);
  if (rows <= 0) return false;
  return Math.floor(roomLocal(room, gx, gy).dy) < rows;
}

/**
 * 【風呂】いちばん奥の行（回す前の向き）は洗い場（カランが並ぶタイル床）、そこから手前が湯船。
 * プールの「最下行だけプールサイド」と同じ考え方で、1つの部屋を床の種類で描き分ける。
 * 湯船が広いので、人が「浸かっている」絵を大人数ぶん作れる。
 */
export function isBathWashCell(room: Equipment, gx: number, gy: number): boolean {
  if (room.kind !== "bath" || room.gx == null || room.gy == null) return false;
  return Math.floor(roomLocal(room, gx, gy).dy) === 0;
}

/** その位置が湯船（お湯の中）か。人を浸からせる場所の判定に使う。 */
export function isBathWaterCell(room: Equipment, gx: number, gy: number): boolean {
  if (room.kind !== "bath" || room.gx == null || room.gy == null) return false;
  const f = footprintOf(room.kind);
  return f.h <= 1 ? true : !isBathWashCell(room, gx, gy);
}

export function floorKindAt(map: ClubMap, gx: number, gy: number): FloorKind {
  const room = roomAt(map, gx, gy);
  if (room) {
    if (isPool(room.kind)) {
      if (isPoolStandCell(room, gx, gy)) return "stand";
      return isPoolDeckCell(room, gx, gy) ? "deck" : "water";
    }
    if (room.kind === "bath") return isBathWaterCell(room, gx, gy) ? "bathWater" : "bath";
    return roomFloorKind(room.kind);
  }
  // 敷地の中で部屋が建っていないマスは、まるごと通路（＝どこでも歩ける）。
  if (isBuildable(map, gx, gy)) return "road";
  // 入口の正面だけは車寄せ（道 → 車寄せ → 入口、と目で追えるように）
  if (approachSet(map).has(`${gx},${gy}`)) return "approach";
  // 建物の外は、駐車場・歩道・車道の帯にする（芝生は敷かない）
  return outsideFloorKind(map, gx, gy);
}


// ------------------------------------------------------------------ 入口（フロント）の見せ方

/**
 * 入口が「どの辺から外へ出るか」。
 *
 * 敷地の縁に接していれば、その辺が玄関の向き。接していない（私道で繋いでいる）ときは
 * いちばん近い辺を向いているものとして扱う。
 * 戻り値の dx/dy は外向き（+1 なら東／南）。
 */
export function entranceFacing(map: ClubMap, gate: Equipment): { dx: number; dy: number } {
  const b = landBounds(map);
  const f = roomSize(gate);
  const gx = gate.gx as number;
  const gy = gate.gy as number;
  const cands = [
    { dx: 0, dy: -1, d: gy - b.y0 },
    { dx: 0, dy: 1, d: b.y1 - (gy + f.h - 1) },
    { dx: -1, dy: 0, d: gx - b.x0 },
    { dx: 1, dy: 0, d: b.x1 - (gx + f.w - 1) },
  ];
  cands.sort((a, c) => a.d - c.d);
  return { dx: cands[0].dx, dy: cands[0].dy };
}

/** 入口の「外に面したマス」（この列／行に自動ドアを立てる）。 */
export function entranceDoorCells(map: ClubMap): { cell: Cell; dir: EdgeDir; front: boolean }[] {
  const out: { cell: Cell; dir: EdgeDir; front: boolean }[] = [];
  for (const gate of placedRooms(map)) {
    if (gate.kind !== "entrance") continue;
    const f = roomSize(gate);
    const gx = gate.gx as number;
    const gy = gate.gy as number;
    const face = entranceFacing(map, gate);
    if (face.dy !== 0) {
      // 南向き（手前）／北向き（奥）… タイルの上辺（n）に沿って立てる
      const row = face.dy > 0 ? gy + f.h : gy;
      for (let x = 0; x < f.w; x++) out.push({ cell: { gx: gx + x, gy: row }, dir: "n", front: face.dy > 0 });
    } else {
      const col = face.dx > 0 ? gx + f.w : gx;
      for (let y = 0; y < f.h; y++) out.push({ cell: { gx: col, gy: gy + y }, dir: "w", front: face.dx > 0 });
    }
  }
  return out;
}

/**
 * 入口の前だけ舗装する「車寄せ」のマス。
 *
 * 建物の外は一面おなじ歩道なので、どこから入るのかが分からない。
 * 入口の正面（外向き）に数マスだけ別の床を敷いて、道 → 車寄せ → 入口 と目で追えるようにする。
 */
const APPROACH_DEPTH = 2;

export function approachCells(map: ClubMap): Cell[] {
  const out: Cell[] = [];
  for (const gate of placedRooms(map)) {
    if (gate.kind !== "entrance") continue;
    const f = roomSize(gate);
    const gx = gate.gx as number;
    const gy = gate.gy as number;
    const face = entranceFacing(map, gate);
    const span = face.dy !== 0 ? f.w : f.h;
    for (let i = 0; i < span; i++) {
      for (let d = 1; d <= APPROACH_DEPTH; d++) {
        const cx = face.dy !== 0 ? gx + i : face.dx > 0 ? gx + f.w - 1 + d : gx - d;
        const cy = face.dx !== 0 ? gy + i : face.dy > 0 ? gy + f.h - 1 + d : gy - d;
        out.push({ gx: cx, gy: cy });
      }
    }
  }
  return out;
}

/** approachCells の索引（床の焼き付けで1マスずつ引くのでキャッシュする）。 */
let approachMemo: { sig: string; set: Set<string> } | null = null;

function approachSet(map: ClubMap): Set<string> {
  const sig = mapSignature(map);
  if (approachMemo && approachMemo.sig === sig) return approachMemo.set;
  const set = new Set(approachCells(map).map((c) => `${c.gx},${c.gy}`));
  approachMemo = { sig, set };
  return set;
}

/** 描画する範囲（マップ全体。カメラの動ける範囲＝芝生も含む）。 */
export function worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  return { minX: 0, maxX: MAP.cols - 1, minY: 0, maxY: MAP.rows - 1 };
}

/**
 * 床を1マスずつ描いて焼き付ける範囲。
 *
 * **買ってある敷地＋外周の道路＋余白1マス**だけにする。
 * その外側はどこまで行っても同じ芝生なので、1枚のタイル画像を敷き詰めれば足りる
 *（→ FacilityScene の芝生レイヤ）。マップが 37×37 に広がっても、
 * 焼く絵の大きさは「いま持っている土地」の広さで済む。
 */
export function groundCells(map: ClubMap): { minX: number; maxX: number; minY: number; maxY: number } {
  const b = landBounds(map);
  // 駐車場・歩道・車道の帯ぶんまで1マスずつ描く（その外は無地なのでタイルの敷き詰めで足りる）
  const pad = OUTSIDE_BANDS.street;
  return {
    minX: Math.max(0, b.x0 - pad),
    maxX: Math.min(MAP.cols - 1, b.x1 + pad),
    minY: Math.max(0, b.y0 - pad),
    maxY: Math.min(MAP.rows - 1, b.y1 + pad),
  };
}

// ------------------------------------------------------------------ 壁（エッジウォール）

/**
 * 描画用の壁一覧。
 * 実体は sim/walls.ts（セルの北辺・西辺だけに持つ薄板）で、
 * ここでは「どの色で塗るか（面している部屋の床種）」を足して返す。
 */
/**
 * 描画にだけ出てくる壁の種類。
 * 内壁は sim の WallKind そのまま。outer/outerGlass は建物の外壁（当たり判定には出てこない）。
 */
export type RenderWallKind = WallKind | "outer" | "outerGlass";

export interface WallRender extends Omit<WallEdge, "kind"> {
  kind: RenderWallKind;
  facing: FloorKind;
  /** 色を直に指定する（外壁のベージュ）。無ければ facing の部屋色を使う。 */
  tint?: number;
}

export function wallEdgesOf(map: ClubMap): WallRender[] {
  const rooms = new Map(placedRooms(map).map((r) => [r.id, r]));
  return buildWallEdges(map).map((e) => {
    const room = rooms.get(e.roomId);
    let facing: FloorKind = room ? roomFloorKind(room.kind) : "lobby";
    // プールの手前の柵はプールサイド色に合わせる（水色の壁が浮かないように）
    if (room && isPool(room.kind) && e.front) facing = "deck";
    return { ...e, facing };
  });
}

// ------------------------------------------------------------------ 建物の外壁（屋内であることの土台）

/**
 * 【ここが「屋内施設」の決め手】敷地をぐるりと囲む建物の外壁。
 *
 * 部屋ごとの壁（wallEdgesOf）とは別に、**敷地そのものの外周**に壁を立てる。
 * これが無いと、床の色をどう変えても「屋根の無い広場」にしか見えない。
 *
 *   奥（北辺・西辺）… 高い壁。建物の背になる
 *   手前（南辺・東辺）… 低い壁。中が見えるように腰高で切る
 *   一定間隔で glass にして**窓**にする（外の光が入る屋内プールらしさ）
 *   入口の前だけは開けておく（そこから人が出入りする）
 *
 * 敷地を買い足すと外壁も一緒に外へ広がる（landBounds を見ているので自動）。
 */
export function buildingWallEdges(map: ClubMap): WallRender[] {
  const b = landBounds(map);
  const out: WallRender[] = [];
  // 【玄関だけ壁を抜く】入口が**外を向いている辺**のぶんだけ開ける。
  // 部屋のまわり全部を開けると、壁に大きな穴が空いただけに見えて
  // 「どこから入るのか」が却って分からない。開口部は正面だけにして、
  // そこに自動ドアを立てる（→ entranceDoorCells）。
  const gates = new Set<string>();
  for (const e of placedRooms(map)) {
    if (e.kind !== "entrance") continue;
    for (const d of entranceDoorCells(map)) {
      if (d.dir === "n") gates.add(`n:${d.cell.gx},${d.cell.gy}`);
      else gates.add(`w:${d.cell.gx},${d.cell.gy}`);
    }
  }

  const push = (gx: number, gy: number, dir: EdgeDir, front: boolean, i: number): void => {
    if (gates.has(`${dir}:${gx},${gy}`)) return; // 玄関の正面だけ開ける
    // 3マスに2枚を窓にする。屋内プールらしく、外光の入る大きなガラス面にしたい
    const kind: RenderWallKind = i % 3 === 2 ? "outer" : "outerGlass";
    out.push({ gx, gy, dir, kind, front, roomId: -1, facing: "lobby", tint: BUILDING_TINT });
  };

  let i = 0;
  // 北辺（奥）と南辺（手前）
  for (let gx = b.x0; gx <= b.x1; gx++, i++) {
    push(gx, b.y0, "n", false, i);
    push(gx, b.y1 + 1, "n", true, i);
  }
  // 西辺（奥）と東辺（手前）
  i = 0;
  for (let gy = b.y0; gy <= b.y1; gy++, i++) {
    push(b.x0, gy, "w", false, i);
    push(b.x1 + 1, gy, "w", true, i);
  }
  return out;
}

/** 敷居（出入口）を描くマス。 */
export function doorMarks(map: ClubMap): Cell[] {
  const out: Cell[] = [];
  const seen = new Set<string>();
  for (const room of placedRooms(map)) {
    for (const d of doorCellsOf(map, room)) {
      const key = `${d.gx},${d.gy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

// ------------------------------------------------------------------ プール（レーン）

// レーン・プールサイド・飛び込み台は、**回す前の向き**（横に長く、最下行がプールサイド）で
// 位置を決めてから roomPoint でマップに置く。回したプールではレーンが縦に走り、
// プールサイドは東端の列になる。

/** レーンで泳ぐときの範囲。 */
export interface SwimLane {
  /**
   * 泳ぐ向きの軸。"gx"＝回していないプール（画面の左上↔右下）、
   * "gy"＝回したプール（画面の右上↔左下）。
   */
  axis: "gx" | "gy";
  /** 折り返す両端（axis の座標）。s0 が飛び込み台の側。 */
  s0: number;
  s1: number;
  /** レーンの中心（axis と直交するほうの座標）。 */
  at: number;
}

/** 回す前の向きでの、レーン中心の行（部屋の上端からの相対）。 */
function laneLocalRows(pool: Equipment): number[] {
  const f = footprintOf(pool.kind);
  const lanes = equipmentDef(pool.kind).lanes;
  const stand = standRowsOf(pool.kind); // 奥の観客席（持たないプールは0）
  const waterH = f.h - 1 - stand; // 最下行はプールサイド、奥は観客席
  const out: number[] = [];
  for (let l = 0; l < lanes; l++) out.push(stand + ((l + 0.5) * waterH) / lanes);
  return out;
}

/** そのプールのレーン（レーン数ぶん。泳ぐ人に渡す）。 */
export function swimLanesOf(pool: Equipment): SwimLane[] {
  if (pool.gx == null || pool.gy == null) return [];
  const f = footprintOf(pool.kind);
  const axis = rotOf(pool) === 1 ? "gy" : "gx";
  return laneLocalRows(pool).map((row) => {
    const a = roomPoint(pool, 0.4, row);
    const b = roomPoint(pool, f.w - 1 - 0.4, row);
    return axis === "gx" ? { axis, s0: a.gx, s1: b.gx, at: a.gy } : { axis, s0: a.gy, s1: b.gy, at: a.gx };
  });
}

/** レーンの境目（ロープ）。両端のマップ上の位置で返す。 */
export function laneRopesOf(pool: Equipment): { from: Cell; to: Cell }[] {
  if (pool.gx == null || pool.gy == null) return [];
  const f = footprintOf(pool.kind);
  const lanes = equipmentDef(pool.kind).lanes;
  const stand = standRowsOf(pool.kind);
  const waterH = f.h - 1 - stand;
  const out: { from: Cell; to: Cell }[] = [];
  for (let l = 0; l <= lanes; l++) {
    const row = stand + (l * waterH) / lanes;
    // 泳ぐ範囲（0.4 〜 幅-1.4）より、両端を 0.35 マスずつ長く張る
    out.push({ from: roomPoint(pool, 0.05, row), to: roomPoint(pool, f.w - 1 - 0.05, row) });
  }
  return out;
}

/**
 * プールサイドの上の位置。along は回す前の向きでの横位置（部屋の左端からのマス）。
 * コーチ・見学の客・掃除の職員はここに立たせる。
 */
export function poolDeckAt(pool: Equipment, along: number): Cell {
  return roomPoint(pool, along, footprintOf(pool.kind).h - 1);
}

/** その位置からいちばん近いプールサイドの位置（水から上がるときのひと足）。 */
export function poolDeckNear(pool: Equipment, c: Cell): Cell {
  return poolDeckAt(pool, roomLocal(pool, c.gx, c.gy).dx);
}

/** その位置がプールの水の上か（プールサイドより奥にいるか）。 */
export function isOverPoolWater(pool: Equipment, c: Cell): boolean {
  const dy = roomLocal(pool, c.gx, c.gy).dy;
  // 観客席（奥の段）は水ではない
  return dy >= standRowsOf(pool.kind) && dy < footprintOf(pool.kind).h - 1 - 0.05;
}

/** 飛び込み台を置く位置（レーンごと、プールの左端）。swimLanesOf と同じ順。 */
export function startBlockCellsOf(pool: Equipment): Cell[] {
  if (pool.gx == null || pool.gy == null) return [];
  return laneLocalRows(pool).map((row) => roomPoint(pool, 0.1, row));
}

/** レーン番号を書く位置。 */
export function laneLabelCellsOf(pool: Equipment): Cell[] {
  if (pool.gx == null || pool.gy == null) return [];
  return laneLocalRows(pool).map((row) => roomPoint(pool, -0.55, row));
}

// ------------------------------------------------------------------ 部屋の中のマス

/**
 * その部屋の「中で使えるマス」。
 * 奥の壁（上端行・左端列）だけを避け、手前の縁は低いのでそのまま使う。
 * 器具の設置・立ち位置・什器はここから配る。
 * 幅か高さが1マスしかない部屋では footprint 全体を使う。
 */
export function innerCellsOf(room: Equipment): Cell[] {
  if (room.gx == null || room.gy == null) return [];
  // 奥の壁はマップの北辺・西辺なので、回した部屋でもいまの向きの大きさで数えればよい
  const f = roomSize(room);
  const out: Cell[] = [];
  const x0 = f.w >= 2 ? room.gx + 1 : room.gx;
  const y0 = f.h >= 2 ? room.gy + 1 : room.gy;
  for (let gy = y0; gy < room.gy + f.h; gy++) {
    for (let gx = x0; gx < room.gx + f.w; gx++) out.push({ gx, gy });
  }
  return out.length > 0 ? out : [centerOf(room)];
}

// ------------------------------------------------------------------ 温浴施設の席

/**
 * 温浴施設での過ごし方。人の描き方（沈み込み・座り・くつろぎ）を切り替える。
 *   soak  … 湯に浸かる（下半身がお湯に隠れる）
 *   sit   … サウナのベンチに座る
 *   relax … リクライニングチェアで寝そべる
 *   dine  … 食堂・カフェの椅子に座って食べる（上半身がしっかり見える）
 */
export type BathPose = "soak" | "sit" | "relax" | "dine";

export function bathPoseOf(kind: RoomKind): BathPose {
  if (kind === "sauna") return "sit";
  if (kind === "openair") return "relax";
  return "soak";
}

/**
 * サウナ・外気浴の席の位置（部屋の左上からの相対マス）。
 * ROOM_FITTINGS のベンチ・チェアの位置と対応させてあるので、
 * 人はちゃんと「ベンチに座り」「チェアに寝そべる」ように見える。
 */
const BATH_SEATS: Partial<Record<RoomKind, { dx: number; dy: number }[]>> = {
  /**
   * サウナ：ベンチ（2.0,0.6）（2.0,1.75）（1.15,2.55）に腰かける位置。
   *
   * 【左右に並べる】gx と gy を**逆向き**にずらすと画面の左右にだけ動くので、
   * 1台のベンチに2人が並んで座る（同じ向きにずらすと画面のほぼ真下に重なる）。
   *
   * 【ベンチより手前に置く】描く順は (gx+gy) で決まる（→ iso/projection.ts の depthFor）。
   * 以前は ±(0.13,-0.13) で**和がベンチとぴったり同じ**だったため、
   * 座面の絵が人の腰から上まで覆いかぶさり、「ベンチに埋まっている」ように見えていた。
   * 和を +0.12 だけ大きくして、人がベンチの手前に描かれるようにしてある
   *（これで座面の奥半分だけが見え、人が腰かけている形になる）。
   * ずらしたぶん人は画面で 3.6px 下がるので、POSE_STYLE.sit の seat.y で戻している。
   */
  sauna: [
    { dx: 1.93, dy: 0.79 },
    { dx: 2.19, dy: 0.53 },
    { dx: 1.93, dy: 1.94 },
    { dx: 2.19, dy: 1.68 },
    { dx: 1.21, dy: 2.61 },
  ],
  // 寝椅子はチェアと**同じマス**。体を椅子の面に載せる細かい調整は
  // 姿勢のほう（iso/people.ts の POSE_STYLE.relax）が px 単位で受け持つ。
  openair: [
    { dx: 0.9, dy: 1.05 },
    { dx: 2.7, dy: 1.05 },
    { dx: 0.9, dy: 2.25 },
    { dx: 2.7, dy: 2.25 },
  ],
};

/**
 * その温浴施設で人が入る席を、順に count 個返す。
 *
 * 風呂は湯船のマスをそのまま席にする（広い湯船に何人も浸かる）。
 * サウナ・外気浴はベンチ・チェアの位置（BATH_SEATS）に座らせる。
 * 席より人数が多いときは、少しずつずらして詰めて座らせる。
 */
/**
 * 食べる場所（食堂・カフェ）の席。
 *
 * ROOM_FITTINGS の椅子の位置とそろえてあるので、
 * 人はちゃんと「椅子に座って食べている」ように見える。
 * 席に着いた人は BathPose の "sit"（腰から下を隠す）で描く。
 */
const DINING_SEATS: Partial<Record<RoomKind, { dx: number; dy: number }[]>> = {
  /**
   * 食堂：長テーブルの向かい合わせ4席（椅子と同じ位置）。
   * 奥の席は椅子より **わずかに手前**、手前の席は椅子より **わずかに奥** に置く。
   * こうすると奥の人は椅子の上に、手前の人は椅子の背の向こうに描かれて、腰かけて見える。
   */
  cafeteria: [
    { dx: 0.9, dy: 1.06 },
    { dx: 1.9, dy: 1.06 },
    { dx: 0.9, dy: 1.94 },
    { dx: 1.9, dy: 1.94 },
  ],
  // カフェ：丸テーブル2台の、奥と手前の椅子
  cafe: [
    { dx: 1.0, dy: 1.21 },
    { dx: 2.7, dy: 1.21 },
    { dx: 1.0, dy: 1.99 },
    { dx: 2.7, dy: 1.99 },
  ],
};

/** その部屋は「座って飲み食いする部屋」か。 */
export function isDiningRoom(kind: RoomKind): boolean {
  return kind === "cafeteria" || kind === "cafe";
}

/** 食べる場所の席（部屋の左上からの相対マス → 実座標）。 */
export function diningSeatCells(room: Equipment): Cell[] {
  if (room.gx == null || room.gy == null) return [];
  const table = DINING_SEATS[room.kind];
  if (!table) return [];
  return table.map((s) => roomPoint(room, s.dx, s.dy));
}

/**
 * 配膳の持ち場（スタッフが立つところ）。
 * 食堂はカウンターの**内側**（客と向かい合う位置）に立たせる。
 *
 * 描く順は (dx+dy) で決まる（→ iso/projection.ts の depthFor）ので、
 * **配膳ライン（1.25, 0.5 ＝ 和 1.75）より和が小さい**ところに立たせること。
 * ここより手前に出すと、カウンターの絵の手前に描かれて「客側に立っている」ように見える。
 */
export function serveSpotOf(room: Equipment, index: number): Cell | null {
  if (room.gx == null || room.gy == null) return null;
  if (room.kind !== "cafeteria") return null;
  // 配膳ラインの奥側に、左から順に並ぶ（食堂1部屋につき2人まで＝ STAFF.capacityPerRoom）。
  // 和が 1.75 を超える 2.1 は3人目用で、いまの定員では使われない
  const lane = [0.95, 1.55, 2.1];
  return roomPoint(room, lane[index % lane.length] ?? 1.55, 0.04);
}

export function bathSeatCells(room: Equipment, count: number): Cell[] {
  if (room.gx == null || room.gy == null) return [];
  const spots: Cell[] = [];
  const table = BATH_SEATS[room.kind];
  if (table) {
    for (const s of table) spots.push(roomPoint(room, s.dx, s.dy));
  } else {
    // 風呂：湯船のマスを、奥から手前へ・左から右へ並べる（回す前の向きで数える）
    const f = footprintOf(room.kind);
    for (let dy = 0; dy < f.h; dy++) {
      for (let dx = 0; dx < f.w; dx++) {
        const seat = roomPoint(room, dx + 0.5, dy + 0.15);
        if (!isBathWaterCell(room, seat.gx, seat.gy)) continue;
        spots.push(seat);
      }
    }
  }
  if (spots.length === 0) spots.push(centerOf(room));

  const out: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const c = spots[i % spots.length];
    const dup = Math.floor(i / spots.length);
    out.push({ gx: c.gx + dup * 0.3, gy: c.gy + dup * 0.24 });
  }
  return out;
}

/** 部屋の中で人が立つ位置（練習・作業）。 */
/**
 * 手前の壁に埋まらない立ち位置。
 *
 * 部屋の**いちばん手前の行**にそのまま立たせると、1つ手前のセルに立つ壁
 * （手前の壁）が足元に重なって、足も接地影も隠れてしまう。
 * 半マスぶん奥へ下げるだけで、足元が壁の上に出て「床に立っている」ように見える。
 * マスの判定は四捨五入なので、床の種類（プールサイドなど）は変わらない。
 */
export function clearOfFrontWall(room: Equipment, cell: Cell): Cell {
  if (room.gx == null || room.gy == null) return cell;
  const f = roomSize(room);
  let out = cell;
  if (f.h >= 2 && out.gy >= room.gy + f.h - 1 - 0.01) out = { gx: out.gx, gy: out.gy - FRONT_WALL_CLEARANCE };
  // 回した部屋は「回す前の手前（プールサイドなど）」が東の壁ぎわに来るので、そちらからも離す
  if (rotOf(room) === 1 && f.w >= 2 && out.gx >= room.gx + f.w - 1 - 0.01) {
    out = { gx: out.gx - FRONT_WALL_CLEARANCE, gy: out.gy };
  }
  return out;
}

/** 手前の壁から離す量（マス）。0.5 以上にするとマスの判定が1つ奥へずれる。 */
const FRONT_WALL_CLEARANCE = 0.42;
/**
 * 部屋の中で人が立つ位置を count 人ぶん。**同じ場所に2人を置かない。**
 *
 * マスが足りないときは1マスを左右に分け合う。ここで大事なのは
 * **「ずらす向き」を画面の左右にすること**。
 * 等角では 画面X ∝ gx-gy ／ 画面Y ∝ gx+gy なので、
 * (+0.28, +0.22) のように gx と gy を同じ向きへずらすと、
 * 画面上ではほとんど真下（3px 横・15px 下）にしか動かず、**人がほぼ完全に重なる**
 *（コーチ室のコーチが団子になっていたのはこれ）。
 * gx と gy を**逆向き**に動かせば、画面の真横へきれいに離れる。
 */
export function standCellsOf(room: Equipment, count: number): Cell[] {
  const cells = innerCellsOf(room);
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  // 1マスあたり何人ぶんに分けるか（マスが足りていれば1人＝分けない）
  const per = Math.max(1, Math.ceil(n / cells.length));
  const out: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const c = cells[i % cells.length];
    const sub = Math.floor(i / cells.length);
    // 画面の左右へ等間隔に散らす（per=1 なら t=0＝マスの中央）
    const t = per <= 1 ? 0 : (sub / (per - 1) - 0.5) * SIDE_BY_SIDE * 2;
    // 前後にごく僅かずらして描画順を確定させる（同じ深度だとちらつく）
    const depth = sub * 0.02;
    out.push({ gx: c.gx + t + depth, gy: c.gy - t + depth });
  }
  return out;
}

/**
 * 1マスを分け合うときの、中心からの振れ幅（マス）。
 * 画面上の間隔 ＝ 2 × これ × TILE_W/2 なので、0.28 で約 34px 離れる
 *（キャラの見た目の幅がおよそ 40px なので、肩が触れるくらいで収まる）。
 */
const SIDE_BY_SIDE = 0.28;

// ------------------------------------------------------------------ 什器

export interface Fitting {
  cell: Cell;
  texture: string;
  scale: number;
  layer: number;
  /** 縦の原点（1＝床に立つ／0.5＝床に寝かせて敷く）。省略時は 1。 */
  originY?: number;
  /**
   * 絵を左右反転して描くか。回した部屋では什器の並びが鏡に映した形になるので、
   * 絵の向きもそろえて反転する（しないと、ベンチや寝椅子が並びと逆を向く）。
   */
  flipX?: boolean;
  /**
   * 絵の一部（横の範囲・反転する前の絵の座標）だけを描く。幅の広い絵を縦に切り分けて、
   * 切れ端ごとに重なり順（depthCell）を変えるのに使う（→ 大型プールの電光掲示板）。
   */
  crop?: { x: number; w: number };
  /** 重なり順を決めるマス（省略時は cell）。 */
  depthCell?: Cell;
}

interface FittingSpec {
  /** 部屋の左上からの相対位置（マス）。 */
  dx: number;
  dy: number;
  texture: string;
  scale?: number;
  layer?: number;
  /**
   * 縦の原点。既定は 1（＝足元が下端＝床に立っているもの）。
   * **床に寝かせて敷くもの**（ロゴマットなど）は 0.5 にして、絵の中心をマスの中心に置く。
   */
  originY?: number;
}

/**
 * 部屋ごとの什器・器具。相対座標なので、部屋を動かせば中身もついてくる。
 *
 * 【器具は部屋に同梱】器具を1つずつ買って置く仕組みは廃止した。
 * 部屋を買った時点でここに書いた器具が並び、**グレードを上げると増える**。
 * grade 1（小）は base だけ、2（中）は base+plus2、3（大）は base+plus2+plus3。
 * 「小はガランと、大はびっしり」が目で分かるように、数と種類の両方を増やす。
 *
 * 「どこが何の部屋か」が形で分かることを最優先にしている。
 */
interface RoomGear {
  /** 小（グレード1）から置かれるもの。 */
  base: FittingSpec[];
  /** 中（グレード2）で増えるもの。 */
  plus2?: FittingSpec[];
  /** 大（グレード3）でさらに増えるもの。 */
  plus3?: FittingSpec[];
}

const ROOM_FITTINGS: Partial<Record<RoomKind, RoomGear>> = {
  // 入口まわりは人の目が集まるので、賑わいの小物を足しておく
  /**
   * 【フロント（入口）】受付カウンター・待合のソファ・床のロゴ。
   *
   * 受付という部屋は廃止したので、**入口がフロントを兼ねる**。
   * 2×1マスと小さいので、横に長いカウンターを1台置いて「受付らしさ」を作り、
   * 手前に床マット、脇にソファと緑を置いて奥行きを出す。
   * すべて部屋の中に収める（入口はどの辺にも置けるので、外へはみ出すと歩道に家具が出る）。
   */
  entrance: {
    base: [
      // 床のロゴ（フロントの真ん中）
      { dx: 1.5, dy: 1.15, texture: "fnFrontMat", scale: 1.0, originY: 0.5, layer: 18 },
      // 受付カウンター。**部屋の中央は部屋名の札が浮くので、左に寄せる**
      { dx: 2.1, dy: 0.42, texture: "fnFrontDesk", scale: 1.3, layer: 22 },
      { dx: 0.35, dy: 0.35, texture: "fnPlant", scale: 1.0, layer: 22 },
      { dx: 2.75, dy: 0.9, texture: "fnPlant", scale: 0.85, layer: 23 },
      // 待合（手前の左右）
      { dx: 0.35, dy: 1.45, texture: "fnSofa", scale: 1.0, layer: 24 },
      { dx: 2.45, dy: 1.5, texture: "fnSofa", scale: 1.0, layer: 24 },
    ],
  },

  /**
   * 【スタジオ】ダンス・ヨガのスタジオ（4×3マス）。
   *
   *   奥の壁 … 鏡を並べて張り、手前にバレエバー（fnStudioMirror は壁の向きに傾けて描いてある）
   *   床     … ヨガマットを2列に敷く（床に寝かせるので originY 0.5・低い layer）
   *   壁ぎわ … 丸めたマットのかご・バランスボール・縄跳びのラック・スピーカー
   * 小＝鏡2枚とマット2枚。中で鏡がつながり、マットが4枚に。大で小物がそろって「使い込んだスタジオ」になる。
   *
   * 【手前の端には大事な物を置かない】部屋が建物の外壁ぞいに建つと、手前の外壁（高さ約1マス）が
   * 手前の列（dy 2.3 より先）を隠す。回した部屋では長い辺の奥（dx 3.4 より先）が隠れる。
   * マットの列は dy 1.05／1.85 に寄せ、端の列には背の高い物（かご・スピーカー）か、隠れても困らない物だけを置く。
   * 床に寝かせる物（フォームローラー）を端に置くと、絵のはみ出しが外壁の上に描かれてしまうので、鏡の前の空きに置く。
   * 鏡は 1.25 マスおきに 1.15 倍で並べ、すき間なくつながった「鏡の壁」に見せる。
   */
  studio: {
    base: [
      { dx: 0.75, dy: 0.04, texture: "fnStudioMirror", scale: 1.15, layer: 16, originY: 0.79 },
      { dx: 2.0, dy: 0.04, texture: "fnStudioMirror", scale: 1.15, layer: 16, originY: 0.79 },
      { dx: 1.25, dy: 1.05, texture: "fnYogaMatTeal", scale: 1.0, layer: 17, originY: 0.5 },
      { dx: 2.55, dy: 1.05, texture: "fnYogaMatPink", scale: 1.0, layer: 17, originY: 0.5 },
      { dx: 0.3, dy: 0.45, texture: "fnPlant", scale: 0.9 },
    ],
    plus2: [
      { dx: 3.25, dy: 0.04, texture: "fnStudioMirror", scale: 1.15, layer: 16, originY: 0.79 },
      { dx: 1.25, dy: 1.85, texture: "fnYogaMatPurple", scale: 1.0, layer: 17, originY: 0.5 },
      { dx: 2.55, dy: 1.85, texture: "fnYogaMatTeal", scale: 1.0, layer: 17, originY: 0.5 },
      { dx: 3.6, dy: 1.0, texture: "fnMatBasket", scale: 0.95 },
      { dx: 0.35, dy: 1.3, texture: "fnBalanceBalls", scale: 0.95 },
    ],
    plus3: [
      { dx: 2.7, dy: 0.5, texture: "fnFoamRollers", scale: 0.9, originY: 0.72 },
      { dx: 0.3, dy: 2.05, texture: "fnRopeRack", scale: 0.9 },
      { dx: 3.7, dy: 0.35, texture: "fnStudioSpeaker", scale: 0.9 },
    ],
  },

  /**
   * 【筋トレルーム】参考画像のジムを目標にした並び（6×4マス）。
   *
   * **3行×4列の格子に置く**（dx は 1.4 マスおき、dy は 1.3 マスおき）。
   * マシンの絵は64〜76pxあり、等角では1マスの横幅が48pxしかないので、
   * 詰めて置くと重なって何が何だか分からなくなる。格子で並べると、
   * 参考画像のように「マシンがずらりと整列したジム」に見える。
   *
   *   奥の列（dy 0.4）… ランニングマシン・バイクの有酸素ゾーン
   *   中の列（dy 1.7）… ラットプル・パワーラック・スミス・ケーブルの大型マシン
   *   手前の列（dy 3.0）… ダンベルラック・ベンチ・レッグプレス・ロー
   *
   * 小は4台だけでガランと、大は12台でびっしり。
   */
  gym: {
    base: [
      { dx: 0.9, dy: 0.4, texture: "gymTread", scale: 0.95 },
      { dx: 2.3, dy: 0.4, texture: "gymTread", scale: 0.95 },
      { dx: 0.9, dy: 3.0, texture: "gymRack", scale: 0.95 },
      { dx: 2.3, dy: 3.0, texture: "gymBench", scale: 0.95 },
    ],
    plus2: [
      { dx: 3.7, dy: 0.4, texture: "gymTread", scale: 0.95 },
      { dx: 5.1, dy: 0.4, texture: "gymBike", scale: 0.95 },
      { dx: 0.9, dy: 1.7, texture: "gymLat", scale: 0.95 },
      { dx: 2.3, dy: 1.7, texture: "gymBarbell", scale: 0.95 },
    ],
    plus3: [
      { dx: 3.7, dy: 1.7, texture: "gymSmith", scale: 0.95 },
      { dx: 5.1, dy: 1.7, texture: "gymCable", scale: 0.95 },
      { dx: 3.7, dy: 3.0, texture: "gymLegPress", scale: 0.95 },
      { dx: 5.1, dy: 3.0, texture: "gymRow", scale: 0.95 },
    ],
  },

  /**
   * 【マッサージエリア】施術ベッド・マッサージチェア・タオルワゴン（4×3マス）。
   *
   *   奥の列 … 施術ベッドを2台（床の向きにそろえた板。originY 0.65＝板のまん中）と、間のついたて
   *   壁ぎわ … 左にマッサージチェア、右にタオルワゴン・アロマの小卓・給水器
   * 小はベッド1台とワゴンだけ。中でベッドとチェアが増え、大でついたてと2台目のチェアがそろう。
   * 手前の列（dy 2.3 より先）は外壁に隠れることがあるので、背の高い物だけにしてある（→ スタジオの説明）。
   */
  recovery: {
    base: [
      { dx: 1.2, dy: 0.72, texture: "fnTreatBed", scale: 1.0, originY: 0.65 },
      { dx: 3.6, dy: 0.45, texture: "fnTowelCart", scale: 1.0 },
      { dx: 0.3, dy: 0.3, texture: "fnPlant", scale: 0.9 },
    ],
    plus2: [
      { dx: 2.6, dy: 0.72, texture: "fnTreatBed", scale: 1.0, originY: 0.65 },
      { dx: 0.4, dy: 1.45, texture: "fnMassageChair", scale: 1.0 },
      { dx: 3.65, dy: 1.3, texture: "fnAromaTable", scale: 1.0 },
    ],
    plus3: [
      { dx: 1.9, dy: 0.42, texture: "fnPartition", scale: 0.9 },
      { dx: 0.4, dy: 2.2, texture: "fnMassageChair", scale: 1.0 },
      { dx: 3.65, dy: 2.1, texture: "fnWaterCooler", scale: 1.0 },
    ],
  },

  /**
   * 【会議室】3×2マス。研究するコーチが集まる部屋。
   * 奥の壁にレースの作戦を書いたホワイトボード、まん中に会議テーブル（ノートパソコンと資料）、
   * 椅子を向かい合わせに4脚。左にトロフィー棚、右にレース映像を見る大型モニタ。
   * 壁の絵は originY 0.95（壁ぎわの床）、テーブルは 0.625（板のまん中）で置く。
   */
  meeting: {
    base: [
      { dx: 1.5, dy: 0.04, texture: "fnWallBoard", scale: 1.1, layer: 16, originY: 0.95 },
      { dx: 1.1, dy: 0.42, texture: "fnChairFront", scale: 1.0 },
      { dx: 1.9, dy: 0.42, texture: "fnChairFront", scale: 1.0 },
      { dx: 1.5, dy: 0.95, texture: "fnConfTable", scale: 1.0, originY: 0.625 },
      { dx: 1.1, dy: 1.45, texture: "fnChairBack", scale: 1.0 },
      { dx: 1.9, dy: 1.45, texture: "fnChairBack", scale: 1.0 },
      { dx: 0.28, dy: 0.4, texture: "fnTrophyCase", scale: 1.0 },
      { dx: 2.75, dy: 0.35, texture: "fnMonitorStand", scale: 0.95 },
      { dx: 2.8, dy: 1.3, texture: "fnPlant", scale: 0.9 },
    ],
  },
  /**
   * 【コーチ室】3×2マス。コーチの机が2台並ぶ職員室。
   * 奥の壁に練習メニューのコルクボードとホワイトボード、その下に机（ラップタイムの画面・ストップウォッチ）。
   * 左にビート板の棚、右にスチールの書類棚。机は originY 0.72（板のまん中）で置く。
   */
  coachroom: {
    base: [
      { dx: 0.95, dy: 0.04, texture: "fnCorkBoard", scale: 1.1, layer: 16, originY: 0.95 },
      { dx: 2.2, dy: 0.04, texture: "fnWallBoard", scale: 1.0, layer: 16, originY: 0.95 },
      { dx: 0.95, dy: 0.55, texture: "fnCoachDesk", scale: 1.0, originY: 0.72 },
      { dx: 2.2, dy: 0.55, texture: "fnCoachDesk", scale: 1.0, originY: 0.72 },
      { dx: 0.95, dy: 1.05, texture: "fnChairBack", scale: 1.0 },
      { dx: 2.2, dy: 1.05, texture: "fnChairBack", scale: 1.0 },
      { dx: 0.25, dy: 1.2, texture: "fnKickboardRack", scale: 0.95 },
      { dx: 2.85, dy: 1.25, texture: "fnFileCabinet", scale: 1.0 },
    ],
  },
  /**
   * 食堂（3×3）。
   *
   * 学校の食堂の順路をそのまま並べてある：
   *   奥   … メニュー黒板 → **配膳カウンター**（ガラスケース越しに料理）→ 壁の横断幕
   *   中列 … サラダバー／ドリンクコーナー（取りに行く場所）
   *   手前 … 明るい木のテーブルと**青い椅子**（座って食べる場所）
   * 「並んで取って、座って食べる」が形で読めることを優先している。
   */
  cafeteria: {
    base: [
      // 奥＝並んで取るところ（壁のメニュー表 → 配膳ライン → ごはんと汁物）
      // 【描く順は (dx+dy) で決まる】壁の絵を配膳の立ち位置（dx 0.95〜2.1）と同じ帯に置くと、
      // 深度が人より大きくなってコックの体を隠す（→ iso/projection.ts の depthFor）。
      // メニュー表は右端、横断幕は左端に離してある。
      { dx: 2.55, dy: 0.04, texture: "fnMenuWall", scale: 1.05, layer: 16, originY: 0.95 },
      { dx: 0.45, dy: 0.06, texture: "fnWallBanner", scale: 0.9 },
      { dx: 1.25, dy: 0.5, texture: "fnServeLine", scale: 1.0, originY: 0.67 },
      { dx: 2.65, dy: 0.62, texture: "fnRiceSoup", scale: 1.0, originY: 0.72 },
      { dx: 0.28, dy: 1.15, texture: "fnPlant", scale: 0.85 },
      // 手前＝座って食べるところ（長テーブルに向かい合わせ4席）
      { dx: 0.9, dy: 1.0, texture: "fnDinerChairF", scale: 1.0 },
      { dx: 1.9, dy: 1.0, texture: "fnDinerChairF", scale: 1.0 },
      { dx: 1.4, dy: 1.5, texture: "fnDinerLongTable", scale: 1.0, originY: 0.63 },
      { dx: 0.9, dy: 2.0, texture: "fnDinerChairB", scale: 1.0 },
      { dx: 1.9, dy: 2.0, texture: "fnDinerChairB", scale: 1.0 },
      // 端（食べ終わったら返しに行く）
      { dx: 0.3, dy: 2.05, texture: "fnTrayReturn", scale: 1.0 },
      { dx: 2.7, dy: 1.95, texture: "fnBins", scale: 0.85 },
    ],
  },
  /**
   * 【ドクタールーム】2×3マス。
   * 奥の壁にシャーカステン（レントゲン）、その下に医師の机（心電図の画面・聴診器）、右奥に薬品棚。
   * 手前に診察台（背もたれを起こしてある）、左の壁ぎわに身長体重計。
   * 仕切りカーテンは置かない。2×3 と狭く、手前や右の端に置くと外壁の上に描かれ、内側では診察台と重なるため。
   */
  clinic: {
    base: [
      { dx: 1.0, dy: 0.04, texture: "fnXrayBoard", scale: 1.1, layer: 16, originY: 0.95 },
      { dx: 0.75, dy: 0.55, texture: "fnDoctorDesk", scale: 1.0, originY: 0.72 },
      { dx: 0.75, dy: 1.05, texture: "fnChairBack", scale: 1.0 },
      { dx: 1.7, dy: 0.4, texture: "fnMedCabinet", scale: 1.0 },
      { dx: 0.85, dy: 1.75, texture: "fnExamBed", scale: 1.0, originY: 0.67 },
      { dx: 0.22, dy: 1.1, texture: "fnHeightScale", scale: 1.0 },
    ],
  },
  /**
   * 【サウナ】3×3。西の壁ぎわにストーブ、東側に段違いの木のベンチ、手前にもう1台。
   *
   * ストーブは部屋の**左**（西の壁ぎわ）に置く。奥の角に置くと、部屋名の札が
   * ちょうどそこに浮くので、サウナの目印がまるごと隠れてしまう。
   */
  sauna: {
    base: [
      { dx: 0.45, dy: 1.5, texture: "fnSaunaStove", scale: 0.85 },
      // ベンチは**人が2人並んで腰かける**ので、人の幅に合わせて大きく描く
      //（小さいままだと、座っている人の脇からベンチがはみ出して見えない）
      { dx: 2.0, dy: 0.6, texture: "fnSaunaBench", scale: 1.15 },
      { dx: 2.0, dy: 1.75, texture: "fnSaunaBench", scale: 1.15 },
      { dx: 1.15, dy: 2.55, texture: "fnSaunaBench", scale: 1.15 },
      { dx: 2.7, dy: 2.6, texture: "fnSaunaBucket", scale: 0.9 },
    ],
  },

  /**
   * 【風呂】5×4。いちばん奥の行が洗い場（カランが並ぶ）で、そこから手前がまるごと湯船。
   * 湯船そのものは床（bathWater）で描くので、ここに置くのは洗い場まわりの備品だけ。
   */
  bath: {
    base: [
      { dx: 0.85, dy: 0.25, texture: "fnWashSpot", scale: 0.8 },
      { dx: 1.95, dy: 0.25, texture: "fnWashSpot", scale: 0.8 },
      { dx: 3.05, dy: 0.25, texture: "fnWashSpot", scale: 0.8 },
      { dx: 4.15, dy: 0.25, texture: "fnWashSpot", scale: 0.8 },
      { dx: 0.2, dy: 1.9, texture: "fnBathSpout", scale: 0.85, layer: 21 },
      { dx: 4.6, dy: 0.9, texture: "fnTowelShelf", scale: 0.9 },
    ],
  },

  /**
   * 【外気浴】4×3。ウッドデッキにリクライニングチェアを4台。
   * 屋外の癒しの空間に見えるよう、植栽で縁取って給水器を置く。
   */
  openair: {
    base: [
      // 寝椅子は**人が寝そべる**ので、背丈に見合う大きさで描く
      //（小さいままだと、寝ている人の下に椅子が隠れて「地面に寝ている」に見える）
      { dx: 0.9, dy: 1.05, texture: "fnLounger", scale: 1.5 },
      { dx: 2.7, dy: 1.05, texture: "fnLounger", scale: 1.5 },
      { dx: 0.9, dy: 2.25, texture: "fnLounger", scale: 1.5 },
      { dx: 2.7, dy: 2.25, texture: "fnLounger", scale: 1.5 },
      // 植栽は部屋の左右へ。奥の角に置くと部屋名の札に隠れる
      { dx: 0.3, dy: 1.25, texture: "fnPlanter", scale: 0.8 },
      { dx: 3.6, dy: 1.05, texture: "fnPlanter", scale: 0.8 },
      { dx: 2.0, dy: 0.3, texture: "fnWaterCooler", scale: 1.0 },
      // dy は「部屋の高さ - 0.2」まで（fittingsOf がはみ出す什器を落とす）
      { dx: 1.75, dy: 2.65, texture: "fnPlant", scale: 0.9 },
      { dx: 3.5, dy: 2.4, texture: "fnPlant", scale: 0.8 },
    ],
  },
  /**
   * 売店（2×2）。
   *
   * プールサイドのコンビニ売店のつもりで並べてある。マスが少ないので、
   * **青い看板・お菓子の棚・アイスの冷凍ケース・ドリンククーラー・レジカウンター**
   * の5つに絞り、色数の多い商品で「売っている場所」だと分かるようにした。
   * 看板はいちばん奥（dy 小）に置いて、他の什器の背後に立って見えるようにしている。
   */
  shop: {
    base: [
      { dx: 1.0, dy: 0.12, texture: "fnShopSign", scale: 1.0 },
      { dx: 0.45, dy: 0.35, texture: "fnSnackShelf", scale: 0.95 },
      { dx: 1.55, dy: 0.4, texture: "fnDrinkFridge", scale: 0.9 },
      { dx: 0.5, dy: 1.35, texture: "fnShopCounter", scale: 1.0 },
      { dx: 1.55, dy: 1.45, texture: "fnIceChest", scale: 0.9 },
    ],
  },
  // ---- 賑わいスペース（一般客向け）
  /**
   * カフェ（4×3）。
   *
   * 【奥はカウンター、手前は客席】と割り切って並べてある。
   *   奥   … メニュー黒板・バックシェルフ・カウンター（エスプレッソマシン）・
   *          ショーケース・ドリンク冷蔵ケース
   *   手前 … 木のテーブルと緑の椅子、観葉植物、A型看板、パラソル席
   * 「注文する場所」と「座って過ごす場所」が形で分かることを優先している。
   * 奥のものは dy を小さく（＝先に描かれて後ろに回る）してあるので、
   * カウンターの背後に棚が立っているように見える。
   */
  cafe: {
    base: [
      // 奥＝注文するところ（黒板 → カウンター（エスプレッソマシン・ケーキドーム）→ 棚と冷蔵ケース）
      { dx: 0.3, dy: 0.25, texture: "fnMenuBoard", scale: 1.0 },
      { dx: 3.05, dy: 0.2, texture: "fnCafeBackShelf", scale: 1.0 },
      { dx: 3.7, dy: 0.85, texture: "fnDrinkFridge", scale: 1.0 },
      { dx: 1.5, dy: 0.75, texture: "fnCafeBar", scale: 1.0, originY: 0.7 },
      // 手前＝座って過ごすところ（丸テーブル2台に椅子を向かい合わせ）
      { dx: 0.28, dy: 0.95, texture: "fnCafeSofa", scale: 1.0 },
      { dx: 1.0, dy: 1.15, texture: "fnCafeChairF", scale: 1.0 },
      { dx: 2.7, dy: 1.15, texture: "fnCafeChairF", scale: 1.0 },
      { dx: 1.0, dy: 1.6, texture: "fnCafeRound", scale: 1.0 },
      { dx: 2.7, dy: 1.6, texture: "fnCafeRound", scale: 1.0 },
      { dx: 1.0, dy: 2.05, texture: "fnCafeChairB", scale: 1.0 },
      { dx: 2.7, dy: 2.05, texture: "fnCafeChairB", scale: 1.0 },
      { dx: 3.6, dy: 1.7, texture: "fnPlanter", scale: 0.85 },
      { dx: 0.3, dy: 2.1, texture: "fnCafeSign", scale: 0.95 },
      { dx: 3.6, dy: 2.4, texture: "fnPlant", scale: 0.95 },
    ],
  },
  /**
   * 休憩ラウンジ（4×2）。
   *
   *   奥   … 看板・自販機2台・雑誌ラック（立ち寄る場所）
   *   手前 … ラグを敷いたソファ席（ローテーブルを挟んで1人掛けが向かい合う）と本棚
   * 部屋が浅いので「奥＝立ち寄る／手前＝座る」と割り切ってある。
   * ラグは床に敷くものなので originY 0.5（絵の中心をマスの中心に置く）＋
   * 低い layer にして、什器より下に来るようにしている。
   */
  lounge: {
    base: [
      // 奥の壁ぎわ
      { dx: 0.45, dy: 0.12, texture: "fnLoungeSign", scale: 0.95 },
      { dx: 1.4, dy: 0.2, texture: "fnVendingTall", scale: 0.95 },
      { dx: 2.1, dy: 0.2, texture: "fnVendingTall", scale: 0.95 },
      { dx: 2.95, dy: 0.2, texture: "fnMagRack", scale: 0.95 },
      { dx: 3.65, dy: 0.3, texture: "fnPlant", scale: 0.9 },
      // くつろぎの島
      { dx: 1.45, dy: 1.25, texture: "fnRug", scale: 1.25, originY: 0.5, layer: 18 },
      { dx: 1.45, dy: 0.95, texture: "fnSofa", scale: 1.05, layer: 24 },
      { dx: 1.45, dy: 1.35, texture: "fnCoffeeTable", scale: 1.0 },
      { dx: 0.6, dy: 1.5, texture: "fnArmchair", scale: 0.95 },
      { dx: 2.3, dy: 1.5, texture: "fnArmchairWarm", scale: 0.95 },
      // 右手のコーナー
      { dx: 3.1, dy: 1.3, texture: "fnLowShelf", scale: 0.95 },
      { dx: 3.7, dy: 1.6, texture: "fnWaterCooler", scale: 0.9 },
    ],
  },
  /**
   * キッズコーナー（3×3）。
   *
   *   奥   … 看板・小さな黒板・おもちゃ棚（見て回るところ）
   *   右奥 … **ボールプールとすべり台**（この部屋の主役。遠目でも子どもの遊び場と分かる）
   *   中央 … プレイマットを敷いて、やわらかブロックとキッズソファ
   *   手前 … お絵かきテーブルとテレビ
   * 色はパステル（黄・水色・桃・黄緑）でそろえ、木と青の他の部屋と見分けられるようにした。
   * マットは床に敷くので originY 0.5＋低い layer（什器の下に来る）。
   */
  kids: {
    base: [
      // 奥の壁ぎわ
      { dx: 0.4, dy: 0.12, texture: "fnKidsSign", scale: 0.95 },
      { dx: 1.45, dy: 0.15, texture: "fnKidsBoard", scale: 0.9 },
      { dx: 0.7, dy: 0.75, texture: "fnToyShelf", scale: 0.95 },
      // 右奥：ボールプールとすべり台
      { dx: 2.45, dy: 0.55, texture: "fnBallPit", scale: 0.95 },
      { dx: 2.6, dy: 1.35, texture: "fnSlide", scale: 0.95, layer: 24 },
      // 中央：マットの上で遊ぶ
      { dx: 1.3, dy: 1.6, texture: "fnPlayMat", scale: 1.2, originY: 0.5, layer: 18 },
      { dx: 0.65, dy: 1.75, texture: "fnFoamSofa", scale: 0.9 },
      { dx: 1.55, dy: 1.75, texture: "fnFoamBlocks", scale: 0.9 },
      // 手前：お絵かきとテレビ
      { dx: 0.75, dy: 2.6, texture: "fnCraftTable", scale: 0.95 },
      { dx: 2.1, dy: 2.55, texture: "fnKidsTV", scale: 0.9 },
      { dx: 2.75, dy: 2.7, texture: "fnPlant", scale: 0.85 },
    ],
  },
  // 自販機コーナー：2×1マス。隙間に置ける小さな賑わい。白と赤の自販機を並べ、脇にごみ箱
  vending: {
    base: [
      { dx: 0.5, dy: 0.35, texture: "fnVendingTall", scale: 1.0 },
      { dx: 1.2, dy: 0.35, texture: "fnVendingRed", scale: 1.0 },
      { dx: 1.78, dy: 0.6, texture: "fnBins", scale: 0.8 },
    ],
  },
  // 寮：ベッドを DORM.capacityPerRoom（4）台ぶん並べる。
  // ベッドの数＝その部屋に入れる人数、が目で見て分かるようにしてある。
  // ベッドは床の向きにそろえた板（originY 0.667＝板のまん中）で、布団の色を1台ずつ変えて「4人部屋」に見せる。
  // ベッドの間に小棚、右にロッカーと勉強机。
  /**
   * 【アスリート寮】◆100万の大型施設（12×7マス）。
   *
   * 4人部屋にベッドを4つ並べた絵から、**選手村のポッド寮**へ描き替えた（2026-09-18）。
   *   奥の列  … スリープポッド（2段カプセル）を6基＝12人ぶん
   *   中ほど  … 共用ラウンジ（大型ディスプレイ・ソファ・ローテーブル）
   *   右手前  … スタディブース2つとランドリー（寝るだけの場所に見せない）
   *   左手前  … ミニキッチンとプランター
   *
   * 手前の列（dy 6.3 より先）は外壁ぞいに建てると隠れるので、背の高い物か、
   * 隠れても困らない物だけを置く（→ 什器と外壁の隠れ）。
   */
  dorm: {
    base: [
      // 奥：スリープポッド6基（1基＝2人ぶん。DORM.capacityPerRoom = 12 と合わせてある）
      { dx: 0.9, dy: 1.15, texture: "fnSleepPod", scale: 1.0, layer: 18 },
      { dx: 2.7, dy: 1.15, texture: "fnSleepPod", scale: 1.0, layer: 18 },
      { dx: 4.5, dy: 1.15, texture: "fnSleepPod", scale: 1.0, layer: 18 },
      { dx: 7.3, dy: 1.15, texture: "fnSleepPod", scale: 1.0, layer: 18 },
      { dx: 9.1, dy: 1.15, texture: "fnSleepPod", scale: 1.0, layer: 18 },
      { dx: 10.9, dy: 1.15, texture: "fnSleepPod", scale: 1.0, layer: 18 },
      // 奥の壁：ラウンジの大型ディスプレイ
      { dx: 5.9, dy: 0.04, texture: "fnDormScreen", scale: 1.0, layer: 16, originY: 0.84 },
      // 中ほど：共用ラウンジ
      { dx: 5.9, dy: 3.1, texture: "fnDormSofa", scale: 1.0, layer: 21 },
      { dx: 5.9, dy: 4.2, texture: "fnDormTable", scale: 1.0, layer: 23 },
      { dx: 3.9, dy: 4.6, texture: "fnArmchair", scale: 1.0, layer: 24 },
      { dx: 7.9, dy: 4.6, texture: "fnArmchairWarm", scale: 1.0, layer: 24 },
      { dx: 3.6, dy: 3.5, texture: "fnDormPlanterBox", scale: 1.0, layer: 21 },
      { dx: 8.4, dy: 3.5, texture: "fnDormPlanterBox", scale: 1.0, layer: 21 },
      // 右手前：勉強と洗濯
      { dx: 10.2, dy: 3.4, texture: "fnStudyBooth", scale: 1.0, layer: 21 },
      { dx: 10.4, dy: 5.4, texture: "fnStudyBooth", scale: 1.0, layer: 24 },
      { dx: 8.4, dy: 5.5, texture: "fnLaundry", scale: 1.0, layer: 24 },
      // 左手前：ミニキッチン
      { dx: 1.7, dy: 5.3, texture: "fnDormKitchen", scale: 1.0, layer: 24 },
      { dx: 4.0, dy: 5.5, texture: "fnPlant", scale: 1.0, layer: 24 },
      { dx: 0.4, dy: 3.4, texture: "fnLocker", scale: 0.8, layer: 21 },
    ],
  },

  /**
   * 【医科学センター】◆100万の大型施設（10×7マス）。
   *
   * 真ん中に**流水プール**（その場で泳いでフォームを撮る装置）を据え、
   * それを囲むように測定機器を置く。奥の壁は解析画面の壁。
   * 「泳ぎを測って、直す棟」だと、置いてある物の並びだけで分かるようにしてある。
   *
   * 手前の列（dy 6.3 より先）は外壁ぞいに建てると隠れるので、
   * 背の高い物と、隠れても困らない物しか置かない。
   */
  science: {
    /**
     * 【2026-09-26 に並べ直した】広い部屋に小さな機器がぽつぽつ置いてあるだけで、
     * 「何をする棟なのか」「人が使っているのか」が伝わらなかった。
     * 部屋を4つの持ち場に分けて、それぞれを機器で埋める：
     *   左奥   … 測定（体組成スキャナ・トレッドミル・解析サーバ）
     *   中央   … 泳ぎの撮影（大きくした流水プール＋フォースプレートのスタート台＋カメラ4台）
     *   右     … 分析（分析台2列・遠心分離機・サーバ）
     *   手前   … ケア（治療ベッド2台と仕切り・アイスバス）と待合のソファ
     * 選手が測定に来て立つ位置は FacilityScene の SCIENCE_SPOTS（ここの機器の手前）。
     */
    base: [
      // 奥の壁：解析モニタの壁を3面ならべて「管制室」にする（壁の傾きに倒す／originY 0.82）
      { dx: 1.6, dy: 0.04, texture: "fnMonitorWall", scale: 1.0, layer: 16, originY: 0.82 },
      { dx: 4.6, dy: 0.04, texture: "fnMonitorWall", scale: 1.0, layer: 16, originY: 0.82 },
      { dx: 7.6, dy: 0.04, texture: "fnMonitorWall", scale: 1.0, layer: 16, originY: 0.82 },
      // 左奥：測定
      { dx: 1.2, dy: 1.5, texture: "fnBodyScanner", scale: 1.05, layer: 20 },
      { dx: 0.5, dy: 0.7, texture: "fnServerRack", scale: 1.0, layer: 18 },
      { dx: 1.4, dy: 3.3, texture: "gymTread", scale: 1.0, layer: 22 },
      // 中央：泳ぎの撮影（主役。いちばん大きく置く）
      { dx: 4.9, dy: 3.1, texture: "fnFlumeTank", scale: 1.2, layer: 22 },
      { dx: 2.55, dy: 2.2, texture: "fnForcePlate", scale: 1.0, layer: 21 },
      { dx: 3.2, dy: 1.6, texture: "fnMotionCam", scale: 0.95, layer: 20 },
      { dx: 6.8, dy: 1.6, texture: "fnMotionCam", scale: 0.95, layer: 20 },
      { dx: 3.2, dy: 4.6, texture: "fnMotionCam", scale: 1.0, layer: 24 },
      { dx: 6.8, dy: 4.6, texture: "fnMotionCam", scale: 1.0, layer: 24 },
      // 右：分析
      { dx: 8.4, dy: 1.5, texture: "fnLabBench", scale: 1.0, layer: 20 },
      { dx: 8.4, dy: 3.2, texture: "fnLabBench", scale: 1.0, layer: 22 },
      { dx: 9.5, dy: 0.7, texture: "fnServerRack", scale: 1.0, layer: 18 },
      { dx: 9.5, dy: 2.4, texture: "fnCentrifuge", scale: 1.0, layer: 21 },
      // 手前：ケア（治療ベッドを仕切りで分ける）とアイスバス、待合のソファ
      { dx: 1.1, dy: 5.2, texture: "fnTreatBed", scale: 1.0, layer: 25 },
      { dx: 1.9, dy: 4.75, texture: "fnPartition", scale: 0.9, layer: 24 },
      { dx: 2.7, dy: 5.2, texture: "fnTreatBed", scale: 1.0, layer: 25 },
      { dx: 8.3, dy: 5.1, texture: "fnIceBath", scale: 1.0, layer: 25 },
      { dx: 9.4, dy: 4.3, texture: "fnWaterCooler", scale: 0.95, layer: 23 },
      { dx: 5.0, dy: 5.7, texture: "fnDormSofa", scale: 0.9, layer: 26 },
      { dx: 0.4, dy: 6.2, texture: "fnPlant", scale: 0.95, layer: 26 },
      { dx: 6.6, dy: 6.2, texture: "fnPlant", scale: 0.9, layer: 26 },
    ],
  },

  /**
   * 【高地トレーニング棟】◆100万の大型施設（10×7マス）。
   *
   * 奥に**低酸素ポッド**を3基並べ、手前を低酸素室のトレーニング場にする。
   * 右手前は酸素濃度の制御盤とボンベ（＝この部屋が「空気を作っている」ことの説明）。
   * 床が館内でいちばん暗い（ROOM_STYLE.altitudeLab）ので、機器のシアンがよく光る。
   */
  altitudeLab: {
    base: [
      // 奥：低酸素ポッドを4基ならべる（この棟の顔）
      { dx: 1.3, dy: 1.15, texture: "fnHypoxicPod", scale: 1.0, layer: 18 },
      { dx: 3.7, dy: 1.15, texture: "fnHypoxicPod", scale: 1.0, layer: 18 },
      { dx: 6.1, dy: 1.15, texture: "fnHypoxicPod", scale: 1.0, layer: 18 },
      { dx: 8.5, dy: 1.15, texture: "fnHypoxicPod", scale: 1.0, layer: 18 },
      // 中ほど：低酸素室のトレーニング場（マスクのホースが天井から下りている）
      { dx: 1.8, dy: 3.4, texture: "fnAltTread", scale: 1.0, layer: 21 },
      { dx: 4.2, dy: 3.4, texture: "fnAltTread", scale: 1.0, layer: 21 },
      { dx: 6.6, dy: 3.4, texture: "fnAltTread", scale: 1.0, layer: 21 },
      { dx: 8.8, dy: 3.5, texture: "gymBike", scale: 0.95, layer: 21 },
      // 手前：空気を作る側の設備と、マスク掛け
      { dx: 9.3, dy: 5.2, texture: "fnO2Console", scale: 1.0, layer: 24 },
      { dx: 7.4, dy: 5.4, texture: "fnGasTanks", scale: 1.0, layer: 25 },
      { dx: 1.2, dy: 5.3, texture: "fnMaskRack", scale: 1.0, layer: 24 },
      { dx: 3.4, dy: 5.4, texture: "inBench", scale: 1.0, layer: 25 },
      { dx: 5.3, dy: 5.3, texture: "fnWaterCooler", scale: 0.95, layer: 24 },
      { dx: 0.4, dy: 0.5, texture: "fnPlant", scale: 0.9, layer: 18 },
    ],
  },
};

/** その部屋のグレードで置かれる器具の一覧。 */
export function gearSpecsFor(kind: RoomKind, grade: number): FittingSpec[] {
  const gear = ROOM_FITTINGS[kind];
  if (!gear) return [];
  const out = [...gear.base];
  if (grade >= 2 && gear.plus2) out.push(...gear.plus2);
  if (grade >= 3 && gear.plus3) out.push(...gear.plus3);
  return out;
}

/** プールの備品（飛び込み台・監視台・浮き具ラック）。 */
function poolFittingsOf(pool: Equipment): Fitting[] {
  const out: Fitting[] = [];
  const flipX = rotOf(pool) === 1;
  for (const c of startBlockCellsOf(pool)) {
    out.push({ cell: c, texture: "fnStartBlock", scale: 1.0, layer: 22, flipX });
  }
  // 位置は回す前の向き（横に長く、最下行がプールサイド）で書いて roomPoint で置く
  const f = footprintOf(pool.kind);
  const deck = f.h - 1;
  const at = (dx: number, dy: number): Cell => roomPoint(pool, dx, dy);
  out.push({ cell: at(f.w - 1.2, deck), texture: "fnLifeguard", scale: 1.15, layer: 22, flipX });
  out.push({ cell: at(1.2, deck + 0.1), texture: "fnFloatRack", scale: 1.0, layer: 22, flipX });
  // プールサイドの備品（**屋内プールなのでパラソルは置かない**）。
  // 置くのは屋内で自然なものだけ：ベンチ・観葉植物・コースの案内表示。
  const benches = Math.min(3, Math.max(1, Math.floor(f.w / 3)));
  for (let i = 0; i < benches; i++) {
    out.push({
      cell: at(2.6 + i * 2.4, deck + 0.55),
      texture: "inBench",
      scale: 1.0,
      layer: 22,
      flipX,
    });
  }
  out.push({ cell: at(0.3, deck + 0.6), texture: "odPot", scale: 1.0, layer: 22, flipX });
  out.push({ cell: at(f.w - 0.4, deck + 0.6), texture: "inSign", scale: 1.0, layer: 22, flipX });

  // ---- 観客席を持つプール（大型プール）だけの設え ----
  const stand = standRowsOf(pool.kind);
  if (stand > 0) {
    // 座席のひな壇。奥の列ほど1段ずつ高いので、行ごとに少しずつ奥へ詰めて並べる。
    // 色は行ごとに青／赤を入れ替える（実際の競技場も色を混ぜて市松にしてある）。
    // 座席のひな壇。奥の列ほど1段高い絵（fnStandSeats0〜3）を使うので、
    // 4列並べると段がせり上がって見える。絵の接地点は下から 64/96。
    for (let row = 0; row < stand; row++) {
      for (let col = 0; col < f.w; col++) {
        out.push({
          cell: at(col, row + 0.5),
          texture: `fnStandSeats${Math.min(3, stand - 1 - row)}`,
          scale: 1.0,
          layer: 14 + row, // 奥の列を先に描く（手前の列が重なって段に見える）
          originY: 64 / 96,
          flipX,
        });
      }
    }
    // 電光掲示板。**いちばん奥の壁ぎわ**に、壁の面に沿わせて据え付ける（2026-09-26）。
    // 以前は観客席の中に1段入れて立てていたので、足元が座席に隠れて観客席へ倒れ込んで見えた。
    // 絵の接地点は壁ぎわの床の線の真ん中（→ gfx/bigFacility の fnScoreboard, originY 238/300）。
    /**
     * 【幅の広い絵は切り分ける】掲示板は横に4マスぶん広いので、1枚のまま置くと
     * 真ん中のマスの重なり順になり、左手前の座席の上に掲示板が描かれてしまう
     *（＝観客席に倒れ込んで見える）。縦に6つに切り、切れ端ごとに**その位置の壁ぎわのマス**
     * （半マス奥）で重なり順を決める。手前の座席はいつも掲示板より手前に描かれる。
     */
    const SB_W = 240;
    const SB_SCALE = 0.95;
    const SB_SLICES = 6;
    const sbCenter = f.w / 2 - 0.5;
    for (let k = 0; k < SB_SLICES; k++) {
      const x = (k * SB_W) / SB_SLICES;
      const w = SB_W / SB_SLICES;
      // 切れ端の真ん中が、壁ぞいに何マスずれているか（絵の 60px ＝ 壁ぞいに1マス）
      const along = ((x + w / 2 - SB_W / 2) * SB_SCALE) / 60;
      out.push({
        cell: at(sbCenter, 0.02),
        texture: "fnScoreboard",
        scale: SB_SCALE,
        layer: 12,
        originY: 238 / 300,
        flipX,
        // 1px 重ねて切る（ぴったりだと切れ目に細い隙間が見える）
        crop: { x: Math.max(0, x - 0.5), w: w + 1 },
        depthCell: at(sbCenter + along - 0.6, 0.02),
      });
    }
    // 観客席と水面のあいだのガラス手すり（レーンと平行に1列）
    for (let col = 0; col < f.w; col++) {
      out.push({ cell: at(col, stand - 0.05), texture: "fnGlassRail", scale: 1.0, layer: 19, originY: 64 / 96, flipX });
    }
    // バックストロークフラッグ（両端から5m）。レーンを**横切る**ので、
    // 水面の行ぶんを縦に並べて1本の線にする。
    const waterTop = stand;
    const waterBottom = f.h - 1;
    for (const dx of [1.6, f.w - 2.6]) {
      for (let row = waterTop; row < waterBottom; row++) {
        out.push({ cell: at(dx, row), texture: "fnPoolFlags", scale: 1.0, layer: 20, originY: 32 / 84, flipX });
      }
    }
    // プールサイドの表彰台と中継カメラ（「大会が開ける場所」だと分かる小物）
    out.push({ cell: at(2.0, deck + 0.55), texture: "fnPodium", scale: 1.0, layer: 23, flipX });
    out.push({ cell: at(f.w - 3.2, deck + 0.5), texture: "fnBroadcastCam", scale: 1.0, layer: 23, flipX });
  }
  return out;
}

// ------------------------------------------------------------------ 屋外の飾り（芝生の上）

/**
 * 敷地の外（建物の外＝駐車場・歩道・車道）に置く小物。
 *
 * ここが受け持つのは**動かない**飾り ＝ 街路樹・植え込み・街灯。
 * どれも**車道ぞいの歩道の上だけ**に置く。参考画像でも、建物のまわりは
 * この並木で縁取られていて、そのおかげで舗装が空き地に見えない。
 *
 * **建物の中（敷地の中）には1本も置かない。** 屋内スイミングクラブなので、
 * 施設内に木やパラソルがあると屋外の広場に見えてしまう。
 *
 * **車もここでは置かない。** 建物の中で人が泳いでいるのに外の車だけ
 * 止まったままだと、外の時間が止まって見えてしまうため、
 * 駐車場の車も通りの車もすべて iso/traffic.ts が動かしている。
 */
export interface ScatterItem {
  gx: number;
  gy: number;
  texture: string;
  /** 中心からのずらし（同じ間隔で並ばないように）。 */
  ox: number;
  oy: number;
}

/** 車の絵（色ちがい）。置き場所と動きは iso/traffic.ts が持つ。 */
export const CAR_TEXTURES = ["odCar", "odCar2", "odCar3", "odCar4"] as const;

/**
 * 建物の外に置く車・街灯の位置。
 *
 * 【広さの代償を作らない】マップは最大 37×37 まであるが、飾るのは
 * **買ってある敷地のすぐ外側の帯（band マス）だけ**で、しかも max 個で頭打ち。
 * 遠くの舗装は無地のまま（どうせ画面に入らない）なので、
 * 敷地を広げても「毎フレーム並べ替える表示物」はほとんど増えない。
 *
 * 置き場所はマスの番号から決める（乱数を使わない）ので、建て直しても同じ景色になる。
 */
export function outdoorScatter(map: ClubMap, max: number, band: number): ScatterItem[] {
  const land = landBounds(map);
  const out: ScatterItem[] = [];
  for (let gy = land.y0 - band; gy <= land.y1 + band && out.length < max; gy++) {
    for (let gx = land.x0 - band; gx <= land.x1 + band && out.length < max; gx++) {
      if (gx < 0 || gy < 0 || gx >= MAP.cols || gy >= MAP.rows) continue;
      // 敷地の中と、建物ぎわの歩道は飾らない（建てる場所と歩く場所を塞がない）
      if (isBuildable(map, gx, gy) || isPerimeter(map, gx, gy)) continue;
      if (outsideFloorKind(map, gx, gy) !== "sidewalk") continue;
      // 入口の前（車寄せ）は空けておく。ここを塞ぐと玄関が見えなくなる
      if (approachSet(map).has(`${gx},${gy}`)) continue;
      // 車道ぎわの植樹帯だけを飾る（建物ぎわの歩道は、人が歩くので空けておく）
      if (outsideRing(map, gx, gy) !== OUTSIDE_BANDS.walk) continue;
      // 並びはマスの番号で決める（乱数を使わないので、建て直しても同じ景色になる）
      const n = gx + gy;
      const texture = n % 9 === 0 ? "odLamp" : n % 4 === 1 ? "odTree" : n % 6 === 3 ? "odHedge" : null;
      if (!texture) continue;
      out.push({ gx, gy, texture, ox: 0, oy: 0 });
    }
  }
  return out;
}

/** マップ上の全ての什器（描画のたびに作り直す）。 */
export function fittingsOf(map: ClubMap): Fitting[] {
  const out: Fitting[] = [];
  for (const room of placedRooms(map)) {
    if (isPool(room.kind)) {
      out.push(...poolFittingsOf(room));
      continue;
    }
    const specs = gearSpecsFor(room.kind, gradeOf(room));
    const f = footprintOf(room.kind); // 回す前の向き（什器の相対位置と同じ向き）
    const flipX = rotOf(room) === 1;
    for (const s of specs) {
      // 部屋からはみ出す什器は置かない（config で部屋を小さくしても壊れないように）
      if (s.dx > f.w - 0.2 || s.dy > f.h - 0.2) continue;
      out.push({
        cell: roomPoint(room, s.dx, s.dy),
        texture: s.texture,
        scale: s.scale ?? 1,
        layer: s.layer ?? 22,
        originY: s.originY ?? 1,
        flipX,
      });
    }
  }
  return out;
}

/** 部屋名ラベルを出す位置（部屋の中央）。 */
export function roomLabelsOf(map: ClubMap): { cell: Cell; text: string }[] {
  return placedRooms(map).map((room) => ({ cell: centerOf(room), text: equipmentDef(room.kind).label }));
}

// ------------------------------------------------------------------ 器具の置き場所

export interface PlacementZone {
  label: string;
  /** この部屋（Equipment.id）。外構は -1。 */
  roomId: number;
  cells: Cell[];
}

export type PlacementUse = "item" | "gym" | "recover";

const USE_ROOM: Record<PlacementUse, RoomKind | null> = {
  item: "studio",
  gym: "gym",
  recover: "recovery",
};

/**
 * その用途の器具を置ける場所。
 * 部屋を建てるたびにゾーンが増え、部屋を動かせば置き場所もついてくる。
 */
export function placementZones(map: ClubMap, use: PlacementUse): PlacementZone[] {
  const kind = USE_ROOM[use];
  if (!kind) return [];
  const out: PlacementZone[] = [];
  placedRooms(map)
    .filter((e) => e.kind === kind)
    .forEach((room, i) => {
      // 【ドラッグ配置】置ける「マス」は部屋の**全マス**（壁ぎわに寄せて置ける）。
      // **置ける「数」の上限は別**（GameState.roomCapacity ＝ 部屋数 × slots）なので、
      // ここを広げても持てる道具の数は増えない。増えるのは並べ方の自由度だけ。
      // 人が立つ位置は壁ぎわを避ける（→ standCellsOf は innerCellsOf のまま）。
      out.push({ label: `${equipmentDef(kind).label}${i + 1}`, roomId: room.id, cells: cellsOf(room) });
    });
  return out;
}

export function spotCount(zones: readonly PlacementZone[]): number {
  return zones.reduce((n, z) => n + z.cells.length, 0);
}

export function spotCell(zones: readonly PlacementZone[], spot: number): Cell {
  let i = Math.max(0, Math.floor(spot));
  for (const z of zones) {
    if (i < z.cells.length) return z.cells[i];
    i -= z.cells.length;
  }
  const last = zones[zones.length - 1];
  return last?.cells[last.cells.length - 1] ?? { gx: 2, gy: 2 };
}

export function spotLabel(zones: readonly PlacementZone[], spot: number): string {
  let i = Math.max(0, Math.floor(spot));
  for (const z of zones) {
    if (i < z.cells.length) return `${z.label} ${i + 1}`;
    i -= z.cells.length;
  }
  return "倉庫";
}

/** 器具の前に立つ位置（器具の手前・少し下）。 */
export function standAt(spot: Cell, seat: number, wide: boolean): Cell {
  const spread = wide ? 0.5 : 0.35;
  return { gx: spot.gx + (seat - 0.5) * spread, gy: spot.gy + 0.55 };
}

// ------------------------------------------------------------------ 歩く道順

export interface VisitOptions {
  /**
   * 目的地に着いたら水着に着替えるか（プール・温浴施設）。
   *
   * **更衣室という部屋は廃止した。** 来た人はそのままプールへ向かい、
   * 飛び込み台／プールサイドに着いた瞬間に水着になる（→ withSuitAtGoal）。
   */
  suit?: boolean;
}

/**
 * その部屋に入るときに使う出入口。
 *
 * **プールはプールサイド側から入る。** プールの出入口は四方の道マスすべてが候補なので、
 * 奥側の道から入ると、水の上を斜めに突っ切って歩くことになる
 *（「プールの中に入っていく」ように見える）。プールサイド側の出入口が無いときだけ、
 * 今までどおり全部の出入口を候補にする（そうしないと入れない部屋ができてしまう）。
 */
function entryCellsFor(map: ClubMap, room: Equipment): Cell[] | undefined {
  if (room.gx == null || room.gy == null) return undefined;
  const dry = dryLocalRowOf(room);
  if (dry == null) return undefined;
  // プールは陸（プールサイド）が最下行、風呂は陸（洗い場）が最奥行（どちらも回す前の向き）。
  // 水のある側の出入口を候補から外す。回した部屋でも比べるのは回す前の向きの行。
  const doors = doorCellsOf(map, room).filter((c) => {
    const dy = roomLocal(room, c.gx, c.gy).dy;
    return isPool(room.kind) ? dy >= dry : dy <= dry;
  });
  return doors.length > 0 ? doors : undefined;
}

/**
 * 【水のある部屋の「陸」の行】
 *   プール … プールサイド（最下行。飛び込み台とコーチが立つところ）
 *   風呂   … 洗い場（最奥行。カランが並ぶタイル床）
 * 水の無い部屋は null。
 *
 * 出入口をこちら側に限り、席・レーンへ入る前にここをひと足はさむことで、
 * 「入口を開けたらいきなり湯船／水面に居る」という見え方を防ぐ。
 */
function dryLocalRowOf(room: Equipment): number | null {
  if (isPool(room.kind)) return footprintOf(room.kind).h - 1;
  if (room.kind === "bath") return 0; // 洗い場は最奥の行
  return null;
}

/**
 * その位置を「陸」の行へ寄せた位置（水の無い部屋・未配置は null）。
 * 回す前の向きで行だけを陸に合わせるので、回した部屋では列が合う。
 */
export function ontoDry(room: Equipment, c: Cell): Cell | null {
  if (room.gx == null || room.gy == null) return null;
  const dry = dryLocalRowOf(room);
  if (dry == null) return null;
  return roomPoint(room, roomLocal(room, c.gx, c.gy).dx, dry);
}

/**
 * 部屋に入ってから席（湯船・レーン）へ着くまでの道順。
 *
 * **いったん陸へ上がってから水に入る。** 洗い場・プールサイドを1歩はさむだけで、
 * 「体を流してから湯に浸かる」「プールサイドを歩いて入水する」動きになる。
 * 水の無い部屋（サウナ・外気浴・筋トレなど）は席へ直行する。
 */
export function approachInside(room: Equipment, seat: Cell): Waypoint[] {
  const dry = ontoDry(room, seat);
  if (dry == null) return [{ ...seat }];
  return [dry, { ...seat }];
}

/**
 * 敷地の外 → 入口 → 目的の部屋 の道順。
 *
 * **更衣室は廃止したので、寄り道は無い。** 入口から目的の部屋へまっすぐ向かう。
 * 歩いて行けない目的地には行けないので null を返す（＝その部屋は使えない）。
 */
export function visitRoute(map: ClubMap, target: Equipment, opts: VisitOptions = {}): Waypoint[] | null {
  const gate = nearestEntrance(map, target);
  if (!gate) return null;
  // routeFromEntrance は「敷地の外 → 入口の中心 → 道 → 部屋の中心」まで返す
  const road = routeFromEntrance(map, target, gate, entryCellsFor(map, target));
  if (!road) return null;
  return withSuitAtGoal(road.map((c) => ({ ...c })), opts.suit === true);
}

/**
 * 【着替えるのは目的地に着いてから】
 *
 * **水着に替わるのは目的地に着いた瞬間**にする。
 * 水着の絵は正面の立ち姿1枚しか無い（歩くコマも背面も無い）ので、
 * 途中で着替えさせると、そこからプールまでの長い距離を
 * 「正面を向いた棒立ちのまま滑って移動する・奥へ進んでも顔が見える」ことになる。
 * 私服の絵には歩くコマと背面があるので、**歩いている間はずっと私服**にしておく。
 */
function withSuitAtGoal(route: Waypoint[], suit: boolean): Waypoint[] {
  if (!suit || route.length === 0) return route;
  route[route.length - 1].change = "suit";
  return route;
}

/**
 * 目的の部屋から敷地の外まで帰る道順。
 *
 * **かならず敷地の外で終わる道順を返す**。歩き切ったところで人は消えるので、
 * ここで敷地の中で終わる道順（＝1マスだけの道順を含む）を返すと、
 * **人が施設の真ん中で突然消える**（入口を動かして道が切れた瞬間などに起きていた）。
 * 入口へ辿り着けないときは、いちばん近い敷地の外へ向かわせる（→ escapeRoute）。
 */
export function leaveRoute(map: ClubMap, from: Cell, fromRoom: Equipment | null): Waypoint[] {
  const gate = fromRoom
    ? nearestEntrance(map, fromRoom) ?? placedRooms(map).find((e) => e.kind === "entrance") ?? null
    : placedRooms(map).find((e) => e.kind === "entrance") ?? null;
  if (!gate) return escapeRoute(map, from);
  const out: Waypoint[] = [{ ...from }];
  if (fromRoom && fromRoom.id !== gate.id) {
    const road = routeBetweenRooms(map, fromRoom, gate);
    if (road) for (let i = 1; i < road.length; i++) out.push({ ...road[i] });
  }
  out.push({ ...centerOf(gate) });
  out.push({ ...outsideCellOf(map, gate) });
  // 帰りは**部屋を出た1歩目**で私服に戻す（→ withSuitAtGoal と同じ理由）。
  if (out.length > 1) out[1].change = "street";
  return out;
}

/**
 * 入口が無い／辿り着けないときの逃げ道。**いちばん近い敷地の外**へまっすぐ向かう。
 *
 * 壁を突っ切ることはあるが、**その場で消えるよりはるかにまし**。
 * 入口を動かしている最中など、めったに起きない状況のための保険。
 */
function escapeRoute(map: ClubMap, from: Cell): Waypoint[] {
  const edges: Cell[] = [
    { gx: -1.2, gy: from.gy },
    { gx: map.cols + 0.2, gy: from.gy },
    { gx: from.gx, gy: -1.2 },
    { gx: from.gx, gy: map.rows + 0.2 },
  ];
  const near = edges.reduce((best, c) =>
    Math.hypot(c.gx - from.gx, c.gy - from.gy) < Math.hypot(best.gx - from.gx, best.gy - from.gy) ? c : best,
  );
  return [{ ...from }, { ...near, change: "street" as const }];
}

/**
 * 部屋から部屋へ移動する道順（コーチの出動・回復設備へ行くときに使う）。
 *
 * **道が繋がっていなければ null を返す**（＝その人はそこへ行けない）。
 * 以前はここで「入口から辿り直した道」を返していたが、その道は**今いる場所から
 * 繋がっていない**ので、コーチが部屋や壁を突っ切って入口まで一直線に歩いていた。
 * 行けないときは動かさないほうが、見た目にも仕組みにも正しい。
 */
export function moveRoute(map: ClubMap, from: Equipment | null, to: Equipment, fallback: Cell): Waypoint[] | null {
  if (from) {
    const road = routeBetweenRooms(map, from, to, entryCellsFor(map, to));
    return road ? endOnDeck(road.map((c) => ({ ...c })), to) : null;
  }
  // どの部屋にも居ない（＝置いたばかりの職員など）ときだけ、入口から辿る
  const direct = routeFromEntrance(map, to, undefined, entryCellsFor(map, to));
  if (direct) return endOnDeck(direct.map((c) => ({ ...c })), to);
  return endOnDeck([{ ...fallback }, { ...centerOf(to) }], to);
}

/**
 * 道順の終点が水の上（プールの中心・湯船）なら、陸の行に直す。
 * 職員や回復へ向かう選手が「水の上まで歩いてから岸へ瞬間移動する」のを防ぐ。
 */
function endOnDeck(route: Waypoint[], to: Equipment): Waypoint[] {
  if (route.length === 0) return route;
  const last = route[route.length - 1];
  const dry = ontoDry(to, last);
  if (dry == null) return route;
  route[route.length - 1] = { ...last, ...dry };
  return route;
}

/** 人が現れる場所（入口の外）。入口が無ければ敷地の下辺。 */
export function spawnCell(map: ClubMap): Cell {
  const gate = placedRooms(map).find((e) => e.kind === "entrance");
  if (gate) return outsideCellOf(map, gate);
  return { gx: Math.floor(MAP.cols / 2), gy: MAP.rows - 1 };
}
