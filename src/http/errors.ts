/**
 * Typed application errors.
 *
 * Anything thrown anywhere in the app should be an `AppError` subclass. The
 * error-handling middleware is then the single place that turns an error into
 * a response, and it can trust `statusCode` / `code` / `expose` rather than
 * trying to guess from a string message.
 *
 * The response envelope is `{error, code, requestId}` because the React Native
 * clients read `response.data.error` first (see the apps'
 * `src/shared/api/errors.ts`). Renaming that key breaks both apps.
 */

/** Stable machine-readable codes. The apps ignore these today; log tooling and any future web client will not. */
export const ErrorCode = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCodeValue;

  /**
   * Whether `message` is safe to send to the client.
   *
   * `false` means the real message is logged server-side and the client gets a
   * generic one instead. Used for 5xx, where the message tends to contain
   * connection strings, SQL fragments or internal paths.
   */
  readonly expose: boolean = true;

  /** Optional structured detail, e.g. per-field Zod issues. */
  readonly details?: unknown;

  constructor(message: string, options?: {details?: unknown; cause?: unknown}) {
    super(message, options?.cause === undefined ? {} : {cause: options.cause});
    this.name = new.target.name;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
    Error.captureStackTrace(this, new.target);
  }
}

/** 400 - the request itself is malformed or fails schema validation. */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = ErrorCode.VALIDATION;
}

/**
 * 401 - no valid session.
 *
 * Both mobile apps treat ANY 401 as "session is dead, clear the Keychain and
 * return to Login". Every auth failure mode (missing header, malformed token,
 * bad signature, expired) must therefore be a 401, never a 403 - a 403 leaves
 * the app stuck holding a token it can never use.
 */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = ErrorCode.UNAUTHORIZED;

  constructor(
    message = 'Authentication required.',
    options?: {cause?: unknown},
  ) {
    super(message, options);
  }
}

/** 403 - authenticated, but not allowed to do this. Distinct from 401 on purpose. */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = ErrorCode.FORBIDDEN;

  constructor(message = 'You do not have permission to do that.') {
    super(message);
  }
}

/** 404 - the resource does not exist, or is soft-deleted. */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = ErrorCode.NOT_FOUND;

  constructor(resource = 'Resource') {
    super(`${resource} not found.`);
  }
}

/** 409 - the request conflicts with current state, e.g. a duplicate email. */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = ErrorCode.CONFLICT;
}

/** 429 - rate limited. */
export class TooManyRequestsError extends AppError {
  readonly statusCode = 429;
  readonly code = ErrorCode.TOO_MANY_REQUESTS;

  constructor(message = 'Too many requests. Please try again later.') {
    super(message);
  }
}

/** 503 - a dependency (the database) is unavailable. */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = ErrorCode.SERVICE_UNAVAILABLE;
  override readonly expose = true;
}

/** 500 - anything we did not anticipate. Never exposes its real message. */
export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = ErrorCode.INTERNAL;
  override readonly expose = false;

  constructor(message = 'Internal server error.', options?: {cause?: unknown}) {
    super(message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
