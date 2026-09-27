// Phaser は型としてだけ使う（描画は scene 経由）。こうしておくと顔の組み合わせ判定を
// ブラウザ抜き（テスト）でも読み込めるようになる。
import type Phaser from "phaser";
import { PORTRAIT } from "../config/balance";
import { lifeStageOf, type LifeStage } from "../sim/growth";
import type { Student } from "../sim/student";

/**
 * 選手ごとのポートレート（顔）をコード生成する。
 *
 * 実写は使えないので、パーツの組み合わせで自動生成する。
 *   輪郭・肌の色・髪型・髪色・目・口・水泳帽・ゴーグル
 * 組み合わせは選手ID から決まるので、その選手の顔はずっと変わらない。
 * ただし年齢（幼児／小学生／中学生／高校生／成人）で頭身・目の大きさ・
 * 水泳帽の有無が変わり、成長すると年相応の見た目になる。
 *
 * テクスチャは「パーツの組み合わせ」をキーにして共有する（同じ顔なら1枚）。
 * 表示側は整数倍で拡大する前提（config.ts が pixelArt: true）。
 */

export const PORTRAIT_SIZE = PORTRAIT.size;

// ------------------------------------------------------------------ パレット

const SKIN = [0xf7d0ab, 0xf2c191, 0xe8ad7c, 0xd79b6a, 0xc07f52];
const SKIN_SHADE = [0xe0b088, 0xdaa571, 0xcf9160, 0xbb8050, 0xa4693f];
const HAIR = [0x2b1d16, 0x1a1410, 0x4a3122, 0x6b4423, 0x8b5a2b, 0x5c5148, 0xb8860b];
const CAP = [0x2c3e8f, 0xc0392b, 0x16875a, 0xd68910, 0x7d3c98, 0x117a8b];
const MOUTH = 0x8a4a3a;
const EYE = 0x2c2018;
const EYE_LIGHT = 0xffffff;
const GOGGLE_GLASS = 0x7fd8f0;
const GOGGLE_FRAME = 0x24323f;
const SHIRT = [0x4a90d9, 0xe0533a, 0x3fae6b, 0xf0a93b, 0x9b59b6, 0x30bfa8];

// ------------------------------------------------------------------ 特徴の決定

export interface PortraitFeatures {
  face: number; // 輪郭 0..2（丸 / たまご / えら）
  skin: number;
  hair: number; // 髪型 0..7
  hairColor: number;
  eyes: number; // 0..3
  mouth: number; // 0..2
  cap: number; // 水泳帽の色。-1 でかぶっていない
  goggles: boolean;
  shirt: number;
  stage: LifeStage;
}

/** 選手ID から安定した擬似乱数（0..1）を作る。 */
function frac(id: number, salt: number): number {
  let h = Math.imul(id + 0x9e37 + salt * 0x85eb, 0x27d4eb2d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const pickIdx = (id: number, salt: number, n: number): number => Math.floor(frac(id, salt) * n) % n;

/** 女子に出やすい髪型（4..7＝長め）。男子は 0..3 が出やすい。 */
function hairStyleFor(s: Student): number {
  const r = frac(s.id, 11);
  const longHair = s.gender === "f" ? r < 0.82 : r < 0.18;
  const within = pickIdx(s.id, 12, 4);
  return longHair ? 4 + within : within;
}

/** その選手のパーツ構成（年齢で一部が変わる）。 */
export function portraitFeatures(s: Student): PortraitFeatures {
  const stage = lifeStageOf(s.grade);
  const school = stage === "preschool" || stage === "elementary";
  const capChance = school ? PORTRAIT.capChanceBySchool : PORTRAIT.capChanceByIkusei;
  const wearsCap = frac(s.id, 21) < capChance;
  return {
    face: pickIdx(s.id, 1, PORTRAIT.variants.face),
    skin: pickIdx(s.id, 2, Math.min(SKIN.length, PORTRAIT.variants.skin)),
    hair: hairStyleFor(s),
    hairColor: pickIdx(s.id, 4, Math.min(HAIR.length, PORTRAIT.variants.hairColor)),
    eyes: pickIdx(s.id, 5, PORTRAIT.variants.eyes),
    mouth: pickIdx(s.id, 6, PORTRAIT.variants.mouth),
    cap: wearsCap ? pickIdx(s.id, 7, Math.min(CAP.length, PORTRAIT.variants.cap)) : -1,
    goggles: wearsCap && frac(s.id, 8) < PORTRAIT.goggleChance,
    shirt: pickIdx(s.id, 9, SHIRT.length),
    stage,
  };
}

/** 同じ顔ならテクスチャを共有できるようにキー化する。 */
export function portraitKey(f: PortraitFeatures): string {
  return `pf_${f.face}${f.skin}${f.hair}${f.hairColor}${f.eyes}${f.mouth}_${f.cap}${f.goggles ? 1 : 0}_${f.shirt}_${f.stage}`;
}

// ------------------------------------------------------------------ 年齢ごとの頭身

interface AgeShape {
  headW: number; // 顔の幅（半径）
  headH: number; // 顔の高さ（半径）
  cy: number; // 顔の中心Y
  eyeR: number; // 目の大きさ
  eyeGap: number; // 目の間隔
  bodyTop: number; // 肩のY
}

/** 幼児ほど頭が大きく丸く、目も大きい。成人ほど面長で目が小さい。 */
function ageShape(stage: LifeStage): AgeShape {
  switch (stage) {
    case "preschool":
      return { headW: 10.5, headH: 10.0, cy: 15, eyeR: 2.4, eyeGap: 4.4, bodyTop: 26 };
    case "elementary":
      return { headW: 10.0, headH: 9.8, cy: 15, eyeR: 2.1, eyeGap: 4.4, bodyTop: 26 };
    case "middle":
      return { headW: 9.4, headH: 9.8, cy: 14.5, eyeR: 1.9, eyeGap: 4.6, bodyTop: 25 };
    case "high":
      return { headW: 9.0, headH: 9.8, cy: 14, eyeR: 1.7, eyeGap: 4.7, bodyTop: 24.5 };
    default:
      return { headW: 8.8, headH: 10.0, cy: 14, eyeR: 1.6, eyeGap: 4.8, bodyTop: 24 };
  }
}

// ------------------------------------------------------------------ 生成

/**
 * その選手のポートレートを用意し、テクスチャキーを返す。
 * すでに同じ組み合わせが生成済みなら作り直さない。
 */
export function ensurePortrait(scene: Phaser.Scene, s: Student): string {
  const f = portraitFeatures(s);
  const key = portraitKey(f);
  if (scene.textures.exists(key)) return key;
  drawPortrait(scene, key, f);
  return key;
}

function drawPortrait(scene: Phaser.Scene, key: string, f: PortraitFeatures): void {
  const S = PORTRAIT_SIZE;
  const k = S / 32; // 32px 基準で設計し、必要なら拡大する
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const a = ageShape(f.stage);

  const px = (v: number): number => v * k;
  const skin = SKIN[f.skin];
  const shade = SKIN_SHADE[f.skin];
  const hair = HAIR[f.hairColor];

  // --- 背景（薄い丸。一覧で顔が浮くように） ---
  g.fillStyle(0x1c3550, 1);
  g.fillRoundedRect(0, 0, S, S, px(4));

  // --- 肩・首 ---
  g.fillStyle(shade, 1);
  g.fillRect(px(13.5), px(a.cy + a.headH - 2), px(5), px(4)); // 首
  g.fillStyle(SHIRT[f.shirt], 1);
  g.fillRoundedRect(px(5), px(a.bodyTop), px(22), px(S / k - a.bodyTop), px(3));

  // --- 後ろ髪（長い髪型だけ、輪郭より先に描く） ---
  if (f.hair >= 4) {
    g.fillStyle(hair, 1);
    const w = f.hair === 5 ? 25 : 23; // ツインテールは横に広い
    g.fillRoundedRect(px(16 - w / 2), px(a.cy - a.headH + 1), px(w), px(a.headH + 10), px(5));
  }

  // --- 輪郭 ---
  g.fillStyle(skin, 1);
  drawFace(g, f.face, px(16), px(a.cy), px(a.headW), px(a.headH), px(1));
  // 頬の影（右下）
  g.fillStyle(shade, 0.35);
  g.fillEllipse(px(16 + a.headW * 0.45), px(a.cy + a.headH * 0.35), px(a.headW * 0.8), px(a.headH * 0.6));

  // --- 耳 ---
  g.fillStyle(skin, 1);
  g.fillEllipse(px(16 - a.headW), px(a.cy + 1), px(2.6), px(3.4));
  g.fillEllipse(px(16 + a.headW), px(a.cy + 1), px(2.6), px(3.4));

  // --- 髪（前髪・トップ） ---
  drawHair(g, f.hair, hair, a, px);

  // --- 水泳帽（髪の上から。かぶると前髪が隠れる） ---
  if (f.cap >= 0) {
    g.fillStyle(CAP[f.cap], 1);
    g.fillEllipse(px(16), px(a.cy - a.headH * 0.42), px(a.headW * 2.1), px(a.headH * 1.35));
    g.fillStyle(0xffffff, 0.16);
    g.fillEllipse(px(16 - a.headW * 0.42), px(a.cy - a.headH * 0.72), px(a.headW * 0.62), px(a.headH * 0.34));
  }

  // --- ゴーグル（額に上げている） ---
  if (f.goggles) {
    const gy = a.cy - a.headH * 0.18;
    g.fillStyle(GOGGLE_FRAME, 1);
    g.fillRect(px(16 - a.headW * 0.95), px(gy - 0.6), px(a.headW * 1.9), px(1.3));
    g.fillStyle(GOGGLE_GLASS, 1);
    g.fillEllipse(px(16 - a.eyeGap * 0.9), px(gy), px(4.4), px(3.4));
    g.fillEllipse(px(16 + a.eyeGap * 0.9), px(gy), px(4.4), px(3.4));
    g.fillStyle(GOGGLE_FRAME, 1);
    g.fillRect(px(16 - 1), px(gy - 0.5), px(2), px(1));
  }

  // --- 目 ---
  drawEyes(g, f.eyes, a, px);

  // --- 口 ---
  drawMouth(g, f.mouth, a, px);

  g.generateTexture(key, S, S);
  g.destroy();
}

/** 輪郭 3種：丸顔／たまご型／えら張り。 */
function drawFace(
  g: Phaser.GameObjects.Graphics,
  shape: number,
  cx: number,
  cy: number,
  rw: number,
  rh: number,
  unit: number,
): void {
  if (shape === 0) {
    g.fillEllipse(cx, cy, rw * 2, rh * 2);
    return;
  }
  if (shape === 1) {
    // たまご型：下が細い
    g.fillEllipse(cx, cy - unit, rw * 2, rh * 1.85);
    g.fillEllipse(cx, cy + rh * 0.45, rw * 1.6, rh * 1.1);
    return;
  }
  // えら張り：角のある四角に近い輪郭
  g.fillRoundedRect(cx - rw, cy - rh, rw * 2, rh * 2, rw * 0.55);
}

/** 髪型 8種。0..3＝短め、4..7＝長め（後ろ髪は呼び出し前に描いてある）。 */
function drawHair(
  g: Phaser.GameObjects.Graphics,
  style: number,
  color: number,
  a: AgeShape,
  px: (v: number) => number,
): void {
  g.fillStyle(color, 1);
  const topY = a.cy - a.headH;

  switch (style) {
    case 0: // 短髪（刈り上げ）
      g.fillEllipse(px(16), px(topY + 2.6), px(a.headW * 2.02), px(a.headH * 0.95));
      g.fillRect(px(16 - a.headW), px(topY + 2.4), px(a.headW * 2), px(2));
      break;
    case 1: // おかっぱ（マッシュ）
      g.fillEllipse(px(16), px(topY + 3.2), px(a.headW * 2.14), px(a.headH * 1.15));
      g.fillRect(px(16 - a.headW - 0.6), px(topY + 2.6), px(a.headW * 2 + 1.2), px(3.2));
      break;
    case 2: // ツンツン
      g.fillEllipse(px(16), px(topY + 3), px(a.headW * 2.0), px(a.headH * 0.9));
      for (let i = -2; i <= 2; i++) {
        g.fillTriangle(
          px(16 + i * 3.1 - 1.6),
          px(topY + 1.6),
          px(16 + i * 3.1 + 1.6),
          px(topY + 1.6),
          px(16 + i * 3.1),
          px(topY - 2.4),
        );
      }
      break;
    case 3: // 七三分け
      g.fillEllipse(px(16), px(topY + 2.8), px(a.headW * 2.05), px(a.headH * 1.0));
      g.fillRect(px(16 - a.headW), px(topY + 2.2), px(a.headW * 1.2), px(3.6));
      break;
    case 4: // セミロング
      g.fillEllipse(px(16), px(topY + 3.2), px(a.headW * 2.16), px(a.headH * 1.1));
      g.fillRect(px(16 - a.headW - 1), px(topY + 3), px(3), px(a.headH * 1.5));
      g.fillRect(px(16 + a.headW - 2), px(topY + 3), px(3), px(a.headH * 1.5));
      break;
    case 5: // ツインテール
      g.fillEllipse(px(16), px(topY + 3.0), px(a.headW * 2.1), px(a.headH * 1.05));
      g.fillEllipse(px(16 - a.headW - 1.6), px(a.cy + 1), px(5.4), px(8.4));
      g.fillEllipse(px(16 + a.headW + 1.6), px(a.cy + 1), px(5.4), px(8.4));
      break;
    case 6: // ポニーテール
      g.fillEllipse(px(16), px(topY + 3.0), px(a.headW * 2.08), px(a.headH * 1.02));
      g.fillEllipse(px(16 + a.headW + 1.4), px(a.cy - 1), px(4.6), px(10.4));
      break;
    default: // ぱっつんボブ
      g.fillEllipse(px(16), px(topY + 3.4), px(a.headW * 2.18), px(a.headH * 1.2));
      g.fillRect(px(16 - a.headW - 0.8), px(topY + 3), px(a.headW * 2 + 1.6), px(4.2));
      break;
  }
}

/** 目 4種。年齢が下がるほど大きく描かれる（ageShape.eyeR）。 */
function drawEyes(
  g: Phaser.GameObjects.Graphics,
  style: number,
  a: AgeShape,
  px: (v: number) => number,
): void {
  const ey = a.cy + 0.8;
  const lx = 16 - a.eyeGap;
  const rx = 16 + a.eyeGap;

  if (style === 1) {
    // 細い線目
    g.fillStyle(EYE, 1);
    g.fillRect(px(lx - a.eyeR), px(ey), px(a.eyeR * 2), px(1.2));
    g.fillRect(px(rx - a.eyeR), px(ey), px(a.eyeR * 2), px(1.2));
    return;
  }
  if (style === 3) {
    // 強気（つり目）
    g.fillStyle(EYE, 1);
    g.fillTriangle(px(lx - a.eyeR), px(ey + a.eyeR), px(lx + a.eyeR), px(ey + a.eyeR), px(lx + a.eyeR), px(ey - a.eyeR));
    g.fillTriangle(px(rx + a.eyeR), px(ey + a.eyeR), px(rx - a.eyeR), px(ey + a.eyeR), px(rx - a.eyeR), px(ey - a.eyeR));
    return;
  }

  // 丸目（style 0）／ 大きな丸目にハイライト（style 2）
  g.fillStyle(EYE, 1);
  g.fillCircle(px(lx), px(ey), px(a.eyeR));
  g.fillCircle(px(rx), px(ey), px(a.eyeR));
  if (style === 2) {
    g.fillStyle(EYE_LIGHT, 1);
    g.fillCircle(px(lx - a.eyeR * 0.3), px(ey - a.eyeR * 0.35), px(a.eyeR * 0.42));
    g.fillCircle(px(rx - a.eyeR * 0.3), px(ey - a.eyeR * 0.35), px(a.eyeR * 0.42));
  }
}

/** 口 3種。 */
function drawMouth(
  g: Phaser.GameObjects.Graphics,
  style: number,
  a: AgeShape,
  px: (v: number) => number,
): void {
  const my = a.cy + a.headH * 0.52;
  g.fillStyle(MOUTH, 1);
  if (style === 0) {
    g.fillRect(px(14.6), px(my), px(2.8), px(1.1));
    return;
  }
  if (style === 1) {
    // にっこり
    g.fillRect(px(13.8), px(my), px(4.4), px(1.1));
    g.fillRect(px(13.4), px(my - 1), px(1), px(1.1));
    g.fillRect(px(17.6), px(my - 1), px(1), px(1.1));
    return;
  }
  // 口を開けている
  g.fillEllipse(px(16), px(my + 0.4), px(3.4), px(2.6));
}
