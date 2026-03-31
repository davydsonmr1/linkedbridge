// =====================================================
// LinkedBridge — Portfolio Controller
// =====================================================
// HTTP adapter for the public portfolio API.
// Serves cached LinkedIn posts to portfolio websites.
// Also exposes a manual sync endpoint for API-key holders.
// =====================================================

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { GetPortfolioPostsUseCase } from '../../../application/use-cases/get-portfolio-posts.usecase.js';
import type { SyncUserPostsUseCase } from '../../../application/use-cases/sync-user-posts.usecase.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';

export class PortfolioController {
  constructor(
    private readonly getPortfolioPostsUseCase: GetPortfolioPostsUseCase,
    private readonly syncUserPostsUseCase: SyncUserPostsUseCase,
  ) {}

  /**
   * GET /api/v1/posts
   *
   * Returns cached LinkedIn posts for the authenticated API key's user.
   * The userId is injected by the apiKeyMiddleware.
   */
  async getPosts(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.apiKeyUserId;

    if (!userId) {
      throw new UnauthorizedError('API key authentication required.');
    }

    const result = await this.getPortfolioPostsUseCase.execute(userId);

    // Cache-Control: allow CDNs to cache for 5 minutes (300s)
    // stale-while-revalidate: serve stale for 1 hour while refreshing
    void reply
      .header('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600')
      .status(200)
      .send({
        data: result.posts,
        meta: {
          total: result.total,
          cachedUntil: new Date(Date.now() + 300_000).toISOString(),
        },
      });
  }

  /**
   * POST /api/v1/posts/sync
   *
   * Forces a manual synchronization of the authenticated user's
   * LinkedIn posts into the cache. Protected by API key.
   */
  async forceSync(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.apiKeyUserId;

    if (!userId) {
      throw new UnauthorizedError('API key authentication required.');
    }

    const result = await this.syncUserPostsUseCase.execute(userId);

    void reply.status(200).send({
      message: 'Sincronização concluída.',
      data: {
        postsCount: result.postsCount,
        syncedAt: result.syncedAt.toISOString(),
        tokenRefreshed: result.tokenRefreshed,
        ...(result.warning ? { warning: result.warning } : {}),
      },
    });
  }
}

