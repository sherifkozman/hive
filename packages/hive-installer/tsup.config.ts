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
  // src/cli.ts starts with a `#!/usr/bin/env node` shebang; tsup preserves it
  // and marks the output file executable.
});
