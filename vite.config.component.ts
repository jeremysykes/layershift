import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite config for building the <depth-parallax> Web Component
 * as a single self-contained IIFE file with Three.js bundled in.
 *
 * Output: /dist/components/depth-parallax.js
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/depth-parallax/index.ts'),
      name: 'DepthParallax',
      formats: ['iife'],
      fileName: () => 'depth-parallax.js',
    },
    outDir: 'dist/components',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // No external dependencies — bundle everything
        inlineDynamicImports: true,
      },
    },
  },
});
