import Phaser from "phaser";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { NewGameModal } from "../ui/NewGameModal";
import { clearSlot, formatPlayTime, formatSavedAt, listSlots, readSlot } from "../save/slots";
import type { SlotInfo } from "../save/types";
import type { FacilityInit } from "./FacilityScene";
import { applyRenderScale } from "../gfx/renderScale";

/**
 * データ選択画面（セーブ枠3つ）。
 *   使用中の枠 → クラブ名・年数・所持金・在籍数を表示。選ぶと続きから再開。
 *   空きの枠   → 「空き」。選ぶとクラブ名を決めて新規ゲーム開始。
 *   各枠に削除（取り返しがつかないので確認ダイアログを挟む）。
 */

const CARD_X = 20;
const CARD_W = GAME_WIDTH - 40;
const CARD_H = 176;
const CARD_TOP = 150;
const CARD_GAP = 20;

export class SlotScene extends Phaser.Scene {
  private cards!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private infos: SlotInfo[] = [];
  private confirm?: ConfirmDialog;
  private newGame?: NewGameModal;
  private busy = false;

  constructor() {
    super("Slot");
  }

  create(): void {
    applyRenderScale(this); // 論理540×960のまま、画素だけ細かく描く（→ gfx/renderScale.ts）
    this.infos = [];
    this.confirm = undefined;
    this.newGame = undefined;
    this.busy = false;

    this.cameras.main.setBackgroundColor(0x0d1b2a);

    const bg = this.add.graphics().setDepth(-100);
    bg.fillGradientStyle(0x123049, 0x123049, 0x0d1b2a, 0x0d1b2a, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fillStyle(0x1a3d5c, 1);
    bg.fillRect(0, 0, GAME_WIDTH, 96);
    bg.lineStyle(2, 0x2e4a66, 1);
    bg.lineBetween(0, 96, GAME_WIDTH, 96);

    this.add
      .text(GAME_WIDTH / 2, 40, "データを選ぶ", {
        fontFamily: "sans-serif",
        fontSize: "26px",
        color: COLORS.textLight,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 70, "3つの枠に別々のクラブを保存できる", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    this.cards = this.add.container(0, 0);
    this.statusText = this.add
      .text(GAME_WIDTH / 2, CARD_TOP + 200, "読み込み中…", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 62, 260, 52, "◀ タイトルへ戻る", () => this.toTitle(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });

    void this.refresh();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  // ---------------------------------------------------------------- 一覧

  private async refresh(): Promise<void> {
    this.infos = await listSlots();
    if (!this.scene.isActive()) return;
    this.statusText.setVisible(false);
    this.render();
  }

  private render(): void {
    this.cards.removeAll(true);
    this.infos.forEach((info, i) => this.buildCard(info, CARD_TOP + i * (CARD_H + CARD_GAP)));
  }

  private buildCard(info: SlotInfo, y: number): void {
    const used = !!info.header;
    const fill = info.broken ? 0x3a2430 : used ? 0x1b3b55 : 0x162736;

    const rect = this.add
      .rectangle(CARD_X + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H, fill, 1)
      .setStrokeStyle(2, used ? 0x3d78b0 : 0x2e4a66, 1)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.onPickSlot(info));
    this.cards.add(rect);

    const mk = (
      x: number,
      ty: number,
      s: string,
      size: number,
      color: string,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const t = this.add
        .text(x, ty, s, {
          fontFamily: "sans-serif",
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
        })
        .setOrigin(originX, 0);
      this.cards.add(t);
      return t;
    };

    // 枠番号のバッジ
    const badge = this.add.graphics();
    badge.fillStyle(used ? 0x3d78b0 : 0x2e4a66, 1);
    badge.fillRoundedRect(CARD_X + 14, y + 14, 62, 26, 6);
    this.cards.add(badge);
    mk(CARD_X + 45, y + 18, `枠 ${info.slot}`, 15, "#ffffff", true, 0.5);

    if (info.broken) {
      mk(CARD_X + 92, y + 16, "読み込めないデータ", 19, "#e74c3c", true);
      mk(CARD_X + 92, y + 46, "バージョンが違うか、壊れています。削除して作り直してください。", 12, "#c9a0a0");
      this.deleteButton(info, y);
      return;
    }

    if (!used) {
      mk(CARD_X + CARD_W / 2, y + 58, "空 き", 30, "#5f7c93", true, 0.5);
      mk(CARD_X + CARD_W / 2, y + 104, "タップして新しいゲームをはじめる", 14, "#95a6b8", false, 0.5);
      return;
    }

    const h = info.header!;
    mk(CARD_X + 92, y + 14, h.clubName, 21, "#f7dc6f", true);
    mk(CARD_X + 18, y + 56, `${h.year}年目 ${h.month}月`, 18, "#ecf0f1", true);
    mk(CARD_X + 150, y + 60, `在籍 ${h.members}名（選手・プロ ${h.athletes}名）`, 14, "#aed6f1");

    mk(CARD_X + 18, y + 92, `◆ ${h.gems}`, 17, "#f9e79f", true);
    mk(CARD_X + 120, y + 95, `人気 ${h.popularity}`, 14, "#aed6f1");
    mk(CARD_X + 220, y + 95, `プレイ ${formatPlayTime(h.playTimeMs)}`, 13, "#9fb3c4");

    mk(CARD_X + 18, y + 130, `最終セーブ ${formatSavedAt(h.savedAt)}`, 12, "#95a6b8");
    mk(CARD_X + CARD_W - 18, y + 128, "タップで再開 ▶", 14, "#2ecc71", true, 1);

    this.deleteButton(info, y);
  }

  private deleteButton(info: SlotInfo, y: number): void {
    const btn = new Button(
      this,
      CARD_X + CARD_W - 46,
      y + 27,
      70,
      30,
      "削除",
      () => this.onDelete(info),
      { color: 0x7f2f2f, hoverColor: 0xa8443a, fontSize: 13 },
    );
    this.cards.add(btn);
  }

  // ---------------------------------------------------------------- 操作

  private onPickSlot(info: SlotInfo): void {
    if (this.busy || this.confirm || this.newGame) return;
    if (info.broken) {
      this.onDelete(info);
      return;
    }
    if (info.header) {
      this.busy = true;
      void readSlot(info.slot).then((res) => {
        if (!res.ok) {
          this.busy = false;
          void this.refresh(); // 壊れていた → 一覧を作り直して赤カードにする
          return;
        }
        this.enterGame({ slot: info.slot, data: res.data });
      });
      return;
    }
    // 空き枠 → 新規ゲーム
    this.newGame = new NewGameModal(this, {
      slot: info.slot,
      onStart: (clubName) => {
        this.newGame?.destroy();
        this.newGame = undefined;
        this.enterGame({ slot: info.slot, clubName });
      },
      onClose: () => {
        this.newGame?.destroy();
        this.newGame = undefined;
      },
    });
  }

  private onDelete(info: SlotInfo): void {
    if (this.busy || this.confirm) return;
    const name = info.header?.clubName ?? "このデータ";
    this.confirm = new ConfirmDialog(
      this,
      {
        title: `枠${info.slot} を削除`,
        message: `「${name}」のセーブデータを消します。\n消したデータは元に戻せません。`,
        confirmLabel: "削除する",
        danger: true,
      },
      () => {
        this.confirm = undefined;
        void clearSlot(info.slot).then(() => this.refresh());
      },
      () => {
        this.confirm = undefined;
      },
    );
  }

  private enterGame(init: FacilityInit): void {
    this.busy = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Facility", init));
  }

  private toTitle(): void {
    if (this.busy) return;
    this.busy = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Title"));
  }
}
