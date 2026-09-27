import { SPECIAL_TRAINING } from "../config/balance";
import type { RoomKind } from "./equipment";
import { STAT_KEYS, type StatKey, type Student } from "./student";

/**
 * 特別練習の定義（純ロジック・Phaser 非依存）。
 *
 * 「どのメニューがあるか」「1回でどの能力を鍛えるか」だけを持つ。
 * 実際に効果を与えるのは GameState.runSpecialTraining（コーチ・設備・研究の補正が要るため）。
 */

export type SpecialTargetKind = "plan" | "lowest" | "form" | "raceSet";

export interface SpecialMenu {
  id: string;
  label: string;
  icon: string;
  note: string;
  cost: number;
  /** 消費する情熱（クラブ全体で1つ → sim/state の passion）。 */
  passion: number;
  reps: number;
  gainMult: number;
  fatigueMult: number;
  conditionCost: number;
  /** 泳法練習（水感）を何回ぶん行うか。 */
  strokeReps: number;
  /** 必要な部屋（無ければ null）。 */
  requiresRoom: RoomKind | null;
  /**
   * 同じ選手が同じメニューをもう一度受けられるまでの日数。
   * 効果の大きいメニューほど長い（情熱だけで無限に叩けないようにする蓋）。
   */
  cooldownDays: number;
  /**
   * このメニューが解禁される研究テーマ（無ければ最初から使える）。
   * → sim/research の完了テーマ。
   */
  requiresResearch: string | null;
  target: SpecialTargetKind;
}

export const SPECIAL_MENUS: readonly SpecialMenu[] = SPECIAL_TRAINING.menus.map((m) => ({
  ...m,
  requiresRoom: (m.requiresRoom as RoomKind | null) ?? null,
  requiresResearch: (m.requiresResearch as string | null) ?? null,
})) as readonly SpecialMenu[];

export function specialMenu(id: string): SpecialMenu | null {
  return SPECIAL_MENUS.find((m) => m.id === id) ?? null;
}

/** いちばん低い能力（弱点克服メニューの対象）。 */
export function lowestStat(s: Student): StatKey {
  let best: StatKey = STAT_KEYS[0];
  for (const k of STAT_KEYS) {
    if (s.stats[k] < s.stats[best]) best = k;
  }
  return best;
}

/**
 * その回に鍛える能力。
 *   plan    … いま選んでいるメニューの能力（毎回同じ＝一点集中）
 *   lowest  … そのときいちばん低い能力（回ごとに変わる＝満遍なく底上げ）
 *   form    … フォーム固定
 *   raceSet … スタート → ターン → 持久力 の順に巡回
 */
export function specialTargetAt(menu: SpecialMenu, s: Student, planAbility: StatKey, rep: number): StatKey {
  switch (menu.target) {
    case "plan":
      return planAbility;
    case "lowest":
      return lowestStat(s);
    case "form":
      return "form";
    case "raceSet": {
      const cycle: StatKey[] = ["start", "turn", "stamina"];
      return cycle[rep % cycle.length];
    }
  }
}

/** 1人ぶんの実施結果（ビフォー／アフターの表示に使う）。 */
export interface SpecialResult {
  ok: boolean;
  reason?: string;
  menu?: SpecialMenu;
  /** 実施前の5能力。 */
  before?: Record<StatKey, number>;
  /** 実施後の5能力。 */
  after?: Record<StatKey, number>;
  /** 泳法の熟練度の伸び。 */
  strokeGain?: number;
  /** 使った体力とコンディションの落ち幅。 */
  energyUsed?: number;
  conditionDrop?: number;
  /** 途中で故障（フォーム低下）したか。 */
  injured?: boolean;
  cost?: number;
}
