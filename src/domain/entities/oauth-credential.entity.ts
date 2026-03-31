// =====================================================
// LinkedBridge — OAuthCredential Entity
// =====================================================
// Represents an encrypted OAuth token set.
// Contains ONLY the encrypted form — plaintext tokens
// never exist at the domain layer.
//
// Business Rule: isExpired() determines if the token
// must be refreshed before calling the LinkedIn API.
// =====================================================

import { z } from 'zod';

// ----- Zod Schemas -----

/** Schema for storing a new OAuth credential (already encrypted) */
export const CreateOAuthCredentialSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  providerName: z.string().min(1).max(50).default('linkedin'),
  encryptedAccessToken: z.string().min(1, 'Encrypted access token is required'),
  iv: z.string().min(1, 'Initialization Vector (IV) is required'),
  authTag: z.string().min(1, 'Authentication Tag is required'),
  linkedInSub: z.string().max(100).nullable().optional(),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

/** Schema for the full persisted entity */
export const OAuthCredentialSchema = CreateOAuthCredentialSchema.extend({
  id: z.string().uuid('Invalid credential ID format'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ----- TypeScript Types -----

export type CreateOAuthCredentialInput = z.infer<typeof CreateOAuthCredentialSchema>;
export type OAuthCredential = z.infer<typeof OAuthCredentialSchema>;

// ----- Domain Logic -----

/**
 * Checks if an OAuth credential's access token has expired.
 *
 * Business Rule:
 * - If `expiresAt` is null/undefined, we assume the token does NOT expire
 *   (some providers issue long-lived tokens).
 * - A 5-minute buffer is applied to proactively refresh tokens before
 *   they actually expire, avoiding race conditions in API calls.
 *
 * @param credential - The OAuth credential to check
 * @param bufferMs - Safety buffer in milliseconds (default: 5 minutes)
 * @returns true if the token is expired or will expire within the buffer window
 */
export function isTokenExpired(
  credential: OAuthCredential,
  bufferMs: number = 5 * 60 * 1000,
): boolean {
  if (credential.expiresAt == null) {
    return false;
  }

  const now = Date.now();
  const expiresAtMs = new Date(credential.expiresAt).getTime();

  return now >= expiresAtMs - bufferMs;
}

/**
 * Checks if a refresh token is available for token renewal.
 *
 * @param credential - The OAuth credential to check
 * @returns true if a refresh token exists
 */
export function hasRefreshToken(credential: OAuthCredential): boolean {
  return credential.refreshToken != null && credential.refreshToken.length > 0;
}
