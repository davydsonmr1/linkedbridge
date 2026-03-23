// =====================================================
// LinkedBridge — Base Domain Error
// =====================================================
// All domain errors extend this base class.
// It provides a consistent structure with:
// - HTTP status code mapping
// - Error code for programmatic handling
// - Safe message (never leaks internal details)
// =====================================================

export abstract class DomainError extends Error {
  /**
   * HTTP status code to return in the API response.
   */
  abstract readonly statusCode: number;

  /**
   * Machine-readable error code for client-side handling.
   * Example: "UNAUTHORIZED", "TOKEN_EXPIRED", "RESOURCE_NOT_FOUND"
   */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    // Restore prototype chain (required for extending built-in Error)
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a safe, serializable representation of the error.
   * INFOSEC: Never includes stack traces or internal details.
   */
  toJSON(): { error: { code: string; message: string } } {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}
