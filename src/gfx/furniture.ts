import type Phaser from "phaser";
import { TILE_H, TILE_W } from "../config";

/**
 * 部屋の什器・備品のドット絵（コード生成）。
 *
 * 目的は「どこが何の部屋か、ひと目で分かること」。
 * 細密な描き込みより、シルエットと色で部屋を識別できることを優先している。
 * すべて足元が下端中央に来る（origin 0.5, 1）ので、置くときは isoToWorld のまま使える。
 *
 * 後で PNG に差し替えるときは、キー名と寸法・原点を保てば各シーンは無改修。
 */

/** 什器の描画サイズ（ISOタイルに対して自然に見える大きさ）。 */
const W = TILE_W;

/**
 * 什器の輪郭色。
 *
 * キャラ・壁と同じ考え方で、床から形が浮き立つように濃い線で囲む。
 * 黒ではなく暗い紫寄りにすると、ドット絵が硬くなりすぎない。
 */
export const OUTLINE = 0x2b2230;

/**
 * 器具の色分け（テクスチャキー → 本体の色）。
 *
 * 筋トレ器具はどれも金属なので、素材どおりに描くと全部グレーになって、
 * 床（ラバー）にも紛れて何が置いてあるか分からなくなる。
 * そこで **器具ごとに違う色** を決めておき、本体はこの色で塗る。
 * ここを書き換えるだけで色分けを変えられる。
 *
 * 明度の向きもそろえてある：筋トレルームの床は暗い（ROOM_STYLE.gym）ので、
 * ここはすべて **床より明るい**色にする。どれか1つでも床と同じ明るさにすると、
 * 色が違っても輪郭がぼやけて見分けにくくなる。
 */
export const GEAR_ACCENT: Record<string, number> = {
  // 参考画像のジムに合わせて**グラファイト（濃いグレー）**を基調にする。
  // 原色で塗り分けるとオモチャに見えるので、機種ごとの差は色味をわずかに振るだけ。
  // 見分けるのは色ではなく**形（シルエット）**。
  //
  // **床（ROOM_STYLE.gym＝ほぼ黒のラバー）との明度差 0.15 以上**を保つこと。
  // fixcheck が数値で見張っている。差が小さいと何が置いてあるか分からなくなる。
  gymTread: 0x6f7c8c, // ランニングマシン（やや青みのグレー）
  gymRack: 0x707a84, // ダンベルラック
  gymBench: 0x7a7480, // フラットベンチ（わずかに紫）
  gymLat: 0x78766c, // ラットプルダウン（わずかに黄）
  gymBarbell: 0x6d7a80, // パワーラック
  gymBenchPress: 0x807272, // ベンチプレス（わずかに赤）
  gymSmith: 0x74707e, // スミスマシン
  gymBike: 0x6c7d86, // エアロバイク
  gymCable: 0x6b7684, // ケーブルクロスオーバー
  gymLegPress: 0x737b84, // レッグプレス
  gymRow: 0x6f7780, // シーテッドロー
};

/** その色を明るくする（上を向いた面・ハイライトに使う）。 */
export function lighten(color: number, k = 1.3): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/** その色を暗くする（影の面・縁取りに使う）。 */
export function darken(color: number, k = 0.62): number {
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

/** 共通のパーツ色（役割で固定しておくと、どの器具でも意味が読み取れる）。 */
const STEEL = 0x9aa7b4; // バー・ハンドルなどの明るい金属
const FRAME = 0x4a5560; // 脚・支柱などの暗い金属
const PLATE = 0xd94a3d; // ウェイトプレートは必ず赤
const PLATE_IN = 0x8f2b22;

/** 全什器のテクスチャキー。 */
export const FURNITURE_KEYS = [
  "fnStartBlock",
  "fnLifeguard",
  "fnLocker",
  "fnBenchIn",
  "fnNoticeBoard",
  "fnMirror",
  "fnDeskCoach",
  "fnMeetTable",
  "fnWhiteboard",
  "fnShelf",
  "fnChair",
  "gymTread",
  "gymRack",
  "gymBench",
  "gymLat",
  "gymBarbell",
  "gymBenchPress",
  "gymSmith",
  "gymBike",
  "gymCable",
  "gymLegPress",
  "gymRow",
  "fnPlateTree",
  "fnWaterCooler",
  "fnTowelShelf",
  "fnFloatRack",
  "fnSaunaRoom",
  "fnMassageBed",
  "fnBed",
  "fnBathTub",
  // 温浴施設（風呂・サウナ・外気浴）
  "fnSaunaStove",
  "fnSaunaBench",
  "fnSaunaBucket",
  "fnWashSpot",
  "fnBathSpout",
  "fnLounger",
  "fnPlanter",
  "fnShopCounter",
  "fnPlant",
  "fnVending",
  "fnClock",
  "fnFlagIn",
  "fnDoorL",
  "fnDoorR",
  "fnDoorFrame",
  // フロント（入口）まわり
  "fnFrontDesk",
  "fnSofa",
  "fnFrontMat",
  // キッズコーナー
  "fnKidsSign",
  "fnKidsBoard",
  "fnToyShelf",
  "fnBallPit",
  "fnSlide",
  "fnFoamBlocks",
  "fnFoamSofa",
  "fnPlayMat",
  "fnCraftTable",
  "fnKidsTV",
  // 休憩ラウンジ
  "fnLoungeSign",
  "fnVendingTall",
  "fnMagRack",
  "fnLowShelf",
  "fnCoffeeTable",
  "fnArmchair",
  "fnArmchairWarm",
  "fnRug",
  // 食堂（テーブル・配膳まわりは gfx/roomFurniture.ts で描き直した）
  "fnWallBanner",
  "fnBins",
  // 売店
  "fnShopSign",
  "fnSnackShelf",
  "fnIceChest",
  "fnShopIsland",
  // カフェ（賑わいスペース。カウンター・テーブル・椅子は gfx/roomFurniture.ts で描き直した）
  "fnCafeBackShelf",
  "fnDrinkFridge",
  "fnMenuBoard",
  "fnCafeSign",
  "fnParasol",
  // スタジオ（ダンス・ヨガ）
  "fnStudioMirror",
  "fnYogaMatTeal",
  "fnYogaMatPink",
  "fnYogaMatPurple",
  "fnMatBasket",
  "fnFoamRollers",
  "fnBalanceBalls",
  "fnRopeRack",
  "fnStudioSpeaker",
] as const;

/**
 * カフェの色。
 *
 * 木（カウンター・棚・テーブル）と**緑の椅子**を基調にして、
 * 木の茶色 → 緑 → 白（食器・ケース）の3色で「カフェらしさ」を出す。
 * 床（ROOM_STYLE.cafe＝明るいベージュ）より濃い木を使い、形が浮き立つようにする。
 */
const CAFE_WOOD = 0x9a6b3f;
const CAFE_WOOD_TOP = 0xc08e57;
const CAFE_WOOD_DARK = 0x6d4a2a;
const CAFE_GREEN = 0x4f7d63;
const CAFE_BOARD = 0x2f3a35;

// ------------------------------------------------------------------ 共通の描画方針
//
// 【のっぺりさせないための決めごと】食堂を描き直したときに整理したもの。
// 他の部屋を描き足すときも、この順で描けば見え方がそろう。
//
//   1. **接地影**（shadow）を先に敷く。これが無いと什器が床から浮く。
//   2. 本体は**3トーン**で塗る（→ box の top／left／right）。上向きの面＝明るい／
//      正面＝素の色／側面と底＝暗い。1色で塗ると立体に見えない。
//   3. 天板や座面には**ハイライトの帯**を1本入れる。光の向きを
//      すべて「左上から」に統一すること。部屋ごとに向きが違うと嘘っぽくなる。
//   4. 最後に**輪郭**（outlineRect）で囲う。床や壁と同系色でも形が分かるように。
//
// 床にそろえて寝かせる板（ベッド・長机）と壁に掛ける板は、この方針のうえで
// gfx/roomFurniture.ts の slab／wallQuad を使って描く。
//
// 色を決めるときは「床より明るいか暗いか」を必ず意識する。床と同じ明度だと、
// 色が違っても輪郭がぼやけて何が置いてあるか分からなくなる（→ fixcheck が見張っている）。

/**
 * 接地影。これが無いと什器が床から浮いて見える。
 * 二重にして、真下は濃く・外側は薄くする（床に置かれている感じが出る）。
 */
export function shadow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(cx, cy, w * 1.1, w * 0.4);
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(cx, cy, w * 0.72, w * 0.26);
}

/** 塗った矩形に濃い輪郭を足す（背景と同系色でも形が分かるように）。 */
export function outlineRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
  alpha = 0.9,
): void {
  g.lineStyle(1.4, OUTLINE, alpha);
  if (r > 0) g.strokeRoundedRect(x, y, w, h, r);
  else g.strokeRect(x, y, w, h);
}

/** 色つきの矩形＋輪郭（器具のパーツを描くときの基本形）。 */
export function part(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  r = 0,
): void {
  g.fillStyle(color, 1);
  if (r > 0) g.fillRoundedRect(x, y, w, h, r);
  else g.fillRect(x, y, w, h);
  outlineRect(g, x, y, w, h, r);
}

/** 円形のパーツ＋輪郭（プレート・ホイールなど）。 */
export function disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, inner?: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(cx, cy, r + 1);
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy, r);
  if (inner !== undefined) {
    g.fillStyle(inner, 1);
    g.fillCircle(cx, cy, Math.max(1.5, r * 0.42));
  }
}

/**
 * 奥行きのある箱（簡易アイソメ）。
 * 上面・左面・右面を塗り分けるだけで、平面のスプライトより立体に見える。
 */
export function box(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  baseY: number,
  w: number,
  d: number,
  h: number,
  top: number,
  left: number,
  right: number,
): void {
  const hw = w / 2;
  const hd = d / 2;
  const topY = baseY - h;
  // 左面
  g.fillStyle(left, 1);
  g.fillPoints(
    [
      { x: cx - hw, y: topY - hd + hd },
      { x: cx, y: topY + hd },
      { x: cx, y: baseY + hd },
      { x: cx - hw, y: baseY },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // 右面
  g.fillStyle(right, 1);
  g.fillPoints(
    [
      { x: cx, y: topY + hd },
      { x: cx + hw, y: topY },
      { x: cx + hw, y: baseY },
      { x: cx, y: baseY + hd },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // 上面
  g.fillStyle(top, 1);
  g.fillPoints(
    [
      { x: cx, y: topY - hd },
      { x: cx + hw, y: topY },
      { x: cx, y: topY + hd },
      { x: cx - hw, y: topY },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );

  // 稜線に濃い輪郭を入れる（床や壁と同系色でも箱の形が分かる）
  g.lineStyle(1.4, OUTLINE, 0.9);
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    g.lineBetween(x1, y1, x2, y2);
  };
  // 上面の四辺
  line(cx, topY - hd, cx + hw, topY);
  line(cx + hw, topY, cx, topY + hd);
  line(cx, topY + hd, cx - hw, topY);
  line(cx - hw, topY, cx, topY - hd);
  // 縦の稜線
  line(cx - hw, topY, cx - hw, baseY);
  line(cx, topY + hd, cx, baseY + hd);
  line(cx + hw, topY, cx + hw, baseY);
  // 底辺
  line(cx - hw, baseY, cx, baseY + hd);
  line(cx, baseY + hd, cx + hw, baseY);
}

export function createFurnitureTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key: string, w: number, h: number): void => {
    g.generateTexture(key, w, h);
    g.clear();
  };

  // ---------------------------------------------------------------- プール
  // 飛び込み台（スタート台）
  g.clear();
  shadow(g, 16, 25, 20);
  box(g, 16, 24, 20, 10, 9, 0x3f5a72, 0x2c3f52, 0x25384a);
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(9, 11, 14, 4, 1); // 天板
  g.fillStyle(0xe74c3c, 1);
  g.fillRect(10, 9, 12, 2); // 番号帯
  make("fnStartBlock", 32, 28);

  // 監視台（高いイス）
  g.clear();
  shadow(g, 16, 41, 18);
  g.fillStyle(0xa6733a, 1);
  g.fillRect(9, 20, 3, 20);
  g.fillRect(20, 20, 3, 20);
  g.fillStyle(0xc98f4c, 1);
  g.fillRoundedRect(6, 14, 20, 7, 2); // 座面
  g.fillRoundedRect(6, 2, 20, 13, 2); // 背もたれ
  g.fillStyle(0xe74c3c, 1);
  g.fillRect(8, 5, 16, 3);
  make("fnLifeguard", 32, 44);

  // ---------------------------------------------------------------- ロッカー・ベンチ
  // ロッカー（縦長の扉が4連。更衣室は廃止したが、寮などの什器として使う）
  g.clear();
  shadow(g, 32, 66, 46);
  box(g, 32, 64, 52, 22, 48, 0xa9bccd, 0x74899f, 0x60758b);
  for (let i = 0; i < 4; i++) {
    const x = 10 + i * 11;
    // 扉：面をわずかに凹ませて、上を明るく・下を暗くする
    g.fillStyle(0x8ea5b8, 1);
    g.fillRect(x, 22, 9, 36);
    g.fillStyle(0xb9cbdb, 0.9);
    g.fillRect(x, 22, 9, 3);
    g.fillStyle(0x546a7e, 0.85);
    g.fillRect(x, 54, 9, 4);
    outlineRect(g, x, 22, 9, 36, 0, 0.7);
    // 通気スリット
    g.fillStyle(0x46586a, 0.85);
    for (let k = 0; k < 3; k++) g.fillRect(x + 2, 26 + k * 3, 5, 1.2);
    // 番号プレート
    g.fillStyle(0xe8eef4, 1);
    g.fillRect(x + 2.5, 34, 4, 3);
    // 取っ手
    g.fillStyle(0xdfe6ec, 1);
    g.fillRect(x + 6.5, 41, 2, 6);
    g.fillStyle(0x3c4a58, 1);
    g.fillRect(x + 6.5, 44, 2, 1.4);
  }
  make("fnLocker", 64, 72);

  // 室内ベンチ
  g.clear();
  shadow(g, 16, 21, 22);
  box(g, 16, 20, 24, 9, 6, 0xb5895a, 0x8a6540, 0x745334);
  make("fnBenchIn", 32, 24);

  // ---------------------------------------------------------------- 受付・コーチ室
  // 掲示板
  g.clear();
  shadow(g, 16, 31, 16);
  g.fillStyle(0x6d5334, 1);
  g.fillRect(14, 20, 2, 10);
  g.fillRect(17, 20, 2, 10);
  g.fillStyle(0x8a6540, 1);
  g.fillRoundedRect(3, 2, 26, 19, 2);
  g.fillStyle(0xe8dcc0, 1);
  g.fillRect(5, 4, 22, 15);
  const notes = [0xf7dc6f, 0xaed6f1, 0xf5b7b1, 0xa9dfbf];
  for (let i = 0; i < 4; i++) {
    g.fillStyle(notes[i], 1);
    g.fillRect(7 + (i % 2) * 10, 6 + Math.floor(i / 2) * 7, 8, 5);
  }
  make("fnNoticeBoard", 32, 34);

  // コーチ室のデスク
  g.clear();
  shadow(g, 16, 25, 24);
  box(g, 16, 24, 26, 12, 11, 0x8a6540, 0x664a2e, 0x553d26);
  g.fillStyle(0xdfe6ec, 1);
  g.fillRect(9, 10, 8, 5); // 書類
  g.fillStyle(0x3498db, 1);
  g.fillRect(19, 9, 6, 6); // モニタ
  make("fnDeskCoach", 32, 28);

  // イス
  g.clear();
  shadow(g, 16, 21, 14);
  g.fillStyle(0x4a5c6e, 1);
  g.fillRect(10, 13, 2, 7);
  g.fillRect(20, 13, 2, 7);
  g.fillStyle(0x5f7c93, 1);
  g.fillRoundedRect(8, 9, 16, 5, 2);
  g.fillRoundedRect(8, 1, 16, 9, 2);
  make("fnChair", 32, 24);

  // ---------------------------------------------------------------- スタジオ
  // 鏡張りの壁（背の高いパネル）
  g.clear();
  shadow(g, 16, 37, 22);
  g.fillStyle(0x5b7086, 1);
  g.fillRoundedRect(3, 0, 58, 72, 3); // フレーム
  g.fillStyle(0x8ea5b8, 1);
  g.fillRoundedRect(5, 2, 54, 68, 2);
  g.fillStyle(0xc7dfee, 1);
  g.fillRect(8, 5, 48, 62); // 鏡面
  g.fillStyle(0xdff0fa, 1);
  g.fillRect(8, 5, 48, 20); // 上半分は明るく（天井の映り込み）
  g.fillStyle(0xffffff, 0.5);
  g.fillPoints(
    [
      { x: 12, y: 64 },
      { x: 34, y: 8 },
      { x: 44, y: 8 },
      { x: 22, y: 64 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  ); // 斜めの反射
  g.fillStyle(0xffffff, 0.28);
  g.fillPoints(
    [
      { x: 30, y: 64 },
      { x: 50, y: 12 },
      { x: 54, y: 12 },
      { x: 36, y: 64 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  outlineRect(g, 3, 0, 58, 72, 3, 0.8);
  make("fnMirror", 64, 76);

  // ---------------------------------------------------------------- 筋トレルーム
  //
  // 器具はどれも金属なので、そのまま描くと全部グレーになって見分けが付かない。
  // そこで器具ごとに「本体の色」を決めて、はっきり違う色にしている。
  //   ランニングマシン = 濃紺 ／ ダンベルラック = 緑
  //   フラットベンチ・ベンチプレス = 赤 ／ ラットプル = 橙
  //   スミスマシン = 紫 ／ エアロバイク = 水色
  // プレートは赤、パッドは青系というふうに、パーツの役割でも色を固定する。

  // ================================================================ 筋トレルームの器具
  //
  // 【描き方の方針】参考画像のジムに寄せて、**2倍の解像度（60〜80px）**で描く。
  // 以前は32pxで、器具ごとに原色を割り当てて見分けていた。それだとオモチャに見えて、
  // 参考画像の「業務用マシンがずらりと並ぶジム」にならない。
  //
  //   ・本体はグラファイト（濃いグレー）。床（ラバー＝ほぼ黒）との**明度差**で形を出す
  //   ・面ごとに 上＝明るい / 中 / 下＝暗い の3階調を必ず塗り分けて立体にする
  //   ・可動部（バー・ケーブル・ハンドル）は明るいスチール、ウェイトは赤で固定
  //   ・**シルエットで機種が分かる形**にする（色ではなく形で見分ける）
  //
  // GEAR_ACCENT は機種ごとのごく淡い色味。並んだときに単調にならない程度の差だけ付ける。

  /** マシン本体の面。上を明るく・下を暗くして、平面のスプライトより立体に見せる。 */
  const machine = (x: number, y: number, w: number, h: number, base: number, r = 2): void => {
    part(g, x, y, w, h, base, r);
    g.fillStyle(lighten(base, 1.35), 0.85);
    g.fillRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h * 0.22));
    g.fillStyle(darken(base, 0.6), 0.8);
    g.fillRect(x + 1, y + h - Math.max(1, h * 0.24), Math.max(1, w - 2), Math.max(1, h * 0.22));
  };

  /** ウェイトスタック（板が段になって見える）。 */
  const stack = (x: number, y: number, w: number, h: number, rows: number): void => {
    part(g, x, y, w, h, 0x3c444e, 1);
    const step = (h - 3) / rows;
    for (let i = 0; i < rows; i++) {
      const yy = y + 2 + i * step;
      g.fillStyle(0x6d7885, 1);
      g.fillRect(x + 1.5, yy, w - 3, Math.max(1.2, step - 1.4));
      g.fillStyle(0x252b33, 0.7);
      g.fillRect(x + 1.5, yy + Math.max(1.2, step - 1.4), w - 3, 1);
    }
    g.fillStyle(0xc9d3dd, 1);
    g.fillRect(x + w / 2 - 1, y - 7, 2, 9);
  };

  /** バーベルのシャフト＋プレート（左右対称）。 */
  const barWithPlates = (cx: number, y: number, half: number, pr: number): void => {
    part(g, cx - half, y, half * 2, 3.4, STEEL, 1);
    disc(g, cx - half + 5, y + 1.7, pr, PLATE, PLATE_IN);
    disc(g, cx + half - 5, y + 1.7, pr, PLATE, PLATE_IN);
    disc(g, cx - half + 12, y + 1.7, pr * 0.8, PLATE, PLATE_IN);
    disc(g, cx + half - 12, y + 1.7, pr * 0.8, PLATE, PLATE_IN);
  };

  // --- ランニングマシン（参考画像では窓ぎわに一列に並ぶ）---
  const tread = GEAR_ACCENT.gymTread;
  g.clear();
  shadow(g, 32, 56, 40);
  box(g, 32, 50, 46, 20, 7, lighten(tread, 1.25), darken(tread, 0.55), darken(tread, 0.42));
  g.fillStyle(0x14181f, 1);
  g.fillRect(12, 36, 40, 9);
  outlineRect(g, 12, 36, 40, 9);
  g.fillStyle(0x8fa3b8, 0.5);
  for (let i = 0; i < 7; i++) g.fillRect(15 + i * 5.4, 39.5, 3.4, 1.2);
  machine(19, 12, 5, 26, darken(tread, 0.85), 1);
  machine(40, 12, 5, 26, darken(tread, 0.85), 1);
  part(g, 16, 20, 32, 4, STEEL, 2);
  machine(14, 2, 36, 14, tread, 3);
  g.fillStyle(0x101820, 1);
  g.fillRect(18, 5, 28, 8);
  g.fillStyle(0x35e07a, 0.9);
  for (let i = 0; i < 5; i++) g.fillRect(20 + i * 5, 12 - i * 1.4, 3, 1 + i * 1.4);
  make("gymTread", 64, 60);

  // --- ダンベルラック（2段。参考画像のように長く並ぶ）---
  const rack = GEAR_ACCENT.gymRack;
  g.clear();
  shadow(g, 32, 46, 48);
  box(g, 32, 44, 52, 18, 14, lighten(rack, 1.2), darken(rack, 0.72), darken(rack, 0.55));
  for (let i = 0; i < 6; i++) {
    const x = 9 + i * 8.4;
    for (const y of [24, 34]) {
      g.fillStyle(STEEL, 1);
      g.fillRect(x - 3, y - 1.1, 6, 2.2);
      disc(g, x - 4.4, y, 3.4, 0x4e5661, 0x2b3138);
      disc(g, x + 4.4, y, 3.4, 0x4e5661, 0x2b3138);
      g.fillStyle(0xaeb8c4, 0.5);
      g.fillRect(x - 5.6, y - 3.2, 1.6, 2);
    }
  }
  make("gymRack", 64, 50);

  // --- フラットベンチ ---
  const bench = GEAR_ACCENT.gymBench;
  g.clear();
  shadow(g, 32, 40, 40);
  machine(16, 26, 6, 14, FRAME, 1);
  machine(42, 26, 6, 14, FRAME, 1);
  machine(12, 16, 40, 10, bench, 3);
  g.fillStyle(0x1b222b, 0.3);
  g.fillRect(14, 23, 36, 2);
  machine(8, 8, 20, 10, darken(bench, 0.85), 3);
  make("gymBench", 64, 44);

  // --- ラットプルダウン（高いフレーム＋ウェイトスタック＋プルバー）---
  const lat = GEAR_ACCENT.gymLat;
  g.clear();
  shadow(g, 32, 72, 40);
  machine(12, 8, 7, 62, darken(lat, 0.8), 1);
  machine(45, 8, 7, 62, darken(lat, 0.8), 1);
  machine(10, 2, 44, 8, lat, 2);
  g.fillStyle(0xd7dee6, 1);
  g.fillRect(31, 10, 2, 16);
  part(g, 18, 25, 28, 4, STEEL, 2);
  g.fillStyle(0x2b3138, 1);
  g.fillRect(20, 29, 3, 4);
  g.fillRect(41, 29, 3, 4);
  stack(24, 34, 16, 30, 7);
  machine(14, 58, 36, 8, darken(lat, 0.7), 2);
  make("gymLat", 64, 76);

  // --- パワーラック（4本柱のケージにバーベル）---
  const barbell = GEAR_ACCENT.gymBarbell;
  g.clear();
  shadow(g, 32, 66, 44);
  machine(10, 6, 7, 58, darken(barbell, 0.8), 1);
  machine(47, 6, 7, 58, darken(barbell, 0.8), 1);
  machine(8, 2, 48, 7, barbell, 2);
  g.fillStyle(0x35e07a, 1);
  g.fillRect(15, 24, 5, 4);
  g.fillRect(44, 24, 5, 4);
  barWithPlates(32, 22, 26, 7);
  machine(14, 56, 36, 9, darken(barbell, 0.62), 2);
  make("gymBarbell", 64, 70);

  // --- ベンチプレス ---
  const bp = GEAR_ACCENT.gymBenchPress;
  g.clear();
  shadow(g, 36, 60, 56);
  machine(12, 22, 7, 34, FRAME, 1);
  machine(56, 22, 7, 34, FRAME, 1);
  machine(24, 40, 28, 8, darken(bp, 0.7), 2);
  machine(18, 28, 42, 12, bp, 3);
  machine(10, 24, 18, 11, darken(bp, 0.85), 3);
  barWithPlates(37, 16, 30, 8);
  make("gymBenchPress", 76, 64);

  // --- スミスマシン（左右のレールを滑るシャフト）---
  const smith = GEAR_ACCENT.gymSmith;
  g.clear();
  shadow(g, 34, 78, 52);
  machine(8, 4, 9, 70, smith, 1);
  machine(52, 4, 9, 70, smith, 1);
  machine(6, 1, 57, 8, lighten(smith, 1.2), 2);
  g.fillStyle(0x6c7684, 1);
  g.fillRect(14, 8, 2, 62);
  g.fillRect(55, 8, 2, 62);
  barWithPlates(34, 28, 28, 8);
  g.fillStyle(0x35e07a, 1);
  for (const y of [22, 34, 46]) {
    g.fillRect(17, y, 5, 3);
    g.fillRect(47, y, 5, 3);
  }
  machine(16, 64, 38, 10, darken(smith, 0.6), 2);
  make("gymSmith", 70, 82);

  // --- エアロバイク ---
  const bike = GEAR_ACCENT.gymBike;
  g.clear();
  shadow(g, 32, 60, 40);
  machine(10, 48, 44, 8, FRAME, 2);
  machine(26, 18, 7, 32, bike, 1);
  machine(42, 10, 7, 30, bike, 1);
  part(g, 36, 6, 20, 4, STEEL, 2);
  machine(14, 12, 22, 9, 0x333f4c, 3);
  disc(g, 22, 38, 14, darken(bike, 0.75), darken(bike, 0.45));
  g.lineStyle(1.4, 0xdff2fb, 0.6);
  for (let a = 0; a < 6; a++) {
    const rad = (a * Math.PI) / 6;
    g.lineBetween(22 - Math.cos(rad) * 12, 38 - Math.sin(rad) * 12, 22 + Math.cos(rad) * 12, 38 + Math.sin(rad) * 12);
  }
  disc(g, 22, 38, 3.2, STEEL);
  machine(40, 2, 18, 12, 0x101820, 2);
  make("gymBike", 64, 64);

  // --- ケーブルクロスオーバー（参考画像の中央に並ぶ大型マシン）---
  g.clear();
  shadow(g, 36, 74, 56);
  machine(8, 6, 8, 64, 0x525c68, 1);
  machine(56, 6, 8, 64, 0x525c68, 1);
  machine(6, 2, 60, 7, 0x6b7684, 2);
  g.lineStyle(1.6, 0xd7dee6, 1);
  g.lineBetween(14, 12, 30, 32);
  g.lineBetween(58, 12, 42, 32);
  part(g, 26, 31, 8, 3, STEEL, 1);
  part(g, 38, 31, 8, 3, STEEL, 1);
  stack(16, 34, 14, 32, 8);
  stack(42, 34, 14, 32, 8);
  make("gymCable", 72, 78);

  // --- レッグプレス（斜めのシルエットが特徴）---
  g.clear();
  shadow(g, 36, 56, 52);
  machine(10, 34, 52, 12, 0x4c5560, 2);
  machine(14, 20, 24, 16, 0x5b6572, 2);
  machine(12, 12, 14, 12, 0x6d7885, 2);
  g.fillStyle(0x3c444e, 1);
  g.fillPoints(
    [
      { x: 40, y: 34 },
      { x: 62, y: 12 },
      { x: 68, y: 18 },
      { x: 46, y: 40 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  disc(g, 62, 15, 7, PLATE, PLATE_IN);
  disc(g, 55, 22, 7, PLATE, PLATE_IN);
  make("gymLegPress", 72, 60);

  // --- シーテッドロー（座って引くマシン）---
  g.clear();
  shadow(g, 30, 56, 44);
  machine(10, 34, 44, 12, 0x4c5560, 2);
  machine(14, 20, 22, 16, 0x5b6572, 2);
  machine(12, 10, 12, 12, 0x6d7885, 2);
  stack(38, 12, 14, 30, 7);
  g.fillStyle(0xd7dee6, 1);
  g.fillRect(26, 24, 14, 1.8);
  part(g, 21, 21, 6, 7, STEEL, 1);
  make("gymRow", 60, 60);

  // ---------------------------------------------------------------- 部屋の備品
  // プレートツリー（買った筋トレルームぶん置かれる。色つきプレートで賑やかに）
  g.clear();
  shadow(g, 16, 31, 20);
  part(g, 14, 8, 4, 22, FRAME); // 支柱
  part(g, 9, 28, 14, 3, darken(FRAME, 0.85)); // 台座
  const plateColors = [0xd94a3d, 0x2ba8d4, 0xf2c318, 0x35e07a];
  for (let i = 0; i < 4; i++) {
    const y = 11 + i * 4.6;
    disc(g, 10, y, 3.4, plateColors[i], 0x2b2230);
    disc(g, 22, y, 3.4, plateColors[i], 0x2b2230);
  }
  make("fnPlateTree", 32, 34);

  // 給水機（青いボトルが目印）
  g.clear();
  shadow(g, 16, 31, 18);
  box(g, 16, 30, 18, 9, 16, 0xe8eef4, 0xc3cdd8, 0xa8b3c0);
  part(g, 11, 4, 10, 11, 0x2ba8d4, 2); // ボトル（水）
  g.fillStyle(0xdff2fb, 0.75);
  g.fillRect(12.5, 5.5, 3, 8);
  part(g, 13, 20, 6, 4, 0x33414f, 1); // 注ぎ口
  make("fnWaterCooler", 32, 34);

  // ビート板ラック（色とりどりのビート板が挿してある。プールサイドの目印）
  g.clear();
  shadow(g, 16, 29, 22);
  box(g, 16, 28, 24, 11, 8, 0x7f8c99, 0x5d6a76, 0x4b5661);
  const boards = [0x2ba8d4, 0xf2c318, 0xd94a3d, 0x35e07a];
  for (let i = 0; i < 4; i++) {
    part(g, 6 + i * 5.4, 8, 4.4, 13, boards[i], 1); // 立てたビート板
  }
  make("fnFloatRack", 32, 32);

  // タオル棚（白いタオルが積まれた棚）
  g.clear();
  shadow(g, 16, 29, 22);
  box(g, 16, 28, 24, 11, 20, 0xb98a5a, 0x8d6640, 0x745334);
  for (let r = 0; r < 3; r++) {
    const y = 11 + r * 5.4;
    part(g, 7, y, 8, 4, 0xf4f6f7, 1); // タオル（白）
    part(g, 17, y, 8, 4, 0xaed6f1, 1); // タオル（水色）
  }
  make("fnTowelShelf", 32, 32);

  // ---------------------------------------------------------------- 会議室
  // 長机
  g.clear();
  shadow(g, 16, 23, 28);
  box(g, 16, 22, 30, 13, 8, 0xc9a26b, 0x9a7a4a, 0x82653c);
  g.fillStyle(0xdfe6ec, 1);
  g.fillRect(8, 10, 6, 4);
  g.fillRect(18, 10, 6, 4);
  make("fnMeetTable", 32, 26);

  // ホワイトボード
  g.clear();
  shadow(g, 16, 35, 22);
  g.fillStyle(0x8a939b, 1);
  g.fillRect(8, 26, 3, 8);
  g.fillRect(21, 26, 3, 8);
  g.fillStyle(0xb0bec5, 1);
  g.fillRoundedRect(2, 1, 28, 26, 2);
  g.fillStyle(0xf7f9fa, 1);
  g.fillRect(4, 3, 24, 22);
  g.fillStyle(0x2c5f8f, 1);
  g.fillRect(7, 7, 14, 2);
  g.fillRect(7, 12, 18, 2);
  g.fillStyle(0xe74c3c, 1);
  g.fillRect(7, 17, 10, 2);
  make("fnWhiteboard", 32, 38);

  // 資料棚
  g.clear();
  shadow(g, 16, 33, 22);
  box(g, 16, 32, 24, 11, 24, 0xa1794a, 0x77582f, 0x624926);
  g.fillStyle(0x4a3526, 1);
  for (let r = 0; r < 3; r++) g.fillRect(6, 12 + r * 6, 20, 1.5);
  const books = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 5; i++) {
      g.fillStyle(books[(i + r) % books.length], 1);
      g.fillRect(7 + i * 3.6, 14 + r * 6, 2.6, 4);
    }
  }
  make("fnShelf", 32, 36);

  // ---------------------------------------------------------------- マッサージエリア
  // サウナ室（扉と木のベンチが見える小屋）
  g.clear();
  shadow(g, 16, 39, 28);
  box(g, 16, 38, 30, 14, 30, 0xd9a066, 0x9c6b38, 0x7d5329);
  g.fillStyle(0x6b4a2a, 1);
  g.fillRoundedRect(11, 16, 12, 22, 1); // 扉
  g.fillStyle(0x2c3e50, 0.5);
  g.fillRect(13, 19, 8, 7); // 窓
  g.fillStyle(0xf7dc6f, 0.7);
  g.fillRect(13, 19, 8, 7);
  g.fillStyle(0xc98f4c, 1);
  g.fillRect(3, 28, 7, 3); // 外のベンチ
  g.fillStyle(0xe74c3c, 1);
  g.fillCircle(17, 30, 1.4); // 使用中ランプ
  make("fnSaunaRoom", 32, 42);

  // マッサージベッド（2倍解像度。脚・マット・枕・タオルまで描く）
  g.clear();
  shadow(g, 32, 46, 50);
  g.fillStyle(0x4e5860, 1);
  g.fillRect(13, 30, 5, 14); // 脚
  g.fillRect(46, 30, 5, 14);
  g.fillStyle(0x3b444b, 1);
  g.fillRect(13, 42, 5, 2);
  g.fillRect(46, 42, 5, 2);
  g.fillStyle(0x6fa7cc, 1);
  g.fillRoundedRect(8, 16, 48, 16, 4); // マット
  g.fillStyle(0x8fc4e2, 1);
  g.fillRoundedRect(8, 16, 48, 6, 4); // 上面のハイライト
  g.fillStyle(0x3f6c8c, 0.8);
  g.fillRect(10, 28, 44, 3); // 下の影
  outlineRect(g, 8, 16, 48, 16, 4, 0.8);
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(12, 9, 18, 9, 3); // 枕
  g.fillStyle(0xd8e2e8, 1);
  g.fillRect(14, 15, 14, 2);
  outlineRect(g, 12, 9, 18, 9, 3, 0.7);
  g.fillStyle(0xe8f2f7, 1);
  g.fillRect(38, 18, 14, 4); // 敷いたタオル
  make("fnMassageBed", 64, 50);

  // 寮のベッド（掛け布団と枕。人数ぶん並べる）
  g.clear();
  shadow(g, 16, 25, 26);
  g.fillStyle(0x6b4a2a, 1); // 木のフレーム
  g.fillRoundedRect(3, 8, 26, 14, 2);
  g.fillStyle(0x8f5f33, 1);
  g.fillRect(3, 6, 3, 16); // ヘッドボード
  g.fillStyle(0xf4f6f7, 1); // シーツ
  g.fillRoundedRect(5, 9, 22, 10, 2);
  g.fillStyle(0x5dade2, 1); // 掛け布団
  g.fillRoundedRect(11, 9, 16, 10, 2);
  g.fillStyle(0xffffff, 1); // 枕
  g.fillRoundedRect(6, 10, 6, 7, 2);
  outlineRect(g, 3, 8, 26, 14, 2);
  make("fnBed", 32, 28);

  // 湯船（1台もの。いまの風呂は床そのものが湯船なので、この絵は互換のために残してある）。
  g.clear();
  shadow(g, 16, 24, 28);
  g.fillStyle(0x8d99a6, 1); // 石のふち
  g.fillRoundedRect(2, 6, 28, 18, 4);
  g.fillStyle(0x5dade2, 1); // 湯
  g.fillRoundedRect(5, 9, 22, 12, 3);
  g.fillStyle(0xaed6f1, 0.8);
  g.fillRoundedRect(7, 10, 8, 4, 2); // 反射
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(11, 5, 2.2); // 湯気
  g.fillCircle(18, 3, 2.8);
  g.fillCircle(24, 5, 2.0);
  outlineRect(g, 2, 6, 28, 18, 4);
  make("fnBathTub", 32, 28);

  // ---------------------------------------------------------------- 温浴施設（風呂・サウナ・外気浴）
  //
  // 参考画像の温浴フロアを目標に、**素材の質感**で3施設を描き分けている。
  //   風呂   … 白〜水色のタイル、金属のカラン、透明感のある湯と湯気
  //   サウナ … 濃い木の板目、黒い鉄のストーブ、赤くおこった石（暖色の照明）
  //   外気浴 … 明るいウッドデッキ、布張りのリクライニングチェア、植栽
  // どれも「上面は明るく、側面は暗く、接地に影」を守って立体に見せ、
  // 面の中に1〜2段の階調（板目・タイルの目地・布のシワ）を入れて、のっぺりを避ける。

  /** 木の板目（同じ向きの細い線を、明暗2色で不規則に入れる。温浴の板壁用）。 */
  const plankGrain = (x: number, y: number, w: number, h: number, dark: number, light: number): void => {
    for (let i = 0; i < h; i += 3) {
      g.fillStyle(i % 6 === 0 ? light : dark, i % 6 === 0 ? 0.5 : 0.32);
      g.fillRect(x + (i % 4), y + i, w - (i % 5), 1);
    }
  };

  // --- サウナストーブ（黒い鉄の本体・焼けた石・赤い熱の照り返し）---
  g.clear();
  shadow(g, 24, 52, 32);
  // 本体（下ほど暗い＝影が溜まる）
  box(g, 24, 50, 30, 14, 26, 0x4a4f55, 0x2a2e33, 0x1e2227);
  g.fillStyle(0x62686f, 0.5);
  g.fillRect(11, 26, 26, 2); // 天板ぎわのハイライト
  // 焚き口（赤くおこった火が見える）
  g.fillStyle(0x14181c, 1);
  g.fillRoundedRect(14, 34, 20, 11, 2);
  g.fillStyle(0xd9531e, 1);
  g.fillRoundedRect(16, 36, 16, 7, 2);
  g.fillStyle(0xf5a623, 0.95);
  g.fillRoundedRect(17, 38, 14, 4, 2);
  g.fillStyle(0xffe08a, 0.85);
  g.fillRect(19, 39, 9, 2);
  outlineRect(g, 14, 34, 20, 11, 2, 0.8);
  // サウナストーン（大小の石を積む。上のほうを明るくして熱を持たせる）
  const stones: [number, number, number, number][] = [
    [13, 22, 5.5, 0x6d6a66],
    [19, 20, 6.5, 0x807c77],
    [26, 21, 5.5, 0x6a6763],
    [32, 23, 4.5, 0x565350],
    [16, 17, 5.0, 0x8d8983],
    [24, 16, 5.5, 0x9a958e],
    [30, 18, 4.5, 0x7a766f],
  ];
  for (const [sx, sy, r, c] of stones) {
    g.fillStyle(darken(c, 0.55), 1);
    g.fillCircle(sx, sy + 1, r);
    g.fillStyle(c, 1);
    g.fillCircle(sx, sy, r);
    g.fillStyle(lighten(c, 1.35), 0.9);
    g.fillCircle(sx - r * 0.3, sy - r * 0.35, r * 0.42);
  }
  // 石のすきまから漏れる熱
  g.fillStyle(0xff7a3c, 0.35);
  g.fillEllipse(23, 21, 22, 8);
  g.fillStyle(0xffc266, 0.25);
  g.fillEllipse(23, 19, 14, 5);
  // 立ちのぼる熱気
  g.fillStyle(0xffd9a0, 0.22);
  g.fillCircle(18, 9, 4);
  g.fillCircle(26, 5, 5);
  g.fillCircle(31, 11, 3.4);
  make("fnSaunaStove", 48, 56);

  // --- サウナのベンチ（明るい木のすのこ座面＋脚。床の濃い木から浮き立つ色にする）---
  //
  // 段違いに2台置いて「二段ベンチ」に見せるので、絵そのものは1段の長いベンチ。
  // 二段を1枚の絵に描くと、等角では板が重なって「木の塊」に見えてしまう。
  g.clear();
  shadow(g, 32, 33, 46);
  // 脚（4本。手前2本を明るく、奥2本を暗くして奥行きを出す）
  g.fillStyle(0x6b4720, 1);
  g.fillRect(12, 20, 4, 12);
  g.fillRect(48, 20, 4, 12);
  g.fillStyle(0x8a5f34, 1);
  g.fillRect(18, 24, 4, 10);
  g.fillRect(42, 24, 4, 10);
  // 座面（明るい木。上面 → 手前の小口の順で立体に）
  box(g, 32, 24, 54, 20, 7, 0xdda868, 0xa87840, 0x8b6031);
  // すのこの隙間（上面に等間隔の溝）
  g.fillStyle(0x8a5f34, 0.55);
  for (let i = 0; i < 6; i++) g.fillRect(10 + i * 8.4, 10, 1.6, 9);
  plankGrain(8, 12, 48, 6, 0x9a6c3c, 0xf0c58e);
  // 背板（壁ぎわの一枚板。上に細いハイライト）
  g.fillStyle(0x9c6c3c, 1);
  g.fillRect(7, 2, 50, 5);
  g.fillStyle(0xd9a86a, 0.8);
  g.fillRect(7, 2, 50, 1.6);
  outlineRect(g, 7, 2, 50, 5, 0, 0.7);
  make("fnSaunaBench", 64, 36);

  // --- サウナの桶とひしゃく（ロウリュの小物）---
  g.clear();
  shadow(g, 16, 23, 16);
  box(g, 15, 22, 15, 8, 9, 0xd3a066, 0x9e7038, 0x82592a);
  g.fillStyle(0x8a5f2c, 1);
  g.fillRect(9, 14, 13, 1.4); // たが（金属の帯）
  g.fillStyle(0x6fc0dc, 0.9);
  g.fillEllipse(15, 15, 11, 4); // 中の水
  g.fillStyle(0xa9dcef, 0.7);
  g.fillEllipse(13.5, 14.5, 5, 2);
  g.fillStyle(0x9e7038, 1);
  g.fillRect(21, 8, 8, 2); // ひしゃくの柄
  g.fillStyle(0xd3a066, 1);
  g.fillEllipse(28, 10, 7, 5);
  outlineRect(g, 25, 8, 6, 4, 1, 0.6);
  make("fnSaunaBucket", 32, 26);

  // --- 洗い場（鏡・シャワー・カラン・風呂椅子・桶）---
  //
  // 「壁に付いた四角い箱」に見えないよう、**縦長のシャワー柱**として描く。
  // 上からシャワーヘッド → 鏡 → カラン → 蛇口、と縦に並べると、
  // 小さくても「頭を洗う場所」だと読み取れる。
  g.clear();
  shadow(g, 24, 54, 30);
  // 壁の腰パネル（水色タイル。目地を細かく入れる）
  g.fillStyle(0xd8e9f2, 1);
  g.fillRect(10, 2, 28, 40);
  g.fillStyle(0xecf6fa, 0.9);
  g.fillRect(10, 2, 28, 9);
  g.lineStyle(1, 0xa8c6d5, 0.5);
  for (let x = 10; x <= 38; x += 4.5) g.lineBetween(x, 2, x, 42);
  for (let y = 2; y <= 42; y += 4.5) g.lineBetween(10, y, 38, y);
  outlineRect(g, 10, 2, 28, 40, 0, 0.55);
  // シャワーの支柱とヘッド（いちばん上。ここが「洗い場」の目印）
  g.fillStyle(0xa9b8c2, 1);
  g.fillRect(22, 5, 3, 12);
  g.fillStyle(0xd7dfe5, 1);
  g.fillRoundedRect(17, 2, 13, 5, 2);
  g.fillStyle(0x7d8f9c, 1);
  g.fillRect(19, 6, 9, 1.6);
  outlineRect(g, 17, 2, 13, 5, 2, 0.7);
  // 落ちるお湯（細い水色の線）
  g.fillStyle(0xbfe8f5, 0.75);
  for (let i = 0; i < 4; i++) g.fillRect(19.5 + i * 2.4, 8, 1.2, 6);
  // 鏡（縦長。斜めの映り込みを入れて「ガラス」に見せる）
  g.fillStyle(0x8fa6b4, 1);
  g.fillRoundedRect(14, 16, 20, 12, 2);
  g.fillStyle(0xd6ecf5, 1);
  g.fillRoundedRect(15, 17, 18, 10, 2);
  g.fillStyle(0xffffff, 0.5);
  g.fillPoints(
    [
      { x: 16, y: 26 },
      { x: 23, y: 17 },
      { x: 27, y: 17 },
      { x: 20, y: 26 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  outlineRect(g, 14, 16, 20, 12, 2, 0.7);
  // カラン（湯＝赤／水＝青のハンドルと蛇口）
  g.fillStyle(0xc7d2d9, 1);
  g.fillRect(16, 31, 3.5, 5);
  g.fillRect(28.5, 31, 3.5, 5);
  g.fillStyle(0xe74c3c, 1);
  g.fillCircle(17.7, 30, 2.2);
  g.fillStyle(0x3498db, 1);
  g.fillCircle(30.2, 30, 2.2);
  g.fillStyle(0xb8c4cc, 1);
  g.fillRect(21, 33, 6, 2.4); // 蛇口
  g.fillStyle(0x93a3ad, 1);
  g.fillRect(23, 35, 2, 2);
  // 風呂椅子（低い脚つきの腰かけ）
  box(g, 15, 52, 15, 9, 6, 0xeef5f9, 0xb3c7d2, 0x93a9b6);
  g.fillStyle(0x8ca3b1, 1);
  g.fillRect(10, 49, 2, 3);
  g.fillRect(18, 49, 2, 3);
  // 桶（中にお湯が入っている）
  box(g, 33, 52, 13, 7, 6, 0xf4f8fa, 0xc3d1da, 0xa6b6c1);
  g.fillStyle(0x8ec9dd, 0.85);
  g.fillEllipse(33, 47, 9, 3.4);
  g.fillStyle(0xcdeef8, 0.8);
  g.fillEllipse(31.5, 46.5, 4, 1.6);
  make("fnWashSpot", 48, 58);

  // --- 湯口（石組みから湯が落ちる。湯気つき）---
  g.clear();
  shadow(g, 20, 30, 22);
  // 石組み
  box(g, 20, 29, 26, 12, 14, 0x8d99a6, 0x606c78, 0x4c5764);
  g.fillStyle(0x707d8a, 1);
  g.fillRect(9, 18, 10, 5);
  g.fillRect(20, 17, 9, 6);
  g.fillStyle(0xa4b0bb, 0.6);
  g.fillRect(9, 18, 10, 1.4);
  // 湯の落ち口
  g.fillStyle(0x2f3a44, 1);
  g.fillRoundedRect(15, 20, 9, 4, 1);
  g.fillStyle(0x9fe0f0, 0.95);
  g.fillRect(17, 23, 5, 7);
  g.fillStyle(0xe4f7fd, 0.85);
  g.fillRect(18, 23, 2, 7);
  // はねた湯
  g.fillStyle(0xd6f2fa, 0.7);
  g.fillEllipse(19.5, 30, 12, 4);
  // 湯気
  g.fillStyle(0xffffff, 0.3);
  g.fillCircle(14, 9, 4);
  g.fillCircle(22, 5, 5);
  g.fillCircle(27, 11, 3.4);
  make("fnBathSpout", 40, 34);

  // --- リクライニングチェア（外気浴。木のフレームに布を張った寝椅子）---
  //
  // 等角の床にまっすぐ寝かせると板にしか見えないので、
  // **座面（低く手前）→ 背もたれ（奥へ高く）** の折れを付けて、真横から見た寝椅子にする。
  // 布を明るい色にして、ウッドデッキの茶色から確実に浮き立たせる。
  g.clear();
  shadow(g, 32, 42, 48);
  // 脚（手前・奥）
  g.fillStyle(0x7a5836, 1);
  g.fillRect(13, 30, 4.5, 11);
  g.fillRect(44, 24, 4.5, 17);
  g.fillStyle(0x5b4126, 1);
  g.fillRect(13, 39, 4.5, 2);
  g.fillRect(44, 39, 4.5, 2);
  // 座面（手前の水平な部分）
  g.fillStyle(0x4d9fbd, 1);
  g.fillPoints(
    [
      { x: 8, y: 33 },
      { x: 34, y: 33 },
      { x: 40, y: 27 },
      { x: 14, y: 27 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  g.fillStyle(0x6fc0dc, 1);
  g.fillPoints(
    [
      { x: 8, y: 31 },
      { x: 34, y: 31 },
      { x: 40, y: 25 },
      { x: 14, y: 25 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // 背もたれ（奥へ立ち上がる面。上ほど明るくして光を受けているように）
  g.fillStyle(0x5cb2ce, 1);
  g.fillPoints(
    [
      { x: 14, y: 27 },
      { x: 40, y: 27 },
      { x: 56, y: 8 },
      { x: 30, y: 8 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  g.fillStyle(0x8fd6ea, 1);
  g.fillPoints(
    [
      { x: 22, y: 17 },
      { x: 48, y: 17 },
      { x: 56, y: 8 },
      { x: 30, y: 8 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // 布のシワ（背もたれの向きに沿った細い線）
  g.lineStyle(1.2, 0x3b8aa6, 0.5);
  for (let i = 0; i < 5; i++) g.lineBetween(17 + i * 5.5, 26, 33 + i * 5.5, 9);
  // フレーム（縁を木で締める）
  g.lineStyle(2, 0x6d4f31, 1);
  g.beginPath();
  g.moveTo(8, 33);
  g.lineTo(14, 27);
  g.lineTo(30, 8);
  g.strokePath();
  g.beginPath();
  g.moveTo(34, 33);
  g.lineTo(40, 27);
  g.lineTo(56, 8);
  g.strokePath();
  g.lineStyle(1.6, 0x2b2230, 0.7);
  g.lineBetween(8, 33, 34, 33);
  // 枕とたたんだタオル（湯上がりの小物）
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(38, 11, 12, 5, 2);
  g.fillStyle(0xd3e4ec, 1);
  g.fillRect(38, 14, 12, 1.6);
  outlineRect(g, 38, 11, 12, 5, 2, 0.6);
  make("fnLounger", 64, 44);

  // --- 植栽のプランター（外気浴の縁取り。細い葉を放射状に）---
  g.clear();
  shadow(g, 24, 48, 28);
  box(g, 24, 47, 28, 13, 12, 0xa8815a, 0x7a5c3c, 0x63492e);
  g.fillStyle(0x4c3722, 1);
  g.fillEllipse(24, 36, 22, 6); // 土
  const leaves: [number, number, number][] = [
    [24, 6, 0],
    [16, 11, -0.5],
    [32, 11, 0.5],
    [11, 18, -0.85],
    [37, 18, 0.85],
    [20, 8, -0.22],
    [28, 8, 0.22],
  ];
  for (const [lx, ly, tilt] of leaves) {
    const g1 = 0x2f7f43;
    const g2 = 0x49a95c;
    g.fillStyle(g1, 1);
    g.fillPoints(
      [
        { x: 24, y: 36 },
        { x: lx - 3 + tilt * 3, y: ly + 6 },
        { x: lx, y: ly },
        { x: lx + 3 + tilt * 3, y: ly + 7 },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
    g.fillStyle(g2, 0.8);
    g.fillPoints(
      [
        { x: 24, y: 36 },
        { x: lx - 1 + tilt * 3, y: ly + 6 },
        { x: lx, y: ly },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
  }
  g.fillStyle(0x8f6c47, 0.8);
  g.fillRect(10, 40, 28, 1.6); // プランターの見切り
  make("fnPlanter", 48, 52);

  // 売店のカウンター（レジとガラスケース。青い前面が売店の目印）
  g.clear();
  shadow(g, 22, 30, 34);
  // 本体（前面は青。売店の色）
  g.fillStyle(0x2e6f9e, 1);
  g.fillRoundedRect(3, 14, 38, 16, 2);
  g.fillStyle(0x255c84, 1);
  g.fillRect(3, 26, 38, 4);
  g.fillStyle(0xc9a06a, 1);
  g.fillRoundedRect(3, 11, 38, 5, 2); // 木の天板
  // ガラスケース（ゴーグル・キャップが見える）
  g.fillStyle(0xd8eef6, 0.92);
  g.fillRoundedRect(6, 3, 20, 9, 1.5);
  g.fillStyle(0x2e86c1, 1);
  g.fillRect(8, 7, 5, 3);
  g.fillStyle(0xe74c3c, 1);
  g.fillRect(15, 6, 4, 4);
  g.fillStyle(0xf7dc6f, 1);
  g.fillRect(21, 7, 3, 3);
  g.fillStyle(0xffffff, 0.5);
  g.fillRect(7, 4, 17, 1.6);
  outlineRect(g, 6, 3, 20, 9, 1.5);
  // レジ
  box(g, 34, 11, 10, 8, 7, 0xdfe6ec, 0xb6c0c9, 0x98a3ac);
  g.fillStyle(0x2f4a5c, 1);
  g.fillRect(31, 5, 6, 3); // 画面
  outlineRect(g, 3, 11, 38, 19, 2);
  make("fnShopCounter", 46, 34);

  // ---------------------------------------------------------------- 小物（生活感）
  // 観葉植物
  g.clear();
  shadow(g, 16, 33, 18);
  g.fillStyle(0xb5651d, 1);
  g.fillRoundedRect(10, 24, 12, 9, 2); // 鉢
  g.fillStyle(0x8a4a12, 1);
  g.fillRect(10, 24, 12, 2);
  g.fillStyle(0x2f9e5a, 1);
  g.fillEllipse(16, 16, 22, 20);
  g.fillStyle(0x3fbf70, 1);
  g.fillEllipse(12, 12, 14, 13);
  g.fillEllipse(21, 14, 13, 12);
  g.fillStyle(0x1e7a42, 1);
  g.fillRect(15, 18, 2, 8);
  make("fnPlant", 32, 36);

  // 自動販売機
  g.clear();
  shadow(g, 16, 35, 22);
  box(g, 16, 34, 24, 11, 28, 0xe05a4a, 0xa8392c, 0x8a2c21);
  g.fillStyle(0x1c3550, 1);
  g.fillRoundedRect(6, 8, 14, 14, 1); // 商品窓
  const cans = [0xf1c40f, 0x3498db, 0x2ecc71, 0xffffff, 0xe74c3c, 0x9b59b6];
  for (let i = 0; i < 6; i++) {
    g.fillStyle(cans[i], 1);
    g.fillRect(8 + (i % 3) * 4.4, 10 + Math.floor(i / 3) * 6, 3.2, 5);
  }
  g.fillStyle(0xf4f6f7, 1);
  g.fillRect(22, 10, 5, 10); // ボタン列
  g.fillStyle(0x2c3e50, 1);
  g.fillRect(6, 24, 14, 4); // 取り出し口
  make("fnVending", 32, 38);

  // ---------------------------------------------------------------- フロント（入口）
  //
  // 参考画像のフロントに寄せる：明るい木のカウンター、待合のソファ、床のロゴ。
  // 入口は 2×1 マスと小さいので、**横に長いカウンター1台**で「受付らしさ」を作り、
  // 手前に床マット、両脇に緑を置いて奥行きを出す。
  g.clear();
  shadow(g, 30, 34, 50);
  // 等角の箱で作る（天板の面が見えると「カウンター」に見える）。
  // 明るい木＝参考画像のフロント。天板だけ濃くして、上に小物を置く。
  box(g, 30, 32, 52, 20, 16, 0xd8b58c, 0xa88054, 0x8d6740);
  // 天板の縁（濃い木）
  g.fillStyle(0x7a5535, 1);
  g.fillPoints(
    [
      { x: 4, y: 16 },
      { x: 30, y: 4 },
      { x: 56, y: 16 },
      { x: 30, y: 28 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  g.fillStyle(0xa07a4e, 1);
  g.fillPoints(
    [
      { x: 8, y: 16 },
      { x: 30, y: 6 },
      { x: 52, y: 16 },
      { x: 30, y: 26 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  // 天板の上：モニタと案内板
  g.fillStyle(0x33404d, 1);
  g.fillRoundedRect(14, 4, 11, 8, 1);
  g.fillStyle(0x7fc7e8, 1);
  g.fillRect(15, 5, 9, 5);
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(34, 6, 12, 7, 1);
  g.fillStyle(0x2e86c1, 1);
  g.fillRect(35.5, 8, 9, 1.6);
  g.fillRect(35.5, 10.4, 6, 1.4);
  make("fnFrontDesk", 60, 40);

  // 待合のソファ（参考画像の青緑）
  g.clear();
  shadow(g, 22, 24, 30);
  g.fillStyle(0x3f8f86, 1);
  g.fillRoundedRect(4, 6, 36, 12, 3); // 背もたれ
  g.fillStyle(0x57b3a6, 1);
  g.fillRoundedRect(4, 13, 36, 10, 3); // 座面
  g.fillStyle(0x2f7168, 1);
  g.fillRoundedRect(2, 11, 6, 12, 2); // ひじ掛け
  g.fillRoundedRect(36, 11, 6, 12, 2);
  g.fillStyle(0x8a939b, 1);
  g.fillRect(7, 22, 3, 3); // 脚
  g.fillRect(34, 22, 3, 3);
  outlineRect(g, 2, 6, 40, 18, 3);
  make("fnSofa", 44, 28);

  // 床のロゴマット（**床に寝かせて**置く。原点は中央＝FittingSpec.originY 0.5）
  g.clear();
  {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const dia = (cx: number, cy: number, w: number, h: number, color: number, alpha = 1): void => {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(cx, cy - h / 2);
      g.lineTo(cx + w / 2, cy);
      g.lineTo(cx, cy + h / 2);
      g.lineTo(cx - w / 2, cy);
      g.closePath();
      g.fillPath();
    };
    dia(hw, hh, TILE_W * 0.96, TILE_H * 0.96, 0xc9b898);
    dia(hw, hh, TILE_W * 0.86, TILE_H * 0.86, 0xeee5d2);
    // クラブのしるし（波）。床に描いてあるので、はっきり濃く入れる
    g.fillStyle(0x2e86c1, 1);
    g.fillEllipse(hw, hh - TILE_H * 0.1, TILE_W * 0.44, TILE_H * 0.2);
    g.fillStyle(0xeee5d2, 1);
    g.fillEllipse(hw, hh - TILE_H * 0.16, TILE_W * 0.4, TILE_H * 0.16);
    g.fillStyle(0x2e86c1, 1);
    g.fillEllipse(hw, hh + TILE_H * 0.08, TILE_W * 0.34, TILE_H * 0.15);
    g.fillStyle(0xeee5d2, 1);
    g.fillEllipse(hw, hh + TILE_H * 0.03, TILE_W * 0.3, TILE_H * 0.12);
    g.fillStyle(0x1f6f9e, 1);
    g.fillEllipse(hw, hh + TILE_H * 0.22, TILE_W * 0.16, TILE_H * 0.07);
  }
  make("fnFrontMat", TILE_W, TILE_H);

  // 掛け時計
  g.clear();
  g.fillStyle(0x3a2f28, 1);
  g.fillCircle(16, 14, 12);
  g.fillStyle(0xf4f6f7, 1);
  g.fillCircle(16, 14, 10);
  g.fillStyle(0x2c3e50, 1);
  g.fillRect(15, 7, 2, 8);
  g.fillRect(16, 13, 7, 2);
  make("fnClock", 32, 28);

  // 館内ののぼり
  g.clear();
  shadow(g, 16, 39, 12);
  g.fillStyle(0x8a939b, 1);
  g.fillRect(14, 6, 3, 33);
  g.fillStyle(0x2e9fd6, 1);
  g.fillRect(17, 6, 13, 22);
  g.fillStyle(0xffffff, 1);
  g.fillRect(19, 10, 9, 2);
  g.fillRect(19, 15, 9, 2);
  g.fillRect(19, 20, 6, 2);
  make("fnFlagIn", 32, 40);

  // ---------------------------------------------------------------- 玄関の自動ドア
  //
  // 正面壁の行に沿って置くので、タイルの上辺（左上→右下）に合わせた平行四辺形で描く。
  // 左右のパネルが外側へスライドして開く。
  const DOOR_H = 26;
  const panel = (mirror: boolean): void => {
    const w = W / 2;
    const hh = TILE_H / 2;
    const baseY = DOOR_H + hh;
    const P = (x: number, y: number): Phaser.Types.Math.Vector2Like => ({
      x: mirror ? w - x : x,
      y,
    });
    // ガラス面
    g.fillStyle(0x9fd8ec, 0.92);
    g.fillPoints(
      [P(0, baseY - hh - DOOR_H), P(w, baseY - DOOR_H), P(w, baseY), P(0, baseY - hh)],
      true,
    );
    // 映り込み
    g.fillStyle(0xffffff, 0.4);
    g.fillPoints(
      [P(1, baseY - hh - DOOR_H + 3), P(w * 0.45, baseY - DOOR_H + 6), P(w * 0.45, baseY - DOOR_H + 14), P(1, baseY - hh - DOOR_H + 11)],
      true,
    );
    // 枠（濃い輪郭）
    g.lineStyle(2, 0x2b3a45, 0.95);
    g.beginPath();
    const pts = [P(0, baseY - hh - DOOR_H), P(w, baseY - DOOR_H), P(w, baseY), P(0, baseY - hh)];
    g.moveTo(pts[0].x!, pts[0].y!);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x!, pts[i].y!);
    g.closePath();
    g.strokePath();
    // 縦の桟
    g.lineStyle(1.4, 0x516a78, 0.9);
    g.lineBetween(P(w * 0.5, baseY - hh * 0.5 - DOOR_H).x!, P(w * 0.5, baseY - hh * 0.5 - DOOR_H).y!, P(w * 0.5, baseY - hh * 0.5).x!, P(w * 0.5, baseY - hh * 0.5).y!);
  };

  g.clear();
  panel(false);
  make("fnDoorL", W / 2, DOOR_H + TILE_H / 2 + 2);
  g.clear();
  panel(true);
  make("fnDoorR", W / 2, DOOR_H + TILE_H / 2 + 2);

  // ドア枠（開いていても閉じていても見える柱と庇）
  g.clear();
  g.fillStyle(0x4a5c68, 1);
  g.fillRect(0, 0, 3, DOOR_H + 6);
  g.fillRect(W - 3, 0, 3, DOOR_H + 6);
  g.fillStyle(0x5f7482, 1);
  g.fillRect(0, 0, W, 4);
  g.fillStyle(0xf7dc6f, 1);
  g.fillRect(4, 1, W - 8, 2); // 庇の色帯
  make("fnDoorFrame", W, DOOR_H + 8);

  // ---------------------------------------------------------------- カフェ
  //
  // 参考にしたのは「カウンターで淹れて、木のテーブルと緑の椅子で過ごす」店。
  // 部屋は4×3マスしかないので、**奥にカウンターまわり／手前に客席**と割り切り、
  // 什器ひとつひとつの形（エスプレッソマシン・ショーケース・冷蔵ケース）で
  // 何の部屋かが分かるようにしてある。

  // バックシェルフ（カップと豆の瓶が並ぶ背面の棚）
  g.clear();
  shadow(g, 24, 46, 34);
  // 棚の箱
  g.fillStyle(CAFE_WOOD, 1);
  g.fillRoundedRect(6, 6, 36, 40, 2);
  g.fillStyle(CAFE_WOOD_DARK, 1);
  g.fillRect(6, 6, 36, 3);
  // 3段の棚板と、乗っているもの
  const shelfRow = (y: number, colors: number[]): void => {
    g.fillStyle(CAFE_WOOD_TOP, 1);
    g.fillRect(8, y, 32, 2);
    colors.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillRect(10 + i * 7, y - 6, 5, 6);
      g.fillStyle(lighten(c, 1.25), 1);
      g.fillRect(10 + i * 7, y - 6, 5, 1.5);
    });
  };
  shelfRow(20, [0xe8eef3, 0xe8eef3, 0xd9e2e8, 0xe8eef3]);
  shelfRow(32, [0xb07a46, 0x8c5a30, 0xb07a46, 0x8c5a30]);
  shelfRow(44, [0x6d9c80, 0xd94a3d, 0xe8b06a, 0x6d9c80]);
  outlineRect(g, 6, 6, 36, 40, 2);
  make("fnCafeBackShelf", 48, 50);

  // ドリンク冷蔵ケース（ガラス扉の中に色とりどりのボトル）
  g.clear();
  shadow(g, 18, 46, 26);
  g.fillStyle(0xdfe6ec, 1);
  g.fillRoundedRect(3, 4, 30, 42, 3);
  g.fillStyle(0xb9c4cd, 1);
  g.fillRect(3, 4, 30, 4); // 上部の照明帯
  // ガラス扉
  g.fillStyle(0xcfe8f2, 0.95);
  g.fillRoundedRect(6, 10, 24, 32, 2);
  // ボトル（3段）
  const bottles = [0xd94a3d, 0xf2c53d, 0x4f9ed8, 0x6d9c80, 0xd98cc0, 0xe8863d];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      g.fillStyle(bottles[(row * 4 + i) % bottles.length], 1);
      g.fillRect(8 + i * 5.5, 13 + row * 10, 4, 8);
      g.fillStyle(0xffffff, 0.5);
      g.fillRect(8 + i * 5.5, 13 + row * 10, 4, 1.5);
    }
    g.fillStyle(0xaebac4, 1);
    g.fillRect(7, 21 + row * 10, 22, 1.4); // 棚板
  }
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(8, 11, 20, 3); // ガラスの反射
  outlineRect(g, 3, 4, 30, 42, 3);
  make("fnDrinkFridge", 36, 50);

  // メニュー黒板（壁ぎわに立てる）
  g.clear();
  shadow(g, 17, 42, 22);
  g.fillStyle(CAFE_WOOD_DARK, 1);
  g.fillRoundedRect(2, 2, 30, 38, 2); // 枠
  g.fillStyle(CAFE_BOARD, 1);
  g.fillRect(5, 5, 24, 32); // 黒板
  g.fillStyle(0xf4e3c8, 1);
  g.fillRect(9, 8, 16, 3); // MENU の帯
  // 品書き（読めなくてよい。行があれば「お品書き」に見える）
  for (let i = 0; i < 5; i++) {
    g.fillStyle(0xd8dee3, 0.9);
    g.fillRect(8, 15 + i * 4.4, 12 + ((i * 5) % 8), 1.4);
  }
  outlineRect(g, 2, 2, 30, 38, 2);
  make("fnMenuBoard", 34, 44);

  // A型看板（床に置く小さな黒板。カップの絵つき）
  g.clear();
  shadow(g, 15, 30, 18);
  g.fillStyle(CAFE_WOOD_DARK, 1);
  g.fillRoundedRect(3, 4, 24, 24, 2);
  g.fillStyle(CAFE_BOARD, 1);
  g.fillRect(6, 7, 18, 18);
  // カップ
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(10, 13, 8, 6, 1);
  g.fillStyle(0xe8eef3, 1);
  g.fillRect(18, 14, 2.5, 3); // 取っ手
  g.fillStyle(0xc98b5e, 1);
  g.fillRect(11, 14, 6, 1.6); // 中身
  g.fillStyle(0xd8dee3, 0.9);
  g.fillRect(9, 9, 10, 1.4); // 文字の行
  // 脚（A型に開いている）
  g.fillStyle(CAFE_WOOD_DARK, 1);
  g.fillRect(7, 26, 2.5, 4);
  g.fillRect(21, 26, 2.5, 4);
  outlineRect(g, 3, 4, 24, 24, 2);
  make("fnCafeSign", 30, 32);

  // パラソル席のパラソル（テラス感を出す）
  g.clear();
  shadow(g, 22, 50, 20);
  g.fillStyle(0x8d949c, 1);
  g.fillRect(21, 18, 2.5, 32); // 支柱
  // 傘（白地に色帯）
  g.fillStyle(0xf4f6f7, 1);
  g.fillTriangle(22, 2, 2, 20, 42, 20);
  g.fillStyle(CAFE_GREEN, 1);
  g.fillTriangle(22, 2, 12, 11, 32, 11);
  g.fillStyle(0xdfe6ec, 1);
  g.fillRect(2, 19, 40, 2);
  g.fillStyle(0x2b2230, 0.25);
  g.fillTriangle(22, 2, 42, 20, 22, 20); // 右半分に陰
  make("fnParasol", 44, 52);

  // ---------------------------------------------------------------- キッズコーナー
  //
  // 参考にしたのは「屋内キッズパーク」。
  // **ボールプール・すべり台・おもちゃ棚・プレイマット**の4つが揃えば、
  // 子どもの遊び場だと一目で分かる。色はパステル（黄・水色・桃・黄緑）で、
  // 他の部屋（木と青）とはっきり違う色味にして、遠目でも見分けられるようにする。

  /** キッズの色（パステル）。 */
  const KID_YELLOW = 0xf4d35e;
  const KID_BLUE = 0x7fc7e8;
  const KID_PINK = 0xf6a6b2;
  const KID_GREEN = 0x9ed67f;
  const KID_ORANGE = 0xf0a45e;

  // 壁の看板（くじらと虹。文字は帯で表す）
  g.clear();
  shadow(g, 24, 32, 30);
  g.fillStyle(0xc9a06a, 1);
  g.fillRoundedRect(2, 3, 44, 24, 2);
  g.fillStyle(0xdcb87f, 1);
  g.fillRect(4, 5, 40, 20);
  // 文字の帯
  g.fillStyle(0x4a6b8a, 1);
  g.fillRect(16, 9, 22, 3.4);
  g.fillRect(16, 15, 16, 3);
  // くじら
  g.fillStyle(KID_BLUE, 1);
  g.fillEllipse(10, 13, 13, 8);
  g.fillTriangle(4, 10, 4, 16, 8, 13);
  g.fillStyle(0xf7fbfd, 1);
  g.fillRect(11, 11, 2, 2);
  // 虹
  for (let i = 0; i < 3; i++) {
    g.lineStyle(1.6, [0xe8635a, KID_YELLOW, KID_GREEN][i], 1);
    g.beginPath();
    g.arc(34, 24, 6 + i * 2, Math.PI, 0);
    g.strokePath();
  }
  g.lineStyle(0, 0, 0);
  outlineRect(g, 2, 3, 44, 24, 2);
  make("fnKidsSign", 48, 34);

  // 小さな黒板（ひらがなのお品書き）
  g.clear();
  shadow(g, 16, 36, 22);
  g.fillStyle(0xb5651d, 1);
  g.fillRoundedRect(2, 3, 28, 32, 2);
  g.fillStyle(0x35473f, 1);
  g.fillRect(5, 6, 22, 26);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0xf2f6f8, 0.9);
    g.fillRect(8, 10 + i * 5.5, 12 + ((i * 3) % 6), 2);
  }
  outlineRect(g, 2, 3, 28, 32, 2);
  make("fnKidsBoard", 32, 38);

  // おもちゃ棚（低い棚に色とりどりのおもちゃと絵本）
  g.clear();
  shadow(g, 24, 30, 40);
  g.fillStyle(0xc9a06a, 1);
  g.fillRoundedRect(3, 8, 42, 22, 2);
  g.fillStyle(0xdcb87f, 1);
  g.fillRect(3, 8, 42, 3);
  const toys = [KID_PINK, KID_BLUE, KID_YELLOW, KID_GREEN, KID_ORANGE, 0xb79ae0];
  for (let row = 0; row < 2; row++) {
    const y = 18 + row * 9;
    for (let i = 0; i < 7; i++) {
      const c = toys[(row * 3 + i) % toys.length];
      g.fillStyle(c, 1);
      g.fillRect(6 + i * 5.6, y - 6, 4.4, 6);
      g.fillStyle(lighten(c, 1.25), 1);
      g.fillRect(6 + i * 5.6, y - 6, 4.4, 1.4);
    }
    g.fillStyle(0xb08a5e, 1);
    g.fillRect(5, y, 38, 1.8);
  }
  outlineRect(g, 3, 8, 42, 22, 2);
  make("fnToyShelf", 48, 34);

  // ボールプール（黄色い囲いの中にボールがぎっしり）
  //
  // 【ボールは囲いの内側に】先に底とボールを描き、**あとから手前の壁をかぶせる**。
  // 壁を先に描くと、ボールが壁の上に浮いて「盛られたボール」に見えてしまう。
  g.clear();
  shadow(g, 32, 40, 56);
  // 底（内側の面）
  g.fillStyle(0xe0c98a, 1);
  g.fillRoundedRect(5, 8, 54, 26, 3);
  // ボール（内側にぎっしり）
  const balls = [KID_PINK, KID_BLUE, KID_GREEN, 0xf7fbfd, KID_ORANGE, 0xb79ae0];
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 8; i++) {
      const bx = 9 + i * 6.4 + (row % 2) * 3;
      const by = 12 + row * 4.6;
      g.fillStyle(balls[(row * 3 + i) % balls.length], 1);
      g.fillCircle(bx, by, 3.4);
      g.fillStyle(0xffffff, 0.45);
      g.fillCircle(bx - 1.1, by - 1.1, 1.1);
    }
  }
  // 手前の壁（ボールにかぶせる）と左右の壁
  g.fillStyle(KID_YELLOW, 1);
  g.fillRoundedRect(3, 30, 58, 10, 2);
  g.fillStyle(0xd9b24a, 1);
  g.fillRect(3, 37, 58, 3);
  g.fillStyle(0xd9b24a, 1);
  g.fillRect(3, 8, 3.5, 30);
  g.fillRect(57.5, 8, 3.5, 30);
  // 奥の壁（上端。囲いだと分かる細い帯）
  g.fillStyle(0xb8933a, 1);
  g.fillRect(3, 6, 58, 3.5);
  outlineRect(g, 3, 6, 58, 34, 2);
  make("fnBallPit", 64, 44);

  // すべり台（木のやぐらに緑のスロープ。横にはしご）
  g.clear();
  shadow(g, 22, 44, 30);
  // 台と柱
  g.fillStyle(0xb5651d, 1);
  g.fillRect(28, 16, 4, 26);
  g.fillRect(40, 16, 4, 26);
  // はしご（横木を数本。登って滑る遊具だと分かるように）
  g.fillStyle(0x8f6630, 1);
  g.fillRect(44, 20, 2.4, 22);
  g.fillRect(49, 20, 2.4, 22);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0xb5651d, 1);
    g.fillRect(44, 23 + i * 5, 7.4, 2);
  }
  box(g, 36, 18, 18, 12, 6, 0xdcb87f, 0xb5843f, 0x8f6630);
  // 屋根
  g.fillStyle(KID_GREEN, 1);
  g.fillTriangle(36, 2, 24, 14, 48, 14);
  g.fillStyle(0x7ab863, 1);
  g.fillTriangle(36, 2, 36, 14, 48, 14);
  // スロープ
  g.fillStyle(KID_GREEN, 1);
  g.fillPoints(
    [
      { x: 30, y: 20 },
      { x: 36, y: 20 },
      { x: 12, y: 42 },
      { x: 4, y: 42 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  g.fillStyle(0x7ab863, 1);
  g.fillPoints(
    [
      { x: 36, y: 20 },
      { x: 38, y: 22 },
      { x: 14, y: 44 },
      { x: 12, y: 42 },
    ] as Phaser.Types.Math.Vector2Like[],
    true,
  );
  make("fnSlide", 56, 48);

  // やわらかブロック（積み木のように置かれた大きなブロック）
  g.clear();
  shadow(g, 22, 28, 34);
  box(g, 14, 26, 16, 10, 9, KID_PINK, darken(KID_PINK, 0.82), darken(KID_PINK, 0.7));
  box(g, 29, 26, 16, 10, 9, KID_BLUE, darken(KID_BLUE, 0.82), darken(KID_BLUE, 0.7));
  box(g, 21, 17, 16, 10, 9, KID_GREEN, darken(KID_GREEN, 0.82), darken(KID_GREEN, 0.7));
  make("fnFoamBlocks", 44, 32);

  // やわらかソファ（曲がった形のキッズソファ）
  g.clear();
  shadow(g, 22, 26, 34);
  g.fillStyle(KID_YELLOW, 1);
  g.fillRoundedRect(3, 10, 18, 14, 6);
  g.fillStyle(KID_BLUE, 1);
  g.fillRoundedRect(17, 8, 16, 16, 6);
  g.fillStyle(KID_GREEN, 1);
  g.fillRoundedRect(28, 12, 14, 12, 5);
  g.fillStyle(0xffffff, 0.25);
  g.fillRoundedRect(5, 11, 14, 4, 3);
  make("fnFoamSofa", 46, 28);

  // プレイマット（床に敷く。市松のパステル）
  g.clear();
  const mat = [KID_GREEN, KID_BLUE, KID_PINK, KID_YELLOW];
  // 4枚のタイルをひし形に並べる（床に敷くので、マスの向きに合わせる）
  const tile = (cx: number, cy: number, color: number): void => {
    g.fillStyle(color, 0.85);
    g.fillPoints(
      [
        { x: cx, y: cy - 9 },
        { x: cx + 17, y: cy },
        { x: cx, y: cy + 9 },
        { x: cx - 17, y: cy },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
  };
  tile(34, 11, mat[0]);
  tile(51, 20, mat[1]);
  tile(34, 29, mat[2]);
  tile(17, 20, mat[3]);
  make("fnPlayMat", 68, 40);

  // お絵かきテーブル（白い低いテーブルにクレヨンと画用紙、丸椅子2つ）
  g.clear();
  shadow(g, 24, 28, 36);
  // 丸椅子
  g.fillStyle(KID_PINK, 1);
  g.fillEllipse(8, 24, 12, 7);
  g.fillStyle(KID_BLUE, 1);
  g.fillEllipse(40, 24, 12, 7);
  // テーブル
  g.fillStyle(0xdfe6ec, 1);
  g.fillRoundedRect(6, 10, 36, 8, 3);
  g.fillStyle(0xf4f6f7, 1);
  g.fillRoundedRect(6, 7, 36, 7, 3);
  g.fillStyle(0xc6d2da, 1);
  g.fillRect(11, 17, 3, 7);
  g.fillRect(34, 17, 3, 7);
  // 画用紙とクレヨン
  g.fillStyle(0xffffff, 1);
  g.fillRect(14, 6, 11, 5);
  g.fillStyle(KID_ORANGE, 1);
  g.fillRect(16, 7.5, 6, 1.4);
  for (let i = 0; i < 4; i++) {
    g.fillStyle([0xe8635a, KID_BLUE, KID_GREEN, KID_YELLOW][i], 1);
    g.fillRect(29 + i * 2.4, 5, 1.8, 5);
  }
  outlineRect(g, 6, 7, 36, 11, 3);
  make("fnCraftTable", 48, 30);

  // テレビ（低い台の上。アニメが映っている）
  g.clear();
  shadow(g, 20, 32, 28);
  box(g, 20, 30, 30, 12, 8, 0xdcb87f, 0xb5843f, 0x8f6630);
  // 画面
  g.fillStyle(0x2b3038, 1);
  g.fillRoundedRect(4, 4, 32, 18, 2);
  g.fillStyle(0x9fd8f0, 1);
  g.fillRect(6, 6, 28, 14);
  g.fillStyle(KID_GREEN, 1);
  g.fillRect(6, 15, 28, 5); // 地面
  g.fillStyle(KID_YELLOW, 1);
  g.fillCircle(12, 10, 3); // お日さま
  g.fillStyle(0xf7fbfd, 1);
  g.fillEllipse(24, 9, 10, 4); // 雲
  outlineRect(g, 4, 4, 32, 18, 2);
  make("fnKidsTV", 40, 34);

  // ---------------------------------------------------------------- 休憩ラウンジ
  //
  // 参考にしたのは「自販機コーナーとソファ席のあるリフレッシュラウンジ」。
  // 奥の壁ぎわに**看板・自販機・雑誌ラック**、手前に**ラグを敷いたソファ席**。
  // 部屋は4×2マスと浅いので、奥＝立ち寄る場所／手前＝座る場所と割り切っている。

  // ラウンジの看板（暗い板に白い文字とカップ）
  g.clear();
  shadow(g, 22, 30, 26);
  g.fillStyle(0x8d949c, 1);
  g.fillRect(12, 18, 2, 12);
  g.fillRect(31, 18, 2, 12);
  g.fillStyle(0x262d33, 1);
  g.fillRoundedRect(2, 3, 42, 16, 2);
  // 文字の帯
  g.fillStyle(0xf2f6f8, 0.92);
  g.fillRect(14, 7, 26, 3);
  g.fillRect(14, 12, 18, 2.4);
  // カップのしるし
  g.fillStyle(0xf2f6f8, 1);
  g.fillRoundedRect(6, 8, 7, 6, 1);
  g.fillRect(13, 9, 2.2, 3);
  g.fillStyle(0xc98b5e, 1);
  g.fillRect(7, 9, 5, 1.6);
  outlineRect(g, 2, 3, 42, 16, 2);
  make("fnLoungeSign", 46, 32);

  // 自動販売機（白×青。ガラス越しにボトルが並ぶ）
  g.clear();
  shadow(g, 18, 44, 26);
  g.fillStyle(0xe8eef3, 1);
  g.fillRoundedRect(3, 3, 30, 41, 2);
  g.fillStyle(0x2e6f9e, 1);
  g.fillRect(3, 3, 30, 6); // 上部の色帯
  g.fillStyle(0x1f4e79, 1);
  g.fillRect(3, 38, 30, 6); // 下部
  // 商品窓
  g.fillStyle(0x16212b, 1);
  g.fillRect(6, 11, 19, 25);
  const vbottles = [0xf2c53d, 0x4f9ed8, 0x6fbf73, 0xf4f6f7, 0xd94a3d, 0xd98cc0];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      g.fillStyle(vbottles[(row * 2 + i) % vbottles.length], 1);
      g.fillRect(7.5 + i * 4.4, 13 + row * 8, 3.4, 6);
      g.fillStyle(0xffffff, 0.45);
      g.fillRect(7.5 + i * 4.4, 13 + row * 8, 3.4, 1.2);
    }
  }
  // ボタン列と取り出し口
  g.fillStyle(0xf4f6f7, 1);
  g.fillRect(27, 12, 4, 22);
  g.fillStyle(0xd94a3d, 1);
  for (let i = 0; i < 4; i++) g.fillRect(27.6, 14 + i * 5, 2.8, 2.4);
  g.fillStyle(0x2c3e50, 1);
  g.fillRect(8, 38, 16, 4);
  outlineRect(g, 3, 3, 30, 41, 2);
  make("fnVendingTall", 36, 48);

  // 雑誌ラック（斜めの棚に表紙が並ぶ）
  g.clear();
  shadow(g, 20, 40, 28);
  g.fillStyle(0x6d4a2a, 1);
  g.fillRoundedRect(3, 6, 34, 34, 2);
  const mags = [0x4f9ed8, 0xe8863d, 0x6fbf73, 0xd94a3d, 0xf2c53d, 0xd98cc0];
  for (let row = 0; row < 3; row++) {
    const y = 10 + row * 11;
    for (let i = 0; i < 3; i++) {
      const c = mags[(row * 3 + i) % mags.length];
      g.fillStyle(c, 1);
      g.fillRect(6 + i * 10, y, 8, 8);
      g.fillStyle(lighten(c, 1.3), 1);
      g.fillRect(6 + i * 10, y, 8, 2); // 表紙の帯
    }
    g.fillStyle(0x8a6a44, 1);
    g.fillRect(4, y + 8, 32, 2); // 棚板
  }
  outlineRect(g, 3, 6, 34, 34, 2);
  make("fnMagRack", 40, 44);

  // 低い本棚（ソファ席の仕切りにもなる）
  g.clear();
  shadow(g, 24, 28, 40);
  g.fillStyle(0x8a6a44, 1);
  g.fillRoundedRect(3, 8, 42, 20, 2);
  g.fillStyle(0xb08a5e, 1);
  g.fillRect(3, 8, 42, 3); // 天板
  const shelfBooks = [0xd94a3d, 0x4f9ed8, 0x6fbf73, 0xf2c53d, 0xd98cc0, 0xf4f6f7, 0xe8863d];
  for (let i = 0; i < 13; i++) {
    const c = shelfBooks[i % shelfBooks.length];
    const h = 9 + (i % 3) * 2;
    g.fillStyle(c, 1);
    g.fillRect(5 + i * 3, 24 - h, 2.4, h);
    g.fillStyle(lighten(c, 1.25), 1);
    g.fillRect(5 + i * 3, 24 - h, 2.4, 1.2);
  }
  outlineRect(g, 3, 8, 42, 20, 2);
  make("fnLowShelf", 48, 32);

  // ローテーブル（ソファの前に置く低い木のテーブル）
  g.clear();
  shadow(g, 22, 24, 32);
  g.fillStyle(CAFE_WOOD_DARK, 1);
  g.fillRect(7, 14, 3, 8);
  g.fillRect(34, 14, 3, 8);
  g.fillStyle(CAFE_WOOD_DARK, 1);
  g.fillRoundedRect(3, 11, 38, 6, 2);
  g.fillStyle(CAFE_WOOD_TOP, 1);
  g.fillRoundedRect(3, 8, 38, 6, 2);
  // 上に置いてあるもの（雑誌と小さな鉢）
  g.fillStyle(0x4f9ed8, 1);
  g.fillRect(9, 7, 10, 4);
  g.fillStyle(0xf4f6f7, 1);
  g.fillRect(10, 8, 8, 1.2);
  g.fillStyle(0xb5651d, 1);
  g.fillRect(27, 7, 5, 4);
  g.fillStyle(0x3fbf70, 1);
  g.fillEllipse(29.5, 5, 8, 6);
  outlineRect(g, 3, 8, 38, 9, 2);
  make("fnCoffeeTable", 44, 26);

  // 1人掛けのソファ（色違いで2種。丸みのある座り心地の良さそうな形に）
  const armchair = (key: string, body: number): void => {
    g.clear();
    shadow(g, 16, 28, 22);
    // 背もたれ
    g.fillStyle(darken(body, 0.8), 1);
    g.fillRoundedRect(4, 4, 24, 16, 5);
    // 肘掛け
    g.fillStyle(body, 1);
    g.fillRoundedRect(2, 12, 7, 12, 3);
    g.fillRoundedRect(23, 12, 7, 12, 3);
    // 座面
    g.fillStyle(lighten(body, 1.15), 1);
    g.fillRoundedRect(6, 14, 20, 11, 4);
    g.fillStyle(lighten(body, 1.3), 1);
    g.fillRoundedRect(7, 15, 18, 4, 3);
    // 脚
    g.fillStyle(CAFE_WOOD_DARK, 1);
    g.fillRect(6, 24, 2.4, 4);
    g.fillRect(23.6, 24, 2.4, 4);
    outlineRect(g, 4, 4, 24, 16, 5);
    make(key, 32, 30);
  };
  armchair("fnArmchair", 0x5f8f8a); // 青緑
  armchair("fnArmchairWarm", 0xc9784a); // オレンジ

  // ラグ（床に敷く。什器ではないので中心を基準に置く → originY 0.5）
  g.clear();
  g.fillStyle(0x5b6b7a, 0.55);
  g.fillEllipse(34, 20, 64, 34);
  g.fillStyle(0x6f8194, 0.5);
  g.fillEllipse(34, 20, 54, 26);
  g.fillStyle(0x8ea0b2, 0.35);
  g.fillEllipse(34, 20, 40, 17);
  make("fnRug", 68, 40);

  // ---------------------------------------------------------------- 食堂
  //
  // 参考にしたのは「学校の食堂／社員食堂」。
  // 奥に**配膳カウンター（ガラスケース越しに料理が並ぶ）**、
  // その脇に**サラダバー**と**ドリンクコーナー**、手前に明るい木のテーブルと青い椅子。
  // 「並んで取って、座って食べる場所」という順路が形で分かることを狙っている。

  // 壁の横断幕（青地に白の標語）
  g.clear();
  g.fillStyle(0x1f4e79, 1);
  g.fillRoundedRect(2, 4, 44, 26, 2);
  g.fillStyle(0x2a5f92, 1);
  g.fillRect(4, 6, 40, 22);
  // 標語の行（読ませるためではなく「書いてある」ことを示す帯）
  for (let i = 0; i < 3; i++) {
    g.fillStyle(0xf7fbfd, 0.92);
    g.fillRect(8, 9 + i * 6, 26 - i * 4, 2.6);
  }
  // 泳ぐ人のしるし
  g.fillStyle(0x9fd8c8, 1);
  g.fillEllipse(36, 22, 7, 4);
  g.fillStyle(0xf7fbfd, 1);
  g.fillRect(30, 25, 14, 1.6);
  outlineRect(g, 2, 4, 44, 26, 2);
  make("fnWallBanner", 48, 34);

  // 分別ゴミ箱（3つ並び）
  g.clear();
  shadow(g, 20, 30, 26);
  const bins = [0xd94a3d, 0xf2c53d, 0x4f9ed8];
  for (let i = 0; i < 3; i++) {
    const x = 3 + i * 11;
    g.fillStyle(0xdfe6ec, 1);
    g.fillRoundedRect(x, 10, 9, 18, 1.5);
    g.fillStyle(bins[i], 1);
    g.fillRect(x, 8, 9, 4); // ふたの色で分別が分かる
    g.fillStyle(0x2b2230, 0.5);
    g.fillRect(x + 2, 14, 5, 2); // 投入口
    outlineRect(g, x, 8, 9, 20, 1.5);
  }
  make("fnBins", 38, 32);

  // ---------------------------------------------------------------- 売店
  //
  // 参考にしたのは「プールサイドのコンビニ売店」。2×2マスと狭いので、
  // **青い看板・お菓子の棚・アイスの冷凍ケース・ドリンククーラー**の4つで
  // 売店だと分かるようにしてある。中身の色数を多くして「商品が並んでいる」感じを出す。
  // （生成テクスチャに文字は描けないので、看板やポップは色帯で表す）

  // 青い「売店」看板
  g.clear();
  shadow(g, 20, 34, 22);
  // 吊り下げの支柱
  g.fillStyle(0x8d949c, 1);
  g.fillRect(11, 20, 2, 14);
  g.fillRect(27, 20, 2, 14);
  // 看板の板
  g.fillStyle(0x1f6fb2, 1);
  g.fillRoundedRect(2, 4, 36, 17, 2);
  g.fillStyle(0x2e86c1, 1);
  g.fillRect(4, 6, 32, 6);
  // 白い文字（読ませるためではなく「字が書いてある」ことを示す帯）
  g.fillStyle(0xf7fbfd, 1);
  g.fillRect(8, 9, 9, 7);
  g.fillRect(19, 9, 9, 7);
  g.fillStyle(0x1f6fb2, 1);
  g.fillRect(10, 11, 5, 1.6);
  g.fillRect(21, 11, 5, 1.6);
  g.fillRect(10, 14, 5, 1.4);
  g.fillRect(21, 14, 5, 1.4);
  outlineRect(g, 2, 4, 36, 17, 2);
  make("fnShopSign", 40, 36);

  // お菓子の棚（色とりどりの商品がぎっしり）
  g.clear();
  shadow(g, 24, 48, 36);
  g.fillStyle(0xb08a5e, 1);
  g.fillRoundedRect(4, 4, 40, 44, 2);
  g.fillStyle(0x8a6a44, 1);
  g.fillRect(4, 4, 40, 3);
  // 4段。商品はランダムに見えるよう、色と幅を少しずつ変える
  const snackColors = [0xe74c3c, 0xf2c53d, 0x4f9ed8, 0x6fbf73, 0xe8863d, 0xd98cc0, 0xf4f6f7, 0x9b59b6];
  for (let row = 0; row < 4; row++) {
    const y = 12 + row * 10;
    for (let i = 0; i < 6; i++) {
      const c = snackColors[(row * 3 + i * 2) % snackColors.length];
      const h = 6 + ((i + row) % 3);
      g.fillStyle(c, 1);
      g.fillRect(7 + i * 6, y - h + 6, 5, h);
      g.fillStyle(lighten(c, 1.3), 1);
      g.fillRect(7 + i * 6, y - h + 6, 5, 1.4);
    }
    g.fillStyle(0xd8b58a, 1);
    g.fillRect(6, y + 6, 36, 2); // 棚板
  }
  outlineRect(g, 4, 4, 40, 44, 2);
  make("fnSnackShelf", 48, 52);

  // アイスの冷凍ケース（ガラスのふた越しに中身が見える）
  g.clear();
  shadow(g, 24, 34, 34);
  box(g, 24, 32, 38, 16, 14, 0xe8eef3, 0xc6d2da, 0xa9b6bf);
  // ケースの青帯（アイスのポップ）
  g.fillStyle(0x2e86c1, 1);
  g.fillRect(6, 22, 36, 5);
  g.fillStyle(0xf7fbfd, 1);
  g.fillRect(10, 23, 8, 3);
  g.fillRect(21, 23, 8, 3);
  // ガラスのふたと中身
  g.fillStyle(0xd8eef6, 0.9);
  g.fillRoundedRect(7, 8, 34, 11, 2);
  const iceColors = [0xf4a6c0, 0xf7dc6f, 0x9fd8c8, 0xd98cc0, 0xf4f6f7];
  for (let i = 0; i < 5; i++) {
    g.fillStyle(iceColors[i % iceColors.length], 1);
    g.fillRect(10 + i * 6, 11, 4, 6);
  }
  g.fillStyle(0xffffff, 0.5);
  g.fillRect(9, 9, 28, 2); // ガラスの反射
  outlineRect(g, 7, 8, 34, 11, 2);
  make("fnIceChest", 48, 38);

  // 島什器（通路のまん中に置く平台。おすすめのポップ付き）
  g.clear();
  shadow(g, 22, 32, 32);
  box(g, 22, 30, 34, 16, 9, 0xc9a06a, 0xa98153, 0x84643e);
  // 平台に積んだ商品
  for (let i = 0; i < 5; i++) {
    const c = snackColors[(i * 3) % snackColors.length];
    g.fillStyle(c, 1);
    g.fillRect(8 + i * 6, 12, 5, 8);
    g.fillStyle(lighten(c, 1.3), 1);
    g.fillRect(8 + i * 6, 12, 5, 1.6);
  }
  // 赤いポップ
  g.fillStyle(0xd94a3d, 1);
  g.fillRoundedRect(24, 20, 14, 7, 1);
  g.fillStyle(0xf7fbfd, 1);
  g.fillRect(26, 22, 10, 1.6);
  g.fillRect(26, 24.5, 7, 1.4);
  outlineRect(g, 5, 14, 34, 16, 2);
  make("fnShopIsland", 44, 34);

  // ================================================================ スタジオ（ダンス・ヨガのスタジオ）
  //
  // 【描き方の方針】筋トレルームと同じく細かく描き込んで、「どこで何をする部屋か」を形で読めるようにする。
  //   ・奥の壁に鏡を張り、その手前にバレエバー（壁ぎわの手すり）。鏡は**壁の向き（画面で右下がり）に傾けて**描き、
  //     部屋のまん中に立て看板が立っているように見えないようにする
  //   ・床に置くもの（ヨガマット・フォームローラー）は**マスの向きにそろえて寝かせる**
  //   ・明るいフローリングの上で映える、パステル寄りの色（ジムのグラファイトと見分けが付く）
  // 回した部屋では什器が左右反転する（→ iso/facility.ts の Fitting.flipX）ので、壁の傾きもそのまま合う。

  type Pt = { x: number; y: number };
  const hx = TILE_W / 2;
  const hy = TILE_H / 2;
  const fillPts = (pts: Pt[], color: number, alpha = 1): void => {
    g.fillStyle(color, alpha);
    g.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true);
  };
  const strokePts = (pts: Pt[], color = OUTLINE, alpha = 0.85, width = 1.3): void => {
    g.lineStyle(width, color, alpha);
    g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], true);
  };
  /** 床に寝かせた長方形（マスの向き）。along＝gx 方向の半分の長さ、across＝gy 方向の半分（どちらもマス）。 */
  const floorQuad = (cx: number, cy: number, along: number, across: number): Pt[] => {
    const ax = hx * along;
    const ay = hy * along;
    const bx = -hx * across;
    const by = hy * across;
    return [
      { x: cx - ax - bx, y: cy - ay - by },
      { x: cx + ax - bx, y: cy + ay - by },
      { x: cx + ax + bx, y: cy + ay + by },
      { x: cx - ax + bx, y: cy - ay + by },
    ];
  };
  const shiftPts = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));

  // --- 鏡の壁（壁に張った鏡＋バレエバー）---
  // 上辺・下辺を壁の向き（傾き hy/hx）に倒した平行四辺形。置くときは originY ≈ 0.79（下辺のまん中）。
  {
    g.clear();
    const slope = hy / hx;
    const panel = (x0: number, x1: number, top: number, bottom: number): Pt[] => [
      { x: x0, y: top + x0 * slope },
      { x: x1, y: top + x1 * slope },
      { x: x1, y: bottom + x1 * slope },
      { x: x0, y: bottom + x0 * slope },
    ];
    fillPts(panel(1, 63, 49, 53), 0x000000, 0.16); // 壁ぎわの影
    const frame = panel(1, 63, 1, 50);
    fillPts(frame, 0xc8965d); // 木の枠
    fillPts(panel(1, 63, 1, 3), 0xe6bb82); // 枠の上の照り
    const glass = panel(4, 60, 5, 46);
    fillPts(glass, 0xb9d8ea); // 鏡面
    fillPts(panel(4, 60, 5, 18), 0xdcedf7); // 上は天井の照明が映って明るい
    fillPts(panel(4, 60, 36, 46), 0xd9ad70, 0.32); // 下にフローリングがうっすら映る
    // 斜めの反射（2本）
    const streak = (x: number, w: number, lean: number, alpha: number): void => {
      fillPts(
        [
          { x, y: 5 + x * slope },
          { x: x + w, y: 5 + (x + w) * slope },
          { x: x + w - lean, y: 46 + (x + w - lean) * slope },
          { x: x - lean, y: 46 + (x - lean) * slope },
        ],
        0xffffff,
        alpha,
      );
    };
    streak(24, 7, 12, 0.42);
    streak(38, 3, 12, 0.28);
    strokePts(glass, 0x8a6236, 0.7, 1);
    strokePts(frame);
    // バレエバー（木の手すり。スチールの金具で壁に留めてある）
    for (const bx of [12, 52]) {
      g.fillStyle(0x9aa7b4, 1);
      g.fillRect(bx - 1.2, 40 + bx * slope, 2.4, 7);
    }
    fillPts(panel(2, 62, 40, 43), 0x8a6236);
    fillPts(panel(2, 62, 38, 40.6), 0xecc088);
    strokePts(panel(2, 62, 38, 43), OUTLINE, 0.75, 1);
    make("fnStudioMirror", 64, 86);
  }

  // --- ヨガマット（床に寝かせる。originY 0.5 で置く）---
  {
    const mw = Math.ceil(TILE_W * 0.95);
    const mh = Math.ceil(TILE_H * 0.95) + 8;
    const mats: [string, number][] = [
      ["fnYogaMatTeal", 0x3fbfae],
      ["fnYogaMatPink", 0xf08db3],
      ["fnYogaMatPurple", 0x9d83e2],
    ];
    for (const [key, col] of mats) {
      g.clear();
      const cx = mw / 2;
      const cy = mh / 2 - 1.5;
      const top = floorQuad(cx, cy, 0.6, 0.2);
      fillPts(shiftPts(top, 0, 2.2), darken(col, 0.6)); // 厚み
      fillPts(top, col);
      strokePts(floorQuad(cx, cy, 0.5, 0.12), lighten(col, 1.3), 0.85, 1); // 表面の縁どり
      strokePts(top, darken(col, 0.45), 0.9, 1.2);
      // 奥の端を少し丸めて置いてある（巻き癖）
      const ex = cx + hx * 0.52;
      const ey = cy + hy * 0.52;
      g.fillStyle(darken(col, 0.82), 1);
      g.fillEllipse(ex, ey - 2.4, 10, 7);
      g.fillStyle(lighten(col, 1.22), 1);
      g.fillEllipse(ex - 0.8, ey - 3.2, 5.5, 3.8);
      g.fillStyle(darken(col, 0.5), 1);
      g.fillCircle(ex - 0.8, ey - 3.2, 1);
      make(key, mw, mh);
    }
  }

  // --- 丸めたマットのかご ---
  {
    g.clear();
    shadow(g, 20, 43, 28);
    const cx = 20;
    const hw = 14;
    const hd = 6.5;
    const topY = 30;
    const baseY = 42;
    // かごの奥の面（中が見える）
    fillPts(
      [
        { x: cx - hw, y: topY },
        { x: cx, y: topY - hd },
        { x: cx + hw, y: topY },
        { x: cx, y: topY + hd },
      ],
      0x6f5230,
    );
    const rolls = [0x3fbfae, 0xf08db3, 0x9d83e2, 0xf5b35b, 0x5aa9e6];
    rolls.forEach((c, i) => {
      const x = 9 + i * 5.6;
      const ty = 10 + (i % 2) * 4;
      part(g, x - 2.6, ty, 5.2, 24, c, 2); // 立てて差したマット
      g.fillStyle(lighten(c, 1.3), 1);
      g.fillEllipse(x, ty + 1.6, 4.6, 3); // 巻いた口
      g.fillStyle(darken(c, 0.5), 1);
      g.fillCircle(x, ty + 1.6, 0.9);
    });
    // かごの手前の2面（マットの根元を隠す）
    const left: Pt[] = [
      { x: cx - hw, y: topY },
      { x: cx, y: topY + hd },
      { x: cx, y: baseY + hd },
      { x: cx - hw, y: baseY },
    ];
    const right: Pt[] = [
      { x: cx, y: topY + hd },
      { x: cx + hw, y: topY },
      { x: cx + hw, y: baseY },
      { x: cx, y: baseY + hd },
    ];
    fillPts(left, 0xc79a5b);
    fillPts(right, 0xa57c45);
    g.fillStyle(0x7a5a33, 0.4); // 編み目
    for (let i = 0; i < 4; i++) g.fillRect(cx - hw + 2 + i * 3.4, topY + 3 + i * 1.7, 1.2, 8);
    for (let i = 0; i < 4; i++) g.fillRect(cx + 2 + i * 3.4, topY + hd - 1 - i * 1.7, 1.2, 8);
    strokePts(left, OUTLINE, 0.8, 1.2);
    strokePts(right, OUTLINE, 0.8, 1.2);
    make("fnMatBasket", 40, 50);
  }

  // --- フォームローラー（床に寝かせた筒を2本。マスの向きにそろえる）---
  {
    g.clear();
    const roller = (cx: number, cy: number, col: number): void => {
      // 太く短く（細いと棒や水準器に見える）。切り口の丸が見えると「筒」と分かる
      const ax = hx * 0.3;
      const ay = hy * 0.3;
      const r = 6.5;
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(cx + 1, cy + r + 1.5, ax * 2 + 8, 5);
      const body: Pt[] = [
        { x: cx - ax, y: cy - ay - r },
        { x: cx + ax, y: cy + ay - r },
        { x: cx + ax, y: cy + ay + r },
        { x: cx - ax, y: cy - ay + r },
      ];
      g.fillStyle(col, 1); // 奥の端も丸く
      g.fillEllipse(cx - ax, cy - ay, 7, r * 2);
      fillPts(body, col);
      fillPts(
        [body[0], body[1], { x: cx + ax, y: cy + ay - r + 3.6 }, { x: cx - ax, y: cy - ay - r + 3.6 }],
        lighten(col, 1.35),
        0.8,
      );
      g.fillStyle(darken(col, 0.68), 0.85); // マッサージ用の突起
      for (let i = 1; i < 5; i++) {
        const t = -1 + (i * 2) / 5;
        g.fillRect(cx + ax * t - 0.8, cy + ay * t - 2.5, 1.6, 5);
      }
      g.lineStyle(1.2, OUTLINE, 0.8);
      g.lineBetween(body[0].x, body[0].y, body[1].x, body[1].y);
      g.lineBetween(body[3].x, body[3].y, body[2].x, body[2].y);
      g.strokeEllipse(cx - ax, cy - ay, 7, r * 2);
      g.fillStyle(darken(col, 0.8), 1); // 手前の切り口
      g.fillEllipse(cx + ax, cy + ay, 8, r * 2);
      g.lineStyle(1.2, OUTLINE, 0.85);
      g.strokeEllipse(cx + ax, cy + ay, 8, r * 2);
      g.fillStyle(0xf4f1ea, 1);
      g.fillEllipse(cx + ax, cy + ay, 3.4, r * 0.95);
    };
    roller(24, 18, 0x2f4f86);
    roller(39, 30, 0x3fbfae);
    make("fnFoamRollers", 64, 52);
  }

  // --- バランスボール（大小2つ）---
  {
    g.clear();
    const ball = (cx: number, cy: number, r: number, col: number): void => {
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(cx + 1, cy + r - 1, r * 2.1, r * 0.7);
      g.fillStyle(OUTLINE, 1);
      g.fillCircle(cx, cy, r + 1);
      g.fillStyle(darken(col, 0.72), 1);
      g.fillCircle(cx, cy, r);
      g.fillStyle(col, 1);
      g.fillCircle(cx - r * 0.14, cy - r * 0.14, r * 0.84);
      g.fillStyle(0xffffff, 0.55);
      g.fillEllipse(cx - r * 0.4, cy - r * 0.44, r * 0.62, r * 0.4);
    };
    ball(18, 24, 12, 0x5bb4ef);
    ball(35, 30, 9, 0xf08db3);
    make("fnBalanceBalls", 48, 42);
  }

  // --- 縄跳びのラック（横木に色とりどりの縄が下がっている）---
  {
    g.clear();
    shadow(g, 18, 45, 26);
    part(g, 5, 6, 3, 38, 0x8a6236, 0);
    part(g, 28, 6, 3, 38, 0x8a6236, 0);
    part(g, 3, 4, 30, 5, 0xc8965d, 1); // 横木
    [0xd94a3d, 0x3fbfae, 0xf5b35b, 0x9d83e2].forEach((c, i) => {
      const x = 10.5 + i * 5;
      const r = 1.9;
      const bottom = 24 + (i % 2) * 6;
      g.lineStyle(1.5, c, 1);
      g.lineBetween(x - r, 9, x - r, bottom);
      g.lineBetween(x + r, 9, x + r, bottom);
      g.beginPath();
      g.arc(x, bottom, r, 0, Math.PI, false);
      g.strokePath();
      part(g, x - r - 1.1, 9, 2.2, 5, darken(c, 0.72), 1); // 持ち手
    });
    make("fnRopeRack", 36, 48);
  }

  // --- スピーカー（音楽に合わせて動く部屋の目印）---
  {
    g.clear();
    shadow(g, 14, 45, 20);
    box(g, 14, 44, 18, 9, 32, 0x3b4048, 0x23272d, 0x1b1e23);
    disc(g, 9.5, 21, 3, 0x55606c, 0x1b1e23);
    disc(g, 9.5, 33, 4.2, 0x55606c, 0x1b1e23);
    g.fillStyle(0x35e07a, 0.95);
    g.fillRect(7, 14, 2, 1.5); // 電源ランプ
    make("fnStudioSpeaker", 28, 50);
  }

  g.destroy();
  void W;
}
