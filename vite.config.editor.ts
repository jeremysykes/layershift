import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/editor',
  publicDir: '../../public',
  server: {
    host: true,
    port: 5174,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    outDir: '../../dist/editor',
    emptyOutDir: true,
  },
});
