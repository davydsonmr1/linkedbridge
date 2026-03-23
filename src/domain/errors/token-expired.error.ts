// =====================================================
// LinkedBridge — TokenExpiredError
// =====================================================
// Thrown when:
// - The OAuth access token has expired and needs refresh
// - The refresh token itself has expired (re-auth required)
//
// INFOSEC: Does not reveal which provider or any token
// details in the error message.
// =====================================================

import { DomainError } from './domain-error.js';

export class TokenExpiredError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'TOKEN_EXPIRED';

  constructor(message: string = 'The access token has expired. Re-authorization is required.') {
    super(message);
  }
}
