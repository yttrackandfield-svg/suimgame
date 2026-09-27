/**
 * 【向き・モーションの実機調査】開発ビルド限定のログ。
 *
 * 「うしろ歩きしている」「泳ぐ向きが逆」といった不具合は、絵とコードのどちらがずれて
 * いるのかを**推測で決めると外す**。URL に `&probe=walk` を付けると、実際に動いている
 * 人の「進行方向・反転したか・素材がどちらを向いているか」を1秒ごとにコンソールへ出す。
 *
 *   npx ... --enable-logging=stderr で起動して CONSOLE 行を読む
 *   http://127.0.0.1:5199/?dev=facility&full=1&warm=150&probe=walk
 *
 * 本番ビルドでは import.meta.env.DEV が false になり、まるごと消える。
 */

export interface ProbeRow {
  /** 人の種類（生徒／一般客／職員）。 */
  kind: string;
  /** 誰か（見た目タイプのID など）。 */
  who: string;
  /** いまの姿（walk / walkBack / swimFree …）。 */
  mode: string;
  /** 画面Xの進行方向（1＝右／-1＝左／0＝止まっている）。 */
  sdx: number;
  /** 画面Yの進行方向（1＝手前へ／-1＝奥へ）。 */
  sdy: number;
  /** 実際に絵を反転しているか。 */
  flip: boolean;
  /** 素材がどちらを向いて描かれているか（front / right / left）。 */
  art: string;
}

/** 有効な調査の種類（無効なら null）。 */
export function probeKind(): string | null {
  if (!import.meta.env.DEV) return null;
  if (typeof location === "undefined") return null;
  return new URLSearchParams(location.search).get("probe");
}

/**
 * 1行を「絵が進行方向を向いているか」まで判定して出す。
 *   art=front … 正面の絵。左右はどちらでも正しい
 *   art=right … 反転していなければ右向き
 *   art=left  … 反転していなければ左向き
 */
export function probeLog(tag: string, rows: ProbeRow[]): void {
  if (!import.meta.env.DEV) return;
  for (const r of rows) {
    const shown = r.art === "front" ? r.sdx : (r.art === "left" ? -1 : 1) * (r.flip ? -1 : 1);
    const verdict = r.sdx === 0 ? "-" : shown === r.sdx ? "OK" : "REVERSED";
    console.log(
      `[probe:${tag}] ${verdict} kind=${r.kind} who=${r.who} mode=${r.mode} ` +
        `move=(${r.sdx},${r.sdy}) flip=${r.flip} art=${r.art} shown=${shown}`,
    );
  }
}

/**
 * 【人の出入りの調査】`&probe=life` で、生徒が出てくる／帰る／消えるところを出す。
 * 「練習中なのに急に消える」のように、**いつ・なぜ消えたか**が要る不具合はこれで追う。
 */
export function probeLife(event: string, detail: string): void {
  if (!import.meta.env.DEV) return;
  console.log(`[probe:life] ${event} ${detail}`);
}

/**
 * 【疲れマークの調査】`&probe=tired` で、誰に印が出ているかを出す。
 */
export function probeTired(detail: string): void {
  if (!import.meta.env.DEV) return;
  console.log(`[probe:tired] ${detail}`);
}
