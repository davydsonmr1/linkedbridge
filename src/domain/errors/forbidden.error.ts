// =====================================================
// LinkedBridge — ForbiddenError
// =====================================================
// Thrown when a user attempts an action they do not
// have permission to perform (ownership violation).
//
// Examples:
// - Revoking another user's API key
// - Accessing resources belonging to another user
//
// INFOSEC: Returns HTTP 403 with a generic message
// to prevent information leakage about resource existence.
// =====================================================

import { DomainError } from './domain-error.js';

export class ForbiddenError extends DomainError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(message: string = 'You do not have permission to perform this action.') {
    super(message);
  }
}
