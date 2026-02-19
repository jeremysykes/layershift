import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { FullscreenOverlay } from './FullscreenOverlay';
import type { VideoEntry } from '../../../types';

const mockVideos: VideoEntry[] = [
  {
    id: 'fashion-rain',
    src: '/videos/fashion-rain.mp4',
    depthSrc: '/videos/fashion-rain-depth.mp4',
    depthMeta: '/videos/fashion-rain.bin',
    label: 'Fashion Rain',
    thumb: '/thumbs/fashion-rain.jpg',
  },
  {
    id: 'city-walk',
    src: '/videos/city-walk.mp4',
    depthSrc: '/videos/city-walk-depth.mp4',
    depthMeta: '/videos/city-walk.bin',
    label: 'City Walk',
    thumb: '/thumbs/city-walk.jpg',
  },
];

/**
 * Fullscreen overlay for immersive effect viewing. Rendered as a React
 * portal to `document.body`. Features auto-hiding controls (top bar with
 * title and close button, bottom video selector filmstrip).
 *
 * **WebGL note:** The overlay renders a Layershift Web Component at full
 * viewport size. Since custom elements are not registered in Storybook,
 * the canvas area will show the error fallback. The chrome (top bar,
 * close button, video filmstrip) renders normally.
 *
 * **Interaction:** Press Escape or click the close button to dismiss.
 * On desktop, controls auto-hide after 3 seconds of inactivity and
 * reappear on mouse movement. On touch devices, a tap toggles controls.
 */
const meta = {
  title: 'Organisms/FullscreenOverlay',
  component: FullscreenOverlay,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    tagName: 'layershift-parallax',
    attrs: { src: '/demo.mp4', 'depth-src': '/demo-depth.mp4' },
    effectTitle: 'Depth Parallax',
    video: mockVideos[0],
    videos: mockVideos,
    activeVideoId: 'fashion-rain',
    onSelectVideo: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof FullscreenOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default fullscreen overlay with two videos in the filmstrip. */
export const Default: Story = {};

/** Single video — the bottom filmstrip is hidden when there is only one video. */
export const SingleVideo: Story = {
  args: {
    videos: [mockVideos[0]],
  },
};

/** Portal effect variant. */
export const PortalEffect: Story = {
  args: {
    tagName: 'layershift-portal',
    effectTitle: 'Portal',
  },
};
