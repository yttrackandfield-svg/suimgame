/// <reference types="node" />
/**
 * キャラのドット絵（幼児・学童・中高生・大人・一般客）の検証とプレビュー。
 *
 * gfx/charSprites.ts は Phaser 非依存なので、描画命令を記録する偽の Graphics を
 * 渡せばヘッドレスでも絵を組み立てられる。
 *   1) 「見分けが付くか」を数値で確かめる（背丈・目印・色）
 *   2) 同じ描画命令から SVG を書き出して、ブラウザ無しで目で見る
 *
 * 実行:
 *   npx esbuild charcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs
 *   node <tmp>.mjs [出力先.html]
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  BODY,
  BODY_LABEL,
  CHAR_BODIES,
  CHAR_VARIANTS,
  KID_CAP,
  SWIM_H,
  bodyForStage,
  charKey,
  charSize,
  drawChar,
  drawStaff,
  staffKey,
  staffVariantCount,
  STAFF_LOOKS,
  type CharBody,
  type CharGraphics,
  type CharMode,
  type StaffLook,
} from "./src/gfx/charSprites";
import { lifeStageOf } from "./src/sim/growth";
import { charAssetScale } from "./src/gfx/charAssets";
import { CHAR_SCALE, LAND_CHAR_SCALE } from "./src/config";
import { KID_TYPES, charTypeOf, variantForGender } from "./src/gfx/charTypes";

// ------------------------------------------------------------------ 記録用の Graphics

type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; color: number; alpha: number }
  | { kind: "circle"; x: number; y: number; r: number; color: number; alpha: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number; color: number; alpha: number };

/** Phaser の Graphics のうち、キャラの描画で使うぶんだけを記録する。 */
class Recorder implements CharGraphics {
  shapes: Shape[] = [];
  private color = 0xffffff;
  private alpha = 1;

  clear(): this {
    this.shapes = [];
    return this;
  }
  fillStyle(color: number, alpha = 1): this {
    this.color = color;
    this.alpha = alpha;
    return this;
  }
  fillRect(x: number, y: number, w: number, h: number): this {
    this.shapes.push({ kind: "rect", x, y, w, h, r: 0, color: this.color, alpha: this.alpha });
    return this;
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number | object = 0): this {
    this.shapes.push({
      kind: "rect", x, y, w, h,
      r: typeof r === "number" ? r : 0,
      color: this.color, alpha: this.alpha,
    });
    return this;
  }
  fillCircle(x: number, y: number, r: number): this {
    this.shapes.push({ kind: "circle", x, y, r, color: this.color, alpha: this.alpha });
    return this;
  }
  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.shapes.push({ kind: "ellipse", x, y, w, h, color: this.color, alpha: this.alpha });
    return this;
  }
}

function record(mode: CharMode, body: CharBody, variant: number): Shape[] {
  const g = new Recorder();
  drawChar(g, mode, body, variant);
  return g.shapes;
}

/** その絵に使われている色（透けている影を除く）。 */
function colorsOf(shapes: Shape[]): Set<number> {
  return new Set(shapes.filter((s) => s.alpha > 0.5).map((s) => s.color));
}

/** はみ出していないか（テクスチャの外に描いていないか）。 */
function overflowOf(shapes: Shape[], w: number, h: number): number {
  let worst = 0;
  for (const s of shapes) {
    const box =
      s.kind === "circle"
        ? { x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r }
        : s.kind === "ellipse"
          ? { x0: s.x - s.w / 2, y0: s.y - s.h / 2, x1: s.x + s.w / 2, y1: s.y + s.h / 2 }
          : { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
    worst = Math.max(worst, -box.x0, -box.y0, box.x1 - w, box.y1 - h);
  }
  return Math.round(worst * 100) / 100;
}

// ------------------------------------------------------------------ 検証

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

head("1. 学年から体型が決まる");
{
  ok(bodyForStage(lifeStageOf("年少")) === "kid", "年少は幼児の体型");
  ok(bodyForStage(lifeStageOf("年長")) === "kid", "年長も幼児の体型");
  ok(bodyForStage(lifeStageOf("小1")) === "child", "小1は学童の体型");
  ok(bodyForStage(lifeStageOf("小6")) === "child", "小6も学童の体型");
  ok(bodyForStage(lifeStageOf("中1")) === "teen", "中1は中高生の体型");
  ok(bodyForStage(lifeStageOf("高3")) === "teen", "高3も中高生の体型");
  ok(bodyForStage(lifeStageOf("大1")) === "adult", "大学生は大人の体型");
  ok(bodyForStage(lifeStageOf("社会人")) === "adult", "社会人も大人の体型");
}

head("2. 背丈で見分けが付く");
{
  const h = (b: CharBody): number => BODY[b].h;
  ok(h("kid") < h("child"), "幼児 < 学童", `${h("kid")} < ${h("child")}px`);
  ok(h("child") < h("teen"), "学童 < 中高生", `${h("child")} < ${h("teen")}px`);
  ok(h("teen") < h("adult"), "中高生 < 大人", `${h("teen")} < ${h("adult")}px`);
  // 3px 差だと 3倍表示（CHAR_SCALE=3.0）で 9px の差になる＝遠目でも分かる
  ok(h("child") - h("kid") >= 3, "幼児と学童の差は3px以上（表示で9px以上）", `${h("child") - h("kid")}px`);
  ok(h("teen") - h("child") >= 3, "学童と中高生の差は3px以上", `${h("teen") - h("child")}px`);

  // 頭身（頭が大きいほど幼く見える）
  const ratio = (b: CharBody): number => Math.round((BODY[b].h / (BODY[b].headR * 2)) * 10) / 10;
  ok(ratio("kid") < ratio("child"), "幼児がいちばん頭でっかち", `幼児 ${ratio("kid")}頭身 / 学童 ${ratio("child")}頭身`);
  ok(ratio("teen") > ratio("child"), "中高生はすらっとしている", `${ratio("teen")}頭身`);

  // 泳いでいるときも体の長さで分かる
  ok(BODY.kid.swimLen < BODY.child.swimLen, "泳ぐ姿も幼児がいちばん短い", `${BODY.kid.swimLen} < ${BODY.child.swimLen}`);
  ok(BODY.child.swimLen < BODY.teen.swimLen, "学童 < 中高生（泳ぐ姿）", `${BODY.child.swimLen} < ${BODY.teen.swimLen}`);
}

head("3. 体型ごとの目印");
{
  // 幼児＝黄色い通園帽（私服でも水着でも黄色い）
  ok(colorsOf(record("walk", "kid", 0)).has(KID_CAP), "幼児は私服のとき黄色い帽子をかぶる");
  ok(colorsOf(record("suit", "kid", 0)).has(KID_CAP), "水着に着替えても帽子は黄色い");
  ok(colorsOf(record("swim", "kid", 0)).has(KID_CAP), "泳いでいるときも黄色い帽子で分かる");
  for (const b of ["child", "teen", "adult"] as const) {
    ok(!colorsOf(record("walk", b, 0)).has(KID_CAP), `${BODY_LABEL[b]}は黄色い帽子をかぶらない`);
  }

  // 学童＝ランドセルの肩ひも（胴の上に縦2本）
  const childShapes = record("walk", "child", 0);
  const straps = childShapes.filter((s) => s.kind === "rect" && s.w <= 2 && s.h >= BODY.child.torsoH - 0.1);
  ok(straps.length >= 2, "学童はランドセルの肩ひもが2本ある", `${straps.length}本`);
  const teenStraps = record("walk", "teen", 0).filter(
    (s) => s.kind === "rect" && s.w <= 2 && s.h >= BODY.teen.torsoH - 0.1,
  );
  ok(teenStraps.length < 2, "中高生には肩ひもが無い", `${teenStraps.length}本`);

  // 一般客＝手さげカバン（体の右側にはみ出す）
  const guest = record("walk", "guest", 0);
  const cx = BODY.guest.w / 2;
  const bag = guest.filter((s) => s.kind === "rect" && s.x > cx + BODY.guest.torsoW / 2);
  ok(bag.length >= 2, "一般客は体の外側にカバンを提げている", `${bag.length}パーツ`);
  const teenOutside = record("walk", "teen", 0).filter(
    (s) => s.kind === "rect" && s.x > BODY.teen.w / 2 + BODY.teen.torsoW / 2,
  );
  ok(teenOutside.length === 0, "生徒はカバンを持たない");

  /**
   * 【方針が変わったところ】以前は「一般客の服はくすんだ色」で生徒と区別していた。
   * いまは一般客も**素材シートの10タイプ（男女5ずつ・シニア込み）から選ぶ**ので、
   * 派手な色の客も来る。区別は色ではなく**シルエット**（手さげカバンと丈の長い上着）で付ける
   * ＝上のカバンの検査が、その役目を引き継いでいる。
   *
   * そのかわり「顔ぶれが多様であること」をここで見る。
   * 同じ色の客ばかりが並ぶと、館内が閑散として見えてしまう。
   */
  const shirtOf = (b: CharBody, k: number): number => {
    const shapes = record("walk", b, k);
    const torso = shapes.filter((s) => s.kind === "rect" && s.r === 2 && s.w >= BODY[b].torsoW - 0.1);
    return torso[0]?.color ?? 0;
  };
  for (const b of ["guest", "kid", "teen"] as CharBody[]) {
    const colors = new Set<number>();
    for (let k = 0; k < CHAR_VARIANTS; k++) colors.add(shirtOf(b, k));
    ok(colors.size >= 6, `${BODY_LABEL[b]}は服の色が何種類もある（並んでも同じ人に見えない）`, `${colors.size}色`);
  }
  // 幼児は明るい色（スクールの子だと遠目に分かる）
  const bright = (c: number): number => (((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff)) / 3;
  let kidBrightMin = 255;
  for (let k = 0; k < CHAR_VARIANTS; k++) kidBrightMin = Math.min(kidBrightMin, bright(shirtOf("kid", k)));
  ok(kidBrightMin > 120, "幼児の服は明るい色でそろえてある", `いちばん暗い色でも ${Math.round(kidBrightMin)}`);
}

head("4. テクスチャの寸法");
{
  for (const body of CHAR_BODIES) {
    const modes: CharMode[] = body === "guest" ? ["walk", "suit"] : ["walk", "suit", "swim"];
    for (const mode of modes) {
      const { w, h } = charSize(mode, body);
      const over = overflowOf(record(mode, body, 0), w, h);
      ok(over <= 1.0, `${BODY_LABEL[body]}の${mode}が枠に収まる`, `はみ出し ${over}px（${w}x${h}）`);
    }
  }
  // 泳ぎは全員同じ大きさ（原点 SWIM_ORIGIN を共有するため）
  const sizes = new Set(CHAR_BODIES.filter((b) => b !== "guest").map((b) => JSON.stringify(charSize("swim", b))));
  ok(sizes.size === 1, "泳ぎのテクスチャは体型が違っても同じ大きさ", [...sizes][0]);

  // キーが衝突しない
  const keys = new Set<string>();
  let dup = 0;
  for (const body of CHAR_BODIES) {
    for (let k = 0; k < CHAR_VARIANTS; k++) {
      for (const mode of ["walk", "suit", "swim"] as CharMode[]) {
        const key = charKey(mode, body, k);
        if (keys.has(key)) dup++;
        keys.add(key);
      }
    }
  }
  ok(dup === 0, "テクスチャキーが重複しない", `${keys.size}種`);
}

head("5. 職員のユニフォームと個人の描き分け");
{
  const staffShapes = (look: StaffLook, k: number): Shape[] => {
    const g = new Recorder();
    drawStaff(g, look, k, 0x22303c);
    return g.shapes;
  };

  // 役割ごとのユニフォーム＝その役割にだけある目印
  const hasColor = (sh: Shape[], c: number): boolean => sh.some((s) => s.color === c && s.alpha > 0.5);
  const white = (sh: Shape[]): number => sh.filter((s) => s.color === 0xf4f7f9 || s.color === 0xffffff).length;

  ok(
    every("nutritionist", (sh) => white(sh) >= 2),
    "栄養士は白いコックコート（白い部分が多い）",
  );
  ok(
    every("doctor", (sh) => white(sh) >= 2 && hasColor(sh, 0x455a64)),
    "ドクターは白衣＋聴診器",
  );
  ok(
    every("coach", (sh) => !hasColor(sh, 0x455a64)),
    "コーチは聴診器を持たない（役割が混ざらない）",
  );
  ok(
    staffShapes("coach", 0).some((s) => s.color === 0xf7dc6f),
    "コーチはホイッスルを下げている人がいる",
  );
  ok(
    every("reception", (sh) => hasColor(sh, 0x1f8b6e)),
    "受付は緑の制服",
  );
  ok(
    every("coach", (sh) => !hasColor(sh, 0x1f8b6e)),
    "コーチは受付の制服を着ない",
  );

  function every(look: StaffLook, fn: (sh: Shape[]) => boolean): boolean {
    for (let k = 0; k < staffVariantCount(look); k++) if (!fn(staffShapes(look, k))) return false;
    return true;
  }

  // 個人の描き分け：どの2人を並べても、絵として違う
  for (const look of STAFF_LOOKS) {
    const n = staffVariantCount(look);
    const sigs = Array.from({ length: n }, (_, k) =>
      staffShapes(look, k)
        .map((s) => `${s.kind}${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.w)},${Math.round(s.h)},${s.color}`)
        .join("|"),
    );
    ok(new Set(sigs).size === n, `${look}：${n}人ぶんの見た目がすべて違う`, `${new Set(sigs).size}/${n}`);

    // 色だけでなく「形」が違うこと（帽子・髪型・ひげ・メガネ）。
    // 色だけの違いだと、小さく表示したときに見分けが付かない。
    const shapes = Array.from({ length: n }, (_, k) =>
      staffShapes(look, k)
        .map((s) => `${s.kind}${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.w)},${Math.round(s.h)}`)
        .join("|"),
    );
    ok(
      new Set(shapes).size === n,
      `${look}：形（帽子・髪型・ひげ・メガネ）でも見分けが付く`,
      `${new Set(shapes).size}/${n}`,
    );
  }

  ok(staffVariantCount("coach") >= 12, "コーチの見た目は12種類以上", `${staffVariantCount("coach")}種`);

  // ID から見た目が決まる（同じ人はいつも同じ姿）
  ok(staffKey("coach", 3) === staffKey("coach", 3 + staffVariantCount("coach")), "IDから決まる（周期する）");
  ok(staffKey("coach", 1) !== staffKey("doctor", 1), "役割が違えば別のテクスチャ");
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);

// ------------------------------------------------------------------ プレビュー（HTML）

/**
 * 記録した描画命令をそのまま SVG にして、1枚の「体格表」に組む。
 * ゲーム本体と同じ関数から描いているので、ここで見た形がそのまま画面に出る。
 *
 * この資料自体のデザイン方針:
 *   色   … プールのタイル（淡い青灰）を地に、レーンの青を1つだけ差し色に。
 *          もう1色は幼児の帽子の黄＝スプライトの絵から直接持ってきた色。
 *   文字 … 見出しは字間を詰めた太字、寸法や記号は等幅（ドット絵の格子と揃う）。
 *   構成 … 主役は「身長計」。3ドットきざみの目盛りの前に全員を足元をそろえて並べ、
 *          背丈の差がひと目で分かるようにする（この改修の目的そのもの）。
 */

const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

function svgShapes(shapes: Shape[], w: number, h: number, tall: number, zoom: number, label: string): string {
  const parts = shapes.map((s) => {
    const fill = `fill="${hex(s.color)}"${s.alpha < 1 ? ` fill-opacity="${s.alpha}"` : ""}`;
    if (s.kind === "circle") return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" ${fill}/>`;
    if (s.kind === "ellipse") return `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.w / 2}" ry="${s.h / 2}" ${fill}/>`;
    return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" ${fill}/>`;
  });
  return (
    `<svg width="${w * zoom}" height="${tall * zoom}" viewBox="0 ${h - tall} ${w} ${tall}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${label}">${parts.join("")}</svg>`
  );
}

function svgOf(mode: CharMode, body: CharBody, variant: number, zoom: number): string {
  const { w, h } = charSize(mode, body);
  const parts = record(mode, body, variant).map((s) => {
    const fill = `fill="${hex(s.color)}"${s.alpha < 1 ? ` fill-opacity="${s.alpha}"` : ""}`;
    if (s.kind === "circle") return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" ${fill}/>`;
    if (s.kind === "ellipse") return `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.w / 2}" ry="${s.h / 2}" ${fill}/>`;
    return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" ${fill}/>`;
  });
  // 立ち姿は下端＝足元。並べたとき足元がそろうよう、いちばん背の高い絵に高さを合わせる。
  const tall = mode === "swim" ? h : BODY.adult.h;
  return (
    `<svg width="${w * zoom}" height="${tall * zoom}" viewBox="0 ${h - tall} ${w} ${tall}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${BODY_LABEL[body]}">${parts.join("")}</svg>`
  );
}

const Z = 6;
const GRID = 3; // 目盛りのきざみ（ドット）

/** 体格表（身長計）。全員を足元でそろえ、背の順に並べる。 */
function heightChart(): string {
  const order: CharBody[] = ["kid", "child", "teen", "adult", "guest"];
  const cells = order
    .map(
      (b) => `<div class="stand">
        ${svgOf("walk", b, b === "guest" ? 1 : 0, Z)}
        <div class="tag"><b>${BODY_LABEL[b]}</b><span class="mono">${BODY[b].h}px</span></div>
      </div>`,
    )
    .join("");
  return `<div class="chart" style="--grid-step:${GRID * Z}px">${cells}</div>`;
}

/** 形態ごとの一覧（6色ぶん）。 */
function strip(mode: CharMode, bodies: readonly CharBody[], water = false): string {
  return bodies
    .map((b) => {
      const size = charSize(mode, b);
      const sprites = Array.from({ length: CHAR_VARIANTS }, (_, k) => svgOf(mode, b, k, Z)).join("");
      return `<figure class="card">
        <div class="sprites${water ? " water" : ""}">${sprites}</div>
        <figcaption><b>${BODY_LABEL[b]}</b><span class="mono">${size.w}×${size.h}</span></figcaption>
      </figure>`;
    })
    .join("");
}

/** 職員（役割ごとに1列）。 */
const STAFF_LABEL: Record<StaffLook, string> = {
  coach: "コーチ",
  reception: "受付",
  nutritionist: "栄養士",
  doctor: "ドクター",
};
const STAFF_NOTE: Record<StaffLook, string> = {
  coach: "ポロシャツ＋ジャージ。ホイッスル・キャップ",
  reception: "緑の制服＋名札",
  nutritionist: "白いコックコート＋コック帽（おたま）",
  doctor: "白衣＋聴診器",
};

function staffStrip(look: StaffLook): string {
  const n = staffVariantCount(look);
  const sprites = Array.from({ length: n }, (_, k) => {
    const g = new Recorder();
    drawStaff(g, look, k, 0x22303c);
    return svgShapes(g.shapes, 20, 33, 33, Z, `${STAFF_LABEL[look]}${k}`);
  }).join("");
  return `<figure class="card">
    <div class="sprites">${sprites}</div>
    <figcaption><b>${STAFF_LABEL[look]}</b><span class="mono">${n}種</span><span class="note-inline">${STAFF_NOTE[look]}</span></figcaption>
  </figure>`;
}

const marks = [
  { who: "幼児", klass: "幼児クラス（年少〜年長）", height: `${BODY.kid.h}px・2頭身`, mark: "黄色い通園帽（水着でも泳ぎでも黄色）", color: "明るいパステル" },
  { who: "学童", klass: "学童クラス（小1〜小6）", height: `${BODY.child.h}px・2.9頭身`, mark: "ランドセルの肩ひも2本", color: "原色" },
  { who: "中高生", klass: "育成B〜選手", height: `${BODY.teen.h}px・4頭身`, mark: "スポーツウェアの白い胸ライン", color: "原色" },
  { who: "大人", klass: "プロ（大学生・社会人）", height: `${BODY.adult.h}px`, mark: "上下おそろいのジャージ（長ズボン）", color: "やや暗い原色" },
  { who: "一般客", klass: "クラブ生ではない", height: `${BODY.guest.h}px`, mark: "丈の長い上着＋手さげカバン。水着にならない", color: "くすんだ色・白髪の人もいる" },
];

const html = `<title>キャラの描き分け｜スイミングクラブ育成ゲーム</title>
<style>
  :root {
    color-scheme: light dark;
    --bg:#e9f0f4; --card:#ffffff; --ink:#0f2733; --sub:#5b7386;
    --line:#c6d7e0; --grid:#cfdde5; --lane:#0a7ea4; --cap:#f7d64a;
    --water-a:#2f83b4; --water-b:#1c5f88;
    --sans:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Noto Sans Mono",monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b1a22; --card:#12242e; --ink:#dceaf1; --sub:#90aabb;
            --line:#23414f; --grid:#1c3542; --lane:#4fc3e8; }
  }
  :root[data-theme="dark"] { --bg:#0b1a22; --card:#12242e; --ink:#dceaf1; --sub:#90aabb;
                             --line:#23414f; --grid:#1c3542; --lane:#4fc3e8; }
  :root[data-theme="light"] { --bg:#e9f0f4; --card:#ffffff; --ink:#0f2733; --sub:#5b7386;
                              --line:#c6d7e0; --grid:#cfdde5; --lane:#0a7ea4; }

  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); line-height:1.75; }
  .wrap { max-width:1000px; margin:0 auto; padding:40px 20px 72px; display:flex; flex-direction:column; gap:38px; }

  header { display:flex; flex-direction:column; gap:10px; }
  .eyebrow { font-family:var(--mono); font-size:.72rem; letter-spacing:.18em; text-transform:uppercase; color:var(--lane); }
  h1 { font-size:clamp(1.6rem,4vw,2.15rem); font-weight:800; letter-spacing:-.02em; margin:0; text-wrap:balance; }
  .lead { margin:0; max-width:62ch; color:var(--sub); }
  .lead b { color:var(--ink); }

  section { display:flex; flex-direction:column; gap:14px; }
  h2 { margin:0; font-size:1.05rem; font-weight:700; letter-spacing:-.01em;
       display:flex; align-items:center; gap:12px; }
  h2::after { content:""; flex:1; height:1px; background:var(--line); }
  .note { margin:0; color:var(--sub); font-size:.92rem; max-width:62ch; }

  /* 身長計：足元をそろえ、3ドットきざみの目盛りを背に置く */
  .chart { display:flex; align-items:flex-end; gap:clamp(10px,3vw,34px); padding:22px 22px 0;
           background:var(--card); border:1px solid var(--line); border-radius:14px;
           background-image:repeating-linear-gradient(to top, transparent 0 calc(var(--grid-step) - 1px), var(--grid) calc(var(--grid-step) - 1px) var(--grid-step));
           background-position:left bottom; background-size:100% calc(100% - 56px);
           background-repeat:no-repeat; overflow-x:auto; }
  .stand { display:flex; flex-direction:column; align-items:center; gap:8px; flex:0 0 auto; }
  .stand svg { display:block; }
  .tag { display:flex; flex-direction:column; align-items:center; gap:1px; padding:8px 0 14px;
         border-top:2px solid var(--lane); align-self:stretch; text-align:center; }
  .tag b { font-size:.9rem; }
  .mono { font-family:var(--mono); font-size:.75rem; color:var(--sub); font-variant-numeric:tabular-nums; }

  .row { display:flex; flex-wrap:wrap; gap:14px; }
  .card { margin:0; background:var(--card); border:1px solid var(--line); border-radius:12px;
          padding:14px 16px 10px; display:flex; flex-direction:column; gap:10px; }
  .sprites { display:flex; align-items:flex-end; gap:12px; }
  .sprites.water { background:linear-gradient(var(--water-a),var(--water-b)); border-radius:8px; padding:8px 10px; }
  figcaption { display:flex; align-items:baseline; gap:10px; font-size:.9rem; flex-wrap:wrap; }
  .note-inline { color:var(--sub); font-size:.78rem; }

  .scroll { overflow-x:auto; border:1px solid var(--line); border-radius:12px; background:var(--card); }
  table { border-collapse:collapse; width:100%; font-size:.9rem; min-width:660px; }
  th,td { padding:10px 14px; text-align:left; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-family:var(--mono); font-size:.72rem; letter-spacing:.12em; text-transform:uppercase;
       color:var(--sub); font-weight:600; }
  tbody tr:last-child td { border-bottom:0; }
  td:first-child { font-weight:700; white-space:nowrap; }
  td b { font-weight:600; box-shadow:inset 0 -.42em 0 color-mix(in srgb, var(--cap) 55%, transparent); }
  tbody td:nth-child(3) { font-family:var(--mono); font-variant-numeric:tabular-nums; color:var(--sub); white-space:nowrap; }
</style>
<div class="wrap">
  <header>
    <p class="eyebrow">Sprite reference</p>
    <h1>キャラの描き分け</h1>
    <p class="lead">同じ形に色だけ違う絵を並べると、幼児も学童も一般客も見分けが付かない。<b>背格好・服装・持ち物</b>の3つで差を付けた。ここに出ている絵はゲーム本体と同じ関数から描き出したもの（${Z}倍に拡大して表示）。</p>
  </header>

  <section>
    <h2>背丈</h2>
    <p class="note">目盛りは${GRID}ドットきざみ。実機では3倍で表示するので、幼児と学童の${BODY.child.h - BODY.kid.h}ドット差は画面上で${(BODY.child.h - BODY.kid.h) * 3}px の差になる。</p>
    ${heightChart()}
  </section>

  <section>
    <h2>私服（施設に入ってくるところ）</h2>
    <div class="row">${strip("walk", CHAR_BODIES)}</div>
  </section>

  <section>
    <h2>水着（更衣室を出たあと）</h2>
    <p class="note">一般客は水着にならない（プールは自由遊泳で使うだけなので、立ち姿しか持たない）。</p>
    <div class="row">${strip("suit", ["kid", "child", "teen", "adult"])}</div>
  </section>

  <section>
    <h2>泳いでいるところ（泳法別）</h2>
    <p class="note">水面から出ているのは頭・肩・腕だけなので、<b>腕の位置と頭の向き</b>で四泳法を描き分けている。</p>
    <div class="row">${strip("swimFree", ["teen", "adult"], true)}</div>
    <div class="row">${strip("swimBreast", ["teen", "adult"], true)}</div>
    <div class="row">${strip("swimBack", ["teen", "adult"], true)}</div>
    <div class="row">${strip("swimFly", ["teen", "adult"], true)}</div>
  </section>

  <section>
    <h2>幼児・学童の水中練習</h2>
    <p class="note">スクールの基礎練習段階なので四泳法には分けない。ビート板でバタ足（kick）と、水に慣れる・浮く（float）の2つ。</p>
    <div class="row">${strip("kick", ["kid", "child"], true)}</div>
    <div class="row">${strip("float", ["kid", "child"], true)}</div>
  </section>

  <section>
    <h2>スタート（飛び込み）とトレーニング</h2>
    <p class="note">スタートは泳ぎ出す直前だけ、トレーニングは筋トレルーム・スタジオで出る姿。</p>
    <div class="row">${strip("dive", ["teen", "adult"])}</div>
    <div class="row">${strip("train", ["teen", "adult", "guest"])}</div>
  </section>

  <section>
    <h2>奥へ歩くとき（背中）</h2>
    <p class="note">画面の上へ向かうときは背中を見せる。全員がこちらを向いたまま歩く不自然さを避けるため。</p>
    <div class="row">${strip("walkBack", CHAR_BODIES)}</div>
  </section>

  <section>
    <h2>職員（役割はユニフォーム、個人は髪型・ひげ・メガネ）</h2>
    <p class="note">施設で本人をタップすると、その人の詳細（格・得意な泳法・給料・担当のコマ）が開く。コーチは同じ時間に1つのプールしか担当できないので、並行して開くなら別のコーチが要る。</p>
    <div class="row">${STAFF_LOOKS.map(staffStrip).join("")}</div>
  </section>

  <section>
    <h2>見分けの手がかり</h2>
    <div class="scroll"><table>
      <thead><tr><th>だれ</th><th>クラス</th><th>背丈</th><th>目印</th><th>色</th></tr></thead>
      <tbody>${marks
        .map((m) => `<tr><td>${m.who}</td><td>${m.klass}</td><td>${m.height}</td><td><b>${m.mark}</b></td><td>${m.color}</td></tr>`)
        .join("")}</tbody>
    </table></div>
  </section>
</div>
`;

// ------------------------------------------------------------------ 6. 素材の割り当てと向き

head("6. 学年に合った絵が割り当たるか（学童におじさんが出ない）");
{
  // 【元の不具合】typeTableFor に child が入っていなかったため、
  // 小学生に m_office（社会人）や m_senior（シニア）＝おじさん・おばさんの絵が出ていた。
  const kidIds = new Set(KID_TYPES.map((t) => t.id));
  for (const body of ["kid", "child"] as const) {
    const ids = Array.from({ length: CHAR_VARIANTS }, (_, v) => charTypeOf(body, v).id);
    ok(ids.every((id) => kidIds.has(id)), `${BODY_LABEL[body]}は子どものタイプだけ`, ids.slice(0, 3).join(","));
    ok(!ids.some((id) => charTypeOf(body, ids.indexOf(id)).senior === true), `${BODY_LABEL[body]}にシニアは出ない`);
  }
  // 中高生・大人は今までどおり大人のタイプ表
  ok(!kidIds.has(charTypeOf("teen", 0).id), "中高生は大人のタイプ表のまま", charTypeOf("teen", 0).id);
  // 性別と絵が食い違わない（男性は b_*、女性は g_*）
  const boy = charTypeOf("child", variantForGender("m", 3)).id;
  const girl = charTypeOf("child", variantForGender("f", 3)).id;
  ok(boy.startsWith("b_"), "男の子には男の子の絵", boy);
  ok(girl.startsWith("g_"), "女の子には女の子の絵", girl);
}

head("7. 進行方向を向く素材が揃っているか");
{
  // 歩く向きは「素材の向き表（gfx/charFacing）」で決まる。
  // 奥へ歩くときは walkBack の絵に差し替えるので、**後ろ姿が描かれていること**が前提。
  // walkBack.png が walk.png のコピーのままだと、どちらへ歩いてもこちらを向いて見える
  //（幼児・学童が実際そうなっていた）。無いタイプは tools/gen_backsprites.py で作る。
  const dir = "public/characters";
  const same: string[] = [];
  const drawn: string[] = [];
  for (const t of readdirSync(dir)) {
    const walk = `${dir}/${t}/walk.png`;
    const back = `${dir}/${t}/walkBack.png`;
    if (!existsSync(walk) || !existsSync(back)) continue;
    (Buffer.compare(readFileSync(walk), readFileSync(back)) === 0 ? same : drawn).push(t);
  }
  ok(drawn.length > 0, "後ろ姿が描かれているタイプがある", `${drawn.length}タイプ`);
  ok(
    same.length === 0,
    "全タイプに後ろ姿がある（walkBack.png が walk.png のコピーでない）",
    same.length === 0 ? `${drawn.length}タイプ` : `無い: ${same.join(" ")}`,
  );
}

head("8. 館内を歩く人の大きさ（プールの人と釣り合っているか）");
{
  // 泳ぐ姿は水面に寝ているので画面の高さは SWIM_H ぶんしか使わない。
  // そこへ立ち姿が等倍で並ぶと、館内を歩く人だけが大きく見えてしまう。
  // LAND_CHAR_SCALE は**陸の姿にだけ**掛かる（→ src/config.ts）。
  ok(LAND_CHAR_SCALE < 1, "陸の姿は縮めてある", `×${LAND_CHAR_SCALE}`);
  ok(
    Math.abs(charAssetScale("walk", "adult", "m_sporty") - CHAR_SCALE * LAND_CHAR_SCALE) < 1e-9,
    "歩きには LAND_CHAR_SCALE が掛かる",
  );
  ok(
    Math.abs(charAssetScale("suit", "adult", "m_sporty") - CHAR_SCALE * LAND_CHAR_SCALE) < 1e-9,
    "水着で立っているときも陸あつかい",
  );
  ok(
    Math.abs(charAssetScale("swimFree", "adult", "m_sporty") - CHAR_SCALE) < 1e-9,
    "泳ぎには掛からない（水面の大きさで決まる）",
  );
  ok(
    Math.abs(charAssetScale("kick", "kid", "b_genki") - CHAR_SCALE) < 1e-9,
    "幼児のバタ足も水の中なので掛からない",
  );

  const swim = SWIM_H * CHAR_SCALE;
  for (const body of ["kid", "child", "teen", "adult"] as CharBody[]) {
    const stand = BODY[body].h * CHAR_SCALE * LAND_CHAR_SCALE;
    ok(
      stand / swim < 1.6,
      `${BODY_LABEL[body]}の立ち姿がプールの人と釣り合う`,
      `立ち ${stand.toFixed(0)}px / 水面 ${swim.toFixed(0)}px（${(stand / swim).toFixed(2)}倍）`,
    );
  }
  // 体型の差は残っている（縮めても幼児＜学童＜中高生＜大人）
  const hs = (["kid", "child", "teen", "adult"] as CharBody[]).map((b) => BODY[b].h * CHAR_SCALE * LAND_CHAR_SCALE);
  ok(hs[0] < hs[1] && hs[1] < hs[2] && hs[2] < hs[3], "縮めても背丈の差は残る", hs.map((h) => h.toFixed(0)).join(" < "));
}


const outPath = process.argv[2];
if (outPath) {
  writeFileSync(outPath, html, "utf8");
  console.log(`\nプレビューを書き出しました: ${outPath}`);
}

