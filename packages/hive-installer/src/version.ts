// Kept in sync with the "version" field in package.json. Reading
// package.json at runtime via JSON import/fs is avoided here because it
// complicates the bundled dist/cli.js path resolution; a later task may
// replace this with a tsup `define` build-time constant.
export const INSTALLER_VERSION = '0.1.0';
