import type Phaser from "phaser";
import { CHAR_SCALE, LAND_CHAR_SCALE } from "../config";
import {
  COACH_PATTERNS,
  COACH_SHEETS,
  COACH_WALK_FPS,
  type CoachPattern,
  type Dir8,
} from "../../assets/characters/atlas";

/**
 * コーチの描き起こしスプライト。
 *
 * **シートは切らずに1枚のまま読み込み、`assets/characters/atlas.ts` の座標で切り出す。**
 * ズレていたらアトラスの数字だけ直せばよい（画像を作り直さなくてよい）のがこの作りの狙い。
 *
 * 1パターンにつき「8方向の歩行（2〜3コマ）」＋「待機（正面）」を持つ。
 * 等角なので、**画面の見た目の向き**で8方向を選ぶ（→ dir8Of）。
 */

/** 読み込んだシートのテクスチャキー。 */
export const COACH_SHEET_KEYS: Record<CoachPattern["sheet"], string> = {
  normal: "coachSheetNormal",
  pro: "coachSheetPro",
};

export type { Dir8, CoachPattern };
export { COACH_SHEETS, COACH_PATTERNS };

/** 歩行のアニメーションキー。 */
function walkAnimKey(patternId: string, dir: Dir8): string {
  return `coachw_${patternId}_${dir}`;
}

/** 待機のコマ名（テクスチャ内の枠の名前）。 */
function idleFrameName(patternId: string): string {
  return `${patternId}_idle`;
}

function walkFrameName(patternId: string, dir: Dir8, i: number): string {
  return `${patternId}_${dir}_${i}`;
}

/** 切り出しに成功したパターン（ここに載っているものだけを使う）。 */
const sliced = new Map<string, { walkH: number; idleH: number }>();

export function coachArtReady(): boolean {
  return sliced.size > 0;
}

export function clearCoachArt(): void {
  sliced.clear();
}

/**
 * 読み込んだシートに、アトラスの座標で枠を足してアニメーションを作る。
 * BootScene が読み込み後に1回だけ呼ぶ。
 */
export function sliceCoachSheets(scene: Phaser.Scene): void {
  sliced.clear();
  for (const p of COACH_PATTERNS) {
    const key = COACH_SHEET_KEYS[p.sheet];
    if (!scene.textures.exists(key)) continue;
    const tex = scene.textures.get(key);
    // 素材は必ず拡大／縮小して出すので、輪郭が飛ばないよう滑らかに寄せる
    tex.setFilter(1 as unknown as Phaser.Textures.FilterMode); // LINEAR
    const [ix, iy, iw, ih] = p.idle;
    tex.add(idleFrameName(p.id), 0, ix, iy, iw, ih);

    let walkH = 0;
    for (const dir of Object.keys(p.walk) as Dir8[]) {
      const def = p.walk[dir];
      def.f.forEach((r, i) => {
        tex.add(walkFrameName(p.id, dir, i), 0, r[0], r[1], r[2], r[3]);
        walkH = Math.max(walkH, r[3]);
      });
      const animKey = walkAnimKey(p.id, dir);
      if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
      scene.anims.create({
        key: animKey,
        frames: def.f.map((_r, i) => ({ key, frame: walkFrameName(p.id, dir, i) })),
        frameRate: COACH_WALK_FPS,
        repeat: -1,
      });
    }
    sliced.set(p.id, { walkH, idleH: ih });
  }
}

/**
 * そのコーチの見た目。
 *
 * 格が高い（トップ・レジェンド級）ほど上級コーチのシートを使う。
 * **IDで決める**ので、同じコーチはいつ画面に出ても同じ見た目になる（セーブに持たなくてよい）。
 */
export function coachPatternOf(quality: number, id: number): CoachPattern {
  const sheet: CoachPattern["sheet"] = quality >= COACH_PRO_QUALITY ? "pro" : "normal";
  const pool = COACH_PATTERNS.filter((p) => p.sheet === sheet);
  // 隣り合うIDが同じ絵にならないよう、軽く撹拌してから割る
  const h = Math.abs(Math.imul(Math.floor(id) + 1, 2654435761) >>> 0) % pool.length;
  return pool[h];
}

/** 絵が読めているときだけ、そのパターンを返す（読めていなければドット絵のまま）。 */
export function coachPatternFor(quality: number, id: number): CoachPattern | null {
  if (!coachArtReady()) return null;
  const p = coachPatternOf(quality, id);
  return sliced.has(p.id) ? p : null;
}

/** この格から上は「上級コーチ」の絵（格1〜5のうち 4＝トップ／5＝レジェンド）。 */
export const COACH_PRO_QUALITY = 4;

/**
 * グリッドの移動量 → 画面の8方向。
 *
 * 等角では 画面X ∝ (gx-gy) ／ 画面Y ∝ (gx+gy) なので、
 * マスの軸と画面の向きは45度ずれる（+gx は画面の右下）。
 * 見た目の向きで絵を選びたいので、**画面の向きに直してから**8方向に丸める。
 */
export function dir8Of(dx: number, dy: number): Dir8 {
  const sx = dx - dy;
  const sy = dx + dy;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return "down";
  const ang = Math.atan2(sy, sx); // 右=0, 下=+90°
  const i = ((Math.round((ang * 4) / Math.PI) % 8) + 8) % 8;
  return DIR_BY_OCTANT[i];
}

/** atan2 の8分割（右まわり）。 */
const DIR_BY_OCTANT: Dir8[] = [
  "right",
  "downRight",
  "down",
  "downLeft",
  "left",
  "upLeft",
  "up",
  "upRight",
];

/**
 * コーチの絵をスプライトに反映する。
 *
 * 歩いている間だけコマを送り、止まったら待機の絵に戻す。
 * 大きさは「コード生成のドット絵と同じ背丈」に合わせる（素材の解像度に依らない）。
 */
export function applyCoachSprite(
  sprite: Phaser.GameObjects.Sprite,
  pattern: CoachPattern,
  dir: Dir8,
  moving: boolean,
  targetH: number,
): void {
  const size = sliced.get(pattern.id);
  if (!size) return;
  const key = COACH_SHEET_KEYS[pattern.sheet];
  if (moving) {
    sprite.play(walkAnimKey(pattern.id, dir), true);
    sprite.setFlipX(pattern.walk[dir].flip === true);
    sprite.setScale(targetH / Math.max(1, size.walkH));
  } else {
    if (sprite.anims.isPlaying) sprite.anims.stop();
    sprite.setTexture(key, idleFrameName(pattern.id));
    sprite.setFlipX(false);
    sprite.setScale(targetH / Math.max(1, size.idleH));
  }
}

/** コーチを画面に出すときの背丈（ワールドpx）。コード生成のドット絵と同じ大きさ。 */
export const COACH_TARGET_H = 27 * CHAR_SCALE * LAND_CHAR_SCALE * 0.88;
