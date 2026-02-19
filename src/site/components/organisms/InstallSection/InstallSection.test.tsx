import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InstallSection } from './InstallSection';

describe('InstallSection', () => {
  it('renders the install heading', () => {
    render(<InstallSection />);
    expect(
      screen.getByRole('heading', { name: /get started/i }),
    ).toBeInTheDocument();
  });

  it('renders tab options for npm, CDN, and other methods', () => {
    render(<InstallSection />);
    expect(screen.getByRole('tab', { name: /^npm$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^cdn$/i })).toBeInTheDocument();
  });

  it('shows the npm install command by default', () => {
    render(<InstallSection />);
    expect(screen.getByText(/install layershift/)).toBeInTheDocument();
  });
});
