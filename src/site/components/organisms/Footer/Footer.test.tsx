import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Footer } from './Footer';
import { DOCS_URL } from '../../../lib/nav';

describe('Footer', () => {
  it('renders a footer element', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('contains "Built by" text', () => {
    render(<Footer />);
    expect(screen.getByText(/built by/i)).toBeInTheDocument();
  });

  it('contains a Docs link', () => {
    render(<Footer />);
    const docsLink = screen.getByRole('link', { name: /docs/i });
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute('href', DOCS_URL);
  });

  it('contains a GitHub icon link', () => {
    render(<Footer />);
    const githubLink = screen.getByRole('link', { name: /github/i });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/jeremysykes/layershift',
    );
  });
});
