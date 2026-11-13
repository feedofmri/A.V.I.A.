import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const target = process.env.API_URL ?? 'http://localhost:4000';
const proxy = {
  '/api': { target, changeOrigin: true },
  '/bff': {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/bff/, ''),
  },
};
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy },
  preview: { port: 5174, strictPort: true, proxy },
});
