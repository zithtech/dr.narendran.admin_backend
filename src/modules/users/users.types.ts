/**
 * Types for the `users` table.
 *
 * These live next to the repository that owns the table, not in a shared
 * `types/` dump, so renaming a column has a one-directory blast radius.
 *
 * The split between `UserRow` and `User` is deliberate and load-bearing:
 * `UserRow` can carry `passwordHash`, `User` cannot. A controller that
 * accidentally returns a `User` therefore cannot leak a password hash, because
 * the type simply has no such field.
 */

export const USER_ROLES = ['doctor', 'patient', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** The public shape - safe to serialise into an HTTP response. */
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A row including the password hash. Returned ONLY by
 * `findByEmailWithPassword`, used ONLY by the auth service, and never returned
 * from a controller.
 */
export interface UserWithPassword extends User {
  passwordHash: string;
  tokenVersion: number;
}

/**
 * The minimum needed to authorize a request: read on every authenticated call
 * by `requireAuth` to confirm the token has not been revoked and the account
 * still exists. Deliberately narrow - no password hash, no timestamps.
 */
export interface UserAuthContext {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
}

/**
 * Fields are `?: T | undefined` rather than plain `?: T` because
 * `exactOptionalPropertyTypes` is on: that distinguishes "key absent" from
 * "key present but undefined", and callers forward optional values straight
 * through from a parsed request body. Spelling out `| undefined` is what lets
 * `{email: undefined}` be passed without a cast, which the COALESCE-based
 * UPDATE in the repository treats as "leave this column alone".
 */
export interface UpdateUserData {
  email?: string | undefined;
  fullName?: string | undefined;
  role?: UserRole | undefined;
}

export interface ListUsersFilter {
  role?: UserRole | undefined;
  limit: number;
  offset: number;
}
