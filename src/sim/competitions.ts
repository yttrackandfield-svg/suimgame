import { canEnterCompetition, canEnterTimeTrial, type ClassId } from "./classes";
import { lifeStageOf, type LifeStage } from "./growth";
import { meetsStandard, type StandardKey } from "../data/standardTimes";
import { GENERAL_RIVAL, RIVAL_LEVEL_FLOOR, ROUTE_RIVAL_ADJUST, SCALE_AWAY_DAYS, SCALE_FINAL_WALL, SCALE_REWARD, SCALE_RIVAL_LEVEL } from "../config/balance";
import { CORE_STROKES, STROKE_DISTANCES, type RaceEvent, type Student } from "./student";
import { placementLabelOf, type EntrantOutcome } from "./race";

export {
  SCALE_REWARD,
  SCALE_RIVAL_LEVEL,
  SCALE_FINAL_WALL,
  SCALE_ENTRY_FEE,
  SCALE_TRAVEL_FEE,
  SCALE_AWAY_DAYS,
  SCALE_MAYOR_PRIZE,
} from "../config/balance";

/**
 * 年間大会カレンダーと出場条件・報酬。
 * ルート（中学/高校/一般/JO/記録会）ごとに、月とステージで進行する。
 */

export type Scale = "kirokukai" | "area" | "ken" | "block" | "national" | "nihon" | "asia" | "sekai";

export const SCALE_LABEL: Record<Scale, string> = {
  kirokukai: "記録会",
  area: "地区大会",
  ken: "県大会",
  block: "地方ブロック",
  national: "全国",
  nihon: "日本選手権",
  // 主要大会から「アジア大会」は無くなったが、毎月の記録会ラダーの5段目
  //（アジア記録会）が段の目安としてこの規模を使っている
  asia: "アジア",
  sekai: "世界大会",
};

// SCALE_RIVAL_LEVEL / SCALE_REWARD は config/balance.ts に集約（上で re-export）。

export type Route = "elementary" | "middle" | "high" | "general" | "kirokukai";

/** 各ルートを歩けるライフステージ。 */
const ROUTE_LIFESTAGE: Record<Route, LifeStage[]> = {
  elementary: ["elementary"],
  middle: ["middle"],
  high: ["high"],
  // 【学生でも出られる】日本選手権と12月の世界大会は「大人だけ」ではない。
  // 出られるかどうかは**標準記録の突破**と**前の大会の勝ち上がり**で決まる（→ requiresStandard / requiresPrev）。
  // 高校生で日本選手権に出る、は現実にもある話なので、学年で閉ざさない。
  general: ["elementary", "middle", "high", "adult"],
  kirokukai: ["elementary", "middle", "high", "adult"],
};

/** そのルートに出られるのは誰か（年間予定の案内文に使う）。 */
const ROUTE_WHO: Record<Route, string> = {
  elementary: "小学生の選手",
  middle: "中学生の選手",
  high: "高校生の選手",
  general: "日本選手権標準を突破した選手（学年・年齢は問わない）",
  kirokukai: "だれでも",
};

/** そのルートの短い呼び名（大会名に付ける）。 */
export const ROUTE_SHORT: Record<Route, string> = {
  elementary: "小学",
  middle: "中学",
  high: "高校",
  general: "一般",
  kirokukai: "記録会",
};

export interface Competition {
  id: string;
  name: string;
  month: number; // 1-12
  scale: Scale;
  route: Route;
  qualifier: boolean; // 優勝で次ステージ突破
  requiresPrev?: string; // 前提：この大会IDを突破済みであること
  requiresStandard?: StandardKey; // 参加に標準記録が必要
}

/**
 * 年間カレンダー（2026-09-21 に組み直した）。
 *
 * 【小・中・高が同じ段を同じ月に歩く】
 *   4月 地区予選 → 5月 都道府県予選 → 6月 地域ブロック予選 → 7月 全国大会
 *   → 8月 アジア大会 → 9月 世界大会
 *   **前の段で優勝しないと次には出られない**（requiresPrev）。
 *   以前は中学と高校で開催月がずれていて、年間予定が読みづらかった
 *  （どの学年の子が何月に何を目指すのかが一目で分からない）。段をそろえると
 *   「4月にみんなで地区予選、勝った子だけ5月へ」という1本の流れになる。
 *   相手の強さは年代ぶん引いてある（→ ROUTE_RIVAL_ADJUST）。
 *
 * 【一般（エリート）は秋】（2026-09-26 にアジアを挟んで3段にした）
 *   10月 日本選手権（**学年・年齢・クラスを問わず、参加標準記録を突破した選手だけ**。育成Bの小学生でも出られる）
 *   11月 アジア選手権（日本選手権で優勝した種目）
 *   12月 世界選手権（アジア選手権で優勝した種目）
 *   シーズンの記録は1月に消えるので、3段を12月までに収めるために日本選手権を10月に置いた。
 *   日本選手権の標準記録はプロに合わせた高さ（→ data/standardTimes の NIHON_SENSHUKEN）。
 *   さらに、日本選手権の**各泳法100mで優勝した選手は日本代表**として、
 *   12月の世界大会のメドレーリレーに出られる（→ sim/relay.ts）。
 *
 * 学年の大会と一般の大会が月で分かれているので、
 * 高校生が9月の世界大会（高校）と10月の日本選手権の両方を狙える。
 */
const LADDER: readonly { key: string; name: string; month: number; scale: Scale }[] = [
  { key: "area", name: "地区予選", month: 4, scale: "area" },
  { key: "ken", name: "都道府県予選", month: 5, scale: "ken" },
  { key: "block", name: "地域ブロック予選", month: 6, scale: "block" },
  { key: "national", name: "全国大会", month: 7, scale: "national" },
  // 全国の次にアジア、その次に世界（2026-09-23）。世界へ行くには2つ勝ち上がる
  { key: "asia", name: "アジア大会", month: 8, scale: "asia" },
  { key: "sekai", name: "世界大会", month: 9, scale: "sekai" },
] as const;

/** 学年ルートの id の頭（セーブの clearedStages に積まれるので変えないこと）。 */
const ROUTE_PREFIX: Record<"elementary" | "middle" | "high", string> = {
  elementary: "el",
  middle: "mid",
  high: "hi",
};

/** 学年ルート1本ぶんの5大会を組み立てる。 */
function schoolLadder(route: "elementary" | "middle" | "high"): Competition[] {
  const p = ROUTE_PREFIX[route];
  return LADDER.map((t, i) => ({
    id: `${p}_${t.key}`,
    name: `${t.name}（${ROUTE_SHORT[route]}）`,
    month: t.month,
    scale: t.scale,
    route,
    // 最後（世界大会）の先は無いので、そこだけ勝ち上がりではない
    qualifier: i < LADDER.length - 1,
    requiresPrev: i > 0 ? `${p}_${LADDER[i - 1].key}` : undefined,
  }));
}

export const CALENDAR: readonly Competition[] = [
  ...schoolLadder("elementary"),
  ...schoolLadder("middle"),
  ...schoolLadder("high"),

  // --- 一般（エリート）ルート。標準記録で入り、優勝で世界へ ---
  {
    id: "gen_nihon",
    name: "日本選手権",
    month: 10,
    scale: "nihon",
    route: "general",
    qualifier: true,
    requiresStandard: "nihonSenshuken",
  },
  { id: "gen_asia", name: "アジア選手権", month: 11, scale: "asia", route: "general", qualifier: true, requiresPrev: "gen_nihon" },
  // id は古いセーブの clearedStages・リレーの記録に積まれているので変えない（名前だけ世界選手権に）
  { id: "gen_sekai", name: "世界選手権", month: 12, scale: "sekai", route: "general", qualifier: false, requiresPrev: "gen_asia" },
];

/**
 * その大会の相手の実力（段の強さ − 年代ぶん）。
 * 同じ「世界大会」でも、小学生の世界大会と一般の世界選手権ではまるで速さが違う。
 */
export function rivalLevelOf(comp: Competition): number {
  // 日本選手権・アジア・世界は専用の表（→ GENERAL_RIVAL）
  const gen = generalRival(comp);
  if (gen) return gen.level;
  return Math.max(RIVAL_LEVEL_FLOOR, SCALE_RIVAL_LEVEL[comp.scale] + (ROUTE_RIVAL_ADJUST[comp.route] ?? 0));
}

/** 決勝で相手が強くなる量（→ SCALE_FINAL_WALL／一般ルートは GENERAL_RIVAL）。 */
export function finalWallOf(comp: Competition): number {
  const gen = generalRival(comp);
  if (gen) return gen.wall;
  return SCALE_FINAL_WALL[comp.scale] ?? 0;
}

function generalRival(comp: Competition): { level: number; wall: number } | null {
  if (comp.route !== "general") return null;
  if (comp.scale === "nihon" || comp.scale === "asia" || comp.scale === "sekai") return GENERAL_RIVAL[comp.scale];
  return null;
}

/**
 * 記録会のラダー（毎月・任意参加）。
 *
 * 下から順に  地区 → 都道府県 → 地域ブロック → 全国 → アジア → 世界。
 * **その段で優勝すると、その種目で次の段の記録会に出られるようになる**（年度が変わっても残る）。
 * 上へ行くほど参加料・遠征費が高くなり、全国から上は1週間クラブを空けることになる。
 *
 * カレンダーに固定枠は持たず、月ごとに動的に作る（毎月どこかで開かれている扱い）。
 */
export interface KirokukaiTier {
  key: string; // 段の識別子（season.clearedStages に積む id の元）
  name: string;
  scale: Scale;
}

export const KIROKUKAI_LADDER: readonly KirokukaiTier[] = [
  { key: "kk_area", name: "地区記録会", scale: "kirokukai" },
  { key: "kk_ken", name: "都道府県記録会", scale: "ken" },
  { key: "kk_block", name: "地域ブロック記録会", scale: "block" },
  { key: "kk_national", name: "全国記録会", scale: "national" },
  { key: "kk_asia", name: "アジア記録会", scale: "asia" },
  { key: "kk_sekai", name: "世界記録会", scale: "sekai" },
] as const;

/** 記録会の段を Competition に組み立てる（月ごとに開催）。 */
export function kirokukaiOf(month: number, tier = 0): Competition {
  const t = KIROKUKAI_LADDER[Math.max(0, Math.min(KIROKUKAI_LADDER.length - 1, tier))];
  const prev = tier > 0 ? KIROKUKAI_LADDER[tier - 1] : null;
  return {
    id: `${t.key}_${month}`,
    name: t.name,
    month,
    scale: t.scale,
    route: "kirokukai",
    // 最上段（世界）以外は「優勝すれば次の段へ」
    qualifier: tier < KIROKUKAI_LADDER.length - 1,
    requiresPrev: prev ? prev.key : undefined,
  };
}

/**
 * 【勝ち上がりは「選手」ではなく「選手＋種目」で持つ】
 *
 * 記録会で優勝して次の段に上がるとき、上がるのは**その種目**。
 * 100m自由形で県大会を勝った子が、次のブロック大会に200m平泳ぎで出られるのはおかしい。
 * そこで、突破した段の記録を `段のキー@種目` の形で持つ。
 *
 * 種目の付いていない記録（この仕組みより前のセーブ）は、読み込むときに
 * その子の得意種目の記録へ直す（→ withEventKeys）。「どの種目でも可」のまま残すと、
 * 優勝していない種目で上の大会に出られる抜け道になる。
 */
export function stageEventKey(stage: string, ev: RaceEvent): string {
  return `${stage}@${ev.stroke}-${ev.distance}`;
}

/**
 * 種目の付いていない古い記録を、得意種目つきの記録に直す（セーブを読み込むときに使う）。
 * 勝った種目までは残っていないので、いちばん出ていそうな得意種目で代わりにする。
 * 直した結果が同じになる記録は1つにまとめる。
 */
export function withEventKeys(keys: readonly string[], fav: RaceEvent): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const key = k.includes("@") ? k : stageEventKey(k, fav);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** 記録から段のキーだけを取り出す（種目が付いていてもいなくても同じ答え）。 */
export function stageOf(key: string): string {
  const at = key.indexOf("@");
  return at < 0 ? key : key.slice(0, at);
}

/**
 * その段を突破しているか。
 * ev を渡すと「**その種目で**突破しているか」を見る。
 */
export function hasClearedStage(s: Student, stage: string, ev?: RaceEvent): boolean {
  for (const k of s.season.clearedStages) {
    if (stageOf(k) !== stage) continue;
    if (!ev) return true;
    // 種目の付いていない記録では通さない（読み込むときに得意種目つきへ直してある → withEventKeys）
    const at = k.indexOf("@");
    if (at >= 0 && k.slice(at + 1) === `${ev.stroke}-${ev.distance}`) return true;
  }
  return false;
}

/** その段を突破した種目の一覧（次の大会で出られる種目の案内に使う）。 */
export function clearedEventsOf(s: Student, stage: string): RaceEvent[] {
  return eventsOfKeys(s.season.clearedStages, stage);
}

/** `キー@泳法-距離` の並びから、そのキーの種目だけを取り出す。 */
function eventsOfKeys(keys: readonly string[], key: string): RaceEvent[] {
  const out: RaceEvent[] = [];
  for (const k of keys) {
    if (stageOf(k) !== key) continue;
    const at = k.indexOf("@");
    if (at < 0) continue;
    const [stroke, distance] = k.slice(at + 1).split("-");
    out.push({ stroke: stroke as RaceEvent["stroke"], distance: Number(distance) });
  }
  return out;
}

/** その大会は記録会か（＝育成クラスからでも出られる）。 */
export function isTimeTrial(comp: Competition): boolean {
  return comp.route === "kirokukai";
}

/**
 * その大会に出せるクラスかを判定する関数を返す。
 *
 * 【地区大会は育成から出られる】（2026-09-23）
 * 4月の地区予選は各ルートの入口で、ここが**育っている子を実戦に出す最初の場**になる。
 * 選手クラスまで上げないと出られないままだと、育成B・育成Aの子は
 * 毎月の記録会しかやることが無かった。地区大会だけ間口を広げて、
 * 「勝てば都道府県予選へ」という道を育成のうちから歩けるようにする。
 *
 * 都道府県予選から上は今までどおり選手・プロだけ
 *（勝ち上がると自動で出場するので、そこまでに昇格させる、が目標になる）。
 */
export function canEnterOf(comp: Competition): (id: ClassId) => boolean {
  if (isTimeTrial(comp)) return canEnterTimeTrial;
  if (comp.scale === "area") return canEnterTimeTrial; // 育成B以上
  // 【日本選手権・アジア・世界はタイムだけが資格】クラスや学年では閉ざさない（2026-09-26）。
  // 参加標準記録を切った子なら育成Bの小学生でも出られ、勝ち進めばアジア・世界へ行ける
  if (comp.route === "general") return canEnterTimeTrial;
  return canEnterCompetition;
}

/** 地区大会か（種目を選べる・育成から出られる入口の大会）。 */
export function isAreaMeet(comp: Competition): boolean {
  return comp.scale === "area";
}

/** その大会 id が記録会ラダーの何段目か（記録会でなければ null）。 */
export function kirokukaiTierOf(compId: string): number | null {
  const i = KIROKUKAI_LADDER.findIndex((t) => compId.startsWith(`${t.key}_`));
  return i < 0 ? null : i;
}

/**
 * その選手が今出られる記録会（勝ち上がった段まで全部出せる）。
 * 下の段に出し直して調整に使う、というのもアリにしてある。
 */
export function kirokukaiFor(s: Student, month: number, year: number): Competition[] {
  ensureSeason(s, year);
  const list: Competition[] = [kirokukaiOf(month, 0)];
  for (let i = 1; i < KIROKUKAI_LADDER.length; i++) {
    // 一覧には「その段を（どれかの種目で）勝ったら」出す。
    // どの種目で出られるかは、選手を選ぶところで見る（→ raceEntryStatus）
    if (!hasClearedStage(s, KIROKUKAI_LADDER[i - 1].key)) break;
    list.push(kirokukaiOf(month, i));
  }
  return list;
}

/**
 * 年間の主要大会の一覧（大会画面の「年間予定」に出す1行）。
 *
 * 【見えかたのきまり】
 *  ・**どのルートの大会も、選手がいなくても一覧には出す。** ここは「この先どんな大会が
 *    あるのか」を知る唯一の場所なので、隠すと記録会しか無いゲームに見えてしまう。
 *    出られないときは理由（中学生の選手が要る、など）を1行で添える。
 *  ・勝ち上がりの大会（地域 → 都道府県 → 地方ブロック → 全国）は、
 *    **前の段階を優勝するまで、その先を一覧に出さない**（locked＝行ごと隠す）。
 *    ルートの入口（地区予選）は最初から見えているので、道筋は伝わる。
 *  ・標準記録が要る大会（ジャパンオープン等）は、行は出すが理由を添えて出場不可にする
 *    （こちらは勝ち上がりではなく「タイムを出せば届く」目標なので、見えていたほうがよい）。
 */
export interface ScheduleRow {
  id: string;
  name: string;
  /** 開催月（1-12）。記録会ラダーは 0＝毎月。 */
  month: number;
  scale: Scale;
  /** 今この瞬間、実際に出場できるか。 */
  open: boolean;
  /** 出られない理由／開催時期の案内（1行）。 */
  note: string;
}

/**
 * クラブの年間予定を組み立てる。
 *
 *   majors … 主要大会に出せる生徒（選手・プロ）。ルートの案内文と勝ち上がりの判定に使う
 *   trials … 記録会に出せる生徒（育成B以上）。記録会ラダーの段はこちらで見る
 *
 * 2つを分けているのは、育成の子は記録会にだけ出られるため。
 * 一緒にすると「中学生の選手がいる」と誤って案内してしまう。
 */
export function seasonSchedule(
  majors: readonly Student[],
  trials: readonly Student[],
  month: number,
  year: number,
  openIds: ReadonlySet<string>,
): ScheduleRow[] {
  for (const s of trials) ensureSeason(s, year);
  const stages = new Set<string>();
  const standards = new Set<StandardKey>();
  const lifeStages = new Set<LifeStage>();
  for (const s of majors) {
    lifeStages.add(lifeStageOf(s.grade));
    for (const k of s.season.clearedStages) stages.add(stageOf(k));
    for (const k of s.season.standards) standards.add(k as StandardKey);
  }
  // 記録会の段は、育成の子が勝った段も数える
  const trialStages = new Set<string>();
  const trialLifeStages = new Set<LifeStage>();
  for (const s of trials) {
    trialLifeStages.add(lifeStageOf(s.grade));
    for (const k of s.season.clearedStages) trialStages.add(stageOf(k));
  }

  const out: ScheduleRow[] = [];
  for (const c of CALENDAR) {
    // 勝ち上がりの先はまだ見せない（前の段階を優勝して初めて現れる）
    if (c.requiresPrev && !stages.has(c.requiresPrev)) continue;

    /**
     * そのルートを歩ける選手がいるか（いなくても行は出す。理由を添えるだけ）。
     * **地区大会は育成B以上が出られる**ので、数える母集団が広い（→ canEnterOf）。
     */
    const pool = isAreaMeet(c) ? trialLifeStages : lifeStages;
    const hasRunner = ROUTE_LIFESTAGE[c.route].some((st) => pool.has(st));
    const open = openIds.has(c.id);
    let note: string;
    if (open) note = "今月第3週に開催（2週間前に出場確認が届く）";
    else if (!hasRunner) note = `${ROUTE_WHO[c.route]}が出場（いまクラブにいない）`;
    else if (c.requiresStandard && !standards.has(c.requiresStandard)) note = "参加標準記録が要る";
    else if (c.month === month) note = "今月開催（出場資格のある選手がいない）";
    else if (c.month > month) note = `${c.month}月第3週に開催（2週間前に出場確認が届く）`;
    else note = `${c.month}月に開催（今年は終了）`;
    out.push({ id: c.id, name: c.name, month: c.month, scale: c.scale, open, note });
  }

  // 記録会ラダー：勝ち上がった段まで（毎月どこかで開かれている）
  let tier = 0;
  for (let i = 1; i < KIROKUKAI_LADDER.length; i++) {
    if (!trialStages.has(KIROKUKAI_LADDER[i - 1].key)) break;
    tier = i;
  }
  for (let i = 0; i <= tier; i++) {
    const t = KIROKUKAI_LADDER[i];
    const open = openIds.has(t.key);
    out.push({
      id: t.key,
      name: t.name,
      month: 0,
      scale: t.scale,
      open,
      note: open
        ? i < tier
          ? "エントリーの2週間後にレース（調整に使える）"
          : "エントリーの2週間後にレース・優勝すると次の段へ"
        : "毎月開催（育成B以上の生徒が出られる）",
    });
  }

  // 開催月の早い順。毎月開催（記録会）は最後にまとめる。
  out.sort((a, b) => (a.month === 0 ? 99 : a.month) - (b.month === 0 ? 99 : b.month));
  return out;
}

/** 大会遠征でクラブを空ける日数（地方ブロックより上は1週間）。 */
export function awayDaysOf(comp: Competition): number {
  return SCALE_AWAY_DAYS[comp.scale];
}

/**
 * 年度を進める。
 *   ・記録会の段       … **年度をまたいでも残す**（地域→都道府県→…と積み上げていくもの）
 *   ・予選の勝ち上がり … **年度が変わったら地区予選から**（全国大会がかかった大会は毎年やり直し）
 *   ・参加標準記録     … **年度が変わったら取り直し**（その年に標準タイムを出した選手だけが出られる）
 */
export function ensureSeason(s: Student, year: number): void {
  if (s.season.year === year) return;
  s.season.year = year;
  s.season.clearedStages = s.season.clearedStages.filter(isKirokukaiStage);
  s.season.standards = [];
  s.season.standardEvents = [];
}

/** 記録会の段の記録か（年度をまたいでも残すもの）。 */
export function isKirokukaiStage(key: string): boolean {
  const stage = stageOf(key);
  return KIROKUKAI_LADDER.some((t) => t.key === stage);
}

/**
 * その月に、その選手が出られる大会（記録会は常に選択肢として付く）。
 */
export function eligibleCompetitions(s: Student, month: number, year: number): Competition[] {
  ensureSeason(s, year);
  const stage = lifeStageOf(s.grade);
  const majors = CALENDAR.filter((c) => {
    if (c.month !== month) return false;
    if (!ROUTE_LIFESTAGE[c.route].includes(stage)) return false;
    if (c.requiresPrev && !hasClearedStage(s, c.requiresPrev)) return false;
    if (c.requiresStandard && !s.season.standards.includes(c.requiresStandard)) return false;
    return true;
  });
  return [...majors, ...kirokukaiFor(s, month, year)];
}

/**
 * 大会の id から大会を引く（エントリーを保存しておくのに使う）。
 * 記録会は月ごとに id が変わる（kk_area_5 など）ので、段と月から組み立て直す。
 */
export function competitionById(id: string): Competition | null {
  const major = CALENDAR.find((c) => c.id === id);
  if (major) return major;
  const tier = kirokukaiTierOf(id);
  if (tier == null) return null;
  const month = Number(id.slice(id.lastIndexOf("_") + 1));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? kirokukaiOf(month, tier) : null;
}

/**
 * 主要大会の「出場確認」に並べる、その選手の種目。
 *   勝ち上がりの大会 … 前の段で優勝した種目
 *   標準記録の大会   … その標準タイムを出した種目（出した種目の記録が無い古いデータは得意種目）
 *   入口の大会（地区予選など）… 得意種目
 */
export function confirmEventsFor(s: Student, comp: Competition): RaceEvent[] {
  if (comp.requiresPrev) return clearedEventsOf(s, comp.requiresPrev);
  if (comp.requiresStandard) {
    const evs = eventsOfKeys(s.season.standardEvents, comp.requiresStandard);
    return evs.length > 0 ? evs : [{ ...s.fav }];
  }
  // 地区大会は種目を選べる（→ areaEventsFor）
  if (isAreaMeet(comp)) return areaEventsFor(s);
  return [{ ...s.fav }];
}

/**
 * 地区大会で選べる種目。
 *
 * 【全18種目は出さない】1人18行になると一覧が読めなくなるうえ、
 * 鍛えていない泳法に出しても発揮率（熟練度）が低くて意味が無い。
 * そこで**「まともに泳げるもの」だけ**を並べる：
 *   ・得意泳法の全距離（50〜1500）… 短距離型を長距離で試す、が狙える
 *   ・ほかの泳法は得意距離だけ   … 泳法を変えて試す道も残す
 *
 * 【なぜ距離をぜんぶ出すか】能力とタイムの関係は距離ごとに重みが違う
 *（50mはスピードとスタート、400mは持久力とターン → config の TIME.distanceWeights）。
 * 持久力を伸ばした短距離型は、得意距離より長い距離のほうが速い、ということが起きる。
 * 出せる種目を得意距離に固定していると、それに気づけない。
 */
export function areaEventsFor(s: Student): RaceEvent[] {
  const out: RaceEvent[] = [];
  const seen = new Set<string>();
  const push = (ev: RaceEvent): void => {
    const k = `${ev.stroke}-${ev.distance}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(ev);
  };
  for (const d of STROKE_DISTANCES[s.fav.stroke]) push({ stroke: s.fav.stroke, distance: d });
  for (const st of CORE_STROKES) {
    if (st === s.fav.stroke) continue;
    if (!STROKE_DISTANCES[st].includes(s.fav.distance)) continue;
    push({ stroke: st, distance: s.fav.distance });
  }
  return out;
}

export interface CompReward {
  gems: number;
  popularity: number;
  qualifiedNext: boolean; // 予選ステージを突破した
  newStandards: StandardKey[]; // 新たに突破した参加標準記録
  placementLabel: string;
}

/**
 * 【参加標準記録は全世代で1つ】（2026-09-26 にユーザー指示で統一）
 *
 * 以前は小学生・全中・インターハイ・全国と、学年ごとに別の標準記録があった。
 * いまは**日本選手権の参加標準記録ただ1つ**を、小学生からプロまで同じタイムで判定する。
 * 切れば日本選手権に出られる（→ CALENDAR の gen_nihon）。
 * 古い標準（shogaku など）のキーは、古いセーブの記録を読めるように型にだけ残してある。
 */
const STANDARD_KEYS: StandardKey[] = ["nihonSenshuken"];

/** その選手が突破を判定される標準記録（全世代共通の1つ）。 */
export function standardKeysFor(_s: Student): StandardKey[] {
  return [...STANDARD_KEYS];
}

/** 順位に応じた報酬倍率（自クラブの選手1人ぶん）。 */
function placementMult(e: EntrantOutcome): { mult: number; label: string } {
  const label = placementLabelOf(e);
  if (e.win) return { mult: 1.0, label };
  if (e.finalRank != null && e.finalRank <= 3) return { mult: 0.4, label };
  if (e.finalRank != null) return { mult: 0.15, label };
  return { mult: 0.05, label };
}

/**
 * レース結果から報酬と突破フラグを確定（選手の season を更新）。
 * 同じレースに複数人出したときは、1人ずつこれを通す。
 */
export function resolveCompetition(
  s: Student,
  comp: Competition,
  entrant: EntrantOutcome,
  ev: RaceEvent,
): CompReward {
  const { mult, label } = placementMult(entrant);
  const base = SCALE_REWARD[comp.scale];
  const gems = Math.round(base.gems * mult);
  const popularity = Math.round(base.popularity * mult);

  // 予選ステージの突破（優勝で次へ）
  let qualifiedNext = false;
  // 記録会は「月ごとの大会id」ではなく「段のキー」で覚える（翌月以降も上の段に出られるように）
  const tier = kirokukaiTierOf(comp.id);
  const stageKey = tier != null ? KIROKUKAI_LADDER[tier].key : comp.id;
  // 勝ち上がるのは**その種目**（→ stageEventKey）。同じ段でも種目が違えばもう一度勝つ必要がある
  if (comp.qualifier && entrant.win && !hasClearedStage(s, stageKey, ev)) {
    s.season.clearedStages.push(stageEventKey(stageKey, ev));
    qualifiedNext = true;
  }

  // 標準記録の突破：自己ベストで判定（記録会でも突破しうる＝一般ルートの入口）
  const newStandards: StandardKey[] = [];
  for (const key of standardKeysFor(s)) {
    if (!meetsStandard(key, ev, s.gender, entrant.bestTime)) continue;
    // どの種目で出したかも覚える（標準記録の大会の出場確認に、その種目を並べるため）
    const evKey = stageEventKey(key, ev);
    if (!s.season.standardEvents.includes(evKey)) s.season.standardEvents.push(evKey);
    if (!s.season.standards.includes(key)) {
      s.season.standards.push(key);
      newStandards.push(key);
    }
  }

  return { gems, popularity, qualifiedNext, newStandards, placementLabel: label };
}
