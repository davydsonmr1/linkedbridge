// =====================================================
// LinkedBridge — Global Error Handler
// =====================================================
// Centralized error handling for ALL Fastify routes.
//
// INFOSEC RULES:
// 1. DomainErrors → map to correct HTTP status + safe JSON
// 2. ZodError → 422 with field-level validation messages
// 3. Unknown errors → 500 with GENERIC message only
// 4. NEVER leak stack traces, DB errors, or internal paths
// 5. ALWAYS log the full error internally for debugging
// =====================================================

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { DomainError } from '../../domain/errors/index.js';

export function globalErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // ─── Case 1: Domain Errors (our custom errors) ───
  // These have a known statusCode and safe message.
  if (error instanceof DomainError) {
    request.log.warn(
      { err: error, code: error.code },
      `[DomainError] ${error.code}: ${error.message}`,
    );

    void reply.status(error.statusCode).send(error.toJSON());
    return;
  }

  // ─── Case 2: Zod Validation Errors ───
  // Input validation failures — return field-level details.
  if (error instanceof ZodError) {
    request.log.warn(
      { err: error },
      '[ValidationError] Request validation failed',
    );

    void reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // ─── Case 3: Fastify Rate Limit Error ───
  // Already handled by the rate-limit plugin's errorResponseBuilder,
  // but just in case:
  if ('statusCode' in error && error.statusCode === 429) {
    void reply.status(429).send({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
      },
    });
    return;
  }

  // ─── Case 4: Unknown / Unexpected Errors ───
  // INFOSEC: Log the FULL error internally but return NOTHING
  // specific to the client. No stack traces, no DB messages,
  // no internal paths.
  request.log.error(
    { err: error, stack: error.stack },
    '[UnhandledError] An unexpected error occurred',
  );

  void reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  });
}
