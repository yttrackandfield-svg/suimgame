import Phaser from "phaser";
import { setJaWrap } from "./textWrap";
import { FOOTER_H, GAME_HEIGHT, GAME_WIDTH, HUD_H, TILE_H, TILE_W } from "../config";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { isoToWorld } from "../iso/projection";
import {
  canPlaceAt,
  isPerimeter,
  landBounds,
  roomAt,
  type ClubMap,
} from "../sim/clubMap";
import { equipmentDef, roomSize, type Equipment, type RoomKind } from "../sim/equipment";
import { MAP } from "../config/balance";
import type { GameState } from "../sim/state";

/**
 * 建設モード。
 *
 * 施設のマップそのものを触る画面なので、モーダルで覆わずに
 * 「下に道具箱の帯を出し、マップを直接タップして操作する」形にしてある。
 *
 *   おく       … 未配置の部屋を選び、置きたい場所をタップ
 *   うごかす   … 置いてある部屋をタップして選び、行き先をタップ
 *   しまう     … 部屋をタップして倉庫へ戻す
 *
 * 置ける／置けないは触る前に色で分かるようにしている（緑＝OK、赤＝NG）。
 * 実際の判定・支払いはすべて GameState 側（sim/clubMap のルール）に任せる。
 */

export type BuildTool = "place" | "move" | "store";

export interface BuildCallbacks {
  /** マップが変わった（描き直しが要る）。 */
  onChanged: () => void;
  onClose: () => void;
  /** 案内メッセージを出す。 */
  onMessage: (text: string, color: string) => void;
  /**
   * 部屋の置き場所を決める画面（配置モード）へ渡す。
   * 倉庫から出すとき（cost=0）も、置いてあるものを動かすとき（移設費）も同じ画面を使う。
   */
  onBeginPlacement: (room: Equipment, moving: boolean) => void;
}

const TOOL_LABEL: Record<BuildTool, string> = {
  place: "おく",
  move: "うごかす",
  store: "しまう",
};

export class BuildOverlay {
  private readonly root: Phaser.GameObjects.Container;
  /** マップに重ねるガイド（選択中のマス・置ける範囲）。 */
  private readonly guide: Phaser.GameObjects.Graphics;
  private tool: BuildTool = "place";
  /** 「おく」で選んでいる未配置の部屋。 */
  private picked: Equipment | null = null;
  private hover: { gx: number; gy: number } | null = null;

  private readonly toolBtns = new Map<BuildTool, Button>();
  private landBtn!: Button;
  /** 敷地の購入確認（開いている間は他の操作をさせない）。 */
  private confirm?: ConfirmDialog;
  private info!: Phaser.GameObjects.Text;
  private pickText!: Phaser.GameObjects.Text;
  private pickBtns: Button[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly world: Phaser.GameObjects.Container,
    private readonly cb: BuildCallbacks,
  ) {
    this.root = scene.add.container(0, 0).setDepth(2600);
    this.guide = scene.add.graphics().setDepth(900_000);
    this.world.add(this.guide);
    this.build();
    this.refresh();
  }

  destroy(): void {
    this.confirm?.destroy();
    this.confirm = undefined;
    this.guide.destroy();
    this.landBtn?.destroy();
    for (const b of this.toolBtns.values()) b.destroy();
    for (const b of this.pickBtns) b.destroy();
    this.root.destroy(true);
  }

  get activeTool(): BuildTool {
    return this.tool;
  }

  // ---------------------------------------------------------------- 画面

  private build(): void {
    const top = GAME_HEIGHT - FOOTER_H;
    const g = this.scene.add.graphics();
    g.fillStyle(0x0d2233, 0.97);
    g.fillRect(0, top, GAME_WIDTH, FOOTER_H);
    g.lineStyle(3, 0xf7dc6f, 1);
    g.lineBetween(0, top, GAME_WIDTH, top);
    this.root.add(g);

    const title = this.scene.add
      .text(14, top + 8, "建設モード", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#f7dc6f",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.root.add(title);

    this.info = this.scene.add
      .text(110, top + 10, "", {
        fontFamily: "sans-serif",
        fontSize: "12.5px",
        color: "#aed6f1",
      })
      .setOrigin(0, 0);
    // 日本語は `wordWrap`（スペース区切り）では折り返らない（→ ui/textWrap.ts）
    setJaWrap(this.info, GAME_WIDTH - 230);
    this.root.add(this.info);

    const close = new Button(this.scene, GAME_WIDTH - 56, top + 22, 96, 36, "おわる", () => this.cb.onClose(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 14,
    });
    close.setDepth(2601);
    this.root.add(close);

    // 道具の切り替え（右端の1枠は道具ではなく「敷地を広げる」）
    const tools: BuildTool[] = ["place", "move", "store"];
    const slot = (GAME_WIDTH - 20) / (tools.length + 1);
    tools.forEach((t, i) => {
      const btn = new Button(
        this.scene,
        10 + slot * (i + 0.5),
        top + 84,
        slot - 5,
        50,
        TOOL_LABEL[t],
        () => this.setTool(t),
        { color: 0x39597e, hoverColor: 0x4a6f9c, fontSize: 12.5 },
      );
      btn.setDepth(2601);
      this.root.add(btn);
      this.toolBtns.set(t, btn);
    });

    this.landBtn = new Button(
      this.scene,
      10 + slot * (tools.length + 0.5),
      top + 84,
      slot - 5,
      50,
      "敷地を買う",
      () => this.askExpandLand(),
      { color: 0x7d5b1f, hoverColor: 0xa1782c, fontSize: 12.5 },
    );
    this.landBtn.setDepth(2601);
    this.root.add(this.landBtn);

    // 「倉庫の部屋：」の案内。部屋ボタンはこの下の行に並べる（重ならないように）。
    this.pickText = this.scene.add
      .text(14, top + 116, "", {
        fontFamily: "sans-serif",
        fontSize: "12.5px",
        color: "#9fb3c4",
      })
      .setOrigin(0, 0);
    setJaWrap(this.pickText, GAME_WIDTH - 28);
    this.root.add(this.pickText);
  }

  private setTool(t: BuildTool): void {
    this.tool = t;
    if (t !== "place") this.picked = null;
    this.refresh();
  }

  /** 道具の説明・所持金・未配置の部屋の一覧を出し直す。 */
  refresh(): void {
    for (const [t, b] of this.toolBtns) b.setSelected(t === this.tool);

    const usage = this.state.landUsage();
    const stranded = this.state.strandedRooms().length;
    const hints: Record<BuildTool, string> = {
      place: "下から部屋をえらび、置きたい場所をタップ",
      move: `動かす部屋をタップ → 行き先をタップ（◆${MAP.moveCost}）`,
      store: "部屋をタップすると倉庫に戻る（買い直しは不要）",
    };
    this.info.setText(
      `${hints[this.tool]}\n◆${this.state.gems}　敷地 ${usage.rooms}/${usage.total}マス使用` +
        (stranded > 0 ? `　⚠ 出入りできない部屋 ${stranded}` : ""),
    );

    for (const b of this.pickBtns) b.destroy();
    this.pickBtns = [];
    const top = GAME_HEIGHT - FOOTER_H;

    if (this.tool !== "place") {
      this.pickText.setText("");
      return;
    }

    const unplaced = this.state.unplacedEquipment();
    if (unplaced.length === 0) {
      this.pickText.setText("倉庫は空です。「設備」で部屋を買うと、ここから置けます。");
      return;
    }
    const extra = unplaced.length > 4 ? `（ほか${unplaced.length - 4}件）` : "";
    this.pickText.setText(`倉庫の部屋${extra}：えらぶと置き場所を決める画面になります`);

    // ボタンは案内文の下の行に並べる（文字の上に重ねない）
    const w = (GAME_WIDTH - 28 - 18) / 4;
    unplaced.slice(0, 4).forEach((e, i) => {
      const def = equipmentDef(e.kind);
      const f = roomSize(e);
      const btn = new Button(
        this.scene,
        14 + w / 2 + i * (w + 6),
        top + 176,
        w,
        46,
        `${def.label}(${f.w}×${f.h})`,
        () => {
          this.picked = e;
          this.apply(0, 0, false); // すぐ配置モードへ
        },
        { color: 0x394a5c, hoverColor: 0x4a6076, fontSize: 12 },
      );
      btn.setDepth(2601);
      this.pickBtns.push(btn);
    });
  }

  // ---------------------------------------------------------------- 操作

  /** ステージ内のタップ／ドラッグ位置（ワールド座標）を受け取る。 */
  pointerAt(gx: number, gy: number): void {
    this.hover = { gx, gy };
    this.drawGuide();
  }

  clearHover(): void {
    this.hover = null;
    this.guide.clear();
  }

  /** タップ確定（またはドラッグ中の連続適用）。 */
  apply(gx: number, gy: number, dragging: boolean): void {
    switch (this.tool) {
      case "place": {
        // 倉庫から出す＝配置モードへ（費用なし）
        if (dragging) break;
        if (!this.picked) {
          this.cb.onMessage("先に置く部屋をえらぼう", "#e67e22");
          break;
        }
        this.cb.onBeginPlacement(this.picked, false);
        this.picked = null;
        break;
      }
      case "move": {
        // 置いてあるものを動かす＝配置モードへ（移設費）
        if (dragging) break;
        const room = this.state.roomAtCell(gx, gy);
        if (!room) {
          this.cb.onMessage("動かす部屋をタップしよう", "#e67e22");
          break;
        }
        this.cb.onBeginPlacement(room, true);
        break;
      }
      case "store": {
        if (dragging) break;
        const room = this.state.roomAtCell(gx, gy);
        if (!room) break;
        const r = this.state.storeRoom(room);
        if (!r.ok) {
          this.cb.onMessage(r.reason ?? "しまえない", "#e67e22");
          break;
        }
        this.cb.onMessage(`${equipmentDef(room.kind).label} を倉庫にしまった`, "#aed6f1");
        this.changed();
        break;
      }
    }
  }

  /** 敷地の拡張。値段が大きいので必ず確認を挟む。 */
  private askExpandLand(): void {
    if (this.confirm) return;
    const st = this.state.canExpandLand();
    if (!st.ok) {
      this.cb.onMessage(st.reason ?? "広げられない", "#e67e22");
      return;
    }
    const cost = this.state.landExpandCost();
    const before = this.state.landSize();
    const after = before + MAP.expandStep;
    this.confirm = new ConfirmDialog(
      this.scene,
      {
        title: "敷地を買い足す",
        message:
          `まわりの土地を買って、敷地を ${before}×${before} から ${after}×${after} マスに広げます。
` +
          `費用 ◆${cost}（所持 ◆${this.state.gems} → ◆${this.state.gems - cost}）

` +
          `※ 次に広げるときは ◆${Math.round(cost * MAP.landCostGrowth)} かかります。`,
        confirmLabel: "買う",
      },
      () => {
        this.confirm = undefined;
        const r = this.state.expandLand();
        if (!r.ok) {
          this.cb.onMessage(r.reason ?? "広げられなかった", "#e67e22");
          return;
        }
        this.cb.onMessage(`敷地が ${r.size}×${r.size} マスになった！`, "#f7dc6f");
        this.changed();
      },
      () => {
        this.confirm = undefined;
      },
    );
  }

  /** 確認ダイアログを開いている間か（カメラ・タップを止める）。 */
  get busy(): boolean {
    return !!this.confirm;
  }

  private changed(): void {
    this.refresh();
    this.cb.onChanged();
    this.drawGuide();
  }

  // ---------------------------------------------------------------- ガイド表示

  /**
   * 触ろうとしている場所を色で示す。
   * 「おく」「うごかす」は配置モードのゴーストが担当するので、ここでは扱わない。
   */
  private drawGuide(): void {
    const g = this.guide;
    g.clear();
    const h = this.hover;
    if (!h) return;
    const map = this.state.map();

    // move（持つ前）／store：部屋をまるごと光らせる
    const room = roomAt(map, h.gx, h.gy);
    if (room && room.gx != null && room.gy != null) {
      const f = roomSize(room);
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) this.tile(g, room.gx + x, room.gy + y, 0xf7dc6f, 0.35);
      }
    } else {
      this.tile(g, h.gx, h.gy, 0x7f8fa6, 0.3);
    }
  }

  private tile(g: Phaser.GameObjects.Graphics, gx: number, gy: number, color: number, alpha: number): void {
    if (gx < 0 || gy < 0 || gx >= MAP.cols || gy >= MAP.rows) return;
    const p = isoToWorld(gx, gy);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    g.fillStyle(color, isPerimeter(this.state.map(), gx, gy) ? alpha * 0.4 : alpha);
    g.beginPath();
    g.moveTo(p.x, p.y - hh);
    g.lineTo(p.x + hw, p.y);
    g.lineTo(p.x, p.y + hh);
    g.lineTo(p.x - hw, p.y);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, color, 0.9);
    g.strokePath();
  }

  /** 建設モード中はステージ全体がキャンバスになる。 */
  static stageBounds(): { top: number; bottom: number } {
    return { top: HUD_H, bottom: GAME_HEIGHT - FOOTER_H };
  }
}

/** ある部屋の一覧を「置いてある／倉庫」で分けて数える（案内文に使う）。 */
export function countPlacement(rooms: readonly Equipment[]): { placed: number; stored: number } {
  let placed = 0;
  let stored = 0;
  for (const e of rooms) {
    if (e.gx != null && e.gy != null) placed++;
    else stored++;
  }
  return { placed, stored };
}

/** その種類の部屋を建設モードで置けるか（案内用）。 */
export function canPlaceKindSomewhere(map: ClubMap, kind: RoomKind): boolean {
  const b = landBounds(map);
  for (let gy = b.y0; gy <= b.y1; gy++) {
    for (let gx = b.x0; gx <= b.x1; gx++) {
      if (canPlaceAt(map, kind, gx, gy).ok) return true;
    }
  }
  return false;
}
