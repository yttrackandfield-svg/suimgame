import Phaser from "phaser";
import { flushInput } from "./inputReady";
import { logicalDistance } from "../gfx/renderScale";

export interface ButtonOptions {
  color?: number;
  hoverColor?: number;
  selectedColor?: number;
  fontSize?: number;
  /** 当たり判定を上下左右へ広げる量（px）。指で押しやすくする。 */
  hitPadding?: number;
}

/** 当たり判定の既定の余白。隣のボタンと重ならない範囲で少しだけ広げる。 */
const DEFAULT_HIT_PADDING = 3;

/**
 * コンテナに当たり判定を付ける。矩形は**中身と同じローカル座標**で書く。
 *
 * 【なぜ専用の関数が要るか】
 * Phaser はコンテナの当たり判定を見るとき、ローカル座標に
 * displayOrigin（＝コンテナの幅・高さの**半分**）を足してから矩形と比べる。
 * そのぶんを見込まずに「見た目どおり」の矩形を渡すと、当たり判定だけが
 * 左上へ半分ずれる。ボタンでいうと、**押せるのは左半分だけになり、
 * 右半分を押すと隣のボタンの（同じくずれた）判定に入って隣が反応する**。
 * ここで足し戻しておけば、見た目と押せる場所が一致する。
 */
export function setLocalHitArea(
  obj: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  obj.setInteractive(
    new Phaser.Geom.Rectangle(x + obj.displayOriginX, y + obj.displayOriginY, w, h),
    Phaser.Geom.Rectangle.Contains,
  );
}

/**
 * 押した場所からこれ以上ずれて離したら、「押した」ではなく「なぞった」とみなす（px）。
 * 一覧をスワイプでスクロールしたときに、指の下のボタンが反応しないようにするための境目。
 *
 * ここは画面の論理座標（540×960）で測る。実機ではこれが2倍前後に引き伸ばされるので、
 * 12pxだと実寸で3mm程度しかなく、**ふつうに押しただけの指のブレで反応しなくなる**。
 * 一覧のスワイプ送りは40px以上動かしたときだけなので、その手前まで広げてある。
 */
const DRAG_CANCEL_PX = 26;

/**
 * 角丸の押しボタン（Phaser コンテナ）。ホバーで色変化、押下で軽く沈む。
 * setEnabled で無効化、setLabel でラベル更新に対応。
 *
 * 【スマホでの取りこぼし対策】
 * Phaser は「指を離した場所」のオブジェクトに pointerup を出す。そのため素直に
 * pointerup で発火すると、指が数pxずれただけで **隣のボタンが反応**してしまい、
 * どのボタンからも外れて離すと **何も起きない**。
 * ここでは「押し始めたのが自分自身のときだけ発火する」ようにして、
 * 押した対象と反応する対象を必ず一致させている。
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private baseColor: number;
  private readonly normalColor: number;
  private readonly hoverColor: number;
  private readonly selectedColor: number;
  private enabled = true;
  private selected = false;
  private readonly baseFontSize: number;
  /** このボタンの上で押し始めたか。 */
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bw: number,
    private readonly bh: number,
    label: string,
    private readonly onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);

    this.normalColor = opts.color ?? 0x2c3e50;
    this.baseColor = this.normalColor;
    this.hoverColor = opts.hoverColor ?? 0x3d5a80;
    this.selectedColor = opts.selectedColor ?? 0x2e7d5b;

    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.paint(this.baseColor);

    this.baseFontSize = opts.fontSize ?? 18;
    this.label = scene.add
      .text(0, 0, label, {
        fontFamily: "sans-serif",
        fontSize: `${this.baseFontSize}px`,
        color: "#ecf0f1",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    this.add(this.label);
    this.fitLabel();

    this.setSize(bw, bh);
    // 見た目より少しだけ広く取る（指の当たりを拾いやすくするため）。
    // 中身は中心（0,0）まわりに置いてあるので、矩形も中心基準で書く。
    const pad = opts.hitPadding ?? DEFAULT_HIT_PADDING;
    setLocalHitArea(this, -bw / 2 - pad, -bh / 2 - pad, bw + pad * 2, bh + pad * 2);

    this.on("pointerover", (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.paint(this.hoverColor);
      // タッチのときはカーソルを触らない（毎回 CSS を書き換えることになるため）
      if (!p.wasTouch) scene.input.setDefaultCursor("pointer");
    });
    this.on("pointerout", (p: Phaser.Input.Pointer) => {
      // 指がボタンの外へ動いたら、その押下はキャンセル扱いにする
      this.pressed = false;
      if (!this.enabled) return;
      this.paint(this.baseColor);
      this.setScale(1);
      if (!p.wasTouch) scene.input.setDefaultCursor("default");
    });
    this.on("pointerdown", () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.setScale(0.97); // 押した手応え（指を離す前に返す）
    });
    this.on("pointerup", (p: Phaser.Input.Pointer) => {
      const wasPressed = this.pressed;
      this.pressed = false;
      if (!this.enabled) return;
      this.setScale(1);
      this.paint(this.baseColor);
      if (!wasPressed) return; // 押し始めたのが別の場所（誤爆を防ぐ）
      // 指が大きく動いていたら「なぞった」とみなして反応しない。
      // 一覧をスワイプでスクロールしたときに、指の下のボタンが押されないようにするため。
      if (logicalDistance(p) > DRAG_CANCEL_PX) return; // 論理px で比べる（→ gfx/renderScale.ts）
      this.onClick();
    });

    scene.add.existing(this);
    // 作った直後から押せるようにする（→ inputReady.ts）。
    // これが無いと、画面を開いた最初の1タップが捨てられて「間を置かないと押せない」。
    flushInput(scene);
  }

  setLabel(text: string): this {
    this.label.setText(text);
    this.fitLabel();
    return this;
  }

  setEnabled(v: boolean): this {
    if (this.enabled === v) return this;
    this.enabled = v;
    this.pressed = false;
    this.setAlpha(v ? 1 : 0.4);
    this.paint(this.baseColor);
    this.setScale(1);
    return this;
  }

  /** 選択状態（プラン選択・タブなどで使う）。選択中は selectedColor で塗る。 */
  setSelected(v: boolean): this {
    this.selected = v;
    this.baseColor = v ? this.selectedColor : this.normalColor;
    this.paint(this.baseColor);
    return this;
  }

  isSelected(): boolean {
    return this.selected;
  }

  /**
   * ラベルがボタンからはみ出さないよう、収まるまで文字を少しだけ小さくする。
   *
   * ラベルは中央ぞろえなので、はみ出すと左右にあふれて隣の文字と重なる
   * （日本語はフォントによって字幅が変わるので、指定サイズのままだと収まる保証がない）。
   */
  private fitLabel(): void {
    const maxW = this.bw - 12;
    let size = this.baseFontSize;
    this.label.setFontSize(size);
    while (this.label.width > maxW && size > 8) {
      size -= 1;
      this.label.setFontSize(size);
    }
  }

  private paint(color: number): void {
    const { bw: w, bh: h } = this;
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.25); // 影
    this.bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, 8);
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    this.bg.lineStyle(2, 0xffffff, 0.22);
    this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
  }
}

/**
 * 暗幕の「パネルの内側」を当たり判定から外す。
 *
 * 【なぜ必要か】Phaser は当たり判定の優先順位を**カメラの描画リストの位置**で決める。
 * コンテナの中に入れた子（＝モーダルのボタン）は描画リストに直接載っていないので
 * `indexOf` が -1 になり、**常にいちばん下**として扱われる。
 * 画面いっぱいの暗幕（トップレベルの矩形）と重なると、暗幕がタップを全部さらってしまい、
 * パネルの中のボタンが一切反応しなくなる。
 *
 * そこで暗幕の当たり判定から**パネルの矩形を抜く**。
 * 外側は暗幕が受け取り（＝タップで閉じる）、内側は素通りしてボタンに届く。
 *
 * @param rect パネルの位置と大きさ（画面座標）を返す関数。動かしたり縮めたりしても追従できる。
 */
export function excludePanelFromBackdrop(
  backdrop: Phaser.GameObjects.Rectangle,
  rect: () => { x: number; y: number; w: number; h: number },
): void {
  const input = backdrop.input;
  if (!input) return; // まだ setInteractive していない（呼ぶ順番の間違い）
  // すでにある当たり判定はそのままに、「中か外か」の判定だけ差し替える。
  // setInteractive を呼び直すと、付けてあるイベントの扱いが変わってしまう。
  input.hitAreaCallback = (_area: unknown, x: number, y: number): boolean => {
    // x,y は暗幕のローカル座標（原点は中央ぞろえ）。画面座標に直してから外か中かを見る
    const sx = backdrop.x - backdrop.width * backdrop.originX + x;
    const sy = backdrop.y - backdrop.height * backdrop.originY + y;
    const r = rect();
    const inside = sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
    return !inside;
  };
}

/**
 * モーダルの暗幕を「押して離す」で閉じるようにする。
 *
 * pointerdown で閉じると、ボタンのすぐ外に指が着いただけで画面が消えてしまい、
 * 「押したのに反応しなかった」と感じる原因になる。
 * 暗幕の上で押し始めて、暗幕の上で離したときだけ閉じる。
 */
export function closeOnBackdropTap(
  backdrop: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform,
  onClose: () => void,
): void {
  let armed = false;
  backdrop.on("pointerdown", () => {
    armed = true;
  });
  backdrop.on("pointerout", () => {
    armed = false;
  });
  backdrop.on("pointerup", () => {
    if (!armed) return;
    armed = false;
    onClose();
  });
}
