import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Fallback-сборка «всё в одном index.html» (модели инлайнятся base64).
// Нужна только для хостинга, где нельзя выложить папку целиком.
// Запуск: npm run build:singlefile
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
})
