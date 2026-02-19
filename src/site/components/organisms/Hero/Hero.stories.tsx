import type { Meta, StoryObj } from '@storybook/react-vite';
import { withStore } from '../../../../../.storybook/decorators/withStore';
import { Hero } from './Hero';

/**
 * Full-screen hero section that renders the active Layershift effect as
 * a viewport-filling background, overlaid with the Wordmark, HeroCta,
 * and ScrollHint.
 *
 * **Store dependencies:** Reads `activeEffect` and `videos` from the
 * Zustand store. Uses `useVideoAssignment` to select the hero video
 * and `getEffectContent()` for tag name and attributes.
 *
 * **Hooks:** Uses `useHeroScroll` for scroll-driven parallax on the
 * wordmark, CTA, and scroll hint elements.
 *
 * **WebGL note:** The hero renders a Layershift Web Component at full
 * viewport size. Since the custom elements are not registered in
 * Storybook, the canvas will show the skeleton/error fallback. The
 * overlaid UI (Wordmark, HeroCta, ScrollHint) still renders.
 */
const meta = {
  title: 'Organisms/Hero',
  component: Hero,
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
            id: 'hero-parallax',
            src: '/videos/hero.mp4',
            depthSrc: '/videos/hero-depth.mp4',
            depthMeta: '/videos/hero.bin',
            label: 'Hero',
          },
        ],
        textural: [],
      },
    },
  },
} satisfies Meta<typeof Hero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default hero with parallax effect. */
export const Default: Story = {};

/** Portal effect variant. */
export const PortalEffect: Story = {
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
            id: 'hero-portal',
            src: '/videos/hero-texture.mp4',
            depthSrc: '/videos/hero-texture-depth.mp4',
            depthMeta: '/videos/hero-texture.bin',
            label: 'Hero Texture',
          },
        ],
      },
    },
  },
};
