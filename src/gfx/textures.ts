import Phaser from "phaser";
import { COLORS, TILE_H, TILE_W } from "../config";
import { createFurnitureTextures } from "./furniture";
import { ROOM_STYLE, WALL_H, WALL_H_OUTER, WALL_THICK, WALL_THICK_OUTER } from "./roomStyle";

/**
 * 壁テクスチャの種類。
 * wall/glass/fence/door は部屋どうしを仕切る内壁（sim/walls.ts の WallKind と同じ）。
 * outer/outerGlass は建物そのものの外壁で、描画にしか出てこない。
 */
export type WallTexKind = "wall" | "glass" | "fence" | "door" | "outer" | "outerGlass";

/**
 * ドット絵スプライトをコード生成する（仮素材段階：外部アセットを持たない）。
 * BootScene.create() から一度だけ呼び、TextureManager に登録する。
 * 後で PNG へ差し替えても、キー名/寸法/原点を保てば各シーンは無改修。
 *
 * キャラは3形態：walk(私服)→suit(水着立ち)→swim(泳ぎ・横向き)。
 * 色バリエーション CHAR_VARIANTS 種を用意し、生徒ごとに固定で割り当てる。
 */

// キャラのドット絵は gfx/charSprites.ts（Phaser 非依存＝ヘッドレスで検証できる）。
import {
  CHAR_BODIES,
  CHAR_OUTLINE,
  CHAR_VARIANTS,
  STAFF_LOOKS,
  STAFF_SIZE,
  charKey,
  charSize,
  drawChar,
  drawStaff,
  modesFor,
  staffKey,
  staffVariantCount,
} from "./charSprites";
import { createRoomFurnitureTextures } from "./roomFurniture";
import { createBigFacilityTextures } from "./bigFacility";
export {
  coachKey,
  coachVariantOf,
  COACH_VARIANTS,
  staffKey,
  staffVariantOf,
  staffVariantCount,
  STAFF_LOOKS,
  type StaffLook,
} from "./charSprites";
export {
  bodyForStage,
  charKey,
  charSize,
  charTypeOf,
  CHAR_BODIES,
  CHAR_VARIANTS,
  isWaterMode,
  modesFor,
  swimModesOf,
  variantOf,
  variantForGender,
  variantsOfGender,
  isSeniorVariant,
  SWIM_MODES,
  type CharBody,
  type CharGender,
  type CharMode,
  type CharTypeDef,
} from "./charSprites";

// 壁の寸法は gfx/roomStyle.ts（Phaser 非依存）に置いてある。
export { WALL_H, WALL_H_OUTER, WALL_THICK, WALL_THICK_OUTER, WALL_TOP, BUILDING_TINT } from "./roomStyle";

export const DESK_ORIGIN_Y = (13 + 16) / (TILE_H + 16);

/** 立体物の高さから原点Yを求める（設備の描画に使う）。 */
export function isoCubeOriginY(wallH: number): number {
  return (TILE_H / 2 + wallH) / (TILE_H + wallH);
}

/** 設備の立体物の高さ。 */
export const EQUIP_H = {
  studio: 20,
  gym: 20,
  pool: 10,
  sauna: 24,
  massage: 12,
  pole: 7,
  reception: 14,
  mat: 6,
} as const;
export const EQUIP_ORIGIN_Y = {
  studio: isoCubeOriginY(EQUIP_H.studio),
  gym: isoCubeOriginY(EQUIP_H.gym),
  pool: isoCubeOriginY(EQUIP_H.pool),
  sauna: isoCubeOriginY(EQUIP_H.sauna),
  massage: isoCubeOriginY(EQUIP_H.massage),
  pole: isoCubeOriginY(EQUIP_H.pole),
  reception: isoCubeOriginY(EQUIP_H.reception),
  mat: isoCubeOriginY(EQUIP_H.mat),
} as const;

/** アイテム種別 → テクスチャキー（部屋に置く器具と、外構の装飾）。 */
export const ITEM_TEXTURE: Record<string, string> = {
  // スタジオ
  stretchMat: "eqMat",
  jumpRope: "eqRope",
  stretchPole: "eqPole",
  // 筋トレルーム
  dumbbell: "gymRack",
  barbell: "gymBarbell",
  benchPress: "gymBenchPress",
  smithMachine: "gymSmith",
  powerRack: "gymLat",
  // マッサージエリア
  massage: "fnMassageBed",
  sauna: "fnSaunaRoom",
};

/** 大きな器具（筋トレマシン・サウナなど）も下端中央を足元にして大きく描く。 */
export const BIG_GEAR = new Set([
  "gymRack",
  "gymBarbell",
  "gymBenchPress",
  "gymSmith",
  "gymLat",
  "gymTread",
  "gymBike",
  "gymBench",
  "fnMassageBed",
  "fnSaunaRoom",
]);

/** 各キャラ形態の原点（タイル中心＝足元 or 水面）。 */
export const WALK_ORIGIN = { x: 0.5, y: 1 };
export const SUIT_ORIGIN = { x: 0.5, y: 1 };
export const SWIM_ORIGIN = { x: 0.5, y: 0.64 };

/**
 * 敷き詰め用の「建物の外」のタイル（TileSprite で使う）。
 * 屋内施設なので中身は舗装（駐車場）。キー名は既存コードとの互換で据え置き。
 */
export const GRASS_TEXTURE = "outsidePave";

export function createGameTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // キャラ・什器は背景から浮き立つように、濃い輪郭を付ける
  const OUTLINE = CHAR_OUTLINE;

  // 【キャラ】体型 × タイプ（10）× 姿。
  // どの体型にどの姿を用意するかは charSprites.modesFor が決める
  //（四泳法とスタートは中高生・大人だけ、幼児・学童はビート板と浮く姿だけ）。
  for (const body of CHAR_BODIES) {
    for (let k = 0; k < CHAR_VARIANTS; k++) {
      for (const mode of modesFor(body)) {
        drawChar(g, mode, body, k);
        const size = charSize(mode, body);
        g.generateTexture(charKey(mode, body, k), size.w, size.h);
      }
    }
  }

  // --- 職員（コーチ／受付／栄養士／ドクター） ---
  // 役割はユニフォームで、個人は髪型・ひげ・メガネ・服の色で見分ける。
  for (const look of STAFF_LOOKS) {
    for (let k = 0; k < staffVariantCount(look); k++) {
      drawStaff(g, look, k, OUTLINE);
      g.generateTexture(staffKey(look, k), STAFF_SIZE.w, STAFF_SIZE.h);
    }
  }
  // 後方互換のキー
  drawStaff(g, "coach", 0, OUTLINE);
  g.generateTexture("coach", STAFF_SIZE.w, STAFF_SIZE.h);
  drawStaff(g, "reception", 0, OUTLINE);
  g.generateTexture("staff", STAFF_SIZE.w, STAFF_SIZE.h);

  // --- 壁（セル境界に立つ薄板）---
  // 立方体をやめたので、マスを食わず部屋の中身が全部見える。
  createWallTextures(g);

  // --- 受付デスク（低い立体物。原点 DESK_ORIGIN_Y） ---
  g.clear();
  drawIsoCube(g, 16, COLORS.deskTop, COLORS.deskSide, 0x6a451f);
  g.generateTexture("desk", TILE_W, TILE_H + 16);

  // --- spark：才能演出用 ---
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 3, 3);
  g.generateTexture("spark", 3, 3);

  // --- gainDisc：練習中の「+1」を囲む円（ステータス色に tint して使う） ---
  {
    const r = 13;
    g.clear();
    g.fillStyle(0xffffff, 0.35); // 外側のふち（tint 後に明るく見える）
    g.fillCircle(r, r, r);
    g.fillStyle(0xffffff, 1); // 本体
    g.fillCircle(r, r, r - 2.5);
    g.generateTexture("gainDisc", r * 2, r * 2);
  }

  // --- 設備（スタジオ／筋トレルーム／増設プール） ---
  g.clear();
  drawIsoCube(g, EQUIP_H.studio, 0x8fe0cf, 0x4e9b8d, 0x3b8074);
  g.generateTexture("eqStudio", TILE_W, TILE_H + EQUIP_H.studio);

  g.clear();
  drawIsoCube(g, EQUIP_H.gym, 0xe0b06a, 0xa6733a, 0x87592a);
  g.generateTexture("eqGym", TILE_W, TILE_H + EQUIP_H.gym);

  g.clear();
  drawIsoCube(g, EQUIP_H.pool, COLORS.poolWaterAlt, 0x246f96, 0x1c5c7e);
  g.generateTexture("eqPool", TILE_W, TILE_H + EQUIP_H.pool);

  // --- 回復設備（サウナ／マッサージ器）と回復アイテム（ストレッチポール） ---
  g.clear();
  drawIsoCube(g, EQUIP_H.sauna, 0xd9a066, 0x9c6b38, 0x7d5329); // 木のサウナ小屋
  g.generateTexture("eqSauna", TILE_W, TILE_H + EQUIP_H.sauna);

  g.clear();
  drawIsoCube(g, EQUIP_H.massage, 0xb0bec5, 0x78909c, 0x62757f); // マッサージチェア
  g.generateTexture("eqMassage", TILE_W, TILE_H + EQUIP_H.massage);

  g.clear();
  drawIsoCube(g, EQUIP_H.pole, 0x7ec8e3, 0x4a9ec2, 0x3a83a5); // ストレッチポール
  g.generateTexture("eqPole", TILE_W, TILE_H + EQUIP_H.pole);

  g.clear();
  drawIsoCube(g, EQUIP_H.reception, 0xd8b98a, 0x9c7a4a, 0x7d5f36); // 受付カウンター
  g.generateTexture("eqReception", TILE_W, TILE_H + EQUIP_H.reception);

  g.clear();
  drawIsoCube(g, EQUIP_H.mat, 0xe8834a, 0xb35e33, 0x8f4a28); // ストレッチマット置き場
  g.generateTexture("eqMat", TILE_W, TILE_H + EQUIP_H.mat);

  g.clear();
  drawIsoCube(g, EQUIP_H.mat, 0xd9d24a, 0xa8a232, 0x877f26); // 縄跳びラック
  g.generateTexture("eqRope", TILE_W, TILE_H + EQUIP_H.mat);

  createOutdoorTextures(g);
  createOutsideTexture(g);

  g.destroy();

  // 部屋の什器（ロッカー・マシン・長机など）は専用モジュールで生成する
  createFurnitureTextures(scene);
  // マッサージエリア・会議室・コーチ室・ドクタールーム・自販機・寮の什器（→ gfx/roomFurniture.ts）
  createRoomFurnitureTextures(scene);
  // 大型施設（大型プールの観客席・医科学センター・高地トレーニング棟）（→ gfx/bigFacility.ts）
  createBigFacilityTextures(scene);

  // ここで作ったドット絵だけを NEAREST にする。
  // ゲーム全体は antialias（文字がにじまないように）なので、
  // スプライト側は個別に指定しないとぼやけてしまう。
  applyPixelFilter(scene);
}

/**
 * コード生成したテクスチャを、すべて NEAREST（ドット絵向け）にする。
 * 文字（Text）は Phaser が別テクスチャで持つので、こちらには含まれない
 * ＝ドット絵はくっきり、文字は滑らか、を両立できる。
 */
function applyPixelFilter(scene: Phaser.Scene): void {
  for (const key of scene.textures.getTextureKeys()) {
    const tex = scene.textures.get(key);
    // Phaser が内部で持つ __DEFAULT / __MISSING などは触らない
    if (key.startsWith("__")) continue;
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/**
 * 屋内の備品と、建物の外（駐車場）の小物。
 *
 * **ここは屋内スイミングクラブ**なので、樹木・低木・ビーチパラソルは作らない。
 *   屋内 … ベンチ／案内表示／観葉植物（鉢植え）／自販機
 *   屋外 … 停めてある車／街灯／カラーコーン（建物の外は駐車場）
 *
 * どれも足元がタイル中心に来るよう、原点は下端中央（origin 0.5, 1）で使う。
 */
function createOutdoorTextures(g: Phaser.GameObjects.Graphics): void {
  const OUT = 0x22303c;
  const shadow = (cx: number, cy: number, w: number): void => {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cx, cy, w, w * 0.34);
  };
  /** 濃い輪郭つきの丸（観葉植物の葉）。 */
  const blob = (cx: number, cy: number, r: number, fill: number, hi: number): void => {
    g.fillStyle(OUT, 1);
    g.fillCircle(cx, cy, r + 1);
    g.fillStyle(fill, 1);
    g.fillCircle(cx, cy, r);
    g.fillStyle(hi, 1);
    g.fillCircle(cx - r * 0.3, cy - r * 0.35, r * 0.45);
  };

  // --- 観葉植物（屋内向けの鉢植え）---
  g.clear();
  shadow(10, 21, 14);
  blob(10, 10, 6, 0x49b95a, 0x6ad775);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(4, 13, 12, 9, 2);
  g.fillStyle(0xc4713c, 1);
  g.fillRoundedRect(5, 14, 10, 7, 2);
  g.fillStyle(0xdd8a4e, 1);
  g.fillRect(5, 14, 10, 2);
  g.generateTexture("odPot", 20, 24);

  // --- プールサイドのベンチ（屋内）---
  g.clear();
  shadow(16, 21, 24);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(2, 8, 28, 8, 2);
  g.fillStyle(0xe0c089, 1);
  g.fillRoundedRect(3, 9, 26, 6, 2);
  g.fillStyle(0xf0d5a8, 1);
  g.fillRect(3, 9, 26, 2);
  g.fillStyle(OUT, 1);
  g.fillRect(5, 15, 3, 6);
  g.fillRect(24, 15, 3, 6);
  g.generateTexture("inBench", 32, 24);

  // --- 案内表示（コース案内・注意書きの立て看板）---
  g.clear();
  shadow(12, 29, 16);
  g.fillStyle(OUT, 1);
  g.fillRect(10, 16, 4, 13);
  g.fillStyle(0x8d97a1, 1);
  g.fillRect(11, 17, 2, 12);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(1, 2, 22, 15, 2);
  g.fillStyle(0x2e86c1, 1);
  g.fillRoundedRect(2, 3, 20, 13, 2);
  g.fillStyle(0xfdfdfd, 1);
  g.fillRect(4, 5, 16, 2);
  g.fillRect(4, 9, 11, 2);
  g.fillRect(4, 12, 14, 1.5);
  g.generateTexture("inSign", 24, 32);

  // --- 自販機（ロビー・入口まわり）---
  g.clear();
  shadow(12, 33, 18);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(2, 4, 20, 30, 2);
  g.fillStyle(0xe8503f, 1);
  g.fillRoundedRect(3, 5, 18, 28, 2);
  g.fillStyle(0x3d566e, 1);
  g.fillRect(5, 8, 11, 13);
  for (let i = 0; i < 6; i++) {
    g.fillStyle([0xffd166, 0x5ec8f0, 0xff8fb1][i % 3], 1);
    g.fillRect(6 + (i % 3) * 3.4, 9.5 + Math.floor(i / 3) * 6, 2.4, 4.4);
  }
  g.fillStyle(0xfdf6ee, 1);
  g.fillRect(5, 23, 13, 3);
  g.fillStyle(0x2b3d4f, 1);
  g.fillRect(5, 28, 8, 3);
  g.generateTexture("odVending", 24, 36);

  // --- 車（駐車場に停まっているぶんと、車道を走るぶんで同じ絵を使う）---
  //
  // **右向きに描く**。左へ進むときは setFlipX(true) で反転させるので、
  // 前後が分かるようにヘッドライト（黄）とテールランプ（赤）を描き分けておく。
  // 左右対称に描いてしまうと、反転しても向きが変わったように見えない。
  const car = (key: string, body: number, hi: number): void => {
    g.clear();
    shadow(18, 25, 30);
    g.fillStyle(OUT, 1);
    g.fillRoundedRect(2, 6, 32, 19, 5);
    g.fillStyle(body, 1);
    g.fillRoundedRect(3, 7, 30, 17, 4);
    g.fillStyle(hi, 1);
    g.fillRoundedRect(3, 7, 30, 5, 4); // 屋根のハイライト
    g.fillStyle(0x9fd4ef, 1);
    g.fillRoundedRect(7, 9, 9, 6, 2); // 窓（後ろ）
    g.fillRoundedRect(20, 9, 9, 6, 2); // 窓（前）
    g.fillStyle(0x1b242e, 1);
    g.fillEllipse(10, 25, 8, 5); // タイヤ
    g.fillEllipse(26, 25, 8, 5);
    g.fillStyle(0xe0503f, 1);
    g.fillRect(3, 17, 3, 3); // テールランプ（後ろ＝左）
    g.fillStyle(0xfff3c4, 1);
    g.fillRect(30, 17, 3, 3); // ヘッドライト（前＝右）
    g.generateTexture(key, 36, 28);
  };
  car("odCar", 0x4f7fd0, 0x7ba3e8);
  car("odCar2", 0xd04f5a, 0xe87b84);
  // 緑の車は歩道の植え込み（odHedge）と見分けがつかないので使わない
  car("odCar3", 0xe0ae3a, 0xf3ca63);
  car("odCar4", 0xe8e4dc, 0xffffff);

  // --- 街灯 ---
  g.clear();
  shadow(10, 45, 14);
  g.fillStyle(OUT, 1);
  g.fillRect(8, 10, 4, 36);
  g.fillStyle(0x6d7a86, 1);
  g.fillRect(9, 11, 2, 34);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(3, 4, 14, 7, 3);
  g.fillStyle(0xd8dee3, 1);
  g.fillRoundedRect(4, 5, 12, 5, 2);
  g.fillStyle(0xfff3c4, 1);
  g.fillRoundedRect(5, 7, 10, 3, 1);
  g.generateTexture("odLamp", 20, 48);

  // --- 街路樹 ---
  // **建物の中には置かない**（屋内スイミングクラブなので）。歩道の上だけに立てる。
  // 参考画像の外周は、車道ぞいがずっと街路樹で縁取られている。
  g.clear();
  shadow(18, 55, 26);
  g.fillStyle(OUT, 1);
  g.fillRect(15, 30, 7, 26); // 幹
  g.fillStyle(0x7a5836, 1);
  g.fillRect(16, 31, 5, 24);
  blob(18, 22, 13, 0x3f8f4a, 0x5cb463); // 葉（下段）
  blob(11, 15, 9, 0x469a52, 0x63bd6a);
  blob(25, 16, 9, 0x469a52, 0x63bd6a);
  blob(18, 10, 10, 0x50a85c, 0x74cb7c); // 葉（上段：光の当たる面）
  g.generateTexture("odTree", 36, 58);

  // --- 植え込み（低木の帯）---
  g.clear();
  shadow(17, 21, 26);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(2, 6, 30, 15, 6);
  g.fillStyle(0x3f8f4a, 1);
  g.fillRoundedRect(3, 7, 28, 13, 5);
  g.fillStyle(0x56b062, 1);
  g.fillRoundedRect(4, 8, 26, 6, 5); // 上面（光の当たる面）
  g.fillStyle(0x6fc978, 1);
  for (const [x, y] of [[8, 10], [15, 9], [22, 10], [27, 12]] as [number, number][]) {
    g.fillRect(x, y, 3, 2);
  }
  g.generateTexture("odHedge", 34, 24);

  // --- カラーコーン ---
  g.clear();
  shadow(8, 17, 12);
  g.fillStyle(OUT, 1);
  g.beginPath();
  g.moveTo(8, 2);
  g.lineTo(14, 16);
  g.lineTo(2, 16);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xef6c2a, 1);
  g.beginPath();
  g.moveTo(8, 4);
  g.lineTo(12.6, 15);
  g.lineTo(3.4, 15);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xfdfdfd, 1);
  g.fillRect(4.6, 10, 6.8, 2);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(1, 15, 14, 3, 1);
  g.generateTexture("odCone", 16, 20);
}

/**
 * 車道より先＝**世界の外**の地面。
 *
 * 敷地のまわりは「歩道 → 駐車場 → 歩道 → 車道」の帯を1マスずつ描いてあるが、
 * その先は遊びに関係しない。ここを濃いグレーの市松で敷くと、
 * **遠くの地面のほうが建物より目立ってしまう**（模様は面積が広いほど強く見える）。
 *
 * そこで空に近い淡い青の**ほぼ無地**にして、「ここから先は世界の外」に見せる。
 * カメラの背景も空色（COLORS.sky）なので、外へ行くほど空に溶ける。
 *
 * **タイル1枚で敷き詰める**のがねらい。等角の菱形は「幅TILE_W × 高さTILE_H」で
 * きれいに繰り返すので、2×2マスぶん（TILE_W*2 × TILE_H*2）を1枚に描いておけば、
 * TileSprite でどれだけ広い範囲でも繰り返しで埋められる。
 * マップが 37×37 に広がっても、外のぶんのメモリと描画は 1枚ぶんのまま。
 */
function createOutsideTexture(g: Phaser.GameObjects.Graphics): void {
  const w = TILE_W * 2;
  const h = TILE_H * 2;

  g.clear();
  g.fillStyle(ROOM_STYLE.unowned.base, 1);
  g.fillRect(0, 0, w, h);
  // ごく薄いムラだけ入れる（完全な一色だと、拡大したときに面が死んで見える）。
  // 隣り合う色との差は1〜2段ぶんしかないので、模様としては読めない。
  g.fillStyle(ROOM_STYLE.unowned.alt, 1);
  for (const [x, y] of [
    [0, 0], [TILE_W, TILE_H],
  ] as [number, number][]) {
    g.fillRect(x, y, TILE_W, TILE_H);
  }

  g.generateTexture(GRASS_TEXTURE, w, h);
}


/**
 * エッジウォール（セル境界に立つ薄板）1枚。
 *
 * 立方体をやめて薄板にしたので、マスを食わず、部屋の中身が全部見える。
 * 白ベースで描いておき、部屋ごとの色は setTint で乗せる。
 *
 * 座標系：セル境界の始点（＝そのセルのダイヤの上頂点）を原点 S=(0,0) として描き、
 * 描画時は WALL_PAD ぶんずらした原点で配置する。
 *   dir="n" … 北辺。S から右下へ (TILE_W/2, TILE_H/2) 伸びる
 *   dir="w" … 西辺。S から左下へ (-TILE_W/2, TILE_H/2) 伸びる
 * 見える面は「部屋のがわ」なので、板を厚みぶんずらした側に描く。
 */
function drawEdgeWall(
  g: Phaser.GameObjects.Graphics,
  dir: "n" | "w",
  kind: WallTexKind,
  wallH: number,
  thick: number = WALL_THICK,
): { w: number; h: number; ox: number; oy: number } {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const sign = dir === "n" ? 1 : -1; // 辺が伸びる向き（画面X）
  const P = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

  // 厚みのずらし（見える面が手前に来る向き）
  const dx = -sign * thick;
  const dy = Math.round(thick / 2);

  // テクスチャ内での原点 S の位置
  const ox = dir === "n" ? thick : hw;
  const oy = wallH;
  const texW = hw + thick;
  const texH = wallH + hh + dy;

  // ローカル座標（S を原点として）→ テクスチャ座標
  const T = (x: number, y: number): Phaser.Math.Vector2 => P(ox + x, oy + y);

  const S = { x: 0, y: 0 };
  const E = { x: sign * hw, y: hh };

  // 面の明度（tint で色が乗るので、ここでは明暗だけを作る）
  const face = dir === "n" ? 0xd2d2d2 : 0xb0b0b0; // 北面と西面で明度を変えて立体に見せる
  const top = 0xffffff;
  const line = 0x3a2f28;

  if (kind === "door") {
    // ドアは開口。両端に短い枠柱だけ描いて「通れる」ことを示す。
    const postH = wallH;
    for (const p of [S, E]) {
      g.fillStyle(face, 1);
      g.fillPoints(
        [T(p.x, p.y - postH), T(p.x + dx, p.y - postH + dy), T(p.x + dx, p.y + dy), T(p.x, p.y)],
        true,
      );
      g.lineStyle(1, line, 0.8);
      g.strokePoints(
        [T(p.x, p.y - postH), T(p.x + dx, p.y - postH + dy), T(p.x + dx, p.y + dy), T(p.x, p.y)],
        true,
      );
    }
    // 敷居（床に馴染む明るい線）
    g.lineStyle(2, top, 0.9);
    g.lineBetween(T(S.x, S.y).x, T(S.x, S.y).y, T(E.x, E.y).x, T(E.x, E.y).y);
    return { w: texW, h: texH, ox, oy };
  }

  if (kind === "fence") {
    // 柵：支柱＋横2本。向こう側が見えるので水面や中身を隠さない。
    g.lineStyle(2, line, 0.55);
    for (let t = 0; t <= 1.0001; t += 0.25) {
      const px = S.x + (E.x - S.x) * t;
      const py = S.y + (E.y - S.y) * t;
      g.lineBetween(T(px, py).x, T(px, py).y, T(px, py - wallH).x, T(px, py - wallH).y);
    }
    for (const level of [wallH, wallH * 0.55]) {
      g.lineStyle(2.5, top, 0.95);
      g.lineBetween(T(S.x, S.y - level).x, T(S.x, S.y - level).y, T(E.x, E.y - level).x, T(E.x, E.y - level).y);
      g.lineStyle(1, line, 0.6);
      g.lineBetween(
        T(S.x, S.y - level + 2).x,
        T(S.x, S.y - level + 2).y,
        T(E.x, E.y - level + 2).x,
        T(E.x, E.y - level + 2).y,
      );
    }
    return { w: texW, h: texH, ox, oy };
  }

  if (kind === "outer" || kind === "outerGlass") {
    drawOuterWall(g, T, S, E, { dx, dy, wallH, sign, glass: kind === "outerGlass" });
    return { w: texW, h: texH, ox, oy };
  }

  const alpha = kind === "glass" ? 0.42 : 1;

  // 1) 見える垂直面（部屋のがわ）
  g.fillStyle(face, alpha);
  g.fillPoints(
    [
      T(S.x + dx, S.y - wallH + dy),
      T(E.x + dx, E.y - wallH + dy),
      T(E.x + dx, E.y + dy),
      T(S.x + dx, S.y + dy),
    ],
    true,
  );

  // 2) 天面（板の厚み）。ここが明るいと「薄い板」に見える。
  g.fillStyle(top, Math.min(1, alpha + 0.35));
  g.fillPoints(
    [
      T(S.x, S.y - wallH),
      T(E.x, E.y - wallH),
      T(E.x + dx, E.y - wallH + dy),
      T(S.x + dx, S.y - wallH + dy),
    ],
    true,
  );

  // 3) 稜線（境界が沈まないよう、全部の辺に細い濃い線）
  g.lineStyle(1.4, line, 0.85);
  g.strokePoints(
    [
      T(S.x, S.y - wallH),
      T(E.x, E.y - wallH),
      T(E.x + dx, E.y - wallH + dy),
      T(S.x + dx, S.y - wallH + dy),
    ],
    true,
  );
  g.lineBetween(T(S.x + dx, S.y - wallH + dy).x, T(S.x + dx, S.y - wallH + dy).y, T(S.x + dx, S.y + dy).x, T(S.x + dx, S.y + dy).y);
  g.lineBetween(T(E.x + dx, E.y - wallH + dy).x, T(E.x + dx, E.y - wallH + dy).y, T(E.x + dx, E.y + dy).x, T(E.x + dx, E.y + dy).y);
  g.lineBetween(T(S.x + dx, S.y + dy).x, T(S.x + dx, S.y + dy).y, T(E.x + dx, E.y + dy).x, T(E.x + dx, E.y + dy).y);

  if (kind === "glass") {
    // ガラスは斜めのハイライトを1本入れて「透明な板」だと分かるようにする
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(
      T(S.x + dx + sign * 6, S.y + dy - 4).x,
      T(S.x + dx + sign * 6, S.y + dy - 4).y,
      T(S.x + dx + sign * 16, S.y + dy - wallH + 6).x,
      T(S.x + dx + sign * 16, S.y + dy - wallH + 6).y,
    );
  }

  return { w: texW, h: texH, ox, oy };
}

/**
 * 【建物の外壁】1枚ぶん。
 *
 * 内壁との違いは「厚みの天面＝陸屋根の見切り」をはっきり見せること。
 * 上から順に
 *   1) 屋根の見切り（明るい天面。厚みぶんの帯）
 *   2) パラペット（屋根のふち。壁より少し明るい水平帯）
 *   3) 躯体（壁の面。tint でベージュが乗る）
 *   4) 窓（outerGlass のときだけ。濃い青のガラス＋白いサッシ）
 *   5) 基礎（足元の濃い帯。建物が地面に据わって見える）
 * これで「屋根のある建物を外から見ている」という読みになる。
 */
function drawOuterWall(
  g: Phaser.GameObjects.Graphics,
  T: (x: number, y: number) => Phaser.Math.Vector2,
  S: { x: number; y: number },
  E: { x: number; y: number },
  o: { dx: number; dy: number; wallH: number; sign: number; glass: boolean },
): void {
  const { dx, dy, wallH, sign, glass } = o;
  // 面の明度（tint で色が乗るので、ここでは明暗だけを作る）
  const face = 0xd0cabc; // 躯体
  const parapet = 0xe8e2d4; // パラペット（屋根のふち）
  const roof = 0xfdfbf4; // 屋根の見切り（いちばん明るい＝上を向いた面）
  const base = 0x8e877a; // 基礎
  const line = 0x4a4038;

  /** 壁面を、上端 h1 から下端 h2 までの帯で塗る（h は足元からの高さ）。 */
  const band = (h1: number, h2: number, color: number, alpha = 1): void => {
    g.fillStyle(color, alpha);
    g.fillPoints(
      [
        T(S.x + dx, S.y - h1 + dy),
        T(E.x + dx, E.y - h1 + dy),
        T(E.x + dx, E.y - h2 + dy),
        T(S.x + dx, S.y - h2 + dy),
      ],
      true,
    );
  };

  // 3) 躯体
  band(wallH, 0, face);
  // 2) パラペット（上端の帯）
  const capH = Math.max(4, Math.round(wallH * 0.12));
  band(wallH, wallH - capH, parapet);
  // 5) 基礎
  band(Math.min(7, wallH * 0.2), 0, base);

  // 4) 窓（壁が十分に高いときだけ。腰高の手前壁には入れない）
  if (glass && wallH >= 36) {
    const top = wallH - capH - 6;
    const bottom = Math.round(wallH * 0.3);
    const inset = 0.12; // 辺の両端をあけてサッシの見付けを作る
    const winPts = (t0: number, t1: number, h: number): Phaser.Math.Vector2 => {
      void t1;
      return T(S.x + dx + (E.x - S.x) * t0, S.y + dy + (E.y - S.y) * t0 - h);
    };
    const p = (t: number, h: number): Phaser.Math.Vector2 => winPts(t, t, h);
    g.fillStyle(0x3f5a68, 1);
    g.fillPoints([p(inset, top), p(1 - inset, top), p(1 - inset, bottom), p(inset, bottom)], true);
    // 空の映り込み（斜めのハイライト）。ガラスだと一目で分かる手がかり
    g.fillStyle(0x9fc6d8, 0.5);
    g.fillPoints([p(inset, top), p(0.55, top), p(0.28, bottom), p(inset, bottom)], true);
    g.lineStyle(2, 0xf4f1e8, 0.95);
    g.strokePoints([p(inset, top), p(1 - inset, top), p(1 - inset, bottom), p(inset, bottom)], true);
    // 中桟（1本）
    g.lineStyle(1.5, 0xf4f1e8, 0.8);
    g.lineBetween(p(0.5, top).x, p(0.5, top).y, p(0.5, bottom).x, p(0.5, bottom).y);
  }

  // 1) 屋根の見切り（厚みの天面）
  g.fillStyle(roof, 1);
  g.fillPoints(
    [T(S.x, S.y - wallH), T(E.x, E.y - wallH), T(E.x + dx, E.y - wallH + dy), T(S.x + dx, S.y - wallH + dy)],
    true,
  );

  // 稜線（境界が沈まないよう、全部の辺に細い濃い線）
  g.lineStyle(1.6, line, 0.8);
  g.strokePoints(
    [T(S.x, S.y - wallH), T(E.x, E.y - wallH), T(E.x + dx, E.y - wallH + dy), T(S.x + dx, S.y - wallH + dy)],
    true,
  );
  g.lineBetween(
    T(S.x + dx, S.y - wallH + dy).x,
    T(S.x + dx, S.y - wallH + dy).y,
    T(S.x + dx, S.y + dy).x,
    T(S.x + dx, S.y + dy).y,
  );
  g.lineBetween(
    T(E.x + dx, E.y - wallH + dy).x,
    T(E.x + dx, E.y - wallH + dy).y,
    T(E.x + dx, E.y + dy).x,
    T(E.x + dx, E.y + dy).y,
  );
  g.lineBetween(T(S.x + dx, S.y + dy).x, T(S.x + dx, S.y + dy).y, T(E.x + dx, E.y + dy).x, T(E.x + dx, E.y + dy).y);
  void sign;
}

/** エッジウォールのテクスチャキー。 */
export function wallTextureKey(dir: "n" | "w", kind: string, front: boolean): string {
  return `wl_${dir}_${kind}_${front ? "lo" : "hi"}`;
}

/** エッジウォールの原点（テクスチャごとに違うので、生成時に覚えておく）。 */
export const WALL_ORIGINS: Record<string, { x: number; y: number }> = {};

/**
 * エッジウォールのテクスチャを全種類つくる。
 * dir（北辺／西辺）× kind（壁・ガラス・柵・ドア）× 高さ（奥＝高い／手前＝低い）。
 */
function createWallTextures(g: Phaser.GameObjects.Graphics): void {
  const kinds: WallTexKind[] = ["wall", "glass", "fence", "door", "outer", "outerGlass"];
  for (const dir of ["n", "w"] as const) {
    for (const kind of kinds) {
      for (const front of [false, true]) {
        const outer = kind === "outer" || kind === "outerGlass";
        // 柵とドアは元から低いので、手前でも高さを変えない
        const h = outer
          ? front
            ? WALL_H_OUTER.front
            : WALL_H_OUTER.back
          : kind === "fence"
            ? WALL_H.fence
            : kind === "door"
              ? WALL_H.door
              : front
                ? WALL_H.front
                : WALL_H.back;
        const thick = outer ? (front ? WALL_THICK_OUTER.front : WALL_THICK_OUTER.back) : WALL_THICK;
        g.clear();
        const info = drawEdgeWall(g, dir, kind, h, thick);
        const key = wallTextureKey(dir, kind, front);
        g.generateTexture(key, info.w, info.h);
        WALL_ORIGINS[key] = { x: info.ox / info.w, y: info.oy / info.h };
      }
    }
  }
}

/** 底面ダイヤをタイルに合わせた等尺の立方体を、キャンバス下端に基準を置いて描く。 */
function drawIsoCube(g: Phaser.GameObjects.Graphics, wallH: number, top: number, left: number, right: number): void {
  const W = TILE_W;
  const hw = W / 2;
  const hh = TILE_H / 2;
  const H = TILE_H + wallH;
  const baseCy = H - hh; // 底面ダイヤ中心
  const topCy = baseCy - wallH; // 上面ダイヤ中心

  const P = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

  // 左側面
  g.fillStyle(left, 1);
  g.fillPoints([P(0, topCy), P(hw, topCy + hh), P(hw, baseCy + hh), P(0, baseCy)], true);
  // 右側面
  g.fillStyle(right, 1);
  g.fillPoints([P(hw, topCy + hh), P(W, topCy), P(W, baseCy), P(hw, baseCy + hh)], true);
  // 上面
  g.fillStyle(top, 1);
  g.fillPoints([P(hw, topCy - hh), P(W, topCy), P(hw, topCy + hh), P(0, topCy)], true);
}
