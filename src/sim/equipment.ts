import { BATHING, EQUIPMENT, RECOVERY, RECOVERY_ROOM, TRAINING_ROOM } from "../config/balance";
import { lifeStageOf } from "./growth";
import type { StatKey, Student } from "./student";

/**
 * 設備は「部屋（箱）」と「器具・アイテム（中身）」の二段構え。
 *
 * 【部屋（箱）】設備として購入する
 *   pool6 / pool8 … 練習枠（1レーン10人）。スクールの在籍上限はこれで決まる
 *   studio        … 鏡張りの部屋。マット・ポール・縄跳びを置く。中学生以上のフォームが伸びる
 *   gym           … ラバー床の部屋。ダンベル〜パワーラックを置く。中学生以上のスピードが伸びる
 *   recovery      … マッサージエリア。マッサージ器での回復（選手専用）
 *   bath/sauna/openair … 温浴施設。お湯・熱・外気での回復（選手＋一般客）。→ BATH_ROOMS
 *   meeting       … 会議室。研究ができるようになる
 *   coachroom     … コーチ室を広くする（雇えるコーチが増える）
 *
 * 【器具・アイテム（中身）】部屋の中に置く
 *   置ける数は「部屋の枠（rooms[kind].slots × 部屋数）」まで。
 *   大きい器具は枠を2つ使う。部屋を増設すれば、より多く置ける。
 *
 * 数値はすべて config/balance.ts（EQUIPMENT.rooms / ITEMS）。
 */

// ------------------------------------------------------------------ 部屋（箱）

export type RoomKind =
  | "pool6"
  | "pool8"
  | "pool10"
  // 大型施設（◆100万）。大型プール・アスリート寮と合わせて4棟
  | "science"
  | "altitudeLab"
  | "studio"
  | "gym"
  | "recovery"
  | "meeting"
  | "coachroom"
  | "cafeteria"
  | "clinic"
  | "dorm"
  | "entrance"
  | "sauna"
  | "bath"
  | "openair"
  | "shop"
  | "cafe"
  | "lounge"
  | "kids"
  | "vending";

/** 後方互換：設備＝部屋。 */
export type EquipmentKind = RoomKind;
export type FacilityKind = RoomKind;

/**
 * 購入画面「部屋」タブの並び。
 *
 * 【役割ごとにまとめ、その中は建てられる順】（2026-09-24）
 * 以前は 入口→プール→**大型施設**→スタジオ→… と、
 * ◆100万の大型施設が序盤に建てる小さな部屋のあいだに挟まっていて、
 * 「いま何を建てられるのか」が読み取れなかった。
 *
 * いまは次の6つのまとまりで、**上から順に手が届く**ように並べてある。
 * 見出しは ROOM_GROUPS が持ち、購入画面はそれを区切りとして出す。
 *   ① 泳ぐ場所   … 入口とプール（まずここから）
 *   ② 鍛える     … 練習の伸びに直接効く部屋
 *   ③ 休ませる   … 体力と調子を戻す部屋
 *   ④ 稼ぐ       … 一般開放して収入になる部屋
 *   ⑤ クラブ運営 … コーチ・研究・ケガ
 *   ⑥ 大型施設   … ◆100万クラス。格が育って初めて建つ
 */
export const ROOM_GROUPS: readonly { label: string; kinds: readonly RoomKind[] }[] = [
  { label: "泳ぐ場所", kinds: ["entrance", "pool6", "pool8"] },
  { label: "鍛える", kinds: ["studio", "gym"] },
  { label: "休ませる", kinds: ["recovery", "bath", "sauna", "openair", "lounge"] },
  { label: "稼ぐ（一般開放）", kinds: ["shop", "vending", "cafe", "cafeteria", "kids"] },
  { label: "クラブ運営", kinds: ["coachroom", "meeting", "clinic"] },
  { label: "大型施設（◆100万）", kinds: ["dorm", "science", "altitudeLab", "pool10"] },
];

export const ROOM_ORDER: readonly RoomKind[] = ROOM_GROUPS.flatMap((g) => g.kinds);
export const EQUIPMENT_ORDER = ROOM_ORDER;
/** 器具を置ける部屋（アイテムの置き先になる）。 */
export const ITEM_ROOMS: readonly RoomKind[] = ["studio", "gym", "recovery"];

/** 設備の分類（今はすべて部屋。上限は EQUIPMENT.maxTotal で共通）。 */
export type EquipmentCategory = "facility";

export interface EquipmentDef {
  kind: RoomKind;
  category: EquipmentCategory;
  label: string;
  /** 購入画面に出す一言（買うときの判断材料）。 */
  note: string;
  /** 施設をタップしたときに出す説明（1〜2行。何をする場所か）。 */
  description: string;
  cost: number;
  upkeep: number;
  lanes: number; // プールのレーン数（0＝プールでない）
  /** この部屋が伸ばしやすくするステータス（無ければ null）。 */
  boosts: StatKey | null;
  /** この部屋1つに置ける器具の枠数（0＝器具を置けない）。 */
  slots: number;
  /** 建てられる上限（0＝設備全体の上限まで）。 */
  maxUnits: number;
  /** 毎月クラブの人気度に加える量（1部屋あたり）。 */
  popularity: number;
  /** マップ上で占有するマス数（w列×h行）。 */
  size: { w: number; h: number };
}

/**
 * 温浴施設（風呂・サウナ・外気浴）。
 *
 * 3つとも独立した部屋で、**グレードは持たない**（建てるか建てないかだけ）。
 * 回復の席は部屋そのものが持ち、席数・回復量は config の BATHING.rooms で決まる。
 * 選手（欲求ドリブン）と一般客（有料）が同じ部屋を一緒に使う。
 */
export const BATH_ROOMS: readonly RoomKind[] = ["bath", "sauna", "openair"];

/** 回復の席を持つ部屋。後方互換の名前（中身は温浴施設と同じ）。 */
export const RECOVERY_ROOMS: readonly RoomKind[] = BATH_ROOMS;

export function isBathRoom(kind: RoomKind): boolean {
  return BATH_ROOMS.includes(kind);
}

const BOOSTS: Record<RoomKind, StatKey | null> = {
  pool6: null,
  pool8: null,
  pool10: null,
  // 医科学センターは1つの能力ではなく練習ぜんたいに効く（→ GameState.equipmentMultFor）
  science: null,
  // 低酸素室は持久力の部屋
  altitudeLab: "stamina",
  studio: "form",
  gym: "speed",
  recovery: null,
  meeting: null,
  coachroom: null,
  cafeteria: null,
  clinic: null,
  dorm: null,
  entrance: null,
  sauna: null,
  bath: null,
  openair: null,
  shop: null,
  cafe: null,
  lounge: null,
  kids: null,
  vending: null,
};

export const EQUIPMENT_DEFS: Record<RoomKind, EquipmentDef> = Object.fromEntries(
  ROOM_ORDER.map((kind) => {
    const c = EQUIPMENT.rooms[kind];
    return [
      kind,
      {
        kind,
        category: "facility" as const,
        label: c.label,
        note: c.note,
        description: (c as { description?: string }).description ?? c.note,
        cost: c.cost,
        upkeep: c.upkeep,
        lanes: c.lanes,
        boosts: BOOSTS[kind],
        slots: c.slots,
        maxUnits: c.maxUnits,
        popularity: EQUIPMENT.popularityPerMonth[kind] ?? 0,
        size: { w: c.size.w, h: c.size.h },
      },
    ];
  }),
) as Record<RoomKind, EquipmentDef>;

export function equipmentDef(kind: RoomKind): EquipmentDef {
  return EQUIPMENT_DEFS[kind];
}

export function isEquipmentKind(v: string): v is RoomKind {
  return (ROOM_ORDER as readonly string[]).includes(v);
}

/**
 * 設置済みの部屋1つ。
 * gx/gy はマップ上の左上マス。未配置（倉庫にある）ときは null。
 * grade は 1＝小 / 2＝中 / 3＝大（グレードを持たない部屋は常に 1）。
 */
export interface Equipment {
  id: number;
  kind: RoomKind;
  gx: number | null;
  gy: number | null;
  grade?: number;
  /**
   * 向き。1＝回した（縦と横を入れ替えた）。省略・0＝買ったときの向き。
   *
   * 【回転＝縦横の入れ替え】斜め上から見る画面では、部屋の「奥の壁」は北辺と西辺の2つ。
   * 縦と横を入れ替えても奥は奥のままなので、壁・出入口・中が見える向きがそのまま使える
   * （画面の上では左右が反転して見える）。90度そのまま回すと手前に高い壁が来て中が隠れる。
   * 部屋の中身（什器・レーン・席）は「回す前の向き」の相対位置で持ち、roomPoint で置き換える。
   */
  rot?: RoomRot;
}

/** 部屋の向き（0＝買ったときのまま／1＝縦横を入れ替えた）。 */
export type RoomRot = 0 | 1;

// ------------------------------------------------------------------ 部屋のグレード（小・中・大）

/**
 * グレードを持つ部屋。
 *
 * 部屋は**器具込み**で建つ（器具を1つずつ買って置く仕組みは廃止した）。
 * グレードを上げると器具が増え、同時に使える人数と練習効果が上がり、維持費も上がる。
 * プールはレーン数で規模を表すので、ここには入れない。
 */
export const GRADED_ROOMS: readonly RoomKind[] = ["gym", "studio", "recovery"];

export function hasGrade(kind: RoomKind): boolean {
  return GRADED_ROOMS.includes(kind);
}

/** その部屋のグレード（1..3）。グレードを持たない部屋は常に 1。 */
export function gradeOf(e: Equipment): number {
  if (!hasGrade(e.kind)) return 1;
  return clampGrade(e.grade ?? 1);
}

export function clampGrade(g: number): number {
  return Math.max(1, Math.min(EQUIPMENT.grade.max, Math.floor(g || 1)));
}

export const MAX_GRADE = EQUIPMENT.grade.max;

/** グレードの表示名（小・中・大）。 */
export function gradeLabel(grade: number): string {
  return EQUIPMENT.grade.label[clampGrade(grade) - 1] ?? "小";
}

function tier(grade: number): (typeof EQUIPMENT.grade.tier)[number] {
  return EQUIPMENT.grade.tier[clampGrade(grade) - 1];
}

/** そのグレードの購入費（グレードを持たない部屋は基本費のまま）。 */
export function gradeCost(kind: RoomKind, grade: number): number {
  const base = EQUIPMENT_DEFS[kind].cost;
  if (!hasGrade(kind)) return base;
  return Math.round(base * tier(grade).costMult);
}

/** そのグレードの維持費。 */
export function gradeUpkeep(kind: RoomKind, grade: number): number {
  const base = EQUIPMENT_DEFS[kind].upkeep;
  if (!hasGrade(kind)) return base;
  return Math.round(base * tier(grade).upkeepMult);
}

/**
 * グレードアップの費用（いまのグレード → 1つ上）。上げられないときは 0。
 *
 * **部屋の種類によらず同じ額**（→ EQUIPMENT.grade.upgradeCosts）。
 * 以前は部屋の基本費に比例させていたので、安い部屋ほど上げ賃も安く、
 * 「とりあえず全部の部屋を大にする」のが最善手になっていた。
 */
export function upgradeCost(kind: RoomKind, grade: number): number {
  if (!hasGrade(kind) || clampGrade(grade) >= MAX_GRADE) return 0;
  return EQUIPMENT.grade.upgradeCosts[clampGrade(grade) - 1] ?? 0;
}

/**
 * その部屋で同時に使える人数（練習台数／回復の席数）。
 * グレードを持たない部屋は 0（＝ここでは数えない）。
 */
export function stationsOf(e: Equipment): number {
  if (!hasGrade(e.kind)) return 0;
  // マッサージエリアは回復の席（小4・中6・大10名 → RECOVERY_ROOM.massageSeatsByGrade）
  if (e.kind === "recovery") {
    return RECOVERY_ROOM.massageSeatsByGrade[gradeOf(e) - 1] ?? RECOVERY_ROOM.seatsPerRoom;
  }
  return tier(gradeOf(e)).stations;
}

/** 練習効果の倍率（1.0＝小）。 */
export function gradeEffect(grade: number): number {
  return tier(grade).effect;
}

/** 一般客の受け入れ枠の倍率。 */
export function gradeGuestMult(grade: number): number {
  return tier(grade).guestMult;
}

/** その部屋が占有するマス数（w×h）。rot=1 なら縦と横が入れ替わる。 */
export function footprintOf(kind: RoomKind, rot: RoomRot = 0): { w: number; h: number } {
  const s = EQUIPMENT_DEFS[kind].size;
  return rot === 1 ? { w: s.h, h: s.w } : s;
}

/** その部屋の向き（rot を持っていなければ 0）。 */
export function rotOf(e: Equipment): RoomRot {
  return e.rot === 1 ? 1 : 0;
}

/** 置いてある部屋の、いまの向きでの大きさ。 */
export function roomSize(e: Equipment): { w: number; h: number } {
  return footprintOf(e.kind, rotOf(e));
}

/**
 * 部屋の中の位置（**回す前の向き**で、部屋の左上からの相対マス）→ マップ上の位置。
 * 什器・レーン・席はすべて回す前の向きで書いてあるので、ここを通せば回した部屋にも合う。
 */
export function roomPoint(e: Equipment, dx: number, dy: number): { gx: number; gy: number } {
  const gx = e.gx ?? 0;
  const gy = e.gy ?? 0;
  return rotOf(e) === 1 ? { gx: gx + dy, gy: gy + dx } : { gx: gx + dx, gy: gy + dy };
}

/** roomPoint の逆（マップ上の位置 → 回す前の向きでの相対位置）。 */
export function roomLocal(e: Equipment, gx: number, gy: number): { dx: number; dy: number } {
  const x = gx - (e.gx ?? 0);
  const y = gy - (e.gy ?? 0);
  return rotOf(e) === 1 ? { dx: y, dy: x } : { dx: x, dy: y };
}

/** その部屋のマス数（面積）。 */
export function footprintArea(kind: RoomKind): number {
  const f = footprintOf(kind);
  return f.w * f.h;
}

/** プールかどうか（レーンを持つ）。 */
export function isPool(kind: RoomKind): boolean {
  return EQUIPMENT_DEFS[kind].lanes > 0;
}

/** プールの種類の一覧（時間割を組める部屋）。 */
export const POOL_KINDS: readonly RoomKind[] = ROOM_ORDER.filter((k) => EQUIPMENT_DEFS[k].lanes > 0);

/** そのレーン数のプールの、1コマあたりの練習枠。 */
export function laneSlotsOf(kind: RoomKind): number {
  return EQUIPMENT_DEFS[kind].lanes * EQUIPMENT.perLane;
}

/** 時間割でクラスを入れて使う**練習の部屋**（プール以外）。→ config の TRAINING_ROOM */
export const TRAINING_ROOM_KINDS: readonly RoomKind[] = ["science", "altitudeLab"];

export function isTrainingRoom(kind: RoomKind): boolean {
  return TRAINING_ROOM_KINDS.includes(kind);
}

/** 時間割に並べられる部屋か（プール＋練習の部屋）。 */
export function isVenue(kind: RoomKind): boolean {
  return isPool(kind) || isTrainingRoom(kind);
}

/** 時間割の1コマに入れる人数（プール＝レーン枠／練習の部屋＝TRAINING_ROOM.capacity）。 */
export function venueSlotsOf(kind: RoomKind): number {
  return isTrainingRoom(kind) ? TRAINING_ROOM.capacity : laneSlotsOf(kind);
}

/**
 * 一般客が有料で使える部屋の種別。
 * 料金・定員は pool/gym/studio は GUESTS、温浴（bath/sauna/openair）は BATHING を見る。
 */
export function guestRoomCategory(
  kind: RoomKind,
): "pool" | "gym" | "studio" | "bath" | "sauna" | "openair" | "shop" | "cafe" | "lounge" | "kids" | "vending" | null {
  if (isPool(kind)) return "pool";
  if (kind === "gym") return "gym";
  if (kind === "studio") return "studio";
  if (isBathRoom(kind)) return kind as "bath" | "sauna" | "openair";
  // 賑わいスペース：一般客が「使いに来る」場所（→ config の AMENITY）
  if (isAmenityRoom(kind)) return kind as "shop" | "cafe" | "lounge" | "kids" | "vending";
  return null;
}

/** 賑わいスペース（一般客向け・グレードなし・複数建てられる）。 */
export const AMENITY_ROOMS: readonly RoomKind[] = ["cafe", "shop", "lounge", "kids", "vending"];

export function isAmenityRoom(kind: RoomKind): boolean {
  return AMENITY_ROOMS.includes(kind);
}

// ------------------------------------------------------------------ 温浴施設の連携（ととのう）

/**
 * 2つの部屋の隙間（マス）。0＝辺どうしが隣り合っている。
 * どちらかが未配置なら Infinity（＝連携しない）。
 */
export function roomGap(a: Equipment, b: Equipment): number {
  if (a.gx == null || a.gy == null || b.gx == null || b.gy == null) return Infinity;
  const fa = roomSize(a);
  const fb = roomSize(b);
  // 各軸で、矩形どうしがどれだけ離れているか（重なっていれば 0）
  const dx = Math.max(0, Math.max(a.gx - (b.gx + fb.w), b.gx - (a.gx + fa.w)));
  const dy = Math.max(0, Math.max(a.gy - (b.gy + fb.h), b.gy - (a.gy + fa.h)));
  return Math.max(dx, dy);
}

/**
 * その外気浴が「サウナと連携できているか」（＝ととのう）。
 *
 * サウナで温まってすぐ外気浴へ行ける距離に建っているか、という判定。
 * 配置（どこに建てたか）が効果に効く唯一の仕組みなので、
 * プレイヤーには「サウナの隣に建てる」という設計の動機が生まれる。
 */
export function hasSaunaNearby(room: Equipment, rooms: readonly Equipment[]): boolean {
  if (room.kind !== "openair") return false;
  return rooms.some((e) => e.kind === "sauna" && roomGap(room, e) <= BATHING.synergy.distance);
}

/** 連携している外気浴の部屋（表示・通知に使う）。 */
export function tunedOpenAirRooms(rooms: readonly Equipment[]): Equipment[] {
  return rooms.filter((e) => e.kind === "openair" && hasSaunaNearby(e, rooms));
}

/** 保有設備の合計練習枠（1レーン = EQUIPMENT.perLane 人）。 */
export function totalTrainingSlots(items: readonly Equipment[]): number {
  return items.reduce((n, e) => n + EQUIPMENT_DEFS[e.kind].lanes * EQUIPMENT.perLane, 0);
}

// 【注意】育成B以上の定員は classes.ts の固定値がそのまま定員（→ GameState.capacityOf）。
// 以前ここに「プール1本ごとにレーン比で定員を足す」関数があったが、
// プールを建てるたびに定員が勝手に増える（育成B 36→72）原因だったので廃止した。
// プールを増やして得られるのは「同じ時間に別のクラスも練習できる」ことだけ。

/** 保有設備の毎月の維持費合計（グレードが上がると高くなる）。 */
export function totalUpkeep(items: readonly Equipment[]): number {
  return items.reduce((n, e) => n + gradeUpkeep(e.kind, gradeOf(e)), 0);
}

/** 種類ごとの所有台数。 */
export function countByKind(items: readonly Equipment[], kind: RoomKind): number {
  return items.reduce((n, e) => (e.kind === kind ? n + 1 : n), 0);
}

/** 分類ごとの設置数（今は部屋しかないので全部）。 */
export function countByCategory(items: readonly Equipment[], _category: EquipmentCategory): number {
  return items.length;
}

/** その分類の設置上限。 */
export function categoryLimit(_category: EquipmentCategory): number {
  return EQUIPMENT.maxTotal;
}

/** その部屋1つに置ける器具の枠数。 */
export function roomSlots(kind: RoomKind): number {
  return EQUIPMENT_DEFS[kind].slots;
}

/** その選手は設備を使えるか（設計：中学生以上）。 */
export function canUseEquipment(s: Student): boolean {
  return (EQUIPMENT.trainerMinStages as readonly string[]).includes(lifeStageOf(s.grade));
}

/**
 * 部屋による練習効率の上乗せ（1.0＝部屋なし）。
 * 対象ステータス（スタジオ＝フォーム／筋トレ＝スピード）を鍛えるときだけ効く。
 * 器具ぶんの上乗せは gearTrainBoost() で別に計算する。
 */
export function equipmentTrainMult(items: readonly Equipment[], s: Student, key: StatKey): number {
  if (!canUseEquipment(s)) return 1;
  return roomTrainMultOf(items, key);
}

/**
 * 選手に依らない、部屋の数だけで決まる練習効率の倍率。
 * 購入画面で「建てる前 → 建てた後」を見せるのに使う（投資の効果を数字で示すため）。
 */
export function roomTrainMultOf(items: readonly Equipment[], key: StatKey): number {
  // 部屋の数だけでなく**グレード**も効く（大きい部屋ほど伸びる）
  let weight = 0;
  for (const e of items) {
    if (EQUIPMENT_DEFS[e.kind].boosts === key) weight += gradeEffect(gradeOf(e));
  }
  if (weight === 0) return 1;
  return 1 + Math.min(EQUIPMENT.trainBonusMax, weight * EQUIPMENT.trainBonusPer);
}

/** その設備を使いに行く選手がいるか（表示用）。 */
export function trainerKinds(items: readonly Equipment[]): RoomKind[] {
  const out: RoomKind[] = [];
  for (const kind of ROOM_ORDER) {
    if (!isPool(kind) && countByKind(items, kind) > 0) out.push(kind);
  }
  return out;
}

// ------------------------------------------------------------------ 器具・アイテム
//
// 【廃止】買って置く「器具・外構の装飾」は**無くした**（2026-08-18）。
// 部屋の中の器具は部屋に同梱（グレード）、外構の装飾は遊びに関係しなかったので削除。
// セーブに残っている items / itemPlacements は読み飛ばす（→ save/serialize.ts）。

// ------------------------------------------------------------------ 買い増しのコスト逓増

/**
 * 同じものを買い増すほど高くなる。
 *   費用 = 基本費 × growth^(すでに持っている数)
 */
export function equipmentCostAt(kind: RoomKind, owned: number): number {
  return Math.round(EQUIPMENT_DEFS[kind].cost * Math.pow(costGrowthOf(kind), Math.max(0, owned)));
}

/**
 * その部屋の「買い増すたびの倍率」。
 * 既定は EQUIPMENT.costGrowth（1.45）で、部屋ごとに rooms[kind].costGrowth で上書きできる。
 * プールと大型施設は 2.0 ＝ 2棟目で倍、3棟目で4倍。
 */
export function costGrowthOf(kind: RoomKind): number {
  return (EQUIPMENT.rooms[kind] as { costGrowth?: number }).costGrowth ?? EQUIPMENT.costGrowth;
}

/**
 * そのプールが奥に取る観客席の行数（持たない部屋・プールは 0）。
 * 大型プールだけが観客席を持つ（→ EQUIPMENT.rooms.pool10.standRows）。
 */
export function standRowsOf(kind: RoomKind): number {
  return (EQUIPMENT.rooms[kind] as { standRows?: number }).standRows ?? 0;
}

/** 保有している部屋が毎月生む人気度。 */
export function monthlyPopularityOf(rooms: readonly Equipment[]): number {
  let n = 0;
  for (const e of rooms) n += EQUIPMENT_DEFS[e.kind].popularity;
  return n;
}

/**
 * 筋トレルームによる、スピード成長への上乗せ（0＝筋トレルームなし）。
 *
 * 器具は部屋に同梱なので、**部屋のグレードから直接引く**。
 * 合計には上限がある（部屋を並べるだけでは無双できない）。
 */
export function gymSpeedBoost(rooms: readonly Equipment[]): number {
  let sum = 0;
  for (const e of rooms) {
    if (e.kind !== "gym") continue;
    sum += EQUIPMENT.gymBoostByGrade[clampGrade(gradeOf(e)) - 1] ?? 0;
  }
  return Math.min(EQUIPMENT.gearBonusMax, sum);
}

/** マッサージエリアの上限（表示用）。 */
export const RECOVERY_ROOM_MAX = RECOVERY.maxTotal;
