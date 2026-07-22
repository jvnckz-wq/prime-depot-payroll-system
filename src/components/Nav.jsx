'use client';

import React from 'react';
import { LogOut } from 'lucide-react';
import { Badge } from './ui.jsx';
import { ADMIN_NAV } from '../data/seed';
import { F_BODY, F_HEAD, T } from '../theme';

export const Sidebar = ({ tab, setTab, onLogout }) => (
  <div className="hidden md:flex flex-col w-56 shrink-0 h-full" style={{ backgroundColor: T.sidebar }}>
    <div className="px-5 py-5" style={{ borderBottom: `1px solid ${T.sidebarLine}` }}>
      <div className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.08em' }}>Prime Depot</div>
      <div className="text-lg font-bold text-white" style={{ fontFamily: F_HEAD }}>Payroll System</div>
    </div>
    <div className="flex-1 py-3 overflow-y-auto">
      {ADMIN_NAV.map(item => {
        const active = tab === item.key;
        const Icon = item.icon;
        return (
          <button key={item.key} onClick={() => setTab(item.key)}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
            style={{
              fontFamily: F_BODY, fontWeight: active ? 600 : 400,
              color: active ? '#FFFFFF' : T.sidebarSoft,
              backgroundColor: active ? 'rgba(0,0,0,0.22)' : 'transparent',
              borderLeft: active ? '3px solid #FFFFFF' : '3px solid transparent',
            }}>
            <Icon size={16} />
            {item.label}
          </button>
        );
      })}
    </div>
    <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.sidebarLine}` }}>
      <button onClick={onLogout} className="w-full flex items-center gap-2 text-sm" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
        <LogOut size={15} /> Log out
      </button>
    </div>
  </div>
);

export const TopBar = ({ title, role, cutoff }) => (
  <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface }}>
    <div className="text-base font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</div>
    <div className="flex items-center gap-3">
      <Badge tone="blue">Cutoff {cutoff}</Badge>
      <Badge tone={role === 'admin' ? 'green' : 'amber'}>{role === 'admin' ? 'Operations Head' : 'Checker'}</Badge>
    </div>
  </div>
);

/* ============================= LOGIN ============================= */
