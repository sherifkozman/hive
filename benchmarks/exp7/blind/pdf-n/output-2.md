# Filling a Non-Fillable (Flat/Scanned) Government Form with `application.pdf` + `data.json`

This deliverable covers:

1. A complete, runnable Python solution that fills the flat form by overlaying text at the correct positions, following the recommended non-fillable-form workflow (structure-based coordinate extraction first, visual-estimation fallback, then validation).
2. A pre-submission verification checklist.
3. A short comparison section: how the approach would differ if `application.pdf` had real AcroForm fields.

---

## 0. First, confirm the form really is non-fillable

Never assume — always check first. A quick, dependency-light way to do this with `pypdf`:

```python
#!/usr/bin/env python3
"""check_fillable_fields.py — Determine whether a PDF has AcroForm fields."""
import sys
from pypdf import PdfReader

def has_fillable_fields(path: str) -> bool:
    reader = PdfReader(path)
    fields = reader.get_fields()
    return bool(fields)

if __name__ == "__main__":
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "application.pdf"
    if has_fillable_fields(pdf_path):
        print(f"{pdf_path}: HAS fillable AcroForm fields.")
        sys.exit(0)
    else:
        print(f"{pdf_path}: NO fillable fields detected (flat/scanned form).")
        sys.exit(1)
```

Run it:

```bash
python check_fillable_fields.py application.pdf
# -> "application.pdf: NO fillable fields detected (flat/scanned form)."
```

Because the task states the form is confirmed flat/scanned with no AcroForm fields, we proceed with the **overlay** workflow below. **Do not skip this check in practice** — filling logic differs completely for fillable vs. non-fillable forms, and guessing wrong wastes the whole effort.

---

## 1. Recommended workflow for non-fillable forms

The correct approach is **not** to eyeball pixel coordinates from a screenshot and hard-code them. It is:

1. **Try structure extraction first** (accurate, textual) — pull exact PDF-coordinate positions of every label, line, and checkbox directly from the PDF's text/vector layer using `pdfplumber`.
2. **Fall back to visual estimation** only if the PDF is a true scanned image (no extractable text layer) — render to PNG, estimate rough pixel positions, then **zoom/crop-refine** them for precision.
3. **Build a single `fields.json`** describing every entry's bounding box and the text/value to place there, tagged with which coordinate system it uses (PDF points vs. image pixels).
4. **Validate the bounding boxes programmatically** before ever writing to the PDF (catch overlaps and boxes too small for the font).
5. **Overlay the text** using `reportlab` (draw text on a transparent canvas) merged onto the original page with `pypdf`.
6. **Re-render the filled PDF to images and visually verify** placement — this step is not optional.

### Step 1: Structure extraction

```python
#!/usr/bin/env python3
"""extract_form_structure.py — Pull labels, lines, and checkbox candidates
from a PDF's structure with exact PDF-coordinate positions."""
import json
import sys
import pdfplumber

def extract_structure(pdf_path: str) -> dict:
    structure = {"pages": []}
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            labels = []
            for word in page.extract_words(use_text_flow=False, keep_blank_chars=False):
                labels.append({
                    "text": word["text"],
                    "x0": word["x0"], "x1": word["x1"],
                    "top": word["top"], "bottom": word["bottom"],
                })

            lines = []
            for line in page.lines:
                lines.append({
                    "x0": line["x0"], "x1": line["x1"],
                    "top": line["top"], "bottom": line["bottom"],
                })

            checkboxes = []
            for rect in page.rects:
                w = rect["x1"] - rect["x0"]
                h = rect["bottom"] - rect["top"]
                # Small near-square rectangles are typically checkboxes.
                if 6 <= w <= 16 and 6 <= h <= 16 and abs(w - h) <= 3:
                    checkboxes.append({
                        "x0": rect["x0"], "x1": rect["x1"],
                        "top": rect["top"], "bottom": rect["bottom"],
                        "center_x": (rect["x0"] + rect["x1"]) / 2,
                        "center_y": (rect["top"] + rect["bottom"]) / 2,
                    })

            structure["pages"].append({
                "page_number": i,
                "pdf_width": page.width,
                "pdf_height": page.height,
                "labels": labels,
                "lines": lines,
                "checkboxes": checkboxes,
            })
    return structure

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(dst, "w") as f:
        json.dump(extract_structure(src), f, indent=2)
    print(f"Wrote structure to {dst}")
```

```bash
python extract_form_structure.py application.pdf form_structure.json
```

**Decision point:** open `form_structure.json`.
- If `labels` contains real, readable text (e.g., `"Last"`, `"Name"`, `"Date of Birth"`) → the PDF has a live text layer → use **Approach A (structure-based)** below.
- If words show up as garbage/`(cid:X)` glyphs, or the `labels` list is empty (i.e. it's an image with no embedded text) → use **Approach B (visual estimation)**.

Government forms distributed as "flat scans" often still have selectable text from the original authoring tool (only the *form fields* were flattened, not the whole page rasterized) — so try Approach A first even on a "scanned-style" form; only drop to Approach B if that fails.

### Approach A: Structure-based coordinates (preferred)

For each answer in `data.json`, find its label in `form_structure.json`, and derive the entry box:

```python
#!/usr/bin/env python3
"""build_fields_structure.py — Turn label positions + data.json into fields.json,
using PDF coordinates (y=0 at TOP of page in pdfplumber's convention)."""
import json
import sys

GAP_AFTER_LABEL = 5      # points between end of label and start of entry
DEFAULT_ROW_HEIGHT = 16  # points, fallback if no row boundary line is found
FONT_SIZE = 10

def find_label(labels, text_fragment):
    """Find a label word (or adjacent group of words) matching text_fragment."""
    matches = [w for w in labels if text_fragment.lower() in w["text"].lower()]
    if not matches:
        raise ValueError(f"Label '{text_fragment}' not found in structure")
    return matches[0]

def nearest_row_boundary_below(lines, label_bottom, page_height):
    candidates = [ln["top"] for ln in lines if ln["top"] > label_bottom]
    return min(candidates) if candidates else label_bottom + DEFAULT_ROW_HEIGHT

def build_fields(structure, data, mapping):
    """
    mapping: list of dicts, each:
      {"label": "<text to locate on the page>", "page": 1,
       "data_key": "<key in data.json>", "kind": "text"|"checkbox",
       "checked_if": <value that means 'checked', for checkboxes>}
    """
    out = {"pages": [], "form_fields": []}
    for page_struct in structure["pages"]:
        out["pages"].append({
            "page_number": page_struct["page_number"],
            "pdf_width": page_struct["pdf_width"],
            "pdf_height": page_struct["pdf_height"],
        })

    for m in mapping:
        page_struct = next(p for p in structure["pages"] if p["page_number"] == m["page"])
        label = find_label(page_struct["labels"], m["label"])
        value = data.get(m["data_key"])
        if value is None:
            continue  # skip fields the applicant left blank

        if m["kind"] == "text":
            entry_x0 = label["x1"] + GAP_AFTER_LABEL
            row_bottom = nearest_row_boundary_below(
                page_struct["lines"], label["bottom"], page_struct["pdf_height"]
            )
            entry_bbox = [entry_x0, label["top"], entry_x0 + 220, row_bottom]
            out["form_fields"].append({
                "page_number": m["page"],
                "description": m["label"],
                "field_label": m["label"],
                "label_bounding_box": [label["x0"], label["top"], label["x1"], label["bottom"]],
                "entry_bounding_box": entry_bbox,
                "entry_text": {"text": str(value), "font_size": FONT_SIZE},
            })
        elif m["kind"] == "checkbox":
            checked = (value == m.get("checked_if", True))
            if not checked:
                continue
            # Match the nearest checkbox rect to the label's vertical position.
            cb = min(
                page_struct["checkboxes"],
                key=lambda c: abs(c["center_y"] - (label["top"] + label["bottom"]) / 2),
            )
            out["form_fields"].append({
                "page_number": m["page"],
                "description": f"{m['label']} checkbox",
                "field_label": m["label"],
                "label_bounding_box": [label["x0"], label["top"], label["x1"], label["bottom"]],
                "entry_bounding_box": [cb["x0"], cb["top"], cb["x1"], cb["bottom"]],
                "entry_text": {"text": "X"},
            })
    return out

if __name__ == "__main__":
    structure = json.load(open(sys.argv[1]))   # form_structure.json
    data = json.load(open(sys.argv[2]))         # data.json
    mapping_file = sys.argv[3]                  # mapping.json (you define this per form)
    mapping = json.load(open(mapping_file))
    fields = build_fields(structure, data, mapping)
    with open(sys.argv[4], "w") as f:
        json.dump(fields, f, indent=2)
    print(f"Wrote {len(fields['form_fields'])} fields to {sys.argv[4]}")
```

The `mapping.json` is the one artifact that requires a human (or an LLM reading the rendered page images) to decide "which label in the PDF corresponds to which key in `data.json`" — e.g.:

```json
[
  {"label": "Last Name", "page": 1, "data_key": "last_name", "kind": "text"},
  {"label": "First Name", "page": 1, "data_key": "first_name", "kind": "text"},
  {"label": "Date of Birth", "page": 1, "data_key": "dob", "kind": "text"},
  {"label": "US Citizen", "page": 1, "data_key": "is_us_citizen", "kind": "checkbox", "checked_if": true}
]
```

Build this by rendering the PDF to images (Step below) and reading it alongside `data.json`'s keys — this is inherently a semantic-matching step, not something to automate blindly.

### Approach B: Visual estimation (fallback, only if Approach A fails)

```python
#!/usr/bin/env python3
"""convert_pdf_to_images.py — Render each page to a high-DPI PNG for visual inspection."""
import sys
import os
import pypdfium2 as pdfium

def convert(pdf_path: str, out_dir: str, dpi: int = 200):
    os.makedirs(out_dir, exist_ok=True)
    pdf = pdfium.PdfDocument(pdf_path)
    scale = dpi / 72
    paths = []
    for i, page in enumerate(pdf, start=1):
        bitmap = page.render(scale=scale)
        pil_image = bitmap.to_pil()
        out_path = os.path.join(out_dir, f"page_{i}.png")
        pil_image.save(out_path)
        paths.append(out_path)
    return paths

if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2])
    print(f"Rendered pages into {sys.argv[2]}")
```

```bash
python convert_pdf_to_images.py application.pdf images/
```

Then, for each field:

1. Look at `images/page_1.png` and note a **rough** pixel bounding box around the entry area.
2. **Zoom-refine** with a tight crop so you can read exact pixel edges (critical for accuracy — never trust the first rough guess):

```bash
magick images/page_1.png -crop 300x80+50+120 +repage crops/last_name_field.png
```

3. Read the crop, find the precise edges of the entry area within it, and convert back to full-image coordinates:

```
full_x = crop_x + crop_offset_x
full_y = crop_y + crop_offset_y
```

4. Record `image_width`/`image_height` (from the PNG you rendered) and the refined pixel boxes into `fields.json`, e.g.:

```json
{
  "pages": [{"page_number": 1, "image_width": 1700, "image_height": 2200}],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [120, 175, 242, 198],
      "entry_bounding_box": [255, 175, 720, 218],
      "entry_text": {"text": "Simpson", "font_size": 10}
    }
  ]
}
```

If some fields are found via structure extraction and others require visual estimation (a common "hybrid" case — e.g. circular checkboxes that don't look like rectangles), convert the image-pixel boxes to PDF points before merging into one `fields.json`:

```
pdf_x = image_x * (pdf_width / image_width)
pdf_y = image_y * (pdf_height / image_height)
```

Always end up with **one coordinate system** (PDF points, y=0 at top, matching pdfplumber's convention) in the final `fields.json`.

### Step 2: Validate bounding boxes before filling

```python
#!/usr/bin/env python3
"""check_bounding_boxes.py — Sanity-check fields.json before writing to the PDF."""
import json
import sys

def boxes_intersect(a, b):
    ax0, atop, ax1, abottom = a
    bx0, btop, bx1, bbottom = b
    return not (ax1 <= bx0 or bx1 <= ax0 or abottom <= btop or bbottom <= atop)

def estimate_min_height_for_font(font_size: float) -> float:
    return font_size * 1.2  # rough single-line height allowance

def validate(fields_doc: dict) -> list:
    errors = []
    entries = fields_doc["form_fields"]
    for i, f in enumerate(entries):
        box = f["entry_bounding_box"]
        x0, top, x1, bottom = box
        if x1 <= x0 or bottom <= top:
            errors.append(f"Field '{f['field_label']}': degenerate box {box}")
        font_size = f.get("entry_text", {}).get("font_size", 10)
        min_h = estimate_min_height_for_font(font_size)
        if (bottom - top) < min_h:
            errors.append(
                f"Field '{f['field_label']}': entry box height "
                f"{bottom - top:.1f} too small for font size {font_size} "
                f"(needs >= {min_h:.1f})"
            )
        for j, other in enumerate(entries):
            if i >= j or other["page_number"] != f["page_number"]:
                continue
            if boxes_intersect(box, other["entry_bounding_box"]):
                errors.append(
                    f"Fields '{f['field_label']}' and '{other['field_label']}' "
                    f"have intersecting bounding boxes"
                )
    return errors

if __name__ == "__main__":
    fields_doc = json.load(open(sys.argv[1]))
    errors = validate(fields_doc)
    if errors:
        print(f"Found {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("All bounding boxes look valid.")
```

```bash
python check_bounding_boxes.py fields.json
```

Fix any reported overlap or "too small for font" issues in `fields.json` before moving on — do not proceed to filling until this passes cleanly.

### Step 3: Overlay text and merge onto the original PDF

```python
#!/usr/bin/env python3
"""fill_pdf_form_with_annotations.py — Overlay text/marks onto a flat PDF using
the validated fields.json, auto-detecting PDF-point vs image-pixel coordinates."""
import io
import json
import sys
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter

def to_pdf_coords(entry_bbox, page_info):
    """Return (x0, y0, x1, y1) in PDF coordinates (origin bottom-left)."""
    x0, top, x1, bottom = entry_bbox
    pdf_h = page_info["pdf_height"]

    if "image_width" in page_info:
        # Convert image pixel coords -> PDF points, then flip y-axis.
        scale_x = pdf_h and page_info["pdf_width"] / page_info["image_width"]
        scale_y = page_info["pdf_height"] / page_info["image_height"]
        x0, x1 = x0 * scale_x, x1 * scale_x
        top, bottom = top * scale_y, bottom * scale_y

    # pdfplumber/top-origin -> PDF bottom-origin
    y0 = pdf_h - bottom
    y1 = pdf_h - top
    return x0, y0, x1, y1

def build_overlay(fields_doc, page_number, page_width, page_height):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_width, page_height))
    page_info = next(p for p in fields_doc["pages"] if p["page_number"] == page_number)

    for field in fields_doc["form_fields"]:
        if field["page_number"] != page_number:
            continue
        x0, y0, x1, y1 = to_pdf_coords(field["entry_bounding_box"], page_info)
        text_info = field["entry_text"]
        font_size = text_info.get("font_size", 10)
        c.setFont("Helvetica", font_size)
        # Vertically center the baseline in the box, small left padding.
        baseline_y = y0 + (y1 - y0 - font_size) / 2 + font_size * 0.2
        c.drawString(x0 + 2, baseline_y, text_info["text"])
    c.save()
    buf.seek(0)
    return buf

def fill_form(input_pdf: str, fields_json: str, output_pdf: str):
    fields_doc = json.load(open(fields_json))
    reader = PdfReader(input_pdf)
    writer = PdfWriter()

    for i, page in enumerate(reader.pages, start=1):
        page_info = next((p for p in fields_doc["pages"] if p["page_number"] == i), None)
        has_fields = any(f["page_number"] == i for f in fields_doc["form_fields"])
        if has_fields and page_info:
            overlay_buf = build_overlay(
                fields_doc, i, float(page.mediabox.width), float(page.mediabox.height)
            )
            overlay_reader = PdfReader(overlay_buf)
            page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    with open(output_pdf, "wb") as f:
        writer.write(f)

if __name__ == "__main__":
    input_pdf, fields_json, output_pdf = sys.argv[1], sys.argv[2], sys.argv[3]
    fill_form(input_pdf, fields_json, output_pdf)
    print(f"Wrote filled form to {output_pdf}")
```

```bash
python fill_pdf_form_with_annotations.py application.pdf fields.json application_filled.pdf
```

### Step 4: End-to-end driver script

```python
#!/usr/bin/env python3
"""fill_application.py — Orchestrates the whole non-fillable-form workflow."""
import json
import subprocess
import sys

def main():
    input_pdf = "application.pdf"
    data = json.load(open("data.json"))

    # 1. Confirm non-fillable.
    result = subprocess.run(["python", "check_fillable_fields.py", input_pdf])
    if result.returncode == 0:
        print("This PDF has fillable fields — use the AcroForm workflow instead (see below).")
        sys.exit(1)

    # 2. Try structure extraction.
    subprocess.run(
        ["python", "extract_form_structure.py", input_pdf, "form_structure.json"],
        check=True,
    )

    # 3. Build fields.json from structure + data.json + a hand-authored mapping.json
    #    (mapping.json must be created/reviewed by inspecting the rendered page images
    #    and matching each label to the right data.json key).
    subprocess.run(
        ["python", "build_fields_structure.py",
         "form_structure.json", "data.json", "mapping.json", "fields.json"],
        check=True,
    )

    # 4. Validate.
    result = subprocess.run(["python", "check_bounding_boxes.py", "fields.json"])
    if result.returncode != 0:
        print("Fix fields.json errors above before continuing.")
        sys.exit(1)

    # 5. Fill.
    subprocess.run(
        ["python", "fill_pdf_form_with_annotations.py",
         input_pdf, "fields.json", "application_filled.pdf"],
        check=True,
    )

    # 6. Render filled PDF to images for visual verification.
    subprocess.run(
        ["python", "convert_pdf_to_images.py", "application_filled.pdf", "verify_images/"],
        check=True,
    )
    print("Done. Inspect verify_images/*.png before submitting.")

if __name__ == "__main__":
    main()
```

Required packages: `pip install pypdf pdfplumber reportlab pypdfium2 Pillow`. (ImageMagick's `magick`/`convert` CLI is only needed if you go down the Approach B zoom-crop path.)

---

## 2. Pre-submission verification checklist

Before the filled PDF is submitted, walk through all of these:

- [ ] **Confirm the form type was correctly identified.** `check_fillable_fields.py` reported no AcroForm fields (so the overlay approach was the right one, not a misdiagnosis).
- [ ] **Every required field from `data.json` is represented in `fields.json`.** Cross-check field counts; nothing was silently dropped due to a missing label match.
- [ ] **`check_bounding_boxes.py` passed with zero errors** — no intersecting boxes, no boxes too small for their font size.
- [ ] **Re-rendered images (`verify_images/*.png`) were visually inspected, page by page**, not just assumed correct from coordinates alone.
- [ ] **Text sits on/within the correct line or box**, not overlapping a label, a form border, or an adjacent field's text.
- [ ] **Text is not clipped or overflowing** its entry box (long values like full addresses or long names fit or wrap sensibly).
- [ ] **Font size is legible and consistent with the form's printed text** (not comically large/small relative to the surrounding form).
- [ ] **Checkboxes/marks are centered inside the correct box**, and only the boxes that should be checked are marked (no stray marks on unchecked boxes).
- [ ] **Dates, numbers, and formatted fields (SSNs, phone numbers, currency) match the form's expected format** (e.g., segmented boxes vs. a single line).
- [ ] **Every page of a multi-page form was checked**, not just page 1 — verify per-page coordinate/page_number bookkeeping didn't get mixed up.
- [ ] **No original form content was altered or obscured** — the overlay should only add ink, never cover printed instructions or existing lines.
- [ ] **The output PDF opens correctly in a standard viewer** (Preview/Adobe Reader/Chrome), not just in the script's own renderer — some overlay bugs only show up in real viewers.
- [ ] **A final side-by-side comparison** between `data.json` values and what's visible on the rendered filled pages, field by field, to catch mapping mistakes (right value in the wrong field, or vice versa).
- [ ] **If any field required visual estimation (Approach B),** double check its precision with the zoom-crop technique rather than trusting a first-pass rough guess.

---

## 3. If `application.pdf` instead had fillable AcroForm fields

If the check in Step 0 had returned "HAS fillable fields," the entire workflow above would be replaced by a much simpler, more robust one, because the PDF already carries structured field metadata (name, type, and position) that a library can query and set directly — no coordinate guessing needed at all.

**Library choice:** `pypdf` (pure Python, no external binary dependencies) is sufficient for simple text/checkbox/radio fields; `pdf-lib` (JS/TS) is the equivalent option in Node environments. Both read the AcroForm dictionary and let you set field values by name.

**Workflow (conceptually):**

1. Enumerate fields: `reader.get_fields()` — this returns field name, type (text/checkbox/radio/choice), and current value/options directly, no image analysis required.
2. Map each field name to the right `data.json` key (still a semantic-matching step, but no coordinates involved).
3. Set values and let the library regenerate field appearances.

**Code sketch:**

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("application.pdf")
writer = PdfWriter()
writer.append(reader)

fields = reader.get_fields()
print({name: f.field_type for name, f in fields.items()})
# e.g. {'last_name': '/Tx', 'is_us_citizen': '/Btn', ...}

data = {
    "last_name": "Simpson",
    "first_name": "Homer",
    "dob": "1956-05-12",
    "is_us_citizen": "/Yes",   # checkbox/radio "on" state must match the field's export value
}

for page in writer.pages:
    writer.update_page_form_field_values(page, data)

# Ensure viewers regenerate visual appearances for the new values.
writer.set_need_appearances_writer(True)

with open("application_filled.pdf", "wb") as f:
    writer.write(f)
```

Key differences from the non-fillable path:

- **No coordinate extraction, no image rendering, no bounding-box math** — the field's on-page position is irrelevant to filling it; the PDF viewer places the value inside the field's existing appearance/rectangle automatically.
- **No `check_bounding_boxes.py`-style validation is needed** — there's nothing to overlap since you're not drawing new content, only setting values in existing widgets.
- **Checkbox/radio "on" values are field-defined strings** (e.g. `/Yes`, `/On`) that must be read from the field's export-value metadata (via `get_fields()`) rather than assumed — this is the one place a mistake commonly happens (writing `"true"` instead of the field's actual on-value).
- **Verification is lighter but not eliminated:** still worth rendering the result to an image (or opening in a viewer) to confirm appearances regenerated correctly, since some viewers ignore `NeedAppearances` and show blank-looking fields until the user clicks into them — but there is no need to check positional/placement accuracy since that was never in question.

---
