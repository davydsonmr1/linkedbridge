// =====================================================
// LinkedBridge — IUserRepository Interface
// =====================================================
// Domain contract for user persistence.
// Implementations belong in the infra layer.
// =====================================================

import type { CreateUserInput, User } from '../entities/user.entity.js';

export interface IUserRepository {
  /**
   * Find a user by their unique ID.
   * @returns The user or null if not found
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find a user by their email address.
   * @returns The user or null if not found
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Create a new user.
   * @param data - Validated user input
   * @returns The newly created user
   */
  create(data: CreateUserInput): Promise<User>;
}
