/**
 * ゲーム全体で共有する定数。
 * 表示はクォータービュー（アイソメトリック）へ刷新。スマホ縦画面前提。
 * 数値の意味づけ（育成ルール等）は sim/ と config/balance.ts 側にある。
 */

/** 論理解像度。スマホ縦画面前提（Google Play想定）。Scale.FIT で拡大表示。 */
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

/** 練習用プールのレーン数（クォータービューで斜めに描画）。 */
export const LANE_COUNT = 6;
/** 大会会場のレーン数（実際の競技会と同じ8レーン）。 */
export const MEET_LANE_COUNT = 8;

/**
 * アイソメトリックのタイル寸法。**厳密な 2:1**（W = 2H）。
 * screenX = (gx - gy) * TILE_W/2 ,  screenY = (gx + gy) * TILE_H/2
 *
 * 44x26 → 96x48 → **120x60**（2026-08-20）。
 * 1マスを大きくするほど、床の目地・什器・壁の作り込みに使える画素が増えて絵が良くなる。
 * そのぶん焼く床の絵も大きくなる（面積は倍率の2乗で効く）ので、上げすぎない。
 *
 * **ここを変えたら、タイルに合わせている定数も一緒に見直すこと。**
 *   CHAR_SCALE（人の大きさ）／ gfx/roomStyle.ts の WALL_H・WALL_THICK（壁の高さと厚み）
 *   ／ CAMERA.defaultZoom（画面に入るマス数）
 * 什器は gfx/furniture.ts が TILE_W を基準に描いているので、自動で付いてくる。
 */
export const TILE_W = 120;
export const TILE_H = 60;

/**
 * キャラクターの表示倍率。
 * テクスチャは 14x24 前後で生成しているので、タイル拡大に合わせて上げる。
 * （描き起こしの素材は charAssetScale が「この背丈」に合わせて縮尺を掛ける）
 */
export const CHAR_SCALE = 3.75;

/**
 * 【陸の姿だけ小さくする】歩き・立ち姿・水着・トレーニングに掛ける倍率。
 *
 * 泳いでいる姿は水面に寝ているので、画面の高さは 53px しか使わない。
 * そこへ 101px の立ち姿が並ぶと、館内を歩く人だけが大きく見えてしまう。
 * ここを下げると**陸の姿だけ**が縮み、泳ぐ姿・大会の画面は変わらない。
 *
 *   1.00 … 大人 101px（1タイルの高さ 60px に対して 1.7倍）
 *   0.75 … 大人 76px ／ 学童 59px ／ 幼児 51px（プールの人の高さ 53px と釣り合う）
 */
export const LAND_CHAR_SCALE = 0.75;

/**
 * レイアウト帯（縦画面）。中央ステージにISO施設、上下にHUD/メニュー。
 *
 * フッターのメニューは矢印で開け閉めできる。
 *  ・FOOTER_H     … 開いているときの高さ。2段×4ボタンで、指で押し分けられる大きさ。
 *  ・FOOTER_BAR_H … 閉じているときの高さ。矢印と速度だけの細い帯になり、
 *                   そのぶん施設が広く見える。
 */
/**
 * 上の帯の高さ。5段ぶん。
 *  1段目 … 年月・クラブの格・在籍・満足度★・時刻
 *  2段目 … 所持ジェム・いま練習しているクラス・人気
 *  3段目 … 情熱ゲージ（特別練習の燃料 → config/balance の PASSION）と**クラブの格ゲージ**
 *  4段目 … 「今月の一手」（→ sim/advice.ts）
 *  5段目 … 注目選手（★を付けた選手 → GameState.pinnedStudents）
 *
 * 【3〜5段目を足した理由】（2026-09-21）
 * この遊びは放っておくと何も起きないのに、画面のどこにも「次に何をすれば進むのか」が
 * 出ていなかった（実測：大会に出さないと10時間進めても格が2で止まる）。
 * 4段目がその1行、3段目の格ゲージがその成果、5段目が「自分の子」を見失わないための行。
 * **舞台が狭くなるぶん、1行あたりの情報は1つに絞ること。**
 */
export const HUD_H = 168;
export const FOOTER_H = 224;
export const FOOTER_BAR_H = 62;

/** 配色（カイロソフト風の明るくポップな原色寄り。仮素材段階、後で調整可）。 */
export const COLORS = {
  // マップの外側。屋内施設なので、外は夜の街路のような落ち着いた色にして
  // 「建物の中が明るい」というコントラストを作る
  bgDeep: 0x2b3138,
  sky: 0xa9e0f5,

  // 施設の床（grass は「屋内の空き床」の意味。名前は互換で据え置き）
  grass: 0xe4ddca,
  grassAlt: 0xdad2be,
  pathTile: 0xd8c8a0,
  pathTileAlt: 0xcdbc90,
  lobby: 0xe6d7bf,
  lobbyAlt: 0xdccbb0,
  locker: 0xbfd8e6,
  lockerAlt: 0xb0cddd,
  deck: 0xe8dcc0,
  deckAlt: 0xdccfae,

  // 部屋ごとの床・壁の色は gfx/roomStyle.ts の ROOM_STYLE にまとめてある
  // （床・目地・部屋の輪郭・壁を1か所で決められるようにするため）。

  // 水
  poolWater: 0x35b3e8,
  poolWaterAlt: 0x3ec1f5,
  poolWaterDeep: 0x2793cc,

  // 壁・什器
  wallTop: 0xf2ead6,
  wallLeft: 0xc9b79a,
  wallRight: 0xb6a488,
  deskTop: 0xa9743c,
  deskSide: 0x7d5227,

  laneLine: 0xffffff,

  textLight: "#f2f5f7",
  textDim: "#9fb3c4",
  textAccent: "#f7dc6f",
} as const;

/**
 * ジェムの表示（3桁ごとにカンマ）。
 *
 * 大型施設が ◆1,000,000 になったので、区切りが無いと桁が読めない
 *（◆1000000 と ◆100000 が並ぶと見分けが付かない）。
 * 画面にジェムの金額を出すところは、必ずここを通すこと。
 */
export function gemsText(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}
