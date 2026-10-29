/* eslint-disable */
// @ts-nocheck
import type {ErrorRequestHandler, RequestHandler} from 'express';

import {env} from '@/config/env.js';
import {ErrorCode, isAppError, NotFoundError} from '@/http/errors.js';

/**
 * The single place an error becomes an HTTP response.
 *
 * Response shape is `{error, code, requestId, details?}`. The `error` key is
 * mandatory and first: both mobile apps read `response.data.error` (see their
 * `src/shared/api/errors.ts`) and fall back to a generic message if it is
 * missing. Renaming it silently degrades every error message in both apps.
 */

interface ErrorBody {
  error: string;
  code: string;
  requestId?: string;
  details?: unknown;
}

/** 404 handler. Mounted after all routes, before the error handler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};

/**
 * Errors thrown by middleware we do not own - principally body-parser, which
 * rejects malformed JSON and oversized payloads before any route runs.
 *
 * These follow the `http-errors` convention (`status` + `expose`) rather than
 * being AppErrors, so without this they would fall through to the generic 500
 * branch. That matters: a client sending bad JSON is a 400, and reporting it
 * as a 500 turns a client bug into a spurious server-error alert.
 */
interface HttpStyleError extends Error {
  status?: number;
  statusCode?: number;
  expose?: boolean;
  type?: string;
}

/** Friendlier equivalents of body-parser's internal messages. */
const BODY_PARSER_MESSAGES: Readonly<Record<string, string>> = {
  'entity.parse.failed': 'Request body was not valid JSON.',
  'entity.too.large': 'Request body is too large.',
  'encoding.unsupported': 'Unsupported content encoding.',
  'request.aborted': 'The request was aborted.',
};

function asClientError(
  error: unknown,
): {statusCode: number; message: string} | null {
  if (!(error instanceof Error)) return null;

  const candidate = error as HttpStyleError;
  const statusCode = candidate.status ?? candidate.statusCode;

  /* `expose` is the library's own signal that the message is safe to show.
     Only 4xx qualifies - a 5xx from a dependency still gets the generic
     treatment below. */
  if (
    typeof statusCode !== 'number' ||
    statusCode < 400 ||
    statusCode >= 500 ||
    candidate.expose !== true
  ) {
    return null;
  }

  const message =
    (candidate.type !== undefined
      ? BODY_PARSER_MESSAGES[candidate.type]
      : undefined) ?? 'That request was not valid.';

  return {statusCode, message};
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  /* If headers are already sent the response is mid-flight; the only correct
     move is to hand off to Express's default handler, which destroys the
     socket. Writing a second response here would corrupt the first. */
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = (req as any).id || (req.headers && req.headers["x-request-id"]) || undefined;

  if (isAppError(error)) {
    /* `expose: false` means the message names internals (SQL, paths, hosts).
       Log the real one, send a safe one. */
    const message = error.expose
      ? error.message
      : 'The server had a problem. Please try again shortly.';

    const body: ErrorBody = {error: message, code: error.code};
    if (requestId !== undefined) body.requestId = requestId;
    if (error.details !== undefined) body.details = error.details;

    /* Log the error */
    if (error.statusCode >= 500) {
      console.error('Request failed:', error);
    } else {
      console.warn(`Request rejected [${error.statusCode}]:`, error);
    }

    res.status(error.statusCode).json(body);
    return;
  }

  /* Middleware we do not own (body-parser) reporting a client-side problem. */
  const clientError = asClientError(error);
  if (clientError !== null) {
    const body: ErrorBody = {
      error: clientError.message,
      code: ErrorCode.VALIDATION,
    };
    if (requestId !== undefined) body.requestId = requestId;

    console.warn(
      `Request rejected by middleware [${clientError.statusCode}]:`,
      error,
    );
    res.status(clientError.statusCode).json(body);
    return;
  }

  console.error('Unhandled error:', error);

  const body: ErrorBody = {
    error: 'The server had a problem. Please try again shortly.',
    code: 'INTERNAL_ERROR',
  };
  if (requestId !== undefined) body.requestId = requestId;

  /* Outside production, include the real message and stack - it saves a trip
     to the server logs while developing. Never in production. */
  if (!env.IS_PRODUCTION && error instanceof Error) {
    body.details = {message: error.message, stack: error.stack};
  }

  res.status(500).json(body);
};
