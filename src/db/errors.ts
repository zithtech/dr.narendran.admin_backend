import {
  ConflictError,
  InternalError,
  ServiceUnavailableError,
  ValidationError,
} from '@/http/errors.js';

/**
 * Postgres SQLSTATE codes we translate into HTTP-shaped errors.
 * Full list: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const SqlState = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
  STRING_DATA_RIGHT_TRUNCATION: '22001',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  QUERY_CANCELED: '57014',
  ADMIN_SHUTDOWN: '57P01',
  CANNOT_CONNECT_NOW: '57P03',
  TOO_MANY_CONNECTIONS: '53300',
} as const;

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return (
    error instanceof Error && typeof (error as PostgresError).code === 'string'
  );
}

/**
 * Maps a driver error onto a typed AppError.
 *
 * Without this, a duplicate email surfaces as a 500 with a raw Postgres
 * message, which is both a bad client experience and an information leak. The
 * caller passes `constraintMessages` so a specific constraint can produce a
 * human message ("That email is already registered") instead of a generic one.
 */
export function mapDatabaseError(
  error: unknown,
  constraintMessages: Readonly<Record<string, string>> = {},
): Error {
  if (!isPostgresError(error) || error.code === undefined) {
    return error instanceof Error
      ? error
      : new InternalError('Unknown database error', {cause: error});
  }

  const friendly =
    error.constraint !== undefined
      ? constraintMessages[error.constraint]
      : undefined;

  switch (error.code) {
    case SqlState.UNIQUE_VIOLATION:
      return new ConflictError(friendly ?? 'That record already exists.', {
        cause: error,
      });

    case SqlState.FOREIGN_KEY_VIOLATION:
      return new ValidationError(
        friendly ?? 'A referenced record does not exist.',
        {cause: error},
      );

    case SqlState.NOT_NULL_VIOLATION:
      return new ValidationError(friendly ?? 'A required field was missing.', {
        cause: error,
      });

    case SqlState.CHECK_VIOLATION:
      return new ValidationError(friendly ?? 'That value is not allowed.', {
        cause: error,
      });

    case SqlState.INVALID_TEXT_REPRESENTATION:
    case SqlState.STRING_DATA_RIGHT_TRUNCATION:
    case SqlState.NUMERIC_VALUE_OUT_OF_RANGE:
      return new ValidationError(friendly ?? 'That value is not valid.', {
        cause: error,
      });

    /* statement_timeout fired. The query is the problem, not the request, so
       this is a 503 rather than a 400 - retrying may well succeed. */
    case SqlState.QUERY_CANCELED:
      return new ServiceUnavailableError(
        'The request took too long to process. Please try again.',
        {cause: error},
      );

    case SqlState.ADMIN_SHUTDOWN:
    case SqlState.CANNOT_CONNECT_NOW:
    case SqlState.TOO_MANY_CONNECTIONS:
      return new ServiceUnavailableError(
        'The database is temporarily unavailable. Please try again.',
        {cause: error},
      );

    default:
      /* Unmapped: keep the original so the error handler logs the real
         SQLSTATE, but the client still gets a generic 500 message. */
      return error;
  }
}
