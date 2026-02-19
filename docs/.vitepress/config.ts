import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'Layershift',
    description: 'Architecture and API reference for the Layershift video effects library',
    base: '/docs/',
    outDir: '../dist/docs',
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
  })
)
