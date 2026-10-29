import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '@/config/env.js';
import { pool } from '@/db/pool.js';
import { ForbiddenError, UnauthorizedError } from '@/http/errors.js';

import type { AuthenticatedLabRequest, LabPortalAuthPayload } from './lab_portal.types.js';

export async function requireLabPortalAuth(
  req: AuthenticatedLabRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header.'));
  }

  const token = header.slice('Bearer '.length).trim();
  let payload: LabPortalAuthPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as LabPortalAuthPayload;
  } catch {
    return next(new UnauthorizedError('Invalid or expired lab portal session token.'));
  }

  if (payload.type !== 'LAB_PORTAL_CLIENT' || !payload.labId || !payload.userId) {
    return next(new UnauthorizedError('Token is not a valid Lab Portal client token.'));
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, lab_id, username, email, status, must_change_password 
       FROM lab_portal_users 
       WHERE id = $1 AND lab_id = $2`,
      [payload.userId, payload.labId],
    );

    if (rows.length === 0) {
      return next(new UnauthorizedError('Lab client user account not found.'));
    }

    const user = rows[0];
    if (user.status !== 'ACTIVE') {
      return next(new ForbiddenError('Lab portal account is deactivated.'));
    }

    req.labUser = {
      userId: user.id,
      labId: user.lab_id,
      username: user.username,
      email: user.email,
      type: 'LAB_PORTAL_CLIENT',
    };

    next();
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}
