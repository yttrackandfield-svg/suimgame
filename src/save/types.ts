import type { ClassId } from "../sim/classes";
import type { Gender, PlanMode, PlanStroke, StatKey, Stroke } from "../sim/student";
import type { GrowthType } from "../sim/growth";

/**
 * セーブデータのスキーマ（バージョン付き）。
 *
 * 設計方針
 *  - ゲームの全状態（年月・所持金・人気度・全選手・全コーチ・時計・進行フラグ）を
 *    ひとつの JSON にまとめる。ランタイムのオブジェクトをそのまま入れず、
 *    「保存形式」を独立して定義する（実装をリファクタしても壊れないように）。
 *  - version を必ず持ち、読み込み時に migrate.ts で現行バージョンへ引き上げる。
 *  - 5ステータス／5泳法のような固定長 Record は配列で持つ（順序は下の定数が真実）。
 *    順序を変えるときは必ずマイグレーションを書くこと。
 */

/** 現行のセーブデータバージョン。構造を変えたら +1 して migrate.ts にステップを足す。 */
export const SAVE_VERSION = 31;

/** セーブ枠の数（設計：3枠）。 */
export const SLOT_COUNT = 3;

/** v1 の stats/talent/trainCount/streak 配列の順序。 */
export const V1_STAT_ORDER: readonly StatKey[] = ["speed", "stamina", "form", "start", "turn"];

/** v1 の strokeProf 配列の順序。 */
export const V1_STROKE_ORDER: readonly Stroke[] = ["free", "back", "breast", "fly", "im"];

/** 泳法の才能（v26〜）の配列の順序。個人メドレーは持たない（4泳法の平均で表す）。 */
export const V1_CORE_STROKE_ORDER: readonly Stroke[] = ["free", "back", "breast", "fly"];

export interface StudentSaveV1 {
  id: number;
  name: string;
  grade: string;
  gender: Gender;
  classId: ClassId;
  tint: number;
  stats: number[]; // V1_STAT_ORDER 順
  talent: number[]; // V1_STAT_ORDER 順
  trainCount: number[]; // V1_STAT_ORDER 順
  streak: number[]; // V1_STAT_ORDER 順
  strokeProf: number[]; // V1_STROKE_ORDER 順
  energy: number;
  fav: { stroke: Stroke; distance: number };
  plan: { ability: StatKey; stroke: PlanStroke };
  practiceAccum: number;
  growthType: GrowthType;
  growthObserved: number;
  condition: number;
  season: { year: number; clearedStages: string[]; standards: string[]; standardEvents?: string[] };
}

/**
 * v4 で選手に増えた項目。
 *  - 休養（次の練習を休む）の予約状態
 *  - 全体練習か個人指定か
 *  - 回復設備を使いに行くための欲求
 *  - 格（8段階）の根拠になる成績：自己ベストと実績ポイント
 */
export interface StudentSaveV4 extends StudentSaveV1 {
  planMode: PlanMode;
  /**
   * 休養（v21〜）：いつまで休むか（通算の日数＝週。0＝休養なし）。
   * v20 までは restPending（あと何回）＋ resting（今休んでいるか）の2つだった。
   */
  restUntilDay: number;
  recoveryNeed: number;
  achievePoints: number;
  bestTimeScore: number;
  bestTimeSec: number;
  bestTimeEvent: { stroke: Stroke; distance: number } | null;
  rankTier: number;
  wins: number;
}

export interface CoachSaveV1 {
  id: number;
  name: string;
  quality: number;
  assigned: ClassId | null;
  /** 担当時間外の過ごし方（v6 で追加。未設定は "idle"）。 */
  duty?: "idle" | "research";
  /** 得意泳法＝専門種目（v8 で追加。未設定はロード時にランダムで振る）。 */
  specialty?: Stroke;
  /** 指導力（v15 で追加。未設定は格から見積もる）。 */
  teaching?: number;
}

/** 専門スタッフ（栄養士・ドクター）。v8 で追加。 */
export interface StaffSaveV8 {
  id: number;
  name: string;
  kind: string; // StaffKind（未知の値は読み込み時に捨てる）
}

/**
 * v8 で選手に増えた項目。
 *  - injuryDays … 残りのケガ日数（0＝健康）
 *  - altitude   … 高地合宿から降りたあとの状態（効果が切れたら null）
 */
export interface StudentSaveV8 extends StudentSaveV4 {
  injuryDays: number;
  altitude: {
    descentDay: number;
    adaptation: number;
    failed: boolean;
    sprintDull: number;
    stayDays: number;
  } | null;
}

/** 設置済みの設備（v2 で追加）。 */
export interface EquipmentSaveV2 {
  id: number;
  kind: string; // EquipmentKind（未知の値は読み込み時に捨てる）
}

/**
 * v9 の設備。マップ上の位置を持つ（左上のマス）。
 * null＝未配置（買ったがまだ置いていない＝倉庫にある）。
 */
export interface EquipmentSaveV9 extends EquipmentSaveV2 {
  gx: number | null;
  gy: number | null;
  /**
   * v17：部屋のグレード（1＝小 / 2＝中 / 3＝大）。
   * 器具を1つずつ買う仕組みをやめ、部屋のグレードが中身を決めるようになった。
   * v16 以前のセーブは、持っていた器具の数からグレードに読み替える（→ migrate 16）。
   */
  grade?: number;
  /**
   * 部屋の向き（1＝縦と横を入れ替えた）。省略＝買ったときの向き。
   * 足しただけで古いセーブは「省略」として読めるので、版は上げていない。
   */
  rot?: number;
}

/** v9 の時間割の1コマ。 */
export interface TimetableSaveV9 {
  poolId: number;
  slot: number;
  classId: ClassId;
  coachId: number | null;
}

export interface GameSaveV3 {
  clubName: string;
  popularity: number;
  gems: number;
  year: number;
  month: number;
  championships: number;
  currentClassId: ClassId | null;
  nextStudentId: number;
  nextCoachId: number;
  nextEquipmentId: number;
  /** 全クラスの選手をフラットに持つ（classId は各要素が持つ）。表示順＝配列順。 */
  students: StudentSaveV1[];
  coaches: CoachSaveV1[];
  /** 設備（プール／スタジオ／筋トレルーム）。 */
  equipment: EquipmentSaveV2[];
  /** 今月すでに開催したイベント／キャンペーンのID。 */
  heldThisMonth: string[];
  /** チュートリアルの進行位置（-1＝実施しない／完了済み）。v3 で追加。 */
  tutorialStep: number;
  /** 今月の入会数と、練習枠が足りず断った数（月次レポート用）。v3 で追加。 */
  monthEnrolled: number;
  monthTurnedAway: number;
}

/**
 * v4 のゲーム状態。
 *  - items      … クラブ共用のアイテム所持数（ストレッチマット等）
 *  - classPlans … クラス単位の全体練習メニュー（育成B〜プロ）
 * equipment 配列はそのままで、回復設備（sauna / massage）が kind として増えるだけ。
 */
export interface GameSaveV4 extends GameSaveV3 {
  students: StudentSaveV4[];
  /** 【廃止】買って置くアイテム。読み書きしない（古いセーブに残っているだけ）。 */
  items: Partial<Record<string, number>>;
  classPlans: Partial<Record<ClassId, { ability: StatKey; stroke: PlanStroke } | null>>;
}

export interface ClockSaveV1 {
  minuteOfDay: number;
  week: number;
  speed: number;
}

export interface SaveDataV3 {
  version: 3;
  savedAt: number; // epoch ms
  playTimeMs: number; // 通算プレイ時間（実時間）
  game: GameSaveV3;
  clock: ClockSaveV1;
}

export interface SaveDataV4 {
  version: 4;
  savedAt: number; // epoch ms
  playTimeMs: number; // 通算プレイ時間（実時間）
  game: GameSaveV4;
  clock: ClockSaveV1;
}

/**
 * v5 のゲーム状態。
 *  - clubAchievement / clubRankTier … クラブの格（大会実績＋人気度）
 *  - itemPlacements                 … 買ったアイテムを施設内のどこに置いたか
 * 設備の kind に reception（フロント設備）と装飾アイテムが増えるが、
 * どちらも既存の配列・レコードに追加されるだけなので構造は変わらない。
 */
export interface GameSaveV5 extends GameSaveV4 {
  clubAchievement: number;
  clubRankTier: number;
  /** 【廃止】アイテムの置き場所。読み書きしない（古いセーブに残っているだけ）。 */
  itemPlacements: Partial<Record<string, number[]>>;
}

export interface SaveDataV5 {
  version: 5;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV5;
  clock: ClockSaveV1;
}

/**
 * v6 のゲーム状態。
 *  - research     … 進行中の研究（会議室でコーチが進める）
 *  - doneResearch … 完了した研究のID。効果は恒久的にクラブへ効く
 * コーチの duty（待機／研究）は CoachSaveV1 に足してある。
 */
export interface GameSaveV6 extends GameSaveV5 {
  research: { id: string; progress: number } | null;
  doneResearch: string[];
}

export interface SaveDataV6 {
  version: 6;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV6;
  clock: ClockSaveV1;
}

/**
 * v7 のゲーム状態。
 * 設備を「部屋（箱）」と「器具（中身）」の二段構えに整理した。
 * サウナ・マッサージ器は equipment（設備）から items（器具）へ移り、
 * 代わりに「マッサージエリア」という部屋が equipment に入る。
 * 構造自体は v6 と同じで、中身の意味づけだけが変わっている。
 */
export type GameSaveV7 = GameSaveV6;

export interface SaveDataV7 {
  version: 7;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV7;
  clock: ClockSaveV1;
}

/**
 * v8 のゲーム状態。
 *  - staff / nextStaffId … 専門スタッフ（栄養士・ドクター）
 *  - dayCount            … 通算のゲーム内日数。高地合宿の下山タイミングの基準になる
 *  - scoutBoost          … 合宿イベントで溜まった、次のコーチ募集への上乗せ
 * コーチには specialty（得意泳法）、選手には injuryDays / altitude が増えている。
 * 部屋に食堂・ドクタールームが加わるが、equipment 配列に kind が増えるだけ。
 */
export interface GameSaveV8 extends GameSaveV7 {
  students: StudentSaveV8[];
  staff: StaffSaveV8[];
  nextStaffId: number;
  dayCount: number;
  scoutBoost: number;
}

export interface SaveDataV8 {
  version: 8;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV8;
  clock: ClockSaveV1;
}

/**
 * v9 で選手に増えた項目。
 *  - youthForm … 幼少期に到達したフォームの最高値（将来性の根拠）
 *  - inDorm    … 寮に入っているか
 */
export interface StudentSaveV9 extends StudentSaveV8 {
  youthForm: number;
  inDorm: boolean;
  /**
   * 才能ランク（v22〜）。V1_STAT_ORDER 順に "none" / "good" / "great"。
   * 伸びやすさと**到達できる上限**の両方を決める（→ config の TALENT）。
   * v21 までは talent（数値）だけで、上限の概念が無かった。
   */
  talentRank?: string[];
}

/**
 * v9 のゲーム状態。マップ（マス目・自由配置）と時間割が入る。
 *  - equipment   … 部屋ごとに gx/gy（マップ上の位置）を持つようになった
 *  - roads       … 敷地内に敷いた道（cols*rows のビット列を数値の配列で持つ）
 *  - timetable   … どのプールの、どのコマで、どのクラスを回すか
 *  - guestIncome … 今月の一般客の売上（月次レポート用）
 */
export interface GameSaveV9 extends Omit<GameSaveV8, "students" | "equipment"> {
  students: StudentSaveV9[];
  equipment: EquipmentSaveV9[];
  /** 【廃止】道を敷いたマスの通し番号。道の仕組みをやめたので、書き出しは常に空・読み込みは無視。 */
  roads: number[];
  /** マップの寸法（読み込み時に今の config と違えば作り直す）。 */
  mapCols: number;
  mapRows: number;
  timetable: TimetableSaveV9[];
  guestIncome: number;
  /** 【廃止】遠方スカウトの最終月（2026-09-23 に機能ごと無くした）。古いセーブに残っているだけ。 */
  lastScoutMonth?: number;
}

export interface SaveDataV9 {
  version: 9;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV9;
  clock: ClockSaveV1;
}

/**
 * v10 で選手に増えた項目。
 *  - personalCoachId … 専属コーチ（プロだけが持てる。null＝クラスの監督が見る）
 */
export interface StudentSaveV10 extends StudentSaveV9 {
  personalCoachId: number | null;
}

export interface GameSaveV10 extends Omit<GameSaveV9, "students"> {
  students: StudentSaveV10[];
}

export interface SaveDataV10 {
  version: 10;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV10;
  clock: ClockSaveV1;
}

/**
 * v11 で選手に増えた項目。
 *  - inRehab … クリニックでリハビリ中か（受診させると入る）
 */
export interface StudentSaveV11 extends StudentSaveV10 {
  inRehab: boolean;
}

export interface GameSaveV11 extends Omit<GameSaveV10, "students"> {
  students: StudentSaveV11[];
}

export interface SaveDataV11 {
  version: 11;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV11;
  clock: ClockSaveV1;
}

/**
 * v12 で増えたもの。
 *  - rngState     … ゲーム内の乱数の状態。これを保存しないと、読み込むたびに
 *                   乱数が引き直しになり、同じところから始めても結果が変わってしまう。
 *  - enrollTimer  … 次の入会までの残り時間（ゲーム内分）
 *  - flavorTimer  … 次の小ネタまでの残り時間
 */
export interface GameSaveV12 extends GameSaveV11 {
  rngState: number;
  enrollTimer: number;
  flavorTimer: number;
}

export interface SaveDataV12 {
  version: 12;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV12;
  clock: ClockSaveV1;
}

/**
 * v13 で選手に増えた項目。
 *  - awayDays … 大会遠征でクラブを空けている残り日数
 */
export interface StudentSaveV13 extends StudentSaveV11 {
  awayDays: number;
}

/**
 * v13 で増えたもの。
 *  - campaignRepeats … キャンペーンを続けて打った回数（多いほど効果が落ちる）
 *  - students[].awayDays … 大会遠征で練習を空けている日数
 * あわせて、サウナが「マッサージエリアに置く器具」から「どこにでも建てられる部屋」に変わった。
 */
export interface GameSaveV13 extends Omit<GameSaveV12, "students"> {
  students: StudentSaveV13[];
  campaignRepeats: Record<string, number>;
}

export interface SaveDataV13 {
  version: 13;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV13;
  clock: ClockSaveV1;
}

/**
 * v14 で増えたもの。
 *  - landSteps … 買い足した敷地の段数（0＝初期の 12×12 マス）
 *
 * マスの配列そのものは今までどおり最大の大きさなので、道のマス番号は変わらない。
 * v13 までのセーブは 24×24 の敷地で遊んでいたので、移行では最大まで買った状態にする
 *（狭めると、すでに建っている部屋や敷いた道が敷地の外に出てしまうため）。
 */
export interface GameSaveV14 extends GameSaveV13 {
  landSteps: number;
  /** 今月すでに特別練習をした選手のID（1人につき月1回まで）。 */
  specialUsed: number[];
}

export interface SaveDataV14 {
  version: 14;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV14;
  clock: ClockSaveV1;
}

/** v15 の研究（会議室1部屋につき1件・コーチ4人1組）。 */
export interface ResearchProjectSaveV15 {
  roomId: number;
  id: string;
  progress: number;
  coachIds: number[];
  targetLevel: number;
}

/**
 * v15 で増えたもの。
 *  - coaches[].teaching … 指導力（研究で伸びる後天的な能力）
 *  - researchProjects   … 会議室ごとに進んでいる研究（4人1組）
 *  - researchLevels     … テーマごとの到達レベル（効果はレベルに比例）
 *
 * v14 までの `research`（同時に1つ）と `doneResearch`（完了ID）は、
 * それぞれ「1件のプロジェクト」と「全部 Lv1」に読み替える。
 */
export interface GameSaveV15 extends Omit<GameSaveV14, "research" | "doneResearch"> {
  researchProjects: ResearchProjectSaveV15[];
  researchLevels: Record<string, number>;
}

export interface SaveDataV15 {
  version: 15;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV15;
  clock: ClockSaveV1;
}

/**
 * v16：中身の形は v15 と同じ。**マップの大きさが 26×26 → 37×37 に変わった**ので、
 * 部屋の座標と道のマス番号を新しい中心へずらすためだけにバージョンを上げている
 *（敷地は中央ぞろえなので、マップが大きくなると同じ座標が別の場所を指してしまう）。
 */
export type GameSaveV16 = GameSaveV15;

export interface SaveDataV16 {
  version: 16;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV16;
  clock: ClockSaveV1;
}

/**
 * v17：**器具を部屋に同梱**した。
 *
 * 器具を1個ずつ買って部屋の枠に置く仕組みを廃止し、部屋が
 * グレード（1＝小 / 2＝中 / 3＝大）を持つようになった。中身（器具）・
 * 同時に使える人数・練習効果・維持費は、すべてグレードから決まる。
 * 形の変化は EquipmentSaveV9.grade が増えただけで、
 * items / itemPlacements は外構の装飾にだけ使う。
 */
export type GameSaveV17 = GameSaveV16;

export interface SaveDataV17 {
  version: 17;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV17;
  clock: ClockSaveV1;
}

/**
 * v18 で選手に増えた項目。
 *  - mood … 満足度（機嫌）0-100
 *
 * 良い設備を使えた・練習がうまくいった・伸びた で上がり、
 * 混雑・待たされる・疲労 で下がる（→ sim/satisfaction.ts）。
 */
export interface StudentSaveV18 extends StudentSaveV13 {
  mood: number;
}

export interface GameSaveV18 extends Omit<GameSaveV17, "students"> {
  students: StudentSaveV18[];
}

export interface SaveDataV18 {
  version: 18;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV18;
  clock: ClockSaveV1;
}

/**
 * v19：**更衣室を廃止**した。
 *
 * 構造そのものは v18 と同じ（部屋の種類が1つ減っただけ）。
 * 古いセーブに残っている更衣室は migrate.ts が取り除き、建設費を返す。
 */
export interface SaveDataV19 extends Omit<SaveDataV18, "version"> {
  version: 19;
}

/**
 * v20：**情熱**（クラブ全体で1つのゲージ）を追加。
 *
 * 大会と一般客の満足から溜まり、特別練習で使う（→ config の PASSION）。
 * 古いセーブは開始値から始める。
 */
export interface GameSaveV20 extends GameSaveV18 {
  /** 情熱 0〜PASSION.max。端数を持つので小数で保存する。 */
  passion: number;
}

export interface SaveDataV20 {
  version: 20;
  savedAt: number;
  playTimeMs: number;
  game: GameSaveV20;
  clock: ClockSaveV1;
}

/**
 * v21：休養が「次の練習を N 回休む」から「今週から1週間休む」に変わった。
 *
 * 選手の restPending（あと何回）＋ resting（今休んでいるか）が、
 * restUntilDay（いつまで休むか）1つに置き換わっている（→ StudentSaveV4）。
 * 部屋の構成は変わらない（マッサージエリアの表示名がマッサージエリアになっただけ）。
 */
export interface SaveDataV21 extends Omit<SaveDataV20, "version"> {
  version: 21;
}

/**
 * v22：才能ランク（無印／○／◎）を選手が持つようになった。
 *
 * 伸びやすさに加えて**到達できる上限**（A／S／SS）を決める。
 * v21 までのセーブは、持っていた talent（数値）からランクに読み替える。
 */
export interface GameSaveV22 extends GameSaveV20 {
  /** 大会ごと・種目ごとの最高記録（「大会新記録」の演出に使う）。 */
  meetRecords: Record<string, number>;
}

export interface SaveDataV22 extends Omit<SaveDataV21, "version" | "game"> {
  version: 22;
  game: GameSaveV22;
}

/**
 * v23：敷地の拡張が「中央から四方へ」から「左上を固定して右・下にブロックを足す」に変わった。
 *
 * 構造は v22 と同じ（landSteps の意味が変わっただけ）。
 * 古いセーブは、部屋の座標をまとめて平行移動してから読み込む（→ migrate 22）。
 */
export interface SaveDataV23 extends Omit<SaveDataV22, "version"> {
  version: 23;
}

/**
 * v25 で選手に増えた項目。
 *  - history … 年度ごとの能力の記録（成長の歴史）
 *
 * 1年に1件だけなので、選手生活まるごとでも20件ほど。
 * stats は他と同じく V1_STAT_ORDER 順の配列で持つ。
 */
export interface StudentSaveV25 extends StudentSaveV18 {
  history?: { year: number; grade: string; stats: number[] }[];
}

export interface GameSaveV25 extends Omit<GameSaveV22, "students"> {
  students: StudentSaveV25[];
}

/**
 * v24：才能ランクが3段階（無印／○／◎）から**7段階（E〜SS）**になった。
 *
 * 構造は v23 と同じ（talentRank の中身の文字列が変わっただけ）。
 * 古いセーブは none→C／good→B／great→S に読み替える（→ migrate 23）。
 */
export interface SaveDataV24 extends Omit<SaveDataV23, "version"> {
  version: 24;
}

/**
 * v25：選手が**成長の歴史**（年度ごとの能力の記録）を持つようになった。
 *
 * 古いセーブには歴史が無いので、読み込むときに「いまの能力」を1件目として作る
 *（→ migrate 24）。そこから先は年度の変わり目ごとに1件ずつ増える。
 */
export interface SaveDataV25 extends Omit<SaveDataV24, "version" | "game"> {
  version: 25;
  game: GameSaveV25;
}

/**
 * v26 で選手に増えた項目。
 *  - strokeTalent … 泳法ごとの才能（4泳法。熟練度の上がりやすさと上限を決める）
 *
 * あわせて strokeProf の意味が「専門度 0〜100」から「**熟練度 0〜999**」に変わった。
 * 古いセーブは読み込むときに目盛りを合わせ直す（→ migrate 25）。
 */
export interface StudentSaveV26 extends StudentSaveV25 {
  /** V1_CORE_STROKE_ORDER 順（自由形・背泳ぎ・平泳ぎ・バタフライ）。 */
  strokeTalent?: number[];
}

export interface GameSaveV26 extends Omit<GameSaveV25, "students"> {
  students: StudentSaveV26[];
}

/**
 * v26：泳法が「専門度（0〜100・適性に少し乗る）」から
 * 「**熟練度（0〜999・能力の発揮率）**＋泳法の才能」に変わった。
 */
export interface SaveDataV26 extends Omit<SaveDataV25, "version" | "game"> {
  version: 26;
  game: GameSaveV26;
}

/**
 * v27 で選手に増えた項目。
 *  - age … 実年齢（年度の変わり目に1つ増える）
 *
 * 学年は「社会人」で止まるので、そこから先の一生（ピーク・衰え・引退）を
 * 扱うために実年齢を持たせた。古いセーブは学年から逆算する（→ migrate 26）。
 */
export interface StudentSaveV27 extends StudentSaveV26 {
  age?: number;
}

/** 引退した選手の記録（v27〜）。振り返りとコーチの誘いに使う。 */
export interface RetiredSaveV27 {
  studentId: number;
  name: string;
  age: number;
  grade: string;
  classId: ClassId;
  year: number;
  byChoice: boolean;
  wins: number;
  rankTier: number;
  achievePoints: number;
  bestTimeSec: number;
  bestTimeEvent: { stroke: Stroke; distance: number } | null;
  bestStroke: Stroke;
  bestProf: number;
  /** コーチの誘い（雇うまで残る）。 */
  coachOffer: { coach: CoachSaveV1; cost: number } | null;
}

/** エントリー済みで開催日を待っているレース（足しただけで古いセーブは空として読めるので、版は上げていない）。 */
export interface PendingRaceSave {
  id: number;
  compId: string;
  event: { stroke: Stroke; distance: number };
  studentIds: number[];
  raceDay: number;
  paid: number;
}

export interface GameSaveV27 extends Omit<GameSaveV26, "students"> {
  students: StudentSaveV27[];
  /** 引退した選手（新しい順）。 */
  retired?: RetiredSaveV27[];
  /** エントリー済みで開催日を待っているレース。 */
  pendingRaces?: PendingRaceSave[];
  /** 出場確認を出した主要大会（`年:大会ID`）。 */
  meetConfirmAsked?: string[];
}

/** v27：選手が実年齢を持ち、引退・コーチ化が入った。 */
export interface SaveDataV27 extends Omit<SaveDataV26, "version" | "game"> {
  version: 27;
  game: GameSaveV27;
}

/**
 * v28：コーチの募集が「開くたびに作り直す3人」から**溜まっていく名簿**になった。
 *
 * 応募してきたコーチは毎月積み上がり、一定の月数が過ぎると他所へ行く。
 * その途中経過を保存しないと、セーブ／ロードのたびに名簿が消えてしまう。
 */
export interface RecruitSaveV28 {
  /** 応募者（コーチと同じ形。まだ雇っていないので assigned/duty は使わない）。 */
  coach: CoachSaveV1;
  /** 雇うときに払う一時金。 */
  cost: number;
  /** 名簿に載った通算月（GameState.monthCount）。ここから expireMonths で消える。 */
  since: number;
}

export interface GameSaveV28 extends GameSaveV27 {
  /** コーチの募集名簿（→ COACHING.recruit）。 */
  recruitPool?: RecruitSaveV28[];
  /** 通算の月数（募集名簿の期限に使う）。 */
  monthCount?: number;
}

/** v28：コーチ募集が「溜まっていく名簿」になった。 */
export interface SaveDataV28 extends Omit<SaveDataV27, "version" | "game"> {
  version: 28;
  game: GameSaveV28;
}

/**
 * v29：注目選手の印（★）。
 *
 * 在籍が100人を超えると誰を見ればいいか分からなくなるので、
 * 印を付けた数人だけ HUD に出して追えるようにした。
 * 印はプレイヤーが付けたものなので、**必ず保存する**（消えると付け直しになる）。
 */
export interface StudentSaveV29 extends StudentSaveV27 {
  pinned?: boolean;
}

export interface GameSaveV29 extends Omit<GameSaveV28, "students"> {
  students: StudentSaveV29[];
}

export interface SaveDataV29 extends Omit<SaveDataV28, "version" | "game"> {
  version: 29;
  game: GameSaveV29;
}

/**
 * v30：退会の予告（leaveAtMonth）。
 *
 * 年齢超過の子は**その場では消えず、翌月に退会する**ようになった（猶予1ヶ月）。
 * 予告はセーブをまたいで残らないと、読み込み直すだけで猶予が延びてしまう。
 */
export interface StudentSaveV30 extends StudentSaveV29 {
  /** 退会する通算月数。null／未定義＝予定なし。 */
  leaveAtMonth?: number | null;
}

export interface GameSaveV30 extends Omit<GameSaveV29, "students"> {
  students: StudentSaveV30[];
}

export interface SaveDataV30 extends Omit<SaveDataV29, "version" | "game"> {
  version: 30;
  game: GameSaveV30;
}

/**
 * v31：部屋ごとの「今月の利用回数」。
 *
 * 同じ設備を2つ建てたとき、どちらが働いているかを見せるための数（→ GameState.roomUse）。
 * 月ごとに0へ戻る一時的な数だが、**保存しないと読み込むたびに0に見えて嘘になる**ので持つ。
 */
export interface GameSaveV31 extends GameSaveV30 {
  /** [部屋id, 回数] の並び（0のものは書かない）。 */
  roomUse?: [number, number][];
  /**
   * 選手ごとの「最後に行った合宿の成績」。
   * 次に誰を連れていくかを決める材料なので、消えると意味が無い（→ GameState.campLog）。
   */
  campLog?: {
    id: number;
    year: number;
    month: number;
    label: string;
    gain: number;
    bestStat: string;
    injured: boolean;
  }[];
}

export interface SaveDataV31 extends Omit<SaveDataV30, "version" | "game"> {
  version: 31;
  game: GameSaveV31;
}

/** 現行バージョンのセーブデータ（コード側はこの型だけを扱う）。 */
export type SaveData = SaveDataV31;

/**
 * 枠一覧に出す概要。フルデータとは別キーで保存しておき、
 * データ選択画面が全枠のフルデータを読まずに済むようにする。
 */
export interface SlotHeader {
  version: number;
  savedAt: number;
  clubName: string;
  year: number;
  month: number;
  gems: number;
  popularity: number;
  members: number; // 在籍数（全クラス合計）
  athletes: number; // 選手＋プロの数（育成の進み具合が一目で分かる）
  playTimeMs: number;
  equipment?: number; // 設備の設置数（v2以降）
}

export interface SlotInfo {
  slot: number; // 1..SLOT_COUNT
  header: SlotHeader | null; // null＝空き枠
  broken: boolean; // データはあるが読めない（バージョン不一致・破損）
}
