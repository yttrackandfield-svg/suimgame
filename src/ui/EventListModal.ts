import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, gemsText } from "../config";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { flushInput } from "./inputReady";
import { setJaWrap } from "./textWrap";
import { CAMP, SHORTCOURSE } from "../config/balance";
import { CLASS_ORDER } from "../sim/classes";
import { CAMPAIGNS, campaignSeasonLabel, type CampaignId } from "../sim/campaign";
import type { GameState } from "../sim/state";

/**
 * イベント一覧（メニュー →「イベント」）。
 *   タブ1「イベント」    … 短期教室 / 合宿 / 遠方スカウト
 *   タブ2「キャンペーン」… 集客キャンペーン（通常2種＋季節限定3種＋集客キャンプ）
 *
 * 開催できない時期・条件はグレー表示＋理由を明示する。
 * どのイベント／キャンペーンも開催は月1回まで（GameState が管理）。
 */

export interface EventListCallbacks {
  onShortCourse: () => void;
  onCamp: () => void;
  /** 寮に空きがあるときの遠方スカウト。 */
  onCampaign: (id: CampaignId) => void;
  onClose: () => void;
}

interface Row {
  icon: string;
  name: string;
  detail: string;
  terms: string; // 開催条件
  effect: string; // 効果の目安（右下）
  available: boolean;
  reason: string; // 開催できない理由（グレー時）
  special: boolean; // 季節限定＝強調
  run: () => void;
}

type Tab = "event" | "campaign";

/**
 * 1行の最小の高さ。説明が2行に折り返せばその都度伸びる（→ buildRow の戻り値）。
 *
 * 【前は 92px 固定で文字が重なっていた】説明（12.5px）を
 * `setWordWrapWidth` で折り返そうとしていたが、日本語は分かち書きしないので
 * Phaser の既定の折り返しは効かない（→ ui/textWrap.ts）。文が右へ伸びて
 * 右上の「開催できる」バッジに重なっていた。さらに「開催条件」と「効果／できない理由」を
 * **同じ行の左右**に置いていたので、条件が長いイベント（遠方スカウトなど）では
 * 真ん中でぶつかっていた。いまは段で分け、文字も大きくしてある。
 */
const ROW_MIN_H = 118;

export class EventListModal {
  private readonly modal: Modal;
  private readonly width: number;
  private tab: Tab = "event";
  private readonly tabBtns: Button[] = [];
  /** 一覧（スクロールする窓）の上端。 */
  private listTop = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly cb: EventListCallbacks,
  ) {
    this.width = Math.min(516, GAME_WIDTH - 24);
    // 高さは画面いっぱいまで取り、入りきらないぶんは中をスクロールさせる
    const height = Math.min(880, GAME_HEIGHT - 24);

    this.modal = new Modal(
      scene,
      {
        width: this.width,
        height,
        title: `イベント　${this.state.dateLabel}`,
        subtitle: "開催はどれも月1回まで。時期が合わないものは開けない。",
        depth: 2500,
      },
      () => cb.onClose(),
    );

    this.modal
      .text(this.width - 24, this.modal.contentTop - 28, `所持 ◆${gemsText(this.state.gems)}`, 15, "#f9e79f", true)
      .setOrigin(1, 0);

    // タブ
    const tabs: [Tab, string][] = [
      ["event", "イベント"],
      ["campaign", "キャンペーン"],
    ];
    tabs.forEach(([id, label], i) => {
      const bw = (this.width - 60) / 2;
      const btn = this.modal.button(30 + bw / 2 + i * (bw + 6), this.modal.contentTop + 22, bw, 40, label, () =>
        this.setTab(id),
      );
      this.tabBtns.push(btn);
    });

    this.modal.button(this.width / 2, height - 32, this.width - 60, 46, "閉じる", () => cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });

    // 一覧は窓の中でスクロールする（指でなぞる／ホイール／右端の▲▼）
    this.listTop = this.modal.contentTop + 52;
    this.modal.enableScroll(this.listTop, height - 66 - this.listTop);

    this.setTab("event");
  }

  destroy(): void {
    this.modal.destroy();
  }

  /** 【見た目確認】キャンペーンのタブを開いた状態にする（?dev=facility&open=events:campaign）。 */
  devShowCampaign(): void {
    this.setTab("campaign");
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.tabBtns[0].setSelected(tab === "event");
    this.tabBtns[1].setSelected(tab === "campaign");
    this.render();
  }

  private render(): void {
    this.modal.clearBody();
    const rows = this.tab === "event" ? this.eventRows() : this.campaignRows();
    // 行の高さは説明の折り返し方で変わるので、積み上げながら置く
    let y = this.listTop + 4;
    for (const row of rows) y += this.buildRow(row, y) + 10;
    this.modal.setContentHeight(y + 8);
    flushInput(this.scene); // 並べ直した直後の1タップを捨てない（→ inputReady.ts）
  }

  // ---------------------------------------------------------------- 行の定義

  private eventRows(): Row[] {
    const month = this.state.month;
    const scMonths = SHORTCOURSE.months.join("・");
    const campMonths = CAMP.months.join("・");

    // 短期教室
    const scSeason = (SHORTCOURSE.months as readonly number[]).includes(month);
    const scHeld = this.state.alreadyHeld("shortCourse");
    const scAfford = this.state.gems >= SHORTCOURSE.cost;

    // 合宿
    const campHeld = this.state.alreadyHeld("camp");
    const campTargets = CLASS_ORDER.filter((c) => c.kind === "ikusei").flatMap((c) =>
      this.state.students[c.id].filter((s) => this.state.campEligible(s).ok),
    );

    const mult = this.state.enrollMultiplier();

    return [
      {
        icon: "📣",
        name: "短期教室",
        detail: "夏・冬・春の集中教室。人気度が高いほど多くのスクール生が集まる。",
        terms: `${scMonths}月・費用 ◆${gemsText(SHORTCOURSE.cost)}`,
        effect: `入会 およそ${Math.round(SHORTCOURSE.base * mult)}人 / 人気 +${SHORTCOURSE.popularityGain}`,
        available: scSeason && !scHeld && scAfford,
        reason: !scSeason
          ? `${month}月は開催できない（${scMonths}月のみ）`
          : scHeld
            ? "今月はもう開催した"
            : scAfford
              ? ""
              : "ジェムが足りない",
        special: false,
        run: () => this.cb.onShortCourse(),
      },
      {
        icon: "🏕",
        name: "合宿",
        detail: "タイプを選んで実施する。費用は1人あたり。海外はクラブが育ってから狙う大きな投資。",
        terms: `育成B〜選手は ${campMonths}月／プロ(${CAMP.proMinAge}歳以上)は通年・費用は1人あたり`,
        effect: campTargets.length > 0 ? `参加できる選手 ${campTargets.length}名` : "",
        available: campTargets.length > 0 && !campHeld,
        reason: campHeld
          ? "今月はもう実施した"
          : campTargets.length === 0
            ? `${month}月に参加できる選手がいない`
            : "",
        special: false,
        run: () => this.cb.onCamp(),
      },
    ];
  }

  private campaignRows(): Row[] {
    return CAMPAIGNS.map((def) => {
      const st = this.state.campaignStatus(def.id);
      const expected = this.state.campaignExpected(def);
      return {
        icon: def.special ? "🎉" : "🎫",
        name: def.label,
        detail: def.note,
        terms: `${campaignSeasonLabel(def)}・費用 ◆${gemsText(def.cost)}`,
        effect: `入会 およそ${expected}人 / 人気 +${def.popularity}`,
        available: st.ok,
        reason: st.ok ? "" : (st.reason ?? ""),
        special: def.special,
        run: () => this.cb.onCampaign(def.id),
      };
    });
  }

  // ---------------------------------------------------------------- 行の描画

  /**
   * 1行を描いて、使った高さを返す（説明が2行に折り返せばそのぶん伸びる）。
   *
   * 段の並びは 見出し（アイコン・名前・バッジ）→ 説明 → 開催条件 → 効果／できない理由。
   * **横に2つ並べない**こと。文字の長さはイベントごとに違うので、
   * 左右に置くと長いほうが必ず相手に重なる。
   */
  private buildRow(row: Row, y: number): number {
    const on = row.available;
    const fill = on ? (row.special ? 0x2a3f63 : 0x1c3550) : 0x18222c;
    const stroke = on ? (row.special ? 0xf7dc6f : 0x3d78b0) : 0x263442;
    // 右端はスクロールの▲▼ぶんを空ける
    const right = this.width - 20 - this.modal.scrollGutter;
    const left = 28;
    const textW = right - left - 8;

    const rect = this.scene.add
      .rectangle((left + right) / 2, y, right - left, ROW_MIN_H, fill, 1)
      .setStrokeStyle(2, stroke, 1)
      .setOrigin(0.5, 0);
    this.modal.body.add(rect);
    if (on) {
      rect.setInteractive({ useHandCursor: true }).on(
        "pointerup",
        (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation?.();
          row.run();
        },
      );
    }

    const mk = (
      x: number,
      ty: number,
      s: string,
      size: number,
      color: string,
      bold = false,
      originX = 0,
    ): Phaser.GameObjects.Text => {
      const t = this.scene.add
        .text(x, ty, s, {
          fontFamily: "sans-serif",
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? "bold" : "normal",
        })
        .setOrigin(originX, 0);
      this.modal.body.add(t);
      return t;
    };

    // --- 1段目：アイコン・名前と、右上の状態バッジ
    const badgeW = 104;
    const badge = this.scene.add.graphics();
    badge.fillStyle(on ? (row.special ? 0xb8893c : 0x2e7d5b) : 0x3a4653, 1);
    badge.fillRoundedRect(right - 12 - badgeW, y + 10, badgeW, 26, 6);
    this.modal.body.add(badge);
    mk(right - 12 - badgeW / 2, y + 15, on ? "開催できる" : "開催できない", 13, on ? "#ffffff" : "#8fa3b5", true, 0.5);

    const padX = left + 14;
    mk(padX, y + 11, row.icon, 22, on ? "#ffffff" : "#5f7c93");
    mk(padX + 34, y + 12, row.name, 20, on ? (row.special ? "#f7dc6f" : "#e8f0f6") : "#8a9db0", true);

    // --- 2段目：説明（日本語は setJaWrap でないと折り返せない → ui/textWrap.ts）
    let ty = y + 44;
    const detail = mk(padX, ty, "", 14, on ? "#cfd8e0" : "#8397a9");
    setJaWrap(detail, textW - 28);
    detail.setText(row.detail);
    ty += detail.height + 8;

    // --- 3段目：開催条件
    const terms = mk(padX, ty, "", 13, on ? "#9fb3c4" : "#8195a7");
    setJaWrap(terms, textW - 28);
    terms.setText(row.terms);
    ty += terms.height + 4;

    // --- 4段目：効果（開催できるとき）／できない理由
    const note = on ? row.effect : row.reason;
    if (note) {
      const t = mk(padX, ty, "", 13, on ? "#2ecc71" : "#e67e22");
      setJaWrap(t, textW - 28);
      t.setText(note);
      ty += t.height;
    }

    const h = Math.max(ROW_MIN_H, ty - y + 14);
    rect.setSize(right - left, h);
    return h;
  }
}
