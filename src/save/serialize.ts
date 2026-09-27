import { CLASS_ORDER, type ClassId } from "../sim/classes";
import {
  STAT_KEYS,
  createStudent,
  OWN_STYLE,
  TALENT_ORDER,
  type PlanMode,
  type PlanStroke,
  type StatKey,
  type Stroke,
  type StrokeCore,
  type Student,
} from "../sim/student";
import type { TalentRankId } from "../config/balance";
import {
  clampGrade,
  footprintOf,
  roomSize,
  type RoomKind,
  type RoomRot,
  gradeOf,
  isEquipmentKind,
  type EquipmentKind,
} from "../sim/equipment";
import type { Coach } from "../sim/coach";
import { isStaffKind, type StaffMember } from "../sim/staff";
import type { GameState, HoldableId } from "../sim/state";
import type { GameClock, Speed } from "../sim/clock";
import {
  SAVE_VERSION,
  V1_STAT_ORDER,
  V1_CORE_STROKE_ORDER,
  V1_STROKE_ORDER,
  type CoachSaveV1,
  type SaveData,
  type SlotHeader,
  type StaffSaveV8,
  type StudentSaveV30,
} from "./types";
import { MAP, PASSION } from "../config/balance";
import { clampLandSteps, minLandStepsFor } from "../sim/clubMap";
import { arrangeExisting } from "../sim/mapPresets";
import { competitionById, withEventKeys } from "../sim/competitions";
import { defaultTimetable, SLOTS } from "../sim/timetable";

/**
 * ランタイムの状態（GameState / GameClock）と、保存形式（SaveData）の相互変換。
 *
 * ここが「直列化の一点」。sim/ 側は保存のことを知らないままでいられるように、
 * 変換の知識はすべてこのファイルに閉じ込める。
 * 復元は「新規状態を作って上書きする」方式なので、将来 Student にフィールドが
 * 増えても、古いセーブに無い項目は新規生成時の既定値が入る（＝undefined にならない）。
 */

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);

// ------------------------------------------------------------------ 書き出し

function packStats(rec: Record<StatKey, number>, round: (v: number) => number): number[] {
  return V1_STAT_ORDER.map((k) => round(rec[k] ?? 0));
}

function saveStudent(s: Student): StudentSaveV30 {
  return {
    id: s.id,
    name: s.name,
    grade: s.grade,
    gender: s.gender,
    classId: s.classId,
    tint: s.tint,
    stats: packStats(s.stats, r2),
    talent: packStats(s.talent, r3),
    // 才能ランク（v22〜）。能力ごとの 無印／○／◎
    talentRank: V1_STAT_ORDER.map((k) => s.talentRank[k] ?? "C"),
    trainCount: packStats(s.trainCount, Math.round),
    streak: packStats(s.streak, Math.round),
    strokeProf: V1_STROKE_ORDER.map((k) => r2(s.strokeProf[k] ?? 0)),
    // --- v27 --- 実年齢（学年は社会人で止まるので、別に持つ）
    age: Math.max(0, Math.round(s.age)),
    // --- v26 --- 泳法の才能（4泳法。個メは持たない）
    strokeTalent: V1_CORE_STROKE_ORDER.map((k) => r3(s.strokeTalent[k as StrokeCore] ?? 0.5)),
    energy: r2(s.energy),
    fav: { stroke: s.fav.stroke, distance: s.fav.distance },
    plan: { ability: s.plan.ability, stroke: s.plan.stroke },
    practiceAccum: r2(s.practiceAccum),
    growthType: s.growthType,
    growthObserved: r2(s.growthObserved),
    condition: r2(s.condition),
    season: {
      year: s.season.year,
      clearedStages: [...s.season.clearedStages],
      standards: [...s.season.standards],
      standardEvents: [...s.season.standardEvents],
    },
    // --- v4 ---
    planMode: s.planMode,
    restUntilDay: Math.max(0, Math.round(s.restUntilDay)),
    recoveryNeed: r2(s.recoveryNeed),
    achievePoints: r2(s.achievePoints),
    bestTimeScore: r2(s.bestTimeScore),
    bestTimeSec: r3(s.bestTimeSec),
    bestTimeEvent: s.bestTimeEvent ? { stroke: s.bestTimeEvent.stroke, distance: s.bestTimeEvent.distance } : null,
    rankTier: Math.round(s.rankTier),
    wins: Math.round(s.wins),
    // --- v8 ---
    injuryDays: r2(s.injuryDays),
    altitude: s.altitude
      ? {
          descentDay: Math.round(s.altitude.descentDay),
          adaptation: r3(s.altitude.adaptation),
          failed: s.altitude.failed,
          sprintDull: r3(s.altitude.sprintDull),
          stayDays: Math.round(s.altitude.stayDays),
        }
      : null,
    // --- v9 ---
    youthForm: r2(s.youthForm ?? 0),
    inDorm: s.inDorm === true,
    // --- v29 ---
    pinned: s.pinned === true,
    leaveAtMonth: s.leaveAtMonth ?? null,
    // --- v10 ---
    personalCoachId: null, // 専属コーチは廃止（項目だけ残す）
    // --- v11 ---
    inRehab: s.inRehab === true,
    awayDays: r2(s.awayDays),
    // --- v18 ---
    mood: r2(s.mood),
    // --- v25 ---
    // 成長の歴史（年1件）。能力は他と同じ V1_STAT_ORDER 順で持つ
    history: (s.history ?? []).map((h) => ({
      year: Math.round(h.year),
      grade: h.grade,
      stats: packStats(h.stats, r2),
    })),
  };
}

function saveCoach(c: Coach): CoachSaveV1 {
  return {
    id: c.id,
    name: c.name,
    quality: c.quality,
    assigned: c.assigned,
    duty: c.duty,
    specialty: c.specialty,
    // 指導力（v15）。研究で伸びた値なので必ず保存する。
    teaching: Math.round(c.teaching),
  };
}

function saveStaff(m: StaffMember): StaffSaveV8 {
  return { id: m.id, name: m.name, kind: m.kind };
}

/** 現在のゲーム全状態をセーブデータへ書き出す。 */
export function buildSave(state: GameState, clock: GameClock, playTimeMs: number): SaveData {
  const students: StudentSaveV30[] = [];
  for (const c of CLASS_ORDER) {
    for (const s of state.students[c.id]) students.push(saveStudent(s));
  }
  const cursors = state.idCursors;

  const classPlans: SaveData["game"]["classPlans"] = {};
  for (const c of CLASS_ORDER) {
    const p = state.classPlans[c.id];
    classPlans[c.id] = p ? { ability: p.ability, stroke: p.stroke } : null;
  }
  // 【廃止】買って置くアイテムは無くした。枠だけ残して空で書く（古い読み手が落ちないように）
  const items: SaveData["game"]["items"] = {};
  const placements: SaveData["game"]["itemPlacements"] = {};

  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    playTimeMs: Math.round(playTimeMs),
    game: {
      clubName: state.clubName,
      popularity: r2(state.popularity),
      gems: Math.round(state.gems),
      year: state.year,
      month: state.month,
      championships: state.championships,
      // --- v20（情熱）---
      passion: r2(state.passion),
      currentClassId: state.currentClassId,
      nextStudentId: cursors.student,
      nextCoachId: cursors.coach,
      nextEquipmentId: cursors.equipment,
      students,
      coaches: state.coaches.map(saveCoach),
      equipment: state.equipment.map((e) => ({
        id: e.id,
        kind: e.kind,
        gx: e.gx,
        gy: e.gy,
        grade: gradeOf(e),
        ...(e.rot === 1 ? { rot: 1 } : {}),
      })),
      heldThisMonth: [...state.heldThisMonth],
      tutorialStep: state.tutorialStep,
      monthEnrolled: state.monthEnrolled,
      monthTurnedAway: state.monthTurnedAway,
      items,
      classPlans,
      clubAchievement: r2(state.clubAchievement),
      clubRankTier: Math.round(state.clubRankTier),
      itemPlacements: placements,
      // --- v15（会議室ごとの研究プロジェクト＋テーマ別レベル）---
      researchProjects: state.researchProjects.map((p) => ({
        roomId: p.roomId,
        id: p.id,
        progress: r2(p.progress),
        coachIds: [...p.coachIds],
        targetLevel: Math.max(1, Math.round(p.targetLevel)),
      })),
      researchLevels: { ...state.researchLevels },
      // --- v8 ---
      staff: state.staff.map(saveStaff),
      nextStaffId: state.staffIdCursor,
      dayCount: Math.max(0, Math.round(state.dayCount)),
      scoutBoost: r2(state.scoutBoost),
      // --- v28（コーチの募集名簿。毎月積み上がるので途中経過を保存する）---
      monthCount: Math.max(0, Math.round(state.monthCount)),
      recruitPool: state.recruitPool.map((c) => ({
        coach: saveCoach(c.coach),
        cost: Math.round(c.cost),
        since: Math.max(0, Math.round(c.since)),
      })),
      // --- v9（マップ・時間割・一般客）---
      // roads は v20 で廃止（道を敷く仕組みをやめた）。読み込み側は無視する。
      roads: [],
      mapCols: MAP.cols,
      mapRows: MAP.rows,
      // --- v14（買い足した敷地の段数・特別練習の使用記録）---
      landSteps: clampLandSteps(state.landSteps),
      specialUsed: [...state.specialUsed],
      timetable: state.timetable.map((e) => ({
        poolId: e.poolId,
        slot: e.slot,
        classId: e.classId,
        coachId: e.coachId,
      })),
      guestIncome: Math.max(0, Math.round(state.guestMonth.income)),
      // 部屋ごとの今月の利用回数（0のものは書かない → セーブを膨らませない）
      roomUse: Object.entries(state.roomUse)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => [Number(id), Math.round(n)] as [number, number]),
      // 合宿の成績（1人1件）。次に誰を連れていくかの材料なので残す
      campLog: Object.entries(state.campLog).map(([id, r]) => ({
        id: Number(id),
        year: r.year,
        month: r.month,
        label: r.label,
        gain: Math.round(r.gain * 100) / 100,
        bestStat: r.bestStat,
        injured: r.injured,
      })),
      // --- v12（乱数と自動イベントの残り時間）---
      // これを保存しないと、読み込むたびに乱数が引き直しになり、
      // 同じセーブから始めても入会する子のクラスなどが毎回変わってしまう。
      rngState: state.rngState | 0,
      enrollTimer: r2(state.autoEventTimers.enroll),
      flavorTimer: r2(state.autoEventTimers.flavor),
      // --- v13（キャンペーンの打ちすぎによる効果減）---
      campaignRepeats: { ...state.campaignRepeats } as Record<string, number>,
      // 大会ごとの最高記録（「大会新記録」の演出に使う）
      meetRecords: { ...state.meetRecords },
      // エントリー済みで開催日を待っているレースと、出場確認を出した主要大会
      pendingRaces: state.pendingRaces.map((r) => ({
        id: r.id,
        compId: r.compId,
        event: { stroke: r.event.stroke, distance: r.event.distance },
        studentIds: [...r.studentIds],
        raceDay: r.raceDay,
        paid: r.paid,
      })),
      meetConfirmAsked: [...state.meetConfirmAsked],
      // 引退した選手（v27〜）。振り返りとコーチの誘いに使う
      retired: state.retired.map((r) => ({
        studentId: r.studentId,
        name: r.name,
        age: Math.round(r.age),
        grade: r.grade,
        classId: r.classId,
        year: Math.round(r.year),
        byChoice: r.byChoice,
        wins: Math.round(r.wins),
        rankTier: Math.round(r.rankTier),
        achievePoints: Math.round(r.achievePoints),
        bestTimeSec: r3(r.bestTimeSec),
        bestTimeEvent: r.bestTimeEvent ? { stroke: r.bestTimeEvent.stroke, distance: r.bestTimeEvent.distance } : null,
        bestStroke: r.bestStroke,
        bestProf: Math.round(r.bestProf),
        coachOffer: r.coachOffer ? { coach: saveCoach(r.coachOffer.coach), cost: r.coachOffer.cost } : null,
      })),
    },
    clock: {
      minuteOfDay: r2(clock.minuteOfDay),
      week: clock.week,
      speed: clock.speed,
    },
  };
}

// ------------------------------------------------------------------ 読み込み

const VALID_CLASS = new Set<string>(CLASS_ORDER.map((c) => c.id));

function unpackStats(arr: unknown, base: Record<StatKey, number>): Record<StatKey, number> {
  const out = { ...base };
  if (Array.isArray(arr)) {
    V1_STAT_ORDER.forEach((k, i) => {
      out[k] = num(arr[i], base[k]);
    });
  }
  return out;
}

function reviveStudent(d: StudentSaveV30): Student {
  // 新規生成をテンプレートにして上書きする（将来増えたフィールドも既定値で埋まる）。
  const classId: ClassId = VALID_CLASS.has(d.classId) ? d.classId : "gakudo";
  const s = createStudent(() => 0.5, num(d.id, 0), classId);

  s.name = str(d.name, s.name);
  s.grade = str(d.grade, s.grade);
  s.gender = d.gender === "f" || d.gender === "m" ? d.gender : s.gender;
  s.classId = classId;
  s.tint = num(d.tint, s.tint);

  s.stats = unpackStats(d.stats, s.stats);
  s.talent = unpackStats(d.talent, s.talent);
  const rankArr = d.talentRank;
  if (Array.isArray(rankArr)) {
    V1_STAT_ORDER.forEach((k, i) => {
      const v = rankArr[i];
      s.talentRank[k] = TALENT_ORDER.includes(v as TalentRankId) ? (v as TalentRankId) : "C";
    });
  }
  s.trainCount = unpackStats(d.trainCount, s.trainCount);
  s.streak = unpackStats(d.streak, s.streak);

  if (Array.isArray(d.strokeProf)) {
    V1_STROKE_ORDER.forEach((k, i) => {
      s.strokeProf[k] = num(d.strokeProf[i], 0);
    });
  }
  // 泳法の才能（v26〜）。無ければ生成時の値のまま（createStudent が入れている）
  if (Array.isArray(d.strokeTalent)) {
    V1_CORE_STROKE_ORDER.forEach((k, i) => {
      const v = num(d.strokeTalent![i], 0.5);
      s.strokeTalent[k as StrokeCore] = Math.min(1, Math.max(0, v));
    });
  }

  if (d.fav) {
    s.fav = {
      stroke: (d.fav.stroke ?? s.fav.stroke) as Stroke,
      distance: num(d.fav.distance, s.fav.distance),
    };
  }
  if (d.plan) {
    s.plan = {
      ability: (d.plan.ability ?? s.plan.ability) as StatKey,
      // "style1"（各自の得意）も指定できる
      stroke: (d.plan.stroke ?? s.plan.stroke) as PlanStroke,
    };
  }

  s.energy = num(d.energy, s.energy);
  s.practiceAccum = num(d.practiceAccum, 0);
  s.growthType = d.growthType ?? s.growthType;
  s.growthObserved = num(d.growthObserved, 0);
  s.condition = num(d.condition, s.condition);
  s.season = {
    year: num(d.season?.year, -1),
    // 種目の付いていない古い記録は、得意種目つきに直して読む（どの種目でも上がれる抜け道を残さない）
    clearedStages: Array.isArray(d.season?.clearedStages) ? withEventKeys(d.season.clearedStages, s.fav) : [],
    standards: Array.isArray(d.season?.standards) ? [...d.season.standards] : [],
    standardEvents: Array.isArray(d.season?.standardEvents)
      ? d.season.standardEvents.filter((v): v is string => typeof v === "string")
      : [],
  };

  // --- v4 ---
  s.planMode = d.planMode === "self" || d.planMode === "class" ? (d.planMode as PlanMode) : s.planMode;
  s.restUntilDay = Math.max(0, Math.round(num(d.restUntilDay, 0)));
  s.recoveryNeed = Math.max(0, num(d.recoveryNeed, 0));
  s.achievePoints = Math.max(0, num(d.achievePoints, 0));
  s.bestTimeScore = Math.max(0, num(d.bestTimeScore, 0));
  s.bestTimeSec = Math.max(0, num(d.bestTimeSec, 0));
  s.bestTimeEvent = d.bestTimeEvent
    ? { stroke: d.bestTimeEvent.stroke as Stroke, distance: num(d.bestTimeEvent.distance, 100) }
    : null;
  s.rankTier = Math.min(8, Math.max(1, Math.round(num(d.rankTier, 1))));
  s.wins = Math.max(0, Math.round(num(d.wins, 0)));

  // --- v8 ---
  s.injuryDays = Math.max(0, num(d.injuryDays, 0));
  s.altitude = d.altitude
    ? {
        descentDay: Math.round(num(d.altitude.descentDay, 0)),
        adaptation: Math.min(1, Math.max(0, num(d.altitude.adaptation, 0))),
        failed: d.altitude.failed === true,
        sprintDull: Math.max(0, num(d.altitude.sprintDull, 0)),
        stayDays: Math.max(0, Math.round(num(d.altitude.stayDays, 0))),
      }
    : null;

  // --- v9 ---
  s.youthForm = Math.max(0, num(d.youthForm, 0));
  s.inDorm = d.inDorm === true;
  // --- v29 ---
  s.pinned = d.pinned === true;
  s.leaveAtMonth = typeof d.leaveAtMonth === "number" ? d.leaveAtMonth : null;
  // --- v10 ---
  s.personalCoachId = null; // 専属コーチは廃止（古いセーブの指名は読み捨てる）
  // --- v11 ---
  s.inRehab = d.inRehab === true;
  // 遠征は週で数える（→ SCALE_AWAY_DAYS）。以前は7を入れていたので、古いセーブの遠征は1週に丸める
  s.awayDays = Math.min(1, Math.max(0, num(d.awayDays, 0)));
  // --- v18 ---（古いセーブには無いので、新規生成の既定値＝ふつう のまま）
  s.mood = Math.min(100, Math.max(0, num(d.mood, s.mood)));
  // 実年齢（v27〜）。無いセーブは学年から逆算した値のまま
  s.age = Math.max(0, Math.round(num(d.age, s.age)));

  // 成長の歴史（v25〜）。年ごとに1件、古い順。壊れている件は捨てる
  s.history = [];
  if (Array.isArray(d.history)) {
    for (const h of d.history) {
      if (!h || !Array.isArray(h.stats)) continue;
      const stats = { ...s.stats };
      V1_STAT_ORDER.forEach((k, i) => {
        stats[k] = num(h.stats[i], 0);
      });
      s.history.push({ year: Math.round(num(h.year, 0)), grade: str(h.grade, ""), stats });
    }
    s.history.sort((a, b) => a.year - b.year);
  }
  return s;
}

const VALID_STROKE = new Set<string>(V1_STROKE_ORDER);

function reviveCoach(d: CoachSaveV1, rand: () => number): Coach {
  const assigned = d.assigned && VALID_CLASS.has(d.assigned) ? d.assigned : null;
  // 得意泳法（v8）。古いセーブには無いので、そのときはランダムに振る。
  const specialty =
    typeof d.specialty === "string" && VALID_STROKE.has(d.specialty)
      ? (d.specialty as Stroke)
      : (V1_STROKE_ORDER[Math.floor(rand() * V1_STROKE_ORDER.length)] as Stroke);
  return {
    id: num(d.id, 0),
    name: str(d.name, "コーチ"),
    quality: Math.min(5, Math.max(1, Math.round(num(d.quality, 1)))),
    assigned,
    duty: d.duty === "research" ? "research" : "idle",
    specialty,
    // 指導力（v15）。古いセーブには無いので、格から見積もる。
    teaching: Math.max(0, Math.min(100, num(d.teaching, Math.round(num(d.quality, 1) * 7)))),
  };
}

function reviveStaff(d: StaffSaveV8): StaffMember | null {
  const kind = str(d.kind, "");
  if (!isStaffKind(kind)) return null; // 未知の種別は捨てる
  return { id: num(d.id, 0), name: str(d.name, "スタッフ"), kind };
}

/** その位置がいまのマップに収まるか（config で敷地を狭めたときの防御）。 */
/**
 * その部屋が、いまの敷地の中に**大きさぶん**収まっているか。
 *
 * 原点だけを見ていると、**部屋を大きくしたとき**（例：フロントを 2×1 → 3×2 にした）に
 * 縁ぎわの部屋がはみ出したまま読み込まれる。footprint まで見て並べ直しの合図にする。
 */
function fitsOnMap(gx: number, gy: number | null, kind?: RoomKind, rot: RoomRot = 0): boolean {
  if (gy == null || gx < 0 || gy < 0) return false;
  const f = kind ? footprintOf(kind, rot) : { w: 1, h: 1 };
  return gx + f.w <= MAP.cols && gy + f.h <= MAP.rows;
}

/** セーブデータを、既存の GameState / GameClock に流し込む（内容を完全に置き換える）。 */
export function applySave(data: SaveData, state: GameState, clock: GameClock): void {
  const g = data.game;

  // 設備とマップを先に戻す：スクールの在籍上限（時間割×プール）がここで決まるので、選手より前。
  state.equipment = (Array.isArray(g.equipment) ? g.equipment : [])
    .filter((e) => e && isEquipmentKind(String(e.kind)))
    .map((e) => ({
      id: num(e.id, 0),
      kind: e.kind as EquipmentKind,
      gx: typeof e.gx === "number" ? Math.round(e.gx) : null,
      gy: typeof e.gy === "number" ? Math.round(e.gy) : null,
      grade: clampGrade(num(e.grade, 1)),
      // 向き（1＝縦横を入れ替えた）。持っていない古いセーブは買ったときの向き
      ...(num(e.rot, 0) === 1 ? { rot: 1 as const } : {}),
    }));
  // 敷地の広さ（買い足した段数）。**部屋を戻したあとに縮めない**ので、
  // すでに建っている部屋が全部おさまる段数を下限にする（古いデータの保険）。
  state.landSteps = Math.max(clampLandSteps(num(g.landSteps, 0)), minLandStepsFor(state.equipment));
  state.specialUsed = (Array.isArray(g.specialUsed) ? g.specialUsed : []).filter(
    (v): v is number => typeof v === "number",
  );
  // 位置を持っていない（v8 以前から来た）／敷地に収まらなくなった部屋があるときは、
  // まとめて並べ直して道で繋ぐ。こうしないと「建てたのに使えない」状態でロードされる。
  // 部屋の大きさ（footprint）を変えたときは、古い座標のままだと部屋どうしが重なる。
  // 重なりも並べ直しの合図に入れておく（config を触っても壊れないようにするため）。
  const overlaps = (): boolean => {
    const used = new Set<string>();
    for (const e of state.equipment) {
      if (e.gx == null || e.gy == null) continue;
      const f = roomSize(e);
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          const key = `${e.gx + x},${e.gy + y}`;
          if (used.has(key)) return true;
          used.add(key);
        }
      }
    }
    return false;
  };
  const needsArrange =
    state.equipment.length > 0 &&
    (state.equipment.every((e) => e.gx == null) ||
      state.equipment.some((e) => e.gx != null && !fitsOnMap(e.gx, e.gy, e.kind, e.rot === 1 ? 1 : 0)) ||
      overlaps());
  if (needsArrange) arrangeExisting(state.equipment, state.landSteps);
  state.invalidateMap();
  // 入口が表通りに出られない状態で読み込むと、全部の部屋が「行けない」になる。
  // その場合だけ入口を縁まで動かして繋ぎ直す（古いセーブ・敷地の広さが変わったときの保険）。
  state.ensureEntranceAccess();
  state.heldThisMonth = (Array.isArray(g.heldThisMonth) ? g.heldThisMonth : []).filter(
    (v): v is HoldableId => typeof v === "string",
  );

  // 時間割（存在しないプール・コーチを指すコマは、あとで pruneTimetable が落とす）
  const rawTt = Array.isArray(g.timetable) ? g.timetable : [];
  state.timetable = rawTt
    .filter((e) => e && VALID_CLASS.has(String(e.classId)))
    .map((e) => ({
      poolId: Math.round(num(e.poolId, -1)),
      slot: Math.min(SLOTS.length - 1, Math.max(0, Math.round(num(e.slot, 0)))),
      classId: e.classId as ClassId,
      coachId: typeof e.coachId === "number" ? Math.round(e.coachId) : null,
    }))
    .filter((e) => e.poolId >= 0);
  if (state.timetable.length === 0) state.timetable = defaultTimetable(state.equipment);

  // 合宿の成績（無ければ空）
  state.campLog = {};
  if (Array.isArray(g.campLog)) {
    for (const row of g.campLog as { id?: number; year?: number; month?: number; label?: string; gain?: number; bestStat?: string; injured?: boolean }[]) {
      const id = Number(row?.id);
      if (!Number.isFinite(id)) continue;
      state.campLog[id] = {
        year: Math.round(num(row.year, 1)),
        month: Math.round(num(row.month, 1)),
        label: typeof row.label === "string" ? row.label : "合宿",
        gain: num(row.gain, 0),
        bestStat: (STAT_KEYS as readonly string[]).includes(String(row.bestStat))
          ? (row.bestStat as (typeof STAT_KEYS)[number])
          : STAT_KEYS[0],
        injured: row.injured === true,
      };
    }
  }

  // 部屋ごとの今月の利用回数（無ければ空＝数え直し）
  state.roomUse = {};
  if (Array.isArray(g.roomUse)) {
    for (const row of g.roomUse as unknown[]) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const id = Number(row[0]);
      const n = Number(row[1]);
      if (Number.isFinite(id) && Number.isFinite(n) && n > 0) state.roomUse[id] = Math.round(n);
    }
  }

  // 【廃止】アイテム（items / itemPlacements）は読み飛ばす。

  state.clubAchievement = Math.max(0, num(g.clubAchievement, 0));
  state.clubRankTier = Math.max(1, Math.round(num(g.clubRankTier, 1)));

  // 研究（未知のテーマIDは捨てる。configからテーマを消しても壊れない）
  const rawLevels = (g.researchLevels ?? {}) as Record<string, unknown>;
  const levels: Record<string, number> = {};
  for (const [id, lv] of Object.entries(rawLevels)) {
    const n = Math.floor(num(lv, 0));
    if (n > 0) levels[id] = n;
  }
  const rawProjects = Array.isArray(g.researchProjects) ? g.researchProjects : [];
  state.setResearch(
    rawProjects
      .filter((p) => p && typeof p.id === "string")
      .map((p) => ({
        roomId: Math.round(num(p.roomId, -1)),
        id: String(p.id),
        progress: Math.max(0, num(p.progress, 0)),
        coachIds: (Array.isArray(p.coachIds) ? p.coachIds : []).filter(
          (v): v is number => typeof v === "number",
        ),
        targetLevel: Math.max(1, Math.round(num(p.targetLevel, 1))),
      })),
    levels,
  );
  const rawPlans = (g.classPlans ?? {}) as Record<string, { ability?: string; stroke?: string } | null>;
  for (const c of CLASS_ORDER) {
    const p = rawPlans[c.id];
    // stroke は実在の泳法か "style1"（各自の得意）のどちらか
    const validStroke = p?.stroke && (VALID_STROKE.has(p.stroke) || p.stroke === OWN_STYLE);
    state.classPlans[c.id] =
      p && p.ability && validStroke ? { ability: p.ability as StatKey, stroke: p.stroke as PlanStroke } : null;
  }
  state.tutorialStep = Math.round(num(g.tutorialStep, -1));
  state.monthEnrolled = Math.max(0, Math.round(num(g.monthEnrolled, 0)));
  state.monthTurnedAway = Math.max(0, Math.round(num(g.monthTurnedAway, 0)));

  state.clubName = str(g.clubName, state.clubName);
  state.popularity = num(g.popularity, 20);
  state.gems = num(g.gems, 0);
  state.year = Math.max(1, Math.round(num(g.year, 1)));
  state.month = Math.min(12, Math.max(1, Math.round(num(g.month, 4))));
  state.championships = Math.max(0, Math.round(num(g.championships, 0)));
  // 情熱（v20）。古いデータには無いので開始値から
  state.passion = Math.max(0, Math.min(PASSION.max, num(g.passion, PASSION.start)));
  state.currentClassId =
    g.currentClassId && VALID_CLASS.has(g.currentClassId) ? g.currentClassId : null;

  // --- コーチ（在籍者より先に戻すこと） ---
  //
  // 【順番が大事】コーチは必ず在籍者より先に復元する。
  // 時間割のコマは「担当コーチが在籍しているか」で開講判定され、
  // スクールの定員は「開講できているコマ数」で決まる。
  // コーチを後に戻すと、その瞬間の state.coaches は**新規ゲームの初期コーチ**なので、
  // セーブしたコーチID を指すコマが軒並み「担当がいない」＝定員が小さい、と判定される。
  // 得意泳法が無い古いセーブでも決定的に復元できるよう、IDから作った擬似乱数で振る
  let strokeSeed = 1;
  const strokeRand = (): number => {
    strokeSeed = (strokeSeed * 1103515245 + 12345) % 2147483648;
    return strokeSeed / 2147483648;
  };
  state.coaches = (Array.isArray(g.coaches) ? g.coaches : []).map((c) => reviveCoach(c, strokeRand));
  // 監督はクラス1人まで（防御：重複していたら後勝ちを外す）
  const seen = new Set<ClassId>();
  for (const c of state.coaches) {
    if (!c.assigned) continue;
    if (seen.has(c.assigned)) c.assigned = null;
    else seen.add(c.assigned);
  }
  const maxCoachId = state.coaches.reduce((m, c) => Math.max(m, c.id), 0);

  // --- 在籍者（配列の実体は保ったまま中身だけ差し替え） ---
  //
  // 【落とさない】セーブに入っている選手は全員そのまま戻す。
  // 以前はここで「定員超過は捨てる」をしていたが、定員は時間割・コーチ・
  // 使えるプールから毎回計算される値なので、読み込みの途中経過で簡単に小さくなる。
  // その結果「タイトルへ戻るたびに在籍者が減る／人数が毎回変わる」が起きていた。
  // 定員はあくまで**入会と昇格を止めるための線**であって、
  // すでに居る人を消してよい理由にはならない。
  for (const c of CLASS_ORDER) state.students[c.id].length = 0;
  let maxStudentId = 0;
  // 同じ ID の選手は1人だけ入れる。
  // 古い版のバグで名簿に同じ人が二重に入ってしまったセーブを、読み込み時に直す
  // （そのままだと画面にも名簿にも同じ人が2人出続けてしまう）。
  const restored = new Set<number>();
  for (const d of Array.isArray(g.students) ? g.students : []) {
    const s = reviveStudent(d);
    if (restored.has(s.id)) continue;
    restored.add(s.id);
    state.students[s.classId].push(s);
    maxStudentId = Math.max(maxStudentId, s.id);
  }

  // 専門スタッフ（v8）。部屋を減らしていた場合に備えて、定員超過はここで落とす。
  const staff = (Array.isArray(g.staff) ? g.staff : [])
    .map(reviveStaff)
    .filter((m): m is StaffMember => m !== null);
  const maxStaffId = staff.reduce((m, s) => Math.max(m, s.id), 0);
  state.setStaff(staff, Math.max(num(g.nextStaffId, 1), maxStaffId + 1));
  state.enforceStaffCapacity();

  state.dayCount = Math.max(0, Math.round(num(g.dayCount, 0)));
  state.scoutBoost = Math.max(0, num(g.scoutBoost, 0));
  // コーチの募集名簿（v28）。古いセーブには無いので空で始まり、次の月初に埋まる。
  state.monthCount = Math.max(0, num(g.monthCount, 0));
  state.recruitPool = (Array.isArray(g.recruitPool) ? g.recruitPool : []).map((c) => ({
    coach: reviveCoach(c.coach, strokeRand),
    cost: num(c.cost, 20),
    since: Math.max(0, num(c.since, 0)),
  }));

  const maxEquipmentId = state.equipment.reduce((m, e) => Math.max(m, e.id), 0);

  // ID 採番はセーブ値と実データの大きいほうから続ける（重複IDを絶対に作らない）
  state.setIdCursors(
    Math.max(num(g.nextStudentId, 1), maxStudentId + 1),
    Math.max(num(g.nextCoachId, 1), maxCoachId + 1),
    Math.max(num(g.nextEquipmentId, 1), maxEquipmentId + 1),
  );

  // 一般客の今月ぶんの売上を戻す（来場の途中で保存しても収支が合うように）
  state.guestMonth = { ...state.guestMonth, income: Math.max(0, Math.round(num(g.guestIncome, 0))) };
  // マップ・コーチが確定したので、成立しないコマを掃除して担当の抜けを埋める
  state.invalidateMap();
  state.syncTimetable();
  // 研究：部屋を失ったプロジェクトの移設・いないコーチの除外・duty の整合
  state.syncResearch();
  // --- v12：乱数と自動イベントの残り時間 ---
  // 乱数の状態を戻すことで、同じセーブからは必ず同じ結果になる
  // （読み込み直すたびに入会する子のクラスが変わる、が無くなる）。
  const seed = Math.round(num(g.rngState, 0)) | 0;
  if (seed !== 0) state.rngState = seed;
  // キャンペーンの「打った回数」（同じ手を続けると効果が落ちる）
  // 引退した選手（v27〜）
  state.retired = [];
  const retired = Array.isArray(g.retired) ? g.retired : [];
  for (const r of retired) {
    if (!r || typeof r !== "object") continue;
    state.retired.push({
      studentId: num(r.studentId, 0),
      name: str(r.name, "元選手"),
      age: num(r.age, 0),
      grade: str(r.grade, ""),
      classId: (VALID_CLASS.has(r.classId) ? r.classId : "senshu") as ClassId,
      year: num(r.year, 1),
      byChoice: r.byChoice === true,
      wins: num(r.wins, 0),
      rankTier: num(r.rankTier, 1),
      achievePoints: num(r.achievePoints, 0),
      bestTimeSec: num(r.bestTimeSec, 0),
      bestTimeEvent: r.bestTimeEvent
        ? { stroke: r.bestTimeEvent.stroke as Stroke, distance: num(r.bestTimeEvent.distance, 100) }
        : null,
      bestStroke: (r.bestStroke ?? "free") as Stroke,
      bestProf: num(r.bestProf, 0),
      coachOffer: r.coachOffer
        ? { coach: reviveCoach(r.coachOffer.coach, () => 0.5), cost: num(r.coachOffer.cost, 20), since: 0 }
        : null,
    });
  }

  state.meetRecords = {};
  const recs = (g.meetRecords ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(recs)) {
    const t = num(v, 0);
    if (t > 0) state.meetRecords[k] = t;
  }

  // エントリー済みで開催日を待っているレース（大会が見つからない記録は捨てる）
  state.pendingRaces = (Array.isArray(g.pendingRaces) ? g.pendingRaces : [])
    .filter((r) => r && typeof r.compId === "string" && competitionById(r.compId) != null)
    .map((r) => ({
      id: Math.round(num(r.id, 0)),
      compId: r.compId,
      event: { stroke: (r.event?.stroke ?? "free") as Stroke, distance: num(r.event?.distance, 100) },
      studentIds: (Array.isArray(r.studentIds) ? r.studentIds : []).filter((v): v is number => typeof v === "number"),
      raceDay: Math.round(num(r.raceDay, 0)),
      paid: Math.max(0, Math.round(num(r.paid, 0))),
    }));
  state.meetConfirmAsked = (Array.isArray(g.meetConfirmAsked) ? g.meetConfirmAsked : []).filter(
    (v): v is string => typeof v === "string",
  );

  state.campaignRepeats = {};
  const reps = (g.campaignRepeats ?? {}) as Record<string, number>;
  for (const [k, v] of Object.entries(reps)) {
    const n = Math.max(0, Math.round(num(v, 0)));
    if (n > 0) (state.campaignRepeats as Record<string, number>)[k] = n;
  }

  const enroll = num(g.enrollTimer, 0);
  const flavor = num(g.flavorTimer, 0);
  if (enroll > 0 || flavor > 0) state.setAutoEventTimers(enroll, flavor);
  else state.resetAutoEventTimers(); // 古いセーブは仕込み直す（0のままだと即発火する）

  clock.minuteOfDay = num(data.clock?.minuteOfDay, 10 * 60);
  clock.week = Math.min(4, Math.max(1, Math.round(num(data.clock?.week, 1))));
  const sp = Math.round(num(data.clock?.speed, 1));
  clock.setSpeed((sp === 2 || sp === 4 ? sp : 1) as Speed);
}

/** 枠一覧用の概要を作る。 */
export function headerOf(data: SaveData): SlotHeader {
  const students = data.game.students ?? [];
  const athletes = students.filter((s) => s.classId === "senshu" || s.classId === "pro").length;
  return {
    version: data.version,
    savedAt: data.savedAt,
    clubName: data.game.clubName,
    year: data.game.year,
    month: data.game.month,
    gems: data.game.gems,
    popularity: Math.round(data.game.popularity),
    members: students.length,
    athletes,
    playTimeMs: data.playTimeMs ?? 0,
    equipment: data.game.equipment?.length ?? 0,
  };
}
