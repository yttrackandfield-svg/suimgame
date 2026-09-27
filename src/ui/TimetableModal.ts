import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, gemsText } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { CLASS_ORDER, classLabel, isSchoolClass, type ClassId } from "../sim/classes";
import { PickerModal, type PickerOption } from "./PickerModal";
import type { Coach } from "../sim/coach";
import {
  coachGradeColor,
  coachGradeLabel,
  coachRankLabel,
  coachSalary,
  coachSpecialtyLabel,
} from "../sim/coach";
import { SLOTS } from "../sim/timetable";
import { equipmentDef, isTrainingRoom, venueSlotsOf } from "../sim/equipment";
import { TIMETABLE } from "../config/balance";
import type { GameState } from "../sim/state";

/**
 * 時間割編成。
 *
 * プールが1つのうちは1本道だが、2つ目を建てると
 * 「同じ時間に、別のプールで、別のクラスを回す」ことができる。
 *
 * 1コマ＝1クラス＝担当コーチ1人。コーチが付いていないコマは開講できない。
 * 幼児・学童はコマを増やすほど受け入れられる人数が増える（＝月謝収入が増える）。
 * ただしコマにはコーチが要るので、給料とのトレードオフになる。
 *
 * 画面の作り：プールごとにセクションを縦に並べ、各コマの行に
 *   ［クラス ◀▶］［コーチ ◀▶］［状態］
 * を出す。スマホで押しやすいよう、選択はすべて送り送りのボタンにしてある。
 */

export interface TimetableCallbacks {
  onChanged: () => void;
  onClose: () => void;
}

/** クラスの選択肢（空きコマ＝null を先頭に）。 */
const CLASS_CHOICES: (ClassId | null)[] = [null, ...CLASS_ORDER.map((c) => c.id)];

/** 1コマぶんの行の高さ（上段＝クラス、下段＝担当コーチ の2段ぶん）。 */
const ROW_H = 70;

export class TimetableModal {
  private readonly m: Modal;
  private readonly head: Phaser.GameObjects.Container;
  private readonly listTop: number;
  private summary!: Phaser.GameObjects.Text;
  /** クラス／コーチを一覧から選ぶ画面。 */
  private picker?: PickerModal<never> | PickerModal<ClassId | null> | PickerModal<number | null>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly cb: TimetableCallbacks,
  ) {
    this.m = new Modal(
      scene,
      {
        width: Math.min(720, GAME_WIDTH - 16),
        height: Math.min(880, GAME_HEIGHT - 30),
        title: "時間割",
        subtitle:
          "どのプールの、どの時間に、どのクラスを回すか。プールを増やすと同じ時間に並行して練習できる。",
        depth: 2500,
      },
      () => cb.onClose(),
    );
    this.head = scene.add.container(0, 0);
    this.m.container.add(this.head);

    // 日本語は分かち書きしないので、Phaser の既定の折り返し（setWordWrapWidth）では止まらない。
    // そのままだと説明がパネルの外へ伸びて切れる（→ ui/textWrap.ts）。
    this.summary = this.m.text(18, this.m.contentTop, "", 12.5, "#aed6f1", true, this.head);
    setJaWrap(this.summary, this.m.pw - 36);

    // 見出しの行数は変わらない（数字だけが変わる）ので、ここで一度実測して一覧の開始位置を決める。
    // enableScroll の窓は開き直しても同じでなければならない（→ Modal の規約）。
    this.updateSummary();
    this.listTop = this.m.contentTop + this.summary.height + 14;
    this.m.enableScroll(this.listTop, this.m.ph - this.listTop - 60);

    this.m.button(this.m.pw / 2 - 90, this.m.ph - 30, 160, 40, "コーチおまかせ", () => this.autoAssign(), {
      color: 0x2c5f8f,
      hoverColor: 0x3d78b0,
      fontSize: 14,
    }, this.head);
    this.m.button(this.m.pw / 2 + 92, this.m.ph - 30, 150, 40, "閉じる", () => this.cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    }, this.head);

    this.render();
  }

  destroy(): void {
    this.closePicker();
    this.m.destroy();
  }

  private autoAssign(): void {
    const n = this.state.autoAssignCoaches();
    this.render();
    this.cb.onChanged();
    void n;
  }

  // ---------------------------------------------------------------- 描画

  /**
   * 見出し：いまの定員がどうなっているか（コマ／プールを増やす動機を明示する）。
   *   スクール … 開講したコマ数 × そのプールのレーン数
   *   育成B以上 … 使えるプールのレーン数（6レーン＝基準の定員ぶん）
   */
  private updateSummary(): void {
    const pools = this.state.placedPools();
    const youji = this.state.capacityOf("youji");
    const gakudo = this.state.capacityOf("gakudo");
    this.summary.setText(
      `プール ${pools.length}本　｜　幼児 定員${youji}人（${this.state.slotCountFor("youji")}コマ）` +
        `　学童 定員${gakudo}人（${this.state.slotCountFor("gakudo")}コマ）\n` +
        `育成B ${this.state.capacityOf("ikuseiB")}／育成A ${this.state.capacityOf("ikuseiA")}` +
        `／選手 ${this.state.capacityOf("senshu")}／プロ ${this.state.capacityOf("pro")}人（固定。プールを増やしても変わらない）\n` +
        `スクールは1コマ ＝ レーン数 × ${TIMETABLE.schoolPerLane}人。1人が出るのは1コマだけで、前のコマから埋まる。\n` +
        `幼児・学童は同じ時間に何本のプールでも開ける（そのぶん定員が増える／コーチも人数ぶん要る）。\n` +
        `育成B以上は同じ時間に1つだけ。別のプールでなら、別のクラスを同時に回せる。\n` +
        `コーチは同じ時間に1つのプールだけ。クラス名・コーチ名をタップすると一覧から選べる。\n` +
        `医科学センター（フォーム・スタート・ターン）と低酸素トレーニングルーム（持久力）も、` +
        `コマに育成B以上のクラスを入れると、その能力が大きく伸びる（部屋では泳法は伸びない）。`,
    );
  }

  private render(): void {
    // 中のボタンを押して描き直すので、見ていた位置を保つ（先頭に戻さない）
    this.m.clearBody(true);
    // プールのあとに、医科学センター・低酸素トレーニングルームも並べる（→ timetable.venuesOf）
    const pools = this.state.placedVenues();
    this.updateSummary();

    if (pools.length === 0) {
      this.m
        .text(this.m.pw / 2, this.listTop + 40, "使えるプールがありません。\n設備でプールを買い、建設モードで道を繋ごう。", 14, "#e67e22", false, this.m.body)
        .setOrigin(0.5, 0);
      this.m.setContentHeight(0);
      return;
    }

    let y = this.listTop + 6;
    for (const pool of pools) {
      const usable = this.state.isRoomUsable(pool);
      const label = this.state.poolLabelOf(pool.id);
      const head = this.m.text(
        20,
        y,
        (isTrainingRoom(pool.kind)
          ? `${label}　（${pool.kind === "science" ? "フォーム・スタート・ターン" : "持久力"}が伸びる／育成B以上）`
          : `${label}　（1コマ ${venueSlotsOf(pool.kind)}人${pool.kind === "pool10" ? "／練習の伸び ×1.5" : ""}）`) +
          (usable ? "" : "　⚠ 歩いて行けない"),
        14,
        usable ? "#f7dc6f" : "#e74c3c",
        true,
        this.m.body,
      );
      setJaWrap(head, this.m.pw - 60);
      y += 24;

      for (let slot = 0; slot < SLOTS.length; slot++) {
        this.buildRow(pool.id, slot, y, usable);
        y += ROW_H;
      }
      y += 12;
    }
    this.m.setContentHeight(y + 20);
  }

  /**
   * 1コマぶんの行。狭い縦画面に収めるため2段に分けてある。
   *   上段 … 時間帯 ／ ◀ クラス ▶
   *   下段 … 担当  ／ ◀ コーチ ▶ ／ 状態（右端）
   * 1段に詰めるとコーチ名と ◀▶ ボタン、状態表示が重なるので分けている。
   */
  private buildRow(poolId: number, slot: number, y: number, poolUsable: boolean): void {
    const body = this.m.body;
    const gutter = this.m.scrollGutter;
    const w = this.m.pw - 36 - gutter;
    const right = 18 + w - 10;
    const entry = this.state.timetableEntryAt(poolId, slot);
    const classId = entry?.classId ?? null;

    const status = entry ? this.state.timetableStatus(entry) : { ok: false as const };
    const active = !!entry && status.ok;

    const rect = this.scene.add
      .rectangle(18 + w / 2, y + ROW_H / 2 - 4, w, ROW_H - 8, active ? 0x1f4a3a : 0x1c3550, 1)
      .setStrokeStyle(1, active ? 0x2ecc71 : 0x2e4a66, 1);
    body.add(rect);

    // ◀▶ の位置は上下段でそろえる（目が迷わないように）
    const prevX = 118;
    const nextX = 262;
    const labelX = (prevX + nextX) / 2;
    const wrapW = nextX - prevX - 40;

    // --- 上段：時間帯 ／ クラス
    const row1 = y + 20;
    this.m.text(28, row1 - 8, SLOTS[slot].label, 13, "#bdc3c7", true, body);
    this.m.button(prevX, row1, 30, 28, "◀", () => this.cycleClass(poolId, slot, -1), { fontSize: 12 }, body);
    // 【幅を決めてから中身を入れる】setJaWrap は「次に中身が変わったとき」から効くので、
    // 文字を入れたあとに呼んでも折り返らない（→ ui/textWrap.ts）。
    const classText = this.m.text(labelX, row1 - 8, "", 13, classId ? "#ecf0f1" : "#7fd1ae", true, body).setOrigin(0.5, 0);
    setJaWrap(classText, wrapW);
    // 練習の部屋は一般開放しない（空きは空きのまま）
    const room = this.state.equipment.find((e) => e.id === poolId);
    const trainingRoom = !!room && isTrainingRoom(room.kind);
    classText.setText(classId ? classLabel(classId) : trainingRoom ? "空き" : "空き（一般開放）");
    // 名前をタップすると一覧から選べる（◀▶ は細かい調整用に残す）
    this.tapZone(labelX, row1 + 2, wrapW + 20, 30, () => this.pickClass(poolId, slot));
    this.m.button(nextX, row1, 30, 28, "▶", () => this.cycleClass(poolId, slot, 1), { fontSize: 12 }, body);

    // 空きコマは一般開放なので、下段は出さない
    if (!classId) {
      this.m.text(right, row1 - 7, trainingRoom ? "使わない" : "一般客が使う", 10.5, "#7fd1ae", false, body).setOrigin(1, 0);
      return;
    }

    // --- 下段：担当コーチ ／ 状態
    const row2 = y + 46;
    const coach = this.state.coaches.find((c) => c.id === entry?.coachId);
    /**
     * 【月給は名前と同じ枠に入れない】以前は「瀬戸コーチ　◆193」を ◀▶ のあいだ（104px）に
     * まとめて置いていた。コーチの月給は質5で ◆560、掛け持ちが増えると4桁になるので、
     * 名前と並べると枠から溢れて ▶ ボタンに重なる。月給は左の「担当」の位置に出す。
     */
    const salary = coach ? `◆${gemsText(coachSalary(coach, this.state.coachDutyCount(coach.id)))}` : "担当なし";
    this.m.text(28, row2 - 7, salary, 11.5, coach ? "#9fb3c4" : "#e67e22", false, body);
    this.m.button(prevX, row2, 30, 28, "◀", () => this.cycleCoach(poolId, slot, -1), { fontSize: 12 }, body);
    const coachText = this.m
      .text(labelX, row2 - 7, "", 12, coach ? "#aed6f1" : "#e67e22", false, body)
      .setOrigin(0.5, 0);
    setJaWrap(coachText, wrapW);
    coachText.setText(coach ? coach.name : "コーチ未配置");
    this.tapZone(labelX, row2 + 3, wrapW + 20, 28, () => this.pickCoach(poolId, slot));
    this.m.button(nextX, row2, 30, 28, "▶", () => this.cycleCoach(poolId, slot, 1), { fontSize: 12 }, body);

    // 【分母はクラスの定員】プールのレーン枠（6レーン＝60人）と混同しないこと。
    //   スクール（幼児・学童）… 1コマで受け入れられるのはレーン枠まで＝そこが定員
    //   育成B〜プロ          … クラスの定員（育成B24 / 育成A24 / 選手18 / プロ8）
    // 以前はどのクラスでもレーン枠を出していたので、育成でも「/60」と表示されていた。
    const poolSlots = venueSlotsOf(this.state.equipment.find((e) => e.id === poolId)?.kind ?? "pool6");
    const cap = isSchoolClass(classId) ? poolSlots : Math.min(this.state.capacityOf(classId), poolSlots);
    // このコマに実際に割り当たっている人数。
    // スクールは1人1コマなので、在籍が少なければ後ろのコマは 0人＝誰も来ない。
    const here = status.ok ? this.state.assignedCount(poolId, slot) : 0;

    // 状態（開講できているか／できない理由）。◀▶ の右側だけを使う。
    const note = !status.ok
      ? { text: poolUsable ? (status.reason ?? "開講できない") : "入口から歩いて行けない", color: "#e59866" }
      : here === 0
        ? { text: `0 / ${cap}人（誰も使わない）`, color: "#95a6b8" }
        : { text: `${here} / ${cap}人`, color: here >= cap ? "#f7dc6f" : "#2ecc71" };
    this.m
      .text(right, row2 - 7, note.text, 10.5, note.color, false, body)
      .setOrigin(1, 0);
  }

  // ---------------------------------------------------------------- 操作

  private cycleClass(poolId: number, slot: number, dir: number): void {
    const entry = this.state.timetableEntryAt(poolId, slot);
    const cur = entry?.classId ?? null;
    let idx = CLASS_CHOICES.findIndex((c) => c === cur);
    if (idx < 0) idx = 0;

    // 置けないクラス（育成〜プロで、同じ時間に別のプールで開いている）は飛ばして次へ。
    // 押しても何も起きない、という状態を作らない。
    for (let step = 0; step < CLASS_CHOICES.length; step++) {
      idx = (idx + dir + CLASS_CHOICES.length) % CLASS_CHOICES.length;
      const next = CLASS_CHOICES[idx];
      // 空きに戻すときはコーチも外す。クラスを入れるときは空いているコーチを1人あてがう。
      const coachId = next
        ? entry?.coachId ?? this.state.availableCoachesFor(slot, poolId)[0]?.id ?? null
        : null;
      const r = this.state.setTimetableEntry(poolId, slot, next, coachId);
      if (!r.ok) continue;
      this.render();
      this.cb.onChanged();
      return;
    }
  }

  private cycleCoach(poolId: number, slot: number, dir: number): void {
    const entry = this.state.timetableEntryAt(poolId, slot);
    if (!entry) return;
    // 「未配置」を選択肢の先頭に入れて送る
    const choices: (number | null)[] = [null, ...this.state.availableCoachesFor(slot, poolId).map((c) => c.id)];
    let idx = choices.findIndex((c) => c === entry.coachId);
    if (idx < 0) idx = 0;
    idx = (idx + dir + choices.length) % choices.length;
    const r = this.state.setTimetableEntry(poolId, slot, entry.classId, choices[idx]);
    if (!r.ok) return;
    this.render();
    this.cb.onChanged();
  }

  // ---------------------------------------------------------------- 一覧から選ぶ

  /** 文字の上にタップ判定を重ねる（見た目は変えず、押せるようにする）。 */
  private tapZone(cx: number, cy: number, w: number, h: number, fn: () => void): void {
    const z = this.scene.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    z.on("pointerup", (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation?.();
      fn();
    });
    this.m.body.add(z);
  }

  private closePicker(): void {
    this.picker?.destroy();
    this.picker = undefined;
  }

  /** そのコマのクラスを一覧から選ぶ。 */
  private pickClass(poolId: number, slot: number): void {
    const entry = this.state.timetableEntryAt(poolId, slot);
    const cur = entry?.classId ?? null;
    const options: PickerOption<ClassId | null>[] = CLASS_CHOICES.map((c) => {
      if (!c) {
        return {
          value: null,
          label: "空き（一般開放）",
          note: "レッスンを入れない。一般客が使って収入になる。",
          color: "#7fd1ae",
        };
      }
      // 置けるかどうかを、実際の判定と同じ理由で出す
      const blocked = this.blockReason(poolId, slot, c, cur);
      const cap = this.state.capacityOf(c);
      return {
        value: c as ClassId | null,
        label: classLabel(c),
        note: isSchoolClass(c)
          ? `スクール（在籍 ${this.state.students[c].length} / 定員 ${cap}人）`
          : `特別クラス（在籍 ${this.state.students[c].length} / 定員 ${cap}人）`,
        disabled: blocked,
      };
    });

    this.closePicker();
    this.picker = new PickerModal<ClassId | null>(
      this.scene,
      `${this.state.poolLabelOf(poolId)}　${SLOTS[slot].label}`,
      "このコマで練習するクラスを選ぶ",
      options,
      cur,
      (v) => {
        const coachId = v ? entry?.coachId ?? this.state.availableCoachesFor(slot, poolId)[0]?.id ?? null : null;
        this.state.setTimetableEntry(poolId, slot, v, coachId);
        this.closePicker();
        this.render();
        this.cb.onChanged();
      },
      () => this.closePicker(),
    );
  }

  /**
   * そのクラスをこのコマに置けない理由（置けるなら undefined）。
   *
   * 【sim と同じ理由にする】置けるかどうかを決めているのは
   * `GameState.setTimetableEntry` なので、ここもそれと同じ条件にする。
   *   ・育成B以上は、**同じクラス**が同じ時間に別のプールへ入っていたら置けない
   *   ・幼児・学童は重ねられる（2026-09-19）
   *
   * 以前ここは「同じ時間に育成以上が**1つでもあれば**置けない」になっていて、
   * 「プール①で育成B、プール②で選手」という sim では通る組み合わせまで
   * 一覧で灰色になっていた（＝画面のほうが厳しかった）。
   */
  private blockReason(poolId: number, slot: number, c: ClassId, cur: ClassId | null): string | undefined {
    if (c === cur) return undefined;
    const venue = this.state.equipment.find((e) => e.id === poolId);
    if (venue && isTrainingRoom(venue.kind) && isSchoolClass(c)) return "スクールは使えない（育成B以上）";
    if (isSchoolClass(c)) return undefined;
    const other = this.state.timetable.find(
      (e) => e.slot === slot && e.poolId !== poolId && e.classId === c,
    );
    if (other) return `この時間はすでに${classLabel(other.classId)}が入っている`;
    return undefined;
  }

  /** そのコマの担当コーチを一覧から選ぶ。 */
  private pickCoach(poolId: number, slot: number): void {
    const entry = this.state.timetableEntryAt(poolId, slot);
    if (!entry) return;
    const free = new Set(this.state.availableCoachesFor(slot, poolId).map((c) => c.id));
    const options: PickerOption<number | null>[] = [
      { value: null, label: "担当なし", note: "担当がいないコマは開講できない。", color: "#e67e22" },
      ...this.state.coaches.map((c) => {
        const busy = this.state.timetable.find(
          (e) => e.slot === slot && e.coachId === c.id && e.poolId !== poolId,
        );
        return {
          value: c.id as number | null,
          label: `${c.name}　${coachRankLabel(c.quality)}`,
          note: coachNote(this.state, c, entry.coachId === c.id),
          disabled:
            !free.has(c.id) && busy
              ? `この時間は${this.state.poolLabelOf(busy.poolId)}を担当中`
              : undefined,
          color: coachGradeColor(c.quality),
        };
      }),
    ];

    this.closePicker();
    this.picker = new PickerModal<number | null>(
      this.scene,
      `${classLabel(entry.classId)}　${SLOTS[slot].label}`,
      "このコマの担当コーチを選ぶ（同じ時間に掛け持ちはできない）",
      options,
      entry.coachId,
      (v) => {
        this.state.setTimetableEntry(poolId, slot, entry.classId, v);
        this.closePicker();
        this.render();
        this.cb.onChanged();
      },
      () => this.closePicker(),
    );
  }
}

/**
 * コーチ選びの説明行。
 * **いま選ぶといくらになるか**を出す（掛け持ちは格が高いほど高くつく）。
 */
function coachNote(state: GameState, c: Coach, alreadyHere: boolean): string {
  const duties = state.coachDutyCount(c.id);
  const now = coachSalary(c, duties);
  const after = alreadyHere ? now : coachSalary(c, duties + 1);
  const delta = after - now;
  return (
    `${coachGradeLabel(c.quality)}／得意 ${coachSpecialtyLabel(c)}／担当${duties}コマ　月給 ◆${now}` +
    (alreadyHere ? "（このコマを担当中）" : `　→ 任せると ◆${after}（+${delta}）`)
  );
}

/** 表示用：その部屋がプールかどうか（呼び出し側の判定を1か所に）。 */
export function poolDisplayName(kind: Parameters<typeof equipmentDef>[0]): string {
  return equipmentDef(kind).label;
}
