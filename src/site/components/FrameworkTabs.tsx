import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { CodeBlock } from './CodeBlock';
import type { FrameworkExample } from '../types';

interface FrameworkTabsProps {
  examples: FrameworkExample[];
}

export function FrameworkTabs({ examples }: FrameworkTabsProps) {
  if (!examples.length) return null;

  return (
    <div className="framework-tabs my-6">
      <Tabs defaultValue={examples[0].framework}>
        <TabsList>
          {examples.map((ex) => (
            <TabsTrigger key={ex.framework} value={ex.framework} className="tab-btn text-[0.85rem]">
              {ex.framework}
            </TabsTrigger>
          ))}
        </TabsList>
        {examples.map((ex) => (
          <TabsContent key={ex.framework} value={ex.framework}>
            <CodeBlock html={ex.code} className="mt-0 border-t-0 rounded-t-none" />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
