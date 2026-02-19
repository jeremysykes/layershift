import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BackToTop } from './BackToTop';

describe('BackToTop', () => {
  it('renders a button with "Back to top" label', () => {
    render(<BackToTop />);
    const btn = screen.getByRole('button', { name: 'Back to top' });
    expect(btn).toBeInTheDocument();
  });

  it('is initially hidden (opacity 0, pointer-events none)', () => {
    render(<BackToTop />);
    const btn = screen.getByRole('button', { name: 'Back to top' });
    // Initially visible is false, so opacity should be 0
    expect(btn.style.opacity).toBe('0');
    expect(btn.style.pointerEvents).toBe('none');
  });
});
