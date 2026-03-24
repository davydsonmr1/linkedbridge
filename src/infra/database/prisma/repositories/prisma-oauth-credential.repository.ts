// =====================================================
// LinkedBridge — Prisma OAuth Credential Repository
// =====================================================
// Concrete implementation of IOAuthCredentialRepository.
//
// SECURITY NOTES:
// - This repository deals ONLY with already-encrypted data.
//   It does NOT perform any encryption/decryption.
// - `saveCredential` uses `upsert` so re-linking LinkedIn
//   replaces the old credential atomically.
// - `findAllActive` filters out expired tokens so the
//   mass sync worker only processes valid credentials.
// =====================================================

import type { PrismaClient, OAuthCredential as PrismaOAuthCredential } from '@prisma/client';
import type { IOAuthCredentialRepository } from '../../../../domain/repositories/i-oauth-credential.repository.js';
import type {
  CreateOAuthCredentialInput,
  OAuthCredential,
} from '../../../../domain/entities/oauth-credential.entity.js';

// ─── Data Mapper ───

/**
 * Maps a Prisma OAuthCredential record to the Domain entity.
 * Handles nullable fields (refreshToken, expiresAt) explicitly.
 */
function toDomainEntity(record: PrismaOAuthCredential): OAuthCredential {
  return {
    id: record.id,
    userId: record.userId,
    providerName: record.providerName,
    encryptedAccessToken: record.encryptedAccessToken,
    iv: record.iv,
    authTag: record.authTag,
    refreshToken: record.refreshToken ?? null,
    expiresAt: record.expiresAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// ─── Repository Implementation ───

export class PrismaOAuthCredentialRepository implements IOAuthCredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveCredential(data: CreateOAuthCredentialInput): Promise<OAuthCredential> {
    const record = await this.prisma.oAuthCredential.upsert({
      where: { userId: data.userId },
      create: {
        userId: data.userId,
        providerName: data.providerName ?? 'linkedin',
        encryptedAccessToken: data.encryptedAccessToken,
        iv: data.iv,
        authTag: data.authTag,
        refreshToken: data.refreshToken ?? null,
        expiresAt: data.expiresAt ?? null,
      },
      update: {
        providerName: data.providerName ?? 'linkedin',
        encryptedAccessToken: data.encryptedAccessToken,
        iv: data.iv,
        authTag: data.authTag,
        refreshToken: data.refreshToken ?? null,
        expiresAt: data.expiresAt ?? null,
      },
    });

    return toDomainEntity(record);
  }

  async findByUserId(userId: string): Promise<OAuthCredential | null> {
    const record = await this.prisma.oAuthCredential.findUnique({
      where: { userId },
    });

    return record ? toDomainEntity(record) : null;
  }

  async updateToken(
    userId: string,
    data: Pick<
      CreateOAuthCredentialInput,
      'encryptedAccessToken' | 'iv' | 'authTag' | 'expiresAt'
    > & { refreshToken?: string | null },
  ): Promise<OAuthCredential> {
    const record = await this.prisma.oAuthCredential.update({
      where: { userId },
      data: {
        encryptedAccessToken: data.encryptedAccessToken,
        iv: data.iv,
        authTag: data.authTag,
        expiresAt: data.expiresAt ?? null,
        ...(data.refreshToken !== undefined ? { refreshToken: data.refreshToken } : {}),
      },
    });

    return toDomainEntity(record);
  }

  async findAllActive(): Promise<OAuthCredential[]> {
    const now = new Date();

    const records = await this.prisma.oAuthCredential.findMany({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    return records.map(toDomainEntity);
  }
}
