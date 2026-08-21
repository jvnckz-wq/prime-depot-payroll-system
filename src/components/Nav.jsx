'use client';

import React, { useEffect, useRef } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { ADMIN_NAV, ADMIN_NAV_GROUPS } from '../data/nav';
import { F_BODY, F_HEAD, T } from '../theme';
/* eslint-disable @next/next/no-img-element -- user avatars are base64 data URIs; next/image adds no value and cannot optimize data URIs */

const SIDEBAR_W = 236;

/* ============================= NAV LIST ============================= */
// py-3 against a 20px line box lands each row at exactly the 44px minimum
// touch target, which the old py-2.5 rows missed.
const NavItem = ({ item, active, onSelect }) => {
  const Icon = item.icon;
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className="pd-nav-item relative w-full flex items-center gap-3 pl-5 pr-3 py-3 text-sm text-left"
      style={{
        fontFamily: F_BODY,
        fontWeight: active ? 600 : 400,
        color: active ? '#FFFFFF' : T.sidebarSoft,
        backgroundColor: active ? T.sidebarActiveBg : 'transparent',
      }}
    >
      {/* The active marker is its own element rather than a border-left, so
          inactive items need no transparent placeholder to stay aligned. */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, top: 7, bottom: 7, width: 3,
            borderRadius: '0 3px 3px 0', backgroundColor: T.sidebarAccent,
          }}
        />
      )}
      <Icon size={17} strokeWidth={active ? 2.2 : 1.9} color={active ? T.sidebarAccent : 'currentColor'} />
      <span className="truncate">{item.label}</span>
    </button>
  );
};

// Shared by the desktop rail and the mobile drawer so the two can never drift.
const NavList = ({ tab, onSelect }) => (
  <nav aria-label="Main" className="pd-no-scrollbar flex-1 py-3 overflow-y-auto">
    {ADMIN_NAV_GROUPS.map(({ group, items }) => (
      <div key={group || 'root'} className={group ? 'mt-5' : ''}>
        {/* Same colour as the nav labels, deliberately: #EBB9BB is only 4.88:1 on
            the crimson sidebar, so anything dimmer would fail AA. The hierarchy
            comes from type instead — 11px uppercase with wide tracking against
            14px regular rows. */}
        {group && (
          <div
            className="px-5 pb-1.5 text-[11px] font-semibold uppercase"
            style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.09em' }}
          >
            {group}
          </div>
        )}
        {items.map(item => (
          <NavItem key={item.key} item={item} active={tab === item.key} onSelect={() => onSelect(item.key)} />
        ))}
      </div>
    ))}
  </nav>
);

const NavFooter = ({ user, tab, onOpenAccount, onLogout }) => (
  <div className="px-3 py-3" style={{ borderTop: `1px solid ${T.sidebarLine}` }}>
    {user && (
      <button
        onClick={onOpenAccount}
        aria-current={tab === 'account' ? 'page' : undefined}
        className="pd-nav-item w-full flex items-center gap-2.5 px-2 py-2 rounded mb-1 text-left"
        style={tab === 'account' ? { backgroundColor: T.sidebarActiveBg } : undefined}
      >
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
    <button onClick={onLogout} className="pd-nav-item w-full flex items-center gap-2 px-2 py-2 text-sm rounded"
      style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
      <LogOut size={15} /> Log out
    </button>
  </div>
);

/* ============================= SIDEBAR ============================= */
// One component, two presentations: a static rail from `md` up, and an
// off-canvas drawer below it. The drawer replaces the old bottom bar, which
// rendered only the first five of eight destinations — Loans, Reports and
// Settings had no route at all on a phone.
export const Sidebar = ({ tab, setTab, onLogout, user, onOpenAccount, open = false, onClose }) => {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  // While the drawer is open it owns the keyboard: Escape closes, Tab cycles
  // inside it, and focus returns to whatever opened it on the way out.
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
      // The trigger can unmount with the drawer; only restore if it is still there.
      if (restoreRef.current?.isConnected) restoreRef.current.focus();
    };
  }, [open, onClose]);

  const header = (withClose) => (
    <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: `1px solid ${T.sidebarLine}` }}>
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

  // Selecting a destination on mobile should also dismiss the drawer.
  const select = (key) => { setTab(key); onClose?.(); };
  const openAccount = () => { onOpenAccount(); onClose?.(); };

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:flex flex-col shrink-0 h-full"
        style={{ width: SIDEBAR_W, backgroundColor: T.sidebar, borderRight: `1px solid ${T.sidebarLine}` }}>
        {header(false)}
        <NavList tab={tab} onSelect={setTab} />
        <NavFooter user={user} tab={tab} onOpenAccount={onOpenAccount} onLogout={onLogout} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
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
            <NavList tab={tab} onSelect={select} />
            <NavFooter user={user} tab={tab} onOpenAccount={openAccount} onLogout={onLogout} />
          </div>
        </div>
      )}
    </>
  );
};

/* ============================= TOP BAR ============================= */
// Previously this repeated the page title that every view already prints as an
// <H1> right below it, plus the role badge the sidebar already shows — so all
// of its content was a duplicate of something else on screen. It now carries
// only what is not stated anywhere else: where you are in the nav hierarchy,
// and which pay period every figure on the page belongs to.
export const TopBar = ({ tab, title, cutoff, onOpenNav }) => {
  const section = ADMIN_NAV.find(i => i.key === tab)?.group;
  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-3"
      style={{ borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface }}>
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onOpenNav} aria-label="Open navigation menu"
          className="pd-btn md:hidden -ml-2 rounded flex items-center justify-center shrink-0"
          data-variant="ghost" style={{ width: 44, height: 44, color: T.ink }}>
          <Menu size={20} />
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 min-w-0">
            {section && (
              <>
                <li className="text-sm hidden sm:block" style={{ fontFamily: F_BODY, color: T.soft }}>{section}</li>
                <li aria-hidden="true" className="text-sm hidden sm:block" style={{ color: T.line }}>/</li>
              </>
            )}
            <li aria-current="page" className="text-sm font-semibold truncate" style={{ fontFamily: F_HEAD, color: T.ink }}>
              {title}
            </li>
          </ol>
        </nav>
      </div>

      <div className="text-right shrink-0">
        <div className="text-[10px] font-semibold uppercase leading-none mb-1"
          style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.09em' }}>
          Pay Period
        </div>
        <div className="text-sm font-semibold leading-none pd-num" style={{ fontFamily: F_HEAD, color: T.ink }}>
          {cutoff}
        </div>
      </div>
    </header>
  );
};

/* ============================= LOGIN ============================= */
