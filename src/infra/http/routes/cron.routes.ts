// =====================================================
// LinkedBridge — Cron Routes
// =====================================================
// Internal routes for automated cron workers.
// Protected by cronAuthMiddleware (shared secret).
// =====================================================

import type { FastifyInstance } from 'fastify';

import type { SyncAllUsersUseCase } from '../../../application/use-cases/sync-all-users.usecase.js';
import { cronAuthMiddleware } from '../middlewares/cron-auth.middleware.js';

export function registerCronRoutes(
  app: FastifyInstance,
  syncAllUsersUseCase: SyncAllUsersUseCase,
  cronSecretKey: string,
): void {
  // Apply cron authentication to ALL routes in this scope
  const authHook = cronAuthMiddleware(cronSecretKey);

  app.post(
    '/api/internal/cron/sync',
    { preHandler: [authHook] },
    async (request, reply) => {
      request.log.info('[Cron] Starting mass synchronization...');

      const result = await syncAllUsersUseCase.execute();

      request.log.info(
        {
          totalUsers: result.totalUsers,
          successCount: result.successCount,
          failureCount: result.failureCount,
          durationMs: result.durationMs,
        },
        '[Cron] Mass synchronization complete',
      );

      void reply.status(200).send({
        data: {
          totalUsers: result.totalUsers,
          successCount: result.successCount,
          failureCount: result.failureCount,
          durationMs: result.durationMs,
          startedAt: result.startedAt.toISOString(),
          finishedAt: result.finishedAt.toISOString(),
        },
      });
    },
  );
}
