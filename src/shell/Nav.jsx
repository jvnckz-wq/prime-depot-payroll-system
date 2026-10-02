'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, User, X } from 'lucide-react';
import { ADMIN_NAV, ADMIN_NAV_GROUPS } from '@/shell/nav-items';
import { F_BODY, F_HEAD, T } from '@/components/theme';
/* eslint-disable @next/next/no-img-element -- user avatars are base64 data URIs; next/image adds no value and cannot optimize data URIs */

const SIDEBAR_W = 236;

const NavRow = ({ item, tab, subs, onSelect }) => {
  const Icon = item.icon;
  const kids = item.children || null;
  const active = tab === item.key;
  const isOpen = !!kids && active;
  const activeChild = kids ? (subs[item.key] || kids[0].key) : null;
  return (
    <div>
      <button
        onClick={() => (kids ? onSelect(item.key, subs[item.key] || kids[0].key) : onSelect(item.key))}
        aria-current={active && !kids ? 'page' : undefined}
        aria-expanded={kids ? isOpen : undefined}
        className="pd-nav-item relative w-full flex items-center gap-3 pl-5 pr-3 py-3 text-sm text-left"
        style={{
          fontFamily: F_BODY,
          fontWeight: active ? 600 : 400,
          color: active ? '#FFFFFF' : T.sidebarSoft,
          backgroundColor: active && !kids ? T.sidebarActiveBg : undefined,
        }}
      >
        {active && !kids && (
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: '0 3px 3px 0', backgroundColor: T.sidebarAccent }} />
        )}
        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} color={active ? T.sidebarAccent : 'currentColor'} />
        <span className="truncate flex-1">{item.label}</span>
        {kids && <ChevronDown size={14} style={{ transition: 'transform .18s ease', transform: isOpen ? 'rotate(180deg)' : 'none', opacity: 0.8 }} />}
      </button>
      {kids && isOpen && kids.map((c) => {
        const cActive = activeChild === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onSelect(item.key, c.key)}
            aria-current={cActive ? 'page' : undefined}
            className="pd-nav-item relative w-full flex items-center py-2 text-left"
            style={{
              paddingLeft: 46, paddingRight: 12, fontFamily: F_BODY, fontSize: 13.5,
              fontWeight: cActive ? 600 : 400,
              color: cActive ? '#FFFFFF' : T.sidebarSoft,
              backgroundColor: cActive ? T.sidebarActiveBg : undefined,
            }}
          >
            {cActive && (
              <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: '0 3px 3px 0', backgroundColor: T.sidebarAccent }} />
            )}
            <span className="truncate">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const NavList = ({ tab, subs, onSelect }) => (
  <nav aria-label="Main" className="pd-no-scrollbar flex-1 py-3 overflow-y-auto">
    {ADMIN_NAV_GROUPS.map(({ group, items }) => (
      <div key={group || 'root'} className={group ? 'mt-5' : ''}>
        {group && (
          <div
            className="px-5 pb-1.5 text-[11px] font-semibold uppercase"
            style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.09em' }}
          >
            {group}
          </div>
        )}
        {items.map(item => (
          <NavRow key={item.key} item={item} tab={tab} subs={subs} onSelect={onSelect} />
        ))}
      </div>
    ))}
  </nav>
);

export const Sidebar = ({ tab, subs = {}, onSelect, open = false, onClose }) => {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = () => Array.from(
      panel?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
    ).filter(el => !el.hasAttribute('disabled'));

    focusables()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;

      if (restoreRef.current?.isConnected) restoreRef.current.focus();
    };
  }, [open, onClose]);

  const header = (withClose) => (
    <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: `1px solid ${T.sidebarLine}` }}>
      <img src="/logo.png" alt="Prime Depot" className="shrink-0 rounded-md bg-white p-1" style={{ width: 34, height: 34 }} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-bold text-white truncate" style={{ fontFamily: F_HEAD }}>Prime Depot</span>
        <span className="block text-xs truncate" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>Payroll System</span>
      </span>
      {withClose && (
        <button onClick={onClose} aria-label="Close navigation menu"
          className="pd-nav-item rounded flex items-center justify-center shrink-0"
          style={{ width: 44, height: 44, color: T.sidebarSoft }}>
          <X size={18} />
        </button>
      )}
    </div>
  );

  const select = (key, child) => { onSelect(key, child); onClose?.(); };

  return (
    <>

      <aside className="hidden lg:flex flex-col shrink-0 h-full"
        style={{ width: SIDEBAR_W, backgroundColor: T.sidebar, borderRight: `1px solid ${T.sidebarLine}` }}>
        <NavList tab={tab} subs={subs} onSelect={onSelect} />
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="pd-overlay absolute inset-0" style={{ backgroundColor: 'rgba(10,14,19,0.6)' }} onClick={onClose} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="pd-drawer absolute inset-y-0 left-0 flex flex-col"
            style={{ width: SIDEBAR_W, backgroundColor: T.sidebar, borderRight: `1px solid ${T.sidebarLine}` }}
          >
            {header(true)}
            <NavList tab={tab} subs={subs} onSelect={select} />
          </div>
        </div>
      )}
    </>
  );
};

export const TopBar = ({ user, onOpenAccount, onLogout, onOpenNav }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const initials = (user?.displayName || user?.username || '?')
    .split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const roleLabel = user?.role === 'ADMIN' ? 'Operations Head' : 'Checker';

  return (
    <header className="flex items-center gap-3 px-4 md:px-6 shrink-0" style={{ height: 56, borderBottom: `1px solid ${T.sidebarLine}`, backgroundColor: T.sidebar }}>
      <button onClick={onOpenNav} aria-label="Open navigation menu"
        className="pd-btn lg:hidden -ml-2 rounded flex items-center justify-center shrink-0"
        style={{ width: 44, height: 44, color: T.sidebarAccent, background: 'transparent', border: 'none' }}>
        <Menu size={20} />
      </button>

      <span className="flex items-center gap-2.5 min-w-0">
        <img src="/logo.png" alt="" className="shrink-0 rounded-md bg-white p-1" style={{ width: 32, height: 32 }} />
        <span className="leading-tight min-w-0">
          <span className="block text-sm font-bold text-white truncate" style={{ fontFamily: F_HEAD }}>Prime Depot</span>
          <span className="block text-xs truncate" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>Payroll System</span>
        </span>
      </span>

      <div className="relative ml-auto" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
          className="rounded-full flex items-center justify-center"
          style={{ width: 36, height: 36, background: '#FFFFFF', color: T.brand, fontFamily: F_HEAD, fontWeight: 700, fontSize: 13, border: '2px solid #FFFFFF', cursor: 'pointer' }}
        >
          {user?.avatar
            ? <img src={user.avatar} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36 }} />
            : initials}
        </button>
        {open && (
          <div role="menu" className="absolute right-0 z-30"
            style={{ top: 'calc(100% + 8px)', width: 236, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: '0 14px 34px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '13px 14px', borderBottom: `1px solid ${T.lineSoft}` }}>
              <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: 34, height: 34, background: T.brand, color: '#fff', fontFamily: F_HEAD, fontWeight: 700, fontSize: 12 }}>{initials}</span>
              <span className="min-w-0">
                <span className="block truncate" style={{ fontFamily: F_HEAD, fontWeight: 600, fontSize: 13.5, color: T.ink }}>{user?.displayName || user?.username}</span>
                <span className="block truncate" style={{ fontFamily: F_BODY, fontSize: 11.5, color: T.soft }}>{roleLabel}</span>
              </span>
            </div>
            <button role="menuitem" onClick={() => { setOpen(false); onOpenAccount(); }}
              className="pd-menu-item w-full flex items-center gap-2.5 text-left" style={{ padding: '11px 14px', fontFamily: F_BODY, fontSize: 13.5, color: T.ink }}>
              <User size={16} color={T.soft} /> Account
            </button>
            <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }}
              className="pd-menu-item w-full flex items-center gap-2.5 text-left" style={{ padding: '11px 14px', fontFamily: F_BODY, fontSize: 13.5, color: T.brand, borderTop: `1px solid ${T.lineSoft}` }}>
              <LogOut size={16} color={T.brand} /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

