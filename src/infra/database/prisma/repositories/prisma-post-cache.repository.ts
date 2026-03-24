// =====================================================
// LinkedBridge — Prisma Post Cache Repository
// =====================================================
// Concrete implementation of IPostCacheRepository.
//
// TRANSACTION STRATEGY:
// `upsertPosts` wraps all individual upserts inside
// `prisma.$transaction` to guarantee atomicity — either
// all posts are cached or none are (no partial updates).
//
// The upsert key is the composite unique constraint
// `[userId, externalPostId]` defined in the Prisma schema.
// =====================================================

import type { PrismaClient, PostCache as PrismaPostCache } from '@prisma/client';
import type { IPostCacheRepository } from '../../../../domain/repositories/i-post-cache.repository.js';
import type {
  PostCache,
  UpsertPostCacheInput,
} from '../../../../domain/entities/post-cache.entity.js';
import type { InputJsonValue } from '@prisma/client/runtime/library';

// ─── Data Mapper ───

/**
 * Maps a Prisma PostCache record to the Domain entity.
 * The `content` JSON field is cast to the domain type.
 */
function toDomainEntity(record: PrismaPostCache): PostCache {
  return {
    id: record.id,
    userId: record.userId,
    externalPostId: record.externalPostId,
    content: record.content as Record<string, unknown>,
    imageUrl: record.imageUrl ?? null,
    postedAt: record.postedAt,
    cachedAt: record.cachedAt,
    updatedAt: record.updatedAt,
  };
}

// ─── Repository Implementation ───

export class PrismaPostCacheRepository implements IPostCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertPosts(posts: UpsertPostCacheInput[]): Promise<PostCache[]> {
    if (posts.length === 0) {
      return [];
    }

    // Build individual upsert operations keyed on the
    // composite unique constraint [userId, externalPostId].
    const upsertOperations = posts.map((post) =>
      this.prisma.postCache.upsert({
        where: {
          userId_externalPostId: {
            userId: post.userId,
            externalPostId: post.externalPostId,
          },
        },
        create: {
          userId: post.userId,
          externalPostId: post.externalPostId,
          content: post.content as InputJsonValue,
          imageUrl: post.imageUrl ?? null,
          postedAt: post.postedAt,
        },
        update: {
          content: post.content as InputJsonValue,
          imageUrl: post.imageUrl ?? null,
          postedAt: post.postedAt,
        },
      }),
    );

    // Execute all upserts atomically within a single transaction.
    // If any single upsert fails, the entire batch is rolled back.
    const records = await this.prisma.$transaction(upsertOperations);

    return records.map(toDomainEntity);
  }

  async getPostsByUserId(userId: string): Promise<PostCache[]> {
    const records = await this.prisma.postCache.findMany({
      where: { userId },
      orderBy: { postedAt: 'desc' },
    });

    return records.map(toDomainEntity);
  }
}
