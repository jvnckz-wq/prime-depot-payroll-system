import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const [username] = process.argv.slice(2);

  if (!username) {
    console.error('Usage: npx tsx scripts/admin/disable-2fa.ts <username>');
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
