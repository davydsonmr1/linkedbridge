// =====================================================
// LinkedBridge — OAuth DTOs (Data Transfer Objects)
// =====================================================
// Application-layer DTOs for the OAuth authentication flow.
// These define the shape of data flowing in and out of
// the use cases — decoupled from HTTP request/response.
// =====================================================

import { z } from 'zod';

// ----- Generate OAuth URL -----

/** Output from the GenerateOAuthUrl use case */
export interface GenerateOAuthUrlOutput {
  /**
   * Full LinkedIn authorization URL to redirect the user to.
   */
  authorizationUrl: string;

  /**
   * CSRF state token. The controller MUST store this in
   * an HttpOnly, Secure, SameSite=Lax cookie so it can
   * be validated when LinkedIn redirects back.
   */
  state: string;
}

// ----- Process OAuth Callback -----

/**
 * Input validation for the OAuth callback.
 *
 * Security:
 * - `code` is LinkedIn's authorization code (short-lived, single-use)
 * - `state` is the CSRF token from the cookie — the controller must
 *   compare it with the one stored before calling this use case
 */
export const ProcessOAuthCallbackInputSchema = z.object({
  code: z
    .string()
    .min(1, 'Authorization code is required'),
  state: z
    .string()
    .min(1, 'CSRF state token is required'),
});

export type ProcessOAuthCallbackInput = z.infer<typeof ProcessOAuthCallbackInputSchema>;

/**
 * Output from the ProcessOAuthCallback use case.
 *
 * INFOSEC: This NEVER contains the access token, refresh token,
 * or any cryptographic material. Only safe user identity data.
 */
export interface ProcessOAuthCallbackOutput {
  /** The user's internal ID (UUID) */
  userId: string;
  /** The user's email */
  email: string;
  /** The user's display name */
  name: string;
  /** Whether this was a new user registration or an existing login */
  isNewUser: boolean;
}
