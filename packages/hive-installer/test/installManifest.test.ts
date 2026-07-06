import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashTree } from '../src/core/hashTree.js';
import {
  computeInstalledTreeHash,
  INSTALL_MANIFEST_FILENAME,
  readInstallManifest,
  type InstallManifest,
} from '../src/core/installManifest.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'hive-install-manifest-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('installManifest', () => {
  it('INSTALL_MANIFEST_FILENAME is .hive-install.json', () => {
    expect(INSTALL_MANIFEST_FILENAME).toBe('.hive-install.json');
  });

  it('readInstallManifest returns undefined when no manifest file exists', async () => {
    await mkdir(tmp, { recursive: true });
    expect(await readInstallManifest(tmp)).toBeUndefined();
  });

  it('readInstallManifest returns undefined for corrupt JSON rather than throwing', async () => {
    await writeFile(path.join(tmp, INSTALL_MANIFEST_FILENAME), 'not json{{{');
    expect(await readInstallManifest(tmp)).toBeUndefined();
  });

  it('readInstallManifest parses a valid manifest', async () => {
    const manifest: InstallManifest = {
      skillName: 'hive-foo',
      skillVersion: '1.0.0',
      treeSha256: 'deadbeef',
      installerVersion: '0.1.0',
      installedAt: new Date(0).toISOString(),
    };
    await writeFile(path.join(tmp, INSTALL_MANIFEST_FILENAME), JSON.stringify(manifest));
    expect(await readInstallManifest(tmp)).toEqual(manifest);
  });

  it('computeInstalledTreeHash excludes the manifest file itself from the hash', async () => {
    await writeFile(path.join(tmp, 'SKILL.md'), 'body');
    const before = await computeInstalledTreeHash(tmp);
    await writeFile(
      path.join(tmp, INSTALL_MANIFEST_FILENAME),
      JSON.stringify({ skillName: 'x' }),
    );
    const after = await computeInstalledTreeHash(tmp);
    expect(after).toBe(before);
  });

  it('computeInstalledTreeHash matches hashTree with the manifest excluded', async () => {
    await writeFile(path.join(tmp, 'SKILL.md'), 'body');
    const direct = await hashTree(tmp, { exclude: [INSTALL_MANIFEST_FILENAME] });
    expect(await computeInstalledTreeHash(tmp)).toBe(direct);
  });
});
