import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { useSiteStore } from '../../../store';
import { EffectSelector } from './EffectSelector';

describe('EffectSelector', () => {
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

  it('renders tabs for enabled effects', () => {
    render(<EffectSelector />);

    expect(screen.getByRole('tab', { name: 'Depth Parallax' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Portal' })).toBeInTheDocument();
  });

  it('marks the active effect tab as selected', () => {
    render(<EffectSelector />);

    expect(screen.getByRole('tab', { name: 'Depth Parallax' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Portal' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('returns null when only 1 effect is enabled', () => {
    useSiteStore.setState({
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: false },
      ],
    });

    const { container } = render(<EffectSelector />);
    expect(container.innerHTML).toBe('');
  });

  it('switches active effect on click and updates store state', async () => {
    const user = userEvent.setup();
    render(<EffectSelector />);

    await user.click(screen.getByRole('tab', { name: 'Portal' }));

    expect(useSiteStore.getState().activeEffect).toBe('portal');
    expect(screen.getByRole('tab', { name: 'Portal' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('does not render disabled effects', () => {
    useSiteStore.setState({
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
        { id: 'disabled-one', label: 'Disabled Effect', enabled: false },
      ],
    });

    render(<EffectSelector />);

    expect(screen.getByRole('tab', { name: 'Depth Parallax' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Portal' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Disabled Effect' })).not.toBeInTheDocument();
  });
});
