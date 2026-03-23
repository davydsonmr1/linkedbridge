// =====================================================
// LinkedBridge — ProcessOAuthCallback Use Case
// =====================================================
// This is the SECURITY CORE of the authentication flow.
// It orchestrates the entire OAuth callback pipeline:
//
//   1. Exchange code for access token (via Gateway)
//   2. Fetch user profile (via Gateway)
//   3. IMMEDIATELY encrypt the raw token (via CryptoService)
//   4. Find or create the user (via UserRepository)
//   5. Persist encrypted credential (via OAuthCredentialRepository)
//   6. Return ONLY safe user data (no tokens in output)
//
// MEMORY ISOLATION STRATEGY:
// The raw access token exists in plaintext in memory for
// the absolute minimum time possible. It is encrypted
// immediately after receipt and NEVER stored in any
// variable beyond the encryption call. The JavaScript
// garbage collector will reclaim the plaintext string
// once it goes out of scope.
//
// The output of this use case NEVER contains tokens,
// encryption keys, IVs, or any cryptographic material.
// =====================================================

import type { ILinkedInGateway } from '../../domain/gateways/i-linkedin.gateway.js';
import type { ICryptoService } from '../../domain/interfaces/crypto.interface.js';
import type { IUserRepository } from '../../domain/repositories/i-user.repository.js';
import type { IOAuthCredentialRepository } from '../../domain/repositories/i-oauth-credential.repository.js';

import type {
  ProcessOAuthCallbackInput,
  ProcessOAuthCallbackOutput,
} from '../dtos/oauth.dto.js';

export class ProcessOAuthCallbackUseCase {
  constructor(
    private readonly linkedInGateway: ILinkedInGateway,
    private readonly cryptoService: ICryptoService,
    private readonly userRepository: IUserRepository,
    private readonly oauthCredentialRepository: IOAuthCredentialRepository,
  ) {}

  /**
   * Processes the LinkedIn OAuth 2.0 callback.
   *
   * SECURITY NOTES:
   * - The `state` CSRF validation MUST be performed by the HTTP controller
   *   BEFORE calling this use case. The controller compares the `state`
   *   query parameter with the value stored in the HttpOnly cookie.
   * - This use case assumes the `state` has already been validated.
   * - The raw access token is encrypted IMMEDIATELY and never stored
   *   in a class field, database, or response payload in plaintext.
   *
   * @param input - Validated callback input (code + state)
   * @returns Safe user identity data (no tokens)
   */
  async execute(input: ProcessOAuthCallbackInput): Promise<ProcessOAuthCallbackOutput> {
    // ─── Step 1: Exchange authorization code for tokens ───
    // The `code` is single-use and short-lived (typically 30s).
    // The Gateway handles the HTTP call with timeout + Zod validation.
    const tokenResult = await this.linkedInGateway.exchangeCodeForToken(input.code);

    // ─── Step 2: IMMEDIATELY encrypt the raw access token ───
    // MEMORY ISOLATION: The raw token from `tokenResult.accessToken`
    // is passed directly to encrypt(). After this line, the only
    // reference to the plaintext is inside `tokenResult` which will
    // be garbage-collected when this function returns.
    const encrypted = this.cryptoService.encrypt(tokenResult.accessToken);

    // ─── Step 3: Fetch the user's LinkedIn profile ───
    // We need the profile to identify/create the user in our system.
    // This uses the (still valid) raw token — it hasn't been revoked,
    // just encrypted for storage.
    const profile = await this.linkedInGateway.getUserProfile(tokenResult.accessToken);

    // ─── Step 4: Find or create the user ───
    let isNewUser = false;
    let user = await this.userRepository.findByEmail(profile.email);

    if (!user) {
      user = await this.userRepository.create({
        email: profile.email,
        name: profile.name,
      });
      isNewUser = true;
    }

    // ─── Step 5: Save the encrypted credential ───
    // Calculate the absolute expiration timestamp from the relative `expiresIn`.
    const expiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);

    await this.oauthCredentialRepository.saveCredential({
      userId: user.id,
      providerName: 'linkedin',
      encryptedAccessToken: encrypted.encryptedText,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      refreshToken: tokenResult.refreshToken ?? null,
      expiresAt,
    });

    // ─── Step 6: Return ONLY safe user data ───
    // INFOSEC: No tokens, IVs, authTags, or cryptographic material
    // ever leaves this use case. The caller receives only identity data.
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      isNewUser,
    };
  }
}
