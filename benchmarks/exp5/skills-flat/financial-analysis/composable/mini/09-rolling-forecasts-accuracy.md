
# Rolling Forecasts, 13-Week Cash Flow & Accuracy Tracking

## Rolling Forecasts

A rolling forecast continuously extends the horizon as each period closes, always looking forward the same number of periods (typically **12–18 months**), unlike a static annual budget.

| Feature | Annual Budget | Rolling Forecast |
|---------|--------------|-----------------|
| Horizon | Fixed (Jan–Dec) | Rolling 12–18 mo |
| Update frequency | Once per year | Monthly/quarterly |
| Detail | Very detailed | Driver-level |
| Prep time | 3–6 months | 2–5 days/cycle |
| Relevance | Declines | Stays current |
| Flexibility | Rigid | Adaptive |

**Implementation:** select horizon (12 months most common; 18 for CapEx planning); set cadence (monthly for volatile, quarterly for stable); forecast at driver level, not line-item; automate data feeds; separate actuals from forecast clearly; track accuracy via MAPE.

## 13-Week Cash Flow Forecast

Specialized rolling forecast for liquidity management: week-by-week inflows/outflows, opening and closing cash balances, minimum-cash-threshold alerts.

- **Inflows:** customer collections (by aging), other receivables, asset sales, financing proceeds, tax refunds, other income.
- **Outflows:** payroll (fixed cadence), rent/lease, vendor payments (by terms), debt service, tax payments, CapEx.
- **Collection modeling:** apply collection rates by customer segment or aging bucket; model DSO trends for timing; account for seasonal payment behavior.

## Measuring Accuracy

**MAPE** = (1/n) × Σ |Actual − Forecast| / |Actual| × 100%. Benchmarks: <5% excellent, 5–10% good, 10–20% acceptable, >20% needs improvement. Use **WMAPE** (weighted by actuals) when line items vary greatly in magnitude.

## Improving Accuracy

1. **Bias detection/correction** — track directional bias, calculate mean signed error, adjust drivers for persistent bias.
2. **Variance analysis loop** — compare actual vs forecast each period, find root causes, update assumptions, document.
3. **Ensemble** — blend statistical (trend) and judgmental (management) methods, weighted by historical accuracy.
4. **Granularity optimization** — forecast at the right level; product/segment usually beats single top-line; aggregate bottom-up then adjust.
5. **Leading indicators** — pipeline/bookings predict revenue; hiring plans predict headcount cost; churn signals predict retention revenue.

**Accuracy killers:** anchoring bias (last year's numbers), optimism bias, lack of accountability, stale assumptions, missing driver data, over-precision.
