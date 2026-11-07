'use client';
// Warning bar shown when scans come from biometric IDs that no employee is registered to.
// It names them (ID and the name saved on the device) so the Operations Head knows who to register.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { F_BODY, F_HEAD, T } from '@/styles/theme';

// "ID 72 · Rodel, ID 14" for the first three, then "+ 2 more".
export const unregisteredNames = (people = [], count = people.length, shown = 3) => {
  const names = people.slice(0, shown).map((p) => (p.name ? `ID ${p.id} \u00b7 ${p.name}` : `ID ${p.id}`)).join(', ');
  const more = count - Math.min(people.length, shown);
  return more > 0 ? `${names} + ${more} more` : names;
};

export const UnregisteredBanner = ({ count, people = [], onOpen }) => (count > 0 ? (
  <button type="button" onClick={onOpen} className="pd-clickable w-full text-left mb-3 flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: T.warnBg, border: `1px solid ${T.line}` }}>
    <AlertTriangle size={16} color={T.warn} className="shrink-0" aria-hidden="true" />
    <span className="flex-1 min-w-0 text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
      <span className="font-semibold">{count} {count === 1 ? 'employee is' : 'employees are'} not registered{people.length ? ':' : ''}</span>
      {people.length > 0 && <> {unregisteredNames(people, count)}</>}
    </span>
    <span className="text-xs font-semibold shrink-0" style={{ fontFamily: F_HEAD, color: T.brand }}>View Unmapped IDs →</span>
  </button>
) : null);
