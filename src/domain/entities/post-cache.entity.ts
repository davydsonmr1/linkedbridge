// =====================================================
// LinkedBridge — PostCache Entity
// =====================================================
// Represents a cached LinkedIn post served to portfolio
// sites via the public API.
//
// The worker updates these records every 1 hour.
// The `content` field is a JSON object containing the
// post payload from LinkedIn's API.
// =====================================================

import { z } from 'zod';

// ----- Zod Schemas -----

/** Schema for upserting a cached post (worker input) */
export const UpsertPostCacheSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  externalPostId: z.string().min(1, 'External post ID is required').max(255),
  content: z.record(z.unknown()).or(z.array(z.unknown())),
  imageUrl: z
    .string()
    .url('Image URL must be a valid URL')
    .nullable()
    .optional(),
  postedAt: z.coerce.date(),
});

/** Schema for the full persisted entity */
export const PostCacheSchema = UpsertPostCacheSchema.extend({
  id: z.string().uuid('Invalid post cache ID format'),
  cachedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ----- TypeScript Types -----

export type UpsertPostCacheInput = z.infer<typeof UpsertPostCacheSchema>;
export type PostCache = z.infer<typeof PostCacheSchema>;

// ----- Domain Logic -----

/**
 * Default cache TTL: 1 hour (in milliseconds).
 * Used by the worker to determine when to refresh posts.
 */
export const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Checks if a cached post is stale and needs refreshing.
 *
 * @param post - The cached post to check
 * @param ttlMs - Time-to-live in milliseconds (default: 1 hour)
 * @returns true if the post was cached longer ago than the TTL
 */
export function isCacheStale(
  post: PostCache,
  ttlMs: number = CACHE_TTL_MS,
): boolean {
  const now = Date.now();
  const cachedAtMs = new Date(post.cachedAt).getTime();

  return now - cachedAtMs >= ttlMs;
}
