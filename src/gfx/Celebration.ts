import Phaser from "phaser";
import { FOOTER_H, GAME_HEIGHT, GAME_WIDTH, HUD_H } from "../config";
import { FX } from "../config/balance";
import { flushInput } from "../ui/inputReady";
import { PORTRAIT_SIZE } from "./portrait";

/**
 * お祝い・お知らせの演出（帯＋パーティクル）。
 *
 * 選手やクラブの格が上がったとき、大会に勝ったとき、入会があったときなど、
 * 「良いことが起きた」を短く見せる。方針は3つ：
 *   ・短くテンポよく（既定 FX.celebrateSec）
 *   ・重なったらキューに積んで順番に出す
 *   ・画面のどこでもタップすればすぐ飛ばせる（スキップ可能）
 */

export interface CelebrateOptions {
  /** 大きく出す1行。 */
  title: string;
  /** 小さく添える1行。 */
  subtitle?: string;
  /** 見出しの色。 */
  color: string;
  /** 先頭に付ける記号（★ 🏆 など）。 */
  icon?: string;
  /** 表示時間（秒）。既定は FX.celebrateSec。 */
  durationSec?: number;
  /** パーティクルを弾けさせる（大きな出来事のみ）。 */
  burst?: boolean;
  /**
   * 顔（ポートレートのテクスチャキー）。渡すと帯の左に顔が出る。
   * 「誰がやったのか」が一目で分かるので、自己新記録や表彰はこれを付ける。
   */
  portrait?: string;
  /**
   * 帯の中に置くボタン（「一覧を見る」など）。押すと演出を閉じてから onTap を呼ぶ。
   * 「入会12人」のような数だけの知らせから、その中身（誰が来たか）へ飛べるようにするため。
   * ボタンがあるときは読む・押す時間がいるので、表示を少し長くする（→ ACTION_EXTRA_SEC）。
   */
  action?: { label: string; onTap: () => void };
}

/** ボタン付きの帯を長めに出す秒数。 */
const ACTION_EXTRA_SEC = 2.6;

interface Active {
  root: Phaser.GameObjects.Container;
  emitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  life: number;
  total: number;
}

export class CelebrationLayer {
  private queue: CelebrateOptions[] = [];
  private active: Active | null = null;
  private gap = 0;
  private readonly skipZone: Phaser.GameObjects.Zone;

  constructor(private readonly scene: Phaser.Scene) {
    // 画面全体のタップでスキップ。演出が出ていないときは素通りさせる。
    this.skipZone = scene.add
      .zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setDepth(3200)
      .setInteractive();
    this.skipZone.on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      if (!this.active) return;
      ev.stopPropagation?.();
      this.skip();
    });
    this.skipZone.disableInteractive();
  }

  /** 演出を1つ積む（出ている最中なら順番待ちになる）。 */
  push(opts: CelebrateOptions): void {
    this.queue.push(opts);
  }

  /** いま出ているものを飛ばす。 */
  skip(): void {
    if (!this.active) return;
    this.finish(this.active);
    this.active = null;
    this.gap = 0.08;
  }

  /** 全部やめる（画面を離れるときなど）。 */
  clear(): void {
    if (this.active) this.finish(this.active);
    this.active = null;
    this.queue = [];
    this.skipZone.disableInteractive();
  }

  destroy(): void {
    this.clear();
    this.skipZone.destroy();
  }

  get busy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  update(dt: number): void {
    if (this.active) {
      this.active.life -= dt;
      const a = this.active;
      const t = 1 - a.life / a.total;
      // 出る（0.18秒）→ 見せる →　消える（0.28秒）
      if (t < 0.14) {
        const k = t / 0.14;
        a.root.setAlpha(k);
        a.root.setScale(0.86 + 0.14 * k);
      } else if (a.life < 0.28) {
        const k = Math.max(0, a.life / 0.28);
        a.root.setAlpha(k);
        a.root.y = a.root.y - dt * 26;
      } else {
        a.root.setAlpha(1).setScale(1);
      }
      if (a.life <= 0) {
        this.finish(a);
        this.active = null;
        this.gap = FX.celebrateGapSec;
      }
      return;
    }

    if (this.gap > 0) {
      this.gap -= dt;
      return;
    }
    const next = this.queue.shift();
    if (next) this.show(next);
    else this.skipZone.disableInteractive();
  }

  // ---------------------------------------------------------------- 内部

  private show(opts: CelebrateOptions): void {
    const cy = HUD_H + (GAME_HEIGHT - HUD_H - FOOTER_H) * 0.42;
    const root = this.scene.add.container(GAME_WIDTH / 2, cy).setDepth(3210).setAlpha(0);

    // 「入会◯人・人気+◯」などの成果を読ませる帯。小さいと何が起きたか分からないので大きめ。
    const actionH = opts.action ? 56 : 0;
    const bandH = (opts.portrait ? 118 : opts.subtitle ? 108 : 76) + actionH;
    // 顔を出すぶん、文字を右へ寄せる
    const faceW = opts.portrait ? 86 : 0;
    const textX = faceW / 2;
    const band = this.scene.add.graphics();
    band.fillStyle(0x0a1622, 0.9);
    band.fillRoundedRect(-GAME_WIDTH / 2 + 16, -bandH / 2, GAME_WIDTH - 32, bandH, 10);
    band.lineStyle(3, Phaser.Display.Color.HexStringToColor(opts.color).color, 0.95);
    band.strokeRoundedRect(-GAME_WIDTH / 2 + 16, -bandH / 2, GAME_WIDTH - 32, bandH, 10);
    root.add(band);

    // 顔（あれば）。枠を付けて、誰の記録なのかをはっきり見せる
    if (opts.portrait) {
      const fx = -GAME_WIDTH / 2 + 16 + 46;
      const frame = this.scene.add
        .rectangle(fx, 0, 76, 76, 0x0d1c2b, 1)
        .setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(opts.color).color, 1);
      root.add(frame);
      const face = this.scene.add.image(fx, 0, opts.portrait).setScale(72 / PORTRAIT_SIZE);
      root.add(face);
    }

    const head = `${opts.icon ? `${opts.icon} ` : ""}${opts.title}`;
    const title = this.scene.add
      .text(textX, opts.subtitle ? -bandH / 2 + 18 : -actionH / 2, head, {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: opts.color,
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 52 - faceW },
      })
      .setOrigin(0.5, opts.subtitle ? 0 : 0.5);
    root.add(title);

    if (opts.subtitle) {
      const sub = this.scene.add
        .text(textX, bandH / 2 - 14 - actionH, opts.subtitle, {
          fontFamily: "sans-serif",
          fontSize: "17px",
          color: "#dfe6ec",
          align: "center",
          wordWrap: { width: GAME_WIDTH - 52 - faceW },
        })
        .setOrigin(0.5, 1);
      root.add(sub);
    }

    if (opts.action) {
      const action = opts.action;
      const bw = 260;
      const bh = 44;
      const by = bandH / 2 - 8 - bh / 2;
      const btn = this.scene.add
        .rectangle(0, by, bw, bh, 0x2e7d5b, 1)
        .setStrokeStyle(2, 0x7fe3b0, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add
        .text(0, by, action.label, { fontFamily: "sans-serif", fontSize: "18px", color: "#ffffff", fontStyle: "bold" })
        .setOrigin(0.5);
      btn.on("pointerover", () => btn.setFillStyle(0x3fa876, 1));
      btn.on("pointerout", () => btn.setFillStyle(0x2e7d5b, 1));
      btn.on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        // 先に演出を閉じる（開いた画面の上に帯が残らないように）
        this.skip();
        action.onTap();
      });
      root.add(btn);
      root.add(label);
    }

    const hint = this.scene.add
      .text(GAME_WIDTH / 2 - 26, bandH / 2 + 12, "タップでスキップ", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#95a6b8",
      })
      .setOrigin(1, 0);
    root.add(hint);

    let emitter: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
    if (opts.burst) {
      emitter = this.scene.add.particles(GAME_WIDTH / 2, cy, "spark", {
        speed: { min: 70, max: 220 },
        angle: { min: 0, max: 360 },
        lifespan: 800,
        scale: { start: 2.6, end: 0 },
        quantity: 28,
        tint: [Phaser.Display.Color.HexStringToColor(opts.color).color, 0xffffff, 0xf7dc6f],
        emitting: false,
      });
      emitter.setDepth(3205);
      emitter.explode(28);
    }

    const total = (opts.durationSec ?? FX.celebrateSec) + (opts.action ? ACTION_EXTRA_SEC : 0);
    this.active = { root, emitter, life: total, total };
    this.skipZone.setInteractive();
    // 演出が出た直後のタップでも飛ばせるようにする（→ ui/inputReady.ts）
    flushInput(this.scene);
  }

  private finish(a: Active): void {
    a.root.destroy();
    a.emitter?.destroy();
  }
}
