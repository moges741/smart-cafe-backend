import 'dotenv/config';
import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  const roles = ['admin', 'manager', 'cashier', 'waiter', 'barista', 'kitchen'];

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`Role "${name}" ready`);
  }

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  const passwordHash = await bcrypt.hash('Admin@123456', 10);

  await prisma.user.upsert({
    where: { email: 'admin@smartcafe.com' },
    update: {},
    create: {
      email: 'admin@smartcafe.com',
      passwordHash,
      roleId: adminRole!.id,
    },
  });

  console.log('Default admin — admin@smartcafe.com / Admin@123456');
  console.log('Seeding complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());