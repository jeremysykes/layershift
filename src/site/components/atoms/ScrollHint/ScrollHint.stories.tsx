import type { Meta, StoryObj } from '@storybook/react-vite';

import { ScrollHint } from './ScrollHint';

/**
 * Fixed-position scroll hint with animated chevron. In production this
 * sits at the bottom center of the viewport over the hero section.
 *
 * The component is always visible by default (no scroll gating).
 */
const meta = {
  title: 'Atoms/ScrollHint',
  component: ScrollHint,
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
} satisfies Meta<typeof ScrollHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
