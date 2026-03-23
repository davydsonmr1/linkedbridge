// =====================================================
// LinkedBridge — Server Bootstrap
// =====================================================
// This is the Composition Root (main/server.ts).
// It wires all dependencies together and starts the
// Fastify HTTP server.
//
// Dependency Injection is performed manually here —
// no DI container needed for this scale.
// =====================================================

import 'dotenv/config';

import { buildApp } from '../infra/http/app.js';
import { registerOAuthRoutes } from '../infra/http/routes/oauth.routes.js';
import { registerCronRoutes } from '../infra/http/routes/cron.routes.js';
import { registerPublicRoutes } from '../infra/http/routes/public.routes.js';

// Infrastructure
import { AesGcmCryptoService } from '../infra/crypto/aes-gcm.service.js';
import { LinkedInGateway } from '../infra/gateways/linkedin/linkedin.gateway.js';

// Use Cases
import { GenerateOAuthUrlUseCase } from '../application/use-cases/generate-oauth-url.usecase.js';
import { ProcessOAuthCallbackUseCase } from '../application/use-cases/process-oauth-callback.usecase.js';
import { SyncUserPostsUseCase } from '../application/use-cases/sync-user-posts.usecase.js';
import { SyncAllUsersUseCase } from '../application/use-cases/sync-all-users.usecase.js';
import { GetPortfolioPostsUseCase } from '../application/use-cases/get-portfolio-posts.usecase.js';

// Controllers
import { OAuthController } from '../infra/http/controllers/oauth.controller.js';
import { PortfolioController } from '../infra/http/controllers/portfolio.controller.js';

// Repositories (interfaces — wired to Prisma in Task 10)
import type { IApiKeyRepository } from '../domain/repositories/i-api-key.repository.js';

const PORT = Number(process.env['PORT']) || 3333;
const HOST = process.env['HOST'] || '0.0.0.0';

async function bootstrap(): Promise<void> {
  // ─── 1. Build the Fastify App (with security plugins) ───
  const app = await buildApp();

  // ─── 2. Instantiate Infrastructure Services ───
  const cryptoService = new AesGcmCryptoService();

  const linkedInGateway = new LinkedInGateway({
    clientId: process.env['LINKEDIN_CLIENT_ID'] ?? '',
    clientSecret: process.env['LINKEDIN_CLIENT_SECRET'] ?? '',
    redirectUri: process.env['LINKEDIN_REDIRECT_URI'] ?? '',
  });

  // ─── 3. Instantiate Repositories ───
  // TODO (Task 10): Replace with Prisma implementations
  const apiKeyRepository = undefined as unknown as IApiKeyRepository;

  // ─── 4. Instantiate Use Cases ───
  const generateOAuthUrlUseCase = new GenerateOAuthUrlUseCase(linkedInGateway);

  // Use cases requiring repositories (Task 10 will wire them)
  const processOAuthCallbackUseCase = undefined as unknown as ProcessOAuthCallbackUseCase;
  const syncUserPostsUseCase = undefined as unknown as SyncUserPostsUseCase;
  const syncAllUsersUseCase = undefined as unknown as SyncAllUsersUseCase;
  const getPortfolioPostsUseCase = undefined as unknown as GetPortfolioPostsUseCase;

  // ─── 5. Instantiate Controllers ───
  const oauthController = new OAuthController(
    generateOAuthUrlUseCase,
    processOAuthCallbackUseCase,
  );

  const portfolioController = new PortfolioController(getPortfolioPostsUseCase);

  // ─── 6. Register Routes ───
  registerOAuthRoutes(app, oauthController);
  registerPublicRoutes(app, portfolioController, apiKeyRepository);

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

  // Suppress unused variable warnings
  void cryptoService;
  void syncUserPostsUseCase;

  app.log.info(`[LinkedBridge] 🚀 Server running on http://${HOST}:${PORT}`);
  app.log.info(`[LinkedBridge] 🔒 Helmet, CORS, Rate-Limit, and Cookie plugins active`);
  app.log.info(`[LinkedBridge] 📡 Public API at GET /api/v1/posts`);
}

bootstrap().catch((error: unknown) => {
  console.error('[LinkedBridge] Fatal error during bootstrap:', error);
  process.exit(1);
});
