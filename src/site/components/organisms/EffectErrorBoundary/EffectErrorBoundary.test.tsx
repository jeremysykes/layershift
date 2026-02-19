import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EffectErrorBoundary } from './EffectErrorBoundary';

function ThrowingChild(): React.ReactNode {
  throw new Error('Test render error');
}

describe('EffectErrorBoundary', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Suppress console.error since error boundaries log errors
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children normally when no error occurs', () => {
    render(
      <EffectErrorBoundary fallback={<div>Fallback</div>}>
        <div>Normal content</div>
      </EffectErrorBoundary>,
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('shows fallback when a child throws an error', () => {
    render(
      <EffectErrorBoundary fallback={<div>Fallback UI</div>}>
        <ThrowingChild />
      </EffectErrorBoundary>,
    );
    expect(screen.getByText('Fallback UI')).toBeInTheDocument();
  });
});
