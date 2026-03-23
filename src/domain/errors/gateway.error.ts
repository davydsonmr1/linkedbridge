// =====================================================
// LinkedBridge — GatewayError
// =====================================================
// Thrown when an external service (e.g., LinkedIn API)
// returns an unexpected or error response.
//
// INFOSEC: The raw error body from the external service
// is stored internally for logging but NEVER exposed
// to the client via toJSON().
// =====================================================

import { DomainError } from './domain-error.js';

export class GatewayError extends DomainError {
  readonly statusCode = 502;
  readonly code = 'GATEWAY_ERROR';

  /**
   * Raw upstream error details — for internal logging ONLY.
   * Never serialized to client responses.
   */
  readonly upstreamDetails: string | undefined;

  constructor(
    message: string = 'An error occurred while communicating with an external service.',
    upstreamDetails?: string,
  ) {
    super(message);
    this.upstreamDetails = upstreamDetails;
  }
}
