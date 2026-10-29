/* eslint-disable */
// @ts-nocheck
import {pino} from 'pino';

import {env} from '@/config/env.js';

/**
 * Root structured logger.
 *
 * In production this writes newline-delimited JSON to stdout, which is what
 * every log shipper (CloudWatch, Loki, Datadog, journald) expects. In
 * development it routes through pino-pretty for human-readable output.
 * pino-pretty is a devDependency and is never loaded in production.
 */
export const logger = pino({
  level: env.LOG_LEVEL,

  /* Redaction is applied by pino itself, before anything is serialised, so a
     secret cannot leak by being logged accidentally somewhere downstream. */
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      'password',
      'passwordHash',
      'token',
      '*.privateKey',
      '*.private_key',
      '*.clientEmail',
      '*.client_email',
      'privateKey',
      'private_key',
    ],
    censor: '[redacted]',
  },

  /* ISO timestamps rather than epoch millis - worth the few bytes when you are
     reading logs next to a mobile crash report. */
  timestamp: pino.stdTimeFunctions.isoTime,

  base: {
    service: 'drnarendran-api',
    env: env.NODE_ENV,
  },

  ...(env.IS_PRODUCTION
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service,env',
          },
        },
      }),
});
