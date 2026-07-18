import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// GitHub Pages 部署在子路径(/subtitle-format-conversion/),需要正确 base。
// 本地 dev 不设该变量,默认 "/"。CI 构建时注入 BASE_PATH。
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react(), wasm(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@wasm": path.resolve(__dirname, "./pkg"),
    },
  },
  server: {
    fs: { allow: [".."] },
  },
});
