'use client';

import React, { useState } from 'react';
import { Fingerprint, Lock } from 'lucide-react';
import { Eyebrow, Panel } from '../components/ui.jsx';
import { F_BODY, F_HEAD, T } from '../theme';

export const LoginView = ({ onLogin }) => {
  const [u, setU] = useState(''); const [p, setP] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.sidebar }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ backgroundColor: '#fff' }}>
            <Fingerprint size={24} color={T.brand} />
          </div>
          <div className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.1em' }}>Prime Depot Hardware & Construction Supply</div>
          <div className="text-2xl font-bold text-white mt-1" style={{ fontFamily: F_HEAD }}>Payroll System</div>
        </div>
        <Panel className="p-6" style={{ backgroundColor: T.surface, borderColor: T.line }}>
          <Eyebrow>Employee ID</Eyebrow>
          <input value={u} onChange={e => setU(e.target.value)} placeholder="e.g. EMP-001"
            className="w-full mb-4 px-3 py-2 rounded text-sm outline-none border" style={{ fontFamily: F_BODY, backgroundColor: T.surface, borderColor: T.line, color: T.ink }} />
          <Eyebrow>Password</Eyebrow>
          <div className="relative mb-6">
            <input value={p} onChange={e => setP(e.target.value)} type="password" placeholder="••••••••"
              className="w-full px-3 py-2 rounded text-sm outline-none border" style={{ fontFamily: F_BODY, backgroundColor: T.surface, borderColor: T.line, color: T.ink }} />
            <Lock size={14} className="absolute right-3 top-3" color={T.soft} />
          </div>
          <p className="text-xs mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
            No public sign-up. Accounts are created only by the Operations Head, from Settings → Account Access.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => onLogin('admin')} className="w-full py-2.5 rounded text-sm font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff' }}>
              Continue as Operations Head
            </button>
            <button onClick={() => onLogin('checker')} className="w-full py-2.5 rounded text-sm font-semibold border" style={{ fontFamily: F_HEAD, borderColor: T.line, color: T.ink }}>
              Continue as Checker
            </button>
          </div>
        </Panel>
        <p className="text-center text-xs mt-4" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>Frontend prototype — role buttons stand in for real authentication.</p>
      </div>
    </div>
  );
};

/* ============================= DASHBOARD ============================= */
