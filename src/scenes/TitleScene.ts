import { bgm } from "../audio/bgm";
import Phaser from "phaser";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { charTypeOf, CHAR_VARIANTS, swimModesOf } from "../gfx/textures";
import { applyCharSprite, charTexture } from "../gfx/charAssets";
import { charFacing, flipXFor } from "../gfx/charFacing";
import type { CharMode } from "../gfx/charSprites";
import { Button } from "../ui/Button";
import { SettingsModal } from "../ui/SettingsModal";
import { latestSlot } from "../save/slots";
import { applyRenderScale } from "../gfx/renderScale";

/**
 * ホーム画面（タイトル）。起動して最初に出る画面。
 *   はじめる   → データ選択画面へ
 *   つづきから → データ選択画面へ（どの枠で続けるか選ぶ）
 *   設定       → 設定モーダル
 */

const TITLE = "マイスイミングクラブ";

/**
 * 泳者の大きさ。
 *
 * `applyCharSprite` の base は「泳ぐ姿の基準の高さ（SWIM_H＝14ドット）に掛ける倍率」なので、
 * **画面に出る高さ ＝ 14 × これ**。レーンの間隔（LANE_GAP）に収まる値にしてある
 *（大きくするとレーンをまたいで重なる）。
 * 施設は CHAR_SCALE(3.75)＝52px、大会の会場は 4.3＝60px。ホーム画面はその中間より小さめ。
 */
const SWIMMER_SCALE = 2.4;

/** 水面のレーンの間隔（泳者・底のライン・ロープが全部これを基準にする）。 */
const LANE_GAP = 34;

/**
 * 版の表示。**中身を直したら必ずここを上げること。**
 *
 * スマホでは「ホーム画面に追加」した全画面表示だと更新ボタンが無く、
 * さらに index.html で引っぱって更新（pull-to-refresh）も止めてあるので、
 * 直したつもりでも古い画面をそのまま見ていることがある。
 * タイトルのこの表示が変わっていなければ、まだ古い画面のまま。
 */
const VERSION = "ver 2.1";

interface TitleSwimmer {
  /** 描き起こした素材はコマ送りするので Image ではなく Sprite。 */
  img: Phaser.GameObjects.Sprite;
  /** 進む向き（1＝右へ）。引き波を後ろへ引くのに使う。 */
  dir: 1 | -1;
  speed: number;
  bobPhase: number;
  baseY: number;
}

export class TitleScene extends Phaser.Scene {
  private swimmers: TitleSwimmer[] = [];
  /** ゆっくり流れる雲（奥ほど遅い）。 */
  private clouds: { g: Phaser.GameObjects.Graphics; speed: number }[] = [];
  private waterG!: Phaser.GameObjects.Graphics;
  private continueBtn!: Button;
  private settings?: SettingsModal;
  private busy = false;

  private readonly waterTop = 456;
  private readonly waterH = 186;

  constructor() {
    super("Title");
  }

  create(): void {
    bgm.play("title");
    applyRenderScale(this); // 論理540×960のまま、画素だけ細かく描く（→ gfx/renderScale.ts）
    this.swimmers = [];
    this.clouds = [];
    this.settings = undefined;
    this.busy = false;

    this.buildBackground();
    this.buildTitle();
    this.buildMenu();

    // 「つづきから」はセーブがある時だけ押せる
    this.continueBtn.setEnabled(false);
    void latestSlot().then((slot) => {
      if (!this.scene.isActive()) return;
      if (slot != null) this.continueBtn.setEnabled(true);
    });

    this.cameras.main.fadeIn(260, 0, 0, 0);
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 60) / 1000;
    const t = time / 1000;
    for (const s of this.swimmers) {
      s.img.x += s.speed * dt;
      if (s.speed > 0 && s.img.x > GAME_WIDTH + 30) s.img.x = -30;
      if (s.speed < 0 && s.img.x < -30) s.img.x = GAME_WIDTH + 30;
      s.img.y = s.baseY + Math.sin(t * 5 + s.bobPhase) * 1.6;
    }
    // 雲は流す（奥ほど遅い＝視差で奥行きが出る）
    for (const c of this.clouds) {
      c.g.x += c.speed * dt;
      if (c.g.x > GAME_WIDTH + 70) c.g.x = -70;
    }
    this.drawWater(t);
    this.drawWakes(t);
  }

  // ---------------------------------------------------------------- 背景

  /**
   * ホーム画面の絵。
   *
   * 【奥から手前へ5枚重ねる】（2026-09-24 に描き直した）
   * 以前は「べた塗りの空＋丸い太陽＋長方形のプール」だけで、
   * 中身（作り込んだ等角の施設）と比べて明らかに手抜きに見えていた。
   * いまは **空 → 街 → デッキ → プール → 手前のプールサイド** の5枚を重ね、
   * 動くのは水と雲と泳者だけにしてある（毎フレーム描き直すのは水面だけ）。
   *
   *   -100 空（グラデーション・太陽・光の筋）
   *    -95 遠景の街（シルエット3段。奥ほど薄い＝空気遠近）
   *    -92 プールの建物とデッキ（タイル・目地・飛び込み台）
   *    -80 水面（毎フレーム。深さのグラデ・レーンロープ・波・きらめき）
   *    -70 泳者（描き起こした素材。コマ送りで動く）
   *    -55 背泳ぎの旗（泳者の手前に張る）
   *    -50 手前のプールサイド（ビート板の山・ベンチ・影）
   */
  private buildBackground(): void {
    this.buildSky();
    this.buildTown();
    this.buildDeck();
    this.waterG = this.add.graphics().setDepth(-80);
    this.buildSwimmers();
    this.buildFlags();
    this.buildForeground();
  }

  /** 空。上ほど濃い青、水平線ぎわは白っぽく。太陽と光の筋を入れる。 */
  private buildSky(): void {
    const g = this.add.graphics().setDepth(-100);
    // 【3段に分けて敷く】1回の fillGradientStyle では、上下とも直線的にしか変わらない。
    // 段を分けると、水平線の手前だけ白っぽくなる「霞んだ空」になる。
    g.fillGradientStyle(0x2f7fb8, 0x2f7fb8, 0x62b6e0, 0x62b6e0, 1);
    g.fillRect(0, 0, GAME_WIDTH, 180);
    g.fillGradientStyle(0x62b6e0, 0x62b6e0, 0xa8dcf2, 0xa8dcf2, 1);
    g.fillRect(0, 180, GAME_WIDTH, 180);
    g.fillGradientStyle(0xa8dcf2, 0xa8dcf2, 0xe4f4fb, 0xe4f4fb, 1);
    g.fillRect(0, 360, GAME_WIDTH, this.waterTop - 360);

    // 太陽（外側ほど薄い輪を重ねて「にじみ」を作る）
    const sx = GAME_WIDTH - 86;
    const sy = 104;
    for (const [r, a] of [[92, 0.08], [70, 0.1], [52, 0.16], [40, 0.35]] as const) {
      g.fillStyle(0xfff6c8, a);
      g.fillCircle(sx, sy, r);
    }
    g.fillStyle(0xfffdf0, 1);
    g.fillCircle(sx, sy, 27);

    // 斜めに差す光の筋（太陽から水面へ）
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0xffffff, 0.06 - i * 0.015);
      g.beginPath();
      g.moveTo(sx - 18 - i * 14, sy + 10);
      g.lineTo(sx + 16 + i * 10, sy + 14);
      g.lineTo(sx - 120 - i * 90, this.waterTop);
      g.lineTo(sx - 190 - i * 90, this.waterTop);
      g.closePath();
      g.fillPath();
    }

    // 雲（奥は小さく薄く、手前は大きく白く＝奥行き）
    this.clouds = [];
    const cloudSpec: readonly [number, number, number, number, number][] = [
      // x, y, 大きさ, 濃さ, 流れる速さ
      [80, 92, 1.15, 0.9, 3.4],
      [330, 58, 0.85, 0.75, 2.6],
      [200, 162, 0.6, 0.55, 1.8],
      [430, 132, 0.7, 0.6, 2.1],
    ];
    for (const [cx, cy, sc, alpha, speed] of cloudSpec) {
      const c = this.add.graphics().setDepth(-96);
      // ふくらみを重ねて、下辺だけ平らにする（積雲らしい形）
      c.fillStyle(0xffffff, alpha);
      c.fillCircle(0, 0, 18 * sc);
      c.fillCircle(21 * sc, 5 * sc, 14 * sc);
      c.fillCircle(-21 * sc, 6 * sc, 12 * sc);
      c.fillCircle(9 * sc, -9 * sc, 13 * sc);
      c.fillRect(-21 * sc, 0, 42 * sc, 13 * sc);
      // 底の影（薄い青）で立体に
      c.fillStyle(0xd8ecf8, alpha * 0.8);
      c.fillRect(-21 * sc, 9 * sc, 42 * sc, 4 * sc);
      c.setPosition(cx, cy);
      this.clouds.push({ g: c, speed });
    }
  }

  /**
   * 遠景の街。
   * **奥ほど薄く**（空の色に寄せる）して空気遠近を出す。
   * クラブが「どこかの街にある」ことが伝わると、画面が一気に場所らしくなる。
   */
  private buildTown(): void {
    const g = this.add.graphics().setDepth(-95);
    const base = this.waterTop - 26;
    const layers: readonly [number, number, number, number][] = [
      // 色, 濃さ, 高さの基準, 幅の基準
      [0x9fc8de, 0.55, 74, 46],
      [0x7fb2cd, 0.7, 54, 34],
      [0x5f95b4, 0.85, 36, 26],
    ];
    let seed = 20260924;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (const [color, alpha, h0, w0] of layers) {
      g.fillStyle(color, alpha);
      let x = -20;
      while (x < GAME_WIDTH + 20) {
        const w = w0 * (0.6 + rnd() * 0.9);
        const h = h0 * (0.45 + rnd() * 0.85);
        g.fillRect(x, base - h, w, h);
        // ときどき屋上の塔屋やアンテナを足す（同じ箱が並ぶのを避ける）
        if (rnd() > 0.68) g.fillRect(x + w * 0.3, base - h - 10, w * 0.25, 10);
        x += w + 4 + rnd() * 10;
      }
    }
    // 建物の足元をデッキの色でそろえる（街とデッキの境をはっきりさせる）
    g.fillStyle(0xcfe4ef, 0.5);
    g.fillRect(0, base - 3, GAME_WIDTH, 3);
  }

  /**
   * プールサイドのデッキ（タイル）と、上端の飛び込み台。
   * タイルは目地まで描く。べた塗り＋縞より、ぐっと「施設」らしくなる。
   */
  private buildDeck(): void {
    const g = this.add.graphics().setDepth(-92);
    const top = this.waterTop - 26;

    // デッキ本体
    g.fillStyle(COLORS.deck, 1);
    g.fillRect(0, top, GAME_WIDTH, 26);
    // タイルの目地
    g.fillStyle(COLORS.deckAlt, 1);
    for (let x = 0; x < GAME_WIDTH; x += 26) g.fillRect(x, top, 1, 26);
    g.fillRect(0, top + 13, GAME_WIDTH, 1);
    // 濡れた跡（水ぎわだけ色を濃く）
    g.fillStyle(0xc9bda0, 0.5);
    g.fillRect(0, top + 20, GAME_WIDTH, 6);

    // プールの縁石（白いコーピング）
    g.fillStyle(0xf4f7f9, 1);
    g.fillRect(0, this.waterTop - 6, GAME_WIDTH, 6);
    g.fillStyle(0xd7dee3, 1);
    g.fillRect(0, this.waterTop - 2, GAME_WIDTH, 2);

    /**
     * 【飛び込み台は置かない】この絵はレーンが**横**に走っているので、
     * 奥の縁に台を並べるとレーンと直角になってしまう（台はレーンの端＝画面の左右にある）。
     * かわりに、奥の縁に置いて正しいものを2つ置く。
     */
    // ペースクロック（プールサイドの大きな時計。秒針だけの丸い盤）
    const cx = 86;
    const cy = this.waterTop - 44;
    g.fillStyle(0x2c3e50, 1);
    g.fillRect(cx - 3, cy, 6, 22); // 脚
    g.fillStyle(0xf4f7f9, 1);
    g.fillCircle(cx, cy - 4, 17);
    g.fillStyle(0x2c3e50, 1);
    g.fillCircle(cx, cy - 4, 15);
    g.fillStyle(0xf4f7f9, 1);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      g.fillCircle(cx + Math.cos(a) * 11, cy - 4 + Math.sin(a) * 11, 1.6);
    }
    g.fillStyle(0xe74c3c, 1);
    g.fillRect(cx - 1, cy - 14, 2, 11); // 秒針

    // レーンロープの巻き取りリール（奥の縁に2台）
    for (const rx of [GAME_WIDTH - 150, GAME_WIDTH - 104]) {
      g.fillStyle(0x7f8c8d, 1);
      g.fillRect(rx, this.waterTop - 26, 34, 6);
      g.fillStyle(0xbdc3c7, 1);
      g.fillCircle(rx + 17, this.waterTop - 30, 9);
      g.fillStyle(0x566573, 1);
      g.fillCircle(rx + 17, this.waterTop - 30, 4);
    }
  }

  /**
   * 背泳ぎの旗（バックストローク・フラッグ）。
   *
   * レーンの**端から少し内側**に、水面をまたいで張る。
   * レーンと直角に走る線が1本入るだけで、ただの水色の帯が「競泳プール」になる。
   * 泳者より手前（depth -55）に置く＝旗の下を泳いでいるように見える。
   */
  private buildFlags(): void {
    const g = this.add.graphics().setDepth(-55);
    const colors = [0xe74c3c, 0xf4d03f, 0x5dade2, 0x58d68d];
    for (const fx of [72, GAME_WIDTH - 72]) {
      // 張り綱
      g.lineStyle(1.5, 0xecf0f1, 0.9);
      g.lineBetween(fx, this.waterTop - 4, fx, this.waterTop + this.waterH + 4);
      // 三角の旗（上から順に色を変える）
      for (let i = 0; i < 12; i++) {
        const y = this.waterTop + 2 + i * 16;
        g.fillStyle(colors[i % colors.length], 0.95);
        g.beginPath();
        g.moveTo(fx - 7, y);
        g.lineTo(fx + 7, y);
        g.lineTo(fx, y + 11);
        g.closePath();
        g.fillPath();
      }
    }
  }

  /**
   * 泳いでいる子たち（年代も泳法もばらけさせる）。
   *
   * 【描き起こした素材で動かす】（2026-09-24）
   * ここだけコード生成のドット絵（charKey）を直に貼っていたので、
   * 本編（施設・大会）が描き起こした素材で動いているのに、
   * **最初に見る画面がいちばん粗い**という逆転が起きていた。
   * 会場（MeetScene）と同じ手順に揃える：
   *   Image → **Sprite**／`charTexture` で素材を引き、`applyCharSprite` で
   *   倍率とアニメーションをまとめて当てる（**setTexture は直に呼ばない**）。
   * 素材が無い体型・泳法のときは、中で従来のドット絵に落ちる。
   */
  private buildSwimmers(): void {
    for (let i = 0; i < 5; i++) {
      const laneY = this.waterTop + 26 + i * LANE_GAP;
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const body = (["kid", "child", "teen", "adult", "teen"] as const)[i % 5];
      const swims = swimModesOf(body);
      const mode: CharMode = swims[i % swims.length] ?? "swim";
      const variant = i % CHAR_VARIANTS;
      const typeId = charTypeOf(body, variant).id;
      const img = this.add
        .sprite(Phaser.Math.Between(0, GAME_WIDTH), laneY, charTexture(mode, body, variant, typeId))
        .setOrigin(0.5, 0.62)
        .setDepth(-70);
      // 【大きさは base で決まる】applyCharSprite は素材の解像度に関わらず
      // 「泳ぐ姿の基準の高さ（SWIM_H＝14）× base」の高さに揃える（→ gfx/charAssets.ts）。
      // ここは 14 × SWIMMER_SCALE ≒ 34px ＝ レーンの間隔とほぼ同じになる大きさ。
      applyCharSprite(img, mode, body, variant, typeId, SWIMMER_SCALE);
      // 向き（素材は左向き・右向きが混ざっているので向き表を見る → gfx/charFacing.ts）
      img.setFlipX(flipXFor(charFacing(typeId, mode), dir));
      this.swimmers.push({
        img,
        dir,
        speed: dir * (46 + Math.random() * 26),
        bobPhase: Math.random() * Math.PI * 2,
        baseY: laneY,
      });
    }
  }

  /**
   * 泳者の航跡（水面に残る引き波）。
   * 泳ぐ絵が動くようになったぶん、水面が静かだと浮いて見えるので、
   * **進む向きの後ろ側**へ細い白い帯を引く。水と一緒に毎フレーム描く。
   */
  private drawWakes(t: number): void {
    const g = this.waterG;
    for (const s of this.swimmers) {
      const back = s.dir > 0 ? -1 : 1;
      for (let i = 1; i <= 3; i++) {
        const a = 0.16 / i;
        const len = 16 + i * 10;
        const y = s.img.y + 5 + Math.sin(t * 6 + s.bobPhase + i) * 0.8;
        g.fillStyle(0xffffff, a);
        g.fillRect(s.img.x + back * (10 + i * 12), y, len * (back > 0 ? 1 : -1), 2);
      }
    }
  }

  /**
   * 手前のプールサイド。
   * 以前はただの黒い帯だった。ビート板の山とベンチを置くと、
   * **カメラがプールサイドに立っている**ように見えて奥行きが出る。
   */
  private buildForeground(): void {
    const g = this.add.graphics().setDepth(-50);
    const top = this.waterTop + this.waterH;

    // 手前のデッキ
    g.fillStyle(COLORS.deck, 1);
    g.fillRect(0, top, GAME_WIDTH, GAME_HEIGHT - top);
    g.fillStyle(0xd9cdae, 1);
    for (let x = 0; x < GAME_WIDTH; x += 26) g.fillRect(x, top, 1, GAME_HEIGHT - top);
    // 水ぎわの縁石と濡れ
    g.fillStyle(0xf4f7f9, 1);
    g.fillRect(0, top, GAME_WIDTH, 6);
    g.fillStyle(0xc9bda0, 0.55);
    g.fillRect(0, top + 6, GAME_WIDTH, 7);

    // ビート板の山（左）
    for (let i = 0; i < 5; i++) {
      const c = [0xf5b041, 0x5dade2, 0xec7063, 0x58d68d, 0xaf7ac5][i];
      g.fillStyle(c, 1);
      g.fillRoundedRect(22 + i * 2, top + 30 - i * 7, 54, 9, 4);
      g.fillStyle(0x000000, 0.12);
      g.fillRect(22 + i * 2, top + 36 - i * 7, 54, 3);
    }
    // ベンチ（右）
    g.fillStyle(0x8d6e4f, 1);
    g.fillRoundedRect(GAME_WIDTH - 150, top + 16, 120, 10, 4);
    g.fillStyle(0x6f563c, 1);
    g.fillRect(GAME_WIDTH - 140, top + 26, 8, 16);
    g.fillRect(GAME_WIDTH - 48, top + 26, 8, 16);
    // 床の影（物の下に落とす）
    g.fillStyle(0x000000, 0.1);
    g.fillEllipse(GAME_WIDTH - 90, top + 44, 130, 10);
    g.fillEllipse(52, top + 36, 76, 9);
  }

  /**
   * 水面（毎フレーム）。
   *   ① 深さのグラデーション（奥が深い）
   *   ② 底のレーンライン（T字）… プールらしさはほぼこれで決まる
   *   ③ レーンロープ（浮き玉＋影）
   *   ④ 波のうねりと、きらめき
   */
  private drawWater(t: number): void {
    const g = this.waterG;
    g.clear();
    const top = this.waterTop;
    const h = this.waterH;

    // ① 深さ
    g.fillGradientStyle(COLORS.poolWaterDeep, COLORS.poolWaterDeep, COLORS.poolWaterAlt, COLORS.poolWaterAlt, 1);
    g.fillRect(0, top, GAME_WIDTH, h);
    // 壁ぎわの影
    g.fillStyle(0x1d6f9b, 0.45);
    g.fillRect(0, top, GAME_WIDTH, 8);

    // ② 底のレーンライン（T字）。少し揺らして水越しに見えているように
    for (let i = 0; i < 5; i++) {
      const y = top + 26 + i * LANE_GAP + Math.sin(t * 1.1 + i) * 1.2;
      g.fillStyle(0x0f5f8c, 0.32);
      g.fillRect(0, y - 1.5, GAME_WIDTH, 3);
      // 両端のT字
      g.fillRect(26, y - 9, 3, 18);
      g.fillRect(GAME_WIDTH - 29, y - 9, 3, 18);
    }

    // ③ レーンロープ（浮き玉。下に落ちる影で水面に浮いて見える）
    for (let i = 0; i <= 5; i++) {
      const y = top + 9 + i * LANE_GAP + Math.sin(t * 1.6 + i * 0.8) * 1.4;
      let toggle = 0;
      for (let x = 4; x < GAME_WIDTH; x += 11) {
        g.fillStyle(0x0d4f74, 0.25);
        g.fillCircle(x, y + 3, 2.6);
        g.fillStyle(toggle % 4 < 2 ? 0xe74c3c : 0xf4f6f7, 1);
        g.fillCircle(x, y, 2.8);
        toggle++;
      }
    }

    // ④ うねり（横に長い明るい帯）
    for (let i = 0; i < 7; i++) {
      const y = top + 14 + ((i * 41) % (h - 20));
      const off = Math.sin(t * 0.9 + i * 1.3) * 22;
      g.fillStyle(0xffffff, 0.05);
      g.fillRect(off, y, GAME_WIDTH * 0.7, 3);
    }
    // きらめき
    for (let i = 0; i < 30; i++) {
      const x = ((i * 97) % GAME_WIDTH) + Math.sin(t * 1.4 + i) * 6;
      const y = top + 16 + ((i * 53) % (h - 26));
      const a = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.2 + i));
      g.lineStyle(2, 0xffffff, a);
      g.lineBetween(x, y, x + 12, y);
    }
  }

  // ---------------------------------------------------------------- タイトル / メニュー

  private buildTitle(): void {
    const cx = GAME_WIDTH / 2;

    /**
     * 題字の下敷き。
     * **すりガラスの板**に見えるよう、影 → 板 → 上端のハイライト の3枚を重ねる。
     * 1枚のべた塗りだと、空の上に四角い色が乗っているだけに見える。
     */
    const plate = this.add.graphics().setDepth(-60);
    plate.fillStyle(0x08243c, 0.22);
    plate.fillRoundedRect(cx - 228, 202, 456, 104, 20); // 影（少し下にずらす）
    plate.fillStyle(0x0d2740, 0.42);
    // サブタイトルを外したので、題字1行ぶんの高さ（104）にしてある
    plate.fillRoundedRect(cx - 232, 196, 464, 104, 20);
    plate.fillStyle(0xffffff, 0.12);
    plate.fillRoundedRect(cx - 232, 196, 464, 40, 20); // 上端のハイライト
    plate.lineStyle(2, 0x9fd8f0, 0.35);
    plate.strokeRoundedRect(cx - 232, 196, 464, 104, 20);

    const title = this.add
      .text(cx, 248, TITLE, {
        fontFamily: "sans-serif",
        fontSize: "40px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#144063",
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    // 影を落として板から浮かせる（縁取りだけだと板に貼り付いて見える）
    title.setShadow(0, 4, "#0a2136", 8, false, true);

    // サブタイトル（「めざせ、オリンピックの金メダル」）は 2026-09-27 に外した

    // ゆらゆら動くメダル（タイトル文字とぶつからない位置に）
    const medal = this.add.container(cx + 206, 296).setDepth(-55);
    const mg = this.add.graphics();
    mg.fillStyle(0xf1c40f, 1);
    mg.fillCircle(0, 0, 22);
    mg.fillStyle(0xf9e79f, 1);
    mg.fillCircle(0, 0, 15);
    mg.fillStyle(0xd68910, 1);
    mg.fillRect(-4, -34, 8, 14);
    medal.add(mg);
    this.tweens.add({ targets: medal, angle: 8, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  private buildMenu(): void {
    const cx = GAME_WIDTH / 2;
    const bw = 300;
    const bh = 62;

    new Button(this, cx, 700, bw, bh, "はじめる", () => this.onStart(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 22,
    });

    this.continueBtn = new Button(this, cx, 776, bw, bh, "つづきから", () => this.onContinue(), {
      color: 0x2c5f8f,
      hoverColor: 0x3d78b0,
      fontSize: 22,
    });

    new Button(this, cx, 852, bw, 50, "設定", () => this.onSettings(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 18,
    });

    this.add
      .text(GAME_WIDTH - 12, GAME_HEIGHT - 10, VERSION, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#6b8296",
      })
      .setOrigin(1, 1);
  }

  private onStart(): void {
    if (this.busy) return;
    this.busy = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Slot"));
  }

  /**
   * つづきから。
   *
   * 以前は「いちばん新しい枠」へ直接入っていたので、**どのデータで続けるか選べなかった**。
   * 枠は3つあるので、必ずデータ選択画面を通す（そこで使用中の枠を選べば続きから始まる）。
   */
  private onContinue(): void {
    if (this.busy) return;
    this.busy = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Slot"));
  }

  private onSettings(): void {
    this.settings?.destroy();
    this.settings = new SettingsModal(this, {
      onClose: () => {
        this.settings?.destroy();
        this.settings = undefined;
      },
    });
  }
}
