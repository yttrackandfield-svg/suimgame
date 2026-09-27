import type Phaser from "phaser";
import { charTypeOf, type CharTypeDef } from "./charTypes";

export {
  ADULT_TYPES,
  KID_TYPES,
  TYPES_PER_BODY,
  charTypeOf,
  variantForGender,
  variantsOfGender,
  isSeniorVariant,
  type CharGender,
  type CharTypeDef,
} from "./charTypes";

/**
 * キャラのドット絵（生徒・一般客）。
 *
 * 「誰が誰か」がひと目で分かることを最優先にしてある。
 * 同じ形に色だけ違う絵を並べると、幼児も大人も一般客も見分けが付かないので、
 * **体格・服装・持ち物**の3つで差を作る。
 *
 *   kid   幼児（年少〜年長） 18px・2.5頭身・**黄色い通園帽**・明るい色
 *   child 学童（小1〜小6）   21px・**ランドセルの肩ひも**・原色
 *   teen  中高生（育成〜選手）24px・スポーツウェアの白ライン
 *   adult 大学生・社会人（プロ）27px・ジャージの袖ライン
 *   guest 一般客            27px・**上着＋手さげカバン**・落ち着いた色
 *
 * Phaser は型としてだけ読み込む（roomStyle.ts / shapes.ts と同じ方針）。
 * こうしておくと、ヘッドレスで描画命令を記録して絵を検証できる
 * （プロジェクト直下の `charcheck.ts`）。
 */

/**
 * 見た目のバリエーション数。
 * 同じ絵が並ぶと「同じ人がたくさんいる」ように見えるので、多いほど賑やかになる。
 * テクスチャは「体型 × これ × 3種（私服/水着/泳ぎ）」だけ作るので、
 * 増やしてもメモリは線形にしか増えない（10なら 5体型×10×3 = 150枚前後）。
 */
export const CHAR_VARIANTS = 10;

/** 生徒IDから見た目バリエーション番号。 */
export function variantOf(id: number): number {
  return ((id % CHAR_VARIANTS) + CHAR_VARIANTS) % CHAR_VARIANTS;
}

export type CharBody = "kid" | "child" | "teen" | "adult" | "guest";

/**
 * キャラの姿。状況に応じて切り替える（→ iso/people.ts）。
 *
 *   walk      … 私服の立ち・歩き（手前向き）
 *   walkBack  … 同じく奥向き（画面の上へ歩くとき）
 *   suit      … 水着の立ち姿（プールサイドで待つ・準備運動）
 *   swim      … 泳ぎ（後方互換の別名。中身はクロール）
 *   swimFree / swimBreast / swimBack / swimFly … 四泳法
 *   dive      … スタート（飛び込み）
 *   train     … 筋トレ・スタジオでのトレーニング姿
 *   kick      … 幼児・学童：ビート板でバタ足
 *   float     … 幼児・学童：水に慣れる／浮く基礎練習
 */
export type CharMode =
  | "walk"
  | "walkBack"
  | "suit"
  | "swim"
  | "swimFree"
  | "swimBreast"
  | "swimBack"
  | "swimFly"
  | "dive"
  | "train"
  | "kick"
  | "float";

/** 泳ぎの姿（水面に浮いた横向きの絵）。 */
export const SWIM_MODES: readonly CharMode[] = ["swim", "swimFree", "swimBreast", "swimBack", "swimFly"];

/** 水の中の姿（泳ぎ＋幼児の基礎練習）。原点・大きさを泳ぎと共有する。 */
export const WATER_MODES: readonly CharMode[] = [...SWIM_MODES, "kick", "float"];

export function isWaterMode(mode: CharMode): boolean {
  return WATER_MODES.includes(mode);
}

/** その体型が持つ「水の中の姿」（幼児＝基礎練習、中高生以上＝四泳法）。 */
export function swimModesOf(body: CharBody): CharMode[] {
  return modesFor(body).filter((m) => isWaterMode(m));
}

/**
 * その体型に用意する姿の一覧。
 *
 * 【枚数を無駄に増やさない】四泳法とスタートは中高生・大人だけ、
 * 幼児・学童の水中は「ビート板バタ足」と「浮く」の2つだけ（設計どおり、
 * スクールの基礎練習段階なので泳法別に分けない）。
 * 一般客は泳がないので泳ぎの姿は持たないが、温浴施設に入るので水着は持つ。
 */
export function modesFor(body: CharBody): CharMode[] {
  // 一般客は泳がない（見学・自由遊泳）ので泳ぎは持たないが、
  // **温浴施設（風呂・サウナ・外気浴）には水着で入る**ので水着は要る。
  // ここに suit が無いと、湯船に私服のまま浸かることになる。
  if (body === "guest") return ["walk", "walkBack", "suit", "train"];
  if (body === "kid" || body === "child") {
    return ["walk", "walkBack", "suit", "swim", "kick", "float"];
  }
  return ["walk", "walkBack", "suit", "swim", "swimFree", "swimBreast", "swimBack", "swimFly", "dive", "train"];
}

export const CHAR_BODIES: readonly CharBody[] = ["kid", "child", "teen", "adult", "guest"];

/** 体型の呼び名（検証・デバッグ表示用）。 */
export const BODY_LABEL: Record<CharBody, string> = {
  kid: "幼児",
  child: "学童",
  teen: "中高生",
  adult: "大人（プロ）",
  guest: "一般客",
};

/** ライフステージ（sim/growth の LifeStage）から体型を決める。 */
export function bodyForStage(stage: string): CharBody {
  if (stage === "preschool") return "kid";
  if (stage === "elementary") return "child";
  if (stage === "adult") return "adult";
  return "teen";
}

/** キャラのテクスチャキー（形態 × 体型 × 色バリエーション）。 */
export function charKey(mode: CharMode, body: CharBody, variant: number): string {
  return `${mode}_${body}${variant}`;
}

/**
 * 体型ごとの寸法（ドット単位）。
 * 立ち姿は下端が足元（origin 0.5, 1）なので、高さを変えるだけで背丈の差になる。
 */
export interface BodySpec {
  w: number; // テクスチャ幅
  h: number; // 立ち姿の高さ（＝背丈）
  headR: number; // 顔の半径
  headCy: number; // 顔の中心Y
  torsoY: number; // 胴の上端
  torsoH: number; // 胴の高さ
  torsoW: number; // 胴の幅
  legH: number; // 脚の長さ
  swimLen: number; // 泳ぐときの体の長さ
}

export const BODY: Record<CharBody, BodySpec> = {
  //          w   h  headR headCy torsoY torsoH torsoW legH swimLen
  kid:   { w: 14, h: 18, headR: 4.4, headCy: 5.4, torsoY: 9, torsoH: 5, torsoW: 8, legH: 4, swimLen: 10 },
  child: { w: 14, h: 21, headR: 3.6, headCy: 4.8, torsoY: 8, torsoH: 6, torsoW: 8, legH: 7, swimLen: 13 },
  teen:  { w: 14, h: 24, headR: 3.0, headCy: 5.0, torsoY: 8, torsoH: 7, torsoW: 8, legH: 9, swimLen: 15 },
  adult: { w: 15, h: 27, headR: 3.0, headCy: 5.2, torsoY: 8, torsoH: 9, torsoW: 9, legH: 10, swimLen: 16 },
  // 一般客はカバンを持つぶん、テクスチャの幅を広めに取る（足元は中央のまま）
  guest: { w: 18, h: 27, headR: 3.0, headCy: 5.2, torsoY: 8, torsoH: 9, torsoW: 9, legH: 10, swimLen: 16 },
};

/** 泳ぎのテクスチャは体型が変わっても同じ大きさ（原点 SWIM_ORIGIN を共有するため）。 */
export const SWIM_W = 22;
export const SWIM_H = 14;

/** 形態ごとのテクスチャの大きさ。 */
export function charSize(mode: CharMode, body: CharBody): { w: number; h: number } {
  if (isWaterMode(mode)) return { w: SWIM_W, h: SWIM_H };
  // 飛び込みは前傾して腕を伸ばすので、立ち姿より横に広く・縦に低い
  if (mode === "dive") return { w: SWIM_W, h: BODY[body].h };
  const sp = BODY[body];
  return { w: sp.w, h: mode === "suit" ? sp.h - 2 : sp.h };
}

/** キャラは背景から浮き立つように、濃い輪郭を付ける。 */
export const CHAR_OUTLINE = 0x22303c;

/**
 * 肌の色。服・髪・水着の色は**タイプ表（charTypes.ts）**が持つ。
 * ここに残しているのは、タイプに依らない共通の色だけ。
 */
const SKIN = [0xfad2ad, 0xf6c9a0, 0xe8b48a, 0xd39c74];
const SHOE = 0x272b34;
/** 幼児の通園帽（クラスがひと目で分かる目印。プールでも帽子が黄色い）。 */
export const KID_CAP = 0xf7d64a;
/** 学童のランドセルの肩ひも。 */
const SATCHEL = [0xc0392b, 0x2c3e8f, 0x7d3c98, 0x16875a, 0xd68910, 0x117a8b, 0xe6455f, 0x0f9b8e, 0xef6c00, 0x5560a8];
/** 色を暗くする（ランドセルのひもなど、服の上に重ねるものを控えめにする）。 */
function darken(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 0xff) * k);
  const g = Math.round(((c >> 8) & 0xff) * k);
  const b = Math.round((c & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

/** 一般客の手さげカバン。 */
const BAG = 0x6b4a2a;

/**
 * その体型・バリエーションの色。
 *
 * 色は**タイプ表（charTypes.ts）**から引く。バリエーション番号がそのままタイプ番号で、
 * 0..4 が男性・5..9 が女性なので、性別と見た目が食い違わない。
 * 幼児の帽子だけは黄色（KID_CAP）に固定してある——遠目に「幼児が居る」と分かる、
 * この画面でいちばん強い目印なので、タイプで色を変えない。
 */
export function paletteOf(
  body: CharBody,
  k: number,
): { skin: number; hair: number; shirt: number; suit: number; cap: number; pants: number } {
  const t = charTypeOf(body, k);
  return {
    skin: SKIN[t.skin % SKIN.length],
    hair: t.hairColor,
    shirt: t.shirt,
    suit: t.suit,
    cap: body === "kid" ? KID_CAP : t.cap,
    pants: t.pants,
  };
}

/** そのバリエーションのタイプ定義（髪型・小物を引くのに使う）。 */
export function typeOf(body: CharBody, k: number): CharTypeDef {
  return charTypeOf(body, k);
}

/**
 * 髪型を描く（顔の上に重ねる）。
 *
 * 小さいドット絵で人を見分ける手がかりは、色よりも**輪郭**。
 * ポニーテール・ツインテール・おだんごのように頭の外へはみ出す形を混ぜてあるので、
 * 14px 幅でも「あの子だ」と分かる。
 */
function drawHair(
  g: CharGraphics,
  t: CharTypeDef,
  cx: number,
  headCy: number,
  headR: number,
  outline: number,
  back = false,
): void {
  const top = headCy - headR - 1;
  const w = headR * 2;
  const cap = (): void => {
    g.fillStyle(t.hairColor, 1);
    g.fillRoundedRect(cx - headR, top, w, headR * 1.1, 2);
  };
  switch (t.hair) {
    case "spiky": {
      // 逆立てた髪：三角のとがりを並べる。
      // 幼児・学童は頭が大きく、テクスチャの上端に余裕が無いので、
      // はみ出さない高さまで（tipTop）に抑える。切れた髪はドット絵では汚く見える。
      cap();
      const tipTop = Math.max(0.2, top - 1.6);
      g.fillStyle(t.hairColor, 1);
      for (let i = 0; i < 3; i++) {
        g.fillRoundedRect(cx - headR + 0.4 + i * (w / 3), tipTop, w / 4, top - tipTop + 2.4, 1);
      }
      break;
    }
    case "wavy": {
      cap();
      const r = headR * 0.62;
      const wy = Math.max(r + 0.2, top + 0.6);
      g.fillStyle(t.hairColor, 1);
      g.fillCircle(cx - headR * 0.55, wy, r);
      g.fillCircle(cx + headR * 0.55, wy - 0.2, r);
      break;
    }
    case "bob":
      cap();
      g.fillStyle(t.hairColor, 1);
      // 耳の下まで丸く落ちる
      g.fillRoundedRect(cx - headR - 0.8, top + 0.8, 2, headR * 2.1, 1);
      g.fillRoundedRect(cx + headR - 1.2, top + 0.8, 2, headR * 2.1, 1);
      break;
    case "long":
      cap();
      g.fillStyle(t.hairColor, 1);
      g.fillRoundedRect(cx - headR - 0.8, top + 0.8, 2, headR * 3.2, 1);
      g.fillRoundedRect(cx + headR - 1.2, top + 0.8, 2, headR * 3.2, 1);
      break;
    case "ponytail":
      cap();
      g.fillStyle(outline, 1);
      g.fillCircle(cx + (back ? -headR - 1.4 : headR + 1.4), headCy + 0.6, 1.9);
      g.fillStyle(t.hairColor, 1);
      // 後頭部から跳ねる尾（奥向きのときは反対側に出す）
      g.fillCircle(cx + (back ? -headR - 1.4 : headR + 1.4), headCy + 0.6, 1.4);
      g.fillRoundedRect(cx + (back ? -headR - 2.2 : headR - 0.2), headCy + 1.2, 2.4, headR * 1.6, 1);
      break;
    case "sidetail":
      cap();
      g.fillStyle(t.hairColor, 1);
      g.fillRoundedRect(cx + headR - 1.6, top + 1, 2.6, headR * 2.6, 1);
      break;
    case "twintail":
      cap();
      g.fillStyle(outline, 1);
      g.fillCircle(cx - headR - 1.2, headCy - 0.2, 1.8);
      g.fillCircle(cx + headR + 1.2, headCy - 0.2, 1.8);
      g.fillStyle(t.hairColor, 1);
      g.fillCircle(cx - headR - 1.2, headCy - 0.2, 1.3);
      g.fillCircle(cx + headR + 1.2, headCy - 0.2, 1.3);
      g.fillRoundedRect(cx - headR - 2.2, headCy, 2, headR * 1.5, 1);
      g.fillRoundedRect(cx + headR + 0.2, headCy, 2, headR * 1.5, 1);
      break;
    case "bun":
      cap();
      g.fillStyle(outline, 1);
      g.fillCircle(cx, top - 1.4, 2.2);
      g.fillStyle(t.hairColor, 1);
      g.fillCircle(cx, top - 1.4, 1.7);
      break;
    case "toddlerBow":
      cap();
      g.fillStyle(t.hairColor, 1);
      g.fillRoundedRect(cx - headR - 0.6, top + 0.8, 1.8, headR * 1.4, 1);
      g.fillRoundedRect(cx + headR - 1.2, top + 0.8, 1.8, headR * 1.4, 1);
      // リボン
      g.fillStyle(0xf05a8a, 1);
      g.fillCircle(cx + headR - 0.4, top + 0.6, 1.5);
      break;
    case "toddler":
      // 幼児のやわらかい丸い髪（前髪が広い）
      g.fillStyle(t.hairColor, 1);
      g.fillRoundedRect(cx - headR - 0.4, top - 0.4, w + 0.8, headR * 1.15, 3);
      break;
    case "short":
    default:
      cap();
      break;
  }
}

/** メガネ（社会人タイプの目印）。 */
function drawGlasses(g: CharGraphics, cx: number, headCy: number, headR: number): void {
  g.fillStyle(0x1b2631, 1);
  g.fillRect(cx - headR - 0.4, headCy - 0.6, headR * 2 + 0.8, 1.3);
  g.fillStyle(0xd6eaf8, 0.8);
  g.fillRect(cx - headR, headCy - 0.4, headR * 0.8, 0.9);
  g.fillRect(cx + headR * 0.2, headCy - 0.4, headR * 0.8, 0.9);
}

/** 描画に使う Graphics の最小インターフェース（検証時は記録用の偽物を渡す）。 */
export type CharGraphics = Pick<
  Phaser.GameObjects.Graphics,
  "clear" | "fillStyle" | "fillRect" | "fillRoundedRect" | "fillCircle" | "fillEllipse"
>;

/**
 * 私服の立ち姿。足元＝下端中央（origin 0.5, 1）なので、高さの差がそのまま背丈の差になる。
 */
export function drawWalk(g: CharGraphics, body: CharBody, k: number, outline = CHAR_OUTLINE, back = false): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const t = typeOf(body, k);
  const cx = sp.w / 2;
  const bottom = sp.h - 1;
  const hipY = sp.torsoY + sp.torsoH - 1;
  const shoeH = body === "kid" ? 1.8 : 3.5;
  // ズボンはタイプごとの色（素材シートに合わせてある）
  const pants = c.pants;

  g.clear();
  g.fillStyle(0x000000, 0.24);
  g.fillEllipse(cx, bottom, sp.torsoW * 1.5, 3.4);

  // 輪郭（体のシルエットを一回り大きく暗色で描いてから、上に本体を重ねる）
  g.fillStyle(outline, 1);
  g.fillRoundedRect(cx - sp.torsoW / 2 - 1, sp.torsoY - 1, sp.torsoW + 2, sp.torsoH + 2, 3);
  g.fillCircle(cx, sp.headCy, sp.headR + 1);
  g.fillRect(cx - sp.torsoW / 2, hipY, sp.torsoW, sp.legH + 1);

  // 靴・ズボン
  g.fillStyle(SHOE, 1);
  g.fillRect(cx - 3, bottom - shoeH, 2, shoeH + 1);
  g.fillRect(cx + 1, bottom - shoeH, 2, shoeH + 1);
  g.fillStyle(pants, 1);
  g.fillRect(cx - 3, hipY, 6, sp.legH - shoeH);

  // 上半身
  g.fillStyle(c.shirt, 1);
  if (body === "guest") {
    // 一般客は丈の長い上着（腰まで隠れる）＝生徒のTシャツとシルエットが違う
    g.fillRoundedRect(cx - sp.torsoW / 2, sp.torsoY, sp.torsoW, sp.torsoH + 2.5, 2);
  } else {
    g.fillRoundedRect(cx - sp.torsoW / 2, sp.torsoY, sp.torsoW, sp.torsoH, 2);
  }
  if (body === "child") {
    // ランドセルの肩ひも。
    // タイプごとに服の色が付くようになったので、ひもは**細く・暗く**して
    // 服の色を邪魔しないようにする（太く明るいと、服が縞模様に見えてしまう）。
    g.fillStyle(darken(SATCHEL[k % SATCHEL.length], 0.55), 0.9);
    g.fillRect(cx - 2.4, sp.torsoY, 1.1, sp.torsoH);
    g.fillRect(cx + 1.3, sp.torsoY, 1.1, sp.torsoH);
  } else if (body === "teen") {
    // スポーツウェアの胸ライン
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(cx - sp.torsoW / 2, sp.torsoY + 2.5, sp.torsoW, 1.2);
  } else if (body === "adult") {
    // ジャージの袖ライン
    g.fillStyle(0xf4f6f7, 0.9);
    g.fillRect(cx - sp.torsoW / 2 + 0.6, sp.torsoY + 1, 1, sp.torsoH - 2);
    g.fillRect(cx + sp.torsoW / 2 - 1.6, sp.torsoY + 1, 1, sp.torsoH - 2);
  } else if (body === "guest") {
    // 上着の前あき（襟から裾まで）
    g.fillStyle(0xf4f6f7, 0.85);
    g.fillRect(cx - 0.8, sp.torsoY + 1, 1.6, sp.torsoH + 1);
  }

  // 腕
  g.fillStyle(c.skin, 1);
  g.fillRect(cx - sp.torsoW / 2 - 1, sp.torsoY + 1, 2, sp.torsoH - 2);
  g.fillRect(cx + sp.torsoW / 2 - 1, sp.torsoY + 1, 2, sp.torsoH - 2);

  // 顔と髪（奥向きのときは顔を描かず、後頭部を髪で覆う）
  g.fillCircle(cx, sp.headCy, sp.headR);
  if (back) {
    g.fillStyle(c.hair, 1);
    g.fillCircle(cx, sp.headCy, sp.headR);
  }
  drawHair(g, t, cx, sp.headCy, sp.headR, outline, back);
  if (t.accessory === "glasses" && !back) drawGlasses(g, cx, sp.headCy, sp.headR);
  if (t.accessory === "towel") {
    // 首にかけたタオル（シニアの目印）
    g.fillStyle(0xf4f6f7, 1);
    g.fillRect(cx - sp.torsoW / 2 + 0.4, sp.torsoY, 1.6, sp.torsoH * 0.8);
    g.fillRect(cx + sp.torsoW / 2 - 2, sp.torsoY, 1.6, sp.torsoH * 0.8);
  }
  if (t.accessory === "hairband") {
    g.fillStyle(0xf05a8a, 1);
    g.fillRect(cx - sp.headR, sp.headCy - sp.headR - 0.4, sp.headR * 2, 1.1);
  }
  if (t.accessory === "ball") {
    // 抱えたボール（やんちゃな子の目印）
    g.fillStyle(outline, 1);
    g.fillCircle(cx + sp.torsoW / 2 + 1.4, sp.torsoY + sp.torsoH - 1, 2.6);
    g.fillStyle(0xe94f4f, 1);
    g.fillCircle(cx + sp.torsoW / 2 + 1.4, sp.torsoY + sp.torsoH - 1, 2);
  }

  if (body === "kid") {
    // 通園帽（山＋つば）。幼児だと遠目でも分かる、いちばん強い目印。
    // 顔が半分は見えるよう、帽子は頭の上半分だけに収める。
    const top = sp.headCy - sp.headR;
    g.fillStyle(outline, 1);
    g.fillRoundedRect(cx - sp.headR - 1.6, top - 1.2, sp.headR * 2 + 3.2, sp.headR * 1.1, 2);
    g.fillStyle(KID_CAP, 1);
    g.fillRoundedRect(cx - sp.headR + 0.2, top - 0.8, sp.headR * 2 - 0.4, sp.headR * 0.85, 2);
    g.fillRoundedRect(cx - sp.headR - 1.2, top + 1.6, sp.headR * 2 + 2.4, 1.6, 1); // つば
  } else if (body === "guest") {
    // 手さげカバン（右手に提げる）
    g.fillStyle(outline, 1);
    g.fillRect(cx + sp.torsoW / 2 + 0.5, sp.torsoY + sp.torsoH - 2, 4.5, 5);
    g.fillStyle(BAG, 1);
    g.fillRect(cx + sp.torsoW / 2 + 1, sp.torsoY + sp.torsoH - 1.5, 3.5, 4);
    g.fillStyle(outline, 1);
    g.fillRect(cx + sp.torsoW / 2 + 1.4, sp.torsoY + sp.torsoH - 3.5, 2.6, 1.4); // 持ち手
  }
}

/** 水着の立ち姿（着替えたことが分かる）。幼児は帽子が黄色いまま。 */
export function drawSuit(g: CharGraphics, body: CharBody, k: number, outline = CHAR_OUTLINE): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const h = sp.h - 2;
  const cx = sp.w / 2;
  const bottom = h - 1;
  const hipY = sp.torsoY + sp.torsoH - 2;

  g.clear();
  g.fillStyle(0x000000, 0.24);
  g.fillEllipse(cx, bottom, sp.torsoW * 1.5, 3.4);

  g.fillStyle(outline, 1);
  g.fillRoundedRect(cx - sp.torsoW / 2 - 1, sp.torsoY, sp.torsoW + 2, sp.torsoH, 3);
  g.fillCircle(cx, sp.headCy, sp.headR + 1);
  g.fillRect(cx - sp.torsoW / 2, hipY, sp.torsoW, h - hipY);

  // 素肌の脚
  g.fillStyle(c.skin, 1);
  g.fillRect(cx - 3, hipY, 2, h - hipY);
  g.fillRect(cx + 1, hipY, 2, h - hipY);
  // 水着
  g.fillStyle(c.suit, 1);
  g.fillRoundedRect(cx - 3, sp.torsoY + 1, 6, sp.torsoH - 2, 2);
  // 腕
  g.fillStyle(c.skin, 1);
  g.fillRect(cx - sp.torsoW / 2 - 1, sp.torsoY + 1, 2, sp.torsoH - 3);
  g.fillRect(cx + sp.torsoW / 2 - 1, sp.torsoY + 1, 2, sp.torsoH - 3);
  g.fillCircle(cx, sp.headCy, sp.headR);
  // スイムキャップ
  g.fillStyle(c.cap, 1);
  g.fillRoundedRect(cx - sp.headR, sp.headCy - sp.headR - 1, sp.headR * 2, sp.headR * 1.35, 2);
}

/**
 * 泳ぎ（右向き基準・頭が右）。体の長さで年代の差を出す。
 *
 * 【泳法の描き分け】水面から見えるのは頭・肩・腕・水しぶきだけなので、
 * **腕の位置と頭の向き**で四泳法を描き分ける。
 *   クロール   … 片腕が前へ大きく上がる（リカバリー）／顔は横を向く
 *   平泳ぎ     … 両腕を前でそろえ、頭を高く上げる
 *   背泳ぎ     … 仰向け。顔が上を向き、片腕が真上へ伸びる
 *   バタフライ … 両腕を左右へ大きく開き、上体が持ち上がる
 * どれも 22×14px の同じ枠に描くので、切り替えても位置が飛ばない。
 */
export function drawSwim(
  g: CharGraphics,
  body: CharBody,
  k: number,
  outline = CHAR_OUTLINE,
  stroke: "free" | "breast" | "back" | "fly" = "free",
): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const len = sp.swimLen;
  const headX = SWIM_W - 5;
  const tailX = headX - len;
  // 平泳ぎ・バタフライは上体が水面から持ち上がるので、少し高い位置に描く
  const cy = stroke === "breast" || stroke === "fly" ? 6 : 7;
  const headR = Math.min(sp.headR, 3.4); // 水面から出ているのは頭だけ

  g.clear();
  // 水中に沈んでいる体の影
  g.fillStyle(0x0d3c5c, 0.35);
  g.fillEllipse((headX + tailX) / 2 + 1, 12, len + 4, 3.4);

  g.fillStyle(outline, 1);
  g.fillRoundedRect(tailX - 1, cy - 3, len + 2, 7, 3);
  g.fillCircle(headX, cy, headR + 0.7);
  g.fillStyle(c.suit, 1);
  g.fillRoundedRect(tailX, cy - 2, len, 5, 2);

  // --- 腕（泳法の決め手）
  g.fillStyle(c.skin, 1);
  if (stroke === "free") {
    // 片腕が前方へ抜ける（斜め上に伸ばす）
    g.fillRoundedRect(headX - 5, cy - 5.4, 5.5, 2, 1);
    g.fillRect(tailX + 4, cy - 4, 3, 2);
  } else if (stroke === "breast") {
    // 両腕を前でそろえる
    g.fillRoundedRect(headX - 1, cy - 1.4, 5, 2, 1);
    g.fillRoundedRect(headX - 1, cy + 0.8, 5, 2, 1);
  } else if (stroke === "back") {
    // 仰向け：片腕が真上（画面では後ろ）へ伸びる
    g.fillRoundedRect(headX - 3, cy - 6, 2, 5, 1);
    g.fillRect(tailX + 4, cy + 2, 3, 2);
  } else {
    // バタフライ：両腕を左右へ大きく開く
    g.fillRoundedRect(headX - 7, cy - 5, 7, 2, 1);
    g.fillRoundedRect(tailX - 1, cy - 5, 7, 2, 1);
  }

  // --- 頭とキャップ
  g.fillStyle(c.skin, 1);
  g.fillCircle(headX, cy, headR - 0.4);
  g.fillStyle(c.cap, 1);
  if (stroke === "back") {
    // 仰向けなので、キャップは下側（水につかっている側）に見える
    g.fillRoundedRect(headX - 2, cy + 0.6, 4, 2, 1);
  } else {
    g.fillRoundedRect(headX - 2, cy - 3, 4, 2, 1);
  }

  // --- 水しぶき（動いている感じ。バタフライ・クロールは大きく）
  // 体が長い大人ほど後ろに余白が無いので、しぶきは枠の中に収める
  const splashR = stroke === "fly" ? 2.2 : 1.5;
  g.fillStyle(0xffffff, stroke === "fly" ? 0.75 : 0.55);
  g.fillCircle(Math.max(splashR, tailX - 1.5), cy + 1, splashR);
  g.fillCircle(Math.max(1.1, tailX - 3.4), cy + 2, 1.1);
  if (stroke === "fly" || stroke === "free") {
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(headX + 2, cy + 1.6, 1.4);
  }
}

/**
 * 【幼児・学童】ビート板でバタ足。
 * 四泳法をやらないスクール生の基本の姿。板が白くて目立つので、
 * 遠目にも「泳いでいる子」と「基礎練習の子」が区別できる。
 */
export function drawKick(g: CharGraphics, body: CharBody, k: number, outline = CHAR_OUTLINE): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const len = sp.swimLen;
  const headX = SWIM_W - 7;
  const tailX = headX - len;
  const cy = 7;
  const headR = Math.min(sp.headR, 3.4);

  g.clear();
  g.fillStyle(0x0d3c5c, 0.35);
  g.fillEllipse((headX + tailX) / 2 + 1, 12, len + 4, 3.4);

  // 体（水面に浮いている）
  g.fillStyle(outline, 1);
  g.fillRoundedRect(tailX - 1, cy - 3, len + 2, 7, 3);
  g.fillCircle(headX, cy, headR + 0.7);
  g.fillStyle(c.suit, 1);
  g.fillRoundedRect(tailX, cy - 2, len, 5, 2);

  // 前へ伸ばした腕
  g.fillStyle(c.skin, 1);
  g.fillRoundedRect(headX - 0.5, cy - 1, 4.5, 2, 1);

  // 顔（前を向いて板につかまる）
  g.fillCircle(headX, cy, headR - 0.4);
  g.fillStyle(c.cap, 1);
  g.fillRoundedRect(headX - 2, cy - 3, 4, 2, 1);

  // ビート板（白い板＋色の縁。いちばん目立つ）
  g.fillStyle(outline, 1);
  g.fillRoundedRect(SWIM_W - 6.5, cy - 3.2, 6, 6.4, 2);
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(SWIM_W - 6, cy - 2.7, 5, 5.4, 2);
  g.fillStyle(0x4aa3e0, 1);
  g.fillRect(SWIM_W - 6, cy - 0.6, 5, 1.4);

  // バタ足のしぶき（枠からはみ出さない位置に置く）
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(Math.max(2, tailX - 1.6), cy + 0.6, 2);
  g.fillCircle(Math.max(1.2, tailX - 3.6), cy + 2, 1.2);
}

/**
 * 【幼児・学童】水に慣れる基礎練習（浮く・顔をつける）。
 * ビート板を持たず、両腕を広げてぷかぷか浮いている姿。
 */
export function drawFloat(g: CharGraphics, body: CharBody, k: number, outline = CHAR_OUTLINE): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const len = Math.max(8, sp.swimLen - 2);
  const cx = SWIM_W / 2 + 1;
  const cy = 7;
  const headR = Math.min(sp.headR, 3.4);

  g.clear();
  g.fillStyle(0x0d3c5c, 0.3);
  g.fillEllipse(cx, 12, len + 6, 3.6);

  // 丸くなって浮いている体
  g.fillStyle(outline, 1);
  g.fillRoundedRect(cx - len / 2 - 1, cy - 3, len + 2, 6.5, 3);
  g.fillStyle(c.suit, 1);
  g.fillRoundedRect(cx - len / 2, cy - 2.2, len, 5, 2);

  // 左右に広げた腕
  g.fillStyle(c.skin, 1);
  g.fillRoundedRect(cx - len / 2 - 4, cy - 1, 5, 2, 1);
  g.fillRoundedRect(cx + len / 2 - 1, cy - 1, 5, 2, 1);

  // 顔（水面から出して息をしている）
  g.fillStyle(outline, 1);
  g.fillCircle(cx + len / 2 - 1, cy - 1.5, headR + 0.7);
  g.fillStyle(c.skin, 1);
  g.fillCircle(cx + len / 2 - 1, cy - 1.5, headR - 0.4);
  g.fillStyle(c.cap, 1);
  g.fillRoundedRect(cx + len / 2 - 3, cy - 4.4, 4, 2, 1);

  // まわりの波紋（水に慣れる練習らしく、水面がゆれている）
  g.fillStyle(0xffffff, 0.5);
  g.fillEllipse(cx, cy + 3.4, len + 6, 2);
  g.fillStyle(0xffffff, 0.6);
  g.fillCircle(Math.max(1.2, cx - len / 2 - 3), cy + 1.6, 1.2);
}

/**
 * スタート（飛び込み）。台を蹴って前へ伸びた姿勢。
 * 立ち姿と同じ枠の中で、上下は詰めて横に長く描く。
 */
export function drawDive(g: CharGraphics, body: CharBody, k: number, outline = CHAR_OUTLINE): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const h = sp.h;
  const cy = h * 0.55;
  const len = sp.swimLen + 2;
  const headX = SWIM_W - 6;
  const tailX = headX - len;
  const headR = Math.min(sp.headR, 3.4);

  g.clear();
  // 飛び出した勢いのしぶき（後ろに残る）
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(tailX - 1, cy + 3, 2.4);
  g.fillCircle(tailX - 3.6, cy + 4.4, 1.4);

  // 体（頭から足まで一直線）
  g.fillStyle(outline, 1);
  g.fillRoundedRect(tailX - 1, cy - 3, len + 2, 6.5, 3);
  g.fillStyle(c.suit, 1);
  g.fillRoundedRect(tailX, cy - 2.2, len, 5, 2);

  // 前へそろえて伸ばした両腕（飛び込みの決めポーズ）
  g.fillStyle(c.skin, 1);
  g.fillRoundedRect(headX - 1, cy - 2.6, 6.5, 2, 1);
  g.fillRoundedRect(headX - 1, cy - 0.6, 6.5, 2, 1);

  // 頭は腕のあいだに挟む
  g.fillStyle(outline, 1);
  g.fillCircle(headX - 1.5, cy, headR + 0.7);
  g.fillStyle(c.skin, 1);
  g.fillCircle(headX - 1.5, cy, headR - 0.4);
  g.fillStyle(c.cap, 1);
  g.fillRoundedRect(headX - 3.5, cy - 3, 4, 2, 1);
}

/**
 * トレーニング姿（筋トレルーム・スタジオ）。
 * 立ち姿をもとに、**ダンベルを持ち上げた腕**を足して「運動中」だと分かるようにする。
 * 素材が届いたら、器具ごとの絵に差し替えられる（キーは train のまま）。
 */
export function drawTrain(g: CharGraphics, body: CharBody, k: number, outline = CHAR_OUTLINE): void {
  const sp = BODY[body];
  const c = paletteOf(body, k);
  const cx = sp.w / 2;

  // 土台は水着（プール施設の中なので）ではなく私服・ジャージのまま
  drawWalk(g, body, k, outline);

  // 上げた腕とダンベル（左右で高さを変えて動きを出す）
  const armY = sp.torsoY - 1;
  g.fillStyle(c.skin, 1);
  g.fillRect(cx - sp.torsoW / 2 - 1, armY, 2, sp.torsoH * 0.7);
  g.fillRect(cx + sp.torsoW / 2 - 1, armY + 1.5, 2, sp.torsoH * 0.7);
  g.fillStyle(outline, 1);
  g.fillRect(cx - sp.torsoW / 2 - 2.4, armY - 2.2, 4.8, 2.4);
  g.fillRect(cx + sp.torsoW / 2 - 2.4, armY - 0.7, 4.8, 2.4);
  g.fillStyle(0x6f7c8c, 1);
  g.fillRect(cx - sp.torsoW / 2 - 2, armY - 1.8, 4, 1.6);
  g.fillRect(cx + sp.torsoW / 2 - 2, armY - 0.3, 4, 1.6);
}

/** 形態を指定して描く（テクスチャ生成・検証の共通入口）。 */
export function drawChar(g: CharGraphics, mode: CharMode, body: CharBody, k: number): void {
  switch (mode) {
    case "walk":
      drawWalk(g, body, k);
      return;
    case "walkBack":
      drawWalk(g, body, k, CHAR_OUTLINE, true);
      return;
    case "suit":
      drawSuit(g, body, k);
      return;
    case "train":
      drawTrain(g, body, k);
      return;
    case "dive":
      drawDive(g, body, k);
      return;
    case "kick":
      drawKick(g, body, k);
      return;
    case "float":
      drawFloat(g, body, k);
      return;
    case "swimBreast":
      drawSwim(g, body, k, CHAR_OUTLINE, "breast");
      return;
    case "swimBack":
      drawSwim(g, body, k, CHAR_OUTLINE, "back");
      return;
    case "swimFly":
      drawSwim(g, body, k, CHAR_OUTLINE, "fly");
      return;
    case "swim":
    case "swimFree":
    default:
      drawSwim(g, body, k, CHAR_OUTLINE, "free");
      return;
  }
}

// ------------------------------------------------------------------ 職員（コーチ・受付・専門スタッフ）

/**
 * 職員の見た目。
 *
 * 【ユニフォーム】役割がひと目で分かるように、着ているものを変える。
 *   coach        … ポロシャツ＋ジャージ（ホイッスル・キャップ）
 *   reception    … 緑の制服＋名札
 *   nutritionist … 白いコックコート＋コック帽（おたま）
 *   doctor       … 白衣＋聴診器
 *
 * 【個人の描き分け】同じ役割でも1人ずつ違って見えるように、
 * 髪型・髪色・ひげ・メガネ・肌・服の色を組み合わせで持たせる。
 * 組み合わせは表で明示してあるので、「隣の人と似てしまった」が起きない。
 */

export type StaffLook = "coach" | "reception" | "nutritionist" | "doctor";

/** 頭（帽子・髪型）。 */
type HeadKind = "cap" | "capBack" | "short" | "long" | "bald" | "bandana" | "chef" | "bun";
/** 口ひげ・あごひげ。 */
type Beard = "none" | "mustache" | "beard";
/** 手に持つもの・首から下げるもの。 */
type Accent = "none" | "whistle" | "stetho" | "ladle" | "badge";

interface StaffFeature {
  shirt: number; // 上着の色
  pants: number; // ズボンの色
  head: HeadKind;
  hair: number; // 髪・帽子の色
  beard: Beard;
  glasses: boolean;
  skin: number;
  accent: Accent;
  /** 白衣・コックコートのように丈が長い上着（腰まで隠れる）。 */
  coat?: boolean;
}

const PANTS_DARK = 0x34495e;
const PANTS_WHITE = 0xe8edf0;
const COAT_WHITE = 0xf4f7f9;

const HAIR_BLACK = 0x241c16;
const HAIR_BROWN = 0x5a3b25;
const HAIR_LIGHT = 0xb98a4a;
const HAIR_GREY = 0x9aa3a8;
const HAIR_RED = 0x8c3b1e;

/**
 * コーチ12人ぶんの見た目。
 * 「色」だけでなく**シルエット（帽子／長髪／坊主／ひげ／メガネ）**を変えてあるので、
 * 小さく表示されても、並んでいても別人だと分かる。
 */
const COACH_LOOKS: StaffFeature[] = [
  { shirt: 0xe74c3c, pants: PANTS_DARK, head: "cap",     hair: 0x2c3e50, beard: "none",     glasses: false, skin: 0, accent: "whistle" },
  { shirt: 0x2e86c1, pants: PANTS_DARK, head: "short",   hair: HAIR_LIGHT, beard: "none",   glasses: true,  skin: 0, accent: "none" },
  { shirt: 0x27ae60, pants: PANTS_DARK, head: "long",    hair: HAIR_BLACK, beard: "none",   glasses: false, skin: 1, accent: "whistle" },
  { shirt: 0xe67e22, pants: PANTS_DARK, head: "cap",     hair: 0xf4f6f7, beard: "beard",    glasses: false, skin: 0, accent: "none" },
  { shirt: 0x8e44ad, pants: PANTS_DARK, head: "bald",    hair: HAIR_BLACK, beard: "mustache", glasses: true, skin: 1, accent: "whistle" },
  { shirt: 0x1abc9c, pants: PANTS_DARK, head: "short",   hair: HAIR_BROWN, beard: "none",   glasses: false, skin: 0, accent: "none" },
  { shirt: 0xf1c40f, pants: PANTS_DARK, head: "capBack", hair: 0x7b241c, beard: "beard",    glasses: true,  skin: 1, accent: "whistle" },
  { shirt: 0x95a5a6, pants: PANTS_DARK, head: "short",   hair: HAIR_GREY, beard: "mustache", glasses: false, skin: 0, accent: "none" },
  { shirt: 0x2c3e8f, pants: PANTS_DARK, head: "cap",     hair: 0x239b56, beard: "none",     glasses: true,  skin: 1, accent: "whistle" },
  { shirt: 0xff7fb0, pants: PANTS_DARK, head: "bun",     hair: HAIR_BROWN, beard: "none",   glasses: false, skin: 0, accent: "none" },
  { shirt: 0x16a085, pants: PANTS_DARK, head: "bandana", hair: 0xe74c3c, beard: "none",     glasses: false, skin: 1, accent: "whistle" },
  { shirt: 0x784212, pants: PANTS_DARK, head: "long",    hair: HAIR_RED, beard: "beard",    glasses: false, skin: 0, accent: "none" },
];

/** 受付スタッフ（緑の制服＋名札）。 */
const RECEPTION_LOOKS: StaffFeature[] = [
  { shirt: 0x1f8b6e, pants: 0x2c3e50, head: "bun",   hair: 0x4a3526, beard: "none", glasses: false, skin: 0, accent: "badge" },
  { shirt: 0x1f8b6e, pants: 0x2c3e50, head: "short", hair: HAIR_BLACK, beard: "none", glasses: true, skin: 1, accent: "badge" },
  { shirt: 0x1f8b6e, pants: 0x2c3e50, head: "long",  hair: HAIR_LIGHT, beard: "none", glasses: false, skin: 0, accent: "badge" },
];

/** 栄養士（白いコックコート＋コック帽）。 */
const NUTRITIONIST_LOOKS: StaffFeature[] = [
  { shirt: COAT_WHITE, pants: PANTS_WHITE, head: "chef", hair: HAIR_BLACK, beard: "none", glasses: false, skin: 0, accent: "ladle", coat: true },
  { shirt: COAT_WHITE, pants: PANTS_WHITE, head: "chef", hair: HAIR_BROWN, beard: "mustache", glasses: true, skin: 1, accent: "ladle", coat: true },
  // コック帽をかぶらず三角巾の人（帽子で隠れると個人差が消えるので、頭を変える）
  { shirt: COAT_WHITE, pants: PANTS_WHITE, head: "bandana", hair: 0xd35400, beard: "none", glasses: false, skin: 1, accent: "ladle", coat: true },
  { shirt: COAT_WHITE, pants: PANTS_WHITE, head: "chef", hair: HAIR_GREY, beard: "beard", glasses: true, skin: 0, accent: "ladle", coat: true },
];

/** ドクター（白衣＋聴診器）。 */
const DOCTOR_LOOKS: StaffFeature[] = [
  { shirt: COAT_WHITE, pants: 0x4a5c6a, head: "short", hair: HAIR_BLACK, beard: "none", glasses: true, skin: 0, accent: "stetho", coat: true },
  { shirt: COAT_WHITE, pants: 0x4a5c6a, head: "bun",   hair: HAIR_BROWN, beard: "none", glasses: false, skin: 1, accent: "stetho", coat: true },
  { shirt: COAT_WHITE, pants: 0x4a5c6a, head: "bald",  hair: HAIR_GREY, beard: "beard", glasses: true, skin: 0, accent: "stetho", coat: true },
  { shirt: COAT_WHITE, pants: 0x4a5c6a, head: "long",  hair: HAIR_GREY, beard: "none", glasses: false, skin: 1, accent: "stetho", coat: true },
];

const LOOKS: Record<StaffLook, StaffFeature[]> = {
  coach: COACH_LOOKS,
  reception: RECEPTION_LOOKS,
  nutritionist: NUTRITIONIST_LOOKS,
  doctor: DOCTOR_LOOKS,
};

/** その役割の見た目の種類数。 */
export function staffVariantCount(look: StaffLook): number {
  return LOOKS[look].length;
}

/** ID から見た目の番号（同じ人はいつも同じ見た目）。 */
export function staffVariantOf(look: StaffLook, id: number): number {
  const n = LOOKS[look].length;
  return ((id % n) + n) % n;
}

/** テクスチャキー。 */
export function staffKey(look: StaffLook, id: number): string {
  return `st_${look}${staffVariantOf(look, id)}`;
}

/** コーチのテクスチャキー（呼び出し側の読みやすさのため別名を用意）。 */
export function coachKey(id: number): string {
  return staffKey("coach", id);
}

export const COACH_VARIANTS = COACH_LOOKS.length;
export function coachVariantOf(id: number): number {
  return staffVariantOf("coach", id);
}

/** 職員スプライトの寸法（プールサイドに立つ大人。生徒より大きい）。 */
export const STAFF_SIZE = { w: 20, h: 33 };
/** 後方互換の別名。 */
export const COACH_SIZE = STAFF_SIZE;

/** 職員1人ぶんを描く。 */
export function drawStaff(g: CharGraphics, look: StaffLook, id: number, outline = CHAR_OUTLINE): void {
  const f = LOOKS[look][staffVariantOf(look, id)];
  const skin = SKIN[f.skin % SKIN.length];
  const cx = 10;
  const headCy = 6;
  const headR = 4;

  g.clear();
  g.fillStyle(0x000000, 0.26);
  g.fillEllipse(cx, 30, 18, 5);

  // --- 輪郭（背景から浮き立たせる）
  g.fillStyle(outline, 1);
  g.fillRoundedRect(3, 8, 14, f.coat ? 16 : 14, 4);
  g.fillCircle(cx, headCy, headR + 1.4);
  g.fillRect(4, 18, 12, 11);

  // --- ズボン・靴
  g.fillStyle(f.pants, 1);
  g.fillRect(6, 20, 3, 9);
  g.fillRect(11, 20, 3, 9);
  g.fillStyle(0x272b34, 1);
  g.fillRect(6, 27, 3, 2);
  g.fillRect(11, 27, 3, 2);

  // --- 上着（白衣・コックコートは丈が長い）
  g.fillStyle(f.shirt, 1);
  g.fillRoundedRect(4, 9, 12, f.coat ? 14 : 11, 3);

  if (f.coat) {
    // 白衣の前あわせ（薄いグレーの線）＋インナー
    g.fillStyle(0xcfd8dd, 1);
    g.fillRect(9.4, 9, 1.2, 13);
    if (look === "nutritionist") {
      // 【コックが白い塊に見えないように】コックコート・白ズボン・コック帽まで白一色だと、
      // 実機の大きさでは輪郭しか読めない。首もとのスカーフと色のついた前掛けで、体を上下に割る。
      g.fillStyle(0xe74c3c, 1);
      g.fillRect(8.2, 8.8, 3.6, 1.8); // 首もとのスカーフ
      // 前掛けは**腰巻き**にする。胸当てにすると、この大きさでは「青い板を持った人」に見える
      g.fillStyle(0x2c4f73, 1);
      g.fillRect(5.6, 15.4, 8.8, 1); // 腰ひも
      g.fillStyle(0x3f6f9e, 1);
      g.fillRect(6, 16.4, 8, 6);
      g.fillStyle(0x5d8cbb, 1);
      g.fillRect(6, 16.4, 8, 1); // 上端の照り（光は左上から）
      g.fillStyle(0x2c4f73, 1);
      g.fillRect(6, 21.6, 8, 0.8); // 裾の影
    } else {
      g.fillStyle(look === "doctor" ? 0x5dade2 : 0xe74c3c, 1);
      g.fillRect(7.5, 9, 5, 2.4); // 襟元から見えるインナー
    }
  } else {
    // ポロシャツの前立て
    g.fillStyle(0xffffff, 0.92);
    g.fillRect(9, 9, 2, 10);
    g.fillStyle(0xffffff, 0.92);
    g.fillRect(7, 9, 6, 1.6); // 襟
  }

  // --- 持ち物・首から下げるもの
  if (f.accent === "whistle") {
    g.fillStyle(0xf7dc6f, 1);
    g.fillRect(9.3, 15, 1.6, 3);
  } else if (f.accent === "stetho") {
    g.fillStyle(0x455a64, 1);
    g.fillRect(7.2, 9.5, 1, 5);
    g.fillRect(12, 9.5, 1, 5);
    g.fillStyle(0x90a4ae, 1);
    g.fillCircle(10, 15.5, 1.8);
  } else if (f.accent === "ladle") {
    // おたまは**そで口の外側**に出す（腕はこの後に描かれるので、内側だと隠れる）
    g.fillStyle(0xb0bec5, 1);
    g.fillRect(17.4, 13, 1.1, 5.4); // 柄（手もとから下へ。長いと体から離れて浮いて見える）
    g.fillStyle(0x90a4ae, 1);
    g.fillCircle(17.9, 19.2, 1.7);
    g.fillStyle(0xcfd8dd, 1);
    g.fillCircle(17.9, 18.8, 0.9); // すくう面の照り
  } else if (f.accent === "badge") {
    g.fillStyle(0xf7dc6f, 1);
    g.fillRect(12, 12, 3, 2);
  }

  // --- 腕
  g.fillStyle(f.coat ? f.shirt : skin, 1);
  g.fillRect(3, 10, 2, f.coat ? 8 : 7);
  g.fillRect(15, 10, 2, f.coat ? 8 : 7);
  if (f.coat) {
    g.fillStyle(skin, 1);
    g.fillRect(3, 17, 2, 2);
    g.fillRect(15, 17, 2, 2);
  }

  // --- 顔
  g.fillStyle(skin, 1);
  g.fillCircle(cx, headCy, headR);

  // --- ひげ（顔の下半分）
  if (f.beard === "beard") {
    g.fillStyle(f.hair, 1);
    g.fillRoundedRect(cx - 3.4, headCy + 1.4, 6.8, 3.4, 2);
    g.fillStyle(skin, 1);
    g.fillRect(cx - 1.2, headCy + 2.2, 2.4, 1.4); // 口
  } else if (f.beard === "mustache") {
    g.fillStyle(f.hair, 1);
    g.fillRect(cx - 2, headCy + 1.6, 4, 1.2);
  }

  // --- 頭（帽子・髪型）
  drawHead(g, f, cx, headCy, headR, outline);

  // --- メガネ（いちばん目立つ個体差なので最後に重ねる）
  if (f.glasses) {
    g.fillStyle(0x1b2631, 1);
    g.fillRect(cx - 4, headCy - 1.2, 8, 1.6);
    g.fillStyle(0xd6eaf8, 0.85);
    g.fillRect(cx - 3.4, headCy - 1, 2.4, 1.2);
    g.fillRect(cx + 1, headCy - 1, 2.4, 1.2);
  }
}

/** 帽子・髪型。シルエットが変わるので、遠目でもいちばん見分けやすい。 */
function drawHead(
  g: CharGraphics,
  f: StaffFeature,
  cx: number,
  cy: number,
  r: number,
  outline: number,
): void {
  const top = cy - r;
  switch (f.head) {
    case "cap":
      g.fillStyle(f.hair, 1);
      g.fillRoundedRect(cx - r - 0.4, top - 1.4, r * 2 + 0.8, r * 1.2, 2); // 山
      g.fillRoundedRect(cx - r - 2, top + 1.6, r * 2 + 5, 1.6, 1); // つば（前）
      break;
    case "capBack":
      g.fillStyle(f.hair, 1);
      g.fillRoundedRect(cx - r - 0.4, top - 1.4, r * 2 + 0.8, r * 1.2, 2);
      g.fillRoundedRect(cx - r - 4, top + 1.6, r + 3, 1.6, 1); // つば（後ろ向き）
      break;
    case "short":
      g.fillStyle(f.hair, 1);
      g.fillRoundedRect(cx - r, top - 1, r * 2, r * 1.1, 2);
      break;
    case "long":
      g.fillStyle(f.hair, 1);
      g.fillRoundedRect(cx - r, top - 1, r * 2, r * 1.1, 2);
      g.fillRect(cx - r - 0.6, top + 0.6, 1.8, r * 2.4); // 左の垂らした髪
      g.fillRect(cx + r - 1.2, top + 0.6, 1.8, r * 2.4);
      break;
    case "bun":
      g.fillStyle(f.hair, 1);
      g.fillRoundedRect(cx - r, top - 1, r * 2, r * 1.1, 2);
      g.fillCircle(cx, top - 1.8, 2.2); // おだんご
      break;
    case "bandana":
      g.fillStyle(f.hair, 1);
      g.fillRoundedRect(cx - r - 0.4, top + 0.2, r * 2 + 0.8, 2.2, 1);
      g.fillStyle(0x241c16, 1);
      g.fillRoundedRect(cx - r + 0.6, top - 0.8, r * 2 - 1.2, 1.6, 1); // 前髪
      break;
    case "chef":
      // コック帽（白くて背が高い＝栄養士の目印）
      g.fillStyle(outline, 1);
      g.fillRoundedRect(cx - r - 1.4, top - 4.4, r * 2 + 2.8, 5.6, 2);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(cx - r - 1, top - 4, r * 2 + 2, 3.6, 2); // ふくらみ
      g.fillRoundedRect(cx - r + 0.2, top - 1.2, r * 2 - 0.4, 2, 1); // 帯
      break;
    case "bald":
      g.fillStyle(f.hair, 1);
      g.fillRect(cx - r, cy - 0.6, 1.6, 2.6); // 横の残った髪
      g.fillRect(cx + r - 1.6, cy - 0.6, 1.6, 2.6);
      break;
  }
}

/** 後方互換：コーチ1人ぶん。 */
export function drawCoach(g: CharGraphics, id: number, outline = CHAR_OUTLINE): void {
  drawStaff(g, "coach", id, outline);
}

/** 全役割 × 全バリエーションの一覧（テクスチャ生成・検証で使う）。 */
export const STAFF_LOOKS: readonly StaffLook[] = ["coach", "reception", "nutritionist", "doctor"];
