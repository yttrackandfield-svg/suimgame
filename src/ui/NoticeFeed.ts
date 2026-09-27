import Phaser from "phaser";
import { FOOTER_H, GAME_HEIGHT, GAME_WIDTH, HUD_H } from "../config";
import { setJaWrap } from "./textWrap";
import { setLocalHitArea } from "./Button";
import { logicalDistance } from "../gfx/renderScale";

/**
 * 自動発生イベントの通知スタック（画面右上に積む）。
 *
 * 割り込みすぎないように、通知は小さく出て自動で消える。
 * タップすると詳細が見られる（選手なら育成パネル、それ以外はその場で1行追加）。
 */

export interface Notice {
  icon: string;
  title: string;
  detail?: string;
  color: string;
  /** タップしたときに開く詳細（選手パネルなど）。無ければその場で detail を展開する。 */
  onTap?: () => void;
}

interface Card {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  life: number;
  targetY: number;
  expanded: boolean;
  height: number;
  /** 押すと選手の画面へ飛べるか（枠を目立たせ、表示も長くする）。 */
  tappable: boolean;
}

const MARGIN = 12; // 画面右端からの余白
const CARD_W = Math.min(258, GAME_WIDTH - MARGIN * 2);
const PAD_X = 12; // カード内の左右の余白
const ICON_W = 24;
const CARD_H = 52;
const GAP = 8;
const LIFE = 7.0; // 自動で消えるまで（秒）
/**
 * タップで選手の画面へ飛べる通知は、少し長く出しておく。
 * 「◯◯が少し疲れているようだ」を見て手を打ちたいのに、
 * 読んでいるあいだに消えてしまうと何もできないため。
 */
const LIFE_TAPPABLE = 12.0;
/** これ以上ずれて離したら「なぞった」とみなす（Button と同じ考え方）。 */
const TAP_SLOP_PX = 26;
const MAX_CARDS = 3;
/** 本文に使える幅（アイコンぶんと左右の余白を必ず差し引く）。 */
const TEXT_W = CARD_W - PAD_X * 2 - ICON_W;

export class NoticeFeed {
  private readonly layer: Phaser.GameObjects.Container;
  private cards: Card[] = [];
  private readonly topY: number;

  constructor(private readonly scene: Phaser.Scene) {
    this.layer = scene.add.container(0, 0).setDepth(1950);
    // トーストの下、フッターの上に収まる位置
    this.topY = HUD_H + 78;
  }

  push(n: Notice): void {
    // 上限を超えたら最も古いものから消す
    while (this.cards.length >= MAX_CARDS) this.removeCard(this.cards[this.cards.length - 1]);

    const x = GAME_WIDTH - MARGIN - CARD_W;
    // 右からスライドインするが、画面外へはみ出さない位置から始める
    const root = this.scene.add.container(x + 18, this.topY).setAlpha(0);
    const bg = this.scene.add.graphics();
    root.add(bg);

    const textX = PAD_X + ICON_W;
    const icon = this.scene.add
      .text(PAD_X, 12, n.icon, { fontFamily: "sans-serif", fontSize: "16px", color: n.color })
      .setOrigin(0, 0);
    root.add(icon);

    // 折り返しは setJaWrap で行う（日本語はスペースが無く、既定の折り返しでは止まらない）
    const title = this.scene.add
      .text(textX, 10, "", {
        fontFamily: "sans-serif",
        fontSize: "13.5px",
        color: "#eef4f8",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    // 押せる通知は右端に「▶」が入るので、そのぶん手前で折り返す
    setJaWrap(title, n.onTap ? TEXT_W - 18 : TEXT_W);
    title.setText(n.title);
    root.add(title);

    // 詳細はタイトルの下に置く（タイトルが折り返しても重ならない）
    const detail = this.scene.add
      .text(textX, 10 + title.height + 4, "", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#a9bbc9",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    setJaWrap(detail, TEXT_W);
    detail.setText(n.detail ?? "");
    root.add(detail);

    // タップで開ける通知は「▶」を出して、押せることが分かるようにする
    const tappable = !!n.onTap;
    if (tappable) {
      const chevron = this.scene.add
        .text(CARD_W - 12, 10, "▶", { fontFamily: "sans-serif", fontSize: "14px", color: n.color })
        .setOrigin(1, 0);
      root.add(chevron);
    }

    const height = Math.max(CARD_H, title.height + 22);
    const card: Card = {
      root,
      bg,
      title,
      detail,
      life: tappable ? LIFE_TAPPABLE : LIFE,
      targetY: this.topY,
      expanded: false,
      height,
      tappable,
    };
    this.paint(card, n.color);

    root.setSize(CARD_W, height);
    // 中身は左上（0,0）から並べてあるので、その範囲をそのまま当たり判定にする
    // （setLocalHitArea を通さないと判定がカードの左半分だけになる）
    setLocalHitArea(root, 0, 0, CARD_W, height);
    // ボタンと同じ扱いにする：このカードの上で押し始めて、
    // 大きく動かさずに離したときだけ反応する（施設をドラッグした指が
    // たまたまカードの上で離れても飛ばないように）。
    let pressed = false;
    root.on("pointerdown", () => {
      pressed = true;
    });
    root.on("pointerout", () => {
      pressed = false;
    });
    root.on("pointerup", (p: Phaser.Input.Pointer, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      const was = pressed;
      pressed = false;
      if (!was || logicalDistance(p) > TAP_SLOP_PX) return; // 論理px で比べる（→ gfx/renderScale.ts）
      ev.stopPropagation?.();
      if (n.onTap) {
        n.onTap();
        this.removeCard(card);
        return;
      }
      if (n.detail && !card.expanded) {
        card.expanded = true;
        card.detail.setVisible(true);
        card.detail.setY(10 + card.title.height + 4);
        card.height = 10 + card.title.height + 4 + card.detail.height + 12;
        this.paint(card, n.color);
        // 伸びたぶんも押せるように、当たり判定を取り直す
        root.setSize(CARD_W, card.height);
        setLocalHitArea(root, 0, 0, CARD_W, card.height);
        card.life = LIFE * 0.7;
        this.relayout();
      }
    });

    this.layer.add(root);
    this.cards.unshift(card); // 新しいものが上
    this.relayout();
  }

  update(dt: number): void {
    const x = GAME_WIDTH - MARGIN - CARD_W;
    for (const card of [...this.cards]) {
      card.life -= dt;
      if (card.life <= 0) {
        this.removeCard(card);
        continue;
      }
      // 出現：右からスライドイン／消える直前：フェード
      // 右端からはみ出さないように、必ず所定の位置以下に丸める
      card.root.x = Math.min(x, card.root.x + (x - card.root.x) * Math.min(1, dt * 14));
      card.root.y += (card.targetY - card.root.y) * Math.min(1, dt * 10);
      const appear = Math.min(1, (LIFE - card.life) * 5);
      const fade = Math.min(1, card.life / 0.6);
      card.root.setAlpha(Math.min(appear, fade) * 0.96);
    }
  }

  clear(): void {
    for (const card of [...this.cards]) this.removeCard(card);
  }

  destroy(): void {
    this.layer.destroy();
    this.cards = [];
  }

  // ---------------------------------------------------------------- 内部

  private paint(card: Card, color: string): void {
    const g = card.bg;
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(3, 4, CARD_W, card.height, 8);
    g.fillStyle(0x14263a, 0.94);
    g.fillRoundedRect(0, 0, CARD_W, card.height, 8);
    // 押せるものは枠を太く・濃くして、押せることが見て分かるようにする
    g.lineStyle(card.tappable ? 3 : 2, Phaser.Display.Color.HexStringToColor(color).color, card.tappable ? 1 : 0.85);
    g.strokeRoundedRect(0, 0, CARD_W, card.height, 8);
    // 左端の色帯（種類が一目で分かる）
    g.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 0.9);
    g.fillRoundedRect(0, 6, card.tappable ? 6 : 4, card.height - 12, 2);
  }

  private removeCard(card: Card): void {
    const i = this.cards.indexOf(card);
    if (i >= 0) this.cards.splice(i, 1);
    card.root.destroy();
    this.relayout();
  }

  /** 上から順に積み直す（画面外にはみ出す位置には置かない）。 */
  private relayout(): void {
    let y = this.topY;
    const limit = GAME_HEIGHT - FOOTER_H - 20;
    for (const card of this.cards) {
      card.targetY = Math.min(y, limit - card.height);
      y += card.height + GAP;
    }
  }
}
