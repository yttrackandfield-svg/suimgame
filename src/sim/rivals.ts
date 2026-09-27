import { RACE } from "../config/balance";
import type { Gender, RaceEvent } from "./student";

/**
 * 大会に出てくる相手（CP選手）の名前と実力。
 *
 * 【なぜ独立したファイルか】以前の相手は `強豪A` `宿敵C` `台風の目O` という
 * 15個の使い回しで、同じレースに「強豪A」と「強豪B」が並ぶこともあった。
 * 名前が記号だと、勝っても負けても**誰と戦ったのか残らない**。
 *
 * 【強い相手は使い回し、モブは毎回ちがう】
 *   ・**強豪（NAMED_COUNT 人）** … 大会・種目・性別から作った固定の種で引くので、
 *     同じ大会の同じ種目に出れば**いつも同じ名前・同じ実力**で立っている。
 *     年をまたいでも変わらない（＝「またあいつが居る」が起きる）。
 *   ・**モブ（残り）** … その場の乱数。毎レース顔ぶれが変わる。
 *
 * 【強さの釣り合いは変えていない】強豪を「強い相手」として足すと、
 * 段ごとに調整した勝率（→ SCALE_RIVAL_LEVEL / RACE.rivalSpread）が崩れる。
 * そこで**ばらつきの範囲を分け合う**ことにした：
 *   強豪は上半分 [0, +spread]、モブは下半分 [−spread, 0]。
 * 8人ならべたときの「いちばん速い相手」の期待値は、全員を ±spread で引いていた
 * ときとほぼ同じ（3人を[0,+1]で引く最大 ≒ 7人を[−1,+1]で引く最大 ≒ +0.75）なので、
 * 勝率はそのままで、顔ぶれだけが意味を持つようになる。
 *
 * 【世界大会は外国の選手】国ごとに得手不得手を持たせてある（→ NATIONS）。
 * こちらも**帯ごとの平均を引いて正規化**しているので、相手全体の強さは変わらない
 *（アメリカが速いぶん、どこかの国が遅い）。
 */

/** 1レースに立つ「いつもの強豪」の人数。 */
const NAMED_COUNT = 3;

/** 距離の帯。国ごとの得手不得手はこの単位で持つ。 */
export type DistBand = "sprint" | "middle" | "distance";

export function bandOf(distance: number): DistBand {
  if (distance <= 100) return "sprint";
  if (distance <= 400) return "middle";
  return "distance";
}

export interface Nation {
  code: string;
  /** 名前の後ろに付ける1文字（「カーター（米）」）。 */
  short: string;
  label: string;
  /** 帯ごとの得手不得手（正規化前の生の値）。 */
  sprint: number;
  middle: number;
  distance: number;
  /** その国らしい姓（カタカナ）。 */
  family: readonly string[];
}

/**
 * 世界大会に出てくる国。
 *
 * 得手不得手は「短距離はアメリカ、長距離は中国」という印象に寄せてある（ユーザー指定）。
 * 生の値の大小だけが意味を持つ（平均は runtime で引く → nationBonus）。
 */
export const NATIONS: readonly Nation[] = [
  { code: "USA", short: "米", label: "アメリカ", sprint: 7, middle: 4, distance: 0, family: ["カーター", "ミラー", "ハリス", "ウォーカー"] },
  { code: "CHN", short: "中", label: "中国", sprint: -1, middle: 3, distance: 8, family: ["リュウ", "ワン", "チェン", "ジャン"] },
  { code: "AUS", short: "豪", label: "オーストラリア", sprint: 4, middle: 5, distance: 4, family: ["オコナー", "トンプソン", "ライアン", "ホランド"] },
  { code: "GBR", short: "英", label: "イギリス", sprint: 1, middle: 4, distance: 3, family: ["スコット", "ウィルソン", "クラーク", "ベイリー"] },
  { code: "FRA", short: "仏", label: "フランス", sprint: 4, middle: 1, distance: -1, family: ["デュラン", "ルクレール", "モロー", "ベルナール"] },
  { code: "ITA", short: "伊", label: "イタリア", sprint: 0, middle: 2, distance: 4, family: ["ロッシ", "コンティ", "マリーニ", "ガロ"] },
  { code: "HUN", short: "洪", label: "ハンガリー", sprint: -1, middle: 3, distance: 3, family: ["ナジ", "トート", "コバーチ", "ホルバート"] },
  { code: "GER", short: "独", label: "ドイツ", sprint: 0, middle: 0, distance: 1, family: ["ミュラー", "シュミット", "ワグナー", "ベッカー"] },
  { code: "CAN", short: "加", label: "カナダ", sprint: 2, middle: 1, distance: -1, family: ["トレンブレイ", "マクドナルド", "ラフルール", "パーカー"] },
  { code: "BRA", short: "伯", label: "ブラジル", sprint: 3, middle: -1, distance: -4, family: ["シルバ", "サントス", "コスタ", "アルメイダ"] },
  { code: "KOR", short: "韓", label: "韓国", sprint: -3, middle: -2, distance: -2, family: ["キム", "パク", "チョ", "ユン"] },
  { code: "RSA", short: "南ア", label: "南アフリカ", sprint: -1, middle: -2, distance: -5, family: ["ボータ", "ファンダイク", "スミット", "ネル"] },
];

/** 帯ごとの平均（これを引いて、相手全体の強さを変えないようにする）。 */
const NATION_MEAN: Record<DistBand, number> = {
  sprint: NATIONS.reduce((n, x) => n + x.sprint, 0) / NATIONS.length,
  middle: NATIONS.reduce((n, x) => n + x.middle, 0) / NATIONS.length,
  distance: NATIONS.reduce((n, x) => n + x.distance, 0) / NATIONS.length,
};

/** その国のその帯での上乗せ（平均0）。 */
export function nationBonus(n: Nation, band: DistBand): number {
  return n[band] - NATION_MEAN[band];
}

/**
 * 強豪の国の選びかた（その帯が得意な国に寄せる）。
 *
 * 国ごとの得手不得手を持たせても、**強豪の国を平等に引いてしまうと印象が出ない**
 *（1500mの常連が南アフリカばかり、ということが起きる）。
 * 重みを付けて、100mの常連はアメリカ・オーストラリア、1500mの常連は中国・イタリア
 * …と偏るようにする。3 で割っているのは「偏りすぎない」ための温度。
 */
const NATION_TEMP = 3;
const NATION_WEIGHT: Record<DistBand, number[]> = {
  sprint: NATIONS.map((n) => Math.exp(nationBonus(n, "sprint") / NATION_TEMP)),
  middle: NATIONS.map((n) => Math.exp(nationBonus(n, "middle") / NATION_TEMP)),
  distance: NATIONS.map((n) => Math.exp(nationBonus(n, "distance") / NATION_TEMP)),
};

/**
 * 寄せた選びかたで期待される上乗せ。
 *
 * **強豪ぶんはこれを引く。** 引かないと、強い国に寄せたぶんだけ相手全体が強くなり、
 * 段ごとに調整した勝率（→ SCALE_RIVAL_LEVEL）が世界大会だけ狂う。
 * 引いても「アメリカのほうが韓国より速い」という差はモブに残るので、印象は損なわない。
 */
const NATION_WEIGHTED_MEAN: Record<DistBand, number> = {
  sprint: weightedMean("sprint"),
  middle: weightedMean("middle"),
  distance: weightedMean("distance"),
};

function weightedMean(band: DistBand): number {
  const w = NATION_WEIGHT[band];
  const total = w.reduce((a, b) => a + b, 0);
  return NATIONS.reduce((acc, n, i) => acc + nationBonus(n, band) * (w[i] / total), 0);
}

/** 重み付きで国を1つ引く。 */
function pickNationWeighted(band: DistBand, rand: () => number): Nation {
  const w = NATION_WEIGHT[band];
  const total = w.reduce((a, b) => a + b, 0);
  let t = rand() * total;
  for (let i = 0; i < NATIONS.length; i++) {
    t -= w[i];
    if (t <= 0) return NATIONS[i];
  }
  return NATIONS[NATIONS.length - 1];
}

/** 外国の選手のイニシャル（性別ごと。名前らしさを出すだけのもの）。 */
const INITIAL: Record<Gender, readonly string[]> = {
  m: ["A", "B", "C", "D", "E", "J", "K", "L", "M", "N", "P", "R", "S", "T"],
  f: ["A", "C", "E", "F", "H", "I", "J", "K", "L", "M", "N", "S", "V", "Z"],
};

/**
 * 日本の相手の名前。
 *
 * 自クラブの選手（→ student.ts の FAMILY / GIVEN）とは**別の表**にしてある。
 * 同じ表から引くと、育てている子と同じ名前の相手が同じレースに並ぶ。
 */
const JP_FAMILY = [
  "青木", "石井", "上原", "大森", "岡田", "河合", "木村", "久保", "黒田", "斎藤",
  "坂本", "清水", "菅原", "関根", "武田", "谷口", "近藤", "鶴見", "寺島", "土井",
  "永井", "西村", "野口", "萩原", "橋本", "服部", "平野", "福田", "星野", "堀内",
  "松井", "三浦", "村上", "森田", "矢島", "安田", "横山", "吉川", "和田", "早瀬",
] as const;

const JP_GIVEN: Record<Gender, readonly string[]> = {
  m: ["翔", "大輝", "陽斗", "颯", "湊斗", "悠真", "航平", "蓮", "拓海", "駿", "圭吾", "隼人", "大和", "凌", "晴翔"],
  f: ["結衣", "凛", "美桜", "陽菜", "愛莉", "詩織", "楓", "澪", "実優", "花音", "彩葉", "千尋", "咲良", "杏奈", "乃愛"],
};

/** 文字列から決まる乱数（同じ文字列なら毎回同じ並び）。 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 相手1人ぶん。 */
export interface RivalSpec {
  name: string;
  /** 実力値（→ race.ts の timeFromPower）。 */
  power: number;
  /** その大会にいつも居る強豪か（掲示板で色を変えるのに使える）。 */
  named: boolean;
  /** 世界大会のときの国。 */
  nation?: Nation;
}

/** どの大会のどの種目か（強豪の種になる）。 */
export interface RivalContext {
  /** 大会の id。記録会は月ごとに id が変わるので、段のキーを渡すこと。 */
  compId: string;
  /** 外国の選手が出てくる大会か。 */
  world: boolean;
  event: RaceEvent;
  gender: Gender;
  /** 相手のタイムの上限（秒）。参加標準記録のある大会で、標準より遅い相手を出さない。 */
  timeCap?: number;
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
}

/** 日本の選手の名前（姓＋名）。 */
function japaneseName(gender: Gender, rand: () => number): string {
  const given = JP_GIVEN[gender];
  return `${pick(JP_FAMILY, rand)} ${pick(given, rand)}`;
}

/** 外国の選手の名前（イニシャル＋姓＋国）。 */
function foreignName(n: Nation, gender: Gender, rand: () => number): string {
  return `${pick(INITIAL[gender], rand)}・${pick(n.family, rand)}（${n.short}）`;
}

/**
 * 相手を count 人ぶん作る。
 *
 * `level` はその大会の相手の実力の中心（→ competitions.rivalLevelOf）。
 * 強豪は上半分、モブは下半分のばらつきを受け持つ（上のコメントの理由）。
 * 同じ名前が1レースに2人並ばないよう、出た名前は覚えておく。
 */
export function makeRivalSpecs(
  ctx: RivalContext,
  level: number,
  count: number,
  rand: () => number,
): RivalSpec[] {
  const spread = RACE.rivalSpread;
  const band = bandOf(ctx.event.distance);
  const seeded = seededRandom(`${ctx.compId}|${ctx.event.stroke}-${ctx.event.distance}|${ctx.gender}`);
  const used = new Set<string>();
  const out: RivalSpec[] = [];

  const add = (named: boolean, r: () => number): void => {
    let nation: Nation | undefined;
    let name = "";
    // 同名を避ける（最大8回引き直して、それでも重なれば番号を付ける）
    for (let t = 0; t < 8; t++) {
      // 強豪の国はその帯が得意な国に寄せる。モブは平等に引く
      nation = ctx.world ? (named ? pickNationWeighted(band, r) : pick(NATIONS, r)) : undefined;
      name = nation ? foreignName(nation, ctx.gender, r) : japaneseName(ctx.gender, r);
      if (!used.has(name)) break;
    }
    if (used.has(name)) name = `${name}・2`;
    used.add(name);
    // 強豪＝上半分 [0, +spread] ／ モブ＝下半分 [−spread, 0]
    const offset = named ? r() * spread : -r() * spread;
    // 強豪は寄せて引いたぶんの期待値を引く（→ NATION_WEIGHTED_MEAN）
    const bonus = nation ? nationBonus(nation, band) - (named ? NATION_WEIGHTED_MEAN[band] : 0) : 0;
    out.push({ name, power: level + offset + bonus, named, nation });
  };

  const namedCount = Math.min(NAMED_COUNT, count);
  for (let i = 0; i < namedCount; i++) add(true, seeded);
  for (let i = namedCount; i < count; i++) add(false, rand);
  return out;
}

/**
 * 名前だけを1つ作る（実力は呼んだ側が決める）。
 * リレーのように「**チーム全員が同じ国**」でなければならない場面で使う。
 * nation を渡さなければ日本の選手。
 */
export function rivalNameOf(nation: Nation | null, gender: Gender, rand: () => number): string {
  return nation ? foreignName(nation, gender, rand) : japaneseName(gender, rand);
}

/** 検査・案内用：その大会その種目の「いつもの強豪」の名前。 */
export function namedRivalsOf(ctx: RivalContext, level: number): RivalSpec[] {
  return makeRivalSpecs(ctx, level, NAMED_COUNT, () => 0.5).filter((r) => r.named);
}
