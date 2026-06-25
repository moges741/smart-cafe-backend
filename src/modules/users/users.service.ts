import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Hash the password — never store plain text
    // bcrypt's second argument (10) is the "salt rounds" — higher = more secure but slower
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        roleId: dto.roleId,
      },
      select: {
        // select: true/false controls what gets returned
        // We NEVER return passwordHash to the caller
        id: true,
        email: true,
        isActive: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
      },
    });
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