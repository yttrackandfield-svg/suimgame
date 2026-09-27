import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { Button } from "./Button";
import { CLASSPLAN, REST } from "../config/balance";
import { classDef, classLabel, type ClassId } from "../sim/classes";
import {
  overallAbility,
  OWN_STYLE,
  PLAN_STROKE_LABEL,
  resolveStroke,
  STAT_LABEL,
  STROKE_LABEL,
  STROKE_KEYS,
  TRAINABLE_KEYS,
  type PlanStroke,
  type StatKey,
  type Stroke,
  type Student,
} from "../sim/student";
import { conditionLevel, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import { staminaOf, STAMINA_BAR, STAMINA_COLOR, STAMINA_LABEL } from "../sim/stamina";
import { statRank, statRankColor } from "../sim/statRank";
import type { GameState } from "../sim/state";
import { attachLongPress } from "./longPress";

/**
 * 全体練習の指定（育成B・育成A・選手・プロ）。
 *
 * クラス単位でメニュー（系統A＝能力／系統B＝泳法）を決めると、そのクラスの全員が
 * その練習を行う。ただし個人メニューを指定した選手は、そちらが優先される
 * （＝「全体は同じ練習、一部の子だけ別メニュー」ができる）。
 *
 * 休養もクラス単位で指示できる（大会前の調整などに使う）。
 *
 * 【下へスクロールすると名簿になる】
 * 「誰を休ませるか」は体力と調子を見ないと決められないのに、以前はこの画面から
 * それが見えなかった（名簿を開き直す必要があった）。メニューと休養の下に、
 * クラス全員の**名前・能力・調子・体力・スタイル1**を並べてある。
 * 行は**押せない**（スワイプで送るときに指が触れて勝手に画面が開かないように）。
 */

export interface ClassPracticeCallbacks {
  onChanged: () => void;
  onClose: () => void;
  /** 行を長押ししたとき（その選手のカードを開く）。 */
  onOpenCard?: (s: Student) => void;
}

const ASSIGNABLE = CLASSPLAN.assignable as readonly ClassId[];

/** 泳法の短縮名（狭い欄に収めるため。名簿と同じ言い回し）。 */
const STROKE_SHORT: Record<Stroke, string> = {
  free: "自由",
  back: "背",
  breast: "平",
  fly: "バタ",
  im: "個メ",
};

/** 名簿1行の高さ（1人ぶんを2行で書くので、そのぶん高い）。 */
const ROW_H = 60;
/** 名前の欄の幅。ここを越えたら折り返す（能力の欄に食い込ませない）。 */
const NAME_W = 148;
/** 体力ゲージの幅。 */
const BAR_W = 96;

/** 名簿1行ぶんの表示物（使い回す）。 */
interface RowView {
  bg: Phaser.GameObjects.Rectangle;
  /** その行がいま表示している選手（長押しで開く相手）。 */
  student: Student | null;
  /** 上の行：名前／能力（5能力の平均）／調子。 */
  name: Phaser.GameObjects.Text;
  ability: Phaser.GameObjects.Text;
  cond: Phaser.GameObjects.Text;
  /** 下の行：体力ゲージ＋数値／得意（スタイル1）。 */
  bar: Phaser.GameObjects.Graphics;
  energy: Phaser.GameObjects.Text;
  style: Phaser.GameObjects.Text;
}

export class ClassPracticeModal {
  private readonly modal: Modal;
  private readonly width: number;
  private readonly tabBtns: Partial<Record<ClassId, Button>> = {};
  private readonly abilityBtns: Partial<Record<StatKey, Button>> = {};
  private readonly strokeBtns: Partial<Record<PlanStroke, Button>> = {};

  private classId: ClassId = ASSIGNABLE[0];
  private headline!: Phaser.GameObjects.Text;
  private planLine!: Phaser.GameObjects.Text;
  private restLine!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;

  /** 名簿（クラス全員の体力・調子）。 */
  private rosterTop = 0;
  /** スクロールする窓の上端（中身の長さを測り直すのに使う）。 */
  private viewTop = 0;
  private rosterHead!: Phaser.GameObjects.Text;
  private rows: RowView[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly cb: ClassPracticeCallbacks,
    /** 開いたときに選んでおくクラス（カードから戻ってきたときに、見ていたクラスへ戻す）。 */
    initialClass?: ClassId,
  ) {
    if (initialClass && ASSIGNABLE.includes(initialClass)) this.classId = initialClass;
    this.width = Math.min(516, GAME_WIDTH - 24);
    // 縦画面いっぱいに使う（下は名簿。入りきらないぶんはスクロールで見る）
    const height = Math.min(916, GAME_HEIGHT - 24);

    this.modal = new Modal(
      scene,
      {
        width: this.width,
        height,
        title: "全体練習",
        subtitle: "クラス全員に同じ練習をさせる。個人指定した選手だけは自分のメニューを続ける。",
        depth: 2500,
      },
      () => cb.onClose(),
    );

    const top = this.modal.contentTop;
    // タブだけは固定（クラスを切り替えても位置が動かない）。その下がスクロールする窓。
    const viewTop = top + 46;
    const viewH = height - viewTop - 66;
    this.viewTop = viewTop;
    const body = this.modal.body;
    // 中身は ▲▼ ボタンのぶんだけ右を空ける
    const cw = this.width - 48 - this.modal.scrollGutter;

    // --- クラスタブ（固定） ---
    const tabW = (this.width - 48 - (ASSIGNABLE.length - 1) * 6) / ASSIGNABLE.length;
    ASSIGNABLE.forEach((id, i) => {
      const btn = this.modal.button(
        24 + tabW / 2 + i * (tabW + 6),
        top + 20,
        tabW,
        38,
        classLabel(id),
        () => this.selectClass(id),
        { color: 0x2c3e50, hoverColor: 0x3d5a80, selectedColor: 0x2e5a8f, fontSize: 14 },
      );
      this.tabBtns[id] = btn;
    });

    let y = viewTop + 8;
    this.headline = this.modal.text(24, y, "", 13, "#aed6f1", false, body);
    setJaWrap(this.headline, cw);
    y += 22;
    this.planLine = this.modal.text(24, y, "", 14, "#f7dc6f", true, body);
    setJaWrap(this.planLine, cw);
    y += 30;

    // --- 系統A：能力練習 ---
    this.modal.text(24, y, "系統A　能力練習（全員）", 13, "#9fb3c4", true, body);
    y += 20;
    const bw = (cw - 4 * 6) / 5;
    TRAINABLE_KEYS.forEach((key, i) => {
      this.abilityBtns[key] = this.modal.button(
        24 + bw / 2 + i * (bw + 6),
        y + 21,
        bw,
        42,
        STAT_LABEL[key],
        () => this.pickAbility(key),
        { color: 0x2c3e50, hoverColor: 0x3d5a80, selectedColor: 0xc0392b, fontSize: 13 },
        body,
      );
    });
    y += 54;

    // --- 系統B：泳法専門 ---
    this.modal.text(24, y, "系統B　専門（泳法）練習（全員）", 13, "#9fb3c4", true, body);
    y += 20;
    STROKE_KEYS.forEach((stroke, i) => {
      this.strokeBtns[stroke] = this.modal.button(
        24 + bw / 2 + i * (bw + 6),
        y + 21,
        bw,
        42,
        STROKE_LABEL[stroke],
        () => this.pickStroke(stroke),
        { color: 0x2c3e50, hoverColor: 0x3d5a80, selectedColor: 0x2e7d5b, fontSize: 12 },
        body,
      );
    });
    y += 52;

    // スタイル1＝各自の得意種目。クラス全員に同じ泳法をやらせるより、
    // ひとりひとりの得意を伸ばしたいときに選ぶ。
    this.strokeBtns[OWN_STYLE] = this.modal.button(
      24 + cw / 2,
      y + 18,
      cw,
      36,
      "スタイル1（各自のいちばん得意な種目）",
      () => this.pickStroke(OWN_STYLE),
      { color: 0x2c3e50, hoverColor: 0x3d5a80, selectedColor: 0x8e6a2e, fontSize: 12.5 },
      body,
    );
    y += 44;

    // --- 個人指定の一括解除 ---
    this.modal.button(
      24 + cw / 2,
      y + 18,
      cw,
      36,
      "個人指定をすべて解除して全体練習に揃える",
      () => this.onResetIndividual(),
      { color: 0x39597e, hoverColor: 0x4a6f9c, fontSize: 13 },
      body,
    );
    y += 46;

    // --- クラス単位の休養 ---
    this.modal.text(24, y, `休養（クラス単位・${REST.weeks}週まるごと休む）`, 13, "#9fb3c4", true, body);
    y += 20;
    this.restLine = this.modal.text(24, y, "", 12, "#9fb3c4", false, body);
    setJaWrap(this.restLine, cw);
    y += 34;
    const halfW = (cw - 8) / 2;
    this.modal.button(
      24 + halfW / 2,
      y + 20,
      halfW,
      40,
      "全員を休養させる",
      () => this.onRestAll(),
      { color: 0x2e7d5b, hoverColor: 0x3fa876, fontSize: 14 },
      body,
    );
    this.modal.button(
      24 + halfW + 8 + halfW / 2,
      y + 20,
      halfW,
      40,
      "休養を取り消す",
      () => this.onCancelRest(),
      { color: 0x5a3a3a, hoverColor: 0x7f4a4a, fontSize: 14 },
      body,
    );
    y += 46;
    this.noticeText = this.modal.text(24 + cw / 2, y, "", 12, "#2ecc71", true, body).setOrigin(0.5, 0);
    y += 24;

    // --- 名簿（誰を休ませるかを決めるための体力・調子・能力） ---
    // 列の見出しは置かない。1人ぶんが2行になるので、見出しの行と中身の行が
    // 縦にずれて読みにくくなる。代わりに各行へ「体力」「能力」と直接書いてある。
    this.rosterHead = this.modal.text(24, y, "", 13, "#9fb3c4", true, body);
    setJaWrap(this.rosterHead, cw);
    y += 24;
    this.rosterTop = y;

    // 行はクラス定員ぶん作って使い回す（クラスを切り替えるたびに作り直さない）。
    // 実際に何行ぶんスクロールできるかは、選んでいるクラスの人数で render が決める。
    const maxRows = Math.max(...ASSIGNABLE.map((id) => classDef(id).capacity));
    for (let i = 0; i < maxRows; i++) this.rows.push(this.makeRow(i, cw));

    this.modal.enableScroll(viewTop, viewH);

    this.modal.button(this.width / 2, height - 32, this.width - 60, 46, "閉じる", () => cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });

    this.selectClass(this.classId);
  }

  destroy(): void {
    this.modal.destroy();
  }

  /** 上下にスクロールする（開発の見た目確認から呼ぶ）。 */
  scrollBy(dy: number): void {
    this.modal.scrollBy(dy);
  }

  // ---------------------------------------------------------------- 名簿の行

  /**
   * 1行ぶんの表示物を作る（中身は render で差し替える）。
   *
   * 1人ぶんを**2行**に分ける。1行に押し込むと、名前が長い子で能力や調子に重なる。
   *   上の行 … 名前　　　　　　　能力 42　　◇普通
   *   下の行 … [体力ゲージ] 26/73 少し疲れ　　得意 バタ100
   *
   * 【タップでは開かない。長押しで開く】以前は行をタップするとその選手の画面が開いたが、
   * スワイプで名簿を送るときに指が触れて勝手に開いてしまっていた。
   * かわりに**長押し（→ ui/longPress.ts）**で選手カードを開く。
   * 指が動いたら取り消すので、スワイプ中に開くことはない。
   */
  private makeRow(i: number, cw: number): RowView {
    const body = this.modal.body;
    const cy = this.rosterTop + i * ROW_H + ROW_H / 2;
    const bg = this.scene.add
      .rectangle(24 + cw / 2, cy, cw, ROW_H - 6, 0x1c3550, 1)
      .setStrokeStyle(1, 0x2e4a66, 1);
    body.add(bg);

    const view: RowView = {
      bg,
      student: null,
      name: this.modal.text(34, cy - 21, "", 15, "#ffffff", true, body),
      ability: this.modal.text(34 + NAME_W + 12, cy - 20, "", 14, "#f7dc6f", true, body),
      cond: this.modal.text(24 + cw - 12, cy - 20, "", 13.5, "#ecf0f1", true, body).setOrigin(1, 0),
      bar: this.scene.add.graphics(),
      energy: this.modal.text(34 + BAR_W + 8, cy + 2, "", 12.5, "#f1c40f", true, body),
      style: this.modal.text(24 + cw - 12, cy + 2, "", 12.5, "#8fc0e6", false, body).setOrigin(1, 0),
    };
    view.name.setWordWrapWidth(NAME_W);
    body.add(view.bar);
    this.attachLongPress(view);
    return view;

  }

  /** 見た目確認から、1人目の選手カードを開く（?open=practice:… &press=1）。 */
  devOpenFirstCard(): void {
    const s = this.state.students[this.classId][0];
    if (s) this.cb.onOpenCard?.(s);
  }

  /**
   * 行に長押しを付ける。
   *
   * 【なぜタップではなく長押しか】この一覧は縦に長く、指でなぞって送る。
   * タップで開く作りだと、送っている途中に指が離れた場所で勝手に画面が開く。
   * 長押しなら「送る」と「開く」が指の動きではっきり分かれる。
   *
   * 押している間に大きく指が動いたら取り消す（＝スワイプ）。行は使い回すので、
   * 開く相手は長押しが成立した瞬間の row.student を聞き直す。
   */
  private attachLongPress(row: RowView): void {
    attachLongPress(
      this.scene,
      row.bg,
      () => (this.cb.onOpenCard ? row.student : null),
      (s) => this.cb.onOpenCard?.(s),
      // 窓の外へスクロールした行は反応させない
      //（マスクは見た目を切るだけで、当たり判定はヘッダの裏に残っている）
      (p) => this.modal.isInsideView(p.x, p.y),
    );
  }

  // ---------------------------------------------------------------- 操作

  private selectClass(id: ClassId): void {
    this.classId = id;
    for (const c of ASSIGNABLE) this.tabBtns[c]?.setSelected(c === id);
    this.render();
  }

  private pickAbility(key: StatKey): void {
    this.state.setClassPlan(this.classId, { ability: key });
    this.flash(`${classLabel(this.classId)}の全体練習を「${STAT_LABEL[key]}」にした`);
    this.render();
    this.cb.onChanged();
  }

  private pickStroke(stroke: PlanStroke): void {
    this.state.setClassPlan(this.classId, { stroke });
    this.flash(`${classLabel(this.classId)}の専門練習を「${PLAN_STROKE_LABEL[stroke]}」にした`);
    this.render();
    this.cb.onChanged();
  }

  private onResetIndividual(): void {
    const n = this.state.useClassPlanAll(this.classId);
    this.flash(n > 0 ? `${n}人 を全体練習に戻した` : "個人指定している選手はいない");
    this.render();
    this.cb.onChanged();
  }

  private onRestAll(): void {
    const n = this.state.restClass(this.classId);
    this.flash(n > 0 ? `${n}人 が${REST.weeks}週まるごと休む` : "全員すでに休養中");
    this.render();
    this.cb.onChanged();
  }

  private onCancelRest(): void {
    this.state.cancelRestClass(this.classId);
    this.flash("休養を取り消した（次の練習から戻る）");
    this.render();
    this.cb.onChanged();
  }

  private flash(message: string): void {
    this.noticeText.setText(message);
    this.scene.time.delayedCall(2200, () => this.noticeText?.setText(""));
  }

  // ---------------------------------------------------------------- 描画

  private render(): void {
    const id = this.classId;
    const roster = this.state.students[id];
    const total = roster.length;
    const individual = this.state.individualPlanCount(id);
    const plan = this.state.classPlanOf(id);

    // 1日に何コマ練習しているかを添える（コマ＝練習回数。増やすほど伸びるが疲れる）
    const slots = this.state.slotCountFor(this.classId);
    this.headline.setText(
      `在籍 ${total}人　うち個人指定 ${individual}人（残り ${Math.max(0, total - individual)}人が全体練習）` +
        `　／　1日 ${slots}コマ${slots >= 4 ? "（詰め込みすぎ）" : ""}`,
    );
    this.planLine.setText(
      plan
        ? `全体練習　系統A：${STAT_LABEL[plan.ability]}　／　系統B：${PLAN_STROKE_LABEL[plan.stroke]}`
        : "全体練習：未指定（各自のメニューで練習中）",
    );

    for (const key of TRAINABLE_KEYS) this.abilityBtns[key]?.setSelected(!!plan && plan.ability === key);
    for (const stroke of [...STROKE_KEYS, OWN_STYLE]) this.strokeBtns[stroke]?.setSelected(!!plan && plan.stroke === stroke);

    const resting = this.state.restScheduledCount(id);
    this.restLine.setText(
      resting > 0
        ? `休養中：${resting}人（練習には出ず、体力と調子が戻る。取り消せば次の練習から戻る）`
        : `休養の予定なし（休ませると${REST.weeks}週まるごと休み、そのぶん成長は止まる）`,
    );
    this.restLine.setColor(resting > 0 ? "#f1c40f" : "#9fb3c4");

    // --- 名簿（体力と調子）---
    this.rosterHead.setText(
      total > 0
        ? `${classLabel(id)}の選手（長押しで選手カード）`
        : `${classLabel(id)}にはまだ選手がいない（下のクラスから昇格させよう）`,
    );
    this.rows.forEach((row, i) => this.updateRow(row, roster[i] ?? null));
    // 人数ぶんだけスクロールできるようにする（空行の下まで送れてしまわないように）
    this.modal.setContentHeight(this.rosterTop + total * ROW_H + 12 - this.viewTop);
  }

  /** 行の中身を差し替える（s が null なら行ごと隠す）。 */
  private updateRow(row: RowView, s: Student | null): void {
    row.student = s;
    const parts = [row.bg, row.name, row.ability, row.cond, row.energy, row.style];
    if (!s) {
      for (const p of parts) p.setVisible(false);
      row.bar.setVisible(false).clear();
      return;
    }
    for (const p of parts) p.setVisible(true);
    row.bar.setVisible(true);

    const resting = this.state.isRestingNow(s);
    row.bg.setFillStyle(resting ? 0x25405c : 0x1c3550, 1);
    row.bg.setStrokeStyle(1, resting ? 0x4a7ba8 : 0x2e4a66, 1);

    // --- 上の行：名前／能力／調子
    // 休養の印は**下の行**（体力のとなり）に出す。名前に足すと、長い名前の子で
    // 折り返して2行になり、下の体力の行に重なる。
    const weeks = this.state.restWeeksLeftOf(s);
    row.name.setText(s.name);
    row.name.setColor(weeks > 0 ? "#f1c40f" : "#ffffff");
    // 能力は5つの平均。数値だけだと強さが伝わらないのでランク（G〜SS）を添える
    const avg = overallAbility(s);
    const rank = statRank(avg);
    row.ability.setText(`能力 ${Math.round(avg)} ${rank}`).setColor(statRankColor(rank));

    const lv = conditionLevel(s.condition);
    row.cond.setText(`${CONDITION_ICON[lv]}${CONDITION_LABEL[lv]}`).setColor(CONDITION_COLOR[lv]);

    // --- 下の行：体力ゲージ＋数値／得意（スタイル1）
    // 体力の色は頭上の疲れマーク・選手カードと同じ段階（→ sim/stamina.ts）
    const st = staminaOf(s);
    const bx = 34;
    const by = row.bg.y + 6;
    row.bar.clear();
    row.bar.fillStyle(0x000000, 0.4);
    row.bar.fillRoundedRect(bx, by, BAR_W, 11, 5.5);
    row.bar.fillStyle(STAMINA_BAR[st.level], 1);
    row.bar.fillRoundedRect(bx, by, Math.max(11, BAR_W * st.ratio), 11, 5.5);
    row.energy
      .setText(
        `${Math.round(st.value)}/${Math.round(st.max)}　${STAMINA_LABEL[st.level]}` +
          (weeks > 0 ? `　🛌${weeks}週` : ""),
      )
      .setColor(STAMINA_COLOR[st.level]);

    // スタイル1＝その子のいちばん得意な種目。全体練習で「スタイル1」を選ぶと、
    // 全員がここに出ている種目を練習することになる。
    const own = resolveStroke(s, OWN_STYLE);
    row.style.setText(`スタイル1 ${STROKE_SHORT[own]}${s.fav.distance}m`);
  }
}
