import type Phaser from "phaser";
import type { Student } from "../sim/student";
import { isoToWorld, depthFor } from "./projection";
import type { BathPose, Cell, SwimLane, Waypoint } from "./facility";
import {
  bodyForStage,
  charTypeOf,
  isWaterMode,
  SUIT_ORIGIN,
  SWIM_ORIGIN,
  variantForGender,
  variantsOfGender,
  WALK_ORIGIN,
  type CharBody,
  type CharMode,
} from "../gfx/textures";
import { applyCharSprite, charAnimKey, charAssetIsWater, charTexture } from "../gfx/charAssets";
import { charFacing, flipXFor } from "../gfx/charFacing";
import type { ProbeRow } from "../dev/devProbe";
import { idlePose, WalkCycle } from "./walkCycle";
import { lifeStageOf } from "../sim/growth";
import { energyMax, type Stroke } from "../sim/student";
import type { ChatterActivity } from "../sim/chatter";
import { AUTONOMY } from "../config/balance";

/**
 * キャラの見た目形態。
 * 泳法・トレーニング・飛び込みまで含めた姿は gfx/charSprites.ts の CharMode がすべて。
 */
type Mode = CharMode;

/** 泳法 → 泳ぎの姿。幼児・学童は泳法別に分けない（→ swimModeFor）。 */
const STROKE_MODE: Record<string, Mode> = {
  free: "swimFree",
  breast: "swimBreast",
  back: "swimBack",
  fly: "swimFly",
};

/**
 * その選手が「いま水の中でどう見えるか」。
 *
 * 中高生以上 … 練習している泳法の姿（クロール／平泳ぎ／背泳ぎ／バタフライ）
 * 幼児・学童 … 泳法では分けず、スクールの基礎練習の姿
 *              （ビート板でバタ足／水に慣れる・浮く）を交互に見せる
 */
export function swimModeFor(body: CharBody, stroke: Stroke | undefined, seed: number): Mode {
  if (body === "kid" || body === "child") return seed % 2 === 0 ? "kick" : "float";
  return STROKE_MODE[stroke ?? "free"] ?? "swimFree";
}

/**
 * 動作状態。
 *  in      … 目的の部屋へ歩いている
 *  swim    … レーンで泳いでいる
 *  train   … 設備（スタジオ/筋トレ）でその場トレーニング
 *  toRecov … 回復設備へ向かって歩いている
 *  recover … 回復設備を使っている（待ち時間ぶん立ち止まる）
 *  out     … 帰り道
 */
type PersonState = "in" | "swim" | "train" | "toRecov" | "recover" | "out" | "done";

const WALK_SPEED = 3.6; // グリッド/秒
const SWIM_SPEED = 2.3;

/**
 * 歩く速さのばらつき（1人ずつ違う）。
 * 全員が同じ速さで動くと、隊列を組んで行進しているように見えてしまう。
 */
function jitterSpeed(base: number): number {
  return base * (1 + (Math.random() * 2 - 1) * AUTONOMY.walkSpeedJitter);
}

/** min〜max のあいだの秒数（立ち止まる間・ひと息つく間）。 */
function randSec(range: { min: number; max: number }): number {
  return range.min + Math.random() * Math.max(0, range.max - range.min);
}
/** スタート（飛び込み）の姿を見せる時間（秒）。長いと泳ぎ出しが遅く見える。 */
const DIVE_SEC = 0.7;
/**
 * プールサイドから水に入るまでの時間（秒）。
 * ここを 0 にする（＝いきなりレーンへ座標を書き換える）と、
 * **プールサイドから水面へ人が瞬間移動する**ように見えてしまう。
 */
const ENTER_WATER_SEC = 0.45;
/**
 * 歩きのモーションを効かせる／抜くときの馴染ませ具合（1フレームあたり）。
 * 大きいほどキビキビ、小さいほどぬるっと切り替わる。
 */
const GAIT_BLEND = 0.18;

/**
 * 【温浴施設の姿勢】立ち姿の絵1枚だけで「浸かる・座る・寝そべる」を作る。
 *
 * 姿勢ごとに専用の絵を用意すると、体型5種×タイプ10種ぶん絵が増えて割に合わない。
 * そこで**立ち姿を切り取って（setCrop）・ずらして・回して**表現している。
 *
 *   soak  … 腰から下を切り落として湯面まで沈める（湯船に浸かっている）
 *   sit   … 腰から下を切り落とし、切り口をベンチの座面の高さに置く（腰かけている）
 *   relax … 切らずに**寝椅子の角度まで倒す**（リクライニングチェアに寝そべる）
 *
 * 【数字の意味】
 *   hide  … 下から切り落とす割合（背丈に対する割合なので、体型が変わっても腰で切れる）
 *   seat  … 席の面が「什器の足元から画面上どれだけ上か」（px）。什器の絵から実測した値
 *   along … 体のどこを席の面に置くか（背丈に対する割合。0.5＝体の真ん中）
 *   rot   … 体を倒す角度（ラジアン・時計まわり）。寝椅子の背もたれの傾きに合わせる
 *
 * **relax が肝**。以前は 0.24rad（14度）しか倒しておらず、しかも足を切り落として
 * 地面の高さに置いていたので、「立ったまま足が地面に埋まっている」ように見えていた。
 * 寝椅子の面は画面上 42度なので、立ち姿（90度）から 0.80rad（46度）倒すとその上に寝る。
 */
export interface PoseStyle {
  hide: number;
  seat: { x: number; y: number };
  along: number;
  rot: number;
}

export const POSE_STYLE: Record<BathPose, PoseStyle> = {
  // 湯船：湯面＝床なので席の高さは0。腰から下がお湯に隠れる
  soak: { hide: 0.46, seat: { x: 0, y: 0 }, along: 0, rot: 0 },
  /**
   * サウナのベンチ。
   *
   * 【座面の「面」に乗せる】fnSaunaBench の座面は什器の足元から 22px 上にあるが、
   * 等角なので座面は**上下に約23px の幅を持つ菱形**（10〜33px）として描かれる。
   * 切り口を 22px（菱形の中心）に置くと、座面の奥半分が体に重なって
   * 「ベンチに埋まっている」ように見えていた。菱形の**奥の縁**まで上げると、
   * ちょうど座面の向こう側から上半身が出ている形になる。
   * 席をベンチより 0.12 マス手前へ出した（→ BATH_SEATS.sauna）ぶんの 3.6px も含めて -32。
   *
   * hide は「腰から下を隠す割合」。隠しすぎると胴が短く見えるので、
   * 太ももが座面に乗るくらいの 0.3 にしてある。
   */
  sit: { hide: 0.3, seat: { x: 0, y: -32 }, along: 0, rot: 0 },
  // 外気浴の寝椅子：面の中心は足元から 38px 上（fnLounger を 1.5倍で描いた実測）。
  // along を 0.5 より小さくすると、体が背もたれ側へ寄りすぎず座面が見える
  relax: { hide: 0, seat: { x: 0, y: -38 }, along: 0.36, rot: 0.8 },
  /**
   * 食事：テーブルは人の手前に描かれるので、隠す量はごく控えめにする。
   * サウナと同じ 0.4 も隠すと、テーブルに隠れて頭しか出ない。
   * 座面は椅子の高さぶん上げる（fnDinerChairF／fnCafeChairF の座面は床から 18px）。
   */
  dine: { hide: 0.18, seat: { x: 0, y: -18 }, along: 0, rot: 0 },
};

/**
 * その人の**頭の上**のワールドY。
 *
 * 原点は姿によって違う（立ち姿＝足元／泳ぎ＝水面）ので、
 * 「y から上に◯px」と決め打ちすると、泳いでいる人と立っている人で高さが揃わない。
 * 実際の表示の高さと原点から出せば、どの姿でも頭の少し上に来る。
 */
function spriteTopOf(sprite: Phaser.GameObjects.Image): number {
  return sprite.y - sprite.displayHeight * sprite.originY;
}

/**
 * 湯に浸かっている人の「湯面」のワールド座標。
 * スプライトの原点は切り取る前の足元なので、切り落としたぶんを引き戻すと湯面になる。
 */
function waterLineOf(sprite: Phaser.GameObjects.Image): { x: number; y: number } {
  return { x: sprite.x, y: sprite.y - sprite.height * POSE_STYLE.soak.hide * sprite.scaleY };
}

/**
 * 姿勢をスプライトに反映し、位置の補正（x/y）と傾きを返す。
 * 姿勢が無い（null）ときは切り取りを解除して素の立ち姿に戻す。
 *
 * スプライトの原点は**切り取る前の足元**（0.5, 1）で、回転もそこを軸に掛かる。
 *   ・切り取ったとき … 切り落としたぶんだけ下げると、切り口が席の面に乗る
 *   ・倒したとき     … 体の「along の位置」が席の面に来るよう、軸をずらして置く
 */
export function applyPose(
  sprite: Phaser.GameObjects.Image,
  pose: BathPose | null,
  t: number,
  phase: number,
  /** 席の什器が左右反転している（回した部屋）。倒す向きと横のずれを鏡に映す。 */
  mirror = false,
): { ox: number; oy: number; rot: number } {
  if (!pose) {
    sprite.setCrop();
    return { ox: 0, oy: 0, rot: 0 };
  }
  const style = POSE_STYLE[pose];
  if (style.hide > 0) sprite.setCrop(0, 0, sprite.width, sprite.height * (1 - style.hide));
  else sprite.setCrop();
  const len = sprite.height * sprite.scaleY; // 画面上の背丈
  // 湯に浸かっている人だけ、ゆっくり上下させる（湯のゆらぎ）
  const bob = pose === "soak" ? Math.sin(t * 1.3 + phase) * 1.2 : Math.sin(t * 1.1 + phase) * 0.5;
  const side = mirror ? -1 : 1;
  if (style.rot === 0) {
    // 切り口を席の面（seat.y）へ。切り落としたぶんだけ下げる
    return { ox: style.seat.x * side, oy: len * style.hide + style.seat.y + bob, rot: 0 };
  }
  // 倒した体の軸（画面の水平からの角度）。立ち姿は真上なので π/2 から回した角度を引く
  const ang = Math.PI / 2 - style.rot;
  const d = style.along * len;
  return {
    ox: (style.seat.x - d * Math.cos(ang)) * side,
    oy: style.seat.y + d * Math.sin(ang) + bob,
    rot: style.rot * side,
  };
}

/**
 * 歩いた距離でコマを送り、素材の向きに合わせて絵を反転する（生徒・一般客で共通）。
 *
 * ・コマのある素材 … 時間ではなく歩数でコマを選ぶ（止まれば足も止まる）
 * ・泳ぎ           … 止まらないので今までどおり時間で回す
 * ・反転           … 素材が左向きに描かれていれば逆に反転する（→ gfx/charFacing.ts）
 */
function stepAnimOf(
  sprite: Phaser.GameObjects.Sprite,
  gait: WalkCycle,
  mode: Mode,
  typeId: string,
  faceDir: 1 | -1,
): void {
  const anims = sprite.anims;
  if (!anims) return; // 消したあとのスプライト（destroy 済み）には触らない
  const anim = anims.currentAnim;
  // いまの姿のアニメーションでなければ触らない。
  // 1枚絵の姿へ替えたあとも currentAnim は前の姿のまま残るので、
  // ここを確かめずにコマを差し替えると**前の姿の絵**が出てしまう。
  if (anim && anim.key === charAnimKey(typeId, mode)) {
    if (isWaterMode(mode)) {
      if (anims.isPaused) anims.resume();
    } else if (anim.frames.length > 1) {
      if (anims.isPlaying) anims.pause();
      const f = anim.frames[gait.frameOf(anim.frames.length)];
      if (f && anims.currentFrame !== f) anims.setCurrentFrame(f);
    }
  }
  sprite.setFlipX(flipXFor(charFacing(typeId, mode), faceDir));
}

/** レーンで泳ぐときの範囲（→ iso/facility.ts の swimLanesOf。回したプールでは縦に泳ぐ）。 */
export type { SwimLane } from "./facility";

export interface PersonPlan {
  /** 入場の道順（敷地の外 → 入口 → …→ 目的地）。 */
  route: Waypoint[];
  /** レーンで泳ぐ場合の範囲。 */
  swim?: SwimLane;
  /** 設備の前で練習する場合の立ち位置。 */
  station?: Cell;
  /** いま練習している泳法（泳ぎの姿を選ぶのに使う）。 */
  stroke?: Stroke;
}

/**
 * 施設内を歩く/泳ぐ1人。Student と紐づき、タップで onSelect。
 *
 * 道順は Scene が sim/clubMap の経路探索で作って渡す（このクラスは経路を知らない）。
 * ＝ 道が繋がっていなければ、そもそも Person は作られない。
 */
export class Person {
  readonly sprite: Phaser.GameObjects.Sprite;
  private state: PersonState = "in";
  private mode: Mode = "walk";
  private gx: number;
  private gy: number;
  private path: Waypoint[];
  private pi = 0;
  private wait: number; // 出発までの待ち（秒）
  private readonly variant: number;
  /** 年代で見た目を変える（幼児は小さく黄色い帽子、学童はランドセル…）。 */
  private readonly body: CharBody;
  private swimDir: 1 | -1 = 1;
  private readonly bobPhase: number;
  private readonly swimSpeed: number;
  /** 歩きのモーション（歩いた距離で回す → iso/walkCycle.ts）。 */
  private readonly gait = new WalkCycle();
  /** 進行方向（画面X。1＝右／-1＝左）。反転するかは素材の向き表で決まる。 */
  private faceDir: 1 | -1 = 1;
  /** 直前に動いた向き（調査用 → dev/devProbe.ts）。 */
  private moveSdx = 0;
  private moveSdy = 0;
  /** いまの姿の素の表示倍率（歩きのつぶれを掛ける前）。 */
  private baseScale = 1;
  /**
   * 歩きのモーションの効き具合（0＝立ち止まり／1＝歩き）。
   * 歩き出し・止まりぎわで少しずつ移すことで、足を上げた姿勢のまま急に止まらない。
   */
  private gaitAmp = 0;
  /** プールサイドから水へ入っている最中の補間（null＝入水済み）。 */
  private entry: { fx: number; fy: number; tx: number; ty: number; t: number } | null = null;
  /**
   * 姿を替えたときの**原点のずれ**（背丈に対する割合）と、その残り時間。
   *
   * 立ち姿は足元、泳ぎは水面が原点なので、姿を替えた瞬間に絵が縦へ跳ねる。
   * ずれを覚えておいて 0 へ戻すと、跳ねが「水に沈む・水から上がる」動きになる。
   */
  private shift = 0;
  private shiftT = 0;

  private lane: SwimLane | null;
  /** 設備で練習する場合の立ち位置（null＝レーンで泳ぐ）。 */
  private readonly station: Cell | null;
  /** 回復設備を使っている残り時間（秒）。 */
  private recoverHold = 0;
  /** 温浴施設での姿勢（湯に浸かる・ベンチに座る・チェアでくつろぐ）。 */
  private pose: BathPose | null = null;
  /** その姿勢のときの服装（温浴＝水着／食事＝そのまま）。 */
  private poseWear: "suit" | "street" = "suit";
  /** 席の什器が左右反転しているか（回した部屋の寝椅子など → applyPose）。 */
  private poseMirror = false;
  /** 見た目タイプのID（外部素材の差し替えに使う）。 */
  private readonly typeId: string;
  /** いま練習している泳法（泳ぎの姿を選ぶ）。 */
  private readonly stroke?: Stroke;
  /** 飛び込みの残り時間（秒）。0より大きいあいだはスタートの姿を出す。 */
  private diveHold = 0;
  /**
   * 【生活感】この人の歩く速さ／立ち止まっている残り秒数。
   *
   * 全員が同じ速さで一度も止まらずに動くと、行列が流れているようにしか見えない。
   * ウェイポイントごとに小さな確率で足を止めると、それだけで
   * 「思い思いに動いている」ように見える（sim には一切影響しない）。
   */
  private readonly walkSpeed = jitterSpeed(WALK_SPEED);
  private pauseHold = 0;
  /** 泳ぎながら壁でひと息ついている残り秒数。 */
  private wallRest = 0;
  /** 一度でも泳いだか（帰りぎわの「はぁ…」を出す判断に使う）。 */
  private swamOnce = false;

  constructor(
    scene: Phaser.Scene,
    world: Phaser.GameObjects.Container,
    readonly student: Student,
    plan: PersonPlan,
    delay: number,
    private readonly onSelect: (s: Student) => void,
  ) {
    // 見た目のタイプは**性別とID**で決まる（男性は0..4、女性は5..9）。
    // IDから決めるので、同じ選手はいつ画面に出ても同じ見た目になり、セーブにも持たなくてよい。
    this.variant = variantForGender(student.gender === "f" ? "f" : "m", student.id);
    this.body = bodyForStage(lifeStageOf(student.grade));
    this.typeId = charTypeOf(this.body, this.variant).id;
    this.station = plan.station ?? null;
    this.stroke = plan.stroke;
    this.lane = plan.swim ?? null;
    this.path = plan.route.length > 0 ? plan.route : [{ gx: 0, gy: 0 }];
    this.wait = delay;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.swimSpeed = SWIM_SPEED * (0.85 + Math.random() * 0.4);

    const start = this.path[0];
    this.gx = start.gx;
    this.gy = start.gy;
    this.pi = 1;

    this.sprite = scene.add
      .sprite(0, 0, this.textureFor("walk"))
      .setOrigin(WALK_ORIGIN.x, WALK_ORIGIN.y)
      .setInteractive({ useHandCursor: true });
    applyCharSprite(this.sprite, "walk", this.body, this.variant, this.typeId);
    this.baseScale = this.sprite.scaleX;
    // 指を離したときに選ぶ（押しっぱなしで施設をドラッグしても誤って開かない）
    this.sprite.on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation?.();
      this.onSelect(this.student);
    });
    world.add(this.sprite);
    this.syncSprite(0);
  }

  get done(): boolean {
    return this.state === "done";
  }

  /** クラス終了：渡された帰り道で帰す。 */
  leave(route: Waypoint[]): void {
    if (this.state === "out" || this.state === "done") return;
    this.path = [{ gx: this.gx, gy: this.gy }, ...route.slice(1)];
    this.pi = 1;
    this.state = "out";
    // 湯から上がるので、切り取り（浸かっている見た目）を解除して立ち姿に戻す
    this.pose = null;
    this.entry = null;
    this.flume = null;
    this.sprite.setCrop();
    if (isWaterMode(this.mode)) this.setMode("suit");
  }

  /** 帰り道に入ったか（並べ直しのときに二重に扱わないための目印）。 */
  get leaving(): boolean {
    return this.state === "out" || this.state === "done";
  }

  /**
   * 練習後、回復設備／アイテムを使いに行く。
   * holdSec のあいだ使い、そのあと帰る。待ち行列は waitSec として先に足しておく。
   * pose を渡すと、着いたあとの姿勢が変わる（風呂＝浸かる／サウナ＝座る／外気浴＝くつろぐ）。
   */
  goRecover(
    route: Waypoint[],
    holdSec: number,
    waitSec = 0,
    pose: BathPose | null = null,
    /**
     * 着いたときに水着になるか。
     * 温浴施設は水着（既定）だが、**食堂で食事をする**ときは着替えさせない。
     * ここを分けないと、食卓に水着で座ることになる。
     */
    wear: "suit" | "street" = "suit",
    /** 席の什器が左右反転しているか（回した部屋）。 */
    mirror = false,
    /** 何をしに行くか（吹き出しの内容に使う）。measure＝医科学センターで測定。 */
    purpose: "recover" | "measure" = "recover",
    /**
     * 流水プールに入って泳ぐとき（医科学センター）。着いたら泳ぎの姿になり、
     * 水槽の水面の高さ（lift px 上）に浮かせて描く。重なり順は水槽の置き場所（depthAt）で決める
     *（水槽の真ん中のマスで決めると、水槽の絵より奥になって隠れる）。
     */
    flume: { lift: number; depthAt: Cell } | null = null,
  ): void {
    if (this.state === "out" || this.state === "done") return;
    this.path = [{ gx: this.gx, gy: this.gy }, ...route.slice(1)];
    this.pi = 1;
    this.state = "toRecov";
    this.visitPurpose = purpose;
    this.flume = flume;
    this.recoverHold = Math.max(0.4, holdSec) + Math.max(0, waitSec);
    this.pose = pose;
    this.poseWear = wear;
    this.poseMirror = mirror;
    this.entry = null;
    if (wear === "suit" && isWaterMode(this.mode)) this.setMode("suit");
    if (wear === "street") this.setMode("walk");
  }

  /** 寄り道の目的（回復設備か、医科学センターの測定か）。吹き出しの言葉を変える。 */
  private visitPurpose: "recover" | "measure" = "recover";
  /** 流水プールで泳いでいる（→ goRecover の flume）。 */
  private flume: { lift: number; depthAt: Cell } | null = null;

  /** 流水プールを使っている（向かっている）なら、その水槽の置き場所（同じ水槽に2人入れないため）。 */
  get flumeAt(): Cell | null {
    return this.flume && (this.state === "toRecov" || this.state === "recover") ? this.flume.depthAt : null;
  }

  /** 回復設備を使い終わったか（演出の完了判定に使う）。 */
  get recovering(): boolean {
    return this.state === "toRecov" || this.state === "recover";
  }

  /** 回復が終わったので帰す（Scene が帰り道を渡す）。 */
  get finishedRecovery(): boolean {
    return this.state === "recover" && this.recoverHold <= 0;
  }

  update(dt: number, t: number): void {
    if (this.state === "done") return;
    if (this.shiftT > 0) this.shiftT -= dt;

    if (this.wait > 0) {
      this.wait -= dt;
      this.syncSprite(t);
      return;
    }

    // 【生活感】道の途中で立ち止まって一息（歩いている状態のときだけ）
    if (this.pauseHold > 0) {
      this.pauseHold -= dt;
      this.syncSprite(t, false);
      return;
    }

    if (this.state === "swim") {
      this.updateSwim(dt, t);
      return;
    }

    if (this.state === "train") {
      // 設備でその場トレーニング（上下の動きだけ）
      this.syncSprite(t, false);
      return;
    }

    if (this.state === "recover") {
      // 回復設備を使用中。使い終わったら Scene が leave() を呼ぶ。
      this.recoverHold -= dt;
      this.syncSprite(t, false);
      return;
    }

    // in / toRecov / out：ウェイポイント追従
    const target = this.path[this.pi];
    if (!target) {
      this.arriveEnd();
      // 姿が変わった直後の1コマだけ、前の姿の向きが残らないようにここで反映する
      if (!this.done) this.syncSprite(t, false);
      return;
    }
    const dx = target.gx - this.gx;
    const dy = target.gy - this.gy;
    const dist = Math.hypot(dx, dy);
    const step = this.walkSpeed * dt;
    // **向きは進む前に決める。** マスに乗る瞬間（下の if 側）だけ向きを更新しないと、
    // 曲がり角で1コマぶん前の向きが残り、そこで一瞬こちらを向いたように見える。
    this.faceMoving(dx, dy);
    if (dist <= step || dist < 0.001) {
      this.gx = target.gx;
      this.gy = target.gy;
      this.gait.advance(dist);
      this.onArrive(target);
      this.pi++;
      // 曲がり角でふと立ち止まる（最後のマス＝目的地では止めない）
      if (this.pi < this.path.length && Math.random() < AUTONOMY.pauseChance) {
        this.pauseHold = randSec(AUTONOMY.pauseSec);
      }
    } else {
      this.gx += (dx / dist) * step;
      this.gy += (dy / dist) * step;
      this.gait.advance(step);
    }
    this.syncSprite(t, true);
  }

  /**
   * 進行方向を向く。
   *
   * 等角では「画面X ∝ gx-gy」「画面Y ∝ gx+gy」なので、
   *   左右 … gx-gy の符号で進行方向が決まる
   *   前後 … gx+gy が減る（画面の上へ進む）なら**背中を見せる**
   * の2つで四方向ぶんの向きになる。歩き回る人が全員こちらを向いたまま、を防ぐ。
   *
   * 実際に絵を反転するかは**素材がどちらを向いて描かれているか**次第なので、
   * ここでは向きだけ覚えて、反転は gfx/charFacing.ts の表に任せる
   *（左向きに描かれた絵を右向き扱いで反転すると、うしろ歩きになる）。
   */
  private faceMoving(dx: number, dy: number): void {
    const sdx = dx - dy; // isoの画面X符号
    this.moveSdx = Math.abs(sdx) < 0.001 ? 0 : sdx < 0 ? -1 : 1;
    this.moveSdy = Math.abs(dx + dy) < 0.001 ? 0 : dx + dy < 0 ? -1 : 1;
    if (Math.abs(sdx) > 0.001) this.faceDir = sdx < 0 ? -1 : 1;
    if (this.mode !== "walk" && this.mode !== "walkBack") return;
    const away = dx + dy < -0.001; // 画面の上（奥）へ向かっている
    this.setMode(away ? "walkBack" : "walk");
  }

  destroy(): void {
    this.sprite.destroy();
    this.state = "done";
  }

  // ---------------------------------------------------------------- 内部

  private onArrive(wp: Waypoint): void {
    if (wp.change === "suit") this.setMode("suit");
    else if (wp.change === "street") this.setMode("walk");
  }

  private arriveEnd(): void {
    if (this.state === "toRecov") {
      // 回復設備に到着 → その場で使う。温浴施設なら水着のまま浸かる／座る。
      this.state = "recover";
      if (this.flume) {
        // 流水プールに入った：その場で泳ぐ姿になる
        this.setMode(this.waterMode());
        return;
      }
      this.setMode(this.pose && this.poseWear === "suit" ? "suit" : "walk");
      return;
    }
    if (this.state === "in") {
      if (this.station) {
        // 設備に到着 → その場でトレーニング（筋トレルーム・スタジオ）
        this.state = "train";
        this.setMode("train");
        return;
      }
      if (this.lane) {
        this.swamOnce = true;
        // 飛び込み台まで歩いてきたところ。
        // **いま立っている場所からいちばん近いレーンの端**に入る。
        // 適当な位置へ座標を書き換えると、プールサイドから水面へ人が飛ぶ。
        this.state = "swim";
        const lane = this.lane;
        // 回したプールは gy の向きに泳ぐ（→ SwimLane.axis）
        const here = lane.axis === "gx" ? this.gx : this.gy;
        const s = Math.min(lane.s1, Math.max(lane.s0, here));
        this.swimDir = s - lane.s0 <= lane.s1 - s ? 1 : -1;
        const to = lane.axis === "gx" ? { gx: s, gy: lane.at } : { gx: lane.at, gy: s };
        // プールサイド → 水面はひと息で滑り込ませる（→ updateSwim の entry）
        this.entry = { fx: this.gx, fy: this.gy, tx: to.gx, ty: to.gy, t: 0 };
        // 幼児・学童は飛び込まない（水に入るところから練習する段階）
        this.diveHold = this.body === "kid" || this.body === "child" ? 0 : DIVE_SEC;
        this.setMode(this.diveHold > 0 ? "dive" : this.waterMode());
        return;
      }
      // 泳ぐ場所も設備も無い（＝プールが使えない）ときはその場で待機
      this.state = "train";
      this.setMode("walk");
    } else if (this.state === "out") {
      this.destroy();
    }
  }

  /** いま水の中で見せる姿（泳法／幼児の基礎練習）。 */
  private waterMode(): Mode {
    return swimModeFor(this.body, this.stroke, this.student.id);
  }

  private updateSwim(dt: number, t: number): void {
    const lane = this.lane;
    if (!lane) return;
    if (this.entry) {
      // 入水中：飛び込み台の立ち位置から、水面のレーンまで沈み込む
      const e = this.entry;
      e.t += dt;
      const k = Math.min(1, e.t / ENTER_WATER_SEC);
      this.gx = e.fx + (e.tx - e.fx) * k;
      this.gy = e.fy + (e.ty - e.fy) * k;
      this.faceDir = this.laneScreenDir();
      if (this.diveHold > 0) this.diveHold -= dt;
      if (k >= 1) this.entry = null;
      this.syncSprite(t, false);
      return;
    }
    // スタートの姿はごく短く。飛び込みが終わったら泳ぎの姿に移る
    if (this.diveHold > 0) {
      this.diveHold -= dt;
      if (this.diveHold <= 0) this.setMode(this.waterMode());
    }
    // 【生活感】壁でひと息ついている間は進まない（水面で浮いたまま呼吸を整える）
    if (this.wallRest > 0) {
      this.wallRest -= dt;
      this.syncSprite(t, false);
      return;
    }
    // 回したプールは gy の向きに泳ぐ（→ SwimLane.axis）
    let s = (lane.axis === "gx" ? this.gx : this.gy) + this.swimDir * this.swimSpeed * dt;
    if (s <= lane.s0) {
      s = lane.s0;
      this.swimDir = 1;
      if (Math.random() < AUTONOMY.wallRestChance) this.wallRest = randSec(AUTONOMY.wallRestSec);
    } else if (s >= lane.s1) {
      s = lane.s1;
      this.swimDir = -1;
      if (Math.random() < AUTONOMY.wallRestChance) this.wallRest = randSec(AUTONOMY.wallRestSec);
    }
    if (lane.axis === "gx") this.gx = s;
    else this.gy = s;
    this.faceDir = this.laneScreenDir();
    this.moveSdx = this.faceDir;
    this.moveSdy = this.swimDir;
    this.syncSprite(t, false);
  }

  /**
   * レーンを進む向きの、画面の左右（1＝右／-1＝左）。
   * gx が増えると画面の右下へ、gy が増えると左下へ進むので、回したプールでは左右が逆になる。
   */
  private laneScreenDir(): 1 | -1 {
    return this.lane?.axis === "gy" ? (this.swimDir === 1 ? -1 : 1) : this.swimDir;
  }

  /** 【調査用】いまの向きの内訳（→ dev/devProbe.ts）。 */
  debugFacing(): ProbeRow {
    return {
      kind: "student",
      who: this.typeId,
      mode: this.mode,
      sdx: this.moveSdx,
      sdy: this.moveSdy,
      flip: this.sprite.flipX,
      art: charFacing(this.typeId, this.mode),
    };
  }

  /**
   * その姿のテクスチャキー。
   * 描き起こしたPNG素材が入っていればそちらを、無ければコード生成のドット絵を使う
   *（→ gfx/charAssets.ts）。呼び出し側はどちらかを気にしなくてよい。
   */
  private textureFor(mode: Mode): string {
    return charTexture(mode, this.body, this.variant, this.typeId);
  }

  /**
   * その姿の原点（＝画面上のどこを基準に置くか）。
   * 「立ち姿＝足元」「水の中＝水面」の2種類だけ。
   * 「潜る・浮上」の素材は水の中の絵なので、素材があるときだけ泳ぎと同じ原点になる。
   */
  private originOf(mode: Mode): { x: number; y: number } {
    if (isWaterMode(mode) || charAssetIsWater(mode, this.typeId)) return SWIM_ORIGIN;
    return mode === "suit" || mode === "dive" ? SUIT_ORIGIN : WALK_ORIGIN;
  }

  /**
   * 姿を切り替える。
   * 原点は「立ち姿＝足元」「水の中＝水面」の2種類だけなので、
   * 姿が増えてもここで振り分ければ位置が飛ばない。
   */
  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    const key = this.textureFor(mode);
    // 素材が1枚も無い姿は、いちばん近い姿で代用する（差し替え途中でも欠けない）
    if (!this.sprite.scene.textures.exists(key)) return;
    // 原点が変わるぶんは、あとで少しずつ戻す（縦に跳ねさせない → shift）
    const from = this.originOf(this.mode).y;
    this.mode = mode;
    const origin = this.originOf(mode);
    if (Math.abs(origin.y - from) > 0.001) {
      this.shift = origin.y - from;
      this.shiftT = ENTER_WATER_SEC;
    }
    this.sprite.setOrigin(origin.x, origin.y);
    // 絵の差し替え・倍率・アニメーションはまとめてここで（→ gfx/charAssets）
    applyCharSprite(this.sprite, mode, this.body, this.variant, this.typeId);
    this.baseScale = this.sprite.scaleX;
  }

  /**
   * 歩き・泳ぎのコマ送りと、絵の反転。
   *
   * コマ送りは**時間ではなく歩いた距離**で進める（→ iso/walkCycle.ts）。
   * 時間で回すと、立ち止まった人がその場で足踏みし、速く動く人は滑って見える。
   * 泳ぎは止まらないので、水の中の姿だけは今までどおり時間で回す。
   */
  private stepAnim(): void {
    stepAnimOf(this.sprite, this.gait, this.mode, this.typeId, this.faceDir);
  }

  /**
   * グリッド座標→ワールド座標へ反映（上下の揺れ・水面の沈み込み・待ちの仕草）。
   *
   * 揺れは全部 sin ひとつぶんの計算なので、人数が増えても実質ただの足し算。
   * 「立っているだけの人」が完全に止まっていると人形が並んでいるように見えるので、
   * 待っている間も呼吸ぶんだけ小さく上下させ、ときどき体を左右に傾ける。
   */
  private syncSprite(t: number, walking = false): void {
    const p = isoToWorld(this.gx, this.gy);
    if (this.state === "recover" && this.flume) {
      // 流水プールで泳いでいる：水面の高さに浮かせ、水の揺れで少し上下させる
      this.stepAnim();
      this.sprite.setPosition(p.x, p.y - this.flume.lift + Math.sin(t * 4 + this.bobPhase) * 1.2);
      this.sprite.setRotation(0);
      this.sprite.setScale(this.baseScale);
      this.sprite.setDepth(depthFor(this.flume.depthAt.gx, this.flume.depthAt.gy, 60));
      return;
    }
    if (this.state === "recover" && this.pose) {
      // 温浴施設を使用中：湯に浸かる／ベンチに座る／チェアでくつろぐ
      const r = applyPose(this.sprite, this.pose, t, this.bobPhase, this.poseMirror);
      this.sprite.setPosition(p.x + r.ox, p.y + r.oy);
      this.sprite.setRotation(r.rot);
      this.sprite.setScale(this.baseScale);
      // 浸かっている人は湯面より手前に出す（湯の絵に埋もれないように）
      this.sprite.setDepth(depthFor(this.gx, this.gy, 50));
      return;
    }
    this.stepAnim();
    // 「動いていないときの姿」＝水の中なら水面の揺れ、陸なら呼吸ぶんの上下。
    // 歩きのモーションはこれに少しずつ混ぜる（足を上げた姿勢のまま急に止まらない）。
    const rest = isWaterMode(this.mode)
      ? { oy: Math.sin(t * 4 + this.bobPhase) * 1.4, rot: Math.sin(t * 2 + this.bobPhase) * 0.05 }
      : idlePose(t, this.bobPhase);
    this.gaitAmp += ((walking ? 1 : 0) - this.gaitAmp) * GAIT_BLEND;
    const a = this.gaitAmp;
    const g = this.gait.pose(this.sprite.displayHeight);
    let oy = g.oy * a + rest.oy * (1 - a);
    const tilt = g.rot * a + rest.rot * (1 - a);
    const sx = 1 + (g.sx - 1) * a;
    const sy = 1 + (g.sy - 1) * a;
    if (this.shiftT > 0) {
      // 姿を替えた直後。原点のずれぶんを少しずつ0へ戻す
      //（水に沈む／水から上がる動きは、この戻しがそのまま絵になる）
      oy += (this.shiftT / ENTER_WATER_SEC) * this.shift * this.sprite.displayHeight;
    }
    this.sprite.setPosition(p.x, p.y + oy);
    this.sprite.setRotation(tilt);
    this.sprite.setScale(this.baseScale * sx, this.baseScale * sy);
    this.sprite.setDepth(depthFor(this.gx, this.gy, 50));
  }

  /** 選択リング用のワールド座標。 */
  worldPos(): { x: number; y: number; depth: number; top: number } {
    return { x: this.sprite.x, y: this.sprite.y, depth: this.sprite.depth + 1, top: spriteTopOf(this.sprite) };
  }

  /** 今いるグリッド位置（自動ドアの反応判定などに使う）。 */
  gridPos(): { gx: number; gy: number } {
    return { gx: this.gx, gy: this.gy };
  }

  /**
   * いま**向かっている先**（経路の終点）。まだ歩いている途中でも分かる。
   *
   * 【席取りに要る】席が空いているかを「いま誰かが立っているか」だけで決めると、
   * **同じ席へ歩いている途中の人**が数えられず、2人が同じ椅子に着いて重なる。
   * 席を配るときは、ここも「埋まっている」として見ること（→ FacilityScene.freeDiningSeat）。
   */
  get destCell(): Cell | null {
    const last = this.path[this.path.length - 1];
    return last ? { gx: last.gx, gy: last.gy } : null;
  }

  /** 設備で練習している立ち位置（null＝プールで泳いでいる）。並べ直しの席取りに使う。 */
  get stationCell(): Cell | null {
    return this.station;
  }

  /** 湯に浸かっているなら、その湯面の位置（波紋を描くのに使う）。 */
  get soakPos(): { x: number; y: number } | null {
    return this.state === "recover" && this.pose === "soak" ? waterLineOf(this.sprite) : null;
  }

  /**
   * いま何をしているか（吹き出しの内容を決めるのに使う → sim/chatter.ts）。
   *
   * 「歩いている／泳いでいる／風呂に入っている」という**行動**だけを返す。
   * きつい・満足といった気持ちの解釈は sim/chatter.ts の役目。
   */
  get activity(): ChatterActivity | null {
    if (this.state === "done") return null;
    if (this.pauseHold > 0 || this.wait > 0) return "wait";
    switch (this.state) {
      case "swim":
        // 壁でひと息ついている間は「はぁ…」（泳ぎ切ったあとの言葉）
        return this.wallRest > 0 ? "afterSwim" : "swim";
      case "train":
        return this.station ? "train" : "wait";
      case "recover":
        if (this.flume) return "swim";
        if (this.visitPurpose === "measure") return "measure";
        return this.pose === "soak" ? "bath" : this.pose ? "sauna" : "bath";
      case "toRecov":
        return this.swamOnce ? "afterSwim" : "walk";
      case "out":
        return this.swamOnce ? "afterSwim" : "walk";
      default:
        return "walk";
    }
  }

  /** 体力の残り割合（吹き出しが「きつい」側になるかの判断に使う）。 */
  get energyRatio(): number {
    return Math.max(0, Math.min(1, this.student.energy / Math.max(1, energyMax(this.student))));
  }
}

// ------------------------------------------------------------------ 一般客

/** 客ごとの通し番号。素性（名前など）を作るためだけの種で、ゲーム進行には関わらない。 */
let nextVisitorSeed = 1;

/**
 * 一般客の見た目タイプを1つ選ぶ。
 * 男女5タイプずつ（シニアを含む）から等確率で選ぶので、館内の顔ぶれが偏らない。
 */
function pickGuestVariant(): number {
  const all = [...variantsOfGender("m"), ...variantsOfGender("f")];
  return all[Math.floor(Math.random() * all.length)] ?? 0;
}

/**
 * 一般客が立ち寄る場所の種類（吹き出しの内容に使う）。
 * turnedAway＝入れずに引き返す客。
 */
export type VisitorPurpose =
  | "pool"
  | "gym"
  | "studio"
  | "bath"
  | "sauna"
  | "openair"
  | "shop"
  // 賑わいスペース（カフェ・ラウンジ・キッズ・自販機）
  | "cafe"
  | "lounge"
  | "kids"
  | "vending"
  // 観客席・プールサイドで練習を見ている（→ FacilityScene の観客）
  | "watch"
  | "turnedAway";

/**
 * 客が立ち寄る場所1つぶん。
 * 「目的の施設を使う → 売店に寄る → 帰る」のように、いくつでもつなげられる。
 */
export interface VisitorStop {
  /** そこまでの道順（直前の場所から）。 */
  route: Waypoint[];
  /** その場所で過ごす秒数。 */
  staySec: number;
  /** 過ごし方（湯に浸かる・座る・くつろぐ）。null＝立ったまま過ごす。 */
  pose?: BathPose | null;
  /** 席の什器が左右反転しているか（回した部屋）。 */
  poseMirror?: boolean;
  /** 何をしに来たか。 */
  purpose: VisitorPurpose;
  /**
   * 席が床より高いところにあるとき、そのぶん持ち上げる px（観客席のひな壇）。
   * 座る姿勢（pose）のときだけ効く。
   */
  lift?: number;
  /**
   * 重なり順を決めるマス（座っている席の什器の置き場所）。観客席では席のマスと
   * ひな壇の絵の置き場所がずれるので、これが無いと自分の列の座席の絵の裏に隠れる。
   */
  depthCell?: { gx: number; gy: number };
}

/**
 * 一般客1人ぶんの「今日の予定」。
 *
 * 受付（入口）→ 目的の施設 → （たまに売店）→ 帰る、という流れを客ごとに組み立てる。
 * **全員が同じ道を同じ長さで辿らない**ことが、画面全体がバラバラに賑わって
 * 見えることに直結する（→ FacilityScene.pollGuests）。
 */
export interface VisitorPlan {
  stops: VisitorStop[];
  /** 最後の立ち寄り先から敷地の外まで。 */
  exit: Waypoint[];
  /** 主目的の部屋（収入・混雑の集計に使う）。 */
  roomId: number;
  /** 道が繋がっておらず、使えずに帰る客か。 */
  turnedAway: boolean;
  /** 目的の部屋が混んでいたか（満足度が下がる）。 */
  crowded: boolean;
  /** 目的の部屋のグレード（1=小 2=中 3=大）。良い設備ほど満足する。 */
  grade: number;
  /**
   * 見物客（観客席・プールサイドで見ているだけの人）。見た目だけの人なので、
   * 満足度・口コミ・収入（sim）には一切数えない。席に**ふっと現れて、ふっと消える**
   *（観客席へは水面を渡らないと歩いて行けないため、歩かせない）。
   */
  spectator?: boolean;
  /** 歩いて出入りせず、その場にふっと現れて消える（観客席の見物客）。 */
  appearInPlace?: boolean;
}

/**
 * 一般客（ビジター）。
 *
 * 予定（VisitorPlan）に沿って、入口から道を辿って立ち寄り先を回り、最後に帰る。
 * 歩いて行けない部屋を目指した客は、入口の前で立ち止まってから帰る
 * （プレイヤーに「行けていない」ことが見える）。
 */
export class Visitor {
  readonly sprite: Phaser.GameObjects.Sprite;
  private gx: number;
  private gy: number;
  private path: Waypoint[];
  private pi = 1;
  private hold: number;
  private state: "in" | "stay" | "out" | "done" = "in";
  private readonly bobPhase = Math.random() * Math.PI * 2;
  /** 客ごとの通し番号（素性を作る種。見た目だけに使う）。 */
  readonly seed = nextVisitorSeed++;
  /**
   * 見た目のタイプ（カードにも同じ顔を出す）。
   * 一般客は**男女10タイプから毎回ランダム**に選ぶ。シニアも同じ確率で混ざるので、
   * 街の人らしくいろいろな年格好が並ぶ。
   */
  readonly variant = pickGuestVariant();
  /** 見た目タイプのID（外部素材の差し替えに使う）。 */
  private readonly typeId = charTypeOf("guest", this.variant).id;
  /** いまの姿。**プール／温浴に着いたら水着**になる（歩いている間はずっと私服）。 */
  private mode: Mode = "walk";
  /** 歩きのモーション（→ iso/walkCycle.ts）。 */
  private readonly gait = new WalkCycle();
  /** 進行方向（画面X。1＝右／-1＝左）。 */
  private faceDir: 1 | -1 = 1;
  /** いまの立ち寄り先の席が左右反転しているか（→ VisitorStop.poseMirror）。 */
  private poseMirror = false;
  /** 直前に動いた向き（調査用 → dev/devProbe.ts）。 */
  private moveSdx = 0;
  private moveSdy = 0;
  /** いまの姿の素の表示倍率（歩きのつぶれを掛ける前）。 */
  private baseScale = 1;
  /** 歩きのモーションの効き具合（→ Person.gaitAmp）。 */
  private gaitAmp = 0;
  /** この人の歩く速さ（1人ずつ少し違う）。 */
  private readonly walkSpeed = jitterSpeed(WALK_SPEED * 0.9);
  /** 道の途中で立ち止まっている残り秒数。 */
  private pauseHold = 0;

  /** 今日の予定（立ち寄り先の並び）と、いま何番目か。 */
  private stops: VisitorStop[];
  private si = 0;
  private pose: BathPose | null;
  /** 帰り道（最後の立ち寄り先から敷地の外へ）。 */
  private exitRoute: Waypoint[];
  /**
   * 【行列に並んでいる】満員の部屋の扉の前で順番待ちをしている（→ FacilityScene の行列）。
   * 並んでいるあいだは立ったまま動かず、admit で部屋へ入るか、giveUp で怒って帰る。
   */
  private inLine = false;
  /** 並んだ客の番号（sim の行列と結びつける）。行列に並ばなかった客は undefined。 */
  queueId?: number;

  /** 主目的の部屋（収入の集計に使う）。 */
  readonly roomId: number;
  /** 道が繋がっておらず、使えずに帰る客か（行列で待ちくたびれて帰る客もここが true になる）。 */
  turnedAway: boolean;
  /** 目的の部屋が混んでいたか。 */
  readonly crowded: boolean;
  /** 目的の部屋のグレード。 */
  readonly grade: number;
  /** 見物客か（→ VisitorPlan.spectator）。 */
  readonly spectator: boolean;
  /** その場にふっと現れて消えるか（→ VisitorPlan.appearInPlace）。 */
  private readonly appearInPlace: boolean;
  /** 観客席のひな壇の高さぶん持ち上げる px（いまの立ち寄り先の）。 */
  private lift = 0;
  /** 重なり順を決めるマス（→ VisitorStop.depthCell）。 */
  private depthCell: { gx: number; gy: number } | null = null;
  /**
   * この来場ぶんの満足度 0-100。
   * 抽選は sim 側（GameState.noteGuestSatisfied）で済ませ、
   * ここは★ゲージを出すために結果を持っておくだけ。
   */
  satisfaction = 0;
  /** 満足して帰るときに出す貢献値（画面の `+9`）。0 なら何も出さない。 */
  contribution = 0;

  constructor(
    scene: Phaser.Scene,
    world: Phaser.GameObjects.Container,
    plan: VisitorPlan,
    /** タップされたとき（この客の簡単な情報を出す）。 */
    onTap?: (v: Visitor) => void,
  ) {
    this.stops =
      plan.stops.length > 0 ? plan.stops : [{ route: [{ gx: 0, gy: 0 }], staySec: 1, purpose: "pool" }];
    this.exitRoute = plan.exit;
    this.roomId = plan.roomId;
    this.turnedAway = plan.turnedAway;
    this.crowded = plan.crowded;
    this.grade = plan.grade;
    this.spectator = plan.spectator === true;
    this.appearInPlace = plan.appearInPlace === true;

    const first = this.stops[0];
    this.lift = first.lift ?? 0;
    this.depthCell = first.depthCell ?? null;
    this.path = first.route.length > 0 ? first.route : [{ gx: 0, gy: 0 }];
    this.hold = first.staySec;
    this.pose = first.pose ?? null;
    this.poseMirror = first.poseMirror === true;
    const start = this.path[0];
    this.gx = start.gx;
    this.gy = start.gy;
    // 一般客は「大人・上着・手さげカバン」の専用グラフィック（生徒と見間違えないように）
    this.sprite = scene.add
      .sprite(0, 0, charTexture("walk", "guest", this.variant, this.typeId))
      .setOrigin(WALK_ORIGIN.x, WALK_ORIGIN.y)
      .setAlpha(0.95);
    applyCharSprite(this.sprite, "walk", "guest", this.variant, this.typeId);
    this.baseScale = this.sprite.scaleX;
    if (this.turnedAway) this.sprite.setTint(0xffb3a7); // 困っている客は色で分かるように
    if (onTap) {
      // 生徒と同じで、指を離したときに開く（施設をドラッグしても誤って開かない）
      this.sprite.setInteractive({ useHandCursor: true });
      this.sprite.on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        onTap(this);
      });
    }
    world.add(this.sprite);
    this.sync(0);
  }

  get done(): boolean {
    return this.state === "done";
  }

  /** 帰り始めたか（収入の計上を1回だけにするため Scene が見る）。 */
  get leaving(): boolean {
    return this.state === "out" || this.state === "done";
  }

  /** 売店・食堂にも寄る予定か（満足度の計算に使う）。 */
  get hasExtraStop(): boolean {
    return this.stops.some((s) => s.purpose === "shop");
  }

  /** ゆっくりできる場所（風呂・サウナ・外気浴）が目的だったか。 */
  get relaxing(): boolean {
    const p = this.stops[0]?.purpose;
    return p === "bath" || p === "sauna" || p === "openair";
  }

  /** 満足して帰り始めた瞬間か（**1回だけ true を返す**）。演出はここを見て出す。 */
  private satisfied = false;

  takeSatisfied(): boolean {
    if (!this.satisfied) return false;
    this.satisfied = false;
    return true;
  }

  /**
   * 予定を全部こなして**帰り始めた瞬間**か（1回だけ true を返す）。
   * 貢献値（`+9`）はここで出す＝「満足して帰っていく客」と結びつく。
   */
  private departed = false;

  takeDeparted(): boolean {
    if (!this.departed) return false;
    this.departed = false;
    return true;
  }

  /** いまのワールド座標（演出をこの人の頭の上に出すのに使う）。 */
  worldPos(): { x: number; y: number; top: number } {
    return { x: this.sprite.x, y: this.sprite.y, top: spriteTopOf(this.sprite) };
  }

  /**
   * いま何をしているか（吹き出しの内容 → sim/chatter.ts）。
   * 「入館 → 施設 → 売店 → 満足して帰る」の各段階がそのまま言葉になる。
   */
  get activity(): ChatterActivity | null {
    if (this.state === "done") return null;
    if (this.turnedAway) return "wait";
    if (this.inLine) return "wait";
    if (this.pauseHold > 0) return "wait";
    if (this.state === "out") return "leave";
    if (this.state === "stay") {
      switch (this.stops[this.si]?.purpose) {
        case "shop":
          return "meal";
        case "bath":
          return "bath";
        case "sauna":
        case "openair":
          return "sauna";
        case "pool":
          return "afterSwim";
        case "gym":
        case "studio":
          return "train";
        case "watch":
          return "watch";
        default:
          return "wait";
      }
    }
    // 入館してすぐ（最初の立ち寄り先へ向かい始めたところ）は「きた〜！」
    return this.si === 0 && this.pi <= 2 ? "arrive" : "walk";
  }

  update(dt: number, t: number): void {
    if (this.state === "done") return;
    if (this.appearInPlace) {
      // 観客席の見物客は席にふっと現れて、帰るときはふっと消える（歩いて出入りしない）
      if (this.state === "out") {
        this.sprite.setAlpha(Math.max(0, this.sprite.alpha - dt * 1.6));
        if (this.sprite.alpha <= 0.01) {
          this.destroy();
          return;
        }
        this.sync(t, false);
        return;
      }
      if (this.sprite.alpha < 0.95) this.sprite.setAlpha(Math.min(0.95, this.sprite.alpha + dt * 1.6));
    }
    if (this.pauseHold > 0) {
      this.pauseHold -= dt;
      this.sync(t, false);
      return;
    }
    if (this.state === "stay") {
      this.hold -= dt;
      if (this.hold <= 0) this.leaveStop();
      this.sync(t, false);
      return;
    }
    const target = this.path[this.pi];
    if (!target) {
      if (this.state !== "in") {
        // 敷地の外まで帰り着いた。消したスプライトには触らない
        this.destroy();
        return;
      }
      this.state = "stay";
      // 部屋に着いて**使い始めた**ところ。満足の演出はここで出す
      //（帰りぎわだと、施設を使っている絵と結びつかない）。
      // 2か所目（売店）では出さない＝1人の客につき1回だけ。
      if (!this.turnedAway && !this.inLine && !this.spectator && this.si === 0) this.satisfied = true;
      this.sync(t, false);
      return;
    }
    const dx = target.gx - this.gx;
    const dy = target.gy - this.gy;
    const dist = Math.hypot(dx, dy);
    const step = this.walkSpeed * dt;
    this.faceMoving(dx, dy); // 向きは進む前に決める（→ Person.update と同じ理由）
    if (dist <= step || dist < 0.001) {
      this.gx = target.gx;
      this.gy = target.gy;
      this.gait.advance(dist);
      // 目的地に着いたら着替える（私服のままプールに入らないための唯一の切り替え点）
      if (target.change === "suit") this.setMode("suit");
      else if (target.change === "street") this.setMode("walk");
      this.pi++;
      // 【生活感】館内で足を止めて周りを見る（目的地の手前では止めない）
      if (this.pi < this.path.length && Math.random() < AUTONOMY.pauseChance) {
        this.pauseHold = randSec(AUTONOMY.pauseSec);
      }
    } else {
      this.gx += (dx / dist) * step;
      this.gy += (dy / dist) * step;
      this.gait.advance(step);
    }
    this.sync(t, true);
  }

  /**
   * ひとつの立ち寄り先を終えた。
   * 次の予定があればそこへ歩き出し、無ければ帰り道に入る。
   */
  private leaveStop(): void {
    this.sprite.setCrop(); // 湯から上がる（切り取りを解除して立ち姿に戻す）
    this.sprite.setRotation(0);
    this.pose = null;
    const next = this.stops[this.si + 1];
    if (next) {
      this.si += 1;
      this.path = [{ gx: this.gx, gy: this.gy }, ...next.route.slice(1)];
      this.pi = 1;
      this.hold = next.staySec;
      this.pose = next.pose ?? null;
      this.poseMirror = next.poseMirror === true;
      this.state = "in";
      return;
    }
    this.path = [{ gx: this.gx, gy: this.gy }, ...this.exitRoute.slice(1)];
    this.pi = 1;
    this.state = "out";
    if (!this.turnedAway && !this.spectator) this.departed = true;
  }

  /** 行列に並んでいるか。 */
  get waitingInLine(): boolean {
    return this.inLine;
  }

  /**
   * 行列に並ぶ（または、前が進んだので詰める）。spot まで歩いて、そこで立って待つ。
   * 待ち時間は画面では決めない（sim が admit / giveUp を知らせてくる）。
   */
  lineUpAt(points: Waypoint[]): void {
    if (this.state === "done" || this.state === "out" || points.length === 0) return;
    this.inLine = true;
    this.hold = Number.POSITIVE_INFINITY;
    this.pose = null;
    if (this.state === "in" && this.pi < this.path.length) {
      // まだ歩いている途中：いまの行き先の先へ道をつなぐ（壁を斜めに突っ切らない）
      this.path.push(...points.map((c) => ({ gx: c.gx, gy: c.gy })));
      return;
    }
    this.path = [{ gx: this.gx, gy: this.gy }, ...points.map((c) => ({ gx: c.gx, gy: c.gy }))];
    this.pi = 1;
    this.state = "in";
  }

  /** 順番が来た。行列から部屋へ入り、そのあとは普通の客と同じ予定で過ごす。 */
  admit(stops: VisitorStop[], exit: Waypoint[]): void {
    if (this.state === "done" || stops.length === 0) return;
    this.inLine = false;
    this.stops = stops;
    this.exitRoute = exit;
    this.si = 0;
    const first = stops[0];
    this.path = [{ gx: this.gx, gy: this.gy }, ...first.route.slice(1)];
    this.pi = 1;
    this.hold = first.staySec;
    this.pose = first.pose ?? null;
    this.poseMirror = first.poseMirror === true;
    this.pauseHold = 0;
    this.state = "in";
  }

  /** 待ちくたびれた（または部屋が閉まった）。怒って帰る。 */
  giveUp(exit: Waypoint[]): void {
    if (this.state === "done") return;
    this.inLine = false;
    this.turnedAway = true;
    this.sprite.setTint(0xffb3a7);
    this.setMode("walk");
    this.path = [{ gx: this.gx, gy: this.gy }, ...exit.slice(1)];
    this.pi = 1;
    this.pauseHold = 0;
    this.state = "out";
  }

  /**
   * 姿を切り替える（私服 ⇄ 水着、手前向き ⇄ 背中）。
   * 原点は「立ち姿＝足元」だけなので、水着でも高さは変わらない。
   */
  private setMode(mode: Mode): void {
    if (this.mode === mode) return;
    const key = charTexture(mode, "guest", this.variant, this.typeId);
    if (!this.sprite.scene.textures.exists(key)) return; // その姿の絵が無いときは今のまま
    this.mode = mode;
    this.sprite.setOrigin(WALK_ORIGIN.x, WALK_ORIGIN.y);
    applyCharSprite(this.sprite, mode, "guest", this.variant, this.typeId);
    this.baseScale = this.sprite.scaleX;
  }

  /** 進行方向を向く（→ Person.faceMoving と同じ決め方）。 */
  private faceMoving(dx: number, dy: number): void {
    const sdx = dx - dy; // isoの画面X符号
    this.moveSdx = Math.abs(sdx) < 0.001 ? 0 : sdx < 0 ? -1 : 1;
    this.moveSdy = Math.abs(dx + dy) < 0.001 ? 0 : dx + dy < 0 ? -1 : 1;
    if (Math.abs(sdx) > 0.001) this.faceDir = sdx < 0 ? -1 : 1;
    // 奥へ歩くときは背中を見せる。
    // 水着に着替えたあとは着替えの姿のまま歩く（ここで私服に戻さない）。
    if (this.mode !== "walk" && this.mode !== "walkBack") return;
    this.setMode(dx + dy < -0.001 ? "walkBack" : "walk");
  }

  destroy(): void {
    this.sprite.destroy();
    this.state = "done";
  }

  /** 【調査用】いまの向きの内訳（→ dev/devProbe.ts）。 */
  debugFacing(): ProbeRow {
    return {
      kind: "guest",
      who: this.typeId,
      mode: this.mode,
      sdx: this.moveSdx,
      sdy: this.moveSdy,
      flip: this.sprite.flipX,
      art: charFacing(this.typeId, this.mode),
    };
  }

  gridPos(): { gx: number; gy: number } {
    return { gx: this.gx, gy: this.gy };
  }

  /**
   * いま向かっている先（今の立ち寄り先の終点）。まだ歩いている途中でも分かる。
   * 席取りで「同じ席へ歩いている人」を数えるのに使う（→ Person.destCell）。
   */
  get destCell(): Cell | null {
    const last = this.path[this.path.length - 1];
    return last ? { gx: last.gx, gy: last.gy } : null;
  }

  /** 湯に浸かっているなら、その湯面の位置（波紋を描くのに使う）。 */
  get soakPos(): { x: number; y: number } | null {
    return this.state === "stay" && this.pose === "soak" ? waterLineOf(this.sprite) : null;
  }

  private sync(t: number, walking = false): void {
    const p = isoToWorld(this.gx, this.gy);
    if (this.state === "stay" && this.pose) {
      // 温浴施設で過ごしている客（湯に浸かる・ベンチに座る・チェアでくつろぐ）
      const r = applyPose(this.sprite, this.pose, t, this.bobPhase, this.poseMirror);
      this.sprite.setPosition(p.x + r.ox, p.y + r.oy - this.lift);
      this.sprite.setRotation(r.rot);
      this.sprite.setScale(this.baseScale);
      const dc = this.depthCell;
      this.sprite.setDepth(dc ? depthFor(dc.gx, dc.gy, 30) : depthFor(this.gx, this.gy, 48));
      return;
    }
    stepAnimOf(this.sprite, this.gait, this.mode, this.typeId, this.faceDir);
    this.gaitAmp += ((walking ? 1 : 0) - this.gaitAmp) * GAIT_BLEND;
    const w = this.gait.pose(this.sprite.displayHeight);
    const idle = idlePose(t, this.bobPhase);
    const a = this.gaitAmp;
    this.sprite.setPosition(p.x, p.y + w.oy * a + idle.oy * (1 - a));
    this.sprite.setRotation(w.rot * a + idle.rot * (1 - a));
    this.sprite.setScale(this.baseScale * (1 + (w.sx - 1) * a), this.baseScale * (1 + (w.sy - 1) * a));
    this.sprite.setDepth(depthFor(this.gx, this.gy, 48));
  }
}
