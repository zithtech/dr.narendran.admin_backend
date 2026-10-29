/**
 * Graceful shutdown logic, isolated from signal delivery.
 *
 * Kept in its own module with injected dependencies for a practical reason:
 * Windows has no POSIX signals (Node's `process.kill` there is an
 * unconditional terminate, so a SIGTERM handler never runs), which makes the
 * shutdown path impossible to exercise on a Windows dev machine if it is
 * welded to `process.on('SIGTERM')`. Separating the two means the ORDERING and
 * TIMEOUT behaviour - the parts that actually cause outages when wrong - are
 * unit-testable everywhere, and `server.ts` is left with only the wiring.
 */

export interface ShutdownDeps {
  /** Stops accepting new connections and resolves once in-flight ones finish. */
  closeServer: () => Promise<void>;
  /** Closes the database pool. */
  closePool: () => Promise<void>;
  log: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
  /** Injected so tests do not actually terminate the runner. */
  exit: (code: number) => void;
  /** Hard deadline before giving up and exiting non-zero. */
  graceMs: number;
}

export function createShutdownHandler(
  deps: ShutdownDeps,
): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    /* A second Ctrl-C, or a SIGTERM arriving while an unhandledRejection
       shutdown is already running, must not start a competing teardown. */
    if (shuttingDown) {
      deps.log.warn({signal}, 'Shutdown already in progress');
      return;
    }
    shuttingDown = true;

    deps.log.info({signal}, 'Shutting down');

    /* Hard deadline. If a request hangs on a wedged socket or a stuck query,
       exit anyway rather than sitting half-dead until the orchestrator
       SIGKILLs us. unref() so the timer itself cannot hold the process open. */
    const forceExit = setTimeout(() => {
      deps.log.error({signal}, 'Graceful shutdown timed out; forcing exit');
      deps.exit(1);
    }, deps.graceMs);
    forceExit.unref();

    try {
      /* ORDER MATTERS: stop taking new connections and drain in-flight
         requests BEFORE closing the pool. Closing the pool first would fail
         every request still in progress. */
      await deps.closeServer();
      deps.log.info({signal}, 'HTTP server closed');

      await deps.closePool();
      deps.log.info({signal}, 'Database pool closed');

      clearTimeout(forceExit);
      deps.exit(0);
    } catch (error) {
      deps.log.error({err: error, signal}, 'Error during shutdown');
      clearTimeout(forceExit);
      deps.exit(1);
    }
  };
}
