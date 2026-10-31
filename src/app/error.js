'use client';
// Shown when a screen crashes: a calm message, Try again, and Reload. Never shows technical details.

import { useEffect, useRef } from 'react';
import { RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { Btn } from '@/components/ui';
import { StatusScreen } from '@/components/layout/StatusScreen.jsx';

export default function ErrorPage({ error, retry }) {
  const retryRef = useRef(null);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    retryRef.current?.querySelector('button')?.focus();
  }, []);

  return (
    <StatusScreen
      role="alert"
      icon={TriangleAlert}
      title="Something went wrong on this screen."
      actions={<>
        <span ref={retryRef} className="contents">
          <Btn variant="dark" icon={RefreshCw} full onClick={() => retry()}>Try again</Btn>
        </span>
        <Btn variant="outline" icon={RotateCcw} full onClick={() => window.location.reload()}>Reload the page</Btn>
      </>}
      footer={<>
        <div>If this keeps happening, tell the system administrator.</div>
        {error?.digest && <div>Reference: {error.digest}</div>}
      </>}
    >
      Your saved records are safe. Anything you had not saved yet may need to be entered again.
    </StatusScreen>
  );
}
