// =====================================================
// LinkedBridge — RevokeApiKey Use Case
// =====================================================
// Revokes a portfolio API key (soft-delete).
//
// OWNERSHIP CHECK:
// Before revoking, we verify the key belongs to the
// requesting user. This prevents a user from revoking
// keys belonging to other users (IDOR prevention).
//
// IDEMPOTENCY:
// Revoking an already-revoked key is a no-op that
// returns the existing revoked key without error.
// =====================================================

import type { IApiKeyRepository } from '../../domain/repositories/i-api-key.repository.js';
import { ForbiddenError } from '../../domain/errors/forbidden.error.js';
import { ResourceNotFoundError } from '../../domain/errors/resource-not-found.error.js';

export interface RevokeApiKeyOutput {
  id: string;
  keyHint: string;
  revokedAt: Date | null | undefined;
}

export class RevokeApiKeyUseCase {
  constructor(
    private readonly apiKeyRepository: IApiKeyRepository,
  ) {}

  /**
   * Revokes an API key by setting its `revokedAt` timestamp.
   *
   * SECURITY CHECKS:
   * 1. Key must exist (ResourceNotFoundError if not)
   * 2. Key must belong to the requesting user (ForbiddenError if not — IDOR prevention)
   * 3. If already revoked, returns the key without re-revoking (idempotent)
   *
   * @param userId - The authenticated user's ID
   * @param keyId - The API key's database ID
   * @returns The revoked key summary
   */
  async execute(userId: string, keyId: string): Promise<RevokeApiKeyOutput> {
    // 1. Fetch all keys for the user to perform ownership check
    const userKeys = await this.apiKeyRepository.findAllByUserId(userId);
    const targetKey = userKeys.find((key) => key.id === keyId);

    // 2. If the key doesn't exist in the user's keys, check if it exists at all
    if (!targetKey) {
      // We intentionally check ownership FIRST. If the key belongs to
      // another user, we throw ResourceNotFoundError (not Forbidden)
      // to prevent the attacker from learning that the key exists (IDOR).
      throw new ResourceNotFoundError('API key');
    }

    // 3. Ownership confirmed — check if already revoked (idempotent)
    if (targetKey.revokedAt != null) {
      return {
        id: targetKey.id,
        keyHint: targetKey.keyHint,
        revokedAt: targetKey.revokedAt,
      };
    }

    // 4. Revoke the key (soft-delete: sets revokedAt = now())
    const revokedKey = await this.apiKeyRepository.revokeKey(keyId);

    return {
      id: revokedKey.id,
      keyHint: revokedKey.keyHint,
      revokedAt: revokedKey.revokedAt,
    };
  }
}
