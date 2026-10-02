import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: { dedupe: ["three", "react", "react-dom"] },
  build: { target: "es2020", assetsInlineLimit: 0 },
  server: { fs: { allow: ["../.."] } },
});
