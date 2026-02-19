import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './Skeleton';

const meta = {
  title: 'Atoms/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    style: { width: 200, height: 20 },
  },
};

export const Circle: Story = {
  args: {
    className: 'rounded-full',
    style: { width: 48, height: 48 },
  },
};

export const Card: Story = {
  render: () => (
    <div className="flex flex-col gap-3" style={{ width: 300 }}>
      <Skeleton style={{ width: '100%', height: 160 }} />
      <Skeleton style={{ width: '80%', height: 16 }} />
      <Skeleton style={{ width: '60%', height: 16 }} />
    </div>
  ),
};
