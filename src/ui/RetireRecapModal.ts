import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { classLabel } from "../sim/classes";
import { rankColor, rankLabel } from "../sim/rank";
import { formatTime, STROKE_LABEL } from "../sim/student";
import type { RetiredRecord } from "../sim/state";

/**
 * 引退の振り返り。
 *
 * 長く育てた選手を送り出す画面。数字を並べるだけでなく、
 * 「何年やって、何を残したのか」がひと目で分かる形にする。
 * 熟練度が高かった選手には**コーチの誘い**が出ていて、ここで雇える。
 * 育て上げた名選手が次の世代を育てる側に回る——クラブに歴史が積もる仕掛け。
 */

export interface RetireRecapCallbacks {
  /** コーチとして雇う（成功したら true）。誘いが無いときは undefined。 */
  onHire?: () => boolean;
  onClose: () => void;
}

const PAD = 24;

export class RetireRecapModal {
  private readonly modal: Modal;

  constructor(scene: Phaser.Scene, rec: RetiredRecord, cb: RetireRecapCallbacks) {
    const width = Math.min(468, GAME_WIDTH - 24);
    const height = Math.min(560, GAME_HEIGHT - 40);
    this.modal = new Modal(
      scene,
      {
        width,
        height,
        title: rec.byChoice ? "引退" : "引退（年齢）",
        subtitle: `${rec.name}　${rec.age}歳・${classLabel(rec.classId)}`,
        depth: 2700,
        closeOnBackdrop: false,
      },
      () => cb.onClose(),
    );
    const m = this.modal;
    const cw = width - PAD * 2;
    let y = m.contentTop + 6;

    // --- ねぎらいの一言（残したものに応じて変える）
    const head =
      rec.wins >= 10
        ? "クラブの歴史に名を刻む泳ぎだった。"
        : rec.wins > 0
          ? "何度もこのクラブに勝利を持ち帰ってくれた。"
          : "記録には残らなくても、水と向き合い続けた日々だった。";
    const lead = m.text(PAD, y, head, 14, "#f7dc6f", true, m.body);
    setJaWrap(lead, cw);
    y += lead.height + 12;

    // --- 残したもの
    const g = scene.add.graphics();
    m.body.add(g);
    const rows: [string, string, string][] = [
      ["格", `${rankLabel(rec.rankTier)}（${rec.rankTier}/8）`, rankColor(rec.rankTier)],
      ["通算優勝", rec.wins > 0 ? `${rec.wins} 回` : "なし", rec.wins > 0 ? "#2ecc71" : "#95a6b8"],
      [
        "自己ベスト",
        rec.bestTimeSec > 0 && rec.bestTimeEvent
          ? `${STROKE_LABEL[rec.bestTimeEvent.stroke]} ${rec.bestTimeEvent.distance}m　${formatTime(rec.bestTimeSec)}`
          : "記録なし",
        "#f9e79f",
      ],
      ["得意だった泳法", `${STROKE_LABEL[rec.bestStroke]}（熟練度 ${rec.bestProf}）`, "#aed6f1"],
      ["実績ポイント", `${rec.achievePoints}`, "#bdc3c7"],
    ];
    const rowH = 26;
    const boxH = rows.length * rowH + 12;
    g.fillStyle(0x0d1a26, 1);
    g.fillRoundedRect(PAD, y, cw, boxH, 6);
    g.lineStyle(2, 0x4d6b86, 0.9);
    g.strokeRoundedRect(PAD, y, cw, boxH, 6);
    rows.forEach(([label, value, color], i) => {
      const ry = y + 8 + i * rowH;
      m.text(PAD + 12, ry + 2, label, 12, "#95a6b8", false, m.body);
      m.text(PAD + 130, ry, value, 14, color, true, m.body);
    });
    y += boxH + 14;

    // --- コーチの誘い
    if (rec.coachOffer && cb.onHire) {
      const offer = rec.coachOffer;
      const note = m.text(
        PAD,
        y,
        `${rec.name} から「このクラブで指導したい」と申し出があった。\n` +
          `現役時代に磨いた ${STROKE_LABEL[rec.bestStroke]} の指導を得意とするコーチになる。`,
        13,
        "#7fd8c0",
        true,
        m.body,
      );
      setJaWrap(note, cw);
      y += note.height + 10;
      const info = m.text(PAD, y, `格 ${offer.coach.quality} ／ 雇用費 ◆${offer.cost}`, 12.5, "#9fb3c4", false, m.body);
      y += info.height + 10;

      const hireBtn = m.button(
        PAD + cw / 2,
        y + 22,
        cw,
        44,
        `コーチとして迎える（◆${offer.cost}）`,
        () => {
          if (cb.onHire?.()) {
            hireBtn.setLabel("迎え入れた");
            hireBtn.setEnabled(false);
          }
        },
        { color: 0x2e7d5b, hoverColor: 0x3fa876, fontSize: 14 },
        m.body,
      );
      y += 56;
      const skip = m.text(PAD, y, "見送っても、しばらくは待ってくれる（3ヶ月）。", 11.5, "#95a6b8", false, m.body);
      setJaWrap(skip, cw);
      y += skip.height + 8;
    }

    m.setContentHeight(y - m.contentTop + 12);
    m.button(width / 2, height - 34, width - 80, 44, "送り出す", () => cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });
  }

  destroy(): void {
    this.modal.destroy();
  }
}
