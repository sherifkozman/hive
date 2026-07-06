import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hashTree } from './hashTree.js';

/**
 * Filename of the per-install manifest written inside an installed
 * skill directory (spec §4 "Install artifact per strategy"). The
 * install *engine* (a later task) is what actually writes this file;
 * this module defines the shared type + hashing convention so both the
 * engine and restore()'s deletion-safety check (backup.ts) agree on it.
 */
export const INSTALL_MANIFEST_FILENAME = '.hive-install.json';

export interface InstallManifest {
  skillName: string;
  skillVersion: string;
  /** hashTree() of the installed tree, computed with this file excluded. */
  treeSha256: string;
  installerVersion: string;
  installedAt: string;
}

/** Returns undefined if the manifest is missing or unparsable — never throws. */
export async function readInstallManifest(
  absSkillDir: string,
): Promise<InstallManifest | undefined> {
  try {
    const raw = await fs.readFile(path.join(absSkillDir, INSTALL_MANIFEST_FILENAME), 'utf8');
    return JSON.parse(raw) as InstallManifest;
  } catch {
    return undefined;
  }
}

/** hashTree() of `absSkillDir`, excluding the manifest file itself. */
export async function computeInstalledTreeHash(absSkillDir: string): Promise<string> {
  return hashTree(absSkillDir, { exclude: [INSTALL_MANIFEST_FILENAME] });
}
