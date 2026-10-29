/* eslint-disable */
// @ts-nocheck
import {Router} from 'express';

import {checkDatabaseConnection, getPoolStats} from '@/db/pool.js';
import {isFirebaseConfigured} from '@/config/firebase.js';

export const healthRouter: Router = Router();

/**
 * Readiness: can this instance actually serve traffic?
 *
 * Deliberately queries the database. A health check that returns 200 while the
 * database is unreachable is worse than no health check: a load balancer keeps
 * routing to an instance that fails every request. 503 here takes the instance
 * out of rotation, which is the whole point.
 */
healthRouter.get('/', (req, res) => {
  void (async () => {
    try {
      await checkDatabaseConnection();
      res.status(200).json({
        service: 'drnarendran-admin-backend',
        status: 'ok',
        db: 'up',
        firebase: isFirebaseConfigured() ? 'ready' : 'unconfigured',
        /* Pool occupancy is the first thing worth seeing when the API feels
           slow: a persistently non-zero `waiting` means requests are queueing
           for a connection and DB_POOL_MAX is the bottleneck. */
        pool: getPoolStats(),
        uptimeSeconds: Math.round(process.uptime()),
      });
    } catch (error) {
      /* Logged, not thrown: a failing health check is an expected, reportable
         state, and routing it through the error handler would produce the
         generic error envelope instead of a diagnosable body. */
      console.error('Healthcheck failed:', error);
      res.status(503).json({
        service: 'drnarendran-admin-backend',
        status: 'degraded',
        db: 'down',
        uptimeSeconds: Math.round(process.uptime()),
      });
    }
  })();
});

/**
 * Liveness: is the process alive at all?
 *
 * Never touches the database. Kept separate because the two questions have
 * different answers and different consequences: a liveness probe that fails
 * during a database outage would restart every healthy instance, turning a
 * recoverable outage into an outage plus a thundering herd of restarts.
 */
healthRouter.get('/live', (_req, res) => {
  res
    .status(200)
    .json({service: 'drnarendran-admin-backend', status: 'ok', uptimeSeconds: Math.round(process.uptime())});
});
