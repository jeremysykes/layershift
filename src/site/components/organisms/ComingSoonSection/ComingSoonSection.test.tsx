import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComingSoonSection } from './ComingSoonSection';

describe('ComingSoonSection', () => {
  it('renders coming soon content', () => {
    render(<ComingSoonSection />);
    expect(
      screen.getByRole('heading', { name: /more effects coming soon/i }),
    ).toBeInTheDocument();
  });

  it('contains a GitHub link', () => {
    render(<ComingSoonSection />);
    const githubLink = screen.getByRole('link', { name: /star on github/i });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/jeremysykes/layershift',
    );
  });
});
