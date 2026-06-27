import 'dotenv/config';
import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const roleNames = ['admin', 'manager', 'cashier', 'waiter', 'barista', 'kitchen', 'customer'];

  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  ✓ Role "${name}"`);
  }

  // Get admin role id
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (!adminRole) throw new Error('Admin role not found after seeding');

  // Create default admin user
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
  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());