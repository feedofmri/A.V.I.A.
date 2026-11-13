import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /bff/* is proxied to the BFF; in Docker, nginx does the same (see nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/bff': {
        target: process.env.BFF_URL ?? 'http://localhost:4000',
        rewrite: (path) => path.replace(/^\/bff/, ''),
      },
    },
  },
});
