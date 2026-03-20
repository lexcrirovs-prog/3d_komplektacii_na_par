import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2015',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 10 * 1024 * 1024, // 10MB - inline GLB as base64 data URIs
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
})
