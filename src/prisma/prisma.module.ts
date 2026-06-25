import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() means: any module that imports PrismaModule can use PrismaService
// without having to import PrismaModule again in every single module
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}