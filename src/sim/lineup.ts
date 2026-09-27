import { isSchoolClass, type ClassId } from "./classes";
import type { Student } from "./student";
import { venueSlotsOf, type Equipment } from "./equipment";
import type { TimetableEntry } from "./timetable";

/**
 * 「だれが、どのコマの、どのプールで練習するか」を決める唯一の場所。
 *
 * 1コマの定員 ＝ そのプールの練習枠（1レーン10人 × レーン数）。
 * コマを増やす／プールを増やすと定員が増えるが、**クラスの性格で配り方が違う**。
 *
 * 【スクール（幼児・学童）】人数が多い習い事。**1人が練習するのは1コマだけ。**
 *   コマは**時間割に作った順**に埋め、埋まりきらないコマは誰も使わない。
 *     例）学童50人・コマ2つ → 1コマ目に50人、2コマ目は誰も来ない
 *     例）学童70人・コマ2つ → 1コマ目に60人、2コマ目に残り10人
 *   作った順にしているのは、**あとからコマを足しても既存のコマの顔ぶれが変わらない**ようにするため。
 *   時間順に並べ直すと、早い時間のコマを足したとたんに全員がそちらへ移ってしまう。
 *   **同じ時間に何本のプールでも開ける**（2026-09-19）。時間がかぶっても、
 *   詰め方は上のまま（作った順に、埋まりきるまで）なので、同じ子が2箇所に出ることはない。
 *     例）幼児70人・同じ時間にプール①（60人）とプール②（60人）→ ①に60人、②に10人
 *
 * 【育成B〜プロ】少人数の特別クラス。**コマを入れたぶんだけ、全員で何度でも練習できる。**
 *   ただし同じ時間に2つのプールへ分かれることはない（時間割の側で「同じクラスは同じ時間に1つ」）。
 *   全員で同じ練習をするので、分けても同じ顔ぶれが両方に入るだけになるため。
 *   別のクラスどうしなら、別のプールで同じ時間に並行して練習してよい。
 *   練習を増やせば伸びるが、そのぶん体力を使って疲れが溜まる（→ sim/student の applyTraining）。
 *
 * 【保証】ここは「同じ時間に同じ人が2箇所に出ない」を**データの段階で**保証する。
 * 万が一、同じ人が2つのクラスの名簿に入っていたり、同じ名簿に2回入っていても、
 * 画面には1人しか出ないし、その回の練習も1回しかかからない。
 */

/** コマの識別子（プール×時間）。 */
export function entryKey(e: { poolId: number; slot: number }): string {
  return `${e.poolId}:${e.slot}`;
}

export interface PoolLineup {
  classId: ClassId;
  pool: Equipment;
  slot: number;
  /** このコマで練習する選手。空なら、そのコマは誰も使わない。 */
  members: Student[];
}

export interface LineupOptions {
  /** そのプールに人が辿り着けるか（歩いて行けるか）。 */
  canUse: (poolId: number) => boolean;
  /**
   * その日その回に実際に来る人か（休養中の選手は来ない）。
   * **割り当て（どのコマの人か）には効かず、その回に姿を見せるかどうかだけに効く。**
   * 休んだ人の枠を他の人が使うことはない＝コマの顔ぶれは日によって入れ替わらない。
   */
  attends?: (s: Student) => boolean;
}

/** 1クラスぶんのレッスン（同じ時間に複数のプールを使うことがある）。 */
export interface LessonGroup {
  classId: ClassId;
  /** そのクラスが使うプール（時間割に出てくる順・重複なし）。 */
  pools: Equipment[];
}

/**
 * 走っているコマを「クラスごと」にまとめる。
 * ここでまとめておかないと、同じクラスを2回処理して
 * 「同じ選手が両方のプールに出てくる」「練習が2回かかる」ことになる。
 */
export function groupByClass(
  entries: readonly TimetableEntry[],
  equipment: readonly Equipment[],
): LessonGroup[] {
  const out: LessonGroup[] = [];
  for (const e of entries) {
    const pool = equipment.find((x) => x.id === e.poolId);
    if (!pool) continue;
    const found = out.find((g) => g.classId === e.classId);
    if (!found) out.push({ classId: e.classId, pools: [pool] });
    else if (!found.pools.some((p) => p.id === pool.id)) found.pools.push(pool);
  }
  return out;
}

/**
 * 在籍者を、コマの並び順に「そのプールの練習枠」ぶんずつ詰める。
 * 先に来たコマから埋まり、埋まりきらないコマは空のままになる。
 */
export function splitAcrossPools<T>(members: readonly T[], pools: readonly Equipment[]): T[][] {
  const out: T[][] = [];
  let taken = 0;
  for (const p of pools) {
    const group = members.slice(taken, taken + venueSlotsOf(p.kind));
    taken += group.length;
    out.push(group);
  }
  return out;
}

/**
 * 開講できている全てのコマに、在籍者を配る（週の割り当て表）。
 *
 * クラスごとに、コマを**作った順**に見て、先頭から練習枠ぶんずつ詰める。
 * 1人はかならず1コマ。あふれた選手はどのコマにも入らない（＝定員オーバー）。
 *
 * 戻り値のキーは entryKey（プール:コマ）。
 */
export function assignRoster(
  activeEntries: readonly TimetableEntry[],
  equipment: readonly Equipment[],
  rosterOf: (classId: ClassId) => readonly Student[],
  opts: LineupOptions,
): Map<string, Student[]> {
  const out = new Map<string, Student[]>();
  const placed = new Set<number>(); // すでに割り当てた選手（クラスをまたいでも1人1回）

  // 使えるプールに割り当てられたコマだけが対象
  const usable = activeEntries.filter((e) => opts.canUse(e.poolId));

  // クラスごとにまとめる（並びは時間割の登録順＝作った順のまま）
  const byClass = new Map<ClassId, TimetableEntry[]>();
  for (const e of usable) {
    const list = byClass.get(e.classId);
    if (list) list.push(e);
    else byClass.set(e.classId, [e]);
  }

  for (const [classId, entries] of byClass) {
    // 【並べ替えない】entries は時間割に登録した順（＝作った順）のまま使う。
    //
    // 時間やプール番号で並べ直すと、**あとから足したコマが先頭に入り込んで**
    // 既にあるコマの生徒がごっそり移動してしまう
    //（「別のプールにコマを増やしたら、今までいた子がそっちへ移った」）。
    // 作った順にしておけば、新しいコマは必ず最後に回るので、
    // 既存のコマの顔ぶれは変わらず、あふれていた子だけが新しいコマに入る。

    // 割り当ては在籍者ぜんいんで決める（休養で日々入れ替わらないように）
    const roster: Student[] = [];
    for (const s of rosterOf(classId)) {
      if (placed.has(s.id)) continue; // 二重に割り当てない
      placed.add(s.id);
      roster.push(s);
    }

    if (isSchoolClass(classId)) {
      // スクール（幼児・学童）＝人数が多い。1人は1コマだけ。前のコマから順に埋める。
      let taken = 0;
      for (const e of entries) {
        const pool = equipment.find((p) => p.id === e.poolId);
        const capacity = pool ? venueSlotsOf(pool.kind) : 0;
        out.set(entryKey(e), roster.slice(taken, taken + capacity));
        taken = Math.min(roster.length, taken + capacity);
      }
    } else {
      // 育成〜プロ＝少人数の特別クラス。コマを入れたぶんだけ全員で練習する。
      // （同じ時間に2つのプールへ分かれることは時間割の側で禁止してある）
      for (const e of entries) {
        const pool = equipment.find((p) => p.id === e.poolId);
        const capacity = pool ? venueSlotsOf(pool.kind) : 0;
        out.set(entryKey(e), roster.slice(0, capacity));
      }
    }
  }

  // 保険：同じ時間に同じ人が2箇所に出ないよう、コマを時間順に見て重複を落とす。
  const bySlot = new Map<number, TimetableEntry[]>();
  for (const e of usable) {
    const list = bySlot.get(e.slot);
    if (list) list.push(e);
    else bySlot.set(e.slot, [e]);
  }
  for (const [, entries] of bySlot) {
    const seen = new Set<number>();
    for (const e of entries) {
      const key = entryKey(e);
      const members = out.get(key);
      if (!members) continue;
      const kept = members.filter((s) => !seen.has(s.id));
      for (const s of kept) seen.add(s.id);
      if (kept.length !== members.length) out.set(key, kept);
    }
  }
  return out;
}

/**
 * 今この瞬間の顔ぶれ。
 *
 * activeEntries には「開講できている全てのコマ」を、
 * runningEntries には「今この時刻に走っているコマ」を渡す。
 * 割り当ては週ぜんたいで決まる（1人1コマ）ので、両方が要る。
 */
export function poolLineup(
  activeEntries: readonly TimetableEntry[],
  runningEntries: readonly TimetableEntry[],
  equipment: readonly Equipment[],
  rosterOf: (classId: ClassId) => readonly Student[],
  opts: LineupOptions,
): PoolLineup[] {
  const assigned = assignRoster(activeEntries, equipment, rosterOf, opts);
  const out: PoolLineup[] = [];
  const seen = new Set<string>();
  for (const e of runningEntries) {
    const key = entryKey(e);
    if (seen.has(key)) continue; // 同じコマは1回だけ
    seen.add(key);
    const pool = equipment.find((p) => p.id === e.poolId);
    if (!pool || !opts.canUse(pool.id)) continue;
    // 休養している選手は「その回だけ」来ない（コマの持ち主ではあり続ける）
    const all = assigned.get(key) ?? [];
    const members = opts.attends ? all.filter((s) => opts.attends!(s)) : all.slice();
    out.push({ classId: e.classId, pool, slot: e.slot, members });
  }
  return out;
}

/** そのクラスで今練習している選手（複数プールなら合算）。 */
export function membersOfClass(lineup: readonly PoolLineup[], classId: ClassId): Student[] {
  const out: Student[] = [];
  for (const l of lineup) if (l.classId === classId) out.push(...l.members);
  return out;
}

/** その顔ぶれに出てくる選手の総数（検証・表示用）。 */
export function lineupCount(lineup: readonly PoolLineup[]): number {
  return lineup.reduce((n, l) => n + l.members.length, 0);
}
