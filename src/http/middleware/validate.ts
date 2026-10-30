import type {Request, RequestHandler, Response} from 'express';
import {type z, type ZodType} from 'zod';

import {ValidationError} from '@/http/errors.js';

/**
 * Zod request validation, typed end to end.
 *
 * IMPORTANT (Express 5): parsed output is written to `req.validated`, NOT back
 * onto `req.query` / `req.params`. Express 5 defines those as getter-only
 * accessors, so the Express 4 habit of `req.query = schema.parse(req.query)`
 * throws at runtime. This is the single most common Express 4 -> 5 porting bug.
 */

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** Maps a schema set to the shape a handler actually receives. */
export type ValidatedData<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends ZodType ? z.output<S[K]> : never;
};

function parseOrThrow(
  schema: ZodType,
  value: unknown,
  source: 'body' | 'query' | 'params',
): unknown {
  const result = schema.safeParse(value);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue?.message || 'That request was not valid.';
    throw new ValidationError(message, {
      details: {
        source,
        issues: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
      cause: result.error,
    });
  }

  return result.data;
}

/** Standalone validation middleware, for routes that do not need the typed handler. */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      const validated: NonNullable<Request['validated']> = {};

      /* params before query before body: a bad :id should 400 before we spend
         effort validating a large payload. */
      if (schemas.params) {
        validated.params = parseOrThrow(schemas.params, req.params, 'params');
      }
      if (schemas.query) {
        validated.query = parseOrThrow(schemas.query, req.query, 'query');
      }
      if (schemas.body) {
        validated.body = parseOrThrow(schemas.body, req.body, 'body');
      }

      req.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Pairs a schema set with a controller so the controller's input is inferred.
 *
 * Usage:
 *   router.post('/', ...handler({body: createUserSchema}, createUser));
 *
 * and `createUser` receives `{body: CreateUserInput}` - fully typed, with no
 * cast at the call site and no `as` in the controller.
 */
export function handler<S extends RequestSchemas>(
  schemas: S,
  controller: (
    input: ValidatedData<S>,
    req: Request,
    res: Response,
  ) => Promise<void>,
): RequestHandler[] {
  return [
    validate(schemas),
    /* Express 5 forwards a rejected promise from a handler straight to the
       error middleware, so no try/catch or async wrapper is needed here.
       This is the ONE cast in the request pipeline: `validate` has just
       populated `req.validated` from these exact schemas. */
    (req, res) =>
      controller(req.validated as unknown as ValidatedData<S>, req, res),
  ];
}
