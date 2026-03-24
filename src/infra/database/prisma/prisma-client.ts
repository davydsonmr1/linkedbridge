// =====================================================
// LinkedBridge — Prisma Client Singleton
// =====================================================
// Exports a single, reusable PrismaClient instance.
//
// DEV:  Logs all SQL queries for debugging (level: 'query').
// PROD: Logs only warnings and errors.
//
// IMPORTANT: Never import PrismaClient directly elsewhere.
// Always import `prisma` from this file to guarantee a
// single connection pool across the entire application.
// =====================================================

import { PrismaClient } from '@prisma/client';

const isProduction = process.env['NODE_ENV'] === 'production';

/**
 * Singleton Prisma Client instance.
 *
 * In development, enables `query` logging so every SQL
 * statement is printed to the console for debugging.
 * In production, only `warn` and `error` events are logged
 * to keep output clean and avoid performance overhead.
 */
export const prisma = new PrismaClient({
  log: isProduction
    ? [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : [
        { emit: 'stdout', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
});
