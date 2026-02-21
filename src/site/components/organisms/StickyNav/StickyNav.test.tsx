import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { StickyNav } from './StickyNav';
import { useSiteStore } from '../../../store';
import { DOCS_URL } from '../../../lib/nav';

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

describe('StickyNav', () => {
  it('renders a header element', () => {
    render(<StickyNav />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('contains the wordmark "layershift"', () => {
    render(<StickyNav />);
    expect(screen.getByText(/layershift/)).toBeInTheDocument();
  });

  it('contains a Docs link', () => {
    render(<StickyNav />);
    const docsLink = screen.getByRole('link', { name: /docs/i });
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute('href', DOCS_URL);
  });

  it('contains a GitHub link', () => {
    render(<StickyNav />);
    const githubLink = screen.getByRole('link', { name: /github/i });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/jeremysykes/layershift',
    );
  });
});
