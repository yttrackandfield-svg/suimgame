import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { Modal } from "./Modal";
import { measureJaHeight, setJaWrap } from "./textWrap";
import {
  equipmentDef,
  gradeLabel,
  gradeOf,
  hasGrade,
  isBathRoom,
  isPool,
  laneSlotsOf,
  MAX_GRADE,
  stationsOf,
  type Equipment,
} from "../sim/equipment";
import { BATHING, DORM, RECOVERY_ROOM } from "../config/balance";
import type { GameState } from "../sim/state";

/**
 * 施設の情報パネル（マップの部屋をタップすると開く）。
 *
 * 以前は部屋名の札をマップに出しっぱなしにしていたが、部屋が増えるほど札で
 * 画面が埋まってしまう。**名前も説明もここにまとめて、タップしたときだけ出す。**
 *
 * 出すのは「その部屋が何をする場所か」と、いま効いている数（グレード・使える人数・維持費）。
 * 説明文は施設定義（config/balance.ts の EQUIPMENT.rooms[kind].description）から引くので、
 * 文言を直すときはこの画面ではなくデータ側を直す。
 */

export interface RoomInfoCallbacks {
  onClose: () => void;
  /** 「設備・建設」へ（グレードを上げる・増やす）。 */
  onOpenShop: () => void;
  /** 時間割へ（プールをタップしたとき）。 */
  onOpenTimetable?: () => void;
  /** 寮の管理へ。 */
  onOpenDorm?: () => void;
}

/** 1行ぶん。 */
interface Row {
  label: string;
  value: string;
  color?: string;
}

export class RoomInfoModal {
  private readonly m: Modal;

  constructor(scene: Phaser.Scene, state: GameState, room: Equipment, cb: RoomInfoCallbacks) {
    const def = equipmentDef(room.kind);
    const rows = RoomInfoModal.rowsFor(state, room);
    const canUpgrade = hasGrade(room.kind) && gradeOf(room) < MAX_GRADE;
    const width = Math.min(460, GAME_WIDTH - 30);
    // 説明文＋行数＋ボタンぶんで高さを決める（行が増えても重ならない）。
    // 【説明文は行数を決め打ちしない】Modal の高さは作ったあと変えられないので、
    // 折り返したあとの実際の高さを先に測る（→ measureJaHeight）。
    // 決め打ちにしていたころ、説明文を1行ぶん長くしただけで行がボタンに重なった。
    const descH = measureJaHeight(scene, def.description, 13.5, width - 44);
    const height = 170 + descH + rows.length * 26 + (canUpgrade ? 8 : 0);

    this.m = new Modal(
      scene,
      {
        width,
        height,
        title: def.label,
        subtitle: state.usableRoomIds().has(room.id) ? "使えています" : "⚠ 入口から道が繋がっていません",
        depth: 2560,
      },
      () => cb.onClose(),
    );

    const L = 22;
    let y = this.m.contentTop + 2;
    const desc = this.m.text(L, y, def.description, 13.5, "#cfe0ee");
    setJaWrap(desc, width - L * 2);
    y += desc.height + 12;

    for (const r of rows) {
      this.m.text(L, y, r.label, 13, "#9fb3c4");
      this.m.text(width - L, y, r.value, 13.5, r.color ?? "#ecf0f1", true).setOrigin(1, 0);
      y += 26;
    }

    // ショートカット（アップグレードできる部屋は「設備・建設」へ誘導）
    const btnY = height - 34;
    const shortcut = isPool(room.kind) && cb.onOpenTimetable ? "時間割へ" : room.kind === "dorm" && cb.onOpenDorm ? "寮の管理へ" : canUpgrade ? "設備・建設へ" : "";
    if (shortcut) {
      this.m.button(width / 2 - 88, btnY, 160, 42, shortcut, () => {
        cb.onClose();
        if (isPool(room.kind) && cb.onOpenTimetable) cb.onOpenTimetable();
        else if (room.kind === "dorm" && cb.onOpenDorm) cb.onOpenDorm();
        else cb.onOpenShop();
      }, { color: 0x2c5f8f, hoverColor: 0x3d78b0, fontSize: 14 });
    }
    this.m.button(shortcut ? width / 2 + 88 : width / 2, btnY, 150, 42, "閉じる", () => cb.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });
  }

  destroy(): void {
    this.m.destroy();
  }

  /** その部屋で意味のある数字だけを行にする（無いものは出さない）。 */
  private static rowsFor(state: GameState, room: Equipment): Row[] {
    const def = equipmentDef(room.kind);
    const out: Row[] = [];
    if (hasGrade(room.kind)) {
      const g = gradeOf(room);
      out.push({
        label: "グレード",
        value: `${gradeLabel(g)}（${g} / ${MAX_GRADE}）`,
        color: "#a78bfa",
      });
      out.push({ label: "同時に使える人数", value: `${stationsOf(room)}人`, color: "#7fd1ae" });
    }
    if (isPool(room.kind)) {
      out.push({ label: "レーン", value: `${def.lanes}本`, color: "#7fd1ae" });
      out.push({ label: "1コマで練習できる人数", value: `${laneSlotsOf(room.kind)}人`, color: "#7fd1ae" });
    }
    // 温浴施設（サウナ・風呂・外気浴）は定員4名・1コマ利用。
    // マッサージエリアはグレードで定員が変わるので、上の「同時に使える人数」だけで出す
    if (isBathRoom(room.kind)) {
      out.push({
        label: "同時に使える人数",
        value: `${RECOVERY_ROOM.seatsPerRoom}人（練習後に1コマぶん使う）`,
        color: "#7fd1ae",
      });
    }
    const bath = BATHING.rooms[room.kind];
    if (bath) {
      out.push({ label: "1回で戻る体力", value: `+${Math.round(bath.energy * 100)}%`, color: "#2ecc71" });
      out.push({
        label: "調子が上がる",
        value: `${Math.round(bath.conditionChance * 100)}%の確率で +${bath.condition}`,
        color: "#5dade2",
      });
    }
    if (room.kind === "dorm") {
      out.push({ label: "ベッド", value: `${DORM.capacityPerRoom}人ぶん`, color: "#7fd1ae" });
      out.push({ label: "入寮中", value: `${state.dormResidents().length} / ${state.dormCapacity()}人`, color: "#7fd1ae" });
    }
    if (def.upkeep > 0) out.push({ label: "維持費", value: `◆${def.upkeep} / 月`, color: "#e59866" });
    if (def.popularity > 0) out.push({ label: "人気度", value: `+${def.popularity} / 月`, color: "#f7dc6f" });
    out.push({ label: "同じ部屋の数", value: `${state.equipmentCount(room.kind)}個`, color: "#aed6f1" });

    /**
     * 【この部屋だけの働きぶり】（2026-09-23）
     * 同じ設備を2つ建てたとき「どちらが使われているか」は、
     * 種類でまとめた数では分からない。**いまタップしたこの部屋**の数を出す。
     *   ・プール      … 時間割に入っている週のコマ数（使われ方が時間割そのもの）
     *   ・そのほか    … 今月この部屋を使った人数（回復設備の利用・一般客の入館）
     */
    if (isPool(room.kind)) {
      const n = state.lessonsPerWeekIn(room.id);
      out.push({
        label: "この部屋の稼働",
        value: n > 0 ? `週${n}コマ（時間割）` : "時間割に入っていない",
        color: n > 0 ? "#7fd1ae" : "#e59866",
      });
    } else {
      const used = state.roomUseThisMonth(room.id);
      out.push({
        label: "今月この部屋を使った人",
        value: `${used}人`,
        color: used > 0 ? "#7fd1ae" : "#95a6b8",
      });
    }
    return out;
  }
}
