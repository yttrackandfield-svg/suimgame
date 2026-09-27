import Phaser from "phaser";

/**
 * 日本語の折り返し。
 *
 * 【なぜ必要か】
 * Phaser の既定の折り返し（setWordWrapWidth / wordWrap）は **半角スペース区切り**で動く。
 * 日本語は分かち書きしないので、文全体が「1つの長い単語」とみなされ、
 * 指定した幅を完全に無視してどこまでも横へ伸びてしまう。
 * その結果、右側に置いたボタン（「建てる」など）の上に説明文がそのまま重なり、
 * どちらも読めなくなる。
 *
 * 【ここでやること】
 * 実際の文字幅を測りながら詰め込み、最低限の日本語組版のルールで折り返す。
 *  ・「◆500」「×1.05」のような英数字のまとまりは途中で割らない
 *  ・「、。）」など行頭に来てはいけない字は、少しはみ出しても前の行にぶら下げる
 *  ・「（「」など行末に来てはいけない字は次の行へ送る
 *
 * 【使い方】
 *   setJaWrap(text, 幅);
 *   text.setText("……");
 * 中身を入れたあとに呼んでも効く（その場で入れ直して折り返す）。
 * 幅を変えたいときは呼び直せばよい（同じ幅なら何もしない）。
 */

/** 行頭に置かない字（句読点・閉じ括弧・小書き仮名・長音）。 */
const NO_LINE_START = "、。，．・：；？！）」』】〉》〕｝］)]}!?,.:;ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮーゝゞヽヾ々";

/** 行末に置かない字（開き括弧）。 */
const NO_LINE_END = "（「『【〈《〔｛［([{";

/** これ以上割らない字（数値・単位・記号のまとまり）。 */
const ATOM = /[0-9A-Za-z+\-.,:/%×÷◆＋－]/;

/** 折り返し幅を Text 自身に覚えさせておく（コールバックから読む）。 */
interface WrapTarget extends Phaser.GameObjects.Text {
  jaWrapWidth?: number;
}

/**
 * 1行を「割ってよい単位」に分ける。
 * 英数字と記号の連なりは1つの塊にまとめ、それ以外（日本語）は1文字ずつ。
 */
function tokenize(line: string): string[] {
  const out: string[] = [];
  let atom = "";
  for (const ch of line) {
    if (ATOM.test(ch)) {
      atom += ch;
      continue;
    }
    if (atom !== "") {
      out.push(atom);
      atom = "";
    }
    out.push(ch);
  }
  if (atom !== "") out.push(atom);
  return out;
}

function trimTail(s: string): string {
  return s.replace(/[ 　]+$/, "");
}

/** 1段落を幅に収まる行の配列にする。 */
function wrapLine(line: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  let cur = "";
  /** この行にすでに1字ぶら下げたか（はみ出しは1字までに抑える）。 */
  let hung = false;

  /** いまの行を確定する。行末に置けない字は次の行の頭へ送る。 */
  const flush = (carry: string): string => {
    let done = cur;
    let lead = carry;
    while (done.length > 1 && NO_LINE_END.includes(done[done.length - 1])) {
      lead = done[done.length - 1] + lead;
      done = done.slice(0, -1);
    }
    out.push(trimTail(done));
    hung = false;
    return lead;
  };

  for (const tk of tokenize(line)) {
    // 行頭の空白は捨てる（折り返した先が1字ぶん下がって見えないように）
    if (cur === "" && (tk === " " || tk === "　")) continue;

    if (cur === "") {
      if (measure(tk) <= width) {
        cur = tk;
        continue;
      }
      // 1つの塊だけで幅を超える（長い英数字など）。仕方なく文字で割る。
      for (const ch of tk) {
        if (cur !== "" && measure(cur + ch) > width) {
          out.push(cur);
          cur = "";
        }
        cur += ch;
      }
      continue;
    }

    if (measure(cur + tk) <= width) {
      cur += tk;
      continue;
    }
    // 行頭に置けない字は前の行にぶら下げる。ただし1字まで
    // （何字も許すと、隣のボタンに届くほどはみ出すことがある）。
    if (!hung && NO_LINE_START.includes(tk)) {
      cur += tk;
      hung = true;
      continue;
    }
    cur = flush(tk);
  }
  if (cur !== "") out.push(trimTail(cur));
  return out;
}

/** Phaser の折り返しコールバック本体。 */
function jaWrapCallback(text: string, target: Phaser.GameObjects.Text): string {
  const width = (target as WrapTarget).jaWrapWidth ?? 0;
  if (width <= 0) return text;

  // updateText がフォントを context へ反映したあとに呼ばれるので、実寸で測れる
  const ctx = target.context;
  const measure = (s: string): number => ctx.measureText(s).width;

  const out: string[] = [];
  for (const para of text.split(/\r\n|\r|\n/)) {
    if (para === "") {
      out.push("");
      continue;
    }
    out.push(...wrapLine(para, width, measure));
  }
  return out.join("\n");
}

/**
 * この Text を「日本語でも必ず幅で折り返す」ようにする。
 * setText より先に呼ぶこと。同じ幅で呼び直しても何も起きない（描き直さない）。
 */
export function setJaWrap(t: Phaser.GameObjects.Text, width: number): Phaser.GameObjects.Text {
  const target = t as WrapTarget;
  if (target.jaWrapWidth === width) return t;
  target.jaWrapWidth = width;
  target.setWordWrapCallback(jaWrapCallback);
  /**
   * 【もう入っている文字にもその場で効かせる】
   *
   * 折り返しは Phaser が「中身が変わったとき」に掛けるので、
   * 文字を入れたあとに setJaWrap を呼んだ場合、**一度も折り返されない**まま残る
   *（既定の折り返しも働かないので、パネルの外まで伸びて隣の文字やボタンに重なる）。
   * 呼ぶ順番を間違えただけで画面が壊れるのは危ないので、ここで入れ直して必ず掛ける。
   */
  if (t.text) t.setText(t.text);
  return t;
}

/**
 * 折り返したときの高さを、パネルを作る**前に**測る。
 *
 * 【なぜ要るか】モーダルの高さ（Modal の `height`）はコンストラクタで決まり、あとから変えられない。
 * 説明文の行数を「だいたいこれくらい」と決め打ちで見込むと、
 * データを書き換えた日に1行増えて、下の行やボタンに重なる（実際に寮の説明で起きた）。
 * 中身から測ってから組み立てれば、説明文が何行になっても崩れない。
 *
 * 使い捨ての Text を1つ作って測り、すぐ捨てる。`Modal.text` と同じ書式で作ること。
 */
export function measureJaHeight(
  scene: Phaser.Scene,
  s: string,
  size: number,
  width: number,
  bold = false,
): number {
  const t = scene.add.text(0, 0, "", {
    fontFamily: "sans-serif",
    fontSize: `${size}px`,
    fontStyle: bold ? "bold" : "normal",
  });
  setJaWrap(t, width);
  t.setText(s);
  const h = t.height;
  t.destroy();
  return h;
}
