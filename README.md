# Dr Narendran — Backend API

REST API for the `doctor_app` and `patient_app` React Native clients.

Node 22 · TypeScript 6 (strict) · Express 5 · PostgreSQL 18 via **raw SQL** (`pg`) — no ORM, no query builder.

---

## Quick start

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_SECRET
npm run migrate:up
npm run dev                 # http://localhost:4000/api
```

Node version is pinned in `.nvmrc` (22.23.2). With nvm: `nvm use`.

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Confirm it works

```bash
curl localhost:4000/api/health
# {"status":"ok","db":"up","uptimeSeconds":3}
```

A `db: "down"` with HTTP 503 means the app is running but cannot reach Postgres.

---

## The mobile app contract (do not break these)

Both apps are already built against this API. These are not style choices — changing
any of them requires changing both apps and shipping new builds.

| Contract       | Value                           | Where it is pinned                                                      |
| -------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Port           | **4000**                        | `doctor_app/.env`, `patient_app/.env`                                   |
| Path prefix    | **`/api`**                      | same                                                                    |
| Login response | exactly `{ "token": "..." }`    | `src/features/auth/api/authApi.ts` — rejects anything else              |
| Auth header    | `Authorization: Bearer <token>` | `src/shared/api/client.ts`                                              |
| Error body     | `{ "error": "<message>" }`      | `src/shared/api/errors.ts` reads `data.error`, then `data.message`      |
| Dead session   | **401**, never 403              | a 401 clears the Keychain and returns to Login; a 403 does not          |
| Client timeout | 15s                             | `REQUEST_TIMEOUT_MS` — any slower endpoint looks like a network failure |
| Retries        | GETs retried up to 2×           | so GET handlers must be idempotent; mutations are never retried         |

The apps reach the host at `http://10.0.2.2:4000/api` (Android emulator) and
`http://localhost:4000/api` (iOS simulator). For a physical device, set the
machine's LAN IP in the app's `.env`.

> **Not yet implemented:** both apps have an Items screen that calls `GET /api/items`.
> That route does not exist, so the screen will show an error. Login works.

---

## Endpoints

| Method   | Path                   | Auth          | Notes                                                                      |
| -------- | ---------------------- | ------------- | -------------------------------------------------------------------------- |
| `GET`    | `/api/health`          | —             | Readiness. Pings the DB. 200 or **503**                                    |
| `GET`    | `/api/health/live`     | —             | Liveness. Never touches the DB                                             |
| `POST`   | `/api/auth/login`      | —             | `{email, password}` → `{token}`. Rate limited to 10 failures / 15 min / IP |
| `GET`    | `/api/auth/me`         | token         | The caller's identity, read fresh from the DB                              |
| `POST`   | `/api/auth/logout-all` | token         | Revokes every token this user holds                                        |
| `POST`   | `/api/users`           | —             | Registration. Always creates a **patient**                                 |
| `GET`    | `/api/users`           | token         | `?role=&limit=&offset=`                                                    |
| `GET`    | `/api/users/:id`       | token         |                                                                            |
| `PATCH`  | `/api/users/:id`       | self or admin | Only an admin may change `role`                                            |
| `DELETE` | `/api/users/:id`       | self or admin | Soft delete, 204                                                           |

### Creating the first admin

Registration always produces a patient, by design — so the first admin is made by hand:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

After that, admins promote others through `PATCH /api/users/:id`.

---

## Architecture

```
routes → controllers → services → repositories → db
```

Files are grouped **by feature** (`src/modules/users/`), not by layer. At fifteen
resources, layer-first folders mean every change touches five distant directories
and no single place shows a feature's full surface. The layer is still in the
filename and still enforced.

| Layer            | Does                                                           | Must not                                       |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| **routes**       | Bind method + path, attach guards and a schema                 | Contain logic                                  |
| **controllers**  | Read validated input, call **one** service, shape the response | Write SQL, hold business rules, touch the pool |
| **services**     | Business rules, authorization decisions, hashing, transactions | Write SQL, know about `req`/`res`              |
| **repositories** | Own every SQL string for their table, return typed rows        | Hold business rules, know about HTTP           |
| **db**           | Pool lifecycle, the typed `query` helper, SQLSTATE mapping     | Know about any specific table                  |

```
src/
  config/env.ts          Zod-validated env; throws at import time
  db/
    pool.ts              pg.Pool — every setting justified in a comment
    query.ts             query<T> / queryOne<T> / withTransaction
    errors.ts            Postgres SQLSTATE → typed HTTP errors
  http/
    app.ts               buildApp() — the middleware stack, no listen()
    shutdown.ts          graceful shutdown logic, dependency-injected
    errors.ts            AppError + NotFoundError, ValidationError, …
    middleware/          httpLogger · validate · authenticate · rateLimit · errorHandler
  modules/
    health/ auth/ users/ — each a routes/controller/service/repository/schema/types slice
  server.ts              listen() + signal wiring
migrations/              node-pg-migrate, versioned
tests/                   vitest + supertest
```

**Why `buildApp()` is separate from `server.ts`:** tests hand the app straight to
supertest, exercising the real middleware stack without binding a port or racing
over one.

---

## SQL conventions

### 1. Every value is a parameter. No exceptions.

```ts
// YES
queryOne<User>('SELECT id FROM users WHERE email = $1', [email]);

// NO — never, not even for "internal" values
queryOne<User>(`SELECT id FROM users WHERE email = '${email}'`);
```

This is **enforced mechanically**, not by code review. An ESLint rule
(`no-restricted-syntax` in `eslint.config.ts`) fails the build and the pre-commit
hook on an interpolated value in a SQL position. The rule permits interpolating a
`SCREAMING_SNAKE_CASE` constant (`${USER_COLUMNS}`) because such a constant is fixed
at author time and cannot carry request data — but rejects `${email}`,
`${req.query.sort}`, `${a + b}` and lowercase locals.

That rule is itself covered by `tests/unit/sqlInjectionRule.test.ts`. A malformed
esquery selector silently matches _nothing_, which looks identical to a clean
codebase — this happened once during development, hence the test.

### 2. Identifiers come from a whitelist

Column names cannot be parameterised by the wire protocol. When a sort column must
be dynamic, use `buildOrderBy()` in `db/query.ts`, which takes a key into a
hardcoded map. User input selects a whitelist entry; it never becomes one.

### 3. snake_case in the DB, camelCase in the API

Mapped by explicit aliases in the SQL, not a runtime transform layer:

```sql
SELECT id, full_name AS "fullName", created_at AS "createdAt" FROM users
```

So the row type _is_ the API type, with nothing to go wrong in between.

### 4. One column list per table

`USER_COLUMNS` in `users.repository.ts` is the single definition. Note it excludes
`password_hash` — that can only be obtained through `findByEmailWithPassword`, and
the `User` type has no such field, so a controller cannot leak it through a stray
spread.

### 5. Static SQL over conditional SQL

Optional filters use `($1::user_role IS NULL OR role = $1::user_role)` rather than
appending a WHERE clause. One statement means one cached query plan and no
string-built SQL.

Partial updates use `COALESCE($2, column)`. Consequence: a column updated that way
can never be set to NULL through that path. Fine for non-nullable columns; a
nullable one needs its own statement.

### 6. Soft delete

Every query filters `deleted_at IS NULL`. Deleting a person in a clinical system
would destroy the audit trail and orphan rows in future appointment/prescription
tables. The unique index on `lower(email)` is partial (`WHERE deleted_at IS NULL`),
so a deleted user releases their email for re-registration.

---

## Migrations

```bash
npm run migrate:up                         # apply everything pending
npm run migrate:down                       # roll back the most recent
npm run migrate:create -- add-appointments  # scaffold a new one
```

Driven by `DATABASE_URL`. Applied migrations are tracked in the `pgmigrations` table.

Migrations are written as explicit `pgm.sql(...)` rather than the node-pg-migrate
DSL: in a project whose premise is "the SQL is the interface", a migration should
show the exact DDL that ran.

**Always write a real `down`.** `migrate:down` is verified to reverse the users
migration completely, including the `user_role` enum type — an enum left behind
makes the next `up` fail.

**Per environment:** dev is `npm run migrate:up` locally. Production should run
migrations as a deliberate deploy step _before_ the new code starts, not from
application startup — a migration racing N booting instances is a bad time.

---

## Environment

Validated by Zod in `src/config/env.ts` **at import time**. A missing or malformed
variable crashes the process on boot with a readable list, rather than letting the
app run and fail later on an `undefined`. This is the only module that reads
`process.env`.

Notable variables — full list with comments in `.env.example`:

| Variable           | Notes                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`     | Full connection string                                                                                                                                             |
| `DB_SSL`           | **Currently `false`** — the server reports `ssl = off` and refuses the TLS handshake, so `pg` must not attempt one. Flip to `true` when TLS is enabled server-side |
| `DB_POOL_MAX`      | Per process. Server `max_connections` is 100, shared with other databases on that host                                                                             |
| `JWT_SECRET`       | ≥32 chars, enforced. Rotating it logs everyone out                                                                                                                 |
| `JWT_EXPIRES_IN`   | `7d` — long because the apps have no refresh flow                                                                                                                  |
| `TRUST_PROXY_HOPS` | Exact hop count, **never** `true` (see below)                                                                                                                      |
| `CORS_ORIGINS`     | Comma-separated allowlist; empty = deny all browser origins                                                                                                        |

---

## Security notes

- **Passwords**: argon2id, OWASP-recommended parameters (19 MiB, 2 iterations).
- **Login is constant-work.** An unknown email is compared against a dummy hash so it
  takes the same time as a wrong password. Without that, response timing reveals
  which emails have accounts — for a medical app, that leaks who is a patient.
- **Privilege escalation is closed in two places.** Registration uses `strictObject`
  with no `role` field (a Zod `.default('patient')` would _not_ be enough — a default
  only fills a _missing_ key, so `{"role":"admin"}` would sail past it), and the
  service enforces that only an admin may change a role, because a route guard can
  say "may you touch this record" but not "may you change this field".
- **Token revocation**: `users.token_version` is a claim in every token and is checked
  on every authenticated request. Bumping it kills every token that user holds. The
  cost is one primary-key lookup per request; the benefit is that a leaked token and
  a deleted account both stop working immediately instead of staying valid for 7 days.
  Role and email are also re-read from the DB, so a demotion takes effect at once.
- **`trust proxy` is an exact hop count.** With `true`, Express takes the leftmost
  `X-Forwarded-For`, which the client fully controls — so anyone could present a fresh
  fake IP per request and bypass rate limiting entirely.
- **Rate limits** are in-process. With N instances the effective limit is N× — swap in
  `rate-limit-redis` when a second instance appears.
- **CORS** is an allowlist defaulting to deny. It is inert for the current clients
  (React Native is not a browser and sends no `Origin`); it is configured for the web
  admin these projects usually grow.
- **helmet** runs with CSP and HSTS off, deliberately: this API serves only JSON, so a
  CSP protects nothing, and HSTS is meaningless until TLS terminates in front of it.

---

## Testing

```bash
npm test              # 96 tests
npm run test:watch
npm run test:coverage
```

**The suite never touches a real database.** Every test mocks the repository layer —
possible precisely because all SQL is confined to one layer. Routing, validation,
auth, business rules, error mapping and shutdown ordering all run for real.

### What this does NOT cover

**The SQL itself is not executed by any test.** No query in `users.repository.ts`
runs during `npm test`. That is a deliberate, accepted gap — it was verified by hand
against the live database instead (see below). If you want it covered automatically,
point `TEST_DATABASE_URL` at a scratch database and add repository tests; the env
plumbing and the "refuse to run against the dev DB" guard are already in place.

Also untested: real signal delivery. Windows has no POSIX signals, so `SIGTERM`
handling only genuinely runs on the Linux host this deploys to. The shutdown
_logic_ — ordering, idempotency, force-exit deadline — is fully unit tested via
dependency injection in `src/http/shutdown.ts`.

### Verifying the SQL by hand

Until repository tests exist, changes to raw SQL should be checked against a live
database:

```bash
npm run dev
BASE=http://localhost:4000/api

curl -s $BASE/health
curl -s -X POST $BASE/users -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"correct-horse-battery","fullName":"A"}'
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"correct-horse-battery"}' | jq -r .token)
curl -s $BASE/users -H "Authorization: Bearer $TOKEN"
```

Full sequence exercised during development: create → duplicate (409) → validation
(400) → login (200/401) → unauthenticated (401) → get/patch/delete → soft-delete
invisibility → email reuse after delete → token revocation → rate limit (429).

---

## Scripts

| Script                                                   | Does                                            |
| -------------------------------------------------------- | ----------------------------------------------- |
| `npm run dev`                                            | Hot-reloading server (tsx watch)                |
| `npm run build`                                          | `tsc` then `tsc-alias` → `dist/`                |
| `npm start`                                              | Run the compiled build                          |
| `npm run lint` / `lint:fix`                              | ESLint, zero warnings tolerated                 |
| `npm run format` / `format:check`                        | Prettier                                        |
| `npm run typecheck`                                      | `tsc --noEmit` across src, tests and migrations |
| `npm test` / `test:watch` / `test:coverage`              | Vitest                                          |
| `npm run migrate:up` / `migrate:down` / `migrate:create` | node-pg-migrate                                 |
| `npm run verify`                                         | typecheck + lint + test — run before pushing    |

**Why `build` is two commands:** `tsc` type-checks the `@/` alias but emits it
verbatim, and Node cannot resolve it. `tsc-alias` rewrites those to relative paths
in `dist/`. This is the one piece of build glue in the project; if `npm start`
fails with a module-not-found on `@/…`, `tsc-alias` did not run.

**Why Vitest over Jest:** Jest on a TS/ESM backend needs a `ts-jest` or Babel
transform layer plus a `moduleNameMapper` duplicating the `@/` alias — config that
rots. Vitest runs TS natively, resolves tsconfig paths, and has first-class ESM. The
RN apps use Jest only because `@react-native/jest-preset` requires it.

---

## Pre-commit hook

Husky runs `lint-staged` (ESLint + Prettier on staged files) then a **project-wide**
`tsc --noEmit`. Project-wide is deliberate: a staged file can type-check perfectly on
its own while breaking every one of its callers.

If the hook does not fire, run `npm install` (it triggers `husky` via `prepare`).

---

## Decisions that need team buy-in

1. **The clinical domain is entirely undefined.** Neither app contains a doctor,
   patient, appointment or prescription model — just a placeholder `Item {id, title}`.
   Designing those tables is the real next step.
2. **`GET /api/items`** — the apps call it and it does not exist. Build the real
   clinical resources, or stub it?
3. **Doctor/patient profile tables.** `users` holds identity only; specialty, licence
   number, date of birth and MRN need their own tables keyed on `users.id`.
4. **Token lifetime.** 7 days only because the apps cannot refresh. Shortening it
   needs `/auth/refresh` _and_ app changes.
5. **Deployment target** — undecided. It determines TLS termination and the correct
   `TRUST_PROXY_HOPS`.
6. **Automated SQL tests** — currently none (see Testing).
7. **npm across all three projects**, consistent with `doctor_app` and `patient_app`.
8. **PHI/compliance.** A medical app usually implies audit logging, encryption at
   rest and retention rules. Cheap to design in now, expensive to retrofit.

---

## Firebase Admin SDK & Push Notifications (FCM)

The backend uses `firebase-admin` to send push notifications to Doctor and Patient apps.

### Setup Instructions

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select or create your Firebase project.
3. Go to **Project Settings** (gear icon) → **Service Accounts** → **Firebase Admin SDK**.
4. Click **Generate New Private Key** to download the JSON service account file.
5. In your local `.env` file, populate the following environment variables using values from the JSON:

```bash
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> **Security Note:** Never commit `service-account.json` or paste real private keys into source control. All `*firebase*.json` files are automatically ignored in `.gitignore`. In production, supply these variables through your cloud secrets manager.

