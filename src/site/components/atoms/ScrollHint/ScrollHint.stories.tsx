import type { Meta, StoryObj } from '@storybook/react-vite';

import { ScrollHint } from './ScrollHint';

const meta = {
  title: 'Atoms/ScrollHint',
  component: ScrollHint,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ScrollHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
