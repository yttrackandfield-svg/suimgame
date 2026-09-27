import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { classLabel } from "../sim/classes";
import { rankColor, rankLabel, rankOf } from "../sim/rank";
import type { Student } from "../sim/student";
import { DORM } from "../config/balance";
import type { GameState } from "../sim/state";

/**
 * 寮の管理（寮の部屋をタップすると開く）。
 *
 * 上段…いま入っている人（タップで退寮）
 * 下段…入寮できる人＝**高校生以上**の一覧（タップで入寮）
 *
 * ベッドの数＝定員なので、部屋を増やせば同時に入れる人数が増える。
 */

export interface DormCallbacks {
  onChanged: () => void;
  onClose: () => void;
  /** 名前をタップしたとき（その選手の詳細へ）。 */
  onOpenStudent?: (s: Student) => void;
}

const ROW_H = 52;

export class DormModal {
  private readonly m: Modal;
  private readonly listTop: number;
  private summary!: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly cb: DormCallbacks,
  ) {
    this.m = new Modal(
      scene,
      {
        width: Math.min(640, GAME_WIDTH - 20),
        height: Math.min(820, GAME_HEIGHT - 30),
        title: "アスリート寮",
        subtitle: `ポッド1つに1人。入寮できるのは高校生から。1棟${DORM.capacityPerRoom}人まで。`,
        depth: 2560,
      },
      () => cb.onClose(),
    );

    this.summary = this.m.text(18, this.m.contentTop, "", 12.5, "#aed6f1", true);
    setJaWrap(this.summary, this.m.pw - 36);
    this.updateSummary();

    this.listTop = this.m.contentTop + this.summary.height + 12;
    this.m.enableScroll(this.listTop, this.m.ph - this.listTop - 62);

    this.m.button(this.m.pw / 2, this.m.ph - 32, 160, 42, "閉じる", () => this.cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });

    this.render();
  }

  destroy(): void {
    this.m.destroy();
  }

  private updateSummary(): void {
    const cap = this.state.dormCapacity();
    const used = this.state.dormResidents().length;
    const cost = Math.round(this.state.dormResidents().length * DORM.costPerHead);
    this.summary.setText(
      `ポッド ${used} / ${cap}人（アスリート寮 ${this.state.usableCount("dorm")}棟）` +
        (cost > 0 ? `　入寮者の食費など ◆${cost}/月` : "") +
        // 【主効果を先に書く】◆100万を払う理由は熟練度。回復だけだと風呂と区別が付かない
        `\n入寮すると泳法の熟練度が大きく伸びる。休養の効きとコンディションの戻りも良くなる。`,
    );
  }

  private render(): void {
    this.m.clearBody(true);
    this.updateSummary();

    const gutter = this.m.scrollGutter;
    const w = this.m.pw - 36 - gutter;
    let y = this.listTop + 4;

    const residents = this.state.dormResidents();
    y = this.section(`入寮中（${residents.length}人）`, y, w);
    if (residents.length === 0) {
      y = this.note("まだ誰も入っていない。下の一覧から選ぼう。", y, w);
    } else {
      for (const s of residents) y = this.row(s, y, w, true);
    }

    y += 10;
    const candidates = this.state.dormCandidates();
    y = this.section(`入寮できる選手（高校生以上・${candidates.length}人）`, y, w);
    if (candidates.length === 0) {
      y = this.note("高校生以上の選手がいない（選手・プロに上げよう）。", y, w);
    } else {
      const free = this.state.dormFree();
      for (const s of candidates) y = this.row(s, y, w, false, free <= 0 ? "満室" : undefined);
    }

    this.m.setContentHeight(y - this.listTop + 16);
  }

  private section(label: string, y: number, w: number): number {
    const t = this.m.text(20, y, "", 14, "#f7dc6f", true, this.m.body);
    setJaWrap(t, w);
    t.setText(label);
    return y + 26;
  }

  private note(text: string, y: number, w: number): number {
    const t = this.m.text(28, y, text, 12.5, "#9fb0c2", false, this.m.body);
    setJaWrap(t, w - 20);
    return y + t.height + 10;
  }

  /** 1人ぶんの行（タップで入寮／退寮）。 */
  private row(s: Student, y: number, w: number, resident: boolean, disabled?: string): number {
    const body = this.m.body;
    const rect = this.scene.add
      .rectangle(18 + w / 2, y + ROW_H / 2 - 4, w, ROW_H - 8, resident ? 0x1f4a3a : 0x1c3550, 1)
      .setStrokeStyle(1, resident ? 0x2ecc71 : 0x2e4a66, 1);
    body.add(rect);

    const tier = rankOf(s);
    this.m.text(30, y + 6, s.name, 14.5, "#ecf0f1", true, body);
    this.m.text(30, y + 26, `${classLabel(s.classId)}・${s.grade}`, 11.5, "#9fb0c2", false, body);
    this.m
      .text(18 + w - 96, y + 8, rankLabel(tier), 11.5, rankColor(tier), false, body)
      .setOrigin(1, 0);

    const label = disabled ?? (resident ? "退寮" : "入寮");
    this.m.button(
      18 + w - 44,
      y + ROW_H / 2 - 4,
      68,
      32,
      label,
      () => {
        if (disabled) return;
        if (resident) this.state.leaveDorm(s);
        else {
          const r = this.state.enterDorm(s);
          if (!r.ok) return;
        }
        this.render();
        this.cb.onChanged();
      },
      {
        color: disabled ? 0x3a4a5c : resident ? 0x5a3a3a : 0x2e7d5b,
        hoverColor: disabled ? 0x3a4a5c : resident ? 0x7f4a4a : 0x3fa876,
        fontSize: 12,
      },
      body,
    );

    // 名前のあたりをタップすると、その選手の詳細へ
    if (this.cb.onOpenStudent) {
      const zone = this.scene.add.zone(18 + (w - 110) / 2, y + ROW_H / 2 - 4, w - 110, ROW_H - 10).setInteractive();
      zone.on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        this.cb.onOpenStudent?.(s);
      });
      body.add(zone);
    }
    return y + ROW_H;
  }
}
