/// <reference types="node" />
/**
 * 人の動きの検証（歩くモーション・向き・着替え・入水・退場）。
 *
 * 報告された不具合をそのまま検査項目にしてある。
 *   1) 板が滑っているように見える  … 歩数が「歩いた距離」で進み、体が上下しているか
 *   2) うしろ歩きしているのがいる  … 素材の向き表どおりに反転して、進行方向を向くか
 *   3) 私服のままプールに入る      … プールに着いた瞬間に水着へ替わるか（生徒・一般客とも）
 *   4) 急にプールサイドへ飛ぶ      … 1フレームで大きく座標が飛ばないか
 *   5) いなくなる                  … 帰り道を歩き切るまで消えないか
 *   6) コーチが団子になる          … 立ち位置が画面上で離れているか（→ 10.）
 *
 * iso/people.ts は Phaser を型としてしか使っていないので、偽のスプライトで動かせる。
 *
 * 実行（gfx/textures.ts が Phaser を値として使うので、空の代役に差し替えて動かす）:
 *   npx esbuild movecheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs
 *   node <tmp>.mjs
 */

import { readFileSync } from "node:fs";
import { Person, Visitor } from "./src/iso/people";
import { StaffPerson } from "./src/iso/staff";
import { clearCoachArt, coachArtReady, COACH_TARGET_H, sliceCoachSheets } from "./src/gfx/coachSprites";
import { ART_STEP_LEN, WalkCycle, idlePose, screenSteps } from "./src/iso/walkCycle";
import { CHAR_VIEW, charFacing, flipXFor, type CharView } from "./src/gfx/charFacing";
import {
  allCharTypes,
  assetEntryOf,
  assetKey,
  clearCharAssets,
  parseAssetPath,
  registerCharAsset,
} from "./src/gfx/charAssets";
import { charKey } from "./src/gfx/charSprites";
import { charTypeOf, variantForGender } from "./src/gfx/textures";
import { isoToWorld } from "./src/iso/projection";
import { CHAR_SCALE } from "./src/config";
import { standCellsOf, type Waypoint } from "./src/iso/facility";
import type { Student } from "./src/sim/student";
import type { Equipment } from "./src/sim/equipment";

let pass = 0;
let fail = 0;
const line = (s = ""): void => console.log(s);
function head(title: string): void {
  line();
  line(`=== ${title} ===`);
}
function ok(cond: boolean, label: string, detail = ""): void {
  if (cond) {
    pass++;
    line(`  OK   ${label}${detail ? `  (${detail})` : ""}`);
  } else {
    fail++;
    line(`  NG   ${label}${detail ? `  (${detail})` : ""}`);
  }
}

// ------------------------------------------------------------------ 偽のスプライト

interface FakeSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  rotation: number;
  displayHeight: number;
  texture: { key: string };
  anims: {
    currentAnim: { key: string; frames: FakeFrame[] } | null;
    currentFrame: FakeFrame | null;
    isPlaying: boolean;
    isPaused: boolean;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    setCurrentFrame: (f: FakeFrame) => void;
  };
  /** その姿のコマ数。1 のままなら「1枚絵」＝コマ送りは起きない（既定）。 */
  frameCount: number;
  /** 実際に出したコマ番号の記録（コマ送りの検証に使う）。 */
  frameLog: number[];
  scene: { textures: { exists: () => boolean } };
  [k: string]: unknown;
}

interface FakeFrame {
  index: number;
}

function makeSprite(): FakeSprite {
  const s = {
    x: 0,
    y: 0,
    width: 40,
    height: 80,
    originX: 0.5,
    originY: 1,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    rotation: 0,
    displayHeight: 80,
    texture: { key: "" },
    frameCount: 1,
    frameLog: [] as number[],
    anims: {
      currentAnim: null,
      currentFrame: null,
      isPlaying: false,
      isPaused: false,
      pause: (): void => {
        s.anims.isPlaying = false;
        s.anims.isPaused = true;
      },
      resume: (): void => {
        s.anims.isPlaying = true;
        s.anims.isPaused = false;
      },
      stop: (): void => {
        s.anims.isPlaying = false;
      },
      setCurrentFrame: (f: FakeFrame): void => {
        s.anims.currentFrame = f;
        s.frameLog.push(f.index);
      },
    },
    scene: { textures: { exists: (): boolean => true } },
  } as unknown as FakeSprite;
  Object.assign(s, {
    setOrigin: (x: number, y: number) => {
      s.originX = x;
      s.originY = y;
      return s;
    },
    setScale: (x: number, y?: number) => {
      s.scaleX = x;
      s.scaleY = y ?? x;
      s.displayHeight = s.height * s.scaleY;
      return s;
    },
    setPosition: (x: number, y: number) => {
      s.x = x;
      s.y = y;
      return s;
    },
    setRotation: (r: number) => {
      s.rotation = r;
      return s;
    },
    setDepth: () => s,
    setFlipX: (f: boolean) => {
      s.flipX = f;
      return s;
    },
    setTexture: (k: string) => {
      s.texture = { key: k };
      return s;
    },
    setInteractive: () => s,
    setAlpha: () => s,
    setTint: () => s,
    setCrop: () => s,
    play: (key: string) => {
      // コマ数を持たせておくと、コマ送り（stepAnim）がどのコマを出したか記録できる
      s.anims.currentAnim = { key, frames: Array.from({ length: s.frameCount }, (_, i) => ({ index: i })) };
      s.anims.isPlaying = true;
      s.anims.isPaused = false;
      return s;
    },
    on: () => s,
    destroy: (): void => undefined,
  });
  return s;
}

function makeScene(): { scene: never; sprites: FakeSprite[] } {
  const sprites: FakeSprite[] = [];
  const make = (): FakeSprite => {
    const s = makeSprite();
    sprites.push(s);
    return s;
  };
  // コーチのアトラス切り出し（sliceCoachSheets）と接地影に必要な口だけ用意する
  const fakeTex = { setFilter: (): void => undefined, add: (): void => undefined };
  return {
    scene: {
      add: { image: make, sprite: make, graphics: () => ({ fillStyle: () => undefined, fillEllipse: () => undefined, generateTexture: () => undefined, destroy: () => undefined }) },
      textures: { exists: (): boolean => true, get: () => fakeTex, remove: (): void => undefined },
      anims: { exists: (): boolean => false, create: (): void => undefined, remove: (): void => undefined },
    } as never,
    sprites,
  };
}
const world = { add: () => undefined } as never;

/** 検証用の選手（Person が見るのは id / gender / grade だけ）。 */
function student(id: number, grade: string, gender: "m" | "f" = "m"): Student {
  return { id, grade, gender, classId: "ikusei", name: `検証${id}` } as unknown as Student;
}

// ------------------------------------------------------------------ 1. 歩きのモーション

head("1. 歩きのモーション（板が滑って見えないか）");
{
  const g = new WalkCycle(0);
  ok(g.frameOf(2) === 0, "止まっていればコマは進まない");
  g.advance(0.85);
  ok(g.frameOf(2) === 1, "1歩ぶん歩くと次のコマになる");
  g.advance(0.85);
  ok(g.frameOf(2) === 0, "2歩でコマが一周する");

  // 時間ではなく距離で回る：同じ距離なら、どんな刻みで進めても同じ姿勢になる
  const a = new WalkCycle(0);
  a.advance(0.4);
  const b = new WalkCycle(0);
  for (let i = 0; i < 40; i++) b.advance(0.01);
  ok(Math.abs(a.pose(100).oy - b.pose(100).oy) < 1e-9, "刻みが違っても、歩いた距離が同じなら同じ姿勢");

  // 立ち絵1枚でも「弾んで」見える＝上下の振れが出ている
  const c = new WalkCycle(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 60; i++) {
    c.advance(0.05);
    const oy = c.pose(100).oy;
    lo = Math.min(lo, oy);
    hi = Math.max(hi, oy);
  }
  ok(hi - lo > 3, "歩くと体が上下する（背丈100pxで3px以上）", `${(hi - lo).toFixed(1)}px`);
  ok(lo < 0 && hi <= 0.001, "上下は「持ち上がる」方向だけ（地面にめり込まない）");

  const d = new WalkCycle(0);
  d.advance(0.425); // ちょうど半歩＝いちばん高いところ
  const p = d.pose(100);
  ok(p.sy < 1 === false && p.sy >= 1 - 1e-9, "浮いている瞬間はつぶれない", `sy=${p.sy.toFixed(3)}`);
  const e = new WalkCycle(0);
  const grounded = e.pose(100);
  ok(grounded.sy < 1 && grounded.sx > 1, "着地の瞬間だけ縦につぶれる", `sx=${grounded.sx.toFixed(3)}`);

  // 立ち止まっているときは呼吸ぶんだけ（歩きの振れより小さい）
  let idleLo = 0;
  let idleHi = 0;
  for (let i = 0; i < 200; i++) {
    const o = idlePose(i * 0.05, 0).oy;
    idleLo = Math.min(idleLo, o);
    idleHi = Math.max(idleHi, o);
  }
  ok(idleHi - idleLo < 2, "止まっている人はほとんど動かない（足踏みしない）", `${(idleHi - idleLo).toFixed(2)}px`);
}

// ------------------------------------------------------------------ 1b. 足の運びと体の上下

head("1b. コマのある素材（コーチ）で、足の運びと体の上下が噛み合うか");
{
  // 【元の不具合】コマを「1コマ＝1歩」で送っていたため、3コマの素材は
  //   足＝3歩で一周 ／ 体の上下＝2歩で一周
  // となってずっとずれ続け、足を動かしていても
  // 「板が上下しながら移動している」ようにしか見えなかった。
  const w = new WalkCycle(0, ART_STEP_LEN);
  const seen: number[] = [];
  for (let i = 0; i < 8; i++) {
    seen.push(w.frameOf(3));
    w.advance(ART_STEP_LEN / 2); // 半歩ずつ＝1拍ずつ
  }
  ok(seen.join("") === "01210121", "3コマは 0→1→2→1 で送り、2歩ぶんで一周する", seen.join(""));

  // いちばん体が浮くのは「足がそろう絵」の瞬間でなければならない
  const s = new WalkCycle(0, ART_STEP_LEN);
  let deepest = 0;
  let frameAtTop = -1;
  for (let i = 0; i < 240; i++) {
    s.advance(ART_STEP_LEN / 40);
    const oy = s.pose(100).oy;
    if (oy < deepest) {
      deepest = oy;
      frameAtTop = s.frameOf(3);
    }
  }
  ok(frameAtTop === 1, "いちばん体が浮く瞬間は「足がそろう絵」", `コマ${frameAtTop}`);

  // 2コマの素材（生徒の一部）は 1コマ＝1歩のまま
  const two = new WalkCycle(0, ART_STEP_LEN);
  const seen2: number[] = [];
  for (let i = 0; i < 4; i++) {
    seen2.push(two.frameOf(2));
    two.advance(ART_STEP_LEN);
  }
  ok(seen2.join("") === "0101", "2コマは1歩ごとに左右が入れ替わる", seen2.join(""));

  // 等角では、同じ1マスでも画面上の長さが向きで倍ほど違う
  ok(screenSteps(1, -1) > screenSteps(1, 1) * 1.9, "画面の左右へ動くほうが、奥へ動くより倍ほど長い");
}

// ------------------------------------------------------------------ 2. 向き（うしろ歩き）

head("2. 進行方向を向く（うしろ歩きしないか）");
{
  const types = allCharTypes().map((t) => t.id);
  const missing = types.filter((id) => !CHAR_VIEW[id]);
  ok(missing.length === 0, "全20タイプが向き表に載っている", missing.join(",") || `${types.length}タイプ`);
  const noWalk = types.filter((id) => !CHAR_VIEW[id]?.walk || !CHAR_VIEW[id]?.walkBack);
  ok(noWalk.length === 0, "歩き・背中の向きが全タイプぶん書いてある", noWalk.join(","));

  // 表どおりに反転すると、絵は必ず進行方向を向く
  const shown = (view: CharView, dir: 1 | -1): number => {
    if (view === "front") return dir; // 正面の絵はどちらへ歩いても正しい
    const art = view === "left" ? -1 : 1;
    return flipXFor(view, dir) ? -art : art;
  };
  let wrong = 0;
  let checked = 0;
  for (const id of types) {
    for (const [mode, view] of Object.entries(CHAR_VIEW[id] ?? {})) {
      for (const dir of [1, -1] as const) {
        checked++;
        if (shown(view as CharView, dir) !== dir) wrong++;
      }
      void mode;
    }
  }
  ok(wrong === 0, "表に載っている姿はすべて、絵が進行方向を向く", `${checked}通り中 ずれ ${wrong}件`);

  // 泳ぎの向き（頭のほうへ進むか）。素材は実測した結果を表に入れてある
  const swimModes = ["swim", "swimFree", "swimBreast", "swimBack", "swimFly", "kick", "float"] as const;
  const noWater = types.filter((id) => !swimModes.some((m) => CHAR_VIEW[id]?.[m]));
  ok(noWater.length === 0, "泳ぎの向きが全タイプぶん書いてある（足から進むのを防ぐ）", noWater.join(","));

  ok(flipXFor("left", 1) && !flipXFor("left", -1), "左向きの絵は、右へ歩くときだけ反転する");
  ok(!flipXFor("right", 1) && flipXFor("right", -1), "右向きの絵は、左へ歩くときだけ反転する");
  ok(!flipXFor("front", 1) && !flipXFor("front", -1), "正面の絵は反転しない（髪飾りが左右に飛ばない）");

  // 素材が入っていないときはコード生成のドット絵＝右向き扱い
  ok(charFacing("m_sporty", "walk") === "right", "素材未読み込みなら右向き扱い（ドット絵と揃う）");
  ok(charFacing("does_not_exist", "walk") === "right", "知らないタイプでも壊れない");
}

// ------------------------------------------------------------------ 2b. 実素材での向き

head("2b. 実際に置いてある素材でも向き表が効くか");
{
  // public/characters/manifest.json を読み、素材が入っている状態を再現する。
  // （素材が入っていないと charFacing は「右向き（ドット絵）」を返すので、表が効かない）
  const dir = "public/characters";
  const man = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf-8")) as { files?: unknown[] };
  let registered = 0;
  for (const e of man.files ?? []) {
    const { file, frames } = assetEntryOf(e as never);
    const hit = parseAssetPath(file);
    if (!hit) continue;
    registerCharAsset(assetKey(hit.typeId, hit.mode), 64, 80, frames);
    registered++;
  }
  ok(registered >= 100, "manifest の素材を読み込んだ", `${registered}枚`);

  const adults = ["m_sporty", "m_muscle", "m_student", "m_office", "m_senior", "f_energetic", "f_cool", "f_adult", "f_senior"];
  const wrongAdults = adults.filter((id) => charFacing(id, "walk") !== "left");
  ok(wrongAdults.length === 0, "大人の歩きは左向きの絵として扱う（右へ歩くと反転する）", wrongAdults.join(","));
  ok(flipXFor(charFacing("m_sporty", "walk"), 1), "右へ歩く大人は反転する＝うしろ歩きにならない");
  ok(!flipXFor(charFacing("m_sporty", "walk"), -1), "左へ歩く大人はそのまま");

  const kids = ["b_genki", "b_ottori", "b_yancha", "b_oshare", "b_nakimushi", "g_genki", "g_ottori", "g_yancha", "g_oshare", "g_nakimushi"];
  const wrongKids = kids.filter((id) => charFacing(id, "walk") !== "front");
  ok(wrongKids.length === 0, "幼児・学童の歩きは正面の絵として扱う（反転しない）", wrongKids.join(","));
  ok(!flipXFor(charFacing("g_genki", "walk"), 1) && !flipXFor(charFacing("g_genki", "walk"), -1),
    "幼児はどちらへ歩いても反転しない");

  // 泳ぎ：男性だけ右向きに描かれていて、幼児・学童と女性は左向き（実測）
  ok(charFacing("m_sporty", "swimFree") === "right", "大人・男性の泳ぎは右向きの絵");
  ok(charFacing("f_energetic", "swimFree") === "left", "大人・女性の泳ぎは左向きの絵");
  ok(charFacing("g_genki", "kick") === "left", "幼児・学童の泳ぎは左向きの絵");
  // 右（＋gx）へ泳ぐとき、頭が進行方向を向くか
  ok(!flipXFor(charFacing("m_sporty", "swimFree"), 1), "右へ泳ぐ男性は反転しない（頭から進む）");
  ok(flipXFor(charFacing("g_genki", "kick"), 1), "右へ泳ぐ幼児は反転する（足から進まない）");
  clearCharAssets();
}

// ------------------------------------------------------------------ 2c. コーチの大きさ

head("2c. コーチの大きさ（起動直後に巨大化しないか）");
{
  // コーチの絵はドット絵と解像度が違うので、表示倍率も違う。
  // 毎フレームの sync() が**ドット絵用の倍率**を掛け続けると、
  // 歩き出すまでコーチが数倍の大きさで立ち続ける（実際に起きた不具合）。
  const { scene, sprites } = makeScene();
  sliceCoachSheets(scene);
  ok(coachArtReady(), "偽シートからコーチの絵を切り出せた");

  const home = { gx: 4, gy: 4 };
  const p = new StaffPerson(scene, world, "coach", "st_coach0", home, undefined, { quality: 2, id: 1 });
  const sp = sprites[0];
  const afterBuild = sp.scaleX;
  p.update(1 / 60, 0);
  ok(Math.abs(sp.scaleX - afterBuild) < 0.02, "作った直後と1コマ後で大きさが変わらない", `${afterBuild.toFixed(2)} → ${sp.scaleX.toFixed(2)}`);
  ok(sp.scaleX < CHAR_SCALE * 0.5, "ドット絵用の倍率をそのまま掛けていない", `倍率 ${sp.scaleX.toFixed(2)}`);
  // 背丈＝COACH_TARGET_H におさまっているか（素材の解像度に依らず同じ背丈で出す）
  const shown = sp.height * sp.scaleY;
  ok(shown > COACH_TARGET_H * 0.5 && shown < COACH_TARGET_H * 2, "見た目の背丈が想定内", `${shown.toFixed(0)}px / 目安 ${COACH_TARGET_H.toFixed(0)}px`);
  clearCoachArt();
}

// ------------------------------------------------------------------ 2d. 向きで歩く速さが変わらないか

head("2d. コーチの歩く速さ（向きで画面上の速さが変わらないか）");
{
  // マス速度を一定にすると、画面の左右へ歩くときだけ倍の速さで飛んでいき、
  // 歩幅が足りずに滑って見える。画面上の速さを一定にして、歩幅と噛み合わせる。
  // 体の上下を拾わないよう、足元（グリッド位置）だけで測る
  const speedOf = (from: Waypoint, to: Waypoint): number => {
    const { scene } = makeScene();
    const p = new StaffPerson(scene, world, "coach", "st_coach0", from, undefined, { quality: 2, id: 1 });
    p.goTo([from, to], "toPool", to);
    const at = (): { x: number; y: number } => {
      const g = p.gridPos();
      return isoToWorld(g.gx, g.gy);
    };
    const a = at();
    for (let i = 0; i < 60; i++) p.update(1 / 60, i / 60);
    const b = at();
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  const across = speedOf({ gx: 4, gy: 14 }, { gx: 24, gy: -6 }); // 画面の右へ
  const into = speedOf({ gx: 4, gy: 4 }, { gx: 24, gy: 24 }); // 画面の手前へ
  ok(Math.abs(across - into) < 4, "どの向きへ歩いても画面上の速さは同じ", `${across.toFixed(0)}px/秒 と ${into.toFixed(0)}px/秒`);
  ok(across > 120 && across < 220, "歩く速さが妥当（背丈のおよそ2倍/秒）", `${across.toFixed(0)}px/秒`);
}

// ------------------------------------------------------------------ 2e. 実際に歩かせてコマを見る

head("2e. コーチの足の運び（実際に歩かせて、出したコマを見る）");
{
  const { scene, sprites } = makeScene();
  sliceCoachSheets(scene);
  const home = { gx: 4, gy: 14 };
  const p = new StaffPerson(scene, world, "coach", "st_coach0", home, undefined, { quality: 2, id: 1 });
  const sp = sprites[0];
  sp.frameCount = 3; // 通常コーチの歩行は3コマ
  sp.frameLog.length = 0;
  const dest = { gx: 24, gy: -6 };
  p.goTo([home, dest], "toPool", dest);
  for (let i = 0; i < 120; i++) p.update(1 / 60, i / 60); // 2秒ぶん

  // 連続する同じコマを潰した「出した順」
  const seq = sp.frameLog.filter((v, i, a) => i === 0 || v !== a[i - 1]);
  ok(seq.length >= 8, "歩いているあいだコマが送られている", `${seq.length}回コマが替わった`);
  ok(new Set(seq).size === 3, "3コマすべてを使っている", `使ったコマ ${[...new Set(seq)].sort().join(",")}`);
  // 0→2 のように飛ぶと足が入れ替わらず、その場で跳ねているように見える
  const jump = seq.findIndex((v, i) => i > 0 && Math.abs(v - seq[i - 1]) !== 1);
  ok(jump < 0, "コマは隣どうしを行き来する（0→2 と飛ばない）", jump < 0 ? "" : `${seq.slice(0, 8).join("→")}`);
  ok(seq.slice(0, 8).join("") !== "01201201", "1コマ＝1歩の送り方に戻っていない", seq.slice(0, 8).join("→"));
  clearCoachArt();
}

// ------------------------------------------------------------------ 3〜5. 実際に歩かせる

/** 1フレームぶん進めて、画面上の位置を記録する。 */
function runPerson(
  p: Person,
  sp: FakeSprite,
  seconds: number,
  dt = 1 / 60,
): { jumps: number[]; texAt: (label: string) => string } {
  const jumps: number[] = [];
  // 【足元で測る】絵の大きさや原点は姿で変わる（立ち姿＝足元／泳ぎ＝水面、
  // 陸だけ LAND_CHAR_SCALE で縮む）ので、スプライトの座標で測ると
  // 姿が替わっただけで「飛んだ」ことになってしまう。
  // 知りたいのは**床の上をワープしていないか**なので、グリッド位置を画面座標に直して測る。
  const at = (): { x: number; y: number } => {
    const g = p.gridPos();
    return isoToWorld(g.gx, g.gy);
  };
  let prev = at();
  let first = true;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    p.update(dt, i * dt);
    const now = at();
    if (!first) jumps.push(Math.hypot(now.x - prev.x, now.y - prev.y));
    first = false;
    prev = now;
    if (p.done) break;
  }
  void sp;
  return { jumps, texAt: () => sp.texture.key };
}

head("3. 更衣室で着替える（私服のままプールに入らないか）");
{
  const { scene, sprites } = makeScene();
  const s = student(1, "高1"); // 高校生＝大人の体型
  const variant = variantForGender("m", 1);
  const typeId = charTypeOf("teen", variant).id;
  void typeId;
  // 外 → 入口 → 更衣室（ここで着替える）→ 飛び込み台
  const route: Waypoint[] = [
    { gx: 0, gy: 8 },
    { gx: 2, gy: 8 },
    { gx: 4, gy: 8, change: "suit" },
    { gx: 6, gy: 6 },
    { gx: 6, gy: 3 },
  ];
  const p = new Person(scene, world, s, { route, swim: { axis: "gx", s0: 6.4, s1: 12, at: 3 } }, 0, () => undefined);
  const sp = sprites[0];
  ok(sp.texture.key === charKey("walk", "teen", variant), "出てきた直後は私服");

  runPerson(p, sp, 3);
  const suitKey = charKey("suit", "teen", variant);
  const swimKeys = ["swim", "swimFree", "swimBreast", "swimBack", "swimFly", "dive"].map((m) =>
    charKey(m as never, "teen", variant),
  );
  ok(
    sp.texture.key === suitKey || swimKeys.includes(sp.texture.key),
    "プールに入った時点で水着／飛び込み／泳ぎの姿になっている",
    sp.texture.key,
  );
  ok(sp.texture.key !== charKey("walk", "teen", variant), "私服のまま泳いでいない");

  // 更衣室を通らない道順だと私服のまま（＝ change を無視していない証拠）
  const { scene: sc2, sprites: sp2 } = makeScene();
  const p2 = new Person(
    sc2,
    world,
    student(2, "高1"),
    { route: [{ gx: 0, gy: 8 }, { gx: 6, gy: 6 }], swim: undefined },
    0,
    () => undefined,
  );
  runPerson(p2, sp2[0], 3);
  ok(sp2[0].texture.key.includes("walk"), "更衣室を通らなければ私服のまま（着替えは道順で決まる）");
}

head("3b. 一般客も更衣室で着替える");
{
  const { scene, sprites } = makeScene();
  const route: Waypoint[] = [
    { gx: 0, gy: 8 },
    { gx: 3, gy: 8, change: "suit" },
    { gx: 7, gy: 4 },
  ];
  const exit: Waypoint[] = [
    { gx: 7, gy: 4 },
    { gx: 3, gy: 8, change: "street" },
    { gx: 0, gy: 8 },
  ];
  const v = new Visitor(scene, world, {
    stops: [{ route, staySec: 1.0, purpose: "pool" }],
    exit,
    roomId: 1,
    turnedAway: false,
    crowded: false,
    grade: 1,
  });
  const sp = sprites[0];
  const walkKeys = [charKey("walk", "guest", v.variant), charKey("walkBack", "guest", v.variant)];
  ok(walkKeys.includes(sp.texture.key), "来場した直後は私服");

  for (let i = 0; i < 180; i++) v.update(1 / 60, i / 60);
  ok(
    !walkKeys.includes(sp.texture.key),
    "更衣室を通ったら水着になっている（私服でプールに入らない）",
    sp.texture.key,
  );

  // 滞在が終われば私服に戻って帰る
  for (let i = 0; i < 400; i++) v.update(1 / 60, i / 60);
  ok(walkKeys.includes(sp.texture.key) || v.done, "帰りは更衣室で私服に戻る", sp.texture.key);
}

head("4. 入水（急にプールサイドへ飛ばないか）");
{
  const { scene, sprites } = makeScene();
  // 飛び込み台（レーンの左端）まで歩いてから入水する道順
  const route: Waypoint[] = [
    { gx: 0, gy: 8 },
    { gx: 6, gy: 8 },
    { gx: 6.1, gy: 7 },
    { gx: 6.1, gy: 3.5 },
  ];
  const p = new Person(
    scene,
    world,
    student(3, "高1"),
    { route, swim: { axis: "gx", s0: 6.4, s1: 14, at: 3.5 } },
    0,
    () => undefined,
  );
  const sp = sprites[0];
  const { jumps } = runPerson(p, sp, 8);
  const max = Math.max(...jumps);
  // 歩き 3.6グリッド/秒 ＝ 1フレームで 0.06グリッド。画面では 4px 弱にしかならない
  ok(max < 10, "1フレームで大きく飛ばない（瞬間移動しない）", `最大 ${max.toFixed(1)}px/フレーム`);

  // 泳ぎ出したら、レーンの中を端から端まで往復している
  const xs: number[] = [];
  for (let i = 0; i < 600; i++) {
    p.update(1 / 60, i / 60);
    xs.push(p.worldPos().x);
  }
  const swimSpan = Math.max(...xs) - Math.min(...xs);
  ok(swimSpan > 100, "レーンの中を泳いで往復している", `${swimSpan.toFixed(0)}px`);
  const laneLeft = isoToWorld(6.4, 3.5).x;
  const laneRight = isoToWorld(14, 3.5).x;
  ok(
    Math.min(...xs) >= Math.min(laneLeft, laneRight) - 2 && Math.max(...xs) <= Math.max(laneLeft, laneRight) + 2,
    "レーンからはみ出さない",
  );
}

head("4c. 回したプールでは縦に泳ぐ（レーンの向きに沿う）");
{
  const { scene, sprites } = makeScene();
  // 回したプール：レーンは gy の向き（画面の右上↔左下）に走る
  const route: Waypoint[] = [
    { gx: 0, gy: 8 },
    { gx: 3.5, gy: 8 },
    { gx: 3.5, gy: 6.1 },
  ];
  const p = new Person(
    scene,
    world,
    student(5, "高1"),
    { route, swim: { axis: "gy", s0: 2, s1: 6, at: 3.5 } },
    0,
    () => undefined,
  );
  runPerson(p, sprites[0], 8);
  const cells: { gx: number; gy: number }[] = [];
  let agree = 0;
  let disagree = 0;
  let prevX = p.worldPos().x;
  for (let i = 0; i < 900; i++) {
    const face = p.debugFacing().sdx; // 動く前の向き（折り返しのコマで食い違わないように）
    p.update(1 / 60, i / 60);
    cells.push(p.gridPos());
    const x = p.worldPos().x;
    const dx = x - prevX;
    prevX = x;
    if (Math.abs(dx) < 0.3) continue;
    if (Math.sign(dx) === face) agree++;
    else disagree++;
  }
  const gxs = cells.map((c) => c.gx);
  const gys = cells.map((c) => c.gy);
  ok(Math.max(...gxs) - Math.min(...gxs) < 0.05, "泳いでいる間は横（gx）にずれない", `${(Math.max(...gxs) - Math.min(...gxs)).toFixed(3)}`);
  ok(Math.max(...gys) - Math.min(...gys) > 2, "縦（gy）に往復している", `${(Math.max(...gys) - Math.min(...gys)).toFixed(1)}マス`);
  ok(Math.min(...gys) >= 2 - 0.01 && Math.max(...gys) <= 6 + 0.01, "レーンからはみ出さない");
  ok(agree > 0 && disagree === 0, "画面の左右の向きが泳ぐ向きと一致する（回したプールは左右が逆）", `一致${agree}／不一致${disagree}`);
}

head("5. 退場（勝手に消えないか）");
{
  const { scene, sprites } = makeScene();
  const p = new Person(
    scene,
    world,
    student(4, "高1"),
    { route: [{ gx: 0, gy: 8 }, { gx: 6, gy: 6 }] },
    0,
    () => undefined,
  );
  const sp = sprites[0];
  runPerson(p, sp, 3);
  ok(!p.done, "目的地に着いても消えない（練習しながら待つ）");
  ok(!p.leaving, "まだ帰り道ではない");

  p.leave([
    { gx: 6, gy: 6 },
    { gx: 2, gy: 8 },
    { gx: 0, gy: 9 },
  ]);
  ok(p.leaving && !p.done, "帰り始めた時点ではまだ画面にいる");
  let frames = 0;
  for (let i = 0; i < 600 && !p.done; i++) {
    p.update(1 / 60, i / 60);
    frames++;
  }
  ok(p.done, "帰り道を歩き切ってから消える");
  ok(frames > 30, "消えるまでに歩いている（その場で消えない）", `${frames}フレーム`);

  // 帰り道が空でも、その場で静かに消えるだけ（例外にならない）
  const { scene: sc2, sprites: sp2 } = makeScene();
  const p2 = new Person(sc2, world, student(5, "高1"), { route: [{ gx: 1, gy: 1 }] }, 0, () => undefined);
  p2.leave([]);
  for (let i = 0; i < 10; i++) p2.update(1 / 60, i / 60);
  ok(p2.done, "帰り道が無いときも例外にならない");
  void sp2;
}

head("6. 歩いている人が実際に上下しているか（通しで確認）");
{
  const { scene, sprites } = makeScene();
  const p = new Person(
    scene,
    world,
    student(6, "高1"),
    { route: [{ gx: 0, gy: 8 }, { gx: 12, gy: 8 }] },
    0,
    () => undefined,
  );
  const sp = sprites[0];
  const offs: number[] = [];
  for (let i = 0; i < 120; i++) {
    p.update(1 / 60, i / 60);
    const g = p.gridPos();
    offs.push(sp.y - isoToWorld(g.gx, g.gy).y);
  }
  const span = Math.max(...offs) - Math.min(...offs);
  ok(span > 1.5, "歩いているあいだ、体が上下している", `振れ幅 ${span.toFixed(2)}px`);
  const rots = new Set(offs.map(() => Math.round(sp.rotation * 1000)));
  ok(rots.size >= 1, "体の傾きも付いている");
}


head("7. 一般客が自分の予定どおりに動く（受付→施設→売店→帰る）");
{
  const { scene, sprites } = makeScene();
  // 目的の部屋（プール）→ 売店 → 帰る、の3段の予定
  const toPool: Waypoint[] = [
    { gx: 0, gy: 8 },
    { gx: 3, gy: 8 },
    { gx: 7, gy: 4 },
  ];
  const toShop: Waypoint[] = [
    { gx: 7, gy: 4 },
    { gx: 7, gy: 8 },
    { gx: 10, gy: 8 },
  ];
  const exit: Waypoint[] = [
    { gx: 10, gy: 8 },
    { gx: 3, gy: 8 },
    { gx: 0, gy: 8 },
  ];
  const v = new Visitor(scene, world, {
    stops: [
      { route: toPool, staySec: 0.5, purpose: "pool" },
      { route: toShop, staySec: 0.5, purpose: "shop" },
    ],
    exit,
    roomId: 1,
    turnedAway: false,
    crowded: false,
    grade: 2,
  });
  const sp = sprites[0];
  ok(v.hasExtraStop, "売店に寄る予定を持っている");

  // 1か所目に着くまで
  const seen = new Set<string>();
  let reachedShop = false;
  let satisfiedOnce = false;
  for (let i = 0; i < 1200 && !v.done; i++) {
    v.update(1 / 60, i / 60);
    if (v.takeSatisfied()) satisfiedOnce = true;
    const a = v.activity;
    if (a) seen.add(a);
    const g = v.gridPos();
    if (Math.abs(g.gx - 10) < 0.2 && Math.abs(g.gy - 8) < 0.2) reachedShop = true;
  }
  ok(satisfiedOnce, "1か所目に着いたところで満足の演出が1回だけ出る");
  ok(reachedShop, "目的の部屋のあと、売店まで歩いて行く");
  ok(seen.has("meal"), "売店では食べている言葉になる", [...seen].join("/"));
  ok(seen.has("leave"), "帰り道では「また来よう」側の言葉になる");
  ok(v.done, "最後は敷地の外まで帰り着いて消える");
  void sp;
}

head("8. 帰り始めた瞬間に貢献値を出せる（1回だけ）");
{
  const { scene } = makeScene();
  const route: Waypoint[] = [
    { gx: 0, gy: 8 },
    { gx: 5, gy: 8 },
  ];
  const exit: Waypoint[] = [
    { gx: 5, gy: 8 },
    { gx: 0, gy: 8 },
  ];
  const v = new Visitor(scene, world, {
    stops: [{ route, staySec: 0.4, purpose: "gym" }],
    exit,
    roomId: 1,
    turnedAway: false,
    crowded: false,
    grade: 1,
  });
  let departed = 0;
  for (let i = 0; i < 900 && !v.done; i++) {
    v.update(1 / 60, i / 60);
    if (v.takeDeparted()) departed += 1;
  }
  ok(departed === 1, "帰り始めた合図はちょうど1回", `${departed}回`);

  // 入れずに帰る客は貢献しない
  const { scene: sc2 } = makeScene();
  const away = new Visitor(sc2, world, {
    stops: [{ route, staySec: 0.4, purpose: "turnedAway" }],
    exit,
    roomId: 1,
    turnedAway: true,
    crowded: false,
    grade: 1,
  });
  let awayDeparted = 0;
  for (let i = 0; i < 900 && !away.done; i++) {
    away.update(1 / 60, i / 60);
    if (away.takeDeparted()) awayDeparted += 1;
  }
  ok(awayDeparted === 0, "入れずに帰る客は貢献値を出さない");
}

head("9. 全員が同じ動きにならない（速さのばらつき・立ち止まる間）");
{
  // 同じ道順・同じ時間だけ動かして、着いた位置がばらつくか
  const positions: number[] = [];
  for (let n = 0; n < 24; n++) {
    const { scene } = makeScene();
    const v = new Visitor(scene, world, {
      stops: [
        {
          route: [
            { gx: 0, gy: 8 },
            { gx: 4, gy: 8 },
            { gx: 8, gy: 8 },
            { gx: 12, gy: 8 },
          ],
          staySec: 99,
          purpose: "gym",
        },
      ],
      exit: [{ gx: 12, gy: 8 }],
      roomId: 1,
      turnedAway: false,
      crowded: false,
      grade: 1,
    });
    for (let i = 0; i < 90; i++) v.update(1 / 60, i / 60);
    positions.push(v.gridPos().gx);
  }
  const spread = Math.max(...positions) - Math.min(...positions);
  ok(spread > 0.2, "同時に出発しても、進み具合がばらつく", `ひらき ${spread.toFixed(2)}マス`);

  // 選手も同じ（歩く速さのばらつき＋曲がり角で立ち止まる）
  const ends: number[] = [];
  for (let n = 0; n < 24; n++) {
    const { scene } = makeScene();
    const p = new Person(
      scene,
      world,
      student(100 + n, "高1"),
      {
        route: [
          { gx: 0, gy: 8 },
          { gx: 4, gy: 8 },
          { gx: 8, gy: 8 },
          { gx: 12, gy: 8 },
        ],
      },
      0,
      () => undefined,
    );
    for (let i = 0; i < 90; i++) p.update(1 / 60, i / 60);
    ends.push(p.gridPos().gx);
  }
  const spread2 = Math.max(...ends) - Math.min(...ends);
  ok(spread2 > 0.2, "選手も1人ずつ進み具合が違う", `ひらき ${spread2.toFixed(2)}マス`);
}

// ------------------------------------------------------------------ 10. 人が重ならない

head("10. コーチが重ならない（立ち位置が画面上で離れているか）");
{
  // 【元の不具合】立ち位置をずらす向きが (+0.28, +0.22) だった。
  // 等角では 画面X ∝ gx-gy なので、gx と gy を**同じ向き**に動かすと
  // 画面上ではほぼ真下（横に3px）にしか動かない ＝ 人がほとんど重なる。
  const room: Equipment = { id: 1, kind: "coachroom", gx: 6, gy: 6, grade: 1 } as Equipment;
  // 画面上でいちばん近い2人の距離（px）
  const closest = (cells: { gx: number; gy: number }[]): number => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = isoToWorld(cells[i].gx, cells[i].gy);
        const b = isoToWorld(cells[j].gx, cells[j].gy);
        best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    return best;
  };
  // コーチの見た目の幅はおよそ 40px。これより離れていれば「並んで立っている」に見える
  const NEED = 28;
  for (const n of [2, 3, 4, 6]) {
    const cells = standCellsOf(room, n);
    ok(cells.length === n, `${n}人ぶんの立ち位置が返る`, `${cells.length}箇所`);
    const d = closest(cells);
    ok(d >= NEED, `${n}人でも画面上で ${NEED}px 以上離れている`, `いちばん近い2人 ${d.toFixed(0)}px`);
  }
  // 深度（描画順）も人ごとに違う＝重なったときにちらつかない
  const six = standCellsOf(room, 6);
  const depths = new Set(six.map((c) => (c.gx + c.gy).toFixed(3)));
  ok(depths.size === six.length, "描画順（gx+gy）が全員ちがう", `${depths.size}/${six.length}`);
}

line();
line(fail === 0 ? `全て通過  （${pass}/${pass}）` : `${fail}件のNG（${pass}件は通過）`);
process.exit(fail === 0 ? 0 : 1);
