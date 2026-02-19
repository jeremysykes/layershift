import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { VideoSelector } from './VideoSelector';
import type { VideoEntry } from '../../../types';

const makeVideos = (count: number): VideoEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `video-${i}`,
    src: `/videos/video-${i}.mp4`,
    depthSrc: `/depth/video-${i}.bin`,
    depthMeta: `/depth/video-${i}.json`,
    label: `Video ${i}`,
    thumb: `data:image/jpeg;base64,thumb${i}`,
  }));

describe('VideoSelector', () => {
  it('renders thumbnails for each video', () => {
    const videos = makeVideos(3);
    render(<VideoSelector videos={videos} activeVideoId="video-0" onSelect={() => {}} />);

    const buttons = screen.getAllByRole('button');
    // 3 video thumbnail buttons (no arrow buttons on touch or when not overflowing)
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders video labels as aria-labels on buttons', () => {
    const videos = makeVideos(2);
    render(<VideoSelector videos={videos} activeVideoId="video-0" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Video 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Video 1' })).toBeInTheDocument();
  });

  it('marks active video with aria-pressed true', () => {
    const videos = makeVideos(3);
    render(<VideoSelector videos={videos} activeVideoId="video-1" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Video 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Video 0' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onSelect when thumbnail is clicked', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const videos = makeVideos(3);

    render(<VideoSelector videos={videos} activeVideoId="video-0" onSelect={handleSelect} />);

    await user.click(screen.getByRole('button', { name: 'Video 2' }));
    expect(handleSelect).toHaveBeenCalledWith('video-2');
  });

  it('returns null when only 1 video', () => {
    const videos = makeVideos(1);
    const { container } = render(
      <VideoSelector videos={videos} activeVideoId="video-0" onSelect={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when no videos', () => {
    const { container } = render(
      <VideoSelector videos={[]} activeVideoId={null} onSelect={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows active video label below filmstrip when not in large mode', () => {
    const videos = makeVideos(3);
    render(<VideoSelector videos={videos} activeVideoId="video-1" onSelect={() => {}} />);

    expect(screen.getByText('Video 1')).toBeInTheDocument();
  });

  it('formats kebab-case IDs as title case labels when no label provided', () => {
    const videos: VideoEntry[] = [
      { id: 'fashion-rain', src: '/v.mp4', depthSrc: '/d.bin', depthMeta: '/d.json', thumb: 'data:image/jpeg;base64,t1' },
      { id: 'city-night', src: '/v2.mp4', depthSrc: '/d2.bin', depthMeta: '/d2.json', thumb: 'data:image/jpeg;base64,t2' },
    ];

    render(<VideoSelector videos={videos} activeVideoId="fashion-rain" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Fashion Rain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'City Night' })).toBeInTheDocument();
  });
});
