import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Button, closeOnBackdropTap, excludePanelFromBackdrop, type ButtonOptions } from "./Button";
import { setJaWrap } from "./textWrap";
import { flushInput } from "./inputReady";
import { logicalPoint } from "../gfx/renderScale";

/**
 * モーダルの共通土台（暗幕＋角丸パネル＋タイトル＋×ボタン）。
 * 画面に収まらないサイズを渡しても自動で縮小して中央に置く。
 *
 * 既存の StudentPanel / RosterModal などは独自実装のままにしてあり、
 * ここは新しく足した画面（イベント一覧・システム・設定・確認ダイアログ）が使う。
 */

export interface ModalOptions {
  width?: number;
  height?: number;
  title?: string;
  subtitle?: string;
  depth?: number;
  /** 暗幕タップで閉じる（確認ダイアログでは false にする）。 */
  closeOnBackdrop?: boolean;
  /** 右上の × を出す。 */
  showClose?: boolean;
  accent?: string;
}

export class Modal {
  readonly container: Phaser.GameObjects.Container;
  /** 中身の入れ替え（再描画）用のレイヤ。 */
  readonly body: Phaser.GameObjects.Container;
  readonly pw: number;
  readonly ph: number;
  /** ヘッダの下端。中身はここから下に置く。 */
  readonly contentTop: number;

  private readonly backdrop: Phaser.GameObjects.Rectangle;

  constructor(
    protected readonly scene: Phaser.Scene,
    opts: ModalOptions = {},
    private readonly onCloseRequest?: () => void,
  ) {
    this.pw = opts.width ?? GAME_WIDTH - 44;
    this.ph = opts.height ?? 560;
    const depth = opts.depth ?? 2500;
    const accent = opts.accent ?? "#f7dc6f";

    this.backdrop = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.62)
      .setInteractive()
      .setDepth(depth);
    // 「押して離す」で閉じる。押した瞬間に閉じると、ボタンのすぐ外に指が着いただけで
    // 画面が消えてしまい「押したのに反応しなかった」と感じる。
    if (opts.closeOnBackdrop !== false) {
      closeOnBackdropTap(this.backdrop, () => this.requestClose());
    }

    this.container = scene.add.container(0, 0).setDepth(depth + 1);

    const box = scene.add.graphics();
    box.fillStyle(0x000000, 0.35);
    box.fillRoundedRect(4, 6, this.pw, this.ph, 14);
    box.fillStyle(0x14263a, 1);
    box.fillRoundedRect(0, 0, this.pw, this.ph, 14);
    box.lineStyle(3, 0x2e4a66, 1);
    box.strokeRoundedRect(0, 0, this.pw, this.ph, 14);
    this.container.add(box);

    // 【受け止め用のゾーンは置かない】
    // 以前はパネル全体に透明なゾーンを重ねて、タップが暗幕へ抜けるのを止めていた。
    // ところがコンテナの子どうしは当たり判定の優先順位を付けられないので、
    // そのゾーンが**中のボタンより先にタップを取ってしまう**。
    // 暗幕の側でパネルの内側を判定から外してあるので（→ excludePanelFromBackdrop）、
    // ここで受け止める必要はない。

    let top = 16;
    if (opts.title) {
      // 右上の × と重ならない幅で折り返す
      const t = this.text(20, top, "", 21, accent, true);
      setJaWrap(t, this.pw - 96);
      t.setText(opts.title);
      top += t.height + 6;
    }
    if (opts.subtitle) {
      // 日本語はスペースが無く、既定の折り返しでは止まらないので setJaWrap を使う。
      // 1行目は右上の × の高さに掛かるので、× の左側までで折り返す。
      const t = this.text(20, top, "", 12.5, "#9fb3c4");
      setJaWrap(t, this.pw - 90);
      t.setText(opts.subtitle);
      top += t.height + 6;
    }
    if (opts.title || opts.subtitle) {
      const line = scene.add.graphics();
      line.lineStyle(2, 0x2e4a66, 1);
      line.lineBetween(16, top + 2, this.pw - 16, top + 2);
      this.container.add(line);
      top += 12;
    }
    this.contentTop = top;

    if (opts.showClose !== false) {
      // × は「閉じたいのに閉じられない」がいちばん効くので、大きめ＋当たり判定も広め
      this.button(this.pw - 36, 32, 56, 48, "×", () => this.requestClose(), {
        color: 0x7f2f2f,
        hoverColor: 0xa8443a,
        fontSize: 26,
        hitPadding: 10,
      });
    }

    this.body = scene.add.container(0, 0);
    this.container.add(this.body);

    // 画面に収まらないときだけ縮小して中央へ
    const scale = Math.min(1, (GAME_WIDTH - 16) / this.pw, (GAME_HEIGHT - 24) / this.ph);
    this.container.setScale(scale);
    this.container.setPosition((GAME_WIDTH - this.pw * scale) / 2, (GAME_HEIGHT - this.ph * scale) / 2);

    // 【暗幕にパネルの中を触らせない】これが無いと、暗幕が画面いっぱいのタップを
    // 全部さらってしまい、パネルの中のボタン（× や「閉じる」）が反応しない
    //（→ ui/Button.ts の excludePanelFromBackdrop に理由を書いてある）。
    excludePanelFromBackdrop(this.backdrop, () => ({
      x: this.container.x,
      y: this.container.y,
      w: this.pw * this.container.scaleX,
      h: this.ph * this.container.scaleY,
    }));

    flushInput(scene); // 開いた直後の1タップを捨てない（→ inputReady.ts）
  }

  /** パネル座標系にテキストを置く。 */
  text(
    x: number,
    y: number,
    s: string,
    size: number,
    color: string,
    bold = false,
    parent: Phaser.GameObjects.Container = this.container,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, {
      fontFamily: "sans-serif",
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? "bold" : "normal",
    });
    parent.add(t);
    return t;
  }

  /** パネル座標系にボタンを置く（自動でパネルの子にする）。 */
  button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fn: () => void,
    opts: ButtonOptions = {},
    parent: Phaser.GameObjects.Container = this.container,
  ): Button {
    const btn = new Button(this.scene, x, y, w, h, label, fn, opts);
    parent.add(btn); // Container.add が display list から引き取る
    return btn;
  }

  /**
   * body を空にする（一覧の再描画用）。
   *
   * keepScroll＝true にすると、見ていた位置を保ったまま中身だけ入れ替える。
   * 一覧の中のボタンを押して描き直す画面（時間割など）では、
   * これをしないと押すたびに先頭へ戻ってしまう。
   */
  clearBody(keepScroll = false): void {
    const y = this.scrollY;
    this.body.removeAll(true);
    this.scrollTo(keepScroll ? y : 0);
  }

  // ---------------------------------------------------------------- 開け閉め
  //
  // 中身の多い画面は「閉じたら捨てる」のをやめて、隠して使い回す。
  // 作り直すと Text を100個近く作り直すことになり、開くたびに固まる。
  // Phaser は見えていないものを当たり判定から外すので、隠せば押せなくもなる。

  private shown = true;

  isOpen(): boolean {
    return this.shown;
  }

  setShown(v: boolean): void {
    this.shown = v;
    this.backdrop.setVisible(v);
    this.container.setVisible(v);
  }

  // ---------------------------------------------------------------- スクロール
  //
  // 情報量が多い画面（購入一覧・配置一覧など）は、パネルに収まりきらない。
  // body ごと上下に動かして、はみ出した分を読めるようにする。
  //  ・マウスホイール
  //  ・**窓の中ならどこを掴んでもスワイプできる**（行やボタンの上からでも動く）
  //  ・右端の ▲▼ ボタン（確実に動かしたいとき用）
  //
  // ボタンの上からスワイプしても押したことにならないのは、Button 側が
  // 「押した場所から大きくずれて離したら反応しない」ようにしているため。

  /**
   * スクロールを有効にすると、右端に ▲▼ ボタンのぶんの余白ができる。
   * 中身を並べる側はこの幅だけ右を空けること（ボタンが重ならないように）。
   */
  readonly scrollGutter = 34;

  private view: { top: number; height: number } | null = null;
  private contentH = 0;
  private scrollY = 0;
  private wheelHandler?: (p: unknown, o: unknown, dx: number, dy: number) => void;
  private downHandler?: (p: Phaser.Input.Pointer) => void;
  private moveHandler?: (p: Phaser.Input.Pointer) => void;
  private upHandler?: () => void;
  private maskGraphics?: Phaser.GameObjects.Graphics;

  /**
   * その画面座標がスクロールの窓の中か（スワイプを受け付ける範囲）。
   *
   * 中身に当たり判定を付けるときにも使うこと。マスクは**見た目を切るだけ**で
   * 当たり判定は切らないので、窓の外へスクロールした行がヘッダの裏で反応してしまう。
   */
  isInsideView(sx: number, sy: number): boolean {
    if (!this.view) return false;
    const s = this.container.scaleY || 1;
    const localX = (sx - this.container.x) / (this.container.scaleX || 1);
    const localY = (sy - this.container.y) / s;
    return localX >= 0 && localX <= this.pw && localY >= this.view.top && localY <= this.view.top + this.view.height;
  }

  /**
   * body をスクロールできるようにする。
   * viewTop/viewHeight はパネル座標での「見えている窓」の範囲。
   */
  enableScroll(viewTop: number, viewHeight: number): void {
    if (this.view) return;
    this.view = { top: viewTop, height: viewHeight };

    // 窓の外を隠す（パネルの外へ中身がはみ出さないように）
    const s = this.container.scaleX;
    const mg = this.scene.make.graphics({ x: 0, y: 0 }, false);
    mg.fillStyle(0xffffff, 1);
    mg.fillRect(this.container.x, this.container.y + viewTop * s, this.pw * s, viewHeight * s);
    this.body.setMask(mg.createGeometryMask());
    this.maskGraphics = mg;

    // ホイール
    this.wheelHandler = (_p, _o, _dx, dy): void => {
      if (!this.shown) return;
      this.scrollBy(dy > 0 ? 48 : -48);
    };
    this.scene.input.on("wheel", this.wheelHandler);

    // スワイプ（窓の中ならどこからでも）。
    // 行やボタンの上にゾーンを重ねると押せなくなるので、シーンの入力を直接見て
    // 「指が窓の中にあるか」で判断している。
    let last = 0;
    let active = false;
    this.downHandler = (ptr: Phaser.Input.Pointer): void => {
      const p = logicalPoint(ptr); // 指の座標は canvas の画素で届く（→ gfx/renderScale.ts）
      // 隠している間はシーンのタップに反応しない（使い回すので消えてはいない）
      if (!this.shown || !this.container.active || !this.isInsideView(p.x, p.y)) return;
      active = true;
      last = p.y;
    };
    this.moveHandler = (ptr: Phaser.Input.Pointer): void => {
      if (!active || !ptr.isDown || !this.shown || !this.container.active) return;
      const p = logicalPoint(ptr);
      this.scrollBy((last - p.y) / Math.max(0.2, this.container.scaleY));
      last = p.y;
    };
    this.upHandler = (): void => {
      active = false;
    };
    this.scene.input.on("pointerdown", this.downHandler);
    this.scene.input.on("pointermove", this.moveHandler);
    this.scene.input.on("pointerup", this.upHandler);

    // ▲▼ ボタン（スマホでの確実な手段）
    const bx = this.pw - 18;
    this.button(bx, viewTop + 18, 26, 30, "▲", () => this.scrollBy(-90), { color: 0x2c3e50, fontSize: 13 });
    this.button(bx, viewTop + viewHeight - 18, 26, 30, "▼", () => this.scrollBy(90), { color: 0x2c3e50, fontSize: 13 });
  }

  /** スクロールできる長さを教える（中身を描き直したあとに呼ぶ）。 */
  setContentHeight(h: number): void {
    this.contentH = h;
    this.scrollTo(this.scrollY);
  }

  scrollBy(dy: number): void {
    this.scrollTo(this.scrollY + dy);
  }

  /** 中身の y（スクロール窓の上端からの距離）が窓の上に来るまで飛ぶ（目次から章へ飛ぶのに使う）。 */
  jumpTo(y: number): void {
    this.scrollTo(y);
  }

  private scrollTo(y: number): void {
    if (!this.view) return;
    const max = Math.max(0, this.contentH - this.view.height);
    this.scrollY = Math.min(max, Math.max(0, y));
    this.body.y = -this.scrollY;
  }

  destroy(): void {
    // スクロール用にシーンへ登録したものを必ず片付ける（閉じたあとに動かない）
    if (this.wheelHandler) this.scene.input.off("wheel", this.wheelHandler);
    if (this.downHandler) this.scene.input.off("pointerdown", this.downHandler);
    if (this.moveHandler) this.scene.input.off("pointermove", this.moveHandler);
    if (this.upHandler) this.scene.input.off("pointerup", this.upHandler);
    this.body.clearMask(true);
    this.maskGraphics?.destroy();
    this.backdrop.destroy();
    this.container.destroy();
  }

  private requestClose(): void {
    this.onCloseRequest?.();
  }
}
