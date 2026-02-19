import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LayershiftEffect } from './LayershiftEffect';

describe('LayershiftEffect', () => {
  it('renders the correct tag name element', () => {
    const { container } = render(
      <LayershiftEffect
        tagName="layershift-parallax"
        attrs={{ src: 'video.mp4' }}
      />,
    );
    const element = container.querySelector('layershift-parallax');
    expect(element).toBeInTheDocument();
  });

  it('renders a different tag name element', () => {
    const { container } = render(
      <LayershiftEffect
        tagName="layershift-portal"
        attrs={{ src: 'video.mp4', 'logo-src': 'logo.svg' }}
      />,
    );
    const element = container.querySelector('layershift-portal');
    expect(element).toBeInTheDocument();
  });
});
