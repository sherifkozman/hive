---
pairs-with:
  - 09-rolling-forecasts-accuracy.md
  - 07-budget-variance-analysis.md
---

# Driver-Based Forecasting & Scenario Planning

## 1. Driver-Based Forecasting

### Overview

Driver-based forecasting models financial outcomes based on key business drivers rather than extrapolating from historical trends alone. This approach creates more transparent, actionable, and accurate forecasts.

### Identifying Key Drivers

**Revenue Drivers:**

| Business Model | Primary Drivers |
|---------------|----------------|
| SaaS/Subscription | Customers × ARPU × Retention Rate |
| E-commerce | Visitors × Conversion Rate × AOV |
| Manufacturing | Units × Price per Unit |
| Professional Services | Headcount × Utilization × Bill Rate |
| Retail | Stores × Revenue per Store (or sqft) |
| Marketplace | GMV × Take Rate |

**Cost Drivers:**

| Category | Common Drivers |
|----------|---------------|
| COGS | Revenue × (1 - Gross Margin) or Units × Unit Cost |
| Headcount Costs | Employees × Average Compensation × (1 + Benefits Rate) |
| Sales & Marketing | Revenue × S&M % or CAC × New Customers |
| R&D | Engineering Headcount × Avg Salary |
| G&A | Headcount-based + fixed costs |
| CapEx | Revenue × CapEx Intensity or Project-based |

### Building a Driver-Based Model

**Step 1: Map the value chain**
- Revenue = f(volume drivers, pricing drivers, mix drivers)
- Costs = f(variable drivers, fixed components, step functions)

**Step 2: Establish driver relationships**
- Linear: Revenue = Units × Price
- Non-linear: Revenue = Base × (1 + Growth Rate)^t
- Step function: Facilities costs that jump at capacity thresholds

**Step 3: Validate driver assumptions**
- Compare driver values to historical actuals
- Benchmark against industry data
- Stress-test extreme values

**Step 4: Build sensitivity**
- Identify which drivers have the largest impact on output
- Quantify the range of reasonable values for each driver
- Create scenario combinations

### Driver Sensitivity Matrix

Rank drivers by impact and uncertainty:

| | High Impact | Low Impact |
|---|-----------|-----------|
| **High Uncertainty** | Model these carefully, run scenarios | Monitor but don't over-model |
| **Low Uncertainty** | Get these right; high accuracy needed | Use simple assumptions |

## 4. Scenario Planning

### Three-Scenario Framework

| Scenario | Description | Probability |
|----------|-------------|-------------|
| **Base Case** | Most likely outcome based on current trajectory | 50-60% |
| **Bull Case** | Favorable conditions, upside realization | 15-25% |
| **Bear Case** | Adverse conditions, downside risks | 15-25% |

### Scenario Construction

**Base Case:**
- Continuation of current trends
- Management's operational plan
- Market consensus assumptions
- Normal competitive dynamics

**Bull Case (apply selectively, not uniformly):**
- Faster customer acquisition or market adoption
- Successful product launch or expansion
- Favorable macro conditions
- Competitor weakness or exit
- Margin expansion from operating leverage

**Bear Case (be realistic, not catastrophic):**
- Slower growth or market contraction
- Increased competition or pricing pressure
- Key customer or contract loss
- Supply chain disruption
- Regulatory headwinds

### Scenario Variables

Map each scenario to specific driver values:

| Driver | Bear | Base | Bull |
|--------|------|------|------|
| Revenue Growth | +2% | +8% | +15% |
| Gross Margin | 35% | 40% | 43% |
| Customer Churn | 8% | 5% | 3% |
| New Customers/Month | 50 | 100 | 180 |
| Price Increase | 0% | 3% | 5% |
