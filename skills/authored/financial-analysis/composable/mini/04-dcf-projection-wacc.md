---
requires:
  - 05-dcf-terminal-value-sensitivity.md
pairs-with:
  - 08-driver-based-forecasting-scenarios.md
  - 06-comparables-precedents.md
---

# DCF: Cash-Flow Projection & WACC

## Discounted Cash Flow (DCF) Methodology

### Overview

DCF is an intrinsic valuation method that estimates the present value of a company's expected future free cash flows, discounted at an appropriate rate reflecting the risk of those cash flows.

**Core Principle:** The value of a business equals the present value of all future cash flows it will generate.

**Formula:**

```
Enterprise Value = Sum of [FCF_t / (1 + WACC)^t] + Terminal Value / (1 + WACC)^n
```

Where:
- FCF_t = Free Cash Flow in year t
- WACC = Weighted Average Cost of Capital
- n = number of projection years

### Step 1: Historical Analysis

Before projecting, analyze 3-5 years of historical financials:

- **Revenue growth rates** - Identify organic vs acquisition-driven growth
- **Margin trends** - Gross, operating, and net margin trajectories
- **Capital intensity** - CapEx as % of revenue
- **Working capital** - Cash conversion cycle trends
- **Free cash flow conversion** - FCF / Net Income ratio

### Step 2: Revenue Projections

**Approaches:**
1. **Top-down:** Market size × Market share × Pricing
2. **Bottom-up:** Units × Price, or Customers × ARPU
3. **Growth rate extrapolation:** Historical growth with decay

**Revenue Projection Best Practices:**
- Use 5-7 year explicit projection period
- Growth should converge toward GDP growth by terminal year
- Support assumptions with market data and management guidance
- Model revenue by segment/product line when possible

### Step 3: Free Cash Flow Calculation

**Unlevered Free Cash Flow (UFCF):**

```
UFCF = EBIT × (1 - Tax Rate)
     + Depreciation & Amortization
     - Capital Expenditures
     - Changes in Net Working Capital
```

**Key Drivers:**
- Operating margin trajectory
- CapEx as % of revenue (maintenance vs growth)
- Working capital requirements (DSO, DIO, DPO)
- Tax rate (effective vs marginal)

### Step 4: WACC Calculation

**Weighted Average Cost of Capital:**

```
WACC = (E/V × Re) + (D/V × Rd × (1 - T))
```

Where:
- E/V = Equity weight (market value)
- D/V = Debt weight (market value)
- Re = Cost of equity
- Rd = Cost of debt (pre-tax)
- T = Marginal tax rate

#### Cost of Equity (CAPM)

```
Re = Rf + Beta × (Rm - Rf) + Size Premium + Company-Specific Risk
```

| Component | Description | Typical Range |
|-----------|-------------|---------------|
| Risk-Free Rate (Rf) | 10-year Treasury yield | 3.5% - 5.0% |
| Equity Risk Premium (ERP) | Market return above risk-free | 5.0% - 7.0% |
| Beta | Systematic risk relative to market | 0.5 - 2.0 |
| Size Premium | Small-cap additional risk | 0% - 5% |
| Company-Specific Risk | Unique risk factors | 0% - 5% |

**Beta Estimation:**
- Use 2-5 year weekly returns against broad market index
- Unlevered betas for comparability, then re-lever to target capital structure
- Consider industry median beta for stability

#### Cost of Debt

```
Rd = Yield on comparable-maturity corporate bonds
   OR
Rd = Risk-Free Rate + Credit Spread
```

**Credit Spread by Rating:**
| Rating | Typical Spread |
|--------|---------------|
| AAA | 0.5% - 1.0% |
| AA | 1.0% - 1.5% |
| A | 1.5% - 2.0% |
| BBB | 2.0% - 3.0% |
| BB | 3.0% - 5.0% |
| B | 5.0% - 8.0% |

Beware circular references: WACC depends on equity value which depends on WACC. Continue to terminal value, the equity bridge, and sensitivity in the paired mini.
