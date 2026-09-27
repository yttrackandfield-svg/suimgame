import { bgm } from "../audio/bgm";
import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./Button";
import { settings, updateSettings, type GameSettings } from "../save/settings";
import { storageLabel } from "../save/storage";
import { clearAllSlots } from "../save/slots";
import type { Speed } from "../sim/clock";

export interface SettingsModalOptions {
  onClose: () => void;
  /** 「全セーブデータを削除」を出す（タイトル画面のみ。プレイ中は出さない）。 */
  allowWipe?: boolean;
  onWiped?: () => void;
}

/**
 * 設定モーダル（タイトル／プレイ中の両方から開ける）。
 * 設定は端末に1つ（セーブ枠とは独立）。
 */
export class SettingsModal {
  private readonly modal: Modal;
  private readonly autoBtns: Button[] = [];
  private readonly speedBtns: Button[] = [];
  private readonly toastBtns: Button[] = [];
  private readonly fpsBtns: Button[] = [];
  private readonly bgmBtns: Button[] = [];
  private readonly volBtns: Button[] = [];
  private confirm?: ConfirmDialog;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: SettingsModalOptions,
  ) {
    const width = Math.min(470, GAME_WIDTH - 30);
    const allowWipe = opts.allowWipe !== false;
    // 設定を1行足すごとに 62 増やす（row() の戻り値と同じ刻み）
    const height = allowWipe ? 718 : 648;

    this.modal = new Modal(
      scene,
      { width, height, title: "設定", depth: 2600 },
      () => this.close(),
    );

    let y = this.modal.contentTop + 6;

    y = this.row(y, "BGM", "ゲーム中の音楽を鳴らすかどうか", [
      { label: "ON", on: () => this.setBgm(true) },
      { label: "OFF", on: () => this.setBgm(false) },
    ], this.bgmBtns);

    y = this.row(y, "BGMの音量", "音楽の大きさ", [
      { label: "小", on: () => this.setVolume(1) },
      { label: "中", on: () => this.setVolume(2) },
      { label: "大", on: () => this.setVolume(3) },
    ], this.volBtns);

    y = this.row(y, "自動セーブ", "月替わりと大会のあとに自動で保存します", [
      { label: "ON", on: () => this.setAuto(true) },
      { label: "OFF", on: () => this.setAuto(false) },
    ], this.autoBtns);

    y = this.row(y, "はじめの速度", "クラスが始まったときのゲーム速度", [
      { label: "等倍", on: () => this.setSpeed(1) },
      { label: "2倍", on: () => this.setSpeed(2) },
      { label: "4倍", on: () => this.setSpeed(4) },
    ], this.speedBtns);

    y = this.row(y, "メッセージ表示", "画面上部のお知らせを出すかどうか", [
      { label: "ON", on: () => this.setToast(true) },
      { label: "OFF", on: () => this.setToast(false) },
    ], this.toastBtns);

    y = this.row(y, "動作の重さを表示", "画面左上にFPS（1秒あたりのコマ数）を小さく出す。ふだんは「出さない」でよい", [
      { label: "出す", on: () => this.setFps(true) },
      { label: "出さない", on: () => this.setFps(false) },
    ], this.fpsBtns);

    // 保存先の説明
    const line = scene.add.graphics();
    line.lineStyle(2, 0x2e4a66, 1);
    line.lineBetween(20, y + 2, width - 20, y + 2);
    this.modal.container.add(line);
    y += 14;

    this.modal.text(24, y, "セーブデータの保存先", 13, "#9fb3c4");
    {
      const t = this.modal.text(24, y + 20, "", 14, "#aed6f1", true);
      setJaWrap(t, width - 48);
      t.setText(storageLabel());
    }
    y += 52;

    if (allowWipe) {
      this.modal.button(width / 2, y + 16, width - 60, 40, "全セーブデータを削除", () => this.onWipe(), {
        color: 0x7f2f2f,
        hoverColor: 0xa8443a,
        fontSize: 14,
      });
      y += 44;
    }

    this.modal.button(width / 2, height - 34, width - 60, 46, "閉じる", () => this.close(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });

    this.sync();
  }

  destroy(): void {
    this.confirm?.destroy();
    this.modal.destroy();
  }

  // -------------------------------------------------------------- 行の組み立て

  private row(
    y: number,
    label: string,
    hint: string,
    choices: { label: string; on: () => void }[],
    out: Button[],
  ): number {
    /**
     * 【説明はボタンの下ではなく、ボタンの左で折り返す】
     * 説明を折り返さずに置いていたので、選択ボタン（右側）の下へ文字が潜り込んでいた。
     * 日本語は Phaser の既定の折り返しでは止まらないので setJaWrap を使う（→ ui/textWrap.ts）。
     * 高さは説明の行数で変わるので、次の行の y は実測して返す。
     */
    const bw = 66;
    const gap = 8;
    const right = this.modal.pw - 24;
    const btnW = choices.length * bw + (choices.length - 1) * gap;
    const textW = right - btnW - 24 - 14;

    this.modal.text(24, y, label, 16, "#ecf0f1", true);
    const hintText = this.modal.text(24, y + 22, "", 12.5, "#95a6b8");
    setJaWrap(hintText, textW);
    hintText.setText(hint);

    choices.forEach((c, i) => {
      const cx = right - (choices.length - 1 - i) * (bw + gap) - bw / 2;
      const btn = this.modal.button(cx, y + 18, bw, 36, c.label, c.on, {
        color: 0x2c3e50,
        hoverColor: 0x3d5a80,
        selectedColor: 0x2e7d5b,
        fontSize: 14,
      });
      out.push(btn);
    });
    return y + Math.max(62, 30 + hintText.height + 14);
  }

  private sync(): void {
    const s: GameSettings = settings();
    this.autoBtns[0]?.setSelected(s.autoSave);
    this.autoBtns[1]?.setSelected(!s.autoSave);
    const speeds: Speed[] = [1, 2, 4];
    this.speedBtns.forEach((b, i) => b.setSelected(s.defaultSpeed === speeds[i]));
    this.toastBtns[0]?.setSelected(s.showToast);
    this.toastBtns[1]?.setSelected(!s.showToast);
    this.fpsBtns[0]?.setSelected(s.showFps);
    this.fpsBtns[1]?.setSelected(!s.showFps);
    this.bgmBtns[0]?.setSelected(s.bgmOn);
    this.bgmBtns[1]?.setSelected(!s.bgmOn);
    this.volBtns.forEach((b, i) => b.setSelected(s.bgmVolume === i + 1));
  }

  private setBgm(v: boolean): void {
    void updateSettings({ bgmOn: v });
    bgm.configure(v, settings().bgmVolume);
    this.sync();
  }

  private setVolume(v: number): void {
    void updateSettings({ bgmVolume: v });
    bgm.configure(settings().bgmOn, v);
    this.sync();
  }

  private setFps(v: boolean): void {
    void updateSettings({ showFps: v });
    this.sync();
  }

  private setAuto(v: boolean): void {
    void updateSettings({ autoSave: v });
    this.sync();
  }

  private setSpeed(v: Speed): void {
    void updateSettings({ defaultSpeed: v });
    this.sync();
  }

  private setToast(v: boolean): void {
    void updateSettings({ showToast: v });
    this.sync();
  }

  // -------------------------------------------------------------- 全削除

  private onWipe(): void {
    this.confirm?.destroy();
    this.confirm = new ConfirmDialog(
      this.scene,
      {
        title: "全セーブデータを削除",
        message: "3つの枠すべてのセーブデータを消します。\n元に戻すことはできません。",
        confirmLabel: "すべて削除する",
        danger: true,
      },
      () => {
        void clearAllSlots().then(() => this.opts.onWiped?.());
        this.confirm = undefined;
      },
      () => {
        this.confirm = undefined;
      },
    );
  }

  private close(): void {
    this.opts.onClose();
  }
}
