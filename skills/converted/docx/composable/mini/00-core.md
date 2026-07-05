# Core: DOCX Creation, Editing, and Analysis

Always-loaded foundation for creating, reading, editing, or manipulating Word documents (`.docx` files). Load the focused minis (see INDEX) for reading/conversion, creating new documents, editing existing documents, and the raw XML reference.

## Overview

A .docx file is a ZIP archive containing XML files.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | `pandoc` or unpack for raw XML |
| Create new document | Use `docx-js` - see Creating New Documents below |
| Edit existing document | Unpack → edit XML → repack - see Editing Existing Documents below |

## Vendored scripts

Every `python scripts/...` command in this skill refers to helper scripts vendored in the source skill at `external/anthropic/docx/scripts/`: `office/soffice.py`, `office/unpack.py`, `office/pack.py`, `office/validate.py`, `accept_changes.py`, and `comment.py` (with XML templates under `scripts/templates/` and schemas under `scripts/office/schemas/`).

## Dependencies

- **pandoc**: Text extraction
- **docx**: `npm install -g docx` (new documents)
- **LibreOffice**: PDF conversion (auto-configured for sandboxed environments via `scripts/office/soffice.py`)
- **Poppler**: `pdftoppm` for images
