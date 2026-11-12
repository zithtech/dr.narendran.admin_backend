import { mapDatabaseError } from '@/db/errors.js';
import { query, queryOne } from '@/db/query.js';

import type {
  CreateUserData,
  ListUsersFilter,
  UpdateUserData,
  User,
  UserAuthContext,
  UserWithPassword,
  UserRole,
} from './users.types.js';

/**
 * Data access for the `user_accounts` table.
 */
const USER_COLUMNS = `
  id,
  username   AS "email",
  username   AS "fullName",
  role,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

/** Human messages for constraint violations, used by mapDatabaseError. */
const CONSTRAINT_MESSAGES = {
  user_accounts_username_key: 'That username/email is already registered.',
} as const;

export async function create(data: CreateUserData): Promise<User> {
  try {
    const row = await queryOne<User>(
      `INSERT INTO user_accounts (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING ${USER_COLUMNS}`,
      [data.email, data.passwordHash, data.role],
    );

    if (row === null) {
      throw new Error('INSERT ... RETURNING produced no row');
    }

    return row;
  } catch (error) {
    throw mapDatabaseError(error, CONSTRAINT_MESSAGES);
  }
}

export async function findById(id: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT ${USER_COLUMNS}
     FROM user_accounts
     WHERE id = $1`,
    [id],
  );
}

export async function findByEmailWithPassword(
  email: string,
): Promise<UserWithPassword | null> {
  const clean = (email || '').trim();

  // 1. Try user_accounts
  try {
    const fromAccounts = await queryOne<UserWithPassword>(
      `SELECT id,
              username AS "email",
              username AS "fullName",
              CASE 
                WHEN lower(role) IN ('super_admin', 'super admin', 'admin') THEN 'admin'
                WHEN lower(role) = 'doctor' THEN 'doctor'
                WHEN lower(role) = 'patient' THEN 'patient'
                ELSE 'admin'
              END AS role,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              password_hash AS "passwordHash",
              0 AS "tokenVersion"
       FROM user_accounts
       WHERE lower(username) = lower($1)
          OR lower(username) = lower(REGEXP_REPLACE($1, '\\s+', '', 'g'))`,
      [clean],
    );
    if (fromAccounts) return fromAccounts;
  } catch (_err) {}

  // 2. Try admin_users
  try {
    const fromAdminUsers = await queryOne<UserWithPassword>(
      `SELECT id,
              username AS "email",
              username AS "fullName",
              CASE 
                WHEN lower(role) IN ('super_admin', 'super admin', 'admin') THEN 'admin'
                WHEN lower(role) = 'doctor' THEN 'doctor'
                WHEN lower(role) = 'patient' THEN 'patient'
                ELSE 'admin'
              END AS role,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              password_hash AS "passwordHash",
              0 AS "tokenVersion"
       FROM admin_users
       WHERE lower(username) = lower($1)
         AND status = 'ACTIVE'`,
      [clean],
    );
    if (fromAdminUsers) return fromAdminUsers;
  } catch (_err) {}

  // 3. Try master_admin_users
  try {
    const fromMasterAdmin = await queryOne<UserWithPassword>(
      `SELECT id,
              email,
              name AS "fullName",
              'admin' AS role,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              password_hash AS "passwordHash",
              0 AS "tokenVersion"
       FROM master_admin_users
       WHERE (lower(email) = lower($1) OR lower(name) = lower($1))
         AND status = 'ACTIVE'`,
      [clean],
    );
    if (fromMasterAdmin) return fromMasterAdmin;
  } catch (_err) {}

  // 4. Try tenant_admin_master_login
  try {
    const fromTenantAdmin = await queryOne<UserWithPassword>(
      `SELECT id,
              username AS "email",
              username AS "fullName",
              'admin' AS role,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              password_hash AS "passwordHash",
              0 AS "tokenVersion"
       FROM tenant_admin_master_login
       WHERE lower(username) = lower($1)
         AND status = 'ACTIVE'`,
      [clean],
    );
    if (fromTenantAdmin) return fromTenantAdmin;
  } catch (_err) {}

  // 5. Fallback: try users (mobile app users)
  try {
    const fromUsers = await queryOne<UserWithPassword>(
      `SELECT id,
              COALESCE(email, phone) AS "email",
              COALESCE(name, phone) AS "fullName",
              CASE 
                WHEN lower(role) = 'doctor' THEN 'doctor'
                WHEN lower(role) = 'patient' THEN 'patient'
                ELSE 'admin'
              END AS role,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              password_hash AS "passwordHash",
              COALESCE(token_version, 0) AS "tokenVersion"
       FROM users
       WHERE (email IS NOT NULL AND lower(email) = lower($1))
          OR phone = $1
          OR replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') = replace(replace(replace($1, ' ', ''), '-', ''), '+', '')`,
      [clean],
    );
    if (fromUsers) return fromUsers;
  } catch (_err) {}

  return null;
}

function toUserAuthContext(
  id: string,
  email: string,
  rawRoleStr: string | null | undefined,
  tokenVersion = 0,
): UserAuthContext {
  const cleanRaw = (rawRoleStr || '').trim();
  const lower = cleanRaw.toLowerCase();
  const role: UserRole =
    lower === 'super_admin' || lower === 'admin'
      ? 'admin'
      : lower === 'doctor'
        ? 'doctor'
        : lower === 'patient'
          ? 'patient'
          : 'admin';
  return {
    id,
    email,
    role,
    ...(cleanRaw ? {rbacRole: cleanRaw} : {}),
    tokenVersion,
  };
}

export async function findAuthContextById(
  id: string,
): Promise<UserAuthContext | null> {
  // 1. First try user_accounts (admin/main branch users)
  try {
    const fromAccounts = await queryOne<{id: string; email: string; role: string}>(
      `SELECT id, username AS "email", role
       FROM user_accounts
       WHERE id = $1`,
      [id],
    );
    if (fromAccounts) {
      return toUserAuthContext(fromAccounts.id, fromAccounts.email, fromAccounts.role, 0);
    }
  } catch (_err) {
    // ignore
  }

  // 2. Try admin_users
  try {
    const fromAdminUsers = await queryOne<{id: string; email: string; role: string}>(
      `SELECT id, username AS "email", role
       FROM admin_users
       WHERE id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    if (fromAdminUsers) {
      return toUserAuthContext(fromAdminUsers.id, fromAdminUsers.email, fromAdminUsers.role, 0);
    }
  } catch (_err) {
    // ignore
  }

  // 3. Try master_admin_users
  try {
    const fromMasterAdmin = await queryOne<{id: string; email: string; role: string}>(
      `SELECT id, email, role
       FROM master_admin_users
       WHERE id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    if (fromMasterAdmin) {
      return toUserAuthContext(fromMasterAdmin.id, fromMasterAdmin.email, fromMasterAdmin.role, 0);
    }
  } catch (_err) {
    // ignore
  }

  // 4. Try tenant_admin_master_login
  try {
    const fromTenantAdmin = await queryOne<{id: string; email: string; role: string}>(
      `SELECT id, username AS "email", role
       FROM tenant_admin_master_login
       WHERE id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    if (fromTenantAdmin) {
      return toUserAuthContext(fromTenantAdmin.id, fromTenantAdmin.email, fromTenantAdmin.role, 0);
    }
  } catch (_err) {
    // ignore
  }

  // 5. Fallback: try the `users` table (doctor/patient app users)
  const fromUsers = await queryOne<UserAuthContext>(
    `SELECT id, email, role, token_version AS "tokenVersion"
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (fromUsers) {
    return {
      ...fromUsers,
      rbacRole: fromUsers.role,
    };
  }
  return null;
}

export function incrementTokenVersion(_id: string): Promise<boolean> {
  return Promise.resolve(true);
}

export async function list(filter: ListUsersFilter): Promise<User[]> {
  return query<User>(
    `SELECT ${USER_COLUMNS}
     FROM user_accounts
     WHERE ($1::text IS NULL OR role = $1)
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [filter.role ?? null, filter.limit, filter.offset],
  );
}

export async function count(role: string | undefined): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM user_accounts
     WHERE ($1::text IS NULL OR role = $1)`,
    [role ?? null],
  );

  return row === null ? 0 : Number.parseInt(row.total, 10);
}

export async function update(
  id: string,
  data: UpdateUserData,
): Promise<User | null> {
  try {
    return await queryOne<User>(
      `UPDATE user_accounts
       SET username   = COALESCE($2, username),
           role       = COALESCE($3, role),
           updated_at = now()
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [id, data.email ?? null, data.role ?? null],
    );
  } catch (error) {
    throw mapDatabaseError(error, CONSTRAINT_MESSAGES);
  }
}

export async function softDelete(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE user_accounts
     SET status = 'DELETED', updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [id],
  );

  return rows.length > 0;
}

export async function findByMobileNumber(
  mobileNumber: string,
): Promise<UserAuthContext | null> {
  return queryOne<UserAuthContext>(
    `SELECT id, username AS "email", role, 0 AS "tokenVersion"
     FROM user_accounts
     WHERE username = $1`,
    [mobileNumber],
  );
}

export async function getOrCreateByMobileNumber(
  mobileNumber: string,
): Promise<UserAuthContext> {
  const user = await findByMobileNumber(mobileNumber);
  if (user) return user;

  const dummyHash =
    '$argon2id$v=19$m=19456,p=1,t=2$hD4wNp1vhAR0UgIku42HhQ$T4kcMF+8f8XsjChdbrICBIn6cVMAVkd0c2wRp9Y50w8';

  const row = await queryOne<UserAuthContext>(
    `INSERT INTO user_accounts (username, password_hash, role)
     VALUES ($1, $2, 'doctor')
     RETURNING id, username AS "email", role, 0 AS "tokenVersion"`,
    [mobileNumber, dummyHash],
  );

  if (!row) throw new Error('Failed to auto-create user');
  return row;
}
