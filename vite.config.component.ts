import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite config for building the <layershift-parallax> Web Component
 * as a single self-contained IIFE file.
 *
 * Output: /dist/components/layershift.js
 *
 * The worker.format option ensures the depth Web Worker is bundled
 * as an IIFE-compatible format. When combined with the library IIFE
 * output, Vite inlines the worker code so the single-file bundle
 * works without needing a separate worker file alongside it.
 *
 * onnxruntime-web is excluded from the bundle (depth estimation is
 * optional). IIFE consumers who need it should add an import map:
 *
 *   <script type="importmap">
 *     { "imports": { "onnxruntime-web/webgpu": "https://cdn.jsdelivr.net/.../ort.webgpu.bundle.min.mjs" } }
 *   </script>
 */
export default defineConfig({
  worker: {
    // Bundle workers as IIFE so they work inside the library build.
    // Vite will inline them as Blob URLs in the output.
    format: 'iife',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/layershift/index.ts'),
      name: 'Layershift',
      formats: ['iife'],
      fileName: () => 'layershift.js',
    },
    outDir: 'dist/components',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: 'esbuild',
    rollupOptions: {
      // onnxruntime-web is excluded — depth estimation is an optional
      // feature loaded lazily via dynamic import().
      external: [/onnxruntime-web/],
      output: {
        // No external dependencies (except onnxruntime-web) — bundle everything.
        inlineDynamicImports: true,
      },
    },
  },
});
