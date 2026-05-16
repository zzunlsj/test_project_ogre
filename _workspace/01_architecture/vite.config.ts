import { defineConfig } from 'vite';

// OGRE Web Game - Vite configuration
// - publicDir points at preview/assets so SVG units (ogre_mk3.svg, heavy_tank.svg, ...) ship as static files
// - base: './' so the build works on GitHub Pages or any static host without root mounting
// - target ES2020 to match tsconfig and supported browsers (Chrome 90+, Safari 15+, Firefox 90+)
export default defineConfig({
  base: './',
  publicDir: '../../preview/assets',
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1500, // Phaser is ~1.2MB minified
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['phaser'],
  },
});
