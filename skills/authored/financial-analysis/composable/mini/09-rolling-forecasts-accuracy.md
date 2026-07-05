---
pairs-with:
  - 08-driver-based-forecasting-scenarios.md
---

# Rolling Forecasts, 13-Week Cash Flow & Accuracy Tracking

## 2. Rolling Forecasts

### What Is a Rolling Forecast?

A rolling forecast continuously extends the forecast horizon as each period closes. Unlike a static annual budget, a rolling forecast always looks forward the same number of periods (typically 12-18 months).

### Rolling Forecast vs Annual Budget

| Feature | Annual Budget | Rolling Forecast |
|---------|--------------|-----------------|
| Time Horizon | Fixed (Jan-Dec) | Rolling (12-18 months) |
| Update Frequency | Once per year | Monthly or quarterly |
| Detail Level | Very detailed | Driver-level |
| Preparation Time | 3-6 months | 2-5 days per cycle |
| Relevance | Declines over time | Stays current |
| Flexibility | Rigid | Adaptive |

### Implementation Steps

1. **Select the horizon** - 12 months rolling is most common (some use 18 months for CapEx planning)
2. **Define update cadence** - Monthly for volatile businesses; quarterly for stable ones
3. **Choose the right detail** - Driver-level, not line-item detail
4. **Automate data feeds** - Reduce manual effort per cycle
5. **Separate actuals from forecast** - Clear delineation between reported and projected periods
6. **Track forecast accuracy** - Measure MAPE (Mean Absolute Percentage Error) over time

### 13-Week Cash Flow Forecast

A specialized rolling forecast for liquidity management:

**Structure:**
- Week-by-week cash inflows and outflows
- Opening and closing cash balances
- Minimum cash threshold alerts

**Key Components:**
| Inflows | Outflows |
|---------|----------|
| Customer collections (by aging) | Payroll (fixed cadence) |
| Other receivables | Rent / Lease payments |
| Asset sales | Vendor payments (by terms) |
| Financing proceeds | Debt service |
| Tax refunds | Tax payments |
| Other income | Capital expenditures |

**Collection Modeling:**
- Apply collection rates by customer segment or aging bucket
- Model DSO trends to project collection timing
- Account for seasonal patterns in payment behavior

## 3. Accuracy Improvement

### Measuring Forecast Accuracy

**Mean Absolute Percentage Error (MAPE):**
```
MAPE = (1/n) × Sum of |Actual - Forecast| / |Actual| × 100%
```

**Accuracy Benchmarks:**
| MAPE | Rating |
|------|--------|
| < 5% | Excellent |
| 5% - 10% | Good |
| 10% - 20% | Acceptable |
| > 20% | Needs improvement |

**Weighted MAPE (WMAPE):**
Use when line items vary significantly in magnitude - weights errors by actual values.

### Techniques to Improve Accuracy

**1. Bias Detection and Correction**
- Track directional bias (consistently over or under forecasting)
- Calculate mean signed error to detect systematic bias
- Adjust driver assumptions to correct persistent bias

**2. Variance Analysis Loop**
- After each period closes, compare actual vs forecast
- Identify root causes of significant variances
- Update driver assumptions based on learnings
- Document what changed and why

**3. Ensemble Approach**
- Combine multiple forecasting methods
- Blend statistical (trend) with judgmental (management input)
- Weight methods by their historical accuracy

**4. Granularity Optimization**
- Forecast at the right level of detail - not too aggregated, not too granular
- Product/segment level usually more accurate than single top-line
- Aggregate bottom-up forecasts for total, then adjust

**5. Leading Indicators**
- Identify metrics that predict financial outcomes 1-3 months ahead
- Pipeline/bookings predict revenue
- Hiring plans predict headcount costs
- Customer churn signals predict retention revenue

### Common Accuracy Killers

1. **Anchoring bias** - Over-relying on last year's numbers
2. **Optimism bias** - Systematic overestimation of growth
3. **Lack of accountability** - No one tracks forecast vs actual
4. **Stale assumptions** - Not updating for market changes
5. **Missing data** - Forecasting without key driver inputs
6. **Over-precision** - False precision in uncertain environments
