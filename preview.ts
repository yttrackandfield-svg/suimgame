/// <reference types="node" />
/**
 * マップの見た目プレビュー生成（開発用ツール）。
 *
 * ゲーム本体と同じデータ・同じ投影・同じ壁のかたちで SVG を書き出す。
 * ブラウザを起動せずに「タイルの大きさ」「薄い壁」「部屋の中が見えるか」を
 * 確認するために使う（本番の描画は Phaser 側で、ドット絵テクスチャを貼る）。
 *
 * 実行:
 *   npx esbuild preview.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs
 *   node <tmp>.mjs > preview.html
 */

import { writeFileSync } from "node:fs";
import { GameState } from "./src/sim/state";
import { TILE_H, TILE_W, GAME_WIDTH, GAME_HEIGHT, HUD_H, FOOTER_H } from "./src/config";
import { CAMERA, MAP } from "./src/config/balance";
import { isoToWorld } from "./src/iso/projection";
import {
  buildingWallEdges,
  floorKindAt,
  groundCells,
  roomLabelsOf,
  wallEdgesOf,
  worldBounds,
} from "./src/iso/facility";
import { ROOM_STYLE, WALL_H, WALL_THICK } from "./src/gfx/roomStyle";
import { centerOf, placedRooms } from "./src/sim/clubMap";
import { footprintOf, isPool } from "./src/sim/equipment";
import { fittingsOf } from "./src/iso/facility";
import "./src/sim/placement";

const hw = TILE_W / 2;
const hh = TILE_H / 2;

const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
/** 明度を掛けた色（壁の面ごとの陰影に使う）。 */
const shade = (c: number, k: number): string => {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((c & 0xff) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

interface Piece {
  depth: number;
  svg: string;
}

/** ゲームと同じ投影・同じ壁の作りで、マップ1枚ぶんの描画物を作る。 */
function buildPieces(state: GameState): Piece[] {
  const map = state.map();
  // ゲーム本体と同じ範囲だけを1マスずつ描く。
  // その外側の芝生は、実機ではタイル1枚の敷き詰めなので、ここでも描かない。
  const b = groundCells(map);
  const out: Piece[] = [];

  // --- 床 ---
  for (let gy = b.minY; gy <= b.maxY; gy++) {
    for (let gx = b.minX; gx <= b.maxX; gx++) {
      const kind = floorKindAt(map, gx, gy);
      const st = ROOM_STYLE[kind] ?? ROOM_STYLE.lobby;
      const p = isoToWorld(gx, gy);
      const alt = kind === "water" ? gy % 2 === 0 : (gx + gy) % 2 === 0;
      const fill = hex(alt ? st.alt : st.base);
      const pts = `${p.x},${p.y - hh} ${p.x + hw},${p.y} ${p.x},${p.y + hh} ${p.x - hw},${p.y}`;
      out.push({
        depth: (gx + gy) * 1000 + 0,
        svg: `<polygon points="${pts}" fill="${fill}" stroke="${hex(st.line)}" stroke-width="1" stroke-opacity="0.45"/>`,
      });
    }
  }

  // --- 部屋・道の外周に濃い輪郭 ---
  for (let gy = b.minY; gy <= b.maxY; gy++) {
    for (let gx = b.minX; gx <= b.maxX; gx++) {
      const kind = floorKindAt(map, gx, gy);
      if (kind === "grass") continue;
      const st = ROOM_STYLE[kind] ?? ROOM_STYLE.lobby;
      const p = isoToWorld(gx, gy);
      const differs = (dx: number, dy: number): boolean => {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < b.minX || nx > b.maxX || ny < b.minY || ny > b.maxY) return true;
        return floorKindAt(map, nx, ny) !== kind;
      };
      const seg = (x1: number, y1: number, x2: number, y2: number): string =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${hex(st.edge)}" stroke-width="2" stroke-opacity="0.75"/>`;
      let s = "";
      if (differs(1, 0)) s += seg(p.x, p.y + hh, p.x + hw, p.y);
      if (differs(0, 1)) s += seg(p.x - hw, p.y, p.x, p.y + hh);
      if (differs(-1, 0)) s += seg(p.x - hw, p.y, p.x, p.y - hh);
      if (differs(0, -1)) s += seg(p.x, p.y - hh, p.x + hw, p.y);
      if (s) out.push({ depth: (gx + gy) * 1000 + 1, svg: s });
    }
  }

  // --- レーンロープ（プールが「プール」に見える最大の要素） ---
  for (const pool of placedRooms(map)) {
    if (!isPool(pool.kind)) continue;
    const f = footprintOf(pool.kind);
    const waterH = f.h - 1;
    const lanes = pool.kind === "pool8" ? 8 : 6;
    for (let l = 0; l <= lanes; l++) {
      const by = (pool.gy as number) + (l * waterH) / lanes;
      const a = isoToWorld((pool.gx as number) + 0.3, by);
      const c = isoToWorld((pool.gx as number) + f.w - 1.3, by);
      out.push({
        depth: ((pool.gx as number) + by) * 1000 + 2,
        svg: `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="5 4" stroke-opacity="0.85"/>`,
      });
    }
  }

  // --- 壁（セル境界に立つ薄板。gfx/textures.ts の drawEdgeWall と同じ形） ---
  for (const w of [...buildingWallEdges(map), ...wallEdgesOf(map)]) {
    if (w.kind === "none") continue;
    const st = ROOM_STYLE[w.facing] ?? ROOM_STYLE.lobby;
    const base = st.wall;
    const sign = w.dir === "n" ? 1 : -1;
    const h =
      w.kind === "fence" ? WALL_H.fence : w.kind === "door" ? WALL_H.door : w.front ? WALL_H.front : WALL_H.back;
    const dx = -sign * WALL_THICK;
    const dy = Math.round(WALL_THICK / 2);
    const o = isoToWorld(w.gx, w.gy);
    const S = { x: o.x, y: o.y - hh }; // セル境界の始点＝ダイヤの上頂点
    const E = { x: S.x + sign * hw, y: S.y + hh };
    const faceK = w.dir === "n" ? 0.82 : 0.68;
    const depth = (w.gx + w.gy) * 1000 + 10;

    if (w.kind === "door") {
      // ドア＝開口。両端の枠柱＋明るい敷居だけ。
      let s = "";
      for (const p of [S, E]) {
        s += `<polygon points="${p.x},${p.y - h} ${p.x + dx},${p.y - h + dy} ${p.x + dx},${p.y + dy} ${p.x},${p.y}" fill="${shade(base, faceK)}" stroke="#3a2f28" stroke-width="1"/>`;
      }
      s += `<line x1="${S.x}" y1="${S.y}" x2="${E.x}" y2="${E.y}" stroke="${shade(base, 1.15)}" stroke-width="3"/>`;
      out.push({ depth, svg: s });
      continue;
    }

    if (w.kind === "fence") {
      let s = "";
      for (let t = 0; t <= 1.0001; t += 0.25) {
        const px = S.x + (E.x - S.x) * t;
        const py = S.y + (E.y - S.y) * t;
        s += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py - h}" stroke="#3a2f28" stroke-width="2" stroke-opacity="0.55"/>`;
      }
      for (const level of [h, h * 0.55]) {
        s += `<line x1="${S.x}" y1="${S.y - level}" x2="${E.x}" y2="${E.y - level}" stroke="${shade(base, 1.1)}" stroke-width="2.5"/>`;
      }
      out.push({ depth, svg: s });
      continue;
    }

    const opacity = w.kind === "glass" ? 0.45 : 1;
    const face = `${S.x + dx},${S.y - h + dy} ${E.x + dx},${E.y - h + dy} ${E.x + dx},${E.y + dy} ${S.x + dx},${S.y + dy}`;
    const cap = `${S.x},${S.y - h} ${E.x},${E.y - h} ${E.x + dx},${E.y - h + dy} ${S.x + dx},${S.y - h + dy}`;
    out.push({
      depth,
      svg:
        `<polygon points="${face}" fill="${shade(base, faceK)}" fill-opacity="${opacity}" stroke="#3a2f28" stroke-width="1.2"/>` +
        `<polygon points="${cap}" fill="${shade(base, 1.12)}" fill-opacity="${Math.min(1, opacity + 0.35)}" stroke="#3a2f28" stroke-width="1.2"/>`,
    });
  }

  // --- 什器の位置（本番はドット絵。ここでは位置が分かる印だけ） ---
  for (const f of fittingsOf(map)) {
    const p = isoToWorld(f.cell.gx, f.cell.gy);
    out.push({
      depth: (f.cell.gx + f.cell.gy) * 1000 + 22,
      svg:
        `<ellipse cx="${p.x}" cy="${p.y + 2}" rx="11" ry="6" fill="#000" fill-opacity="0.22"/>` +
        `<rect x="${p.x - 9}" y="${p.y - 20}" width="18" height="22" rx="3" fill="#c8b48f" stroke="#5a4a30" stroke-width="1.5"/>`,
    });
  }

  // --- 人（大きさの比較用。本番はドット絵キャラ） ---
  const people: { gx: number; gy: number }[] = [];
  for (const room of placedRooms(map)) {
    if (isPool(room.kind)) {
      const f = footprintOf(room.kind);
      for (let l = 0; l < 4; l++) {
        people.push({ gx: (room.gx as number) + 2 + l * 1.4, gy: (room.gy as number) + 0.5 + l * 0.5 });
      }
    }
  }
  for (const c of people) {
    const p = isoToWorld(c.gx, c.gy);
    out.push({
      depth: (c.gx + c.gy) * 1000 + 50,
      svg:
        `<ellipse cx="${p.x}" cy="${p.y + 2}" rx="10" ry="5" fill="#000" fill-opacity="0.25"/>` +
        `<rect x="${p.x - 7}" y="${p.y - 36}" width="14" height="26" rx="6" fill="#e0533a" stroke="#2b2119" stroke-width="1.5"/>` +
        `<circle cx="${p.x}" cy="${p.y - 40}" r="7" fill="#f6c9a0" stroke="#2b2119" stroke-width="1.5"/>`,
    });
  }

  // --- 部屋名 ---
  for (const l of roomLabelsOf(map)) {
    const p = isoToWorld(l.cell.gx, l.cell.gy);
    out.push({
      depth: (l.cell.gx + l.cell.gy) * 1000 + 60,
      svg:
        `<rect x="${p.x - l.text.length * 5 - 4}" y="${p.y - 9}" width="${l.text.length * 10 + 8}" height="18" rx="3" fill="#0a1622" fill-opacity="0.72"/>` +
        `<text x="${p.x}" y="${p.y + 4}" font-size="12" fill="#fff" text-anchor="middle" font-family="sans-serif">${l.text}</text>`,
    });
  }

  return out;
}

/** 描画物を depth 順に並べて SVG にする。 */
function renderSvg(pieces: Piece[], view: { x: number; y: number; w: number; h: number }, scale: number): string {
  const body = [...pieces].sort((a, b) => a.depth - b.depth).map((p) => p.svg).join("");
  return (
    `<svg width="${Math.round(view.w * scale)}" height="${Math.round(view.h * scale)}" ` +
    `viewBox="${view.x} ${view.y} ${view.w} ${view.h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="#9bd3ef"/>` +
    body +
    `</svg>`
  );
}

// ------------------------------------------------------------------ 配置モードの画面

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ゴーストと占有マスの色分け（ui/PlacementOverlay.ts の draw() と同じ形）。 */
function ghostSvg(gx: number, gy: number, f: { w: number; h: number }, valid: boolean): string {
  const color = valid ? "#4ade80" : "#f87171";
  let s = "";
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const p = isoToWorld(gx + x, gy + y);
      const pts = `${p.x},${p.y - hh} ${p.x + hw},${p.y} ${p.x},${p.y + hh} ${p.x - hw},${p.y}`;
      s += `<polygon points="${pts}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="2" stroke-opacity="0.95"/>`;
    }
  }
  const lift = 26;
  const c = [
    isoToWorld(gx, gy),
    isoToWorld(gx + f.w, gy),
    isoToWorld(gx + f.w, gy + f.h),
    isoToWorld(gx, gy + f.h),
  ];
  const top = c.map((q) => ({ x: q.x, y: q.y - hh - lift }));
  const edge = valid ? "#2e7d5b" : "#c0392b";
  s += `<polygon points="${top.map((q) => `${q.x},${q.y}`).join(" ")}" fill="${valid ? "#ffffff" : "#f87171"}" fill-opacity="0.6" stroke="${edge}" stroke-width="2.5"/>`;
  for (let i = 0; i < 4; i++) {
    s += `<line x1="${top[i].x}" y1="${top[i].y}" x2="${c[i].x}" y2="${c[i].y - hh}" stroke="${edge}" stroke-width="2" stroke-opacity="0.75"/>`;
  }
  return s;
}

/** 実機とおなじ 540×960 の画面まるごと（HUD ＋ ステージ ＋ 配置モードのフッター）。 */
function renderPlacementScreen(
  state: GameState,
  pieces: Piece[],
  kind: Parameters<typeof footprintOf>[0],
  gx: number,
  gy: number,
  existingId?: number,
): string {
  const f = footprintOf(kind);
  const check = state.checkPlacement(kind, gx, gy, 0, existingId);
  const valid = check.ok;
  const summary = state.placementSummary(
    { kind, existing: null, cost: state.equipmentCost(kind), moving: false },
    0,
  );

  const zoom = 0.6;
  const stageH2 = GAME_HEIGHT - HUD_H - FOOTER_H;
  const gp = isoToWorld(gx + f.w / 2, gy + f.h / 2);
  const camX = GAME_WIDTH / 2 - gp.x * zoom;
  const camY = HUD_H + stageH2 / 2 - gp.y * zoom;

  const world = [...pieces].sort((a, b) => a.depth - b.depth).map((p) => p.svg).join("");
  const stage =
    `<clipPath id="stg${gx}_${gy}"><rect x="0" y="${HUD_H}" width="${GAME_WIDTH}" height="${stageH2}"/></clipPath>` +
    `<g clip-path="url(#stg${gx}_${gy})">` +
    `<rect x="0" y="${HUD_H}" width="${GAME_WIDTH}" height="${stageH2}" fill="#9bd3ef"/>` +
    `<g transform="translate(${camX},${camY}) scale(${zoom})">${world}${ghostSvg(gx, gy, f, valid)}</g>` +
    `</g>`;

  const fy = GAME_HEIGHT - FOOTER_H;
  const reason = valid
    ? check.warning
      ? `⚠ ${check.warning}`
      : "✓ ここに置けます"
    : `✕ ${check.reason ?? ""}`;
  const reasonColor = valid ? (check.warning ? "#f7dc6f" : "#4ade80") : "#f87171";

  const btn = (x: number, w: number, label: string, fill: string, on: boolean): string =>
    `<g opacity="${on ? 1 : 0.4}">` +
    `<rect x="${x}" y="${fy + 91}" width="${w}" height="42" rx="6" fill="${fill}" stroke="#0a1622" stroke-width="2"/>` +
    `<text x="${x + w / 2}" y="${fy + 118}" font-size="15" fill="#fff" text-anchor="middle" font-family="sans-serif" font-weight="700">${esc(label)}</text>` +
    `</g>`;

  return (
    `<svg width="${GAME_WIDTH}" height="${GAME_HEIGHT}" viewBox="0 0 ${GAME_WIDTH} ${GAME_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${GAME_WIDTH}" height="${GAME_HEIGHT}" fill="#11202f"/>` +
    stage +
    // HUD
    `<rect x="0" y="0" width="${GAME_WIDTH}" height="${HUD_H}" fill="#0a1622"/>` +
    `<text x="16" y="34" font-size="17" fill="#f2f5f7" font-family="sans-serif" font-weight="700">1年目 4月 第1週</text>` +
    `<text x="16" y="62" font-size="15" fill="#9fb3c4" font-family="sans-serif">10:00　◆ ${state.gems}</text>` +
    `<text x="${GAME_WIDTH - 16}" y="34" font-size="15" fill="#f7dc6f" text-anchor="end" font-family="sans-serif" font-weight="700">クラブ 無名</text>` +
    // フッター（配置モード）
    `<rect x="0" y="${fy}" width="${GAME_WIDTH}" height="${FOOTER_H}" fill="#0d2233"/>` +
    `<line x1="0" y1="${fy}" x2="${GAME_WIDTH}" y2="${fy}" stroke="#4ade80" stroke-width="3"/>` +
    `<text x="14" y="${fy + 22}" font-size="15" fill="#4ade80" font-family="sans-serif" font-weight="700">配置モード</text>` +
    `<text x="96" y="${fy + 21}" font-size="11.5" fill="#9fb3c4" font-family="sans-serif">画面をなぞって場所を決める</text>` +
    `<text x="14" y="${fy + 45}" font-size="12.5" fill="#aed6f1" font-family="sans-serif" font-weight="700">${esc(summary)}</text>` +
    `<text x="14" y="${fy + 67}" font-size="12.5" fill="${reasonColor}" font-family="sans-serif" font-weight="700">${esc(reason)}</text>` +
    btn(12, 128, "キャンセル", "#5a3a3a", true) +
    btn(156, 116, "回転 ↻", "#39597e", f.w !== f.h) +
    btn(GAME_WIDTH - 204, 192, "ここに設置", "#2e7d5b", valid) +
    `</svg>`
  );
}

// ------------------------------------------------------------------ 出力

const state = new GameState(
  (() => {
    let s = 12345;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  })(),
  { clubName: "プレビュー" },
);

const pieces = buildPieces(state);
const map = state.map();
const pool = placedRooms(map).find((r) => isPool(r.kind))!;
const poolCenter = centerOf(pool);
const pc = isoToWorld(poolCenter.gx, poolCenter.gy);

// 敷地全体（全部入るように縮小）
const b = worldBounds();
const full = {
  x: (b.minX - b.maxY) * hw - hw,
  y: (b.minX + b.minY) * hh - WALL_H.back - 12,
  w: (b.maxX - b.minY) * hw + hw - ((b.minX - b.maxY) * hw - hw),
  h: (b.maxX + b.maxY) * hh + hh + 14 - ((b.minX + b.minY) * hh - WALL_H.back - 12),
};

// 実機と同じ「見えている範囲」（既定ズーム・プールを中央に）
const stageH = GAME_HEIGHT - HUD_H - FOOTER_H;
const z = CAMERA.defaultZoom;
const phone = { x: pc.x - GAME_WIDTH / 2 / z, y: pc.y - stageH / 2 / z, w: GAME_WIDTH / z, h: stageH / z };

const poolW = (footprintOf(pool.kind).w + footprintOf(pool.kind).h) * hw;
const ratio = ((poolW * z) / GAME_WIDTH) * 100;

/**
 * ページの見た目。
 * 施設の設計図（スペックシート）の体裁にしてある。
 * 色は本編の COLORS / ROOM_STYLE から取っているので、ページと画面が地続きに見える。
 */
const html = `<title>マップ表現の刷新 — 実装プレビュー</title>
<style>
  :root {
    color-scheme: light dark;
    /* 本編のプール水色を基調に、青みを帯びたニュートラルで組む */
    --ink:      #10212b;
    --ink-soft: #47606f;
    --paper:    #eef4f7;
    --card:     #ffffff;
    --rule:     #cfdde5;
    --accent:   #1273a3;
    --accent-2: #0d5a80;
    --good:     #1f7a55;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink:      #dfeaf1;
      --ink-soft: #8ba4b4;
      --paper:    #0c161d;
      --card:     #13222c;
      --rule:     #26404f;
      --accent:   #4fc0f0;
      --accent-2: #8fd8f5;
      --good:     #56c99a;
    }
  }
  :root[data-theme="dark"] {
    --ink: #dfeaf1; --ink-soft: #8ba4b4; --paper: #0c161d; --card: #13222c;
    --rule: #26404f; --accent: #4fc0f0; --accent-2: #8fd8f5; --good: #56c99a;
  }
  :root[data-theme="light"] {
    --ink: #10212b; --ink-soft: #47606f; --paper: #eef4f7; --card: #ffffff;
    --rule: #cfdde5; --accent: #1273a3; --accent-2: #0d5a80; --good: #1f7a55;
  }

  body {
    background: var(--paper);
    color: var(--ink);
    font-family: "Hiragino Sans", "Yu Gothic UI", system-ui, sans-serif;
    line-height: 1.75;
    margin: 0;
    padding: 40px 24px 72px;
  }
  .wrap { max-width: 940px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
  .prose { max-width: 62ch; }

  .mono {
    font-family: ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }

  header { display: flex; flex-direction: column; gap: 10px; }
  .eyebrow {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 12px; letter-spacing: .16em; text-transform: uppercase;
    color: var(--accent); margin: 0;
  }
  h1 {
    font-family: ui-monospace, "SFMono-Regular", "Cascadia Mono", Menlo, Consolas, monospace;
    font-size: clamp(26px, 4.5vw, 38px); font-weight: 700; letter-spacing: -.02em;
    line-height: 1.25; text-wrap: balance; margin: 0;
  }
  header p { margin: 0; color: var(--ink-soft); font-size: 14.5px; max-width: 62ch; }

  section { display: flex; flex-direction: column; gap: 14px; }
  h2 {
    font-size: 13px; letter-spacing: .12em; text-transform: uppercase;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    color: var(--ink-soft); margin: 0; padding-bottom: 8px; border-bottom: 1px solid var(--rule);
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
  }
  h2 b { color: var(--accent); font-weight: 700; }
  p { margin: 0; font-size: 15px; }
  .note { color: var(--ink-soft); font-size: 13.5px; }

  figure { margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .scroll { overflow-x: auto; max-width: 100%; padding-bottom: 4px; }
  .frame {
    border: 1px solid var(--rule); border-radius: 4px; overflow: hidden;
    display: inline-block; max-width: 100%; background: #9bd3ef;
    box-shadow: 0 10px 32px rgba(9, 32, 45, .16);
  }
  .device { border-width: 8px; border-color: var(--ink); border-radius: 14px; }
  figcaption { font-size: 13px; color: var(--ink-soft); max-width: 44ch; }
  figcaption b { color: var(--ink); }
  svg { display: block; max-width: 100%; height: auto; }
  .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; align-items: start; }

  .headline { display: flex; flex-wrap: wrap; gap: 10px 28px; align-items: baseline; }
  .big {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 40px; font-weight: 700; line-height: 1; color: var(--good);
    font-variant-numeric: tabular-nums;
  }
  .big span { font-size: 17px; font-weight: 400; color: var(--ink-soft); margin-left: 4px; }

  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  caption { text-align: left; color: var(--ink-soft); font-size: 13px; padding-bottom: 8px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  thead th { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft); font-weight: 600; }
  td.was { color: var(--ink-soft); text-decoration: line-through; text-decoration-thickness: 1px; }
  td.now { color: var(--ink); font-weight: 600; }
  tbody th { font-weight: 600; width: 30%; }

  ul { margin: 0; padding-left: 1.15em; display: flex; flex-direction: column; gap: 7px; }
  li { font-size: 14.5px; }
  li b { color: var(--accent-2); }

  .legend { display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13px; color: var(--ink-soft); }
  .legend i { display: inline-block; width: 26px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: 1px; }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">STEP 12 手順 1–3 ／ STEP 13 手順 1–3</p>
    <h1>マップ表現の刷新と<br>設備の配置モード</h1>
    <p>ゲーム本体と同じデータ・同じ投影・同じ壁のかたちで描き出したプレビューです。実際の画面は Phaser がドット絵テクスチャを貼るので、色面と配置はこのとおり、質感だけが変わります。什器と人は大きさの比較用の仮の形です。</p>
  </header>

  <section>
    <h2>スマホ画面に映る範囲 <b class="mono">zoom ${z} · ${GAME_WIDTH}×${stageH}px</b></h2>
    <div class="headline">
      <div><span class="big">${Math.round(ratio)}<span>%</span></span></div>
      <p class="prose">枠が実機の表示領域。6レーンプールが画面幅のこれだけを占めます（受け入れ条件は 1/3 以上）。</p>
    </div>
    <figure>
      <div class="frame device">${renderSvg(pieces, phone, z)}</div>
      <figcaption>手前の壁が低いので、プールの中も更衣室の中も上から全部見えます。</figcaption>
    </figure>
  </section>

  <section>
    <h2>敷地全体 <b class="mono">${MAP.cols} × ${MAP.rows} マス</b></h2>
    <p class="note">外周の1マスは道路。入口 → 受付 → 更衣室 → プールが道でつながっています。</p>
    <div class="scroll"><div class="frame">${renderSvg(pieces, full, 0.42)}</div></div>
    <div class="legend">
      <span><i style="background:${hex(ROOM_STYLE.road.base)}"></i>道</span>
      <span><i style="background:${hex(ROOM_STYLE.grass.base)}"></i>空き地</span>
      <span><i style="background:${hex(ROOM_STYLE.water.base)}"></i>プール</span>
      <span><i style="background:${hex(ROOM_STYLE.deck.base)}"></i>プールサイド</span>
      <span><i style="background:${hex(ROOM_STYLE.lobby.base)}"></i>ロビー・受付</span>
    </div>
  </section>

  <section>
    <h2>配置モード <b class="mono">STEP13 · 手順 1–3</b></h2>
    <p class="prose">建設タブで「購入して配置」を押すと、この画面に入ります。<b>ここで「ここに設置」を押すまで、お金は1円も減りません。</b>キャンセルすれば無課金で戻れます。占有するマスを緑／赤で塗り、置けないときは理由を下に1行で出します。</p>
    <div class="shots">
      <figure>
        <div class="frame device">${renderPlacementScreen(state, pieces, "studio", 3, 3)}</div>
        <figcaption><b>置ける</b>／道がまだ無いので黄色の注意だけ。先に置いてから道を引けます。</figcaption>
      </figure>
      <figure>
        <div class="frame device">${renderPlacementScreen(state, pieces, "studio", (pool.gx as number) + 1, (pool.gy as number) + 1)}</div>
        <figcaption><b>置けない</b>／重なっている相手の名前まで出します。「ここに設置」は押せません。</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>変更した数値</h2>
    <div class="scroll">
      <table class="mono">
        <caption>すべて config で変更できます（src/config.ts ／ src/gfx/roomStyle.ts ／ src/config/balance.ts）</caption>
        <thead><tr><th>項目</th><th>変更前</th><th>変更後</th></tr></thead>
        <tbody>
          <tr><th>タイル寸法</th><td class="was">44 × 26</td><td class="now">${TILE_W} × ${TILE_H}（厳密な 2:1）</td></tr>
          <tr><th>壁のかたち</th><td class="was">1マスを占有する立方体</td><td class="now">セル境界の薄板 厚み ${WALL_THICK}px</td></tr>
          <tr><th>奥の壁（北辺・西辺）</th><td class="was">高さ 40</td><td class="now">高さ ${WALL_H.back}</td></tr>
          <tr><th>手前の壁（南辺・東辺）</th><td class="was">高さ 8 の縁</td><td class="now">高さ ${WALL_H.front} に低背化</td></tr>
          <tr><th>プールサイド</th><td class="was">壁なし</td><td class="now">高さ ${WALL_H.fence} の柵</td></tr>
          <tr><th>出入口</th><td class="was">壁を1マス抜く</td><td class="now">辺がドアになる（枠柱＋敷居）</td></tr>
          <tr><th>ズーム</th><td class="was">0.35 – 2.2</td><td class="now">${CAMERA.minZoom} – ${CAMERA.maxZoom}（${CAMERA.zoomStep} きざみ）</td></tr>
          <tr><th>キャラの倍率</th><td class="was">1.5</td><td class="now">3.0</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>仕組みとして変えたこと</h2>
    <ul class="prose">
      <li>壁は<b>セルの北辺と西辺だけ</b>に持ちます。南辺は南隣セルの北辺、東辺は東隣セルの西辺なので、1枚の壁が2箇所に現れません。</li>
      <li>部屋の外周に壁が<b>自動生成</b>され、道に接した辺は<b>ドア</b>になります。道をつなぎ替えると出入口も自動でついてきます。</li>
      <li>壁の当たり判定は <span class="mono">wall / glass / fence = 通行不可</span>、<span class="mono">door / none = 通行可</span>。ガラス壁は実装済みで、壁の売り場ができ次第すぐ使えます。</li>
      <li>描画順は <span class="mono">(gx + gy) × 1000 + レイヤ</span> に統一。壁はレイヤ10で、そのセルの中身より必ず奥に入ります。</li>
      <li>配置の可否は <span class="mono">sim/placement.ts</span> の1本にまとめました。<b>敷地の外 → 重なり → 通路の上 → 設備ごとのきまり → 通路をふさぐ</b> の順に見て、最初に引っかかった理由を返します。</li>
      <li>通路封鎖は「置いたあとの地図」を作って幅優先探索し、<b>いま行ける部屋が行けなくなる配置だけ</b>を拒否します（入口を道から切り離す操作がこれに当たります）。</li>
    </ul>
  </section>
</div>
`;

const outPath = process.argv[2];
if (outPath) writeFileSync(outPath, html, "utf8");
else process.stdout.write(html);
