import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { MANUAL, type ManualBlock } from "../data/manual";
import { Modal } from "./Modal";
import { setJaWrap } from "./textWrap";

/**
 * 【説明書】システム → 📖 説明書 から開く（中身は data/manual.ts）。
 *
 * 上に目次のボタン（押すとその章へ飛ぶ）、その下を縦にスクロールして読む。
 * 縮小の掛からない幅（524px まで）で組む。広げると文字が小さくなって読めない。
 */
export class ManualModal {
  private readonly m: Modal;
  /** 章ごとの見出しの位置（中身の座標）。目次から飛ぶのに使う。 */
  private readonly anchors: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    onClose: () => void,
  ) {
    this.m = new Modal(
      scene,
      {
        width: Math.min(524, GAME_WIDTH - 16),
        height: GAME_HEIGHT - 24,
        title: "📖 説明書",
        subtitle: "上のボタンで章へ飛べる。指でなぞってスクロール",
        depth: 2700, // システム画面（2600）の上に重ねる
      },
      onClose,
    );

    // 目次（2段×4つ）
    const tocTop = this.m.contentTop + 4;
    const cols = 4;
    const gap = 6;
    const bw = (this.m.pw - 32 - gap * (cols - 1)) / cols;
    MANUAL.forEach((sec, i) => {
      const x = 16 + (i % cols) * (bw + gap) + bw / 2;
      const y = tocTop + 16 + Math.floor(i / cols) * 38;
      this.m.button(x, y, bw, 32, sec.short, () => this.jump(i), {
        color: 0x2c5f8f,
        hoverColor: 0x3d78b0,
        fontSize: 12.5,
      });
    });

    const footerH = 64;
    const top = tocTop + Math.ceil(MANUAL.length / cols) * 38 + 8;
    this.m.enableScroll(top, this.m.ph - top - footerH);

    let y = top + 4;
    MANUAL.forEach((sec) => {
      this.anchors.push(y - top);
      y = this.heading(sec.title, y);
      for (const b of sec.blocks) y = this.block(b, y);
      y += 14;
    });
    this.m.setContentHeight(y - top + 20);

    this.m.button(this.m.pw / 2, this.m.ph - 34, 220, 46, "閉じる", onClose, {
      color: 0x394a5c,
      hoverColor: 0x4a6076,
      fontSize: 17,
    });
  }

  destroy(): void {
    this.m.destroy();
  }

  private jump(i: number): void {
    this.m.jumpTo(this.anchors[i] ?? 0);
  }

  private get textW(): number {
    return this.m.pw - 32 - this.m.scrollGutter;
  }

  private heading(title: string, y: number): number {
    const body = this.m.body;
    const g = this.scene.add.graphics();
    g.fillStyle(0xf7dc6f, 1);
    g.fillRect(16, y + 4, 4, 20);
    body.add(g);
    this.m.text(26, y, title, 18, "#f7dc6f", true, body);
    return y + 32;
  }

  private block(b: ManualBlock, y: number): number {
    const body = this.m.body;
    const w = this.textW;
    if (b.kind === "p") {
      const t = this.m.text(16, y, "", 13.5, "#ecf0f1", false, body);
      setJaWrap(t, w);
      t.setText(b.text);
      return y + t.height + 10;
    }
    if (b.kind === "list") {
      for (const item of b.items) {
        this.m.text(16, y, "・", 13.5, "#7fd1ae", true, body);
        const t = this.m.text(32, y, "", 13.5, "#ecf0f1", false, body);
        setJaWrap(t, w - 16);
        t.setText(item);
        y += t.height + 6;
      }
      return y + 4;
    }
    // 表：左に項目（太字）、右に説明。狭い画面なので項目の下に説明を折り返す
    for (const [k, v] of b.rows) {
      const g = this.scene.add.graphics();
      body.add(g);
      const kt = this.m.text(24, y + 6, "", 13.5, "#aed6f1", true, body);
      setJaWrap(kt, w - 16);
      kt.setText(k);
      const vt = this.m.text(24, y + 8 + kt.height, "", 12.5, "#d5dde5", false, body);
      setJaWrap(vt, w - 16);
      vt.setText(v);
      const h = kt.height + vt.height + 16;
      g.fillStyle(0x1c3550, 1);
      g.fillRoundedRect(16, y, w, h, 6);
      body.sendToBack(g);
      y += h + 6;
    }
    return y + 4;
  }
}
