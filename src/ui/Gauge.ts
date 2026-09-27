import Phaser from "phaser";

/**
 * ラベル付きの横バーゲージ。人気度・情熱の表示に使う。
 *
 * 色と字の大きさは theme で差し替えられる。既定は人気度の見た目
 *（値が上がるほど 青 → 緑 → 黄）。
 */
export interface GaugeTheme {
  /** 値の割合（0-1）から棒の色を決める。 */
  colorAt?: (ratio: number) => number;
  labelSize?: number;
  valueSize?: number;
  labelColor?: string;
  valueColor?: string;
  /** 値のうしろに「/最大」を付ける（情熱のように満タンが意味を持つゲージ用）。 */
  showMax?: boolean;
  /**
   * 値の横に出す文字を自前で作る（既定は数値そのまま）。
   * クラブの格のように「いくつ貯まったか」より **「次まであといくつか」** のほうが
   * 意味を持つゲージのために用意してある。
   */
  valueFormat?: (value: number, max: number) => string;
}
export class Gauge extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly track: Phaser.GameObjects.Graphics;
  private value = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly gw: number,
    private readonly gh: number,
    label: string,
    /** ゲージ満タンの値。上限の無い値（人気度）は setValue で目標を差し替えて使う。 */
    private maxValue = 100,
    private readonly theme: GaugeTheme = {},
  ) {
    super(scene, x, y);

    this.labelText = scene.add
      .text(0, 0, label, {
        fontFamily: "sans-serif",
        fontSize: `${theme.labelSize ?? 16}px`,
        color: theme.labelColor ?? "#ecf0f1",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.add(this.labelText);

    // トラック（背景）
    this.track = scene.add.graphics();
    this.add(this.track);

    this.fill = scene.add.graphics();
    this.add(this.fill);

    this.valueText = scene.add
      .text(0, 0, "0", {
        fontFamily: "monospace",
        fontSize: `${theme.valueSize ?? 16}px`,
        color: theme.valueColor ?? "#f7dc6f",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.add(this.valueText);

    this.layout();
    scene.add.existing(this);
    this.setValue(0);
  }

  /**
   * ラベルの幅に合わせて、棒と値の位置を置き直す。
   * ラベルを長さの違う文字に差し替えても棒が重ならないように、
   * **位置は必ずここ1か所で決める**（コンストラクタに直書きしない）。
   */
  private layout(): void {
    const x = this.labelText.width + (this.labelText.text === "" ? 0 : 12);
    this.track.clear();
    this.track.fillStyle(0x000000, 0.35);
    this.track.fillRoundedRect(x, -this.gh / 2, this.gw, this.gh, this.gh / 2);
    this.fill.setX(x);
    this.valueText.setX(x + this.gw + 10);
  }

  /**
   * ラベルを差し替える（クラブの格のように、途中で呼び名が変わるゲージ用）。
   * 同じ文字なら何もしない（毎フレーム呼んでも重くならない）。
   */
  setLabel(s: string, color?: string): void {
    if (this.labelText.text === s) {
      if (color) this.labelText.setColor(color);
      return;
    }
    this.labelText.setText(s);
    if (color) this.labelText.setColor(color);
    this.layout();
  }

  /**
   * 値を反映する。max を渡すと満タンの値も差し替える
   * （人気度のように上限が無い値は「次の目標」を満タンにして、貯まっていく棒にする）。
   */
  setValue(v: number, max?: number): void {
    if (max != null && max > 0) this.maxValue = max;
    this.value = Phaser.Math.Clamp(v, 0, this.maxValue);
    const ratio = this.value / this.maxValue;
    const fw = Math.max(this.gh, this.gw * ratio);

    this.fill.clear();
    // 値に応じて色を寒色→暖色へ（theme.colorAt で差し替えられる）
    const color = this.theme.colorAt
      ? this.theme.colorAt(ratio)
      : ratio < 0.4
        ? 0x3498db
        : ratio < 0.75
          ? 0x2ecc71
          : 0xf7dc6f;
    this.fill.fillStyle(color, 1);
    this.fill.fillRoundedRect(0, -this.gh / 2, fw, this.gh, this.gh / 2);

    const n = Math.floor(this.value);
    this.valueText.setText(
      this.theme.valueFormat
        ? this.theme.valueFormat(this.value, this.maxValue)
        : this.theme.showMax
          ? `${n}/${this.maxValue}`
          : String(Math.round(this.value)),
    );
  }
}
