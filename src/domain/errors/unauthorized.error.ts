// =====================================================
// LinkedBridge — UnauthorizedError
// =====================================================
// Thrown when authentication fails:
// - Invalid API key
// - Missing credentials
// - Revoked API key
//
// INFOSEC: The message is intentionally vague to prevent
// enumeration attacks. It does NOT reveal whether the
// key exists but is revoked, or simply doesn't exist.
// =====================================================

import { DomainError } from './domain-error.js';

export class UnauthorizedError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message: string = 'Authentication required. Please provide valid credentials.') {
    super(message);
  }
}
