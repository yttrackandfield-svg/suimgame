import type Phaser from "phaser";
import { depthFor, isoToWorld, LAYER } from "./projection";
import type { Cell, Waypoint } from "./facility";
import type { ProbeRow } from "../dev/devProbe";
import type { ChatterActivity } from "../sim/chatter";
import { ART_STEP_LEN, GAIT_ANIMATED, idlePose, screenSteps, WalkCycle } from "./walkCycle";
import { ensureGroundShadow, GROUND_SHADOW_KEY, groundShadowScale } from "../gfx/groundShadow";
import { CHAR_SCALE, LAND_CHAR_SCALE } from "../config";
import {
  applyCoachSprite,
  coachPatternFor,
  COACH_TARGET_H,
  dir8Of,
  type CoachPattern,
  type Dir8,
} from "../gfx/coachSprites";

/**
 * 職員（コーチ・受付スタッフ・専門スタッフ）の動き。
 *
 * コーチは担当時間外は「コーチ室」にいて、自分の担当コマになると
 * そのプールのプールサイドへ出てきて指導し、終わるとコーチ室へ戻る。
 * 手の空いたコーチは、たまに館内を歩いて掃除をする。
 *
 * 道順（Waypoint[]）は Scene が経路探索で作って渡す。
 * ＝ コーチ室からプールへ道が繋がっていなければ、そもそも出動できない。
 */

/**
 * 歩く速さ。**マス/秒ではなく画面上の速さ**（TILE_W/2 px ＝ 1、つまり 2.8 ≒ 168px/秒）。
 *
 * 等角では同じ1マスでも画面上の長さが向きで倍ほど違うので、マス速度を一定にすると
 * 画面の左右へ歩くときだけ倍の速さで飛んでいき、足の運びが追いつかず滑って見える。
 * 見た目の速さを一定にすると、歩幅（ART_STEP_LEN）と歩数がどの向きでも噛み合う。
 */
const WALK_SPEED = 2.8;

export type StaffRole = "coach" | "specialist";

/** 今なにをしているか。 */
export type StaffTask =
  | "room"
  | "toPool"
  | "coaching"
  | "toRoom"
  | "cleaning"
  | "desk"
  | "toMeeting"
  | "researching"
  | "working";

/** 8方向の絵が、反転も含めてどちらを向いているか（調査用 → dev/devProbe.ts）。 */
function artDirOf(dir: Dir8, flip: boolean): "front" | "left" | "right" {
  if (dir === "up" || dir === "down") return "front";
  const right = dir.endsWith("Right") || dir === "right";
  return right !== flip ? "right" : "left";
}

export class StaffPerson {
  readonly sprite: Phaser.GameObjects.Sprite;
  /** 足元の接地影（立ち絵が床から浮いて見えないように → gfx/groundShadow.ts）。 */
  private readonly shadow: Phaser.GameObjects.Image;
  /**
   * 描き起こしたコーチの絵（8方向の歩行＋待機）。無ければコード生成のドット絵のまま。
   * **格とIDで決まる**ので、同じコーチはいつ出ても同じ見た目になる。
   */
  private readonly look: CoachPattern | null;
  private dir: Dir8 = "down";
  /** 直前のフレームで動いていたか（絵の出し分けに使う）。 */
  private moving = false;
  /** 直前に動いた向き（調査用 → dev/devProbe.ts）。 */
  private moveSdx = 0;
  private moveSdy = 0;
  /** 歩きのモーション（歩いた距離で回す → iso/walkCycle.ts）。 */
  private readonly gait: WalkCycle;
  /** 歩きのモーションの効き具合（0＝立ち止まり／1＝歩き）。 */
  private gaitAmp = 0;
  /** 素の表示倍率（歩きのつぶれを掛ける前）。**絵を差し替えるたびに拾い直す**。 */
  private baseScale = CHAR_SCALE * LAND_CHAR_SCALE * 0.88;
  private gx: number;
  private gy: number;
  private path: Waypoint[] = [];
  private pi = 0;
  private task: StaffTask;
  private hold = 0;
  private readonly bobPhase: number;
  /** 到着したときに落ち着く位置。 */
  private dest: Cell | null = null;

  constructor(
    scene: Phaser.Scene,
    world: Phaser.GameObjects.Container,
    readonly role: StaffRole,
    texture: string,
    private home: Cell,
    onTap?: () => void,
    /** コーチのときだけ渡す（格とIDで見た目が決まる）。 */
    coach?: { quality: number; id: number },
  ) {
    this.gx = home.gx;
    this.gy = home.gy;
    this.task = role === "specialist" ? "working" : "room";
    this.bobPhase = Math.random() * Math.PI * 2;

    this.look = role === "coach" && coach ? coachPatternFor(coach.quality, coach.id) : null;
    // 足が描いてある絵は、絵の歩幅に合わせて歩数を刻む（→ ART_STEP_LEN）
    this.gait = new WalkCycle(Math.random(), this.look ? ART_STEP_LEN : undefined);
    this.sprite = scene.add.sprite(0, 0, texture).setOrigin(0.5, 1).setScale(CHAR_SCALE * LAND_CHAR_SCALE * 0.88);
    if (this.look) applyCoachSprite(this.sprite, this.look, this.dir, false, COACH_TARGET_H);
    // 【必ず絵に合わせ直す】描き起こしの絵はドット絵と解像度が違うので、倍率も違う。
    // ここで拾い直さないと、毎フレームの sync() がドット絵用の倍率
    //（CHAR_SCALE×0.88）を掛け続け、**歩き出すまでコーチが4倍の大きさで立つ**。
    this.baseScale = this.sprite.scaleX;
    // 影は本人より奥（同じマスの1つ下の層）に敷く
    ensureGroundShadow(scene);
    const sh = groundShadowScale(COACH_TARGET_H);
    this.shadow = scene.add.image(0, 0, GROUND_SHADOW_KEY).setOrigin(0.5, 0.5).setScale(sh.x, sh.y);
    world.add(this.shadow);
    if (onTap) {
      this.sprite.setInteractive({ useHandCursor: true });
      this.sprite.on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        onTap();
      });
    }
    world.add(this.sprite);
    this.sync(0);
  }

  destroy(): void {
    this.shadow.destroy();
    this.sprite.destroy();
  }

  get currentTask(): StaffTask {
    return this.task;
  }

  /** 待機場所を変える（コーチ室の席が変わったときなど）。 */
  setHome(cell: Cell): void {
    this.home = cell;
  }

  get homeCell(): Cell {
    return this.home;
  }

  /**
   * 道順に沿って移動を始める。
   *  goingTask … 移動中の状態（"toPool" など）
   *  dest      … 到着したときに落ち着く位置
   */
  goTo(route: Waypoint[], goingTask: StaffTask, dest: Cell): void {
    this.path = route.length > 0 ? [{ gx: this.gx, gy: this.gy }, ...route.slice(1)] : [{ ...dest }];
    this.pi = 1;
    this.task = goingTask;
    this.dest = dest;
  }

  /** 担当コマになった：コーチ室から出てプールサイドへ。 */
  goCoaching(route: Waypoint[], stand: Cell): void {
    // すでに「その場所」へ向かっている／立っているときだけ何もしない。
    // 担当が別のプールに変わったら歩き直す（ここを task だけで判定すると、
    // 前のコマのプールに立ったまま動かなくなる）。
    if ((this.task === "coaching" || this.task === "toPool") && this.isHeadingTo(stand)) return;
    this.goTo(route, "toPool", stand);
  }

  /** いま向かっている（または立っている）場所か。 */
  private isHeadingTo(cell: Cell): boolean {
    return !!this.dest && Math.abs(this.dest.gx - cell.gx) < 0.01 && Math.abs(this.dest.gy - cell.gy) < 0.01;
  }

  /** 練習が終わった：コーチ室へ戻る。 */
  goHome(route: Waypoint[]): void {
    if (this.task === "room" || this.task === "toRoom") return;
    this.goTo(route, "toRoom", this.home);
  }

  /** 研究に割り当てられたコーチ：会議室へ行き、席について研究する。 */
  goResearch(route: Waypoint[], seat: Cell): void {
    if (this.task === "researching" || this.task === "toMeeting" || this.task === "coaching") return;
    this.goTo(route, "toMeeting", seat);
  }

  /** たまに館内を掃除して回る（常時ではない）。 */
  goCleaning(route: Waypoint[], target: Cell): void {
    if (this.task !== "room") return;
    this.goTo(route, "cleaning", target);
    this.hold = 2.5 + Math.random() * 3;
  }

  update(dt: number, t: number): void {
    switch (this.task) {
      case "desk":
      case "working":
      case "researching":
        this.setMoving(false);
        this.sync(t, true);
        return;
      case "room":
      case "coaching":
        this.setMoving(false);
        this.sync(t);
        return;
      case "cleaning":
        if (this.pi >= this.path.length) {
          // 掃除中：その場でしばらく手を動かしてから、Scene が goHome を呼ぶ
          this.hold -= dt;
          this.setMoving(false);
          this.sync(t, true);
          return;
        }
        break;
      default:
        break;
    }

    const target = this.path[this.pi];
    if (!target) {
      // 着いたら足を止める。これを忘れると**歩きのコマで止まったまま**になり、
      // 掃除中のコーチが板のように固まって見える。
      this.arrive();
      this.setMoving(false);
      this.sync(t, this.task === "cleaning");
      return;
    }
    const dx = target.gx - this.gx;
    const dy = target.gy - this.gy;
    const dist = Math.hypot(dx, dy);
    // その向きの「1マス＝画面何ぶん」で割って、画面上の速さを一定にする（→ WALK_SPEED）
    const step = (WALK_SPEED * dt) / (dist > 0 ? screenSteps(dx / dist, dy / dist) : 1);
    if (dist <= step || dist < 0.001) {
      this.gx = target.gx;
      this.gy = target.gy;
      // 歩数は「画面で進んだ距離」で刻む（等角では向きで1マスの見た目の長さが倍違う）
      this.gait.advance(screenSteps(dx, dy));
      this.pi++;
      this.setMoving(true, dx, dy);
    } else {
      this.gx += (dx / dist) * step;
      this.gy += (dy / dist) * step;
      this.gait.advance(screenSteps((dx / dist) * step, (dy / dist) * step));
      this.setMoving(true, dx, dy);
      if (!this.look) {
        const sdx = dx - dy;
        if (Math.abs(sdx) > 0.001) this.sprite.setFlipX(sdx < 0);
      }
    }
    this.stepAnim();
    this.sync(t, false, true);
  }

  /**
   * 歩いている／止まっている を絵に反映する。
   * 描き起こしの素材があるときだけ、**進む向き（画面の8方向）**でコマを選ぶ。
   */
  private setMoving(moving: boolean, dx = 0, dy = 0): void {
    const sdx = dx - dy;
    this.moveSdx = !moving || Math.abs(sdx) < 0.001 ? 0 : sdx < 0 ? -1 : 1;
    this.moveSdy = !moving || Math.abs(dx + dy) < 0.001 ? 0 : dx + dy < 0 ? -1 : 1;
    if (!this.look) return;
    const dir = moving ? dir8Of(dx, dy) : this.dir;
    if (moving === this.moving && dir === this.dir) return;
    this.moving = moving;
    this.dir = dir;
    applyCoachSprite(this.sprite, this.look, dir, moving, COACH_TARGET_H);
    this.baseScale = this.sprite.scaleX;
  }

  /** 【調査用】いまの向きの内訳（→ dev/devProbe.ts）。 */
  debugFacing(): ProbeRow {
    return {
      kind: this.role,
      who: this.look ? `${this.look.id}/${this.dir}` : "dot",
      mode: this.task,
      sdx: this.moveSdx,
      sdy: this.moveSdy,
      flip: this.sprite.flipX,
      // コーチの絵は8方向ぶん用意されている。絵が向いている左右は「方向名＋反転」で決まる
      art: this.look ? artDirOf(this.dir, this.look.walk[this.dir].flip === true) : "right",
    };
  }

  /**
   * 歩きのコマ送りを**歩いた距離**に合わせる（時間で回すと滑って見える）。
   * 描き起こしの素材が無いとき（ドット絵）は何もしない。
   */
  private stepAnim(): void {
    const anims = this.sprite.anims;
    const anim = anims.currentAnim;
    if (!anim || anim.frames.length < 2) return;
    if (anims.isPlaying) anims.pause();
    const f = anim.frames[this.gait.frameOf(anim.frames.length)];
    if (f && anims.currentFrame !== f) anims.setCurrentFrame(f);
  }

  /** 【調査用】いまの状態をひと目で見る（→ dev/devProbe.ts の probe=life）。 */
  debugState(): string {
    const s = this.sprite as unknown as { alpha: number; visible: boolean; depth: number };
    return (
      `task=${this.task} at=(${this.gx.toFixed(1)},${this.gy.toFixed(1)}) ` +
      `dest=${this.dest ? `(${this.dest.gx.toFixed(1)},${this.dest.gy.toFixed(1)})` : "-"} ` +
      `wp=${this.pi}/${this.path.length} scale=${this.sprite.scaleX.toFixed(2)} ` +
      `alpha=${s.alpha} vis=${s.visible} depth=${Math.round(s.depth)} moving=${this.moving} dir=${this.dir}`
    );
  }

  /** いま向かっている（または立っている）場所。検証・デバッグ用。 */
  get destination(): Cell | null {
    return this.dest;
  }

  /** 掃除が終わったか（Scene がコーチ室へ帰す判断に使う）。 */
  get cleaningDone(): boolean {
    return this.task === "cleaning" && this.pi >= this.path.length && this.hold <= 0;
  }

  private arrive(): void {
    if (this.dest) {
      this.gx = this.dest.gx;
      this.gy = this.dest.gy;
    }
    if (this.task === "toPool") this.task = "coaching";
    else if (this.task === "toRoom") this.task = "room";
    else if (this.task === "toMeeting") this.task = "researching";
  }

  private sync(t: number, busy = false, walking = false): void {
    const p = isoToWorld(this.gx, this.gy);
    // 歩いているあいだは、生徒と同じ「歩いた距離ぶんの上下」を掛ける
    //（立ち絵が滑っているように見えないように → iso/walkCycle.ts）
    this.gaitAmp += ((walking ? 1 : 0) - this.gaitAmp) * 0.18;
    const a = this.gaitAmp;
    // 描き起こしのコーチは絵のほうで足が動くので、コード側の揺れは弱める（→ GAIT_ANIMATED）
    const g = this.gait.pose(this.sprite.displayHeight, this.look ? GAIT_ANIMATED : 1);
    // 止まっているときの姿。呼吸と体重移動を掛け続けないと板に見える（→ idlePose）。
    // そのうえで「指導中は掛け声のリズム／掃除中は手を動かす速さ」で弾ませる。
    const idle = idlePose(t, this.bobPhase);
    const beat = busy ? 7 : this.task === "coaching" ? 2.4 : 0;
    const amp = busy ? 2.2 : 2.6;
    const bounce = beat > 0 ? Math.abs(Math.sin(t * beat + this.bobPhase)) * -amp : 0;
    const rest = {
      oy: idle.oy + bounce,
      rot: idle.rot * (busy ? 0.4 : 1) + (busy ? Math.sin(t * beat + this.bobPhase) * 0.045 : 0),
      sx: idle.sx,
      sy: idle.sy,
    };
    const oy = g.oy * a + rest.oy * (1 - a);
    this.sprite.setPosition(p.x, p.y + oy);
    this.sprite.setRotation(g.rot * a + rest.rot * (1 - a));
    this.sprite.setScale(
      this.baseScale * (g.sx * a + rest.sx * (1 - a)),
      this.baseScale * (g.sy * a + rest.sy * (1 - a)),
    );
    this.sprite.setDepth(depthFor(this.gx, this.gy, LAYER.staff));
    // 影は地面に置いたまま（体だけが浮く）。浮いたぶんだけ小さく薄くする
    const lift = Math.min(1, Math.abs(oy) / 12);
    const sh = groundShadowScale(this.sprite.displayHeight);
    this.shadow.setPosition(p.x, p.y);
    this.shadow.setScale(sh.x * (1 - lift * 0.18), sh.y * (1 - lift * 0.18));
    this.shadow.setAlpha(0.85 - lift * 0.25);
    this.shadow.setDepth(depthFor(this.gx, this.gy, LAYER.staff - 1));
  }

  worldPos(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** 頭の上のワールドY（吹き出し・★ゲージを出す高さ）。 */
  topY(): number {
    return this.sprite.y - this.sprite.displayHeight * this.sprite.originY;
  }

  /**
   * いま何をしているか（吹き出しの内容 → sim/chatter.ts）。
   * 持ち場で働く人の言葉は、選手・お客さんとは別のものになる。
   */
  get activity(): ChatterActivity | null {
    switch (this.task) {
      case "coaching":
        return "coaching";
      case "cleaning":
        return "cleaning";
      case "researching":
        return "research";
      case "desk":
      case "working":
        return "deskwork";
      case "room":
        return "wait";
      default:
        return "walk";
    }
  }

  /** 今いるグリッド位置（自動ドアの反応判定などに使う）。 */
  gridPos(): { gx: number; gy: number } {
    return { gx: this.gx, gy: this.gy };
  }
}
