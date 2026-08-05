// Shared database client.
//
// Two things this file exists to get right:
//
//  1. ONE client per process. Next.js reloads modules on every edit in dev; a
//     plain `new PrismaClient()` here would leak a new connection pool on each
//     reload until the database refuses more connections. Caching it on
//     globalThis survives hot reloads.
//
//  2. The POOLED connection. Migrations need the direct URL (see
//     prisma.config.ts), but the running app should go through Neon's pooler —
//     serverless functions open and close constantly, and the pooler is what
//     keeps that from exhausting the database's connection limit.
//
// This module is server-only. Importing it from a 'use client' component would
// ship the connection string to the browser, so it must only ever be imported
// by API routes and server components.
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { wrapWithRetry } from './db-retry';

const globalForPrisma = globalThis;

function createClients() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  // One underlying client. `prisma` wraps it to retry transient Neon cold-start
  // connection drops (see db-retry.js); the adapter and connection string are
  // unchanged — this only re-attempts a query when the connection drops.
  const base = new PrismaClient({ adapter });
  return { base, prisma: wrapWithRetry(base) };
}

const clients = globalForPrisma.__primeDepotClients ?? createClients();

// Retry-wrapped client — use for normal, single queries. Auto-retries Neon
// cold-start connection drops.
export const prisma = clients.prisma;

// Raw, UN-wrapped client. REQUIRED for the array form prisma.$transaction([...]).
// The wrapped client's model methods return plain Promises, but the array form
// needs genuine PrismaPromises. So build transaction ops from prismaBase, and
// wrap the $transaction call itself in withRetry() for connection-retry.
export const prismaBase = clients.base;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__primeDepotClients = clients;
}
