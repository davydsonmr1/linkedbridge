// =====================================================
// LinkedBridge — OAuth Routes
// =====================================================
// Maps HTTP endpoints to OAuthController methods.
// Route-level concerns only — no business logic here.
// =====================================================

import type { FastifyInstance } from 'fastify';

import type { OAuthController } from '../controllers/oauth.controller.js';

export function registerOAuthRoutes(
  app: FastifyInstance,
  controller: OAuthController,
): void {
  // Initiate LinkedIn OAuth flow
  app.get(
    '/api/auth/linkedin',
    controller.login.bind(controller),
  );

  // Handle LinkedIn OAuth callback
  app.get(
    '/api/auth/linkedin/callback',
    controller.callback.bind(controller),
  );
}
