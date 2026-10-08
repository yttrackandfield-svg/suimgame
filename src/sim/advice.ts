import { CLASS_ORDER, classLabel, isSchoolClass, type ClassId } from "./classes";
import { clubRankShort, CLUB_MAX_TIER } from "./clubRank";
import { standardKeysFor } from "./competitions";
import { STANDARD_SHORT, getStandardTime, type StandardKey } from "../data/standardTimes";
import { type Student } from "./student";
import { slotLabel, type TimetableEntry } from "./timetable";
import type { GameState } from "./state";

/**
 * 「今月の一手」。HUD の日付の下に1行だけ出す案内。
 *
 * 【なぜ要るか】この遊びは**放っておくと何も起きない**。
 * 実測では、大会に出さないまま10時間進めてもクラブの格は2で止まる
 *（格が上がらない＝施設もコーチも解放されない）。
 * ところが画面には「名簿・練習・時間割・コーチ・設備・イベント・大会・セーブ」が
 * 平たく8つ並んでいるだけで、**どれを押せば前に進むのかがどこにも書いていない**。
 * ここはその1行を受け持つ。
 *
 * 【並べ方】「止まっていること」から先に出す。
 *   ① 壊れている（プールが使えない・コマが1つも開いていない）
 *   ②' 来月で退会する子がいる（**取り返しがつかない**ので先に出す）
 *   ② コマにコーチが居ない（＝そのコマは丸ごと走らない）
 *   ③ 大会が近い（出場確認の窓・今月まだ誰も出していない記録会）
 *   ④ 定員があふれている（入りたい子を断っている）
 *   ⑤ 次の格まであと少し
 *   ⑥ 標準記録に手が届きそうな選手がいる
 *   ⑦ どれでもなければ、次の大会の予告
 *
 * **1つしか出さない**。2つ3つ並べると読まなくなるし、
 * 「次にやること」が2つあるのは案内として失敗している。
 */

export interface Advice {
  /** 行頭のしるし。 */
  icon: string;
  /** 本文（1行に収まる長さで書くこと）。 */
  text: string;
  /** 字の色。急ぎのものほど暖色。 */
  color: string;
  /** 押したときに開く画面（HUD の行をタップできるようにするため）。 */
  go?: "timetable" | "coach" | "comp" | "shop" | "roster" | "events";
}

/** 急ぎ具合ごとの色。 */
const URGENT = "#e67e22";
const WARN = "#f7dc6f";
const CALM = "#7fd1ae";
const INFO = "#aed6f1";

/** 開講しているコマのうち、コーチが居ないもの。 */
function coachlessEntries(state: GameState): TimetableEntry[] {
  // entryStatus は「コーチが居ない」も落とすので、active には出てこない。
  // ここは**時間割に置いてあるのに走っていない**コマを探すので、生の timetable を見る。
  return state.timetable.filter((e) => e.classId != null && e.coachId == null);
}

/** 定員を超えて入れない人数（クラスごとの 在籍 − 定員 の合計）。 */
function overflowCount(state: GameState): { total: number; worst: ClassId | null } {
  let total = 0;
  let worst: ClassId | null = null;
  let worstN = 0;
  for (const c of CLASS_ORDER) {
    const over = state.students[c.id].length - state.capacityOf(c.id);
    if (over <= 0) continue;
    total += over;
    if (over > worstN) {
      worstN = over;
      worst = c.id;
    }
  }
  return { total, worst };
}

/**
 * 標準記録にいちばん近い選手。
 * 「あと0.8秒」は数字が小さいほど手が届くので、**秒差**で比べる。
 */
function closestToStandard(
  state: GameState,
): { s: Student; key: StandardKey; diff: number } | null {
  let best: { s: Student; key: StandardKey; diff: number } | null = null;
  for (const c of CLASS_ORDER) {
    if (isSchoolClass(c.id)) continue; // スクールは大会に出ない
    for (const s of state.students[c.id]) {
      if (s.bestTimeSec <= 0 || !s.bestTimeEvent) continue;
      for (const key of standardKeysFor(s)) {
        if (s.season?.standards?.includes(key)) continue; // もう突破している
        const need = getStandardTime(key, s.bestTimeEvent, s.gender);
        if (need == null) continue;
        const diff = s.bestTimeSec - need;
        // すでに超えている（diff<=0）か、遠すぎる（3秒以上）ものは案内しない。
        // 3秒は「あと少し」と言える上限。ここを広げると毎月同じ人が出続ける。
        if (diff <= 0 || diff > 3) continue;
        if (!best || diff < best.diff) best = { s, key, diff };
      }
    }
  }
  return best;
}

/** いま申し込める大会のうち、いちばん手前のものの名前。 */
function nextMeetName(state: GameState): string | null {
  const open = state.competitionsForClub();
  return open.length > 0 ? open[0].name : null;
}

/**
 * いま出すべき1行を選ぶ。出すものが無ければ null。
 *
 * `weekLabel` は時計から渡す（この関数は時計を知らない＝検査で好きな週を作れる）。
 */
export function monthlyAdvice(state: GameState, weekLabel: string): Advice | null {
  const head = `${state.month}月${weekLabel}：`;

  // ① 壊れている：プールが1つも使えない／コマが1つも開いていない
  if (state.usablePools().length === 0) {
    return {
      icon: "⚠",
      text: `${head}使えるプールがない。入口から歩いて行ける場所に建てよう`,
      color: URGENT,
      go: "shop",
    };
  }
  /**
   * ②' 退会の予告。**昇格させれば残せる**うちに知らせる。
   *
   * ほかの案内は「損をする」だが、これだけは**育てた子が居なくなる**＝取り返しがつかない。
   * 猶予は1ヶ月しかないので、コーチ未配置より前に出す。
   */
  /**
   * 卒園して学童に空きがない子は、昇格では残せない（学童の枠を空ける）ので別の書き方にする。
   * 年齢の退会（猶予1ヶ月）のほうが急ぐので、そちらを先に出す。
   */
  const leaving = state.leavingStudents().filter((s) => !state.isWaitingForGakudo(s));
  const noRoom = state.leavingStudents().filter((s) => state.isWaitingForGakudo(s));
  if (leaving.length === 0 && noRoom.length > 0) {
    const s0 = noRoom[0];
    const when = state.monthsUntilLeave(s0) <= 1 ? "来月" : `${state.monthsUntilLeave(s0)}ヶ月後に`;
    return {
      icon: "🎒",
      text:
        noRoom.length === 1
          ? `${head}${s0.name}は学童に空きがない為${when}退会（枠を空ければ残る）`
          : `${head}${noRoom.length}人が学童に空きがない為退会予定（枠を空ければ残る）`,
      color: URGENT,
      go: "roster",
    };
  }
  if (leaving.length > 0) {
    const s0 = leaving[0];
    return {
      icon: "🚨",
      text:
        leaving.length === 1
          ? `${head}${s0.name}（${s0.grade}）が来月で退会。上のクラスへ上げれば残せる`
          : `${head}${leaving.length}人が来月で退会（${s0.name}ほか）。上のクラスへ上げれば残せる`,
      color: URGENT,
      go: "roster",
    };
  }

  /**
   * ② コーチ未配置：そのコマは丸ごと走らない（いちばん損が大きい）。
   *
   * 【「コマが開いていない」より先に見ること】`activeTimetable()` は
   * **コーチの居ないコマも落とす**ので、全コマのコーチを外すと「開講0」になる。
   * 順番を逆にすると、コーチが足りないだけなのに
   * 「練習のコマが1つも開いていない。時間割を組もう」と案内してしまい、
   * 時間割を開いても**すでにコマは組んである**ので何を直せばいいのか分からない。
   */
  const coachless = coachlessEntries(state);
  if (coachless.length > 0) {
    const e = coachless[0];
    const who = e.classId ? classLabel(e.classId) : "";
    return {
      icon: "🧑‍🏫",
      text:
        coachless.length === 1
          ? `${head}${slotLabel(e.slot)}の${who}にコーチが居ない。このコマは走らない`
          : `${head}コーチの居ないコマが${coachless.length}つある。このコマは走らない`,
      color: URGENT,
      go: "timetable",
    };
  }

  // コマそのものが無い／どれも開けない（コーチは足りているのに開講0）
  if (state.activeTimetable().length === 0) {
    return {
      icon: "⚠",
      text:
        state.timetable.length === 0
          ? `${head}練習のコマが1つも無い。時間割を組もう`
          : `${head}どのコマも開講できていない。時間割で理由を確かめよう`,
      color: URGENT,
      go: "timetable",
    };
  }

  // ③ 大会：出場確認の窓に入っている主要大会を最優先で出す
  const needing = state.majorsNeedingConfirm();
  if (needing.length > 0) {
    return {
      icon: "🏁",
      text: `${head}${needing[0].name}まで2週間。出場する選手を決めよう`,
      color: WARN,
      go: "comp",
    };
  }
  // 今月の記録会にまだ1人も出していない（＝格が積まれない月になる）
  if (state.competitionsForClub().length > 0 && state.pendingRaces.length === 0) {
    const name = nextMeetName(state);
    return {
      icon: "🏊",
      text: `${head}今月はまだ誰も大会に出ていない。${name ?? "記録会"}に出すと格が上がる`,
      color: WARN,
      go: "comp",
    };
  }

  // ④ 定員あふれ：入りたい子を断っている状態
  const over = overflowCount(state);
  if (over.total > 0 && over.worst) {
    return {
      icon: "🚪",
      text: `${head}${classLabel(over.worst)}が定員オーバー（${over.total}人あふれている）。コマかプールを増やそう`,
      color: WARN,
      go: "timetable",
    };
  }

  // ⑤ 次の格まであと少し（あと1割を切ったら出す）
  const prog = state.clubRankProgress();
  if (prog.nextNeed != null && prog.tier < CLUB_MAX_TIER) {
    const remain = Math.ceil(prog.nextNeed - prog.score);
    const span = prog.nextNeed - prog.need;
    if (remain > 0 && remain <= span * 0.12) {
      return {
        icon: "🏆",
        text: `${head}「${clubRankShort(prog.tier + 1)}」まであと${remain}。大会で勝つと一気に近づく`,
        color: CALM,
        go: "comp",
      };
    }
  }

  // ⑥ 標準記録に手が届きそう
  const near = closestToStandard(state);
  if (near) {
    return {
      icon: "⏱",
      text: `${head}${near.s.name}が${STANDARD_SHORT[near.key]}まであと${near.diff.toFixed(2)}秒`,
      color: CALM,
      go: "roster",
    };
  }

  // ⑦ フォールバック：エントリー済みなら開催日を、そうでなければ次の大会を予告
  if (state.pendingRaces.length > 0) {
    const r = state.pendingRaces[0];
    // raceDay はゲーム日（＝1週）で数えているので、そのまま週で出す
    const weeks = Math.max(0, r.raceDay - state.dayCount);
    return {
      icon: "🏊",
      text: `${head}エントリー済み。レースまであと${weeks}週`,
      color: INFO,
      go: "comp",
    };
  }
  const name = nextMeetName(state);
  return name
    ? { icon: "🏊", text: `${head}${name}にエントリーできる`, color: INFO, go: "comp" }
    : { icon: "📋", text: `${head}練習を続けよう`, color: INFO };
}

/** 表示用（1行に収まるか検査で測るため）。 */
export function adviceLine(a: Advice): string {
  return `${a.icon} ${a.text}`;
}

/** 型だけ使う（未使用警告よけ）。 */
export type { ClassId, StandardKey };
