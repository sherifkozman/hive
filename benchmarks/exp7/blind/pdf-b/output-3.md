# Legal Document Processing Pipeline

A single script, `pipeline.py`, that ingests a folder of mixed PDFs (text-based
and scanned, including files that mix both kinds of pages internally),
normalizes them, merges them into one watermarked/encrypted master file with a
cover page, and emits a per-file processing report.

## 1. Library selection and rationale

| Step | Library | Why | License / concerns |
|---|---|---|---|
| Classify text vs. scanned | **pdfplumber** (wraps `pdfminer.six`) | Gives per-page character-level text plus per-image bounding boxes in one object, which is exactly what's needed to build a text-density / image-coverage heuristic. Pure Python, no external binaries. | MIT (pdfplumber) / MIT (pdfminer.six). No concerns. |
| Text + table extraction | **pdfplumber** | Already loaded for classification, so reusing it avoids a second parser disagreeing with the first about page geometry. `extract_text()` and `extract_tables()` are good enough for typical contracts/pleadings (ruled and whitespace-based tables). | MIT. No concerns. |
| (Considered, not used) table extraction | Camelot / tabula-py | Better on complex ruled tables, but Camelot's "lattice" mode shells out to **Ghostscript** (AGPL-3.0/commercial dual license) and tabula-py requires a **Java runtime** + bundles Apache-licensed `tabula-java`. Both add heavyweight, licensing-sensitive dependencies for a marginal accuracy gain on typical legal documents, so they're left as a documented upgrade path, not the default. | Camelot → Ghostscript AGPL concern; tabula-py → JVM dependency, Apache-2.0 otherwise. |
| Rasterizing scanned pages | **pdf2image** (wraps **Poppler**'s `pdftoppm`/`pdftocairo`) | Simple, well-maintained way to get per-page images at a controlled DPI for OCR. | pdf2image: MIT. Poppler itself is GPL-2.0/3.0, but it is invoked as an external command-line binary (subprocess), not linked into the Python process, so shipping/using it does not require the internal pipeline code to be GPL-licensed. Flag for legal sign-off if the *pipeline itself* is ever redistributed to a third party bundled with Poppler binaries. |
| OCR | **pytesseract** over the **Tesseract** engine, using `image_to_pdf_or_hocr(..., extension="pdf")` to get Tesseract's own searchable-PDF renderer for each page, plus `image_to_data` to compute a mean confidence score | This deliberately avoids `ocrmypdf`, which is the more "batteries-included" OCR-to-searchable-PDF tool but depends on **Ghostscript** (AGPL-3.0/commercial) and `qpdf` at runtime. For a legal-team deliverable, keeping OCR on Tesseract's native PDF writer sidesteps the AGPL question entirely while still producing a proper searchable PDF page. | pytesseract: Apache-2.0. Tesseract: Apache-2.0. No AGPL exposure. |
| Merge / page assembly / encryption | **pypdf** (`PdfReader`/`PdfWriter`) | Actively maintained successor to PyPDF2, pure Python, supports appending readers, `merge_page` for watermark overlays, and `encrypt()` with AES-256 (via the optional `pycryptodome` backend). | BSD-3-Clause. No concerns. Requires the `pypdf[crypto]` extra (pulls in `pycryptodome`, BSD) for AES-256 instead of the weaker legacy RC4. |
| Cover page + watermark generation | **reportlab** (open-source core, `canvas` API) | Generates the cover page and a translucent, rotated "CONFIDENTIAL" overlay PDF in memory, which pypdf then merges onto every page. | BSD-license for the open-source `reportlab` toolkit used here (not the commercial ReportLab PLUS product — we only touch the open APIs). No concerns. |
| (Considered, not used) all-in-one PDF engine | **PyMuPDF (fitz)** | Faster and can do classification, extraction, rendering, and watermarking in one library. | Deliberately avoided as the primary engine: PyMuPDF is dual-licensed **AGPL-3.0 / commercial (Artifex)**. For an internal legal tool that's likely fine, but if this pipeline is ever offered as a hosted service or redistributed to clients, AGPL's network-use clause and copyleft obligations become a real question. Swapping in PyMuPDF is a valid performance optimization *if* the firm buys or accepts the Artifex commercial license — noted as a follow-up decision for whoever owns OSS compliance, not made unilaterally here. |
| Report output | Python stdlib `csv` / `json` | No reason to add a dependency for a flat report. | N/A |

**Overall license posture:** every library actually wired into `pipeline.py`
(pdfplumber/pdfminer.six, pdf2image, pytesseract, pypdf, pycryptodome,
reportlab) is MIT/BSD/Apache-2.0 — permissive, no copyleft, safe for a law
firm to run internally or redistribute. The one runtime dependency that isn't
pure-Python-licensed is **Poppler** (GPL), invoked only as a subprocess by
`pdf2image`; this is standard practice (same approach used by most PDF
tooling) and does not by itself GPL-license the calling code, but it's worth
one line in a vendor/OSS register given the audience.

## 2. Pipeline design

1. **Classify** — For each page, compute (a) extractable character count via
   `pdfplumber`, and (b) fraction of the page area covered by raster images
   (`page.images` bounding boxes vs. `page.width * page.height`). A page with
   real text (≥ 20 chars) is `text`; a page with little/no text and heavy
   image coverage (≥ 50%) is `scanned`; a page with little/no text and no
   detected image is treated as `scanned` too (safer default — avoids
   silently dropping content) and flagged as an "ambiguous classification"
   warning for manual review. A file whose pages are not all the same label
   is reported as `mixed`.
2. **Text-based pages** — `pdfplumber.extract_text()` per page → concatenated
   `.txt`; `pdfplumber.extract_tables()` per page → one CSV per detected
   table (`<stem>_p<page>_t<idx>.csv`).
3. **Scanned pages** — rasterize at 300 DPI with `pdf2image`, OCR each image
   with `pytesseract.image_to_pdf_or_hocr(..., extension="pdf")` to get a
   single searchable PDF page, and `pytesseract.image_to_data` to compute a
   mean word-confidence used for the report's warnings (flagged if < 60).
4. **Per-file reassembly** — pages are reassembled in original order: text
   pages reuse the original vector page object (via `pypdf.PdfReader`),
   scanned pages are replaced by their OCR'd searchable-PDF page. This
   produces one "processed" PDF per input file that is both faithful to the
   original layout and fully text-searchable.
5. **Master merge** — a cover page (title, generation date, file inventory
   with page counts/method) is generated with `reportlab` and prepended;
   every processed file's pages are appended in filename order via
   `pypdf.PdfWriter`.
6. **Watermark** — a translucent, 45°-rotated "CONFIDENTIAL" overlay is
   generated once per distinct page size and `merge_page`'d onto every page
   of the assembled writer, including the cover page.
7. **Encrypt** — `PdfWriter.encrypt(user_password, owner_password,
   algorithm="AES-256")`.
8. **Report** — one JSON array and one flat CSV, both with: filename, page
   count, method (`text-based` / `scanned` / `mixed`), tables extracted,
   mean OCR confidence (if applicable), warnings, and processing time.

Any per-file failure (corrupted PDF, password-protected input, missing
language pack, etc.) is caught, logged, and recorded in the report as an
`error` instead of aborting the whole batch.

## 3. `pipeline.py`

```python
#!/usr/bin/env python3
"""
Legal document processing pipeline.

Classifies each PDF in an input folder as text-based / scanned / mixed,
extracts text and tables from text pages, OCRs scanned pages into a
searchable layer, reassembles a per-file "processed" PDF, merges all
processed PDFs into one encrypted, watermarked master file with a generated
cover page, and writes a per-file processing report (JSON + CSV).

See the accompanying README section for install/run instructions.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import pdfplumber
from pdf2image import convert_from_path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
import pytesseract
from pytesseract import Output
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
)
log = logging.getLogger("legal_pipeline")

# --- Tunable thresholds --------------------------------------------------
TEXT_CHAR_THRESHOLD = 20        # min extractable chars for a page to count as "text"
IMAGE_COVERAGE_THRESHOLD = 0.5  # fraction of page area covered by images -> "scanned"
OCR_CONFIDENCE_WARN = 60.0      # mean Tesseract word confidence below this -> warning
OCR_DPI = 300


@dataclass
class FileReport:
    filename: str
    pages: int = 0
    method: str = ""            # text-based / scanned / mixed / error
    tables_extracted: int = 0
    mean_ocr_confidence: Optional[float] = None
    warnings: list = field(default_factory=list)
    error: Optional[str] = None
    processing_seconds: float = 0.0


# --------------------------------------------------------------------------
# Step 1: classification
# --------------------------------------------------------------------------
def classify_page(page) -> tuple[str, Optional[str]]:
    """Return (label, warning) for a single pdfplumber page."""
    text = (page.extract_text() or "").strip()
    text_len = len(text)

    page_area = (page.width or 0) * (page.height or 0)
    image_area = 0.0
    for img in page.images:
        w = max(0.0, img.get("x1", 0) - img.get("x0", 0))
        h = max(0.0, img.get("bottom", 0) - img.get("top", 0))
        image_area += w * h
    image_coverage = (image_area / page_area) if page_area else 0.0

    if text_len >= TEXT_CHAR_THRESHOLD:
        return "text", None
    if image_coverage >= IMAGE_COVERAGE_THRESHOLD:
        return "scanned", None
    if text_len == 0 and image_coverage == 0:
        # No text and no detected image xobject: could be a blank page or a
        # scan whose image isn't exposed as a simple image bbox. Default to
        # OCR rather than silently dropping content, but flag it.
        return "scanned", "ambiguous page (no text, no detected image) — defaulted to OCR"
    return "text", None


def classify_pdf(path: Path) -> tuple[list[str], list[str]]:
    """Return (per_page_labels, warnings) for a PDF file."""
    labels: list[str] = []
    warnings: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            label, warn = classify_page(page)
            labels.append(label)
            if warn:
                warnings.append(f"page {i + 1}: {warn}")
    return labels, warnings


def overall_method(labels: list[str]) -> str:
    uniq = set(labels)
    if uniq == {"text"}:
        return "text-based"
    if uniq == {"scanned"}:
        return "scanned"
    return "mixed"


# --------------------------------------------------------------------------
# Step 2: text-based extraction (text + tables)
# --------------------------------------------------------------------------
def extract_text_and_tables(path: Path, labels: list[str], out_dir: Path) -> tuple[str, int]:
    """Extract text from all 'text' pages and tables from 'text' pages.

    Returns (combined_text, table_count). Writes one CSV per table.
    """
    stem = path.stem
    text_chunks: list[str] = []
    table_count = 0
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            if labels[i] != "text":
                continue
            text_chunks.append(page.extract_text() or "")
            for t_idx, table in enumerate(page.extract_tables() or []):
                table_count += 1
                csv_path = out_dir / f"{stem}_p{i + 1}_t{t_idx + 1}.csv"
                with open(csv_path, "w", newline="", encoding="utf-8") as fh:
                    writer = csv.writer(fh)
                    for row in table:
                        writer.writerow(["" if c is None else c for c in row])
    text_path = out_dir / f"{stem}.txt"
    text_path.write_text("\n\n".join(text_chunks), encoding="utf-8")
    return text_path.as_posix(), table_count


# --------------------------------------------------------------------------
# Step 3: OCR for scanned pages
# --------------------------------------------------------------------------
def ocr_page_to_pdf_bytes(path: Path, page_number_1based: int, lang: str) -> tuple[bytes, float]:
    """Rasterize one page and OCR it into a single searchable-PDF page.

    Returns (pdf_bytes, mean_confidence).
    """
    images = convert_from_path(
        str(path),
        dpi=OCR_DPI,
        first_page=page_number_1based,
        last_page=page_number_1based,
    )
    image = images[0]

    pdf_bytes = pytesseract.image_to_pdf_or_hocr(image, extension="pdf", lang=lang)

    data = pytesseract.image_to_data(image, lang=lang, output_type=Output.DICT)
    confidences = [float(c) for c in data.get("conf", []) if str(c).strip() not in ("", "-1")]
    mean_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return pdf_bytes, mean_conf


# --------------------------------------------------------------------------
# Step 4 (part of merge prep): reassemble a per-file processed PDF
# --------------------------------------------------------------------------
def build_processed_pdf(
    path: Path, labels: list[str], out_dir: Path, lang: str
) -> tuple[Path, list[str], Optional[float]]:
    """Build a searchable, layout-faithful PDF for one input file.

    Text pages are copied as-is; scanned pages are replaced by their OCR'd
    searchable-PDF page. Returns (output_path, warnings, mean_ocr_confidence).
    """
    warnings: list[str] = []
    reader = PdfReader(str(path))
    writer = PdfWriter()
    ocr_confidences: list[float] = []

    for i, label in enumerate(labels):
        if label == "text":
            writer.add_page(reader.pages[i])
            continue

        # scanned page -> OCR
        try:
            pdf_bytes, mean_conf = ocr_page_to_pdf_bytes(path, i + 1, lang)
            ocr_confidences.append(mean_conf)
            if mean_conf < OCR_CONFIDENCE_WARN:
                warnings.append(
                    f"page {i + 1}: low OCR confidence ({mean_conf:.1f}) — verify manually"
                )
            ocr_reader = PdfReader(io.BytesIO(pdf_bytes))
            writer.add_page(ocr_reader.pages[0])
        except Exception as exc:  # noqa: BLE001 - report and continue
            warnings.append(f"page {i + 1}: OCR failed ({exc}); falling back to original page")
            writer.add_page(reader.pages[i])

    out_path = out_dir / f"{path.stem}_processed.pdf"
    with open(out_path, "wb") as fh:
        writer.write(fh)

    mean_conf_overall = (
        sum(ocr_confidences) / len(ocr_confidences) if ocr_confidences else None
    )
    return out_path, warnings, mean_conf_overall


# --------------------------------------------------------------------------
# Step 5: cover page
# --------------------------------------------------------------------------
def build_cover_page(title: str, generated_at: str, inventory: list[FileReport]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter

    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2, height - 100, title)

    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2, height - 125, f"Generated: {generated_at}")

    c.setFont("Helvetica-Bold", 12)
    y = height - 170
    c.drawString(72, y, "File inventory")
    y -= 20
    c.setFont("Helvetica", 9)
    c.drawString(72, y, "File")
    c.drawString(340, y, "Pages")
    c.drawString(400, y, "Method")
    c.drawString(480, y, "Warnings")
    y -= 12
    c.line(72, y, width - 72, y)
    y -= 14

    for rep in inventory:
        if y < 72:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = height - 72
        name = rep.filename if len(rep.filename) <= 40 else rep.filename[:37] + "..."
        c.drawString(72, y, name)
        c.drawString(340, y, str(rep.pages))
        c.drawString(400, y, rep.method or "error")
        c.drawString(480, y, str(len(rep.warnings)))
        y -= 14

    c.showPage()
    c.save()
    return buf.getvalue()


# --------------------------------------------------------------------------
# Step 6: watermark
# --------------------------------------------------------------------------
_watermark_cache: dict[tuple[float, float], bytes] = {}


def get_watermark_overlay(width: float, height: float, text: str = "CONFIDENTIAL") -> PdfReader:
    key = (round(width, 2), round(height, 2))
    if key not in _watermark_cache:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(width, height))
        c.saveState()
        c.setFont("Helvetica-Bold", max(24, int(min(width, height) / 6)))
        c.setFillGray(0.5)
        try:
            c.setFillAlpha(0.18)
        except AttributeError:
            pass  # very old reportlab without alpha support: falls back to solid light gray
        c.translate(width / 2, height / 2)
        c.rotate(45)
        c.drawCentredString(0, 0, text)
        c.restoreState()
        c.showPage()
        c.save()
        _watermark_cache[key] = buf.getvalue()
    return PdfReader(io.BytesIO(_watermark_cache[key]))


def apply_watermark(writer: PdfWriter, text: str = "CONFIDENTIAL") -> None:
    for page in writer.pages:
        box: RectangleObject = page.mediabox
        w, h = float(box.width), float(box.height)
        overlay_reader = get_watermark_overlay(w, h, text)
        page.merge_page(overlay_reader.pages[0])


# --------------------------------------------------------------------------
# Step 4 + 6 + 7: merge, watermark, encrypt
# --------------------------------------------------------------------------
def build_master_pdf(
    cover_pdf_bytes: bytes,
    processed_paths: list[Path],
    out_path: Path,
    user_password: str,
    owner_password: Optional[str],
) -> None:
    writer = PdfWriter()

    cover_reader = PdfReader(io.BytesIO(cover_pdf_bytes))
    for page in cover_reader.pages:
        writer.add_page(page)

    for p in processed_paths:
        reader = PdfReader(str(p))
        for page in reader.pages:
            writer.add_page(page)

    apply_watermark(writer, "CONFIDENTIAL")

    writer.encrypt(
        user_password=user_password,
        owner_password=owner_password or user_password,
        algorithm="AES-256",
    )

    with open(out_path, "wb") as fh:
        writer.write(fh)


# --------------------------------------------------------------------------
# Step 7: report
# --------------------------------------------------------------------------
def write_reports(reports: list[FileReport], out_dir: Path) -> None:
    json_path = out_dir / "processing_report.json"
    csv_path = out_dir / "processing_report.csv"

    json_path.write_text(
        json.dumps([r.__dict__ for r in reports], indent=2), encoding="utf-8"
    )

    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["filename", "pages", "method", "tables_extracted",
             "mean_ocr_confidence", "warnings", "error", "processing_seconds"]
        )
        for r in reports:
            writer.writerow(
                [r.filename, r.pages, r.method, r.tables_extracted,
                 r.mean_ocr_confidence, " | ".join(r.warnings), r.error or "",
                 f"{r.processing_seconds:.2f}"]
            )


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------
def process_one_file(path: Path, work_dir: Path, lang: str) -> tuple[FileReport, Optional[Path]]:
    report = FileReport(filename=path.name)
    t0 = time.time()
    try:
        labels, class_warnings = classify_pdf(path)
        report.pages = len(labels)
        report.method = overall_method(labels)
        report.warnings.extend(class_warnings)

        if any(l == "text" for l in labels):
            _, table_count = extract_text_and_tables(path, labels, work_dir)
            report.tables_extracted = table_count

        processed_path, ocr_warnings, mean_conf = build_processed_pdf(
            path, labels, work_dir, lang
        )
        report.warnings.extend(ocr_warnings)
        report.mean_ocr_confidence = mean_conf

        report.processing_seconds = time.time() - t0
        return report, processed_path

    except Exception as exc:  # noqa: BLE001 - one bad file must not kill the batch
        log.exception("Failed to process %s", path.name)
        report.error = str(exc)
        report.method = "error"
        report.processing_seconds = time.time() - t0
        return report, None


def run_pipeline(
    input_dir: Path,
    output_dir: Path,
    title: str,
    password: str,
    owner_password: Optional[str],
    lang: str,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "work"
    work_dir.mkdir(parents=True, exist_ok=True)

    pdf_paths = sorted(p for p in input_dir.glob("*.pdf"))
    if not pdf_paths:
        log.warning("No PDFs found in %s", input_dir)
        return

    reports: list[FileReport] = []
    processed_paths: list[Path] = []

    for path in pdf_paths:
        log.info("Processing %s", path.name)
        report, processed_path = process_one_file(path, work_dir, lang)
        reports.append(report)
        if processed_path is not None:
            processed_paths.append(processed_path)

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    cover_bytes = build_cover_page(title, generated_at, reports)

    master_path = output_dir / "master.pdf"
    build_master_pdf(cover_bytes, processed_paths, master_path, password, owner_password)
    log.info("Wrote encrypted master PDF: %s", master_path)

    write_reports(reports, output_dir)
    log.info("Wrote reports: %s", output_dir / "processing_report.json")


def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Legal document processing pipeline")
    ap.add_argument("--input-dir", required=True, type=Path)
    ap.add_argument("--output-dir", required=True, type=Path)
    ap.add_argument("--title", default="Processed Legal Document Set")
    ap.add_argument("--password", required=True, help="User (open) password for master.pdf")
    ap.add_argument("--owner-password", default=None, help="Owner password; defaults to --password")
    ap.add_argument("--lang", default="eng", help="Tesseract language code, e.g. eng, fra")
    return ap.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    run_pipeline(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        title=args.title,
        password=args.password,
        owner_password=args.owner_password,
        lang=args.lang,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

## 4. Dependencies

`requirements.txt`:

```
pdfplumber>=0.11
pdf2image>=1.17
pytesseract>=0.3.10
Pillow>=10.0
pypdf[crypto]>=4.2
reportlab>=4.1
```

System packages (not installable via pip):

```
# Debian/Ubuntu
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng poppler-utils

# macOS (Homebrew)
brew install tesseract poppler
```

Add extra `tesseract-ocr-<lang>` packages for any non-English languages the
firm needs.

## 5. Operations

### How to run

```bash
python pipeline.py \
  --input-dir ./incoming_pdfs \
  --output-dir ./out \
  --title "Smith v. Jones — Document Production" \
  --password 'ChangeMe123!' \
  --owner-password 'FirmAdminPassword!' \
  --lang eng
```

Outputs land in `./out`:

- `master.pdf` — merged, watermarked, AES-256-encrypted final document
  (requires `--password` to open).
- `processing_report.json` / `processing_report.csv` — per-file pages,
  method, table count, OCR confidence, warnings, errors, timing.
- `out/work/` — intermediate artifacts: `<file>.txt` extracted text,
  `<file>_p<n>_t<n>.csv` extracted tables, `<file>_processed.pdf` per-file
  searchable PDF (the same pages that get folded into `master.pdf`).

### Common failure modes

- **Password-protected/encrypted input PDF** — `PdfReader`/`pdfplumber` will
  raise; the file is recorded in the report with `method: error` and the
  exception message, and the batch continues. Fix: obtain the password and
  either re-run just that file or add a decrypt step before classification.
- **Missing Tesseract language pack** — `pytesseract` raises
  `TesseractError` mentioning the missing `.traineddata`; install
  `tesseract-ocr-<lang>` and re-run.
- **`poppler` not installed / not on PATH** — `pdf2image.convert_from_path`
  raises `PDFInfoNotInstalledError`; install `poppler-utils` (Linux) or
  `poppler` (Homebrew) and ensure `pdftoppm`/`pdfinfo` are on `PATH`.
  Windows needs the Poppler binaries downloaded and added to `PATH` manually.
- **Very large scanned files / slow OCR** — 300 DPI rasterization + OCR is
  CPU- and memory-bound; large multi-hundred-page scans can take minutes per
  file. Mitigate by lowering `OCR_DPI`, running files in parallel
  (`concurrent.futures.ProcessPoolExecutor` around `process_one_file`), or
  pre-splitting very large PDFs.
- **Low OCR confidence on poor scans** — surfaced explicitly in the report
  (`mean_ocr_confidence` and a per-page warning below the 60 threshold);
  treat these as a manual-review queue rather than trusting the OCR text for
  privileged/production review.
- **Tables mis-split by `pdfplumber`** — whitespace- or ruling-based table
  detection can merge/split columns on unusual layouts (e.g., dense
  financial exhibits). The report's `tables_extracted` count plus a visual
  spot-check of the CSVs is the mitigation; Camelot/tabula-py are documented
  upgrade paths for problem files (see license notes above before adopting).
- **AES-256 encryption not applied** — if `pycryptodome` isn't installed
  (i.e., `pypdf[crypto]` extra was skipped), `pypdf` may silently fall back
  to a weaker algorithm or raise depending on version; verify the extra is
  installed (`pip show pycryptodome`) before relying on `master.pdf` for
  anything privileged.
- **Ambiguous page classification** — pages with neither real text nor a
  detected image bounding box default to OCR and get an explicit warning;
  review the report's warnings column for these before treating the master
  file as authoritative.
