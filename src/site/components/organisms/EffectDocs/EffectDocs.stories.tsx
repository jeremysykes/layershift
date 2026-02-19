import type { Meta, StoryObj } from '@storybook/react-vite';
import { EffectDocs } from './EffectDocs';
import type { EffectContent } from '../../../types';

const mockContent: EffectContent = {
  id: 'parallax',
  title: 'Depth Parallax',
  description: 'GPU-accelerated parallax driven by a precomputed depth map.',
  tagName: 'layershift-parallax',
  heroAttrs: { src: '/hero.mp4', 'depth-src': '/hero-depth.mp4' },
  demoAttrs: { src: '/demo.mp4', 'depth-src': '/demo-depth.mp4' },
  embedIntro: 'Add the component to your page with a single HTML tag:',
  embedCode:
    '<span class="tag">&lt;layershift-parallax</span>\n' +
    '  <span class="attr">src</span>=<span class="string">"/video.mp4"</span>\n' +
    '  <span class="attr">depth-src</span>=<span class="string">"/depth.mp4"</span>\n' +
    '<span class="tag">&gt;&lt;/layershift-parallax&gt;</span>',
  frameworkExamples: [
    {
      framework: 'React',
      code:
        '<span class="keyword">import</span> <span class="string">\'layershift\'</span>;\n\n' +
        '<span class="tag">&lt;layershift-parallax</span>\n' +
        '  <span class="attr">src</span>=<span class="string">"/video.mp4"</span>\n' +
        '  <span class="attr">depth-src</span>=<span class="string">"/depth.mp4"</span>\n' +
        '<span class="tag">/&gt;</span>',
    },
    {
      framework: 'Vue',
      code:
        '<span class="tag">&lt;template&gt;</span>\n' +
        '  <span class="tag">&lt;layershift-parallax</span>\n' +
        '    <span class="attr">src</span>=<span class="string">"/video.mp4"</span>\n' +
        '    <span class="attr">depth-src</span>=<span class="string">"/depth.mp4"</span>\n' +
        '  <span class="tag">/&gt;</span>\n' +
        '<span class="tag">&lt;/template&gt;</span>',
    },
  ],
  configAttributes: [
    {
      attribute: 'src',
      type: 'string',
      default: '—',
      description: 'URL to the color video source.',
    },
    {
      attribute: 'depth-src',
      type: 'string',
      default: '—',
      description: 'URL to the depth map video.',
    },
    {
      attribute: 'depth-meta',
      type: 'string',
      default: '—',
      description: 'URL to the binary depth metadata file.',
    },
    {
      attribute: 'intensity',
      type: 'number',
      default: '0.5',
      description: 'Parallax displacement intensity (0-1).',
    },
  ],
  events: [
    {
      event: 'layershift-parallax:ready',
      detail: '{ width, height }',
      when: 'First frame rendered and video playing.',
    },
    {
      event: 'layershift-parallax:error',
      detail: '{ message }',
      when: 'WebGL context or video decode failure.',
    },
  ],
  eventListenerExample:
    '<span class="keyword">const</span> el = <span class="variable">document</span>.' +
    '<span class="function">querySelector</span>(<span class="string">\'layershift-parallax\'</span>);\n' +
    'el.<span class="function">addEventListener</span>(<span class="string">\'layershift-parallax:ready\'</span>, (e) =&gt; {\n' +
    '  <span class="variable">console</span>.<span class="function">log</span>(<span class="string">\'Ready!\'</span>, e.detail);\n' +
    '});',
  performanceTable: [
    { instances: '1-2', suitability: 'Excellent — runs at 60 fps on all modern devices.' },
    { instances: '3-5', suitability: 'Good — may drop frames on low-end mobile.' },
    { instances: '6+', suitability: 'Use caution — stagger initialization or lazy-load.' },
  ],
  performanceNotes:
    'Each instance creates its own WebGL context and video decoder. Keep concurrent instances low for the best experience.',
  prepareVideoIntro:
    'Use the CLI tool to generate a depth map from any MP4 video:',
  prepareVideoCode:
    '<span class="keyword">npx</span> layershift precompute-depth <span class="string">input.mp4</span> <span class="string">--output depth.mp4</span>',
  docsLink: '/docs/parallax/',
};

/**
 * Renders the documentation section for a single effect. Receives an
 * `EffectContent` object and displays embed code, framework tabs,
 * configuration attribute table, events table, performance info, and
 * video preparation instructions.
 */
const meta = {
  title: 'Organisms/EffectDocs',
  component: EffectDocs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EffectDocs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full documentation with all sections populated. */
export const AllSections: Story = {
  args: {
    content: mockContent,
  },
};

/** Minimal content with only the required fields. */
export const Minimal: Story = {
  args: {
    content: {
      ...mockContent,
      embedIntro: undefined,
      frameworkExamples: [],
      configAttributes: [],
      events: [],
      eventListenerExample: undefined,
      performanceTable: undefined,
      performanceNotes: undefined,
      prepareVideoCode: undefined,
      prepareVideoIntro: undefined,
      docsLink: undefined,
    },
  },
};

/** Content with framework examples but no performance or prepare-video sections. */
export const WithFrameworkExamples: Story = {
  args: {
    content: {
      ...mockContent,
      performanceTable: undefined,
      performanceNotes: undefined,
      prepareVideoCode: undefined,
      prepareVideoIntro: undefined,
    },
  },
};
