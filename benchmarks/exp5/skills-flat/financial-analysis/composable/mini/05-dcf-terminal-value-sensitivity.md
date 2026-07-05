
# DCF: Terminal Value, Equity Bridge & Sensitivity

## Step 5 — Terminal Value

Terminal value typically represents **60–80% of total enterprise value**. Use two methods and cross-check.

**Perpetuity Growth Method:**
```
TV = FCF_n × (1 + g) / (WACC − g)
```
g = terminal growth rate, typically **2.0–3.0%**, must not exceed long-term GDP growth. TV is highly sensitive to g: a 0.5% change in g can move enterprise value by **15–25%**.

**Exit Multiple Method:**
```
TV = Terminal Year EBITDA × Exit EV/EBITDA Multiple
```
Use current trading multiples of comparables; consider whether they sit at historical highs/lows; discount for lack of marketability if private.

**Cross-check:** both methods should yield similar results — large discrepancies signal inconsistent assumptions.

## Step 6 — Enterprise-to-Equity Bridge

```
Enterprise Value
− Net Debt (Total Debt − Cash)
− Minority Interest
− Preferred Equity
+ Equity Method Investments
= Equity Value

Equity Value / Diluted Shares Outstanding = Value Per Share
```

Use fully diluted shares (treasury stock method for options) — ignoring dilution overstates per-share value.

## Step 7 — Sensitivity & Scenarios

Always present results as a range, not a single point. Standard two-way sensitivity tables:
1. WACC vs Terminal Growth Rate
2. WACC vs Exit Multiple
3. Revenue Growth vs Operating Margin

Scenario analysis: **Base** (management guidance / consensus), **Bull** (faster growth or margin expansion), **Bear** (slower growth or margin compression).

## Common DCF Pitfalls

- **Hockey-stick projections** — unrealistic growth acceleration in later years.
- **Terminal-value dominance** — if TV > 80% of EV, shorten the projection period or question assumptions.
- **Circular references** — WACC depends on equity value which depends on WACC.
- **Ignoring working capital** — can materially change FCF.
- **Single-point estimates** — always present a range.
- **Stale comparables** — refresh as market conditions change.
- **Confirmation bias** — don't work backward from a desired conclusion.
- **Ignoring dilution** — use fully diluted shares.
