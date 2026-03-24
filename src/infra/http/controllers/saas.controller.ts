// =====================================================
// LinkedBridge — SaaS Dashboard Controller
// =====================================================
// HTTP adapter for the SaaS dashboard API Key management.
//
// All routes are protected by requireAuthMiddleware,
// so `request.user.sub` is guaranteed to contain the
// authenticated userId.
//
// Endpoints:
// - GET    /api/saas/keys     → List all keys
// - POST   /api/saas/keys     → Create a new key
// - DELETE /api/saas/keys/:id → Revoke a key
// =====================================================

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { CreateApiKeyUseCase } from '../../../application/use-cases/create-api-key.usecase.js';
import type { ListApiKeysUseCase } from '../../../application/use-cases/list-api-keys.usecase.js';
import type { RevokeApiKeyUseCase } from '../../../application/use-cases/revoke-api-key.usecase.js';

export class SaaSController {
  constructor(
    private readonly createApiKeyUseCase: CreateApiKeyUseCase,
    private readonly listApiKeysUseCase: ListApiKeysUseCase,
    private readonly revokeApiKeyUseCase: RevokeApiKeyUseCase,
  ) {}

  /**
   * GET /api/saas/keys
   *
   * Lists all API keys for the authenticated user.
   * Returns key hints and status — never the hashed key.
   */
  async listKeys(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.sub;

    const result = await this.listApiKeysUseCase.execute(userId);

    void reply.status(200).send({
      data: result.keys,
      meta: {
        total: result.total,
      },
    });
  }

  /**
   * POST /api/saas/keys
   *
   * Creates a new API key for the authenticated user.
   *
   * SECURITY WARNING: The `plainKey` in the response is shown
   * to the user ONCE and never again. The frontend MUST display
   * a prominent warning to copy and save it immediately.
   */
  async createKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.sub;

    const result = await this.createApiKeyUseCase.execute(userId);

    void reply.status(201).send({
      data: {
        id: result.id,
        keyHint: result.keyHint,
        plainKey: result.plainKey,
      },
      meta: {
        warning: 'This is the ONLY time the full API key will be shown. Save it securely now.',
      },
    });
  }

  /**
   * DELETE /api/saas/keys/:id
   *
   * Revokes an API key (soft-delete).
   * The key must belong to the authenticated user.
   */
  async revokeKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.sub;
    const { id } = request.params as { id: string };

    const result = await this.revokeApiKeyUseCase.execute(userId, id);

    void reply.status(200).send({
      data: {
        id: result.id,
        keyHint: result.keyHint,
        revokedAt: result.revokedAt,
      },
    });
  }
}
