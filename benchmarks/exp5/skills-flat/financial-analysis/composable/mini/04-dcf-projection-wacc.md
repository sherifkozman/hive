
# DCF: Cash-Flow Projection & WACC

DCF is intrinsic valuation: business value = present value of all future free cash flows, discounted at a rate reflecting their risk.

```
Enterprise Value = Σ [FCF_t / (1 + WACC)^t] + Terminal Value / (1 + WACC)^n
```

## Step 1 — Historical Analysis (3–5 years)

Examine revenue growth (organic vs acquisition), margin trends (gross/operating/net), capital intensity (CapEx % of revenue), working capital (cash conversion cycle), and FCF conversion (FCF / Net Income).

## Step 2 — Revenue Projections

Approaches: **top-down** (market size × share × pricing), **bottom-up** (units × price, or customers × ARPU), **growth extrapolation with decay**. Best practices: 5–7 year explicit period; growth converges toward GDP by terminal year; support with market data and management guidance; model by segment/product line where possible.

## Step 3 — Free Cash Flow (Unlevered / FCFF)

```
UFCF = EBIT × (1 − Tax Rate)
     + Depreciation & Amortization
     − Capital Expenditures
     − Changes in Net Working Capital
```

Key drivers: operating-margin trajectory, CapEx % of revenue (maintenance vs growth), working-capital needs (DSO, DIO, DPO), tax rate (effective vs marginal).

## Step 4 — WACC

```
WACC = (E/V × Re) + (D/V × Rd × (1 − T))
```

E/V and D/V are market-value weights; Re = cost of equity; Rd = pre-tax cost of debt; T = marginal tax rate.

**Cost of Equity (CAPM):**
```
Re = Rf + Beta × (Rm − Rf) + Size Premium + Company-Specific Risk
```
Typical components: Risk-Free Rate (10-yr Treasury) 3.5–5.0%; Equity Risk Premium 5.0–7.0%; Beta 0.5–2.0; Size Premium 0–5%; Company-Specific Risk 0–5%. Estimate beta from 2–5 year weekly returns vs a broad index; unlever comparables' betas then re-lever to target capital structure; consider the industry median beta for stability.

**Cost of Debt:** yield on comparable-maturity corporate bonds, or Rf + credit spread. Spreads by rating: AAA 0.5–1.0%, AA 1.0–1.5%, A 1.5–2.0%, BBB 2.0–3.0%, BB 3.0–5.0%, B 5.0–8.0%.

Beware circular references: WACC depends on equity value which depends on WACC.
