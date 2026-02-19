import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useSiteStore } from '../../../store';
import { EffectDots } from './EffectDots';

describe('EffectDots', () => {
  beforeEach(() => {
    useSiteStore.setState({
      activeEffect: 'parallax',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
      ],
      videos: { parallax: [], textural: [] },
      isInitialized: true,
      selectedVideoId: null,
    });
  });

  it('renders correct number of dots based on enabled effects', () => {
    const { container } = render(<EffectDots />);
    const dots = container.querySelectorAll('span');
    expect(dots).toHaveLength(2);
  });

  it('highlights the active effect dot', () => {
    const { container } = render(<EffectDots />);
    const dots = container.querySelectorAll('span');
    // First dot (parallax) should be active
    expect(dots[0].style.background).toBe('#fff');
    // Second dot (portal) should be inactive
    expect(dots[1].style.background).toBe('rgba(255, 255, 255, 0.3)');
  });

  it('renders nothing if only 1 enabled effect', () => {
    useSiteStore.setState({
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: false },
      ],
    });
    const { container } = render(<EffectDots />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing if no effects are enabled', () => {
    useSiteStore.setState({
      effects: [],
    });
    const { container } = render(<EffectDots />);
    expect(container.innerHTML).toBe('');
  });
});
