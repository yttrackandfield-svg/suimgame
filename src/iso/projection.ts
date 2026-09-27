import { TILE_H, TILE_W } from "../config";

/**
 * アイソメトリック投影のヘルパー（純関数）。
 * グリッド座標 (gx, gy) は連続値でよい（キャラの補間移動に使う）。
 * ワールド原点は (0,0)。実際の画面配置は world コンテナの位置/スケールで行う。
 */

export interface Pt {
  x: number;
  y: number;
}

/** グリッド座標 → ワールド（コンテナ内）スクリーン座標。 */
export function isoToWorld(gx: number, gy: number): Pt {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

/**
 * ワールド座標 → グリッド座標（isoToWorld の逆変換）。
 * 建設モードで「画面のどこを押したか」をマスに戻すのに使う。
 */
export function worldToIso(x: number, y: number): Pt {
  const a = x / (TILE_W / 2);
  const b = y / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** ワールド座標が乗っているマス（整数）。 */
export function worldToCell(x: number, y: number): { gx: number; gy: number } {
  const p = worldToIso(x, y);
  return { gx: Math.round(p.x), gy: Math.round(p.y) };
}

/**
 * 描画順（奥→手前）。手前ほど大きい。
 * 同一セルでは baseLayer で 壁/床/什器/人物 の重なりを制御する。
 *
 *   depth = (gx + gy) * 1000 + layer
 *
 * layer は必ず 0〜999 に収めること（はみ出すと隣のセルと順序が入れ替わる）。
 */
export function depthFor(gx: number, gy: number, baseLayer = 0): number {
  return (gx + gy) * 1000 + baseLayer;
}

/**
 * セル内の重なり順（数字が大きいほど手前）。
 *
 * 壁はいちばん奥に置く。エッジウォールはセルの北辺・西辺に立つので、
 * 「そのセルの中身より奥」で正しい。南辺・東辺の壁は隣セル（gx+1 / gy+1）の
 * 壁として描かれ、depth が 1000 大きくなるため自動的に手前に来る。
 */
export const LAYER = {
  /** 出入口の敷居・レーン番号など、床に貼りつくもの。 */
  ground: 4,
  /** 壁（セル境界の薄板）。 */
  wall: 10,
  /** 什器・備品。 */
  furniture: 22,
  /** 購入した器具・アイテム。 */
  equipment: 25,
  /** 選手・一般客。 */
  person: 50,
  /** 職員。 */
  staff: 52,
  /** 警告ラベルなどの吹き出し。 */
  overlay: 60,
} as const;

/** タイルのダイヤ頂点（ワールド座標、原点は該当タイル中心）。上・右・下・左。 */
export function tileDiamond(): number[] {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  // Polygon 用に [x0,y0, x1,y1, ...]
  return [0, -hh, hw, 0, 0, hh, -hw, 0];
}
