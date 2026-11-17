/* eslint-disable */
// @ts-nocheck
import crypto from 'crypto';
import { hash, verify } from 'argon2';
import { pool } from '@/db/pool.js';
import { getTenantPool } from '@/db/tenant-pool.js';
import { env } from '@/config/env.js';
import {
  generatePasswordResetEmailHtml,
  generatePasswordResetEmailText,
} from '@/templates/passwordResetEmail.js';

export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  if (!/[!@#$%^&*(),.?":{}|<>_\-\\\/+=]/.test(password)) {
    errors.push('Password must contain at least one special character.');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

async function verifyPasswordSafe(hashStr: string | null | undefined, plain: string): Promise<boolean> {
  if (!hashStr || !plain) return false;
  try {
    const isValid = await verify(hashStr, plain);
    if (isValid) return true;
  } catch {
    // Argon2 threw (e.g. malformed or not argon2 hash)
  }
  return hashStr === plain;
}

export class TenantAuthService {
  async getDatabaseNameForTenantCode(
    tenantCode: string,
  ): Promise<string | null> {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT database_name FROM tenants WHERE tenant_code = $1',
        [tenantCode],
      );
      if (rows.length === 0) return null;
      return rows[0].database_name;
    } finally {
      client.release();
    }
  }

  async login(tenantCode: string, username: string, passwordPlain: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `
        SELECT a.id, a.username, a.password_hash, a.role, a.status, t.database_name 
        FROM tenant_admin_master_login a
        JOIN tenants t ON a.tenant_id = t.id
        WHERE a.username = $1 AND t.tenant_code = $2
      `,
        [username, tenantCode],
      );

      if (rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = rows[0];
      if (user.status !== 'ACTIVE') {
        throw new Error('Account is inactive');
      }

      const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantCode,
        databaseName: user.database_name,
      };
    } finally {
      client.release();
    }
  }

  async adminLogin(username: string, passwordPlain: string) {
    const client = await pool.connect();
    try {
      const cleanIdentifier = (username || '').trim();

      // 1. Check admin_users table
      try {
        const { rows } = await client.query(
          `SELECT a.id, a.username, a.password_hash, a.role, a.status, r.is_system_role 
           FROM admin_users a
           LEFT JOIN rbac_roles r ON a.role = r.name
           WHERE lower(a.username) = lower($1)`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            if (user.role !== 'SUPER_ADMIN' && user.is_system_role === false) {
              throw new Error('Client portal accounts cannot access the Admin Portal. Please use the Client Portal login page.');
            }
            return {
              id: user.id,
              username: user.username,
              role: user.role,
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive' || (err.message && err.message.includes('Client portal'))) {
          throw err;
        }
      }

      // 2. Check user_accounts table (accounts created inside Admin Panel - Admin, Doctor, Patient, etc.)
      try {
        const { rows } = await client.query(
          `SELECT id, username, password_hash, role, status
           FROM user_accounts
           WHERE lower(username) = lower($1)
              OR lower(username) = lower(REGEXP_REPLACE($1, '\\s+', '', 'g'))`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            return {
              id: user.id,
              username: user.username,
              role: user.role,
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive') {
          throw err;
        }
      }

      // 3. Check master_admin_users table (Master Admin accounts like admin, master@drnarendran.com, etc.)
      try {
        const { rows } = await client.query(
          `SELECT id, name, email, password_hash, role, status
           FROM master_admin_users
           WHERE lower(email) = lower($1) OR lower(name) = lower($1)`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            return {
              id: user.id,
              username: user.email || user.name,
              role: user.role || 'SUPER_ADMIN',
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive') {
          throw err;
        }
      }

      // 4. Check tenant_admin_master_login table
      try {
        const { rows } = await client.query(
          `SELECT id, username, password_hash, role, status
           FROM tenant_admin_master_login
           WHERE lower(username) = lower($1)`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            return {
              id: user.id,
              username: user.username,
              role: user.role || 'ADMIN',
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive') {
          throw err;
        }
      }

      // 5. Fallback: Check users table (mobile app users)
      try {
        const { rows } = await client.query(
          `SELECT id, phone, email, password_hash, role
           FROM users
           WHERE (email IS NOT NULL AND lower(email) = lower($1))
              OR phone = $1
              OR replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') = replace(replace(replace($1, ' ', ''), '-', ''), '+', '')`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            return {
              id: user.id,
              username: user.email || user.phone,
              role: user.role || 'patient',
            };
          }
        }
      } catch (_err) {
        // ignore
      }

      throw new Error('Invalid credentials');
    } finally {
      client.release();
    }
  }

  async resetPassword(identifier: string, newPasswordPlain: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const cleanIdentifier = (identifier || '').trim();
      const passwordHash = await hash(newPasswordPlain);

      let updated = false;

      // 1. Check & update user_accounts
      try {
        const res = await client.query(
          `UPDATE user_accounts 
           SET password_hash = $1, updated_at = NOW() 
           WHERE lower(username) = lower($2) 
              OR lower(username) = lower(REGEXP_REPLACE($2, '\\s+', '', 'g'))
           RETURNING id`,
          [passwordHash, cleanIdentifier],
        );
        if (res.rowCount && res.rowCount > 0) updated = true;
      } catch (_e) {}

      // 2. Check & update admin_users
      if (!updated) {
        try {
          const res = await client.query(
            `UPDATE admin_users 
             SET password_hash = $1, updated_at = NOW() 
             WHERE lower(username) = lower($2) 
             RETURNING id`,
            [passwordHash, cleanIdentifier],
          );
          if (res.rowCount && res.rowCount > 0) updated = true;
        } catch (_e) {}
      }

      // 3. Check & update master_admin_users
      if (!updated) {
        try {
          const res = await client.query(
            `UPDATE master_admin_users 
             SET password_hash = $1, updated_at = NOW() 
             WHERE lower(email) = lower($2) OR lower(name) = lower($2) 
             RETURNING id`,
            [passwordHash, cleanIdentifier],
          );
          if (res.rowCount && res.rowCount > 0) updated = true;
        } catch (_e) {}
      }

      // 4. Check & update tenant_admin_master_login
      if (!updated) {
        try {
          const res = await client.query(
            `UPDATE tenant_admin_master_login 
             SET password_hash = $1, updated_at = NOW() 
             WHERE lower(username) = lower($2) 
             RETURNING id`,
            [passwordHash, cleanIdentifier],
          );
          if (res.rowCount && res.rowCount > 0) updated = true;
        } catch (_e) {}
      }

      // 5. Check & update users
      if (!updated) {
        try {
          const res = await client.query(
            `UPDATE users 
             SET password_hash = $1, updated_at = NOW() 
             WHERE (email IS NOT NULL AND lower(email) = lower($2))
                OR phone = $2
                OR replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') = replace(replace(replace($2, ' ', ''), '-', ''), '+', '')
             RETURNING id`,
            [passwordHash, cleanIdentifier],
          );
          if (res.rowCount && res.rowCount > 0) updated = true;
        } catch (_e) {}
      }

      return updated;
    } finally {
      client.release();
    }
  }

  async initResetTokensTable(client: any): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(255) NOT NULL,
        token varchar(255) NOT NULL UNIQUE,
        user_id uuid,
        account_table varchar(50),
        expires_at timestamp with time zone NOT NULL,
        used boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(lower(email));
    `);
  }

  async requestPasswordReset(identifier: string, origin?: string): Promise<{ message: string }> {
    const client = await pool.connect();
    try {
      await this.initResetTokensTable(client);

      const cleanIdentifier = (identifier || '').trim().toLowerCase();
      if (!cleanIdentifier) {
        return { message: 'If an account exists with this email, you will receive a password reset link.' };
      }

      // Lookup user in admin_users, user_accounts, master_admin_users, tenant_admin_master_login, users
      let matchedUser: { id: string; email: string; name?: string; table: string } | null = null;

      // 1. admin_users
      try {
        const { rows } = await client.query(
          `SELECT id, username FROM admin_users WHERE lower(username) = $1`,
          [cleanIdentifier],
        );
        if (rows.length > 0) {
          matchedUser = { id: rows[0].id, email: rows[0].username, table: 'admin_users' };
        }
      } catch (_e) {}

      // 2. user_accounts
      if (!matchedUser) {
        try {
          const { rows } = await client.query(
            `SELECT id, username FROM user_accounts WHERE lower(username) = $1`,
            [cleanIdentifier],
          );
          if (rows.length > 0) {
            matchedUser = { id: rows[0].id, email: rows[0].username, table: 'user_accounts' };
          }
        } catch (_e) {}
      }

      // 3. master_admin_users
      if (!matchedUser) {
        try {
          const { rows } = await client.query(
            `SELECT id, email, name FROM master_admin_users WHERE lower(email) = $1`,
            [cleanIdentifier],
          );
          if (rows.length > 0) {
            matchedUser = { id: rows[0].id, email: rows[0].email, name: rows[0].name, table: 'master_admin_users' };
          }
        } catch (_e) {}
      }

      // 4. users
      if (!matchedUser) {
        try {
          const { rows } = await client.query(
            `SELECT id, email FROM users WHERE lower(email) = $1`,
            [cleanIdentifier],
          );
          if (rows.length > 0) {
            matchedUser = { id: rows[0].id, email: rows[0].email, table: 'users' };
          }
        } catch (_e) {}
      }

      // If user account exists, generate a token, invalidate existing tokens, and send email
      if (matchedUser) {
        const email = matchedUser.email;

        // Invalidate existing active reset tokens for this email
        await client.query(
          `UPDATE password_reset_tokens SET used = true WHERE lower(email) = $1 AND used = false`,
          [email.toLowerCase()],
        );

        // Generate a unique, securely generated, time-limited token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiration

        await client.query(
          `INSERT INTO password_reset_tokens (email, token, user_id, account_table, expires_at, used)
           VALUES ($1, $2, $3, $4, $5, false)`,
          [email.toLowerCase(), token, matchedUser.id, matchedUser.table, expiresAt],
        );

        // Build reset URL
        const appOrigin = origin || env.CLIENT_APP_URL || 'http://localhost:5173';
        const resetUrl = `${appOrigin.replace(/\/+$/, '')}/reset-password?token=${token}`;

        // Send email via nodemailer
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.createTransport({
            host: env.SYSTEM_HOST,
            port: env.SYSTEM_PORT,
            secure: env.SYSTEM_SECURE,
            auth: {
              user: env.SYSTEM_EMAIL,
              pass: env.SYSTEM_APP_PASSWORD,
            },
          });

          const emailHtml = generatePasswordResetEmailHtml({
            name: matchedUser.name || matchedUser.email,
            resetUrl,
            expiresMinutes: 30,
          });
          const emailText = generatePasswordResetEmailText({
            name: matchedUser.name || matchedUser.email,
            resetUrl,
            expiresMinutes: 30,
          });

          await transporter.sendMail({
            from: `"Dr. Narendran HMS" <${env.SYSTEM_EMAIL}>`,
            to: email,
            subject: 'Password Reset Request - Dr. Narendran HMS',
            text: emailText,
            html: emailHtml,
          });
        } catch (mailErr: any) {
          console.warn(`[TenantAuthService] Could not send password reset email to ${email}:`, mailErr?.message || mailErr);
          console.info(`[TenantAuthService] Reset password link (development): ${resetUrl}`);
        }
      }

      // Do not reveal whether an email address is registered or not
      return {
        message: 'If an account exists with this email, you will receive a password reset link.',
      };
    } finally {
      client.release();
    }
  }

  async verifyResetToken(token: string): Promise<{ valid: boolean; email?: string; error?: string }> {
    const cleanToken = (token || '').trim();
    if (!cleanToken) {
      return { valid: false, error: 'Reset token is required.' };
    }

    const client = await pool.connect();
    try {
      await this.initResetTokensTable(client);

      const { rows } = await client.query(
        `SELECT id, email, user_id, account_table, expires_at, used
         FROM password_reset_tokens
         WHERE token = $1`,
        [cleanToken],
      );

      if (rows.length === 0) {
        return { valid: false, error: 'This password reset link is invalid, expired, or has already been used.' };
      }

      const row = rows[0];
      if (row.used) {
        return { valid: false, error: 'This password reset link has already been used.' };
      }

      const now = new Date();
      if (new Date(row.expires_at) <= now) {
        return { valid: false, error: 'This password reset link has expired. Please request a new one.' };
      }

      return { valid: true, email: row.email };
    } finally {
      client.release();
    }
  }

  async resetPasswordWithToken(token: string, newPasswordPlain: string): Promise<boolean> {
    const cleanToken = (token || '').trim();
    if (!cleanToken) {
      throw new Error('Reset token is required.');
    }

    // Validate password strength:
    // Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number, 1 special character
    const strength = validatePasswordStrength(newPasswordPlain);
    if (!strength.isValid) {
      throw new Error(strength.errors.join(' '));
    }

    const client = await pool.connect();
    try {
      await this.initResetTokensTable(client);

      const { rows } = await client.query(
        `SELECT id, email, user_id, account_table, expires_at, used
         FROM password_reset_tokens
         WHERE token = $1`,
        [cleanToken],
      );

      if (rows.length === 0 || rows[0].used || new Date(rows[0].expires_at) <= new Date()) {
        throw new Error('This password reset link is invalid, expired, or has already been used.');
      }

      const tokenRecord = rows[0];
      const email = tokenRecord.email;
      const passwordHash = await hash(newPasswordPlain);

      // Update password in user tables matching this email/id
      let updated = false;

      // 1. user_accounts
      try {
        const res = await client.query(
          `UPDATE user_accounts SET password_hash = $1, updated_at = NOW() WHERE lower(username) = lower($2) RETURNING id`,
          [passwordHash, email],
        );
        if (res.rowCount && res.rowCount > 0) updated = true;
      } catch (_e) {}

      // 2. admin_users
      try {
        const res = await client.query(
          `UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE lower(username) = lower($2) RETURNING id`,
          [passwordHash, email],
        );
        if (res.rowCount && res.rowCount > 0) updated = true;
      } catch (_e) {}

      // 3. master_admin_users
      try {
        const res = await client.query(
          `UPDATE master_admin_users SET password_hash = $1, updated_at = NOW() WHERE lower(email) = lower($2) RETURNING id`,
          [passwordHash, email],
        );
        if (res.rowCount && res.rowCount > 0) updated = true;
      } catch (_e) {}

      // 4. tenant_admin_master_login
      try {
        const res = await client.query(
          `UPDATE tenant_admin_master_login SET password_hash = $1, updated_at = NOW() WHERE lower(username) = lower($2) RETURNING id`,
          [passwordHash, email],
        );
        if (res.rowCount && res.rowCount > 0) updated = true;
      } catch (_e) {}

      // 5. users
      try {
        const res = await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE lower(email) = lower($2) RETURNING id`,
          [passwordHash, email],
        );
        if (res.rowCount && res.rowCount > 0) updated = true;
      } catch (_e) {}

      // Invalidate the reset token immediately after successful password reset
      await client.query(
        `UPDATE password_reset_tokens SET used = true WHERE id = $1`,
        [tokenRecord.id],
      );

      // Invalidate any other active reset tokens for this email as well
      await client.query(
        `UPDATE password_reset_tokens SET used = true WHERE lower(email) = lower($1) AND used = false`,
        [email],
      );

      return true;
    } finally {
      client.release();
    }
  }
}

export const tenantAuthService = new TenantAuthService();
