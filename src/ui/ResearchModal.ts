import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { PickerModal, type PickerOption } from "./PickerModal";
import { setJaWrap } from "./textWrap";
import { coachRankLabel, teachingColor, teachingLabel } from "../sim/coach";
import {
  effectSummaryAt,
  monthsRemaining,
  researchTopic,
  type ResearchProject,
  type ResearchTopic,
} from "../sim/research";
import { RESEARCH } from "../config/balance";
import type { GameState } from "../sim/state";

/**
 * 研究（会議室）。
 *
 * 【しくみ】
 *  ・**会議室1部屋につき1つの研究**。部屋を増やせば並行して進められる。
 *  ・1つの研究に**コーチ4人1組**が要る。班が欠けるとその研究は止まる。
 *  ・同じテーマは**何度でも重ねられ、そのたびにレベルが上がる**。
 *    レベルが上がるほど効果は大きいが、費用・必要ポイント・**失敗率**も上がる。
 *  ・研究に参加したコーチは**指導力が伸びる**（失敗しても伸びる）。
 *
 * 【画面】
 *  進行中 … 会議室ごとのカード（進捗バー／残り月数／失敗率／班の4人）
 *  テーマ … 次に上げられるレベルと、その費用・失敗率
 *  完了   … 到達レベルと、いま効いている効果
 */

export interface ResearchCallbacks {
  onChanged: () => void;
  /** コーチ画面へ（一覧から詳細を見たいとき）。 */
  onOpenCoaches: () => void;
  onClose: () => void;
}

type Tab = "active" | "todo" | "done";

/** テーマ1行ぶんの高さ（説明が2行に折り返しても下の行に重ならない高さ）。 */
const ROW_H = 122;
/** 進行中カードの高さ（バー＋班の4人ぶん）。 */
const CARD_H = 214;

export class ResearchModal {
  private readonly modal: Modal;
  private readonly width: number;
  private readonly height: number;
  private readonly listTop: number;
  private readonly tabBtns: Button[] = [];
  private tab: Tab = "active";
  private head!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  /** コーチを選ぶ一覧（班に入れる／入れ替える）。 */
  private picker?: PickerModal<number>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly cb: ResearchCallbacks,
  ) {
    this.width = Math.min(516, GAME_WIDTH - 20);
    this.height = Math.min(880, GAME_HEIGHT - 40);

    this.modal = new Modal(
      scene,
      {
        width: this.width,
        height: this.height,
        title: "研究（会議室）",
        subtitle: `会議室1部屋につき1つ、コーチ${RESEARCH.groupSize}人1組で進める。参加したコーチは指導力が伸びる。`,
        depth: 2500,
      },
      () => cb.onClose(),
    );

    const top = this.modal.contentTop;
    this.head = this.modal.text(20, top, "", 13, "#f9e79f", true);
    this.sub = this.modal.text(20, top + 20, "", 12, "#aed6f1");
    setJaWrap(this.sub, this.width - 40);

    const tabs: [Tab, string][] = [
      ["active", "進行中"],
      ["todo", "テーマ"],
      ["done", "到達レベル"],
    ];
    const tw = (this.width - 40 - 12) / 3;
    tabs.forEach(([id, label], i) => {
      this.tabBtns.push(
        this.modal.button(20 + tw / 2 + i * (tw + 6), top + 78, tw, 38, label, () => this.setTab(id), {
          fontSize: 14,
        }),
      );
    });

    this.listTop = top + 102;
    const listH = this.height - this.listTop - 66;

    const halfW = (this.width - 56 - 8) / 2;
    this.modal.button(28 + halfW / 2, this.height - 30, halfW, 44, "コーチ一覧", () => cb.onOpenCoaches(), {
      color: 0x39597e,
      hoverColor: 0x4a6f9c,
      fontSize: 15,
    });
    this.modal.button(28 + halfW + 8 + halfW / 2, this.height - 30, halfW, 44, "閉じる", () => cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 16,
    });

    this.modal.enableScroll(this.listTop, listH);
    this.setTab(this.state.researchProjects.length > 0 ? "active" : "todo");
  }

  destroy(): void {
    this.closePicker();
    this.modal.destroy();
  }

  private closePicker(): void {
    this.picker?.destroy();
    this.picker = undefined;
  }

  // ---------------------------------------------------------------- 操作

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.tabBtns.forEach((b, i) => b.setSelected(i === ["active", "todo", "done"].indexOf(tab)));
    this.render();
  }

  private start(topic: ResearchTopic): void {
    const r = this.state.startResearch(topic.id);
    if (!r.ok) return;
    this.setTab("active");
    this.cb.onChanged();
  }

  private cancel(roomId: number): void {
    this.state.cancelResearch(roomId);
    this.render();
    this.cb.onChanged();
  }

  /** 班のメンバーを選び直す（空き枠のタップ＝加入、在籍のタップ＝外す）。 */
  private pickMember(project: ResearchProject, slot: number): void {
    const current = project.coachIds[slot];
    if (current != null) {
      this.state.removeResearchMember(project.roomId, current);
      this.render();
      this.cb.onChanged();
      return;
    }
    const free = this.state.freeCoachesForResearch();
    if (free.length === 0) return;
    this.closePicker();
    const options: PickerOption<number>[] = free.map((c) => ({
      value: c.id,
      label: `${c.name}　${coachRankLabel(c.quality)}`,
      note: `指導力 ${Math.round(c.teaching)}（${teachingLabel(c.teaching)}）　担当 ${this.state.coachDutyCount(c.id)}コマ`,
      color: teachingColor(c.teaching),
    }));
    this.picker = new PickerModal<number>(
      this.scene,
      "研究班に入れるコーチ",
      "指導力が高いほど研究が速く進み、失敗しにくくなる。研究に入ると指導力も伸びる。",
      options,
      -1,
      (id: number) => {
        this.state.addResearchMember(project.roomId, id);
        this.closePicker();
        this.render();
        this.cb.onChanged();
      },
      () => this.closePicker(),
    );
  }

  // ---------------------------------------------------------------- 描画

  private render(): void {
    this.modal.clearBody(true);

    const rooms = this.state.researchSlots();
    const running = this.state.researchProjects.length;
    const rate = this.state.researchRate();
    this.head.setText(
      `所持 ◆${this.state.gems}　　会議室 ${rooms}部屋（研究 ${running}件）　　進み ${Math.round(rate)}/月`,
    );

    if (rooms === 0) {
      this.sub.setText("会議室がありません。「設備」から会議室を建てると研究を始められます。").setColor("#e67e22");
    } else if (running === 0) {
      this.sub
        .setText(`「テーマ」から研究を始めよう。1件につき空いているコーチ${RESEARCH.groupSize}人が要る。`)
        .setColor("#aed6f1");
    } else {
      const short = this.state.researchProjects.filter(
        (p) => p.coachIds.length < RESEARCH.groupSize,
      ).length;
      this.sub
        .setText(
          short > 0
            ? `⚠ ${short}件の研究が班の人数不足で止まっています（${RESEARCH.groupSize}人そろえよう）`
            : `研究班 ${running}組が動いています。参加中のコーチは毎月 指導力が伸びます。`,
        )
        .setColor(short > 0 ? "#e67e22" : "#aed6f1");
    }

    let y = this.listTop + 6;
    if (this.tab === "active") y = this.renderActive(y);
    else if (this.tab === "todo") y = this.renderTodo(y);
    else y = this.renderDone(y);

    this.modal.setContentHeight(y + 16);
  }

  // ---- 進行中（会議室ごとのカード）

  private renderActive(top: number): number {
    const rooms = this.state.meetingRooms();
    if (rooms.length === 0) {
      this.note(top, "会議室がありません。建ててから研究を始めましょう。");
      return top + 40;
    }
    let y = top;
    rooms.forEach((room, i) => {
      const project = this.state.projectAt(room.id);
      y = project ? this.buildProjectCard(project, y, i + 1) : this.buildEmptyRoom(y, i + 1);
    });
    return y;
  }

  private buildEmptyRoom(top: number, index: number): number {
    const h = 74;
    const rect = this.scene.add
      .rectangle(this.center(), top + h / 2 - 6, this.rowW(), h - 12, 0x172636, 1)
      .setStrokeStyle(2, 0x2a3d4f, 1);
    this.modal.body.add(rect);
    this.mk(34, top + 10, `会議室 ${index}　　空いています`, 14, "#8fa3b5", true);
    this.mk(34, top + 32, "「テーマ」タブから研究を選ぶと、ここで進みはじめます。", 11.5, "#95a6b8");
    return top + h;
  }

  private buildProjectCard(project: ResearchProject, top: number, index: number): number {
    const topic = researchTopic(project.id);
    if (!topic) return top;

    const need = this.state.projectPoints(project);
    const rate = this.state.projectRate(project);
    const left = monthsRemaining(need, project.progress, rate);
    const ratio = Math.min(1, need > 0 ? project.progress / need : 0);
    const members = this.state.membersOf(project);
    const short = members.length < RESEARCH.groupSize;
    const fail = this.state.projectFailChance(project);

    const rect = this.scene.add
      .rectangle(this.center(), top + CARD_H / 2 - 6, this.rowW(), CARD_H - 12, 0x1c3550, 1)
      .setStrokeStyle(2, short ? 0xe67e22 : 0x3d78b0, 1);
    this.modal.body.add(rect);

    this.mk(34, top + 8, `会議室 ${index}`, 11.5, "#95a6b8", true);
    setJaWrap(
      this.mk(34, top + 24, `${topic.label}　Lv${project.targetLevel} を目指す`, 16, "#f7dc6f", true),
      this.rowW() - 150,
    );

    // 進捗バー
    const barY = top + 52;
    const barW = this.rowW() - 40;
    const g = this.scene.add.graphics();
    g.fillStyle(0x0d1c2b, 1);
    g.fillRoundedRect(34, barY, barW, 14, 7);
    g.fillStyle(short ? 0x7f8fa6 : 0x2ecc71, 1);
    g.fillRoundedRect(34, barY, Math.max(14, barW * ratio), 14, 7);
    this.modal.body.add(g);

    this.mk(34, barY + 20, `${Math.round(project.progress)} / ${need} ポイント（${Math.round(rate)}/月）`, 12, "#dfe6ec", true);
    this.mk(
      34,
      barY + 38,
      left === null
        ? `⚠ 研究班が ${members.length}/${RESEARCH.groupSize}人。そろうまで進みません`
        : left === 0
          ? "今月中に決着します"
          : `完成まで あと約${left}ヶ月`,
      12,
      left === null ? "#e67e22" : "#aed6f1",
      true,
    );
    // 失敗率（レベルが高いほど上がり、班の指導力で下がる）
    this.mk(
      34,
      barY + 56,
      `成功すると：${effectSummaryAt(topic, project.targetLevel)}`,
      11.5,
      "#2ecc71",
      true,
    );
    this.mk(
      34,
      barY + 74,
      `失敗する見込み ${Math.round(fail * 100)}%（失敗すると進捗が半分に戻る／班の指導力は上がる）`,
      11,
      fail >= 0.2 ? "#e74c3c" : "#e59866",
    );

    // 研究班（4枠）。枠をタップして入れ替える。
    const slotY = top + CARD_H - 44;
    this.mk(34, slotY - 18, `研究班（${members.length}/${RESEARCH.groupSize}）　枠をタップで入れ替え`, 11, "#95a6b8");
    const sw = (this.rowW() - 40 - 6 * (RESEARCH.groupSize - 1)) / RESEARCH.groupSize;
    for (let i = 0; i < RESEARCH.groupSize; i++) {
      const c = members[i];
      const btn = new Button(
        this.scene,
        34 + sw / 2 + i * (sw + 6),
        slotY + 8,
        sw,
        34,
        c ? `${c.name.replace("コーチ", "")} ${Math.round(c.teaching)}` : "＋ 追加",
        () => this.pickMember(project, i),
        {
          color: c ? 0x2c5f8f : 0x3a3f4a,
          hoverColor: c ? 0x3d78b0 : 0x50565f,
          fontSize: 12.5,
        },
      );
      this.modal.body.add(btn);
      if (!c && this.state.freeCoachesForResearch().length === 0) btn.setEnabled(false);
    }

    const cancel = new Button(
      this.scene,
      this.center() + this.rowW() / 2 - 52,
      top + 30,
      84,
      30,
      "中止",
      () => this.cancel(project.roomId),
      { color: 0x5a3a3a, hoverColor: 0x7f4a4a, fontSize: 13 },
    );
    this.modal.body.add(cancel);

    return top + CARD_H;
  }

  // ---- テーマ（次のレベルを買う）

  private renderTodo(top: number): number {
    const running = new Set(this.state.researchProjects.map((p) => p.id));
    const list = this.state.availableResearch().filter((t) => !running.has(t.id));
    if (list.length === 0) {
      this.note(top, "いま始められるテーマはありません（進行中か、Lv上限に達しています）。");
      return top + 40;
    }
    let y = top;
    for (const topic of list) {
      this.buildTodoRow(topic, y);
      y += ROW_H;
    }
    return y;
  }

  private buildTodoRow(topic: ResearchTopic, y: number): void {
    const can = this.state.canStartResearch(topic.id);
    const pv = this.state.researchPreview(topic.id);
    if (!pv) return;
    const cur = this.state.researchLevelOf(topic.id);

    const rect = this.scene.add
      .rectangle(this.center(), y + ROW_H / 2 - 6, this.rowW(), ROW_H - 12, can.ok ? 0x1c3550 : 0x172636, 1)
      .setStrokeStyle(2, can.ok ? 0x3d78b0 : 0x2a3d4f, 1);
    this.modal.body.add(rect);

    // 文字の幅は「右のボタンに掛からない」ところまで。ここを広げると金額ボタンに重なる。
    const textW = this.rowW() - 150;
    setJaWrap(
      this.mk(34, y + 6, `${topic.label}　${cur > 0 ? `Lv${cur} → Lv${pv.level}` : "Lv1"}`, 15, can.ok ? "#e8f0f6" : "#8fa3b5", true),
      textW,
    );
    setJaWrap(this.mk(34, y + 28, topic.note, 11.5, "#cfd8e0"), textW);
    setJaWrap(
      this.mk(34, y + ROW_H - 62, `Lv${pv.level} の効果：${effectSummaryAt(topic, pv.level)}`, 11.5, "#2ecc71", true),
      textW,
    );
    this.mk(
      34,
      y + ROW_H - 42,
      `必要 ${pv.points}ポイント　失敗の見込み ${Math.round(pv.fail * 100)}%`,
      11.5,
      pv.fail >= 0.2 ? "#e74c3c" : "#9fb3c4",
    );
    this.mk(34, y + ROW_H - 24, `コーチ${RESEARCH.groupSize}人1組・会議室1部屋を使う`, 11, "#95a6b8");

    const bx = this.center() + this.rowW() / 2 - 62;
    const btn = new Button(this.scene, bx, y + 30, 108, 38, `◆${pv.cost}`, () => this.start(topic), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 15,
    });
    this.modal.body.add(btn);
    btn.setEnabled(can.ok);
    if (!can.ok && can.reason) {
      setJaWrap(this.mk(bx, y + 56, can.reason, 10.5, "#e67e22", true).setOrigin(0.5, 0), 130);
    }
  }

  // ---- 到達レベル

  private renderDone(top: number): number {
    const done = Object.entries(this.state.researchLevels)
      .map(([id, lv]) => ({ topic: researchTopic(id), lv }))
      .filter((d): d is { topic: ResearchTopic; lv: number } => !!d.topic && d.lv > 0)
      .sort((a, b) => b.lv - a.lv);
    if (done.length === 0) {
      this.note(top, "まだ到達したレベルはありません。");
      return top + 40;
    }
    let y = top;
    const h = 66;
    for (const d of done) {
      const rect = this.scene.add
        .rectangle(this.center(), y + h / 2 - 5, this.rowW(), h - 10, 0x1b4030, 1)
        .setStrokeStyle(2, 0x2e7d5b, 1);
      this.modal.body.add(rect);
      setJaWrap(
        this.mk(34, y + 6, `✔ ${d.topic.label}　Lv${d.lv}${d.lv >= RESEARCH.maxLevel ? "（極めた）" : ""}`, 14, "#2ecc71", true),
        this.rowW() - 40,
      );
      setJaWrap(
        this.mk(34, y + 26, `いま効いている：${effectSummaryAt(d.topic, d.lv)}`, 11, "#dfe6ec"),
        this.rowW() - 40,
      );
      if (d.lv < RESEARCH.maxLevel) {
        this.mk(34, y + 44, `重ねて研究すると Lv${d.lv + 1} まで上げられる`, 10.5, "#95a6b8");
      }
      y += h;
    }
    return y;
  }

  // ---------------------------------------------------------------- 小物

  private rowW(): number {
    return this.width - 44 - this.modal.scrollGutter;
  }

  private center(): number {
    return (this.width - this.modal.scrollGutter) / 2;
  }

  private note(y: number, s: string): void {
    setJaWrap(this.mk(34, y + 8, s, 13, "#8fa3b5"), this.rowW() - 40);
  }

  private mk(
    x: number,
    y: number,
    s: string,
    size: number,
    color: string,
    bold = false,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, s, {
        fontFamily: "sans-serif",
        fontSize: `${size}px`,
        color,
        fontStyle: bold ? "bold" : "normal",
      })
      .setOrigin(0, 0);
    this.modal.body.add(t);
    return t;
  }
}

/** 型だけ参照（指導力の色は詳細画面で使う）。 */
export { teachingColor };
