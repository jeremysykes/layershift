import type { Meta, StoryObj } from '@storybook/react-vite';

import { Wordmark } from './Wordmark';

const meta = {
  title: 'Atoms/Wordmark',
  component: Wordmark,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Wordmark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
