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
  const roleNames = ['admin', 'manager', 'cashier', 'waiter', 'barista', 'kitchen', 'customer'];

  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  ✓ Role "${name}"`);
  }

  // ── Admin user ────────────────────────────────────────
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (!adminRole) throw new Error('Admin role not found after seeding');

  const passwordHash = await bcrypt.hash('Admin@123456', 10);

  await prisma.user.upsert({
    where: { email: 'admin@smartcafe.com' },
    update: {},
    create: {
      email: 'admin@smartcafe.com',
      passwordHash,
      roleId: adminRole.id,
    },
  });
  console.log('  ✓ Admin user → admin@smartcafe.com / Admin@123456');

  // ── Default branch ────────────────────────────────────
  // where.id and create.id MUST be the same value
  const branch = await prisma.branch.upsert({
    where: { id: DEFAULT_BRANCH_ID },   // ← look up by this
    update: {},                          // ← if found, do nothing
    create: {
      id: DEFAULT_BRANCH_ID,            // ← if not found, create with this same id
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