// ───────────────────────────────────────────────────────────────────────────
//  HOARD — demo seed
//
//  Creates a single `demo` user (password `demo1234`) so you can log in without
//  registering. Idempotent: re-running it is a no-op for the existing user, so
//  it's safe to run on every fresh database. Runs under `tsx` via the prisma
//  seed hook (`npx prisma db seed`).
// ───────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo1234';

async function main() {
  // upsert keeps this side-effect-safe: if `demo` already exists we leave it
  // untouched (empty `update`), otherwise we create it with a hashed password.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.user.upsert({
    where: { username: DEMO_USERNAME },
    update: {},
    create: {
      username: DEMO_USERNAME,
      passwordHash,
    },
  });

  console.log('[seed] Demo user ready.');
  console.log(`[seed]   username: ${DEMO_USERNAME}`);
  console.log(`[seed]   password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
