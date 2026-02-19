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
  return (
    <div className="config-table my-6">
      <h3 className="mb-3 text-[1.1rem] font-semibold" style={{ color: '#fff' }}>
        Configuration
      </h3>
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
          {attributes.map((attr) => (
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
        </TableBody>
      </Table>
    </div>
  );
}
