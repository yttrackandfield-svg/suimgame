/**
 * 【画面に出す期間は「週」】（2026-09-27）
 *
 * ゲームは1週ずつ進む（1ゲーム日＝暦7日 → state の CALENDAR_DAYS_PER_STEP）。
 * それなのに残り期間を「あと14日」「遠征7日」のように**日**で出していて、
 * 週で進む画面と単位が合わなかった。暦の日数で持っている値（ケガ・下山からの日数・
 * 大会までの日数）は、画面に出すときにここで週へ直す。
 */

/** 暦の日数 → 画面に出す週（端数は切り上げ。0日なら0）。 */
export function weeksOf(days: number): number {
  return days <= 0 ? 0 : Math.ceil(days / 7);
}

/** 「3週」の形の文字列。 */
export function weeksLabel(days: number): string {
  return `${weeksOf(days)}週`;
}
