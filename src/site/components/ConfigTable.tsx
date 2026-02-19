import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import type { ConfigAttribute } from '../types';

interface ConfigTableProps {
  attributes: ConfigAttribute[];
}

export function ConfigTable({ attributes }: ConfigTableProps) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return attributes;
    return attributes.filter(
      (a) =>
        a.attribute.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );
  }, [attributes, filter]);

  return (
    <div className="config-table my-6">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h3 className="text-[1.1rem] font-semibold" style={{ color: '#fff' }}>
          Configuration
        </h3>
        {attributes.length > 6 && (
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#555' }}
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter attributes…"
              aria-label="Filter configuration attributes"
              className="pl-8 pr-3 py-1.5 rounded-md text-[0.8rem] outline-none transition-colors"
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                color: '#ccc',
                width: '180px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#555';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#333';
              }}
            />
          </div>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Attribute</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((attr) => (
            <TableRow key={attr.attribute}>
              <TableCell>
                <code style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", color: '#aaa', fontSize: '0.8rem' }}>
                  {attr.attribute}
                </code>
              </TableCell>
              <TableCell>{attr.type}</TableCell>
              <TableCell>{attr.default}</TableCell>
              <TableCell>{attr.description}</TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <span style={{ color: '#555' }}>No attributes match "{filter}"</span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
