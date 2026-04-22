# Batch Tab Upgrade — Drop-in Prompt

Paste the block below into Claude when you want the Batch tab upgraded. It is self-contained and references the exact functions, line numbers, and conventions in this repo.

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Do not split the file; follow the conventions in `CLAUDE.md` (single-file architecture, short state names, Enverus palette, existing card/header styling). Only touch `BatchTab` and the small helpers it needs. Do not change `calcLCOC`, `NETL_DEFAULTS`, `EIA_ELEC_RATES`, `HH_FORWARD_STRIP`, or `NG_BASIS_DIFFERENTIAL`.

### Goal

Upgrade the Batch tab (`BatchTab` in `src/App.jsx`, around lines 5017–5322) so that when a user uploads a spreadsheet with columns `facility_name`, `source`, `co2_capture_tpy`, `state`, each row runs through `calcLCOC` using a shared Assumptions box the user can edit, and each row is priced with **that row's state** for both electricity and natural gas. The template the user will upload uses human-readable source names (for example `"ngcc f-frame"`, `"natural gas processing"`, `"cement"`), not the internal NETL keys.

### Required changes

**1. Source alias map (human-readable → NETL key).**
Add this constant immediately above `BatchTab`:

```js
const BATCH_SOURCE_ALIASES = {
  "ammonia": "ammonia",
  "ammonia (syngas)": "ammonia",
  "ethylene oxide": "eo",
  "eo": "eo",
  "ethanol": "ethanol",
  "natural gas processing": "ngp",
  "ngp": "ngp",
  "refinery hydrogen": "refinery_h2",
  "refinery h2": "refinery_h2",
  "refinery_h2": "refinery_h2",
  "cement": "cement",
  "iron/steel (bf-bof)": "steel",
  "iron steel": "steel",
  "steel": "steel",
  "pulp & paper": "pulp_paper",
  "pulp and paper": "pulp_paper",
  "pulp_paper": "pulp_paper",
  "ngcc": "ngcc_f",
  "ngcc f-frame": "ngcc_f",
  "ngcc_f": "ngcc_f",
  "ngcc h-frame": "ngcc_h",
  "ngcc_h": "ngcc_h",
  "dac": "dac_solid",
  "dac (direct air capture)": "dac_solid",
  "dac_solid": "dac_solid",
  "doc": "doc_electrochemical",
  "doc (direct ocean capture)": "doc_electrochemical",
  "doc_electrochemical": "doc_electrochemical",
};

const resolveBatchSource = (raw) => {
  if (!raw) return null;
  const k = String(raw).toLowerCase().trim().replace(/\s+/g, " ");
  if (BATCH_SOURCE_ALIASES[k]) return BATCH_SOURCE_ALIASES[k];
  if (NETL_DEFAULTS[k]) return k; // already a valid key
  return null;
};
```

Use `resolveBatchSource(row.source)` inside `validateRow` instead of the current `String(row.source).toLowerCase().trim()` lookup. If it returns null, push `Row N: source "…" not recognized`.

**2. Assumptions box (new card, above Template Upload).**
Add a new `inputs-section` card titled `ASSUMPTIONS` that matches existing card styling (padding `12px 16px`, border `1px solid #e0e0e0`, radius `6px`, header `13px bold uppercase #1a1a1a`). It holds three controls with sensible defaults and inline default labels (use the same `DefaultRef`-style hint if present, otherwise a small `#555` subtext):

- **Capture Rate** — number input, unit `%`, default `90` (clamped 50–99). Store as `captureRate` state.
- **Build Type** — select, options `GF` and `RF`, default `GF`. Store as `buildType` state. Note next to it: "RF only applies to NGCC sources; other sources always run GF."
- **Capacity Factor** — number input, unit `%`, default `85` (clamped 40–95). Store as `capacityFactor` state.

Include a small "Reset to defaults" text button on the right side of the card header. Use `useState` hooks at the top of `BatchTab`.

**3. State-aware per-row pricing (this is the key fix).**
`calcLCOC` does **not** derive electricity or gas prices from `state` on its own — it reads `inputs.elec_price_override` and `inputs.gas_price_override` (see lines 733 and 749 in `App.jsx`). Today's `handleRun` forgets to set those, so every row silently uses Midwest defaults. Fix this.

In `handleRun`, for each validated row build inputs like:

```js
const codYear = 2026; // match the Inputs tab's default; fine to hardcode here
const elecPrice = EIA_ELEC_RATES[v.state] ?? GLOBAL_DEFAULTS.elec_price;
const hh = HH_FORWARD_STRIP[codYear] ?? 3.42;
const gasPrice = hh + (NG_BASIS_DIFFERENTIAL[v.state] ?? 0);

// Build type: respect user's selection, but only NGCC supports RF; others force GF.
const isNgcc = v.src === "ngcc_f" || v.src === "ngcc_h";
const effBuild = isNgcc ? buildType : "GF";

const inputs = {
  source: v.src,
  co2_capture_tpy: v.tonnage,
  capture_rate: captureRate / 100,
  capacity_factor: capacityFactor / 100,
  build_type: effBuild,
  location_factor: 1.0,
  cepci_current: cepciCurrent,
  state: v.state,
  project_life: srcDef.project_life ?? GLOBAL_DEFAULTS.project_life,
  elec_price_override: elecPrice,
  gas_price_override: gasPrice,
};
```

Pass `inputs` to `calcLCOC(inputs)` as before.

**4. Results columns — add state-priced inputs so the user can verify.**
Extend the `cols` array with two read-only numeric columns right after `state`:

- `elec_price` — label `Elec $/MWh`, num true, dec 2
- `gas_price` — label `Gas $/MMBtu`, num true, dec 2

Populate these in the results push:

```js
elec_price: elecPrice,
gas_price: gasPrice,
```

Also include the assumption values in each results row for auditability: `capture_rate_pct: captureRate`, `capacity_factor_pct: capacityFactor`, `build: effBuild`. Do not add them as new table columns unless they change across rows — the existing `build` column is fine.

**5. CSV export.**
Make sure the new `elec_price` and `gas_price` columns flow through `exportCSV` automatically (they will, since it iterates `cols`).

### Constraints

- Do not rename any existing state variables (`btpl`, `bres`, `brun`, `bprog`, `bsort`, `bfile`, `berrs`, `fileRef`) — CLAUDE.md forbids renaming short state names.
- Do not add external dependencies.
- Do not change the `BATCH_REQUIRED_COLS` definition or the template that `downloadTemplate` produces — just add alias support so user-authored files work.
- Keep the existing error-row behavior (`berrs` array, red text under the upload card).
- Preserve the disabled-button pattern: `canRun = btpl.length > 0 && !brun`.

### Validation — how to confirm it works

After editing, run these checks manually in the browser:

1. Upload `ccus_batch_template_filled.xlsx` (4,228 rows, sources like `ngcc f-frame` and `natural gas processing`). Every row should validate — zero entries in `berrs` from "source not recognized".
2. With default assumptions (90% / GF / 85%), click Run Batch. The Results table should show different `Elec $/MWh` and `Gas $/MMBtu` per row, matching `EIA_ELEC_RATES[state]` and `HH_FORWARD_STRIP[2026] + NG_BASIS_DIFFERENTIAL[state]`.
3. Bump Capacity Factor to 95% and re-run. LCOC should drop for every row (capex amortized over more tonnes).
4. Change Build Type to RF and re-run. Only NGCC rows should show `Build = RF`; all other sources should still show `Build = GF`, and their LCOC should be unchanged vs step 2.
5. Drop Capture Rate to 80% and re-run. LCOC $/t should rise modestly across the board.
6. Export CSV — confirm `Elec $/MWh` and `Gas $/MMBtu` columns are present with the right values.

Report back with the actual ranges you see for Elec $/MWh and Gas $/MMBtu across the uploaded file (useful sanity check — Elec should span roughly $45–$120/MWh across US states, Gas roughly $2.50–$5.50/MMBtu).
