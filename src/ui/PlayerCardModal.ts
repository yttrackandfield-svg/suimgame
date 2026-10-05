import { weeksLabel } from "../sim/weeks";
import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { setJaWrap } from "./textWrap";
import { ensurePortrait, PORTRAIT_SIZE } from "../gfx/portrait";
import { StatRadar } from "../gfx/StatRadar";
import { buildProfile } from "../sim/profile";
import { rankColor, rankLabel, rankProgress, RANK_MAX_TIER } from "../sim/rank";
import { classLabel } from "../sim/classes";
import {
  CAREER_PHASE_COLOR,
  CAREER_PHASE_LABEL,
  careerPhaseOf,
  estimatedAge,
  growthHint,
  yearsLeftOf,
} from "../sim/growth";
import { careerLine } from "../data/careerLines";
import { conditionLevel, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import {
  bestStrokeOf,
  CORE_STROKES,
  firstSnapshot,
  formatTime,
  strokeExecution,
  strokeProfOf,
  GENDER_LABEL,
  STAT_KEYS,
  STAT_LABEL,
  STROKE_LABEL,
  talentRankOf,
  TALENT_COLOR,
  TALENT_ORDER,
  type StatSnapshot,
  type Stroke,
  type Student,
} from "../sim/student";
import { staminaOf, STAMINA_BAR, STAMINA_COLOR, STAMINA_ICON, STAMINA_LABEL } from "../sim/stamina";
import { STANDARD_LABEL, type StandardKey } from "../data/standardTimes";
import { STROKE } from "../config/balance";

/**
 * 選手カード（個人情報画面）。
 *
 * 【見た目はサッカーゲームの選手データ画面に寄せてある】
 *  ・上に**タブ**（能力／成績／特徴）。切り替えても頭の名札は動かない
 *  ・顔・背番号・名前・年齢・クラス・得意を、1つずつ**銘板（枠付きの箱）**にして並べる。
 *    箱にすると行が混ざらず、小さい画面でも「どこに何が書いてあるか」が決まる
 *  ・能力は**金色のレーダー1枚**。数字も能力ランクの文字も出さない
 *   （並べると結局どれを見ればいいのか分からなくなるので、形と才能ランクだけにした）
 *  ・才能はスキル欄のように**小さな札**を並べる。札の左に色の帯、右にランク（E〜SS）
 *
 * 中身の情報は前と同じで、並べ方と装いだけを変えている。
 */

export interface PlayerCardEnv {
  /** クラス平均（プロフィール4行目の「環境」判定に使う）。 */
  classAvg?: number;
  /**
   * 比較する相手を選ぶ画面を開く（無ければ「ほかの選手とくらべる」を出さない）。
   * 選手の一覧はクラブ側が持っているので、開くところだけ外から渡してもらう。
   */
  pickRival?: (onPick: (s: Student) => void) => void;
  /**
   * 練習・指示の画面（育成パネル）を開く。
   * カードは**見るための画面**なので、操作はこのボタンから向こうへ渡す。
   */
  openTraining?: () => void;
  /**
   * 注目選手（★）の付け外し。**名簿と同じ操作をこのカードにも置く**ための入口。
   *
   * 上限（3人）を見るのはクラブ側なので、ここは結果だけ受け取る。
   * 断られたときは印を変えない＝**古い★を勝手に外さない**。
   * 省略すると★そのものを出さない（見るだけの場面で押させないため）。
   */
  togglePin?: () => { ok: boolean; pinned: boolean; reason?: string };
  /**
   * プロの契約金（クラブが毎月払う額 → PRO_SALARY）。プロ以外は渡さない。
   * 格が上がると上がるので、「この子をプロで抱え続けるか」を決める材料としてカードに出す。
   */
  proSalary?: number;
  /** 合宿に出かけているなら、帰ってくるまでの週（いなければ渡さない）。 */
  campWeeksLeft?: number;
}

/** 前後の選手へ移る（名簿の並び順）。無ければボタンは灰色のまま。 */
export interface PlayerCardNav {
  onPrev?: () => void;
  onNext?: () => void;
  /** 「育成A　3 / 12人」のような現在地。 */
  position?: string;
  /**
   * 閉じるボタンの見出し（「◀ 名簿」「◀ 全体練習」など）。
   * どこから来たのかが分かると、戻る操作をためらわない。
   */
  backLabel?: string;
}

/** 左右の余白。中身はこの内側に並べる。 */
const PAD = 22;

/** 銘板の色。暗い下地＋明るい枠で、情報の1つ1つを箱として見せる。 */
const PLATE_BG = 0x0d1a26;
const PLATE_LINE = 0x4d6b86;
/** ラベル側の銘板（「クラス」「得意」）は少し明るくして、値と区別する。 */
const LABEL_BG = 0x21384c;

/** 得意泳法の札の色（サッカーのポジション章のように、ひと目で分かる色にする）。 */
const STROKE_COLOR: Record<Stroke, number> = {
  free: 0x27ae60,
  back: 0x2e86c1,
  breast: 0xaf7ac5,
  fly: 0xe67e22,
  im: 0x16a085,
};

/** 札に入れる短い泳法名。 */
const STROKE_SHORT: Record<Stroke, string> = {
  free: "自由",
  back: "背",
  breast: "平",
  fly: "バタ",
  im: "個メ",
};

/** タブの並び。 */
const TABS = ["能力", "泳法", "成績", "特徴"] as const;

export class PlayerCardModal {
  private readonly modal: Modal;
  private readonly scene: Phaser.Scene;
  private readonly env: PlayerCardEnv;
  private readonly tabBtns: Button[] = [];
  private tab = 0;

  /**
   * 【重ねる相手】
   *   null           … 重ねない
   *   StatSnapshot   … 過去の自分（年度の記録）
   *   Student        … ほかの選手
   * どちらも「下地（水色）」として、いまの形（金）の下に敷く。
   */
  private baseSnap: StatSnapshot | null = null;
  private rival: Student | null = null;
  /** 過去と比べているとき、履歴の何件目か（◀▶ の送りに使う）。 */
  private histIndex = -1;
  private radar?: StatRadar;
  /** 注目選手の★（顔の左上に重ねる）。env.togglePin が無いときは作らない。 */
  private pinStar?: Phaser.GameObjects.Text;
  /** くらべる操作のボタン（なし／1年前／入団時／◀／▶）。選択中を光らせるために持つ。 */
  private cmpBtns: Button[] = [];
  private compareText?: Phaser.GameObjects.Text;
  /** 軌跡の再生（年を送っていくタイマー）。 */
  private playEvent?: Phaser.Time.TimerEvent;

  /** 本文の窓の上端（タブを切り替えても変わらない）。 */
  private viewTop = 0;
  /** 本文の幅（右端の▲▼ぶんを除く）。 */
  private cw = 0;
  private width = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly student: Student,
    env: PlayerCardEnv,
    onClose: () => void,
    nav: PlayerCardNav = {},
  ) {
    this.scene = scene;
    this.env = env;
    const width = Math.min(516, GAME_WIDTH - 16);
    const height = Math.min(920, GAME_HEIGHT - 20);
    this.width = width;

    this.modal = new Modal(scene, { width, height, title: "選手カード", depth: 2560 }, () => onClose());
    const m = this.modal;
    this.cw = width - PAD * 2 - m.scrollGutter;

    const headBottom = this.buildIdentity(m.contentTop);
    const tabsY = headBottom + 10;
    this.buildTabs(tabsY);

    this.viewTop = tabsY + 52; // タブを高くしたぶん（42 + 余白）
    const footH = 92; // 下段のボタンを高く（52）したぶん
    m.enableScroll(this.viewTop, height - this.viewTop - footH);
    this.buildTab();

    // ---------------------------------------------------------------- フッタ（固定）
    const by = height - 34;
    const prev = m.button(PAD + 78, by, 156, 52, "◀ 前の選手", () => nav.onPrev?.(), {
      color: 0x2c3e50,
      hoverColor: 0x3d5266,
      fontSize: 16,
    });
    prev.setEnabled(!!nav.onPrev);
    m.button(width / 2, by, 140, 52, nav.backLabel ?? "閉じる", () => onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: nav.backLabel ? 15 : 17,
    });
    const next = m.button(width - PAD - 78, by, 156, 52, "次の選手 ▶", () => nav.onNext?.(), {
      color: 0x2c3e50,
      hoverColor: 0x3d5266,
      fontSize: 16,
    });
    next.setEnabled(!!nav.onNext);
    if (nav.position) m.text(PAD, by - 36, nav.position, 13.5, "#95a6b8").setOrigin(0, 0.5);
  }

  // ================================================================ 固定の名札
  /**
   * 顔・背番号・名前・年齢・クラス・得意・学年・調子・格。
   *
   * ここは**タブを切り替えても、スクロールしても消えない**。
   * 選手を見比べているときに「いま誰を見ているか」を見失わないため。
   */
  private buildIdentity(top: number): number {
    const m = this.modal;
    const s = this.student;
    const g = this.scene.add.graphics();
    m.container.add(g);

    // --- 顔（左）。左下に背番号の札を重ねる
    const face = 96;
    this.plate(g, PAD, top, face, face, PLATE_BG);
    const key = ensurePortrait(this.scene, s);
    m.container.add(this.scene.add.image(PAD + face / 2, top + face / 2, key).setScale((face - 8) / PORTRAIT_SIZE));
    this.plate(g, PAD + 3, top + face - 23, 48, 20, 0x000000, 0.66);
    m.text(PAD + 8, top + face - 21, `No.${String(s.id).slice(-2)}`, 13.5, "#e8eef3", true);

    /**
     * 【★は顔の左上の角】名簿の行と**同じ場所・同じ押し方**にしてある。
     * 片方だけ置き場所が違うと「この画面では付けられない」と思われるため。
     *
     * 下敷きは `plate`（graphics）ではなく矩形を重ねる
     * ——`g` は顔より先に container へ入っているので、plate だと顔の絵に隠れる。
     * 当たり判定は指で押せる大きさ（26px）を別に持たせる（字そのものは小さい）。
     */
    if (this.env.togglePin) {
      const sx = PAD + 14;
      const sy = top + 14;
      m.container.add(
        this.scene.add.rectangle(sx, sy, 26, 26, 0x0a1622, 0.62).setStrokeStyle(1, 0x3d5266, 0.9),
      );
      this.pinStar = m.text(sx, sy, "", 19, "#ffffff", true).setOrigin(0.5);
      this.refreshPinStar();
      this.pinStar
        .setInteractive(new Phaser.Geom.Rectangle(-13, -13, 26, 26), Phaser.Geom.Rectangle.Contains)
        .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.();
          this.env.togglePin?.();
          // 付いたか外れたかは**印そのもの**を見る（断られたときは何も変わらない）
          this.refreshPinStar();
        });
    }

    // --- 右側は3段の銘板（名前／クラス／得意）
    const rx = PAD + face + 10;
    const right = this.width - PAD;
    const rowH = 28;

    // 1段目：得意泳法の章 ＋ 名前 ＋ 年齢
    const badgeW = 48;
    const ageW = 66;
    this.plate(g, rx, top, badgeW, rowH, STROKE_COLOR[s.fav.stroke]);
    this.centerText(rx, top, badgeW, rowH, STROKE_SHORT[s.fav.stroke], 14, "#ffffff");
    const nameX = rx + badgeW + 4;
    const nameW = right - nameX - ageW - 4;
    this.plate(g, nameX, top, nameW, rowH, PLATE_BG);
    const name = m.text(nameX + 8, top + 3, s.name, 20, "#f7dc6f", true);
    setJaWrap(name, nameW - 16);
    this.plate(g, right - ageW, top, ageW, rowH, PLATE_BG);
    this.centerText(right - ageW, top, ageW, rowH, `${estimatedAge(s.grade)}歳`, 15, "#ecf0f1");

    // 2段目・3段目：ラベルの箱＋値の箱
    const labelW = 58;
    const rows: [string, string, string][] = [
      ["クラス", classLabel(s.classId), "#aed6f1"],
      ["得意", `${STROKE_LABEL[s.fav.stroke]} ${s.fav.distance}m`, "#f9e79f"],
    ];
    rows.forEach(([label, value, color], i) => {
      const y = top + (rowH + 4) * (i + 1);
      this.plate(g, rx, y, labelW, rowH, LABEL_BG);
      this.centerText(rx, y, labelW, rowH, label, 13.5, "#9fb3c4");
      this.plate(g, rx + labelW + 4, y, right - rx - labelW - 4, rowH, PLATE_BG);
      m.text(rx + labelW + 12, y + 6, value, 15, color, true);
    });

    // --- 全幅の1行（学年・性別／調子）と、練習・指示への入口。
    // 格は「成績」タブに出しているので、ここには重ねて書かない
    const y2 = top + face + 6;
    const lv = conditionLevel(s.condition);
    const btnW = this.env.openTraining ? 132 : 0;
    this.plate(g, PAD, y2, right - PAD - (btnW ? btnW + 6 : 0), 28, PLATE_BG);
    m.text(PAD + 10, y2 + 6, `${s.grade}・${GENDER_LABEL[s.gender]}`, 14.5, "#bdc3c7");
    m.text(PAD + 104, y2 + 6, `${CONDITION_ICON[lv]}${CONDITION_LABEL[lv]}`, 14.5, CONDITION_COLOR[lv], true);
    if (this.env.openTraining) {
      m.button(right - btnW / 2, y2 + 14, btnW, 32, "練習・指示 ▶", () => this.env.openTraining?.(), {
        color: 0x2f6f4f,
        hoverColor: 0x3f8a63,
        fontSize: 15,
      });
    }
    return y2 + 28;
  }

  /** ★の見た目を、いまの印に合わせ直す。 */
  private refreshPinStar(): void {
    const on = this.student.pinned;
    this.pinStar?.setText(on ? "★" : "☆").setColor(on ? "#f7dc6f" : "#8fa3b8");
  }

  /** タブ（能力／成績／特徴）。押すと本文だけ入れ替わる。 */
  private buildTabs(y: number): void {
    const m = this.modal;
    const usable = this.width - PAD * 2;
    const w = (usable - 8) / TABS.length;
    TABS.forEach((label, i) => {
      // 【指で押す大きさ】高さ30・字14 では小さかったので、42・17 に上げた（2026-09-24）
      const btn = m.button(PAD + w / 2 + i * (w + 4), y + 21, w, 42, label, () => this.showTab(i), {
        color: 0x24384c,
        hoverColor: 0x33506b,
        selectedColor: 0xc8a020,
        fontSize: 17,
      });
      btn.setSelected(i === this.tab);
      this.tabBtns.push(btn);
    });
  }

  /**
   * 外から比較の相手を指定する（見た目確認の ?cmp= や、他画面から開くとき用）。
   *   Student … その選手と重ねる
   *   number  … 自分の履歴の何件目と重ねる
   *   null    … 重ねない
   */
  setCompare(target: Student | number | null): void {
    if (target === null) this.setBaseIndex(-1);
    else if (typeof target === "number") this.setBaseIndex(target);
    else this.setRival(target);
  }

  /** タブを選ぶ（見た目確認の ?tab= からも呼ぶ）。 */
  showTab(i: number): void {
    if (i === this.tab) return;
    this.tab = i;
    this.tabBtns.forEach((b, n) => b.setSelected(n === i));
    this.modal.clearBody();
    this.buildTab();
  }

  /** いま選んでいるタブの中身を body に作る。 */
  private buildTab(): void {
    // body を作り直すと、中に居たレーダーや凡例も消える。参照を先に捨てておく
    this.radar = undefined;
    this.compareText = undefined;
    this.cmpBtns = [];
    this.playEvent?.remove();
    this.playEvent = undefined;
    let y = this.viewTop + 8;
    if (this.tab === 0) {
      y = this.radarPlate(y);
      y = this.talentPlates(y);
      y = this.staminaSection(y);
    } else if (this.tab === 1) {
      y = this.strokeSection(y);
    } else if (this.tab === 2) {
      y = this.rankSection(y);
      y = this.resultsSection(y);
    } else {
      y = this.careerSection(y);
      y = this.profileSection(y);
      y = this.stateSection(y);
    }
    this.modal.setContentHeight(y - this.viewTop + 12);
  }

  // ================================================================ 能力タブ
  /**
   * 金色のレーダー1枚。
   *
   * 数字も能力ランクの文字も出さない。**形**が選手の型（短距離型・持久型・
   * バランス型）で、頂点の色つき文字がその能力の**伸びる速さ**（才能ランク）。
   * 育つほど大きくなり、外枠を超えることはない。
   */
  private radarPlate(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);

    const radius = 112;
    // 頂点は能力名の1行だけ（才能は下の札で読む）。そのぶん枠を詰められる
    const boxH = radius * 2 + 82;
    this.plate(g, PAD, y0, this.cw, boxH, PLATE_BG);
    m.text(PAD + 10, y0 + 8, "能力", 13.5, "#9fb3c4", true, m.body);

    const radar = new StatRadar(this.scene, PAD + this.cw / 2, y0 + 56 + radius, {
      radius,
      labels: true,
      dots: false,
      fontSize: 13,
    });
    m.body.add(radar.root);
    this.radar = radar;

    // 凡例（枠の中の右上）。何と何を重ねているのかを、色と一緒に出す
    this.compareText = m.text(PAD + this.cw - 10, y0 + 8, "", 14.5, "#95a6b8", true, m.body).setOrigin(1, 0);
    this.applyCompare();

    let y = this.compareControls(y0 + boxH + 8);
    const note = m.text(
      PAD,
      y,
      "多角形の大きさ＝いまの能力。くらべる相手を選ぶと、その形が下地（水色）で重なる。",
      13,
      "#95a6b8",
      false,
      m.body,
    );
    setJaWrap(note, this.cw);
    return y + note.height + 12;
  }

  /**
   * 【くらべる操作】過去の自分・ほかの選手と重ねるためのボタン。
   *
   * 押しても本文は作り直さない（下地を描き替えるだけ）。
   * 作り直すとスクロールの位置が飛んで、見ていた形を見失うため。
   */
  private compareControls(y0: number): number {
    const m = this.modal;
    const hist = this.student.history ?? [];
    // 【指で押す大きさ】5つ並ぶ段なので、高さを38に上げて字も大きくする
    const h = 38;
    const gap = 5;

    // 1段目：過去の自分（なし／1年前／入団時／◀▶で年を送る）
    const w1 = (this.cw - gap * 4) / 5;
    this.cmpBtns = [];
    const mk = (i: number, label: string, fn: () => void, on: boolean, live = true): void => {
      const b = m.button(
        PAD + w1 / 2 + i * (w1 + gap),
        y0 + h / 2,
        w1,
        h,
        label,
        fn,
        { color: 0x24384c, hoverColor: 0x33506b, selectedColor: 0x2f6f4f, fontSize: 14 },
        m.body,
      );
      b.setSelected(on);
      b.setEnabled(live);
      this.cmpBtns.push(b);
    };
    const none = this.baseSnap === null && !this.rival;
    mk(0, "なし", () => this.setBaseIndex(-1), none);
    mk(1, "1年前", () => this.setBaseIndex(hist.length - 2), false, hist.length >= 2);
    mk(2, "入団時", () => this.setBaseIndex(0), false, hist.length >= 1);
    mk(3, "◀", () => this.stepYear(-1), false, hist.length >= 1);
    mk(4, "▶", () => this.stepYear(1), false, hist.length >= 1);

    // 2段目：ほかの選手／軌跡の再生
    const y2 = y0 + h + gap;
    const w2 = (this.cw - gap) / 2;
    if (this.env.pickRival) {
      m.button(
        PAD + w2 / 2,
        y2 + h / 2,
        w2,
        h,
        this.rival ? "くらべるのをやめる" : "ほかの選手とくらべる",
        () => (this.rival ? this.clearRival() : this.env.pickRival?.((r) => this.setRival(r))),
        { color: 0x2c4a6b, hoverColor: 0x3d6389, fontSize: 15 },
        m.body,
      );
    }
    const play = m.button(
      PAD + this.cw - w2 / 2,
      y2 + h / 2,
      w2,
      h,
      "成長の軌跡を再生",
      () => this.playHistory(),
      { color: 0x4a3d6b, hoverColor: 0x63528e, fontSize: 15 },
      m.body,
    );
    play.setEnabled(hist.length >= 2);
    return y2 + h + 10;
  }

  /** 何年目の記録と重ねるか（-1＝重ねない）。 */
  private setBaseIndex(i: number): void {
    const hist = this.student.history ?? [];
    const hadRival = !!this.rival;
    this.rival = null;
    if (i < 0 || hist.length === 0) {
      this.histIndex = -1;
      this.baseSnap = null;
    } else {
      this.histIndex = Math.max(0, Math.min(hist.length - 1, i));
      this.baseSnap = hist[this.histIndex];
    }
    // 相手との比較をやめたときは、才能の札の並びも戻す
    if (hadRival) this.rebuildBody();
    else this.applyCompare();
  }

  /** ◀▶ で年を送る。 */
  private stepYear(d: number): void {
    const hist = this.student.history ?? [];
    if (hist.length === 0) return;
    const from = this.histIndex < 0 ? (d > 0 ? -1 : hist.length) : this.histIndex;
    this.setBaseIndex(Math.max(0, Math.min(hist.length - 1, from + d)));
  }

  /** ほかの選手と重ねる（才能の札も並べ直すので、本文を作り直す）。 */
  private setRival(r: Student): void {
    this.rival = r;
    this.baseSnap = null;
    this.histIndex = -1;
    this.rebuildBody();
  }

  private clearRival(): void {
    this.rival = null;
    this.rebuildBody();
  }

  /** 本文だけ作り直す（スクロールの位置は保つ）。 */
  private rebuildBody(): void {
    this.modal.clearBody(true);
    this.buildTab();
  }

  /** いまの選択を、下地・凡例・ボタンの光りかたに反映する。 */
  private applyCompare(): void {
    const s = this.student;
    // 押したボタンが光ったままになるよう、毎回そろえ直す
    const hist = s.history ?? [];
    const sel = [
      this.baseSnap === null && !this.rival,
      !!this.baseSnap && this.histIndex === hist.length - 2,
      !!this.baseSnap && this.histIndex === 0,
      false,
      false,
    ];
    this.cmpBtns.forEach((b, i) => b.setSelected(sel[i] ?? false));
    this.radar?.showStats(s.stats, "now");
    if (this.rival) {
      this.radar?.setBase(this.rival.stats);
      this.compareText?.setText(`■いま　■${this.rival.name}`).setColor("#8fd0ff");
    } else if (this.baseSnap) {
      this.radar?.setBase(this.baseSnap.stats);
      const head = this.baseSnap === firstSnapshot(s) ? "入団時 " : "";
      this.compareText
        ?.setText(`■いま　■${head}${this.baseSnap.year}年目 ${this.baseSnap.grade}`)
        .setColor("#8fd0ff");
    } else {
      this.radar?.setBase(null);
      this.compareText?.setText("").setColor("#95a6b8");
    }
  }

  /**
   * 【成長の軌跡】入団時から今までを、年ごとにパラパラと見せる。
   *
   * 主役（金）の形を古い年から順に置き換えていき、最後にいまの形へ戻す。
   * 下地は入団時のまま置いておくので、「ここから、ここまで育った」が分かる。
   */
  private playHistory(): void {
    const hist = this.student.history ?? [];
    if (hist.length < 2) return;
    this.playEvent?.remove();
    this.rival = null;
    this.baseSnap = hist[0];
    this.histIndex = 0;
    this.radar?.setBase(hist[0].stats);

    let i = 0;
    const step = (): void => {
      if (i < hist.length) {
        const h = hist[i];
        this.radar?.showStats(h.stats, `h${h.year}`);
        this.compareText?.setText(`▶ ${h.year}年目 ${h.grade}`).setColor("#f7dc6f");
        i += 1;
        return;
      }
      // 最後はいまの形に戻す（再生が終わったことが形で分かる）
      this.radar?.showStats(this.student.stats, "now");
      this.compareText?.setText(`■いま　■入団時 ${hist[0].year}年目 ${hist[0].grade}`).setColor("#8fd0ff");
      this.playEvent?.remove();
      this.playEvent = undefined;
    };
    step();
    this.playEvent = this.scene.time.addEvent({ delay: 520, repeat: hist.length, callback: step });
  }

  /** 才能を「スキル札」のように並べる（2列）。札の左に色の帯、右にランク。 */
  private talentPlates(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);
    m.text(
      PAD,
      y0,
      this.rival ? `才能　自分 / ${this.rival.name}` : "才能（能力ごとの伸びる速さ）",
      12,
      "#9fb3c4",
      true,
      m.body,
    );

    const y = y0 + 18;
    const colW = (this.cw - 6) / 2;
    const h = 32;
    STAT_KEYS.forEach((k, i) => {
      const x = PAD + (i % 2) * (colW + 6);
      const py = y + Math.floor(i / 2) * (h + 6);
      const t = talentRankOf(this.student, k);
      this.plate(g, x, py, colW, h, PLATE_BG);
      // 左はしにランクの色の帯（一覧の中で強い才能が飛び込んでくる）
      g.fillStyle(Phaser.Display.Color.HexStringToColor(TALENT_COLOR[t]).color, 1);
      g.fillRect(x + 3, py + 3, 5, h - 6);
      m.text(x + 14, py + h / 2, STAT_LABEL[k], 15, "#ecf0f1", true, m.body).setOrigin(0, 0.5);
      if (this.rival) {
        // くらべている相手のランクを右に並べる（才能の差がそのまま読める）
        const rt = talentRankOf(this.rival, k);
        m.text(x + colW - 46, py + h / 2, t, 19, TALENT_COLOR[t], true, m.body).setOrigin(1, 0.5);
        m.text(x + colW - 38, py + h / 2, "/", 14.5, "#5d6d7e", false, m.body).setOrigin(0.5, 0.5);
        m.text(x + colW - 12, py + h / 2, rt, 19, TALENT_COLOR[rt], true, m.body).setOrigin(1, 0.5);
      } else {
        m.text(x + colW - 12, py + h / 2, t, 21, TALENT_COLOR[t], true, m.body).setOrigin(1, 0.5);
      }
    });

    // いちばん強い能力（いまの姿）と、いちばん伸びる能力（これからの姿）
    const rows = Math.ceil(STAT_KEYS.length / 2);
    const best = STAT_KEYS.reduce((a, b) => (this.student.stats[a] >= this.student.stats[b] ? a : b));
    const grow = STAT_KEYS.reduce((a, b) =>
      TALENT_ORDER.indexOf(talentRankOf(this.student, a)) >= TALENT_ORDER.indexOf(talentRankOf(this.student, b))
        ? a
        : b,
    );
    const sum = m.text(
      PAD,
      y + rows * (h + 6) + 4,
      `いちばん強い ${STAT_LABEL[best]}　／　いちばん伸びる ${STAT_LABEL[grow]}（才能${talentRankOf(this.student, grow)}）`,
      14,
      "#cfd8e0",
      false,
      m.body,
    );
    setJaWrap(sum, this.cw);
    return y + rows * (h + 6) + 4 + sum.height + 14;
  }

  /** 体力（スタミナ）。ここは数字も出す（いまどれだけ練習できるかの目安なので）。 */
  private staminaSection(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);
    const st = staminaOf(this.student);

    const h = 60;
    this.plate(g, PAD, y0, this.cw, h, PLATE_BG);
    m.text(PAD + 10, y0 + 7, "体力（スタミナ）", 13.5, "#9fb3c4", true, m.body);
    m.text(
      PAD + this.cw - 12,
      y0 + 3,
      `${Math.round(st.value)}/${Math.round(st.max)}`,
      20,
      STAMINA_COLOR[st.level],
      true,
      m.body,
    ).setOrigin(1, 0);

    const bw = this.cw - 20 - 96;
    const bh = 16;
    const by = y0 + 33;
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(PAD + 10, by, bw, bh, bh / 2);
    g.fillStyle(STAMINA_BAR[st.level], 1);
    g.fillRoundedRect(PAD + 10, by, Math.max(bh, bw * st.ratio), bh, bh / 2);
    m.text(
      PAD + 18 + bw,
      by - 2,
      `${STAMINA_ICON[st.level]}${STAMINA_LABEL[st.level]}`,
      13,
      STAMINA_COLOR[st.level],
      true,
      m.body,
    );
    return y0 + h + 12;
  }

  // ================================================================ 泳法タブ
  /**
   * 4泳法の熟練度を横棒で並べる。
   *
   * 塗りの長さ＝いまの熟練度（0〜999）。
   * 【上限は見せない】才能で決まる頭打ちは内部では効いているが、画面には出さない。
   * 先に上限が見えていると「この泳法はここまで」と決めつけて育てなくなる。
   * 伸びが鈍ってきたことは、バーの進み方そのもので分かればよい。
   * 個人メドレーは専用の熟練度を持たないので、4泳法の平均を参考として最後に出す。
   */
  private strokeSection(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);
    const s = this.student;

    const rows = CORE_STROKES.length;
    const rowH = 52;
    const boxH = 34 + rows * rowH + 8;
    this.plate(g, PAD, y0, this.cw, boxH, PLATE_BG);
    m.text(PAD + 10, y0 + 8, "泳法の熟練度（0〜999）", 13.5, "#9fb3c4", true, m.body);

    const bx = PAD + 74;
    const bw = this.cw - 74 - 78;
    const bh = 14;
    CORE_STROKES.forEach((k, i) => {
      const y = y0 + 34 + i * rowH;
      const prof = strokeProfOf(s, k);
      const exec = strokeExecution(s, k);

      m.text(PAD + 10, y + 1, STROKE_LABEL[k], 14, "#ecf0f1", true, m.body);
      // 溝（0〜999）に、いまの熟練度を塗るだけ
      g.fillStyle(0x000000, 0.45);
      g.fillRoundedRect(bx, y, bw, bh, bh / 2);
      g.fillStyle(STROKE_COLOR[k], 1);
      g.fillRoundedRect(bx, y, Math.max(bh, (bw * prof) / STROKE.max), bh, bh / 2);

      m.text(PAD + this.cw - 10, y - 2, `${Math.round(prof)}`, 15, "#ffffff", true, m.body).setOrigin(1, 0);
      m.text(bx, y + bh + 3, `発揮率 ${(exec * 100).toFixed(0)}%`, 11, "#9fb3c4", false, m.body);
    });

    let y = y0 + boxH + 10;
    // 個人メドレーは4泳法の平均。バランスよく育てた選手ほど強い
    const im = strokeProfOf(s, "im");
    m.text(PAD, y, `個人メドレー適性　${Math.round(im)}（4泳法の平均）　発揮率 ${(strokeExecution(s, "im") * 100).toFixed(0)}%`, 13.5, "#aed6f1", true, m.body);
    y += 20;

    const best = bestStrokeOf(s);
    const sum = m.text(PAD, y, `いちばん泳げる ${STROKE_LABEL[best]}`, 14, "#cfd8e0", false, m.body);
    setJaWrap(sum, this.cw);
    y += sum.height + 8;

    const note = m.text(
      PAD,
      y,
      "熟練度はその泳法で能力を何割出せるか（発揮率）に効く。練習で少しずつ、大会に出るとまとめて上がる。",
      13,
      "#95a6b8",
      false,
      m.body,
    );
    setJaWrap(note, this.cw);
    return y + note.height + 12;
  }

  // ================================================================ 成績タブ
  /** 格（8段階）の階段ゲージ。 */
  private rankSection(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);
    const p = rankProgress(this.student);

    const h = 92;
    this.plate(g, PAD, y0, this.cw, h, PLATE_BG);
    m.text(PAD + 10, y0 + 8, "格", 13.5, "#9fb3c4", true, m.body);
    m.text(PAD + 34, y0 + 6, `${p.tier} / ${RANK_MAX_TIER}`, 14, "#95a6b8", true, m.body);
    m.text(PAD + 10, y0 + 24, rankLabel(p.tier), 19, rankColor(p.tier), true, m.body);

    const barY = y0 + 52;
    const barW = this.cw - 20;
    const cell = (barW - (RANK_MAX_TIER - 1) * 4) / RANK_MAX_TIER;
    for (let i = 0; i < RANK_MAX_TIER; i++) {
      const x = PAD + 10 + i * (cell + 4);
      const reached = i < p.tier;
      g.fillStyle(reached ? Phaser.Display.Color.HexStringToColor(rankColor(i + 1)).color : 0x223b52, 1);
      g.fillRoundedRect(x, barY, cell, 10, 3);
    }
    // 次の格までの進み具合（届いていない段を途中まで塗る）
    if (p.nextNeed !== null) {
      const x = PAD + 10 + p.tier * (cell + 4);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(rankColor(p.tier + 1)).color, 0.45);
      g.fillRoundedRect(x, barY, Math.max(2, cell * p.ratio), 10, 3);
    }
    const label =
      p.nextNeed === null
        ? "これ以上の格は無い"
        : `次の格まで あと ${Math.max(0, Math.ceil(p.nextNeed - p.score))}（実績 ${Math.round(p.score)}）`;
    m.text(PAD + 10, barY + 16, label, 14.5, "#95a6b8", false, m.body);
    return y0 + h + 12;
  }

  /** 自己ベスト・優勝・標準記録・実績ポイント。 */
  private resultsSection(y0: number): number {
    const s = this.student;
    const m = this.modal;
    m.text(PAD, y0, "成績（格の根拠）", 13.5, "#9fb3c4", true, m.body);
    let y = y0 + 20;

    const best =
      s.bestTimeSec > 0 && s.bestTimeEvent
        ? `${STROKE_LABEL[s.bestTimeEvent.stroke]} ${s.bestTimeEvent.distance}m　${formatTime(s.bestTimeSec)}`
        : "まだ記録なし（記録会で計測される）";
    y = this.row(y, "自己ベスト", best, "#f9e79f");
    y = this.row(y, "通算優勝", s.wins > 0 ? `${s.wins} 回` : "なし", s.wins > 0 ? "#2ecc71" : "#95a6b8");
    const std = s.season.standards.map((k) => STANDARD_LABEL[k as StandardKey] ?? k).join("・");
    y = this.row(y, "突破した標準記録", std || "なし（今年度）", std ? "#aed6f1" : "#95a6b8");
    y = this.row(
      y,
      "実績ポイント",
      `記録 ${Math.round(s.bestTimeScore)} ＋ 大会 ${Math.round(s.achievePoints)}`,
      "#bdc3c7",
    );
    return y + 6;
  }

  // ================================================================ 特徴タブ
  /**
   * 【いまどの時期か】急成長期／ピーク／衰え始め／限界。
   *
   * 年齢と成長タイプで決まる（→ AGE_CURVE）。言い回しは data/careerLines.ts。
   * 「この子はまだ伸びるのか、そろそろなのか」が、育てる判断のいちばん大きな材料になる。
   */
  private careerSection(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);
    const s = this.student;
    const phase = careerPhaseOf(s.growthType, s.age);
    const left = yearsLeftOf(s.growthType, s.age);
    const line = careerLine(phase, s.growthType, s.age, left, s.id);
    // 【あと何年、とは書かない】引退の年はタイプで決まる隠しの数字。
    // 先に見えていると「あと2年だから捨てる」といった逆算になってしまう。
    // 成長タイプも、観察度に応じたヒントの範囲でだけ見せる（→ growthHint）。
    const hint = growthHint(s.growthType, s.growthObserved);

    m.text(PAD, y0, "成長段階", 13.5, "#9fb3c4", true, m.body);
    const top = y0 + 18;
    const label = m.text(PAD + 12, top + 8, CAREER_PHASE_LABEL[phase], 20, CAREER_PHASE_COLOR[phase], true, m.body);
    m.text(
      PAD + 12 + label.width + 12,
      top + 15,
      `${s.age}歳　${hint.text}`,
      12,
      hint.level >= 3 ? "#f7dc6f" : "#9fb3c4",
      false,
      m.body,
    );
    const note = m.text(PAD + 12, top + 36, line, 13.5, "#dfe6ec", false, m.body);
    setJaWrap(note, this.cw - 24);
    const h = 36 + note.height + 14;
    this.plate(g, PAD, top, this.cw, h, PLATE_BG);
    m.body.sendToBack(g);
    return top + h + 14;
  }

  /** プロフィール文（条件から組み立てた4行）。 */
  private profileSection(y0: number): number {
    const m = this.modal;
    const g = this.scene.add.graphics();
    m.body.add(g);
    m.text(PAD, y0, "プロフィール", 13.5, "#9fb3c4", true, m.body);

    const profile = buildProfile(this.student, {
      classAvg: this.env.classAvg,
      hasStandard: this.student.season.standards.length > 0,
    });
    // 【枠は測ってから描く】行数が変わっても枠が足りなくならないよう、
    // 先に文を置いて高さを測り、そのあと枠を描いていちばん後ろへ回す。
    const top = y0 + 18;
    let ly = top + 10;
    for (let i = 0; i < profile.lines.length; i++) {
      const t = m.text(PAD + 12, ly, profile.lines[i], 13.5, i === 1 ? "#f7dc6f" : "#dfe6ec", false, m.body);
      setJaWrap(t, this.cw - 24);
      ly += t.height + 8;
    }
    const h = ly - top + 4;
    this.plate(g, PAD, top, this.cw, h, PLATE_BG);
    m.body.sendToBack(g);
    return top + h + 14;
  }

  /** いまの状態（遊びに直接効くもの）。 */
  private stateSection(y0: number): number {
    const s = this.student;
    const m = this.modal;
    m.text(PAD, y0, "状態", 13.5, "#9fb3c4", true, m.body);
    let y = y0 + 20;
    y = this.row(y, "スタイル1", `${STROKE_LABEL[s.fav.stroke]} ${s.fav.distance}m`, "#aed6f1");
    y = this.row(
      y,
      "けが",
      s.injuryDays > 0 ? `あと ${weeksLabel(s.injuryDays)}` : "なし",
      s.injuryDays > 0 ? "#e74c3c" : "#95a6b8",
    );
    y = this.row(y, "寮", s.inDorm ? "入っている" : "入っていない", s.inDorm ? "#2ecc71" : "#95a6b8");
    y = this.row(y, "遠征", s.awayDays > 0 ? `あと ${Math.ceil(s.awayDays)} 週` : "なし", s.awayDays > 0 ? "#f5b041" : "#95a6b8");
    if (this.env.campWeeksLeft != null) {
      y = this.row(y, "合宿", `合宿中　あと ${this.env.campWeeksLeft} 週`, "#e8c07a");
    }
    if (this.env.proSalary != null) {
      y = this.row(y, "契約金", `◆${this.env.proSalary.toLocaleString()} / 月（クラブが払う）`, "#f5b041");
    }
    return y + 6;
  }

  // ================================================================ 部品
  /** 銘板（角丸の箱）。情報の1つ1つを箱にすると、行が混ざらない。 */
  private plate(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    alpha = 1,
  ): void {
    g.fillStyle(fill, alpha);
    g.fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(2, PLATE_LINE, 0.9);
    g.strokeRoundedRect(x, y, w, h, 5);
  }

  /** 箱の中央に文字を置く。 */
  private centerText(x: number, y: number, w: number, h: number, s: string, size: number, color: string): void {
    this.modal.text(x + w / 2, y + h / 2, s, size, color, true).setOrigin(0.5, 0.5);
  }

  /**
   * ラベルと値の1行。
   * 値は折り返すので、行の高さは**実際に測った高さ**で送る（重なりを作らない）。
   */
  private row(y: number, label: string, value: string, color: string): number {
    const m = this.modal;
    m.text(PAD + 4, y + 1, label, 14.5, "#95a6b8", false, m.body);
    const t = m.text(PAD + 128, y, value, 14, color, true, m.body);
    setJaWrap(t, this.cw - 132);
    return y + Math.max(20, t.height + 6);
  }

  /** 下のほうを見る（見た目確認の ?scroll= から使う）。 */
  scrollBy(dy: number): void {
    this.modal.scrollBy(dy);
  }

  destroy(): void {
    this.playEvent?.remove();
    this.modal.destroy();
  }
}
