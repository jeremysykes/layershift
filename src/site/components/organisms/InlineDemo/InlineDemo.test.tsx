import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InlineDemo } from './InlineDemo';

describe('InlineDemo', () => {
  it('renders a container element', () => {
    const { container } = render(
      <InlineDemo
        tagName="layershift-parallax"
        demoAttrs={{ 'parallax-x': '0.5' }}
        video={null}
      />,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass('aspect-video');
  });

  it('shows skeleton overlay initially', () => {
    const { container } = render(
      <InlineDemo
        tagName="layershift-parallax"
        demoAttrs={{ 'parallax-x': '0.5' }}
        video={null}
      />,
    );
    const skeleton = container.querySelector('.skeleton-shimmer');
    expect(skeleton).toBeInTheDocument();
  });
});
