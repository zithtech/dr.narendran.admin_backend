import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

import { env } from '@/config/env.js';
import { pool } from '@/db/pool.js';
import { NotFoundError } from '@/http/errors.js';

// Mail transporter configured with Zoho SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env['SYSTEM_HOST'] || 'smtp.zoho.in',
  port: parseInt(process.env['SYSTEM_PORT'] || '465', 10),
  secure: process.env['SYSTEM_SECURE'] !== 'false',
  auth: {
    user: process.env['SYSTEM_EMAIL'],
    pass: process.env['SYSTEM_APP_PASSWORD'],
  },
});

export interface ClientPortalInput {
  username: string; // Used as email
  password?: string | undefined;
  role: string;
  status: 'ACTIVE' | 'INACTIVE';
}

function getPortalBaseUrl(): string {
  return process.env['CLIENT_PORTAL_BASE_URL'] || 'http://localhost:5173';
}

function buildClientLoginUrl(portalToken: string): string {
  const baseUrl = getPortalBaseUrl();
  return `${baseUrl}/client/login?portal_token=${portalToken}`;
}

async function sendPortalInvitationEmail(params: {
  toEmail: string;
  role: string;
  password?: string | undefined;
  portalToken: string;
  isResend?: boolean | undefined;
}) {
  const { toEmail, role, password, portalToken, isResend } = params;
  const sysEmail = process.env['SYSTEM_EMAIL'];
  const sysPass = process.env['SYSTEM_APP_PASSWORD'];

  if (!sysEmail || !sysPass) {
    console.log(`[EMAIL] Zoho SMTP not configured, skipping email to ${toEmail}`);
    return;
  }

  const loginUrl = buildClientLoginUrl(portalToken);
  const subject = isResend
    ? 'Reminder: Your Client Portal Login Link & Credentials'
    : 'Your Unique Client Portal Login Link & Access Details';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; text-align: center;">
        <span style="display: inline-block; padding: 6px 14px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 9999px; color: #38bdf8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
          Client Portal Access
        </span>
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">
          Dr. Narendran Healthcare
        </h1>
        <p style="color: #94a3b8; font-size: 14px; margin: 6px 0 0 0;">
          Dedicated Partner & External Client Portal
        </p>
      </div>

      <div style="padding: 28px 24px;">
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Welcome!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #334155;">
          ${isResend ? 'Here is your requested unique access link and details for' : 'Your account has been created for'} the Dr. Narendran Client Portal. You have been assigned the role: <strong>${role}</strong>.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 24px 0;">
          <h3 style="font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin: 0 0 12px 0;">
            Account Credentials
          </h3>
          <p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
            <strong>Email / Username:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${toEmail}</span>
          </p>
          <p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
            <strong>Password:</strong> ${
              password
                ? `<span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${password}</span>`
                : '<em>(Your existing password remains active)</em>'
            }
          </p>
          <p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
            <strong>Portal Role:</strong> <span style="color: #0284c7; font-weight: 600;">${role}</span>
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.25);">
            Access Your Client Portal &rarr;
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-top: 24px;">
          Or copy and paste this unique link into your browser:<br/>
          <a href="${loginUrl}" style="color: #0284c7; word-break: break-all;">${loginUrl}</a>
        </p>

        <div style="border-top: 1px solid #f1f5f9; margin-top: 24px; padding-top: 16px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5;">
            <strong>Security Notice:</strong> This client login portal is strictly reserved for authorized client and partner access. For administrative staff, please use the separate Admin Portal.
          </p>
        </div>
      </div>

      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
        &copy; ${new Date().getFullYear()} Dr. Narendran Hospital System. All rights reserved.
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
    console.log(`[EMAIL] Portal invite link successfully sent to ${toEmail}`);
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send portal email to ${toEmail}:`, err);
  }
}

export const clientPortalsService = {
  async getAll() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT a.id, a.username as email, a.role, a.status, a.portal_token, a.created_at
        FROM admin_users a
        JOIN rbac_roles r ON a.role = r.name
        WHERE r.is_system_role = false
        ORDER BY a.created_at DESC
      `);
      return rows.map((r) => ({
        ...r,
        login_url: r.portal_token ? buildClientLoginUrl(r.portal_token) : null,
      }));
    } finally {
      client.release();
    }
  },

  async create(data: ClientPortalInput) {
    const client = await pool.connect();
    try {
      const portalToken = crypto.randomBytes(20).toString('hex');
      const passwordHash = data.password ? await argon2.hash(data.password) : '';

      const { rows } = await client.query(
        `INSERT INTO admin_users (username, password_hash, role, status, portal_token)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username as email, role, status, portal_token, created_at`,
        [data.username, passwordHash, data.role, data.status, portalToken]
      );

      const createdUser = rows[0];
      const loginUrl = buildClientLoginUrl(portalToken);

      await sendPortalInvitationEmail({
        toEmail: data.username,
        role: data.role,
        password: data.password,
        portalToken,
        isResend: false,
      });

      return {
        ...createdUser,
        login_url: loginUrl,
      };
    } finally {
      client.release();
    }
  },

  async update(id: string, data: ClientPortalInput) {
    const client = await pool.connect();
    try {
      let query: string;
      let params: unknown[];

      if (data.password) {
        const passwordHash = await argon2.hash(data.password);
        query = `UPDATE admin_users SET username = $1, password_hash = $2, role = $3, status = $4 WHERE id = $5 RETURNING id, username as email, role, status, portal_token`;
        params = [data.username, passwordHash, data.role, data.status, id];
      } else {
        query = `UPDATE admin_users SET username = $1, role = $2, status = $3 WHERE id = $4 RETURNING id, username as email, role, status, portal_token`;
        params = [data.username, data.role, data.status, id];
      }

      const { rows } = await client.query(query, params);
      if (rows.length === 0) throw new NotFoundError('User not found');
      
      const user = rows[0];
      return {
        ...user,
        login_url: user.portal_token ? buildClientLoginUrl(user.portal_token) : null,
      };
    } finally {
      client.release();
    }
  },

  async delete(id: string) {
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
      return true;
    } finally {
      client.release();
    }
  },

  async resendInvite(id: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT a.id, a.username, a.role, a.status, a.portal_token, r.is_system_role
         FROM admin_users a
         LEFT JOIN rbac_roles r ON a.role = r.name
         WHERE a.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        throw new NotFoundError('Client account not found');
      }

      const user = rows[0];
      if (user.role === 'SUPER_ADMIN' || user.is_system_role === true) {
        throw new Error('Cannot send client portal invite to an administrator account');
      }

      let portalToken = user.portal_token as string | null;
      if (!portalToken) {
        portalToken = crypto.randomBytes(20).toString('hex');
        await client.query(`UPDATE admin_users SET portal_token = $1 WHERE id = $2`, [portalToken, id]);
      }

      const loginUrl = buildClientLoginUrl(portalToken);

      await sendPortalInvitationEmail({
        toEmail: user.username,
        role: user.role,
        portalToken,
        isResend: true,
      });

      return {
        success: true,
        email: user.username,
        role: user.role,
        portal_token: portalToken,
        login_url: loginUrl,
      };
    } finally {
      client.release();
    }
  },

  async verifyPortalToken(token: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT a.id, a.username as email, a.role, a.status, r.is_system_role
         FROM admin_users a
         LEFT JOIN rbac_roles r ON a.role = r.name
         WHERE a.portal_token = $1`,
        [token]
      );

      if (rows.length === 0) {
        return { valid: false, error: 'Invalid or expired Client Portal link' };
      }

      const user = rows[0];
      if (user.status !== 'ACTIVE') {
        return { valid: false, error: 'This client portal account is inactive. Please contact support.' };
      }

      if (user.role === 'SUPER_ADMIN' || user.is_system_role === true) {
        return { valid: false, error: 'This link is not valid for client portal access.' };
      }

      return {
        valid: true,
        email: user.email,
        role: user.role,
      };
    } finally {
      client.release();
    }
  },

  async clientLogin(params: { username?: string | undefined; passwordPlain: string; portalToken?: string | undefined }) {
    const { username, passwordPlain, portalToken } = params;
    const client = await pool.connect();
    try {
      let query: string;
      let queryParams: unknown[];

      if (portalToken && (!username || username.trim() === '')) {
        query = `
          SELECT a.id, a.username, a.password_hash, a.role, a.status, a.portal_token, r.is_system_role
          FROM admin_users a
          LEFT JOIN rbac_roles r ON a.role = r.name
          WHERE a.portal_token = $1
        `;
        queryParams = [portalToken];
      } else {
        query = `
          SELECT a.id, a.username, a.password_hash, a.role, a.status, a.portal_token, r.is_system_role
          FROM admin_users a
          LEFT JOIN rbac_roles r ON a.role = r.name
          WHERE lower(a.username) = lower($1)
        `;
        queryParams = [username];
      }

      const { rows } = await client.query(query, queryParams);

      if (rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = rows[0];

      if (user.status !== 'ACTIVE') {
        throw new Error('Your portal account is currently inactive. Please contact your administrator.');
      }

      if (user.role === 'SUPER_ADMIN' || user.is_system_role === true) {
        throw new Error('This account is an Administrator. Please log in using the Admin Portal.');
      }

      const isValid = await argon2.verify(user.password_hash, passwordPlain);
      if (!isValid) {
        throw new Error('Invalid email or password');
      }

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          email: user.username,
          isClientPortal: true,
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );

      return {
        token,
        role: user.role,
        email: user.username,
        portal_token: user.portal_token,
      };
    } finally {
      client.release();
    }
  },
};
