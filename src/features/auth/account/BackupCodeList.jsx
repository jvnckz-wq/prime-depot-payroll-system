'use client';
// The list of new two-factor backup codes, with Copy and Download.

import React from 'react';
import { AlertTriangle, Copy, Download } from 'lucide-react';
import { Btn } from '@/components/ui';
import { F_BODY, F_MONO, T } from '@/styles/theme';

export const BackupCodeList = ({ codes, toast }) => {
  const copyAll = () => {
    if (navigator?.clipboard) navigator.clipboard.writeText(codes.join('\n')).then(() => toast('Codes copied.'), () => {});
  };
  const download = () => {
    const blob = new Blob([`Prime Depot backup codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'prime-depot-backup-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 p-3 rounded" style={{ backgroundColor: T.bg }}>
        {codes.map((c, i) => (
          <div key={i} className="text-sm text-center py-1" style={{ fontFamily: F_MONO, color: T.ink }}>{c}</div>
        ))}
      </div>
      <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
        style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
        <AlertTriangle size={13} color={T.warn} className="mt-0.5 shrink-0" />
        <span>Save these somewhere safe. They are shown only once and replace any earlier codes.</span>
      </div>
      <div className="flex gap-2 mt-3">
        <Btn size="sm" variant="outline" icon={Copy} onClick={copyAll}>Copy</Btn>
        <Btn size="sm" variant="outline" icon={Download} onClick={download}>Download</Btn>
      </div>
    </div>
  );
};
