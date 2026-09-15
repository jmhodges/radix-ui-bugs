# radix-ui-bugs

Standalone reproductions of Radix UI bugs. Each directory is its own npm project with a README
describing the bug, how to run it, and what to expect.

| Directory | Bug |
| --- | --- |
| [`focus-scope-unmount-timer/`](./focus-scope-unmount-timer) | `FocusScope`'s unmount `setTimeout` is never cleared and reads realm globals, so it throws after Vitest tears down jsdom |
