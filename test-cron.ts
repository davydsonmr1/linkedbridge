import 'dotenv/config';
import { prisma } from './src/infra/database/prisma/prisma-client.js';
import { PrismaUserRepository } from './src/infra/database/prisma/repositories/prisma-user.repository.js';
import { PrismaOAuthCredentialRepository } from './src/infra/database/prisma/repositories/prisma-oauth-credential.repository.js';
import { PrismaPostCacheRepository } from './src/infra/database/prisma/repositories/prisma-post-cache.repository.js';
import { AesGcmCryptoService } from './src/infra/crypto/aes-gcm.service.js';
import { LinkedInGateway } from './src/infra/gateways/linkedin/linkedin.gateway.js';
import { SyncUserPostsUseCase } from './src/application/use-cases/sync-user-posts.usecase.js';
import { SyncAllUsersUseCase } from './src/application/use-cases/sync-all-users.usecase.js';

async function run() {
  const userRepository = new PrismaUserRepository(prisma);
  const oauthCredentialRepository = new PrismaOAuthCredentialRepository(prisma);
  const postCacheRepository = new PrismaPostCacheRepository(prisma);
  const cryptoService = new AesGcmCryptoService();
  const linkedInGateway = new LinkedInGateway({
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || '',
  });

  const syncUserPostsUseCase = new SyncUserPostsUseCase(
    userRepository,
    oauthCredentialRepository,
    postCacheRepository,
    linkedInGateway,
    cryptoService
  );

  const syncAllUsersUseCase = new SyncAllUsersUseCase(
    userRepository,
    oauthCredentialRepository,
    syncUserPostsUseCase
  );

  try {
    const res = await syncAllUsersUseCase.execute();
    console.log('Success:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('FAILED!!!');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
