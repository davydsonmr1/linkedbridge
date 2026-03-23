// =====================================================
// LinkedBridge — API Key Authentication Middleware
// =====================================================
// Validates the X-API-KEY header on public API routes.
//
// Authentication Flow:
// 1. Extract X-API-KEY from request headers
// 2. Hash the raw key with SHA-256
// 3. Look up the hash in the database
// 4. Verify the key is not revoked
// 5. Inject the userId into the request object
//
// INFOSEC:
// - The raw key NEVER touches the database — only its hash
// - Revoked keys are rejected even if the hash matches
// - Generic 401 messages prevent key enumeration
// =====================================================

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { IApiKeyRepository } from '../../../domain/repositories/i-api-key.repository.js';
import { isKeyActive } from '../../../domain/entities/portfolio-api-key.entity.js';
import { ApiKeyService } from '../../crypto/api-key.service.js';

// Extend Fastify's request type to include the authenticated userId
declare module 'fastify' {
  interface FastifyRequest {
    apiKeyUserId?: string;
  }
}

/**
 * Creates a Fastify preHandler hook that validates API keys.
 *
 * @param apiKeyRepository - Repository to look up hashed keys
 * @returns Fastify preHandler hook
 */
export function apiKeyMiddleware(apiKeyRepository: IApiKeyRepository) {
  const apiKeyService = new ApiKeyService();

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const rawKey = request.headers['x-api-key'];

    // ─── Missing Header ───
    if (!rawKey || typeof rawKey !== 'string') {
      request.log.warn('[ApiKeyAuth] Missing X-API-KEY header');
      void reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid API key.',
        },
      });
      return;
    }

    // ─── Hash the Key ───
    // We hash the raw key to look it up in the database.
    // The database only stores SHA-256 hashes, never plaintext.
    const hashedKey = apiKeyService.hashKey(rawKey);

    // ─── Look Up in Database ───
    const apiKey = await apiKeyRepository.findByHash(hashedKey);

    if (!apiKey) {
      request.log.warn('[ApiKeyAuth] API key not found');
      void reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid API key.',
        },
      });
      return;
    }

    // ─── Check Revocation ───
    if (!isKeyActive(apiKey)) {
      request.log.warn(
        { keyHint: apiKey.keyHint },
        '[ApiKeyAuth] Revoked API key used',
      );
      void reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'This API key has been revoked.',
        },
      });
      return;
    }

    // ─── Inject userId into Request ───
    // Downstream handlers can access request.apiKeyUserId
    // to know which user's data to fetch.
    request.apiKeyUserId = apiKey.userId;
  };
}
