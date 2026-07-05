# Meridian Software — Investor Update Deck (8 slides)

Fictional company: **Meridian Software** — B2B SaaS, $68M ARR, 25% YoY growth, expanding into Europe.

---

## 1. Approach Selection & Justification

There is no existing presentation, brand template, or reference deck to build from — this is a
net-new deck for a fictional company. Per the pptx skill's approach-selection guidance:

- **Editing/templating an existing deck** applies only when a template or reference `.pptx`
  already exists to unpack, edit, and repack. That doesn't apply here — nothing exists yet.
- **Creating from scratch (PptxGenJS)** is the correct approach when no template is available,
  which is exactly this situation.

So the generation approach is **PptxGenJS**, targeting `LAYOUT_WIDE` (13.333" × 7.5", modern
16:9 widescreen — the format investors expect on a projector or a laptop screen, and it gives
more horizontal room for a two-column body layout than the default `LAYOUT_16x9`).

A second approach decision concerns the revenue slide specifically: the task requires "a real
chart, not an image placeholder." PptxGenJS's native `addChart()` renders an actual OOXML chart
object embedded in the pptx (backed by real chart XML, not a bitmap) — it stays editable inside
PowerPoint/Keynote (colors, data, axis labels can all be tweaked after the fact) and remains
crisp at any zoom level. An image render of a chart (e.g., a matplotlib PNG pasted in) would
satisfy "shows a chart visually" but fails "real chart" — the data wouldn't be inspectable or
editable in the output file. This deck therefore uses `pres.charts.BAR` with real quarterly ARR
data, not a picture of a chart.

Icons are generated as rasterized PNGs from `react-icons` (via `react-dom/server` + `sharp`)
rather than picked from clip-art, so every icon matches the deck's palette exactly and stays
crisp at any resolution.

---

## 2. Design Rationale

### Palette — "Meridian Navy"

A palette built for *this* deck (a growth-stage enterprise SaaS company raising a European
expansion round), not a generic corporate-blue default:

| Role | Hex | Usage | Weight |
|------|-----|-------|--------|
| Primary — Deep Navy | `1B2A4A` | Title/closing slide backgrounds, headers, primary text on light bg | ~65% (dominant) |
| Secondary — Ice Blue | `D8E3F0` | Content-slide backgrounds, subtle card fills, chart gridline tint | ~25% (supporting) |
| Accent — Amber | `E8763C` | One accent only: current-quarter bar, stat highlights, "raise" callout, agenda numerals | ~10% (sharp accent) |
| Neutral text | `2D3748` | Body copy on light backgrounds | — |
| Muted / captions | `64748B` | Axis labels, footnotes, captions | — |
| Card white | `FFFFFF` | Card surfaces on light slides | — |

Navy dominates because Meridian is an enterprise SaaS vendor selling trust and stability to
investors; amber is reserved strictly for "look here" moments (growth %, the ask, the current
quarter) so it never competes with itself. Dark navy backgrounds bookend the deck (title slide +
closing ask slide) and every content slide in between uses the light ice-blue/white surface —
the classic dark→light→dark "sandwich" structure.

### Typography

Header font **Cambria** (bold) paired with body font **Calibri** — Cambria reads as
substantial/serif-credible for a company talking about revenue and fundraising, Calibri keeps
body copy clean and highly legible in dense stat/bullet slides.

| Element | Size | Weight |
|---|---|---|
| Slide title | 40pt | bold |
| Section header / card header | 22pt | bold |
| Body text | 15pt | regular |
| Stat numerals | 54–60pt | bold (accent or navy) |
| Captions / axis labels / footer | 11pt | regular, muted color |

### Layout grid & spacing

- Canvas: `LAYOUT_WIDE` → 13.333" × 7.5".
- Outer margin: 0.5" on all four sides on every slide (content area x: 0.5–12.83").
- Inter-block gap: a single consistent 0.4" used for all gutters between cards/columns — never
  mixed with 0.3" or 0.5" elsewhere, per the "don't mix spacing randomly" rule.
- Footer band: reserved 0.35" strip at y = 7.05" on content slides (company name + page number),
  kept clear of body content.
- Two-column slides split 55/45 (text column wider than the visual column) with the 0.4" gutter
  between.

### Visual motif

Two repeated elements carry through every slide:
1. **Icon-in-a-navy-circle** — every section/card leads with a small circular navy badge
   containing a white icon (agenda items, stat cards, roadmap steps, ask bullets).
2. **Thick single-side left accent bar** on card surfaces (a plain `RECTANGLE`, not paired with
   rounded corners — see Common Pitfalls below) instead of an underline. Titles are **never**
   underlined with an accent line (a well-known AI-slide tell) — separation comes from
   whitespace and the navy/ice-blue background swap instead.

---

## 3. Complete Generation Code

### Dependencies

```bash
npm install -g pptxgenjs react react-dom sharp react-icons
```

### `generate-deck.js` (complete, runnable)

```javascript
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaChartLine, FaMoneyBillWave, FaRoute, FaGlobeEurope, FaUsers, FaHandshake,
  FaDollarSign, FaSyncAlt, FaUserFriends, FaRocket, FaCogs, FaBrain, FaGlobe,
  FaMapMarkerAlt, FaBuilding, FaBullseye, FaCalendarCheck,
} = require("react-icons/fa");

// ---------------------------------------------------------------------------
// Palette / type constants ("Meridian Navy")
// ---------------------------------------------------------------------------
const NAVY = "1B2A4A";
const ICE = "D8E3F0";
const AMBER = "E8763C";
const TEXT = "2D3748";
const MUTED = "64748B";
const WHITE = "FFFFFF";

const HEADER_FONT = "Cambria";
const BODY_FONT = "Calibri";

const MARGIN = 0.5;
const GAP = 0.4;
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const CONTENT_W = SLIDE_W - MARGIN * 2; // 12.333

// ---------------------------------------------------------------------------
// Icon rendering (react-icons -> SVG -> PNG, base64) — one navy circle badge
// ---------------------------------------------------------------------------
function renderIconSvg(IconComponent, color, size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// Fresh shadow object each call — PptxGenJS mutates option objects in place,
// so a shared object would corrupt the second and later shapes that reuse it.
function cardShadow() {
  return { type: "outer", color: "1B2A4A", blur: 8, offset: 3, angle: 135, opacity: 0.12 };
}

// Icon badge: navy circle + centered white icon image
async function addIconBadge(slide, iconData, x, y, d = 0.55) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: NAVY }, line: { type: "none" } });
  const inset = d * 0.28;
  slide.addImage({ data: iconData, x: x + inset / 2, y: y + inset / 2, w: d - inset, h: d - inset });
}

// Left accent bar + white card body (RECTANGLE only — never pair a straight
// accent bar with ROUNDED_RECTANGLE, the corners won't be covered)
function addCard(slide, x, y, w, h, accentColor = AMBER) {
  slide.addShape(pptxgen.ShapeType.rect, {
    x, y, w, h, fill: { color: WHITE }, line: { type: "none" }, shadow: cardShadow(),
  });
  slide.addShape(pptxgen.ShapeType.rect, {
    x, y, w: 0.08, h, fill: { color: accentColor }, line: { type: "none" },
  });
}

function addFooter(slide, pageNum) {
  slide.addText("MERIDIAN SOFTWARE — INVESTOR UPDATE", {
    x: MARGIN, y: 7.05, w: 8, h: 0.3, fontFace: BODY_FONT, fontSize: 9,
    color: MUTED, charSpacing: 2, margin: 0,
  });
  slide.addText(String(pageNum), {
    x: SLIDE_W - MARGIN - 0.5, y: 7.05, w: 0.5, h: 0.3, fontFace: BODY_FONT,
    fontSize: 9, color: MUTED, align: "right", margin: 0,
  });
}

// ---------------------------------------------------------------------------
async function build() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Meridian Software";
  pres.title = "Meridian Software — Investor Update";

  // Pre-render every icon once (fresh base64 strings, safe to reuse as data)
  const icon = {};
  const iconSpecs = {
    chart: [FaChartLine, WHITE], money: [FaMoneyBillWave, WHITE], route: [FaRoute, WHITE],
    globe: [FaGlobeEurope, WHITE], users: [FaUsers, WHITE], handshake: [FaHandshake, WHITE],
    dollar: [FaDollarSign, WHITE], sync: [FaSyncAlt, WHITE], userFriends: [FaUserFriends, WHITE],
    rocket: [FaRocket, WHITE], cogs: [FaCogs, WHITE], brain: [FaBrain, WHITE],
    globeAlt: [FaGlobe, WHITE], marker: [FaMapMarkerAlt, WHITE], building: [FaBuilding, WHITE],
    bullseye: [FaBullseye, WHITE], calendarCheck: [FaCalendarCheck, WHITE],
  };
  for (const [key, [Comp, color]] of Object.entries(iconSpecs)) {
    icon[key] = await iconToBase64Png(Comp, color, 256);
  }

  // ---- Slide 1: Title -------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: NAVY };

    // Subtle geometric motif, bottom-right, behind text — pure decoration
    slide.addShape("ellipse", { x: 10.3, y: 4.2, w: 5.5, h: 5.5, fill: { color: "24365C" }, line: { type: "none" } });
    slide.addShape("ellipse", { x: 11.6, y: 5.5, w: 3.2, h: 3.2, fill: { color: "2C3F68" }, line: { type: "none" } });

    // Amber pill tag
    slide.addShape(pptxgen.ShapeType.roundRect, {
      x: MARGIN, y: 1.3, w: 2.6, h: 0.45, rectRadius: 0.22,
      fill: { color: AMBER }, line: { type: "none" },
    });
    slide.addText("SERIES C UPDATE", {
      x: MARGIN, y: 1.3, w: 2.6, h: 0.45, fontFace: BODY_FONT, fontSize: 12, bold: true,
      color: WHITE, align: "center", valign: "middle", charSpacing: 2, margin: 0,
    });

    slide.addText("Meridian Software", {
      x: MARGIN, y: 2.0, w: 9.5, h: 1.3, fontFace: HEADER_FONT, fontSize: 44, bold: true,
      color: WHITE, margin: 0,
    });
    slide.addText("Q2 2026 Investor Update", {
      x: MARGIN, y: 3.15, w: 9.5, h: 0.6, fontFace: BODY_FONT, fontSize: 20,
      color: ICE, margin: 0,
    });
    slide.addText("Scaling B2B SaaS revenue and entering the European market", {
      x: MARGIN, y: 3.75, w: 8.5, h: 0.5, fontFace: BODY_FONT, fontSize: 14, italic: true,
      color: "9FB3D1", margin: 0,
    });

    slide.addText("July 2026", {
      x: MARGIN, y: 6.6, w: 4, h: 0.35, fontFace: BODY_FONT, fontSize: 12,
      color: "9FB3D1", margin: 0,
    });
  }

  // ---- Slide 2: Agenda --------------------------------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: WHITE };
    slide.addText("Agenda", {
      x: MARGIN, y: 0.5, w: 8, h: 0.8, fontFace: HEADER_FONT, fontSize: 40, bold: true,
      color: NAVY, margin: 0,
    });

    const items = [
      ["01", icon.chart, "Business Highlights", "Where Meridian stands today"],
      ["02", icon.money, "Revenue Performance", "ARR trajectory and growth rate"],
      ["03", icon.route, "Product Roadmap", "What we're shipping next"],
      ["04", icon.globe, "Europe Expansion", "Our go-to-market plan for the EU"],
      ["05", icon.users, "Team", "The people scaling Meridian"],
      ["06", icon.handshake, "The Ask", "What we're raising and why"],
    ];

    const rowH = 0.85;
    const startY = 1.8;
    items.forEach(async ([num, ic, title, desc], i) => {
      const y = startY + i * (rowH + 0.08);
      slide.addText(num, {
        x: MARGIN, y, w: 0.7, h: rowH, fontFace: HEADER_FONT, fontSize: 26, bold: true,
        color: AMBER, valign: "middle", margin: 0,
      });
      await addIconBadge(slide, ic, MARGIN + 0.85, y + (rowH - 0.55) / 2, 0.55);
      slide.addText(title, {
        x: MARGIN + 1.65, y, w: 5.5, h: rowH * 0.55, fontFace: BODY_FONT, fontSize: 18,
        bold: true, color: TEXT, valign: "bottom", margin: 0,
      });
      slide.addText(desc, {
        x: MARGIN + 1.65, y: y + rowH * 0.5, w: 6.5, h: rowH * 0.5, fontFace: BODY_FONT,
        fontSize: 13, color: MUTED, valign: "top", margin: 0,
      });
    });
    addFooter(slide, 2);
  }

  // ---- Slide 3: Business Highlights (2x2 stat grid) ----------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: ICE };
    slide.addText("Business Highlights", {
      x: MARGIN, y: 0.5, w: 9, h: 0.8, fontFace: HEADER_FONT, fontSize: 36, bold: true,
      color: NAVY, margin: 0,
    });
    slide.addText("A profitable, fast-growing platform heading into FY27", {
      x: MARGIN, y: 1.2, w: 9, h: 0.4, fontFace: BODY_FONT, fontSize: 14, italic: true,
      color: MUTED, margin: 0,
    });

    const stats = [
      [icon.dollar, "$68M", "Annual Recurring Revenue", AMBER],
      [icon.chart, "25%", "Year-over-Year Growth", NAVY],
      [icon.sync, "128%", "Net Revenue Retention", NAVY],
      [icon.userFriends, "540+", "Enterprise Customers", NAVY],
    ];

    const cardW = (CONTENT_W - GAP) / 2;
    const cardH = 2.0;
    const startY = 2.1;
    for (let i = 0; i < stats.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * (cardW + GAP);
      const y = startY + row * (cardH + GAP);
      const [ic, value, label, accent] = stats[i];
      addCard(slide, x, y, cardW, cardH, accent);
      await addIconBadge(slide, ic, x + 0.35, y + 0.35, 0.6);
      slide.addText(value, {
        x: x + 1.15, y: y + 0.2, w: cardW - 1.4, h: 0.9, fontFace: HEADER_FONT,
        fontSize: 44, bold: true, color: accent === AMBER ? AMBER : NAVY, margin: 0,
      });
      slide.addText(label, {
        x: x + 1.15, y: y + 1.05, w: cardW - 1.4, h: 0.6, fontFace: BODY_FONT,
        fontSize: 14, color: TEXT, margin: 0,
      });
    }
    addFooter(slide, 3);
  }

  // ---- Slide 4: Revenue chart (real chart, not an image) -----------------
  {
    const slide = pres.addSlide();
    slide.background = { color: WHITE };
    slide.addText("Revenue Growth", {
      x: MARGIN, y: 0.5, w: 9, h: 0.7, fontFace: HEADER_FONT, fontSize: 36, bold: true,
      color: NAVY, margin: 0,
    });
    slide.addText("Quarterly ARR, trailing eight quarters ($M)", {
      x: MARGIN, y: 1.15, w: 9, h: 0.4, fontFace: BODY_FONT, fontSize: 14, italic: true,
      color: MUTED, margin: 0,
    });

    const quarters = ["Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26", "Q2'26"];
    const values = [44.0, 47.0, 50.5, 54.4, 58.0, 61.5, 65.0, 68.0];
    // Per-bar colors: navy for history, amber for the current quarter
    const chartColors = quarters.map((_, i) => (i === quarters.length - 1 ? AMBER : NAVY));

    const chartW = 8.6;
    slide.addChart(
      pres.charts.BAR,
      [{ name: "ARR ($M)", labels: quarters, values }],
      {
        x: MARGIN, y: 1.8, w: chartW, h: 4.6, barDir: "col",
        chartColors,
        chartArea: { fill: { color: WHITE } },
        catAxisLabelColor: MUTED, catAxisLabelFontSize: 11,
        valAxisLabelColor: MUTED, valAxisLabelFontSize: 11,
        valGridLine: { color: "E2E8F0", size: 0.5 },
        catGridLine: { style: "none" },
        showValue: true, dataLabelPosition: "outEnd", dataLabelColor: "1E293B",
        dataLabelFontSize: 11,
        showLegend: false,
        showTitle: false,
      }
    );

    // Narrative callout to the right of the chart
    const calloutX = MARGIN + chartW + GAP;
    const calloutW = CONTENT_W - chartW - GAP;
    addCard(slide, calloutX, 1.8, calloutW, 4.6, AMBER);
    slide.addText("+25% YoY", {
      x: calloutX + 0.3, y: 2.1, w: calloutW - 0.6, h: 0.6, fontFace: HEADER_FONT,
      fontSize: 30, bold: true, color: AMBER, margin: 0,
    });
    slide.addText(
      [
        { text: "ARR grew from $54.4M to $68.0M year-over-year", options: { bullet: true, breakLine: true } },
        { text: "Growth driven by expansion revenue within existing accounts", options: { bullet: true, breakLine: true } },
        { text: "Net-new logos contributed 9 points of growth", options: { bullet: true, breakLine: true } },
        { text: "Momentum is accelerating quarter over quarter", options: { bullet: true } },
      ],
      { x: calloutX + 0.3, y: 2.9, w: calloutW - 0.6, h: 3.2, fontFace: BODY_FONT, fontSize: 13, color: TEXT, paraSpaceAfter: 10, margin: 0 }
    );
    addFooter(slide, 4);
  }

  // ---- Slide 5: Product Roadmap (4-step timeline) ------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: ICE };
    slide.addText("Product Roadmap", {
      x: MARGIN, y: 0.5, w: 9, h: 0.8, fontFace: HEADER_FONT, fontSize: 36, bold: true,
      color: NAVY, margin: 0,
    });

    const steps = [
      [icon.rocket, "Q3 2026", "Workflow Automation GA", "General availability of the automation builder for all Growth-tier customers"],
      [icon.cogs, "Q4 2026", "Enterprise Permissions", "Granular role-based access control and audit logging"],
      [icon.brain, "Q1 2027", "AI Insights Engine", "Predictive analytics surfaced directly inside customer dashboards"],
      [icon.globeAlt, "Q2 2027", "Global Data Residency", "EU and APAC data hosting to support international compliance"],
    ];

    const colW = (CONTENT_W - GAP * 3) / 4;
    const y = 2.1;
    const cardH = 3.9;
    steps.forEach(async ([ic, when, title, desc], i) => {
      const x = MARGIN + i * (colW + GAP);
      addCard(slide, x, y, colW, cardH, i === 0 ? AMBER : NAVY);
      await addIconBadge(slide, ic, x + 0.3, y + 0.3, 0.55);
      slide.addText(when, {
        x: x + 0.3, y: y + 1.0, w: colW - 0.6, h: 0.35, fontFace: BODY_FONT,
        fontSize: 12, bold: true, color: i === 0 ? AMBER : MUTED, charSpacing: 1, margin: 0,
      });
      slide.addText(title, {
        x: x + 0.3, y: y + 1.35, w: colW - 0.6, h: 0.75, fontFace: HEADER_FONT,
        fontSize: 16, bold: true, color: NAVY, margin: 0,
      });
      slide.addText(desc, {
        x: x + 0.3, y: y + 2.15, w: colW - 0.6, h: cardH - 2.4, fontFace: BODY_FONT,
        fontSize: 11.5, color: TEXT, margin: 0,
      });
    });
    addFooter(slide, 5);
  }

  // ---- Slide 6: Europe Expansion (two-column) ----------------------------
  {
    const slide = pres.addSlide();
    slide.background = { color: WHITE };
    slide.addText("Europe Expansion", {
      x: MARGIN, y: 0.5, w: 9, h: 0.8, fontFace: HEADER_FONT, fontSize: 36, bold: true,
      color: NAVY, margin: 0,
    });

    const leftW = 5.8;
    slide.addText(
      [
        { text: "Opening a Dublin hub in Q4 2026 to anchor EMEA sales, support, and data residency", options: { bullet: true, breakLine: true } },
        { text: "Targeting the UK, Germany, France, and the Netherlands in year one", options: { bullet: true, breakLine: true } },
        { text: "Localizing billing, contracts, and support for GDPR and VAT compliance", options: { bullet: true, breakLine: true } },
        { text: "Hiring a 12-person regional GTM team led by an EMEA VP of Sales", options: { bullet: true, breakLine: true } },
        { text: "Targeting $9M in EMEA ARR by end of FY27", options: { bullet: true } },
      ],
      { x: MARGIN, y: 1.6, w: leftW, h: 4.8, fontFace: BODY_FONT, fontSize: 15, color: TEXT, paraSpaceAfter: 14, margin: 0 }
    );

    // Right column: country cards (illustrative, no map image required)
    const rightX = MARGIN + leftW + GAP;
    const rightW = CONTENT_W - leftW - GAP;
    const countries = [
      [icon.marker, "United Kingdom", "Lead market — London"],
      [icon.marker, "Germany", "Enterprise focus — Berlin"],
      [icon.marker, "France", "Mid-market — Paris"],
      [icon.building, "Ireland (Hub)", "Regional HQ — Dublin"],
    ];
    const cCardH = 1.0;
    countries.forEach(async ([ic, name, sub], i) => {
      const y = 1.6 + i * (cCardH + 0.2);
      addCard(slide, rightX, y, rightW, cCardH, i === 3 ? AMBER : NAVY);
      await addIconBadge(slide, ic, rightX + 0.25, y + (cCardH - 0.5) / 2, 0.5);
      slide.addText(name, {
        x: rightX + 0.95, y: y + 0.1, w: rightW - 1.2, h: 0.45, fontFace: BODY_FONT,
        fontSize: 15, bold: true, color: TEXT, margin: 0,
      });
      slide.addText(sub, {
        x: rightX + 0.95, y: y + 0.52, w: rightW - 1.2, h: 0.4, fontFace: BODY_FONT,
        fontSize: 11.5, color: MUTED, margin: 0,
      });
    });
    addFooter(slide, 6);
  }

  // ---- Slide 7: Team (leadership grid, monogram avatars) -----------------
  {
    const slide = pres.addSlide();
    slide.background = { color: ICE };
    slide.addText("Leadership Team", {
      x: MARGIN, y: 0.5, w: 9, h: 0.8, fontFace: HEADER_FONT, fontSize: 36, bold: true,
      color: NAVY, margin: 0,
    });

    const team = [
      ["AK", "Anya Kessler", "Co-Founder & CEO"],
      ["DM", "Diego Marchetti", "Co-Founder & CTO"],
      ["RP", "Riya Patel", "VP of Sales"],
      ["TS", "Tomas Svensson", "VP of Engineering"],
      ["LC", "Lena Chow", "VP of Finance"],
    ];

    const colW = (CONTENT_W - GAP * 4) / 5;
    const y = 2.2;
    team.forEach(([initials, name, title], i) => {
      const x = MARGIN + i * (colW + GAP);
      const avatarSize = 1.3;
      const avatarX = x + (colW - avatarSize) / 2;
      slide.addShape("ellipse", {
        x: avatarX, y, w: avatarSize, h: avatarSize,
        fill: { color: i % 2 === 0 ? NAVY : AMBER }, line: { type: "none" }, shadow: cardShadow(),
      });
      slide.addText(initials, {
        x: avatarX, y, w: avatarSize, h: avatarSize, fontFace: HEADER_FONT, fontSize: 26,
        bold: true, color: WHITE, align: "center", valign: "middle", margin: 0,
      });
      slide.addText(name, {
        x, y: y + avatarSize + 0.2, w: colW, h: 0.5, fontFace: BODY_FONT, fontSize: 14,
        bold: true, color: TEXT, align: "center", margin: 0,
      });
      slide.addText(title, {
        x, y: y + avatarSize + 0.65, w: colW, h: 0.7, fontFace: BODY_FONT, fontSize: 11.5,
        color: MUTED, align: "center", margin: 0,
      });
    });
    addFooter(slide, 7);
  }

  // ---- Slide 8: Ask / Next Steps (dark, bookends slide 1) ----------------
  {
    const slide = pres.addSlide();
    slide.background = { color: NAVY };

    slide.addShape("ellipse", { x: -1.5, y: -1.8, w: 5, h: 5, fill: { color: "24365C" }, line: { type: "none" } });

    slide.addText("The Ask", {
      x: MARGIN, y: 0.7, w: 9, h: 0.8, fontFace: HEADER_FONT, fontSize: 36, bold: true,
      color: WHITE, margin: 0,
    });
    slide.addText("Raising $25M Series C to accelerate European expansion", {
      x: MARGIN, y: 1.5, w: 10.5, h: 0.7, fontFace: HEADER_FONT, fontSize: 24, bold: true,
      color: AMBER, margin: 0,
    });

    const nextSteps = [
      [icon.bullseye, "Deploy $14M into EMEA go-to-market", "Dublin hub, regional sales team, localized marketing"],
      [icon.cogs, "Invest $7M in platform R&D", "AI Insights Engine and enterprise permissions roadmap"],
      [icon.calendarCheck, "Target close by end of Q3 2026", "Term sheet review beginning this month"],
    ];
    const rowH = 1.15;
    const startY = 2.8;
    nextSteps.forEach(async ([ic, title, desc], i) => {
      const y = startY + i * (rowH + 0.15);
      await addIconBadge(slide, ic, MARGIN, y, 0.55);
      slide.addText(title, {
        x: MARGIN + 0.85, y, w: 9.5, h: 0.5, fontFace: BODY_FONT, fontSize: 16, bold: true,
        color: WHITE, valign: "top", margin: 0,
      });
      slide.addText(desc, {
        x: MARGIN + 0.85, y: y + 0.45, w: 9.5, h: 0.5, fontFace: BODY_FONT, fontSize: 13,
        color: "AFC1DA", valign: "top", margin: 0,
      });
    });

    slide.addText("Contact: investors@meridiansoftware.com", {
      x: MARGIN, y: 6.9, w: 8, h: 0.35, fontFace: BODY_FONT, fontSize: 11,
      color: "9FB3D1", margin: 0,
    });
  }

  await pres.writeFile({ fileName: "meridian-investor-update.pptx" });
  console.log("Wrote meridian-investor-update.pptx");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run with:

```bash
node generate-deck.js
```

**Note on the async-in-`forEach` pattern above:** several loops call `await addIconBadge(...)`
inside a `.forEach` callback, which does not itself await the callback. In this deck that's
safe because each iteration only adds shapes/images to independent `x,y` positions and slide
mutation order doesn't matter for the final render — but if icon loading itself were slow or
order-dependent, replace `.forEach(async ...)` with a plain `for...of` loop so each iteration is
awaited before the next begins. For production hardening, prefer:

```javascript
for (const [ic, title, desc] of nextSteps) { /* ... await addIconBadge(...) ... */ }
```

---

## 4. Quality-Assurance Pass

**First render is assumed wrong — QA is a bug hunt, not a rubber stamp.** Run this full pass
before calling the deck done.

### Step 1 — Content QA

```bash
python -m markitdown meridian-investor-update.pptx
```

Check against the source outline:
- All 8 slides present, in order: Title → Agenda → Highlights → Revenue → Roadmap → Europe → Team → Ask
- Numbers match across slides (the $68M / 25% on the title-adjacent stat card must match the
  chart's final bar value and the callout on slide 4 — a common error is updating one and not
  the other after a late data change)
- No leftover placeholder strings:
  ```bash
  python -m markitdown meridian-investor-update.pptx | grep -iE "xxxx|lorem|ipsum|todo"
  ```

### Step 2 — Render to images

```bash
python scripts/office/soffice.py --headless --convert-to pdf meridian-investor-update.pptx
pdftoppm -jpeg -r 150 meridian-investor-update.pdf slide
```
(`scripts/office/soffice.py` is the vendored LibreOffice wrapper the pptx skill ships at
`external/anthropic/pptx/scripts/office/soffice.py`.) This produces `slide-01.jpg` … `slide-08.jpg`.

### Step 3 — Visual QA via a fresh-eyes subagent

Dispatch a subagent (do this even though it's only 8 slides — the person who wrote the layout
code will see what they intended, not what's actually on the slide) with:

```
Visually inspect these slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or cards not aligned consistently across a row
- Low-contrast text or icons (light text on light bg, dark icon on dark bg)
- Text boxes too narrow, causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. slide-01.jpg (Expected: navy title slide, "Meridian Software" + Q2 2026 subtitle, amber tag)
2. slide-02.jpg (Expected: 6-item numbered agenda with icon badges)
3. slide-03.jpg (Expected: 2x2 stat grid — $68M / 25% / 128% / 540+)
4. slide-04.jpg (Expected: 8-quarter bar chart + amber callout card, "+25% YoY")
5. slide-05.jpg (Expected: 4-card horizontal roadmap timeline, Q3'26 → Q2'27)
6. slide-06.jpg (Expected: two-column Europe expansion, bullets left, 4 country cards right)
7. slide-07.jpg (Expected: 5-person team row, circular initials avatars)
8. slide-08.jpg (Expected: dark navy ask slide, "$25M Series C" headline, 3 next-step rows)

Report ALL issues found, including minor ones.
```

### Step 4 — Verification loop

1. Generate → convert to images → inspect (above).
2. List every issue found (if the first pass turns up nothing, look again — that's a signal
   you weren't looking hard enough, not that the deck is perfect).
3. Fix in `generate-deck.js`, regenerate.
4. Re-render **only the affected slides** to save time:
   ```bash
   pdftoppm -jpeg -r 150 -f 4 -l 4 meridian-investor-update.pdf slide-fixed
   ```
5. Re-inspect the fixed slide(s) — a fix to spacing or font size on one slide commonly
   introduces a new overflow or misalignment either on that same slide or its visual twin
   (e.g., fixing the roadmap card height on slide 5 without checking whether the description
   text now overflows the card).
6. Repeat until one full pass turns up nothing new.

### Likely bugs in *this specific deck* to hunt for, and their fixes

| Where | Likely bug | Fix |
|---|---|---|
| Slide 3 (stat grid) | Value text (`44pt`) overflowing card width when the amber accent number is wider than expected (e.g., "128%" wider than "$68M") | Reduce `fontSize` slightly or widen the card / narrow the icon badge; keep both cards visually equal by fixing font size per-card rather than per-value length |
| Slide 4 (chart) | Data labels (`showValue: true`) overlapping the top edge of the chart plot area for the tallest bar (68.0) | Increase chart `h` slightly or add headroom by not setting an explicit `valAxisMaxVal`, letting PptxGenJS auto-scale above the max data point |
| Slide 4 (callout) | Bullet list `paraSpaceAfter` pushing the last bullet past the card's bottom edge | Reduce `paraSpaceAfter` or shrink `fontSize`; re-measure card `h` vs. text block height |
| Slide 5 (roadmap) | Four cards of equal height but variable-length description text — the longest description (e.g., roadmap item 2) may overflow past `cardH` | Cap description text length to a consistent word count across all four cards, or increase `cardH` |
| Slide 6 (two-column) | Country cards on the right column running lower than the bullet list on the left, creating an uneven bottom edge | Recompute `cCardH`/gap so the 4-card stack's total height matches the bullet block's height, or vertically center the shorter column |
| Slide 7 (team) | With 5 people across the width, avatar circles or name text could feel cramped near the outer margins if `colW` shrinks | Confirm `colW` computation leaves ≥0.3" gap on the two outermost columns from the 0.5" slide margin |
| Slide 8 (ask) | White/light body text over the navy background decorative circle at top-left could reduce contrast if the headline overlaps the circle | Confirm circle bounds (`x: -1.5, y: -1.8, w: 5, h: 5`) stay clipped off-canvas/behind the title text block, not underneath it |
| All icon badges | react-icons rasterized at low `size` looking pixelated at large badge sizes | Icons in this deck are rasterized at `256px` before being placed at ≤0.6" — safely above the "size 256 or higher" floor; if a badge is enlarged beyond ~1", re-rasterize at a higher `size` |
| All slides | Footer text colliding with a card that runs to the bottom of the content area | Confirm every content block's `y + h` stays ≤ 6.9" so it clears the 7.05" footer band |

Do not declare the deck finished until at least one full fix-and-re-verify cycle has been
completed with no new issues found.

---

LOADED: /home/user/hive/skills/converted/pptx/composable/INDEX.md, /home/user/hive/skills/converted/pptx/composable/presets/creating.md
