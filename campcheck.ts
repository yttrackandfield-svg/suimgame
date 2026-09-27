/// <reference types="node" />
/**
 * 合宿・スタッフ・高地の動作確認（ヘッドレス）。
 * Phaser を読まない sim / save 層だけを叩く。
 */
import { GameState } from "./src/sim/state";
import { GameClock } from "./src/sim/clock";
import { createStudent } from "./src/sim/student";
import { CAMP_ORDER, campDef, altitudeBand, ALTITUDE_STAYS } from "./src/sim/camp";
import { buildSave, applySave } from "./src/save/serialize";
import { migrateSave } from "./src/save/migrate";
import { SAVE_VERSION } from "./src/save/types";
import { coachGradeLabel } from "./src/sim/coach";

let seed = 12345;
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

// ---------------------------------------------------------------- 準備
const st = new GameState(rand, { clubName: "テストSC" });
const clock = new GameClock();

// 選手クラスに数人入れる
for (let i = 0; i < 4; i++) {
  st.students.senshu.push(createStudent(rand, 900 + i, "senshu"));
}
st.students.senshu[0].fav = { stroke: "free", distance: 400 }; // 中長距離
st.students.senshu[1].fav = { stroke: "free", distance: 50 }; // スプリンター
st.month = 3; // 合宿できる月

line("\n=== 1. コーチの格と専門種目 ===");
for (let q = 1; q <= 5; q++) line(`  質${q} → ${coachGradeLabel(q)}`);
check("コーチに得意泳法がある", st.coaches.every((c) => !!c.specialty), st.coaches.map((c) => c.specialty).join(","));

line("\n=== 2. 合宿タイプと1人あたり費用 ===");
for (const id of CAMP_ORDER) {
  const d = campDef(id);
  const s = st.campTypeStatus(id);
  line(
    `  ${d.region === "overseas" ? "海外" : "国内"} ${d.label.padEnd(14, "　")} ◆${String(d.costPerHead).padStart(4)}/人` +
      `　格${d.minClubTier}以上・余裕◆${d.minGems}　→ ${s.ok ? "選べる" : "×" + s.reason}`,
  );
}
check(
  "序盤（所持◆400・格1）は海外がすべて選べない",
  CAMP_ORDER.filter((id) => campDef(id).region === "overseas").every((id) => !st.campTypeStatus(id).ok),
);
check("国内はすべて選べる", CAMP_ORDER.filter((id) => campDef(id).region === "domestic").every((id) => st.campTypeStatus(id).ok));

line("\n=== 3. 高地の効果帯 ===");
for (const d of [0, 2, 5, 8, 10, 12, 18, 24, 26]) {
  const b = altitudeBand(d);
  line(`  下山${String(d).padStart(2)}日後 → ${b ? `${b.label} (×${b.timeFactor})` : "効果なし"}`);
}

line("\n=== 4. 合宿の実施（高地・9日滞在） ===");
const before = { ...st.students.senshu[0].stats };
const gemsBefore = st.gems;
// 合宿の費用は 2026-09-23 に上がった（高地は1人◆1,800）。ここは仕組みを見る検査なので、
// 足りる額を持たせる（費用そのものは下の「費用が人数ぶん引かれた」で確かめる）
st.gems = campDef("altitude").costPerHead * 2 + 500;
const res = st.runCamp([st.students.senshu[0], st.students.senshu[1]], {
  id: "altitude",
  stayDays: 12,
  intensity: "normal",
});
check("実施できた", res.ok, res.reason ?? "");
check("費用が人数ぶん引かれた", res.cost === campDef("altitude").costPerHead * 2, `cost=${res.cost}`);
for (const o of res.outcomes) {
  line(
    `  ${o.student.name}: 効果${o.mult.toFixed(2)}倍  持久力+${o.gains.stamina.toFixed(1)}  ` +
      `順応${o.altitudeFailed ? "失敗" : "成功"}  下山→大会 ${o.descentToMeet}日 (${o.bandLabel})` +
      (o.event ? `  [${o.event.kind}] ${o.event.label}` : ""),
  );
}
check("高地状態が付いた", st.students.senshu[0].altitude !== null);
check("持久力が伸びた", st.students.senshu[0].stats.stamina > before.stamina);
check(
  "スプリンターにだけ感覚の鈍りが付いた",
  (st.students.senshu[1].altitude?.sprintDull ?? 0) > 0 && (st.students.senshu[0].altitude?.sprintDull ?? 0) === 0,
);
void gemsBefore;

line("\n=== 5. 下山からの日数でタイム倍率が変わるか（400m自由形・順応成功） ===");
const sprinter = st.students.senshu[1];
const distanceSwimmer = st.students.senshu[0];
// ケガと順応失敗を取り除いて、高地の効果だけを見る
distanceSwimmer.injuryDays = 0;
distanceSwimmer.altitude = { descentDay: 0, adaptation: 1, failed: false, sprintDull: 0, stayDays: 12 };
const factorAt = (d: number): number => {
  distanceSwimmer.altitude!.descentDay = st.calendarDay - d;
  return st.raceExtraFactor(distanceSwimmer, { stroke: "free", distance: 400 });
};
for (const d of [1, 5, 8, 14, 20, 26]) {
  const f = factorAt(d);
  line(`  下山${String(d).padStart(2)}日後 → タイム倍率 ${f.toFixed(4)} ${f < 1 ? "(速い)" : f > 1 ? "(遅い)" : "(素)"}`);
}
check("ピーク帯(8日)は速くなる", factorAt(8) < 1, `×${factorAt(8).toFixed(4)}`);
check("下山直後(1日)は遅くなる", factorAt(1) > 1, `×${factorAt(1).toFixed(4)}`);
check("減衰帯は薄まる", factorAt(20) > factorAt(8) && factorAt(20) < 1.0001, `×${factorAt(20).toFixed(4)}`);
check("期限切れ(26日)は素に戻る", Math.abs(factorAt(26) - 1) < 1e-9);
// 順応に失敗するとプラスは出ないが、マイナスの帯はそのまま来る
distanceSwimmer.altitude!.failed = true;
check("順応失敗ならピーク帯でも速くならない", factorAt(8) >= 1, `×${factorAt(8).toFixed(4)}`);
check("順応失敗でも下山直後は遅い", factorAt(1) > 1, `×${factorAt(1).toFixed(4)}`);
distanceSwimmer.altitude!.failed = false;

line("\n=== 5b. どの滞在期間でもピーク帯を狙えるか（暦は7日きざみ） ===");
for (const stay of ALTITUDE_STAYS) {
  // 到達しうる「大会までの日数」は7の倍数。そのどれかでピーク帯(7〜10日)に入れるか。
  const hits: number[] = [];
  for (let m = 1; m <= 8; m++) {
    const daysUntil = m * 7;
    const gap = daysUntil - stay.days;
    const b = altitudeBand(gap);
    if (b?.id === "peak") hits.push(daysUntil);
  }
  line(`  ${stay.label.padEnd(16, " ")} → 大会まで ${hits.join("/") || "なし"} 日のときピーク`);
  check(`${stay.label} でピーク帯を狙える`, hits.length > 0);
}

line("\n=== 6. スプリンターの感覚の鈍り ===");
sprinter.altitude!.descentDay = st.calendarDay - 8;
const dullFactor = st.raceExtraFactor(sprinter, { stroke: "free", distance: 50 });
line(`  鈍り ${sprinter.altitude!.sprintDull.toFixed(2)} → 50m の倍率 ${dullFactor.toFixed(4)}`);
check("鈍りが残っていると50mは遅い", dullFactor > 1, `×${dullFactor.toFixed(4)}`);
sprinter.altitude!.sprintDull = 0;
const cured = st.raceExtraFactor(sprinter, { stroke: "free", distance: 50 });
check("鈍りが取れると悪化しない", cured <= dullFactor, `×${cured.toFixed(4)}`);

line("\n=== 7. 専門スタッフ ===");
check("部屋が無いと雇えない", !st.canHireStaff("nutritionist").ok, st.canHireStaff("nutritionist").reason ?? "");
st.gems = 5000;
// 食堂・クリニックを建てる土地を確保する（初期の10×10はプールでほぼ埋まっている）。
// 敷地は 2026-09-23 に値上げ（5,000 → 10,000 → 100,000 → 200,000）したので、そのつど足す
while (st.expandLand().ok) st.gems = 300_000;
st.gems = 5000;
st.buyEquipment("cafeteria");
st.buyEquipment("clinic");
check("食堂を建てると雇える", st.canHireStaff("nutritionist").ok);
st.hireStaff("nutritionist");
st.hireStaff("nutritionist");
check("定員は部屋1つにつき2人", !st.canHireStaff("nutritionist").ok, st.canHireStaff("nutritionist").reason ?? "");
st.hireStaff("doctor");
const b1 = st.staffBonus();
line(`  栄養士2人 → 回復×${b1.recoveryMult.toFixed(2)} 成長×${b1.growthMult.toFixed(3)}`);
line(`  ドクター1人 → ケガ率×${b1.injuryChanceMult.toFixed(2)} 回復×${b1.injuryHealMult.toFixed(2)}`);
check("栄養士で成長が上がる", b1.growthMult > 1);
check("ドクターでケガ率が下がる", b1.injuryChanceMult < 1);
check("月給に専門スタッフが乗る", st.specialistSalary() > 0, `◆${st.specialistSalary()}`);

line("\n=== 8. ケガの回復 ===");
distanceSwimmer.injuryDays = 21;
for (let i = 0; i < 3; i++) st.onDayRoll();
line(`  3日経過 → 残り ${distanceSwimmer.injuryDays.toFixed(1)}日`);
check("ケガが減る", distanceSwimmer.injuryDays < 21);

line("\n=== 9. 部屋を売ると定員超過スタッフが辞める ===");
const cafe = st.equipment.find((e) => e.kind === "cafeteria")!;
st.sellEquipment(cafe);
check("栄養士が0人になった", st.staffCount("nutritionist") === 0, `${st.staffCount("nutritionist")}人`);

line("\n=== 10. セーブ往復 ===");
st.hireStaff("doctor");
const saved = buildSave(st, clock, 1000);
check("最新バージョンで書き出せる", saved.version === SAVE_VERSION, String(saved.version));
const st2 = new GameState(rand);
const clock2 = new GameClock();
applySave(JSON.parse(JSON.stringify(saved)), st2, clock2);
check("ドクター数が一致", st2.staffCount("doctor") === st.staffCount("doctor"), `${st2.staffCount("doctor")} vs ${st.staffCount("doctor")}`);
check("dayCount が一致", st2.dayCount === st.dayCount, `${st2.dayCount} vs ${st.dayCount}`);
check("コーチの専門が保たれる", st2.coaches[0]?.specialty === st.coaches[0]?.specialty);
const s2 = st2.students.senshu.find((x) => x.id === distanceSwimmer.id);
check("高地状態が保たれる", !!s2?.altitude, JSON.stringify(s2?.altitude ?? null));
check("ケガ日数が保たれる", Math.abs((s2?.injuryDays ?? -1) - distanceSwimmer.injuryDays) < 0.05);

line("\n=== 11. 旧セーブ(v7)のマイグレーション ===");
const v7 = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
v7.version = 7;
const g7 = v7.game as Record<string, unknown>;
delete g7.staff;
delete g7.nextStaffId;
delete g7.dayCount;
delete g7.scoutBoost;
for (const s of g7.students as Record<string, unknown>[]) {
  delete s.injuryDays;
  delete s.altitude;
}
for (const c of g7.coaches as Record<string, unknown>[]) delete c.specialty;
const m = migrateSave(v7);
check("v7 を読める", m.ok, m.ok ? "" : m.reason);
if (m.ok) {
  const st3 = new GameState(rand);
  applySave(m.data, st3, new GameClock());
  check("v7 からコーチに専門が振られる", st3.coaches.every((c) => !!c.specialty));
  check("v7 からはスタッフ0人", st3.staff.length === 0);
  check("v7 からはケガ無し", st3.students.senshu.every((s) => s.injuryDays === 0));
}

line(`\n${failures === 0 ? "全て通過" : `${failures} 件 失敗`}`);
process.exit(failures === 0 ? 0 : 1);
