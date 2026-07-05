# PPTX: Loading Menu

Working with PowerPoint `.pptx` files: reading, creating, editing, and QA. Helper scripts stay vendored at `external/anthropic/pptx/scripts/`.

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `mini/00-core.md` - purpose/trigger, approach-selection table, script location, dependencies - **always load**
- `mini/01-reading.md` - extract text, thumbnails, raw XML - Load when reading, parsing, or extracting from a .pptx.
- `mini/02-creating-from-scratch.md` - full PptxGenJS tutorial (text, shapes, images, icons, tables, charts, masters, pitfalls) - Load when creating a deck with no template.
- `mini/03-editing-templates.md` - template workflow, unpack/pack scripts, slide ops, XML content editing, pitfalls - Load when editing or templating an existing deck.
- `mini/04-design.md` - palettes, layouts, typography, spacing, mistakes to avoid - Load when designing slide look and feel.
- `mini/05-qa-and-rendering.md` - required QA bug-hunt, visual subagent review, convert to images - Load when verifying or rendering a deck.
