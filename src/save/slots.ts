import store from "./storage";
import { parseSave } from "./migrate";
import { buildSave, headerOf } from "./serialize";
import { SLOT_COUNT, type SaveData, type SlotHeader, type SlotInfo } from "./types";
import type { GameState } from "../sim/state";
import type { GameClock } from "../sim/clock";

/**
 * セーブ枠（3つ）の読み書き。
 *
 * 1枠につき2つのキーを持つ：
 *   suim.slotN.data … ゲーム全状態（本体）
 *   suim.slotN.head … 一覧表示用の概要（クラブ名・年月・所持金・在籍数…）
 * データ選択画面は head だけを読むので、3枠ぶんのフルデータを展開せずに済む。
 */

const dataKey = (slot: number): string => `suim.slot${slot}.data`;
const headKey = (slot: number): string => `suim.slot${slot}.head`;

export const SLOTS: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

export type ReadResult = { ok: true; data: SaveData } | { ok: false; reason: string; empty: boolean };

/** 枠のフルデータを読む（バージョン移行つき）。 */
export async function readSlot(slot: number): Promise<ReadResult> {
  const text = await store.get(dataKey(slot));
  if (!text) return { ok: false, reason: "データがありません", empty: true };
  const res = parseSave(text);
  if (!res.ok) return { ok: false, reason: res.reason, empty: false };
  return { ok: true, data: res.data };
}

/**
 * 保存の順番待ち（枠ごと）。
 *
 * 1回の保存は「本体」と「概要」の2回書き込みでできている。
 * 自動セーブと手動セーブが重なると
 *   本体A → 本体B → 概要B → 概要A
 * のように混ざり、**一覧に出る人数（概要）だけが古いまま**になることがある。
 * ＝「データ選択画面の在籍数が、実際と違う／見るたびに変わる」の原因。
 * 前の保存が終わるまで次を待たせて、必ず 本体→概要 の対で書き終える。
 */
const saving = new Map<number, Promise<unknown>>();

/** 枠へ保存する（本体＋概要）。同じ枠への保存は順番に実行される。 */
export async function writeSlot(
  slot: number,
  state: GameState,
  clock: GameClock,
  playTimeMs: number,
): Promise<{ ok: boolean; reason?: string; header?: SlotHeader }> {
  // 書き出しは待たせる前に済ませる（待っている間に状態が変わらないように）
  let data: SaveData;
  let header: SlotHeader;
  try {
    data = buildSave(state, clock, playTimeMs);
    header = headerOf(data);
  } catch (err) {
    console.error("[save] 保存データを作れませんでした", err);
    return { ok: false, reason: "保存に失敗しました" };
  }

  const prev = saving.get(slot) ?? Promise.resolve();
  const task = prev
    .catch(() => undefined)
    .then(async () => {
      await store.set(dataKey(slot), JSON.stringify(data));
      await store.set(headKey(slot), JSON.stringify(header));
    });
  saving.set(slot, task);

  try {
    await task;
    return { ok: true, header };
  } catch (err) {
    console.error("[save] 保存に失敗", err);
    return { ok: false, reason: "保存に失敗しました" };
  } finally {
    if (saving.get(slot) === task) saving.delete(slot);
  }
}

/** 枠を削除する（取り返しがつかない）。 */
export async function clearSlot(slot: number): Promise<void> {
  await store.remove(dataKey(slot));
  await store.remove(headKey(slot));
}

/** 全セーブデータを削除する（設定画面から）。 */
export async function clearAllSlots(): Promise<void> {
  for (const slot of SLOTS) await clearSlot(slot);
}

function parseHeader(text: string): SlotHeader | null {
  try {
    const h = JSON.parse(text) as SlotHeader;
    return typeof h?.savedAt === "number" ? h : null;
  } catch {
    return null;
  }
}

/** 1枠の概要を得る。概要が無ければ本体から作り直す（旧データ・書き込み中断への保険）。 */
export async function readSlotInfo(slot: number): Promise<SlotInfo> {
  const headText = await store.get(headKey(slot));
  if (headText) {
    const header = parseHeader(headText);
    if (header) return { slot, header, broken: false };
  }
  const body = await store.get(dataKey(slot));
  if (!body) return { slot, header: null, broken: false }; // 空き枠

  const res = parseSave(body);
  if (!res.ok) return { slot, header: null, broken: true };

  const header = headerOf(res.data);
  await store.set(headKey(slot), JSON.stringify(header)); // 次回から速く読めるように直す
  return { slot, header, broken: false };
}

/** 3枠ぶんの概要（データ選択画面用）。 */
export async function listSlots(): Promise<SlotInfo[]> {
  return Promise.all(SLOTS.map((s) => readSlotInfo(s)));
}

/** 直近にセーブされた枠（「つづきから」用）。1件も無ければ null。 */
export async function latestSlot(): Promise<number | null> {
  const infos = await listSlots();
  const used = infos.filter((i) => i.header);
  if (used.length === 0) return null;
  return used.reduce((a, b) => ((a.header?.savedAt ?? 0) >= (b.header?.savedAt ?? 0) ? a : b)).slot;
}

// ------------------------------------------------------------------ 表示ヘルパ

/** 「2026/07/25 19:40」形式。 */
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 「12時間34分」形式のプレイ時間。 */
export function formatPlayTime(ms: number): string {
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
