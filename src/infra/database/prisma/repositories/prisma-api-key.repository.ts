// =====================================================
// LinkedBridge — Prisma API Key Repository
// =====================================================
// Concrete implementation of IApiKeyRepository.
//
// SECURITY:
// - Only hashed keys are stored — never plaintext.
// - `revokeKey` sets `revokedAt` instead of deleting,
//   preserving the audit trail.
// - `findByHash` is the core authentication lookup path
//   used by the API key middleware.
// =====================================================

import type { PrismaClient, PortfolioApiKey as PrismaPortfolioApiKey } from '@prisma/client';
import type { IApiKeyRepository } from '../../../../domain/repositories/i-api-key.repository.js';
import type {
  CreatePortfolioApiKeyInput,
  PortfolioApiKey,
} from '../../../../domain/entities/portfolio-api-key.entity.js';

// ─── Data Mapper ───

/**
 * Maps a Prisma PortfolioApiKey record to the Domain entity.
 * `revokedAt` is nullable — null means the key is active.
 */
function toDomainEntity(record: PrismaPortfolioApiKey): PortfolioApiKey {
  return {
    id: record.id,
    userId: record.userId,
    hashedKey: record.hashedKey,
    keyHint: record.keyHint,
    revokedAt: record.revokedAt ?? null,
    createdAt: record.createdAt,
  };
}

// ─── Repository Implementation ───

export class PrismaApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createKey(data: CreatePortfolioApiKeyInput): Promise<PortfolioApiKey> {
    const record = await this.prisma.portfolioApiKey.create({
      data: {
        userId: data.userId,
        hashedKey: data.hashedKey,
        keyHint: data.keyHint,
      },
    });

    return toDomainEntity(record);
  }

  async findByHash(hashedKey: string): Promise<PortfolioApiKey | null> {
    const record = await this.prisma.portfolioApiKey.findUnique({
      where: { hashedKey },
    });

    return record ? toDomainEntity(record) : null;
  }

  async findAllByUserId(userId: string): Promise<PortfolioApiKey[]> {
    const records = await this.prisma.portfolioApiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(toDomainEntity);
  }

  async revokeKey(id: string): Promise<PortfolioApiKey> {
    const record = await this.prisma.portfolioApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return toDomainEntity(record);
  }
}
