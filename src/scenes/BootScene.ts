import { bgm } from "../audio/bgm";
import Phaser from "phaser";
import { createGameTextures } from "../gfx/textures";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { settings, initSettings } from "../save/settings";
import { devView } from "../dev/devView";
import {
  assetEntryOf,
  assetKey,
  charAnimKey,
  CHAR_ASSET_DIR,
  CHAR_MANIFEST_URL,
  clearCharAssets,
  parseAssetPath,
  registerCharAsset,
  type CharAssetManifest,
} from "../gfx/charAssets";
import type { CharMode } from "../gfx/charSprites";
import { COACH_SHEET_KEYS, COACH_SHEETS, sliceCoachSheets } from "../gfx/coachSprites";
import { applyRenderScale } from "../gfx/renderScale";

/** 立ち姿1枚から歩く2コマを作る姿（→ makeStepFrames）。 */
const STEP_MODES: readonly CharMode[] = ["walk", "walkBack", "suit"];
/** 脚とみなす高さ（絵の上からの割合）。 */
const LEG_TOP = 0.74;
/** 足を浮かせる量（背丈に対する割合）。大きいほど大股になる。 */
const LEG_LIFT = 0.05;
/** 作ったコマの既定の早さ（実際は歩いた距離でコマを選ぶので目安）。 */
const STEP_FPS = 6;

/**
 * 起動シーン。生成テクスチャを登録し、端末から設定を読み込んでからタイトルへ。
 *
 * 描き起こしたキャラ素材（public/characters/）があれば、ここで読み込んで差し替える。
 * 無ければコード生成のドット絵のまま動く（→ gfx/charAssets.ts）。
 */
export class BootScene extends Phaser.Scene {
  private moved = false;

  constructor() {
    super("Boot");
  }

  preload(): void {
    applyRenderScale(this); // 論理540×960のまま、画素だけ細かく描く（→ gfx/renderScale.ts）
    // キャラ素材の一覧。**無くてよい**ので、404 でも起動を止めない。
    this.load.json("charManifest", CHAR_MANIFEST_URL);
    // コーチのスプライトシート（1枚のまま読み、アトラスの座標で切り出す）
    for (const [sheet, url] of Object.entries(COACH_SHEETS)) {
      this.load.image(COACH_SHEET_KEYS[sheet as keyof typeof COACH_SHEETS], url);
    }
    this.load.once("loaderror", () => {
      // manifest が無い＝素材をまだ置いていない。コード生成の絵で動かす。
    });
  }

  create(): void {
    this.moved = false;
    createGameTextures(this);
    // コーチのシートは preload で読み終わっている。アトラスの座標で枠を足す
    // （読めていなければ何も起きず、コード生成のドット絵のまま動く）。
    sliceCoachSheets(this);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "Now Loading…", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#9fb3c4",
      })
      .setOrigin(0.5);

    // 開発中に ?dev=facility が付いていたら、タイトルを飛ばして施設画面から始める
    // （見た目を直したあと、ヘッドレスのブラウザで1コマンドで撮れるようにするため）。
    const dev = devView();

    const go = (): void => {
      if (this.moved) return;
      this.moved = true;
      // BGM の設定（ON/OFF・音量）を反映する。音そのものは最初のタップで鳴り始める（→ audio/bgm.ts）
      bgm.configure(settings().bgmOn, settings().bgmVolume);
      if (dev?.facility) this.scene.start("Facility", { slot: 1, clubName: "プレビュー" });
      else this.scene.start("Title");
    };

    // 設定の読み込み（端末ストレージ待ち）と、キャラ素材の読み込みが**両方**終わってから進む。
    // 素材を待たずに始めると、施設に出た人が「コード生成のドット絵のまま」になってしまう
    // （テクスチャを選ぶのは人が生まれた瞬間の一度きりなので、後から入れ替わらない）。
    // どちらも応答が無くても起動できるよう、保険で先へ進む。
    this.time.delayedCall(4000, go);
    void Promise.all([initSettings(), this.loadCharAssets()]).then(go, go);
  }

  /**
   * キャラ素材（PNG）を読み込む。
   *
   * manifest.json に書かれたぶんだけを読み、**読めたものだけ**を差し替え対象に登録する。
   * 1枚も無ければ何も起きない（コード生成の絵のまま）。
   * 読み終わり（1枚も無い場合を含む）で解決する Promise を返す。
   */
  private loadCharAssets(): Promise<void> {
    clearCharAssets();
    const manifest = this.cache.json.get("charManifest") as CharAssetManifest | undefined;
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    if (files.length === 0) return Promise.resolve();

    // キー → コマ数・早さ（読み終わってから切り分けるので覚えておく）
    const spec = new Map<string, { typeId: string; mode: CharMode; frames: number; fps: number }>();
    let queued = 0;
    for (const entry of files) {
      const { file, frames, fps } = assetEntryOf(entry);
      const parsed = parseAssetPath(file);
      if (!parsed) continue; // 知らないタイプ・姿は読み飛ばす（打ち間違いで壊れない）
      const key = assetKey(parsed.typeId, parsed.mode);
      if (this.textures.exists(key)) continue;
      spec.set(key, { typeId: parsed.typeId, mode: parsed.mode, frames, fps });
      this.load.image(key, `${CHAR_ASSET_DIR}/${file}`);
      queued++;
    }
    if (queued === 0) return Promise.resolve();

    // 読めた絵だけを登録する（1枚欠けても他は使える）。
    // **実寸を一緒に渡す**：素材の解像度に関係なく同じ背丈で出すのに要る（→ charAssetScale）。
    this.load.on("filecomplete", (key: string) => {
      if (!key.startsWith("cx_")) return;
      const tex = this.textures.get(key);
      const src = tex.getSourceImage() as { width?: number; height?: number };
      // 素材はドット絵より高い解像度で描かれていて、**必ず縮小して**表示する。
      // NEAREST だと縮小のたびに輪郭の線が飛んでチラつくので LINEAR にする。
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      const w = src.width ?? 0;
      const h = src.height ?? 0;
      const s = spec.get(key);
      const frames = s && s.frames > 1 && w >= s.frames ? s.frames : 1;
      if (frames > 1 && s) {
        this.sliceFrames(key, w, h, s.typeId, s.mode, frames, s.fps);
      } else if (s && STEP_MODES.includes(s.mode) && this.makeStepFrames(key, w, h, s.typeId, s.mode)) {
        // 立ち姿1枚しか無い姿は、脚を上げ下げする2コマを作って歩かせる
        registerCharAsset(key, w, h, 2);
        return;
      }
      registerCharAsset(key, w, h, frames);
    });
    // 1枚読めなくても complete は来る（読めた絵だけが差し替わる）
    const done = new Promise<void>((resolve) => this.load.once("complete", () => resolve()));
    this.load.start();
    return done;
  }

  /**
   * 【立ち姿1枚から歩く2コマを作る】
   *
   * 素材の多くは立ち姿が1枚だけ（幼児・学童は全タイプ、水着は全員）。
   * そのまま動かすと**脚が止まったまま板が滑って見える**ので、
   * 読み込んだ絵の「脚のところ」を左右に分け、片方ずつ縮めて足を浮かせた2コマを作る。
   *
   * 絵を描き足さずに済み、増えるのは1タイプ数KBのキャンバス1枚だけ。
   * 切れ目（左右の脚のあいだ）は、脚の高さの列ごとの濃さがいちばん薄いところを探す。
   * 失敗したら false を返し、今までどおり1枚絵のまま出す。
   */
  private makeStepFrames(key: string, w: number, h: number, typeId: string, mode: CharMode): boolean {
    if (w < 8 || h < 16) return false;
    const src = this.textures.get(key).getSourceImage() as CanvasImageSource;
    const outKey = `${key}_step`;
    if (this.textures.exists(outKey)) this.textures.remove(outKey);
    const canvas = this.textures.createCanvas(outKey, w * 2, h);
    if (!canvas) return false;
    const ctx = canvas.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0);
    const legTop = Math.max(1, Math.round(h * LEG_TOP));
    const legH = h - legTop;
    if (legH < 3) {
      this.textures.remove(outKey);
      return false;
    }
    // 脚の左右の切れ目を探す（真ん中あたりで、いちばん画素の少ない列）
    let split = Math.floor(w / 2);
    try {
      const data = ctx.getImageData(0, legTop, w, legH).data;
      const col = new Array<number>(w).fill(0);
      for (let y = 0; y < legH; y++) {
        for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 60) col[x]++;
      }
      const lo = Math.floor(w * 0.3);
      const hi = Math.ceil(w * 0.7);
      let best = Infinity;
      for (let x = lo; x < hi; x++) {
        if (col[x] < best) {
          best = col[x];
          split = x;
        }
      }
    } catch {
      // 画素が読めない環境ではまんなかで割る（見た目が少し崩れるだけ）
    }
    const lift = Math.max(1, Math.round(h * LEG_LIFT));
    // コマ0＝右脚を上げる／コマ1＝左脚を上げる
    const halves: [number, number][] = [
      [split, w - split],
      [0, split],
    ];
    for (let i = 0; i < 2; i++) {
      const ox = i * w;
      if (i > 0) ctx.drawImage(src, ox, 0);
      const [hx, hw] = halves[i];
      if (hw <= 0) continue;
      // 脚を**縮めて**足を浮かせる。ずらすと腰のところに横一線の継ぎ目が出るが、
      // 縮めれば腰が繋がったまま「膝を曲げて足を上げた」形になる。
      ctx.clearRect(ox + hx, legTop, hw, legH);
      ctx.drawImage(src, hx, legTop, hw, legH, ox + hx, legTop, hw, legH - lift);
    }
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (let i = 0; i < 2; i++) canvas.add(i, 0, i * w, 0, w, h);
    const animKey = charAnimKey(typeId, mode);
    if (this.anims.exists(animKey)) this.anims.remove(animKey);
    this.anims.create({
      key: animKey,
      frames: [0, 1].map((i) => ({ key: outKey, frame: i })),
      frameRate: STEP_FPS,
      repeat: -1,
    });
    return true;
  }

  /**
   * コマを横に並べた1枚のPNGを、コマに切り分けてアニメーションを作る。
   *
   * `load.spritesheet` を使わないのは、**読み込む前に1コマの大きさが分からない**ため
   * （素材ごとに解像度が違ってよい、というのがこの仕組みの売り）。
   * 読み終わったテクスチャに枠を足すだけなので、絵は1枚のまま増えない。
   */
  private sliceFrames(
    key: string,
    w: number,
    h: number,
    typeId: string,
    mode: CharMode,
    frames: number,
    fps: number,
  ): void {
    const tex = this.textures.get(key);
    const fw = Math.floor(w / frames);
    for (let i = 0; i < frames; i++) tex.add(i, 0, i * fw, 0, fw, h);
    const animKey = charAnimKey(typeId, mode);
    if (this.anims.exists(animKey)) this.anims.remove(animKey);
    this.anims.create({
      key: animKey,
      frames: Array.from({ length: frames }, (_, i) => ({ key, frame: i })),
      frameRate: fps,
      repeat: -1,
    });
  }
}
