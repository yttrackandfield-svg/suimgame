import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./Button";
import { formatPlayTime, formatSavedAt } from "../save/slots";

export interface SaveAttempt {
  ok: boolean;
  reason?: string;
  savedAt?: number;
}

export interface SystemModalOptions {
  slot: number;
  clubName: string;
  lastSavedAt: number | null;
  playTimeMs: number;
  /** セーブを実行する（実処理はシーン側）。 */
  onSave: () => Promise<SaveAttempt>;
  onSettings: () => void;
  /** 説明書を開く（→ ui/ManualModal）。 */
  onManual: () => void;
  /** セーブしてからタイトルへ（true）／セーブせずタイトルへ（false）。 */
  onExitToTitle: (save: boolean) => void;
  onClose: () => void;
}

/**
 * システムメニュー（プレイ中）。セーブ・設定・タイトルへ戻る。
 * タイトルへ戻る操作は進行を失いうるので、必ず確認を挟む。
 */
export class SystemModal {
  private readonly modal: Modal;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly saveBtn: Button;
  private confirm?: ConfirmDialog;
  private saving = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: SystemModalOptions,
  ) {
    const width = Math.min(470, GAME_WIDTH - 30);
    const height = 512;

    this.modal = new Modal(
      scene,
      {
        width,
        height,
        title: "システム",
        subtitle: `${opts.clubName}（枠${opts.slot}）　プレイ ${formatPlayTime(opts.playTimeMs)}`,
        depth: 2600,
      },
      () => opts.onClose(),
    );

    let y = this.modal.contentTop + 6;

    this.statusText = this.modal.text(24, y, this.lastSavedLabel(), 13, "#9fb3c4");
    y += 30;

    this.saveBtn = this.modal.button(width / 2, y + 30, width - 60, 58, `💾 セーブする（枠${opts.slot}）`, () => this.onSave(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 20,
    });
    y += 74;

    this.modal.button(width / 2, y + 26, width - 60, 46, "⚙ 設定", () => opts.onSettings(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });
    y += 58;

    // 説明書（ゲームの遊び方。中身は data/manual.ts）
    this.modal.button(width / 2, y + 26, width - 60, 46, "📖 説明書", () => opts.onManual(), {
      color: 0x6b4a2f,
      hoverColor: 0x8e6a2f,
      fontSize: 17,
    });
    y += 62;

    this.modal.button(width / 2, y + 26, width - 60, 46, "🏠 セーブしてタイトルへ", () => this.onExit(true), {
      color: 0x2c5f8f,
      hoverColor: 0x3d78b0,
      fontSize: 17,
    });
    y += 58;

    this.modal.button(width / 2, y + 24, width - 60, 38, "セーブせずにタイトルへ", () => this.onExit(false), {
      color: 0x5a3a3a,
      hoverColor: 0x7f4a4a,
      fontSize: 14,
    });

    this.modal.button(width / 2, height - 32, width - 60, 46, "閉じる", () => opts.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });
  }

  destroy(): void {
    this.confirm?.destroy();
    this.modal.destroy();
  }

  private lastSavedLabel(): string {
    return this.opts.lastSavedAt
      ? `最後のセーブ：${formatSavedAt(this.opts.lastSavedAt)}`
      : "このデータはまだ一度もセーブしていません";
  }

  private onSave(): void {
    if (this.saving) return;
    this.saving = true;
    this.saveBtn.setEnabled(false).setLabel("セーブ中…");
    void this.opts.onSave().then((res) => {
      this.saving = false;
      this.saveBtn.setEnabled(true).setLabel(`💾 セーブする（枠${this.opts.slot}）`);
      if (res.ok) {
        this.opts.lastSavedAt = res.savedAt ?? Date.now();
        this.statusText.setText(`✔ セーブしました　${this.lastSavedLabel()}`).setColor("#2ecc71");
      } else {
        this.statusText.setText(`⚠ ${res.reason ?? "セーブに失敗しました"}`).setColor("#e74c3c");
      }
    });
  }

  private onExit(save: boolean): void {
    if (this.confirm) return;
    this.confirm = new ConfirmDialog(
      this.scene,
      save
        ? {
            title: "タイトルへ戻る",
            message: "いまの進行をセーブしてから、タイトル画面へ戻ります。",
            confirmLabel: "セーブして戻る",
          }
        : {
            title: "セーブせずに戻る",
            message: "最後にセーブした時点より後の進行は失われます。\nそれでもタイトルへ戻りますか？",
            confirmLabel: "戻る",
            danger: true,
          },
      () => {
        this.confirm = undefined;
        this.opts.onExitToTitle(save);
      },
      () => {
        this.confirm = undefined;
      },
    );
  }
}
