# BatchTab — Respect Per-Source GF/RF Flags (Drop-in Prompt)

Use this prompt to make the Batch tab's build-type handling match the Inputs tab: honor each source's `gf_only` / `rf_only` flag in `NETL_DEFAULTS`, and fall back to the user's Assumptions-box selection for sources that allow either.

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Follow `CLAUDE.md` conventions (single-file architecture, short state names, Enverus palette, no dependency changes). Only touch `BatchTab.handleRun`. Do not modify `NETL_DEFAULTS`, `calcLCOC`, or the validation step.

### Context

`NETL_DEFAULTS` already tags each source:

- `dac_solid` and `doc_electrochemical` have `gf_only: true` — no retrofit concept (no host plant to bolt capture onto).
- `steel` has `rf_only: true` — no new BF-BOF plants are being built, so only retrofit is realistic.
- Every other source (`ammonia`, `eo`, `ethanol`, `ngp`, `refinery_h2`, `cement`, `pulp_paper`, `ngcc_f`, `ngcc_h`) has neither flag and legitimately supports both GF and RF.

The Inputs tab already respects these flags (see lines ~1811–1813 and the disabled-button logic at ~2014–2021). The Batch tab currently does not — it hardcodes GF for every non-NGCC row, which is wrong for steel, cement, ammonia, EO, ethanol, NGP, refinery H2, and pulp & paper.

### The change

Inside `BatchTab.handleRun`, locate these two lines (they appear immediately after the `gasPrice` calculation):

```js
const isNgcc = v.src === "ngcc_f" || v.src === "ngcc_h";
const effBuild = isNgcc ? buildType : "GF";
```

Replace them with:

```js
// Honor per-source build flags: gf_only forces GF, rf_only forces RF, otherwise use user's selection
const effBuild = srcDef?.gf_only ? "GF" : srcDef?.rf_only ? "RF" : buildType;
```

`srcDef` is already defined on the prior line as `NETL_DEFAULTS[v.src]`, so no new lookups are needed.

### Do not change

- The Assumptions-card `buildType` state (defaults to `"GF"`).
- The Inputs-tab build-type logic (already correct).
- `deriveBuildType` inside `validateRow` — its return value `v.bt` is unused after this edit; leave it alone rather than risking unrelated regressions.
- The `build` column in the Results table (`r.build = effBuild` continues to reflect the resolved build type per row).

### Validation

After editing, reload the page, open the Batch tab, upload `ccus_batch_template_cleaned.xlsx`, and run with Build Type = RF in the Assumptions card. Expected behavior:

1. Every `steel` row shows `Build = RF` regardless of the toggle (flag-forced).
2. `ammonia`, `eo`, `ethanol`, `ngp`, `refinery_h2`, `cement`, `pulp_paper`, `ngcc_f`, `ngcc_h` rows all show `Build = RF`.
3. Switch Build Type to GF and re-run — those same rows flip to `Build = GF`, but any `steel` row stays `Build = RF`.
4. If `dac_solid` or `doc_electrochemical` rows are present (not in your current file, but possible), they stay `Build = GF` regardless of the toggle.
5. `Gross LCOC $/t` changes between the two runs for any source whose build flag isn't forced (CAPEX goes up with RDF on RF).

### Why it matters

RDF (Retrofit Difficulty Factor) in `NETL_DEFAULTS` ranges from 1.01 (HP sources) to 1.05 (most LP sources) to 1.09 (NGCC). `calcLCOC` only applies RDF when `build_type === "RF"` (see line 645). Hardcoding GF for non-NGCC rows silently zeroes out the retrofit premium for every steel / cement / refinery H2 / pulp & paper facility in the batch, underestimating their CAPEX by 1–9%.
