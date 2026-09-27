import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    open: true,
    // 同じ Wi-Fi のスマホから開けるように、LAN にも公開する。
    // 起動時に出る "Network: http://192.168.x.x:5173/" をスマホのブラウザで開く。
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
