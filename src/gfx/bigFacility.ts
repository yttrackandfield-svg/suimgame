import type Phaser from "phaser";
import { OUTLINE, box, darken, disc, lighten, outlineRect, part, shadow } from "./furniture";
import { fill, floorQuad, onTop, slab, stroke, wallQuad, type Pt } from "./roomFurniture";

/**
 * 大型施設（◆100万）の什器。
 *
 *   大型プール         … 観客席・電光掲示板・バックストロークフラッグ・表彰台・中継カメラ
 *   医科学センター     … 流水プール・体組成スキャナ・分析台・モーションキャプチャ・モニタウォール
 *   高地トレーニング棟 … 低酸素ポッド・低酸素トレッドミル・酸素濃度の制御盤・ボンベ・マスク掛け
 *
 * 【描き分けの決めごと】
 * 他の部屋の什器（木・布・ステンレス）と**質感で切り離す**ために、ここでは3つの素材だけを使う：
 *   ・ダークガラス（GLASS）… 機器の筐体。館内でいちばん暗いトーン
 *   ・白い樹脂（SHELL）  … 医療機器の外装。いちばん明るいトーン
 *   ・シアンの発光（GLOW）… 画面・LED・水。**ここだけ彩度を上げる**
 * 「暗い筐体の上でシアンが光っている」形にすると、木目とタオルの館内から
 * ひと目で浮いて見える＝最新の設備だと分かる。
 *
 * 光の向きは他のモジュールと同じ「左上から」。接地影（shadow）を必ず先に敷く。
 */

type G = Phaser.GameObjects.Graphics;

/** ダークガラス（機器の筐体）。 */
const GLASS = 0x2b3646;
/** 白い樹脂（医療機器の外装）。 */
const SHELL = 0xeef3f8;
const SHELL_SIDE = 0xc3cedb;
/** シアンの発光（画面・LED・水）。ここだけ彩度を上げる。 */
const GLOW = 0x5fe8ff;
const GLOW_DEEP = 0x1fa6c8;
/** 金属（フレーム・支柱）。 */
const METAL = 0x8d99a8;

export const BIG_FACILITY_KEYS = [
  // 大型プール
  "fnStandSeats0",
  "fnStandSeats1",
  "fnStandSeats2",
  "fnStandSeats3",
  "fnScoreboard",
  "fnPoolFlags",
  "fnPodium",
  "fnGlassRail",
  "fnBroadcastCam",
  // 医科学センター
  "fnFlumeTank",
  "fnBodyScanner",
  "fnLabBench",
  "fnMotionCam",
  "fnMonitorWall",
  "fnCentrifuge",
  "fnIceBath",
  "fnForcePlate",
  "fnServerRack",
  // 高地トレーニング棟
  "fnHypoxicPod",
  "fnAltTread",
  "fnO2Console",
  "fnGasTanks",
  "fnMaskRack",
  // アスリート寮
  "fnSleepPod",
  "fnDormScreen",
  "fnDormSofa",
  "fnDormTable",
  "fnStudyBooth",
  "fnLaundry",
  "fnDormKitchen",
  "fnDormPlanterBox",
] as const;

/** 寮の木部（暖かみを出す側。機器のダークガラスと対にする）。 */
const WOOD = 0xb08654;
const WOOD_TOP = 0xd6ab74;
const WOOD_DARK = 0x8a6438;

/** 光る面（画面・LED）。暗い枠→本体→上の照り、の順で重ねて「発光している」ように見せる。 */
function glowRect(g: G, x: number, y: number, w: number, h: number, color = GLOW): void {
  g.fillStyle(darken(color, 0.55), 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(color, 1);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(0xffffff, 0.45);
  g.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.28));
  outlineRect(g, x, y, w, h, 0, 0.8);
}

export function createBigFacilityTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key: string, w: number, h: number): void => {
    g.generateTexture(key, w, h);
    g.clear();
  };

  // ================================================================ 大型プール

  /**
   * 【観客席】1マスぶんの座席の列（120×72、足元が下端）。
   *
   * コンクリートの段の上に、はね上げ式の座席を3脚。座席は背もたれを立てて
   * **手前を向かせる**（プールは手前にあるので、客はこちらを向いて座っている）。
   * 段の側面を描いておくと、床（ROOM_STYLE.stand の市松）とつながって
   * 「段がひな壇に積み上がっている」ように見える。
   */
  const SEAT_TIERS = [
    { seat: 0x2e6fb8, top: 0x4a8fd8 }, // 青
    { seat: 0xb8442e, top: 0xd86a4a }, // 赤
    { seat: 0x2e6fb8, top: 0x4a8fd8 },
    { seat: 0xb8442e, top: 0xd86a4a },
  ];
  /** 1段ぶんの高さ（px）。奥の列ほどこれだけ持ち上げて、ひな壇に見せる。 */
  const TIER_RISE = 9;
  SEAT_TIERS.forEach(({ seat, top: seatTop }, tier) => {
    // 奥の列ほど高い段の上にある。段の側面（elev）を伸ばして「せり上がり」を出す。
    const elev = 6 + tier * TIER_RISE;
    const baseY = 64;
    fill(g, floorQuad(61, baseY + 2, 0.5, 0.24), 0x000000, 0.18); // 段の影
    const t = slab(g, floorQuad(60, baseY, 0.46, 0.2), elev, 7, 0xaab5c0, 0x8b96a2, 0x79848f);
    for (let i = 0; i < 3; i++) {
      const p = onTop(t, 0.18 + i * 0.32, 0.42);
      const st = slab(g, floorQuad(p.x, p.y, 0.1, 0.1), 5, 4, seatTop, darken(seat, 0.82), darken(seat, 0.66));
      const b = onTop(st, 0.5, 0.05); // 背もたれ（手前向きに立てる）
      g.fillStyle(seat, 1);
      g.fillRoundedRect(b.x - 8, b.y - 14, 16, 15, 3);
      g.fillStyle(seatTop, 1);
      g.fillRoundedRect(b.x - 6.5, b.y - 12.5, 13, 8, 2);
      outlineRect(g, b.x - 8, b.y - 14, 16, 15, 3, 0.85);
      g.fillStyle(0x5d6874, 1); // 脚
      g.fillRect(p.x - 1.2, p.y - 5, 2.4, 5);
    }
    make(`fnStandSeats${tier}`, 120, 96);
  });

  /**
   * 【電光掲示板】観客席のいちばん奥の壁ぎわに立つ大型スコアボード（240×300）。
   *
   * 【2026-09-26 に描き直した】以前は板を2本の細い支柱で観客席の中に立てていたので、
   * 足元が座席に隠れて「観客席に倒れ込んでいる」ように見えた。いまは
   *   ・板を**奥の壁の面に沿わせて**（壁の傾き＝wallQuad）据え付ける
   *   ・床まで届く**鉄骨の柱2本と筋交い**、足元のベースプレートで支える
   *   ・上に照明のバー、左右にスピーカー
   * の形にして、壁ぎわにしっかり立っている大型設備に見せる。
   * 脚は長めにして板を座席より高く上げる（脚が座席に隠れると、支えが見えずに浮いて見える）。
   * 接地は「壁ぎわの床の線」の真ん中（x=120, y=238）＝ originY 238/300。
   */
  {
    const S = 0.5; // 奥の壁の傾き（wallQuad と同じ）
    const floorAt = (x: number): number => 178 + x * S; // 壁ぎわの床の線
    const boardBottom = (x: number): number => 92 + x * S;
    // 鉄骨の柱（床まで）と筋交い。板の奥に立つので先に描く
    for (const x of [44, 196]) {
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(x + 2, floorAt(x) + 2, 26, 8);
      part(g, x - 6, boardBottom(x) - 6, 12, floorAt(x) - boardBottom(x) + 6, 0x5c6673, 1);
      g.fillStyle(0x8d99a8, 1);
      g.fillRect(x - 4, boardBottom(x) - 4, 3, floorAt(x) - boardBottom(x) + 2);
      part(g, x - 11, floorAt(x) - 4, 22, 6, 0x4a535e, 1); // ベースプレート
    }
    g.lineStyle(2.4, 0x6b7684, 1); // 筋交い（柱と柱のあいだに X）
    g.lineBetween(50, boardBottom(50) + 6, 190, floorAt(190) - 8);
    g.lineBetween(50, floorAt(50) - 8, 190, boardBottom(190) + 6);
    g.lineStyle(1, OUTLINE, 0.6);
    g.lineBetween(50, boardBottom(50) + 6, 190, floorAt(190) - 8);
    g.lineBetween(50, floorAt(50) - 8, 190, boardBottom(190) + 6);
    // 板の筐体（壁の面）
    const frame = wallQuad(6, 234, 6, 96);
    fill(g, frame, GLASS);
    stroke(g, frame, 0.95, 1.6);
    fill(g, wallQuad(12, 228, 12, 90), 0x161d26);
    // ヘッダの帯（大会名のつもり）
    fill(g, wallQuad(16, 224, 15, 25), darken(0xffd166, 0.55));
    fill(g, wallQuad(17, 223, 16, 24), 0xffd166);
    fill(g, wallQuad(17, 223, 16, 18.5), 0xfff1c4);
    // 8行：レーン・順位・名前・タイム（文字は描かない＝点の並びで掲示板だと伝える）
    for (let i = 0; i < 8; i++) {
      const top = 29 + i * 7.4;
      const cells: [number, number, number][] = [
        [18, 30, GLOW],
        [34, 46, i === 0 ? 0xffd166 : GLOW_DEEP],
        [52, 150, GLOW_DEEP],
        [158, 222, i === 0 ? GLOW : GLOW_DEEP],
      ];
      for (const [x0, x1, c] of cells) {
        fill(g, wallQuad(x0, x1, top, top + 5), c);
        fill(g, wallQuad(x0 + 1, x1 - 1, top + 0.8, top + 2), lighten(c, 1.25));
      }
    }
    // 上の照明のバー（ランプ6灯）
    fill(g, wallQuad(20, 220, -2, 4), 0x3a4656);
    for (let i = 0; i < 6; i++) {
      const x = 32 + i * 35;
      g.fillStyle(0xfff6d8, 1);
      g.fillCircle(x, 1 + x * S, 2.6);
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(x, 1 + x * S, 5);
    }
    // 左右のスピーカー
    for (const x of [0, 228]) {
      fill(g, wallQuad(x, x + 12, 30, 70), 0x2b3646);
      g.fillStyle(0x161d26, 1);
      g.fillCircle(x + 6, 42 + (x + 6) * S, 3.4);
      g.fillCircle(x + 6, 58 + (x + 6) * S, 3.4);
    }
    g.fillStyle(0xffffff, 0.14); // 板の照り
    g.fillPoints(
      [
        { x: 14, y: 13 + 14 * S },
        { x: 120, y: 13 + 120 * S },
        { x: 120, y: 17 + 120 * S },
        { x: 14, y: 17 + 14 * S },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
    make("fnScoreboard", 240, 300);
  }

  /**
   * 【バックストロークフラッグ】水面の上に渡した三角旗（120×78、originY 0.5 で水の上に敷く）。
   * 国際大会の水面にはこれが必ず張ってあるので、1本あるだけで「競技用のプール」に見える。
   */
  {
    /**
     * 【マスの向きに合わせて傾ける】旗はレーンを**横切る**ので、
     * 部屋のローカル座標では gy の向き（画面では左下がり／右上がり）に張る。
     * 1マス進むと画面では右へ TILE_W/2＝60px・上へ TILE_H/2＝30px なので、
     * 120px 幅の絵では **60px ぶん上がる**のが正しい傾き。
     * ここを寝かせると、旗の列がレーンと平行に見えて「ただの飾り」になる。
     */
    const y0 = 62;
    const RISE = 60; // 120px 進むあいだに上がる量（＝1マスぶんの傾き）
    const at = (x: number): number => y0 - (x / 120) * RISE;
    g.lineStyle(2, 0xdfe6ec, 0.95);
    g.lineBetween(0, at(0), 120, at(120)); // ロープ
    const colors = [0xe74c3c, 0xf4d03f, 0x27ae60, 0x2e86de, 0xe74c3c, 0xf4d03f];
    colors.forEach((c, i) => {
      const x = 10 + i * 20;
      const y = at(x);
      const tri = [
        { x: x - 7, y: y + 3.5 },
        { x: x + 7, y: y - 3.5 },
        { x, y: y + 14 },
      ] as Phaser.Types.Math.Vector2Like[];
      g.fillStyle(c, 1);
      g.fillPoints(tri, true);
      g.lineStyle(1, OUTLINE, 0.65);
      g.strokePoints(tri, true);
    });
    make("fnPoolFlags", 120, 84);
  }

  /** 【表彰台】1-2-3 の台（96×62、足元が下端）。大会の日でなくても「勝つ場所」を思い出させる。 */
  {
    shadow(g, 48, 58, 44);
    box(g, 24, 56, 22, 11, 17, 0xe3e9ee, 0xbcc6d1, 0xa2adba); // 2位
    box(g, 72, 56, 22, 11, 12, 0xe3e9ee, 0xbcc6d1, 0xa2adba); // 3位
    box(g, 48, 54, 26, 12, 26, 0xf4f6f7, 0xc9d3dd, 0xaeb9c6); // 1位（中央・高い）
    g.fillStyle(0x2e86de, 1); // 台の番号帯
    g.fillRect(38, 33, 20, 3);
    g.fillRect(15, 43, 18, 3);
    g.fillRect(63, 48, 18, 3);
    make("fnPodium", 96, 62);
  }

  /**
   * 【ガラス手すり】観客席と水面の境に立てる（120×52、足元が下端）。
   * 透ける板なので、奥の観客席が隠れない。笠木だけを明るく描いて、水平の線を通す。
   */
  {
    /**
     * 手すりは観客席とプールの境＝**レーンと平行**に走るので、
     * 部屋のローカル座標では gx の向き（画面では右下がり）に張る。
     * 120px 進むあいだに 60px 下がるのが1マスぶんの傾き（旗とは逆向き）。
     */
    const H = 24; // 手すりの高さ
    const top = 10;
    const at = (x: number): number => top + (x / 120) * 60;
    const quad = [
      { x: 0, y: at(0) },
      { x: 120, y: at(120) },
      { x: 120, y: at(120) + H },
      { x: 0, y: at(0) + H },
    ] as Phaser.Types.Math.Vector2Like[];
    g.fillStyle(0xbfe4f2, 0.28); // 透けるガラス板
    g.fillPoints(quad, true);
    g.lineStyle(3, 0xdfe6ec, 1); // 笠木
    g.lineBetween(0, at(0), 120, at(120));
    g.lineStyle(1.4, 0x9fb0be, 0.85); // 下端
    g.lineBetween(0, at(0) + H, 120, at(120) + H);
    for (let i = 0; i <= 4; i++) {
      const x = i * 30;
      g.lineStyle(2, METAL, 1);
      g.lineBetween(x, at(x), x, at(x) + H);
    }
    make("fnGlassRail", 120, 96);
  }

  /** 【中継カメラ】三脚に載せた放送用カメラ（64×92、足元が下端）。大会の格を伝える小物。 */
  {
    shadow(g, 32, 88, 30);
    g.lineStyle(3, 0x4a535e, 1); // 三脚
    g.lineBetween(32, 60, 18, 86);
    g.lineBetween(32, 60, 46, 86);
    g.lineBetween(32, 60, 32, 88);
    part(g, 24, 50, 16, 12, 0x5c6673, 2); // 雲台
    part(g, 12, 24, 40, 26, GLASS, 4); // 本体
    g.fillStyle(0x161d26, 1); // レンズ
    g.fillCircle(50, 37, 9);
    g.fillStyle(GLOW_DEEP, 1);
    g.fillCircle(50, 37, 6);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(48, 35, 2.4);
    outlineRect(g, 12, 24, 40, 26, 4, 0.9);
    part(g, 20, 14, 12, 10, 0x2b3646, 2); // ビューファインダ
    g.fillStyle(0xe74c3c, 1); // 収録中のランプ
    g.fillCircle(46, 27, 2.6);
    make("fnBroadcastCam", 64, 92);
  }

  // ================================================================ 医科学センター

  /**
   * 【流水プール】その場で泳ぎ続けて、フォームを横から撮る装置（176×132、足元が下端）。
   *
   * この棟の主役。2026-09-26 に**ひと回り大きく描き直した**：
   *   ・水槽は白い樹脂の縁＋ガラスの側面。水は奥ほど深い青のグラデーション
   *   ・泳いでいる選手は描かない（測定に来た選手が、その時だけ本人の絵で入る）
   *   ・奥の端に流れを作るポンプの吹き出し口、水面に流れの筋と白波
   *   ・手前の側面は観察窓（水中カメラのレンズ付き）、手すりと制御パネル
   */
  {
    const cx = 88;
    const cy = 90;
    fill(g, floorQuad(cx + 2, cy + 4, 0.84, 0.46), 0x000000, 0.22); // 接地影
    const t = slab(g, floorQuad(cx, cy, 0.8, 0.42), 20, 12, SHELL, SHELL_SIDE, darken(SHELL_SIDE, 0.84));
    // 水面（縁の内側）。奥→手前で明るくして、深さを出す
    const inner = [onTop(t, 0.06, 0.12), onTop(t, 0.94, 0.12), onTop(t, 0.94, 0.88), onTop(t, 0.06, 0.88)];
    fill(g, inner, 0x0f6f93);
    const mid1 = [onTop(t, 0.06, 0.4), onTop(t, 0.94, 0.4), onTop(t, 0.94, 0.88), onTop(t, 0.06, 0.88)];
    fill(g, mid1, GLOW_DEEP);
    const mid2 = [onTop(t, 0.06, 0.7), onTop(t, 0.94, 0.7), onTop(t, 0.94, 0.88), onTop(t, 0.06, 0.88)];
    fill(g, mid2, 0x3fc6e6);
    stroke(g, inner, 0.7, 1);
    // 流れの筋（奥の吹き出し口から手前へ）と白波
    g.lineStyle(1.6, 0xbdf0ff, 0.7);
    for (let i = 0; i < 4; i++) {
      const v = 0.22 + i * 0.19;
      const a = onTop(t, 0.12, v);
      const b = onTop(t, 0.36, v);
      g.lineBetween(a.x, a.y, b.x, b.y);
      const c = onTop(t, 0.7, v);
      const d = onTop(t, 0.9, v);
      g.lineBetween(c.x, c.y, d.x, d.y);
    }
    // ポンプの吹き出し口（頭側＝左奥の壁）
    for (let i = 0; i < 3; i++) {
      const p = onTop(t, 0.07, 0.3 + i * 0.2);
      g.fillStyle(0x16202b, 1);
      g.fillEllipse(p.x, p.y, 7, 5);
      g.fillStyle(GLOW, 0.9);
      g.fillEllipse(p.x, p.y, 4, 2.6);
    }
    // 【泳いでいる選手は描かない】（2026-09-26）
    // 絵に描き込むと、誰も使っていないのに「いつも誰かが泳いでいる」装置に見えた。
    // 測定に来た選手が、その時だけ本人の絵で水槽に入る（→ FacilityScene.scienceStopFor / Person の flume）。
    // 手前の側面：観察窓と水中カメラ
    const w0 = onTop(t, 0.16, 1);
    const w1 = onTop(t, 0.84, 1);
    g.fillStyle(0x0f2836, 1);
    g.fillPoints(
      [
        { x: w0.x, y: w0.y + 3 },
        { x: w1.x, y: w1.y + 3 },
        { x: w1.x, y: w1.y + 16 },
        { x: w0.x, y: w0.y + 16 },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
    g.fillStyle(GLOW_DEEP, 0.8);
    g.fillPoints(
      [
        { x: w0.x + 2, y: w0.y + 4.5 },
        { x: w1.x - 2, y: w1.y + 4.5 },
        { x: w1.x - 2, y: w1.y + 14.5 },
        { x: w0.x + 2, y: w0.y + 14.5 },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
    g.fillStyle(0xffffff, 0.3); // ガラスの照り
    g.fillPoints(
      [
        { x: w0.x + 6, y: w0.y + 5 },
        { x: w0.x + 16, y: w0.y + 5 + (w1.y - w0.y) * 0.15 },
        { x: w0.x + 10, y: w0.y + 14 + (w1.y - w0.y) * 0.1 },
        { x: w0.x + 2, y: w0.y + 14 },
      ] as Phaser.Types.Math.Vector2Like[],
      true,
    );
    const lens = onTop(t, 0.5, 1);
    disc(g, lens.x, lens.y + 9.5, 3.6, 0x16202b, GLOW);
    // 手すり（右手前の辺ぞい）
    g.lineStyle(2, METAL, 1);
    const r0 = onTop(t, 0.2, 0.02);
    const r1 = onTop(t, 0.8, 0.02);
    g.lineBetween(r0.x, r0.y - 12, r1.x, r1.y - 12);
    for (const u of [0.2, 0.5, 0.8]) {
      const q = onTop(t, u, 0.02);
      g.lineBetween(q.x, q.y, q.x, q.y - 12);
    }
    // 制御パネル（手前の角）
    const c = onTop(t, 0.98, 0.3);
    part(g, c.x - 11, c.y - 32, 22, 28, GLASS, 3);
    glowRect(g, c.x - 8, c.y - 29, 16, 10);
    g.fillStyle(0x7dff9b, 1);
    g.fillCircle(c.x - 4, c.y - 13, 1.8);
    g.fillStyle(0xffd166, 1);
    g.fillCircle(c.x + 1, c.y - 13, 1.8);
    g.fillStyle(0xff6b6b, 1);
    g.fillCircle(c.x + 6, c.y - 13, 1.8);
    make("fnFlumeTank", 176, 132);
  }

  /**
   * 【アイスバス】練習後に脚を冷やす冷水槽（104×84、足元が下端）。
   * 白い樹脂の浴槽に薄い水色の水と氷のかけら。温浴（木とタオル）とは質感で分ける。
   */
  {
    fill(g, floorQuad(53, 66, 0.4, 0.26), 0x000000, 0.2);
    const t = slab(g, floorQuad(52, 62, 0.36, 0.22), 6, 16, SHELL, SHELL_SIDE, darken(SHELL_SIDE, 0.84));
    const water = [onTop(t, 0.1, 0.16), onTop(t, 0.9, 0.16), onTop(t, 0.9, 0.84), onTop(t, 0.1, 0.84)];
    fill(g, water, 0xbfefff);
    stroke(g, water, 0.6, 1);
    for (let i = 0; i < 7; i++) {
      const p = onTop(t, 0.2 + (i % 4) * 0.2, 0.3 + Math.floor(i / 4) * 0.35);
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(p.x - 2.5, p.y - 2, 5, 4);
      g.lineStyle(0.8, 0x7fb8d0, 0.9);
      g.strokeRect(p.x - 2.5, p.y - 2, 5, 4);
    }
    const th = onTop(t, 0.95, 0.2); // 水温計（2℃）
    part(g, th.x - 7, th.y - 22, 14, 14, GLASS, 2);
    glowRect(g, th.x - 5, th.y - 20, 10, 6, 0x9be7ff);
    make("fnIceBath", 104, 84);
  }

  /**
   * 【フォースプレート付きスタート台】蹴る力を測る台（72×88、足元が下端）。
   * 台の上面に計測板（シアンの格子）、横からケーブルが床へ落ちている。
   */
  {
    fill(g, floorQuad(37, 72, 0.22, 0.2), 0x000000, 0.2);
    const t = slab(g, floorQuad(36, 70, 0.2, 0.18), 14, 8, 0xf4f6f7, 0xc9d1d8, 0xaeb8c1);
    const plate = [onTop(t, 0.12, 0.12), onTop(t, 0.88, 0.12), onTop(t, 0.88, 0.88), onTop(t, 0.12, 0.88)];
    fill(g, plate, GLASS);
    g.lineStyle(1, GLOW, 0.9);
    for (const u of [0.35, 0.65]) {
      const a = onTop(t, u, 0.14);
      const b = onTop(t, u, 0.86);
      g.lineBetween(a.x, a.y, b.x, b.y);
      const c = onTop(t, 0.14, u);
      const d = onTop(t, 0.86, u);
      g.lineBetween(c.x, c.y, d.x, d.y);
    }
    stroke(g, plate, 0.8, 1);
    const k = onTop(t, 0.9, 0.9); // ケーブル
    g.lineStyle(1.6, 0x2b3646, 1);
    g.lineBetween(k.x, k.y + 4, k.x + 8, k.y + 18);
    g.lineBetween(k.x + 8, k.y + 18, k.x + 20, k.y + 16);
    const sensor = onTop(t, 0.5, 0.0); // 台の奥の表示灯
    part(g, sensor.x - 8, sensor.y - 16, 16, 10, GLASS, 2);
    glowRect(g, sensor.x - 6, sensor.y - 14, 12, 6, 0x7dff9b);
    make("fnForcePlate", 72, 88);
  }

  /**
   * 【解析サーバのラック】背の高い黒い棚に LED が並ぶ（56×110、足元が下端）。
   * 部屋の隅に立てると「データを溜めて分析している棟」だと伝わる。
   */
  {
    shadow(g, 28, 104, 30);
    box(g, 28, 102, 36, 18, 86, 0x3a4656, GLASS, 0x222c38);
    for (let i = 0; i < 8; i++) {
      const y = 28 + i * 9;
      g.fillStyle(0x151c25, 1);
      g.fillRect(12, y, 15, 6);
      g.fillStyle(i % 3 === 0 ? 0x7dff9b : GLOW, 0.95);
      g.fillRect(14, y + 2, 2, 2);
      g.fillRect(18, y + 2, 2, 2);
      g.fillStyle(0xffd166, i % 4 === 1 ? 1 : 0.35);
      g.fillRect(22, y + 2, 2, 2);
    }
    make("fnServerRack", 56, 110);
  }

  /**
   * 【体組成スキャナ】寝台と、その上を走るリング状のスキャナ（100×98、足元が下端）。
   * 病院の CT のような形にすると、ひと目で「測る機械」だと伝わる。
   */
  {
    shadow(g, 50, 94, 44);
    slab(g, floorQuad(50, 78, 0.34, 0.14), 16, 6, SHELL, SHELL_SIDE, darken(SHELL_SIDE, 0.85)); // 寝台
    g.fillStyle(0x9fb0be, 1); // 台座
    g.fillRect(46, 78, 8, 14);
    outlineRect(g, 46, 78, 8, 14, 0, 0.7);
    // リング（ガントリ）
    g.fillStyle(SHELL, 1);
    g.fillCircle(50, 44, 30);
    g.lineStyle(1.4, OUTLINE, 0.9);
    g.strokeCircle(50, 44, 30);
    g.fillStyle(SHELL_SIDE, 1);
    g.fillCircle(50, 44, 22);
    g.fillStyle(0x16202b, 1);
    g.fillCircle(50, 44, 16);
    g.fillStyle(GLOW_DEEP, 0.85);
    g.fillCircle(50, 44, 13);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(44, 38, 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2; // リングの LED
      g.fillStyle(GLOW, 0.9);
      g.fillCircle(50 + Math.cos(a) * 26, 44 + Math.sin(a) * 26, 1.8);
    }
    make("fnBodyScanner", 100, 98);
  }

  /** 【分析台】測定機器が並ぶ長机（136×86、足元が下端）。端末3台と試料のラックを載せる。 */
  {
    fill(g, floorQuad(69, 64, 0.54, 0.22), 0x000000, 0.18);
    const t = slab(g, floorQuad(68, 62, 0.5, 0.18), 24, 6, SHELL, SHELL_SIDE, darken(SHELL_SIDE, 0.85));
    g.fillStyle(0x9fb0be, 1); // 脚
    for (const u of [0.08, 0.92]) {
      const p = onTop(t, u, 0.72);
      g.fillRect(p.x - 2, p.y, 4, 24);
    }
    for (let i = 0; i < 3; i++) {
      const p = onTop(t, 0.18 + i * 0.32, 0.4); // 端末
      part(g, p.x - 11, p.y - 19, 22, 16, GLASS, 2);
      glowRect(g, p.x - 9, p.y - 17, 18, 12);
      g.fillStyle(0x9fb0be, 1);
      g.fillRect(p.x - 4, p.y - 3, 8, 3);
    }
    const r = onTop(t, 0.93, 0.35); // 試料のラック（右端）
    part(g, r.x - 7, r.y - 12, 14, 12, 0xd6e2ec, 2);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(i === 1 ? 0xe74c3c : 0xf4d03f, 1);
      g.fillRect(r.x - 5 + i * 4, r.y - 10, 2.4, 8);
    }
    make("fnLabBench", 136, 86);
  }

  /**
   * 【モーションキャプチャ】三脚のカメラ（48×86、足元が下端）。
   * レンズのまわりに赤外 LED の輪を描くのが、この機材の記号。
   */
  {
    shadow(g, 24, 82, 22);
    g.lineStyle(2.4, 0x5c6673, 1);
    g.lineBetween(24, 54, 13, 80);
    g.lineBetween(24, 54, 35, 80);
    g.lineBetween(24, 54, 24, 82);
    part(g, 8, 28, 32, 24, GLASS, 4);
    g.fillStyle(0x161d26, 1);
    g.fillCircle(24, 40, 9);
    g.fillStyle(GLOW_DEEP, 1);
    g.fillCircle(24, 40, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.fillStyle(0xff6b6b, 0.9);
      g.fillCircle(24 + Math.cos(a) * 12, 40 + Math.sin(a) * 9, 1.4);
    }
    outlineRect(g, 8, 28, 32, 24, 4, 0.9);
    make("fnMotionCam", 48, 86);
  }

  /**
   * 【モニタウォール】奥の壁に掛ける解析画面の壁（150×86。壁の傾きに倒してある／originY 0.82）。
   * 泳ぎの波形が6面に流れているつもり。1面だけ明るくして、視線の止まる所を作る。
   */
  {
    const frame = wallQuad(6, 144, 8, 64);
    fill(g, frame, GLASS);
    stroke(g, frame, 0.95, 1.4);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x0 = 12 + c * 45;
        const x1 = x0 + 41;
        const top = 13 + r * 27;
        const q = wallQuad(x0, x1, top, top + 22);
        fill(g, q, 0x0f1a24);
        fill(g, wallQuad(x0 + 1.5, x1 - 1.5, top + 1.5, top + 20.5), r === 0 && c === 1 ? GLOW_DEEP : darken(GLOW_DEEP, 0.55));
        g.lineStyle(1.4, GLOW, 0.95); // 波形（壁の傾きぶんを足して描く）
        let prev: Pt | null = null;
        for (let i = 0; i <= 8; i++) {
          const x = x0 + 3 + (i * (x1 - x0 - 6)) / 8;
          const y = top + 11 + Math.sin(i * 1.1 + c * 2 + r) * 6 + x * 0.5;
          if (prev) g.lineBetween(prev.x, prev.y, x, y);
          prev = { x, y };
        }
        stroke(g, q, 0.6, 1);
      }
    }
    make("fnMonitorWall", 150, 86);
  }

  /** 【遠心分離機のラック】血液・乳酸を測る小型機器の棚（60×80、足元が下端）。 */
  {
    shadow(g, 30, 76, 26);
    part(g, 8, 20, 44, 56, SHELL, 3);
    for (let i = 0; i < 3; i++) {
      const y = 26 + i * 17;
      part(g, 12, y, 36, 13, 0xd6e2ec, 2);
      glowRect(g, 15, y + 3, 12, 7);
      g.fillStyle(0x5c6673, 1);
      g.fillCircle(40, y + 6.5, 3.2);
    }
    outlineRect(g, 8, 20, 44, 56, 3, 0.9);
    make("fnCentrifuge", 60, 80);
  }

  // ================================================================ 高地トレーニング棟

  /**
   * 【低酸素ポッド】1人ぶんの与圧カプセル（110×104、足元が下端）。
   * 透明のフタと、中のシアンの照明。この棟の主役なので、いちばん大きく描く。
   */
  {
    shadow(g, 55, 100, 52);
    box(g, 55, 96, 78, 26, 16, 0x4a5563, 0x333d49, 0x2a333e); // 台座
    g.fillStyle(0x1d2733, 1); // カプセル本体
    g.fillRoundedRect(10, 46, 90, 34, 16);
    g.fillStyle(GLOW_DEEP, 0.9); // 中の照明
    g.fillRoundedRect(15, 51, 80, 24, 12);
    g.fillStyle(0xbdf0ff, 0.45);
    g.fillRoundedRect(20, 54, 40, 8, 4);
    const lid = [
      { x: 16, y: 48 },
      { x: 96, y: 40 },
      { x: 92, y: 12 },
      { x: 24, y: 18 },
    ] as Phaser.Types.Math.Vector2Like[];
    g.fillStyle(0x8fd8ee, 0.34); // 透明のフタ（開いて立っている）
    g.fillPoints(lid, true);
    g.lineStyle(2, 0xdfe6ec, 0.95);
    g.strokePoints(lid, true);
    outlineRect(g, 10, 46, 90, 34, 16, 0.95);
    glowRect(g, 70, 84, 26, 9, GLOW); // 酸素濃度の表示
    make("fnHypoxicPod", 110, 104);
  }

  /** 【低酸素トレッドミル】天井からマスクのホースが下りたランニングマシン（92×92、足元が下端）。 */
  {
    shadow(g, 46, 88, 40);
    const t = slab(g, floorQuad(46, 74, 0.3, 0.16), 8, 6, 0x232c38, 0x18202a, 0x131922); // ベルト
    g.lineStyle(1, 0x3d4a5a, 0.9);
    for (let i = 1; i < 5; i++) {
      const a = onTop(t, i / 5, 0);
      const b = onTop(t, i / 5, 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    part(g, 30, 22, 6, 46, METAL, 2); // 支柱
    part(g, 56, 22, 6, 46, METAL, 2);
    part(g, 24, 8, 44, 20, GLASS, 3); // コンソール
    glowRect(g, 28, 12, 36, 12);
    g.lineStyle(3, 0x7f8c9a, 1); // マスクのホース
    g.beginPath();
    g.moveTo(80, 0);
    g.lineTo(80, 18);
    g.lineTo(68, 30);
    g.strokePath();
    part(g, 62, 28, 14, 10, SHELL, 4); // マスク
    g.fillStyle(GLOW, 0.8);
    g.fillRect(65, 31, 8, 3);
    make("fnAltTread", 92, 92);
  }

  /** 【酸素濃度の制御盤】壁ぎわに立つ制御盤（76×94、足元が下端）。棟の「頭脳」。 */
  {
    shadow(g, 38, 90, 32);
    part(g, 10, 10, 56, 80, GLASS, 4);
    glowRect(g, 15, 15, 46, 22); // 大きな数字の画面
    for (let i = 0; i < 5; i++) {
      const h = 6 + ((i * 13) % 17); // 目盛りの棒グラフ
      glowRect(g, 16 + i * 9, 58 - h, 6, h, i === 2 ? 0xffd166 : GLOW_DEEP);
    }
    for (let i = 0; i < 3; i++) disc(g, 20 + i * 14, 70, 4.5, METAL, 0xdfe6ec); // つまみ
    g.fillStyle(0x27ae60, 1); // 状態ランプ
    g.fillCircle(58, 70, 3);
    g.fillStyle(0xe74c3c, 1);
    g.fillCircle(58, 80, 3);
    outlineRect(g, 10, 10, 56, 80, 4, 0.95);
    make("fnO2Console", 76, 94);
  }

  /** 【ガスボンベ】窒素・酸素のボンベを立てた架台（62×86、足元が下端）。 */
  {
    shadow(g, 31, 82, 28);
    const tank = (x: number, color: number): void => {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, 22, 16, 56, 7);
      g.fillStyle(lighten(color, 1.35), 1);
      g.fillRoundedRect(x + 2, 24, 5, 50, 3);
      outlineRect(g, x, 22, 16, 56, 7, 0.9);
      g.fillStyle(METAL, 1); // バルブ
      g.fillRect(x + 5, 15, 6, 8);
      g.fillStyle(0xdfe6ec, 1);
      g.fillCircle(x + 8, 14, 3.4);
      outlineRect(g, x + 5, 15, 6, 8, 0, 0.7);
    };
    tank(6, 0x2f6f8f);
    tank(24, 0x3f8f6f);
    tank(42, 0x7a6f2f);
    g.lineStyle(2.4, 0x5c6673, 1); // 転倒防止のチェーン
    g.lineBetween(4, 40, 60, 40);
    make("fnGasTanks", 62, 86);
  }

  /** 【マスク掛け】低酸素マスクを吊るす壁のラック（70×74、足元が下端）。 */
  {
    shadow(g, 35, 70, 28);
    part(g, 6, 14, 58, 8, METAL, 2); // バー
    for (let i = 0; i < 3; i++) {
      const x = 15 + i * 20;
      g.lineStyle(2, 0x7f8c9a, 1);
      g.lineBetween(x, 22, x, 32);
      part(g, x - 8, 32, 16, 12, SHELL, 5);
      g.fillStyle(GLOW_DEEP, 0.75);
      g.fillRect(x - 5, 35, 10, 4);
      g.lineStyle(2, 0x7f8c9a, 0.9); // ホース
      g.beginPath();
      g.moveTo(x, 44);
      g.lineTo(x - 4, 54);
      g.lineTo(x + 3, 62);
      g.strokePath();
    }
    make("fnMaskRack", 70, 74);
  }

  // ================================================================ アスリート寮

  /**
   * 【スリープポッド】2段のカプセル型ベッド（120×132、足元が下端）。
   *
   * 寮を「4人部屋にベッドを並べた絵」から、選手村のポッドに描き替えたもの。
   * 木の躯体に開口を穿ち、奥を暗く落として、縁に**間接照明の線**を1本入れる。
   * この「暗い奥 ＋ 縁の光」が今どきの宿泊施設の見え方で、遠目にも寝床だと分かる。
   */
  {
    shadow(g, 60, 128, 64);
    box(g, 60, 124, 92, 30, 104, WOOD_TOP, WOOD, WOOD_DARK); // 躯体（2段ぶんの木の箱）
    const bunk = (y: number): void => {
      g.fillStyle(0x1b222c, 1); // 開口部（奥は暗く落とす）
      g.fillRoundedRect(20, y, 76, 38, 5);
      g.fillStyle(0xdfe6ec, 1); // マットレス
      g.fillRoundedRect(25, y + 21, 66, 12, 3);
      g.fillStyle(0x9fb0be, 1);
      g.fillRoundedRect(25, y + 21, 66, 3, 1.5);
      g.fillStyle(0xf4f6f7, 1); // 枕
      g.fillRoundedRect(74, y + 14, 16, 9, 3);
      g.fillStyle(0x4a7fb5, 1); // 掛け布団
      g.fillRoundedRect(25, y + 24, 44, 9, 3);
      g.fillStyle(GLOW, 0.85); // 縁の間接照明（この1本で「最近の宿」に見える）
      g.fillRect(22, y + 2.5, 72, 2);
      g.fillStyle(0xffffff, 0.35);
      g.fillRect(22, y + 2.5, 72, 1);
      outlineRect(g, 20, y, 76, 38, 5, 0.9);
    };
    bunk(26); // 上段
    bunk(76); // 下段
    g.fillStyle(0x6d7a86, 1); // 上り梯子
    g.fillRect(100, 32, 3.5, 84);
    g.fillRect(110, 32, 3.5, 84);
    for (let i = 0; i < 5; i++) g.fillRect(100, 42 + i * 16, 13.5, 3);
    outlineRect(g, 100, 32, 13.5, 84, 0, 0.6);
    make("fnSleepPod", 120, 132);
  }

  /**
   * 【壁掛けの大型ディスプレイ】ラウンジの奥の壁（130×76。壁の傾きに倒す／originY 0.84）。
   * レースの映像が流れているつもり。1枚あるとラウンジが「共用の居場所」に見える。
   */
  {
    const frame = wallQuad(4, 126, 6, 56);
    fill(g, frame, 0x1b222c);
    stroke(g, frame, 0.95, 1.4);
    fill(g, wallQuad(8, 122, 10, 52), GLOW_DEEP);
    // 水面のレーン（画面の中身まで描くと潰れるので、帯と点だけ）
    for (let i = 0; i < 3; i++) fill(g, wallQuad(10, 120, 16 + i * 12, 22 + i * 12), darken(GLOW_DEEP, 0.72));
    g.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 26;
      g.fillCircle(x, 32 + x * 0.5, 2.6);
    }
    make("fnDormScreen", 130, 76);
  }

  /** 【ラウンジのソファ】布張りの2人掛け（112×72、足元が下端）。 */
  {
    fill(g, floorQuad(56, 62, 0.44, 0.26), 0x000000, 0.18);
    const seat = slab(g, floorQuad(56, 58, 0.4, 0.2), 10, 10, 0x6d8fa3, 0x50707f, 0x3f5b68);
    const back = onTop(seat, 0.5, 0.02); // 背もたれ（奥側に立てる）
    g.fillStyle(0x5d7f93, 1);
    g.fillRoundedRect(back.x - 44, back.y - 24, 88, 26, 5);
    g.fillStyle(0x7fa0b4, 1);
    g.fillRoundedRect(back.x - 41, back.y - 21, 82, 12, 4);
    outlineRect(g, back.x - 44, back.y - 24, 88, 26, 5, 0.85);
    for (const u of [0.16, 0.84]) {
      // クッション（色を差して布に見せる）
      const p = onTop(seat, u, 0.45);
      g.fillStyle(u < 0.5 ? 0xe8b06a : 0xd67f6a, 1);
      g.fillRoundedRect(p.x - 9, p.y - 14, 18, 14, 4);
      outlineRect(g, p.x - 9, p.y - 14, 18, 14, 4, 0.75);
    }
    make("fnDormSofa", 112, 72);
  }

  /** 【ローテーブル】ラウンジの中央（92×54、足元が下端）。天板はガラス。 */
  {
    fill(g, floorQuad(46, 46, 0.32, 0.2), 0x000000, 0.16);
    const t = slab(g, floorQuad(46, 42, 0.28, 0.17), 14, 4, 0xbfe4f2, 0x8fb8c9, 0x76a0b1);
    g.fillStyle(WOOD_DARK, 1); // 脚
    for (const [u, v] of [[0.1, 0.8], [0.9, 0.8]] as [number, number][]) {
      const p = onTop(t, u, v);
      g.fillRect(p.x - 2, p.y, 4, 14);
    }
    const cup = onTop(t, 0.62, 0.42); // マグと本
    g.fillStyle(0xf4f6f7, 1);
    g.fillRoundedRect(cup.x - 4, cup.y - 8, 8, 8, 2);
    outlineRect(g, cup.x - 4, cup.y - 8, 8, 8, 2, 0.7);
    const bk = onTop(t, 0.3, 0.5);
    g.fillStyle(0x4a7fb5, 1);
    g.fillRect(bk.x - 9, bk.y - 4, 18, 4);
    outlineRect(g, bk.x - 9, bk.y - 4, 18, 4, 0, 0.7);
    make("fnDormTable", 92, 54);
  }

  /**
   * 【スタディブース】仕切りとモニタのある机（88×86、足元が下端）。
   * 寮が「寝るだけの場所」に見えないよう、勉強・分析をする場所を1つ置く。
   */
  {
    shadow(g, 44, 82, 38);
    g.fillStyle(0xe4ebf1, 1); // 仕切り（半透明のパネル）
    g.fillRect(8, 6, 72, 34);
    g.fillStyle(0xbfd0dd, 1);
    g.fillRect(8, 6, 72, 4);
    outlineRect(g, 8, 6, 72, 34, 0, 0.8);
    part(g, 10, 40, 68, 8, WOOD_TOP, 2); // 天板
    g.fillStyle(WOOD_DARK, 1); // 脚
    g.fillRect(14, 48, 4, 30);
    g.fillRect(70, 48, 4, 30);
    part(g, 26, 16, 36, 22, GLASS, 2); // モニタ
    glowRect(g, 29, 19, 30, 16);
    g.fillStyle(0x9fb0be, 1);
    g.fillRect(40, 38, 8, 3);
    part(g, 30, 56, 28, 22, 0x4a7fb5, 3); // 椅子（背もたれだけ見える）
    make("fnStudyBooth", 88, 86);
  }

  /** 【ランドリー】洗濯乾燥機が2台（76×80、足元が下端）。毎日泳ぐ選手の寮に要るもの。 */
  {
    shadow(g, 38, 76, 34);
    for (let i = 0; i < 2; i++) {
      const x = 6 + i * 34;
      part(g, x, 16, 30, 60, SHELL, 3);
      g.fillStyle(0x9fb0be, 1); // 操作パネル
      g.fillRect(x + 4, 20, 22, 7);
      g.fillStyle(GLOW, 0.9);
      g.fillRect(x + 6, 22, 9, 3);
      g.fillStyle(0x1b222c, 1); // のぞき窓
      g.fillCircle(x + 15, 48, 11);
      g.fillStyle(i === 0 ? 0x4a7fb5 : 0x6d8fa3, 0.85);
      g.fillCircle(x + 15, 48, 8);
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(x + 11, 44, 3);
      outlineRect(g, x, 16, 30, 60, 3, 0.9);
    }
    make("fnLaundry", 76, 80);
  }

  /** 【ミニキッチン】給湯・給水のカウンター（116×78、足元が下端）。 */
  {
    fill(g, floorQuad(58, 68, 0.46, 0.22), 0x000000, 0.18);
    const t = slab(g, floorQuad(58, 64, 0.42, 0.18), 26, 6, 0xe4ebf1, 0xbfd0dd, 0xa2b4c2);
    g.fillStyle(WOOD, 1); // 腰壁（木）
    g.fillRect(14, 64, 88, 12);
    outlineRect(g, 14, 64, 88, 12, 0, 0.7);
    const sink = onTop(t, 0.24, 0.5); // シンク
    g.fillStyle(0x8fa3b2, 1);
    g.fillEllipse(sink.x, sink.y, 22, 11);
    g.lineStyle(2, 0xdfe6ec, 1); // 蛇口
    g.beginPath();
    g.moveTo(sink.x - 2, sink.y - 4);
    g.lineTo(sink.x - 2, sink.y - 16);
    g.lineTo(sink.x + 7, sink.y - 16);
    g.strokePath();
    const pot = onTop(t, 0.62, 0.45); // 給湯ポットとカップ
    part(g, pot.x - 8, pot.y - 20, 16, 20, SHELL, 3);
    glowRect(g, pot.x - 5, pot.y - 17, 10, 6);
    const cups = onTop(t, 0.86, 0.5);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(i === 1 ? 0xe8b06a : 0xf4f6f7, 1);
      g.fillRoundedRect(cups.x - 10 + i * 7, cups.y - 8, 6, 8, 2);
    }
    make("fnDormKitchen", 116, 78);
  }

  /** 【プランター】仕切りを兼ねた木箱の緑（88×66、足元が下端）。寮の生活感を足す。 */
  {
    fill(g, floorQuad(44, 58, 0.34, 0.14), 0x000000, 0.16);
    const t = slab(g, floorQuad(44, 54, 0.3, 0.11), 8, 16, WOOD_TOP, WOOD, WOOD_DARK);
    for (let i = 0; i < 4; i++) {
      const p = onTop(t, 0.14 + i * 0.24, 0.5);
      g.fillStyle(0x2f6b3d, 1);
      g.fillCircle(p.x, p.y - 12, 9);
      g.fillStyle(0x49b95a, 1);
      g.fillCircle(p.x - 2, p.y - 15, 6.5);
      g.fillStyle(0x6ad775, 1);
      g.fillCircle(p.x - 4, p.y - 17, 3.4);
    }
    make("fnDormPlanterBox", 88, 66);
  }

  g.destroy();
}
