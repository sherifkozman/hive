import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, '..', 'src');
const allowedFile = path.join(srcDir, 'core', 'paths.ts');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...listTsFiles(abs));
    } else if (entry.endsWith('.ts')) {
      out.push(abs);
    }
  }
  return out;
}

describe('os.homedir() containment', () => {
  it('is only referenced from src/core/paths.ts', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(srcDir)) {
      if (file === allowedFile) continue;
      const contents = readFileSync(file, 'utf8');
      if (contents.includes('homedir(')) {
        offenders.push(path.relative(srcDir, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('paths.ts itself does call os.homedir() (sanity check the guard works)', () => {
    const contents = readFileSync(allowedFile, 'utf8');
    expect(contents).toContain('homedir(');
  });
});
