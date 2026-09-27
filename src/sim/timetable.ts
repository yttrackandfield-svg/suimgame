import { TIMETABLE } from "../config/balance";
import type { ClassId } from "./classes";
import { isSchoolClass } from "./classes";
import { equipmentDef, isPool, isTrainingRoom, isVenue, venueSlotsOf, type Equipment } from "./equipment";

/**
 * 時間割：どのプールの、どのコマで、どのクラスを回すか。
 *
 * プールが1つしかないうちは従来どおりの1本道（TIMETABLE.defaultPlan）。
 * 2つ目以降を建てると、同じ時間に別のクラスを並行して回せるようになる。
 *
 * 幼児・学童（スクール）の定員は「開講したコマ数 × そのプールの練習枠」で決まる。
 * コマを増やすほど受け入れられるが、コマには担当コーチが要る＝給料が増える。
 */

export interface TimetableEntry {
  /** プールの Equipment.id。 */
  poolId: number;
  /** TIMETABLE.slots の並び順のインデックス。 */
  slot: number;
  classId: ClassId;
  /** 担当コーチの id（null＝未配置＝開講できない）。 */
  coachId: number | null;
}

export type Timetable = TimetableEntry[];

export interface SlotDef {
  id: number;
  start: number;
  end: number;
  label: string;
}

export const SLOTS: readonly SlotDef[] = TIMETABLE.slots;

/** その時刻が入るコマ（無ければ -1）。 */
export function slotAtMinute(minute: number): number {
  for (let i = 0; i < SLOTS.length; i++) {
    if (minute >= SLOTS[i].start && minute < SLOTS[i].end) return i;
  }
  return -1;
}

export function slotDef(slot: number): SlotDef | null {
  return SLOTS[slot] ?? null;
}

export function slotLabel(slot: number): string {
  return SLOTS[slot]?.label ?? "--";
}

/** 保有しているプール（配置済みのみ）。 */
export function poolsOf(equipment: readonly Equipment[]): Equipment[] {
  return equipment.filter((e) => isPool(e.kind) && e.gx != null && e.gy != null);
}

/**
 * 時間割に並べられる部屋（配置済み）。プールが先、そのあと練習の部屋
 *（医科学センター・低酸素トレーニングルーム → equipment.isTrainingRoom）。
 */
export function venuesOf(equipment: readonly Equipment[]): Equipment[] {
  const placed = equipment.filter((e) => isVenue(e.kind) && e.gx != null && e.gy != null);
  return [...placed.filter((e) => isPool(e.kind)), ...placed.filter((e) => isTrainingRoom(e.kind))];
}

/** 1つ目のプールに、従来どおりの時間割を入れた初期値。 */
export function defaultTimetable(equipment: readonly Equipment[]): Timetable {
  const pools = poolsOf(equipment);
  if (pools.length === 0) return [];
  const main = pools[0];
  const out: Timetable = [];
  TIMETABLE.defaultPlan.forEach((classId, slot) => {
    if (!classId) return;
    if (slot >= SLOTS.length) return;
    out.push({ poolId: main.id, slot, classId, coachId: null });
  });
  return out;
}

/** そのプール・そのコマの割り当て。 */
export function entryAt(tt: Timetable, poolId: number, slot: number): TimetableEntry | null {
  return tt.find((e) => e.poolId === poolId && e.slot === slot) ?? null;
}

/** そのコマに走っている全ての割り当て。 */
export function entriesAtSlot(tt: Timetable, slot: number): TimetableEntry[] {
  return tt.filter((e) => e.slot === slot);
}

export interface TimetableContext {
  equipment: readonly Equipment[];
  /** そのプールに人が辿り着けるか（歩いて行けるか）。 */
  reachable: (poolId: number) => boolean;
  /** そのコーチが在籍しているか。 */
  hasCoach: (coachId: number) => boolean;
  /**
   * 同じ時間に成り立たない割り当て（コマ → 理由）。
   * コーチの掛け持ち・育成クラスの重複が入る。2つ目以降は開講できない。
   */
  conflicts?: ReadonlyMap<string, TimetableConflict>;
}

export interface EntryStatus {
  ok: boolean;
  reason?: string;
}

/**
 * 同じ時間に成り立たない割り当てを探す（2つ目以降を「開講できない」に落とす）。
 *
 * ① 同じクラスの重複 … **育成B以上は**同じ時間に2つ入れられない（体は1つなので）。
 *    別のクラスどうしなら、別のプールで同じ時間に並行して練習してよい。
 *    「プール①で育成B、プール②で選手／プロ／育成A」は成立する。
 *
 *    【スクール（幼児・学童）だけは重ねられる】（2026-09-19）
 *    スクールは在籍100人の習い事で、1コマに入れるのは「そのプールの練習枠」まで。
 *    同じ時間に2つのプールで開ければ、そのぶん**受け入れ人数が増える**
 *    （幼児を朝いちにプール①とプール②で同時開講 ＝ 定員120人）。
 *    誰がどちらに入るかは sim/lineup.ts が**重複なく**振り分けるので、
 *    同じ子が2箇所に出ることはない。育成以上は全員で同じ練習をするため、
 *    2つに分けても意味が無い（同じ顔ぶれが両方に入るだけ）ので今までどおり禁止。
 *
 * ② コーチの掛け持ち … コーチは体が1つ。同じ時間に2つのプールは見られない。
 *    スクールを2つ並べるなら、**コーチも2人**要る。
 *
 * 割り当てるときには state 側で弾いているが、古いセーブや解雇のあとに残ることがあるので、
 * ここでも見つけて落とす。
 */
export interface TimetableConflict {
  /** class＝クラスの重複（そのコマ自体が成り立たない）／coach＝担当の掛け持ち。 */
  kind: "class" | "coach";
  reason: string;
}

export function timetableConflicts(tt: Timetable): Map<string, TimetableConflict> {
  const out = new Map<string, TimetableConflict>();
  const coachSeen = new Set<string>(); // `${slot}:${coachId}`
  const classSeen = new Set<string>(); // `${slot}:${classId}`
  for (const e of tt) {
    const key = `${e.poolId}:${e.slot}`;
    const ck = `${e.slot}:${e.classId}`;
    // スクール（幼児・学童）は同じ時間に何プールでも開ける（受け入れ人数がそのぶん増える）
    if (!isSchoolClass(e.classId)) {
      if (classSeen.has(ck)) {
        out.set(key, { kind: "class", reason: "同じクラスは同じ時間に2つ入れられない" });
      } else {
        classSeen.add(ck);
      }
    }
    if (e.coachId != null) {
      const k = `${e.slot}:${e.coachId}`;
      if (coachSeen.has(k)) {
        if (!out.has(key)) {
          out.set(key, { kind: "coach", reason: "そのコーチは同じ時間に別のプールを担当している" });
        }
      } else {
        coachSeen.add(k);
      }
    }
  }
  return out;
}

/**
 * そのコマが実際に開講できているか。
 * プールが撤去された／歩いて行けない／担当コーチがいない・掛け持ちしている、
 * のいずれでも開講できない。
 */
export function entryStatus(e: TimetableEntry, ctx: TimetableContext): EntryStatus {
  const pool = ctx.equipment.find((p) => p.id === e.poolId);
  if (!pool || !isVenue(pool.kind)) return { ok: false, reason: "部屋が無い" };
  if (pool.gx == null) return { ok: false, reason: "部屋が未配置" };
  // 練習の部屋は育成B以上だけ（スクールは全体練習なのでプールで泳ぐ）
  if (isTrainingRoom(pool.kind) && isSchoolClass(e.classId)) return { ok: false, reason: "スクールは使えない（育成B以上）" };
  if (!ctx.reachable(pool.id)) return { ok: false, reason: "入口から歩いて行けない" };
  const clash = ctx.conflicts?.get(`${e.poolId}:${e.slot}`);
  if (clash) return { ok: false, reason: clash.reason };
  if (TIMETABLE.requireCoach) {
    if (e.coachId == null) return { ok: false, reason: "担当コーチが未配置" };
    if (!ctx.hasCoach(e.coachId)) return { ok: false, reason: "担当コーチがいない" };
  }
  return { ok: true };
}

/** 実際に開講できているコマだけ。 */
export function activeEntries(tt: Timetable, ctx: TimetableContext): TimetableEntry[] {
  return tt.filter((e) => entryStatus(e, ctx).ok);
}

/** 今この瞬間に走っているレッスン（複数プールなら複数返る）。 */
export function runningAt(tt: Timetable, minute: number, ctx: TimetableContext): TimetableEntry[] {
  const slot = slotAtMinute(minute);
  if (slot < 0) return [];
  return entriesAtSlot(tt, slot).filter((e) => entryStatus(e, ctx).ok);
}

/**
 * スクール（幼児・学童）の定員。
 *   Σ（開講できているコマの、そのプールの練習枠）
 * コマを増やせば増えるが、コマにはコーチが要る。
 */
export function schoolCapacity(tt: Timetable, classId: ClassId, ctx: TimetableContext): number {
  if (!isSchoolClass(classId)) return 0;
  let sum = 0;
  for (const e of tt) {
    if (e.classId !== classId) continue;
    if (!entryStatus(e, ctx).ok) continue;
    const pool = ctx.equipment.find((p) => p.id === e.poolId);
    if (!pool) continue;
    sum += venueSlotsOf(pool.kind);
  }
  return sum;
}

/** そのクラスが1コマで受け入れられる最大（＝いちばん大きいプールの枠。表示用）。 */
export function largestPoolSlots(equipment: readonly Equipment[]): number {
  let best = 0;
  for (const p of poolsOf(equipment)) best = Math.max(best, venueSlotsOf(p.kind));
  return best;
}

/** 育成B以上が、そのコマに使える枠（1コマ＝そのプールの練習枠）。 */
export function trainingSlotsAt(tt: Timetable, slot: number, ctx: TimetableContext): number {
  let sum = 0;
  for (const e of entriesAtSlot(tt, slot)) {
    if (!entryStatus(e, ctx).ok) continue;
    const pool = ctx.equipment.find((p) => p.id === e.poolId);
    if (pool) sum += venueSlotsOf(pool.kind);
  }
  return sum;
}

// 「だれが、どのコマの、どのプールで練習するか」は sim/lineup.ts が決める
// （1人1コマの割り当てと、重複しない保証はそちら）。
export {
  assignRoster,
  entryKey,
  groupByClass,
  membersOfClass,
  poolLineup,
  splitAcrossPools,
  type LessonGroup,
  type PoolLineup,
} from "./lineup";

/** 空きコマ（レッスンが入っていない＝一般客が使える）プールの一覧。 */
export function freePoolsAt(tt: Timetable, slot: number, equipment: readonly Equipment[]): Equipment[] {
  const busy = new Set(entriesAtSlot(tt, slot).map((e) => e.poolId));
  return poolsOf(equipment).filter((p) => !busy.has(p.id));
}

/** 同じコマに同じコーチを二重に入れていないか。 */
export function coachConflict(tt: Timetable, slot: number, coachId: number, exceptPoolId?: number): boolean {
  return entriesAtSlot(tt, slot).some(
    (e) => e.coachId === coachId && e.poolId !== exceptPoolId,
  );
}

/** 割り当てを設定（classId が null なら削除）。 */
/**
 * 割り当てを設定（classId が null なら削除）。
 *
 * **並び順は「作った順」で、書き換えても動かさないこと。**
 * この並びが「どのコマから先に生徒を入れるか」の優先順位になっている
 * （→ sim/lineup の assignRoster）。担当コーチを変えただけで末尾へ動かすと、
 * そのコマの生徒がごっそり入れ替わってしまう。
 */
export function setEntry(
  tt: Timetable,
  poolId: number,
  slot: number,
  classId: ClassId | null,
  coachId: number | null,
): Timetable {
  const i = tt.findIndex((e) => e.poolId === poolId && e.slot === slot);
  if (!classId) return i < 0 ? [...tt] : [...tt.slice(0, i), ...tt.slice(i + 1)];
  const entry: TimetableEntry = { poolId, slot, classId, coachId };
  if (i < 0) return [...tt, entry]; // 新しいコマは末尾＝いちばん後回し
  const out = [...tt];
  out[i] = entry; // 既にあるコマは、その場で書き換える（順番を変えない）
  return out;
}

/** 存在しないプール・コーチを指す割り当てを掃除する（撤去・解雇のあとに呼ぶ）。 */
export function pruneTimetable(tt: Timetable, ctx: TimetableContext): Timetable {
  return tt
    .filter((e) => ctx.equipment.some((p) => p.id === e.poolId && isVenue(p.kind)))
    .map((e) => (e.coachId != null && !ctx.hasCoach(e.coachId) ? { ...e, coachId: null } : e));
}

/** 表示用：そのプールの呼び名（「6レーンプール①」など）。 */
export function poolLabel(equipment: readonly Equipment[], poolId: number): string {
  const venue = venuesOf(equipment).find((p) => p.id === poolId);
  // 練習の部屋は種類ごとに番号を振る（医科学センター①、低酸素トレーニングルーム①）
  const pools = venue && isTrainingRoom(venue.kind)
    ? venuesOf(equipment).filter((p) => p.kind === venue.kind)
    : poolsOf(equipment);
  const i = pools.findIndex((p) => p.id === poolId);
  const pool = pools[i];
  if (!pool) return "プール";
  const mark = ["①", "②", "③", "④", "⑤"][i] ?? `${i + 1}`;
  return `${equipmentDef(pool.kind).label}${mark}`;
}
