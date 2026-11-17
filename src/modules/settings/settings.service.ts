import path from 'node:path';

import { pool } from '@/db/pool.js';
import { s3Service } from '@/modules/s3/s3.service.js';

let settingsTablesEnsured = false;

export async function ensureSettingsTables(client?: any): Promise<void> {
  if (settingsTablesEnsured) return;
  const dbClient = client || (await pool.connect());
  const shouldRelease = !client;

  try {
    // 1. Create app_settings table for system & branding configurations
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key varchar(100) PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp
      );
    `);

    // 2. Add first_name, last_name, logo_url columns to user tables if they don't already exist
    await dbClient.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_users') THEN
          ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS first_name varchar(255);
          ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_name varchar(255);
          ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS logo_url text;
        END IF;

        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'master_admin_users') THEN
          ALTER TABLE master_admin_users ADD COLUMN IF NOT EXISTS first_name varchar(255);
          ALTER TABLE master_admin_users ADD COLUMN IF NOT EXISTS last_name varchar(255);
          ALTER TABLE master_admin_users ADD COLUMN IF NOT EXISTS logo_url text;
        END IF;

        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_accounts') THEN
          ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS first_name varchar(255);
          ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS last_name varchar(255);
          ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS logo_url text;
        END IF;
      END $$;
    `);

    // 3. Register SETTINGS module in RBAC modules if table exists
    await dbClient.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rbac_modules') THEN
          INSERT INTO rbac_modules (slug, name, description)
          VALUES ('SETTINGS', 'Settings', 'Hospital branding assets, admin profile, and system configuration')
          ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description;

          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rbac_role_permissions') THEN
            INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
            SELECT r.name, 'SETTINGS', true, true, true
            FROM rbac_roles r
            WHERE upper(r.name) IN ('SYSTEM ADMINISTRATOR', 'SUPER_ADMIN', 'SUPER ADMIN', 'ADMIN', 'ADMINISTRATOR')
            ON CONFLICT (role_name, module_slug) DO UPDATE SET can_read = true, can_write = true, can_delete = true;
          END IF;
        END IF;
      END $$;
    `);

    settingsTablesEnsured = true;
  } catch (err) {
    console.warn('[SettingsService] Table ensure warning:', err);
  } finally {
    if (shouldRelease) {
      dbClient.release();
    }
  }
}

export class SettingsService {
  async getSettings(userId?: string) {
    await ensureSettingsTables();
    const client = await pool.connect();

    try {
      // 1. Fetch system-wide branding & settings from app_settings
      const settingsRes = await client.query('SELECT key, value FROM app_settings');
      const settingsMap: Record<string, string> = {};
      for (const row of settingsRes.rows) {
        settingsMap[row.key] = row.value;
      }

      let firstName = settingsMap['first_name'] || '';
      let lastName = settingsMap['last_name'] || '';
      let email = settingsMap['admin_email'] || '';
      let role = settingsMap['admin_role'] || 'SUPER_ADMIN';
      let logoUrl = settingsMap['logo_url'] || '';

      // 2. If userId is provided, look up specific user profile to override or supplement
      if (userId) {
        // Check admin_users
        try {
          const { rows } = await client.query(
            `SELECT id, username, role, name, first_name, last_name, logo_url 
             FROM admin_users WHERE id = $1`,
            [userId],
          );
          if (rows.length > 0) {
            const u = rows[0];
            email = u.username || email;
            role = u.role || role;
            if (u.first_name) firstName = u.first_name;
            if (u.last_name) lastName = u.last_name;
            if (!firstName && !lastName && u.name) {
              const parts = u.name.trim().split(/\s+/);
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
            }
            if (u.logo_url) logoUrl = u.logo_url;
          }
        } catch (_err) {
          // ignore
        }

        // Check user_accounts if not found or empty
        if (!firstName && !lastName) {
          try {
            const { rows } = await client.query(
              `SELECT id, username, role, first_name, last_name, logo_url 
               FROM user_accounts WHERE id = $1`,
              [userId],
            );
            if (rows.length > 0) {
              const u = rows[0];
              email = u.username || email;
              role = u.role || role;
              if (u.first_name) firstName = u.first_name;
              if (u.last_name) lastName = u.last_name;
              if (u.logo_url) logoUrl = u.logo_url;
            }
          } catch (_err) {
            // ignore
          }
        }

        // Check master_admin_users if still not found
        if (!firstName && !lastName) {
          try {
            const { rows } = await client.query(
              `SELECT id, email, name, role, first_name, last_name, logo_url 
               FROM master_admin_users WHERE id = $1`,
              [userId],
            );
            if (rows.length > 0) {
              const u = rows[0];
              email = u.email || email;
              role = u.role || role;
              if (u.first_name) firstName = u.first_name;
              if (u.last_name) lastName = u.last_name;
              if (!firstName && !lastName && u.name) {
                const parts = u.name.trim().split(/\s+/);
                firstName = parts[0] || '';
                lastName = parts.slice(1).join(' ') || '';
              }
              if (u.logo_url) logoUrl = u.logo_url;
            }
          } catch (_err) {
            // ignore
          }
        }
      }

      // Default fallback if fields are empty
      if (!firstName && !lastName) {
        firstName = 'System';
        lastName = 'Administrator';
      }

      const fullName = [firstName, lastName].filter(Boolean).join(' ');

      return {
        firstName,
        lastName,
        fullName,
        email: email || 'adminweb123@gmail.com',
        role,
        logoUrl: logoUrl || '',
      };
    } finally {
      client.release();
    }
  }

  async updateProfile(userId: string | undefined, data: { firstName: string; lastName: string }) {
    await ensureSettingsTables();
    const client = await pool.connect();

    try {
      const cleanFirst = (data.firstName || '').trim();
      const cleanLast = (data.lastName || '').trim();
      const fullName = [cleanFirst, cleanLast].filter(Boolean).join(' ');

      // 1. Update app_settings
      await client.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('first_name', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [cleanFirst],
      );

      await client.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('last_name', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [cleanLast],
      );

      await client.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('admin_full_name', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [fullName],
      );

      // 2. Update user record across possible tables
      if (userId) {
        try {
          await client.query(
            `UPDATE admin_users 
             SET first_name = $1, last_name = $2, name = $3, updated_at = NOW() 
             WHERE id = $4`,
            [cleanFirst, cleanLast, fullName, userId],
          );
        } catch (_err) {}

        try {
          await client.query(
            `UPDATE master_admin_users 
             SET first_name = $1, last_name = $2, name = $3, updated_at = NOW() 
             WHERE id = $4`,
            [cleanFirst, cleanLast, fullName, userId],
          );
        } catch (_err) {}

        try {
          await client.query(
            `UPDATE user_accounts 
             SET first_name = $1, last_name = $2, updated_at = NOW() 
             WHERE id = $3`,
            [cleanFirst, cleanLast, userId],
          );
        } catch (_err) {}
      }

      return {
        firstName: cleanFirst,
        lastName: cleanLast,
        fullName,
        message: 'Profile updated successfully',
      };
    } finally {
      client.release();
    }
  }

  async uploadLogo(
    userId: string | undefined,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ) {
    await ensureSettingsTables();

    // 1. Generate unique S3 storage key
    const ext = path.extname(originalName) || '.png';
    const sanitizedBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const key = `branding/logos/logo-${Date.now()}-${sanitizedBase}${ext}`;

    // 2. Upload to AWS S3 bucket via S3Service
    const uploadResult = await s3Service.uploadBuffer(key, buffer, mimeType);
    const logoUrl = uploadResult.fileUrl;

    // 3. Persist logo_url in app_settings table
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('logo_url', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [logoUrl],
      );

      // Also update user record if userId is known
      if (userId) {
        try {
          await client.query(
            `UPDATE admin_users SET logo_url = $1, updated_at = NOW() WHERE id = $2`,
            [logoUrl, userId],
          );
        } catch (_err) {}

        try {
          await client.query(
            `UPDATE master_admin_users SET logo_url = $1, updated_at = NOW() WHERE id = $2`,
            [logoUrl, userId],
          );
        } catch (_err) {}

        try {
          await client.query(
            `UPDATE user_accounts SET logo_url = $1, updated_at = NOW() WHERE id = $2`,
            [logoUrl, userId],
          );
        } catch (_err) {}
      }
    } finally {
      client.release();
    }

    return {
      logoUrl,
      key: uploadResult.key,
      message: 'Logo uploaded and stored in S3 bucket successfully',
    };
  }
}

export const settingsService = new SettingsService();

