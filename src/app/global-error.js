'use client';
// Shown when the root layout itself crashes: it replaces the layout, so it brings its own html, body, styles and font.

import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import ErrorPage from './error';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export default function GlobalError({ error, retry }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <title>Something went wrong | Prime Depot</title>
        <ErrorPage error={error} retry={retry} />
      </body>
    </html>
  );
}
