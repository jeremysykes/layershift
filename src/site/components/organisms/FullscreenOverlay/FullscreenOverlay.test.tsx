import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FullscreenOverlay } from './FullscreenOverlay';

describe('FullscreenOverlay', () => {
  const defaultProps = {
    tagName: 'layershift-parallax',
    attrs: { 'parallax-x': '0.5' },
    effectTitle: 'Depth Parallax',
    video: null,
    videos: [],
    activeVideoId: null,
    onSelectVideo: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders via portal into document.body', () => {
    render(<FullscreenOverlay {...defaultProps} />);
    // The overlay is portaled to document.body, so look for the fixed container there
    const overlay = document.querySelector('.fixed.inset-0.z-50');
    expect(overlay).toBeInTheDocument();
  });

  it('shows the effect title', () => {
    render(<FullscreenOverlay {...defaultProps} />);
    expect(screen.getByText('Depth Parallax')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<FullscreenOverlay {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
