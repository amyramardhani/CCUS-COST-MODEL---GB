import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ReferenceArea, Label
} from 'recharts'
import JSZip from 'jszip'
import * as d3Geo from 'd3-geo'
import { feature } from 'topojson-client'
import './App.css'

function ToggleSwitch({ value, onChange, labelOn = "ON", labelOff = "OFF" }) {
  return (
    <div style={{
      display: "inline-flex",
      borderRadius: "4px",
      overflow: "hidden",
      border: "1px solid #e0e0e0",
    }}>
      <div
        onClick={() => onChange(false)}
        style={{
          padding: "3px 10px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: "pointer",
          background: !value ? "#58b947" : "#ffffff",
          color: !value ? "#ffffff" : "#999999",
          transition: "all 0.15s ease",
        }}
      >
        {labelOff}
      </div>
      <div
        onClick={() => onChange(true)}
        style={{
          padding: "3px 10px",
          fontSize: "11px",
          fontWeight: 700,
          cursor: "pointer",
          background: value ? "#58b947" : "#ffffff",
          color: value ? "#ffffff" : "#999999",
          transition: "all 0.15s ease",
          borderLeft: "1px solid #e0e0e0",
        }}
      >
        {labelOn}
      </div>
    </div>
  );
}

const CEPCI_BY_YEAR = {
  2018: 603.1,
  2019: 607.5,
  2020: 596.2,
  2021: 708.0,
  2022: 816.0,
  2023: 789.6,
  2024: 770.0,
  2025: 780.0,
  2026: 780.0,  // estimated
};

const GLOBAL_DEFAULTS = {
  cepci_ref: 603.1,          // Dec 2018 (NETL anchor year)
  cepci_current: 780.0,      // default 2026 — updated dynamically via costYear state
  location_factor: 1.0,      // Midwest = 1.0
  capacity_factor: 0.85,
  hours_per_year: 8760,
  op_labor_rate_base: 38.50, // $/hr
  op_labor_burden: 0.30,     // 30% fringe
  maint_labor_pct: 0.0064,   // 0.64% of TPC
  maint_material_pct: 0.0096,// 0.96% of TPC
  pti_pct: 0.02,             // 2.0% of TPC
  admin_pct: 0.25,           // 25% of (op labor + maint labor) — NETL Section 3.1.2.3
  shifts_per_day: 3,
  days_per_year: 365,
  wacc: null,                // calculated from debt/equity if null
  project_life: 30,
  elec_price: 66.5,           // $/MWh — EIA Midwest industrial default
  gas_price: 4.42,           // $/MMBtu — Henry Hub reference
  ref_gas_price: 4.42,       // reference gas price for fuel cost scaling
  federal_tax_rate: 0.21,
  depreciation_method: "macrs_5",
  inflation_rate: 0.025,           // CPI assumption for 45Q escalation
  use_45q_escalation: false,       // toggle — default off
  use_dac_obbba_rate: false,       // OBBBA DAC $180/t toggle — default off
  storage_type: "geological",      // "geological" or "eor"
  credit_period_45q: 12,           // years
};

const NETL_DEFAULTS = {
  ammonia: {
    label: "Ammonia (Syngas)",
    purity: "high",
    ref_co2_capture_tpy: 413163,       // t CO2/yr at 85% CF (NETL Exhibit 7-2)
    ref_tpc_k: 37347,                  // $K total plant cost (pre-owner's)
    owners_cost_pct: 0.221,            // 22.1% of TPC
    ref_mw: 5.86,                      // MW total auxiliary load (Exhibit 5-4: compressor 5,770 + CW 90 = 5,860 kWe)
    capacity_basis: "t_nh3_yr",
    ref_capacity: 365000,              // t NH3/yr reference (1,000 t/day × 365 days)
    has_teg: true,
    has_inlet_ko: true,
    fuel_cost_applicable: false,
    rdf: 1.01,
    operators_per_shift: 1.0,
    labor_type: "HP",
    construction_years: 1,
    construction_schedule: [1.0],
    project_life: 30,
    debt_pct: 0.54,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 1.233,            // t CO2/t NH3 (syngas stream only)
    tpc_line_items: [
      { acct: "5.1", name: "Inlet Water KO",    tpc_k: 19,     exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4", name: "CO2 Compression",   tpc_k: 12960,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.7", name: "TEG Dryer",          tpc_k: 3977,   exp: 0.6, floor: null,  category: "core"   },
      { acct: "7.3", name: "Ductwork",           tpc_k: 391,    exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "9.x", name: "Cooling Water",      tpc_k: 1528,   exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.2", name: "Station Service",   tpc_k: 2642,   exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "11.3", name: "Switchgear/MCC",    tpc_k: 4432,   exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "11.4", name: "Conduit/Cable Tray",tpc_k: 1906,   exp: 0.7, floor: 0.60,  category: "shared" },
      { acct: "11.5", name: "Wire & Cable",      tpc_k: 3624,   exp: 0.7, floor: 0.60,  category: "shared" },
      { acct: "12.8", name: "Instrument Wiring", tpc_k: 2489,   exp: 0.7, floor: 0.70,  category: "shared" },
      { acct: "12.9", name: "Other I&C",         tpc_k: 2029,   exp: 0.5, floor: 0.80,  category: "shared" },
      { acct: "13.x", name: "Site Work",         tpc_k: 1326,   exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.5", name: "CW Pumphouse",      tpc_k: 23,     exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  eo: {
    label: "Ethylene Oxide",
    purity: "high",
    ref_co2_capture_tpy: 103276,       // NETL Exhibit 7-1: 103,275 t CO2/yr at 85% CF
    ref_tpc_k: 16636,
    owners_cost_pct: 0.225,            // (20385-16636)/16636 = 22.5%
    ref_mw: 1.20,                      // MW total aux load (Exhibit 5-13: 1,200 kWe)
    capacity_basis: "t_eo_yr",
    ref_capacity: 364500,              // 364,500 t EO/yr (NETL reference)
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,
    rdf: 1.01,
    operators_per_shift: 1.0,
    labor_type: "HP",
    construction_years: 1,
    construction_schedule: [1.0],
    project_life: 30,
    debt_pct: 0.48,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 0.333,            // t CO2/t EO (corrected from 0.283)
    tpc_line_items: [
      { acct: "5.4",  name: "CO2 Compression", tpc_k: 4922,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "7.3",  name: "Ductwork",         tpc_k: 99,    exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "9.x",  name: "Cooling Water",    tpc_k: 590,   exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",       tpc_k: 6374,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",              tpc_k: 3677,  exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",        tpc_k: 965,   exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",        tpc_k: 10,    exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  ethanol: {
    label: "Ethanol",
    purity: "high",
    ref_co2_capture_tpy: 121586,       // t CO2/yr at 85% CF (NETL Exhibit 7-1)
    ref_tpc_k: 20187,                  // $K total plant cost (Exhibit 5-25)
    owners_cost_pct: 0.222,            // (24672-20187)/20187 = 22.2%
    ref_mw: 1.84,                      // MW total aux load (Exhibit 5-23: 1,840 kWe)
    capacity_basis: "m_gal_yr",
    ref_capacity: 50,                  // 50M gal/yr reference
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,
    rdf: 1.01,
    operators_per_shift: 1.0,
    labor_type: "HP",
    construction_years: 1,
    construction_schedule: [1.0],
    project_life: 30,
    debt_pct: 0.36,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 0.00243,          // t CO2/gal ethanol (121586 / 50e6)
    tpc_line_items: [
      { acct: "5.4",  name: "CO2 Compression", tpc_k: 6497,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.5",  name: "Pre-cooler HX",   tpc_k: 268,   exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.7",  name: "CO2 Inlet Cooler", tpc_k: 805,   exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",    tpc_k: 7665,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",       tpc_k: 3887,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "13.x", name: "Site Work",        tpc_k: 1052,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",        tpc_k: 13,    exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  ngp: {
    label: "Natural Gas Processing",
    purity: "high",
    ref_co2_capture_tpy: 551816,       // t CO2/yr at 85% CF (NETL Exhibit 7-1)
    ref_tpc_k: 46690,                  // $K total plant cost (Exhibit 5-34)
    owners_cost_pct: 0.216,            // (56764-46690)/46690 = 21.6%
    ref_mw: 6.12,                      // MW total aux load (Exhibit 5-32: 6,120 kWe)
    capacity_basis: "mmscfd",
    ref_capacity: 120450,              // 120,450 MMSCF/yr reference (330 MMSCFD × 365 days)
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,
    rdf: 1.01,
    operators_per_shift: 1.0,
    labor_type: "HP",
    construction_years: 1,
    construction_schedule: [1.0],
    project_life: 30,
    debt_pct: 0.43,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: null,             // varies by field — CO2 content dependent
    tpc_line_items: [
      { acct: "5.4",  name: "CO2 Compression", tpc_k: 25787, exp: 0.6, floor: null,  category: "core"   },
      { acct: "7.3",  name: "Ductwork",         tpc_k: 478,   exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "9.x",  name: "Cooling Water",    tpc_k: 1683,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",       tpc_k: 12837, exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",              tpc_k: 4543,  exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",        tpc_k: 1337,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",        tpc_k: 26,    exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  refinery_h2: {
    label: "Refinery Hydrogen",
    purity: "low",
    ref_co2_capture_tpy: 309548,       // t CO2/yr at 85% CF, 90% capture (NETL Exhibit 7-3)
    ref_tpc_k: 127184,                 // $K TPC, 90% capture (Exhibit 7-3)
    owners_cost_pct: 0.219,            // (154978-127184)/127184 = 21.9%
    ref_mw: 4.04,                      // MW total aux load at 90% capture (Exhibit 6-5)
    capacity_basis: "t_h2_yr",
    ref_capacity: 87000,               // 87,000 t H2/yr reference
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: true,
    ref_fuel_mmbtu_yr: 722803,          // 2,330 MMBtu/day × 365 × 0.85 CF (Exhibit 6-10: $3,194,817/yr ÷ $4.42)
    rdf: 1.05,
    operators_per_shift: 2.3,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 30,
    debt_pct: 0.33,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 4.66,             // t CO2/t H2 (405000/87000 = 4.655 for syngas stream)
    capture_technology: "ADIP-Ultra",   // Shell pre-combustion capture
    tpc_line_items: [
      { acct: "4.x",  name: "Industrial Boiler", tpc_k: 11234, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.1",  name: "ADIP-Ultra System",  tpc_k: 95700, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression",    tpc_k: 4354,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",      tpc_k: 4354,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",         tpc_k: 6281,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                tpc_k: 3009,  exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",          tpc_k: 1252,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",          tpc_k: 52,    exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  cement: {
    label: "Cement",
    purity: "low",
    ref_co2_capture_tpy: 925793,       // t CO2/yr at 85% CF, 90% capture (NETL Exhibit 7-3)
    ref_tpc_k: 322871,                 // $K TPC, 90% capture (Exhibit 7-3)
    owners_cost_pct: 0.221,            // (394192-322871)/322871 = 22.1%
    ref_mw: 14.48,                     // MW total aux load at 90% capture (Exhibit 6-21)
    capacity_basis: "t_cement_yr",
    ref_capacity: 1290000,             // 1.29M t cement/yr reference
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: true,
    ref_fuel_mmbtu_yr: 3279028,         // 10,569 MMBtu/day × 365 × 0.85 CF (Exhibit 6-26: $14,493,467/yr ÷ $4.42)
    rdf: 1.05,
    operators_per_shift: 2.3,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 30,
    debt_pct: 0.42,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 0.938,            // t CO2/t cement (1210000/1290000 at 100% CF)
    capture_technology: "CANSOLV",
    tpc_line_items: [
      { acct: "4.x",  name: "Industrial Boiler", tpc_k: 22079, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.1",  name: "CANSOLV System",     tpc_k: 256072,exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression",    tpc_k: 19360, exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",      tpc_k: 5144,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",         tpc_k: 12837, exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                tpc_k: 4543,  exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",          tpc_k: 1618,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",          tpc_k: 127,   exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  steel: {
    label: "Iron/Steel (BF-BOF)",
    purity: "low",
    ref_co2_capture_tpy: 2860681,      // t CO2/yr at 85% CF, 90% capture — BOTH trains combined (Exhibit 7-3)
    ref_tpc_k: 878803,                 // $K TPC both trains combined, 90% capture (Exhibit 7-3)
    owners_cost_pct: 0.210,            // (1,063,524-878,803)/878,803 = 21.0% (Exhibit 7-3)
    ref_mw: 44.65,                     // MW total aux load both trains (COG/BFS 22,220 + COG PPS 22,430 kWe, Exhibit 6-44/6-45)
    capacity_basis: "t_steel_yr",
    ref_capacity: 2540000,             // 2.54M t steel/yr reference
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: true,
    ref_fuel_mmbtu_yr: 10135023,       // 32,667 MMBtu/day × 365 × 0.85 CF (Exhibit 6-52: $44,798,673/yr ÷ $4.42)
    rdf: 1.05,                         // retrofit only (no new BF-BOF being built)
    operators_per_shift: 4.6,          // 2× capture trains (2.3 each)
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 30,
    debt_pct: 0.39,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 1.47,             // t CO2/t steel for captured streams (3,740,000/2,540,000)
    capture_technology: "CANSOLV",
    rf_only: true,                     // no new BF-BOF plants being built
    tpc_line_items: [
      // Combined COG/BFS + COG PPS sections (Exhibits 6-40 + 6-42, 90% capture)
      { acct: "3.x",  name: "Industrial Boilers",  tpc_k: 61696, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.x",  name: "CANSOLV + Compression",tpc_k: 643642,exp: 0.6, floor: null,  category: "core"   },
      { acct: "7.x",  name: "Ductwork & Stack",     tpc_k: 47944, exp: 0.6, floor: null,  category: "core"   },
      { acct: "0.x",  name: "Common Plant",          tpc_k: 41848, exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",        tpc_k: 24352, exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",           tpc_k: 44791, exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                  tpc_k: 10751, exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",            tpc_k: 3463,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",            tpc_k: 316,   exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  pulp_paper: {
    label: "Pulp & Paper",
    purity: "low",
    ref_co2_capture_tpy: 763940,       // t CO2/yr at 85% CF, 90% capture, GF (NETL Exhibit 7-3)
    ref_tpc_k: 322670,                 // $K TPC, 90% capture, greenfield (Exhibit 7-3)
    owners_cost_pct: 0.211,            // (390803-322670)/322670 = 21.1%
    ref_mw: 0,                          // GF: $0 purchased power — base plant provides (Exhibit 6-62: 13,523 kWe from recovery boiler)
    ref_mw_retrofit: 13.52,            // RF: 13,523 kWe actual aux load (used if build_type=RF, TODO)
    capacity_basis: "t_pulp_yr",
    ref_capacity: 400000,              // 400,000 ADt/yr reference
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,       // GF pulp/paper uses existing steam from recovery boiler
    rdf: 1.05,
    operators_per_shift: 2.3,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 30,
    debt_pct: 0.42,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    emission_factor: 2.50,             // t CO2/t pulp (1000000/400000)
    capture_technology: "CANSOLV",
    tpc_line_items: [
      { acct: "5.1",  name: "CANSOLV System",  tpc_k: 255557,exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression", tpc_k: 11966, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.x",  name: "Heat Exchangers", tpc_k: 35807, exp: 0.6, floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",   tpc_k: 5084,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",      tpc_k: 8557,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "13.x", name: "Site Work",       tpc_k: 1589,  exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings",       tpc_k: 112,   exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  ngcc_f: {
    label: "NGCC (F-Frame)",
    purity: "low",
    ref_co2_capture_tpy: 2920000,
    ref_tpc_k: 551801,                 // pre-RDF, capture equipment only
    ref_base_plant_tpc_k: 311300,      // base plant TPC allocated to capture (calibrated to NETL $33.7/t capital)
    owners_cost_pct: 0.210,
    ref_mw_gross: 740,                 // GROSS MW without capture — use this for scaling basis
    ref_mw_net: 641,                   // net MW after capture
    ref_mw: 86,                        // MW consumed by capture system (NET output penalty: 740-641=99, parasitic portion=86)
    greenfield_base_tpc_k: 493200,     // Base NGCC plant TPC without capture — used for PT&I basis
    capacity_basis: "mw_gross",
    ref_capacity: 740,
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,       // NGCC fuel cost is embedded in plant ops — outside capture boundary
    ref_consumables_per_tco2: 4.30,    // $/t CO2 — MEA solvent, water treatment chemicals
    rdf: 1.09,
    operators_per_shift: 3.3,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 30,
    debt_pct: 0.50,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    pti_basis: "greenfield_equivalent", // PT&I on base+capture TPC, not capture-only
    tpc_line_items: [
      { acct: "5.1",      name: "CANSOLV System",    tpc_k: 415297, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",      name: "CO2 Compression",   tpc_k: 60817,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.5+5.12", name: "Aux Systems",        tpc_k: 1658,   exp: 0.6, floor: null,  category: "core"   },
      { acct: "3.x",      name: "Feedwater/BOP",      tpc_k: 17804,  exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "8.x",      name: "Steam Piping",       tpc_k: 10236,  exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "9.x",      name: "Cooling Water",      tpc_k: 11661,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x",     name: "Electrical",         tpc_k: 29571,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x",     name: "I&C",                tpc_k: 3471,   exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x",     name: "Site Work",          tpc_k: 974,    exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x",     name: "Buildings",          tpc_k: 312,    exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  ngcc_h: {
    label: "NGCC (H-Frame)",
    purity: "low",
    ref_co2_capture_tpy: 3982000,
    ref_tpc_k: 657343,                 // pre-RDF, capture equipment only
    ref_base_plant_tpc_k: 424500,      // base plant TPC allocated to capture (scaled from F-frame by CO2 ratio)
    owners_cost_pct: 0.210,
    ref_mw_gross: 1009,
    ref_mw_net: 877,
    ref_mw: 117,                       // MW consumed by capture system (NET output penalty parasitic portion)
    greenfield_base_tpc_k: 627400,     // Base NGCC plant TPC without capture — used for PT&I basis
    capacity_basis: "mw_gross",
    ref_capacity: 1009,
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,       // NGCC fuel cost is embedded in plant ops — outside capture boundary
    ref_consumables_per_tco2: 4.30,    // $/t CO2 — MEA solvent, water treatment chemicals
    rdf: 1.09,
    operators_per_shift: 3.3,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.10, 0.60, 0.30],
    project_life: 30,
    debt_pct: 0.50,
    cost_of_debt: 0.0515,
    cost_of_equity: 0.12,
    pti_basis: "greenfield_equivalent",
    tpc_line_items: [
      { acct: "5.1",      name: "CANSOLV System",  tpc_k: 566012, exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.4",      name: "CO2 Compression", tpc_k: 82960,  exp: 0.6, floor: null,  category: "core"   },
      { acct: "5.5+5.12", name: "Aux Systems",      tpc_k: 2262,   exp: 0.6, floor: null,  category: "core"   },
      { acct: "3.x",      name: "Feedwater/BOP",    tpc_k: 24282,  exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "8.x",      name: "Steam Piping",     tpc_k: 13951,  exp: 0.6, floor: 0.50,  category: "shared" },
      { acct: "9.x",      name: "Cooling Water",    tpc_k: 15893,  exp: 0.6, floor: 0.40,  category: "shared" },
      { acct: "11.x",     name: "Electrical",       tpc_k: 40316,  exp: 0.65,floor: 0.65,  category: "shared" },
      { acct: "12.x",     name: "I&C",              tpc_k: 4731,   exp: 0.6, floor: 0.70,  category: "shared" },
      { acct: "13.x",     name: "Site Work",        tpc_k: 1328,   exp: 0.45,floor: 0.725, category: "shared" },
      { acct: "14.x",     name: "Buildings",        tpc_k: 425,    exp: 0.4, floor: 0.85,  category: "shared" },
    ],
  },

  dac_solid: {
    label: "DAC (Solid Sorbent)",
    purity: "dac",
    ref_co2_capture_tpy: 100000,         // 100 kt/yr — DOE DAC Hub scale
    ref_tpc_k: 370000,                   // $370M for 100k tCO2/yr = $3,700/tCO2/yr capacity
    owners_cost_pct: 0.22,
    ref_mw: 3.36,                        // 250 kWh_e/tCO2 × 100k / (8760 × 0.85)
    ref_fuel_mmbtu_yr: 597100,           // 1,750 kWh_th/tCO2 × 100k × 3.412/1000
    capacity_basis: "t_co2_yr",
    ref_capacity: 100000,
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: true,          // natural gas for sorbent thermal regeneration
    rdf: 1.0,                            // always greenfield — no retrofit concept
    gf_only: true,
    operators_per_shift: 3.0,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.20, 0.50, 0.30],
    project_life: 25,                    // sorbent degradation limits project life
    debt_pct: 0.40,                      // lower leverage — higher technology risk
    cost_of_debt: 0.06,                  // premium over conventional 0.0515
    cost_of_equity: 0.15,                // premium for early-stage technology
    emission_factor: 1.0,                // product IS the CO2
    is_dac: true,                        // flag for 45Q DAC rate ($180/t)
    data_source: "Literature (IEAGHG 2021-05, Fasihi et al. 2019, NETL 2022)",
    tpc_line_items: [
      { acct: "1.x",  name: "Air Contactors & Sorbent",  tpc_k: 185000, exp: 0.7,  floor: null,  category: "core"   },
      { acct: "2.x",  name: "Regeneration System",        tpc_k: 65000,  exp: 0.6,  floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression",            tpc_k: 35000,  exp: 0.6,  floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",              tpc_k: 18000,  exp: 0.6,  floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical",                 tpc_k: 30000,  exp: 0.65, floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                        tpc_k: 16000,  exp: 0.6,  floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work",                  tpc_k: 13000,  exp: 0.45, floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings & Structures",     tpc_k: 8000,   exp: 0.4,  floor: 0.85,  category: "shared" },
    ],
  },

  doc_electrochemical: {
    label: "DOC (Direct Ocean Capture)",
    purity: "dac",
    ref_co2_capture_tpy: 100000,         // 100 kt/yr — Captura target scale by ~2028
    ref_tpc_k: 500000,                   // $500M for 100k tCO2/yr = $5,000/tCO2/yr capacity
    owners_cost_pct: 0.22,
    ref_mw: 13.4,                        // 1,000 kWh_e/tCO2 × 100k / (8760 × 0.85)
    ref_fuel_mmbtu_yr: 0,                // all-electric process — no fuel
    capacity_basis: "t_co2_yr",
    ref_capacity: 100000,
    has_teg: false,
    has_inlet_ko: false,
    fuel_cost_applicable: false,         // purely electric process
    rdf: 1.0,
    gf_only: true,
    operators_per_shift: 2.3,
    labor_type: "LP",
    construction_years: 3,
    construction_schedule: [0.20, 0.50, 0.30],
    project_life: 20,                    // membrane/electrode degradation
    debt_pct: 0.35,                      // lowest leverage — highest technology risk
    cost_of_debt: 0.065,                 // highest risk premium in model
    cost_of_equity: 0.16,                // highest in model — pre-commercial uncertainty
    emission_factor: 1.0,
    is_dac: true,                        // qualifies for DAC 45Q rate
    data_source: "Literature (National Academies, Captura, NREL 2024, Nature Comms 2020)",
    tpc_line_items: [
      { acct: "1.x",  name: "Electrodialysis Stacks",      tpc_k: 200000, exp: 0.7,  floor: null,  category: "core"   },
      { acct: "2.x",  name: "Seawater Intake & Return",    tpc_k: 80000,  exp: 0.6,  floor: null,  category: "core"   },
      { acct: "3.x",  name: "CO2 Degas & Stripping",       tpc_k: 45000,  exp: 0.6,  floor: null,  category: "core"   },
      { acct: "5.4",  name: "CO2 Compression",             tpc_k: 40000,  exp: 0.6,  floor: null,  category: "core"   },
      { acct: "9.x",  name: "Cooling Water",               tpc_k: 15000,  exp: 0.6,  floor: 0.40,  category: "shared" },
      { acct: "11.x", name: "Electrical & Power Cond.",    tpc_k: 60000,  exp: 0.65, floor: 0.65,  category: "shared" },
      { acct: "12.x", name: "I&C",                         tpc_k: 25000,  exp: 0.6,  floor: 0.70,  category: "shared" },
      { acct: "13.x", name: "Site Work & Marine",          tpc_k: 25000,  exp: 0.45, floor: 0.725, category: "shared" },
      { acct: "14.x", name: "Buildings & Structures",      tpc_k: 10000,  exp: 0.4,  floor: 0.85,  category: "shared" },
    ],
  },

};

// Scenario parameter lookup — ALWAYS use this, never read NETL_DEFAULTS directly in calcLCOC
function getParam(source, key, scenario) {
  return scenario?.overrides?.[source]?.[key] ?? NETL_DEFAULTS[source]?.[key] ?? GLOBAL_DEFAULTS[key];
}

// WACC calculation
function calcWACC(debtPct, costOfDebt, costOfEquity, taxRate = 0.21) {
  const equityPct = 1 - debtPct;
  return debtPct * costOfDebt * (1 - taxRate) + equityPct * costOfEquity;
}

// Annuity factor (WACC-based, replaces NETL CCF)
// NOTE: DO NOT use perpetuity formula (CAPEX × rate). Must use proper annuity.
function annuityFactor(wacc, n) {
  return wacc / (1 - Math.pow(1 + wacc, -n));
}

// Scaling ratio for a given source
// sR = actual_co2_tpy / ref_co2_tpy
function scalingRatio(actual_co2_tpy, ref_co2_tpy) {
  return actual_co2_tpy / ref_co2_tpy;
}

// Three-tier CAPEX scaling
// Tier A: sR < 0.3 — per-item with cost floors
// Tier B: 0.3–3.0 — standard six-tenths per line item
// Tier C: > 3.0 — train-based (core × 0.93/train, shared at exp 0.4)
function scaleTPC(lineItems, sR) {
  if (sR >= 0.3 && sR <= 3.0) {
    // Tier B
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
    // Tier C — train-based
    const nTrains = Math.ceil(sR / 3.0);
    const trainSR = sR / nTrains;
    return lineItems.reduce((sum, item) => {
      if (item.category === "core") {
        const perTrain = item.tpc_k * Math.pow(trainSR, item.exp) * 0.93;
        return sum + perTrain * nTrains;
      } else {
        return sum + item.tpc_k * Math.pow(sR, 0.4);
      }
    }, 0);
  }
}

// Main LCOC calculation engine
// inputs: {
//   source: string (key into NETL_DEFAULTS),
//   co2_capture_tpy: number,
//   capacity_factor: number,
//   build_type: "GF"|"RF",
//   cost_year: number,
//   cod_year: number,
//   state: string,
//   elec_price_override: number|null,
//   gas_price_override: number|null,
//   tech_multiplier: object|null,
// }
// scenario: { name, overrides: {} }
// returns: { lcoc, capital, fixed_om, variable_om, power, fuel, capex, tpc, details: {} }
function calcLCOC(inputs, scenario = { overrides: {} }) {
  const src = inputs.source;
  const errors = [];
  const warnings = [];

  // Validate inputs
  if (!inputs.co2_capture_tpy || inputs.co2_capture_tpy <= 0) {
    errors.push("CO2 capture rate must be positive.");
    return { lcoc: 0, components: { capital: 0, fixed_om: 0, variable_om: 0, power: 0, fuel: 0 }, details: {}, errors, warnings };
  }
  const n_check = inputs.project_life ?? getParam(src, "project_life", scenario);
  if (!n_check || n_check <= 0) {
    errors.push("Project life must be positive.");
    return { lcoc: 0, components: { capital: 0, fixed_om: 0, variable_om: 0, power: 0, fuel: 0 }, details: {}, errors, warnings };
  }

  // Step 1: Source defaults via getParam
  const cf = inputs.capacity_factor ?? GLOBAL_DEFAULTS.capacity_factor;

  // Step 2: Scaling ratio
  const ref_co2 = getParam(src, "ref_co2_capture_tpy", scenario);
  const sR = inputs.co2_capture_tpy / ref_co2;

  if (sR > 10) warnings.push(`Scaling ratio of ${sR.toFixed(1)} is outside validated range. Results may be unreliable.`);

  // Step 3: Scale TPC line items
  const lineItems = getParam(src, "tpc_line_items", scenario);
  const scaled_tpc_k = scaleTPC(lineItems, sR);

  // Step 4: Adjustments — CEPCI × Location × Tech.capex × RDF
  const cepci_current = inputs.cepci_current ?? GLOBAL_DEFAULTS.cepci_current;
  const cepci_ratio = cepci_current / GLOBAL_DEFAULTS.cepci_ref;
  const location_ratio = inputs.location_factor ?? GLOBAL_DEFAULTS.location_factor;
  const tech_capex = inputs.tech_multiplier?.capex ?? 1.0;
  const rdf = (inputs.build_type === "RF") ? getParam(src, "rdf", scenario) : 1.0;
  const combined_adj = cepci_ratio * location_ratio * tech_capex * rdf;
  const adj_tpc_k = scaled_tpc_k * combined_adj;

  // Step 5: CAPEX = Adj_TPC + Owner's Costs
  // For NGCC: include base plant TPC (scaled, no RDF/tech) in CAPEX but not in O&M
  const owners_pct = getParam(src, "owners_cost_pct", scenario);
  const ref_base_plant_tpc_k = getParam(src, "ref_base_plant_tpc_k", scenario) ?? 0;
  let capex_k;
  if (ref_base_plant_tpc_k > 0) {
    const base_adj = cepci_ratio * location_ratio; // no RDF, no tech_capex
    const scaled_base_k = ref_base_plant_tpc_k * Math.pow(sR, 0.6) * base_adj;
    capex_k = (adj_tpc_k + scaled_base_k) * (1 + owners_pct);
  } else {
    capex_k = adj_tpc_k * (1 + owners_pct);
  }
  // NOTE: NO TASC. Interest during construction is handled by WACC annuity.

  // Step 6: WACC → Annuity Factor → Capital cost component
  const debt_pct = scenario?.overrides?.[src]?.debt_pct
    ?? inputs.debt_pct
    ?? getParam(src, "debt_pct", scenario);
  const cost_of_debt = scenario?.overrides?.[src]?.cost_of_debt
    ?? inputs.cost_of_debt
    ?? getParam(src, "cost_of_debt", scenario);
  const cost_of_equity = scenario?.overrides?.[src]?.cost_of_equity
    ?? inputs.cost_of_equity
    ?? getParam(src, "cost_of_equity", scenario);
  const state_code = inputs.state ?? "IL";
  const tax_rate = inputs.tax_rate ?? combinedTaxRate(state_code);
  const wacc = inputs.use_fixed_hurdle_rate
    ? inputs.fixed_hurdle_rate
    : calcWACC(debt_pct, cost_of_debt, cost_of_equity, tax_rate);
  if (wacc <= 0) {
    errors.push("WACC must be positive.");
    return { lcoc: 0, components: { capital: 0, fixed_om: 0, variable_om: 0, power: 0, fuel: 0 }, details: { wacc, sR }, errors, warnings };
  }
  const n = inputs.project_life ?? getParam(src, "project_life", scenario);
  const af = annuityFactor(wacc, n);
  const capex_dollars = capex_k * 1000;
  const co2_per_year = inputs.co2_capture_tpy;
  const capital_per_tonne = (capex_dollars * af) / co2_per_year;

  // Step 7: Fixed O&M
  const shifts = GLOBAL_DEFAULTS.shifts_per_day;
  const days = GLOBAL_DEFAULTS.days_per_year;
  const op_rate = GLOBAL_DEFAULTS.op_labor_rate_base * (1 + GLOBAL_DEFAULTS.op_labor_burden);
  const ops_per_shift = getParam(src, "operators_per_shift", scenario);
  const op_labor_annual = ops_per_shift * shifts * days * 8 * op_rate; // 8hr shifts

  const tpc_dollars = adj_tpc_k * 1000;
  const maint_labor = tpc_dollars * GLOBAL_DEFAULTS.maint_labor_pct;
  const admin = (op_labor_annual + maint_labor) * GLOBAL_DEFAULTS.admin_pct;

  // PT&I: for sources with pti_basis = "greenfield_equivalent", use base plant TPC + capture TPC
  // This reflects PT&I on the entire facility, not just the capture equipment
  const pti_basis = getParam(src, "pti_basis", scenario);
  const greenfield_base_tpc_k = getParam(src, "greenfield_base_tpc_k", scenario);
  let pti_basis_dollars;
  if (pti_basis === "greenfield_equivalent" && greenfield_base_tpc_k) {
    // PT&I on total facility: base plant + capture equipment (adjusted)
    pti_basis_dollars = (greenfield_base_tpc_k + adj_tpc_k) * 1000;
  } else {
    pti_basis_dollars = tpc_dollars;
  }
  const pti = pti_basis_dollars * GLOBAL_DEFAULTS.pti_pct;

  const tech_opex = inputs.tech_multiplier?.opex ?? 1.0;
  const fixed_om_annual = (op_labor_annual + maint_labor + admin + pti) * tech_opex;
  const fixed_om_per_tonne = fixed_om_annual / co2_per_year;

  // Step 8: Variable O&M
  const maint_material = tpc_dollars * GLOBAL_DEFAULTS.maint_material_pct;
  // Consumables: per-source rate if available, otherwise 0
  const ref_consumables_per_tco2 = getParam(src, "ref_consumables_per_tco2", scenario) ?? 0;
  const consumables = ref_consumables_per_tco2 * co2_per_year;
  const variable_om_annual = (maint_material + consumables) * tech_opex;
  const variable_om_per_tonne = variable_om_annual / co2_per_year;

  // Step 9: Power cost
  // Use ref_mw (capture system parasitic load) if defined; fall back to gross-net penalty
  const explicit_mw = getParam(src, "ref_mw", scenario);
  const ref_mw_gross = getParam(src, "ref_mw_gross", scenario);
  const ref_mw_net = getParam(src, "ref_mw_net", scenario);
  const ref_mw = explicit_mw
    ?? ((ref_mw_gross && ref_mw_net) ? (ref_mw_gross - ref_mw_net) : null)
    ?? getParam(src, "ref_mw_parasitic", scenario)
    ?? 0;
  const elec_price = inputs.elec_price_override ?? GLOBAL_DEFAULTS.elec_price;
  const tech_power = inputs.tech_multiplier?.power ?? 1.0;
  // Scale MW linearly by CO2 ratio
  const scaled_mw = ref_mw * sR * tech_power;
  const power_annual = scaled_mw * GLOBAL_DEFAULTS.hours_per_year * cf * elec_price; // MWh * $/MWh
  const power_per_tonne = power_annual / co2_per_year;

  // Step 10: Fuel cost (if applicable)
  // ref_fuel_mmbtu_yr is in MMBtu/yr at reference scale; multiply by gas price for $/yr
  let fuel_applicable = getParam(src, "fuel_cost_applicable", scenario);
  const dac_fuel_mult = (src === "dac_solid" && inputs.dac_tech_type)
    ? (DAC_TECH_MULTIPLIERS[inputs.dac_tech_type]?.fuel ?? 1.0) : 1.0;
  if (dac_fuel_mult === 0) fuel_applicable = false;
  let fuel_per_tonne = 0;
  if (fuel_applicable) {
    const ref_fuel_mmbtu = getParam(src, "ref_fuel_mmbtu_yr", scenario) ?? 0;
    const gas_price = inputs.gas_price_override ?? GLOBAL_DEFAULTS.gas_price;
    const fuel_annual = ref_fuel_mmbtu * sR * gas_price * dac_fuel_mult;
    fuel_per_tonne = fuel_annual / co2_per_year;
  }

  // LCOC
  const lcoc = capital_per_tonne + fixed_om_per_tonne + variable_om_per_tonne + power_per_tonne + fuel_per_tonne;

  // Scaling tier
  const tier = sR < 0.3 ? "A" : sR <= 3.0 ? "B" : "C";

  // Per-line-item scaled values for Model Tab
  const scaledLineItems = lineItems.map((item) => {
    let scaled;
    if (tier === "B") {
      scaled = item.tpc_k * Math.pow(sR, item.exp);
    } else if (tier === "A") {
      const raw = item.tpc_k * Math.pow(sR, item.exp);
      const fl = item.floor ? item.tpc_k * item.floor : 0;
      scaled = Math.max(raw, fl);
    } else {
      const nTrains = Math.ceil(sR / 3.0);
      const trainSR = sR / nTrains;
      if (item.category === "core") {
        scaled = item.tpc_k * Math.pow(trainSR, item.exp) * 0.93 * nTrains;
      } else {
        scaled = item.tpc_k * Math.pow(sR, 0.4);
      }
    }
    return { ...item, scaled_k: scaled };
  });

  const annual_mwh = scaled_mw * GLOBAL_DEFAULTS.hours_per_year * cf;

  return {
    lcoc,
    components: {
      capital: capital_per_tonne,
      fixed_om: fixed_om_per_tonne,
      variable_om: variable_om_per_tonne,
      power: power_per_tonne,
      fuel: fuel_per_tonne,
    },
    details: {
      src, ref_co2, sR, tier, lineItems, scaledLineItems,
      scaled_tpc_k, adj_tpc_k, capex_k, capex_dollars, wacc, af, n,
      cepci_current, cepci_ratio, location_ratio, tech_capex, rdf, combined_adj,
      owners_pct, debt_pct, cost_of_debt, cost_of_equity, tax_rate,
      op_rate, ops_per_shift, op_labor_annual, maint_labor, admin, pti,
      tech_opex, fixed_om_annual,
      maint_material, consumables, variable_om_annual,
      ref_mw, scaled_mw, annual_mwh, elec_price, tech_power, power_annual,
      fuel_applicable, fuel_per_tonne,
      co2_per_year, cf,
    },
    errors,
    warnings
  };
}

function calc45Q(operatingYear, co2PerYear, inputs, scenario) {
  if (inputs.use_45q === false) return 0;
  if (operatingYear >= CREDIT_45Q.credit_period_years) return 0;
  const isDac = inputs.use_dac_obbba_rate ?? false;
  const baseRate = isDac ? CREDIT_45Q.dac : CREDIT_45Q.standard;
  const useEscalation = inputs.use_45q_escalation ?? false;
  const cpi = inputs.inflation_rate ?? GLOBAL_DEFAULTS.inflation_rate;
  const rate = useEscalation
    ? baseRate * Math.pow(1 + cpi, operatingYear)
    : baseRate;
  return co2PerYear * rate;
}

function calcOtherCredits(operatingYear, co2PerYear, inputs) {
  let credits = 0;

  if (inputs.use_cdr_credit) {
    credits += co2PerYear * (inputs.cdr_credit_rate ?? VCM_CREDITS.cdr_credit);
  }
  if (inputs.use_avoidance_credit) {
    credits += co2PerYear * (inputs.avoidance_credit_rate ?? VCM_CREDITS.avoidance_credit);
  }
  if (inputs.use_45v) {
    // 45V: per kg H2 — only applicable for hydrogen sources
    const h2_kg_per_year = inputs.h2_production_kg_yr ?? 0;
    credits += h2_kg_per_year * (inputs.credit_45v ?? VCM_CREDITS.credit_45v);
  }
  if (inputs.use_45z) {
    const fuel_gal_per_year = inputs.fuel_production_gal_yr ?? 0;
    credits += fuel_gal_per_year * (inputs.credit_45z ?? VCM_CREDITS.credit_45z);
  }
  if (inputs.use_rins) {
    const rin_type = inputs.rin_type ?? "d6";
    const rin_rate = VCM_CREDITS[`rin_${rin_type}`];
    credits += co2PerYear * rin_rate; // simplified — RINs are per gallon not per tonne in practice, placeholder
  }
  if (inputs.use_lcfs) {
    credits += co2PerYear * (inputs.lcfs_price ?? VCM_CREDITS.lcfs_price);
  }
  return credits;
}

// Depreciable basis = CAPEX (full overnight cost)
// Depreciation tax shield = depreciation_amount × tax_rate
function getDepreciationShield(year, capex, schedule, taxRate) {
  const depIdx = year; // 0-indexed operating year
  if (depIdx >= schedule.length) return 0;
  return capex * schedule[depIdx] * taxRate;
}

// inputs: same inputs object as calcLCOC(), plus credit toggles
// scenario: active scenario object
// returns: { years[], summary: { npv, irr, payback, breakeven } }
function calcCashFlow(inputs, scenario = { overrides: {} }) {
  const lcoc = calcLCOC(inputs, scenario);
  if (lcoc.errors?.length) return { years: [], summary: { npv: 0, irr: 0, payback: null, breakeven: null }, errors: lcoc.errors };

  const { details: d } = lcoc;
  const projectLife = d.n;
  const co2_tpy = d.co2_per_year;
  const capex = d.capex_k * 1000; // convert $K to $
  const state = inputs.state ?? "IL";
  const taxRate = combinedTaxRate(state);
  const wacc = d.wacc;

  // Depreciation schedule
  const depMethod = inputs.depreciation_method ?? GLOBAL_DEFAULTS.depreciation_method;
  const depSchedule = DEPRECIATION_SCHEDULES[depMethod]?.rates ?? DEPRECIATION_SCHEDULES.macrs_5.rates;

  // Annual operating costs (from LCOC components × CO2)
  const annualFixedOM = lcoc.components.fixed_om * co2_tpy;
  const annualVarOM = lcoc.components.variable_om * co2_tpy;
  const annualPower = lcoc.components.power * co2_tpy;
  const annualFuel = lcoc.components.fuel * co2_tpy;
  const annualOpex = annualFixedOM + annualVarOM + annualPower + annualFuel;

  // Construction schedule from source defaults
  const src = inputs.source;
  const constructionYears = getParam(src, "construction_years", scenario);
  const constructionSchedule = getParam(src, "construction_schedule", scenario);
  const codYear = inputs.cod_year ?? 2026;
  const totalYears = constructionYears + projectLife;

  // Construction phase cash flows
  const constructionCFs = constructionSchedule.map((pct, i) => ({
    year: codYear - constructionYears + i,
    phase: "construction",
    capex_spend: -capex * pct,
    net_cf: -capex * pct,
  }));

  // Build year-by-year cash flow
  const years = [];
  let cumulativeCF = 0;
  let paybackYear = null;

  // Add construction years
  for (const cf of constructionCFs) {
    cumulativeCF += cf.net_cf;
    years.push({
      year: cf.year,
      phase: "construction",
      capex: cf.capex_spend,
      revenue: 0,
      opex: 0,
      depreciation: 0,
      credit_45q: 0,
      taxable_income: 0,
      tax: 0,
      net_cash_flow: cf.net_cf,
      cumulative_cf: cumulativeCF,
    });
  }

  // Revenue = LCOC × CO2 captured — emitter pays breakeven cost to capture operator
  const annualRevenue = lcoc.lcoc * co2_tpy;

  // Operating phase
  const operatingCFs = [];
  for (let yr = 0; yr < projectLife; yr++) {
    const calendarYear = codYear + yr;
    const depShield = getDepreciationShield(yr, capex, depSchedule, taxRate);
    const credit_45q = calc45Q(yr, co2_tpy, inputs);
    const other_credits = calcOtherCredits(yr, co2_tpy, inputs);
    const total_credits = credit_45q + other_credits;

    // Revenue = LCOC offtake + tax credits
    const gross_revenue = annualRevenue + total_credits;

    // Pre-tax operating income
    const ebitda = gross_revenue - annualOpex;

    // Depreciation is non-cash — used for tax calculation only
    const depreciation = yr < depSchedule.length ? capex * depSchedule[yr] : 0;
    const taxable_income = ebitda - depreciation;
    const tax = Math.max(0, taxable_income * taxRate); // no negative tax for now

    // Net CF = revenue + credits - opex - taxes
    const net_cf = gross_revenue - annualOpex - tax;

    cumulativeCF += net_cf;
    if (paybackYear === null && cumulativeCF >= 0) {
      const prevCum = cumulativeCF - net_cf;
      paybackYear = calendarYear - 1 + (-prevCum / net_cf);
    }

    const entry = {
      year: calendarYear,
      operating_year: yr + 1,
      phase: "operating",
      annual_opex: annualOpex,
      annual_revenue: annualRevenue,
      credit_45q,
      other_credits,
      total_credits,
      gross_revenue,
      ebitda,
      depreciation,
      taxable_income,
      tax,
      dep_shield: depShield,
      net_cf,
      cumulative_cf: cumulativeCF,
    };
    operatingCFs.push(entry);
    years.push({
      year: calendarYear,
      phase: "operating",
      op_year: yr + 1,
      capex: 0,
      revenue: gross_revenue,
      lcoc_revenue: annualRevenue,
      opex: -annualOpex,
      depreciation,
      dep_shield: depShield,
      credit_45q,
      other_credits,
      taxable_income,
      tax: -tax,
      net_cash_flow: net_cf,
      cumulative_cf: cumulativeCF,
    });
  }

  // Combine construction + operating into single series
  const allCFs = [...constructionCFs.map(c => ({ ...c })), ...operatingCFs];
  const cfSeries = allCFs.map(y => y.net_cf);

  // Breakeven CO2 price — LCOC net of credits
  const gross_lcoc = lcoc.lcoc;
  const avg_annual_credits = operatingCFs.reduce((s, y) => s + y.total_credits, 0)
    / operatingCFs.length / co2_tpy;
  const net_lcoc = gross_lcoc - avg_annual_credits;

  const npv = calcNPV(cfSeries, wacc);
  const irr = calcIRR(cfSeries);
  const payback = calcPayback(cfSeries);

  return {
    years: allCFs,
    summary: {
      npv,
      irr,
      payback,
      gross_lcoc,
      net_lcoc,
      avg_annual_45q: operatingCFs.reduce((s, y) => s + y.credit_45q, 0) / projectLife,
      total_credits_pv: calcNPV(operatingCFs.map(y => y.total_credits), wacc),
    },
    lcoc,
  };
}

// NPV
function calcNPV(cfs, wacc) {
  return cfs.reduce((npv, cf, t) => npv + cf / Math.pow(1 + wacc, t), 0);
}

// IRR — Newton-Raphson with sign-change guard
function calcIRR(cfs, guess = 0.1) {
  // IRR only exists if cash flows change sign at least once
  let hasPos = false, hasNeg = false;
  for (const cf of cfs) {
    if (cf > 0) hasPos = true;
    if (cf < 0) hasNeg = true;
    if (hasPos && hasNeg) break;
  }
  if (!hasPos || !hasNeg) return null;

  let rate = guess;
  for (let i = 0; i < 1000; i++) {
    if (rate <= -1) rate = -0.99; // prevent division by zero in discounting
    const npv = calcNPV(cfs, rate);
    const dnpv = cfs.reduce((d, cf, t) => d - t * cf / Math.pow(1 + rate, t + 1), 0);
    if (Math.abs(dnpv) < 1e-12) return rate;
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    rate = newRate;
  }
  return null; // failed to converge
}

// Payback period
function calcPayback(cfs) {
  let cumulative = 0;
  for (let t = 0; t < cfs.length; t++) {
    cumulative += cfs[t];
    if (cumulative >= 0) return t;
  }
  return null; // never pays back
}

function calcAllSourcesLCOC(baseInputs, scenario) {
  const sources = Object.keys(NETL_DEFAULTS);
  return sources.map(source => {
    try {
      const result = calcLCOC({
        ...baseInputs,
        source,
        co2_capture_tpy: NETL_DEFAULTS[source].ref_co2_capture_tpy,
      }, scenario);
      const cf = calcCashFlow({
        ...baseInputs,
        source,
        co2_capture_tpy: NETL_DEFAULTS[source].ref_co2_capture_tpy,
        use_45q_escalation: false,
      }, scenario);
      return {
        source,
        label: NETL_DEFAULTS[source].label,
        lcoc: result.lcoc,
        components: result.components,
        net_lcoc: cf.summary.net_lcoc,
        valid: true,
      };
    } catch (e) {
      return { source, label: source, lcoc: 0, valid: false };
    }
  }).filter(d => d.valid);
}

function calcCapacitySensitivity(inputs, scenario, steps = 20) {
  const source = inputs.source;
  const ref_co2 = NETL_DEFAULTS[source]?.ref_co2_capture_tpy;
  if (!ref_co2) return [];

  const sRValues = Array.from({ length: steps }, (_, i) =>
    0.1 + (i / (steps - 1)) * 2.9  // 0.1× to 3.0×
  );

  return sRValues.map(sR => {
    const co2 = ref_co2 * sR;
    try {
      const result = calcLCOC({ ...inputs, co2_capture_tpy: co2 }, scenario);
      return {
        sR: sR.toFixed(2),
        co2_tpy: Math.round(co2),
        lcoc: result.lcoc,
        capital: result.components.capital,
        fixed_om: result.components.fixed_om,
        variable_om: result.components.variable_om,
        power: result.components.power,
        fuel: result.components.fuel,
        tier: sR < 0.3 ? "A" : sR <= 3.0 ? "B" : "C",
      };
    } catch (e) { return null; }
  }).filter(Boolean);
}

function calcStateHeatmap(inputs, scenario) {
  return Object.entries(EIA_ELEC_RATES).map(([state, mwh_rate]) => {
    const gasPrice = (HH_FORWARD_STRIP[inputs.cod_year ?? 2026] ?? 3.42)
      + (NG_BASIS_DIFFERENTIAL[state] ?? 0);
    try {
      const result = calcLCOC({
        ...inputs,
        elec_price_override: mwh_rate,
        gas_price_override: gasPrice,
      }, scenario);
      return { state, lcoc: result.lcoc, elec_price: mwh_rate, gas_price: gasPrice };
    } catch (e) { return { state, lcoc: null }; }
  });
}

// Build modified inputs for a parameter sweep
function buildSweepInputs(paramKey, value, baseInputs) {
  switch (paramKey) {
    case "cost_of_equity":  return { ...baseInputs, cost_of_equity: value };
    case "debt_pct":        return { ...baseInputs, debt_pct: value };
    case "cost_of_debt":    return { ...baseInputs, cost_of_debt: value };
    case "project_life":    return { ...baseInputs, project_life: Math.round(value) };
    case "tax_rate":        return { ...baseInputs, tax_rate: value };
    case "capacity_factor": {
      // Recalculate CO2 based on new CF: co2 scales linearly with CF
      const baseCF = baseInputs.capacity_factor ?? 0.85;
      const newCo2 = baseCF > 0 ? baseInputs.co2_capture_tpy * (value / baseCF) : baseInputs.co2_capture_tpy;
      return { ...baseInputs, capacity_factor: value, co2_capture_tpy: newCo2 };
    }
    case "capture_rate": {
      const co2_produced = baseInputs.co2_capture_tpy / (baseInputs.capture_rate ?? 0.90);
      return { ...baseInputs, capture_rate: value, co2_capture_tpy: co2_produced * value };
    }
    case "plant_capacity": {
      const ref_co2 = NETL_DEFAULTS[baseInputs.source]?.ref_co2_capture_tpy ?? 1;
      return { ...baseInputs, co2_capture_tpy: ref_co2 * value };
    }
    case "elec_price":      return { ...baseInputs, elec_price_override: value };
    case "gas_price":       return { ...baseInputs, gas_price_override: value };
    case "owners_cost_pct": return { ...baseInputs, owners_cost_pct: value };
    case "tpc_scale":       return { ...baseInputs, tpc_scale_override: value };
    case "maint_labor_pct": return { ...baseInputs, maint_labor_pct: value };
    case "maint_material_pct": return { ...baseInputs, maint_material_pct: value };
    case "pti_pct":         return { ...baseInputs, pti_pct: value };
    default: return baseInputs;
  }
}

// Sweep one parameter across low/baseline/high and return LCOC for each
function sweepParameter(paramKey, baseInputs, baseScenario) {
  const param = SENSITIVITY_PARAMS[paramKey];
  if (!param) return null;

  const source = baseInputs.source;
  let baselineValue;
  if (param.baseline_key) {
    baselineValue = baseInputs[param.baseline_key]
      ?? baseScenario?.overrides?.[source]?.[param.baseline_key]
      ?? NETL_DEFAULTS[source]?.[param.baseline_key]
      ?? GLOBAL_DEFAULTS[param.baseline_key];
  } else {
    if (paramKey === "plant_capacity") baselineValue = 1.0;
    if (paramKey === "tpc_scale") baselineValue = 1.0;
  }

  // Clamp values to prevent invalid ranges
  const rawLow = baselineValue + param.low_delta;
  const rawHigh = baselineValue + param.high_delta;
  const lowValue = param.format === "pct" ? Math.max(0, rawLow) : rawLow;
  const highValue = rawHigh;

  const baseResult = calcLCOC(baseInputs, baseScenario);
  const baselineLCOC = baseResult.lcoc;

  const lowInputs = buildSweepInputs(paramKey, lowValue, baseInputs);
  const lowResult = calcLCOC(lowInputs, baseScenario);

  const highInputs = buildSweepInputs(paramKey, highValue, baseInputs);
  const highResult = calcLCOC(highInputs, baseScenario);

  return {
    paramKey,
    label: param.label,
    group: param.group,
    units: param.units,
    baselineValue,
    lowValue,
    highValue,
    baselineLCOC,
    lowLCOC: lowResult.lcoc,
    highLCOC: highResult.lcoc,
    lowDelta: lowResult.lcoc - baselineLCOC,
    highDelta: highResult.lcoc - baselineLCOC,
    totalSwing: highResult.lcoc - lowResult.lcoc,
  };
}

// Run all parameter sweeps and return sorted tornado data
function calcTornadoData(baseInputs, baseScenario) {
  const results = Object.keys(SENSITIVITY_PARAMS).map(paramKey =>
    sweepParameter(paramKey, baseInputs, baseScenario)
  ).filter(Boolean);

  // Sort by totalSwing descending — largest impact at top of tornado
  return results.sort((a, b) => Math.abs(b.totalSwing) - Math.abs(a.totalSwing));
}

// ── Batch Processing Data Layer ──

const BATCH_FACILITY_SCHEMA = {
  facility_name:    { label: "Facility Name",      type: "string",  required: true  },
  source:           { label: "Source Type",         type: "select",  required: true,  options: Object.keys(NETL_DEFAULTS) },
  co2_capture_tpy:  { label: "CO2 Captured (t/yr)", type: "number",  required: true  },
  build_type:       { label: "Build Type",          type: "select",  required: true,  options: ["GF", "RF"] },
  state:            { label: "State",               type: "string",  required: false },
  capacity_factor:  { label: "Capacity Factor",     type: "number",  required: false },
  capture_rate:     { label: "Capture Rate %",      type: "number",  required: false },
  cost_of_equity:   { label: "Cost of Equity %",    type: "number",  required: false },
  debt_pct:         { label: "Debt %",              type: "number",  required: false },
  cost_of_debt:     { label: "Cost of Debt %",      type: "number",  required: false },
  project_life:     { label: "Project Life (yr)",   type: "number",  required: false },
  cod_year:         { label: "COD Year",            type: "number",  required: false },
  elec_price:       { label: "Electricity ($/MWh)", type: "number",  required: false },
  gas_price:        { label: "Gas Price ($/MMBtu)", type: "number",  required: false },
  dep_method:       { label: "Dep. Method",         type: "select",  required: false, options: ["", "macrs_5", "macrs_15", "sl_10", "sl_20", "sl_30"] },
};

function generateBatchTemplate() {
  const headers = Object.keys(BATCH_FACILITY_SCHEMA);
  const exampleRow = [
    "Example Plant 1", "ammonia", "388400", "RF",
    "IL", "85", "90", "12", "54", "5.15", "30", "2026", "88", "3.13", ""
  ];
  const csvContent = [headers.join(","), exampleRow.join(",")].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ccus_batch_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function parseBatchFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "csv") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim());
        const facilities = lines.slice(1).map((line, idx) => {
          const values = line.split(",").map(v => v.trim());
          const facility = { _row: idx + 2 };
          headers.forEach((h, i) => { facility[h] = values[i] ?? ""; });
          return facility;
        });
        resolve(facilities);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
  throw new Error("Unsupported file format. Please upload CSV (.csv).");
}

function validateFacility(facility, rowNum) {
  const errors = [];
  const warnings = [];
  if (!facility.facility_name) errors.push("Facility name is required");
  if (!facility.source || !NETL_DEFAULTS[facility.source]) {
    errors.push(`Invalid source type "${facility.source}". Valid: ${Object.keys(NETL_DEFAULTS).join(", ")}`);
  }
  if (!facility.co2_capture_tpy || isNaN(Number(facility.co2_capture_tpy))) {
    errors.push("CO2 capture rate must be a number");
  } else if (Number(facility.co2_capture_tpy) <= 0) {
    errors.push("CO2 capture rate must be positive");
  }
  if (!["GF", "RF"].includes(facility.build_type)) {
    errors.push(`Build type must be GF or RF, got "${facility.build_type}"`);
  }
  if (facility.source && NETL_DEFAULTS[facility.source]) {
    const sR = Number(facility.co2_capture_tpy) / (NETL_DEFAULTS[facility.source]?.ref_co2_capture_tpy ?? 1);
    if (sR > 5) warnings.push(`Scaling ratio ${sR.toFixed(1)}x is very high`);
    if (sR < 0.05) warnings.push(`Scaling ratio ${sR.toFixed(2)}x is very low`);
  }
  return { rowNum, errors, warnings, valid: errors.length === 0 };
}

function runBatch(facilities, activeScenario) {
  return facilities.map((facility, idx) => {
    const validation = validateFacility(facility, facility._row ?? idx + 1);
    if (!validation.valid) {
      return { ...facility, _status: "error", _errors: validation.errors, _warnings: validation.warnings, lcoc: null, components: null };
    }
    try {
      const inputs = {
        source: facility.source,
        co2_capture_tpy: Number(facility.co2_capture_tpy),
        build_type: facility.build_type,
        capacity_factor: facility.capacity_factor ? Number(facility.capacity_factor) / 100 : undefined,
        capture_rate: facility.capture_rate ? Number(facility.capture_rate) / 100 : undefined,
        cost_of_equity: facility.cost_of_equity ? Number(facility.cost_of_equity) / 100 : undefined,
        debt_pct: facility.debt_pct ? Number(facility.debt_pct) / 100 : undefined,
        cost_of_debt: facility.cost_of_debt ? Number(facility.cost_of_debt) / 100 : undefined,
        project_life: facility.project_life ? Number(facility.project_life) : undefined,
        cod_year: facility.cod_year ? Number(facility.cod_year) : undefined,
        elec_price_override: facility.elec_price ? Number(facility.elec_price) : undefined,
        gas_price_override: facility.gas_price ? Number(facility.gas_price) : undefined,
        state: facility.state || undefined,
      };
      Object.keys(inputs).forEach(k => inputs[k] === undefined && delete inputs[k]);
      const result = calcLCOC(inputs, activeScenario);
      return { ...facility, _status: "success", _errors: [], _warnings: validation.warnings, lcoc: result.lcoc, components: result.components, details: result.details };
    } catch (err) {
      return { ...facility, _status: "error", _errors: [err.message], _warnings: validation.warnings, lcoc: null, components: null };
    }
  });
}

const THEME = {
  green: "#58b947", pink: "#ef509a", orange: "#f68d2e",
  purple: "#93348f", teal: "#58a7af", red: "#b83a4b", yellow: "#fdcf0c",
  bg_page: "#f5f5f5", bg_card: "#ffffff", bg_input: "#ffffff",
  border: "#e0e0e0", border_strong: "#c0c0c0",
  text_primary: "#1a1a1a", text_secondary: "#555555", text_muted: "#999999",
  accent_primary: "#58b947", accent_hover: "#4aa33d",
  amber: "#fdcf0c", amber_bg: "#fffbea",
  negative: "#b83a4b", positive: "#58b947",
};

const ENVERUS_COLORS = {
  green:  "#58b947",
  pink:   "#ef509a",
  orange: "#f68d2e",
  purple: "#93348f",
  teal:   "#58a7af",
  red:    "#b83a4b",
  yellow: "#fdcf0c",
};

const ENVERUS_PALETTE = [
  "#58b947", "#ef509a", "#f68d2e", "#93348f",
  "#58a7af", "#b83a4b", "#fdcf0c"
];

const SENSITIVITY_PARAMS = {
  cost_of_equity: { label: "Cost of Equity", group: "Financial", units: "%", baseline_key: "cost_of_equity", low_delta: -0.04, high_delta: +0.04, format: "pct" },
  debt_pct: { label: "Debt %", group: "Financial", units: "%", baseline_key: "debt_pct", low_delta: -0.15, high_delta: +0.15, format: "pct" },
  cost_of_debt: { label: "Cost of Debt", group: "Financial", units: "%", baseline_key: "cost_of_debt", low_delta: -0.02, high_delta: +0.02, format: "pct" },
  project_life: { label: "Project Life", group: "Financial", units: "yr", baseline_key: "project_life", low_delta: -10, high_delta: +10, format: "number" },
  tax_rate: { label: "Combined Tax Rate", group: "Financial", units: "%", baseline_key: "tax_rate", low_delta: -0.05, high_delta: +0.05, format: "pct" },
  capacity_factor: { label: "Capacity Factor", group: "Operational", units: "%", baseline_key: "capacity_factor", low_delta: -0.15, high_delta: +0.10, format: "pct" },
  capture_rate: { label: "Capture Rate", group: "Operational", units: "%", baseline_key: "capture_rate", low_delta: -0.10, high_delta: +0.05, format: "pct" },
  plant_capacity: { label: "Plant Capacity (scale)", group: "Operational", units: "\u00d7", baseline_key: null, low_delta: -0.5, high_delta: +1.0, format: "multiplier" },
  elec_price: { label: "Electricity Price", group: "Energy", units: "$/MWh", baseline_key: "elec_price_override", low_delta: -30, high_delta: +30, format: "number" },
  gas_price: { label: "Natural Gas Price", group: "Energy", units: "$/MMBtu", baseline_key: "gas_price_override", low_delta: -1.50, high_delta: +2.00, format: "number" },
  owners_cost_pct: { label: "Owner's Cost %", group: "Cost", units: "%", baseline_key: "owners_cost_pct", low_delta: -0.05, high_delta: +0.05, format: "pct" },
  maint_labor_pct: { label: "Maintenance Labor %", group: "Cost", units: "% TPC", baseline_key: "maint_labor_pct", low_delta: -0.002, high_delta: +0.002, format: "pct" },
  maint_material_pct: { label: "Maintenance Material %", group: "Cost", units: "% TPC", baseline_key: "maint_material_pct", low_delta: -0.003, high_delta: +0.003, format: "pct" },
  pti_pct: { label: "Property Tax & Insurance %", group: "Cost", units: "% TPC", baseline_key: "pti_pct", low_delta: -0.005, high_delta: +0.005, format: "pct" },
  tpc_scale: { label: "TPC (Capital Cost)", group: "Cost", units: "\u00d7", baseline_key: null, low_delta: -0.20, high_delta: +0.20, format: "multiplier" },
};

const LEARNING_RATES = {
  amine_mea:      0.005,
  advanced_amine: 0.020,
  membrane:       0.030,
  solid_sorbent:  0.040,
  mof:            0.060,
};

function calcLearningCurve(inputs, scenario, techKey = "amine_mea", steps = 20) {
  const baseResult = calcLCOC({ ...inputs, tech_multiplier: null }, scenario);
  const baseLCOC = baseResult.lcoc;
  const learningRate = LEARNING_RATES[techKey] ?? 0.005;

  const deployments = Array.from({ length: steps }, (_, i) =>
    Math.pow(10, -2 + (i / (steps - 1)) * 3)  // 0.01 to 10 GtCO2/yr, log scale
  );

  return deployments.map(gtco2 => {
    const doublings = Math.log2(gtco2 / 0.01);
    const costRatio = Math.pow(1 - learningRate, doublings);
    return {
      deployment_gtco2: gtco2,
      lcoc: baseLCOC * Math.max(costRatio, 0.20), // floor at 20% of base
    };
  });
}

const CREDIT_45Q = {
  standard: 85,          // $/t — all non-DAC sources
  dac: 180,              // $/t — DAC sources (OBBBA rate)
  credit_period_years: 12,
};

const STATE_TAX_RATES = {
  AL: 0.065, AK: 0.094, AZ: 0.045, AR: 0.054, CA: 0.088, CO: 0.045,
  CT: 0.075, DE: 0.085, FL: 0.055, GA: 0.055, HI: 0.064, ID: 0.058,
  IL: 0.095, IN: 0.049, IA: 0.085, KS: 0.070, KY: 0.050, LA: 0.075,
  ME: 0.084, MD: 0.085, MA: 0.080, MI: 0.060, MN: 0.098, MS: 0.050,
  MO: 0.040, MT: 0.065, NE: 0.075, NV: 0.000, NH: 0.075, NJ: 0.090,
  NM: 0.059, NY: 0.075, NC: 0.025, ND: 0.042, OH: 0.000, OK: 0.040,
  OR: 0.076, PA: 0.089, RI: 0.070, SC: 0.050, SD: 0.000, TN: 0.065,
  TX: 0.000, UT: 0.048, VT: 0.085, VA: 0.060, WA: 0.000, DC: 0.085,
  WV: 0.065, WI: 0.076, WY: 0.000
};
// Combined tax rate = 1 - (1 - federal) × (1 - state)
// Federal rate = 21% (GLOBAL_DEFAULTS.federal_tax_rate)
function combinedTaxRate(state) {
  const stateTax = STATE_TAX_RATES[state] ?? 0;
  return 1 - (1 - 0.21) * (1 - stateTax);
}

const DEPRECIATION_SCHEDULES = {
  macrs_5: {
    label: "MACRS 5-Year",
    rates: [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576],
  },
  macrs_15: {
    label: "MACRS 15-Year",
    rates: [0.0500, 0.0950, 0.0855, 0.0770, 0.0693, 0.0623,
            0.0590, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590,
            0.0591, 0.0590, 0.0591, 0.0295],
  },
  sl_10: {
    label: "Straight Line 10-Year",
    rates: Array(10).fill(0.10),
  },
  sl_20: {
    label: "Straight Line 20-Year",
    rates: Array(20).fill(0.05),
  },
  sl_30: {
    label: "Straight Line 30-Year",
    rates: Array(30).fill(1/30),
  },
};

const VCM_CREDITS = {
  cdr_credit: 50,          // $/t CO2 — CDR credit (voluntary carbon market)
  avoidance_credit: 20,    // $/t CO2 — avoidance credit
  // 45V hydrogen credit — source dependent, placeholder
  credit_45v: 3.00,        // $/kg H2 (max rate, clean hydrogen)
  // 45Z clean fuels credit
  credit_45z: 1.00,        // $/gallon equivalent (placeholder)
  // RINs
  rin_d3: 2.50,            // $/RIN — cellulosic (D3)
  rin_d5: 1.20,            // $/RIN — advanced biofuel (D5)
  rin_d6: 0.80,            // $/RIN — conventional (D6)
  // LCFS
  lcfs_price: 75,          // $/tonne CO2e — California LCFS
};

const EIA_ELEC_RATES = {
  AL: 73, AK: 193, AZ: 79, AR: 66, CA: 215, CO: 86, CT: 171, DE: 85,
  FL: 85, GA: 72, HI: 341, ID: 77, IL: 88, IN: 82, IA: 68, KS: 77,
  KY: 65, LA: 56, ME: 125, MD: 100, MA: 182, MI: 83, MN: 92, MS: 68,
  MO: 79, MT: 76, NE: 77, NV: 86, NH: 162, NJ: 119, NM: 54, NY: 92,
  NC: 78, ND: 73, OH: 71, OK: 58, OR: 81, PA: 79, RI: 197, SC: 68,
  SD: 83, TN: 62, TX: 61, UT: 79, VT: 116, VA: 90, WA: 66, DC: 108,
  WV: 78, WI: 85, WY: 80
};
// Source: EIA Electric Power Monthly, Table 5.6a (2024). $/MWh industrial rate.
// EIA_ELEC_RATES[state] is already in $/MWh for calcLCOC

const HH_FORWARD_STRIP = {
  2026: 3.42, 2027: 3.69, 2028: 3.65, 2029: 3.62, 2030: 3.64,
  2031: 3.68, 2032: 3.62, 2033: 3.50, 2034: 3.56, 2035: 3.59,
  2036: 3.70, 2037: 3.81, 2038: 3.94
};
// Source: Bloomberg Terminal, annual average HH forward strip as of 2026-02-17
// NETL 2018 base = $4.42/MMBtu

const NG_BASIS_DIFFERENTIAL = {
  AL: 0.24,  AK: 0.00,  AZ: -0.61, AR: -0.42, CA: -0.09, CO: -0.78,
  CT: 5.02,  DE: 0.50,  FL: 0.33,  GA: -0.49, HI: 0.00,  ID: 0.00,
  IL: -0.29, IN: -0.29, IA: -0.38, KS: -0.56, KY: 0.22,  LA: 0.00,
  ME: 5.02,  MD: 0.50,  MA: 5.02,  MI: -0.32, MN: -0.38, MS: 0.24,
  MO: -0.56, MT: -0.76, NE: -0.38, NV: -0.76, NH: 5.02,  NJ: 0.00,
  NM: -0.81, NY: 0.64,  NC: 0.28,  ND: -0.38, OH: -0.34, OK: -0.42,
  OR: -0.94, PA: -0.72, RI: 5.02,  SC: 0.28,  SD: -0.38, TN: 0.22,
  TX: -0.43, UT: -0.78, VT: 5.02,  VA: 0.50,  WA: -1.79, DC: 0.50,
  WV: -0.27, WI: -0.29, WY: -0.76
};
// Source: Bloomberg Terminal, 2025 average basis differentials
// State gas price = HH forward strip + basis differential

const US_STATES = Object.keys(EIA_ELEC_RATES).sort();

const COASTAL_STATES = [
  // Atlantic Coast
  "ME", "NH", "MA", "RI", "CT", "NY", "NJ", "DE", "MD", "VA", "NC", "SC", "GA", "FL",
  // Gulf Coast
  "TX", "LA", "MS", "AL",
  // Pacific Coast
  "CA", "OR", "WA", "AK", "HI",
  // Great Lakes
  "MN", "WI", "MI", "IL", "IN", "OH", "PA", "DC",
];

const SOURCE_OPTIONS = [
  // High purity sources
  { key: "ammonia", label: "Ammonia (Syngas)" },
  { key: "eo", label: "Ethylene Oxide" },
  { key: "ethanol", label: "Ethanol" },
  { key: "ngp", label: "Natural Gas Processing" },
  // Low purity sources
  { key: "refinery_h2", label: "Refinery Hydrogen" },
  { key: "cement", label: "Cement" },
  { key: "steel", label: "Iron/Steel (BF-BOF)" },
  { key: "pulp_paper", label: "Pulp & Paper" },
  // Power sector
  { key: "ngcc", label: "NGCC" },
  // Direct removal
  { key: "dac_solid", label: "DAC (Direct Air Capture)" },
  { key: "doc_electrochemical", label: "DOC (Direct Ocean Capture)" },
];

const DAC_TECH_MULTIPLIERS = {
  solid_sorbent: {
    label: "Solid Sorbent (TVSA)",
    capex: 1.00,
    power: 1.00,
    fuel: 1.00,
    opex: 1.00,
    note: "Default — Climeworks/Carbon Capture type. ~250 kWh_e/t + thermal regeneration.",
  },
  liquid_solvent: {
    label: "Liquid Solvent (KOH)",
    capex: 1.30,      // higher capex — calciner required
    power: 0.80,      // less electricity
    fuel: 3.50,       // much higher thermal — ~900°C calciner vs ~100°C sorbent
    opex: 1.10,
    note: "Carbon Engineering/Oxy type. Higher capex + fuel but potentially lower electricity.",
  },
  electrochemical: {
    label: "Electrochemical",
    capex: 1.50,      // higher capex — early stage technology
    power: 2.50,      // much higher electricity — no thermal
    fuel: 0.00,       // all electric — no fuel
    opex: 0.90,
    note: "Early stage. All-electric, no thermal energy. Higher power, no fuel cost.",
  },
};

const TECH_MULTIPLIERS = {
  amine_mea:        { label: "Amine (MEA)",        capex: 1.00, opex: 1.00, power: 1.00 },
  advanced_amine:   { label: "Advanced Amine",      capex: 1.08, opex: 0.88, power: 0.85 },
  membrane:         { label: "Membrane",            capex: 0.85, opex: 0.95, power: 0.70 },
  cryogenic:        { label: "Cryogenic",           capex: 1.25, opex: 1.10, power: 1.35 },
  solid_sorbent:    { label: "Solid Sorbent",       capex: 1.15, opex: 0.82, power: 0.75 },
  mof:              { label: "MOF",                 capex: 1.35, opex: 0.70, power: 0.65 },
};

const CAPEX_GROUPS = {
  flue_gas_cleanup: {
    label: "Flue Gas Cleanup",
    accounts: ["5.1", "5.4", "5.5", "5.7", "5.5+5.12"],
    color: "#58b947",
  },
  electrical: {
    label: "Electrical",
    accounts: ["11.2", "11.3", "11.4", "11.5", "11.x"],
    color: "#f68d2e",
  },
  ic: {
    label: "I&C",
    accounts: ["12.8", "12.9", "12.x"],
    color: "#93348f",
  },
  cooling_water: {
    label: "Cooling Water",
    accounts: ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.x"],
    color: "#58a7af",
  },
  ductwork_stack: {
    label: "Ductwork & Stack",
    accounts: ["7.3", "7.x", "8.x", "3.x"],
    color: "#fdcf0c",
  },
  site_improvements: {
    label: "Site Improvements",
    accounts: ["13.1", "13.2", "13.3", "13.x", "14.5", "14.x"],
    color: "#b83a4b",
  },
};

// HP sources can use membrane and cryogenic; LP sources cannot
const HP_SOURCES = new Set(["ammonia", "eo", "ethanol", "ngp"]);
const HP_ONLY_TECHS = new Set(["membrane", "cryogenic"]);

const CAPACITY_UNITS = {
  t_nh3_yr: "t NH3/yr",
  t_eo_yr: "t EO/yr",
  m_gal_yr: "M gal/yr",
  mmscfd: "MMSCF/yr",
  t_h2_yr: "t H2/yr",
  t_cement_yr: "t cement/yr",
  t_steel_yr: "t steel/yr",
  t_pulp_yr: "ADt pulp/yr",
  t_co2_yr: "t CO2/yr",
  mw_gross: "MW gross",
};

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtM(k) {
  return formatDollars(k * 1000); // k is in $K, convert to $
}

function formatDollars(value, options = {}) {
  if (value == null || isNaN(value)) return "—";
  const { suffix = "", decimals = null } = options;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals ?? 2)}B${suffix}`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals ?? 1)}M${suffix}`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K${suffix}`;
  return `${sign}$${abs.toFixed(decimals ?? 0)}${suffix}`;
}

function pct(val, total) {
  if (!total) return 0;
  return (val / total) * 100;
}

const SEG_COLORS = {
  capital: "var(--seg-capital)",
  fixed_om: "var(--seg-fixed)",
  variable_om: "var(--seg-variable)",
  power: "var(--seg-power)",
  fuel: "var(--seg-fuel)",
};

const SEG_LABELS = {
  capital: "Capital",
  fixed_om: "Fixed O&M",
  variable_om: "Variable O&M",
  power: "Power",
  fuel: "Fuel",
};

export default function App() {
  window.calcLCOC = calcLCOC;
  // ── Input State ──
  const [source, setSource] = useState("ammonia");
  const [techKey, setTechKey] = useState("amine_mea");
  const [buildType, setBuildType] = useState("RF");
  const [captureRate, setCaptureRate] = useState(90);
  const [capacityFactor, setCapacityFactor] = useState(85);
  const [plantCapacity, setPlantCapacity] = useState("");
  const [projectLife, setProjectLife] = useState(30);
  const [projectState, setProjectState] = useState("IL");
  const [costYear, setCostYear] = useState(2026);
  const [debtPct, setDebtPct] = useState("");
  const [costOfDebt, setCostOfDebt] = useState(5.15);
  const [costOfEquity, setCostOfEquity] = useState(12.0);
  const [useFixedHurdle, setUseFixedHurdle] = useState(false);
  const [fixedHurdleRate, setFixedHurdleRate] = useState(10.0);
  const [codYear, setCodYear] = useState(2026);
  const [elecPriceInput, setElecPriceInput] = useState("");
  const [gasPriceInput, setGasPriceInput] = useState("");
  const [co2ProducedInput, setCo2ProducedInput] = useState("");
  const [co2CapturedInput, setCo2CapturedInput] = useState("");
  const [ngccFrameOverride, setNgccFrameOverride] = useState("auto"); // "auto" | "ngcc_f" | "ngcc_h"
  const [activeTab, setActiveTab] = useState("summary");

  // ── Credit & Tax State ──
  const [use45q, setUse45q] = useState(true);
  const [use45qEscalation, setUse45qEscalation] = useState(false);
  const [cpiRate, setCpiRate] = useState(2.5);
  const [useDacRate, setUseDacRate] = useState(false);
  const [dacTechType, setDacTechType] = useState("solid_sorbent");
  const [storageType, setStorageType] = useState("geological");
  const [useCdr, setUseCdr] = useState(false);
  const [cdrRate, setCdrRate] = useState(50);
  const [useAvoidance, setUseAvoidance] = useState(false);
  const [avoidanceRate, setAvoidanceRate] = useState(20);
  const [use45v, setUse45v] = useState(false);
  const [use45z, setUse45z] = useState(false);
  const [useRins, setUseRins] = useState(false);
  const [rinType, setRinType] = useState("d6");
  const [useLcfs, setUseLcfs] = useState(false);
  const [lcfsPrice, setLcfsPrice] = useState(75);
  const [depMethod, setDepMethod] = useState("macrs_5");

  // ── Scenario Management ──
  const [scenarios, setScenarios] = useState([
    { id: "netl_default", name: "NETL Default", locked: true, overrides: {} }
  ]);
  const [activeScenarioId, setActiveScenarioId] = useState("netl_default");
  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];

  // NGCC auto-select: F-frame ≤850 MW, H-frame >850 MW
  const effectiveCapacityRaw = plantCapacity === "" ? (source === "ngcc" ? 740 : null) : parseFloat(plantCapacity);
  const ngccAutoSource = (effectiveCapacityRaw > 850) ? "ngcc_h" : "ngcc_f";
  const ngccFrame = ngccFrameOverride === "auto" ? ngccAutoSource : ngccFrameOverride;
  const activeSource = source === "ngcc" ? ngccFrame : source;

  // Derive source-dependent defaults
  const srcDefaults = NETL_DEFAULTS[activeSource];
  const effectiveDebtPct = debtPct === "" ? srcDefaults.debt_pct * 100 : parseFloat(debtPct);
  const capacityUnit = CAPACITY_UNITS[srcDefaults.capacity_basis] || srcDefaults.capacity_basis;

  // ── Bidirectional production parameter derivation ──
  // ref_co2_capture_tpy is CO2 CAPTURED at 90% capture & 85% CF
  // Any of the three fields (Capacity, CO2 Produced, CO2 Captured) can drive the others
  const refCaptureRate = 0.90;
  const refCo2Produced = srcDefaults.ref_co2_capture_tpy / refCaptureRate;
  const cfRatio = (capacityFactor / 100) / GLOBAL_DEFAULTS.capacity_factor;
  const co2PerCapUnit = refCo2Produced / srcDefaults.ref_capacity;  // CO2 produced per capacity unit at ref CF

  let effectiveCapacity, co2_produced, co2_captured;

  if (co2CapturedInput !== "") {
    // CO2 Captured entered → back-calc CO2 Produced → back-calc Plant Capacity
    co2_captured = parseFloat(co2CapturedInput);
    co2_produced = co2ProducedInput !== "" ? parseFloat(co2ProducedInput) : co2_captured / (captureRate / 100);
    effectiveCapacity = plantCapacity !== "" ? parseFloat(plantCapacity) : co2_produced / (co2PerCapUnit * cfRatio);
  } else if (co2ProducedInput !== "") {
    // CO2 Produced entered → back-calc Plant Capacity, forward-calc CO2 Captured
    co2_produced = parseFloat(co2ProducedInput);
    effectiveCapacity = plantCapacity !== "" ? parseFloat(plantCapacity) : co2_produced / (co2PerCapUnit * cfRatio);
    co2_captured = co2_produced * (captureRate / 100);
  } else {
    // Plant Capacity drives everything (default forward chain)
    effectiveCapacity = plantCapacity === "" ? srcDefaults.ref_capacity : parseFloat(plantCapacity);
    const capacityRatio = effectiveCapacity / srcDefaults.ref_capacity;
    co2_produced = refCo2Produced * capacityRatio * cfRatio;
    co2_captured = co2_produced * (captureRate / 100);
  }

  // Energy prices: derived from state + year, overridable by user input
  const defaultElecPrice = EIA_ELEC_RATES[projectState];
  const hhPrice = HH_FORWARD_STRIP[codYear] ?? 3.42;
  const defaultGasPrice = hhPrice + (NG_BASIS_DIFFERENTIAL[projectState] ?? 0);
  const elecPrice = elecPriceInput !== "" ? parseFloat(elecPriceInput) : defaultElecPrice;
  const gasPrice = gasPriceInput !== "" ? parseFloat(gasPriceInput) : defaultGasPrice;

  // ── DAC tech multiplier (layered on top of base tech_multiplier) ──
  const dacMult = (activeSource === "dac_solid" && dacTechType !== "solid_sorbent")
    ? DAC_TECH_MULTIPLIERS[dacTechType] : null;
  const effectiveTechMult = dacMult
    ? {
        capex: (TECH_MULTIPLIERS[techKey]?.capex ?? 1) * dacMult.capex,
        opex:  (TECH_MULTIPLIERS[techKey]?.opex  ?? 1) * dacMult.opex,
        power: (TECH_MULTIPLIERS[techKey]?.power ?? 1) * dacMult.power,
      }
    : TECH_MULTIPLIERS[techKey];

  // ── Compute LCOC ──
  const result = useMemo(() => {
    const inputs = {
      source: activeSource,
      co2_capture_tpy: co2_captured,
      capacity_factor: capacityFactor / 100,
      build_type: buildType,
      location_factor: 1.0,
      elec_price_override: elecPrice,
      gas_price_override: gasPrice,
      tech_multiplier: effectiveTechMult,
      dac_tech_type: dacTechType,
      cepci_current: CEPCI_BY_YEAR[costYear] ?? GLOBAL_DEFAULTS.cepci_current,
      debt_pct: effectiveDebtPct / 100,
      cost_of_debt: costOfDebt / 100,
      cost_of_equity: costOfEquity / 100,
      project_life: projectLife,
      state: projectState,
      use_fixed_hurdle_rate: useFixedHurdle,
      fixed_hurdle_rate: fixedHurdleRate / 100,
    };
    return calcLCOC(inputs, activeScenario);
  }, [activeSource, co2_captured, captureRate, effectiveCapacity, capacityFactor, buildType, elecPrice, gasPrice, costOfEquity, effectiveDebtPct, costOfDebt, projectLife, useFixedHurdle, fixedHurdleRate, projectState, codYear, costYear, techKey, dacTechType, activeScenario]);

  const { lcoc, components, details, errors = [], warnings = [] } = result;

  // ── Cash Flow Computation ──
  const cashFlowResult = useMemo(() => {
    if (errors.length || !co2_captured) return null;
    const cfInputs = {
      source: activeSource,
      co2_capture_tpy: co2_captured,
      capacity_factor: capacityFactor / 100,
      build_type: buildType,
      location_factor: 1.0,
      elec_price_override: elecPrice,
      gas_price_override: gasPrice,
      tech_multiplier: effectiveTechMult,
      dac_tech_type: dacTechType,
      cepci_current: CEPCI_BY_YEAR[costYear] ?? GLOBAL_DEFAULTS.cepci_current,
      debt_pct: effectiveDebtPct / 100,
      cost_of_debt: costOfDebt / 100,
      cost_of_equity: costOfEquity / 100,
      project_life: projectLife,
      use_fixed_hurdle_rate: useFixedHurdle,
      fixed_hurdle_rate: fixedHurdleRate / 100,
      cod_year: codYear,
      state: projectState,
      depreciation_method: depMethod,
      storage_type: storageType,
      use_45q: use45q,
      use_45q_escalation: use45q && use45qEscalation,
      use_dac_obbba_rate: use45q && useDacRate,
      inflation_rate: cpiRate / 100,
      // Credit toggles
      use_cdr_credit: useCdr,
      cdr_credit_rate: cdrRate,
      use_avoidance_credit: useAvoidance,
      avoidance_credit_rate: avoidanceRate,
      use_45v: use45v,
      use_45z: use45z,
      use_rins: useRins,
      rin_type: rinType,
      use_lcfs: useLcfs,
      lcfs_price: lcfsPrice,
    };
    const cf = calcCashFlow(cfInputs, activeScenario);
    return cf;
  }, [activeSource, co2_captured, capacityFactor, buildType, elecPrice, gasPrice, techKey, dacTechType, costYear,
      effectiveDebtPct, costOfDebt, costOfEquity, projectLife, useFixedHurdle, fixedHurdleRate,
      codYear, projectState, depMethod, storageType, use45q, use45qEscalation, useDacRate, cpiRate,
      useCdr, cdrRate, useAvoidance, avoidanceRate, use45v, use45z, useRins, rinType, useLcfs, lcfsPrice,
      activeScenario, errors]);

  // Reset source-dependent fields when source changes
  const handleSourceChange = (newSource) => {
    setSource(newSource);
    setDebtPct("");
    setPlantCapacity("");
    setCo2ProducedInput("");
    setCo2CapturedInput("");
    setNgccFrameOverride("auto");
    // Reset tech if current selection is incompatible with new source
    const resolvedSource = newSource === "ngcc" ? "ngcc_f" : newSource;
    if (HP_ONLY_TECHS.has(techKey) && !HP_SOURCES.has(resolvedSource)) {
      setTechKey("amine_mea");
    }
    // Auto-set build type for sources that only support one
    const def = NETL_DEFAULTS[resolvedSource];
    if (def?.gf_only) setBuildType("GF");
    if (def?.rf_only) setBuildType("RF");
    // Auto-set DAC rate for DAC sources
    if (def?.is_dac) setUseDacRate(true);
    // DOC requires coastal access — auto-switch to TX if current state is inland
    if (newSource === "doc_electrochemical" && !COASTAL_STATES.includes(projectState)) {
      setProjectState("TX");
      setElecPriceInput("");
      setGasPriceInput("");
    }
  };

  return (
    <div className="app-shell">
      {/* ── Branded Top Bar ── */}
      <div style={{ width: "100%", background: "#58b947", padding: "0 24px", height: 44, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: "0.2px" }}>Capture Cost Model</span>
        <span style={{ background: "rgba(255,255,255,0.25)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, letterSpacing: "0.8px", textTransform: "uppercase" }}>BETA</span>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>|</span>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 400 }}>Enverus Intelligence® Research</span>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>|</span>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 400 }}>v1.0</span>
        <span style={{ marginLeft: "auto" }} className="scenario-badge">{activeScenario.name}</span>
      </div>

      {/* ── Tab Bar ── */}
      <nav className="tab-bar">
        <button className={`tab-btn${activeTab === "summary" ? " active" : ""}`} onClick={() => setActiveTab("summary")}>Summary</button>
        <button className={`tab-btn${activeTab === "model" ? " active" : ""}`} onClick={() => setActiveTab("model")}>Model</button>
        <button className={`tab-btn${activeTab === "inputs" ? " active" : ""}`} onClick={() => setActiveTab("inputs")}>Inputs</button>
        <button className={`tab-btn${activeTab === "cashflow" ? " active" : ""}`} onClick={() => setActiveTab("cashflow")}>Cash Flow</button>
        <button className={`tab-btn${activeTab === "charts" ? " active" : ""}`} onClick={() => setActiveTab("charts")}>Charts</button>
        <button className={`tab-btn${activeTab === "sensitivity" ? " active" : ""}`} onClick={() => setActiveTab("sensitivity")}>Sensitivity</button>
        <button className={`tab-btn${activeTab === "batch" ? " active" : ""}`} onClick={() => setActiveTab("batch")}>Batch</button>
        <button className={`tab-btn${activeTab === "assumptions" ? " active" : ""}`} onClick={() => setActiveTab("assumptions")}>Assumptions</button>
      </nav>

      {/* ── Persistent Summary Bar ── */}
      {(() => {
        const cfSum = cashFlowResult?.summary;
        const fmtCo2 = co2_captured >= 1e6 ? (co2_captured / 1e6).toFixed(1) + "M" : Math.round(co2_captured / 1e3) + "K";
        const netLcoc = cfSum?.net_lcoc;
        const npv = cfSum?.npv;
        const irr = cfSum?.irr;
        const wacc = details?.wacc;
        return (
          <div className="summary-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 20px", borderRight: "1px solid #e0e0e0" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#58b947", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#999999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Scenario</span>
              <span style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 600 }}>{activeScenario.name}</span>
            </div>
            <div className="sb-section">
              <span className="sb-val">{NETL_DEFAULTS[activeSource]?.label ?? activeSource}{activeSource === "dac_solid" ? ` \u2022 ${DAC_TECH_MULTIPLIERS[dacTechType]?.label ?? dacTechType}` : ""}</span>
              <span className={`sb-pill ${buildType === "GF" ? "sb-pill-gf" : "sb-pill-rf"}`}>{buildType}</span>
            </div>
            <div className="sb-section sb-hide-900">
              <span className="sb-label">CF</span>
              <span className="sb-val">{capacityFactor}%</span>
            </div>
            <div className="sb-section sb-hide-900">
              <span className="sb-label">CO2</span>
              <span className="sb-val">{fmtCo2} t/yr</span>
            </div>
            <div className="sb-section sb-hide-1400">
              <span className="sb-label">STATE</span>
              <span className="sb-val">{projectState}</span>
            </div>
            <div className="sb-section sb-hide-1200">
              <span className="sb-label">CAPEX</span>
              <span className="sb-val">{formatDollars((details?.capex_k ?? 0) * 1000)}</span>
            </div>
            <div className="sb-section sb-hide-1200">
              <span className="sb-label">OPEX</span>
              <span className="sb-val">{formatDollars(((components?.fixed_om ?? 0) + (components?.variable_om ?? 0) + (components?.power ?? 0) + (components?.fuel ?? 0)) * co2_captured, { suffix: "/yr" })}</span>
            </div>
            <div className="sb-section">
              <span className="sb-label">LCOC</span>
              <span className="sb-lcoc">${fmt(lcoc, 2)}/t</span>
            </div>
            <div className="sb-section">
              <span className="sb-label">Net</span>
              <span className={`sb-val ${(netLcoc ?? 0) <= 0 ? "sb-positive" : "sb-negative"}`}>
                {netLcoc != null ? "$" + fmt(netLcoc, 2) + "/t" : "—"}
              </span>
            </div>
            <div className="sb-section sb-hide-1200">
              <span className="sb-label">NPV</span>
              <span className={`sb-val ${(npv ?? 0) >= 0 ? "sb-positive" : "sb-negative"}`}>
                {npv != null ? formatDollars(npv) : "—"}
              </span>
            </div>
            <div className="sb-section sb-hide-1200" style={{ borderRight: "none" }}>
              <span className="sb-label">IRR</span>
              <span className={`sb-val ${irr != null && wacc != null ? (irr > wacc ? "sb-positive" : "sb-negative") : ""}`}>
                {irr != null ? fmt(irr * 100, 1) + "%" : "—"}
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Summary Content ── */}
      {activeTab === "summary" && <div className="summary-grid">
        {/* ── LEFT: Inputs Panel ── */}
        <div className="inputs-panel">

          {/* Capture Configuration */}
          <div className="card">
            <div className="card-title">Capture Configuration</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Source</span>
              <select
                value={source}
                onChange={(e) => handleSourceChange(e.target.value)}
                style={{
                  textAlign: "right",
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 13,
                  color: "#1a1a1a",
                }}
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Technology</span>
              <select
                value={techKey}
                onChange={(e) => setTechKey(e.target.value)}
                style={{
                  textAlign: "right",
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 13,
                  color: "#1a1a1a",
                }}
              >
                {Object.entries(TECH_MULTIPLIERS).map(([key, tech]) => {
                  const isHPOnly = HP_ONLY_TECHS.has(key);
                  const isHP = HP_SOURCES.has(activeSource);
                  const disabled = isHPOnly && !isHP;
                  return (
                    <option key={key} value={key} disabled={disabled}>
                      {tech.label}{disabled ? " (HP only)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Capture Rate</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>%</span>
                <input
                  type="number"
                  value={captureRate}
                  onChange={(e) => setCaptureRate(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Build Type</span>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${buildType === "GF" ? "active" : ""}`}
                  onClick={() => setBuildType("GF")}
                  disabled={srcDefaults?.rf_only}
                  title={srcDefaults?.rf_only ? "This source is retrofit only" : ""}
                >GF</button>
                <button
                  className={`toggle-btn ${buildType === "RF" ? "active" : ""}`}
                  onClick={() => setBuildType("RF")}
                  disabled={srcDefaults?.gf_only}
                  title={srcDefaults?.gf_only ? "This source is greenfield only" : ""}
                >RF</button>
              </div>
            </div>
          </div>

          {/* Production Parameters */}
          <div className="card">
            <div className="card-title">Production Parameters</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Plant Capacity</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>{capacityUnit}</span>
                <input
                  type="number"
                  value={plantCapacity !== "" ? plantCapacity : Math.round(effectiveCapacity)}
                  onChange={(e) => setPlantCapacity(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 90,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
            {source === "ngcc" && (
              <div className="field-source" style={{ marginTop: 0, marginBottom: 10 }}>
                {ngccFrameOverride !== "auto"
                  ? `Override: ${ngccFrame === "ngcc_h" ? "H-frame" : "F-frame"}`
                  : effectiveCapacity > 850
                    ? "Using H-frame reference (>850 MW)"
                    : "Using F-frame reference (\u2264850 MW)"}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Capacity Factor</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>%</span>
                <input
                  type="number"
                  value={capacityFactor}
                  onChange={(e) => setCapacityFactor(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>CO₂ Produced</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>t/yr</span>
                <input
                  type="number"
                  value={co2ProducedInput}
                  placeholder={Math.round(co2_produced)}
                  onChange={(e) => setCo2ProducedInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 110,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>CO₂ Captured</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>t/yr</span>
                <input
                  type="number"
                  value={co2CapturedInput}
                  placeholder={Math.round(co2_captured)}
                  onChange={(e) => setCo2CapturedInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 110,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Cost Basis */}
          <div className="card">
            <div className="card-title">Cost Basis</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Project State</span>
              <select
                value={projectState}
                onChange={(e) => { setProjectState(e.target.value); setElecPriceInput(""); setGasPriceInput(""); }}
                style={{
                  textAlign: "right",
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 13,
                  color: "#1a1a1a",
                }}
              >
                {US_STATES.map((st) => {
                  const isDocInland = activeSource === "doc_electrochemical" && !COASTAL_STATES.includes(st);
                  return (
                    <option key={st} value={st} disabled={isDocInland} style={{ color: isDocInland ? "#cccccc" : "#1a1a1a" }}>{st}</option>
                  );
                })}
              </select>
              {activeSource === "doc_electrochemical" && (
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>DOC requires coastal or ocean access</div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Cost Year</span>
              <select
                value={costYear}
                onChange={(e) => setCostYear(parseInt(e.target.value))}
                style={{
                  textAlign: "right",
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 13,
                  color: "#1a1a1a",
                }}
              >
                {Object.keys(CEPCI_BY_YEAR).map((yr) => (
                  <option key={yr} value={yr}>{yr}{yr === "2026" ? " (est.)" : ""}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>COD Year</span>
              <select
                value={codYear}
                onChange={(e) => { setCodYear(parseInt(e.target.value)); setGasPriceInput(""); }}
                style={{
                  textAlign: "right",
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 13,
                  color: "#1a1a1a",
                }}
              >
                {Object.keys(HH_FORWARD_STRIP).map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Project Life</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>yr</span>
                <input
                  type="number"
                  value={projectLife}
                  onChange={(e) => setProjectLife(parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 60,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Capital Structure */}
          <div className="card">
            <div className="card-title">Capital Structure</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Debt %</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>%</span>
                <input
                  type="number"
                  value={effectiveDebtPct}
                  onChange={(e) => setDebtPct(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  disabled={useFixedHurdle}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                    opacity: useFixedHurdle ? 0.5 : 1,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Cost of Debt</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>%</span>
                <input
                  type="number"
                  value={costOfDebt}
                  onChange={(e) => setCostOfDebt(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  disabled={useFixedHurdle}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                    opacity: useFixedHurdle ? 0.5 : 1,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Cost of Equity</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>%</span>
                <input
                  type="number"
                  value={costOfEquity}
                  onChange={(e) => setCostOfEquity(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  disabled={useFixedHurdle}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                    opacity: useFixedHurdle ? 0.5 : 1,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>{useFixedHurdle ? "Hurdle Rate (fixed)" : "WACC (calc)"}</span>
              <span style={{ fontSize: 13, color: "#1a1a1a" }}>{fmt(details.wacc * 100, 2)}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <label style={{ fontSize: 12, color: "#555555", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={useFixedHurdle}
                  onChange={(e) => setUseFixedHurdle(e.target.checked)}
                />
                Fixed Hurdle Rate
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>%</span>
                <input
                  type="number"
                  value={fixedHurdleRate}
                  onChange={(e) => setFixedHurdleRate(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  disabled={!useFixedHurdle}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                    opacity: useFixedHurdle ? 1 : 0.5,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Depreciation Method</span>
              <select style={{
                textAlign: "right",
                border: "1px solid #e0e0e0",
                borderRadius: 3,
                padding: "3px 6px",
                fontSize: 13,
                color: "#1a1a1a",
              }} value={depMethod} onChange={(e) => setDepMethod(e.target.value)}>
                <option value="macrs_5">MACRS 5-Year</option>
                <option value="macrs_15">MACRS 15-Year</option>
                <option value="sl_10">SL 10-Year</option>
                <option value="sl_20">SL 20-Year</option>
                <option value="sl_30">SL 30-Year</option>
              </select>
            </div>
          </div>

          {/* Energy Prices */}
          <div className="card">
            <div className="card-title">Energy Prices</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Electricity</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>$/MWh</span>
                <input
                  type="number"
                  value={elecPriceInput}
                  placeholder={defaultElecPrice.toFixed(1)}
                  onChange={(e) => setElecPriceInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 70,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
            <div className="field-source">
              {elecPriceInput !== "" ? "Manual override" : "EIA 2024 industrial rate"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 28 }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Natural Gas</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#999999" }}>$/MMBtu</span>
                <input
                  type="number"
                  value={gasPriceInput}
                  placeholder={defaultGasPrice.toFixed(2)}
                  onChange={(e) => setGasPriceInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: 80,
                    textAlign: "right",
                    border: "1px solid #e0e0e0",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 13,
                    color: "#1a1a1a",
                  }}
                />
              </div>
            </div>
            <div className="field-source">
              {gasPriceInput !== "" ? "Manual override" : "HH 2026-02-17 strip + basis"}
            </div>
          </div>

        </div>

        {/* ── MIDDLE: LCOC Focus ── */}
        <div className="summary-mid-col">
          {errors.length > 0 && <div className="alert alert-error">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
          {warnings.length > 0 && <div className="alert alert-warn">{warnings.map((w, i) => <div key={i}>{w}</div>)}</div>}

          {/* Card 1: LCOC + Cost Breakdown */}
          <div className="ocard">
            <div className="ocard-title">LCOC</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: "#58b947" }}>${fmt(lcoc, 2)}</span>
            <span style={{ color: "var(--text-dim)", fontSize: 13 }}> /t CO2</span>
            <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 10, marginBottom: 6 }}>
              LCOC BREAKDOWN
            </div>
            <div className="stacked-bar" style={{ height: 40, borderRadius: 4 }}>
              {Object.entries(components).map(([key, val]) => { const w = pct(val, lcoc); if (w <= 0) return null; return <div key={key} className="seg" style={{ width: w + "%", background: SEG_COLORS[key] }} title={`${SEG_LABELS[key]}: $${fmt(val, 2)}/t (${fmt(pct(val, lcoc), 1)}%)`} />; })}
            </div>
            <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              $/t CO₂ captured
            </div>
            {Object.entries(components).map(([key, val]) => { if (val <= 0) return null; const p = pct(val, lcoc); return (
              <div className="ocard-row" key={key} style={{ gap: 8 }}>
                <div style={{ width: 8, height: 8, background: SEG_COLORS[key], flexShrink: 0 }} />
                <span className="ocard-l">{SEG_LABELS[key]}</span>
                <span className="ocard-v">${fmt(val, 2)}/t</span>
                <span className="ocard-pct">{fmt(p, 1)}%</span>
              </div>
            ); })}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
              <div className="ocard-row" style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a" }}><span className="ocard-l">Total</span><span className="ocard-v">${fmt(lcoc, 2)}/t</span><span className="ocard-pct">100%</span></div>
            </div>
          </div>

          {/* Card 2: CAPEX */}
          <div className="ocard">
            <div className="ocard-title">CAPEX</div>
            <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              TPC BREAKDOWN
            </div>
            {(() => {
              const items = details.scaledLineItems ?? [];
              const adj = details.combined_adj ?? 1;
              const groupTotals = Object.entries(CAPEX_GROUPS).map(([key, g]) => ({ key, ...g, value: 0, pct: 0 }));
              let totalTPC = 0;
              items.forEach(item => {
                const adjK = (item.scaled_k ?? 0) * adj;
                totalTPC += adjK;
                const match = groupTotals.find(g => g.accounts.some(a => item.acct.startsWith(a) || item.acct === a));
                if (match) {
                  match.value += adjK;
                }
              });
              groupTotals.forEach(g => g.pct = totalTPC > 0 ? (g.value / totalTPC) * 100 : 0);
              return groupTotals.map(g => g.value > 0 ? (
                <div className="ocard-row" key={g.key}>
                  <span className="ocard-l">{g.label}</span>
                  <span className="ocard-v">{formatDollars(g.value * 1000)}</span>
                  <span className="ocard-pct">{fmt(g.pct, 1)}%</span>
                </div>
              ) : null);
            })()}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
              <div className="ocard-row"><span className="ocard-l">Total TPC</span><span className="ocard-v">{formatDollars((details.adj_tpc_k ?? 0) * 1000)}</span></div>
              <div className="ocard-row"><span className="ocard-l">+ Owner's Costs (22%)</span><span className="ocard-v">{formatDollars(((details.capex_k ?? 0) - (details.adj_tpc_k ?? 0)) * 1000)}</span></div>
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
                <div className="ocard-row"><span className="ocard-l">Total CAPEX</span><span className="ocard-v">{formatDollars((details.capex_k ?? 0) * 1000)}</span></div>
                <div className="ocard-row"><span className="ocard-l">Annuity Factor</span><span className="ocard-v">{fmt((details.af ?? 0) * 100, 2)}%</span></div>
                <div className="ocard-row"><span className="ocard-l">Annual Capital Cost</span><span className="ocard-v">{formatDollars((details.capex_k ?? 0) * 1000 * (details.af ?? 0), { suffix: "/yr" })}</span></div>
                <div className="ocard-row"><span className="ocard-l">WACC</span><span className="ocard-v">{fmt((details.wacc ?? 0) * 100, 2)}%</span></div>
              </div>
            </div>
          </div>

          {/* Card 3: OPEX */}
          <div className="ocard">
            <div className="ocard-title">OPEX</div>
            {(() => {
              const co2 = details.co2_per_year ?? 1;
              const fixedTotal = (details.op_labor_annual ?? 0) + (details.maint_labor ?? 0) + (details.admin ?? 0) + (details.pti ?? 0);
              const varTotal = (details.maint_material ?? 0) + (details.consumables ?? 0);
              const powerTotal = details.power_annual ?? 0;
              const grandTotal = fixedTotal + varTotal + powerTotal;
              return (<>
                <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                  FIXED COSTS
                </div>
                <div className="ocard-row" style={{ fontWeight: 600 }}><span className="ocard-l">Fixed O&M</span><span className="ocard-v">{formatDollars(fixedTotal * (details.tech_opex ?? 1), { suffix: "/yr" })}</span></div>
                <div className="ocard-row ocard-sub"><span className="ocard-l">Op Labor</span><span className="ocard-v">{formatDollars(details.op_labor_annual ?? 0, { suffix: "/yr" })}</span></div>
                <div className="ocard-row ocard-sub"><span className="ocard-l">Maint Labor</span><span className="ocard-v">{formatDollars(details.maint_labor ?? 0, { suffix: "/yr" })}</span></div>
                <div className="ocard-row ocard-sub"><span className="ocard-l">Admin</span><span className="ocard-v">{formatDollars(details.admin ?? 0, { suffix: "/yr" })}</span></div>
                <div className="ocard-row ocard-sub"><span className="ocard-l">PT&I</span><span className="ocard-v">{formatDollars(details.pti ?? 0, { suffix: "/yr" })}</span></div>
                <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 8, marginBottom: 6 }}>
                  VARIABLE COSTS
                </div>
                <div className="ocard-row" style={{ fontWeight: 600 }}><span className="ocard-l">Variable O&M</span><span className="ocard-v">{formatDollars(varTotal * (details.tech_opex ?? 1), { suffix: "/yr" })}</span></div>
                <div className="ocard-row ocard-sub"><span className="ocard-l">Maint Material</span><span className="ocard-v">{formatDollars(details.maint_material ?? 0, { suffix: "/yr" })}</span></div>
                <div className="ocard-row ocard-sub"><span className="ocard-l">Consumables</span><span className="ocard-v">{(details.consumables ?? 0) === 0 ? "$0 (Phase 2)" : formatDollars(details.consumables, { suffix: "/yr" })}</span></div>
                <div className="ocard-row" style={{ fontWeight: 600 }}><span className="ocard-l">Power</span><span className="ocard-v">{formatDollars(powerTotal, { suffix: "/yr" })}</span></div>
                {details.fuel_applicable && <div className="ocard-row" style={{ fontWeight: 600 }}><span className="ocard-l">Fuel</span><span className="ocard-v">{formatDollars((components.fuel ?? 0) * co2, { suffix: "/yr" })}</span></div>}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
                  <div className="ocard-row" style={{ fontWeight: 700 }}><span className="ocard-l">Total OpEx</span><span className="ocard-v">{formatDollars(grandTotal * (details.tech_opex ?? 1), { suffix: "/yr" })}</span></div>
                </div>
              </>);
            })()}
          </div>

          {/* Card 4: Power & Fuel */}
          <div className="ocard">
            <div className="ocard-title">Power & Fuel</div>
            <div className="ocard-row"><span className="ocard-l">Parasitic Load</span><span className="ocard-v">{fmt(details.scaled_mw, 1)} MW</span></div>
            <div className="ocard-row"><span className="ocard-l">Annual Energy</span><span className="ocard-v">{fmt(details.annual_mwh, 0)} MWh/yr</span></div>
            <div className="ocard-row"><span className="ocard-l">Electricity</span><span className="ocard-v">${fmt(details.elec_price, 0)}/MWh ({projectState})</span></div>
            <div className="ocard-row"><span className="ocard-l">Gas Price</span><span className="ocard-v">${fmt(gasPrice, 2)}/MMBtu</span></div>
            <div className="ocard-row"><span className="ocard-l">Fuel Cost</span><span className="ocard-v">{details.fuel_applicable ? "$" + fmt(components.fuel, 2) + "/t" : "N/A"}</span></div>
          </div>
        </div>

        {/* ── RIGHT: Financials ── */}
        {(() => {
          const cfS = cashFlowResult?.summary;
          const netLcoc = cfS?.net_lcoc;
          const avgCredits = cfS ? (cfS.gross_lcoc - cfS.net_lcoc) : 0;
          const margin = avgCredits > lcoc ? avgCredits - lcoc : 0;
          const yr1 = cashFlowResult?.years?.find(y => y.operating_year === 1);
          const stTax = STATE_TAX_RATES[projectState] ?? 0;
          const combTax = combinedTaxRate(projectState);
          return (
        <div className="summary-right-col">
          <div className="ocard">
            <div className="ocard-title">Tax & Depreciation</div>
            <div className="ocard-row"><span className="ocard-l">Federal Tax</span><span className="ocard-v">21.0%</span></div>
            <div className="ocard-row"><span className="ocard-l">State Tax ({projectState})</span><span className="ocard-v">{fmt(stTax * 100, 1)}%</span></div>
            <div className="ocard-row"><span className="ocard-l">Combined</span><span className="ocard-v">{fmt(combTax * 100, 1)}%</span></div>
            <div className="ocard-row"><span className="ocard-l">Method</span><span className="ocard-v">{DEPRECIATION_SCHEDULES[depMethod]?.label ?? depMethod}</span></div>
            <div className="ocard-row"><span className="ocard-l">Dep. Shield (Yr1)</span><span className="ocard-v">{yr1 ? formatDollars(yr1.dep_shield) : "—"}</span></div>
          </div>

          <div className="ocard">
            <div className="ocard-title">Incentives</div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>45Q</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={use45q} onChange={setUse45q} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>
                  {use45q ? `$${useDacRate ? 180 : 85}/t × 12yr${yr1 ? ` → ${formatDollars(yr1.credit_45q, { suffix: "/yr" })}` : ""}` : ""}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Escalation</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={use45qEscalation} onChange={setUse45qEscalation} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>
                  {use45qEscalation ? "CPI" : ""}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>DAC Rate</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={useDacRate} onChange={setUseDacRate} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>
                  {useDacRate ? "$180/t" : ""}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>45V</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={use45v} onChange={setUse45v} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }} />
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>45Z</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={use45z} onChange={setUse45z} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }} />
              </span>
            </div>
          </div>

          <div className="ocard">
            <div className="ocard-title">Carbon Markets</div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>CDR Credit</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={useCdr} onChange={setUseCdr} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>${cdrRate}/t</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>Avoidance</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={useAvoidance} onChange={setUseAvoidance} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>${avoidanceRate}/t</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>RINs</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={useRins} onChange={setUseRins} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>
                  {useRins ? rinType.toUpperCase() : ""}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", minHeight: "28px", padding: "2px 0" }}>
              <span style={{ fontSize: 12, color: "#555555" }}>LCFS</span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <ToggleSwitch value={useLcfs} onChange={setUseLcfs} />
                <span style={{ fontSize: 11, color: "#58b947", minWidth: 70, textAlign: "right" }}>${lcfsPrice}/t</span>
              </span>
            </div>
          </div>

          <div className="ocard">
            <div className="ocard-title">Revenue & Margin</div>
            <div className="ocard-row"><span className="ocard-l">Gross Cost</span><span className="ocard-v">${fmt(lcoc, 2)}/t</span></div>
            <div className="ocard-row"><span className="ocard-l">Avg Credits</span><span className="ocard-v ocard-green">${fmt(avgCredits, 2)}/t</span></div>
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
              <div className="ocard-row"><span className="ocard-l">Net Cost</span><span className={`ocard-v ${(netLcoc ?? 0) <= 0 ? "ocard-green" : ""}`}>{netLcoc != null ? "$" + fmt(netLcoc, 2) + "/t" : "—"}</span></div>
              <div className="ocard-row"><span className="ocard-l">Margin</span><span className="ocard-v ocard-green">+${fmt(margin, 2)}/t</span></div>
            </div>
          </div>

          <div className="ocard">
            <div className="ocard-title">Breakeven & Returns</div>
            <div className="ocard-row"><span className="ocard-l">Breakeven Price</span><span className="ocard-v">${fmt(lcoc, 2)}/t</span></div>
            <div className="ocard-row"><span className="ocard-l">w/ 45Q</span><span className="ocard-v">${fmt(Math.max(0, lcoc - (use45q ? 85 * 12 / (details.n ?? 30) : 0)), 2)}/t</span></div>
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
              <div className="ocard-row"><span className="ocard-l">NPV @ WACC</span><span className={`ocard-v ${(cfS?.npv ?? 0) >= 0 ? "ocard-green" : ""}`}>{cfS?.npv != null ? formatDollars(cfS.npv) : "—"}</span></div>
              <div className="ocard-row"><span className="ocard-l">IRR</span><span className="ocard-v">{cfS?.irr != null ? fmt(cfS.irr * 100, 1) + "%" : "—"}</span></div>
              <div className="ocard-row"><span className="ocard-l">Payback</span><span className="ocard-v">{cfS?.payback != null ? fmt(cfS.payback, 1) + " yr" : "Never"}</span></div>
            </div>
          </div>
        </div>
          );
        })()}
      </div>}

      {/* ── Model Tab ── */}
      {activeTab === "model" && <ModelTab details={details} components={components} lcoc={lcoc} srcDefaults={NETL_DEFAULTS[details.src]} source={details.src} cf={cashFlowResult} projectState={projectState} onViewSensitivity={() => setActiveTab("sensitivity")} />}

      {/* ── Inputs Tab ── */}
      {activeTab === "inputs" && (
        <InputsTab
          scenarios={scenarios}
          setScenarios={setScenarios}
          activeScenarioId={activeScenarioId}
          setActiveScenarioId={setActiveScenarioId}
          activeSource={activeSource}
          ngccFrameOverride={ngccFrameOverride}
          setNgccFrameOverride={setNgccFrameOverride}
          dacTechType={dacTechType}
          setDacTechType={setDacTechType}
        />
      )}

      {/* ── Cash Flow Tab ── */}
      {activeTab === "cashflow" && (
        <CashFlowTab
          cf={cashFlowResult}
          projectState={projectState}
          use45q={use45q} setUse45q={setUse45q}
          use45qEscalation={use45qEscalation} setUse45qEscalation={setUse45qEscalation}
          cpiRate={cpiRate} setCpiRate={setCpiRate}
          useDacRate={useDacRate} setUseDacRate={setUseDacRate}
          storageType={storageType} setStorageType={setStorageType}
          useCdr={useCdr} setUseCdr={setUseCdr} cdrRate={cdrRate} setCdrRate={setCdrRate}
          useAvoidance={useAvoidance} setUseAvoidance={setUseAvoidance} avoidanceRate={avoidanceRate} setAvoidanceRate={setAvoidanceRate}
          use45v={use45v} setUse45v={setUse45v}
          use45z={use45z} setUse45z={setUse45z}
          useRins={useRins} setUseRins={setUseRins} rinType={rinType} setRinType={setRinType}
          useLcfs={useLcfs} setUseLcfs={setUseLcfs} lcfsPrice={lcfsPrice} setLcfsPrice={setLcfsPrice}
          depMethod={depMethod} setDepMethod={setDepMethod}
        />
      )}

      {/* ── Charts Tab ── */}
      {activeTab === "charts" && (
        <ChartsTab
          result={result}
          cashFlowResult={cashFlowResult}
          activeSource={activeSource}
          activeScenario={activeScenario}
          scenarios={scenarios}
          baseInputs={{
            source: activeSource,
            co2_capture_tpy: co2_captured,
            capacity_factor: capacityFactor / 100,
            build_type: buildType,
            location_factor: 1.0,
            elec_price_override: elecPrice,
            gas_price_override: gasPrice,
            tech_multiplier: effectiveTechMult,
            dac_tech_type: dacTechType,
            cepci_current: CEPCI_BY_YEAR[costYear] ?? GLOBAL_DEFAULTS.cepci_current,
            debt_pct: effectiveDebtPct / 100,
            cost_of_debt: costOfDebt / 100,
            cost_of_equity: costOfEquity / 100,
            project_life: projectLife,
            use_fixed_hurdle_rate: useFixedHurdle,
            fixed_hurdle_rate: fixedHurdleRate / 100,
            cod_year: codYear,
            state: projectState,
            depreciation_method: depMethod,
          }}
          techKey={techKey}
          onSelectSource={(src) => { handleSourceChange(src); setActiveTab("summary"); }}
          onSelectState={(st) => { setProjectState(st); setElecPriceInput(""); setGasPriceInput(""); setActiveTab("summary"); }}
        />
      )}

      {/* ── Sensitivity Tab ── */}
      {activeTab === "sensitivity" && (
        <SensitivityTab
          baseInputs={{
            source: activeSource,
            co2_capture_tpy: co2_captured,
            capacity_factor: capacityFactor / 100,
            build_type: buildType,
            location_factor: 1.0,
            elec_price_override: elecPrice,
            gas_price_override: gasPrice,
            tech_multiplier: effectiveTechMult,
            dac_tech_type: dacTechType,
            cepci_current: CEPCI_BY_YEAR[costYear] ?? GLOBAL_DEFAULTS.cepci_current,
            debt_pct: effectiveDebtPct / 100,
            cost_of_debt: costOfDebt / 100,
            cost_of_equity: costOfEquity / 100,
            project_life: projectLife,
            use_fixed_hurdle_rate: useFixedHurdle,
            fixed_hurdle_rate: fixedHurdleRate / 100,
            cod_year: codYear,
            state: projectState,
          }}
          activeScenario={activeScenario}
          lcoc={lcoc}
          activeSource={activeSource}
          buildType={buildType}
          capacityFactor={capacityFactor}
        />
      )}

      {/* ── Batch Tab ── */}
      {activeTab === "batch" && <BatchTab activeScenario={activeScenario} />}

      {/* ── Assumptions Tab ── */}
      {activeTab === "assumptions" && <AssumptionsTab />}

    </div>
  );
}

function ModelStep({ num, title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="model-step">
      <div className="step-header" onClick={() => setOpen(!open)}>
        <span className="step-num">{num}</span>
        <span className="step-title">{title}</span>
        <span className="step-chevron">{open ? "\u25B4" : "\u25BE"}</span>
      </div>
      {open && <div className="step-body">{children}</div>}
    </div>
  );
}

function MRow({ label, value, unit, netl, amber }) {
  const isAmber = amber || (netl !== undefined && netl !== null);
  return (
    <div className={`m-row${isAmber ? " m-amber" : ""}`}>
      <span className="m-label">{label}</span>
      <span className="m-value" title={netl != null ? `NETL default: ${netl}` : undefined}>
        {value}{unit && <span className="m-unit"> {unit}</span>}
      </span>
      {netl != null && (
        <span className="m-netl" title={`NETL default: ${netl}`}>Ref: {netl}</span>
      )}
    </div>
  );
}

// Returns { amber: true, netl: "formatted default" } if current differs from default, else {}
function ovCheck(currentVal, source, netlKey, globalKey, fmtFn) {
  const netlVal = NETL_DEFAULTS[source]?.[netlKey];
  const globalVal = globalKey ? GLOBAL_DEFAULTS[globalKey] : undefined;
  const defaultVal = netlVal ?? globalVal;
  if (defaultVal == null) return {};
  // Compare with tolerance for floating point
  if (Math.abs(currentVal - defaultVal) < 0.0001) return {};
  return { amber: true, netl: fmtFn ? fmtFn(defaultVal) : String(defaultVal) };
}

function ModelTab({ details, components, lcoc, srcDefaults, source, cf, projectState, onViewSensitivity }) {
  const d = details;
  const f = (n, dec = 2) => {
    if (n == null || isNaN(n)) return "—";
    return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const fk = (n) => "$" + f(n, 0) + "K";
  const fm = (n) => formatDollars(n * 1000);
  const ov = (val, netlKey, globalKey, fmtFn) => ovCheck(val, source, netlKey, globalKey, fmtFn || (v => String(v)));

  return (
    <div className="model-tab">
      {onViewSensitivity && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button className="sc-btn" onClick={onViewSensitivity}>View in Sensitivity Tab &rarr;</button></div>}

      <ModelStep num={1} title="Source Parameters">
        <MRow label="Source" value={srcDefaults.label} />
        <MRow label="Ref CO2" value={f(d.ref_co2, 0)} unit="t/yr" />
        <MRow label="Ref TPC" value={fk(srcDefaults.ref_tpc_k)} />
        <MRow label="Labor Type" value={srcDefaults.labor_type === "HP" ? "HP (compression-only)" : "LP (full plant)"} />
        <MRow label="RDF" value={f(d.rdf, 2)} {...ov(d.rdf, "rdf", null, v => f(v, 2))} />
        <MRow label="Owners Cost %" value={f(d.owners_pct * 100, 1) + "%"} {...ov(d.owners_pct, "owners_cost_pct", null, v => f(v * 100, 1) + "%")} />
      </ModelStep>

      <ModelStep num={2} title="Scaling Ratio">
        <MRow label="CO2 actual" value={f(d.co2_per_year, 0)} unit="t/yr" />
        <MRow label="CO2 ref" value={f(d.ref_co2, 0)} unit="t/yr" />
        <div className="m-formula">sR = {f(d.co2_per_year, 0)} / {f(d.ref_co2, 0)} = {f(d.sR, 4)}</div>
        <MRow label="Tier" value={d.tier === "A" ? "A (sR < 0.3 — floor applied)" : d.tier === "B" ? "B (0.3 ≤ sR ≤ 3.0 — standard)" : "C (sR > 3.0 — train-based)"} />
      </ModelStep>

      <ModelStep num={3} title="TPC Scaling">
        <div className="m-table-wrap">
          <table className="m-table">
            <thead>
              <tr>
                <th>Acct</th>
                <th>Name</th>
                <th className="num">Ref $K</th>
                <th className="num">Exp</th>
                <th className="num">Scaled $K</th>
              </tr>
            </thead>
            <tbody>
              {d.scaledLineItems.map((item, i) => (
                <tr key={i}>
                  <td>{item.acct}</td>
                  <td>{item.name}</td>
                  <td className="num">{f(item.tpc_k, 0)}</td>
                  <td className="num">{f(item.exp, 2)}</td>
                  <td className="num">{f(item.scaled_k, 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="m-total-row">
                <td colSpan={2}>Total Scaled TPC</td>
                <td className="num">{f(d.lineItems.reduce((s, i) => s + i.tpc_k, 0), 0)}</td>
                <td></td>
                <td className="num">{fk(d.scaled_tpc_k)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ModelStep>

      <ModelStep num={4} title="Combined Adjustment Factor">
        <MRow label="CEPCI Ratio" value={f(d.cepci_ratio, 3)} unit={`(${d.cepci_current ?? GLOBAL_DEFAULTS.cepci_current} / ${GLOBAL_DEFAULTS.cepci_ref})`} />
        <MRow label="Location Factor" value={f(d.location_ratio, 2)} />
        <MRow label="Tech Multiplier (capex)" value={f(d.tech_capex, 2)} amber={d.tech_capex !== 1.0} netl={d.tech_capex !== 1.0 ? "1.00" : undefined} />
        <MRow label="RDF" value={f(d.rdf, 2)} unit={d.rdf === 1.0 ? "(GF)" : "(RF)"} />
        <MRow label="Combined" value={f(d.combined_adj, 4)} />
        <div className="m-formula">Adj TPC = {fk(d.scaled_tpc_k)} × {f(d.combined_adj, 4)} = {fk(d.adj_tpc_k)}</div>
      </ModelStep>

      <ModelStep num={5} title="CAPEX">
        <MRow label="Adj TPC" value={fk(d.adj_tpc_k)} />
        <MRow label={`+ Owners Costs (${f(d.owners_pct * 100, 1)}%)`} value={"+" + fk(d.adj_tpc_k * d.owners_pct)} />
        <div className="m-formula">CAPEX = {fk(d.adj_tpc_k)} × (1 + {f(d.owners_pct * 100, 1)}%) = {fk(d.capex_k)} ({fm(d.capex_k)})</div>
      </ModelStep>

      <ModelStep num={6} title="Capital Cost ($/t CO2)">
        <MRow label="Debt %" value={f(d.debt_pct * 100, 1) + "%"} {...ov(d.debt_pct, "debt_pct", null, v => f(v * 100, 1) + "%")} />
        <MRow label="Cost of Debt" value={f(d.cost_of_debt * 100, 2) + "%"} {...ov(d.cost_of_debt, "cost_of_debt", null, v => f(v * 100, 2) + "%")} />
        <MRow label="Cost of Equity" value={f(d.cost_of_equity * 100, 2) + "%"} {...ov(d.cost_of_equity, "cost_of_equity", null, v => f(v * 100, 2) + "%")} />
        <MRow label="Debt component" value={`${f(d.debt_pct * 100, 1)}% × ${f(d.cost_of_debt * 100, 2)}% × (1 − ${f(d.tax_rate * 100, 1)}%) = ${f(d.debt_pct * d.cost_of_debt * (1 - d.tax_rate) * 100, 3)}%`} />
        <MRow label="Equity component" value={`${f((1 - d.debt_pct) * 100, 1)}% × ${f(d.cost_of_equity * 100, 2)}% = ${f((1 - d.debt_pct) * d.cost_of_equity * 100, 3)}%`} />
        <MRow label="WACC" value={f(d.wacc * 100, 3) + "%"} />
        <MRow label="Project Life" value={d.n + " yr"} {...ov(d.n, "project_life", "project_life", v => v + " yr")} />
        <MRow label="Annuity Factor" value={f(d.af * 100, 4) + "%"} />
        <div className="m-formula">Capital = {fm(d.capex_k)} × {f(d.af * 100, 4)}% / {f(d.co2_per_year, 0)} t = ${f(components.capital, 2)}/t</div>
      </ModelStep>

      <ModelStep num={7} title="Fixed O&M ($/t CO2)">
        <MRow label="Operators/shift" value={f(d.ops_per_shift, 1)} {...ov(d.ops_per_shift, "operators_per_shift", null, v => f(v, 1))} />
        <MRow label="Burdened rate" value={"$" + f(d.op_rate, 2) + "/hr"} />
        <div className="m-formula">Op Labor = {f(d.ops_per_shift, 1)} × 3 shifts × 365d × 8hr × ${f(d.op_rate, 2)} = {formatDollars(d.op_labor_annual)}</div>
        <MRow label={`Maint Labor (${f(GLOBAL_DEFAULTS.maint_labor_pct * 100, 2)}% TPC)`} value={formatDollars(d.maint_labor)} />
        <MRow label={`Admin (${f(GLOBAL_DEFAULTS.admin_pct * 100, 0)}% × labor)`} value={formatDollars(d.admin)} />
        <MRow label={`PT&I (${f(GLOBAL_DEFAULTS.pti_pct * 100, 1)}% TPC)`} value={formatDollars(d.pti)} />
        {d.tech_opex !== 1.0 && <MRow label="Tech O&M multiplier" value={f(d.tech_opex, 2)} amber />}
        <MRow label="Total Fixed O&M" value={formatDollars(d.fixed_om_annual) + " = $" + f(components.fixed_om, 2) + "/t"} />
      </ModelStep>

      <ModelStep num={8} title="Variable O&M ($/t CO2)">
        <MRow label="Maint Materials (0.96% TPC)" value={formatDollars(d.maint_material)} />
        <MRow label="Consumables" value={d.consumables === 0 ? "$0 (Phase 2)" : formatDollars(d.consumables)} />
        {d.tech_opex !== 1.0 && <MRow label="Tech O&M multiplier" value={f(d.tech_opex, 2)} amber />}
        <MRow label="Total Variable O&M" value={formatDollars(d.variable_om_annual) + " = $" + f(components.variable_om, 2) + "/t"} />
      </ModelStep>

      <ModelStep num={9} title="Power Cost ($/t CO2)">
        <MRow label="Ref MW" value={f(d.ref_mw, 1)} unit="MW" />
        <MRow label="Scaled MW (× sR × tech)" value={f(d.scaled_mw, 2)} unit="MW" />
        <MRow label="Annual energy" value={f(d.annual_mwh, 0)} unit="MWh" />
        <MRow label="Price" value={"$" + f(d.elec_price, 1)} unit="$/MWh" {...ov(d.elec_price, null, "elec_price", v => "$" + f(v, 1) + "/MWh")} />
        {d.tech_power !== 1.0 && <MRow label="Tech power multiplier" value={f(d.tech_power, 2)} amber netl="1.00" />}
        <div className="m-formula">Power = {f(d.scaled_mw, 2)} MW × {f(GLOBAL_DEFAULTS.hours_per_year, 0)} hr × {f(d.cf * 100, 0)}% CF × ${f(d.elec_price, 1)}/MWh / {f(d.co2_per_year, 0)} t = ${f(components.power, 2)}/t</div>
      </ModelStep>

      <ModelStep num={10} title="Fuel Cost ($/t CO2)">
        {details.fuel_applicable ? (
          <>
            <MRow label="Fuel cost" value={"$" + f(d.fuel_per_tonne, 2)} unit="/t" />
          </>
        ) : (
          <div className="m-na">N/A for this source (no reboiler / boiler)</div>
        )}
      </ModelStep>

      <ModelStep num={11} title="LCOC Summary">
        <div className="m-lcoc-breakdown">
          <MRow label="Capital" value={"$" + f(components.capital, 2)} />
          <MRow label="Fixed O&M" value={"$" + f(components.fixed_om, 2)} />
          <MRow label="Variable O&M" value={"$" + f(components.variable_om, 2)} />
          <MRow label="Power" value={"$" + f(components.power, 2)} />
          <MRow label="Fuel" value={"$" + f(components.fuel, 2)} />
        </div>
        <div className="m-formula m-total">
          ${f(components.capital, 2)} + ${f(components.fixed_om, 2)} + ${f(components.variable_om, 2)} + ${f(components.power, 2)} + ${f(components.fuel, 2)} = <strong>${f(lcoc, 2)} /t CO2</strong>
        </div>
      </ModelStep>

      {cf && cf.summary && (() => {
        const s = cf.summary;
        const yr1 = cf.years?.find(y => y.operating_year === 1);
        const taxR = combinedTaxRate(projectState ?? "IL");
        const depLabel = DEPRECIATION_SCHEDULES[GLOBAL_DEFAULTS.depreciation_method]?.label ?? "MACRS 5-Year";
        return (
          <ModelStep num={12} title="After-Tax Cash Flow">
            <MRow label="Annual OpEx" value={formatDollars(yr1?.annual_opex ?? 0)} />
            <MRow label="45Q Credit (Yr1-12)" value={formatDollars(yr1?.credit_45q ?? 0, { suffix: "/yr" })} />
            <MRow label={`Depreciation Shield (${depLabel})`} value={formatDollars(yr1?.dep_shield ?? 0) + " (Yr1)"} />
            <MRow label={`Combined Tax Rate (${projectState ?? "IL"})`} value={f(taxR * 100, 1) + "%"} />
            <MRow label="Net CF Yr1" value={formatDollars(yr1?.net_cf ?? 0)} amber={yr1?.net_cf < 0} />
            <div className="m-formula">
              NPV @ {f(d.wacc * 100, 1)}% WACC: <strong>{formatDollars(s.npv ?? 0)}</strong>
            </div>
            <MRow label="IRR" value={s.irr != null ? f(s.irr * 100, 1) + "%" : "—"} />
            <MRow label="Payback" value={s.payback != null ? f(s.payback, 1) + " yr" : "Never"} />
            <MRow label="Net LCOC (after credits)" value={"$" + f(s.net_lcoc, 2) + "/t"} amber={(s.net_lcoc ?? 0) < 0} />
          </ModelStep>
        );
      })()}

    </div>
  );
}

// ── Inputs Tab ──

function InputsTab({ scenarios, setScenarios, activeScenarioId, setActiveScenarioId, activeSource, ngccFrameOverride, setNgccFrameOverride, dacTechType, setDacTechType }) {
  const active = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  const [sectionSource, setSectionSource] = useState("ammonia");

  const createScenario = useCallback(() => {
    const id = "scenario_" + Date.now();
    const name = "Scenario " + (scenarios.length);
    setScenarios(prev => [...prev, { id, name, locked: false, overrides: {} }]);
    setActiveScenarioId(id);
  }, [scenarios.length, setScenarios, setActiveScenarioId]);

  const duplicateScenario = useCallback(() => {
    const id = "scenario_" + Date.now();
    setScenarios(prev => [...prev, {
      id, name: active.name + " (copy)", locked: false,
      overrides: JSON.parse(JSON.stringify(active.overrides))
    }]);
    setActiveScenarioId(id);
  }, [active, setScenarios, setActiveScenarioId]);

  const deleteScenario = useCallback(() => {
    if (active.locked) return;
    setScenarios(prev => prev.filter(s => s.id !== activeScenarioId));
    setActiveScenarioId("netl_default");
  }, [active, activeScenarioId, setScenarios, setActiveScenarioId]);

  const renameScenario = useCallback(() => {
    if (active.locked) return;
    const name = prompt("Rename scenario:", active.name);
    if (!name) return;
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, name } : s));
  }, [active, activeScenarioId, setScenarios]);

  const exportScenario = useCallback(() => {
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = active.name.replace(/\s+/g, "_") + ".json"; a.click();
    URL.revokeObjectURL(url);
  }, [active]);

  const importScenario = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = JSON.parse(ev.target.result);
        const id = "scenario_" + Date.now();
        setScenarios(prev => [...prev, { id, name: data.name || "Imported", locked: false, overrides: data.overrides || {} }]);
        setActiveScenarioId(id);
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setScenarios, setActiveScenarioId]);

  // Override helpers
  const setOv = (src, key, val) => {
    if (active.locked) return;
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenarioId) return s;
      const ov = { ...s.overrides }; if (!ov[src]) ov[src] = {};
      ov[src] = { ...ov[src], [key]: val };
      return { ...s, overrides: ov };
    }));
  };

  const clearOv = (src, key) => {
    if (active.locked) return;
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenarioId) return s;
      const ov = { ...s.overrides };
      if (ov[src]) { const c = { ...ov[src] }; delete c[key]; ov[src] = Object.keys(c).length ? c : undefined; if (!ov[src]) delete ov[src]; }
      return { ...s, overrides: ov };
    }));
  };

  const setGlobalOv = (key, val) => {
    if (active.locked) return;
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenarioId) return s;
      const ov = { ...s.overrides }; if (!ov._global) ov._global = {};
      ov._global = { ...ov._global, [key]: val };
      return { ...s, overrides: ov };
    }));
  };

  const clearGlobalOv = (key) => {
    if (active.locked) return;
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenarioId) return s;
      const ov = { ...s.overrides };
      if (ov._global) { const c = { ...ov._global }; delete c[key]; ov._global = Object.keys(c).length ? c : undefined; if (!ov._global) delete ov._global; }
      return { ...s, overrides: ov };
    }));
  };

  const getOv = (src, key) => active.overrides?.[src]?.[key];
  const getGlobalOv = (key) => active.overrides?._global?.[key];
  const srcKeys = Object.keys(NETL_DEFAULTS);
  const srcDef = NETL_DEFAULTS[sectionSource];

  return (
    <div className="inputs-tab">
      {/* Scenario Management */}
      <div className="scenario-panel">
        <div className="card-title">Scenarios</div>
        <div className="scenario-cards">
          {scenarios.map(s => (
            <button key={s.id} className={`scenario-card${s.id === activeScenarioId ? " active" : ""}`} onClick={() => setActiveScenarioId(s.id)}>
              {s.name}{s.locked ? " \uD83D\uDD12" : ""}
            </button>
          ))}
          <button className="scenario-card scenario-add" onClick={createScenario}>+ New</button>
        </div>
        <div className="scenario-actions">
          <span className="scenario-active-label">Active: {active.name}</span>
          <button className="sc-btn" onClick={renameScenario} disabled={active.locked}>Rename</button>
          <button className="sc-btn" onClick={duplicateScenario}>Duplicate</button>
          <button className="sc-btn sc-btn-danger" onClick={deleteScenario} disabled={active.locked}>Delete</button>
          <button className="sc-btn" onClick={exportScenario}>Export JSON</button>
          <button className="sc-btn" onClick={importScenario}>Import JSON</button>
        </div>
      </div>

      {/* Section 1: TPC Line Items */}
      <div className="inputs-section">
        <div className="card-title">1 — TPC Line Items</div>
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="field-label">Source</span>
          <select className="field-input" value={sectionSource} onChange={e => setSectionSource(e.target.value)}>
            {srcKeys.map(k => <option key={k} value={k}>{NETL_DEFAULTS[k].label}</option>)}
          </select>
        </div>
        <div className="m-table-wrap">
          <table className="m-table i-table">
            <thead><tr><th>Acct</th><th>Name</th><th className="num">Ref $K</th><th className="num">Your $K</th><th className="num">Exp</th><th>Cat</th><th></th></tr></thead>
            <tbody>
              {srcDef.tpc_line_items.map((item, i) => {
                const ovVal = getOv(sectionSource, `tpc_${i}_tpc_k`);
                return (
                  <tr key={i}>
                    <td>{item.acct}</td><td>{item.name}</td>
                    <td className="num">{fmt(item.tpc_k, 0)}</td>
                    <td className={`num${ovVal != null ? " i-amber" : ""}`}>
                      <input className="i-input" type="number" value={ovVal ?? ""} placeholder={item.tpc_k}
                        onChange={e => e.target.value ? setOv(sectionSource, `tpc_${i}_tpc_k`, parseFloat(e.target.value)) : clearOv(sectionSource, `tpc_${i}_tpc_k`)}
                        disabled={active.locked} />
                    </td>
                    <td className="num">{item.exp}</td><td>{item.category}</td>
                    <td>{ovVal != null && !active.locked && <button className="i-reset" onClick={() => clearOv(sectionSource, `tpc_${i}_tpc_k`)}>&#8634;</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Reference Plant Parameters */}
      <div className="inputs-section">
        <div className="card-title">2 — Reference Plant Parameters</div>
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="field-label">Source</span>
          <select className="field-input" value={sectionSource} onChange={e => setSectionSource(e.target.value)}>
            {srcKeys.map(k => <option key={k} value={k}>{NETL_DEFAULTS[k].label}</option>)}
          </select>
        </div>
        {[
          { key: "ref_co2_capture_tpy", label: "Ref CO2 Capture", unit: "t/yr" },
          { key: "ref_mw", label: "Ref MW (parasitic)", unit: "MW", fallback: "ref_mw_parasitic" },
          { key: "operators_per_shift", label: "Operators/shift", unit: "" },
          { key: "emission_factor", label: "Emission Factor", unit: "t CO2/unit" },
        ].map(({ key, label, unit, fallback }) => {
          const def = srcDef[key] ?? srcDef[fallback] ?? "—";
          const ovVal = getOv(sectionSource, key);
          return <InputRow key={key} label={label} unit={unit} defaultVal={def} ovVal={ovVal} locked={active.locked}
            onChange={v => v !== "" ? setOv(sectionSource, key, parseFloat(v)) : clearOv(sectionSource, key)}
            onReset={() => clearOv(sectionSource, key)} />;
        })}
        {activeSource.startsWith("ngcc") && (
          <div className="field" style={{ marginTop: 8 }}>
            <span className="field-label">NGCC Frame Override</span>
            <select className="field-input" value={ngccFrameOverride} onChange={e => setNgccFrameOverride(e.target.value)}>
              <option value="auto">Auto</option><option value="ngcc_f">Force F-frame</option><option value="ngcc_h">Force H-frame</option>
            </select>
          </div>
        )}
      </div>

      {/* Section 3: O&M Rates */}
      <div className="inputs-section">
        <div className="card-title">3 — O&M Rates</div>
        {[
          { key: "maint_labor_pct", label: "Maint Labor % TPC", def: GLOBAL_DEFAULTS.maint_labor_pct, mult: 100, unit: "%" },
          { key: "maint_material_pct", label: "Maint Material % TPC", def: GLOBAL_DEFAULTS.maint_material_pct, mult: 100, unit: "%" },
          { key: "pti_pct", label: "PT&I % TPC", def: GLOBAL_DEFAULTS.pti_pct, mult: 100, unit: "%" },
          { key: "admin_pct", label: "Admin % of Labor", def: GLOBAL_DEFAULTS.admin_pct, mult: 100, unit: "%", note: "NETL 3.1.2.3" },
          { key: "op_labor_rate_base", label: "Op Labor Rate", def: GLOBAL_DEFAULTS.op_labor_rate_base, mult: 1, unit: "$/hr" },
          { key: "op_labor_burden", label: "Labor Burden", def: GLOBAL_DEFAULTS.op_labor_burden, mult: 100, unit: "%" },
        ].map(({ key, label, def, mult, unit, note }) => {
          const ovVal = getGlobalOv(key);
          const displayDef = mult === 100 ? fmt(def * 100, 2) : fmt(def, 2);
          return <InputRow key={key} label={label} unit={unit} defaultVal={displayDef} note={note}
            ovVal={ovVal != null ? (mult === 100 ? ovVal * 100 : ovVal) : null} locked={active.locked}
            onChange={v => v !== "" ? setGlobalOv(key, mult === 100 ? parseFloat(v) / 100 : parseFloat(v)) : clearGlobalOv(key)}
            onReset={() => clearGlobalOv(key)} />;
        })}
      </div>

      {/* Section 4: Financial Assumptions */}
      <div className="inputs-section">
        <div className="card-title">4 — Financial Assumptions</div>
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="field-label">Source</span>
          <select className="field-input" value={sectionSource} onChange={e => setSectionSource(e.target.value)}>
            {srcKeys.map(k => <option key={k} value={k}>{NETL_DEFAULTS[k].label}</option>)}
          </select>
        </div>
        {[
          { key: "debt_pct", label: "Debt %", mult: 100, unit: "%" },
          { key: "cost_of_debt", label: "Cost of Debt", mult: 100, unit: "%" },
          { key: "cost_of_equity", label: "Cost of Equity", mult: 100, unit: "%" },
          { key: "project_life", label: "Project Life", mult: 1, unit: "yr" },
          { key: "owners_cost_pct", label: "Owners Cost %", mult: 100, unit: "%" },
        ].map(({ key, label, mult, unit }) => {
          const def = srcDef[key];
          const ovVal = getOv(sectionSource, key);
          const displayDef = mult === 100 ? fmt(def * 100, 2) : fmt(def, 0);
          return <InputRow key={key} label={label} unit={unit} defaultVal={displayDef}
            ovVal={ovVal != null ? (mult === 100 ? ovVal * 100 : ovVal) : null} locked={active.locked}
            onChange={v => v !== "" ? setOv(sectionSource, key, mult === 100 ? parseFloat(v) / 100 : parseFloat(v)) : clearOv(sectionSource, key)}
            onReset={() => clearOv(sectionSource, key)} />;
        })}
      </div>

      {/* Section 5: Variable O&M Consumables */}
      <div className="inputs-section">
        <div className="card-title">5 — Variable O&M Consumables</div>
        <div className="m-na">Phase 2 — per-source consumable rates will be editable here.</div>
      </div>

      {/* Section 6: Energy Prices */}
      <div className="inputs-section">
        <div className="card-title">6 — Energy Prices & Escalation</div>
        {[
          { key: "elec_price", label: "Electricity Price", def: GLOBAL_DEFAULTS.elec_price, unit: "$/MWh" },
          { key: "gas_price", label: "Natural Gas Price", def: GLOBAL_DEFAULTS.gas_price, unit: "$/MMBtu" },
        ].map(({ key, label, def, unit }) => {
          const ovVal = getGlobalOv(key);
          return <InputRow key={key} label={label} unit={unit} defaultVal={fmt(def, 2)} ovVal={ovVal} locked={active.locked}
            onChange={v => v !== "" ? setGlobalOv(key, parseFloat(v)) : clearGlobalOv(key)}
            onReset={() => clearGlobalOv(key)} />;
        })}
        <div className="m-na" style={{ marginTop: 8 }}>Escalation rates — Phase 2</div>
      </div>

      {/* Section 7: Emission Factors */}
      <div className="inputs-section">
        <div className="card-title">7 — Emission Factors</div>
        {srcKeys.map(src => {
          const ef = NETL_DEFAULTS[src].emission_factor; if (ef == null) return null;
          const ovVal = getOv(src, "emission_factor");
          return <InputRow key={src} label={NETL_DEFAULTS[src].label} unit="t CO2/unit" defaultVal={fmt(ef, 3)} ovVal={ovVal} locked={active.locked}
            onChange={v => v !== "" ? setOv(src, "emission_factor", parseFloat(v)) : clearOv(src, "emission_factor")}
            onReset={() => clearOv(src, "emission_factor")} />;
        })}
      </div>

      {/* Section 8: Technology Multipliers */}
      <div className="inputs-section">
        <div className="card-title">8 — Technology Multipliers</div>
        <div className="m-table-wrap">
          <table className="m-table">
            <thead><tr><th>Technology</th><th className="num">CAPEX</th><th className="num">OPEX</th><th className="num">Power</th></tr></thead>
            <tbody>
              {Object.entries(TECH_MULTIPLIERS).map(([k, t]) => (
                <tr key={k}><td>{t.label}</td><td className="num">{fmt(t.capex, 2)}</td><td className="num">{fmt(t.opex, 2)}</td><td className="num">{fmt(t.power, 2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="m-na" style={{ marginTop: 8 }}>Editable in Phase 2</div>
      </div>

      {/* Section 9: DAC Technology Type — only when dac_solid is active */}
      {activeSource === "dac_solid" && (
        <div className="inputs-section">
          <div className="card-title">9 — DAC Technology Type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(DAC_TECH_MULTIPLIERS).map(([k, t]) => (
              <label key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "6px 8px", borderRadius: 4, background: dacTechType === k ? "#f0f9ee" : "transparent", border: dacTechType === k ? "1px solid #58b947" : "1px solid transparent" }}>
                <input type="radio" name="dac_tech" value={k} checked={dacTechType === k} onChange={() => setDacTechType(k)} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.label}{k === "solid_sorbent" ? " (default)" : ""}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{t.note}</div>
                  {k !== "solid_sorbent" && (
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                      Multipliers — CAPEX: {t.capex.toFixed(2)}× | Power: {t.power.toFixed(2)}× | Fuel: {t.fuel.toFixed(2)}× | OPEX: {t.opex.toFixed(2)}×
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InputRow({ label, unit, defaultVal, ovVal, locked, onChange, onReset, note }) {
  const hasOv = ovVal != null;
  return (
    <div className="i-row">
      <span className="i-row-label">{label}</span>
      <span className="i-row-default">{defaultVal}</span>
      <div className={`i-row-input-wrap${hasOv ? " i-amber" : ""}`}>
        <input className="i-input" type="number" value={hasOv ? ovVal : ""} placeholder={defaultVal}
          onChange={e => onChange(e.target.value)} disabled={locked} />
        {unit && <span className="i-row-unit">{unit}</span>}
      </div>
      <div className="i-row-actions">
        {hasOv && !locked && <button className="i-reset" onClick={onReset}>&#8634;</button>}
      </div>
      {note && <span className="i-row-note">{note}</span>}
    </div>
  );
}

// ── Cash Flow Tab ──

function CashFlowTab({
  cf, projectState,
  use45q, setUse45q, use45qEscalation, setUse45qEscalation, cpiRate, setCpiRate,
  useDacRate, setUseDacRate, storageType, setStorageType,
  useCdr, setUseCdr, cdrRate, setCdrRate,
  useAvoidance, setUseAvoidance, avoidanceRate, setAvoidanceRate,
  use45v, setUse45v, use45z, setUse45z,
  useRins, setUseRins, rinType, setRinType,
  useLcfs, setUseLcfs, lcfsPrice, setLcfsPrice,
  depMethod, setDepMethod,
}) {
  const [showCredits, setShowCredits] = useState(true);

  if (!cf) return <div className="cf-tab"><div className="m-na">No cash flow data — check inputs.</div></div>;

  const s = cf.summary;
  const f = (n, d = 1) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fm = (n) => n == null ? "—" : formatDollars(n);
  const stateTax = STATE_TAX_RATES[projectState] ?? 0;
  const combinedTax = combinedTaxRate(projectState);

  // Gross/Net LCOC bar widths
  const maxLcoc = Math.max(Math.abs(s.gross_lcoc || 0), Math.abs(s.net_lcoc || 0), 1);
  const grossPct = Math.abs(s.gross_lcoc || 0) / maxLcoc * 100;
  const netPct = Math.abs(s.net_lcoc || 0) / maxLcoc * 100;

  const exportCSV = () => {
    const headers = ["Year","Phase","CapEx $","Revenue $","OpEx $","45Q Credit $","Other Credits $","Depreciation $","Tax $","Net CF $","Cumulative CF $"];
    const rows = cf.years.map(y => [
      y.year, y.phase, y.capex_spend ?? y.capex ?? 0, y.annual_revenue ?? y.lcoc_revenue ?? 0,
      y.annual_opex ?? 0, y.credit_45q ?? 0, y.other_credits ?? 0, y.depreciation ?? 0,
      y.tax ?? 0, y.net_cf ?? y.net_cash_flow ?? 0, y.cumulative_cf ?? 0,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "cash_flow.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cf-tab">

      {/* ── Metrics Row ── */}
      <div className="cf-metrics-row">
        <div className="cf-metric-card">
          <div className="metric-label">Gross LCOC</div>
          <div className="metric-value">${f(s.gross_lcoc, 2)}<span className="metric-unit">/t</span></div>
        </div>
        <div className="cf-metric-card">
          <div className="metric-label">Net LCOC</div>
          <div className={`metric-value${(s.net_lcoc ?? 0) < 0 ? " val-negative" : ""}`}>${f(s.net_lcoc, 2)}<span className="metric-unit">/t</span></div>
        </div>
        <div className="cf-metric-card">
          <div className="metric-label">NPV</div>
          <div className={`metric-value${(s.npv ?? 0) < 0 ? " val-negative" : ""}`}>{fm(s.npv)}</div>
        </div>
        <div className="cf-metric-card">
          <div className="metric-label">IRR</div>
          <div className="metric-value">{s.irr != null ? f(s.irr * 100, 1) + "%" : "—"}</div>
        </div>
        <div className="cf-metric-card">
          <div className="metric-label">Payback</div>
          <div className="metric-value">{s.payback != null ? f(s.payback, 1) + " yr" : "Never"}</div>
        </div>
      </div>

      {/* LCOC Bars */}
      <div className="cf-lcoc-bars">
        <div className="cf-bar-row">
          <span className="cf-bar-label">Gross</span>
          <div className="cf-bar-track"><div className="cf-bar-fill cf-bar-gross" style={{ width: grossPct + "%" }} /></div>
          <span className="cf-bar-val">${f(s.gross_lcoc, 2)}</span>
        </div>
        <div className="cf-bar-row">
          <span className="cf-bar-label">Net</span>
          <div className="cf-bar-track"><div className={`cf-bar-fill${(s.net_lcoc ?? 0) < 0 ? " cf-bar-negative" : " cf-bar-net"}`} style={{ width: netPct + "%" }} /></div>
          <span className={`cf-bar-val${(s.net_lcoc ?? 0) < 0 ? " val-negative" : ""}`}>${f(s.net_lcoc, 2)}</span>
        </div>
      </div>

      {/* ── Credits & Tax Panel ── */}
      <div className="inputs-section">
        <div className="card-title" style={{ cursor: "pointer" }} onClick={() => setShowCredits(!showCredits)}>
          Credits & Tax {showCredits ? "\u25B4" : "\u25BE"}
        </div>
        {showCredits && (
          <div className="cf-credits-grid">
            {/* 45Q */}
            <div className="cf-credit-row">
              <label><ToggleSwitch value={use45q} onChange={setUse45q} /> 45Q — ${use45q ? (useDacRate ? "180" : "85") : "0"}/t {storageType}</label>
              {use45q && (
                <div className="cf-credit-sub">
                  <label><ToggleSwitch value={use45qEscalation} onChange={setUse45qEscalation} /> Escalate CPI:</label>
                  <input className="i-input" type="number" value={cpiRate} onChange={e => setCpiRate(parseFloat(e.target.value) || 0)} style={{ width: 50 }} disabled={!use45qEscalation} />
                  <span className="i-row-unit">%</span>
                </div>
              )}
              {use45q && (
                <div className="cf-credit-sub">
                  <label><ToggleSwitch value={useDacRate} onChange={setUseDacRate} /> OBBBA DAC Rate ($180/t)</label>
                  {useDacRate && <div className="alert alert-warn" style={{ margin: "4px 0", padding: "4px 8px", fontSize: 11 }}>OBBBA DAC rate applies to Direct Air Capture only.</div>}
                </div>
              )}
              {use45q && (
                <div className="cf-credit-sub">
                  <span className="field-label">Storage:</span>
                  <select className="i-input" value={storageType} onChange={e => setStorageType(e.target.value)} style={{ width: 110, textAlign: "left" }}>
                    <option value="geological">Geological</option>
                    <option value="eor">EOR</option>
                  </select>
                </div>
              )}
            </div>

            {/* CDR / Avoidance */}
            <div className="cf-credit-row">
              <label><ToggleSwitch value={useCdr} onChange={setUseCdr} /> CDR Credit</label>
              {useCdr && <input className="i-input" type="number" value={cdrRate} onChange={e => setCdrRate(parseFloat(e.target.value) || 0)} style={{ width: 60 }} />}
              {useCdr && <span className="i-row-unit">$/t</span>}
            </div>
            <div className="cf-credit-row">
              <label><ToggleSwitch value={useAvoidance} onChange={setUseAvoidance} /> Avoidance Credit</label>
              {useAvoidance && <input className="i-input" type="number" value={avoidanceRate} onChange={e => setAvoidanceRate(parseFloat(e.target.value) || 0)} style={{ width: 60 }} />}
              {useAvoidance && <span className="i-row-unit">$/t</span>}
            </div>

            {/* 45V / 45Z / RINs / LCFS */}
            <div className="cf-credit-row">
              <label title="Applicable to hydrogen sources only"><ToggleSwitch value={use45v} onChange={setUse45v} /> 45V</label>
              <label title="Applicable to clean fuel sources only"><ToggleSwitch value={use45z} onChange={setUse45z} /> 45Z</label>
              <label><ToggleSwitch value={useRins} onChange={setUseRins} /> RINs</label>
              {useRins && (
                <select className="i-input" value={rinType} onChange={e => setRinType(e.target.value)} style={{ width: 60, textAlign: "left" }}>
                  <option value="d3">D3</option><option value="d5">D5</option><option value="d6">D6</option>
                </select>
              )}
              <label><ToggleSwitch value={useLcfs} onChange={setUseLcfs} /> LCFS</label>
              {useLcfs && <input className="i-input" type="number" value={lcfsPrice} onChange={e => setLcfsPrice(parseFloat(e.target.value) || 0)} style={{ width: 60 }} />}
              {useLcfs && <span className="i-row-unit">$/t</span>}
            </div>

            {/* Depreciation & Tax */}
            <div className="cf-credit-row">
              <span className="field-label">Depreciation:</span>
              <select className="i-input" value={depMethod} onChange={e => setDepMethod(e.target.value)} style={{ width: 160, textAlign: "left" }}>
                {Object.entries(DEPRECIATION_SCHEDULES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="cf-credit-row">
              <span className="field-label">State Tax ({projectState}):</span>
              <span className="field-computed">{f(stateTax * 100, 1)}%</span>
              <span className="field-label" style={{ marginLeft: 12 }}>Federal:</span>
              <span className="field-computed">21.0%</span>
              <span className="field-label" style={{ marginLeft: 12 }}>Combined:</span>
              <span className="field-computed">{f(combinedTax * 100, 1)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Annual Cash Flow Table ── */}
      <div className="inputs-section">
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Annual Cash Flow
          <button className="sc-btn" onClick={exportCSV}>Export CSV</button>
        </div>
        <div className="m-table-wrap">
          <table className="m-table cf-table">
            <thead>
              <tr>
                <th>Year</th><th>Phase</th>
                <th className="num">CapEx $M</th><th className="num">Revenue $M</th><th className="num">OpEx $M</th>
                <th className="num">45Q $M</th><th className="num">Other $M</th>
                <th className="num">Dep $M</th><th className="num">Tax $M</th>
                <th className="num">Net CF $M</th><th className="num">Cum CF $M</th>
              </tr>
            </thead>
            <tbody>
              {cf.years.map((y, i) => {
                const isCon = y.phase === "construction";
                const netCF = y.net_cf ?? y.net_cash_flow ?? 0;
                const cumCF = y.cumulative_cf ?? 0;
                const has45q = (y.credit_45q ?? 0) > 0;
                return (
                  <tr key={i} className={`${isCon ? "cf-row-con" : "cf-row-op"}${has45q ? " cf-row-45q" : ""}`}>
                    <td>{y.year}</td>
                    <td>{isCon ? "Const." : "Oper."}</td>
                    <td className="num">{isCon ? f((y.capex_spend ?? y.capex ?? 0) / 1e6, 1) : "—"}</td>
                    <td className="num">{!isCon ? f((y.annual_revenue ?? y.lcoc_revenue ?? 0) / 1e6, 1) : "—"}</td>
                    <td className="num">{!isCon ? f(-(y.annual_opex ?? Math.abs(y.opex ?? 0)) / 1e6, 1) : "—"}</td>
                    <td className="num">{!isCon && (y.credit_45q ?? 0) > 0 ? f(y.credit_45q / 1e6, 1) : "—"}</td>
                    <td className="num">{!isCon && (y.other_credits ?? 0) > 0 ? f(y.other_credits / 1e6, 1) : "—"}</td>
                    <td className="num">{!isCon ? f((y.depreciation ?? 0) / 1e6, 1) : "—"}</td>
                    <td className="num">{!isCon ? f(-(y.tax ?? 0) / 1e6, 1) : "—"}</td>
                    <td className={`num${netCF < 0 ? " val-negative-red" : " val-positive"}`}>{f(netCF / 1e6, 1)}</td>
                    <td className={`num${cumCF < 0 ? " val-negative-red" : " val-positive"}`}>{f(cumCF / 1e6, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cumulative CF sparkline */}
        <div className="cf-sparkline">
          {(() => {
            const cums = cf.years.map(y => y.cumulative_cf ?? 0);
            const maxAbs = Math.max(...cums.map(Math.abs), 1);
            return cums.map((v, i) => (
              <div key={i} className="cf-spark-bar" style={{
                height: Math.abs(v / maxAbs) * 40 + "px",
                background: v >= 0 ? "var(--teal)" : "var(--red)",
                marginTop: v >= 0 ? (40 - Math.abs(v / maxAbs) * 40) + "px" : "0",
              }} title={`Year ${cf.years[i].year}: ${formatDollars(v)}`} />
            ));
          })()}
        </div>
      </div>

    </div>
  );
}

// ── Charts Tab ──

const FIPS_TO_STATE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY"
};
const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
  CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",
  LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};
const US_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

function downloadChartPNG(chartRef, filename) {
  const svg = chartRef.current.container.querySelector('svg');
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

function stateColor(lcoc, min, max) {
  const pct = (lcoc - min) / (max - min);
  if (pct < 0.5) {
    // green → yellow
    const r = Math.round(88 + (253 - 88) * pct * 2);
    const g = Math.round(185 + (207 - 185) * pct * 2);
    const b = Math.round(71 + (12 - 71) * pct * 2);
    return `rgb(${r},${g},${b})`;
  } else {
    // yellow → red
    const p = (pct - 0.5) * 2;
    const r = Math.round(253 + (184 - 253) * p);
    const g = Math.round(207 + (58 - 207) * p);
    const b = Math.round(12 + (75 - 12) * p);
    return `rgb(${r},${g},${b})`;
  }
}

const CHART_THEME = {
  bg: "#ffffff",
  grid: "#e0e0e0",
  text: "#555555",
  tooltip: { backgroundColor: "#ffffff", border: "1px solid #e0e0e0" },
};

class ChartBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch() {}
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b83a4b", marginBottom: 4 }}>{this.props.title ?? "Chart"} — Error</div>
            <div style={{ fontSize: 11, color: "#999" }}>{this.state.error.message}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ChartCard({ title, children }) {
  return (
    <ChartBoundary title={title}>
      <div className="chart-card">
        <div className="card-title">{title}</div>
        {children}
      </div>
    </ChartBoundary>
  );
}

// ── Source Range helper (C1) ──
function calcSourceRanges(baseInputs, scenario) {
  const sources = Object.keys(NETL_DEFAULTS);
  return sources.map(source => {
    const ref_co2 = NETL_DEFAULTS[source]?.ref_co2_capture_tpy;
    if (!ref_co2) return null;
    const sRValues = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
    const lcocValues = sRValues.map(sR => {
      try {
        const r = calcLCOC({ ...baseInputs, source, co2_capture_tpy: ref_co2 * sR }, scenario);
        return r.lcoc;
      } catch { return null; }
    }).filter(Boolean);
    if (!lcocValues.length) return null;
    return {
      source,
      label: NETL_DEFAULTS[source].label,
      min: Math.min(...lcocValues),
      max: Math.max(...lcocValues),
      ref: lcocValues[4],
    };
  }).filter(Boolean).sort((a, b) => a.ref - b.ref);
}

// ── Abatement Cost Curve potential (Mt/yr) ──
const US_POTENTIAL = {
  ammonia: 9.1, eo: 2.5, ethanol: 45.0, ngp: 85.0,
  ngcc_f: 400.0, ngcc_h: 200.0, refinery_h2: 18.0,
  cement: 40.0, steel: 65.0, pulp_paper: 15.0,
  dac_solid: 500, doc_electrochemical: 500,
};

// ── Learning Curve to 2050 constants ──
const DEPLOYMENT_2050 = {
  dac_solid:           { 2025: 0.001, 2030: 0.01, 2035: 0.05, 2040: 0.2, 2045: 0.5, 2050: 1.0 },
  doc_electrochemical: { 2025: 0.0001, 2030: 0.005, 2035: 0.02, 2040: 0.1, 2045: 0.3, 2050: 0.8 },
  ngcc_f:              { 2025: 0.4, 2030: 0.5, 2035: 0.6, 2040: 0.7, 2045: 0.8, 2050: 0.9 },
  cement:              { 2025: 0.05, 2030: 0.1, 2035: 0.2, 2040: 0.3, 2045: 0.4, 2050: 0.5 },
};
const LEARNING_RATES_2050 = { dac_solid: 0.15, doc_electrochemical: 0.18, ngcc_f: 0.05, cement: 0.08 };
const PROJ_COLORS = { dac_solid: ENVERUS_COLORS.green, doc_electrochemical: ENVERUS_COLORS.teal, ngcc_f: ENVERUS_COLORS.purple, cement: ENVERUS_COLORS.orange };

function ChartsTab({ result, cashFlowResult, activeSource, activeScenario, scenarios, baseInputs, techKey, onSelectSource, onSelectState }) {
  const comp = result?.components ?? {};
  const cf = cashFlowResult;
  const f = (n, d = 1) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // 13B — Scenario comparison
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [sharedYaxis, setSharedYaxis] = useState(false);
  const [compareScenarioId, setCompareScenarioId] = useState("");
  const compareScenario = scenarios?.find(s => s.id === compareScenarioId);
  const compareAllSources = useMemo(() => {
    if (!compareEnabled || !compareScenario) return null;
    return calcAllSourcesLCOC(baseInputs, compareScenario);
  }, [compareEnabled, compareScenario, baseInputs]);

  // 13D — Chart refs for export
  const chartRefs = useRef({});

  // Chart 1: LCOC Component Breakdown (stacked bar, single source)
  const componentData = [{
    name: NETL_DEFAULTS[activeSource]?.label ?? activeSource,
    Capital: comp.capital ?? 0,
    "Fixed O&M": comp.fixed_om ?? 0,
    "Variable O&M": comp.variable_om ?? 0,
    Power: comp.power ?? 0,
    Fuel: comp.fuel ?? 0,
  }];

  // Chart 2: CAPEX Breakdown Pie — grouped by account category
  const d = result?.details ?? {};
  const capexPieData = useMemo(() => {
    const items = d.scaledLineItems ?? [];
    const adj = d.combined_adj ?? 1;
    const groupTotals = Object.entries(CAPEX_GROUPS).map(([key, g]) => ({ key, ...g, value: 0 }));
    items.forEach(item => {
      const adjK = (item.scaled_k ?? 0) * adj;
      const match = groupTotals.find(g => g.accounts.some(a => item.acct.startsWith(a) || item.acct === a));
      if (match) match.value += adjK;
      else groupTotals.find(g => g.key === 'site_improvements').value += adjK; // catch-all → Site Improvements
    });
    return groupTotals.filter(g => g.value > 0).map(g => ({ name: g.label, value: g.value, fill: g.color }));
  }, [d.scaledLineItems, d.combined_adj]);
  const totalCapexK = capexPieData.reduce((s, sl) => s + sl.value, 0);

  // Chart 3: OPEX Breakdown Pie — grouped
  const co2yr = d.co2_per_year ?? 1;
  const opexPieData = [
    { name: "Operating Labor", value: d.op_labor_annual ?? 0, fill: "#58b947" },
    { name: "Maintenance", value: (d.maint_labor ?? 0) + (d.maint_material ?? 0), fill: "#ef509a" },
    { name: "Admin & Support", value: d.admin ?? 0, fill: "#f68d2e" },
    { name: "PT&I", value: d.pti ?? 0, fill: "#93348f" },
    { name: "Power", value: d.power_annual ?? 0, fill: "#58a7af" },
    { name: "Consumables", value: d.consumables ?? 0, fill: "#b83a4b" },
  ].filter(s => s.value > 0);
  const totalOpexAnnual = opexPieData.reduce((s, sl) => s + sl.value, 0);

  // All Sources Comparison
  const allSources = useMemo(() => calcAllSourcesLCOC(baseInputs, activeScenario), [baseInputs, activeScenario]);

  // Chart 3: Capacity Sensitivity
  const sensCurve = useMemo(() => calcCapacitySensitivity(baseInputs, activeScenario), [baseInputs, activeScenario]);

  // Chart 5: State Heatmap (async to avoid blocking UI)
  const [stateData, setStateData] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [geoData, setGeoData] = useState(null);
  const [hoveredState, setHoveredState] = useState(null);
  useEffect(() => {
    fetch(US_TOPO_URL).then(r => r.json()).then(us => {
      setGeoData(feature(us, us.objects.states));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    setHeatmapLoading(true);
    setTimeout(() => {
      const hm = calcStateHeatmap(baseInputs, activeScenario);
      setStateData(hm.filter(d => d.lcoc != null).sort((a, b) => a.lcoc - b.lcoc));
      setHeatmapLoading(false);
    }, 0);
  }, [baseInputs.source, baseInputs.co2_capture_tpy, baseInputs.build_type, activeScenario]);

  // Chart 5: Cash Flow Waterfall
  const cfData = cf?.years?.map(y => ({
    year: y.year,
    "Net CF": (y.net_cf ?? y.net_cash_flow ?? 0) / 1e6,
    "Cumulative": (y.cumulative_cf ?? 0) / 1e6,
  })) ?? [];

  // Chart 6: Pie (component split)
  const pieData = Object.entries(comp).filter(([, v]) => v > 0).map(([k, v], i) => ({
    name: { capital: "Capital", fixed_om: "Fixed O&M", variable_om: "Var O&M", power: "Power", fuel: "Fuel" }[k] || k,
    value: v,
    fill: ENVERUS_PALETTE[i % ENVERUS_PALETTE.length],
  }));

  // Chart 7: Learning Curves (all technologies)
  const LC_TECHS = [
    { key: "amine_mea", label: "Amine MEA", color: ENVERUS_COLORS.green },
    { key: "advanced_amine", label: "Advanced Amine", color: ENVERUS_COLORS.pink },
    { key: "solid_sorbent", label: "Solid Sorbent", color: ENVERUS_COLORS.orange },
    { key: "membrane", label: "Membrane", color: ENVERUS_COLORS.purple },
    { key: "mof", label: "MOF", color: ENVERUS_COLORS.teal },
  ];
  const [lcVisible, setLcVisible] = useState(() => Object.fromEntries(LC_TECHS.map(t => [t.key, true])));
  const allLcData = useMemo(() => {
    const curves = {};
    LC_TECHS.forEach(t => {
      curves[t.key] = calcLearningCurve(baseInputs, activeScenario, t.key);
    });
    // Merge into single array keyed by deployment index
    const steps = curves.amine_mea?.length ?? 20;
    return Array.from({ length: steps }, (_, i) => {
      const row = { deployment: curves.amine_mea[i]?.deployment_gtco2 ?? 0 };
      LC_TECHS.forEach(t => { row[t.key] = curves[t.key]?.[i]?.lcoc ?? null; });
      return row;
    });
  }, [baseInputs, activeScenario]);

  const COMP_KEYS = [
    { key: "capital", label: "Capital", color: ENVERUS_COLORS.green },
    { key: "fixed_om", label: "Fixed O&M", color: ENVERUS_COLORS.pink },
    { key: "variable_om", label: "Variable O&M", color: ENVERUS_COLORS.orange },
    { key: "power", label: "Power", color: ENVERUS_COLORS.purple },
    { key: "fuel", label: "Fuel", color: ENVERUS_COLORS.teal },
  ];
  const totalLcoc = result?.lcoc ?? 0;

  // C1 — Source Range data
  const sourceRangeData = useMemo(() => { try { return calcSourceRanges(baseInputs, activeScenario); } catch { return []; } }, [baseInputs, activeScenario]);

  // C7 — Technology Comparison data
  const techCompData = useMemo(() => {
    return Object.entries(TECH_MULTIPLIERS).map(([techKey2, tech]) => {
      try {
        const r = calcLCOC({ ...baseInputs, tech_multiplier: tech }, activeScenario);
        return {
          tech: tech.label, techKey: techKey2,
          Capital: r.components.capital, "Fixed O&M": r.components.fixed_om,
          "Variable O&M": r.components.variable_om, Power: r.components.power,
          Fuel: r.components.fuel, lcoc: r.lcoc,
        };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => a.lcoc - b.lcoc);
  }, [baseInputs, activeScenario]);

  // C2 — NPV Waterfall data
  const npvWaterfallData = useMemo(() => {
    try {
      if (!cashFlowResult?.summary || !result?.details) return [];
      const lcoc = result;
      const wacc = lcoc.details.wacc;
      const co2 = baseInputs.co2_capture_tpy;
      const life = baseInputs.project_life ?? getParam(baseInputs.source, "project_life", activeScenario) ?? 30;
      const pvFactor = wacc > 0 ? (1 - Math.pow(1 + wacc, -life)) / wacc : life;
      const items = [
        { label: "Capital", value: -(lcoc.components.capital * co2 * pvFactor / 1e6) },
        { label: "Fixed O&M", value: -(lcoc.components.fixed_om * co2 * pvFactor / 1e6) },
        { label: "Var O&M", value: -(lcoc.components.variable_om * co2 * pvFactor / 1e6) },
        { label: "Power", value: -(lcoc.components.power * co2 * pvFactor / 1e6) },
        { label: "Fuel", value: -(lcoc.components.fuel * co2 * pvFactor / 1e6) },
      ];
      const s = cashFlowResult.summary;
      if (s.total_45q_credits) items.push({ label: "45Q Credits", value: (s.total_45q_credits ?? 0) / 1e6 });
      let running = 0;
      return items.map(item => {
        const start = running;
        running += item.value;
        return { ...item, start, end: running, isTotal: false };
      }).concat([{ label: "Net", value: running, start: 0, end: running, isTotal: true }]);
    } catch { return []; }
  }, [result, cashFlowResult, baseInputs, activeScenario]);

  // C3 — Cash Flow S-Curve data
  const sCurveData = useMemo(() => {
    if (!cashFlowResult?.years) return [];
    let cumulative = 0;
    return cashFlowResult.years.map(yr => {
      cumulative += (yr.net_cf ?? yr.net_cash_flow ?? 0) / 1e6;
      return {
        year: yr.year,
        annual: (yr.net_cf ?? yr.net_cash_flow ?? 0) / 1e6,
        cumulative,
        phase: yr.phase,
      };
    });
  }, [cashFlowResult]);

  // C6 — LCOC vs 45Q Breakeven data
  const breakevenData = useMemo(() => {
    const baseLCOC = result?.lcoc ?? 0;
    const projectLife = baseInputs.project_life ?? getParam(baseInputs.source, "project_life", activeScenario) ?? 30;
    const creditPeriod = 12;
    const avgFactor = creditPeriod / projectLife;
    return Array.from({ length: 30 }, (_, i) => {
      const rate = i * 10;
      return { rate, gross: baseLCOC, net: baseLCOC - (rate * avgFactor) };
    });
  }, [result, baseInputs, activeScenario]);

  // C4 — Abatement Cost Curve data
  const abatementData = useMemo(() => {
    let cumulative = 0;
    return Object.keys(NETL_DEFAULTS).map(source => {
      const potential = US_POTENTIAL[source] ?? 0;
      if (!potential) return null;
      try {
        const r = calcLCOC({ ...baseInputs, source, co2_capture_tpy: NETL_DEFAULTS[source].ref_co2_capture_tpy }, activeScenario);
        return { source, label: NETL_DEFAULTS[source].label, lcoc: r.lcoc, potential };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => a.lcoc - b.lcoc).map(d => {
      const start = cumulative;
      cumulative += d.potential;
      return { ...d, cumStart: start, cumEnd: cumulative, midX: start + d.potential / 2 };
    });
  }, [baseInputs, activeScenario]);

  // C5 — Learning Curve to 2050 projection data
  const projectionData = useMemo(() => {
    try {
      const years = [2025, 2027, 2030, 2033, 2035, 2037, 2040, 2043, 2045, 2047, 2050];
      const interpolate = (traj, year) => {
        const keys = Object.keys(traj).map(Number).sort((a, b) => a - b);
        if (year <= keys[0]) return traj[keys[0]];
        if (year >= keys[keys.length - 1]) return traj[keys[keys.length - 1]];
        for (let i = 0; i < keys.length - 1; i++) {
          if (year >= keys[i] && year <= keys[i + 1]) {
            const frac = (year - keys[i]) / (keys[i + 1] - keys[i]);
            return traj[keys[i]] + frac * (traj[keys[i + 1]] - traj[keys[i]]);
          }
        }
        return traj[keys[0]];
      };
      const baseLCOCs = {};
      Object.keys(DEPLOYMENT_2050).forEach(src => {
        try {
          baseLCOCs[src] = calcLCOC({ ...baseInputs, source: src, co2_capture_tpy: NETL_DEFAULTS[src]?.ref_co2_capture_tpy ?? 100000 }, activeScenario).lcoc;
        } catch { baseLCOCs[src] = null; }
      });
      return years.map(year => {
        const row = { year };
        Object.keys(DEPLOYMENT_2050).forEach(src => {
          if (!baseLCOCs[src]) { row[src] = null; return; }
          const lr = LEARNING_RATES_2050[src] ?? 0.05;
          const baseD = DEPLOYMENT_2050[src][2025];
          const currD = interpolate(DEPLOYMENT_2050[src], year);
          const doublings = Math.log2(currD / baseD);
          row[src] = baseLCOCs[src] * Math.max(Math.pow(1 - lr, doublings), 0.15);
        });
        return row;
      });
    } catch { return []; }
  }, [baseInputs, activeScenario]);

  // 13D — Export all charts as SVGs in a ZIP
  const exportAllCharts = useCallback(async () => {
    const zip = new JSZip();
    const src = activeSource;
    const scn = activeScenario?.name?.replace(/\s+/g, "_") ?? "default";
    Object.entries(chartRefs.current).forEach(([name, ref]) => {
      if (!ref) return;
      const svg = ref.container?.querySelector("svg");
      if (!svg) return;
      const data = new XMLSerializer().serializeToString(svg);
      zip.file(`ccus-${name}-${src}-${scn}.svg`, data);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ccus-charts-${src}-${scn}.zip`; a.click();
    URL.revokeObjectURL(url);
  }, [activeSource, activeScenario]);

  return (
    <div style={{ width: "95%", margin: "0 auto", padding: "24px 0", overflow: "auto", flex: 1 }}>

      {/* Toolbar */}
      <div className="charts-toolbar" style={{ marginBottom: 16 }}>
        <div className="charts-toolbar-left">
          <label className="charts-compare-toggle">
            <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)} />
            Compare scenarios
          </label>
          {compareEnabled && (
            <select className="field-input" style={{ width: 180, textAlign: "left" }} value={compareScenarioId} onChange={e => setCompareScenarioId(e.target.value)}>
              <option value="">Select scenario...</option>
              {scenarios?.filter(s => s.id !== activeScenario?.id).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <button className="sc-btn" onClick={exportAllCharts}>Export All Charts (ZIP)</button>
      </div>

      {/* Section: LCOC Breakdown */}
      <div className="charts-section-title">Cost Breakdown</div>
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="LCOC Breakdown">
        <div className="chart1-layout">
          <div className="chart1-bar-side">
            {(() => {
              const interval = totalLcoc <= 10 ? 1 : totalLcoc <= 25 ? 2 : totalLcoc <= 50 ? 5 : totalLcoc <= 100 ? 10 : totalLcoc <= 200 ? 20 : 25;
              const domainMax = Math.ceil(totalLcoc / interval) * interval;
              const axisTicks = [];
              for (let t = 0; t <= domainMax; t += interval) axisTicks.push(t);
              return (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[{ name: "LCOC", Capital: comp.capital ?? 0, "Fixed O&M": comp.fixed_om ?? 0, "Variable O&M": comp.variable_om ?? 0, Power: comp.power ?? 0, Fuel: comp.fuel ?? 0 }]}
                layout="vertical" margin={{ left: 0, right: 10, top: 10, bottom: 20 }} barSize={140}>
                <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 11 }} domain={[0, domainMax]} ticks={axisTicks} tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => { const pct = totalLcoc > 0 ? (v / totalLcoc * 100).toFixed(1) : 0; return ["$" + f(v, 2) + "/t (" + pct + "%)", name]; }} />
                <Bar dataKey="Capital" stackId="a" fill={ENVERUS_COLORS.green} />
                <Bar dataKey="Fixed O&M" stackId="a" fill={ENVERUS_COLORS.pink} />
                <Bar dataKey="Variable O&M" stackId="a" fill={ENVERUS_COLORS.orange} />
                <Bar dataKey="Power" stackId="a" fill={ENVERUS_COLORS.purple} />
                <Bar dataKey="Fuel" stackId="a" fill={ENVERUS_COLORS.teal} />
              </BarChart>
            </ResponsiveContainer>
              ); })()}
          </div>
          <div className="chart1-breakdown-side">
            <div className="chart1-breakdown-title">Cost Breakdown</div>
            {COMP_KEYS.map(c => { const v = comp[c.key] ?? 0; if (v <= 0) return null; const pct = totalLcoc > 0 ? (v / totalLcoc * 100) : 0; return (
              <div key={c.key} className="chart1-bd-row"><span className="chart1-bd-dot" style={{ background: c.color }} /><span className="chart1-bd-name">{c.label}</span><span className="chart1-bd-val">${f(v, 2)}</span><span className="chart1-bd-pct">{f(pct, 1)}%</span></div>
            ); })}
            <div className="chart1-bd-divider" />
            <div className="chart1-bd-row chart1-bd-total"><span className="chart1-bd-dot" style={{ background: "transparent" }} /><span className="chart1-bd-name">Total LCOC</span><span className="chart1-bd-val">${f(totalLcoc, 2)}</span><span className="chart1-bd-pct">/t CO2</span></div>
          </div>
        </div>
      </ChartCard>
      </div>

      {/* Charts 2 and 3 — side by side, identical card styling */}
      <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
      <div style={{ flex: 1, minWidth: 0, background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="card-title" style={{ width: "100%", textAlign: "left" }}>CAPEX Breakdown</div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={capexPieData} cx="50%" cy="50%" innerRadius={65} outerRadius={130} dataKey="value" paddingAngle={1}>
                {capexPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => {
                const pct = totalCapexK > 0 ? (v / totalCapexK * 100).toFixed(1) : 0;
                return [formatDollars(v * 1000) + " (" + pct + "%)", name];
              }} />
              <text x="50%" y="47%" textAnchor="middle" fill={CHART_THEME.text} fontSize={12}>CAPEX</text>
              <text x="50%" y="55%" textAnchor="middle" fill="#1a1a1a" fontSize={18} fontWeight="600">{formatDollars(totalCapexK * 1000)}</text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: "100%", marginTop: 16 }}>
          {capexPieData.map((d, i) => {
            const pct = totalCapexK > 0 ? (d.value / totalCapexK * 100) : 0;
            return (
              <div key={i} className="chart1-bd-row">
                <span className="chart1-bd-dot" style={{ background: d.fill }} />
                <span className="chart1-bd-name">{d.name}</span>
                <span className="chart1-bd-val">{formatDollars(d.value * 1000)}</span>
                <span className="chart1-bd-pct">{f(pct, 1)}%</span>
              </div>
            );
          })}
          <div className="chart1-bd-divider" />
          <div className="chart1-bd-row chart1-bd-total">
            <span className="chart1-bd-dot" style={{ background: "transparent" }} />
            <span className="chart1-bd-name">Total CAPEX</span>
            <span className="chart1-bd-val">{formatDollars(totalCapexK * 1000)}</span>
            <span className="chart1-bd-pct">100%</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div className="card-title" style={{ width: "100%", textAlign: "left" }}>OPEX Breakdown</div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={opexPieData} cx="50%" cy="50%" innerRadius={65} outerRadius={130} dataKey="value" paddingAngle={1}>
                {opexPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => {
                const perT = co2yr > 0 ? "$" + f(v / co2yr, 2) + "/t" : "";
                return [formatDollars(v, { suffix: "/yr" }) + " (" + perT + ")", name];
              }} />
              <text x="50%" y="47%" textAnchor="middle" fill={CHART_THEME.text} fontSize={12}>OpEx</text>
              <text x="50%" y="55%" textAnchor="middle" fill="#1a1a1a" fontSize={18} fontWeight="600">{formatDollars(totalOpexAnnual, { suffix: "/yr" })}</text>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: "100%", marginTop: 16 }}>
          {opexPieData.map((d, i) => {
            const pct = totalOpexAnnual > 0 ? (d.value / totalOpexAnnual * 100) : 0;
            const perT = co2yr > 0 ? "$" + f(d.value / co2yr, 2) + "/t" : "";
            return (
              <div key={i} className="chart1-bd-row">
                <span className="chart1-bd-dot" style={{ background: d.fill }} />
                <span className="chart1-bd-name">{d.name}</span>
                <span className="chart1-bd-val">{formatDollars(d.value, { suffix: "/yr" })}</span>
                <span className="chart1-bd-val" style={{ minWidth: 55 }}>{perT}</span>
                <span className="chart1-bd-pct">{f(pct, 1)}%</span>
              </div>
            );
          })}
          <div className="chart1-bd-divider" />
          <div className="chart1-bd-row chart1-bd-total">
            <span className="chart1-bd-dot" style={{ background: "transparent" }} />
            <span className="chart1-bd-name">Total OpEx /yr</span>
            <span className="chart1-bd-val">{formatDollars(totalOpexAnnual, { suffix: "/yr" })}</span>
            <span className="chart1-bd-val" style={{ minWidth: 55 }}>${f(totalOpexAnnual / co2yr, 2)}/t</span>
            <span className="chart1-bd-pct">100%</span>
          </div>
        </div>
      </div>
      </div>{/* end Charts 2+3 flex row */}

      {/* Section: Sensitivity Analysis — 6 explore charts */}
      <div className="charts-section-title" style={{ marginTop: 32 }}>Sensitivity Analysis</div>

      {(() => {
        // Shared Y-axis state is managed at top of ChartsTab
        const refCo2 = NETL_DEFAULTS[activeSource]?.ref_co2_capture_tpy ?? 1;
        const baseCF = baseInputs.capacity_factor ?? 0.85;
        const baseCaptureRate = 0.90;
        const co2Produced = baseInputs.co2_capture_tpy / baseCaptureRate;

        // Chart data generators
        const captureRateData = useMemo(() => {
          const steps = [];
          for (let cr = 50; cr <= 99; cr += 2) {
            const co2 = co2Produced * (cr / 100);
            try { const r = calcLCOC({ ...baseInputs, co2_capture_tpy: co2 }, activeScenario);
              steps.push({ x: cr, lcoc: r.lcoc, capital: r.components.capital, fixed_om: r.components.fixed_om });
            } catch {}
          }
          return steps;
        }, [baseInputs, activeScenario]);

        const plantSizeData = useMemo(() => {
          const steps = [];
          for (let i = 0; i < 30; i++) {
            const sR = 0.1 + (i / 29) * 2.9;
            const co2 = refCo2 * sR;
            try { const r = calcLCOC({ ...baseInputs, co2_capture_tpy: co2 }, activeScenario);
              steps.push({ x: co2, xLabel: co2 >= 1e6 ? (co2/1e6).toFixed(1)+"M" : Math.round(co2/1e3)+"K", lcoc: r.lcoc, capital: r.components.capital, fixed_om: r.components.fixed_om, power: r.components.power });
            } catch {}
          }
          return steps;
        }, [baseInputs, activeScenario]);

        const capexMultData = useMemo(() => {
          const steps = [];
          for (let m = 0.5; m <= 2.0; m += 0.075) {
            try { const r = calcLCOC({ ...baseInputs, tech_multiplier: { capex: m, opex: 1, power: 1 } }, activeScenario);
              steps.push({ x: parseFloat(m.toFixed(2)), lcoc: r.lcoc, capital: r.components.capital });
            } catch {}
          }
          return steps;
        }, [baseInputs, activeScenario]);

        const waccData = useMemo(() => {
          const steps = [];
          const dp = baseInputs.debt_pct ?? 0.54;
          const cd = baseInputs.cost_of_debt ?? 0.0515;
          const tr = baseInputs.tax_rate ?? 0.21;
          for (let w = 3; w <= 15; w += 0.5) {
            const targetW = w / 100;
            const impliedCoE = dp < 1 ? (targetW - dp * cd * (1 - tr)) / (1 - dp) : targetW;
            if (impliedCoE < 0 || impliedCoE > 0.5) continue;
            try { const r = calcLCOC({ ...baseInputs, cost_of_equity: impliedCoE }, activeScenario);
              steps.push({ x: w, lcoc: r.lcoc, capital: r.components.capital, impliedCoE: (impliedCoE * 100).toFixed(1) });
            } catch {}
          }
          return steps;
        }, [baseInputs, activeScenario]);

        const cfData = useMemo(() => {
          const steps = [];
          for (let cf = 50; cf <= 95; cf += 2) {
            const newCo2 = baseInputs.co2_capture_tpy * ((cf / 100) / baseCF);
            try { const r = calcLCOC({ ...baseInputs, capacity_factor: cf / 100, co2_capture_tpy: newCo2 }, activeScenario);
              steps.push({ x: cf, lcoc: r.lcoc, capital: r.components.capital, fixed_om: r.components.fixed_om });
            } catch {}
          }
          return steps;
        }, [baseInputs, activeScenario]);

        const opexMultData = useMemo(() => {
          const steps = [];
          for (let m = 0.5; m <= 2.0; m += 0.075) {
            try { const r = calcLCOC({ ...baseInputs, tech_multiplier: { capex: 1, opex: m, power: m } }, activeScenario);
              steps.push({ x: parseFloat(m.toFixed(2)), lcoc: r.lcoc, fixed_om: r.components.fixed_om, variable_om: r.components.variable_om, power: r.components.power });
            } catch {}
          }
          return steps;
        }, [baseInputs, activeScenario]);

        // Shared Y range
        const allLcocs = [...captureRateData, ...plantSizeData, ...capexMultData, ...waccData, ...cfData, ...opexMultData].map(d => d.lcoc).filter(Boolean);
        const sharedYMin = Math.floor(Math.min(...allLcocs) - 1);
        const sharedYMax = Math.ceil(Math.max(...allLcocs) + 1);

        const yDomain = sharedYaxis ? [sharedYMin, sharedYMax] : undefined;

        const mkChart = (data, xKey, xFmt, xTicks, lines, refVal, xDomain, title, subtitle) => {
          const lcocVals = data.map(d => d.lcoc).filter(Boolean);
          const maxL = Math.max(...lcocVals, 1);
          const yInterval = maxL <= 10 ? 2 : maxL <= 25 ? 5 : maxL <= 50 ? 10 : maxL <= 100 ? 20 : 25;
          const yMax = Math.ceil(maxL / yInterval) * yInterval;
          const yTicks = []; for (let t = 0; t <= yMax; t += yInterval) yTicks.push(t);
          const finalYDomain = yDomain || [0, yMax];
          return (
          <div style={{ position: "relative" }}>
            {title && <div style={{ position: "absolute", top: 4, right: 12, textAlign: "right", zIndex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{title}</div>
              {subtitle && <div style={{ fontSize: 11, color: "#999999" }}>({subtitle})</div>}
            </div>}
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data} margin={{ left: 20, right: 10, bottom: 36 }}>
                <CartesianGrid horizontal={true} vertical={false} stroke="#e0e0e0" strokeDasharray="none" />
                <XAxis dataKey={xKey} tick={{ fill: "#999999", fontSize: 12, fontWeight: 400 }} tickFormatter={xFmt} ticks={xTicks} domain={xDomain} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#999999", fontSize: 12, fontWeight: 400 }} domain={finalYDomain} ticks={sharedYaxis ? undefined : yTicks} tickFormatter={v => v < 0 ? `($${Math.abs(Math.round(v))})` : `$${Math.round(v)}`} axisLine={false} tickLine={false}
                  label={{ value: "$/t CO\u2082", angle: -90, position: "insideLeft", fill: "#999999", fontSize: 11, dx: -5 }} />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 4, fontSize: 12, color: "#1a1a1a", boxShadow: "none" }}
                  formatter={(v, name) => ["$" + f(v, 2) + "/t", name]}
                  labelFormatter={(l) => { const s = xFmt ? xFmt(l) : l; return s; }}
                  labelStyle={{ fontWeight: 700, marginBottom: 4 }} />
                <Legend verticalAlign="bottom" height={36} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#555555" }} />
                {refVal != null && <ReferenceLine x={refVal} stroke="#1a1a1a" strokeWidth={1.5} strokeDasharray="4 4"><Label value="Current" position="top" fontSize={10} fill="#1a1a1a" /></ReferenceLine>}
                {lines.map(l => <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={l.dash ? 1.5 : 2} strokeDasharray={l.dash ? "6 3" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} name={l.name} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          );
        };

        return (<>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#555" }}>
              <input type="checkbox" checked={sharedYaxis} onChange={e => setSharedYaxis(e.target.checked)} /> Shared Y-axis scale
            </label>
          </div>

          {/* Row 1: Capture Rate + Plant Size */}
          <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
          <ChartCard title="LCOC vs Capture Rate">
            {mkChart(captureRateData, "x", v => v+"%", [50,55,60,65,70,75,80,85,90,95,99],
              [{ key: "lcoc", color: ENVERUS_COLORS.green, name: "Total LCOC" },
               { key: "capital", color: ENVERUS_COLORS.pink, name: "Capital", dash: true },
               { key: "fixed_om", color: ENVERUS_COLORS.orange, name: "Fixed O&M", dash: true }],
              90, [50, 99], "LCOC vs Capture Rate", "Baseline = 90%")}
          </ChartCard>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
          <ChartCard title="LCOC vs Plant Size">
            {mkChart(plantSizeData, "xLabel", v => v, null,
              [{ key: "lcoc", color: ENVERUS_COLORS.green, name: "Total LCOC" },
               { key: "capital", color: ENVERUS_COLORS.pink, name: "Capital", dash: true },
               { key: "fixed_om", color: ENVERUS_COLORS.orange, name: "Fixed O&M", dash: true },
               { key: "power", color: ENVERUS_COLORS.purple, name: "Power", dash: true }],
              null, undefined, "LCOC vs Plant Size", "Economies of scale")}
          </ChartCard>
          </div>
          </div>

          {/* Row 2: CAPEX mult + WACC */}
          <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
          <ChartCard title="LCOC vs CAPEX">
            {mkChart(capexMultData, "x", v => v+"\u00d7", [0.5,0.75,1.0,1.25,1.5,1.75,2.0],
              [{ key: "lcoc", color: ENVERUS_COLORS.green, name: "Total LCOC" },
               { key: "capital", color: ENVERUS_COLORS.pink, name: "Capital", dash: true }],
              1.0, [0.5, 2.0], "LCOC vs CAPEX", "Baseline = 1.0\u00d7")}
          </ChartCard>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
          <ChartCard title="LCOC vs WACC">
            {(() => { const curW = parseFloat((((baseInputs.debt_pct??0.54)*(baseInputs.cost_of_debt??0.0515)*(1-(baseInputs.tax_rate??0.21))+(1-(baseInputs.debt_pct??0.54))*(baseInputs.cost_of_equity??0.12))*100).toFixed(1)); return mkChart(waccData, "x", v => v+"%", [3,5,7,9,11,13,15],
              [{ key: "lcoc", color: ENVERUS_COLORS.green, name: "Total LCOC" },
               { key: "capital", color: ENVERUS_COLORS.pink, name: "Capital", dash: true }],
              curW, [3, 15], "LCOC vs WACC", "Baseline = "+curW+"%"); })()}
          </ChartCard>
          </div>
          </div>

          {/* Row 3: CF + OpEx mult */}
          <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
          <ChartCard title="LCOC vs Capacity Factor">
            {mkChart(cfData, "x", v => v+"%", [50,55,60,65,70,75,80,85,90,95],
              [{ key: "lcoc", color: ENVERUS_COLORS.green, name: "Total LCOC" },
               { key: "capital", color: ENVERUS_COLORS.pink, name: "Capital", dash: true },
               { key: "fixed_om", color: ENVERUS_COLORS.orange, name: "Fixed O&M", dash: true }],
              Math.round(baseCF*100), [50, 95], "LCOC vs Capacity Factor", "Baseline = "+Math.round(baseCF*100)+"% CF")}
          </ChartCard>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
          <ChartCard title="LCOC vs OpEx">
            {mkChart(opexMultData, "x", v => v+"\u00d7", [0.5,0.75,1.0,1.25,1.5,1.75,2.0],
              [{ key: "lcoc", color: ENVERUS_COLORS.green, name: "Total LCOC" },
               { key: "fixed_om", color: ENVERUS_COLORS.pink, name: "Fixed O&M", dash: true },
               { key: "variable_om", color: ENVERUS_COLORS.orange, name: "Variable O&M", dash: true },
               { key: "power", color: ENVERUS_COLORS.purple, name: "Power", dash: true }],
              1.0, [0.5, 2.0], "LCOC vs OpEx", "Baseline = 1.0\u00d7")}
          </ChartCard>
          </div>
          </div>
        </>);
      })()}

      {/* C1 — Source Range Chart */}
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="LCOC Source Range (Plant Size 0.1x–3.0x)">
        <ResponsiveContainer width="100%" height={Math.max(280, sourceRangeData.length * 36 + 60)}>
          <BarChart data={sourceRangeData} layout="vertical" margin={{ left: 100, right: 30, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}`} label={{ value: "$/t CO\u2082", position: "bottom", fill: CHART_THEME.text, fontSize: 11, offset: -5 }} />
            <YAxis type="category" dataKey="label" tick={{ fill: CHART_THEME.text, fontSize: 11 }} width={95} />
            <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => ["$" + f(v, 2) + "/t", name]} />
            {totalLcoc > 0 && <ReferenceLine x={totalLcoc} stroke={ENVERUS_COLORS.yellow} strokeDasharray="5 5" strokeWidth={1.5}><Label value={"Current $" + f(totalLcoc, 1)} fill={ENVERUS_COLORS.yellow} fontSize={10} position="top" /></ReferenceLine>}
            <Bar dataKey="min" stackId="range" fill="transparent" />
            <Bar dataKey="max" stackId="range" fill={ENVERUS_COLORS.teal} fillOpacity={0.6} radius={[0, 4, 4, 0]}>
              {sourceRangeData.map((d, i) => <Cell key={i} fill={ENVERUS_COLORS.teal} fillOpacity={0.5} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-note">Range shows LCOC variation as plant size scales from 0.1x to 3.0x reference capacity.</div>
      </ChartCard>
      </div>

      {/* C7 — Technology Comparison Chart */}
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="Technology Comparison — LCOC Components">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={techCompData} margin={{ left: 20, right: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis dataKey="tech" tick={{ fill: CHART_THEME.text, fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}`} label={{ value: "$/t CO\u2082", angle: -90, position: "insideLeft", fill: CHART_THEME.text, fontSize: 11, dx: -5 }} />
            <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => ["$" + f(v, 2) + "/t", name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {(() => { const meaEntry = techCompData.find(d => d.techKey === "amine_mea"); return meaEntry ? <ReferenceLine y={meaEntry.lcoc} stroke={ENVERUS_COLORS.yellow} strokeDasharray="5 5"><Label value={"MEA $" + f(meaEntry.lcoc, 1)} fill={ENVERUS_COLORS.yellow} fontSize={10} position="right" /></ReferenceLine> : null; })()}
            <Bar dataKey="Capital" stackId="a" fill={ENVERUS_COLORS.green} />
            <Bar dataKey="Fixed O&M" stackId="a" fill={ENVERUS_COLORS.pink} />
            <Bar dataKey="Variable O&M" stackId="a" fill={ENVERUS_COLORS.orange} />
            <Bar dataKey="Power" stackId="a" fill={ENVERUS_COLORS.purple} />
            <Bar dataKey="Fuel" stackId="a" fill={ENVERUS_COLORS.teal} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>

      {/* Standalone charts — Gross vs Net + Capacity Sensitivity */}
      <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <ChartCard title="Gross vs Net LCOC Comparison">
        <ResponsiveContainer width="100%" height={380} ref={r => chartRefs.current["gross-net"] = r}>
          <BarChart data={allSources.map(s => {
            const cmp = compareAllSources?.find(c => c.source === s.source);
            return { name: s.label, source: s.source, Gross: s.lcoc, Net: s.net_lcoc, ...(cmp ? { "Gross (cmp)": cmp.lcoc, "Net (cmp)": cmp.net_lcoc } : {}) };
          })} margin={{ left: 20, right: 20, bottom: 50 }}
            onClick={(e) => { if (e?.activePayload?.[0]?.payload?.source && onSelectSource) { const src = e.activePayload[0].payload.source; if (src.startsWith("ngcc")) onSelectSource("ngcc"); else onSelectSource(src); } }}
            style={{ cursor: "pointer" }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis dataKey="name" tick={{ fill: CHART_THEME.text, fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} unit=" $/t" />
            <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name, props) => { const row = props.payload; if (name.includes("Gross")) return ["$" + f(v, 2) + "/t", name]; return ["$" + f(v, 2) + "/t (credit: $" + f((row.Gross ?? 0) - v, 2) + "/t)", name]; }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke={ENVERUS_COLORS.yellow} strokeDasharray="5 5" />
            <Bar dataKey="Gross" fill={ENVERUS_COLORS.teal} name={"Gross" + (compareEnabled ? " (" + (activeScenario?.name ?? "") + ")" : "")} />
            <Bar dataKey="Net" name={"Net" + (compareEnabled ? " (" + (activeScenario?.name ?? "") + ")" : "")}>{allSources.map((s, i) => <Cell key={i} fill={(s.net_lcoc ?? 0) >= 0 ? ENVERUS_COLORS.green : ENVERUS_COLORS.red} />)}</Bar>
            {compareAllSources && <><Bar dataKey="Gross (cmp)" fill={ENVERUS_COLORS.teal} fillOpacity={0.4} name={"Gross (" + (compareScenario?.name ?? "") + ")"} /><Bar dataKey="Net (cmp)" fill={ENVERUS_COLORS.green} fillOpacity={0.4} name={"Net (" + (compareScenario?.name ?? "") + ")"} /></>}
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-note">Net LCOC assumes 45Q $85/t for 12yr credit period averaged over project life. Click a bar to select source.</div>
      </ChartCard>
      </div>{/* end Chart 4 flex child */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <ChartCard title="Capacity Sensitivity">
        {(() => {
          const refCo2 = NETL_DEFAULTS[activeSource]?.ref_co2_capture_tpy ?? 0;
          const currentSR = refCo2 > 0 ? (baseInputs.co2_capture_tpy / refCo2) : 1;
          // Tier boundaries in CO2 t/yr
          const tierA_max = refCo2 * 0.3;
          const tierB_max = refCo2 * 3.0;
          return (
            <ResponsiveContainer width="100%" height={380}>
              <AreaChart data={sensCurve.map(d => ({ ...d, co2k: (d.co2_tpy / 1000).toFixed(0) }))} margin={{ left: 20, right: 20, bottom: 30 }}>
                <defs>
                  <linearGradient id="lcocFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ENVERUS_COLORS.green} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={ENVERUS_COLORS.green} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                {/* Tier background bands */}
                <ReferenceArea x1={sensCurve[0]?.co2_tpy ? (sensCurve[0].co2_tpy / 1000).toFixed(0) : 0} x2={(tierA_max / 1000).toFixed(0)} fill={ENVERUS_COLORS.teal} fillOpacity={0.06} />
                <ReferenceArea x1={(tierA_max / 1000).toFixed(0)} x2={(tierB_max / 1000).toFixed(0)} fill={ENVERUS_COLORS.green} fillOpacity={0.04} />
                <XAxis dataKey="co2k" tick={{ fill: CHART_THEME.text, fontSize: 10 }} label={{ value: "CO2 Capture (kt/yr)", position: "bottom", fill: CHART_THEME.text, fontSize: 11, offset: -5 }} />
                <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} unit=" $/t" />
                <Tooltip
                  contentStyle={CHART_THEME.tooltip}
                  labelFormatter={(label) => label + " kt/yr"}
                  formatter={(v, name, props) => {
                    const row = props.payload;
                    return ["$" + f(v, 2) + "/t" + (name === "LCOC" ? " (sR=" + row.sR + ", Tier " + row.tier + ")" : ""), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* 13C: Current plant + Reference markers */}
                {(() => {
                  const currentCo2k = ((baseInputs.co2_capture_tpy ?? refCo2) / 1000).toFixed(0);
                  const refCo2k = (refCo2 / 1000).toFixed(0);
                  const isSame = currentCo2k === refCo2k;
                  if (isSame) return (
                    <ReferenceLine x={refCo2k} stroke={ENVERUS_COLORS.yellow} strokeDasharray="5 5" strokeWidth={2}>
                      <Label value="Reference" fill={ENVERUS_COLORS.yellow} fontSize={10} position="top" />
                    </ReferenceLine>
                  );
                  return (<>
                    <ReferenceLine x={currentCo2k} stroke={ENVERUS_COLORS.yellow} strokeDasharray="5 5" strokeWidth={2}>
                      <Label value="Current" fill={ENVERUS_COLORS.yellow} fontSize={10} position="top" />
                    </ReferenceLine>
                    <ReferenceLine x={refCo2k} stroke={ENVERUS_COLORS.pink} strokeDasharray="5 5" strokeWidth={1.5}>
                      <Label value="Reference" fill={ENVERUS_COLORS.pink} fontSize={10} position="top" />
                    </ReferenceLine>
                  </>);
                })()}
                <Area type="monotone" dataKey="lcoc" stroke={ENVERUS_COLORS.green} strokeWidth={2.5} fill="url(#lcocFill)" dot={false} name="LCOC" />
                <Line type="monotone" dataKey="capital" stroke={ENVERUS_COLORS.pink} strokeWidth={1.5} dot={false} name="Capital" strokeDasharray="6 3" />
                <Line type="monotone" dataKey="fixed_om" stroke={ENVERUS_COLORS.orange} strokeWidth={1.5} dot={false} name="Fixed O&M" strokeDasharray="6 3" />
                <Line type="monotone" dataKey="power" stroke={ENVERUS_COLORS.purple} strokeWidth={1.5} dot={false} name="Power" strokeDasharray="6 3" />
              </AreaChart>
            </ResponsiveContainer>
          );
        })()}
      </ChartCard>
      </div>{/* end Chart 5 flex child */}
      </div>{/* end Charts 4+5 flex row */}

      {/* Charts 6 and 7 — side by side */}
      <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <ChartCard title="LCOC by State">
        {(!geoData || heatmapLoading || stateData.length === 0) ? (
          <div className="map-skeleton" />
        ) : (() => {
          const validLCOC = stateData.filter(d => d.lcoc != null).map(d => d.lcoc);
          const sorted = [...validLCOC].sort((a, b) => a - b);
          const p10 = sorted[Math.floor(sorted.length * 0.10)];
          const p90 = sorted[Math.floor(sorted.length * 0.90)];
          const p30 = sorted[Math.floor(sorted.length * 0.30)];
          const p50 = sorted[Math.floor(sorted.length * 0.50)];
          const p70 = sorted[Math.floor(sorted.length * 0.70)];
          const mapColorFn = (lcoc) => {
            if (lcoc == null) return "#e0e0e0";
            const clamped = Math.max(p10, Math.min(p90, lcoc));
            const pct = (p90 - p10) > 0 ? (clamped - p10) / (p90 - p10) : 0.5;
            if (pct < 0.5) {
              const p = pct * 2;
              return `rgb(${Math.round(88+(253-88)*p)},${Math.round(185+(207-185)*p)},${Math.round(71+(12-71)*p)})`;
            }
            const p = (pct - 0.5) * 2;
            return `rgb(${Math.round(253+(184-253)*p)},${Math.round(207+(58-207)*p)},${Math.round(12+(75-12)*p)})`;
          };
          const mapW = 800, mapH = 420;
          const projection = d3Geo.geoAlbersUsa().fitSize([mapW, mapH], geoData);
          const pathGen = d3Geo.geoPath().projection(projection);
          const activeAbbr = baseInputs.state ?? "IL";
          const hs = hoveredState;
          return (
            <div style={{ position: "relative" }}>
              <svg viewBox={`0 0 ${mapW} ${mapH}`} style={{ width: "100%", height: "auto", maxHeight: 420 }}>
                {geoData.features.map(feat => {
                  const abbr = FIPS_TO_STATE[feat.id.toString().padStart(2, "0")];
                  const entry = stateData.find(d => d.state === abbr);
                  const lcoc = entry?.lcoc;
                  const color = mapColorFn(lcoc);
                  const isActive = abbr === activeAbbr;
                  const pathD = pathGen(feat);
                  if (!pathD) return null;
                  return (
                    <path key={feat.id} d={pathD} fill={color}
                      stroke={isActive ? "#1a1a1a" : "#ffffff"} strokeWidth={isActive ? 2.5 : 0.5}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredState({ abbr, lcoc, elec: entry?.elec_price, gas: entry?.gas_price })}
                      onMouseLeave={() => setHoveredState(null)}
                      onClick={() => onSelectState && onSelectState(abbr)} />
                  );
                })}
              </svg>
              {/* Color scale legend with 5 ticks */}
              <div className="map-legend-wrap">
                <div className="map-legend-bar" />
                <div className="map-legend-ticks">
                  {[p10, p30, p50, p70, p90].map((v, i) => (
                    <span key={i} className="map-legend-label">${f(v, 1)}</span>
                  ))}
                </div>
                <div className="map-legend-unit">$/t CO2</div>
              </div>
              {/* Hover tooltip */}
              {hs && (
                <div className="map-tooltip">
                  <strong>{STATE_NAMES[hs.abbr] ?? hs.abbr} ({hs.abbr})</strong><br/>
                  LCOC: {hs.lcoc != null ? "$" + f(hs.lcoc, 2) + "/t" : "N/A"}<br/>
                  Elec: ${hs.elec ?? "—"}/MWh | Gas: ${hs.gas != null ? f(hs.gas, 2) : "—"}/MMBtu
                </div>
              )}
            </div>
          );
        })()}
      </ChartCard>
      </div>{/* end Chart 6 flex child */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <ChartCard title="Annual Cash Flow & Cumulative">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={cfData} margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis dataKey="year" tick={{ fill: CHART_THEME.text, fontSize: 10 }} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} unit=" $M" />
            <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v) => "$" + f(v, 1) + "M"} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke={CHART_THEME.text} />
            <Bar dataKey="Net CF" name="Net CF">
              {cfData.map((d, i) => (
                <Cell key={i} fill={d["Net CF"] >= 0 ? ENVERUS_COLORS.green : ENVERUS_COLORS.red} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="Cumulative" stroke={ENVERUS_COLORS.yellow} strokeWidth={2} dot={false} name="Cumulative" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>{/* end Chart 7 flex child */}
      </div>{/* end Charts 6+7 flex row */}

      {/* Section: Financial Analysis */}
      <div className="charts-section-title" style={{ marginTop: 32 }}>Financial Analysis</div>

      {/* C2 — NPV Waterfall */}
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="NPV Waterfall ($M)">
        {npvWaterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={npvWaterfallData} margin={{ left: 20, right: 20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
              <XAxis dataKey="label" tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}M`} />
              <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => ["$" + f(v, 1) + "M", name]} />
              <ReferenceLine y={0} stroke={CHART_THEME.text} />
              <Bar dataKey="start" stackId="waterfall" fill="transparent" />
              <Bar dataKey="value" stackId="waterfall">
                {npvWaterfallData.map((d, i) => (
                  <Cell key={i} fill={d.isTotal ? (d.end >= 0 ? ENVERUS_COLORS.teal : ENVERUS_COLORS.red) : (d.value >= 0 ? ENVERUS_COLORS.green : ENVERUS_COLORS.pink)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Run cash flow analysis to see NPV waterfall</div>}
      </ChartCard>
      </div>

      {/* C3 + C6 side by side */}
      <div style={{ display: "flex", gap: 32, marginBottom: 32 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <ChartCard title="Cumulative Cash Flow (S-Curve)">
        {sCurveData.length > 0 ? (
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={sCurveData} margin={{ left: 20, right: 20, bottom: 30 }}>
              <defs>
                <linearGradient id="sCurveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ENVERUS_COLORS.green} stopOpacity={0.10} />
                  <stop offset="100%" stopColor={ENVERUS_COLORS.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
              <XAxis dataKey="year" tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}M`} label={{ value: "Cumulative ($M)", angle: -90, position: "insideLeft", fill: CHART_THEME.text, fontSize: 11, dx: -5 }} />
              <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => ["$" + f(v, 1) + "M", name]} />
              <ReferenceLine y={0} stroke={CHART_THEME.text} strokeWidth={1.5} />
              {(() => { const beYear = sCurveData.find((d, i) => i > 0 && sCurveData[i-1].cumulative < 0 && d.cumulative >= 0); return beYear ? <ReferenceLine x={beYear.year} stroke={ENVERUS_COLORS.yellow} strokeDasharray="5 5"><Label value="Breakeven" fill={ENVERUS_COLORS.yellow} fontSize={10} position="top" /></ReferenceLine> : null; })()}
              <Area type="monotone" dataKey="cumulative" stroke={ENVERUS_COLORS.green} strokeWidth={2.5} fill="url(#sCurveFill)" dot={false} name="Cumulative CF" />
              <Line type="monotone" dataKey="annual" stroke={ENVERUS_COLORS.teal} strokeWidth={1} dot={false} name="Annual CF" strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Run cash flow analysis to see S-curve</div>}
      </ChartCard>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
      <ChartCard title="LCOC vs 45Q Credit Rate">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={breakevenData} margin={{ left: 20, right: 20, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis dataKey="rate" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${v}`} label={{ value: "45Q Rate ($/t CO\u2082)", position: "bottom", fill: CHART_THEME.text, fontSize: 11, offset: -5 }} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}`} label={{ value: "LCOC ($/t)", angle: -90, position: "insideLeft", fill: CHART_THEME.text, fontSize: 11, dx: -5 }} />
            <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => ["$" + f(v, 2) + "/t", name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke={CHART_THEME.text} strokeWidth={1.5} />
            <ReferenceLine x={85} stroke={ENVERUS_COLORS.orange} strokeDasharray="5 5"><Label value="$85" fill={ENVERUS_COLORS.orange} fontSize={10} position="top" /></ReferenceLine>
            <ReferenceLine x={180} stroke={ENVERUS_COLORS.purple} strokeDasharray="5 5"><Label value="$180" fill={ENVERUS_COLORS.purple} fontSize={10} position="top" /></ReferenceLine>
            <Line type="monotone" dataKey="gross" stroke={ENVERUS_COLORS.teal} strokeWidth={2} dot={false} name="Gross LCOC" />
            <Line type="monotone" dataKey="net" stroke={ENVERUS_COLORS.green} strokeWidth={2.5} dot={false} name="Net LCOC" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-note">Net LCOC = Gross minus 45Q credit averaged over project life (12yr credit period).</div>
      </ChartCard>
      </div>
      </div>{/* end Financial row */}

      {/* Section: Market Context */}
      <div className="charts-section-title" style={{ marginTop: 32 }}>Market Context</div>

      {/* C4 — Abatement Cost Curve */}
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="Marginal Abatement Cost Curve (US Potential)">
        {abatementData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={abatementData} margin={{ left: 20, right: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
              <XAxis dataKey="midX" type="number" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `${Math.round(v)}`} label={{ value: "Cumulative Potential (Mt CO\u2082/yr)", position: "bottom", fill: CHART_THEME.text, fontSize: 11, offset: -5 }} domain={[0, 'auto']} />
              <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}`} label={{ value: "LCOC ($/t CO\u2082)", angle: -90, position: "insideLeft", fill: CHART_THEME.text, fontSize: 11, dx: -5 }} />
              <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name, props) => { const row = props.payload; return ["$" + f(row.lcoc, 2) + "/t — " + row.label + " (" + f(row.potential, 1) + " Mt/yr)", "LCOC"]; }} />
              <ReferenceLine y={85} stroke={ENVERUS_COLORS.orange} strokeDasharray="5 5"><Label value="$85/t (45Q)" fill={ENVERUS_COLORS.orange} fontSize={10} position="right" /></ReferenceLine>
              <ReferenceLine y={180} stroke={ENVERUS_COLORS.purple} strokeDasharray="5 5"><Label value="$180/t (DAC 45Q)" fill={ENVERUS_COLORS.purple} fontSize={10} position="right" /></ReferenceLine>
              <Bar dataKey="lcoc" name="LCOC">
                {abatementData.map((d, i) => <Cell key={i} fill={ENVERUS_PALETTE[i % ENVERUS_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ padding: 40, textAlign: "center", color: "#999" }}>No abatement data available</div>}
        <div className="chart-note">Bar width represents US capture potential (Mt CO2/yr). Sources sorted by LCOC ascending.</div>
      </ChartCard>
      </div>

      {/* C5 — Learning Curve to 2050 */}
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="LCOC Projection to 2050 (Learning Curve)">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={projectionData} margin={{ left: 20, right: 20, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis dataKey="year" tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}`} label={{ value: "LCOC ($/t CO\u2082)", angle: -90, position: "insideLeft", fill: CHART_THEME.text, fontSize: 11, dx: -5 }} />
            <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => v != null ? ["$" + f(v, 1) + "/t", name] : ["N/A", name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={100} stroke={ENVERUS_COLORS.yellow} strokeDasharray="4 4" strokeOpacity={0.5}><Label value="$100" fill={ENVERUS_COLORS.yellow} fontSize={9} position="right" /></ReferenceLine>
            <ReferenceLine y={50} stroke={ENVERUS_COLORS.yellow} strokeDasharray="4 4" strokeOpacity={0.5}><Label value="$50" fill={ENVERUS_COLORS.yellow} fontSize={9} position="right" /></ReferenceLine>
            <ReferenceLine y={20} stroke={ENVERUS_COLORS.yellow} strokeDasharray="4 4" strokeOpacity={0.5}><Label value="$20" fill={ENVERUS_COLORS.yellow} fontSize={9} position="right" /></ReferenceLine>
            <ReferenceLine x={2025} stroke={CHART_THEME.text} strokeDasharray="3 3"><Label value="Today" fill={CHART_THEME.text} fontSize={10} position="top" /></ReferenceLine>
            {Object.keys(PROJ_COLORS).map(src => (
              <Line key={src} type="monotone" dataKey={src} stroke={PROJ_COLORS[src]} strokeWidth={2} dot={{ r: 3 }} name={NETL_DEFAULTS[src]?.label ?? src} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="chart-note">Projections based on learning rates and deployment trajectories. DAC/DOC sources may not be active in current model configuration.</div>
      </ChartCard>
      </div>

      {/* Chart 8 — full width */}
      <div style={{ width: "100%", marginBottom: 32 }}>
      <ChartCard title="Technology Learning Curve">
        <div className="lc-toggles">
          {LC_TECHS.map(t => (
            <label key={t.key} className="lc-toggle">
              <span className="lc-dot" style={{ background: t.color }} />
              <input type="checkbox" checked={lcVisible[t.key]} onChange={() => setLcVisible(prev => ({ ...prev, [t.key]: !prev[t.key] }))} />
              <span style={{ color: lcVisible[t.key] ? t.color : CHART_THEME.text, opacity: lcVisible[t.key] ? 1 : 0.4 }}>{t.label}</span>
            </label>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={allLcData.map(d => ({ ...d, dep: d.deployment < 0.01 ? d.deployment.toExponential(1) : d.deployment < 1 ? d.deployment.toFixed(2) : d.deployment.toFixed(1) }))} margin={{ left: 20, right: 20, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
            <XAxis dataKey="dep" tick={{ fill: CHART_THEME.text, fontSize: 10 }} label={{ value: "Cumulative Deployment (GtCO2/yr)", position: "bottom", fill: CHART_THEME.text, fontSize: 11, offset: -5 }} />
            <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} unit=" $/t" />
            <Tooltip contentStyle={CHART_THEME.tooltip} labelFormatter={(l) => l + " GtCO2/yr"} formatter={(v, name) => ["$" + f(v, 2) + "/t", name]} />
            <ReferenceLine y={50} stroke={ENVERUS_COLORS.yellow} strokeDasharray="4 4" strokeOpacity={0.5}><Label value="$50" fill={ENVERUS_COLORS.yellow} fontSize={9} position="right" /></ReferenceLine>
            <ReferenceLine y={100} stroke={ENVERUS_COLORS.yellow} strokeDasharray="4 4" strokeOpacity={0.5}><Label value="$100" fill={ENVERUS_COLORS.yellow} fontSize={9} position="right" /></ReferenceLine>
            <ReferenceLine y={150} stroke={ENVERUS_COLORS.yellow} strokeDasharray="4 4" strokeOpacity={0.5}><Label value="$150" fill={ENVERUS_COLORS.yellow} fontSize={9} position="right" /></ReferenceLine>
            {LC_TECHS.map(t => lcVisible[t.key] && (
              <Line key={t.key} type="monotone" dataKey={t.key} stroke={t.color}
                strokeWidth={t.key === techKey ? 3 : 1.5}
                dot={false} name={t.label}
                connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>{/* end Chart 8 wrapper */}

    </div>
  );
}

// ── Sensitivity Tab ──

function SensitivityTab({ baseInputs, activeScenario, lcoc, activeSource, buildType, capacityFactor }) {
  const [useOverride, setUseOverride] = useState(false);
  const [overrideCF, setOverrideCF] = useState(85);
  const [overrideCoE, setOverrideCoE] = useState(12);
  const [overrideElec, setOverrideElec] = useState(88);
  const [showTable, setShowTable] = useState(false);
  const [visibleGroups, setVisibleGroups] = useState({ Financial: true, Operational: true, Energy: true, Cost: true });
  const [topN, setTopN] = useState(10);
  const f = (n, d = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Baseline inputs — either from Summary Tab or custom override
  const effectiveInputs = useMemo(() => {
    if (!useOverride) return baseInputs;
    const refCo2 = NETL_DEFAULTS[baseInputs.source]?.ref_co2_capture_tpy ?? baseInputs.co2_capture_tpy;
    const cfRatio = (overrideCF / 100) / 0.85;
    return {
      ...baseInputs,
      capacity_factor: overrideCF / 100,
      cost_of_equity: overrideCoE / 100,
      elec_price_override: overrideElec,
      co2_capture_tpy: refCo2 * cfRatio,
    };
  }, [useOverride, baseInputs, overrideCF, overrideCoE, overrideElec]);

  const [hoveredCase, setHoveredCase] = useState(null);

  const [tornadoData, setTornadoData] = useState([]);
  const [tornadoLoading, setTornadoLoading] = useState(false);
  useEffect(() => {
    setTornadoLoading(true);
    setTimeout(() => {
      setTornadoData(calcTornadoData(effectiveInputs, activeScenario));
      setTornadoLoading(false);
    }, 0);
  }, [effectiveInputs.source, effectiveInputs.co2_capture_tpy, effectiveInputs.build_type, effectiveInputs.capacity_factor, activeScenario]);

  const baseResult = useMemo(() => calcLCOC(effectiveInputs, activeScenario), [effectiveInputs, activeScenario]);
  const baselineLCOC = baseResult.lcoc;
  const baseComp = baseResult.components ?? {};

  // Compute hovered case result
  const displayResult = useMemo(() => {
    if (!hoveredCase) return baseResult;
    try {
      return calcLCOC(hoveredCase.inputs, activeScenario);
    } catch { return baseResult; }
  }, [hoveredCase, baseResult, activeScenario]);
  const displayComp = displayResult.components ?? {};
  const displayLCOC = displayResult.lcoc ?? 0;

  const chartLabel = hoveredCase
    ? `${hoveredCase.caseType === "low" ? "Low" : "High"} Case \u2014 ${SENSITIVITY_PARAMS[hoveredCase.paramKey]?.label ?? ""}`
    : "Baseline";

  const COMP_KEYS = [
    { key: "capital", label: "Capital", color: ENVERUS_COLORS.green },
    { key: "fixed_om", label: "Fixed O&M", color: ENVERUS_COLORS.pink },
    { key: "variable_om", label: "Variable O&M", color: ENVERUS_COLORS.orange },
    { key: "power", label: "Power", color: ENVERUS_COLORS.purple },
    { key: "fuel", label: "Fuel", color: ENVERUS_COLORS.teal },
  ];

  // Filter to non-zero swings for the chart
  const activeData = tornadoData
    .filter(d => Math.abs(d.totalSwing) >= 0.01)
    .filter(d => visibleGroups[d.group])
    .slice(0, topN);

  // Axis range
  const allLCOCs = activeData.flatMap(d => [d.lowLCOC, d.highLCOC]);
  const dataMin = allLCOCs.length ? Math.min(...allLCOCs) : baselineLCOC - 1;
  const dataMax = allLCOCs.length ? Math.max(...allLCOCs) : baselineLCOC + 1;
  const padding = (dataMax - dataMin) * 0.1 || 1;
  const axisMin = dataMin - padding;
  const axisMax = dataMax + padding;
  const axisRange = axisMax - axisMin;

  const barToLeft = (val) => Math.max(0, Math.min(100, ((val - axisMin) / axisRange) * 100));
  const baselinePos = barToLeft(baselineLCOC);

  const fmtParam = (param, val) => {
    if (param.format === "pct") return f(val * 100, 1) + "%";
    if (param.format === "multiplier") return f(val, 2) + "\u00d7";
    return f(val, 1) + " " + param.units;
  };

  // Axis ticks
  const tickInterval = axisRange <= 5 ? 1 : axisRange <= 15 ? 2 : axisRange <= 30 ? 5 : 10;
  const axisTicks = [];
  for (let t = Math.ceil(axisMin / tickInterval) * tickInterval; t <= axisMax; t += tickInterval) axisTicks.push(t);

  return (
    <div className="sensitivity-tab">

      {/* LCOC Breakdown Chart — interactive with tornado hover */}
      <div className="inputs-section" style={{ paddingBottom: 16 }}>
        <div className="card-title" style={{ borderBottom: "none", marginBottom: 4 }}>LCOC Breakdown</div>
        <div className={`sens-chart-label ${hoveredCase ? "sens-chart-label-hover" : ""}`}>{chartLabel}</div>
        <div className="chart1-layout">
          <div className="chart1-bar-side">
            <div className="chart1-bar-label">${f(displayLCOC, 2)} /t CO2</div>
            {(() => {
              const interval = displayLCOC <= 10 ? 1 : displayLCOC <= 25 ? 2 : displayLCOC <= 50 ? 5 : displayLCOC <= 100 ? 10 : displayLCOC <= 200 ? 20 : 25;
              const domainMax = Math.ceil(displayLCOC / interval) * interval;
              const axisTicks = [];
              for (let t = 0; t <= domainMax; t += interval) axisTicks.push(t);
              return (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart
                    data={[{
                      name: "LCOC",
                      Capital: displayComp.capital ?? 0,
                      "Fixed O&M": displayComp.fixed_om ?? 0,
                      "Variable O&M": displayComp.variable_om ?? 0,
                      Power: displayComp.power ?? 0,
                      Fuel: displayComp.fuel ?? 0,
                    }]}
                    layout="vertical"
                    margin={{ left: 0, right: 10, top: 20, bottom: 20 }}
                    barSize={100}
                  >
                    <XAxis type="number" tick={{ fill: CHART_THEME.text, fontSize: 11 }}
                      domain={[0, domainMax]} ticks={axisTicks} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip contentStyle={CHART_THEME.tooltip} formatter={(v, name) => {
                      const pct = displayLCOC > 0 ? (v / displayLCOC * 100).toFixed(1) : 0;
                      return ["$" + f(v, 2) + "/t (" + pct + "%)", name];
                    }} />
                    <Bar dataKey="Capital" stackId="a" fill={ENVERUS_COLORS.green} />
                    <Bar dataKey="Fixed O&M" stackId="a" fill={ENVERUS_COLORS.pink} />
                    <Bar dataKey="Variable O&M" stackId="a" fill={ENVERUS_COLORS.orange} />
                    <Bar dataKey="Power" stackId="a" fill={ENVERUS_COLORS.purple} />
                    <Bar dataKey="Fuel" stackId="a" fill={ENVERUS_COLORS.teal} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
          <div className="chart1-breakdown-side">
            <div className="chart1-breakdown-title">Cost Breakdown</div>
            {COMP_KEYS.map(c => {
              const v = displayComp[c.key] ?? 0;
              if (v <= 0) return null;
              const pct = displayLCOC > 0 ? (v / displayLCOC * 100) : 0;
              return (
                <div key={c.key} className="chart1-bd-row">
                  <span className="chart1-bd-dot" style={{ background: c.color }} />
                  <span className="chart1-bd-name">{c.label}</span>
                  <span className="chart1-bd-val">${f(v, 2)}</span>
                  <span className="chart1-bd-pct">{f(pct, 1)}%</span>
                </div>
              );
            })}
            <div className="chart1-bd-divider" />
            <div className="chart1-bd-row chart1-bd-total">
              <span className="chart1-bd-dot" style={{ background: "transparent" }} />
              <span className="chart1-bd-name">Total LCOC</span>
              <span className="chart1-bd-val">${f(displayLCOC, 2)}</span>
              <span className="chart1-bd-pct">/t CO2</span>
            </div>
          </div>
        </div>
        {/* Override checkbox */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={useOverride} onChange={e => setUseOverride(e.target.checked)} />
            Override baseline inputs
          </label>
        </div>
        {useOverride && (
          <div className="sens-override-panel">
            <div className="alert alert-warn" style={{ padding: "6px 10px", fontSize: 12, marginBottom: 8 }}>
              Using custom baseline — not linked to Summary Tab
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className="field">
                <span className="field-label">CF</span>
                <input className="field-input" type="number" value={overrideCF} onChange={e => setOverrideCF(parseFloat(e.target.value) || 0)} style={{ width: 60 }} />
                <span className="field-unit">%</span>
              </div>
              <div className="field">
                <span className="field-label">CoE</span>
                <input className="field-input" type="number" value={overrideCoE} onChange={e => setOverrideCoE(parseFloat(e.target.value) || 0)} style={{ width: 60 }} />
                <span className="field-unit">%</span>
              </div>
              <div className="field">
                <span className="field-label">Elec</span>
                <input className="field-input" type="number" value={overrideElec} onChange={e => setOverrideElec(parseFloat(e.target.value) || 0)} style={{ width: 70 }} />
                <span className="field-unit">$/MWh</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tornado Chart */}
      <div className="inputs-section sens-tornado-card">
        <div className="card-title">Tornado Chart</div>
        {tornadoLoading && <div className="chart-loading">Computing sensitivity...</div>}
        {!tornadoLoading && activeData.length === 0 && <div className="m-na">No sensitivity detected — all parameters produce identical LCOC</div>}
        <div className="tornado-filters">
          <div className="tornado-filter-groups">
            {["Financial", "Operational", "Energy", "Cost"].map(g => (
              <label key={g} className="tornado-filter-check">
                <input type="checkbox" checked={visibleGroups[g]} onChange={() => setVisibleGroups(prev => ({ ...prev, [g]: !prev[g] }))} />
                {g}
              </label>
            ))}
          </div>
          <div className="tornado-filter-slider">
            <span className="sb-label">Show top</span>
            <input type="range" min={5} max={15} value={topN} onChange={e => setTopN(parseInt(e.target.value))} />
            <span className="sb-val">{topN}</span>
          </div>
        </div>
        <div className="tornado-chart">
          {/* Axis ticks at top */}
          <div className="tornado-axis" style={{ marginLeft: 180 }}>
            {axisTicks.map(t => (
              <span key={t} className="tornado-tick" style={{ left: barToLeft(t) + "%" }}>${Math.round(t)}</span>
            ))}
          </div>

          {/* Bars */}
          {activeData.map((d) => {
            const param = SENSITIVITY_PARAMS[d.paramKey];

            // Determine bar direction relative to baseline
            const lowReduces = d.lowLCOC < baselineLCOC;
            const highIncreases = d.highLCOC > baselineLCOC;

            const lowInputs = buildSweepInputs(d.paramKey, d.lowValue, effectiveInputs);
            const highInputs = buildSweepInputs(d.paramKey, d.highValue, effectiveInputs);

            return (
              <div key={d.paramKey} onMouseLeave={() => setHoveredCase(null)}>
                <div className="tornado-row">
                  <div className="tornado-label" title={`${d.label}: ${fmtParam(param, d.lowValue)} → ${fmtParam(param, d.highValue)}`}>
                    {d.label}
                  </div>
                  <div className="tornado-bar-track">
                    <div className="tornado-baseline" style={{ left: baselinePos + "%" }} />
                    {/* Low annotation */}
                    <span className="tornado-ann tornado-ann-low" style={{ left: Math.min(barToLeft(d.lowLCOC), baselinePos) - 1 + "%" }}>{fmtParam(param, d.lowValue)}</span>
                    {/* High annotation */}
                    <span className="tornado-ann tornado-ann-high" style={{ left: Math.max(barToLeft(d.highLCOC), baselinePos) + 1 + "%" }}>{fmtParam(param, d.highValue)}</span>
                    {/* Low bar */}
                    {lowReduces ? (
                      <div className="tornado-bar tornado-bar-low"
                        style={{ left: barToLeft(d.lowLCOC) + "%", width: (baselinePos - barToLeft(d.lowLCOC)) + "%" }}
                        title={`Low: ${fmtParam(param, d.lowValue)} → $${f(d.lowLCOC, 2)}/t (${f(d.lowDelta, 2)})`}
                        onMouseEnter={() => setHoveredCase({ paramKey: d.paramKey, caseType: "low", inputs: lowInputs })} />
                    ) : (
                      <div className="tornado-bar tornado-bar-high"
                        style={{ left: baselinePos + "%", width: (barToLeft(d.lowLCOC) - baselinePos) + "%" }}
                        title={`Low: ${fmtParam(param, d.lowValue)} → $${f(d.lowLCOC, 2)}/t (+${f(d.lowDelta, 2)})`}
                        onMouseEnter={() => setHoveredCase({ paramKey: d.paramKey, caseType: "low", inputs: lowInputs })} />
                    )}
                    {/* High bar */}
                    {highIncreases ? (
                      <div className="tornado-bar tornado-bar-high"
                        style={{ left: baselinePos + "%", width: (barToLeft(d.highLCOC) - baselinePos) + "%" }}
                        title={`High: ${fmtParam(param, d.highValue)} → $${f(d.highLCOC, 2)}/t (+${f(d.highDelta, 2)})`}
                        onMouseEnter={() => setHoveredCase({ paramKey: d.paramKey, caseType: "high", inputs: highInputs })} />
                    ) : (
                      <div className="tornado-bar tornado-bar-low"
                        style={{ left: barToLeft(d.highLCOC) + "%", width: (baselinePos - barToLeft(d.highLCOC)) + "%" }}
                        title={`High: ${fmtParam(param, d.highValue)} → $${f(d.highLCOC, 2)}/t (${f(d.highDelta, 2)})`}
                        onMouseEnter={() => setHoveredCase({ paramKey: d.paramKey, caseType: "high", inputs: highInputs })} />
                    )}
                  </div>
                  <div className="tornado-swing">${f(Math.abs(d.totalSwing), 2)}</div>
                </div>
              </div>
            );
          })}

          {/* X-axis */}
          <div className="tornado-xaxis" style={{ marginLeft: 180 }}>
            <div className="tornado-baseline-label" style={{ left: baselinePos + "%" }}>
              Baseline ${f(baselineLCOC, 2)}
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Table — collapsed by default */}
      <div className="inputs-section">
        <div className="card-title" style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setShowTable(!showTable)}>
          <span>Parameter Table {showTable ? "\u25B4" : "\u25BE"}</span>
          {showTable && (
            <button className="sc-btn" style={{ fontSize: 11 }} onClick={(e) => {
              e.stopPropagation();
              const headers = ["Group","Parameter","Low Value","Low LCOC","Baseline","High Value","High LCOC","Swing"];
              const rows = tornadoData.map(d => {
                const param = SENSITIVITY_PARAMS[d.paramKey];
                return [d.group, d.label, fmtParam(param, d.lowValue), d.lowLCOC.toFixed(2), baselineLCOC.toFixed(2), fmtParam(param, d.highValue), d.highLCOC.toFixed(2), Math.abs(d.totalSwing).toFixed(2)];
              });
              const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "sensitivity_analysis.csv"; a.click();
              URL.revokeObjectURL(url);
            }}>Export CSV</button>
          )}
        </div>
        {showTable && (
          <div className="m-table-wrap">
            <table className="m-table sens-table">
              <thead>
                <tr>
                  <th>Group</th><th>Parameter</th>
                  <th className="num">Low Value</th><th className="num">Low LCOC</th>
                  <th className="num">Baseline</th>
                  <th className="num">High Value</th><th className="num">High LCOC</th>
                  <th className="num">Swing</th>
                </tr>
              </thead>
              <tbody>
                {tornadoData.map(d => {
                  const param = SENSITIVITY_PARAMS[d.paramKey];
                  const noSwing = Math.abs(d.totalSwing) < 0.01;
                  return (
                    <tr key={d.paramKey} className={noSwing ? "sens-row-zero" : ""}>
                      <td>{d.group}</td>
                      <td>{d.label}</td>
                      <td className="num">{fmtParam(param, d.lowValue)}</td>
                      <td className={`num ${d.lowLCOC < baselineLCOC ? "sens-cell-green" : d.lowLCOC > baselineLCOC ? "sens-cell-pink" : ""}`}>${f(d.lowLCOC, 2)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>${f(baselineLCOC, 2)}</td>
                      <td className="num">{fmtParam(param, d.highValue)}</td>
                      <td className={`num ${d.highLCOC > baselineLCOC ? "sens-cell-pink" : d.highLCOC < baselineLCOC ? "sens-cell-green" : ""}`}>${f(d.highLCOC, 2)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{noSwing ? "—" : "$" + f(Math.abs(d.totalSwing), 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

// ── Batch Tab ──

function BatchTab({ activeScenario }) {
  const [facilities, setFacilities] = useState([]);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [drillDown, setDrillDown] = useState(null);
  const fileRef = useRef(null);
  const f = (n, d = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const srcKeys = Object.keys(NETL_DEFAULTS);

  const addRow = () => setFacilities(prev => [...prev, { facility_name: "", source: "ammonia", co2_capture_tpy: "", build_type: "GF", state: "IL", capacity_factor: "", capture_rate: "", cost_of_equity: "", debt_pct: "", cost_of_debt: "", project_life: "", cod_year: "", elec_price: "", gas_price: "", dep_method: "", _id: Date.now() }]);
  const removeRow = (idx) => setFacilities(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, key, val) => setFacilities(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const parsed = await parseBatchFile(file); setFacilities(parsed.map(p => ({ ...p, _id: Date.now() + Math.random() }))); } catch (err) { alert(err.message); }
    e.target.value = "";
  };

  const handleRun = async () => {
    setRunning(true); setProgress(0);
    const res = [];
    for (let i = 0; i < facilities.length; i++) {
      res.push(runBatch([facilities[i]], activeScenario)[0]);
      setProgress(Math.round((i + 1) / facilities.length * 100));
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }
    setResults(res); setRunning(false);
  };

  const exportCSV = () => {
    if (!results) return;
    const headers = ["Facility Name","Source","CO2 t/yr","Build","State","LCOC $/t","Capital","Fixed O&M","Variable O&M","Power","Status"];
    const rows = results.map(r => [r.facility_name, r.source, r.co2_capture_tpy, r.build_type, r.state ?? "", r.lcoc?.toFixed(2) ?? "ERROR", r.components?.capital?.toFixed(2) ?? "", r.components?.fixed_om?.toFixed(2) ?? "", r.components?.variable_om?.toFixed(2) ?? "", r.components?.power?.toFixed(2) ?? "", r._status]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "ccus_batch_results.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const successResults = results?.filter(r => r._status === "success") ?? [];
  const warnResults = results?.filter(r => r._warnings?.length > 0 && r._status === "success") ?? [];
  const errorResults = results?.filter(r => r._status === "error") ?? [];
  const sortedForChart = [...successResults].sort((a, b) => a.lcoc - b.lcoc);
  const reqFields = ["facility_name", "source", "co2_capture_tpy", "build_type"];
  const optFields = ["state", "capacity_factor", "capture_rate", "cost_of_equity", "debt_pct", "cost_of_debt", "project_life", "cod_year", "elec_price", "gas_price", "dep_method"];

  return (
    <div className="sensitivity-tab">
      {/* Input */}
      <div className="inputs-section">
        <div className="card-title">Input</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} style={{ display: "none" }} ref={fileRef} />
          <button className="sc-btn" onClick={() => fileRef.current.click()}>Upload CSV</button>
          <button className="sc-btn" onClick={generateBatchTemplate}>Download Template</button>
          <button className="sc-btn" onClick={addRow}>+ Add Facility</button>
          <label style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <ToggleSwitch value={showMore} onChange={setShowMore} /> Show optional fields
          </label>
        </div>
        {facilities.length > 0 && (
          <div className="m-table-wrap">
            <table className="m-table">
              <thead><tr><th>#</th>{reqFields.map(k => <th key={k}>{BATCH_FACILITY_SCHEMA[k]?.label ?? k}</th>)}{showMore && optFields.map(k => <th key={k}>{BATCH_FACILITY_SCHEMA[k]?.label ?? k}</th>)}<th></th></tr></thead>
              <tbody>
                {facilities.map((row, idx) => (
                  <tr key={row._id ?? idx}>
                    <td>{idx + 1}</td>
                    <td><input className="i-input" value={row.facility_name} onChange={e => updateRow(idx, "facility_name", e.target.value)} style={{ width: 120, textAlign: "left" }} /></td>
                    <td><select className="i-input" value={row.source} onChange={e => updateRow(idx, "source", e.target.value)} style={{ width: 100, textAlign: "left" }}>{srcKeys.map(k => <option key={k} value={k}>{NETL_DEFAULTS[k].label}</option>)}</select></td>
                    <td><input className="i-input" type="number" value={row.co2_capture_tpy} onChange={e => updateRow(idx, "co2_capture_tpy", e.target.value)} style={{ width: 90 }} /></td>
                    <td><ToggleSwitch value={row.build_type === "RF"} onChange={(v) => updateRow(idx, "build_type", v ? "RF" : "GF")} labelOn="RF" labelOff="GF" /></td>
                    {showMore && optFields.map(k => {
                      const schema = BATCH_FACILITY_SCHEMA[k];
                      if (schema.type === "select") {
                        const options = schema.options;
                        const labels = {
                          "": "— default —",
                          "macrs_5": "MACRS 5-Year",
                          "macrs_15": "MACRS 15-Year",
                          "sl_10": "SL 10-Year",
                          "sl_20": "SL 20-Year",
                          "sl_30": "SL 30-Year"
                        };
                        return <td key={k}><select className="i-input" value={row[k] ?? ""} onChange={e => updateRow(idx, k, e.target.value)} style={{ width: 100, textAlign: "left" }}>{options.map(o => <option key={o} value={o}>{labels[o] || o}</option>)}</select></td>;
                      } else {
                        return <td key={k}><input className="i-input" value={row[k] ?? ""} onChange={e => updateRow(idx, k, e.target.value)} style={{ width: 70 }} /></td>;
                      }
                    })}
                    <td><button className="i-reset" onClick={() => removeRow(idx)} style={{ color: "#b83a4b" }}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
          <button className="sc-btn" style={{ background: facilities.length > 0 && !running ? "#58b947" : "#ccc", color: "#fff", padding: "6px 20px" }} onClick={handleRun} disabled={facilities.length === 0 || running}>{running ? `Running... ${progress}%` : `Run Batch (${facilities.length})`}</button>
          <span style={{ fontSize: 12, color: "#999" }}>Scenario: {activeScenario.name}</span>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="inputs-section" style={{ marginTop: 16 }}>
          <div className="card-title">Results</div>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13, flexWrap: "wrap" }}>
            <span>{results.length} facilities</span>
            <span style={{ color: "#58b947" }}>{successResults.length} successful</span>
            {warnResults.length > 0 && <span style={{ color: "#d4a017" }}>{warnResults.length} warnings</span>}
            {errorResults.length > 0 && <span style={{ color: "#b83a4b" }}>{errorResults.length} errors</span>}
            <button className="sc-btn" onClick={exportCSV} style={{ marginLeft: "auto" }}>Export CSV</button>
          </div>
          <div className="m-table-wrap">
            <table className="m-table">
              <thead><tr><th>#</th><th>Facility</th><th>Source</th><th className="num">CO2 t/yr</th><th>Build</th><th>State</th><th className="num">LCOC $/t</th><th className="num">Capital</th><th className="num">Fixed</th><th className="num">Variable</th><th className="num">Power</th><th>Status</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ opacity: r._status === "error" ? 0.5 : 1, cursor: r._status === "success" ? "pointer" : "default" }} onClick={() => r._status === "success" && setDrillDown(r)}>
                    <td>{i + 1}</td>
                    <td>{r._status === "error" ? "\u2717 " : r._warnings?.length ? "\u26A0 " : "\u2713 "}{r.facility_name}</td>
                    <td>{NETL_DEFAULTS[r.source]?.label ?? r.source ?? "—"}</td>
                    <td className="num">{r.co2_capture_tpy ? Number(r.co2_capture_tpy).toLocaleString() : "—"}</td>
                    <td>{r.build_type}</td>
                    <td>{r.state ?? "—"}</td>
                    <td className={`num ${r._status !== "error" ? "ocard-green" : ""}`}>{r.lcoc != null ? "$" + f(r.lcoc, 2) : "ERROR"}</td>
                    <td className="num">{r.components?.capital != null ? "$" + f(r.components.capital, 2) : "—"}</td>
                    <td className="num">{r.components?.fixed_om != null ? "$" + f(r.components.fixed_om, 2) : "—"}</td>
                    <td className="num">{r.components?.variable_om != null ? "$" + f(r.components.variable_om, 2) : "—"}</td>
                    <td className="num">{r.components?.power != null ? "$" + f(r.components.power, 2) : "—"}</td>
                    <td style={{ fontSize: 11 }}>{r._status === "error" ? <span style={{ color: "#b83a4b" }}>{r._errors?.[0]}</span> : r._warnings?.length ? <span style={{ color: "#d4a017" }}>{r._warnings[0]}</span> : <span style={{ color: "#58b947" }}>OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Batch Chart */}
      {sortedForChart.length > 0 && (
        <div className="inputs-section" style={{ marginTop: 16 }}>
          <div className="card-title">LCOC by Facility</div>
          <ResponsiveContainer width="100%" height={Math.max(200, sortedForChart.length * 40)}>
            <BarChart data={sortedForChart.map(r => ({ name: r.facility_name, lcoc: r.lcoc, source: NETL_DEFAULTS[r.source]?.label ?? r.source, co2: Number(r.co2_capture_tpy) }))} layout="vertical" margin={{ left: 120, right: 20 }}>
              <CartesianGrid horizontal={false} stroke="#e0e0e0" />
              <XAxis type="number" tick={{ fill: "#999", fontSize: 11 }} tickFormatter={v => `$${Math.round(v)}`} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#555", fontSize: 11 }} width={110} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 4, fontSize: 12 }} formatter={(v, name, props) => { const row = props.payload; return [`$${f(v, 2)}/t | ${row.source} | ${row.co2?.toLocaleString()} t/yr`, "LCOC"]; }} />
              <Bar dataKey="lcoc" fill="#58b947" barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Drill-down slide-in panel */}
      <div style={{
        position: "fixed", right: drillDown ? 0 : -620, top: 0, width: 600, height: "100vh",
        background: "#ffffff", borderLeft: "1px solid #e0e0e0", boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
        transition: "right 0.3s ease", overflowY: "auto", zIndex: 200, padding: 24,
      }}>
        {drillDown && (() => {
          const dd = drillDown;
          const src = dd.source;
          const srcDef = NETL_DEFAULTS[src];
          const d = dd.details ?? {};
          const c = dd.components ?? {};
          const fl = (n, dec = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
          return (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{dd.facility_name}</div>
                <div style={{ fontSize: 13, color: "#555" }}>{srcDef?.label ?? src} | {dd.build_type} | LCOC: <span style={{ color: "#58b947", fontWeight: 700 }}>${fl(dd.lcoc, 2)}/t</span></div>
              </div>
              <button onClick={() => setDrillDown(null)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>&times;</button>
            </div>
            <div className="ocard" style={{ marginBottom: 8 }}>
              <div className="ocard-title">Scaling</div>
              <div className="ocard-row"><span className="ocard-l">CO2 Captured</span><span className="ocard-v">{fl(d.co2_per_year, 0)} t/yr</span></div>
              <div className="ocard-row"><span className="ocard-l">Ref CO2</span><span className="ocard-v">{fl(d.ref_co2, 0)} t/yr</span></div>
              <div className="ocard-row"><span className="ocard-l">Scaling Ratio</span><span className="ocard-v">{fl(d.sR, 3)}</span></div>
              <div className="ocard-row"><span className="ocard-l">Tier</span><span className="ocard-v">{d.tier}</span></div>
            </div>
            <div className="ocard" style={{ marginBottom: 8 }}>
              <div className="ocard-title">Capital</div>
              <div className="ocard-row"><span className="ocard-l">Scaled TPC</span><span className="ocard-v">{formatDollars((d.scaled_tpc_k ?? 0) * 1000)}</span></div>
              <div className="ocard-row"><span className="ocard-l">Adj TPC</span><span className="ocard-v">{formatDollars((d.adj_tpc_k ?? 0) * 1000)}</span></div>
              <div className="ocard-row"><span className="ocard-l">CAPEX</span><span className="ocard-v">{formatDollars((d.capex_k ?? 0) * 1000)}</span></div>
              <div className="ocard-row"><span className="ocard-l">WACC</span><span className="ocard-v">{fl((d.wacc ?? 0) * 100, 2)}%</span></div>
              <div className="ocard-row"><span className="ocard-l">Annuity Factor</span><span className="ocard-v">{fl((d.af ?? 0) * 100, 3)}%</span></div>
            </div>
            <div className="ocard" style={{ marginBottom: 8 }}>
              <div className="ocard-title">Cost Breakdown</div>
              {[["Capital", c.capital, "#58b947"], ["Fixed O&M", c.fixed_om, "#ef509a"], ["Variable O&M", c.variable_om, "#f68d2e"], ["Power", c.power, "#93348f"], ["Fuel", c.fuel, "#58a7af"]].map(([name, val, color]) => val > 0 ? (
                <div className="ocard-row" key={name}><div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} /><span className="ocard-l">{name}</span><span className="ocard-v">${fl(val, 2)}/t</span><span className="ocard-pct">{fl(dd.lcoc > 0 ? val / dd.lcoc * 100 : 0, 1)}%</span></div>
              ) : null)}
              <div style={{ borderTop: "1px solid #e0e0e0", marginTop: 4, paddingTop: 4 }}>
                <div className="ocard-row" style={{ fontWeight: 700 }}><span className="ocard-l">Total LCOC</span><span className="ocard-v" style={{ color: "#58b947" }}>${fl(dd.lcoc, 2)}/t</span></div>
              </div>
            </div>
            <div className="ocard" style={{ marginBottom: 8 }}>
              <div className="ocard-title">O&M Details</div>
              <div className="ocard-row"><span className="ocard-l">Op Labor</span><span className="ocard-v">{formatDollars(d.op_labor_annual ?? 0, { suffix: "/yr" })}</span></div>
              <div className="ocard-row"><span className="ocard-l">Maint Labor</span><span className="ocard-v">{formatDollars(d.maint_labor ?? 0, { suffix: "/yr" })}</span></div>
              <div className="ocard-row"><span className="ocard-l">Admin</span><span className="ocard-v">{formatDollars(d.admin ?? 0, { suffix: "/yr" })}</span></div>
              <div className="ocard-row"><span className="ocard-l">PT&I</span><span className="ocard-v">{formatDollars(d.pti ?? 0, { suffix: "/yr" })}</span></div>
              <div className="ocard-row"><span className="ocard-l">Maint Material</span><span className="ocard-v">{formatDollars(d.maint_material ?? 0, { suffix: "/yr" })}</span></div>
            </div>
            <div className="ocard" style={{ marginBottom: 8 }}>
              <div className="ocard-title">Power</div>
              <div className="ocard-row"><span className="ocard-l">Scaled MW</span><span className="ocard-v">{fl(d.scaled_mw, 2)} MW</span></div>
              <div className="ocard-row"><span className="ocard-l">Annual Energy</span><span className="ocard-v">{fl(d.annual_mwh, 0)} MWh/yr</span></div>
              <div className="ocard-row"><span className="ocard-l">Elec Price</span><span className="ocard-v">${fl(d.elec_price, 0)}/MWh</span></div>
            </div>
          </>);
        })()}
      </div>
      {/* Overlay */}
      {drillDown && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 199 }} onClick={() => setDrillDown(null)} />}

    </div>
  );
}

// ── Assumptions Tab ──

function ASection({ num, title, children, search }) {
  const text = typeof children === "string" ? children : "";
  if (search && title.toLowerCase().indexOf(search) === -1 && text.toLowerCase().indexOf(search) === -1) {
    // Simple: always show sections — search highlights handled via CSS mark
  }
  return (
    <div className="inputs-section assume-section" id={`assume-${num}`}>
      <div className="card-title">{num}. {title}</div>
      <div className="assume-body">{children}</div>
    </div>
  );
}

function ATable({ headers, rows }) {
  return (
    <div className="m-table-wrap">
      <table className="m-table">
        <thead><tr>{headers.map((h, i) => <th key={i} className={i > 0 ? "num" : ""}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} className={j > 0 && typeof c === "string" && (c.startsWith("$") || c.match(/^\d/)) ? "num" : ""}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function AssumptionsTab() {
  const [search, setSearch] = useState("");
  const sq = search.toLowerCase();

  const stateEntries = Object.entries(EIA_ELEC_RATES).sort((a, b) => a[0].localeCompare(b[0]));
  const hhEntries = Object.entries(HH_FORWARD_STRIP).sort((a, b) => a[0] - b[0]);
  const basisEntries = Object.entries(NG_BASIS_DIFFERENTIAL).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="sensitivity-tab assume-tab">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Assumptions & Methodology</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="field-input" placeholder="Search assumptions..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200, textAlign: "left" }} />
          <button className="sc-btn" onClick={() => window.print()}>Export PDF</button>
        </div>
      </div>

      <ASection num={1} title="Cost Basis & Methodology" search={sq}>
        <ATable headers={["Parameter", "Value", "Notes"]} rows={[
          ["Cost Year", "User-selectable (2018\u20132026)", "CEPCI ref = 603.1 (2018$), escalated by year"],
          ["Capacity Factor", "85%", "NETL reference case"],
          ["Location", "Midwestern United States", "NETL reference case"],
          ["Primary Source", "Hughes & Zoelle (2023)", "DOE/NETL-2023/3907, March 31, 2023"],
          ["Annualization", "WACC-based annuity factor", "AF = WACC / (1-(1+WACC)^(-n))"],
          ["TASC", "Not used", "Interest during construction captured by WACC annuity"],
        ]} />
        <p className="assume-note">The WACC-based annuity replaces NETL's sector-specific Capital Charge Factors (CCFs). Using TASC in addition would double-count financing costs.</p>
      </ASection>

      <ASection num={2} title="Capital Costs (TPC)" search={sq}>
        <ATable headers={["Source", "Ref TPC", "Owner's %", "Total CAPEX", "NETL Exhibit"]} rows={[
          ["Ammonia (Syngas)", "$37,347K", "22.1%", "$45,587K", "5-5, 5-6"],
          ["Ethylene Oxide", "$16,636K", "22.5%", "$20,385K", "5-14, 5-15"],
          ["NGCC (F-Frame)", "$551,801K", "21.0%", "$667,679K", "Power section"],
          ["NGCC (H-Frame)", "$657,343K", "21.0%", "$795,385K", "Power section"],
        ]} />
        <p className="assume-note">TPC values are pre-RDF. RDF applied separately for build_type = RF.</p>
      </ASection>

      <ASection num={3} title="Owner's Costs" search={sq}>
        <ATable headers={["Component", "Typical Range", "Notes"]} rows={[
          ["Pre-production", "~2-3% of TPC", "Startup, commissioning"],
          ["Inventory Capital", "~0.5% of TPC", "Spare parts"],
          ["Land", "$30K fixed", "All sources"],
          ["Other Owner's Costs", "~12-15% of TPC", ""],
          ["Financing Costs", "~2-3% of TPC", ""],
          ["Total", "~22% of TPC", "Source-specific (see Section 2)"],
        ]} />
        <p className="assume-note">Citation: Hughes & Zoelle (2023), Section 3.1.1</p>
      </ASection>

      <ASection num={4} title="O&M Rates" search={sq}>
        <ATable headers={["Rate", "Value", "Basis", "Source"]} rows={[
          ["Maintenance Labor", "0.64% of TPC/yr", "Verified NH3 + EO", "NETL 3.1.2.1"],
          ["Maintenance Material", "0.96% of TPC/yr", "Verified NH3 + EO", "NETL 3.1.2.2"],
          ["PT&I", "2.00% of TPC/yr", "All sources", "NETL 3.1.2.5"],
          ["Admin & Support", "25% of (Op Labor + Maint Labor)", "Confirmed", "NETL 3.1.2.3"],
          ["Op Labor Rate", "$38.50/hr + 30% burden", "All sources", "NETL 3.1.2.3"],
          ["Operators/shift (HP)", "1.0", "Compression-only", "Source cases"],
          ["Operators/shift (LP)", "3.3", "Full amine system", "Source cases"],
        ]} />
        <p className="assume-note">Admin rate confirmed as 25% not 30% — corrected per NETL Section 3.1.2.3.</p>
      </ASection>

      <ASection num={5} title="Financial Assumptions" search={sq}>
        <ATable headers={["Parameter", "Default", "Notes"]} rows={[
          ["Cost of Equity", "12.0%", "User-adjustable"],
          ["Cost of Debt", "5.15%", "NETL baseline"],
          ["Federal Tax Rate", "21.0%", "TCJA 2017"],
          ["Project Life", "30 years", "NETL reference"],
          ["Depreciation", "MACRS 5-Year", "User-selectable"],
        ]} />
        <p className="assume-note">This model uses WACC-based annuity rather than NETL CCFs. Capital cost components will differ from NETL published values — total LCOC validation tolerance is ±5%.</p>
      </ASection>

      <ASection num={6} title="Energy Prices" search={sq}>
        <p className="assume-subtitle">Electricity — EIA Industrial Rates ($/MWh, 2024)</p>
        <div className="assume-grid-3">
          {stateEntries.map(([st, rate]) => <div key={st} className="assume-grid-item"><span>{st}</span><span>${rate}</span></div>)}
        </div>
        <p className="assume-note">Source: EIA Electric Power Monthly, Table 5.6a (2024)</p>

        <p className="assume-subtitle">Henry Hub Forward Strip ($/MMBtu)</p>
        <div className="assume-grid-3">
          {hhEntries.map(([yr, price]) => <div key={yr} className="assume-grid-item"><span>{yr}</span><span>${price.toFixed(2)}</span></div>)}
        </div>
        <p className="assume-note">Source: Bloomberg Terminal, annual average as of 2026-02-17. NETL base = $4.42/MMBtu.</p>

        <p className="assume-subtitle">Natural Gas Basis Differentials ($/MMBtu vs HH)</p>
        <div className="assume-grid-3">
          {basisEntries.map(([st, diff]) => <div key={st} className="assume-grid-item"><span>{st}</span><span>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}</span></div>)}
        </div>
        <p className="assume-note">Source: Bloomberg Terminal, 2025 average basis differentials.</p>
      </ASection>

      <ASection num={7} title="Emission Factors" search={sq}>
        <ATable headers={["Source", "Factor", "Units", "Notes"]} rows={[
          ["Ammonia (syngas)", "1.233", "t CO2/t NH3", "66% of total 1.868 EF"],
          ["Ethylene Oxide", "0.333", "t CO2/t EO", "Corrected from 0.283"],
          ["NGCC", "0.05306", "t CO2/MMBtu", "Via heat rate formula"],
        ]} />
        <p className="assume-note">EO emission factor corrected from earlier NETL database versions per March 2023 report.</p>
      </ASection>

      <ASection num={8} title="Retrofit Difficulty Factors" search={sq}>
        <ATable headers={["Source Category", "RDF", "Rationale", "Source"]} rows={[
          ["HP (NH3, EO, EtOH, NGP)", "1.01", "Compression-only, minimal integration", "NETL 3.3"],
          ["LP (Ref H2, Cement)", "1.05", "Full amine system", "NETL 3.3"],
          ["NGCC", "1.09", "Complex power island integration", "NETL 3.3"],
        ]} />
        <p className="assume-note">RDF = 1.0 for greenfield (GF) build type regardless of source.</p>
      </ASection>

      <ASection num={9} title="Tax Credits & Incentives" search={sq}>
        <p className="assume-subtitle">45Q Carbon Capture Credit (IRA Rates)</p>
        <ATable headers={["Parameter", "Value", "Source"]} rows={[
          ["Standard rate", "$85/t CO2", "IRA Section 13104 (2022)"],
          ["DAC rate (OBBBA)", "$180/t CO2", "One Big Beautiful Bill Act (2025)"],
          ["Credit period", "12 years from COD", ""],
          ["Storage types", "Geological + EOR (both $85)", "Post-IRA unified rate"],
        ]} />
        <p className="assume-subtitle">Other Credits (Placeholders)</p>
        <ATable headers={["Credit", "Rate", "Source"]} rows={[
          ["45V Clean Hydrogen", "$3.00/kg H2 (max)", "IRA Section 13204"],
          ["45Z Clean Fuels", "Varies by fuel type", "IRA Section 13203"],
          ["RIN D3 (cellulosic)", "$2.50/RIN", "EPA RFS; market 2025"],
          ["RIN D5 (advanced)", "$1.20/RIN", "EPA RFS; market 2025"],
          ["RIN D6 (conventional)", "$0.80/RIN", "EPA RFS; market 2025"],
          ["LCFS (California)", "~$75/t CO2e", "CARB; 2025 avg"],
          ["CDR (voluntary)", "$50/t CO2", "VCM placeholder"],
          ["Avoidance credit", "$20/t CO2", "VCM placeholder"],
        ]} />
      </ASection>

      <ASection num={10} title="Technology Multipliers" search={sq}>
        <ATable headers={["Technology", "CAPEX", "OPEX", "Power", "Compatible Sources"]} rows={[
          ["Amine (MEA)", "1.00", "1.00", "1.00", "All"],
          ["Advanced Amine", "1.08", "0.88", "0.85", "All"],
          ["Membrane", "0.85", "0.95", "0.70", "HP, Refinery H2"],
          ["Cryogenic", "1.25", "1.10", "1.35", "HP sources only"],
          ["Solid Sorbent", "1.15", "0.82", "0.75", "Industrial, Power"],
          ["MOF", "1.35", "0.70", "0.65", "All"],
        ]} />
        <p className="assume-note">Learning rates removed — unsourced assumptions. Technology multipliers are point-in-time adjustments only.</p>
      </ASection>

      <ASection num={11} title="Scaling Methodology" search={sq}>
        <p className="assume-text"><strong>Tier A (sR {"<"} 0.3x):</strong> Per-item scaling with cost floors. Each line item: TPC_ref x sR^exp, floored at TPC_ref x floor_factor.</p>
        <p className="assume-text"><strong>Tier B (0.3x to 3.0x):</strong> Standard six-tenths rule per line item. Exponents: 0.4 (site) to 0.7 (electrical/I&C). Core: 0.6.</p>
        <p className="assume-text"><strong>Tier C ({">"} 3.0x):</strong> Train-based. N_trains = ceil(sR/3). Core: per-train x 0.93 learning. Shared: sR^0.4.</p>
        <p className="assume-note">Source: NETL scaling methodology; Chemical Engineering six-tenths rule (Williams, 1947).</p>
      </ASection>

      <ASection num={12} title="Deviations from NETL Methodology" search={sq}>
        <ATable headers={["#", "Deviation", "NETL Approach", "This Model", "Rationale"]} rows={[
          ["1", "Capital annualization", "Sector-specific CCFs", "WACC annuity AF", "User-adjustable, transparent"],
          ["2", "TASC", "Applied as TPC multiplier", "Not used", "Avoid double-counting with WACC"],
          ["3", "Admin rate", "30% (some sources)", "25%", "Corrected per NETL 3.1.2.3"],
          ["4", "EO emission factor", "0.283 t/t EO", "0.333 t/t EO", "Corrected per 2023 report"],
          ["5", "Ethanol EF", "0.00243 t/gal", "0.00286 t/gal", "Corrected per 2023 report"],
          ["6", "Learning rates", "In tech multipliers", "Removed", "Unsourced assumptions"],
        ]} />
      </ASection>

      <ASection num={13} title="CDR Sources (DAC & DOC)" search={sq}>
        <p className="assume-text" style={{ fontStyle: "italic", background: "#fffbe6", padding: "8px 10px", borderRadius: 4, border: "1px solid #f0e6b0", marginBottom: 12 }}>
          Unlike NETL industrial sources which use published account-level TPC data, DAC and DOC capital costs are estimated from literature.
          TPC line item breakdowns are approximate and intended to reflect technology cost structure rather than precise engineering estimates.
          Users should treat DAC/DOC results as indicative ranges rather than validated point estimates.
        </p>

        <h4 style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 8px" }}>DAC — Direct Air Capture (Solid Sorbent)</h4>
        <ATable headers={["Parameter", "Value", "Source"]} rows={[
          ["Technology", "Temperature-Vacuum Swing Adsorption (TVSA)", "IEAGHG 2021-05"],
          ["Reference scale", "100,000 t CO\u2082/yr", "DOE DAC Hub program"],
          ["Reference TPC", "$370M ($3,700/t CO\u2082/yr capacity)", "Below FOAK ($4,000\u20136,000), above NOAK (~$730 EUR)"],
          ["FOAK LCOC range", "$400\u2013700/t", "IEAGHG 2021-05"],
          ["NOAK LCOC (1 Mt/yr)", "$194\u2013230/t", "IEAGHG 2021-05"],
          ["Current commercial", "$1,000\u20131,300/t", "Climeworks Mammoth (2024)"],
          ["2050 projection", "$374/t ($281\u2013579)", "ETH Zurich, Qiu et al., One Earth (2024)"],
          ["Electricity requirement", "200\u2013300 kWh_e/t CO\u2082", "Fasihi et al. 2019"],
          ["Thermal energy", "1,500\u20132,000 kWh_th/t CO\u2082", "Fasihi et al. 2019"],
          ["Model electricity (ref_mw)", "3.36 MW (250 kWh_e/t midpoint)", "Fasihi et al. 2019"],
          ["Model fuel", "597,100 MMBtu/yr (1,750 kWh_th/t midpoint)", "Fasihi et al. 2019"],
          ["Project life", "25 years", "Sorbent degradation limits"],
          ["Cost of equity", "15%", "Technology risk premium over 12% base"],
          ["45Q rate", "$180/t (OBBBA DAC rate)", "One Big Beautiful Bill Act (2025)"],
        ]} />
        <p className="assume-note" style={{ marginTop: 8 }}>
          <strong>Key references:</strong>{" "}
          (1) IEAGHG (2021). "Global Assessment of Direct Air Capture Costs." Technical Report 2021-05.{" "}
          (2) Fasihi, M., Efimova, O., & Breyer, C. (2019). "Techno-economic assessment of CO\u2082 direct air capture plants." J. Cleaner Production, 224, 957-980.{" "}
          (3) Qiu, Y. et al. (2024). "Cost of direct air carbon capture to remain higher than hoped." One Earth, ETH Zurich.{" "}
          (4) NETL (2022, Rev.1 2025). "Direct Air Capture Case Studies: Sorbent System." OSTI 2520078.{" "}
          (5) Climeworks (2024). Mammoth facility operational data, Iceland.
        </p>

        <h4 style={{ fontSize: 14, fontWeight: 700, margin: "24px 0 8px" }}>DOC — Direct Ocean Capture (Electrochemical)</h4>
        <ATable headers={["Parameter", "Value", "Source"]} rows={[
          ["Technology", "Bipolar Membrane Electrodialysis (BPMED)", "Nature Communications (2020)"],
          ["Reference scale", "100,000 t CO\u2082/yr", "Captura target scale ~2028"],
          ["Reference TPC", "$500M ($5,000/t CO\u2082/yr capacity)", "Higher than DAC \u2014 marine infrastructure + membranes"],
          ["Near-term LCOC", "$150\u2013450/t", "National Academies of Sciences"],
          ["Offshore TEA", "$1,130/t", "ScienceDirect TEA study (2025)"],
          ["Electricity requirement", "980\u20133,220 kWh_e/t CO\u2082", "Multiple sources (Nature Comms, ScienceDirect)"],
          ["Fuel requirement", "None", "All-electric process"],
          ["Model electricity (ref_mw)", "13.4 MW (1,000 kWh_e/t midpoint)", "Nature Communications (2020)"],
          ["Project life", "20 years", "Membrane/electrode degradation"],
          ["Cost of equity", "16%", "Highest in model \u2014 pre-commercial uncertainty"],
          ["Coastal states only", "Required", "Marine infrastructure requirement"],
          ["45Q rate", "$180/t (OBBBA DAC rate)", "One Big Beautiful Bill Act (2025)"],
        ]} />
        <p className="assume-note" style={{ marginTop: 8 }}>
          <strong>Key references:</strong>{" "}
          (1) Eisaman, M.D. et al. (2020). "A direct coupled electrochemical system for capture and conversion of CO\u2082 from oceanwater." Nature Communications.{" "}
          (2) Digdaya, I.A. et al. (2023). "Direct Ocean Capture: Electrochemical Processes for Oceanic Carbon Removal." Energy & Environmental Science.{" "}
          (3) NREL (2024). "A Model of Large Scale Electrochemical Direct Ocean Capture Under Variable Power."{" "}
          (4) National Academies of Sciences (2022). "A Research Strategy for Ocean-based Carbon Dioxide Removal."{" "}
          (5) Captura Corp (2024). "Innovations and cost reductions in Direct Ocean Capture."
        </p>
      </ASection>

    </div>
  );
}
