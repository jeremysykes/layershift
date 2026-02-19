import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import type { EventEntry } from '../types';

interface EventsTableProps {
  events: EventEntry[];
}

export function EventsTable({ events }: EventsTableProps) {
  return (
    <div className="config-table my-6">
      <h3 className="mb-3 text-[1.1rem] font-semibold" style={{ color: '#fff' }}>
        Events
      </h3>
      <p className="mb-4 text-base">
        Listen for lifecycle and frame-level events. All events bubble through the DOM,
        including Shadow DOM boundaries.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((evt) => (
            <TableRow key={evt.event}>
              <TableCell>
                <code style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", color: '#aaa', fontSize: '0.8rem' }}>
                  {evt.event}
                </code>
              </TableCell>
              <TableCell>{evt.detail}</TableCell>
              <TableCell>{evt.when}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
