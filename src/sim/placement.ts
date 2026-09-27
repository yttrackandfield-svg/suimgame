import { gemsText } from "../config";
import {
  accessOf,
  canPlaceAt,
  entranceField,
  isBuildable,
  makeMap,
  placedRooms,
  roomAt,
  touchesPerimeter,
  type ClubMap,
} from "./clubMap";
import { equipmentDef, footprintOf, type Equipment, type RoomKind, type RoomRot } from "./equipment";

/**
 * 配置モードのロジック（純ロジック・Phaser 非依存）。
 *
 * 「買ってから置く」「置いてから動かす」のどちらも、ここで可否を判定する。
 *   ・確定するまで課金しない（お金を減らすのは Scene 側が確定時に1回だけ）
 *   ・置けない理由は日本語1行で返す（画面下部にそのまま出す）
 *   ・置いたあとで「入口から行けない部屋」が生まれないかを幅優先探索で見る
 */

/**
 * 【回転について】回転は「縦と横の入れ替え」（Equipment.rot）。
 *
 * 部屋は「奥に壁・手前が開く」向きで絵と内装を作ってある。斜め上から見る画面では
 * 奥の壁は北辺と西辺の2つなので、縦横を入れ替えても奥は奥のまま＝中が見える向きが崩れない
 * （画面の上では左右が反転して見える）。
 *
 * 以前は判定だけ縦横を入れ替えて、絵と占有マスがそのままだったため、
 * **見た目は変わらないのに置ける場所だけ変わる**不具合になり、いったん回転をやめていた。
 * いまは占有マス（roomSize）・壁・床・什器・レーン・席がすべて Equipment.rot を見ている。
 * 部屋の中身の座標を足すときは、必ず roomPoint（iso は facility.ts の各関数）を通すこと。
 */

/** 何を置こうとしているか。 */
export interface PlacementTarget {
  kind: RoomKind;
  /** 移設なら動かす部屋。新規購入なら null。 */
  existing: Equipment | null;
  /** 確定時に払う額（新規＝購入費、移設＝移設費）。 */
  cost: number;
  /** 移設か（画面の文言と課金の扱いが変わる）。 */
  moving: boolean;
}

export interface PlacementState {
  target: PlacementTarget | null;
  /** ゴーストの左上マス。 */
  gx: number;
  gy: number;
  /** 向き（1＝縦横を入れ替えて置く）。 */
  rot: RoomRot;
  valid: boolean;
  /** 置けない理由（置けるときは null）。 */
  reason: string | null;
  /** 置けはするが歩いて行けない、という注意（赤ではなく黄色で出す）。 */
  warning: string | null;
}

export function emptyPlacement(): PlacementState {
  return {
    target: null,
    gx: 0,
    gy: 0,
    rot: 0,
    valid: false,
    reason: null,
    warning: null,
  };
}

/**
 * そのマスが「購入済みの敷地」か。
 *
 * 敷地の購入（STEP12 の敷地拡張）はまだ入っていないので、
 * いまは「外周の道路より内側＝すべて購入済み」として扱う。
 * 敷地拡張が入ったら、この関数だけを cell.owned 参照に差し替えればよい。
 */
export function isOwnedCell(map: ClubMap, gx: number, gy: number): boolean {
  return isBuildable(map, gx, gy);
}

export interface PlacementCheck {
  ok: boolean;
  /** 置けない理由（日本語1行）。 */
  reason?: string;
  /** 置けるが気をつけてほしいこと。 */
  warning?: string;
}

/**
 * その位置に置けるか。理由つきで返す。
 *
 * 判定の順番は「プレイヤーが直したい順」にしてある
 * （敷地の外 → 重なり → 道の上 → 設備ごとのきまり → 通路をふさぐ）。
 */
export function checkPlacement(
  map: ClubMap,
  kind: RoomKind,
  gx: number,
  gy: number,
  ignoreId?: number,
  rot: RoomRot = 0,
): PlacementCheck {
  const f = footprintOf(kind, rot);

  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const cx = gx + x;
      const cy = gy + y;
      if (!isOwnedCell(map, cx, cy)) return { ok: false, reason: "敷地の外です" };
      const other = roomAt(map, cx, cy);
      if (other && other.id !== ignoreId) {
        return { ok: false, reason: `他の設備と重なっています（${equipmentDef(other.kind).label}）` };
      }
    }
  }

  // 設備ごとのきまり
  const rule = checkRule(map, kind, gx, gy, ignoreId, rot);
  if (!rule.ok) return rule;

  // 置いたあとで「入口から行けなくなる部屋」が出ないか
  const blocked = wouldStrand(map, { kind, gx, gy, ignoreId, rot });
  if (blocked.length > 0) {
    const names = blocked.slice(0, 2).map((e) => equipmentDef(e.kind).label).join("・");
    return { ok: false, reason: `通路をふさいでしまいます（${names}へ行けなくなる）` };
  }

  // 置けるが、そこへ歩いて行けない（＝四方を部屋で囲まれる）場合は注意だけ出す
  if (!wouldBeReachable(map, { kind, gx, gy, ignoreId, rot })) {
    return { ok: true, warning: "入口から歩いて行けません（まわりの部屋をずらそう）" };
  }
  return { ok: true };
}

/** 設備ごとのきまり（部屋の種類による制約）。 */
function checkRule(
  map: ClubMap,
  kind: RoomKind,
  gx: number,
  gy: number,
  ignoreId: number | undefined,
  rot: RoomRot,
): PlacementCheck {
  if (kind === "entrance") {
    // 入口は敷地の外と行き来する門なので、外周の道路に面していないと意味がない
    const probe: Equipment = { id: ignoreId ?? -1, kind, gx, gy, rot };
    if (!touchesPerimeter(map, probe)) {
      return { ok: false, reason: "入口は外周の道路に面して置きます" };
    }
  }
  return { ok: true };
}

interface Candidate {
  kind: RoomKind;
  gx: number;
  gy: number;
  ignoreId?: number;
  rot?: RoomRot;
}

/**
 * 候補を適用した「もしもの地図」を作る（道はそのまま共有する）。
 *
 * **敷地の段数（landSteps）を必ず引き継ぐこと。** makeMap の既定は 0 なので、
 * 渡し忘れると「もしもの地図」だけ初期の狭い敷地になり、買い足した土地に建っている
 * 部屋がすべて敷地の外あつかい＝どこへも行けない、と判定される。
 * その結果、**敷地を広げたあとは何を置こうとしても「通路をふさいでしまいます」**
 * になって置けなくなる（入口が動かせない、の正体もこれ）。
 */
function simulate(map: ClubMap, c: Candidate): { map: ClubMap; probe: Equipment } {
  const probeId = c.ignoreId ?? -1;
  const probe: Equipment = { id: probeId, kind: c.kind, gx: c.gx, gy: c.gy, rot: c.rot };
  const rooms = map.rooms.filter((e) => e.id !== probeId).concat(probe);
  return { map: makeMap(rooms, map.landSteps), probe };
}

/**
 * 置いたあとで「いま行ける部屋」が行けなくなるか。
 *
 * いちばん効くのは入口を動かしたとき。入口が敷地内の道に接していない場所へ移ると、
 * すべての部屋への経路が消える＝クラブが機能しなくなる。
 */
export function wouldStrand(map: ClubMap, c: Candidate): Equipment[] {
  const before = reachableIds(map);
  if (before.size === 0) return []; // もともと誰も行けない（＝これ以上悪くならない）
  const after = reachableIds(simulate(map, c).map);
  const out: Equipment[] = [];
  for (const e of placedRooms(map)) {
    if (e.id === (c.ignoreId ?? -1)) continue;
    if (before.has(e.id) && !after.has(e.id)) out.push(e);
  }
  return out;
}

/** 置いたその部屋自身に、入口から行けるか。 */
export function wouldBeReachable(map: ClubMap, c: Candidate): boolean {
  const sim = simulate(map, c);
  const field = entranceField(sim.map);
  return accessOf(sim.map, sim.probe, field).reachable;
}

function reachableIds(map: ClubMap): Set<number> {
  const field = entranceField(map);
  const out = new Set<number>();
  for (const e of placedRooms(map)) {
    if (accessOf(map, e, field).reachable) out.add(e.id);
  }
  return out;
}

/**
 * ゴーストの初期位置。
 * 移設なら元の場所、新規なら画面の真ん中あたりの空きを探す。
 */
export function initialSpot(map: ClubMap, target: PlacementTarget, rot: RoomRot = 0): { gx: number; gy: number } {
  if (target.existing && target.existing.gx != null && target.existing.gy != null) {
    return { gx: target.existing.gx, gy: target.existing.gy };
  }
  const f = footprintOf(target.kind, rot);
  const cx = Math.floor(map.cols / 2 - f.w / 2);
  const cy = Math.floor(map.rows / 2 - f.h / 2);
  // 中央から外へ螺旋状に空きを探す（見つからなければ中央のまま＝赤く出る）
  for (let r = 0; r < Math.max(map.cols, map.rows); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const gx = cx + dx;
        const gy = cy + dy;
        if (canPlaceAt(map, target.kind, gx, gy, target.existing?.id, rot).ok) return { gx, gy };
      }
    }
  }
  return { gx: cx, gy: cy };
}

/** 画面下部に出す情報（設備名 / サイズ / 価格 / 現在資金 / 設置後残高）。 */
export function placementSummary(target: PlacementTarget, gems: number, rot: RoomRot = 0): string {
  const def = equipmentDef(target.kind);
  const f = footprintOf(target.kind, rot);
  const after = gems - target.cost;
  const price = target.cost > 0 ? `◆${gemsText(target.cost)}` : "無料";
  const turned = rot === 1 ? "（回転）" : "";
  return `${def.label}　${f.w}×${f.h}マス${turned}　${price}　所持◆${gemsText(gems)} → 設置後◆${gemsText(Math.max(0, after))}`;
}
