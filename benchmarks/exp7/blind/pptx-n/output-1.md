# Generating a 5-Slide QBR Deck from `template.pptx` Without Breaking Branding

## Guiding principle

A `.pptx` file is a zip of XML parts. Branding (fonts, colors, logos, backgrounds,
placeholder positions) lives primarily in three places, in order of authority:

1. **Theme** (`ppt/theme/theme1.xml`) — color scheme, font scheme, effect scheme.
2. **Slide Masters** (`ppt/slideMasters/slideMasterN.xml`) — inherits from theme,
   defines master-level placeholders and background.
3. **Slide Layouts** (`ppt/slideLayouts/slideLayoutN.xml`) — inherit from a master,
   define the actual placeholder set/geometry a slide can use (Title, Content,
   Two Content, Title+Subtitle, Section Header, etc.).

The only safe way to produce on-brand slides is: **pick an existing layout,
add a new slide from that layout, and fill its existing placeholders.**
Never hand-build shapes/text boxes with manually-set fonts/colors, and never
edit the theme/master/layout XML to fit content — that's what breaks branding
and is the #1 failure mode of naive "from scratch" generation.

Tooling: **python-pptx** (pure XML manipulation, no PowerPoint needed) for
build/edit steps, and **LibreOffice headless** (`soffice --headless --convert-to`)
for rendering/visual QA, since python-pptx cannot render slides itself.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install python-pptx==0.6.23
# For QA rendering (Linux/CI):
sudo apt-get install -y libreoffice
```

---

## Step 1 — Inventory the template's layouts and placeholders

Never guess placeholder indexes/names. Dump them programmatically first.

```python
# inventory.py
from pptx import Presentation
from pptx.util import Emu

prs = Presentation("template.pptx")

print(f"Slide size: {prs.slide_width} x {prs.slide_height} EMU "
      f"({Emu(prs.slide_width).inches:.2f}in x {Emu(prs.slide_height).inches:.2f}in)")

for master_idx, master in enumerate(prs.slide_masters):
    print(f"\n=== Master {master_idx}: {master.name} ===")
    for li, layout in enumerate(master.slide_layouts):
        print(f"  Layout[{li}] name={layout.name!r}")
        for shape in layout.placeholders:
            print(f"      ph idx={shape.placeholder_format.idx:<3} "
                  f"type={shape.placeholder_format.type!s:<20} "
                  f"name={shape.name!r} "
                  f"pos=({Emu(shape.left).inches:.2f},{Emu(shape.top).inches:.2f}) "
                  f"size=({Emu(shape.width).inches:.2f}x{Emu(shape.height).inches:.2f})")
```

```bash
python3 inventory.py > template_inventory.txt
cat template_inventory.txt
```

Also dump the raw XML for anything ambiguous (grouped shapes, pictures used as
logos, background fills) so you know what NOT to touch:

```bash
mkdir -p _unzipped
unzip -o template.pptx -d _unzipped
xmllint --format _unzipped/ppt/theme/theme1.xml | less
xmllint --format _unzipped/ppt/slideLayouts/slideLayout1.xml | less
ls _unzipped/ppt/slides/          # existing example slides, if any — good reference for layout usage
ls _unzipped/ppt/media/           # logos/images already embedded — reuse these, don't re-import
```

From the inventory, record for your 5 target slides which existing layout name
maps to which QBR content type, e.g.:

| Target slide            | Layout name to use            | Placeholders available          |
|--------------------------|--------------------------------|----------------------------------|
| 1. Title                | "Title Slide"                  | Title(0), Subtitle(1)            |
| 2. Agenda / Executive summary | "Title and Content"       | Title(0), Body(1, bulleted)      |
| 3. Financial highlights | "Two Content" or "Title and Content" | Title(0), Content(1)/Content(2) |
| 4. Key metrics/KPIs      | "Title and Content" (or a custom "KPI" layout if template has one) | Title(0), Body(1) |
| 5. Risks/Next steps      | "Title and Content"            | Title(0), Body(1, bulleted)      |

If the template only ships 3-4 generic layouts, that's fine — reuse
"Title and Content" for multiple slides rather than fabricating a new layout.
If the customer's template has a bespoke "Section Header" or "Closing" layout,
use it for slide 1/5 for a better on-brand feel.

---

## Step 2 — Duplicate slides from layouts (not from-scratch shapes)

python-pptx has no built-in "duplicate slide" API, but the correct pattern is
`prs.slides.add_slide(layout)`, which creates a slide that inherits the
layout's placeholders (and therefore the master/theme formatting) automatically.

```python
# build_deck.py
from pptx import Presentation
from pptx.util import Pt
from copy import deepcopy

SRC = "template.pptx"
OUT = "QBR_Q2_2026.pptx"

content = [
    {
        "layout": "Title Slide",
        "title": "Q2 2026 Quarterly Business Review",
        "subtitle": "Prepared by Finance • July 2026",
    },
    {
        "layout": "Title and Content",
        "title": "Executive Summary",
        "bullets": [
            "Revenue grew 14% QoQ, ahead of plan by 3 points",
            "Gross margin held at 62%, in line with guidance",
            "Net new logos: 42 (target: 35)",
            "Cash runway extended to 21 months post raise",
        ],
    },
    {
        "layout": "Title and Content",
        "title": "Financial Highlights",
        "bullets": [
            "ARR: $18.4M (+14% QoQ, +61% YoY)",
            "Gross margin: 62% (flat QoQ)",
            "Burn multiple: 1.3x, improved from 1.6x last quarter",
            "Opex growth held to 6% QoQ vs. 14% revenue growth",
        ],
    },
    {
        "layout": "Title and Content",
        "title": "Key Metrics & KPIs",
        "bullets": [
            "NRR: 118% (target: 110%)",
            "CAC payback: 14 months (target: <18)",
            "Logo churn: 1.8% quarterly (target: <2.5%)",
            "Pipeline coverage: 3.4x next-quarter target",
        ],
    },
    {
        "layout": "Title and Content",
        "title": "Risks & Next Steps",
        "bullets": [
            "Risk: hiring plan slipping in EMEA — mitigation in progress",
            "Risk: one enterprise renewal ($400K ARR) at risk in Q3",
            "Next: finalize Q3 pricing changes by end of July",
            "Next: kick off board-approved expansion into APAC",
        ],
    },
]

prs = Presentation(SRC)
layouts_by_name = {l.name: l for m in prs.slide_masters for l in m.slide_layouts}

def set_bullets(placeholder, lines):
    tf = placeholder.text_frame
    tf.clear()  # keeps the first paragraph's existing run/formatting as a base
    tf.paragraphs[0].text = lines[0]
    for line in lines[1:]:
        p = tf.add_paragraph()
        p.text = line
    # Deliberately DO NOT set font name/size/color here — let it inherit
    # from the layout/master placeholder + theme so branding stays intact.

for slide_spec in content:
    layout = layouts_by_name[slide_spec["layout"]]
    slide = prs.slides.add_slide(layout)

    title_ph = slide.shapes.title
    if title_ph is not None:
        title_ph.text_frame.text = slide_spec["title"]

    if "subtitle" in slide_spec:
        for ph in slide.placeholders:
            if ph.placeholder_format.idx == 1:  # subtitle idx on Title Slide layout
                ph.text_frame.text = slide_spec["subtitle"]

    if "bullets" in slide_spec:
        body_ph = None
        for ph in slide.placeholders:
            if ph.placeholder_format.idx != 0:  # skip the title placeholder
                body_ph = ph
                break
        if body_ph is not None:
            set_bullets(body_ph, slide_spec["bullets"])

# Remove any leftover blank/example slides that shipped in template.pptx,
# if the template had sample content slides you don't want in the final deck.
# (Only if template.pptx itself contains starter slides — inspect first.)

prs.save(OUT)
print(f"Wrote {OUT} with {len(prs.slides)} slides")
```

Key rules embedded above:

- **Always create slides via `add_slide(layout)`**, never by copying XML of a
  random slide or building `TextBox` shapes with `add_textbox`.
- **Never call `.font.name`, `.font.size`, `.font.color.rgb` on new text**
  unless the content genuinely needs a local override (e.g., a single red
  "at risk" callout). Leaving formatting unset means the run inherits from
  the placeholder → layout → master → theme chain, which is exactly the
  branding you want to preserve.
- **Use `tf.clear()` + reuse paragraph 0** rather than deleting/re-adding the
  placeholder, so its inherited `lstStyle`/level formatting survives.
- If the template's body placeholder uses multiple indent levels (bulleted
  sub-points), set `paragraph.level = 1` etc. rather than adding literal
  "-" characters — the bullet glyph/indent is theme-driven.
- If a slide has no matching placeholder for some content (e.g. you need an
  image), use `slide.placeholders[idx].insert_picture(path)` on a `PICTURE`
  placeholder if the layout has one — this preserves the frame position/crop
  behavior set by the template, rather than `slide.shapes.add_picture()` with
  hand-picked coordinates.

---

## Step 3 — What to avoid touching directly

| Don't touch | Why |
|---|---|
| `ppt/theme/theme1.xml` | Global color/font scheme; editing it silently changes every slide including ones you didn't author. |
| `ppt/slideMasters/*.xml` | Structural — changes cascade to all layouts. |
| `ppt/slideLayouts/*.xml` | Defines placeholder geometry/inheritance; editing to "make text fit" breaks reuse and future edits. |
| Any embedded logo/image already in `ppt/media/` | Re-encoding/replacing risks resolution/crop/position drift — reuse the placeholder that already frames it. |
| Manual absolute-position textboxes | Bypass placeholder inheritance entirely — become unstyled orphans that don't track template updates. |
| Slide background overrides per-slide (`slide.background`) | Should already come from the layout/master; per-slide overrides fragment the "one template" guarantee. |
| Hardcoded RGB colors instead of theme color references | If you must set a color, use the theme's scheme color (`MSO_THEME_COLOR`) not a literal hex, so it still respects light/dark or future re-themes. |

If content genuinely doesn't fit any existing layout (e.g., the QBR needs a
KPI-tile layout the template lacks), the correct escalation is: **ask the
brand owner for a layout addition to the template file itself** (or duplicate
an existing layout XML properly, including its `<p:cSld>` relationship
wiring, and add it to the master's layout list) — not to invent a one-off
slide with free-floating shapes. That keeps the template as the single source
of truth for future decks.

---

## Step 4 — Handle text overflow safely

Bullet content lengths are unpredictable; template placeholders have fixed
box sizes. Two options, in order of preference:

1. **Let PowerPoint's built-in autofit do its job** — most Title+Content
   layouts already have `<a:normAutofit/>` set on the body placeholder, which
   shrinks text/line-spacing automatically when rendered/opened in PowerPoint.
   python-pptx does not simulate this, so don't panic if it "looks" overflowed
   in a naive text-length check — verify visually in Step 5 instead.
2. **Enforce a soft content budget** upfront: cap bullets to ~5-6 lines,
   ~90 chars/line, per placeholder, matching what the template's own sample
   content (if any) demonstrates. Check this programmatically:

```python
from pptx.util import Pt

def estimate_overflow_risk(placeholder, max_lines=6, max_chars_per_line=90):
    tf = placeholder.text_frame
    total_lines = sum(max(1, len(p.text) // max_chars_per_line + 1) for p in tf.paragraphs)
    return total_lines > max_lines
```

Never solve overflow by shrinking the placeholder box or changing font size
in a way that diverges slide-to-slide — that reads as broken branding even if
technically "fits."

---

## Step 5 — Render and verify before delivery

python-pptx cannot render. Use LibreOffice headless to convert to PDF/PNG and
inspect visually (this is also what most CI QA pipelines use since it needs
no PowerPoint license):

```bash
# Full-deck PDF render for a quick human eyeball pass
soffice --headless --convert-to pdf --outdir ./qa_render QBR_Q2_2026.pptx

# Per-slide PNGs for automated/diff-based QA
soffice --headless --convert-to png --outdir ./qa_render/pngs QBR_Q2_2026.pptx
# (LibreOffice only emits slide 1 as PNG directly per doc; for all slides,
#  convert to PDF then rasterize each page)
pip install pdf2image  # needs poppler-utils: apt-get install -y poppler-utils
python3 - <<'EOF'
from pdf2image import convert_from_path
pages = convert_from_path("qa_render/QBR_Q2_2026.pdf", dpi=150)
for i, page in enumerate(pages, 1):
    page.save(f"qa_render/pngs/slide_{i}.png")
EOF
```

Then do structural + visual checks:

```python
# structural_check.py — catch broken placeholders/inheritance programmatically
from pptx import Presentation

prs = Presentation("QBR_Q2_2026.pptx")
assert len(prs.slides) == 5, f"expected 5 slides, got {len(prs.slides)}"

for i, slide in enumerate(prs.slides, 1):
    layout_name = slide.slide_layout.name
    title = slide.shapes.title
    assert title is not None and title.text_frame.text.strip(), \
        f"slide {i} ({layout_name}) missing title text"
    # Confirm every shape on the slide is either a placeholder (inherits
    # formatting) or an intentionally-added picture — flag orphan textboxes.
    for shape in slide.shapes:
        if shape.has_text_frame and not shape.is_placeholder:
            print(f"WARNING slide {i}: non-placeholder text shape {shape.name!r} "
                  f"— verify this was intentional and font/color are set explicitly")
print("Structural check passed")
```

Manual/visual QA checklist (against `qa_render/pngs/slide_N.png`, compared to
a slide originally shipped in `template.pptx` if one exists):

- [ ] Font family on every slide matches the theme font (no default "Calibri"
      showing up where the brand font should be — a common sign a shape
      bypassed the placeholder/theme chain).
  Full-run check: `import re; [r.font.name for p in tf.paragraphs for r in p.runs]`
  should mostly be `None` (meaning "inherit"), not a hardcoded name.
- [ ] Brand colors (title color, accent color, background) match other
      template slides/theme swatches — no default black/blue PowerPoint colors.
- [ ] Logo/background graphics present and unmodified on every slide.
- [ ] No text overflow/clipping/truncation in the rendered PNG/PDF — check
      every slide at real render size, not just the XML.
- [ ] Bullet indentation/levels/glyphs match the template's existing bullet
      style (not default round bullets if template uses a custom marker).
- [ ] Slide numbering / footer / date placeholders (if the template has them)
      are still present and correctly populated or left as an update field.
- [ ] Title placeholder text doesn't exceed the box → wraps to 2 lines
      awkwardly; check against template's max observed title length.
- [ ] No stray/duplicate placeholders left empty and visible (e.g., "Click
      to add text" prompt boxes should not render in PowerPoint — confirm no
      empty placeholder is set to `visible` with visible ghost text).
- [ ] File opens cleanly in real PowerPoint/Keynote/Google Slides (not just
      LibreOffice) — spot-check in at least one commercial viewer since
      python-pptx-written OOXML occasionally has edge cases only strict
      parsers catch.
- [ ] `python-pptx` round-trip: reopen the saved file and re-run the
      structural check script to make sure nothing was corrupted on save.
- [ ] Total slide count is exactly 5, in the intended order.
- [ ] No embedded macros/PII/leftover speaker notes from any slide you
      duplicated as a base.

---

## Summary workflow (commands only)

```bash
# 1. Inventory
python3 inventory.py > template_inventory.txt

# 2. Build
python3 build_deck.py            # -> QBR_Q2_2026.pptx

# 3. Structural QA
python3 structural_check.py

# 4. Render QA
soffice --headless --convert-to pdf --outdir ./qa_render QBR_Q2_2026.pptx
python3 render_pngs.py            # pdf2image -> per-slide PNGs

# 5. Manual visual pass against qa_render/pngs/*.png using the checklist above
```

This workflow guarantees every new slide is built by instantiating one of the
template's own layouts and writing into its existing placeholders — so fonts,
colors, positions, and effects are inherited straight from the theme/master
chain the brand team already approved, rather than being reconstructed (and
inevitably drifting) from scratch.
