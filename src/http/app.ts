/* eslint-disable */
// @ts-nocheck
import path from 'node:path';

import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from '@/config/env.js';
import { apiRouter } from '@/routes.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpLogger } from './middleware/httpLogger.js';
import { apiRateLimiter } from './middleware/rateLimit.js';

/**
 * Builds the Express application WITHOUT starting a server.
 *
 * The separation matters: `server.ts` owns listening and signal handling,
 * while the integration tests hand this app straight to supertest. That means
 * tests exercise the real middleware stack - the same helmet, the same rate
 * limiter, the same error handler - without binding a port or racing over one.
 *
 * Middleware order below is load-bearing and is listed in execution order.
 */
export function buildApp(): Express {
  const app = express();

  /* 1. Proxy trust. Must be set before anything reads req.ip - the rate
        limiter does.
        This is an exact hop count, never `true`. With `true`, Express takes
        the left-most X-Forwarded-For value, which the client fully controls,
        so anyone could present a fresh fake IP per request and bypass rate
        limiting entirely. express-rate-limit v8 refuses to start under a
        permissive setting for exactly this reason. */
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  /* Removes the default `X-Powered-By: Express` header. helmet does this too;
     set explicitly so it survives a helmet reconfiguration. */
  app.disable('x-powered-by');

  /* 2. Security headers, before anything can produce a response. */
  app.use(
    helmet({
      /* This API returns only JSON and serves no HTML, so a Content Security
         Policy has nothing to protect: there is no document for a browser to
         execute scripts in. Leaving the default CSP on would only add bytes to
         every response. Re-enable it the moment this app serves any HTML. */
      contentSecurityPolicy: false,
      /* HSTS is meaningful only over HTTPS. TLS terminates upstream (not
         decided yet), so it is off here to avoid pinning clients to HTTPS on a
         plain-HTTP deployment and locking them out. Turn on at the proxy, or
         here once TLS is in front. */
      hsts: false,
    }),
  );

  /* 3. CORS. Allowlist only, never `*`.
        This is inert for the current clients: React Native is native code, not
        a browser, so it sends no Origin header and CORS never applies. It is
        configured properly anyway for the web admin that these projects
        usually grow, and because an unconfigured `cors()` defaults to
        reflecting every origin. */
  app.use(
    cors({
      origin: env.CORS_ORIGIN_LIST.length > 0 ? env.CORS_ORIGIN_LIST : false,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 86_400,
    }),
  );

  /* 4. Request logging. Mounted before the body parser so a
        malformed-JSON 400 is still logged. */
  app.use(httpLogger);
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`[${req.method}] ${req.url} - ${res.statusCode} [${ms}ms]`);
    });
    next();
  });

  /* 5. Body parsing. The 100kb cap is explicit rather than implied: this API
        accepts small JSON documents only, and an unbounded parser is a trivial
        memory-exhaustion vector. Raise it per-route if a route ever needs to. */
  /* Route-specific body parsers for large payloads */
  app.use('/api/prescription-templates', express.json({ limit: '15mb' }));
  app.use('/api/prescription-templates', express.urlencoded({ extended: false, limit: '15mb' }));

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  /* Static serving for profile images and uploads */
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  /* 6. Broad rate limit across the whole API. The tighter login-specific
        limiter is mounted on that route in auth.routes.ts. */
  app.use('/api', apiRateLimiter);

  /* 7. The API itself. /api matches the baseURL both mobile apps compile in. */
  app.use('/api', apiRouter);

  /* 8. Nothing matched -> typed 404 in the standard error envelope. */
  app.use(notFoundHandler);

  /* 9. The single error formatter. MUST be last, and MUST keep its four
        parameters - Express identifies an error handler by arity, so dropping
        the unused `next` silently turns this into ordinary middleware that
        never runs. */
  app.use(errorHandler);

  return app;
}
