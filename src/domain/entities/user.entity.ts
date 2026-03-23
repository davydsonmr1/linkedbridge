// =====================================================
// LinkedBridge — User Entity
// =====================================================
// Pure domain entity — no framework imports.
// Zod schema enforces email format, name length, etc.
// =====================================================

import { z } from 'zod';

// ----- Zod Schemas -----

/** Schema for creating a new user (input validation) */
export const CreateUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(320, 'Email must not exceed 320 characters')
    .transform((v) => v.toLowerCase().trim()),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must not exceed 255 characters')
    .transform((v) => v.trim()),
});

/** Schema for a persisted user (full entity from database) */
export const UserSchema = CreateUserSchema.extend({
  id: z.string().uuid('Invalid user ID format'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ----- TypeScript Types (inferred from Zod) -----

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type User = z.infer<typeof UserSchema>;
