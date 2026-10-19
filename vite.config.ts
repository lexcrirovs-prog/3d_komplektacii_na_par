import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    manifest: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 4096,
  },
})
