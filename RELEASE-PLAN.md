# Release Plan: Hive v0.1.0

This plan qualifies each distribution channel on its actual fit for a v0.1
release of a spec + a single stdlib CLI script + eight reference skills, gives
concrete steps for the channels worth using now, and says "not yet" plainly
where that's the honest answer.

## 1. GitHub public repository (primary channel)

This is the release. Everything else is secondary distribution pointing back
at it.

**Before flipping the repo public, check:**

- [ ] **Secrets scan.** Searched `tools/`, `skills/`, `docs/` for API keys,
      tokens, and credential-shaped strings. Everything that matched
      (`api_key`, `EXAMPLE_API_KEY`, `ANTHROPIC_API_KEY=your_api_key_here`,
      `GITHUB_TOKEN=ghp_xxx`, an `input_type="password"` elicitation) is
      placeholder/example code inside `skills/converted/mcp-builder/`'s reference
      material, not a live credential. No hits outside that skill's
      illustrative snippets. Recommend also running GitHub's own secret
      scanning (`run_secret_scanning` / push protection) once the repo is
      public, as a second check, not a substitute for this one.
- [ ] **License clarity.** `LICENSE` (MIT) now covers the project;
      `THIRD_PARTY_NOTICES.md` carves out `external/anthropic/` (Apache-2.0,
      `LICENSE.txt` present in each subdirectory) and
      `external/financial-analyst/` (no upstream license found: notice says
      "see upstream repository for license terms"). Do this before going
      public: an unlicensed public repo defaults to "all rights reserved" and
      an ambiguous one invites exactly the question this file answers.
- [ ] **Default branch.** The release lives on `hive-release`: a single
      clean, owner-authored commit, with no `main` yet. Create `main` from
      `hive-release` before the repo goes public (a release-named branch as
      the default is a visible tell that the repo wasn't fully prepared, and
      it complicates the tag/release workflow below).
- [ ] **Working tree state.** `hive-release` is a single clean commit: every
      skill's `BUNDLE.md` is compiled and committed, per-skill `VERSION`
      files are in place, and this batch of root docs is included. Confirm
      `python3 tools/hive.py lint skills/<category>/<name>` returns zero
      failures for every skill before tagging.
- [ ] **Repo metadata.** Suggested GitHub description: *"CCS: a spec and
      toolchain for packaging AI-agent skills as composable, benchmarked,
      compiled modules instead of one big prompt."* Suggested topics:
      `ai-agents`, `llm`, `prompt-engineering`, `agent-skills`, `claude`,
      `developer-tools`, `documentation-as-code`, `mcp`. Pin `README.md` (already
      does the job) and consider enabling GitHub's "Releases" and "Discussions"
      tabs; Issues should stay on for spec-change proposals per
      `CONTRIBUTING.md`.
- [ ] **CI, even minimal.** There's no test suite beyond `hive.py lint` /
      `parity` / `report`, which is honest for a v0.1 stdlib script. Wire
      those three into a GitHub Actions workflow that runs on push/PR so lint
      regressions (a stale `BUNDLE.md` after a mini edit, for example) can't
      merge silently. This is cheap and worth doing before or immediately
      after going public.

## 2. Agent Skills ecosystem listings (agentskills.io, skills.sh, similar directories)

**Fit: good, with a caveat.** Hive's compiled output is deliberately
compatible with the plain file-based Agent Skills model: a `SKILL.md`-style
`INDEX.md` plus reference files is exactly the shape these directories index.
The eight skills under `skills/*/*/composable/` (categorized: authored/,
converted/, meta/, and the `monolithic/SKILL.md` fallback some of them carry)
are consumable today without any Hive-specific
tooling: an agent that just reads files can use `INDEX.md` as a router the
same way it would use a vendor `SKILL.md`.

**What listing typically requires** (verify against each directory's current
submission process before submitting, since these are third-party sites this
project doesn't control):

- A single canonical `SKILL.md` (or equivalent) per listed skill with a clear
  `name`/`description` frontmatter: Hive's compiled `BUNDLE.md` or a skill's
  `monolithic/SKILL.md` can serve this role; the raw `composable/` directory
  with its INDEX + minis is the "advanced" form, not the listing artifact.
  Decide, skill by skill, whether to submit the monolithic fallback (simpler,
  matches what these directories expect) or point at the composable directory
  with a note explaining the loading model.
  Note: not every skill in this repo ships a `monolithic/SKILL.md` baseline.
  Check per-skill before assuming one exists to submit.
- Working links to source (this repo) and a license: both now satisfied
  (`LICENSE`, `THIRD_PARTY_NOTICES.md`).
- Usually a short description and category tags, similar to the GitHub topics
  above.
- Likely a request that the skill be self-contained / runnable without extra
  infrastructure: true here (stdlib-only compile step, plain markdown
  output).

**Honest caveat:** these directories index skills for direct consumption by an
agent, not frameworks for producing skills. Submitting the eight reference
skills is reasonable and low-effort. Submitting "Hive" itself as a listing
doesn't fit the model: it's not a skill, it's a toolchain that produces
skills, so the framework's visibility in that ecosystem should come from the
`ccs-skill-creator` meta-skill (which *is* a skill, and is the intended
on-ramp) rather than from trying to list the framework as a whole.

## 3. Package managers (PyPI, etc.)

**Recommendation: not yet.** Be honest about what's being shipped: one
dependency-free Python script (`tools/hive.py`) with four subcommands, invoked
directly via `python3 tools/hive.py <cmd>`. Packaging that as a PyPI
distribution today would add packaging surface (`pyproject.toml`, version
pinning, a release-to-PyPI CI step, namespace squatting considerations)
without adding capability: anyone who wants it can `git clone` and run it
with any Python 3.11.

**Criteria that would flip this recommendation later:**

- The CLI grows enough subcommands/options that `pip install hive-ccs && hive
  lint ...` is meaningfully more convenient than a repo clone (a console-script
  entry point becomes worth the packaging overhead).
- External projects start depending on `hive.py` as a library (importing its
  functions), not just invoking it as a script. That's the point where a
  proper package with a stable import path pays for itself.
- The spec (`docs/SPEC.md`) stabilizes past v1.0 enough that a versioned
  package release is meaningfully different from "clone at a tag."
- There's a second implementation (e.g., a Node port) and PyPI packaging would
  help disambiguate "the Python one." Until then, a git clone is unambiguous.

Until any of those hold, ship the tag and the source archive (below); resist
the temptation to package prematurely just because "real" projects have a
PyPI page.

## 4. Announcement artifacts

### Blog / HN / r/LocalLLaMA post (~300 words)

> **Hive: composable AI-agent skills, with the benchmarks to back the packaging**
>
> We kept seeing the same failure mode with agent instruction files: either one
> big always-loaded `SKILL.md`/`AGENTS.md` that pays its full token cost on
> every task, or a progressive-disclosure tree the model reads file-by-file
> with no guarantee it picks the right files. So we built Hive: a spec (CCS
> v1.0) plus a zero-dependency Python CLI, around a narrower claim: author a
> skill as small self-contained markdown "minis" with a knowledge-free INDEX
> router, compile them into a bundle, and pick a loading strategy at runtime
> based on how much of the skill a task actually needs.
>
> We didn't want to ship this on vibes, so we ran six blind-judged benchmark
> experiments before writing the README's claims (frozen tasks, independent
> frontier-tier LLM judges, deterministic token accounting, full protocol and
> raw data in `docs/BENCHMARKS.md`). The honest results: composable packaging
> matched or
> beat a monolithic file on quality and cut tokens 41-64% on narrow tasks, but
> that token advantage *inverted* on broad tasks that need most of the skill
> anyway, until we added a compiled-bundle mode. A naive conversion of a
> third-party skill that compressed content by ~30% lost its quality edge
> entirely, which is why we added a hard parity gate: conversions must be
> lossless, repackaging only. And a small (~2.8k-token) skill got zero benefit
> from any of this: composability isn't free, it has a break-even point.
>
> Two of our eight reference skills are lossless CCS conversions of official
> Anthropic Agent Skills (mcp-builder, internal-comms); a third converts a
> third-party financial-analyst skill. All vendored source is unmodified and
> credited in `THIRD_PARTY_NOTICES.md`.
>
> This is a v0.1, single-model-family, single-run-per-cell result set: solid
> on direction, noisy on magnitude. We'd rather you replicate it than trust it.
> Repo, spec, raw eval data: [link].

### 3-tweet / thread version

1. Shipping Hive: a spec + CLI for packaging AI-agent skills as composable
   modules instead of one big prompt file. The pitch: load only the slice of
   a skill a task needs, prove the packaging earns its cost with
   actual benchmarks, not vibes. 🧵
2. 6 blind-judged experiments, frozen tasks, independent judges, deterministic
   token accounting. Composable beat monolithic on quality, saved 41-64%
   tokens on narrow tasks, but that advantage *inverted* on broad tasks until
   we added a compiled-bundle mode. Lossy conversion of a third-party skill
   lost its edge entirely (~30% compression cost it the win), hence a hard
   parity gate: conversions must be lossless. And small skills (~2.8k tokens)
   saw zero benefit: this isn't free, there's a break-even point. Full tables,
   warts included: docs/BENCHMARKS.md.
3. 8 reference skills included, 2 of them lossless conversions of official
   Anthropic Agent Skills (credited + original licenses preserved). Zero
   dependencies: one stdlib Python CLI (`compile` / `lint` / `parity` /
   `report`). v0.1, one model family, single-run cells, solid direction, come
   replicate the magnitudes: [repo link].

## 5. Release artifacts

- [ ] **Tag:** `v0.1.0`, created on the release commit on `main` (created
      from `hive-release` per §1), pointing at the commit where all
      collateral in this batch, the compiled bundles, and the VERSION files
      are committed and `lint`/`parity` are green across all eight skills.
      ```
      git tag -a v0.1.0 -m "Hive v0.1.0: CCS spec v1.0, hive.py CLI, 8 reference skills"
      git push origin v0.1.0
      ```
- [ ] **GitHub Release notes** (draft, derived from `CHANGELOG.md`'s
      `[0.1.0]` entry, copy/trim to fit GitHub's release-notes conventions):

      > ## Hive v0.1.0
      >
      > Initial public release of the CCS (Compiled Composable Skills)
      > framework: a spec, a stdlib CLI, and an evidence base.
      >
      > **Added**
      > - CCS specification v1.0 (`docs/SPEC.md`)
      > - `tools/hive.py`, stdlib-only CLI: `compile`, `lint`, `parity`, `report`
      > - 8 reference skills (`code-review`, `data-analysis`,
      >   `financial-analysis`, `internal-comms`, `mcp-builder`, `python-api`,
      >   `tech-writing`, `ccs-skill-creator`), including 2 lossless
      >   conversions of official Anthropic Agent Skills
      > - `ccs-skill-creator`, an agentic meta-skill entry point for
      >   authoring/converting skills, adoption-tested against this repo
      > - 6 blind-judged benchmark experiments backing every claim in the
      >   README (`docs/BENCHMARKS.md`)
      >
      > **Known limitations:** single-run cells, one model family, edges/
      > routing quality unproven. See `docs/BENCHMARKS.md` §10.
      >
      > Full changelog: [`CHANGELOG.md`](CHANGELOG.md)
- [ ] **Source archive note:** GitHub auto-generates `.zip`/`.tar.gz` archives
      per tag: no separate build step needed since this is a script-and-
      markdown repo with no build artifacts to bundle. Call this out in the
      release body ("no build step; clone or download the source archive and
      run `python3 tools/hive.py --help`") so users don't go looking for a
      wheel or binary that doesn't exist.

## 6. Final pre-flight checklist

- [ ] Working tree clean: `tools/hive.py`, all recompiled `BUNDLE.md` files,
      and per-skill `VERSION` files are committed on `hive-release`.
- [ ] `python3 tools/hive.py lint skills/<category>/<name>` is zero-failure for all
      eight skills.
- [ ] `python3 tools/hive.py parity skills/<category>/<name> <source>` re-run and
      attached for the three converted skills (`internal-comms`,
      `mcp-builder`, `financial-analysis`) against their `external/` sources.
- [ ] `python3 tools/hive.py report skills` output reviewed for any skill
      whose token footprint drifted unexpectedly since the last recorded
      benchmark run.
- [ ] `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`,
      `CHANGELOG.md` present at repo root (this batch).
- [ ] Secrets scan re-run against the final committed tree on `hive-release`
      (the check in §1 covers `tools/hive.py` and everything else).
- [ ] Default branch is `main`; branch protection (require lint CI, if wired
      per §1) enabled before or immediately after going public.
- [ ] Repo set to public; description/topics applied (§1).
- [ ] Tag `v0.1.0` pushed; GitHub Release published with the notes above.
- [ ] Skills submitted to agentskills.io / skills.sh (§2), if their current
      submission process is confirmed compatible with this repo's layout.
- [ ] Announcement post and thread (§4) go out only after the tag and release
      are live, so links in the announcement resolve.

## Release status (updated)

Completed: repository public, `main` is the default branch (created from the
release branch), working branches removed, secrets scan clean, all docs and
skills lint-clean.

Remaining single step, the v0.1.0 Release. Fastest paths:

Web (about 60 seconds):
1. Open https://github.com/sherifkozman/hive/releases/new
2. "Choose a tag": type `v0.1.0`, select "Create new tag: v0.1.0 on publish",
   target `main`.
3. Title: `Hive v0.1.0`
4. Body: paste the contents of `RELEASE-NOTES-v0.1.0.md` (repo root).
5. Publish. GitHub creates the tag and source archives automatically.

CLI (from any local clone with gh authenticated):
    gh release create v0.1.0 --target main --title "Hive v0.1.0" \
      --notes-file RELEASE-NOTES-v0.1.0.md

After publishing: submit directory listings and the announcement per the
channels section above.
