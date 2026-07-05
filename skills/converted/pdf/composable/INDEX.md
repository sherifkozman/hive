# PDF Processing: Loading Menu

Anything with PDF files: read, extract, create, merge, split, rotate, watermark, OCR, encrypt, fill forms.

Loading policy: read this menu, then load 00-core (if present) plus the minis relevant to your task. If most of this skill is relevant, load BUNDLE.md (or a matching presets/*.md) in one read instead.

- `mini/00-core.md` - overview, quick start, tool-selection table, routing, vendored-script paths - **always load**
- `mini/01-creation.md` - reportlab + pdf-lib document creation, tables, sub/superscripts - Load when creating a PDF.
- `mini/02-extraction.md` - text/table/metadata/coordinate/annotation extraction (pdfplumber, pdftotext, pypdf, pdfjs) - Load when reading a PDF.
- `mini/03-merge-split-manipulate.md` - merge, split, rotate, watermark, crop, optimize, batch (pypdf, qpdf, pdftk, pdf-lib) - Load when combining or restructuring pages.
- `mini/04-images-ocr.md` - extract/render images, figures, OCR scanned PDFs (pdfimages, pypdfium2, pdftoppm, pytesseract) - Load for images or OCR.
- `mini/05-encryption.md` - add/remove passwords and permissions (pypdf, qpdf) - Load for encrypt/decrypt.
- `mini/06-forms.md` - fillable and non-fillable form filling, step-by-step - Load when filling a PDF form.
- `mini/07-libraries-reference.md` - performance tips, troubleshooting, library licenses - Load for perf, errors, or license questions.
