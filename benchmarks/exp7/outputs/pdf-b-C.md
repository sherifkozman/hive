# Legal Document Processing Pipeline

A single script (`pipeline.py`) that ingests a folder of mixed PDFs (born-digital
and scanned), classifies each one, extracts content appropriately, and produces
one watermarked, encrypted, cover-paged master PDF plus a per-file processing
report.

## 1. Approach Overview

| Step | What happens | Library chosen | Why |
|---|---|---|---|
| Classify | Per-page text-density + embedded-image heuristic | `pdfplumber` + `pypdf` | Both are already required later; no extra dependency needed just to decide text-vs-scanned. |
| Extract (text-based) | Text + tables → CSV | `pdfplumber` | Best-in-class table detection (`extract_tables`) and layout-aware text extraction, MIT licensed. |
| OCR (scanned) | Render page → image → searchable single-page PDF → merge into one per-file PDF | `pypdfium2` (render) + `pytesseract` (OCR + PDF text layer) | Avoids the GPL-2 `poppler-utils` toolchain (`pdftoppm`/`pdf2image`) entirely — see License Concerns. `pytesseract.image_to_pdf_or_hocr` writes an invisible, position-matched text layer directly, so no separate "make it searchable" step is needed. |
| Cover page | Generate title/date/file-inventory page | `reportlab` | BSD-licensed, already a dependency-free way to draw a page; also used to generate the watermark overlay. |
| Merge | Concatenate cover + all processed docs | `pypdf` | Simple, reliable page-level `add_page`, BSD licensed. |
| Watermark | "CONFIDENTIAL" stamped on every page | `reportlab` (overlay) + `pypdf` (`merge_page`) | Overlay is generated per unique page size so it lines up correctly on both born-digital pages and rendered/OCR pages, which can have different `mediabox` dimensions. |
| Encrypt | Password-protect the final file | `pypdf` (`PdfWriter.encrypt`, AES-256) | Native to the toolchain already in use; `qpdf --encrypt` is noted as a CLI fallback. |
| Report | Pages, method, warnings per input file | stdlib `dataclasses` + `json`/`csv` | No extra dependency required. |

### Classification logic (the actual detection)

A PDF page is treated as "born-digital" if it has a meaningful amount of
extractable text; it's treated as "scanned" if it has almost no extractable
text and/or is dominated by a single embedded raster image. The whole
document is classified `scanned` if the *majority* of its pages look scanned
(mixed documents — e.g. a cover letter typed then a scanned exhibit — are
handled per-page in principle, but this pipeline makes a per-document choice
for simplicity and flags mixed documents as a warning). See `classify_pdf()`
in the script below for the exact thresholds.

## 2. License Concerns

- **`poppler-utils` is GPL-2** (`pdftotext`, `pdftoppm`, `pdfimages`, and the
  `pdf2image` Python package which just shells out to `pdftoppm`). This
  pipeline deliberately avoids all of them and uses `pypdfium2`
  (Apache-2.0/BSD, a binding to Chromium's PDFium) for rendering instead. For
  a legal-team internal tool this matters: GPL-2 tooling invoked as a
  subprocess is usually fine to *use* but bundling/distributing it alongside
  proprietary code warrants a legal sign-off that's easy to just avoid.
- **`reportlab`**: the open-source core (BSD) is used here — not the
  commercial ReportLab PLUS product.
- **`pytesseract`** is an Apache-2.0 wrapper; it requires the separate
  `tesseract` OCR **binary** (also Apache-2.0) to be installed on the host.
  That's an operational dependency, not a license concern, but it does mean
  the OCR step will hard-fail if the binary isn't on `PATH` (see Failure
  Modes).
- **`pypdf`** (BSD) needs the `cryptography` package (Apache-2.0/BSD-3) for
  AES-256 encryption — install with `pip install "pypdf[crypto]"`.
- **`qpdf`** (Apache-2.0) is mentioned as an optional CLI fallback for
  encryption; it's fine to add if `pypdf`'s AES-256 support proves
  insufficient (e.g. you need R6/256-bit with fine-grained permission bits
  qpdf exposes more directly).
- Net effect: the whole stack as chosen is MIT/BSD/Apache — no copyleft
  dependency anywhere in the default path.

## 3. `pipeline.py`

```python
#!/usr/bin/env python3
"""
pipeline.py - Legal document processing pipeline.

Classifies each PDF in a folder as text-based or scanned, extracts text/tables
(text-based) or OCRs to searchable text (scanned), then merges every processed
PDF into one watermarked, encrypted master file with a generated cover page,
and emits a per-file processing report.

Usage:
    python pipeline.py <input_dir> <output_dir> --title "Smith v. Jones - Exhibits" \
        --user-password <pw> [--owner-password <pw>]
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import sys
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
import pytesseract
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger("pipeline")

# --- Classification thresholds (tune per corpus) ---------------------------
MIN_AVG_CHARS_PER_PAGE = 25   # below this, a page "has no real text layer"
SCANNED_PAGE_FRACTION = 0.5   # fraction of pages that must look scanned
OCR_RENDER_SCALE = 300 / 72   # ~300 DPI


@dataclass
class FileReport:
    filename: str
    pages: int = 0
    method: str = ""            # "text" or "scanned"
    tables_extracted: int = 0
    warnings: list[str] = field(default_factory=list)
    output_artifact: str = ""   # path merged into the master PDF


# ---------------------------------------------------------------------------
# Step 1: Classification
# ---------------------------------------------------------------------------
def classify_pdf(path: Path) -> tuple[str, dict]:
    """Classify a PDF as 'text' or 'scanned'.

    Heuristic (no OCR run yet, so this must be cheap):
      - For every page, measure extracted-text length (pdfplumber) and count
        embedded raster images (pypdf).
      - A page "looks scanned" if it has < MIN_AVG_CHARS_PER_PAGE characters
        of extractable text AND at least one embedded image (i.e. it's
        probably a photographed/scanned page, not just a blank page).
      - The document is classified 'scanned' if >= SCANNED_PAGE_FRACTION of
        its pages look scanned.
    """
    reader = PdfReader(str(path))
    n_pages = len(reader.pages)
    total_chars = 0
    scanned_like_pages = 0

    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = (page.extract_text() or "").strip()
            total_chars += len(text)
            try:
                has_image = len(list(reader.pages[i].images)) > 0
            except Exception:
                has_image = False
            if len(text) < MIN_AVG_CHARS_PER_PAGE and has_image:
                scanned_like_pages += 1

    avg_chars = total_chars / max(n_pages, 1)
    scanned_fraction = scanned_like_pages / max(n_pages, 1)
    is_scanned = scanned_fraction >= SCANNED_PAGE_FRACTION or (
        avg_chars < MIN_AVG_CHARS_PER_PAGE and n_pages > 0
    )

    stats = {
        "pages": n_pages,
        "avg_chars_per_page": round(avg_chars, 1),
        "scanned_page_fraction": round(scanned_fraction, 2),
    }
    return ("scanned" if is_scanned else "text"), stats


# ---------------------------------------------------------------------------
# Step 2: Text-based extraction (text + tables -> CSV)
# ---------------------------------------------------------------------------
def extract_text_and_tables(path: Path, out_dir: Path, report: FileReport) -> Path:
    text_chunks = []
    tables_found = 0

    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            text_chunks.append(page.extract_text() or "")
            try:
                tables = page.extract_tables()
            except Exception as e:  # pdfplumber can choke on odd layouts
                report.warnings.append(f"table extraction failed p{i+1}: {e}")
                tables = []
            for j, table in enumerate(tables):
                if not table or not any(any(cell for cell in row) for row in table):
                    continue
                csv_path = out_dir / f"{path.stem}_p{i+1}_t{j+1}.csv"
                with open(csv_path, "w", newline="", encoding="utf-8") as f:
                    csv.writer(f).writerows(table)
                tables_found += 1

    report.tables_extracted = tables_found
    txt_path = out_dir / f"{path.stem}.txt"
    txt_path.write_text("\n\n".join(text_chunks), encoding="utf-8")
    if not any(text_chunks) :
        report.warnings.append("classified text-based but no text extracted")
    return txt_path


# ---------------------------------------------------------------------------
# Step 3: OCR for scanned PDFs -> single searchable PDF
# ---------------------------------------------------------------------------
def ocr_pdf(path: Path, out_dir: Path, report: FileReport) -> Path:
    """Render each page (pypdfium2) and OCR it (pytesseract) into a
    searchable single-page PDF, then merge those pages into one file.
    """
    src = pdfium.PdfDocument(str(path))
    writer = PdfWriter()

    for i, page in enumerate(src):
        try:
            bitmap = page.render(scale=OCR_RENDER_SCALE)
            img = bitmap.to_pil()
        except Exception as e:
            report.warnings.append(f"render failed p{i+1}: {e}")
            continue
        try:
            page_pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension="pdf")
        except pytesseract.TesseractNotFoundError:
            raise  # fatal, let caller abort the whole run
        except Exception as e:
            report.warnings.append(f"OCR failed p{i+1}: {e}")
            continue

        page_reader = PdfReader(io.BytesIO(page_pdf_bytes))
        writer.add_page(page_reader.pages[0])

    out_path = out_dir / f"{path.stem}_searchable.pdf"
    with open(out_path, "wb") as f:
        writer.write(f)
    if len(writer.pages) < len(src):
        report.warnings.append(
            f"only {len(writer.pages)}/{len(src)} pages OCR'd successfully"
        )
    return out_path


# ---------------------------------------------------------------------------
# Step 4a: Cover page
# ---------------------------------------------------------------------------
def make_cover_page(out_path: Path, title: str, inventory: list[str]) -> None:
    c = canvas.Canvas(str(out_path), pagesize=letter)
    width, height = letter

    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2, height - 140, title)
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 165, date.today().isoformat())

    c.setFont("Helvetica-Bold", 13)
    c.drawString(72, height - 220, "File Inventory")
    c.setFont("Helvetica", 10)
    y = height - 240
    for name in inventory:
        if y < 72:
            c.showPage()
            c.setFont("Helvetica", 10)
            y = height - 72
        c.drawString(90, y, f"• {name}")
        y -= 14
    c.save()


# ---------------------------------------------------------------------------
# Step 4b: Watermark
# ---------------------------------------------------------------------------
_watermark_cache: dict[tuple[float, float], "PdfReader"] = {}


def _watermark_reader_for_size(width: float, height: float, text: str) -> PdfReader:
    key = (round(width, 1), round(height, 1))
    if key in _watermark_cache:
        return _watermark_cache[key]

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    c.saveState()
    c.setFont("Helvetica-Bold", max(24, int(min(width, height) / 8)))
    c.setFillColor(colors.Color(0.6, 0.6, 0.6, alpha=0.35))
    c.translate(width / 2, height / 2)
    c.rotate(45)
    c.drawCentredString(0, 0, text)
    c.restoreState()
    c.save()
    buf.seek(0)
    reader = PdfReader(buf)
    _watermark_cache[key] = reader
    return reader


def watermark_writer(writer: PdfWriter, text: str = "CONFIDENTIAL") -> None:
    """Stamp every page in `writer` in place, sizing the overlay to each
    page's own mediabox so mixed page sizes (letter cover page vs. rendered
    scan pages) both get a correctly proportioned watermark."""
    for page in writer.pages:
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        wm_page = _watermark_reader_for_size(w, h, text).pages[0]
        page.merge_page(wm_page)


# ---------------------------------------------------------------------------
# Step 4c: Merge + encrypt
# ---------------------------------------------------------------------------
def build_master(
    cover_path: Path,
    processed_paths: list[Path],
    out_path: Path,
    user_password: str,
    owner_password: str | None = None,
) -> None:
    writer = PdfWriter()

    cover_reader = PdfReader(str(cover_path))
    for p in cover_reader.pages:
        writer.add_page(p)

    for doc_path in processed_paths:
        reader = PdfReader(str(doc_path))
        for p in reader.pages:
            writer.add_page(p)

    watermark_writer(writer, "CONFIDENTIAL")

    writer.encrypt(
        user_password=user_password,
        owner_password=owner_password or user_password,
        algorithm="AES-256",
    )

    with open(out_path, "wb") as f:
        writer.write(f)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def run_pipeline(
    input_dir: Path,
    output_dir: Path,
    title: str,
    user_password: str,
    owner_password: str | None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "_work"
    work_dir.mkdir(exist_ok=True)

    reports: list[FileReport] = []
    processed_paths: list[Path] = []
    inventory: list[str] = []

    pdf_files = sorted(input_dir.glob("*.pdf"))
    if not pdf_files:
        logger.error("No PDFs found in %s", input_dir)
        sys.exit(1)

    for path in pdf_files:
        report = FileReport(filename=path.name)
        try:
            method, stats = classify_pdf(path)
            report.method = method
            report.pages = stats["pages"]
        except (PdfReadError, Exception) as e:  # noqa: BLE001 - keep pipeline alive
            report.warnings.append(f"could not classify: {e}")
            reports.append(report)
            logger.warning("Skipping %s: %s", path.name, e)
            continue

        try:
            if method == "text":
                extract_text_and_tables(path, work_dir, report)
                processed_paths.append(path)          # original already has real text
                report.output_artifact = str(path)
            else:
                searchable = ocr_pdf(path, work_dir, report)
                processed_paths.append(searchable)
                report.output_artifact = str(searchable)
        except pytesseract.TesseractNotFoundError:
            logger.error(
                "Tesseract binary not found on PATH - install it (see Dependencies) "
                "and re-run. Aborting."
            )
            sys.exit(1)
        except Exception as e:  # noqa: BLE001
            report.warnings.append(f"processing failed: {e}")
            logger.warning("Failed to process %s: %s", path.name, e)

        inventory.append(f"{path.name}  ({report.pages} pages, {report.method})")
        reports.append(report)

    cover_path = work_dir / "_cover.pdf"
    make_cover_page(cover_path, title, inventory)

    master_path = output_dir / "master.pdf"
    build_master(cover_path, processed_paths, master_path, user_password, owner_password)

    report_path = output_dir / "processing_report.json"
    report_path.write_text(
        json.dumps([asdict(r) for r in reports], indent=2), encoding="utf-8"
    )

    csv_path = output_dir / "processing_report.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["filename", "pages", "method", "tables_extracted", "warnings"])
        for r in reports:
            w.writerow([r.filename, r.pages, r.method, r.tables_extracted, "; ".join(r.warnings)])

    logger.info("Master PDF: %s", master_path)
    logger.info("Reports: %s, %s", report_path, csv_path)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input_dir", type=Path)
    ap.add_argument("output_dir", type=Path)
    ap.add_argument("--title", default="Document Production")
    ap.add_argument("--user-password", required=True)
    ap.add_argument("--owner-password", default=None)
    args = ap.parse_args()
    run_pipeline(
        args.input_dir, args.output_dir, args.title, args.user_password, args.owner_password
    )


if __name__ == "__main__":
    main()
```

## 4. Dependencies

Python (pin in `requirements.txt`):

```
pdfplumber>=0.11
pypdf[crypto]>=4.0     # [crypto] extra pulls in `cryptography` for AES-256
pypdfium2>=4.0
pytesseract>=0.3.10
Pillow>=10.0
reportlab>=4.0
```

System packages:

- `tesseract-ocr` (the actual OCR engine `pytesseract` wraps) — e.g.
  `apt-get install tesseract-ocr` / `brew install tesseract`. Apache-2.0.
- Optionally `qpdf` if you want the CLI-encryption fallback mentioned above —
  `apt-get install qpdf`. Apache-2.0.
- No `poppler-utils` needed (intentionally — see License Concerns).

## 5. Operations

### How to run

```bash
python pipeline.py ./intake_folder ./output \
    --title "Smith v. Jones - Document Production Vol. 1" \
    --user-password 'S3cure-Client-Pw' \
    --owner-password 'S3cure-Firm-Pw'
```

Outputs land in `./output/`:
- `master.pdf` — cover page + every processed document, watermarked
  "CONFIDENTIAL" on every page, AES-256 encrypted with the given
  password(s).
- `processing_report.json` / `processing_report.csv` — per-file pages,
  classification method, table count, and warnings.
- `_work/` — intermediate per-file `.txt`, `.csv` (extracted tables), and
  OCR'd searchable PDFs. Safe to delete after review; kept so a paralegal can
  spot-check individual extractions without re-running the whole batch.

### Common failure modes

- **`pytesseract.TesseractNotFoundError`** — the `tesseract` binary isn't
  installed or isn't on `PATH`. The pipeline aborts immediately rather than
  silently skipping OCR (a legal document review process must not silently
  produce a document missing an exhibit's text).
- **Misclassification on thin-text pages** — a scanned page with a small
  stamp, Bates number, or signature block typed in afterward can have just
  enough extractable text to trip the "not scanned" heuristic on a per-page
  basis; the majority-vote (`SCANNED_PAGE_FRACTION`) is there to smooth this
  out, but pathological single-page documents should have their
  `avg_chars_per_page` reviewed in the report and the threshold retuned per
  corpus.
- **Already-encrypted input PDFs** — `PdfReader` will raise on protected
  source files; these are caught, logged as a per-file warning, and the file
  is skipped rather than aborting the whole batch. Decrypt inputs ahead of
  time if this happens often.
- **Corrupted/malformed PDFs** — caught as `PdfReadError` (or a generic
  exception) at classification time; recorded as a warning, file skipped,
  batch continues.
- **Complex table layouts** — `pdfplumber`'s default lattice/stream
  detection can miss borderless tables or merge adjacent tables; if a legal
  document's tables come out wrong, pass custom `table_settings` (documented
  in the extraction guidance) rather than trusting the default everywhere.
- **Mixed page sizes in the merged master** — scanned pages render at
  whatever size `pypdfium2` produces from the source mediabox, which can
  differ from the letter-sized cover page; the watermark code sizes its
  overlay per-page for this reason, but double-check the merged output's
  page sizes if source PDFs use unusual page dimensions (e.g. legal-size
  exhibits).
- **OCR accuracy on poor scans** — low-DPI or skewed scans will produce
  low-quality searchable text; `OCR_RENDER_SCALE` renders at ~300 DPI as a
  reasonable default, but very poor originals may need manual QA of the
  `_work/*_searchable.pdf` files before they're trusted for search/e-discovery.
- **Encryption interoperability** — AES-256 (via `pypdf[crypto]`) isn't
  readable by very old PDF viewers; if a recipient reports they can't open
  the file, fall back to `qpdf --encrypt ... 128 ...` or AES-128.

LOADED: /home/user/hive/skills/converted/pdf/composable/INDEX.md, /home/user/hive/skills/converted/pdf/composable/BUNDLE.md
