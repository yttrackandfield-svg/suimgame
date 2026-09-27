import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { Modal } from "./Modal";

/**
 * 新規ゲーム開始時にクラブ名を決めるモーダル。
 * スマホでは文字入力がわずらわしいので、候補を引き直す方式にしている。
 */

const HEAD = [
  "みなと", "あおば", "しおかぜ", "さくら", "つばさ", "ひかり", "なぎさ", "あさひ",
  "わかば", "ゆうひ", "たいよう", "かもめ", "いずみ", "こまち", "はやぶさ", "しらゆき",
];

const TAIL = ["スイミングクラブ", "スイミングクラブ", "スイミングスクール", "水泳クラブ"];

export function randomClubName(rand: () => number = Math.random): string {
  const head = HEAD[Math.floor(rand() * HEAD.length)];
  const tail = TAIL[Math.floor(rand() * TAIL.length)];
  return `${head}${tail}`;
}

export interface NewGameModalOptions {
  slot: number;
  onStart: (clubName: string) => void;
  onClose: () => void;
}

export class NewGameModal {
  private readonly modal: Modal;
  private readonly nameText: Phaser.GameObjects.Text;
  private clubName = randomClubName();

  constructor(scene: Phaser.Scene, private readonly opts: NewGameModalOptions) {
    const width = Math.min(470, GAME_WIDTH - 30);
    const height = 380;

    this.modal = new Modal(
      scene,
      {
        width,
        height,
        title: `新しいクラブ（枠${opts.slot}）`,
        subtitle: "クラブの名前を決めよう。あとから変えることはできない。",
        depth: 2600,
      },
      () => opts.onClose(),
    );

    const boxY = this.modal.contentTop + 22;
    const frame = scene.add.graphics();
    frame.fillStyle(0x0d1b2a, 1);
    frame.fillRoundedRect(24, boxY, width - 48, 76, 10);
    frame.lineStyle(2, 0x3d78b0, 1);
    frame.strokeRoundedRect(24, boxY, width - 48, 76, 10);
    this.modal.container.add(frame);

    this.nameText = this.modal.text(width / 2, boxY + 38, this.clubName, 24, "#f7dc6f", true);
    this.nameText.setOrigin(0.5);

    this.modal.button(width / 2, boxY + 122, width - 120, 44, "🎲 べつの名前", () => this.reroll(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 16,
    });

    this.modal.button(width / 2, height - 84, width - 60, 54, "この名前ではじめる", () => this.start(), {
      color: 0x2e7d5b,
      hoverColor: 0x3fa876,
      fontSize: 19,
    });

    this.modal.button(width / 2, height - 30, width - 60, 40, "やめる", () => opts.onClose(), {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 15,
    });
  }

  destroy(): void {
    this.modal.destroy();
  }

  private reroll(): void {
    let next = this.clubName;
    for (let i = 0; i < 8 && next === this.clubName; i++) next = randomClubName();
    this.clubName = next;
    this.nameText.setText(this.clubName);
  }

  private start(): void {
    this.opts.onStart(this.clubName);
  }
}
