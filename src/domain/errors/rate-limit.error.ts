// =====================================================
// LinkedBridge — RateLimitError
// =====================================================
// Thrown when an external service (e.g., LinkedIn API)
// returns HTTP 429 Too Many Requests.
//
// Contains a `retryAfterMs` hint so the caller can
// back off appropriately.
// =====================================================

import { DomainError } from './domain-error.js';

export class RateLimitError extends DomainError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMIT_EXCEEDED';

  /**
   * Suggested wait time in milliseconds before retrying.
   * Derived from the upstream Retry-After header if available.
   */
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string = 'Rate limit exceeded. Please try again later.',
    retryAfterMs?: number,
  ) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}
