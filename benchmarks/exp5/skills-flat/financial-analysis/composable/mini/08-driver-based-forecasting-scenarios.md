
# Driver-Based Forecasting & Scenario Planning

Model outcomes from key business drivers rather than extrapolating history alone — more transparent, actionable, and accurate.

## Revenue Drivers by Business Model

| Model | Primary drivers |
|-------|----------------|
| SaaS/Subscription | Customers × ARPU × Retention Rate |
| E-commerce | Visitors × Conversion Rate × AOV |
| Manufacturing | Units × Price per Unit |
| Professional Services | Headcount × Utilization × Bill Rate |
| Retail | Stores × Revenue per Store (or sqft) |
| Marketplace | GMV × Take Rate |

## Cost Drivers

- **COGS:** Revenue × (1 − Gross Margin), or Units × Unit Cost
- **Headcount:** Employees × Avg Comp × (1 + Benefits Rate)
- **Sales & Marketing:** Revenue × S&M %, or CAC × New Customers
- **R&D:** Engineering Headcount × Avg Salary
- **G&A:** headcount-based + fixed costs
- **CapEx:** Revenue × CapEx Intensity, or project-based

## Building the Model

1. **Map the value chain** — Revenue = f(volume, pricing, mix); Costs = f(variable drivers, fixed components, step functions).
2. **Establish relationships** — linear (Revenue = Units × Price), non-linear (Base × (1 + Growth)^t), or step function (facility costs jumping at capacity thresholds).
3. **Validate assumptions** — compare drivers to historical actuals, benchmark against industry data, stress-test extremes.
4. **Build sensitivity** — identify highest-impact drivers, quantify reasonable ranges, create scenario combinations.

**Driver sensitivity matrix** (rank by impact × uncertainty): high impact + high uncertainty → model carefully, run scenarios; high impact + low uncertainty → get right, high accuracy needed; low impact + high uncertainty → monitor, don't over-model; low impact + low uncertainty → simple assumptions.

## Scenario Planning (three-scenario framework)

| Scenario | Description | Probability |
|----------|-------------|-------------|
| Base | Most likely; current trajectory, management plan, consensus | 50–60% |
| Bull | Favorable conditions, upside (apply selectively) | 15–25% |
| Bear | Adverse conditions, downside (realistic, not catastrophic) | 15–25% |

Map each scenario to specific driver values. Example: Revenue Growth bear +2% / base +8% / bull +15%; Gross Margin 35/40/43%; Customer Churn 8/5/3%; New Customers/Month 50/100/180; Price Increase 0/3/5%. Bull levers: faster acquisition, successful launch, favorable macro, competitor exit, operating leverage. Bear levers: slower growth, pricing pressure, customer/contract loss, supply disruption, regulatory headwinds.
