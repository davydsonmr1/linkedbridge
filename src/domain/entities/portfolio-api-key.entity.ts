// =====================================================
// LinkedBridge — PortfolioApiKey Entity
// =====================================================
// Security Invariant: This entity NEVER holds or accepts
// the plaintext API key. It operates exclusively on the
// SHA-256 hash of the key.
//
// The raw key is shown to the user ONCE at creation time,
// then discarded. Only the hash is persisted.
// =====================================================

import { z } from 'zod';

// ----- Zod Schemas -----

/**
 * Schema for creating a new API key record.
 *
 * SECURITY: `hashedKey` is the SHA-256 hash of the raw key.
 *           `keyHint` is the first 8 chars of the displayed key (e.g., "lnkb_a3f...")
 *           so the user can identify which key is which, without revealing it.
 *
 * There is intentionally NO field for the plaintext key.
 */
export const CreatePortfolioApiKeySchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  hashedKey: z
    .string()
    .min(64, 'Hashed key must be a valid SHA-256 hash (64+ hex chars)'),
  keyHint: z
    .string()
    .min(4, 'Key hint must be at least 4 characters')
    .max(12, 'Key hint must not exceed 12 characters'),
});

/** Schema for the full persisted entity */
export const PortfolioApiKeySchema = CreatePortfolioApiKeySchema.extend({
  id: z.string().uuid('Invalid API key ID format'),
  revokedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});

// ----- TypeScript Types -----

export type CreatePortfolioApiKeyInput = z.infer<typeof CreatePortfolioApiKeySchema>;
export type PortfolioApiKey = z.infer<typeof PortfolioApiKeySchema>;

// ----- Domain Logic -----

/**
 * Checks if an API key has been revoked.
 *
 * A revoked key must never be accepted for authentication,
 * even if the hash matches.
 *
 * @param apiKey - The API key entity to check
 * @returns true if the key has been revoked
 */
export function isKeyRevoked(apiKey: PortfolioApiKey): boolean {
  return apiKey.revokedAt != null;
}

/**
 * Checks if an API key is currently active (not revoked).
 *
 * @param apiKey - The API key entity to check
 * @returns true if the key is active and can be used for authentication
 */
export function isKeyActive(apiKey: PortfolioApiKey): boolean {
  return !isKeyRevoked(apiKey);
}
