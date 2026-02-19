import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RevealSection } from './RevealSection';

describe('RevealSection', () => {
  it('renders a section element', () => {
    const { container } = render(<RevealSection>Content</RevealSection>);
    const section = container.querySelector('section');
    expect(section).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<RevealSection><span>Child content</span></RevealSection>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <RevealSection className="custom-class">Content</RevealSection>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveClass('custom-class');
  });

  it('applies id prop', () => {
    const { container } = render(
      <RevealSection id="test-section">Content</RevealSection>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'test-section');
  });

  it('has the "reveal" class', () => {
    const { container } = render(
      <RevealSection>Content</RevealSection>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveClass('reveal');
  });
});
