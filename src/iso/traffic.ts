import Phaser from "phaser";
import { TILE_W } from "../config";
import { landBounds, type ClubMap } from "../sim/clubMap";
import { CAR_TEXTURES, OUTSIDE_BANDS } from "./facility";
import { depthFor, isoToWorld, LAYER } from "./projection";

/**
 * 建物の外を動く車。
 *
 * 建物の中では人が泳いでいるのに、外の車だけ止まったままだと、
 * 外の時間が止まって見える。そこで**車は1台残らずここが動かす**。
 * 停めっぱなしの車は置かない（facility.ts の outdoorScatter は街路樹と街灯だけ）。
 *
 * 【走らせ方】車道は敷地を囲む「輪」なので、道のりに沿った距離 s だけを持たせて、
 * 毎フレーム s を進める。曲がる処理も追い越しも当たり判定も要らない。
 *   内回り（建物寄り＝OUTSIDE_BANDS.walk + 1 マス目）… 反時計回り
 *   外回り（いちばん外＝OUTSIDE_BANDS.street マス目）… 時計回り
 * この2列のあいだにセンターラインが引いてあるので、対向車としてすれ違って見える。
 *
 * 【広さの代償を作らない】台数は固定。敷地を広げると輪が長くなるだけで、
 * 毎フレーム動かす物の数は変わらない。
 */

// ------------------------------------------------------------------ 車道の輪

export interface RoadLoop {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** 横の道のり（マス）。 */
  w: number;
  /** 縦の道のり（マス）。 */
  h: number;
  /** 一周の道のり（マス）。 */
  length: number;
}

/** 敷地から ring マス外を回る輪。 */
export function roadLoop(map: ClubMap, ring: number): RoadLoop {
  const b = landBounds(map);
  const x0 = b.x0 - ring;
  const x1 = b.x1 + ring;
  const y0 = b.y0 - ring;
  const y1 = b.y1 + ring;
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, length: 2 * (x1 - x0 + (y1 - y0)) };
}

export interface RoadPoint {
  gx: number;
  gy: number;
  /** そのまま進む向き（マス／時計回り）。 */
  dx: number;
  dy: number;
}

/**
 * 輪の上を s だけ進んだ場所。
 * 北辺を東へ → 東辺を南へ → 南辺を西へ → 西辺を北へ、の順（＝時計回り）。
 */
export function pointOnLoop(loop: RoadLoop, s: number): RoadPoint {
  let t = ((s % loop.length) + loop.length) % loop.length;
  if (t < loop.w) return { gx: loop.x0 + t, gy: loop.y0, dx: 1, dy: 0 };
  t -= loop.w;
  if (t < loop.h) return { gx: loop.x1, gy: loop.y0 + t, dx: 0, dy: 1 };
  t -= loop.h;
  if (t < loop.w) return { gx: loop.x1 - t, gy: loop.y1, dx: -1, dy: 0 };
  t -= loop.w;
  return { gx: loop.x0, gy: loop.y1 - t, dx: 0, dy: -1 };
}

/** 内回りの車線。 */
const LANE_RING = OUTSIDE_BANDS.walk + 1;

// ------------------------------------------------------------------ 描画

/** 走る速さ（マス／秒）。 */
const SPEED = { road: 2.1, spread: 0.45 } as const;

interface LoopCar {
  s: number;
  speed: number;
  outerLane: boolean;
  img: Phaser.GameObjects.Image;
}

export class TrafficLayer {
  private loopCars: LoopCar[] = [];
  private inner: RoadLoop | null = null;
  private outer: RoadLoop | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: Phaser.GameObjects.Container,
  ) {}

  /**
   * 車を並べ直す。敷地を買い足すと車道の輪が外へ広がるので、
   * 建物を作り直すたびに呼ぶこと。
   */
  rebuild(map: ClubMap, roadCount: number): void {
    this.clear();
    this.inner = roadLoop(map, LANE_RING);
    this.outer = roadLoop(map, OUTSIDE_BANDS.street);

    for (let i = 0; i < roadCount; i++) {
      const img = this.makeCar(i);
      if (!img) continue;
      const outerLane = i % 2 === 1;
      const loop = outerLane ? this.outer : this.inner;
      this.loopCars.push({
        // 一周を頭数で割って置き、少しずらして数珠つなぎに見えないようにする
        s: (loop.length * i) / roadCount + (i % 3) * 1.3,
        speed: SPEED.road + ((i * 7) % 5) * (SPEED.spread / 4),
        outerLane,
        img,
      });
    }

    this.update(0);
  }

  private makeCar(i: number): Phaser.GameObjects.Image | null {
    const key = CAR_TEXTURES[i % CAR_TEXTURES.length];
    if (!this.scene.textures.exists(key)) return null;
    const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(1.1);
    this.world.add(img);
    return img;
  }

  update(dt: number): void {
    if (!this.inner || !this.outer) return;
    for (const car of this.loopCars) {
      const loop = car.outerLane ? this.outer : this.inner;
      // 内回りは反時計回り、外回りは時計回り
      car.s += car.speed * (car.outerLane ? 1 : -1) * dt;
      const p = pointOnLoop(loop, car.s);
      const way = car.outerLane ? 1 : -1;
      this.place(car.img, p.gx, p.gy, p.dx * way, p.dy * way);
    }
  }

  /** 車を1台、マス座標に置く（向きと深度もここで決める）。 */
  private place(img: Phaser.GameObjects.Image, gx: number, gy: number, dx: number, dy: number): void {
    const w = isoToWorld(gx, gy);
    img.setPosition(w.x, w.y);
    // 絵は右向きに描いてあるので、画面の左へ進むときだけ反転する。
    // 等角では gx＋方向が右下、gy＋方向が左下なので、画面Xの符号で決まる。
    const screenDx = (dx - dy) * (TILE_W / 2);
    if (screenDx !== 0) img.setFlipX(screenDx < 0);
    img.setDepth(depthFor(gx, gy, LAYER.furniture));
  }

  /** 車を片付ける（並べ直しとシーン終了で使う）。 */
  clear(): void {
    for (const car of this.loopCars) car.img.destroy();
    this.loopCars = [];
  }
}
