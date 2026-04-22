# Batch Tab — Make Output Match Inputs/Model Tab (Drop-in Prompt)

Use this prompt to eliminate the known discrepancies between `BatchTab` and the Inputs/Model tab when both call `calcLCOC` with the same source, state, and captured tonnage. After this change, a row in the Batch results table and the same facility entered manually in the Inputs tab should produce the same `Gross LCOC $/t` (assuming the user has not altered technology, WACC, or hurdle-rate defaults in the Inputs tab).

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Follow `CLAUDE.md` conventions (single-file architecture, no new dependencies, short state names, Enverus palette). Do not modify `calcLCOC`, `NETL_DEFAULTS`, `TECH_MULTIPLIERS`, `EIA_ELEC_RATES`, `HH_FORWARD_STRIP`, or `NG_BASIS_DIFFERENTIAL`.

### Context — what calcLCOC receives from each tab today

The Inputs/Model tab (useMemo around line 1681) passes to `calcLCOC(inputs, activeScenario)`:

```
source, co2_capture_tpy (= co2_captured, already × capture_rate),
capacity_factor, build_type, location_factor=1.0,
elec_price_override, gas_price_override, tech_multiplier (effectiveTechMult),
dac_tech_type, cepci_current, debt_pct, cost_of_debt, cost_of_equity,
project_life (user state, defaults 30), state, use_fixed_hurdle_rate, fixed_hurdle_rate
```

The Batch tab's `handleRun` currently passes:

```
source, co2_capture_tpy (= v.tonnage raw), capture_rate (NO-OP — calcLCOC never reads this),
capacity_factor, build_type, location_factor=1.0, cepci_current,
state, project_life (= srcDef.project_life), elec_price_override, gas_price_override
```

and calls `calcLCOC(inputs)` with **no second argument**, so every scenario override is ignored.

Five concrete discrepancies result:

1. `capture_rate` slider in the Batch Assumptions card does nothing — `calcLCOC` has no branch that reads `inputs.capture_rate`.
2. Scenario overrides (`scenario.overrides`) are never applied in Batch.
3. `codYear` for gas pricing is hardcoded to 2026 in Batch; the Inputs tab reads the App-level `codYear` state.
4. `project_life` differs for DAC (25) and DOC (20) sources because Batch uses `srcDef.project_life` while the Inputs tab uses the user's `projectLife` state which defaults to 30.
5. Batch never passes `tech_multiplier`, `dac_tech_type`, `debt_pct`, `cost_of_debt`, `cost_of_equity`, `use_fixed_hurdle_rate`, or `fixed_hurdle_rate`. For the default Inputs-tab configuration (amine MEA, NETL financial defaults, computed WACC, solid-sorbent DAC) these all resolve to the same values `calcLCOC` would compute from `getParam` + `GLOBAL_DEFAULTS`, so this item only matters if the user has customized those fields in the Inputs tab. We will document that caveat in the Assumptions card rather than wire every control through.

### The changes

**1. Pass `activeScenario` and `codYear` from `App` into `BatchTab`.**

Find the render line (around line 2753):

```jsx
{activeTab === "batch" && <BatchTab costYear={costYear} />}
```

Change to:

```jsx
{activeTab === "batch" && <BatchTab costYear={costYear} codYear={codYear} activeScenario={activeScenario} />}
```

Update the `BatchTab` component signature accordingly:

```js
function BatchTab({ costYear, codYear, activeScenario }) {
```

**2. Use the App's `codYear` when computing gas price (not hardcoded 2026).**

Inside `handleRun`, replace:

```js
const codYear = 2026;
```

with a removal — drop that line entirely, since `codYear` is now a prop. Then where gas price is computed:

```js
const hh = HH_FORWARD_STRIP[codYear] ?? 3.42;
```

stays the same but now references the prop.

**3. Pass `activeScenario` as the second argument to `calcLCOC`.**

Find the call site inside `handleRun`:

```js
const r = calcLCOC(inputs);
```

Change to:

```js
const r = calcLCOC(inputs, activeScenario);
```

**4. Apply capture rate correctly — no longer a no-op.**

The spreadsheet column `co2_capture_tpy` represents captured CO₂ at the NETL baseline capture rate of 90%. To apply a different user-selected capture rate, back-calculate produced CO₂ from that 90% baseline and re-apply the new rate — mirroring `buildInputsForSensitivity`'s `capture_rate` branch (lines 1147–1148). This way the Capture Rate slider meaningfully changes output and matches what the Inputs tab does when a user edits the capture-rate field.

Inside `handleRun`, where `inputs` is constructed, replace the line:

```js
co2_capture_tpy: v.tonnage,
capture_rate: captureRate / 100,
```

with:

```js
// Treat spreadsheet tpy as captured at NETL baseline (90%). Back-calculate produced
// and re-apply the user's capture rate so the Assumptions-card slider actually affects output.
const baselineCaptureRate = 0.90;
const co2_produced_implied = v.tonnage / baselineCaptureRate;
const co2_captured_effective = co2_produced_implied * (captureRate / 100);
```

Then in the `inputs` object:

```js
co2_capture_tpy: co2_captured_effective,
```

Remove the `capture_rate:` line entirely from the `inputs` object — it is unused by `calcLCOC`.

**5. Use `GLOBAL_DEFAULTS.project_life` (30) to match the Inputs tab default.**

Inside the `inputs` object, replace:

```js
project_life: srcDef.project_life ?? GLOBAL_DEFAULTS.project_life,
```

with:

```js
project_life: GLOBAL_DEFAULTS.project_life,
```

This aligns Batch with the Inputs tab's default `projectLife` state (30 years) across all sources. DAC and DOC will no longer silently use their shorter NETL-recommended lives (25 and 20) unless the user explicitly asks for that in a future change.

**6. Surface the effective captured tonnage in the Results table, not the raw spreadsheet value.**

In the `results.push({ ... })` block, change:

```js
co2_tpy: v.tonnage,
```

to:

```js
co2_tpy: co2_captured_effective,
```

This way the `CO₂ tpy` column always shows the tonnage that was actually used inside `calcLCOC`, which is what the user expects after adjusting the capture rate.

**7. Add a footnote to the Assumptions card documenting what Batch does NOT carry over.**

Underneath the three assumption controls, add a small `11px #999999` note:

> Batch uses NETL default technology (amine MEA), WACC, debt/equity mix, and computed hurdle rate. To model alternate technology, fixed hurdle rates, or custom WACC, use the Inputs tab for single-facility analysis. Scenario overrides from the active scenario ARE applied.

### Do not change

- The validation rules in `validateRow` — tonnage must still be > 0, state must still be two letters.
- The GF/RF per-source flag logic (`srcDef?.gf_only ? "GF" : srcDef?.rf_only ? "RF" : buildType`).
- The output sanity checks (NaN/Infinity guard and $5–$2,000/t plausibility band).
- The column set in `cols`, aside from the existing `co2_tpy`, `elec_price`, `gas_price` entries.
- The Assumptions-card state vars and defaults (90 / GF / 85).

### Validation

After editing, reload the app.

1. In the Inputs/Model tab, pick "Ammonia (Syngas)" with state LA, CO₂ Captured = 2,100,000 tpy, capture rate 90%, capacity factor 85%, build type GF, technology amine MEA, scenario "NETL Default", computed WACC (not fixed hurdle). Note the `Gross LCOC $/t`.
2. In the Batch tab, upload a one-row template with `CF Industries Donaldsonville, ammonia, 2100000, LA`. Assumptions card: 90 / GF / 85. Run. The Batch row's `Gross LCOC $/t` should match step 1 to within $0.05/t.
3. Change Batch Capacity Factor to 95% and re-run. `Gross LCOC $/t` should drop. Go back to the Inputs tab, change capacity factor to 95%, recompute — the two values should still match.
4. Change Batch Capture Rate to 80% and re-run. `Gross LCOC $/t` should rise. In the Inputs tab, set CO₂ Captured back to 2,100,000 and capture rate to 80%, leave CO₂ Produced blank so it back-calculates — the values should match.
5. Switch the active scenario to something with overrides (e.g. a scenario that bumps ammonia CAPEX by +10%). Re-run the Batch. The ammonia row should reflect that scenario's override because Batch now passes `activeScenario` to `calcLCOC`.
6. Confirm no regression on the 4,164-row cleaned spreadsheet — error count unchanged, LCOC distribution shifts slightly (Capture Rate applied, project life now 30 for all sources including DAC/DOC if present).

### Why these specific edits

The Inputs tab and Batch tab both ultimately call `calcLCOC`, but they've drifted on which fields they hand in. The four fields above (`activeScenario`, `codYear`, effective capture rate, project life) are the ones where Batch was silently defaulting in a way that diverges from a fresh Inputs-tab session. The remaining fields (`tech_multiplier`, `debt_pct`, `cost_of_debt`, `cost_of_equity`, `use_fixed_hurdle_rate`, `fixed_hurdle_rate`, `dac_tech_type`) all default to values inside `calcLCOC` that match the Inputs-tab's initial defaults — so they only cause drift if the user has actively changed them in the Inputs tab, and that's a UX decision (give Batch its own tech/finance controls) rather than a bug fix.
