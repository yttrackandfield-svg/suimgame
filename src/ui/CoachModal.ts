import Phaser from "phaser";
import {
  coachGradeColor,
  coachGradeLabel,
  coachGradeLockedNote,
  coachRankLabel,
  coachSalary,
  coachSpecialtyLabel,
  teachingColor,
  teachingLabel,
  type Coach,
} from "../sim/coach";
import { clubRankShort } from "../sim/clubRank";
import type { ClassId } from "../sim/classes";
import { slotLabel } from "../sim/timetable";
import type { GameState, RecruitCandidate } from "../sim/state";
import { GAME_HEIGHT, GAME_WIDTH, gemsText } from "../config";
import { Button, closeOnBackdropTap } from "./Button";
import { setJaWrap } from "./textWrap";
import { COACHING, EQUIPMENT, RESEARCH } from "../config/balance";

type Mode = "roster" | "recruit";

/**
 * 在籍一覧の1ページに出す人数。
 * パネルの高さ（PH=540）から、ページ送りと「閉じる」のぶんを引いて入る行数。
 * これを超えるコーチはページ送りで見る（以前は先頭8人しか出せず、
 * 9人目以降は監督にも解雇にもできなかった）。
 */
const ROSTER_ROWS = 5;

/**
 * 募集名簿の1ページに出す人数（1行 64px と背が高いので在籍一覧より少ない）。
 * 名簿は最大 COACHING.recruit.poolMax 人まで積み上がるので、ページ送りで見る。
 */
const RECRUIT_ROWS = 4;

/**
 * 縦の座標は全部ここで決める（前は PH からの引き算で個別に置いていて、
 * 一覧の最終行・ページ送り・お知らせ文が同じ高さに重なっていた）。
 * 上から：説明 → 見出し → 一覧 → ページ送り → お知らせ → 閉じる。
 */
const HINT_Y = 138;
const LIST_TOP = 206;
const ROW_H = 88;
const PAGER_Y = LIST_TOP + ROSTER_ROWS * ROW_H + 26;
/** 「◯◯を監督に任命」などの一言を出す帯。ここは他の何とも重ねない。 */
const TOAST_Y = PAGER_Y + 36;
const CLOSE_Y = TOAST_Y + 38;
const PANEL_H = CLOSE_Y + 36;

/**
 * コーチ一覧＋募集（項目7）。
 * 一覧：ランク/給料/担当/監督フラグを表示し、監督任命・解任・解雇ができる。
 * 募集：クラブ力に応じた質の候補をスカウト（ジェムで雇用）。
 */
export class CoachModal {
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly container: Phaser.GameObjects.Container;
  private readonly listLayer: Phaser.GameObjects.Container;

  /**
   * 【画面の幅に合わせる】以前は 720 固定で、540幅の画面では
   * `scale = 524/720 = 0.73倍` に縮み、14px で書いた文字が 10px で描かれていた。
   * 横に5列（名前／月給／担当コマ／指導力／ボタン）並べていたのも、
   * この幅を前提にしたもの。いまは縮小を掛けず、1人ぶんを3段に積む。
   */
  private readonly PW = Math.min(524, GAME_WIDTH - 16);
  private readonly PH = PANEL_H;

  private mode: Mode = "roster";
  private tabRoster!: Button;
  private tabRecruit!: Button;
  private headerText!: Phaser.GameObjects.Text;
  /** タブごとの説明文（一覧／募集で中身を差し替える）。 */
  private hintText!: Phaser.GameObjects.Text;
  private candidates: RecruitCandidate[] = [];
  /**
   * 操作の結果を伝える一言。**作り直さず、この1つを使い回す**。
   * 以前は flash のたびに新しい文字を作り、描き直しのときに参照だけ捨てていたため、
   * 2人目を任命すると1人目の文字が消えずに残り、重なって読めなくなっていた。
   */
  private toast!: Phaser.GameObjects.Text;
  /** 在籍一覧のページ（コーチ室を増やすと最大38人まで雇えるので送り表示にしている）。 */
  private page = 0;
  private shown = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onChange: () => void,
    private readonly onClose: () => void,
    /** 「研究を見る」を押したとき（会議室の研究画面へ）。 */
    private readonly onResearch: () => void = () => {},
    /** 「専門スタッフ」を押したとき（栄養士・ドクターの雇用画面へ）。 */
    private readonly onStaff: () => void = () => {},
    /** 名前をタップしたとき（そのコーチの詳細カードへ）。 */
    private readonly onOpenCoach: (coachId: number) => void = () => {},
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

    this.text(20, 16, "コーチ", 22, "#f7dc6f", true);
    // 在籍・人件費・所持は長いので、題名の下に折り返して置く（横に並べると × に掛かる）
    this.headerText = this.text(20, 48, "", 13.5, "#aed6f1");
    setJaWrap(this.headerText, this.PW - 96);
    new Button(this.scene, this.PW - 36, 32, 56, 48, "×", () => this.onClose(), {
      color: 0x7f2f2f,
      hoverColor: 0xa8443a,
      fontSize: 26,
      hitPadding: 10,
    });
    this.reparentLastButton();

    // タブ4つを等間隔に1行（幅いっぱいを4等分）
    const tabs = 4;
    const tabGap = 6;
    const tabW = (this.PW - 40 - tabGap * (tabs - 1)) / tabs;
    const tabX = (i: number): number => 20 + tabW / 2 + i * (tabW + tabGap);
    const TAB_Y = 100;
    this.tabRoster = new Button(this.scene, tabX(0), TAB_Y, tabW, 36, "在籍", () => this.setMode("roster"), {
      color: 0x2c3e50,
      hoverColor: 0x3d5a80,
      selectedColor: 0x2e5a8f,
      fontSize: 14,
    });
    this.reparentLastButton();
    this.tabRecruit = new Button(this.scene, tabX(1), TAB_Y, tabW, 36, "募集", () => this.setMode("recruit"), {
      color: 0x2c3e50,
      hoverColor: 0x3d5a80,
      selectedColor: 0x2e5a8f,
      fontSize: 14,
    });
    this.reparentLastButton();

    // 研究画面へ（会議室でどのテーマを進めるかを決める）
    new Button(this.scene, tabX(2), TAB_Y, tabW, 36, "研究", () => this.onResearch(), {
      color: 0x4a3a6b,
      hoverColor: 0x63509b,
      fontSize: 14,
    });
    this.reparentLastButton();

    // 専門スタッフ（栄養士・ドクター）はコーチとは別枠。ここから開く。
    new Button(this.scene, tabX(3), TAB_Y, tabW, 36, "スタッフ", () => this.onStaff(), {
      color: 0x2c5f8f,
      hoverColor: 0x3d78b0,
      fontSize: 14,
    });
    this.reparentLastButton();

    this.hintText = this.text(20, HINT_Y, "", 12.5, "#95a6b8");
    setJaWrap(this.hintText, this.PW - 40);

    this.listLayer = scene.add.container(0, 0);
    this.container.add(this.listLayer);

    this.toast = this.scene.add
      .text(this.PW / 2, TOAST_Y, "", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#aed6f1",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    setJaWrap(this.toast, this.PW - 80);
    this.container.add(this.toast);

    new Button(this.scene, this.PW / 2, CLOSE_Y, 200, 40, "閉じる", () => this.onClose(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 16,
    });
    this.reparentLastButton();

    const scale = Math.min(1, (GAME_WIDTH - 16) / this.PW, (GAME_HEIGHT - 24) / this.PH);
    this.container.setScale(scale);
    this.container.setPosition((GAME_WIDTH - this.PW * scale) / 2, (GAME_HEIGHT - this.PH * scale) / 2);

    this.setMode("roster");
    this.setShown(false); // 作るだけ作って、開かれるまでは隠しておく
  }

  isOpen(): boolean {
    return this.shown;
  }

  /** 開く。閉じている間に増えた資金やコーチを反映してから出す。 */
  show(): void {
    this.setShown(true);
    this.render();
  }

  hide(): void {
    this.setShown(false);
  }

  /**
   * Phaser は「見えていないもの」を当たり判定から外すので、
   * 隠せばボタンも押せなくなる（別途で無効にする必要はない）。
   */
  private setShown(v: boolean): void {
    this.shown = v;
    this.backdrop.setVisible(v);
    this.container.setVisible(v);
  }

  destroy(): void {
    this.backdrop.destroy();
    this.container.destroy();
  }

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

  /** 募集のタブを開いた状態にする（記録会の出会いのお知らせ・?dev=facility&open=coach:recruit）。 */
  showRecruit(): void {
    this.setMode("recruit");
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.tabRoster.setSelected(m === "roster");
    this.tabRecruit.setSelected(m === "recruit");
    // 募集名簿は GameState 側が持っている（毎月積み上がる）ので、開くたびに取り直す
    if (m === "recruit") this.candidates = this.state.generateRecruits();
    this.render();
  }

  private flash(msg: string, color: string): void {
    this.toast.setText(msg).setColor(color);
  }

  private render(): void {
    this.listLayer.removeAll(true);
    // 前の一言は必ず消す（残したまま次を出すと文字が重なる）
    this.toast.setText("");
    if (this.mode === "roster") this.renderRoster();
    else this.renderRecruit();
  }

  // ------------------------------------------------------------- 在籍一覧

  private renderRoster(): void {
    const coaches = this.state.coaches;
    // 人件費にはコーチ＋受付スタッフが含まれる（受付は解雇できない固定費）
    // 定員がいっぱいなら「どうすれば増えるか」まで出す（コーチ室を建てる）
    const cap = this.state.coachCapacity();
    const full = coaches.length >= cap ? `（コーチ室で +${EQUIPMENT.coachesPerCoachRoom}人）` : "";
    this.headerText.setText(
      `在籍 ${coaches.length}/${cap}${full}　人件費 ◆${this.state.totalMonthlySalary()}（受付込）　所持 ◆${this.state.gems}`,
    );

    // 【割り振りの内訳】誰が何をしているかを一目で（指導／研究／手空き）。
    // 手空きのコーチは館内の掃除に回り、スクールの成長にも少し貢献する。
    let teach = 0;
    let research = 0;
    let idle = 0;
    for (const c of coaches) {
      if (this.state.coachDutyCount(c.id) > 0) teach++;
      else if (c.duty === "research") research++;
      else idle++;
    }
    const avgTeach =
      coaches.length > 0 ? Math.round(coaches.reduce((n, c) => n + c.teaching, 0) / coaches.length) : 0;
    this.hintText.setText(
      `割り振り：指導 ${teach}人　研究 ${research}人　手空き ${idle}人（掃除に回る）　平均指導力 ${avgTeach}\n` +
        `指導のコマは「時間割」で決める。指導力は会議室の研究に参加すると伸びる（研究班は${RESEARCH.groupSize}人1組）。`,
    );

    // ページ送り。コーチ室を建てると最大38人まで雇えるので、1画面には収まらない。
    const pages = Math.max(1, Math.ceil(coaches.length / ROSTER_ROWS));
    this.page = Math.min(this.page, pages - 1);
    const start = this.page * ROSTER_ROWS;

    coaches.slice(start, start + ROSTER_ROWS).forEach((c, i) => this.buildCoachRow(c, LIST_TOP + i * ROW_H, ROW_H));

    if (pages > 1) this.buildPager(pages, coaches.length);
  }

  /** 在籍一覧のページ送り（◀ 1/3 ▶）。 */
  private buildPager(pages: number, total: number): void {
    const y = PAGER_Y;
    const prev = new Button(this.scene, this.PW / 2 - 96, y, 56, 32, "◀", () => this.turnPage(-1, pages), {
      color: 0x2c3e50,
      hoverColor: 0x3d5a80,
      fontSize: 14,
    });
    this.listLayer.add(this.reparentLastButton());
    prev.setEnabled(this.page > 0);

    this.addToList(
      this.scene.add
        .text(this.PW / 2, y, `${this.page + 1} / ${pages}　（全${total}人）`, {
          fontFamily: "sans-serif",
          fontSize: "14px",
          color: "#aed6f1",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );

    const next = new Button(this.scene, this.PW / 2 + 96, y, 56, 32, "▶", () => this.turnPage(1, pages), {
      color: 0x2c3e50,
      hoverColor: 0x3d5a80,
      fontSize: 14,
    });
    this.listLayer.add(this.reparentLastButton());
    next.setEnabled(this.page < pages - 1);
  }

  private turnPage(dir: number, pages: number): void {
    this.page = Math.min(pages - 1, Math.max(0, this.page + dir));
    this.render();
  }

  /**
   * 在籍コーチ1人ぶん（3段）。
   *   1段目 … 名前（タップで詳細）と月給
   *   2段目 … 格・専門 と 指導力
   *   3段目 … 担当コマ（時間割で決まる）／監督のクラス
   *   右端 … 「研究」「解雇」のボタンを縦に2つ
   *
   * 【横に5列並べない】以前は 720px 幅を前提に 名前／月給／担当／指導力／ボタン を
   * 横一列に置いていた。画面は 540px なのでパネルごと 0.73倍に縮み、
   * 文字が読めないうえ、担当コマが長い人は隣の列に重なっていた。
   */
  private buildCoachRow(c: Coach, y: number, rh: number): void {
    const rect = this.scene.add
      .rectangle(this.PW / 2, y + rh / 2, this.PW - 36, rh - 8, c.assigned ? 0x22405c : 0x1c3550, 1)
      .setStrokeStyle(1, 0x2e4a66, 1);
    this.listLayer.add(rect);

    const mk = (
      x: number,
      ty: number,
      str: string,
      color: string,
      size = 14,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const t = this.scene.add
        .text(x, ty, str, { fontFamily: "sans-serif", fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" })
        .setOrigin(originX, 0);
      this.listLayer.add(t);
      return t;
    };

    // 右端はボタン2つぶんを空ける
    const btnW = 82;
    const btnX = this.PW - 26 - btnW / 2;
    const textRight = this.PW - 26 - btnW - 12;
    const left = 30;

    const nameText = mk(left, y + 10, `${c.name} ▸`, "#ffffff", 16, true);
    mk(textRight, y + 12, `◆${gemsText(coachSalary(c, this.state.coachDutyCount(c.id)))}/月`, "#aed6f1", 13, true, 1);

    // 名前をタップすると、その人の詳細（格・得意・給料・担当のコマ）を開く
    const nameZone = this.scene.add
      .zone(left + Math.max(nameText.width, 140) / 2, y + 18, Math.max(nameText.width, 140), 26)
      .setInteractive({ useHandCursor: true });
    nameZone.on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation?.();
      this.onOpenCoach(c.id);
    });
    this.listLayer.add(nameZone);

    // 格（見習い〜レジェンド）と専門種目。専門は担当する選手の得意泳法と一致すると効く。
    mk(left, y + 34, `${coachGradeLabel(c.quality)}・${coachSpecialtyLabel(c)}`, coachGradeColor(c.quality), 12.5);
    // 指導力（研究で伸びる後天的な能力）。格とは別の数字なので分けて出す。
    mk(textRight, y + 34, `指導力 ${Math.round(c.teaching)}（${teachingLabel(c.teaching)}）`, teachingColor(c.teaching), 12.5, true, 1);

    // 役割バッジ：指導（時間割のコマを持っている）／研究（会議室）／手空き（掃除に回る）
    const dutyCount = this.state.coachDutyCount(c.id);
    const role =
      dutyCount > 0
        ? { text: `指導 ${dutyCount}コマ`, color: "#2ecc71" }
        : c.duty === "research"
          ? { text: "研究", color: "#a78bfa" }
          : { text: "手空き(掃除)", color: "#95a6b8" };
    const roleText = mk(left, y + 56, role.text, role.color, 12, true);

    // 担当は**時間割で決める**ので、ここでは「今どこを見ているか」を出すだけ。
    const duties = this.state.timetable.filter((e) => e.coachId === c.id).sort((a, b) => a.slot - b.slot);
    const shortOf: Record<ClassId, string> = { youji: "幼児", gakudo: "学童", ikuseiB: "育B", ikuseiA: "育A", senshu: "選手", pro: "プロ" };
    /**
     * 担当コマは最大7つまで持てるが、全部並べると1行に収まらず箱からはみ出す。
     * 3つを超えたら「ほか◯コマ」にまとめる（詳しくは名前をタップして出るカードで見る）。
     */
    const dutyList = duties.map((e) => `${slotLabel(e.slot)} ${shortOf[e.classId]}`);
    const dutyText =
      duties.length === 0
        ? "担当なし（時間割で決める）"
        : dutyList.length <= 3
          ? dutyList.join("　")
          : `${dutyList.slice(0, 2).join("　")}　ほか${dutyList.length - 2}コマ`;
    const dx = left + roleText.width + 10;
    const dt = mk(dx, y + 57, "", duties.length === 0 ? "#e59866" : "#d5dde5", 11.5);
    setJaWrap(dt, textRight - dx);
    dt.setText(c.assigned ? `${dutyText}　監督：${shortOf[c.assigned]}` : dutyText);

    // 担当時間外の過ごし方：待機（たまに掃除）／会議室で研究
    const research = new Button(this.scene, btnX, y + 24, btnW, 30, "研究", () => this.toggleDuty(c), {
      color: 0x4a3a6b,
      hoverColor: 0x63509b,
      selectedColor: 0x7d5fc4,
      fontSize: 13,
    });
    research.setSelected(c.duty === "research");
    // 研究は会議室ごとに4人1組。空きのある班が無ければ、ここからは入れられない。
    const inGroup = !!this.state.projectOfCoach(c.id);
    const hasSeat = this.state.researchProjects.some((p) => p.coachIds.length < RESEARCH.groupSize);
    research.setEnabled(this.state.hasMeetingRoom() && (inGroup || hasSeat));
    this.listLayer.add(this.reparentLastButton());

    new Button(this.scene, btnX, y + 58, btnW, 30, "解雇", () => this.fire(c), {
      color: 0x7f2f2f,
      hoverColor: 0xa8443a,
      fontSize: 13,
    });
    this.listLayer.add(this.reparentLastButton());
  }

  /**
   * 担当時間外の過ごし方を切り替える（待機 ⇄ 会議室で研究）。
   * 研究は会議室ごとに4人1組なので、空いている班が無ければ入れない。
   */
  private toggleDuty(c: Coach): void {
    if (!this.state.hasMeetingRoom()) {
      this.flash("会議室を建てると研究に回せる", "#e67e22");
      return;
    }
    const wasIn = !!this.state.projectOfCoach(c.id);
    if (!wasIn && !this.state.researchProjects.some((p) => p.coachIds.length < RESEARCH.groupSize)) {
      this.flash("空いている研究班がない（「研究を見る」から研究を始めよう）", "#e67e22");
      return;
    }
    this.state.setCoachDuty(c, wasIn ? "idle" : "research");
    this.onChange();
    this.render();
    this.flash(
      wasIn ? `${c.name} を指導に専念させた` : `${c.name} を研究班に入れた（指導力が伸びる）`,
      wasIn ? "#aed6f1" : "#a78bfa",
    );
  }

  private fire(c: Coach): void {
    this.state.fireCoach(c);
    this.onChange();
    this.render();
    this.flash(`${c.name} を解雇した`, "#e67e22");
  }

  // ------------------------------------------------------------- 募集

  private renderRecruit(): void {
    const tier = this.state.clubTier();
    this.headerText.setText(`クラブの格 ${tier}「${clubRankShort(tier)}」　所持 ◆${gemsText(this.state.gems)}`);

    // 応募者の格はクラブの格で決まる（抽選しない）。レジェンドは記録会の出会いでしか来ない。
    const locked = coachGradeLockedNote(tier);
    this.hintText.setText(
      `応募は毎月${COACHING.recruit.perMonth}人ずつ積み上がり、${COACHING.recruit.expireMonths}ヶ月で他所へ行く。クラブの格が上がると良いコーチが応募してくる。` +
        `レジェンドは記録会での出会いでしか会えない（上の段の記録会ほど良いコーチに出会う）。` +
        (locked ? `\n⚠ ${locked}` : ""),
    );

    // 【名簿はページ送りで見る】募集は毎月積み上がって最大14人まで残るので、
    // 1画面には収まらない。在籍一覧と同じページ送りで見せる。
    const top = LIST_TOP;
    const rh = 88;
    const pages = Math.max(1, Math.ceil(this.candidates.length / RECRUIT_ROWS));
    this.page = Math.min(this.page, pages - 1);
    const start = this.page * RECRUIT_ROWS;
    this.candidates
      .slice(start, start + RECRUIT_ROWS)
      .forEach((cand, i) => this.buildCandidateRow(cand, top + i * rh, rh));
    if (pages > 1) this.buildPager(pages, this.candidates.length);
  }

  private buildCandidateRow(cand: RecruitCandidate, y: number, rh: number): void {
    // 記録会で出会ったコーチは金の縁で目立たせる（めったに来ない・ここでしか会えない格がある）
    const rect = this.scene.add
      .rectangle(this.PW / 2, y + rh / 2, this.PW - 40, rh - 10, 0x1c3550, 1)
      .setStrokeStyle(cand.metAt ? 2 : 1, cand.metAt ? 0xf7dc6f : 0x2e4a66, 1);
    this.listLayer.add(rect);

    const c = cand.coach;
    const mk = (
      x: number,
      ty: number,
      str: string,
      color: string,
      size = 14,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const t = this.scene.add
        .text(x, ty, str, { fontFamily: "sans-serif", fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" })
        .setOrigin(originX, 0);
      this.listLayer.add(t);
      return t;
    };

    // 右端は「雇用する」のボタンぶんを空け、左は3段に積む
    const btnW = 96;
    const textRight = this.PW - 26 - btnW - 12;
    const left = 32;

    mk(left, y + 8, c.name, "#ffffff", 17, true);
    mk(textRight, y + 10, coachGradeLabel(c.quality), coachGradeColor(c.quality), 15, true, 1);

    if (cand.metAt) mk(left, y + 32, `🤝 ${cand.metAt}で出会った・専門：${coachSpecialtyLabel(c)}`, "#f7dc6f", 12.5);
    else mk(left, y + 32, `${coachRankLabel(c.quality)}・専門：${coachSpecialtyLabel(c)}`, "#aed6f1", 12.5);

    // 一時金だけでなく**月給**も出す。人件費がいちばん重い固定費になったので、
    // 「雇えるか」ではなく「毎月払えるか」で選ばせたい。
    mk(left, y + 54, `雇用 ◆${gemsText(cand.cost)}　月給 ◆${gemsText(coachSalary(c))}`, "#aed6f1", 13, true);
    const monthsLeft = this.state.recruitMonthsLeft(cand);
    mk(
      textRight,
      y + 56,
      monthsLeft <= 1 ? "今月かぎり" : `あと${monthsLeft}ヶ月`,
      monthsLeft <= 1 ? "#e67e22" : "#7f8c8d",
      12.5,
      monthsLeft <= 1,
      1,
    );

    const afford = this.state.gems >= cand.cost && this.state.coaches.length < this.state.coachCapacity();
    const hire = new Button(this.scene, this.PW - 26 - btnW / 2, y + rh / 2 - 4, btnW, 40, "雇用", () => this.hire(cand), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 15,
    });
    hire.setEnabled(afford);
    this.listLayer.add(this.reparentLastButton());
  }

  private hire(cand: RecruitCandidate): void {
    const r = this.state.hireCoach(cand);
    if (!r.ok) {
      this.flash(r.reason ?? "雇用できない", "#e67e22");
      return;
    }
    // 雇用済み候補をリストから除く
    this.candidates = this.candidates.filter((x) => x !== cand);
    this.onChange();
    this.render();
    this.flash(`${cand.coach.name} を雇用した`, "#2ecc71");
  }

  private addToList(t: Phaser.GameObjects.GameObject): void {
    this.listLayer.add(t);
  }
}
