// =====================================================
// LinkedBridge — GenerateOAuthUrl Use Case
// =====================================================
// Generates a secure LinkedIn OAuth 2.0 authorization URL
// with a cryptographically random CSRF `state` token.
//
// CSRF Mitigation Flow:
// 1. This use case generates a random `state` token
// 2. The HTTP controller stores it in an HttpOnly cookie
// 3. LinkedIn includes the `state` in the callback redirect
// 4. The controller compares callback `state` with cookie
// 5. Mismatch = CSRF attack → reject the request
// =====================================================

import { randomBytes } from 'node:crypto';

import type { ILinkedInGateway } from '../../domain/gateways/i-linkedin.gateway.js';
import type { GenerateOAuthUrlOutput } from '../dtos/oauth.dto.js';

/**
 * Length of the CSRF state token in bytes.
 * 16 bytes = 32 hex chars = 128 bits of entropy.
 * OWASP recommends at least 128 bits for CSRF tokens.
 */
const STATE_LENGTH_BYTES = 16;

export class GenerateOAuthUrlUseCase {
  constructor(
    private readonly linkedInGateway: ILinkedInGateway,
  ) {}

  /**
   * Generates a LinkedIn OAuth 2.0 authorization URL.
   *
   * @returns The authorization URL and the CSRF state token.
   *          The controller MUST persist the `state` in a secure cookie
   *          before redirecting the user to the `authorizationUrl`.
   */
  execute(): GenerateOAuthUrlOutput {
    // Generate a cryptographically secure random state for CSRF protection.
    // Uses crypto.randomBytes which draws from the OS CSPRNG.
    const state = randomBytes(STATE_LENGTH_BYTES).toString('hex');

    const authorizationUrl = this.linkedInGateway.getAuthorizationUrl(state);

    return {
      authorizationUrl,
      state,
    };
  }
}
