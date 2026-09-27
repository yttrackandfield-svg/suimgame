/**
 * 【歩きのモーション】
 *
 * キャラ素材のほとんどは立ち絵1枚（幼児・学童は全タイプ、大人も半分）なので、
 * ただ座標を動かすと**板が滑っている**ようにしか見えない。
 * そこで「歩いた距離」から歩数を作り、絵そのものを上下・左右に揺らして歩いて見せる。
 *
 * 時間ではなく**距離**で回すのがこの仕組みの要。
 *   ・立ち止まれば足も止まる（その場で足踏みしない）
 *   ・速く動けば歩数も増える（滑って見えない）
 *   ・コマのある素材も同じ歩数でコマ送りするので、足の運びと上下が揃う
 *
 * 1人あたり sin 2つぶんの計算しかしないので、何十人出しても負荷にならない。
 */

import { TILE_H, TILE_W } from "../config";

/** 1歩ぶんに進む距離（グリッド）。小さいほど足の回転が速くなる。 */
const STEP_LEN = 0.85;
/**
 * 足が描いてある素材（コーチの8方向歩行）の1歩ぶん。
 *
 * 歩幅は**絵の中で両足がどれだけ開いているか**で決まっていて、変えられない。
 * 1歩で絵の歩幅より遠くまで進めば、足を接地したまま体だけ先へ行く＝滑って見える。
 * コーチの絵は両足の間隔が画面上でおよそ 35px なので、1歩の移動もそれに合わせる
 * （screenSteps の単位は「画面 TILE_W/2 px ＝ 1」なので 35/60 ≒ 0.6）。
 */
export const ART_STEP_LEN = 0.6;
/** 背丈に対する上下の振れ幅。大きいほど元気に、小さいほど落ち着いて歩く。 */
const BOB = 0.05;
/** 足を踏み替えるたびの体の傾き（ラジアン）。 */
const SWAY = 0.05;
/** 着地の瞬間のつぶれ（縦に縮んで横に広がる）。 */
const SQUASH = 0.035;
/** 呼吸で縦に伸び縮みする量。小さくてよい（大きいと膨らんで見える）。 */
const BREATH = 0.014;
/** 呼吸の速さ（1秒あたりのラジアン）。ゆっくりのほうが落ち着いて見える。 */
const BREATH_SPEED = 1.5;
/**
 * **絵そのものが足を動かす素材**（コーチの8方向歩行など）に掛ける、コード側の揺れの強さ。
 *
 * 上下・傾き・つぶれは「立ち絵1枚を歩いて見せる」ための代用品なので、
 * 足が描いてある素材に同じ強さで掛けると、絵の歩きより**体の上下のほうが目立つ**。
 * ＝ 足を動かしているのに「板が上下しながら移動している」ようにしか見えなくなる。
 * 素材が歩いてくれるぶん、コード側は「弾み」を添えるだけに弱める。
 */
export const GAIT_ANIMATED = 0.35;

/** 上下・傾き・つぶれ。sx/sy は素の倍率に掛ける。 */
export interface WalkPose {
  oy: number;
  rot: number;
  sx: number;
  sy: number;
}

/**
 * グリッドの移動量 →「画面で進んだ距離」。単位は 画面 TILE_W/2 px ＝ 1。
 *
 * 等角では、**同じ1マスでも画面上の長さが向きで倍ほど違う**。
 *   画面の左右へ動く（gx と gy が逆向き） … 1マスあたり 約1.41
 *   画面の奥・手前へ動く（gx と gy が同じ向き） … 1マスあたり 約0.71
 * 歩数をマス距離で数えると、左右へ歩くときだけ歩幅が倍に伸びて滑って見えるので、
 * **目に見えている距離**で数える。
 */
export function screenSteps(dgx: number, dgy: number): number {
  const sx = (dgx - dgy) * (TILE_W / 2);
  const sy = (dgx + dgy) * (TILE_H / 2);
  return Math.hypot(sx, sy) / (TILE_W / 2);
}

export class WalkCycle {
  /** 歩数（小数）。整数を跨ぐたびに足が入れ替わる。 */
  private phase: number;

  constructor(
    seed = Math.random(),
    /** 1歩ぶんの距離。足が描いてある素材は絵の歩幅に合わせる（→ ART_STEP_LEN）。 */
    private readonly stepLen = STEP_LEN,
  ) {
    // 人によって足の出だしをずらす（全員が同じ足並みで歩くと行進に見える）
    this.phase = seed * 2;
  }

  /** 進んだぶんだけ歩数を進める（グリッド単位）。 */
  advance(dist: number): void {
    if (dist > 0) this.phase += dist / this.stepLen;
  }

  /**
   * コマのある素材の、いま出すコマ番号。
   *
   * **素材のコマ全体で「左足→右足」の2歩ぶん＝1周**として送る。
   * 体の上下（pose）も2歩で1周するので、こうしておくと足の運びと上下が必ず揃う。
   *
   * ここを「1コマ＝1歩」で回すと、3コマの素材は
   *   足＝3歩で一周 ／ 体の上下＝2歩で一周
   * となり、両者が**ずっとずれ続ける**。足は動いているのに上下と噛み合わないので、
   * 見ている側には「板が上下しながら滑っている」ようにしか映らない。
   * （2コマの素材はたまたま揃っていたので、コーチの3コマだけが歩いて見えなかった。）
   */
  frameOf(count: number): number {
    if (count <= 1) return 0;
    const order = beatOrder(count);
    // 半拍ずらして、着地のコマが「着地の瞬間」をまたぐようにする
    const i = Math.floor(this.phase * (order.length / 2) + 0.5);
    return order[((i % order.length) + order.length) % order.length];
  }

  /**
   * 歩いている姿勢。
   * lift＝1 が「地面から離れていちばん高い瞬間」、0 が「着地の瞬間」。
   *
   * motion は揺れの強さ。足が描いてある素材には GAIT_ANIMATED を渡して弱める。
   */
  pose(height: number, motion = 1): WalkPose {
    const lift = Math.abs(Math.sin(this.phase * Math.PI));
    const squash = (1 - lift) * SQUASH * motion;
    return {
      oy: -lift * height * BOB * motion,
      rot: Math.sin(this.phase * Math.PI) * SWAY * motion,
      sx: 1 + squash,
      sy: 1 - squash,
    };
  }
}

/**
 * コマ数 → 1周（2歩）ぶんの再生順。
 *
 * 偶数コマは前半＝左足・後半＝右足として、そのまま並べれば1周になる。
 * 奇数コマは**折り返す**（3コマなら 0→1→2→1）。両端が「左足を出した絵／右足を出した絵」、
 * 真ん中が「足がそろう絵」なので、折り返すと左右がきれいに入れ替わり、
 * 1歩あたりのコマ数も揃う（3コマ＝4拍＝1歩2コマ）。
 */
function beatOrder(count: number): readonly number[] {
  const cached = ORDERS.get(count);
  if (cached) return cached;
  const base = Array.from({ length: count }, (_, i) => i);
  const order = count % 2 === 0 ? base : [...base, ...base.slice(1, -1).reverse()];
  ORDERS.set(count, order);
  return order;
}

const ORDERS = new Map<number, readonly number[]>();

/**
 * 立ち止まっている人の姿勢。
 *
 * 上下に動かすだけでは、**立ち絵を貼った板**にしか見えない。
 * 人が生きて見えるのは
 *   ・呼吸（胸が上下する＝縦にわずかに伸び縮みする）
 *   ・体重移動（ゆっくり左右に傾く）
 * の2つなので、その両方をごく小さく掛け続ける。位置ではなく**形**を変えるのが要。
 */
export function idlePose(t: number, phase: number): WalkPose {
  const breath = Math.sin(t * BREATH_SPEED + phase);
  return {
    oy: Math.sin(t * 1.6 + phase) * 0.6,
    rot: Math.sin(t * 0.5 + phase) * 0.05,
    sx: 1 - breath * BREATH * 0.5,
    sy: 1 + breath * BREATH,
  };
}
