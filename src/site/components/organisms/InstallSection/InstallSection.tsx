import { useCallback, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../molecules/Tabs';
import { RevealSection } from '../../templates/RevealSection';

const METHODS = [
  {
    id: 'npm',
    label: 'npm',
    code: 'npm install layershift',
    html: `<span class="keyword">npm</span> install layershift`,
  },
  {
    id: 'yarn',
    label: 'yarn',
    code: 'yarn add layershift',
    html: `<span class="keyword">yarn</span> add layershift`,
  },
  {
    id: 'pnpm',
    label: 'pnpm',
    code: 'pnpm add layershift',
    html: `<span class="keyword">pnpm</span> add layershift`,
  },
  {
    id: 'cdn',
    label: 'CDN',
    code: '<script src="https://cdn.layershift.io/layershift.js"></script>',
    html: `<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>`,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy'}
      className="copy-btn shrink-0 p-2.5 rounded-md transition-all duration-150"
      style={{
        color: copied ? '#98c379' : '#5c6370',
        background: copied ? 'rgba(152,195,121,0.1)' : 'transparent',
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

export function InstallSection() {
  const codeRefs = useRef<Record<string, HTMLElement | null>>({});

  return (
    <RevealSection id="install" padding="py-10">
      <div className="max-w-[720px] mx-auto">
        <h2 className="text-primary text-[1.75rem] font-semibold mb-2">
          Get started
        </h2>
        <p className="text-base mb-6">
          Install via your package manager or drop in a CDN script tag.
        </p>

        <Tabs defaultValue="npm">
          <TabsList>
            {METHODS.map((m) => (
              <TabsTrigger key={m.id} value={m.id} className="tab-btn text-[0.85rem]">
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {METHODS.map((m) => (
            <TabsContent key={m.id} value={m.id}>
              <div
                className="flex items-center gap-3 rounded-lg rounded-t-none border-t-0 overflow-x-auto text-[0.85rem] leading-[1.7]"
                style={{
                  background: '#282c34',
                  border: '1px solid #3e4451',
                  borderTop: 'none',
                  padding: '0.75rem 1rem',
                }}
              >
                <code
                  ref={(el) => { codeRefs.current[m.id] = el; }}
                  className="code-highlight whitespace-pre flex-1"
                  style={{
                    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                    color: '#abb2bf',
                  }}
                  dangerouslySetInnerHTML={{ __html: m.html }}
                />
                <CopyButton text={m.code} />
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <p className="mt-4 text-[0.85rem]" style={{ color: '#666' }}>
          Then use the Web Component in your markup — see the examples below.
        </p>
      </div>
    </RevealSection>
  );
}
