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

const globalForPrisma = globalThis;

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__primeDepotPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__primeDepotPrisma = prisma;
}
