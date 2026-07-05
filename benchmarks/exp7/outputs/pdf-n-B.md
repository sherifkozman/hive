# Filling `application.pdf` (non-fillable government form) from `data.json`

## 0. Diagnose the form first — never assume

Before writing any overlay code, confirm whether the PDF actually has AcroForm
fields. This determines the entire strategy (overlay annotations vs. programmatic
field values), so it must be step one, not an afterthought.

```python
# step0_check_fillable.py
import sys
from pypdf import PdfReader

def has_fillable_fields(pdf_path: str) -> bool:
    reader = PdfReader(pdf_path)
    return bool(reader.get_fields())

if __name__ == "__main__":
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "application.pdf"
    if has_fillable_fields(pdf_path):
        print("This PDF HAS fillable form fields -> use the AcroForm path (see Section 4).")
    else:
        print("This PDF has NO fillable form fields -> use the overlay/annotation path below.")
```

For this task the PDF is stated to be a flat, scanned-style form with no
AcroForm fields, so `reader.get_fields()` returns `None`/empty and we proceed
with the **overlay** workflow.

---

## 1. Recommended workflow for non-fillable forms

The correct approach is **not** "eyeball the PDF and guess pixel coordinates."
It's a structured pipeline that prefers extracting real coordinates from the
PDF's text/vector layer, only falls back to visual pixel estimation when that
layer doesn't exist (e.g. the PDF is a scanned image), and always ends with a
rendered-image verification pass before the file is considered done:

1. **Confirm non-fillable** (Section 0).
2. **Try structure extraction** — pull exact text-label and line/checkbox
   coordinates straight out of the PDF's content stream with `pdfplumber`
   (Approach A: "Structure-Based Coordinates"). This is preferred because the
   coordinates are exact, not estimated.
3. **Fall back to visual estimation** only if structure extraction returns
   little/no usable text (i.e. the page is a raster scan and words look like
   `(cid:x)` garbage or there's simply nothing there) — render the page to a
   PNG, locate fields visually, then **zoom-crop** each field region to refine
   pixel coordinates before trusting them (Approach B).
4. A **hybrid** of the two is normal: use structure coordinates for whatever
   was detected, and visual zoom-refinement only for the handful of fields
   (e.g. circular checkboxes) structure extraction misses. All coordinates
   are then normalized into a single coordinate system (PDF points).
5. **Validate the bounding boxes programmatically** — check for overlaps
   between label/entry boxes and check that entry-box height is not smaller
   than the requested font size — *before* touching the real PDF.
6. **Fill by adding text annotations** (not by trying to reproduce the
   government form as a new page) — this preserves 100% of the original form
   artwork/legal text and only adds the applicant's answers on top.
7. **Render the filled PDF back to images and visually verify** every field
   before calling it done. This step is mandatory, not optional — coordinate
   math can be subtly wrong in ways that are only obvious visually (off by a
   few points, wrong page, baseline vs. top-of-box, etc).

---

## 2. Coordinate systems — the one thing that silently breaks this task

Two different coordinate systems are in play and mixing them up is the most
common failure mode:

- **PDF coordinates**: origin `(0,0)` at the **bottom-left** of the page,
  y increases **upward**. This is what `page.mediabox` and PDF annotation
  `Rect` entries use.
- **pdfplumber "top" coordinates**: origin at the **top-left**, y increases
  **downward** (`top`/`bottom` keys from `extract_words()`), and this is also
  how `image_x/image_y` pixel coordinates work when working from a rendered
  PNG.

The fields JSON format below carries an explicit signal for which system a
page's numbers are in: `pdf_width`/`pdf_height` (top-down PDF-point convention
matching pdfplumber's `top`) vs. `image_width`/`image_height` (pixel space
from a rendered PNG). The fill step converts everything to true bottom-up PDF
points before writing annotations. Get this wrong and every field lands in
the mirror-image vertical position.

---

## 3. Complete runnable pipeline

Dependencies: `pip install pypdf pdfplumber pdf2image pillow` (plus the
`poppler` binaries that `pdf2image` shells out to, e.g. `apt install
poppler-utils` / `brew install poppler`).

Save this as `fill_form_pipeline.py`. It is one file, but it's built as a set
of discrete, resumable stages — exactly because this workflow inherently
requires a human (or an agent) to look at intermediate output (the structure
JSON, the rendered images) before proceeding to the next stage. A "fully
automatic, no-look" version of this script would be the wrong methodology
for this task: coordinate placement on an arbitrary scanned government form
cannot be verified without looking at it.

```python
#!/usr/bin/env python3
"""
Overlay-fill a non-fillable (no-AcroForm) PDF form using applicant data.

Usage:
    python fill_form_pipeline.py check       application.pdf
    python fill_form_pipeline.py structure   application.pdf form_structure.json
    python fill_form_pipeline.py images      application.pdf images/
    python fill_form_pipeline.py validate    fields.json
    python fill_form_pipeline.py fill        application.pdf fields.json filled.pdf
    python fill_form_pipeline.py verify      filled.pdf verify_images/

`fields.json` (the file YOU build, by hand or with the help of
build_fields_from_structure() below, after inspecting form_structure.json
and/or the rendered images) has this shape:

{
  "pages": [{"page_number": 1, "pdf_width": 612, "pdf_height": 792}],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Applicant last name",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Simpson", "font_size": 10}
    }
  ]
}

Coordinates for a page are either:
  - pdf_width/pdf_height  + top-down PDF-point coordinates (from Approach A /
    extract_structure, i.e. straight out of form_structure.json), or
  - image_width/image_height + pixel coordinates (from Approach B / visual
    zoom-refinement on a rendered PNG).
Never mix both conventions for the same page.
"""

import json
import sys
import difflib
from dataclasses import dataclass


# --------------------------------------------------------------------------
# Stage 0 — confirm this PDF is NOT fillable (see also step0_check_fillable.py)
# --------------------------------------------------------------------------

def check_fillable(pdf_path: str) -> None:
    from pypdf import PdfReader
    reader = PdfReader(pdf_path)
    if reader.get_fields():
        print("This PDF HAS fillable form fields; use the AcroForm workflow instead (Section 4).")
    else:
        print("This PDF does not have fillable form fields; use the overlay workflow below.")


# --------------------------------------------------------------------------
# Stage 1 — structure extraction (Approach A: preferred, exact coordinates)
# --------------------------------------------------------------------------

def extract_form_structure(pdf_path: str) -> dict:
    """Pull text labels, horizontal lines (row boundaries), and small square
    rects (checkboxes) straight out of the PDF's own content stream, with
    exact PDF-point coordinates. If this comes back with real words (not
    `(cid:12)`-style garbage), prefer these coordinates over any visual
    estimate -- they are exact, not eyeballed."""
    import pdfplumber

    structure = {"pages": [], "labels": [], "lines": [], "checkboxes": [], "row_boundaries": []}

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            structure["pages"].append({
                "page_number": page_num,
                "width": float(page.width),
                "height": float(page.height),
            })

            for word in page.extract_words():
                structure["labels"].append({
                    "page": page_num,
                    "text": word["text"],
                    "x0": round(float(word["x0"]), 1),
                    "top": round(float(word["top"]), 1),
                    "x1": round(float(word["x1"]), 1),
                    "bottom": round(float(word["bottom"]), 1),
                })

            for line in page.lines:
                if abs(float(line["x1"]) - float(line["x0"])) > page.width * 0.5:
                    structure["lines"].append({
                        "page": page_num,
                        "y": round(float(line["top"]), 1),
                        "x0": round(float(line["x0"]), 1),
                        "x1": round(float(line["x1"]), 1),
                    })

            for rect in page.rects:
                width = float(rect["x1"]) - float(rect["x0"])
                height = float(rect["bottom"]) - float(rect["top"])
                if 5 <= width <= 15 and 5 <= height <= 15 and abs(width - height) < 2:
                    structure["checkboxes"].append({
                        "page": page_num,
                        "x0": round(float(rect["x0"]), 1),
                        "top": round(float(rect["top"]), 1),
                        "x1": round(float(rect["x1"]), 1),
                        "bottom": round(float(rect["bottom"]), 1),
                        "center_x": round((float(rect["x0"]) + float(rect["x1"])) / 2, 1),
                        "center_y": round((float(rect["top"]) + float(rect["bottom"])) / 2, 1),
                    })

    # row boundaries from horizontal lines, useful for bounding entry-box height
    lines_by_page = {}
    for line in structure["lines"]:
        lines_by_page.setdefault(line["page"], []).append(line["y"])
    for page, ys in lines_by_page.items():
        ys = sorted(set(ys))
        for i in range(len(ys) - 1):
            structure["row_boundaries"].append({
                "page": page, "row_top": ys[i], "row_bottom": ys[i + 1],
                "row_height": round(ys[i + 1] - ys[i], 1),
            })

    return structure


def structure_has_usable_labels(structure: dict) -> bool:
    """Heuristic gate: if pdfplumber found no real words (a raster scan often
    yields either zero labels, or labels that are all `(cid:` garbage from a
    broken embedded font), Approach A cannot be used -- fall back to Approach B."""
    real_words = [
        l for l in structure["labels"]
        if l["text"].strip() and not l["text"].startswith("(cid:")
    ]
    return len(real_words) >= 5   # arbitrary but reasonable "found real text" threshold


# --------------------------------------------------------------------------
# Stage 1b — visual estimation fallback (Approach B) + hybrid
# --------------------------------------------------------------------------

def render_pages_to_images(pdf_path: str, out_dir: str, dpi: int = 200) -> list:
    """Render each page to a PNG for visual inspection / zoom-crop refinement.
    Use the SAME dpi consistently for both the estimation pass and the final
    verification pass so pixel math is comparable."""
    import os
    from pdf2image import convert_from_path

    os.makedirs(out_dir, exist_ok=True)
    images = convert_from_path(pdf_path, dpi=dpi)
    paths = []
    for i, image in enumerate(images, 1):
        path = os.path.join(out_dir, f"page_{i}.png")
        image.save(path)
        paths.append(path)
        print(f"Saved {path} ({image.size[0]}x{image.size[1]} px @ {dpi} dpi)")
    return paths


def zoom_crop(image_path: str, x: int, y: int, width: int, height: int, out_path: str) -> None:
    """Crop a region around a rough field estimate so exact pixel edges of the
    entry box can be read off reliably. Rough-estimate first, then always
    zoom-crop before trusting a coordinate -- do not fill in coordinates read
    directly off a full-page thumbnail."""
    from PIL import Image
    img = Image.open(image_path)
    img.crop((x, y, x + width, y + height)).save(out_path)
    print(f"Wrote crop {out_path}; remember crop origin was ({x},{y}) "
          f"when converting crop-local coordinates back to full-image coordinates.")


def image_bbox_to_pdf_bbox(bbox, image_width, image_height, pdf_width, pdf_height):
    """Convert a top-down [x0, top, x1, bottom] pixel bbox from a rendered PNG
    into a top-down [x0, top, x1, bottom] PDF-point bbox (same orientation as
    what extract_form_structure() produces, i.e. still needs the bottom-up
    flip done in write_annotations() below before it becomes a real PDF Rect)."""
    x_scale = pdf_width / image_width
    y_scale = pdf_height / image_height
    return [
        bbox[0] * x_scale,
        bbox[1] * y_scale,
        bbox[2] * x_scale,
        bbox[3] * y_scale,
    ]


# --------------------------------------------------------------------------
# Stage 2 — build fields.json: map data.json answers onto detected labels
# --------------------------------------------------------------------------

def build_fields_from_structure(structure: dict, data: dict, page_number: int = 1,
                                 gap: float = 5, default_font_size: int = 10) -> dict:
    """Best-effort automatic matcher: for each key in data.json, find the
    structure label whose text is the closest fuzzy match, and place the
    entry box immediately to the right of that label (extending to either
    the next label on the same row or a fixed default width), with the same
    vertical span as the label.

    IMPORTANT: this is a *starting point*, not a substitute for the required
    human/visual review step. Government forms routinely have labels that
    don't literally match the applicant's data-field names ("Given Name" vs.
    "first_name"), multi-word labels split into separate word tokens by
    pdfplumber, and entry areas that are lines/boxes below the label rather
    than beside it. Always cross-check the produced fields.json against the
    rendered page image (Section 1, stage 1b) before filling, and hand-adjust
    any mismatches.
    """
    page_labels = [l for l in structure["labels"] if l["page"] == page_number]
    page_info = next(p for p in structure["pages"] if p["page_number"] == page_number)

    form_fields = []
    used_label_indices = set()

    for key, value in data.items():
        if value in (None, ""):
            continue  # don't stamp blank optional answers onto the form

        # naive label-text candidates: single words and adjacent-word pairs
        candidates = []
        for i, label in enumerate(page_labels):
            candidates.append((i, label["text"]))
        best = difflib.get_close_matches(
            key.replace("_", " "), [c[1] for c in candidates], n=1, cutoff=0.3
        )
        if not best:
            print(f"WARNING: no label match found for data field '{key}'; "
                  f"add its entry manually after visual inspection.")
            continue

        idx = next(i for i, text in candidates if text == best[0])
        if idx in used_label_indices:
            continue
        used_label_indices.add(idx)
        label = page_labels[idx]

        same_row = sorted(
            [l for l in page_labels if abs(l["top"] - label["top"]) < 2 and l["x0"] > label["x1"]],
            key=lambda l: l["x0"],
        )
        entry_x1 = same_row[0]["x0"] - gap if same_row else label["x1"] + 220

        entry_box = [label["x1"] + gap, label["top"], entry_x1, label["bottom"] + 6]

        form_fields.append({
            "page_number": page_number,
            "description": f"{key} entry (matched label: '{label['text']}')",
            "field_label": label["text"],
            "label_bounding_box": [label["x0"], label["top"], label["x1"], label["bottom"]],
            "entry_bounding_box": entry_box,
            "entry_text": {"text": str(value), "font_size": default_font_size},
        })

    return {
        "pages": [{"page_number": page_number,
                   "pdf_width": page_info["width"], "pdf_height": page_info["height"]}],
        "form_fields": form_fields,
    }


# --------------------------------------------------------------------------
# Stage 3 — validate bounding boxes BEFORE touching the real PDF
# --------------------------------------------------------------------------

@dataclass
class RectAndField:
    rect: list
    rect_type: str
    field: dict


def validate_fields(fields: dict) -> list:
    """Two checks that catch the large majority of placement bugs cheaply,
    before ever rendering a PDF: (1) do any label/entry boxes on the same
    page overlap (would cause overlapping/garbled text), and (2) is any entry
    box shorter than its requested font size (text would be clipped)."""
    messages = [f"Read {len(fields['form_fields'])} fields"]

    def intersects(r1, r2):
        disjoint_h = r1[0] >= r2[2] or r1[2] <= r2[0]
        disjoint_v = r1[1] >= r2[3] or r1[3] <= r2[1]
        return not (disjoint_h or disjoint_v)

    rects = []
    for f in fields["form_fields"]:
        rects.append(RectAndField(f["label_bounding_box"], "label", f))
        rects.append(RectAndField(f["entry_bounding_box"], "entry", f))

    has_error = False
    for i, ri in enumerate(rects):
        for j in range(i + 1, len(rects)):
            rj = rects[j]
            if ri.field["page_number"] == rj.field["page_number"] and intersects(ri.rect, rj.rect):
                has_error = True
                if ri.field is rj.field:
                    messages.append(f"FAILURE: label/entry overlap within '{ri.field['description']}'")
                else:
                    messages.append(
                        f"FAILURE: {ri.rect_type} box for '{ri.field['description']}' "
                        f"overlaps {rj.rect_type} box for '{rj.field['description']}'"
                    )
        if ri.rect_type == "entry" and "entry_text" in ri.field:
            font_size = ri.field["entry_text"].get("font_size", 14)
            height = ri.rect[3] - ri.rect[1]
            if height < font_size:
                has_error = True
                messages.append(
                    f"FAILURE: entry box for '{ri.field['description']}' is only "
                    f"{height}pt tall but font size is {font_size}pt"
                )

    if not has_error:
        messages.append("SUCCESS: all bounding boxes are valid")
    return messages


# --------------------------------------------------------------------------
# Stage 4 — fill by adding FreeText annotations (preserves original artwork)
# --------------------------------------------------------------------------

def transform_from_pdf_coords(bbox, pdf_height):
    """Structure-extracted coordinates are top-down (top/bottom, matching
    pdfplumber). PDF annotation Rects are bottom-up. Flip here, once,
    centrally -- this is the single most error-prone conversion in the
    whole pipeline."""
    left, right = bbox[0], bbox[2]
    top = pdf_height - bbox[1]
    bottom = pdf_height - bbox[3]
    return left, bottom, right, top


def transform_from_image_coords(bbox, image_width, image_height, pdf_width, pdf_height):
    x_scale = pdf_width / image_width
    y_scale = pdf_height / image_height
    left = bbox[0] * x_scale
    right = bbox[2] * x_scale
    top = pdf_height - (bbox[1] * y_scale)
    bottom = pdf_height - (bbox[3] * y_scale)
    return left, bottom, right, top


def fill_pdf_form(input_pdf_path: str, fields: dict, output_pdf_path: str) -> None:
    from pypdf import PdfReader, PdfWriter
    from pypdf.annotations import FreeText

    reader = PdfReader(input_pdf_path)
    writer = PdfWriter()
    writer.append(reader)

    pdf_dims = {i + 1: [float(p.mediabox.width), float(p.mediabox.height)]
                for i, p in enumerate(reader.pages)}

    added = 0
    for field in fields["form_fields"]:
        page_num = field["page_number"]
        page_info = next(p for p in fields["pages"] if p["page_number"] == page_num)
        pdf_width, pdf_height = pdf_dims[page_num]

        if "pdf_width" in page_info:
            rect = transform_from_pdf_coords(field["entry_bounding_box"], pdf_height)
        else:
            rect = transform_from_image_coords(
                field["entry_bounding_box"],
                page_info["image_width"], page_info["image_height"],
                pdf_width, pdf_height,
            )

        entry_text = field.get("entry_text")
        if not entry_text or not entry_text.get("text"):
            continue

        annotation = FreeText(
            text=entry_text["text"],
            rect=rect,
            font=entry_text.get("font", "Arial"),
            font_size=f"{entry_text.get('font_size', 10)}pt",
            font_color=entry_text.get("font_color", "000000"),
            border_color=None,
            background_color=None,
        )
        writer.add_annotation(page_number=page_num - 1, annotation=annotation)
        added += 1

    with open(output_pdf_path, "wb") as f:
        writer.write(f)
    print(f"Wrote {output_pdf_path} with {added} text annotations added.")


# --------------------------------------------------------------------------
# Stage 5 — verify: render the filled PDF and LOOK at it
# --------------------------------------------------------------------------

def verify(output_pdf_path: str, out_dir: str, dpi: int = 200) -> list:
    return render_pages_to_images(output_pdf_path, out_dir, dpi=dpi)


# --------------------------------------------------------------------------
# CLI glue
# --------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd == "check":
        check_fillable(args[0])

    elif cmd == "structure":
        structure = extract_form_structure(args[0])
        with open(args[1], "w") as f:
            json.dump(structure, f, indent=2)
        usable = structure_has_usable_labels(structure)
        print(f"Found {len(structure['labels'])} labels, {len(structure['checkboxes'])} checkboxes.")
        print("-> Structure looks usable (Approach A)." if usable else
              "-> Little/no real text found; this looks like a raster scan (Approach B needed).")

    elif cmd == "images":
        render_pages_to_images(args[0], args[1])

    elif cmd == "auto-build-fields":
        # helper, not a replacement for visual review -- see build_fields_from_structure() docstring
        with open(args[0]) as f:
            structure = json.load(f)
        with open(args[1]) as f:
            data = json.load(f)
        fields = build_fields_from_structure(structure, data, page_number=int(args[3]) if len(args) > 3 else 1)
        with open(args[2], "w") as f:
            json.dump(fields, f, indent=2)
        print(f"Draft fields.json written to {args[2]} -- REVIEW AGAINST THE RENDERED PAGE IMAGE before filling.")

    elif cmd == "validate":
        with open(args[0]) as f:
            fields = json.load(f)
        for msg in validate_fields(fields):
            print(msg)

    elif cmd == "fill":
        with open(args[1]) as f:
            fields = json.load(f)
        fill_pdf_form(args[0], fields, args[2])

    elif cmd == "verify":
        verify(args[0], args[1])

    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
```

### How the stages chain together for `application.pdf` + `data.json`

```bash
# 1. Confirm it's non-fillable (per the task, it is)
python fill_form_pipeline.py check application.pdf

# 2. Try structure extraction first
python fill_form_pipeline.py structure application.pdf form_structure.json
#    -> inspect form_structure.json. If it has real labels, continue with
#       Approach A below. If it's empty / all "(cid:...)" garbage, render
#       images instead and use Approach B (zoom_crop() on each field, by hand
#       or interactively) to build entry_bounding_box values in pixel space,
#       then convert with image_bbox_to_pdf_bbox()/transform_from_image_coords().

# 2b. (only if structure extraction was unusable) render pages for visual estimation
python fill_form_pipeline.py images application.pdf images/
#    -> look at images/page_1.png etc., rough-estimate field locations,
#       zoom_crop() each one to refine to exact pixels, note coordinates.

# 3. Build a draft fields.json from data.json + form_structure.json
python fill_form_pipeline.py auto-build-fields form_structure.json data.json fields.json 1
#    -> OPEN fields.json and cross-check every entry against form_structure.json
#       and/or the rendered page image. Fix any field the fuzzy matcher got
#       wrong (wrong label matched, wrong page, entry box drawn over a label
#       or over another field's answer, box too short for the font size).

# 4. Validate bounding boxes before writing anything
python fill_form_pipeline.py validate fields.json
#    -> must print "SUCCESS: all bounding boxes are valid" before proceeding.
#       Fix and re-run if it reports overlaps or too-short boxes.

# 5. Fill
python fill_form_pipeline.py fill application.pdf fields.json filled_application.pdf

# 6. Verify -- render the OUTPUT and actually look at it
python fill_form_pipeline.py verify filled_application.pdf verify_images/
#    -> open verify_images/page_1.png (etc.) and check every field against
#       the checklist in Section 5. If anything is off, adjust fields.json
#       and re-run steps 4-6. Do not consider the task done until this
#       visual pass is clean.
```

Why annotations (FreeText) rather than "flatten and redraw the page with
reportlab": adding annotations preserves 100% of the original scanned/vector
form artwork, instructions, and legal boilerplate untouched, and it's
resilient to small coordinate errors (an annotation is just a positioned text
box, not a from-scratch re-render of the page). It also keeps the change
auditable/removable, since the original page content stream is never
rewritten. If a completely flattened, non-annotation PDF is required by the
receiving agency, print the final annotated PDF to PDF (or run it through
`qpdf`/a "flatten annotations" pass) as a last step after visual verification
passes, not before.

---

## 4. Checklist: verify placement correctness before submitting

Run this after Stage 5, using the images from `verify_images/`, comparing
side-by-side with `data.json` and with the original blank `application.pdf`:

- [ ] **Ran `check_bounding_boxes`/`validate_fields` and it reported
      `SUCCESS`** (no overlapping label/entry boxes, no entry box shorter
      than its font size) — do this *before* trusting the visual pass, not
      instead of it.
- [ ] **Every value in `data.json` appears exactly once** on the rendered
      form — nothing missing, nothing duplicated, nothing silently dropped
      because the fuzzy label-matcher in Stage 2 failed to find a candidate
      (check the script's `WARNING: no label match found` output).
- [ ] **Each answer sits inside its intended entry box/line**, not
      overlapping the printed label text to its left, not overlapping the
      next field's label/box to its right, and not straddling a row divider
      line.
- [ ] **No text is clipped top/bottom or cut off at the right edge** —
      zoom to at least 150–200% on each field in an image viewer/PDF reader,
      not just eyeballing the thumbnail.
- [ ] **Font size is legible and proportioned to the box** (per the skill's
      validation check: entry box height ≥ font size, with a little
      headroom — a font that exactly equals the box height often looks
      cramped).
- [ ] **Checkboxes/Yes-No selections show a mark inside the correct box**,
      not floating beside it or inside the adjacent option's box.
- [ ] **Multi-page forms**: confirm each field landed on the *correct page*
      (`page_number` in `fields.json` matches where the label actually is —
      an easy copy-paste mistake) and that page order in the output PDF is
      unchanged.
- [ ] **Coordinate system sanity check**: if any field's vertical position
      looks mirror-flipped (e.g. an answer for a field near the top of the
      form appears near the bottom), suspect a bottom-up/top-down coordinate
      mixup (Section 2) before assuming the label match was wrong.
- [ ] **Special characters/encoding**: names with accents, ampersands,
      currency symbols, or long numeric IDs render correctly and aren't
      truncated or mojibake'd.
- [ ] **Untouched areas are actually untouched**: compare the filled PDF
      against the original blank form page-by-page to confirm no unrelated
      artwork, lines, or pre-printed text was altered — annotations should be
      strictly additive.
- [ ] **The original form's legal/instructional text is still fully
      legible** — no entry box was drawn on top of instructional text by
      mistake.
- [ ] **Re-render at final/print DPI** (not just the working 200 dpi) if the
      form will be printed, and check placement holds up at that resolution
      too.
- [ ] If the receiving party requires a flat (non-annotation) PDF, confirm
      the flattening step was applied *after* this visual verification passed,
      and re-verify once more post-flattening (flattening can occasionally
      shift how an annotation's text wraps or is rendered).

---

## 5. If the form instead HAD fillable AcroForm fields

If Stage 0's `check_fillable_fields` check had returned true, the entire
overlay/coordinate pipeline above would be unnecessary and, more importantly,
the *wrong* tool: fillable fields should be filled through the PDF's own
AcroForm field values, not by drawing text on top of them.

**Library choice**: `pypdf` (Python) is sufficient and is what the rest of
this toolchain already depends on — no reason to introduce a second library.
For the same task in a Node/JS environment, `pdf-lib` is the equivalent
choice (`form.getTextField(name).setText(value)`,
`form.getCheckBox(name).check()`, etc.) — `pdf-lib` is generally noted as
preserving AcroForm structure a bit better if the JS ecosystem is already in
use, but for a pure-Python project pypdf is the natural pick.

**Workflow differences**:
1. Enumerate the real fields (`reader.get_fields()`), not text positions —
   get each field's `field_id`, page, type (`text`/`checkbox`/`radio_group`/
   `choice`), and for checkboxes/radios/choices, the exact on/off or option
   values the field expects (these are often non-obvious strings like `/On`
   or `/Yes_1`, not literally `"yes"`).
2. Map `data.json` answers onto `field_id`s (still may need to glance at a
   rendered image if field IDs are cryptic, e.g. `Text12` — but there is no
   coordinate math at all).
3. Validate values before writing: checkbox/radio/choice values must be one
   of the field's declared valid values, or the fill will silently produce a
   PDF where the checkbox shows no visible state in some viewers.
4. Set the field values directly and set `NeedAppearances` so viewers
   regenerate the on-screen glyphs from the field value (otherwise some
   viewers show stale/blank appearances despite the value being set
   correctly under the hood).

**Code sketch**:

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("application.pdf")
fields = reader.get_fields()   # dict of field_id -> field info, incl. valid values

# e.g. from data.json + field metadata:
field_values = {
    "last_name": "Simpson",
    "first_name": "Homer",
    "Checkbox_us_citizen": "/Yes",   # must match the field's declared "on" value exactly
}

writer = PdfWriter(clone_from=reader)
for page in writer.pages:
    writer.update_page_form_field_values(page, field_values, auto_regenerate=False)

# Make viewers regenerate field appearances from the values we just set
writer.set_need_appearances_writer(True)

with open("filled_application.pdf", "wb") as f:
    writer.write(f)
```

Validation before filling (worth doing programmatically rather than trusting
the mapping by inspection): for every `field_id` in your value map, confirm
it exists in `reader.get_fields()`, confirm the page matches where you think
that field is, and for checkbox/radio/choice fields confirm the value you're
about to set is literally one of that field's declared valid values — fail
loudly and fix the mapping rather than writing an output PDF with a field
silently left at its default state.

Verification differs too: since the PDF viewer itself renders these fields,
a quick open-and-look in a couple of different PDF viewers (Adobe Reader,
Chrome's built-in viewer, Preview) is usually sufficient — there's no custom
overlay math to double-check, though it's still worth rendering to an image
and confirming checkbox/radio states visually, since `NeedAppearances`
support varies slightly across viewers.

---

LOADED: SKILL.md, forms.md, reference.md, scripts/check_fillable_fields.py, scripts/fill_pdf_form_with_annotations.py, scripts/extract_form_structure.py, scripts/check_bounding_boxes.py, scripts/fill_fillable_fields.py, scripts/extract_form_field_info.py, scripts/convert_pdf_to_images.py, scripts/create_validation_image.py
