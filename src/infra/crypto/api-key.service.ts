// =====================================================
// LinkedBridge — API Key Service
// =====================================================
// Handles generation and hashing of portfolio API keys.
//
// INFOSEC: API keys are treated like passwords.
// We NEVER store the plaintext key — only the SHA-256 hash.
// The raw key is shown to the user ONCE at creation,
// then discarded forever.
//
// Key format: lb_live_<32 bytes hex> = 72 chars total
// This prefix makes keys easily identifiable in logs
// and secret scanners (like GitHub's secret scanning).
// =====================================================

import { createHash, randomBytes } from 'node:crypto';

/**
 * Prefix for LinkedBridge API keys.
 * Makes keys identifiable by secret scanners.
 */
const KEY_PREFIX = 'lb_live_';

/**
 * Number of random bytes for key generation.
 * 32 bytes = 256 bits of entropy.
 */
const KEY_BYTES = 32;

export class ApiKeyService {
  /**
   * Generates a new API key with a recognizable prefix.
   *
   * Returns BOTH the plaintext key (to show the user once)
   * and the SHA-256 hash (to persist in the database).
   *
   * @returns { plainKey, hashedKey, keyHint }
   */
  generateKey(): { plainKey: string; hashedKey: string; keyHint: string } {
    const randomPart = randomBytes(KEY_BYTES).toString('hex');
    const plainKey = `${KEY_PREFIX}${randomPart}`;
    const hashedKey = this.hashKey(plainKey);

    // Key hint: first 8 chars of the key for identification
    // e.g., "lb_live_" — enough to identify, not enough to use
    const keyHint = plainKey.slice(0, 12);

    return { plainKey, hashedKey, keyHint };
  }

  /**
   * Computes the SHA-256 hash of a plaintext API key.
   *
   * Used for:
   * 1. Hashing before storage (at key creation)
   * 2. Hashing before lookup (at request authentication)
   *
   * SHA-256 is appropriate here because:
   * - API keys have high entropy (256 bits) — no rainbow tables
   * - We need fast lookups (bcrypt/argon2 would add latency per request)
   * - There's no need for salting high-entropy strings
   *
   * @param plainKey - The raw API key string
   * @returns SHA-256 hex digest (64 chars)
   */
  hashKey(plainKey: string): string {
    return createHash('sha256').update(plainKey).digest('hex');
  }
}
