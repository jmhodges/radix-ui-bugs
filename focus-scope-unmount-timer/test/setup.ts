import { afterAll, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Step 1 of the issue: RTL cleanup() in afterEach unmounts whatever the last test left open.
afterEach(() => {
  cleanup();
});

const realSetTimeout = globalThis.setTimeout;

// ---------------------------------------------------------------------------------------------
// Forcing the race (REPRO_FORCE_RACE, default on)
//
// FocusScope's effect cleanup schedules `setTimeout(cb, 0)` and never clears it. In a real run
// that timer races Vitest's environment teardown and only rarely loses (~1 in 700 CI runs per
// the issue). To make it lose on purpose, zero-delay timers created from react-focus-scope are
// held back:
//   - REPRO_RACE_DELAY_MS=<n>  fixed delay, like the issue's 5 ms setup file
//   - default                  re-armed every 1 ms until jsdom's globals are gone (teardown
//                              observed) or 2 s have passed, then run
// Nothing else about the timer is changed: same callback, same realm globals at fire time.
// ---------------------------------------------------------------------------------------------
const forceRace = process.env.REPRO_FORCE_RACE !== '0';
const FOCUS_SCOPE_FRAME = /react-focus-scope|fixed[\\/]focus-scope\.mjs/;
const fixedDelayMs = process.env.REPRO_RACE_DELAY_MS ? Number(process.env.REPRO_RACE_DELAY_MS) : undefined;
const MAX_HOLD_MS = 2000;

const jsdomTornDown = () => typeof globalThis.document === 'undefined';

if (forceRace) {
  const patched = function setTimeout(
    this: unknown,
    cb: (...args: any[]) => void,
    delay?: number,
    ...args: any[]
  ) {
    // Only the timer whose direct caller is react-focus-scope's effect cleanup. (jsdom itself
    // schedules zero-delay timers from inside `element.focus()`, which focus-scope also calls.)
    const caller = (new Error().stack ?? '').split('\n').find((line) => line.includes(' at ') && !line.includes('test/setup.ts'));
    const fromFocusScope = (delay ?? 0) === 0 && FOCUS_SCOPE_FRAME.test(caller ?? '');
    if (!fromFocusScope) return realSetTimeout.call(this, cb, delay, ...args);

    const scheduledAt = performance.now();
    const outcome = (result: string) => {
      if (process.env.REPRO_LOG_TIMER === '1') {
        // Written straight to stderr so it survives the environment teardown.
        const realm = jsdomTornDown() ? 'node globals (jsdom torn down)' : 'jsdom globals';
        process.stderr.write(
          `[repro] focus-scope unmount timer fired: ${result} | pid=${process.pid} scheduled@${scheduledAt.toFixed(0)} fired@${performance.now().toFixed(0)} | ${realm}\n`
        );
      }
    };
    const run = () => {
      try {
        cb(...args);
        outcome('ok');
      } catch (error) {
        outcome(`threw ${String(error)}`);
        throw error; // re-throw so Vitest sees the same uncaught exception a real run does
      }
    };
    if (fixedDelayMs !== undefined) return realSetTimeout.call(this, run, fixedDelayMs);
    const poll = () => {
      if (jsdomTornDown() || performance.now() - scheduledAt > MAX_HOLD_MS) run();
      else realSetTimeout(poll, 1);
    };
    return realSetTimeout.call(this, poll, 1);
  } as unknown as typeof setTimeout;
  patched.__promisify__ = realSetTimeout.__promisify__;
  globalThis.setTimeout = patched;
}

// ---------------------------------------------------------------------------------------------
// Workaround from the issue (REPRO_WORKAROUND=1): wait one macrotask before the file's
// environment is torn down. Node fires same-delay timers in creation order, so the unmount timer
// scheduled by cleanup() runs first. Note this only helps when the timer keeps its real 0 ms
// delay, so it is combined with REPRO_FORCE_RACE=0 in `npm run test:workaround`.
// ---------------------------------------------------------------------------------------------
if (process.env.REPRO_WORKAROUND === '1') {
  afterAll(() => new Promise<void>((resolve) => realSetTimeout(resolve, 0)));
}

