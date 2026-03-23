// =====================================================
// LinkedBridge — OAuth Controller
// =====================================================
// HTTP-layer adapter that bridges Fastify requests/responses
// to our application use cases.
//
// CSRF Protection Flow:
// 1. GET /auth/linkedin → generate state, set HttpOnly cookie, redirect
// 2. GET /auth/linkedin/callback → compare state param with cookie
//    → mismatch = 403 Forbidden (CSRF attack detected)
//    → match = process callback, clear cookie, return user data
// =====================================================

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { GenerateOAuthUrlUseCase } from '../../../application/use-cases/generate-oauth-url.usecase.js';
import type { ProcessOAuthCallbackUseCase } from '../../../application/use-cases/process-oauth-callback.usecase.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';

/**
 * Cookie name for the OAuth CSRF state token.
 * Prefixed with `__Host-` for maximum cookie security:
 * - Must be Secure
 * - Must not have a Domain attribute
 * - Path must be /
 */
const STATE_COOKIE_NAME = '__Host-oauth_state';

/**
 * Maximum age of the state cookie in seconds.
 * 5 minutes is generous enough for the user to complete
 * the LinkedIn authorization, but short enough to limit
 * the window for replay attacks.
 */
const STATE_COOKIE_MAX_AGE_SECONDS = 300;

export class OAuthController {
  constructor(
    private readonly generateOAuthUrlUseCase: GenerateOAuthUrlUseCase,
    private readonly processOAuthCallbackUseCase: ProcessOAuthCallbackUseCase,
  ) {}

  /**
   * GET /auth/linkedin
   *
   * Initiates the LinkedIn OAuth 2.0 flow:
   * 1. Generates a secure authorization URL with CSRF state
   * 2. Sets the state in an HttpOnly cookie
   * 3. Redirects the user to LinkedIn
   */
  async login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { authorizationUrl, state } = this.generateOAuthUrlUseCase.execute();

    // Set the CSRF state token in a strictly secure cookie.
    // HttpOnly: JavaScript cannot read it (XSS mitigation)
    // Secure: Only sent over HTTPS
    // SameSite=Lax: Sent on top-level navigations (required for OAuth redirect)
    // MaxAge=300: Expires in 5 minutes
    void reply.setCookie(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    });

    void reply.redirect(authorizationUrl);
  }

  /**
   * GET /auth/linkedin/callback
   *
   * Handles LinkedIn's OAuth 2.0 redirect callback:
   * 1. Validates the CSRF state (cookie vs query param)
   * 2. Exchanges the code for tokens + encrypts immediately
   * 3. Creates/finds the user and persists encrypted credentials
   * 4. Clears the state cookie
   * 5. Returns safe user data (no tokens)
   */
  async callback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = request.query as { code?: string; state?: string; error?: string };

    // ─── LinkedIn Error Response ───
    // LinkedIn may redirect with an error instead of a code
    // (e.g., user denied access).
    if (query.error) {
      request.log.warn({ linkedInError: query.error }, 'LinkedIn OAuth denied by user');
      void reply.status(403).send({
        error: {
          code: 'OAUTH_DENIED',
          message: 'LinkedIn authorization was denied.',
        },
      });
      return;
    }

    // ─── Missing Parameters ───
    if (!query.code || !query.state) {
      throw new UnauthorizedError('Missing authorization code or state parameter.');
    }

    // ─── CSRF Validation ───
    // Compare the state from the query string with the one stored
    // in the HttpOnly cookie. This prevents CSRF attacks where an
    // attacker tricks the user into completing an OAuth flow that
    // links the attacker's LinkedIn account.
    const cookieState = request.cookies[STATE_COOKIE_NAME];

    if (!cookieState || cookieState !== query.state) {
      request.log.warn(
        { queryState: query.state, hasCookie: !!cookieState },
        '[CSRF] OAuth state mismatch — possible CSRF attack',
      );

      // Clear the cookie regardless
      void reply.clearCookie(STATE_COOKIE_NAME, { path: '/' });

      void reply.status(403).send({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: 'OAuth state validation failed. Please try logging in again.',
        },
      });
      return;
    }

    // ─── Process the OAuth Callback ───
    const result = await this.processOAuthCallbackUseCase.execute({
      code: query.code,
      state: query.state,
    });

    // ─── Clear the State Cookie ───
    // The state has been consumed — it must not be reusable.
    void reply.clearCookie(STATE_COOKIE_NAME, { path: '/' });

    // ─── Return Safe User Data ───
    void reply.status(200).send({
      data: {
        userId: result.userId,
        email: result.email,
        name: result.name,
        isNewUser: result.isNewUser,
      },
    });
  }
}
