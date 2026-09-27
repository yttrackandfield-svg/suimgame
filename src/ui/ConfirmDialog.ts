import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 取り返しのつかない操作（削除など）は赤系にする。 */
  danger?: boolean;
}

/**
 * はい／いいえの確認ダイアログ。
 * セーブデータ削除のような取り返しのつかない操作の前に必ず挟む。
 */
export class ConfirmDialog {
  private readonly modal: Modal;

  constructor(
    scene: Phaser.Scene,
    opts: ConfirmOptions,
    private readonly onConfirm: () => void,
    private readonly onCancel: () => void = () => undefined,
  ) {
    const width = Math.min(460, GAME_WIDTH - 44);
    const wrapW = width - 48;
    // 折り返し行数をおおまかに見積もってパネル高さを決める
    const lines = opts.message
      .split("\n")
      .reduce((n, line) => n + Math.max(1, Math.ceil((line.length * 15) / wrapW)), 0);
    const height = 128 + lines * 24;

    this.modal = new Modal(
      scene,
      {
        width,
        height,
        title: opts.title,
        depth: 2700,
        closeOnBackdrop: false,
        showClose: false,
        accent: opts.danger ? "#e74c3c" : "#f7dc6f",
      },
      () => this.cancel(),
    );

    // 日本語は Phaser の既定の折り返しでは止まらない（→ ui/textWrap.ts）。
    // 確認の文は長いので、ここが効かないと枠からはみ出してボタンに重なる。
    const msg = this.modal.text(24, this.modal.contentTop + 4, "", 15, "#dfe6ec");
    setJaWrap(msg, wrapW);
    msg.setText(opts.message);
    msg.setLineSpacing(4);

    const by = height - 36;
    this.modal.button(width * 0.28, by, width * 0.42, 46, opts.cancelLabel ?? "やめる", () => this.cancel(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 16,
    });
    this.modal.button(
      width * 0.72,
      by,
      width * 0.42,
      46,
      opts.confirmLabel ?? "実行する",
      () => this.confirm(),
      opts.danger
        ? { color: 0x9c2f2f, hoverColor: 0xc0392b, fontSize: 16 }
        : { color: 0x2e7d5b, hoverColor: 0x3fa876, fontSize: 16 },
    );
  }

  destroy(): void {
    this.modal.destroy();
  }

  private confirm(): void {
    this.destroy();
    this.onConfirm();
  }

  private cancel(): void {
    this.destroy();
    this.onCancel();
  }
}
