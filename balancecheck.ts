/**
 * 経営バランスの実測（ヘッドレス）。
 *
 * FacilityScene.update() がやっていることと同じ順序でゲームを空回しし、
 * 「何もしないプレイヤー」と「ふつうに投資するプレイヤー」の2通りで
 * お金・在籍・人気度・定員がどう動くかを月ごとに出す。
 *
 * 実行:
 *   npx esbuild balancecheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState, type MonthRollResult } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { CLOCK, DORM, EQUIPMENT, GUESTS, MAP, START, TIMETABLE } from "./src/config/balance";
import { equipmentDef, type EquipmentKind } from "./src/sim/equipment";
import { slotAtMinute, SLOTS } from "./src/sim/timetable";
import { CLASS_ORDER } from "./src/sim/classes";
import { membersOfClass } from "./src/sim/lineup";

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

interface Snapshot {
  month: number;
  gems: number;
  members: number;
  athletes: number;
  popularity: number;
  capacity: number;
  income: number;
  guest: number;
  upkeep: number;
  salary: number;
  net: number;
  unpaid: number;
  turnedAway: number;
}

/** 5ゲーム分ずつ進める（FacilityScene と同じ呼び出し順）。 */
function runMonths(st: GameState, clock: GameClock, months: number): Snapshot[] {
  const stepMs = CLOCK.msPerMinute * 5;
  const out: Snapshot[] = [];
  let activeSig = "";
  let guard = 0;

  while (out.length < months && guard < 2_000_000) {
    guard++;
    const res = clock.tick(stepMs);

    // クラスの入れ替え（休養の消費と回復設備の利用がここで走る）
    const running = st.runningLessons(clock.minuteOfDay);
    const sig = running.map((e) => `${e.poolId}:${e.classId}`).sort().join("|");
    // 今のコマの顔ぶれ（1人1コマ）。練習も休養もこの顔ぶれにだけ効く。
    const lineup = st.lineupAt(clock.minuteOfDay);
    const classes = st.activeClassIds(clock.minuteOfDay);
    if (sig !== activeSig) {
      const slot = slotAtMinute(clock.minuteOfDay);
      for (const cls of classes) st.beginClassSession(cls, membersOfClass(lineup, cls), slot);
      activeSig = sig;
    }

    if (res.minutesAdvanced > 0) {
      for (const cls of classes) {
        st.tickPractice(cls, res.minutesAdvanced, undefined, membersOfClass(lineup, cls));
      }
      st.tickGuests(clock.minuteOfDay, res.minutesAdvanced);
      st.pollAutoEvents(res.minutesAdvanced);
    }

    if (res.dayRolled) {
      for (const c of CLASS_ORDER) st.endClassSession(c.id);
      activeSig = "";
      st.onDayRoll();
      if (res.weekToMonth) out.push(snap(st, st.advanceMonth()));
    }
  }
  return out;
}

function snap(st: GameState, m: MonthRollResult): Snapshot {
  return {
    month: m.month,
    gems: Math.round(st.gems),
    members: st.totalMembers(),
    athletes: st.students.senshu.length + st.students.pro.length,
    popularity: Math.round(st.popularity),
    capacity: st.capacityOf("youji") + st.capacityOf("gakudo"),
    income: m.income,
    guest: m.guests.income,
    upkeep: m.upkeep,
    salary: m.salary,
    net: m.net,
    unpaid: m.unpaid,
    turnedAway: m.turnedAway,
  };
}

function table(title: string, rows: Snapshot[]): void {
  console.log(`\n=== ${title} ===`);
  console.log("  月  所持◆   在籍  選手  人気  定員 | 月謝  一般客  維持  給料   収支  未払 断り");
  rows.forEach((r, i) => {
    const f = (n: number, w: number): string => String(n).padStart(w);
    console.log(
      `  ${f(i + 1, 2)}  ${f(r.gems, 6)}  ${f(r.members, 5)} ${f(r.athletes, 5)} ${f(r.popularity, 5)} ${f(r.capacity, 5)} |` +
        ` ${f(r.income, 4)}  ${f(r.guest, 5)}  ${f(r.upkeep, 4)}  ${f(r.salary, 4)} ${f(r.net, 6)} ${f(r.unpaid, 5)} ${f(r.turnedAway, 4)}`,
    );
  });
}

let warnings = 0;
function warn(cond: boolean, msg: string, detail = ""): void {
  if (cond) {
    warnings++;
    console.log(`  ⚠ ${msg}${detail ? `  — ${detail}` : ""}`);
  } else {
    console.log(`  ok ${msg}${detail ? `  — ${detail}` : ""}`);
  }
}

// ------------------------------------------------------------------ 前提の確認

console.log("=== 初期条件 ===");
console.log(`  所持◆${START.gems}　在籍 幼児${START.roster.youji}/学童${START.roster.gakudo}`);
const roomCosts = (["entrance", "coachroom", "pool6", "studio", "gym", "dorm"] as EquipmentKind[])
  .map((k) => `${equipmentDef(k).label}◆${equipmentDef(k).cost}`)
  .join("　");
console.log(`  部屋の値段: ${roomCosts}`);
console.log(`  移設◆${MAP.moveCost}　撤去の返金 ${Math.round(MAP.sellRefund * 100)}%`);
console.log(`  一般客 1コマ${GUESTS.basePerSlot}人/部屋　料金 プール◆${GUESTS.fee.pool} 筋トレ◆${GUESTS.fee.gym}`);
console.log(`  1日 = ${SLOTS.length}コマ　1ヶ月 = 4日　プール上限 ${EQUIPMENT.maxPools}本　1コマ ${TIMETABLE.schoolPerLane}人/レーン`);

// ------------------------------------------------------------------ A. 何もしない

const stA = new GameState(rng(101), { clubName: "放置クラブ" });
const rowsA = runMonths(stA, new GameClock(), 24);
table("A. 何もしないで2年（購入も時間割の変更もしない）", rowsA);

console.log("\n  --- 判定 ---");
const lastA = rowsA[rowsA.length - 1];
const brokeA = rowsA.findIndex((r) => r.unpaid > 0);
warn(brokeA >= 0, "支払いが滞らない", brokeA >= 0 ? `${brokeA + 1}ヶ月目に未払い発生` : "24ヶ月とも黒字で回る");
warn(lastA.gems < START.gems, "お金が増えている", `◆${START.gems} → ◆${lastA.gems}`);
warn(
  lastA.members <= START.roster.youji + START.roster.gakudo,
  "人が増えている",
  `${START.roster.youji + START.roster.gakudo}人 → ${lastA.members}人`,
);
const firstFull = rowsA.findIndex((r) => r.turnedAway > 0);
warn(
  firstFull < 0 || firstFull > 20,
  "いずれ定員が埋まって「増やしたい」と思える",
  firstFull < 0 ? "2年たっても埋まらない（拡張の動機が弱い）" : `${firstFull + 1}ヶ月目に満員`,
);
warn(lastA.popularity >= 990, "人気度が上限に張り付かない", `${lastA.popularity} / 999`);

// ------------------------------------------------------------------ B. ふつうに投資する

const stB = new GameState(rng(202), { clubName: "投資クラブ" });
const clockB = new GameClock();
const buyLog: string[] = [];

/** 空いているところへ部屋を建てて、道で繋ぐ（プレイヤーの手を模す）。 */
function tryBuild(st: GameState, kind: EquipmentKind): boolean {
  if (!st.canBuyEquipment(kind).ok) return false;
  const r = st.buyEquipment(kind); // 自動配置＋自動で道を伸ばす
  if (!r.ok) return false;
  buyLog.push(`${equipmentDef(kind).label}`);
  return true;
}

const rowsB: Snapshot[] = [];
for (let m = 0; m < 24; m++) {
  // 毎月、余裕があれば1つ投資する（プールが埋まってきたら増設、そのあと設備）
  const wish: EquipmentKind[] =
    stB.capacityOf("youji") + stB.capacityOf("gakudo") <= stB.totalMembers() + 10
      ? ["pool6", "studio", "gym"]
      : ["studio", "gym", "recovery", "coachroom", "dorm", "pool6"];
  const reserve = (stB.monthlyUpkeep() + stB.totalMonthlySalary()) * 3;
  let built = false;
  for (const k of wish) {
    // 投資しても3ヶ月ぶんの支出は残す、くらいの慎重さ
    if (stB.gems - stB.equipmentCost(k) < reserve) continue;
    if (tryBuild(stB, k)) {
      built = true;
      break;
    }
  }
  // 建てたいのに置く場所が無いなら、敷地を買い足す（プレイヤーの手を模す）
  if (!built && wish.some((k) => !stB.hasSpaceFor(k))) {
    if (stB.gems - stB.landExpandCost() >= reserve) {
      const land = stB.expandLand();
      if (land.ok) buyLog.push(`敷地拡張(${land.size}マス角)`);
    }
  }
  // 空きコマがあれば、スクールのコマを増やして定員を伸ばす
  for (const pool of stB.placedPools()) {
    for (let slot = 0; slot < SLOTS.length; slot++) {
      if (stB.timetableEntryAt(pool.id, slot)) continue;
      const coach = stB.availableCoachesFor(slot, pool.id)[0];
      if (!coach) break;
      stB.setTimetableEntry(pool.id, slot, slot % 2 === 0 ? "youji" : "gakudo", coach.id);
      break;
    }
  }
  // 育った子を上のクラスへ上げる（プレイヤーの手を模す）。選手まで届くかを見る。
  for (const c of [...CLASS_ORDER].reverse()) {
    const arr = [...stB.students[c.id]].sort((a, b) => b.stats.form - a.stats.form);
    for (const s of arr.slice(0, 2)) stB.promoteStudent(s);
  }
  rowsB.push(...runMonths(stB, clockB, 1));
}
table("B. 毎月ひとつ投資する2年（余裕があれば部屋を建て、空きコマを開講）", rowsB);
console.log(`  建てたもの: ${buyLog.join("、") || "（なし）"}`);

console.log("\n  --- 判定 ---");
const brokeB = rowsB.findIndex((r) => r.unpaid > 0);
warn(brokeB >= 0, "投資しても破綻しない", brokeB >= 0 ? `${brokeB + 1}ヶ月目に未払い` : "24ヶ月とも支払える");
warn(buyLog.length < 4, "2年で何度か投資できる", `${buyLog.length}件`);
warn(
  rowsB[rowsB.length - 1].members < 40,
  "2年で規模が育つ",
  `${rowsB[rowsB.length - 1].members}人（定員 ${rowsB[rowsB.length - 1].capacity}）`,
);
warn(
  rowsB[rowsB.length - 1].athletes === 0,
  "選手クラスまで育つ導線がある",
  `選手・プロ ${rowsB[rowsB.length - 1].athletes}人`,
);

// 2年ぶん遊んだあとの名簿に、同じ人が二重に入っていないこと
// （入会・昇格・退会・年度更新をひととおり通した状態で確かめる）
{
  const seen = new Map<number, string>();
  const dup: string[] = [];
  for (const c of CLASS_ORDER) {
    for (const s of stB.students[c.id]) {
      const before = seen.get(s.id);
      if (before) dup.push(`${s.name}(${before}と${c.id})`);
      else seen.set(s.id, c.id);
    }
  }
  warn(dup.length > 0, "名簿に同じ人が二重に入らない", dup.length > 0 ? dup.slice(0, 3).join("、") : `${seen.size}人`);
}

// 同じ時間に複数のプールを回しても、画面に出る顔ぶれは重複しない
{
  let worstDup = 0;
  let busiest = 0;
  for (let m = 0; m < 24 * 60; m += 10) {
    const ids = stB.lineupAt(m).flatMap((l) => l.members.map((s) => s.id));
    worstDup = Math.max(worstDup, ids.length - new Set(ids).size);
    busiest = Math.max(busiest, ids.length);
  }
  warn(worstDup > 0, "同じ時刻に同じ選手が2箇所に出ない", `重複${worstDup}件（最大同時 ${busiest}人）`);
}

// ------------------------------------------------------------------ C. 個別の値ざんしょう

console.log("\n=== C. 個別のバランス ===");

// 初期資金で何が買えるか
const stC = new GameState(rng(303));
const affordable = (["studio", "gym", "pool6", "dorm", "entrance"] as EquipmentKind[])
  .filter((k) => stC.equipmentCost(k) <= START.gems)
  .map((k) => equipmentDef(k).label);
warn(affordable.length === 0, "開始直後に買えるものがある", affordable.join("、") || "なし");

/**
 * 一般客の売上。
 *
 * 【2026-09-24 に位置づけを変えた】以前は「月謝を補う副収入」に収める前提だったが、
 * 人気度で来場が増えるようにしたので、**設備を開放して稼ぐのは正しい戦略**になった
 *（ユーザー指定：賑わいのため目に見えるくらい多く／施設利用で収入が増える）。
 * 見るのは「月謝を完全に食ってしまっていないか」＝3倍を超えていないか。
 * 超えるなら、育成そっちのけで開放するのが最善手になっている合図。
 */
const guestShare = rowsB.map((r) => (r.income > 0 ? r.guest / r.income : 0));
const maxShare = Math.max(...guestShare);
warn(
  maxShare > 3,
  "一般客の売上が月謝を食い尽くしていない",
  `最大 ${Math.round(maxShare * 100)}%（月謝比）`,
);
const lastB = rowsB[rowsB.length - 1];
warn(
  lastB.gems > 60_000,
  "終盤にお金が余りすぎない",
  `2年後 ◆${lastB.gems}`,
);

// 寮とスカウト
//
// 【条件が逆だった】warn は「条件が真＝気になる」なので、
// `scoutCost > START.gems`（＝手が届かない）で警告が出る書き方になっていた。
// 見たいのはその逆で「初期資金でいきなりスカウトできてしまわないか」。
// 寮を大型施設（◆100万）に上げてスカウト費も◆2400にしたところで露見した（2026-09-18）。
warn(
  DORM.scoutCost <= START.gems,
  "遠方スカウトは序盤には手が届かない（中盤の目標になる）",
  `寮◆${equipmentDef("dorm").cost} + スカウト◆${DORM.scoutCost}（初期資金◆${START.gems}）`,
);


console.log(`\n${warnings === 0 ? "気になる点なし" : `${warnings}件の気になる点`}`);
