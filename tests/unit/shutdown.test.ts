import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createShutdownHandler, type ShutdownDeps} from '@/http/shutdown.js';

/**
 * These cover the two things that actually cause outages when shutdown is
 * wrong: doing the steps in the wrong ORDER (killing the pool while requests
 * are still running) and hanging forever with no deadline.
 */

function makeDeps(overrides: Partial<ShutdownDeps> = {}): ShutdownDeps & {
  order: string[];
} {
  const order: string[] = [];

  return {
    order,
    closeServer: vi.fn(() => {
      order.push('server');
      return Promise.resolve();
    }),
    closePool: vi.fn(() => {
      order.push('pool');
      return Promise.resolve();
    }),
    log: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
    exit: vi.fn(code => {
      order.push(`exit:${String(code)}`);
    }),
    graceMs: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createShutdownHandler', () => {
  it('closes the server BEFORE the pool, then exits 0', async () => {
    const deps = makeDeps();
    await createShutdownHandler(deps)('SIGTERM');

    /* Reversing these would fail every in-flight request, because the pool
       would be gone while handlers were still using it. */
    expect(deps.order).toEqual(['server', 'pool', 'exit:0']);
  });

  it('ignores a second signal while already shutting down', async () => {
    const deps = makeDeps();
    const shutdown = createShutdownHandler(deps);

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(deps.closeServer).toHaveBeenCalledTimes(1);
    expect(deps.closePool).toHaveBeenCalledTimes(1);
    expect(deps.log.warn).toHaveBeenCalledWith(
      {signal: 'SIGINT'},
      'Shutdown already in progress',
    );
  });

  it('exits 1 when closing the server fails', async () => {
    const deps = makeDeps({
      closeServer: vi.fn().mockRejectedValue(new Error('still listening')),
    });

    await createShutdownHandler(deps)('SIGTERM');

    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(deps.closePool).not.toHaveBeenCalled();
  });

  it('exits 1 when closing the pool fails', async () => {
    const deps = makeDeps({
      closePool: vi.fn().mockRejectedValue(new Error('pool stuck')),
    });

    await createShutdownHandler(deps)('SIGTERM');

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('force-exits when a hung request blocks the drain past the deadline', async () => {
    /* Never resolves - models a wedged socket or a stuck query. */
    const deps = makeDeps({
      closeServer: vi.fn(() => new Promise<void>(() => undefined)),
      graceMs: 15_000,
    });

    void createShutdownHandler(deps)('SIGTERM');

    /* Before the deadline: still waiting, correctly. */
    await vi.advanceTimersByTimeAsync(14_999);
    expect(deps.exit).not.toHaveBeenCalled();

    /* After it: give up rather than hang until the orchestrator SIGKILLs us. */
    await vi.advanceTimersByTimeAsync(2);
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('does not force-exit after a clean shutdown', async () => {
    const deps = makeDeps({graceMs: 1000});

    await createShutdownHandler(deps)('SIGTERM');
    await vi.advanceTimersByTimeAsync(5000);

    /* The deadline timer must be cleared on success; otherwise a clean exit(0)
       is followed by a spurious exit(1). */
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
