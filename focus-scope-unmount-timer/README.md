# FocusScope unmount `setTimeout` fires after Vitest tears down jsdom

`@radix-ui/react-focus-scope`'s effect cleanup schedules a zero-delay `setTimeout` that is never
cleared and reads `CustomEvent` / `document` from the global scope when it fires. If that is
after Vitest has torn down jsdom, the globals are Node's again, jsdom's `dispatchEvent` rejects
Node's `CustomEvent`, and Vitest reports an unhandled error and exits 1 with every test passing.

To see it:

```sh
npx npm@12 install        # npm 10.9 fails with `edgesOut`
npm run test:log          # every test passes, "Errors 1 error", exit 1
npm run test:fixed        # same tests with the issue's fix applied, exit 0
```

`test:log` prints each unmount timer's outcome to stderr. The throw after teardown shows up on
every run, and the exit 1 on about half of them (see "Why the exit code is intermittent").

The code is `dist/index.mjs` lines 94-103 of 1.1.16 (same in 1.1.7 and `main`).

## What's in here

- `test/*.test.tsx`: one test per file, each leaving a `Dialog`, `Popover`, `DropdownMenu`, or
  bare `FocusScope` mounted so `cleanup()` in `afterEach` schedules the unmount timer right
  before teardown.
- `test/setup.ts`: that `cleanup()`, the race forcer, and the issue's workaround, behind env vars.
- `jsdom-mechanism.cjs`: the `dispatchEvent` rejection in plain jsdom.
- `patches/*.patch`: the issue's suggested fix as a diff against the published dist.
  `scripts/make-fixed.mjs` applies it to the installed package on `postinstall`, writing the
  gitignored `fixed/focus-scope.mjs`, and fails if the version or hunks no longer match.
  `REPRO_USE_FIX=1` aliases the package to that file.

## Forcing the race

Left alone the timer nearly always fires before teardown, because the main process has to send
the worker a `stop` message first. So `test/setup.ts` wraps `setTimeout` and holds the timer
whose direct caller is the focus-scope cleanup until jsdom's globals are gone (re-armed every
1 ms, capped at 2 s), then runs the original callback untouched. `REPRO_RACE_DELAY_MS=5` uses a
fixed delay instead, like the issue's setup file. On this machine that lost the race in 24 of 30
single-file runs versus 20 of 20 for the default.

## Commands

| Command | Result |
| --- | --- |
| `npm run jsdom-mechanism` | Node's `CustomEvent` is rejected by an element from a closed jsdom window; jsdom's own is fine. |
| `npm run test:log` | The bug, with each unmount timer's outcome logged to stderr. |
| `npm test` | Same, without the log. |
| `npm run test:fixed` | Patched build: the timer still fires after teardown and completes. Exit 0. |
| `npm run test:workaround` | The issue's `afterAll` macrotask wait, timer unforced. Exit 0. |
| `npm run test:no-race` | Unforced, for comparison. Exit 0. |

`REPRO_LOG_TIMER=1` adds the log to any of them.

## Observed output

`npm run test:log`, one of the runs that exits 1:

```
 RUN  v4.1.6 /home/user/radix-ui-bugs/focus-scope-unmount-timer
[repro] focus-scope unmount timer fired: threw TypeError: Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'. | scheduled@687 fired@698 | node globals (jsdom torn down)

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'.
 ❯ Object.exports.convert node_modules/jsdom/lib/jsdom/living/generated/Event.js:22:9
 ❯ HTMLDivElement.dispatchEvent node_modules/jsdom/lib/jsdom/living/generated/EventTarget.js:236:24
 ❯ node_modules/@radix-ui/react-focus-scope/dist/index.mjs:97:23
 ❯ run test/setup.ts:55:9
 ❯ Timeout.poll [as _onTimeout] test/setup.ts:64:77
 ❯ listOnTimeout node:internal/timers:585:17
 ❯ processTimers node:internal/timers:521:7

This error originated in "test/dialog-left-open.test.tsx" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.

 Test Files  4 passed (4)
      Tests  4 passed (4)
     Errors  1 error
```

The `run` / `Timeout.poll` frames are the race forcer. With `REPRO_RACE_DELAY_MS=5` the stack is
`Timeout._onTimeout` in `index.mjs` as in the issue.

`npm run test:fixed` with the log:

```
[repro] focus-scope unmount timer fired: ok | scheduled@555 fired@562 | node globals (jsdom torn down)

 Test Files  4 passed (4)
      Tests  4 passed (4)
```

The bare `FocusScope` file takes the focus hand-back path, which is why the fix needs the
`document` / `isSelectableInput` edits and not just the captured `CustomEvent`.

## Why the exit code is intermittent

The throw is deterministic once the timer fires after teardown. Whether Vitest counts it depends
on IPC timing in the 4.1.6 forks pool. The worker tears down jsdom on `stop`, sends `stopped`,
and its uncaught-exception listener then forwards the timer's error over the same channel. Main
removes that worker's listeners when it handles `stopped`. If the error arrives in the same IPC
read, both `message` events are emitted before the removal (nextTick drains before promise
microtasks) and the run exits 1. In a later read it is dropped and the run exits 0.

On this 4-CPU machine, the four-file run exited 1 in 10 of 16 runs and a single file alone in 0
of 50, main being idle enough to read `stopped` on its own.

## Notes

- `overrides.nwsapi = 2.2.16` is unrelated to the bug. 2.2.27 makes `matches(':modal')`, which
  floating-ui calls, recurse for ~11 s under jsdom 24, masking the race in the Popover and
  DropdownMenu files.
- jsdom 24 has no `PointerEvent`, so the DropdownMenu test opens the menu with the keyboard.
