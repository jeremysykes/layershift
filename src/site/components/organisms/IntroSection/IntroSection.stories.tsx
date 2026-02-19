import type { Meta, StoryObj } from '@storybook/react-vite';
import { withStore } from '../../../../../.storybook/decorators/withStore';
import { IntroSection } from './IntroSection';

/**
 * Introductory section with tagline text, the EffectSelector switcher,
 * and EffectDots indicator. Wrapped in a RevealSection for scroll-triggered
 * animation.
 *
 * **Store dependencies:** The EffectSelector and EffectDots read and write
 * `activeEffect` and `effects` from the Zustand store.
 *
 * **Swipe:** Uses `useSwipeEffectSwitcher` to allow horizontal swipe
 * gestures for switching effects on touch devices.
 */
const meta = {
  title: 'Organisms/IntroSection',
  component: IntroSection,
  tags: ['autodocs'],
  decorators: [withStore],
  parameters: {
    layout: 'padded',
    store: {
      activeEffect: 'parallax',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
      ],
    },
  },
} satisfies Meta<typeof IntroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default intro with parallax active. */
export const Default: Story = {};

/** Portal effect active. */
export const PortalActive: Story = {
  parameters: {
    store: {
      activeEffect: 'portal',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
      ],
    },
  },
};

/** Single effect — dots and selector reflect only one option. */
export const SingleEffect: Story = {
  parameters: {
    store: {
      activeEffect: 'parallax',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
      ],
    },
  },
};
