// ============================================================================
// Emergency: turn OFF two-factor authentication for an account.
//
//   npx tsx scripts/disable-2fa.ts <username>
//   npx tsx scripts/disable-2fa.ts admin
//
// This is the break-glass path for "the only administrator lost their phone AND
// their backup codes and cannot get past the two-factor prompt." It clears the
// secret, the enabled flag, and any backup codes, so the next sign-in needs
// only the password — and the app will then walk them through fresh 2FA setup.
//
// Like reset-password.ts, this is deliberately NOT in the web app: running it
// requires the project files and the database credentials, which is the right
// level of difficulty. Every existing session is destroyed as well, so a stale
// login cannot linger with 2FA removed.
// ============================================================================

import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const [username] = process.argv.slice(2);

  if (!username) {
    console.error('Usage: npx tsx scripts/disable-2fa.ts <username>');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user) {
    console.error(`No account found for username "${username}".`);
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, backupCodes: [], totpLastStep: null },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });

  // Leave a trace in the app's own audit trail: an emergency 2FA removal is
  // exactly the kind of event someone will later need to account for.
  await prisma.auditLog.create({
    data: {
      action: 'TWO_FACTOR_DISABLED',
      actorLabel: 'disable-2fa script',
      targetType: 'user',
      targetId: user.id,
      detail: `Two-factor turned off for "${user.username}" from the command line; all sessions signed out.`,
    },
  });

  console.log(`Two-factor disabled for "${user.username}". All sessions signed out.`);
  console.log('On next sign-in the account will be prompted to set up two-factor again.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
