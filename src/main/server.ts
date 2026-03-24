// =====================================================
// LinkedBridge — Server Bootstrap (Composition Root)
// =====================================================
// This is the Composition Root (main/server.ts).
// It wires all dependencies together and starts the
// Fastify HTTP server.
//
// Production Features:
// - Graceful Shutdown (SIGINT/SIGTERM)
// - Prisma $disconnect on shutdown
// - Manual Dependency Injection (no DI container)
// =====================================================

import 'dotenv/config';

import { buildApp } from '../infra/http/app.js';
import { registerOAuthRoutes } from '../infra/http/routes/oauth.routes.js';
import { registerCronRoutes } from '../infra/http/routes/cron.routes.js';
import { registerPublicRoutes } from '../infra/http/routes/public.routes.js';
import { registerSaaSRoutes } from '../infra/http/routes/saas.routes.js';

// Infrastructure — Database
import { prisma } from '../infra/database/prisma/prisma-client.js';

// Infrastructure — Crypto
import { AesGcmCryptoService } from '../infra/crypto/aes-gcm.service.js';
import { ApiKeyService } from '../infra/crypto/api-key.service.js';

// Infrastructure — Gateways
import { LinkedInGateway } from '../infra/gateways/linkedin/linkedin.gateway.js';

// Infrastructure — Repositories (Prisma implementations)
import { PrismaUserRepository } from '../infra/database/prisma/repositories/prisma-user.repository.js';
import { PrismaOAuthCredentialRepository } from '../infra/database/prisma/repositories/prisma-oauth-credential.repository.js';
import { PrismaApiKeyRepository } from '../infra/database/prisma/repositories/prisma-api-key.repository.js';
import { PrismaPostCacheRepository } from '../infra/database/prisma/repositories/prisma-post-cache.repository.js';

// Use Cases
import { GenerateOAuthUrlUseCase } from '../application/use-cases/generate-oauth-url.usecase.js';
import { ProcessOAuthCallbackUseCase } from '../application/use-cases/process-oauth-callback.usecase.js';
import { SyncUserPostsUseCase } from '../application/use-cases/sync-user-posts.usecase.js';
import { SyncAllUsersUseCase } from '../application/use-cases/sync-all-users.usecase.js';
import { GetPortfolioPostsUseCase } from '../application/use-cases/get-portfolio-posts.usecase.js';
import { CreateApiKeyUseCase } from '../application/use-cases/create-api-key.usecase.js';
import { ListApiKeysUseCase } from '../application/use-cases/list-api-keys.usecase.js';
import { RevokeApiKeyUseCase } from '../application/use-cases/revoke-api-key.usecase.js';

// Controllers
import { OAuthController } from '../infra/http/controllers/oauth.controller.js';
import { PortfolioController } from '../infra/http/controllers/portfolio.controller.js';
import { SaaSController } from '../infra/http/controllers/saas.controller.js';

const PORT = Number(process.env['PORT']) || 3333;
const HOST = process.env['HOST'] || '0.0.0.0';

async function bootstrap(): Promise<void> {
  // ─── 1. Build the Fastify App (with security plugins + JWT) ───
  const app = await buildApp();

  // ─── 2. Instantiate Infrastructure Services ───
  const cryptoService = new AesGcmCryptoService();
  const apiKeyService = new ApiKeyService();

  const linkedInGateway = new LinkedInGateway({
    clientId: process.env['LINKEDIN_CLIENT_ID'] ?? '',
    clientSecret: process.env['LINKEDIN_CLIENT_SECRET'] ?? '',
    redirectUri: process.env['LINKEDIN_REDIRECT_URI'] ?? '',
  });

  // ─── 3. Instantiate Repositories (Prisma implementations) ───
  const userRepository = new PrismaUserRepository(prisma);
  const oauthCredentialRepository = new PrismaOAuthCredentialRepository(prisma);
  const apiKeyRepository = new PrismaApiKeyRepository(prisma);
  const postCacheRepository = new PrismaPostCacheRepository(prisma);

  // ─── 4. Instantiate Use Cases ───
  const generateOAuthUrlUseCase = new GenerateOAuthUrlUseCase(linkedInGateway);

  const processOAuthCallbackUseCase = new ProcessOAuthCallbackUseCase(
    linkedInGateway,
    cryptoService,
    userRepository,
    oauthCredentialRepository,
  );

  const syncUserPostsUseCase = new SyncUserPostsUseCase(
    userRepository,
    oauthCredentialRepository,
    postCacheRepository,
    linkedInGateway,
    cryptoService,
  );

  const syncAllUsersUseCase = new SyncAllUsersUseCase(
    userRepository,
    oauthCredentialRepository,
    syncUserPostsUseCase,
  );

  const getPortfolioPostsUseCase = new GetPortfolioPostsUseCase(postCacheRepository);

  const createApiKeyUseCase = new CreateApiKeyUseCase(apiKeyRepository, apiKeyService);
  const listApiKeysUseCase = new ListApiKeysUseCase(apiKeyRepository);
  const revokeApiKeyUseCase = new RevokeApiKeyUseCase(apiKeyRepository);

  // ─── 5. Instantiate Controllers ───
  const oauthController = new OAuthController(
    generateOAuthUrlUseCase,
    processOAuthCallbackUseCase,
  );

  const portfolioController = new PortfolioController(getPortfolioPostsUseCase);

  const saasController = new SaaSController(
    createApiKeyUseCase,
    listApiKeysUseCase,
    revokeApiKeyUseCase,
  );

  // ─── 6. Register Routes ───
  registerOAuthRoutes(app, oauthController);
  registerPublicRoutes(app, portfolioController, apiKeyRepository);
  registerSaaSRoutes(app, saasController);

  // Cron routes (protected by CRON_SECRET_KEY)
  const cronSecretKey = process.env['CRON_SECRET_KEY'];
  if (cronSecretKey) {
    registerCronRoutes(app, syncAllUsersUseCase, cronSecretKey);
    app.log.info('[LinkedBridge] 🔄 Cron routes registered at POST /api/internal/cron/sync');
  } else {
    app.log.warn('[LinkedBridge] ⚠️ CRON_SECRET_KEY not set — cron routes disabled');
  }

  // ─── 7. Start the Server ───
  await app.listen({ port: PORT, host: HOST });

  app.log.info(`[LinkedBridge] 🚀 Server running on http://${HOST}:${PORT}`);
  app.log.info(`[LinkedBridge] 🔒 Helmet, CORS, Rate-Limit, Cookie, and JWT plugins active`);
  app.log.info(`[LinkedBridge] 📡 Public API at GET /api/v1/posts`);
  app.log.info(`[LinkedBridge] 🔑 SaaS Dashboard at /api/saas/keys`);

  // ─── 8. Graceful Shutdown ───
  // When the process receives SIGINT (Ctrl+C) or SIGTERM (deploy/restart),
  // we stop accepting new connections and clean up resources before exiting.
  // This prevents in-flight requests from being dropped and ensures
  // database connections are properly released.
  const gracefulShutdown = async (signal: string): Promise<void> => {
    app.log.info(`[LinkedBridge] ${signal} received. Starting graceful shutdown...`);

    try {
      // 1. Stop accepting new HTTP requests and wait for in-flight to finish
      await app.close();
      app.log.info('[LinkedBridge] ✅ Fastify closed — no more incoming requests');

      // 2. Disconnect Prisma Client — release all DB connections
      await prisma.$disconnect();
      app.log.info('[LinkedBridge] ✅ Prisma disconnected');

      app.log.info('[LinkedBridge] 🏁 Graceful shutdown complete');
      process.exit(0);
    } catch (error: unknown) {
      app.log.error(error, '[LinkedBridge] ❌ Error during graceful shutdown');
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

  // Catch unhandled rejections in production to prevent silent crashes
  process.on('unhandledRejection', (reason: unknown) => {
    app.log.error(reason, '[LinkedBridge] Unhandled promise rejection');
    // In production, let the process manager restart us
    process.exit(1);
  });

  process.on('uncaughtException', (error: Error) => {
    app.log.fatal(error, '[LinkedBridge] Uncaught exception — shutting down');
    process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  console.error('[LinkedBridge] Fatal error during bootstrap:', error);
  process.exit(1);
});
