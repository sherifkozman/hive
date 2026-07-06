import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  dts: false,
  sourcemap: false,
  splitting: false,
  shims: false,
  // Bundle every runtime dependency into the single dist/cli.js output
  // (spec §5/G2: `npx <tarball> --help`/`scan --json` must work from the
  // tarball alone, no network/npm-install step). tsup's default treats
  // package.json dependencies as external — the opposite of what a
  // shipped CLI needs — so every one of this package's three runtime
  // deps (plus their own transitive deps, e.g. @clack/prompts ->
  // @clack/core) is force-inlined here instead.
  noExternal: ['commander', '@clack/prompts', '@clack/core', 'picocolors'],
  // src/cli.ts starts with a `#!/usr/bin/env node` shebang; tsup preserves it
  // and marks the output file executable.
});
