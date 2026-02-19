import { CodeBlock } from './CodeBlock';
import { FrameworkTabs } from './FrameworkTabs';
import { ConfigTable } from './ConfigTable';
import { EventsTable } from './EventsTable';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import type { EffectContent } from '../types';

interface EffectDocsProps {
  content: EffectContent;
}

export function EffectDocs({ content }: EffectDocsProps) {
  return (
    <div>
      {/* Embed code */}
      {content.embedIntro && (
        <p className="mb-4 text-base">{content.embedIntro}</p>
      )}
      <CodeBlock html={content.embedCode} />

      {/* Framework tabs */}
      {content.frameworkExamples.length > 0 && (
        <FrameworkTabs examples={content.frameworkExamples} />
      )}

      {/* Configuration table */}
      {content.configAttributes.length > 0 && (
        <ConfigTable attributes={content.configAttributes} />
      )}

      {/* Events table */}
      {content.events.length > 0 && (
        <EventsTable events={content.events} />
      )}

      {/* Event listener example */}
      {content.eventListenerExample && (
        <CodeBlock html={content.eventListenerExample} />
      )}

      {/* Performance */}
      {(content.performanceTable || content.performanceNotes) && (
        <div className="my-6">
          <h3 className="mb-3 text-[1.1rem] font-semibold" style={{ color: '#fff' }}>
            Performance
          </h3>
          {content.performanceNotes && (
            <p className="mb-4 text-base">{content.performanceNotes}</p>
          )}
          {content.performanceTable && content.performanceTable.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instances</TableHead>
                    <TableHead>Suitability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.performanceTable.map((row) => (
                    <TableRow key={row.instances}>
                      <TableCell>
                        <strong>{row.instances}</strong>
                      </TableCell>
                      <TableCell>{row.suitability}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-base">
                The bottleneck is concurrent video decoders, not GPU or Workers. For scroll-based
                galleries, pause or unmount off-screen instances to stay within browser limits.
              </p>
            </>
          )}
        </div>
      )}

      {/* Prepare your video */}
      {content.prepareVideoCode && (
        <div className="my-6">
          <h3 className="mb-3 text-[1.1rem] font-semibold" style={{ color: '#fff' }}>
            Prepare your video
          </h3>
          {content.prepareVideoIntro && (
            <p className="mb-4 text-base">{content.prepareVideoIntro}</p>
          )}
          <CodeBlock html={content.prepareVideoCode} />
          <p className="mt-4">
            <a
              href="https://github.com/jeremysykes/layershift"
              target="_blank"
              rel="noopener"
              className="hover:text-white transition-colors"
              style={{ color: '#ccc' }}
            >
              View on GitHub &rarr;
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
