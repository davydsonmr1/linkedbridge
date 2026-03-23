// =====================================================
// LinkedBridge — LinkedIn API Response Zod Schemas
// =====================================================
// Boundary validation: we NEVER trust raw JSON from
// external APIs. These schemas validate and transform
// LinkedIn's responses before they enter our domain.
//
// If LinkedIn changes their API response format, these
// schemas will catch it immediately with a clear error
// instead of letting corrupted data propagate.
// =====================================================

import { z } from 'zod';

/**
 * Validates LinkedIn's OAuth 2.0 token exchange response.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 *
 * Expected response shape:
 * {
 *   "access_token": "...",
 *   "expires_in": 5184000,
 *   "refresh_token": "...",           // optional
 *   "refresh_token_expires_in": ...   // optional
 * }
 */
export const LinkedInTokenResponseSchema = z.object({
  access_token: z
    .string()
    .min(1, 'LinkedIn returned an empty access_token'),
  expires_in: z
    .number()
    .int()
    .positive('expires_in must be a positive integer'),
  refresh_token: z
    .string()
    .optional(),
  refresh_token_expires_in: z
    .number()
    .int()
    .positive()
    .optional(),
});

export type LinkedInTokenResponse = z.infer<typeof LinkedInTokenResponseSchema>;

/**
 * Validates LinkedIn's UserInfo endpoint response.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
 *
 * Uses the OpenID Connect userinfo endpoint which returns:
 * {
 *   "sub": "...",
 *   "name": "...",
 *   "email": "...",
 *   "email_verified": true,
 *   "picture": "..."   // optional
 * }
 */
export const LinkedInProfileResponseSchema = z.object({
  sub: z
    .string()
    .min(1, 'LinkedIn returned an empty sub (provider ID)'),
  name: z
    .string()
    .min(1, 'LinkedIn returned an empty name'),
  email: z
    .string()
    .email('LinkedIn returned an invalid email'),
  email_verified: z
    .boolean()
    .optional(),
  picture: z
    .string()
    .url()
    .optional(),
});

export type LinkedInProfileResponse = z.infer<typeof LinkedInProfileResponseSchema>;

/**
 * Validates a LinkedIn API error response body.
 * Used for structured error logging (internal only).
 */
export const LinkedInErrorResponseSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
}).passthrough();

export type LinkedInErrorResponse = z.infer<typeof LinkedInErrorResponseSchema>;
