 
import type {MigrationBuilder} from 'node-pg-migrate';

/**
 * Creates the `users` table.
 *
 * Written as explicit SQL via `pgm.sql` rather than node-pg-migrate's
 * `createTable` DSL. The DSL generates SQL you then have to reverse-engineer
 * when debugging; in a project whose whole premise is "no ORM, the SQL is the
 * interface", the migration should show the exact DDL that ran.
 */

export const shorthands = undefined;

export function up(pgm: MigrationBuilder): void {
  /* An enum rather than a text+CHECK column: Postgres enforces it at the type
     level, it stores as 4 bytes, and an invalid role becomes a 22P02 the
     repository already maps to a 400. Cost: adding a value later needs
     ALTER TYPE ... ADD VALUE, which is fine, but REMOVING one is painful.
     Roles change rarely enough for that trade to be worth it. */
  pgm.sql(`CREATE TYPE user_role AS ENUM ('doctor', 'patient', 'admin')`);

  pgm.sql(`
    CREATE TABLE users (
      -- gen_random_uuid() is built into Postgres 13+, so no pgcrypto
      -- extension is required. UUID over bigserial because ids appear in URLs
      -- and a sequential id leaks how many users exist and allows guessing
      -- neighbouring records.
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Stored as entered; uniqueness and lookup are case-insensitive via the
      -- functional index below. 254 is the RFC 5321 maximum length.
      email         varchar(254) NOT NULL,

      -- argon2id output, ~95 chars at our parameters. Never selected by the
      -- default column list - see users.repository.ts.
      password_hash text         NOT NULL,

      full_name     varchar(200) NOT NULL,
      role          user_role    NOT NULL DEFAULT 'patient',

      -- Token revocation counter, embedded as a claim in every access token.
      -- A stateless JWT is otherwise valid until it expires, with no way to
      -- kill it: bumping this invalidates every token the user holds, which is
      -- what makes "log out everywhere" and "revoke a leaked token" possible.
      token_version integer      NOT NULL DEFAULT 0,

      created_at    timestamptz  NOT NULL DEFAULT now(),
      updated_at    timestamptz  NOT NULL DEFAULT now(),

      -- Soft delete. Deleting a person in a clinical system destroys the audit
      -- trail and would orphan rows in future appointment/prescription tables.
      deleted_at    timestamptz
    )
  `);

  /* Case-insensitive uniqueness WITHOUT the citext extension: this database is
     not ours to install extensions into, and a functional unique index is
     portable everywhere. It doubles as the index backing the login lookup,
     which also matches on lower(email).

     Partial (WHERE deleted_at IS NULL) so a soft-deleted user releases their
     email address for re-registration. */
  pgm.sql(`
    CREATE UNIQUE INDEX users_email_lower_key
      ON users (lower(email))
      WHERE deleted_at IS NULL
  `);

  /* Supports filtering the user list by role. Partial for the same reason: the
     index never needs to describe rows the API cannot return. */
  pgm.sql(`
    CREATE INDEX users_role_idx
      ON users (role)
      WHERE deleted_at IS NULL
  `);

  /* Matches the list query's ORDER BY created_at DESC, id DESC so pagination
     is an index scan rather than a sort of the whole table. */
  pgm.sql(`
    CREATE INDEX users_created_at_idx
      ON users (created_at DESC, id DESC)
      WHERE deleted_at IS NULL
  `);
}

export function down(pgm: MigrationBuilder): void {
  /* Reverse order of creation. Indexes are dropped implicitly with the table;
     the enum type is not, and leaving it behind makes `up` fail on re-run. */
  pgm.sql(`DROP TABLE IF EXISTS users`);
  pgm.sql(`DROP TYPE IF EXISTS user_role`);
}
