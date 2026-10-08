import Phaser from "phaser";
import { setJaWrap } from "./textWrap";
import {
  overallAbility,
  STAT_KEYS,
  STAT_LABEL,
  talentRankOf,
  GENDER_LABEL,
  type Stroke,
  type Student,
} from "../sim/student";
import { CLASS_ORDER, classLabel, type ClassId } from "../sim/classes";
import { conditionLevel, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import { TALENT_COLOR } from "../sim/student";
import { estimatedAge } from "../sim/growth";
import { rankColor, rankOf, rankShort } from "../sim/rank";
import { ensurePortrait, PORTRAIT_SIZE } from "../gfx/portrait";
import { PIN_MAX, type GameState } from "../sim/state";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Button, closeOnBackdropTap } from "./Button";
import { flushInput } from "./inputReady";
import { logicalPoint } from "../gfx/renderScale";

/**
 * 名簿。クラスごとに在籍生徒を一覧表示し、行をタップすると詳細（StudentPanel）を開く。
 *
 * 【幅について】以前はパネルを 720px で作っていたため、540px の画面では
 * 0.73倍に縮められ、さらにスマホの画面幅へ縮んで文字が読めなくなっていた。
 * いまは画面幅に収まる 524px で組み、縮小が掛からないようにしてある。
 * **この幅を超えないこと**（超えた瞬間に全部の文字が小さくなる）。
 *
 * 【重さについて】文字（Phaser の Text）は1つずつ canvas を作って GPU へ送るので、
 * スマホでは1個あたりが高くつく。以前はクラスやページを切り替えるたびに行を作り直し、
 * 100個近い Text を毎回生成していて、開いた直後に固まる原因になっていた。
 * いまは行の部品を最初に1回だけ作り、中身（setText）と表示/非表示だけを差し替える。
 * **行に要素を足すときは、必ず makeRow で作って updateRow で書き換えること。**
 *
 * 【閉じても捨てない】この画面は1回作ったら使い回す（close で隠すだけ）。
 * 開くたびに作り直すと、そのたびに100個の canvas を作り直すことになり、
 * 「メニューを開くと固まる」の原因そのものになる。
 * 見ていたクラスとページもそのまま残るので、詳細から戻ってきたときに続きが見られる。
 */

/** 一覧の「得意」欄用の短い泳法名（1行に収めるため）。 */
const STROKE_SHORT: Record<Stroke, string> = {
  free: "自由",
  back: "背",
  breast: "平",
  fly: "バタ",
  im: "個メ",
};

/**
 * 一覧の並び順。
 * 「誰を昇格させるか」「誰を休ませるか」を探すときに、見たい順で並べ替えられるようにする。
 * roster＝名簿順（＝時間割でコマに詰める順でもあるので、既定はこれ）。
 * joined＝入会順（**最近入った子が上**＝1ページ目。2026-09-26 に逆にした）。名簿順は昇格すると新しいクラスの末尾に回るので、
 * 「クラブに入ってからの長さ」で見たいときはこちらを使う。
 */
export type RosterSort = "roster" | "joined" | "condition" | "age" | "rank" | "class";

const SORT_ORDER: readonly RosterSort[] = ["roster", "joined", "condition", "age", "rank", "class"];

const SORT_LABEL: Record<RosterSort, string> = {
  roster: "名簿順",
  joined: "入会順",
  condition: "調子順",
  age: "年齢順",
  rank: "格順",
  class: "クラス順",
};

/** タブの「全員」（クラスをまたいで見る）。 */
/**
 * 一覧の切り替え。クラスのほかに2つ。
 *   all    … 全クラスを混ぜて出す
 *   pinned … ★を付けた選手だけ（HUD の札から飛んでくる先）
 *   group  … 呼び出し側が渡した顔ぶれだけ（「今回入会した子」など）。タブには出ない
 */
type TabId = ClassId | "all" | "pinned" | "group";

/** タブの並び（選択状態を回すときに使う）。 */
const TAB_IDS: TabId[] = ["all", ...CLASS_ORDER.map((c) => c.id), "pinned"];

/** 1行ぶんの部品。使い回すので参照を持っておく。 */
interface RowView {
  rect: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  /** コンディション。色でも分かるようにする。 */
  cond: Phaser.GameObjects.Text;
  stats: Phaser.GameObjects.Text[];
  rank: Phaser.GameObjects.Text;
  fav: Phaser.GameObjects.Text;
  /** まとめて選択のチェック（選択モードのときだけ出る）。 */
  check: Phaser.GameObjects.Text;
  /** 注目選手の★（顔の左上に重ねる。押すと付け外し）。 */
  star: Phaser.GameObjects.Text;
  student: Student | null;
}

export class RosterModal {
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly container: Phaser.GameObjects.Container;
  private readonly rowLayer: Phaser.GameObjects.Container;
  private readonly tabBtns: Partial<Record<TabId, Button>> = {};
  private readonly rows: RowView[] = [];
  private emptyText!: Phaser.GameObjects.Text;

  private readonly PW = Math.min(524, GAME_WIDTH - 16);
  private readonly PH = Math.min(780, GAME_HEIGHT - 24);
  private readonly ROWS_PER_PAGE = 7;

  /**
   * 【縦の並びはここだけで決める】
   *
   *   14  タイトル（＋右上の×）
   *   58  クラスタブ 1段目（全員・幼児・学童・育成B）
   *  100  クラスタブ 2段目（育成A・選手・プロ）
   *  144  操作の行（まとめて選択／並び替え／昇格させる／選択解除）
   *  180  列の見出し
   *  200  ひとこと
   *  220  一覧の1行目
   *
   * **タブと操作ボタンは必ず別の行に置くこと**。同じ高さに置くと、
   * タブの端とボタンが重なって「押したつもりが別のものを押す」状態になる。
   */
  private readonly TAB_Y = 58;
  private readonly TAB_STEP = 42;
  private readonly CTRL_Y = 144;
  private readonly HEAD_Y = 180;
  private readonly HINT_Y = 200;

  /** 行の高さ（2段組：上段＝名前と総合、下段＝学年と各能力）。 */
  private readonly ROW_H = 66;
  /** 行が並びはじめる高さ。 */
  private readonly ROW_TOP = 220;
  /**
   * 能力ランクの列の左端と間隔。
   *
   * 【左の欄を広げた】以前は STAT_X=222／GAP=48 で、名前の下の行に使える幅が
   * 222−66（名前の左端）＝156px しかなかった。そこへ
   * 「学年・性別」＋「クラス名（全員タブ）」＋「🛌休養 あと◯週」＋「個人」を並べていたので、
   * **調子の文字（x=160）と重なって読めなくなっていた**。
   * 間隔を詰めて左端を右へ寄せ、調子は上の行へ移した（2026-09-19）。
   * 右端（格・得意）の位置は変えていない：246 + 42×4 ＝ 414 で、以前の 414 と同じ。
   */
  private readonly STAT_X = 246;
  private readonly STAT_GAP = 42;

  /** 名前・学年の左端（顔のとなり）。 */
  private readonly NAME_X = 24 + PORTRAIT_SIZE + 10;
  /** 名前（上段）に使える幅。 */
  private readonly NAME_W = 108;
  /**
   * 下段（学年・性別＋バッジ）に使える幅。
   * ここを超えたバッジは後ろから落とす（→ updateRow）。能力の列に食い込ませない。
   */
  private readonly SUB_W = 246 - (24 + PORTRAIT_SIZE + 10) - 8;

  private classId: TabId = "youji";
  /** group の一覧の見出しと顔ぶれ（→ showGroup）。 */
  private groupTitle = "";
  private groupIds: number[] = [];
  private sort: RosterSort = "roster";
  private sortBtn!: Button;
  private page = 0;
  /**
   * まとめて選択モード。
   * 昇格させたい子が何人もいるとき、1人ずつ詳細を開いて昇格させるのは手間なので、
   * 行をタップで選び、まとめて上のクラスへ上げられるようにしてある。
   */
  private multi = false;
  private readonly picked = new Set<number>();
  private multiBtn!: Button;
  private promoteBtn!: Button;
  private clearBtn!: Button;
  private hintText!: Phaser.GameObjects.Text;
  private open = false;
  private downHandler?: (p: Phaser.Input.Pointer) => void;
  private upHandler?: (p: Phaser.Input.Pointer) => void;
  private pageText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly onSelect: (s: Student) => void,
    private readonly onClose: () => void,
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

    this.titleText = this.text(20, 14, "名簿", 20, "#f7dc6f", true);
    // 右上の × だけを避ければよい（操作ボタンは下の行へ移した）
    setJaWrap(this.titleText, this.PW - 90);
    new Button(this.scene, this.PW - 38, 32, 58, 48, "×", () => this.onClose(), {
      color: 0x7f2f2f,
      hoverColor: 0xa8443a,
      fontSize: 26,
      hitPadding: 10,
    });
    this.reparentLastButton();

    this.buildTabs();
    this.buildColumnHeader();
    this.buildMultiControls();

    // ページ操作（指で押しやすい大きさにしてある）
    new Button(this.scene, this.PW / 2 - 108, this.PH - 34, 116, 48, "◀ 前", () => this.turnPage(-1), {
      fontSize: 16,
    });
    this.reparentLastButton();
    new Button(this.scene, this.PW / 2 + 108, this.PH - 34, 116, 48, "次 ▶", () => this.turnPage(1), {
      fontSize: 15,
    });
    this.reparentLastButton();
    this.pageText = this.text(this.PW / 2, this.PH - 34, "", 15, "#bdc3c7", true).setOrigin(0.5);

    this.rowLayer = scene.add.container(0, 0);
    this.container.add(this.rowLayer);

    // 行の部品を先に1回だけ作る（あとは中身を差し替えるだけ）
    for (let i = 0; i < this.ROWS_PER_PAGE; i++) this.rows.push(this.makeRow(i));
    this.emptyText = this.scene.add
      .text(this.PW / 2, this.ROW_TOP + 120, "在籍者がいません\n（昇格・入会で増やそう）", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#95a6b8",
        align: "center",
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.rowLayer.add(this.emptyText);

    // 画面に収まる寸法で組んであるので、通常は等倍（＝文字がぼやけない）
    const scale = Math.min(1, (GAME_WIDTH - 8) / this.PW, (GAME_HEIGHT - 16) / this.PH);
    this.container.setScale(scale);
    this.container.setPosition((GAME_WIDTH - this.PW * scale) / 2, (GAME_HEIGHT - this.PH * scale) / 2);

    this.enableSwipePaging();
    this.selectClass("youji");
    // 行（タップで詳細）はボタンより後に作るので、ここで当たり判定を有効にする
    flushInput(scene);
    this.setShown(false); // 作るだけ作って、開かれるまでは隠しておく
  }

  /** いま開いているか（施設側でカメラ操作を止める判断に使う）。 */
  isOpen(): boolean {
    return this.open;
  }

  /**
   * 開く。focus を渡すと、その選手が載っているクラスとページまで送る
   * （詳細から「◀ 名簿」で戻ってきたとき、さっき見ていた続きが出る）。
   */
  /**
   * ★を付けた選手だけの一覧を開く（HUD の札をタップしたときの行き先）。
   * 名簿を開き直してタブを探さなくていいように、入口をここに作ってある。
   */
  showPinned(): void {
    this.selectClass("pinned");
    this.setShown(true);
    this.renderRows();
    flushInput(this.scene);
  }

  /**
   * 渡した顔ぶれだけの一覧を開く（例：キャンペーンで今回入会した子）。
   * 「入会12人」と数だけ出されても誰が来たのか分からないので、お祝いの帯から直接ここへ来られるようにしてある。
   * 行をタップすればいつもどおりカード（能力・才能・プロフィール）が開き、「◀ 名簿」でこの一覧に戻る。
   */
  showGroup(title: string, ids: readonly number[]): void {
    this.groupTitle = title;
    this.groupIds = [...ids];
    this.selectClass("group");
    this.setShown(true);
    this.renderRows();
    flushInput(this.scene);
  }

  show(focus?: Student): void {
    if (focus) {
      // ★の一覧・渡された顔ぶれの一覧から見に行った子は、戻ってきても同じ一覧のまま
      //（クラスのタブに飛ばすと、その顔ぶれの一覧に戻る道が無くなる）
      const stay =
        (this.classId === "pinned" && focus.pinned) || (this.classId === "group" && this.groupIds.includes(focus.id));
      if (!stay) this.classId = focus.classId;
      for (const t of TAB_IDS) this.tabBtns[t]?.setSelected(t === this.classId);
      this.multiBtn.setEnabled(true);
      const i = this.sortedList().indexOf(focus);
      this.page = i >= 0 ? Math.floor(i / this.ROWS_PER_PAGE) : 0;
    }
    this.setShown(true);
    this.renderRows(); // 在籍や能力は開いていない間にも変わる
    flushInput(this.scene);
  }

  /** 閉じる（捨てない）。見ていたクラスとページはそのまま残す。 */
  hide(): void {
    this.setShown(false);
  }

  /** いま一覧に出しているクラスの全員（詳細画面の ◀▶ で前後の選手へ移るのに使う）。 */
  currentList(): Student[] {
    return this.sortedList();
  }

  /**
   * 表示・非表示。Phaser は「見えていないもの」を当たり判定から外すので、
   * 隠せばボタンも行も押せなくなる（別途で無効にする必要はない）。
   */
  private setShown(v: boolean): void {
    this.open = v;
    this.backdrop.setVisible(v);
    this.container.setVisible(v);
  }

  destroy(): void {
    if (this.downHandler) this.scene.input.off("pointerdown", this.downHandler);
    if (this.upHandler) this.scene.input.off("pointerup", this.upHandler);
    this.backdrop.destroy();
    this.container.destroy();
  }

  /**
   * 一覧の上を上下になぞるとページを送る。
   * 矢印を押さなくても片手で読み進められるようにするため。
   * 行のタップと喧嘩しないよう、SWIPE_PX 以上動いたときだけページを送る
   * （行やボタンの側も「大きく動いたら押したことにしない」ようにしてある）。
   */
  private enableSwipePaging(): void {
    const SWIPE_PX = 40;
    let startY = 0;
    let active = false;
    const top = this.ROW_TOP - 10;
    const bottom = this.ROW_TOP + this.ROWS_PER_PAGE * this.ROW_H;

    this.downHandler = (ptr: Phaser.Input.Pointer): void => {
      if (!this.open) return; // 閉じている間はシーンのタップに反応しない
      const p = logicalPoint(ptr); // 指の座標は canvas の画素で届く（→ gfx/renderScale.ts）
      const localY = (p.y - this.container.y) / (this.container.scaleY || 1);
      active = localY >= top && localY <= bottom;
      startY = p.y;
    };
    this.upHandler = (ptr: Phaser.Input.Pointer): void => {
      if (!active || !this.open) return;
      const p = logicalPoint(ptr);
      active = false;
      const dy = p.y - startY;
      if (Math.abs(dy) < SWIPE_PX) return;
      this.turnPage(dy < 0 ? 1 : -1); // 上へなぞる＝次のページ
    };
    this.scene.input.on("pointerdown", this.downHandler);
    this.scene.input.on("pointerup", this.upHandler);
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

  /** クラスタブ。6つを1列に並べると狭いので、3つずつ2段にしている。 */
  /**
   * クラスタブ。先頭に「全員」を置き、4列×2段に並べる。
   * 「全員」ではクラスをまたいで並べ替えられる（→ クラス順で見ると全体像がつかめる）。
   */
  private buildTabs(): void {
    // 8つ＝4列×2段ぴったり（★を足しても段は増えない）
    const tabs: { id: TabId; label: string }[] = [
      { id: "all", label: "全員" },
      ...CLASS_ORDER.map((c) => ({ id: c.id as TabId, label: c.label })),
      { id: "pinned", label: "★注目" },
    ];
    const cols = 4;
    const margin = 16;
    const gap = 8;
    const bw = (this.PW - margin * 2 - gap * (cols - 1)) / cols;
    tabs.forEach((t, i) => {
      const x = margin + bw / 2 + (i % cols) * (bw + gap);
      const y = this.TAB_Y + Math.floor(i / cols) * this.TAB_STEP;
      new Button(this.scene, x, y, bw, 38, t.label, () => this.selectClass(t.id), {
        color: 0x2c3e50,
        hoverColor: 0x3d5a80,
        selectedColor: 0x2e5a8f,
        fontSize: 15,
      });
      this.tabBtns[t.id] = this.reparentLastButton();
    });
  }

  private buildColumnHeader(): void {
    const y = this.HEAD_Y;
    this.text(20, y, "名前 / 学年", 13.5, "#8fa3b5", true);
    // 「才能」という見出しは外した（どの列も才能ランクなのは下の一言で説明している）。
    // いまこの位置にあるのは調子なので、見出しもそう書く。
    this.text(this.STAT_X - 14, y, "調子", 12.5, "#8fa3b5", true).setOrigin(1, 0);
    STAT_KEYS.forEach((k, i) => {
      this.text(this.STAT_X + i * this.STAT_GAP, y, STAT_LABEL[k].slice(0, 2), 13.5, "#8fa3b5", true);
    });
    // 5つ目の能力の見出しに掛からない長さにしておくこと
    this.text(this.PW - 20, y, "格・得意", 13.5, "#8fa3b5", true).setOrigin(1, 0);
    // 【名簿に能力の数値は出さない】数字を並べても強い弱いが読めるだけで、
    // 「誰を育てるか」の判断には才能ランクのほうが効く。
    // 数値と形は選手カードのレーダーで見る。
    this.hintText = this.text(20, this.HINT_Y, this.hintLine(), 13, "#95a6b8");
  }

  /**
   * まとめて選択の操作列（選択モードのときだけ出る）。
   * 置き場所は見出しと1行目のあいだ。行そのものには手を入れない。
   */
  private buildMultiControls(): void {
    // 【操作の行】タブの下に独立した1行を用意し、4つを等間隔に並べる。
    // タブと同じ高さに置くと端が重なって誤タップになるので、ここは必ず別の行。
    const margin = 16;
    const gap = 8;
    const cols = 4;
    const bw = (this.PW - margin * 2 - gap * (cols - 1)) / cols;
    const cx = (i: number): number => margin + bw / 2 + i * (bw + gap);
    const h = 38;

    this.multiBtn = new Button(this.scene, cx(0), this.CTRL_Y, bw, h, "まとめて選択", () => this.toggleMulti(), {
      color: 0x2c5f8f,
      hoverColor: 0x3d78b0,
      selectedColor: 0x2e7d5b,
      fontSize: 13,
    });
    this.reparentLastButton();

    // 並び替え（押すたびに 名簿順 → 入会順 → 調子順 → 年齢順 → 格順 → クラス順）
    this.sortBtn = new Button(this.scene, cx(1), this.CTRL_Y, bw, h, "", () => this.cycleSort(), {
      color: 0x4a3a6b,
      hoverColor: 0x63509b,
      fontSize: 13,
    });
    this.reparentLastButton();
    this.updateSortLabel();

    this.promoteBtn = new Button(this.scene, cx(2), this.CTRL_Y, bw, h, "昇格させる", () => this.promotePicked(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 13,
    });
    this.reparentLastButton();

    this.clearBtn = new Button(this.scene, cx(3), this.CTRL_Y, bw, h, "選択解除", () => this.clearPicked(), {
      color: 0x555f6b,
      hoverColor: 0x6b7684,
      fontSize: 13,
    });
    this.reparentLastButton();

    this.setMultiVisible(false);
  }

  private setMultiVisible(v: boolean): void {
    this.promoteBtn.setVisible(v);
    this.clearBtn.setVisible(v);
  }

  private toggleMulti(): void {
    this.multi = !this.multi;
    this.picked.clear();
    this.multiBtn.setSelected(this.multi).setLabel(this.multi ? "選択をやめる" : "まとめて選択");
    this.setMultiVisible(this.multi);
    this.hintText.setText(
      this.multi ? "行をタップで選ぶ → まとめて1つ上のクラスへ" : "行をタップで詳細　数値の色＝才能ランク",
    );
    this.hintText.setColor(this.multi ? "#7fd1ae" : "#95a6b8");
    this.renderRows();
  }

  private clearPicked(): void {
    this.picked.clear();
    this.renderRows();
  }

  /** 選んだ子をまとめて1つ上のクラスへ。上げられなかった子は理由を出す。 */
  private promotePicked(): void {
    // クラスが混ざる一覧（全員・★注目）では、まとめて昇格は使わせない
    // （行き先がひとつに決まらないため。ボタン自体も selectClass で無効にしてある）
    if (this.classId === "all" || this.classId === "pinned" || this.classId === "group") return;
    const targets = this.state.students[this.classId].filter((s) => this.picked.has(s.id));
    if (targets.length === 0) {
      this.hintText.setText("まだ誰も選んでいない").setColor("#e59866");
      return;
    }
    let done = 0;
    let reason = "";
    // move で配列が動くので、対象を先に控えてから回す
    for (const s of targets) {
      const r = this.state.promoteStudent(s);
      if (r.ok) done++;
      else if (!reason) reason = r.reason ?? "";
    }
    this.picked.clear();
    this.hintText
      .setText(done > 0 ? `${done}人を昇格させた${reason ? `（残りは${reason}）` : ""}` : `昇格できなかった：${reason}`)
      .setColor(done > 0 ? "#7fd1ae" : "#e59866");
    this.renderRows();
  }

  private updateSortLabel(): void {
    this.sortBtn.setLabel(`並び：${SORT_LABEL[this.sort]}`);
  }

  private cycleSort(): void {
    const i = SORT_ORDER.indexOf(this.sort);
    this.sort = SORT_ORDER[(i + 1) % SORT_ORDER.length];
    this.updateSortLabel();
    this.page = 0;
    this.renderRows();
  }

  /**
   * いま一覧に出す並び。
   * **元の配列は絶対に並べ替えないこと**（名簿の順番は時間割でコマに詰める優先順位でもあるので、
   * ここで sort すると練習する顔ぶれが変わってしまう）。必ずコピーしてから並べる。
   */
  private sortedList(): Student[] {
    const src =
      this.classId === "all"
        ? CLASS_ORDER.flatMap((c) => this.state.students[c.id])
        : this.classId === "pinned"
          ? this.state.pinnedStudents()
          : this.classId === "group"
            ? this.groupStudents()
            : this.state.students[this.classId];
    if (this.sort === "roster") return [...src];
    const arr = [...src];
    const classIndex = (s: Student): number => CLASS_ORDER.findIndex((c) => c.id === s.classId);
    switch (this.sort) {
      case "joined":
        // 選手の番号は入会した順に振っている（GameState.nextId・セーブでも変わらない）。大きいほど新しい。
        // 新しく入った子を探すことが多いので、新しい順（1ページ目に最近の入会者）に並べる
        arr.sort((a, b) => b.id - a.id);
        break;
      case "condition":
        // 良いほうが上（絶好調 → 疲労）。同じなら数値の高い順。
        arr.sort((a, b) => b.condition - a.condition);
        break;
      case "age":
        // 年上が上（進路の判断をする子から見たい）
        arr.sort((a, b) => estimatedAge(b.grade) - estimatedAge(a.grade) || overallAbility(b) - overallAbility(a));
        break;
      case "rank":
        arr.sort((a, b) => rankOf(b) - rankOf(a) || overallAbility(b) - overallAbility(a));
        break;
      case "class":
        // 上のクラスから。同じクラスなら能力順。
        arr.sort((a, b) => classIndex(b) - classIndex(a) || overallAbility(b) - overallAbility(a));
        break;
    }
    return arr;
  }

  /** group の顔ぶれのうち、いま在籍している子。退会・引退した子は出さない。 */
  private groupStudents(): Student[] {
    const want = new Set(this.groupIds);
    return CLASS_ORDER.flatMap((c) => this.state.students[c.id]).filter((s) => want.has(s.id));
  }

  private selectClass(id: TabId): void {
    this.classId = id;
    this.page = 0;
    this.picked.clear(); // クラスをまたいだ選択は持ち越さない
    for (const t of TAB_IDS) this.tabBtns[t]?.setSelected(t === id);
    // クラスが混ざる一覧（全員・★注目）では、まとめて昇格は使えない
    const mixed = id === "all" || id === "pinned" || id === "group";
    if (mixed && this.multi) this.toggleMulti();
    this.multiBtn.setEnabled(!mixed);
    this.renderRows();
  }

  private turnPage(dir: number): void {
    const arr = this.sortedList();
    const maxPage = Math.max(0, Math.ceil(arr.length / this.ROWS_PER_PAGE) - 1);
    this.page = Phaser.Math.Clamp(this.page + dir, 0, maxPage);
    this.renderRows();
  }

  private renderRows(): void {
    const arr = this.sortedList();
    if (this.classId === "all") {
      // 「規模」は目安であって定員ではない（超えても入会は断らない。来る間隔が延びるだけ）
      this.titleText.setText(`名簿　全員　${arr.length}人　（無理なく見られる規模 ${this.state.comfortableSize()}人）`);
    } else if (this.classId === "pinned") {
      this.titleText.setText(`名簿　★注目の選手　${arr.length} / ${PIN_MAX}人`);
    } else if (this.classId === "group") {
      this.titleText.setText(`${this.groupTitle}　${arr.length}人`);
    } else {
      const label = classLabel(this.classId);
      // スクールの上限は開講したコマで決まるので「在籍 / 上限」で見せる
      const resting = this.state.restScheduledCount(this.classId);
      this.titleText.setText(
        `名簿　${label}　${arr.length} / ${this.state.capacityOf(this.classId)}人` +
          (resting > 0 ? `　🛌${resting}` : ""),
      );
    }

    const maxPage = Math.max(0, Math.ceil(arr.length / this.ROWS_PER_PAGE) - 1);
    this.page = Math.min(this.page, maxPage);
    this.pageText.setText(
      this.multi && this.picked.size > 0 ? `選択 ${this.picked.size}人` : `${this.page + 1} / ${maxPage + 1}`,
    );
    // 空っぽのときの一言はタブで変える（★のタブで「昇格・入会で増やそう」は的外れ）
    this.emptyText.setText(
      this.classId === "pinned"
        ? "★を付けた選手がいません\n（名簿の行の☆を押すと、ここと HUD に出ます）"
        : this.classId === "group"
          ? "もう在籍していません"
          : "在籍者がいません\n（昇格・入会で増やそう）",
    );
    this.emptyText.setVisible(arr.length === 0);

    const start = this.page * this.ROWS_PER_PAGE;
    const shown = arr.slice(start, start + this.ROWS_PER_PAGE);
    this.rows.forEach((row, i) => this.updateRow(row, shown[i] ?? null));
  }

  /**
   * 行の部品を1つ作る（最初に1回だけ）。
   * 位置は固定で、中身だけを updateRow で差し替える。
   */
  private makeRow(index: number): RowView {
    const rh = this.ROW_H;
    const cy = this.ROW_TOP + index * rh + rh / 2;
    const UP = cy - 15;
    const DOWN = cy + 15;

    const rect = this.scene.add
      .rectangle(this.PW / 2, cy, this.PW - 28, rh - 6, 0x1c3550, 1)
      .setStrokeStyle(1, 0x2e4a66, 1)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation?.();
        const s = this.rows[index]?.student;
        if (!s) return;
        if (this.multi) {
          // 選択モード中は詳細を開かず、選ぶ／外すだけ
          if (this.picked.has(s.id)) this.picked.delete(s.id);
          else this.picked.add(s.id);
          this.renderRows();
          return;
        }
        this.onSelect(s);
      });
    this.rowLayer.add(rect);

    const mk = (
      x: number,
      ty: number,
      size: number,
      color: string,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const t = this.scene.add
        .text(x, ty, "", {
          fontFamily: "sans-serif",
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
        })
        .setOrigin(originX, 0.5);
      this.rowLayer.add(t);
      return t;
    };

    const face = this.scene.add.image(24 + PORTRAIT_SIZE / 2, cy, "__DEFAULT").setScale(1.1);
    this.rowLayer.add(face);

    const nameX = this.NAME_X;
    const name = mk(nameX, UP, 18.5, "#ffffff", true);
    name.setWordWrapWidth(this.NAME_W);
    const sub = mk(nameX, DOWN, 14, "#a9bbc9");
    // 【調子は上の行へ】下の行は「学年・性別＋バッジ」で埋まるので、
    // 調子は名前と同じ行の右端（能力の列のすぐ左）に右揃えで置く。
    const cond = mk(this.STAT_X - 14, UP, 12.5, "#ecf0f1", false, 1);
    // 上段は才能ランクの文字、下段はコンディション。数値は置かない
    const stats = STAT_KEYS.map((_k, i) => mk(this.STAT_X + i * this.STAT_GAP, UP + 2, 17, "#e8eef3", true));
    const rank = mk(this.PW - 20, UP, 15, "#ffffff", true, 1);
    const fav = mk(this.PW - 20, DOWN, 14, "#8fc0e6", false, 1);
    // チェックは顔の上に重ねる（列を増やすと能力値の並びが崩れるため）
    const check = mk(24 + PORTRAIT_SIZE / 2, cy, 24, "#f7dc6f", true, 0.5);

    /**
     * 【★は顔の左上の角に重ねる】列として立てると、能力の5列（STAT_X〜）と
     * 名前の幅（NAME_W）をぜんぶ詰め直すことになる。角なら**どの列にも触らない**。
     * 当たり判定は指で押せる大きさ（26px）を別に持たせる。
     * 行そのもののタップ（＝詳細を開く）より手前に居るので、
     * `input.topOnly` の既定（true）でこちらだけが反応する。
     */
    const star = mk(24 + PORTRAIT_SIZE / 2 - 11, cy - 11, 17, "#4a6076", true, 0.5);
    star.setInteractive(
      new Phaser.Geom.Rectangle(-13, -13, 26, 26),
      Phaser.Geom.Rectangle.Contains,
    );
    star.on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation?.();
      const s = this.rows[index]?.student;
      if (!s) return;
      this.toggleStar(s);
    });

    return { rect, face, name, sub, cond, stats, rank, fav, check, star, student: null };
  }

  /** ★の付け外し。上限に達していたら理由を出すだけで、古い★は外さない。 */
  private toggleStar(s: Student): void {
    const r = this.state.togglePin(s);
    if (!r.ok) {
      this.hintText.setText(`⚠ ${r.reason ?? ""}`).setColor("#e67e22");
      return;
    }
    this.hintText.setText(this.hintLine()).setColor("#95a6b8");
    this.renderRows();
  }

  /** 一覧の下に出す案内（★の説明を含む）。 */
  private hintLine(): string {
    const n = this.state.pinnedStudents().length;
    return `行をタップで詳細　★を押すと注目選手（${n}/${PIN_MAX}人・HUDに出る）`;
  }

  /** 行の中身を差し替える（s が null なら行ごと隠す）。 */
  private updateRow(row: RowView, s: Student | null): void {
    row.student = s;
    const parts = [row.rect, row.face, row.name, row.sub, row.cond, row.rank, row.fav, ...row.stats];
    if (!s) {
      for (const p of parts) p.setVisible(false);
      row.check.setVisible(false);
      row.star.setVisible(false);
      return;
    }
    for (const p of parts) p.setVisible(true);

    const restLeft = this.state.restWeeksLeftOf(s);
    const rest = restLeft > 0;
    const on = this.multi && this.picked.has(s.id);
    row.check.setVisible(on).setText(on ? "☑" : "");
    row.face.setAlpha(on ? 0.25 : 1);
    // ★は選択モード中は隠す（チェックと同じ場所に2つ印があると何を押すのか分からない）
    row.star.setVisible(!this.multi).setText(s.pinned ? "★" : "☆").setColor(s.pinned ? "#f7dc6f" : "#5d7085");
    row.rect.setFillStyle(on ? 0x24506b : rest ? 0x25405c : 0x1c3550, 1);
    row.rect.setStrokeStyle(on ? 2 : 1, on ? 0xf7dc6f : rest ? 0x4a7ba8 : 0x2e4a66, 1);

    row.face.setTexture(ensurePortrait(this.scene, s));
    row.name.setText(s.name);

    /**
     * 学年・性別に、休養や個人メニューの印を同じ行へまとめる（Text を増やさない）。
     *
     * 【幅からはみ出したら後ろのバッジを落とす】この行は能力の列（STAT_X）の手前までしか使えない。
     * 以前は入るかどうかを見ずに並べていたので、「全員タブのクラス名」や
     * 「🛌休養 あと1週」が付くと**調子の文字と重なって読めなくなっていた**。
     * 並びは大事な順（クラス → 休養 → 個人）で、入らなければ後ろから落とす。
     * 実測（setText したあとの width）で判断するので、文字が変わっても崩れない。
     */
    const leaving = s.leaveAtMonth != null;
    /**
     * 【卒園して学童が満員の子】（2026-10-07）
     * 年齢で出ていく子と同じ「来月で退会」だと、昇格させれば残せるように読めてしまう。
     * 理由（クラスに空きがない）が分かる書き方にする。性別は落として、そのぶんを理由に回す。
     */
    const noRoom = leaving && this.state.isWaitingForGakudo(s);
    const base = leaving ? s.grade : `${s.grade}・${GENDER_LABEL[s.gender]}`;
    const badges: string[] = [];
    // 【退会の予告は先頭】入らなければ後ろから落とす仕組みなので、
    // いちばん取り返しのつかない知らせを先に置いて、最後まで残るようにする
    if (leaving) badges.push(noRoom ? "⚠空きなし退会" : "⚠来月で退会");
    if (this.classId === "all") badges.push(classLabel(s.classId));
    if (restLeft > 0) badges.push(`🛌${restLeft}週`);
    if (s.planMode === "self") badges.push("個人");
    const withBadges = (): string => base + (badges.length > 0 ? `　${badges.join(" ")}` : "");
    row.sub.setText(withBadges());
    while (badges.length > 1 && row.sub.width > this.SUB_W) {
      badges.pop();
      row.sub.setText(withBadges());
    }
    // 最後の1つ（退会の印）でもはみ出すなら、短い書き方に替える → それでもだめなら落とす
    if (badges.length > 0 && row.sub.width > this.SUB_W) {
      if (leaving) {
        badges[0] = "⚠退会";
        row.sub.setText(withBadges());
      }
      if (row.sub.width > this.SUB_W) {
        badges.pop();
        row.sub.setText(withBadges());
      }
    }
    row.sub.setColor(leaving ? "#e67e22" : rest ? "#f1c40f" : "#9fb3c4");

    // コンディション（名簿から「今日は誰が絶好調か」が分かるように）
    const lv = conditionLevel(s.condition);
    row.cond.setText(`${CONDITION_ICON[lv]}${CONDITION_LABEL[lv]}`).setColor(CONDITION_COLOR[lv]);
    // 各列は才能ランク（E〜SS）。色と文字の両方で示す
    STAT_KEYS.forEach((k, i) => {
      const t = talentRankOf(s, k);
      row.stats[i].setText(t).setColor(TALENT_COLOR[t]);
    });

    const tier = rankOf(s);
    row.rank.setText(`${tier} ${rankShort(tier)}`).setColor(rankColor(tier));
    // 得意は短縮形にする。「バタフライ200」のままだと5つ目の能力の上に乗る。
    row.fav.setText(`${STROKE_SHORT[s.fav.stroke]}${s.fav.distance}`);
  }
}
