import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";

/**
 * 一覧から1つ選ぶ画面（クラス選び・コーチ選びなど）。
 *
 * ◀▶ の送り送りは「今なにが選べるのか」が見えないので、
 * 候補を全部並べて、選べないものは理由を添えて押せなくする。
 * ◀▶ も残してあるので、細かい調整はそちらでもできる。
 */

export interface PickerOption<T> {
  value: T;
  label: string;
  /** 補足（コーチの格・給料など）。 */
  note?: string;
  /** 選べない理由（あると押せない）。 */
  disabled?: string;
  color?: string;
}

const ROW_H = 56;

export class PickerModal<T> {
  private readonly m: Modal;

  constructor(
    scene: Phaser.Scene,
    title: string,
    subtitle: string,
    options: readonly PickerOption<T>[],
    current: T,
    private readonly onPick: (v: T) => void,
    private readonly onClose: () => void,
  ) {
    const w = Math.min(560, GAME_WIDTH - 24);
    const h = Math.min(GAME_HEIGHT - 40, 150 + options.length * ROW_H + 60);
    this.m = new Modal(scene, { width: w, height: h, title, subtitle, depth: 2700 }, () => onClose());

    const top = this.m.contentTop + 6;
    const viewH = h - top - 64;
    this.m.enableScroll(top, viewH);

    const gutter = this.m.scrollGutter;
    const rowW = w - 36 - gutter;
    let y = top + 4;
    for (const opt of options) {
      const chosen = opt.value === current;
      const rect = scene.add
        .rectangle(18 + rowW / 2, y + ROW_H / 2 - 4, rowW, ROW_H - 8, chosen ? 0x1f4a3a : 0x1c3550, 1)
        .setStrokeStyle(2, chosen ? 0x2ecc71 : opt.disabled ? 0x3a4a5c : 0x2e4a66, 1);
      this.m.body.add(rect);

      const name = this.m.text(
        32,
        y + 8,
        `${chosen ? "✓ " : ""}${opt.label}`,
        15,
        opt.disabled ? "#95a6b8" : opt.color ?? "#ecf0f1",
        true,
        this.m.body,
      );
      setJaWrap(name, rowW - 40);
      const sub = opt.disabled ? `⚠ ${opt.disabled}` : opt.note ?? "";
      if (sub) {
        const t = this.m.text(32, y + 8 + name.height + 2, sub, 11.5, opt.disabled ? "#e59866" : "#9fb0c2", false, this.m.body);
        setJaWrap(t, rowW - 40);
      }

      if (!opt.disabled) {
        const zone = scene.add.zone(18 + rowW / 2, y + ROW_H / 2 - 4, rowW, ROW_H - 8).setInteractive();
        zone.on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.();
          this.onPick(opt.value);
        });
        this.m.body.add(zone);
      }
      y += ROW_H;
    }
    this.m.setContentHeight(y - top + 12);

    this.m.button(w / 2, h - 32, 160, 42, "閉じる", () => this.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });
  }

  destroy(): void {
    this.m.destroy();
  }
}
