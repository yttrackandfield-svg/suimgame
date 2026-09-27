/// <reference types="node" />
/**
 * 「今月の一手」（HUD の案内1行）と、注目選手（★）の検証。
 *
 * 決めごと：
 *   ・案内は**1度に1つだけ**。出す順番は「止まっていること」が先
 *   ・詰まっている状態（コーチ未配置・コマが無い）を必ず拾う
 *   ・行き先（go）が付いていて、押せば直せる画面へ飛べる
 *   ・1行に収まる長さ（長い名前でも折り返しが2行を超えない）
 *
 * 実行:
 *   npx esbuild advicecheck.ts --bundle --platform=node --format=esm \
 *     --alias:phaser=./tools/phaser-stub.mjs --outfile=<tmp>.mjs && node <tmp>.mjs
 */

import { GameState, PIN_MAX } from "./src/sim/state";
import { monthlyAdvice, adviceLine, type Advice } from "./src/sim/advice";
import { CLASS_ORDER } from "./src/sim/classes";
import { GAME_WIDTH } from "./src/config";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ok  ${label}${detail ? `  — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  NG  ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
function head(s: string): void {
  console.log(`\n=== ${s} ===`);
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function fresh(seed = 11): GameState {
  return new GameState(rng(seed), { clubName: "案内しらべ" });
}

/** 案内を1つ取る（週は固定でよい＝この関数は時計を知らない）。 */
function advise(st: GameState): Advice {
  const a = monthlyAdvice(st, "第2週");
  if (!a) throw new Error("案内が出ない");
  return a;
}

// ================================================================ 1. 詰まりを拾う
head("1. 止まっていることを先に出す");
{
  // ① プールが1つも使えない
  {
    const st = fresh();
    st.equipment = st.equipment.filter((e) => !["pool6", "pool8", "pool10"].includes(e.kind));
    const a = advise(st);
    ok(a.text.includes("プール"), "使えるプールが無いと真っ先に出る", a.text);
    ok(a.go === "shop", "行き先は設備・建設", `${a.go}`);
  }

  // ② コマが1つも開いていない
  {
    const st = fresh();
    st.timetable = [];
    const a = advise(st);
    ok(a.text.includes("コマが1つも無い"), "コマが無いと時間割を促す", a.text);
    ok(a.go === "timetable", "行き先は時間割", `${a.go}`);
  }

  // ③ コーチ未配置（そのコマは丸ごと走らない＝いちばん損が大きい）
  {
    const st = fresh();
    ok(st.timetable.length > 0, "はじめから時間割がある", `${st.timetable.length}コマ`);
    for (const e of st.timetable) e.coachId = null;
    const a = advise(st);
    ok(a.text.includes("コーチ"), "コーチの居ないコマを拾う", a.text);
    ok(a.go === "timetable", "行き先は時間割", `${a.go}`);
  }
}

// ================================================================ 2. 1つだけ出す
head("2. 一度に出すのは1つだけ");
{
  // ぜんぶ詰まらせても、返ってくるのは1件
  const st = fresh();
  st.timetable = [];
  st.equipment = st.equipment.filter((e) => !["pool6", "pool8", "pool10"].includes(e.kind));
  const a = monthlyAdvice(st, "第1週");
  ok(a !== null, "詰まっていても案内が出る");
  ok(typeof a?.text === "string" && a.text.length > 0, "本文が空でない", a?.text);
  // 【1つに絞る理由】2つ3つ並ぶと読まれず、「次にやること」が2つあるのは案内として失敗。
  ok(!a?.text.includes("\n"), "改行を含まない（1行）", JSON.stringify(a?.text));
}

// ================================================================ 3. 1行に収まる
head("3. 画面の幅に収まる");
{
  // 1行に使える幅は HUD の左右の余白を引いたぶん。
  // 日本語は1文字がだいたい字の大きさぶんの幅なので、13px なら 540-52 で 37字ほど。
  const LIMIT = 40;
  const seen: string[] = [];
  for (const seed of [11, 21, 31, 41, 51]) {
    const st = fresh(seed);
    seen.push(advise(st).text);
    // コーチを外した状態・定員あふれの状態も測る
    const st2 = fresh(seed);
    for (const e of st2.timetable) e.coachId = null;
    seen.push(advise(st2).text);
    const st3 = fresh(seed);
    for (let i = 0; i < 40; i++) st3.students.gakudo.push({ ...st3.students.gakudo[0], id: 90000 + i });
    seen.push(advise(st3).text);
  }
  const longest = seen.reduce((a, b) => (a.length >= b.length ? a : b));
  ok(longest.length <= LIMIT, `いちばん長い案内が${LIMIT}字以内`, `${longest.length}字: ${longest}`);
  ok(GAME_WIDTH === 540, "画面幅は540のまま（字数の目安の前提）", `${GAME_WIDTH}`);
}

// ================================================================ 4. 定員あふれ
head("4. 定員あふれを拾う");
{
  const st = fresh();
  // コーチと大会の案内を先に片付けてから、あふれだけを残す
  const before = st.students.gakudo.length;
  for (let i = 0; i < 200; i++) st.students.gakudo.push({ ...st.students.gakudo[0], id: 90000 + i });
  ok(st.students.gakudo.length > st.capacityOf("gakudo"), "学童が定員を超えている",
    `${st.students.gakudo.length} / 定員${st.capacityOf("gakudo")}`);
  // 大会の案内（③）のほうが先に出るので、両方（出場確認・記録会）を黙らせてから測る。
  // 【この順で正しい】主要大会は**過ぎたら来年まで来ない**ので時間に追われる。
  // 定員あふれは放っておいても消えないから、あとで拾えばよい。
  for (const c of st.majorsNeedingConfirm()) st.markConfirmAsked(c.id);
  st.pendingRaces.push({ id: 1, compId: "kk_area_1", event: { stroke: "free", distance: 100 }, studentIds: [], raceDay: st.dayCount + 3, paid: 0 });
  const a = advise(st);
  ok(a.text.includes("定員") || a.text.includes("あふれ"), "定員オーバーを知らせる", a.text);
  ok(before > 0, "もとの学童がいた", `${before}人`);
}

// ================================================================ 5. 行き先が必ず付く
head("5. 押せば直せる（行き先がある）");
{
  const GOES = ["timetable", "coach", "comp", "shop", "roster", "events"];
  let withGo = 0;
  let total = 0;
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    for (const broken of [0, 1, 2]) {
      const st = fresh(seed);
      if (broken === 1) for (const e of st.timetable) e.coachId = null;
      if (broken === 2) st.timetable = [];
      const a = advise(st);
      total++;
      if (a.go && GOES.includes(a.go)) withGo++;
    }
  }
  ok(withGo === total, "どの案内にも行き先が付いている", `${withGo}/${total}`);
}

// ================================================================ 6. 注目選手
head("6. 注目選手（★）");
{
  const st = fresh();
  const list = st.students.gakudo;
  ok(st.pinnedStudents().length === 0, "はじめは誰にも★が付いていない");

  for (let i = 0; i < PIN_MAX; i++) st.togglePin(list[i]);
  ok(st.pinnedStudents().length === PIN_MAX, `★は${PIN_MAX}人まで付く`, `${st.pinnedStudents().length}人`);

  const over = st.togglePin(list[PIN_MAX]);
  ok(!over.ok, "上限を超えると断る（理由を返す）", over.reason ?? "");
  ok(!list[PIN_MAX].pinned, "断られた選手には★が付かない");
  ok(list[0].pinned, "断っても古い★は外さない");

  st.togglePin(list[0]);
  ok(!list[0].pinned, "もう一度押すと外れる");
  ok(st.togglePin(list[PIN_MAX]).pinned, "1つ空けば新しく付けられる");

  // クラスをまたいでも数える（全体で PIN_MAX 人）
  const other = st.students.youji[0];
  if (other) {
    const r = st.togglePin(other);
    ok(!r.ok, "別のクラスでも上限は共通", r.reason ?? "");
  }

  // 並び順はクラスの順（HUD の札が毎フレーム入れ替わらないこと）
  const a1 = st.pinnedStudents().map((s) => s.id).join(",");
  const a2 = st.pinnedStudents().map((s) => s.id).join(",");
  ok(a1 === a2, "呼ぶたびに並びが変わらない", a1);
  ok(CLASS_ORDER.length > 0, "クラスの並びがある");
}

// ================================================================ 7. 見た目の文字列
head("7. 表示のかたち");
{
  const st = fresh();
  const a = advise(st);
  const line = adviceLine(a);
  ok(line.startsWith(a.icon), "行頭にしるしが付く", line);
  ok(line.includes(`${st.month}月`), "何月の話か分かる", line);
  ok(/^#[0-9a-f]{6}$/i.test(a.color), "色が16進で入っている", a.color);
}

console.log(`\n${fail === 0 ? "全て通過" : `${fail}件 失敗`}  （${pass}/${pass + fail}）`);
if (fail > 0) process.exitCode = 1;
