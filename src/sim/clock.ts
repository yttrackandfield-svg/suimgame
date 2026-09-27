import { CLOCK } from "../config/balance";
import { SLOTS, slotAtMinute, type SlotDef } from "./timetable";

/**
 * ゲーム内時計。カイロソフト風に時間が自動で流れる。
 * 一日は 08:00〜20:00 で、TIMETABLE.slots のコマに区切られている。
 *
 *   08-10 / 10-12 / 12-14 / 14-15 / 15-16 / 16-18 / 18-20
 *
 * 「どのコマで、どのプールが、どのクラスを回すか」は時計ではなく
 * プレイヤーが組んだ時間割（sim/timetable.ts）が決める。
 * 時計は「今が何コマ目か」だけを知っていればよい。
 *
 * 純ロジック（Phaser非依存）。Scene が delta を渡して駆動する。
 */

/** 営業開始時刻（この時刻から一般客とスクールが来る。プロの営業前練習は 08:00〜）。 */
export const OPEN_MINUTE = 10 * 60;

const DAY_START = 8 * 60; // 08:00 開始
const DAY_END = 20 * 60; // 20:00 で本日終了→翌日へ
const MS_PER_MIN = CLOCK.msPerMinute; // 等倍：ゲーム内1分の実時間(ms)。調整は config/balance.ts

export type Speed = 1 | 2 | 4;

export interface TickResult {
  dayRolled: boolean;
  weekToMonth: boolean; // 週が一巡して月送りすべき
  minutesAdvanced: number; // このtickで進んだゲーム分（自動練習の駆動に使う）
}

export class GameClock {
  minuteOfDay = DAY_START;
  week = 1; // 1..4（4週で1ヶ月）
  speed: Speed = 1;

  setSpeed(s: Speed): void {
    this.speed = s;
  }

  /** 今が何コマ目か（-1＝コマの外）。 */
  slotIndex(): number {
    return slotAtMinute(this.minuteOfDay);
  }

  /** 今のコマの定義（無ければ null）。 */
  slot(): SlotDef | null {
    return SLOTS[this.slotIndex()] ?? null;
  }

  /** 営業中か（10:00〜20:00）。プロの営業前練習は営業前扱い。 */
  isOpen(): boolean {
    return this.minuteOfDay >= OPEN_MINUTE && this.minuteOfDay < DAY_END;
  }

  /** 時刻表示（24時間表記 08:00 形式）。 */
  timeLabel(): string {
    const total = Math.floor(this.minuteOfDay) % (24 * 60);
    const hour = Math.floor(total / 60);
    const min = total % 60;
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  weekLabel(): string {
    return `第${this.week}週`;
  }

  /** 次のコマの開始時刻（無ければ null）。 */
  nextSlotStart(): number | null {
    const up = SLOTS.find((s) => s.start > this.minuteOfDay + 0.001);
    return up ? up.start : null;
  }

  /** 次のコマの説明（空き時間UI用）。 */
  nextSlotLabel(): string {
    const up = SLOTS.find((s) => s.start > this.minuteOfDay + 0.001);
    if (up) return `次のコマは ${fmt(up.start)}`;
    return "本日の練習は終了（翌日へ）";
  }

  /** delta(ms) ぶん進める。 */
  tick(deltaMs: number): TickResult {
    const adv = (deltaMs / MS_PER_MIN) * this.speed;
    this.minuteOfDay += adv;
    if (this.minuteOfDay >= DAY_END) {
      const carried = this.minuteOfDay - DAY_END;
      this.minuteOfDay = DAY_START + carried;
      return { ...this.rollDay(true), minutesAdvanced: adv };
    }
    return { dayRolled: false, weekToMonth: false, minutesAdvanced: adv };
  }

  /** 次のコマの開始まで一気にスキップ（無ければ翌日の最初のコマへ）。 */
  skipToNextSlot(): TickResult {
    const up = SLOTS.find((s) => s.start > this.minuteOfDay + 0.001);
    if (up) {
      this.minuteOfDay = up.start;
      return { dayRolled: false, weekToMonth: false, minutesAdvanced: 0 };
    }
    this.minuteOfDay = SLOTS[0].start;
    return { ...this.rollDay(true), minutesAdvanced: 0 };
  }

  private rollDay(dayRolled: boolean): { dayRolled: boolean; weekToMonth: boolean } {
    this.week += 1;
    let weekToMonth = false;
    if (this.week > 4) {
      this.week = 1;
      weekToMonth = true;
    }
    return { dayRolled, weekToMonth };
  }
}

function fmt(min: number): string {
  const hour = Math.floor(min / 60);
  const m = min % 60;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
