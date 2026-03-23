// =====================================================
// LinkedBridge — IPostCacheRepository Interface
// =====================================================
// Domain contract for cached LinkedIn post persistence.
//
// The worker calls `upsertPosts` every 1 hour.
// The public API calls `getPostsByUserId` on every request.
// =====================================================

import type {
  PostCache,
  UpsertPostCacheInput,
} from '../entities/post-cache.entity.js';

export interface IPostCacheRepository {
  /**
   * Insert or update cached posts for a user.
   * Uses the `[userId, externalPostId]` unique constraint for upsert logic.
   *
   * Called by the 1-hour worker to refresh the cache.
   *
   * @param posts - Array of post data to upsert
   * @returns The upserted post cache entries
   */
  upsertPosts(posts: UpsertPostCacheInput[]): Promise<PostCache[]>;

  /**
   * Retrieve all cached posts for a given user.
   * Ordered by `postedAt` descending (newest first).
   *
   * Called by the public API endpoint consumed by portfolio sites.
   *
   * @param userId - The user's ID
   * @returns Array of cached posts, newest first
   */
  getPostsByUserId(userId: string): Promise<PostCache[]>;
}
