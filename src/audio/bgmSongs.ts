/**
 * 【BGM の楽譜】（→ audio/bgm.ts が鳴らす）
 *
 * 1小節＝16マス（16分音符）。マスは空白で区切る。
 *   "C5" … その音　"C4+E4+G4" … 和音　"-" … のばす　"." … 休み
 * ドラムは "k"＝キック／"s"＝スネア／"h"＝ハイハット（"kh" のように重ねられる）。
 *
 * 曲はすべてこのゲームのために書いたもの（外部の曲素材は使っていない）。
 *   title       … タイトル。明るく、はじまりの感じ（ハ長調・112）
 *   facilityDay … 施設の昼。放置して聞き流せる、ゆったりした曲（ヘ長調・96・すこし跳ねる）
 *   facilityNight … 施設の夜。昼と同じ和音で、メロディを減らした静かな版（72）
 *   race        … 大会。前へ進む感じのアップテンポ（ニ短調・144）
 *   fanfare     … 優勝のファンファーレ（ループしない）
 */

export type SongId = "title" | "facilityDay" | "facilityNight" | "race" | "fanfare";

export interface Voice {
  wave: OscillatorType;
  gain: number;
  attack?: number;
  release?: number;
  sustain?: number;
  /** 打鍵の音にする（鳴らした直後から減衰する秒）。 */
  pluck?: number;
  detune?: number;
}

export interface Song {
  bpm: number;
  stepsPerBar: number;
  loop: boolean;
  /** 裏拍を遅らせる量（0〜0.2）。 */
  swing?: number;
  drumGain?: number;
  parts: { voice: Voice; bars: string[] }[];
  drums?: string[];
}

// ---------------------------------------------------------------- 楽譜を書く道具

/** 小節いっぱいのばす和音。 */
const hold = (chord: string): string => `${chord} ${"- ".repeat(15)}`;
/** 8分音符のアルペジオ（4音を2回まわす）。 */
const arp = (a: string, b: string, c: string, d: string): string => `${a} . ${b} . ${c} . ${b} . ${a} . ${b} . ${c} . ${d} .`;
/** ルートを1拍目、5度を3拍目に置くベース。 */
const bass2 = (root: string, fifth: string): string => `${root} - - - - - . . ${fifth} - - - . . . .`;
/** 8分で上下するベース（大会用）。 */
const pump = (lo: string, hi: string): string => `${lo} . ${hi} . `.repeat(4).trim();
/** 裏拍に和音を刻む（大会用）。 */
const stab = (chord: string): string => `. . ${chord} . . . ${chord} . . . ${chord} . . . ${chord} .`;
const times = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

// ---------------------------------------------------------------- 施設（昼・夜で同じ和音）

/** F → Am → B♭ → C → Dm → B♭ → Gm → C（8小節でひとまわり）。 */
const F_PAD = ["F3+A3+C4", "E3+A3+C4", "F3+Bb3+D4", "E3+G3+C4", "F3+A3+D4", "F3+Bb3+D4", "G3+Bb3+D4", "E3+G3+C4"];
const F_ARP = [
  arp("F4", "A4", "C5", "F5"),
  arp("E4", "A4", "C5", "E5"),
  arp("D4", "F4", "Bb4", "D5"),
  arp("E4", "G4", "C5", "E5"),
  arp("D4", "F4", "A4", "D5"),
  arp("D4", "F4", "Bb4", "D5"),
  arp("D4", "G4", "Bb4", "D5"),
  arp("E4", "G4", "C5", "E5"),
];
const F_BASS = [
  bass2("F2", "C3"),
  bass2("A2", "E3"),
  bass2("Bb2", "F3"),
  bass2("C3", "G2"),
  bass2("D3", "A2"),
  bass2("Bb2", "F3"),
  bass2("G2", "D3"),
  bass2("C3", "G2"),
];

const DAY_MELODY = [
  // A（前半8小節）
  "C5 - - - A4 - C5 - D5 - C5 - A4 - - -",
  "E5 - - - C5 - - - A4 - - - . . . .",
  "D5 - - - Bb4 - D5 - F5 - E5 - D5 - - -",
  "C5 - - - - - - - . . . . . . . .",
  "A4 - - - D5 - - - F5 - - - E5 - D5 -",
  "D5 - - - C5 - Bb4 - A4 - - - G4 - - -",
  "G4 - A4 - Bb4 - D5 - C5 - - - Bb4 - A4 -",
  "G4 - - - - - - - E4 - - - . . . .",
  // B（後半8小節。高いところで、ゆっくり）
  "A5 - - - - - - - G5 - F5 - - - - -",
  "E5 - - - - - - - C5 - - - . . . .",
  "D5 - - - F5 - - - Bb5 - - - A5 - - -",
  "G5 - - - - - - - - - - - . . . .",
  "F5 - - - E5 - D5 - A4 - - - - - - -",
  "Bb4 - - - C5 - D5 - F5 - - - - - - -",
  "D5 - - - C5 - - - Bb4 - - - A4 - - -",
  "G4 - - - - - - - . . . . . . . .",
];

const NIGHT_MELODY = [
  "C5 - - - - - - - . . . . . . . .",
  ". . . . . . . . E5 - - - - - - -",
  "D5 - - - - - - - . . . . . . . .",
  ". . . . . . . . G4 - - - - - - -",
  "A4 - - - - - - - . . . . . . . .",
  ". . . . . . . . F4 - - - - - - -",
  "G4 - - - - - - - . . . . . . . .",
  ". . . . . . . . E4 - - - - - - -",
];

// ---------------------------------------------------------------- 大会（ニ短調）

/** Dm → B♭ → C → Am → Dm → B♭ → C → A。 */
const RACE_STAB = ["D4+F4+A4", "D4+F4+Bb4", "E4+G4+C5", "E4+A4+C5", "D4+F4+A4", "D4+F4+Bb4", "E4+G4+C5", "E4+A4+C#5"].map(stab);
const RACE_BASS = [
  pump("D2", "D3"),
  pump("Bb1", "Bb2"),
  pump("C2", "C3"),
  pump("A1", "A2"),
  pump("D2", "D3"),
  pump("Bb1", "Bb2"),
  pump("C2", "C3"),
  pump("A1", "A2"),
];
const RACE_LEAD = [
  "D5 - - - F5 - A5 - - - G5 - F5 - E5 -",
  "D5 - - - - - - - Bb4 - C5 - D5 - - -",
  "E5 - - - G5 - C6 - - - Bb5 - A5 - G5 -",
  "A5 - - - - - - - E5 - - - . . . .",
  "D5 - F5 - A5 - D6 - - - C6 - A5 - - -",
  "Bb5 - - - A5 - G5 - F5 - - - G5 - A5 -",
  "G5 - - - E5 - C5 - E5 - G5 - C6 - - -",
  "A5 - - - - - - - C#5 - E5 - A5 - . .",
];

// ---------------------------------------------------------------- タイトル（ハ長調）

/** C → G → Am → F → C → G → F → G。 */
const TITLE_PAD = ["C4+E4+G4", "B3+D4+G4", "C4+E4+A4", "C4+F4+A4", "C4+E4+G4", "B3+D4+G4", "C4+F4+A4", "B3+D4+G4"].map(hold);
const TITLE_BASS = [
  bass2("C3", "G2"),
  bass2("G2", "D3"),
  bass2("A2", "E3"),
  bass2("F2", "C3"),
  bass2("C3", "G2"),
  bass2("G2", "D3"),
  bass2("F2", "C3"),
  bass2("G2", "D3"),
];
const TITLE_LEAD = [
  "E5 - - - G5 - - - C6 - - - G5 - - -",
  "D5 - - - G5 - - - B5 - - - A5 - G5 -",
  "C5 - - - E5 - A5 - - - G5 - E5 - - -",
  "F5 - - - - - - - E5 - D5 - C5 - - -",
  "E5 - G5 - C6 - - - D6 - C6 - B5 - - -",
  "B5 - - - G5 - - - D5 - - - G5 - - -",
  "A5 - - - F5 - A5 - C6 - - - A5 - F5 -",
  "G5 - - - - - - - D5 - - - . . . .",
];

// ---------------------------------------------------------------- 曲

const SOFT_LEAD: Voice = { wave: "triangle", gain: 0.13, attack: 0.02, release: 0.18, sustain: 0.7 };
const PAD: Voice = { wave: "sine", gain: 0.05, attack: 0.35, release: 0.7, sustain: 0.9 };
const EPIANO: Voice = { wave: "sine", gain: 0.06, attack: 0.005, pluck: 0.35 };
const BASS: Voice = { wave: "triangle", gain: 0.15, attack: 0.01, release: 0.1, sustain: 0.8 };

export const SONGS: Record<SongId, Song> = {
  title: {
    bpm: 112,
    stepsPerBar: 16,
    loop: true,
    drumGain: 0.12,
    parts: [
      { voice: { wave: "square", gain: 0.055, attack: 0.01, release: 0.1, sustain: 0.6 }, bars: TITLE_LEAD },
      { voice: PAD, bars: TITLE_PAD },
      { voice: BASS, bars: TITLE_BASS },
    ],
    drums: times(8, "k . h . s . h . k . h . s . h h"),
  },
  facilityDay: {
    bpm: 96,
    stepsPerBar: 16,
    loop: true,
    swing: 0.08,
    drumGain: 0.08,
    parts: [
      { voice: SOFT_LEAD, bars: DAY_MELODY },
      { voice: PAD, bars: [...F_PAD, ...F_PAD].map(hold) },
      { voice: EPIANO, bars: [...F_ARP, ...F_ARP] },
      { voice: BASS, bars: [...F_BASS, ...F_BASS] },
    ],
    drums: times(16, "k . . . h . . . k . . . h . . h"),
  },
  facilityNight: {
    bpm: 72,
    stepsPerBar: 16,
    loop: true,
    swing: 0.06,
    parts: [
      { voice: { ...SOFT_LEAD, gain: 0.09, release: 0.4 }, bars: NIGHT_MELODY },
      { voice: { ...PAD, gain: 0.045 }, bars: F_PAD.map(hold) },
      { voice: { ...EPIANO, gain: 0.045, pluck: 0.6 }, bars: F_ARP },
      { voice: { ...BASS, gain: 0.1 }, bars: F_BASS },
    ],
  },
  race: {
    bpm: 144,
    stepsPerBar: 16,
    loop: true,
    drumGain: 0.16,
    parts: [
      { voice: { wave: "square", gain: 0.06, attack: 0.005, release: 0.06, sustain: 0.6, detune: 4 }, bars: RACE_LEAD },
      { voice: { wave: "square", gain: 0.022, attack: 0.005, release: 0.04, sustain: 0.5 }, bars: RACE_STAB },
      { voice: { ...BASS, gain: 0.17, release: 0.05 }, bars: RACE_BASS },
    ],
    drums: times(8, "k . h . s . h . k . k . s . h h"),
  },
  fanfare: {
    bpm: 150,
    stepsPerBar: 16,
    loop: false,
    drumGain: 0.16,
    parts: [
      {
        voice: { wave: "square", gain: 0.08, attack: 0.005, release: 0.2, sustain: 0.7 },
        bars: ["C5 . E5 . G5 . C6 - - - . . G5 . C6 -", "- - - - - - - - . . . . . . . ."],
      },
      { voice: { ...PAD, gain: 0.07, attack: 0.05 }, bars: [". . . . . . C4+E4+G4 - - - - - - - - -", "- - - - - - - - . . . . . . . ."] },
      { voice: BASS, bars: ["C3 . . . C3 . . . G2 . . . C3 - - -", "- - - - - - - - . . . . . . . ."] },
    ],
    drums: ["k . . . k . . . k . s . k . s s", "k . . . . . . . . . . . . . . ."],
  },
};
