import Phaser from "phaser";
import { setJaWrap } from "./textWrap";
import { FOOTER_H, GAME_HEIGHT, GAME_WIDTH, TILE_H, TILE_W } from "../config";
import { Button } from "./Button";
import { isoToWorld } from "../iso/projection";
import { MAP } from "../config/balance";
import { equipmentDef, footprintOf, rotOf, type RoomRot } from "../sim/equipment";
import { initialSpot, type PlacementState, type PlacementTarget } from "../sim/placement";
import type { GameState } from "../sim/state";

/**
 * 配置モード。
 *
 * 「買ってから置く」「置いたものを動かす」のどちらもこの画面で行う。
 *
 *  ・指の位置に半透明のゴーストが追従する
 *  ・占有するマスを緑（置ける）／赤（置けない）で塗る
 *  ・置けないときは理由を画面下部に1行で出す
 *  ・「回転」で縦と横を入れ替える（移設ならいまの向きから始まる → Equipment.rot）
 *  ・確定するまでお金は減らない。キャンセルすれば1円も減らない
 *
 * スマホで指がゴーストに隠れないよう、ゴーストは指より
 * 画面の上方向に PlacementOverlay.FINGER_OFFSET マスぶんずらして表示する。
 */

export interface PlacementCallbacks {
  /** 「ここに設置」。ここで初めて課金する。成功したら true を返すこと。 */
  onConfirm: (gx: number, gy: number, rot: RoomRot) => boolean;
  /** 取り消し（課金なし）。 */
  onCancel: () => void;
  /** 案内メッセージ。 */
  onMessage: (text: string, color: string) => void;
  /**
   * ゴーストの位置・大きさが変わった。
   * 指でなぞって動かしたとき以外（開始時など）に、画面の外へ出ていたら
   * カメラで追いかけてもらうために Scene へ知らせる。
   */
  onGhostMoved?: (gx: number, gy: number, w: number, h: number, byDrag: boolean) => void;
}

const OK_COLOR = 0x4ade80;
const NG_COLOR = 0xf87171;

export class PlacementOverlay {
  /** 指が隠れないように、ゴーストを何マスぶん上へずらすか。 */
  static readonly FINGER_OFFSET = 1.5;

  private readonly root: Phaser.GameObjects.Container;
  /** マップに重ねる占有マスの色。 */
  private readonly tiles: Phaser.GameObjects.Graphics;
  /** 設備そのものの半透明ゴースト。 */
  private readonly ghost: Phaser.GameObjects.Graphics;

  private state: PlacementState;
  private info!: Phaser.GameObjects.Text;
  private reasonText!: Phaser.GameObjects.Text;
  private confirmBtn!: Button;
  private rotateBtn!: Button;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameState,
    world: Phaser.GameObjects.Container,
    target: PlacementTarget,
    private readonly cb: PlacementCallbacks,
  ) {
    // 移設ならいまの向きから始める（新しく買うときは買ったときの向き）
    const rot: RoomRot = target.existing ? rotOf(target.existing) : 0;
    const spot = initialSpot(game.map(), target, rot);
    this.state = {
      target,
      gx: spot.gx,
      gy: spot.gy,
      rot,
      valid: false,
      reason: null,
      warning: null,
    };

    this.tiles = scene.add.graphics().setDepth(900_000);
    this.ghost = scene.add.graphics().setDepth(900_500);
    world.add(this.tiles);
    world.add(this.ghost);

    this.root = scene.add.container(0, 0).setDepth(2600);
    this.build();
    this.revalidate();
  }

  destroy(): void {
    this.tiles.destroy();
    this.ghost.destroy();
    this.confirmBtn.destroy();
    this.rotateBtn.destroy();
    this.root.destroy(true);
  }

  /** 移設か（元の場所へ戻せるように、Scene が知りたいことがある）。 */
  get moving(): boolean {
    return this.state.target?.moving ?? false;
  }

  // ---------------------------------------------------------------- 画面

  private build(): void {
    const top = GAME_HEIGHT - FOOTER_H;
    const g = this.scene.add.graphics();
    g.fillStyle(0x0d2233, 0.97);
    g.fillRect(0, top, GAME_WIDTH, FOOTER_H);
    g.lineStyle(3, 0x4ade80, 1);
    g.lineBetween(0, top, GAME_WIDTH, top);
    this.root.add(g);

    const title = this.state.target?.moving ? "移設モード" : "配置モード";
    this.root.add(
      this.scene.add
        .text(14, top + 8, title, {
          fontFamily: "sans-serif",
          fontSize: "15px",
          color: "#4ade80",
          fontStyle: "bold",
        })
        .setOrigin(0, 0),
    );

    this.root.add(
      this.scene.add
        .text(96, top + 10, "画面をなぞって場所を決める", {
          fontFamily: "sans-serif",
          fontSize: "12.5px",
          color: "#9fb3c4",
        })
        .setOrigin(0, 0),
    );

    // 設備名 / サイズ / 価格 / 現在資金 / 設置後残高
    this.info = this.scene.add
      .text(14, top + 32, "", {
        fontFamily: "sans-serif",
        fontSize: "12.5px",
        color: "#aed6f1",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    // 日本語は `wordWrap`（スペース区切り）では折り返らない（→ ui/textWrap.ts）
    setJaWrap(this.info, GAME_WIDTH - 28);
    this.root.add(this.info);

    // 置けない理由（1行）
    this.reasonText = this.scene.add
      .text(14, top + 54, "", {
        fontFamily: "sans-serif",
        fontSize: "12.5px",
        color: "#f87171",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    setJaWrap(this.reasonText, GAME_WIDTH - 28);
    this.root.add(this.reasonText);

    // フッターの下寄りに、指で押しやすい大きさで並べる
    const by = top + 172;
    const cancel = new Button(this.scene, 80, by, 136, 48, "キャンセル", () => this.cb.onCancel(), {
      color: 0x5a3a3a,
      hoverColor: 0x7f4a4a,
      fontSize: 15,
    });
    cancel.setDepth(2601);
    this.root.add(cancel);

    this.confirmBtn = new Button(this.scene, GAME_WIDTH - 106, by, 184, 48, "ここに設置", () => this.confirm(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 17,
    });
    this.confirmBtn.setDepth(2601);
    this.root.add(this.confirmBtn);

    // 回転（縦と横を入れ替える）。キャンセルと設置のあいだに置く
    this.rotateBtn = new Button(this.scene, 245, by, 158, 48, "↻ 回転", () => this.rotate(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });
    this.rotateBtn.setDepth(2601);
    this.root.add(this.rotateBtn);
  }

  // ---------------------------------------------------------------- 操作

  /** 指の位置（マップのマス）。ゴーストは指より上にずらして置く。 */
  moveTo(gx: number, gy: number): void {
    const t = this.state.target;
    if (!t) return;
    const f = footprintOf(t.kind, this.state.rot);
    // 指の1.5マス上を「設備の中心」にする（指で設備が隠れない）
    const off = PlacementOverlay.FINGER_OFFSET;
    const cx = Math.round(gx - off / 2 - (f.w - 1) / 2);
    const cy = Math.round(gy - off / 2 - (f.h - 1) / 2);
    if (cx === this.state.gx && cy === this.state.gy) return;
    this.state.gx = cx;
    this.state.gy = cy;
    this.revalidate(true);
  }

  /** いまのゴーストの位置と大きさ（カメラで追いかけるのに使う）。 */
  get spot(): { gx: number; gy: number; w: number; h: number } {
    const t = this.state.target;
    const f = t ? footprintOf(t.kind, this.state.rot) : { w: 1, h: 1 };
    return { gx: this.state.gx, gy: this.state.gy, w: f.w, h: f.h };
  }

  private confirm(): void {
    if (!this.state.valid) {
      this.cb.onMessage(this.state.reason ?? "ここには置けません", "#e74c3c");
      return;
    }
    this.cb.onConfirm(this.state.gx, this.state.gy, this.state.rot);
  }

  /**
   * 縦と横を入れ替える。ゴーストの中心がなるべく動かないように左上をずらす。
   * 置けるかどうかはその場で計算し直す（回すと入る／入らない、が変わるため）。
   */
  private rotate(): void {
    const t = this.state.target;
    if (!t) return;
    const before = footprintOf(t.kind, this.state.rot);
    const rot: RoomRot = this.state.rot === 1 ? 0 : 1;
    const after = footprintOf(t.kind, rot);
    this.state.rot = rot;
    this.state.gx = Math.round(this.state.gx + (before.w - after.w) / 2);
    this.state.gy = Math.round(this.state.gy + (before.h - after.h) / 2);
    this.revalidate();
  }

  /**
   * 可否を計算し直して、画面とマップの色を更新する。
   * byDrag=false のとき（開始時など）は、画面外に出ていないか Scene に見てもらう。
   */
  private revalidate(byDrag = false): void {
    const t = this.state.target;
    if (!t) return;
    const check = this.game.checkPlacement(t.kind, this.state.gx, this.state.gy, t.existing?.id, this.state.rot);
    this.state.valid = check.ok;
    this.state.reason = check.ok ? null : (check.reason ?? "ここには置けません");
    this.state.warning = check.warning ?? null;

    this.info.setText(this.game.placementSummary(t, this.state.rot));
    if (!check.ok) {
      this.reasonText.setText(`✕ ${this.state.reason}`).setColor("#f87171");
    } else if (this.state.warning) {
      this.reasonText.setText(`⚠ ${this.state.warning}`).setColor("#f7dc6f");
    } else {
      this.reasonText.setText("✓ ここに置けます").setColor("#4ade80");
    }
    // 情報行が2行に折り返しても理由と重ならないよう、実測した高さの下に置く
    this.reasonText.setY(this.info.y + this.info.height + 4);

    this.confirmBtn.setEnabled(check.ok);

    this.draw();
    const s = this.spot;
    this.cb.onGhostMoved?.(s.gx, s.gy, s.w, s.h, byDrag);
  }

  /** 占有マスの色分けと、設備のゴーストを描く。 */
  private draw(): void {
    const t = this.state.target;
    if (!t) return;
    const f = footprintOf(t.kind, this.state.rot);
    const color = this.state.valid ? OK_COLOR : NG_COLOR;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

    this.tiles.clear();
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const gx = this.state.gx + x;
        const gy = this.state.gy + y;
        if (gx < 0 || gy < 0 || gx >= MAP.cols || gy >= MAP.rows) continue;
        const p = isoToWorld(gx, gy);
        this.tiles.fillStyle(color, 0.35);
        this.tiles.beginPath();
        this.tiles.moveTo(p.x, p.y - hh);
        this.tiles.lineTo(p.x + hw, p.y);
        this.tiles.lineTo(p.x, p.y + hh);
        this.tiles.lineTo(p.x - hw, p.y);
        this.tiles.closePath();
        this.tiles.fillPath();
        this.tiles.lineStyle(2, color, 0.95);
        this.tiles.strokePath();
      }
    }

    // ゴースト：設備の輪郭を持ち上げた箱で示す（本番のスプライトが入るまでの見せ方）
    this.ghost.clear();
    const lift = 26;
    const corners = [
      isoToWorld(this.state.gx, this.state.gy),
      isoToWorld(this.state.gx + f.w, this.state.gy),
      isoToWorld(this.state.gx + f.w, this.state.gy + f.h),
      isoToWorld(this.state.gx, this.state.gy + f.h),
    ];
    const top = corners.map((c) => ({ x: c.x, y: c.y - hh - lift }));
    this.ghost.fillStyle(this.state.valid ? 0xffffff : NG_COLOR, 0.6);
    this.ghost.beginPath();
    this.ghost.moveTo(top[0].x, top[0].y);
    for (const p of top.slice(1)) this.ghost.lineTo(p.x, p.y);
    this.ghost.closePath();
    this.ghost.fillPath();
    this.ghost.lineStyle(2.5, this.state.valid ? 0x2e7d5b : 0xc0392b, 0.95);
    this.ghost.strokePath();
    // 立ち上がりの柱（浮いているように見せる）
    this.ghost.lineStyle(2, this.state.valid ? 0x2e7d5b : 0xc0392b, 0.75);
    for (let i = 0; i < 4; i++) {
      this.ghost.lineBetween(top[i].x, top[i].y, corners[i].x, corners[i].y - hh);
    }

    // 設備名をゴーストの上に出す
    void equipmentDef(t.kind);
  }

  /** 置ける状態か（Scene が確定ボタン以外から確かめたいとき用）。 */
  get canPlace(): boolean {
    return this.state.valid;
  }

  get warningText(): string | null {
    return this.state.warning;
  }
}
