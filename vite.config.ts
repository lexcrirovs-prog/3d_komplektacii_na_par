import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
})
