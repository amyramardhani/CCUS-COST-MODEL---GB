# Batch Tab — Assumptions Card UI Prompt (Drop-in)

Use this prompt to add the Assumptions UI to the existing `BatchTab` in `src/App.jsx`. The state (`captureRate`, `buildType`, `capacityFactor`), the alias resolver, and the per-row state-aware power/fuel pricing are already wired. What's missing is the visible Assumptions card, the `Elec $/MWh` / `Gas $/MMBtu` columns in the results table, and a Reset button for the assumptions.

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Follow `CLAUDE.md` conventions: single-file architecture, short state names (`btpl`, `bres`, `brun`, `bprog`, `bsort`, `bfile`, `berrs`), Enverus palette, existing card styles (`padding: "12px 16px"`, `border: "1px solid #e0e0e0"`, `borderRadius: 6`, header `fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "#1a1a1a"`). Only edit `BatchTab`. Do not touch `calcLCOC`, `NETL_DEFAULTS`, `EIA_ELEC_RATES`, `HH_FORWARD_STRIP`, or `NG_BASIS_DIFFERENTIAL`.

### What is already in place (do not duplicate)

- State vars `captureRate` (default 90), `buildType` (default "GF"), `capacityFactor` (default 85), plus `resetAssumptions`, `clampCR`, `clampCF`.
- `BATCH_SOURCE_ALIASES` and `resolveBatchSource(raw)` above `BatchTab`.
- `validateRow` uses `resolveBatchSource`.
- `handleRun` already computes `elecPrice` from `EIA_ELEC_RATES[v.state]` and `gasPrice` from `HH_FORWARD_STRIP[2026] + NG_BASIS_DIFFERENTIAL[v.state]`, forces `effBuild = isNgcc ? buildType : "GF"`, and passes `capture_rate`, `capacity_factor`, `build_type`, `elec_price_override`, `gas_price_override` into `calcLCOC`.
- Results rows already include `elec_price`, `gas_price`, `capture_rate_pct`, `capacity_factor_pct`.

### What to add

**1. Assumptions card (new, rendered above the Template Upload card).**
Place it as the first child of the returned `<div className="sensitivity-tab">`, above the existing `{/* Card 1: Template Upload */}` card. Use the same outer card styling as the Template Upload card. Header text: `ASSUMPTIONS`. Put a "Reset" text button on the right side of the header that calls `resetAssumptions`.

Inside the card, lay out three field rows in a single horizontal flex row (`display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap"`). Match the row style used in the Inputs tab (see lines ~1986–2024 and ~2061–2082 of `App.jsx`). Each row is a compact label + control pair.

Row contents:

- **Capture Rate** — label `Capture Rate` (12px `#555555`), number input (width 70, right-aligned, 1px #e0e0e0 border, radius 3, padding `3px 6px`, fontSize 13, color `#1a1a1a`), `%` suffix (11px `#999999`), value bound to `captureRate`, `onChange={(e) => setCaptureRate(clampCR(parseFloat(e.target.value) || 0))}`, `onFocus={(e) => e.target.select()}`. To the right, a small default hint: `Default: 90%` in 11px `#999999`.

- **Build Type** — label `Build Type`, then a toggle group using the existing `toggle-group` / `toggle-btn` classes:

  ```jsx
  <div className="toggle-group">
    <button className={`toggle-btn ${buildType === "GF" ? "active" : ""}`} onClick={() => setBuildType("GF")}>GF</button>
    <button className={`toggle-btn ${buildType === "RF" ? "active" : ""}`} onClick={() => setBuildType("RF")}>RF</button>
  </div>
  ```

  Add a small note to the right of the toggle in 11px `#999999`: `Applies to NGCC only; other sources run GF.`

- **Capacity Factor** — same control pattern as Capture Rate. Value bound to `capacityFactor`, `onChange={(e) => setCapacityFactor(clampCF(parseFloat(e.target.value) || 0))}`. Default hint: `Default: 85%`.

**2. Surface `Elec $/MWh` and `Gas $/MMBtu` in the Results table.**
In the `cols` array (currently ending with `gross_lcoc_per_t`), insert two new entries immediately after the `state` column so they render and export via the existing table and `exportCSV`:

```js
{ key: "elec_price", label: "Elec $/MWh", num: true, dec: 2 },
{ key: "gas_price",  label: "Gas $/MMBtu", num: true, dec: 2 },
```

Do not change the order of any other columns.

**3. Small UX polish.**
- When `brun` is true, disable all three assumption controls (`disabled={brun}` on the inputs and toggle buttons). Changing assumptions mid-run should not silently corrupt the in-flight results.
- Do not gate `canRun` on the assumption values — defaults are always valid inside the clamps.

### Constraints

- No new dependencies, no file splits.
- Do not rename any existing state vars.
- Do not add the Assumptions values as additional table columns (they are already captured per-row in `capture_rate_pct` / `capacity_factor_pct` / `build` and appear in the header card instead).
- Keep everything inside `BatchTab`.

### Validation

After editing, reload `http://localhost:5173/ccus-tea/` and click the Batch tab. You should see:

1. A new **ASSUMPTIONS** card at the top with Capture Rate (90%), Build Type (GF selected), Capacity Factor (85%), and a Reset button on the header right.
2. Uploading `ccus_batch_template_filled.xlsx` loads 4,228 rows with zero "source not recognized" errors.
3. Running the batch populates results with two new numeric columns: `Elec $/MWh` varying per state (expect ~$45–$120) and `Gas $/MMBtu` varying per state (expect ~$2.50–$5.50).
4. Changing Capacity Factor to 95% and re-running lowers `Gross LCOC $/t` on every row.
5. Changing Build Type to RF and re-running affects only rows whose `build` column shows `RF` (NGCC F-frame and H-frame); every other row still shows `GF` and unchanged LCOC.
6. Dropping Capture Rate to 80% and re-running raises `Gross LCOC $/t` modestly across the board.
7. The Reset button restores 90 / GF / 85 without clearing uploaded rows or results.
8. `Export to CSV` includes the two new columns.
