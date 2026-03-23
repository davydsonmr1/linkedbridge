// =====================================================
// LinkedBridge — LinkedIn OAuth 2.0 Gateway
// =====================================================
// Infrastructure implementation of ILinkedInGateway.
// Anti-Corruption Layer: isolates LinkedIn API details
// from the domain.
//
// Security Features:
// - AbortController timeout on all HTTP calls (8s)
// - Zod boundary validation on all responses
// - Never leaks raw LinkedIn errors to the domain
// - Constructor DI for all config (no loose process.env)
// =====================================================

import { ZodError } from 'zod';

import type {
  ILinkedInGateway,
  LinkedInTokenResult,
  LinkedInUserProfile,
} from '../../../domain/gateways/i-linkedin.gateway.js';
import { GatewayError } from '../../../domain/errors/gateway.error.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';

import {
  LinkedInTokenResponseSchema,
  LinkedInProfileResponseSchema,
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

  // ----- Private Helpers -----

  /**
   * Wraps the native fetch with an AbortController timeout.
   * If the request takes longer than `timeoutMs`, it is aborted.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

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
          `Timeout after ${this.timeoutMs}ms for ${url}`,
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
