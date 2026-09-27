import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android アプリ化の設定（Capacitor）。
 *
 * 【appId は一度 Google Play に上げたら二度と変えられない】
 * いまの値は仮。最初にアップロードする前に、自分のドメインや名前を逆さにした
 * 一意な名前（例：jp.<自分の名前>.myswimclub）に決めて書き換えること。
 * 書き換えたら `android` フォルダを作り直す（npx cap add android）のが確実。
 *
 * ビルドの流れ：npm run build → npx cap sync android → Android Studio か gradlew でビルド。
 * Capacitor 8 の道具は Node 22 以上が要る（→ package.json の cap:* スクリプトが Node 22 を借りて動かす）。
 */
const config: CapacitorConfig = {
  appId: "jp.myswimclub.app",
  appName: "マイスイミングクラブ",
  webDir: "dist",
  android: {
    // ゲームの画面をそのまま全面に出す（WebView の既定の背景色が一瞬見えないように）
    backgroundColor: "#0d1b2a",
  },
};

export default config;
