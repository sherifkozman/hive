# Reading & Extracting Content

Reading, parsing, or extracting content from a `.pptx` file. Use for any task that needs the text or a visual overview of an existing presentation — even if the extracted content will be used elsewhere (email, summary, etc.).

## Reading Content

```bash
# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/
```

- `python -m markitdown presentation.pptx` — extract the text content of the deck.
- `python scripts/thumbnail.py presentation.pptx` — create a visual overview (grid of slide thumbnails).
- `python scripts/office/unpack.py presentation.pptx unpacked/` — extract and pretty-print the raw XML for inspection.

Script paths (`scripts/thumbnail.py`, `scripts/office/unpack.py`) refer to the vendored source at `external/anthropic/pptx/scripts/`.

## thumbnail.py

```bash
python scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
```

Creates `thumbnails.jpg` with slide filenames as labels. Default 3 columns, max 12 per grid.

**Use for template analysis only** (choosing layouts). For visual QA, use `soffice` + `pdftoppm` to create full-resolution individual slide images — see the qa-and-rendering mini.

## Dependencies

- `pip install "markitdown[pptx]"` - text extraction
- `pip install Pillow` - thumbnail grids
