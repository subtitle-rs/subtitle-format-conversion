import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

export default defineConfig({
  plugins: [react(), wasm()],
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
