import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '@/config/env.js';
import { ForbiddenError, UnauthorizedError } from '@/http/errors.js';
import { verifyAccessToken } from '@/modules/auth/tokens.js';
import { rbacService, type RbacAction } from '@/modules/rbac/rbac.service.js';
import * as usersRepository from '@/modules/users/users.repository.js';

function extractToken(req: Request): string {
  const header = req.headers.authorization;
  const queryToken = req.query['token'];

  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }

  if (typeof header !== 'string' || header.length === 0) {
    throw new UnauthorizedError('Authentication required.');
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedError('Invalid authorization header.');
  }

  return token;
}

async function resolveAuthenticatedUser(req: Request): Promise<NonNullable<Request['user']>> {
  if (req.user) {
    return req.user;
  }

  const token = extractToken(req);

  try {
    const payload = verifyAccessToken(token);
    const current = await usersRepository.findAuthContextById(payload.sub);
    if (current === null) {
      throw new UnauthorizedError('Your session is no longer valid.');
    }
    if (current.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedError('Your session has been revoked. Please log in again.');
    }
    const resolved: NonNullable<Request['user']> = {
      id: current.id,
      email: current.email,
      role: current.role,
      ...(current.rbacRole ? { rbacRole: current.rbacRole } : {}),
    };
    req.user = resolved;
    return resolved;
  } catch (err) {
    // Support Client Portal JWT tokens issued by client_portals.service.ts
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload & {
        id?: unknown;
        role?: unknown;
        email?: unknown;
        isClientPortal?: unknown;
      };

      if (
        decoded &&
        typeof decoded === 'object' &&
        decoded.isClientPortal === true &&
        typeof decoded.id === 'string' &&
        typeof decoded.role === 'string'
      ) {
        const current = await usersRepository.findAuthContextById(decoded.id);
        if (!current) {
          throw new UnauthorizedError('Your session is no longer valid.');
        }
        const resolved: NonNullable<Request['user']> = {
          id: current.id,
          email: current.email,
          role: current.role,
          rbacRole: current.rbacRole || decoded.role,
        };
        req.user = resolved;
        return resolved;
      }
    } catch (portalErr) {
      if (portalErr instanceof UnauthorizedError) {
        throw portalErr;
      }
    }

    throw err;
  }
}

/**
 * Dynamic RBAC guard matching the user's configured role permissions in `rbac_role_permissions`.
 */
export function requirePermission(
  moduleSlug: string,
  action: RbacAction,
  alternateSlugs?: string[]
): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      try {
        const user = await resolveAuthenticatedUser(req);
        const roleName = user.rbacRole || user.role;
        const allowed = await rbacService.hasPermission(
          roleName,
          moduleSlug,
          action,
          alternateSlugs
        );

        if (!allowed) {
          throw new ForbiddenError(
            `You do not have ${action} permission for ${moduleSlug}.`
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

/**
 * Allows mobile/portal patients performing self-service actions (ownership checked by controller)
 * while strictly enforcing dynamic RBAC permissions for all staff/doctor/admin roles.
 */
export function requirePermissionOrPatient(
  moduleSlug: string,
  action: RbacAction,
  alternateSlugs?: string[]
): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      try {
        const user = await resolveAuthenticatedUser(req);
        const rawUpper = (user.rbacRole || user.role || '').trim().toUpperCase();
        if (user.role === 'patient' && rawUpper === 'PATIENT') {
          next();
          return;
        }

        const roleName = user.rbacRole || user.role;
        const allowed = await rbacService.hasPermission(
          roleName,
          moduleSlug,
          action,
          alternateSlugs
        );

        if (!allowed) {
          throw new ForbiddenError(
            `You do not have ${action} permission for ${moduleSlug}.`
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

