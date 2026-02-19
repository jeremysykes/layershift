import type { Meta, StoryObj } from '@storybook/react-vite';

import { CodeBlock } from './CodeBlock';

const sampleHtml = [
  '<span class="tag">&lt;layershift-parallax</span>',
  '  <span class="attr">src</span>=<span class="string">"/videos/demo.mp4"</span>',
  '  <span class="attr">depth-src</span>=<span class="string">"/depth/demo.bin"</span>',
  '  <span class="attr">depth-meta</span>=<span class="string">"/depth/demo.json"</span>',
  '<span class="tag">&gt;&lt;/layershift-parallax&gt;</span>',
].join('\n');

const jsHtml = [
  '<span class="keyword">const</span> <span class="attr">el</span> = <span class="keyword">document</span>.<span class="attr">querySelector</span>(<span class="string">\'layershift-parallax\'</span>);',
  '<span class="attr">el</span>.<span class="attr">addEventListener</span>(<span class="string">\'layershift:ready\'</span>, () =&gt; {',
  '  <span class="comment">// Effect is ready</span>',
  '  <span class="attr">console</span>.<span class="attr">log</span>(<span class="string">\'Parallax initialized\'</span>);',
  '});',
].join('\n');

const meta = {
  title: 'Atoms/CodeBlock',
  component: CodeBlock,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    html: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HtmlSnippet: Story = {
  args: {
    html: sampleHtml,
  },
};

export const JavaScriptSnippet: Story = {
  args: {
    html: jsHtml,
  },
};
