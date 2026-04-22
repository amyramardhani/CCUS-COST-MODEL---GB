# Capture Cost Model (CCUS TEA)

A React-based techno-economic analysis (TEA) tool for levelized cost of capture (LCOC) across industrial CO₂ sources. Built on NETL methodology with WACC-based annuity financing, three-tier scaling, and state-resolved energy prices.

## What it does

Given a CO₂ source (ammonia, ethylene oxide, ethanol, NGP, refinery H₂, cement, steel, pulp & paper, NGCC, DAC, DOC), a capture tonnage, and a state, the model computes:

- Levelized Cost of Capture (LCOC) in $/tonne CO₂
- Cost component breakdown: Capital, Fixed O&M, Variable O&M, Power, Fuel
- CAPEX and OPEX pie breakdowns
- 45Q-adjusted Net LCOC
- Cash flow waterfall, NPV, IRR, payback
- State-level LCOC heatmap across all 50 states
- Scenario comparison across NETL default, optimistic, and custom assumptions
- Batch mode: run hundreds of facilities from a spreadsheet and rank them by LCOC

## Run locally

Requires Node 18+ and npm.

```bash
git clone https://github.com/amyramardhani/ccus-tea.git
cd ccus-tea
npm install
npm run dev
```

Then open http://localhost:5173/ccus-tea/ in a browser.

## Build for production

```bash
npm run build
```

Output goes to `dist/` (or `dist-vercel/` when deployed via Vercel).

## Project structure

- `src/App.jsx` — single-file React architecture containing all tabs, `calcLCOC`, `calcCashFlow`, `NETL_DEFAULTS`, and chart logic
- `src/App.css` — app-wide styles
- `CLAUDE.md` — project conventions and architecture rules
- `PROMPT_*.md` — drop-in prompt files for planned changes (apply via AI-assisted editing)
- `ccus_batch_template_cleaned.xlsx` — sample batch input with 4,164 facilities

## Methodology highlights

- WACC-based annuity: `AF = WACC / (1 - (1 + WACC)^-n)` — no TASC, no CCF
- Admin rate: 25% (NETL Section 3.1.2.3)
- Three-tier scaling: Tier A (`sR < 0.3`), Tier B (`0.3–3.0`), Tier C (`> 3.0`)
- NGCC frame auto-select: ≤850 MW → F-frame, >850 MW → H-frame
- Retrofit Difficulty Factor (RDF) only applied for RF build type
- Cost year: December 2018 USD, CEPCI = 603.1

## Validation targets (±5% on total LCOC)

| Configuration | Target |
|---|---|
| Ammonia GF | ~$19.0/t |
| EO GF | ~$26.0/t |
| NGCC F-frame RF | ~$61.8/t |
| NGCC H-frame RF 95% | ~$55.9/t |

## Tech stack

React 19 · Vite 8 · Recharts · xlsx (SheetJS) · d3-geo · topojson-client

## Status

Active development. The Batch tab and Charts tab are the current focus of ongoing improvements — see `PROMPT_*.md` for planned changes.
