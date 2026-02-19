import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { VideoSelector } from './VideoSelector';
import type { VideoEntry } from '../../../types';

/** Generate an SVG data URI placeholder thumbnail with a label. */
function placeholderThumb(label: string, hue: number): string {
  const bg = `hsl(${hue}, 25%, 12%)`;
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">` +
        `<rect fill="${bg}" width="160" height="90"/>` +
        `<text x="80" y="50" text-anchor="middle" fill="#666" font-size="10" font-family="system-ui,sans-serif">${label}</text>` +
        `</svg>`,
    )
  );
}

const mockVideos: VideoEntry[] = [
  {
    id: 'fashion-rain',
    src: '/videos/fashion-rain.mp4',
    depthSrc: '/depth/fashion-rain.bin',
    depthMeta: '/depth/fashion-rain.json',
    label: 'Fashion Rain',
    thumb: placeholderThumb('Fashion Rain', 240),
  },
  {
    id: 'mountain-lake',
    src: '/videos/mountain-lake.mp4',
    depthSrc: '/depth/mountain-lake.bin',
    depthMeta: '/depth/mountain-lake.json',
    label: 'Mountain Lake',
    thumb: placeholderThumb('Mountain Lake', 160),
  },
  {
    id: 'city-night',
    src: '/videos/city-night.mp4',
    depthSrc: '/depth/city-night.bin',
    depthMeta: '/depth/city-night.json',
    label: 'City Night',
    thumb: placeholderThumb('City Night', 270),
  },
  {
    id: 'forest-stream',
    src: '/videos/forest-stream.mp4',
    depthSrc: '/depth/forest-stream.bin',
    depthMeta: '/depth/forest-stream.json',
    label: 'Forest Stream',
    thumb: placeholderThumb('Forest Stream', 120),
  },
  {
    id: 'ocean-sunset',
    src: '/videos/ocean-sunset.mp4',
    depthSrc: '/depth/ocean-sunset.bin',
    depthMeta: '/depth/ocean-sunset.json',
    label: 'Ocean Sunset',
    thumb: placeholderThumb('Ocean Sunset', 20),
  },
];

/**
 * Horizontal filmstrip of video thumbnails. Users pick which demo video
 * to view the active effect on.
 *
 * Desktop: left/right arrow buttons with gradient edge masks.
 * Touch: native horizontal swipe with gradient masks.
 *
 * Thumbnails use SVG data URI placeholders in Storybook since the mock
 * video files don't exist. In production, thumbnails are either provided
 * via the `thumb` field or lazily extracted from the video source.
 */
const meta = {
  title: 'Molecules/VideoSelector',
  component: VideoSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    large: { control: 'boolean' },
  },
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof VideoSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default filmstrip with five videos. */
export const Default: Story = {
  args: {
    videos: mockVideos,
    activeVideoId: 'fashion-rain',
  },
};

/** Large variant used in the fullscreen overlay context. */
export const Large: Story = {
  args: {
    videos: mockVideos,
    activeVideoId: 'mountain-lake',
    large: true,
  },
};

/** No active selection — all thumbnails appear at reduced opacity. */
export const NoSelection: Story = {
  args: {
    videos: mockVideos,
    activeVideoId: null,
  },
};
