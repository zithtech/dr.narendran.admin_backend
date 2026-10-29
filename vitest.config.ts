import {defineConfig} from 'vitest/config';

export default defineConfig({
  /* Resolves the "@/*" alias by reading tsconfig.json, so the alias is
     declared in exactly one place instead of being duplicated here. Vite 8
     does this natively - the vite-tsconfig-paths plugin is no longer needed
     (and its transitive tsconfck pins typescript ^5, which conflicts with the
     TypeScript 6 this project uses). */
  resolve: {tsconfigPaths: true},
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    /**
     * The suite is hermetic: it never touches a real database.
     *
     * Every test mocks the repository layer, which is the only thing that
     * talks to Postgres. That is possible precisely because the SQL is
     * confined to one layer - the layering is what makes the HTTP stack
     * testable in isolation.
     *
     * TRADE-OFF, stated plainly: this proves routing, validation, auth,
     * business rules and error mapping. It does NOT prove the SQL itself is
     * correct - no query in users.repository.ts is executed here. That is
     * verified by hand against the live database (see README "Verifying the
     * SQL"). If you later want the SQL covered automatically, point
     * TEST_DATABASE_URL at a scratch database and add repository tests; the
     * env plumbing for it is already in place.
     *
     * These values are set here rather than read from .env so the suite runs
     * identically on a fresh clone and in CI. dotenv does not override
     * variables that are already set, so these win.
     */
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:5432/unused_dev',
      TEST_DATABASE_URL:
        'postgresql://unused:unused@127.0.0.1:5432/unused_test',
      JWT_SECRET: 'test-only-secret-at-least-32-characters-long',
      JWT_EXPIRES_IN: '7d',
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: '',
      TRUST_PROXY_HOPS: '0',
      DB_SSL: 'false',
    },

    /* Each test file builds its own app, and the rate limiters keep their
       counters in module-local memory. Running files in parallel would let one
       file's requests consume another file's rate-limit budget. */
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      /* server.ts is the process entrypoint (listen + signal handlers); it is
         exercised by running the app, not by supertest, which drives
         buildApp() directly. Repository files are excluded because their SQL
         is deliberately not executed here - counting them would report
         coverage the suite has not actually earned. */
      exclude: [
        'src/server.ts',
        'src/**/*.types.ts',
        'src/types/**',
        'src/modules/**/*.repository.ts',
      ],
    },
  },
});
