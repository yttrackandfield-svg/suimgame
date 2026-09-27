import { DAYTIME } from "../config/balance";

/**
 * 時間帯（朝・昼・夕・夜）の雰囲気と、賑わいの密度。
 *
 * 08:00〜20:00 の1日のなかで
 *   ・画面の色味（朝は白っぽく、夕は橙、夜は青く暗い）
 *   ・館内の照明の点きぐあい
 *   ・一般客の来場しやすさ（放課後・仕事帰りが混む）
 * を1本のカーブから決める。**キーフレームを足すだけ**で山谷を変えられる。
 *
 * 純ロジック（Phaser 非依存）。実際に画面を暗くするのは FacilityScene。
 */

export type DayPhase = "morning" | "noon" | "evening" | "night";

export const PHASE_LABEL: Record<DayPhase, string> = {
  morning: "朝",
  noon: "昼",
  evening: "夕方",
  night: "夜",
};

export const PHASE_ICON: Record<DayPhase, string> = {
  morning: "🌅",
  noon: "☀",
  evening: "🌇",
  night: "🌙",
};

export interface Ambient {
  phase: DayPhase;
  label: string;
  icon: string;
  /** 画面全体に重ねる色。 */
  color: number;
  /** その色の濃さ（0＝そのまま／大きいほど暗く色づく）。 */
  alpha: number;
  /** 館内の照明の点きぐあい（0＝消灯／1＝全点灯）。 */
  light: number;
}

/** 2つの色を混ぜる（0..1）。 */
function mixColor(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** キーフレームのあいだを補間する（時刻は分）。 */
function interpolate<T>(
  frames: readonly { at: number; value: T }[],
  minute: number,
  lerp: (a: T, b: T, k: number) => T,
): T {
  if (frames.length === 0) throw new Error("frames is empty");
  if (minute <= frames[0].at) return frames[0].value;
  const last = frames[frames.length - 1];
  if (minute >= last.at) return last.value;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (minute <= b.at) {
      const span = Math.max(1e-6, b.at - a.at);
      return lerp(a.value, b.value, (minute - a.at) / span);
    }
  }
  return last.value;
}

/** その時刻がどの時間帯か。 */
export function phaseAt(minute: number): DayPhase {
  const m = ((minute % 1440) + 1440) % 1440;
  const b = DAYTIME.phaseBounds;
  if (m < b.morningEnd) return "morning";
  if (m < b.noonEnd) return "noon";
  if (m < b.eveningEnd) return "evening";
  return "night";
}

/** その時刻の雰囲気（画面の色味と照明）。 */
export function ambientAt(minute: number): Ambient {
  const m = ((minute % 1440) + 1440) % 1440;
  const tint = interpolate(DAYTIME.tint, m, (a, b, k) => ({
    color: mixColor(a.color, b.color, k),
    alpha: a.alpha + (b.alpha - a.alpha) * k,
    light: a.light + (b.light - a.light) * k,
  }));
  const phase = phaseAt(m);
  return {
    phase,
    label: PHASE_LABEL[phase],
    icon: PHASE_ICON[phase],
    color: tint.color,
    alpha: tint.alpha,
    light: tint.light,
  };
}

/**
 * その時刻の賑わい（一般客の来場倍率）。
 * 1.0 が基準。放課後（16時台）と仕事帰り（18〜19時台）が山、昼下がりが谷。
 * **人が少ない時間はガランと、多い時間は密に**というメリハリを作るのがここ。
 */
export function crowdFactorAt(minute: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  return Math.max(0, interpolate(DAYTIME.crowd, m, (a, b, k) => a + (b - a) * k));
}

/** 賑わいの言い回し（HUD の案内に使う）。 */
export function crowdLabel(minute: number): string {
  const f = crowdFactorAt(minute);
  if (f >= DAYTIME.busyFactor) return "混雑";
  if (f <= DAYTIME.quietFactor) return "閑散";
  return "";
}

/**
 * 【夜でも施設の中は明るい】幕を「敷地の中」と「外」に分けたときの、それぞれの濃さ。
 *
 * 画面ぜんぶを1枚で沈めると、照明が点いているはずの館内まで暗くなる。そこで
 *   1枚目（画面ぜんぶ）… 館内に残す薄い暗さ inside
 *   2枚目（敷地の外だけ）… 1枚目と重ねて外がちょうど alpha になる量 extra
 * の2枚に分ける。乗算合成は掛け算で重なるので、
 *   (1 - inside) × (1 - extra) = 1 - alpha
 * から extra を逆算する。
 */
export function veilAlphas(alpha: number, indoorDim = DAYTIME.indoorDim): { inside: number; extra: number } {
  const a = Math.max(0, Math.min(1, alpha));
  const inside = a * Math.max(0, Math.min(1, indoorDim));
  const extra = inside >= 1 ? 0 : Math.max(0, Math.min(1, 1 - (1 - a) / (1 - inside)));
  return { inside, extra };
}
