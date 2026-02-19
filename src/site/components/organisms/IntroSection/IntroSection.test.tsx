import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { IntroSection } from './IntroSection';
import { useSiteStore } from '../../../store';

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

describe('IntroSection', () => {
  it('renders the intro section', () => {
    render(<IntroSection />);
    expect(
      screen.getByRole('heading', { name: /embeddable video effects/i }),
    ).toBeInTheDocument();
  });

  it('contains the effect selector when multiple effects are enabled', () => {
    render(<IntroSection />);
    // With two enabled effects, the EffectSelector renders tab triggers
    expect(screen.getByRole('tab', { name: /depth parallax/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /portal/i })).toBeInTheDocument();
  });
});
