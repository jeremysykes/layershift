import type { Meta, StoryObj } from '@storybook/react-vite';
import { withStore } from '../../../../../.storybook/decorators/withStore';
import { EffectSection } from './EffectSection';

/**
 * Orchestrates the active effect's inline demo, video selector, and
 * documentation panel. Handles effect-switching transitions, fullscreen
 * mode, and user video selection.
 *
 * **Store dependencies:** Reads `activeEffect`, `videos`, `selectedVideoId`
 * from the Zustand store. Uses `useVideoAssignment` hook for hero/demo
 * video assignment and `getEffectContent()` for structured documentation.
 *
 * **WebGL note:** The inline demo and fullscreen overlay both render
 * Layershift Web Components (`<layershift-parallax>`, `<layershift-portal>`)
 * that require WebGL. In Storybook the custom elements are not registered,
 * so the demo canvas will show the skeleton/error fallback. The surrounding
 * UI (title, description, docs, video selector) renders normally when
 * effect-content is available.
 */
const meta = {
  title: 'Organisms/EffectSection',
  component: EffectSection,
  tags: ['autodocs'],
  decorators: [withStore],
  parameters: {
    layout: 'fullscreen',
    store: {
      activeEffect: 'parallax',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
      ],
      videos: {
        parallax: [
          {
            id: 'fashion-rain',
            src: '/videos/fashion-rain.mp4',
            depthSrc: '/videos/fashion-rain-depth.mp4',
            depthMeta: '/videos/fashion-rain.bin',
            label: 'Fashion Rain',
            thumb: '/thumbs/fashion-rain.jpg',
          },
        ],
        textural: [],
      },
    },
  },
} satisfies Meta<typeof EffectSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Parallax effect active. Demo canvas will show error fallback without WebGL. */
export const Parallax: Story = {};

/** Portal effect active. */
export const Portal: Story = {
  parameters: {
    store: {
      activeEffect: 'portal',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
      ],
      videos: {
        parallax: [],
        textural: [
          {
            id: 'texture-wave',
            src: '/videos/texture-wave.mp4',
            depthSrc: '/videos/texture-wave-depth.mp4',
            depthMeta: '/videos/texture-wave.bin',
            label: 'Texture Wave',
            thumb: '/thumbs/texture-wave.jpg',
          },
        ],
      },
    },
  },
};
