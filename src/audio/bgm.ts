/**
 * 【BGM】（2026-09-27）曲はすべてここで**プログラムで作って鳴らす**（音の素材ファイルは使わない）。
 *
 * 外部の曲素材を使うと、Google Play に出すときに権利の確認が要る。
 * Web Audio の発振器（矩形波・三角波・正弦波）と、ノイズで作ったドラムだけで、
 * レトロゲーム風の曲を鳴らす。楽譜は data/bgmSongs.ts。
 *
 * 【鳴らし方】少し先（LOOKAHEAD 秒）までの音を、25ms ごとに予約していく（Web Audio の定番のやり方）。
 * setTimeout だけで鳴らすと、画面が重いときにリズムがよれる。
 *
 * 【ブラウザの決まり】音はユーザーが画面に触れるまで鳴らせない。最初のタップで AudioContext を起こす。
 * アプリが裏に回ったら止め、戻ったら続きから鳴らす（→ visibilitychange）。
 */
import { SONGS, type Song, type SongId } from "./bgmSongs";

type Ev = { step: number; midis: number[]; len: number };
export interface Compiled {
  song: Song;
  stepDur: number;
  totalSteps: number;
  parts: { song: Song; index: number; events: Map<number, Ev[]> }[];
  drums: Map<number, string[]>;
}

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
/** 音量の段階（設定の 0〜3）。全体をかなり小さめにしてある（BGM は邪魔にならない音量が大事）。 */
const VOLUME_LEVELS = [0, 0.18, 0.32, 0.5];

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb3" → MIDI 番号。 */
function midiOf(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_BASE[m[1]] + acc;
}

function freqOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 楽譜の1小節を読む。16分音符ぶんのマスを空白で区切って並べる。
 *   "C5"  … その音を鳴らす　"C4+E4+G4" … 和音
 *   "-"   … 前の音をのばす　"."        … 休み
 */
export function compile(song: Song): Compiled {
  const steps = song.stepsPerBar;
  const parts = song.parts.map((p, index) => {
    const events = new Map<number, Ev[]>();
    let last: Ev | null = null;
    p.bars.forEach((bar, bi) => {
      const toks = bar.trim().split(/\s+/);
      for (let i = 0; i < steps; i++) {
        const t = toks[i] ?? ".";
        const step = bi * steps + i;
        if (t === "-") {
          if (last) last.len += 1;
          continue;
        }
        if (t === ".") {
          last = null;
          continue;
        }
        const midis = t
          .split("+")
          .map(midiOf)
          .filter((x): x is number => x != null);
        if (midis.length === 0) {
          last = null;
          continue;
        }
        const ev: Ev = { step, midis, len: 1 };
        const list = events.get(step) ?? [];
        list.push(ev);
        events.set(step, list);
        last = ev;
      }
    });
    return { song, index, events };
  });
  const drums = new Map<number, string[]>();
  (song.drums ?? []).forEach((bar, bi) => {
    const toks = bar.trim().split(/\s+/);
    for (let i = 0; i < steps; i++) {
      const t = toks[i] ?? ".";
      if (t === "." || t === "-") continue;
      drums.set(bi * steps + i, t.split(""));
    }
  });
  const bars = Math.max(...song.parts.map((p) => p.bars.length), song.drums?.length ?? 0);
  return { song, stepDur: 60 / song.bpm / 4, totalSteps: bars * steps, parts, drums };
}

export class Player {
  private step = 0;
  private nextTime = 0;
  private stopped = false;
  readonly out: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly c: Compiled,
    dest: AudioNode,
    private readonly noise: AudioBuffer,
    /** ループしない曲（ジングル）が終わったとき。 */
    private readonly onEnd?: () => void,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.nextTime = ctx.currentTime + 0.05;
  }

  fadeTo(v: number, sec: number): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(v, t + sec);
  }

  stop(fadeSec: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.fadeTo(0, fadeSec);
    setTimeout(() => this.out.disconnect(), fadeSec * 1000 + 200);
  }

  get done(): boolean {
    return this.stopped;
  }

  /** 少し先までの音を予約する（horizon 秒先まで。検査では長く取って、まとめて書き出す）。 */
  pump(horizon = LOOKAHEAD): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    // 画面が止まっていた（裏に回っていた）ときは、たまった分を鳴らさずに今から続ける
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + horizon) {
      if (this.step >= this.c.totalSteps) {
        if (!this.c.song.loop) {
          this.stopped = true;
          const left = Math.max(0, this.nextTime - ctx.currentTime);
          setTimeout(() => {
            this.out.disconnect();
            this.onEnd?.();
          }, left * 1000 + 1200);
          return;
        }
        this.step = 0;
      }
      this.playStep(this.step, this.nextTime);
      this.step++;
      // 裏拍を少し遅らせて揺らす（スイング）。ゆったりした曲だけ
      const swing = this.c.song.swing ?? 0;
      this.nextTime += this.c.stepDur * (this.step % 2 === 1 ? 1 + swing : 1 - swing);
    }
  }

  private playStep(step: number, t: number): void {
    for (const p of this.c.parts) {
      const evs = p.events.get(step);
      if (!evs) continue;
      const v = this.c.song.parts[p.index].voice;
      for (const e of evs) {
        const dur = e.len * this.c.stepDur;
        for (const m of e.midis) this.note(v, m, t, dur);
      }
    }
    const d = this.c.drums.get(step);
    if (d) for (const k of d) this.drum(k, t);
  }

  private note(v: Song["parts"][number]["voice"], midi: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.value = freqOf(midi);
    if (v.detune) osc.detune.value = v.detune;
    const g = ctx.createGain();
    const peak = v.gain;
    const a = v.attack ?? 0.01;
    const r = v.release ?? 0.08;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (v.pluck) {
      // 打鍵の音（エレピ・木琴ふう）：鳴らした直後から減っていく
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.05), t + a + v.pluck);
      osc.connect(g).connect(this.out);
      osc.start(t);
      osc.stop(t + a + v.pluck + 0.05);
      return;
    }
    const sus = peak * (v.sustain ?? 0.8);
    g.gain.linearRampToValueAtTime(sus, t + a + 0.06);
    const end = t + Math.max(a + 0.07, dur * 0.95);
    g.gain.setValueAtTime(sus, end);
    g.gain.linearRampToValueAtTime(0, end + r);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(end + r + 0.02);
  }

  private drum(kind: string, t: number): void {
    const ctx = this.ctx;
    const vol = this.c.song.drumGain ?? 0.2;
    if (kind === "k") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * 1.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(this.out);
      osc.start(t);
      osc.stop(t + 0.18);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    const g = ctx.createGain();
    const len = kind === "s" ? 0.14 : 0.04;
    f.frequency.value = kind === "s" ? 1400 : 7000;
    g.gain.setValueAtTime(kind === "s" ? vol * 0.9 : vol * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + len + 0.02);
  }
}

class BgmEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private current: Player | null = null;
  private currentId: SongId | null = null;
  private jingle: Player | null = null;
  private enabled = true;
  private level = 2;
  private readonly compiled = new Map<SongId, Compiled>();
  /** 鳴らしたい曲（まだ音を起こせていないときも覚えておく）。 */
  private wanted: SongId | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    // 【最初のタップで音を起こす】ブラウザは、画面に触れるまで音を出させない
    const unlock = (): void => {
      this.ensure();
      void this.ctx?.resume();
      if (this.wanted && this.currentId !== this.wanted) this.play(this.wanted);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    // アプリが裏に回ったら止め、戻ったら続きから
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  /** 設定（ON/OFF と音量 0〜3）を反映する。 */
  configure(enabled: boolean, level: number): void {
    this.enabled = enabled;
    this.level = Math.max(0, Math.min(3, level));
    this.applyVolume();
    if (!enabled) {
      this.current?.stop(0.4);
      this.current = null;
      this.currentId = null;
    } else if (this.wanted && this.currentId !== this.wanted) {
      this.play(this.wanted);
    }
  }

  /** その曲にする（同じ曲なら何もしない）。前の曲とはなめらかに入れ替える。 */
  play(id: SongId): void {
    this.wanted = id;
    if (!this.enabled) return;
    if (!this.ensure()) return;
    if (this.currentId === id && this.current && !this.current.done) return;
    this.current?.stop(1.2);
    const p = new Player(this.ctx!, this.compile(id), this.master!, this.noise!);
    p.fadeTo(1, 1.2);
    this.current = p;
    this.currentId = id;
  }

  /** 短いジングル（優勝のファンファーレなど）。そのあいだ BGM は小さくする。 */
  playJingle(id: SongId): void {
    if (!this.enabled || !this.ensure()) return;
    this.jingle?.stop(0.1);
    this.current?.fadeTo(0.2, 0.3);
    const j = new Player(this.ctx!, this.compile(id), this.master!, this.noise!, () => {
      if (this.jingle === j) this.jingle = null;
      this.current?.fadeTo(1, 1.5);
    });
    j.fadeTo(1, 0.02);
    this.jingle = j;
  }

  private compile(id: SongId): Compiled {
    let c = this.compiled.get(id);
    if (!c) {
      c = compile(SONGS[id]);
      this.compiled.set(id, c);
    }
    return c;
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const v = this.enabled ? VOLUME_LEVELS[this.level] : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** AudioContext を用意する（作れない環境では false）。 */
  private ensure(): boolean {
    if (this.ctx) return true;
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    // ドラム用のノイズ（1秒ぶん）
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolume();
    setInterval(() => {
      this.current?.pump();
      this.jingle?.pump();
    }, TICK_MS);
    return true;
  }
}

/** ゲーム全体で1つの BGM。 */
export const bgm = new BgmEngine();
export type { SongId };
