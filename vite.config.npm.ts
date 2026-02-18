import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite config for building the ESM library bundle for npm distribution.
 *
 * Output: dist/npm/layershift.es.js
 *
 * This produces an ES module build suitable for consumers using bundlers
 * (webpack, Vite, Rollup, etc.) via `import 'layershift'`.
 *
 * Three.js is bundled in (same as the IIFE build) so consumers don't need
 * to install it separately — the package is fully self-contained.
 */
export default defineConfig({
  worker: {
    format: 'iife',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/layershift/index.ts'),
      name: 'Layershift',
      formats: ['es'],
      fileName: () => 'layershift.es.js',
    },
    outDir: 'dist/npm',
    emptyOutDir: true,
    copyPublicDir: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
