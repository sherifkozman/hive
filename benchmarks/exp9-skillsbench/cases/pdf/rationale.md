# pdf skill — evaluation case rationale

## Scope / fairness note

Read ONLY: `skills/sources/anthropic/pdf/SKILL.md`, `reference.md`, `forms.md`.
Did not open `scripts/*.py` contents (not needed for case design — all sampled
sections are self-contained prose/code in the three markdown files), and did not
open anything under `skills/authored/`, `skills/converted/`, `skills/meta/`,
`packages/`, any `INDEX.md`/`BUNDLE.md`, or any `mini/` directory. No taint.

## Step 1 — Section enumeration (H2 `##` and H3 `###` only, file order: SKILL.md → reference.md → forms.md)

H1 (`#`) and H4 (`####`) headings are excluded per the rule (only H2/H3 counted).

### SKILL.md (1–17)

| # | Heading | Level |
|---|---|---|
| 1 | Overview | H2 |
| 2 | Quick Start | H2 |
| 3 | Python Libraries | H2 |
| 4 | pypdf - Basic Operations | H3 |
| 5 | pdfplumber - Text and Table Extraction | H3 |
| 6 | reportlab - Create PDFs | H3 |
| 7 | Command-Line Tools | H2 |
| 8 | pdftotext (poppler-utils) | H3 |
| 9 | qpdf | H3 |
| 10 | pdftk (if available) | H3 |
| 11 | Common Tasks | H2 |
| 12 | Extract Text from Scanned PDFs | H3 |
| 13 | Add Watermark | H3 |
| 14 | Extract Images | H3 |
| 15 | Password Protection | H3 |
| 16 | Quick Reference | H2 |
| 17 | Next Steps | H2 |

(Excluded H4: "Subscripts and Superscripts" under #6.)

### reference.md (18–45)

| # | Heading | Level |
|---|---|---|
| 18 | pypdfium2 Library (Apache/BSD License) | H2 |
| 19 | Overview | H3 |
| 20 | Render PDF to Images | H3 |
| 21 | Extract Text with pypdfium2 | H3 |
| 22 | JavaScript Libraries | H2 |
| 23 | pdf-lib (MIT License) | H3 |
| 24 | pdfjs-dist (Apache License) | H3 |
| 25 | Advanced Command-Line Operations | H2 |
| 26 | poppler-utils Advanced Features | H3 |
| 27 | qpdf Advanced Features | H3 |
| 28 | Advanced Python Techniques | H2 |
| 29 | pdfplumber Advanced Features | H3 |
| 30 | reportlab Advanced Features | H3 |
| 31 | Complex Workflows | H2 |
| 32 | Extract Figures/Images from PDF | H3 |
| 33 | Batch PDF Processing with Error Handling | H3 |
| 34 | Advanced PDF Cropping | H3 |
| 35 | Performance Optimization Tips | H2 |
| 36 | 1. For Large PDFs | H3 |
| 37 | 2. For Text Extraction | H3 |
| 38 | 3. For Image Extraction | H3 |
| 39 | 4. For Form Filling | H3 |
| 40 | 5. Memory Management | H3 |
| 41 | Troubleshooting Common Issues | H2 |
| 42 | Encrypted PDFs | H3 |
| 43 | Corrupted PDFs | H3 |
| 44 | Text Extraction Issues | H3 |
| 45 | License Information | H2 |

(Excluded H4 under #23/#24/#26/#27/#29/#30/#32: "Load and Manipulate Existing PDF",
"Create Complex PDFs from Scratch", "Advanced Merge and Split Operations",
"Basic PDF Loading and Rendering", "Extract Text with Coordinates",
"Extract Annotations and Forms", "Extract Text with Bounding Box Coordinates",
"Advanced Image Conversion", "Extract Embedded Images", "Complex Page
Manipulation", "PDF Optimization and Repair", "Advanced Encryption",
"Extract Text with Precise Coordinates", "Advanced Table Extraction with
Custom Settings", "Create Professional Reports with Tables", "Method 1: Using
pdfimages (fastest)", "Method 2: Using pypdfium2 + Image Processing" — all
treated as nested content of their parent H3, not separately numbered.)

### forms.md (46–61)

| # | Heading | Level |
|---|---|---|
| 46 | Step 1: Try Structure Extraction First | H2 |
| 47 | Approach A: Structure-Based Coordinates (Preferred) | H2 |
| 48 | A.1: Analyze the Structure | H3 |
| 49 | A.2: Check for Missing Elements | H3 |
| 50 | A.3: Create fields.json with PDF Coordinates | H3 |
| 51 | A.4: Validate Bounding Boxes | H3 |
| 52 | Approach B: Visual Estimation (Fallback) | H2 |
| 53 | B.1: Convert PDF to Images | H3 |
| 54 | B.2: Initial Field Identification | H3 |
| 55 | B.3: Zoom Refinement (CRITICAL for accuracy) | H3 |
| 56 | B.4: Create fields.json with Refined Coordinates | H3 |
| 57 | B.5: Validate Bounding Boxes | H3 |
| 58 | Hybrid Approach: Structure + Visual | H2 |
| 59 | Step 2: Validate Before Filling | H2 |
| 60 | Step 3: Fill the Form | H2 |
| 61 | Step 4: Verify Output | H2 |

(`# Fillable fields` and `# Non-fillable fields` are H1 and excluded.)

**N = 61**

## Step 2 — Sampling computation

- k = ceil(N/6) = ceil(61/6) = ceil(10.1667) = **11**
- 0x0d001a = 851994 (decimal)
- 851994 mod 11 = 0 (851994 = 11 × 77454 exactly — verified with a python one-liner)
- offset = 0 + 1 = **1**
- Sampled indices: offset, offset+k, offset+2k, offset+3k, offset+4k, offset+5k
  = 1, 12, 23, 34, 45, 56 (all ≤ N=61, so no modulo wraparound was needed)

**Skip log**: none. Each of the 6 sampled sections was checked for
pure-TOC/heading-only content; all six carry substantive body text or code, so
no index was advanced/skipped:
- #1 "Overview" — 2 sentences of real (if brief) guidance text, not a bare heading.
- #12 "Extract Text from Scanned PDFs" — full OCR code sample.
- #23 "pdf-lib (MIT License)" — intro sentence + nested code examples (load/manipulate, create, merge/split) that live under this H3 until the next H3.
- #34 "Advanced PDF Cropping" — full code sample.
- #45 "License Information" — a real content table (8 library→license mappings), not a TOC.
- #56 "B.4: Create fields.json with Refined Coordinates" — full JSON schema example.

## Sampled section → case mapping

| Sampled index | Section | Used in |
|---|---|---|
| 1 | SKILL.md § Overview | Case 1 (narrow, s1) |
| 12 | SKILL.md § Extract Text from Scanned PDFs | Case 2 (narrow, s2) |
| 23 | reference.md § pdf-lib (MIT License) | Case 3 (broad, s3) |
| 34 | reference.md § Advanced PDF Cropping | Case 3 (broad, s4) |
| 45 | reference.md § License Information | Case 4 (broad, s5) |
| 56 | forms.md § B.4: Create fields.json with Refined Coordinates | Case 4 (broad, s6) |

## Per-case rationale

### pdf-narrow-01 (section 1 only: SKILL.md § Overview) — REVISED, see Amendment 1 below

- **Content used**: "This guide covers essential PDF processing operations
  using Python libraries and command-line tools. For advanced features,
  JavaScript libraries, and detailed examples, see REFERENCE.md. If you need
  to fill out a PDF form, read FORMS.md and follow its instructions." — the
  domain fact drawn from it is the first sentence: routine/essential PDF
  operations are handled via two coequal primary categories of tooling,
  **Python libraries** and **command-line tools** (JavaScript and dedicated
  form-filling procedures are called out separately, as more specialized).
- **Why it tests trap knowledge**: this is a fact about the domain itself —
  which tool categories are the primary, essential approach for everyday PDF
  work — not an artifact of how the content happens to be filed. Any
  faithful repackaging of this knowledge (single file, split files, any
  ordering) would still have to state that CLI tools are a first-class,
  primary approach alongside Python libraries for standard operations, since
  that's a fact about PDF tooling recommendations, not about document
  layout.
- **Difficulty rationale**: a generic agent without the skill typically
  defaults to treating "a Python library" as *the* way to do PDF work in
  code, and is unlikely to also name plain command-line tools (qpdf, pdftk,
  poppler-utils) as an equally primary/essential category for the same
  routine jobs, rather than an obscure or secondary fallback.
- **ground_truth chosen** (not expected_behavior): the answer is an exact,
  short domain fact — "Python libraries and command-line tools" — so
  ground_truth is used rather than a rubric.

### pdf-narrow-02 (section 12 only: SKILL.md § Extract Text from Scanned PDFs)

- **Content used**: the OCR code block — `from pdf2image import
  convert_from_path`, `convert_from_path('scanned.pdf')`, `import
  pytesseract`, `pytesseract.image_to_string(image)`.
- **Why it tests trap knowledge**: pins down the *exact* two-function idiom
  (rasterize, then OCR) and their exact names/prefixes, which is easy to get
  approximately right (e.g. "use OCR on images from the PDF") but easy to get
  exactly wrong (wrong package, wrong function name, e.g. guessing
  `pdf2image.convert()` or a raw `pytesseract.run()`).
- **Difficulty rationale**: a generic agent commonly defaults to invoking the
  Tesseract CLI directly, or to a different rasterization library (e.g.
  PyMuPDF/fitz `page.get_pixmap()`), rather than the specific
  `pdf2image.convert_from_path` + `pytesseract.image_to_string` pairing this
  section specifies.
- **ground_truth chosen**: exact function/module names are objectively
  checkable, so ground_truth is used, not a rubric.

### pdf-broad-03 (sections 23 + 34: reference.md § pdf-lib + § Advanced PDF Cropping)

- **Content used**: from §23, `const pageCount = pdfDoc.getPageCount();`
  (pdf-lib's page-count API); from §34, the four discrete pypdf attribute
  assignments `page.mediabox.left/bottom/right/top = <value>` (as opposed to
  a single tuple/box argument).
- **Why it genuinely spans both sections**: the question requires the exact
  JS method name from the pdf-lib section (a completely different library
  and language than the Python cropping section) *and* the exact Python
  attribute-assignment form from the cropping section; neither section alone
  answers the full question, and there's no way to infer pdf-lib's API from
  pypdf's API or vice versa.
- **Difficulty rationale**: a plausible but wrong guess for stage 1 is
  `pdfDoc.getPages().length` (also valid conceptually in pdf-lib generally,
  but not the API name this material documents) and for stage 2 a plausible
  wrong guess is a single `page.mediabox = [50, 50, 550, 750]`-style call
  instead of the four discrete named-attribute assignments actually shown.
- **ground_truth chosen**: both required answers are exact API
  call/attribute strings pulled verbatim from the source, hence ground_truth
  over a rubric.

### pdf-broad-04 (sections 45 + 56: reference.md § License Information + forms.md § B.4)

- **Content used**: from §45, the license table (specifically `pypdfium2:
  Apache/BSD License` vs. `poppler-utils: GPL-2 License`); from §56, the
  fields.json schema for the visual-estimation approach that signals
  image-pixel coordinates via the keys `image_width`/`image_height` (as
  opposed to Approach A's `pdf_width`/`pdf_height`).
- **Why it genuinely spans both sections**: answering requires
  cross-referencing which rendering-capable library in the license table is
  *not* GPL-licensed (§45) with the coordinate-file field-naming convention
  used specifically for the image-based/visual-estimation workflow (§56);
  neither section contains the other's information.
- **Difficulty rationale**: a generic agent is unlikely to know that
  `poppler-utils` — the everyday default for turning PDF pages into images
  — is GPL-2 (a fact only stated in this reference's license table) and so
  won't know to reach for `pypdfium2` instead under a no-GPL constraint;
  separately, it's easy to guess a plausible-but-wrong key pair like
  `width`/`height` or `img_width`/`img_height` instead of the exact
  `image_width`/`image_height` this schema requires.
- **ground_truth chosen**: library name + license string, and the exact JSON
  key pair, are both objectively checkable literal strings, so ground_truth
  is used rather than a rubric.

## Amendment 1 — QA rejection and rework of pdf-narrow-01

**QA verdict received (verbatim from team-lead)**: "cases pdf-narrow-02,
pdf-broad-03, pdf-broad-04 are ACCEPTED (I independently verified every
ground-truth string exists in the relevant knowledge sources; no changes).
pdf-narrow-01 is REJECTED for a pre-registered-rule violation you couldn't
have fully seen: its question asks about the documentation's own navigation
structure ("which companion document... exact filename") and the answer
FORMS.md is an artifact of one particular packaging of this knowledge — the
experiment compares alternative packagings of the same content, so a case
whose ANSWER is a packaging structure is structurally biased. The rule
'questions must not name file paths/packaging structures' extends to
answers."

**Rework instructions received**: keep the same sampled section (SKILL.md
§ Overview, section 1 — no resampling), stay read-only on the same three
files, and produce a domain-level case whose ground_truth is an exact
domain fact (library/tool name(s), command, method) that would be stated in
any faithful packaging of this content — not a fact about this packaging's
own file layout. Keep id `pdf-narrow-01`, no `expected_behavior`.

**Resolution**: pdf-narrow-01 was rewritten (see revised entry above and in
evals.json) to test the Overview's substantive tooling-recommendation
content — that essential/routine PDF operations are handled primarily via
"Python libraries and command-line tools" — rather than the filename of a
companion document. This fact is intrinsic to the domain guidance (which
tool categories to reach for) and would survive any repackaging of the same
knowledge, unlike the rejected version's answer (a specific filename that is
only meaningful under this repo's particular multi-file split).

No other cases were changed. pdf-narrow-02, pdf-broad-03, and pdf-broad-04
are unchanged from the original submission and were independently accepted
by QA.
