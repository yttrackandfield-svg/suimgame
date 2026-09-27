/// <reference types="node" />
/**
 * 描画の重さ（スマホで固まる原因）を数で確かめる。
 *
 * Phaser の Graphics は「描いたものを絵として持っておく」のではなく、
 * **毎フレーム、描画命令をぜんぶ最初からやり直す**。
 * そのため 26x26 マスの床を Graphics に描くと、その命令が 60 回/秒 くり返される。
 * ここではその命令数を数えて、作り直しの前後で比べられるようにする。
 *
 * 実行:
 *   npx esbuild perfcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { MAP } from "./src/config/balance";
import { TILE_H, TILE_W } from "./src/config";
import { BAKE_MAX, BAKE_OVERLAP, bakeChunks } from "./src/gfx/bake";
import { circlePointCount, PHASER_ARC_POINTS, roundedRectPointCount } from "./src/gfx/shapes";
import {
  doorMarks,
  fittingsOf,
  floorKindAt,
  groundCells,
  outdoorScatter,
  OUTSIDE_BANDS,
  roomLabelsOf,
  wallEdgesOf,
  worldBounds,
} from "./src/iso/facility";
import { isPool } from "./src/sim/equipment";
import { landSizeOf, placedRooms } from "./src/sim/clubMap";
import { laneRopesOf } from "./src/iso/facility";

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
const newGame = (seed = 1): GameState => new GameState(rng(seed), { clubName: "テストクラブ" });

/**
 * Phaser の Graphics が積む命令の数を、実物と同じ数え方で数える。
 * （Phaser は commandBuffer という 1 本の配列に「命令コード＋引数」を並べ、
 *   毎フレームその配列を頭から読み直して描く）
 */
class CommandCounter {
  entries = 0; // commandBuffer に積まれる要素数
  fillPaths = 0; // 多角形の塗り（毎フレーム earcut で三角形に割られる）
  strokePaths = 0; // 線の描画

  fillStyle(): void {
    this.entries += 3;
  }
  lineStyle(): void {
    this.entries += 4;
  }
  beginPath(): void {
    this.entries += 1;
  }
  moveTo(): void {
    this.entries += 3;
  }
  lineTo(): void {
    this.entries += 3;
  }
  closePath(): void {
    this.entries += 1;
  }
  fillPath(): void {
    this.entries += 1;
    this.fillPaths++;
  }
  strokePath(): void {
    this.entries += 1;
    this.strokePaths++;
  }
  fillCircle(): void {
    // Phaser は円を 32 分割の多角形として積む
    this.entries += 4;
    this.fillPaths++;
  }
  lineBetween(): void {
    this.beginPath();
    this.moveTo();
    this.lineTo();
    this.strokePath();
  }
}

// ------------------------------------------------------------------ 1. 床（いちばん重い所）

head("1. 地面レイヤーの描画命令（毎フレーム replay される量）");

const st = newGame();
const map = st.map();
// 1マスずつ描くのは「買ってある敷地＋建物の外の帯（駐車場・歩道・車道）」だけ。
// その外側は舗装タイル1枚の敷き詰めなので、広さが増えても描画命令は増えない。
const b = groundCells(map);
const cells = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
const full = worldBounds();
const fullCells = (full.maxX - full.minX + 1) * (full.maxY - full.minY + 1);

const floor = new CommandCounter();
let waterCells = 0;
let nonGrass = 0;

for (let gy = b.minY; gy <= b.maxY; gy++) {
  for (let gx = b.minX; gx <= b.maxX; gx++) {
    const kind = floorKindAt(map, gx, gy);
    if (kind === "water") waterCells++;
    // ダイヤ 1 枚ぶん
    floor.fillStyle();
    floor.beginPath();
    floor.moveTo();
    floor.lineTo();
    floor.lineTo();
    floor.lineTo();
    floor.closePath();
    floor.fillPath();
    floor.lineStyle();
    floor.strokePath();
  }
}

// 部屋・道の外周の輪郭
for (let gy = b.minY; gy <= b.maxY; gy++) {
  for (let gx = b.minX; gx <= b.maxX; gx++) {
    const kind = floorKindAt(map, gx, gy);
    if (kind === "grass") continue;
    nonGrass++;
    floor.lineStyle();
    const differs = (dx: number, dy: number): boolean => {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < b.minX || nx > b.maxX || ny < b.minY || ny > b.maxY) return true;
      return floorKindAt(map, nx, ny) !== kind;
    };
    if (differs(1, 0)) floor.lineBetween();
    if (differs(0, 1)) floor.lineBetween();
    if (differs(-1, 0)) floor.lineBetween();
    if (differs(0, -1)) floor.lineBetween();
  }
}

// レーンロープ
const ropes = new CommandCounter();
for (const pool of placedRooms(map)) {
  if (!isPool(pool.kind)) continue;
  // FacilityScene のレーンロープと同じ打ち方（両端を結んで 0.3 マスおき）
  for (const rope of laneRopesOf(pool)) {
    const len = Math.hypot(rope.to.gx - rope.from.gx, rope.to.gy - rope.from.gy);
    for (let s = 0; s <= len + 1e-6; s += 0.3) {
      ropes.fillStyle();
      ropes.fillCircle();
    }
  }
}

// 出入口の敷居
const doors = new CommandCounter();
for (const c of doorMarks(map)) {
  void c;
  doors.fillStyle();
  doors.beginPath();
  doors.moveTo();
  doors.lineTo();
  doors.lineTo();
  doors.lineTo();
  doors.closePath();
  doors.fillPath();
}

// 水面のきらめき（毎フレーム clear して描き直している）
const shimmer = new CommandCounter();
for (let i = 0; i < waterCells; i++) {
  shimmer.lineStyle();
  shimmer.lineBetween();
}

const total = {
  entries: floor.entries + ropes.entries + doors.entries + shimmer.entries,
  fillPaths: floor.fillPaths + ropes.fillPaths + doors.fillPaths + shimmer.fillPaths,
  strokePaths: floor.strokePaths + ropes.strokePaths + doors.strokePaths + shimmer.strokePaths,
};

console.log(`  マス数           ${cells}（うち屋外でないマス ${nonGrass} / 水面 ${waterCells}）`);
console.log(`  床  Graphics     命令 ${floor.entries} 個 / 塗り ${floor.fillPaths} / 線 ${floor.strokePaths}`);
console.log(`  ロープ           命令 ${ropes.entries} 個 / 塗り ${ropes.fillPaths}`);
console.log(`  敷居             命令 ${doors.entries} 個 / 塗り ${doors.fillPaths}`);
console.log(`  きらめき         命令 ${shimmer.entries} 個 / 線 ${shimmer.strokePaths}`);
console.log(`  ---- 合計        命令 ${total.entries} 個 / 塗り ${total.fillPaths} / 線 ${total.strokePaths}`);
console.log(`  60fps なら 毎秒  命令 ${(total.entries * 60).toLocaleString()} 個 / earcut ${(total.fillPaths * 60).toLocaleString()} 回`);

// ------------------------------------------------------------------ 2. 表示物の数（深度ソートの対象）

head("2. world コンテナの子の数（毎フレーム depth で並べ替えている）");

const walls = wallEdgesOf(map).filter((w) => w.kind !== "none").length;
const fittings = fittingsOf(map).length;
const labels = roomLabelsOf(map).length;
let laneLabels = 0;
for (const pool of placedRooms(map)) {
  if (isPool(pool.kind)) laneLabels += 6;
}
const staticChildren = walls + fittings + labels + laneLabels + 4; // +4 は床/ロープ/きらめき/敷居の Graphics
console.log(`  壁 ${walls} / 什器 ${fittings} / 部屋名 ${labels} / レーン番号 ${laneLabels}`);
console.log(`  → 動かない表示物だけで ${staticChildren} 個。ここに人物・一般客・職員・器具が加わる。`);

// ------------------------------------------------------------------ 3. 焼き付けの分割

head("3. 地面を焼き付ける絵の分割（gfx/bake.ts）");

const hw = TILE_W / 2;
const hh = TILE_H / 2;
const pad = 4;
const area = {
  x: (b.minX - b.maxY) * hw - hw - pad,
  y: (b.minX + b.minY) * hh - hh - pad,
  w: 0,
  h: 0,
};
area.w = Math.ceil((b.maxX - b.minY) * hw + hw + pad - area.x);
area.h = Math.ceil((b.maxX + b.maxY) * hh + hh + pad - area.y);

const chunks = bakeChunks(area);
const px = chunks.reduce((n, c) => n + c.w * c.h, 0);
console.log(`  焼く範囲 ${area.w}x${area.h} px → ${chunks.length} 枚（${(px / 1e6).toFixed(1)}メガピクセル ≒ ${(px * 4 / 1024 / 1024).toFixed(0)}MB）`);
for (const c of chunks) console.log(`    ${c.w}x${c.h} @ (${c.x}, ${c.y})`);

// 端末が確実に作れる大きさに収まっているか
const tooBig = chunks.filter((c) => c.w > BAKE_MAX + BAKE_OVERLAP * 2 || c.h > BAKE_MAX + BAKE_OVERLAP * 2);

// 分けた絵が、焼く範囲をすき間なく覆っているか
let covered = true;
for (let sy = area.y; sy < area.y + area.h; sy += 37) {
  for (let sx = area.x; sx < area.x + area.w; sx += 41) {
    if (!chunks.some((c) => sx >= c.x && sx < c.x + c.w && sy >= c.y && sy < c.y + c.h)) covered = false;
  }
}

// ------------------------------------------------------------------ 4. 角丸（ボタン）の点の数

head("4. 角丸・円の分割（gfx/shapes.ts）");

/**
 * ボタン1つは「影・本体・外枠」で角丸を3回描く。
 * Phaser 既定では角ひとつが必ず100分割なので、1つあたり 404×3 点。
 */
const BUTTON_ROUNDS = 3;
const btnBefore = (4 + 4 * PHASER_ARC_POINTS) * BUTTON_ROUNDS;
const btnAfter = roundedRectPointCount(116, 62, 8) * BUTTON_ROUNDS;
/** フッターに出ているボタンの数（人気度ゲージ・速度・8つのアクションなど）。 */
const FOOTER_BUTTONS = 14;

console.log(`  ボタン1つ  ${btnBefore} 点 → ${btnAfter} 点（${(btnBefore / btnAfter).toFixed(1)}分の1）`);
console.log(
  `  フッター${FOOTER_BUTTONS}個で毎フレーム ${(btnBefore * FOOTER_BUTTONS).toLocaleString()} 点 → ` +
    `${(btnAfter * FOOTER_BUTTONS).toLocaleString()} 点`,
);
console.log(
  `  60fps なら毎秒 ${(btnBefore * FOOTER_BUTTONS * 60).toLocaleString()} 点 → ` +
    `${(btnAfter * FOOTER_BUTTONS * 60).toLocaleString()} 点の使い捨て`,
);
console.log(`  円（半径42）  ${PHASER_ARC_POINTS} 点 → ${circlePointCount(42)} 点`);

// 角丸の形が崩れていないか（角の分割が粗すぎないか）を、実際のズレで確かめる
const deviation = (r: number): number => {
  const steps = Math.max(2, Math.min(12, Math.ceil(r / 2)));
  return r * (1 - Math.cos(Math.PI / 2 / steps / 2));
};
console.log(`  半径8の角のズレ ${deviation(8).toFixed(2)}px ／ 半径20 ${deviation(20).toFixed(2)}px`);

// ------------------------------------------------------------------ 4b. 敷地を広げても重くならないか

head("4b. 敷地の広さと描画量（12倍まで広げても表示物が増えすぎないこと）");

const SCATTER_MAX = 54;
const SCATTER_BAND = 4;
const landRows: { steps: number; cells: number; scatter: number }[] = [];
{
  const big = newGame(4242);
  big.gems = 9_999_999;
  for (let steps = 0; steps <= MAP.maxLandSteps; steps++) {
    const gb = groundCells(big.map());
    landRows.push({
      steps,
      cells: (gb.maxX - gb.minX + 1) * (gb.maxY - gb.minY + 1),
      scatter: outdoorScatter(big.map(), SCATTER_MAX, SCATTER_BAND).length,
    });
    big.gems = 9_999_999;
    if (!big.expandLand().ok) break;
  }
}
console.log("  段  敷地      焼くマス   芝生の飾り");
for (const r of landRows) {
  const side = MAP.baseInner + MAP.expandStep * r.steps;
  console.log(
    `   ${r.steps}  ${String(side).padStart(2)}×${side}   ${String(r.cells).padStart(5)}      ${String(r.scatter).padStart(3)}`,
  );
}
const last = landRows[landRows.length - 1];
const first = landRows[0];
// 焼いた絵のメモリ（RGBA 4バイト/px）。段0で買った土地ぶんだけ、段5で敷地いっぱい。
const bakeMB = (cells: number): string => {
  const side = Math.sqrt(cells);
  return ((side * TILE_W * side * TILE_H * 4) / 1024 / 1024).toFixed(1);
};
console.log(`  焼いた絵のメモリ  段0 約${bakeMB(first.cells)}MB → 段${last.steps} 約${bakeMB(last.cells)}MB`);

// ------------------------------------------------------------------ 5. 判定

head("5. 判定");

ok(
  first.cells < last.cells,
  "焼く範囲は買った土地なりに増える（最初から最大ぶんを焼かない）",
  `${first.cells} → ${last.cells} マス`,
);
ok(
  first.cells <= (MAP.cols * MAP.rows) / 2,
  "序盤は焼く範囲がマップ全体の半分以下で済む（その外は舗装タイル1枚）",
  `${first.cells} / ${MAP.cols * MAP.rows} マス`,
);
ok(
  landRows.every((r) => r.scatter <= SCATTER_MAX),
  "建物の外の飾り（車・街灯）は上限で頭打ち（広げても表示物が増え続けない）",
  `最大 ${Math.max(...landRows.map((r) => r.scatter))} 個 / 上限 ${SCATTER_MAX}`,
);

ok(
  cells < fullCells / 2,
  "1マスずつ描くのは買った敷地とそのまわりの帯だけ（その外は舗装タイル1枚）",
  `${cells} / ${fullCells} マス`,
);
// ブロック追加方式では敷地が正方形とはかぎらない（右→下と交互に伸びる）ので、
// 「幅×高さ＋帯」で数える。
{
  const size = landSizeOf(0);
  const band = 2 * OUTSIDE_BANDS.street;
  ok(
    cells === (size.w + band) * (size.h + band),
    `初期の敷地なら ${size.w + band}×${size.h + band} マスぶん（駐車場・歩道・車道の帯を含む）`,
    `${cells} マス`,
  );
}
ok(
  total.entries > 5_000,
  "地面の描画は数千個の命令でできている（Graphics のままだと毎フレームこれを繰り返す＝焼く価値がある）",
  `${total.entries} 個 / 毎秒 ${(total.entries * 60).toLocaleString()} 個`,
);
ok(tooBig.length === 0, "焼く絵はどれも端末の作れる大きさに収まっている", `最大 ${BAKE_MAX}px`);
ok(covered, "分けた絵が焼く範囲をすき間なく覆っている", `${chunks.length} 枚`);
ok(bakeChunks({ x: 0, y: 0, w: 100, h: 100 }).length === 1, "小さい範囲は1枚のまま（むだに分けない）");
ok(
  bakeChunks({ x: 0, y: 0, w: 100, h: 100 })[0].w === 100,
  "1枚で足りるときは重なりを付けない",
  `${bakeChunks({ x: 0, y: 0, w: 100, h: 100 })[0].w}px`,
);
ok(
  chunks.every((c) => c.w % 2 === 0 && c.h % 2 === 0),
  "焼く絵の縦横は偶数（Phaser の偶数丸めで 1px 欠けないように）",
);
ok(bakeChunks({ x: 0, y: 0, w: 101, h: 99 })[0].w === 102, "奇数の範囲は切り上げて偶数にする");
{
  const split = bakeChunks({ x: 0, y: 0, w: 5000, h: 3000 });
  ok(split.length === 3 * 2, "大きい範囲は格子に分かれる", `${split.length} 枚`);
  ok(split.every((c) => c.w <= BAKE_MAX + 4 && c.h <= BAKE_MAX + 4), "分けたあとも上限に収まる");
  ok(split[1].x < split[0].x + split[0].w, "となり合う絵は重なっている（継ぎ目に隙間が出ない）");
}

ok(btnAfter * 8 < btnBefore, "角丸の点の数が 8 分の1 以下になった", `${btnBefore} → ${btnAfter} 点`);
ok(deviation(8) < 0.3, "それでも角の形は崩れない（ズレ 0.3px 未満）", `${deviation(8).toFixed(2)}px`);
ok(roundedRectPointCount(100, 100, 0) === 4, "半径0は四角のまま（むだな点を作らない）");
ok(
  roundedRectPointCount(20, 20, 999) === roundedRectPointCount(20, 20, 10),
  "半径が大きすぎても半分で頭打ちになる（Phaser の strokeRoundedRect と同じ）",
);
ok(circlePointCount(2) <= 8, "小さい円は粗くてよい", `半径2 → ${circlePointCount(2)} 点`);
ok(circlePointCount(60) >= 40, "大きい円はちゃんと丸い", `半径60 → ${circlePointCount(60)} 点`);

console.log(`\n合計: ${pass} ok / ${fail} NG`);
if (fail > 0) process.exitCode = 1;
