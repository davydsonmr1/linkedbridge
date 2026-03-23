// =====================================================
// LinkedBridge — SyncAllUsers Use Case
// =====================================================
// Orchestrates the mass synchronization of ALL users'
// LinkedIn posts. Designed to be called by a cron worker.
//
// RESILIENCE RULES:
// 1. NEVER use Promise.all — it would DDoS LinkedIn's API
// 2. Process users sequentially with throttling delay
// 3. If one user fails, LOG the error and CONTINUE
// 4. Respect LinkedIn's rate limits (500ms delay between)
//
// FUTURE IMPROVEMENT:
// If the user base grows beyond ~200 users, consider
// processing in batches of 10 with p-limit or similar.
// =====================================================

import type { IUserRepository } from '../../domain/repositories/i-user.repository.js';
import type { IOAuthCredentialRepository } from '../../domain/repositories/i-oauth-credential.repository.js';
import type { SyncUserPostsUseCase, SyncUserPostsOutput } from './sync-user-posts.usecase.js';

/**
 * Delay between processing each user in milliseconds.
 * 500ms provides a safe buffer against LinkedIn's rate limits.
 */
const THROTTLE_DELAY_MS = 500;

/**
 * Summary of the mass synchronization operation.
 */
export interface SyncAllUsersOutput {
  totalUsers: number;
  successCount: number;
  failureCount: number;
  results: SyncUserResult[];
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

export interface SyncUserResult {
  userId: string;
  success: boolean;
  postsCount?: number;
  tokenRefreshed?: boolean;
  error?: string;
}

export class SyncAllUsersUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly oauthCredentialRepository: IOAuthCredentialRepository,
    private readonly syncUserPostsUseCase: SyncUserPostsUseCase,
  ) {}

  /**
   * Synchronizes posts for ALL users with valid OAuth credentials.
   *
   * This method:
   * 1. Fetches all users with active OAuth credentials
   * 2. Iterates sequentially (NOT in parallel) to avoid DDoS
   * 3. Adds a 500ms delay between each user (rate limit protection)
   * 4. Catches errors per-user — one failure doesn't stop others
   *
   * @returns Summary with success/failure counts and per-user results
   */
  async execute(): Promise<SyncAllUsersOutput> {
    const startedAt = new Date();
    const results: SyncUserResult[] = [];

    // ─── Step 1: Get all users with OAuth credentials ───
    // We query credentials rather than users, because only users
    // with linked LinkedIn accounts need synchronization.
    const credentials = await this.oauthCredentialRepository.findAllActive();

    // ─── Step 2: Process each user sequentially ───
    // IMPORTANT: We do NOT use Promise.all here. Processing
    // 100 users simultaneously would trigger LinkedIn's rate
    // limiter and potentially get our app banned.
    for (const credential of credentials) {
      const userId = credential.userId;

      try {
        const syncResult: SyncUserPostsOutput = await this.syncUserPostsUseCase.execute(userId);

        results.push({
          userId,
          success: true,
          postsCount: syncResult.postsCount,
          tokenRefreshed: syncResult.tokenRefreshed,
        });
      } catch (error: unknown) {
        // ─── Per-user error isolation ───
        // If User A's sync fails (expired token, network error,
        // rate limit, etc.), we log the error and CONTINUE to
        // User B. The worker must be resilient.
        const errorMessage = error instanceof Error
          ? error.message
          : 'Unknown error';

        results.push({
          userId,
          success: false,
          error: errorMessage,
        });
      }

      // ─── Step 3: Throttle between users ───
      // Wait 500ms before processing the next user to stay
      // well within LinkedIn's rate limits.
      if (credentials.indexOf(credential) < credentials.length - 1) {
        await this.delay(THROTTLE_DELAY_MS);
      }
    }

    const finishedAt = new Date();

    return {
      totalUsers: credentials.length,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      results,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  }

  /**
   * Simple async delay utility.
   * Extracted as a method for easier testing/mocking.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
