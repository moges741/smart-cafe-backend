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

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          roleId: role.id,
          isEmailVerified: true, // Admin-created staff accounts are verified by default
        },
      });

      if (dto.branchId) {
        await tx.employee.create({
          data: {
            userId: user.id,
            branchId: dto.branchId,
            role: dto.role,
          }
        });
      }

      return tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
          employee: { select: { branchId: true } }
        },
      });
    });
  }

  async updateStaff(id: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== user.email) {
      await this.checkEmailUnique(dto.email);
    }

    let roleId = user.roleId;
    if (dto.role) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new NotFoundException(`Role "${dto.role}" not found`);
      roleId = role.id;
    }

    const data: any = {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleId,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // Clean undefined fields
    Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data,
      });

      if (dto.branchId || dto.role) {
        const emp = await tx.employee.findUnique({ where: { userId: id } });
        if (emp) {
          await tx.employee.update({
            where: { id: emp.id },
            data: {
              branchId: dto.branchId !== undefined ? dto.branchId : emp.branchId,
              role: dto.role !== undefined ? dto.role : emp.role,
            }
          });
        } else if (dto.branchId) {
           await tx.employee.create({
              data: {
                userId: id,
                branchId: dto.branchId,
                role: dto.role || 'staff',
              }
           });
        }
      }

      return tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
          employee: { select: { branchId: true } }
        },
      });
    });
  }

  async toggleStaffStatus(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
        employee: { select: { branchId: true } }
      },
    });
  }

  async deleteStaff(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    return { success: true };
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
        employee: { select: { branchId: true, branch: { select: { name: true } } } }
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getCashiersByBranch(branchId: string) {
    // 1. Query active cashiers or managers assigned to this branch
    let users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { name: { in: ['cashier', 'manager'] } },
        employee: { branchId },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    // 2. Fallback: If no cashier/manager is specifically assigned to this branch, get all active admin & manager users
    if (!users || users.length === 0) {
      users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { name: { in: ['admin', 'manager'] } },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
    }

    return users;
  }
}