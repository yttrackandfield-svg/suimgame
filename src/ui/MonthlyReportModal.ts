import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { classLabel } from "../sim/classes";
import { guestAverageMood } from "../sim/guests";
import { moodColor, moodLabel } from "../sim/satisfaction";
import type { MonthRollResult } from "../sim/state";

/**
 * 月次の収支レポート（月替わりに出る）。
 * 「今月いくら残ったか」を、月謝の内訳・維持費・給料まで見せる。
 *
 * 【組み立て方】出す行をいったん配列に組んでから、その行数でパネルの高さを決める。
 * 以前は「高さの式」と「実際に描く行」を別々に書いていたため、
 * 条件を1つ足すたびにズレて、下のボタンに文字が重なっていた。
 * 行の追加は entries に push するだけでよく、高さは自動で合う。
 */

export interface MonthlyReportCallbacks {
  onClose: () => void;
  /** 練習枠が足りずに入会を断ったとき、設備購入へ誘導する。 */
  onOpenShop: () => void;
}

/** レポートの1行。rule は区切り線、head は小見出し。 */
type Entry =
  | { kind: "line"; label: string; value: string; color: string; size: number; bold: boolean; indent: number }
  | { kind: "head"; label: string; color: string }
  | { kind: "rule" }
  | { kind: "gap"; h: number };

const HEAD_H = 24;
const RULE_H = 12;

function entryHeight(e: Entry): number {
  switch (e.kind) {
    case "line":
      return e.size + 6;
    case "head":
      return HEAD_H;
    case "rule":
      return RULE_H;
    case "gap":
      return e.h;
  }
}

export class MonthlyReportModal {
  private readonly modal: Modal;

  constructor(
    scene: Phaser.Scene,
    result: MonthRollResult,
    gems: number,
    cb: MonthlyReportCallbacks,
  ) {
    const width = Math.min(480, GAME_WIDTH - 30);
    // プロは月謝を払わない（クラブが契約金を払う側）ので、月謝の行には出さない
    const rows = result.finance.byClass.filter((r) => r.count > 0 && r.perHead > 0);
    // 断りが出るのは「クラスの定員が埋まったとき」だけ。打つ手は時間割かプール。
    const needShop = result.turnedAway > 0;

    // ---------------------------------------------------------------- 出す行を先に組む
    const entries: Entry[] = [];
    const line = (
      label: string,
      value: string,
      color = "#dfe6ec",
      size = 14,
      bold = false,
      indent = 0,
    ): void => {
      entries.push({ kind: "line", label, value, color, size, bold, indent });
    };
    const head = (label: string, color: string): void => {
      entries.push({ kind: "head", label, color });
    };
    const rule = (): void => {
      entries.push({ kind: "rule" });
    };

    // --- 収入
    head("収入（月謝）", "#2ecc71");
    for (const r of rows) {
      line(`${classLabel(r.classId)}　${r.count}人 × ◆${r.perHead}`, `+${r.total}`, "#aed6f1", 12.5, false, 10);
    }
    line("月謝 合計", `+${result.income}`, "#2ecc71", 14, true);
    // 一般客（空きコマの有料開放）。来場のたびに入っているので月謝とは別枠で見せる。
    if (result.guests.served + result.guests.turnedAway > 0) {
      line(`一般客の利用料　${result.guests.served}人`, `+${result.guests.income}`, "#7fd1ae", 12.5, false, 10);
      if (result.guests.turnedAway > 0) {
        line("⚠ 使えずに帰った客", `${result.guests.turnedAway}人`, "#e67e22", 12, false, 10);
      }
      // 満足して帰った客の口コミ（その場で人気度が上がったぶん）
      if (result.guests.wordOfMouth > 0) {
        line("♪ 満足した客の口コミ", `人気度 +${result.guests.wordOfMouth}`, "#f7dc6f", 12, false, 10);
      }
      // 【満足度】今月の客がどれだけ気持ちよく過ごせたか。
      // ここが高いほど貢献値が積まれ、下の「一般客の評判で人気度」が伸びる。
      const avg = guestAverageMood(result.guests);
      if (avg != null) {
        line(
          `★ お客さんの満足度　${moodLabel(avg)}`,
          `貢献 ${Math.round(result.guests.contribution)}`,
          `#${moodColor(avg).toString(16).padStart(6, "0")}`,
          12,
          false,
          10,
        );
      }
    }
    // 売店（在籍が多いほど売れる）
    if (result.finance.shop > 0) {
      line("売店の売上", `+${result.finance.shop}`, "#7fd1ae", 12.5, false, 10);
    }
    // 大型プールの観客席（見物客の入場料）
    if (result.finance.stands > 0) {
      line("観客席の入場料（大型プール）", `+${result.finance.stands}`, "#7fd1ae", 12.5, false, 10);
    }
    // スポンサー（クラブの格が上がると付く。大型施設の資金源）
    if (result.finance.sponsor > 0) {
      line("スポンサー収入", `+${result.finance.sponsor}`, "#f7dc6f", 13.5, true, 10);
    }
    rule();

    // --- 支出
    head("支出", "#e74c3c");
    line("設備の維持費", `-${result.upkeep}`, "#e59866", 12.5, false, 10);
    if (result.finance.dorm > 0) {
      line("寮の食費・光熱費", `-${result.finance.dorm}`, "#e59866", 12.5, false, 10);
    }
    line("人件費（コーチ・スタッフ）", `-${result.salary}`, "#e59866", 12.5, false, 10);
    // プロの契約金（選手の格とクラブの格で決まる → PRO_SALARY）
    if (result.finance.proSalary > 0) {
      line("プロの契約金", `-${result.finance.proSalary}`, "#e59866", 12.5, false, 10);
    }
    line(
      "支出 合計",
      `-${result.upkeep + result.salary + result.finance.dorm + result.finance.proSalary}`,
      "#e74c3c",
      14,
      true,
    );
    rule();

    // --- 収支
    const net = result.net;
    line("今月の収支", `${net >= 0 ? "+" : ""}${net}`, net >= 0 ? "#f7dc6f" : "#e74c3c", 19, true);
    line("所持ジェム", `◆${gems}`, "#f9e79f", 14, true);
    if (result.unpaid > 0) {
      entries.push({ kind: "gap", h: 4 });
      line("⚠ 資金不足で払えなかった分", `-${result.unpaid}`, "#e74c3c", 12.5, true);
    }
    entries.push({ kind: "gap", h: 6 });

    // --- 今月の育成の手ごたえ（投資が効いているかを毎月示す）
    if (result.growers.length > 0) {
      rule();
      head("今月よく伸びた選手", "#7fd1ae");
      for (const g of result.growers) {
        line(g.name, `+${Math.round(g.total)}`, "#2ecc71", 13, false, 10);
      }
      line("（5つの能力の伸びの合計。設備・コーチ・回復を足すとここが伸びる）", "", "#95a6b8", 11, false, 10);
    }

    // --- 入会と人気度
    rule();
    line("今月の入会", `${result.newEntrants}人`, "#aed6f1", 13);
    if (needShop) {
      line("⚠ 定員がいっぱいで断った", `${result.turnedAway}人`, "#e67e22", 13, true);
      line("（時間割にコマを足すか、プールを増やそう）", "", "#95a6b8", 11, false, 10);
    }
    if (result.facilityPopularity !== 0) {
      // 小数の誤差（+13.600000000000364）がそのまま出ていたので、小数1桁に丸めて出す
      const v = Math.round(result.facilityPopularity * 10) / 10;
      line("設備・飾りで人気度", `${v >= 0 ? "+" : ""}${v}`, v >= 0 ? "#f7dc6f" : "#e67e22", 13);
    }
    if (result.guestPopularity !== 0) {
      const v = Math.round(result.guestPopularity * 10) / 10;
      line("一般客の評判で人気度", `${v >= 0 ? "+" : ""}${v}`, v >= 0 ? "#7fd1ae" : "#e67e22", 13);
    }
    if (result.stranded > 0) {
      line("⚠ 歩いて行けない部屋", `${result.stranded}件`, "#e74c3c", 13, true);
    }

    // --- 月例記録会（格の根拠になるタイム計測）
    line("記録会で自己ベスト更新", `${result.trialImproved}人`, "#7fd8c0", 13);
    if (result.rankUps.length > 0) {
      line("★ 格が上がった", `${result.rankUps.length}人`, "#f7dc6f", 13, true);
      for (const up of result.rankUps.slice(0, 3)) {
        line(`${up.student.name}`, up.label, "#f9e79f", 11.5, false, 10);
      }
    }
    if (result.clubRankUp) line("🏆 クラブの格", result.clubRankUp.label, "#f7dc6f", 13, true);
    if (result.researchGain > 0) line("🔬 研究が進んだ", `+${Math.round(result.researchGain)}`, "#a78bfa", 13);
    for (const r of result.researchDone) {
      if (r.success) {
        line("🔬 研究 完了", `${r.label} Lv${r.level}`, "#a78bfa", 13, true);
      } else {
        line("⚠ 研究 失敗", `${r.label} Lv${r.level}`, "#e67e22", 13, true);
        line("（進捗は半分残る。班の指導力は上がった）", "", "#95a6b8", 11, false, 10);
      }
    }

    // ---------------------------------------------------------------- 高さは行の合計から決める
    const bodyH = entries.reduce((n, e) => n + entryHeight(e), 0);
    const tailH = (needShop ? 76 : 0) + 74; // ボタンぶんの余白
    const headerH = 96; // タイトル＋サブタイトル＋区切り線
    // 画面に収まらないときはスクロールできるようにする（重なりを起こさない）
    const wanted = headerH + bodyH + tailH;
    const height = Math.min(GAME_HEIGHT - 40, wanted);

    // 月替わり直後なので「先月」の収支。表示用に1ヶ月戻した見出しにする。
    const prevMonth = result.month === 1 ? 12 : result.month - 1;
    this.modal = new Modal(
      scene,
      {
        width,
        height,
        title: `${prevMonth}月の収支`,
        subtitle: result.rolledYear ? "新年度：全員が1学年進級した" : `${result.year}年目 ${result.month}月になった`,
        depth: 2600,
        closeOnBackdrop: false,
      },
      () => cb.onClose(),
    );

    const L = 26;
    const R = width - 26;
    const top = this.modal.contentTop + 2;
    const viewH = height - top - tailH;
    // 行が入りきらないときだけスクロールを有効にする
    const scrolling = wanted > height;
    if (scrolling) this.modal.enableScroll(top, viewH);
    const right = scrolling ? R - this.modal.scrollGutter : R;

    // ---------------------------------------------------------------- 描く
    let y = top;
    for (const e of entries) {
      if (e.kind === "line") {
        this.modal.text(L + e.indent, y, e.label, e.size, e.color, e.bold, this.modal.body);
        this.modal
          .text(right, y, e.value, e.size, e.color, e.bold, this.modal.body)
          .setOrigin(1, 0);
      } else if (e.kind === "head") {
        this.modal.text(L, y, e.label, 15, e.color, true, this.modal.body);
      } else if (e.kind === "rule") {
        const g = scene.add.graphics();
        g.lineStyle(1, 0x2e4a66, 1);
        g.lineBetween(L, y + 2, right, y + 2);
        this.modal.body.add(g);
      }
      y += entryHeight(e);
    }
    if (scrolling) this.modal.setContentHeight(y + 8);

    if (needShop) {
      this.modal.button(width / 2, height - 84, width - 60, 42, "設備購入へ（プールを増やす）", () => cb.onOpenShop(), {
        color: 0x2c5f8f,
        hoverColor: 0x3d78b0,
        fontSize: 15,
      });
    }

    this.modal.button(width / 2, height - 34, width - 60, 46, "確認した", () => cb.onClose(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 17,
    });
  }

  destroy(): void {
    this.modal.destroy();
  }
}
