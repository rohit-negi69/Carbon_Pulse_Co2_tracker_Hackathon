import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // `ws: true` upgrades the socket at /api/ws too, so the dev server
      // proxies the real-time channel (not just the REST calls) to Express.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
