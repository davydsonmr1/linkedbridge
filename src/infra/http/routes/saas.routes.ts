// =====================================================
// LinkedBridge — SaaS Dashboard Routes
// =====================================================
// Maps HTTP endpoints to SaaSController methods.
// ALL routes are protected by requireAuthMiddleware
// (JWT session in HttpOnly cookie).
//
// Endpoints:
// - GET    /api/saas/keys     → List all API keys
// - POST   /api/saas/keys     → Create a new API key
// - DELETE /api/saas/keys/:id → Revoke an API key
// =====================================================

import type { FastifyInstance } from 'fastify';

import type { SaaSController } from '../controllers/saas.controller.js';
import { requireAuthMiddleware } from '../middlewares/require-auth.middleware.js';

export function registerSaaSRoutes(
  app: FastifyInstance,
  controller: SaaSController,
): void {
  const authHook = requireAuthMiddleware;

  // List all API keys for the authenticated user
  app.get(
    '/api/saas/keys',
    { preHandler: [authHook] },
    controller.listKeys.bind(controller),
  );

  // Create a new API key
  app.post(
    '/api/saas/keys',
    { preHandler: [authHook] },
    controller.createKey.bind(controller),
  );

  // Revoke an API key by ID
  app.delete(
    '/api/saas/keys/:id',
    { preHandler: [authHook] },
    controller.revokeKey.bind(controller),
  );
}
