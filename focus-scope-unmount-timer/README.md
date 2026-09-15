# FocusScope unmount `setTimeout` fires after Vitest tears down jsdom

Reproduction for the `@radix-ui/react-focus-scope` bug where the effect cleanup's zero-delay
`setTimeout` is never cleared and reads `CustomEvent` / `document` from the global scope when
it fires. If it fires after Vitest has torn down the jsdom environment, those globals are Node's
again, jsdom's `dispatchEvent` rejects Node's `CustomEvent`, and Vitest reports an unhandled
error and exits 1 even though every test passed.

The offending code is `node_modules/@radix-ui/react-focus-scope/dist/index.mjs` lines 94-103
(1.1.16, identical in 1.1.7 and `main`).

## Setup

```sh
npm install   # or: npx npm@12 install   (see "Notes" if npm 10 fails with `edgesOut`)
```

| Software | Version |
| --- | --- |
| @radix-ui/react-focus-scope | 1.1.16 |
| @radix-ui/react-dialog / react-popover / react-dropdown-menu | 1.1.23 / 1.1.23 / 2.1.24 |
| React | 19.2.8 |
| Vitest | 4.1.6 |
| jsdom | 24.1.3 |
| @testing-library/react | 16.3.2 |
| Node | 22 |

## What's in here

- `test/*.test.tsx`: four files, each with a single test that leaves a `Dialog`, `Popover`,
  `DropdownMenu`, or bare `FocusScope` mounted. `cleanup()` in `afterEach` (`test/setup.ts`)
  unmounts it, FocusScope schedules its unmount timer, and nothing else runs before teardown.
- `test/setup.ts`: RTL `cleanup()` in `afterEach`, plus the race forcer and the workaround
  described below, each behind an env var.
- `jsdom-mechanism.cjs`: the underlying failure with no React or Vitest involved.
- `patches/@radix-ui+react-focus-scope+1.1.16.patch`: the issue's suggested fix as a unified
  diff against the published 1.1.16 `dist/index.mjs`.
- `scripts/make-fixed.mjs`: runs on `postinstall` (and before `npm run test:fixed`). Copies the
  installed dist to `fixed/focus-scope.mjs` (gitignored) with the patch applied. It exits 1 if
  the installed version has no patch or a hunk no longer matches exactly, so a dependency bump
  cannot silently drift from the fix under test. `REPRO_USE_FIX=1` aliases the package to the
  generated file (see `vitest.config.mts`), which keeps the buggy and fixed builds runnable from
  one install.

## Forcing the race

Left alone the timer almost always fires before teardown, because the main process has to send
the worker a `stop` message first. To make it lose deterministically, `test/setup.ts` wraps
`setTimeout` and holds zero-delay timers created from react-focus-scope until jsdom's globals are
gone (re-armed every 1 ms, capped at 2 s), then runs the original callback untouched. Nothing
else changes: same callback, same globals-at-fire-time behaviour as the real bug.

`REPRO_RACE_DELAY_MS=5` uses a fixed 5 ms delay instead, like the issue's setup file. On this
machine that lost the race in 24 of 30 single-file runs; the hold-until-teardown default lost it
in 15 of 15.

## Commands

| Command | What it shows |
| --- | --- |
| `npm run jsdom-mechanism` | Plain jsdom: Node's `CustomEvent` is rejected by an element from a closed jsdom window, jsdom's own is fine. |
| `npm run test:log` | The bug. Timer outcomes are logged to stderr; the Dialog file's timer throws after teardown on every run. |
| `npm test` | Same without the logging. |
| `npm run test:fixed` | Patched focus-scope. Timers still fire after teardown and complete normally, exit 0. |
| `npm run test:workaround` | The issue's `afterAll` workaround with the real 0 ms timer: timers run before teardown, exit 0. |
| `npm run test:no-race` | Unforced run for comparison: timers fire before teardown, exit 0. |

Set `REPRO_LOG_TIMER=1` on any of them to log each unmount timer's outcome.

## Observed output

`npm run test:log` (unpatched, one of the runs that exits 1):

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
   Start at  03:36:56
   Duration  1.21s (transform 127ms, setup 395ms, import 224ms, tests 336ms, environment 1.29s)
```

(The `run` / `Timeout.poll` frames are the race forcer in `test/setup.ts` calling the original
callback; with `REPRO_RACE_DELAY_MS=5` the stack is `Timeout._onTimeout` in `index.mjs` as in
the issue.)

`npm run test:fixed` with `REPRO_LOG_TIMER=1` (regenerates `fixed/focus-scope.mjs` first):

```
[repro] focus-scope unmount timer fired: ok | scheduled@555 fired@562 | node globals (jsdom torn down)

 Test Files  4 passed (4)
      Tests  4 passed (4)
```

The timer still fires after teardown but completes, because it uses the captured `CustomEvent`
constructor and the container's `ownerDocument`. The tests themselves pass unchanged in every
mode, including the bare `FocusScope` one that takes the focus hand-back path (the case the
issue notes needs the `document` / `isSelectableInput` edits, not just the `CustomEvent` one).

Counts on this machine (4 CPUs, otherwise idle):

| Run | Unmount timer threw after teardown | Vitest exit 1 |
| --- | --- | --- |
| `npm run test:log`, all 4 files, 16 runs | every run (1-3 timers per run) | 10 of 16 |
| Dialog file alone, hold-until-teardown, 20 runs | 20 of 20 | 0 of 20 |
| Dialog file alone, `REPRO_RACE_DELAY_MS=5`, 30 runs | 24 of 30 | 0 of 30 |

## Why the exit code is intermittent even when the timer throws

The throw itself is deterministic once the timer fires after teardown. Whether Vitest turns it
into exit 1 depends on IPC timing in Vitest 4.1.6's forks pool:

1. Main sends the worker `stop`. The worker tears down jsdom synchronously (globals restored to
   Node's), then sends `stopped`.
2. The worker's uncaught-exception listener is still attached when the timer fires, so it
   forwards the error to main over the same IPC channel.
3. Main handles `stopped` by removing its message listeners for that worker. If the error
   message arrives in the same IPC read as `stopped`, Node emits both `message` events before the
   listener removal runs (nextTick queue drains before promise microtasks) and the error is
   recorded, exit 1. If it arrives in a later read, it is dropped, exit 0.

That is why a single file alone never exits 1 here (main is idle and reads `stopped` right away)
while the four-file run does in more than half the runs (main is busy with the other workers).
Logging the timer's outcome with `REPRO_LOG_TIMER=1` shows the throw regardless of which way
that race goes.

## Notes

- `overrides.nwsapi = 2.2.16` is unrelated to the bug. nwsapi 2.2.27 makes `Element.matches(':modal')`
  recurse for seconds under jsdom 24, and floating-ui calls it from `isTopLayer`, which stalled
  the Popover and DropdownMenu tests for ~11 s each and masked the race.
- npm 10.9 fails this install with `Cannot read properties of null (reading 'edgesOut')`;
  `npx npm@12 install` works.
- If you install with `--ignore-scripts`, run `npm run make-fixed` once before `test:fixed`
  (the script does this itself anyway).
- jsdom 24 has no `PointerEvent`, so the DropdownMenu test opens the menu with the keyboard.
