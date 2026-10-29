import type { Response } from 'express';
import { z } from 'zod';

import { isAppError } from '@/http/errors.js';

/**
 * Standardized controller response helpers.
 * Preserves exact payload formats expected by client applications.
 */

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json(data);
}

export function sendCreated<T>(res: Response, data: T, location?: string): void {
  if (location) {
    res.location(location);
  }
  res.status(201).json(data);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  details?: unknown,
): void {
  res.status(statusCode).json({
    error: message,
    ...(details !== undefined ? { details } : {}),
  });
}

export function sendNotFound(res: Response, resource = 'Resource'): void {
  res.status(404).json({ error: `${resource} not found` });
}

export function sendBadRequest(
  res: Response,
  message: string,
  details?: unknown,
): void {
  res.status(400).json({
    error: message,
    ...(details !== undefined ? { details } : {}),
  });
}

export function handleControllerError(
  res: Response,
  err: unknown,
  fallbackMessage = 'Internal server error',
): void {
  if (err instanceof z.ZodError) {
    const firstIssue = err.issues[0];
    const message = firstIssue?.message || 'Invalid request payload';
    res.status(400).json({
      error: message,
      details: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: err.expose ? err.message : fallbackMessage,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  console.error('[Controller Error]:', err);
  const message = err instanceof Error && process.env['NODE_ENV'] !== 'production'
    ? err.message
    : fallbackMessage;
  res.status(500).json({ error: fallbackMessage || message });
}
