// =====================================================
// LinkedBridge — Cron Authentication Middleware
// =====================================================
// Protects internal cron webhook endpoints with a
// shared secret (CRON_SECRET_KEY).
//
// INFOSEC: Uses crypto.timingSafeEqual() to compare
// the provided key with the expected key, preventing
// timing-based side-channel attacks that could allow
// an attacker to brute-force the key character by
// character.
// =====================================================

import { timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Fastify preHandler hook that validates cron webhook authentication.
 *
 * Expected header: `Authorization: Bearer <CRON_SECRET_KEY>`
 *
 * Security properties:
 * - Constant-time comparison (prevents timing attacks)
 * - SHA-256 hash comparison (prevents length-based leaks)
 * - Early rejection with generic 401 (no key detail leak)
 */
export function cronAuthMiddleware(cronSecretKey: string) {
  // Pre-compute the SHA-256 hash of the expected key at startup
  // so we don't re-hash on every request.
  const expectedHash = createHash('sha256')
    .update(cronSecretKey)
    .digest();

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.log.warn('[CronAuth] Missing or malformed Authorization header');
      void reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authentication.',
        },
      });
      return;
    }

    const providedKey = authHeader.slice(7); // Remove "Bearer "

    // Hash the provided key before comparison.
    // This ensures both buffers have the same length (32 bytes)
    // regardless of input length, which is required by timingSafeEqual.
    const providedHash = createHash('sha256')
      .update(providedKey)
      .digest();

    // TIMING ATTACK MITIGATION:
    // timingSafeEqual always takes the same amount of time to
    // compare, regardless of whether the first byte or the last
    // byte differs. A naive `===` comparison would return faster
    // for wrong first characters, leaking information.
    const isValid = timingSafeEqual(expectedHash, providedHash);

    if (!isValid) {
      request.log.warn('[CronAuth] Invalid cron secret key');
      void reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authentication.',
        },
      });
      return;
    }

    // Key is valid — proceed to the route handler
  };
}
