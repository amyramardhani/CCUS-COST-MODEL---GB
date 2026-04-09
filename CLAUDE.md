# Capture Cost Model — Project Memory

## App Identity
- App name: Capture Cost Model
- Framework: React 19 + Vite
- Main file: src/App.jsx (224K — single file architecture)
- Do NOT split into multiple files without explicit instruction

## Architecture Rules
- calcLCOC() is the ONLY function that computes LCOC
- calcCashFlow() is the ONLY function for cash flow
- All constants read through getParam(source, key, scenario)
- Scenario override precedence: scenario.overrides > inputs > NETL_DEFAULTS > GLOBAL_DEFAULTS
- NETL_DEFAULTS is read-only
- State variables use short names (src, bt, cfIn, pp, gp etc) — do NOT rename these

## Key Methodology
- WACC-based annuity: AF = WACC / (1-(1+WACC)^-n) — no TASC, no CCF
- Admin rate = 25% (NETL Section 3.1.2.3)
- Three-tier scaling: Tier A (sR<0.3), Tier B (0.3–3.0), Tier C (>3.0)
- NGCC frame auto-select: ≤850 MW = F-frame, >850 MW = H-frame
- RDF only applied for RF build type
- Cost year: December 2018 USD, CEPCI = 603.1

## Colors — Enverus Palette (never change)
- green:  #58b947 — Capital, primary accent
- pink:   #ef509a — Fixed O&M
- orange: #f68d2e — Variable O&M
- purple: #93348f — Power
- teal:   #58a7af — Fuel
- red:    #b83a4b — Negative values, errors
- yellow: #fdcf0c — Reference lines, highlights

## UI Standards
- Font: Aptos (fallback: Segoe UI, Calibri, sans-serif)
- Card: padding 12px 16px, border 1px solid #e0e0e0, border-radius 6px
- Card headers: 13px, bold, uppercase, #1a1a1a, NO border-bottom
- Green top bar: #58b947, 44px, "Capture Cost Model" + BETA + "Enverus Intelligence® Research"
- All dollar totals use formatDollars() function
- Zero-value rows always hidden
- App container: 95% width

## Validation Targets (±5% on total LCOC)
- Ammonia GF: ~$19.0/t
- EO GF: ~$26.0/t
- NGCC F-frame RF: ~$61.8/t
- NGCC H-frame RF 95%: ~$55.9/t

## Known Bugs Fixed — Do Not Reintroduce
1. Scenario override: scenario must win over inputs
2. NGCC capacity: use GROSS MW (740/1009)
3. Annuity: use r/(1-(1+r)^-n) not perpetuity
4. Admin rate: 25% not 30%
5. EO emission factor: 0.333 not 0.283

## Removed Sources
- CTL (Coal-to-Liquids) and GTL (Gas-to-Liquids) were removed on April 8 2026
- They were not in the original project plan
- Removed from: NETL_DEFAULTS, SOURCE_OPTIONS, HP_SOURCES

## Sources (12 total — 10 active, 2 pending addition via FIX_PROMPTS.md)
- HP (compression-only): ammonia, eo, ethanol, ngp
- LP (full amine): refinery_h2, cement, steel, pulp_paper, ngcc_f, ngcc_h
- Direct removal (pending Fix 7 & 8): dac, doc

## Current Status
- All tabs built and working
- Batch processing tab in progress
- CTL and GTL removed (not in original plan)
- DAC and DOC prompts ready in FIX_PROMPTS.md (Fix 7 & 8) — not yet applied
- App running cleanly with no errors as of April 8 2026
