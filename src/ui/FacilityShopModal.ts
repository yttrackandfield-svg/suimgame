import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, gemsText } from "../config";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { setJaWrap } from "./textWrap";
import { BATHING, DORM, EQUIPMENT, RECOVERY_ROOM } from "../config/balance";
import {
  categoryLimit,
  equipmentDef,
  gradeEffect,
  gradeLabel,
  hasGrade,
  MAX_GRADE,
  ROOM_GROUPS,
  ROOM_ORDER,
  stationsOf,
  type EquipmentKind,
} from "../sim/equipment";
import { gearSpecsFor } from "../iso/facility";
import { STAT_LABEL } from "../sim/student";
import type { GameState } from "../sim/state";

/**
 * 設備の購入。**器具は部屋に同梱**なので、買うのは部屋とそのグレードだけ。
 *
 *  タブ1「部屋」    … プール／スタジオ／筋トレルーム／マッサージエリア／会議室／コーチ室 ほか
 *  タブ2「グレードアップ」… 建てた部屋の小→中→大（器具は部屋に同梱なので、ここで中身が増える）
 *
 * 器具は「どの部屋に置くか」が決まっていて、その部屋の空き枠がないと買っても使えない。
 * 空きが無いときは行に理由を出し、部屋の増設を促す。
 *
 * レイアウトの方針（スマホ縦画面）：
 *  ・1行のなかで文字とボタンの領域を左右に分け、絶対に重ならない幅で折り返す
 *  ・買えない理由はボタンの外（行の左下）に出す
 *  ・行が増えても読めるように、一覧部分はスクロールする
 */

export interface FacilityShopCallbacks {
  onChanged: () => void; // 購入・撤去でクラブの状態が変わった
  /** 「配置」へ（買った器具の置き場所を決める画面）。 */
  /** 「建設モード」へ（部屋の配置と道の敷設）。 */
  onBuild: () => void;
  /** 「購入して配置する」→ 配置モードへ。確定するまで課金しない。 */
  onPlaceNew: (kind: EquipmentKind) => void;
  onClose: () => void;
}

type Tab = "room" | "grade";

/**
 * 1行ぶんの部品。作り直さず使い回す。
 * onBuy/onSell はボタンを作り直さずに差し替えられるよう、参照で持っておく。
 */
interface ShopRowView {
  rect: Phaser.GameObjects.Rectangle;
  divider: Phaser.GameObjects.Graphics;
  heading: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  owned: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
  facts: Phaser.GameObjects.Text;
  reason: Phaser.GameObjects.Text;
  buy: Button;
  sell: Button;
  onBuy: (() => void) | null;
  onSell: (() => void) | null;
}

interface Row {
  label: string;
  note: string;
  owned: number;
  facts: { text: string; color: string }[];
  canBuy: { ok: boolean; reason?: string };
  buyLabel: string;
  sellLabel: string;
  onBuy: () => void;
  onSell: () => void;
  /** 見出しとして差し込む行（部屋ごとの区切り）。 */
  heading?: string;
}

/**
 * 1行の最低の高さ。「建てる」「撤去」の2つのボタンが縦に並ぶぶんは必ず要る。
 * 実際の高さは説明文・効果・警告の行数に合わせて updateRow が伸ばす
 * （固定にすると、説明が長い設備で文字がはみ出してボタンに重なる）。
 */
const MIN_ROW_H = 112;
const HEAD_H = 26;
const BTN_W = 112;
const BTN_COL = BTN_W + 24;
/** 行のなかで文字を書き始める位置。 */
const ROW_LEFT = 34;

export class FacilityShopModal {
  private readonly modal: Modal;
  private readonly width: number;
  private readonly height: number;
  private readonly listTop: number;
  private readonly listH: number;
  private readonly tabBtns: Button[] = [];
  private tab: Tab = "room";
  /** 行の部品の使い回し用プール。 */
  private readonly views: ShopRowView[] = [];
  private money!: Phaser.GameObjects.Text;
  private summary!: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly cb: FacilityShopCallbacks,
  ) {
    this.width = Math.min(516, GAME_WIDTH - 20);
    this.height = Math.min(880, GAME_HEIGHT - 40);

    this.modal = new Modal(
      scene,
      {
        width: this.width,
        height: this.height,
        title: "設備",
        subtitle: "まず「部屋」を建て、その中に「器具」を置いて使う。買い増すほど値段は上がる。",
        depth: 2500,
      },
      () => cb.onClose(),
    );

    const top = this.modal.contentTop;
    this.money = this.modal.text(20, top, "", 13, "#f9e79f", true);
    this.summary = this.modal.text(20, top + 20, "", 12, "#aed6f1");
    setJaWrap(this.summary, this.width - 40);

    const tabs: [Tab, string][] = [
      ["room", "部屋"],
      ["grade", "グレードアップ"],
    ];
    const tw = (this.width - 40 - 12) / 3;
    tabs.forEach(([id, label], i) => {
      this.tabBtns.push(
        this.modal.button(20 + tw / 2 + i * (tw + 6), top + 78, tw, 38, label, () => this.setTab(id), {
          fontSize: 13,
        }),
      );
    });

    this.listTop = top + 102;
    this.listH = this.height - this.listTop - 66;

    // 下段は2つ：建設モード（部屋と道）／閉じる
    const thirdW = (this.width - 56 - 8) / 2;
    this.modal.button(28 + thirdW / 2, this.height - 30, thirdW, 44, "建設モード", () => cb.onBuild(), {
      color: 0x8e6a2f,
      hoverColor: 0xb8893c,
      fontSize: 14,
    });
    this.modal.button(
      28 + (thirdW + 8) * 2 + thirdW / 2,
      this.height - 30,
      thirdW,
      44,
      "閉じる",
      () => cb.onClose(),
      { color: 0x394a5c, hoverColor: 0x4a6076, fontSize: 15 },
    );

    this.modal.enableScroll(this.listTop, this.listH);
    this.setTab("room");
    this.modal.setShown(false); // 作るだけ作って、開かれるまでは隠しておく
  }

  isOpen(): boolean {
    return this.modal.isOpen();
  }

  /** 【開発の見た目確認】一覧を下までスクロールした絵を撮る（?open=shop&scroll=…）。 */
  devScrollBy(dy: number): void {
    this.modal.scrollBy(dy);
  }

  /** 開く。閉じている間に建った部屋や増えた資金を反映してから出す。 */
  show(): void {
    this.modal.setShown(true);
    this.render();
  }

  hide(): void {
    this.modal.setShown(false);
  }

  destroy(): void {
    this.modal.destroy();
  }

  // ---------------------------------------------------------------- タブ

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.tabBtns.forEach((b, i) => b.setSelected(i === ["room", "grade"].indexOf(tab)));
    this.render();
  }

  // ---------------------------------------------------------------- 行の定義

  /** 部屋（箱）の行。 */
  private roomRows(): Row[] {
    /**
     * 役割ごとの見出しを差し込む（→ equipment.ts の ROOM_GROUPS）。
     * まとまりの先頭の行にだけ `heading` を付ければ、描画側が区切りを出す。
     */
    const headingOf = new Map<string, string>();
    for (const g of ROOM_GROUPS) {
      if (g.kinds.length > 0) headingOf.set(g.kinds[0], g.label);
    }
    return ROOM_ORDER.map((kind) => {
      const def = equipmentDef(kind);
      const cost = this.state.equipmentCost(kind);
      const facts: Row["facts"] = [
        { text: `${def.size.w}×${def.size.h}マス`, color: "#f7dc6f" },
        { text: `◆${gemsText(cost)}`, color: "#f9e79f" },
        { text: `維持 ◆${gemsText(def.upkeep)}/月`, color: "#e59866" },
      ];
      if (def.lanes > 0) facts.push({ text: `1コマ +${def.lanes * EQUIPMENT.perLane}人`, color: "#aed6f1" });
      if (kind === "dorm") facts.push({ text: `入寮 +${DORM.capacityPerRoom}人`, color: "#aed6f1" });
      if (kind === "entrance") facts.push({ text: "外周の道路に面して置く", color: "#aed6f1" });
      // 器具は部屋に同梱。買った時点で中身が入っていることを行に出す
      if (hasGrade(kind)) {
        facts.push({ text: "器具こみ（小→中→大に拡張できる）", color: "#a78bfa" });
      }
      // 【温浴施設】グレードが無いぶん、効果と収入を数字ではっきり出す
      const bath = BATHING.rooms[kind];
      if (bath) {
        facts.push({ text: `体力 +${Math.round(bath.energy * 100)}%`, color: "#2ecc71" });
        if (bath.condition > 0) {
          facts.push({
            text: `調子 +${bath.condition}（${Math.round(bath.conditionChance * 100)}%の確率）`,
            color: "#5dade2",
          });
        }
        facts.push({ text: `定員 ${RECOVERY_ROOM.seatsPerRoom}人`, color: "#aed6f1" });
        facts.push({ text: `一般客 ◆${bath.guestFee}/人`, color: "#f7dc6f" });
        if (kind === "openair") {
          facts.push({
            text:
              `サウナの${BATHING.synergy.distance}マス以内に建てると「ととのう」` +
              `（調子 ×${BATHING.synergy.conditionMult}）`,
            color: "#a78bfa",
          });
        }
      }
      if (kind === "meeting") facts.push({ text: "研究ができる", color: "#a78bfa" });
      if (kind === "coachroom") {
        facts.push({ text: `コーチ +${EQUIPMENT.coachesPerCoachRoom}人`, color: "#aed6f1" });
      }
      if (def.popularity > 0) facts.push({ text: `人気 +${def.popularity}/月`, color: "#2ecc71" });

      // 【投資の効果を数字で見せる】建てる前と後で、練習の伸びがどれだけ変わるか。
      // スタジオ＝フォーム／筋トレルーム＝スピード（どちらも中学生以上に効く）。
      if (def.boosts) {
        const before = this.state.roomTrainMult(kind);
        const after = this.state.roomTrainMultIfBuilt(kind);
        facts.push({
          text:
            after > before
              ? `${STAT_LABEL[def.boosts]}の伸び ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`
              : `${STAT_LABEL[def.boosts]}の伸び ${Math.round(before * 100)}%（これ以上は上がらない）`,
          color: after > before ? "#2ecc71" : "#95a6b8",
        });
      }

      return {
        heading: headingOf.get(kind),
        label: def.label,
        note: def.note,
        owned: this.state.equipmentCount(kind),
        facts,
        // 解放条件（クラブの格・在籍）も含めて判定する（→ UNLOCK）
        canBuy: this.state.canPurchase(kind),
        // 押すと配置モードへ入る。費用は facts に ◆ で出しているので、ボタンは短く。
        buyLabel: "建てる",
        sellLabel: "撤去",
        // 押した時点では課金しない。配置モードで「ここに設置」を押して初めて支払う。
        onBuy: () => this.cb.onPlaceNew(kind),
        onSell: () => {
          const item = [...this.state.equipment].reverse().find((e) => e.kind === kind);
          if (!item) return;
          const r = this.state.sellEquipment(item);
          if (!r.ok) {
            this.flash(r.reason ?? "撤去できない");
            return;
          }
          this.after();
        },
      };
    });
  }

  /**
   * グレードアップの行（建てた部屋を1つずつ出す）。
   *
   * 器具は部屋に同梱なので、ここが「中身を増やす」唯一の場所になる。
   * 上げると何がどう変わるかを、数字で並べて見せる。
   */
  private gradeRows(): Row[] {
    const rooms = this.state.gradableRooms();
    if (rooms.length === 0) {
      return [
        {
          label: "グレードを上げられる部屋がない",
          note: "筋トレルーム・スタジオ・マッサージエリアを建てると、ここでグレードを上げられる。",
          owned: 0,
          facts: [],
          canBuy: { ok: false, reason: "まだ建てていない" },
          buyLabel: "—",
          sellLabel: "",
          onBuy: () => undefined,
          onSell: () => undefined,
        },
      ];
    }
    return rooms.map((room, i) => {
      const def = equipmentDef(room.kind);
      const grade = this.state.gradeOfRoom(room);
      const next = Math.min(MAX_GRADE, grade + 1);
      const cost = this.state.upgradeRoomCost(room);
      const can = this.state.canUpgradeRoom(room);
      const facts: Row["facts"] = [
        { text: `いま ${gradeLabel(grade)}`, color: "#f7dc6f" },
        { text: `器具 ${gearSpecsFor(room.kind, grade).length}点`, color: "#aed6f1" },
        { text: `同時に ${stationsOf(room)}人`, color: "#aed6f1" },
        { text: `維持 ◆${gemsText(this.state.roomUpkeep(room))}/月`, color: "#e59866" },
      ];
      if (grade < MAX_GRADE) {
        facts.push({ text: `◆${gemsText(cost)} で ${gradeLabel(next)} へ`, color: "#f9e79f" });
        facts.push({
          text:
            `器具 ${gearSpecsFor(room.kind, grade).length} → ${gearSpecsFor(room.kind, next).length}点　` +
            `同時 ${stationsOf(room)} → ${stationsOf({ ...room, grade: next })}人　` +
            `効果 ${Math.round(gradeEffect(grade) * 100)}% → ${Math.round(gradeEffect(next) * 100)}%`,
          color: "#2ecc71",
        });
      } else {
        facts.push({ text: "最大グレード", color: "#95a6b8" });
      }
      return {
        label: `${def.label}${rooms.filter((r) => r.kind === room.kind).length > 1 ? ` ${i + 1}` : ""}　［${gradeLabel(grade)}］`,
        note: def.note,
        owned: grade,
        facts,
        canBuy: can,
        buyLabel: grade < MAX_GRADE ? `${gradeLabel(next)}にする` : "最大",
        sellLabel: "",
        onBuy: () => {
          const r = this.state.upgradeRoom(room);
          if (!r.ok) {
            this.flash(r.reason ?? "上げられない");
            return;
          }
          this.after();
        },
        onSell: () => undefined,
      };
    });
  }

  private after(): void {
    this.render();
    this.cb.onChanged();
  }

  // ---------------------------------------------------------------- 描画

  private render(): void {
    // 行は使い回すので body は消さない（消すと毎回作り直しになって重い）

    const fin = this.state.monthlyFinance();
    this.money.setText(`所持 ◆${gemsText(this.state.gems)}　　月の収支 ${fin.net >= 0 ? "+" : ""}${gemsText(fin.net)}`);
    this.money.setColor(fin.net >= 0 ? "#f9e79f" : "#e74c3c");

    if (this.tab === "room") {
      const school = this.state.students.youji.length + this.state.students.gakudo.length;
      const stored = this.state.unplacedEquipment().length;
      const stranded = this.state.strandedRooms().length;
      const land = this.state.landUsage();
      let note = "";
      if (stored > 0) note = `　⚠ 未配置 ${stored}件（建設モードで置こう）`;
      else if (stranded > 0) note = `　⚠ 出入りできない部屋 ${stranded}件`;
      this.summary.setText(
        `部屋 ${this.state.equipmentTotal()}/${categoryLimit("facility")}　` +
          `練習枠 ${this.state.trainingSlots()}人　スクール ${school}人\n` +
          `敷地 ${land.rooms}/${land.total}マス使用${note}`,
      );
      this.summary.setColor(stored > 0 || stranded > 0 ? "#e67e22" : "#aed6f1");
    } else if (this.tab === "grade") {
      const rooms = this.state.gradableRooms();
      this.summary.setText(
        rooms.length === 0
          ? "グレードを上げられる部屋がまだない（筋トレルーム・スタジオ・マッサージエリアを建てよう）。"
          : "器具は部屋に同梱。グレードを上げると器具が増え、同時に使える人数と練習効果が上がる（維持費も上がる）。",
      );
      this.summary.setColor(rooms.length === 0 ? "#e67e22" : "#aed6f1");
    }

    const rows = this.tab === "room" ? this.roomRows() : this.gradeRows();

    // 行の部品は作り直さず使い回す（毎回100個以上の文字を作ると、スマホでは開いた瞬間に固まる）
    let y = this.listTop + 6;
    rows.forEach((row, i) => {
      const view = this.viewAt(i);
      if (row.heading) {
        view.heading.setText(row.heading).setPosition(30, y + 4).setVisible(true);
        y += HEAD_H;
      } else {
        view.heading.setVisible(false);
      }
      // 行の高さは中身しだい（説明が長い設備ほど高くなる）
      y += this.updateRow(view, row, y);
    });
    // 余った行は隠す
    for (let i = rows.length; i < this.views.length; i++) this.hideRow(this.views[i]);
    this.modal.setContentHeight(y + 12);
  }

  /**
   * 行の部品を1つ作る（必要になったときに1回だけ）。
   *
   * 中身は updateRow で差し替える。毎回作り直すと、1画面ぶんで100個以上の
   * 文字（Text）を生成することになり、スマホでは開いた瞬間に固まる。
   * 効果の並び（マス数・費用・維持費…）は1つの文字にまとめてある。
   */
  private makeRow(): ShopRowView {
    const gutter = this.modal.scrollGutter;
    const rowW = this.width - 44 - gutter;

    const rect = this.scene.add
      .rectangle((this.width - gutter) / 2, 0, rowW, MIN_ROW_H - 12, 0x172636, 1)
      .setStrokeStyle(2, 0x2a3d4f, 1);
    this.modal.body.add(rect);

    const divider = this.scene.add.graphics();
    this.modal.body.add(divider);

    const mk = (size: number, color: string, bold = false): Phaser.GameObjects.Text => {
      const t = this.scene.add
        .text(0, 0, "", {
          fontFamily: "sans-serif",
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
        })
        .setOrigin(0, 0);
      this.modal.body.add(t);
      return t;
    };

    // 折り返し幅は updateRow で入れる（「所有 n」の有無で説明文の幅が変わるため）。
    // 日本語はスペースで区切らないので、Phaser 既定の折り返しでは止まらない → setJaWrap を使う。
    // 見出し（「スタジオに置く　空き 2 / 4 枠」）は行の幅いっぱいを使ってよい
    const heading = setJaWrap(mk(14, "#f7dc6f", true), rowW - 24);
    const title = setJaWrap(mk(17, "#e8f0f6", true), this.textWidth());
    const owned = mk(13, "#2ecc71", true);
    const note = setJaWrap(mk(12, "#cfd8e0"), this.textWidth());
    const facts = setJaWrap(mk(12, "#aed6f1", true), this.textWidth());
    const reason = setJaWrap(mk(12, "#e67e22", true), this.textWidth());

    const bx = this.width - gutter - 22 - BTN_W / 2;
    const view: ShopRowView = {
      rect,
      divider,
      heading,
      title,
      owned,
      note,
      facts,
      reason,
      buy: null as unknown as Button,
      sell: null as unknown as Button,
      onBuy: null,
      onSell: null,
    };
    view.buy = new Button(this.scene, bx, 0, BTN_W, 40, "", () => view.onBuy?.(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 16,
    });
    this.modal.body.add(view.buy);
    view.sell = new Button(this.scene, bx, 0, BTN_W, 32, "", () => view.onSell?.(), {
      color: 0x5a3a3a,
      hoverColor: 0x7f4a4a,
      fontSize: 14,
    });
    this.modal.body.add(view.sell);
    return view;
  }

  /** i 番目の行（足りなければ作る）。 */
  private viewAt(i: number): ShopRowView {
    while (this.views.length <= i) this.views.push(this.makeRow());
    return this.views[i];
  }

  private hideRow(v: ShopRowView): void {
    for (const o of [v.rect, v.divider, v.heading, v.title, v.owned, v.note, v.facts, v.reason, v.buy, v.sell]) {
      o.setVisible(false);
    }
  }

  /**
   * 行の左半分（文字を置いてよい幅）。
   * ここから右は仕切り線とボタンの領域なので、文字は絶対に入れないこと。
   */
  private textWidth(): number {
    return this.width - ROW_LEFT - BTN_COL - this.modal.scrollGutter - 20;
  }

  /**
   * 行の中身を差し替えて、その位置へ置く。返り値はこの行が使った高さ。
   *
   * 説明文（note）は設備によって長さがまるで違うので、上から順に
   * 「実際に描いた高さ」を足しながら積んでいく。固定の座標に置くと、
   * 説明が2行以上になった設備で効果や警告と重なって読めなくなる。
   */
  private updateRow(v: ShopRowView, row: Row, y: number): number {
    const left = ROW_LEFT;
    const textW = this.textWidth();

    let ty = y + 8;

    v.title.setVisible(true).setPosition(left, ty);
    setJaWrap(v.title, textW);
    v.title.setText(row.label);
    ty += v.title.height + 4;

    // 「所有 n」は説明文の左に置くので、そのぶん説明文の幅を狭める
    const hasOwned = row.owned > 0;
    const ownedW = hasOwned ? 68 : 0;
    v.owned.setVisible(hasOwned).setPosition(left, ty + 1).setText(hasOwned ? `所有 ${row.owned}` : "");
    v.note.setVisible(true).setPosition(left + ownedW, ty);
    setJaWrap(v.note, textW - ownedW);
    v.note.setText(row.note);
    ty += Math.max(v.note.height, hasOwned ? v.owned.height : 0) + 6;

    // 効果は1つの文字にまとめる（1行あたりの文字オブジェクトを減らすため）
    v.facts.setVisible(true).setPosition(left, ty);
    setJaWrap(v.facts, textW);
    v.facts.setText(row.facts.map((f) => f.text).join("　"));
    ty += v.facts.height + 4;

    const showReason = !row.canBuy.ok && !!row.canBuy.reason;
    v.reason.setVisible(showReason).setPosition(left, ty);
    setJaWrap(v.reason, textW);
    v.reason.setText(showReason ? `⚠ ${row.canBuy.reason}` : "");
    if (showReason) ty += v.reason.height + 4;

    // ボタン2つぶんの高さは最低でも確保する
    const h = Math.max(MIN_ROW_H, ty - y + 12);

    v.rect
      .setVisible(true)
      .setSize(this.width - 44 - this.modal.scrollGutter, h - 12)
      .setY(y + h / 2 - 6)
      .setFillStyle(hasOwned ? 0x1c3550 : 0x172636, 1)
      .setStrokeStyle(2, hasOwned ? 0x3d78b0 : 0x2a3d4f, 1);

    v.divider.setVisible(true).clear();
    v.divider.lineStyle(1, 0x2e4a66, 0.7);
    v.divider.lineBetween(left + textW + 10, y + 10, left + textW + 10, y + h - 22);

    v.onBuy = row.onBuy;
    v.onSell = row.onSell;
    v.buy.setVisible(true).setY(y + 30).setLabel(row.buyLabel).setEnabled(row.canBuy.ok);
    v.sell.setVisible(hasOwned).setY(y + 76).setLabel(row.sellLabel);
    return h;
  }

  private flash(message: string): void {
    const t = this.scene.add
      .text(this.width / 2, this.modal.contentTop + 44, message, {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: "#e74c3c",
        fontStyle: "bold",
        backgroundColor: "#0a1622ee",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0);
    this.modal.container.add(t);
    this.scene.time.delayedCall(1600, () => t.destroy());
  }
}

/** 未使用だが型の整合のために残す（EquipmentKind を UI から参照できるように）。 */
export type ShopRoomKind = EquipmentKind;
