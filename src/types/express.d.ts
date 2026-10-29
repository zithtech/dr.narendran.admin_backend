import type {UserRole} from '@/modules/users/users.types.js';

/**
 * Express request augmentation.
 *
 * Kept deliberately small. `validated` is written by the `validate` middleware
 * and read back through the typed `handler()` wrapper; `user` is written by
 * `requireAuth`.
 *
 * Note we do NOT declare `id` here - pino-http already augments
 * `http.IncomingMessage` with it, and redeclaring would conflict.
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Output of the Zod schemas attached to this route.
       *
       * Untyped here on purpose: the per-route types are recovered by the
       * `handler()` helper in `http/middleware/validate.ts`, which is the only
       * place allowed to narrow this.
       */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };

      /** Set by `requireAuth`. Absent on public routes. */
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export {};
