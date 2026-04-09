# Capture Cost Model — Fix Prompts for Claude Code

Run these prompts one at a time in Claude Code. Each prompt is self-contained with exact line numbers, code references, and expected behavior.

---

## Fix 1: Dead Sensitivity Parameters (HIGH PRIORITY)

```
In src/App.jsx, there are 5 sensitivity parameters that the sensitivity sweep sets on the `inputs` object via `buildSweepInputs()` (lines 1095-1099), but `calcLCOC()` never reads them from `inputs`. Instead it reads from `getParam()` or `GLOBAL_DEFAULTS` directly. This means the tornado chart shows zero-width bars for these 5 parameters.

The 5 broken parameters and their fix locations in calcLCOC():

1. **owners_cost_pct** — Line 623 reads `getParam(src, "owners_cost_pct", scenario)`. It should first check `inputs.owners_cost_pct`:
   Change: `const owners_pct = inputs.owners_cost_pct ?? getParam(src, "owners_cost_pct", scenario);`

2. **maint_labor_pct** — Line 659 reads `GLOBAL_DEFAULTS.maint_labor_pct`. It should first check inputs:
   Change: `const maint_labor = tpc_dollars * (inputs.maint_labor_pct ?? GLOBAL_DEFAULTS.maint_labor_pct);`

3. **maint_material_pct** — Line 680 reads `GLOBAL_DEFAULTS.maint_material_pct`. Same fix:
   Change: `const maint_material = tpc_dollars * (inputs.maint_material_pct ?? GLOBAL_DEFAULTS.maint_material_pct);`

4. **pti_pct** — Line 673 reads `GLOBAL_DEFAULTS.pti_pct`. Same fix:
   Change: `const pti = pti_basis_dollars * (inputs.pti_pct ?? GLOBAL_DEFAULTS.pti_pct);`

5. **tpc_scale_override** — Line 612 computes `scaleTPC(lineItems, sR)` but never applies the tpc_scale_override multiplier. After line 612, add:
   `const tpc_scale_mult = inputs.tpc_scale_override ?? 1.0;`
   Then change line 612's result usage: multiply `scaled_tpc_k` by `tpc_scale_mult` before it's used. The cleanest way: right after `const scaled_tpc_k = scaleTPC(lineItems, sR);` on line 612, add a line that applies the override:
   ```
   const tpc_scale_mult = inputs.tpc_scale_override ?? 1.0;
   const scaled_tpc_k_final = scaled_tpc_k * tpc_scale_mult;
   ```
   Then replace all subsequent references to `scaled_tpc_k` with `scaled_tpc_k_final` in the rest of calcLCOC (there are ~3 references: in adj_tpc_k calculation on line 620, and in the details return object around line 751).

IMPORTANT: Do NOT rename any state variables. Do NOT split App.jsx into multiple files. Only modify the lines described above inside calcLCOC(). The sensitivity sweep in buildSweepInputs() (lines 1095-1099) is already correct — it sets these on inputs. The bug is only that calcLCOC ignores them.

After making changes, verify the tornado chart now shows non-zero bars for all 5 parameters by checking that buildSweepInputs → calcLCOC pipeline actually varies the output for owners_cost_pct, maint_labor_pct, maint_material_pct, pti_pct, and tpc_scale.
```

---

## Fix 2: Tier B/C Boundary Discontinuity (MEDIUM PRIORITY)

```
In src/App.jsx, the `scaleTPC()` function (lines 542-567) has a discontinuity at the Tier B/C boundary (sR = 3.0). When sR crosses from 3.0 (Tier B) to 3.01 (Tier C), TPC jumps upward by 8-21% depending on the source. This is because Tier C splits into trains with a 0.93 learning factor and switches shared items to exp=0.4, which at sR just above 3.0 produces a HIGHER cost than Tier B.

Fix the `scaleTPC()` function to ensure continuity at the boundary. The approach: when sR > 3.0, compute BOTH the Tier B result and the Tier C result, and take the MINIMUM. This ensures Tier C never costs MORE than Tier B would at the same scale.

Here is the fix for scaleTPC() (lines 542-567):

```js
function scaleTPC(lineItems, sR) {
  if (sR >= 0.3 && sR <= 3.0) {
    // Tier B — standard six-tenths per line item
    return lineItems.reduce((sum, item) => {
      return sum + item.tpc_k * Math.pow(sR, item.exp);
    }, 0);
  } else if (sR < 0.3) {
    // Tier A — apply floors
    return lineItems.reduce((sum, item) => {
      const raw = item.tpc_k * Math.pow(sR, item.exp);
      const floor = item.floor ? item.tpc_k * item.floor : 0;
      return sum + Math.max(raw, floor);
    }, 0);
  } else {
    // Tier C — train-based, but ensure continuity with Tier B
    const nTrains = Math.ceil(sR / 3.0);
    const trainSR = sR / nTrains;
    const tierC = lineItems.reduce((sum, item) => {
      if (item.category === "core") {
        const perTrain = item.tpc_k * Math.pow(trainSR, item.exp) * 0.93;
        return sum + perTrain * nTrains;
      } else {
        return sum + item.tpc_k * Math.pow(sR, 0.4);
      }
    }, 0);
    // Tier B extrapolation — what standard scaling would give at this sR
    const tierB = lineItems.reduce((sum, item) => {
      return sum + item.tpc_k * Math.pow(sR, item.exp);
    }, 0);
    // Take the minimum to ensure continuity (Tier C should never exceed Tier B)
    return Math.min(tierB, tierC);
  }
}
```

Also update the scaledLineItems block inside calcLCOC (around lines 719-737) to use the same min(B,C) logic for Tier C, so the Model Tab line-item display is consistent. In that block, for the `else` case (Tier C), compute both the Tier C per-item value and the Tier B per-item value, and use whichever is lower:

```js
} else {
  const nTrains = Math.ceil(sR / 3.0);
  const trainSR = sR / nTrains;
  // Tier C value
  let tierCVal;
  if (item.category === "core") {
    tierCVal = item.tpc_k * Math.pow(trainSR, item.exp) * 0.93 * nTrains;
  } else {
    tierCVal = item.tpc_k * Math.pow(sR, 0.4);
  }
  // Tier B extrapolation
  const tierBVal = item.tpc_k * Math.pow(sR, item.exp);
  scaled = Math.min(tierBVal, tierCVal);
}
```

Do NOT change any other part of the code. Do NOT rename variables or split files.
```

---

## Fix 3: ref_tpc_k Data Corrections (LOW PRIORITY)

```
In src/App.jsx, 7 sources in NETL_DEFAULTS have a `ref_tpc_k` value that doesn't match the actual sum of their `tpc_line_items`. The model uses tpc_line_items for all calculations (ref_tpc_k is only for display), but this mismatch could confuse users if ref_tpc_k is shown in the UI.

Update these ref_tpc_k values to match the sum of their tpc_line_items:

1. **ammonia** (line ~86): Change `ref_tpc_k: 37347` to `ref_tpc_k: 37346`
   (sum of items: 19+12960+3977+391+1528+2642+4432+1906+3624+2489+2029+1326+23 = 37346)

2. **eo** (line ~125): Change `ref_tpc_k: 16636` to `ref_tpc_k: 16637`
   (sum: 4922+99+590+6374+3677+965+10 = 16637)

3. **ngp** (line ~191): Change `ref_tpc_k: 46690` to `ref_tpc_k: 46691`
   (sum: 25787+478+1683+12837+4543+1337+26 = 46691)

4. **refinery_h2** (line ~292): Change `ref_tpc_k: 127184` to `ref_tpc_k: 126236`
   (sum: 11234+95700+4354+4354+6281+3009+1252+52 = 126236)

5. **cement** (line ~328): Change `ref_tpc_k: 322871` to `ref_tpc_k: 321780`
   (sum: 22079+256072+19360+5144+12837+4543+1618+127 = 321780)

6. **pulp_paper** (line ~403): Change `ref_tpc_k: 322670` to `ref_tpc_k: 318672`
   (sum: 255557+11966+35807+5084+8557+1589+112 = 318672)

7. **ngcc_h** (line ~478): Change `ref_tpc_k: 657343` to `ref_tpc_k: 752160`
   (sum: 566012+82960+2262+24282+13951+15893+40316+4731+1328+425 = 752160)

IMPORTANT NOTE: For refinery_h2, cement, pulp_paper, and ngcc_h, the differences are large (948K, 1091K, 3998K, and 94817K respectively). Before changing these, double-check whether the current ref_tpc_k might be intentionally different from the line items (e.g., some line items may have been added or adjusted after the original NETL values were entered). The safest approach is to update ref_tpc_k to match the line item sum, since calcLCOC always uses line items anyway. But add a comment on any large discrepancy noting the original value, e.g.:
`ref_tpc_k: 752160,  // Updated to match line items (was 657343 from NETL Exhibit)`

Do NOT modify any tpc_line_items values. Only change the ref_tpc_k number.
```

---

## Fix 4: Source Validation Guard in calcLCOC (LOW PRIORITY)

```
In src/App.jsx, calcLCOC() (starting at line 585) does not validate that `inputs.source` is a valid key in NETL_DEFAULTS. If an invalid source string is passed, getParam() returns undefined and the function crashes with an unhandled TypeError.

Add a source validation check at the top of calcLCOC(), right after line 588 (`const warnings = [];`), before any other logic:

```js
  // Validate source
  if (!NETL_DEFAULTS[src]) {
    errors.push(`Unknown source: "${src}". Valid sources: ${Object.keys(NETL_DEFAULTS).join(", ")}`);
    return { lcoc: 0, components: { capital: 0, fixed_om: 0, variable_om: 0, power: 0, fuel: 0 }, details: {}, errors, warnings };
  }
```

This should go right after line 588, before the co2_capture_tpy validation on line 591. The function already has the same return pattern for other validation failures.

Do NOT change anything else.
```

---

## Fix 5: Pulp & Paper Retrofit Power Cost (LOW PRIORITY)

```
In src/App.jsx, the pulp_paper source in NETL_DEFAULTS (line ~399) has:
- `ref_mw: 0` — for greenfield (recovery boiler provides power)
- `ref_mw_retrofit: 13.52` — for retrofit (actual parasitic MW)

But calcLCOC() never uses ref_mw_retrofit. In the power calculation (lines 689-693), it uses ref_mw_gross/ref_mw_net for NGCC, and ref_mw_parasitic or ref_mw for industrial sources. For pulp_paper GF, ref_mw=0 is correct (zero power cost). But for pulp_paper RF, the power cost should use ref_mw_retrofit=13.52 MW instead of ref_mw=0.

Fix the power MW resolution logic in calcLCOC() around lines 689-693. After the existing logic determines ref_mw, add a check: if build_type is "RF" and the source has ref_mw_retrofit, use that instead.

Change the block at lines 689-693 from:
```js
  const ref_mw_gross = getParam(src, "ref_mw_gross", scenario);
  const ref_mw_net = getParam(src, "ref_mw_net", scenario);
  const ref_mw = (ref_mw_gross && ref_mw_net)
    ? (ref_mw_gross - ref_mw_net)
    : (getParam(src, "ref_mw_parasitic", scenario) ?? getParam(src, "ref_mw", scenario));
```

To:
```js
  const ref_mw_gross = getParam(src, "ref_mw_gross", scenario);
  const ref_mw_net = getParam(src, "ref_mw_net", scenario);
  let ref_mw;
  if (ref_mw_gross && ref_mw_net) {
    ref_mw = ref_mw_gross - ref_mw_net;   // NGCC: full output penalty
  } else if (inputs.build_type === "RF" && getParam(src, "ref_mw_retrofit", scenario)) {
    ref_mw = getParam(src, "ref_mw_retrofit", scenario);  // Retrofit: use retrofit parasitic MW
  } else {
    ref_mw = getParam(src, "ref_mw_parasitic", scenario) ?? getParam(src, "ref_mw", scenario);  // Industrial: parasitic only
  }
```

This ensures pulp_paper RF uses 13.52 MW for power cost instead of 0. GF behavior is unchanged because ref_mw=0 is checked before ref_mw_retrofit.

Do NOT change anything else. Do NOT modify NETL_DEFAULTS.
```

---

## Fix 6: validateFacility gf_only/rf_only Enforcement (LOW PRIORITY)

```
In src/App.jsx, the `validateFacility()` function (lines 1221-1241) checks that build_type is "GF" or "RF" but does NOT enforce the gf_only and rf_only flags from NETL_DEFAULTS. This means a batch CSV could submit RF for CTL (which is gf_only) or GF for Steel (which is rf_only) without any error.

Add gf_only/rf_only enforcement inside validateFacility(), after the existing build_type check on line 1234. Insert after line 1235:

```js
    // Enforce gf_only / rf_only source restrictions
    if (facility.source && NETL_DEFAULTS[facility.source]) {
      const srcDefaults = NETL_DEFAULTS[facility.source];
      if (srcDefaults.gf_only && facility.build_type === "RF") {
        errors.push(`${srcDefaults.label} is greenfield-only (no domestic retrofit plants exist). Build type must be GF.`);
      }
      if (srcDefaults.rf_only && facility.build_type === "GF") {
        errors.push(`${srcDefaults.label} is retrofit-only (no new plants being built). Build type must be RF.`);
      }
    }
```

This goes inside validateFacility() between the existing build_type check (line 1234) and the scaling ratio check (line 1236).

Do NOT change anything else.
```

---

## Fix 7: Add Direct Air Capture (DAC) Source (MEDIUM PRIORITY)

```
In src/App.jsx, add a new source "dac" (Direct Air Capture — Solid Sorbent) to the model. DAC is fundamentally different from point-source capture — it pulls CO2 directly from ambient air using solid sorbent contactors + thermal regeneration (TVSA). There is no host industrial plant.

Cost basis: Early-commercial solid sorbent DAC plant in December 2018 USD. Full assumptions documented in DAC_DOC_ASSUMPTIONS.md.
Key sources: IEAGHG 2021-05, Fasihi et al. 2019 (J. Cleaner Production), ETH Zurich/One Earth (2024), NETL Sorbent DAC Case Study (2022/2025).
LCOC target range: $600–800/tCO2. DAC should be CHEAPER than DOC.

Step 1 — Add "dac" to NETL_DEFAULTS. Insert the following block AFTER the last existing source (ngcc_h) and before the closing `};` of NETL_DEFAULTS:

  dac: {
    label: "Direct Air Capture (Solid Sorbent)",
    purity: "dac",                      // New category — not HP or LP
    ref_co2_capture_tpy: 100000,        // 100 kt CO2/yr — early commercial scale (DOE DAC Hub program scale)
    ref_tpc_k: 370000,                  // $370M TPC ($3,700/tCO2-yr capacity) — below FOAK $4k-6k, above NOAK ~$815
    owners_cost_pct: 0.22,              // 22% — standard industrial (consistent with 21-22% across model)
    ref_mw: 3.36,                       // MW electric parasitic: 250 kWh_e/tCO2 midpoint (Fasihi 2019: 200-300) × 100k / (8760 × 0.85)
    capacity_basis: "t_co2_yr",         // DAC scales by CO2 throughput directly — no host plant
    ref_capacity: 100000,               // 100,000 tCO2/yr
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: true,         // Natural gas for thermal sorbent regeneration (80-120°C)
    ref_fuel_mmbtu_yr: 597100,          // 1,750 kWh_th/tCO2 midpoint (Fasihi 2019: 1500-2000) × 100k × 3.412/1000
    rdf: 1.0,                           // No retrofit concept — always greenfield
    operators_per_shift: 3.0,           // Complex multi-contactor system with vacuum/thermal cycling
    labor_type: "LP",                   // Complex, multiple subsystems
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 25,                   // Sorbent degradation limits effective life (shorter than 30yr for proven capture)
    debt_pct: 0.40,                     // Lower leverage than proven CANSOLV (0.42-0.50) — higher technology risk
    cost_of_debt: 0.06,                 // Premium over conventional 0.0515 — novel technology risk
    cost_of_equity: 0.15,               // Premium over conventional 0.12 — early-stage technology
    emission_factor: 1.0,               // The "product" IS the CO2 — 1:1 (no host plant conversion)
    gf_only: true,                      // No retrofit concept for DAC — always new build
    capture_technology: "Solid Sorbent",
    tpc_line_items: [
      // Breakdown from NETL Sorbent DAC Case Study (2022) + IEAGHG 2021-05 cost allocation
      // Literature: "adsorbent CAPEX dominates overall cost" — contactors at 50%
      { acct: "1.x",  name: "Air Contactors & Sorbent", tpc_k: 185000, exp: 0.7, floor: null,  category: "core"   },
      { acct: "2.x",  name: "Regeneration System",      tpc_k: 65000,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression",          tpc_k: 35000,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",            tpc_k: 18000,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",               tpc_k: 30000,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                      tpc_k: 16000,  exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",                tpc_k: 13000,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings & Structures",   tpc_k: 8000,   exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

Step 2 — Add "t_co2_yr" to CAPACITY_UNITS. Find the CAPACITY_UNITS object (around line 1406) and add:
  t_co2_yr: "t CO2/yr",

Step 3 — Add "dac" to SOURCE_OPTIONS. Find SOURCE_OPTIONS (around line 1378) and add a new section after the Power sector line ({ key: "ngcc" }):
  // Direct removal
  { key: "dac", label: "Direct Air Capture" },

Step 4 — DAC purity and tech multiplier logic. DAC produces high-purity CO2 (~99%) after desorption, but it is NOT an HP point source and should NOT be added to HP_SOURCES. The existing logic already excludes non-HP sources from membrane/cryogenic tech — no changes needed here.

IMPORTANT: Do NOT rename any state variables. Do NOT split App.jsx into multiple files. Do NOT modify calcLCOC() — it already handles arbitrary sources via getParam() and the three-tier scaling. The capacity_basis "t_co2_yr" just needs to exist in CAPACITY_UNITS for the UI input label.

After making changes, verify that selecting "Direct Air Capture" in the source dropdown loads correctly and produces an LCOC in the $600–800/tCO2 range at reference scale (100,000 tCO2/yr, GF build type). DAC should be CHEAPER than DOC.
```

---

## Fix 8: Add Direct Ocean Capture (DOC) Source (MEDIUM PRIORITY)

```
In src/App.jsx, add a new source "doc" (Direct Ocean Capture — Electrochemical) to the model. DOC uses bipolar membrane electrodialysis (BPMED) to acidify seawater, releasing dissolved CO2, then re-alkalinize and return seawater. Purely electric process — no fuel/natural gas. There is no host industrial plant.

Cost basis: FOAK electrochemical DOC plant in December 2018 USD. Full assumptions documented in DAC_DOC_ASSUMPTIONS.md.
Key sources: Nature Communications (Eisaman 2020), Energy & Env. Science (Digdaya 2023), NREL DOC modeling (2024), Captura Corp (2024).
LCOC target range: >$800/tCO2. DOC should be MORE EXPENSIVE than DAC (less mature, pre-commercial, no learning curve yet).

Step 1 — Add "doc" to NETL_DEFAULTS. Insert the following block AFTER the "dac" entry (or after ngcc_h if DAC hasn't been added yet):

  doc: {
    label: "Direct Ocean Capture (Electrochemical)",
    purity: "doc",                      // New category
    ref_co2_capture_tpy: 100000,        // 100 kt CO2/yr — FOAK target (Captura targets this by ~2028)
    ref_tpc_k: 500000,                  // $500M TPC ($5,000/tCO2-yr) — higher than DAC; no learning curve yet
    owners_cost_pct: 0.22,              // 22% — standard industrial
    ref_mw: 13.4,                       // MW electric: 1,000 kWh_e/tCO2 midpoint (BPMED range 667-3220) × 100k / (8760 × 0.85)
    capacity_basis: "t_co2_yr",         // DOC scales by CO2 throughput directly — no host plant
    ref_capacity: 100000,               // 100,000 tCO2/yr
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,        // Purely electric — no natural gas
    rdf: 1.0,                           // No retrofit concept
    operators_per_shift: 2.3,           // Fewer mechanical parts than DAC, but electrochemical monitoring
    labor_type: "LP",                   // Complex electrochemical system
    construction_years: 3,              // Marine infrastructure adds complexity
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 20,                   // Membrane/electrode degradation faster than solid sorbents
    debt_pct: 0.35,                     // Lowest in model — highest technology risk (pre-commercial)
    cost_of_debt: 0.065,                // Highest risk premium in model
    cost_of_equity: 0.16,               // Highest equity return — least proven technology
    emission_factor: 1.0,               // The "product" IS the CO2
    gf_only: true,                      // No retrofit concept
    capture_technology: "Electrodialysis",
    tpc_line_items: [
      // Breakdown from Captura tech descriptions, NREL DOC modeling (2024), MARAD Marine CCS TEA (2024)
      // Electrodialysis stacks dominate at 40% — membrane/electrode cost is primary driver
      { acct: "1.x",  name: "Electrodialysis Stacks",   tpc_k: 200000, exp: 0.7, floor: null,  category: "core"   },
      { acct: "2.x",  name: "Seawater Intake & Return",  tpc_k: 80000,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "3.x",  name: "CO2 Degas & Stripping",     tpc_k: 45000,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression",           tpc_k: 40000,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",             tpc_k: 15000,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical & Power Cond.",  tpc_k: 60000,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                       tpc_k: 25000,  exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work & Marine",        tpc_k: 25000,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings & Structures",    tpc_k: 10000,  exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

Step 2 — Add "doc" to SOURCE_OPTIONS. Find SOURCE_OPTIONS and add to the "Direct removal" section (after DAC):
  { key: "doc", label: "Direct Ocean Capture" },

Step 3 — No changes to CAPACITY_UNITS needed. DOC uses the same "t_co2_yr" capacity basis added for DAC in Fix 7. If Fix 7 has NOT been applied yet, you must also add `t_co2_yr: "t CO2/yr"` to CAPACITY_UNITS.

Step 4 — No changes to HP_SOURCES needed. DOC is not a high-purity point source and should NOT be in HP_SOURCES.

IMPORTANT: Do NOT rename any state variables. Do NOT split App.jsx into multiple files. Do NOT modify calcLCOC().

After making changes, verify that selecting "Direct Ocean Capture" in the source dropdown loads correctly and produces an LCOC >$800/tCO2 at reference scale (100,000 tCO2/yr, GF build type). DOC should be MORE EXPENSIVE than DAC due to higher capital intensity ($5,000 vs $3,700/tCO2-yr), higher financing costs, shorter project life, and high electricity consumption — even though it has no fuel cost.
```

---

## Fix 9: Standardize All Plant Capacity Units to Yearly (LOW PRIORITY)

```
In src/App.jsx, two sources use daily capacity units for their plant capacity input, while all other sources use annual units. Standardize everything to yearly so the UI is consistent.

Sources that need conversion:

1. AMMONIA — currently "t NH3/day" with ref_capacity: 1000
   - Change ref_capacity from 1000 to 365000 (1,000 t/day × 365 days)
   - In CAPACITY_UNITS, change: t_nh3_yr: "t NH3/day"  →  t_nh3_yr: "t NH3/yr"

2. NATURAL GAS PROCESSING — currently "MMSCFD" (million standard cubic feet per day) with ref_capacity: 330
   - Change ref_capacity from 330 to 120450 (330 MMSCFD × 365 days)
   - In CAPACITY_UNITS, change: mmscfd: "MMSCFD"  →  mmscfd: "MMSCF/yr"

3. Clean up unused unit — remove the "bpd" entry from CAPACITY_UNITS entirely. It was used by the now-removed CTL/GTL sources and no active source references it.

IMPORTANT — what NOT to change:
- Do NOT change capacity_basis keys in NETL_DEFAULTS (keep "t_nh3_yr", "mmscfd" as-is — they're just lookup keys)
- Do NOT change ref_co2_capture_tpy, emission_factor, or any other parameter — those are already annual
- Do NOT change MW-based sources (ngcc_f, ngcc_h) — MW is a rate unit (power), not daily/yearly
- Do NOT modify calcLCOC() or any calculation logic
- Do NOT rename state variables
- Do NOT split App.jsx

The scaling ratio (sR = co2_capture_tpy / ref_co2_capture_tpy) is unaffected because it operates on CO2 tonnes/year, not plant capacity units. The plant capacity → CO2 conversion uses emission_factor × capacity × CF, so changing ref_capacity and its display unit together keeps the math identical.

After making changes, verify:
- Ammonia: entering 365000 t NH3/yr should produce the same LCOC as the old 1000 t NH3/day (both represent the same physical plant)
- NGP: entering 120450 MMSCF/yr should match the old 330 MMSCFD result
- All other sources should be completely unaffected
```
