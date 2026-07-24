'use client';

import React from 'react';
import { LogOut } from 'lucide-react';
import { Badge } from './ui.jsx';
import { ADMIN_NAV } from '../data/seed';
import { F_BODY, F_HEAD, T } from '../theme';

export const Sidebar = ({ tab, setTab, onLogout, user, onOpenAccount }) => (
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
    {/* The account lives behind your own name at the bottom of the nav, the
        way most apps do it — one less top-level item, and it is where people
        already look for it. */}
    <div className="px-3 py-3" style={{ borderTop: `1px solid ${T.sidebarLine}` }}>
      {user && (
        <button onClick={onOpenAccount}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded mb-1 text-left"
          style={{ backgroundColor: tab === 'account' ? 'rgba(0,0,0,0.22)' : 'transparent' }}>
          {user.avatar ? (
            <img src={user.avatar} alt="" className="rounded-full object-cover shrink-0"
              style={{ width: 30, height: 30, border: '1px solid rgba(255,255,255,0.25)' }} />
          ) : (
            <span className="rounded-full flex items-center justify-center shrink-0"
              style={{ width: 30, height: 30, backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: F_HEAD, fontWeight: 700, fontSize: 11 }}>
              {(user.displayName || user.username).split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white truncate" style={{ fontFamily: F_BODY }}>{user.displayName}</span>
            <span className="block text-xs truncate" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
              {user.role === 'ADMIN' ? 'Operations Head' : 'Checker'}
            </span>
          </span>
        </button>
      )}
      <button onClick={onLogout} className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
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
