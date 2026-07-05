# Legal Document Processing Pipeline — Design & Implementation

## 1. Library selection (per step) and rationale

| Step | Library chosen | Why | License |
|---|---|---|---|
| Classify text vs. scanned | **pypdf** (`PdfReader`, `page.extract_text()`, `page.images`) | Cheapest possible check: no rasterization, no OCR, just pulls the text layer (if any) and the list of embedded image XObjects per page. Good enough to route documents; heavier libraries are reserved for the branch that actually needs them. | BSD |
| Text-based extraction (text + tables) | **pdfplumber** | Per the skill's own quick-reference table, pdfplumber is the recommended tool for both text and table extraction — it preserves layout far better than pypdf's extractor and is the only one of the bundled libraries with real table-detection (`extract_tables()`). pypdf has no table support at all. | MIT |
| Tables → CSV | **pandas** (`DataFrame.to_csv`) | Natural pairing with pdfplumber's list-of-lists table output; one line to get a clean CSV per detected table. | BSD-3 |
| Scanned → searchable text | **pdf2image** (rasterize) + **pytesseract** (OCR, wrapping the **Tesseract** engine) | This is the pairing the skill documents for OCR. Rather than `image_to_string` (plain `.txt`, discards the original page image), the pipeline uses `pytesseract.image_to_pdf_or_hocr(..., extension="pdf")`, which returns a one-page PDF containing the *original scanned image* with an invisible text layer on top — i.e., an actually "searchable PDF", which is what step 3 asks for, not just a text dump. | pytesseract: Apache-2.0. Tesseract engine: Apache-2.0. pdf2image: MIT (wraps poppler's `pdftoppm`, GPL-2 binary invoked as a subprocess — see license note below). |
| Cover page generation | **reportlab** (Platypus: `SimpleDocTemplate`, `Table`, `Paragraph`) | Skill's recommended PDF-creation library; Platypus is the right layer here (vs. raw `canvas`) because the cover page needs a flowing table (file inventory) rather than fixed-coordinate drawing. | BSD-3 (open-source "reportlab-toolkit" package used here; the commercial "ReportLab PLUS" add-ons are not used and are not needed) |
| Merge cover + processed pages | **pypdf** (`PdfWriter.add_page`) | Skill's documented merge pattern; no need for a second library once pages are already normalized to PDF. | BSD |
| Watermark every page | **reportlab** (build one watermark page) + **pypdf** (`page.merge_page()`) | Exactly the pattern shown in the skill (build/overlay watermark, merge onto every page of the writer). | BSD (both) |
| Encrypt output | **pypdf** (`PdfWriter.encrypt(...)`) | Skill's documented password-protection method; pypdf's modern versions support AES-256 via the `algorithm="AES-256"` argument, which is preferable to the default RC4/AES-128 fallback for a legal/confidential deliverable. | BSD |

### License notes worth flagging to the legal team

- **poppler-utils is GPL-2.** `pdf2image` does not link against poppler — it shells out to poppler's `pdftoppm` binary as a subprocess. Invoking a GPL binary as an external process from proprietary code is standard "mere aggregation" and does not by itself impose GPL obligations on this pipeline's own code, but it does mean **the poppler binary itself must be present/installable** on any machine that runs the pipeline, and if this pipeline is ever *distributed as a bundle including the poppler binaries* (e.g. a Docker image or installer), the GPL-2 terms travel with that binary and must be honored (source availability, etc.). Purely calling an already-installed system `pdftoppm` at runtime is the lower-risk pattern used here.
- **Tesseract OCR / pytesseract**: Apache-2.0, no copyleft concerns, safe for internal legal tooling.
- **reportlab**: the PyPI `reportlab` package is BSD-licensed open source. Anthropic's own skill note about ReportLab is only about a Unicode-glyph rendering pitfall (see below), not licensing — the commercial ReportLab PLUS product is a separate, unrelated offering this pipeline does not use.
- **pypdf, pdfplumber, pandas**: all permissive (BSD/MIT), no concerns.
- Everything above is permissively licensed enough for internal use and for delivering a compiled/encrypted work product to a client; the only operational (not legal-risk) caveat is the poppler system dependency noted above.

### Design notes carried over from the skill's troubleshooting guidance

- Never use Unicode sub/superscript characters in reportlab-drawn text (they render as solid black boxes with the built-in fonts); this pipeline's cover page only uses plain ASCII/Paragraph markup, so it's not at risk, but it's called out in Operations below in case the title/inventory data ever contains such characters.
- `pypdf` `PdfReader` can raise on encrypted *input* PDFs; the pipeline catches and reports this per-file rather than aborting the whole batch.

---

## 2. `pipeline.py`

```python
#!/usr/bin/env python3
"""
pipeline.py - Legal document processing pipeline.

Given a folder of mixed PDFs (some text-based, some scanned):
  1. Classify each PDF as text-based or scanned.
  2. Text-based  -> extract text + tables (tables to CSV)         [pdfplumber, pandas]
  3. Scanned     -> OCR to a searchable PDF                       [pdf2image, pytesseract]
  4. Merge everything into one master PDF with a generated cover
     page (title, date, file inventory), a "CONFIDENTIAL"
     watermark on every page, and password encryption.            [reportlab, pypdf]
  5. Emit a per-file processing report (pages, method, warnings). [json/csv]

See the accompanying markdown deliverable for library rationale and
license notes.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

try:
    import pytesseract
    from pdf2image import convert_from_path
except ImportError:  # OCR deps are optional at import time; enforced at use time
    pytesseract = None
    convert_from_path = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pdf_pipeline")

# --- Tunables -----------------------------------------------------------

TEXT_CHAR_THRESHOLD = 40      # min extracted chars for a page to count as "has real text"
SCANNED_PAGE_FRACTION = 0.6   # fraction of image-only pages needed to call a doc "scanned"
OCR_DPI = 300                 # rasterization resolution fed to Tesseract
LOW_OCR_CONFIDENCE = 60       # average Tesseract confidence (0-100) below which we warn


# --- Data model -----------------------------------------------------------

@dataclass
class PageSignal:
    page_number: int
    char_count: int
    has_images: bool


@dataclass
class FileReport:
    filename: str
    pages: int = 0
    classification: str = "unknown"
    method: str = ""
    tables_extracted: int = 0
    ocr_confidence_avg: Optional[float] = None
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    output_text_file: Optional[str] = None
    output_csv_files: list = field(default_factory=list)
    output_pdf_file: Optional[str] = None


# --- Step 1: classification -----------------------------------------------

def classify_pdf(path: Path) -> tuple[str, list[PageSignal], list[str]]:
    """
    Classify a PDF as 'text' or 'scanned' using a cheap, OCR-free heuristic.

    For each page we pull:
      - extracted text length via pypdf (fast, no rasterization)
      - whether the page carries embedded raster images (pypdf's
        `page.images`, which lists the image XObjects on that page)

    A page counts as "image-only" when it has essentially no extractable
    text (< TEXT_CHAR_THRESHOLD chars) AND it does carry an embedded image
    (i.e., it looks like a scan, not a blank page). The whole document is
    classified 'scanned' when at least SCANNED_PAGE_FRACTION of its pages
    are image-only; otherwise 'text'.

    Mixed documents (some scanned pages inside an otherwise text-based
    file) are classified by majority vote and get an explicit warning so
    a human/legal reviewer knows a minority of pages may need separate
    OCR attention - the assignment asks for one classification per file,
    so we do not silently split single files across both branches.
    """
    warnings: list[str] = []
    reader = PdfReader(str(path))
    signals: list[PageSignal] = []
    image_only_pages = 0

    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception as e:
            text = ""
            warnings.append(f"page {i + 1}: text extraction raised {e!r}")

        char_count = len(text.strip())

        has_images = False
        try:
            has_images = len(page.images) > 0
        except Exception:
            pass  # some malformed pages raise here; treat as "no images found"

        signals.append(PageSignal(i + 1, char_count, has_images))

        if char_count < TEXT_CHAR_THRESHOLD and has_images:
            image_only_pages += 1
        elif char_count < TEXT_CHAR_THRESHOLD and not has_images:
            warnings.append(f"page {i + 1}: almost no text and no image (possibly a blank page)")

    total_pages = len(reader.pages) or 1
    scanned_fraction = image_only_pages / total_pages

    if scanned_fraction >= SCANNED_PAGE_FRACTION:
        classification = "scanned"
    else:
        classification = "text"
        if 0 < scanned_fraction < SCANNED_PAGE_FRACTION:
            warnings.append(
                f"mixed content: {image_only_pages}/{total_pages} pages look image-only; "
                f"file classified as text-based overall - review flagged pages manually"
            )

    return classification, signals, warnings


# --- Step 2: text-based extraction -----------------------------------------

def process_text_based(path: Path, out_dir: Path, report: FileReport) -> Path:
    """
    Extract text + tables from a text-based PDF with pdfplumber.

    pdfplumber (not pypdf) is used here specifically because it is the
    only bundled library with table detection (`extract_tables()`), and
    its text extraction preserves layout better than pypdf's.
    """
    text_chunks: list[str] = []
    csv_paths: list[str] = []
    table_index = 0

    with pdfplumber.open(str(path)) as pdf:
        report.pages = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            try:
                page_text = page.extract_text() or ""
            except Exception as e:
                page_text = ""
                report.warnings.append(f"page {i + 1}: pdfplumber text extraction failed: {e}")
            text_chunks.append(f"--- Page {i + 1} ---\n{page_text}")

            try:
                tables = page.extract_tables()
            except Exception as e:
                tables = []
                report.warnings.append(f"page {i + 1}: table extraction failed: {e}")

            for t_idx, table in enumerate(tables):
                if not table or len(table) < 2:
                    continue  # need at least a header row + one data row
                table_index += 1
                csv_name = f"{path.stem}_p{i + 1}_t{t_idx + 1}.csv"
                csv_path = out_dir / "tables" / csv_name
                csv_path.parent.mkdir(parents=True, exist_ok=True)
                try:
                    df = pd.DataFrame(table[1:], columns=table[0])
                    df.to_csv(csv_path, index=False)
                    csv_paths.append(str(csv_path))
                except Exception as e:
                    report.warnings.append(f"page {i + 1} table {t_idx + 1}: CSV export failed: {e}")

    text_out = out_dir / "text" / f"{path.stem}.txt"
    text_out.parent.mkdir(parents=True, exist_ok=True)
    text_out.write_text("\n\n".join(text_chunks), encoding="utf-8")

    report.method = "pdfplumber (text + table extraction)"
    report.tables_extracted = table_index
    report.output_text_file = str(text_out)
    report.output_csv_files = csv_paths
    if table_index == 0:
        report.warnings.append("no tables detected on any page")
    return path  # the ORIGINAL pdf is what gets merged into the master file


# --- Step 3: scanned -> searchable PDF via OCR ------------------------------

def process_scanned(path: Path, out_dir: Path, report: FileReport) -> Path:
    """
    OCR a scanned PDF into a searchable PDF.

    pdf2image rasterizes each page (it shells out to poppler's
    `pdftoppm`); pytesseract then runs Tesseract OCR on each page image.

    `pytesseract.image_to_pdf_or_hocr(image, extension="pdf")` is used
    instead of `image_to_string`: it returns a one-page PDF that contains
    the ORIGINAL page image with an invisible OCR text layer on top, so
    the result both looks like the source scan and is searchable/
    copy-pasteable/selectable - which is what "OCR to searchable text"
    requires for a legal document (a plain .txt dump would discard the
    scan's visual/exhibit value).
    """
    if pytesseract is None or convert_from_path is None:
        report.errors.append("pytesseract/pdf2image not installed; OCR skipped")
        report.method = "OCR skipped (missing dependency)"
        return path

    try:
        images = convert_from_path(str(path), dpi=OCR_DPI)
    except Exception as e:
        report.errors.append(f"pdf2image rasterization failed (is poppler installed and on PATH?): {e}")
        report.method = "OCR failed"
        return path

    report.pages = len(images)
    writer = PdfWriter()
    page_confidences: list[float] = []

    for i, image in enumerate(images):
        try:
            pdf_bytes = pytesseract.image_to_pdf_or_hocr(image, extension="pdf")
            page_reader = PdfReader(io.BytesIO(pdf_bytes))
            writer.add_page(page_reader.pages[0])
        except Exception as e:
            report.warnings.append(f"page {i + 1}: OCR-to-PDF failed: {e}")
            continue

        try:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            confs = [float(c) for c in data.get("conf", []) if str(c) not in ("-1",)]
            if confs:
                page_confidences.append(sum(confs) / len(confs))
        except Exception:
            pass  # confidence stats are best-effort, not fatal

    if page_confidences:
        avg_conf = sum(page_confidences) / len(page_confidences)
        report.ocr_confidence_avg = round(avg_conf, 1)
        if avg_conf < LOW_OCR_CONFIDENCE:
            report.warnings.append(
                f"low average OCR confidence ({avg_conf:.1f}/100); "
                f"scan quality may be poor - manual review recommended"
            )
    else:
        report.warnings.append("OCR confidence unavailable (no data returned by Tesseract)")

    if len(writer.pages) == 0:
        report.errors.append("OCR produced zero usable pages")
        report.method = "OCR failed"
        return path

    ocr_out = out_dir / "ocr" / f"{path.stem}.ocr.pdf"
    ocr_out.parent.mkdir(parents=True, exist_ok=True)
    with open(ocr_out, "wb") as f:
        writer.write(f)

    report.method = "pdf2image + pytesseract/Tesseract -> searchable PDF"
    report.output_pdf_file = str(ocr_out)
    return ocr_out


# --- Step 4: cover page, watermark, merge, encrypt --------------------------

def build_cover_page(out_path: Path, title: str, file_inventory: list[dict]) -> None:
    """
    Build the cover page (title, generation date, file inventory table)
    with reportlab's Platypus layer, which flows the inventory table
    across pages automatically if the batch is large - manual
    canvas-coordinate placement (as in the skill's basic examples) would
    not handle an arbitrarily long file list gracefully.
    """
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(out_path), pagesize=letter)
    story = [
        Paragraph(title, styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles["Normal"]),
        Spacer(1, 24),
        Paragraph("File Inventory", styles["Heading2"]),
        Spacer(1, 12),
    ]

    table_data = [["#", "File", "Pages", "Classification", "Method"]]
    for idx, item in enumerate(file_inventory, start=1):
        table_data.append(
            [
                str(idx),
                item["filename"],
                str(item["pages"]),
                item["classification"],
                item["method"],
            ]
        )

    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(table)
    doc.build(story)


def build_watermark_overlay(text: str = "CONFIDENTIAL"):
    """
    Build a single, diagonal, semi-transparent watermark page with
    reportlab's canvas, to be merged onto every output page with pypdf's
    `page.merge_page()`. Only the drawn text has ink - the rest of a
    reportlab canvas page is left blank/transparent by default, so
    merging it does not paint over or obscure the underlying content.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter
    c.saveState()
    c.setFont("Helvetica-Bold", 60)
    c.setFillColor(colors.red)
    c.setFillAlpha(0.15)  # requires reportlab >= 3.5.61
    c.translate(width / 2, height / 2)
    c.rotate(45)
    c.drawCentredString(0, 0, text)
    c.restoreState()
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def merge_and_finalize(
    processed_files: list[Path],
    file_reports: list[FileReport],
    out_dir: Path,
    title: str,
    password: str,
) -> Path:
    """Build cover page, merge everything, watermark every page, encrypt."""
    cover_pdf_path = out_dir / "_cover.pdf"
    inventory = [asdict(r) for r in file_reports]
    build_cover_page(cover_pdf_path, title, inventory)

    writer = PdfWriter()
    for source in [cover_pdf_path] + processed_files:
        try:
            reader = PdfReader(str(source))
        except PdfReadError as e:
            logger.error(f"Could not open {source} for merge: {e}")
            continue
        for page in reader.pages:
            writer.add_page(page)

    watermark_page = build_watermark_overlay("CONFIDENTIAL")
    for page in writer.pages:
        page.merge_page(watermark_page)

    # AES-256 requires a reasonably recent pypdf (>=3.1); see dependencies.
    writer.encrypt(user_password=password, owner_password=None, algorithm="AES-256")

    master_path = out_dir / "master.pdf"
    with open(master_path, "wb") as f:
        writer.write(f)

    cover_pdf_path.unlink(missing_ok=True)
    return master_path


# --- Step 5: reporting -------------------------------------------------------

def write_reports(reports: list[FileReport], out_dir: Path) -> None:
    json_path = out_dir / "processing_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump([asdict(r) for r in reports], f, indent=2)

    csv_path = out_dir / "processing_report.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "filename", "pages", "classification", "method",
                "tables_extracted", "ocr_confidence_avg", "warnings", "errors",
            ]
        )
        for r in reports:
            w.writerow(
                [
                    r.filename, r.pages, r.classification, r.method,
                    r.tables_extracted, r.ocr_confidence_avg,
                    "; ".join(r.warnings), "; ".join(r.errors),
                ]
            )
    logger.info(f"Reports written: {json_path}, {csv_path}")


# --- Orchestration -----------------------------------------------------------

def process_folder(input_dir: Path, out_dir: Path, password: str, title: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_files = sorted(p for p in input_dir.glob("*.pdf"))
    if not pdf_files:
        logger.warning(f"No PDFs found in {input_dir}")
        return

    reports: list[FileReport] = []
    processed_paths: list[Path] = []

    for pdf_path in pdf_files:
        report = FileReport(filename=pdf_path.name)
        try:
            classification, page_signals, warnings = classify_pdf(pdf_path)
            report.classification = classification
            report.pages = len(page_signals)
            report.warnings.extend(warnings)
        except PdfReadError as e:
            report.errors.append(f"could not open PDF (corrupted or password-protected?): {e}")
            reports.append(report)
            continue
        except Exception as e:
            report.errors.append(f"classification failed: {e}")
            reports.append(report)
            continue

        try:
            if classification == "scanned":
                out_path = process_scanned(pdf_path, out_dir, report)
            else:
                process_text_based(pdf_path, out_dir, report)
                out_path = pdf_path  # merge the original text PDF, not the .txt sidecar
            processed_paths.append(out_path)
        except Exception as e:
            report.errors.append(f"processing failed: {e}")
            logger.exception(f"Failed processing {pdf_path}")

        reports.append(report)

    if not processed_paths:
        logger.error("No files were successfully processed; skipping merge step.")
        write_reports(reports, out_dir)
        return

    master_path = merge_and_finalize(processed_paths, reports, out_dir, title, password)
    logger.info(f"Master file written to {master_path}")

    write_reports(reports, out_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Legal PDF processing pipeline")
    parser.add_argument("input_dir", type=Path, help="folder of input PDFs")
    parser.add_argument("output_dir", type=Path, help="folder for all outputs")
    parser.add_argument("--password", required=True, help="password used to encrypt master.pdf")
    parser.add_argument("--title", default="Document Production", help="cover page title")
    args = parser.parse_args()
    process_folder(args.input_dir, args.output_dir, args.password, args.title)


if __name__ == "__main__":
    main()
```

---

## 3. Dependencies

### Python (`requirements.txt`)

```
pypdf>=4.0          # BSD        - read/write/merge/watermark/encrypt
pdfplumber>=0.10    # MIT        - text + table extraction
pandas>=2.0         # BSD-3      - table -> CSV
reportlab>=3.6      # BSD-3      - cover page + watermark generation (>=3.5.61 for setFillAlpha)
pytesseract>=0.3.10 # Apache-2.0 - OCR wrapper around the Tesseract engine
pdf2image>=1.16     # MIT        - rasterize PDF pages (wraps poppler pdftoppm)
```

### System packages (not installable via pip)

- **Tesseract OCR engine** (Apache-2.0) — required by `pytesseract`.
  - Debian/Ubuntu: `apt-get install tesseract-ocr`
  - macOS: `brew install tesseract`
- **poppler-utils** (GPL-2) — required by `pdf2image` (invokes `pdftoppm`/`pdfinfo` as subprocesses).
  - Debian/Ubuntu: `apt-get install poppler-utils`
  - macOS: `brew install poppler`
  - See the license note in section 1 above regarding GPL-2 and subprocess invocation vs. bundling/distribution.

### Version-sensitive behavior to be aware of

- `writer.encrypt(..., algorithm="AES-256")` requires `pypdf >= 3.1` (older pypdf/PyPDF2 forks only support RC4/AES-128 and use a different, positional-argument call signature — `writer.encrypt("user", "owner")`).
- `canvas.setFillAlpha()` (used for the semi-transparent watermark) requires `reportlab >= 3.5.61`; earlier versions will raise `AttributeError`.

---

## 4. Operations

### How to run

```bash
# one-time setup
pip install -r requirements.txt
sudo apt-get install -y tesseract-ocr poppler-utils   # or brew install on macOS

# run
python pipeline.py /path/to/input_pdfs /path/to/output \
    --password "S3cur3Client!Password" \
    --title "Smith v. Jones - Document Production, Batch 1"
```

Outputs land in `/path/to/output/`:
- `master.pdf` — cover page + all processed files, watermarked "CONFIDENTIAL" on every page, AES-256 password-encrypted with the password given via `--password`.
- `text/<name>.txt` — extracted text for each text-based input.
- `tables/<name>_p<page>_t<n>.csv` — one CSV per detected table.
- `ocr/<name>.ocr.pdf` — searchable OCR'd PDF for each scanned input (these get merged into `master.pdf`; the standalone files are also kept for spot-checking OCR quality independent of the master).
- `processing_report.json` / `processing_report.csv` — per-file: page count, classification, method used, table count, average OCR confidence (scanned files only), warnings, errors.

### Common failure modes

| Symptom | Likely cause | Mitigation |
|---|---|---|
| `pdf2image.exceptions.PDFInfoNotInstalledError` / rasterization exceptions | poppler-utils not installed or not on `PATH` | Install `poppler-utils`; on Windows, add the poppler `bin/` folder to `PATH` explicitly |
| `pytesseract.TesseractNotFoundError` | Tesseract engine binary missing | Install `tesseract-ocr`; on Windows set `pytesseract.pytesseract.tesseract_cmd` to the installed exe path |
| A file misclassified as "text" but produces near-empty `.txt` | Document has a text layer with garbage/embedded-font-only glyphs (common with some scan-to-PDF tools that fake a text layer), or the classification threshold (`TEXT_CHAR_THRESHOLD`) is too permissive for this batch | Check `processing_report.csv` warnings for "mixed content"; lower `TEXT_CHAR_THRESHOLD` or raise `SCANNED_PAGE_FRACTION` and re-run; consider forcing OCR for flagged files |
| Low `ocr_confidence_avg` (<60) on a scanned file | Poor scan quality (skew, low DPI source, faint print) | Reported as a warning per file; consider re-scanning at higher DPI, increasing `OCR_DPI`, or manual QA of that file before it's relied on legally |
| `pypdf.errors.PdfReadError` when opening an input file | Corrupted PDF, or the input is already password-protected | Pipeline logs the error and skips that file (it still appears in the report with `errors` populated) rather than aborting the whole batch; repair with `qpdf --check` / `qpdf --fix-qdf`, or supply the password to decrypt before re-running |
| `writer.encrypt(...)` raises `TypeError` on `algorithm=` kwarg | `pypdf` version too old (< 3.1) | `pip install -U pypdf`; do not silently fall back to the legacy 2-positional-arg call without confirming AES-256 is actually applied, since RC4/AES-128 is materially weaker for confidential legal material |
| Watermark looks like a solid gray box instead of translucent text | `reportlab` too old for `setFillAlpha` | Upgrade `reportlab`; do not remove the alpha call, since a fully opaque watermark can obscure underlying content |
| Master PDF opens but Ctrl+F does not find OCR'd text | OCR'd page added via `image_to_string` instead of `image_to_pdf_or_hocr` (i.e., someone edited `process_scanned` to output plain text merged as an image page) | Confirm `process_scanned` is using `image_to_pdf_or_hocr(..., extension="pdf")`, which is what actually embeds the invisible text layer |
| Very large batches run slowly | OCR (rasterizing at 300 DPI + Tesseract) is by far the slowest step | Process scanned files in parallel (e.g. `multiprocessing.Pool` over `pdf_files`), or lower `OCR_DPI` for a speed/quality tradeoff; text-based extraction and merging are comparatively fast |

---

LOADED: SKILL.md, reference.md, LICENSE.txt
