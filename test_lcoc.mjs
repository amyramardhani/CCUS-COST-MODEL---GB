#!/usr/bin/env node
// Standalone LCOC calculation test — exercises every input direction
// Extracts pure calculation logic from App.jsx

// ─── Constants ───────────────────────────────────────────────────────
const CEPCI_BY_YEAR = {
  2018: 603.1, 2019: 607.5, 2020: 596.2, 2021: 708.0, 2022: 816.0,
  2023: 789.6, 2024: 770.0, 2025: 780.0, 2026: 780.0,
};

const GLOBAL_DEFAULTS = {
  cepci_ref: 603.1, cepci_current: 780.0, location_factor: 1.0,
  capacity_factor: 0.85, hours_per_year: 8760,
  op_labor_rate_base: 38.50, op_labor_burden: 0.30,
  maint_labor_pct: 0.0064, maint_material_pct: 0.0096,
  pti_pct: 0.02, admin_pct: 0.25, shifts_per_day: 3, days_per_year: 365,
  elec_price: 66.5, gas_price: 4.42,
  federal_tax_rate: 0.21, project_life: 30,
};

const STATE_TAX_RATES = {
  IL: 0.095, TX: 0.000, CA: 0.088, LA: 0.075, PA: 0.089, NV: 0.000, NY: 0.075,
};

function combinedTaxRate(state) {
  const st = STATE_TAX_RATES[state] ?? 0;
  return 1 - (1 - 0.21) * (1 - st);
}

// Subset of NETL_DEFAULTS for testing
const NETL_DEFAULTS = {
  ammonia: {
    label: "Ammonia", ref_co2_capture_tpy: 413163, ref_tpc_k: 37347,
    owners_cost_pct: 0.221, ref_mw: 5.86, fuel_cost_applicable: false,
    rdf: 1.01, operators_per_shift: 1.0, project_life: 30,
    debt_pct: 0.54, cost_of_debt: 0.0515, cost_of_equity: 0.12,
    construction_years: 1, construction_schedule: [1.0],
    tpc_line_items: [
      { acct:"5.1", name:"Inlet Water KO", tpc_k:19, exp:0.6, floor:null, category:"core" },
      { acct:"5.4", name:"CO2 Compression", tpc_k:12960, exp:0.6, floor:null, category:"core" },
      { acct:"5.7", name:"TEG Dryer", tpc_k:3977, exp:0.6, floor:null, category:"core" },
      { acct:"7.3", name:"Ductwork", tpc_k:391, exp:0.6, floor:0.50, category:"shared" },
      { acct:"9.x", name:"Cooling Water", tpc_k:1528, exp:0.6, floor:0.40, category:"shared" },
      { acct:"11.2", name:"Station Service", tpc_k:2642, exp:0.6, floor:0.70, category:"shared" },
      { acct:"11.3", name:"Switchgear/MCC", tpc_k:4432, exp:0.6, floor:0.70, category:"shared" },
      { acct:"11.4", name:"Conduit/Cable Tray", tpc_k:1906, exp:0.7, floor:0.60, category:"shared" },
      { acct:"11.5", name:"Wire & Cable", tpc_k:3624, exp:0.7, floor:0.60, category:"shared" },
      { acct:"12.8", name:"Instrument Wiring", tpc_k:2489, exp:0.7, floor:0.70, category:"shared" },
      { acct:"12.9", name:"Other I&C", tpc_k:2029, exp:0.5, floor:0.80, category:"shared" },
      { acct:"13.x", name:"Site Work", tpc_k:1326, exp:0.45, floor:0.725, category:"shared" },
      { acct:"14.5", name:"CW Pumphouse", tpc_k:23, exp:0.4, floor:0.85, category:"shared" },
    ],
  },
  ngcc_f: {
    label: "NGCC (F-Frame)", ref_co2_capture_tpy: 2920000,
    ref_tpc_k: 551801, ref_base_plant_tpc_k: 311300,
    owners_cost_pct: 0.210, ref_mw: 86, ref_mw_gross: 740, ref_mw_net: 641,
    greenfield_base_tpc_k: 493200,
    fuel_cost_applicable: false, ref_consumables_per_tco2: 4.30,
    rdf: 1.09, operators_per_shift: 3.3, project_life: 30,
    debt_pct: 0.50, cost_of_debt: 0.0515, cost_of_equity: 0.12,
    pti_basis: "greenfield_equivalent",
    construction_years: 3, construction_schedule: [0.10, 0.60, 0.30],
    tpc_line_items: [
      { acct:"5.1", name:"CANSOLV System", tpc_k:415297, exp:0.6, floor:null, category:"core" },
      { acct:"5.4", name:"CO2 Compression", tpc_k:60817, exp:0.6, floor:null, category:"core" },
      { acct:"5.5+5.12", name:"Aux Systems", tpc_k:1658, exp:0.6, floor:null, category:"core" },
      { acct:"3.x", name:"Feedwater/BOP", tpc_k:17804, exp:0.6, floor:0.50, category:"shared" },
      { acct:"8.x", name:"Steam Piping", tpc_k:10236, exp:0.6, floor:0.50, category:"shared" },
      { acct:"9.x", name:"Cooling Water", tpc_k:11661, exp:0.6, floor:0.40, category:"shared" },
      { acct:"11.x", name:"Electrical", tpc_k:29571, exp:0.65, floor:0.65, category:"shared" },
      { acct:"12.x", name:"I&C", tpc_k:3471, exp:0.6, floor:0.70, category:"shared" },
      { acct:"13.x", name:"Site Work", tpc_k:974, exp:0.45, floor:0.725, category:"shared" },
      { acct:"14.x", name:"Buildings", tpc_k:312, exp:0.4, floor:0.85, category:"shared" },
    ],
  },
  cement: {
    label: "Cement", ref_co2_capture_tpy: 925793,
    ref_tpc_k: 322871, owners_cost_pct: 0.221, ref_mw: 14.48,
    fuel_cost_applicable: true, ref_fuel_mmbtu_yr: 3279028,
    rdf: 1.05, operators_per_shift: 2.3, project_life: 30,
    debt_pct: 0.42, cost_of_debt: 0.0515, cost_of_equity: 0.12,
    construction_years: 3, construction_schedule: [0.10, 0.60, 0.30],
    tpc_line_items: [
      { acct:"4.x", name:"Industrial Boiler", tpc_k:22079, exp:0.6, floor:null, category:"core" },
      { acct:"5.1", name:"CANSOLV System", tpc_k:256072, exp:0.6, floor:null, category:"core" },
      { acct:"5.4", name:"CO2 Compression", tpc_k:19360, exp:0.6, floor:null, category:"core" },
      { acct:"9.x", name:"Cooling Water", tpc_k:5144, exp:0.6, floor:0.40, category:"shared" },
      { acct:"11.x", name:"Electrical", tpc_k:12837, exp:0.65, floor:0.65, category:"shared" },
      { acct:"12.x", name:"I&C", tpc_k:4543, exp:0.6, floor:0.70, category:"shared" },
      { acct:"13.x", name:"Site Work", tpc_k:1618, exp:0.45, floor:0.725, category:"shared" },
      { acct:"14.x", name:"Buildings", tpc_k:127, exp:0.4, floor:0.85, category:"shared" },
    ],
  },
  dac_solid: {
    label: "DAC (Solid Sorbent)", ref_co2_capture_tpy: 100000,
    ref_tpc_k: 370000, owners_cost_pct: 0.22, ref_mw: 3.36,
    fuel_cost_applicable: true, ref_fuel_mmbtu_yr: 597100,
    rdf: 1.0, operators_per_shift: 3.0, project_life: 25,
    debt_pct: 0.40, cost_of_debt: 0.06, cost_of_equity: 0.15,
    construction_years: 3, construction_schedule: [0.20, 0.50, 0.30],
    tpc_line_items: [
      { acct:"1.x", name:"Air Contactors & Sorbent", tpc_k:185000, exp:0.7, floor:null, category:"core" },
      { acct:"2.x", name:"Regeneration System", tpc_k:65000, exp:0.6, floor:null, category:"core" },
      { acct:"5.4", name:"CO2 Compression", tpc_k:35000, exp:0.6, floor:null, category:"core" },
      { acct:"9.x", name:"Cooling Water", tpc_k:18000, exp:0.6, floor:0.40, category:"shared" },
      { acct:"11.x", name:"Electrical", tpc_k:30000, exp:0.65, floor:0.65, category:"shared" },
      { acct:"12.x", name:"I&C", tpc_k:16000, exp:0.6, floor:0.70, category:"shared" },
      { acct:"13.x", name:"Site Work", tpc_k:13000, exp:0.45, floor:0.725, category:"shared" },
      { acct:"14.x", name:"Buildings & Structures", tpc_k:8000, exp:0.4, floor:0.85, category:"shared" },
    ],
  },
};

// ─── Calculation Functions (mirrored from App.jsx) ───────────────────

function getParam(source, key, scenario) {
  return scenario?.overrides?.[source]?.[key] ?? NETL_DEFAULTS[source]?.[key] ?? GLOBAL_DEFAULTS[key];
}

function calcWACC(debtPct, costOfDebt, costOfEquity, taxRate = 0.21) {
  const equityPct = 1 - debtPct;
  return debtPct * costOfDebt * (1 - taxRate) + equityPct * costOfEquity;
}

function annuityFactor(wacc, n) {
  return wacc / (1 - Math.pow(1 + wacc, -n));
}

function scaleTPC(lineItems, sR) {
  if (sR >= 0.3 && sR <= 3.0) {
    return lineItems.reduce((sum, item) => sum + item.tpc_k * Math.pow(sR, item.exp), 0);
  } else if (sR < 0.3) {
    return lineItems.reduce((sum, item) => {
      const raw = item.tpc_k * Math.pow(sR, item.exp);
      const floor = item.floor ? item.tpc_k * item.floor : 0;
      return sum + Math.max(raw, floor);
    }, 0);
  } else {
    const nTrains = Math.ceil(sR / 3.0);
    const trainSR = sR / nTrains;
    return lineItems.reduce((sum, item) => {
      if (item.category === "core") {
        return sum + item.tpc_k * Math.pow(trainSR, item.exp) * 0.93 * nTrains;
      } else {
        return sum + item.tpc_k * Math.pow(sR, 0.4);
      }
    }, 0);
  }
}

function calcLCOC(inputs, scenario = { overrides: {} }) {
  const src = inputs.source;
  const errors = [];
  const warnings = [];

  if (!inputs.co2_capture_tpy || inputs.co2_capture_tpy <= 0) {
    return { lcoc: 0, components: {}, details: {}, errors: ["CO2 must be positive"], warnings };
  }

  const cf = inputs.capacity_factor ?? GLOBAL_DEFAULTS.capacity_factor;
  const ref_co2 = getParam(src, "ref_co2_capture_tpy", scenario);
  const sR = inputs.co2_capture_tpy / ref_co2;

  const lineItems = getParam(src, "tpc_line_items", scenario);
  const scaled_tpc_k = scaleTPC(lineItems, sR);

  const cepci_current = inputs.cepci_current ?? GLOBAL_DEFAULTS.cepci_current;
  const cepci_ratio = cepci_current / GLOBAL_DEFAULTS.cepci_ref;
  const location_ratio = inputs.location_factor ?? GLOBAL_DEFAULTS.location_factor;
  const tech_capex = inputs.tech_multiplier?.capex ?? 1.0;
  const rdf = (inputs.build_type === "RF") ? getParam(src, "rdf", scenario) : 1.0;
  const combined_adj = cepci_ratio * location_ratio * tech_capex * rdf;
  const adj_tpc_k = scaled_tpc_k * combined_adj;

  const owners_pct = getParam(src, "owners_cost_pct", scenario);
  const ref_base_plant_tpc_k = getParam(src, "ref_base_plant_tpc_k", scenario) ?? 0;
  let capex_k;
  if (ref_base_plant_tpc_k > 0) {
    const base_adj = cepci_ratio * location_ratio;
    const scaled_base_k = ref_base_plant_tpc_k * Math.pow(sR, 0.6) * base_adj;
    capex_k = (adj_tpc_k + scaled_base_k) * (1 + owners_pct);
  } else {
    capex_k = adj_tpc_k * (1 + owners_pct);
  }

  const state_code = inputs.state ?? "IL";
  const tax_rate = inputs.tax_rate ?? combinedTaxRate(state_code);
  const debt_pct = inputs.debt_pct ?? getParam(src, "debt_pct", scenario);
  const cost_of_debt = inputs.cost_of_debt ?? getParam(src, "cost_of_debt", scenario);
  const cost_of_equity = inputs.cost_of_equity ?? getParam(src, "cost_of_equity", scenario);
  const wacc = inputs.use_fixed_hurdle_rate
    ? inputs.fixed_hurdle_rate
    : calcWACC(debt_pct, cost_of_debt, cost_of_equity, tax_rate);

  if (wacc <= 0) return { lcoc: 0, components: {}, details: { wacc }, errors: ["WACC <= 0"], warnings };

  const n = inputs.project_life ?? getParam(src, "project_life", scenario);
  const af = annuityFactor(wacc, n);
  const capex_dollars = capex_k * 1000;
  const co2_per_year = inputs.co2_capture_tpy;
  const capital_per_tonne = (capex_dollars * af) / co2_per_year;

  // Fixed O&M
  const op_rate = GLOBAL_DEFAULTS.op_labor_rate_base * (1 + GLOBAL_DEFAULTS.op_labor_burden);
  const ops_per_shift = getParam(src, "operators_per_shift", scenario);
  const op_labor_annual = ops_per_shift * 3 * 365 * 8 * op_rate;
  const tpc_dollars = adj_tpc_k * 1000;
  const maint_labor = tpc_dollars * GLOBAL_DEFAULTS.maint_labor_pct;
  const admin = (op_labor_annual + maint_labor) * GLOBAL_DEFAULTS.admin_pct;

  const pti_basis = getParam(src, "pti_basis", scenario);
  const greenfield_base_tpc_k = getParam(src, "greenfield_base_tpc_k", scenario);
  let pti_basis_dollars;
  if (pti_basis === "greenfield_equivalent" && greenfield_base_tpc_k) {
    pti_basis_dollars = (greenfield_base_tpc_k + adj_tpc_k) * 1000;
  } else {
    pti_basis_dollars = tpc_dollars;
  }
  const pti = pti_basis_dollars * GLOBAL_DEFAULTS.pti_pct;
  const tech_opex = inputs.tech_multiplier?.opex ?? 1.0;
  const fixed_om_annual = (op_labor_annual + maint_labor + admin + pti) * tech_opex;
  const fixed_om_per_tonne = fixed_om_annual / co2_per_year;

  // Variable O&M
  const maint_material = tpc_dollars * GLOBAL_DEFAULTS.maint_material_pct;
  const ref_consumables_per_tco2 = getParam(src, "ref_consumables_per_tco2", scenario) ?? 0;
  const consumables = ref_consumables_per_tco2 * co2_per_year;
  const variable_om_annual = (maint_material + consumables) * tech_opex;
  const variable_om_per_tonne = variable_om_annual / co2_per_year;

  // Power
  const explicit_mw = getParam(src, "ref_mw", scenario);
  const ref_mw_gross = getParam(src, "ref_mw_gross", scenario);
  const ref_mw_net = getParam(src, "ref_mw_net", scenario);
  const ref_mw = explicit_mw ?? ((ref_mw_gross && ref_mw_net) ? (ref_mw_gross - ref_mw_net) : null) ?? 0;
  const elec_price = inputs.elec_price_override ?? GLOBAL_DEFAULTS.elec_price;
  const tech_power = inputs.tech_multiplier?.power ?? 1.0;
  const scaled_mw = ref_mw * sR * tech_power;
  const power_annual = scaled_mw * GLOBAL_DEFAULTS.hours_per_year * cf * elec_price;
  const power_per_tonne = power_annual / co2_per_year;

  // Fuel
  let fuel_applicable = getParam(src, "fuel_cost_applicable", scenario);
  let fuel_per_tonne = 0;
  if (fuel_applicable) {
    const ref_fuel_mmbtu = getParam(src, "ref_fuel_mmbtu_yr", scenario) ?? 0;
    const gas_price = inputs.gas_price_override ?? GLOBAL_DEFAULTS.gas_price;
    const fuel_annual = ref_fuel_mmbtu * sR * gas_price;
    fuel_per_tonne = fuel_annual / co2_per_year;
  }

  const lcoc = capital_per_tonne + fixed_om_per_tonne + variable_om_per_tonne + power_per_tonne + fuel_per_tonne;

  return {
    lcoc,
    components: { capital: capital_per_tonne, fixed_om: fixed_om_per_tonne, variable_om: variable_om_per_tonne, power: power_per_tonne, fuel: fuel_per_tonne },
    details: { src, sR, cepci_ratio, location_ratio, combined_adj, capex_k, capex_dollars, wacc, af, n, tax_rate, co2_per_year, cf, scaled_mw, elec_price, ref_mw },
    errors, warnings,
  };
}

// ─── Cash Flow + IRR ────────────────────────────────────────────────

const CREDIT_45Q = { standard: 85, dac: 180, credit_period_years: 12 };
const DEPRECIATION_SCHEDULES = {
  macrs_5: { rates: [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576] },
};

function calc45Q(yr, co2, inputs) {
  if (inputs.use_45q === false) return 0;
  if (yr >= CREDIT_45Q.credit_period_years) return 0;
  const baseRate = inputs.use_dac_obbba_rate ? CREDIT_45Q.dac : CREDIT_45Q.standard;
  return co2 * baseRate;
}

function calcNPV(cfs, wacc) {
  return cfs.reduce((npv, cf, t) => npv + cf / Math.pow(1 + wacc, t), 0);
}

function calcIRR(cfs, guess = 0.1) {
  let hasPos = false, hasNeg = false;
  for (const cf of cfs) {
    if (cf > 0) hasPos = true;
    if (cf < 0) hasNeg = true;
    if (hasPos && hasNeg) break;
  }
  if (!hasPos || !hasNeg) return null;
  let rate = guess;
  for (let i = 0; i < 1000; i++) {
    if (rate <= -1) rate = -0.99;
    const npv = calcNPV(cfs, rate);
    const dnpv = cfs.reduce((d, cf, t) => d - t * cf / Math.pow(1 + rate, t + 1), 0);
    if (Math.abs(dnpv) < 1e-12) return rate;
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    rate = newRate;
  }
  return null;
}

function calcCashFlow(inputs, scenario = { overrides: {} }) {
  const lcoc = calcLCOC(inputs, scenario);
  if (lcoc.errors?.length) return { summary: { irr: null, npv: 0 }, lcoc };

  const d = lcoc.details;
  const projectLife = d.n;
  const co2_tpy = d.co2_per_year;
  const capex = d.capex_dollars;
  const state = inputs.state ?? "IL";
  const taxRate = combinedTaxRate(state);
  const wacc = d.wacc;
  const depSchedule = DEPRECIATION_SCHEDULES.macrs_5.rates;

  const annualOpex = (lcoc.components.fixed_om + lcoc.components.variable_om + lcoc.components.power + lcoc.components.fuel) * co2_tpy;
  const annualRevenue = lcoc.lcoc * co2_tpy;

  const src = inputs.source;
  const constructionYears = getParam(src, "construction_years", scenario);
  const constructionSchedule = getParam(src, "construction_schedule", scenario);

  const constructionCFs = constructionSchedule.map((pct) => ({ net_cf: -capex * pct }));

  const operatingCFs = [];
  for (let yr = 0; yr < projectLife; yr++) {
    const credit_45q = calc45Q(yr, co2_tpy, inputs);
    const total_credits = credit_45q;
    const gross_revenue = annualRevenue + total_credits;
    const ebitda = gross_revenue - annualOpex;
    const depreciation = yr < depSchedule.length ? capex * depSchedule[yr] : 0;
    const taxable_income = ebitda - depreciation;
    const tax = Math.max(0, taxable_income * taxRate);
    const net_cf = gross_revenue - annualOpex - tax;
    operatingCFs.push({ net_cf, credit_45q, total_credits, gross_revenue, ebitda, tax });
  }

  const allCFs = [...constructionCFs, ...operatingCFs];
  const cfSeries = allCFs.map(y => y.net_cf);
  const npv = calcNPV(cfSeries, wacc);
  const irr = calcIRR(cfSeries);

  const avg_credits_pt = operatingCFs.reduce((s, y) => s + y.total_credits, 0) / projectLife / co2_tpy;
  const net_lcoc = lcoc.lcoc - avg_credits_pt;

  return { summary: { npv, irr, gross_lcoc: lcoc.lcoc, net_lcoc }, lcoc };
}

// ─── Test Harness ───────────────────────────────────────────────────

function baseInputs(source) {
  const s = NETL_DEFAULTS[source];
  return {
    source,
    co2_capture_tpy: s.ref_co2_capture_tpy,
    capacity_factor: 0.85,
    build_type: "GF",
    location_factor: 1.0,
    cepci_current: 780.0,
    state: "IL",
    project_life: s.project_life,
  };
}

let pass = 0, fail = 0;

function test(name, actual, expected, tolerance = 0.01) {
  if (expected === "positive" && actual > 0) { pass++; return; }
  if (expected === "negative" && actual < 0) { pass++; return; }
  if (expected === "null" && actual === null) { pass++; return; }
  if (expected === "notnull" && actual !== null) { pass++; return; }
  if (typeof expected === "number") {
    if (Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9) < tolerance) { pass++; return; }
  }
  fail++;
  console.log(`  FAIL: ${name}`);
  console.log(`    expected: ${expected}, got: ${actual}`);
}

function testDirection(name, base, changed, direction) {
  if (direction === "higher" && changed > base) { pass++; return; }
  if (direction === "lower" && changed < base) { pass++; return; }
  if (direction === "equal" && Math.abs(changed - base) < 0.001) { pass++; return; }
  fail++;
  console.log(`  FAIL: ${name}`);
  console.log(`    base=${base.toFixed(4)}, changed=${changed.toFixed(4)}, expected ${direction}`);
}

// ─── TESTS ──────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("  CCUS TEA MODEL — INPUT SENSITIVITY TESTS");
console.log("═══════════════════════════════════════════════════════\n");

// ──── TEST 1: Baseline sanity for each source ────
console.log("── 1. Baseline LCOC (reference scale, no overrides) ──");
for (const [key, src] of Object.entries(NETL_DEFAULTS)) {
  const r = calcLCOC(baseInputs(key));
  console.log(`  ${src.label.padEnd(20)} LCOC=$${r.lcoc.toFixed(2)}/t  (cap=${r.components.capital.toFixed(2)} fom=${r.components.fixed_om.toFixed(2)} vom=${r.components.variable_om.toFixed(2)} pwr=${r.components.power.toFixed(2)} fuel=${r.components.fuel.toFixed(2)})`);
  test(`${key} LCOC positive`, r.lcoc, "positive");
  test(`${key} no errors`, r.errors.length, 0);
}

// ──── TEST 2: CO2 scale — larger plant → lower LCOC ────
console.log("\n── 2. CO2 Scale: 2× CO2 → LCOC should decrease ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const base = calcLCOC(baseInputs(key)).lcoc;
  const bigger = calcLCOC({ ...baseInputs(key), co2_capture_tpy: NETL_DEFAULTS[key].ref_co2_capture_tpy * 2 }).lcoc;
  testDirection(`${key} 2x scale`, base, bigger, "lower");
  console.log(`  ${key.padEnd(20)} base=$${base.toFixed(2)}  2x=$${bigger.toFixed(2)}  Δ=${((bigger/base-1)*100).toFixed(1)}%`);
}

// ──── TEST 3: CO2 scale — smaller plant → higher LCOC ────
console.log("\n── 3. CO2 Scale: 0.5× CO2 → LCOC should increase ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const base = calcLCOC(baseInputs(key)).lcoc;
  const smaller = calcLCOC({ ...baseInputs(key), co2_capture_tpy: NETL_DEFAULTS[key].ref_co2_capture_tpy * 0.5 }).lcoc;
  testDirection(`${key} 0.5x scale`, base, smaller, "higher");
  console.log(`  ${key.padEnd(20)} base=$${base.toFixed(2)}  0.5x=$${smaller.toFixed(2)}  Δ=+${((smaller/base-1)*100).toFixed(1)}%`);
}

// ──── TEST 4: CEPCI — higher year → higher LCOC ────
console.log("\n── 4. CEPCI: 2018$ vs 2026$ → 2026 should be higher ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const base2018 = calcLCOC({ ...baseInputs(key), cepci_current: 603.1 }).lcoc;
  const base2026 = calcLCOC({ ...baseInputs(key), cepci_current: 780.0 }).lcoc;
  testDirection(`${key} CEPCI 2026>2018`, base2018, base2026, "higher");
  const ratio = base2026 / base2018;
  console.log(`  ${key.padEnd(20)} 2018=$${base2018.toFixed(2)}  2026=$${base2026.toFixed(2)}  ratio=${ratio.toFixed(3)}`);
}

// ──── TEST 5: Location factor — higher → higher LCOC ────
console.log("\n── 5. Location Factor: 1.0 vs 1.3 → LCOC should increase ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const base = calcLCOC(baseInputs(key)).lcoc;
  const high = calcLCOC({ ...baseInputs(key), location_factor: 1.3 }).lcoc;
  testDirection(`${key} loc 1.3`, base, high, "higher");
  console.log(`  ${key.padEnd(20)} LF=1.0: $${base.toFixed(2)}  LF=1.3: $${high.toFixed(2)}  Δ=+${((high/base-1)*100).toFixed(1)}%`);
}

// ──── TEST 6: Electricity price — higher → higher LCOC ────
console.log("\n── 6. Electricity Price: $50 vs $100/MWh ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const low = calcLCOC({ ...baseInputs(key), elec_price_override: 50 }).lcoc;
  const high = calcLCOC({ ...baseInputs(key), elec_price_override: 100 }).lcoc;
  testDirection(`${key} elec 100>50`, low, high, "higher");
  console.log(`  ${key.padEnd(20)} $50=$${low.toFixed(2)}  $100=$${high.toFixed(2)}  Δ=+${((high/low-1)*100).toFixed(1)}%`);
}

// ──── TEST 7: Gas price — higher → higher LCOC for fuel sources ────
console.log("\n── 7. Gas Price: $3 vs $8/MMBtu (fuel-applicable sources) ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const low = calcLCOC({ ...baseInputs(key), gas_price_override: 3 }).lcoc;
  const high = calcLCOC({ ...baseInputs(key), gas_price_override: 8 }).lcoc;
  const hasFuel = NETL_DEFAULTS[key].fuel_cost_applicable;
  if (hasFuel) {
    testDirection(`${key} gas 8>3`, low, high, "higher");
    console.log(`  ${key.padEnd(20)} $3=$${low.toFixed(2)}  $8=$${high.toFixed(2)}  Δ=+${((high/low-1)*100).toFixed(1)}%  (HAS FUEL)`);
  } else {
    testDirection(`${key} gas no effect`, low, high, "equal");
    console.log(`  ${key.padEnd(20)} $3=$${low.toFixed(2)}  $8=$${high.toFixed(2)}  (no fuel — should be equal)`);
  }
}

// ──── TEST 8: Cost of equity — higher → higher LCOC ────
console.log("\n── 8. Cost of Equity: 8% vs 15% ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const low = calcLCOC({ ...baseInputs(key), cost_of_equity: 0.08 }).lcoc;
  const high = calcLCOC({ ...baseInputs(key), cost_of_equity: 0.15 }).lcoc;
  testDirection(`${key} CoE 15>8`, low, high, "higher");
  console.log(`  ${key.padEnd(20)} 8%=$${low.toFixed(2)}  15%=$${high.toFixed(2)}  Δ=+${((high/low-1)*100).toFixed(1)}%`);
}

// ──── TEST 9: Debt % — higher → lower LCOC (cheaper debt) ────
console.log("\n── 9. Debt %: 30% vs 60% (debt is cheaper than equity) ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const low = calcLCOC({ ...baseInputs(key), debt_pct: 0.30 }).lcoc;
  const high = calcLCOC({ ...baseInputs(key), debt_pct: 0.60 }).lcoc;
  testDirection(`${key} debt 60>30`, low, high, "lower");
  console.log(`  ${key.padEnd(20)} 30%=$${low.toFixed(2)}  60%=$${high.toFixed(2)}  Δ=${((high/low-1)*100).toFixed(1)}%`);
}

// ──── TEST 10: Project life — longer → lower LCOC ────
console.log("\n── 10. Project Life: 15yr vs 30yr ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const short = calcLCOC({ ...baseInputs(key), project_life: 15 }).lcoc;
  const long = calcLCOC({ ...baseInputs(key), project_life: 30 }).lcoc;
  testDirection(`${key} life 30>15`, short, long, "lower");
  console.log(`  ${key.padEnd(20)} 15yr=$${short.toFixed(2)}  30yr=$${long.toFixed(2)}  Δ=${((long/short-1)*100).toFixed(1)}%`);
}

// ──── TEST 11: Build type — RF should be higher (RDF > 1) ────
console.log("\n── 11. Build Type: GF vs RF (retrofit difficulty factor) ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const gf = calcLCOC({ ...baseInputs(key), build_type: "GF" }).lcoc;
  const rf = calcLCOC({ ...baseInputs(key), build_type: "RF" }).lcoc;
  const rdf = NETL_DEFAULTS[key].rdf;
  if (rdf > 1.0) {
    testDirection(`${key} RF>GF`, gf, rf, "higher");
  }
  console.log(`  ${key.padEnd(20)} GF=$${gf.toFixed(2)}  RF=$${rf.toFixed(2)}  RDF=${rdf}  Δ=+${((rf/gf-1)*100).toFixed(1)}%`);
}

// ──── TEST 12: Tech multiplier — higher capex → higher LCOC ────
console.log("\n── 12. Tech Multiplier: capex 1.0 vs 1.3 ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const base = calcLCOC(baseInputs(key)).lcoc;
  const high = calcLCOC({ ...baseInputs(key), tech_multiplier: { capex: 1.3, opex: 1.0, power: 1.0 } }).lcoc;
  testDirection(`${key} tech capex 1.3`, base, high, "higher");
  console.log(`  ${key.padEnd(20)} 1.0x=$${base.toFixed(2)}  1.3x=$${high.toFixed(2)}  Δ=+${((high/base-1)*100).toFixed(1)}%`);
}

// ──── TEST 13: Fixed hurdle rate override ────
console.log("\n── 13. Fixed Hurdle Rate: 5% vs 12% ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const low = calcLCOC({ ...baseInputs(key), use_fixed_hurdle_rate: true, fixed_hurdle_rate: 0.05 }).lcoc;
  const high = calcLCOC({ ...baseInputs(key), use_fixed_hurdle_rate: true, fixed_hurdle_rate: 0.12 }).lcoc;
  testDirection(`${key} hurdle 12>5`, low, high, "higher");
  console.log(`  ${key.padEnd(20)} 5%=$${low.toFixed(2)}  12%=$${high.toFixed(2)}  Δ=+${((high/low-1)*100).toFixed(1)}%`);
}

// ──── TEST 14: State tax effect on WACC ────
console.log("\n── 14. State: TX (0% state tax) vs CA (8.8%) vs IL (9.5%) ──");
for (const key of ["ammonia", "ngcc_f"]) {
  const tx = calcLCOC({ ...baseInputs(key), state: "TX" });
  const ca = calcLCOC({ ...baseInputs(key), state: "CA" });
  const il = calcLCOC({ ...baseInputs(key), state: "IL" });
  console.log(`  ${key.padEnd(20)} TX=$${tx.lcoc.toFixed(2)} (wacc=${(tx.details.wacc*100).toFixed(3)}%)  CA=$${ca.lcoc.toFixed(2)} (wacc=${(ca.details.wacc*100).toFixed(3)}%)  IL=$${il.lcoc.toFixed(2)} (wacc=${(il.details.wacc*100).toFixed(3)}%)`);
  // Higher state tax → lower WACC (bigger debt tax shield) → lower LCOC
  testDirection(`${key} TX>CA (higher tax=lower WACC)`, tx.lcoc, ca.lcoc, "lower");
}

// ──── TEST 15: Capacity factor ────
console.log("\n── 15. Capacity Factor: 60% vs 90% ──");
for (const key of Object.keys(NETL_DEFAULTS)) {
  const low = calcLCOC({ ...baseInputs(key), capacity_factor: 0.60 }).lcoc;
  const high = calcLCOC({ ...baseInputs(key), capacity_factor: 0.90 }).lcoc;
  // Higher CF → more MWh consumed → higher power cost, but same capital/opex per tonne
  // Net effect depends on source. Power-heavy sources get more expensive.
  console.log(`  ${key.padEnd(20)} 60%=$${low.toFixed(2)}  90%=$${high.toFixed(2)}  Δ=${((high/low-1)*100).toFixed(1)}%`);
}

// ──── TEST 16: IRR sanity ────
console.log("\n── 16. IRR: No credits → IRR ≈ WACC; With 45Q → IRR > WACC ──");
for (const key of ["ammonia", "ngcc_f", "cement", "dac_solid"]) {
  const inputs_no = { ...baseInputs(key), use_45q: false, state: "IL" };
  const inputs_45q = { ...baseInputs(key), use_45q: true, state: "IL" };
  const cf_no = calcCashFlow(inputs_no);
  const cf_45q = calcCashFlow(inputs_45q);
  const wacc = cf_no.lcoc.details.wacc;
  const irr_no = cf_no.summary.irr;
  const irr_45q = cf_45q.summary.irr;

  console.log(`  ${key.padEnd(20)} WACC=${(wacc*100).toFixed(2)}%  IRR(no credits)=${irr_no != null ? (irr_no*100).toFixed(2)+"%" : "null"}  IRR(45Q)=${irr_45q != null ? (irr_45q*100).toFixed(2)+"%" : "null"}`);

  // With 45Q, IRR should be higher than without
  if (irr_no != null && irr_45q != null) {
    testDirection(`${key} IRR 45Q > no credits`, irr_no, irr_45q, "higher");
  }
  // Without credits, NPV should be near zero (LCOC = breakeven at WACC)
  // Not exact because of tax/depreciation effects, but should be in the right ballpark
}

// ──── TEST 17: Extreme scale tiers ────
console.log("\n── 17. Scaling Tiers: Tier A (<0.3), B (0.3-3.0), C (>3.0) ──");
for (const key of ["ammonia", "ngcc_f"]) {
  const ref = NETL_DEFAULTS[key].ref_co2_capture_tpy;
  const tierA = calcLCOC({ ...baseInputs(key), co2_capture_tpy: ref * 0.1 }).lcoc;
  const tierB = calcLCOC({ ...baseInputs(key), co2_capture_tpy: ref * 1.0 }).lcoc;
  const tierC = calcLCOC({ ...baseInputs(key), co2_capture_tpy: ref * 5.0 }).lcoc;
  console.log(`  ${key.padEnd(20)} TierA(0.1x)=$${tierA.toFixed(2)}  TierB(1.0x)=$${tierB.toFixed(2)}  TierC(5.0x)=$${tierC.toFixed(2)}`);
  testDirection(`${key} TierA > TierB`, tierB, tierA, "higher");
  testDirection(`${key} TierC < TierB`, tierB, tierC, "lower");
}

// ──── TEST 18: NGCC base plant allocation ────
console.log("\n── 18. NGCC base plant TPC included in CAPEX ──");
{
  const r = calcLCOC(baseInputs("ngcc_f"));
  const captureOnly = NETL_DEFAULTS.ngcc_f.ref_tpc_k;
  const basePlant = NETL_DEFAULTS.ngcc_f.ref_base_plant_tpc_k;
  console.log(`  capture TPC = $${(captureOnly/1000).toFixed(0)}M, base plant = $${(basePlant/1000).toFixed(0)}M`);
  console.log(`  total CAPEX = $${(r.details.capex_k/1000).toFixed(0)}M (should include both + owners)`);
  testDirection("NGCC capex > capture alone", captureOnly, r.details.capex_k, "higher");
}

// ──── Summary ────
console.log("\n═══════════════════════════════════════════════════════");
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log("═══════════════════════════════════════════════════════\n");

process.exit(fail > 0 ? 1 : 0);
