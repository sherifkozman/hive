# Task: financial-analysis / BROAD

Using `eval2/fixtures/meridian_financials.json`, produce a full analyst
work-up of Meridian Software for an investment committee. You may run Python;
the deliverable is one Markdown report containing:

1. **Financial health snapshot:** profitability (gross/operating/net margins,
   ROE), liquidity (current/quick), leverage (D/E, interest coverage),
   efficiency (DSO, asset turnover) — FY2023-2025 trend, with SaaS-appropriate
   interpretation.
2. **DCF valuation** using the provided assumptions: 5-year FCFF projection
   (2026-2030), WACC (show CAPM and after-tax cost of debt work), Gordon
   terminal value, enterprise value, equity value, per-share value. Include a
   sensitivity table over WACC (+/-1pt) and terminal growth (+/-0.5pt), and a
   sanity check of the implied EV/Revenue multiple.
3. **Driver-based 4-quarter 2026 revenue forecast** from the forecast inputs
   (ARR, bookings, churn/NRR), with base/bull/bear scenarios and stated driver
   assumptions per scenario.
4. **Executive summary** (top, BLUF): valuation range, key risks, 3 focal
   points for the committee.

Arithmetic must be correct and reproducible; state assumptions where the
inputs leave gaps. Tables where they help.
