import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  publicDir: '../../preview/assets',
  build: { outDir: 'dist' },
  server: { port: 5176, host: true },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
