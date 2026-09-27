import store from "./storage";
import type { Speed } from "../sim/clock";

/**
 * ゲーム全体の設定（セーブ枠とは独立。端末に1つ）。
 * BootScene で initSettings() を待ってから読み込むので、
 * 各シーンは同期的に settings() で参照できる。
 */

export interface GameSettings {
  version: 1;
  /** 節目（月替わり・大会後）の自動セーブ。 */
  autoSave: boolean;
  /** クラスが始まったときの既定のゲーム速度。 */
  defaultSpeed: Speed;
  /** 画面下のトースト通知を出すか。 */
  showToast: boolean;
  /** チュートリアルを済ませたか（新規ゲームで自動的に始めるかの判断に使う）。 */
  /** 【廃止】チュートリアルは無くなった（2026-09-18）。古い設定ファイルを読めるように型だけ残してある。 */
  tutorialDone: boolean;
  /** 画面下のメニューを開いているか（矢印で開け閉めした状態を覚えておく）。 */
  menuOpen: boolean;
  /**
   * 動作の重さ（FPS）を画面に出すか。
   * 実機でどのくらい重いのかは、触ってみるまで分からない。
   * 「固まる」ときに、いくつまで落ちているのかを見られるようにしておく。
   */
  showFps: boolean;
  /** BGM を鳴らすか（→ audio/bgm.ts）。 */
  bgmOn: boolean;
  /** BGM の音量（1＝小／2＝中／3＝大）。 */
  bgmVolume: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  version: 1,
  autoSave: true,
  defaultSpeed: 1,
  showToast: true,
  tutorialDone: false,
  menuOpen: true,
  showFps: false,
  bgmOn: true,
  bgmVolume: 2,
};

const KEY = "suim.settings";

let cache: GameSettings = { ...DEFAULT_SETTINGS };

/** 現在の設定（同期）。initSettings() 前は既定値。 */
export function settings(): GameSettings {
  return cache;
}

/** 端末から設定を読み込む（起動時に一度）。 */
export async function initSettings(): Promise<GameSettings> {
  const text = await store.get(KEY);
  if (text) {
    try {
      const raw = JSON.parse(text) as Partial<GameSettings>;
      const sp = raw.defaultSpeed;
      cache = {
        version: 1,
        autoSave: typeof raw.autoSave === "boolean" ? raw.autoSave : DEFAULT_SETTINGS.autoSave,
        defaultSpeed: sp === 2 || sp === 4 ? sp : 1,
        showToast: typeof raw.showToast === "boolean" ? raw.showToast : DEFAULT_SETTINGS.showToast,
        tutorialDone: typeof raw.tutorialDone === "boolean" ? raw.tutorialDone : DEFAULT_SETTINGS.tutorialDone,
        menuOpen: typeof raw.menuOpen === "boolean" ? raw.menuOpen : DEFAULT_SETTINGS.menuOpen,
        showFps: typeof raw.showFps === "boolean" ? raw.showFps : DEFAULT_SETTINGS.showFps,
        bgmOn: typeof raw.bgmOn === "boolean" ? raw.bgmOn : DEFAULT_SETTINGS.bgmOn,
        bgmVolume:
          typeof raw.bgmVolume === "number" && raw.bgmVolume >= 1 && raw.bgmVolume <= 3
            ? Math.round(raw.bgmVolume)
            : DEFAULT_SETTINGS.bgmVolume,
      };
    } catch {
      cache = { ...DEFAULT_SETTINGS };
    }
  }
  return cache;
}

/** 設定を書き換えて保存する（部分更新）。 */
export async function updateSettings(patch: Partial<GameSettings>): Promise<GameSettings> {
  cache = { ...cache, ...patch, version: 1 };
  await store.set(KEY, JSON.stringify(cache));
  return cache;
}
