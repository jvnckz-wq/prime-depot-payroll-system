import 'server-only';
import { PrismaClient } from '../../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { wrapWithRetry } from './db-retry';

const globalForPrisma = globalThis;

function createClients() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const base = new PrismaClient({ adapter });
  return { base, prisma: wrapWithRetry(base) };
}

const clients = globalForPrisma.__primeDepotClients ?? createClients();

export const prisma = clients.prisma;

export const prismaBase = clients.base;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__primeDepotClients = clients;
}
