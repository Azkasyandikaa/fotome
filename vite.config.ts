import { defineConfig } from 'vite';
import boothPlugin from './booth-plugin.js';

export default defineConfig({
  plugins: [boothPlugin()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Saat dev: galeri API diteruskan ke server Express lokal (npm run serve).
      '/api/gallery': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 1024,
  },
});
