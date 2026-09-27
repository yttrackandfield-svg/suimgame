/**
 * キャラクターの「タイプ」。
 *
 * 素材シート（大人 男性5／女性5、幼児 男の子5／女の子5）と1対1で対応する表。
 * 髪型・髪色・服の色・小物をここにまとめてあるので、
 *   ・コード生成のドット絵（charSprites.ts）
 *   ・あとから差し替える PNG 素材（charAssets.ts）
 * の両方が同じタイプ定義を見る。素材が届いたら差し替えるだけで、割り当ての仕組みは変わらない。
 *
 * 【並び順が大事】1タイプ＝1バリエーション番号（0..9）で、
 *   0..4 が男性、5..9 が女性。
 * 体型（kid/child/teen/adult/guest）ごとに10タイプ持つので、
 * テクスチャのキー（charKey）と枚数はこれまでと変わらない＝セーブにも影響しない。
 */

/** 性別（sim/student.ts の Gender と同じ意味。gfx を sim に依存させないため独自に持つ）。 */
export type CharGender = "m" | "f";

/** 髪型（シルエット）。小さく描いても見分けが付くよう、輪郭が変わるものを選んである。 */
export type HairStyle =
  | "short" // 短髪
  | "spiky" // 逆立てた髪（筋トレ好き）
  | "wavy" // ふんわり短髪
  | "bob" // ボブ
  | "ponytail" // ポニーテール
  | "sidetail" // サイドテール
  | "twintail" // ツインテール
  | "bun" // おだんご
  | "long" // ロング
  | "toddler" // 幼児のやわらかい丸い髪
  | "toddlerBow"; // 幼児＋リボン

/** 小物（そのタイプの目印になるもの）。 */
export type CharAccessory = "none" | "glasses" | "towel" | "bag" | "ball" | "hairband";

export interface CharTypeDef {
  /** 素材ファイル名にも使う識別子（例：m_sporty）。 */
  id: string;
  /** 画面に出す呼び名。 */
  label: string;
  gender: CharGender;
  hair: HairStyle;
  hairColor: number;
  /** 私服の上着。 */
  shirt: number;
  /** 私服のズボン。 */
  pants: number;
  /** 水着。 */
  suit: number;
  /** スイムキャップ。 */
  cap: number;
  /** 肌の色（SKIN の添字）。 */
  skin: number;
  accessory: CharAccessory;
  /** シニア（白髪・落ち着いた色）。表情や姿勢の味付けに使う。 */
  senior?: boolean;
}

// 髪の色（素材シートの色味に合わせてある）
const H_BROWN = 0x6b4526;
const H_DARK = 0x2a2118;
const H_BLACK = 0x1f1a16;
const H_LIGHT = 0x8b5e34;
const H_GREY = 0xa9a6a0;

/**
 * 【大人】男性5タイプ・女性5タイプ。
 * 学童・中高生・大人・一般客はすべてこの表を使う（体型だけが違う）。
 *
 *   男性 … ①スポーティー ②筋トレ好き ③爽やか学生 ④社会人 ⑤シニア
 *   女性 … ①元気系 ②クール系 ③学生 ④大人女子 ⑤シニア
 */
export const ADULT_TYPES: readonly CharTypeDef[] = [
  {
    id: "m_sporty",
    label: "スポーティー",
    gender: "m",
    hair: "wavy",
    hairColor: H_BROWN,
    shirt: 0x2f6fd0,
    pants: 0x24406e,
    suit: 0x1f4e9c,
    cap: 0x2f6fd0,
    skin: 0,
    accessory: "none",
  },
  {
    id: "m_muscle",
    label: "筋トレ好き",
    gender: "m",
    hair: "spiky",
    hairColor: H_BLACK,
    shirt: 0x2b2b30,
    pants: 0x1e1e22,
    suit: 0x222228,
    cap: 0x3a3a42,
    skin: 1,
    accessory: "none",
  },
  {
    id: "m_student",
    label: "爽やか学生",
    gender: "m",
    hair: "short",
    hairColor: H_BROWN,
    shirt: 0xf4f6f7,
    pants: 0x2f6fd0,
    suit: 0x2f6fd0,
    cap: 0x4aa3e0,
    skin: 0,
    accessory: "none",
  },
  {
    id: "m_office",
    label: "社会人",
    gender: "m",
    hair: "short",
    hairColor: H_DARK,
    shirt: 0x5b6169,
    pants: 0x33383e,
    suit: 0x3d4650,
    cap: 0x5b6169,
    skin: 0,
    accessory: "glasses",
  },
  {
    id: "m_senior",
    label: "シニア",
    gender: "m",
    hair: "short",
    hairColor: H_GREY,
    shirt: 0x8bbf5a,
    pants: 0x4c5a3f,
    suit: 0x5a7a3c,
    cap: 0x8bbf5a,
    skin: 0,
    accessory: "towel",
    senior: true,
  },
  {
    id: "f_energetic",
    label: "元気系",
    gender: "f",
    hair: "ponytail",
    hairColor: H_LIGHT,
    shirt: 0xef6f9a,
    pants: 0x3a3f4a,
    suit: 0xe94f82,
    cap: 0xef6f9a,
    skin: 0,
    accessory: "hairband",
  },
  {
    id: "f_cool",
    label: "クール系",
    gender: "f",
    hair: "sidetail",
    hairColor: H_BLACK,
    shirt: 0x2b2b30,
    pants: 0x1e1e22,
    suit: 0x2a2a34,
    cap: 0x4a4a58,
    skin: 1,
    accessory: "none",
  },
  {
    id: "f_student",
    label: "学生",
    gender: "f",
    hair: "bob",
    hairColor: H_BROWN,
    shirt: 0xf4f6f7,
    pants: 0x2f6fd0,
    suit: 0x2f6fd0,
    cap: 0x7fc4ec,
    skin: 0,
    accessory: "none",
  },
  {
    id: "f_adult",
    label: "大人女子",
    gender: "f",
    hair: "bun",
    hairColor: H_BROWN,
    shirt: 0xa679d6,
    pants: 0x4a4356,
    suit: 0x8e5fc4,
    cap: 0xa679d6,
    skin: 0,
    accessory: "none",
  },
  {
    id: "f_senior",
    label: "シニア",
    gender: "f",
    hair: "bob",
    hairColor: H_GREY,
    shirt: 0xf19bb0,
    pants: 0x5a4f52,
    suit: 0xd97e96,
    cap: 0xf19bb0,
    skin: 0,
    accessory: "towel",
    senior: true,
  },
];

/**
 * 【幼児・学童】男の子5タイプ・女の子5タイプ。
 *   ①元気っ子 ②おっとり ③やんちゃ ④おしゃれ ⑤泣き虫
 * 幼児・学童は四泳法をやらないので、泳ぎは「ビート板バタ足」と「水中練習」の共通姿になる。
 * 背丈は体型（kid／child）ごとに変わるので、同じ絵でも学童は少し大きく出る。
 */
export const KID_TYPES: readonly CharTypeDef[] = [
  {
    id: "b_genki",
    label: "元気っ子",
    gender: "m",
    hair: "toddler",
    hairColor: H_BROWN,
    shirt: 0x4aa3e0,
    pants: 0x2f6fd0,
    suit: 0x2f6fd0,
    cap: 0x4aa3e0,
    skin: 0,
    accessory: "none",
  },
  {
    id: "b_ottori",
    label: "おっとり",
    gender: "m",
    hair: "toddler",
    hairColor: H_DARK,
    shirt: 0x7fc47a,
    pants: 0x3f7a4a,
    suit: 0x3f9a5a,
    cap: 0x7fc47a,
    skin: 0,
    accessory: "none",
  },
  {
    id: "b_yancha",
    label: "やんちゃ",
    gender: "m",
    hair: "spiky",
    hairColor: H_LIGHT,
    shirt: 0xf5a623,
    pants: 0x3a3f4a,
    suit: 0xe08a1e,
    cap: 0xf5a623,
    skin: 1,
    accessory: "ball",
  },
  {
    id: "b_oshare",
    label: "おしゃれ",
    gender: "m",
    hair: "toddler",
    hairColor: H_BROWN,
    shirt: 0xf4f6f7,
    pants: 0x6fc0dc,
    suit: 0x6fc0dc,
    cap: 0xf4f6f7,
    skin: 0,
    accessory: "none",
  },
  {
    id: "b_nakimushi",
    label: "泣き虫",
    gender: "m",
    hair: "toddler",
    hairColor: H_DARK,
    shirt: 0x9fb8e0,
    pants: 0x5a6a86,
    suit: 0x7f9ad0,
    cap: 0x9fb8e0,
    skin: 0,
    accessory: "none",
  },
  {
    id: "g_genki",
    label: "元気っ子",
    gender: "f",
    hair: "twintail",
    hairColor: H_BROWN,
    shirt: 0xf7a8c4,
    pants: 0xd9718f,
    suit: 0xef6f9a,
    cap: 0xf7a8c4,
    skin: 0,
    accessory: "none",
  },
  {
    id: "g_ottori",
    label: "おっとり",
    gender: "f",
    hair: "bob",
    hairColor: H_LIGHT,
    shirt: 0xf7d76a,
    pants: 0xc4a23c,
    suit: 0xe8c24f,
    cap: 0xf7d76a,
    skin: 0,
    accessory: "none",
  },
  {
    id: "g_yancha",
    label: "やんちゃ",
    gender: "f",
    hair: "twintail",
    hairColor: H_DARK,
    shirt: 0xf58a7a,
    pants: 0xc45a4a,
    suit: 0xe0705e,
    cap: 0xf58a7a,
    skin: 1,
    accessory: "none",
  },
  {
    id: "g_oshare",
    label: "おしゃれ",
    gender: "f",
    hair: "toddlerBow",
    hairColor: H_BROWN,
    shirt: 0xc9a2e8,
    pants: 0x9a72c4,
    suit: 0xa679d6,
    cap: 0xc9a2e8,
    skin: 0,
    accessory: "hairband",
  },
  {
    id: "g_nakimushi",
    label: "泣き虫",
    gender: "f",
    hair: "toddlerBow",
    hairColor: H_LIGHT,
    shirt: 0xf7b8d0,
    pants: 0xd08aa4,
    suit: 0xe89ab8,
    cap: 0xf7b8d0,
    skin: 0,
    accessory: "none",
  },
];

/** 1つの体型が持つタイプ数（男性5＋女性5）。 */
export const TYPES_PER_BODY = 10;

/**
 * その体型が使うタイプ表。
 *
 * **幼児（kid）と学童（child）は子どものタイプ表**を使う。
 * ここに child を入れ忘れていたため、小学生に社会人やシニア（＝おじさん・おばさん）の
 * 絵が割り当たっていた。姿の一覧（modesFor）は最初から
 * 「walk / walkBack / suit / swim / kick / float」＝子ども用になっていたので、
 * 歩きだけ大人の絵・泳ぎだけドット絵、というちぐはぐな状態にもなっていた。
 */
export function typeTableFor(body: string): readonly CharTypeDef[] {
  return body === "kid" || body === "child" ? KID_TYPES : ADULT_TYPES;
}

/** バリエーション番号 → タイプ定義。 */
export function charTypeOf(body: string, variant: number): CharTypeDef {
  const table = typeTableFor(body);
  const i = ((Math.floor(variant) % table.length) + table.length) % table.length;
  return table[i];
}

/**
 * 【割り当て】性別とIDから、そのキャラのタイプ番号を決める。
 *
 * 男性は 0..4、女性は 5..9 に必ず入るので、性別と見た目が食い違わない。
 * ID から決めるので**同じ選手はいつでも同じ見た目**になり、
 * セーブに見た目を持たせる必要がない（＝古いセーブもそのまま読める）。
 */
export function variantForGender(gender: CharGender, id: number): number {
  const half = TYPES_PER_BODY / 2;
  // 隣り合うIDが同じタイプにならないよう、軽く撹拌してから5つに割る
  const h = Math.abs(Math.imul(Math.floor(id) + 1, 2654435761) >>> 0) % half;
  return gender === "f" ? half + h : h;
}

/** シニアのタイプか（一般客の年齢に合わせて選ぶのに使う）。 */
export function isSeniorVariant(body: string, variant: number): boolean {
  return charTypeOf(body, variant).senior === true;
}

/** その性別のタイプ番号の一覧（一般客の抽選に使う）。 */
export function variantsOfGender(gender: CharGender): number[] {
  const half = TYPES_PER_BODY / 2;
  const base = gender === "f" ? half : 0;
  return Array.from({ length: half }, (_, i) => base + i);
}
