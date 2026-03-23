// =====================================================
// LinkedBridge — LinkedIn OAuth 2.0 Gateway
// =====================================================
// Infrastructure implementation of ILinkedInGateway.
// Anti-Corruption Layer: isolates LinkedIn API details
// from the domain.
//
// Security Features:
// - AbortController timeout on all HTTP calls (8s/10s)
// - Zod boundary validation on all responses
// - Never leaks raw LinkedIn errors to the domain
// - Constructor DI for all config (no loose process.env)
//
// Resilience:
// - Circuit Breaker pattern to prevent cascading failures
//   when LinkedIn is down. Opens after 5 consecutive
//   failures, stays open for 60 seconds.
// =====================================================

import { ZodError } from 'zod';

import type {
  ILinkedInGateway,
  LinkedInTokenResult,
  LinkedInUserProfile,
  LinkedInPostSummary,
} from '../../../domain/gateways/i-linkedin.gateway.js';
import { GatewayError } from '../../../domain/errors/gateway.error.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';
import { RateLimitError } from '../../../domain/errors/rate-limit.error.js';

import {
  LinkedInTokenResponseSchema,
  LinkedInProfileResponseSchema,
  LinkedInPostsResponseSchema,
  LinkedInErrorResponseSchema,
} from './linkedin.schemas.js';

// ----- Constants -----

const LINKEDIN_AUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

/**
 * Default HTTP timeout in milliseconds.
 * Prevents the application from hanging if LinkedIn is slow.
 */
const DEFAULT_TIMEOUT_MS = 8_000;
const POSTS_TIMEOUT_MS = 10_000;

/**
 * Circuit Breaker thresholds.
 * - FAILURE_THRESHOLD: number of consecutive failures before opening
 * - RECOVERY_TIMEOUT_MS: how long the circuit stays open (60 seconds)
 */
const CB_FAILURE_THRESHOLD = 5;
const CB_RECOVERY_TIMEOUT_MS = 60_000;

/**
 * LinkedIn OAuth 2.0 scopes.
 * - openid: OpenID Connect
 * - profile: Basic profile (name, picture)
 * - email: Email address
 * - w_member_social: Write access for posting (future use)
 */
const LINKEDIN_SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
] as const;

// ----- Circuit Breaker State -----

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation — requests go through
  OPEN = 'OPEN',         // Failures exceeded threshold — reject immediately
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered — allow one request
}

// ----- Config Interface -----

export interface LinkedInGatewayConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  timeoutMs?: number | undefined;
}

// ----- Implementation -----

export class LinkedInGateway implements ILinkedInGateway {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly timeoutMs: number;

  // Circuit Breaker state (in-memory, per-instance)
  private circuitState: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures: number = 0;
  private circuitOpenedAt: number = 0;

  constructor(config: LinkedInGatewayConfig) {
    if (!config.clientId) {
      throw new Error(
        '[CRITICAL] LINKEDIN_CLIENT_ID is not set. Cannot initialize LinkedIn gateway.',
      );
    }
    if (!config.clientSecret) {
      throw new Error(
        '[CRITICAL] LINKEDIN_CLIENT_SECRET is not set. Cannot initialize LinkedIn gateway.',
      );
    }
    if (!config.redirectUri) {
      throw new Error(
        '[CRITICAL] LINKEDIN_REDIRECT_URI is not set. Cannot initialize LinkedIn gateway.',
      );
    }

    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Builds the LinkedIn OAuth 2.0 authorization URL.
   * The `state` parameter is MANDATORY for CSRF protection.
   */
  getAuthorizationUrl(state: string): string {
    if (!state || state.length === 0) {
      throw new Error('OAuth state parameter is required for CSRF protection.');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: LINKEDIN_SCOPES.join(' '),
    });

    return `${LINKEDIN_AUTH_BASE}/authorization?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access + refresh tokens.
   * Validates LinkedIn's response with a Zod schema at the boundary.
   */
  async exchangeCodeForToken(code: string): Promise<LinkedInTokenResult> {
    // Token exchange bypasses Circuit Breaker — it's a user-initiated
    // action and must always attempt to reach LinkedIn.
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    });

    const response = await this.fetchWithTimeout(
      `${LINKEDIN_AUTH_BASE}/accessToken`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      await this.handleErrorResponse(response, 'exchangeCodeForToken');
    }

    const rawJson: unknown = await response.json();

    const parsed = this.parseWithSchema(
      LinkedInTokenResponseSchema,
      rawJson,
      'LinkedInTokenResponse',
    );

    return {
      accessToken: parsed.access_token,
      expiresIn: parsed.expires_in,
      refreshToken: parsed.refresh_token,
      refreshTokenExpiresIn: parsed.refresh_token_expires_in,
    };
  }

  /**
   * Fetches the authenticated user's LinkedIn profile.
   * Uses the OpenID Connect userinfo endpoint.
   */
  async getUserProfile(accessToken: string): Promise<LinkedInUserProfile> {
    const response = await this.fetchWithTimeout(LINKEDIN_USERINFO_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedError(
        'LinkedIn access token is invalid or expired.',
      );
    }

    if (!response.ok) {
      await this.handleErrorResponse(response, 'getUserProfile');
    }

    const rawJson: unknown = await response.json();

    const parsed = this.parseWithSchema(
      LinkedInProfileResponseSchema,
      rawJson,
      'LinkedInProfileResponse',
    );

    return {
      providerId: parsed.sub,
      name: parsed.name,
      email: parsed.email,
      pictureUrl: parsed.picture,
    };
  }

  /**
   * Fetches recent posts authored by the user.
   * Uses LinkedIn's Posts API (v2/posts) with author filter.
   *
   * CIRCUIT BREAKER: This method is protected by the Circuit Breaker.
   * If LinkedIn has failed 5 times in a row, this method will reject
   * immediately without making an HTTP call.
   */
  async fetchRecentPosts(
    accessToken: string,
    authorUrn: string,
  ): Promise<LinkedInPostSummary[]> {
    // ─── Circuit Breaker Check ───
    this.assertCircuitClosed('fetchRecentPosts');

    const params = new URLSearchParams({
      author: authorUrn,
      q: 'author',
      count: '20',
      sortBy: 'LAST_MODIFIED',
    });

    const url = `${LINKEDIN_API_BASE}/posts?${params.toString()}`;

    let response: Response;
    try {
      response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }, POSTS_TIMEOUT_MS);
    } catch (error: unknown) {
      this.recordFailure();
      throw error;
    }

    // ─── Rate Limit Detection ───
    if (response.status === 429) {
      // Rate limits count as failures for the Circuit Breaker
      this.recordFailure();

      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : undefined;

      throw new RateLimitError(
        'LinkedIn API rate limit exceeded. Please try again later.',
        retryAfterMs,
      );
    }

    if (response.status === 401 || response.status === 403) {
      // Auth errors are NOT circuit breaker failures (it's our token, not LinkedIn)
      throw new UnauthorizedError(
        'LinkedIn access token is invalid or expired.',
      );
    }

    if (!response.ok) {
      // 5xx errors count as failures
      if (response.status >= 500) {
        this.recordFailure();
      }
      await this.handleErrorResponse(response, 'fetchRecentPosts');
    }

    // SUCCESS — reset the circuit breaker
    this.recordSuccess();

    const rawJson: unknown = await response.json();

    const parsed = this.parseWithSchema(
      LinkedInPostsResponseSchema,
      rawJson,
      'LinkedInPostsResponse',
    );

    // Map LinkedIn's complex structure to our simplified domain type
    return parsed.elements.map((post) => {
      const publishedAtMs = post.publishedAt ?? post.created?.time ?? Date.now();
      const imageUrl = post.content?.media?.originalUrl;

      return {
        externalPostId: post.id,
        text: post.commentary,
        imageUrl,
        publishedAt: new Date(publishedAtMs),
      };
    });
  }

  /**
   * Refreshes an expired access token using a refresh token.
   * Uses the same token endpoint but with grant_type=refresh_token.
   */
  async refreshAccessToken(refreshToken: string): Promise<LinkedInTokenResult> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await this.fetchWithTimeout(
      `${LINKEDIN_AUTH_BASE}/accessToken`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      await this.handleErrorResponse(response, 'refreshAccessToken');
    }

    const rawJson: unknown = await response.json();

    const parsed = this.parseWithSchema(
      LinkedInTokenResponseSchema,
      rawJson,
      'LinkedInTokenResponse (refresh)',
    );

    return {
      accessToken: parsed.access_token,
      expiresIn: parsed.expires_in,
      refreshToken: parsed.refresh_token,
      refreshTokenExpiresIn: parsed.refresh_token_expires_in,
    };
  }

  // ----- Circuit Breaker Helpers -----

  /**
   * Checks the current circuit state and rejects if OPEN.
   * If the recovery timeout has elapsed, transitions to HALF_OPEN.
   */
  private assertCircuitClosed(operation: string): void {
    if (this.circuitState === CircuitState.CLOSED) {
      return; // Normal operation
    }

    if (this.circuitState === CircuitState.OPEN) {
      const elapsed = Date.now() - this.circuitOpenedAt;

      if (elapsed >= CB_RECOVERY_TIMEOUT_MS) {
        // Recovery timeout expired — allow ONE test request
        this.circuitState = CircuitState.HALF_OPEN;
        return;
      }

      // Still within recovery period — reject immediately
      throw new GatewayError(
        'LinkedIn API is temporarily unavailable. The system is protecting itself from cascading failures. Please try again later.',
        `Circuit Breaker OPEN for ${operation}. ${Math.ceil((CB_RECOVERY_TIMEOUT_MS - elapsed) / 1000)}s remaining.`,
      );
    }

    // HALF_OPEN — allow the request through (test probe)
  }

  /**
   * Records a successful request.
   * Resets the failure counter and closes the circuit.
   */
  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitState = CircuitState.CLOSED;
  }

  /**
   * Records a failed request.
   * If failures exceed the threshold, opens the circuit.
   */
  private recordFailure(): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= CB_FAILURE_THRESHOLD) {
      this.circuitState = CircuitState.OPEN;
      this.circuitOpenedAt = Date.now();
    }
  }

  // ----- Private Helpers -----

  /**
   * Wraps the native fetch with an AbortController timeout.
   * If the request takes longer than `timeoutMs`, it is aborted.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    customTimeoutMs?: number,
  ): Promise<Response> {
    const timeout = customTimeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GatewayError(
          'LinkedIn API request timed out. Please try again later.',
          `Timeout after ${timeout}ms for ${url}`,
        );
      }

      if (error instanceof TypeError) {
        throw new GatewayError(
          'Unable to reach LinkedIn API. Please try again later.',
          `Network error: ${error.message}`,
        );
      }

      throw new GatewayError(
        'An unexpected error occurred while contacting LinkedIn.',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handles non-OK HTTP responses from LinkedIn.
   * Extracts error details for internal logging but throws
   * a safe GatewayError to the domain.
   */
  private async handleErrorResponse(
    response: Response,
    operation: string,
  ): Promise<never> {
    let upstreamDetails = `HTTP ${response.status} from LinkedIn (${operation})`;

    try {
      const rawBody: unknown = await response.json();
      const errorParsed = LinkedInErrorResponseSchema.safeParse(rawBody);

      if (errorParsed.success) {
        const { error, error_description } = errorParsed.data;
        upstreamDetails += ` — ${error ?? 'unknown'}: ${error_description ?? 'no description'}`;
      }
    } catch {
      // Response body is not JSON — that's fine, we already have the status code.
    }

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedError(
        'LinkedIn rejected the credentials. Please re-authorize.',
      );
    }

    throw new GatewayError(
      'LinkedIn API returned an error. Please try again later.',
      upstreamDetails,
    );
  }

  /**
   * Parses and validates a raw JSON response with a Zod schema.
   * Throws a GatewayError if validation fails (API contract changed).
   */
  private parseWithSchema<T>(
    schema: { parse: (data: unknown) => T },
    data: unknown,
    schemaName: string,
  ): T {
    try {
      return schema.parse(data);
    } catch (error: unknown) {
      const details = error instanceof ZodError
        ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(error);

      throw new GatewayError(
        'LinkedIn API returned an unexpected response format.',
        `${schemaName} validation failed: ${details}`,
      );
    }
  }
}
