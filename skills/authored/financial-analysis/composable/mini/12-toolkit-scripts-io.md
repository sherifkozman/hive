# Toolkit: Scripts, Templates, Inputs & Dependencies

> Fidelity note: this mini carries the source SKILL.md's Tools / Templates / Input-Data / Dependencies sections as **knowledge**. The referenced scripts, assets, and templates (`scripts/*.py`, `assets/*`) are **not vendored here**: file paths below are kept as references describing the intended workflow and each tool's capabilities, not runnable files. Reproduce the calculations from the method minis (01–11) when the scripts are unavailable.

## Tools

### 1. Ratio Calculator (`scripts/ratio_calculator.py`)

Calculate and interpret financial ratios from financial statement data.

**Ratio Categories:**
- **Profitability:** ROE, ROA, Gross Margin, Operating Margin, Net Margin
- **Liquidity:** Current Ratio, Quick Ratio, Cash Ratio
- **Leverage:** Debt-to-Equity, Interest Coverage, DSCR
- **Efficiency:** Asset Turnover, Inventory Turnover, Receivables Turnover, DSO
- **Valuation:** P/E, P/B, P/S, EV/EBITDA, PEG Ratio

```bash
python scripts/ratio_calculator.py assets/sample_financial_data.json
python scripts/ratio_calculator.py assets/sample_financial_data.json --format json
python scripts/ratio_calculator.py assets/sample_financial_data.json --category profitability
```

### 2. DCF Valuation (`scripts/dcf_valuation.py`)

Discounted Cash Flow enterprise and equity valuation with sensitivity analysis.

**Features:**
- WACC calculation via CAPM
- Revenue and free cash flow projections (5-year default)
- Terminal value via perpetuity growth and exit multiple methods
- Enterprise value and equity value derivation
- Two-way sensitivity analysis (discount rate vs growth rate)

```bash
python scripts/dcf_valuation.py assets/sample_financial_data.json
python scripts/dcf_valuation.py assets/sample_financial_data.json --format json
python scripts/dcf_valuation.py assets/sample_financial_data.json --projection-years 7
```

### 3. Budget Variance Analyzer (`scripts/budget_variance_analyzer.py`)

Analyze actual vs budget vs prior year performance with materiality filtering.

**Features:**
- Dollar and percentage variance calculation
- Materiality threshold filtering (default: 10% or $50K)
- Favorable/unfavorable classification with revenue/expense logic
- Department and category breakdown
- Executive summary generation

```bash
python scripts/budget_variance_analyzer.py assets/sample_financial_data.json
python scripts/budget_variance_analyzer.py assets/sample_financial_data.json --format json
python scripts/budget_variance_analyzer.py assets/sample_financial_data.json --threshold-pct 5 --threshold-amt 25000
```

### 4. Forecast Builder (`scripts/forecast_builder.py`)

Driver-based revenue forecasting with rolling cash flow projection and scenario modeling.

**Features:**
- Driver-based revenue forecast model
- 13-week rolling cash flow projection
- Scenario modeling (base/bull/bear cases)
- Trend analysis using simple linear regression (standard library)

```bash
python scripts/forecast_builder.py assets/sample_financial_data.json
python scripts/forecast_builder.py assets/sample_financial_data.json --format json
python scripts/forecast_builder.py assets/sample_financial_data.json --scenarios base,bull,bear
```

## Knowledge Bases

| Reference | Purpose |
|-----------|---------|
| `references/financial-ratios-guide.md` | Ratio formulas, interpretation, industry benchmarks (see minis 01–03) |
| `references/valuation-methodology.md` | DCF methodology, WACC, terminal value, comps (see minis 04–06) |
| `references/forecasting-best-practices.md` | Driver-based forecasting, rolling forecasts, accuracy (see minis 08–10) |
| `references/industry-adaptations.md` | Sector-specific metrics and considerations: SaaS, Retail, Manufacturing, Financial Services, Healthcare (see mini 11) |

## Templates

| Template | Purpose |
|----------|---------|
| `assets/variance_report_template.md` | Budget variance report template |
| `assets/dcf_analysis_template.md` | DCF valuation analysis template |
| `assets/forecast_report_template.md` | Revenue forecast report template |

## Input Data Format

All scripts accept JSON input files in either of two shapes:

1. **Flat**: the tool's expected keys at the top level (e.g., `income_statement` / `balance_sheet` for the ratio calculator, `historical` / `assumptions` for DCF, `line_items` for variance, `historical_periods` / `drivers` / `assumptions` / `cash_flow_inputs` for forecasting).
2. **Nested (bundled)**: inputs for all four tools in one file, nested under per-tool keys: `ratio_analysis`, `dcf_valuation`, `budget_variance`, `forecast`. See `assets/sample_financial_data.json` for the complete bundled schema; every quick-start command above runs directly against it.

Each script auto-detects the shape (flat keys win if present) and exits non-zero with a clear error if neither shape yields usable data.

## Dependencies

**None**: All scripts use Python standard library only (`math`, `statistics`, `json`, `argparse`, `datetime`). No numpy, pandas, or scipy required.
