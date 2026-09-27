import type Phaser from "phaser";
import { ADULT_TYPES, KID_TYPES, type CharTypeDef } from "./charTypes";
import { charKey, charSize, isWaterMode, modesFor, CHAR_BODIES, type CharBody, type CharMode } from "./charSprites";
import { CHAR_SCALE, LAND_CHAR_SCALE } from "../config";

/**
 * 【外部キャラ素材の差し替え】
 *
 * キャラの絵は、いまはコード生成のドット絵（charSprites.ts）で描いている。
 * 描き起こした PNG 素材が用意できたら、**ファイルを置くだけ**でそちらが使われるようにするのが
 * このモジュール。ゲーム側のコード（people.ts / 各シーン）は一切変えなくてよい。
 *
 * 【置き方】
 *   public/characters/manifest.json   … 使う素材の一覧（下の形式）
 *   public/characters/<タイプID>/<姿>.png
 *
 * 例：
 *   public/characters/m_sporty/walk.png
 *   public/characters/g_genki/kick.png
 *
 * manifest.json の形式（相対パスの配列）:
 *   { "files": ["m_sporty/walk.png", "m_sporty/swimFree.png", ...] }
 *
 * **manifest.json が無ければ何も読み込まない**（＝いまのドット絵のまま動く）。
 * 一覧に書いたものだけを読むので、途中まで描けた素材から順に差し替えていける。
 * 1枚も無い姿はコード生成の絵が出るので、素材が揃うのを待たずに遊べる。
 *
 * 【タイプID】charTypes.ts の id と同じ。
 *   大人 男性 … m_sporty / m_muscle / m_student / m_office / m_senior
 *   大人 女性 … f_energetic / f_cool / f_student / f_adult / f_senior
 *   幼児 男の子 … b_genki / b_ottori / b_yancha / b_oshare / b_nakimushi
 *   幼児 女の子 … g_genki / g_ottori / g_yancha / g_oshare / g_nakimushi
 *
 * 【姿（ファイル名）】walk / walkBack / suit / swimFree / swimBreast / swimBack /
 *   swimFly / dive / train / kick / float
 *   （幼児は kick＝ビート板バタ足、float＝水に慣れる基礎練習）
 *
 * 【大きさ】**好きな解像度で描いてよい**。表示するときに
 * `charAssetScale()` が「コード生成の絵と同じ背丈」になる倍率へ直すので、
 * 素材が何ピクセルで描かれていても立ち位置・大きさは変わらない
 * （＝高解像度で描くほど、拡大したときに綺麗に見える）。
 * 目安は立ち姿の縦 80px 前後。**縦＝背丈**として揃えるので、
 * 上下に余白を入れない（余白ぶんだけ人が縮んで見える）。
 * 足元が下端中央、泳ぎは水面が上から64%の位置に来るように描くと、
 * いまの配置（WALK_ORIGIN / SWIM_ORIGIN）のまま差し替えられる。
 */

/** 素材を置く場所（public/ の下。ビルド後もそのままのパスで配信される）。 */
export const CHAR_ASSET_DIR = "characters";
export const CHAR_MANIFEST_URL = `${CHAR_ASSET_DIR}/manifest.json`;

/**
 * manifest.json の中身。
 *
 * 1枚絵は文字列のまま。**動く絵**は「コマを横に並べた1枚のPNG」にして、
 * コマ数（と早さ）を書く。文字列と混ぜて書ける。
 *
 *   { "files": [
 *       "m_sporty/walk.png",
 *       { "file": "m_sporty/swimFree.png", "frames": 3, "fps": 7 }
 *   ] }
 */
export type CharAssetEntry = string | { file: string; frames?: number; fps?: number };

export interface CharAssetManifest {
  files?: CharAssetEntry[];
}

/** manifest の1行を、ファイル名・コマ数・早さに分解する。 */
export function assetEntryOf(entry: CharAssetEntry): { file: string; frames: number; fps: number } {
  if (typeof entry === "string") return { file: entry, frames: 1, fps: 0 };
  const frames = Math.max(1, Math.floor(entry.frames ?? 1));
  return { file: entry.file, frames, fps: Math.max(1, Math.round(entry.fps ?? DEFAULT_FPS)) };
}

/** コマ送りの既定の早さ（manifest で指定しなかったとき）。 */
const DEFAULT_FPS = 7;

/** 外部素材のテクスチャキー（コード生成のキーと衝突しないよう接頭辞を付ける）。 */
export function assetKey(typeId: string, mode: CharMode): string {
  return `cx_${typeId}_${mode}`;
}

/** 動く絵のアニメーションキー。 */
export function charAnimKey(typeId: string, mode: CharMode): string {
  return `cxa_${typeId}_${mode}`;
}

/**
 * 読み込みに成功した素材のキー → 実寸（px）とコマ数。ここに載っているものだけを使う。
 * 実寸を持っておくのは、**素材の解像度が違っても同じ背丈で出す**ため（→ charAssetScale）。
 * コマ数が2以上なら、横に並んだコマを切り出したアニメーションが用意されている。
 */
const loaded = new Map<string, { w: number; h: number; frames: number }>();

/** 読み込み済みとして登録する（BootScene が読み込んだテクスチャの実寸を渡す）。 */
export function registerCharAsset(key: string, w: number, h: number, frames = 1): void {
  if (w <= 0 || h <= 0) return; // 実寸が取れない絵は使わない（巨大表示になるのを防ぐ）
  loaded.set(key, { w, h, frames: Math.max(1, Math.floor(frames)) });
}

/** その姿の素材のコマ数（0＝素材が無い）。 */
export function charAssetFrames(typeId: string, mode: CharMode): number {
  return loaded.get(assetKey(typeId, mode))?.frames ?? 0;
}

export function clearCharAssets(): void {
  loaded.clear();
}

/** 1枚でも外部素材が入っているか（起動ログ・確認用）。 */
export function hasCharAssets(): boolean {
  return loaded.size > 0;
}

export function loadedCharAssetCount(): number {
  return loaded.size;
}

/** 全タイプ（大人10＋幼児10）。 */
export function allCharTypes(): readonly CharTypeDef[] {
  return [...ADULT_TYPES, ...KID_TYPES];
}

/**
 * manifest のファイル名（"m_sporty/walk.png"）を、タイプIDと姿に分解する。
 * 知らないタイプ・姿は無視する（打ち間違いで壊れないように）。
 */
export function parseAssetPath(file: string): { typeId: string; mode: CharMode } | null {
  const m = /^([A-Za-z0-9_]+)[/\\]([A-Za-z0-9_]+)\.(png|webp)$/.exec(file.trim());
  if (!m) return null;
  const typeId = m[1];
  const mode = m[2] as CharMode;
  if (!allCharTypes().some((t) => t.id === typeId)) return null;
  const known = new Set<CharMode>();
  for (const b of CHAR_BODIES) for (const mo of modesFor(b)) known.add(mo);
  if (!known.has(mode)) return null;
  return { typeId, mode };
}

/**
 * その体型・タイプ・姿に使うテクスチャキー。
 *
 * 外部素材が入っていればそれを、無ければコード生成の絵を返す。
 * **呼び出し側はどちらが使われているかを気にしなくてよい**というのがこの関数の役目。
 */
export function charTexture(mode: CharMode, body: CharBody, variant: number, typeId: string): string {
  const ext = assetKey(typeId, mode);
  if (loaded.has(ext)) return ext;
  return charKey(mode, body, variant);
}

/**
 * その絵を出すときの表示倍率。
 *
 * コード生成のドット絵は「体型ごとの背丈（BODY.h）× CHAR_SCALE」で画面に出ている。
 * 描き起こした素材は解像度がまちまちなので、**縦を背丈に合わせる倍率**へ直す。
 * こうすると
 *   ・素材を何ピクセルで描いても、立ち位置も大きさも変わらない
 *   ・幼児・学童・中高生・大人の背丈の差（BODY.h）は今までどおり出る
 *     （タイプ別の素材は1枚でも、体型ごとに縮尺が変わる）
 * 素材が無い姿は base（＝コード生成のときの倍率）をそのまま返す。
 *
 * **陸の姿にだけ LAND_CHAR_SCALE を掛ける**（→ config.ts）。
 * 泳ぐ姿は水面の大きさで決まっているので、そこは変えない。
 */
export function charAssetScale(mode: CharMode, body: CharBody, typeId: string, base = CHAR_SCALE): number {
  const shown = sizeModeOf(mode, typeId);
  const land = isWaterMode(shown) ? 1 : LAND_CHAR_SCALE;
  const size = loaded.get(assetKey(typeId, mode));
  if (!size) return base * land;
  return (charSize(shown, body).h * base * land) / size.h;
}

/**
 * その姿の絵をスプライトに反映する（動く絵ならアニメーションを再生する）。
 *
 * **テクスチャの差し替えと倍率とアニメーションを1か所にまとめてある。**
 * 別々に書くと、コマを並べたPNGを `setTexture` だけで貼って
 * 「横に長い1枚絵」がそのまま出る、という間違いが起きやすいため。
 */
export function applyCharSprite(
  sprite: Phaser.GameObjects.Sprite,
  mode: CharMode,
  body: CharBody,
  variant: number,
  typeId: string,
  base = CHAR_SCALE,
): void {
  const info = loaded.get(assetKey(typeId, mode));
  if (info && info.frames > 1) {
    sprite.play(charAnimKey(typeId, mode), true); // 同じものが動いていれば頭から出し直さない
  } else {
    // 1枚絵に替えるときは、前の姿のアニメーションを必ず止める
    //（止め忘れると、コマ送りが前の姿の絵を貼り直してしまう）
    if (sprite.anims.currentAnim) sprite.anims.stop();
    sprite.setTexture(charTexture(mode, body, variant, typeId));
  }
  sprite.setScale(charAssetScale(mode, body, typeId, base));
}

/**
 * 【飛び込みだけの例外】
 *
 * コード生成の「飛び込み」は**プールサイドで前傾した立ち姿**（足元が原点）だが、
 * 描き起こした素材の「潜る・浮上」は**水の中の横向きの絵**になっている。
 * 絵の種類が違うので、素材が入っているときだけ泳ぎと同じ扱い
 *（原点＝水面 SWIM_ORIGIN、大きさ＝泳ぎの寸法）にする。
 * こうしないと、水面に立った巨大な人が0.7秒だけ出る。
 */
export function charAssetIsWater(mode: CharMode, typeId: string): boolean {
  return mode === "dive" && loaded.has(assetKey(typeId, mode));
}

/** 大きさを合わせるときに基準にする姿（→ charAssetIsWater）。 */
function sizeModeOf(mode: CharMode, typeId: string): CharMode {
  return charAssetIsWater(mode, typeId) ? "swim" : mode;
}
