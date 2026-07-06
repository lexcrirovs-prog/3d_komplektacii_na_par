import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Основная сборка: обычный многофайловый билд, GLB — отдельные кэшируемые
// файлы с хешами в dist/models/. Fallback single-file: vite.config.singlefile.ts
export default defineConfig({
  plugins: [react()],
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? ''
          return name.endsWith('.glb')
            ? 'models/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
