# BatchTab — LCOC Output Sanity Checks (Drop-in Prompt)

Use this prompt to add output-side validation on `calcLCOC` results so NaN / Infinity / zero / implausible LCOC values are flagged instead of silently appearing in the Results table.

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Follow `CLAUDE.md` conventions. Only touch `BatchTab.handleRun`. Do not modify `calcLCOC`, `validateRow`, or `NETL_DEFAULTS`.

### Context

Inside `BatchTab.handleRun`, each validated row is run through `calcLCOC(inputs)` and the result is pushed onto `results[]` and later rendered in the Results table. Today, every returned value is trusted — if `calcLCOC` ever returns `NaN`, `Infinity`, `0`, or a negative `lcoc` (for example from a divide-by-zero on a malformed row, a missing NETL field, or a numeric edge case), the row still lands in the table displaying nonsense.

`validateRow` already rejects `co2_capture_tpy <= 0` on the input side, so the common cause (zero tonnage) is handled up front. This prompt adds a belt-and-suspenders check on the output side, plus a plausibility-band warning.

### The change

Inside `BatchTab.handleRun`, find the block that starts with `const r = calcLCOC(inputs);` and ends with the closing `});` of `results.push({ ... })`. Replace that whole block with:

```js
const r = calcLCOC(inputs);
// Sanity check: LCOC must be a finite positive number. If calcLCOC returned
// NaN/Infinity/<=0 (e.g. zero tonnage slipped through, or a divide-by-zero),
// skip the row and surface an error instead of showing garbage in the table.
const lcoc = r.lcoc;
if (!Number.isFinite(lcoc) || lcoc <= 0) {
  validationErrors.push(`Row ${v.rowNum} (${v.name}): LCOC computed as ${lcoc} — row skipped`);
} else {
  // Implausible range warning (keeps the row but flags it)
  if (lcoc < 5 || lcoc > 2000) {
    validationErrors.push(`Row ${v.rowNum} (${v.name}): LCOC $${lcoc.toFixed(2)}/t is outside the plausible $5–$2000/t band`);
  }
  results.push({
    facility_name: v.name,
    source: v.src,
    source_label: srcDef.label,
    build: effBuild,
    state: v.state,
    co2_tpy: v.tonnage,
    elec_price: elecPrice,
    gas_price: gasPrice,
    capture_rate_pct: captureRate,
    capacity_factor_pct: capacityFactor,
    total_capex_mm: (r.details?.capex_k ?? 0) / 1000,
    capex_per_t: r.components?.capital ?? 0,
    fixed_om_per_t: r.components?.fixed_om ?? 0,
    variable_om_per_t: r.components?.variable_om ?? 0,
    power_per_t: r.components?.power ?? 0,
    fuel_per_t: r.components?.fuel ?? 0,
    gross_lcoc_per_t: lcoc,
  });
}
```

Keep the surrounding `try { ... } catch (err) { validationErrors.push(...) }` wrapper and the progress-tick / requestAnimationFrame lines exactly as they are.

### Do not change

- The input-side tonnage/state/source validation in `validateRow` — leave it enforcing `co2_capture_tpy > 0`.
- The `berrs` rendering block in the JSX — it already prints `validationErrors` entries in red.
- The plausibility band thresholds unless the user specifies otherwise — `$5–$2,000/t` is intentionally wide to only catch obviously broken rows (real-world LCOC spans roughly $20–$600/t).

### Validation

1. Upload `ccus_batch_template_cleaned.xlsx` and run with default Assumptions (90% / GF / 85%). All 4,164 rows should produce finite positive LCOC values. The red error area should show at most a small number of plausibility-band warnings for outlier facilities — no "skipped" errors.
2. Manually author a one-row template with `co2_capture_tpy = 0.0001` (tiny but positive so `validateRow` accepts it). This row will produce a very high LCOC and should trigger the ">$2000/t" warning while still appearing in Results.
3. Hard-reject case: temporarily edit a `NETL_DEFAULTS[...]` entry to make `ref_tpc_k = 0` (divide by zero in calcLCOC). Re-run — that source's rows should now be pushed to `berrs` with "LCOC computed as NaN — row skipped", and Results should exclude them. Revert the edit after testing.

### Why it matters

LCOC is `annual_cost / annual_tonnes`. A zero-tonnage plant still has fixed costs, so its true per-tonne cost is undefined, not zero — showing it as $0/t would make a non-operating facility look like the cheapest capture option on any downstream chart. The output guard also protects against silent regressions if `calcLCOC` is modified in a way that returns non-finite values for an edge case nobody tested.
