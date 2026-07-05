# Package and Present (only if `present_files` tool is available)

Check whether you have access to the `present_files` tool. If you don't, skip this step. If you do, package the skill and present the .skill file to the user:

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

After packaging, direct the user to the resulting `.skill` file path so they can install it.

> Note on script paths: `scripts.package_skill` refers to the vendored source at `skills/sources/anthropic/skill-creator/scripts/package_skill.py`. See the `scripts-and-references` mini for the full inventory. The `package_skill.py` script works anywhere with Python and a filesystem.
