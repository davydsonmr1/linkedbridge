// =====================================================
// LinkedBridge — IApiKeyRepository Interface
// =====================================================
// Domain contract for portfolio API key persistence.
//
// SECURITY: The repository only deals with HASHED keys.
// The plaintext key is NEVER passed to or returned from
// any repository method.
// =====================================================

import type {
  CreatePortfolioApiKeyInput,
  PortfolioApiKey,
} from '../entities/portfolio-api-key.entity.js';

export interface IApiKeyRepository {
  /**
   * Persist a new API key (hashed).
   *
   * @param data - Contains the hashed key and key hint
   * @returns The persisted API key entity
   */
  createKey(data: CreatePortfolioApiKeyInput): Promise<PortfolioApiKey>;

  /**
   * Look up an API key by its SHA-256 hash.
   * Used during request authentication (hash-then-compare flow).
   *
   * @param hashedKey - The SHA-256 hash of the raw API key
   * @returns The API key entity or null if not found
   */
  findByHash(hashedKey: string): Promise<PortfolioApiKey | null>;

  /**
   * List all API keys for a given user.
   * Returns both active and revoked keys for management UI.
   *
   * @param userId - The user's ID
   * @returns Array of API key entities
   */
  findAllByUserId(userId: string): Promise<PortfolioApiKey[]>;

  /**
   * Revoke an API key by setting its `revokedAt` timestamp.
   * The key record is NOT deleted (audit trail preservation).
   *
   * @param id - The API key's ID
   * @returns The updated (revoked) API key entity
   */
  revokeKey(id: string): Promise<PortfolioApiKey>;
}
