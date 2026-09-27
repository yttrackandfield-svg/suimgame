import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * 保存先（キー・バリューストア）。
 *
 * 本番は Capacitor（Android アプリ）。Capacitor Preferences は
 *   - Android: SharedPreferences（アプリのデータ領域。アプリ更新でも消えない）
 *   - iOS:     UserDefaults
 *   - Web:     localStorage（開発中のブラウザ用の公式フォールバック）
 * と、プラットフォームごとに確実な永続化先へ自動で振り分けてくれる。
 * つまり同じ API のまま「ブラウザ開発」と「アプリ本番」の両方で動く。
 *
 * さらに、ストレージが使えない環境（プライベートブラウズでの例外など）でも
 * ゲームが落ちないよう、失敗したらメモリ保持へ退避する。
 */

export type StorageKind = "capacitor" | "memory";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** 例外時の退避先（そのセッション限りで消える）。 */
const memory = new Map<string, string>();
let degraded = false;

function fallbackToMemory(err: unknown): void {
  if (!degraded) {
    degraded = true;
    console.warn("[save] 端末ストレージが使えないためメモリ保存に切り替えます", err);
  }
}

const store: KeyValueStore = {
  async get(key) {
    if (!degraded) {
      try {
        const { value } = await Preferences.get({ key });
        return value;
      } catch (err) {
        fallbackToMemory(err);
      }
    }
    return memory.get(key) ?? null;
  },

  async set(key, value) {
    memory.set(key, value); // 退避コピー（この後の read を確実にする）
    if (degraded) return;
    try {
      await Preferences.set({ key, value });
    } catch (err) {
      fallbackToMemory(err);
    }
  },

  async remove(key) {
    memory.delete(key);
    if (degraded) return;
    try {
      await Preferences.remove({ key });
    } catch (err) {
      fallbackToMemory(err);
    }
  },

  async keys() {
    if (!degraded) {
      try {
        const { keys } = await Preferences.keys();
        return keys;
      } catch (err) {
        fallbackToMemory(err);
      }
    }
    return [...memory.keys()];
  },
};

export default store;

/** 実際に使われている保存方式（設定画面の表示用）。 */
export function storageKind(): StorageKind {
  return degraded ? "memory" : "capacitor";
}

/** 保存先の説明（設定画面に出す）。 */
export function storageLabel(): string {
  if (degraded) return "メモリ（保存されません）";
  const platform = Capacitor.getPlatform();
  if (platform === "android") return "端末内ストレージ（Android SharedPreferences）";
  if (platform === "ios") return "端末内ストレージ（iOS UserDefaults）";
  return "ブラウザ内ストレージ（開発用・Capacitor Web）";
}
