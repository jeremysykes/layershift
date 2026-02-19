import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { withStore } from '../../../../../.storybook/decorators/withStore';
import { StickyNav } from './StickyNav';

/**
 * Sticky navigation header that slides in after scrolling past the hero section.
 *
 * Contains: wordmark (scroll-to-top link), compact EffectSelector, Docs link,
 * Components link, and GitHub icon.
 *
 * **Visibility behavior:** In production the nav is hidden (`translateY(-100%)`)
 * until `window.scrollY > window.innerHeight`. The Default story simulates
 * a scrolled state so the component's scroll listener triggers visibility
 * naturally.
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
 * Decorator that simulates a scrolled-past-hero state. Temporarily
 * overrides `window.scrollY` to exceed `window.innerHeight`, then
 * fires a scroll event so the component's listener triggers visibility.
 */
function withSimulatedScroll(Story: React.ComponentType) {
  useEffect(() => {
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', {
      value: window.innerHeight + 100,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    return () => {
      if (original) {
        Object.defineProperty(window, 'scrollY', original);
      } else {
        delete (window as Record<string, unknown>).scrollY;
      }
    };
  }, []);

  return (
    <div
      style={{
        paddingTop: '56px',
        // transform creates a new containing block, causing the
        // position: fixed header to be contained within this element
        transform: 'scale(1)',
      }}
    >
      <Story />
    </div>
  );
}

/**
 * Nav visible after simulating a scroll past the hero. The scroll
 * listener sets `visible = true`, which removes `translateY(-100%)`.
 */
export const Default: Story = {
  decorators: [withSimulatedScroll],
};

/**
 * Hidden state — demonstrates the scroll-dependent visibility behavior.
 * The nav is off-screen via `translateY(-100%)` since the scroll
 * threshold is not met in an isolated story.
 */
export const Hidden: Story = {};
