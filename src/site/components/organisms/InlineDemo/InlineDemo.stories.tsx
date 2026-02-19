import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { InlineDemo } from './InlineDemo';
import type { VideoEntry } from '../../../types';

const mockVideo: VideoEntry = {
  id: 'fashion-rain',
  src: '/videos/fashion-rain.mp4',
  depthSrc: '/videos/fashion-rain-depth.mp4',
  depthMeta: '/videos/fashion-rain.bin',
  label: 'Fashion Rain',
  thumb: '/thumbs/fashion-rain.jpg',
};

/**
 * Inline effect demo with 16:9 aspect ratio, lazy initialization via
 * IntersectionObserver, skeleton loading state, and a fullscreen trigger
 * button.
 *
 * **WebGL note:** This component renders a Layershift Web Component
 * (`<layershift-parallax>` or `<layershift-portal>`) inside an
 * `EffectErrorBoundary`. Since the custom elements are not registered
 * in Storybook, the demo will display the error fallback or skeleton
 * state. The container layout, aspect ratio, and fullscreen button
 * are still visible.
 */
const meta = {
  title: 'Organisms/InlineDemo',
  component: InlineDemo,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    tagName: 'layershift-parallax',
    demoAttrs: {
      src: '/demo.mp4',
      'depth-src': '/demo-depth.mp4',
    },
    video: mockVideo,
    onEnterFullscreen: fn(),
  },
} satisfies Meta<typeof InlineDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default with video and fullscreen callback. */
export const Default: Story = {};

/** Without a video — uses only the demoAttrs as source. */
export const NoVideo: Story = {
  args: {
    video: null,
  },
};

/** Without a fullscreen callback — hides the fullscreen button. */
export const NoFullscreen: Story = {
  args: {
    onEnterFullscreen: undefined,
  },
};

/** Portal effect tag name variant. */
export const PortalEffect: Story = {
  args: {
    tagName: 'layershift-portal',
  },
};
