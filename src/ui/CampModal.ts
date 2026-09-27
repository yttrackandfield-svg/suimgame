import { weeksLabel } from "../sim/weeks";
import Phaser from "phaser";
import { STAT_LABEL, type Student } from "../sim/student";
import { CLASS_ORDER } from "../sim/classes";
import { conditionLevel, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import {
  altitudeBandLabel,
  ALTITUDE_INTENSITIES,
  ALTITUDE_STAYS,
  campDef,
  campFocusLabel,
  CAMP_DEFS,
  DOMESTIC_CAMPS,
  isSprinter,
  OVERSEAS_CAMPS,
  type CampId,
  type CampPlan,
} from "../sim/camp";
import type { CampOutcome, GameState } from "../sim/state";
import { GAME_HEIGHT, GAME_WIDTH, gemsText } from "../config";
import { CampResultModal } from "./CampResultModal";
import { Button, closeOnBackdropTap } from "./Button";
import { flushInput } from "./inputReady";
import { setJaWrap } from "./textWrap";

/**
 * 合宿モーダル。
 *
 * 流れは「タイプを選ぶ → 選手を選ぶ → 実施」。
 * 高地合宿だけは、そのあいだに滞在期間と練習強度も選ぶ。
 *
 * 高地では「次の大会まで何日か」と「今の日程だと下山何日後が大会か」を出す。
 * ただし正解は書かない（どの帯が良いかは遊んで覚えてもらう）。
 * 費用は必ず1人あたりで、選ぶほど総額が膨らむ。
 */
type Phase = "type" | "pick" | "result";

/** 選びかけの内容（選手カードを見て戻ってくるときに持ち歩く）。 */
export interface CampSnapshot {
  plan: CampPlan;
  phase: Phase;
  page: number;
  pickedIds: number[];
}

/** 行き先1件の高さ（名前／伸びる能力／説明 の3段ぶん）。 */
const TYPE_ROW_H = 114;

/**
 * 高地の設定パネルの選択チップ（滞在期間は4択・練習強度は3択）。
 * 横に4つ並べても 524px の内側（32〜492）に収まる寸法。
 */
const CHIP_W = 108;
const CHIP_STEP = 114;
const CHIP_X0 = 32 + CHIP_W / 2;

/** 行き先のページ（国内／海外）。画面が狭いので、まとめて並べずページで分ける。 */
const TYPE_GROUPS: { title: string; note: string; ids: readonly CampId[] }[] = [
  { title: "国内", note: "毎年の土台づくり", ids: DOMESTIC_CAMPS },
  { title: "海外", note: "高額・高リターン", ids: OVERSEAS_CAMPS },
];

export class CampModal {
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly container: Phaser.GameObjects.Container;
  private readonly listLayer: Phaser.GameObjects.Container;
  private readonly footLayer: Phaser.GameObjects.Container;

  /**
   * 【画面の幅に合わせる】以前は 780×580 で組んでいた。
   * 画面は 540 幅なので `scale = min(1, 524/780) = 0.67` に縮み、
   * 15px で書いた行き先の名前が実際には 10px で描かれていた（＝読めない）。
   * 結果画面（CampResultModal）だけは先に作り直してあったが、行き先を選ぶこの画面は 780 のままだった。
   *
   * いまは画面の幅ぴったりに組んで**縮小を掛けない**。そのぶん横に並べられないので、
   * 行き先は1件を3行（名前＋費用／伸びる能力／説明）に積み、国内・海外でページを分ける。
   */
  private readonly PW = Math.min(524, GAME_WIDTH - 16);
  private readonly PH = Math.min(860, GAME_HEIGHT - 24);
  private readonly ROWS_PER_PAGE = 7;

  private result?: CampResultModal;
  private phase: Phase = "type";
  private plan: CampPlan = { id: "sea", stayDays: ALTITUDE_STAYS[1].days, intensity: ALTITUDE_INTENSITIES[1].id };

  private eligible: Student[] = [];
  private readonly picked = new Set<Student>();
  private page = 0;

  private titleText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private pageText!: Phaser.GameObjects.Text;
  private costText!: Phaser.GameObjects.Text;
  private goBtn!: Button;
  private backBtn!: Button;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onClose: () => void,
    /**
     * 行を長押ししたとき（その選手のカードを開く）。
     * `snap` を渡し返してもらえば、**選びかけの状態のまま**この画面に戻れる。
     */
    private readonly onOpenCard?: (s: Student, snap: CampSnapshot) => void,
    /** 開いたときに戻す選びかけの内容。 */
    restore?: CampSnapshot,
  ) {
    this.backdrop = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setInteractive()
      .setDepth(2440);
    closeOnBackdropTap(this.backdrop, () => this.onClose());
    this.container = scene.add.container(0, 0).setDepth(2441);

    const box = scene.add.graphics();
    box.fillStyle(0x14263a, 1);
    box.fillRoundedRect(0, 0, this.PW, this.PH, 12);
    box.lineStyle(3, 0x2e4a66, 1);
    box.strokeRoundedRect(0, 0, this.PW, this.PH, 12);
    this.container.add(box);
    const swallow = scene.add.zone(this.PW / 2, this.PH / 2, this.PW, this.PH).setInteractive();
    this.container.add(swallow);

    this.eligible = this.collectEligible();
    // カードを見て戻ってきたときは、行き先も選んだ顔ぶれもそのまま
    if (restore) {
      this.plan = { ...restore.plan };
      this.phase = restore.phase;
      this.page = restore.page;
      for (const id of restore.pickedIds) {
        const s = this.eligible.find((x) => x.id === id);
        if (s) this.picked.add(s);
      }
    }

    this.titleText = this.text(20, 16, `合宿　${this.state.dateLabel}`, 22, "#f7dc6f", true);
    this.subText = this.text(20, 48, "", 14, "#bdc3c7");
    // 日本語は分かち書きしないので、Phaser の既定の折り返しでは効かない（→ ui/textWrap.ts）
    setJaWrap(this.subText, this.PW - 96);
    new Button(this.scene, this.PW - 36, 32, 56, 48, "×", () => this.onClose(), {
      color: 0x7f2f2f,
      hoverColor: 0xa8443a,
      fontSize: 28,
      hitPadding: 10,
    });
    this.reparentLastButton();

    this.listLayer = scene.add.container(0, 0);
    this.container.add(this.listLayer);
    this.footLayer = scene.add.container(0, 0);
    this.container.add(this.footLayer);

    /**
     * 下の操作は3段。横に並べると 524px には収まらないので、段で分ける。
     *   PH-104 … 費用・所持金の1行
     *   PH-64  … ページ送り ＋「タイプ選択へ戻る」
     *   PH-26  … 実施ボタン（幅いっぱい）
     */
    this.costText = this.text(20, this.PH - 112, "", 15, "#aed6f1");
    new Button(this.scene, 62, this.PH - 64, 76, 36, "◀ 前", () => this.turnPage(-1), { fontSize: 14 });
    this.pageBtnPrev = this.reparentLastButton();
    new Button(this.scene, 234, this.PH - 64, 76, 36, "次 ▶", () => this.turnPage(1), { fontSize: 14 });
    this.pageBtnNext = this.reparentLastButton();
    this.pageText = this.text(148, this.PH - 64, "", 15, "#bdc3c7", true).setOrigin(0.5, 0.5);

    this.backBtn = new Button(this.scene, this.PW - 88, this.PH - 64, 148, 36, "◀ 行き先を選ぶ", () => this.toTypePhase(), {
      fontSize: 14,
    });
    this.reparentLastButton();

    this.goBtn = new Button(this.scene, this.PW / 2, this.PH - 26, this.PW - 48, 40, "合宿を実施 ▶", () => this.execute(), {
      color: 0x8e6a2f,
      hoverColor: 0xb8893c,
      fontSize: 17,
    });
    this.reparentLastButton();

    const scale = Math.min(1, (GAME_WIDTH - 16) / this.PW, (GAME_HEIGHT - 24) / this.PH);
    this.container.setScale(scale);
    this.container.setPosition((GAME_WIDTH - this.PW * scale) / 2, (GAME_HEIGHT - this.PH * scale) / 2);

    this.toTypePhase();
  }

  private pageBtnPrev!: Button;
  private pageBtnNext!: Button;

  destroy(): void {
    this.result?.destroy();
    this.result = undefined;
    this.backdrop.destroy();
    this.container.destroy();
  }

  // ---------------------------------------------------------------- 小道具

  private text(x: number, y: number, s: string, size: number, color: string, bold = false): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, {
      fontFamily: "sans-serif",
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? "bold" : "normal",
    });
    this.container.add(t);
    return t;
  }

  private reparentLastButton(): Button {
    const list = this.scene.children.list;
    const btn = list[list.length - 1] as Button;
    this.container.add(btn);
    return btn;
  }

  private label(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    str: string,
    color: string,
    size = 14,
    bold = false,
    originX = 0,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, str, {
        fontFamily: "sans-serif",
        fontSize: `${size}px`,
        color,
        fontStyle: bold ? "bold" : "normal",
      })
      .setOrigin(originX, 0.5);
    layer.add(t);
    return t;
  }

  private collectEligible(): Student[] {
    const out: Student[] = [];
    for (const c of CLASS_ORDER) {
      if (c.kind !== "ikusei") continue;
      for (const s of this.state.students[c.id]) {
        if (this.state.campEligible(s).ok) out.push(s);
      }
    }
    return out;
  }

  private classLabel(s: Student): string {
    return CLASS_ORDER.find((c) => c.id === s.classId)?.label ?? "";
  }

  private get def() {
    return campDef(this.plan.id);
  }

  // ---------------------------------------------------------------- フェーズ切り替え

  private toTypePhase(): void {
    this.phase = "type";
    this.page = 0;
    this.titleText.setText(`合宿　${this.state.dateLabel}`);
    this.subText.setText("行き先を選ぶ。費用はすべて1人あたり。");
    this.backBtn.setVisible(false);
    this.goBtn.setVisible(false);
    // 行き先も国内／海外の2ページに分けたので、ここでもページ送りを出す
    this.pageBtnPrev.setVisible(true);
    this.pageBtnNext.setVisible(true);
    this.pageText.setVisible(true);
    this.costText.setText(`所持 ◆${gemsText(this.state.gems)}　参加できる選手 ${this.eligible.length}名`).setColor("#aed6f1");
    this.renderTypes();
  }

  /** 【見た目確認】選手選びの画面を直接開く（?dev=facility&open=camp:alt）。 */
  devPickPhase(id: CampId): void {
    this.toPickPhase(id);
  }

  private toPickPhase(id: CampId): void {
    this.plan = { ...this.plan, id };
    this.phase = "pick";
    this.page = 0;
    this.picked.clear();
    const d = this.def;
    this.titleText.setText(`合宿　${d.label}`);
    // 行き先の説明に、押し分けの案内を添える（行＝参加／ⓘ＝詳しい情報）
    this.subText.setText(`${d.note}
${this.pickHint()}`);
    this.backBtn.setVisible(true);
    this.goBtn.setVisible(true);
    this.pageBtnPrev.setVisible(true);
    this.pageBtnNext.setVisible(true);
    this.pageText.setVisible(true);
    this.renderPick();
  }

  private turnPage(dir: number): void {
    if (this.phase === "type") {
      // 行き先は 国内（0）／海外（1）の2ページ
      this.page = Phaser.Math.Clamp(this.page + dir, 0, TYPE_GROUPS.length - 1);
      this.renderTypes();
      return;
    }
    const maxPage = Math.max(0, Math.ceil(this.eligible.length / this.ROWS_PER_PAGE) - 1);
    this.page = Phaser.Math.Clamp(this.page + dir, 0, maxPage);
    this.renderPick();
  }

  // ---------------------------------------------------------------- タイプ選択

  private renderTypes(): void {
    this.listLayer.removeAll(true);
    this.footLayer.removeAll(true);

    const g = TYPE_GROUPS[this.page] ?? TYPE_GROUPS[0];
    this.pageText.setText(`${this.page + 1} / ${TYPE_GROUPS.length}`);
    this.label(this.listLayer, 20, 92, g.title, "#f7dc6f", 17, true);
    this.label(this.listLayer, this.PW - 20, 92, g.note, "#9fb3c4", 13, false, 1);

    let y = 110;
    for (const id of g.ids) {
      this.buildTypeRow(id, y);
      y += TYPE_ROW_H + 8;
    }
  }

  /**
   * 行き先1件（3段）。
   *   1段目 … 名前（大きく）と1人あたりの費用
   *   2段目 … 伸びやすい能力（＋高地だけの注意）
   *   3段目 … 説明（config の note をそのまま。折り返す）
   * 選べないときは3段目を「選べない理由」に差し替える（何が足りないかがいちばん知りたい）。
   */
  private buildTypeRow(id: CampId, y: number): void {
    const d = CAMP_DEFS[id];
    const st = this.state.campTypeStatus(id);
    const rowH = TYPE_ROW_H;

    const rect = this.scene.add
      .rectangle(this.PW / 2, y + rowH / 2, this.PW - 40, rowH, st.ok ? 0x1c3550 : 0x18232f, 1)
      .setStrokeStyle(1, st.ok ? 0x2e4a66 : 0x22323f, 1);
    if (st.ok) {
      rect
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => rect.setFillStyle(0x27506e, 1))
        .on("pointerout", () => rect.setFillStyle(0x1c3550, 1))
        .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.();
          this.toPickPhase(id);
        });
    }
    this.listLayer.add(rect);

    const dim = st.ok ? 1 : 0.5;
    const left = 32;
    const nameColor = d.region === "overseas" ? "#f5b041" : "#ffffff";
    this.label(this.listLayer, left, y + 22, d.label, nameColor, 19, true).setAlpha(dim);
    this.label(this.listLayer, this.PW - 32, y + 22, `◆${gemsText(d.costPerHead)} /人`, st.ok ? "#aed6f1" : "#95a6b8", 16, true, 1)
      .setAlpha(dim);

    const focus = campFocusLabel(d, STAT_LABEL) + (d.isAltitude ? "　※下山のタイミングが要" : "");
    this.label(this.listLayer, left, y + 46, focus, d.isAltitude ? "#e8c07a" : "#9fb3c4", 14).setAlpha(dim);

    const note = st.ok ? d.note : `選べない：${st.reason ?? ""}`;
    const t = this.label(this.listLayer, left, y + 70, "", st.ok ? "#bdc3c7" : "#e74c3c", 14).setAlpha(dim);
    t.setOrigin(0, 0);
    // 日本語は分かち書きしないので、Phaser の既定の折り返しは効かない（→ ui/textWrap.ts）。
    // 幅を決めてから中身を入れること。
    setJaWrap(t, this.PW - left - 40);
    t.setText(note);
  }

  // ---------------------------------------------------------------- 選手選択（＋高地の設定）

  private renderPick(): void {
    this.listLayer.removeAll(true);
    this.footLayer.removeAll(true);

    /**
     * 【説明の高さを測ってから一覧を置く】（2026-09-24）
     * 説明（subText）は行き先によって長さが違ううえ、押し分けの案内も足したので、
     * 「106px から」と決め打ちにすると**説明の上に一覧が重なる**。
     * 折り返したあとの実際の高さを測って、その下から始める。
     */
    const subBottom = this.subText.y + this.subText.height + 10;
    const listTop = Math.max(106, subBottom);
    const top = this.def.isAltitude ? this.renderAltitudePanel(Math.max(100, subBottom)) : listTop;

    if (this.eligible.length === 0) {
      this.label(
        this.listLayer,
        this.PW / 2,
        top + 90,
        "今月合宿できる選手がいません。",
        "#95a6b8",
        16,
        false,
        0.5,
      );
      this.updateCost();
      return;
    }

    const maxPage = Math.max(0, Math.ceil(this.eligible.length / this.ROWS_PER_PAGE) - 1);
    this.page = Math.min(this.page, maxPage);
    this.pageText.setText(`${this.page + 1} / ${maxPage + 1}`);

    const start = this.page * this.ROWS_PER_PAGE;
    const shown = this.eligible.slice(start, start + this.ROWS_PER_PAGE);
    const rh = 58;
    shown.forEach((s, i) => this.buildPickRow(s, top + i * rh, rh));
    this.updateCost();
    flushInput(this.scene); // 並べ直した直後の1タップを捨てない（→ inputReady.ts）
  }

  /**
   * 高地の設定パネル。滞在期間・練習強度と、大会までの日数を示す。
   * 「下山○日後が大会」までは出すが、どの帯を狙うべきかは書かない。
   */
  private renderAltitudePanel(y: number): number {
    // 見出しとボタンを同じ行に置くと 524px に収まらない（滞在期間は4択ある）ので、段で分ける
    const panelH = 176;
    const g = this.scene.add.graphics();
    g.fillStyle(0x102030, 1);
    g.fillRoundedRect(22, y, this.PW - 44, panelH, 8);
    g.lineStyle(1, 0x2e4a66, 1);
    g.strokeRoundedRect(22, y, this.PW - 44, panelH, 8);
    this.listLayer.add(g);

    // --- 滞在期間 ---
    this.label(this.listLayer, 32, y + 18, "滞在期間", "#9fb3c4", 13);
    ALTITUDE_STAYS.forEach((s, i) => {
      const on = this.plan.stayDays === s.days;
      const bx = CHIP_X0 + i * CHIP_STEP;
      const chip = this.scene.add
        .rectangle(bx, y + 44, CHIP_W, 28, on ? 0x2e7d5b : 0x1c3550, 1)
        .setStrokeStyle(1, on ? 0x3fa876 : 0x2e4a66, 1)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.();
          this.plan = { ...this.plan, stayDays: s.days };
          this.renderPick();
        });
      this.listLayer.add(chip);
      this.label(this.listLayer, bx, y + 44, s.label, on ? "#ffffff" : "#bdc3c7", 13, on, 0.5);
    });

    // --- 練習強度 ---
    this.label(this.listLayer, 32, y + 76, "練習強度", "#9fb3c4", 13);
    ALTITUDE_INTENSITIES.forEach((it, i) => {
      const on = this.plan.intensity === it.id;
      const bx = CHIP_X0 + i * CHIP_STEP;
      const chip = this.scene.add
        .rectangle(bx, y + 102, CHIP_W, 28, on ? 0x2e7d5b : 0x1c3550, 1)
        .setStrokeStyle(1, on ? 0x3fa876 : 0x2e4a66, 1)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.();
          this.plan = { ...this.plan, intensity: it.id };
          this.renderPick();
        });
      this.listLayer.add(chip);
      this.label(this.listLayer, bx, y + 102, it.label, on ? "#ffffff" : "#bdc3c7", 13, on, 0.5);
    });

    // --- 大会までの日数（判断材料） ---
    const t = this.state.meetTiming([...this.picked], this.plan.stayDays);
    if (t.comp) {
      const bandName = altitudeBandLabel(t.descentToMeet);
      const good = t.band ? t.band.timeFactor < 1 : false;
      // 横に並べると 524px に収まらないので2行に積む
      this.label(this.listLayer, 32, y + 130, `次の大会：${t.comp.name}　あと ${weeksLabel(t.daysUntil)}`, "#bdc3c7", 13);
      const desc =
        t.descentToMeet < 0
          ? "この日程だと大会に間に合わない"
          : `この日程なら 下山 ${weeksLabel(t.descentToMeet)}後 が大会（${bandName}）`;
      this.label(
        this.listLayer,
        32,
        y + 152,
        desc,
        t.descentToMeet < 0 ? "#e74c3c" : good ? "#2ecc71" : "#e8c07a",
        13,
        true,
      );
    } else {
      this.label(this.listLayer, 32, y + 130, "予定されている大会はない", "#9fb3c4", 13);
      this.label(this.listLayer, 32, y + 152, "（ベース作りの合宿になる）", "#9fb3c4", 13);
    }

    return y + panelH + 10;
  }

  private buildPickRow(s: Student, y: number, rh: number): void {
    const on = this.picked.has(s);
    const rect = this.scene.add
      .rectangle(this.PW / 2, y + rh / 2, this.PW - 44, rh - 6, on ? 0x27506e : 0x1c3550, 1)
      .setStrokeStyle(1, 0x2e4a66, 1)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        this.toggle(s);
      });
    this.listLayer.add(rect);
    /**
     * 【その子を確かめる小さなボタン】（2026-09-24 に長押しから変更）
     *
     * 一度は「行を長押し → 選手カード」にしたが、**行そのものが選択**なので、
     * 少し長く押しただけで選択とカードが同時に起きて「選べない」状態になっていた
     *（この一覧は名簿と違い、行のタップに意味がある）。
     * カードは**行の右端の小さなボタン**に分ける。名簿の★と同じ考えかたで、
     * 押し分けがはっきりし、指が触れただけで画面が変わることもない。
     * **選びかけは snap に持って戻す**ので、見に行っても印が消えない。
     */
    if (this.onOpenCard) {
      const bx = this.PW - 30;
      const info = this.scene.add
        .text(bx, y + rh / 2, "ⓘ", {
          fontFamily: "sans-serif",
          fontSize: "20px",
          color: "#8fd0ff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        // 指で押せる大きさを別に持たせる（字そのものは小さい）
        .setInteractive(new Phaser.Geom.Rectangle(-16, -16, 32, 32), Phaser.Geom.Rectangle.Contains)
        .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.(); // 行の選択には伝えない
          this.onOpenCard?.(s, this.snapshot());
        });
      this.listLayer.add(info);
    }

    // 2段組（横に並べると 524px に収まらない）。
    //   上段 … チェック・名前・調子
    //   下段 … クラスと学年・ケガ・タイプごとの注意書き
    /**
     * 1人ぶんを2段で書く。
     *   上段 … チェック・名前　　　　　　調子（右）
     *   下段 … クラスと学年・ケガ・前回の合宿　　注意書き（右）
     *
     * 【右の文字を先に置いて、左はその手前で切る】（2026-09-24）
     * 前回の合宿の成果を下段に足したら、右端の注意書きと重なった。
     * 右側（調子・注意書き）は幅が変わるので、**先に置いて実測**し、
     * 左の文字はその手前までに収まるぶんだけ出す。
     */
    const up = y + rh / 2 - 11;
    const down = y + rh / 2 + 11;
    const rightEdge = this.PW - 30 - (this.onOpenCard ? 26 : 0); // ⓘ ボタンのぶんを空ける
    this.label(this.listLayer, 32, up, on ? "◼" : "◻", on ? "#2ecc71" : "#95a6b8", 20);

    // --- 右上：調子
    const level = conditionLevel(s.condition);
    const cond = this.label(
      this.listLayer,
      rightEdge,
      up,
      `${CONDITION_ICON[level]} ${CONDITION_LABEL[level]}`,
      CONDITION_COLOR[level],
      15,
      true,
      1,
    );

    // --- 右下：注意書き
    const d = this.def;
    const warn = this.warningFor(s, level);
    const note =
      warn ?? (d.isAltitude && !isSprinter(s) ? { text: "中長距離：恩恵が大きい", color: "#2ecc71" } : null);
    const noteText = note ? this.label(this.listLayer, rightEdge, down, note.text, note.color, 13, false, 1) : null;

    // --- 左上：名前（調子の手前で切る）
    const name = this.label(this.listLayer, 60, up, s.name, "#ffffff", 17, true);
    this.fitWidth(name, rightEdge - cond.width - 10 - 60);

    // --- 左下：クラス・学年／ケガ／前回の合宿（入らないぶんは後ろから落とす）
    const sub = [`${this.classLabel(s)}・${s.grade}`];
    if (s.injuryDays > 0) sub.push(`ケガ ${weeksLabel(s.injuryDays)}`);
    // 【前回の合宿でどれだけ伸びたか】次に誰を連れていくかの材料（→ GameState.campLog）
    const last = this.state.campRecordOf(s);
    if (last) {
      sub.push(
        last.injured
          ? `前回 ${last.month}月 故障`
          : `前回 ${last.month}月 +${last.gain.toFixed(1)}（${STAT_LABEL[last.bestStat]}）`,
      );
    }
    const limit = rightEdge - (noteText ? noteText.width + 12 : 0) - 60;
    const subText = this.label(this.listLayer, 60, down, sub.join("　"), s.injuryDays > 0 ? "#e67e22" : "#9fb3c4", 13);
    while (sub.length > 1 && subText.width > limit) {
      sub.pop();
      subText.setText(sub.join("　"));
    }
  }

  /** 選手を選ぶ画面の案内（押し分けを1行で伝える）。 */
  private pickHint(): string {
    return this.onOpenCard
      ? "行をタップで参加／右の ⓘ でその子の詳しい情報（戻っても選んだ印は消えません）"
      : "行をタップで参加";
  }

  /**
   * その文字を幅に収める（入らなければ少しだけ小さくする）。
   * 名前は落とせないので、削るのではなく縮める。
   */
  private fitWidth(t: Phaser.GameObjects.Text, limit: number): void {
    if (limit <= 0) return;
    let size = Number(String(t.style.fontSize).replace("px", "")) || 17;
    while (t.width > limit && size > 11) {
      size -= 0.5;
      t.setFontSize(size);
    }
  }

  private warningFor(s: Student, level: ReturnType<typeof conditionLevel>): { text: string; color: string } | null {
    const d = this.def;
    if (d.isAltitude) {
      if (level === "poor" || level === "tired") return { text: "不調：高地順応に失敗しやすい", color: "#e74c3c" };
      if (isSprinter(s)) return { text: "短距離：下山後にスピード練習が要る", color: "#e67e22" };
      return null;
    }
    if (level === "poor" || level === "tired") return { text: "不調：故障リスク", color: "#e74c3c" };
    if (level === "good" || level === "peak") return { text: "好調：効果UP", color: "#2ecc71" };
    return null;
  }

  /** いま選んでいる内容（カードを見て戻るときに持ち歩く）。 */
  private snapshot(): CampSnapshot {
    return {
      plan: { ...this.plan },
      phase: this.phase,
      page: this.page,
      pickedIds: [...this.picked].map((s) => s.id),
    };
  }

  private toggle(s: Student): void {
    if (this.picked.has(s)) this.picked.delete(s);
    else this.picked.add(s);
    this.renderPick();
  }

  private updateCost(): void {
    const n = this.picked.size;
    const perHead = this.state.campCostPerHead(this.plan.id);
    const cost = this.state.campCostFor(n, this.plan.id);
    const afford = this.state.gems >= cost;
    this.costText
      .setText(`参加 ${n}人 × ◆${gemsText(perHead)} ＝ ◆${gemsText(cost)}　（所持 ◆${gemsText(this.state.gems)}）`)
      .setColor(afford ? "#aed6f1" : "#e74c3c");
    this.goBtn.setEnabled(n > 0 && afford);
  }

  // ---------------------------------------------------------------- 実施・結果

  private execute(): void {
    const participants = [...this.picked];
    if (participants.length === 0) return;
    const res = this.state.runCamp(participants, this.plan);
    if (!res.ok) {
      this.costText.setText(res.reason ?? "実施できない").setColor("#e74c3c");
      return;
    }
    this.showResults(res.outcomes);
  }

  /**
   * 成果は専用の画面（CampResultModal）で出す。
   * この画面ももとは 780px 幅で 0.67倍に縮んでいたが、2026-09-19 に画面の幅に合わせて組み直した。
   */
  private showResults(outcomes: CampOutcome[]): void {
    this.container.setVisible(false);
    this.backdrop.setVisible(false);
    this.result?.destroy();
    this.result = new CampResultModal(this.scene, this.def.label, outcomes, () => this.onClose());
  }
}
