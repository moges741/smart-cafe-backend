import 'dotenv/config';
import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const DEFAULT_BRANCH_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function main() {
  console.log('🌱 Seeding database...');

  // ── Roles ────────────────────────────────────────────
  const roleNames = [
    'admin',
    'manager',
    'cashier',
    'waiter',
    'barista',
    'kitchen',
    'customer',
  ];

  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  ✓ Role "${name}"`);
  }

  // ── Admin user ────────────────────────────────────────
  const adminRole = await prisma.role.findUnique({
    where: { name: 'admin' },
  });

  if (!adminRole) {
    throw new Error('Admin role not found after seeding');
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must be set in the .env file.',
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
    },
  });

  console.log(`  ✓ Admin user → ${adminEmail} / ${adminPassword}`);

  // ── Default branch ────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: DEFAULT_BRANCH_ID },
    update: {},
    create: {
      id: DEFAULT_BRANCH_ID,
      name: 'Main Branch',
      address: 'Bole Road, Addis Ababa',
      timezone: 'Africa/Addis_Ababa',
    },
  });

  console.log(`  ✓ Branch "${branch.name}" — id: ${branch.id}`);

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());