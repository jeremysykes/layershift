import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Content } from './Content';
import { useSiteStore } from '../../../store';

beforeEach(() => {
  useSiteStore.setState({
    activeEffect: 'parallax',
    effects: [
      { id: 'parallax', label: 'Depth Parallax', enabled: true },
      { id: 'portal', label: 'Portal', enabled: true },
    ],
    videos: { parallax: [], textural: [], 'rack-focus': [] },
    isInitialized: true,
    selectedVideoId: null,
  });
});

describe('Content', () => {
  it('renders without crashing with store state set', () => {
    const { container } = render(<Content />);
    expect(container).toBeTruthy();
  });
});
