/// <reference types="node" />
/**
 * コーチの描き起こしスプライト（アトラス）の検証。
 *
 *   1. アトラスの形（10パターン × 8方向、コマが揃っているか、シートの外を指していないか）
 *   2. 向き（グリッドの移動 → 画面の8方向）が、頭の向き＝進行方向になっているか
 *   3. 割り当て（格が高いと上級コーチ／同じコーチはいつも同じ絵）
 *
 * 実行:
 *   npx esbuild coachcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { COACH_PATTERNS, COACH_SHEETS, COACH_WALK_FPS, type Dir8 } from "./assets/characters/atlas";
import { coachPatternOf, dir8Of, COACH_PRO_QUALITY } from "./src/gfx/coachSprites";

const line = (s: string): void => console.log(s);
let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) failures++;
  line(`${ok ? "  ok " : "  NG "} ${name}${extra ? "  — " + extra : ""}`);
};

/** シートの大きさ（元画像）。アトラスの座標がこの中に収まっていること。 */
const SHEET_W = 1536;
const SHEET_H = 1024;
const DIRS: Dir8[] = ["down", "up", "left", "right", "downLeft", "downRight", "upLeft", "upRight"];

// ================================================================ 1. アトラスの形
line("\n=== 1. アトラスの形 ===");
{
  check("パターンが10（通常5＋上級5）", COACH_PATTERNS.length === 10, `${COACH_PATTERNS.length}`);
  check(
    "通常5・上級5に分かれている",
    COACH_PATTERNS.filter((p) => p.sheet === "normal").length === 5 &&
      COACH_PATTERNS.filter((p) => p.sheet === "pro").length === 5,
  );
  check("IDが重複していない", new Set(COACH_PATTERNS.map((p) => p.id)).size === 10);
  check("シートのパスが2種類ある", Object.keys(COACH_SHEETS).length === 2);
  check("コマ送りの速さが常識的", COACH_WALK_FPS >= 3 && COACH_WALK_FPS <= 12, `${COACH_WALK_FPS}fps`);

  let dirOk = true;
  let sizeOk = true;
  let boundsOk = true;
  let frameMin = 99;
  for (const p of COACH_PATTERNS) {
    for (const d of DIRS) {
      const def = p.walk[d];
      if (!def || def.f.length < 2) {
        dirOk = false;
        continue;
      }
      frameMin = Math.min(frameMin, def.f.length);
      // 1方向のコマは同じ大きさ（違うと歩くたびに伸び縮みして見える）
      const [, , w0, h0] = def.f[0];
      for (const r of def.f) {
        if (r[2] !== w0 || r[3] !== h0) sizeOk = false;
        if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > SHEET_W || r[1] + r[3] > SHEET_H) boundsOk = false;
      }
    }
    const [ix, iy, iw, ih] = p.idle;
    if (ix < 0 || iy < 0 || ix + iw > SHEET_W || iy + ih > SHEET_H) boundsOk = false;
    if (iw < 20 || ih < 40) sizeOk = false;
  }
  check("全パターンに8方向ぶんのコマがある", dirOk, `最少 ${frameMin}コマ`);
  check("1方向のコマは同じ大きさ", sizeOk);
  check("座標がシートの内側に収まっている", boundsOk, `${SHEET_W}x${SHEET_H}`);
}

// ================================================================ 2. 向き
line("\n=== 2. 進む向きと絵の向き ===");
{
  // 等角：画面X ∝ gx-gy ／ 画面Y ∝ gx+gy
  check("+gx（マスの右）は画面の右下", dir8Of(1, 0) === "downRight", dir8Of(1, 0));
  check("+gy（マスの下）は画面の左下", dir8Of(0, 1) === "downLeft", dir8Of(0, 1));
  check("-gx は画面の左上", dir8Of(-1, 0) === "upLeft", dir8Of(-1, 0));
  check("-gy は画面の右上", dir8Of(0, -1) === "upRight", dir8Of(0, -1));
  check("gx,gy 両方＋は画面の真下", dir8Of(1, 1) === "down", dir8Of(1, 1));
  check("gx,gy 両方−は画面の真上", dir8Of(-1, -1) === "up", dir8Of(-1, -1));
  check("+gx かつ -gy は画面の右", dir8Of(1, -1) === "right", dir8Of(1, -1));
  check("-gx かつ +gy は画面の左", dir8Of(-1, 1) === "left", dir8Of(-1, 1));
  check("動いていないときも落ちない", dir8Of(0, 0) === "down");

  // 右へ進む向きの絵は「右向き」であること＝
  // 左向きに描かれているシートでは flip が立っていること。
  let flipOk = true;
  const rightward: Dir8[] = ["right", "downRight", "upRight"];
  const leftward: Dir8[] = ["left", "downLeft", "upLeft"];
  for (const p of COACH_PATTERNS) {
    // 左向きの絵は反転しない（反転すると左へ進むのに右を向く）
    for (const d of leftward) if (p.walk[d].flip) flipOk = false;
  }
  check("左へ進む絵は反転していない", flipOk);
  // 【2026-08 修正】通常コーチのシートを「8方向とも左向き」と誤って読んでいたため、
  // right / downRight / upRight が反転され、**右へ歩くコーチが全員うしろ歩き**になっていた。
  // 素の切り出しを並べて確認したところ、どちらのシートも右向きの列は右を向いている。
  const noFlip = COACH_PATTERNS.every((p) => rightward.every((d) => !p.walk[d].flip));
  check("右へ進む絵も反転していない（どちらのシートも右向きに描かれている）", noFlip);
  const anyFlip = COACH_PATTERNS.some((p) => (Object.keys(p.walk) as Dir8[]).some((d) => p.walk[d].flip));
  check("反転して使うコマは1つも無い", !anyFlip, "反転が要るシートを足したらここを直す");
}

// ================================================================ 3. 割り当て
line("\n=== 3. コーチへの割り当て ===");
{
  let lowOk = true;
  let highOk = true;
  for (let id = 0; id < 60; id++) {
    for (let q = 1; q <= 3; q++) if (coachPatternOf(q, id).sheet !== "normal") lowOk = false;
    for (let q = COACH_PRO_QUALITY; q <= 5; q++) if (coachPatternOf(q, id).sheet !== "pro") highOk = false;
  }
  check("格1〜3は通常コーチの絵", lowOk);
  check("格4〜5（トップ・レジェンド）は上級コーチの絵", highOk);

  const a = coachPatternOf(3, 42);
  const b = coachPatternOf(3, 42);
  check("同じコーチはいつも同じ絵", a.id === b.id, a.id);
  const used = new Set(Array.from({ length: 40 }, (_, i) => coachPatternOf(2, i).id));
  check("5パターンが満遍なく使われる", used.size === 5, [...used].join(" "));
  // 格が上がっただけで別人にならないか（見た目は変わるが、変わり方が決まっていること）
  check("格が上がると上級の絵に変わる", coachPatternOf(3, 7).sheet === "normal" && coachPatternOf(5, 7).sheet === "pro");
}

line(`\n${failures === 0 ? "全て通過" : `${failures} 件 失敗`}`);
process.exit(failures === 0 ? 0 : 1);
