import { BATHING, NEEDS, RECOVERY, RECOVERY_ROOM } from "../config/balance";
import { clampCondition } from "./condition";
import {
  BATH_ROOMS,
  equipmentDef,
  gradeEffect,
  gradeLabel,
  gradeOf,
  stationsOf,
  hasSaunaNearby,
  type Equipment,
  type RoomKind,
} from "./equipment";
import { energyMax, wantsRecovery, type Student } from "./student";

/**
 * 欲求ドリブンの回復設備／アイテム利用。
 *
 * 「一定確率で使う」ではなく、選手が自分の状態（体力・コンディション）に応じて
 * 自発的に使いに行く。カイロソフト系ゲームの施設利用と同じ考え方。
 *
 *   1. 練習で疲れる → 「回復したい」欲求（recoveryNeed）が上がる（student.ts）
 *   2. クラス練習が終わった時点で、欲求が閾値を超えている選手だけが向かう
 *   3. 空いていれば使う（体力が戻り、欲求が下がる）
 *   4. 埋まっていれば並ぶ。待ちが長すぎる選手は諦めて帰る
 *   5. 体力に余裕がある選手はそもそも使わずに帰る
 *   6. ごくわずかな揺らぎ（たまに使わない子）を入れる
 *
 * → 台数・所持数が足りないと取りこぼしが出るので、「何台そろえるか」が経営判断になる。
 * 数値はすべて config/balance.ts の NEEDS / RECOVERY / ITEMS。
 */

/**
 * 回復に使えるもの＝4種類。
 *   サウナ・風呂・外気浴 … 温浴施設（回復量は config の BATHING.rooms）
 *   マッサージエリア     … 器具込みの部屋。回復量は**グレード**で決まる
 *
 * どれも**定員は4名**（→ RECOVERY_ROOM.seatsPerRoom）で、利用は**1コマ分**。
 */
export type RecoverySpotKind = RoomKind;

/** 1人が同時に使える「席」1つぶん。 */
export interface RecoverySlot {
  kind: RecoverySpotKind;
  label: string;
  /** 同種の何台目／何個目か（クォータービューの設置位置に対応）。 */
  unit: number;
  /**
   * その席を持っている**部屋の id**。
   * 同じ風呂が2つあっても「どちらを使ったか」を数えられるようにするため
   *（→ GameState.roomUseThisMonth／設備の情報パネル）。
   */
  roomId: number;
  /** その施設の中の何人目か（定員は4名なので 0..3）。 */
  seat: number;
  energy: number; // 体力最大値に対する回復割合
  condition: number; // 上がったときに回復するコンディション（点）
  /** コンディションが上がる確率（体力はいつも少し戻る／調子は時々）。 */
  conditionChance: number;
  minutes: number; // 利用にかかるゲーム内分（＝1コマぶん）
}

/**
 * クラブの回復キャパシティを「席」の一覧に展開する。
 *
 * 4種類（サウナ・風呂・外気浴・マッサージエリア）とも**1施設4席**。
 * 「どこが強いか」ではなく「何か所あるか」で、1コマに回復できる人数が決まる。
 */
export function recoverySlots(
  equipment: readonly Equipment[],
  /** 研究（リカバリー）による回復量の倍率。1.0＝効果なし。 */
  recoveryMult = 1,
): RecoverySlot[] {
  const out: RecoverySlot[] = [];
  const seats = RECOVERY_ROOM.seatsPerRoom;
  const minutes = RECOVERY_ROOM.useMinutes;

  // 温浴施設（風呂・サウナ・外気浴）。
  //   風呂   … 体力の戻りがいちばん大きい
  //   サウナ … 体力もそこそこ戻り、調子が整いやすい
  //   外気浴 … 調子寄り。サウナが近いと「ととのって」効果が跳ね上がる
  for (const kind of BATH_ROOMS) {
    const conf = BATHING.rooms[kind];
    if (!conf) continue;
    let unit = 0;
    for (const e of equipment) {
      if (e.kind !== kind) continue;
      // ととのい判定は部屋ごと（サウナの隣に建てた外気浴だけが強くなる）
      const tuned = hasSaunaNearby(e, equipment);
      const energyMult = tuned ? BATHING.synergy.energyMult : 1;
      const condMult = tuned ? BATHING.synergy.conditionMult : 1;
      for (let seat = 0; seat < seats; seat++) {
        out.push({
          kind,
          label: tuned ? `${equipmentDef(kind).label}（ととのう）` : equipmentDef(kind).label,
          unit,
          roomId: e.id,
          seat,
          energy: conf.energy * energyMult * recoveryMult,
          condition: conf.condition * condMult * recoveryMult,
          conditionChance: conf.conditionChance,
          minutes,
        });
      }
      unit++;
    }
  }

  // マッサージエリアは**部屋そのもの**が席を持つ（器具は部屋に同梱）。
  // グレードで伸びるのは**効きと席数の両方**（小4・中6・大10名 → massageSeatsOf）。
  for (const e of equipment) {
    if (e.kind !== "recovery") continue;
    const eff = gradeEffect(gradeOf(e));
    const n = stationsOf(e);
    for (let seat = 0; seat < n; seat++) {
      out.push({
        kind: "recovery",
        label: `${equipmentDef("recovery").label}（${gradeLabel(gradeOf(e))}）`,
        unit: e.id,
        roomId: e.id,
        seat,
        energy: RECOVERY.energyPerSeat * eff * recoveryMult,
        condition: RECOVERY.conditionPerSeat * eff * recoveryMult,
        conditionChance: RECOVERY.conditionChance,
        minutes,
      });
    }
  }

  return out;
}

/** 席の良さ（表示・比較用）。体力1割＝コンディション10点、くらいの重み付け。 */
export function slotValue(s: RecoverySlot): number {
  return s.energy * 100 + s.condition * s.conditionChance;
}

/** 1人ぶんの結果（画面の動線と通知に使う）。 */
export interface RecoveryOutcome {
  student: Student;
  /** 実際に使った席（null＝使えなかった／使わなかった）。 */
  slot: RecoverySlot | null;
  /** 何巡目で順番が来たか（0＝待たずに使えた）。 */
  waitTurns: number;
  /** 待ちが長くて諦めた。 */
  gaveUp: boolean;
  /** 揺らぎでそもそも使わなかった。 */
  skipped: boolean;
  /** 空きが無かった（席が0、または全部埋まっていて回ってこなかった）。 */
  full: boolean;
  /**
   * 使えなかったとき、**並んでいた施設**（席が0なら null）。
   * 順番が回ってきたら座るはずだった席の種類。混雑の集計と「○○が使えない」の吹き出しに使う。
   */
  wantKind: RecoverySpotKind | null;
  energyGain: number;
  conditionGain: number;
}

/** 集計（通知やレポートに出す）。 */
export interface RecoveryReport {
  wanted: number; // 使いたかった人数
  used: number; // 実際に使えた人数
  gaveUp: number; // 諦めて帰った人数
  outcomes: RecoveryOutcome[];
}

/**
 * 席1つを実際に使う。
 *
 * 体力は**いつも少し**戻り、コンディション（調子）は**確率で時々**上がる。
 * 「入れば必ず調子が良くなる」だと施設を建てた瞬間に全員が絶好調になってしまうので、
 * 調子のほうは当たり外れのあるご褒美にしてある。
 */
export function applyRecovery(
  s: Student,
  slot: RecoverySlot,
  rand: () => number = Math.random,
): { energy: number; condition: number } {
  const em = energyMax(s);
  const beforeE = s.energy;
  const beforeC = s.condition;
  // 【戻るのは「減ったぶんの一部」】疲れている選手ほど大きく戻り、
  // ほぼ満タンの選手には効かない（施設は「回復の場」であって「満タンにする装置」ではない）。
  // 最大値に対する割合にすると、消費の小さい選手が毎回満タンに戻ってしまう。
  s.energy = Math.min(em, s.energy + (em - s.energy) * Math.min(1, slot.energy));
  if (rand() < slot.conditionChance) s.condition = clampCondition(s.condition + slot.condition);
  const gained = s.energy - beforeE;
  s.recoveryNeed = Math.max(0, s.recoveryNeed - gained * NEEDS.satisfiedPerEnergyPoint);
  return { energy: gained, condition: s.condition - beforeC };
}

/**
 * 練習が終わった選手たちの行動を決める。
 *
 * 体力が減った選手が、**どの施設を使うかはランダム**。
 * 席は全施設ぶんをまぜてから順に配るので、「風呂が空くまで全員が風呂に並ぶ」
 * ではなく、その日その日でサウナへ行く子・外気浴へ行く子が入れ替わる。
 * 定員（1施設4名）を超えたぶんは待ち、待ちが長すぎる選手は諦めて帰る。
 */
export function planRecovery(
  students: readonly Student[],
  slots: readonly RecoverySlot[],
  rand: () => number,
): RecoveryReport {
  // 体力に余裕がある選手はそのまま帰る（＝候補に入らない）
  const wanted = students.filter((s) => wantsRecovery(s));
  // 欲求の強い順に向かう（疲れている子から席にありつく）
  const queue = [...wanted].sort((a, b) => b.recoveryNeed - a.recoveryNeed);
  // 席はまぜる＝**どの施設に入るかはランダム**
  const pool = shuffled(slots, rand);

  const outcomes: RecoveryOutcome[] = [];
  let taken = 0; // ここまでに席を取った人数（＝次に入る席のインデックス）
  let missed = 0; // 並んだが諦めた人数（どの席に並んでいたかを散らすためだけに使う）

  for (const s of queue) {
    // ごくわずかな揺らぎ：全員が機械的に同じ行動を取ると不自然なので、たまに使わない
    if (rand() < NEEDS.skipChance) {
      outcomes.push(blank(s, { skipped: true }));
      continue;
    }
    if (pool.length === 0) {
      outcomes.push(blank(s, { full: true }));
      continue;
    }

    const waitTurns = Math.floor(taken / pool.length);
    // 並んでいた席（順番が来たら座るはずだった席）。席はまぜてあるので、
    // 使えなかった人は**席数の割合どおりに**各施設へ散る（1種類に押しつけない）
    // 諦めた人も1人ずつ次の席に並んだことにする（待ち時間の計算＝taken には入れない）
    const wantKind = pool[(taken + missed) % pool.length].kind;
    // 待ち行列が長すぎる場合、途中で諦めて帰る
    if (waitTurns > NEEDS.maxWaitTurns) {
      outcomes.push(blank(s, { gaveUp: true, full: true, waitTurns, wantKind }));
      missed++;
      continue;
    }
    if (waitTurns > 0 && rand() < waitTurns * NEEDS.giveUpPerTurn) {
      outcomes.push(blank(s, { gaveUp: true, waitTurns, wantKind }));
      missed++;
      continue;
    }

    const slot = pool[taken % pool.length];
    taken++;
    const g = applyRecovery(s, slot, rand);
    outcomes.push({
      student: s,
      slot,
      waitTurns,
      gaveUp: false,
      skipped: false,
      full: false,
      wantKind: null,
      energyGain: g.energy,
      conditionGain: g.condition,
    });
  }

  return {
    wanted: wanted.length,
    used: outcomes.filter((o) => o.slot !== null).length,
    gaveUp: outcomes.filter((o) => o.gaveUp).length,
    outcomes,
  };
}

/** 並びをまぜる（Fisher-Yates）。渡された配列は変えない。 */
function shuffled(slots: readonly RecoverySlot[], rand: () => number): RecoverySlot[] {
  const a = [...slots];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blank(
  student: Student,
  o: Partial<Pick<RecoveryOutcome, "gaveUp" | "skipped" | "full" | "waitTurns" | "wantKind">>,
): RecoveryOutcome {
  return {
    student,
    slot: null,
    waitTurns: o.waitTurns ?? 0,
    gaveUp: o.gaveUp ?? false,
    skipped: o.skipped ?? false,
    full: o.full ?? false,
    wantKind: o.wantKind ?? null,
    energyGain: 0,
    conditionGain: 0,
  };
}
