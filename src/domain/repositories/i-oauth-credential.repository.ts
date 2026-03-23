// =====================================================
// LinkedBridge — IOAuthCredentialRepository Interface
// =====================================================
// Domain contract for encrypted OAuth credential persistence.
// Implementations belong in the infra layer.
//
// IMPORTANT: All token data passed to these methods is
// already encrypted. The repository does NOT perform
// any encryption/decryption — that is the crypto service's job.
// =====================================================

import type {
  CreateOAuthCredentialInput,
  OAuthCredential,
} from '../entities/oauth-credential.entity.js';

export interface IOAuthCredentialRepository {
  /**
   * Save a new OAuth credential for a user.
   * If a credential already exists for this user+provider, it should be replaced.
   *
   * @param data - Encrypted credential data
   * @returns The persisted credential
   */
  saveCredential(data: CreateOAuthCredentialInput): Promise<OAuthCredential>;

  /**
   * Find the OAuth credential for a specific user.
   *
   * @param userId - The user's ID
   * @returns The credential or null if the user hasn't connected LinkedIn
   */
  findByUserId(userId: string): Promise<OAuthCredential | null>;

  /**
   * Update the encrypted access token and related fields.
   * Used after a token refresh flow.
   *
   * @param userId - The user's ID
   * @param data - The updated encrypted fields
   * @returns The updated credential
   */
  updateToken(
    userId: string,
    data: Pick<
      CreateOAuthCredentialInput,
      'encryptedAccessToken' | 'iv' | 'authTag' | 'expiresAt'
    > & { refreshToken?: string | null },
  ): Promise<OAuthCredential>;

  /**
   * Find all active (non-expired) OAuth credentials.
   * Used by the mass sync worker to process all linked users.
   *
   * @returns Array of active credentials
   */
  findAllActive(): Promise<OAuthCredential[]>;
}
