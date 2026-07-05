# Core: PDF Processing

Always-loaded foundation for doing anything with PDF files using Python libraries and command-line tools. Load the focused minis (see INDEX) for creation, extraction, merging/splitting, images/OCR, encryption, form-filling, and library/performance guidance.

## Overview

This skill covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see the extraction, merge/split, images-ocr, and libraries-reference minis. If you need to fill out a PDF form, read the forms mini and follow its instructions.

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Create PDFs | reportlab | Canvas or Platypus |
| Command line merge | qpdf | `qpdf --empty --pages ...` |
| OCR scanned PDFs | pytesseract | Convert to image first |
| Fill PDF forms | pdf-lib or pypdf (see forms mini) | See forms mini |

## Vendored scripts

The form-filling helper scripts referenced by the forms mini (`check_fillable_fields.py`, `extract_form_field_info.py`, `convert_pdf_to_images.py`, `fill_fillable_fields.py`, `extract_form_structure.py`, `check_bounding_boxes.py`, `fill_pdf_form_with_annotations.py`) are vendored in the source skill at `skills/sources/anthropic/pdf/scripts/`. Command lines that say `scripts/...` refer to that vendored directory.

## Next Steps

- For advanced pypdfium2 usage, see the images-ocr and libraries-reference minis.
- For JavaScript libraries (pdf-lib, pdfjs-dist), see the creation, extraction, merge-split, and libraries-reference minis.
- If you need to fill out a PDF form, follow the instructions in the forms mini.
- For troubleshooting guides, see the libraries-reference mini.
