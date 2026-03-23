// =====================================================
// LinkedBridge — ILinkedInGateway Interface
// =====================================================
// Domain-level contract for the LinkedIn OAuth 2.0 flow.
// Acts as an Anti-Corruption Layer: the domain knows
// NOTHING about LinkedIn's HTTP API, response formats,
// or endpoint URLs.
// =====================================================

/**
 * Result of exchanging an authorization code for tokens.
 */
export interface LinkedInTokenResult {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string | undefined;
  refreshTokenExpiresIn?: number | undefined;
}

/**
 * Minimal user profile from LinkedIn.
 */
export interface LinkedInUserProfile {
  providerId: string;
  name: string;
  email: string;
  pictureUrl?: string | undefined;
}

/**
 * A simplified post representation returned by the gateway.
 * Stripped of all LinkedIn-specific nesting.
 */
export interface LinkedInPostSummary {
  externalPostId: string;
  text: string;
  imageUrl?: string | undefined;
  publishedAt: Date;
}

/**
 * Domain gateway interface for LinkedIn OAuth 2.0.
 *
 * Implementations MUST:
 * - Use timeouts on all HTTP calls (DoS protection)
 * - Validate responses at the boundary (Zod schemas)
 * - Never leak raw LinkedIn error bodies to the domain
 */
export interface ILinkedInGateway {
  /**
   * Build the LinkedIn OAuth 2.0 authorization URL.
   *
   * @param state - CSRF protection token (must be validated on callback)
   * @returns The full authorization URL to redirect the user to
   */
  getAuthorizationUrl(state: string): string;

  /**
   * Exchange an authorization code for access + refresh tokens.
   *
   * @param code - The authorization code from LinkedIn's callback
   * @returns Token data (access token, expiry, optional refresh token)
   * @throws GatewayError if LinkedIn returns an error
   */
  exchangeCodeForToken(code: string): Promise<LinkedInTokenResult>;

  /**
   * Fetch the authenticated user's LinkedIn profile.
   *
   * @param accessToken - A valid LinkedIn access token
   * @returns Minimal profile data (id, name, email)
   * @throws GatewayError if LinkedIn returns an error
   * @throws UnauthorizedError if the token is invalid/expired
   */
  getUserProfile(accessToken: string): Promise<LinkedInUserProfile>;

  /**
   * Fetch recent posts authored by the user.
   *
   * @param accessToken - A valid LinkedIn access token
   * @param authorUrn - The user's LinkedIn URN (e.g., "urn:li:person:xxxxx")
   * @returns Array of simplified post summaries
   * @throws GatewayError if LinkedIn returns an error
   * @throws RateLimitError if LinkedIn returns HTTP 429
   */
  fetchRecentPosts(accessToken: string, authorUrn: string): Promise<LinkedInPostSummary[]>;

  /**
   * Refresh an expired access token using a refresh token.
   *
   * @param refreshToken - A valid LinkedIn refresh token
   * @returns New token data (fresh access token + expiry)
   * @throws GatewayError if LinkedIn rejects the refresh token
   */
  refreshAccessToken(refreshToken: string): Promise<LinkedInTokenResult>;
}
