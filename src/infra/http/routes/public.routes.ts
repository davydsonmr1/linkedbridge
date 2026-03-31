// =====================================================
// LinkedBridge — Public API Routes
// =====================================================
// Routes consumed by portfolio websites.
// Protected by API Key middleware + rate limiting.
//
// CORS: Configured to allow any origin (portfolio sites
// are on diverse domains) but restricts methods to GET/POST.
//
// Rate Limit: 60 req/min per API key for reads (stricter
// than global) to prevent resource exhaustion.
// Sync endpoint: 5 req/min (heavy operation).
// =====================================================

import type { FastifyInstance } from 'fastify';

import type { PortfolioController } from '../controllers/portfolio.controller.js';
import type { IApiKeyRepository } from '../../../domain/repositories/i-api-key.repository.js';
import { apiKeyMiddleware } from '../middlewares/api-key.middleware.js';

export function registerPublicRoutes(
  app: FastifyInstance,
  controller: PortfolioController,
  apiKeyRepository: IApiKeyRepository,
): void {
  const authHook = apiKeyMiddleware(apiKeyRepository);

  app.get(
    '/api/v1/posts',
    {
      preHandler: [authHook],
      config: {
        // Per-route rate limit override: 60 req/min per API key
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: (request) => {
            // Rate limit by API key instead of IP,
            // so multiple sites using the same key share the limit.
            return request.headers['x-api-key'] as string || request.ip;
          },
        },
      },
    },
    controller.getPosts.bind(controller),
  );

  // ─── Manual Sync Endpoint ───
  // Allows API-key holders to force a re-sync of their
  // LinkedIn posts without relying on the Cron Job.
  app.post(
    '/api/v1/posts/sync',
    {
      preHandler: [authHook],
      config: {
        // Stricter rate limit: sync is a heavy operation
        // (calls LinkedIn API + upserts into DB)
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request) => {
            return request.headers['x-api-key'] as string || request.ip;
          },
        },
      },
    },
    controller.forceSync.bind(controller),
  );
}

