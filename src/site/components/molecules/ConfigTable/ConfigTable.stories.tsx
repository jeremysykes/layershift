import type { Meta, StoryObj } from '@storybook/react-vite';

import { ConfigTable } from './ConfigTable';
import type { ConfigAttribute } from '../../../types';

const sampleAttributes: ConfigAttribute[] = [
  {
    attribute: 'src',
    type: 'string',
    default: '--',
    description: 'URL of the video file to render',
  },
  {
    attribute: 'depth-src',
    type: 'string',
    default: '--',
    description: 'URL of the precomputed depth map binary',
  },
  {
    attribute: 'depth-meta',
    type: 'string',
    default: '--',
    description: 'URL of the depth map metadata JSON',
  },
  {
    attribute: 'intensity',
    type: 'number',
    default: '0.5',
    description: 'Parallax displacement intensity multiplier',
  },
  {
    attribute: 'focus',
    type: 'number',
    default: '0.5',
    description: 'Focal depth for parallax (0 = near, 1 = far)',
  },
  {
    attribute: 'scale',
    type: 'number',
    default: '1.1',
    description: 'Video overscan factor to hide edge artifacts',
  },
  {
    attribute: 'autoplay',
    type: 'boolean',
    default: 'true',
    description: 'Automatically start video playback on load',
  },
];

const manyAttributes: ConfigAttribute[] = [
  ...sampleAttributes,
  {
    attribute: 'loop',
    type: 'boolean',
    default: 'true',
    description: 'Loop the video when it reaches the end',
  },
  {
    attribute: 'muted',
    type: 'boolean',
    default: 'true',
    description: 'Mute the video audio',
  },
  {
    attribute: 'crossorigin',
    type: 'string',
    default: 'anonymous',
    description: 'CORS mode for the video element',
  },
];

const meta = {
  title: 'Molecules/ConfigTable',
  component: ConfigTable,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ConfigTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    attributes: sampleAttributes,
  },
};

export const WithFilter: Story = {
  args: {
    attributes: manyAttributes,
  },
};
