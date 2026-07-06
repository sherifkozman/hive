#!/usr/bin/env node
import { Command } from 'commander';

// Placeholder version; kept in sync with package.json manually until T5/T7
// wire up a build-time constant. See src/version.ts.
import { INSTALLER_VERSION } from './version.js';

const program = new Command();

program
  .name('hive-skills')
  .description(
    'Interactive installer for Hive CCS skills across AI coding clients',
  )
  .version(INSTALLER_VERSION);

// Subcommands (scan, install, propose, doctor, backup, restore, list) land
// in a later task (T7). This stub only proves the CLI scaffold builds and
// runs end-to-end.
program.parse(process.argv);
