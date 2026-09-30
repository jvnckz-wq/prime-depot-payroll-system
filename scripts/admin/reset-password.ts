import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const [username, newPassword] = process.argv.slice(2);

  if (!username || !newPassword) {
    console.error('Usage: npx tsx scripts/admin/reset-password.ts <username> <new-password>');
    process.exitCode = 1;
    return;
  }
  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    console.error('Password must be at least 8 characters and contain both letters and numbers.');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user) {
    const all = await prisma.user.findMany({ select: { username: true, role: true, isActive: true } });
    console.error(`No account named "${username}".`);
    console.error('Existing accounts:');
    all.forEach((u) => console.error(`  ${u.username}  (${u.role}${u.isActive ? '' : ', disabled'})`));
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
      isActive: true,
    },
  });

  const removed = await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`Password reset for "${user.username}" (${user.role}).`);
  if (removed.count) console.log(`${removed.count} existing session(s) signed out.`);
  console.log('You can sign in now.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
