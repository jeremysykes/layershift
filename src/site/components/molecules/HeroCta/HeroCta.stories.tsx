import type { Meta, StoryObj } from '@storybook/react-vite';

import { HeroCta } from './HeroCta';

/**
 * Fixed-position "Get Started" CTA with down-arrow. Fades in after a
 * 300ms delay with a 1s ease transition (same timing as the Wordmark).
 *
 * In production this is overlaid on the hero at `top: 62%`. The story
 * renders inside a contained dark box so the CTA is visible.
 */
const meta = {
  title: 'Molecules/HeroCta',
  component: HeroCta,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ position: 'relative', height: '300px', background: '#0a0a0a' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
