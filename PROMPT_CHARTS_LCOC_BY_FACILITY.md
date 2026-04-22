# Add "LCOC by Facility" Chart to the Charts Tab (Drop-in Prompt)

Use this prompt to surface the Batch tab's ranked "LCOC by Facility" bar chart inside the main Charts tab so the user can view batch results alongside the source-level charts.

---

## PROMPT

You are editing `src/App.jsx` in the Capture Cost Model React app. Follow `CLAUDE.md` (single-file architecture, no new dependencies, Enverus palette) and the `ccus-charts` skill (ChartCard layout, ENVERUS_COLORS, axis tick helpers). Do NOT modify `calcLCOC`, `runBatch`, `NETL_DEFAULTS`, or the Batch tab's compute logic — the source of truth for batch data stays in `BatchTab`.

### Context

The Batch tab already renders a horizontal ranked bar chart titled "LCOC by Facility" (around lines 5154–5167) driven by `results` state local to `BatchTab`. The user wants the same chart mirrored inside the Charts tab (`ChartsTab`, defined at line 3678) so they can browse batch output without tab-switching.

Because `results` lives inside `BatchTab`, we need to lift it up to the top-level `App` component so both tabs can consume it. This is the minimal change — no global store, no context.

### The changes

**1. Lift batch results to `App`.**

Find the top of `App()` where other app-level state is declared (near `const [activeTab, setActiveTab] = useState("summary");`). Add:

```js
const [batchResults, setBatchResults] = useState(null);
```

**2. Pass the setter into `BatchTab`.**

Find the render line for the Batch tab (search for `<BatchTab`). Change it from:

```jsx
{activeTab === "batch" && <BatchTab activeScenario={activeScenario} />}
```

to:

```jsx
{activeTab === "batch" && (
  <BatchTab
    activeScenario={activeScenario}
    onResults={setBatchResults}
    externalResults={batchResults}
  />
)}
```

**3. Wire the setter inside `BatchTab`.**

Update the signature:

```js
function BatchTab({ activeScenario, onResults, externalResults }) {
```

Replace the local `const [results, setResults] = useState(null);` with a synchronized pattern so `BatchTab` still owns the input cycle but publishes results upward:

```js
const [results, setResults] = useState(externalResults ?? null);
// Keep the lifted copy in sync whenever a fresh run completes
useEffect(() => { onResults?.(results); }, [results, onResults]);
```

No other `setResults` call sites need to change.

**4. Pass `batchResults` into `ChartsTab`.**

At the `<ChartsTab ... />` render site (around line 2700), add a prop:

```jsx
<ChartsTab
  result={result}
  cashFlowResult={cashFlowResult}
  activeSource={activeSource}
  activeScenario={activeScenario}
  scenarios={scenarios}
  baseInputs={{ ... }}
  techKey={techKey}
  onSelectSource={...}
  onSelectState={...}
  batchResults={batchResults}
/>
```

**5. Add `batchResults` to the `ChartsTab` signature.**

```js
function ChartsTab({ result, cashFlowResult, activeSource, activeScenario, scenarios, baseInputs, techKey, onSelectSource, onSelectState, batchResults }) {
```

**6. Render a new Chart 9 card at the bottom of `ChartsTab`.**

Find the closing marker `{/* end Chart 8 wrapper */}` (around line 4664). Immediately after that closing `</div>`, add:

```jsx
{/* Chart 9 — Batch LCOC by Facility — full width */}
<div style={{ width: "100%", marginBottom: 32 }}>
  <ChartCard title="LCOC by Facility (Batch)">
    {!batchResults || batchResults.filter(r => r._status === "success").length === 0 ? (
      <div style={{ fontSize: 13, color: "#999999", padding: "32px 8px", textAlign: "center" }}>
        No batch results yet. Upload a template and click Run Batch in the Batch tab to populate this chart.
      </div>
    ) : (() => {
      const success = batchResults.filter(r => r._status === "success");
      const sorted = [...success].sort((a, b) => a.lcoc - b.lcoc);
      const chartData = sorted.map(r => ({
        name: r.facility_name,
        lcoc: r.lcoc,
        source: NETL_DEFAULTS[r.source]?.label ?? r.source,
        co2: Number(r.co2_capture_tpy),
      }));
      const maxLcoc = Math.max(...chartData.map(d => d.lcoc), 0);
      const interval = maxLcoc <= 50 ? 5 : maxLcoc <= 100 ? 10 : maxLcoc <= 200 ? 20 : 25;
      const domainMax = Math.ceil(maxLcoc / interval) * interval;
      const ticks = [];
      for (let t = 0; t <= domainMax; t += interval) ticks.push(t);
      return (
        <>
          <div style={{ fontSize: 12, color: "#999999", marginBottom: 8 }}>
            {success.length} facilities ranked by Gross LCOC — lowest cost at top.
          </div>
          <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 140, right: 40, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" horizontal={false} />
              <XAxis type="number" domain={[0, domainMax]} ticks={ticks}
                tick={{ fill: "#555555", fontSize: 12 }}
                axisLine={{ stroke: "#e0e0e0" }}
                tickFormatter={v => `$${v}`} />
              <YAxis dataKey="name" type="category" width={130}
                tick={{ fill: "#555555", fontSize: 11 }}
                axisLine={{ stroke: "#e0e0e0" }} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 4, fontSize: 12 }}
                formatter={(v, name, props) => {
                  const row = props.payload;
                  return [`$${f(v, 2)}/t  |  ${row.source}  |  ${row.co2?.toLocaleString()} t/yr`, "LCOC"];
                }}
              />
              <Bar dataKey="lcoc" fill="#58b947" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </>
      );
    })()}
  </ChartCard>
</div>
```

Notes on standards compliance (per `ccus-charts` skill):
- Bar fill `#58b947` (Enverus green) — the primary totals color.
- Axis ticks are whole-number `$X` with a round interval picked from the data range (mirrors `generateAxisTicks`).
- Grid uses `#e0e0e0`, axis text `#555555`, muted note `#999999` — all from `THEME`.
- Empty state surfaces when there are no successful batch rows rather than rendering a broken chart.
- No divider under the card title; `ChartCard` already handles padding/border/title styling.

### Do not change

- `BatchTab` compute logic, validation, or progress tracking.
- The Batch-tab-native "LCOC by Facility" chart at line 5154 — it stays put so users viewing the Batch tab still see their ranking in context.
- `ChartsTab` Charts 1–8 — insert the new card strictly after Chart 8's wrapper.
- `calcLCOC` / scenario override precedence.

### Validation

1. Open the Charts tab before running a batch. Scroll to the bottom — Chart 9 card "LCOC by Facility (Batch)" is visible with the empty-state hint.
2. Open the Batch tab, upload `ccus_batch_template_cleaned.xlsx`, click Run Batch, wait for completion. Switch back to the Charts tab. Chart 9 now renders a horizontal bar per successful facility, sorted ascending by LCOC (cheapest at top).
3. Hover any bar — tooltip shows `$X.XX/t  |  <Source label>  |  <tonnes> t/yr`.
4. Delete a facility in the Batch tab and re-run. Chart 9 updates accordingly after the new run completes.
5. Switch scenarios in the Inputs tab and re-run the Batch. Chart 9 reflects the new scenario's LCOC values.
6. Confirm no console errors and that Charts 1–8 render unchanged.

### Why lift state instead of recomputing

Running the batch can touch thousands of rows and seconds of wall time. Recomputing inside `ChartsTab` on every render would hammer the CPU and could diverge from what the user sees in the Batch tab if any assumption inputs differ. Lifting `batchResults` to `App` keeps a single source of truth, avoids recomputation, and lets the Charts tab react instantly to fresh batch runs.
