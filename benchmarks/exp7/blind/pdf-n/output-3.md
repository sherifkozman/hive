# Filling a Non-Fillable (Flat/Scanned) PDF Form by Text Overlay

## 0. Context and approach

`application.pdf` is a flat government form: it has no AcroForm field
dictionary, so there is nothing to "fill" programmatically in the way you'd
fill an interactive form. The only reliable approach is:

1. Treat the existing PDF page as a fixed background image/vector layer.
2. Draw a *new* content layer on top of it consisting of text strings placed
   at the exact (x, y) coordinates where a human would have handwritten the
   answers.
3. Merge/flatten that new layer with the original page so the result is a
   single, static PDF that looks like a filled-in form.

This is fundamentally different from filling an AcroForm (where you set
field values and the PDF viewer/renderer draws the text for you inside
predefined widget rectangles). With a flat form, *you* are the renderer, so
coordinate accuracy is the whole game — get the coordinates wrong and text
lands on the wrong line, overlaps a printed label, or drifts off the page.

Recommended library: **PyMuPDF (`fitz` / package name `pymupdf`)**. It gives
you:
- Accurate page geometry (in PDF points, origin at bottom-left, but PyMuPDF's
  own coordinate convention exposes top-left-origin rects which is less
  error-prone for this use case).
- The ability to render the page to a raster image so you can visually
  determine coordinates ("click a spot, get its coordinates").
- `page.insert_text()` for the overlay, and the ability to save a flattened,
  single-layer output.

An alternative stack is `pypdf` (formerly PyPDF2) + `reportlab` to build the
overlay and `PdfWriter.merge_page()`/`overlay()` to combine layers. I'll show
the PyMuPDF version as primary since it needs one library instead of two and
has a much easier coordinate-discovery workflow, and mention the
reportlab/pypdf variant briefly.

---

## 1. Step-by-step workflow

### Step 1 — Inspect the form and confirm it's non-fillable

```python
import fitz  # pip install pymupdf

doc = fitz.open("application.pdf")
page = doc[0]
print("Page size (pts):", page.rect.width, page.rect.height)
print("Widgets found:", list(page.widgets()))  # empty/None => no AcroForm fields
```

If `page.widgets()` yields nothing on every page, this confirms the flat-form
assumption baked into this task (no `/AcroForm` in the PDF catalog). If it
*does* yield widgets, stop and use the AcroForm approach in Section 4 instead
— don't overlay text on top of a form that already has fields, you'd get
duplicate/misaligned data.

### Step 2 — Determine coordinates accurately

This is the crux of the task. Never eyeball coordinates from a text
description of the form. Use one of these methods, in order of preference:

**Method A — Render to image + pixel-pick (most reliable, recommended default)**

1. Render each page at a known zoom/DPI to a PNG:
   ```python
   zoom = 2.0  # 2x = 144 DPI if base is 72 DPI
   mat = fitz.Matrix(zoom, zoom)
   pix = page.get_pixmap(matrix=mat)
   pix.save("page1_render.png")
   ```
2. Open `page1_render.png` in any image viewer/editor that shows cursor
   pixel coordinates (e.g., GIMP, Preview with a grid, or a small Python/PIL
   script that overlays a coordinate grid every 50px).
3. For each blank the applicant needs to fill, hover over the *baseline* of
   where handwritten text would sit (just above the line/box) and note the
   pixel (px, py).
4. Convert pixel coordinates back to PDF points by dividing by `zoom`:
   ```python
   pdf_x = px / zoom
   pdf_y = py / zoom
   ```
   Remember: PyMuPDF's `page.insert_text(point, ...)` uses a coordinate
   system with the origin at the **top-left** of the page (same as the
   rendered image), with `point` being the text's baseline-left position —
   so pixel-picked coordinates translate directly without a Y-flip, which is
   the main advantage of using PyMuPDF over raw PDF-content-stream coordinates
   (where the origin is bottom-left and Y must be flipped:
   `pdf_y = page_height - y_from_bottom`).

**Method B — Overlay a coordinate grid on the rendered page**

Generate a debug image with a ruled grid (every 25–50 pt) and axis labels
burned in, so you can read off approximate coordinates directly without a
separate tool:

```python
import fitz

doc = fitz.open("application.pdf")
page = doc[0]
for x in range(0, int(page.rect.width), 50):
    page.draw_line((x, 0), (x, page.rect.height), color=(1, 0, 0), width=0.3)
    page.insert_text((x + 2, 10), str(x), fontsize=6, color=(1, 0, 0))
for y in range(0, int(page.rect.height), 50):
    page.draw_line((0, y), (page.rect.width, y), color=(0, 0, 1), width=0.3)
    page.insert_text((2, y + 8), str(y), fontsize=6, color=(0, 0, 1))
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
pix.save("grid_overlay.png")
```

Inspect `grid_overlay.png` visually next to the printed labels/blanks to read
off approximate (x, y) points for each field, then refine with Method A if
needed. **Never ship the grid-overlay file** — it's a throwaway debugging
aid; make sure your final script draws on a clean copy of the original
(`fitz.open("application.pdf")` again, not the grid-annotated doc).

**Method C — Text extraction to anchor relative to known labels**

If the form has real (non-scanned-image) text — i.e., it's a text-based PDF
even though it lacks form fields — you can extract text with coordinates and
anchor your overlay relative to a label's bounding box, which is more robust
to minor page-to-page reflow than hardcoded absolute coordinates:

```python
words = page.get_text("words")  # list of (x0, y0, x1, y1, word, block, line, word_no)
for w in words:
    if w[4].lower().startswith("name:"):
        label_x1, label_y1 = w[2], w[3]
        # place answer just to the right of the label, baseline-aligned
        target_point = (label_x1 + 4, label_y1)
```
This only works if the PDF has a real text layer (run `page.get_text()` and
see if it returns the label strings). If it's a true scanned image with no
text layer at all, you must use Method A/B (pixel-picking against the
rendered raster) since there's no text to anchor to.

**Whichever method you use:** build a single coordinate map up front as data,
not scattered magic numbers in the drawing code, e.g.:

```python
FIELD_COORDS = {
    "full_name":      {"page": 0, "point": (150, 120), "fontsize": 10},
    "date_of_birth":  {"page": 0, "point": (150, 148), "fontsize": 10},
    "ssn":            {"page": 0, "point": (150, 176), "fontsize": 10},
    "address_line1":  {"page": 0, "point": (150, 204), "fontsize": 10},
    "signature_date": {"page": 1, "point": (400, 700), "fontsize": 10},
    # ... one entry per key in data.json
}
```

### Step 3 — Load the applicant's data

```python
import json

with open("data.json") as f:
    data = json.load(f)
```

Validate that every key referenced in `FIELD_COORDS` exists in `data` (and
flag/log any `data.json` keys that have no coordinate mapping — likely a
sign the form has a field you haven't located yet):

```python
missing_in_data = set(FIELD_COORDS) - set(data)
unmapped_in_data = set(data) - set(FIELD_COORDS)
if missing_in_data:
    raise ValueError(f"No data provided for fields: {missing_in_data}")
if unmapped_in_data:
    print(f"WARNING: data.json has fields with no placement: {unmapped_in_data}")
```

### Step 4 — Draw the overlay onto a fresh copy of the PDF

```python
import fitz

def fill_form(template_path, data, field_coords, output_path):
    doc = fitz.open(template_path)
    for field, value in data.items():
        if field not in field_coords:
            continue
        cfg = field_coords[field]
        page = doc[cfg["page"]]
        page.insert_text(
            cfg["point"],
            str(value),
            fontsize=cfg.get("fontsize", 10),
            fontname="helv",       # base-14 font, always embedded/available
            color=(0, 0, 0),
            render_mode=0,
        )
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

fill_form("application.pdf", data, FIELD_COORDS, "application_filled.pdf")
```

Notes on this step:
- Use a built-in base-14 font (`helv`, `tiro`, `cour`) unless the form
  specifically needs a look-alike font; this avoids font-embedding issues.
- If a value might be long (e.g., a full address) and the blank is narrow,
  either reduce `fontsize` dynamically based on measured text width
  (`fitz.get_text_length(value, fontname, fontsize)`) or wrap/truncate — do
  not let it silently overflow into the next field.
- For checkbox/radio-style fields (e.g., "Married ☐ / Single ☐"), instead of
  inserting text, draw an "X" or a checkmark glyph at the coordinate of the
  correct box, driven by the value in `data.json` (e.g.
  `data["marital_status"] == "single"` picks the single-box coordinate).
- Save to a **new** file; never overwrite `application.pdf` in place, so you
  always have the pristine template to re-run against if coordinates need
  adjusting.

### Step 5 — Validate the result programmatically

Before eyeballing it, run automated sanity checks:

```python
def validate(output_path, data, field_coords):
    doc = fitz.open(output_path)
    problems = []
    for field, value in data.items():
        if field not in field_coords:
            continue
        cfg = field_coords[field]
        page = doc[cfg["page"]]
        found = page.search_for(str(value))
        if not found:
            problems.append(f"'{value}' for field '{field}' not found on page {cfg['page']}")
            continue
        # confirm it landed near the intended point (within a small tolerance)
        target = fitz.Point(cfg["point"])
        nearest = min(found, key=lambda r: (fitz.Point(r.x0, r.y1) - target).abs())
        if (fitz.Point(nearest.x0, nearest.y1) - target).abs() > 3:
            problems.append(f"Field '{field}' rendered at {nearest}, expected near {target}")
    doc.close()
    return problems

problems = validate("application_filled.pdf", data, FIELD_COORDS)
if problems:
    print("VALIDATION ISSUES:")
    for p in problems:
        print(" -", p)
else:
    print("All fields placed and verified.")
```

This catches: values that failed to draw at all, values that landed far from
the intended coordinate (e.g., wrong page index, transposed x/y), and gives
you a machine-checkable gate before human review.

### Step 6 — Visual diff / side-by-side render for human review

```python
doc = fitz.open("application_filled.pdf")
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    pix.save(f"filled_preview_page{i+1}.png")
```

Open the PNGs and visually confirm each answer sits on/above its line, is
not clipped by page edges, and doesn't overlap printed text or box borders.

---

## Full runnable script

```python
"""
fill_flat_form.py
Overlays applicant answers onto a non-fillable (flat) PDF form.

Usage:
    python fill_flat_form.py application.pdf data.json application_filled.pdf
"""

import sys
import json
import fitz  # pip install pymupdf

# --- 1. Coordinate map: derived via the pixel-pick / grid-overlay workflow ---
# page: 0-indexed page number
# point: (x, y) in PDF points, top-left origin, baseline-left of the text
FIELD_COORDS = {
    "full_name":      {"page": 0, "point": (150, 120), "fontsize": 10},
    "date_of_birth":  {"page": 0, "point": (150, 148), "fontsize": 10},
    "ssn":            {"page": 0, "point": (150, 176), "fontsize": 10},
    "address_line1":  {"page": 0, "point": (150, 204), "fontsize": 10},
    "address_line2":  {"page": 0, "point": (150, 224), "fontsize": 10},
    "phone":          {"page": 0, "point": (150, 252), "fontsize": 10},
    "email":          {"page": 0, "point": (150, 280), "fontsize": 10},
    "signature_date": {"page": 1, "point": (400, 700), "fontsize": 10},
    # Add every field present in data.json here.
}


def load_data(path):
    with open(path) as f:
        return json.load(f)


def check_no_form_fields(doc):
    for page in doc:
        widgets = list(page.widgets() or [])
        if widgets:
            print(
                f"WARNING: page {page.number} has {len(widgets)} AcroForm "
                "widget(s). This script is for flat/non-fillable forms; "
                "consider filling widgets directly instead (see README)."
            )


def fill_form(template_path, data, field_coords, output_path):
    doc = fitz.open(template_path)
    check_no_form_fields(doc)

    missing = set(field_coords) - set(data)
    if missing:
        raise ValueError(f"No data provided for mapped fields: {missing}")
    unmapped = set(data) - set(field_coords)
    if unmapped:
        print(f"WARNING: data.json fields with no placement mapping: {unmapped}")

    for field, cfg in field_coords.items():
        value = data.get(field, "")
        if value in (None, ""):
            continue
        page = doc[cfg["page"]]
        page.insert_text(
            cfg["point"],
            str(value),
            fontsize=cfg.get("fontsize", 10),
            fontname=cfg.get("fontname", "helv"),
            color=(0, 0, 0),
        )

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()


def validate(output_path, data, field_coords, tolerance=3.0):
    doc = fitz.open(output_path)
    problems = []
    for field, cfg in field_coords.items():
        value = data.get(field, "")
        if value in (None, ""):
            continue
        page = doc[cfg["page"]]
        hits = page.search_for(str(value))
        if not hits:
            problems.append(f"'{value}' for field '{field}' not found on page {cfg['page']}")
            continue
        target = fitz.Point(cfg["point"])
        nearest = min(hits, key=lambda r: (fitz.Point(r.x0, r.y1) - target).abs())
        dist = (fitz.Point(nearest.x0, nearest.y1) - target).abs()
        if dist > tolerance:
            problems.append(
                f"Field '{field}': rendered near {(nearest.x0, nearest.y1)}, "
                f"expected near {cfg['point']} (off by {dist:.1f}pt)"
            )
    doc.close()
    return problems


def render_previews(output_path, zoom=2.0):
    doc = fitz.open(output_path)
    paths = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        p = f"filled_preview_page{i + 1}.png"
        pix.save(p)
        paths.append(p)
    doc.close()
    return paths


def main():
    if len(sys.argv) != 4:
        print("Usage: python fill_flat_form.py <template.pdf> <data.json> <output.pdf>")
        sys.exit(1)
    template_path, data_path, output_path = sys.argv[1:4]

    data = load_data(data_path)
    fill_form(template_path, data, FIELD_COORDS, output_path)

    problems = validate(output_path, data, FIELD_COORDS)
    if problems:
        print("VALIDATION ISSUES FOUND:")
        for p in problems:
            print(" -", p)
    else:
        print("Automated validation passed: all fields found near expected coordinates.")

    previews = render_previews(output_path)
    print(f"Wrote {output_path}. Review preview images before submitting: {previews}")


if __name__ == "__main__":
    main()
```

Dependencies:
```
pip install pymupdf
```

---

## 2. Verification checklist before submitting

Automated checks (run every time, gate the pipeline on these):
- [ ] `page.widgets()` confirms no pre-existing AcroForm fields were
      overlooked (script logs a warning if it finds any).
- [ ] Every key in `data.json` has a corresponding entry in `FIELD_COORDS`
      (no silently-dropped answers).
- [ ] Every entry in `FIELD_COORDS` has a non-empty value supplied, or is
      explicitly optional.
- [ ] `validate()` confirms each inserted string is actually found in the
      output PDF via `search_for` (guards against exceptions being silently
      swallowed, wrong page index, or text drawn off-canvas).
- [ ] Each found string's position is within a small tolerance (e.g., 2-3 pt)
      of the intended coordinate (guards against transposed x/y or stale
      coordinates from a previous form revision).
- [ ] Output file opens without errors / repair prompts in at least one PDF
      reader (e.g., re-open with `fitz.open(output_path)` and confirm
      `doc.page_count` matches the input, no exceptions on save/reopen).

Manual/visual checks (render each page at 2x-3x zoom and inspect):
- [ ] Every value sits on or just above its designated line/box — not
      floating above it, not overlapping the printed label, not sitting
      on/below the ruled line.
- [ ] No text is clipped by the page margin or by a form box border on left
      or right edges (especially long values: addresses, full legal names,
      emails).
- [ ] Font size is legible and visually consistent with the rest of the
      form (not comically large/small relative to the printed labels).
- [ ] Multi-line values (e.g., a two-line address) actually wrapped/split
      onto two separate insert_text calls at two coordinates rather than
      running off the page width.
- [ ] Checkbox/radio selections show the mark in the *correct* box, and only
      one is marked where the form expects a single choice.
- [ ] Dates, SSNs, phone numbers, etc. are formatted the way the form expects
      (e.g., `MM/DD/YYYY` vs `YYYY-MM-DD`, dashes in SSN/phone).
- [ ] If the form spans multiple pages, confirm fields intended for page 2+
      actually appear on page 2+ (a common bug is hardcoding `page = doc[0]`
      everywhere).
- [ ] Compare the filled PDF side-by-side with a sample/reference filled form
      (if the issuing agency provides one) or with the blank form to make
      sure nothing that should be untouched (e.g., a "for office use only"
      box) was accidentally written into.
- [ ] Confirm the final PDF page count and page size match the original
      template exactly (no accidental page insertion/rotation from the save
      step).
- [ ] Open the final PDF in at least one PDF viewer outside your dev
      environment (e.g., the OS's default viewer or a browser) to catch
      renderer-specific issues (e.g., font-substitution artifacts).
- [ ] If the form will be printed and physically signed, print a test page
      and hold it against a blank original under a light to confirm true
      physical alignment (rendering coordinates can differ subtly from
      print output if a printer applies scaling/"fit to page").

---

## 3. If the form HAD fillable AcroForm fields

If `page.widgets()` (or `pypdf`'s `reader.get_fields()`) returns actual
field objects, the entire overlay/coordinate-hunting workflow above is
unnecessary and should be avoided — you'd risk double-writing data. Instead:

**Library choice:** `pypdf` (pure Python, no extra binary deps, actively
maintained fork of PyPDF2) is the standard choice for straightforward
AcroForm filling. PyMuPDF also supports widget filling via
`page.widgets()` / `widget.field_value = ...` and can be used if you're
already using it for other reasons. For forms needing NeedAppearances
handling or more advanced flattening, `pdfrw` + `reportlab`, or shelling out
to `pdftk`, are common alternatives, but `pypdf` covers the vast majority of
cases without extra tooling.

**Workflow:**
1. Enumerate the fields to discover their exact internal names (these rarely
   match the printed label text exactly):
   ```python
   from pypdf import PdfReader
   reader = PdfReader("application.pdf")
   fields = reader.get_fields()
   for name, f in fields.items():
       print(name, f.get("/FT"), f.get("/V"))
   ```
2. Map `data.json` keys to those internal field names (build the same kind
   of explicit mapping dict as in the overlay case, but mapping to field
   *names* instead of coordinates).
3. Fill and save:
   ```python
   from pypdf import PdfReader, PdfWriter

   reader = PdfReader("application.pdf")
   writer = PdfWriter()
   writer.append(reader)

   field_map = {
       "full_name": "Name_Field_1",
       "date_of_birth": "DOB",
       "ssn": "SSN",
       # ...
   }
   values = {field_map[k]: str(v) for k, v in data.items() if k in field_map}

   for page in writer.pages:
       writer.update_page_form_field_values(page, values, auto_regenerate=False)

   # Ensure viewers render the values even without regenerating appearances
   writer.set_need_appearances_writer(True)

   with open("application_filled.pdf", "wb") as f:
       writer.write(f)
   ```
4. For checkboxes/radio buttons, set the value to the field's "on" export
   value (e.g., `"/Yes"`), not to arbitrary text — inspect
   `field.get("/_States_")` or the widget's `/AP` `/N` dictionary keys to
   find the correct on-state name.
5. Optionally flatten the form (bake values into static content, remove
   interactivity) if the target system needs a non-editable final PDF:
   ```python
   writer.flatten()  # if supported by your pypdf version; else use a widget-by-widget removal
   ```
   or via PyMuPDF: `page.widgets()` iterate + set `widget.update()`, then
   `doc.save(..., garbage=4)` after clearing `/NeedAppearances`, or shell out
   to `pdftk application_filled.pdf output flat.pdf flatten`.

**Validation** for the AcroForm case is simpler and more reliable than the
overlay case: re-open the saved PDF and read back
`PdfReader("application_filled.pdf").get_fields()`, asserting that each
mapped field's `/V` equals the intended value — no coordinate/pixel
comparison is needed since the PDF spec (not your pixel math) is responsible
for placing the glyphs inside the widget rectangle correctly.
