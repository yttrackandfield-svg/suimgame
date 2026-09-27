import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, gemsText } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { SPECIAL_MENUS, type SpecialResult } from "../sim/special";
import { PASSION } from "../config/balance";
import { STAT_KEYS, STAT_LABEL, STAT_COLOR, type StatKey, type Student } from "../sim/student";
import { CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL, conditionLevel } from "../sim/condition";
import type { GameState } from "../sim/state";

/**
 * 特別練習。
 *
 * 通常の時間割とは別に、選手1人を指名して行う強化メニュー。
 * 効果が高いかわりに ジェム／体力／コンディション を払う。1人につき月1回まで。
 *
 * 【この画面の役割】
 *  ① 何にいくらかかって、何が伸びて、何を失うのかを実施前に見せる
 *  ② 実施後に **ビフォー／アフター** を並べて「効果があった」と分かるようにする
 * 読む画面なので、幅は 524 以下で組む（→ Modal の規約）。
 */
export class SpecialTrainingModal {
  private readonly m: Modal;
  private result: SpecialResult | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly student: Student,
    private readonly cb: { onDone: () => void; onClose: () => void },
  ) {
    this.m = new Modal(
      scene,
      {
        width: Math.min(516, GAME_WIDTH - 24),
        height: Math.min(760, GAME_HEIGHT - 30),
        title: `特別練習　${student.name}`,
        subtitle: "通常練習より効果が高いかわりに、費用と疲れがかかる。1人につき月1回まで。",
        depth: 2620,
      },
      () => cb.onClose(),
    );
    this.render();
  }

  destroy(): void {
    this.m.destroy();
  }

  // ---------------------------------------------------------------- 描画

  private render(): void {
    this.m.clearBody();
    if (this.result) this.renderResult();
    else this.renderMenus();
  }

  private renderMenus(): void {
    const body = this.m.body;
    const s = this.student;
    const w = this.m.pw;
    const lv = conditionLevel(s.condition);
    const plan = this.state.planFor(s);

    // 【日本語は setJaWrap で折り返す】Phaser の既定の折り返しは半角スペース区切りなので、
    // 日本語だと幅を無視して横へ伸び、右のボタンに重なる（→ ui/textWrap.ts）。
    let y = this.m.contentTop + 6;
    const head = this.m.text(
      20,
      y,
      `体力 ${Math.round(s.energy)}　調子 ${CONDITION_ICON[lv]}${CONDITION_LABEL[lv]}　` +
        `いまの練習 ${STAT_LABEL[plan.ability]}\n` +
        `所持 ◆${this.state.gems}　🔥 情熱 ${this.state.passionShown()}/${PASSION.max}\n` +
        `特別練習は情熱を使う（大会で勝つ・お客さんに満足してもらうと溜まる）`,
      13,
      "#aed6f1",
      true,
      body,
    );
    setJaWrap(head, w - 40);
    // 【高さは測って積む】見出しは行数が変わる。決め打ちで送ると下の枠に食い込む
    y += head.height + 10;

    const left = 30;
    const btnW = 108;
    const textW = w - 36 - btnW - 44;
    for (const menu of SPECIAL_MENUS) {
      const st = this.state.canRunSpecial(s, menu.id);

      // 先に中身を作って高さを測り、そのあとで枠を描いていちばん後ろへ回す
      this.m.text(left, y + 8, `${menu.icon} ${menu.label}`, 16, st.ok ? "#f7dc6f" : "#95a6b8", true, body);
      const note = this.m.text(left, y + 32, menu.note, 12, "#aed6f1", false, body);
      setJaWrap(note, textW);
      const terms = this.m.text(
        left,
        y + 34 + note.height + 4,
        `◆${menu.cost}　🔥${menu.passion}　体力 ${menu.fatigueMult >= 1.5 ? "大" : menu.fatigueMult >= 1.2 ? "中" : "小"}　` +
          `調子 -${menu.conditionCost}` +
          (menu.requiresRoom ? "　※スタジオが要る" : ""),
        11.5,
        "#e59866",
        false,
        body,
      );
      setJaWrap(terms, textW);

      let bottom = terms.y + terms.height + 8;
      // 出せない理由は**説明の下**に置く（ボタンの上に重ねない）
      if (!st.ok) {
        const why = this.m.text(left, bottom, `⚠ ${st.reason ?? ""}`, 11, "#e74c3c", false, body);
        setJaWrap(why, textW);
        bottom = why.y + why.height + 8;
      }
      const rowH = Math.max(96, bottom - y);

      const box = this.scene.add
        .rectangle(w / 2, y + rowH / 2, w - 36, rowH - 8, st.ok ? 0x1c3550 : 0x18232f, 1)
        .setStrokeStyle(1, st.ok ? 0x2e4a66 : 0x2a3540, 1);
      body.add(box);
      body.sendToBack(box);

      const btn = this.m.button(
        w - 30 - btnW / 2,
        y + rowH / 2,
        btnW,
        44,
        "実施する",
        () => this.run(menu.id),
        { color: 0x2e7d5b, hoverColor: 0x3fa876, fontSize: 15 },
        body,
      );
      btn.setEnabled(st.ok);
      y += rowH + 10;
    }

    this.m.button(
      w / 2,
      this.m.ph - 34,
      w - 80,
      46,
      "閉じる",
      () => this.cb.onClose(),
      { color: 0x394a5c, hoverColor: 0x4a6076, fontSize: 16 },
      body,
    );
  }

  /** 実施後：ビフォー／アフターを並べて、何がどれだけ伸びたかを見せる。 */
  private renderResult(): void {
    const r = this.result!;
    const body = this.m.body;
    const w = this.m.pw;
    let y = this.m.contentTop + 8;

    this.m.text(20, y, `${r.menu?.icon} ${r.menu?.label} をやりきった！`, 19, "#f7dc6f", true, body);
    y += 34;

    // 見出し
    this.m.text(30, y, "能力", 12.5, "#8fa3b5", true, body);
    this.m.text(150, y, "まえ", 12.5, "#8fa3b5", true, body);
    this.m.text(235, y, "→", 12.5, "#8fa3b5", true, body);
    this.m.text(275, y, "あと", 12.5, "#8fa3b5", true, body);
    this.m.text(370, y, "のび", 12.5, "#8fa3b5", true, body);
    y += 22;

    for (const k of STAT_KEYS) {
      const before = r.before?.[k] ?? 0;
      const after = r.after?.[k] ?? 0;
      const d = after - before;
      this.m.text(30, y, STAT_LABEL[k], 14, `#${(STAT_COLOR[k] ?? 0xecf0f1).toString(16).padStart(6, "0")}`, true, body);
      this.m.text(150, y, String(Math.round(before)), 14, "#8fa3b5", false, body);
      this.m.text(235, y, "→", 14, "#5f6f7f", false, body);
      this.m.text(275, y, String(Math.round(after)), 14, "#ffffff", true, body);
      this.m
        .text(
          370,
          y,
          d >= 0.5 ? `+${Math.round(d)}` : d <= -0.5 ? String(Math.round(d)) : "±0",
          14,
          d > 0.05 ? "#2ecc71" : d < -0.05 ? "#e74c3c" : "#5f6f7f",
          true,
          body,
        );
      // 伸びた量をバーでも見せる（数字が小さくても「効いた」が分かるように）
      if (d > 0) {
        const bar = this.scene.add.graphics();
        bar.fillStyle(0x2ecc71, 0.85);
        bar.fillRect(440, y + 5, Math.min(52, Math.max(3, d * 26)), 9);
        body.add(bar);
      }
      y += 24;
    }

    y += 10;
    const lv = conditionLevel(this.student.condition);
    const lines: string[] = [];
    if ((r.strokeGain ?? 0) > 0.01) lines.push(`泳法の熟練度 +${Math.round(r.strokeGain ?? 0)}`);
    lines.push(`体力 -${Math.round(r.energyUsed ?? 0)}　調子 -${Math.round(r.conditionDrop ?? 0)}`);
    lines.push(`費用 ◆${gemsText(r.cost ?? 0)}　→　所持 ◆${gemsText(this.state.gems)}`);
    if (r.injured) lines.push("⚠ 追い込みすぎて体を痛めた（フォームが落ちた）");

    for (const l of lines) {
      setJaWrap(this.m.text(30, y, l, 13, l.startsWith("⚠") ? "#e74c3c" : "#aed6f1", false, body), w - 60);
      y += 22;
    }
    y += 6;
    setJaWrap(
      this.m.text(
        30,
        y,
        `いまの調子：${CONDITION_ICON[lv]}${CONDITION_LABEL[lv]}　` +
          "（次のコマの伸びは落ちる。休ませるか、風呂・サウナで戻そう）",
        12,
        CONDITION_COLOR[lv],
        false,
        body,
      ),
      w - 60,
    );

    this.m.button(
      w / 2,
      this.m.ph - 34,
      w - 80,
      46,
      "とじる",
      () => this.cb.onClose(),
      { color: 0x2e7d5b, hoverColor: 0x3fa876, fontSize: 16 },
      body,
    );
  }

  // ---------------------------------------------------------------- 操作

  private run(id: string): void {
    const r = this.state.runSpecialTraining(this.student, id);
    if (!r.ok) {
      this.m.text(30, this.m.ph - 74, `⚠ ${r.reason ?? ""}`, 13, "#e74c3c", true, this.m.body);
      return;
    }
    this.result = r;
    this.cb.onDone();
    this.render();
  }
}

/** 表示用（1つでも受けられるメニューがあるか）。 */
export function anySpecialAvailable(state: GameState, s: Student): boolean {
  return SPECIAL_MENUS.some((m) => state.canRunSpecial(s, m.id).ok);
}

/** 型だけ使う（未使用警告よけ）。 */
export type { StatKey };
