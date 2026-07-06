import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface HashTreeOptions {
  /** File or directory basenames (or relPaths) to skip, e.g. the install manifest itself. */
  exclude?: string[];
}

interface CollectedEntry {
  relPath: string;
  content: Buffer;
}

async function collect(
  root: string,
  dir: string,
  exclude: Set<string>,
  out: CollectedEntry[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const relPath = path.relative(root, abs);
    if (exclude.has(entry.name) || exclude.has(relPath)) continue;

    if (entry.isDirectory()) {
      await collect(root, abs, exclude, out);
    } else if (entry.isFile()) {
      out.push({ relPath, content: await fs.readFile(abs) });
    } else if (entry.isSymbolicLink()) {
      const target = await fs.readlink(abs);
      out.push({ relPath, content: Buffer.from(target, 'utf8') });
    }
  }
}

/**
 * Deterministic content fingerprint of a directory tree: sha256 over the
 * sorted (relPath, sha256(content)) pairs of every file (symlinks are
 * fingerprinted by their target string, not followed). Used by
 * installManifest.ts to detect drift/tampering in an installed skill
 * tree, and reusable by any later module that needs the same notion of
 * "has this tree changed since we last looked at it".
 */
export async function hashTree(rootDir: string, options: HashTreeOptions = {}): Promise<string> {
  const exclude = new Set(options.exclude ?? []);
  const entries: CollectedEntry[] = [];
  await collect(rootDir, rootDir, exclude, entries);
  entries.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(entry.relPath);
    hash.update('\0');
    hash.update(createHash('sha256').update(entry.content).digest('hex'));
    hash.update('\n');
  }
  return hash.digest('hex');
}
