import Phaser from "phaser";
import { FOOTER_H, GAME_HEIGHT } from "../config";
import { campDef } from "../sim/camp";
import { lifeStageOf } from "../sim/growth";
import type { GameState } from "../sim/state";
import type { Student } from "../sim/student";
import { bodyForStage, charTypeOf, SWIM_ORIGIN, variantForGender } from "../gfx/textures";
import { applyCharSprite } from "../gfx/charAssets";
import { charFacing, flipXFor } from "../gfx/charFacing";
import { swimModeFor } from "../iso/people";

/**
 * 合宿中の小窓（画面の左下・フッターのすぐ上）。
 *
 * 合宿は2〜4週のあいだ選手がクラブを空ける（→ GameState.activeCamp）。
 * 施設の絵から選手が消えるだけだと「どこへ行ったのか」が分からないので、
 * 期間中はここに**行き先と残りの週**を出し、連れて行った子が泳いでいる姿を動かして見せる。
 * 押すと合宿に出ている子の一覧が開く。
 *
 * 毎フレーム update を呼ぶ。合宿が無いときは隠れていて、何もしない。
 */

const W = 244;
const H = 84;
const X = 8;
const Y = GAME_HEIGHT - FOOTER_H - H - 10;
/** 水面（泳ぐ帯）の上端と高さ（小窓の中の座標）。 */
const WATER_TOP = 34;
const WATER_H = H - WATER_TOP - 6;
/** 一度に泳がせる人数（多いと帯が詰まって誰が誰だか分からない）。 */
const MAX_SWIMMERS = 3;
/** 泳ぐ姿の大きさ（施設の中の倍率に掛ける）。 */
const SWIM_SCALE = 0.62;

interface Swimmer {
  sprite: Phaser.GameObjects.Sprite;
  typeId: string;
  mode: Parameters<typeof charFacing>[1];
  x: number;
  dir: 1 | -1;
  speed: number;
  laneY: number;
  phase: number;
}

export class CampBanner {
  private readonly root: Phaser.GameObjects.Container;
  private readonly water: Phaser.GameObjects.Graphics;
  private readonly splash: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private swimmers: Swimmer[] = [];
  /** いま出している合宿の顔ぶれ（変わったら泳ぐ子を作り直す）。 */
  private shownKey = "";
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    onTap: () => void,
  ) {
    this.root = scene.add.container(X, Y).setDepth(1960).setVisible(false);

    const bg = scene.add.graphics();
    bg.fillStyle(0x0a1622, 0.92);
    bg.fillRoundedRect(0, 0, W, H, 10);
    bg.lineStyle(2, 0xe8c07a, 1);
    bg.strokeRoundedRect(0, 0, W, H, 10);
    this.root.add(bg);

    this.water = scene.add.graphics();
    this.root.add(this.water);
    this.splash = scene.add.graphics();

    this.title = scene.add.text(10, 6, "", {
      fontFamily: "sans-serif",
      fontSize: "15px",
      color: "#f7dc6f",
      fontStyle: "bold",
    });
    this.sub = scene.add
      .text(W - 10, 8, "", { fontFamily: "sans-serif", fontSize: "13px", color: "#dfe6ec" })
      .setOrigin(1, 0);
    this.root.add([this.title, this.sub]);

    // 押すと合宿に出ている子の一覧へ（施設のタップに抜けないよう、ここで止める）
    const hit = scene.add
      .zone(W / 2, H / 2, W, H)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        onTap();
      });
    this.root.add(hit);
  }

  /** 画面上で小窓が占める範囲（施設のタップと区別するのに使う）。出ていなければ null。 */
  bounds(): Phaser.Geom.Rectangle | null {
    return this.root.visible ? new Phaser.Geom.Rectangle(X, Y, W, H) : null;
  }

  update(dt: number): void {
    const camp = this.state.activeCamp;
    if (!camp) {
      if (this.root.visible) this.hide();
      return;
    }
    const campers = this.state.campers();
    const key = `${camp.plan.id}:${camp.ids.join(",")}`;
    if (key !== this.shownKey) this.rebuild(key, campers);
    if (!this.root.visible) this.root.setVisible(true);

    const def = campDef(camp.plan.id);
    const icon = def.isAltitude ? "🏔" : def.region === "overseas" ? "✈" : "🏕";
    this.title.setText(`${icon} ${def.label}`);
    this.sub.setText(`あと${camp.weeksLeft}週・${campers.length}人`);

    this.t += dt;
    this.drawWater(def.isAltitude);
    this.splash.clear();
    // 泳ぐ姿は体の長さがあるので、端で折り返す位置を内側に取る（はみ出して切れないように）
    const left = 26;
    const right = W - 26;
    for (const s of this.swimmers) {
      s.x += s.dir * s.speed * dt;
      if (s.x > right) {
        s.x = right;
        s.dir = -1;
      } else if (s.x < left) {
        s.x = left;
        s.dir = 1;
      }
      // 腕をかくたびに少し沈んで浮く（ゆっくり上下させるだけで「泳いでいる」に見える）
      const bob = Math.sin(this.t * 7 + s.phase) * 1.2;
      s.sprite.setPosition(s.x, s.laneY + bob);
      s.sprite.setFlipX(flipXFor(charFacing(s.typeId, s.mode), s.dir));
      // 足もとの白いしぶき
      const kick = 0.5 + 0.5 * Math.sin(this.t * 14 + s.phase);
      this.splash.fillStyle(0xffffff, 0.35 + 0.4 * kick);
      const tail = s.x - s.dir * 15;
      this.splash.fillCircle(tail, s.laneY + 2, 1.6 + kick * 1.6);
      this.splash.fillCircle(tail - s.dir * 5, s.laneY + 1, 1 + kick);
    }
  }

  destroy(): void {
    this.root.destroy();
  }

  // ---------------------------------------------------------------- 内部

  private hide(): void {
    this.root.setVisible(false);
    this.clearSwimmers();
    this.shownKey = "";
  }

  private clearSwimmers(): void {
    for (const s of this.swimmers) s.sprite.destroy();
    this.swimmers = [];
  }

  /** 連れて行った子の中から、帯で泳がせる子を選んで作り直す。 */
  private rebuild(key: string, campers: readonly Student[]): void {
    this.shownKey = key;
    this.clearSwimmers();
    const shown = campers.slice(0, MAX_SWIMMERS);
    const lanes = Math.max(1, shown.length);
    shown.forEach((st, i) => {
      const variant = variantForGender(st.gender === "f" ? "f" : "m", st.id);
      const body = bodyForStage(lifeStageOf(st.grade));
      const typeId = charTypeOf(body, variant).id;
      const mode = swimModeFor(body, st.fav.stroke, st.id);
      const sprite = this.scene.add.sprite(0, 0, "__DEFAULT").setOrigin(SWIM_ORIGIN.x, SWIM_ORIGIN.y);
      applyCharSprite(sprite, mode, body, variant, typeId);
      sprite.setScale(sprite.scaleX * SWIM_SCALE);
      this.root.add(sprite);
      const laneH = WATER_H / lanes;
      this.swimmers.push({
        sprite,
        typeId,
        mode,
        // 同じ場所から一斉に出ると隊列に見えるので、位置と向きと速さをずらす
        x: 20 + ((i * 83) % (W - 40)),
        dir: i % 2 === 0 ? 1 : -1,
        speed: 26 + ((st.id * 7) % 11),
        laneY: WATER_TOP + laneH * (i + 0.5) + 2,
        phase: i * 1.7,
      });
    });
    // しぶきは泳ぐ子より手前
    if (!this.root.exists(this.splash)) this.root.add(this.splash);
    this.root.bringToTop(this.splash);
  }

  /** 水面（さざ波が流れる）。高地合宿は奥に山の影を足す。 */
  private drawWater(altitude: boolean): void {
    const g = this.water;
    g.clear();
    if (altitude) {
      g.fillStyle(0x3b5068, 1);
      g.fillTriangle(70, WATER_TOP, 112, WATER_TOP - 16, 154, WATER_TOP);
      g.fillTriangle(130, WATER_TOP, 176, WATER_TOP - 22, 222, WATER_TOP);
      g.fillStyle(0xecf0f1, 1);
      g.fillTriangle(168, WATER_TOP - 17, 176, WATER_TOP - 22, 184, WATER_TOP - 17);
    }
    g.fillStyle(0x1f6fa8, 1);
    g.fillRoundedRect(6, WATER_TOP, W - 12, WATER_H, 6);
    // コースロープ（泳ぐ子が1人なら引かない）
    const lanes = Math.max(1, this.swimmers.length);
    if (lanes > 1) {
      for (let i = 1; i < lanes; i++) {
        const y = WATER_TOP + (WATER_H / lanes) * i;
        for (let x = 10; x < W - 10; x += 8) {
          g.fillStyle(i % 2 === 0 ? 0xe74c3c : 0xf7dc6f, 0.8);
          g.fillRect(x, y - 1, 4, 2);
        }
      }
    }
    // さざ波（時間で右へ流れる）
    g.lineStyle(1, 0x8fd3ff, 0.45);
    const shift = (this.t * 18) % 24;
    for (let row = 0; row < 3; row++) {
      const y = WATER_TOP + 6 + row * (WATER_H / 3);
      for (let x = 10 - 24 + shift + row * 8; x < W - 16; x += 24) {
        if (x < 10) continue;
        g.lineBetween(x, y, x + 8, y);
      }
    }
  }
}
