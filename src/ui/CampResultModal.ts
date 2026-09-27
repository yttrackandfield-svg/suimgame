import { weeksLabel } from "../sim/weeks";
import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { STAT_LABEL } from "../sim/student";
import { CAMP_EVENT_COLOR, CAMP_EVENT_ICON } from "../sim/camp";
import type { CampOutcome } from "../sim/state";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";

/**
 * 合宿の成果。
 *
 * 合宿の設定画面（CampModal）は 780px 幅で組んであるため、540px の画面では
 * 0.67倍に縮められる＝**文字がそのぶん小さくなる**。設定の画面はボタンが主役なので
 * それでも押せるが、成果は「読む」画面なので小さいと何が起きたのか分からない。
 *
 * そこでこの画面だけは、縮小の掛からない幅（画面に収まる寸法）で組み直してある。
 * ここの幅を広げると、また全部の文字が小さくなるので**増やさないこと**。
 *
 * 参加者は全員ぶんを縦に並べ、多いときはスクロールで読める。
 */

export class CampResultModal {
  private readonly m: Modal;

  constructor(
    private readonly scene: Phaser.Scene,
    campLabel: string,
    outcomes: readonly CampOutcome[],
    onClose: () => void,
  ) {
    const injured = outcomes.filter((o) => o.injured).length;
    this.m = new Modal(
      scene,
      {
        width: Math.min(524, GAME_WIDTH - 16),
        height: Math.min(760, GAME_HEIGHT - 24),
        title: `🏕 ${campLabel}の成果`,
        subtitle: `参加 ${outcomes.length}人${injured > 0 ? `　故障 ${injured}人` : ""}`,
        depth: 2600,
      },
      onClose,
    );

    const footerH = 64;
    const top = this.m.contentTop + 6;
    this.m.enableScroll(top, this.m.ph - top - footerH);

    let y = top + 6;
    for (const o of outcomes) y = this.card(o, y);
    this.m.setContentHeight(y + 10);

    this.m.button(this.m.pw / 2, this.m.ph - 34, 220, 46, "閉じる", onClose, {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 17,
    });
  }

  destroy(): void {
    this.m.destroy();
  }

  /** 1人ぶんのカード。名前・効果・伸びた能力・起きたことを縦に積む。 */
  private card(o: CampOutcome, y: number): number {
    const body = this.m.body;
    const w = this.m.pw - 32 - this.m.scrollGutter;
    const left = 16;
    const g = this.scene.add.graphics();
    body.add(g);

    let ty = y + 10;
    this.m.text(left + 12, ty, o.student.name, 17, "#ffffff", true, body);
    this.m
      .text(left + w - 12, ty + 2, `効果 ${Math.round(o.mult * 100)}%`, 15, o.mult >= 2.6 ? "#f7dc6f" : "#aed6f1", true, body)
      .setOrigin(1, 0);
    ty += 26;

    // 伸びた能力（小数第1位まで。0.05未満は端数なので出さない）
    const parts = (Object.keys(o.gains) as (keyof typeof o.gains)[])
      .map((k) => ({ k, v: o.gains[k] }))
      .filter((p) => Math.abs(p.v) >= 0.05)
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
      .map((p) => `${STAT_LABEL[p.k]} ${p.v >= 0 ? "+" : ""}${Math.round(p.v)}`)
      .join("　");
    const gains = this.m.text(left + 12, ty, "", 15, "#dfe6ec", false, body);
    setJaWrap(gains, w - 24);
    gains.setText(parts.length > 0 ? parts : "伸びは見られなかった");
    ty += gains.height + 6;

    if (o.injured) {
      this.m.text(left + 12, ty, "⚠ 故障した（しばらく練習できない）", 14.5, "#e74c3c", true, body);
      ty += 22;
    }

    // 高地の効き（下山からの日数で大会のタイムが変わる）
    if (o.altitudeFailed) {
      this.m.text(left + 12, ty, "高地順応に失敗した", 14.5, "#e74c3c", true, body);
      ty += 22;
    } else if (o.bandLabel && o.descentToMeet !== null) {
      const t = this.m.text(
        left + 12,
        ty,
        `下山 ${weeksLabel(o.descentToMeet)}後が大会（${o.bandLabel}）`,
        14.5,
        o.descentToMeet < 0 ? "#e74c3c" : "#e8c07a",
        false,
        body,
      );
      setJaWrap(t, w - 24);
      ty += t.height + 4;
    }

    if (o.event) {
      const t = this.m.text(
        left + 12,
        ty,
        `${CAMP_EVENT_ICON[o.event.kind]} ${o.event.label}：${o.event.text}`,
        14,
        CAMP_EVENT_COLOR[o.event.kind],
        false,
        body,
      );
      setJaWrap(t, w - 24);
      ty += t.height + 4;
    }

    const h = ty + 10 - y;
    g.fillStyle(0x1c3550, 1);
    g.fillRoundedRect(left, y, w, h, 8);
    g.lineStyle(1, o.injured ? 0x8a4a4a : 0x2e4a66, 1);
    g.strokeRoundedRect(left, y, w, h, 8);
    body.sendToBack(g);

    return y + h + 10;
  }
}
