import type { Meta, StoryObj } from '@storybook/react-vite';

import { EventsTable } from './EventsTable';
import type { EventEntry } from '../../../types';

const sampleEvents: EventEntry[] = [
  {
    event: 'layershift:ready',
    detail: '{ width, height }',
    when: 'Effect is initialized and first frame rendered',
  },
  {
    event: 'layershift:frame',
    detail: '{ fps, time }',
    when: 'Each animation frame is rendered',
  },
  {
    event: 'layershift:error',
    detail: '{ message, code }',
    when: 'An unrecoverable error occurs during rendering',
  },
  {
    event: 'layershift:videochange',
    detail: '{ src }',
    when: 'The video source attribute changes',
  },
];

const meta = {
  title: 'Molecules/EventsTable',
  component: EventsTable,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EventsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    events: sampleEvents,
  },
};
