// =====================================================
// LinkedBridge — Require Auth Middleware (JWT Session)
// =====================================================
// Protects SaaS dashboard routes with JWT-based
// session authentication.
//
// The JWT is stored in an HttpOnly cookie named
// `__Host-saas_session`, set during the OAuth callback.
//
// INFOSEC:
// - `__Host-` prefix enforces Secure + Path=/ + no Domain
// - HttpOnly prevents JavaScript access (XSS mitigation)
// - SameSite=Strict prevents CSRF on dashboard routes
// - Token expiry is validated by @fastify/jwt automatically
// =====================================================

import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Cookie name for the SaaS session JWT.
 * The `__Host-` prefix is the strictest cookie security level:
 * - Must be Secure (HTTPS only)
 * - Must not have a Domain attribute
 * - Path must be /
 */
const SESSION_COOKIE_NAME = '__Host-saas_session';

// Extend Fastify's type system so `request.user` contains our JWT payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

/**
 * Fastify preHandler hook that validates the SaaS session JWT.
 *
 * Flow:
 * 1. Extract JWT from the `__Host-saas_session` cookie
 * 2. Verify signature + expiry via @fastify/jwt
 * 3. Inject `request.user.sub` (userId) for downstream handlers
 * 4. Reject with 401 if missing/invalid/expired
 */
export async function requireAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];

  if (!token) {
    request.log.warn('[RequireAuth] Missing session cookie');
    void reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in.',
      },
    });
    return;
  }

  try {
    // @fastify/jwt verifies signature, expiry, and decodes the payload.
    // The decoded payload is automatically set on `request.user`.
    await request.jwtVerify({ onlyCookie: true });
  } catch (error: unknown) {
    request.log.warn(
      { err: error },
      '[RequireAuth] Invalid or expired session token',
    );
    void reply.status(401).send({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.',
      },
    });
    return;
  }
}
