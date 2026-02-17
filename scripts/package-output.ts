/**
 * Package output script.
 *
 * After running `npm run precompute` and `npm run build:component`,
 * this script copies all assets into a self-contained output directory
 * that can be deployed or shared.
 *
 * Usage:
 *   npx tsx scripts/package-output.ts [output-dir]
 *
 * Output directory structure:
 *   output/
 *     video.mp4
 *     depth-data.bin
 *     depth-meta.json
 *     depth-parallax.js
 *     index.html
 *     README.md
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve(process.argv[2] ?? './output');
const publicDir = resolve('./public');
const componentPath = resolve('./dist/components/depth-parallax.js');

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  // Copy assets
  await Promise.all([
    copyFile(resolve(publicDir, 'sample.mp4'), resolve(outputDir, 'video.mp4')),
    copyFile(resolve(publicDir, 'depth-data.bin'), resolve(outputDir, 'depth-data.bin')),
    copyFile(resolve(publicDir, 'depth-meta.json'), resolve(outputDir, 'depth-meta.json')),
    copyFile(componentPath, resolve(outputDir, 'depth-parallax.js')),
  ]);

  // Generate index.html
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Depth Parallax</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    depth-parallax { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <depth-parallax
    src="video.mp4"
    depth-src="depth-data.bin"
    depth-meta="depth-meta.json"
  ></depth-parallax>
  <script src="depth-parallax.js"></script>
</body>
</html>
`;

  // Generate README
  const readme = `# Depth Parallax Embed

This directory contains a self-contained depth parallax video embed.

## Files

- \`video.mp4\` — Source video
- \`depth-data.bin\` — Precomputed depth data
- \`depth-meta.json\` — Depth metadata
- \`depth-parallax.js\` — Web Component (self-contained, no dependencies)
- \`index.html\` — Fullscreen demo page

## Quick Start

Open \`index.html\` in a browser, or serve the directory:

\`\`\`bash
npx serve .
\`\`\`

## Embed in Your Site

### Plain HTML

\`\`\`html
<script src="depth-parallax.js"></script>

<depth-parallax
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
></depth-parallax>
\`\`\`

### React

\`\`\`jsx
import { DepthParallax } from 'depth-parallax/react'

export default function Hero() {
  return (
    <DepthParallax
      src="video.mp4"
      depthSrc="depth-data.bin"
      depthMeta="depth-meta.json"
    />
  )
}
\`\`\`

### Vue

\`\`\`vue
<template>
  <DepthParallax
    src="video.mp4"
    depth-src="depth-data.bin"
    depth-meta="depth-meta.json"
  />
</template>

<script setup>
import DepthParallax from 'depth-parallax/vue'
</script>
\`\`\`

> **Vue note:** Add \`compilerOptions.isCustomElement: (tag) => tag === 'depth-parallax'\` to your Vite or Vue config.

### Svelte

\`\`\`svelte
<script>
  import DepthParallax from 'depth-parallax/svelte'
</script>

<DepthParallax
  src="video.mp4"
  depthSrc="depth-data.bin"
  depthMeta="depth-meta.json"
/>
\`\`\`

### Angular

\`\`\`typescript
import { DepthParallaxComponent } from 'depth-parallax/angular'

@Component({
  imports: [DepthParallaxComponent],
  template: \\\`
    <app-depth-parallax
      src="video.mp4"
      depthSrc="depth-data.bin"
      depthMeta="depth-meta.json"
    />
  \\\`
})
export class HeroComponent {}
\`\`\`

> **Angular note:** Add \`CUSTOM_ELEMENTS_SCHEMA\` to your module or component schemas.

## Configuration

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| \`src\` | string | — | Video file URL (required) |
| \`depth-src\` | string | — | Depth binary URL (required) |
| \`depth-meta\` | string | — | Depth metadata URL (required) |
| \`parallax-x\` | number | 0.4 | Horizontal parallax intensity |
| \`parallax-y\` | number | 1.0 | Vertical parallax intensity |
| \`parallax-max\` | number | 30 | Max pixel offset for nearest layer |
| \`overscan\` | number | 0.05 | Extra padding ratio |
| \`autoplay\` | boolean | true | Auto-play on mount |
| \`loop\` | boolean | true | Loop playback |
| \`muted\` | boolean | true | Muted (required for autoplay) |
`;

  await writeFile(resolve(outputDir, 'index.html'), indexHtml, 'utf8');
  await writeFile(resolve(outputDir, 'README.md'), readme, 'utf8');

  console.log(`Packaged output to ${outputDir}`);
  console.log('Files:');
  console.log('  video.mp4');
  console.log('  depth-data.bin');
  console.log('  depth-meta.json');
  console.log('  depth-parallax.js');
  console.log('  index.html');
  console.log('  README.md');
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
