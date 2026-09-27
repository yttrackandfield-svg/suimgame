import { weeksLabel } from "../sim/weeks";
import Phaser from "phaser";
import {
  classFitStatus,
  formatTime,
  formMultiplier,
  GENDER_LABEL,
  STAT_KEYS,
  STAT_LABEL,
  STROKE_KEYS,
  STROKE_LABEL,
  PLAN_STROKE_LABEL,
  resolveStroke,
  TRAINABLE_KEYS,
  talentRankOf,
  type ClassFitStatus,
  type PracticePlan,
  type StatKey,
  isYouthStage,
  youthPotential,
  youthPotentialHint,
  type Stroke,
  type Student,
} from "../sim/student";
import { CLASS_ORDER, isSchoolClass } from "../sim/classes";
import { growthHint } from "../sim/growth";
import { rankColor, rankLabel, rankOf } from "../sim/rank";
import { conditionLevel, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import { staminaOf, STAMINA_BAR, STAMINA_COLOR, STAMINA_ICON, STAMINA_LABEL, STAMINA_NOTE } from "../sim/stamina";
import { TALENT_COLOR, TALENT_ORDER } from "../sim/student";
import { moodColor, moodLabel } from "../sim/satisfaction";
import { StarMeter } from "../gfx/MoodGauge";
import { coachGradeLabel, coachMatchesStudent, coachSpecialtyLabel, type Coach } from "../sim/coach";
import { ensurePortrait, PORTRAIT_SIZE } from "../gfx/portrait";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { REST } from "../config/balance";
import { Button, closeOnBackdropTap, excludePanelFromBackdrop, type ButtonOptions } from "./Button";
import { flushInput } from "./inputReady";
import { setJaWrap } from "./textWrap";
import { logicalPoint } from "../gfx/renderScale";

/** パネルが必要とする環境（担当コーチ・クラス平均・設備効果・各種操作）。 */
export interface PanelEnv {
  coach?: Coach;
  classAvg: number;
  /** 設備（スタジオ/筋トレルーム）の練習補正。1.0＝効果なし。 */
  equipmentMult?: (key: StatKey) => number;
  onPromote: () => void;
  onDemote: () => void;
  /** 練習プラン（系統A/系統B）が変更された。 */
  onPlanChanged?: () => void;

  /** 個人メニューを指定する（＝全体練習を上書きするモードになる）。 */
  setPlan: (plan: Partial<PracticePlan>) => void;
  /** 個人指定をやめ、クラスの全体練習に戻す。 */
  useClassPlan: () => void;
  /** クラスの全体練習メニュー（null＝指定なし）。 */
  classPlan: () => PracticePlan | null;
  /** 実際に行っているメニュー（個人指定 → 全体指定 の順で解決したもの）。 */
  effectivePlan: () => PracticePlan;
  /** 休養させる（次の練習を休む予約）。戻り値は積めた回数。 */
  onRest: () => number;
  /** 休養を取り消す（次の練習からすぐ戻る）。 */
  onCancelRest: () => void;
  /** あと何週休むか（0＝休養なし）。表示にだけ使う。 */
  restWeeksLeft?: (s: Student) => number;
  /** 選手カード（プロフィール）を開く。 */
  onOpenCard: () => void;
  /**
   * 今月の伸び（能力別の合計）。
   * 「設備を建てた」「コーチを替えた」の効果が数字で見えるようにするための表示。
   */
  monthGain?: () => Record<StatKey, number>;
  /** 特別練習の画面を開く（育成B以上のみ。undefined ならボタンを出さない）。 */
  onSpecialTraining?: () => void;
  /** 特別練習を今この選手に行えるか（理由つき。ボタンの活殺と説明に使う）。 */
  specialStatus?: () => { ok: boolean; reason?: string };
  /** 高地合宿の効果帯（下山からの日数）。効果が無ければ null。 */
  altitudeStatus?: (s: Student) => { days: number; label: string; note: string; good: boolean } | null;
  /**
   * 入寮／退寮を切り替える。寮を1つも建てていないときは undefined を渡す
   * （ボタン自体を出さない）。
   */
  onToggleDorm?: () => { ok: boolean; reason?: string };
  /**
   * 引退させる（プロだけ）。年齢で引退する前でも、プレイヤーの判断で送り出せる
   *（枠を空ける／若手に譲る）。押すと確認を挟む。
   */
  onRetire?: () => void;

  /**
   * クリニックで受診させる／リハビリをやめる（クリニックを建てているときだけ渡す）。
   * ケガをした選手を受診させると、治りが速くなるかわりに練習を休む。
   */
  onToggleRehab?: () => { ok: boolean; reason?: string };
  /** 受診の状態（ボタンの文言と説明に使う）。 */
  rehabStatus?: () => { inRehab: boolean; used: number; capacity: number };
}

const FIT_TEXT: Record<ClassFitStatus, { label: string; color: string }> = {
  tooLow: { label: "環境：ついていけていない", color: "#e74c3c" },
  good: { label: "環境：最適", color: "#2ecc71" },
  tooHigh: { label: "環境：物足りない（上へ）", color: "#f1c40f" },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一覧との行き来（下段のナビ）。 */
export interface PanelNav {
  /** 「◀ 名簿」。いま見ている選手のクラスの一覧へ戻る。 */
  onBack: () => void;
  /** 一覧の前後の選手へ。端にいるときは undefined（ボタンは押せなくなる）。 */
  onPrev?: () => void;
  onNext?: () => void;
  /** 「3 / 24人」のような位置表示。 */
  position?: string;
}

/**
 * 【スマホ縦画面のためのレイアウト】
 *
 * 以前は 720×772 の横長のパネルを 0.72 倍に縮めて表示していた。
 * 幅が画面（540）に入りきらないので縮むしかなく、13px の説明文が実質 9px になって
 * 読めない・重なる（「今月の伸び」と「休養」の行が重なる／特別練習ボタンが
 * 練習セクションの見出しに乗る）という状態だった。
 *
 * 作り直したここでは
 *   ・幅を **画面に入る 516** にして、縮小をやめる（＝指定した字の大きさで出る）
 *   ・中身は**1列**に積む（横に2列並べると1列あたり 230px しか取れない）
 *   ・入りきらないぶんは**縦にスクロール**する（詰めて小さくしない）
 *   ・上（名前）と下（前後の選手）は固定で、真ん中だけが動く
 * という作りにしてある。**新しい項目は縦に足していけばよい**。
 */
const PW = 516;
/** パネルの高さ。画面（960）に収まる範囲でいっぱいに使う。 */
const PH = 916;
/** 固定ヘッダ（顔・名前・×）の高さ。 */
const HEAD_H = 96;
/** 固定フッタ（◀前の選手／名簿／次の選手▶）の高さ。 */
const NAV_H = 78;
/** スクロールする窓の上端と高さ。 */
const VIEW_TOP = HEAD_H + 6;
const VIEW_H = PH - NAV_H - VIEW_TOP - 8;
/** 左右の余白と、右端の ▲▼ ボタンのぶん。 */
const PAD = 18;
const GUTTER = 30;
/** 中身を並べてよい幅。 */
const CW = PW - PAD * 2 - GUTTER;

/**
 * シーンがこのパネルを refresh する間隔（秒）。★ゲージを伸ばす刻みに使う。
 * FacilityScene.update の panelRefreshAccum と合わせてある。
 */
const PANEL_REFRESH_SEC = 0.35;

/** 1回のスワイプ／ホイールで動く量（px）。 */
const WHEEL_STEP = 56;
const ARROW_STEP = 150;

/**
 * 選手の詳細＋育成パネル（モーダル）。
 *
 * 練習は「事前選択方式」。基本はクラスの全体練習に従い、ここでメニューを選ぶと
 * その選手だけ個人指定になり、全体指定を上書きする（「全体にもどす」で戻せる）。
 * スクール生（幼児/学童）は選択不可＝全体練習のみ。
 *
 * 休養は即時回復ではなく「次の練習を休む」予約。休んだ時間ぶんだけ体力が戻る。
 *
 * 【閉じても捨てない】この画面は1回作ったら使い回す（show / hide）。
 * 中身は Text が60個以上あり、開くたびに作り直すと、そのたびに canvas を
 * 60枚作って GPU へ送ることになる。これが「開くのが遅い」の正体だった。
 * 別の選手を出すときは show() で中身だけ入れ替える。
 * **選手ごとに変わる表示は必ず applyStudent()／refresh() 側に書くこと**
 * （constructor に書くと、2人目以降で前の選手のままになる）。
 */
export class StudentPanel {
  private readonly container: Phaser.GameObjects.Container;
  /** スクロールする中身（このコンテナごと上下に動かす）。 */
  private readonly body: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  /** 中身の下地（区切り線・ゲージの溝）。1回描いたら変えない。 */
  private readonly bodyBg: Phaser.GameObjects.Graphics;
  /** 毎フレーム描き直すもの（ゲージの中身）。 */
  private readonly dyn: Phaser.GameObjects.Graphics;

  /** いちばん強い能力と、いちばん伸びる能力のまとめ。 */
  private statSummary!: Phaser.GameObjects.Text;
  /** 才能ランク（E〜SS）＝その能力の伸びる速さ。 */
  private readonly talentChip: Partial<Record<StatKey, Phaser.GameObjects.Text>> = {};
  private energyGeom!: Rect;

  private readonly abilityBtn: Partial<Record<StatKey, Button>> = {};
  private readonly strokeBtn: Partial<Record<Stroke, Button>> = {};
  private classPlanBtn?: Button;
  private specialBtn?: Button;
  private specialNote?: Phaser.GameObjects.Text;
  private cancelRestBtn?: Button;
  /** 指示のボタンを置ける場所（3列×2行）と、置くボタン（左から詰める）。 */
  private actionSlots: { x: number; y: number }[] = [];
  private actionBtns: Button[] = [];
  /**
   * スクロールできる長さ。スクール生は練習の操作が出ないぶん中身が短いので、
   * クラスによって切り替える（同じにすると、下に何も無いところまでスクロールできる）。
   */
  private contentSchoolH = 0;
  private contentTrainH = 0;

  /** 体力（大きく出す欄）。 */
  private energyText!: Phaser.GameObjects.Text;
  private energyLevelText!: Phaser.GameObjects.Text;
  private energyNote!: Phaser.GameObjects.Text;

  private warnText!: Phaser.GameObjects.Text;
  /** 得意種目（才能の右）。 */
  private favEventText!: Phaser.GameObjects.Text;
  /** 自己ベストのタイムと、その種目。 */
  private bestTimeText!: Phaser.GameObjects.Text;
  private bestEventText!: Phaser.GameObjects.Text;
  private conditionText!: Phaser.GameObjects.Text;
  /** 満足度（機嫌）の言い回しと★ゲージ。 */
  private moodText!: Phaser.GameObjects.Text;
  private moodStars!: StarMeter;
  /** ケガ・高地合宿の後遺（無いときは空文字）。 */
  private statusText!: Phaser.GameObjects.Text;
  private growthHintText!: Phaser.GameObjects.Text;
  /** 幼少期フォームからの将来性のヒント／入寮の状態。 */
  private youthText!: Phaser.GameObjects.Text;
  private coachText!: Phaser.GameObjects.Text;
  /** 受診（クリニックがあるときだけ出る）。 */
  private rehabBtn!: Button;
  private fitText!: Phaser.GameObjects.Text;
  private planText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private restText!: Phaser.GameObjects.Text;
  private growthText!: Phaser.GameObjects.Text;
  private dormBtn!: Button;
  /** 引退させる（プロだけ出る）。 */
  private retireBtn!: Button;

  // 選手ごとに書き換えるもの（使い回すので参照を持っておく）
  private face!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;

  // 下段のナビ
  private prevBtn!: Button;
  private nextBtn!: Button;
  private posText!: Phaser.GameObjects.Text;
  private nav: PanelNav = { onBack: () => {} };

  /** 練習セクション：スクール生用の案内と、育成クラス用の操作を出し分ける。 */
  private schoolParts: Phaser.GameObjects.Components.Visible[] = [];
  private trainParts: Phaser.GameObjects.Components.Visible[] = [];

  private student!: Student;
  private env!: PanelEnv;
  private isSchool = false;
  private open = false;
  /** 休養・入寮などの操作に対する一言（監督の欄に出す）。選手を変えると消える。 */
  private notice: { text: string; color: string } | null = null;

  // ---- スクロール ----
  private contentH = 0;
  private scrollY = 0;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly wheelHandler: (p: unknown, o: unknown, dx: number, dy: number) => void;
  private readonly downHandler: (p: Phaser.Input.Pointer) => void;
  private readonly moveHandler: (p: Phaser.Input.Pointer) => void;
  private readonly upHandler: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onClose: () => void,
  ) {
    // 【重なりの順番】暗幕はパネルより必ず**下**に置くこと。
    // 以前は暗幕 2440 ／ パネル 2401 になっていて、暗幕がパネルの上に乗っていた。
    // そのため名簿から開くと画面全体が暗く沈み、昇格・降格・カードのボタンを
    // 押しても暗幕が指を受け取ってしまい、押せずにパネルが閉じるだけだった。
    // 名簿（2440/2441）より手前に出したいので、この画面は 2450/2451 を使う。
    this.backdrop = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5)
      .setInteractive()
      .setDepth(2450);
    closeOnBackdropTap(this.backdrop, () => this.onClose());

    this.container = scene.add.container(0, 0).setDepth(2451);

    const box = scene.add.graphics();
    box.fillStyle(0x14263a, 1);
    box.fillRoundedRect(0, 0, PW, PH, 12);
    box.lineStyle(3, 0x2e4a66, 1);
    box.strokeRoundedRect(0, 0, PW, PH, 12);
    box.lineStyle(2, 0x2e4a66, 1);
    box.lineBetween(12, HEAD_H, PW - 12, HEAD_H); // ヘッダの下
    box.lineBetween(12, PH - NAV_H, PW - 12, PH - NAV_H); // ナビの上
    this.container.add(box);

    // パネル全体を覆う受け止め用のゾーンは置かない
    //（コンテナの子どうしは優先順位が付かず、中のボタンより先にタップを取ってしまう。
    //   暗幕の側でパネルの内側を判定から外してある → excludePanelFromBackdrop）

    // 中身（スクロールする層）。下地 → 動くゲージ → 文字 の順に重ねる。
    this.body = scene.add.container(0, 0);
    this.container.add(this.body);
    this.bodyBg = scene.add.graphics();
    this.body.add(this.bodyBg);
    this.dyn = scene.add.graphics();
    this.body.add(this.dyn);

    this.buildHeader();
    // 上から順に積む。各 build は「使った高さ」を返し、次の段の開始位置になる。
    let y = VIEW_TOP + 10;
    y = this.buildEnergy(y);
    y = this.buildCondition(y);
    y = this.buildStats(y);
    y = this.buildStatus(y);
    y = this.buildActions(y);
    y = this.buildPractice(y);
    this.contentH = this.contentTrainH;
    void y;
    this.buildNav();

    // 溝（ゲージの下地）は中身を積み終わってから描く（位置が確定してから）。
    // 能力のバーはやめたので、残っているのは体力のゲージだけ。
    const eg = this.energyGeom;
    this.bodyBg.fillStyle(0x000000, 0.4);
    this.bodyBg.fillRoundedRect(eg.x, eg.y, eg.w, eg.h, eg.h / 2);

    // 文字はゲージより手前へ（ゲージが伸びても数字が隠れない）
    this.body.bringToTop(this.dyn);
    this.body.bringToTop(this.energyText);
    this.body.bringToTop(this.energyLevelText);

    // 画面に対しては原寸のまま置く（縮小しない＝指定した字の大きさで出る）
    const scale = Math.min(1, (GAME_WIDTH - 12) / PW, (GAME_HEIGHT - 24) / PH);
    this.container.setScale(scale);
    this.container.setPosition((GAME_WIDTH - PW * scale) / 2, (GAME_HEIGHT - PH * scale) / 2);

    // 暗幕にパネルの中を触らせない（→ ui/Button.ts の excludePanelFromBackdrop）
    excludePanelFromBackdrop(this.backdrop, () => ({
      x: this.container.x,
      y: this.container.y,
      w: PW * this.container.scaleX,
      h: PH * this.container.scaleY,
    }));

    // 窓の外へはみ出した中身を隠す（マスクは画面座標で作る）
    const mg = scene.make.graphics({ x: 0, y: 0 }, false);
    mg.fillStyle(0xffffff, 1);
    mg.fillRect(this.container.x, this.container.y + VIEW_TOP * scale, PW * scale, VIEW_H * scale);
    this.body.setMask(mg.createGeometryMask());
    this.maskGraphics = mg;

    // ---- スクロールの操作（ホイール・スワイプ・▲▼）
    this.wheelHandler = (_p, _o, _dx, dy): void => {
      if (!this.open) return;
      this.scrollBy(dy > 0 ? WHEEL_STEP : -WHEEL_STEP);
    };
    scene.input.on("wheel", this.wheelHandler);

    // スワイプは「窓の中ならどこを掴んでも」効く。行やボタンの上にゾーンを重ねると
    // 押せなくなるので、シーンの入力を直接見て「指が窓の中にあるか」で判断する。
    // ボタン側が「押した場所から大きくずれて離したら反応しない」ようにしているので、
    // ボタンの上からなぞってもスクロールになる（→ ui/Button.ts）。
    let last = 0;
    let active = false;
    this.downHandler = (ptr: Phaser.Input.Pointer): void => {
      const p = logicalPoint(ptr); // 指の座標は canvas の画素で届く（→ gfx/renderScale.ts）
      if (!this.open || !this.insideView(p.x, p.y)) return;
      active = true;
      last = p.y;
    };
    this.moveHandler = (ptr: Phaser.Input.Pointer): void => {
      if (!active || !ptr.isDown || !this.open) return;
      const p = logicalPoint(ptr);
      this.scrollBy((last - p.y) / Math.max(0.2, this.container.scaleY));
      last = p.y;
    };
    this.upHandler = (): void => {
      active = false;
    };
    scene.input.on("pointerdown", this.downHandler);
    scene.input.on("pointermove", this.moveHandler);
    scene.input.on("pointerup", this.upHandler);

    // ▲▼（確実に動かしたいとき用）。窓の右端に固定で置く＝中身と一緒には動かさない。
    this.addButton(PW - 20, VIEW_TOP + 20, 26, 34, "▲", () => this.scrollBy(-ARROW_STEP), {
      color: 0x2c3e50,
      fontSize: 13,
    });
    this.addButton(PW - 20, VIEW_TOP + VIEW_H - 20, 26, 34, "▼", () => this.scrollBy(ARROW_STEP), {
      color: 0x2c3e50,
      fontSize: 13,
    });

    flushInput(scene); // 開いた直後の1タップを捨てない（→ inputReady.ts）
    this.setShown(false); // 作るだけ作って、開かれるまでは隠しておく
  }

  isOpen(): boolean {
    return this.open;
  }

  /** この選手を出す（すでに開いていれば中身だけ差し替える）。 */
  show(student: Student, env: PanelEnv, nav: PanelNav): void {
    this.student = student;
    this.env = env;
    this.nav = nav;
    this.isSchool = isSchoolClass(student.classId);
    this.scrollTo(0); // 別の選手を出すときは先頭（体力）から見せる
    this.applyStudent();
    this.setShown(true);
    this.refresh();
    flushInput(this.scene);
  }

  hide(): void {
    this.setShown(false);
  }

  /**
   * 表示・非表示。Phaser は「見えていないもの」を当たり判定から外すので、
   * 隠せばボタンも押せなくなる（別途で無効にする必要はない）。
   */
  private setShown(v: boolean): void {
    this.open = v;
    this.backdrop.setVisible(v);
    this.container.setVisible(v);
  }

  destroy(): void {
    // スクロール用にシーンへ登録したものを必ず片付ける（閉じたあとに動かない）
    this.scene.input.off("wheel", this.wheelHandler);
    this.scene.input.off("pointerdown", this.downHandler);
    this.scene.input.off("pointermove", this.moveHandler);
    this.scene.input.off("pointerup", this.upHandler);
    this.body.clearMask(true);
    this.maskGraphics.destroy();
    this.backdrop.destroy();
    this.container.destroy();
  }

  // ------------------------------------------------------------- スクロール

  /** その画面座標がスクロールの窓の中か（スワイプを受け付ける範囲）。 */
  private insideView(sx: number, sy: number): boolean {
    const s = this.container.scaleY || 1;
    const localX = (sx - this.container.x) / (this.container.scaleX || 1);
    const localY = (sy - this.container.y) / s;
    return localX >= 0 && localX <= PW && localY >= VIEW_TOP && localY <= VIEW_TOP + VIEW_H;
  }

  /** 上下にスクロールする（▲▼・ホイール・スワイプ、開発の見た目確認から呼ぶ）。 */
  scrollBy(dy: number): void {
    this.scrollTo(this.scrollY + dy);
  }

  private scrollTo(y: number): void {
    const max = Math.max(0, this.contentH - VIEW_H);
    this.scrollY = Math.min(max, Math.max(0, y));
    this.body.y = -this.scrollY;
  }

  /** 選手が変わったときにだけ書き換わるところ（顔・名前・所属・練習セクションの出し分け）。 */
  private applyStudent(): void {
    const s = this.student;
    // 別の選手を出すときは★を0に戻す（前の子の値から動くと、伸びたように見えてしまう）
    this.moodStars.setValue(0, true);
    const cls = CLASS_ORDER.find((c) => c.id === s.classId)?.label ?? "";
    this.notice = null; // 前の選手に出した一言は持ち越さない

    this.face.setTexture(ensurePortrait(this.scene, s));
    this.nameText.setText(s.name);
    this.subText.setText(`${s.grade}・${GENDER_LABEL[s.gender]}　${cls}　得意 ${STROKE_LABEL[s.fav.stroke]}${s.fav.distance}m`);

    // スクール生は練習を選べない。案内と操作を入れ替える。
    for (const o of this.schoolParts) o.setVisible(this.isSchool);
    for (const o of this.trainParts) o.setVisible(!this.isSchool);

    // 寮を建てていないときは入寮ボタン自体を出さない
    this.dormBtn.setVisible(!!this.env.onToggleDorm);
    this.retireBtn.setVisible(!!this.env.onRetire);

    // 受診はクリニックを建てているときだけ。ケガをしていない子には出さない。
    const rehab = this.env.rehabStatus?.();
    const showRehab = !!this.env.onToggleRehab && !!rehab && (s.injuryDays > 0 || rehab.inRehab);
    this.rehabBtn.setVisible(showRehab);
    if (showRehab && rehab) {
      this.rehabBtn.setLabel(rehab.inRehab ? "リハビリ中止" : `受診させる（${rehab.used}/${rehab.capacity}）`);
    }

    // 特別練習は育成B以上だけ。押せないときは理由をボタンの下に出す。
    const showSpecial = !!this.env.onSpecialTraining && !this.isSchool;
    this.specialBtn?.setVisible(showSpecial);
    this.specialNote?.setVisible(showSpecial);
    if (showSpecial) {
      const st = this.env.specialStatus?.() ?? { ok: true };
      this.specialBtn?.setEnabled(st.ok);
      this.specialNote?.setText(st.ok ? "特別練習：今月はまだ受けられる" : `特別練習：${st.reason ?? ""}`);
      this.specialNote?.setColor(st.ok ? "#7fd1ae" : "#e59866");
    }

    // 出るボタンだけを左から詰め直す（穴が空いたまま並ばないように）
    this.layoutActions();
    // 中身の長さもクラスに合わせる（スクール生は練習の操作が無いぶん短い）
    this.contentH = this.isSchool ? this.contentSchoolH : this.contentTrainH;
    this.scrollTo(this.scrollY);

    // ナビ（前後の選手・一覧へもどる）
    this.prevBtn.setEnabled(!!this.nav.onPrev);
    this.nextBtn.setEnabled(!!this.nav.onNext);
    this.posText.setText(this.nav.position ?? "");
  }

  /**
   * 指示のボタンを詰め直す。
   * 寮を建てていない・ケガをしていない・スクール生（特別練習なし）と、
   * 出ないボタンがあるので、**出るものだけ**を左上から順に置く。
   */
  private layoutActions(): void {
    let i = 0;
    for (const btn of this.actionBtns) {
      if (!btn.visible) continue;
      const slot = this.actionSlots[i++];
      if (slot) btn.setPosition(slot.x, slot.y);
    }
  }

  // ------------------------------------------------------------- 構築

  /** 中身（スクロールする層）に文字を置く。 */
  private text(x: number, y: number, s: string, size: number, color: string, bold = false): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, {
      fontFamily: "sans-serif",
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? "bold" : "normal",
    });
    this.body.add(t);
    return t;
  }

  /** 動かない層（ヘッダ・ナビ・▲▼）に文字を置く。 */
  private fixedText(
    x: number,
    y: number,
    s: string,
    size: number,
    color: string,
    bold = false,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, {
      fontFamily: "sans-serif",
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? "bold" : "normal",
    });
    this.container.add(t);
    return t;
  }

  /** 見出し（各段の頭）。区切り線も一緒に引く。 */
  private sectionTitle(y: number, label: string): number {
    this.bodyBg.lineStyle(2, 0x223b52, 1);
    this.bodyBg.lineBetween(PAD, y - 8, PW - PAD, y - 8);
    this.text(PAD, y, label, 15, "#8fa3b5", true);
    return y + 24;
  }

  /** 中身（スクロールする層）のボタン。 */
  private bodyButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fn: () => void,
    opts: ButtonOptions = {},
  ): Button {
    const btn = new Button(this.scene, x, y, w, h, label, fn, opts);
    this.body.add(btn);
    return btn;
  }

  /** 動かない層のボタン。 */
  private addButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fn: () => void,
    opts: ButtonOptions = {},
  ): Button {
    const btn = new Button(this.scene, x, y, w, h, label, fn, opts);
    this.container.add(btn);
    return btn;
  }

  private buildHeader(): void {
    // 顔（選手ごとに固定。年齢で見た目が変わる）。押すと選手カードが開く。
    const frame = this.scene.add
      .rectangle(PAD + 30, 12 + 30, 64, 64, 0x0d1c2b, 1)
      .setStrokeStyle(2, 0x2e4a66, 1);
    this.container.add(frame);
    this.face = this.scene.add
      .image(PAD + 30, 12 + 30, "__DEFAULT")
      .setScale(60 / PORTRAIT_SIZE)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        this.env.onOpenCard();
      });
    this.container.add(this.face);

    // 名前は × の左まで。× は「閉じたいのに閉じられない」がいちばん効くので大きめ。
    const nx = PAD + 74;
    this.nameText = this.fixedText(nx, 10, "", 24, "#f7dc6f", true).setWordWrapWidth(PW - nx - 70);
    this.subText = this.fixedText(nx, 42, "", 14, "#cfd8e0");
    setJaWrap(this.subText, PW - nx - 16);
    this.rankText = this.fixedText(nx, 66, "", 15, "#b9c6d1", true);

    this.addButton(PW - 34, 30, 52, 46, "×", () => this.onClose(), {
      color: 0x7f2f2f,
      hoverColor: 0xa8443a,
      fontSize: 26,
      hitPadding: 10,
    });
  }

  /**
   * 【体力（スタミナ）】いちばん上に、いちばん大きく置く。
   *
   * 「あと何回練習できるか」は休養・回復設備・寮のすべてに関わるのに、
   * 以前は能力値の下に 14px のゲージが1本あるだけで、数字も小さかった。
   * 太いゲージ＋大きい「45/88」＋状態の言葉（絶好調〜もう限界）にして、
   * 頭上の疲れマークと同じさかいめで色が変わるようにしてある（→ sim/stamina.ts）。
   */
  private buildEnergy(y0: number): number {
    let y = this.sectionTitle(y0, "体力（スタミナ）");
    const barW = CW - 122;
    this.energyGeom = { x: PAD, y, w: barW, h: 26 };
    this.energyText = this.text(PAD + barW + 12, y - 5, "0/0", 25, "#f1c40f", true);
    y += 34;
    this.energyLevelText = this.text(PAD, y, "", 19, "#2ecc71", true);
    y += 26;
    this.energyNote = this.text(PAD, y, "", 13, "#9fb3c4");
    setJaWrap(this.energyNote, CW);
    y += 22;
    this.warnText = this.text(PAD, y, "⚠ フォーム不足でスピードが活きていない", 13, "#e67e22");
    this.warnText.setVisible(false);
    return y + 26;
  }

  /** コンディションと機嫌（体力とは別もの）。1行に並べる。 */
  private buildCondition(y0: number): number {
    let y = this.sectionTitle(y0, "調子");
    this.text(PAD, y, "コンディション", 13, "#8fa3b5");
    this.conditionText = this.text(PAD + 110, y - 3, "-", 17, "#ecf0f1", true);
    y += 26;
    // 【満足度（機嫌）】体調とは別もの。良い設備を使えた・伸びた・休めたで上がり、
    // 混雑で待たされた・疲れきった・ケガで下がる（→ sim/satisfaction.ts）。
    this.text(PAD, y, "機嫌", 13, "#8fa3b5");
    this.moodText = this.text(PAD + 110, y - 1, "", 14, "#cfd8e0");
    this.moodStars = new StarMeter(this.scene, PAD + 200, y + 7, { radius: 5, align: "left" });
    this.body.add(this.moodStars.graphics);
    y += 24;
    this.fitText = this.text(PAD, y, "", 13.5, "#cfd8e0");
    setJaWrap(this.fitText, CW);
    return y + 28;
  }

  /**
   * 能力値。
   * 列は「名前 → バー → 数値 → 才能」の順。1列に伸ばしたので、以前より
   * バーも数字も大きい。
   */
  private buildStats(y0: number): number {
    const y = this.sectionTitle(y0, "才能（練習メニューを選ぶ目安）");

    // 【ここは操作の画面】能力のレーダー・成績・格は**選手カード**が持っている。
    // 同じものを2つの画面に置くと、どちらを見ればいいのか分からなくなるので、
    // このパネルには「どの練習を入れるか」を決めるのに要るものだけを残す。
    // ＝ 才能ランク（どの能力が速く伸びるか）を1行にまとめて出す。
    const step = 26;
    STAT_KEYS.forEach((key, i) => {
      const cy = y + 6 + i * step;
      this.text(PAD, cy, STAT_LABEL[key], 15, "#ecf0f1");
      this.text(PAD + 96, cy + 1, "才能", 12, "#95a6b8");
      this.talentChip[key] = this.text(PAD + 130, cy - 4, "", 20, "#8a99a6", true);
    });

    // 右側に得意種目と自己ベスト（練習メニューを決めるときに見たい2つ）
    const bx = PAD + 196;
    this.text(bx, y + 2, "得意種目", 12, "#95a6b8");
    this.favEventText = this.text(bx, y + 18, "-", 15, "#aed6f1", true);
    setJaWrap(this.favEventText, CW - 196);
    this.text(bx, y + 48, "自己ベスト", 12, "#95a6b8");
    this.bestTimeText = this.text(bx, y + 62, "-", 26, "#f7dc6f", true);
    this.bestEventText = this.text(bx, y + 96, "", 12, "#9fb3c4");
    setJaWrap(this.bestEventText, CW - 196);

    // いちばん強い能力と、いちばん伸びる能力のまとめ（refresh で入れ直す）
    const sy = y + 6 + STAT_KEYS.length * step + 6;
    this.statSummary = this.text(PAD, sy, "", 12.5, "#cfd8e0");
    setJaWrap(this.statSummary, CW);
    const hint = this.text(PAD, sy + 20, "能力のレーダー・成績・格は「カードに戻る」で見られる", 12, "#95a6b8");
    setJaWrap(hint, CW);
    return sy + 44;
  }

  /** 状態（成長タイプ・今月の伸び・ケガ・将来性・監督）。 */
  private buildStatus(y0: number): number {
    let y = this.sectionTitle(y0, "状態");
    // 成長タイプ（もとは「予想記録」の節にあったもの。節ごとやめたのでここへ）
    this.text(PAD, y, "成長タイプ（推測）", 13, "#8fa3b5");
    this.growthHintText = this.text(PAD + 130, y, "-", 13.5, "#cfd8e0");
    setJaWrap(this.growthHintText, CW - 130);
    y += 26;
    // 今月どれだけ伸びたか（投資の手ごたえ）
    this.growthText = this.text(PAD, y, "", 13.5, "#7fd1ae");
    setJaWrap(this.growthText, CW);
    y += 24;
    // ケガ・高地合宿の後遺（あるときだけ出る）
    this.statusText = this.text(PAD, y, "", 13, "#e67e22", true);
    setJaWrap(this.statusText, CW);
    y += 22;
    // 幼少期の将来性（コーチが見抜けたときだけ）と、入寮の状態
    this.youthText = this.text(PAD, y, "", 13, "#f7dc6f", true);
    setJaWrap(this.youthText, CW);
    y += 22;
    // 監督の欄。休養などの操作に対する一言もここに出る。
    this.coachText = this.text(PAD, y, "", 13.5, "#aed6f1");
    setJaWrap(this.coachText, CW);
    return y + 40;
  }

  /**
   * 操作（休養・入寮・受診・特別練習）。
   *
   * 休養は即時回復ではなく「次の練習を休む」予約。
   * 連打しても上限までしか積めない（＝連打では回復しない）。
   */
  private buildActions(y0: number): number {
    let y = this.sectionTitle(y0, "この選手への指示");
    this.restText = this.text(PAD, y, "", 13, "#a9bbc9");
    setJaWrap(this.restText, CW);
    y += 30;

    // 指示のボタンは 3列×2行。**出ないボタンがある**（寮を建てていない・ケガをしていない・
    // スクール生）ので、位置は固定にせず、出るものだけを左から詰め直す（→ layoutActions）。
    const bw = 140;
    const bh = 42;
    const cx = [PAD + bw / 2, PAD + bw / 2 + bw + 12, PAD + bw / 2 + (bw + 12) * 2];
    this.actionSlots = [
      { x: cx[0], y: y + bh / 2 },
      { x: cx[1], y: y + bh / 2 },
      { x: cx[2], y: y + bh / 2 },
      { x: cx[0], y: y + bh + 10 + bh / 2 },
      { x: cx[1], y: y + bh + 10 + bh / 2 },
      { x: cx[2], y: y + bh + 10 + bh / 2 },
    ];
    const rest = this.bodyButton(cx[0], y + bh / 2, bw, bh, "休養させる", () => this.onRest(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 15,
    });
    this.cancelRestBtn = this.bodyButton(cx[1], y + bh / 2, bw, bh, "休養取消", () => this.onCancelRest(), {
      color: 0x5a3a3a,
      hoverColor: 0x7f4a4a,
      fontSize: 15,
    });
    this.dormBtn = this.bodyButton(cx[2], y + bh / 2, bw, bh, "入寮させる", () => this.onToggleDorm(), {
      color: 0x39597e,
      hoverColor: 0x4a6f9c,
      fontSize: 15,
    });
    this.rehabBtn = this.bodyButton(cx[0], y + bh + 10 + bh / 2, bw, bh, "受診させる", () => this.onToggleRehab(), {
      color: 0x8e44ad,
      hoverColor: 0xa569bd,
      fontSize: 14,
    });
    this.specialBtn = this.bodyButton(
      cx[1],
      y + bh + 10 + bh / 2,
      bw,
      bh,
      "特別練習",
      () => this.env.onSpecialTraining?.(),
      { color: 0xb9770e, hoverColor: 0xd68910, fontSize: 15 },
    );
    const card = this.bodyButton(cx[2], y + bh + 10 + bh / 2, bw, bh, "◀ カードに戻る", () => this.env.onOpenCard(), {
      color: 0x6b4f8f,
      hoverColor: 0x8a68b5,
      fontSize: 14,
    });
    // 引退（プロだけ）。押し間違えると取り返しがつかないので、赤くして最後に置く
    this.retireBtn = this.bodyButton(cx[0], y + bh + 10 + bh / 2, bw, bh, "引退させる", () => this.env.onRetire?.(), {
      color: 0x7f2f2f,
      hoverColor: 0xa8443a,
      fontSize: 14,
    });
    // ここはパネルを組み立てているところ。env はまだ入っていないので、
    // 出す・出さないの判断は applyStudent（選手が決まったあと）でやる
    this.retireBtn.setVisible(false);
    // 並べる順（左上から詰める）
    this.actionBtns = [rest, this.cancelRestBtn, this.dormBtn, this.rehabBtn, this.specialBtn, card, this.retireBtn];
    y += bh * 2 + 10 + 8;

    this.specialNote = this.text(PAD, y, "", 12.5, "#e59866");
    setJaWrap(this.specialNote, CW);
    y += 24;

    // 昇格・降格はクラスを変える操作なので、ほかの指示から少し離して置く
    this.bodyButton(PAD + 100, y + 21, 200, 42, "▲ 昇格（クラスを選ぶ）", () => this.env.onPromote(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 15,
    });
    this.bodyButton(PAD + 320, y + 21, 160, 42, "▼ 降格", () => this.env.onDemote(), {
      color: 0x3d5a80,
      hoverColor: 0x4f74a6,
      fontSize: 15,
    });
    return y + 42 + 22;
  }

  /**
   * 練習セクション。スクール生（案内だけ）と育成クラス（操作あり）の
   * 両方をここで作っておき、applyStudent で出し分ける。
   * 選手ごとに作り直すと、切り替えのたびに固まる。
   *
   * **いちばん下に置くこと。** 出し分けで高さが変わるので、上に置くと
   * 下の段の位置がクラスによってずれる。
   */
  private buildPractice(y0: number): number {
    const top = this.sectionTitle(y0, "練習");

    // ---- スクール生向け（練習は選べない）
    const schoolNote = this.text(
      PAD,
      top + 4,
      "スクール生は全体練習のみ（練習指定はできません）。\n全能力が均等・低速に上がります。育成Bへ昇格させると練習を選べます。",
      15,
      "#cfd8e0",
    );
    setJaWrap(schoolNote, CW);
    this.schoolParts = [schoolNote];
    const schoolBottom = top + 4 + schoolNote.height + 8;

    // ---- 育成クラス向け
    const parts: Phaser.GameObjects.Components.Visible[] = [];
    const head = this.text(
      PAD,
      top + 2,
      "クラスの全体練習が基本。ここで選ぶとこの子だけ個人指定になります。",
      13,
      "#9fb3c4",
    );
    setJaWrap(head, CW);
    parts.push(head);

    this.planText = this.text(PAD, top + 24, "", 14, "#f7dc6f");
    setJaWrap(this.planText, CW);
    parts.push(this.planText);

    this.classPlanBtn = this.bodyButton(
      PAD + 90,
      top + 76,
      180,
      36,
      "全体練習にもどす",
      () => this.onUseClassPlan(),
      { color: 0x39597e, hoverColor: 0x4a6f9c, fontSize: 14 },
    );
    parts.push(this.classPlanBtn);

    // 系統A：能力練習（5つ）。幅 CW を5等分すると押しにくいので、3つ＋2つに折る。
    let y = top + 106;
    parts.push(this.text(PAD, y, "系統A　能力練習", 13.5, "#9fb3c4", true));
    y += 22;
    const bw = 148;
    const gap = 8;
    TRAINABLE_KEYS.forEach((key, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = PAD + bw / 2 + col * (bw + gap);
      this.abilityBtn[key] = this.bodyButton(x, y + 21 + row * 50, bw, 42, STAT_LABEL[key], () => this.pickAbility(key), {
        color: 0x2c3e50,
        hoverColor: 0x3d5a80,
        selectedColor: 0xc0392b,
        fontSize: 16,
      });
      parts.push(this.abilityBtn[key]!);
    });
    y += 50 * Math.ceil(TRAINABLE_KEYS.length / 3) + 8;

    // 系統B：泳法専門（5つ）
    parts.push(this.text(PAD, y, "系統B　専門（泳法）練習", 13.5, "#9fb3c4", true));
    y += 22;
    STROKE_KEYS.forEach((stroke, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = PAD + bw / 2 + col * (bw + gap);
      this.strokeBtn[stroke] = this.bodyButton(
        x,
        y + 21 + row * 50,
        bw,
        42,
        STROKE_LABEL[stroke],
        () => this.pickStroke(stroke),
        { color: 0x2c3e50, hoverColor: 0x3d5a80, selectedColor: 0x2e7d5b, fontSize: 15 },
      );
      parts.push(this.strokeBtn[stroke]!);
    });
    y += 50 * Math.ceil(STROKE_KEYS.length / 3);
    this.trainParts = parts;
    this.contentSchoolH = schoolBottom - VIEW_TOP + 12;
    this.contentTrainH = y + 8 - VIEW_TOP + 12;
    return y + 8;
  }

  /**
   * 下段のナビ。名簿から来たときはもちろん、プールで選手をタップして開いたときも
   * 「◀ 名簿」でその子のクラスの一覧へ行ける。
   * ◀▶ は一覧の並び順で前後の選手へ移る（いちいち閉じて開き直さなくていい）。
   */
  private buildNav(): void {
    const top = PH - NAV_H;
    this.posText = this.fixedText(PW / 2, top + 6, "", 13.5, "#a9bbc9", true).setOrigin(0.5, 0);

    const y = top + 48;
    this.prevBtn = this.addButton(PAD + 68, y, 136, 46, "◀ 前の選手", () => this.nav.onPrev?.(), {
      color: 0x39597e,
      hoverColor: 0x4a6f9c,
      fontSize: 14,
    });
    this.addButton(PW / 2, y, 150, 46, "◀ 名簿", () => this.nav.onBack(), {
      color: 0x8e6a2f,
      hoverColor: 0xb8893c,
      fontSize: 16,
    });
    this.nextBtn = this.addButton(PW - PAD - 68, y, 136, 46, "次の選手 ▶", () => this.nav.onNext?.(), {
      color: 0x39597e,
      hoverColor: 0x4a6f9c,
      fontSize: 14,
    });
  }

  // ------------------------------------------------------------- 動作

  private pickAbility(key: StatKey): void {
    this.env.setPlan({ ability: key });
    this.refresh();
    this.env.onPlanChanged?.();
  }

  private pickStroke(stroke: Stroke): void {
    this.env.setPlan({ stroke });
    this.refresh();
    this.env.onPlanChanged?.();
  }

  private onUseClassPlan(): void {
    this.env.useClassPlan();
    this.refresh();
    this.env.onPlanChanged?.();
  }

  private onRest(): void {
    const added = this.env.onRest();
    this.notice =
      added > 0
        ? { text: `${this.env.coach?.name ?? "コーチ"}「次の練習は休ませよう。休むのも練習のうちだ」`, color: "#aed6f1" }
        : { text: "これ以上は休ませられない（休みすぎは成長を止める）", color: "#e67e22" };
    this.refresh();
  }

  private onCancelRest(): void {
    this.env.onCancelRest();
    this.notice = { text: "休養の予定を取り消した", color: "#aed6f1" };
    this.refresh();
  }

  /** 受診（リハビリ）を切り替える。入れないときは理由を出す。 */
  private onToggleRehab(): void {
    const r = this.env.onToggleRehab?.();
    if (r && !r.ok) this.notice = { text: r.reason ?? "受診できない", color: "#e67e22" };
    this.refresh();
  }

  /** 入寮・退寮を切り替える。理由があって入れないときはコーチの一言で伝える。 */
  private onToggleDorm(): void {
    const r = this.env.onToggleDorm?.();
    if (r && !r.ok) this.notice = { text: r.reason ?? "寮に入れない", color: "#e67e22" };
    this.refresh();
  }

  // ------------------------------------------------------------- 描画更新

  refresh(): void {
    if (!this.student) return;
    const s = this.student;
    this.dyn.clear();

    // ---- 体力（この画面のいちばん上・いちばん大きい欄）
    const st = staminaOf(s);
    const eg = this.energyGeom;
    this.dyn.fillStyle(STAMINA_BAR[st.level], 1);
    this.dyn.fillRoundedRect(eg.x, eg.y, Math.max(eg.h, eg.w * st.ratio), eg.h, eg.h / 2);
    this.energyText.setText(`${Math.round(st.value)}/${Math.round(st.max)}`).setColor(STAMINA_COLOR[st.level]);
    this.energyLevelText
      .setText(`${STAMINA_ICON[st.level]} ${STAMINA_LABEL[st.level]}　（${Math.round(st.ratio * 100)}%）`)
      .setColor(STAMINA_COLOR[st.level]);
    this.energyNote.setText(STAMINA_NOTE[st.level]);
    this.warnText.setVisible(formMultiplier(s) < 0.5);

    // ---- 監督の欄。操作への一言（休養など）が出ているあいだはそちらを優先する。
    if (this.notice) {
      this.coachText.setText(this.notice.text).setColor(this.notice.color);
    } else {
      const coach = this.env.coach;
      this.coachText
        .setText(
          coach
            ? `監督 ${coach.name}（${coachGradeLabel(coach.quality)}・${coachSpecialtyLabel(coach)}${
                coachMatchesStudent(coach, s) ? "✓" : ""
              }）`
            : "", // 監督がいないときは何も出さない（「未配置」の表示は 2026-09-27 に廃止）
        )
        .setColor("#aed6f1");
    }

    for (const key of STAT_KEYS) {
      // 才能ランク（＝その能力の伸びる速さ）。隠さず最初から出す
      const t = talentRankOf(s, key);
      this.talentChip[key]!.setText(t).setColor(TALENT_COLOR[t]);
    }

    // いちばん強い能力（いまの姿）と、いちばん伸びる能力（これからの姿）
    {
      const best = STAT_KEYS.reduce((a, b) => (s.stats[a] >= s.stats[b] ? a : b));
      // 才能ランクがいちばん高い能力＝これから伸ばすと得な能力
      const grow = STAT_KEYS.reduce((a, b) =>
        TALENT_ORDER.indexOf(talentRankOf(s, a)) >= TALENT_ORDER.indexOf(talentRankOf(s, b)) ? a : b,
      );
      this.statSummary.setText(
        `いちばん強い ${STAT_LABEL[best]}　／　いちばん伸びる ${STAT_LABEL[grow]}（才能${talentRankOf(s, grow)}）`,
      );
    }

    // 格（成績で決まる8段階）
    const tier = rankOf(s);
    this.rankText.setText(`格 ${tier}／8　${rankLabel(tier)}`).setColor(rankColor(tier));

    const level = conditionLevel(s.condition);
    this.conditionText.setText(`${CONDITION_ICON[level]} ${CONDITION_LABEL[level]}`).setColor(CONDITION_COLOR[level]);

    // 機嫌。refresh はシーンが 0.35 秒ごとに呼ぶので、その刻みでゲージがじわじわ伸びる。
    this.moodText.setText(moodLabel(s.mood)).setColor(`#${moodColor(s.mood).toString(16).padStart(6, "0")}`);
    this.moodStars.setValue(s.mood);
    this.moodStars.update(PANEL_REFRESH_SEC);

    // ケガと高地の効果帯（どちらもタイムに直接効くので、隠さず出す）
    const bits: string[] = [];
    let statusColor = "#e67e22";
    if (s.injuryDays > 0) bits.push(`🩹 ケガ 残り${weeksLabel(s.injuryDays)}`);
    const alt = this.env.altitudeStatus?.(s);
    if (alt) {
      bits.push(`⛰ ${alt.label}`);
      if (bits.length === 1) statusColor = alt.good ? "#2ecc71" : "#e67e22";
    }
    if (s.altitude && s.altitude.sprintDull > 0) bits.push("短距離の感覚が鈍っている（スピード練習で戻る）");
    this.statusText.setText(bits.join("　")).setColor(statusColor);

    const hint = growthHint(s.growthType, s.growthObserved);
    this.growthHintText.setColor(hint.level >= 3 ? "#f7dc6f" : hint.level >= 1 ? "#bdc3c7" : "#5d6d7e");
    this.growthHintText.setText(hint.text);

    // 幼少期の将来性：フォームの良い子ほど中学以降の伸びが良い。
    // 幼少期のうちは「コーチの見立て」として、卒業後は確定した倍率として見せる。
    const youthBits: string[] = [];
    if (isYouthStage(s)) {
      const seen = youthPotentialHint(s, this.env.coach?.quality ?? 0);
      if (seen) youthBits.push(`将来性の見立て：${seen}`);
      else if (this.env.coach) youthBits.push("将来性：この監督には見抜けない");
      else youthBits.push("将来性：監督を付けると見立てが出る");
    } else if ((s.youthForm ?? 0) > 0) {
      const mult = youthPotential(s);
      youthBits.push(`幼少期のフォーム土台 ${Math.round(mult * 100)}%`);
    }
    if (s.inDorm) youthBits.push("🏠 入寮中（回復が速い）");
    this.youthText.setText(youthBits.join("　")).setColor(s.inDorm ? "#7fd1ae" : "#f7dc6f");
    this.dormBtn?.setLabel(s.inDorm ? "退寮させる" : "入寮させる");

    const fit = FIT_TEXT[classFitStatus(s, this.env.classAvg)];
    this.fitText.setText(fit.label).setColor(fit.color);

    this.favEventText.setText(`${STROKE_LABEL[s.fav.stroke]} ${s.fav.distance}m`);
    if (s.bestTimeSec > 0 && s.bestTimeEvent) {
      this.bestTimeText.setText(formatTime(s.bestTimeSec)).setColor("#f7dc6f");
      this.bestEventText.setText(`${STROKE_LABEL[s.bestTimeEvent.stroke]} ${s.bestTimeEvent.distance}m`);
    } else {
      // まだ泳いでいない子は「これから計られる」と分かる出し方にする
      this.bestTimeText.setText("--:--").setColor("#5d6d7e");
      this.bestEventText.setText("記録会に出ると計測される");
    }

    // 今月の伸び（大きい順に3つ）。まだ伸びていなければ案内を出す。
    const gain = this.env.monthGain?.() ?? null;
    if (gain) {
      const list = STAT_KEYS.map((k) => ({ k, v: gain[k] }))
        .filter((g) => Math.abs(g.v) > 0.05)
        .sort((a, b) => b.v - a.v);
      const total = STAT_KEYS.reduce((n, k) => n + gain[k], 0);
      if (list.length === 0) {
        this.growthText.setText("今月の伸び：まだ練習していない").setColor("#95a6b8");
      } else {
        const top = list
          .slice(0, 3)
          .map((g) => `${STAT_LABEL[g.k]}${g.v >= 0 ? "+" : ""}${Math.round(g.v)}`)
          .join("　");
        this.growthText.setText(`今月の伸び：${top}　（合計 +${Math.round(total)}）`).setColor("#7fd1ae");
      }
    } else {
      this.growthText.setText("");
    }

    // 休養の状態（いつまで休むかで持っているので、取り消せばすぐ練習に戻る）
    const restLeft = this.env.restWeeksLeft?.(s) ?? 0;
    if (restLeft > 0) {
      this.restText
        .setText(`🛌 休養中：あと${restLeft}週（体力と調子が戻る。この間は練習に出ない）`)
        .setColor("#2ecc71");
    } else {
      this.restText
        .setText(`休養：予定なし（休ませると${REST.weeks}週まるごと休み、そのぶん成長は止まる）`)
        .setColor("#95a6b8");
    }
    this.cancelRestBtn?.setEnabled(restLeft > 0);

    // プラン表示＋選択ハイライト
    if (!this.isSchool) {
      const plan = this.env.effectivePlan();
      const self = s.planMode === "self";
      const eq = this.env.equipmentMult?.(plan.ability) ?? 1;
      const eqLabel = eq > 1.001 ? `　設備 ${Math.round(eq * 100)}%` : "";
      const source = self ? "個人指定" : this.env.classPlan() ? "全体練習" : "全体指定なし";
      this.planText.setText(
        `${source}　系統A：${STAT_LABEL[plan.ability]}${eqLabel}\n` +
          `系統B：${PLAN_STROKE_LABEL[plan.stroke]}（熟練度 ${Math.round(
            s.strokeProf[resolveStroke(s, plan.stroke)],
          )}）`,
      );
      this.planText.setColor(self ? "#f7dc6f" : "#7fd8c0");
      this.classPlanBtn?.setEnabled(self);
      for (const key of TRAINABLE_KEYS) this.abilityBtn[key]?.setSelected(plan.ability === key);
      for (const stroke of STROKE_KEYS) this.strokeBtn[stroke]?.setSelected(plan.stroke === stroke);
    }
  }
}
