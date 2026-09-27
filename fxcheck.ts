/// <reference types="node" />
/**
 * 練習中の数字表示・一般客の満足マークの検証。
 *
 *   1. 練習の「+1」は**育成パネルの整数が繰り上がった瞬間**に出るか
 *      （スクール生も、泳いでいる間にちゃんと出る回数になっているか）
 *   2. 出過ぎて重くならないか（1コマあたりの回数）
 *   3. 満足した客のマークと口コミ（確率・月の上限・人気度の増え方）
 *
 * 実行:
 *   npx esbuild fxcheck.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState } from "./src/sim/state";
import { AUTONOMY, CHATTER, CLOCK, DAYTIME, GROWTH_FX, GUESTS, POPULARITY, SATISFACTION } from "./src/config/balance";
import {
  applyMood,
  averageMood,
  guestContribution,
  guestSatisfaction,
  moodLabel,
  moodStars,
  relaxMood,
  type GuestVisitContext,
} from "./src/sim/satisfaction";
import { CHATTER_LINES, chatterSituationOf, makeChatter } from "./src/sim/chatter";
import { ambientAt, crowdFactorAt, phaseAt, veilAlphas } from "./src/sim/daytime";
import { emptyGuestMonthly, guestAverageMood, guestPopularityDelta } from "./src/sim/guests";
import {
  enrollPopularity,
  guestDemandOf,
  passivePopularityFactor,
  popularityGaugeGoal,
  talentPopularity,
} from "./src/sim/popularity";
import { STAT_KEYS, type StatKey, type Student } from "./src/sim/student";
import { CLASS_ORDER } from "./src/sim/classes";
import { fatigueLevelOf } from "./src/gfx/FatigueMark";
import {
  staminaLevelOf,
  staminaOf,
  STAMINA_COLOR,
  STAMINA_LABEL,
  STAMINA_NOTE,
  STAMINA_ORDER,
} from "./src/sim/stamina";
import { FATIGUE_MARK } from "./src/config/balance";
import {
  approachCells,
  buildingWallEdges,
  entranceDoorCells,
  floorKindAt,
  visitRoute,
} from "./src/iso/facility";
import { canPlaceAt, landBounds } from "./src/sim/clubMap";
import { equipmentDef, footprintOf, isPool, ROOM_ORDER } from "./src/sim/equipment";

let seed = 20260817;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const line = (s: string): void => console.log(s);
let failures = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  if (!ok) failures++;
  line(`${ok ? "  ok " : "  NG "} ${name}${extra ? "  — " + extra : ""}`);
};

/** 画面側と同じ判定（FacilityScene.showGain）。 */
const shownAmount = (s: Student, key: StatKey, amount: number): number => {
  const after = s.stats[key];
  return Math.floor(after) - Math.floor(after - amount);
};

const SLOT_MIN = 75;

// ================================================================ 1. 練習の数字
line("\n=== 1. 練習で上がった数字が出るか ===");
{
  const st = new GameState(rand, { clubName: "演出チェックSC" });
  for (const cls of ["youji", "gakudo"] as const) {
    const members = st.students[cls] ?? [];
    if (members.length === 0) continue;

    const before = members.map((s) => ({ ...s.stats }));
    const seen = new Map<StatKey, number>();
    let popups = 0;
    st.tickPractice(cls, SLOT_MIN, (s, key, amount) => {
      const n = shownAmount(s, key, amount);
      if (n <= 0) return;
      popups += 1;
      seen.set(key, (seen.get(key) ?? 0) + n);
    }, members);

    // 出た数字の合計 = 実際に繰り上がった整数の合計、になっているか（1コマぶん）
    let realCarry = 0;
    members.forEach((s, i) => {
      for (const k of STAT_KEYS) realCarry += Math.floor(s.stats[k]) - Math.floor(before[i][k]);
    });
    const shownTotal = [...seen.values()].reduce((a, b) => a + b, 0);
    check(`${cls}: 出た数字の合計＝実際の繰り上がり`, shownTotal === realCarry, `${shownTotal} / ${realCarry}`);
    check(`${cls}: 1コマで数字が出る`, popups > 0, `${popups}回`);
    // 【色の変化は3コマぶんで見る】スクールはフォームに寄せてあるうえ伸びがゆっくりなので、
    // 1コマだと整数をまたぐのがフォームだけ、ということが起きる（→ CLASS_FOCUS）。
    // 出た数字が正しいかは1コマで確かめ、色が代わる代わる出るかは少し長く見る。
    const kinds = new Set<StatKey>(seen.keys());
    for (let slot = 0; slot < 2; slot++) {
      st.tickPractice(cls, SLOT_MIN, (s, key, amount) => {
        if (shownAmount(s, key, amount) > 0) kinds.add(key);
      }, members);
    }
    check(`${cls}: 複数の能力が出る（色が代わる代わる）`, kinds.size >= 2, `${kinds.size}種類`);

    // 出過ぎないかは**1コマぶん**で見る（上の追加ぶんは popups に数えていない）
    const realSec = (SLOT_MIN * CLOCK.msPerMinute) / 1000;
    const perSec4x = (popups / realSec) * 4;
    check(`${cls}: 出過ぎない（4倍速でも毎秒6回以下）`, perSec4x <= 6, `4倍で ${perSec4x.toFixed(1)}回/秒`);
  }
}

// ================================================================ 2. 育成クラスも出る
line("\n=== 2. 育成B以上でも同じ仕組みで出るか ===");
{
  const st = new GameState(rand, { clubName: "演出チェックSC2" });
  // 育成Bに何人か上げる（スクールからの昇格）
  const pool = [...(st.students.gakudo ?? [])].slice(0, 6);
  for (const s of pool) st.promoteStudent(s);
  const members = st.students.ikuseiB ?? [];
  check("育成Bに選手がいる", members.length > 0, `${members.length}人`);
  if (members.length > 0) {
    let popups = 0;
    let total = 0;
    // 数コマぶん回す（1コマの上昇は小さいので、繰り上がるまで見る）
    for (let i = 0; i < 8; i++) {
      st.tickPractice("ikuseiB", SLOT_MIN, (s, key, amount) => {
        const n = shownAmount(s, key, amount);
        if (n > 0) {
          popups += 1;
          total += n;
        }
      }, members);
    }
    check("育成Bでも数字が出る", popups > 0, `8コマで ${popups}回 / 合計 +${total}`);
  }
}

/** ふつうの客1人ぶんの来場（混雑なし・小さい部屋・ゆっくりできない）。 */
const plainVisit = (over: Partial<GuestVisitContext> = {}): GuestVisitContext => ({
  crowded: false,
  turnedAway: false,
  grade: 1,
  relaxing: false,
  extraStop: false,
  ...over,
});

// ================================================================ 3. 満足マークと口コミ
line("\n=== 3. 満足した客のマークと口コミ ===");
{
  const st = new GameState(rand, { clubName: "演出チェックSC3" });
  const pop0 = st.popularity;
  const N = 4000;
  let marks = 0;
  let ups = 0;
  for (let i = 0; i < N; i++) {
    const r = st.noteGuestSatisfied(plainVisit());
    if (r.mark) marks += 1;
    if (r.popularity) ups += 1;
  }
  const markRate = marks / N;
  check(
    "マークの出る割合が config どおり",
    Math.abs(markRate - GUESTS.joyMarkChance) < 0.05,
    `${(markRate * 100).toFixed(1)}% / 設定 ${(GUESTS.joyMarkChance * 100).toFixed(0)}%`,
  );
  check("人気度が上がるのはマークが出たときだけ", ups <= marks, `${ups} / ${marks}`);
  check(
    "1ヶ月の上限で止まる",
    ups === GUESTS.wordOfMouthMaxPerMonth,
    `${ups} 件（上限 ${GUESTS.wordOfMouthMaxPerMonth}）`,
  );
  check("上がったぶんだけ人気度が増えている", st.popularity - pop0 === ups, `+${st.popularity - pop0}`);
  check("月次レポート用の集計にも入っている", st.guestMonth.wordOfMouth === ups, `${st.guestMonth.wordOfMouth}`);

  // 上限は月がかわるとリセットされる
  st.advanceMonth();
  check("月がかわると上限がリセットされる", st.guestMonth.wordOfMouth === 0);
  const before = st.popularity;
  let ups2 = 0;
  for (let i = 0; i < 2000; i++) if (st.noteGuestSatisfied(plainVisit()).popularity) ups2 += 1;
  check("翌月はまた上がる", ups2 > 0 && st.popularity > before, `+${ups2}`);

  // 人気度に上限は無い（以前の上限 999 を超えても、そのまま足される）
  st.addPopularity(POPULARITY.softKnee);
  const high = st.popularity;
  const added = st.addPopularity(5000);
  check(
    "人気度は以前の上限（999）を超えても伸びる",
    high > POPULARITY.softKnee && added === 5000,
    `${Math.round(high)} → ${Math.round(st.popularity)}`,
  );
  check("人気度は0より下がらない", st.addPopularity(-1e9) < 0 && st.popularity === 0);
}

// ================================================================ 4. 1ヶ月あたりの伸び
line("\n=== 4. 口コミで人気度が急騰しないか ===");
{
  // 満足して帰る客の人数を、来場の実測（1日あたり）から見積もる
  const st = new GameState(rand, { clubName: "演出チェックSC4" });
  st.gems += 500_000;
  st.buyEquipment("gym");
  st.buyEquipment("studio");
  st.addPopularity(600);
  let served = 0;
  for (let m = 8 * 60; m < 20 * 60; m++) {
    for (const a of st.tickGuests(m, 1)) if (!a.turnedAway) served += 1;
  }
  // 1ヶ月＝4週（1週＝1日ぶん進む）
  const perMonth = served * 4;
  const est = perMonth * GUESTS.joyMarkChance * GUESTS.wordOfMouthChance;
  const capped = Math.min(est, GUESTS.wordOfMouthMaxPerMonth);
  check(
    "見込みが月の上限に収まる",
    capped <= GUESTS.wordOfMouthMaxPerMonth,
    `満足${perMonth}人/月 → 口コミ ${est.toFixed(1)} → 実際は最大 ${capped.toFixed(1)}`,
  );
  check(
    "月末の集計（既存）と合わせても人気度の振れ幅が常識的",
    GUESTS.wordOfMouthMaxPerMonth + GUESTS.popularitySwingMax < POPULARITY.softKnee / 8,
    `口コミ${GUESTS.wordOfMouthMaxPerMonth} + 満足度${GUESTS.popularitySwingMax} < ${Math.round(POPULARITY.softKnee / 8)}`,
  );
}

// ================================================================ 4b. 人気度は上限なし
line("\n=== 4b. 人気度は上限なく伸び、一般客も増え続ける ===");
{
  const knee = POPULARITY.softKnee;
  check("999 までは入会への効き目が以前と同じ", enrollPopularity(500) === 500 && enrollPopularity(knee) === knee);
  check(
    "999 を超えたぶんは緩やかに効く",
    Math.abs(enrollPopularity(knee + 1000) - (knee + 1000 * POPULARITY.softSlope)) < 1e-9,
    enrollPopularity(knee + 1000).toFixed(0),
  );
  /**
   * 【一般客は人気度で目に見えて増える】（2026-09-24）
   * 来場の倍率は 1 + 人気度(効き目) / demandPerFactor。
   * demandPerFactor を 300 → 110 にしたので、同じ人気度でも3倍近く来る
   *（賑わいは見えるほうがよい、というユーザー判断）。
   * ここでは式のとおりに出ていることだけを見る（数値は config で動かせる）。
   */
  const expectKnee = 1 + GUESTS.demandKnee / GUESTS.demandPerFactor;
  check(
    "来場倍率は「1 + 人気度 / demandPerFactor」",
    Math.abs(guestDemandOf(GUESTS.demandKnee) - expectKnee) < 1e-9,
    `人気度${GUESTS.demandKnee} で ${guestDemandOf(GUESTS.demandKnee).toFixed(2)}倍`,
  );
  check(
    "人気度100でもはっきり増える（1.5倍以上）",
    guestDemandOf(100) >= 1.5,
    `${guestDemandOf(100).toFixed(2)}倍`,
  );
  const pops = [0, 100, 660, 1000, 3000, 10000, 50000];
  const demands = pops.map((p) => guestDemandOf(p));
  check(
    "人気度が上がるほど一般客は増え続ける（頭打ちにならない）",
    demands.every((d, i) => i === 0 || d > demands[i - 1]),
    demands.map((d) => d.toFixed(1)).join(" → "),
  );
  check(
    "放っておいて増える人気度は、高くても0にならない",
    passivePopularityFactor(50000) === POPULARITY.passiveFloor && POPULARITY.passiveFloor > 0,
  );
  check(
    "999 までの伸びにくさは以前と同じ",
    Math.abs(passivePopularityFactor(500) - (1 - POPULARITY.passiveFalloff * (500 / knee))) < 1e-9,
  );
  check("才能ある子の出やすさは 999 ぶんで打ち止め", talentPopularity(50000) === knee && talentPopularity(300) === 300);

  const st = new GameState(rand, { clubName: "人気度チェック" });
  st.addPopularity(knee - st.popularity);
  const enroll999 = st.enrollMultiplier();
  const guest999 = st.guestDemandMultiplier();
  st.addPopularity(3000);
  check(
    "人気度3999でも入会の集客倍率は伸びる（有限）",
    Number.isFinite(st.enrollMultiplier()) && st.enrollMultiplier() > enroll999,
    `${enroll999.toFixed(1)} → ${st.enrollMultiplier().toFixed(1)}`,
  );
  check(
    "人気度3999で一般客の来場倍率が以前の上限3.2を超える",
    st.guestDemandMultiplier() > 3.2 && st.guestDemandMultiplier() > guest999,
    `${guest999.toFixed(2)} → ${st.guestDemandMultiplier().toFixed(2)}`,
  );

  const full = { ...emptyGuestMonthly(), turnedAway: 40, crowded: 40 };
  const lost = { ...emptyGuestMonthly(), turnedAway: 40, lockedOut: 40 };
  check("満員で入れなかった客は人気度を下げない", guestPopularityDelta(full) === 0);
  check("歩いて行けずに帰った客は人気度を下げる", guestPopularityDelta(lost) < 0, `${guestPopularityDelta(lost)}`);

  const goals: [number, number][] = [
    [0, 100],
    [99, 100],
    [100, 250],
    [999, 1000],
    [1000, 2000],
    [12000, 20000],
    [50000, 80000],
  ];
  check(
    "人気度ゲージの目標は超えるたびに先へ進む",
    goals.every(([p, g]) => popularityGaugeGoal(p) === g),
    goals.map(([p]) => `${p}→${popularityGaugeGoal(p)}`).join(" "),
  );
}

// ================================================================ 5. 伸びの「▲」
line("\n=== 5. 伸びを▲で見せる（数字が出ない間も分かるか） ===");
{
  const st = new GameState(rand, { clubName: "演出チェックSC5" });
  for (const cls of ["youji", "gakudo"] as const) {
    const members = st.students[cls] ?? [];
    if (members.length === 0) continue;
    const acc = new Map<string, number>();
    let ticks = 0;
    st.tickPractice(cls, SLOT_MIN, (s, key, amount) => {
      const k = `${s.id}:${key}`;
      const a = (acc.get(k) ?? 0) + amount;
      if (a >= GROWTH_FX.tickStep) {
        ticks += 1;
        acc.set(k, a % GROWTH_FX.tickStep);
      } else acc.set(k, a);
    }, members);
    const realSec = (SLOT_MIN * CLOCK.msPerMinute) / 1000;
    check(`${cls}: 1コマで▲が何度も出る`, ticks >= members.length, `${ticks}回`);
    check(
      `${cls}: 出過ぎない（4倍速で毎秒30回以下）`,
      (ticks / realSec) * 4 <= 30,
      `4倍で ${((ticks / realSec) * 4).toFixed(1)}回/秒`,
    );
  }
  check("▲の刻みが1未満（数字より細かい）", GROWTH_FX.tickStep > 0 && GROWTH_FX.tickStep < 1, `${GROWTH_FX.tickStep}`);
}

// ================================================================ 6. 更衣室・入口・廃止した設備
line("\n=== 6. プールへは必ず更衣室を通る／入口は塀ぎわに置ける ===");
{
  const st = new GameState(rand, { clubName: "動線チェックSC" });
  const map = st.map();
  const usable = st.usableRoomIds();
  const pool = st.equipment.find((e) => isPool(e.kind))!;
  const route = visitRoute(map, pool, { suit: true });
  check("プールへの道順が引ける", !!route, `${route?.length ?? 0}地点`);
  check("途中で必ず水着に着替える（更衣室を通る）", !!route && route.some((w) => w.change === "suit"));

  // 入口は敷地の四辺のどこでも置ける（塀ぎわ）。内側は置けない。
  const b = landBounds(map);
  const ent = st.equipment.find((e) => e.kind === "entrance")!;
  // 入口の大きさ（3×2）ぶんを内側へ寄せた位置が「塀ぎわ」
  const f = footprintOf("entrance");
  const sides: [string, number, number][] = [
    ["南", b.x0 + 3, b.y1 - f.h + 1],
    ["北", b.x0 + 3, b.y0],
    ["西", b.x0, b.y0 + 3],
    ["東", b.x1 - f.w + 1, b.y0 + 3],
  ];
  for (const [name, gx, gy] of sides) {
    check(`入口を${name}の塀ぎわに置ける`, canPlaceAt(map, "entrance", gx, gy, ent.id).ok, `(${gx},${gy})`);
  }
  check("入口を敷地の内側には置けない", !canPlaceAt(map, "entrance", b.x0 + 4, b.y0 + 4, ent.id).ok);

  // 廃止したもの
  check("受付という部屋がもう無い", !(ROOM_ORDER as readonly string[]).includes("reception"));
  check("初期配置に受付がない", !st.equipment.some((e) => (e.kind as string) === "reception"));
  check("受付スタッフの固定費が0", st.staffSalary() === 0);
}

// ================================================================ 7. 玄関と施設パネル
line("\n=== 7. 玄関（道→車寄せ→自動ドア→フロント）と施設の説明 ===");
{
  const st = new GameState(rand, { clubName: "玄関チェックSC" });
  const map = st.map();
  const b = landBounds(map);
  const gate = st.equipment.find((e) => e.kind === "entrance")!;
  const f = footprintOf("entrance");

  check("入口が敷地の縁（塀ぎわ）に接している", (gate.gy as number) + f.h - 1 === b.y1, `y${gate.gy}`);

  const doors = entranceDoorCells(map);
  check("自動ドアが入口の幅ぶんある", doors.length === f.w, `${doors.length}枚`);
  check(
    "ドアは入口の**外向きの辺**にある（部屋の中ではない）",
    doors.every((d) => d.cell.gy === (gate.gy as number) + f.h),
  );

  const app = approachCells(map);
  check("入口の前に車寄せがある", app.length === f.w * 2, `${app.length}マス`);
  check(
    "車寄せは敷地の外（建物の中を舗装しない）",
    app.every((c) => c.gy > b.y1),
  );
  check(
    "車寄せの床が歩道と別扱いになっている",
    app.every((c) => floorKindAt(map, c.gx, c.gy) === "approach"),
  );

  // 外壁は「ドアのところだけ」開ける
  const walls = buildingWallEdges(map);
  const doorKeys = new Set(doors.map((d) => `${d.dir}:${d.cell.gx},${d.cell.gy}`));
  check(
    "外壁はドアの位置だけ開いている",
    walls.every((w) => !doorKeys.has(`${w.dir}:${w.gx},${w.gy}`)),
  );
  check("玄関以外の外壁は閉じたまま", walls.length > 40, `${walls.length}枚`);

  // 入退館の道順は入口の位置から引かれる（座標を変えても追従する）
  const usable = st.usableRoomIds();
  const pool2 = st.equipment.find((e) => isPool(e.kind))!;
  const route = visitRoute(map, pool2, { suit: true });
  check("入館の道順が入口の外から始まる", !!route && route[0].gy > b.y1 - f.h, `${route?.[0]?.gy}`);

  // 施設の説明（マスタ側に持たせる）
  const missing = (ROOM_ORDER as readonly string[]).filter((k) => {
    const d = equipmentDef(k as never).description;
    return !d || d.length < 6;
  });
  check("全ての部屋に説明文がある", missing.length === 0, missing.join(",") || "16種");
}


// ================================================================ 7. 吹き出し（セリフ・気持ち）
line("\n=== 7. 吹き出し（セリフ・気持ち） ===");
{
  // データ表：状況が増えてもセリフの入れ忘れが無いこと
  const empty = Object.entries(CHATTER_LINES).filter(([, v]) => v.length === 0);
  check("すべての状況にセリフがある", empty.length === 0, empty.map(([k]) => k).join(",") || `${Object.keys(CHATTER_LINES).length}種`);
  const longest = Object.values(CHATTER_LINES)
    .flat()
    .reduce((a, b) => (a.length >= b.length ? a : b), "");
  check("セリフが長すぎない（吹き出しが施設を隠さない）", longest.length <= 12, `最長 ${longest.length}文字「${longest}」`);

  // 状況は「行動 × 体力・機嫌」で規則的に決まる
  check("元気なうちの練習は前向きな言葉", chatterSituationOf("swim", { energy01: 1 }) === "swim");
  check("疲れてきたら「きつい」側になる", chatterSituationOf("swim", { energy01: 0.2 }) === "swimHard");
  check("器具の練習も同じ規則", chatterSituationOf("train", { energy01: 0.2 }) === "trainHard");
  check("機嫌が良い客は「また来よう」", chatterSituationOf("leave", { mood: 90 }) === "satisfied");
  check("機嫌が悪い客は不満をこぼす", chatterSituationOf("leave", { mood: 10 }) === "unsatisfied");
  check("風呂とサウナは別の言葉", chatterSituationOf("bath", {}) === "bath" && chatterSituationOf("sauna", {}) === "sauna");
  check("売店では食べている言葉", CHATTER_LINES.meal.includes("もぐもぐ"));
  check("泳いだあとは「はぁ…」", CHATTER_LINES.afterSwim.includes("はぁ…"));
  check("伸びたときの言葉がある", CHATTER_LINES.grew.includes("うまくなった気がする"));

  // 実際に組み立てられるか（全部の行動で必ず1つ出る）
  const acts = [
    "walk", "wait", "arrive", "swim", "train", "afterSwim", "bath", "sauna",
    "meal", "leave", "grew", "coaching", "cleaning", "research", "deskwork",
  ] as const;
  const bad = acts.filter((a) => !makeChatter(a, {}, () => 0.5));
  check("どの行動でも吹き出しを作れる", bad.length === 0, bad.join(",") || `${acts.length}種`);

  // 出しすぎない設定になっているか（1分あたりの本数の目安）
  const perMinute = (60 / CHATTER.intervalSec) * CHATTER.chance;
  check("出しすぎない（毎分およそ40本以下）", perMinute <= 40, `毎分 ${perMinute.toFixed(0)}本`);
  check("同時に出る数に上限がある", CHATTER.maxConcurrent <= 6, `${CHATTER.maxConcurrent}個`);
  check("同じ人が続けてしゃべらない", CHATTER.perPersonCooldownSec >= CHATTER.lifeSec * 3, `${CHATTER.perPersonCooldownSec}秒`);
}

// ================================================================ 8. 満足度（機嫌）
line("\n=== 8. 満足度（機嫌） ===");
{
  // 選手：良いことで上がり、悪いことで下がる
  const s = { mood: SATISFACTION.baseline };
  const up = applyMood(s, "recovered");
  check("良い設備を使えたら上がる", up > 0 && s.mood > SATISFACTION.baseline, `+${up.toFixed(1)}`);
  const down = applyMood(s, "gaveUpRecovery");
  check("混んでいて諦めたら下がる", down < 0, `${down.toFixed(1)}`);
  const worst = { mood: 0 };
  applyMood(worst, "gaveUpRecovery");
  check("0を下回らない", worst.mood === 0);
  const best = { mood: 100 };
  applyMood(best, "win");
  check("100を超えない", best.mood === 100);

  // 何もなければ「ふつう」へ戻る
  const high = { mood: 100 };
  for (let i = 0; i < 30; i++) relaxMood(high);
  check("放っておけば基準値へ戻る", Math.abs(high.mood - SATISFACTION.baseline) < 1, `${high.mood.toFixed(1)}`);
  const low = { mood: 0 };
  for (let i = 0; i < 30; i++) relaxMood(low);
  check("落ち込んでいても戻ってくる", Math.abs(low.mood - SATISFACTION.baseline) < 1, `${low.mood.toFixed(1)}`);

  // ★ゲージの目盛り
  check("満足度100で★が満タン", Math.abs(moodStars(100) - SATISFACTION.starCount) < 0.001);
  check("満足度0で★が空", moodStars(0) === 0);
  check("呼び名が5段階そろっている", new Set(SATISFACTION.tiers.map((t) => t.label)).size === 5, moodLabel(100));

  // 一般客：良い設備・空いている・ゆっくりできる ほど満足する
  const plain = guestSatisfaction(plainVisit());
  const crowded = guestSatisfaction(plainVisit({ crowded: true }));
  const bigRoom = guestSatisfaction(plainVisit({ grade: 3 }));
  const relaxed = guestSatisfaction(plainVisit({ relaxing: true, grade: 3 }));
  check("混んでいると満足度が下がる", crowded < plain, `${crowded.toFixed(0)} < ${plain.toFixed(0)}`);
  check("良い設備ほど満足度が上がる", bigRoom > plain, `${bigRoom.toFixed(0)} > ${plain.toFixed(0)}`);
  check("ゆっくりできるとさらに上がる", relaxed > bigRoom, `${relaxed.toFixed(0)} > ${bigRoom.toFixed(0)}`);
  check("売店に寄れると少し上がる", guestSatisfaction(plainVisit({ extraStop: true })) > plain);
  check("入れずに帰る客はほとんど満足していない", guestSatisfaction(plainVisit({ turnedAway: true })) < 20);

  // 貢献値（画面の `+9`）
  check("満足度が高いほど貢献値が大きい", guestContribution(relaxed) > guestContribution(plain), `${guestContribution(relaxed)} > ${guestContribution(plain)}`);
  check("満足度が低い客は貢献しない", guestContribution(20) === 0);
  check("貢献値は上限で頭打ち", guestContribution(100) <= SATISFACTION.guest.contributionMax, `${guestContribution(100)}`);
  check("ふつうの客の貢献値が1桁におさまる", guestContribution(plain) >= 1 && guestContribution(plain) < 10, `+${guestContribution(plain)}`);

  // 月末：貢献値がそのまま人気度になる（満足した客が多いほど伸びる）
  const good = emptyGuestMonthly();
  const poor = emptyGuestMonthly();
  for (let i = 0; i < 80; i++) {
    good.served += 1;
    good.contribution += guestContribution(relaxed);
    good.moodSum += relaxed;
    good.moodCount += 1;
    poor.served += 1;
    poor.contribution += guestContribution(crowded);
    poor.moodSum += crowded;
    poor.moodCount += 1;
  }
  check(
    "満足した客が多い月ほど人気度が伸びる",
    guestPopularityDelta(good) > guestPopularityDelta(poor),
    `+${guestPopularityDelta(good)} vs +${guestPopularityDelta(poor)}`,
  );
  check("1ヶ月の振れ幅に上限がある", guestPopularityDelta(good) <= GUESTS.popularitySwingMax, `+${guestPopularityDelta(good)}`);
  // 人気度を下げるのは「歩いて行けずに帰った客」だけ（満員で帰った客は人気の裏返しなので下げない → 4b）
  const turned = emptyGuestMonthly();
  turned.turnedAway = 200;
  turned.lockedOut = 200;
  check("歩いて行けずに帰る客が続くと人気度が下がる", guestPopularityDelta(turned) < 0, `${guestPopularityDelta(turned)}`);
  check("平均満足度を出せる", Math.abs((guestAverageMood(good) ?? 0) - relaxed) < 0.01);
  check("客が0人なら平均は無い", guestAverageMood(emptyGuestMonthly()) === null);

  // クラブ全体（HUD の★）
  check("平均が取れる", Math.abs(averageMood([{ mood: 40 }, { mood: 60 }]) - 50) < 0.001);
  check("誰もいなければ基準値", averageMood([]) === SATISFACTION.baseline);
}

// ================================================================ 9. 満足度が実際のプレイで動くか
line("\n=== 9. 満足度が実際のプレイで動くか ===");
{
  const st = new GameState(rand, { clubName: "満足度チェックSC" });
  const before = st.clubMood();
  check("新規クラブの機嫌は「ふつう」から", Math.abs(before - SATISFACTION.baseline) < 0.01, `${before.toFixed(0)}`);

  // 回復設備が1つも無いクラブで練習を終えると機嫌が落ちる
  const cls = "gakudo" as const;
  const members = st.students[cls];
  check("学童に生徒がいる", members.length > 0, `${members.length}人`);
  for (const s of members) s.energy = 5; // 疲れきった状態
  st.beginClassSession(cls, members, 0);
  st.endClassSession(cls, members);
  const tired = averageMood(members);
  check("疲れきって終わると機嫌が下がる", tired < SATISFACTION.baseline, `${tired.toFixed(0)}`);

  // 一晩たてば戻ってくる
  for (let i = 0; i < 12; i++) st.onDayRoll();
  check("日をまたぐと機嫌が戻る", averageMood(members) > tired, `${averageMood(members).toFixed(0)}`);

  // 休養させると上がる
  const one = members[0];
  const m0 = one.mood;
  st.restStudent(one);
  check("休養させると機嫌が上がる", one.mood > m0, `${m0.toFixed(0)} → ${one.mood.toFixed(0)}`);

  // ケガは大きく落ち込む
  const m1 = one.mood;
  one.injuryDays = 10;
  st.onDayRoll();
  check("ケガをしていると落ち込む", one.mood < m1, `${m1.toFixed(0)} → ${one.mood.toFixed(0)}`);
}

// ================================================================ 10. 時間帯（朝・昼・夕・夜）
line("\n=== 10. 時間帯（朝・昼・夕・夜） ===");
{
  const at = (h: number, m = 0): number => h * 60 + m;
  check("朝・昼・夕・夜が順に来る", phaseAt(at(9)) === "morning" && phaseAt(at(12)) === "noon" && phaseAt(at(17)) === "evening" && phaseAt(at(21)) === "night");

  const noon = ambientAt(at(12));
  const evening = ambientAt(at(18));
  const night = ambientAt(at(20));
  const morning = ambientAt(at(8));
  check("昼は色を重ねない（そのままの明るさ）", noon.alpha < 0.02, `${noon.alpha.toFixed(2)}`);
  check("夕方は色が乗る", evening.alpha > noon.alpha, `${evening.alpha.toFixed(2)}`);
  check("夜がいちばん暗い", night.alpha > evening.alpha, `${night.alpha.toFixed(2)}`);
  check("朝も少しだけ色が乗る", morning.alpha > noon.alpha, `${morning.alpha.toFixed(2)}`);
  check("暗くしすぎない（施設が見えなくなる手前）", night.alpha <= 0.5, `${night.alpha.toFixed(2)}`);
  check("昼は照明が消えている", noon.light < 0.02);
  check("夜は照明が点く", night.light > 0.8, `${night.light.toFixed(2)}`);
  check("夕方に照明が灯り始める", evening.light > 0 && evening.light < night.light, `${evening.light.toFixed(2)}`);
  check("時間帯のしるしが出る", night.icon === "🌙" && noon.icon === "☀", `${night.icon}/${noon.icon}`);
  // 色は連続に変わる（1分ごとに飛ばない）
  let maxJump = 0;
  for (let m = at(8); m < at(20); m++) maxJump = Math.max(maxJump, Math.abs(ambientAt(m + 1).alpha - ambientAt(m).alpha));
  check("色の変化がなめらか（1分でパッと変わらない）", maxJump < 0.01, `最大 ${maxJump.toFixed(4)}/分`);

  // 賑わいのメリハリ
  const quiet = crowdFactorAt(at(13, 30));
  const afterSchool = crowdFactorAt(at(16, 30));
  const afterWork = crowdFactorAt(at(19));
  check("昼下がりは空く", quiet < 1, `×${quiet.toFixed(2)}`);
  check("放課後は混む", afterSchool > 1.2, `×${afterSchool.toFixed(2)}`);
  check("仕事帰りも混む", afterWork > 1.2, `×${afterWork.toFixed(2)}`);
  check("混む時間と空く時間で2倍以上の差がある", afterWork / quiet >= 2, `${(afterWork / quiet).toFixed(1)}倍`);
  check("倍率が極端になりすぎない", afterWork <= 2 && quiet >= 0.3, `${quiet.toFixed(2)}〜${afterWork.toFixed(2)}`);
}

// ================================================================ 11. 自律的な行動（生活感）
line("\n=== 11. 自律的な行動（生活感） ===");
{
  check("歩く速さにばらつきがある", AUTONOMY.walkSpeedJitter > 0 && AUTONOMY.walkSpeedJitter < 0.4, `±${(AUTONOMY.walkSpeedJitter * 100).toFixed(0)}%`);
  check("たまに立ち止まる（止まりすぎない）", AUTONOMY.pauseChance > 0 && AUTONOMY.pauseChance <= 0.2, `${(AUTONOMY.pauseChance * 100).toFixed(0)}%`);
  check("壁でひと息つく", AUTONOMY.wallRestChance > 0 && AUTONOMY.wallRestChance <= 0.25, `${(AUTONOMY.wallRestChance * 100).toFixed(0)}%`);
  check("客はときどき売店へ寄る", AUTONOMY.shopStopChance > 0 && AUTONOMY.shopStopChance < 0.5, `${(AUTONOMY.shopStopChance * 100).toFixed(0)}%`);
  check("立ち止まる時間は短い", AUTONOMY.pauseSec.max <= 3, `最大 ${AUTONOMY.pauseSec.max}秒`);

  // 来客が時間帯に応じて増減するか（実際に GameState を回して確かめる）。
  // 温浴施設はレッスンに関係なくいつでも開いているので、時間帯の効きだけを見るのに向く。
  const st = new GameState(rand, { clubName: "賑わいチェックSC" });
  st.gems += 5000;
  st.buyEquipment("bath");
  st.addPopularity(400);
  const open = st.guestRoomsNow(19 * 60).filter((r) => r.reachable).length;
  check("一般開放している部屋がある", open > 0, `${open}か所`);
  const countAt = (minute: number): number => {
    st.clearGuestOccupancy();
    let n = 0;
    // その時刻の来場ペースを測る（1分ずつ進めて、到着した人数を足す）。
    // 1コマぶんでは1人来るか来ないかなので、差がはっきり出る長さまで回す。
    for (let i = 0; i < 600; i++) n += st.tickGuests(minute, 1).length;
    return n;
  };
  const busyN = countAt(19 * 60);
  const quietN = countAt(13 * 60 + 30);
  check("混む時間のほうが客が多い", busyN > quietN, `${busyN}人 vs ${quietN}人`);
  check("空く時間でも誰も来ないわけではない", quietN > 0, `${quietN}人`);
}

void CLASS_ORDER;

line("\n=== 8b. 夜でも施設の中は明るい ===");
{
  const at = (h: number, m = 0): number => h * 60 + m;
  // 幕を1枚で画面ぜんぶに掛けると、照明が点いているはずの館内まで暗くなる。
  // 「敷地の中」と「外」で濃さを分け、外は今までどおり・中は薄く沈める。
  const night = ambientAt(at(20));
  const v = veilAlphas(night.alpha);
  check("夜の館内は外よりずっと明るい", v.inside < night.alpha * 0.5, `館内 ${v.inside.toFixed(3)} / 外 ${night.alpha.toFixed(3)}`);
  check("それでも真っ昼間ではない（時間帯の感じは残る）", v.inside > 0, `${v.inside.toFixed(3)}`);
  // 乗算で2枚重ねたとき、外はちょうど元の濃さになる
  const outside = 1 - (1 - v.inside) * (1 - v.extra);
  check("外の暗さは今までと同じ", Math.abs(outside - night.alpha) < 1e-6, `${outside.toFixed(4)} vs ${night.alpha.toFixed(4)}`);

  // 昼（幕なし）は両方とも0のまま＝余計な色が乗らない
  const noonV = veilAlphas(ambientAt(at(12)).alpha);
  check("昼はどちらの幕も出ない", noonV.inside === 0 && noonV.extra === 0);

  // 夕方も同じ関係が成り立つ
  const eve = ambientAt(at(18));
  const ev = veilAlphas(eve.alpha);
  check("夕方も館内のほうが明るい", ev.inside < eve.alpha);
  check(
    "夕方も外の暗さは変わらない",
    Math.abs(1 - (1 - ev.inside) * (1 - ev.extra) - eve.alpha) < 1e-6,
  );

  // 極端な値でも壊れない
  check("真っ暗（alpha=1）でも計算が壊れない", Number.isFinite(veilAlphas(1).extra));
  check("indoorDim=0 なら館内はまったく暗くならない", veilAlphas(0.4, 0).inside === 0);
  check("indoorDim=1 なら今までどおり画面ぜんぶ同じ", Math.abs(veilAlphas(0.4, 1).inside - 0.4) < 1e-9);
}


// ================================================================ 12. 疲れマークと体力の見せ方
line("\n=== 12. 頭上の疲れマークと、体力（スタミナ）の表示 ===");
{
  // --- 段階のさかいめ（config どおりか）
  check("元気なうちは印を出さない", fatigueLevelOf(1) === null && fatigueLevelOf(0.5) === null);
  check(
    `体力${Math.round(FATIGUE_MARK.tired * 100)}%以下で「疲れた」の印`,
    fatigueLevelOf(FATIGUE_MARK.tired) === "tired" && fatigueLevelOf(FATIGUE_MARK.tired + 0.01) === null,
  );
  check(
    `体力${Math.round(FATIGUE_MARK.exhausted * 100)}%以下で「もう限界」の印`,
    fatigueLevelOf(FATIGUE_MARK.exhausted) === "exhausted" &&
      fatigueLevelOf(FATIGUE_MARK.exhausted + 0.01) === "tired",
  );
  check("体力0でも印が消えない", fatigueLevelOf(0) === "exhausted");

  // --- パネル／カードの段階が、頭上の印と食い違わない
  // （印は出ているのにパネルは「元気」と言う、が起きないこと）
  check(
    "印が出る体力＝パネルでも疲れている側",
    staminaLevelOf(FATIGUE_MARK.tired) === "tired" && staminaLevelOf(FATIGUE_MARK.exhausted) === "empty",
  );
  check("印が出ない体力＝パネルでも元気側", staminaLevelOf(FATIGUE_MARK.tired + 0.01) === "warm");
  check("満タンは絶好調", staminaLevelOf(1) === "fresh" && staminaLevelOf(0.7) === "fine");

  // --- 段階は良い順に並んでいて、体力が減るほど悪い側へ動く
  let last = -1;
  let monotone = true;
  for (let r = 1; r >= 0; r -= 0.02) {
    const i = STAMINA_ORDER.indexOf(staminaLevelOf(r));
    if (i < last) monotone = false;
    last = i;
  }
  check("体力が減るほど段階が悪い側へ進む（戻らない）", monotone);
  check(
    "どの段階にも表示（言葉・色・ひとこと）がある",
    STAMINA_ORDER.every((l) => !!STAMINA_LABEL[l] && !!STAMINA_COLOR[l] && !!STAMINA_NOTE[l]),
  );

  // --- 実際の選手で見たときの値
  const st12 = new GameState(rand, { clubName: "疲れ" });
  const who = CLASS_ORDER.map((c) => st12.students[c.id][0]).find((x) => !!x)!;
  const full = staminaOf(who);
  check(
    "満タンの選手は 現在値＝最大値",
    Math.abs(full.value - full.max) < 0.01,
    `${Math.round(full.value)}/${Math.round(full.max)}`,
  );
  check("満タンの選手は絶好調", full.level === "fresh");
  who.energy = full.max * 0.2;
  const low = staminaOf(who);
  check("体力2割まで減らすと「疲れた」", low.level === "tired", `${Math.round(low.value)}/${Math.round(low.max)}`);
  check("そのとき頭上にも印が出る", fatigueLevelOf(low.ratio) === "tired");
  who.energy = 0;
  check("体力0は「もう限界」", staminaOf(who).level === "empty");
  check("そのとき頭上の印も強いほう", fatigueLevelOf(staminaOf(who).ratio) === "exhausted");

  // --- 出しすぎない（画面が印だらけにならない）
  check(
    "同時に出す印の数に上限がある",
    FATIGUE_MARK.maxMarks > 0 && FATIGUE_MARK.maxMarks <= 40,
    `${FATIGUE_MARK.maxMarks}人`,
  );
  check("印を選び直す間隔が空いている（毎フレーム数えない）", FATIGUE_MARK.refreshSec >= 0.2);
}

line(`\n${failures === 0 ? "全て通過" : `${failures} 件 失敗`}`);
process.exit(failures === 0 ? 0 : 1);
