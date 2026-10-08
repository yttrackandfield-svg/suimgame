import Phaser from "phaser";
import { formatTime, GENDER_LABEL, predictTime, STROKE_LABEL, type Student } from "../sim/student";
import { isAreaMeet, SCALE_LABEL, type Competition } from "../sim/competitions";
import { conditionLevel, conditionTimeFactor, CONDITION_COLOR, CONDITION_ICON, CONDITION_LABEL } from "../sim/condition";
import { classLabel } from "../sim/classes";
import type { ConfirmCandidate, GameState } from "../sim/state";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import type { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

export interface MeetConfirmCallbacks {
  /** エントリーを決めた／すべて見送った（message は画面上部に出す一言）。 */
  onDone: (message: string) => void;
  /** × で閉じた（あとで決める。大会画面から開き直せる）。 */
  onClose: () => void;
  /**
   * 行の ⓘ を押したとき（その選手のカードを開く）。
   * picked は選びかけの印。開き直すときに restorePicked へ渡し返せば、印が消えない。
   */
  onOpenCard?: (s: Student, picked: string[]) => void;
  /** 開いたときに戻す選びかけの印（カードを見て戻ってきたとき）。 */
  restorePicked?: string[];
}

/** 1人ぶんの行の高さ。 */
const ROW_H = 58;
/** 行の右端の ⓘ ボタンのぶん、右寄せの文字を内側へずらす幅。 */
const INFO_W = 40;
/** 下段（出場費とボタン）の高さ。 */
const FOOTER_H = 96;

/**
 * 主要大会の出場確認（開催の2週間前に自動で出る）。
 *
 * 条件を満たした選手と、その種目を一覧にして、出る／見送るをまとめて決める。
 *   勝ち上がりの大会 … 前の段で優勝した種目
 *   標準記録の大会   … 標準タイムを出した種目
 *   入口の大会       … 得意種目
 * 初めて開いたときは、1レースの上限まで予想タイムの速い順に印を付けてある
 *（出したくない子の印を外して「エントリー」を押すだけで済むように）。
 * 男女別・種目別に1レースずつなので、1レースに入れる人数（maxRaceEntries）を超えては選べない。
 * 出場費はエントリーしたときに払い、ケガなどで当日出られない選手のぶんは返す。
 */
export class MeetConfirmModal {
  private readonly m: Modal;
  /** スクロールしない枠（下段の出場費とボタン）。 */
  private readonly head: Phaser.GameObjects.Container;
  private readonly rows: ConfirmCandidate[];
  private readonly picked = new Set<string>();
  private readonly listTop: number;
  private goBtn?: Button;
  private costText?: Phaser.GameObjects.Text;
  /** 申し込む前の確認（押し間違いで出場費を払わないように）。 */
  private ask?: ConfirmDialog;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly comp: Competition,
    private readonly cb: MeetConfirmCallbacks,
  ) {
    this.m = new Modal(
      scene,
      {
        width: Math.min(720, GAME_WIDTH - 20),
        height: Math.min(820, GAME_HEIGHT - 40),
        title: `出場確認　${comp.name}`,
        subtitle:
          `${state.raceDayLabel(state.majorRaceDay())}開催［${SCALE_LABEL[comp.scale]}］。` +
          (isAreaMeet(comp)
            ? `育成B以上が出られます。種目も選べます（申し込みは のべ${state.maxMeetEntries()}人まで）。`
            : `条件を満たした選手と種目です。出る選手に印を付けてエントリー（のべ${state.maxMeetEntries()}人まで）。`),
        // 一覧を送っている指が外に出ただけで閉じないように
        closeOnBackdrop: false,
      },
      () => this.cb.onClose(),
    );
    this.head = scene.add.container(0, 0);
    this.m.container.add(this.head);

    // 種目・性別ごとにまとめ、同じ組の中は予想タイムの速い順
    this.rows = state
      .majorConfirmCandidates(comp)
      .sort(
        (a, b) =>
          this.groupKey(a).localeCompare(this.groupKey(b)) ||
          predictTime(a.student, a.event) - predictTime(b.student, b.event),
      );
    const current = state.majorEntriesOf(comp);
    if (cb.restorePicked) {
      // カードを見て戻ってきた：選びかけの印をそのまま戻す（もう居ない行の印は捨てる）
      const keys = new Set(this.rows.map((r) => this.key(r)));
      for (const k of cb.restorePicked) if (keys.has(k)) this.picked.add(k);
    } else if (current.length > 0) {
      // 開き直したときは、いまのエントリーをそのまま出す
      for (const c of current) this.picked.add(this.key(c));
    } else {
      /**
       * 初めて開いたときの印は **1人1種目**。
       *
       * 地区大会は1人につき種目が何行も並ぶ（得意泳法の全距離＋ほかの泳法）ので、
       * 行ごとに印を付けていくと同じ子が何種目にも入り、
       * 1大会の上限（のべ8人）をその子だけで使い切ってしまう。
       * まず**その子の得意種目**を取り、それが無い子だけ残りの行から拾う。
       */
      const perGroup = new Map<string, number>();
      const seen = new Set<number>();
      let total = 0;
      const isFav = (r: ConfirmCandidate): boolean =>
        r.event.stroke === r.student.fav.stroke && r.event.distance === r.student.fav.distance;
      for (const favPass of [true, false]) {
        for (const r of this.rows) {
          if (total >= state.maxMeetEntries()) break;
          if (seen.has(r.student.id)) continue;
          if (favPass && !isFav(r)) continue;
          const g = this.groupKey(r);
          const n = perGroup.get(g) ?? 0;
          if (n >= state.maxRaceEntries()) continue;
          perGroup.set(g, n + 1);
          this.picked.add(this.key(r));
          seen.add(r.student.id);
          total++;
        }
      }
    }

    this.listTop = this.m.contentTop + 8;
    this.m.enableScroll(this.listTop, this.m.ph - this.listTop - FOOTER_H);
    this.buildFooter();
    this.render();
  }

  destroy(): void {
    this.ask?.destroy();
    this.ask = undefined;
    this.m.destroy();
  }

  private get pw(): number {
    return this.m.pw;
  }

  private key(c: ConfirmCandidate): string {
    return `${c.student.id}|${c.event.stroke}-${c.event.distance}`;
  }

  /** 1レースの単位（性別・泳法・距離）。距離は桁をそろえて並べる。 */
  private groupKey(c: ConfirmCandidate): string {
    return `${c.student.gender}|${c.event.stroke}-${String(c.event.distance).padStart(4, "0")}`;
  }

  private picks(): ConfirmCandidate[] {
    return this.rows.filter((r) => this.picked.has(this.key(r)));
  }

  /**
   * いま選んでいる中身が、**すでに申し込んである中身と同じ**か。
   *
   * 【同じ内容で何度も押させない】（2026-09-24）
   * 出場確認は大会画面から何度でも開けるので、同じ顔ぶれのまま
   * 「エントリー」を押し直せてしまっていた。実際には出場は1回きりで、
   * 中では返金してから同じ額を払い直しているだけなのに、
   * 「エントリーしました」のお知らせだけが何度も出て**二重に申し込んだように見える**。
   */
  private sameAsEntered(): boolean {
    const now = this.picks().map((c) => this.key(c)).sort();
    const done = this.state.majorEntriesOf(this.comp).map((c) => this.key(c)).sort();
    return now.length > 0 && now.length === done.length && now.every((k, i) => k === done[i]);
  }

  private pickedInGroup(c: ConfirmCandidate): number {
    const g = this.groupKey(c);
    return this.rows.filter((r) => this.groupKey(r) === g && this.picked.has(this.key(r))).length;
  }

  private toggle(c: ConfirmCandidate): void {
    const k = this.key(c);
    if (this.picked.has(k)) {
      this.picked.delete(k);
      this.render();
      return;
    }
    // 1レースの人数（6人）と、1大会ののべ人数（8人）の両方を見る
    if (this.pickedInGroup(c) >= this.state.maxRaceEntries()) return;
    if (this.picked.size >= this.state.maxMeetEntries()) return;
    this.picked.add(k);
    this.render();
  }

  private render(): void {
    this.m.clearBody(true);
    const body = this.m.body;
    const w = this.pw - 40 - this.m.scrollGutter;
    let y = this.listTop + 6;
    if (this.rows.length === 0) {
      this.m.text(28, y + 10, "条件を満たす選手がいません。", 14, "#95a6b8", false, body);
      y += 40;
    }
    let group = "";
    for (const r of this.rows) {
      const g = this.groupKey(r);
      if (g !== group) {
        group = g;
        this.m.text(
          24,
          y + 8,
          `${GENDER_LABEL[r.student.gender]}　${r.event.distance}m ${STROKE_LABEL[r.event.stroke]}` +
            `　（${this.pickedInGroup(r)} / ${this.state.maxRaceEntries()}人）`,
          14,
          "#f7dc6f",
          true,
          body,
        );
        y += 34;
      }
      this.buildRow(r, y, w);
      y += ROW_H;
    }
    this.m.setContentHeight(y + 12 - this.listTop);
    this.refreshFooter();
  }

  private buildRow(r: ConfirmCandidate, y: number, w: number): void {
    const body = this.m.body;
    const s = r.student;
    const on = this.picked.has(this.key(r));
    // 押せない理由は2つ（そのレースが満員／大会の申し込みが上限）
    const raceFull = !on && this.pickedInGroup(r) >= this.state.maxRaceEntries();
    const meetFull = !on && this.picked.size >= this.state.maxMeetEntries();
    const full = raceFull || meetFull;
    const rect = this.scene.add
      .rectangle(20 + w / 2, y + ROW_H / 2 - 4, w, ROW_H - 8, on ? 0x24506b : 0x1c3550, 1)
      .setStrokeStyle(on ? 2 : 1, on ? 0xf7dc6f : 0x2e4a66, 1);
    body.add(rect);
    const btn = this.m.button(
      52,
      y + ROW_H / 2 - 4,
      44,
      38,
      on ? "☑" : "□",
      () => this.toggle(r),
      { color: on ? 0x2e7d5b : 0x2c3e50, hoverColor: 0x3d5a80, fontSize: 18 },
      body,
    );
    if (full) btn.setEnabled(false);

    /**
     * 【能力・得意種目を見るボタン】（2026-10-07）
     * この画面には選手カードへの入口が無く、誰を出すか決める材料が予想タイムだけだった。
     * 行のタップはチェックと紛らわしいので、合宿の一覧と同じく**右端の ⓘ** に分ける。
     */
    const right = 20 + w - 12 - (this.cb.onOpenCard ? INFO_W : 0);
    if (this.cb.onOpenCard) {
      this.m.button(
        20 + w - 6 - INFO_W / 2,
        y + ROW_H / 2 - 4,
        INFO_W - 4,
        38,
        "ⓘ",
        () => this.cb.onOpenCard?.(s, [...this.picked]),
        { color: 0x2c4a6b, hoverColor: 0x3d6fb0, fontSize: 18 },
        body,
      );
    }

    // --- 右側（予想タイム・注意書き）を先に置いて、左の文字はその手前までにする
    const level = conditionLevel(s.condition);
    const pred = predictTime(s, r.event) * conditionTimeFactor(level);
    const predText = this.m.text(right, y + 6, `予想 ${formatTime(pred)}`, 13.5, "#aed6f1", true, body).setOrigin(1, 0);
    const note = raceFull
      ? "このレースは満員"
      : meetFull
        ? `申し込みは のべ${this.state.maxMeetEntries()}人まで`
        : s.injuryDays > 0
          ? "ケガ（治らなければ当日欠場）"
          : "";
    const noteText = note ? this.m.text(right, y + 29, note, 11, "#e59866", false, body).setOrigin(1, 0) : null;

    // --- 上段：名前 → 得意種目（この行の種目と合っていれば色を変える）
    const name = this.m.text(84, y + 4, s.name, 15, on ? "#ffffff" : "#ecf0f1", true, body);
    const sameStroke = s.fav.stroke === r.event.stroke;
    const exact = sameStroke && s.fav.distance === r.event.distance;
    const fav = this.m.text(
      name.x + name.width + 12,
      y + 7,
      `得意 ${STROKE_LABEL[s.fav.stroke]}${s.fav.distance}m${exact ? " ◎" : sameStroke ? " ○" : ""}`,
      12,
      exact ? "#f7dc6f" : sameStroke ? "#7fd8c0" : "#8fa3b5",
      exact || sameStroke,
      body,
    );
    if (fav.x + fav.width > right - predText.width - 10) fav.setVisible(false);

    // --- 下段：クラス・学年 → 調子（重なるなら調子を後ろへ送る）
    const sub = this.m.text(84, y + 27, `${classLabel(s.classId)}・${s.grade}`, 11.5, "#9fb3c4", false, body);
    const cond = this.m.text(
      Math.max(196, sub.x + sub.width + 10),
      y + 27,
      `${CONDITION_ICON[level]} ${CONDITION_LABEL[level]}`,
      11.5,
      CONDITION_COLOR[level],
      true,
      body,
    );
    if (noteText && cond.x + cond.width > right - noteText.width - 10) cond.setVisible(false);
  }

  private buildFooter(): void {
    const fy = this.m.ph - 34;
    this.costText = this.m.text(22, fy - 50, "", 12.5, "#aed6f1", false, this.head);
    this.m.button(
      100,
      fy,
      160,
      44,
      "すべて見送る",
      () => this.decline(),
      { color: 0x5a3a3a, hoverColor: 0x7f4a4a, fontSize: 14 },
      this.head,
    );
    this.goBtn = this.m.button(
      this.pw - 120,
      fy,
      210,
      44,
      "エントリー",
      () => this.confirm(),
      { color: 0x8e6a2f, hoverColor: 0xb8893c, fontSize: 15 },
      this.head,
    );
  }

  private refreshFooter(): void {
    const n = this.picks().length;
    const cost = this.state.raceEntryCost(this.comp, n);
    const paid = this.state.majorPaidFor(this.comp);
    const afford = this.state.gems + paid >= cost;
    const each = this.state.raceEntryFee(this.comp) + this.state.raceTravelFee(this.comp);
    this.costText
      ?.setText(
        `出場 ${n} / ${this.state.maxMeetEntries()}人（1人 ◆${each}）　出場費 ◆${cost}　所持 ◆${Math.round(this.state.gems)}` +
          (paid > 0 ? `\n払い済みの ◆${paid} は入れ直すときに返す` : ""),
      )
      .setColor(afford ? "#aed6f1" : "#e74c3c");
    const entered = this.sameAsEntered();
    this.goBtn
      ?.setLabel(
        entered
          ? "✅ エントリー済み"
          : n === 0
            ? "エントリー"
            : afford
              ? `◆${cost} でエントリー`
              : "出場費が足りない",
      )
      // 【同じ内容では押せない】変えたときだけ押せる＝二重に申し込んだように見えない
      .setEnabled(!entered && n > 0 && afford);
    if (entered) {
      this.costText
        ?.setText(
          `✅ ${this.comp.name} にエントリー済み（${n}人・${this.state.raceDayLabel(this.state.majorRaceDay())}にレース）\n` +
            "出す選手を変えたいときは印を付け直す／すべて見送るを押す",
        )
        .setColor("#7fd1ae");
    }
  }

  private decline(): void {
    const had = this.state.majorEntriesOf(this.comp).length > 0;
    this.state.setMajorEntries(this.comp, []);
    this.cb.onDone(had ? `${this.comp.name} のエントリーを取り消した（出場費は返金）` : `${this.comp.name} は見送った`);
  }

  /**
   * 申し込む前に一度だけ確認を取る。
   *
   * 出場費は**押した瞬間に引かれる**うえ、出場は1回きり。
   * 押し間違いで起きてよい操作ではないので、誰が何に出るのかと金額を出して確かめる。
   */
  private confirm(): void {
    if (this.sameAsEntered()) return; // 念のため（ボタンは押せなくしてある）
    const picks = this.picks();
    if (picks.length === 0) return;
    const cost = this.state.raceEntryCost(this.comp, picks.length);
    const who = picks
      .map((c) => `${c.student.name}（${STROKE_LABEL[c.event.stroke]}${c.event.distance}m）`)
      .slice(0, 6)
      .join("\n");
    const more = picks.length > 6 ? `\nほか${picks.length - 6}人` : "";
    this.ask?.destroy();
    this.ask = new ConfirmDialog(
      this.scene,
      {
        title: `${this.comp.name} に出場`,
        message:
          `${this.state.raceDayLabel(this.state.majorRaceDay())}にレース。出場費 ◆${cost} をいま払います。\n` +
          `出場するのはこの${picks.length}人です。\n${who}${more}`,
        confirmLabel: `◆${cost} で申し込む`,
        cancelLabel: "やめる",
      },
      () => {
        this.ask?.destroy();
        this.ask = undefined;
        this.apply();
      },
      () => {
        this.ask?.destroy();
        this.ask = undefined;
      },
    );
  }

  /** 確認のあと、実際に申し込む。 */
  private apply(): void {
    const r = this.state.setMajorEntries(this.comp, this.picks());
    if (!r.ok) {
      this.costText?.setText(r.reason ?? "エントリーできない").setColor("#e74c3c");
      return;
    }
    this.cb.onDone(
      `${this.comp.name} に ${r.count}人 エントリー（${this.state.raceDayLabel(this.state.majorRaceDay())}にレース）`,
    );
  }
}
