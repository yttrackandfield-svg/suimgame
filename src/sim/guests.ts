import { AMENITY, BATHING, GUESTS, SATISFACTION } from "../config/balance";
import {
  gradeGuestMult,
  gradeOf,
  guestRoomCategory,
  hasGrade,
  hasSaunaNearby,
  isBathRoom,
  laneSlotsOf,
  type Equipment,
  type RoomKind,
} from "./equipment";
import { entriesAtSlot, poolsOf, type Timetable } from "./timetable";

/**
 * 一般客（ビジター）。
 *
 * レッスンが入っていない空きコマは、プール・筋トレルーム・スタジオを
 * 一般に有料開放する。人気度が高いほど多く来て、そのぶん収入になる。
 *
 * **温浴施設（風呂・サウナ・外気浴）はレッスンの有無に関係なく、いつでも開いている。**
 * 選手が練習している時間帯でも街の人が風呂に入りに来る＝賑わいと安定した収入になる。
 *
 * ただし入口から歩いて行けない部屋には辿り着けない。
 * 来たのに使えなかった客は、料金を落とさずに帰る（＝動線の悪さが売上に響く）。
 *
 * 純ロジック（Phaser 非依存）。人が歩く様子は scenes 側が Guest として描く。
 */

export type GuestCategory =
  | "pool"
  | "gym"
  | "studio"
  | "bath"
  | "sauna"
  | "openair"
  // 賑わいスペース（→ config の AMENITY）。使いに来るだけで、練習はしない
  | "cafe"
  | "shop"
  | "lounge"
  | "kids"
  | "vending";

export interface GuestRoom {
  room: Equipment;
  category: GuestCategory;
  /** 入口から道を辿って行けるか。 */
  reachable: boolean;
  /** 1コマに受け入れられる人数。 */
  capacity: number;
  /** 1人あたりの利用料。 */
  fee: number;
}

// ------------------------------------------------------------------ 客の素性（タップして見る用）

const GUEST_FAMILY = ["佐藤", "鈴木", "高橋", "田中", "渡辺", "伊藤", "山本", "中村", "小林", "加藤", "吉田", "山田"];
const GUEST_GIVEN = ["健一", "美和", "浩二", "由紀", "隆", "さおり", "誠", "千春", "和彦", "真理", "亮", "久美"];
const GUEST_JOB = ["会社員", "自営業", "主婦", "教員", "看護師", "定年後", "学生", "パート"];
const GUEST_PURPOSE: Record<GuestCategory, string[]> = {
  pool: ["健康のためにひと泳ぎ", "腰にやさしい運動がしたい", "昔やっていた水泳を再開", "子どもの送り迎えのついでに"],
  gym: ["体を絞りたい", "仕事帰りの筋トレ", "リハビリを兼ねて", "体力づくり"],
  studio: ["体を動かしたくて", "友だちに誘われて", "ストレッチ目当て", "教室の雰囲気が好き"],
  bath: ["広い湯船でのんびりしたい", "仕事帰りにひとっ風呂", "家の風呂より気持ちいい", "湯上がりの一杯が楽しみ"],
  sauna: ["サウナで汗を流したい", "週末のととのい習慣", "熱いのが好きで通っている", "サウナ仲間に誘われて"],
  openair: ["外気浴でととのいたい", "デッキチェアで昼寝", "風にあたって休みたい", "サウナのあとの定位置"],
  cafe: ["お茶を飲みに", "泳いだあとの一杯", "子どもの練習を待っている", "友だちとおしゃべり"],
  shop: ["ゴーグルを買いに", "水着を見に来た", "帰りに軽食を", "子どもの帽子を買いに"],
  lounge: ["ソファでひと休み", "練習が終わるのを待っている", "少し座って休みたい", "涼みに来た"],
  kids: ["子どもを遊ばせに", "下の子を連れて", "きょうだいの付き添い", "遊び場めあて"],
  vending: ["のどが渇いて", "水分補給に", "ちょっと立ち寄り", "帰りがけに1本"],
};

export const GUEST_CATEGORY_LABEL: Record<GuestCategory, string> = {
  pool: "プール",
  gym: "筋トレルーム",
  studio: "スタジオ",
  bath: "風呂",
  sauna: "サウナ",
  openair: "外気浴",
  cafe: "カフェ",
  shop: "売店",
  lounge: "休憩ラウンジ",
  kids: "キッズコーナー",
  vending: "自販機コーナー",
};

export interface GuestProfile {
  name: string;
  age: number;
  job: string;
  purpose: string;
}

/**
 * 客1人ぶんの素性。
 *
 * ゲームの進行には一切影響しない**見るだけの情報**なので、乱数を消費せず、
 * 種（客ごとの通し番号）から毎回同じ内容を作る。
 * こうしておけば、同じ客をもう一度タップしても名前が変わらない。
 */
export function guestProfileOf(seed: number, category: GuestCategory): GuestProfile {
  const h = (n: number): number => {
    let x = (seed * 2654435761 + n * 40503) >>> 0;
    x ^= x >>> 13;
    x = (x * 1274126177) >>> 0;
    return x >>> 0;
  };
  const purposes = GUEST_PURPOSE[category];
  return {
    name: `${GUEST_FAMILY[h(1) % GUEST_FAMILY.length]} ${GUEST_GIVEN[h(2) % GUEST_GIVEN.length]}`,
    age: 18 + (h(3) % 52),
    job: GUEST_JOB[h(4) % GUEST_JOB.length],
    purpose: purposes[h(5) % purposes.length],
  };
}

/** その時刻に一般開放できる部屋の一覧。 */
export function openRoomsAt(
  equipment: readonly Equipment[],
  timetable: Timetable,
  slot: number,
  reachable: (roomId: number) => boolean,
): GuestRoom[] {
  const entries = entriesAtSlot(timetable, slot);
  const busyPools = new Set(entries.map((e) => e.poolId));
  // レッスン中は、筋トレルーム・スタジオを自クラブの選手も使っている＝一般客の枠が減る
  const lessonRunning = entries.length > 0;
  const out: GuestRoom[] = [];
  for (const e of equipment) {
    if (e.gx == null || e.gy == null) continue;
    const category = guestRoomCategory(e.kind);
    if (!category) continue;
    // レッスン中のプールは一般開放しない（選手が使っている）
    if (category === "pool" && busyPools.has(e.id)) continue;
    const base = capacityOfRoom(e.kind, category, e);
    // 温浴施設はレッスン中も開いている（選手と一般客が一緒に使う）ので枠を削らない
    const shared = category === "pool" || isBathRoom(e.kind) || !lessonRunning;
    const capacity = shared ? base : Math.max(1, Math.round(base * GUESTS.classCrowdRatio));
    out.push({
      room: e,
      category,
      reachable: reachable(e.id),
      capacity,
      fee: feeOfRoom(e, category, equipment),
    });
  }
  return out;
}

function capacityOfRoom(kind: RoomKind, category: GuestCategory, room: Equipment): number {
  if (category === "pool") {
    // プールはレーン数ぶん入る（練習枠と同じ考え方だが、一般客はもう少しゆったり）
    return Math.max(1, Math.round(laneSlotsOf(kind) * 0.6));
  }
  // 温浴施設はグレードを持たないので、部屋ごとの定員はそのまま（config の guestCap）
  const bath = BATHING.rooms[kind];
  if (bath) return Math.max(1, bath.guestCap);
  // 賑わいスペースもグレードなし。部屋ごとの受け入れ人数は config の AMENITY
  const amenity = AMENITY.guest[kind];
  if (amenity) return Math.max(1, amenity.cap);
  // 筋トレルーム・スタジオは**部屋のグレード**で入れる人数が変わる。
  // 大きくすると自クラブの選手も一般客も多く受け入れられる＝投資が売上に直結する。
  const base = GUESTS.capacity[category] ?? 6;
  return Math.max(1, Math.round(base * gradeGuestMult(gradeOf(room))));
}

/**
 * 1人あたりの利用料。
 * 温浴施設は BATHING.rooms の guestFee。
 * サウナの近くに建てた外気浴は「ととのい」目当ての客が増え、少し高く取れる。
 */
function feeOfRoom(room: Equipment, category: GuestCategory, all: readonly Equipment[]): number {
  const bath = BATHING.rooms[room.kind];
  if (bath) {
    const bonus = hasSaunaNearby(room, all) ? BATHING.synergy.guestFeeBonus : 0;
    return bath.guestFee + bonus;
  }
  const amenity = AMENITY.guest[room.kind];
  if (amenity) return amenity.fee;
  return GUESTS.fee[category] ?? 0;
}

/** 営業時間内か（この間だけ一般客が来る）。 */
export function isBusinessHours(minute: number): boolean {
  return minute >= GUESTS.openMinute && minute < GUESTS.closeMinute;
}

/**
 * 1ゲーム分あたりの来客数。
 * 「1コマ・1部屋あたり basePerSlot 人 × 集客倍率」を、コマの長さで割って分あたりにする。
 */
export function arrivalPerMinute(rooms: readonly GuestRoom[], enrollMult: number, slotMinutes: number): number {
  if (rooms.length === 0 || slotMinutes <= 0) return 0;
  const perSlot = GUESTS.basePerSlot * rooms.length * Math.max(0.2, enrollMult);
  return perSlot / slotMinutes;
}

export interface GuestArrival {
  roomId: number;
  category: GuestCategory;
  /** 実際に落としたお金（辿り着けなければ 0）。 */
  paid: number;
  /** 道が繋がっておらず、使えずに帰ったか。 */
  turnedAway: boolean;
  /** 混雑していたか（満足度が下がる）。 */
  crowded: boolean;
  /** その部屋のグレード（1=小 2=中 3=大）。良い設備ほど満足度が高い。 */
  grade: number;
  /** ゆっくりできる部屋（風呂・サウナ・外気浴）か。 */
  relaxing: boolean;
  /**
   * 満員だったので**扉の前に並んだ**（まだ入っていない・料金もまだ）。
   * 席が空けば入り（→ GameState.takeGuestQueueEvents の admitted）、
   * 待ちくたびれたら不満を持って帰る（gaveUp）。
   */
  queued?: boolean;
  /** 並んだ客の番号（画面の客と、あとで届く「入れた／帰った」を結びつける）。 */
  queueId?: number;
  /**
   * 満員だったので、来なかったことにする客（2026-10-09 に混雑の仕組みを廃止）。
   * 並ばない・怒らない・数えない。画面にも出さない。
   */
  skip?: boolean;
}

/**
 * 来客を1人ぶん決める。
 * 行き先は「行ける部屋」を優先して選び、行ける部屋が1つも無ければ
 * 適当な部屋を目指して来て、辿り着けずに帰る（プレイヤーに問題が見える）。
 */
/**
 * 【大きい部屋ほど人が来る】部屋1つが呼び込む客の重み（小＝1）。
 *
 * 以前は来客数が「開いている部屋の数」だけで決まっていたので、
 * グレードを上げて受け入れ枠が増えても、来る人数は小のままで賑わいが変わらなかった。
 * グレードを持つ部屋（筋トレルーム・スタジオ）は、受け入れ枠と同じ倍率で客を呼ぶ。
 */
export function guestRoomWeight(r: GuestRoom): number {
  return hasGrade(r.room.kind) ? gradeGuestMult(gradeOf(r.room)) : 1;
}

/**
 * 行列から届く知らせ（画面はこれを見て、並んでいる客を部屋へ入れる／怒って帰らせる）。
 *   admitted … 席が空いて入れた（料金を払った）
 *   gaveUp   … 待ちくたびれた・部屋が閉じた・閉館で帰った（waited があれば待ちくたびれ）
 */
export interface GuestQueueEvent {
  kind: "admitted" | "gaveUp";
  queueId: number;
  roomId: number;
  paid?: number;
  /** 待ったゲーム分（待ちくたびれて帰ったときだけ）。 */
  waited?: number;
}

/** 同じ使いみちの部屋か（プールはどのプールでも同じ。ほかは同じ種類の部屋）。 */
function sameUse(a: GuestRoom, b: GuestRoom): boolean {
  if (a.category === "pool" || b.category === "pool") return a.category === b.category;
  return a.room.kind === b.room.kind;
}

/** 部屋どうしのおおよその距離（マス。左上の角どうしで測る）。 */
function roomDistance(a: Equipment, b: Equipment): number {
  return Math.abs((a.gx ?? 0) - (b.gx ?? 0)) + Math.abs((a.gy ?? 0) - (b.gy ?? 0));
}

export function pickArrival(
  rooms: readonly GuestRoom[],
  occupancy: (roomId: number) => number,
  rand: () => number,
  /** その部屋の前に並んでいる人数（無ければ 0）。 */
  queueLen: (roomId: number) => number = () => 0,
): GuestArrival | null {
  if (rooms.length === 0) return null;
  const usable = rooms.filter((r) => r.reachable);
  const pool = usable.length > 0 ? usable : rooms;
  // 大きい部屋ほど選ばれやすい（→ guestRoomWeight）。乱数は1回だけ引く
  const total = pool.reduce((a, r) => a + guestRoomWeight(r), 0);
  let pick = rand() * total;
  let target = pool[pool.length - 1];
  for (const r of pool) {
    pick -= guestRoomWeight(r);
    if (pick < 0) {
      target = r;
      break;
    }
  }
  /**
   * 【同じ設備が近くにあれば空いているほうへ】
   * 抽選で決まった部屋が混んでいても、近くに同じ設備があれば**より空いているほう**へ行く。
   * 人は隣が空いているのに行列には並ばない。混み具合は「(使っている人＋並んでいる人) ÷ 定員」で比べ、
   * 同じなら抽選で決まった部屋のまま（近いほうを優先）。
   */
  if (target.reachable) {
    const load = (r: GuestRoom): number => (occupancy(r.room.id) + queueLen(r.room.id)) / Math.max(1, r.capacity);
    let best = target;
    let bestLoad = load(target);
    for (const r of pool) {
      if (r === target || !r.reachable || !sameUse(r, target)) continue;
      if (roomDistance(r.room, target.room) > GUESTS.spreadDistance) continue;
      const l = load(r);
      if (l < bestLoad - 1e-9) {
        best = r;
        bestLoad = l;
      }
    }
    target = best;
  }
  const grade = gradeOf(target.room);
  const relaxing = isBathRoom(target.room.kind);
  const base = { roomId: target.room.id, category: target.category, grade, relaxing };
  if (!target.reachable) {
    return { ...base, paid: 0, turnedAway: true, crowded: false };
  }
  /**
   * 【混雑の仕組みは廃止】（2026-10-09 ユーザー指示）
   * 以前は満員だと行列に並び、待ちくたびれたら怒って帰り、
   * 「混雑で使えなかった人」として数えて人気度を下げていた。
   * いまは**満員なら最初から来なかった**ことにする（不満も人気度の低下も無い）。
   * 定員は来場の上限としてだけ働く（設備を増やせばそのぶん客と収入が増える）。
   */
  if (occupancy(target.room.id) >= target.capacity) {
    return { ...base, paid: 0, turnedAway: false, crowded: false, skip: true };
  }
  return { ...base, paid: target.fee, turnedAway: false, crowded: false };
}

/** その部屋の前に並べる人数（これ以上の行列を見た客は並ばずに帰る）。 */
export function queueLimitOf(r: GuestRoom): number {
  return Math.max(GUESTS.queueMin, Math.round(r.capacity * GUESTS.queuePerCapacity));
}

/**
 * 並んでいる客が、このあいだに**待ちくたびれて帰る**確率。
 *
 * 待てば待つほど帰りやすい（最初の数分はほとんど帰らない）。
 *   累積で、queuePatience 分待つと約4割、その倍待つと約9割が帰っている
 *  （帰る勢い ∝ 待った時間 → 累積 1 - exp(-w²/2P²)）。
 * queueMaxWait を超えたら必ず帰る。
 */
export function queueGiveUpChance(waitedMin: number, minutes: number): number {
  if (waitedMin >= GUESTS.queueMaxWait) return 1;
  const p = GUESTS.queuePatience;
  const hazard = Math.max(0, waitedMin) / (p * p);
  return 1 - Math.exp(-hazard * Math.max(0, minutes));
}

/** その月の一般客の成績（月次レポートに出す）。 */
export interface GuestMonthly {
  served: number;
  /** 入れずに帰った客（満員＋歩いて行けない、の合計）。 */
  turnedAway: number;
  /** そのうち、歩いて行けずに帰った客（人気度を下げるのはこちらだけ → guestPopularityDelta）。 */
  lockedOut: number;
  income: number;
  crowded: number;
  /** 満足した客の口コミで上がった人気度（今月ぶん）。 */
  wordOfMouth: number;
  /** 満足して帰った客が落とした貢献値の合計（画面の `+9` の総和）。 */
  contribution: number;
  /** 満足度の合計と人数（平均を出すため。月次レポートに★で出す）。 */
  moodSum: number;
  moodCount: number;
}

export function emptyGuestMonthly(): GuestMonthly {
  return { served: 0, turnedAway: 0, lockedOut: 0, income: 0, crowded: 0, wordOfMouth: 0, contribution: 0, moodSum: 0, moodCount: 0 };
}

/** 今月の一般客の平均満足度（0-100）。客が1人も来ていなければ null。 */
export function guestAverageMood(m: GuestMonthly): number | null {
  return m.moodCount > 0 ? m.moodSum / m.moodCount : null;
}

/**
 * 一般客の満足度が人気度に与える影響（月次）。
 *
 * 満足して帰った客は口コミで人気を上げ、歩いて行けずに帰った客はそのぶん下げる。
 * 満員で入れなかった客は下げない（満員は人気の裏返し → GUESTS.turnedAwayPopularity）。
 * 1ヶ月で動く幅には上限を設けてある（人気度が一気に0まで落ちると立て直せないため）。
 */
export function guestPopularityDelta(m: GuestMonthly): number {
  // 【満足度が高い客が増えるほど人気が伸びる】
  // 人数ではなく、1人ずつの満足度から出した貢献値（画面の `+9`）の合計で決まる。
  // 貢献値が付かない客（満足度が低い客）は、人数に入っていても人気を押し上げない。
  const good = m.contribution * SATISFACTION.popularityPerContribution;
  const bad = m.lockedOut * GUESTS.turnedAwayPopularity; // 負の値（歩いて行けずに帰った客だけ）
  const swing = good + bad;
  const cap = GUESTS.popularitySwingMax;
  return Math.round(Math.max(-cap, Math.min(cap, swing)));
}

/** 空きコマをどれだけ活かせているか（0-1）。UIの案内に使う。 */
export function utilization(m: GuestMonthly): number {
  const total = m.served + m.turnedAway;
  return total === 0 ? 0 : m.served / total;
}

/** 見込み月収（プレイヤーが設備投資を判断するための目安）。 */
export function estimatedMonthlyIncome(
  equipment: readonly Equipment[],
  timetable: Timetable,
  slotCount: number,
  reachable: (roomId: number) => boolean,
  enrollMult: number,
): number {
  let sum = 0;
  for (let slot = 0; slot < slotCount; slot++) {
    const rooms = openRoomsAt(equipment, timetable, slot, reachable);
    for (const r of rooms) {
      if (!r.reachable) continue;
      const guests = Math.min(r.capacity, GUESTS.basePerSlot * Math.max(0.2, enrollMult));
      sum += guests * r.fee;
    }
  }
  // 1ヶ月＝4週ぶんの営業日として概算する
  return Math.round(sum * 4);
}

/** 一般開放できる部屋を持っているか（持っていなければ案内を出す）。 */
export function hasGuestRooms(equipment: readonly Equipment[]): boolean {
  return equipment.some((e) => e.gx != null && guestRoomCategory(e.kind) !== null) || poolsOf(equipment).length > 0;
}
