import Phaser from "phaser";
import { logicalPoint } from "../gfx/renderScale";

/** 長押しと判定するまでの時間（ms）。 */
export const LONG_PRESS_MS = 420;
/** 押している間にこれ以上動いたら「スワイプ」とみなして取り消す（px）。 */
export const LONG_PRESS_SLIP = 12;

/**
 * 一覧の行に長押しを付ける（押したまま LONG_PRESS_MS で onPress）。
 *
 * 【なぜタップではなく長押しか】一覧は指でなぞって送るので、タップで開く作りだと
 * 送っている途中に指が離れた場所で勝手に開く。押している間に LONG_PRESS_SLIP より
 * 指が動いたら取り消すので、「送る」と「開く」がはっきり分かれる。
 *
 * 【押した相手は発火した瞬間に聞き直す】who() は長押しが成立したときにも呼ぶ。
 * 行の表示物を使い回す一覧では、作ったときの選手を覚えておくと、
 * 並びが変わったあとに**別の選手が開く**ことになるため。
 */
export function attachLongPress<T>(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  who: () => T | null | undefined,
  onPress: (item: T) => void,
  /** 押し始めを受け付けるか（スクロールの窓の外で押したときは false を返す）。 */
  /** 押し始めてよいか。p は論理座標（540×960）。 */
  canStart: (p: { x: number; y: number }) => boolean = () => true,
  /**
   * 短く押して離したとき（＝長押しが成立しなかったとき）。
   * 長押しが出たあとには呼ばない＝**1回の操作で2つ起きない**。
   * 指が滑ったときも呼ばない（一覧を送ったつもりで開いてしまうため）。
   */
  onTap?: (item: T) => void,
): void {
  target.setInteractive({ useHandCursor: true });
  let timer: Phaser.Time.TimerEvent | undefined;
  let from = { x: 0, y: 0 };
  /** 長押しが成立した／指が滑った。どちらも「短いタップ」ではない。 */
  let fired = false;
  let slipped = false;
  const cancel = (): void => {
    timer?.remove();
    timer = undefined;
  };
  target.on("pointerdown", (p: Phaser.Input.Pointer) => {
    // 指の座標は canvas の画素で届くので、論理座標に直して比べる（→ gfx/renderScale.ts）
    from = logicalPoint(p);
    fired = false;
    slipped = false;
    if (!who() || !canStart(from)) return;
    cancel();
    timer = scene.time.delayedCall(LONG_PRESS_MS, () => {
      timer = undefined;
      fired = true;
      const item = who();
      if (item) onPress(item);
    });
  });
  target.on("pointermove", (p: Phaser.Input.Pointer) => {
    if (!timer) return;
    const q = logicalPoint(p);
    if (Math.abs(q.x - from.x) > LONG_PRESS_SLIP || Math.abs(q.y - from.y) > LONG_PRESS_SLIP) {
      slipped = true;
      cancel();
    }
  });
  target.on("pointerup", () => {
    // 待っているタイマーが残っている＝長押しに届く前に離した＝短いタップ
    const tapped = !!timer && !fired && !slipped;
    cancel();
    if (!tapped || !onTap) return;
    const item = who();
    if (item) onTap(item);
  });
  target.on("pointerout", () => {
    slipped = true;
    cancel();
  });
  // 一覧を描き直して行が消えたら、待っている長押しも捨てる
  target.once("destroy", cancel);
}
