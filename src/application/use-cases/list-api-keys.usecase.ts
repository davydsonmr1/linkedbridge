// =====================================================
// LinkedBridge — ListApiKeys Use Case
// =====================================================
// Returns all API keys for a user (active + revoked).
//
// DATA MINIMIZATION:
// The output deliberately omits `hashedKey` — there is
// zero reason for the frontend to see it. We expose only:
// id, keyHint, createdAt, revokedAt.
// =====================================================

import type { IApiKeyRepository } from '../../domain/repositories/i-api-key.repository.js';

/**
 * A single API key formatted for the dashboard UI.
 * Contains NO hashed key — only identification and status.
 */
export interface ApiKeySummary {
  id: string;
  keyHint: string;
  createdAt: Date;
  revokedAt: Date | null | undefined;
}

export interface ListApiKeysOutput {
  keys: ApiKeySummary[];
  total: number;
}

export class ListApiKeysUseCase {
  constructor(
    private readonly apiKeyRepository: IApiKeyRepository,
  ) {}

  /**
   * Retrieves all API keys for a user.
   * Returns both active and revoked keys for the management UI.
   *
   * DATA MINIMIZATION: The hashed key is stripped from the output.
   * The frontend only needs hint + status information.
   *
   * @param userId - The authenticated user's ID
   * @returns Array of key summaries with total count
   */
  async execute(userId: string): Promise<ListApiKeysOutput> {
    const keys = await this.apiKeyRepository.findAllByUserId(userId);

    // Strip sensitive fields — never expose hashedKey to the client
    const summaries: ApiKeySummary[] = keys.map((key) => ({
      id: key.id,
      keyHint: key.keyHint,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt ?? null,
    }));

    return {
      keys: summaries,
      total: summaries.length,
    };
  }
}
