import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";
import { classLabel } from "../sim/classes";
import { researchTopic } from "../sim/research";
import { RESEARCH } from "../config/balance";
import {
  coachGradeColor,
  coachGradeLabel,
  coachRankLabel,
  teachingColor,
  teachingLabel,
  teachingMult,
  coachSalary,
  coachSpecialtyLabel,
  type Coach,
} from "../sim/coach";
import { staffDef, type StaffMember } from "../sim/staff";
import { charTypeOf, staffKey, type StaffLook } from "../gfx/textures";
import { applyCharSprite, charTexture } from "../gfx/charAssets";
import { GUEST_CATEGORY_LABEL, type GuestCategory, type GuestProfile } from "../sim/guests";
import { moodColor, moodLabel } from "../sim/satisfaction";
import { slotLabel } from "../sim/timetable";
import { STAFF } from "../config/balance";
import type { GameState } from "../sim/state";

/**
 * 職員1人ぶんの詳細（施設で本人をタップすると開く）。
 *
 * 一覧（コーチ／専門スタッフの画面）は「雇う・クビにする・担当を決める」ための場所。
 * こちらは**その場に立っている本人**を指して「この人は誰で、何をしているのか」を見る場所なので、
 * 名前・顔・格・得意・給料・今の持ち場・今日の担当コマ、までを1枚にまとめる。
 */

export interface PersonCardCallbacks {
  /** 一覧を開く（担当やクビはそちらで行う）。一般客には一覧が無いので省略できる。 */
  onOpenList?: () => void;
  onClose: () => void;
}

/** 一般客1人ぶん（見るだけの情報）。 */
export interface GuestCardInfo {
  profile: GuestProfile;
  category: GuestCategory;
  /** 落としていく利用料（辿り着けなければ 0）。 */
  fee: number;
  /** 道が繋がっておらず、使えずに帰る客か。 */
  turnedAway: boolean;
  /** 絵柄の番号（施設に立っているのと同じ顔を出すため）。 */
  variant: number;
  /**
   * この来場ぶんの満足度 0-100（まだ使い始めていなければ 0）。
   * 混雑・設備のグレード・ゆっくりできたかで決まる（→ sim/satisfaction.ts）。
   */
  satisfaction?: number;
  /** 満足して帰るときに落とす貢献値（月末に人気度になる）。 */
  contribution?: number;
}

const W = Math.min(560, GAME_WIDTH - 30);

export class PersonCardModal {
  private readonly m: Modal;

  constructor(
    scene: Phaser.Scene,
    private readonly state: GameState,
    person:
      | { kind: "coach"; coach: Coach }
      | { kind: "staff"; staff: StaffMember }
      | { kind: "guest"; guest: GuestCardInfo },
    cb: PersonCardCallbacks,
  ) {
    const isCoach = person.kind === "coach";
    const isGuest = person.kind === "guest";
    this.m = new Modal(
      scene,
      {
        width: W,
        height: isGuest ? 360 : 480,
        title: isCoach ? person.coach.name : isGuest ? person.guest.profile.name : person.staff.name,
        subtitle: isCoach ? "コーチ" : isGuest ? "一般のお客さん" : staffDef(person.staff.kind).label,
        depth: 2600,
      },
      () => cb.onClose(),
    );

    // 顔（施設に立っているのと同じ絵を大きく出す）
    const guestType = isGuest ? charTypeOf("guest", person.guest.variant).id : "";
    const face = isGuest
      ? charTexture("walk", "guest", person.guest.variant, guestType)
      : staffKey(isCoach ? ("coach" as StaffLook) : person.staff.kind, isCoach ? person.coach.id : person.staff.id);
    // 描き起こした素材は解像度が違うので、ドット絵と同じ見た目の大きさに揃える
    const portrait = scene.add.sprite(64, this.m.contentTop + 66, face).setOrigin(0.5, 0.5).setScale(3.2);
    if (isGuest) applyCharSprite(portrait, "walk", "guest", person.guest.variant, guestType, 3.2);
    this.m.container.add(portrait);

    const lines = isCoach
      ? this.coachLines(person.coach)
      : isGuest
        ? this.guestLines(person.guest)
        : this.staffLines(person.staff);
    let y = this.m.contentTop + 6;
    for (const line of lines) {
      const t = this.m.text(126, y, line.text, line.size ?? 14, line.color, line.bold ?? false);
      setJaWrap(t, W - 150);
      y += t.height + 6;
    }

    const footY = isGuest ? 310 : 430;
    if (!isGuest && cb.onOpenList) {
      const openList = cb.onOpenList;
      this.m.button(W / 2 - 90, footY, 168, 42, isCoach ? "コーチ一覧へ" : "スタッフ一覧へ", () => {
        cb.onClose();
        openList();
      }, { color: 0x2c5f8f, hoverColor: 0x3d78b0, fontSize: 14 });
    }
    this.m.button(isGuest ? W / 2 : W / 2 + 92, footY, 150, 42, "閉じる", () => cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });
  }

  destroy(): void {
    this.m.destroy();
  }

  // ---------------------------------------------------------------- 中身

  private coachLines(c: Coach): { text: string; color: string; size?: number; bold?: boolean }[] {
    const out: { text: string; color: string; size?: number; bold?: boolean }[] = [];
    out.push({
      text: `${coachRankLabel(c.quality)}　${coachGradeLabel(c.quality)}`,
      color: coachGradeColor(c.quality),
      size: 15,
      bold: true,
    });
    // 指導力（格とは別の、研究で伸びる能力）。練習効率に直接効く。
    out.push({
      text: `指導力：${Math.round(c.teaching)} / 100（${teachingLabel(c.teaching)}）　練習の伸び ${Math.round(teachingMult(c.teaching) * 100)}%`,
      color: teachingColor(c.teaching),
      size: 14,
      bold: true,
    });
    out.push({ text: `得意な泳法：${coachSpecialtyLabel(c)}`, color: "#aed6f1" });
    {
      const duties = this.state.coachDutyCount(c.id);
      out.push({
        text: `給料：◆${coachSalary(c, duties)} / 月` + (duties > 0 ? `（担当${duties}コマぶん込み）` : ""),
        color: "#f7dc6f",
      });
    }
    out.push({
      text: c.assigned ? `監督：${classLabel(c.assigned)}` : "監督：なし（スクール全体を手伝う）",
      color: c.assigned ? "#2ecc71" : "#9fb0c2",
    });
    {
      const project = this.state.projectOfCoach(c.id);
      const topic = project ? researchTopic(project.id) : null;
      out.push({
        text: project
          ? `空き時間：会議室で研究（${topic?.label ?? ""} Lv${project.targetLevel}・${this.state.membersOf(project).length}/${RESEARCH.groupSize}人）`
          : "空き時間：コーチ室で待機（ときどき掃除）",
        color: project ? "#bb8fce" : "#9fb0c2",
      });
      if (project) {
        out.push({ text: "研究に参加している間は、毎月 指導力が伸びる", color: "#7fd1ae", size: 12 });
      }
    }

    // 今日の担当コマ（時間割）
    const duties = this.state.timetable
      .filter((e) => e.coachId === c.id)
      .sort((a, b) => a.slot - b.slot)
      .map((e) => {
        const okNow = this.state.timetableStatus(e).ok;
        return `${slotLabel(e.slot)} ${classLabel(e.classId)}（${this.state.poolLabelOf(e.poolId)}）${okNow ? "" : " ⚠"}`;
      });
    out.push({ text: "担当のコマ", color: "#ecf0f1", bold: true, size: 14 });
    if (duties.length === 0) {
      out.push({ text: "なし（時間割で担当を割り当てよう）", color: "#e59866", size: 13 });
    } else {
      for (const d of duties) out.push({ text: `・${d}`, color: "#d5dde5", size: 13 });
    }
    out.push({
      text: "※ コーチは同じ時間に1つのプールだけ。並行して開くなら別のコーチが要る。",
      color: "#95a6b8",
      size: 11.5,
    });
    return out;
  }

  /**
   * 一般客の一枚。
   * クラブ生ではないので、名前・年齢・来た目的・落とすお金だけの軽い内容にしてある。
   * 道が繋がっていなくて帰る客は、その理由をはっきり書く（動線を直す手がかりになる）。
   */
  private guestLines(g: GuestCardInfo): { text: string; color: string; size?: number; bold?: boolean }[] {
    const out: { text: string; color: string; size?: number; bold?: boolean }[] = [];
    out.push({ text: `${g.profile.age}歳・${g.profile.job}`, color: "#aed6f1", size: 15, bold: true });
    out.push({ text: `お目当て：${GUEST_CATEGORY_LABEL[g.category]}`, color: "#7fd1ae" });
    out.push({ text: `「${g.profile.purpose}」`, color: "#d5dde5", size: 13 });
    if (g.turnedAway) {
      out.push({ text: "入口から道が繋がっておらず、使えずに帰るところ。", color: "#e74c3c", size: 13 });
      out.push({ text: "※ 部屋まで道を敷けば、この客も料金を落としていく。", color: "#95a6b8", size: 11.5 });
    } else {
      out.push({ text: `利用料：◆${g.fee}`, color: "#f7dc6f" });
      // 【満足度】まだ使い始めていない客は 0（＝測っていない）ので出さない
      if (g.satisfaction && g.satisfaction > 0) {
        out.push({
          text: `機嫌：${moodLabel(g.satisfaction)}${g.contribution ? `（帰りに貢献 +${g.contribution}）` : ""}`,
          color: `#${moodColor(g.satisfaction).toString(16).padStart(6, "0")}`,
        });
        out.push({
          text: "※ 混んでいると下がる。良い設備・空いている時間ほど満足して帰り、人気度に効く。",
          color: "#95a6b8",
          size: 11.5,
        });
      }
      out.push({ text: "※ 一般開放はレッスンの入っていないコマだけ。人気度が高いほど客が増える。", color: "#95a6b8", size: 11.5 });
    }
    return out;
  }

  private staffLines(m: StaffMember): { text: string; color: string; size?: number; bold?: boolean }[] {
    const def = staffDef(m.kind);
    const n = this.state.staff.filter((x) => x.kind === m.kind).length;
    const out: { text: string; color: string; size?: number; bold?: boolean }[] = [];
    out.push({ text: def.label, color: "#7fd1ae", size: 15, bold: true });
    out.push({ text: def.note, color: "#d5dde5", size: 13 });
    out.push({ text: `給料：◆${def.salary} / 月`, color: "#f7dc6f" });
    out.push({ text: `働く場所：${m.kind === "nutritionist" ? "食堂" : "ドクタールーム"}`, color: "#aed6f1" });
    out.push({ text: `いま ${n}人（部屋1つにつき${def.capacityPerRoom}人まで）`, color: "#aed6f1" });
    out.push({ text: "効果", color: "#ecf0f1", bold: true, size: 14 });
    if (m.kind === "nutritionist") {
      const c = STAFF.nutritionist;
      out.push({ text: `・疲れが抜けやすくなる（1人あたり +${Math.round(c.recoveryPer * 100)}%）`, color: "#d5dde5", size: 13 });
      out.push({ text: `・練習の伸びが上がる（1人あたり +${Math.round(c.growthPer * 100)}%）`, color: "#d5dde5", size: 13 });
    } else {
      const c = STAFF.doctor;
      out.push({
        text: `・ケガをしにくくなる（1人あたり ${Math.round((1 - c.injuryChancePer) * 100)}%減）`,
        color: "#d5dde5",
        size: 13,
      });
      out.push({ text: `・ケガの治りが早くなる（1人あたり +${Math.round(c.healPer * 100)}%）`, color: "#d5dde5", size: 13 });
    }
    out.push({ text: "※ 効果は雇っている人数で決まる（配属を考えなくてよい）。", color: "#95a6b8", size: 11.5 });
    return out;
  }
}
