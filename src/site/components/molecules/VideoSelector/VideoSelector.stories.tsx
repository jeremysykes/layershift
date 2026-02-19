import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { VideoSelector } from './VideoSelector';
import type { VideoEntry } from '../../../types';

const mockVideos: VideoEntry[] = [
  {
    id: 'fashion-rain',
    src: '/videos/fashion-rain.mp4',
    depthSrc: '/depth/fashion-rain.bin',
    depthMeta: '/depth/fashion-rain.json',
    label: 'Fashion Rain',
  },
  {
    id: 'mountain-lake',
    src: '/videos/mountain-lake.mp4',
    depthSrc: '/depth/mountain-lake.bin',
    depthMeta: '/depth/mountain-lake.json',
    label: 'Mountain Lake',
  },
  {
    id: 'city-night',
    src: '/videos/city-night.mp4',
    depthSrc: '/depth/city-night.bin',
    depthMeta: '/depth/city-night.json',
    label: 'City Night',
  },
  {
    id: 'forest-stream',
    src: '/videos/forest-stream.mp4',
    depthSrc: '/depth/forest-stream.bin',
    depthMeta: '/depth/forest-stream.json',
    label: 'Forest Stream',
  },
  {
    id: 'ocean-sunset',
    src: '/videos/ocean-sunset.mp4',
    depthSrc: '/depth/ocean-sunset.bin',
    depthMeta: '/depth/ocean-sunset.json',
    label: 'Ocean Sunset',
  },
];

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

export const Default: Story = {
  args: {
    videos: mockVideos,
    activeVideoId: 'fashion-rain',
  },
};

export const Large: Story = {
  args: {
    videos: mockVideos,
    activeVideoId: 'mountain-lake',
    large: true,
  },
};

export const NoSelection: Story = {
  args: {
    videos: mockVideos,
    activeVideoId: null,
  },
};
