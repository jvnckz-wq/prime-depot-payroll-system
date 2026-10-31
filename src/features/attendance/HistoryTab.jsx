'use client';
// The Import History tab: every device pull and file import, each with a View button.

import React from 'react';
import { ClipboardList } from 'lucide-react';
import { Badge, Btn, EmptyState, Panel, SkeletonBlock, Td, Th } from '@/components/ui';
import { T } from '@/styles/theme';

export const HistoryTab = ({ loading, data, openBatch }) => (
  <Panel className="overflow-hidden">
    {loading ? <SkeletonBlock avatar={false} />
      : data.batches.length === 0 ? <EmptyState icon={ClipboardList} title="No pulls or imports yet" desc="Each device pull, and any file import, is listed here so you can review its records later." /> : (
      <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
        <thead><tr><Th>Imported</Th><Th>Filename</Th><Th>Period</Th><Th center>Mapped</Th><Th center>Unmapped</Th><Th>Status</Th><Th></Th></tr></thead>
        <tbody>{data.batches.map((b) => (
          <tr key={b.id}>
            <Td mono>{new Date(b.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Td>
            <Td mono>{/^Device pull/i.test(b.filename || '') ? 'Device pull' : b.filename}</Td>
            <Td mono>{b.periodStart ? `${b.periodStart} → ${b.periodEnd}` : '--'}</Td>
            <Td center mono>{b.mappedRows}</Td>
            <Td center mono><span style={{ color: b.unmappedRows > 0 ? T.amber : T.soft }}>{b.unmappedRows}</span></Td>
            <Td><Badge tone={b.status === 'COMPLETED' ? 'green' : b.status === 'FAILED' ? 'red' : 'amber'}>{b.status}</Badge></Td>
            <Td>{b.periodStart ? <Btn size="sm" variant="outline" onClick={() => openBatch(b)}>View</Btn> : null}</Td>
          </tr>
        ))}</tbody>
      </table></div>
    )}
  </Panel>
);
