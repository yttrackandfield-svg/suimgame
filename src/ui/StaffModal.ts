import type Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { equipmentDef } from "../sim/equipment";
import { staffDef, staffEffectLabel, STAFF_ORDER, type StaffKind, type StaffMember } from "../sim/staff";
import type { GameState } from "../sim/state";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";

/**
 * 専門スタッフ（栄養士・ドクター）の雇用画面。
 *
 * コーチと違って選手への割り当ては無く、雇った人数ぶんクラブ全体に効く。
 * 雇うには対応する部屋（食堂／ドクタールーム）が要り、部屋1つにつき2人まで。
 * 「今の効果」を数字で出して、あと1人雇う価値があるかを判断できるようにしている。
 */
export class StaffModal {
  private readonly modal: Modal;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    onClose: () => void,
  ) {
    this.modal = new Modal(
      scene,
      {
        width: Math.min(720, GAME_WIDTH - 44),
        height: 540,
        title: "専門スタッフ",
        subtitle: "コーチとは別枠。雇った人数ぶん、クラブ全員に効く。毎月の給料がかかる。",
        depth: 2500,
      },
      onClose,
    );
    // 雇っている人数が増えると縦に伸びるのでスクロールできるようにしておく
    this.modal.enableScroll(this.modal.contentTop, 540 - this.modal.contentTop - 16);
    this.render();
  }

  destroy(): void {
    this.modal.destroy();
  }

  private render(): void {
    this.modal.clearBody();
    const m = this.modal;
    const body = m.body;
    let y = m.contentTop + 6;

    m.text(20, y, `所持 ◆${Math.round(this.state.gems)}　専門スタッフの月給合計 ◆${this.state.specialistSalary()}`, 13, "#aed6f1", false, body);
    y += 28;

    for (const kind of STAFF_ORDER) {
      y = this.renderKind(kind, y);
      y += 10;
    }

    // 雇っている人の一覧（解雇できる）
    if (this.state.staff.length > 0) {
      m.text(20, y, "雇っているスタッフ", 14, "#f7dc6f", true, body);
      y += 24;
      for (const member of this.state.staff) {
        y = this.renderMember(member, y);
      }
    }

    m.setContentHeight(y - m.contentTop + 20);
  }

  /**
   * 職種ごとのカード。
   *
   * 以前は説明文を左に、雇うボタンを右に置いていたが、日本語は折り返さずに
   * 横へ伸びるので**説明がボタンの上に重なって**どちらも読めなくなっていた。
   * いまは「説明は全幅で折り返す → その下の右端にボタン」という縦積みにして、
   * 文字の量に合わせてカードの高さを伸ばしている。
   */
  private renderKind(kind: StaffKind, y: number): number {
    const m = this.modal;
    const body = m.body;
    const def = staffDef(kind);
    const count = this.state.staffCount(kind);
    const cap = this.state.staffCapacity(kind);
    const room = equipmentDef(def.room);
    const st = this.state.canHireStaff(kind);
    const boxW = m.pw - 40 - m.scrollGutter;
    const textW = boxW - 28;

    const g = this.scene.add.graphics();
    body.add(g);

    // 1行目：職種名（左）と費用（右）
    m.text(34, y + 10, def.label, 16, "#ecf0f1", true, body);
    m.text(20 + boxW - 14, y + 10, `雇用 ◆${def.hireCost}　月給 ◆${def.salary}`, 12.5, "#e8c07a", true, body)
      .setOrigin(1, 0);

    let ty = y + 34;
    const note = m.text(34, ty, "", 12.5, "#9fb3c4", false, body);
    setJaWrap(note, textW);
    note.setText(def.note);
    ty += note.height + 6;

    const stat = m.text(34, ty, "", 12.5, count > 0 ? "#2ecc71" : "#95a6b8", false, body);
    setJaWrap(stat, textW);
    stat.setText(
      `在籍 ${count} / ${cap}人（${room.label} ${this.state.equipmentCount(def.room)}室）　いまの効果：${staffEffectLabel(kind, count)}`,
    );
    ty += stat.height + 8;

    // 雇えない理由はボタンの左に置く（ボタンとは重ならない幅で折り返す）
    if (!st.ok && st.reason) {
      const why = m.text(34, ty + 10, "", 11.5, "#e74c3c", false, body);
      setJaWrap(why, textW - 160);
      why.setText(st.reason);
    }

    const btn = m.button(
      20 + boxW - 76,
      ty + 20,
      132,
      38,
      "雇う",
      () => {
        this.state.hireStaff(kind);
        this.render();
      },
      { color: 0x2e7d5b, hoverColor: 0x3fa876, fontSize: 14 },
      body,
    );
    btn.setEnabled(st.ok);

    const boxH = ty + 44 - y;
    g.fillStyle(0x1c3550, 1);
    g.fillRoundedRect(20, y, boxW, boxH, 8);
    g.lineStyle(1, 0x2e4a66, 1);
    g.strokeRoundedRect(20, y, boxW, boxH, 8);
    body.sendToBack(g); // 下地は文字より後ろへ

    return y + boxH + 8;
  }

  private renderMember(member: StaffMember, y: number): number {
    const m = this.modal;
    const body = m.body;
    const def = staffDef(member.kind);
    const boxW = m.pw - 40 - m.scrollGutter;

    const rect = this.scene.add
      .rectangle(20 + boxW / 2, y + 17, boxW, 34, 0x18293c, 1)
      .setStrokeStyle(1, 0x2e4a66, 1);
    body.add(rect);

    // 「スポーツドクター」のような長い職種名が解雇ボタンに重なっていたので、
    // 位置を箱の幅から計算して置く。名前・職種は左から、月給はボタンのすぐ左に右揃え。
    const btnW = 84;
    const btnRight = 20 + boxW - 10;
    const btnLeft = btnRight - btnW;

    m.text(34, y + 8, member.name, 14, "#ecf0f1", true, body);
    m.text(34 + Math.min(150, boxW * 0.3), y + 10, def.label, 12, "#9fb3c4", false, body);
    m.text(btnLeft - 12, y + 10, `月給 ◆${def.salary}`, 12, "#e8c07a", false, body).setOrigin(1, 0);

    m.button(
      btnLeft + btnW / 2,
      y + 17,
      btnW,
      26,
      "解雇",
      () => {
        this.state.fireStaff(member);
        this.render();
      },
      { color: 0x7f2f2f, hoverColor: 0xa8443a, fontSize: 12 },
      body,
    );

    return y + 40;
  }
}
