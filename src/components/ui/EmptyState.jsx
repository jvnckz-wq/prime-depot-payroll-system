'use client';

import { Package } from 'lucide-react';
import { F_BODY, T } from '@/styles/theme';

export const EmptyState = ({ icon: Icon = Package, title, desc, action, compact = false }) => (
  <div role="status" className={`text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'}`}>
    <div className={`${compact ? 'w-10 h-10 mb-2.5' : 'w-12 h-12 mb-3'} rounded-lg flex items-center justify-center mx-auto`} style={{ backgroundColor: T.lineSoft }}>
      <Icon size={compact ? 18 : 22} color={T.soft} aria-hidden="true" />
    </div>
    <div className={`${compact ? 'text-sm' : 'text-[15px]'} font-semibold mb-1`} style={{ fontFamily: F_BODY, color: T.ink }}>{title}</div>
    {desc && <div className={`${compact ? 'text-xs' : 'text-sm'} max-w-sm mx-auto`} style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{desc}</div>}
    {action && <div className="mt-4 flex justify-center gap-2 flex-wrap">{action}</div>}
  </div>
);
