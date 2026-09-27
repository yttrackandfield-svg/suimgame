import Phaser from "phaser";

/**
 * 文字の見え方の既定値（フォントと描画のきめ細かさ）。
 *
 * 【なぜ文字がぼやけていたか】
 * このゲームは論理540×960で作り、Scale.FIT で端末の画面いっぱいに引き伸ばしている。
 * スマホの実画面は1080px前後あるので、**表示は約2倍に拡大**される。
 * Phaser の文字はいったん canvas に描いてから板に貼る絵なので、
 * 1倍の細かさで描いた文字を2倍に引き伸ばすことになり、輪郭がぼやける。
 * 画数の多い日本語ではこれがそのまま「読みにくさ」になる。
 *
 * そこで文字だけ **端末の画素密度に合わせた細かさで描く**（resolution）。
 * 表示上の大きさも位置も変わらず、輪郭だけがくっきりする。
 *
 * 【フォント】
 * "sans-serif" は端末まかせで、機種によっては線の細い書体が当たる。
 * 日本語の本文向けに読みやすい順で並べ、無ければ順に落ちるようにしてある。
 * （外部フォントは読み込まない。日本語のWebフォントは数MBあり、
 *   オフラインで動くこのゲームには重すぎるため。）
 */

/** 本文用のフォントの並び。端末にあるものが上から順に使われる。 */
export const FONT =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", ' +
  '"Yu Gothic UI", "Yu Gothic", Meiryo, "Droid Sans Japanese", system-ui, sans-serif';

/** 等幅（電光掲示板・タイム表示）。数字の桁が揃うものを優先する。 */
export const FONT_MONO = '"SF Mono", "Consolas", "Roboto Mono", "Noto Sans Mono CJK JP", monospace';

/**
 * 文字を描くきめ細かさ。1＝論理サイズのまま、2＝2倍の細かさで描いて縮めて出す。
 * 3倍以上にしても見た目はほとんど変わらないのに、文字1つあたりの canvas が
 * 9倍の面積になってスマホのメモリを食うので、2で止める。
 */
export function textResolution(): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(2, Math.max(1, Math.round(dpr)));
}

/**
 * すべての `scene.add.text(...)` に上の既定値を効かせる。
 * **ゲームを作る前に1回だけ呼ぶこと**（main.ts）。
 *
 * 各所の呼び出しを書き換えて回らずに済むよう、Phaser の text ファクトリを
 * 差し替えて、スタイルに手を入れてから本来の処理へ渡している。
 *  ・fontFamily 未指定／"sans-serif" → 上の FONT に差し替え
 *  ・fontFamily "monospace"          → FONT_MONO に差し替え
 *  ・resolution 未指定               → 端末に合わせた細かさ
 * 呼び出し側が別のフォントを明示していれば、それはそのまま尊重する。
 */
export function installTextDefaults(): void {
  const resolution = textResolution();

  const withDefaults = (
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.Types.GameObjects.Text.TextStyle => {
    const s: Phaser.Types.GameObjects.Text.TextStyle = { ...(style ?? {}) };
    if (!s.fontFamily || s.fontFamily === "sans-serif") s.fontFamily = FONT;
    else if (s.fontFamily === "monospace") s.fontFamily = FONT_MONO;
    if (s.resolution === undefined) s.resolution = resolution;
    return s;
  };

  const factory = Phaser.GameObjects.GameObjectFactory;
  factory.remove("text");
  factory.register(
    "text",
    function (
      this: Phaser.GameObjects.GameObjectFactory,
      x: number,
      y: number,
      text: string | string[],
      style?: Phaser.Types.GameObjects.Text.TextStyle,
    ) {
      return this.displayList.add(
        new Phaser.GameObjects.Text(this.scene, x, y, text, withDefaults(style)),
      ) as Phaser.GameObjects.Text;
    },
  );
}
