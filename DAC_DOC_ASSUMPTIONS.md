# DAC & DOC Source Assumptions — Literature Review

All costs in December 2018 USD (model basis), unless noted. Conversion from later-year dollars uses CEPCI adjustment where applicable.

---

## DAC — Direct Air Capture (Solid Sorbent)

### Technology Description
Temperature-vacuum swing adsorption (TVSA) using amine-functionalized solid sorbent. CO2 binds to sorbent at ambient temperature; heat (~80-120°C) applied under vacuum releases concentrated CO2 for compression and storage. Representative technology: Climeworks.

### Cost Data Sources

| Parameter | Value | Source |
|-----------|-------|--------|
| **FOAK LCOC range** | $400–700/tCO2 | IEAGHG 2021-05, "Global Assessment of Direct Air Capture Costs" |
| **NOAK LCOC (1 MtCO2/yr)** | $194–230/tCO2 | IEAGHG 2021-05 |
| **Current commercial** | $1,000–1,300/tCO2 | Climeworks Mammoth operations (2024) |
| **Credit sale price** | $600–1,000/tCO2 | Climeworks commercial credits (2024) |
| **2050 projection (solid sorbent)** | $374/tCO2 ($281–579) | ETH Zurich, Qiu et al., One Earth (March 2024) |
| **IEA current range** | $230–630/tCO2 | IEA, "Direct Air Capture" Energy System page |
| **NETL range** | $95–600/tCO2 | NETL Sorbent DAC Case Study (2022, Rev.1 2025) |

### Capital Intensity

| Source | CAPEX (per tCO2/yr capacity) | Notes |
|--------|------------------------------|-------|
| Climeworks Hinwil | ~€7,300/tCO2/yr | 960 tCO2/yr, ~€7M capex (pilot scale) |
| Fasihi et al. 2019 | ~€730/tCO2/yr | J. Cleaner Production, Vol 224, pp 957-980 — NOAK estimate |
| Industry FOAK consensus | $4,000–6,000/tCO2/yr | IEA, IEAGHG, multiple TEA reviews |
| DOE Carbon Negative Shot | <$100/tCO2 target | US DOE long-term target (not current reality) |

### Energy Requirements

| Parameter | Value | Source |
|-----------|-------|--------|
| **Electricity** | 200–300 kWh_e/tCO2 | Fasihi et al. 2019 (solid sorbent) |
| **Thermal energy** | 1,500–2,000 kWh_th/tCO2 | Fasihi et al. 2019 (solid sorbent) |
| **Total energy** | 4–6 GJ/tCO2 | Multiple sources; thermal dominates |

### Selected Model Parameters (targeting $600–800/tCO2 LCOC)

Rationale for parameter selection:
- **ref_tpc_k: 370,000** ($370M for 100k tCO2/yr = $3,700/tCO2/yr capacity). This is below the FOAK range ($4,000-6,000) but above NOAK (~$730 EUR). Represents an "early commercial" plant with some learning curve benefit, consistent with DOE DAC Hub-scale projects targeting near-term deployment.
- **ref_co2_capture_tpy: 100,000** (100 kt/yr). Consistent with DOE DAC Hub program scale (Project Cypress targets 1 MtCO2/yr but individual units are 100k-scale). Climeworks Mammoth is 36k tCO2/yr; next generation targets ~100k.
- **ref_mw: 3.36** (250 kWh_e/tCO2 midpoint of Fasihi range, × 100k / (8760 × 0.85)). Electric parasitic for fans, vacuum pumps, compression.
- **ref_fuel_mmbtu_yr: 597,100** (1,750 kWh_th/tCO2 midpoint × 100k × 3.412/1000). Natural gas for sorbent thermal regeneration.
- **owners_cost_pct: 0.22** (standard industrial, consistent with other model sources at 21-22%).
- **debt_pct: 0.40** (lower leverage than proven CANSOLV tech at 0.42-0.50, reflecting higher technology risk).
- **cost_of_debt: 0.06** (premium over conventional 0.0515 due to novel technology risk).
- **cost_of_equity: 0.15** (premium over conventional 0.12 for early-stage technology).
- **project_life: 25** (sorbent degradation limits; shorter than 30-yr for proven capture).
- **construction_years: 3** (large civil + mechanical works, similar to industrial capture).
- **operators_per_shift: 3.0** (complex multi-contactor system; higher than HP sources at 1.0 but comparable to LP).
- **emission_factor: 1.0** (the "product" IS the CO2 — no host plant conversion).
- **gf_only: true** (no retrofit concept for DAC — always new build).

### TPC Line Item Breakdown

No NETL exhibit available for DAC. Breakdown estimated from NETL Sorbent DAC Case Study (2022) descriptions and IEAGHG 2021-05 cost allocation discussion. Air contactors/sorbent dominate at ~50% (consistent with literature stating "adsorbent CAPEX dominates overall cost").

| Account | Component | $K | % of TPC | Scaling Exp | Source/Rationale |
|---------|-----------|----|----|-----|------|
| 1.x | Air Contactors & Sorbent | 185,000 | 50% | 0.7 | Modular units — higher exponent (less economy of scale) |
| 2.x | Regeneration System | 65,000 | 17.6% | 0.6 | Steam/vacuum system for CO2 desorption |
| 5.4 | CO2 Compression | 35,000 | 9.5% | 0.6 | Standard compressor scaling |
| 9.x | Cooling Water | 18,000 | 4.9% | 0.6 | Process cooling |
| 11.x | Electrical | 30,000 | 8.1% | 0.65 | Fan motors, vacuum pumps, switchgear |
| 12.x | I&C | 16,000 | 4.3% | 0.6 | Instrumentation & controls |
| 13.x | Site Work | 13,000 | 3.5% | 0.45 | Large footprint for contactor arrays |
| 14.x | Buildings & Structures | 8,000 | 2.2% | 0.4 | Minimal enclosed structures |
| **Total** | | **370,000** | **100%** | | |

---

## DOC — Direct Ocean Capture (Electrochemical)

### Technology Description
Bipolar membrane electrodialysis (BPMED) to acidify seawater, releasing dissolved CO2 as gas, then re-alkalinize and return seawater. Purely electric process — no fuel/natural gas. Representative technology: Captura Corp.

### Cost Data Sources

| Parameter | Value | Source |
|-----------|-------|--------|
| **Near-term LCOC** | $150–450/tCO2 | National Academies of Sciences, Engineering, and Medicine |
| **Offshore analysis** | $1,130/tCO2 | ScienceDirect TEA study (2025) |
| **With bioconversion** | $229.9/tCO2 | Nature Communications electrochemical study |
| **Industry targets** | <$100/tCO2 at scale | Captura, Brineworks (long-term targets) |
| **Current demonstration** | Not publicly disclosed | Pre-commercial, pilot-scale only |

### Energy Requirements

| Parameter | Value | Source |
|-----------|-------|--------|
| **BPMED electricity** | 980 kWh_e/tCO2 | Nature Communications (2020), 71% capture efficiency |
| **EHL system** | 667 kWh_e/tCO2 (2.4 GJ/t) | ScienceDirect review (2024), 91% efficiency |
| **Chloride-mediated** | 778 kWh_e/tCO2 (2.8 GJ/t) | ScienceDirect review (2024), 87% efficiency |
| **Equatic process** | 2,200 kWh_e/tCO2 | IEEE Spectrum (2024), offset by H2 byproduct |
| **Integrated analysis** | 3,220 kWh_e/tCO2 | ScienceDirect TEA (2025), 87% for capture |

### Selected Model Parameters (targeting >$800/tCO2 — more expensive than DAC)

Rationale: DOC is significantly less mature than DAC. As of 2024, the largest DOC pilot is Captura's 1,000 tCO2/yr facility in Hawaii. No commercial-scale plants exist. Higher capital intensity and financing costs reflect pre-commercial technology risk.

- **ref_tpc_k: 500,000** ($500M for 100k tCO2/yr = $5,000/tCO2/yr capacity). Higher than DAC's $3,700 due to: expensive electrodialysis membranes, marine infrastructure costs (seawater intake/return), and no learning curve benefit yet. Consistent with offshore TEA showing >$1,000/tCO2 at current scale.
- **ref_co2_capture_tpy: 100,000** (100 kt/yr). Captura targets this scale by ~2028.
- **ref_mw: 13.4** (1,000 kWh_e/tCO2 — midpoint of BPMED range, × 100k / (8760 × 0.85)). Purely electric.
- **fuel_cost_applicable: false** (all-electric process).
- **owners_cost_pct: 0.22** (standard).
- **debt_pct: 0.35** (lowest of any source — reflects highest technology risk in model).
- **cost_of_debt: 0.065** (highest risk premium — pre-commercial technology).
- **cost_of_equity: 0.16** (highest in model — reflects investor uncertainty).
- **project_life: 20** (membrane and electrode degradation faster than DAC sorbents).
- **construction_years: 3** (marine infrastructure adds complexity).
- **operators_per_shift: 2.3** (fewer mechanical parts than DAC but electrochemical monitoring needed).
- **emission_factor: 1.0** (same as DAC — product IS CO2).
- **gf_only: true** (no retrofit concept).

### TPC Line Item Breakdown

Estimated from Captura technology descriptions, DOE/NREL DOC modeling (2024), and MARAD Marine CCS TEA (2024).

| Account | Component | $K | % of TPC | Scaling Exp | Source/Rationale |
|---------|-----------|----|----|-----|------|
| 1.x | Electrodialysis Stacks | 200,000 | 40% | 0.7 | Modular membrane stacks — dominant cost |
| 2.x | Seawater Intake & Return | 80,000 | 16% | 0.6 | Marine infrastructure, pumping systems |
| 3.x | CO2 Degas & Stripping | 45,000 | 9% | 0.6 | Gas-liquid separation systems |
| 5.4 | CO2 Compression | 40,000 | 8% | 0.6 | Standard compressor scaling |
| 9.x | Cooling Water | 15,000 | 3% | 0.6 | Process cooling |
| 11.x | Electrical & Power Cond. | 60,000 | 12% | 0.65 | High due to all-electric process + power quality |
| 12.x | I&C | 25,000 | 5% | 0.6 | Electrochemical process monitoring |
| 13.x | Site Work & Marine | 25,000 | 5% | 0.45 | Coastal site preparation, marine works |
| 14.x | Buildings & Structures | 10,000 | 2% | 0.4 | Minimal buildings |
| **Total** | | **500,000** | **100%** | | |

---

## Key References

1. IEAGHG (2021). "Global Assessment of Direct Air Capture Costs." Technical Report 2021-05.
2. Fasihi, M., Efimova, O., & Breyer, C. (2019). "Techno-economic assessment of CO2 direct air capture plants." Journal of Cleaner Production, 224, 957-980.
3. Qiu, Y., Lamontagne, J., Bovari, E., et al. (2024). "Cost of direct air carbon capture to remain higher than hoped." ETH Zurich / One Earth.
4. NETL (2022, Rev. 1 2025). "Direct Air Capture Case Studies: Sorbent System." OSTI 2520078.
5. Eisaman, M.D. et al. (2020). "A direct coupled electrochemical system for capture and conversion of CO2 from oceanwater." Nature Communications.
6. Digdaya, I.A. et al. (2023). "Direct Ocean Capture: The Emergence of Electrochemical Processes for Oceanic Carbon Removal." Energy & Environmental Science.
7. NREL (2024). "A Model of Large Scale Electrochemical Direct Ocean Capture Under Variable Power."
8. IEA (2022). "Direct Air Capture 2022." Executive Summary.
9. Climeworks (2024). Operational data from Mammoth facility, Iceland.
10. Captura Corp (2024). "Innovations and cost reductions in Direct Ocean Capture."
