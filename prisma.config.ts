// Prisma configuration.
//
// Three things worth knowing:
//
//  1. Newer Prisma does NOT load .env files automatically for CLI commands —
//     they must be loaded explicitly, hence the dotenv call below.
//
//  2. Our connection string lives in .env.local (that's the file `vercel env
//     pull` writes), not the default .env — so we point dotenv at it directly.
//     Vercel stays the single source of truth for the credential; the password
//     is never copied into a second file.
//
//  3. Neon gives two connection strings, for two different jobs:
//       DATABASE_URL           → pooled. Used by the app at runtime.
//       DATABASE_URL_UNPOOLED  → direct. Required here, because schema
//                                changes (migrations) cannot run through a
//                                connection pooler.
//     The URL below is the one the Prisma CLI uses for migrate / db pull /
//     studio, so it must be the UNPOOLED one.
import { config } from 'dotenv';
config({ path: '.env.local' });

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL_UNPOOLED'),
  },
});
