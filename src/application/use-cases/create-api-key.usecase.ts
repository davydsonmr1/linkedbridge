// =====================================================
// LinkedBridge — CreateApiKey Use Case
// =====================================================
// Generates a new portfolio API key for the user.
//
// SECURITY — ONE-TIME REVEAL:
// The plaintext API key is returned ONLY in the response
// to this exact request. After that, it is impossible to
// recover. The database stores only the SHA-256 hash.
//
// If the user loses the key, they must revoke it and
// create a new one.
// =====================================================

import type { IApiKeyRepository } from '../../domain/repositories/i-api-key.repository.js';
import type { ApiKeyService } from '../../infra/crypto/api-key.service.js';

/**
 * Output returned ONCE to the user at key creation.
 * The `plainKey` is NEVER stored or returned again.
 */
export interface CreateApiKeyOutput {
  /** The raw API key — shown ONCE, then gone forever */
  plainKey: string;
  /** First 12 chars of the key for identification */
  keyHint: string;
  /** Database ID of the key record */
  id: string;
}

export class CreateApiKeyUseCase {
  constructor(
    private readonly apiKeyRepository: IApiKeyRepository,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * Generates a new API key, persists the hash, and returns
   * the plaintext key for one-time display.
   *
   * @param userId - The authenticated user's ID
   * @returns The plaintext key (one-time), hint, and record ID
   */
  async execute(userId: string): Promise<CreateApiKeyOutput> {
    // 1. Generate cryptographically secure key + SHA-256 hash
    const { plainKey, hashedKey, keyHint } = this.apiKeyService.generateKey();

    // 2. Persist ONLY the hash (never the plaintext)
    const record = await this.apiKeyRepository.createKey({
      userId,
      hashedKey,
      keyHint,
    });

    // 3. Return the plaintext key for ONE-TIME display
    return {
      plainKey,
      keyHint: record.keyHint,
      id: record.id,
    };
  }
}
