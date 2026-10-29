import argon2 from 'argon2';

import {ForbiddenError, NotFoundError} from '@/http/errors.js';

import type {DoctorProfileInput} from './profile.repository.js';
import * as profileRepository from './profile.repository.js';
import * as usersRepository from './users.repository.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './users.schema.js';
import type {User, UserRole} from './users.types.js';

/**
 * Business rules for users. Knows nothing about HTTP (no req/res), and writes
 * no SQL - it composes repository calls and owns the decisions around them.
 */

/**
 * argon2id parameters.
 *
 * argon2id is the current OWASP first recommendation: it resists both GPU
 * cracking (memory-hard) and side-channel attacks. These settings follow the
 * OWASP minimum of 19 MiB memory / 2 iterations, which lands around 50-100ms
 * per hash on typical server hardware - slow enough to make offline cracking
 * expensive, fast enough not to be a self-inflicted DoS on the login route.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    /* argon2.verify throws on a malformed/corrupt hash rather than returning
       false. That is a failed authentication, not a 500. */
    return false;
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);

  /* The unique index is what actually prevents duplicates - a
     "check then insert" would race between the two statements. The 23505 from
     a concurrent insert is translated into a 409 by the repository. */
  return usersRepository.create({
    email: input.email,
    passwordHash,
    fullName: input.fullName,
    /* Hardcoded, not taken from input: the registration schema has no `role`
       field precisely so this cannot be influenced by the request. Creating a
       doctor or admin is an admin-only PATCH after the fact. */
    role: 'patient',
  });
}

export async function getUserById(id: string): Promise<User> {
  const user = await usersRepository.findById(id);

  if (user === null) {
    throw new NotFoundError('User');
  }

  return user;
}

export interface ListUsersResult {
  users: User[];
  total: number;
  limit: number;
  offset: number;
}

export async function listUsers(
  queryParams: ListUsersQuery,
): Promise<ListUsersResult> {
  /* Offset pagination is the right call at this size: it is simple, supports
     jumping to a page, and the dataset is small. It degrades on very large
     offsets (Postgres still walks the skipped rows), so revisit with keyset
     pagination if the table ever reaches six figures. */
  const [users, total] = await Promise.all([
    usersRepository.list({
      role: queryParams.role,
      limit: queryParams.limit,
      offset: queryParams.offset,
    }),
    usersRepository.count(queryParams.role),
  ]);

  return {
    users,
    total,
    limit: queryParams.limit,
    offset: queryParams.offset,
  };
}

/**
 * Updates a user.
 *
 * `actor` is the authenticated user making the request. It is required because
 * route-level guards can only answer "may this person touch this record?" -
 * they cannot answer "may this person change THIS FIELD?". Without the check
 * below, a patient editing their own profile (which they are allowed to do)
 * could set `role: 'admin'` and escalate. Field-level authorization belongs in
 * the service, next to the rule it enforces.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: {id: string; role: UserRole},
): Promise<User> {
  if (input.role !== undefined && actor.role !== 'admin') {
    throw new ForbiddenError('Only an administrator can change a user role.');
  }

  const updated = await usersRepository.update(id, input);

  if (updated === null) {
    throw new NotFoundError('User');
  }

  return updated;
}

export async function deleteUser(userId: string): Promise<void> {
  const deleted = await usersRepository.softDelete(userId);

  if (!deleted) {
    throw new NotFoundError('User');
  }
}

export async function getDoctorProfile(userId: string) {
  return profileRepository.getDoctorProfile(userId);
}

export async function updateDoctorProfile(
  userId: string,
  input: Omit<DoctorProfileInput, 'userId'>,
) {
  // Pass the raw input directly to the repository for now
  // In a real app we'd map this input carefully to the repository type
  return profileRepository.upsertDoctorProfile({
    userId,
    ...input,
  });
}

export async function getSpecialties() {
  return profileRepository.getSpecialties();
}
