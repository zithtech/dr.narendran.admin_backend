/* eslint-disable */
// @ts-nocheck
import type {Server} from 'node:http';

import {env} from '@/config/env.js';
import {initializeFirebase} from '@/config/firebase.js';
import {closePool, verifyDatabaseConnection} from '@/db/pool.js';
import {buildApp} from '@/http/app.js';
import {createShutdownHandler} from '@/http/shutdown.js';
import {initSocket} from '@/socket/index.js';
import {followUpSchedulerService} from '@/modules/prescriptions/followUpScheduler.service.js';
import {medicineDoseSchedulerService} from '@/modules/prescriptions/medicineDoseScheduler.service.js';
import {appointmentReminderService} from '@/modules/appointments/appointmentReminder.service.js';
import {medicineReminderService} from '@/modules/prescriptions/medicineReminder.service.js';

const SHUTDOWN_GRACE_MS = 15_000;

const app = buildApp();

void verifyDatabaseConnection();
initializeFirebase();

const server: Server = app.listen(env.PORT, () => {
  console.log(`[Admin Backend] API listening on http://localhost:${String(env.PORT)}/api`);
});

// Initialize Socket.IO on the HTTP server
initSocket(server);

// Start background workers only if explicitly enabled
if (env.ENABLE_SCHEDULERS) {
  // Start automated follow-up reminder scheduler
  followUpSchedulerService.start();

  // Start automated medicine dose reminders and adherence scheduler
  medicineDoseSchedulerService.start();

  // Start background reminder workers
  appointmentReminderService.startReminderWorker();
  medicineReminderService.startWorker();
} else {
  console.log('[Admin Backend] Background schedulers are disabled (handled by main backend)');
}

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const shutdown = createShutdownHandler({
  closeServer: () =>
    new Promise<void>((resolve, reject) => {
      if (env.ENABLE_SCHEDULERS) {
        appointmentReminderService.stopReminderWorker();
        medicineReminderService.stopWorker();
      }
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    }),
  closePool,
  log: {
    info: console.log,
    warn: console.warn,
    error: console.error,
  },
  exit: code => process.exit(code),
  graceMs: SHUTDOWN_GRACE_MS,
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled promise rejection:', reason);
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
  void shutdown('uncaughtException');
});
