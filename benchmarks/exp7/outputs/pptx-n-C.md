# Workflow: Generating a 5-Slide QBR from `template.pptx`

Goal: produce a 5-slide Quarterly Business Review from user-supplied bullet
content, reusing the company's branded `template.pptx` as the source of
truth for layouts, placeholders, fonts, and colors. This is a **template
editing** job, not a from-scratch build — the template's masters, layouts,
and theme must never be touched; only slide-level content changes.

All helper scripts referenced below (`thumbnail.py`, `office/unpack.py`,
`add_slide.py`, `clean.py`, `office/pack.py`, `office/soffice.py`) are the
vendored PPTX skill scripts. Do all structural edits yourself; use the Edit
tool (not `sed`/ad-hoc Python string replace) for XML text edits; use
subagents only for parallel content-fill across slide XML files and for
visual QA.

---

## Step 1 — Inventory the template

Before touching anything, understand what layouts/placeholders exist and
what fonts/colors the theme defines.

```bash
# Visual overview of every slide currently in the template
python scripts/thumbnail.py template.pptx template_thumbs --cols 3

# Text/placeholder inventory (what's in each shape, in reading order)
python -m markitdown template.pptx

# Raw XML for masters, layouts, theme, and existing slides
python scripts/office/unpack.py template.pptx unpacked/
```

After unpacking, inspect (read-only at this stage):

- `unpacked/ppt/theme/theme1.xml` — the color scheme (`<a:clrScheme>`) and
  font scheme (`<a:fontScheme>`). This is the single source of truth for
  brand colors/fonts — **never hardcode a color/font that contradicts it**.
- `unpacked/ppt/slideLayouts/slideLayoutN.xml` — the available layouts
  (Title, Title+Content, Two Content, Section Header, Comparison, etc.) and
  their named placeholders (`<p:ph type="..." idx="...">`).
- `unpacked/ppt/slideMasters/slideMaster1.xml` — master-level placeholder
  formatting inherited by every layout/slide.
- `unpacked/ppt/slides/slideN.xml` — existing example slides, which show
  how the layouts are actually populated (good reference for run
  properties, bullet definitions, line spacing to copy later).

Build a short mapping table of what's available, e.g.:

| Layout file | Layout name/type | Good for |
|---|---|---|
| slideLayout1.xml | Title Slide | Cover |
| slideLayout2.xml | Title + Content | Bulleted narrative slide |
| slideLayout4.xml | Two Content | Wins vs. Challenges side-by-side |
| slideLayout6.xml | Title Only / Stat | Big-number KPI callouts |
| slideLayout9.xml | Section Header | Closing / "Next Steps" |

## Step 2 — Plan the slide mapping (content → layout)

Map the 5 QBR sections to *varied* template layouts — do not put every
bullet list on the same "Title + Content" layout; a monotonous deck is a
common failure mode and is explicitly penalized in QA.

Example mapping for a QBR:

1. **Cover** — Title Slide layout: quarter/company name, subtitle.
2. **Executive Summary** — Title + Content (bullets) layout: 3-5 top-line
   takeaways.
3. **Key Metrics** — Stat/number-callout layout (or Two/Three Content used
   as KPI tiles): revenue, growth %, retention, pipeline, etc. as big
   numbers with small labels, not paragraphs.
4. **Wins & Challenges** — Two Content / Comparison layout: left column
   wins, right column challenges or risks.
5. **Next Quarter Priorities / Closing** — Section Header or Title+Content
   layout: forward-looking bullets or roadmap items, ending on a
   thank-you/contact slide if the template has one.

For each slide, note exactly which template slide XML you'll duplicate
from (pick the existing slide instance that already uses the layout you
want — duplicating a populated slide is safer than building fresh from a
bare layout, since it inherits correct placeholder wiring).

## Step 3 — Unpack and perform structural changes first

```bash
python scripts/office/unpack.py template.pptx unpacked/
```

With `unpacked/ppt/presentation.xml` open, note the current
`<p:sldIdLst>`. Do **all** slide add/remove/reorder operations before
editing any text — mixing structural and content edits invites corruption.

```bash
# Duplicate an existing "Title + Content" slide (e.g. slide2.xml) for the
# Executive Summary slide; repeat once per target slide.
python scripts/add_slide.py unpacked/ slide2.xml
# -> prints the new slide file name and a <p:sldId> element to insert

# If a layout has no existing populated example, create straight from the
# layout instead:
python scripts/add_slide.py unpacked/ slideLayout6.xml
```

Then edit `unpacked/ppt/presentation.xml`:
- Insert each new `<p:sldId>` (as printed by `add_slide.py`) into
  `<p:sldIdLst>` in the desired final order (Cover → Summary → Metrics →
  Wins/Challenges → Next Steps).
- Remove `<p:sldId>` entries for any original template example slides you
  are not keeping in the final deck.

Do not manually copy slide XML files with `cp`/duplicate by hand — that
misses relationship IDs, notes references, and `[Content_Types].xml`
registration that `add_slide.py` handles for you.

## Step 4 — Fill in content (Edit tool, ideally parallelized via subagents)

Each target slide is a separate `slideN.xml` file, so this step parallelizes
well across subagents — one per slide, each told to use the Edit tool only.

For every slide:
1. Read the slide's XML.
2. Identify **every** placeholder run of text, plus any leftover
   template images/icons that won't apply to the new content.
3. Replace text with the final QBR content, respecting the rules below.
4. Delete (don't just blank) any shape/group that has no corresponding
   source content (e.g., template has 4 KPI tiles but the user gave you 3
   metrics — remove the 4th tile's entire shape group, not just its text).

Formatting rules to follow while editing:

- **Bold headers/labels**: set `b="1"` on the `<a:rPr>` of slide titles,
  section headers, and inline labels (e.g. "Revenue:", "Risk:").
- **No unicode bullet characters** (`•`) typed into `<a:t>`. Let bullets
  come from the layout's `<a:buChar>`/`<a:buAutoNum>`; only override with
  an explicit `<a:buChar>` or `<a:buNone>` if truly needed.
- **One `<a:p>` per list item.** Never concatenate multiple bullets/steps
  into a single paragraph string. Copy the original `<a:pPr>` from the
  slide you duplicated so line spacing/indent stays correct, e.g.:

  ```xml
  <a:p>
    <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
    <a:r><a:rPr lang="en-US" sz="1800" b="1"/><a:t>Revenue</a:t></a:r>
  </a:p>
  <a:p>
    <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
    <a:r><a:rPr lang="en-US" sz="1400"/><a:t>Up 12% QoQ to $4.2M.</a:t></a:r>
  </a:p>
  ```

- **Smart quotes**: the Edit tool will normalize curly quotes to ASCII, so
  when content needs real typographic quotes, write the XML entity
  directly: `&#x201C;` / `&#x201D;` (double), `&#x2018;` / `&#x2019;`
  (single).
- **Preserve whitespace** where needed with `xml:space="preserve"` on
  `<a:t>`.
- **Length mismatches**: shorter replacement text is generally safe;
  materially longer text can overflow or reflow a box designed for the
  template's placeholder copy — trim/summarize the user's bullets to fit
  the box rather than letting the layout overflow, and re-check visually
  in Step 6.
- Parse/inspect XML with `defusedxml.minidom`, never
  `xml.etree.ElementTree` (it mangles the `p:`/`a:` namespaces on
  re-serialization).

## Step 5 — What NOT to edit directly

- `ppt/theme/theme1.xml` (`<a:clrScheme>`, `<a:fontScheme>`) — brand
  colors/fonts live here; changing it changes the whole deck's branding.
- `ppt/slideMasters/*.xml` and `ppt/slideLayouts/*.xml` — these define
  placeholder geometry and inherited formatting for every slide; editing
  them to "make one slide work" silently changes every other slide that
  shares the layout.
- Don't hand-copy slide XML files or renumber relationship IDs manually —
  always go through `add_slide.py`.
- Don't introduce new fonts/colors not present in the theme; pull sizes
  and colors from the existing populated example slides instead of
  inventing new run properties.
- Don't leave orphaned template placeholder text (e.g. "Click to add
  text", "Lorem ipsum", sample stat numbers) in the final deck.

## Step 6 — Clean and pack

```bash
python scripts/clean.py unpacked/
python scripts/office/pack.py unpacked/ qbr_output.pptx --original template.pptx
```

`clean.py` drops slides no longer referenced in `<p:sldIdLst>` plus any
now-orphaned media/relationship files (important since Step 3 removed
unused template example slides). `pack.py` repacks, validates the
resulting OOXML, and re-encodes smart quotes.

## Step 7 — QA (required before delivery)

Treat this as a bug hunt — assume the first render has problems.

**Content QA:**

```bash
python -m markitdown qbr_output.pptx
```

Check the extracted text against the user's original bullets for missing
content, wrong order, and typos. Then specifically hunt for leftover
template placeholder copy:

```bash
python -m markitdown qbr_output.pptx | grep -iE "xxxx|lorem|ipsum|click to add|this.*(page|slide).*layout"
```

Fix anything this returns before proceeding.

**Visual QA — render to images:**

```bash
python scripts/office/soffice.py --headless --convert-to pdf qbr_output.pptx
pdftoppm -jpeg -r 150 qbr_output.pdf slide
```

This produces `slide-01.jpg` … `slide-05.jpg`. Hand these to a fresh
subagent (fresh eyes catch what you'll otherwise rationalize away) with:

```
Visually inspect these 5 QBR slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words)
- Text overflow or cut off at box edges (especially KPI numbers and the
  wins/challenges columns)
- Leftover placeholder content or sample numbers from the template
- Elements too close (< 0.3") or columns not aligned
- Insufficient margin from slide edges (< 0.5")
- Low-contrast text/icons against the template's brand background colors
- Bullet/paragraph formatting that doesn't match the rest of the deck

Report ALL issues found per slide, even minor ones.
```

**Verification loop:**
1. Render → inspect.
2. List every issue found (if the list is empty, look again — the first
   pass is almost never clean).
3. Fix via Edit tool.
4. Re-render only the affected slide(s) for a fast recheck:
   ```bash
   pdftoppm -jpeg -r 150 -f 3 -l 3 qbr_output.pdf slide-fixed
   ```
5. Repeat until a full pass turns up nothing new.

Do not deliver after only one render — at least one fix-and-reverify cycle
is required.

---

## QA Checklist (must all pass before delivery)

- [ ] Slide count is exactly 5, in the intended order (Cover → Exec
      Summary → Key Metrics → Wins/Challenges → Next Steps).
- [ ] `markitdown` output contains all user-supplied bullet content, no
      truncation, correct order.
- [ ] No leftover placeholder/sample text (`grep -iE "xxxx|lorem|ipsum|click to add"` returns nothing).
- [ ] No orphaned shapes/images left over from template slots that had
      fewer real content items than the template's original example
      (e.g., unused KPI tile, empty team-member card).
- [ ] All slide titles and section labels/inline labels are bold
      (`b="1"`), matching the template's own convention.
- [ ] No literal `•` characters in `<a:t>` — bullets come from
      `<a:buChar>`/`<a:buAutoNum>` or layout inheritance.
- [ ] Multi-item content (bullets, steps) uses separate `<a:p>` elements,
      not concatenated strings.
- [ ] Theme file (`theme1.xml`), slide masters, and slide layouts are
      byte-for-byte unchanged from the original template.
- [ ] Fonts and colors used on every new run come from the template's
      existing theme/example slides — no ad hoc colors/fonts introduced.
- [ ] Rendered images show no text overflow/cut-off, no overlaps, no
      low-contrast text/icons, consistent column alignment, and ≥0.3"
      gaps between elements / ≥0.5" margins from slide edges.
- [ ] At least one full fix-and-reverify visual QA cycle completed with a
      fresh (subagent) reviewer, with zero remaining issues on the final
      pass.
- [ ] Final file opens cleanly in PowerPoint/LibreOffice with no repair
      prompt (confirms `pack.py` validation succeeded).

---

LOADED: skills/converted/pptx/composable/INDEX.md, skills/converted/pptx/composable/presets/editing.md
