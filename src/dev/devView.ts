/**
 * 開発中に「実機とおなじ絵」をすぐ出すための起動オプション（開発ビルド限定）。
 *
 * 見た目を直す作業は、直す → 見る、の往復が要る。ところが本編は
 * タイトル → データ選択 → 新規作成 と押さないと施設が出ないので、
 * ヘッドレスのブラウザで撮って確かめる、ということができなかった。
 *
 * URL の ? に指示を書けるようにして、その往復を1コマンドにする。
 *   ?dev=facility           … タイトルを飛ばして施設画面から始める
 *   &zoom=0.5               … 倍率を指定（省略時は本編の既定）
 *   &zoom=fit               … 敷地ぜんぶが入る倍率まで引く（全体の見え方の確認）
 *   &hud=0                  … HUD・フッターを隠して施設だけ見る
 *   &full=1                 … 部屋を全種類建てた状態にする（床の描き分けの確認用）
 *   &rot=1                  … 建っている部屋を置ける限り回しておく（回した部屋の見え方の確認）
 *   &warm=25                … 起動直後に25秒ぶん時間を進める（人が持ち場に着いた絵を撮る）
 *   &focus=gym              … その部屋を画面の中央に持ってくる
 *   &open=panel:senshu      … 選手の詳細パネルを開いた状態にする（レイアウト確認）
 *   &open=card:gakudo       … 選手カードを開いた状態にする
 *   &open=practice:ikuseiB  … 全体練習の画面を開いた状態にする（名簿つき）
 *   &open=roster:gakudo     … 名簿を開いた状態にする（:pinned で★だけの一覧）
 *   &open=retire:pro        … 1人を引退させて振り返りの画面を出す
 *   &open=place:gym         … その設備の配置モードを開いた状態にする
 *   &open=camp              … 合宿の行き先一覧（:alt で高地の設定つき選手選び）
 *   &open=events            … イベント一覧（:campaign でキャンペーンのタブ）
 *   &open=timetable / coach / shop / staff / research / system / settings / build
 *                           … その画面を開いた状態にする（文字の重なり・見切れの確認）
 *   &open=meet              … 男女を混ぜて大会の会場を開く（泳者の向きの確認。:kid で小学生）
 *   &open=world             … 世界大会の会場（相手が外国の選手。:long で1500m）
 *   &open=relay             … メドレーリレーの会場（:solo で自クラブ1人だけ）
 *   &open=confirm           … 主要大会の出場確認の一覧を開く（地区予選（高校）の2週間前にする）
 *   &open=entries           … 記録会に1件エントリーしてから大会画面を開く（エントリー中の並びの確認）
 *   &stats=95               … 開く選手の能力をそろえる（レーダーの見え方の確認）
 *   &open=promote:gakudo    … 昇格先を選ぶ画面を開いた状態にする
 *   &open=demote:ikuseiB    … スクールへ戻す確認を開いた状態にする
 *   &tired=0.2              … 全員の体力を2割にする（頭上の疲れマークの確認）
 *   &scroll=400             … 開いた画面を400pxスクロールしておく（下のほうの確認）
 *   &pin=3                  … 注目選手（★）を3人付けておく（HUD の5段目の確認）
 *   &leave=2                … 2人に「来月で退会」の予告を付けておく（名簿の印と案内の確認）
 *   &gwait=2                … 幼児2人を小1にして「学童に空きがない為退会」の予告を付けておく
 *   &rest=1                 … 開くクラス全員を休養させておく（休養中の見た目の確認）
 *
 * この指定で始めたときはセーブしない（遊んでいるデータを上書きしないため）。
 *
 * 本番ビルドでは import.meta.env.DEV が false になり、
 * この関数は常に null を返す（＝バンドルからも消える）。
 */

export interface DevView {
  /** 施設画面から始める。 */
  facility: boolean;
  /** 倍率。"fit" は敷地全体が入るところまで引く。 */
  zoom?: number | "fit";
  /** HUD・フッターを隠す。 */
  hideHud: boolean;
  /** 部屋を全種類建てた状態から始める。 */
  full: boolean;
  /** 建っている部屋を、置ける限り回した向き（縦横を入れ替えた向き）にしておく。 */
  rotate: boolean;
  /**
   * 起動直後に進める時間（秒）。
   * 生徒は入口から歩いて持ち場に向かうので、0 のままだと誰もいない絵しか撮れない。
   */
  warmSeconds: number;
  /** 画面の中央に持ってくる部屋の種類（省略時は入口）。 */
  focus: string | null;
  /**
   * 起動直後に開いておく画面（レイアウト確認用）。
   *   panel:<クラスID>  … 選手の詳細パネル（例 panel:senshu／クラス省略で選手）
   *   card:<クラスID>   … 選手カード
   * 文字の重なり・見切れは、実際に開いた絵を撮らないと分からないので用意してある。
   */
  open: string | null;
  /**
   * 全員の体力をこの割合にしてから始める（0-1）。負の値＝指定なし。
   * 疲れマークは体力が減らないと出ないので、その絵を撮るために用意してある。
   */
  tired: number;
  /** 開いた画面をこのぶんスクロールしておく（px）。下のほうのレイアウト確認用。 */
  scroll: number;
  /** 開く画面のクラス全員を休養させておく（休養中の見た目の確認）。 */
  rest: boolean;
  /** 注目選手（★）をその人数ぶん付けておく（HUD の札を撮るため）。 */
  pin: number;
  /**
   * 「来月で退会」の予告をその人数ぶん付けておく（名簿の印と「今月の一手」を撮るため）。
   * 本来は年度の変わり目にしか付かないので、待たずに撮れるようにする。
   */
  leave: number;
  /** 幼児をその人数ぶん小1にして、学童の空き待ち（空きがない為の退会予告）にしておく。 */
  gwait: number;
  /**
   * 開く選手の能力をこの値にしておく（0-100・負の値＝指定なし）。
   * レーダーチャートは能力が育たないと大きくならないので、
   * 「育ちきった選手の絵」を撮るために用意してある。
   */
  stats: number;
  /** 選手カードで開いておくタブ（0＝能力／1＝泳法／2＝成績／3＝特徴）。 */
  tab: number;
  /**
   * 選手カードで重ねておく相手（"first"＝入団時／"rival"＝ほかの選手）。
   * 比較の絵は、履歴か相手が無いと撮れないので用意してある。
   */
  cmp: string | null;
  /** 開く選手に、それらしい成長の履歴をでっち上げる（比較の絵を撮るため）。 */
  hist: boolean;
  /**
   * 空回しの**前に**、そのクラスへ人を移しておく（"ikuseiB:8" のように書く）。
   * 育成以上は開始時に誰も居ないので、これが無いと1日回しても検証できない。
   */
  stock: string | null;
  /** 全体練習を開いたあと、1人目の選手カードを開く（長押しの行き先の確認）。 */
  press: boolean;
  /** 開く選手の泳法の熟練度をこの値にする（0-999・負の値＝指定なし）。 */
  prof: number;
  /** 食堂・カフェの席に人を座らせる（賑わいの絵を撮るため）。 */
  dine: boolean;
}

export function devView(): DevView | null {
  if (!import.meta.env.DEV) return null;
  if (typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search);
  if (q.get("dev") !== "facility") return null;
  const raw = q.get("zoom");
  const zoom = raw === "fit" ? "fit" : raw ? Number(raw) : undefined;
  return {
    facility: true,
    zoom: typeof zoom === "number" && Number.isFinite(zoom) ? zoom : zoom === "fit" ? "fit" : undefined,
    hideHud: q.get("hud") === "0",
    full: q.get("full") === "1",
    rotate: q.get("rot") === "1",
    warmSeconds: Math.max(0, Math.min(300, Number(q.get("warm") ?? 0) || 0)),
    focus: q.get("focus"),
    open: q.get("open"),
    tired: q.has("tired") ? Math.max(0, Math.min(1, Number(q.get("tired")) || 0)) : -1,
    scroll: Math.max(0, Number(q.get("scroll") ?? 0) || 0),
    rest: q.get("rest") === "1",
    pin: Math.max(0, Math.min(3, Number(q.get("pin") ?? 0) || 0)),
    leave: Math.max(0, Math.min(9, Number(q.get("leave") ?? 0) || 0)),
    gwait: Math.max(0, Math.min(9, Number(q.get("gwait") ?? 0) || 0)),
    stats: q.has("stats") ? Math.max(0, Math.min(100, Number(q.get("stats")) || 0)) : -1,
    tab: Math.max(0, Math.min(3, Number(q.get("tab") ?? 0) || 0)),
    cmp: q.get("cmp"),
    hist: q.get("hist") === "1",
    stock: q.get("stock"),
    press: q.get("press") === "1",
    prof: q.has("prof") ? Math.max(0, Math.min(999, Number(q.get("prof")) || 0)) : -1,
    dine: q.get("dine") === "1",
  };
}
