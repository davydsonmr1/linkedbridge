// =====================================================
// LinkedBridge — Prisma User Repository
// =====================================================
// Concrete implementation of IUserRepository using Prisma.
//
// DATA MAPPER PATTERN:
// Prisma model types never leak into the Domain layer.
// The `toDomainEntity` function maps Prisma's generated
// type to our pure TypeScript `User` entity.
// =====================================================

import type { PrismaClient, User as PrismaUser } from '@prisma/client';
import type { IUserRepository } from '../../../../domain/repositories/i-user.repository.js';
import type { CreateUserInput, User } from '../../../../domain/entities/user.entity.js';

// ─── Data Mapper ───

/**
 * Maps a Prisma User record to the Domain User entity.
 * Ensures Prisma-generated types do NOT leak into the domain.
 */
function toDomainEntity(prismaUser: PrismaUser): User {
  return {
    id: prismaUser.id,
    email: prismaUser.email,
    name: prismaUser.name,
    createdAt: prismaUser.createdAt,
    updatedAt: prismaUser.updatedAt,
  };
}

// ─── Repository Implementation ───

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
    });

    return record ? toDomainEntity(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { email },
    });

    return record ? toDomainEntity(record) : null;
  }

  async create(data: CreateUserInput): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
      },
    });

    return toDomainEntity(record);
  }
}
