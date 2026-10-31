// Shown for any address that does not exist; the link is styled like a dark Btn, because Btn renders a <button>.
import Link from 'next/link';
import { House, SearchX } from 'lucide-react';
import { StatusScreen } from '@/components/layout/StatusScreen.jsx';
import { F_HEAD, T } from '@/styles/theme';

export const metadata = {
  title: 'Page not found | Prime Depot',
};

export default function NotFound() {
  return (
    <StatusScreen
      icon={SearchX}
      title={<>This page doesn&apos;t exist.</>}
      actions={
        <Link href="/" data-variant="dark"
          className="pd-btn inline-flex items-center gap-1.5 rounded font-semibold px-3 py-2 text-sm min-h-11 sm:min-h-0 w-full justify-center"
          style={{ fontFamily: F_HEAD, backgroundColor: T.ink, color: '#fff' }}>
          <House size={14} />
          Go to Prime Depot
        </Link>
      }
    >
      The link may be mistyped or out of date. Everything in Prime Depot is opened from the sidebar.
    </StatusScreen>
  );
}
