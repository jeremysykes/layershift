import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'Layershift',
    description: 'Architecture and API reference for the Layershift video effects library',
    base: '/docs/',
    outDir: '../dist/docs',
    cleanUrls: true,
    srcDir: '.',
    srcExclude: ['.vitepress/**'],

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/docs/favicon.svg' }],
    ],

    appearance: 'dark',

    markdown: {
      theme: 'one-dark-pro',
    },

    themeConfig: {
      siteTitle: 'layershift',
      logo: '/favicon.svg',

      nav: [
        { text: 'Home', link: 'https://layershift.io', target: '_self' },
        { text: 'Components', link: 'https://layershift.io/storybook/', target: '_self' },
      ],

      sidebar: [
        {
          text: 'Overview',
          items: [
            { text: 'Architecture', link: '/architecture' },
            { text: 'Compositing Possibilities', link: '/compositing-possibilities' },
          ],
        },
        {
          text: 'Parallax Effect',
          items: [
            { text: 'Derivation Rules', link: '/parallax/depth-derivation-rules' },
            { text: 'Analysis Skills', link: '/parallax/depth-analysis-skills' },
            { text: 'Architecture', link: '/parallax/depth-derivation-architecture' },
            { text: 'Testability', link: '/parallax/depth-derivation-testability' },
            { text: 'Self-Audit', link: '/parallax/depth-derivation-self-audit' },
          ],
        },
        {
          text: 'Portal Effect',
          items: [
            { text: 'Overview', link: '/portal/portal-overview' },
            { text: 'v2 Design', link: '/portal/portal-v2-design' },
            { text: 'v3 Dimensional Typography', link: '/portal/portal-v3-dimensional-typography' },
          ],
        },
        {
          text: 'Diagrams',
          items: [
            { text: 'System Architecture', link: '/diagrams/system-architecture' },
            { text: 'Parallax Init', link: '/diagrams/parallax-initialization' },
            { text: 'Parallax Render Loop', link: '/diagrams/parallax-render-loop' },
            { text: 'Portal Init', link: '/diagrams/portal-initialization' },
            { text: 'Portal Render Pipeline', link: '/diagrams/portal-render-pipeline' },
            { text: 'Depth Parameter Derivation', link: '/diagrams/depth-parameter-derivation' },
            { text: 'Depth Precompute Pipeline', link: '/diagrams/depth-precompute-pipeline' },
            { text: 'Build System', link: '/diagrams/build-system' },
          ],
        },
        {
          text: 'Decisions (ADR)',
          items: [
            { text: 'ADR-001: Depth-Derived Tuning', link: '/adr/ADR-001-depth-derived-parallax-tuning' },
            { text: 'ADR-002: WebGL Rendering', link: '/adr/ADR-002-webgl-rendering-approach' },
            { text: 'ADR-003: Staging Workflow', link: '/adr/ADR-003-staging-preview-deployment-workflow' },
            { text: 'ADR-004: Three.js to WebGL 2', link: '/adr/ADR-004-threejs-to-pure-webgl-migration' },
            { text: 'ADR-005: Portal Effect', link: '/adr/ADR-005-logo-depth-portal-effect' },
            { text: 'ADR-006: Portal v4', link: '/adr/ADR-006-portal-v4-emissive-chamfer-nesting' },
            { text: 'ADR-007: VitePress Wiki', link: '/adr/ADR-007-vitepress-documentation-wiki' },
            { text: 'ADR-008: Storybook Components', link: '/adr/ADR-008-storybook-atomic-design-components' },
            { text: 'ADR-009: GPU Bilateral Filter', link: '/adr/ADR-009-gpu-bilateral-filter' },
            { text: 'ADR-010: Multi-Pass Renderer', link: '/adr/ADR-010-multi-pass-renderer-architecture' },
            { text: 'ADR-011: Render Pass Framework', link: '/adr/ADR-011-shared-render-pass-framework' },
            { text: 'ADR-012: Adaptive Quality', link: '/adr/ADR-012-adaptive-quality-scaling' },
            { text: 'ADR-013: WebGPU Renderer', link: '/adr/ADR-013-webgpu-renderer-path' },
            { text: 'ADR-014: Browser Depth Estimation', link: '/adr/ADR-014-browser-depth-estimation' },
            { text: 'ADR-015: Depth Model Selection', link: '/adr/ADR-015-depth-model-variant-selection' },
            { text: 'ADR-016: Deferred Image/Webcam', link: '/adr/ADR-016-deferred-image-webcam-source-support' },
          ],
        },
        {
          text: 'Product',
          items: [
            { text: 'Roadmap', link: '/product/roadmap' },
            { text: 'Webcam Integration Design', link: '/product/features/webcam-integration-design' },
          ],
        },
      ],

      search: {
        provider: 'local',
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/jeremysykes/layershift' },
      ],
    },

    mermaid: {
      theme: 'dark',
    },

    mermaidPlugin: {
      class: 'mermaid',
    },

    vite: {
      server: {
        port: 5174,
      },
    },
  })
)
