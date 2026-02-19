import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

const meta = {
  title: 'Molecules/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" style={{ width: 480 }}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="usage">Usage</TabsTrigger>
        <TabsTrigger value="api">API</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div style={{ padding: '1rem', color: '#888' }}>
          Overview content goes here. This tab is selected by default.
        </div>
      </TabsContent>
      <TabsContent value="usage">
        <div style={{ padding: '1rem', color: '#888' }}>
          Usage instructions and code examples.
        </div>
      </TabsContent>
      <TabsContent value="api">
        <div style={{ padding: '1rem', color: '#888' }}>
          Full API reference documentation.
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const TwoTabs: Story = {
  render: () => (
    <Tabs defaultValue="html" style={{ width: 400 }}>
      <TabsList>
        <TabsTrigger value="html">HTML</TabsTrigger>
        <TabsTrigger value="react">React</TabsTrigger>
      </TabsList>
      <TabsContent value="html">
        <div style={{ padding: '1rem', color: '#888' }}>HTML embed code</div>
      </TabsContent>
      <TabsContent value="react">
        <div style={{ padding: '1rem', color: '#888' }}>React component usage</div>
      </TabsContent>
    </Tabs>
  ),
};
