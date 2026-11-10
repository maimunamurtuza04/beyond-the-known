import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5180),
    strictPort: false,
    proxy: {
      // The API stays on its own port in development.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(here, '../dist'),
    emptyOutDir: true,
  },
});
