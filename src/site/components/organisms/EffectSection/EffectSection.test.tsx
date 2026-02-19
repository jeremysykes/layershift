import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { EffectSection } from './EffectSection';
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

describe('EffectSection', () => {
  it('renders without crashing with store state set', () => {
    const { container } = render(<EffectSection />);
    expect(container).toBeTruthy();
  });
});
