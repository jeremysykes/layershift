import type { Meta, StoryObj } from '@storybook/react-vite';

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './Table';

const meta = {
  title: 'Molecules/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Default</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>
            <code style={{ fontFamily: "'SF Mono', monospace", color: '#aaa', fontSize: '0.8rem' }}>src</code>
          </TableCell>
          <TableCell>string</TableCell>
          <TableCell>--</TableCell>
          <TableCell>URL of the video source</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code style={{ fontFamily: "'SF Mono', monospace", color: '#aaa', fontSize: '0.8rem' }}>depth-src</code>
          </TableCell>
          <TableCell>string</TableCell>
          <TableCell>--</TableCell>
          <TableCell>URL of the precomputed depth map</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code style={{ fontFamily: "'SF Mono', monospace", color: '#aaa', fontSize: '0.8rem' }}>intensity</code>
          </TableCell>
          <TableCell>number</TableCell>
          <TableCell>0.5</TableCell>
          <TableCell>Parallax displacement intensity</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
