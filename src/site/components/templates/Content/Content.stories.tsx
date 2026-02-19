import type { Meta, StoryObj } from '@storybook/react-vite';
import { withStore } from '../../../../../.storybook/decorators/withStore';
import { Content } from './Content';

/**
 * Main content area that composes all below-the-fold sections:
 * IntroSection, InstallSection, EffectSection (in a RevealSection),
 * ComingSoonSection, RecentlyShippedSection, and Footer.
 *
 * Positioned at `margin-top: 100vh` in production to sit below the
 * fixed hero. A decorator overrides this to `0` so content is
 * immediately visible in Storybook.
 *
 * **Store dependencies:** IntroSection, EffectSection, and their
 * children read from the Zustand store for effect state and videos.
 *
 * **WebGL note:** EffectSection's inline demo and fullscreen overlay
 * both render Layershift Web Components. In Storybook the custom
 * elements are not registered so those areas show skeleton/error
 * fallback. All other sections render normally.
 */
const meta = {
  title: 'Templates/Content',
  component: Content,
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div>
        {/*
         * Override the 100vh top margin that exists for the fixed hero.
         * Tailwind v4 puts utilities in @layer, so a non-layered rule
         * naturally takes precedence without needing !important.
         */}
        <style>{`.content { margin-top: 0; }`}</style>
        <Story />
      </div>
    ),
    withStore,
  ],
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
          },
        ],
        textural: [],
      },
    },
  },
} satisfies Meta<typeof Content>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full content area with all sections. */
export const Default: Story = {};
