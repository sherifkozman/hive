# Workflow: Generating a 5-Slide QBR from `template.pptx`

Goal: produce a 5-slide quarterly business review from the user's bullet content
while keeping the template's branding, layouts, fonts, and colors fully intact.
This is a **template-editing** job, not a from-scratch build — every step below
is designed to reuse the template's existing XML/theme rather than
reconstruct it, since that's the only way to guarantee brand fidelity.

The core principle: **never recreate slides from nothing.** Always duplicate an
existing template slide (which carries its layout/theme/placeholder
inheritance with it) and edit only the text/content runs inside it. Structural
changes (which slides exist, in what order) are finished completely before any
content is typed in.

---

## 1. Inventory the template: layouts, placeholders, fonts, colors

Before touching anything, understand what the template actually offers.

```bash
# Visual grid of every slide in the template — see actual layouts/branding at a glance
python scripts/thumbnail.py template.pptx

# Full text/placeholder dump — reveals placeholder copy ("Click to add title",
# "Lorem ipsum", sample stat callouts, etc.) and confirms how many distinct
# layouts exist
python -m markitdown template.pptx
```

Open `thumbnails.jpg` and, for each slide, note:

- Layout type (title slide, section divider, 1-column bullets, 2-column,
  image + text, stat/number callout, quote/testimonial, closing slide, etc.)
- Which placeholders it has (title, subtitle, body, picture, chart)
- Anything already reused across multiple slides (that's the "safe" set to
  duplicate)

Then unpack the raw XML so you can inspect the actual layout/master
relationships and theme (fonts, color scheme) that back each slide:

```bash
python scripts/office/unpack.py template.pptx unpacked/
```

Inspect:
- `unpacked/ppt/theme/theme1.xml` — the color scheme (`<a:clrScheme>`) and font
  scheme (`<a:fontScheme>`) driving the whole deck. **Do not edit this** unless
  the user wants a rebrand — it's what guarantees color/font consistency for
  free.
- `unpacked/ppt/slideLayouts/slideLayoutN.xml` — the placeholder geometry
  (`<p:sp>` / `<p:ph type="...">`) each slide layout defines. This is what a
  new slide inherits when created "from layout."
- `unpacked/ppt/slides/slideN.xml` — the actual per-slide content and any
  slide-specific overrides.
- `unpacked/ppt/presentation.xml` → `<p:sldIdLst>` — the slide order (this is
  what you'll edit to build the final 5-slide sequence).

Map out, in your plan, which of the template's existing slides best match the
5 sections of QBR content the user will provide (e.g., title/cover → agenda →
KPI/stat callout → 2-3 content slides with bullets → closing). **Use varied
layouts** — if the template has a stat-callout, a 2-column, and a quote/divider
layout in addition to plain bullets, use them; a QBR that's 5 slides of the
same bullet layout reads as low-effort and wastes what the template offers.

---

## 2. Plan the slide-to-content mapping

For a 5-slide QBR, a reasonable mapping (adjust to what the template actually
contains and what the user's bullets naturally split into):

| # | Section | Template layout to reuse |
|---|---------|--------------------------|
| 1 | Title / cover (quarter, company) | Title layout slide |
| 2 | Executive summary / key metrics | Stat-callout or KPI layout, if present; otherwise bullet layout |
| 3 | Business highlights | 2-column or icon+text layout |
| 4 | Challenges / risks or roadmap | Bullet or comparison layout |
| 5 | Closing / next steps | Closing/section-divider layout |

Do this mapping explicitly before editing anything — it becomes the checklist
for step 3.

---

## 3. Structural changes first (slide count/order), before any text edits

All slide-count and ordering changes must be finished before content editing
starts, so that content edits happen once, on the final skeleton.

```bash
# Duplicate an existing slide (preserves its layout/theme relationship, notes
# references, Content_Types.xml, and relationship IDs correctly — never copy
# slide files by hand for this)
python scripts/add_slide.py unpacked/ slide3.xml

# Or create a fresh slide directly from a layout (no prior content to strip)
python scripts/add_slide.py unpacked/ slideLayout4.xml
```

Each call prints a `<p:sldId>` element — add it to `<p:sldIdLst>` in
`unpacked/ppt/presentation.xml` at the position you want it in the final deck.

- **Delete** slides you won't use: remove their `<p:sldId>` from
  `<p:sldIdLst>` (don't delete the underlying slide XML yourself — `clean.py`
  handles that later).
- **Reorder**: rearrange the `<p:sldId>` entries in `<p:sldIdLst>` to match
  the 5-slide sequence from step 2.
- **Add**: always via `add_slide.py`, never manual file copies — manual
  copying misses relationship IDs, notes references, and `Content_Types.xml`
  entries that will corrupt the file or make PowerPoint attempt "repair."

Once `<p:sldIdLst>` reflects exactly the 5 final slides in the right order,
move to content.

---

## 4. Edit content — what to touch, what never to touch

For each of the 5 `slideN.xml` files:

1. Read the slide XML.
2. Identify **every** placeholder — title text, body bullets, captions,
   images, chart placeholders, sample stat numbers. Templates often have
   sample/lorem content baked into more than just the obvious title/body
   boxes.
3. Replace each with the user's real content, run-by-run, using the **Edit
   tool** (not `sed`/regex/python string replace) — Edit forces you to match
   exact existing text, which avoids corrupting XML structure or namespaces.

**What to touch:**
- Text inside `<a:t>` runs within the slide XML (`slideN.xml`) only.
- Only what's inside the slide's own file — not shared resources.

**What to never touch directly:**
- `theme1.xml` (color scheme / font scheme) — this is what keeps the deck
  "on brand"; editing it changes every slide at once and is almost never what
  a "keep the branding intact" request wants.
- `slideLayoutN.xml` / `slideMasterN.xml` — these define placeholder geometry
  and inherited formatting for every slide using that layout. Edit the
  slide instance, not the layout/master, unless you deliberately intend a
  global change.
- Relationship files (`.rels`) and `Content_Types.xml` by hand — these are
  maintained by `add_slide.py` / `pack.py`.

**Formatting rules while editing:**
- Bold all headers, subheadings, and inline labels (`b="1"` on `<a:rPr>`) —
  slide titles, section headers, and inline labels like "Revenue:" at the
  start of a line.
- Never insert unicode bullet characters (`•`) as literal text — bullets must
  come from `<a:buChar>`/`<a:buAutoNum>` or, preferably, inherited from the
  layout by leaving `<a:pPr>` bullet properties alone.
- If the user's bullet list has more or fewer items than the template slot
  was built for:
  - **More bullets than template slots**: add new `<a:p>` paragraphs copying
    the `<a:pPr>` (line spacing, alignment) of the existing paragraph — never
    concatenate multiple bullets into one `<a:t>` string.
  - **Fewer bullets/items than template slots** (e.g., template has 4 stat
    boxes, QBR content only has 3 metrics): **delete the excess element
    entirely** (its whole `<p:sp>` shape/group — image, box, and text), don't
    just clear its text and leave an empty box behind.
- Longer replacement text may overflow/wrap differently than the sample
  copy — shorter text is usually safe, longer text needs a visual check
  (step 6).
- New text containing quotes must use XML entities (`&#x201C;` `&#x201D;`
  `&#x2018;` `&#x2019;`), since the Edit tool will otherwise flatten smart
  quotes to ASCII.
- Use `xml:space="preserve"` on any `<a:t>` with meaningful leading/trailing
  whitespace.
- Parse/inspect XML with `defusedxml.minidom` if scripting any check —
  `xml.etree.ElementTree` can corrupt namespace prefixes.

If multiple slides need edits and you have subagents available, this is the
one step to parallelize: hand off each `slideN.xml` path individually,
instruct "use the Edit tool for all changes," and pass along the formatting
rules above.

---

## 5. Clean and pack

```bash
# Remove slide files no longer referenced in sldIdLst, unreferenced media,
# and orphaned relationship entries left over from deletions
python scripts/clean.py unpacked/

# Repack into a valid pptx: validates structure, repairs common issues,
# condenses pretty-printed XML back down, re-encodes smart quotes
python scripts/office/pack.py unpacked/ output.pptx --original template.pptx
```

Passing `--original template.pptx` ensures pack.py carries forward the
original file's structural metadata rather than inventing new defaults.

---

## 6. QA — required before delivery

Treat this as a bug hunt: assume the first pack is wrong and go find what's
broken, rather than eyeballing it once and calling it done.

### 6.1 Content QA

```bash
python -m markitdown output.pptx
```

Check: all 5 sections present, correct order, no typos, numbers match the
source bullets.

Specifically hunt for leftover template placeholder text:

```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
```

Any hit here means a placeholder wasn't replaced — fix before proceeding.

### 6.2 Visual QA (render and actually look)

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

This produces `slide-01.jpg` … `slide-05.jpg` at full resolution (do not rely
on the low-res `thumbnail.py` grid for this — that's for template analysis
only).

**Use a fresh subagent for the visual inspection**, even for only 5 slides —
having stared at the XML, you'll see what you expect rather than what's
actually rendered. Prompt it with the standard inspection checklist:

```
Visually inspect these slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. slide-01.jpg (Expected: title/cover slide with QBR title and quarter)
2. slide-02.jpg (Expected: executive summary / key metrics)
3. slide-03.jpg (Expected: business highlights, 2-column or icon layout)
4. slide-04.jpg (Expected: challenges/risks or roadmap)
5. slide-05.jpg (Expected: closing / next steps)

Report ALL issues found, including minor ones.
```

### 6.3 Fix-and-verify loop

1. Generate → convert to images → inspect (as above).
2. List every issue found (if the first pass found nothing, look again —
   that's a signal you weren't looking hard enough, not that it's clean).
3. Fix the issues in `unpacked/`, re-run `clean.py` + `pack.py`.
4. Re-render **only the affected slides** for a fast recheck:
   ```bash
   pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
   ```
   (one fix commonly introduces a new problem on the same slide — re-check it
   specifically, don't assume the fix was clean.)
5. Repeat until a full pass turns up nothing new.

Do not deliver until at least one full fix-and-verify cycle has been
completed.

---

## QA Checklist (final gate before delivery)

**Structure / branding**
- [ ] `theme1.xml` (colors, fonts) untouched from the original template
- [ ] `slideLayoutN.xml` / `slideMasterN.xml` untouched (no direct edits)
- [ ] All 5 slides were created via `add_slide.py` (duplicated/from-layout), never hand-copied
- [ ] `<p:sldIdLst>` contains exactly the 5 intended slides, in the correct order
- [ ] Varied layouts used across the 5 slides (not all plain bullet slides)

**Content**
- [ ] `markitdown` output shows all 5 sections, correct order, correct content
- [ ] No `xxxx` / `lorem ipsum` / "this page/slide layout" leftovers (grep check clean)
- [ ] No orphaned shapes/boxes left behind where content was removed (e.g., an empty 4th stat box when only 3 metrics exist)
- [ ] Multi-item content (bullet lists) is in separate `<a:p>` paragraphs, not concatenated
- [ ] Headers/labels bolded per formatting rules
- [ ] No literal unicode bullet characters typed into text runs
- [ ] Any new quoted text uses XML entities, not raw smart quotes

**Visual (from rendered JPGs)**
- [ ] No overlapping/overflowing text or shapes
- [ ] No text cut off at box or slide edges
- [ ] Adequate, consistent spacing (≥0.3" between blocks, ≥0.5" slide margins)
- [ ] Multi-column/aligned elements actually align
- [ ] No low-contrast text/icon combinations
- [ ] Fix-and-verify cycle completed at least once, with no new issues on recheck

---

## Why this approach (vs. from-scratch generation)

Building the QBR with `pptxgenjs` or similar from-scratch tooling would
require manually re-specifying the template's exact colors, fonts, margins,
and placeholder geometry — any drift there breaks brand fidelity, which is
the user's explicit requirement ("keeping the template's branding, layouts,
fonts, and colors intact"). The unpack → duplicate-from-template → edit-text →
clean → pack workflow instead reuses the template's own theme and layout
XML unmodified, and only substitutes the text/content runs, so the output is
guaranteed to inherit the exact same fonts, colors, and layout geometry as the
source template. Structural changes (slide count/order) are completed before
any content editing so each slide is edited exactly once, on its final form.

LOADED: SKILL.md, editing.md
