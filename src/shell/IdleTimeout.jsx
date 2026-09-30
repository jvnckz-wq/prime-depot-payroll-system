'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Btn, Modal } from '@/components/ui.jsx';
import { F_BODY, T } from '@/components/theme';

const IDLE_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

export function IdleTimeout({ enabled, onExit }) {
  const [expired, setExpired] = useState(false);
  const timer = useRef(null);
  const lastArm = useRef(0);
  const expiredRef = useRef(false);
  useEffect(() => { expiredRef.current = expired; }, [expired]);
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onIdle = async () => {
      setExpired(true);
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* sign out locally regardless */ }
    };

    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(onIdle, IDLE_MS);
    };

    const onActivity = () => {
      if (expiredRef.current) return;
      const now = Date.now();
      if (now - lastArm.current < 1000) return;
      lastArm.current = now;
      arm();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimeout(timer.current);
    };
  }, [enabled]);

  const backToSignIn = () => {
    setExpired(false);
    if (onExitRef.current) onExitRef.current();
  };

  if (!enabled || !expired) return null;
  return (
    <Modal open onClose={backToSignIn} title="Signed out for security" width={400}>
      <div className="text-sm" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
        You were inactive for a while, so you have been signed out automatically to keep
        this account and its payroll data secure. Please sign in again to continue.
      </div>
      <div className="mt-4">
        <Btn full onClick={backToSignIn}>Back to sign in</Btn>
      </div>
    </Modal>
  );
}
