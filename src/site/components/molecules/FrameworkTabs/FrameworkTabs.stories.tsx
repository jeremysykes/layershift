import type { Meta, StoryObj } from '@storybook/react-vite';

import { FrameworkTabs } from './FrameworkTabs';
import type { FrameworkExample } from '../../../types';

const sampleExamples: FrameworkExample[] = [
  {
    framework: 'HTML',
    code: [
      '<span class="tag">&lt;script </span><span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/parallax.iife.js"</span><span class="tag">&gt;&lt;/script&gt;</span>',
      '',
      '<span class="tag">&lt;layershift-parallax</span>',
      '  <span class="attr">src</span>=<span class="string">"/video.mp4"</span>',
      '  <span class="attr">depth-src</span>=<span class="string">"/depth.bin"</span>',
      '<span class="tag">&gt;&lt;/layershift-parallax&gt;</span>',
    ].join('\n'),
  },
  {
    framework: 'React',
    code: [
      '<span class="keyword">import</span> <span class="string">\'layershift/parallax\'</span>;',
      '',
      '<span class="keyword">export default function</span> <span class="attr">App</span>() {',
      '  <span class="keyword">return</span> (',
      '    <span class="tag">&lt;layershift-parallax</span>',
      '      <span class="attr">src</span>=<span class="string">"/video.mp4"</span>',
      '      <span class="attr">depth-src</span>=<span class="string">"/depth.bin"</span>',
      '    <span class="tag">/&gt;</span>',
      '  );',
      '}',
    ].join('\n'),
  },
  {
    framework: 'Vue',
    code: [
      '<span class="tag">&lt;template&gt;</span>',
      '  <span class="tag">&lt;layershift-parallax</span>',
      '    <span class="attr">src</span>=<span class="string">"/video.mp4"</span>',
      '    <span class="attr">depth-src</span>=<span class="string">"/depth.bin"</span>',
      '  <span class="tag">/&gt;</span>',
      '<span class="tag">&lt;/template&gt;</span>',
    ].join('\n'),
  },
];

const meta = {
  title: 'Molecules/FrameworkTabs',
  component: FrameworkTabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof FrameworkTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    examples: sampleExamples,
  },
};
