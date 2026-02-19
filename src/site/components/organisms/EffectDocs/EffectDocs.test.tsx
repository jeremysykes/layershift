import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EffectDocs } from './EffectDocs';
import type { EffectContent } from '../../../types';

const baseContent: EffectContent = {
  id: 'test-effect',
  title: 'Test Effect',
  description: 'A test effect description.',
  tagName: 'layershift-test',
  heroAttrs: {},
  demoAttrs: {},
  embedCode: '<span class="tag">&lt;layershift-test&gt;&lt;/layershift-test&gt;</span>',
  frameworkExamples: [],
  configAttributes: [],
  events: [],
};

describe('EffectDocs', () => {
  it('renders the embed code block', () => {
    const { container } = render(<EffectDocs content={baseContent} />);
    // The CodeBlock renders an HTML code snippet inside a <code> element
    const codeEl = container.querySelector('code');
    expect(codeEl).toBeInTheDocument();
  });

  it('renders config table when attributes are provided', () => {
    const content: EffectContent = {
      ...baseContent,
      configAttributes: [
        {
          attribute: 'src',
          type: 'string',
          default: '\u2014',
          description: 'Video file URL',
        },
      ],
    };
    render(<EffectDocs content={content} />);
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('Video file URL')).toBeInTheDocument();
  });

  it('renders events table when events are provided', () => {
    const content: EffectContent = {
      ...baseContent,
      events: [
        {
          event: 'test:ready',
          detail: 'width, height',
          when: 'Initialization complete',
        },
      ],
    };
    render(<EffectDocs content={content} />);
    expect(screen.getByText('test:ready')).toBeInTheDocument();
    expect(screen.getByText('Initialization complete')).toBeInTheDocument();
  });

  it('renders "Architecture deep dive" link when docsLink is present', () => {
    const content: EffectContent = {
      ...baseContent,
      prepareVideoCode: '<span class="comment"># Install</span>\nnpm install layershift',
      docsLink: '/docs/test/overview',
    };
    render(<EffectDocs content={content} />);
    const deepDiveLink = screen.getByText(/architecture deep dive/i);
    expect(deepDiveLink).toBeInTheDocument();
    expect(deepDiveLink).toHaveAttribute('href', '/docs/test/overview');
  });
});
