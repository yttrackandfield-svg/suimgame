import { effectiveStandard } from "../data/standardTimes";
import {
  classDef,
  CLASS_ORDER,
  CLASS_MIN_GRADE,
  CLASS_MIN_GRADE_LABEL,
  classLabel,
  isSchoolClass,
  type ClassDef,
  type ClassId,
} from "./classes";
import {
  applyRestTick,
  applySchoolPractice,
  applyStrokeTraining,
  applyTraining,
  isResting,
  restRefillRatio,
  restWeeksLeft,
  canTrain,
  cancelRest,
  classFitMultiplier,
  classFitStatus,
  createStudent,
  CORE_STROKES,
  applyAging,
  bestStrokeOf,
  isRetireAge,
  strokeCapOf,
  strokeProfOf,
  addMeetStrokeProf,
  recordSnapshot,
  effectivePlan,
  energyMax,
  isInjured,
  orderRest,
  overallAbility,
  statCapOf,
  atAgeCeiling,
  STAT_KEYS,
  STROKE_LABEL,
  TRAINABLE_KEYS,
  type ClassFitStatus,
  type PracticePlan,
  type ResolvedPlan,
  type RaceEvent,
  type Gender,
  type StatKey,
  type Stroke,
  type Student,
  type TrainOptions,
} from "./student";
import { weeksLabel } from "./weeks";
import { specialMenu, specialTargetAt, type SpecialResult } from "./special";
import {
  clampTeaching,
  coachGrowthMult,
  teachingMult,
  coachSalary,
  coachTrainMult,
  makeCoach,
  recruitQualitiesFor,
  rollMeetCoachQuality,
  specialtyStrokeMult,
  specialtyTrainMult,
  type Coach,
} from "./coach";
import {
  altitudeAdaptation,
  altitudeBand,
  altitudeExpired,
  altitudeFailChance,
  altitudeTimeFactor,
  campDef,
  campWeight,
  campWeeks,
  intensityOption,
  isSprinter,
  rollCampEvent,
  stayOption,
  type AltitudeState,
  type CampDef,
  type CampEvent,
  type CampId,
  type CampPlan,
} from "./camp";
import {
  emptyStaffBonus,
  makeStaff,
  staffBonusOf,
  staffDef,
  STAFF_ORDER,
  type StaffBonus,
  type StaffKind,
  type StaffMember,
} from "./staff";
import {
  estimatedAge,
  GRADE_SEQ,
  growthPhaseMultiplier,
  lifeStageOf,
  LIFESTAGE_LABEL,
  nextGrade,
  type GrowthType,
  type LifeStage,
} from "./growth";
import { clampCondition, conditionLevel, CONDITION_LABEL, isRiskyCondition, recoverToward } from "./condition";
import {
  CALENDAR,
  competitionById,
  canEnterOf,
  confirmEventsFor,
  isAreaMeet,
  eligibleCompetitions,
  isTimeTrial,
  rivalLevelOf,
  kirokukaiTierOf,
  hasClearedStage,
  clearedEventsOf,
  resolveCompetition,
  seasonSchedule,
  KIROKUKAI_LADDER,
  SCALE_ENTRY_FEE,
  SCALE_TRAVEL_FEE,
  awayDaysOf,
  finalWallOf,
  SCALE_MAYOR_PRIZE,
  SCALE_REWARD,
  type CompReward,
  type Competition,
  type ScheduleRow,
} from "./competitions";
import {
  bestEntrant,
  maxRaceEntries,
  simulateRace,
  type EntrantOutcome,
  type RaceEntry,
  type RaceOutcome,
} from "./race";
import {
  CAMPAIGNS,
  campaignDef,
  campaignInSeason,
  type CampaignDef,
  type CampaignId,
} from "./campaign";
import {
  AUTO_EVENT_COLOR,
  coachTitle,
  conditionTitle,
  enrollDetail,
  enrollTitle,
  fullPoolTitle,
  FULL_POOL_DETAIL,
  newsLine,
  nextEnrollInterval,
  nextFlavorInterval,
  type AutoEvent,
} from "./autoEvents";
import {
  categoryLimit,
  countByCategory,
  countByKind,
  equipmentCostAt,
  gradeOf,
  gradeEffect,
  gradeUpkeep,
  hasGrade,
  clampGrade,
  MAX_GRADE,
  upgradeCost,
  isPool,
  isTrainingRoom,
  equipmentDef,
  footprintOf,
  roomSize,
  rotOf,
  type RoomRot,
  canUseEquipment,
  equipmentTrainMult,
  gymSpeedBoost,
  stationsOf,
  monthlyPopularityOf,
  roomTrainMultOf,
  totalTrainingSlots,
  totalUpkeep,
  type Equipment,
  type EquipmentKind,
  type RoomKind,
} from "./equipment";
import {
  clubEnrollBonus,
  clubProgress,
  clubRankLabel,
  clubStrengthBonus,
  clubTierOf,
  type ClubRankUpEvent,
} from "./clubRank";
import { planRecovery, recoverySlots, type RecoveryReport } from "./needs";
import {
  applyMood,
  averageMood,
  guestContribution,
  guestSatisfaction,
  relaxMood,
  wordOfMouthMultiplier,
  type GuestVisitContext,
} from "./satisfaction";
import {
  markRelaySwum,
  pickRelayGender,
  relayAlreadySwum,
  relaySelection,
  RELAY_DISTANCE,
  simulateRelay,
  type RelayOutcome,
} from "./relay";
import { crowdFactorAt } from "./daytime";
import {
  accessOf,
  canExpandLand,
  canPlaceAt,
  clampLandSteps,
  entranceField,
  entranceOpen,
  facilityRouteEfficiency,
  landBounds,
  landBoundsOf,
  touchesPerimeter,
  landExpandCost,
  landInnerSize,
  makeMap,
  placedRooms,
  roomAt,
  routeEfficiency,
  strandedRooms,
  type ClubMap,
  type DistField,
  type LandBounds,
  type RoomAccess,
} from "./clubMap";
import {
  autoPlaceRoom,
  starterPlacementFor,
  usedCells,
} from "./mapPresets";
import {
  checkPlacement,
  placementSummary,
  type PlacementTarget,
} from "./placement";
import {
  activeEntries,
  timetableConflicts,
  defaultTimetable,
  entriesAtSlot,
  entryStatus,
  poolsOf,
  venuesOf,
  poolLabel,
  pruneTimetable,
  runningAt,
  schoolCapacity,
  setEntry,
  SLOTS,
  slotAtMinute,
  type Timetable,
  type TimetableContext,
  type TimetableEntry,
} from "./timetable";
import { assignRoster, membersOfClass, poolLineup, type PoolLineup } from "./lineup";
import { enrollPopularity, guestDemandOf, passivePopularityFactor, talentPopularity } from "./popularity";
import {
  emptyGuestMonthly,
  guestPopularityDelta,
  isBusinessHours,
  openRoomsAt,
  pickArrival,
  guestRoomWeight,
  queueGiveUpChance,
  type GuestArrival,
  type GuestQueueEvent,
  type GuestMonthly,
  type GuestRoom,
} from "./guests";
import {
  emptyResearchBonus,
  isMaxLevel,
  levelOf,
  monthlyResearchPoints,
  researchBonusOf,
  researchCostFor,
  researchFailChance,
  researchPointsFor,
  researchTopic,
  RESEARCH_TOPICS,
  type ResearchBonus,
  type ResearchId,
  type ResearchLevels,
  type ResearchOutcome,
  type ResearchProject,
} from "./research";
import {
  addAchievement,
  competitionPoints,
  rankOf,
  recordTime,
  refreshRank,
  standardPoints,
  type RankUpEvent,
} from "./rank";
import { raceTimeFor } from "./race";
import {
  ALTITUDE,
  AUTOEVENT,
  CAMP,
  CAMPAIGN,
  CLASSPLAN,
  CLUBRANK,
  COACHING,
  MEET_COACH,
  CONDITION,
  DAILY,
  AMENITY,
  DORM,
  ENROLL,
  UNLOCK,
  EQUIPMENT,
  GUESTS,
  YOUJI_GAKUDO_WAIT_MONTHS,
  BIG_FACILITY,
  TRAINING_ROOM,
  INCOME,
  PRO_SALARY,
  INJURY,
  INTAKE,
  MAX_MEET_ENTRIES,
  SPECIAL_TRAINING,
  MAP,
  NEEDS,
  PASSION,
  POPULARITY,
  PRACTICE,
  RANK,
  RESEARCH,
  ROUTE,
  SHORTCOURSE,
  RETIRE,
  START,
  STROKE,
  TRAINING,
} from "../config/balance";

export type { ClassId, ClassDef } from "./classes";
export { CLASS_ORDER } from "./classes";

/**
 * ゲーム状態。クラスごとに実体としての選手（Student）を持つ。
 * 範囲：スクール運用・自動練習・合宿・短期教室・コーチ雇用・大会まで。
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * 暦の刻み。
 * 時計は「1日終わる → 週が1つ進む → 4回で1ヶ月」という粗さなので、
 * ゲーム内の1日を暦7日として扱い、1ヶ月＝28日と数える。
 * 高地合宿の「下山から大会まで何日か」はこの暦の上で計算する。
 */
const CALENDAR_DAYS_PER_STEP = 7; // 1ゲーム日 = 暦7日
const DAYS_PER_MONTH_STEPS = 4; // 4ゲーム日 = 1ヶ月

/**
 * 注目選手（★）に付けられる人数。
 *
 * HUD の1行に収まる数であり、かつ**追いかけられる数**。
 * 5人にすると名前が潰れるうえ、結局どれも見なくなる（＝印の意味が消える）。
 */
export const PIN_MAX = 3;
const CALENDAR_DAYS_PER_MONTH = CALENDAR_DAYS_PER_STEP * DAYS_PER_MONTH_STEPS; // 28
/** 大会はその月の半ば（月初から14日目）に行われるものとして逆算する。 */
const MEET_DAY_OF_MONTH = 14;
/** 主要大会を泳ぐ週：月初から何ゲーム日目か（14暦日 ÷ 7 ＝ 2 → 第3週）。 */
const MEET_WEEK_INDEX = MEET_DAY_OF_MONTH / CALENDAR_DAYS_PER_STEP;
/** 記録会はエントリーから何ゲーム日（＝週）あとに泳ぐか。 */
const TRIAL_LEAD_DAYS = 2;
/** 主要大会の出場確認は、開催の何ゲーム日（＝週）前から出すか。 */
const MAJOR_CONFIRM_LEAD_DAYS = 2;

/**
 * 成長タイプが好転する（合宿の特殊イベント『壁の突破』）。
 * 伸び悩んでいた子が、より長く伸びるタイプとして開花する。
 */
const GROWTH_UPGRADE: Partial<Record<GrowthType, GrowthType[]>> = {
  superEarly: ["normal", "sustained"],
  early: ["normal", "sustained"],
  normal: ["sustained", "late"],
  late: ["sustained"],
  sustained: ["sustained"],
};

function upgradeGrowthType(s: Student, rand: () => number): boolean {
  const options = GROWTH_UPGRADE[s.growthType];
  if (!options || options.length === 0) return false;
  const next = options[Math.floor(rand() * options.length)];
  if (next === s.growthType) return false;
  s.growthType = next;
  s.growthObserved = Math.min(100, s.growthObserved + 20);
  return true;
}

export interface EventResult {
  popularityGain: number;
  newEntrants: number;
  talentedAppeared: boolean;
  turnedAway: number; // 練習枠が足りず入会できなかった人数
}

export interface ShortCourseResult {
  ok: boolean;
  reason?: string;
  cost?: number;
  popularityGain?: number;
  newYouji?: number;
  newGakudo?: number;
  talented?: boolean;
  turnedAway?: number;
  /** 今回入会した子の id（お祝いの帯から一覧を開くのに使う）。 */
  newIds?: number[];
}

export interface CampEligibility {
  ok: boolean;
  reason?: string;
  proOffseason: boolean; // プロの通年合宿（体力低下が著しい）
}

/**
 * その選手が最後に行った合宿の成績。
 *
 * 【なぜ残すか】合宿は高い（海外は1人◆24,000〜80,000）のに、
 * 終わったあとの画面を閉じると**誰に効いたのかが消えて**いた。
 * 次にどの子を連れていくかを決められるよう、1人ぶん1件だけ持っておく。
 */
export interface CampRecord {
  /** 何年目の何月か。 */
  year: number;
  month: number;
  /** 合宿の種類（表示名）。 */
  label: string;
  /** 5能力の伸びの合計。 */
  gain: number;
  /** いちばん伸びた能力。 */
  bestStat: StatKey;
  /** 故障したか。 */
  injured: boolean;
}

export interface CampOutcome {
  student: Student;
  /** 出発前の能力（帰ってきた画面で「前 → 後」を出すのに使う）。 */
  before: Record<StatKey, number>;
  mult: number; // 実際に適用された効果倍率
  injured: boolean; // 故障が起きた
  gains: Record<StatKey, number>;
  strokeGain: number; // 熟練度の伸び
  conditionAfter: number;
  proOffseason: boolean;
  /** 合宿中に起きたイベント（無ければ null）。 */
  event: CampEvent | null;
  /** 高地：順応に失敗した。 */
  altitudeFailed: boolean;
  /** 高地：下山から次の大会までの日数（大会予定が無ければ null）。 */
  descentToMeet: number | null;
  /** 高地：その日数が入る効果帯のラベル。 */
  bandLabel: string | null;
}

/** 合宿を実施できるかの判定（タイプごとの条件も見る）。 */
export interface CampTypeStatus {
  ok: boolean;
  reason?: string;
}

/** 合宿画面に出す「次の大会までの日数」と、その日程で下山したときの効果帯。 */
export interface MeetTiming {
  /** 対象の大会（無ければ null）。 */
  comp: Competition | null;
  /** 次の大会までの暦日数。 */
  daysUntil: number;
  /** 今この合宿を打った場合、下山から大会まで何日か。 */
  descentToMeet: number;
  /** その日数が入る効果帯（範囲外は null）。 */
  band: ReturnType<typeof altitudeBand>;
}

export interface CampRunResult {
  ok: boolean;
  reason?: string;
  cost: number;
  /** 何週の合宿に出たか（出発できなければ 0）。 */
  weeks: number;
}

/**
 * 出発した合宿（2026-10-05）。終わるまで参加者はクラブを空ける。
 *
 * 以前は合宿を押したその場で伸びが付いていたので、「合宿に行った」感じがしなかった。
 * いまは期間（CAMP.minWeeks 以上・行き先で延びる）のあいだ選手がいなくなり、
 * 最後の週が明けたときに伸びが付いて、成果の画面が出る。
 */
export interface ActiveCamp {
  plan: CampPlan;
  /** 参加者の id（途中で引退・退会した子は帰ってきたときに飛ばす）。 */
  ids: number[];
  /** 全体の週数。 */
  weeks: number;
  /** 残りの週数（週が明けるたびに1ずつ減り、0で帰ってくる）。 */
  weeksLeft: number;
}

/** 帰ってきた合宿の成果（画面が受け取るまで持っておく）。 */
export interface FinishedCamp {
  label: string;
  weeks: number;
  outcomes: CampOutcome[];
}

/** 出場させた選手1人ぶんの結果と報酬。 */
export interface CompetitionEntryResult {
  student: Student;
  entrant: EntrantOutcome;
  reward: CompReward;
  /** 自己新記録を出した（演出で祝う）。 */
  selfBest: boolean;
  /**
   * これまでの自己ベスト（秒。まだ無ければ 0）。
   *
   * 【伸びを「秒」で見せるため】能力の伸びをゆっくりにしたので、
   * 数字のグラフはなかなか動かない。そのぶん**タイムがどれだけ縮んだか**が
   * 手ごたえの主役になる。演出側はこれと今回のタイムの差を出す。
   */
  prevBestSec: number;
  /** その大会・その種目の**大会新記録**を出した（さらに特別な演出）。 */
  meetRecord: boolean;
  /**
   * 大型施設（大型プール・低酸素トレーニングルーム）のおかげで縮んだ秒数（→ bigFacilityRaceFactor）。
   * 結果の画面に「🏟 −0.36秒」と出して、建てた効果を目に見せる。
   */
  facilityCutSec: number;
}

/**
 * 1レースぶんの結果。
 * 同じレースに複数人出せるので、entries は出場させた人数ぶん並ぶ。
 */
export interface CompetitionResult {
  outcome: RaceOutcome;
  /** その大会で増えた情熱（出場ぶん＋優勝ぶん。→ PASSION）。 */
  passion: number;
  entries: CompetitionEntryResult[];
  /** 自クラブで最も上位だった選手（見出しに出す）。出場0人なら null。 */
  best: CompetitionEntryResult | null;
  /** クラブに入った合計。 */
  totalGems: number;
  totalPopularity: number;
  /** 出場に支払った費用（人数ぶん）。 */
  entryCost: number;
  /** 市長からの祝い金（優勝したときだけ。大会につき1回 → SCALE_MAYOR_PRIZE）。 */
  mayorPrize: number;
  /** 記録会で出会ったコーチ（募集名簿に入った。出会わなければ null → MEET_COACH）。 */
  coachMet: RecruitCandidate | null;
}

/** リレー（12月の世界選手権）1回ぶんの結果。 */
export interface RelayResult {
  outcome: RelayOutcome;
  /** 自クラブの選手1人ぶんの取り分。 */
  entries: { student: Student; stroke: Stroke; time: number; gems: number; popularity: number }[];
  totalGems: number;
  totalPopularity: number;
  passion: number;
  /** 日本が優勝したか。 */
  won: boolean;
}

export interface RecruitCandidate {
  coach: Coach;
  cost: number;
  /**
   * 名簿に載った通算月（→ GameState.monthCount）。
   * COACHING.recruit.expireMonths を過ぎると「他所へ行った」として消える。
   */
  since: number;
  /** 記録会で出会ったコーチなら、その記録会の名前（→ MEET_COACH）。名簿で印を付ける。 */
  metAt?: string;
}

/**
 * 引退した選手（振り返りの演出と、コーチへの誘いに使う）。
 * 選手そのものは名簿から消えるので、見せたいものだけをここに残す。
 */
export interface RetiredRecord {
  studentId: number;
  name: string;
  age: number;
  grade: string;
  classId: ClassId;
  /** 引退した年（◯年目）。 */
  year: number;
  /** 自分で決めた引退か（false＝年齢による引退）。 */
  byChoice: boolean;
  /** 通算優勝・自己ベスト・格など、振り返りに出すもの。 */
  wins: number;
  rankTier: number;
  achievePoints: number;
  bestTimeSec: number;
  bestTimeEvent: RaceEvent | null;
  /** いちばん得意だった泳法と、その熟練度。 */
  bestStroke: Stroke;
  bestProf: number;
  /** クラブに残る年数（コーチの誘いを受けているか）。 */
  coachOffer: RecruitCandidate | null;
}

/** イベント／キャンペーンの識別子（月1回までの管理に使う）。 */
export type HoldableId = "trial" | "shortCourse" | "camp" | CampaignId;

export interface HoldStatus {
  ok: boolean;
  reason?: string;
}

export interface CampaignResult {
  ok: boolean;
  reason?: string;
  label?: string;
  cost?: number;
  popularityGain?: number;
  newYouji?: number;
  newGakudo?: number;
  turnedAway?: number; // 練習枠が足りず入会できなかった人数
  talented?: boolean;
  /** 今回入会した子の id（お祝いの帯から一覧を開くのに使う）。 */
  newIds?: number[];
}

/**
 * エントリーして、開催日を待っているレース（大会1つ・種目1つ・男女1組ぶん）。
 * 記録会はエントリーの2週間後、主要大会はその月の第3週に泳ぐ（→ GameState.racesDue）。
 */
export interface PendingRace {
  id: number;
  compId: string;
  event: RaceEvent;
  studentIds: number[];
  /** 泳ぐ日（dayCount）。この日になったら会場を開く。 */
  raceDay: number;
  /** エントリーのときに払った出場費（出られなくなった選手のぶんは当日返す）。 */
  paid: number;
}

/** 開催日のレースを泳ぐ準備（→ GameState.takePendingRace）。 */
export interface RaceDayPlan {
  comp: Competition | null;
  event: RaceEvent;
  /** 実際に泳ぐ選手。 */
  roster: Student[];
  /** ケガ・退会・クラスが変わったなどで出られなくなった選手。 */
  withdrawn: Student[];
  /** 欠場ぶんの返金。 */
  refund: number;
  /** 泳ぐ選手ぶんの出場費（払い済み）。 */
  prepaid: number;
}

/** 主要大会の出場確認に並べる1行（選手＋種目）。 */
export interface ConfirmCandidate {
  student: Student;
  event: RaceEvent;
}

/** 月替わりの結果（収支レポートに出す）。 */
export interface MonthRollResult {
  month: number;
  year: number;
  rolledYear: boolean;
  ageEvents: string[];
  /**
   * 今月「来月で退会」と予告された選手。
   * お知らせに1人ずつ流して、昇格させる機会を作る（→ FacilityScene）。
   */
  leavingSoon: Student[];
  /**
   * 卒園したのに学童の枠が空いていない子と、退会まであと何ヶ月か（→ GameState.gakudoWaiting）。
   * 2ヶ月のあいだ毎月出る。そのあいだに学童の枠が空けば、自動で学童へ移る。
   */
  gakudoWaiting: { student: Student; monthsLeft: number }[];
  /** この年度の変わり目に引退した選手（振り返りの演出に使う）。 */
  retiredNow: RetiredRecord[];
  income: number; // 月謝収入
  upkeep: number; // 設備の維持費
  salary: number; // コーチの給料
  paid: number; // 実際に支払えた額
  unpaid: number; // 資金不足で払えなかった額
  net: number; // 収支
  finance: MonthlyFinance;
  newEntrants: number; // 通常の入会（人気度に比例）
  turnedAway: number; // 練習枠が足りず断った人数
  /** 月例記録会（自動）で自己ベストを更新した人数。 */
  trialImproved: number;
  /** 今月の月例記録会で格が上がった選手。 */
  rankUps: RankUpEvent[];
  /** 設備・アイテムが生んだ人気度。 */
  facilityPopularity: number;
  /** クラブの格が上がったら通知（演出に使う）。 */
  clubRankUp: ClubRankUpEvent | null;
  /**
   * 今月決着した研究（成功・失敗の両方）。会議室が複数あれば複数返る。
   * 成功でレベルが1つ上がり、失敗すると進捗が半分に減って再挑戦になる。
   */
  researchDone: ResearchOutcome[];
  /** 今月の一般客の成績（来場・断り・売上）。 */
  guests: GuestMonthly;
  /** 一般客の満足度から動いた人気度。 */
  guestPopularity: number;
  /** 歩いて行けない部屋の数（0でなければ警告を出す）。 */
  stranded: number;
  /**
   * 【混雑の不満】設備が足りず使えなかった人（今月ぶん）。
   *   total  … のべ人数
   *   worst  … いちばん足りない設備と、その人数
   *   popularity … そのぶん下がった人気度（マイナスの値）
   *   notify … 大きく告知すべきか（→ GUESTS.crowdNoticeAt）
   */
  crowd: {
    total: number;
    worst: { kind: RoomKind; count: number } | null;
    /** 足りなかった設備の内訳（多い順）。 */
    byKind: { kind: RoomKind; count: number }[];
    popularity: number;
    notify: boolean;
  };
  /** 今月進んだ研究ポイント。 */
  researchGain: number;
  /**
   * 今月いちばん伸びた選手（上位3人・5能力の合計）。
   * 「設備やコーチへの投資が効いているか」を月ごとに実感させるための行。
   */
  growers: { name: string; total: number }[];
}

/** 月次の収支（月替わりのレポートに出す）。 */
export interface MonthlyFinance {
  tuition: number; // 月謝収入
  sponsor: number; // スポンサー収入（クラブの格と人気度で決まる）
  guest: number; // 一般客の利用料
  shop: number; // 売店の売上
  /** 大型プールの観客席の入場料（→ BIG_FACILITY.standIncome）。 */
  stands: number;
  upkeep: number; // 設備の維持費
  dorm: number; // 入寮者の食費・光熱費
  salary: number; // コーチ・スタッフの給料
  /** プロへの契約金（→ PRO_SALARY）。 */
  proSalary: number;
  net: number; // 収支（＋なら黒字）
  byClass: { classId: ClassId; count: number; perHead: number; total: number }[];
}

/** ライフステージの下→上（年齢制限の比較に使う）。 */
const STAGE_ORDER: LifeStage[] = ["preschool", "elementary", "middle", "high", "adult"];

/**
 * 昇格させられるクラス1つぶん（→ GameState.promotionTargets）。
 * 選べないものも理由つきで返すので、UI は「なぜ上げられないか」をそのまま出せる。
 */
export interface PromotionTarget {
  classId: ClassId;
  label: string;
  ok: boolean;
  /** 選べない理由（ok が false のときだけ入る）。 */
  reason?: string;
  /** いまの人数と定員（「あと何人入るか」を出すのに使う）。 */
  filled: number;
  capacity: number;
}


/**
 * 練習の手ごたえ（機嫌）を分ける体力の割合。
 * これを下回ると「疲れた状態での練習」、さらに下回ると「使い切った」扱いになる。
 */
const MOOD_TIRED_RATIO = 0.35;
const MOOD_EXHAUSTED_RATIO = 0.12;

/**
 * ケガをしている選手が毎日どれだけ落ち込むか（events.injured への倍率）。
 * ケガをした瞬間の落ち込みは1回ぶんで大きいので、日々のぶんは薄くしてある。
 */
const DAILY_INJURY_MOOD_WEIGHT = 0.25;

/** 練習で能力が上がったときの通知（画面の「+1」演出に使う）。 */
export type PracticeGainHandler = (student: Student, key: StatKey, amount: number) => void;

/**
 * 一般客が帰るときの結果（→ noteGuestSatisfied）。
 * 乱数を使う抽選は sim 側で済ませ、画面は結果を見せるだけにする、という約束。
 */
export interface GuestSatisfiedResult {
  /** その来場ぶんの満足度 0-100（★ゲージに出す）。 */
  satisfaction: number;
  /** 落とした貢献値（画面の `+9`。0 なら何も出さない）。 */
  contribution: number;
  /** その客ぶんで実際に増えた情熱（0 なら演出を出さない）。 */
  passion: number;
  /** 喜びのマーク（♪♥☺）を出すか。 */
  mark: boolean;
  /** その場で人気度が1上がったか（口コミ）。 */
  popularity: boolean;
}

/**
 * 能力の整数が1つ上がるごとに機嫌へ足す割合（events.grew への倍率）。
 *
 * スクール生は1コマに10回以上くり上がるので、そのまま足すと機嫌が振り切れる。
 * 「1コマ練習すると、伸びたぶんで少し気分が良くなる」くらいの重みに抑えてある。
 */
const GREW_MOOD_WEIGHT = 0.2;

/** 上昇したぶん（正の変化）だけを通知する。 */
function reportGains(s: Student, delta: Record<StatKey, number>, onGain: PracticeGainHandler): void {
  for (const k of TRAINABLE_KEYS) {
    const v = delta[k];
    if (v <= 0) continue;
    onGain(s, k, v);
    // 育成パネルの整数がくり上がった＝手ごたえがあった瞬間だけ、機嫌が少し上向く
    if (Math.floor(s.stats[k]) - Math.floor(s.stats[k] - v) > 0) applyMood(s, "grew", GREW_MOOD_WEIGHT);
  }
}


export interface GameStateOptions {
  /** クラブ名（新規ゲーム開始時にプレイヤーが決める）。 */
  clubName?: string;
}

export class GameState {
  clubName = "みなとスイミングクラブ";
  currentClassId: ClassId | null = null;
  popularity: number = START.popularity; // 0 以上・上限なし（集客のエンジン → sim/popularity.ts）

  /**
   * 所持ジェム（大会報酬・設備・給料などで増減する通貨）。
   *
   * **これがゲーム内で唯一の「所持金」**。画面ごとに控えを持たないこと。
   * 表示する側は必ず `state.gems` を読む（スナップショットを持つと、
   * その画面だけ古い額を出し続けて「ページごとに額が違う」になる）。
   *
   * 代入は必ずこのアクセサを通るので、**常に 0 以上の整数**に丸まる。
   * 小数のまま持つと、`◆1234` と出す画面と `◆1234.5999` と出す画面ができてしまう。
   */
  private _gems: number = START.gems;
  get gems(): number {
    return this._gems;
  }
  set gems(v: number) {
    this._gems = Math.max(0, Math.round(v));
  }
  year = 1;
  month = 4; // 春（中学地区予選）から開始
  championships = 0; // 通算優勝数（クラブ力＝コーチ募集の質に効く）
  /**
   * 【情熱】クラブ全体で1つのゲージ（0〜PASSION.max）。特別練習の燃料。
   *
   * 大会に出る・優勝する（育成の成果）と、一般客が満足して帰る（経営の成果）で溜まり、
   * 特別練習で使う。**買えない**ので、強くするには施設も回さないといけない。
   * 端数を持つ（客1人ぶんが 1.4 のように小数になるため）。表示は切り捨て。
   */
  passion: number = PASSION.start;
  readonly students: Record<ClassId, Student[]>;
  coaches: Coach[] = [];
  /** 専門スタッフ（栄養士・ドクター）。コーチとは別枠で、クラブ全体に効く。 */
  staff: StaffMember[] = [];
  /**
   * 通算のゲーム内日数。時計の1日ごとに +1 される。
   * 1ゲーム日 ＝ 暦7日（4日で1ヶ月）として扱い、
   * 高地合宿の「下山から大会まで何日か」の計算に使う。
   */
  dayCount = 0;
  /** エントリー済みで、開催日を待っているレース（→ PendingRace）。 */
  pendingRaces: PendingRace[] = [];
  /** 出場確認を出した主要大会（`年:大会ID`）。同じ大会の確認を何度も自動で出さない。 */
  meetConfirmAsked: string[] = [];
  /** 設置済みの設備（部屋）。gx/gy がマップ上の位置。null＝未配置（倉庫）。 */
  equipment: Equipment[] = [];
  /**
   * 買い足した敷地の段数（0＝初期の 12×12 マス）。
   * マスの配列は最初から最大の大きさなので、マス番号は拡張しても変わらない。
   */
  landSteps = 0;
  /**
   * 今月すでに特別練習をした選手のID。月替わりで空にする（1人につき月1回まで）。
   * セーブする（＝リロードで何度でも受けられる、を防ぐ）。
   */
  specialUsed: number[] = [];
  /**
   * 特別練習の「最後に受けた日」（`選手id|メニューid` → dayCount）。
   * 同じメニューを連発させないための一時値（セーブしない）。
   */
  /**
   * 今月の伸び（選手ID → 能力別の合計）。
   *
   * 「この投資に効果があったか」を目で見せるための集計。
   * セーブしない一時値なので、読み込んだ直後は空から始まる
   *（月替わりでどのみち空になるので、続きが消えても困らない）。
   */
  private monthGain = new Map<number, Record<StatKey, number>>();
  /**
   * 時間割：どのプールの、どのコマで、どのクラスを回すか。
   * プールが増えると同じ時間に別クラスを並行して回せる。
   */
  timetable: Timetable = [];
  /** 今月の一般客の成績（月次レポートに出す）。 */
  guestMonth: GuestMonthly = emptyGuestMonthly();
  /**
   * いま施設を使っている一般客（部屋と、いつ帰るか）。
   *
   * 以前は「入った数」だけを数え、帰るのを描画側（Visitor）から知らせていた。
   * すると画面に出せなかった客の席が永久に埋まったままになり、
   * 数ヶ月で全部屋が満員→売上ゼロ→人気度が0まで落ちる、という不具合になっていた。
   * いまは滞在時間で自動的に空くので、描画とは完全に切り離してある。
   */
  private guestSessions: { roomId: number; until: number }[] = [];
  /**
   * 【部屋の前の行列】満員で並んでいる一般客（並んだ順）。セーブ不要の一時値。
   * 席が空けば先頭から入り、待ちくたびれた客は不満を持って帰る（→ tickGuestQueue）。
   */
  private guestQueue: { id: number; roomId: number; since: number; arrival: GuestArrival }[] = [];
  private guestQueueSeq = 0;
  /** 画面に渡す「行列から入れた／帰った」の知らせ（takeGuestQueueEvents で取り出す）。 */
  private guestQueueEvents: GuestQueueEvent[] = [];
  /** 一般客の来場タイマーと通算時計（ゲーム内分。セーブ不要の一時値）。 */
  private guestTimer = 0;
  private guestClock = 0;
  /**
   * いまのコマと、そのコマで受付を通した一般客の数。
   * 受付は1コマにさばける人数が決まっているので、コマが替わるたびに数え直す。
   */
  private guestSlot = -1;
  private guestSlotAdmitted = 0;
  /**
   * 経路の計算結果のキャッシュ（invalidateMap() が呼ばれるまで使い回す）。
   * 毎フレーム何度も引かれるので、ここを作り直すと目に見えて重くなる。
   */
  private accessCache: { field: DistField; map: ClubMap } | null = null;
  private usableCache: { rooms: Equipment[]; ids: Set<number> } | null = null;
  /**
   * クラス単位の「全体練習」メニュー（育成B〜プロ）。
   * 基本は全員がこれを行い、個人指定した選手だけが自分のメニューを優先する。
   * null＝全体指定なし（各自の plan がそのまま使われる）。
   */
  classPlans: Record<ClassId, PracticePlan | null> = {
    youji: null,
    gakudo: null,
    ikuseiB: null,
    ikuseiA: null,
    senshu: null,
    pro: null,
  };
  /**
   * クラブの大会実績（クラブの格の材料）。
   * 選手が大会で稼いだ実績ポイントの一部が積まれる。
   */
  clubAchievement = 0;
  /** 現在のクラブの格（1..6）。演出のために保持する。 */
  clubRankTier = 1;
  /**
   * 進行中の研究。**会議室1部屋につき1件**（部屋を増やせば並行して進む）。
   * 1件につきコーチ RESEARCH.groupSize 人の班が要る。
   */
  researchProjects: ResearchProject[] = [];
  /**
   * テーマごとの到達レベル（0＝未研究）。
   * 効果はレベルに比例するので、同じテーマを重ねるほど強くなる。
   */
  researchLevels: ResearchLevels = {};
  /** 完了した研究から作った補正（毎回組み立て直さないようにキャッシュする）。 */
  private researchCache: ResearchBonus = emptyResearchBonus();
  /** 格が上がった通知（シーンが取り出して演出する）。 */
  private rankUpQueue: RankUpEvent[] = [];
  /**
   * 練習中に故障した選手（画面で知らせるための行列）。
   * 「疲労が溜まる → 調子が落ちる → まれにケガ」の最後の一歩が起きたことを、
   * プレイヤーが気づけるようにする（気づかないと詰め込みを直しようがない）。
   */
  private trainInjuryQueue: { student: Student; days: number }[] = [];
  /** クラス練習中かどうか（時間帯の開始・終了を1度だけ処理するため）。 */
  private sessionOpen: Partial<Record<ClassId, boolean>> = {};
  /**
   * そのクラスが今どのコマを走っているか（-1＝コマ不明）。
   * 同じクラスを続けて何コマも入れたとき、**コマの切れ目をここで見分ける**。
   * 切れ目で休憩を挟まないと、体力が尽きた1コマ目のまま2コマ目・3コマ目が空振りになる。
   */
  private sessionSlot: Partial<Record<ClassId, number>> = {};
  /** 今月すでに開催したイベント／キャンペーン（月替わりで空になる）。 */
  heldThisMonth: HoldableId[] = [];
  /**
   * 今月、混雑で設備を使えなかった人の数（部屋の種類ごと）。
   * 月が替わると0に戻る（→ noteCrowded）。
   */
  crowdMonth: Partial<Record<RoomKind, number>> = {};
  /**
   * 今月すでに「回復設備を使えなかった」と数えた選手（`種類:選手id`）。
   *
   * 【同じ子を毎コマ数えない】選手は毎日練習のあとに回復設備へ向かうので、
   * のべ回数で数えると 20人のクラブでも月に数百人「使えなかった」ことになっていた
   *（しかも全員ぶんを席数のいちばん多い1種類に押しつけていたので、
   *  マッサージエリアだけが何百人にもなった）。ここで1人1回にそろえる。
   */
  private crowdStudentMonth = new Set<string>();
  /**
   * 選手ごとの「最後に行った合宿の成績」（選手id → 記録）。
   * 次に誰を連れていくかを決める材料なので、**1人1件だけ**持つ（→ CampRecord）。
   */
  campLog: Record<number, CampRecord> = {};
  /** いま出かけている合宿（無ければ null → ActiveCamp）。セーブに残す。 */
  activeCamp: ActiveCamp | null = null;
  /** 帰ってきたばかりの合宿の成果。画面が takeFinishedCamp で受け取る（セーブには残さない）。 */
  private finishedCamp: FinishedCamp | null = null;
  /**
   * 【今月その部屋が使われた回数】部屋の id → のべ人数。月が替わると0に戻る。
   *
   * 同じ設備を2つ建てたとき「どちらが働いているか」を、建てた本人が確かめられるようにする
   *（→ 設備の情報パネル）。**部屋ごと**に数えるので、種類でまとめない。
   * 数えるのは
   *   ・回復設備を選手が使った（1人1回で+1）
   *   ・一般開放した部屋に客が入った（1人+1）
   */
  roomUse: Record<number, number> = {};
  /**
   * キャンペーンを続けて打った回数（ID別）。多いほど効果が落ちる。
   * 月替わりに1ずつ減る＝1ヶ月あけると新鮮さが戻る。
   */
  campaignRepeats: Partial<Record<CampaignId, number>> = {};
  /** チュートリアルの進行位置（-1＝実施しない/完了済み）。 */
  /** 【廃止】チュートリアルは無くなった（2026-09-18）。セーブの互換のために -1 のまま持つ。 */
  tutorialStep = -1;
  /**
   * 大会ごと・種目ごとの最高記録（クラブが出したタイム）。
   * 「大会新記録」の演出を出すためだけに持つ。キーは `${大会ID}:${泳法}${距離}`。
   */
  meetRecords: Record<string, number> = {};

  /** 今月の入会数／練習枠が足りず断った数（月次レポートに出す）。 */
  monthEnrolled = 0;
  monthTurnedAway = 0;
  private nextId = 1;
  private nextCoachId = 1;
  private nextEquipmentId = 1;
  private nextStaffId = 1;
  /**
   * 合宿イベント「名コーチとの出会い」で溜まる、次のコーチ募集への上乗せ。
   * 一度募集すると消費される。
   */
  scoutBoost = 0;
  /**
   * 値上げ（2026-10-02）より前のセーブを読み込んだ印。施設画面が一度だけお知らせを出して下ろす。
   * セーブの移行（migrate 31）が立てる。
   */
  priceRevisedNotice = false;
  /** 専門スタッフぶんの補正（雇用・解雇のたびに組み直す）。 */
  private staffCache: StaffBonus = emptyStaffBonus();
  /**
   * 自動イベント（入会・小ネタ）までの残り時間（ゲーム内分）。
   *
   * **0 のままにしてはいけない。** 0 だと最初の1フレームで即座に入会が起きるので、
   * タイトルへ行って戻るたびに1人ずつ増えてしまう（＝リロードで人を増やせてしまう）。
   * 新規作成時と読み込み後に resetAutoEventTimers() で必ず仕込み直すこと。
   */
  private enrollTimer = 0;
  private flavorTimer = 0;

  /**
   * ゲーム内の乱数の状態（セーブする）。
   *
   * **セーブ・ロードをまたいでも同じ流れが続くようにするための要。**
   * これが無いと、読み込むたびに乱数が引き直しになり、
   * 「同じところから始めたのに、入会する子のクラスが毎回ちがう」
   * ＝ セーブせずに戻るたびに名簿の内訳が変わる、ということが起きる。
   * （セーブし直すまで結果が確定しない＝やり直しで良い結果を引ける、という抜け道にもなる）
   */
  rngState = 1;

  /**
   * ゲーム内の乱数（xorshift32）。状態を1つの数値で持てるので、そのままセーブできる。
   * 生成のときだけ、外から渡された乱数で種を作る。
   */
  private rand = (): number => {
    let x = this.rngState | 0;
    if (x === 0) x = 0x9e3779b9;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x | 0;
    return (x >>> 0) / 4294967296;
  };

  constructor(seedRand: () => number, opts: GameStateOptions = {}) {
    // 種は外から（新規ゲームは時刻ベース、テストは固定値）。以降は自前の流れを使う。
    this.rngState = (Math.floor(seedRand() * 0xffffffff) | 0) || 0x9e3779b9;
    if (opts.clubName) this.clubName = opts.clubName;
    this.students = { youji: [], gakudo: [], ikuseiB: [], ikuseiA: [], senshu: [], pro: [] };
    // 才能ある子は上のクラスから配る（最初に開く選手カードが平凡だと、育てる相手が見つからない）
    let giftedLeft = START.gifted;
    for (const c of [...CLASS_ORDER].reverse()) {
      for (let i = 0; i < START.roster[c.id]; i++) {
        const gifted = giftedLeft > 0;
        if (gifted) giftedLeft--;
        this.students[c.id].push(this.joined(createStudent(this.rand, this.nextId++, c.id, { gifted, base: START.classBase[c.id] })));
      }
    }
    // コーチ：最小構成から（増やすほど毎月の給料が重くなる）。
    for (const h of START.coaches.heads) {
      const c = makeCoach(this.rand, this.nextCoachId++, h.quality);
      c.assigned = h.classId;
      this.coaches.push(c);
    }
    for (const q of START.coaches.bench) {
      this.coaches.push(makeCoach(this.rand, this.nextCoachId++, q));
    }
    // 設備：入口とプールの最小構成を配置する（道は敷かない＝更地はどこでも歩ける）。
    const usedSpots = new Set<number>();
    for (const kind of START.equipment) {
      const item: Equipment = { id: this.nextEquipmentId++, kind: kind as EquipmentKind, gx: null, gy: null };
      const spot = starterPlacementFor(item.kind, usedSpots);
      if (spot) {
        item.gx = spot.gx;
        item.gy = spot.gy;
      }
      this.equipment.push(item);
    }
    // 置ききれなかったぶんは自動配置＋道で接続（config を触ったときの保険）
    for (const e of this.equipment) {
      if (e.gx == null) {
        const spot = autoPlaceRoom(this.map(), e.kind, e.id);
        if (spot) {
          e.gx = spot.gx;
          e.gy = spot.gy;
        }
      }
    }
    this.invalidateMap();
    // 時間割：1つ目のプールに従来どおりの流れを入れておく。
    this.timetable = defaultTimetable(this.equipment);
    this.autoAssignCoaches();
    // 全体練習の既定メニュー（プレイヤーはいつでも変えられる）。
    for (const id of CLASSPLAN.assignable) {
      const init = CLASSPLAN.initial[id];
      if (init) this.classPlans[id] = { ability: init.ability, stroke: init.stroke as PracticePlan["stroke"] };
    }
    this.resetAutoEventTimers();
  }

  /**
   * 自動イベントのタイマーを、次の間隔ぶんに仕込み直す。
   *
   * ゲームを始めたときと、セーブを読み込んだ直後に呼ぶ。
   * これを忘れるとタイマーが0のまま＝**読み込んだ瞬間に入会が1人発生**し、
   * 「タイトルへ行って戻るたびに人数が増える」ことになる。
   */
  resetAutoEventTimers(): void {
    const members = this.totalMembers();
    this.enrollTimer = nextEnrollInterval(
      this.enrollMultiplier(),
      members,
      this.rand,
      this.intakePressure(),
    );
    this.flavorTimer = nextFlavorInterval(members, this.rand);
  }

  /** 自動イベントの残り時間（セーブ用）。 */
  get autoEventTimers(): { enroll: number; flavor: number } {
    return { enroll: this.enrollTimer, flavor: this.flavorTimer };
  }

  /** セーブから戻す（続きから同じ間隔で進むように）。 */
  setAutoEventTimers(enroll: number, flavor: number): void {
    this.enrollTimer = enroll;
    this.flavorTimer = flavor;
  }

  // -------------------------------------------------------------- セーブ/ロード連携

  /**
   * ID の採番カーソル（save/serialize.ts が保存・復元に使う）。
   * これを引き継がないと、ロード後に生成した選手が既存のIDと衝突する。
   */
  get idCursors(): { student: number; coach: number; equipment: number } {
    return { student: this.nextId, coach: this.nextCoachId, equipment: this.nextEquipmentId };
  }

  setIdCursors(student: number, coach: number, equipment = 1): void {
    this.nextId = Math.max(1, Math.floor(student));
    this.nextCoachId = Math.max(1, Math.floor(coach));
    this.nextEquipmentId = Math.max(1, Math.floor(equipment));
  }

  /** 在籍数（全クラス合計）。 */
  totalMembers(): number {
    return CLASS_ORDER.reduce((n, c) => n + this.students[c.id].length, 0);
  }

  // -------------------------------------------------------------- マップ（マス目・配置）

  /** 今のマップ。軽いビューなので毎回作ってよい。 */
  map(): ClubMap {
    return makeMap(this.equipment, this.landSteps);
  }

  /**
   * マップが変わったときに呼ぶ（経路のキャッシュを捨てる）。
   * 部屋を置く・動かす・撤去する／道を敷く・剥がす／セーブを読み込む、のあとで必ず呼ぶこと。
   */
  invalidateMap(): void {
    this.accessCache = null;
    this.usableCache = null;
  }

  /**
   * 入口からの距離場（キャッシュつき）。
   *
   * ここは1フレームに何度も呼ばれる（走っているレッスンの判定・一般客・コーチの出動…）。
   * 以前は毎回マップの署名文字列（全マスぶん）を組み立てて比較していたため、
   * それだけでスマホの操作が目に見えて重くなっていた。
   * いまは invalidateMap() が来るまで作り直さない。
   */
  private field(): { field: DistField; map: ClubMap } {
    if (!this.accessCache) {
      const map = this.map();
      this.accessCache = { field: entranceField(map), map };
    }
    return this.accessCache;
  }

  /** その部屋への行き方（歩いて行けるか・入口から何マスか）。 */
  accessTo(room: Equipment | number): RoomAccess {
    const e = typeof room === "number" ? this.equipment.find((x) => x.id === room) : room;
    if (!e) return { reachable: false, dist: -1, door: null, noRoad: true };
    const { field, map } = this.field();
    return accessOf(map, e, field);
  }

  /** その部屋は使えるか（配置済みで、入口から歩いて行ける）。 */
  isRoomUsable(room: Equipment | number): boolean {
    return this.accessTo(room).reachable;
  }

  /**
   * 実際に使える部屋だけ（効果の計算はすべてこれを通す）。
   * 毎フレーム何度も呼ばれるので、マップが変わるまで結果を使い回す。
   */
  usableEquipment(): Equipment[] {
    if (!this.usableCache) {
      const { field, map } = this.field();
      const rooms = placedRooms(map).filter((e) => accessOf(map, e, field).reachable);
      this.usableCache = { rooms, ids: new Set(rooms.map((e) => e.id)) };
    }
    return this.usableCache.rooms;
  }

  /** 使える部屋のID集合（「この部屋は使えるか」を何度も引くとき用）。 */
  usableRoomIds(): ReadonlySet<number> {
    this.usableEquipment();
    return this.usableCache!.ids;
  }

  /** 歩いて行けない部屋（警告に出す）。 */
  strandedRooms(): { room: Equipment; access: RoomAccess }[] {
    return strandedRooms(this.map());
  }

  /** 未配置（買ったがまだ置いていない）部屋。 */
  unplacedEquipment(): Equipment[] {
    return this.equipment.filter((e) => e.gx == null || e.gy == null);
  }

  /** 動線の良さ（練習に効く倍率 0.6〜1.0）。入口から近いほど良い。 */
  routeEfficiency(): number {
    return facilityRouteEfficiency(this.map());
  }

  /** その部屋までの動線の良さ。 */
  routeEfficiencyOf(room: Equipment | number): number {
    const a = this.accessTo(room);
    return a.reachable ? routeEfficiency(a.dist) : 0;
  }

  /**
   * 部屋を置く／動かす。ok=false のときは理由を返す。
   * rot を渡すと向きも変える（省略時はいまの向きのまま）。
   */
  placeRoom(
    room: Equipment,
    gx: number,
    gy: number,
    charge = true,
    rot: RoomRot = rotOf(room),
  ): { ok: boolean; reason?: string } {
    const check = canPlaceAt(this.map(), room.kind, gx, gy, room.id, rot);
    if (!check.ok) return check;
    const moving = room.gx != null;
    const cost = moving && charge ? MAP.moveCost : 0;
    if (cost > this.gems) return { ok: false, reason: `移動には◆${cost} かかる` };
    this.gems -= cost;
    room.gx = gx;
    room.gy = gy;
    // 回していない部屋には rot を持たせない（セーブと署名を今までと同じ形に保つ）
    if (rot === 1) room.rot = 1;
    else delete room.rot;
    this.invalidateMap();
    this.pruneTimetableNow();
    this.syncResearch(); // 会議室をしまったら、その部屋の研究は移すか止める
    return { ok: true };
  }

  // -------------------------------------------------------------- 配置モード（買ってから置く）

  /**
   * その位置に置けるか（配置モードのゴーストが毎フレーム聞く）。
   * 敷地の外／重なり／設備ごとのきまり／通路をふさぐ、を理由つきで返す。
   */
  checkPlacement(kind: EquipmentKind, gx: number, gy: number, ignoreId?: number, rot: RoomRot = 0) {
    return checkPlacement(this.map(), kind, gx, gy, ignoreId, rot);
  }

  /**
   * 買って、その場に置く。
   *
   * **確定したここで初めて課金する。** 配置モードを取り消したときに
   * お金が減っていないのは、購入処理をこの1か所に閉じ込めているため。
   */
  buyAndPlaceRoom(
    kind: EquipmentKind,
    gx: number,
    gy: number,
    rot: RoomRot = 0,
  ): { ok: boolean; reason?: string; item?: Equipment } {
    const afford = this.canBuyEquipment(kind);
    if (!afford.ok) return afford;
    const spot = checkPlacement(this.map(), kind, gx, gy, undefined, rot);
    if (!spot.ok) return { ok: false, reason: spot.reason };

    const paid = this.equipmentCost(kind);
    this.gems -= paid;
    const item: Equipment = { id: this.nextEquipmentId++, kind, gx, gy, grade: 1, paid, ...(rot === 1 ? { rot } : {}) };
    this.equipment.push(item);
    this.invalidateMap();
    // プールを増やしたら、時間割の受け皿を用意する
    if (equipmentDef(kind).lanes > 0 && this.timetable.length === 0) {
      this.timetable = defaultTimetable(this.equipment);
      this.autoAssignCoaches();
    }
    return { ok: true, item };
  }

  /** 配置モードに出す1行（設備名／サイズ／価格／所持／設置後）。 */
  placementSummary(target: PlacementTarget, rot: RoomRot = 0): string {
    return placementSummary(target, this.gems, rot);
  }

  /** 部屋をマップから外して倉庫へ戻す（撤去ではない）。 */
  storeRoom(room: Equipment): { ok: boolean; reason?: string } {
    const guard = this.poolRemovalGuard(room);
    if (!guard.ok) return guard;
    room.gx = null;
    room.gy = null;
    this.invalidateMap();
    this.pruneTimetableNow();
    return { ok: true };
  }

  /** そのマスにある部屋（建設モードの選択に使う）。 */
  roomAtCell(gx: number, gy: number): Equipment | null {
    return roomAt(this.map(), gx, gy);
  }

  /** 敷地の使用状況（建設画面の見出しに出す）。 */
  landUsage(): { rooms: number; free: number; total: number } {
    return usedCells(this.map());
  }

  // -------------------------------------------------------------- 敷地の拡張

  /** いま建てられる敷地の一辺（マス）。 */
  landSize(): number {
    return landInnerSize(this.landSteps);
  }

  /** 次の1段を買う値段（広げるほど大幅に高くなる）。 */
  landExpandCost(): number {
    return landExpandCost(this.landSteps);
  }

  /** 敷地を広げられるか（理由つき）。 */
  canExpandLand(): { ok: boolean; reason?: string } {
    if (!canExpandLand(this.landSteps)) return { ok: false, reason: "これ以上は広げられない" };
    const cost = this.landExpandCost();
    if (this.gems < cost) return { ok: false, reason: `◆${cost} 足りない` };
    return { ok: true };
  }

  /**
   * 敷地を1段ぶん買い足す（四方に MAP.expandStep マスずつ広がる）。
   * 外周の道路も一緒に外へ動くので、入口の位置は建て直さなくてよい
   *（入口は「敷地の縁に接していること」で判定するため、縁が動けば自動的に付いてくる）。
   */
  expandLand(): { ok: boolean; reason?: string; cost?: number; size?: number } {
    const st = this.canExpandLand();
    if (!st.ok) return st;
    const cost = this.landExpandCost();
    const before = landBoundsOf(this.landSteps);
    this.gems -= cost;
    this.landSteps = clampLandSteps(this.landSteps + 1);
    this.invalidateMap();
    // 敷地を広げると外周の道路が外へ動くので、そのままでは
    // 「縁に面していた入口」が敷地の内側に取り残されて、クラブ全体が使えなくなる。
    // 入口そのものを新しい縁まで動かし、抜けたあとを道で埋めて中と繋ぐ。
    this.moveEntrancesToEdge(before);
    return { ok: true, cost, size: this.landSize() };
  }

  /**
   * 入口が表通りに出られない状態なら、縁まで動かして繋ぎ直す。
   *
   * 読み込みの最後に呼ぶ保険。入口が塞がっていると全ての部屋が「行けない」になり、
   * 練習も収入も止まってしまうので、ここだけは自動で直す。
   */
  ensureEntranceAccess(): void {
    const map = this.map();
    const gates = placedRooms(map).filter((e) => e.kind === "entrance");
    if (gates.length === 0) return;
    if (gates.some((g) => entranceOpen(map, g))) return;
    this.moveEntrancesToEdge(landBounds(map));
  }

  /**
   * 敷地を広げたあと、**入口そのものを新しい縁まで動かす**。
   *
   * 入口は「建物の外と行き来する門」なので、敷地の内側に取り残されると
   * 見た目もおかしいし（塀の内側に玄関がある）、そこから外周までの私道が
   * 敷地の中を一本まるごと占領してしまう。広げたぶんだけ外へ動かせば、
   * 入口はいつでも塀のところにあり、内側は自由に使える。
   *
   * 動かしたあと、抜けたあとの帯を道で埋めて、中の通路と繋ぎ直す。
   * 新しく買った土地は必ず更地なので、外へ動かす先が塞がっていることはない。
   */
  private moveEntrancesToEdge(before: LandBounds): void {
    const b = landBounds(this.map());
    for (const gate of placedRooms(this.map())) {
      if (gate.kind !== "entrance") continue;
      const f = roomSize(gate);
      const gx = gate.gx as number;
      const gy = gate.gy as number;

      // 【動かさなくていい入口は動かさない】
      // ブロック追加方式では敷地の**左上の角は動かない**ので、
      // 上か左の縁に面した入口は拡張しても縁に面したまま。そのままにしておく。
      if (touchesPerimeter(this.map(), gate)) continue;

      // 広げる前の敷地で、どの辺に面していたか（＝入口が向いている方向）。
      // 上・左は二度と動かない縁なので、迷ったらそちらへ寄せる（何度も引っ越さないため）。
      const stable = MAP.expandStep / 2;
      const cands: { dx: number; dy: number; d: number }[] = [
        { dx: 0, dy: -1, d: gy - before.y0 - stable },
        { dx: 0, dy: 1, d: before.y1 - (gy + f.h - 1) },
        { dx: -1, dy: 0, d: gx - before.x0 - stable },
        { dx: 1, dy: 0, d: before.x1 - (gx + f.w - 1) },
      ];
      cands.sort((a, c) => a.d - c.d);
      const dir = cands[0];

      // その向きの新しい縁にぴったり寄せた位置
      const nx = dir.dx === 0 ? gx : dir.dx > 0 ? b.x1 - f.w + 1 : b.x0;
      const ny = dir.dy === 0 ? gy : dir.dy > 0 ? b.y1 - f.h + 1 : b.y0;
      if (nx === gx && ny === gy) continue;

      // 移動先に部屋があるなら動かさない（私道で繋ぐ側の処理にまかせる）
      let blocked = false;
      for (let y = 0; y < f.h && !blocked; y++) {
        for (let x = 0; x < f.w; x++) {
          const other = roomAt(this.map(), nx + x, ny + y);
          if (other && other.id !== gate.id) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      gate.gx = nx;
      gate.gy = ny;
      // 抜けたあとは更地に戻るだけ（更地はそのまま歩けるので、道を敷き直す必要はない）
      this.invalidateMap();
    }
  }

  // -------------------------------------------------------------- 時間割（プール×コマ）

  /** 時間割の判定に使う文脈（プールが使えるか・コーチがいるか）。 */
  private timetableCtx(): TimetableContext {
    const usable = this.usableRoomIds();
    return {
      equipment: this.equipment,
      reachable: (poolId) => usable.has(poolId),
      hasCoach: (coachId) => this.coaches.some((c) => c.id === coachId),
      // 同じ時間に成り立たない割り当て（コーチの掛け持ち・育成クラスの重複）
      conflicts: timetableConflicts(this.timetable),
    };
  }

  /** 使えるプール（配置済み＋歩いて行ける）。 */
  usablePools(): Equipment[] {
    const usable = this.usableRoomIds();
    return poolsOf(this.equipment).filter((p) => usable.has(p.id));
  }

  /** 所有しているプールの本数（未配置も含む＝購入上限の判定に使う）。 */
  poolCount(): number {
    return this.equipment.filter((e) => isPool(e.kind)).length;
  }

  /** 配置済みのプール（時間割に並べられる本数）。 */
  placedPools(): Equipment[] {
    return poolsOf(this.equipment);
  }

  /** 時間割に並べられる部屋（プール＋医科学センター・低酸素トレーニングルーム）。 */
  placedVenues(): Equipment[] {
    return venuesOf(this.equipment);
  }

  /**
   * そのクラスが**いまのコマ**で練習している練習の部屋（プールなら null）。
   * コマは beginClassSession が覚えている（→ sessionSlot）。
   */
  private trainingRoomOf(classId: ClassId): Equipment | null {
    const room = this.sessionVenueOf(classId);
    return room && isTrainingRoom(room.kind) ? room : null;
  }

  /** そのクラスがいまのコマで使っている部屋（プール・練習の部屋。コマ不明なら null）。 */
  private sessionVenueOf(classId: ClassId): Equipment | null {
    const slot = this.sessionSlot[classId] ?? -1;
    if (slot < 0) return null;
    const e = this.timetable.find((x) => x.slot === slot && x.classId === classId);
    return (e ? this.equipment.find((x) => x.id === e.poolId) : undefined) ?? null;
  }

  poolLabelOf(poolId: number): string {
    return poolLabel(this.equipment, poolId);
  }

  /** 時間割を設定する（classId=null で空きコマに戻す）。 */
  setTimetableEntry(
    poolId: number,
    slot: number,
    classId: ClassId | null,
    coachId: number | null,
  ): { ok: boolean; reason?: string } {
    if (classId) {
      /**
       * 【時間割のきまり】
       *
       * 育成B以上は、同じクラスを同じ時間に2つ入れられない（全員で同じ練習をするので、
       * 分けても同じ顔ぶれが両方に入るだけ）。別のクラスどうしなら並行してよい
       *（プール①で育成B、プール②で選手 ＝ 成立する）。
       *
       * **スクール（幼児・学童）は重ねられる**（2026-09-19）。在籍100人の習い事で、
       * 1コマに入れるのは「そのプールの練習枠」まで。同じ時間に2つのプールで開ければ
       * 受け入れ人数がそのぶん増える。誰がどちらに入るかは sim/lineup.ts が
       * 重複なく振り分けるので、同じ子が2箇所に出ることはない。
       * ただしコーチは体が1つなので、2つ並べるならコーチも2人要る（下のチェック）。
       */
      // 練習の部屋（医科学・低酸素）は育成B以上だけ
      const venue = this.equipment.find((e) => e.id === poolId);
      if (venue && isTrainingRoom(venue.kind) && isSchoolClass(classId)) {
        return { ok: false, reason: "スクールは使えない（育成B以上）" };
      }
      if (!isSchoolClass(classId)) {
        const same = entriesAtSlot(this.timetable, slot).find(
          (e) => e.poolId !== poolId && e.classId === classId,
        );
        if (same) {
          return {
            ok: false,
            reason: `${classDef(classId).label}はこの時間にもう入っている（同じクラスは重ねられない）`,
          };
        }
      }
      // コーチは体が1つ。同じ時間に別のプールは担当できない
      if (coachId != null) {
        const clash = entriesAtSlot(this.timetable, slot).some(
          (e) => e.coachId === coachId && e.poolId !== poolId,
        );
        if (clash) return { ok: false, reason: "そのコーチは同じ時間に別のプールを担当している" };
      }
    }
    this.timetable = setEntry(this.timetable, poolId, slot, classId, coachId);
    this.syncHeadCoaches(); // 監督は時間割から自動で決まる
    return { ok: true };
  }

  timetableEntryAt(poolId: number, slot: number): TimetableEntry | null {
    return this.timetable.find((e) => e.poolId === poolId && e.slot === slot) ?? null;
  }

  /** そのコマが実際に開講できているか（理由つき）。 */
  timetableStatus(e: TimetableEntry): { ok: boolean; reason?: string } {
    return entryStatus(e, this.timetableCtx());
  }

  /** 開講できているコマだけ。 */
  activeTimetable(): TimetableEntry[] {
    return activeEntries(this.timetable, this.timetableCtx());
  }

  /** 今この瞬間に走っているレッスン（複数プールなら複数返る）。 */
  runningLessons(minute: number): TimetableEntry[] {
    return runningAt(this.timetable, minute, this.timetableCtx());
  }

  /** 今この瞬間に練習しているクラス（重複なし）。 */
  activeClassIds(minute: number): ClassId[] {
    const out: ClassId[] = [];
    for (const e of this.runningLessons(minute)) {
      if (!out.includes(e.classId)) out.push(e.classId);
    }
    return out;
  }

  /** 存在しないプール・コーチを指す割り当てを掃除する。 */
  private pruneTimetableNow(): void {
    this.timetable = pruneTimetable(this.timetable, this.timetableCtx());
  }

  /**
   * 今この時刻の顔ぶれ（だれがどのコマのどのプールで練習するか）。
   *
   * 割り当ては週ぜんたいで決まる＝**1人が練習するのは1コマだけ**。
   * 学童50人でコマが2つなら、1コマ目に50人・2コマ目は誰も来ない。
   * 画面表示も練習の適用も、必ずこの結果を通す（同じ人が2回練習しない）。
   */
  lineupAt(minute: number): PoolLineup[] {
    const ctx = this.timetableCtx();
    return poolLineup(
      activeEntries(this.timetable, ctx),
      runningAt(this.timetable, minute, ctx),
      this.equipment,
      (c) => this.students[c],
      {
        canUse: (poolId) => ctx.reachable(poolId),
        // 休養中・リハビリ中・大会遠征中の選手は練習に来ない。
        // 休養は「いつまで」で持っているので（→ student.isResting）、取り消せばその場で戻る。
        attends: (s) => !isResting(s, this.dayCount) && !s.inRehab && s.awayDays <= 0 && !this.isAtCamp(s),
      },
    );
  }

  /** そのクラスで今練習している選手（複数プールなら合算）。 */
  practicingNow(minute: number, classId: ClassId): Student[] {
    return membersOfClass(this.lineupAt(minute), classId);
  }

  /**
   * 週の割り当て表（コマ → そのコマで練習する選手）。
   * 時間割画面で「このコマは何人使っているか」を出すのに使う。
   */
  rosterAssignment(): Map<string, Student[]> {
    const ctx = this.timetableCtx();
    return assignRoster(activeEntries(this.timetable, ctx), this.equipment, (c) => this.students[c], {
      canUse: (poolId) => ctx.reachable(poolId),
    });
  }

  /** そのコマに割り当てられている人数（0＝その時間は誰も使わない）。 */
  assignedCount(poolId: number, slot: number): number {
    return this.rosterAssignment().get(`${poolId}:${slot}`)?.length ?? 0;
  }

  /** ロード後などに、時間割を今の持ち物に合わせて整える。 */
  syncTimetable(): void {
    this.pruneTimetableNow();
    this.resolveCoachConflicts();
    if (this.timetable.length === 0) this.timetable = defaultTimetable(this.equipment);
    this.autoAssignCoaches();
    this.syncHeadCoaches();
  }

  /**
   * 同じ時間に成り立たない割り当てを直す（古いセーブのために読み込み時にも呼ぶ）。
   *  ・コーチの掛け持ち … 担当を外す（autoAssignCoaches が空いているコーチで埋め直す）
   *  ・同じクラスの重複 … そのコマ自体を空きに戻す（育成B以上は同じ時間に1つだけ。
   *    スクールは重ねてよいので、timetableConflicts が拾わない）
   */
  resolveCoachConflicts(): number {
    const bad = timetableConflicts(this.timetable);
    if (bad.size === 0) return 0;
    let n = 0;
    const drop: TimetableEntry[] = [];
    for (const e of this.timetable) {
      const c = bad.get(`${e.poolId}:${e.slot}`);
      if (!c) continue;
      n++;
      if (c.kind === "class") drop.push(e);
      else e.coachId = null;
    }
    if (drop.length > 0) this.timetable = this.timetable.filter((e) => !drop.includes(e));
    return n;
  }

  /**
   * 空いているコーチを、担当が付いていないコマへ順に割り当てる。
   * 新規ゲームと「おまかせ」ボタンで使う（プレイヤーはあとで自由に組み替えられる）。
   */
  autoAssignCoaches(): number {
    let assigned = 0;
    for (const slot of SLOTS.map((_, i) => i)) {
      const used = new Set(
        entriesAtSlot(this.timetable, slot)
          .map((e) => e.coachId)
          .filter((id): id is number => id != null),
      );
      for (const e of entriesAtSlot(this.timetable, slot)) {
        if (e.coachId != null && this.coaches.some((c) => c.id === e.coachId)) continue;
        // そのクラスの監督を最優先、次に空いているコーチ
        const head = this.headCoachOf(e.classId);
        const pick =
          head && !used.has(head.id) ? head : this.coaches.find((c) => !used.has(c.id));
        if (!pick) continue;
        e.coachId = pick.id;
        used.add(pick.id);
        assigned++;
      }
    }
    this.syncHeadCoaches();
    return assigned;
  }

  /** そのコマに担当できるコーチ（同じ時間に他のプールへ入っていない人）。 */
  availableCoachesFor(slot: number, poolId: number): Coach[] {
    const busy = new Set(
      entriesAtSlot(this.timetable, slot)
        .filter((e) => e.poolId !== poolId)
        .map((e) => e.coachId)
        .filter((id): id is number => id != null),
    );
    return this.coaches.filter((c) => !busy.has(c.id));
  }

  // -------------------------------------------------------------- 設備 / 練習枠

  /**
   * 使えるプールの練習枠合計（1レーン10人 × レーン数）。
   * 未配置・歩いて行けないプールは数えない（＝置いて繋いで初めて役に立つ）。
   */
  trainingSlots(): number {
    return totalTrainingSlots(this.usableEquipment());
  }

  /**
   * そのクラスの在籍上限。**この関数がクラス定員の唯一の窓口**。
   *
   *  育成B以上   … classes.ts に書いた固定の定員（育成B24 / 育成A24 / 選手18 / プロ8）。
   *                プールを増やしても増えない（少人数の特別クラスなので）。
   *  スクール     … 開講したコマ数 × そのプールの練習枠
   *                ＝「コマを増やすと定員が増える」。コマにはコーチが要る（給料とのトレードオフ）。
   *
   * さらにクラブ全体の受け入れ上限（intakeLimit）が別に掛かる（→ roomIn）。
   */
  capacityOf(classId: ClassId): number {
    if (!isSchoolClass(classId)) return classDef(classId).capacity;
    return schoolCapacity(this.timetable, classId, this.timetableCtx());
  }

  /** 育成B以上の定員の内訳（UIの説明に出す）。 */
  ikuseiCapacityNote(classId: ClassId): string {
    return `${classLabel(classId)}の定員は ${this.capacityOf(classId)}人（プールを増やしても変わらない）`;
  }

  /** そのクラスに割り当てているコマ数（UIの説明に出す）。 */
  slotCountFor(classId: ClassId): number {
    return this.activeTimetable().filter((e) => e.classId === classId).length;
  }

  // -------------------------------------------------------------- 寮

  /** 寮の収容人数（使える寮の数 × 1棟あたりの定員）。 */
  dormCapacity(): number {
    const rooms = this.usableEquipment().filter((e) => e.kind === "dorm").length;
    return rooms * DORM.capacityPerRoom;
  }

  // -------------------------------------------------------------- 注目選手（★）

  /**
   * 注目選手（HUD に小さく出して追いかける選手）。名簿に並んでいる順。
   *
   * 在籍が100人を超えると「誰を見ればいいか」が分からなくなり、
   * 成長が遅いこの遊びでは**自分の子**が居ないまま数年が過ぎてしまう。
   * ★を付けた数人だけ、自己ベストや昇格がその場で HUD に流れる。
   */
  pinnedStudents(): Student[] {
    const out: Student[] = [];
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) if (s.pinned) out.push(s);
    }
    return out.slice(0, PIN_MAX);
  }

  /** ★を付けられるか（上限に達していないか）。 */
  canPin(s: Student): HoldStatus {
    if (s.pinned) return { ok: true };
    if (this.pinnedStudents().length >= PIN_MAX) {
      return { ok: false, reason: `注目できるのは${PIN_MAX}人まで（どれかの★を外そう）` };
    }
    return { ok: true };
  }

  /**
   * ★を付け外しする。付けられたら true。
   * **上限を超えたときに古い★を勝手に外さない**（プレイヤーが選んだ印を黙って消さない）。
   */
  togglePin(s: Student): { ok: boolean; pinned: boolean; reason?: string } {
    if (s.pinned) {
      s.pinned = false;
      return { ok: true, pinned: false };
    }
    const can = this.canPin(s);
    if (!can.ok) return { ok: false, pinned: false, reason: can.reason };
    s.pinned = true;
    return { ok: true, pinned: true };
  }

  /** 入寮している選手。 */
  dormResidents(): Student[] {
    const out: Student[] = [];
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) if (s.inDorm) out.push(s);
    }
    return out;
  }

  dormFree(): number {
    return Math.max(0, this.dormCapacity() - this.dormResidents().length);
  }

  canEnterDorm(s: Student): HoldStatus {
    if (s.inDorm) return { ok: false, reason: "すでに入寮している" };
    if (!this.dormEligible(s)) return { ok: false, reason: "入寮できるのは高校生から" };
    if (this.dormCapacity() === 0) return { ok: false, reason: "寮がない（建てて道を繋ごう）" };
    if (this.dormFree() <= 0) return { ok: false, reason: "寮が満室" };
    return { ok: true };
  }

  /** 入寮できる学年か（高校生以上）。 */
  dormEligible(s: Student): boolean {
    return (DORM.minStages as readonly string[]).includes(lifeStageOf(s.grade));
  }

  /** 入寮の候補（高校生以上で、まだ入っていない選手）。 */
  dormCandidates(): Student[] {
    const out: Student[] = [];
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        if (!s.inDorm && this.dormEligible(s)) out.push(s);
      }
    }
    return out.sort((a, b) => b.stats.form - a.stats.form);
  }

  enterDorm(s: Student): { ok: boolean; reason?: string } {
    const check = this.canEnterDorm(s);
    if (!check.ok) return check;
    s.inDorm = true;
    return { ok: true };
  }

  leaveDorm(s: Student): void {
    s.inDorm = false;
  }

  /** 寮を減らしたときに、あぶれた選手を退寮させる（戻り値＝退寮した人数）。 */
  enforceDormCapacity(): number {
    const cap = this.dormCapacity();
    const residents = this.dormResidents();
    let out = 0;
    for (let i = cap; i < residents.length; i++) {
      residents[i].inDorm = false;
      out++;
    }
    return out;
  }

  /** 入寮者ぶんの月額（食費・光熱費）。維持費とは別に掛かる。 */
  dormMonthlyCost(): number {
    return this.dormResidents().length * DORM.costPerHead;
  }

  // -------------------------------------------------------------- 一般客（空きコマの収入）

  /** 今この瞬間、一般開放している部屋。 */
  guestRoomsNow(minute: number): GuestRoom[] {
    const slot = slotAtMinute(minute);
    if (slot < 0) return [];
    const usable = this.usableRoomIds();
    return openRoomsAt(this.equipment, this.timetable, slot, (id) => usable.has(id));
  }

  /**
   * 一般客の来場を進める。
   * 営業時間内だけ、空きコマの部屋に人が来て料金を落とす。
   * 歩いて行けない部屋を目指した客は、辿り着けずに帰る（収入にならない）。
   */
  tickGuests(minute: number, minutes: number): GuestArrival[] {
    if (minutes <= 0) return [];
    // 滞在時間の切れた客はここで帰る（描画の有無に関係なく席が空く）
    this.guestClock += minutes;
    if (this.guestSessions.length > 0) {
      this.guestSessions = this.guestSessions.filter((s) => s.until > this.guestClock);
    }
    if (!isBusinessHours(minute)) {
      this.guestTimer = 0;
      this.dropGuestQueue(); // 閉館：並んでいた客は帰る（不満には数えない）
      return [];
    }
    const slot0 = slotAtMinute(minute);
    if (slot0 < 0) {
      this.dropGuestQueue();
      return [];
    }
    const rooms = this.guestRoomsNow(minute);
    this.tickGuestQueue(rooms, minutes);
    if (rooms.length === 0) return [];
    const slot = slot0;
    // コマが替わったら受付の受け入れ数をリセットする（受付は1コマごとにさばく）
    if (slot !== this.guestSlot) {
      this.guestSlot = slot;
      this.guestSlotAdmitted = 0;
    }
    const slotMinutes = Math.max(1, (SLOTS[slot]?.end ?? 0) - (SLOTS[slot]?.start ?? 0));
    // レッスン中は自クラブの選手も使っているぶん、一般客の入れる余地が減る
    // （枠だけでなく来場そのものも減らす。openRoomsAt が枠を減らしているのと揃える）
    const lessonRunning = this.runningLessons(minute).length > 0;
    const share = lessonRunning ? GUESTS.classCrowdRatio : 1;
    // 【時間帯のメリハリ】放課後・仕事帰りは混み、昼下がりはガランとする（→ sim/daytime.ts）
    const busy = crowdFactorAt(minute);
    // 部屋の数ではなく「重み」の合計で呼ぶ（大にした部屋はそのぶん人が来る → guestRoomWeight）
    const weight = rooms.reduce((a, r) => a + guestRoomWeight(r), 0);
    const rate =
      (GUESTS.basePerSlot * weight * this.guestDemandMultiplier() * share * busy) / slotMinutes;
    if (rate <= 0) return [];

    this.guestTimer += minutes * rate;
    const out: GuestArrival[] = [];
    let guard = 0;
    while (this.guestTimer >= 1 && guard < GUESTS.maxArrivalsPerTick) {
      this.guestTimer -= 1;
      guard++;
      const a = pickArrival(rooms, (id) => this.guestCountIn(id), this.rand, (id) => this.guestQueueLen(id));
      if (!a) break;
      if (a.queued) {
        // 【満員なら並ぶ】料金・利用はまだ。入れたときに admitGuest で数える
        a.queueId = ++this.guestQueueSeq;
        this.guestQueue.push({ id: a.queueId, roomId: a.roomId, since: this.guestClock, arrival: a });
        out.push(a);
        continue;
      }
      // 【受付は廃止】入口があれば入館できる。混雑は部屋の定員だけで決まる。
      if (!a.turnedAway) this.guestSlotAdmitted += 1;
      if (a.turnedAway) {
        this.guestMonth.turnedAway += 1;
        // 満員で帰った客（crowded）と、歩いて行けずに帰った客を分けて数える（→ guestPopularityDelta）
        if (a.crowded) {
          this.guestMonth.crowded += 1;
          // どの設備が足りないかを名指しできるよう、部屋の種類で数える
          const room = this.equipment.find((e) => e.id === a.roomId);
          if (room) this.noteCrowded(room.kind);
        } else this.guestMonth.lockedOut += 1;
      } else {
        this.guestMonth.served += 1;
        this.guestMonth.income += a.paid;
        this.gems += a.paid;
        if (a.crowded) this.guestMonth.crowded += 1;
        this.guestSessions.push({ roomId: a.roomId, until: this.guestClock + GUESTS.stayMinutes });
        this.noteRoomUse(a.roomId);
      }
      out.push(a);
    }
    return out;
  }

  /**
   * 一般客が部屋を使い終えて、満足して帰るとき。
   *
   * 「喜んで帰る客がいる → その口コミでクラブが知られていく」を目に見えるようにする。
   * マークを出すかどうかと、人気度が上がるかどうかの**抽選はここで行う**
   *（乱数は sim が持つ、という約束。画面側は結果を見せるだけ）。
   * 人気度は月末の集計（guestPopularityDelta）とは別に、その場で少しずつ上がる。
   * 客は人気度で増えるので、雪だるま式にならないよう月ごとに上限を設けてある。
   */
  noteGuestSatisfied(ctx: GuestVisitContext): GuestSatisfiedResult {
    const satisfaction = guestSatisfaction(ctx);
    // 満足して帰る客が落とす貢献値（画面に `+9` と出て、月末に人気度へ換算される）
    const contribution = ctx.turnedAway ? 0 : guestContribution(satisfaction);
    this.guestMonth.moodSum += satisfaction;
    this.guestMonth.moodCount += 1;
    this.guestMonth.contribution += contribution;
    // 【情熱】満足して帰った客ぶんだけクラブの情熱が燃える（→ PASSION）。
    // 不満なまま帰る客は火を点けない（guestMinSatisfaction 未満は 0）。
    const passion =
      ctx.turnedAway || satisfaction < PASSION.guestMinSatisfaction
        ? 0
        : this.addPassion(satisfaction * PASSION.perGuestSatisfaction);

    const mark = !ctx.turnedAway && this.rand() < GUESTS.joyMarkChance;
    if (!mark) return { satisfaction, contribution, passion, mark: false, popularity: false };
    // 満足度が高い客ほど口コミが出やすい（→ sim/satisfaction.ts）
    const room = this.guestMonth.wordOfMouth < GUESTS.wordOfMouthMaxPerMonth;
    const popularity = room && this.rand() < GUESTS.wordOfMouthChance * wordOfMouthMultiplier(satisfaction);
    if (popularity) {
      this.guestMonth.wordOfMouth += 1;
      this.addPopularity(1);
    }
    return { satisfaction, contribution, passion, mark: true, popularity };
  }

  /**
   * クラブ全体の平均満足度（0-100）。
   * 在籍している選手全員の機嫌を平均する（HUD の★ゲージ）。
   */
  clubMood(): number {
    const all: Student[] = [];
    for (const c of CLASS_ORDER) all.push(...this.students[c.id]);
    return averageMood(all);
  }

  /** その部屋の前に並んでいる人数。 */
  guestQueueLen(roomId: number): number {
    let n = 0;
    for (const q of this.guestQueue) if (q.roomId === roomId) n++;
    return n;
  }

  /** いま並んでいる客（並んだ順）。画面が行列の立ち位置を決めるのに使う。 */
  guestQueueOrder(roomId: number): number[] {
    return this.guestQueue.filter((q) => q.roomId === roomId).map((q) => q.id);
  }

  /** 「行列から入れた／待ちくたびれて帰った」の知らせを取り出す（取り出すと空になる）。 */
  takeGuestQueueEvents(): GuestQueueEvent[] {
    const out = this.guestQueueEvents;
    this.guestQueueEvents = [];
    return out;
  }

  /**
   * 行列を1歩進める。
   *   1) 部屋が閉じた（レッスンでプールが使われ始めた等）→ 並んでいた客は帰る
   *   2) 席が空いたぶんだけ、先頭から入る（ここで料金を払う）
   *   3) 残った客は、待った時間に応じた確率で**不満を持って帰る**（混雑の不満に数える）
   */
  private tickGuestQueue(rooms: readonly GuestRoom[], minutes: number): void {
    if (this.guestQueue.length === 0) return;
    const byId = new Map(rooms.map((r) => [r.room.id, r]));
    const keep: typeof this.guestQueue = [];
    for (const q of this.guestQueue) {
      const room = byId.get(q.roomId);
      if (!room || !room.reachable) {
        this.guestQueueEvents.push({ kind: "gaveUp", queueId: q.id, roomId: q.roomId });
        continue;
      }
      if (this.guestCountIn(q.roomId) < room.capacity && !keep.some((k) => k.roomId === q.roomId)) {
        // 先頭（自分より前に同じ部屋の客が残っていない）で、席が空いている → 入る
        const a = { ...q.arrival, paid: room.fee, queued: false };
        this.guestMonth.served += 1;
        this.guestMonth.income += a.paid;
        this.gems += a.paid;
        this.guestMonth.crowded += 1;
        this.guestSessions.push({ roomId: q.roomId, until: this.guestClock + GUESTS.stayMinutes });
        this.noteRoomUse(q.roomId);
        this.guestSlotAdmitted += 1;
        this.guestQueueEvents.push({ kind: "admitted", queueId: q.id, roomId: q.roomId, paid: a.paid });
        continue;
      }
      const waited = this.guestClock - q.since;
      if (this.rand() < queueGiveUpChance(waited, minutes)) {
        // 待ちくたびれて帰る＝満員で入れなかった客として数える
        this.guestMonth.turnedAway += 1;
        this.guestMonth.crowded += 1;
        const e = this.equipment.find((x) => x.id === q.roomId);
        if (e) this.noteCrowded(e.kind);
        this.guestQueueEvents.push({ kind: "gaveUp", queueId: q.id, roomId: q.roomId, waited });
        continue;
      }
      keep.push(q);
    }
    this.guestQueue = keep;
  }

  /** 行列をたたむ（閉館・日替わり）。不満には数えない。 */
  private dropGuestQueue(): void {
    for (const q of this.guestQueue) this.guestQueueEvents.push({ kind: "gaveUp", queueId: q.id, roomId: q.roomId });
    this.guestQueue = [];
  }

  /** 一日の終わりなどに、館内の一般客を空にする。 */
  clearGuestOccupancy(): void {
    this.guestQueue = [];
    this.guestQueueEvents = [];
    this.guestSessions = [];
    this.guestTimer = 0;
    this.guestSlot = -1;
    this.guestSlotAdmitted = 0;
  }

  /** その部屋をいま使っている一般客の人数。 */
  /** その部屋が1回使われた。 */
  noteRoomUse(roomId: number): void {
    if (roomId < 0) return;
    this.roomUse[roomId] = (this.roomUse[roomId] ?? 0) + 1;
  }

  /** 今月その部屋が使われた回数（のべ人数）。 */
  roomUseThisMonth(roomId: number): number {
    return this.roomUse[roomId] ?? 0;
  }

  /**
   * 【混雑で使えなかった人を数える】部屋の種類ごと、今月ぶん。
   *
   * 一般客が満員で入れなかった／選手が回復設備を諦めた、をここに集める。
   * 月末に人気度へ返し（→ GUESTS.crowdPopularityPer）、
   * どの設備が足りないかを名指しで知らせる（→ worstCrowded）。
   */
  noteCrowded(kind: RoomKind): void {
    this.crowdMonth[kind] = (this.crowdMonth[kind] ?? 0) + 1;
  }

  /** 選手が回復設備を使えなかった（同じ子・同じ施設は月に1回だけ数える）。 */
  noteStudentCrowded(s: Student, kind: RoomKind): void {
    const key = `${kind}:${s.id}`;
    if (this.crowdStudentMonth.has(key)) return;
    this.crowdStudentMonth.add(key);
    this.noteCrowded(kind);
  }

  /** 今月、混雑で使えなかった人の合計。 */
  crowdedTotal(): number {
    return Object.values(this.crowdMonth).reduce((n: number, v) => n + (v ?? 0), 0);
  }

  /**
   * 今月、混雑で使えなかった人の**内訳**（多い順）。
   * 「どの設備が足りないのか」は1つに絞らず、足りていないものを全部出す
   *（風呂だけ増やしてもサウナが溢れている、ということが起きるため）。
   */
  crowdedBreakdown(): { kind: RoomKind; count: number }[] {
    return Object.entries(this.crowdMonth)
      .map(([kind, count]) => ({ kind: kind as RoomKind, count: count ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /** いちばん足りていない設備（使えなかった人がいちばん多い種類）。 */
  worstCrowded(): { kind: RoomKind; count: number } | null {
    let best: { kind: RoomKind; count: number } | null = null;
    for (const [kind, raw] of Object.entries(this.crowdMonth)) {
      const count = raw ?? 0;
      if (count > 0 && (!best || count > best.count)) best = { kind: kind as RoomKind, count };
    }
    return best;
  }

  /** その部屋を使うコマが、時間割に週何コマ入っているか（プール用）。 */
  lessonsPerWeekIn(roomId: number): number {
    return this.timetable.filter((e) => e.poolId === roomId && e.classId != null).length;
  }

  /** その選手が最後に行った合宿の成績（まだ行っていなければ null）。 */
  campRecordOf(s: Student): CampRecord | null {
    return this.campLog[s.id] ?? null;
  }

  guestCountIn(roomId: number): number {
    let n = 0;
    for (const s of this.guestSessions) if (s.roomId === roomId) n++;
    return n;
  }

  /** 館内にいる一般客の総数（HUDの表示に使う）。 */
  guestsInside(): number {
    return this.guestSessions.length;
  }

  /**
   * 「無理なく面倒を見られる規模」の目安。
   *
   * 人気度・使えている設備・クラブの格で少しずつ伸びる（→ config の INTAKE）。
   *
   * **これは定員ではない。入会を断る理由には絶対に使わないこと。**
   * ここを超えた入会希望者は、断るのではなく「来る間隔が長くなる」で表現する
   * （→ intakePressure）。定員に空きがあるのに断ると、プレイヤーには
   * ただの不具合にしか見えない（実際にそう報告された）。
   */
  comfortableSize(): number {
    const usable = this.usableEquipment();
    const pools = usable.filter((e) => isPool(e.kind)).length;
    return Math.round(
      INTAKE.base +
        enrollPopularity(this.popularity) * INTAKE.perPopularity +
        usable.length * INTAKE.perRoom +
        pools * INTAKE.perPool +
        (this.clubTier() - 1) * INTAKE.perClubTier,
    );
  }

  /**
   * 入会の間隔に掛かる倍率（1.0＝そのまま、大きいほど人が来にくい）。
   *
   * 在籍が「無理なく見られる規模」を超えるほど、口コミが行き渡らず入会がゆっくりになる。
   * **断るのではなく遅くする**ので、定員に空きがあるかぎり必ず受け入れられる。
   */
  intakePressure(): number {
    const comfort = Math.max(1, this.comfortableSize());
    const over = this.totalMembers() - comfort;
    if (over <= 0) return 1;
    return Math.min(INTAKE.pressureMax, 1 + (over / comfort) * INTAKE.pressurePerOver);
  }

  /**
   * そのクラスの空き枠 ＝ **定員 − 在籍数**。それ以上でも以下でもない。
   *
   * ここに「クラブ全体の受け入れ上限」を掛け合わせてはいけない。
   * 幼児 33/60 なのに入会を断る、という不具合の原因がまさにそれだった。
   */
  roomIn(classId: ClassId): number {
    return Math.max(0, this.capacityOf(classId) - this.students[classId].length);
  }

  /** 所有数（未配置・歩いて行けないものも含む）。購入上限の判定に使う。 */
  equipmentCount(kind: EquipmentKind): number {
    return countByKind(this.equipment, kind);
  }

  /**
   * 実際に使える数（配置済みで、入口から歩いて行ける部屋だけ）。
   * 効果（練習補正・器具の枠・雇用の上限など）はすべてこちらで数える。
   */
  usableCount(kind: EquipmentKind): number {
    return countByKind(this.usableEquipment(), kind);
  }

  /** 大型設備の設置数（上限 EQUIPMENT.maxTotal）。回復設備は数えない。 */
  equipmentTotal(): number {
    return countByCategory(this.equipment, "facility");
  }

  /** マッサージエリア（部屋）の数。 */
  recoveryTotal(): number {
    return this.equipmentCount("recovery");
  }

  /**
   * その部屋（スタジオ／筋トレルーム）の今の練習効率の倍率。
   * 「建てる前 → 建てた後」を購入画面に出して、投資の効果を数字で見せるために使う。
   */
  roomTrainMult(kind: EquipmentKind): number {
    const boosts = equipmentDef(kind).boosts;
    if (!boosts) return 1;
    return roomTrainMultOf(this.usableEquipment(), boosts);
  }

  /** その部屋をもう1つ建てたときの練習効率の倍率（上限に当たると変わらない）。 */
  roomTrainMultIfBuilt(kind: EquipmentKind): number {
    const boosts = equipmentDef(kind).boosts;
    if (!boosts) return 1;
    const probe: Equipment[] = [...this.usableEquipment(), { id: -1, kind, gx: 0, gy: 0 }];
    return roomTrainMultOf(probe, boosts);
  }

  /** 設備の毎月の維持費合計（大型＋回復設備）。 */
  monthlyUpkeep(): number {
    return totalUpkeep(this.equipment);
  }

  /**
   * 次に1台買うときの費用。同じ設備を買い増すほど高くなる（config の EQUIPMENT.costGrowth）。
   */
  equipmentCost(kind: EquipmentKind): number {
    return equipmentCostAt(kind, this.equipmentCount(kind));
  }

  /**
   * その施設がもう解放されているか（→ config の UNLOCK）。
   * まだなら「あと何が足りないか」を理由に入れて返す。
   */
  unlockStatus(kind: EquipmentKind): HoldStatus {
    const need = UNLOCK[kind];
    if (!need) return { ok: true }; // 条件なし＝最初から建てられる
    const rank = Math.max(1, Math.round(this.clubRankTier));
    if (need.rank != null && rank < need.rank) {
      return { ok: false, reason: `クラブの格 ${need.rank} で解放（いま ${rank}）` };
    }
    if (need.members != null && this.totalMembers() < need.members) {
      return { ok: false, reason: `在籍 ${need.members}人で解放（いま ${this.totalMembers()}人）` };
    }
    return { ok: true };
  }

  /** その施設はもう建てられる状態か（一覧の出し分けに使う）。 */
  isUnlocked(kind: EquipmentKind): boolean {
    return this.unlockStatus(kind).ok;
  }

  /**
   * 買えるか（解放条件も含めた、画面で押せるかどうかの判定）。
   *
   * 解放条件は**購入画面の側**で見る。canBuyEquipment（資金・敷地・上限）とは
   * 役割を分けてあり、検査スクリプトや見た目確認はそちらを直接呼んで
   * 進行に関係なく施設を建てられる。
   */
  canPurchase(kind: EquipmentKind): HoldStatus {
    const unlocked = this.unlockStatus(kind);
    if (!unlocked.ok) return unlocked;
    return this.canBuyEquipment(kind);
  }

  canBuyEquipment(kind: EquipmentKind): HoldStatus {
    const def = equipmentDef(kind);
    const limit = categoryLimit(def.category);
    if (countByCategory(this.equipment, def.category) >= limit) {
      return { ok: false, reason: `部屋は${limit}個まで` };
    }
    if (def.maxUnits > 0 && this.equipmentCount(kind) >= def.maxUnits) {
      return { ok: false, reason: `${def.label}は${def.maxUnits}つまで` };
    }
    // プールは6レーン・8レーンの合計で上限（時間割を組める本数でもある）
    if (def.lanes > 0 && this.poolCount() >= EQUIPMENT.maxPools) {
      return { ok: false, reason: `プールは${EQUIPMENT.maxPools}つまで` };
    }
    if (this.gems < this.equipmentCost(kind)) return { ok: false, reason: "ジェムが足りない" };
    // 敷地に置ける場所が1つも無いのに買わせない（払ったのに倉庫行き、を防ぐ）
    if (!this.hasSpaceFor(kind)) {
      return { ok: false, reason: "敷地に空きがない（建設モードで敷地を広げよう）" };
    }
    return { ok: true };
  }

  // -------------------------------------------------------------- 部屋のグレード（小・中・大）

  /** その部屋のいまのグレード（1..3）。 */
  gradeOfRoom(e: Equipment): number {
    return gradeOf(e);
  }

  /** グレードアップにかかる費用（上げられないときは 0）。 */
  upgradeRoomCost(e: Equipment): number {
    return upgradeCost(e.kind, gradeOf(e));
  }

  /** グレードアップできるか（理由つき）。 */
  canUpgradeRoom(e: Equipment): HoldStatus {
    if (!hasGrade(e.kind)) return { ok: false, reason: "この部屋にグレードはない" };
    if (gradeOf(e) >= MAX_GRADE) return { ok: false, reason: "すでに最大グレード" };
    const cost = this.upgradeRoomCost(e);
    if (this.gems < cost) return { ok: false, reason: `ジェムが足りない（◆${cost}）` };
    return { ok: true };
  }

  /**
   * 部屋のグレードを1つ上げる。
   *
   * 器具は部屋に同梱なので、上げた瞬間に**器具が増え・見た目が変わり・
   * 同時に使える人数と練習効果が上がる**。維持費も上がる。
   */
  upgradeRoom(e: Equipment): { ok: boolean; reason?: string; grade?: number } {
    const can = this.canUpgradeRoom(e);
    if (!can.ok) return can;
    this.gems -= this.upgradeRoomCost(e);
    e.grade = clampGrade(gradeOf(e) + 1);
    this.invalidateMap();
    return { ok: true, grade: e.grade };
  }

  /** グレードを上げられる部屋（配置済みのもの）。購入画面の一覧に使う。 */
  gradableRooms(): Equipment[] {
    return this.equipment.filter((e) => e.gx != null && hasGrade(e.kind));
  }

  /** その部屋の維持費（グレードこみ）。 */
  roomUpkeep(e: Equipment): number {
    return gradeUpkeep(e.kind, gradeOf(e));
  }

  /** その部屋を置ける場所が、いまの敷地に1マスでもあるか。 */
  hasSpaceFor(kind: EquipmentKind): boolean {
    const map = this.map();
    const b = landBounds(map);
    // 回せば入る場所もあるので、両方の向きで探す（置き場所は配置モードで選ぶ）
    for (const rot of [0, 1] as const) {
      const f = footprintOf(kind, rot);
      for (let gy = b.y0; gy + f.h - 1 <= b.y1; gy++) {
        for (let gx = b.x0; gx + f.w - 1 <= b.x1; gx++) {
          if (canPlaceAt(map, kind, gx, gy, undefined, rot).ok) return true;
        }
      }
    }
    return false;
  }

  /** その部屋のグレードで決まる「同時に使える台数」（スタジオのマット等）。 */
  stationCount(kind: EquipmentKind): number {
    return this.usableEquipment().filter((e) => e.kind === kind).reduce((a, e) => a + stationsOf(e), 0);
  }

  /** 筋トレルームによるスピード成長の上乗せ（部屋のグレードから決まる）。 */
  gymGearBoost(): number {
    return gymSpeedBoost(this.usableEquipment());
  }

  // 【廃止】買って置くアイテム（外構の装飾）は無くした（2026-08-18）。
  //   部屋の中の器具は部屋に同梱（グレード）、外構の装飾は遊びに関係していなかった。
  //   セーブに残っている items / itemPlacements は読み飛ばす（→ save/serialize.ts）。

  /** 回復に使える「席」の総数（サウナ10人×台数＋マッサージ器＋ストレッチポール）。 */
  recoveryCapacity(): number {
    return recoverySlots(this.usableEquipment()).length;
  }

  /**
   * 設備を購入して設置する（買い増すほど費用が上がる）。
   * 買った部屋は自動でマップの空きに置き、入口から道が繋がっていなければ道を伸ばす。
   * 置けなければ未配置（倉庫）のままにして、建設モードでプレイヤーが置く。
   */
  buyEquipment(kind: EquipmentKind): { ok: boolean; reason?: string; item?: Equipment; placed?: boolean } {
    const check = this.canBuyEquipment(kind);
    if (!check.ok) return check;
    const paid = this.equipmentCost(kind);
    this.gems -= paid;
    const item: Equipment = { id: this.nextEquipmentId++, kind, gx: null, gy: null, grade: 1, paid };
    this.equipment.push(item);
    const spot = autoPlaceRoom(this.map(), kind, item.id);
    if (spot) {
      item.gx = spot.gx;
      item.gy = spot.gy;
    }
    this.invalidateMap();
    // プールを増やしたら、空いているコマを持てるように時間割の受け皿を用意する
    if (spot && equipmentDef(kind).lanes > 0 && this.timetable.length === 0) {
      this.timetable = defaultTimetable(this.equipment);
      this.autoAssignCoaches();
    }
    return { ok: true, item, placed: spot != null };
  }

  /** プールを外すと在籍が定員を割る場合は止める（追い出しは起こさない）。 */
  private poolRemovalGuard(item: Equipment): { ok: boolean; reason?: string } {
    const def = equipmentDef(item.kind);
    if (def.lanes <= 0) return { ok: true };
    if (item.gx == null) return { ok: true }; // もともと使えていない
    const rest = this.equipment.filter((e) => e.id !== item.id);
    const ctx: TimetableContext = {
      equipment: rest,
      reachable: (poolId) => this.isRoomUsable(poolId),
      hasCoach: (coachId) => this.coaches.some((c) => c.id === coachId),
    };
    for (const cls of ["youji", "gakudo"] as const) {
      const after = schoolCapacity(this.timetable, cls, ctx);
      if (after < this.students[cls].length) return { ok: false, reason: "スクール生が入りきらなくなる" };
    }
    // 育成B以上の定員はプールの本数に関係なく固定なので、ここでは見なくてよい
    return { ok: true };
  }

  /** 設備を撤去する（維持費は減る。購入費の一部だけ戻る）。 */
  sellEquipment(item: Equipment): { ok: boolean; reason?: string; refund?: number } {
    const i = this.equipment.indexOf(item);
    if (i < 0) return { ok: false, reason: "その設備は無い" };
    const guard = this.poolRemovalGuard(item);
    if (!guard.ok) return guard;
    this.equipment.splice(i, 1);
    // 返金は「払った額」から（今の値段からではない → Equipment.paid）
    const refund = Math.round((item.paid ?? 0) * MAP.sellRefund);
    this.gems += refund;
    this.invalidateMap();
    this.pruneTimetableNow();
    this.syncResearch(); // 会議室を撤去したら、その部屋の研究は移すか止める
    // 食堂・ドクタールームを減らすと、定員を割った専門スタッフは辞めてもらう
    this.enforceStaffCapacity();
    // 寮を減らすと、あぶれた選手は退寮する
    this.enforceDormCapacity();
    return { ok: true, refund };
  }

  // -------------------------------------------------------------- コーチ

  /**
   * 監督（クラスの責任者）を時間割から決め直す。
   *
   * 監督は「そのクラスのコマをいちばん多く持っているコーチ」。
   * コーチ一覧から手で選ばせると、時間割の担当と食い違って分かりにくいので、
   * **決めるのは時間割の1箇所だけ**にして、監督はそこから自動で決まるようにしている。
   */
  syncHeadCoaches(): void {
    const best = new Map<ClassId, { id: number; n: number }>();
    for (const c of CLASS_ORDER) {
      const counts = new Map<number, number>();
      for (const e of this.timetable) {
        if (e.classId !== c.id || e.coachId == null) continue;
        counts.set(e.coachId, (counts.get(e.coachId) ?? 0) + 1);
      }
      let top: { id: number; n: number } | null = null;
      for (const [id, n] of counts) {
        if (!top || n > top.n || (n === top.n && id < top.id)) top = { id, n };
      }
      if (top) best.set(c.id, top);
    }
    const headOf = new Map<number, ClassId>();
    for (const [cls, t] of best) if (!headOf.has(t.id)) headOf.set(t.id, cls);
    for (const c of this.coaches) c.assigned = headOf.get(c.id) ?? null;
  }

  /**
   * そのコーチが時間割で担当しているコマの数。
   * 多く持たせるほど給料が上がる（人数を節約するか、給料を抑えるかの判断になる）。
   */
  coachDutyCount(coachId: number): number {
    return this.timetable.filter((e) => e.coachId === coachId).length;
  }

  /** そのクラスの監督コーチ（未配置なら undefined）。 */
  headCoachOf(classId: ClassId): Coach | undefined {
    return this.coaches.find((c) => c.assigned === classId);
  }

  /** 監督でない（担当なし）コーチ＝スクール貢献要員。 */
  benchCoaches(): Coach[] {
    return this.coaches.filter((c) => c.assigned === null);
  }

  /** 後方互換：そのクラスの監督（コメント表示などで使う）。 */
  monitorOf(classId: ClassId): Coach | undefined {
    return this.headCoachOf(classId);
  }

  /**
   * 育成クラスの成長スピード補正（監督の**格 × 指導力**。未配置は基礎値）。
   * 指導力は研究で伸びるので、同じコーチでも育てるほど選手が伸びるようになる。
   */
  coachGrowthMultOf(classId: ClassId): number {
    const head = this.headCoachOf(classId);
    return head ? coachTrainMult(head) : coachGrowthMult(0);
  }

  /**
   * スクール全体練習の成長補正。
   *  - 担当コーチ（幼児/学童それぞれに1人）が付くと、その質のぶんだけ「低速」がマシになる
   *  - 加えて、どこにも配置していないコーチ（ベンチ）が全体を底上げする
   * スクールは均等・低速という基本は変えない（倍率で少し速くなるだけ）。
   */
  schoolCoachMult(classId?: ClassId): number {
    const bench = Math.min(COACHING.benchSchoolBonusMax, this.benchCoaches().length * COACHING.benchSchoolBonusPer);
    const coach = classId ? this.headCoachOf(classId) : undefined;
    const q = coach?.quality ?? 0;
    const head = q > 0 ? 1 + q * COACHING.schoolHeadBonusPerQuality : 1;
    // 指導力（研究で伸びる）ぶんもスクールに効く
    return (1 + bench) * head * (coach ? teachingMult(coach.teaching) : 1);
  }

  /** コーチをそのクラスの担当（監督）に任命する。既存の担当は外れる。 */
  assignHead(coach: Coach, classId: ClassId): { ok: boolean; reason?: string } {
    const prev = this.headCoachOf(classId);
    if (prev && prev !== coach) prev.assigned = null;
    coach.assigned = classId;
    return { ok: true };
  }

  /** 監督を解任（ベンチ＝スクール貢献へ）。 */
  unassignCoach(coach: Coach): void {
    coach.assigned = null;
  }

  /** コーチの月給（担当ありは割増）。 */
  salaryOf(coach: Coach): number {
    return coachSalary(coach, this.coachDutyCount(coach.id));
  }

  /** 【廃止】受付スタッフは無くなったので固定費は0。 */
  staffSalary(): number {
    return 0;
  }

  /** 人件費の合計（コーチ＋受付スタッフ＋専門スタッフ）。 */
  totalMonthlySalary(): number {
    return (
      this.coaches.reduce((sum, c) => sum + coachSalary(c, this.coachDutyCount(c.id)), 0) +
      this.staffSalary() +
      this.specialistSalary()
    );
  }

  // -------------------------------------------------------------- 専門スタッフ（栄養士・ドクター）

  /** その種別のスタッフを何人雇っているか。 */
  staffCount(kind: StaffKind): number {
    return this.staff.reduce((n, s) => (s.kind === kind ? n + 1 : n), 0);
  }

  /** その種別のスタッフを何人まで雇えるか（対応する部屋の数 × 部屋あたりの定員）。 */
  staffCapacity(kind: StaffKind): number {
    const def = staffDef(kind);
    return this.usableCount(def.room) * def.capacityPerRoom;
  }

  /** 専門スタッフの月給合計。 */
  specialistSalary(): number {
    return this.staff.reduce((n, s) => n + staffDef(s.kind).salary, 0);
  }

  /** 雇えるか（部屋・定員・資金）。 */
  canHireStaff(kind: StaffKind): HoldStatus {
    const def = staffDef(kind);
    if (this.usableCount(def.room) === 0) {
      const label = equipmentDef(def.room).label;
      return {
        ok: false,
        reason: this.equipmentCount(def.room) > 0 ? `${label}に歩いて行けない` : `${label}が必要`,
      };
    }
    if (this.staffCount(kind) >= this.staffCapacity(kind)) {
      return { ok: false, reason: `${equipmentDef(def.room).label}の定員がいっぱい` };
    }
    if (this.gems < def.hireCost) return { ok: false, reason: "ジェムが足りない" };
    return { ok: true };
  }

  hireStaff(kind: StaffKind): { ok: boolean; reason?: string; member?: StaffMember } {
    const check = this.canHireStaff(kind);
    if (!check.ok) return check;
    const def = staffDef(kind);
    this.gems -= def.hireCost;
    const member = makeStaff(this.rand, this.nextStaffId++, kind);
    this.staff.push(member);
    this.refreshStaffBonus();
    return { ok: true, member };
  }

  fireStaff(member: StaffMember): void {
    const i = this.staff.indexOf(member);
    if (i >= 0) this.staff.splice(i, 1);
    this.refreshStaffBonus();
  }

  /** 専門スタッフぶんの補正（クラブ全員に効く）。 */
  staffBonus(): StaffBonus {
    return this.staffCache;
  }

  private refreshStaffBonus(): void {
    this.staffCache = staffBonusOf(this.staffCount("nutritionist"), this.staffCount("doctor"));
  }

  /** セーブからの復元用（配列を差し替えて補正を組み直す）。 */
  setStaff(list: StaffMember[], nextId?: number): void {
    this.staff = list;
    this.nextStaffId = Math.max(1, nextId ?? list.reduce((m, s) => Math.max(m, s.id), 0) + 1);
    this.refreshStaffBonus();
  }

  get staffIdCursor(): number {
    return this.nextStaffId;
  }

  /**
   * 部屋を減らして定員を割ったスタッフを解雇する（部屋を売ったときの整合）。
   * 戻り値は解雇した人数。
   */
  enforceStaffCapacity(): number {
    let fired = 0;
    for (const kind of STAFF_ORDER) {
      const cap = this.staffCapacity(kind);
      while (this.staffCount(kind) > cap) {
        const i = this.staff.findIndex((s) => s.kind === kind);
        if (i < 0) break;
        this.staff.splice(i, 1);
        fired++;
      }
    }
    if (fired > 0) this.refreshStaffBonus();
    return fired;
  }

  /** 月謝収入（クラス別の単価×人数）。段階が上がるほど月謝は高い。 */
  monthlyIncome(): number {
    return this.tuitionBreakdown().reduce((sum, r) => sum + r.total, 0);
  }

  /** 月謝の内訳（収支レポート用）。 */
  tuitionBreakdown(): MonthlyFinance["byClass"] {
    return CLASS_ORDER.map((c) => {
      const count = this.students[c.id].length;
      const perHead = INCOME.tuition[c.id];
      return { classId: c.id, count, perHead, total: count * perHead };
    });
  }

  /**
   * 今月の見込み収支（月謝＋一般客 − 維持費 − 寮費 − 給料）。
   * 一般客の売上はその月に実際に入った額なので、月替わりの直前がいちばん正確。
   */
  monthlyFinance(): MonthlyFinance {
    const byClass = this.tuitionBreakdown();
    const tuition = byClass.reduce((sum, r) => sum + r.total, 0);
    const sponsor = this.sponsorIncome();
    const upkeep = this.monthlyUpkeep();
    const salary = this.totalMonthlySalary();
    const guest = this.guestMonth.income;
    const shop = this.shopIncome();
    const stands = this.standIncome();
    const dorm = this.dormMonthlyCost();
    const proSalary = this.proSalaryTotal();
    return {
      tuition,
      sponsor,
      upkeep,
      salary,
      proSalary,
      guest,
      shop,
      stands,
      dorm,
      net: tuition + sponsor + guest + shop + stands - upkeep - salary - dorm - proSalary,
      byClass,
    };
  }

  /**
   * 【スポンサー収入】クラブの格が上がるほど、毎月まとまった額が入る（→ INCOME.sponsor）。
   *
   * 月謝は在籍の定員（全クラス満員でも月◆2,824）で頭打ちになる。
   * そこだけを収入源にすると、◆100万の大型施設は一生建たない。
   * 「大会で勝つ → クラブの格が上がる → 資金が増える → 大型施設が建つ」
   * という輪をここで閉じている。
   */
  /**
   * 【プロの契約金】そのプロに毎月払う額（プロ以外は0）。
   * 選手の格が上がるほど高く、クラブの格が上がると相場も上がる（→ PRO_SALARY）。
   */
  proSalaryOf(s: Student): number {
    return s.classId === "pro" ? this.proSalaryIfPro(s) : 0;
  }

  /** その子をプロにしたら毎月いくら払うか（昇格先を選ぶ画面に出す）。 */
  proSalaryIfPro(s: Student): number {
    const base = PRO_SALARY.byRank[rankOf(s)] ?? 0;
    const mult = PRO_SALARY.clubTierMult[this.clubTier()] ?? 1;
    return Math.round((base * mult) / 10) * 10;
  }

  /** プロ全員の契約金の合計（毎月の支出）。 */
  proSalaryTotal(): number {
    return this.students.pro.reduce((n, s) => n + this.proSalaryOf(s), 0);
  }

  sponsorIncome(): number {
    const tier = this.clubTier();
    if (tier < INCOME.sponsor.minTier) return 0;
    const base = INCOME.sponsor.byTier[tier] ?? 0;
    return Math.round(base + this.popularity * INCOME.sponsor.perPopularity);
  }

  /**
   * 【観客席の入場料】大型プールの観客席に来る見物客の入場料（毎月・1面ぶん）。
   * 人気度が高いほど増える（→ BIG_FACILITY.standIncome）。大型プールの元を取る道。
   */
  standIncome(): number {
    const n = this.usableCount("pool10");
    if (n === 0) return 0;
    const c = BIG_FACILITY.standIncome;
    return n * Math.round(Math.min(c.max, c.base + this.popularity * c.perPopularity));
  }

  /** 医科学センターによるケガの確率の倍率（1棟でも2棟でも同じ）。 */
  private scienceInjuryMult(): number {
    return this.usableCount("science") > 0 ? 1 - EQUIPMENT.scienceInjuryCut : 1;
  }

  /** 売店の売上（在籍が多いほど増える。人気度アップがおまけではなく本命）。 */
  shopIncome(): number {
    const shops = this.usableCount("shop");
    if (shops === 0) return 0;
    return Math.round(shops * this.totalMembers() * EQUIPMENT.shopIncomePerMember);
  }

  // -------------------------------------------------------------- 研究（会議室）

  /** 会議室があるか（研究を始める条件）。使えない（歩いて行けない）部屋は数えない。 */
  hasMeetingRoom(): boolean {
    return this.usableEquipment().some((e) => e.kind === "meeting");
  }

  // ---- 会議室（部屋）

  /** 使える会議室（歩いて行けるもの）。1部屋につき1つの研究を進められる。 */
  meetingRooms(): Equipment[] {
    return this.usableEquipment().filter((e) => e.kind === "meeting");
  }

  /** 同時に進められる研究の数（＝使える会議室の数）。 */
  researchSlots(): number {
    return this.meetingRooms().length;
  }

  // ---- 研究班（コーチ4人1組）

  /** その部屋で進んでいる研究。 */
  projectAt(roomId: number): ResearchProject | null {
    return this.researchProjects.find((p) => p.roomId === roomId) ?? null;
  }

  /** そのコーチが入っている研究班（無ければ null）。 */
  projectOfCoach(coachId: number): ResearchProject | null {
    return this.researchProjects.find((p) => p.coachIds.includes(coachId)) ?? null;
  }

  /** 研究に参加しているコーチ全員（どの班でもよい）。 */
  researchCoaches(): Coach[] {
    const ids = new Set(this.researchProjects.flatMap((p) => p.coachIds));
    return this.coaches.filter((c) => ids.has(c.id));
  }

  /** その研究班のコーチ（並びは登録順）。 */
  membersOf(project: ResearchProject): Coach[] {
    return project.coachIds
      .map((id) => this.coaches.find((c) => c.id === id))
      .filter((c): c is Coach => !!c);
  }

  /** どの班にも入っていないコーチ（班に足せる候補）。 */
  freeCoachesForResearch(): Coach[] {
    const taken = new Set(this.researchProjects.flatMap((p) => p.coachIds));
    return this.coaches.filter((c) => !taken.has(c.id));
  }

  /** 研究班に加える。すでに満員／別の班にいるときは断る。 */
  addResearchMember(roomId: number, coachId: number): HoldStatus {
    const p = this.projectAt(roomId);
    if (!p) return { ok: false, reason: "その部屋で研究をしていない" };
    if (p.coachIds.includes(coachId)) return { ok: false, reason: "すでにこの班にいる" };
    if (p.coachIds.length >= RESEARCH.groupSize) {
      return { ok: false, reason: `研究班は${RESEARCH.groupSize}人まで` };
    }
    if (this.projectOfCoach(coachId)) return { ok: false, reason: "別の研究班に入っている" };
    const coach = this.coaches.find((c) => c.id === coachId);
    if (!coach) return { ok: false, reason: "そのコーチはいない" };
    p.coachIds.push(coachId);
    coach.duty = "research";
    return { ok: true };
  }

  /** 研究班から外す（指導に専念させる）。 */
  removeResearchMember(roomId: number, coachId: number): void {
    const p = this.projectAt(roomId);
    if (!p) return;
    p.coachIds = p.coachIds.filter((id) => id !== coachId);
    const coach = this.coaches.find((c) => c.id === coachId);
    if (coach && !this.projectOfCoach(coachId)) coach.duty = "idle";
  }

  /** 空いているコーチで班を埋める（「おまかせ」）。指導力が高い順に入れる。 */
  fillResearchGroup(roomId: number): number {
    const p = this.projectAt(roomId);
    if (!p) return 0;
    const free = [...this.freeCoachesForResearch()].sort(
      (a, b) => b.teaching - a.teaching || b.quality - a.quality,
    );
    let n = 0;
    for (const c of free) {
      if (p.coachIds.length >= RESEARCH.groupSize) break;
      if (this.addResearchMember(roomId, c.id).ok) n++;
    }
    return n;
  }

  /** その班の平均指導力（失敗率の軽減に使う）。 */
  groupTeaching(project: ResearchProject): number {
    const members = this.membersOf(project);
    if (members.length === 0) return 0;
    return members.reduce((n, c) => n + c.teaching, 0) / members.length;
  }

  /** その班が1ヶ月に進めるポイント（班が揃っていなければ0）。 */
  projectRate(project: ResearchProject): number {
    return monthlyResearchPoints(
      this.membersOf(project).map((c) => ({ quality: c.quality, teaching: c.teaching })),
      this.researchSlots(),
    );
  }

  /** そのプロジェクトに必要な総ポイント。 */
  projectPoints(project: ResearchProject): number {
    const topic = researchTopic(project.id);
    return topic ? researchPointsFor(topic, project.targetLevel) : 0;
  }

  /** そのプロジェクトの失敗率（指導力で下がる）。 */
  projectFailChance(project: ResearchProject): number {
    return researchFailChance(project.targetLevel, this.groupTeaching(project));
  }

  /** クラブ全体で1ヶ月に進む研究ポイント（表示用の合計）。 */
  researchRate(): number {
    return this.researchProjects.reduce((n, p) => n + this.projectRate(p), 0);
  }

  // ---- 効果

  /** 完了した研究による、クラブ全体への補正。 */
  researchBonus(): ResearchBonus {
    return this.researchCache;
  }

  private refreshResearchBonus(): void {
    this.researchCache = researchBonusOf(this.researchLevels);
  }

  /** そのテーマのいまのレベル（0＝未研究）。 */
  researchLevelOf(id: ResearchId): number {
    return levelOf(this.researchLevels, id);
  }

  /** 次に目指すレベルの費用・必要ポイント・失敗率（一覧に出す）。 */
  researchPreview(id: ResearchId): { level: number; cost: number; points: number; fail: number } | null {
    const topic = researchTopic(id);
    if (!topic) return null;
    const next = this.researchLevelOf(id) + 1;
    return {
      level: next,
      cost: researchCostFor(topic, next),
      points: researchPointsFor(topic, next),
      // まだ班が決まっていないので、いま組めそうな顔ぶれの平均で見積もる
      fail: researchFailChance(next, this.estimateTeaching()),
    };
  }

  /** 見積もり用の平均指導力（班を組む前の表示に使う）。 */
  private estimateTeaching(): number {
    const free = this.freeCoachesForResearch();
    const pool = free.length >= RESEARCH.groupSize ? free : this.coaches;
    if (pool.length === 0) return 0;
    const best = [...pool].sort((a, b) => b.teaching - a.teaching).slice(0, RESEARCH.groupSize);
    return best.reduce((n, c) => n + c.teaching, 0) / best.length;
  }

  // ---- 開始・中止

  /** その部屋でその研究を始められるか。 */
  canStartResearch(id: ResearchId, roomId?: number): HoldStatus {
    const topic = researchTopic(id);
    if (!topic) return { ok: false, reason: "そのテーマは無い" };
    const rooms = this.meetingRooms();
    if (rooms.length === 0) return { ok: false, reason: "会議室が必要" };

    const room = roomId != null ? rooms.find((r) => r.id === roomId) : rooms.find((r) => !this.projectAt(r.id));
    if (!room) return { ok: false, reason: "空いている会議室がない（会議室を建てよう）" };
    if (this.projectAt(room.id)) return { ok: false, reason: "その部屋では別の研究が進んでいる" };
    if (this.researchProjects.some((p) => p.id === id)) {
      return { ok: false, reason: "同じテーマを2つの部屋では進められない" };
    }

    const cur = this.researchLevelOf(id);
    if (isMaxLevel(cur)) return { ok: false, reason: `Lv${RESEARCH.maxLevel} まで極めた` };
    if (this.freeCoachesForResearch().length < RESEARCH.groupSize) {
      return { ok: false, reason: `研究班にはコーチ${RESEARCH.groupSize}人が要る` };
    }
    if (this.gems < researchCostFor(topic, cur + 1)) return { ok: false, reason: "ジェムが足りない" };
    return { ok: true };
  }

  /**
   * 研究を始める（費用を払い、空いているコーチで班を組む）。
   * 部屋を指定しなければ、空いている会議室に入れる。
   */
  startResearch(id: ResearchId, roomId?: number): { ok: boolean; reason?: string; project?: ResearchProject } {
    const check = this.canStartResearch(id, roomId);
    if (!check.ok) return check;
    const topic = researchTopic(id)!;
    const rooms = this.meetingRooms();
    const room = roomId != null ? rooms.find((r) => r.id === roomId)! : rooms.find((r) => !this.projectAt(r.id))!;
    const next = this.researchLevelOf(id) + 1;

    this.gems -= researchCostFor(topic, next);
    const project: ResearchProject = { roomId: room.id, id, progress: 0, coachIds: [], targetLevel: next };
    this.researchProjects.push(project);
    this.fillResearchGroup(room.id);
    return { ok: true, project };
  }

  /** 研究をやめる（進捗は消える。費用は戻らない）。班のコーチは指導へ戻る。 */
  cancelResearch(roomId?: number): void {
    const target = roomId != null ? this.projectAt(roomId) : this.researchProjects[0];
    if (!target) return;
    for (const id of [...target.coachIds]) this.removeResearchMember(target.roomId, id);
    this.researchProjects = this.researchProjects.filter((p) => p !== target);
  }

  /** まだ極めていないテーマ（レベルを上げられるもの）。 */
  availableResearch(): typeof RESEARCH_TOPICS {
    return RESEARCH_TOPICS.filter((t) => !isMaxLevel(this.researchLevelOf(t.id)));
  }

  /**
   * セーブからの復元用。存在しないテーマIDは捨てる
   * （config からテーマを消したり並べ替えたりしてもセーブが壊れない）。
   */
  setResearch(projects: readonly ResearchProject[], levels: ResearchLevels): void {
    this.researchLevels = {};
    for (const [id, lv] of Object.entries(levels)) {
      if (researchTopic(id) && lv > 0) this.researchLevels[id] = Math.min(RESEARCH.maxLevel, Math.floor(lv));
    }
    this.researchProjects = projects
      .filter((p) => !!researchTopic(p.id))
      .map((p) => ({
        roomId: p.roomId,
        id: p.id,
        progress: Math.max(0, p.progress),
        coachIds: [...p.coachIds],
        targetLevel: Math.max(1, Math.min(RESEARCH.maxLevel, Math.floor(p.targetLevel))),
      }));
    this.refreshResearchBonus();
  }

  /**
   * 研究の整合を取り直す（読み込み後・部屋の撤去後・解雇後に呼ぶ）。
   *  ・会議室が無くなった部屋の研究は止める
   *  ・いないコーチを班から外す
   *  ・班に入っているコーチの duty を "research" に揃える
   */
  syncResearch(): void {
    const rooms = this.meetingRooms();
    const ids = new Set(rooms.map((r) => r.id));
    // 部屋を失った研究は、空いている別の会議室へ移す（移せなければ中止）。
    // 古いセーブからの移行では roomId=-1 で入ってくるので、ここで部屋が決まる。
    const kept: ResearchProject[] = [];
    for (const p of this.researchProjects) {
      if (ids.has(p.roomId) && !kept.some((q) => q.roomId === p.roomId)) {
        kept.push(p);
        continue;
      }
      const free = rooms.find((r) => !kept.some((q) => q.roomId === r.id));
      if (free) {
        p.roomId = free.id;
        kept.push(p);
      }
    }
    this.researchProjects = kept;
    const alive = new Set(this.coaches.map((c) => c.id));
    const seen = new Set<number>();
    for (const p of this.researchProjects) {
      p.coachIds = p.coachIds.filter((id) => {
        if (!alive.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    for (const c of this.coaches) c.duty = seen.has(c.id) ? "research" : "idle";
  }

  /** そのコーチを研究に回す／指導に専念させる（後方互換の入口）。 */
  setCoachDuty(coach: Coach, duty: Coach["duty"]): void {
    if (duty === "research") {
      // 空きのある班に入れる。どこも満員なら何もしない。
      for (const p of this.researchProjects) {
        if (p.coachIds.length < RESEARCH.groupSize) {
          this.addResearchMember(p.roomId, coach.id);
          return;
        }
      }
      return;
    }
    const p = this.projectOfCoach(coach.id);
    if (p) this.removeResearchMember(p.roomId, coach.id);
    coach.duty = "idle";
  }

  // ---- 月次の進行

  /**
   * 1ヶ月ぶん研究を進める。
   *
   * 班が RESEARCH.groupSize 人そろっている研究だけが進む。
   * 必要ポイントに達したら**判定**を行い、
   *   成功 … レベルが1つ上がって効果が強くなる（班は解散し、コーチは指導へ戻る）
   *   失敗 … 費用は戻らず、進捗が半分に減ってそのまま再挑戦（レベルは上がらない）
   * どちらの場合も、参加したコーチの**指導力が伸びる**。
   */
  private advanceResearch(): ResearchOutcome[] {
    const out: ResearchOutcome[] = [];
    if (this.researchSlots() === 0) return out;

    for (const p of [...this.researchProjects]) {
      const topic = researchTopic(p.id);
      if (!topic) continue;
      const rate = this.projectRate(p);
      if (rate <= 0) continue; // 班が揃っていない＝進まない

      // 研究しているだけでコーチの指導力が伸びる（上に行くほど伸びにくい）
      const members = this.membersOf(p);
      for (const c of members) {
        const gain = RESEARCH.teachPerMonth * (1 + p.targetLevel * RESEARCH.teachPerLevel) * (1 - c.teaching / 100);
        c.teaching = clampTeaching(c.teaching + gain);
      }

      p.progress += rate;
      const need = researchPointsFor(topic, p.targetLevel);
      if (p.progress < need) continue;

      // ---- 完成の判定（レベルが高いほど失敗しやすい／指導力が高いほど失敗しにくい）
      const fail = this.projectFailChance(p);
      const success = this.rand() >= fail;
      const bonusTeach = success ? RESEARCH.teachOnComplete : RESEARCH.teachOnFail;
      for (const c of members) c.teaching = clampTeaching(c.teaching + bonusTeach);

      const names = members.map((c) => c.name);
      if (success) {
        this.researchLevels[p.id] = p.targetLevel;
        this.refreshResearchBonus();
        this.cancelResearch(p.roomId); // 班は解散して指導へ戻す
        out.push({ id: p.id, label: topic.label, level: p.targetLevel, success: true, members: names });
      } else {
        p.progress = Math.round(need * RESEARCH.failKeepProgress);
        out.push({ id: p.id, label: topic.label, level: p.targetLevel, success: false, members: names });
      }
    }
    return out;
  }

  // -------------------------------------------------------------- クラブの格

  /** クラブの格の材料（人気度・大会実績・通算優勝）。 */
  private clubRankInput(): { popularity: number; achievement: number; championships: number } {
    return { popularity: this.popularity, achievement: this.clubAchievement, championships: this.championships };
  }

  /** 現在のクラブの格（1..6）。 */
  clubTier(): number {
    return clubTierOf(this.clubRankInput());
  }

  clubRankProgress(): ReturnType<typeof clubProgress> {
    return clubProgress(this.clubRankInput());
  }

  /**
   * 保持している clubRankTier を現在のスコアに合わせ直す。
   * 上がっていれば通知を返す（演出はシーン側）。
   */
  refreshClubRank(): ClubRankUpEvent | null {
    const now = this.clubTier();
    const before = Math.max(1, Math.round(this.clubRankTier));
    this.clubRankTier = now;
    if (now <= before) return null;
    return { from: before, to: now, label: clubRankLabel(now) };
  }

  /** クラブ力（募集候補の質に効く）。人気度＋通算優勝＋クラブの格。 */
  clubStrength(): number {
    return this.popularity + this.championships * 8 + clubStrengthBonus(this.clubTier());
  }

  /**
   * コーチ募集の候補を生成する（開くたびに更新）。
   * 候補の格はクラブ力とクラブの格で決まり、格が足りないとレジェンドは現れない。
   * 合宿の「名コーチとの出会い」で溜まった上乗せは、ここで一度だけ使われる。
   */
  /**
   * 【募集名簿】いま応募してきているコーチ。
   *
   * 画面を開くたびに作り直すのではなく、**毎月ここへ積み上がる**（→ refillRecruitPool）。
   * 期限切れの応募は落ちるので、良い人が来たらその場で決める必要がある。
   */
  recruitPool: RecruitCandidate[] = [];

  /** 通算の月数（募集名簿の期限に使う。ゲーム開始＝0）。 */
  monthCount = 0;

  /**
   * 募集名簿を今月ぶん更新する（月初に1回だけ呼ぶ）。
   *
   *   1. 期限切れ（expireMonths ヶ月）の応募を落とす
   *   2. 今月ぶんの新しい応募を perMonth 人足す
   *   3. 名簿が poolMax を超えたら、古い応募から落とす
   *
   * 応募者の格は**クラブの格で決まる**（抽選しない → COACHING.recruit.byClubTier）。
   * クラブが育つほど名簿の顔ぶれが良くなる。レジェンドは来ない（記録会の出会いだけ → MEET_COACH）。
   * 合宿の「名コーチとの出会い」（scoutBoost）があれば、次の1回だけ1つ上の格の並びになる。
   */
  refillRecruitPool(count: number = COACHING.recruit.perMonth): void {
    const limit = COACHING.recruit.expireMonths;
    this.recruitPool = this.recruitPool.filter((c) => this.monthCount - c.since < limit);
    const boost = this.scoutBoost > 0 ? 1 : 0;
    for (const q of recruitQualitiesFor(this.clubTier(), this.monthCount, count, boost)) {
      const coach = makeCoach(this.rand, this.nextCoachId++, q);
      this.recruitPool.push({ coach, cost: COACHING.recruit.baseCostByQuality[q] ?? 20, since: this.monthCount });
    }
    this.scoutBoost = 0;
    this.trimRecruitPool();
  }

  /**
   * 名簿が poolMax を超えたら古い応募から落とす。
   * **記録会で出会ったコーチは後回し**（めったに来ない人が、ふつうの応募に押し出されないように）。
   */
  private trimRecruitPool(): void {
    let over = this.recruitPool.length - COACHING.recruit.poolMax;
    for (let i = 0; over > 0 && i < this.recruitPool.length; ) {
      if (this.recruitPool[i].metAt) i++;
      else {
        this.recruitPool.splice(i, 1);
        over--;
      }
    }
    if (over > 0) this.recruitPool.splice(0, over);
  }

  // -------------------------------------------------------------- 記録会でのコーチとの出会い

  /** 続けて外れた回数（MEET_COACH.pityAfter に届いたら次は必ず出会う）。 */
  meetCoachMiss = 0;
  /** 今月すでに抽選した記録会（`通算の月:段`）。同じ記録会で何度も引かないように。 */
  meetCoachRolled: string[] = [];
  /** 最後に出会った通算の月（出会えるのは月に1人まで）。 */
  meetCoachMetMonth = -1;

  /**
   * 記録会で優勝したときの出会いの抽選（→ MEET_COACH）。
   * 優勝した記録会1つにつき1回・出会えるのは月に1人まで。出会えたら名簿に入れて返す。
   */
  private rollMeetCoach(comp: Competition): RecruitCandidate | null {
    const tier = kirokukaiTierOf(comp.id);
    if (tier == null) return null;
    const key = `${this.monthCount}:${tier}`;
    this.meetCoachRolled = this.meetCoachRolled.filter((k) => k.startsWith(`${this.monthCount}:`));
    if (this.meetCoachRolled.includes(key) || this.meetCoachMetMonth === this.monthCount) return null;
    this.meetCoachRolled.push(key);

    const pity = MEET_COACH.pityAfter > 0 && this.meetCoachMiss >= MEET_COACH.pityAfter;
    if (!pity && this.rand() >= MEET_COACH.chance) {
      this.meetCoachMiss += 1;
      return null;
    }
    this.meetCoachMiss = 0;
    this.meetCoachMetMonth = this.monthCount;
    // 名簿は「最初に開いたとき空なら初期人数を入れる」作り（→ generateRecruits）。
    // 開く前に出会うと空でなくなり、ふつうの応募者が来ないままになるので、先に埋めておく
    if (this.recruitPool.length === 0) this.refillRecruitPool(COACHING.recruit.initialCount);
    const q = rollMeetCoachQuality(tier, this.rand);
    const coach = makeCoach(this.rand, this.nextCoachId++, q);
    const cand: RecruitCandidate = {
      coach,
      cost: COACHING.recruit.baseCostByQuality[q] ?? 20,
      since: this.monthCount,
      metAt: comp.name,
    };
    this.recruitPool.push(cand);
    this.trimRecruitPool();
    return cand;
  }

  /**
   * いま募集に出ている候補（新しい応募が上に来る）。
   * 名簿が空のとき（新規ゲーム・古いセーブ）だけ、その場で初期人数ぶんを起こす。
   */
  generateRecruits(): RecruitCandidate[] {
    if (this.recruitPool.length === 0) this.refillRecruitPool(COACHING.recruit.initialCount);
    return [...this.recruitPool].reverse();
  }

  /** その応募が名簿から消えるまであと何ヶ月か（0＝今月かぎり）。 */
  recruitMonthsLeft(cand: RecruitCandidate): number {
    return Math.max(0, COACHING.recruit.expireMonths - (this.monthCount - cand.since));
  }

  /**
   * 雇えるコーチの上限。
   *
   * **コーチ室を建てるまでは1人**（＝ゲーム開始時のコーチだけ）。
   * 使えるコーチ室1棟につき EQUIPMENT.coachesPerCoachRoom 人ずつ増える。
   * 「歩いて行けないコーチ室」は数に入らない（usableCount）。
   */
  coachCapacity(): number {
    return COACHING.maxCoaches + this.usableCount("coachroom") * EQUIPMENT.coachesPerCoachRoom;
  }

  /**
   * 定員がいっぱいのときに出す一言（何をすれば増えるか）。
   * コーチ室が1つも無いプレイヤーには「まず建てる」と伝える。
   */
  coachCapacityHint(): string {
    const cap = this.coachCapacity();
    return this.usableCount("coachroom") === 0
      ? `コーチが定員（${cap}人）。コーチ室を建てると +${EQUIPMENT.coachesPerCoachRoom}人`
      : `コーチが定員（${cap}人）。コーチ室を増やすと +${EQUIPMENT.coachesPerCoachRoom}人`;
  }

  /** 候補を雇用する（定員・ジェムをチェック）。 */
  hireCoach(cand: RecruitCandidate): { ok: boolean; reason?: string } {
    const cap = this.coachCapacity();
    if (this.coaches.length >= cap) return { ok: false, reason: this.coachCapacityHint() };
    if (this.gems < cand.cost) return { ok: false, reason: "ジェムが足りない" };
    this.gems -= cand.cost;
    this.coaches.push(cand.coach);
    // 雇った人は名簿から消す（引退選手からのオファーは名簿に載っていないので何も起きない）
    const i = this.recruitPool.findIndex((c) => c.coach.id === cand.coach.id);
    if (i >= 0) this.recruitPool.splice(i, 1);
    return { ok: true };
  }

  /** コーチを解雇する。 */
  fireCoach(coach: Coach): void {
    const i = this.coaches.indexOf(coach);
    if (i >= 0) this.coaches.splice(i, 1);
    // 研究班に入っていたら抜けてもらう（4人揃わなくなった研究はその場で止まる）
    const p = this.projectOfCoach(coach.id);
    if (p) p.coachIds = p.coachIds.filter((id) => id !== coach.id);
  }

  // -------------------------------------------------------------- クラス平均 / 昇降格

  classAverageOf(classId: ClassId): number {
    const arr = this.students[classId];
    if (arr.length === 0) return 0;
    return arr.reduce((sum, s) => sum + overallAbility(s), 0) / arr.length;
  }

  classFitMultOf(s: Student): number {
    return classFitMultiplier(s, this.classAverageOf(s.classId));
  }

  classFitStatusOf(s: Student): ClassFitStatus {
    return classFitStatus(s, this.classAverageOf(s.classId));
  }

  private classIndex(classId: ClassId): number {
    return CLASS_ORDER.findIndex((c) => c.id === classId);
  }

  /** クラスが許容する最上位ライフステージ（年齢制限）。 */
  private maxStageIndex(classId: ClassId): number {
    return {
      youji: 0, // 未就学まで（→小学で学童へ）
      gakudo: 1, // 小6まで（超で退会）
      ikuseiB: 1, // 小6まで
      ikuseiA: 2, // 中3まで
      senshu: 3, // 高3まで
      pro: 4, // 制限なし
    }[classId];
  }

  /**
   * そのクラスに上がれる最低学年（GRADE_SEQ の位置）。
   * これが無いと小1をいきなりプロにできてしまい、
   * 「いつ上げるか」という判断がゲームから消える。
   */
  private minGradeIndex(classId: ClassId): number {
    return CLASS_MIN_GRADE[classId] ?? 0;
  }

  /** そのクラスに上がるには学年が足りているか。 */
  private meetsGradeFloor(classId: ClassId, grade: string): boolean {
    return GRADE_SEQ.indexOf(grade) >= this.minGradeIndex(classId);
  }

  private stageIndex(grade: string): number {
    return STAGE_ORDER.indexOf(lifeStageOf(grade));
  }

  private exceedsAgeLimit(classId: ClassId, grade: string): boolean {
    return this.stageIndex(grade) > this.maxStageIndex(classId);
  }

  private move(s: Student, from: ClassId, to: ClassId): void {
    const arr = this.students[from];
    const i = arr.indexOf(s);
    if (i >= 0) arr.splice(i, 1);
    s.classId = to;
    s.practiceAccum = 0;
    this.students[to].push(s);
    // 年齢の収まるクラスへ移ったら、退会の予告は消す（＝昇格させれば残せる）
    if (!this.exceedsAgeLimit(to, s.grade)) s.leaveAtMonth = null;
  }

  private remove(s: Student, from: ClassId): void {
    const arr = this.students[from];
    const i = arr.indexOf(s);
    if (i >= 0) arr.splice(i, 1);
  }

  /**
   * その選手を上げられるクラスの一覧（**すぐ上の1つだけではない**）。
   *
   * 【なぜ全部返すか】以前は「ひとつ上のクラス」へしか上げられなかったので、
   * 育成Bが定員になると、育成Aや選手に空きがあっても**そこで詰まって**
   * 誰も昇格させられなくなっていた。上のクラスを全部並べて選べるようにする。
   *
   * 選べないものも理由を付けて返す（UI がそのまま出す）。
   * 「なぜ上げられないのか」が見えないと、定員なのか学年なのか分からない。
   *
   * **スクール（幼児・学童）からの昇格先は育成B以上。**
   * 幼児 → 学童は年齢で自動的に上がる「進級」であって昇格ではないので、ここには出さない。
   */
  promotionTargets(s: Student): PromotionTarget[] {
    const idx = this.classIndex(s.classId);
    const out: PromotionTarget[] = [];
    for (const c of CLASS_ORDER) {
      if (isSchoolClass(c.id)) continue; // スクールへは「昇格」しない
      if (this.classIndex(c.id) <= idx) continue; // 今より上だけ
      const filled = this.students[c.id].length;
      const capacity = this.capacityOf(c.id);
      let reason: string | undefined;
      if (!this.meetsGradeFloor(c.id, s.grade)) {
        reason = `${c.label}にはまだ早い（${CLASS_MIN_GRADE_LABEL[c.id]}から）`;
      } else if (this.exceedsAgeLimit(c.id, s.grade)) {
        // そのクラスに置いても、次の年度更新で退会になってしまう
        reason = `${s.grade}は${c.label}の年齢を超えている（${LIFESTAGE_LABEL[STAGE_ORDER[this.maxStageIndex(c.id)]]}まで）`;
      } else if (filled >= capacity) {
        reason = `${c.label}が定員（${filled}/${capacity}人）`;
      }
      out.push({ classId: c.id, label: c.label, ok: !reason, reason, filled, capacity });
    }
    return out;
  }

  /** 指定したクラスへ昇格させる（→ promotionTargets で選べると分かっているものだけ）。 */
  promoteStudentTo(s: Student, classId: ClassId): { ok: boolean; reason?: string } {
    const t = this.promotionTargets(s).find((x) => x.classId === classId);
    if (!t) return { ok: false, reason: "そのクラスへは上げられない" };
    if (!t.ok) return { ok: false, reason: t.reason };
    this.move(s, s.classId, classId);
    return { ok: true };
  }

  /**
   * 上のクラスへ昇格（**上げられるいちばん下のクラス**へ）。
   * どのクラスへ上げるかを選ばせたいときは promotionTargets / promoteStudentTo を使う。
   */
  promoteStudent(s: Student): { ok: boolean; reason?: string } {
    const targets = this.promotionTargets(s);
    if (targets.length === 0) return { ok: false, reason: "最上位クラス" };
    const first = targets.find((t) => t.ok);
    // 上げられない場合は、いちばん近いクラスの理由を返す（それがいちばん知りたい理由）
    if (!first) return { ok: false, reason: targets[0].reason };
    this.move(s, s.classId, first.classId);
    return { ok: true };
  }

  /**
   * その選手の降格先（移せるかどうかは見ない。最下位なら null）。
   *
   * スクールは幼児と学童の2つあるので、**学年で行き先を選ぶ**。
   * ひとつ下＝学童 に決め打ちすると、年長の子（小1未満）を戻せない。
   */
  demotionTargetOf(s: Student): ClassId | null {
    const idx = this.classIndex(s.classId);
    if (idx <= 0) return null;
    const below = CLASS_ORDER[idx - 1];
    if (isSchoolClass(below.id) && !this.meetsGradeFloor(below.id, s.grade)) return CLASS_ORDER[0].id;
    return below.id;
  }

  /**
   * 下のクラスへ降格。
   *
   * 【スクールまで戻せる】（2026-09-21）
   * 以前はスクールへの降格を断っていたので、育成Bに上げた子が伸びなかったとき
   * **行き場が無かった**（定員24を埋めたまま、小6で年齢超過の退会を待つしかない）。
   * スクールの定員は時間割のコマ数で決まる＝空きを作れるので、戻す先として使える。
   * 戻した子は全体練習だけになり、大会にも出せない。伸びてきたらまた上げ直せる。
   *
   * 申し込み済みのレースはここでは触らない。開催日に `takePendingRace` が
   * 「出られないクラスになった選手」を欠場にして出場費を返す（同じ判定が二重にならないように）。
   */
  demoteStudent(s: Student): { ok: boolean; to?: ClassId; reason?: string } {
    const targetId = this.demotionTargetOf(s);
    if (!targetId) return { ok: false, reason: "最下位クラス" };
    const target = classDef(targetId);
    if (this.exceedsAgeLimit(target.id, s.grade)) {
      return { ok: false, reason: `${s.grade}は${target.label}の年齢を超えている` };
    }
    if (this.students[target.id].length >= this.capacityOf(target.id)) {
      return { ok: false, reason: `${target.label}が定員（${this.students[target.id].length}/${this.capacityOf(target.id)}人）` };
    }
    this.move(s, s.classId, target.id);
    return { ok: true, to: target.id };
  }

  /**
   * 年度更新時：年齢超過を処理する。
   *  - 幼児は小学生になると自動で学童へ進級（退会ではない）。
   *  - 学童・育成・選手は年齢超過で退会（＝それまでに昇格させないと失われる）。
   */
  // -------------------------------------------------------------- 引退

  /**
   * 引退した選手の記録（新しい順）。振り返りの演出とコーチの誘いに使う。
   * 名簿からは消えるので、見せたいものだけをここに残す。
   */
  retired: RetiredRecord[] = [];

  /** 年齢で引退する選手を送り出す（年度の変わり目に呼ぶ）。 */
  private retireByAge(): string[] {
    const events: string[] = [];
    for (const c of CLASS_ORDER) {
      for (const s of [...this.students[c.id]]) {
        if (!isRetireAge(s)) continue;
        this.retireStudent(s, false);
        events.push(`${s.name}（${s.age}歳）が引退`);
      }
    }
    return events;
  }

  /**
   * 選手を引退させる（年齢による自動引退と、プロの手動引退の両方から呼ぶ）。
   *
   * 引退した選手のうち、**熟練度の高かった者にはコーチの声が掛かる**。
   * 育て上げた名選手が次の世代を育てる側に回ることで、クラブに歴史が積もる。
   * 誘いは RETIRE.coach.offerMonths ヶ月で消える（雇うかどうかはプレイヤーが決める）。
   */
  retireStudent(s: Student, byChoice: boolean): RetiredRecord {
    const best = bestStrokeOf(s);
    const bestProf = strokeProfOf(s, best);
    const rec: RetiredRecord = {
      studentId: s.id,
      name: s.name,
      age: s.age,
      grade: s.grade,
      classId: s.classId,
      year: this.year,
      byChoice,
      wins: s.wins,
      rankTier: s.rankTier,
      achievePoints: Math.round(s.achievePoints),
      bestTimeSec: s.bestTimeSec,
      bestTimeEvent: s.bestTimeEvent ? { ...s.bestTimeEvent } : null,
      bestStroke: best,
      bestProf: Math.round(bestProf),
      coachOffer: null,
    };
    // コーチとして残るか（熟練度が高いほど声が掛かりやすい）
    if (bestProf >= RETIRE.coach.minProf) {
      const t = clamp((bestProf - RETIRE.coach.minProf) / Math.max(1, 999 - RETIRE.coach.minProf), 0, 1);
      const chance = RETIRE.coach.chanceAtMin + (RETIRE.coach.chanceAtMax - RETIRE.coach.chanceAtMin) * t;
      if (this.rand() < chance) rec.coachOffer = this.makeCoachOffer(s, best, bestProf);
    }
    this.retired.unshift(rec);
    if (this.retired.length > 60) this.retired.length = 60;
    this.remove(s, s.classId);
    return rec;
  }

  /** 引退した選手をコーチにしたときの候補（現役時代の得意泳法がそのまま得意になる）。 */
  private makeCoachOffer(s: Student, stroke: Stroke, prof: number): RecruitCandidate {
    // 格は「熟練度」と「実績」の両方から。名選手ほど良いコーチになる
    const t = clamp(prof / 999, 0, 1);
    const a = clamp(s.achievePoints / RETIRE.coach.achieveForTop, 0, 1);
    const span = RETIRE.coach.qualityMax - RETIRE.coach.qualityMin;
    const quality = Math.round(RETIRE.coach.qualityMin + span * clamp((t + a) / 2, 0, 1));
    const coach = makeCoach(this.rand, this.nextCoachId++, quality, stroke);
    coach.name = `${s.name}コーチ`;
    return { coach, cost: COACHING.recruit.baseCostByQuality[quality] ?? 20, since: this.monthCount };
  }

  /** いまコーチの誘いを受けている引退選手（雇う画面に出す）。 */
  coachOffers(): RetiredRecord[] {
    const limit = this.year * 12 + this.month - RETIRE.coach.offerMonths;
    return this.retired.filter((r) => r.coachOffer && r.year * 12 >= limit);
  }

  /** 引退選手をコーチとして雇う。 */
  hireRetired(rec: RetiredRecord): { ok: boolean; reason?: string } {
    if (!rec.coachOffer) return { ok: false, reason: "コーチの誘いを受けていない" };
    const r = this.hireCoach(rec.coachOffer);
    if (r.ok) rec.coachOffer = null;
    return r;
  }

  private enforceAgeLimits(): { events: string[]; leavingSoon: Student[] } {
    const events: string[] = [];
    const leavingSoon: Student[] = [];
    for (const c of CLASS_ORDER) {
      const overs = this.students[c.id].filter((s) => this.exceedsAgeLimit(c.id, s.grade));
      for (const s of overs) {
        if (c.id === "youji") {
          if (this.roomIn("gakudo") > 0 && !this.exceedsAgeLimit("gakudo", s.grade)) {
            this.move(s, "youji", "gakudo");
            events.push(`${s.name} が卒園して 学童 へ`);
            continue;
          }
          /**
           * 【卒園したのに学童が満員】すぐには退会させず、**2ヶ月**待つ（→ YOUJI_GAKUDO_WAIT_MONTHS）。
           * そのあいだは毎月「学童の枠が空いていない」と出し、枠が空けば自動で学童へ移す
           *（→ placeWaitingGraduates）。空かなければ2ヶ月後に退会。
           */
          if (s.leaveAtMonth == null && !this.exceedsAgeLimit("gakudo", s.grade)) {
            s.leaveAtMonth = this.monthCount + YOUJI_GAKUDO_WAIT_MONTHS;
            events.push(`${s.name} が卒園したが、学童の枠が空いていない（${YOUJI_GAKUDO_WAIT_MONTHS}ヶ月空かなければ退会）`);
            continue;
          }
        }
        /**
         * 【ここでは消さない】学年が上がるのと退会が同じ1コマで起きると、
         * プレイヤーから見れば「育てていた子が黙って居なくなった」だけになる。
         * 予告を出して**1ヶ月の猶予**を置き、そのあいだに昇格させれば残せる。
         */
        if (s.leaveAtMonth != null) continue; // もう予告済み
        s.leaveAtMonth = this.monthCount + 1;
        leavingSoon.push(s);
        events.push(`${s.name}（${s.grade}）は来月で退会（${c.label}の年齢を超えた）`);
      }
    }
    return { events, leavingSoon };
  }

  /**
   * 卒園して学童の空きを待っている子（幼児クラスに残ったまま、退会の予告が付いている）。
   * monthsLeft ＝ 退会まであと何ヶ月か（1＝来月で退会）。
   */
  gakudoWaiting(): { student: Student; monthsLeft: number }[] {
    return this.students.youji
      .filter((s) => s.leaveAtMonth != null && this.exceedsAgeLimit("youji", s.grade))
      .map((s) => ({ student: s, monthsLeft: Math.max(1, (s.leaveAtMonth ?? 0) - this.monthCount) }));
  }

  /**
   * 学童の枠が空いたぶん、待っている卒園児を先に入れる（待った順＝退会が近い順）。
   * 月の頭に、退会の処理より**先に**呼ぶ（空いたのに退会させてしまわないように）。
   */
  private placeWaitingGraduates(): string[] {
    const events: string[] = [];
    const waiting = this.gakudoWaiting()
      .map((w) => w.student)
      .sort((a, b) => (a.leaveAtMonth ?? 0) - (b.leaveAtMonth ?? 0));
    for (const s of waiting) {
      if (this.roomIn("gakudo") <= 0) break;
      if (this.exceedsAgeLimit("gakudo", s.grade)) continue;
      this.move(s, "youji", "gakudo");
      events.push(`${s.name} が学童へ（枠が空いた）`);
    }
    return events;
  }

  /** 退会を予告されている選手（名簿の印・HUD の案内に使う）。 */
  leavingStudents(): Student[] {
    const out: Student[] = [];
    for (const c of CLASS_ORDER) for (const s of this.students[c.id]) if (s.leaveAtMonth != null) out.push(s);
    return out;
  }

  /**
   * 予告の月になった選手を退会させる（月の頭に呼ぶ）。
   * 猶予のあいだに昇格して年齢が収まった子は move が印を外しているので、ここには来ない。
   */
  private removeLeavers(): string[] {
    const events: string[] = [];
    for (const c of CLASS_ORDER) {
      for (const s of [...this.students[c.id]]) {
        if (s.leaveAtMonth == null || s.leaveAtMonth > this.monthCount) continue;
        this.remove(s, c.id);
        events.push(`${s.name}（${s.grade}）が退会`);
      }
    }
    return events;
  }

  // -------------------------------------------------------------- 自動練習（事前選択方式）

  /**
   * そのクラスの練習を minutes ゲーム分だけ進める（クラスの時間帯に scene から毎フレーム呼ばれる）。
   * スクールは全体練習（均等・低速）。育成以上は各自の系統A/系統Bに従って自動上昇。
   * onGain には上昇したステータスと量を渡す（画面の「+1」演出用。sim 側は何も表示しない）。
   */
  /**
   * クラスの練習を minutes ぶん進める。
   *
   * members には「今このコマで練習している選手」を渡すこと（→ lineupAt / practicingNow）。
   * 省略するとクラス全員になるが、コマを2つ入れているクラスでは
   * **同じ選手に2回ぶんの練習がかかってしまう**ので、シーンからは必ず渡す。
   */
  tickPractice(
    classId: ClassId,
    minutes: number,
    onGain?: PracticeGainHandler,
    members?: readonly Student[],
  ): void {
    const arr = members ?? this.students[classId];
    if (arr.length === 0 || minutes <= 0) return;
    const school = isSchoolClass(classId);
    const classAvg = this.classAverageOf(classId);
    const head = this.headCoachOf(classId);
    const coachMult = this.coachGrowthMultOf(classId);
    const coachQ = head?.quality ?? 0;
    const schoolMult = this.schoolCoachMult(classId);
    const classPlan = this.classPlans[classId];
    // 専門スタッフ（栄養士＝成長と疲労、ドクター＝ケガ）はクラブ全員に効く
    const sb = this.staffCache;
    // 医科学センター（大型施設）：測定で素質を早く見抜ける
    const scienceObserve = 1 + EQUIPMENT.scienceObservePer * this.usableCount("science");
    // 動線：入口から練習する部屋までが近いほど、移動に時間を取られず効率が良い。
    const routeMult = this.routeEfficiency() * ROUTE.baseTrainBonus;

    // 【器具は部屋に同梱】マット・縄跳びの類はスタジオが持っている。
    // 同時に使える台数＝スタジオのグレード（小2／中4／大7）で、名簿の上から順に使える。
    const studioStations = this.stationCount("studio");
    const matN = studioStations;
    const ropeN = studioStations;
    const studioGrade = Math.max(
      1,
      ...this.usableEquipment().filter((e) => e.kind === "studio").map((e) => gradeOf(e)),
    );
    // 疲れにくさ・練習効率は、グレードが上がるほど良くなる
    const matMult = 1 - 0.08 * gradeEffect(studioGrade);
    const ropeMult = 1 + 0.05 * gradeEffect(studioGrade);
    // 研究（会議室）で得た恒久的な補正
    const rb = this.researchBonus();
    /**
     * 【練習の部屋】このコマを医科学センター／低酸素トレーニングルームで練習しているなら、
     * その部屋の得意な能力を鍛え、伸びを TRAINING_ROOM.trainMult 倍にする。
     * 部屋では泳げないので、泳法の練習（熟練度）はしない。
     */
    const venue = school ? null : this.trainingRoomOf(classId);
    const venueFocus = venue ? (TRAINING_ROOM.focus[venue.kind] ?? []) : [];
    // 大型プールのコマなら、能力も泳法もよく伸びる（→ BIG_FACILITY.pool10Train）。スクールも同じ
    const bigPool = this.sessionVenueOf(classId)?.kind === "pool10" ? BIG_FACILITY.pool10Train : 1;

    // 【休養中の選手はここで休む】
    // 休養中の選手は練習の顔ぶれ（arr）に**入っていない**ので、別に見に行く。
    // ここを通らないと「休ませたのに体力が戻らない」になる。
    // 寮の選手は移動が無いぶん、休んでいる時間をまるごと回復に使える。
    this.tickResting(classId, minutes);

    let using = 0; // 実際に練習している人数
    for (const s of arr) {
      const itemFatigueMult = using < matN ? matMult : 1;
      const itemTrainMult = using < ropeN ? ropeMult : 1;
      using++;

      s.practiceAccum += minutes;
      let guard = 0;
      while (s.practiceAccum >= PRACTICE.minutesPerStep && guard < 12) {
        s.practiceAccum -= PRACTICE.minutesPerStep;
        guard++;
        if (school) {
          const delta = applySchoolPractice(s, {
            coachMult: schoolMult * itemTrainMult * rb.train * sb.growthMult * routeMult * bigPool,
          });
          this.noteGain(s, delta);
          // スクールは5つの能力が同時に上がる。**5つとも通知する**
          // （表示するかどうかは受け取り側が決める。いまは「表示される数字が
          //   1つ上がった瞬間」だけ出すので、数字だらけにはならない）。
          if (onGain) reportGains(s, delta, onGain);
        } else {
          // 全体練習を基本にし、個人指定がある選手だけ自分のメニューを行う
          const basePlan = effectivePlan(s, classPlan);
          // 練習の部屋では、その部屋の得意な能力を鍛える（本人のメニューより部屋が優先）。
          // 得意が複数ある部屋（医科学＝フォーム・スタート・ターン）は、いまいちばん低いものを鍛える
          //（測って弱いところを直す＝3つが順にそろって伸びる）
          const plan =
            venueFocus.length === 0
              ? basePlan
              : {
                  ...basePlan,
                  // その子がまだ鍛えられない能力（年齢など → canTrain）は飛ばす
                  ability:
                    [...venueFocus].filter((a) => canTrain(s, a)).sort((a, b) => s.stats[a] - s.stats[b])[0] ??
                    venueFocus[0],
                };
          const fitMult = classFitMultiplier(s, classAvg);
          // 選手を見るのはクラスの監督（専属コーチは 2026-09-27 に廃止）
          const mentor = head;
          const mentorMult = mentor === head ? coachMult : coachTrainMult(mentor);
          const mentorQ = mentor?.quality ?? coachQ;
          // 専門種目マッチング：見てくれるコーチの得意泳法と選手の得意泳法が一致すると大幅UP
          const specMult = specialtyTrainMult(mentor, s);
          if (canTrain(s, plan.ability)) {
            const res = applyTraining(s, plan.ability, {
              coachMult: mentorMult * routeMult,
              coachQuality: mentorQ,
              classFitMult: fitMult,
              specialtyMult: specMult,
              // 設備（スタジオ＝フォーム／筋トレ＝スピード）。中学生以上だけ効く。
              // 部屋（スタジオ／筋トレルーム）の補正 × 置いた器具の補正。
              // 高い筋トレ器具ほどスピードの伸びが大きい。
              facilityMult:
                this.equipmentMultFor(s, plan.ability) *
                (venueFocus.includes(plan.ability) ? TRAINING_ROOM.trainMult : 1) *
                bigPool,
              itemTrainMult,
              itemFatigueMult,
              staffTrainMult: sb.growthMult,
              staffFatigueMult: sb.fatigueMult,
              // 医科学センターは練習中のケガそのものを減らす（→ EQUIPMENT.scienceInjuryCut）
              staffInjuryMult: sb.injuryChanceMult * this.scienceInjuryMult(),
              // 研究：ステータス別の成長率アップ ×（全体の練習効率アップ）
              researchMult: rb.stat[plan.ability] * rb.train,
              researchInjuryMult: rb.injury,
              researchObserveMult: rb.observe * scienceObserve,
              rand: this.rand,
            });
            this.noteGain(s, res.delta);
            if (onGain) reportGains(s, res.delta, onGain);
            // 追い込みすぎてケガをした（まれ）。画面へ知らせる
            if (res.injuredDays > 0) this.trainInjuryQueue.push({ student: s, days: res.injuredDays });
            // 下山後にスピード練習を積むと、高地で鈍ったスプリント感覚が戻る
            if (plan.ability === "speed" && s.altitude && s.altitude.sprintDull > 0) {
              s.altitude.sprintDull = Math.max(0, s.altitude.sprintDull - ALTITUDE.speedTrainRelief);
            }
          }
          // 泳法の練習にも体力を使う。**泳法によって重さが違う**
          //（バタフライと個人メドレーは疲れる、平泳ぎは軽い → STROKE.energyCost）。
          // 育成〜プロは1日に何コマでも入れられるので、体力が尽きればそれ以上は伸びない
          // ＝「コマを詰め込むほど強くなる」にはならず、休ませる判断が要る。
          if (venue) continue; // 部屋では泳げない（泳法の練習はプールのコマで）
          const strokeCost = TRAINING.strokeEnergyCost * (STROKE.energyCost[plan.stroke] ?? 1);
          if (s.energy < strokeCost) break;
          s.energy = Math.max(0, s.energy - strokeCost);
          const sres = applyStrokeTraining(s, plan.stroke, {
            coachMult: mentorMult * routeMult * bigPool,
            classFitMult: fitMult,
            specialtyMult: specialtyStrokeMult(mentor, plan.stroke),
            researchMult: rb.stroke[plan.stroke] * rb.train,
            // 入寮していると泳ぎ込む時間が取れる＝熟練度がよく伸びる（→ DORM.strokeGrowthMult）
            dormMult: s.inDorm ? DORM.strokeGrowthMult : 1,
          });
          // 泳法練習の副産物で上がった能力も、伸びとして数える（画面の「+1」にも出す）
          this.noteGain(s, sres.stats);
          if (onGain) reportGains(s, sres.stats, onGain);
        }
      }
    }
  }

  /**
   * 休養中の選手の1tick（体力とコンディションが戻る）。
   *
   * 休養中の選手は `lineupAt` の顔ぶれから外れる＝プールにも出てこないので、
   * 練習の適用（tickPractice の本体）ではなくここでまとめて面倒を見る。
   * ときどき「ぐっすり休めた」ぶんが上乗せされる（→ REST.bonusChance）。
   */
  private tickResting(classId: ClassId, minutes: number): void {
    const sb = this.staffCache;
    for (const s of this.students[classId]) {
      if (!isResting(s, this.dayCount)) continue;
      const r = applyRestTick(
        s,
        minutes,
        sb.recoveryMult * (s.inDorm ? DORM.energyRecoverMult : 1),
        this.rand,
      );
      // よく休めた回は気持ちも上向く（休養が「損なだけ」にならないように）
      if (r.bonus) applyMood(s, "rested");
    }
  }

  // -------------------------------------------------------------- 特別練習

  /*
   * 【特別練習は情熱と体力が続くかぎり何度でも】（2026-09-27）
   * 以前は「同じメニューは間を空ける」（cooldownDays）があったが、単位がゲーム日＝1週だったので
   * 3〜6週も待たされ、実際には「月1回しか同じ特訓ができない」になっていた。
   * いまは止めるのは ①情熱 ②体力・調子（③お金）だけ。
   */

  /**
   * そのメニューが解禁されているか。
   * `requiresResearch` にテーマの id を書くと、**その研究をレベル1以上にするまで使えない**
   *（＝研究を進めると新しい特別練習が増える）。
   */
  specialUnlocked(menuId: string): boolean {
    const menu = specialMenu(menuId);
    if (!menu) return false;
    if (!menu.requiresResearch) return true;
    return this.researchLevelOf(menu.requiresResearch as ResearchId) > 0;
  }

  /**
   * その特別練習を受けられるか（理由つき）。
   * 押せない理由は必ず1行で返す（UI がそのまま出す）。
   */
  canRunSpecial(s: Student, menuId: string): { ok: boolean; reason?: string } {
    const menu = specialMenu(menuId);
    if (!menu) return { ok: false, reason: "そのメニューは無い" };
    if (isSchoolClass(s.classId)) return { ok: false, reason: "スクール生は全体練習のみ" };
    if (!this.specialUnlocked(menuId)) return { ok: false, reason: "まだ研究できていない" };
    if (isInjured(s)) return { ok: false, reason: "ケガが治ってから" };
    if (s.awayDays > 0) return { ok: false, reason: "遠征中" };
    if (this.isAtCamp(s)) return { ok: false, reason: "合宿中" };
    if (s.inRehab) return { ok: false, reason: "リハビリ中" };
    if (s.energy < energyMax(s) * SPECIAL_TRAINING.minEnergyRatio) {
      return { ok: false, reason: "体力が足りない（休ませてから）" };
    }
    if (conditionLevel(s.condition) === "tired") return { ok: false, reason: "疲労がひどい（休ませてから）" };
    if (menu.requiresRoom && this.usableCount(menu.requiresRoom) === 0) {
      return { ok: false, reason: `${equipmentDef(menu.requiresRoom).label}が要る（道も繋ごう）` };
    }
    if (this.gems < menu.cost) return { ok: false, reason: `◆${menu.cost} 足りない` };
    // 【情熱】効果が高いぶん、クラブの情熱を大きく使う（→ PASSION）
    if (this.passion < menu.passion) {
      return { ok: false, reason: `情熱が足りない（要 ${menu.passion}／いま ${this.passionShown()}）` };
    }
    return { ok: true };
  }

  /**
   * 特別練習を1回行う。
   * 中身は「通常練習を reps 回ぶん、倍率つきで一気に行う」。
   * ビフォー／アフターを返すので、UI はどれだけ伸びたかをそのまま見せられる。
   */
  runSpecialTraining(s: Student, menuId: string): SpecialResult {
    const st = this.canRunSpecial(s, menuId);
    if (!st.ok) return { ok: false, reason: st.reason };
    const menu = specialMenu(menuId)!;

    this.gems -= menu.cost;
    this.spendPassion(menu.passion);
    this.specialUsed.push(s.id);

    const before = { ...s.stats } as Record<StatKey, number>;
    const energy0 = s.energy;
    const cond0 = s.condition;
    const plan = this.planFor(s);
    // 個人メドレーは4泳法に分けて積むので、1泳法ではなく**合計**で測る
    const strokeBefore = CORE_STROKES.reduce((n, k) => n + s.strokeProf[k], 0);
    let injured = false;

    const opts = this.trainOptionsFor(s);
    /**
     * 【研究で質が上がる】研究の練習補正のうち、1.0 を超えたぶんを
     * researchGainMult 倍して特別練習に上乗せする（→ SPECIAL_TRAINING.researchGainMult）。
     * 研究を進めたクラブほど、同じメニューでも伸びが大きい。
     */
    const researchQuality = 1 + (this.researchBonus().train - 1) * SPECIAL_TRAINING.researchGainMult;
    for (let i = 0; i < menu.reps; i++) {
      const key = specialTargetAt(menu, s, plan.ability, i);
      if (!canTrain(s, key)) break;
      const res = applyTraining(s, key, {
        ...opts,
        // 特別練習ぶんの上乗せ。疲労も同じだけ重くする（＝ただの得ではない）
        itemTrainMult: (opts.itemTrainMult ?? 1) * menu.gainMult * researchQuality,
        itemFatigueMult: (opts.itemFatigueMult ?? 1) * menu.fatigueMult,
        // 【上限の近くでも効く】これが無いと、育った選手ほど ±0 になる（→ SPECIAL_TRAINING.dimFloor）
        dimFloor: SPECIAL_TRAINING.dimFloor,
      });
      if (res.formInjury) injured = true;
    }
    for (let i = 0; i < menu.strokeReps; i++) {
      applyStrokeTraining(s, plan.stroke, {
        coachMult: (opts.coachMult ?? 1) * menu.gainMult,
        classFitMult: opts.classFitMult,
        specialtyMult: specialtyStrokeMult(this.headCoachOf(s.classId), plan.stroke),
        researchMult: this.researchBonus().stroke[plan.stroke] * this.researchBonus().train,
      });
    }
    // 追い込んだぶん、終わったあとにコンディションが落ちる（次のコマに響く＝代償）
    s.condition = clampCondition(s.condition - menu.conditionCost);

    return {
      ok: true,
      menu,
      before,
      after: { ...s.stats } as Record<StatKey, number>,
      strokeGain: CORE_STROKES.reduce((n, k) => n + s.strokeProf[k], 0) - strokeBefore,
      energyUsed: energy0 - s.energy,
      conditionDrop: cond0 - s.condition,
      injured,
      cost: menu.cost,
    };
  }

  /**
   * 選手1人ぶんの練習補正（コーチ・クラス環境・設備・研究・スタッフ・動線）。
   * 特別練習など「通常のコマ以外」で練習させるときに使う。
   */
  private trainOptionsFor(s: Student): TrainOptions {
    const sb = this.staffCache;
    const rb = this.researchBonus();
    const head = this.headCoachOf(s.classId);
    const mentor = head;
    const routeMult = this.routeEfficiency() * ROUTE.baseTrainBonus;
    const plan = this.planFor(s);
    return {
      coachMult: (mentor ? coachTrainMult(mentor) : this.coachGrowthMultOf(s.classId)) * routeMult,
      coachQuality: mentor?.quality ?? 0,
      classFitMult: classFitMultiplier(s, this.classAverageOf(s.classId)),
      specialtyMult: specialtyTrainMult(mentor, s),
      facilityMult: this.equipmentMultFor(s, plan.ability),
      staffTrainMult: sb.growthMult,
      staffFatigueMult: sb.fatigueMult,
      staffInjuryMult: sb.injuryChanceMult,
      researchMult: rb.stat[plan.ability] * rb.train,
      researchInjuryMult: rb.injury,
      // 医科学センターがあると、測定で素質（成長タイプ）を早く見抜ける
      researchObserveMult: rb.observe * (1 + EQUIPMENT.scienceObservePer * this.usableCount("science")),
      rand: this.rand,
    };
  }

  // -------------------------------------------------------------- 練習時間帯の開始／終了

  /**
   * クラスの練習時間帯（1コマ）が始まった。
   * シーンがクラスを切り替えるときに呼ぶ。
   *
   * 休養中かどうかは日付（restUntilDay）で決まるので、ここでは何も消費しない
   * （以前は「休む予約を1回ぶん消費して旗を立てる」方式で、旗が下りなくなる不具合があった）。
   *
   * `slot` を渡すと**コマ単位**で数える。同じクラスを続けて2コマ・3コマ入れた場合、
   * コマが替わったところで一度セッションを閉じて休憩を挟み、次のコマを開き直す。
   * これをしないと「1コマ目で体力を使い切って、あとは何コマ入れても伸びない」になる。
   */
  beginClassSession(classId: ClassId, members?: readonly Student[], slot?: number): void {
    const open = this.sessionOpen[classId] === true;
    const cur = this.sessionSlot[classId] ?? -1;
    const next = slot ?? -1;
    if (open && (next < 0 || cur === next)) return;
    // コマが替わった：合間の休憩（体力が少し戻る）。回復設備へは行かせない（すぐ次のコマなので）
    if (open) this.endClassSession(classId, members, { recovery: false });
    this.sessionOpen[classId] = true;
    this.sessionSlot[classId] = next;
  }

  /**
   * クラスの練習時間帯が終わった。
   * 「回復したい」欲求が閾値を超えている選手が、空いている回復設備／アイテムを使いに行く。
   * 埋まっていれば並び、待ちが長すぎる選手は諦めて帰る（sim/needs.ts）。
   */
  endClassSession(
    classId: ClassId,
    members?: readonly Student[],
    opts: { recovery?: boolean } = {},
  ): RecoveryReport {
    this.sessionOpen[classId] = false;
    this.sessionSlot[classId] = -1;
    const arr = members ?? this.students[classId];
    // コマとコマの合間（同じクラスが続けて練習する切れ目）では回復設備へは行かせない。
    // その場で休んで次のコマに入るだけ＝体力が一部戻るところまで。
    let report: RecoveryReport = { wanted: 0, used: 0, gaveUp: 0, outcomes: [] };
    if (opts.recovery !== false) {
      // 使える回復アイテムはスタジオに置けている数まで。研究が進むと回復量が増える。
      const slots = recoverySlots(this.usableEquipment(), this.researchBonus().recovery);
      report = planRecovery(arr, slots, this.rand);
      // 【満足度】良い設備を使えたら機嫌が良くなり、混んでいて諦めたら下がる。
      // 「設備をそろえる → 選手が気持ちよく練習できる」を数字で結びつけるのがここ。
      for (const o of report.outcomes) {
        // 【選手も混雑を数える】順番が回ってこなくて諦めた／空きが無かった
        // 数えるのは**並んでいた施設**で、同じ子は月に1回だけ（→ noteStudentCrowded）
        if (!o.slot && (o.gaveUp || o.full) && o.wantKind) this.noteStudentCrowded(o.student, o.wantKind);
        if (o.slot) this.noteRoomUse(o.slot.roomId);
        if (o.slot) applyMood(o.student, "recovered");
        else if (o.gaveUp) applyMood(o.student, "gaveUpRecovery");
        else if (o.full) applyMood(o.student, "noRecovery");
      }
    }
    // 休憩ラウンジのソファは数に限りがある（早いもの勝ち）
    const loungeSeats = this.usableCount("lounge") * AMENITY.loungeSeats;
    let loungeUsed = 0;

    for (const s of arr) {
      // 練習そのものの手ごたえ。体力に余裕があれば気持ちよく、
      // 疲れきっていれば消耗する（＝休ませる動機になる）。
      // コマの合間（recovery:false）は「まだ練習の途中」なので数えない。
      if (opts.recovery !== false) {
        const ratio = s.energy / Math.max(1, energyMax(s));
        if (ratio <= MOOD_EXHAUSTED_RATIO) applyMood(s, "exhausted");
        else if (ratio <= MOOD_TIRED_RATIO) applyMood(s, "hardPractice");
        else applyMood(s, "goodPractice");
      }
      // 【休憩ラウンジ】建てていると、コマの合間にほんの少し余分に体力が戻る。
      // 回復施設（風呂・サウナ・外気浴・マッサージ）ほどではない「ついで」の回復で、
      // 定員（AMENITY.loungeSeats × 部屋数）ぶんの選手にだけ効く。
      // コマの合間の休憩で体力が戻る。**戻る量は持久力で決まる**（→ restRefillRatio）。
      // 持久力を鍛えた選手は消費より回復が上回り、1日に何コマ入れても持つ。
      // 逆に持久力の低い子は数コマで空になり、そこから先は調子とケガのリスクが上がる。
      const em = energyMax(s);
      const lounge = loungeUsed < loungeSeats ? AMENITY.loungeEnergy : 0;
      if (lounge > 0) loungeUsed++;
      // 【戻るのは「減ったぶんの一部」】最大値に対する割合で戻すと、
      // 消費の小さい選手（持久力が高い＝コマの消費が小さい）は毎コマ満タンに戻ってしまい、
      // 練習しても体力バーが動かない＝手ごたえが無くなる。
      // 減っているぶんに比例させると、**戻る量が必ず消費より小さくなる水準**へ落ち着く。
      // 持久力が高いほど高い水準で釣り合う（＝何コマでも泳げるが満タンにはならない）。
      // 低酸素トレーニングルームがあると、合間に戻る体力が増える（→ EQUIPMENT.altitudeRestPer）
      const alt = this.usableCount("altitudeLab") > 0 ? 1 + EQUIPMENT.altitudeRestPer : 1;
      s.energy = Math.min(em, s.energy + (em - s.energy) * Math.min(1, restRefillRatio(s) * alt + lounge));
    }
    return report;
  }

  /** その時間帯を休んでいる選手（画面に出さない判断に使う）。 */
  restingIn(classId: ClassId): Student[] {
    return this.students[classId].filter((s) => isResting(s, this.dayCount));
  }

  // -------------------------------------------------------------- 休養（1週間まるごと休む）

  /** その選手はいま休養中か。 */
  isRestingNow(s: Student): boolean {
    return isResting(s, this.dayCount);
  }

  /** あと何週休むか（0＝休養なし）。表示に使う。 */
  restWeeksLeftOf(s: Student): number {
    return restWeeksLeft(s, this.dayCount);
  }

  /** 1人を休養させる（今週から REST.weeks 週ぶん）。戻り値は休むことになった週数。 */
  restStudent(s: Student): number {
    const n = orderRest(s, this.dayCount);
    // 休ませてもらえると機嫌が上向く（休養は「体力」だけでなく「気持ち」にも効く）
    if (n > 0) applyMood(s, "rested");
    return n;
  }

  /** 休養を取り消す（次の練習からすぐ戻る）。 */
  cancelRestOf(s: Student): void {
    cancelRest(s);
  }

  /** クラス全員を休養させる（大会前の調整などに使う）。戻り値は休みに入った人数。 */
  restClass(classId: ClassId): number {
    let n = 0;
    for (const s of this.students[classId]) if (this.restStudent(s) > 0) n++;
    return n;
  }

  /** クラス全員の休養を取り消す。 */
  cancelRestClass(classId: ClassId): void {
    for (const s of this.students[classId]) cancelRest(s);
  }

  /** そのクラスで休養している人数。 */
  restScheduledCount(classId: ClassId): number {
    return this.students[classId].filter((s) => isResting(s, this.dayCount)).length;
  }

  // -------------------------------------------------------------- 全体練習（クラス単位のメニュー）

  /** そのクラスは全体練習を指定できるか（設計：育成B〜プロ）。 */
  canAssignClassPlan(classId: ClassId): boolean {
    return (CLASSPLAN.assignable as readonly ClassId[]).includes(classId);
  }

  classPlanOf(classId: ClassId): PracticePlan | null {
    return this.classPlans[classId];
  }

  /** クラスの全体練習を指定する。個人指定している選手はそのまま自分のメニューを続ける。 */
  setClassPlan(classId: ClassId, plan: Partial<PracticePlan>): { ok: boolean; reason?: string } {
    if (!this.canAssignClassPlan(classId)) return { ok: false, reason: "このクラスは全体練習を指定できない" };
    const cur = this.classPlans[classId] ?? { ability: "form" as StatKey, stroke: "free" as PracticePlan["stroke"] };
    this.classPlans[classId] = { ability: plan.ability ?? cur.ability, stroke: plan.stroke ?? cur.stroke };
    return { ok: true };
  }

  /** その選手が実際に行うメニュー（個人指定 → 全体指定 の順で解決）。 */
  planFor(s: Student): ResolvedPlan {
    return effectivePlan(s, this.classPlans[s.classId]);
  }

  /** 個人メニューを指定する（＝全体指定を上書きするモードに切り替わる）。 */
  setIndividualPlan(s: Student, plan: Partial<PracticePlan>): void {
    const base = this.planFor(s);
    s.plan = { ability: plan.ability ?? base.ability, stroke: plan.stroke ?? base.stroke };
    s.planMode = "self";
  }

  /** 個人指定をやめ、全体練習に戻す。 */
  useClassPlan(s: Student): void {
    s.planMode = "class";
  }

  /** クラス全員の個人指定を解除して全体練習に揃える。戻り値は戻した人数。 */
  useClassPlanAll(classId: ClassId): number {
    let n = 0;
    for (const s of this.students[classId]) {
      if (s.planMode === "self") {
        s.planMode = "class";
        n++;
      }
    }
    return n;
  }

  /** そのクラスで個人メニューにしている人数（全体練習の画面に出す）。 */
  individualPlanCount(classId: ClassId): number {
    return this.students[classId].filter((s) => s.planMode === "self").length;
  }

  /**
   * この選手に効いている設備の練習補正。
   * 部屋（スタジオ＝フォーム／筋トレルーム＝スピード）の補正に、
   * その部屋に置いた器具ぶんの補正を掛ける。
   * 筋トレ器具は高いものほどスピードの伸びが大きい。
   */
  equipmentMultFor(s: Student, key: StatKey): number {
    // 医科学センターは「どの能力の練習でも」効く（1棟につき +scienceTrainPer）。
    // 他の部屋が1つの能力を伸ばすのに対して、ここだけは練習そのものの質を上げる。
    const science = 1 + EQUIPMENT.scienceTrainPer * this.usableCount("science");
    const room = equipmentTrainMult(this.usableEquipment(), s, key) * science;
    if (key !== "speed" || !canUseEquipment(s)) return room;
    return room * (1 + this.gymGearBoost());
  }

  /**
   * 一日の区切り（自動練習の一日の締め）。
   * 体力を回復してコンディションを少し戻し、あわせて暦を1日進める。
   * 暦が進むことでケガが治り、高地の効果帯も移っていく。
   */
  onDayRoll(): void {
    this.dayCount += 1;
    const sb = this.staffCache;
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        const em = energyMax(s);
        // 寮に入っている選手は移動時間が無く、生活が整うのでコンディションの戻りが速い
        const dormCondition = s.inDorm ? DORM.conditionRecoverMult : 1;
        // 【週明けの回復は半分だけ】全回復にすると回復施設を建てる理由が無くなる（→ DAILY）
        const refill = s.inDorm ? DAILY.energyRefillDorm : DAILY.energyRefill;
        s.energy = s.energy + (em - s.energy) * Math.min(1, refill);
        // 研究（コンディション管理）・栄養士・ドクターが進んでいると、日々の回復が早くなる
        const rate = Math.min(
          1,
          DAILY.conditionRecoverRate *
            this.researchBonus().conditionRecover *
            sb.recoveryMult *
            sb.conditionMult *
            dormCondition,
        );
        s.condition = recoverToward(s.condition, CONDITION.baseline, rate);
        // 一晩休めば「回復したい」欲求も落ち着く（翌日また溜まっていく）
        const relief = Math.min(0.95, NEEDS.dailyRelief * (s.inDorm ? 1 + DORM.needReliefBonus : 1));
        s.recoveryNeed = Math.max(0, s.recoveryNeed * (1 - relief));
        // 【満足度】一晩たてば気持ちも「ふつう」へ戻る。良い状態も悪い状態も薄れるので、
        // 日々の運営（設備・休養・伸び）が効き続ける。寮生は生活が整うぶん少しだけ機嫌が良い。
        relaxMood(s);
        if (s.inDorm) applyMood(s, "dorm");
        if (s.injuryDays > 0) applyMood(s, "injured", DAILY_INJURY_MOOD_WEIGHT);
      }
    }
    this.healInjuries();
    this.expireAltitude();
    this.tickCamp();
  }

  // -------------------------------------------------------------- 格（成績で決まる8段階）

  /**
   * その大会・その種目の記録を更新したか（更新したら覚える）。
   * まだ一度も泳いでいない種目は「初記録」なので**大会新記録にはしない**
   *（毎回の初出場が全部お祝いになってしまうため）。
   */
  private noteMeetRecord(compId: string, ev: RaceEvent, time: number): boolean {
    const key = `${compId}:${ev.stroke}${ev.distance}`;
    const prev = this.meetRecords[key];
    if (prev === undefined) {
      this.meetRecords[key] = time;
      return false;
    }
    if (time >= prev) return false;
    this.meetRecords[key] = time;
    return true;
  }

  /** 練習中の故障を取り出す（取り出すと空になる）。 */
  takeTrainingInjuries(): { student: Student; days: number }[] {
    const out = this.trainInjuryQueue;
    this.trainInjuryQueue = [];
    return out;
  }

  /** 格が上がった通知を取り出す（取り出すと空になる）。 */
  takeRankUps(): RankUpEvent[] {
    const out = this.rankUpQueue;
    this.rankUpQueue = [];
    return out;
  }

  private noteRankUp(s: Student): void {
    const ev = refreshRank(s);
    if (ev) {
      this.rankUpQueue.push(ev);
      // 認められたことは何よりの励みになる（機嫌が大きく上がる）
      applyMood(s, "rankUp");
    }
  }

  /**
   * 月例記録会（自動）。全員が得意種目でタイムを計測する。
   * 大会に出られない育成B・育成A・スクール生でも、ここで自己ベストが更新されれば格が上がる。
   * 「有望な子が育成段階から地域で有名になる」実感はここから来る。
   */
  private runMonthlyTimeTrial(): number {
    if (!RANK.monthlyTrial) return 0;
    let improved = 0;
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        const time = raceTimeFor(s, s.fav, this.rand, this.raceExtraFactor(s, s.fav));
        if (recordTime(s, s.fav, time)) improved++;
        this.noteRankUp(s);
      }
    }
    return improved;
  }

  get currentClass(): ClassDef | null {
    return this.currentClassId ? classDef(this.currentClassId) : null;
  }

  // -------------------------------------------------------------- 短期教室 / 体験会

  /**
   * スクール生を total 人（幼児/学童に振り分けて）入会させる。才能ある子は最大1人。
   * プールの練習枠を超えては入れられない（＝プール増設が拡大の条件）。
   * turnedAway に「枠が足りず断った人数」を返し、UIで増設を促す。
   */
  private enrollSchool(
    total: number,
    youjiRatio: number,
  ): { youji: number; gakudo: number; talented: boolean; turnedAway: number; ids: number[] } {
    // 【1回の上限】人気度が高くても、1回のイベントで来るのはここまで（→ ENROLL.maxPerEvent）。
    // 受け入れ枠（roomIn）とは別の上限で、超えたぶんは「断った」ではなく**来ない**。
    const total0 = Math.min(ENROLL.maxPerEvent, Math.max(0, Math.round(total)));
    const youjiSpace = this.roomIn("youji");
    // 学童の空きは、卒園して待っている子が先（→ placeWaitingGraduates）
    const gakudoSpace = Math.max(0, this.roomIn("gakudo") - this.gakudoWaiting().length);
    let youjiN = Math.min(youjiSpace, Math.round(total0 * youjiRatio));
    let gakudoN = Math.min(gakudoSpace, total0 - youjiN);
    // 片方が埋まっていたら、もう片方の空きに回す
    const leftover = total0 - youjiN - gakudoN;
    if (leftover > 0) {
      const extraYouji = Math.min(youjiSpace - youjiN, leftover);
      youjiN += extraYouji;
      gakudoN += Math.min(gakudoSpace - gakudoN, leftover - extraYouji);
    }
    const added = youjiN + gakudoN;
    const turnedAway = total0 - added;

    // 研究（スカウティング）が進んでいると、才能ある子が混じりやすくなる
    const talentChance =
      (SHORTCOURSE.talentBaseChance + talentPopularity(this.popularity) / POPULARITY.talentDivisor) * this.researchBonus().talent;
    const talented = added > 0 && this.rand() < talentChance;
    let giftedLeft = talented ? 1 : 0;

    const ids: number[] = [];
    const make = (cls: ClassId, n: number): void => {
      for (let i = 0; i < n; i++) {
        const gifted = giftedLeft > 0 && i === 0;
        if (gifted) giftedLeft--;
        const s = this.joined(createStudent(this.rand, this.nextId++, cls, { gifted }));
        this.students[cls].push(s);
        ids.push(s.id);
      }
    };
    make("youji", youjiN);
    make("gakudo", gakudoN);
    this.monthEnrolled += added;
    this.monthTurnedAway += turnedAway;
    return { youji: youjiN, gakudo: gakudoN, talented, turnedAway, ids };
  }

  /** 今月の伸びを記録する（練習1回ぶんの差分を足し込む）。 */
  private noteGain(s: Student, delta: Record<StatKey, number>): void {
    let cur = this.monthGain.get(s.id);
    if (!cur) {
      cur = { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 };
      this.monthGain.set(s.id, cur);
    }
    for (const k of STAT_KEYS) cur[k] += delta[k] ?? 0;
  }

  /** その選手の今月の伸び（能力別）。まだ練習していなければ全て0。 */
  monthGainOf(s: Student): Record<StatKey, number> {
    return this.monthGain.get(s.id) ?? { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 };
  }

  /** 今月の伸びの合計（5能力の和）。 */
  monthGainTotalOf(s: Student): number {
    const g = this.monthGainOf(s);
    return STAT_KEYS.reduce((n, k) => n + g[k], 0);
  }

  /** 今月いちばん伸びた選手（月次レポートの「効果があった」表示に使う）。 */
  topGrowers(n = 3): { student: Student; total: number }[] {
    const out: { student: Student; total: number }[] = [];
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        const total = this.monthGainTotalOf(s);
        if (total > 0.01) out.push({ student: s, total });
      }
    }
    out.sort((a, b) => b.total - a.total);
    return out.slice(0, n);
  }

  /** IDから在籍者を探す（通知から詳細を開くときに使う）。 */
  findStudent(id: number): Student | undefined {
    for (const c of CLASS_ORDER) {
      const s = this.students[c.id].find((x) => x.id === id);
      if (s) return s;
    }
    return undefined;
  }

  /**
   * 情熱を足す。実際に増えたぶんを返す（満タンなら 0）。
   * **増えた量を返す**のは、演出（🔥+N）を「本当に増えたときだけ」出すため。
   */
  addPassion(n: number): number {
    if (!(n > 0)) return 0;
    const before = this.passion;
    this.passion = Math.min(PASSION.max, before + n);
    return this.passion - before;
  }

  /** 情熱を使う。足りなければ何もせず false。 */
  spendPassion(n: number): boolean {
    if (this.passion < n) return false;
    this.passion = Math.max(0, this.passion - n);
    return true;
  }

  /** 表示用の情熱（切り捨て）。 */
  passionShown(): number {
    return Math.floor(this.passion);
  }

  /** 人気度を上げる（上限は無い。0 より下にはならない）。大会・イベントの成果はそのまま入る。 */
  addPopularity(n: number): number {
    const before = this.popularity;
    this.popularity = Math.max(0, this.popularity + n);
    return this.popularity - before;
  }

  /**
   * 「放っておいても増える人気度」を足す（設備の充実・一般客の口コミ）。
   * 人気が高いほど伸びにくくなる＝有名になるほど、さらに有名になるのは難しい。
   * これが無いと部屋を建てるだけで集客が一気に膨らむ。上限は無いので、ゆっくりでも伸び続ける。
   */
  addPassivePopularity(n: number): number {
    if (n <= 0) return this.addPopularity(n);
    return this.addPopularity(n * passivePopularityFactor(this.popularity));
  }

  /**
   * 一般客の来場に掛かる倍率。
   * 入会の集客倍率（enrollMultiplier）よりゆるやかにしてある。
   * 同じ倍率を使うと、人気度が上がったときに月謝と利用料の両方が同じだけ伸びて、
   * 終盤に一般客の売上が月謝を追い越してしまうため。
   */
  guestDemandMultiplier(): number {
    // 上限なし。人気が出るほど一般客が増え、利用料が入る（入れる人数は部屋の定員で止まる）
    return guestDemandOf(this.popularity);
  }

  /**
   * 集客倍率。人気度が高いほど、通常入会もイベント集客も増える。
   * さらにクラブの格が上がるほど上乗せされる（名門ほど人が集まる）。
   *
   * **イベントの集客はこれを掛けない**（→ eventEnrollBonus）。
   * 倍率で効かせると、人気度が低いうちは何をしても増えず、
   * 高くなると1回で定員が埋まる、という極端な曲線になるため。
   * ここは飛び込みの入会（自然入会）の間隔にだけ使う。
   */
  enrollMultiplier(): number {
    return (1 + enrollPopularity(this.popularity) / POPULARITY.enrollPerFactor) * clubEnrollBonus(this.clubTier());
  }

  /**
   * イベントで**上乗せされる人数**（人気度ぶん）。
   *
   * 【足し算にしてある理由】ユーザー指定の手ざわりは
   *   人気度 10 で「1人多く入ったかな」／人気度 100 で「はっきり分かる」。
   * 倍率だと基礎人数に比例してしまい、基礎の小さい毎月のキャンペーンでは
   * 人気度1000でも数人しか変わらない（＝人気度を上げた甲斐が無い）。
   * 足し算なら、どのイベントでも「人気度 ÷ 10 人ぶん」がそのまま乗る。
   */
  eventEnrollBonus(): number {
    return enrollPopularity(this.popularity) / ENROLL.popularityPerHead;
  }

  /** 設備が毎月生む人気度（設備の充実 → 人気度 → 入会増加の循環）。 */
  facilityPopularity(): number {
    // 使えている部屋だけが人気度に効く（建てただけで道が無い部屋は評価されない）
    return monthlyPopularityOf(this.usableEquipment());
  }

  // -------------------------------------------------------------- 月1回の開催管理

  /** そのイベント／キャンペーンを今月まだ開催していないか。 */
  alreadyHeld(id: HoldableId): boolean {
    return this.heldThisMonth.includes(id);
  }

  private markHeld(id: HoldableId): void {
    if (!this.heldThisMonth.includes(id)) this.heldThisMonth.push(id);
  }

  // 体験会は廃止（無料で毎月ひらけて集客の主役になっていたため）。
  // 集客はキャンペーンと短期教室に一本化した。HoldableId の "trial" は
  // 古いセーブの heldThisMonth に残っていても害がないので型としては残してある。

  canHoldShortCourse(): boolean {
    return (SHORTCOURSE.months as readonly number[]).includes(this.month) && !this.alreadyHeld("shortCourse");
  }

  /** 短期教室（8/12/3月）：費用を払い、人気度に応じてスクール生を多く集める。 */
  holdShortCourse(): ShortCourseResult {
    if (this.alreadyHeld("shortCourse")) return { ok: false, reason: "短期教室は今月もう開催した" };
    if (!(SHORTCOURSE.months as readonly number[]).includes(this.month)) {
      return { ok: false, reason: `短期教室は ${SHORTCOURSE.months.join("・")}月 のみ開催できる` };
    }
    if (this.gems < SHORTCOURSE.cost) return { ok: false, reason: "ジェムが足りない" };
    this.gems -= SHORTCOURSE.cost;
    const popularityGain = this.addPopularity(SHORTCOURSE.popularityGain);
    // 基礎人数 ＋ 人気度ぶん（→ eventEnrollBonus）＋ ばらつき
    const total =
      SHORTCOURSE.base + this.eventEnrollBonus() + Math.floor(this.rand() * (SHORTCOURSE.jitter + 1));
    const r = this.enrollSchool(total, SHORTCOURSE.youjiRatio);
    this.markHeld("shortCourse");
    return {
      ok: true,
      cost: SHORTCOURSE.cost,
      popularityGain,
      newYouji: r.youji,
      newGakudo: r.gakudo,
      talented: r.talented,
      turnedAway: r.turnedAway,
      newIds: r.ids,
    };
  }

  // -------------------------------------------------------------- 自動発生イベント

  /**
   * 時間の経過ぶんだけ自動イベントを進める（シーンから毎フレーム呼ぶ）。
   * 入会は1人ずつ通知として流れ、賑やかしイベントが合間に挟まる。
   * 返ったイベントは通知として出すだけで、状態変化はこの中で済んでいる。
   */
  pollAutoEvents(minutes: number): AutoEvent[] {
    if (minutes <= 0) return [];
    const out: AutoEvent[] = [];
    const members = this.totalMembers();

    // --- 入会（人気度が高いほど、序盤ほど頻繁）
    this.enrollTimer -= minutes;
    if (this.enrollTimer <= 0) {
      this.enrollTimer = nextEnrollInterval(
        this.enrollMultiplier(),
        members,
        this.rand,
        this.intakePressure(),
      );
      const ev = this.autoEnroll();
      if (ev) out.push(ev);
    }

    // --- 賑やかし（コンディション/コーチの一言/小さな出来事）
    this.flavorTimer -= minutes;
    if (this.flavorTimer <= 0) {
      this.flavorTimer = nextFlavorInterval(members, this.rand);
      const ev = this.autoFlavor();
      if (ev) out.push(ev);
    }
    return out;
  }

  /** 自動入会を1人。枠が無ければ（たまに）断りの通知を返す。 */
  private autoEnroll(): AutoEvent | null {
    const youjiRoom = this.roomIn("youji");
    // 学童の空きは、卒園して待っている子が先（新しく入る子に取られないように）
    const gakudoRoom = Math.max(0, this.roomIn("gakudo") - this.gakudoWaiting().length);
    if (youjiRoom + gakudoRoom <= 0) {
      this.monthTurnedAway += 1;
      if (this.rand() >= AUTOEVENT.fullPoolNoticeChance) return null;
      // ここに来るのは「幼児も学童も定員いっぱい」のときだけ。
      // 打つ手は時間割のコマを足すか、プールを増やすかの2つ。
      return {
        kind: "news",
        icon: "⚠",
        title: fullPoolTitle(),
        detail: FULL_POOL_DETAIL,
        color: "#e67e22",
      };
    }
    // 空きのあるほうへ（両方空いていれば幼児寄り）
    const toYouji = youjiRoom > 0 && (gakudoRoom <= 0 || this.rand() < 0.6);
    const cls: ClassId = toYouji ? "youji" : "gakudo";
    const gifted =
      this.rand() <
      (SHORTCOURSE.talentBaseChance + talentPopularity(this.popularity) / POPULARITY.talentDivisor) * this.researchBonus().talent;
    const s = createStudent(this.rand, this.nextId++, cls, { gifted });
    this.students[cls].push(this.joined(s));
    this.monthEnrolled += 1;

    return {
      kind: "enroll",
      icon: "🎒",
      title: enrollTitle(s.name),
      detail: enrollDetail(this.rand),
      studentId: s.id,
      color: AUTO_EVENT_COLOR.enroll,
    };
  }

  /** コンディション変化／コーチの一言／小さな出来事のどれかを返す。 */
  private autoFlavor(): AutoEvent | null {
    const roll = this.rand();
    const ikusei = CLASS_ORDER.filter((c) => c.kind === "ikusei").flatMap((c) => this.students[c.id]);

    // コンディション変化（育成以上の選手が対象）
    if (roll < 0.4 && ikusei.length > 0) {
      const s = ikusei[Math.floor(this.rand() * ikusei.length)];
      const up = this.rand() < 0.55;
      const swing = AUTOEVENT.conditionSwing * (0.6 + this.rand() * 0.8);
      s.condition = clampCondition(s.condition + (up ? swing : -swing));
      return {
        kind: "condition",
        icon: up ? "↑" : "↓",
        title: conditionTitle(s.name, up, this.rand),
        detail: `いまのコンディション：${CONDITION_LABEL[conditionLevel(s.condition)]}`,
        studentId: s.id,
        color: up ? "#2ecc71" : "#e67e22",
      };
    }

    // コーチの一言
    if (roll < 0.7 && this.coaches.length > 0) {
      const c = this.coaches[Math.floor(this.rand() * this.coaches.length)];
      return { kind: "coach", icon: "💬", title: coachTitle(c.name, this.rand), color: AUTO_EVENT_COLOR.coach };
    }

    // 小さな出来事
    const news = newsLine(this.rand);
    const gain = news.popularity > 0 ? this.addPopularity(news.popularity) : 0;
    return {
      kind: "news",
      icon: "📰",
      title: news.text,
      detail: gain > 0 ? `人気度 +${gain}` : undefined,
      color: AUTO_EVENT_COLOR.news,
    };
  }

  // -------------------------------------------------------------- キャンペーン（集客）

  /** そのキャンペーンを今ひらけるか（月・費用・月1回）。 */
  campaignStatus(id: CampaignId): HoldStatus {
    const def = campaignDef(id);
    if (!campaignInSeason(def, this.month)) {
      return { ok: false, reason: `${def.months?.join("・")}月 のみ開催できる` };
    }
    if (this.alreadyHeld(id)) return { ok: false, reason: "今月はもう開催した" };
    // 通常キャンペーン（入会金無料・友達紹介）は月に1つだけ。どちらを打つかを選ばせる。
    if (!def.special && this.commonCampaignsHeld() >= CAMPAIGN.commonPerMonth) {
      return { ok: false, reason: "今月のキャンペーンはもう打った（月に1つまで）" };
    }
    if (this.gems < def.cost) return { ok: false, reason: `ジェムが足りない（◆${def.cost}）` };
    return { ok: true };
  }

  /** 今月すでに打った通常キャンペーンの数。 */
  private commonCampaignsHeld(): number {
    return CAMPAIGNS.filter((d) => !d.special && this.alreadyHeld(d.id)).length;
  }

  /**
   * 同じキャンペーンをくり返したことによる効果の落ち（1.0＝新鮮）。
   * 続けて同じ手を打つほど効かなくなる＝打ち方を考えさせる。
   */
  campaignFreshness(id: CampaignId): number {
    const n = this.campaignRepeats[id] ?? 0;
    return Math.max(CAMPAIGN.repeatMin, Math.pow(CAMPAIGN.repeatFalloff, n));
  }

  /** そのキャンペーンで集まる見込み人数（一覧に出す目安）。 */
  /**
   * そのキャンペーンで集まる見込み人数。
   *
   *   （基礎人数 × 季節の倍率 ＋ 人気度ぶん）× 飽き
   *
   * 人気度は**足し算**で乗る（→ eventEnrollBonus）。
   * 毎月打てるキャンペーンは、そのうえで maxPerMonthlyEvent で頭を押さえる
   *（毎月30人入るとプールを増やす前に定員が埋まってしまう）。
   */
  campaignExpected(def: CampaignDef): number {
    const raw = (def.base * def.mult + this.eventEnrollBonus()) * this.campaignFreshness(def.id);
    // 開催月が決まっていない＝毎月打てるもの（→ CampaignDef.months）
    const cap = def.months == null ? ENROLL.maxPerMonthlyEvent : ENROLL.maxPerEvent;
    return Math.round(Math.min(cap, raw));
  }

  /** キャンペーンを開催する。人気度が上がり、スクール生が集まる。 */
  runCampaign(id: CampaignId): CampaignResult {
    const def = campaignDef(id);
    const st = this.campaignStatus(id);
    if (!st.ok) return { ok: false, reason: st.reason, label: def.label };

    this.gems -= def.cost;
    const fresh = this.campaignFreshness(id);
    const popularityGain = this.addPopularity(def.popularity * fresh);
    // 人気度が上がってから集客する（キャンプ→集客の循環がその場でも効く）
    const total = this.campaignExpected(def) * (0.85 + this.rand() * 0.3);
    const r = this.enrollSchool(total, def.youjiRatio);
    this.markHeld(id);
    // 打った回数を数える（同じ手を続けると効果が落ちる）
    this.campaignRepeats[id] = (this.campaignRepeats[id] ?? 0) + 1;

    return {
      ok: true,
      label: def.label,
      cost: def.cost,
      popularityGain,
      newYouji: r.youji,
      newGakudo: r.gakudo,
      turnedAway: r.turnedAway,
      talented: r.talented,
      newIds: r.ids,
    };
  }

  // -------------------------------------------------------------- 合宿

  /** 合宿を今月まだひらけるか（イベントは月1回まで・出かけている間は次を組めない）。 */
  canHoldCamp(): HoldStatus {
    if (this.activeCamp) return { ok: false, reason: `合宿中（あと${this.activeCamp.weeksLeft}週）` };
    return this.alreadyHeld("camp") ? { ok: false, reason: "合宿は今月もう実施した" } : { ok: true };
  }

  /** その選手がいま合宿に出かけているか（練習・大会・特別練習に出ない）。 */
  isAtCamp(s: Student): boolean {
    return this.activeCamp?.ids.includes(s.id) ?? false;
  }

  /** 合宿に出かけている選手（名簿・合宿中の表示に使う）。 */
  campers(): Student[] {
    if (!this.activeCamp) return [];
    return this.activeCamp.ids.map((id) => this.findStudent(id)).filter((s): s is Student => s != null);
  }

  /** 帰ってきた合宿の成果を受け取る（1回だけ。無ければ null）。 */
  takeFinishedCamp(): FinishedCamp | null {
    const f = this.finishedCamp;
    this.finishedCamp = null;
    return f;
  }

  /** この選手が今月合宿できるか。 */
  campEligible(s: Student, month = this.month): CampEligibility {
    if (isSchoolClass(s.classId)) return { ok: false, reason: "スクール生は合宿に参加できない", proOffseason: false };
    // 同じ週に泳ぐ大会へエントリーしていると、合宿に出たらその大会に出られなくなる
    if (this.pendingRaces.some((r) => r.studentIds.includes(s.id))) {
      return { ok: false, reason: "大会にエントリー済み", proOffseason: false };
    }
    // 18歳以上のプロは通年。高校生のプロは選手と同じく合宿の月だけ（→ CLASS_MIN_GRADE）
    if (s.classId === "pro" && estimatedAge(s.grade) >= CAMP.proMinAge) return { ok: true, proOffseason: true };
    // 育成B / 育成A / 選手
    if ((CAMP.months as readonly number[]).includes(month)) return { ok: true, proOffseason: false };
    return { ok: false, reason: `合宿は ${CAMP.months.join("・")}月 のみ`, proOffseason: false };
  }

  /**
   * そのタイプの合宿を選べるか。
   * 海外はクラブの格と資金の余裕（費用とは別枠の minGems）の両方が要る。
   */
  campTypeStatus(id: CampId): CampTypeStatus {
    const def = campDef(id);
    if (this.clubTier() < def.minClubTier) {
      return { ok: false, reason: `クラブの格が足りない（${clubRankLabel(def.minClubTier)}以上）` };
    }
    if (this.gems < def.minGems) {
      return { ok: false, reason: `資金の余裕が足りない（◆${def.minGems}以上）` };
    }
    return { ok: true };
  }

  /** 1人あたりの費用。 */
  campCostPerHead(id: CampId): number {
    return campDef(id).costPerHead;
  }

  /** 合宿の費用（人数 × 1人あたり単価）。 */
  campCostFor(count: number, id: CampId = "sea"): number {
    return Math.max(0, count) * this.campCostPerHead(id);
  }

  // ---- 暦（高地の下山タイミング計算に使う） ----

  /** 月内の経過日数（暦日）。1ゲーム日＝7暦日、4ゲーム日＝1ヶ月。 */
  private dayOfMonth(): number {
    return (this.dayCount % DAYS_PER_MONTH_STEPS) * CALENDAR_DAYS_PER_STEP;
  }

  /** 通算の暦日（高地の下山日を記録するのに使う）。 */
  get calendarDay(): number {
    return this.dayCount * CALENDAR_DAYS_PER_STEP;
  }

  /**
   * その選手にとって次にある主要大会（記録会は毎月あるので除く）と、そこまでの暦日数。
   * 12ヶ月先まで見て見つからなければ comp=null。
   */
  nextMajorMeet(students: readonly Student[]): { comp: Competition | null; daysUntil: number } {
    const targets = students.length > 0 ? students : this.competitionAthletes();
    for (let ahead = 0; ahead <= 12; ahead++) {
      // 大会日はその月の半ば。今月ぶんが過ぎていれば、その月は候補にしない。
      const daysUntil = ahead * CALENDAR_DAYS_PER_MONTH + (MEET_DAY_OF_MONTH - this.dayOfMonth());
      if (daysUntil < 0) continue;
      const month = ((this.month - 1 + ahead) % 12) + 1;
      const year = this.year + Math.floor((this.month - 1 + ahead) / 12);
      for (const s of targets) {
        const comps = eligibleCompetitions(s, month, year).filter((c) => c.scale !== "kirokukai");
        if (comps.length > 0) return { comp: comps[0], daysUntil };
      }
    }
    return { comp: null, daysUntil: 0 };
  }

  /**
   * 合宿設定画面に出す判断材料。
   * 「次の大会まで何日か」と「今この日程で行くと下山何日後が大会か＝どの効果帯か」。
   * 答えは教えず、材料だけ示す。
   */
  meetTiming(students: readonly Student[], stayDays: number): MeetTiming {
    const { comp, daysUntil } = this.nextMajorMeet(students);
    const descentToMeet = daysUntil - stayDays;
    return { comp, daysUntil, descentToMeet, band: altitudeBand(descentToMeet) };
  }

  // ---- 実施 ----

  /**
   * 参加者に合宿を実施する。
   * 費用は必ず「1人あたり × 人数」。合宿は月1回まで。
   */
  runCamp(students: Student[], plan: CampPlan): CampRunResult {
    const hold = this.canHoldCamp();
    if (!hold.ok) return { ok: false, reason: hold.reason, cost: 0, weeks: 0 };
    const status = this.campTypeStatus(plan.id);
    if (!status.ok) return { ok: false, reason: status.reason, cost: 0, weeks: 0 };

    const cost = this.campCostFor(students.length, plan.id);
    if (this.gems < cost) return { ok: false, reason: "ジェムが足りない", cost, weeks: 0 };

    this.gems -= cost;
    this.markHeld("camp");
    // 伸びは帰ってきたときに付く（→ finishCamp）。それまで参加者はクラブを空ける
    const weeks = campWeeks(plan);
    this.activeCamp = { plan: { ...plan }, ids: students.map((s) => s.id), weeks, weeksLeft: weeks };
    return { ok: true, cost, weeks };
  }

  /** 週が明けるたびに呼ぶ。最後の週が明けたら帰ってきて、伸びを付ける。 */
  private tickCamp(): void {
    if (!this.activeCamp) return;
    this.activeCamp.weeksLeft -= 1;
    if (this.activeCamp.weeksLeft <= 0) this.finishCamp();
  }

  /**
   * 合宿から帰ってきた。参加者に伸びを付けて、成果を画面へ渡す。
   * 下山（＝帰ってきた日）から次の大会までの日数が、高地の効果帯を決める。
   */
  private finishCamp(): void {
    const camp = this.activeCamp;
    if (!camp) return;
    this.activeCamp = null;
    const def = campDef(camp.plan.id);
    const students = camp.ids.map((id) => this.findStudent(id)).filter((s): s is Student => s != null);
    const { daysUntil } = this.nextMajorMeet(students);

    const outcomes = students.map((s) =>
      this.applyCampTo(
        s,
        def,
        camp.plan,
        this.calendarDay,
        daysUntil,
        s.classId === "pro" && estimatedAge(s.grade) >= CAMP.proMinAge,
      ),
    );
    // 誰にどれだけ効いたかを1人ぶんずつ残す（次に連れていく子を選ぶ材料）
    for (const o of outcomes) {
      let best: StatKey = STAT_KEYS[0];
      let gain = 0;
      for (const k of STAT_KEYS) {
        gain += o.gains[k];
        if (o.gains[k] > o.gains[best]) best = k;
      }
      this.campLog[o.student.id] = {
        year: this.year,
        month: this.month,
        label: def.label,
        gain,
        bestStat: best,
        injured: o.injured,
      };
    }
    this.finishedCamp = { label: def.label, weeks: camp.weeks, outcomes };
  }

  /**
   * 1人ぶんの合宿の成果を付ける（帰ってきたときに呼ぶ）。
   * descentDay は下山＝帰ってきた日、daysUntilMeet はそこから次の大会までの暦日数。
   */
  private applyCampTo(
    s: Student,
    def: CampDef,
    plan: CampPlan,
    descentDay: number,
    daysUntilMeet: number,
    proOffseason: boolean,
  ): CampOutcome {
    const before = { ...s.stats };
    const stay = stayOption(plan.stayDays);
    const intensity = intensityOption(plan.intensity);

    // 高地トレーニング棟（大型施設）があると、合宿の成果そのものが上がる
    let mult =
      (CAMP.baseMult + this.rand() * CAMP.randSpread) *
      def.mult *
      (1 + EQUIPMENT.altitudeCampPer * this.usableCount("altitudeLab"));
    const level = conditionLevel(s.condition);
    const good = level === "good" || level === "peak";
    const risky = isRiskyCondition(level);
    if (good) mult *= CAMP.goodConditionBonus;
    if (risky) mult *= CAMP.poorConditionPenalty;

    // タイプごとの向き不向き
    const stage = lifeStageOf(s.grade);
    if (stage === "elementary" || stage === "middle") mult *= def.juniorBoost;
    mult *= isSprinter(s) ? def.sprintBoost : def.longBoost;

    // 高地：滞在期間・強度・順応判定
    let altitudeFailed = false;
    let adaptation = 0;
    if (def.isAltitude) {
      mult *= stay.gainMult * intensity.gainMult;
      adaptation = altitudeAdaptation(stay, intensity);
      altitudeFailed = this.rand() < altitudeFailChance(s.condition, intensity);
      if (altitudeFailed) {
        adaptation = ALTITUDE.failedAdaptation;
        mult *= 0.6; // 順応に失敗すると練習も身にならない
      }
    }

    // 合宿中のランダムイベント
    const event = rollCampEvent(def, this.rand);
    if (event?.gainMult) mult *= event.gainMult;

    // --- 能力の伸び ---
    const phase = growthPhaseMultiplier(s.growthType, lifeStageOf(s.grade));
    const plannedAbility = this.planFor(s).ability; // 実際に行っているメニューも少し効く
    const gains = { speed: 0, stamina: 0, form: 0, start: 0, turn: 0 } as Record<StatKey, number>;
    for (const k of TRAINABLE_KEYS) {
      // 【合宿だけが上限まで届く】練習は statCapOf − practiceMargin で止まるが、
      // 合宿はその先、才能の上限そのものまで積める（→ student.practiceCapOf）。
      // 以前はここが 100 固定で、才能E の能力でも合宿だけで 100 まで行けてしまっていた。
      const capK = statCapOf(s, k);
      // 上限の近くでも合宿は効く（→ CAMP.dimFloor）。ただし上限そのものは超えない。
      const room = Math.max(0, 1 - s.stats[k] / capK);
      const dim = room <= 0 ? 0 : Math.max(CAMP.dimFloor, Math.pow(room, TRAINING.dimExponent));
      let w = campWeight(def, k);
      if (k === plannedAbility) w *= CAMP.weightPlanAbility / CAMP.weightOther;
      // 高地が噛み合ったときは持久力・心肺が大きく伸びる
      if (def.isAltitude && !altitudeFailed && (k === "stamina" || k === "turn")) {
        w *= 1 + ALTITUDE.adaptedStaminaBonus * adaptation;
      }
      const g = CAMP.baseGain * mult * s.talent[k] * dim * phase * w * this.staffCache.growthMult;
      const before = s.stats[k];
      // 成長期の上限に届いている子は、合宿でもこの年代のうちは伸びない（→ atAgeCeiling）
      s.stats[k] = clamp(s.stats[k] + (atAgeCeiling(s) ? 0 : g), 0, capK);
      gains[k] = s.stats[k] - before;
      s.trainCount[k] += 1;
    }
    const strokeGain = applyStrokeTraining(s, this.planFor(s).stroke, {
      gainBase: def.strokeGain * mult * 0.5,
    }).prof;

    // --- 故障 ---
    let injured = false;
    const injuryChance =
      CAMP.injuryChance *
      def.injuryChanceMult *
      (def.isAltitude ? intensity.injuryMult : 1) *
      this.staffCache.injuryChanceMult;
    const injuryRoll = (risky ? injuryChance : injuryChance * 0.25) + (altitudeFailed ? ALTITUDE.failedInjuryChance : 0);
    if (this.rand() < injuryRoll) {
      injured = true;
      const loss = CAMP.injuryFormLoss * (0.6 + this.rand() * 0.8);
      const before = s.stats.form;
      s.stats.form = clamp(s.stats.form - loss, 0, 100);
      gains.form += s.stats.form - before;
      s.injuryDays = Math.max(s.injuryDays, Math.round(CAMP.injuryDays / this.staffCache.injuryHealMult));
      applyMood(s, "injured");
    }

    // --- コンディション（メンタル） ---
    let conditionDelta = -def.conditionCost;
    if (def.isAltitude) conditionDelta = -def.conditionCost * stay.conditionMult * intensity.conditionMult;
    if (proOffseason && conditionDelta < 0) conditionDelta *= CAMP.proOffseasonCostMult;
    conditionDelta += def.moraleGain;
    s.condition = clampCondition(s.condition + conditionDelta);

    // --- ケガの回復（温泉リハビリ・ハワイ） ---
    if (def.injuryHealMult > 1 && s.injuryDays > 0) {
      s.injuryDays = Math.max(0, Math.round(s.injuryDays - INJURY.healPerDay * def.injuryHealMult * 2));
    }

    s.growthObserved = Math.min(100, s.growthObserved + CAMP.observeGain + def.observeBonus);

    // --- 高地の後遺（下山タイミングと、スプリント感覚の鈍り） ---
    let shift = 0;
    if (event?.altitudeShift) shift = event.altitudeShift;
    if (def.isAltitude) {
      s.altitude = {
        descentDay: descentDay + shift,
        adaptation,
        failed: altitudeFailed,
        sprintDull: isSprinter(s) ? ALTITUDE.sprintDullBase : 0,
        stayDays: stay.days,
      } satisfies AltitudeState;
    }

    // --- イベントの効果 ---
    if (event) this.applyCampEvent(s, event);

    // 滞在はもう済んでいる（帰ってきたときに呼ぶ）ので、大会までの日数から滞在日数は引かない
    const descentToMeet = def.isAltitude ? daysUntilMeet - shift : null;
    return {
      student: s,
      before,
      mult,
      injured,
      gains,
      strokeGain,
      conditionAfter: s.condition,
      proOffseason,
      event,
      altitudeFailed,
      descentToMeet,
      bandLabel: descentToMeet === null ? null : (altitudeBand(descentToMeet)?.label ?? "効果なし"),
    };
  }

  /**
   * 合宿イベントの効果を反映する。
   * 能力上昇そのものは倍率（gainMult）として先に乗っているので、ここでは扱わない。
   */
  private applyCampEvent(s: Student, event: CampEvent): void {
    if (event.morale) s.condition = clampCondition(s.condition + event.morale);
    if (event.moraleSwing) {
      // 「仲間との切磋琢磨／ライバルへの闘志」：良くも悪くも大きく揺れる
      const dir = this.rand() < 0.62 ? 1 : -1;
      s.condition = clampCondition(s.condition + dir * event.moraleSwing * (0.6 + this.rand() * 0.4));
    }
    if (event.gems) this.gems += event.gems;
    if (event.popularity) this.addPopularity(event.popularity);
    if (event.scoutBoost) this.scoutBoost += event.scoutBoost;
    if (event.restWeeks) orderRest(s, this.dayCount, event.restWeeks);
    if (event.injuryDays) {
      s.injuryDays = Math.max(s.injuryDays, Math.round(event.injuryDays / this.staffCache.injuryHealMult));
      applyMood(s, "injured");
    }
    if (event.bestBoost) {
      // 練習中の記録会で自己ベスト更新扱い（格の材料になる）
      recordTime(s, s.fav, raceTimeFor(s, s.fav, this.rand, 0.985));
      this.noteRankUp(s);
    }
    if (event.growthUpgrade) upgradeGrowthType(s, this.rand);
    if (event.newStrokeProf) {
      // 得意でない泳法が急に泳げるようになる（二刀流）。熟練度をそこまで引き上げる
      const others = CORE_STROKES.filter((k) => k !== s.fav.stroke);
      const pick = others[Math.floor(this.rand() * others.length)];
      const cap = strokeCapOf(s, pick);
      s.strokeProf[pick] = clamp(Math.max(s.strokeProf[pick] ?? 0, event.newStrokeProf), 0, cap);
    }
  }

  // ---- ケガ・高地の日次処理 ----

  /**
   * 1ゲーム日ぶん、ケガを回復させる。ドクターがいるほど早い。
   * クリニックでリハビリ中の選手はさらに早く治り、コンディションも戻る。
   * 治りきったらリハビリは自動で終わる（枠が空く）。
   */
  private healInjuries(): void {
    // 医科学センター（大型施設）があると、ケガの治りが速くなる
    const science = 1 + EQUIPMENT.scienceHealPer * this.usableCount("science");
    const base = INJURY.healPerDay * this.staffCache.injuryHealMult * science;
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        // 遠征は1日ずつ明けていく（帰ってくれば練習に戻る）
        if (s.awayDays > 0) s.awayDays = Math.max(0, s.awayDays - 1);
        if (s.injuryDays <= 0) {
          s.inRehab = false;
          continue;
        }
        const heal = s.inRehab ? base * INJURY.rehab.speedUp : base;
        s.injuryDays = Math.max(0, s.injuryDays - heal);
        if (s.inRehab) s.condition = clampCondition(s.condition + INJURY.rehab.conditionPerDay);
        if (s.injuryDays <= 0) s.inRehab = false; // 治ったら枠を返す
      }
    }
  }

  // -------------------------------------------------------------- リハビリ（クリニック）

  /** クリニックで同時にリハビリできる人数（部屋数 × 1部屋の枠）。 */
  rehabCapacity(): number {
    return this.usableCount("clinic") * INJURY.rehab.perRoom;
  }

  /** いまリハビリ中の人数。 */
  rehabUsed(): number {
    let n = 0;
    for (const c of CLASS_ORDER) for (const s of this.students[c.id]) if (s.inRehab) n++;
    return n;
  }

  /** 受診できるか（理由つき）。 */
  canRehab(s: Student): { ok: boolean; reason?: string } {
    if (this.rehabCapacity() <= 0) return { ok: false, reason: "クリニックがない（設備で建てよう）" };
    if (s.injuryDays <= 0) return { ok: false, reason: "ケガをしていない" };
    if (s.inRehab) return { ok: false, reason: "すでにリハビリ中" };
    if (this.rehabUsed() >= this.rehabCapacity()) {
      return { ok: false, reason: `クリニックがいっぱい（${this.rehabUsed()}/${this.rehabCapacity()}人）` };
    }
    return { ok: true };
  }

  /** 受診させる＝リハビリに入る（治りが速くなるかわりに練習には出ない）。 */
  startRehab(s: Student): { ok: boolean; reason?: string } {
    const r = this.canRehab(s);
    if (!r.ok) return r;
    s.inRehab = true;
    return { ok: true };
  }

  /** リハビリをやめる（早く練習に戻したいとき）。 */
  stopRehab(s: Student): void {
    s.inRehab = false;
  }

  /** 効果が切れた高地状態を捨てる。 */
  private expireAltitude(): void {
    const today = this.calendarDay;
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        if (s.altitude && altitudeExpired(s.altitude, today)) s.altitude = null;
      }
    }
  }

  /**
   * 大会のタイムに乗る、コンディション以外の倍率。
   * 高地の効果帯（下山からの日数）と、ケガの影響をまとめる。1.0未満で速い。
   */
  raceExtraFactor(s: Student, ev: RaceEvent): number {
    let f = 1;
    if (s.altitude) f *= altitudeTimeFactor(s.altitude, this.calendarDay, ev.distance);
    if (s.injuryDays > 0) f *= INJURY.timeFactor;
    f *= this.bigFacilityRaceFactor(s, ev);
    return f;
  }

  /**
   * 【大型施設の大会での効果】（→ BIG_FACILITY.race）
   * 大型プール＝全種目、低酸素トレーニングルーム＝100m以上でタイムが縮む。育成B以上だけ。
   */
  bigFacilityRaceFactor(s: Student, ev: RaceEvent): number {
    if (isSchoolClass(s.classId)) return 1;
    let f = 1;
    if (this.usableCount("pool10") > 0) f *= BIG_FACILITY.race.pool10;
    if (this.usableCount("altitudeLab") > 0) {
      if (ev.distance >= 200) f *= BIG_FACILITY.race.altitudeLong;
      else if (ev.distance >= 100) f *= BIG_FACILITY.race.altitudeMid;
    }
    return f;
  }

  /** その選手の今の高地効果の説明（一覧・カードに出す）。効果が無ければ null。 */
  altitudeStatusOf(s: Student): { days: number; label: string; note: string; good: boolean } | null {
    if (!s.altitude) return null;
    const days = this.calendarDay - s.altitude.descentDay;
    const band = altitudeBand(days);
    if (!band) return null;
    const good = band.timeFactor < 1 && !s.altitude.failed;
    return {
      days,
      label: `下山${weeksLabel(Math.max(0, days))}：${band.label}`,
      note: s.altitude.failed ? "高地順応に失敗している" : band.note,
      good,
    };
  }

  /**
   * 入団した選手をクラブに迎え入れる（記録の1件目を残す）。
   *
   * 【入団時の形を残す】成長の比較は「入団したときと比べてどれだけ大きくなったか」が要。
   * 年度の変わり目だけで記録すると、年の途中で入った子の出発点が残らない。
   */
  private joined(s: Student): Student {
    recordSnapshot(s, this.year);
    return s;
  }

  /**
   * 見た目確認用に生徒を1人増やす（開発ビルドの showcase だけが使う）。
   *
   * 大型施設は在籍数でも鍵が掛かっている（→ UNLOCK）ので、
   * 「全部建てた施設」を撮るには人数を先に満たしておく必要がある。
   * 入会の抽選や定員の判定を通さず、スクールに直接足すだけ。
   */
  addDevMember(): void {
    const classId: ClassId = this.students.youji.length <= this.students.gakudo.length ? "youji" : "gakudo";
    this.students[classId].push(this.joined(createStudent(this.rand, this.nextId++, classId)));
  }

  // -------------------------------------------------------------- カレンダー / 大会

  get dateLabel(): string {
    return `${this.year}年目 ${this.month}月`;
  }

  /**
   * 1ヶ月進める。年度更新で全選手が1学年上がり、年齢超過は進級/退会。
   * 体力回復 → 自然入会（人気度に比例） → 月謝収入 −（設備の維持費＋コーチの給料）。
   */
  advanceMonth(): MonthRollResult {
    let rolledYear = false;
    // 通算の月数を1つ進め、コーチの募集名簿を今月ぶん更新する
    // （古い応募が落ち、新しい応募が積まれる → COACHING.recruit）
    this.monthCount += 1;
    this.refillRecruitPool();
    /**
     * 【退会は月の頭】先月「来月で退会」と予告された子は、ここで名簿から外れる。
     * 年度更新（下）で予告を出すより**先に**やること。逆にすると、
     * 予告を出したその場で退会することになり、猶予が無くなる。
     */
    // 学童の空きを待っている卒園児は、退会の処理より先に入れる（→ placeWaitingGraduates）
    let ageEvents: string[] = this.placeWaitingGraduates();
    ageEvents = ageEvents.concat(this.removeLeavers());
    let leavingSoon: Student[] = [];
    let retiredNow: RetiredRecord[] = [];
    this.month += 1;
    if (this.month > 12) {
      this.month = 1;
      this.year += 1;
      rolledYear = true;
      for (const c of CLASS_ORDER) {
        for (const s of this.students[c.id]) s.grade = nextGrade(s.grade);
      }
      // 【1年ぶん歳を取る】衰え期に入っていれば、ここで能力が落ちる
      //（落ち方は能力ごとに違う。熟練度は落ちない → applyAging）
      for (const c of CLASS_ORDER) {
        for (const s of this.students[c.id]) applyAging(s);
      }
      // 引退する年齢に達した選手を送り出す（年齢はタイプごとに違う → AGE_CURVE）
      const before = this.retired.length;
      // 月の頭の退会・学童入りの知らせに**足す**（以前は上書きしていて、年明けの退会が知らされなかった）
      ageEvents = ageEvents.concat(this.retireByAge());
      retiredNow = this.retired.slice(0, this.retired.length - before);
      const limits = this.enforceAgeLimits();
      ageEvents = ageEvents.concat(limits.events);
      leavingSoon = limits.leavingSoon;
      // 【成長の歴史】年度の変わり目に、全員の能力を1件ずつ残す。
      // 進級したあとに撮るので、記録の学年は「その年度の学年」になる。
      for (const c of CLASS_ORDER) {
        for (const s of this.students[c.id]) recordSnapshot(s, this.year);
      }
    }
    this.heldThisMonth = [];
    this.roomUse = {}; // 部屋の利用回数は月ごとに数え直す
    this.specialUsed = [];
    // キャンペーンの「飽き」は月をまたぐと1つぶん戻る
    for (const k of Object.keys(this.campaignRepeats) as CampaignId[]) {
      const n = (this.campaignRepeats[k] ?? 0) - 1;
      if (n > 0) this.campaignRepeats[k] = n;
      else delete this.campaignRepeats[k];
    } // 月が替わったらイベント／キャンペーンをまた開ける
    for (const c of CLASS_ORDER) {
      for (const s of this.students[c.id]) {
        s.condition = recoverToward(s.condition, CONDITION.baseline, 0.6);
        s.energy = energyMax(s);
      }
    }

    // 設備・アイテムの充実ぶんだけ人気度が伸びる（→ 入会が増える循環）
    // ただし「建てたのに歩いて行けない部屋」はその効果を打ち消す。
    const stranded = this.strandedRooms().length;
    const facilityPopularity = this.addPassivePopularity(
      this.facilityPopularity() - stranded * ROUTE.strandedPopularityPenalty,
    );

    // 一般客の満足度（きちんと使ってもらえた月は人気が伸び、断り続けると落ちる）
    const guestMonth = { ...this.guestMonth };
    const guestPopularity = this.addPassivePopularity(guestPopularityDelta(guestMonth));

    /**
     * 【混雑の不満を人気度に返す】設備が足りず使えなかった人のぶん、評判が落ちる。
     *
     * 1人あたりは小さく、月の目減りには蓋をしてある（→ GUESTS.crowdPopularityPer / Max）。
     * **設備を増やせば止まる**ので、「人気が出た → 混む → 増やす」の輪が回る。
     * 目減りは passive の逓減を通さない（頑張って上げた人気度がそのまま削られる痛みを出す）。
     */
    const crowdTotal = this.crowdedTotal();
    const crowdWorst = this.worstCrowded();
    let crowdPopularity = 0;
    if (crowdTotal > 0) {
      const drop = Math.min(GUESTS.crowdPopularityMax, crowdTotal * GUESTS.crowdPopularityPer);
      crowdPopularity = -Math.round(drop * 10) / 10;
      this.popularity = Math.max(0, this.popularity - drop);
    }
    const crowd = {
      total: crowdTotal,
      worst: crowdWorst,
      byKind: this.crowdedBreakdown(),
      popularity: crowdPopularity,
      notify: crowdTotal >= GUESTS.crowdNoticeAt,
    };
    this.crowdMonth = {}; // 来月ぶんは0から数え直す
    this.crowdStudentMonth.clear();

    // 研究（会議室ごとに1件・4人1組。進めた班のコーチは指導力が伸びる）
    const researchGain = this.researchRate();
    const researchDone = this.advanceResearch();

    // 月例記録会（自動）：全員がタイムを計測する。ここで格が動く。
    const trialImproved = this.runMonthlyTimeTrial();
    const rankUps = this.takeRankUps();
    const clubRankUp = this.refreshClubRank();

    // 通常の入会は自動イベント（pollAutoEvents）として1人ずつ流れてくる。
    // ここでは1ヶ月ぶんの集計を取り出してレポートに載せ、カウンタを戻す。
    const enrolled = this.monthEnrolled;
    const turnedAway = this.monthTurnedAway;
    this.monthEnrolled = 0;
    this.monthTurnedAway = 0;

    // 今月いちばん伸びた選手（レポートに出してから集計を空にする）
    const growers = this.topGrowers(3).map((g) => ({ name: g.student.name, total: g.total }));

    // 月謝収入を得て、設備の維持費・寮費・コーチの月給を支払う（不足時は0止まり）。
    // 一般客の利用料は、来場のたびにすでに入っているので二重に足さない。
    const finance = this.monthlyFinance();
    // 月謝＋売店の売上を受け取る。
    // （一般客の利用料は来場のたびにすでに入っているので、ここでは足さない）
    // 売店を足し忘れると「収支レポートの net」と「実際のジェムの増減」が食い違う。
    this.gems += finance.tuition + finance.shop + finance.sponsor + finance.stands;
    const due = finance.upkeep + finance.salary + finance.dorm + finance.proSalary;
    const paid = Math.min(this.gems, due);
    this.gems = Math.max(0, this.gems - due);
    // 一般客の集計は月ごとにリセット
    this.guestMonth = emptyGuestMonthly();
    this.monthGain.clear(); // 「今月の伸び」も新しい月ぶんを取り直す

    return {
      month: this.month,
      year: this.year,
      rolledYear,
      ageEvents,
      leavingSoon,
      gakudoWaiting: this.gakudoWaiting(),
      retiredNow,
      income: finance.tuition,
      upkeep: finance.upkeep,
      salary: finance.salary,
      paid,
      unpaid: due - paid,
      net: finance.net,
      finance,
      newEntrants: enrolled,
      turnedAway,
      trialImproved,
      rankUps,
      facilityPopularity,
      clubRankUp,
      researchDone,
      researchGain,
      guests: guestMonth,
      guestPopularity,
      stranded,
      crowd,
      growers,
    };
  }

  /** その選手が今月出られる大会（記録会を含む）。 */
  competitionsFor(s: Student): Competition[] {
    return eligibleCompetitions(s, this.month, this.year);
  }

  /** 大会に出場できる選手（選手・プロのみ）。 */
  /**
   * その大会に出せる選手ぜんぶ。
   *
   * 地区大会（各ルートの入口）だけは**育成B以上**が出られるので、母集団が広い
   *（→ competitions.canEnterOf）。都道府県予選から上は選手・プロだけ。
   */
  athletesFor(comp: Competition): Student[] {
    const can = canEnterOf(comp);
    return CLASS_ORDER.filter((c) => can(c.id)).flatMap((c) => this.students[c.id]);
  }

  competitionAthletes(): Student[] {
    return [...this.students.senshu, ...this.students.pro];
  }

  /**
   * 記録会に出せる生徒（育成B以上）。
   *
   * 記録会はタイムを測りに行く場なので、選手クラスまで上げなくても連れていける。
   * 育成に上げた子をその月から記録会に出せる＝序盤から回せる目標になる。
   */
  timeTrialAthletes(): Student[] {
    return [
      ...this.students.ikuseiB,
      ...this.students.ikuseiA,
      ...this.students.senshu,
      ...this.students.pro,
    ];
  }

  /** その大会に出せる生徒（記録会と地区大会は育成B以上、ほかは選手・プロ）。 */
  athletesForComp(comp: Competition): Student[] {
    return this.athletesFor(comp);
  }

  /** 今月クラブとして出場できる大会（記録会は育成B以上、主要大会は選手/プロ）。 */
  competitionsForClub(): Competition[] {
    const map = new Map<string, Competition>();
    for (const s of this.timeTrialAthletes()) {
      for (const c of this.competitionsFor(s)) {
        // 出られるクラスは大会ごと（記録会と地区大会は育成B以上 → canEnterOf）
        if (!canEnterOf(c)(s.classId)) continue;
        map.set(c.id, c);
      }
    }
    return [...map.values()];
  }

  /**
   * 年間の主要大会（大会画面の「年間予定」）。
   * 勝ち上がりの先は、前の段階を優勝するまで一覧に出てこない。
   */
  seasonSchedule(): ScheduleRow[] {
    const open = new Set(this.competitionsForClub().map((c) => c.id));
    // 記録会は月ごとに id が変わる（kk_area_5 など）ので、段のキーで開催中を表す
    for (const c of this.competitionsForClub()) {
      const tier = kirokukaiTierOf(c.id);
      if (tier != null) open.add(KIROKUKAI_LADDER[tier].key);
    }
    return seasonSchedule(this.competitionAthletes(), this.timeTrialAthletes(), this.month, this.year, open);
  }

  /** その大会に出られる生徒（記録会は育成B以上、主要大会は選手・プロ）。 */
  eligibleAthletesFor(comp: Competition): Student[] {
    return this.athletesForComp(comp).filter((s) => this.competitionsFor(s).some((c) => c.id === comp.id));
  }

  /** 1レースに出せる人数の上限（残りのレーンは他クラブが埋める）。 */
  /** 1つの大会に申し込めるのべ人数（→ MAX_MEET_ENTRIES）。 */
  maxMeetEntries(): number {
    return MAX_MEET_ENTRIES;
  }

  maxRaceEntries(): number {
    return maxRaceEntries();
  }

  /** 参加料（1人あたり）。 */
  raceEntryFee(comp: Competition): number {
    return SCALE_ENTRY_FEE[comp.scale];
  }

  /** 遠征費（1人あたり）。遠くの大会ほど高い。 */
  raceTravelFee(comp: Competition): number {
    return SCALE_TRAVEL_FEE[comp.scale];
  }

  /** その大会に出ると何日クラブを空けるか（0＝日帰り）。 */
  raceAwayDays(comp: Competition): number {
    return awayDaysOf(comp);
  }

  /** その人数で出場するときの合計費用（参加料＋遠征費）。 */
  raceEntryCost(comp: Competition, count: number): number {
    return (this.raceEntryFee(comp) + this.raceTravelFee(comp)) * Math.max(0, count);
  }

  /** その人数ぶんの出場費を払えるか（理由つき）。 */
  canAffordEntry(comp: Competition, count: number): { ok: boolean; reason?: string } {
    const cost = this.raceEntryCost(comp, count);
    if (this.gems < cost) return { ok: false, reason: `出場費が足りない（◆${cost}）` };
    return { ok: true };
  }

  /**
   * その選手をこのレースに追加できるか（理由つき）。
   * 男女別レースなので、すでに選んでいる選手と性別が違うと選べない。
   */
  /**
   * その選手をこの大会・この種目に出せるか。
   *
   * ev を渡すと**種目まで見る**：勝ち上がりの大会は「前の段で優勝した種目」でしか出られない
   *（→ competitions.ts の stageEventKey）。100m自由形で県を勝った子が、
   * 次のブロックに200m平泳ぎで出られてしまうと、勝ち上がりの意味が無くなる。
   */
  raceEntryStatus(
    s: Student,
    comp: Competition,
    chosen: readonly Student[],
    ev?: RaceEvent,
  ): { ok: boolean; reason?: string } {
    // 出られるクラスは大会ごとに違う（記録会と地区大会は育成B以上／ほかは選手・プロ）
    if (!canEnterOf(comp)(s.classId)) {
      return { ok: false, reason: isTimeTrial(comp) || isAreaMeet(comp) ? "育成B以上から出られる" : "選手・プロのみ" };
    }
    if (!this.competitionsFor(s).some((c) => c.id === comp.id)) return { ok: false, reason: "出場資格がない" };
    // 勝ち上がった種目でだけ出られる（種目が決まっているときに見る）
    if (ev && comp.requiresPrev && !hasClearedStage(s, comp.requiresPrev, ev)) {
      const won = clearedEventsOf(s, comp.requiresPrev);
      const list = won.map((e) => `${STROKE_LABEL[e.stroke]}${e.distance}m`).join("・");
      return { ok: false, reason: won.length > 0 ? `${list} で勝ち上がっている` : "前の段で優勝した種目のみ" };
    }
    // 同じ週に泳ぐレースへ、すでにエントリーしている（1週間に出られる大会は1つ）
    const day = this.raceDayFor(comp);
    if (this.pendingRaces.some((r) => r.raceDay === day && r.studentIds.includes(s.id))) {
      return { ok: false, reason: `${this.raceDayLabel(day)}はエントリー済み` };
    }
    if (s.injuryDays > 0) return { ok: false, reason: `ケガ（あと${weeksLabel(s.injuryDays)}）` };
    // 遠征は週で数えている（→ SCALE_AWAY_DAYS）
    if (s.awayDays > 0) return { ok: false, reason: `遠征中（あと${Math.ceil(s.awayDays)}週）` };
    if (this.activeCamp && this.isAtCamp(s)) return { ok: false, reason: `合宿中（あと${this.activeCamp.weeksLeft}週）` };
    if (chosen.some((x) => x.id === s.id)) return { ok: true };
    if (chosen.length >= this.maxRaceEntries()) return { ok: false, reason: "レーンがいっぱい" };
    if (chosen.length > 0 && chosen[0].gender !== s.gender) return { ok: false, reason: "男女別レース" };
    return { ok: true };
  }

  // -------------------------------------------------------------- エントリーと開催日

  /** そのゲーム日の暦の呼び名（例：5月第3週）。 */
  raceDayLabel(day: number): string {
    const idx = (this.dayCount % DAYS_PER_MONTH_STEPS) + (day - this.dayCount);
    const ahead = Math.floor(idx / DAYS_PER_MONTH_STEPS);
    const month = ((((this.month - 1 + ahead) % 12) + 12) % 12) + 1;
    const week = (((idx % DAYS_PER_MONTH_STEPS) + DAYS_PER_MONTH_STEPS) % DAYS_PER_MONTH_STEPS) + 1;
    return `${month}月第${week}週`;
  }

  /** 今月の主要大会を泳ぐ日（その月の第3週）。 */
  majorRaceDay(): number {
    return this.dayCount - (this.dayCount % DAYS_PER_MONTH_STEPS) + MEET_WEEK_INDEX;
  }

  /** その大会にいまエントリーすると、どのゲーム日に泳ぐか。 */
  raceDayFor(comp: Competition): number {
    return isTimeTrial(comp) ? this.dayCount + TRIAL_LEAD_DAYS : this.majorRaceDay();
  }

  private nextPendingRaceId(): number {
    return this.pendingRaces.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  }

  /**
   * 記録会にエントリーする。**泳ぐのは2週間後**で、出場費はいま払う。
   * 同じ週・同じ記録会・同じ種目・同じ性別のエントリーは1つのレースにまとめる。
   */
  reserveTimeTrial(students: readonly Student[], comp: Competition, ev: RaceEvent): { reason?: string; race?: PendingRace } {
    if (!isTimeTrial(comp)) return { reason: "主要大会は出場確認から申し込む" };
    if (students.length === 0) return { reason: "選手をえらんでいない" };
    const picked: Student[] = [];
    for (const s of students) {
      const st = this.raceEntryStatus(s, comp, picked, ev);
      if (!st.ok) return { reason: `${s.name}：${st.reason ?? "出場できない"}` };
      picked.push(s);
    }
    const raceDay = this.raceDayFor(comp);
    const same = this.pendingRaces.find(
      (r) =>
        r.compId === comp.id &&
        r.raceDay === raceDay &&
        r.event.stroke === ev.stroke &&
        r.event.distance === ev.distance &&
        this.findStudent(r.studentIds[0])?.gender === picked[0].gender,
    );
    if (same && same.studentIds.length + picked.length > this.maxRaceEntries()) {
      return { reason: `そのレースはあと${Math.max(0, this.maxRaceEntries() - same.studentIds.length)}人まで` };
    }
    const afford = this.canAffordEntry(comp, picked.length);
    if (!afford.ok) return { reason: afford.reason };
    const cost = this.raceEntryCost(comp, picked.length);
    this.gems -= cost;
    if (same) {
      same.studentIds.push(...picked.map((s) => s.id));
      same.paid += cost;
      return { race: same };
    }
    const race: PendingRace = {
      id: this.nextPendingRaceId(),
      compId: comp.id,
      event: { ...ev },
      studentIds: picked.map((s) => s.id),
      raceDay,
      paid: cost,
    };
    this.pendingRaces.push(race);
    return { race };
  }

  /** 開催日を迎えた（過ぎた）レース。泳ぐ日の早い順。 */
  racesDue(): PendingRace[] {
    return this.pendingRaces.filter((r) => r.raceDay <= this.dayCount).sort((a, b) => a.raceDay - b.raceDay || a.id - b.id);
  }

  /**
   * 開催日のレースを取り出して、泳ぐ準備をする（レースは待ちの一覧から外す）。
   * ケガ・退会・クラスが変わったなどで出られなくなった選手は欠場にして、そのぶんの出場費を返す。
   * 遠征中は欠場にしない（同じ大会で2種目めを泳ぐ選手は、1種目めで遠征扱いになっているため）。
   */
  takePendingRace(race: PendingRace): RaceDayPlan {
    this.pendingRaces = this.pendingRaces.filter((r) => r.id !== race.id);
    const comp = competitionById(race.compId);
    const perHead = race.studentIds.length > 0 ? race.paid / race.studentIds.length : 0;
    const roster: Student[] = [];
    const withdrawn: Student[] = [];
    for (const id of race.studentIds) {
      const s = this.findStudent(id);
      if (!s) continue; // 退会した（返金は下でまとめる）
      // 出られるクラスは大会ごと（日本選手権から上は育成Bでも出られる → canEnterOf）
      const eligible = !!comp && canEnterOf(comp)(s.classId);
      const qualified = !!comp && (!comp.requiresPrev || hasClearedStage(s, comp.requiresPrev, race.event));
      if (eligible && qualified && s.injuryDays <= 0) roster.push(s);
      else withdrawn.push(s);
    }
    const refund = Math.round(perHead * (race.studentIds.length - roster.length));
    this.gems += refund;
    return { comp, event: { ...race.event }, roster, withdrawn, refund, prepaid: race.paid - refund };
  }

  // ---- 主要大会の出場確認（開催の2週間前に出す）

  private confirmKey(comp: Competition): string {
    return `${this.year}:${comp.id}`;
  }

  /** 開催の2週間前〜前週にある、今月の主要大会（条件を満たす選手がいるもの）。 */
  majorsInConfirmWindow(): Competition[] {
    const weekIdx = this.dayCount % DAYS_PER_MONTH_STEPS;
    if (weekIdx < MEET_WEEK_INDEX - MAJOR_CONFIRM_LEAD_DAYS || weekIdx >= MEET_WEEK_INDEX) return [];
    return CALENDAR.filter((c) => c.month === this.month && this.majorConfirmCandidates(c).length > 0);
  }

  /** そのうち、出場確認をまだ出していないもの（週が変わったときに自動で出す）。 */
  majorsNeedingConfirm(): Competition[] {
    return this.majorsInConfirmWindow().filter((c) => !this.meetConfirmAsked.includes(this.confirmKey(c)));
  }

  /** 出場確認を出した印を付ける（年ごとに持つので、来年はまた出る）。 */
  markConfirmAsked(compId: string): void {
    const comp = competitionById(compId);
    if (!comp) return;
    const key = this.confirmKey(comp);
    this.meetConfirmAsked = this.meetConfirmAsked.filter((k) => k.startsWith(`${this.year}:`) && k !== key);
    this.meetConfirmAsked.push(key);
  }

  /**
   * 主要大会の出場確認に並べる選手と種目。
   * 条件（学年のルート・前の段で優勝した種目・参加標準記録）を満たしている選手・プロだけ。
   */
  majorConfirmCandidates(comp: Competition): ConfirmCandidate[] {
    const out: ConfirmCandidate[] = [];
    for (const s of this.athletesFor(comp)) {
      if (!eligibleCompetitions(s, comp.month, this.year).some((c) => c.id === comp.id)) continue;
      for (const event of confirmEventsFor(s, comp)) out.push({ student: s, event });
    }
    return out;
  }

  /**
   * 前の段で優勝した選手を、次の大会に**自動でエントリー**する。
   *
   * 【なぜ自動か】勝ち上がりは「その種目で優勝した」という済んだ事実なので、
   * 次の大会で同じ子・同じ種目をもう一度選び直させる意味がない。
   * 出場確認の窓が開いたときにここを通しておけば、
   * プレイヤーは**変えたいときだけ**確認画面をいじればよくなる。
   *
   * 出場費はここで払う。やめれば `setMajorEntries` が返金するので、
   * 「勝手に取られっぱなし」にはならない。
   * 上限（1レース6人・1大会のべ8人）とお金が足りなければ、入る順に入れて打ち切る。
   *
   * 返り値は実際に入った顔ぶれ（お知らせに出す）。
   */
  autoEnterQualified(comp: Competition): ConfirmCandidate[] {
    if (!comp.requiresPrev) return [];
    const already = this.majorEntriesOf(comp);
    const key = (c: ConfirmCandidate): string => `${c.student.id}|${c.event.stroke}-${c.event.distance}`;
    const have = new Set(already.map(key));
    const add: ConfirmCandidate[] = [];
    for (const c of this.majorConfirmCandidates(comp)) {
      if (have.has(key(c))) continue;
      have.add(key(c));
      add.push(c);
    }
    if (add.length === 0) return [];

    // 入るところまで入れる（上限・お金で弾かれたら、その手前で確定させる）
    let best: ConfirmCandidate[] = already;
    for (let n = 1; n <= add.length; n++) {
      const want = [...already, ...add.slice(0, n)];
      const r = this.setMajorEntries(comp, want);
      if (!r.ok) break;
      best = want;
    }
    // 途中で弾かれていたら、確実に通る組み合わせで確定し直す
    if (best !== already) this.setMajorEntries(comp, best);
    return best.slice(already.length);
  }

  /** その主要大会に、いまエントリーしている選手と種目。 */
  majorEntriesOf(comp: Competition): ConfirmCandidate[] {
    const out: ConfirmCandidate[] = [];
    for (const r of this.pendingRaces) {
      if (r.compId !== comp.id) continue;
      for (const id of r.studentIds) {
        const s = this.findStudent(id);
        if (s) out.push({ student: s, event: { ...r.event } });
      }
    }
    return out;
  }

  /** その主要大会のエントリーで、払ってある出場費。 */
  majorPaidFor(comp: Competition): number {
    return this.pendingRaces.filter((r) => r.compId === comp.id).reduce((n, r) => n + r.paid, 0);
  }

  /**
   * 主要大会の出場を決める（出場確認の「エントリー」）。
   * いまのエントリーはいったん取り消して返金し、picks の内容で入れ直す。
   * 種目・性別ごとに1レースにまとめ、1レースに入れるのは maxRaceEntries 人まで。
   */
  setMajorEntries(
    comp: Competition,
    picks: readonly ConfirmCandidate[],
  ): { ok: boolean; reason?: string; count: number; cost: number } {
    const groups = new Map<string, ConfirmCandidate[]>();
    let total = 0;
    for (const p of picks) {
      const key = `${p.student.gender}|${p.event.stroke}-${p.event.distance}`;
      const list = groups.get(key) ?? [];
      if (list.some((x) => x.student.id === p.student.id)) continue;
      if (list.length >= this.maxRaceEntries()) return { ok: false, reason: "1レースに出せる人数を超えている", count: 0, cost: 0 };
      // 【1大会の上限】種目を選べる地区大会で「全員を全種目に」を防ぐ蓋
      if (total >= this.maxMeetEntries()) {
        return { ok: false, reason: `1つの大会に申し込めるのは のべ${this.maxMeetEntries()}人まで`, count: 0, cost: 0 };
      }
      list.push(p);
      total++;
      groups.set(key, list);
    }
    const count = [...groups.values()].reduce((n, g) => n + g.length, 0);
    const cost = this.raceEntryCost(comp, count);
    const refund = this.majorPaidFor(comp);
    if (this.gems + refund < cost) return { ok: false, reason: `出場費が足りない（◆${cost}）`, count, cost };
    this.pendingRaces = this.pendingRaces.filter((r) => r.compId !== comp.id);
    this.gems += refund - cost;
    const perHead = count > 0 ? cost / count : 0;
    const raceDay = this.majorRaceDay();
    for (const list of groups.values()) {
      this.pendingRaces.push({
        id: this.nextPendingRaceId(),
        compId: comp.id,
        event: { ...list[0].event },
        studentIds: list.map((p) => p.student.id),
        raceDay,
        paid: Math.round(perHead * list.length),
      });
    }
    return { ok: true, count, cost };
  }

  /**
   * 大会にエントリーして予選→決勝を実行し、報酬を反映する。
   *
   * 同じ種目に複数人を出せる（同じ組で泳ぐので順位を取り合う）。
   * 報酬・実績ポイント・格の判定は1人ずつ行い、クラブの取り分は合計する。
   */
  enterCompetition(
    students: readonly Student[],
    comp: Competition,
    ev?: RaceEvent,
    /** prepaid：エントリーのときに払ってある出場費（開催日を待っていたレース）。 */
    opts: { prepaid?: number } = {},
  ): CompetitionResult {
    // 出場資格の無い選手はここで落とす（防御）。人数もレーン数に丸める。
    const eligible = canEnterOf(comp);
    const event = ev ?? students[0]?.fav;
    const roster = students
      .filter((s) => eligible(s.classId))
      // 勝ち上がりの大会は、その種目で勝ち上がった選手だけ（画面を通さず呼ばれても崩れないように）
      .filter((s) => !comp.requiresPrev || !event || hasClearedStage(s, comp.requiresPrev, event))
      .slice(0, this.maxRaceEntries());
    if (roster.length === 0 || !event) {
      return {
        outcome: { heat: [], final: null, entrants: [] },
        entries: [],
        best: null,
        totalGems: 0,
        totalPopularity: 0,
        entryCost: 0,
        passion: 0,
        mayorPrize: 0,
        coachMet: null,
      };
    }

    // 出場費（エントリー費・遠征費）を先に支払う。大きい大会ほど高い。
    // エントリーのときに払ってある（開催日を待っていた）レースは、ここでは引かない
    const entryCost = opts.prepaid ?? this.raceEntryCost(comp, roster.length);
    if (opts.prepaid == null) this.gems = Math.max(0, this.gems - entryCost);

    // 高地の効果帯（下山からの日数）とケガが、ここでタイムに乗る
    const raceEntries: RaceEntry[] = roster.map((s) => ({ student: s, extraFactor: this.raceExtraFactor(s, event) }));
    const outcome = simulateRace(
      raceEntries,
      event,
      // 相手の強さは「段」だけでなく**年代**でも変わる（小学生の世界大会 ≠ 一般の世界選手権）
      rivalLevelOf(comp),
      this.rand,
      finalWallOf(comp),
      // 相手の名前と国（記録会は月ごとに id が変わるので、段のキーを渡す
      // ＝同じ段の記録会にはいつも同じ強豪が居る）
      {
        compId: kirokukaiTierOf(comp.id) != null ? KIROKUKAI_LADDER[kirokukaiTierOf(comp.id) as number].key : comp.id,
        world: comp.scale === "sekai",
        event,
        gender: roster[0].gender,
        // 日本選手権から上は、相手も全員が参加標準記録を切っている（→ GENERAL_RIVAL）
        timeCap:
          comp.route === "general" ? effectiveStandard("nihonSenshuken", event, roster[0].gender).time : undefined,
      },
    );

    const entries: CompetitionEntryResult[] = [];
    let totalGems = 0;
    let totalPopularity = 0;
    /** 市長からの祝い金（大会につき1回）。 */
    let mayorPrize = 0;
    // 【情熱】出場するだけでも少し燃える（大会1回につき1度だけ。人数では増えない）
    let passion = this.addPassion(PASSION.enterByScale[comp.scale] ?? 0);

    for (const s of roster) {
      const entrant = outcome.entrants.find((e) => e.studentId === s.id);
      if (!entrant) continue;
      const reward = resolveCompetition(s, comp, entrant, event);
      totalGems += reward.gems;
      totalPopularity += reward.popularity;
      if (entrant.win) {
        this.championships += 1;
        s.wins += 1;
        // 優勝は情熱のいちばん大きな供給源。格が高い大会ほど大きく燃える
        passion += this.addPassion(PASSION.winByScale[comp.scale] ?? 0);
        /**
         * 【市長からの祝い金】主要大会で優勝するとクラブに大金が入る（→ SCALE_MAYOR_PRIZE）。
         * **1つの大会につき1回だけ**。種目を選べる地区大会で
         * 「8種目に出して8回もらう」を防ぐため、最初の優勝ぶんだけ数える。
         */
        if (mayorPrize === 0) mayorPrize = SCALE_MAYOR_PRIZE[comp.scale] ?? 0;
      }
      // 【満足度】勝てば大きく上向き、決勝に残れなければ落ち込む
      applyMood(s, entrant.win ? "win" : entrant.advanced ? "goodPractice" : "lost");

      // 【実戦で泳法が身につく】出た種目の熟練度が、練習よりまとまって上がる。
      // 優勝すればさらに上乗せ。大きい大会ほど得るものも大きい（→ STROKE.meetScaleMult）。
      // 個人メドレーの種目は4泳法へ分けて積む（個メ専用の熟練度は持たない）。
      const meetMult = STROKE.meetScaleMult[comp.scale] ?? 1;
      addMeetStrokeProf(s, event.stroke, (STROKE.meetGain + (entrant.win ? STROKE.winBonus : 0)) * meetMult);

      // 格は「実際の成績」で決まる：出したタイム・順位・突破した標準記録。
      // 自己新かどうかは演出に使うので受け取っておく。
      const prevBestSec = s.bestTimeSec;
      const selfBest = recordTime(s, event, entrant.bestTime);
      // 大会新記録：その大会・その種目でクラブが出した過去いちばんのタイムを更新したか
      const meetRecord = this.noteMeetRecord(comp.id, event, entrant.bestTime);
      let earned = competitionPoints(comp.scale, entrant);
      for (const key of reward.newStandards) earned += standardPoints(key);
      addAchievement(s, earned);
      // クラブの格にも、その成績の一部が積まれる
      this.clubAchievement += earned * CLUBRANK.achievementShare;
      this.noteRankUp(s);

      // 地方ブロックより上は遠征。1週間クラブを空ける（その間は練習に出られない）
      const away = this.raceAwayDays(comp);
      if (away > 0) s.awayDays = Math.max(s.awayDays, away);

      // 大型施設が縮めた秒数（その倍率が無かったら何秒だったか、との差）
      const ff = this.bigFacilityRaceFactor(s, event);
      const facilityCutSec = ff < 1 ? entrant.bestTime * (1 / ff - 1) : 0;
      entries.push({ student: s, entrant, reward, selfBest, meetRecord, prevBestSec, facilityCutSec });
    }

    this.gems += totalGems + mayorPrize;
    this.addPopularity(totalPopularity);

    const top = bestEntrant(outcome);
    const best = top ? (entries.find((e) => e.entrant.studentId === top.studentId) ?? null) : null;
    // 記録会で優勝すると、たまにコーチの目に留まる（→ MEET_COACH）。出ただけでは抽選しない
    const wonHere = entries.some((e) => e.entrant.win);
    const coachMet = isTimeTrial(comp) && wonHere ? this.rollMeetCoach(comp) : null;
    return { outcome, entries, best, totalGems, totalPopularity, entryCost, passion, mayorPrize, coachMet };
  }

  // -------------------------------------------------------------- リレー（12月の世界選手権）

  /**
   * 今リレーを泳げるか。泳げるなら「日本代表に選ばれている自クラブの選手」を返す。
   *
   * 条件は3つ。
   *   ① 12月の世界選手権が開かれている月（→ CALENDAR の gen_sekai）
   *   ② 10月の日本選手権で 100m のどれかの泳法で優勝した選手がいる
   *   ③ 今年まだ泳いでいない（記録は season に付くので、年が変わればまた泳げる）
   */
  relayEntry(): { gender: Gender; members: Student[]; slots: (Student | null)[] } | null {
    const comp = competitionById("gen_sekai");
    if (!comp || comp.month !== this.month) return null;
    // 日本選手権は育成Bからでも出られるので、日本代表も育成B以上の全員から選ぶ
    const pool = this.timeTrialAthletes();
    const gender = pickRelayGender(pool);
    if (!gender) return null;
    const slots = relaySelection(pool, gender);
    const members = slots.filter((s): s is Student => s != null);
    if (members.length === 0) return null;
    if (members.some((s) => relayAlreadySwum(s))) return null;
    return { gender, members, slots };
  }

  /**
   * リレーを泳ぐ。
   *
   * 報酬は世界大会1回ぶん（→ SCALE_REWARD.sekai）を**チームの順位で割り引き**、
   * 出た選手の人数で分ける。個人種目と同じ額を1人ずつに配ると、
   * 4人で出たときに世界大会4回ぶんの稼ぎになってしまう。
   */
  runRelay(): RelayResult | null {
    const entry = this.relayEntry();
    const comp = competitionById("gen_sekai");
    if (!entry || !comp) return null;

    /**
     * 【壁のぶんも足す】リレーは**予選が無く、決勝だけ**を泳ぐ。
     * 個人種目の決勝は `rivalLevelOf + SCALE_FINAL_WALL` の相手と泳ぐので、
     * ここで壁を足さないと「世界大会なのに予選レベルの相手」になってしまう。
     */
    const level = rivalLevelOf(comp) + finalWallOf(comp);
    const outcome = simulateRelay(this.timeTrialAthletes(), entry.gender, level, this.rand, (s, ev) =>
      this.raceExtraFactor(s, ev),
    );
    markRelaySwum(outcome.members);

    // 順位の取り分（1位を満額に、表彰台まではしっかり、あとは薄く）
    const mult = outcome.rank === 1 ? 1 : outcome.rank <= 3 ? 0.45 : outcome.rank <= 5 ? 0.2 : 0.08;
    const base = SCALE_REWARD[comp.scale];
    const share = Math.max(1, outcome.members.length);
    const won = outcome.rank === 1;

    let totalGems = 0;
    let totalPopularity = 0;
    let passion = this.addPassion(PASSION.enterByScale[comp.scale] ?? 0);
    const entries: RelayResult["entries"] = [];
    for (const s of outcome.members) {
      const leg = outcome.japan.legs.find((l) => l.student?.id === s.id);
      if (!leg) continue;
      const gems = Math.round((base.gems * mult) / share);
      const popularity = Math.round((base.popularity * mult) / share);
      totalGems += gems;
      totalPopularity += popularity;

      // 泳いだ泳法の熟練度（リレーも実戦。優勝すれば上乗せ）
      const meetMult = STROKE.meetScaleMult[comp.scale] ?? 1;
      addMeetStrokeProf(s, leg.stroke, (STROKE.meetGain + (won ? STROKE.winBonus : 0)) * meetMult);
      // 自己ベストは 100m のその泳法として拾う（リレーの1本も泳いだ記録）
      recordTime(s, { stroke: leg.stroke, distance: RELAY_DISTANCE }, leg.time);

      // 実績（個人種目の1/2。チームの成績なので個人の手柄は半分）
      const earned = (RANK.scalePoints[comp.scale] ?? 0) * mult * 0.5;
      addAchievement(s, earned);
      this.clubAchievement += earned * CLUBRANK.achievementShare;
      this.noteRankUp(s);
      applyMood(s, won ? "win" : outcome.rank <= 3 ? "goodPractice" : "lost");
      if (won) {
        s.wins += 1;
        passion += this.addPassion(PASSION.winByScale[comp.scale] ?? 0);
      }
      const away = this.raceAwayDays(comp);
      if (away > 0) s.awayDays = Math.max(s.awayDays, away);
      entries.push({ student: s, stroke: leg.stroke, time: leg.time, gems, popularity });
    }
    if (won) this.championships += 1;
    this.gems += totalGems;
    this.addPopularity(totalPopularity);
    return { outcome, entries, totalGems, totalPopularity, passion, won };
  }

  // -------------------------------------------------------------- チュートリアル完了ボーナス

  /**
   * チュートリアルを最後まで進めたときの仕上げ。
   *  ・スタジオを無料で設置する
   *  ・各育成クラスに最低人数ぶんの生徒を入れる（空のクラスが残らないように）
   * これで「各クラスに生徒がいる状態」から本編を始められる。
   */
}
