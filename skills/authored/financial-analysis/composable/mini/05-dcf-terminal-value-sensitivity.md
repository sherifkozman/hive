---
requires:
  - 04-dcf-projection-wacc.md
pairs-with:
  - 06-comparables-precedents.md
---

# DCF: Terminal Value, Equity Bridge & Sensitivity

### Step 5: Terminal Value

Terminal value typically represents 60-80% of total enterprise value. Use two methods and cross-check.

#### Perpetuity Growth Method

```
TV = FCF_n × (1 + g) / (WACC - g)
```

Where g = terminal growth rate (typically 2.0% - 3.0%, should not exceed long-term GDP growth)

**Sensitivity:** Terminal value is highly sensitive to g. A 0.5% change in g can move enterprise value by 15-25%.

#### Exit Multiple Method

```
TV = Terminal Year EBITDA × Exit EV/EBITDA Multiple
```

**Exit Multiple Selection:**
- Use current trading multiples of comparable companies
- Consider whether current multiples are at historical highs/lows
- Apply a discount for lack of marketability if private

**Cross-Check:** Both methods should yield similar results. Large discrepancies signal inconsistent assumptions.

### Step 6: Enterprise to Equity Bridge

```
Enterprise Value
- Net Debt (Total Debt - Cash)
- Minority Interest
- Preferred Equity
+ Equity Method Investments
= Equity Value

Equity Value / Diluted Shares Outstanding = Value Per Share
```

Use fully diluted shares (treasury stock method for options): ignoring dilution overstates per-share value.

### Step 7: Sensitivity Analysis

Always present results as a range, not a single point estimate.

**Standard Sensitivity Tables:**
1. WACC vs Terminal Growth Rate
2. WACC vs Exit Multiple
3. Revenue Growth vs Operating Margin

**Scenario Analysis:**
- Base case: Management guidance / consensus estimates
- Bull case: Upside scenario with faster growth or margin expansion
- Bear case: Downside scenario with slower growth or margin compression

## Common Pitfalls

1. **Hockey stick projections** - Unrealistic growth acceleration in later years
2. **Terminal value dominance** - If TV > 80% of EV, shorten projection period or question assumptions
3. **Circular references** - WACC depends on equity value which depends on WACC
4. **Ignoring working capital** - Can significantly affect FCF
5. **Single-point estimates** - Always present as a range
6. **Stale comparables** - Market conditions change; update regularly
7. **Confirmation bias** - Don't work backward from a desired conclusion
8. **Ignoring dilution** - Use fully diluted shares (treasury stock method for options)
