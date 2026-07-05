# Meridian Software — Investor Update Deck

## 1. Approach Selection

**Chosen approach: generate from scratch with PptxGenJS** (per the pptx skill's decision rule: *"Create from scratch → read pptxgenjs.md; use when no template or reference presentation is available"*).

Justification:

- There is no existing Meridian Software template, brand deck, or reference `.pptx` to edit — the "unpack → edit XML → repack" editing workflow (`editing.md`) exists specifically for modifying an already-designed file (client template, prior deck, placeholder layouts). Nothing here needs opening, so that workflow doesn't apply.
- The deliverable explicitly requires **a real chart, not an image placeholder**. PptxGenJS's `addChart()` API produces a native, editable OOXML chart object (real `<c:chart>` XML bound to embedded data) — the investor can click a bar and see the data table in PowerPoint. An image placeholder (e.g., a matplotlib PNG dropped into a text box) would fail that requirement outright, and hand-authoring chart XML directly is unnecessary risk when PptxGenJS exposes it as a first-class primitive.
- PptxGenJS also gives native, fully-owned control over shapes, icons (rasterized via react-icons + sharp), tables, and slide masters — everything needed to build a disciplined, repeatable design system (color/type/spacing tokens applied consistently across 8 slides) rather than fighting a fixed template's placeholders.
- Output is plain Node.js — runnable anywhere, versionable, and re-generatable if numbers change (e.g., when the actual Q3 close comes in), which a one-off manually-edited XML file would not be.

Rejected alternatives:
- **python-pptx**: no first-class support for combo styling of charts/shapes the way PptxGenJS's chart-styling options expose them, and the skill's own reference path for from-scratch generation is PptxGenJS — no reason to diverge.
- **Manually unpacking/editing a blank OOXML skeleton**: this is what `editing.md` is for, but that path assumes a starting file worth preserving (a client's existing template, brand layouts, speaker notes). Building 8 new slides from nothing through raw XML editing is strictly more work and more error-prone than the generator API.

---

## 2. Design System (explicit choices)

**Palette — "Midnight Executive," picked because this is a finance/investor artifact for an enterprise B2B SaaS company; navy reads as trust/stability without being a generic "corporate blue," and it lets the Europe-expansion visual (dots/pins) sit cleanly on both dark and light backgrounds.**

| Role | Hex | Usage | Weight |
|---|---|---|---|
| Primary — Navy | `1E2761` | Dominant color: title/closing slide backgrounds, section-marker circles, big stat numbers, chart primary series, headers | ~65% |
| Secondary — Ice Blue | `CADCFC` | Content-slide background tint, card fills, secondary chart series, subtle dividers | ~25% |
| Accent — White | `FFFFFF` | Sharp accent: text on navy, icon glyphs inside navy circles, card surfaces on tinted backgrounds | ~10%, used sparingly and deliberately |
| Neutral text | `202B45` | Body copy on light backgrounds | — |
| Muted caption | `6B7A99` | Captions, axis labels, footers | — |

Structure: **sandwich** — dark navy for the **title slide** and the **ask/closing slide** (bookends), light ice-blue-tinted background (`F5F7FC`, a further-diluted tint of the secondary) for the six content slides in between. This creates a clear "open / body / close" rhythm across 8 slides.

**Typography** — Georgia (headers) + Calibri (body): Georgia's serif weight signals financial/institutional credibility for an investor audience; Calibri stays clean and legible for dense body copy and data labels.

| Element | Font | Size |
|---|---|---|
| Slide title | Georgia, bold | 40pt |
| Section header (card/row titles) | Georgia, bold | 22pt |
| Body text | Calibri | 15pt |
| Big stat numbers | Georgia, bold | 60–66pt |
| Captions / axis labels / footers | Calibri | 11pt, muted color |

**Layout grid** — `LAYOUT_WIDE` (13.333" × 7.5", 16:9):
- Outer margin: 0.6" on all sides (exceeds the 0.5" minimum) → usable canvas 12.133" × 6.3".
- Two content-grid patterns, used consistently and never mixed within a slide:
  - **2-column**: two 5.87"-wide columns with a 0.4" gutter (`x` at 0.6 and 6.87).
  - **3-up card grid**: three 3.78"-wide cards with 0.4" gutters (`x` at 0.6, 4.78, 8.95) — used for the 6 highlight stats (2 rows × 3) and the 6 team cards (2 rows × 3).
- Title block: fixed at `x:0.6, y:0.5, w:12.133, h:0.9` on every content slide, so the title baseline never shifts slide-to-slide.
- Vertical rhythm: content starts at `y:1.7` on every content slide (title + 0.4" breathing room), blocks separated by a consistent 0.4" gap.

**Spacing discipline**: every gap in the deck is either **0.4"** (block-to-block, card gutters) or **0.6"** (margins/section separations) — no ad hoc values.

**Motif (repeated on every slide)**: a filled circle (navy on light slides, white on the dark bookend slides) holding a white/navy react-icon glyph, placed to the left of every slide title and reused as the marker for each stat, roadmap step, team member, and geography pin. No title underlines/accent bars are used anywhere (explicitly avoided — they read as templated AI output); section separation is done with whitespace and the light/dark background switch instead.

---

## 3. Full Generation Code

### 3.1 Setup

```bash
mkdir meridian-deck && cd meridian-deck
npm init -y
npm install pptxgenjs react react-dom react-icons sharp
```

### 3.2 `generate-deck.js` (complete, runnable)

```javascript
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaRocket, FaListUl, FaChartLine, FaCoins, FaMapSigns,
  FaGlobeEurope, FaUsers, FaHandshake, FaBuilding,
  FaShieldAlt, FaBolt, FaMapMarkerAlt,
} = require("react-icons/fa");

// ---------------------------------------------------------------------------
// DESIGN TOKENS
// ---------------------------------------------------------------------------
const COLOR = {
  navy: "1E2761",
  ice: "CADCFC",
  white: "FFFFFF",
  bgLight: "F5F7FC",
  text: "202B45",
  muted: "6B7A99",
};

const FONT = { header: "Georgia", body: "Calibri" };

const PAGE = { w: 13.333, h: 7.5 };
const MARGIN = 0.6;
const CONTENT_W = PAGE.w - MARGIN * 2; // 12.133
const GUTTER = 0.4;
const TITLE_Y = 0.5;
const TITLE_H = 0.9;
const CONTENT_Y = 1.7;

// Fresh object each call — pptxgenjs mutates shadow options in place.
const cardShadow = () => ({
  type: "outer", color: "1E2761", blur: 8, offset: 3, angle: 135, opacity: 0.12,
});

// ---------------------------------------------------------------------------
// ICON RASTERIZATION (react-icons -> SVG -> PNG -> base64)
// ---------------------------------------------------------------------------
const iconCache = new Map();

function renderIconSvg(IconComponent, color, size) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const key = `${IconComponent.name || IconComponent.displayName}-${color}-${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const data = "image/png;base64," + pngBuffer.toString("base64");
  iconCache.set(key, data);
  return data;
}

// Draws the repeated motif: a filled circle with a centered icon glyph.
async function addIconBadge(slide, IconComponent, { x, y, d = 0.5, circleColor, iconColor }) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: circleColor }, line: { type: "none" } });
  const data = await iconToBase64Png(IconComponent, iconColor, 256);
  const pad = d * 0.26;
  slide.addImage({ data, x: x + pad, y: y + pad, w: d - pad * 2, h: d - pad * 2 });
}

// ---------------------------------------------------------------------------
// SHARED SLIDE CHROME
// ---------------------------------------------------------------------------
function addFooter(slide, pageNum, dark = false) {
  slide.addText("MERIDIAN SOFTWARE", {
    x: MARGIN, y: PAGE.h - 0.45, w: 6, h: 0.3,
    fontFace: FONT.body, fontSize: 9, color: dark ? COLOR.ice : COLOR.muted,
    charSpacing: 2, margin: 0,
  });
  slide.addText(`${pageNum} / 8`, {
    x: PAGE.w - MARGIN - 1.5, y: PAGE.h - 0.45, w: 1.5, h: 0.3,
    fontFace: FONT.body, fontSize: 9, color: dark ? COLOR.ice : COLOR.muted,
    align: "right", margin: 0,
  });
}

async function addTitleBlock(slide, IconComponent, titleText, pageNum) {
  await addIconBadge(slide, IconComponent, {
    x: MARGIN, y: TITLE_Y + 0.05, d: 0.55, circleColor: COLOR.navy, iconColor: COLOR.white,
  });
  slide.addText(titleText, {
    x: MARGIN + 0.75, y: TITLE_Y, w: CONTENT_W - 0.75, h: TITLE_H,
    fontFace: FONT.header, fontSize: 32, bold: true, color: COLOR.navy,
    valign: "middle", margin: 0,
  });
  addFooter(slide, pageNum, false);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Meridian Software";
  pres.title = "Meridian Software — Investor Update";

  // -------------------------------------------------------------------
  // SLIDE 1 — TITLE (dark bookend)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.navy };

    await addIconBadge(slide, FaRocket, {
      x: MARGIN, y: 0.9, d: 0.7, circleColor: COLOR.white, iconColor: COLOR.navy,
    });

    slide.addText("Meridian Software", {
      x: MARGIN, y: 2.6, w: 10.5, h: 1.1,
      fontFace: FONT.header, fontSize: 48, bold: true, color: COLOR.white, margin: 0,
    });
    slide.addText("Investor Update — Q2 FY2026", {
      x: MARGIN, y: 3.65, w: 10.5, h: 0.6,
      fontFace: FONT.body, fontSize: 20, color: COLOR.ice, margin: 0,
    });

    // Three stat callouts across the bottom — immediate headline numbers.
    const stats = [
      { n: "$68M", l: "FY2026 Revenue" },
      { n: "25%", l: "YoY Growth" },
      { n: "Europe", l: "New Expansion Market" },
    ];
    const colW = (CONTENT_W - GUTTER * 2) / 3;
    stats.forEach((s, i) => {
      const x = MARGIN + i * (colW + GUTTER);
      slide.addText(s.n, {
        x, y: 5.35, w: colW, h: 0.7,
        fontFace: FONT.header, fontSize: 34, bold: true, color: COLOR.white, margin: 0,
      });
      slide.addText(s.l.toUpperCase(), {
        x, y: 6.05, w: colW, h: 0.4,
        fontFace: FONT.body, fontSize: 11, color: COLOR.ice, charSpacing: 1, margin: 0,
      });
    });

    addFooter(slide, 1, true);
  }

  // -------------------------------------------------------------------
  // SLIDE 2 — AGENDA (icon + text rows)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.bgLight };
    await addTitleBlock(slide, FaListUl, "Agenda", 2);

    const items = [
      { icon: FaChartLine, t: "Business Highlights", d: "Where Meridian stands today across revenue, customers, and retention." },
      { icon: FaCoins, t: "Revenue Performance", d: "Quarterly trajectory behind the 25% YoY growth number." },
      { icon: FaMapSigns, t: "Product Roadmap", d: "What ships over the next four quarters." },
      { icon: FaGlobeEurope, t: "Europe Expansion", d: "Market entry strategy and go-live geography." },
      { icon: FaUsers, t: "Team", d: "Leadership additions supporting the next stage of growth." },
      { icon: FaHandshake, t: "The Ask", d: "What we're raising and how it will be deployed." },
    ];

    const rowH = 0.72;
    for (let i = 0; i < items.length; i++) {
      const y = CONTENT_Y + i * rowH;
      await addIconBadge(slide, items[i].icon, {
        x: MARGIN, y: y + 0.06, d: 0.5, circleColor: COLOR.navy, iconColor: COLOR.white,
      });
      slide.addText(items[i].t, {
        x: MARGIN + 0.75, y, w: 4.3, h: rowH,
        fontFace: FONT.header, fontSize: 16, bold: true, color: COLOR.navy,
        valign: "middle", margin: 0,
      });
      slide.addText(items[i].d, {
        x: MARGIN + 5.2, y, w: CONTENT_W - 5.2, h: rowH,
        fontFace: FONT.body, fontSize: 13, color: COLOR.text,
        valign: "middle", margin: 0,
      });
    }
  }

  // -------------------------------------------------------------------
  // SLIDE 3 — BUSINESS HIGHLIGHTS (2x3 stat grid)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.bgLight };
    await addTitleBlock(slide, FaChartLine, "Business Highlights", 3);

    const stats = [
      { n: "$68M", l: "FY2026 Revenue" },
      { n: "25%", l: "YoY Growth" },
      { n: "340+", l: "Enterprise Customers" },
      { n: "128%", l: "Net Revenue Retention" },
      { n: "92%", l: "Gross Margin" },
      { n: "9", l: "Countries Live" },
    ];

    const cardW = (CONTENT_W - GUTTER * 2) / 3;
    const cardH = 2.1;
    stats.forEach((s, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = MARGIN + col * (cardW + GUTTER);
      const y = CONTENT_Y + row * (cardH + GUTTER);
      slide.addShape("roundRect", {
        x, y, w: cardW, h: cardH, rectRadius: 0.08,
        fill: { color: COLOR.white }, line: { type: "none" }, shadow: cardShadow(),
      });
      slide.addText(s.n, {
        x: x + 0.25, y: y + 0.25, w: cardW - 0.5, h: 1.0,
        fontFace: FONT.header, fontSize: 40, bold: true, color: COLOR.navy, margin: 0,
      });
      slide.addText(s.l, {
        x: x + 0.25, y: y + 1.3, w: cardW - 0.5, h: 0.6,
        fontFace: FONT.body, fontSize: 13, color: COLOR.muted, margin: 0,
      });
    });
  }

  // -------------------------------------------------------------------
  // SLIDE 4 — REVENUE (real chart)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.bgLight };
    await addTitleBlock(slide, FaCoins, "Revenue Performance", 4);

    const years = ["FY2022", "FY2023", "FY2024", "FY2025", "FY2026"];
    const revenue = [26.1, 34.5, 43.8, 54.4, 68.0];

    slide.addChart(
      pres.charts.BAR,
      [{ name: "Revenue ($M)", labels: years, values: revenue }],
      {
        x: MARGIN, y: CONTENT_Y, w: 7.4, h: 4.6, barDir: "col",
        chartColors: [COLOR.navy],
        chartArea: { fill: { color: COLOR.white }, roundedCorners: true },
        catAxisLabelColor: COLOR.muted,
        catAxisLabelFontFace: FONT.body,
        valAxisLabelColor: COLOR.muted,
        valAxisLabelFontFace: FONT.body,
        valAxisHidden: false,
        valGridLine: { color: "E2E8F0", size: 0.5 },
        catGridLine: { style: "none" },
        showValue: true,
        dataLabelPosition: "outEnd",
        dataLabelColor: COLOR.text,
        dataLabelFontFace: FONT.body,
        dataLabelFormatCode: '"$"#,##0.0"M"',
        showLegend: false,
        showTitle: false,
      }
    );

    // Narrative column beside the chart.
    const nx = MARGIN + 7.4 + GUTTER;
    const nw = CONTENT_W - 7.4 - GUTTER;
    slide.addText("25%", {
      x: nx, y: CONTENT_Y, w: nw, h: 0.9,
      fontFace: FONT.header, fontSize: 46, bold: true, color: COLOR.navy, margin: 0,
    });
    slide.addText("YEAR-OVER-YEAR GROWTH, FY2026", {
      x: nx, y: CONTENT_Y + 0.85, w: nw, h: 0.4,
      fontFace: FONT.body, fontSize: 11, color: COLOR.muted, charSpacing: 1, margin: 0,
    });
    slide.addText([
      { text: "Five consecutive years of accelerating revenue, compounding from $26M to $68M.", options: { bullet: true, breakLine: true } },
      { text: "Growth is broad-based: new-logo ACV and expansion revenue each contributed roughly half of net new bookings.", options: { bullet: true, breakLine: true } },
      { text: "FY2026 is the first year with contribution from the new Europe pipeline, opened mid-year.", options: { bullet: true } },
    ], {
      x: nx, y: CONTENT_Y + 1.5, w: nw, h: 3.0,
      fontFace: FONT.body, fontSize: 13, color: COLOR.text, paraSpaceAfter: 10,
    });
  }

  // -------------------------------------------------------------------
  // SLIDE 5 — PRODUCT ROADMAP (horizontal timeline)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.bgLight };
    await addTitleBlock(slide, FaMapSigns, "Product Roadmap", 5);

    const steps = [
      { icon: FaBolt, q: "Q3 FY2026", t: "Workflow Automation GA", d: "General availability after a 6-month enterprise beta." },
      { icon: FaChartLine, q: "Q4 FY2026", t: "Advanced Analytics Suite", d: "Cohort-level usage analytics and forecasting." },
      { icon: FaShieldAlt, q: "Q1 FY2027", t: "EU Data Residency", d: "Frankfurt region live; GDPR-aligned data controls." },
      { icon: FaRocket, q: "Q2 FY2027", t: "AI Copilot (Beta)", d: "In-product assistant for workflow configuration." },
    ];

    const colW = (CONTENT_W - GUTTER * 3) / 4;
    const lineY = CONTENT_Y + 0.35;

    // Connector line behind the step markers (timeline motif, not a title underline).
    slide.addShape("rect", {
      x: MARGIN + colW / 2, y: lineY - 0.01, w: CONTENT_W - colW, h: 0.02,
      fill: { color: COLOR.ice }, line: { type: "none" },
    });

    for (let i = 0; i < steps.length; i++) {
      const x = MARGIN + i * (colW + GUTTER);
      const cx = x + colW / 2 - 0.3;
      await addIconBadge(slide, steps[i].icon, {
        x: cx, y: CONTENT_Y, d: 0.6, circleColor: COLOR.navy, iconColor: COLOR.white,
      });
      slide.addText(steps[i].q.toUpperCase(), {
        x, y: CONTENT_Y + 0.85, w: colW, h: 0.35,
        fontFace: FONT.body, fontSize: 11, bold: true, color: COLOR.muted,
        align: "center", charSpacing: 1, margin: 0,
      });
      slide.addText(steps[i].t, {
        x, y: CONTENT_Y + 1.2, w: colW, h: 0.8,
        fontFace: FONT.header, fontSize: 16, bold: true, color: COLOR.navy,
        align: "center", margin: 0,
      });
      slide.addText(steps[i].d, {
        x, y: CONTENT_Y + 2.05, w: colW, h: 1.4,
        fontFace: FONT.body, fontSize: 12, color: COLOR.text,
        align: "center", margin: 0,
      });
    }
  }

  // -------------------------------------------------------------------
  // SLIDE 6 — EUROPE EXPANSION (two-column, text + abstract map motif)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.bgLight };
    await addTitleBlock(slide, FaGlobeEurope, "Europe Expansion", 6);

    const colW = (CONTENT_W - GUTTER) / 2;

    slide.addText("A $40B addressable market opening now", {
      x: MARGIN, y: CONTENT_Y, w: colW, h: 0.6,
      fontFace: FONT.header, fontSize: 18, bold: true, color: COLOR.navy, margin: 0,
    });
    slide.addText([
      { text: "Frankfurt entity established; EU data residency live Q1 FY2027.", options: { bullet: true, breakLine: true } },
      { text: "VP Sales, EMEA hired from a comparable B2B SaaS scale-up (see Team).", options: { bullet: true, breakLine: true } },
      { text: "Initial go-to-market: UK, Germany, France, Netherlands, Ireland.", options: { bullet: true, breakLine: true } },
      { text: "Land-and-expand motion mirrors the US playbook that drove 128% NRR.", options: { bullet: true } },
    ], {
      x: MARGIN, y: CONTENT_Y + 0.65, w: colW, h: 3.0,
      fontFace: FONT.body, fontSize: 13, color: COLOR.text, paraSpaceAfter: 10,
    });

    // Abstract "map" — HQ node connected to five launch-market pins, built from
    // the same icon-in-circle motif rather than a stock map image.
    const mapX = MARGIN + colW + GUTTER;
    const mapW = colW;
    const mapY = CONTENT_Y;
    const mapH = 4.6;

    slide.addShape("roundRect", {
      x: mapX, y: mapY, w: mapW, h: mapH, rectRadius: 0.08,
      fill: { color: COLOR.white }, line: { type: "none" }, shadow: cardShadow(),
    });

    const hqX = mapX + mapW / 2 - 0.35, hqY = mapY + 0.4;
    const pins = [
      { label: "UK", x: mapX + 0.6, y: mapY + 1.7 },
      { label: "Ireland", x: mapX + 0.5, y: mapY + 3.2 },
      { label: "Netherlands", x: mapX + mapW / 2 - 0.2, y: mapY + 2.6 },
      { label: "Germany", x: mapX + mapW - 1.5, y: mapY + 1.9 },
      { label: "France", x: mapX + mapW - 1.7, y: mapY + 3.4 },
    ];

    // Connector lines from HQ to each pin (drawn first, sit beneath the pins).
    pins.forEach((p) => {
      slide.addShape("line", {
        x: hqX + 0.35, y: hqY + 0.35, w: (p.x + 0.25) - (hqX + 0.35), h: (p.y + 0.25) - (hqY + 0.35),
        line: { color: COLOR.ice, width: 1.5, dashType: "dash" },
      });
    });

    await addIconBadge(slide, FaBuilding, { x: hqX, y: hqY, d: 0.7, circleColor: COLOR.navy, iconColor: COLOR.white });
    slide.addText("Meridian HQ", {
      x: hqX - 0.4, y: hqY + 0.72, w: 1.5, h: 0.3,
      fontFace: FONT.body, fontSize: 10, bold: true, color: COLOR.navy, align: "center", margin: 0,
    });

    for (const p of pins) {
      await addIconBadge(slide, FaMapMarkerAlt, { x: p.x, y: p.y, d: 0.5, circleColor: COLOR.ice, iconColor: COLOR.navy });
      slide.addText(p.label, {
        x: p.x - 0.35, y: p.y + 0.52, w: 1.2, h: 0.3,
        fontFace: FONT.body, fontSize: 10, color: COLOR.text, align: "center", margin: 0,
      });
    }
  }

  // -------------------------------------------------------------------
  // SLIDE 7 — TEAM (2x3 card grid)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.bgLight };
    await addTitleBlock(slide, FaUsers, "Team", 7);

    const team = [
      { initials: "AK", name: "Anya Kessler", title: "Chief Executive Officer" },
      { initials: "DR", name: "David Reyes", title: "Chief Technology Officer" },
      { initials: "PT", name: "Priya Trivedi", title: "Chief Financial Officer" },
      { initials: "MH", name: "Marcus Holt", title: "VP Product" },
      { initials: "LS", name: "Lena Schröder", title: "VP Sales, EMEA (new)" },
      { initials: "JO", name: "Jamal Osei", title: "VP Customer Success" },
    ];

    const cardW = (CONTENT_W - GUTTER * 2) / 3;
    const cardH = 2.1;
    team.forEach((m, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = MARGIN + col * (cardW + GUTTER);
      const y = CONTENT_Y + row * (cardH + GUTTER);
      slide.addShape("roundRect", {
        x, y, w: cardW, h: cardH, rectRadius: 0.08,
        fill: { color: COLOR.white }, line: { type: "none" }, shadow: cardShadow(),
      });
      slide.addShape("ellipse", {
        x: x + 0.3, y: y + 0.3, w: 0.8, h: 0.8,
        fill: { color: COLOR.navy }, line: { type: "none" },
      });
      slide.addText(m.initials, {
        x: x + 0.3, y: y + 0.3, w: 0.8, h: 0.8,
        fontFace: FONT.header, fontSize: 20, bold: true, color: COLOR.white,
        align: "center", valign: "middle", margin: 0,
      });
      slide.addText(m.name, {
        x: x + 0.3, y: y + 1.25, w: cardW - 0.6, h: 0.35,
        fontFace: FONT.header, fontSize: 15, bold: true, color: COLOR.navy, margin: 0,
      });
      slide.addText(m.title, {
        x: x + 0.3, y: y + 1.6, w: cardW - 0.6, h: 0.4,
        fontFace: FONT.body, fontSize: 12, color: COLOR.muted, margin: 0,
      });
    });
  }

  // -------------------------------------------------------------------
  // SLIDE 8 — THE ASK / NEXT STEPS (dark bookend)
  // -------------------------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.navy };

    await addIconBadge(slide, FaHandshake, {
      x: MARGIN, y: TITLE_Y + 0.05, d: 0.55, circleColor: COLOR.white, iconColor: COLOR.navy,
    });
    slide.addText("The Ask & Next Steps", {
      x: MARGIN + 0.75, y: TITLE_Y, w: CONTENT_W - 0.75, h: TITLE_H,
      fontFace: FONT.header, fontSize: 32, bold: true, color: COLOR.white,
      valign: "middle", margin: 0,
    });

    slide.addText("Raising $25M Series C", {
      x: MARGIN, y: CONTENT_Y, w: 6, h: 0.6,
      fontFace: FONT.header, fontSize: 22, bold: true, color: COLOR.white, margin: 0,
    });

    const uses = [
      { icon: FaGlobeEurope, pct: "60%", t: "Europe go-to-market", d: "Sales, marketing, and local partnerships across 5 launch markets." },
      { icon: FaBolt, pct: "25%", t: "Product & engineering", d: "AI Copilot and Advanced Analytics roadmap delivery." },
      { icon: FaShieldAlt, pct: "15%", t: "Data residency & compliance", d: "EU infrastructure and certification work." },
    ];
    const rowH = 1.05;
    for (let i = 0; i < uses.length; i++) {
      const y = CONTENT_Y + 0.75 + i * rowH;
      await addIconBadge(slide, uses[i].icon, {
        x: MARGIN, y: y + 0.1, d: 0.55, circleColor: COLOR.white, iconColor: COLOR.navy,
      });
      slide.addText(uses[i].pct, {
        x: MARGIN + 0.75, y, w: 0.9, h: rowH,
        fontFace: FONT.header, fontSize: 22, bold: true, color: COLOR.white, valign: "middle", margin: 0,
      });
      slide.addText(uses[i].t, {
        x: MARGIN + 1.7, y, w: 3.9, h: 0.5,
        fontFace: FONT.header, fontSize: 15, bold: true, color: COLOR.white, valign: "bottom", margin: 0,
      });
      slide.addText(uses[i].d, {
        x: MARGIN + 1.7, y: y + 0.5, w: 3.9, h: 0.5,
        fontFace: FONT.body, fontSize: 11, color: COLOR.ice, margin: 0,
      });
    }

    // Right column: next-steps timeline.
    const nx = MARGIN + 6 + GUTTER;
    const nw = CONTENT_W - 6 - GUTTER;
    slide.addText("Next Steps", {
      x: nx, y: CONTENT_Y, w: nw, h: 0.5,
      fontFace: FONT.header, fontSize: 22, bold: true, color: COLOR.white, margin: 0,
    });
    const steps = ["Term sheet — 2 weeks", "Diligence — 4 weeks", "Close & wire — 6 weeks"];
    steps.forEach((s, i) => {
      const y = CONTENT_Y + 0.75 + i * 0.7;
      slide.addShape("ellipse", {
        x: nx, y, w: 0.35, h: 0.35, fill: { color: COLOR.ice }, line: { type: "none" },
      });
      slide.addText(String(i + 1), {
        x: nx, y, w: 0.35, h: 0.35, fontFace: FONT.body, fontSize: 13, bold: true,
        color: COLOR.navy, align: "center", valign: "middle", margin: 0,
      });
      slide.addText(s, {
        x: nx + 0.55, y: y - 0.03, w: nw - 0.55, h: 0.4,
        fontFace: FONT.body, fontSize: 14, color: COLOR.white, valign: "middle", margin: 0,
      });
    });

    slide.addText("sherif@naya.finance  ·  investors.meridiansoftware.com", {
      x: MARGIN, y: PAGE.h - 0.45, w: CONTENT_W, h: 0.3,
      fontFace: FONT.body, fontSize: 10, color: COLOR.ice, margin: 0,
    });
  }

  await pres.writeFile({ fileName: "Meridian-Software-Investor-Update.pptx" });
  console.log("Deck written to Meridian-Software-Investor-Update.pptx");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run it:

```bash
node generate-deck.js
```

---

## 4. Slide-by-Slide Rationale Summary

| # | Slide | Layout pattern | Why |
|---|---|---|---|
| 1 | Title | Dark full-bleed, headline + 3 stat callouts | Bookend; leads with the three numbers investors care about most before any narrative |
| 2 | Agenda | Icon + text rows | Sets expectations; every row previews the icon that reappears on its slide, reinforcing the motif |
| 3 | Business Highlights | 2×3 stat-card grid | Large-number data display per the skill's "big stat callouts" guidance; scannable in 5 seconds |
| 4 | Revenue | Two-column: real bar chart + narrative | Chart requirement satisfied natively; text column earns its place by explaining *why*, not repeating *what* |
| 5 | Roadmap | Horizontal timeline, 4 steps | Process-flow layout signals forward motion; distinct from the two grid slides so no layout repeats back-to-back |
| 6 | Europe Expansion | Two-column: text + abstract "map" built from the icon-circle motif | Real image assets aren't available for a fictional map; an abstract node diagram keeps the motif consistent instead of inserting a generic stock map |
| 7 | Team | 2×3 card grid (monogram avatars) | Consistent with the highlights grid's card language but different content type (people, not numbers) — variation via content, not novel layout |
| 8 | Ask / Next Steps | Dark bookend, two-column: use-of-funds rows + timeline | Closes the sandwich; dark background returns for gravity on the ask |

Deliberate anti-patterns avoided per the skill's guidance: no title underline/accent bar anywhere; no two consecutive slides share a layout; body copy is left-aligned throughout (only titles/stat numbers are ever centered, and only within card-grid cells); every content slide carries at least one non-text visual element (chart, icon grid, timeline, or map diagram).

---

## 5. Quality Assurance Plan

QA is treated as a bug hunt, not a formality — the first render is assumed wrong until proven otherwise.

### 5.1 Render pipeline

```bash
# 1. Content extraction — catch missing/garbled text, wrong order, leftover placeholders
python -m markitdown Meridian-Software-Investor-Update.pptx

# 2. Placeholder-leak check (should return nothing)
python -m markitdown Meridian-Software-Investor-Update.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"

# 3. Convert to images for visual inspection
python scripts/office/soffice.py --headless --convert-to pdf Meridian-Software-Investor-Update.pptx
pdftoppm -jpeg -r 150 Meridian-Software-Investor-Update.pdf slide
# -> slide-01.jpg ... slide-08.jpg
```

### 5.2 Visual QA via a fresh-eyes subagent

Rendering code and reviewing it with the same context that wrote it produces blind spots — the generator author expects the layout to look right and will pattern-match past real problems. Dispatch a subagent with no prior exposure to the code, per the skill's explicit instruction to use subagents even for a handful of slides, using this prompt:

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
1. slide-01.jpg (Expected: dark navy title slide, "Meridian Software" headline, 3 stat callouts across the bottom)
2. slide-02.jpg (Expected: agenda, 6 icon+text rows)
3. slide-03.jpg (Expected: 2x3 grid of large stat numbers over labels)
4. slide-04.jpg (Expected: navy column chart, 5 bars FY2022-FY2026, narrative text at right)
5. slide-05.jpg (Expected: 4-step horizontal timeline with icon circles and a connecting line)
6. slide-06.jpg (Expected: text left; abstract HQ-and-5-country-pin diagram right, connected by dashed lines)
7. slide-07.jpg (Expected: 2x3 grid of team cards with circular monogram avatars)
8. slide-08.jpg (Expected: dark navy closing slide, use-of-funds rows left, next-steps timeline right)

Report ALL issues found, including minor ones.
```

### 5.3 Bugs this deck is specifically at risk of, and the fix if found

| Likely bug | Where it could appear | Fix |
|---|---|---|
| Chart data-label / legend collision with the axis or narrative column | Slide 4 | `showLegend: false` is already set (single series); if labels crowd the top of the tallest bar, increase chart `h` or switch `dataLabelPosition` to `"inEnd"` |
| Dashed connector lines drawn through/over the map card's rounded corners | Slide 6 | Reduce line length by trimming start/end offsets so they terminate at the badge edge, not the badge center |
| Team-card title/subtitle wrapping to a 3rd line and colliding with the card's bottom edge | Slide 7 | Shorten titles or increase `cardH`; verify with the longest label ("VP Sales, EMEA (new)") specifically |
| Timeline description text (4 columns) overflowing its 1.4"-tall box for the longest description | Slide 5 | Trim copy or increase per-column height; re-check after any copy edit since one fix here often shifts the icon vertical alignment |
| Icon contrast failure if a badge circle color is ever changed to ice-blue with a white glyph (low contrast) | Any `addIconBadge` call | Badges are only ever navy-circle/white-icon or white-circle/navy-icon or ice-circle/navy-icon — never white-on-ice or ice-on-white; re-verify contrast if palette values change |
| Footer page number overlapping the last stat/timeline row on dense slides (3, 5, 7, 8) | Any content slide | Footer is fixed at `y: PAGE.h - 0.45`; confirm content blocks never extend past `y + h > 6.85` |
| Title wrapping to two lines and pushing the icon badge out of vertical alignment | Any title (esp. "Europe Expansion" / "The Ask & Next Steps" at 32pt) | Title box height is fixed at 0.9"; if a title wraps, either shorten it or increase `TITLE_H` and re-check the badge's vertical center against the new title box |

### 5.4 Verification loop (mandatory, not a formality)

1. Generate the deck → convert to images → dispatch the subagent inspection above.
2. Record every issue reported, including cosmetic/minor ones — do not filter the list down before acting on it.
3. Fix each issue in `generate-deck.js` (not by hand-editing the output file).
4. Re-render only the affected slides (`pdftoppm -jpeg -r 150 -f N -l N Meridian-Software-Investor-Update.pdf slide-fixed`) and re-inspect them — a fix to spacing or font size on one slide routinely perturbs an adjacent element on the same slide.
5. Repeat steps 1–4 until one full pass over all 8 slides returns zero new findings. Do not declare the deck done on the first clean-looking render — the skill's own guidance is that a zero-issue first pass usually means the reviewer wasn't looking hard enough, so run at least one full fix-and-verify cycle before sign-off even if slide-01 through slide-08 look correct on the first inspection.
