import { bgm } from "../audio/bgm";
import { weeksLabel } from "../sim/weeks";
import Phaser from "phaser";
import {
  COLORS,
  FOOTER_BAR_H,
  FOOTER_H,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_H,
  TILE_H,
  TILE_W,
} from "../config";
import { GameState, PIN_MAX, type ClassId, type MonthRollResult, type RetiredRecord } from "../sim/state";
import { classLabel, CLASS_ORDER, isSchoolClass } from "../sim/classes";
import {
  CORE_STROKES,
  energyMax,
  GENDER_LABEL,
  strokeCapOf,
  STAT_COLOR,
  STAT_KEYS,
  predictTime,
  createStudent,
  STROKE_LABEL,
  STROKE_SHORT,
  type Stroke,
  formatTime,
  type StatKey,
  type Student,
  type RaceEvent,
} from "../sim/student";
import { canUseEquipment, footprintOf, isTrainingRoom, standRowsOf, stationsOf, venueSlotsOf, type RoomKind } from "../sim/equipment";
import type { RecoveryOutcome } from "../sim/needs";
import { rankColor, rankLabel, rankOf, rankShort, type RankUpEvent } from "../sim/rank";
import type { CampaignId } from "../sim/campaign";
import type { Competition } from "../sim/competitions";
import { GameClock, OPEN_MINUTE, type Speed } from "../sim/clock";
import { depthFor, isoToWorld, worldToCell, LAYER } from "../iso/projection";
import { boundsOf, edgeScrollVector, keepInViewOffset, type ViewRect } from "../iso/camera";
import {
  bathPoseOf,
  diningSeatCells,
  isDiningRoom,
  serveSpotOf,
  approachInside,
  bathSeatCells,
  isBathWaterCell,
  doorMarks,
  fittingsOf,
  floorKindAt,
  gearSpecsFor,
  groundCells,
  isIndoorFloor,
  type BathPose,
  outsideAxis,
  outsideRing,
  OUTSIDE_BANDS,
  type FloorKind,
  outdoorScatter,
  innerCellsOf,
  isOverPoolWater,
  laneRopesOf,
  leaveRoute,
  moveRoute,
  poolDeckAt,
  poolDeckNear,
  entranceDoorCells,
  spawnCell,
  standAt,
  standCellsOf,
  startBlockCellsOf,
  clearOfFrontWall,
  swimLanesOf,
  visitRoute,
  buildingWallEdges,
  wallEdgesOf,
  worldBounds as mapWorldBounds,
  type Cell,
  type Waypoint,
} from "../iso/facility";
import {
  centerOf,
  landBounds,
  mapSignature,
  nearestEntrance,
  outsideCellOf,
  placedRooms,
  type ClubMap,
} from "../sim/clubMap";
import {
  equipmentDef,
  isEquipmentKind,
  isBathRoom,
  isPool,
  RECOVERY_ROOMS,
  roomPoint,
  roomSize,
  rotOf,
  type Equipment,
  type RoomRot,
} from "../sim/equipment";
import { groupByClass, membersOfClass, type PoolLineup } from "../sim/lineup";
import { Person, Visitor, type SwimLane, type VisitorStop } from "../iso/people";
import { StaffPerson } from "../iso/staff";
import { TrafficLayer } from "../iso/traffic";
import {
  staffKey,
  GRASS_TEXTURE,
  WALL_ORIGINS,
  WALL_TOP,
  wallTextureKey,
} from "../gfx/textures";
import { roomStyle, WALL_H } from "../gfx/roomStyle";
import { bakeChunks } from "../gfx/bake";
import { GainPopupLayer } from "../gfx/GainPopup";
import { SpeechBubbleLayer } from "../gfx/SpeechBubble";
import { MoodGaugeLayer, StarMeter } from "../gfx/MoodGauge";
import { FatigueMarkLayer, fatigueLevelOf, type FatigueLevel } from "../gfx/FatigueMark";
import { makeChatter, type ChatterActivity } from "../sim/chatter";
import { ambientAt, crowdLabel, phaseAt, veilAlphas } from "../sim/daytime";
import { moodColor, moodLabel } from "../sim/satisfaction";
import { CelebrationLayer } from "../gfx/Celebration";
import { clubRankColor, clubRankShort, type ClubRankUpEvent } from "../sim/clubRank";
import { monthlyAdvice, type Advice } from "../sim/advice";
import { setJaWrap } from "../ui/textWrap";
import { Button } from "../ui/Button";
import { flushInput } from "../ui/inputReady";
import { Gauge } from "../ui/Gauge";
import { StudentPanel, type PanelEnv, type PanelNav } from "../ui/StudentPanel";
import { RosterModal } from "../ui/RosterModal";
import { CampModal, type CampSnapshot } from "../ui/CampModal";
import { CoachModal } from "../ui/CoachModal";
import { StaffModal } from "../ui/StaffModal";
import { PersonCardModal } from "../ui/PersonCardModal";
import { guestProfileOf, type GuestArrival, type GuestCategory, type GuestQueueEvent } from "../sim/guests";
import { popularityGaugeGoal } from "../sim/popularity";
import { PickerModal, type PickerOption } from "../ui/PickerModal";
import { DormModal } from "../ui/DormModal";
import { RaceSummaryModal, type RaceSummaryRow } from "../ui/RaceSummaryModal";
import { ManualModal } from "../ui/ManualModal";
import { RoomInfoModal } from "../ui/RoomInfoModal";
import { CompetitionEntryModal, type EntrySnapshot } from "../ui/CompetitionEntryModal";
import { EventListModal } from "../ui/EventListModal";
import { SystemModal, type SaveAttempt } from "../ui/SystemModal";
import { SettingsModal } from "../ui/SettingsModal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { CompetitionResult, RelayResult } from "../sim/state";
import { RELAY_DISTANCE, RELAY_ORDER, RELAY_SOURCE_COMP } from "../sim/relay";
import { attachLongPress } from "../ui/longPress";
import { RetireRecapModal } from "../ui/RetireRecapModal";
import { FacilityShopModal } from "../ui/FacilityShopModal";
import { BuildOverlay } from "../ui/BuildOverlay";
import { PlacementOverlay } from "../ui/PlacementOverlay";
import { createPerfMeter, type PerfMeter } from "../ui/PerfMeter";
import { TimetableModal } from "../ui/TimetableModal";
import type { PlacementTarget } from "../sim/placement";
import { ClassPracticeModal } from "../ui/ClassPracticeModal";
import { ResearchModal } from "../ui/ResearchModal";
import { effectSummaryAt, researchTopic } from "../sim/research";
import { PlayerCardModal } from "../ui/PlayerCardModal";
import { SpecialTrainingModal } from "../ui/SpecialTrainingModal";
import { SPECIAL_MENUS } from "../sim/special";
import { MonthlyReportModal } from "../ui/MonthlyReportModal";
import { NoticeFeed } from "../ui/NoticeFeed";
import type { AutoEvent } from "../sim/autoEvents";
import {
  AUTONOMY,
  CAMERA,
  CHATTER,
  CLOCK,
  CLUBRANK,
  DAYTIME,
  FATIGUE_MARK,
  FX,
  GROWTH_FX,
  GUESTS,
  MAP,
  PASSION,
  SHORTCOURSE,
} from "../config/balance";
import { applySave } from "../save/serialize";
import { writeSlot } from "../save/slots";
import { settings, updateSettings } from "../save/settings";
import { devView } from "../dev/devView";
import { probeKind, probeLife, probeLog, probeTired } from "../dev/devProbe";
import { buildShowcase, rotateShowcase } from "../dev/devFacility";
import type { SaveData } from "../save/types";
import { MeetConfirmModal } from "../ui/MeetConfirmModal";
import { CALENDAR, competitionById, kirokukaiOf, stageEventKey } from "../sim/competitions";
import { applyRenderScale, logicalPoint } from "../gfx/renderScale";

/** 画面に出す1プールあたりの最大人数（見やすさ優先。全員はsim側に存在）。 */
const DISPLAY_CAP = 12;

/**
 * 水面のきらめきを描き直す間隔（秒）。
 * ここだけは絵に焼けない（動くので）ため、毎フレームではなく間引いて描く。
 * 1/30秒なら、ゆらぎの速さ（1〜3Hz）に対して十分なめらかに見える。
 */
const SHIMMER_INTERVAL = 1 / 30;

/**
 * 芝生に散らす木・岩の上限と、散らす帯の幅（マス）。
 *
 * 散らした小物はどれも「毎フレームの深度ソートの対象」になるので、
 * 増やしすぎると重くなる。**買った土地のすぐ外側の帯だけ**を飾り、
 * それも上限で頭打ちにしてある（遠くの緑は画面にほとんど入らない）。
 * 重いと感じたら、まずここを小さくすること。
 */
const SCATTER_MAX = 56;
const SCATTER_BAND = OUTSIDE_BANDS.street;

/**
 * 車道を走らせる車の数。
 * 敷地を広げても増やさない（輪が長くなって、行き交う密度が下がるだけ）。
 * 停めてある車と違って毎フレーム動かすので、ここは少なめに保つこと。
 */
const TRAFFIC_CARS = 18;

/**
 * 部屋名の札の深度（world コンテナの中）。
 * マスの深度は最大でも (37+37)×1000＋60 ＝ 74060 なので、
 * ここを大きく取っておけば札は必ずいちばん手前に出る。
 */
const ROOM_LABEL_DEPTH = 900_000;

/**
 * 温浴施設で「席として見にいく数」の上限。
 *
 * 実際に何人入れるかは sim 側（BATHING.rooms[kind].seats／guestCap）が決めているので、
 * ここは席の候補をいくつ作るかという描画側の都合だけ。広い湯船でも探索が伸びないよう頭打ちにする。
 */
const BATH_SEAT_LOOK = 16;

/**
 * 温浴施設に滞在する秒数（一般客）。
 *
 * 参考画像のように「何人もがくつろいでいる」絵にするための数値。
 * 同時に見える人数は「来る人数 × 1人の滞在時間」で決まるので、
 * 長湯させるほど湯船が賑わう。売上（sim 側の料金）には一切関係しない。
 * 1日は等倍で約151秒（CLOCK.msPerMinute）なので、24〜36秒＝1日に何度も入れ替わる長さ。
 */
const BATH_STAY_SEC = 24;

/**
 * 食堂・カフェで席に着いている秒数。
 * 湯ほど長居はしないが、数秒で帰らせると「同時に座っている人数」が増えず、
 * ガランとした食堂になってしまう。1日＝約151秒なので、1日に何度も入れ替わる長さ。
 */
const DINE_STAY_SEC = 14;

/**
 * 席・立ち位置の「同じ場所か」を判定する鍵（半マス刻み）。
 * 席は 0.06 マス単位でずらしてあるので、そのまま比べると別物になってしまう。
 * 半マスに丸めることで「同じ椅子」を1つの鍵にまとめる。
 */
function spotKey(c: Cell): string {
  return `${Math.round(c.gx * 2)},${Math.round(c.gy * 2)}`;
}

/**
 * 選手が回復施設で過ごす時間（回復にかかるゲーム内分 → 画面上の秒）。
 *
 * ゲーム内1分 = CLOCK.msPerMinute（210ms）なので、この倍率にしておくと
 * **画面に見えている滞在時間＝ sim が言っている利用時間**になる。
 * 回復施設の利用は1コマぶん（→ RECOVERY_ROOM.useMinutes）なので、
 * ちょうど次のコマが始まるころに上がってくる。
 */
const BATH_HOLD_PER_MINUTE = CLOCK.msPerMinute / 1000;

/**
 * このシーンの起動引数。
 *  data あり  → その枠の続きから再開
 *  data なし  → clubName で新規ゲーム
 */
export interface FacilityInit {
  slot: number;
  data?: SaveData;
  clubName?: string;
}

interface Shimmer {
  x: number;
  y: number;
  len: number;
  phase: number;
  speed: number;
}

/**
 * 湯気（風呂の湯面・サウナのストーブから立ちのぼる）。
 *
 * 参考画像の温浴フロアで「そこが温かい場所だ」と分かる決め手なので、
 * 床の色や什器より優先して入れている。1つの発生源から3つのふわりを
 * 時間差で出すだけの計算（sin と剰余）なので、数を増やしても軽い。
 */
interface Steam {
  x: number;
  y: number;
  /** ふわりの大きさ（px）。 */
  r: number;
  /** 立ちのぼる高さ（px）。 */
  rise: number;
  phase: number;
  speed: number;
  /** 湯気の色（風呂＝白、サウナ＝熱で少し赤みがかる）。 */
  tint: number;
}

/** 画面に出す湯気の発生源の上限（多すぎると温浴フロアが真っ白になる）。 */
const STEAM_MAX = 26;

/** 満足して帰る一般客が頭の上に出す記号。 */
const JOY_MARKS = ["♪", "♥", "☺"] as const;

/**
 * 時間帯の色を重ねる幕の深度。
 *
 * 施設（負の深度〜数万）より手前、ズームボタン(1800)・演出(1870〜)・HUD(2000) より奥。
 * ここを 1500 以上にすると、見た目確認の `?hud=0` で幕ごと消えて夜の絵が撮れない。
 */
const AMBIENT_DEPTH = 1450;

/**
 * 夜の館内照明の深度（world コンテナの中）。
 * 焼いた床(-1,000,000)・水面のきらめき(-850,000)より手前、什器や人（正の深度）より奥。
 */
const LIGHT_DEPTH = -840_000;

/** 「最後にしゃべった時刻」を覚えておく人数の上限（超えたら古いものを捨てる）。 */
const CHATTER_MEMORY_MAX = 240;

/** クラブ全体の満足度（HUD の★）を計算し直す間隔（秒）。全員を平均するので間引く。 */
const CLUB_MOOD_INTERVAL = 1.2;

/** 回復設備に入った選手のうち、★ゲージを出す人数の上限（1回の解散あたり）。 */
const RECOVERY_GAUGE_MAX = 3;
/**
 * 【医科学センターの持ち場】練習を終えた選手が「測定」に来て立つ／座る位置（回す前の向きの dx,dy）。
 * iso/facility.ts の ROOM_FITTINGS.science の機器の**手前**に置いてある。
 * 以前は効果（練習効率・ケガの治り）が数字で効くだけで、誰も入って来ない部屋だった。
 */
const SCIENCE_SPOTS: readonly { dx: number; dy: number; pose: BathPose | null }[] = [
  { dx: 1.9, dy: 2.35, pose: null }, // 体組成スキャナ
  { dx: 1.4, dy: 3.75, pose: null }, // トレッドミル（呼気ガス）
  { dx: 2.55, dy: 2.75, pose: null }, // フォースプレートのスタート台
  { dx: 4.1, dy: 4.25, pose: null }, // 流水プールの観察窓の前
  { dx: 5.6, dy: 4.25, pose: null }, // 同じく（撮った泳ぎを見る）
  { dx: 7.8, dy: 2.2, pose: null }, // 分析台（結果を聞く）
  { dx: 7.8, dy: 3.9, pose: null }, // 分析台
  { dx: 7.7, dy: 5.4, pose: null }, // アイスバスの横
  { dx: 4.6, dy: 5.9, pose: "dine" }, // 待合のソファ
  { dx: 5.4, dy: 5.9, pose: "dine" }, // 待合のソファ
];
/**
 * 流水プールの置き場所（ROOM_FITTINGS.science の fnFlumeTank と同じ dx,dy・倍率）。
 * 絵の足元から水槽の真ん中までは、画面の上へ 42px×倍率（＝グリッドで gx・gy とも 0.84 マス奥）。
 * 水面は床から (20+12)px×倍率 の高さ（→ gfx/bigFacility の fnFlumeTank）。
 */
const FLUME_AT = { dx: 4.9, dy: 3.1, scale: 1.2 };
const FLUME_CENTER_BACK = (42 * FLUME_AT.scale) / (TILE_H);
const FLUME_WATER_LIFT = 32 * FLUME_AT.scale;
/**
 * 【低酸素トレーニングルームの持ち場】時間割でクラスを入れたとき、選手が立って練習する位置
 *（回す前の向きの dx,dy）。ROOM_FITTINGS.altitudeLab のトレッドミル・バイク・ポッドの手前。
 * 足りないぶんは部屋の中の立ち位置（standCellsOf）で埋める。
 */
const ALTITUDE_SPOTS: readonly { dx: number; dy: number }[] = [
  { dx: 1.8, dy: 3.9 },
  { dx: 4.2, dy: 3.9 },
  { dx: 6.6, dy: 3.9 },
  { dx: 8.8, dy: 4.0 },
  { dx: 1.3, dy: 1.9 },
  { dx: 3.7, dy: 1.9 },
  { dx: 6.1, dy: 1.9 },
  { dx: 8.5, dy: 1.9 },
];
/**
 * 【見物客】プールの賑わい（2026-09-26）。見た目だけの人で、収入・満足度には数えない。
 *   大型プール … 観客席に座ってくつろぐ人。練習中はそのぶん多い（練習を見に来る）。
 *               観客席へは水面を渡らないと行けないので、席にふっと現れて、ふっと消える。
 *   どのプールも … 練習中はプールサイドに見学の保護者が立つ。
 *   intervalSec  … 何秒ごとに1人ずつ足すか
 *   standBase / standLesson / standPerPopularity / standMax … 大型プールの観客の目安
 *   deckLesson   … 練習中のプールに立つ見学者の数
 */
const SPECTATOR = {
  intervalSec: 1.8,
  standBase: 3,
  standLesson: 6,
  standPerPopularity: 500,
  standMax: 14,
  deckLesson: 2,
  staySec: { min: 25, max: 55 },
  deckStaySec: { min: 18, max: 34 },
};
/** 観客席の1マスにある3つの座席の位置（ひな壇の絵 fnStandSeats の u=0.18/0.5/0.82 → マス）。 */
const STAND_SEAT_OFFSETS = [-0.294, 0, 0.294];
/** 練習を終えた育成以上の選手が、医科学センターへ測定に寄る確率（空きがあるときだけ）。 */
const SCIENCE_VISIT_CHANCE = 0.45;
/** 測定にかける秒（実時間）。1コマぶんくらい居ると、いつ見ても誰かがいる部屋になる。 */
const SCIENCE_STAY_SEC = { min: 16, max: 28 };
/** 研究員（白衣）の持ち場（回す前の向きの dx,dy）。部屋1つにつき2人。 */
const SCIENCE_STAFF_SPOTS: readonly { dx: number; dy: number }[] = [
  { dx: 4.4, dy: 0.95 }, // モニタウォールの前
  { dx: 8.9, dy: 2.3 }, // 分析台の奥
];
/** 回復設備に入れず不満をこぼす選手を、1回の解散で何人まで出すか（全員に出すとうるさい）。 */
const RECOVERY_COMPLAINTS_MAX = 2;

/**
 * 入れずに帰る客の道順（**中には入らない**）。
 *
 * 前は「入口の外から gy を 1.2 マス進む」だけだったので、
 *  ・入口が敷地のどの辺にあるかで、建物の中に入ったり道路へ出たりして向きが定まらない
 *  ・入って出て、をその場で繰り返すので「回転ドア」に見える
 * の2つが起きていた。扉のほうへ少しだけ歩いて、**扉の手前で止まる**ようにする。
 * 引き返す道は呼び出し側が作る（来た道をそのまま戻る）。
 */
/**
 * 掃除で入らせない部屋。
 * 寮は選手の私的な場所で、温浴施設は入浴中の人がいる。
 */
const NO_CLEANING = new Set<Equipment["kind"]>(["dorm", "bath", "sauna", "openair"]);

/**
 * 同じ場所に集まる人を、**画面の左右**へ1列に散らす。
 *
 * 等角では 画面X ∝ gx-gy なので、gx と gy を逆向きに動かすと画面の真横へ動く。
 * 同じ向きに動かすと画面のほぼ真下＝ほとんど重なったままになる（→ standCellsOf）。
 */
function lineUpAt(cell: Cell, index: number, total: number): Cell {
  if (total <= 1) return cell;
  const t = (index / (total - 1) - 0.5) * LINE_UP_SPREAD * (total - 1);
  return { gx: cell.gx + t + index * 0.02, gy: cell.gy - t + index * 0.02 };
}

/** 1列に並ぶときの1人ぶんの間隔（マス）。画面上はおよそ 2×0.26×TILE_W/2 ＝ 31px。 */
const LINE_UP_SPREAD = 0.26;

/** プールサイドに複数のコーチが立つときの間隔（マス）。プールサイドは横一直線なので広く取れる。 */
const POOLSIDE_SPACING = 1.4;

/** min〜max のあいだの秒数（滞在・立ち止まりの長さ。見た目だけの乱数）。 */
function randRange(range: { min: number; max: number }): number {
  return range.min + Math.random() * Math.max(0, range.max - range.min);
}

/** 行列で前の人との間隔（マス）と、先頭が扉からどれだけ離れて立つか。 */
const QUEUE_SPACING = 0.55;
const QUEUE_HEAD_GAP = 0.35;

/** 行列の k 番目（0＝先頭）が立つ位置の、扉からの距離（マス）。 */
function queueSpotDistance(k: number): number {
  return QUEUE_HEAD_GAP + k * QUEUE_SPACING;
}

function polylineLength(line: readonly Cell[]): number {
  let n = 0;
  for (let i = 1; i < line.length; i++) n += Math.hypot(line[i].gx - line[i - 1].gx, line[i].gy - line[i - 1].gy);
  return n;
}

/** 折れ線の上で、始点から距離 d の点（線より長ければ終点）。 */
function pointAlong(line: readonly Cell[], d: number): Cell {
  let left = Math.max(0, d);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const seg = Math.hypot(b.gx - a.gx, b.gy - a.gy);
    if (left <= seg) {
      const t = seg > 0 ? left / seg : 0;
      return { gx: a.gx + (b.gx - a.gx) * t, gy: a.gy + (b.gy - a.gy) * t };
    }
    left -= seg;
  }
  const last = line[line.length - 1];
  return { gx: last.gx, gy: last.gy };
}

/**
 * 折れ線の上を、距離 from から to まで歩く道（途中の曲がり角を含む。始点は含めない）。
 * 行列を詰める・行列から帰るときに、廊下の角を斜めに突っ切らないために使う。
 */
function pathAlong(line: readonly Cell[], from: number, to: number): Waypoint[] {
  const total = polylineLength(line);
  const a = Math.min(Math.max(0, from), total);
  const b = Math.min(Math.max(0, to), total);
  const corners: { d: number; c: Cell }[] = [];
  let acc = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) acc += Math.hypot(line[i].gx - line[i - 1].gx, line[i].gy - line[i - 1].gy);
    corners.push({ d: acc, c: line[i] });
  }
  const out: Waypoint[] = [];
  if (b < a) {
    for (let i = corners.length - 1; i >= 0; i--) {
      if (corners[i].d < a - 1e-6 && corners[i].d > b + 1e-6) out.push({ gx: corners[i].c.gx, gy: corners[i].c.gy });
    }
  } else {
    for (const k of corners) if (k.d > a + 1e-6 && k.d < b - 1e-6) out.push({ gx: k.c.gx, gy: k.c.gy });
  }
  out.push(pointAlong(line, b));
  return out;
}

function turnedAwayRoute(map: ClubMap, room: Equipment): Waypoint[] | null {
  const gate = nearestEntrance(map, room) ?? placedRooms(map).find((e) => e.kind === "entrance") ?? null;
  if (!gate) return null;
  const outside = outsideCellOf(map, gate);
  const door = centerOf(gate);
  const t = 0.45; // 扉の手前で止まる割合
  return [
    { ...outside },
    { gx: outside.gx + (door.gx - outside.gx) * t, gy: outside.gy + (door.gy - outside.gy) * t },
  ];
}

/**
 * 施設全体のクォータービュー画面（メイン）。
 * 08:00〜20:00 の時間割で該当クラスが来て自動練習し、帰る。
 * 育成ロジック（sim/）はそのまま利用し、表示層のみを担う。
 */
export class FacilityScene extends Phaser.Scene {
  private state!: GameState;
  private rng!: Phaser.Math.RandomDataGenerator;
  private clock!: GameClock;

  private world!: Phaser.GameObjects.Container;
  private shimmerG!: Phaser.GameObjects.Graphics;
  private shimmers: Shimmer[] = [];
  /** きらめきを描き直すまでの溜め（秒）。 */
  private shimmerAccum = 0;
  /** 湯気（風呂・サウナ）。きらめきと同じ間隔で描き直す。 */
  private steamG!: Phaser.GameObjects.Graphics;
  private steams: Steam[] = [];
  private marker!: Phaser.GameObjects.Ellipse;
  private equipLayer!: Phaser.GameObjects.Container;
  /** 建物そのもの（床・壁・什器）。配置が変わったら作り直すので個別に持っておく。 */
  private staticObjects: Phaser.GameObjects.GameObject[] = [];
  /** 前回描いたマップの署名（変化したら描き直す）。 */
  private mapSig = "";
  /** パネルを開いている間に、深度の並べ替えを1回だけ済ませたか。 */
  private worldDirty = false;
  /** ピンチズームで使う、前フレームの指の間隔。 */
  private pinchDist = 0;
  /** カメラ（倍率と表示位置）。ドラッグで見て回れる。 */
  private zoom: number = CAMERA.defaultZoom;
  private camX = 0;
  private camY = 0;
  /** ドラッグ中だったか（ドラッグの終わりで選手を開いてしまわないように）。 */
  private dragMoved = false;
  /** 開発中の見た目確認オプション（?dev=facility…）。本番では常に null。 */
  private dev: ReturnType<typeof devView> = null;
  /** 車道を行き交う車。 */
  private traffic?: TrafficLayer;

  /** 職員（コーチ＋受付スタッフ）。 */
  private staff: StaffPerson[] = [];
  private coachStaff = new Map<number, StaffPerson>();
  /** コーチをどのプールへ送ったか（担当替えに気づくために覚えておく）。 */
  private coachPool = new Map<number, number>();
  /** どの会議室へ送ったか（研究班の部屋が変わったときだけ歩かせる）。 */
  private coachMeeting = new Map<number, number>();
  private cleanTimer = 0;
  /** コーチの持ち場を見直す間隔（秒）。毎フレーム見ると重いので間引く。 */
  private dutyTimer = 0;
  /** 【開発時だけ】向きの調査ログを出す間隔（→ dev/devProbe.ts）。 */
  private probeTimer = 0;

  private people: Person[] = [];
  private personById = new Map<number, Person>();
  /** 今この瞬間に練習しているクラス（複数プールなら複数。重複なし）。 */
  private activeClasses: ClassId[] = [];
  private activeSig: string | undefined = undefined; // undefined=未初期化
  /** クラスごとの「使っているプール」。変わったクラスだけを並べ直すために覚えておく。 */
  private activePoolSig = new Map<ClassId, string>();
  /** クラスごとの「今のコマの顔ぶれ」。替わったら並べ直す（スクールはコマごとに別の子が来る）。 */
  private activeMemberSig = new Map<ClassId, string>();
  /**
   * 今のコマで実際に練習している選手（クラスごと）。
   * 練習の適用・解散の処理は、クラス全員ではなく**このコマの顔ぶれ**に対して行う
   * （コマを2つ入れても、1人が2回練習することはない）。
   */
  private lessonMembers = new Map<ClassId, Student[]>();
  /** 一般客。 */
  private visitors: Visitor[] = [];
  /** 能力の伸びを▲で見せるための端数（選手×能力ごと）。演出だけの値。 */
  private tickAccum = new Map<string, number>();
  /** 回復設備を使い始めたときに出す「♨ +体力」の予約（選手ID → 回復量）。 */
  private recoveryFx = new Map<number, { energy: number }>();
  /** 入れずに帰った客が何人続いたか／前に案内を出した時刻（案内を出しすぎないため）。 */
  private turnedAwayRun = 0;
  private turnedAwayNoticeAt = -1e9;
  /**
   * 混雑で入れなかった客のうち、まだ怒りマークを出していないぶん。
   * 湧いた瞬間には姿がまだ無いので、次のフレームで割り当てる。
   */
  private pendingAngry: { roomId: number; kind: RoomKind }[] = [];
  /** もう怒りマークを出した客（同じ人に何度も出さない）。 */
  private readonly angryShown = new Set<Visitor>();
  /**
   * 【部屋の前の行列】並んでいる客（姿を出せたぶん）。キーは sim の行列番号。
   *   line … 扉の手前から入口へ向かって逆にたどる道（並ぶ位置はこの上に取る）
   *   d    … いま立っている（向かっている）位置の、扉からの距離（マス）
   *   tail … 扉から部屋の中までの道（順番が来たらここを歩く）
   */
  private readonly guestLines = new Map<
    number,
    { visitor: Visitor; room: Equipment; a: GuestArrival; line: Waypoint[]; d: number; tail: Waypoint[]; gate: Cell }
  >();

  // 練習中の「+1」演出 と お祝いの演出
  private gainPopups!: GainPopupLayer;
  private celebrate!: CelebrationLayer;
  private readonly onGain = (s: Student, key: StatKey, amount: number): void => this.showGain(s, key, amount);

  // ---- 賑わいの演出（吹き出し・満足度・時間帯）----
  /** 頭上の吹き出し（セリフ・気持ち）。 */
  private bubbles!: SpeechBubbleLayer;
  /** 頭上の★ゲージ（満足度）。 */
  private moodGauges!: MoodGaugeLayer;
  /** 頭上の疲れマーク（体力が減った選手・スクール生）。 */
  private fatigueMarks!: FatigueMarkLayer;
  /** 疲れマークの相手を選び直すまでの残り秒（位置合わせは毎フレーム）。 */
  private fatigueAccum = 0;
  /** 次に吹き出しを出すか試すまでの残り秒。 */
  private chatterTimer = 0;
  /**
   * 誰が最後にいつしゃべったか（実時間ミリ秒）。
   * 同じ人が続けてしゃべると人形芝居に見えるので、間隔を空ける。
   */
  private readonly chatterAt = new Map<string, number>();
  /** 時間帯の色を重ねる幕（画面いっぱい。HUD より奥）。 */
  private ambientVeil?: Phaser.GameObjects.Rectangle;
  /** 敷地の外だけに掛ける幕（夜でも館内は明るい → buildAmbient）。 */
  private outdoorVeil?: Phaser.GameObjects.Rectangle;
  /** 敷地のかたち。幕を内と外に分けるマスクとしてだけ使う（表示しない）。 */
  private landShapeG?: Phaser.GameObjects.Graphics;
  /** 夜に灯る館内の照明（床の上・人より奥）。 */
  private lightsG?: Phaser.GameObjects.Graphics;
  /** 前に描いた照明の明るさ（変わったときだけ描き直す）。 */
  private lightDrawn = -1;
  /** 前に反映した時間帯（HUD の表示を切り替える判断に使う）。 */
  private ambientMinute = -1;
  /** クラブ全体の満足度（HUD の★ゲージ）。 */
  private clubStars?: StarMeter;
  private clubMoodAccum = 0;
  /** ★ゲージを付けっぱなしにしている選手のID（選び直したら付け替える）。 */
  private stickyMoodFor?: number;

  // HUD
  private dateText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private classText!: Phaser.GameObjects.Text;
  private popText!: Phaser.GameObjects.Text;
  private clubText!: Phaser.GameObjects.Text;
  /** クラブの格ゲージ（次の格まであといくつ）。 */
  private clubGauge?: Gauge;
  /** 「今月の一手」の1行（→ sim/advice.ts）。 */
  private adviceText?: Phaser.GameObjects.Text;
  private adviceIcon?: Phaser.GameObjects.Text;
  /** その行を押したときの行き先。 */
  private adviceGo: Advice["go"] = undefined;
  /** 注目選手（★）の小さな札。 */
  private readonly pinChips: {
    chip: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    id: number;
  }[] = [];
  private pinHint?: Phaser.GameObjects.Text;
  /** 在籍数（データ選択画面の「在籍◯名」と同じ数字）。 */
  private memberText?: Phaser.GameObjects.Text;
  private gauge!: Gauge;
  private speedBtns: Button[] = [];

  // フッターのメニュー（矢印で開け閉めできる）
  /** メニューを開いているか。閉じると細い帯になり、施設が広く見える。 */
  private footerOpen = true;
  /** 情熱ゲージ（HUD 3段目）。特別練習の燃料 → config/balance の PASSION。 */
  private passionGauge?: Gauge;
  /** 直前に見せた情熱。増えたぶんを演出に回すために持つ。 */
  private passionShown = -1;
  /** まだ演出に出していない増分（客1人ぶんは小さいので、溜めてから1回出す）。 */
  private passionPending = 0;
  /** フッターの下地（開閉で描き直す）。 */
  private footerBg!: Phaser.GameObjects.Graphics;
  /** 開いているときだけ出すもの（人気度・システム・時間送り・8つのボタン）。 */
  private footerMenu!: Phaser.GameObjects.Container;
  /** 開いていても閉じていても出すもの（矢印・速度）。 */
  private footerBar!: Phaser.GameObjects.Container;
  private footerToggle!: Button;
  /** 建設・配置モードのパネルが出ているか（メニューを引っ込める判断に使う）。 */
  private footerOverlayActive = false;

  // モーダル / 注目選手
  private panel?: StudentPanel;
  private roster?: RosterModal;
  private camp?: CampModal;
  private coachModal?: CoachModal;
  private staffModal?: StaffModal;
  /** 施設で職員をタップしたときの詳細カード。 */
  private personCard?: PersonCardModal;
  /** 昇格先のクラスを選ぶ画面（育成Bが定員でも上のクラスへ上げられるように）。 */
  private promotePicker?: PickerModal<ClassId>;
  /** タイトルへ戻る途中か（時間を止める）。 */
  private exiting = false;
  /** 寮の管理画面（寮の部屋をタップすると開く）。 */
  private dormModal?: DormModal;
  private roomInfo?: RoomInfoModal;
  private compModal?: CompetitionEntryModal;
  /** 主要大会の出場確認（開催の2週間前に自動で出る）。 */
  private confirmModal?: MeetConfirmModal;
  /** 開催日のレースを順に泳いでいる最中か（会場を開いている間は次の確認を出さない）。 */
  private racing = false;
  /** 会場で「全結果へ」が押された（残りのレースはアニメーション無しで泳ぐ）。 */
  private skipAllRaces = false;
  /** その日に泳いだレースの結果（「全結果へ」のあとの一覧に出す）。 */
  private raceLog: RaceSummaryRow[] = [];
  private raceSummary?: RaceSummaryModal;
  /** 説明書（→ openManual）。 */
  private manualModal?: ManualModal;
  /** 会場が閉じるのを待って runNextRace を呼び直す予約があるか。 */
  private raceRetry = false;
  private eventModal?: EventListModal;
  private systemModal?: SystemModal;
  private settingsModal?: SettingsModal;
  private confirmDialog?: ConfirmDialog;
  private shopModal?: FacilityShopModal;
  private reportModal?: MonthlyReportModal;
  private practiceModal?: ClassPracticeModal;
  private cardModal?: PlayerCardModal;
  /** 「ほかの選手とくらべる」で開く一覧。 */
  private rivalPicker?: PickerModal<number>;
  /** 引退の振り返り。 */
  private retireModal?: RetireRecapModal;
  private specialModal?: SpecialTrainingModal;
  private researchModal?: ResearchModal;
  private timetableModal?: TimetableModal;
  /** 建設モード（道の敷設・部屋の移設の入口）。開いている間はゲーム内時間を止める。 */
  private build?: BuildOverlay;
  /** 配置モード（買った部屋・動かす部屋の置き場所を決める）。 */
  private placement?: PlacementOverlay;
  /**
   * 建設・配置モードでいま指が触れている画面座標（離していれば null）。
   * ステージの端に近いと、update() がカメラを送って画面外にも手が届くようにする。
   */
  private dragPointer: { x: number; y: number } | null = null;
  /** ステージ右上のズームボタンの範囲（ここへのタップは施設の操作にしない）。 */
  private zoomBtnZone: Phaser.Geom.Rectangle | null = null;

  /** 重さの計測表示（開発中だけ）。 */
  private perf: PerfMeter | null = null;

  // 自動イベントの通知
  private notices!: NoticeFeed;
  private selected?: Person;
  private panelRefreshAccum = 0;
  /** HUD に今出している文字列（変わったときだけ setText するための控え）。 */
  private readonly hudCache = new Map<string, string>();
  private hudLineAccum = 0;
  /** 「今月の一手」と注目選手の更新間隔（重いので1秒に1回）。 */
  private hudSlowAccum = 0;
  /**
   * 詳細画面の ◀▶ が辿る並び（＝いま見ている一覧）。
   * 名簿から開いたらそのクラスの並び、プールでタップしたらその子のクラスの並び。
   */
  private browseList: Student[] = [];
  /** コーチ画面を開いた時点の担当の並び（チュートリアルの進行判定に使う）。 */

  // セーブ
  private slot = 1;
  private playTimeMs = 0;
  private lastSavedAt: number | null = null;
  private saving = false;

  constructor() {
    super("Facility");
  }

  create(init: Partial<FacilityInit> = {}): void {
    applyRenderScale(this); // 論理540×960のまま、画素だけ細かく描く（→ gfx/renderScale.ts）
    // タイトル → ゲーム を何度も往復するので、持ち物はすべて作り直す。
    this.people = [];
    this.personById = new Map();
    this.shimmers = [];
    this.steams = [];
    this.speedBtns = [];
    this.staff = [];
    this.coachStaff = new Map();
    this.coachPool = new Map();
    this.coachMeeting = new Map();
    this.staticObjects = [];
    this.traffic = undefined;
    this.mapSig = "";
    this.cleanTimer = 0;
    this.dutyTimer = 0;
    this.hudCache.clear(); // 前回の表示が残っていると初回に setText されない
    this.hudLineAccum = 0;
    this.zoom = CAMERA.defaultZoom;
    this.dragMoved = false;
    this.pinchDist = 0;
    this.activeClasses = [];
    this.activeSig = undefined;
    this.activePoolSig = new Map();
    this.activeMemberSig = new Map();
    this.lessonMembers = new Map();
    this.exiting = false;
    this.visitors = [];
    this.turnedAwayRun = 0;
    this.turnedAwayNoticeAt = -1e9;
    this.pendingAngry = [];
    this.angryShown.clear();
    this.tickAccum = new Map();
    this.recoveryFx = new Map();
    this.chatterTimer = 0;
    this.chatterAt.clear();
    this.ambientVeil = undefined;
    this.outdoorVeil = undefined;
    this.landShapeG = undefined;
    this.lightsG = undefined;
    this.lightDrawn = -1;
    this.ambientMinute = -1;
    this.clubStars = undefined;
    this.clubMoodAccum = 0;
    this.stickyMoodFor = undefined;
    this.selected = undefined;
    this.panel = undefined;
    this.roster = undefined;
    this.camp = undefined;
    this.coachModal = undefined;
    this.compModal = undefined;
    this.eventModal = undefined;
    this.systemModal = undefined;
    this.settingsModal = undefined;
    this.confirmDialog = undefined;
    this.shopModal = undefined;
    this.reportModal = undefined;
    this.practiceModal = undefined;
    this.cardModal = undefined;
    this.promotePicker = undefined;
    this.researchModal = undefined;
    this.timetableModal = undefined;
    this.roomInfo = undefined;
    this.build = undefined;
    this.specialModal = undefined;
    this.placement = undefined;
    this.dragPointer = null;
    this.zoomBtnZone = null;
    this.perf = null;
    this.panelRefreshAccum = 0;
    this.saving = false;
    this.racing = false;
    this.raceRetry = false;
    this.skipAllRaces = false;
    this.raceLog = [];
    this.raceSummary = undefined;
    this.confirmModal = undefined;

    this.slot = init.slot ?? 1;
    this.dev = devView();
    this.rng = new Phaser.Math.RandomDataGenerator([Date.now().toString()]);
    this.state = new GameState(() => this.rng.frac(), { clubName: init.clubName });
    this.clock = new GameClock();
    this.clock.minuteOfDay = OPEN_MINUTE; // 営業開始（幼児スクール）から始める
    this.playTimeMs = 0;
    this.lastSavedAt = null;

    if (init.data) {
      // つづきから：全状態をセーブデータで上書きする
      applySave(init.data, this.state, this.clock);
      this.playTimeMs = init.data.playTimeMs ?? 0;
      this.lastSavedAt = init.data.savedAt ?? null;
    } else {
      this.clock.setSpeed(settings().defaultSpeed);
    }

    // 開発の見た目確認（&full=1）：部屋を全種類建てた状態から始める
    if (this.dev?.full) buildShowcase(this.state);
    // 開発の見た目確認（&rot=1）：回した部屋の床・壁・什器・レーンを確かめる
    if (this.dev?.rotate) rotateShowcase(this.state);

    this.cameras.main.setBackgroundColor(COLORS.sky);

    this.buildWorld();
    this.rebuildStaff();
    // 時間帯の色は施設の上・HUD の下に重ねる（→ buildAmbient）
    this.buildAmbient();
    // 「+1」演出は画面座標のレイヤに置く（ワールドは縮小表示のため文字が潰れる）
    this.gainPopups = new GainPopupLayer(this, this.add.container(0, 0).setDepth(1900));
    // 吹き出し・★ゲージも同じ理由で画面座標。持ち主の頭の上へ毎フレーム合わせ直す
    this.bubbles = new SpeechBubbleLayer(this, this.add.container(0, 0).setDepth(1880));
    this.moodGauges = new MoodGaugeLayer(this, this.add.container(0, 0).setDepth(1870));
    // 疲れマークは★ゲージより手前（体力切れは「気づかせたい」情報なので隠れないように）
    this.fatigueMarks = new FatigueMarkLayer(this, this.add.container(0, 0).setDepth(1875));
    this.celebrate = new CelebrationLayer(this);
    this.buildHud();
    this.buildFooter();

    this.buildZoomButtons();
    this.notices = new NoticeFeed(this);
    this.perf = createPerfMeter(this);
    this.perf.watch(this.world);

    this.syncActiveClass(true);
    this.refreshHud();
    // 開発の見た目確認では、暗転が残ったまま撮れてしまうので即座に明ける
    this.cameras.main.fadeIn(this.dev ? 0 : 240, 0, 0, 0);

    // 新規ゲームは開始時点で枠を確保しておく（データ選択画面にすぐ出るように）。
    // 見た目確認で起動したときは、遊んでいるデータを上書きしないよう保存しない。
    if (!init.data && !this.dev) void this.doSave();

    this.prewarmScreens();
    this.applyDevView();
  }

  /**
   * 開発中の見た目確認用（?dev=facility&zoom=… / &hud=0）。
   * 本番ビルドでは devView() が null を返すので、何もしない。
   */
  private applyDevView(): void {
    if (!this.dev) return;
    const focused = placedRooms(this.map()).find((e) => e.kind === this.dev?.focus);
    if (focused) {
      this.zoom = this.dev.zoom === "fit" ? this.fitLandScale() : (this.dev.zoom ?? this.zoom);
      const c = centerOf(focused);
      this.focusOn(c.gx, c.gy);
    } else if (this.dev.zoom != null) {
      // fit は「建物ぜんぶが入る」倍率。fitScale() は外の飾り帯まで含むので、ここでは使わない。
      this.zoom = this.dev.zoom === "fit" ? this.fitLandScale() : this.dev.zoom;
      const land = landBounds(this.map());
      this.focusOn((land.x0 + land.x1 + 1) / 2, (land.y0 + land.y1 + 1) / 2);
    }
    this.stockClassForDev();
    this.pinForDev();
    this.markLeavingForDev();
    this.warmUpForDev();
    this.tireOutForDev(); // 体力は空回しのあとに減らす（コマの切れ目の回復で戻ってしまうため）
    this.hideHudForDev();
    this.seatDinersForDev();
    this.openScreenForDev();
    // 読み込んだ時点で開催日を過ぎたレース・まだ出していない出場確認があれば、画面ができてから片付ける
    this.time.delayedCall(900, () => this.checkMeets());
    this.probeTapForDev();
  }

  /**
   * 【開発の見た目確認】`&pin=3` で注目選手（★）を付けておく。
   * 始めたばかりのデータには★が1つも無いので、HUD の5段目が空のまま撮れてしまう。
   * 育ったクラスから順に選ぶ（プロ→選手→…）＝札に出る格と自己ベストが埋まっている子。
   */
  /**
   * 【開発の見た目確認】`&leave=2` で「来月で退会」の予告を付けておく。
   * 本来は年度の変わり目にしか付かないので、12ヶ月進めないと印の絵が撮れない。
   */
  private markLeavingForDev(): void {
    if (!import.meta.env.DEV || !this.dev?.leave) return;
    let left = this.dev.leave;
    for (const s of this.state.students.gakudo) {
      if (left <= 0) return;
      s.leaveAtMonth = this.state.monthCount + 1;
      left--;
    }
  }

  private pinForDev(): void {
    if (!import.meta.env.DEV || !this.dev?.pin) return;
    let left = this.dev.pin;
    for (const c of [...CLASS_ORDER].reverse()) {
      for (const s of this.state.students[c.id]) {
        if (left <= 0) return;
        if (!this.state.togglePin(s).pinned) continue;
        left--;
        /**
         * 始めたばかりのデータは**誰も泳いだことがない**ので、札の末尾が学年になり、
         * 「種目つきの自己ベスト」が1枚も撮れない。★を付けた子にだけ、
         * 得意種目の予想タイムを自己ベストとして置いておく（見た目の確認専用）。
         */
        if (s.bestTimeSec <= 0) {
          s.bestTimeEvent = { stroke: s.fav.stroke, distance: s.fav.distance };
          s.bestTimeSec = predictTime(s, s.bestTimeEvent);
        }
      }
    }
  }

  /**
   * 【設備タップの調査】`&probe=tap` で、部屋の壁の高いところに触れたときに
   * どの設備が拾われるかを全部屋ぶん出す。
   * 「× で閉じたのに別の設備が映る」「壁を触っても何も出ない」を追うための調査。
   */
  private probeTapForDev(): void {
    if (!import.meta.env.DEV || probeKind() !== "tap") return;
    const rooms = placedRooms(this.map());
    for (const mul of [0.7, 1.4]) {
      let ok = 0;
      let ng = 0;
      for (const r of rooms) {
        const f = roomSize(r);
        const w = isoToWorld((r.gx as number) + f.w / 2, (r.gy as number) + 0.15);
        const sx = w.x * this.zoom + this.camX;
        const sy = w.y * this.zoom + this.camY - WALL_H.back * mul * this.zoom;
        const hit = this.roomAtScreen(sx, sy);
        if (hit?.id === r.id) ok++;
        else {
          ng++;
          probeLife("tap", `NG 壁の高さ×${mul} ${r.kind} -> ${hit ? hit.kind : "（何も出ない）"}`);
        }
      }
      probeLife("tap", `壁の高さ×${mul}: OK=${ok} NG=${ng}`);
    }
    // 情報パネルを開いているあいだ、ステージのタップを止められているか
    const target = rooms.find((r) => r.kind !== "entrance");
    if (target) {
      this.openRoomInfo(target);
      probeLife("tap", `パネルを開いた: anyModalOpen=${this.anyModalOpen()}`);
      this.roomInfo?.destroy();
      this.roomInfo = undefined;
      probeLife("tap", `パネルを閉じた: anyModalOpen=${this.anyModalOpen()}`);
    }
  }

  /**
   * 【開発の検証】空回しの前に、指定クラスへ人を移しておく（?stock=ikuseiB:8）。
   * 育成以上は開始時に誰も居ないので、1日回して体力や伸びを見るにはこれが要る。
   * 時間割にもそのクラスのコマを入れ、コーチを割り当てる。
   */
  private stockClassForDev(): void {
    const spec = this.dev?.stock;
    if (!spec) return;
    const [clsRaw, nRaw] = spec.split(":");
    const want = CLASS_ORDER.find((c) => c.id === clsRaw)?.id;
    if (!want) return;
    const n = Math.max(1, Math.min(24, Number(nRaw) || 8));
    for (let i = 0; i < n; i++) {
      const from = CLASS_ORDER.map((c) => this.state.students[c.id]).find(
        (list) => list.length > 0 && list[0].classId !== want,
      );
      if (!from) break;
      const s = from.shift()!;
      s.classId = want;
      s.grade = "高1";
      this.state.students[want].push(s);
    }
    // 時間割をそのクラスだけにして、コマを3つ入れる
    const pool = this.state.equipment.find((e) => e.gx != null && (e.kind === "pool6" || e.kind === "pool8"));
    if (pool) {
      this.state.timetable = [];
      for (let i = 0; i < 3; i++) this.state.setTimetableEntry(pool.id, i, want, null);
      this.state.autoAssignCoaches();
    }
  }

  /**
   * 【開発の見た目確認】食堂・カフェの席に人を座らせる（?dine=1）。
   * 実際の賑わいは「練習が終わった選手がたまに寄る」で作られるので、
   * 絵を撮りたいときだけ、その場に居る人を席に着かせる。
   */
  private seatDinersForDev(): void {
    if (!this.dev?.dine) return;
    let seated = 0;
    for (const p of this.people) {
      if (seated >= 6) break;
      if (this.mealStopFor(p, true)) seated++;
    }
  }

  /** 【開発の見た目確認】全員の体力を減らす（?dev=facility&tired=0.2）。疲れマークの確認用。 */
  private tireOutForDev(): void {
    const ratio = this.dev?.tired ?? -1;
    if (ratio < 0) return;
    for (const c of CLASS_ORDER) {
      for (const s of this.state.students[c.id]) s.energy = energyMax(s) * ratio;
    }
  }

  /**
   * 【開発の見た目確認】起動直後に指定の画面を開く（?dev=facility&open=panel:senshu）。
   *
   * 文字の重なり・見切れは、実際に開いた絵を撮らないと分からない。
   * 本編と同じ入口（openStudent / openCard）を通すので、撮れる絵は遊んだときと同じになる。
   */
  private openScreenForDev(): void {
    const spec = this.dev?.open;
    if (!spec) return;
    const [what, cls] = spec.split(":");
    // 説明書（?open=manual、:数字 でその章へ飛ぶ）
    if (what === "manual") {
      this.onSystem();
      this.openManual();
      if (cls) (this.manualModal as unknown as { jump(i: number): void } | undefined)?.jump(Number(cls));
      return;
    }
    // 配置モード（?open=place:gym）。設備を買って置くときの画面を撮る
    if (what === "place") {
      const kind = isEquipmentKind(cls) ? cls : "gym";
      this.state.gems = 999999;
      this.beginPlacement({ kind, existing: null, cost: this.state.equipmentCost(kind), moving: false });
      return;
    }
    // 主要大会の出場確認（?open=confirm）／エントリー中のレースが並んだ大会画面（?open=entries）。
    // 高校生の選手を男女4人そろえて、5月第1週（地区予選（高校）の2週間前）にしておく
    if (what === "confirm" || what === "entries") {
      const all = CLASS_ORDER.flatMap((c) => this.state.students[c.id]);
      const pick = [all.find((s) => s.gender === "f"), all.find((s) => s.gender === "m"), ...all]
        .filter((s, i, a): s is Student => !!s && a.indexOf(s) === i)
        .slice(0, 4);
      for (const s of pick) {
        this.state.students[s.classId] = this.state.students[s.classId].filter((x) => x !== s);
        s.classId = "senshu";
        s.grade = "高2";
        this.state.students.senshu.push(s);
      }
      this.state.gems = 999999;
      this.state.month = 5;
      this.state.dayCount -= this.state.dayCount % 4;
      this.clock.week = 1;
      if (what === "confirm") {
        const comp = competitionById("hi_area");
        if (comp) this.openMajorConfirm(comp);
      } else {
        const boys = pick.filter((s) => s.gender === pick[0].gender);
        this.state.reserveTimeTrial(boys, kirokukaiOf(this.state.month, 0), { ...boys[0].fav });
        // 出場確認は自動で出さない（大会画面の「📣 出場確認」の並びを撮るため）
        for (const c of this.state.majorsNeedingConfirm()) this.state.markConfirmAsked(c.id);
        this.onCompetitions();
      }
      return;
    }
    // 大会の会場（?open=meet／小学生なら ?open=meet:kid）。泳者の向き・泳ぎの絵を確かめるのに使う。
    // 素材が左向きの女子と右向きの男子を混ぜて出し、全員がゴールのほうを向いているかを見る
    if (what === "meet") {
      const all = CLASS_ORDER.flatMap((c) => this.state.students[c.id]);
      const pick = [all.find((s) => s.gender === "f"), all.find((s) => s.gender === "m"), ...all]
        .filter((s, i, a): s is Student => !!s && a.indexOf(s) === i)
        .slice(0, 4);
      for (const s of pick) {
        this.state.students[s.classId] = this.state.students[s.classId].filter((x) => x !== s);
        s.classId = "senshu";
        s.grade = cls === "kid" ? "小4" : "高1";
        this.state.students.senshu.push(s);
      }
      this.state.gems = 999999;
      const comp = this.state.competitionsForClub()[0];
      if (comp && pick.length > 0) this.enterMeet(pick, comp, { stroke: "back", distance: 50 });
      return;
    }
    /**
     * メドレーリレーの会場（?open=relay／?open=relay:solo＝自クラブ1人だけ）。
     * 本編では 10月の日本選手権で 100m を優勝しないと出られないので、
     * ここでは日本代表の記録を直に持たせて会場を開く。
     */
    if (what === "relay") {
      const strokes: Stroke[] = cls === "solo" ? ["back"] : ["back", "breast", "fly", "free"];
      this.state.month = 12;
      this.state.gems = 999999;
      this.state.students.pro = [];
      strokes.forEach((stroke, i) => {
        const s = createStudent(() => Math.random(), 9700 + i, "pro");
        s.gender = "m";
        s.grade = "大2";
        s.fav = { stroke, distance: RELAY_DISTANCE };
        for (const k of STAT_KEYS) s.stats[k] = 93;
        s.strokeProf[stroke] = 900;
        s.season = {
          year: this.state.year,
          clearedStages: [stageEventKey(RELAY_SOURCE_COMP, { stroke, distance: RELAY_DISTANCE })],
          standards: [],
          standardEvents: [],
        };
        this.state.students.pro.push(s);
      });
      this.enterRelay();
      return;
    }
    /**
     * 世界大会の会場（?open=world）。相手が外国の選手（国つきの名前）になる。
     */
    if (what === "world") {
      const comp = CALENDAR.find((c) => c.id === "hi_sekai")!;
      this.state.month = comp.month;
      this.state.gems = 999999;
      this.state.students.senshu = [];
      const ev: RaceEvent = { stroke: "free", distance: cls === "long" ? 1500 : 100 };
      const pick: Student[] = [];
      for (let i = 0; i < 2; i++) {
        const s = createStudent(() => Math.random(), 9800 + i, "senshu");
        s.gender = "m";
        s.grade = "高3";
        s.fav = { ...ev };
        for (const k of STAT_KEYS) s.stats[k] = 78;
        s.strokeProf.free = 780;
        s.season = {
          year: this.state.year,
          clearedStages: [stageEventKey("hi_national", ev)],
          standards: [],
          standardEvents: [],
        };
        this.state.students.senshu.push(s);
        pick.push(s);
      }
      this.enterMeet(pick, comp, ev);
      return;
    }
    const want = CLASS_ORDER.find((c) => c.id === cls)?.id;
    let target: Student | undefined;
    for (const c of CLASS_ORDER) {
      const list = this.state.students[c.id];
      if (list && list.length > 0) {
        target = list[0];
        if (c.id === want) break;
      }
    }
    if (!target) return;
    // 開始直後は幼児・学童しかいない。指定のクラスの絵を撮るために移しておく
    // （全体練習の画面は名簿を出すので、1人だけだと確かめられない）
    const move = what === "practice" ? 8 : 1;
    if (want) {
      for (let i = 0; i < move; i++) {
        const from = CLASS_ORDER.map((c) => this.state.students[c.id]).find(
          (list) => list.length > 0 && list[0].classId !== want,
        );
        if (!from) break;
        const s = from.shift()!;
        s.classId = want;
        this.state.students[want].push(s);
      }
      target = this.state.students[want][0] ?? target;
    }
    // 【見た目確認】泳法の熟練度を積んだ状態にする（横棒バーの絵を撮る）
    const pf = this.dev?.prof ?? -1;
    if (pf >= 0) {
      const spread = [1, 0.72, 0.45, 0.9];
      CORE_STROKES.forEach((k, i) => {
        target!.strokeProf[k] = Math.min(pf * spread[i], strokeCapOf(target!, k));
      });
    }
    // 【見た目確認】能力をそろえた選手にする（レーダーが枠いっぱいのときの絵を撮る）
    const st = this.dev?.stats ?? -1;
    if (st >= 0) {
      for (const k of STAT_KEYS) target.stats[k] = st;
    }
    // 特別練習の画面（?open=special:senshu）。文字の重なりを確かめるのに使う
    if (what === "special") {
      this.state.passion = 999;
      this.state.gems = 999999;
      this.openSpecialTraining(target);
      return;
    }
    if (what === "card") {
      // 【見た目確認】成長の履歴をでっち上げる（?hist=1）。
      // 始めたばかりのデータには「過去の自分」が無く、重ね表示の絵が撮れないため
      if (this.dev?.hist) {
        target.history = [0.55, 0.7, 0.85].map((r, i) => ({
          year: Math.max(1, this.state.year - 3 + i),
          grade: ["小2", "小3", "小4"][i],
          stats: Object.fromEntries(STAT_KEYS.map((k) => [k, target!.stats[k] * r])) as Record<StatKey, number>,
        }));
      }
      this.openCard(target);
      if (this.dev?.tab) this.cardModal?.showTab(this.dev.tab);
      // 比較を入れた状態で開く（?cmp=first／?cmp=rival）
      if (this.dev?.cmp === "first") this.cardModal?.setCompare(0);
      if (this.dev?.cmp === "rival") {
        const other = CLASS_ORDER.flatMap((c) => this.state.students[c.id]).find((x) => x.id !== target!.id);
        if (other) this.cardModal?.setCompare(other);
      }
      if (this.dev?.scroll) this.cardModal?.scrollBy(this.dev.scroll);
      return;
    }
    if (this.dev?.rest && want) this.state.restClass(want);
    // 昇格先の選択画面を出す（?dev=facility&open=promote:gakudo）
    if (what === "promote") {
      this.openStudent(target);
      this.time.delayedCall(20, () => this.onPromote(target!));
      return;
    }
    // スクールへ戻すときの確認を出す（?dev=facility&open=demote:ikuseiB）。
    // 文言が長いので、折り返しと高さを実際の絵で確かめる
    if (what === "demote") {
      this.openStudent(target);
      this.time.delayedCall(20, () => this.onDemote(target!));
      return;
    }
    // 引退の振り返り（?open=retire:pro）。演出の絵を撮るのに使う
    if (what === "retire") {
      target.strokeProf.free = 880;
      target.wins = 12;
      target.rankTier = 6;
      target.achievePoints = 1800;
      target.bestTimeSec = 51.24;
      target.bestTimeEvent = { stroke: "free", distance: 100 };
      this.showRetireRecap(this.state.retireStudent(target, true));
      return;
    }
    // 合宿の画面（?open=camp＝行き先の一覧／?open=camp:alt＝高地の設定つき選手選び）。
    // 文字の大きさと折り返しは、実際に開いた絵を撮らないと分からない。
    if (what === "camp") {
      this.onCamp();
      if (cls === "alt") this.camp?.devPickPhase("altitude");
      return;
    }
    // イベント一覧（?open=events＝イベントタブ／?open=events:campaign＝キャンペーンタブ）
    if (what === "events") {
      this.onEvents();
      if (cls === "campaign") this.eventModal?.devShowCampaign();
      return;
    }
    /**
     * そのまま開くだけの画面（文字の重なり・見切れを撮るため）。
     * どれも本編と同じ入口を通すので、撮れる絵は遊んだときと同じ。
     */
    const plain: Record<string, (() => void) | undefined> = {
      timetable: () => this.onTimetable(),
      coach: () => {
        this.onCoach();
        if (cls === "recruit") this.coachModal?.devShowRecruit();
      },
      shop: () => {
        this.onShop();
        if (this.dev?.scroll) this.shopModal?.devScrollBy(this.dev.scroll);
      },
      staff: () => this.onStaff(),
      research: () => this.onResearch(),
      system: () => this.onSystem(),
      settings: () => this.onSettings(),
      build: () => this.onBuild(),
    };
    const open = plain[what];
    if (open) {
      open();
      return;
    }
    // 大会の申し込み画面（?open=comp）。標準記録の並びを確かめるのに使う
    if (what === "comp") {
      this.onCompetitions();
      this.compModal?.devSelectFirst();
      return;
    }
    if (what === "room") {
      const room = placedRooms(this.map()).find((e) => e.kind === (cls || "pool6"));
      if (room) this.openRoomInfo(room);
      return;
    }
    if (what === "roster") {
      // ?open=roster:pinned は★だけの一覧（?pin=3 と一緒に使う）
      if (cls === "pinned") this.onRosterPinned();
      else this.onRoster(target);
      return;
    }
    if (what === "practice") {
      this.onClassPractice(want);
      if (this.dev?.press) this.practiceModal?.devOpenFirstCard();
      if (this.dev?.scroll) this.practiceModal?.scrollBy(this.dev.scroll);
      return;
    }
    this.openStudent(target);
    if (this.dev?.scroll) this.panel?.scrollBy(this.dev.scroll);
  }

  /**
   * 【開発の見た目確認】起動直後に時間を進める。
   *
   * 生徒は入口から歩いて持ち場に向かうので、始めた瞬間の絵には誰もいない。
   * ヘッドレスのブラウザは1コマぶんの delta が大きく飛ぶうえ、
   * update() は1コマ 60ms で頭打ちにしているため、放っておいても時間が進まない。
   * そこで **決まった刻みで update を回して** 進める。撮れる絵は、
   * 実際にその時間まで遊んだときと同じになる。
   */
  private warmUpForDev(): void {
    const sec = this.dev?.warmSeconds ?? 0;
    if (sec <= 0) return;
    const step = 50;
    for (let t = 0; t < sec * 1000; t += step) this.update(t, step);
  }

  /**
   * HUD・フッター・通知はすべて深度 1500 以上に置いてある（施設は 0 以下）。
   * 施設だけを画面いっぱいに見たいので、その帯ごと隠す。
   * フッターは開閉のたびに表示を戻すので、update から毎フレーム押さえる。
   */
  private hideHudForDev(): void {
    if (!this.dev?.hideHud) return;
    for (const o of this.children.list) {
      const img = o as Phaser.GameObjects.Image;
      // 【モーダルまで隠さない】prewarmScreens で先に作ってある画面（名簿・選手詳細…）は
      // もう表示リストに居るので、深さだけで消すと open= で開いても出てこなくなる。
      // HUD は 1500〜2300 の間に置いてあるので、そこだけを対象にする。
      if (typeof img.depth === "number" && img.depth >= 1500 && img.depth < 2400 && img.visible) img.setVisible(false);
    }
  }

  /**
   * 重い画面を、動き出したあとに1つずつ先に作っておく。
   *
   * 名簿・設備・コーチ・選手詳細はそれぞれ Text を数十〜100個作るので、
   * 初めて開くときだけどうしても止まる。プレイヤーが施設を眺めている数秒のうちに
   * 1つずつ作っておけば、実際に開くときは「隠していたものを出すだけ」になる。
   * 作るだけで表示はしない（どの画面も作った直後は隠れている）。
   */
  private prewarmScreens(): void {
    const steps: (() => void)[] = [
      () => this.ensureRoster(),
      () => {
        if (!this.panel) this.panel = new StudentPanel(this, () => this.closePanel());
      },
      () => this.ensureShopModal(),
      () => this.ensureCoachModal(),
    ];
    steps.forEach((make, i) => this.time.delayedCall(900 + i * 450, make));
  }

  update(time: number, delta: number): void {
    this.syncBgm(delta);
    this.hideHudForDev();
    this.tireOutForDev(); // ?tired=… のときだけ。休憩で戻るので毎フレーム押さえる
    this.playTimeMs += delta;
    const realDt = Math.min(delta, 60) / 1000;
    const dt = realDt * this.clock.speed;
    const t = time / 1000;

    // システム/設定/設備/収支レポートを開いている間は時間を止める。
    // 育成パネルなどゲーム中のモーダルは、練習の進みを見せたいので止めない。
    const menuOpen =
      this.exiting || // タイトルへ戻る途中は進めない
      !!this.compModal || // 大会を選んでいる間
      !!this.confirmModal || // 主要大会の出場確認を読んでいる間
      !!this.eventModal || // イベントを選んでいる間
      !!this.camp || // 合宿の相談中
      !!this.dormModal ||
      !!this.roomInfo ||
      !!this.personCard ||
      !!this.specialModal || // 特別練習の結果を読んでいる間
      !!this.rivalPicker ||
      !!this.retireModal ||
      !!this.promotePicker ||
      !!this.raceSummary ||
      !!this.manualModal ||
      !!this.systemModal ||
      !!this.settingsModal ||
      !!this.shopModal?.isOpen() ||
      !!this.reportModal ||
      !!this.practiceModal ||
      !!this.researchModal ||
      !!this.timetableModal ||
      !!this.build ||
      !!this.placement;
    const res = menuOpen
      ? { dayRolled: false, weekToMonth: false, minutesAdvanced: 0 }
      : this.clock.tick(delta);
    if (res.dayRolled) this.onDayRolled(res.weekToMonth);

    this.syncActiveClass(false);

    // 自動練習：今走っているコマのクラスに、進んだゲーム分を渡す（上昇したら「+1」を出す）
    if (res.minutesAdvanced > 0) {
      // 練習は「今のコマの顔ぶれ」にだけ効く（コマを2つ入れても1人が2回練習しない）
      for (const cls of this.activeClasses) {
        this.state.tickPractice(cls, res.minutesAdvanced, this.onGain, this.lessonMembers.get(cls));
      }
      // 空きコマの部屋には一般客が来る（動線が悪いと辿り着けずに帰る）
      this.pollGuests(res.minutesAdvanced);
    }
    // 見物客（観客席・プールサイド）。見た目だけなので実時間で回す
    this.pollSpectators(realDt);
    this.gainPopups.update(realDt);
    this.celebrate.update(realDt);
    // 時間帯（画面の色味と館内照明）。時刻が変わったときだけ塗り直す
    this.syncAmbient();

    // 自動発生イベント（入会・コンディション・コーチの一言・小ネタ）
    if (res.minutesAdvanced > 0) {
      for (const ev of this.state.pollAutoEvents(res.minutesAdvanced)) this.pushNotice(ev);
      // 追い込みすぎて練習中に故障した選手を知らせる（まれ）
      for (const inj of this.state.takeTrainingInjuries()) {
        this.notices.push({
          icon: "🩹",
          title: `${inj.student.name} が故障`,
          detail: `疲れているのに追い込みすぎた（${weeksLabel(inj.days)}ほど練習を休む）。休養させるか、コマを減らそう`,
          color: "#e74c3c",
        });
      }
    }
    this.notices.update(realDt);

    // 人物更新（済んだら除去）
    for (const p of this.people) {
      p.update(dt, t);
      // 回復設備を使い終わったら帰す（帰り道はマップから引く）
      if (p.finishedRecovery) this.sendHome(p);
    }
    // 回復設備に入った瞬間の演出（♨ と戻った体力）
    this.showRecoveryFx();
    this.people = this.people.filter((p) => {
      if (p.done) {
        if (this.selected === p) this.clearSelection();
        // 「誰が画面に出ているか」の記録も一緒に消す（残すと次に来たとき並べられない）
        if (this.personById.get(p.student.id) === p) this.personById.delete(p.student.id);
        return false;
      }
      return true;
    });

    // 一般客：入口から歩いて来て、使って帰る
    this.updateVisitors(dt, t);

    // 職員：コーチはコーチ室↔プールサイドを行き来し、たまに掃除に出る
    for (const s of this.staff) s.update(dt, t);
    // 【開発時だけ】職員の様子（?probe=life）
    if (import.meta.env.DEV && probeKind() === "life") {
      this.probeTimer -= realDt;
      if (this.probeTimer <= 0) {
        this.probeTimer = 1.0;
        this.staff.forEach((sp, i) => {
          const g = sp.gridPos();
          const room = this.roomOfCell(g);
          probeLife("staff", `#${i} ${sp.debugState()} room=${room ? room.kind : "-"}`);
        });
        // 「水の上に立っている人」を洗い出す（プールの中に入ってしまう不具合の追跡）
        const onWater = (g: { gx: number; gy: number }): boolean => {
          const f = floorKindAt(this.map(), Math.round(g.gx), Math.round(g.gy));
          return f === "water"; // 湯船（bathWater）は浸かるのが正しいので除く
        };
        for (const sp of this.staff) {
          if (onWater(sp.gridPos())) probeLife("onWater", `staff ${sp.debugState()}`);
        }
        for (const v of this.visitors) {
          const g = v.gridPos();
          if (onWater(g)) probeLife("onWater", `guest at=(${g.gx.toFixed(1)},${g.gy.toFixed(1)}) room=${this.roomOfCell(g)?.kind ?? "-"} overWater=${(() => { const r = this.roomOfCell(g); return r && isPool(r.kind) ? isOverPoolWater(r, g) : "-"; })()}`);
        }
      }
    }
    // 【開発時だけ】向き・モーションの実機調査（?probe=walk）
    if (import.meta.env.DEV && probeKind() === "walk") {
      this.probeTimer -= realDt;
      if (this.probeTimer <= 0) {
        this.probeTimer = 1.0;
        probeLog("walk", [
          ...this.people.map((p) => p.debugFacing()),
          ...this.visitors.map((v) => v.debugFacing()),
          ...this.staff.map((sp) => sp.debugFacing()),
        ]);
      }
    }
    // 建物の外：車道の車。ゲーム内の時間で走るので、速度を上げれば車も速くなる
    this.traffic?.update(dt);
    if (!menuOpen) {
      this.pollCleaning(realDt);
      // 掃除・指導が終わったコーチをコーチ室へ戻す。
      // 毎フレーム見る必要はない（担当は時間割で決まっていて、変わるのは数十秒に一度）。
      this.dutyTimer -= realDt;
      if (this.dutyTimer <= 0) {
        this.dutyTimer = 0.4;
        this.syncCoachDuty();
      }
    }

    // 建設・配置モード：指がステージの端に近ければ、カメラを送って画面外にも手が届くようにする
    this.autoPanWhileDragging(realDt);
    this.refreshFooterVisibility();

    // パネルを開いている間は、その裏で動いている見た目の処理を止める。
    // 水面のきらめきは毎フレーム Graphics を描き直し、深度の並べ替えも毎フレーム走るので、
    // スマホではこの2つがそのままパネル操作の重さになる。
    const covered = this.anyModalOpen();
    if (!covered) {
      // きらめきは Graphics を描き直すので、毎フレームではなく間引く（見た目は変わらない）
      this.shimmerAccum += realDt;
      if (this.shimmerAccum >= SHIMMER_INTERVAL) {
        this.shimmerAccum = 0;
        this.drawShimmer(t);
      }
      this.world.sort("depth");
      this.worldDirty = false;
    } else if (!this.worldDirty) {
      // 閉じたときに並び順が崩れていないよう、1回だけ並べ直しておく
      this.world.sort("depth");
      this.worldDirty = true;
    }
    // 賑わいの演出（吹き出し・★ゲージ）。画面が塞がっている間は動かさない。
    if (!covered) {
      this.pollChatter(realDt);
      this.syncSelectedMood();
    }
    const view = { x0: 0, y0: HUD_H, x1: GAME_WIDTH, y1: this.stageBottom() };
    this.bubbles.update(realDt, this.toScreen, view);
    this.moodGauges.update(realDt, this.toScreen, view);
    // 疲れマーク：誰に出すかは間引いて選び直し、位置合わせだけ毎フレーム
    this.fatigueAccum += realDt;
    if (this.fatigueAccum >= FATIGUE_MARK.refreshSec) {
      this.fatigueAccum = 0;
      this.syncFatigueMarks();
    }
    this.fatigueMarks.update(t, this.toScreen, view);
    // クラブ全体の満足度（HUD の★）。全員を平均するので毎フレームは見ない
    this.clubMoodAccum += realDt;
    if (this.clubMoodAccum >= CLUB_MOOD_INTERVAL) {
      this.clubMoodAccum = 0;
      this.clubStars?.setValue(this.state.clubMood());
    }
    this.clubStars?.update(realDt);

    this.updateMarker(t);
    this.updatePinch();

    // HUD は毎フレーム state から引き直す（＝画面ごとに古い数字が残らない）。
    // 変化が無ければ setText を呼ばないので、実質ただの比較。
    this.refreshHudValues();
    // 「練習中」の行は割り当ての計算が要るので間引く
    this.hudLineAccum += realDt;
    if (this.hudLineAccum >= 0.35) {
      this.hudLineAccum = 0;
      this.refreshClassLine();
    }
    /**
     * 「今月の一手」と注目選手はもっと重い（案内は時間割の成立判定を丸ごと回す）。
     * どちらも秒単位で変わるものではないので、1秒に1回で足りる。
     */
    this.hudSlowAccum += realDt;
    if (this.hudSlowAccum >= 1) {
      this.hudSlowAccum = 0;
      this.refreshAdvice();
      this.refreshPins();
    }
    this.perf?.update(realDt);

    // 開いているパネルを自動練習に合わせてライブ更新（閉じている間は何もしない）
    if (this.panel?.isOpen()) {
      this.panelRefreshAccum += realDt;
      if (this.panelRefreshAccum >= 0.35) {
        this.panelRefreshAccum = 0;
        this.panel.refresh();
      }
    }
  }

  // ---------------------------------------------------------------- ワールド構築

  /** 今のマップ（部屋＋道）。 */
  private map(): ClubMap {
    return this.state.map();
  }

  private addStatic(obj: Phaser.GameObjects.GameObject): void {
    this.world.add(obj);
    this.staticObjects.push(obj);
  }

  private buildWorld(): void {
    this.world = this.add.container(0, 0);

    this.marker = this.add
      .ellipse(0, 0, TILE_W * 0.55, TILE_H * 0.85, 0xffffff, 0)
      .setStrokeStyle(2, 0xf7dc6f, 1)
      .setVisible(false);
    this.world.add(this.marker);

    // 購入した器具・アイテム（建物とは別に、置き換えだけで更新できるようにしておく）
    this.equipLayer = this.add.container(0, 0);
    this.world.add(this.equipLayer);

    // 車道を行き交う車（建物とは別に持つ。動くので焼き付けられない）
    this.traffic = new TrafficLayer(this, this.world);

    this.buildStatic();
    this.refreshEquipment();
    // 既定は「寄り」。入口まわりが中央に来るように置いてから、ドラッグで見て回れるようにする。
    this.zoom = CAMERA.defaultZoom;
    const gate = placedRooms(this.map()).find((e) => e.kind === "entrance");
    const focus = gate ? centerOf(gate) : { gx: CAMERA.focus.gx, gy: CAMERA.focus.gy };
    this.focusOn(focus.gx, focus.gy);
    this.input.addPointer(1); // ピンチ用に2本目の指を有効にする
    this.setupCameraInput();
  }

  /**
   * 敷地そのもの（地面・道・部屋の床・壁・什器）を作る。
   * 部屋を建てた／動かしたときは、ここだけ作り直す（人物や器具はそのまま）。
   */
  private buildStatic(): void {
    for (const o of this.staticObjects) o.destroy();
    this.staticObjects = [];
    this.shimmers = [];
    this.steams = [];

    const map = this.map();
    this.mapSig = mapSignature(map);
    // 1マスずつ描くのは「買ってある敷地＋外周＋余白1マス」だけ。
    // その外は建物の外（駐車場）なので、タイル1枚の敷き詰め（buildGrass）で埋める。
    // こうしておくと、マップを 37×37 に広げても焼く絵の大きさは土地なりで済む。
    const b = groundCells(map);

    this.buildGrass();

    // 水面のきらめきだけは動くので Graphics のまま持つ（水面のマスぶんだけなので軽い）
    this.shimmerG = this.add.graphics().setDepth(-850_000);
    this.addStatic(this.shimmerG);
    // 湯気は人より手前に出す（湯に浸かっている人の背中を、もやが横切るように見せる）。
    // 部屋名の札（ROOM_LABEL_DEPTH）よりは奥に置いて、札は必ず読めるようにする。
    this.steamG = this.add.graphics().setDepth(ROOM_LABEL_DEPTH - 1000);
    this.addStatic(this.steamG);

    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

    // 地面（床・目地・部屋の輪郭・レーンロープ・敷居）は動かないので、
    // 一度だけ描いて1枚の絵に焼き付ける（→ bakeGround の説明）。
    this.bakeGround((g) => {
      // --- 床（マスごとに色と目地を変える）---
      for (let gy = b.minY; gy <= b.maxY; gy++) {
        for (let gx = b.minX; gx <= b.maxX; gx++) {
          const kind = floorKindAt(map, gx, gy);
          const st = roomStyle(kind);
          const p = isoToWorld(gx, gy);
          // 市松でタイルの目を出す（水面は横縞にしてレーンが見えるように）
          // 外気浴のウッドデッキも板を並べたいので、横縞（＝板の向き）にする
          const alt =
            kind === "water" || kind === "bathWater" || kind === "openair"
              ? gy % 2 === 0
              : (gx + gy) % 2 === 0;
          g.fillStyle(alt ? st.alt : st.base, 1);
          g.beginPath();
          g.moveTo(p.x, p.y - hh);
          g.lineTo(p.x + hw, p.y);
          g.lineTo(p.x, p.y + hh);
          g.lineTo(p.x - hw, p.y);
          g.closePath();
          g.fillPath();
          // 目地（薄く。これがあると奥行きが分かる）
          g.lineStyle(1, st.line, 0.45);
          g.strokePath();

          // 【スタジオ】フローリング。板は gx の向き（画面の右下がり）に張り、1マスを3枚に割る。
          // 板の色は行（gy）で決めるので、隣のマスへ同じ板がつながって見える。
          // 板の端の継ぎ目はマスごとにずらして、千鳥に張ったように見せる。
          if (kind === "studio") {
            const at = (u: number, v: number): { x: number; y: number } => ({
              x: p.x + (u - v) * hw,
              y: p.y - hh + (u + v) * hh,
            });
            for (let k = 0; k < 3; k++) {
              const a = at(0, k / 3);
              const b2 = at(1, k / 3);
              const c = at(1, (k + 1) / 3);
              const d = at(0, (k + 1) / 3);
              g.fillStyle((gy * 3 + k) % 2 === 0 ? st.base : st.alt, 1);
              g.beginPath();
              g.moveTo(a.x, a.y);
              g.lineTo(b2.x, b2.y);
              g.lineTo(c.x, c.y);
              g.lineTo(d.x, d.y);
              g.closePath();
              g.fillPath();
              // ワックスがけの照り（板の奥の縁に細く）
              g.lineStyle(1, 0xfff1d6, 0.3);
              g.lineBetween(a.x, a.y + 1, b2.x, b2.y + 1);
              // 板どうしの継ぎ目
              g.lineStyle(1, st.line, 0.55);
              g.lineBetween(d.x, d.y, c.x, c.y);
              // 板の端（千鳥にずらす）
              const u = [0.22, 0.58, 0.86][(gx + gy * 2 + k) % 3];
              const e0 = at(u, k / 3);
              const e1 = at(u, (k + 1) / 3);
              g.lineStyle(1, st.line, 0.4);
              g.lineBetween(e0.x, e0.y, e1.x, e1.y);
            }
          }

          // 建物の外は路面標示（駐車枠の白線・車道のセンターライン）を引く
          if (!isIndoorFloor(kind)) this.drawOutdoorMark(g, map, gx, gy, kind, p);

          // --- 天井照明の落ちる光 ---
          // 屋内であることを床だけで伝えるための表現。4マスおきに、
          // 明かりのたまりを一回り小さい菱形で重ねる（焼き付けるので毎フレームの負担は0）。
          // 屋外（駐車場）と水面には落とさない。
          if (isIndoorFloor(kind) && kind !== "water" && kind !== "bathWater" && gx % 4 === 1 && gy % 4 === 1) {
            // サウナは天井照明ではなく、ストーブの熱で全体が赤みを帯びる
            g.fillStyle(kind === "sauna" ? 0xffb066 : 0xfff6d5, kind === "sauna" ? 0.2 : 0.16);
            g.beginPath();
            g.moveTo(p.x, p.y - hh * 0.78);
            g.lineTo(p.x + hw * 0.78, p.y);
            g.lineTo(p.x, p.y + hh * 0.78);
            g.lineTo(p.x - hw * 0.78, p.y);
            g.closePath();
            g.fillPath();
          }

          // 【湯船】お湯の質感。プールの水より「濁りのない浅い透明感」を出したいので、
          // マスの内側にひとまわり明るい菱形を重ねて、深さの階調を作る。
          if (kind === "bathWater") {
            g.fillStyle(0x8fe3f2, 0.22);
            g.beginPath();
            g.moveTo(p.x, p.y - hh * 0.6);
            g.lineTo(p.x + hw * 0.6, p.y);
            g.lineTo(p.x, p.y + hh * 0.6);
            g.lineTo(p.x - hw * 0.6, p.y);
            g.closePath();
            g.fillPath();
          }

          if (kind === "water" || kind === "bathWater") {
            this.shimmers.push({
              x: p.x + (this.rng.frac() - 0.5) * hw,
              y: p.y + (this.rng.frac() - 0.5) * hh,
              len: 6 + this.rng.frac() * 10,
              phase: this.rng.frac() * Math.PI * 2,
              speed: 1.2 + this.rng.frac() * 1.6,
            });
          }
        }
      }

      // --- 部屋・道の外周に濃い輪郭を引く（床だけで境界が分かるように）---
      for (let gy = b.minY; gy <= b.maxY; gy++) {
        for (let gx = b.minX; gx <= b.maxX; gx++) {
          const kind = floorKindAt(map, gx, gy);
          if (kind === "grass") continue;
          const st = roomStyle(kind);
          const p = isoToWorld(gx, gy);
          const differs = (dx: number, dy: number): boolean => {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < b.minX || nx > b.maxX || ny < b.minY || ny > b.maxY) return true;
            return floorKindAt(map, nx, ny) !== kind;
          };
          g.lineStyle(2, st.edge, 0.75);
          if (differs(1, 0)) g.lineBetween(p.x, p.y + hh, p.x + hw, p.y); // 右下
          if (differs(0, 1)) g.lineBetween(p.x - hw, p.y, p.x, p.y + hh); // 左下
          if (differs(-1, 0)) g.lineBetween(p.x - hw, p.y, p.x, p.y - hh); // 左上
          if (differs(0, -1)) g.lineBetween(p.x, p.y - hh, p.x + hw, p.y); // 右上
        }
      }

      // --- プールのレーンロープ ---
      // 回したプールはロープが縦に走るので、両端の位置を結んで点を打つ
      for (const pool of placedRooms(map)) {
        if (!isPool(pool.kind)) continue;
        for (const rope of laneRopesOf(pool)) {
          const dx = rope.to.gx - rope.from.gx;
          const dy = rope.to.gy - rope.from.gy;
          const len = Math.hypot(dx, dy);
          let toggle = 0;
          for (let s = 0; s <= len + 1e-6; s += 0.3) {
            const k = len > 0 ? s / len : 0;
            const p = isoToWorld(rope.from.gx + dx * k, rope.from.gy + dy * k);
            g.fillStyle(toggle % 2 === 0 ? 0xe74c3c : 0xf4f6f7, 1);
            g.fillCircle(p.x, p.y, 1.7);
            toggle++;
          }
        }
      }

      // --- 出入口の敷居（部屋と道が接しているマス）---
      for (const c of doorMarks(map)) {
        const p = isoToWorld(c.gx, c.gy);
        g.fillStyle(0xf3e2c0, 0.75);
        g.beginPath();
        g.moveTo(p.x, p.y - hh * 0.6);
        g.lineTo(p.x + hw * 0.6, p.y);
        g.lineTo(p.x, p.y + hh * 0.6);
        g.lineTo(p.x - hw * 0.6, p.y);
        g.closePath();
        g.fillPath();
      }
    });

    /**
     * 【レーン番号は描かない】（2026-09-24）
     * 水面に 1〜6 の数字を薄く重ねていたが、ドット絵の水の上に等幅の数字が乗ると
     * **そこだけ別の絵**に見えて、施設の絵を濁していた。
     * どのレーンが何番かは、大会の掲示板（コース番号）で分かれば足りる。
     */

    // --- 壁（セル境界に立つ薄板）---
    // 奥（部屋の北辺・西辺）は高く、手前（南辺・東辺）は低く描いて中を見せる。
    // 板はマスを占有しないので、部屋の中身は全部見える。
    // 建物の外壁（敷地をぐるりと囲む）＋部屋ごとの壁。
    // 外壁があって初めて「屋根のある施設の中」に見える。
    for (const w of [...buildingWallEdges(map), ...wallEdgesOf(map)]) {
      if (w.kind === "none") continue;
      const key = wallTextureKey(w.dir, w.kind, w.front);
      if (!this.textures.exists(key)) continue;
      const origin = WALL_ORIGINS[key] ?? { x: 0.5, y: 1 };
      // 壁が立つのは「そのセルのダイヤの上頂点」＝セル境界の始点
      const p = isoToWorld(w.gx, w.gy);
      const img = this.add
        .image(p.x, p.y - TILE_H / 2, key)
        .setOrigin(origin.x, origin.y)
        .setTint(w.tint ?? roomStyle(w.facing).wall)
        // 壁はそのセルの中身より奥（LAYER.wall < LAYER.facility）
        .setDepth(depthFor(w.gx, w.gy, LAYER.wall));
      this.addStatic(img);
    }

    this.buildSteam(map);
    this.buildRoomFurniture(map);
    this.buildEntranceDoors(map);
    this.buildStrandedMarks(map);
    // 敷地を買い足すと車道の輪が外へ広がるので、車も並べ直す
    this.traffic?.rebuild(map, TRAFFIC_CARS);
    this.applyCamera();
  }

  /**
   * 【建物の外】路面標示を1マスぶん描く（地面の絵に焼き付ける）。
   *
   *   車道 … 上り下りの車線のあいだに黄色の破線（センターライン）
   *
   * 等角の菱形では「gx方向 = (+hw, +hh)」「gy方向 = (-hw, +hh)」なので、
   * 線をこの2方向に引くかぎり、路面に貼り付いたまま見える。
   */
  private drawOutdoorMark(
    g: Phaser.GameObjects.Graphics,
    map: ClubMap,
    gx: number,
    gy: number,
    kind: FloorKind,
    p: { x: number; y: number },
  ): void {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    // 建物のどちら側の帯か。区画線・センターラインは建物の辺と平行に並べる
    const alongX = outsideAxis(map, gx, gy) === "y";
    const dir = alongX ? { x: hw, y: hh } : { x: -hw, y: hh };
    const cross = alongX ? { x: -hw, y: hh } : { x: hw, y: hh };

    if (kind === "street" && outsideRing(map, gx, gy) === OUTSIDE_BANDS.street - 1) {
      // センターライン（黄色の破線）。
      // 車は内回り（この列）と外回り（1つ外の列）を走るので、
      // 線はその**あいだ**＝このマスの外向きの辺に沿って引く。
      const land = landBounds(map);
      const out = alongX ? (gy > land.y1 ? 1 : -1) : gx > land.x1 ? 1 : -1;
      const mid = { x: p.x + (cross.x * out) / 2, y: p.y + (cross.y * out) / 2 };
      g.lineStyle(3, 0xe6c23c, 0.8);
      g.lineBetween(mid.x - dir.x * 0.34, mid.y - dir.y * 0.34, mid.x + dir.x * 0.34, mid.y + dir.y * 0.34);
    }
  }

  // ---------------------------------------------------------------- 地面の焼き付け

  /** 地面の絵が覆う範囲（ワールド座標）。線の太さぶんだけ外に余裕を持たせる。 */
  private groundBounds(): { x: number; y: number; w: number; h: number } {
    const b = groundCells(this.map());
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const pad = 4;
    const x = (b.minX - b.maxY) * hw - hw - pad;
    const y = (b.minX + b.minY) * hh - hh - pad;
    const right = (b.maxX - b.minY) * hw + hw + pad;
    const bottom = (b.maxX + b.maxY) * hh + hh + pad;
    return { x, y, w: Math.ceil(right - x), h: Math.ceil(bottom - y) };
  }

  /**
   * 地面を一度だけ描いて、絵（RenderTexture）に焼き付ける。
   *
   * **なぜ必要か**：Phaser の Graphics は描いた結果を絵として持たず、
   * 毎フレーム描画命令をぜんぶ最初からやり直す。26x26マスの床をそのまま
   * Graphics で持つと 1フレームあたり2万個の命令と800回以上の多角形分割が走り、
   * スマホでは操作できないほど重くなる（perfcheck.ts で数えられる）。
   * 焼いてしまえば、毎フレームの仕事は「四角い絵を1〜数枚貼る」だけになる。
   *
   * 焼けない端末（テクスチャを作れないなど）では、これまでどおり Graphics のまま残す。
   * 重いが表示は変わらないので、遊べなくなることはない。
   */
  private bakeGround(draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics();
    draw(g);

    const made: Phaser.GameObjects.RenderTexture[] = [];
    try {
      for (const c of bakeChunks(this.groundBounds())) {
        const rt = this.add.renderTexture(c.x, c.y, c.w, c.h).setOrigin(0, 0).setDepth(-1_000_000);
        rt.draw(g, -c.x, -c.y);
        made.push(rt);
      }
    } catch {
      for (const rt of made) rt.destroy();
      made.length = 0;
    }

    if (made.length > 0) {
      for (const rt of made) this.addStatic(rt);
      g.destroy();
    } else {
      g.setDepth(-1_000_000);
      this.addStatic(g);
    }
  }

  /**
   * 【建物の外】まだ買っていない土地＝隣の駐車場・道路。
   *
   * **屋内スイミングクラブなので、ここに芝生は敷かない。**
   * 菱形のタイルは「幅TILE_W × 高さTILE_H」でぴたりと繰り返すので、
   * 2×2マスぶんの舗装の絵を1枚だけ作って TileSprite で敷き詰める。
   * どれだけマップが広くても**絵は1枚・描画も1回**なので、広さの代償が無い。
   * 買った敷地の床（焼いた絵）はこの上に重なるので、境目は自然に切り替わる。
   */
  private buildGrass(): void {
    const b = mapWorldBounds();
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const x = (b.minX - b.maxY) * hw - hw;
    const y = (b.minX + b.minY) * hh - hh;
    const w = Math.ceil((b.maxX - b.minY) * hw + hw - x);
    const h = Math.ceil((b.maxX + b.maxY) * hh + hh - y);
    if (!this.textures.exists(GRASS_TEXTURE)) return;

    const grass = this.add
      .tileSprite(x, y, w, h, GRASS_TEXTURE)
      .setOrigin(0, 0)
      .setDepth(-1_100_000);
    // タイルの位相をマスの並びに合わせる（菱形の頂点がマスの角に来るように）
    grass.tilePositionX = ((x % (TILE_W * 2)) + TILE_W * 2) % (TILE_W * 2);
    grass.tilePositionY = ((y % (TILE_H * 2)) + TILE_H * 2) % (TILE_H * 2);
    this.addStatic(grass);

    this.scatterOutdoor();
  }

  /**
   * 芝生の上に木や岩を散らして、のっぺりした緑を壊す。
   *
   * 置き場所はマスの番号から決める（乱数を使わない）ので、
   * 建て直しても同じ景色になる。**数は SCATTER_MAX で頭打ち**にしてある
   * ＝毎フレームの深度ソートの対象が増えすぎないようにするため。
   */
  private scatterOutdoor(): void {
    for (const item of outdoorScatter(this.map(), SCATTER_MAX, SCATTER_BAND)) {
      if (!this.textures.exists(item.texture)) continue;
      const p = isoToWorld(item.gx, item.gy);
      const img = this.add
        .image(p.x + item.ox, p.y + item.oy, item.texture)
        .setOrigin(0.5, 1)
        .setScale(1.1)
        .setDepth(depthFor(item.gx, item.gy, LAYER.furniture));
      this.addStatic(img);
    }
  }

  /**
   * 湯気の発生源を決める（風呂の湯面・サウナのストーブ）。
   *
   * 部屋を建てた／動かしたときにだけ作り直し、描くのは drawSteam（1/30秒ごと）。
   * 湯船は広いので、**1マスおき**に置いて数を抑える。上限は STEAM_MAX。
   */
  private buildSteam(map: ClubMap): void {
    for (const room of placedRooms(map)) {
      if (this.steams.length >= STEAM_MAX) break;
      if (room.kind === "bath") {
        const f = equipmentDef(room.kind).size; // 回す前の向きで数えて roomPoint で置く
        for (let dy = 0; dy < f.h && this.steams.length < STEAM_MAX; dy++) {
          for (let dx = 0; dx < f.w && this.steams.length < STEAM_MAX; dx++) {
            const c = roomPoint(room, dx, dy);
            if (!isBathWaterCell(room, c.gx, c.gy)) continue;
            if ((dx + dy) % 2 !== 0) continue; // 1マスおき
            const p = isoToWorld(c.gx + 0.5, c.gy + 0.5);
            this.steams.push({
              x: p.x,
              y: p.y - 4,
              r: 7 + this.rng.frac() * 4,
              rise: 26 + this.rng.frac() * 10,
              phase: this.rng.frac(),
              speed: 0.22 + this.rng.frac() * 0.12,
              tint: 0xffffff,
            });
          }
        }
      } else if (room.kind === "sauna") {
        // ストーブ（ROOM_FITTINGS の位置）から立ちのぼる、赤みを帯びた熱気
        const stove = roomPoint(room, 0.55, 0.45);
        const p = isoToWorld(stove.gx, stove.gy);
        for (let i = 0; i < 2; i++) {
          this.steams.push({
            x: p.x + (i === 0 ? -5 : 6),
            y: p.y - 22,
            r: 6 + this.rng.frac() * 3,
            rise: 22 + this.rng.frac() * 8,
            phase: this.rng.frac(),
            speed: 0.3 + this.rng.frac() * 0.14,
            tint: 0xffd2a0,
          });
        }
      }
    }
  }

  /**
   * 部屋ごとの什器・備品を置く。位置は部屋からの相対なので、動かせばついてくる。
   */
  private buildRoomFurniture(map: ClubMap): void {
    for (const f of fittingsOf(map)) {
      if (!this.textures.exists(f.texture)) continue;
      const p = isoToWorld(f.cell.gx, f.cell.gy);
      const img = this.add
        .image(p.x, p.y, f.texture)
        .setOrigin(0.5, f.originY ?? 1)
        .setScale(f.scale)
        // 回した部屋の什器は左右反転（並びが鏡に映した形になるので、絵の向きもそろえる）
        .setFlipX(f.flipX === true)
        .setDepth(depthFor((f.depthCell ?? f.cell).gx, (f.depthCell ?? f.cell).gy, f.layer));
      // 切り分けた絵（→ Fitting.crop）。反転した絵でも、切る範囲は元の絵の座標で指定する
      if (f.crop) img.setCrop(f.crop.x, 0, f.crop.w, img.height);
      this.addStatic(img);
    }
  }

  /**
   * 部屋名のラベル。
   *
   * 施設の上に直に文字を乗せると、床の絵と喧嘩して読めない
   *（濃い帯を敷いても、床が暗い部屋では帯そのものが沈む）。
   * そこで**白い角丸の札を、部屋の少し上に浮かせて**出し、
   * 細い脚で部屋とつなぐ。参考画像と同じ見せ方で、床の色を選ばず読める。
   */
  /**
   * 玄関の自動ドア。
   *
   * 外壁は入口の正面**だけ**開けてある（→ buildingWallEdges）。その開口部にガラスの引き戸を立てて、
   * **道 → 車寄せ → 自動ドア → フロント**と一目で辿れるようにする。
   *
   * 壁と同じ幾何で描く（マスの上頂点から、n は右下へ／w は左下へ伸びる辺）。
   * 画像を使わず Graphics で引くのは、**どの辺に付いても必ず辺にぴたりと合う**ようにするため。
   */
  private buildEntranceDoors(map: ClubMap): void {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    for (const d of entranceDoorCells(map)) {
      const p = isoToWorld(d.cell.gx, d.cell.gy);
      // 辺の始点（マスの上頂点）と終点
      const sx = p.x;
      const sy = p.y - hh;
      const ex = d.dir === "n" ? p.x + hw : p.x - hw;
      const ey = p.y;
      // 玄関は**外壁より高く**する。同じ高さだと、ガラスの塀が続いているようにしか見えない。
      const H = d.front ? 52 : 72;

      const g = this.add.graphics().setDepth(depthFor(d.cell.gx, d.cell.gy, LAYER.wall + 1));
      const quad = (t0: number, t1: number, fill: number, alpha: number): void => {
        const ax = sx + (ex - sx) * t0;
        const ay = sy + (ey - sy) * t0;
        const bx = sx + (ex - sx) * t1;
        const by = sy + (ey - sy) * t1;
        g.fillStyle(fill, alpha);
        g.beginPath();
        g.moveTo(ax, ay - H);
        g.lineTo(bx, by - H);
        g.lineTo(bx, by);
        g.lineTo(ax, ay);
        g.closePath();
        g.fillPath();
      };

      // ガラスの引き戸（左右に少し開いている）
      quad(0.02, 0.44, 0xa8dcef, 0.85);
      quad(0.56, 0.98, 0xa8dcef, 0.85);
      // 映り込み
      quad(0.06, 0.2, 0xffffff, 0.35);
      quad(0.6, 0.74, 0xffffff, 0.35);
      // 枠（上端の庇と左右の柱）
      g.lineStyle(3, 0x4a5c68, 1);
      g.lineBetween(sx, sy - H, ex, ey - H);
      g.lineBetween(sx, sy - H, sx, sy);
      g.lineBetween(ex, ey - H, ex, ey);
      // 中央の合わせ目
      g.lineStyle(2, 0x4a5c68, 0.9);
      const mx = sx + (ex - sx) * 0.5;
      const my = sy + (ey - sy) * 0.5;
      g.lineBetween(mx, my - H, mx, my);
      // 庇の色帯（クラブの色）
      g.lineStyle(3, 0xf7dc6f, 0.95);
      g.lineBetween(sx, sy - H + 4, ex, ey - H + 4);
      this.addStatic(g);

      // 敷居（開口部の足元。床の切り替わりをはっきりさせる）
      const sill = this.add.graphics().setDepth(depthFor(d.cell.gx, d.cell.gy, 6));
      sill.fillStyle(0x8f8672, 0.9);
      sill.beginPath();
      sill.moveTo(sx, sy);
      sill.lineTo(ex, ey);
      sill.lineTo(ex + (d.dir === "n" ? -3 : 3), ey + 5);
      sill.lineTo(sx, sy + 5);
      sill.closePath();
      sill.fillPath();
      this.addStatic(sill);
    }
  }

  private buildStrandedMarks(map: ClubMap): void {
    for (const { room, access } of this.state.strandedRooms()) {
      const c = centerOf(room);
      const p = isoToWorld(c.gx, c.gy);
      const t = this.add
        // 部屋名の札（p.y-34 に浮かせてある）とぶつからないよう、さらに上に出す
        .text(p.x, p.y - 74, access.noRoad ? "⚠ 道がない" : "⚠ 行けません", {
          fontFamily: "sans-serif",
          fontSize: "14px",
          color: "#ffffff",
          backgroundColor: "#c0392bee",
          padding: { x: 6, y: 3 },
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(depthFor(c.gx, c.gy, LAYER.overlay));
      this.addStatic(t);
    }
    void map;
  }

  /** 配置が変わっていたら建物を作り直す。 */
  private syncLayout(): boolean {
    const next = mapSignature(this.map());
    if (next === this.mapSig) return false;
    this.buildStatic();
    // 敷地を買うとカメラの動ける範囲も広がるので、位置を取り直す
    //（applyCamera が「夜でも明るい範囲」のマスクも引き直す）
    this.applyCamera();
    return true;
  }

  /**
   * 【廃止】買って置く器具・外構の装飾を描いていた層。
   * 器具は部屋に同梱（グレード）になり、外構は無くしたので、いまは空のまま。
   * 層そのものは残してある（作り直しの手順を変えないため）。
   */
  private refreshEquipment(): void {
    this.equipLayer.removeAll(true);
  }

  // ---------------------------------------------------------------- カメラ（ズームとパン）

  /**
   * カメラが動ける範囲（ワールド座標）。
   *
   * マップの配列は最大の広さ（37×37）で持っているが、そこまで見せると
   * 序盤は延々と芝生の上を彷徨うことになる。**買ってある敷地＋まわりの芝生の帯**
   * までに留めておき、敷地を買い足すと一緒に広がるようにする。
   */
  private worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const land = landBounds(this.map());
    // 見て回れるのは車道まで。その外は「街の続き」なので、カメラを出さない
    const pad = OUTSIDE_BANDS.street;
    const b = {
      minX: Math.max(0, land.x0 - pad),
      maxX: Math.min(MAP.cols - 1, land.x1 + pad),
      minY: Math.max(0, land.y0 - pad),
      maxY: Math.min(MAP.rows - 1, land.y1 + pad),
    };
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    return {
      minX: (b.minX - b.maxY) * hw - hw,
      maxX: (b.maxX - b.minY) * hw + hw,
      minY: (b.minX + b.minY) * hh - WALL_TOP - 12,
      maxY: (b.maxX + b.maxY) * hh + hh + 14,
    };
  }

  /** 全体が画面に収まる倍率。 */
  private fitScale(): number {
    const b = this.worldBounds();
    return Math.min(GAME_WIDTH / (b.maxX - b.minX), this.stageH() / (b.maxY - b.minY));
  }

  /** 建物（買ってある敷地）だけが画面に収まる倍率。開発の見た目確認で使う。 */
  private fitLandScale(): number {
    const land = landBounds(this.map());
    const w = (land.x1 - land.x0 + 1 + (land.y1 - land.y0 + 1)) * (TILE_W / 2);
    const h = (land.x1 - land.x0 + 1 + (land.y1 - land.y0 + 1)) * (TILE_H / 2) + WALL_TOP;
    return Math.min(GAME_WIDTH / (w + 48), GAME_HEIGHT / (h + 48));
  }

  /** 施設が見えている範囲の下端。メニューを閉じるとここが下がる。 */
  private stageBottom(): number {
    return GAME_HEIGHT - this.footerHeight();
  }

  private stageH(): number {
    return this.stageBottom() - HUD_H;
  }

  /**
   * 倍率と表示位置を反映する。
   * 拡大していて全体が入らないときは、はみ出しすぎないように寄せ止める。
   */
  private applyCamera(): void {
    const b = this.worldBounds();
    const s = this.zoom;
    const viewW = GAME_WIDTH;
    const viewH = this.stageH();
    const viewTop = HUD_H;
    const contentW = (b.maxX - b.minX) * s;
    const contentH = (b.maxY - b.minY) * s;

    let px: number;
    if (contentW <= viewW) px = (viewW - contentW) / 2 - b.minX * s;
    else px = Math.min(-b.minX * s, Math.max(viewW - b.maxX * s, this.camX));

    let py: number;
    if (contentH <= viewH) py = viewTop + (viewH - contentH) / 2 - b.minY * s;
    else py = Math.min(viewTop - b.minY * s, Math.max(viewTop + viewH - b.maxY * s, this.camY));

    this.camX = px;
    this.camY = py;
    this.world.setScale(s);
    this.world.setPosition(px, py);
    // 夜の幕のマスク（敷地のかたち）は画面座標で描いてあるので、
    // カメラを動かしたら引き直す（→ drawLandShape）
    this.drawLandShape();
  }

  /** ワールド上のグリッド位置を画面中央に持ってくる。 */
  private focusOn(gx: number, gy: number): void {
    const p = isoToWorld(gx, gy);
    this.camX = GAME_WIDTH / 2 - p.x * this.zoom;
    this.camY = HUD_H + this.stageH() / 2 - p.y * this.zoom;
    this.applyCamera();
  }

  /**
   * 倍率を変える（画面の中心を保ったまま）。
   * ドット絵がにじまないよう CAMERA.zoomStep 単位にスナップする。
   * 「全体マップ」だけは端数を許す（収まりを優先）。
   */
  private setZoom(next: number, focusScreen?: { x: number; y: number }): void {
    const min = Math.min(this.fitScale(), CAMERA.minZoom);
    const snapped = Math.round(next / CAMERA.zoomStep) * CAMERA.zoomStep;
    const z = Math.min(CAMERA.maxZoom, Math.max(min, snapped));
    if (Math.abs(z - this.zoom) < 0.001) return;
    const fx = focusScreen?.x ?? GAME_WIDTH / 2;
    const fy = focusScreen?.y ?? HUD_H + this.stageH() / 2;
    // 画面上の同じ点を見続けるように補正する
    const wx = (fx - this.camX) / this.zoom;
    const wy = (fy - this.camY) / this.zoom;
    this.zoom = z;
    this.camX = fx - wx * z;
    this.camY = fy - wy * z;
    this.applyCamera();
  }

  /** 「全体」と「寄り」を切り替える。 */
  private toggleFit(): void {
    const fit = this.fitScale();
    if (Math.abs(this.zoom - fit) < 0.01) {
      this.zoom = CAMERA.defaultZoom;
      this.focusOn(CAMERA.focus.gx, CAMERA.focus.gy);
    } else {
      this.zoom = fit;
      this.applyCamera();
    }
  }

  /** 画面座標 → マップのマス（建設モードで使う）。 */
  private cellAtScreen(x: number, y: number): { gx: number; gy: number } {
    const wx = (x - this.camX) / this.zoom;
    const wy = (y - this.camY) / this.zoom;
    return worldToCell(wx, wy);
  }

  /**
   * 施設の部屋をタップしたとき。
   * いまは寮だけ（ベッドの並びをタップ＝入寮の管理）。
   * 選手・職員のスプライトは自分でタップを受け取るので、ここには来ない。
   */
  private tapRoomAt(x: number, y: number): void {
    const room = this.roomAtScreen(x, y);
    if (!room) return;
    this.openRoomInfo(room);
  }

  /**
   * 画面のその点に「見えている」部屋。
   *
   * 【高さを考えないと隣の部屋が開く】マスから画面への変換は**床のマス**を返すので、
   * 指が触れたのが壁や屋根だと、その壁を持っている部屋ではなく
   * **その奥のマス**が当たってしまう（＝別の設備の情報が出る）。
   * 壁は画面の上へ伸びているので、触れた点から**下へ少しずつずらしたマス**も見て、
   * 手前（画面の下）にある部屋から先に拾う。
   */
  private roomAtScreen(x: number, y: number): Equipment | null {
    // 0 は床そのもの。以降は壁の高さぶん下へ探る（手前の部屋を優先）
    const offsets = [0, WALL_H.front, WALL_H.back * 0.6, WALL_H.back, WALL_TOP];
    let fallback: Equipment | null = null;
    for (const off of offsets) {
      const cell = this.cellAtScreen(x, y + off * this.zoom);
      const room = this.state.roomAtCell(Math.round(cell.gx), Math.round(cell.gy));
      if (!room) continue;
      // 床を直接触ったときはそれが答え。壁ぶんずらして見つけた部屋は、
      // **その部屋の壁がそこまで届いているか**を確かめてから採用する
      if (off === 0) return room;
      if (!fallback) fallback = room;
    }
    return fallback;
  }

  /**
   * 施設の情報パネル。**部屋名の札を出しっぱなしにするのをやめた代わり**、
   * 部屋をタップしたときにここで名前・説明・いまの数字を見せる。
   * 判定は部屋のマス全体（→ tapRoomAt）。なぞって画面を動かしたときは開かない
   *（呼び出し側が dragMoved を見ている）。
   */
  private openRoomInfo(room: Equipment): void {
    this.roomInfo?.destroy();
    this.roomInfo = new RoomInfoModal(this, this.state, room, {
      onClose: () => {
        this.roomInfo?.destroy();
        this.roomInfo = undefined;
      },
      onOpenShop: () => {
        this.roomInfo?.destroy();
        this.roomInfo = undefined;
        this.onShop();
      },
      onOpenTimetable: () => {
        this.roomInfo?.destroy();
        this.roomInfo = undefined;
        this.onTimetable();
      },
      onOpenDorm: () => {
        this.roomInfo?.destroy();
        this.roomInfo = undefined;
        this.openDorm();
      },
    });
  }

  /** 寮の管理（入寮・退寮）。 */
  private openDorm(): void {
    this.dormModal?.destroy();
    this.dormModal = new DormModal(this, this.state, {
      onChanged: () => this.refreshHud(),
      onClose: () => {
        this.dormModal?.destroy();
        this.dormModal = undefined;
      },
      onOpenStudent: (s) => {
        this.dormModal?.destroy();
        this.dormModal = undefined;
        this.openCard(s);
      },
    });
  }

  /** ステージ上に浮いているボタン（＋／－／⤢）の上か。 */
  private isOverStageUi(x: number, y: number): boolean {
    return !!this.zoomBtnZone && Phaser.Geom.Rectangle.Contains(this.zoomBtnZone, x, y);
  }

  /**
   * 建設・配置モードで、指がステージの端に近いときにカメラを送る。
   *
   * これが無いと「いま画面に映っている範囲」にしか物を置けず、
   * 離れた場所へ部屋を置くことができない。
   * カメラを動かしたら指の下のマスも変わるので、そのぶん操作を続ける
   * （ゴーストは指の下に留まる）。
   */
  private autoPanWhileDragging(dt: number): void {
    const p = this.dragPointer;
    if (!p || (!this.placement && !this.build)) return;

    const { dx, dy } = edgeScrollVector(p.x, p.y, this.stageRect(), CAMERA.edgeScrollMargin);
    if (dx === 0 && dy === 0) return;

    const beforeX = this.camX;
    const beforeY = this.camY;
    this.camX += dx * CAMERA.edgeScrollSpeed * dt;
    this.camY += dy * CAMERA.edgeScrollSpeed * dt;
    this.applyCamera(); // 敷地の外まではスクロールしない（ここで止まる）
    if (this.camX === beforeX && this.camY === beforeY) return;

    const c = this.cellAtScreen(p.x, p.y);
    if (this.placement) {
      this.placement.moveTo(c.gx, c.gy);
    } else if (this.build) {
      this.build.pointerAt(c.gx, c.gy);
      this.build.apply(c.gx, c.gy, true); // 道はそのまま敷き続ける
    }
  }

  /**
   * ゴーストが画面の外にいたら、見えるところまでカメラを寄せる。
   * 配置モードに入った瞬間と、回転で形が変わったときに使う
   * （指でなぞって動かしている最中は、指の下にいるので何もしない）。
   */
  private keepGhostInView(gx: number, gy: number, w: number, h: number): void {
    const world = boundsOf([
      isoToWorld(gx, gy),
      isoToWorld(gx + w, gy),
      isoToWorld(gx + w, gy + h),
      isoToWorld(gx, gy + h),
    ]);
    // ワールド座標 → 画面座標
    const box = {
      left: this.camX + world.left * this.zoom,
      right: this.camX + world.right * this.zoom,
      top: this.camY + world.top * this.zoom,
      bottom: this.camY + world.bottom * this.zoom,
    };
    const { dx, dy } = keepInViewOffset(box, this.stageRect(), CAMERA.keepInViewMargin);
    if (dx === 0 && dy === 0) return;
    this.camX += dx;
    this.camY += dy;
    this.applyCamera();
  }

  /** 施設が見えている範囲（HUDとフッターの間）。 */
  private stageRect(): ViewRect {
    return { left: 0, top: HUD_H, right: GAME_WIDTH, bottom: this.stageBottom() };
  }

  // ---------------------------------------------------------------- 建設モード

  /**
   * 建設モードに入る。
   * マップを直接タップして道を敷き、部屋を置き、動かす。
   * 開いている間はゲーム内時間が止まる（じっくり考えられるように）。
   */
  private onBuild(): void {
    if (this.build) return;
    this.closeShop();
    this.closePanel();
    this.build = new BuildOverlay(this, this.state, this.world, {
      onChanged: () => {
        this.syncLayout();
        this.refreshEquipment();
        this.refreshHud();
      },
      onMessage: (text, color) => this.toast(text, color, 1700, true),
      onBeginPlacement: (room, moving) =>
        this.beginPlacement({
          kind: room.kind,
          existing: room,
          cost: moving ? MAP.moveCost : 0,
          moving: true,
        }),
      onClose: () => this.closeBuild(),
    });
    this.toast("建設モード：端までなぞると画面が動きます", COLORS.textAccent, 2200, true);
  }

  // ---------------------------------------------------------------- 配置モード

  /**
   * 配置モードに入る。
   * 「買ってから置く」も「置いたものを動かす」も、ここを通る。
   * **確定するまで課金しない**（お金を減らすのは onConfirm の中だけ）。
   */
  private beginPlacement(target: PlacementTarget): void {
    this.closePlacementMode();
    this.closeShop();
    this.closePanel();
    // 建設モードから来たときは、終わったら建設モードへ戻す（道具箱に戻れないと不便）
    const returnToBuild = !!this.build;
    this.build?.destroy();
    this.build = undefined;

    // 敷地全体が見えるところまでカメラを引く
    this.zoom = Math.max(CAMERA.minZoom, Math.min(this.zoom, 0.6));
    this.applyCamera();

    this.placement = new PlacementOverlay(this, this.state, this.world, target, {
      onConfirm: (gx, gy, rot) => {
        const ok = this.confirmPlacement(target, gx, gy, rot);
        if (ok && returnToBuild) this.onBuild();
        return ok;
      },
      onCancel: () => {
        this.closePlacementMode();
        this.toast("配置をやめた（お金は減っていません）", COLORS.textDim, 1600, true);
        if (returnToBuild) this.onBuild();
      },
      onMessage: (text, color) => this.toast(text, color, 1700, true),
      // 指でなぞっている最中はゴーストが指の下にいるので、そのときは動かさない
      onGhostMoved: (gx, gy, w, h, byDrag) => {
        if (!byDrag) this.keepGhostInView(gx, gy, w, h);
      },
    });
    // 置きはじめの場所が画面の外なら、まずそこへカメラを寄せる
    const s = this.placement.spot;
    this.keepGhostInView(s.gx, s.gy, s.w, s.h);
    this.toast("端をなぞると画面が動きます", COLORS.textDim, 2200, true);
  }

  /** 「ここに設置」。ここで初めてお金が減る。 */
  private confirmPlacement(target: PlacementTarget, gx: number, gy: number, rot: RoomRot): boolean {
    const label = equipmentDef(target.kind).label;
    let ok = false;
    let reason: string | undefined;

    if (target.existing) {
      const r = this.state.placeRoom(target.existing, gx, gy, target.cost > 0, rot);
      ok = r.ok;
      reason = r.reason;
    } else {
      const r = this.state.buyAndPlaceRoom(target.kind, gx, gy, rot);
      ok = r.ok;
      reason = r.reason;
    }
    if (!ok) {
      this.toast(reason ?? "設置できませんでした", "#e74c3c", 1900, true);
      return false;
    }

    this.closePlacementMode();
    this.syncLayout();
    this.refreshEquipment();
    this.rebuildStaff();
    this.respawnRunning();
    this.refreshHud();
    this.celebrateEvent(target.existing ? `${label} を移設した` : `${label} を設置した！`, "", "#4ade80");
    this.warnStranded();
    this.autoSave("設置のあと");
    return true;
  }

  private closePlacementMode(): void {
    this.placement?.destroy();
    this.placement = undefined;
  }

  private closeBuild(): void {
    if (!this.build) return;
    this.build.destroy();
    this.build = undefined;
    // 配置が変わっているので、人・コーチの道順を作り直す
    this.syncLayout();
    this.refreshEquipment();
    this.rebuildStaff();
    this.respawnRunning();
    this.warnStranded();
    this.refreshHud();
  }

  // ---------------------------------------------------------------- 時間割

  private onTimetable(): void {
    this.openPanel("時間割", () => {
      this.timetableModal?.destroy();
      this.timetableModal = new TimetableModal(this, this.state, {
        onChanged: () => {
          this.respawnRunning();
          this.refreshHud();
        },
        onClose: () => {
          this.timetableModal?.destroy();
          this.timetableModal = undefined;
        },
      });
      });
  }

  /** 画面のドラッグで施設を見て回れるようにする。 */
  private setupCameraInput(): void {
    const stageTop = HUD_H;
    // メニューの開け閉めで下端が動くので、そのつど読む
    const stageBottom = (): number => this.stageBottom();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    // 指の座標は canvas の画素で届くので、論理座標（540×960）に直してから使う（→ gfx/renderScale.ts）
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      const p = logicalPoint(ptr);
      // 画面（モーダル）が開いているあいだは施設を動かさない
      if (this.anyModalOpen() || p.y < stageTop || p.y > stageBottom()) return;
      // ステージ上のズームボタンを押しただけなら、施設は触らない
      if (this.isOverStageUi(p.x, p.y)) return;
      // 配置モード中は、なぞった場所にゴーストがついてくる
      if (this.placement) {
        const c = this.cellAtScreen(p.x, p.y);
        this.placement.moveTo(c.gx, c.gy);
        this.dragPointer = { x: p.x, y: p.y };
        dragging = true;
        lastX = p.x;
        lastY = p.y;
        return;
      }
      // アイテム配置モード中は、ステージのタップが「掴む／置く」の操作になる
      // 建設モード中は、ステージのタップが「敷く／置く」の操作になる
      if (this.build) {
        if (this.build.busy) return; // 敷地の購入確認を開いている間は触らせない
        const c = this.cellAtScreen(p.x, p.y);
        this.build.pointerAt(c.gx, c.gy);
        this.build.apply(c.gx, c.gy, false);
        this.dragPointer = { x: p.x, y: p.y };
        dragging = true; // 道はドラッグで連続して敷ける
        lastX = p.x;
        lastY = p.y;
        return;
      }
      dragging = true;
      this.dragMoved = false;
      lastX = p.x;
      lastY = p.y;
    });
    this.input.on("pointermove", (ptr: Phaser.Input.Pointer) => {
      const p = { ...logicalPoint(ptr), isDown: ptr.isDown };
      if (this.placement) {
        if (!dragging || !p.isDown) return;
        // 指がステージの外（HUD・フッター）へ出たら、そこでいったん追従を止める。
        // 端まで持って行きたいときは、ステージの縁をなぞれば自動でカメラが送られる。
        if (p.y < stageTop || p.y > stageBottom()) {
          this.dragPointer = null;
          return;
        }
        this.dragPointer = { x: p.x, y: p.y };
        const c = this.cellAtScreen(p.x, p.y);
        this.placement.moveTo(c.gx, c.gy);
        return;
      }
      if (this.build) {
        if (this.build.busy || this.anyModalOpen() || p.y < stageTop || p.y > stageBottom()) {
          this.dragPointer = null;
          return;
        }
        const c = this.cellAtScreen(p.x, p.y);
        this.build.pointerAt(c.gx, c.gy);
        if (dragging && p.isDown) {
          this.dragPointer = { x: p.x, y: p.y }; // 端まで来たらカメラが送られる
          this.build.apply(c.gx, c.gy, true);
        } else {
          this.dragPointer = null;
        }
        return;
      }
      if (!dragging || !p.isDown) return;
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.dragMoved = true;
      this.camX += dx;
      this.camY += dy;
      lastX = p.x;
      lastY = p.y;
      this.applyCamera();
    });
    this.input.on("pointerup", (ptr: Phaser.Input.Pointer) => {
      const p = logicalPoint(ptr);
      const wasDragging = dragging;
      dragging = false;
      this.dragPointer = null; // 指を離したらカメラの自動送りも止める
      // アイテム配置モード：指を離したところに置く（動かさずに離したら掴んだまま）
      // なぞっていない＝タップなら、指の下の部屋を開く（今は寮だけ）
      if (
        wasDragging &&
        !this.dragMoved &&
        !this.anyModalOpen() &&
        !this.build &&
        !this.placement &&
        p.y >= stageTop &&
        p.y <= stageBottom() &&
        !this.isOverStageUi(p.x, p.y)
      ) {
        this.tapRoomAt(p.x, p.y);
      }
      // タップ扱いの判定はこのフレーム内で終わるので、次フレームで解除する
      this.time.delayedCall(1, () => {
        this.dragMoved = false;
      });
    });
    this.input.on("wheel", (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const p = logicalPoint(ptr);
      if (this.anyModalOpen() || p.y < stageTop || p.y > stageBottom()) return;
      this.setZoom(this.zoom * (dy > 0 ? 0.9 : 1.1), { x: p.x, y: p.y });
    });
  }

  /**
   * 2本指のピンチでズームする。
   * 指の間隔の変化ぶんだけ倍率を変え、2本指の中点を見続ける。
   */
  private updatePinch(): void {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (this.anyModalOpen() || !p1?.isDown || !p2?.isDown) {
      this.pinchDist = 0;
      return;
    }
    const q1 = logicalPoint(p1);
    const q2 = logicalPoint(p2);
    const dist = Phaser.Math.Distance.Between(q1.x, q1.y, q2.x, q2.y);
    const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
    if (this.pinchDist > 0 && dist > 10) {
      this.setZoom(this.zoom * (dist / this.pinchDist), mid);
    }
    this.pinchDist = dist;
    // ピンチ中は1本指のドラッグ扱いにしない
    this.dragMoved = true;
  }

  /** なにかの画面（モーダル）が開いているか。カメラ操作を止める判定に使う。 */
  /**
   * 何か画面（モーダル）が開いているか。
   *
   * **ここに入れ忘れた画面は、閉じるボタンが効かなくなる。** ステージのタップは
   * pointerdown の時点でこれを見て「施設を触ったか」を決めているので、
   * 一覧から漏れた画面は「× を押す → その pointerup でうしろの設備が開く」
   * ＝閉じたのに別の設備の情報が出た、という見え方になる。画面を足したら必ずここへ。
   */
  private anyModalOpen(): boolean {
    return (
      // 選手詳細・名簿は使い回すので、持っているかではなく「開いているか」で見る
      !!this.panel?.isOpen() ||
      !!this.roster?.isOpen() ||
      !!this.camp ||
      !!this.coachModal?.isOpen() ||
      !!this.compModal ||
      !!this.confirmModal ||
      !!this.eventModal ||
      !!this.systemModal ||
      !!this.settingsModal ||
      !!this.confirmDialog ||
      !!this.shopModal?.isOpen() ||
      !!this.reportModal ||
      !!this.practiceModal ||
      !!this.cardModal ||
      !!this.specialModal ||
      !!this.researchModal ||
      !!this.personCard ||
      !!this.promotePicker ||
      !!this.raceSummary ||
      !!this.manualModal ||
      !!this.dormModal ||
      !!this.roomInfo ||
      !!this.staffModal ||
      !!this.rivalPicker ||
      !!this.retireModal ||
      !!this.timetableModal
    );
  }

  /** ステージ右上のズーム操作（スマホでも確実に触れる手段）。 */
  private buildZoomButtons(): void {
    const x = GAME_WIDTH - 26;
    const y = HUD_H + 24;
    // ここへのタップは「施設を触った」ことにしない（建設・配置モードの誤爆を防ぐ）
    this.zoomBtnZone = new Phaser.Geom.Rectangle(x - 24, y - 20, 48, 128);
    new Button(this, x, y, 36, 32, "＋", () => this.setZoom(this.zoom * 1.25), {
      color: 0x27435c,
      hoverColor: 0x35597a,
      fontSize: 16,
    }).setDepth(1800).setAlpha(0.9);
    new Button(this, x, y + 36, 36, 32, "－", () => this.setZoom(this.zoom * 0.8), {
      color: 0x27435c,
      hoverColor: 0x35597a,
      fontSize: 16,
    }).setDepth(1800).setAlpha(0.9);
    new Button(this, x, y + 72, 36, 32, "⤢", () => this.toggleFit(), {
      color: 0x27435c,
      hoverColor: 0x35597a,
      fontSize: 14,
    }).setDepth(1800).setAlpha(0.9);
  }

  // ---------------------------------------------------------------- 職員（コーチ・受付）

  /**
   * コーチ・受付スタッフ・専門スタッフを配置する。
   * それぞれの持ち場（コーチ室・受付・食堂・ドクタールーム）は
   * プレイヤーが建てて置いた部屋なので、部屋が無ければ入口の前で待機する。
   */
  private rebuildStaff(): void {
    for (const s of this.staff) s.destroy();
    this.staff = [];
    this.coachStaff = new Map();
    // 作り直した職員はコーチ室に立っているので、送り先の記録も捨てる
    // （残すと「もう向かっている」と誤判定して、誰もプールへ出て来なくなる）
    this.coachPool = new Map();
    this.coachMeeting = new Map();

    const map = this.map();
    // 受付スタッフ（緑の制服）
    // 【廃止】受付スタッフは無くした（入口があれば入館できる）

    // コーチ（ポロシャツ＋ジャージ）。1人ずつ髪型・ひげ・メガネ・色が違う。
    this.state.coaches.forEach((c, i) => {
      const seat = this.homeCellFor("coachroom", i, this.state.coaches.length);
      // 見た目は**格とID**で決まる（格が高いほど上級コーチの絵。→ gfx/coachSprites）
      const p = new StaffPerson(
        this,
        this.world,
        "coach",
        staffKey("coach", c.id),
        seat,
        () => {
          if (!this.anyModalOpen()) this.openCoachCard(c.id);
        },
        { quality: c.quality, id: c.id },
      );
      this.staff.push(p);
      this.coachStaff.set(c.id, p);
    });

    /**
     * 【医科学センターの研究員】白衣の2人が、モニタの前と分析台の奥に立っている。
     * 雇う職員ではなく部屋に付いてくる人（給料は維持費に含む）。部屋が空っぽに見えないように。
     */
    this.usableRoomsOf("science").forEach((center, ci) => {
      SCIENCE_STAFF_SPOTS.forEach((sp, i) => {
        this.staff.push(
          new StaffPerson(
            this,
            this.world,
            "specialist",
            staffKey("doctor", 900 + ci * 7 + i * 3),
            roomPoint(center, sp.dx, sp.dy),
            () => this.toast("医科学センターの研究員（測定・分析・ケアを担当）", COLORS.textAccent, 1600),
          ),
        );
      });
    });

    // 専門スタッフ：栄養士＝コック帽と白いコックコート／ドクター＝白衣と聴診器。
    // それぞれの部屋の立ち位置に並べる（部屋が無ければ雇えないので出ない）
    let nut = 0;
    let doc = 0;
    for (const m of this.state.staff) {
      const idx = m.kind === "nutritionist" ? nut++ : doc++;
      const kindRoom = m.kind === "nutritionist" ? "cafeteria" : "clinic";
      const total = this.state.staff.filter((x) => x.kind === m.kind).length;
      // 栄養士は配膳カウンターの内側（客と向かい合う位置）に立たせる。
      // 部屋の真ん中に立たせると、ただ突っ立っている人に見えてしまう。
      const serve =
        m.kind === "nutritionist"
          ? (() => {
              const room = placedRooms(this.map()).find((e) => e.kind === "cafeteria");
              return room ? serveSpotOf(room, idx) : null;
            })()
          : null;
      const spot = serve ?? this.homeCellFor(kindRoom, idx, total);
      this.staff.push(
        new StaffPerson(this, this.world, "specialist", staffKey(m.kind, m.id), spot, () => {
          if (!this.anyModalOpen()) this.openStaffCard(m.id);
        }),
      );
    }

    void map;
    this.syncCoachDuty();
  }

  /**
   * その種類の部屋の中の立ち位置（部屋が無ければプールサイド／入口の前）。
   * total に「その部屋に入る人数」を渡すと、その人数ぶんに等間隔で割り振る
   *（渡さないと全員が同じ隅に重なって立つ）。
   */
  private homeCellFor(kind: Equipment["kind"], index: number, total = index + 1): Cell {
    const rooms = placedRooms(this.map()).filter((e) => e.kind === kind);
    // 部屋がまだ無いときの居場所。**ここも1列に散らす**
    //（全員に同じ1マスを返すと、そこで団子になる）
    if (rooms.length === 0) return lineUpAt(this.fallbackHomeCell(kind), index, total);
    const room = rooms[index % rooms.length];
    const perRoom = Math.max(1, Math.ceil(total / rooms.length));
    const cells = standCellsOf(room, perRoom);
    const cell = cells[Math.floor(index / rooms.length) % Math.max(1, cells.length)];
    // 手前の壁に足が埋まらないよう、半マス奥に立たせる（→ clearOfFrontWall）
    return clearOfFrontWall(room, cell ?? centerOf(room));
  }

  /**
   * 持ち場の部屋がまだ無い人の居場所。
   *
   * コーチはコーチ室を建てるまで持ち場が無い（→ COACHING.maxCoaches）。
   * 入口の前に立たせると、**出入りする選手・お客さんが毎回そこを通る**ので
   * 人が重なって見える。プールがあるならプールサイドの端に立たせる
   *（監視員のように見えて、置き場所としても自然）。
   */
  private fallbackHomeCell(kind: Equipment["kind"]): Cell {
    const map = this.map();
    if (kind === "coachroom") {
      const pool = placedRooms(map).find((e) => isPool(e.kind));
      if (pool && pool.gx != null) {
        return clearOfFrontWall(pool, poolDeckAt(pool, 0.6));
      }
    }
    return spawnCell(map);
  }

  /** その種類の、歩いて行ける部屋（無ければ null）。 */
  private usableRoom(kind: Equipment["kind"], index = 0): Equipment | null {
    const rooms = this.usableRoomsOf(kind);
    return rooms.length === 0 ? null : rooms[index % rooms.length];
  }

  /** その種類の使える部屋を全部（風呂・サウナ・外気浴は棟数ぶん行き先が要る）。 */
  private usableRoomsOf(kind: Equipment["kind"]): Equipment[] {
    return this.state.usableEquipment().filter((e) => e.kind === kind);
  }

  /** 今その職員がいる場所を含む部屋（経路の出発点に使う）。 */
  private roomOfCell(cell: Cell): Equipment | null {
    return this.state.roomAtCell(Math.round(cell.gx), Math.round(cell.gy));
  }

  /**
   * 担当コマかどうかで、コーチの居場所を切り替える。
   *  担当コマの時間     → 担当プールのプールサイドで指導
   *  研究に割り当て済み → 会議室で研究
   *  それ以外          → コーチ室で待機（ときどき掃除に出る）
   * どちらも「歩いて行けること」が前提。行けない部屋へは向かわない。
   */
  private syncCoachDuty(): void {
    const running = this.state.runningLessons(this.clock.minuteOfDay);
    const researchOn = this.state.hasMeetingRoom();
    let seat = 0;
    // 同じプールに2人以上のコーチが立つとき、プールサイドで横に並べるための番号
    const atPool = new Map<number, number>();
    // 経路探索は「行き先が変わるとき」だけ行う（毎フレーム BFS を走らせない）
    const routeTo = (p: StaffPerson, to: Equipment): ReturnType<typeof moveRoute> =>
      moveRoute(this.map(), this.roomOfCell(p.gridPos()), to, p.gridPos());

    for (const c of this.state.coaches) {
      const p = this.coachStaff.get(c.id);
      if (!p) continue;
      const task = p.currentTask;

      // このコーチが担当しているコマが今走っているか
      const duty = running.find((e) => e.coachId === c.id);
      if (duty) {
        // すでに「そのプール」へ向かっている／立っているときだけ何もしない。
        // 担当が別のプールに変わったら、経路を引き直して歩かせる。
        // （毎回 BFS を走らせないために、どのプールへ送ったかを覚えておく）
        const heading = this.coachPool.get(c.id);
        if ((task === "coaching" || task === "toPool") && heading === duty.poolId) continue;
        const pool = this.state.equipment.find((e) => e.id === duty.poolId);
        const road = pool && pool.gx != null ? routeTo(p, pool) : null;
        if (pool && pool.gx != null && road) {
          // 同じプールを見る2人目以降は、プールサイドを右へずらして並ばせる
          const nth = atPool.get(pool.id) ?? 0;
          atPool.set(pool.id, nth + 1);
          // 練習の部屋ではプールサイドが無いので、部屋の手前寄りに立って見る
          const stand = isTrainingRoom(pool.kind)
            ? clearOfFrontWall(pool, roomPoint(pool, 4.6 + nth * 1.2, 5.2))
            : clearOfFrontWall(pool, poolDeckAt(pool, 2.2 + nth * POOLSIDE_SPACING));
          // 道順の終点は「部屋の中心」＝**水の上**なので、プールサイドの立ち位置に差し替える。
          // ここを直さないと、コーチが水の上まで歩いてからプールサイドへ瞬間移動する。
          p.goCoaching([...road.slice(0, Math.max(1, road.length - 1)), stand], stand);
          this.coachPool.set(c.id, pool.id);
          continue;
        }
        // 歩いて行けないプールへは出動しない（壁を突っ切って歩かせない）
      }
      // 担当が無くなったら、送り先の記録も消す（次にまた歩かせるため）
      this.coachPool.delete(c.id);

      if (researchOn && c.duty === "research") {
        // 研究は会議室ごとに1件なので、**自分の班の部屋**へ行かせる。
        // 部屋の中の席は、その班での順番（0〜3人目）で決める。
        const project = this.state.projectOfCoach(c.id);
        const meeting = project
          ? this.state.equipment.find((e) => e.id === project.roomId && e.gx != null)
          : this.usableRoom("meeting");
        const idx = project ? Math.max(0, project.coachIds.indexOf(c.id)) : seat++;
        const heading = this.coachMeeting.get(c.id);
        if ((task === "researching" || task === "toMeeting") && heading === (meeting?.id ?? -1)) continue;
        const road = meeting ? routeTo(p, meeting) : null;
        if (meeting && road) {
          const seats = standCellsOf(meeting, idx + 1);
          p.goResearch(road, seats[seats.length - 1]);
          this.coachMeeting.set(c.id, meeting.id);
          continue;
        }
      }
      this.coachMeeting.delete(c.id);

      // 指導・研究が終わった／掃除を終えたコーチをコーチ室へ戻す
      if (task === "coaching" || task === "researching" || p.cleaningDone) {
        const room = this.usableRoom("coachroom");
        p.goHome((room ? routeTo(p, room) : null) ?? [{ ...p.homeCell }]);
      }
    }
  }

  /** ときどき、手の空いているコーチが館内の掃除に出る（研究中の人は出ない）。 */
  private pollCleaning(dt: number): void {
    this.cleanTimer -= dt;
    if (this.cleanTimer > 0) return;
    this.cleanTimer = 14 + this.rng.frac() * 22;

    const busy = new Set(
      this.state
        .runningLessons(this.clock.minuteOfDay)
        .map((e) => e.coachId)
        .filter((id): id is number => id != null),
    );
    const idle = this.state.coaches.filter((c) => !busy.has(c.id) && c.duty !== "research");
    if (idle.length === 0) return;
    const pick = idle[Math.floor(this.rng.frac() * idle.length)];
    const p = this.coachStaff.get(pick.id);
    if (!p) return;
    // 掃除先＝使える部屋のどれか（歩いて行けるところにしか行けない）。
    // **入ってはいけない部屋は外す**（寮・温浴施設はお客さん／選手の場所）。
    const rooms = this.state
      .usableEquipment()
      .filter((e) => e.kind !== "entrance" && !NO_CLEANING.has(e.kind));
    if (rooms.length === 0) return;
    const target = rooms[Math.floor(this.rng.frac() * rooms.length)];
    const spot = this.cleaningSpotOf(target);
    const from = this.roomOfCell(p.gridPos());
    const road = moveRoute(this.map(), from, target, p.gridPos());
    if (!road) return; // 歩いて行けない＝行けない（壁を突っ切らせない）
    p.goCleaning([...road, spot], spot);
    if (import.meta.env.DEV && probeKind() === "life") {
      probeLife("clean", `coach=${pick.id} -> ${target.kind} spot=(${spot.gx},${spot.gy})`);
    }
  }

  /**
   * 掃除で立つ場所。
   *
   * 部屋の中心をそのまま使うと、**プールでは水の上**（＝水面を歩く）になり、
   * 部屋によっては壁に埋まる。プールはプールサイド、それ以外は
   * 「部屋の中で人が立てるマス」（奥の壁を避けたところ）を使う。
   */
  private cleaningSpotOf(room: Equipment): Cell {
    if (isPool(room.kind) && room.gx != null) {
      return clearOfFrontWall(room, poolDeckAt(room, 1.5));
    }
    const spots = standCellsOf(room, 1);
    return clearOfFrontWall(room, spots[0] ?? centerOf(room));
  }

  private drawShimmer(t: number): void {
    const g = this.shimmerG;
    g.clear();
    for (const s of this.shimmers) {
      const wave = Math.sin(t * s.speed + s.phase);
      const alpha = 0.05 + 0.1 * (0.5 + 0.5 * wave);
      g.lineStyle(1.5, 0xffffff, alpha);
      g.lineBetween(s.x + wave * 2, s.y, s.x + wave * 2 + s.len, s.y);
    }
    this.drawSteam(t);
  }

  /**
   * 湯気を描く。
   *
   * 1つの発生源から3つのふわりを時間差で出す。上るほど大きく・薄くなり、
   * 左右にゆっくり流れる。**中心が濃く外が薄い二重の円**にすると、
   * ただの白丸ではなく「もや」に見える。
   */
  private drawSteam(t: number): void {
    const g = this.steamG;
    g.clear();
    this.drawSoakRipples(t);
    if (this.steams.length === 0) return;
    for (const s of this.steams) {
      for (let k = 0; k < 3; k++) {
        // 0→1 を繰り返す進み具合（k ぶん位相をずらして間隔を空ける）
        const u = (t * s.speed + s.phase + k / 3) % 1;
        const y = s.y - u * s.rise;
        const x = s.x + Math.sin((u + s.phase) * Math.PI * 2) * 5;
        const r = s.r * (0.55 + u * 0.85);
        // 出はじめと消えぎわを薄くする（ぷつっと現れない）
        const fade = Math.sin(u * Math.PI);
        g.fillStyle(s.tint, 0.2 * fade);
        g.fillEllipse(x, y, r * 2.2, r * 1.3);
        g.fillStyle(s.tint, 0.16 * fade);
        g.fillEllipse(x, y, r * 1.2, r * 0.7);
      }
    }
  }

  /**
   * 湯に浸かっている人のまわりの波紋。
   *
   * 体を切り取って沈めているだけだと、切り口がまっすぐで「板に刺さっている」ように見える。
   * 腰のあたりに広がる楕円を1〜2本重ねると、そこが湯面だとひと目で分かる。
   * （きらめきと同じ 1/30 秒ごとの描き直しなので、人数が増えても負担はごく小さい）
   */
  private drawSoakRipples(t: number): void {
    const g = this.steamG;
    const ripple = (x: number, y: number, phase: number): void => {
      const w = 26 + Math.sin(t * 2 + phase) * 3;
      g.fillStyle(0xffffff, 0.22);
      g.fillEllipse(x, y, w, w * 0.34);
      g.fillStyle(0x8fe3f2, 0.3);
      g.fillEllipse(x, y, w * 0.66, w * 0.22);
    };
    for (const p of this.people) {
      const s = p.soakPos;
      if (s) ripple(s.x, s.y, p.student.id);
    }
    for (const v of this.visitors) {
      const s = v.soakPos;
      if (s) ripple(s.x, s.y, v.seed);
    }
  }

  private updateMarker(t: number): void {
    if (!this.selected || this.selected.done) {
      this.marker.setVisible(false);
      return;
    }
    const w = this.selected.worldPos();
    this.marker.setVisible(true).setPosition(w.x, w.y).setDepth(w.depth - 2);
    this.marker.setScale(1 + Math.sin(t * 6) * 0.06);
  }

  // ---------------------------------------------------------------- クラス入替（時間割）

  /**
   * 時間割にしたがってクラスを入れ替える。
   * プールが複数あれば、同じ時間に複数のクラスが並行して練習する。
   *
   * 同じクラスを同じ時間に複数のプールへ割り当てることもできる（＝定員が増える）。
   * そのときは在籍者を1人ずつプールへ振り分ける。
   * 同じ選手が2つのプールに現れることはないし、練習も1回しか適用されない。
   */
  private syncActiveClass(force: boolean): void {
    const running = this.state.runningLessons(this.clock.minuteOfDay);
    // **コマ（slot）も署名に入れる**。同じクラスを続けて2コマ入れたとき、
    // コマの切れ目でここを通らないと「休憩が入らない＝2コマ目が空振り」になり、
    // スクールは「1コマ目の顔ぶれのまま2コマ目を練習する」ことになってしまう。
    const sig = running.map((e) => `${e.poolId}:${e.slot}:${e.classId}:${e.coachId}`).sort().join("|");
    if (!force && sig === this.activeSig) return;

    // 今から練習するクラスと、そのクラスが使うプール（同じクラスに複数本つくことがある）
    const groups = groupByClass(running, this.state.equipment);
    const nextClasses = groups.map((g) => g.classId);
    const started = nextClasses.filter((c) => !this.activeClasses.includes(c));

    // 練習が終わったクラスを解散させる。
    // 疲れている選手（欲求が閾値を超えている子）は、帰る前に回復設備を使いに行く。
    for (const cls of this.activeClasses) {
      if (!nextClasses.includes(cls)) this.releaseClass(cls);
    }
    if (this.activeClasses.length === 0) {
      for (const p of this.people) this.sendHome(p);
    }

    // 並べ直しが要るクラス＝新しく始まった／使うプールが変わった（＋強制のとき）。
    // 練習中に時間割やプールをいじると、まだ泳いでいるクラスをもう一度並べることになるので、
    // **先に本人たちを片付けてから**並べ直す（これをしないと同じ選手が二重に出る）。
    // 使うプールが変わっていないクラスはそのまま泳がせておく（入口から歩き直させない）。
    const poolSig = new Map<ClassId, string>();
    for (const g of groups) {
      poolSig.set(g.classId, g.pools.map((p) => p.id).sort((a, b) => a - b).join(","));
    }
    const rebuild = new Set<ClassId>();
    for (const [cls, s] of poolSig) {
      if (force || this.activePoolSig.get(cls) !== s) rebuild.add(cls);
    }
    // 顔ぶれが替わったクラスも並べ直す。
    // スクール（幼児・学童）は1人1コマなので、コマが替わると**別の子たちが来る**。
    // 育成〜プロは同じ顔ぶれが続けて練習するので、ここは変わらず泳ぎ続ける。
    const nextLineup = this.state.lineupAt(this.clock.minuteOfDay);
    const nextMemberSig = this.memberSignature(nextLineup);
    for (const [cls, ms] of nextMemberSig) {
      if (this.activeMemberSig.get(cls) !== ms) rebuild.add(cls);
    }
    this.activeMemberSig = nextMemberSig;
    void nextLineup;

    // 練習開始（休養の予約を1つ消費するので、コマが始まった回だけ・そのコマの顔ぶれにだけ）。
    // **画面の人を片付けるより先に呼ぶ**：ここで「今コマは休む」と決まった選手が出るので、
    // 先に片付けると、休むと決まった選手を消しておいて並べ直さない＝
    // **練習中の選手がその場から消えたように見える**。
    // 続けて練習するクラスにも毎コマ渡す（state 側がコマの切れ目で休憩を挟む）。
    {
      const before = this.state.lineupAt(this.clock.minuteOfDay);
      const slotOf = new Map<ClassId, number>();
      for (const e of running) if (!slotOf.has(e.classId)) slotOf.set(e.classId, e.slot);
      for (const cls of nextClasses) {
        this.state.beginClassSession(cls, membersOfClass(before, cls), slotOf.get(cls));
      }
    }
    void started;

    // 今この瞬間の顔ぶれ＝だれがどのコマのどのプールに入るか（sim/lineup.ts が唯一の決定者）。
    // 1人はかならず1コマ・1箇所。コマを2つ入れても同じ人が両方に出ることはない。
    const lineup = this.state.lineupAt(this.clock.minuteOfDay);

    // 並べ直す人のうち、**このあと本当に並べ直す人だけ**を消す（すぐ出てくるので目立たない）。
    // このコマで練習しない人はその場から消さず、歩いて帰らせる。
    const nextIds = new Set<number>();
    for (const l of lineup) for (const s of l.members) nextIds.add(s.id);
    const goHome: Person[] = [];
    // 【消さずに預かる】並べ直す人は、**新しい姿を出せたことを確かめてから**消す。
    // ここで先に destroy すると、次のプールへの歩いて行けないとき（→ spawnIntoPool の
    // 「歩いて行けない＝来られない」）に並べ直しが空振りして、
    // **練習していた選手がその場から消えたまま出て来なくなる**。
    const replacing = new Map<number, Person>();
    this.people = this.people.filter((p) => {
      if (p.leaving) return true; // すでに帰り道の人はそのまま歩かせる
      if (!rebuild.has(p.student.classId)) return true;
      this.personById.delete(p.student.id);
      if (nextIds.has(p.student.id)) {
        replacing.set(p.student.id, p);
        return true;
      }
      if (import.meta.env.DEV && probeKind() === "life") {
        probeLife("gohome:slotEnd", `id=${p.student.id} cls=${p.student.classId}`);
      }
      goHome.push(p);
      return true;
    });
    for (const p of goHome) this.sendHome(p);
    this.activePoolSig = poolSig;

    // 「今だれが画面に出ているか」の索引を、実際に残っている人から作り直す。
    // これがずれていないかぎり、同じ選手のスプライトが2つ出ることはない。
    // 帰り道の人は数に入れない（同じ選手が次のコマに出るのを塞がないように）。
    this.personById.clear();
    for (const p of this.people) if (!p.done && !p.leaving) this.personById.set(p.student.id, p);

    this.gainPopups?.clear();
    // 一般客はコマをまたいで滞在してよい（滞在時間が来れば sim 側で自動的に帰る）

    // 設備での練習枠は施設全体で共有する（並行するクラスどうしで器具を取り合わない）。
    // 並べ直さなかったクラスがすでに使っている台は、空きから外しておく。
    const stands = this.stationPool();
    const key = (c: Cell): string => `${c.gx},${c.gy}`;
    const taken = new Set(
      this.people
        // 帰り道の人と、いま並べ直している人は台を空ける
        .filter((p) => !p.leaving && !replacing.has(p.student.id))
        .map((p) => p.stationCell)
        .filter((c): c is Cell => c != null)
        .map(key),
    );
    stands.studioStands = stands.studioStands.filter((c) => !taken.has(key(c)));
    stands.gymStands = stands.gymStands.filter((c) => !taken.has(key(c)));

    this.lessonMembers = new Map();
    for (const l of lineup) {
      const cur = this.lessonMembers.get(l.classId);
      if (cur) cur.push(...l.members);
      else this.lessonMembers.set(l.classId, [...l.members]);
      if (!rebuild.has(l.classId)) continue;
      if (l.members.length === 0) continue; // このコマは定員に余裕がある＝誰も来ない
      // 医科学センター・低酸素トレーニングルームのコマは、部屋の機器の前で練習する
      if (isTrainingRoom(l.pool.kind)) this.spawnIntoTrainingRoom(l.pool, l.members, this.map(), replacing);
      else this.spawnIntoPool(l.pool, l.members, this.map(), stands, replacing);
    }
    // 【預かっていた人の始末】新しい姿が出せた人だけ、古い姿を消す。
    // 出せなかった人（歩いて行けない等）は消さずに歩いて帰らせる＝画面から消えない。
    for (const [id, old] of replacing) {
      const fresh = this.personById.get(id);
      if (fresh && fresh !== old) {
        if (import.meta.env.DEV && probeKind() === "life") {
          probeLife("destroy:rebuild", `id=${id} cls=${old.student.classId}`);
        }
        old.destroy();
        continue;
      }
      // 索引には残さない（帰り道の人は「画面に出ている」に数えない）
      if (import.meta.env.DEV && probeKind() === "life") {
        probeLife("gohome:noRoute", `id=${id} cls=${old.student.classId}`);
      }
      this.personById.delete(id);
      this.sendHome(old);
    }
    this.people = this.people.filter((p) => !p.done);
    // 並べた直後にタップしても選手を開けるようにする（→ ui/inputReady.ts）
    flushInput(this);
    this.state.currentClassId = nextClasses[0] ?? null;
    this.activeClasses = nextClasses;
    this.activeSig = sig;
    // 速度はプレイヤーが変えるまで保持する（クラスが替わっても等倍に戻さない）
    this.updateSpeedButtons();
    // 担当コーチをプールサイドへ／担当外はコーチ室へ
    this.syncCoachDuty();
    this.refreshHud();
  }

  /** クラスごとの顔ぶれを1つの文字列にする（並べ直しが要るかの判定に使う）。 */
  private memberSignature(lineup: readonly PoolLineup[]): Map<ClassId, string> {
    const ids = new Map<ClassId, number[]>();
    for (const l of lineup) {
      const cur = ids.get(l.classId);
      const add = l.members.map((s) => s.id);
      if (cur) cur.push(...add);
      else ids.set(l.classId, add);
    }
    const out = new Map<ClassId, string>();
    for (const [cls, list] of ids) out.set(cls, list.sort((a, b) => a - b).join(","));
    return out;
  }

  /** その人を、いま居る場所から入口まで帰らせる。 */
  private sendHome(p: Person): void {
    const g = p.gridPos();
    const room = this.roomOfCell(g);
    const route = leaveRoute(this.map(), g, room);
    // 泳いでいた人は、まずプールサイドへ上がってから歩き出す
    //（水の上を斜めに突っ切って帰るのを防ぐ）
    if (room && isPool(room.kind) && isOverPoolWater(room, g)) {
      route.splice(1, 0, poolDeckNear(room, g));
    }
    p.leave(route);
  }

  /**
   * クラスの練習終了。sim 側で「誰がどの回復設備を使ったか」が決まるので、
   * その結果に沿って、画面上でも実際に歩いて向かわせる。
   * 使わない／諦めた選手・マッサージエリアへの道が無い選手はそのまま帰る。
   */
  private releaseClass(classId: ClassId): void {
    if (import.meta.env.DEV && probeKind() === "life") probeLife("release", `cls=${classId}`);
    // 解散するのは、そのコマで練習していた顔ぶれ（別のコマの選手には触らない）
    const report = this.state.endClassSession(classId, this.lessonMembers.get(classId));
    this.lessonMembers.delete(classId);
    const byId = new Map<number, RecoveryOutcome>();
    for (const o of report.outcomes) byId.set(o.student.id, o);

    const map = this.map();
    const recovery = this.usableRoom("recovery");
    // 【どの施設に入れなかったか】種類ごとの人数（お知らせで名指しする）
    const missed = new Map<RoomKind, number>();
    for (const o of report.outcomes) {
      if (!o.slot && o.wantKind && (o.gaveUp || o.full)) missed.set(o.wantKind, (missed.get(o.wantKind) ?? 0) + 1);
    }
    let complaints = 0;
    for (const p of this.people) {
      if (p.student.classId !== classId) continue;
      const o = byId.get(p.student.id);
      // 【不満を頭の上に出す】入れなかった子が「○○が混んでて使えない…」とこぼして帰る。
      // 数字（月次レポート）だけでは、どの設備が足りないのかが館内を見ていても分からない
      if (o && !o.slot && o.wantKind && (o.gaveUp || o.full) && complaints < RECOVERY_COMPLAINTS_MAX) {
        complaints++;
        this.complainCrowded(p, o.wantKind);
      }
      const roomSlot = o?.slot && (RECOVERY_ROOMS as readonly string[]).includes(o.slot.kind);
      if (!o || !o.slot || (!recovery && !roomSlot)) {
        // 回復設備を使わない選手。医科学センターで測定を受けるか、たまに**食堂で食事をしてから**帰る
        if (this.scienceStopFor(p)) continue;
        if (!this.mealStopFor(p)) this.sendHome(p);
        continue;
      }
      // 風呂・サウナ・外気浴は「部屋そのもの」なので、その部屋へ歩いて行く。
      // マッサージ器などの器具は、マッサージエリアの中の置き場所へ歩いて行く。
      const kind = o.slot.kind;
      const asRoom = (RECOVERY_ROOMS as readonly string[]).includes(kind)
        ? this.usableRoomsOf(kind as Equipment["kind"])[o.slot.unit]
        : null;
      let cell: Cell;
      let target: Equipment;
      // 温浴施設に入る選手は、席（湯船のマス・ベンチ・チェア）に着いて姿勢が変わる
      let pose: BathPose | null = null;
      if (asRoom) {
        target = asRoom;
        const seats = bathSeatCells(asRoom, o.slot.seat + 1);
        cell = seats.length > 0 ? seats[seats.length - 1] : standCellsOf(asRoom, 1)[0];
        pose = bathPoseOf(asRoom.kind);
      } else if (recovery) {
        // 席を持っている部屋へ（マッサージエリアを2つ建てたとき、1つめに全員が集まらないように）
        const own = this.state.equipment.find((e) => e.id === o.slot?.roomId && e.kind === "recovery");
        const room = own ?? recovery;
        target = room;
        // マッサージエリアの中の立ち位置。定員（グレードで4〜10名）ぶんの位置を先に割って、席番号で配る
        //（以前は部屋の**ID**を席数として渡していたので、全員が同じ隅に固まっていた）
        const spots = standCellsOf(room, Math.max(o.slot.seat + 1, stationsOf(room)));
        cell = spots[o.slot.seat] ?? standAt(centerOf(room), o.slot.seat, false);
      } else {
        // 回復設備を使わない選手。たまに**食堂で食事をしてから**帰る
        if (!this.mealStopFor(p)) this.sendHome(p);
        continue;
      }
      const from = this.roomOfCell(p.gridPos());
      const route = moveRoute(map, from, target, p.gridPos());
      if (!route) {
        // 回復設備へ歩いて行けない＝そのまま帰る（壁を突っ切って歩かせない）
        this.sendHome(p);
        continue;
      }
      // 温浴はゆっくり浸かる（一般客と同じで、居る時間が長いほど賑わって見える）
      // 4施設とも「練習後に1コマぶん使う」ので、居る長さも同じ扱いにする
      const hold = o.slot.minutes * BATH_HOLD_PER_MINUTE;
      // 洗い場・プールサイドをひと足はさんでから席へ（→ approachInside）
      // 回した部屋の寝椅子は左右が逆なので、寝そべる向きも合わせる
      p.goRecover([...route, ...approachInside(target, cell)], hold, o.waitTurns * 1.1, pose, "suit", rotOf(target) === 1);
      // 使い始めたときに「♨ +体力」を出す（回復そのものは sim 側で済んでいる）
      this.recoveryFx.set(p.student.id, { energy: Math.round(o.energyGain) });
    }

    if (report.used > 0 || report.gaveUp > 0) {
      // 【満足度】そのコマの選手たちが、いまどんな機嫌で上がったかを一言添える。
      // 「混んでいて諦めた」が続くと機嫌の呼び名が下がっていくので、増設の合図になる。
      const members = report.outcomes.map((o) => o.student);
      const mood = members.length > 0 ? members.reduce((a, s) => a + s.mood, 0) / members.length : 0;
      this.notices.push({
        icon: "♨",
        title: `${classLabel(classId)}の練習おわり`,
        detail:
          `回復設備を使った ${report.used}人` +
          (report.gaveUp > 0
            ? ` ／ 混んでいて諦めた ${report.gaveUp}人` +
              (missed.size > 0
                ? `（${[...missed].map(([k, n]) => `${equipmentDef(k).label} ${n}人`).join("・")}。1か所4名まで。増やそう）`
                : "（回復施設は1か所4名まで。増やそう）")
            : "") +
          (members.length > 0 ? ` ／ 機嫌は「${moodLabel(mood)}」` : ""),
        color: report.gaveUp > 0 ? "#e67e22" : "#2ecc71",
      });
    }
  }

  /**
   * 回復設備に入れなかった選手が、頭の上で不満をこぼす（😠＋吹き出し）。
   * 何の設備が足りないのかを、館内を眺めているだけで分かるようにする。
   */
  private complainCrowded(p: Person, kind: RoomKind): void {
    const label = equipmentDef(kind).label;
    const lines = [`${label}、混んでて使えない…`, `${label}に入れなかった…`, `${label}、いっぱいだ…`];
    const text = lines[Math.floor(Math.random() * lines.length)];
    this.chatterAt.set(`s${p.student.id}`, this.time.now); // 直後に別のセリフで上書きしない
    this.bubbles.spawn(() => this.personTop(p), `😠 ${text}`, "tired");
  }

  /**
   * 施設全体で共有する「設備の立ち位置」。
   * スタジオは鏡の前、筋トレは器具1台につき1人。
   * 並行するクラスで取り合わないよう、1コマぶんまとめて作って先着で配る。
   */
  private stationPool(): { studio: Equipment | null; gym: Equipment | null; studioStands: Cell[]; gymStands: Cell[] } {
    const studio = this.usableRoom("studio");
    const gym = this.usableRoom("gym");
    // 同時に使える台数＝部屋のグレード（器具は部屋に同梱）
    const gymCount = Math.min(gym ? innerCellsOf(gym).length : 0, this.state.stationCount("gym"));
    return {
      studio,
      gym,
      studioStands: studio
        ? standCellsOf(studio, Math.min(innerCellsOf(studio).length, this.state.stationCount("studio")))
        : [],
      gymStands: gym ? standCellsOf(gym, gymCount) : [],
    };
  }

  /**
   * 練習の部屋（医科学センター・低酸素トレーニングルーム）に、割り当てられた選手を並べる。
   * 機器の前の持ち場（SCIENCE_SPOTS／ALTITUDE_SPOTS）から順に立たせ、そこで練習の姿になる。
   * 持ち場が足りなければ部屋の中の立ち位置で埋める。
   */
  private spawnIntoTrainingRoom(
    room: Equipment,
    group: Student[],
    map: ClubMap,
    replacing?: ReadonlyMap<number, Person>,
  ): void {
    // 医科学は機器の前だけ（待合のソファは練習の場所ではない）
    const base = room.kind === "science" ? SCIENCE_SPOTS.filter((s) => s.pose == null) : [...ALTITUDE_SPOTS];
    const n = Math.min(DISPLAY_CAP, group.length);
    const spots: Cell[] = base.map((s) => roomPoint(room, s.dx, s.dy));
    if (spots.length < n) spots.push(...standCellsOf(room, n - spots.length));
    const route = visitRoute(map, room, {});
    if (!route) return; // 歩いて行けない＝来られない
    for (let i = 0; i < n; i++) {
      const s = group[i];
      const already = this.personById.get(s.id);
      if (already && !already.done && already !== replacing?.get(s.id)) continue;
      const station = spots[i];
      const delay = i * 0.22 + this.rng.frac() * 0.12;
      const person = new Person(
        this,
        this.world,
        s,
        { route: [...route.map((c) => ({ ...c })), station], station, stroke: this.state.planFor(s).stroke },
        delay,
        (st) => {
          if (!this.dragMoved && !this.anyModalOpen()) this.openCard(st);
        },
      );
      this.people.push(person);
      this.personById.set(s.id, person);
    }
  }

  /**
   * 1本のプールに、割り当てられた選手（の先頭 DISPLAY_CAP 人）を並べる。
   *
   * だれがどのプールに入るかは sim/lineup.ts の poolLineup が決めている
   * （施設全体で1人1箇所）。ここは受け取った顔ぶれを歩かせるだけ。
   * フォーム／スピードを鍛える中学生以上は、スタジオ・筋トレルームへ歩いて行く。
   */
  private spawnIntoPool(
    pool: Equipment,
    group: Student[],
    map: ClubMap,
    stands: ReturnType<FacilityScene["stationPool"]>,
    /** いま並べ直している最中の人（古い姿はまだ画面にいるが、二重とは見なさない）。 */
    replacing?: ReadonlyMap<number, Person>,
  ): void {
    // レーン・飛び込み台・プールサイドは、回したプールでも合う位置で返ってくる（→ iso/facility.ts）
    const lanes = swimLanesOf(pool);
    const blocks = startBlockCellsOf(pool);
    const n = Math.min(DISPLAY_CAP, group.length);
    // プールサイドの、飛び込み台が並ぶ端。入水はここから
    const deckAtBlocks = poolDeckAt(pool, 0.1);

    for (let i = 0; i < n; i++) {
      const s = group[i];
      // 二重に並べない（最後の保険）。すでに帰った人の記録は残っているので done は無視する。
      // 並べ直し中の古い姿は、これから消すので二重には数えない。
      const already = this.personById.get(s.id);
      if (already && !already.done && already !== replacing?.get(s.id)) continue;
      const delay = i * 0.22 + this.rng.frac() * 0.12;

      // スタジオ＝フォーム、筋トレルーム＝スピードを「実際に行うメニュー」で選んでいる
      // 中学生以上が、その部屋へ歩いて行って練習する（全体練習でも個人指定でも同じ扱い）。
      let target: Equipment = pool;
      let station: Cell | null = null;
      if (canUseEquipment(s)) {
        const ability = this.state.planFor(s).ability;
        if (ability === "form" && stands.studio && stands.studioStands.length > 0) {
          target = stands.studio;
          station = stands.studioStands.shift() ?? null;
        } else if (ability === "speed" && stands.gym && stands.gymStands.length > 0) {
          target = stands.gym;
          station = stands.gymStands.shift() ?? null;
        }
      }

      // プールへはまっすぐ向かい、飛び込み台に着いたところで水着になる（更衣室は廃止）
      const route = visitRoute(map, target, { suit: isPool(target.kind) });
      if (!route) continue; // 歩いて行けない＝来られない

      const laneNo = i % Math.max(1, lanes.length);
      const swim: SwimLane | undefined = station ? undefined : lanes[laneNo];

      // 【プールに入る道順】部屋の中心（＝水の上）で終わらせない。
      // プールサイドを通って自分のレーンの飛び込み台まで歩かせ、そこから入水させる。
      // ここを省くと「水の上を歩いて、いきなりレーンへ飛ぶ」ように見える。
      const walkRoute: Waypoint[] = station
        ? [...route, station]
        : swim
          ? [
              ...(route.length > 2 ? route.slice(0, -1) : route),
              deckAtBlocks,
              // 飛び込み台に着いたところで水着になる（それまでは私服のまま歩く。
              // 水着の絵は正面の立ち姿1枚しか無いので、長い距離を歩かせない）
              { ...(blocks[laneNo] ?? deckAtBlocks), change: "suit" as const },
            ]
          : route;

      // ドラッグで見て回っている最中は、指を離しても選手を開かない。
      // stroke＝いま練習している泳法。プールで泳ぐ姿をこれで選ぶ
      // （幼児・学童は泳法で分けず、スクールの基礎練習の姿になる → swimModeFor）。
      const person = new Person(
        this,
        this.world,
        s,
        {
          route: walkRoute,
          swim,
          station: station ?? undefined,
          stroke: this.state.planFor(s).stroke,
        },
        delay,
        (st) => {
          // 画面（名簿・選手カードなど）が開いているあいだは、下で泳いでいる人に触らない
          if (!this.dragMoved && !this.anyModalOpen()) this.openCard(st);
        },
      );
      this.people.push(person);
      this.personById.set(s.id, person);
      if (import.meta.env.DEV && probeKind() === "life") {
        probeLife("spawn", `id=${s.id} cls=${s.classId} room=${target.kind} station=${station ? "yes" : "no"}`);
      }
    }
  }

  // ---------------------------------------------------------------- 一般客

  /**
   * 一般客の来場。
   * 空きコマの部屋（プール・筋トレルーム・スタジオ）と、いつでも開いている温浴施設
   * （風呂・サウナ・外気浴）に、人気度に応じて人が来る。
   * 歩いて行けない部屋を目指した客は、辿り着けずに帰る（収入にならない）。
   */
  private pollGuests(minutes: number): void {
    const arrivals = this.state.tickGuests(this.clock.minuteOfDay, minutes);
    // 行列の知らせ（入れた／待ちくたびれて帰った）を先に片付ける
    this.applyQueueEvents(this.state.takeGuestQueueEvents());
    if (arrivals.length === 0) return;
    const map = this.map();

    // 入れずに帰る客は、いま何人ぶん姿を出しているか
    let awayShown = this.visitors.filter((v) => v.turnedAway).length;

    // 見物客は数に入れない（見た目だけの人で、描く上限は別に持つ → SPECTATOR）
    const guestCount = (): number => this.visitors.filter((v) => !v.spectator).length;
    for (const a of arrivals) {
      if (guestCount() >= GUESTS.maxVisible) break;
      const room = this.state.equipment.find((e) => e.id === a.roomId);
      if (!room || room.gx == null) continue;
      if (a.turnedAway) {
        // 受付が使えない・歩いて行けないときは来客が**全員**これになる。
        // 全部そのまま出すと入口が回転ドアになってしまうので、姿は数人までにして
        // 代わりに「なぜ入れないか」を案内で伝える（集計そのものは減らさない）。
        this.noteTurnedAwayGuest();
        if (awayShown >= GUESTS.maxTurnedAwayVisible) continue;
        awayShown++;
        /**
         * 【満員で入れなかった客は怒る】（2026-09-24）
         * 人気が出るほど混むので、「混んでいる」ことがその場で見えないと
         * 設備を増やす理由に気づけない。姿を出した客の頭の上に 😠 を出す。
         * 数（人気度への影響）は sim 側が持っている（→ GameState.noteCrowded）。
         */
        if (a.crowded) this.pendingAngry.push({ roomId: a.roomId, kind: room.kind });
      }
      const gateCell = spawnCell(map);
      if (a.queued) {
        this.spawnQueuedGuest(room, a, gateCell);
        continue;
      }
      const route = a.turnedAway
        ? turnedAwayRoute(map, room)
        : // 一般客も、プールと温浴は着いたところで水着になる
          visitRoute(map, room, { suit: isPool(room.kind) || isBathRoom(room.kind) });
      if (!route) continue;
      const { stops, exit } = this.planVisitStops(room, a, route, gateCell);
      const category = a.category;
      const fee = a.paid;
      this.visitors.push(
        new Visitor(
          this,
          this.world,
          {
            stops,
            exit,
            roomId: a.roomId,
            turnedAway: a.turnedAway,
            crowded: a.crowded,
            grade: a.grade,
          },
          (v) => {
            if (!this.anyModalOpen()) this.openGuestCard(v, category, fee);
          },
        ),
      );
    }
  }

  // ---------------------------------------------------------------- BGM

  private bgmCheck = 0;

  /**
   * 施設の BGM。昼はゆったりした曲、夜は静かな版（→ audio/bgmSongs）。
   * 時間帯は時計から見る。会場から戻ったときもここで施設の曲に戻る。
   */
  private syncBgm(delta: number): void {
    this.bgmCheck -= delta;
    if (this.bgmCheck > 0) return;
    this.bgmCheck = 1000;
    bgm.play(phaseAt(this.clock.minuteOfDay) === "night" ? "facilityNight" : "facilityDay");
  }

  // ---------------------------------------------------------------- 見物客

  private spectatorTimer = 0;

  /**
   * 見物客を足す（→ SPECTATOR）。営業時間だけ、少しずつ1人ずつ増やす。
   * 大型プールは観客席に座らせ、練習中のプールにはプールサイドに見学者を立たせる。
   */
  private pollSpectators(dt: number): void {
    this.spectatorTimer -= dt;
    if (this.spectatorTimer > 0) return;
    this.spectatorTimer = SPECTATOR.intervalSec;
    const minute = this.clock.minuteOfDay;
    if (minute < GUESTS.openMinute || minute >= GUESTS.closeMinute) return;
    const running = this.state.runningLessons(minute);
    const lessonIn = new Set(running.map((e) => e.poolId));
    const watching = this.visitors.filter((v) => v.spectator && !v.leaving);
    for (const pool of this.state.usablePools()) {
      const here = watching.filter((v) => v.roomId === pool.id);
      if (standRowsOf(pool.kind) > 0) {
        const want = Math.min(
          SPECTATOR.standMax,
          SPECTATOR.standBase +
            (lessonIn.has(pool.id) ? SPECTATOR.standLesson : 0) +
            Math.floor(this.state.popularity / SPECTATOR.standPerPopularity),
        );
        if (here.length < want) {
          this.seatSpectator(pool);
          return; // 1回に1人ずつ（まとめて湧くと不自然）
        }
      } else if (lessonIn.has(pool.id) && here.length < SPECTATOR.deckLesson) {
        this.deckWatcher(pool);
        return;
      }
    }
  }

  /** 大型プールの観客席の空いている席に、見物客を座らせる（ふっと現れる）。 */
  private seatSpectator(pool: Equipment): void {
    const rows = standRowsOf(pool.kind);
    const w = footprintOf(pool.kind).w;
    const taken = new Set(
      this.visitors.filter((v) => v.spectator && v.roomId === pool.id && !v.done).map((v) => spotKey(v.destCell ?? v.gridPos())),
    );
    const free: { cell: Cell; depth: Cell; lift: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const tier = rows - 1 - row; // 奥の列ほど高い段（→ fnStandSeats0〜3）
      for (let col = 0; col < w; col++) {
        for (const du of STAND_SEAT_OFFSETS) {
          const cell = roomPoint(pool, col + du, row + 0.47);
          if (taken.has(spotKey(cell))) continue;
          // 座面の高さ（床から 22+9×段 px）と、座る姿勢の座面（32px → POSE_STYLE.sit）の差。
          // 食卓の椅子の姿勢（dine）は脚がほとんど見えて「座席の前に立っている」ように見えたので、
          // 腰から下を座席に隠す sit にしてある
          free.push({ cell, depth: roomPoint(pool, col, row + 0.5), lift: 9 * tier - 10 });
        }
      }
    }
    if (free.length === 0) return;
    const seat = free[Math.floor(Math.random() * free.length)];
    const v = new Visitor(this, this.world, {
      stops: [
        {
          route: [seat.cell],
          staySec: randRange(SPECTATOR.staySec),
          pose: "sit",
          purpose: "watch",
          lift: seat.lift,
          depthCell: seat.depth,
        },
      ],
      exit: [seat.cell],
      roomId: pool.id,
      turnedAway: false,
      crowded: false,
      grade: 1,
      spectator: true,
      appearInPlace: true,
    });
    v.sprite.setAlpha(0);
    this.visitors.push(v);
  }

  /** 練習中のプールのプールサイドに、見学の保護者を立たせる（歩いて来て、歩いて帰る）。 */
  private deckWatcher(pool: Equipment): void {
    const map = this.map();
    const route = visitRoute(map, pool, {});
    if (!route || route.length < 2) return;
    const width = Math.max(1, footprintOf(pool.kind).w - 2);
    const spot = clearOfFrontWall(pool, poolDeckAt(pool, 1 + Math.random() * width));
    const walk: Waypoint[] = [...route.slice(0, -1), spot];
    const exit = leaveRoute(map, spot, pool);
    const v = new Visitor(this, this.world, {
      stops: [{ route: walk, staySec: randRange(SPECTATOR.deckStaySec), pose: null, purpose: "watch" }],
      exit,
      roomId: pool.id,
      turnedAway: false,
      crowded: false,
      grade: 1,
      spectator: true,
    });
    this.visitors.push(v);
  }

  // ---------------------------------------------------------------- 行列

  /**
   * 満員の部屋に来た客を、扉の前の行列の最後尾に並ばせる。
   *
   * 並ぶ位置は「入口から部屋までの道」を扉から逆にたどった線の上に取る。
   * 廊下が曲がっていれば行列も曲がる＝壁の中に人が立たない。
   */
  private spawnQueuedGuest(room: Equipment, a: GuestArrival, gateCell: Cell): void {
    if (a.queueId == null) return;
    const route = visitRoute(this.map(), room, { suit: isPool(room.kind) || isBathRoom(room.kind) });
    if (!route || route.length < 2) return;
    // 部屋に入る最初の点（ここより手前が廊下）
    let door = route.findIndex((c, i) => i > 0 && this.roomOfCell(c)?.id === room.id);
    if (door < 1) door = route.length - 1;
    // 扉のすぐ外の点：廊下の最後の点から部屋の中の点へ向かい、部屋に入る手前で止める
    const from = route[door - 1];
    const to = route[door];
    let doorPt: Cell = { gx: from.gx, gy: from.gy };
    for (let t = 1; t >= 0; t -= 0.05) {
      const p = { gx: from.gx + (to.gx - from.gx) * t, gy: from.gy + (to.gy - from.gy) * t };
      if (this.roomOfCell(p)?.id !== room.id) {
        doorPt = p;
        break;
      }
    }
    // 扉から入口へ逆にたどる線
    const line: Waypoint[] = [doorPt, ...route.slice(0, door).reverse().map((c) => ({ gx: c.gx, gy: c.gy }))];
    const tail: Waypoint[] = [doorPt, ...route.slice(door)];
    const k = this.visibleLineIndex(room.id, a.queueId);
    const d = queueSpotDistance(k);
    // 入口からいまの最後尾まで歩く道（行列の線を逆向きにたどる）
    const walk = pathAlong(line, polylineLength(line), d);
    const v = new Visitor(this, this.world, {
      stops: [{ route: [route[0], ...walk], staySec: Number.POSITIVE_INFINITY, purpose: a.category }],
      exit: [route[0], gateCell],
      roomId: a.roomId,
      turnedAway: false,
      crowded: true,
      grade: a.grade,
    });
    v.queueId = a.queueId;
    v.lineUpAt([walk[walk.length - 1] ?? route[0]]);
    this.visitors.push(v);
    this.guestLines.set(a.queueId, { visitor: v, room, a, line, d, tail, gate: gateCell });
  }

  /** その部屋の行列で、姿を出している客のうち何番目か（並んだ順）。 */
  private visibleLineIndex(roomId: number, queueId: number): number {
    let k = 0;
    for (const id of this.state.guestQueueOrder(roomId)) {
      if (id === queueId) return k;
      if (this.guestLines.has(id)) k++;
    }
    return k;
  }

  /** 行列の知らせを画面に反映する。前が抜けた部屋は、残りを前へ詰める。 */
  private applyQueueEvents(events: readonly GuestQueueEvent[]): void {
    if (events.length === 0) return;
    const touched = new Set<number>();
    for (const ev of events) {
      touched.add(ev.roomId);
      const q = this.guestLines.get(ev.queueId);
      if (!q) continue;
      this.guestLines.delete(ev.queueId);
      const v = q.visitor;
      if (v.done) continue;
      const here = v.gridPos();
      if (ev.kind === "admitted") {
        // 扉まで行列の線をたどってから、部屋の中の予定へ
        const tail = [here, ...pathAlong(q.line, q.d, 0), ...q.tail.slice(1).map((c) => ({ ...c }))];
        const { stops, exit } = this.planVisitStops(q.room, { ...q.a, queued: false, turnedAway: false }, tail, q.gate);
        v.admit(stops, exit);
        continue;
      }
      // 待ちくたびれた（または部屋が閉まった・閉館）→ 行列の線を入口まで戻って帰る
      const back = [here, ...pathAlong(q.line, q.d, polylineLength(q.line)), q.gate];
      v.giveUp(back);
      if (ev.waited != null) {
        // 【不満を見せる】どの部屋の行列で待ちくたびれたのかを、その人の頭の上に出す
        const label = equipmentDef(q.room.kind).label;
        const lines = [`${label}、待ちきれない…`, `${label}、混みすぎ！`, "もう帰ろう…"];
        this.bubbles.spawn(() => this.visitorTop(v), `😠 ${lines[Math.floor(Math.random() * lines.length)]}`, "tired");
        this.angryShown.add(v);
        this.noteTurnedAwayGuest();
      }
    }
    // 残った客を前へ詰める
    for (const roomId of touched) {
      let k = 0;
      for (const id of this.state.guestQueueOrder(roomId)) {
        const q = this.guestLines.get(id);
        if (!q) continue;
        const d = queueSpotDistance(k++);
        if (Math.abs(d - q.d) < 1e-6) continue;
        q.visitor.lineUpAt(pathAlong(q.line, q.d, d));
        q.d = d;
      }
    }
    for (const [id, q] of this.guestLines) if (q.visitor.done) this.guestLines.delete(id);
  }

  /**
   * 客1人ぶんの予定（目的の部屋 → たまに売店 → 帰り道）を組み立てる。
   * route は入口（または行列の立ち位置）から目的の部屋まで。
   * 来た瞬間に入る客と、行列から入る客（→ admitQueuedGuest）で共通に使う。
   */
  private planVisitStops(
    room: Equipment,
    a: GuestArrival,
    route: Waypoint[],
    gateCell: Cell,
  ): { stops: VisitorStop[]; exit: Waypoint[] } {
    const map = this.map();
    // 【着替えの指示は終点が持っている】この下で終点を席・プールサイドに差し替えるので、
    // 先に取っておいて新しい終点へ付け替える。落とすと**私服のまま湯船に浸かる**。
    const change = route[route.length - 1]?.change;
    // プールに来た客はプールサイドで過ごす。
    // 水の中に立たせると、レーンで泳いでいるクラブ生と見分けが付かなくなる。
    if (!a.turnedAway && isPool(room.kind) && route.length > 0) {
      const width = Math.max(1, equipmentDef(room.kind).size.w - 2); // 回す前の向きでの長さ
      route[route.length - 1] = { ...poolDeckAt(room, 1 + (this.visitors.length % width)), change };
    }
    // 【温浴施設】客は湯船・ベンチ・チェアの「席」に着く。
    // 参考画像のように何人もが思い思いにくつろいでいる絵にしたいので、
    // 空いている席を選んで、そこで姿勢を変えて過ごさせる。
    let pose: BathPose | null = null;
    if (!a.turnedAway && isBathRoom(room.kind) && route.length > 0) {
      const seat = this.freeBathSeat(room);
      // 洗い場をひと足はさんでから湯船へ（入口からいきなり湯に浸からせない）。
      // 水着になるのは**陸に上がったところ**＝はさんだ1歩目にする。
      if (seat) {
        const legs = approachInside(room, seat);
        legs[0] = { ...legs[0], change };
        route.splice(route.length - 1, 1, ...legs);
      }
      pose = bathPoseOf(room.kind);
    } else if (!a.turnedAway && isDiningRoom(room.kind) && route.length > 0) {
      // 【食堂・カフェ】客は椅子に座って食べる。
      // 立ったままだと「通りかかっただけ」に見えて、食事の賑わいにならない。
      const seat = this.freeDiningSeat(room);
      if (seat) route[route.length - 1] = seat;
      pose = "dine";
    } else if (!a.turnedAway && !isPool(room.kind) && route.length > 0) {
      // 【筋トレルーム・スタジオ】客は**器具の前**に立つ。
      // 部屋の真ん中に固まって立たせると、参考画像のような「マシンを使っている」
      // 賑わいにならない。空いている器具を1つ選んで、その手前に着かせる。
      const spot = this.freeGearSpot(room);
      if (spot) route[route.length - 1] = spot;
    }
    // 【賑わいは滞在時間で作る】温浴の客はゆっくり長湯する。
    // 他の部屋と同じ数秒で帰らせると、湯船はほとんどの時間だれも居ない絵になってしまう
    //（1日に来る人数は同じでも、1人あたりの滞在が短いと「同時に居る人数」が増えない）。
    // 入れない客は扉の前で少し立ち止まる（すぐ引き返すと出入りしているようにしか見えない）。
    // 【賑わいは滞在時間で作る】席に着いた客はゆっくりする。
    // 食事は湯ほど長くないが、数秒で帰らせると「同時に座っている人数」が増えない。
    const seatedStay = isDiningRoom(room.kind) ? DINE_STAY_SEC + this.rng.frac() * 10 : BATH_STAY_SEC + this.rng.frac() * 12;
    // 【見た目の滞在を sim の滞在にそろえる】筋トレルーム・スタジオ・プールの客は、
    // sim が席を押さえている長さ（GUESTS.stayMinutes）だけ部屋に居る。
    // 短く帰らせると「部屋はガラガラなのに扉の前に行列」という絵になってしまう。
    const simStaySec = (GUESTS.stayMinutes * CLOCK.msPerMinute) / 1000 / Math.max(1, this.clock.speed);
    const gearStay = simStaySec * (0.85 + this.rng.frac() * 0.3);
    const stay = a.turnedAway ? 1.6 : pose ? seatedStay : gearStay;
    const stops: VisitorStop[] = [
      {
        route,
        staySec: stay,
        pose,
        poseMirror: rotOf(room) === 1,
        purpose: a.turnedAway ? "turnedAway" : a.category,
      },
    ];
    // 【生活感】用事をすませたあと、たまに売店・食堂へ寄ってから帰る。
    // 全員が「入って・使って・まっすぐ帰る」だと動きが揃ってしまうので、
    // 人によって滞在の長さと通る道が変わるようにする（→ AUTONOMY.shopStopChance）。
    if (!a.turnedAway) {
      const extra = this.shopStopFor(room);
      if (extra) stops.push(extra);
    }
    const lastStop = stops[stops.length - 1];
    const from = a.turnedAway ? room : (this.roomOfCell(lastStop.route[lastStop.route.length - 1]) ?? room);
    const exit = a.turnedAway
      ? [{ ...route[route.length - 1] }, { ...route[0] }, gateCell]
      : leaveRoute(map, lastStop.route[lastStop.route.length - 1], from);
    return { stops, exit };
  }

  /**
   * 用事のあとに寄る売店・食堂（無ければ null）。
   *
   * 「目的の施設 → 売店 → 帰る」という二段の予定になるので、
   * 客ごとに滞在の長さと通る道が変わり、館内の人の流れが単調にならない。
   * 売店を建てるほど客が長く滞在する＝賑わって見える、という手ごたえにもなる。
   */
  private shopStopFor(from: Equipment): VisitorStop | null {
    if (Math.random() > AUTONOMY.shopStopChance) return null;
    const shop = this.usableRoom("shop") ?? this.usableRoom("cafeteria");
    if (!shop) return null;
    const route = moveRoute(this.map(), from, shop, centerOf(from));
    if (!route) return null;
    // 【食堂に寄ったら座って食べる】立ったまま数秒で帰ると「通りかかっただけ」に見える。
    // 空いている席があればそこへ着かせ、座る姿勢で、少し長く過ごさせる。
    if (isDiningRoom(shop.kind)) {
      const seat = this.freeDiningSeat(shop);
      if (seat) {
        return {
          route: [...route, seat],
          staySec: DINE_STAY_SEC + this.rng.frac() * 10,
          pose: "dine",
          purpose: "shop",
        };
      }
    }
    // 部屋の中で立つ位置をずらして、カウンターの前に何人か並んで見えるようにする
    const stands = standCellsOf(shop, 4);
    const spot = stands[this.visitors.length % Math.max(1, stands.length)];
    return {
      route: spot ? [...route, spot] : route,
      staySec: randRange(AUTONOMY.shopStaySec),
      pose: null,
      purpose: "shop",
    };
  }

  /**
   * その部屋で空いている器具の前のマス（一般客・選手の立ち位置）。
   *
   * 器具は部屋に同梱で、位置は gearSpecsFor が決めている。
   * すでに誰かが立っている器具は避けるので、複数人が別々のマシンを使う絵になる。
   */
  /**
   * 温浴施設で空いている席（湯船のマス・サウナのベンチ・外気浴のチェア）。
   *
   * 一般客と選手が同じ部屋を使うので、**両方の居場所を見て**空きを選ぶ。
   * 全部埋まっているときは席を使い回す（人数ぶんずらして詰めて入る）。
   */
  private freeBathSeat(room: Equipment): Cell | null {
    const seats = bathSeatCells(room, BATH_SEAT_LOOK);
    if (seats.length === 0) return null;
    const key = (c: Cell): string => `${Math.round(c.gx * 2)},${Math.round(c.gy * 2)}`;
    const taken = new Set<string>();
    for (const v of this.visitors) taken.add(key(v.gridPos()));
    for (const p of this.people) taken.add(key(p.gridPos()));
    for (const s of seats) if (!taken.has(key(s))) return s;
    return seats[this.visitors.length % seats.length];
  }

  /**
   * 【練習のあとに食事】選手をたまに食堂へ寄らせる。
   *
   * 参考画像のような「何人かがテーブルで食べている食堂」は、
   * 建てただけでは生まれない。練習を終えた選手の一部が席に着くことで、
   * 食堂が使われている場所に見える。
   * これは**見た目だけ**の寄り道で、体力や成長には一切影響しない。
   *
   * @returns 食堂へ向かわせたら true（呼び出し側はそのまま帰さない）
   */
  /**
   * 【医科学センターで測定】練習を終えた育成以上の選手が、ときどき測定に寄ってから帰る。
   * 空いている持ち場（SCIENCE_SPOTS）があるときだけ。見た目だけの寄り道で、
   * 効果（練習効率・ケガの治り・素質の見抜き）は sim 側が常にかけている。
   */
  private scienceStopFor(p: Person): boolean {
    if (isSchoolClass(p.student.classId)) return false;
    if (Math.random() > SCIENCE_VISIT_CHANCE) return false;
    const centers = this.usableRoomsOf("science");
    if (centers.length === 0) return false;
    const taken = this.takenSpots();
    const from = this.roomOfCell(p.gridPos());
    for (const center of centers) {
      const route = moveRoute(this.map(), from, center, p.gridPos());
      if (!route) continue;
      const hold = randRange(SCIENCE_STAY_SEC);
      /**
       * 【流水プールで泳ぐ】空いていれば、まず水槽に入れる（この棟の主役なので優先）。
       * 観察窓の前まで歩いてから水槽の真ん中へ入り、そこで泳ぐ姿になる。
       */
      const anchor = roomPoint(center, FLUME_AT.dx, FLUME_AT.dy);
      const swimCell = { gx: anchor.gx - FLUME_CENTER_BACK, gy: anchor.gy - FLUME_CENTER_BACK };
      const flumeBusy = this.people.some((q) => q !== p && q.flumeAt != null && spotKey(q.flumeAt) === spotKey(anchor));
      if (!flumeBusy && Math.random() < 0.5 && canUseEquipment(p.student)) {
        const front = roomPoint(center, 4.1, 4.25);
        p.goRecover(
          [...route, front, { ...swimCell, change: "suit" as const }],
          hold,
          0,
          null,
          "street",
          rotOf(center) === 1,
          "measure",
          { lift: FLUME_WATER_LIFT, depthAt: anchor },
        );
        return true;
      }
      const free = SCIENCE_SPOTS.map((sp) => ({ cell: roomPoint(center, sp.dx, sp.dy), pose: sp.pose })).filter(
        (sp) => !taken.has(spotKey(sp.cell)),
      );
      if (free.length === 0) continue;
      const pick = free[Math.floor(Math.random() * free.length)];
      p.goRecover([...route, pick.cell], hold, 0, pick.pose, "street", rotOf(center) === 1, "measure");
      return true;
    }
    return false;
  }

  private mealStopFor(p: Person, force = false): boolean {
    if (!force && this.rng.frac() > AUTONOMY.mealStopChance) return false;
    const hall = this.usableRoom("cafeteria");
    if (!hall) return false;
    const seat = this.freeDiningSeat(hall);
    if (!seat) return false; // 満席なら、立ち食いにはせずそのまま帰す
    const from = this.roomOfCell(p.gridPos());
    const route = moveRoute(this.map(), from, hall, p.gridPos());
    if (!route) return false;
    // 食事は着替えない（水着で食卓に着かせない → goRecover の wear）
    p.goRecover([...route, seat], DINE_STAY_SEC + this.rng.frac() * 10, 0, "dine", "street");
    return true;
  }

  /**
   * 空いている食事の席。
   *
   * 【歩いている途中の人も「埋まっている」と数える】
   * 以前は「いまその席に立っているか」だけを見ていたので、
   * 席へ**向かっている最中**の人は空席扱いになり、2人目・3人目が同じ椅子へ送られて
   * 着いた瞬間に重なっていた（食堂は席が4つしかないので、客が続けて来ると必ず起きる）。
   * いまは行き先（destCell）も見るので、同じ席には1人しか送られない。
   */
  private freeDiningSeat(room: Equipment): Cell | null {
    const seats = diningSeatCells(room);
    if (seats.length === 0) return null;
    const taken = this.takenSpots();
    for (const s of seats) if (!taken.has(spotKey(s))) return s;
    return null; // 満席のときは座らせない（立ち食いに見えるより、来ないほうがまし）
  }

  /**
   * いま人が「居る／向かっている」マスの集合。
   * 席・立ち位置を配るときは必ずここを通す（→ freeDiningSeat / freeGearSpot）。
   */
  private takenSpots(): Set<string> {
    const taken = new Set<string>();
    for (const v of this.visitors) {
      taken.add(spotKey(v.gridPos()));
      const d = v.destCell;
      if (d) taken.add(spotKey(d));
    }
    for (const p of this.people) {
      taken.add(spotKey(p.gridPos()));
      const d = p.destCell;
      if (d) taken.add(spotKey(d));
      const st = p.stationCell;
      if (st) taken.add(spotKey(st));
    }
    return taken;
  }

  private freeGearSpot(room: Equipment): Cell | null {
    if (room.gx == null || room.gy == null) return null;
    const specs = gearSpecsFor(room.kind, this.state.gradeOfRoom(room));
    if (specs.length === 0) return null;
    // 食事の席と同じく、**向かっている途中の人**も埋まっていると数える
    const taken = this.takenSpots();
    // 器具の**手前**（少し下）に立つと、マシンを使っているように見える
    const spots = specs.map((sp) => roomPoint(room, sp.dx, sp.dy + 0.45));
    for (const sp of spots) if (!taken.has(spotKey(sp))) return sp;
    return spots[this.visitors.length % spots.length];
  }

  /**
   * 帰った一般客のスプライトを片付ける。
   * 「いま何人が部屋を使っているか」は sim 側が滞在時間で管理しているので、
   * ここは見た目の後始末だけ（画面に出せなかった客も、ちゃんと料金を落として帰る）。
   */
  private updateVisitors(dt: number, t: number): void {
    // 【混雑の怒りマーク】入れずに帰る客が湧いたら、その客の頭の上に出す。
    // 姿を出せた客に1つずつ割り当てる（出せなかったぶんは集計にだけ残る）。
    if (this.pendingAngry.length > 0) {
      for (const v of this.visitors) {
        if (this.pendingAngry.length === 0) break;
        if (!v.turnedAway || this.angryShown.has(v)) continue;
        this.pendingAngry.shift();
        this.angryShown.add(v);
        const w = v.worldPos();
        this.gainPopups.spawnMark(
          this.world.x + w.x * this.world.scaleX,
          this.world.y + w.top * this.world.scaleY - 24,
          "😠",
          0xe74c3c,
        );
      }
      // 姿が足りなければ、余りは捨てる（次の客を待つと溜まり続けるため）
      if (this.pendingAngry.length > 6) this.pendingAngry.length = 0;
    }
    for (const v of this.visitors) {
      v.update(dt, t);
      if (v.takeSatisfied()) this.showGuestJoy(v);
      // 予定をすませて帰り始めた瞬間に、落としていった貢献値（`+9`）を出す
      if (v.takeDeparted()) this.showGuestContribution(v);
    }
    for (const v of this.visitors) if (v.done) this.angryShown.delete(v);
    this.visitors = this.visitors.filter((v) => !v.done);
  }

  /**
   * 部屋を**使い始めた**一般客に、頭の上で喜びのマークを出す。
   * ときどき、その口コミで人気度が1上がる（抽選は sim 側 → noteGuestSatisfied）。
   */
  private showGuestJoy(v: Visitor): void {
    // 満足度・口コミ・貢献値の**抽選はすべて sim 側**（乱数は sim が持つ、という約束）。
    // 画面は結果を見せるだけ。
    const r = this.state.noteGuestSatisfied({
      crowded: v.crowded,
      turnedAway: v.turnedAway,
      grade: v.grade,
      relaxing: v.relaxing,
      extraStop: v.hasExtraStop,
    });
    v.satisfaction = r.satisfaction;
    v.contribution = r.contribution;
    // 【★ゲージ】その客がどれだけ気持ちよく過ごせているかを、頭の上で0からじわじわ伸ばす
    this.showMoodGauge(() => this.visitorTop(v), r.satisfaction);
    if (!r.mark) return;
    const w = v.worldPos();
    const sx = this.world.x + w.x * this.world.scaleX;
    const sy = this.world.y + w.top * this.world.scaleY;
    const mark = JOY_MARKS[Math.floor(this.rng.frac() * JOY_MARKS.length) % JOY_MARKS.length];
    // 人気度が上がったぶんは、色を強くして「効いた」と分かるようにする
    this.gainPopups.spawnMark(sx, sy - 24, mark, r.popularity ? 0xffd166 : 0x8fe3c8);
    if (r.popularity) {
      // 口コミで人気度が上がったことを、その場ではっきり見せる
      this.gainPopups.spawnMark(sx, sy - 44, "人気度+1", 0xffd166);
      this.refreshHud();
    }
  }

  /**
   * 満足して帰る客の貢献値（`+9`）。
   *
   * この数字は月末にまとめて人気度になる（→ sim/guests.ts の guestPopularityDelta）。
   * 満足度が高い客ほど大きいので、**良い設備を用意して混雑を避けるほど数字が大きくなる**。
   */
  private showGuestContribution(v: Visitor): void {
    if (v.contribution <= 0) return;
    const w = v.worldPos();
    const sx = this.world.x + w.x * this.world.scaleX;
    const sy = this.world.y + w.top * this.world.scaleY;
    this.gainPopups.spawn(sx, sy - 10, v.contribution, moodColor(v.satisfaction));
  }

  /**
   * 入れずに帰る客が続いていることを、理由つきで知らせる。
   *
   * 受付が使えない・歩いて行けないと**来客が全員追い返される**のに、
   * 画面には「入口で引き返す人」しか出ないので、何が悪いのか分からない。
   * 何人か続いたときだけ、原因の見当を付けて1枚出す（間隔を空けて出しすぎない）。
   */
  private noteTurnedAwayGuest(): void {
    this.turnedAwayRun++;
    if (this.turnedAwayRun < GUESTS.turnedAwayNoticeCount) return;
    if (this.time.now - this.turnedAwayNoticeAt < GUESTS.turnedAwayNoticeGapMs) return;
    this.turnedAwayNoticeAt = this.time.now;
    const n = this.turnedAwayRun;
    this.turnedAwayRun = 0;

    const stranded = this.state.strandedRooms().length;
    const detail = this.state.guestRoomsNow(this.clock.minuteOfDay).every((r) => !r.reachable)
      ? "開放している部屋へ歩いて行けない（入口のまわりを空けよう）"
      : stranded > 0
        ? `歩いて行けない部屋が ${stranded}個ある`
        : "部屋がいっぱい（開放するコマを増やすか、部屋を建てよう）";
    this.notices.push({
      icon: "🚪",
      title: `一般のお客さんが ${n}人 入れずに帰った`,
      detail,
      color: "#e67e22",
    });
  }

  /** 一般客を全員片付ける（シーンの作り直し・時間帯の切り替えで使う）。 */
  private clearVisitors(): void {
    for (const v of this.visitors) v.destroy();
    this.visitors = [];
    this.guestLines.clear();
    this.state.clearGuestOccupancy();
  }

  // ---------------------------------------------------------------- 自動イベントの通知

  /** 自動イベントを通知カードにする。選手が絡むものはタップで詳細（育成パネル）へ。 */
  private pushNotice(ev: AutoEvent): void {
    const student = ev.studentId != null ? this.state.findStudent(ev.studentId) : undefined;
    this.notices.push({
      icon: ev.icon,
      title: ev.title,
      detail: ev.detail,
      color: ev.color,
      onTap: student ? () => this.openCard(student) : undefined,
    });
    if (ev.kind === "enroll") this.refreshHud();
  }

  // ---------------------------------------------------------------- チュートリアル

  /** フッターのボタン位置などを覚えておき、チュートリアルの指し示しに使う。 */
  // ---------------------------------------------------------------- 練習の「+1」演出

  /**
   * 練習で能力が上がったときに呼ばれる。
   *
   * 1回の練習で上がる量は 0.1 前後なので、そのまま出しても「+0」にしかならない。
   * かといって端数を別に溜めると、画面に出た数字と育成パネルの数字がズレる。
   * そこで**パネルに出ている整数が繰り上がった瞬間**（41→42）にだけ +1 を出す。
   * 端数を持たなくてよいので、画面を作り直しても取りこぼさない。
   */
  private showGain(s: Student, key: StatKey, amount: number): void {
    const person = this.personById.get(s.id);
    if (!person || person.done) return; // 画面に出ていない生徒は演出しない

    // 頭の少し上に出す（立ち姿と泳ぎで原点が違うので、実際の絵の上端から測る）
    const w = person.worldPos();
    const sx = this.world.x + w.x * this.world.scaleX;
    const sy = this.world.y + w.top * this.world.scaleY;

    // 【数字】育成パネルの整数が繰り上がった瞬間だけ +1（＝パネルと必ず一致する）
    const after = s.stats[key];
    const shown = Math.floor(after) - Math.floor(after - amount);
    if (shown > 0) {
      this.gainPopups.spawn(sx, sy - 8, shown, STAT_COLOR[key]);
      // ときどき「うまくなった気がする」。伸びた瞬間だけなので、出ると気持ちがいい
      if (Math.random() < CHATTER.growChance) {
        this.speak(`s${s.id}`, () => this.personTop(person), "grew", { mood: s.mood });
      }
    }

    // 【小さな▲】上がっているあいだ中ずっと出す。
    // 泳いでいるスクール生は5つの能力が同時に伸びるので、色が代わる代わる立ちのぼる。
    const k = `${s.id}:${key}`;
    const acc = (this.tickAccum.get(k) ?? 0) + amount;
    const step = GROWTH_FX.tickStep;
    if (acc >= step) {
      this.tickAccum.set(k, acc % step);
      this.gainPopups.spawnTick(sx, sy - 4, STAT_COLOR[key]);
    } else {
      this.tickAccum.set(k, acc);
    }
  }

  /**
   * 回復設備を使い始めた選手に「♨ +体力」を出す。
   * 回復そのものは endClassSession で済んでいるので、ここは見せるだけ。
   */
  private showRecoveryFx(): void {
    if (!GROWTH_FX.showRecovery || this.recoveryFx.size === 0) return;
    // ★ゲージは何人ぶんまで出すか。クラス全員が一斉に湯へ向かうので、
    // 全員に出すと星の壁になって「+体力」の数字まで読めなくなる。
    let gauges = RECOVERY_GAUGE_MAX;
    for (const p of this.people) {
      if (!p.recovering) continue;
      const fx = this.recoveryFx.get(p.student.id);
      if (!fx) continue;
      this.recoveryFx.delete(p.student.id);
      const w = p.worldPos();
      const sx = this.world.x + w.x * this.world.scaleX;
      const sy = this.world.y + w.top * this.world.scaleY;
      this.gainPopups.spawnMark(sx, sy - 12, "♨", 0x7fd8f0);
      if (fx.energy > 0) this.gainPopups.spawn(sx + 16, sy - 2, fx.energy, 0x2ecc71);
      // 【★ゲージ】良い設備を使えた選手は機嫌が上がっている（sim 側で反映済み）。
      // その結果を頭の上でじわじわ伸ばして見せる。
      if (gauges > 0) {
        gauges--;
        this.showMoodGauge(() => this.personTop(p), p.student.mood);
      }
    }
  }

  // ---------------------------------------------------------------- 時間帯（朝・昼・夕・夜）

  /**
   * 時間帯の色を重ねる幕と、夜に灯る館内照明を用意する。
   *
   * 幕は**画面いっぱいの1枚**で、乗算合成（MULTIPLY）で施設を沈める。
   * 半透明の色を普通に重ねると全体が白っぽく濁るが、乗算なら
   * 「明かりが減った」ように暗くなるので、夜の絵が締まる。
   * 深度は施設より手前・HUD より奥（＝時計やボタンは暗くならない）。
   *
   * 【夜でも館内は明るい】幕は**敷地の内と外で2枚**に分ける。
   * 1枚で画面ぜんぶを沈めると、照明が点いているはずの施設の中まで暗くなってしまう。
   *   外の幕 … そのままの濃さ（街と空が夜になる）
   *   中の幕 … DAYTIME.indoorDim ぶんだけ（明かりが点いている見え方）
   * 内と外の切り分けは、敷地のかたち（landShapeG）をマスクにして行う。
   */
  private buildAmbient(): void {
    // 敷地のかたち。**描かずにマスクとしてだけ使う**。
    // マスクは world コンテナの拡大・移動を引き継がない（Phaser の作り）ので、
    // world には入れず、**画面座標に自分で直して**描く（→ drawLandShape）。
    this.landShapeG = this.add.graphics().setVisible(false);
    this.drawLandShape();

    const veil = (): Phaser.GameObjects.Rectangle => {
      const r = this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0)
        .setOrigin(0, 0)
        .setDepth(AMBIENT_DEPTH);
      r.setBlendMode(Phaser.BlendModes.MULTIPLY);
      return r;
    };
    // 1枚目は画面ぜんぶ（空も含む）。館内に残す薄い暗さぶんだけ掛ける
    this.ambientVeil = veil();
    // 2枚目は敷地の**外だけ**。ここで街と空を夜の濃さまで沈める。
    // マスクは1つだけ作る（同じ図形から2つ作ると、ステンシルが混ざって
    // 敷地のかたちではなく半分の平面が抜ける）。
    this.outdoorVeil = veil();
    const mask = this.landShapeG.createGeometryMask();
    mask.setInvertAlpha(true);
    this.outdoorVeil.setMask(mask);

    // 館内照明はワールドの中（床の上・人より奥）。焼いた床の上に光だまりを重ねる
    this.lightsG = this.add.graphics().setDepth(LIGHT_DEPTH).setVisible(false);
    this.world.add(this.lightsG);
    this.lightDrawn = -1;
  }

  /**
   * 敷地（外周の道路の内側）のかたちを、**画面座標で**塗る。
   * 夜の幕を「敷地の中」と「外」に分けるマスクに使う。
   *
   * マスクの図形は world コンテナの中に入れても、その拡大・移動が効かない
   *（Phaser のマスクは親の行列を引き継がない）。そのため
   * カメラの拡大率と位置を自分で掛けて、画面上のひし形として描く。
   * カメラを動かしたとき（applyCamera）と敷地を買ったときに引き直す。
   */
  private drawLandShape(): void {
    const g = this.landShapeG;
    if (!g) return;
    g.clear();
    const b = landBounds(this.map());
    const s = this.world.scaleX;
    const ox = this.world.x;
    const oy = this.world.y;
    // マスの角（グリッドの格子点）で四隅を取る。等角なので画面ではひし形になる
    const corner = (gx: number, gy: number): { x: number; y: number } => {
      const p = isoToWorld(gx, gy);
      return { x: ox + p.x * s, y: oy + p.y * s };
    };
    const pts = [
      corner(b.x0 - 0.5, b.y0 - 0.5),
      corner(b.x1 + 0.5, b.y0 - 0.5),
      corner(b.x1 + 0.5, b.y1 + 0.5),
      corner(b.x0 - 0.5, b.y1 + 0.5),
    ];
    g.fillStyle(0xffffff, 1);
    g.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true);
  }

  /**
   * 時計の時刻を画面の雰囲気に反映する。
   * 色・濃さ・照明の点きぐあいは sim/daytime.ts のカーブが決めるので、
   * ここは**そのとおりに塗るだけ**。
   */
  private syncAmbient(): void {
    const minute = this.clock.minuteOfDay;
    // 1ゲーム分より細かく見直しても絵は変わらないので、変化があったときだけ反映する
    if (Math.abs(minute - this.ambientMinute) < 1) return;
    this.ambientMinute = minute;
    const a = ambientAt(minute);
    // 幕は2枚重ね。濃さの配分は sim/daytime.ts が決める（→ veilAlphas）
    const { inside, extra } = veilAlphas(a.alpha);
    const dim = (r: Phaser.GameObjects.Rectangle | undefined, alpha: number): void => {
      if (!r) return;
      r.setFillStyle(a.color, 1);
      r.setAlpha(alpha);
      r.setVisible(alpha > 0.005);
    };
    dim(this.ambientVeil, inside);
    dim(this.outdoorVeil, extra);
    this.drawNightLights(a.light);
  }

  /**
   * 夜に灯る館内の照明。
   *
   * 床に焼いてある天井照明（4マスおき）と同じ位置に、暖色の光だまりを重ねる。
   * **明るさが変わったときだけ描き直す**ので、毎フレームの負担はゼロ。
   */
  private drawNightLights(level: number): void {
    const g = this.lightsG;
    if (!g) return;
    // 0.04 きざみでだけ描き直す（1日ぶんでも数十回しか描かない）
    const q = Math.round(level * 25) / 25;
    if (q === this.lightDrawn) return;
    this.lightDrawn = q;
    g.clear();
    if (q <= 0.02) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const map = this.map();
    const b = groundCells(map);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const stride = DAYTIME.lightStride;
    for (let gy = b.minY; gy <= b.maxY; gy++) {
      for (let gx = b.minX; gx <= b.maxX; gx++) {
        // 焼いてある天井照明と同じマス（gx%4===1 && gy%4===1）に灯す
        if (gx % stride !== 1 || gy % stride !== 1) continue;
        const kind = floorKindAt(map, gx, gy);
        if (!isIndoorFloor(kind)) continue;
        const p = isoToWorld(gx, gy);
        // 内側から外側へ2枚重ね、灯りの中心が明るいようにする
        const warm = kind === "sauna" ? 0xffb066 : 0xffe9b0;
        g.fillStyle(warm, DAYTIME.lightAlpha * q * 0.6);
        this.fillDiamond(g, p.x, p.y, hw * 1.5, hh * 1.5);
        g.fillStyle(warm, DAYTIME.lightAlpha * q);
        this.fillDiamond(g, p.x, p.y, hw * 0.8, hh * 0.8);
      }
    }
  }

  /** マスの形（菱形）を塗る小道具。 */
  private fillDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, hw: number, hh: number): void {
    g.beginPath();
    g.moveTo(x, y - hh);
    g.lineTo(x + hw, y);
    g.lineTo(x, y + hh);
    g.lineTo(x - hw, y);
    g.closePath();
    g.fillPath();
  }

  // ---------------------------------------------------------------- 吹き出し（セリフ・気持ち）

  /**
   * ワールド座標 → 画面座標。
   * ワールドは拡大縮小・スクロールするので、画面に置く演出はここを通して位置を合わせる。
   */
  private readonly toScreen = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: this.world.x + p.x * this.world.scaleX,
    y: this.world.y + p.y * this.world.scaleY,
  });

  /**
   * ときどき、誰か1人に吹き出しを出す。
   *
   * 全員に出すとうるさいので **(1)一定の間隔で (2)確率で (3)1人だけ** に絞り、
   * さらに同じ人が続けてしゃべらないよう間隔を空ける（→ config の CHATTER）。
   * 「誰が」ではなく「何をしているか」でセリフが決まるので、
   * 泳いでいる子は泳いでいる言葉を、湯に浸かっている客は湯の言葉を言う。
   */
  private pollChatter(dt: number): void {
    this.chatterTimer -= dt;
    if (this.chatterTimer > 0) return;
    this.chatterTimer = CHATTER.intervalSec;
    if (this.bubbles.activeCount() >= CHATTER.maxConcurrent) return;
    if (Math.random() > CHATTER.chance) return;

    // 覚えている「最後にしゃべった時刻」が溜まりすぎないよう、たまに掃除する
    if (this.chatterAt.size > CHATTER_MEMORY_MAX) this.pruneChatterMemory();

    const people = this.people.length;
    const visitors = this.visitors.length;
    const staff = this.staff.length;
    const total = people + visitors + staff;
    if (total === 0) return;
    const i = Math.floor(Math.random() * total);
    if (i < people) {
      const p = this.people[i];
      this.speak(`s${p.student.id}`, () => this.personTop(p), p.activity, {
        mood: p.student.mood,
        energy01: p.energyRatio,
      });
      return;
    }
    if (i < people + visitors) {
      const v = this.visitors[i - people];
      this.speak(`g${v.seed}`, () => this.visitorTop(v), v.activity, {
        mood: v.satisfaction > 0 ? v.satisfaction : undefined,
      });
      return;
    }
    const sp = this.staff[i - people - visitors];
    this.speak(`f${i - people - visitors}`, () => ({ x: sp.worldPos().x, y: sp.topY() }), sp.activity, {});
  }

  /** 選手・一般客の頭の上（消えていたら null＝吹き出しもそこで終わる）。 */
  private personTop(p: Person): { x: number; y: number } | null {
    if (p.done) return null;
    const w = p.worldPos();
    return { x: w.x, y: w.top };
  }

  private visitorTop(v: Visitor): { x: number; y: number } | null {
    if (v.done) return null;
    const w = v.worldPos();
    return { x: w.x, y: w.top };
  }

  /**
   * 疲れマークを出す相手を選び直す（→ gfx/FatigueMark.ts）。
   *
   * 体力は育成パネルを開かないと見えないので、館内を眺めているだけでは
   * 「この子はもう限界」に気づけなかった。**疲れている順に** 印を配ると、
   * 画面が印だらけにならず、いちばん危ない子から目に入る。
   * 一般客は体力を持たないので対象にしない（選手・スクール生だけ）。
   */
  private syncFatigueMarks(): void {
    const tired: { id: number; ratio: number; person: Person; level: FatigueLevel }[] = [];
    for (const p of this.people) {
      if (p.done) continue;
      const level = fatigueLevelOf(p.energyRatio);
      if (!level) continue;
      tired.push({ id: p.student.id, ratio: p.energyRatio, person: p, level });
    }
    tired.sort((a, b) => a.ratio - b.ratio);
    if (import.meta.env.DEV && probeKind() === "tired") {
      probeTired(
        `people=${this.people.length} tired=${tired.length} ` +
          this.people.slice(0, 4).map((p) => p.energyRatio.toFixed(2)).join(","),
      );
    }
    this.fatigueMarks.set(
      tired
        .slice(0, FATIGUE_MARK.maxMarks)
        .map((t) => ({ id: t.id, level: t.level, anchor: () => this.personTop(t.person) })),
    );
  }

  /**
   * 吹き出しを1つ出す。
   * 同じ人が続けてしゃべらないよう、`key` ごとに間隔を見る。
   * 文言の抽選は Math.random（見た目だけの乱数なので、育成の乱数には触らない）。
   */
  private speak(
    key: string,
    anchor: () => { x: number; y: number } | null,
    activity: ChatterActivity | null,
    st: { mood?: number; energy01?: number },
  ): void {
    if (!activity) return;
    const now = this.time.now;
    const last = this.chatterAt.get(key) ?? -1e9;
    if (now - last < CHATTER.perPersonCooldownSec * 1000) return;
    const c = makeChatter(activity, st, Math.random);
    if (!c) return;
    this.chatterAt.set(key, now);
    this.bubbles.spawn(anchor, c.text, c.tone);
  }

  /** もう間隔を気にしなくてよい記録（＝十分に古いもの）を捨てる。 */
  private pruneChatterMemory(): void {
    const limit = this.time.now - CHATTER.perPersonCooldownSec * 1000;
    for (const [k, at] of this.chatterAt) if (at < limit) this.chatterAt.delete(k);
  }

  // ---------------------------------------------------------------- 満足度（★ゲージ）

  /**
   * 頭の上に★ゲージを出す（じわじわ伸びる）。
   * @param sticky true＝消えずに付いたまま（タップして選んでいる人）
   */
  private showMoodGauge(anchor: () => { x: number; y: number } | null, value: number, sticky = false): void {
    this.moodGauges.spawn(anchor, value, 0, sticky);
  }

  /**
   * タップして選んでいる選手の★ゲージを、付けっぱなしにする。
   * 選択を外したら消す。練習中に機嫌が動くので、値は毎フレーム入れ直す。
   */
  private syncSelectedMood(): void {
    const sel = this.selected;
    if (!sel || sel.done) {
      if (this.stickyMoodFor != null) {
        this.moodGauges.clearSticky();
        this.stickyMoodFor = undefined;
      }
      return;
    }
    // 別の選手を選び直したら、前の子に付いていたゲージを外して付け替える
    //（付けっぱなしのゲージが1つしか無いことに頼ると、前の子を追い続けてしまう）
    if (this.stickyMoodFor !== sel.student.id || !this.moodGauges.hasSticky()) {
      this.moodGauges.clearSticky();
      this.stickyMoodFor = sel.student.id;
      this.showMoodGauge(() => this.personTop(sel), sel.student.mood, true);
    }
    this.moodGauges.updateSticky(sel.student.mood);
  }

  // ---------------------------------------------------------------- HUD

  private buildHud(): void {
    const g = this.add.graphics().setDepth(2000);
    g.fillStyle(0x102437, 1);
    g.fillRect(0, 0, GAME_WIDTH, HUD_H);
    g.lineStyle(2, 0x1f3a52, 1);
    g.lineBetween(0, HUD_H, GAME_WIDTH, HUD_H);

    this.dateText = this.txt(16, 22, "", 18, COLORS.textAccent, true).setOrigin(0, 0.5).setDepth(2001);
    // 時刻は「時間帯のしるし＋24時間表記」（朝は🌅／昼は☀／夕は🌇／夜は🌙）。
    // 画面の色味だけでは分かりにくい「いま何時ごろか」を、1つの表示で伝える。
    this.timeText = this.txt(GAME_WIDTH - 16, 22, "", 20, COLORS.textLight, true).setOrigin(1, 0.5).setDepth(2001);
    // 在籍数。データ選択画面の「在籍◯名」と同じ数字を、遊んでいる間も見られるようにする。
    // 右に★ゲージを置くぶん、少し左へ寄せてある。
    this.memberText = this.txt(318, 22, "", 13.5, "#aed6f1").setOrigin(0.5, 0.5).setDepth(2001);
    // 【満足度】クラブ全体の機嫌を★5つで。値が動くと、参考画像の★ゲージのように
    // じわじわ伸び縮みする。**在籍数と時刻のあいだの空きに収まる大きさ**にしてあるので、
    // ここの半径を上げるときは左右がぶつからないか確かめること。
    this.clubStars = new StarMeter(this, 400, 22, { radius: 4.6 });
    this.clubStars.setDepth(2001);
    this.clubStars.setValue(this.state.clubMood(), true);
    this.gemsText = this.txt(16, 58, "", 17, COLORS.textLight, true).setOrigin(0, 0.5).setDepth(2001);
    this.classText = this.txt(GAME_WIDTH / 2, 58, "", 14, COLORS.textLight, true).setOrigin(0.5, 0.5).setDepth(2001);
    this.popText = this.txt(GAME_WIDTH - 16, 58, "", 14, "#aed6f1").setOrigin(1, 0.5).setDepth(2001);
    // クラブの格（ジェムの右）。上がると色が変わる。
    this.clubText = this.txt(GAME_WIDTH / 2 - 62, 22, "", 13, "#95a5a6", true).setOrigin(0.5, 0.5).setDepth(2001);

    // 【情熱】3段目。特別練習の燃料なので、所持ジェムと同じくらい目に入る場所に置く。
    // 溜まるほど赤く燃える色にして、満タンが近いことが色で分かるようにする。
    // 【棒を150→110に詰めた】右どなりに格ゲージを置いたため（2026-09-21）。
    // 情熱の値は満タンで「100/100」の7字まで伸びるので、そのぶんを見込んで空ける。
    this.passionGauge = new Gauge(this, 16, 92, 110, 11, "🔥 情熱", PASSION.max, {
      colorAt: (r) => (r < 0.34 ? 0x8e5a2f : r < 0.7 ? 0xe67e22 : 0xf1503a),
      labelSize: 13,
      valueSize: 13,
      labelColor: "#f0b27a",
      valueColor: "#f7dc6f",
      showMax: true,
    });
    this.passionGauge.setDepth(2001);
    this.passionGauge.setValue(this.state.passion);
    this.passionShown = this.state.passion;

    /**
     * 【クラブの格ゲージ】3段目の右。
     *
     * この遊びの**鍵をぜんぶ握っているのは格**（施設の解放・コーチの質・入会）。
     * それなのにゲージが付いていたのは人気度のほう（しかもフッターを開かないと見えない）で、
     * 格は文字のラベルだけだった。「次の格まであといくつ」を常に見せて、
     * 大会に出る理由をその場で分かるようにする。
     * ラベルは**次の格の呼び名**（いまの格は1段目に出ている）。
     */
    // 【幅の計算】いちばん長くなる形で右端までを見積もる：
    //   x292 ＋ ラベル「→世界の名門」約72 ＋ 12 ＋ 棒70 ＋ 10 ＋ 値「あと14000」約58 ＝ 514（画面は540）。
    // ラベルは格が上がると伸びるので、**いちばん長い呼び名**で測ること。
    this.clubGauge = new Gauge(this, 292, 92, 70, 11, "", CLUBRANK.tiers[1].need, {
      colorAt: () => 0x5dade2,
      labelSize: 12,
      valueSize: 12,
      labelColor: "#7fd1ae",
      valueColor: "#aed6f1",
      valueFormat: (v, max) => {
        const remain = Math.ceil(max - v);
        return remain > 0 ? `あと${remain}` : "達成";
      },
    });
    this.clubGauge.setDepth(2001);

    /**
     * 【今月の一手】4段目。中身は sim/advice.ts が決める（ここは出すだけ）。
     * 押すとその画面へ飛ぶので、帯ぜんぶを当たり判定にする。
     */
    this.adviceText = this.txt(38, 126, "", 13, "#aed6f1", true).setOrigin(0, 0.5).setDepth(2002);
    setJaWrap(this.adviceText, GAME_WIDTH - 52);
    this.adviceIcon = this.txt(16, 126, "", 14, "#aed6f1").setOrigin(0, 0.5).setDepth(2002);
    this.add
      .rectangle(GAME_WIDTH / 2, 126, GAME_WIDTH, 26, 0x16304a, 0.55)
      .setDepth(2001)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        this.followAdvice();
      });

    /**
     * 【注目選手】5段目。★を付けた選手を横に並べる。
     * 1人ぶんの幅は決め打ちにせず、人数で割る（1人のときに名前が右端まで伸びないように）。
     */
    this.pinHint = this.txt(16, 152, "", 12, "#7f8fa0").setOrigin(0, 0.5).setDepth(2001);
    for (let i = 0; i < PIN_MAX; i++) {
      const chip = this.add.container(0, 152).setDepth(2001);
      const bg = this.add.rectangle(0, 0, 160, 22, 0x1c3550, 1).setStrokeStyle(1, 0x2e4a66, 1);
      const label = this.txt(0, 0, "", 12, "#ecf0f1", true).setOrigin(0.5, 0.5);
      chip.add([bg, label]);
      chip.setVisible(false);
      /**
       * 【札の操作】軽く押す＝★の選手だけの名簿、長押し＝その子の選手カード。
       *
       * 札は22pxしかないので、押し分けをボタン2つに割ると指で当たらない。
       * 一覧の行と**同じ約束**（長押しで本人を開く → ui/longPress.ts）にそろえてある。
       * 誰の札かは押した瞬間に聞き直す（★を付け替えると並びが変わるため、
       * 作ったときの選手を覚えていると別人が開く）。
       */
      attachLongPress(
        this,
        bg,
        () => this.state.pinnedStudents()[i] ?? null,
        (s) => this.openCard(s, this.state.pinnedStudents()),
        () => true,
        () => this.onRosterPinned(),
      );
      this.pinChips.push({ chip, bg, label, id: -1 });
    }
  }

  /** 「今月の一手」を押したときの行き先。 */
  private followAdvice(): void {
    switch (this.adviceGo) {
      case "timetable":
        this.onTimetable();
        return;
      case "coach":
        this.onCoach();
        return;
      case "comp":
        this.onCompetitions();
        return;
      case "shop":
        this.onShop();
        return;
      case "roster":
        this.onRoster();
        return;
      case "events":
        this.onEvents();
        return;
      default:
        return;
    }
  }

  /**
   * 情熱ゲージを合わせ、増えていたら軽い演出を出す。
   *
   * 客1人ぶんは 1〜2 と小さいので、**溜めてから1回だけ**出す（→ PASSION.popupThreshold）。
   * 大会の優勝のような大きい増え方は、その場で出る。
   */
  private syncPassion(): void {
    const g = this.passionGauge;
    if (!g) return;
    const now = this.state.passion;
    if (this.passionShown < 0) this.passionShown = now;
    const delta = now - this.passionShown;
    this.passionShown = now;
    g.setValue(now);
    if (delta > 0) this.passionPending += delta;
    else if (delta < 0) this.passionPending = 0; // 使ったぶんは演出しない
    if (this.passionPending < PASSION.popupThreshold) return;
    const amount = Math.round(this.passionPending);
    this.passionPending = 0;
    this.showPassionGain(amount);
  }

  /** 「🔥+N」をゲージの上に軽く浮かせる。 */
  private showPassionGain(amount: number): void {
    if (amount <= 0) return;
    // 情熱ゲージの真ん中から浮かせる。以前は x=310 に出していて、右隣の「最高位」の文字に重なっていた
    const t = this.txt(130, 90, `🔥+${amount}`, 15, "#f7dc6f", true).setOrigin(0.5, 0.5).setDepth(2002);
    this.tweens.add({
      targets: t,
      y: 78,
      alpha: 0,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
    // ゲージそのものも一瞬だけ大きくして、火が入った感じを出す
    this.tweens.add({
      targets: this.passionGauge,
      scaleX: 1.04,
      scaleY: 1.25,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  private refreshHud(): void {
    this.refreshHudValues();
    this.refreshClassLine();
    // 画面で何か直した直後は、間引きを待たずに案内を出し直す
    // （コーチを付けたのに「コーチが居ない」と出たままにしない）
    this.refreshAdvice();
    this.refreshPins();
  }

  /**
   * HUD の数字（年月・時刻・所持ジェム・在籍・人気・クラブの格）。
   *
   * **毎フレーム呼ぶ**。所持ジェムは一般客の利用料などで裏でも増えるので、
   * 「イベントが起きたときだけ更新」にすると HUD だけ古い額を出し続け、
   * あとから開いたイベント画面・大会画面と数字が食い違う（＝過去の不具合）。
   * 変わっていないときは setText を呼ばないので、毎フレームでも負荷は無い。
   */
  private refreshHudValues(): void {
    const set = (t: Phaser.GameObjects.Text | undefined, key: string, s: string): void => {
      if (!t) return;
      if (this.hudCache.get(key) === s) return;
      this.hudCache.set(key, s);
      t.setText(s);
    };
    set(this.dateText, "date", `${this.state.year}年目 ${this.state.month}月 ${this.clock.weekLabel()}`);
    // 時間帯のしるしを時刻の前に付ける（🌅朝／☀昼／🌇夕方／🌙夜）
    set(this.timeText, "time", `${ambientAt(this.clock.minuteOfDay).icon} ${this.clock.timeLabel()}`);
    set(this.gemsText, "gems", `◆ ${this.state.gems}`);
    set(this.memberText, "members", `在籍 ${this.state.totalMembers()}名`);
    set(this.popText, "pop", `人気 ${Math.round(this.state.popularity)}`);
    if (this.gauge) this.gauge.setValue(this.state.popularity, popularityGaugeGoal(this.state.popularity));
    this.syncPassion();

    if (this.clubText) {
      const tier = this.state.clubTier();
      const s = `クラブ ${clubRankShort(tier)}`;
      if (this.hudCache.get("club") !== s) {
        this.hudCache.set("club", s);
        this.clubText.setText(s).setColor(clubRankColor(tier));
      }
    }
    // 【格ゲージだけ毎フレーム】中身はただの足し算なので軽い。
    // 「今月の一手」と注目選手は重いので update 側で間引く（→ hudSlowAccum）。
    this.refreshClubGauge();
  }

  /**
   * クラブの格ゲージ。**次の格まであといくつ**を出す。
   *
   * 満タンの値は「その段の幅」（次の必要点 − いまの段の必要点）にする。
   * 通算スコアをそのまま入れると、段が上がるほど棒がほとんど動かなくなる。
   */
  private refreshClubGauge(): void {
    const g = this.clubGauge;
    if (!g) return;
    const p = this.state.clubRankProgress();
    if (p.nextNeed == null) {
      g.setLabel("最高位", "#f7dc6f");
      g.setValue(1, 1);
      return;
    }
    g.setLabel(`→${clubRankShort(p.tier + 1)}`, clubRankColor(p.tier + 1));
    g.setValue(p.score - p.need, p.nextNeed - p.need);
  }

  /**
   * 「今月の一手」。中身の決め方は sim/advice.ts。
   * 毎フレーム呼ぶが、文字が変わらないうちは setText しない。
   */
  private refreshAdvice(): void {
    if (!this.adviceText || !this.adviceIcon) return;
    const a = monthlyAdvice(this.state, this.clock.weekLabel());
    if (!a) {
      this.adviceText.setText("");
      this.adviceIcon.setText("");
      this.adviceGo = undefined;
      return;
    }
    this.adviceGo = a.go;
    if (this.hudCache.get("advice") === a.text + a.color) return;
    this.hudCache.set("advice", a.text + a.color);
    this.adviceIcon.setText(a.icon).setColor(a.color);
    this.adviceText.setText(a.text).setColor(a.color);
  }

  /**
   * 注目選手の札。★を付けた選手だけ、名前と「いまどうなっているか」を出す。
   *
   * 出す中身は**その子を気にかける理由**になるもの
   * ＝ 格（強くなったか）と自己ベスト（速くなったか）。
   * 能力の数値はここに出さない（5つあるうえ、動きが遅すぎて札では分からない）。
   */
  private refreshPins(): void {
    const pinned = this.state.pinnedStudents();
    if (this.pinHint) {
      const hint = pinned.length === 0 ? "★ 注目の選手：名簿で★を付けると、ここで追えます" : "";
      if (this.hudCache.get("pinHint") !== hint) {
        this.hudCache.set("pinHint", hint);
        this.pinHint.setText(hint);
      }
      this.pinHint.setVisible(pinned.length === 0);
    }
    // 札の幅は人数で割る（1人のときに右端まで伸びないよう、上限も置く）
    const gap = 8;
    const avail = GAME_WIDTH - 32;
    const w = Math.min(168, (avail - gap * (pinned.length - 1)) / Math.max(1, pinned.length));
    const total = w * pinned.length + gap * (pinned.length - 1);
    let x = (GAME_WIDTH - total) / 2 + w / 2;
    this.pinChips.forEach((c, i) => {
      const s = pinned[i];
      if (!s) {
        c.chip.setVisible(false);
        c.id = -1;
        return;
      }
      c.chip.setVisible(true).setX(x);
      c.bg.setSize(w, 22);
      // 当たり判定は setSize では動かない（押せる範囲が作ったときの幅のまま残る）
      const hit = c.bg.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      hit?.setTo(0, 0, w, 22);
      /**
       * 札の末尾は「その子を気にかける理由」。
       * 記録があれば自己ベスト（速くなったかが分かる唯一の数字）、
       * まだ無ければ学年（誰だったかを思い出せる）。
       * 「記録なし」と出すと、始めたばかりのときに3人とも同じ札になって見分けが付かない。
       *
       * **タイムには種目を添える**（2026-09-21）。泳法も距離も書かずに秒だけ出すと、
       * 50mの記録なのか200mの記録なのか分からず、速いのか遅いのかも判断できない。
       * 狭いので短い呼び名（自由/背/平/バタ/個メ → sim/student の STROKE_SHORT）にする。
       */
      const ev = s.bestTimeEvent;
      const tail =
        s.bestTimeSec > 0
          ? `${ev ? `${STROKE_SHORT[ev.stroke]}${ev.distance} ` : ""}${formatTime(s.bestTimeSec)}`
          : s.grade;
      const line = `★${s.name} ${rankShort(rankOf(s))} ${tail}`;
      const key = `pin${i}`;
      if (this.hudCache.get(key) !== line) {
        this.hudCache.set(key, line);
        c.label.setText(line);
        // 名前が長いと札からはみ出すので、入るまで少しだけ縮める
        c.label.setFontSize(12);
        let size = 12;
        while (c.label.width > w - 10 && size > 9) {
          size -= 0.5;
          c.label.setFontSize(size);
        }
      }
      c.id = s.id;
      x += w + gap;
    });
  }

  /**
   * 注目選手に良いことが起きたら、その札を光らせる。
   * 成長が遅い遊びなので、**起きた瞬間にその場で**見せないと気づかれない。
   */
  private flashPin(studentId: number, text: string, color: string): void {
    const c = this.pinChips.find((p) => p.id === studentId);
    if (!c || !c.chip.visible) return;
    c.bg.setFillStyle(0x2e7d5b, 1);
    this.tweens.add({
      targets: c.chip,
      scaleX: { from: 1.12, to: 1 },
      scaleY: { from: 1.12, to: 1 },
      duration: 420,
      ease: "Back.easeOut",
      onComplete: () => c.bg.setFillStyle(0x1c3550, 1),
    });
    this.toast(text, color, 1800, true);
  }

  /**
   * HUD の「いま誰が練習しているか」の行。
   * 割り当ての計算（lineupAt）が重いので、毎フレームではなく間引いて呼ぶ。
   */
  private refreshClassLine(): void {
    // 複数プールなら複数クラスが並行して練習する。
    // 出す人数は「そのコマで実際に練習している人数 / そのプールの枠」。
    // クラス全体の在籍数を出すと、1コマ60人のプールで「幼児(100)」のような表示になってしまう。
    const running = this.state.runningLessons(this.clock.minuteOfDay);
    if (running.length > 0) {
      const lineup = this.state.lineupAt(this.clock.minuteOfDay);
      // 同じクラスを2つのプールで開いているときは1つにまとめる（スクールは重ねて開ける）
      const byClass = new Map<ClassId, { n: number; cap: number }>();
      for (const l of lineup) {
        // 定員はクラスの定員（育成B24/育成A24/選手18/プロ8）。
        // ここにプールの練習枠(60)を出すと「育成B(4/60)」になって定員が分からない。
        const cap = isSchoolClass(l.classId) ? venueSlotsOf(l.pool.kind) : this.state.capacityOf(l.classId);
        const cur = byClass.get(l.classId);
        if (cur) {
          cur.n += l.members.length;
          if (isSchoolClass(l.classId)) cur.cap += cap;
        } else byClass.set(l.classId, { n: l.members.length, cap });
      }
      const rows = [...byClass].map(([c, v]) => ({ label: classLabel(c), full: `${classLabel(c)} ${v.n}/${v.cap}` }));
      /**
       * 【左右の文字とかぶらない長さに縮める】（2026-09-27）
       * 同じ時間に何クラスも練習していると「幼児 60/60 / 学童 60/60 / 育成B 3/24 … 練習中」が
       * 左の所持金・右の人気度に重なっていた。入る長さまで、人数 → クラス名の順に省く。
       */
      const left = this.gemsText.x + this.gemsText.width + 10;
      const right = this.popText.x - this.popText.width - 10;
      const maxW = 2 * Math.max(40, Math.min(GAME_WIDTH / 2 - left, right - GAME_WIDTH / 2));
      const candidates = [
        `${rows.map((r) => r.full).join(" / ")} 練習中`,
        `${rows.map((r) => r.label).join("・")} 練習中`,
        `${rows.length}クラス練習中`,
      ];
      this.classText.setColor(COLORS.textAccent);
      for (const c of candidates) {
        this.classText.setText(c);
        if (this.classText.width <= maxW) break;
      }
    } else {
      const guests = this.state.guestRoomsNow(this.clock.minuteOfDay).filter((r) => r.reachable).length;
      // 時間帯の賑わい（放課後・仕事帰りは混む／昼下がりは空く）を一言添える
      const busy = crowdLabel(this.clock.minuteOfDay);
      this.classText
        .setText(guests > 0 ? `一般開放中（${guests}か所）${busy ? ` ${busy}` : ""}` : "休館中")
        .setColor(guests > 0 ? "#7fd1ae" : COLORS.textDim);
    }
  }

  // ---------------------------------------------------------------- フッター

  /**
   * 画面下のメニュー。矢印で開け閉めできる。
   *
   *  開いているとき（FOOTER_H）… 人気度・システム・速度・時間送り・8つの大きなボタン
   *  閉じているとき（FOOTER_BAR_H）… 矢印と速度だけの細い帯。施設がそのぶん広く見える。
   *
   * 位置は「開いたとき」「閉じたとき」の2通りを layoutFooter() で入れ替える。
   * ボタンは作り直さない（作り直すと押した瞬間に一瞬固まる）。
   */
  private buildFooter(): void {
    const top = GAME_HEIGHT - FOOTER_H;

    this.footerBg = this.add.graphics().setDepth(2000);
    this.footerMenu = this.add.container(0, 0).setDepth(2001);
    this.footerBar = this.add.container(0, 0).setDepth(2001);

    // ---- 開いているときだけ出るもの
    // 人気度に上限は無いので、ゲージは「次の目標」まで貯まっていく棒にする（→ sim/popularity.ts）
    const goal = popularityGaugeGoal(this.state.popularity);
    this.gauge = new Gauge(this, 18, top + 22, 120, 12, "人気度", goal);
    this.gauge.setValue(this.state.popularity, goal);
    this.footerMenu.add(this.gauge);

    this.footerMenu.add(
      new Button(this, 476, top + 22, 116, 34, "≡ システム", () => this.onSystem(), {
        color: 0x394a5c,
        hoverColor: 0x4a6076,
        fontSize: 14,
      }),
    );
    this.footerMenu.add(this.txt(14, top + 64, "速度", 14, COLORS.textDim).setOrigin(0, 0.5));
    // 「次の時間帯へ」（開発用のスキップ）は 2026-09-27 に外した

    // アクション（8ボタンを2段×4に）。1段に並べると指で押し分けられないため。
    //  上段＝人と練習まわり／下段＝経営と進行まわり
    // 「建設モード」は設備画面の中にあるので、フッターからは外して「設備・建設」に統合した。
    const acts: [string, () => void, number, number][] = [
      ["名簿", () => this.onRoster(), 0x39597e, 0x4a6f9c],
      ["練習", () => this.onClassPractice(), 0xa03d3d, 0xc4544f],
      ["時間割", () => this.onTimetable(), 0xa03d3d, 0xc4544f],
      ["コーチ", () => this.onCoach(), 0x39597e, 0x4a6f9c],
      ["設備・建設", () => this.onShop(), 0x8e6a2f, 0xb8893c],
      ["イベント", () => this.onEvents(), 0x2e7d5b, 0x3fa876],
      ["大会", () => this.onCompetitions(), 0x8e6a2f, 0xb8893c],
      ["セーブ", () => this.onSaveButton(), 0x2c5f8f, 0x3d78b0],
    ];
    const cols = 4;
    const marginX = 8;
    const gap = 10; // 当たり判定の余白（左右3pxずつ）を足しても隣と重ならない間隔
    const bw = (GAME_WIDTH - marginX * 2 - gap * (cols - 1)) / cols;
    const bh = 62; // 指で押しやすいように大きめ（以前は46）
    const rowY = [top + 118, top + 186];

    acts.forEach(([label, fn, color, hover], i) => {
      const cx = marginX + bw / 2 + (i % cols) * (bw + gap);
      const cy = rowY[Math.floor(i / cols)];
      this.footerMenu.add(new Button(this, cx, cy, bw, bh, label, fn, { color, hoverColor: hover, fontSize: 17 }));
    });

    // ---- 開いていても閉じていても出るもの（位置だけ入れ替える）
    this.footerToggle = new Button(this, 330, top + 22, 156, 40, "▼ とじる", () => this.toggleFooter(), {
      color: 0x2c5f8f,
      hoverColor: 0x3d78b0,
      fontSize: 15,
    });
    this.footerBar.add(this.footerToggle);

    const speeds: Speed[] = [1, 2, 4];
    const labels = ["等倍", "2倍", "4倍"];
    speeds.forEach((sp, i) => {
      const btn = new Button(this, 76 + i * 58, top + 64, 52, 34, labels[i], () => this.onSpeed(sp), { fontSize: 14 });
      this.footerBar.add(btn);
      this.speedBtns.push(btn);
    });

    // 「建設」を指すチュートリアルは、入口である「設備・建設」を指す
    // 速度ボタン（4倍）とステージ中央も指し示せるようにしておく

    this.footerOpen = settings().menuOpen;
    this.layoutFooter();
    this.updateSpeedButtons();
  }

  /** いまのフッターの高さ。 */
  private footerHeight(): number {
    // 建設・配置モードでは専用パネルがフッターの場所を使う（高さは開いたときと同じ）
    if (this.build || this.placement) return FOOTER_H;
    return this.footerOpen ? FOOTER_H : FOOTER_BAR_H;
  }

  /**
   * 建設・配置モードのあいだはメニューを引っ込める。
   * 出したままだと、上に重なった専用パネルの裏でボタンが押せてしまう。
   */
  private refreshFooterVisibility(): void {
    // 開発の見た目確認（&hud=0）では、施設だけを画面いっぱいに見たいので常に引っ込める
    const overlay = !!this.build || !!this.placement || !!this.dev?.hideHud;
    this.footerBg.setVisible(!overlay);
    this.footerBar.setVisible(!overlay);
    this.footerMenu.setVisible(!overlay && this.footerOpen);
    if (overlay !== this.footerOverlayActive) {
      this.footerOverlayActive = overlay;
      this.applyCamera(); // 施設が見える範囲が変わるので寄せ直す
    }
  }

  /** メニューの開け閉め。閉じるとステージが広がるので、カメラも寄せ直す。 */
  private toggleFooter(): void {
    this.setFooterOpen(!this.footerOpen);
  }

  private setFooterOpen(open: boolean): void {
    if (this.footerOpen === open) return;
    this.footerOpen = open;
    this.layoutFooter();
    this.applyCamera();
    if (settings().menuOpen !== open) void updateSettings({ menuOpen: open });
  }

  /** 開閉に合わせて、下地の高さ・ボタンの位置・表示を入れ替える。 */
  private layoutFooter(): void {
    const open = this.footerOpen;
    const h = open ? FOOTER_H : FOOTER_BAR_H;
    const top = GAME_HEIGHT - h;

    this.footerBg.clear();
    this.footerBg.fillStyle(0x0a1622, open ? 1 : 0.92);
    this.footerBg.fillRect(0, top, GAME_WIDTH, h);
    this.footerBg.lineStyle(2, 0x1f3a52, 1);
    this.footerBg.lineBetween(0, top, GAME_WIDTH, top);

    this.refreshFooterVisibility();

    if (open) {
      this.footerToggle.setPosition(330, top + 22).setLabel("▼ とじる");
      this.speedBtns.forEach((b, i) => b.setPosition(76 + i * 58, top + 64));
    } else {
      // 細い帯：矢印を左に大きく、速度をその右に並べる
      this.footerToggle.setPosition(150, top + 31).setLabel("▲ メニュー");
      this.speedBtns.forEach((b, i) => b.setPosition(300 + i * 58, top + 31));
    }
  }

  /**
   * 速度を変える。選んだ速度は「次に手動で変えるまで」保持される
   * （練習・イベント・大会をまたいでも等倍に戻さない）。
   * 次回以降の新規ゲームでもこの速度で始まるよう、設定にも覚えさせる。
   */
  private onSpeed(sp: Speed): void {
    this.clock.setSpeed(sp);
    this.updateSpeedButtons();
    if (settings().defaultSpeed !== sp) void updateSettings({ defaultSpeed: sp });
  }

  private updateSpeedButtons(): void {
    const speeds: Speed[] = [1, 2, 4];
    this.speedBtns.forEach((b, i) => {
      const on = this.clock.speed === speeds[i];
      b.setAlpha(on ? 1 : 0.55);
    });
  }

  // ---------------------------------------------------------------- 時間イベント

  private onDayRolled(weekToMonth: boolean): void {
    this.state.onDayRoll(); // 日次回復（体力全回復・コンディション少し戻る）
    this.clearVisitors(); // 一般客は日をまたがない

    if (weekToMonth) {
      const result = this.state.advanceMonth();
      this.refreshHud();
      this.showMonthlyReport(result);
      /**
       * 【設備が足りない】混雑で使えなかった人が月にある数を超えたら、
       * お知らせではなく**イベントの演出**で大きく伝える（→ GUESTS.crowdNoticeAt）。
       * 人気が出るほど混むので、ここで気づけないと
       * 「人気度が上がったのに評判が落ちる」の理由が分からないままになる。
       */
      if (result.crowd.notify) {
        // 足りない設備を名前と人数で並べる（増やす先が分からないと直せない）
        const list = result.crowd.byKind
          .slice(0, 3)
          .map((r) => `${equipmentDef(r.kind).label} ${r.count}人`)
          .join("・");
        this.celebrate.push({
          icon: "😠",
          title: "設備が足りていない！",
          subtitle: list ? `${list}　が使えず帰った（全体 ${result.crowd.total}人）` : `使えなかった人が今月 ${result.crowd.total}人`,
          color: "#e74c3c",
          burst: true,
        });
        this.notices.push({
          icon: "😠",
          title: `混雑で使えなかった人 ${result.crowd.total}人`,
          detail: list ? `${list}　増やすか、グレードを上げよう` : "設備を増やそう",
          color: "#e74c3c",
          onTap: () => this.onShop(),
        });
      }
      if (result.ageEvents.length > 0) {
        // 予告と退会が混ざるので、数だけでなく「何が起きたか」を出す
        const head =
          result.leavingSoon.length > 0 ? `退会の予告 ${result.leavingSoon.length}人` : "進級/退会";
        this.time.delayedCall(1100, () => this.toast(`${head}：${result.ageEvents.length}件`, "#e67e22"));
      }
      /**
       * 【退会の予告】年齢を超えた子は来月で退会する。
       * 猶予は1ヶ月しかないので、お知らせに1人ずつ流して
       * **押せばその子の昇格先を選ぶ画面が開く**ようにしてある（そこで残せる）。
       */
      for (const s of result.leavingSoon) {
        this.notices.push({
          icon: "🚨",
          title: `${s.name} が来月で退会`,
          detail: `${s.grade}・${classLabel(s.classId)}　上のクラスへ上げれば残せる`,
          color: "#e67e22",
          onTap: () => {
            this.openStudent(s);
            this.time.delayedCall(20, () => this.onPromote(s));
          },
        });
      }
      /**
       * 【卒園したのに学童が満員】2ヶ月のあいだ毎月知らせる。
       * 学童の子を育成Bへ上げる・学童のコマ（プール）を増やすなどで枠が空けば、翌月の頭に自動で学童へ移る。
       */
      for (const w of result.gakudoWaiting) {
        this.notices.push({
          icon: "🎒",
          title: `${w.student.name} 学童の枠が空いていない`,
          detail:
            (w.monthsLeft <= 1 ? "来月で退会" : `あと${w.monthsLeft}ヶ月で退会`) +
            "　学童の子を育成Bへ上げるか、学童のコマを増やして枠を空ければ学童へ移れる",
          color: "#e67e22",
          onTap: () => this.onRoster(w.student),
        });
      }
      // 【引退を見送る】年齢で引退した選手は、お知らせに全員ぶん流す。
      // そのうち「残したものがある1人」だけ振り返りの画面を出す
      //（何人も一度に引退した年に、画面が何枚も重なると読み飛ばされてしまう）。
      for (const rec of result.retiredNow) {
        this.notices.push({
          icon: "🎓",
          title: `${rec.name} が引退`,
          detail: `${rec.age}歳　通算優勝 ${rec.wins}回${rec.coachOffer ? "　※コーチの申し出あり" : ""}`,
          color: rec.coachOffer ? "#7fd8c0" : "#9fb3c4",
          onTap: () => this.showRetireRecap(rec),
        });
      }
      const notable =
        result.retiredNow.find((r) => r.coachOffer) ??
        result.retiredNow.find((r) => r.wins > 0 || r.rankTier >= 4);
      if (notable) this.time.delayedCall(1500, () => this.showRetireRecap(notable));
      // 研究の決着（会議室ごとに1件。成功でレベルが上がり、失敗すると半分から再挑戦）
      for (const r of result.researchDone) {
        const topic = researchTopic(r.id);
        if (r.success) {
          this.celebrate.push({
            icon: "🔬",
            title: `${r.label} Lv${r.level} を達成！`,
            subtitle: topic ? effectSummaryAt(topic, r.level) : "",
            color: "#a78bfa",
            burst: true,
          });
          this.notices.push({
            icon: "🔬",
            title: `研究が実った（Lv${r.level}）`,
            detail: `${r.label}：${topic ? effectSummaryAt(topic, r.level) : ""}`,
            color: "#a78bfa",
          });
        } else {
          this.notices.push({
            icon: "⚠",
            title: `${r.label} Lv${r.level} は失敗した`,
            detail: "進捗が半分に戻る。研究班の指導力は上がっている（もう一度挑戦できる）",
            color: "#e67e22",
          });
        }
      }
      // クラブの格が上がったら最初に祝い、そのあと選手の格を祝う
      if (result.clubRankUp) this.celebrateClubRank(result.clubRankUp);
      if (result.rankUps.length > 0) this.celebrateRankUps(result.rankUps);
      this.autoSave("月替わり"); // 節目の自動セーブ
    } else {
      this.refreshHud();
      this.toast(this.clock.weekLabel() + "になった", COLORS.textDim, 900);
    }
    // 開催日になったレースを泳ぎ、主要大会の2週間前なら出場確認を出す
    this.checkMeets();
  }

  /** 月替わりの収支レポート（開いている間は時間が止まる）。 */
  private showMonthlyReport(result: MonthRollResult): void {
    this.reportModal?.destroy();
    this.reportModal = new MonthlyReportModal(this, result, this.state.gems, {
      onClose: () => this.closeReport(),
      onOpenShop: () => {
        this.closeReport();
        this.onShop();
      },
    });
  }

  private closeReport(): void {
    this.reportModal?.destroy();
    this.reportModal = undefined;
    // 月初に届いた主要大会の出場確認・開催日のレースは、収支レポートを閉じてから
    this.checkMeets();
  }

  // ---------------------------------------------------------------- 設備購入

  /** 設備画面。中身が多いので、こちらも1つを使い回す（閉じるときは隠すだけ）。 */
  private onShop(): void {
    this.openPanel("設備", () => this.ensureShopModal().show());
  }

  private ensureShopModal(): FacilityShopModal {
    if (this.shopModal) return this.shopModal;
    this.shopModal = new FacilityShopModal(this, this.state, {
        onChanged: () => {
          // 部屋を建てた／撤去したら敷地を描き直す（配置が目に見えるように）
          const grew = this.syncLayout();
          this.refreshEquipment();
          this.refreshHud();
          if (grew) this.toast("施設が変わった！", COLORS.textAccent, 1600, true);
          this.warnStranded();
          // 設備の増減で「誰がどこで練習するか」が変わるので並べ直す
          this.respawnRunning();
        },
        onBuild: () => {
          this.closeShop();
          this.onBuild();
        },
        // 「購入して配置する」→ 配置モードへ。確定するまで課金しない。
        onPlaceNew: (kind) =>
          this.beginPlacement({
            kind,
            existing: null,
            cost: this.state.equipmentCost(kind),
            moving: false,
          }),
      onClose: () => this.closeShop(),
    });
    return this.shopModal;
  }

  /** 今走っているコマの選手を並べ直す（配置や設備が変わったとき）。 */
  private respawnRunning(): void {
    if (import.meta.env.DEV && probeKind() === "life") {
      probeLife("destroy:respawnAll", `n=${this.people.length}`);
    }
    for (const p of this.people) p.destroy();
    this.people = [];
    this.personById.clear();
    this.fatigueMarks?.clear(); // 消えた人の印を残さない
    this.activeSig = undefined;
    this.activePoolSig = new Map(); // 全員いなくなったので、全クラスを並べ直す
    this.time.delayedCall(30, () => this.syncActiveClass(true));
  }

  /** 歩いて行けない部屋があれば知らせる（建設のいちばんの落とし穴）。 */
  private warnStranded(): void {
    const stranded = this.state.strandedRooms();
    if (stranded.length === 0) return;
    const names = stranded.map((s) => equipmentDef(s.room.kind).label).slice(0, 3).join("・");
    this.notices.push({
      icon: "⚠",
      title: "この施設には行けません",
      detail: `${names}${stranded.length > 3 ? " ほか" : ""} に歩いて行けない（建設モードで道を敷こう）`,
      color: "#e74c3c",
    });
  }

  private closeShop(): void {
    this.shopModal?.hide();
  }

  // ---------------------------------------------------------------- 選手・育成

  /**
   * 選手の詳細を開く。
   *
   * パネルは1つを使い回す（作り直すと Text を60個作り直すことになり、そのたびに固まる）。
   * browse には「いま見ている一覧」を渡す。名簿から来たならそのクラスの並び、
   * プールでタップしたならその子のクラスの並び。◀▶ はこの並びの前後へ移る。
   */
  private openStudent(s: Student, browse?: Student[]): void {
    this.openPanel("選手", () => {
      this.browseList = browse ?? this.state.students[s.classId];
      this.selected = this.people.find((p) => p.student === s);
      const env: PanelEnv = {
        coach: this.state.monitorOf(s.classId),
        classAvg: this.state.classAverageOf(s.classId),
        equipmentMult: (key) => this.state.equipmentMultFor(s, key),
        onPromote: () => this.onPromote(s),
        onDemote: () => this.onDemote(s),
        onPlanChanged: () => {},
        setPlan: (plan) => this.state.setIndividualPlan(s, plan),
        useClassPlan: () => this.state.useClassPlan(s),
        classPlan: () => this.state.classPlanOf(s.classId),
        effectivePlan: () => this.state.planFor(s),
        // 休養に入る／戻るとその場の顔ぶれが変わるので、並べ直す。
        // これをしないと、取り消しても次のコマまで画面に出てこない
        //（練習の適用も lessonMembers を見ているので、そのコマは伸びない）。
        onRest: () => {
          const n = this.state.restStudent(s);
          if (n > 0) this.respawnRunning();
          return n;
        },
        onCancelRest: () => {
          this.state.cancelRestOf(s);
          this.respawnRunning();
        },
        restWeeksLeft: (st) => this.state.restWeeksLeftOf(st),
        // カードは「見る画面」。パネルは閉じて、そちらへ移る（両方は開かない）
        onOpenCard: () => {
          this.closePanel();
          this.openCard(s, this.browseList);
        },
        monthGain: () => this.state.monthGainOf(s),
        // 特別練習（通常のコマとは別に、この子だけを鍛える）
        onSpecialTraining: () => this.openSpecialTraining(s),
        specialStatus: () => this.specialTrainingStatus(s),
        altitudeStatus: (st) => this.state.altitudeStatusOf(st),
        // 寮を建てているときだけ、入寮の操作を出す
        onToggleDorm:
          this.state.dormCapacity() > 0
            ? () => {
                if (s.inDorm) {
                  this.state.leaveDorm(s);
                  return { ok: true };
                }
                return this.state.enterDorm(s);
              }
            : undefined,
        // 引退（プロだけ）。年齢を待たずに送り出せる
        onRetire: s.classId === "pro" ? () => this.confirmRetire(s) : undefined,
        // 受診（クリニックを建てているときだけ）。ケガをした選手をリハビリに入れる。
        onToggleRehab:
          this.state.rehabCapacity() > 0
            ? () => {
                if (s.inRehab) {
                  this.state.stopRehab(s);
                  return { ok: true };
                }
                const r = this.state.startRehab(s);
                if (r.ok) this.respawnRunning(); // 練習から抜けるので並べ直す
                return r;
              }
            : undefined,
        rehabStatus: () => ({
          inRehab: s.inRehab,
          used: this.state.rehabUsed(),
          capacity: this.state.rehabCapacity(),
        }),
      };
      if (!this.panel) this.panel = new StudentPanel(this, () => this.closePanel());
      this.panel.show(s, env, this.panelNavFor(s));
      });
  }

  /** 詳細画面の下段（◀ 前の選手／◀ 名簿／次の選手 ▶）。 */
  private panelNavFor(s: Student): PanelNav {
    const list = this.browseList;
    const i = list.indexOf(s);
    const prev = i > 0 ? list[i - 1] : undefined;
    const next = i >= 0 && i < list.length - 1 ? list[i + 1] : undefined;
    return {
      onBack: () => {
        this.closePanel();
        this.onRoster(s);
      },
      onPrev: prev ? () => this.openStudent(prev, list) : undefined,
      onNext: next ? () => this.openStudent(next, list) : undefined,
      position: i >= 0 ? `${classLabel(s.classId)}　${i + 1} / ${list.length}人` : classLabel(s.classId),
    };
  }

  /**
   * 特別練習の画面。
   * 開いている間はゲーム内時間を止める（結果をゆっくり読ませるため）。
   */
  private openSpecialTraining(s: Student): void {
    this.specialModal?.destroy();
    this.specialModal = new SpecialTrainingModal(this, this.state, s, {
      onDone: () => {
        this.refreshHud();
        this.panel?.refresh();
      },
      onClose: () => {
        this.specialModal?.destroy();
        this.specialModal = undefined;
        this.panel?.refresh();
      },
    });
  }

  /** 特別練習をいま受けられるか（いちばん通しやすいメニューの可否を返す）。 */
  private specialTrainingStatus(s: Student): { ok: boolean; reason?: string } {
    let firstReason: string | undefined;
    for (const m of SPECIAL_MENUS) {
      const st = this.state.canRunSpecial(s, m.id);
      if (st.ok) return { ok: true };
      if (!firstReason) firstReason = st.reason;
    }
    return { ok: false, reason: firstReason };
  }

  /**
   * 選手カード（顔・レーダーチャート・格・プロフィール文・成績）。
   *
   * ◀▶ は育成パネルと同じ並び（browseList）で前後の選手へ移る。
   * カードを閉じずに次の子を見られるので、名簿を「めくる」ように読める。
   */
  /**
   * 選手カード（見るための画面）。
   *
   * 【入口はここに一本化してある】名簿の行・プールでタップ・お知らせのタップは
   * すべてこのカードに来る。**能力・才能・成績はカードだけが持ち**、
   * 練習の指示や休養といった**操作は育成パネル**（openStudent）が持つ。
   * 同じ情報を2つの画面に置くと、どちらを見ればいいのか分からなくなるため。
   *
   * @param browse ◀▶ でたどる並び（名簿から来たときはその並び）
   * @param back 閉じたときに戻る先（名簿・全体練習など。省略すると閉じるだけ）
   */
  private openCard(s: Student, browse?: Student[], back?: { label: string; go: () => void }): void {
    if (browse) this.browseList = browse;
    // 並びが無い（または別のクラスを見ていた）ときは、その子のクラスの並びにする
    const list = this.browseList.includes(s) ? this.browseList : this.state.students[s.classId];
    const i = list.indexOf(s);
    const prev = i > 0 ? list[i - 1] : undefined;
    const next = i >= 0 && i < list.length - 1 ? list[i + 1] : undefined;

    this.cardModal?.destroy();
    this.cardModal = new PlayerCardModal(
      this,
      s,
      {
        classAvg: this.state.classAverageOf(s.classId),
        // くらべる相手を選ぶ画面。選手の一覧はクラブ側が持っているので、ここで開く
        pickRival: (onPick) => this.pickRival(s, onPick),
        // 操作はこの先（育成パネル）
        openTraining: () => {
          this.closeCard();
          this.openStudent(s, list);
        },
        /**
         * ★（注目選手）の付け外し。名簿と同じものをカードにも置いてある
         *（選手をタップして開くのはカードなので、ここに無いと
         *   「★を付けるには名簿を開き直す」になる）。
         * 断られたときだけ理由を必ず出す＝押したのに何も起きない、を作らない。
         */
        togglePin: () => {
          const r = this.state.togglePin(s);
          if (!r.ok) this.toast(`⚠ ${r.reason ?? ""}`, "#e67e22", 2200, true);
          else if (r.pinned) this.toast(`★ ${s.name} を注目選手にした`, "#f7dc6f");
          else this.toast(`${s.name} の★を外した`, "#95a6b8");
          this.refreshPins(); // HUD の札をその場で入れ替える（1秒の間引きを待たない）
          return r;
        },
      },
      () => {
        this.closeCard();
        // 開いた元（名簿・全体練習）へ戻す。一覧を見ながら次の子へ移れる
        back?.go();
      },
      {
        onPrev: prev ? () => this.openCard(prev, list, back) : undefined,
        onNext: next ? () => this.openCard(next, list, back) : undefined,
        backLabel: back?.label,
        position: i >= 0 ? `${classLabel(s.classId)}　${i + 1} / ${list.length}人` : classLabel(s.classId),
      },
    );
    // チュートリアルの「泳いでいる子をタップしてみよう」はここで満たされる
    // （選手を見る入口がカードに一本化されたので、通知もここに移した）
  }

  /** カードと、そこから開いた一覧をまとめて閉じる。 */
  private closeCard(): void {
    this.rivalPicker?.destroy();
    this.rivalPicker = undefined;
    this.cardModal?.destroy();
    this.cardModal = undefined;
  }

  /**
   * 引退させる（プロの手動引退）。
   *
   * 取り返しがつかないので必ず確認を挟む。送り出したあとは、その選手の歩みを
   * 振り返る画面を出す（長く育てた選手への区切り）。
   */
  private confirmRetire(s: Student): void {
    this.confirmDialog?.destroy();
    this.confirmDialog = new ConfirmDialog(
      this,
      {
        title: `${s.name} を引退させる`,
        message:
          `${s.age}歳・${classLabel(s.classId)}。引退すると名簿から外れ、練習にも大会にも出られなくなる。` +
          "熟練度の高い選手は、引退後にコーチとして残ることがある。",
        confirmLabel: "引退させる",
        cancelLabel: "やめる",
        danger: true,
      },
      () => {
        this.confirmDialog?.destroy();
        this.confirmDialog = undefined;
        this.closePanel();
        const rec = this.state.retireStudent(s, true);
        this.showRetireRecap(rec);
        this.respawnRunning();
        this.refreshHud();
      },
      () => {
        this.confirmDialog?.destroy();
        this.confirmDialog = undefined;
      },
    );
  }

  /** 引退した選手の歩みを振り返る（自動引退・手動引退のどちらからも呼ぶ）。 */
  private showRetireRecap(rec: RetiredRecord): void {
    this.retireModal?.destroy();
    this.retireModal = new RetireRecapModal(this, rec, {
      onHire: rec.coachOffer
        ? () => {
            const r = this.state.hireRetired(rec);
            if (!r.ok) {
              this.toast(r.reason ?? "雇えない", "#e67e22", 1800);
              return false;
            }
            this.toast(`${rec.name}コーチが加入した`, COLORS.textAccent, 2000, true);
            this.refreshHud();
            return true;
          }
        : undefined,
      onClose: () => {
        this.retireModal?.destroy();
        this.retireModal = undefined;
      },
    });
  }

  /**
   * 【くらべる相手を選ぶ】選手カードから呼ばれる。
   *
   * 全クラスの選手を、上のクラスから順に並べる（強い子と見比べたいことが多いので）。
   * 自分自身は選べない。
   */
  private pickRival(self: Student, onPick: (s: Student) => void): void {
    const options: PickerOption<number>[] = [];
    for (const c of [...CLASS_ORDER].reverse()) {
      for (const st of this.state.students[c.id]) {
        if (st.id === self.id) continue;
        options.push({
          value: st.id,
          label: `${st.name}　${classLabel(st.classId)}`,
          note: `${st.grade}・${GENDER_LABEL[st.gender]}　得意 ${STROKE_LABEL[st.fav.stroke]} ${st.fav.distance}m`,
          color: "#e8eef3",
        });
      }
    }
    this.rivalPicker?.destroy();
    if (options.length === 0) {
      this.toast("くらべられる選手がいない", "#f7dc6f");
      return;
    }
    this.rivalPicker = new PickerModal<number>(
      this,
      "くらべる選手",
      "選ぶと、その選手の形がレーダーに重なる",
      options,
      -1,
      (id) => {
        this.rivalPicker?.destroy();
        this.rivalPicker = undefined;
        const found = CLASS_ORDER.flatMap((c) => this.state.students[c.id]).find((x) => x.id === id);
        if (found) onPick(found);
      },
      () => {
        this.rivalPicker?.destroy();
        this.rivalPicker = undefined;
      },
    );
  }

  // ---------------------------------------------------------------- 全体練習

  /**
   * 全体練習の画面。
   * @param initialClass 開いたときに選んでおくクラス（カードから戻るときに使う）
   */
  private onClassPractice(initialClass?: ClassId): void {
    this.closeClassPractice();
    this.practiceModal = new ClassPracticeModal(this, this.state, {
      onChanged: () => {
        this.panel?.refresh();
        // メニューが変わると「誰が設備で練習するか」も変わるので並べ直す
        this.respawnRunning();
      },
      onClose: () => this.closeClassPractice(),
      // 行を長押しでその選手のカードへ。閉じると全体練習に戻る
      onOpenCard: (s) => {
        const list = this.state.students[s.classId];
        const back = s.classId;
        this.closeClassPractice();
        this.openCard(s, list, { label: "◀ 全体練習", go: () => this.onClassPractice(back) });
      },
    }, initialClass);
  }

  private closeClassPractice(): void {
    this.practiceModal?.destroy();
    this.practiceModal = undefined;
  }

  // ---------------------------------------------------------------- 格が上がったときの演出

  /** 選手の格（8段階）が上がった選手を順に祝う（画面タップでスキップできる）。 */
  private celebrateRankUps(ups: RankUpEvent[]): void {
    ups.forEach((up, i) => {
      // 演出は先頭の数人だけ。残りは通知だけにして、テンポを崩さない。
      if (i < FX.maxCelebrations) {
        this.celebrate.push({
          icon: "★",
          title: `${up.student.name} の格が上がった！`,
          subtitle: `格 ${up.from} → ${up.to}　${rankLabel(up.to)}`,
          color: rankColor(up.to),
          burst: true,
        });
      }
      this.notices.push({
        icon: "★",
        title: `${up.student.name} の格が上がった`,
        detail: rankLabel(up.to),
        color: rankColor(up.to),
        onTap: () => this.openCard(up.student),
      });
      // 注目選手（★）なら、HUD の札もその場で光らせる
      this.flashPin(up.student.id, `★ ${up.student.name} の格が上がった！`, rankColor(up.to));
    });
  }

  /** クラブの格が上がったときの演出（選手の格より大きく祝う）。 */
  private celebrateClubRank(up: ClubRankUpEvent): void {
    this.celebrate.push({
      icon: "🏆",
      title: `${this.state.clubName} の格が上がった！`,
      subtitle: up.label,
      color: clubRankColor(up.to),
      burst: true,
      durationSec: FX.celebrateSec + 0.6,
    });
    this.notices.push({
      icon: "🏆",
      title: "クラブの格が上がった",
      detail: up.label,
      color: clubRankColor(up.to),
    });
    this.refreshHud();
  }

  /**
   * 昇格。**上げ先を選ばせる**。
   *
   * 以前は「ひとつ上のクラス」へしか上げられず、育成Bが定員になると
   * 育成Aや選手に空きがあっても詰まってしまった。行き先を並べて選ばせ、
   * 選べないものは理由（定員／学年／年齢）を添えて出す。
   * 行き先が1つしかないときは、そのまま上げる（余計なタップを増やさない）。
   */
  private onPromote(s: Student): void {
    const targets = this.state.promotionTargets(s);
    if (targets.length === 0) {
      this.toast("昇格できない：最上位クラス", "#e67e22", 1600);
      return;
    }
    if (targets.length === 1) {
      this.applyPromotion(s, targets[0].classId);
      return;
    }
    this.promotePicker?.destroy();
    this.promotePicker = new PickerModal<ClassId>(
      this,
      `${s.name} をどのクラスへ？`,
      "上のクラスほどよく伸びるが、クラス平均から離れすぎると練習についていけない。",
      targets.map((t) => ({
        value: t.classId,
        label: `${t.label}　${t.filled}/${t.capacity}人`,
        note: t.ok
          ? `あと${Math.max(0, t.capacity - t.filled)}人入れる`
          : undefined,
        disabled: t.ok ? undefined : t.reason,
        color: "#f7dc6f",
      })),
      s.classId,
      (v) => {
        this.closePromotePicker();
        this.applyPromotion(s, v);
      },
      () => this.closePromotePicker(),
    );
  }

  /** 選んだクラスへ実際に上げる（通知とチュートリアルの進行もここ）。 */
  private applyPromotion(s: Student, to: ClassId): void {
    const r = this.state.promoteStudentTo(s, to);
    if (!r.ok) {
      this.toast(`昇格できない：${r.reason}`, "#e67e22", 1600);
      return;
    }
    this.toast(`${s.name} を ${classLabel(to)} へ昇格した`, COLORS.textAccent, 1600);
    // 顔ぶれが変わるので、今のコマを並べ直す（上げた子がその場で新しいクラスに並ぶ）。
    // 並べ直しは 30ms 後なので、パネルを開き直すのはそのあと（選択リングが付くように）。
    this.respawnRunning();
    this.time.delayedCall(60, () => this.openStudent(s));
  }

  private closePromotePicker(): void {
    this.promotePicker?.destroy();
    this.promotePicker = undefined;
  }

  /**
   * 降格。**スクールへ戻すときだけ確認を挟む**。
   *
   * 育成のクラス同士の上げ下げは、いつでも戻せる（練習の強さが変わるだけ）。
   * スクールへ戻すのは意味が違って、練習を選べなくなり大会にも出せなくなる
   * ＝申し込み済みのレースがあれば欠場になる。押し間違いで起きてよい変化ではない。
   */
  private onDemote(s: Student): void {
    const to = this.state.demotionTargetOf(s);
    if (to && isSchoolClass(to)) {
      const entered = this.state.pendingRaces.some((r) => r.studentIds.includes(s.id));
      this.confirmDialog?.destroy();
      this.confirmDialog = new ConfirmDialog(
        this,
        {
          title: `${s.name} を ${classLabel(to)} へ戻す`,
          message:
            `${classLabel(s.classId)}から${classLabel(to)}へ降格します。\n` +
            "スクールは全体練習だけになり、練習の指示も大会の出場もできなくなります。" +
            (entered ? "\n申し込み済みのレースは欠場になり、出場費は返ってきます。" : "") +
            "\n伸びてきたら、また育成Bへ上げ直せます。",
          confirmLabel: "戻す",
          cancelLabel: "やめる",
          danger: true,
        },
        () => {
          this.confirmDialog?.destroy();
          this.confirmDialog = undefined;
          this.applyDemote(s);
        },
        () => {
          this.confirmDialog?.destroy();
          this.confirmDialog = undefined;
        },
      );
      return;
    }
    this.applyDemote(s);
  }

  private applyDemote(s: Student): void {
    const r = this.state.demoteStudent(s);
    if (!r.ok) {
      this.toast(`降格できない：${r.reason}`, "#e67e22", 1600);
      return;
    }
    this.toast(`${s.name} を ${r.to ? classLabel(r.to) : ""} へ降格した`, COLORS.textAccent, 1600);
    // 顔ぶれが変わるので、今のコマを並べ直す（戻した子がその場で新しいクラスに並ぶ）
    this.respawnRunning();
    this.time.delayedCall(60, () => this.openStudent(s));
  }

  /** 詳細画面を閉じる（インスタンスは残して隠すだけ。次に開くとき速い）。 */
  private closePanel(): void {
    this.panel?.hide();
  }

  private clearSelection(): void {
    this.selected = undefined;
  }

  // ---------------------------------------------------------------- 名簿 / コーチ / 合宿

  /**
   * パネルを開くのにかかった時間を測って計測表示へ渡す（開発中のみ）。
   * 「開いた瞬間だけ固まる」のか「ずっと重い」のかを切り分けるために使う。
   */
  private openPanel(label: string, open: () => void): void {
    const t0 = this.perf ? performance.now() : 0;
    open();
    // 開いた画面のボタンを、次のフレームを待たずに押せる状態にする（→ ui/inputReady.ts）。
    // 組み立てに時間がかかるほど「押しても反応しない時間」が長くなるので、ここで必ず流す。
    flushInput(this);
    this.perf?.noteBuild(label, performance.now() - t0);
  }

  /**
   * 名簿を開く。
   * こちらも1つを使い回す（作り直すと100個の Text を作り直すことになる）。
   * 見ていたクラスとページはそのまま残るので、詳細から「◀ 名簿」で戻ると続きが出る。
   * focus を渡すと、その選手が載っているクラス・ページまで送る。
   */
  private onRoster(focus?: Student): void {
    this.openPanel("名簿", () => {
      this.ensureRoster().show(focus);
      });
  }

  /**
   * ★を付けた選手だけの名簿（HUD の札を軽く押したときの行き先）。
   * 在籍が100人を超えると全員の名簿から自分の子を探すのが大変なので、
   * 札からひと押しでその3人だけの一覧に入れるようにしてある。
   */
  private onRosterPinned(): void {
    this.openPanel("名簿(★)", () => {
      this.ensureRoster().showPinned();
    });
  }

  private ensureRoster(): RosterModal {
    if (!this.roster) {
      this.roster = new RosterModal(
        this,
        this.state,
        (s) => {
          this.roster?.hide();
          // 名簿から開くのは**カード**（見るための画面）。
          // そのクラスの並びを ◀▶ で辿れるようにし、閉じたら名簿へ戻す
          this.openCard(s, this.roster?.currentList(), { label: "◀ 名簿", go: () => this.onRoster(s) });
        },
        () => this.roster?.hide(),
      );
    }
    return this.roster;
  }

  /** コーチ画面。こちらも1つを使い回す（閉じるときは隠すだけ）。 */
  private onCoach(): void {
    this.openPanel("コーチ", () => {
      // 担当の割り当てが変わったかを見て、チュートリアルを進める。
      // 使い回すので「開いた時点」の並びを覚え直す。
      this.ensureCoachModal().show();
      });
  }

  private ensureCoachModal(): CoachModal {
    if (!this.coachModal) {
      this.coachModal = new CoachModal(
        this,
        this.state,
        () => {
          this.refreshHud();
          // コーチが増減・担当変更されたら、コーチ室の人も並べ直す
          this.rebuildStaff();
        },
        () => this.coachModal?.hide(),
        () => {
          this.coachModal?.hide();
          this.onResearch();
        },
        () => {
          this.coachModal?.hide();
          this.onStaff();
        },
        // 一覧で名前をタップ＝その人の詳細カード
        (coachId) => this.openCoachCard(coachId),
      );
    }
    return this.coachModal;
  }

  /** 専門スタッフ（栄養士・ドクター）の雇用画面。 */
  /**
   * 施設に立っている本人をタップ＝その人の詳細。
   * 一覧（雇う・担当を決める）とは別に、「この人は誰で今なにをしているか」を見せる。
   */
  private openCoachCard(coachId: number): void {
    const coach = this.state.coaches.find((c) => c.id === coachId);
    if (!coach) return;
    this.personCard?.destroy();
    this.personCard = new PersonCardModal(this, this.state, { kind: "coach", coach }, {
      onOpenList: () => this.onCoach(),
      onClose: () => this.closePersonCard(),
    });
  }

  private openStaffCard(staffId: number): void {
    const member = this.state.staff.find((s) => s.id === staffId);
    if (!member) return;
    this.personCard?.destroy();
    this.personCard = new PersonCardModal(this, this.state, { kind: "staff", staff: member }, {
      onOpenList: () => this.onStaff(),
      onClose: () => this.closePersonCard(),
    });
  }

  /** 一般客をタップしたとき（見るだけの簡単な情報）。 */
  private openGuestCard(v: Visitor, category: GuestCategory, fee: number): void {
    this.personCard?.destroy();
    this.personCard = new PersonCardModal(
      this,
      this.state,
      {
        kind: "guest",
        guest: {
          profile: guestProfileOf(v.seed, category),
          category,
          fee,
          turnedAway: v.turnedAway,
          variant: v.variant,
          satisfaction: v.satisfaction,
          contribution: v.contribution,
        },
      },
      { onClose: () => this.closePersonCard() },
    );
  }

  private closePersonCard(): void {
    this.personCard?.destroy();
    this.personCard = undefined;
  }

  private onStaff(): void {
    this.staffModal?.destroy();
    this.staffModal = new StaffModal(this, this.state, () => {
      this.staffModal?.destroy();
      this.staffModal = undefined;
      this.refreshHud();
      // 雇用・解雇のたびに、部屋の中の人を並べ直す
      this.rebuildStaff();
    });
  }

  /** 研究（会議室）の画面。 */
  private onResearch(): void {
    this.closeResearch();
    this.researchModal = new ResearchModal(this, this.state, {
      onChanged: () => {
        this.refreshHud();
        this.syncCoachDuty();
      },
      onOpenCoaches: () => {
        this.closeResearch();
        this.onCoach();
      },
      onClose: () => this.closeResearch(),
    });
  }

  private closeResearch(): void {
    this.researchModal?.destroy();
    this.researchModal = undefined;
  }

  /**
   * 合宿（行き先を選ぶ → 連れていく選手を選ぶ）。
   *
   * 行を長押しすると選手カードが開き、閉じると**選びかけのまま**ここへ戻る
   *（→ CampSnapshot）。高い買い物なので、調子と能力を見てから決められるようにしてある。
   */
  private onCamp(restore?: CampSnapshot): void {
    this.camp?.destroy();
    this.camp = new CampModal(
      this,
      this.state,
      () => {
        this.camp?.destroy();
        this.camp = undefined;
        this.refreshHud();
        this.panel?.refresh();
      },
      (s, snap) => {
        this.camp?.destroy();
        this.camp = undefined;
        this.openCard(s, undefined, { label: "◀ 合宿", go: () => this.onCamp(snap) });
      },
      restore,
    );
  }

  // ---------------------------------------------------------------- イベント一覧

  /** メニューの「イベント」。開催可否を出し、既存のイベント処理を呼び出す。 */
  private onEvents(): void {
    this.openPanel("イベント", () => {
      this.closeEvents();
      this.eventModal = new EventListModal(this, this.state, {
        onShortCourse: () => {
          this.closeEvents();
          this.onShortCourse();
        },
        onCamp: () => {
          this.closeEvents();
          this.onCamp();
        },
        onCampaign: (id) => {
          this.closeEvents();
          this.onCampaign(id);
        },
        onClose: () => this.closeEvents(),
      });
      });
  }

  /** 集客キャンペーンを開催する。 */
  private onCampaign(id: CampaignId): void {
    const r = this.state.runCampaign(id);
    if (!r.ok) {
      this.toast(r.reason ?? "開催できない", "#e67e22", 1800, true);
      return;
    }
    this.refreshHud();
    this.respawnIfActive("youji");
    this.respawnIfActive("gakudo");

    const joined = (r.newYouji ?? 0) + (r.newGakudo ?? 0);
    this.celebrateEvent(
      `${r.label} 開催！`,
      `入会 ${joined}人　人気 +${r.popularityGain}　費用 -◆${r.cost}`,
      "#f7dc6f",
    );
    this.warnTurnedAway(r.turnedAway);
    if (r.talented) this.time.delayedCall(650, () => this.playTalentEffect());
  }

  private closeEvents(): void {
    this.eventModal?.destroy();
    this.eventModal = undefined;
  }

  // ---------------------------------------------------------------- セーブ / システム

  /** 現在の全状態を枠へ書き出す。 */
  private async doSave(): Promise<SaveAttempt> {
    if (this.saving) return { ok: false, reason: "セーブ中です" };
    this.saving = true;
    const res = await writeSlot(this.slot, this.state, this.clock, this.playTimeMs);
    this.saving = false;
    if (res.ok && res.header) {
      this.lastSavedAt = res.header.savedAt;
    }
    return { ok: res.ok, reason: res.reason, savedAt: res.header?.savedAt };
  }

  /** 節目の自動セーブ（設定でOFFにできる）。 */
  private autoSave(reason: string): void {
    if (!settings().autoSave) return;
    void this.doSave().then((res) => {
      if (!this.scene.isActive()) return;
      if (res.ok) this.toast(`自動セーブしました（${reason}）`, "#aed6f1", 900);
      else this.toast(`⚠ 自動セーブに失敗：${res.reason ?? ""}`, "#e74c3c", 2000, true);
    });
  }

  private onSaveButton(): void {
    void this.doSave().then((res) => {
      if (!this.scene.isActive()) return;
      if (res.ok) this.toast(`💾 枠${this.slot} にセーブしました`, "#2ecc71", 1400, true);
      else this.toast(`⚠ セーブできませんでした：${res.reason ?? ""}`, "#e74c3c", 2200, true);
    });
  }

  private onSystem(): void {
    this.closeSystem();
    this.systemModal = new SystemModal(this, {
      slot: this.slot,
      clubName: this.state.clubName,
      lastSavedAt: this.lastSavedAt,
      playTimeMs: this.playTimeMs,
      onSave: () => this.doSave(),
      onSettings: () => this.onSettings(),
      onManual: () => this.openManual(),
      onExitToTitle: (save) => this.exitToTitle(save),
      onClose: () => this.closeSystem(),
    });
  }

  /** 説明書（システム画面の上に重ねる）。 */
  private openManual(): void {
    this.manualModal?.destroy();
    this.manualModal = new ManualModal(this, () => {
      this.manualModal?.destroy();
      this.manualModal = undefined;
    });
  }

  private closeSystem(): void {
    this.systemModal?.destroy();
    this.systemModal = undefined;
  }

  private onSettings(): void {
    this.settingsModal?.destroy();
    this.settingsModal = new SettingsModal(this, {
      allowWipe: false, // プレイ中に全消しはさせない
      onClose: () => {
        this.settingsModal?.destroy();
        this.settingsModal = undefined;
      },
    });
  }

  private exitToTitle(save: boolean): void {
    // ここから先はゲーム内の時間を止める。
    // 止めないとフェードの 0.2 秒ぶん時間が進み、
    // せっかくセーブした内容と、そのあと自動セーブされる内容がずれる。
    this.exiting = true;
    const go = (): void => {
      this.closeSystem();
      this.settingsModal?.destroy();
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Title"));
    };
    if (!save) {
      go();
      return;
    }
    void this.doSave().then((res) => {
      if (!res.ok) {
        this.toast(`⚠ セーブできませんでした：${res.reason ?? ""}`, "#e74c3c", 2400, true);
        return;
      }
      go();
    });
  }

  // ---------------------------------------------------------------- 短期教室 / 合宿

  private respawnIfActive(classId: ClassId): void {
    if (this.activeClasses.includes(classId)) this.respawnRunning();
  }

  /** 短期教室：費用がかかるので、内容を見せてから実行する。 */
  private onShortCourse(): void {
    if (!this.state.canHoldShortCourse()) {
      this.toast(`短期教室は ${SHORTCOURSE.months.join("・")}月 のみ開催できる`, "#e67e22", 1800);
      return;
    }
    if (this.state.gems < SHORTCOURSE.cost) {
      this.toast(`ジェムが足りない（必要 ◆${SHORTCOURSE.cost} / 所持 ◆${this.state.gems}）`, "#e67e22", 1800);
      return;
    }
    this.confirmDialog?.destroy();
    this.confirmDialog = new ConfirmDialog(
      this,
      {
        title: `短期教室（${this.state.month}月）`,
        message:
          `費用 ◆${SHORTCOURSE.cost} を払って短期教室を開きます。\n` +
          `人気度が +${SHORTCOURSE.popularityGain} 上がり、幼児・学童のスクール生が集まります。\n` +
          `（人気度が高いほど多く集まり、才能ある子が混じることも）`,
        confirmLabel: "開催する",
      },
      () => {
        this.confirmDialog = undefined;
        this.runShortCourse();
      },
      () => {
        this.confirmDialog = undefined;
      },
    );
  }

  private runShortCourse(): void {
    const r = this.state.holdShortCourse();
    if (!r.ok) {
      this.toast(r.reason ?? "開催できない", "#e67e22", 1800);
      return;
    }
    this.refreshHud();
    this.respawnIfActive("youji");
    this.respawnIfActive("gakudo");
    this.celebrateEvent(
      "短期教室をひらいた！",
      `幼児 +${r.newYouji}　学童 +${r.newGakudo}　人気 +${r.popularityGain}　費用 -◆${r.cost}`,
    );
    this.warnTurnedAway(r.turnedAway);
    if (r.talented) this.time.delayedCall(650, () => this.playTalentEffect());
  }

  /**
   * 入会を断ったときの案内。
   * 断るのは**クラスの定員が埋まったとき**だけなので、打つ手はいつも同じ
   *（時間割にコマを足す／プールを増やす）。
   */
  private warnTurnedAway(n: number | undefined): void {
    if (!n || n <= 0) return;
    this.time.delayedCall(900, () =>
      this.toast(`⚠ 定員がいっぱいで ${n}人 を断った（時間割にコマを足すか、プールを増やそう）`, "#e67e22", 2600, true),
    );
  }

  // ---------------------------------------------------------------- 大会

  private onCompetitions(restore?: EntrySnapshot): void {
    this.compModal?.destroy();
    this.compModal = new CompetitionEntryModal(
      this,
      this.state,
      // 記録会はエントリーの2週間後に泳ぐ（主要大会は出場確認から申し込む）
      (students, comp, ev) => this.reserveTrial(students, comp, ev),
      () => this.closeCompModal(),
      {
        restore,
        onOpenConfirm: (c) => this.openMajorConfirm(c),
        onRelay: () => this.enterRelay(),
        // 選手の行を長押しでその選手のカードへ。閉じると、選んでいた大会・種目・メンバーのまま戻る
        onOpenCard: (s, snap) => {
          this.closeCompModal();
          this.openCard(s, undefined, { label: "◀ 大会", go: () => this.onCompetitions(snap) });
        },
      },
    );
  }

  /**
   * メドレーリレー（12月の世界選手権）の会場へ。
   *
   * 個人種目と同じ会場（MeetScene）を使うが、**予選が無く1本勝負**で、
   * 4人が1往復ずつ泳ぐ（→ MeetScene.startRelay）。
   * 結果は runRelay が確定させる（報酬・熟練度・実績もそこで配る）。
   */
  private enterRelay(): void {
    const entry = this.state.relayEntry();
    const comp = competitionById("gen_sekai");
    if (!entry || !comp) {
      this.toast("いまリレーは泳げない", "#e67e22", 1600);
      return;
    }
    this.closeCompModal();
    this.closePanel();
    let result: RelayResult | null = null;
    this.scene.launch("Meet", {
      students: entry.members,
      comp,
      event: { stroke: "im", distance: 400 },
      resolve: () => {
        throw new Error("リレーでは resolve を使わない");
      },
      resolveRelay: () => {
        result = this.state.runRelay();
        return result;
      },
      onClose: () => {
        this.refreshHud();
        const r = result;
        if (r) {
          this.notices.push({
            icon: r.won ? "🏆" : "🇯🇵",
            title: r.won ? "メドレーリレーで世界一！" : `メドレーリレー ${r.outcome.rank}位`,
            detail: `${r.entries.map((e) => e.student.name).join("・")}　◆+${r.totalGems}　人気 +${r.totalPopularity}`,
            color: r.won ? "#f7dc6f" : "#8fd0ff",
          });
        }
        const clubUp = this.state.refreshClubRank();
        if (clubUp) this.celebrateClubRank(clubUp);
        const ups = this.state.takeRankUps();
        if (ups.length > 0) this.celebrateRankUps(ups);
        this.autoSave("リレーのあと");
      },
    });
    this.scene.pause();
  }

  private closeCompModal(): void {
    this.compModal?.destroy();
    this.compModal = undefined;
  }

  /** 記録会にエントリーする（泳ぐのは2週間後。出場費はいま払う）。 */
  private reserveTrial(students: Student[], comp: Competition, ev: RaceEvent): void {
    const r = this.state.reserveTimeTrial(students, comp, ev);
    if (!r.race) {
      this.toast(r.reason ?? "エントリーできませんでした", "#e74c3c", 1900, true);
      return;
    }
    this.closeCompModal();
    this.refreshHud();
    this.notices.push({
      icon: "📝",
      title: `${comp.name} にエントリーした`,
      detail: `${this.state.raceDayLabel(r.race.raceDay)}にレース（${ev.distance}m ${STROKE_LABEL[ev.stroke]}・${students.length}人）`,
      color: "#aed6f1",
    });
    this.autoSave("エントリーのあと");
  }

  /**
   * 【大会の予定】週が変わったとき・収支レポートや会場を閉じたときに見る。
   *  1) 開催日になったレースを順に泳ぐ（記録会＝エントリーの2週間後／主要大会＝その月の第3週）
   *  2) 主要大会の2週間前なら、条件を満たした選手と種目の出場確認を出す
   * ほかの画面が開いている間は待つ（画面を重ねると読み飛ばされるため）。
   */
  private checkMeets(): void {
    // 見た目確認で起動したときは出場確認を出さない（施設の絵の上に窓が重なって撮れない）。
    // チュートリアルを廃止して最初から選手が居るので、新規データでもすぐ窓が出る。
    if (this.dev) return;
    if (this.racing || this.reportModal || this.confirmModal) return;
    if (this.state.racesDue().length > 0) {
      this.runNextRace();
      return;
    }
    const comp = this.state.majorsNeedingConfirm()[0];
    if (!comp) return;
    this.state.markConfirmAsked(comp.id);
    /**
     * 【勝ち上がった子は自動でエントリー】前の段で優勝した種目は、もう決まっている。
     * 窓が開いた時点で入れておき、**変えたいときだけ**確認画面をいじればよくする。
     * 出場費はここで引かれるが、見送れば返る（→ setMajorEntries）。
     */
    const auto = this.state.autoEnterQualified(comp);
    if (auto.length > 0) {
      this.notices.push({
        icon: "✅",
        title: `${comp.name} に自動エントリー`,
        detail:
          `${auto.map((c) => `${c.student.name}（${STROKE_LABEL[c.event.stroke]}${c.event.distance}m）`).join("・")}` +
          "　前の段で優勝した種目。変えるなら出場確認から",
        color: "#7fd1ae",
        onTap: () => this.openMajorConfirm(comp),
      });
      this.refreshHud();
    }
    this.notices.push({
      icon: "📣",
      title: `${comp.name} の出場確認`,
      detail: `${this.state.raceDayLabel(this.state.majorRaceDay())}開催。条件を満たした選手と種目を確かめよう`,
      color: "#f7dc6f",
      onTap: () => this.openMajorConfirm(comp),
    });
    this.openMajorConfirm(comp);
  }

  /** 開催日になったレースを1つ泳ぐ。終わったら次を見る（同じ週に複数あれば続けて泳ぐ）。 */
  private runNextRace(): void {
    // 会場がまだ開いている（前のレースの後片付け中）なら、閉じてから呼ばれるのを待つ。
    // ここで重ねて開くと、開いている会場が次のレースに上書きされて1本飛ぶ
    if (this.scene.isActive("Meet") || this.scene.isPaused("Meet")) {
      // 待ちの呼び直しは1本だけ（何本も積むと、会場が閉じた瞬間にまた重なる）
      if (!this.raceRetry) {
        this.raceRetry = true;
        this.time.delayedCall(250, () => {
          this.raceRetry = false;
          this.runNextRace();
        });
      }
      return;
    }
    const race = this.state.racesDue()[0];
    if (!race) {
      this.racing = false;
      this.checkMeets();
      return;
    }
    if (!this.racing) this.raceLog = []; // その日の1本目：一覧を空にしてから積む
    this.racing = true;
    const go = this.state.takePendingRace(race);
    if (go.refund > 0) this.refreshHud();
    if (go.withdrawn.length > 0) {
      this.notices.push({
        icon: "⚠",
        title: `${go.comp?.name ?? "大会"} を欠場`,
        detail: `${go.withdrawn.map((s) => s.name).join("・")}（ケガなどで出られない。出場費◆${go.refund} を返金）`,
        color: "#e67e22",
      });
    }
    if (!go.comp || go.roster.length === 0) {
      this.runNextRace();
      return;
    }
    this.toast(`${go.comp.name} のレース当日！`, COLORS.textAccent, 1400, true);
    /**
     * 【今日のエントリーを会場に渡す】会場に出るのは1レースずつなので、
     * 「あと何を泳ぐのか」が分からなくなっていた。いま泳ぐぶん＋これから泳ぐぶんを
     * まとめて渡して、会場の隅に並べる（→ MeetScene.buildDayCard）。
     */
    const rest = this.state.racesDue();
    const dayCard = [
      {
        label: `${go.comp.name} ${go.event.distance}m ${STROKE_LABEL[go.event.stroke]}`,
        mine: go.roster.map((s) => s.name).join("・"),
        current: true,
      },
      ...rest.map((r) => {
        const c = competitionById(r.compId);
        return {
          label: `${c?.name ?? "大会"} ${r.event.distance}m ${STROKE_LABEL[r.event.stroke]}`,
          mine: r.studentIds
            .map((id) => this.state.findStudent(id)?.name)
            .filter((x): x is string => !!x)
            .join("・"),
          current: false,
        };
      }),
    ];
    this.enterMeet(go.roster, go.comp, go.event, go.prepaid, () => this.runNextRace(), dayCard);
  }

  /** 主要大会の出場確認（条件を満たした選手と種目の一覧）。開いている間は時間が止まる。 */
  private openMajorConfirm(comp: Competition): void {
    this.closeCompModal();
    this.confirmModal?.destroy();
    this.confirmModal = new MeetConfirmModal(this, this.state, comp, {
      onDone: (message) => {
        this.closeConfirm();
        this.refreshHud();
        this.toast(message, COLORS.textAccent, 1900, true);
        this.autoSave("出場確認のあと");
      },
      onClose: () => this.closeConfirm(),
    });
  }

  private closeConfirm(): void {
    this.confirmModal?.destroy();
    this.confirmModal = undefined;
    // 同じ月に主要大会が2つあるときは、続けて次の確認を出す
    this.time.delayedCall(300, () => this.checkMeets());
  }

  /**
   * 1レースを確定させて（sim）、施設側の後始末（お知らせ・お祝い・格の更新）を返す。
   * 会場で見るときも、「全結果へ」でアニメーション無しに泳ぐときも、ここを通す。
   * 結果はその日の一覧（raceLog）にも積む（→ RaceSummaryModal）。
   */
  private resolveRace(
    students: Student[],
    comp: Competition,
    ev: RaceEvent,
    prepaid?: number,
  ): { result: CompetitionResult; finish: () => void } {
    const r = this.state.enterCompetition(students, comp, ev, prepaid != null ? { prepaid } : undefined);
    this.raceLog.push({ compName: comp.name, event: { ...ev }, result: r });
    const winners = r.entries.filter((e) => e.entrant.win).map((e) => e.student);
    const gainedPassion = r.passion;
    /**
     * 注目選手（★）の自己ベスト更新。
     * 成長が遅い遊びなので、**速くなった瞬間**をその場で見せないと気づかれない。
     * 会場の画面でも出しているが、施設に戻ってからもう一度 HUD の札で光らせる。
     */
    const pinnedBests = r.entries
      .filter((e) => e.selfBest && e.student.pinned)
      .map((e) => ({
        id: e.student.id,
        name: e.student.name,
        diff: e.prevBestSec > 0 ? e.prevBestSec - e.entrant.bestTime : 0,
      }));
    const finish = (): void => {
      this.refreshHud();
      // 【情熱】大会の成果はここで通知する（ゲージの演出は syncPassion が出す）
      if (gainedPassion >= 1) {
        this.notices.push({
          icon: "🔥",
          title: `情熱 +${Math.round(gainedPassion)}`,
          detail:
            winners.length > 0
              ? `${comp.name}の優勝で士気が上がった（特別練習に使える）`
              : `${comp.name}に出場して士気が上がった（特別練習に使える）`,
          color: "#e67e22",
        });
      }
      for (const w of winners) {
        this.celebrate.push({
          icon: "🏅",
          title: `${w.name} が優勝！`,
          subtitle: comp.name,
          color: "#f7dc6f",
          burst: true,
        });
      }
      /**
       * 【日本代表の選出】日本選手権（10月）の 100m で優勝すると、
       * その泳法の日本代表になり、12月の世界選手権でメドレーリレーを泳げる。
       * ここで知らせないと、大会画面にリレーの行が出ていることに気づけない。
       */
      if (comp.id === RELAY_SOURCE_COMP && ev.distance === RELAY_DISTANCE && RELAY_ORDER.includes(ev.stroke)) {
        for (const w of winners) {
          this.notices.push({
            icon: "🇯🇵",
            title: `${w.name} が日本代表に`,
            detail: `${STROKE_LABEL[ev.stroke]}${ev.distance}mの優勝者として、12月の世界選手権でメドレーリレーを泳げる`,
            color: "#8fd0ff",
            onTap: () => this.onCompetitions(),
          });
        }
      }
      for (const b of pinnedBests) {
        this.flashPin(
          b.id,
          b.diff > 0 ? `⏱ ${b.name} 自己ベスト −${b.diff.toFixed(2)}秒！` : `⏱ ${b.name} 初記録！`,
          "#7fd1ae",
        );
      }
      // 大会の成績で格が上がっていたら祝う
      const clubUp = this.state.refreshClubRank();
      if (clubUp) this.celebrateClubRank(clubUp);
      const ups = this.state.takeRankUps();
      if (ups.length > 0) this.celebrateRankUps(ups);
    };
    return { result: r, finish };
  }

  /**
   * 選んだ選手（複数可）を同じレースに出して会場へ。
   * prepaid を渡すと、出場費はエントリーのときに払い済みとして扱う（→ GameState.takePendingRace）。
   * after はレースの画面を閉じて施設に戻ってから呼ぶ（同じ週のレースを続けて泳ぐため）。
   */
  private enterMeet(
    students: Student[],
    comp: Competition,
    ev: RaceEvent,
    prepaid?: number,
    after?: () => void,
    /** その日に泳ぐレースの一覧（会場の隅に出す）。 */
    dayCard?: { label: string; mine: string; current: boolean }[],
  ): void {
    this.closeCompModal();
    this.closePanel();
    let finish: (() => void) | null = null;
    this.scene.launch("Meet", {
      students,
      comp,
      event: ev,
      dayCard,
      resolve: () => {
        const r = this.resolveRace(students, comp, ev, prepaid);
        finish = r.finish;
        return r.result;
      },
      // 【全結果へ】残りのレースはアニメーション無しで泳ぎ、その日の結果一覧を出す
      onSkipAll: after ? () => (this.skipAllRaces = true) : undefined,
      onClose: () => {
        finish?.();
        this.autoSave("大会のあと"); // 節目の自動セーブ
        if (this.skipAllRaces) {
          this.time.delayedCall(250, () => this.finishRacesInstantly());
          return;
        }
        // 会場の画面はこのあと自分を止めるので、次のレースは施設に戻ってから始める
        if (after) this.time.delayedCall(400, after);
      },
    });
    this.scene.pause();
  }

  /**
   * 【全結果へ】その日の残りのレースを、会場を開かずに一気に泳ぐ。
   * 結果は見ていたレースと合わせて一覧（RaceSummaryModal）で出す。閉じたら次の予定を見る。
   */
  private finishRacesInstantly(): void {
    let guard = 0;
    for (let race = this.state.racesDue()[0]; race && guard < 40; race = this.state.racesDue()[0], guard++) {
      const go = this.state.takePendingRace(race);
      if (go.withdrawn.length > 0) {
        this.notices.push({
          icon: "⚠",
          title: `${go.comp?.name ?? "大会"} を欠場`,
          detail: `${go.withdrawn.map((s) => s.name).join("・")}（ケガなどで出られない。出場費◆${go.refund} を返金）`,
          color: "#e67e22",
        });
      }
      if (!go.comp || go.roster.length === 0) continue;
      this.resolveRace(go.roster, go.comp, go.event, go.prepaid).finish();
    }
    this.skipAllRaces = false;
    this.refreshHud();
    this.autoSave("大会のあと");
    this.showRaceSummary();
  }

  /** その日の大会の結果一覧を出す（閉じたら次の予定＝出場確認などを見る）。 */
  private showRaceSummary(): void {
    const rows = this.raceLog;
    this.raceLog = [];
    this.raceSummary?.destroy();
    this.raceSummary = new RaceSummaryModal(this, rows, () => {
      this.raceSummary?.destroy();
      this.raceSummary = undefined;
      this.racing = false;
      this.checkMeets();
    });
  }

  // ---------------------------------------------------------------- 演出

  private txt(x: number, y: number, s: string, size: number, color: string, bold = false): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, {
      fontFamily: "sans-serif",
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? "bold" : "normal",
    });
  }

  /** 画面上部のお知らせ。important な内容（セーブ結果など）は設定OFFでも出す。 */
  private toast(message: string, color: string, life = 1500, important = false): void {
    if (!important && !settings().showToast) return;
    const cy = HUD_H + 40;
    const t = this.add
      .text(GAME_WIDTH / 2, cy, message, {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color,
        fontStyle: "bold",
        backgroundColor: "#0a1622dd",
        padding: { x: 12, y: 6 },
        align: "center",
        wordWrap: { width: GAME_WIDTH - 40 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(3000);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: cy - 8,
      duration: 200,
      ease: "Quad.out",
      onComplete: () => {
        this.tweens.add({
          targets: t,
          alpha: 0,
          y: cy - 14,
          delay: life,
          duration: 400,
          onComplete: () => t.destroy(),
        });
      },
    });
  }

  private playTalentEffect(): void {
    this.celebrate.push({
      icon: "✦",
      title: "才能ある子が入会したかも",
      subtitle: "名簿で確かめてみよう",
      color: "#f7dc6f",
      burst: true,
      durationSec: FX.celebrateSec,
    });
  }

  /** イベント（体験会・キャンペーン・短期教室）の結果を短い演出で見せる。 */
  private celebrateEvent(title: string, subtitle: string, color = "#2ecc71"): void {
    this.celebrate.push({ icon: "🎉", title, subtitle, color, durationSec: FX.popSec + 0.4 });
  }
}
