// =====================================================
// LinkedBridge — SyncUserPosts Use Case (v2 with Refresh)
// =====================================================
// Orchestrates the full post synchronization pipeline:
//
// 1. Retrieve encrypted OAuth credential
// 2. Check token expiry → attempt refresh if expired
// 3. Decrypt the access token (AES-256-GCM)
// 4. Fetch posts from LinkedIn via Gateway
// 5. IMMEDIATELY destroy plaintext token in memory
// 6. Sanitize content (Stored XSS prevention)
// 7. Upsert sanitized posts into the cache
//
// REFRESH TOKEN FLOW (added in Task 8):
// If the access token has expired and a refresh token is
// available, we decrypt the refresh token, call LinkedIn's
// refresh endpoint, encrypt the new access token, persist
// the updated credential, and retry the fetch.
//
// MEMORY ISOLATION:
// All plaintext tokens (access and refresh) are nullified
// immediately after use.
// =====================================================

import type { ICryptoService } from '../../domain/interfaces/crypto.interface.js';
import type { ILinkedInGateway, LinkedInPostSummary } from '../../domain/gateways/i-linkedin.gateway.js';
import type { IOAuthCredentialRepository } from '../../domain/repositories/i-oauth-credential.repository.js';
import type { IPostCacheRepository } from '../../domain/repositories/i-post-cache.repository.js';
import type { IUserRepository } from '../../domain/repositories/i-user.repository.js';
import type { UpsertPostCacheInput } from '../../domain/entities/post-cache.entity.js';

import { ResourceNotFoundError } from '../../domain/errors/resource-not-found.error.js';
import { TokenExpiredError } from '../../domain/errors/token-expired.error.js';
import { isTokenExpired } from '../../domain/entities/oauth-credential.entity.js';
import { stripHtml, sanitizeUrl } from '../../infra/http/utils/sanitize.js';

/**
 * Output of the sync operation.
 * Returns a summary — never exposes tokens or credentials.
 */
export interface SyncUserPostsOutput {
  userId: string;
  postsCount: number;
  syncedAt: Date;
  tokenRefreshed: boolean;
  /** Present when the sync was aborted to protect existing data. */
  warning?: string;
}

export class SyncUserPostsUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly oauthCredentialRepository: IOAuthCredentialRepository,
    private readonly postCacheRepository: IPostCacheRepository,
    private readonly linkedInGateway: ILinkedInGateway,
    private readonly cryptoService: ICryptoService,
  ) {}

  /**
   * Synchronizes a user's LinkedIn posts to the local cache.
   *
   * **Safeguard**: If the LinkedIn gateway fails or returns an empty
   * list, the existing cached posts are preserved intact. The operation
   * is aborted and a warning is returned instead of throwing.
   *
   * If the token is expired and a refresh token exists, it will
   * automatically renew the access token before fetching posts.
   *
   * @param userId - The internal user ID (UUID)
   * @returns Summary of the sync operation
   * @throws ResourceNotFoundError if user or credential not found
   * @throws TokenExpiredError if the token is expired AND no refresh token exists
   */
  async execute(userId: string): Promise<SyncUserPostsOutput> {
    // ─── Step 1: Verify the user exists ───
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new ResourceNotFoundError('User');
    }

    // ─── Step 2: Retrieve the encrypted credential ───
    const credential = await this.oauthCredentialRepository.findByUserId(userId);
    if (!credential) {
      throw new ResourceNotFoundError('OAuth credential');
    }

    // ─── Step 3: Check token expiry + attempt refresh ───
    let tokenRefreshed = false;

    if (isTokenExpired(credential)) {
      // If there's no refresh token, we can't renew — user must re-authorize.
      if (!credential.refreshToken) {
        throw new TokenExpiredError(
          'The LinkedIn access token has expired and no refresh token is available.',
        );
      }

      // ─── Refresh Flow ───
      // 1. Decrypt the refresh token
      // 2. Exchange it for a new access token via LinkedIn
      // 3. Encrypt the new access token
      // 4. Persist the updated credential
      // 5. Destroy all plaintext tokens
      let plainRefreshToken: string | null = this.cryptoService.decrypt(
        credential.refreshToken,
        credential.iv,
        credential.authTag,
      );

      try {
        const refreshResult = await this.linkedInGateway.refreshAccessToken(
          plainRefreshToken,
        );

        // IMMEDIATELY encrypt the new access token
        const newEncrypted = this.cryptoService.encrypt(refreshResult.accessToken);

        const newExpiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000);

        await this.oauthCredentialRepository.updateToken(userId, {
          encryptedAccessToken: newEncrypted.encryptedText,
          iv: newEncrypted.iv,
          authTag: newEncrypted.authTag,
          refreshToken: refreshResult.refreshToken ?? credential.refreshToken,
          expiresAt: newExpiresAt,
        });

        // Update the local credential reference for the fetch step
        credential.encryptedAccessToken = newEncrypted.encryptedText;
        credential.iv = newEncrypted.iv;
        credential.authTag = newEncrypted.authTag;
        credential.expiresAt = newExpiresAt;

        tokenRefreshed = true;
      } finally {
        // MEMORY ISOLATION: Destroy plaintext refresh token
        plainRefreshToken = null;
      }
    }

    // ─── Step 4: Decrypt the (possibly refreshed) access token ───
    let plainTextToken: string | null = this.cryptoService.decrypt(
      credential.encryptedAccessToken,
      credential.iv,
      credential.authTag,
    );

    // ─── Step 5: Fetch posts from LinkedIn (with Safeguard) ───
    const authorUrn = `urn:li:person:${credential.userId}`;

    let posts: LinkedInPostSummary[];
    try {
      posts = await this.linkedInGateway.fetchRecentPosts(
        plainTextToken,
        authorUrn,
      );
    } catch (gatewayError: unknown) {
      // ──────────────────────────────────────────────────
      // SAFEGUARD: Gateway failure — preserve existing data
      // ──────────────────────────────────────────────────
      // If the LinkedIn API call fails (network error, 5xx,
      // rate-limit, etc.) we must NOT proceed with the
      // delete/insert cycle. Existing cached posts remain
      // untouched in the database.
      const errorMessage =
        gatewayError instanceof Error ? gatewayError.message : String(gatewayError);

      return {
        userId,
        postsCount: 0,
        syncedAt: new Date(),
        tokenRefreshed,
        warning: `Sincronização abortada — falha ao buscar posts do LinkedIn: ${errorMessage}. Os dados existentes foram preservados.`,
      };
    } finally {
      // MEMORY ISOLATION: Destroy plaintext access token
      plainTextToken = null;
    }

    // ──────────────────────────────────────────────────
    // SAFEGUARD: Empty response — preserve existing data
    // ──────────────────────────────────────────────────
    // If the LinkedIn API returns an empty array it likely
    // means a transient issue (API hiccup, permissions
    // change, empty page). We abort to avoid wiping valid
    // cached posts.
    if (!posts || posts.length === 0) {
      return {
        userId,
        postsCount: 0,
        syncedAt: new Date(),
        tokenRefreshed,
        warning:
          'Sincronização abortada — o LinkedIn retornou 0 posts. Os dados existentes foram preservados.',
      };
    }

    // ─── Step 6: Sanitize content (Zero Trust) ───
    const sanitizedPosts: UpsertPostCacheInput[] = posts.map((post) => ({
      userId,
      externalPostId: post.externalPostId,
      content: {
        text: stripHtml(post.text),
        imageUrl: sanitizeUrl(post.imageUrl) ?? null,
      },
      imageUrl: sanitizeUrl(post.imageUrl) ?? null,
      postedAt: post.publishedAt,
    }));

    // ─── Step 7: Upsert into the cache ───
    await this.postCacheRepository.upsertPosts(sanitizedPosts);

    return {
      userId,
      postsCount: sanitizedPosts.length,
      syncedAt: new Date(),
      tokenRefreshed,
    };
  }
}
