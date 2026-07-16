import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStaffDto } from '../auth/dto/create-staff.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Public registration — role is always "customer"
  async createCustomer(firstName: string, lastName: string, email: string, password: string) {
    await this.checkEmailUnique(email);

    const customerRole = await this.prisma.role.findUnique({
      where: { name: 'customer' },
    });
    if (!customerRole) throw new Error('Customer role not found. Did you run the seed?');

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: { firstName, lastName, email, passwordHash, roleId: customerRole.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
    });
  }

  // Admin creates staff — role looked up by name
  async createStaff(dto: CreateStaffDto) {
    await this.checkEmailUnique(dto.email);

    const role = await this.prisma.role.findUnique({
      where: { name: dto.role },
    });
    if (!role) throw new NotFoundException(`Role "${dto.role}" not found`);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: { email: dto.email, passwordHash, roleId: role.id },
      select: {
        id: true,
        email: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
    });
  }

  private async checkEmailUnique(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        isActive: true,
        role: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}