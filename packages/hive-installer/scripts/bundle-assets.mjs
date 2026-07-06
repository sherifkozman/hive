#!/usr/bin/env node
// Placeholder for T5 (asset bundling script per spec §3): copying
// skills/{authored,converted,meta}/**/composable/**, tools/hive.py, and
// license/provenance files into assets/. For now this only ensures the
// `assets/` directory exists so `pnpm build` and `files` packaging don't
// fail before T5 implements the real copy logic.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(packageRoot, 'assets');

await mkdir(assetsDir, { recursive: true });
await writeFile(
  path.join(assetsDir, '.placeholder'),
  'Real asset bundling (skills/, tools/hive.py, licenses) lands in T5.\n',
  'utf8',
);
