// =====================================================
// LinkedBridge — Fastify Application Factory
// =====================================================
// Creates and configures the Fastify instance with all
// security plugins. This file is framework-specific but
// isolated from business logic.
//
// Security Plugins:
// - @fastify/helmet: HTTP security headers (HSTS, CSP, etc.)
// - @fastify/cookie: HttpOnly cookie support (OAuth state + JWT session)
// - @fastify/cors: Cross-Origin Resource Sharing
// - @fastify/rate-limit: Brute-force / DDoS protection
// - @fastify/jwt: JWT signing and verification (SaaS sessions)
//
// Observability:
// - Pino logger with `redact` for PII/token masking
// =====================================================

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import { globalErrorHandler } from './error-handler.js';

// ─── PII / Token fields to NEVER log ───
// Pino's `redact` option replaces the value of matching
// paths with "[REDACTED]" before writing to the log stream.
// This protects against accidental PII leakage in production.
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'accessToken',
  'refreshToken',
  'encryptedAccessToken',
  'email',
  'password',
  'secret',
  'token',
  'iv',
  'authTag',
];

/**
 * Name of the HttpOnly cookie that stores the SaaS session JWT.
 * The `__Host-` prefix enforces:
 * - Must be Secure (HTTPS only)
 * - Must not have a Domain attribute
 * - Path must be /
 */
const SESSION_COOKIE_NAME = '__Host-saas_session';

export async function buildApp(): Promise<FastifyInstance> {
  const isProduction = process.env['NODE_ENV'] === 'production';

  const app = Fastify({
    logger: {
      level: isProduction ? 'info' : 'debug',
      ...(!isProduction && { transport: { target: 'pino-pretty' } }),
      // INFOSEC: Redact PII and tokens from ALL log output.
      // This applies to the entire log pipeline — any object
      // logged via request.log, app.log, or Pino directly
      // will have matching keys replaced with "[REDACTED]".
      redact: {
        paths: REDACTED_PATHS,
        censor: '[REDACTED]',
      },
    },
    disableRequestLogging: false,
  });

  // ─── Security Headers (Helmet) ───
  // Injects: HSTS, X-Content-Type-Options: nosniff,
  // X-Frame-Options: DENY, CSP, Referrer-Policy, etc.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // HSTS: max-age 1 year, includeSubDomains, preload
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // ─── Cookies (OAuth State / CSRF + JWT Session) ───
  const cookieSecret = process.env['COOKIE_SECRET'];
  await app.register(fastifyCookie, {
    ...(cookieSecret ? { secret: cookieSecret } : {}),
  });

  // ─── JWT (SaaS Session Authentication) ───
  // Used to sign and verify JWTs stored in the `__Host-saas_session` cookie.
  // The @fastify/jwt plugin decorates `app.jwt`, `request.jwtVerify()`,
  // and `reply.jwtSign()` onto Fastify's instance.
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('[CRITICAL] JWT_SECRET is not set. Cannot initialize JWT authentication.');
  }

  await app.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: SESSION_COOKIE_NAME,
      signed: false,
    },
    sign: {
      expiresIn: '7d',
    },
  });

  // ─── CORS (Public API + SaaS Dashboard) ───
  // Allow any origin for portfolio API routes (diverse domains).
  // Dashboard routes share the same origin as the frontend.
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
  await app.register(fastifyCors, {
    origin: [frontendUrl, true],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['X-API-KEY', 'Content-Type', 'Accept'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400, // Preflight cache: 24 hours
  });

  // ─── Rate Limiting (DDoS / Brute-Force Protection) ───
  // 100 requests per minute per IP address
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. You can retry in ${context.after}.`,
      },
    }),
  });

  // ─── Global Error Handler ───
  app.setErrorHandler((error, request, reply) => globalErrorHandler(error as Error, request, reply));

  // ─── Health Check ───
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
