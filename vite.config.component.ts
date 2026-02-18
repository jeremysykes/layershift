import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite config for building the <depth-parallax> Web Component
 * as a single self-contained IIFE file with Three.js bundled in.
 *
 * Output: /dist/components/depth-parallax.js
 *
 * The worker.format option ensures the depth Web Worker is bundled
 * as an IIFE-compatible format. When combined with the library IIFE
 * output, Vite inlines the worker code so the single-file bundle
 * works without needing a separate worker file alongside it.
 */
export default defineConfig({
  worker: {
    // Bundle workers as IIFE so they work inside the library build.
    // Vite will inline them as Blob URLs in the output.
    format: 'iife',
  },
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
