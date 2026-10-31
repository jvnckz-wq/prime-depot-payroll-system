// Full-screen card for the crash and not-found pages; no 'use client', so the server-rendered not-found page can use it.

import { Panel } from '@/components/ui';
import { F_BODY, F_HEAD, T } from '@/styles/theme';

export const StatusScreen = ({ icon: Icon, title, children, actions, footer, role }) => (
  <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.sidebar }}>
    <Panel className="w-full max-w-sm p-6 text-center" role={role}>
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: T.brandBg }}>
        <Icon size={20} color={T.brand} aria-hidden="true" />
      </div>
      <h1 className="text-base font-bold mb-1" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</h1>
      <div className="text-sm mb-5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{children}</div>
      {actions && <div className="flex flex-col gap-2">{actions}</div>}
      {footer && <div className="text-xs mt-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{footer}</div>}
    </Panel>
  </div>
);
