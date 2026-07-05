# Third-Party Notices

This repository is licensed under the MIT License (see `LICENSE`) for
everything authored in this project: the CCS specification, the
`tools/hive.py` CLI, the eight reference skills, and the evaluation harness.

The `skills/sources/` directory is an exception: it vendors third-party source
material, **unmodified**, that was used as input to the framework's
benchmarking and conversion experiments. That material is not relicensed by
this project. It is reproduced here, alongside its own `PROVENANCE.md`, so the
benchmark and conversion work in `docs/BENCHMARKS.md` and `docs/CONVERSION.md`
is reproducible. This file records what is vendored, where it came from, and
what license information is available for it.

## `skills/sources/anthropic/`

- **Source:** [`github.com/anthropics/skills`](https://github.com/anthropics/skills),
  the `skills/mcp-builder` and `skills/internal-comms` directories.
- **Used for:** Experiment 6 in `docs/BENCHMARKS.md`, a supplemental
  validation of the CCS conversion process against two official Anthropic
  Agent Skills, one large (`mcp-builder`) and one small (`internal-comms`).
- **Modification:** none. The files under `skills/sources/anthropic/` are vendored
  copies of the upstream `SKILL.md` and accompanying files, byte-for-byte.
  This project's CCS *conversions* of these skills (the composable
  mini/INDEX/BUNDLE decompositions) live under `skills/mcp-builder/` and
  `skills/internal-comms/` and are derived works produced by this project,
  distinct from the vendored originals.
- **License:** Each vendored skill directory carries its own `LICENSE.txt`,
  copied unmodified from upstream: both `skills/sources/anthropic/internal-comms/LICENSE.txt`
  and `skills/sources/anthropic/mcp-builder/LICENSE.txt` are the Apache License,
  Version 2.0, copyright Anthropic, PBC. That license, not this project's MIT
  license, governs the vendored files in those two directories. See the
  `LICENSE.txt` in each directory and the upstream repository for the
  authoritative terms.

## `skills/sources/financial-analyst/`

- **Source:** [`github.com/alirezarezvani/claude-skills`](https://github.com/alirezarezvani/claude-skills),
  the `finance/skills/financial-analyst` directory.
- **Used for:** Experiment 3 in `docs/BENCHMARKS.md`, a market-skill
  conversion case study that measured the token and quality cost of a lossy
  CCS conversion of a third-party skill, motivating the parity gate
  (`docs/SPEC.md` §8, `docs/CONVERSION.md` §2).
- **Scope vendored:** markdown knowledge files only (`SKILL.md` and the
  `references/*.md` guides). Scripts and other assets from the upstream
  project were excluded from the experiment and are not vendored here.
- **Modification:** none. The vendored files are unmodified copies of the
  markdown consulted for the conversion experiment. This project's CCS
  conversion, `skills/financial-analysis/`, is a derived work produced by
  this project.
- **License:** no `LICENSE` file or in-file license header was found in the
  vendored material or accompanying it upstream at the time it was vendored.
  **See the upstream repository (`alirezarezvani/claude-skills`) for license
  terms** before reusing this material outside the scope of this project's
  benchmarking and conversion demonstration. Do not assume MIT or any other
  permissive license applies merely because it sits in this MIT-licensed
  repository: this directory is carved out precisely because its license
  status is unclear.

## Summary

| Directory | Upstream | License found in this repo | Modified? |
|---|---|---|---|
| `skills/sources/anthropic/internal-comms/` | anthropics/skills | Apache-2.0 (`LICENSE.txt`, present) | No |
| `skills/sources/anthropic/mcp-builder/` | anthropics/skills | Apache-2.0 (`LICENSE.txt`, present) | No |
| `skills/sources/financial-analyst/` | alirezarezvani/claude-skills | Not found: see upstream repository for license terms | No |

If you are redistributing this repository, or extracting `skills/sources/` content
for use outside of reading the CCS benchmark writeups, treat each directory
according to the license row above rather than the project-wide MIT license.
If you are a rights holder for any of the above and believe this notice is
inaccurate or that vendoring should be adjusted, please open an issue.
