# Core: PPTX Skill

Always-loaded foundation for working with PowerPoint `.pptx` files. Load the focused minis (see INDEX) for reading, creating from scratch, editing templates, design, and QA.

## When to use this skill

Use this skill any time a `.pptx` file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any `.pptx` file (even if the extracted content will be used elsewhere, like in an email or summary); editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions "deck," "slides," "presentation," or references a `.pptx` filename, regardless of what they plan to do with the content afterward. If a `.pptx` file needs to be opened, created, or touched, use this skill.

License: Proprietary. `external/anthropic/pptx/LICENSE.txt` has complete terms.

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python -m markitdown presentation.pptx` (see reading mini) |
| Edit or create from template | See editing-templates mini |
| Create from scratch | See creating-from-scratch mini |

## Choosing an approach

- **Reading content**: extract text, get a visual overview, or inspect raw XML — see the reading mini.
- **Editing / creating from a template**: when using an existing presentation as a template — see the editing-templates mini.
- **Creating from scratch**: use when no template or reference presentation is available — see the creating-from-scratch mini.

Design guidance (palettes, layout, typography) and the required QA/verification process apply to both editing and creating — see the design and qa-and-rendering minis.

## Scripts location

Helper scripts referenced throughout this skill (e.g. `scripts/thumbnail.py`, `scripts/office/unpack.py`, `scripts/add_slide.py`, `scripts/clean.py`, `scripts/office/pack.py`, `scripts/office/soffice.py`) are vendored in the source at `external/anthropic/pptx/scripts/`. Paths shown as `scripts/...` are relative to that vendored source directory.

## Dependencies

- `pip install "markitdown[pptx]"` - text extraction
- `pip install Pillow` - thumbnail grids
- `npm install -g pptxgenjs` - creating from scratch
- LibreOffice (`soffice`) - PDF conversion (auto-configured for sandboxed environments via `scripts/office/soffice.py`)
- Poppler (`pdftoppm`) - PDF to images
