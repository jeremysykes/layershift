import type { Meta, StoryObj } from '@storybook/react-vite';

import { Wordmark } from './Wordmark';

/**
 * Fixed-position "layershift.io" wordmark. Fades in after a 300ms delay
 * with a 1s ease transition. In production it sits in the top-left corner
 * over the hero section.
 *
 * The story renders inside a contained box so the wordmark is visible
 * (the fade-in transition still plays).
 */
const meta = {
  title: 'Atoms/Wordmark',
  component: Wordmark,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ position: 'relative', height: '200px', background: '#0a0a0a' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Wordmark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
