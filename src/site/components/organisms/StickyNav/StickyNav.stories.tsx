import type { Meta, StoryObj } from '@storybook/react-vite';
import { withStore } from '../../../../../.storybook/decorators/withStore';
import { StickyNav } from './StickyNav';

/**
 * Sticky navigation header that slides in after scrolling past the hero section.
 *
 * Contains: wordmark (scroll-to-top link), compact EffectSelector, Docs link,
 * and GitHub icon.
 *
 * **Visibility behavior:** In production the nav is hidden (`translateY(-100%)`)
 * until `window.scrollY > window.innerHeight`. In these stories the component
 * renders with that scroll-dependent visibility, so the "ForceVisible" story
 * uses a wrapper to override the transform and make the nav always visible for
 * inspection.
 */
const meta = {
  title: 'Organisms/StickyNav',
  component: StickyNav,
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
    },
  },
} satisfies Meta<typeof StickyNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default rendering. The nav is hidden until the user scrolls past
 * `window.innerHeight`. In this isolated story the scroll threshold
 * is not met, so the bar remains off-screen.
 */
export const Default: Story = {};

/**
 * Forces the sticky nav to be visible by overriding the inline
 * `transform` via a wrapping div. This lets you inspect the layout,
 * effect selector, and links without needing to scroll.
 */
export const ForceVisible: Story = {
  decorators: [
    (Story) => (
      <div style={{ paddingTop: '56px' }}>
        <style>{`
          header { transform: translateY(0) !important; }
        `}</style>
        <Story />
      </div>
    ),
  ],
};
