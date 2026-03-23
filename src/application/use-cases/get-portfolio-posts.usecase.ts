// =====================================================
// LinkedBridge — GetPortfolioPosts Use Case
// =====================================================
// Retrieves cached LinkedIn posts for a user's portfolio.
//
// DATA MINIMIZATION (Infosec Best Practice):
// The output deliberately omits:
// - Internal UUIDs (our database IDs)
// - User IDs
// - Caching metadata (cachedAt, updatedAt)
//
// Only the minimum data needed by the frontend is returned:
// externalPostId, text, imageUrl, postedAt
//
// This reduces the attack surface — even if the API response
// is intercepted, it reveals nothing about our internal schema.
// =====================================================

import type { IPostCacheRepository } from '../../domain/repositories/i-post-cache.repository.js';

/**
 * A single post formatted for the public API.
 * Contains ONLY what the frontend needs — no internal IDs.
 */
export interface PublicPostOutput {
  /** LinkedIn's post identifier */
  postId: string;
  /** Sanitized post text (HTML-stripped) */
  text: string;
  /** Post image URL (if any) */
  imageUrl: string | null;
  /** When the post was originally published on LinkedIn */
  postedAt: string;
}

/**
 * Output of the GetPortfolioPosts use case.
 */
export interface GetPortfolioPostsOutput {
  posts: PublicPostOutput[];
  total: number;
}

export class GetPortfolioPostsUseCase {
  constructor(
    private readonly postCacheRepository: IPostCacheRepository,
  ) {}

  /**
   * Retrieves cached posts for a user's portfolio.
   *
   * DATA MINIMIZATION: Maps internal PostCache entities to
   * PublicPostOutput, stripping internal IDs and metadata.
   *
   * @param userId - The authenticated user's ID (from API key middleware)
   * @returns Minimized post data for the frontend
   */
  async execute(userId: string): Promise<GetPortfolioPostsOutput> {
    const posts = await this.postCacheRepository.getPostsByUserId(userId);

    // Map to public format — strip internal IDs and metadata
    const publicPosts: PublicPostOutput[] = posts.map((post) => ({
      postId: post.externalPostId,
      text: typeof post.content === 'object' && post.content !== null && 'text' in post.content
        ? String((post.content as Record<string, unknown>)['text'])
        : '',
      imageUrl: post.imageUrl ?? null,
      postedAt: new Date(post.postedAt).toISOString(),
    }));

    return {
      posts: publicPosts,
      total: publicPosts.length,
    };
  }
}
