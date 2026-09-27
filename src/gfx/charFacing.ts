import type { CharMode } from "./charSprites";
import { charAssetFrames } from "./charAssets";

/**
 * 【キャラ素材の向き表】
 *
 * エンジン側の約束は「**反転していない絵は画面の右を向いている**」で、
 * 進行方向が画面左のときだけ setFlipX(true) にする。
 * ところが描き起こした素材は、**姿ごとに向きがばらばら**に描かれている。
 *   ・幼児／学童（b_* / g_*）… 立ち姿はぜんぶ**正面**、泳ぎは**左向き**（頭が左）
 *   ・大人 女性（f_*）        … 歩きも泳ぎも**左向き**（f_student の歩きだけ正面）
 *   ・大人 男性（m_*）        … 歩きは**左向き**、泳ぎは**右向き**（頭が右）
 *   ・水着・トレーニング       … 正面
 * このまま「右向き前提」で反転すると、右へ歩く人はうしろ歩きになり、
 * 泳ぐ人は**足のほうへ進む**（頭と進行方向が逆になる）。
 *
 * そこで素材の向きをこの表に持たせ、反転するかどうかをここだけで決める。
 *   front … 正面の絵。左右どちらへ進んでも**反転しない**（髪飾りが飛ばない）
 *   right … 右向きの絵。左へ進むときだけ反転する（＝エンジンの既定）
 *   left  … 左向きの絵。右へ進むときだけ反転する
 *
 * 【直し方】絵を描き直して向きが変わったら、そのタイプ・その姿の値を変えるだけでよい。
 * 表に無い姿は right（＝コード生成のドット絵と同じ）として扱う。
 * 中身は素材を実測して作った（頭・顔がどちら寄りか）。判定は movecheck.ts が見張っている。
 */
export type CharView = "front" | "right" | "left";

/** タイプID → 姿 → 素材の向き。 */
export const CHAR_VIEW: Record<string, Partial<Record<CharMode, CharView>>> = {
  // ---- 大人・男性：歩きは左向きの横顔／泳ぎは右向き（頭が右）に描かれている
  m_sporty: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "right", swimFree: "right", swimBreast: "right", swimBack: "right", swimFly: "right", kick: "right", float: "right", dive: "right" },  // スポーティ
  m_muscle: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "right", swimFree: "right", swimBreast: "right", swimBack: "right", swimFly: "right", kick: "right", float: "right", dive: "left" },  // 筋肉質
  m_student: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "right", swimFree: "right", swimBreast: "right", swimBack: "right", swimFly: "right", kick: "right", float: "right", dive: "left" },  // 学生
  m_office: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "right", swimFree: "right", swimBreast: "right", swimBack: "right", swimFly: "right", kick: "right", float: "right", dive: "left" },  // 社会人
  m_senior: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "right", swimFree: "right", swimBreast: "right", swimBack: "right", swimFly: "right", kick: "right", float: "right", dive: "left" },  // シニア

  // ---- 大人・女性：歩きも泳ぎも左向き（f_student だけ歩きが正面）
  f_energetic: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "left", swimFree: "left", swimBreast: "left", swimBack: "left", swimFly: "left", kick: "left", float: "left", dive: "left" },  // 元気
  f_cool: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "left", swimFree: "left", swimBreast: "left", swimBack: "left", swimFly: "left", kick: "left", float: "left", dive: "left" },  // クール
  f_student: { walk: "front", walkBack: "front", suit: "front", train: "front", swim: "left", swimFree: "left", swimBreast: "left", swimBack: "left", swimFly: "left", kick: "left", float: "left", dive: "left" },  // 学生
  f_adult: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "left", swimFree: "left", swimBreast: "left", swimBack: "left", swimFly: "left", kick: "left", float: "left", dive: "left" },  // 大人
  f_senior: { walk: "left", walkBack: "left", suit: "front", train: "front", swim: "left", swimFree: "left", swimBreast: "left", swimBack: "left", swimFly: "left", kick: "left", float: "left", dive: "left" },  // シニア

  // ---- 幼児・学童（男の子）：立ち姿は正面、泳ぎは左向き（頭が左）
  b_genki: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // げんき
  b_ottori: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // おっとり
  b_yancha: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // やんちゃ
  b_oshare: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // おしゃれ
  b_nakimushi: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // なきむし

  // ---- 幼児・学童（女の子）
  g_genki: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // げんき
  g_ottori: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // おっとり
  g_yancha: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // やんちゃ
  g_oshare: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // おしゃれ
  g_nakimushi: { walk: "front", walkBack: "front", suit: "front", swim: "left", kick: "left", float: "left" },  // なきむし
};

/**
 * その絵がどちらを向いているか。
 * **素材が入っていない姿はコード生成のドット絵**（右向きに描いてある）なので right を返す。
 * ここを通すおかげで、素材が半分しか揃っていなくても向きが混ざらない。
 */
export function charFacing(typeId: string, mode: CharMode): CharView {
  if (charAssetFrames(typeId, mode) === 0) return "right";
  return CHAR_VIEW[typeId]?.[mode] ?? "right";
}

/**
 * 進行方向（画面X。1＝右／-1＝左）に対して絵を反転するか。
 * 正面の絵は反転しない＝どちらへ進んでも同じ顔で出る。
 */
export function flipXFor(view: CharView, faceDir: 1 | -1): boolean {
  if (view === "front") return false;
  return view === "left" ? faceDir > 0 : faceDir < 0;
}
