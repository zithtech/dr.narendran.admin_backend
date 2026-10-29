import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

import { env } from '@/config/env.js';
import { pool } from '@/db/pool.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';

import type { LabPortalAuthPayload, LabPortalUser } from './lab_portal.types.js';

const transporter = nodemailer.createTransport({
  host: process.env['SYSTEM_HOST'] || 'smtp.zoho.in',
  port: parseInt(process.env['SYSTEM_PORT'] || '465', 10),
  secure: process.env['SYSTEM_SECURE'] !== 'false',
  auth: {
    user: process.env['SYSTEM_EMAIL'],
    pass: process.env['SYSTEM_APP_PASSWORD'],
  },
});

function getClientPortalLoginUrl(): string {
  const base = process.env['CLIENT_PORTAL_BASE_URL'] || 'http://localhost:5173';
  return `${base}/client/login`;
}

async function sendLabCredentialsEmail(params: {
  toEmail: string;
  labName: string;
  username: string;
  password?: string;
  isPasswordReset?: boolean;
}) {
  const { toEmail, labName, username, password, isPasswordReset } = params;
  const sysEmail = process.env['SYSTEM_EMAIL'];
  const sysPass = process.env['SYSTEM_APP_PASSWORD'];

  if (!sysEmail || !sysPass) {
    console.log(`[EMAIL] SMTP not configured. Skipping email to ${toEmail}`);
    return;
  }

  const loginUrl = getClientPortalLoginUrl();
  const subject = isPasswordReset
    ? `Password Reset - ${labName} Client Portal Access`
    : `Welcome to ${labName} Client Portal - Login Details`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 32px 28px; text-align: center;">
        <span style="display: inline-block; padding: 6px 14px; background: rgba(255, 255, 255, 0.2); border-radius: 9999px; color: #ffffff; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
          Lab Client Portal
        </span>
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">
          Dr. Narendran Healthcare
        </h1>
        <p style="color: #e0f2fe; font-size: 14px; margin: 6px 0 0 0;">
          Diagnostic Partner & Laboratory Portal
        </p>
      </div>

      <div style="padding: 28px 24px;">
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Welcome, ${labName}!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #334155;">
          ${isPasswordReset
      ? 'Your Lab Client Portal password has been reset. Please use the credentials below to log in:'
      : 'Your dedicated Lab Client Portal account has been provisioned. You can manage your diagnostic laboratory profile, operating hours, and test catalog directly from the portal.'
    }
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 24px 0;">
          <h3 style="font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin: 0 0 12px 0;">
            Portal Login Credentials
          </h3>
          <p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
            <strong>Username:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${username}</span>
          </p>
          <p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
            <strong>Registered Email:</strong> <span style="color: #0f172a;">${toEmail}</span>
          </p>
          ${password
      ? `<p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
                  <strong>Temporary Password:</strong> <span style="font-family: monospace; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${password}</span>
                </p>`
      : ''
    }
          <p style="margin: 12px 0 0 0; font-size: 12.5px; color: #dc2626; font-weight: 500;">
            * Security Notice: You will be required to set a new password on your first login.
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.25);">
            Open Lab Client Portal &rarr;
          </a>
        </div>

        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
          Direct login link: <a href="${loginUrl}" style="color: #0284c7;">${loginUrl}</a>
        </p>
      </div>

      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b;">
        &copy; ${new Date().getFullYear()} Dr. Narendran Healthcare Management System.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Dr. Narendran Client Portal" <${sysEmail}>`,
      to: toEmail,
      subject,
      html,
    });
    console.log(`[EMAIL] Portal credentials email sent to ${toEmail}`);
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send email to ${toEmail}:`, err);
  }
}

export class LabPortalService {
  /* ── 1. Admin: Manage Portal Accounts from Lab Management ────── */

  async createPortalAccount(
    labId: string,
    input: { username: string; email: string; password: string; sendEmail?: boolean },
  ) {
    const { username, email, password, sendEmail = true } = input;

    if (!username || username.trim().length < 3) {
      throw new ValidationError('Username must be at least 3 characters.');
    }
    if (!email || !email.includes('@')) {
      throw new ValidationError('Valid email address is required.');
    }
    if (!password || password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters.');
    }

    const client = await pool.connect();
    try {
      // 1. Verify lab exists
      const { rows: labRows } = await client.query('SELECT id, name FROM labs WHERE id = $1', [labId]);
      if (labRows.length === 0) {
        throw new NotFoundError('Lab not found.');
      }
      const lab = labRows[0];

      // 2. Check if lab already has a portal account
      const { rows: existingLabAccount } = await client.query(
        'SELECT id FROM lab_portal_users WHERE lab_id = $1',
        [labId],
      );
      if (existingLabAccount.length > 0) {
        throw new ConflictError('A Client Portal account already exists for this lab.');
      }

      // 3. Check if username is taken
      const cleanUsername = username.trim().toLowerCase();
      const { rows: existingUser } = await client.query(
        'SELECT id FROM lab_portal_users WHERE LOWER(username) = $1',
        [cleanUsername],
      );
      if (existingUser.length > 0) {
        throw new ConflictError(`Username "${username}" is already taken. Please choose another.`);
      }

      // 4. Hash password
      const passwordHash = await argon2.hash(password);

      // 5. Insert record
      const { rows: userRows } = await client.query(
        `INSERT INTO lab_portal_users 
          (lab_id, username, email, password_hash, status, must_change_password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', true, NOW(), NOW())
         RETURNING id, lab_id, username, email, status, must_change_password, created_at`,
        [labId, cleanUsername, email.trim().toLowerCase(), passwordHash],
      );
      const account: LabPortalUser = userRows[0];

      // 6. Optionally dispatch email
      if (sendEmail) {
        void sendLabCredentialsEmail({
          toEmail: account.email,
          labName: lab.name,
          username: account.username,
          password,
        });
      }

      return {
        account,
        login_url: getClientPortalLoginUrl(),
      };
    } finally {
      client.release();
    }
  }

  async getPortalAccountByLab(labId: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT id, lab_id, username, email, status, must_change_password, last_login_at, created_at, updated_at 
         FROM lab_portal_users 
         WHERE lab_id = $1`,
        [labId],
      );
      if (rows.length === 0) return null;
      return {
        ...rows[0],
        login_url: getClientPortalLoginUrl(),
      };
    } finally {
      client.release();
    }
  }

  async resetPortalPassword(
    labId: string,
    input: { newPassword: string; sendEmail?: boolean },
  ) {
    const { newPassword, sendEmail = true } = input;
    if (!newPassword || newPassword.length < 6) {
      throw new ValidationError('New password must be at least 6 characters.');
    }

    const client = await pool.connect();
    try {
      const { rows: labRows } = await client.query('SELECT id, name FROM labs WHERE id = $1', [labId]);
      if (labRows.length === 0) throw new NotFoundError('Lab not found.');
      const lab = labRows[0];

      const { rows: userRows } = await client.query(
        'SELECT id, username, email FROM lab_portal_users WHERE lab_id = $1',
        [labId],
      );
      if (userRows.length === 0) {
        throw new NotFoundError('No Client Portal account found for this lab.');
      }
      const user = userRows[0];

      const passwordHash = await argon2.hash(newPassword);
      await client.query(
        `UPDATE lab_portal_users 
         SET password_hash = $1, must_change_password = true, updated_at = NOW() 
         WHERE id = $2`,
        [passwordHash, user.id],
      );

      if (sendEmail) {
        void sendLabCredentialsEmail({
          toEmail: user.email,
          labName: lab.name,
          username: user.username,
          password: newPassword,
          isPasswordReset: true,
        });
      }

      return { success: true, message: 'Password reset successfully.' };
    } finally {
      client.release();
    }
  }

  async resendPortalInvite(labId: string) {
    const client = await pool.connect();
    try {
      const { rows: labRows } = await client.query('SELECT id, name FROM labs WHERE id = $1', [labId]);
      if (labRows.length === 0) throw new NotFoundError('Lab not found.');

      const { rows: userRows } = await client.query(
        'SELECT id, username, email FROM lab_portal_users WHERE lab_id = $1',
        [labId],
      );
      if (userRows.length === 0) throw new NotFoundError('No portal account found for this lab.');

      const user = userRows[0];
      await sendLabCredentialsEmail({
        toEmail: user.email,
        labName: labRows[0].name,
        username: user.username,
      });

      return { success: true, message: 'Invitation email resent successfully.' };
    } finally {
      client.release();
    }
  }

  /* ── 2. Client Portal Authentication ────────────────────────── */

  async login(identifier: string, password: string) {
    if (!identifier || !password) {
      throw new ValidationError('Username/email and password are required.');
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const client = await pool.connect();
    try {
      const { rows: userRows } = await client.query(
        `SELECT u.*, l.name as lab_name, l.status as lab_status 
         FROM lab_portal_users u
         JOIN labs l ON u.lab_id = l.id
         WHERE LOWER(u.username) = $1 OR LOWER(u.email) = $1`,
        [cleanIdentifier],
      );

      if (userRows.length === 0) {
        throw new UnauthorizedError('Invalid credentials.');
      }

      // If multiple lab portal accounts share the same email, find the one matching the provided password
      let user: any = null;
      for (const candidate of userRows) {
        if (candidate.status !== 'ACTIVE' || candidate.lab_status !== 'ACTIVE') {
          continue;
        }
        const isValidPassword = await argon2.verify(candidate.password_hash, password);
        if (isValidPassword) {
          user = candidate;
          break;
        }
      }

      if (!user) {
        const hasInactive = userRows.some((u: any) => u.status !== 'ACTIVE' || u.lab_status !== 'ACTIVE');
        if (hasInactive && userRows.length === 1) {
          throw new ForbiddenError('Account is inactive. Please contact the hospital administrator.');
        }
        throw new UnauthorizedError('Invalid credentials.');
      }

      // Update last login
      await client.query('UPDATE lab_portal_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      const payload: LabPortalAuthPayload = {
        userId: user.id,
        labId: user.lab_id,
        username: user.username,
        email: user.email,
        type: 'LAB_PORTAL_CLIENT',
      };

      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          lab_id: user.lab_id,
          must_change_password: user.must_change_password,
          status: user.status,
        },
        lab: {
          id: user.lab_id,
          name: user.lab_name,
        },
      };
    } finally {
      client.release();
    }
  }

  async changePassword(
    userId: string,
    input: { currentPassword?: string; newPassword: string },
  ) {
    const { currentPassword, newPassword } = input;
    if (!newPassword || newPassword.length < 6) {
      throw new ValidationError('New password must be at least 6 characters.');
    }

    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT id, password_hash, must_change_password FROM lab_portal_users WHERE id = $1',
        [userId],
      );
      if (rows.length === 0) throw new NotFoundError('User not found.');
      const user = rows[0];

      // If not forced first-time change, require current password
      if (!user.must_change_password) {
        if (!currentPassword) {
          throw new ValidationError('Current password is required.');
        }
        const isCurrentValid = await argon2.verify(user.password_hash, currentPassword);
        if (!isCurrentValid) {
          throw new UnauthorizedError('Current password is incorrect.');
        }
      }

      const newHash = await argon2.hash(newPassword);
      await client.query(
        `UPDATE lab_portal_users 
         SET password_hash = $1, must_change_password = false, updated_at = NOW() 
         WHERE id = $2`,
        [newHash, userId],
      );

      return { success: true, message: 'Password changed successfully.' };
    } finally {
      client.release();
    }
  }

  /* ── 3. Lab Profile Management (Isolated to authenticated lab) ── */

  async getLabProfile(labId: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT l.*, 
                COUNT(lsm.service_id)::int as total_services
         FROM labs l
         LEFT JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
         WHERE l.id = $1
         GROUP BY l.id`,
        [labId],
      );
      if (rows.length === 0) throw new NotFoundError('Lab not found.');
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateLabProfile(labId: string, data: any) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `UPDATE labs 
         SET name = COALESCE($1, name),
             address_line_1 = $2,
             address_line_2 = $3,
             city = $4,
             state = $5,
             pincode = $6,
             phone = $7,
             email = $8,
             start_time = $9,
             end_time = $10,
             map_link = $11,
             contact_visibility = COALESCE($12, contact_visibility),
             updated_at = NOW()
         WHERE id = $13
         RETURNING *`,
        [
          data.name,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.phone || null,
          data.email || null,
          data.start_time || null,
          data.end_time || null,
          data.map_link || null,
          data.contact_visibility !== undefined ? data.contact_visibility : true,
          labId,
        ],
      );
      if (rows.length === 0) throw new NotFoundError('Lab not found.');
      return rows[0];
    } finally {
      client.release();
    }
  }

  /* ── 4. Services / Tests Management (Isolated to authenticated lab) ── */

  async getLabServices(labId: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT s.id, s.name, s.description, s.price, s.status, s.created_at, s.updated_at
         FROM lab_services s
         JOIN lab_service_mappings lsm ON s.id = lsm.service_id
         WHERE lsm.lab_id = $1
         ORDER BY s.name ASC`,
        [labId],
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async addLabService(
    labId: string,
    data: { name: string; description?: string; price?: number; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Service/test name is required.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO lab_services (name, description, price, status, lab_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [
          data.name.trim(),
          data.description || null,
          data.price !== undefined ? data.price : 0,
          data.status || 'ACTIVE',
          labId,
        ],
      );
      const service = rows[0];

      await client.query(
        `INSERT INTO lab_service_mappings (lab_id, service_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [labId, service.id],
      );

      await client.query('COMMIT');
      return service;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateLabService(
    labId: string,
    serviceId: string,
    data: { name: string; description?: string; price?: number; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    const client = await pool.connect();
    try {
      // Verify ownership: must be mapped to this lab
      const { rows: mapCheck } = await client.query(
        'SELECT 1 FROM lab_service_mappings WHERE lab_id = $1 AND service_id = $2',
        [labId, serviceId],
      );
      if (mapCheck.length === 0) {
        throw new NotFoundError('Service not found or does not belong to this laboratory.');
      }

      const { rows } = await client.query(
        `UPDATE lab_services
         SET name = COALESCE($1, name),
             description = $2,
             price = COALESCE($3, price),
             status = COALESCE($4, status),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          data.name?.trim(),
          data.description || null,
          data.price !== undefined ? data.price : null,
          data.status,
          serviceId,
        ],
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async deleteLabService(labId: string, serviceId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify mapping belongs to this lab
      const { rows: mapping } = await client.query(
        'DELETE FROM lab_service_mappings WHERE lab_id = $1 AND service_id = $2 RETURNING *',
        [labId, serviceId],
      );
      if (mapping.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Service not found for this laboratory.');
      }

      // If service was created by this lab specifically, delete it
      await client.query('DELETE FROM lab_services WHERE id = $1 AND lab_id = $2', [
        serviceId,
        labId,
      ]);

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /* ── 5. Dashboard & Account ─────────────────────────────────── */

  async getDashboardData(labId: string) {
    const client = await pool.connect();
    try {
      const { rows: labRows } = await client.query('SELECT * FROM labs WHERE id = $1', [labId]);
      if (labRows.length === 0) throw new NotFoundError('Lab not found.');
      const lab = labRows[0];

      const { rows: services } = await client.query(
        `SELECT s.id, s.name, s.price, s.status, s.created_at
         FROM lab_services s
         JOIN lab_service_mappings lsm ON s.id = lsm.service_id
         WHERE lsm.lab_id = $1
         ORDER BY s.created_at DESC`,
        [labId],
      );

      // Calculate profile completion percentage based on real DB fields
      let score = 0;
      const checklist: { label: string; completed: boolean }[] = [];

      const hasName = Boolean(lab.name);
      score += hasName ? 15 : 0;
      checklist.push({ label: 'Lab Name', completed: hasName });

      const hasPhone = Boolean(lab.phone);
      score += hasPhone ? 15 : 0;
      checklist.push({ label: 'Contact Phone', completed: hasPhone });

      const hasEmail = Boolean(lab.email);
      score += hasEmail ? 15 : 0;
      checklist.push({ label: 'Email Address', completed: hasEmail });

      const hasAddress = Boolean(lab.address_line_1 && lab.city);
      score += hasAddress ? 20 : 0;
      checklist.push({ label: 'Physical Address & City', completed: hasAddress });

      const hasHours = Boolean(lab.start_time && lab.end_time);
      score += hasHours ? 15 : 0;
      checklist.push({ label: 'Operating Hours', completed: hasHours });

      const hasLocation = Boolean(lab.map_link);
      score += hasLocation ? 10 : 0;
      checklist.push({ label: 'Map Location', completed: hasLocation });

      const hasServices = services.length > 0;
      score += hasServices ? 10 : 0;
      checklist.push({ label: 'Services Configured', completed: hasServices });

      return {
        lab: {
          id: lab.id,
          name: lab.name,
          phone: lab.phone,
          email: lab.email,
          address_line_1: lab.address_line_1,
          address_line_2: lab.address_line_2,
          city: lab.city,
          state: lab.state,
          pincode: lab.pincode,
          start_time: lab.start_time,
          end_time: lab.end_time,
          map_link: lab.map_link,
          contact_visibility: lab.contact_visibility !== undefined ? lab.contact_visibility : true,
          status: lab.status,
        },
        profileCompletion: score,
        checklist,
        totalServices: services.length,
        recentServices: services.slice(0, 5),
      };
    } finally {
      client.release();
    }
  }

  async getAccountInfo(userId: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT u.id, u.username, u.email, u.status, u.must_change_password, u.last_login_at, u.created_at,
                l.id as lab_id, l.name as lab_name, l.phone as lab_phone
         FROM lab_portal_users u
         JOIN labs l ON u.lab_id = l.id
         WHERE u.id = $1`,
        [userId],
      );
      if (rows.length === 0) throw new NotFoundError('Account not found.');
      return rows[0];
    } finally {
      client.release();
    }
  }

  /* ── Patient Lab Reports Management ──────────────────────── */

  async searchPatients(searchQuery: string) {
    const q = (searchQuery || '').trim();
    const client = await pool.connect();
    try {
      if (!q) {
        const { rows } = await client.query(
          `SELECT id, name, phone, email, date_of_birth, gender, blood_group
           FROM patients
           ORDER BY created_at DESC
           LIMIT 10`
        );
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          email: r.email,
          dateOfBirth: r.date_of_birth ? String(r.date_of_birth).split('T')[0] : null,
          gender: r.gender,
          bloodGroup: r.blood_group,
        }));
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      if (isUuid) {
        const { rows } = await client.query(
          `SELECT id, name, phone, email, date_of_birth, gender, blood_group
           FROM patients
           WHERE id::text = $1 OR user_account_id::text = $1 OR user_id::text = $1
           LIMIT 5`,
          [q],
        );
        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            name: r.name,
            phone: r.phone,
            email: r.email,
            dateOfBirth: r.date_of_birth ? String(r.date_of_birth).split('T')[0] : null,
            gender: r.gender,
            bloodGroup: r.blood_group,
          }));
        }
      }

      const { rows } = await client.query(
        `SELECT id, name, phone, email, date_of_birth, gender, blood_group
         FROM patients
         WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 OR id::text ILIKE $1
         ORDER BY created_at DESC
         LIMIT 15`,
        [`%${q}%`],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        dateOfBirth: r.date_of_birth ? String(r.date_of_birth).split('T')[0] : null,
        gender: r.gender,
        bloodGroup: r.blood_group,
      }));
    } finally {
      client.release();
    }
  }

  async getPatientTestsAndReports(patientId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) {
      throw new ValidationError('Invalid patient ID format.');
    }

    const client = await pool.connect();
    try {
      // 1. Get Patient Details
      const patientRes = await client.query(
        `SELECT id, user_account_id, user_id, name, phone, email, date_of_birth, gender, blood_group, address_line1, city
         FROM patients
         WHERE id::text = $1 OR user_account_id::text = $1 OR user_id::text = $1
         LIMIT 1`,
        [patientId],
      );

      if (patientRes.rows.length === 0) {
        throw new NotFoundError('Patient not found.');
      }
      const rawPatient = patientRes.rows[0];
      const actualPatientId = rawPatient.id;
      const allPatientIds: string[] = [
        rawPatient.id,
        rawPatient.user_account_id,
        rawPatient.user_id,
      ].filter(Boolean);

      const patient = {
        id: rawPatient.id,
        name: rawPatient.name,
        phone: rawPatient.phone,
        email: rawPatient.email,
        dateOfBirth: rawPatient.date_of_birth ? String(rawPatient.date_of_birth).split('T')[0] : null,
        gender: rawPatient.gender,
        bloodGroup: rawPatient.blood_group,
        address: [rawPatient.address_line1, rawPatient.city].filter(Boolean).join(', '),
      };

      // 2. Fetch Prescribed / Required Lab Tests
      const testsRes = await client.query(
        `SELECT 
          plt.id,
          plt.prescription_id,
          plt.patient_id,
          plt.lab_test_id,
          plt.test_name,
          plt.instructions,
          plt.created_at,
          plt.updated_at,
          p.prescription_date,
          p.doctor_id,
          COALESCE(d.name, 'Dr. Narendran') as doctor_name,
          d.specialization as doctor_specialization
        FROM prescription_lab_tests plt
        JOIN prescriptions p ON p.id = plt.prescription_id
        LEFT JOIN doctors d ON d.id = p.doctor_id
        WHERE plt.patient_id::text = ANY($1::text[]) OR p.patient_id::text = ANY($1::text[])
        ORDER BY plt.created_at DESC`,
        [allPatientIds],
      );

      // 3. Fetch All Lab Test Reports for this Patient
      const reportsRes = await client.query(
        `SELECT 
          r.id,
          r.prescription_lab_test_id,
          r.patient_id,
          r.file_name,
          r.file_type,
          r.file_size,
          r.report_date,
          r.document_url,
          r.storage_key,
          r.notes,
          r.uploaded_by,
          r.uploaded_by_id,
          r.is_external,
          r.test_name,
          r.created_at,
          r.updated_at,
          CASE 
            WHEN r.uploaded_by::text = 'LAB' THEN COALESCE(lpu.username, 'Lab Assistant')
            WHEN r.uploaded_by::text = 'PATIENT' THEN COALESCE(pt.name, 'Patient')
            ELSE 'Unknown'
          END as uploader_name,
          plt.test_name as prescribed_test_name
        FROM lab_test_reports r
        LEFT JOIN lab_portal_users lpu ON lpu.id = r.uploaded_by_id AND r.uploaded_by::text = 'LAB'
        LEFT JOIN patients pt ON pt.id = r.uploaded_by_id AND r.uploaded_by::text = 'PATIENT'
        LEFT JOIN prescription_lab_tests plt ON plt.id = r.prescription_lab_test_id
        WHERE r.patient_id::text = ANY($1::text[])
        ORDER BY r.created_at DESC`,
        [allPatientIds],
      );

      // Sign URLs for reports
      const reports = await Promise.all(
        reportsRes.rows.map(async (row) => {
          let signedUrl = row.document_url;
          if (row.storage_key) {
            try {
              signedUrl = await s3Service.getReadUrl(decodeURIComponent(row.storage_key), 86400);
            } catch {
              signedUrl = row.document_url;
            }
          }
          return {
            id: row.id,
            prescriptionLabTestId: row.prescription_lab_test_id,
            patientId: row.patient_id,
            fileName: row.file_name,
            fileType: row.file_type,
            fileSize: Number(row.file_size || 0),
            reportDate: row.report_date ? String(row.report_date).split('T')[0] : '',
            documentUrl: signedUrl,
            notes: row.notes,
            uploadedBy: row.uploaded_by, // 'LAB' | 'PATIENT'
            uploadedById: row.uploaded_by_id, // uuid
            uploaderName: row.uploader_name,
            isExternal: Boolean(row.is_external),
            testName: row.test_name || row.prescribed_test_name || row.file_name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }),
      );

      // Map reports to prescribed tests
      const reportsByPltId = new Map<string, typeof reports>();
      for (const rep of reports) {
        if (rep.prescriptionLabTestId) {
          const list = reportsByPltId.get(rep.prescriptionLabTestId) || [];
          list.push(rep);
          reportsByPltId.set(rep.prescriptionLabTestId, list);
        } else {
          // If a report was uploaded without an explicit plt id, link to matching prescribed test
          const repName = (rep.testName || '').toLowerCase().trim();
          const matchedTest = testsRes.rows.find((t) => {
            const tName = (t.test_name || '').toLowerCase().trim();
            return tName === repName || (repName && tName.includes(repName)) || (tName && repName.includes(tName));
          });
          if (matchedTest) {
            const list = reportsByPltId.get(matchedTest.id) || [];
            list.push(rep);
            reportsByPltId.set(matchedTest.id, list);
          }
        }
      }

      const requiredTests = testsRes.rows.map((testRow) => {
        const linkedReports = reportsByPltId.get(testRow.id) || [];
        return {
          id: testRow.id,
          prescriptionId: testRow.prescription_id,
          patientId: testRow.patient_id,
          labTestId: testRow.lab_test_id,
          testName: testRow.test_name,
          instructions: testRow.instructions,
          prescriptionDate: testRow.prescription_date
            ? String(testRow.prescription_date).split('T')[0]
            : null,
          doctorName: testRow.doctor_name,
          doctorSpecialization: testRow.doctor_specialization,
          status: linkedReports.length > 0 ? 'Uploaded' : 'Pending',
          reportsCount: linkedReports.length,
          reports: linkedReports,
          createdAt: testRow.created_at,
        };
      });

      return {
        patient,
        requiredTests,
        reports,
      };
    } finally {
      client.release();
    }
  }

  async uploadLabReport(params: {
    labUserId: string;
    patientId: string;
    prescriptionLabTestId?: string | null | undefined;
    testName: string;
    reportDate?: string | undefined;
    notes?: string | null | undefined;
    file?: Express.Multer.File | undefined;
  }) {
    const { labUserId, patientId, prescriptionLabTestId, testName, reportDate, notes, file } = params;

    if (!file) {
      throw new ValidationError('Report file is required.');
    }

    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const mimeType = (file.mimetype || '').toLowerCase();
    if (!allowedMimeTypes.includes(mimeType)) {
      throw new ValidationError('Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG.');
    }

    if (file.size > 15 * 1024 * 1024) {
      throw new ValidationError('File size exceeds the 15MB limit.');
    }

    if (!testName || !testName.trim()) {
      throw new ValidationError('Test name is required.');
    }

    const client = await pool.connect();
    try {
      // Verify patient exists
      const patientRes = await client.query('SELECT id FROM patients WHERE id::text = $1', [patientId]);
      if (patientRes.rows.length === 0) {
        throw new NotFoundError('Patient not found.');
      }

      // Check if linked to prescribed test
      let isExternal = true;
      let finalTestName = testName.trim();

      if (prescriptionLabTestId) {
        const pltRes = await client.query(
          'SELECT id, test_name FROM prescription_lab_tests WHERE id::text = $1',
          [prescriptionLabTestId],
        );
        if (pltRes.rows.length > 0) {
          isExternal = false;
          if (!finalTestName) {
            finalTestName = pltRes.rows[0].test_name;
          }
        }
      }

      const sanitizedFileName = (file.originalname || 'report').replace(/[^a-zA-Z0-9._-]/g, '_');
      const folder = prescriptionLabTestId || 'external';
      const storageKey = `lab_reports/${patientId}/${folder}/${Date.now()}_${sanitizedFileName}`;

      let uploadResult: { fileUrl: string; key: string };
      try {
        uploadResult = await s3Service.uploadBuffer(storageKey, file.buffer, mimeType);
      } catch (uploadErr) {
        console.warn('[LabPortal] S3 direct upload fallback:', uploadErr);
        uploadResult = {
          fileUrl: `https://s3.local/${storageKey}`,
          key: storageKey,
        };
      }

      const rDate = reportDate && reportDate.trim() ? reportDate.trim() : new Date().toISOString().split('T')[0];

      const insertSql = `
        INSERT INTO lab_test_reports (
          prescription_lab_test_id,
          patient_id,
          file_name,
          file_type,
          file_size,
          report_date,
          document_url,
          storage_key,
          notes,
          uploaded_by,
          uploaded_by_id,
          is_external,
          test_name
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'LAB', $10, $11, $12
        ) RETURNING *
      `;

      const { rows } = await client.query(insertSql, [
        prescriptionLabTestId || null,
        patientId,
        file.originalname || 'report',
        mimeType,
        file.size,
        rDate,
        uploadResult.fileUrl,
        uploadResult.key,
        notes || null,
        labUserId,
        isExternal,
        finalTestName,
      ]);

      const inserted = rows[0];
      let signedUrl = inserted.document_url;
      if (inserted.storage_key) {
        try {
          signedUrl = await s3Service.getReadUrl(decodeURIComponent(inserted.storage_key), 86400);
        } catch {
          signedUrl = inserted.document_url;
        }
      }

      // Fetch uploader username
      const userRes = await client.query('SELECT username FROM lab_portal_users WHERE id::text = $1', [labUserId]);
      const uploaderName = userRes.rows[0]?.username || 'Lab Assistant';

      return {
        id: inserted.id,
        prescriptionLabTestId: inserted.prescription_lab_test_id,
        patientId: inserted.patient_id,
        fileName: inserted.file_name,
        fileType: inserted.file_type,
        fileSize: Number(inserted.file_size || 0),
        reportDate: inserted.report_date ? String(inserted.report_date).split('T')[0] : rDate,
        documentUrl: signedUrl,
        notes: inserted.notes,
        uploadedBy: inserted.uploaded_by, // 'LAB'
        uploadedById: inserted.uploaded_by_id, // uuid
        uploaderName,
        isExternal: Boolean(inserted.is_external),
        testName: inserted.test_name,
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at,
      };
    } finally {
      client.release();
    }
  }

  async deleteLabReport(labUserId: string, reportId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
      throw new ValidationError('Invalid report ID.');
    }

    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT id, storage_key, uploaded_by, uploaded_by_id FROM lab_test_reports WHERE id::text = $1',
        [reportId],
      );
      if (rows.length === 0) {
        throw new NotFoundError('Report not found.');
      }
      const report = rows[0];

      if (String(report.uploaded_by) !== 'LAB') {
        throw new ForbiddenError('Only lab assistants can delete lab-uploaded reports.');
      }

      if (report.storage_key) {
        try {
          await s3Service.deleteFile(report.storage_key);
        } catch {
          // ignore S3 deletion failure
        }
      }

      await client.query('DELETE FROM lab_test_reports WHERE id::text = $1', [reportId]);
      return { success: true, message: 'Lab report deleted successfully.' };
    } finally {
      client.release();
    }
  }
}

export const labPortalService = new LabPortalService();

