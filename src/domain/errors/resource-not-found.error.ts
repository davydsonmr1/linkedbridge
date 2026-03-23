// =====================================================
// LinkedBridge — ResourceNotFoundError
// =====================================================
// Thrown when a requested resource does not exist.
//
// INFOSEC: The message does NOT reveal database table
// names, query details, or internal IDs. It provides
// only a generic resource type hint.
// =====================================================

import { DomainError } from './domain-error.js';

export class ResourceNotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resourceType: string = 'Resource') {
    super(`${resourceType} not found.`);
  }
}
