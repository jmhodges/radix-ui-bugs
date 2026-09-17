import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// REPRO_USE_FIX=1 swaps @radix-ui/react-focus-scope for ./fixed/focus-scope.mjs, which is
// the published 1.1.16 dist with the fix from the issue applied. `server.deps.inline` makes
// Vitest process the other @radix-ui packages through Vite so the alias also applies to
// Dialog/Popover/DropdownMenu's own import of react-focus-scope.
const useFix = process.env.REPRO_USE_FIX === '1';

export default defineConfig({
  resolve: {
    alias: useFix
      ? { '@radix-ui/react-focus-scope': fileURLToPath(new URL('./fixed/focus-scope.mjs', import.meta.url)) }
      : {},
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.tsx'],
    server: {
      deps: {
        inline: useFix ? [/@radix-ui\//] : [],
      },
    },
  },
});
