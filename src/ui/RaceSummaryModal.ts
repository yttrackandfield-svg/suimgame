import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { formatTime, STROKE_LABEL, type RaceEvent } from "../sim/student";
import type { CompetitionResult } from "../sim/state";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";

/** 結果一覧の1レースぶん。 */
export interface RaceSummaryRow {
  compName: string;
  event: RaceEvent;
  result: CompetitionResult;
}

/**
 * 【その日の大会の結果一覧】（2026-09-27）
 *
 * 1日に何レースもあると、全部を会場で見ていくのが大変、と言われて足した画面。
 * 会場の「全結果へ ⏭⏭」を押すと、残りのレースはアニメーション無しで一気に泳ぎ、
 * その日に泳いだ**全レース**の結果をここに並べる（見ていたレースも含む）。
 *
 * 1レース＝見出し（大会名・種目）＋出場した選手ぶんの行（順位・タイム・自己ベスト・賞金）。
 * 多いときはスクロールで読む。
 */
export class RaceSummaryModal {
  private readonly m: Modal;

  constructor(
    private readonly scene: Phaser.Scene,
    rows: readonly RaceSummaryRow[],
    onClose: () => void,
  ) {
    const wins = rows.reduce((n, r) => n + r.result.entries.filter((e) => e.entrant.win).length, 0);
    const bests = rows.reduce((n, r) => n + r.result.entries.filter((e) => e.selfBest).length, 0);
    const net = rows.reduce((n, r) => n + r.result.totalGems + r.result.mayorPrize - r.result.entryCost, 0);
    this.m = new Modal(
      scene,
      {
        width: Math.min(524, GAME_WIDTH - 16),
        height: Math.min(820, GAME_HEIGHT - 24),
        title: "🏁 今日の大会の結果",
        subtitle: `${rows.length}レース　優勝 ${wins}　自己ベスト ${bests}　差し引き ◆${net >= 0 ? "+" : ""}${net}`,
        depth: 2600,
      },
      onClose,
    );

    const footerH = 64;
    const top = this.m.contentTop + 6;
    this.m.enableScroll(top, this.m.ph - top - footerH);
    let y = top + 6;
    for (const r of rows) y = this.race(r, y);
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

  /** 1レースぶん（見出し＋選手の行）。 */
  private race(r: RaceSummaryRow, y: number): number {
    const body = this.m.body;
    const w = this.m.pw - 32 - this.m.scrollGutter;
    const left = 16;
    const rowH = 38;
    const entries = r.result.entries;
    const h = 34 + Math.max(1, entries.length) * rowH + 8;
    const g = this.scene.add.graphics();
    g.fillStyle(0x1c3550, 1);
    g.fillRoundedRect(left, y, w, h, 8);
    g.lineStyle(1, 0x2e4a66, 1);
    g.strokeRoundedRect(left, y, w, h, 8);
    body.add(g);

    const head = this.m.text(
      left + 12,
      y + 8,
      `${r.compName}　${r.event.distance}m ${STROKE_LABEL[r.event.stroke]}`,
      14,
      "#f7dc6f",
      true,
      body,
    );
    setJaWrap(head, w - 24);
    let ty = y + 34;
    if (entries.length === 0) {
      this.m.text(left + 12, ty + 4, "出場できる選手がいなかった", 12.5, "#95a6b8", false, body);
    }
    for (const e of entries) {
      const fr = e.entrant.finalRank;
      const place = e.entrant.win
        ? "🏆 優勝"
        : fr != null
          ? `決勝 ${fr}位`
          : `予選 ${e.entrant.heatRank}位`;
      const placeColor = e.entrant.win ? "#f7dc6f" : fr != null && fr <= 3 ? "#7fd8c0" : "#ecf0f1";
      this.m.text(left + 12, ty, e.student.name, 13.5, "#ffffff", true, body);
      this.m.text(left + w - 12, ty, place, 13.5, placeColor, true, body).setOrigin(1, 0);
      // 下の段：タイム・自己ベスト・賞金
      const diff = e.prevBestSec > 0 ? e.prevBestSec - e.entrant.bestTime : 0;
      const pb = e.meetRecord ? "　🏅大会新" : e.selfBest ? (diff > 0 ? `　⏱自己ベスト −${diff.toFixed(2)}秒` : "　⏱初記録") : "";
      this.m.text(
        left + 12,
        ty + 18,
        `${formatTime(e.entrant.bestTime)}${pb}`,
        11.5,
        e.selfBest ? "#7fd1ae" : "#aed6f1",
        false,
        body,
      );
      this.m.text(left + w - 12, ty + 18, `◆+${e.reward.gems}`, 11.5, "#2ecc71", false, body).setOrigin(1, 0);
      ty += rowH;
    }
    return y + h + 10;
  }
}
