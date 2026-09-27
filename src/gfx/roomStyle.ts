import type { FloorKind } from "../iso/facility";
import { TILE_H } from "../config";

/**
 * 壁（エッジウォール）の寸法（px）。
 *
 * セル境界に立てる薄板。立方体ではないので、面積を食わず部屋の中が見える。
 *   back  … 奥（部屋の北辺・西辺）の壁。しっかり立てて建物の背にする
 *   front … 手前（南辺・東辺）の壁。半分の高さに落として中を見せる
 *   fence … 低い柵（プールサイドの安全柵など）。視界を遮らない
 *   door  … 出入口。枠だけ描いて通れることを示す
 *   thick … 板の厚み（奥行き方向のずらし量）
 */
export const WALL_H = { back: 50, front: 22, fence: 25, door: 18 } as const;
export const WALL_THICK = 8;

/**
 * 建物そのものの外壁（＝敷地をぐるりと囲む壁）の寸法。
 *
 * 部屋どうしを仕切る内壁（WALL_H）より **高く・厚く** する。
 * 厚みの天面がそのまま「陸屋根の見切り」になるので、これを太くすると
 * 屋根のある建物として見え、薄いままだと「囲っただけの塀」に見える。
 *   outerBack  … 奥（北辺・西辺）。建物の背になる高い壁
 *   outerFront … 手前（南辺・東辺）。中が見えるよう腰高で切る
 *   OUTER_THICK… 壁の厚み＝屋根の見切りの太さ
 */
export const WALL_H_OUTER = { back: 80, front: 28 } as const;
/**
 * 外壁の厚み。奥は屋根の見切りを見せたいので太く、
 * 手前は切り口が太いと中を隠すぶんが増えるので細くする。
 */
export const WALL_THICK_OUTER = { back: 22, front: 11 } as const;

/** 建物の外壁の色（参考画像の、暖かみのあるベージュの躯体）。 */
export const BUILDING_TINT = 0xe9dcc0;

/**
 * 壁テクスチャの、板の下端（＝立っているセル境界の始点）から見た余白。
 * 厚みぶん外へはみ出すので、原点の計算に使う。
 */
export const WALL_PAD = { x: WALL_THICK, y: Math.round(TILE_H / 2) + Math.round(WALL_THICK / 2) } as const;

/** worldBounds が「いちばん高い壁」を知るために参照する（＝建物の外壁）。 */
export const WALL_TOP = Math.max(WALL_H.back, WALL_H_OUTER.back);

/**
 * 部屋ごとの見た目（床の色・目地・壁の色）。
 *
 * ねらいは「どこが何の部屋か、色だけで分かること」。
 * カイロソフト作品のように、彩度を上げて部屋どうしの明度差をはっきり付ける。
 *
 *   base … 床のベース色
 *   alt  … 市松の片方（タイルの目が見えるように base と少しだけ差をつける）
 *   line … 目地（タイルの継ぎ目）の色。薄く敷いて奥行きを出す
 *   edge … 部屋の外周に引く濃い輪郭線。部屋の境界をはっきりさせる
 *   wall … その部屋を囲む壁の色
 */
export interface RoomStyle {
  base: number;
  alt: number;
  line: number;
  edge: number;
  wall: number;
}

export const ROOM_STYLE: Record<FloorKind, RoomStyle> = {
  // 【屋内スイミングクラブ】敷地の中はすべて「建物の内側」。芝生は無い。
  //
  //   grass   … まだ何も置いていない屋内の床（明るいリノリウム）。名前は互換で据え置き
  //   road    … 館内の通路。**空き床と同じ暖色系の石タイル**で、一段だけ落とす。
  //              灰色にすると館内に冷たい色が1本通って、外の舗装のように見えてしまう。
  //              追えるかどうかは明度差（fixcheck が 0.05 以上を見ている）で担保する。
  //
  // 建物の中は総じて明るく、外（駐車場・車道）は暗い。
  // この明度差そのものが「屋根のある建物の中を見ている」という手がかりになる。
  grass: { base: 0xece5d4, alt: 0xe3dbc8, line: 0xc6bda6, edge: 0x9d947d, wall: 0xf4f0e4 },
  road: { base: 0xd9cfb6, alt: 0xcfc5aa, line: 0xaba286, edge: 0x877f66, wall: 0xf1efe6 },

  // ---- 建物の外（舗装）。芝生・樹木は使わない ----
  //   sidewalk … 歩道・植樹帯（明るいコンクリート平板）
  //   street   … 車道（いちばん濃いアスファルト）
  //   unowned  … 車道より先＝**世界の外**。空に近い淡い青にして、ほぼ無地で敷く。
  //              ここに市松や濃いグレーを置くと、遠くの地面のほうが目立ってしまう。
  sidewalk: { base: 0x9aa1a7, alt: 0x939aa1, line: 0x7d848a, edge: 0x6a7177, wall: 0xb9c0c6 },
  street: { base: 0x50565e, alt: 0x4c525a, line: 0x424850, edge: 0x363c44, wall: 0x8a929a },
  unowned: { base: 0x93b3c6, alt: 0x8fb0c3, line: 0x8aabbf, edge: 0x86a7bb, wall: 0x8a929a },

  // プール（水色〜青のタイル／プールサイドは白タイル）
  water: { base: 0x25b6ec, alt: 0x36c8f7, line: 0x1487c2, edge: 0x0d6b9c, wall: 0xf2f7fa },
  deck: { base: 0xf1f3f1, alt: 0xe6e9e7, line: 0xc2c8c5, edge: 0x99a19d, wall: 0xf2f7fa },

  /**
   * 【観客席】大型プールの奥に取るスタンド。
   *
   * 床そのものはコンクリートの段。市松（base/alt）の差を大きめに取って、
   * **段がひとつずつ見える**ようにしてある（座席の絵はこの上に並ぶ）。
   * プールサイド（明るい白）と水面（青）の両方から明度で離してあるので、
   * 3層（客席・水・プールサイド）が色だけで読み分けられる。
   */
  stand: { base: 0x8d9aa8, alt: 0x7f8c9a, line: 0x66717d, edge: 0x4a535d, wall: 0xdfe6ec },

  // フロント・ロビー（明るいタイル。参考画像の受付まわりに合わせて白木寄り）
  lobby: { base: 0xe8dcc2, alt: 0xded0b2, line: 0xbdae8d, edge: 0x94866a, wall: 0xf7efdd },

  // フロントの土間（入口）。**ロビーより一段濃い石**にして、
  // 「ここから中へ入る」という切り替わりが床の色で分かるようにする。
  entrance: { base: 0xcbbe9f, alt: 0xc0b291, line: 0x9d8f70, edge: 0x7c6f52, wall: 0xf7efdd },

  // 建物の外：入口の正面だけ舗装した車寄せ（歩道より明るい石畳）
  // 歩道（0x9aa1a7 の灰）とはっきり違う**暖色の石畳**にする。
  // ここが「クラブの玄関前」だと、色だけで分かるようにするため。
  approach: { base: 0xd9c9a8, alt: 0xcfbf9d, line: 0xac9c7c, edge: 0x87795c, wall: 0xe8dcc2 },

  // スタジオ（明るいフローリング）
  studio: { base: 0xdcae6d, alt: 0xd0a260, line: 0xac8146, edge: 0x836030, wall: 0xf6ecd8 },

  // トレーニング（**黒に近いラバー床**。参考画像のマシンジムに合わせた）
  // 器具はグラファイトのグレー（GEAR_ACCENT）なので、床をここまで暗くして
  // **明度差だけで**マシンの形が浮き立つようにしている。
  // **ここを明るくすると器具が床に埋もれる**（fixcheck の「器具と床の明度差」が落ちる）。
  gym: { base: 0x33383d, alt: 0x2e3338, line: 0x23272b, edge: 0x191c1f, wall: 0xefe6d8 },

  // マッサージエリア（濃い木目）
  recovery: { base: 0xa9733d, alt: 0x9c6935, line: 0x7c5227, edge: 0x5b3b1a, wall: 0xf0e4d2 },

  // コーチ室（木目）
  coachroom: { base: 0xbf8f5a, alt: 0xb2844f, line: 0x926a3a, edge: 0x6b4c28, wall: 0xf2e8d8 },

  // 会議室（落ち着いたカーペット）
  meeting: { base: 0x6b87a3, alt: 0x627d98, line: 0x4c6479, edge: 0x38495a, wall: 0xeef2f7 },

  /**
   * 食堂（明るい木目調のタイル）。
   *
   * 【暗いテラコッタから明るい木目へ】以前は濃いオレンジの床だったが、
   * 上に置く什器（明るい木のテーブル・ステンレスのカウンター）と明度が近く、
   * 何が置いてあるのか分かりにくかった。**床を明るくして、什器の輪郭を立たせる**。
   * 温かさは色味（黄みがかったベージュ）で出し、明度は上げておく。
   */
  cafeteria: { base: 0xe6cfae, alt: 0xdcc3a0, line: 0xbb9b74, edge: 0x8f7451, wall: 0xfaf1e2 },

  // ドクタールーム（清潔感のある白緑。医務室らしく明るく）
  clinic: { base: 0xd9ece2, alt: 0xc9e0d4, line: 0x9dc0ae, edge: 0x6f9a86, wall: 0xeef7f2 },

  /**
   * 【医科学センター】研究室の白い樹脂床。
   * ドクタールーム（白緑）より **青寄りで明るい**。隣り合わせに建てても見分けが付く。
   * 上に置く測定機器（白＋シアンの発光）が浮くよう、床はほぼ無彩色に近い明るさにしてある。
   */
  science: { base: 0xe4edf4, alt: 0xd6e2ec, line: 0xa9bccb, edge: 0x7b90a1, wall: 0xf2f7fb },

  /**
   * 【高地トレーニング棟】低酸素室の暗い床。
   * 「空気が薄い部屋」を色で表すため、館内でいちばん暗い青に落としてある
   *（筋トレルームの黒ラバーとは色味で分ける）。機器のシアンの発光がよく映える。
   */
  altitudeLab: { base: 0x2c3a4a, alt: 0x273444, line: 0x1d2836, edge: 0x141c27, wall: 0xdce6f0 },

  /**
   * 【アスリート寮】明るいビニル床（2026-09-18 に描き替え）。
   *
   * 以前は畳寄りの緑で「合宿所」の色だったが、大型施設に格上げして
   * ポッド寮に描き替えたので、床も今どきの宿泊棟に合わせた落ち着いたセージにする。
   * 置く物（木のポッド・白い機器・シアンの間接照明）より**明るさを一段落とす**ことで、
   * 什器の輪郭が床から浮き立つ。
   *
   * 【館内の通路と必ず離すこと】一度いまの明るい灰木（0xd8d2c6）にしたら、
   * 通路（road＝0xd9cfb6）とほとんど同じ明るさ・色味になり、
   * **部屋の境目が画面から消えた**。寮は広い（12×7）ので、床が通路に紛れると
   * 「大きな部屋を建てた」感じがまったく出ない。
   */
  dorm: { base: 0xa8bdb4, alt: 0x9fb4ab, line: 0x80978d, edge: 0x5f746b, wall: 0xeaf2ee },
  // ---- 温浴施設（風呂・サウナ・外気浴）----
  //
  // 参考画像の温浴フロアに合わせて、3つとも**質感がひと目で違う**ようにしてある。
  //   風呂   … 水色の細かいタイル（bath＝洗い場／bathWater＝透明感のある湯）
  //   サウナ … 木の床・木の壁。壁を明るい飴色にして「暖色の照明が当たっている」ように見せる
  //   外気浴 … ウッドデッキ（灰色寄りの板）。屋内の他の床より彩度を落として外の空気を出す
  //
  // サウナ（濃い木）と外気浴（明るい板）で明度をはっきり分けてあるので、
  // 隣り合わせに建てても、どこがどちらの部屋か床だけで分かる。
  // 床は**濃い**木にしておく。ベンチ（明るい木）を置いたときに、
  // 床と同じ明るさだと座面が沈んで「木の塊」に見えてしまうため。
  sauna: { base: 0x8a5d30, alt: 0x7d5329, line: 0x5f3f1d, edge: 0x412a11, wall: 0xd9a35e },
  // 洗い場・湯船のふち（水色の細かいタイル。目地を強めに出す）
  bath: { base: 0xd3e8f2, alt: 0xc4dded, line: 0x93b7ca, edge: 0x6d90a3, wall: 0xe8f5fb },
  // 湯（プールの水より明るく、わずかに緑がかった「あたたかい水」）
  bathWater: { base: 0x54c6dd, alt: 0x6ad8ec, line: 0x2f9fbc, edge: 0x1c7f9c, wall: 0xe8f5fb },
  // 外気浴のウッドデッキ（板目を目地で出す）
  openair: { base: 0xbf9f76, alt: 0xb39367, line: 0x8f724a, edge: 0x6a5334, wall: 0xdcc9a4 },
  shop: { base: 0xc9a06a, alt: 0xbe955f, line: 0x9a7645, edge: 0x745531, wall: 0xf4e8d0 },
  // 賑わいスペース。屋内施設の色味（明るい木目とタイル）に合わせてある
  cafe: { base: 0xd8b98a, alt: 0xceae7d, line: 0xa98a5c, edge: 0x7d6440, wall: 0xf7ecd8 },
  lounge: { base: 0xc8bcae, alt: 0xbeb1a2, line: 0x9c8f80, edge: 0x726758, wall: 0xf2ece2 },
  kids: { base: 0xe8c98f, alt: 0xdcbc80, line: 0xb8975f, edge: 0x8a6f42, wall: 0xfaeedc },
  vending: { base: 0xb9c3cb, alt: 0xadb8c0, line: 0x8b969e, edge: 0x656e75, wall: 0xeef2f5 },
};

/** 未定義の床が来ても落ちないように。 */
export function roomStyle(kind: FloorKind): RoomStyle {
  return ROOM_STYLE[kind] ?? ROOM_STYLE.lobby;
}
