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

// =====================================================
// LinkedIn Posts / UGC Response Schemas
// =====================================================
// LinkedIn's posts API returns deeply nested structures.
// These schemas are deliberately flexible for optional
// fields (images, media) but strict for required ones
// (post ID, text, timestamps).
// =====================================================

/**
 * A single media element within a post (image, video, etc.)
 * Nullable/optional — not all posts have media.
 */
const LinkedInMediaSchema = z.object({
  status: z.string().optional(),
  originalUrl: z.string().url().optional(),
  description: z.object({
    text: z.string().optional(),
  }).optional(),
}).passthrough();

/**
 * A single post element from LinkedIn's API.
 *
 * LinkedIn's posts API (v2/posts or v2/ugcPosts) returns structures like:
 * {
 *   "id": "urn:li:share:123456",
 *   "commentary": "Post text...",
 *   "publishedAt": 1679000000000,  // Unix ms
 *   "content": { ... media ... },
 *   ...
 * }
 *
 * We use .passthrough() to accept additional fields we don't map.
 */
export const LinkedInPostElementSchema = z.object({
  id: z
    .string()
    .min(1, 'Post must have an ID'),
  commentary: z
    .string()
    .optional()
    .default(''),
  publishedAt: z
    .number()
    .int()
    .optional(),
  created: z.object({
    time: z.number().int().optional(),
  }).optional(),
  content: z.object({
    media: LinkedInMediaSchema.optional(),
    multiImage: z.object({
      images: z.array(z.object({
        id: z.string().optional(),
        altText: z.string().optional(),
      })).optional(),
    }).optional(),
  }).optional(),
  lifecycleState: z
    .string()
    .optional(),
}).passthrough();

export type LinkedInPostElement = z.infer<typeof LinkedInPostElementSchema>;

/**
 * Top-level response from LinkedIn's posts list endpoint.
 * The `elements` array contains the actual posts.
 */
export const LinkedInPostsResponseSchema = z.object({
  elements: z.array(LinkedInPostElementSchema),
  paging: z.object({
    count: z.number().int().optional(),
    start: z.number().int().optional(),
    total: z.number().int().optional(),
  }).optional(),
}).passthrough();

export type LinkedInPostsResponse = z.infer<typeof LinkedInPostsResponseSchema>;
