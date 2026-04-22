# Relabel "tpy" → "tpa" Across the App (Drop-in Prompt)

Use this prompt to switch all user-visible references from "tpy" (tonnes per year) to "tpa" (tonnes per annum, the more common industry convention) **without** breaking internal field names that `calcLCOC` and `NETL_DEFAULTS` depend on.

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Follow `CLAUDE.md` conventions (single-file architecture, no dependency changes, preserve short state names). This is a labeling change only — do not alter any numeric values, formulas, or the contract of `calcLCOC`.

### Scope — what to change and what to leave alone

**Change (user-visible strings only):**
- Any displayed label containing `tpy` → `tpa`. Example: `"CO₂ tpy"` → `"CO₂ tpa"`.
- Any displayed unit containing `t/yr` → `t/a`. Example: `unit="t/yr"` where `t/yr` is rendered in the UI.
- Column header in the Batch results table and CSV export: `CO₂ tpy` → `CO₂ tpa`.
- Header row written by `BatchTab.downloadTemplate` and read by `BatchTab.handleUpload`: add `co2_capture_tpa` as the preferred header but keep `co2_capture_tpy` working as a backward-compatible alias (many existing user files still use `tpy`).

**Leave unchanged (these are internal identifiers, not labels):**
- JS object keys and variable names such as `co2_capture_tpy`, `co2_tpy`, `ref_co2_capture_tpy`, `actual_co2_tpy`, `ref_co2_tpy`, the `co2_tpy` results-row key, and every `co2_per_year` variable. Renaming them risks silently breaking `calcLCOC`, scaling ratio logic, scenario overrides, and chart data.
- The `co2_capture_tpy` property inside the `inputs` object passed to `calcLCOC` (line ~5177 area).
- Anything in comments that documents a formula — comments are fine, just don't rename an identifier they reference.

### Implementation details

**1. Batch results table column label.**
In `BatchTab.cols`, change `{ key: "co2_tpy", label: "CO₂ tpy", ... }` to `{ key: "co2_tpy", label: "CO₂ tpa", ... }`. Leave the `key` untouched — only the `label` string changes.

**2. Batch template header — accept both tpy and tpa.**
Inside `BatchTab.handleUpload`, after the existing `normRows` builds (which already lowercases keys), add a compatibility shim before the missing-columns check:

```js
// Accept legacy "co2_capture_tpy" header as an alias for the preferred "co2_capture_tpa"
normRows = normRows.map(r => {
  if (!("co2_capture_tpa" in r) && "co2_capture_tpy" in r) {
    return { ...r, co2_capture_tpa: r.co2_capture_tpy };
  }
  return r;
});
```

Then change `BATCH_REQUIRED_COLS` from:

```js
const BATCH_REQUIRED_COLS = ["facility_name", "source", "co2_capture_tpy", "state"];
```

to:

```js
const BATCH_REQUIRED_COLS = ["facility_name", "source", "co2_capture_tpa", "state"];
```

And in `validateRow`, change the line that reads the tonnage so it also looks under the new key first:

```js
const tonnageRaw = row.co2_capture_tpa ?? row.co2_capture_tpy;
```

**3. Downloaded template.**
In `BatchTab.downloadTemplate`, rename the row keys from `co2_capture_tpy` to `co2_capture_tpa` in the seed rows and pass `{ header: BATCH_REQUIRED_COLS }` as today. File name stays `facility_template.xlsx`.

**4. Other user-visible spots.**
Search for any remaining user-visible `"tpy"` or `"t/yr"` strings in JSX/labels (Inputs tab plant capacity when `capacity_basis === "t_co2_yr"`, tooltips, Assumptions tab tables, etc.) and replace with `"tpa"` / `"t/a"` respectively. Use case-insensitive search, but only edit string literals that are clearly labels — not code comments that document internal reference values.

**5. Nothing in `NETL_DEFAULTS` changes.**
Keys like `ref_co2_capture_tpy: 413163` stay as-is — they are internal reference constants keyed by name inside `calcLCOC` via `getParam(src, "ref_co2_capture_tpy", scenario)`. Renaming them would require synchronized edits across `calcLCOC`, `scalingRatio`, scenario overrides, and the Assumptions tab — out of scope for a labeling change.

### Validation

1. Load the app and confirm the Batch tab's Results table column header now reads `CO₂ tpa`.
2. Click `Download Template` — open the downloaded `facility_template.xlsx` and verify its header row shows `co2_capture_tpa` (not `tpy`).
3. Upload `ccus_batch_template_cleaned.xlsx` (which still uses `co2_capture_tpy`). It must still load with zero validation errors — the backward-compatibility shim accepts both headers.
4. Upload a fresh template downloaded from the app (header is `co2_capture_tpa`). It must also load cleanly.
5. Check the Inputs tab: any tonnage field previously displaying `t/yr` now displays `t/a`.
6. Run a single-source scenario in the Model tab — `Gross LCOC $/t` should be unchanged vs. the prior run (this is a labeling change, not a math change).
7. Export Batch results to CSV — column header in the file should read `CO₂ tpa`.

### Why this split (labels vs. keys)

"tpy" and "tpa" are interchangeable notations for the same quantity, but internal JS object keys like `co2_capture_tpy` are load-bearing — `calcLCOC`, scenario overrides, sensitivity deltas, and chart projections all index into them by string. A blind find-and-replace across all 78 occurrences of "tpy" in `App.jsx` would break the app. This prompt scopes the change to display strings only and preserves identifier continuity.
