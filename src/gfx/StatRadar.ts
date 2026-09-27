import Phaser from "phaser";
import {
  STAT_COLOR,
  STAT_KEYS,
  STAT_LABEL,
  talentRankOf,
  TALENT_COLOR,
  type StatKey,
  type Student,
} from "../sim/student";

/**
 * 能力のレーダーチャート（五角形）。
 *
 * 参考にしているのはサッカーゲームの能力チャート。
 *  ・**塗りつぶした多角形**で、形そのものが選手の個性になる
 *    （横に広い＝短距離型、上下に伸びる＝持久型、まるい＝バランス型）
 *  ・頂点に能力名と、その能力の**才能ランク**（＝成長速度）を添える
 *  ・育つほど形が大きくなり、枠いっぱいに近づく。**枠は超えない**
 *  ・中央に総合値は出さない（形で読ませたいので、数字で要約しない）
 *
 * 【描き方】五角形の頂点は真上から時計回り。各軸の長さは 能力値/100 に比例させる。
 * 目盛りの輪（20刻み）を薄く敷いておくと、「あとどれくらいで枠いっぱいか」が分かる。
 */

export interface RadarOptions {
  /** 外枠までの半径（px）。 */
  radius: number;
  /** 能力名を出す（頂点の外側）。 */
  labels?: boolean;
  /** 才能ランクを能力名の隣に出す。 */
  talent?: boolean;
  /** 能力値の数字を頂点の外側に出す。 */
  values?: boolean;
  /** 文字の大きさ（能力名）。 */
  fontSize?: number;
  /** 多角形の塗りの色（既定は金色）。 */
  fill?: number;
  /** 多角形の輪郭の色（既定は明るい金色）。 */
  line?: number;
  /** 頂点に能力ごとの色の点を打つ（既定は打つ）。 */
  dots?: boolean;
  /** 比較の下地の塗り色（既定は水色）。 */
  baseFill?: number;
  /** 比較の下地の輪郭色。 */
  baseLine?: number;
}

/** 目盛りの輪の数（20・40・60・80・100）。 */
const RINGS = 5;

/**
 * 能力値 → 外枠を1とした長さ。
 *
 * **枠は超えない**（1で頭打ち）。0 のときも点がつぶれて線に見えないよう、
 * ほんの少しだけ長さを残す。
 */
export function radarRatio(value: number): number {
  return Math.max(0.04, Math.min(1, value / 100));
}

/** 頂点の座標（真上から時計回り）。t は 0〜1（外枠を1とした長さ）。 */
function vertex(i: number, t: number, radius: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (Math.PI * 2 * i) / STAT_KEYS.length;
  return { x: Math.cos(a) * radius * t, y: Math.sin(a) * radius * t };
}

/**
 * レーダーチャート1つぶん。
 *
 * 中身（多角形）は値が変わったときだけ描き直す。
 * 枠と目盛りは1回描いたら動かないので、別の Graphics に分けてある。
 */
export class StatRadar {
  /** チャート全体。呼び出し側がコンテナに add して位置を決める。 */
  readonly root: Phaser.GameObjects.Container;

  private readonly frame: Phaser.GameObjects.Graphics;
  /** 比較の下地（過去の自分・別の選手）。主役より先に描くので下に来る。 */
  private readonly baseFill: Phaser.GameObjects.Graphics;
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly nameTexts: Phaser.GameObjects.Text[] = [];
  private readonly talentTexts: Phaser.GameObjects.Text[] = [];
  private readonly valueTexts: Phaser.GameObjects.Text[] = [];
  private drawn = "";
  /** 比較の下地の能力（null＝重ねない）。 */
  private baseStats: Record<StatKey, number> | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly opts: RadarOptions,
  ) {
    this.root = scene.add.container(x, y);
    this.frame = scene.add.graphics();
    this.fill = scene.add.graphics();
    this.baseFill = scene.add.graphics();
    this.root.add(this.frame);
    this.root.add(this.fill);
    // 【比較の形は「上に線で」重ねる】下に敷くと、主役の塗りに透けて色が濁り、
    // どちらの形なのか分からなくなる。薄い塗り＋はっきりした輪郭で上に置く
    this.root.add(this.baseFill);
    this.drawFrame();

    const r = opts.radius;
    const size = opts.fontSize ?? 13;
    STAT_KEYS.forEach((key, i) => {
      // 能力名は頂点の外側。上下左右で寄せ方を変えて、枠から離れすぎないようにする
      const v = vertex(i, 1, r);
      const out = vertex(i, 1 + 26 / r, r);
      const originX = Math.abs(v.x) < 1 ? 0.5 : v.x > 0 ? 0 : 1;
      const originY = v.y < -1 ? 1 : v.y > 1 ? 0 : 0.5;

      if (opts.labels !== false) {
        const t = scene.add
          .text(out.x, out.y, STAT_LABEL[key], {
            fontFamily: "sans-serif",
            fontSize: `${size}px`,
            color: "#cfd8e0",
            fontStyle: "bold",
          })
          .setOrigin(originX, originY);
        this.root.add(t);
        this.nameTexts.push(t);

        if (opts.talent) {
          // 才能ランクは能力名の外側へ、能力名と重ならない位置に置く。
          // 【「才能」と書く】文字だけ置くと、能力の強さなのか才能なのか読み分けられない。
          //  → 表示は「才能B」の形にして、意味を取り違えないようにする。
          // 【実際の高さで積む】文字の高さは端末のフォントで変わるので、
          // 決め打ちの間隔にすると重なる。measure した高さから座標を出す。
          const h = t.height;
          const top = originY === 1; // 真上の頂点だけは、外側＝上
          const gy = top ? out.y - h - 2 : originY === 0.5 ? out.y + h / 2 + 1 : out.y + h + 1;
          const g = scene.add
            .text(out.x, gy, "", {
              fontFamily: "sans-serif",
              fontSize: `${size + 2}px`,
              color: "#ffffff",
              fontStyle: "bold",
            })
            .setOrigin(originX, top ? 1 : 0);
          this.root.add(g);
          this.talentTexts.push(g);
        }
      }

      if (opts.values) {
        // 数字は頂点のすぐ内側（多角形の上に乗せる）
        const inner = vertex(i, 0.72, r);
        const t = scene.add
          .text(inner.x, inner.y, "", {
            fontFamily: "sans-serif",
            fontSize: `${size + 1}px`,
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0.5, 0.5);
        this.root.add(t);
        this.valueTexts.push(t);
      }
    });
  }

  /** その選手の形にする（値が変わっていなければ描き直さない）。 */
  show(s: Student): void {
    this.showStats(s.stats, STAT_KEYS.map((k) => talentRankOf(s, k)).join(","));
    this.showTalent(s);
  }

  /**
   * 【重ね表示】比較の下地を敷く（null で消す）。
   *
   * 主役（金）の下に、別の色の多角形をもう1枚描く。
   * 「過去の自分」と重ねれば成長が、「別の選手」と重ねれば個性の差が、
   * 形の食い違いとしてそのまま見える。
   */
  setBase(stats: Record<StatKey, number> | null): void {
    this.baseStats = stats ? { ...stats } : null;
    this.drawBase();
  }

  /** 能力の値だけを指定して形を作る（過去の記録を主役にするときに使う）。 */
  showStats(stats: Record<StatKey, number>, tag = ""): void {
    const key = STAT_KEYS.map((k) => Math.round(stats[k])).join(",") + "/" + tag;
    if (key === this.drawn) return;
    this.drawn = key;

    const r = this.opts.radius;
    const pts = STAT_KEYS.map((k, i) => vertex(i, radarRatio(stats[k]), r));

    this.fill.clear();
    // 塗り：能力の色を混ぜず、1色で塗る（形を読ませたいので中は無地）。
    // 下地を敷いているときは、下の形が透けるよう少し薄くする
    this.fill.fillStyle(this.opts.fill ?? 0xf2c53d, 0.8);
    this.fill.beginPath();
    this.fill.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.fill.lineTo(pts[i].x, pts[i].y);
    this.fill.closePath();
    this.fill.fillPath();
    // 輪郭ははっきりした線で
    this.fill.lineStyle(3, this.opts.line ?? 0xffe066, 1);
    this.fill.strokePath();
    // 頂点に能力ごとの色の点を打つ（どの角がどの能力か迷わない）
    if (this.opts.dots !== false) {
      for (let i = 0; i < pts.length; i++) {
        this.fill.fillStyle(STAT_COLOR[STAT_KEYS[i]], 1);
        this.fill.fillCircle(pts[i].x, pts[i].y, 4);
      }
    }

    if (this.opts.values) {
      STAT_KEYS.forEach((k, i) => {
        this.valueTexts[i]?.setText(String(Math.round(stats[k])));
      });
    }
  }

  /** 才能ランクを頂点に出す（opts.talent のときだけ）。 */
  showTalent(s: Student): void {
    if (!this.opts.talent) return;
    STAT_KEYS.forEach((k, i) => {
      const rank = talentRankOf(s, k);
      this.talentTexts[i]?.setText(`才能${rank}`).setColor(TALENT_COLOR[rank]);
    });
  }

  /** 下地の多角形（比較対象）。主役より薄く、輪郭は破線ふうの別色にする。 */
  private drawBase(): void {
    const g = this.baseFill;
    g.clear();
    const stats = this.baseStats;
    if (!stats) return;
    const r = this.opts.radius;
    const pts = STAT_KEYS.map((k, i) => vertex(i, radarRatio(stats[k]), r));
    g.fillStyle(this.opts.baseFill ?? 0x5aa9e6, 0.2);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
    g.lineStyle(3, this.opts.baseLine ?? 0x8fd0ff, 1);
    g.strokePath();
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }

  destroy(): void {
    this.root.destroy();
  }

  /** 枠と目盛り（1回だけ描く）。 */
  private drawFrame(): void {
    const r = this.opts.radius;
    const g = this.frame;
    g.clear();
    // 目盛りの輪。外枠だけ濃くして「ここが100」と分かるようにする
    for (let ring = 1; ring <= RINGS; ring++) {
      const t = ring / RINGS;
      const outer = ring === RINGS;
      g.lineStyle(outer ? 2 : 1, outer ? 0x5b7f9e : 0x33506b, outer ? 1 : 0.7);
      g.beginPath();
      for (let i = 0; i <= STAT_KEYS.length; i++) {
        const v = vertex(i % STAT_KEYS.length, t, r);
        if (i === 0) g.moveTo(v.x, v.y);
        else g.lineTo(v.x, v.y);
      }
      g.strokePath();
    }
    // 中心から各頂点への軸
    g.lineStyle(1, 0x33506b, 0.8);
    for (let i = 0; i < STAT_KEYS.length; i++) {
      const v = vertex(i, 1, r);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(v.x, v.y);
      g.strokePath();
    }
  }
}
