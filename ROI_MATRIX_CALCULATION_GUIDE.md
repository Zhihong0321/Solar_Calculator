# ROI Matrix Calculation - Technical Guide for AI Agents

> **Purpose**: This document explains the complete flow of calculating Solar ROI Matrix from TNB Bill input to final savings projection. Use this to implement similar functionality in NEW APP.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Data Flow Diagram](#2-data-flow-diagram)
3. [Step 1: TNB Bill Input & Tariff Lookup](#3-step-1-tnb-bill-input--tariff-lookup)
4. [Step 2: Panel Quantity Recommendation](#4-step-2-panel-quantity-recommendation)
5. [Step 3: Solar Generation Calculation](#5-step-3-solar-generation-calculation)
6. [Step 4: Energy Flow & Savings Logic](#6-step-4-energy-flow--savings-logic)
7. [Step 5: Financial Calculations](#7-step-5-financial-calculations)
8. [Database Schema & Queries](#8-database-schema--queries)
9. [Key Formulas Summary](#9-key-formulas-summary)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Overview & Architecture

The ROI Matrix calculator helps users understand their potential solar savings by:

1. **Input**: User enters their monthly TNB bill amount (MYR)
2. **Reverse Lookup**: System finds the closest matching tariff to determine their kWh usage
3. **System Sizing**: Recommends optimal panel quantity based on usage and sun hours
4. **Package Selection**: Finds matching solar package from database
5. **Savings Projection**: Calculates bill reduction + export earnings
6. **ROI Output**: Payback period, monthly/annual savings, system cost

### Two Calculator Types

| Aspect | Domestic (Residential) | Commercial (Non-Domestic) |
|--------|------------------------|---------------------------|
| **Tariff Table** | `tnb_tariff_2025` | `bill_simulation_lookup` |
| **Tariff Type** | Residential tiers | `LV_COMMERCIAL` |
| **Usage Model** | Morning % split | Per-day working hours |
| **Load Model** | Simple day/night | Base + Operational load |
| **Hourly Calc** | Simplified | Hour-by-hour simulation |
| **Battery Support** | Yes | No |

---

## 2. Data Flow Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User Input     │────▶│  Find Closest    │────▶│  Get Monthly    │
│  TNB Bill (MYR) │     │  Tariff Record   │     │  Usage (kWh)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                          ┌───────────────────────────────┘
                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Calculate ROI  │◀────│  Find Package    │◀────│  Recommend      │
│  Payback Period │     │  by Panel Qty    │     │  Panel Quantity │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Output Results │────▶│  Bill Reduction  │────▶│  Export Credit  │
│  Monthly Savings│     │  (Offset)        │     │  (NEM NOVA)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 3. Step 1: TNB Bill Input & Tariff Lookup

### 3.1 Input Parameters

```javascript
{
  amount: 350.00,           // Monthly TNB bill in MYR (required)
  sunPeakHour: 3.4,         // Sun peak hours (3.0 - 4.5)
  morningUsage: 30,         // Daytime usage % (1 - 100)
  panelType: 620,           // Panel wattage (450 - 850)
  smpPrice: 0.2703,         // Export rate (0.19 - 0.3703)
  afaRate: 0.0000,          // AFA charge rate (optional)
  batterySize: 0,           // Battery kWh (optional)
  systemPhase: 3            // 1-phase or 3-phase
}
```

### 3.2 Find Closest Tariff (By Bill Amount)

**Logic**: Find the tariff record where the adjusted total is closest to but NOT EXCEEDING the input amount.

```sql
-- DOMESTIC (Residential)
SELECT *, 
  (COALESCE(bill_total_normal, 0)::numeric + (COALESCE(usage_kwh, 0)::numeric * $afaRate)) as adjusted_total
FROM tnb_tariff_2025
WHERE (COALESCE(bill_total_normal, 0)::numeric + (COALESCE(usage_kwh, 0)::numeric * $afaRate)) <= $inputAmount::numeric
ORDER BY adjusted_total DESC
LIMIT 1;
```

```sql
-- COMMERCIAL (Non-Domestic)
SELECT * FROM bill_simulation_lookup 
WHERE tariff_group = 'LV_COMMERCIAL' 
  AND total_bill <= $inputAmount
ORDER BY total_bill DESC 
LIMIT 1;
```

**Fallback Logic**: If no match found, return the lowest tariff record.

### 3.3 Extract Monthly Usage

```javascript
// From the matched tariff record
const monthlyUsageKwh = tariff.usage_kwh;  // e.g., 850 kWh
```

**Key Output from Step 1**:
- `monthlyUsageKwh`: The estimated monthly electricity consumption
- `billBreakdown`: Detailed bill components (usage, network, capacity, SST, etc.)

---

## 4. Step 2: Panel Quantity Recommendation

### 4.1 The Formula

```javascript
// DOMESTIC Formula (Server-side)
const recommendedPanelsRaw = Math.floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62);
const recommendedPanels = Math.max(1, recommendedPanelsRaw);

// COMMERCIAL Formula (80% coverage target)
const targetMonthlyGen = monthlyUsageKwh * 0.8;  // Target 80% coverage
const sunPeakStandard = 3.4;
const recommendedKw = targetMonthlyGen / 30 / sunPeakStandard;
const recommendedPanels = Math.max(1, Math.ceil((recommendedKw * 1000) / panelRating));
```

### 4.2 Formula Breakdown

| Component | Description |
|-----------|-------------|
| `monthlyUsageKwh` | Monthly consumption from tariff lookup |
| `sunPeakHour` | Average daily sun peak hours (3.0 - 4.5) |
| `30` | Days per month |
| `0.62` | Efficiency factor (62% system efficiency) |
| `/ 1000` | Convert Watts to kilowatts |

### 4.3 Manual Override

Users can override the recommended panel quantity:

```javascript
const actualPanelQty = overridePanels !== null ? overridePanels : recommendedPanels;
```

---

## 5. Step 3: Package Selection & System Cost

### 5.1 Query Package by Panel Quantity

```sql
-- DOMESTIC Package Lookup
SELECT p.*
FROM package p
JOIN product pr ON (
  CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
  OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
)
WHERE p.panel_qty = $panelQty
  AND p.active = true
  AND (p.special IS FALSE OR p.special IS NULL)
  AND p.type = 'Residential'
  AND pr.solar_output_rating = $panelWattage
ORDER BY p.price ASC
LIMIT 1;
```

```sql
-- COMMERCIAL Package Lookup
SELECT p.*
FROM package p
WHERE p.panel_qty = $panelQty
  AND p.active = true
  AND (p.type = 'Tariff B&D Low Voltage' OR p.type = 'Residential')
ORDER BY p.price ASC
LIMIT 1;
```

### 5.2 System Size Calculation

```javascript
const panelWatts = panelType;  // e.g., 620W
const systemSizeKwp = (actualPanelQty * panelWatts) / 1000;  // e.g., 12.4 kWp

// SEDA Registration Fee Check
const sedaLimit = systemPhase === 1 ? 5 : 15;  // 5kW for 1-phase, 15kW for 3-phase
const requiresSedaFee = systemSizeKwp > sedaLimit;  // RM 1,000 fee if exceeded
```

### 5.3 System Cost with Discounts

```javascript
const systemCostBeforeDiscount = selectedPackage.price;

// Apply percentage discount first
const percentDiscountAmount = (systemCostBeforeDiscount * percentDiscount) / 100;
const priceAfterPercent = systemCostBeforeDiscount - percentDiscountAmount;

// Then apply fixed discount
const fixedDiscountAmount = fixedDiscount;
const finalSystemCost = Math.max(0, priceAfterPercent - fixedDiscountAmount);

const totalDiscountAmount = systemCostBeforeDiscount - finalSystemCost;
```

---

## 6. Step 4: Energy Flow & Savings Logic

### 6.1 Solar Generation Calculation

```javascript
// Daily and Monthly Generation
const dailySolarGeneration = (actualPanelQty * panelWatts * sunPeakHour) / 1000;  // kWh
const monthlySolarGeneration = dailySolarGeneration * 30;  // kWh/month
```

### 6.2 Consumption Split (DOMESTIC)

```javascript
// Split usage between morning (self-consumption) and evening
const morningUsageKwh = (monthlyUsageKwh * morningPercent) / 100;
const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);

// Remaining usage after morning offset
const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
```

### 6.3 Energy Flow Logic (ATAP Solar Malaysia Rules)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ENERGY FLOW DIAGRAM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Solar Generation                                                  │
│   ├─▶ Morning Self-Consumption (offsets morning usage)             │
│   ├─▶ Battery Charging (if battery installed)                      │
│   ├─▶ Export to Grid (capped at reduced import)                    │
│   └─▶ Backup Generation (10% buffer for weather)                   │
│       └─▶ Excess = Donated to Grid                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.4 Export Calculation (NEM NOVA)

```javascript
// Export is capped at the reduced import from grid
const potentialExport = Math.max(0, monthlySolarGeneration - morningUsageKwh - monthlyMaxDischarge);
const exportKwh = Math.min(potentialExport, netUsageKwh);

// Backup generation (weather buffer)
const exceededGeneration = Math.max(0, potentialExport - exportKwh);
const backupGenerationKwh = Math.min(exceededGeneration, netUsageKwh * 0.1);
const donatedKwh = Math.max(0, exceededGeneration - backupGenerationKwh);
```

### 6.5 Battery Logic (if applicable)

```javascript
// Daily excess solar available for battery
const dailyExcessSolar = Math.max(0, monthlySolarGeneration - morningUsageKwh) / 30;
const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;
const dailyBatteryCap = batterySizeVal;

// Battery discharge is limited by: excess solar, night usage, and battery capacity
const dailyMaxDischarge = Math.min(dailyExcessSolar, dailyNightUsage, dailyBatteryCap);
const monthlyMaxDischarge = dailyMaxDischarge * 30;
```

### 6.6 COMMERCIAL: Hourly Simulation

```javascript
// Hourly solar generation distribution
const HOURLY_SOLAR_MAP = {
    7: 0.02,   // 2% at 7am
    8: 0.05,   // 5% at 8am
    9: 0.09,   // 9% at 9am
    10: 0.12,  // 12% at 10am
    11: 0.15,  // 15% at 11am
    12: 0.16,  // 16% at noon (peak)
    13: 0.15,  // 15% at 1pm
    14: 0.12,  // 12% at 2pm
    15: 0.08,  // 8% at 3pm
    16: 0.04,  // 4% at 4pm
    17: 0.02   // 2% at 5pm
};

// For each hour of each day
for (let hour = 0; hour < 24; hour++) {
    const solarGenPct = HOURLY_SOLAR_MAP[hour] || 0;
    const hourlySolarGen = dailyGenKwh * solarGenPct;
    
    // Determine load based on working hours
    const isWorking = hour >= dayStart && hour < dayEnd;
    const currentLoad = isWorking ? (hourlyBaseLoad + hourlyOperationalLoad) : hourlyBaseLoad;
    
    // Apply consumption cap (1.5x safety factor)
    const consumptionCap = currentLoad * 1.5;
    
    const offset = Math.min(hourlySolarGen, consumptionCap);
    const exportAmt = Math.max(0, hourlySolarGen - consumptionCap);
}
```

---

## 7. Step 5: Financial Calculations

### 7.1 Lookup New Tariff (After Solar)

```sql
-- Find tariff matching the REDUCED usage
SELECT * FROM tnb_tariff_2025
WHERE usage_kwh <= $netUsageKwh
ORDER BY usage_kwh DESC
LIMIT 1;
```

### 7.2 Bill Reduction Calculation

```javascript
// Get bill breakdowns
const beforeBreakdown = buildBillBreakdown(originalTariff, afaRate);
const afterBreakdown = buildBillBreakdown(newTariff, afaRate);

const billBefore = beforeBreakdown.total;
const billAfter = afterBreakdown.total;
const billReduction = Math.max(0, billBefore - billAfter);

// AFA (Adjustment Factor A) savings
const usageReduction = monthlyUsageKwh - netUsageKwh;
const afaSaving = usageReduction * afaRate;
const baseBillReduction = billReduction - afaSaving;
```

### 7.3 Export Credit Calculation

```javascript
// Export rate depends on remaining usage tier
// If net usage > 1500 kWh, use 0.3703, otherwise use SMP price
const exportRate = netUsageKwh > 1500 ? 0.3703 : smpPrice;

const exportSaving = exportKwh * exportRate;
const backupGenerationSaving = backupGenerationKwh * exportRate;
```

### 7.4 Total Monthly Savings

```javascript
const totalMonthlySavings = billReduction + exportSaving;

// Annual projection
const annualSavings = totalMonthlySavings * 12;
```

### 7.5 ROI & Payback Calculation

```javascript
// ROI Percentage
const roiPercent = (totalMonthlySavings * 12 / finalSystemCost) * 100;

// Payback Period (years)
const paybackPeriod = finalSystemCost / (totalMonthlySavings * 12);

// Example output:
// ROI: 18.5%
// Payback: 5.4 years
```

---

## 8. Database Schema & Queries

### 8.1 Table: `tnb_tariff_2025` (Domestic)

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `usage_kwh` | integer | Monthly consumption |
| `bill_total_normal` | numeric | Total bill amount |
| `usage_normal` | numeric | Usage charge component |
| `network` | numeric | Network charge |
| `capacity` | numeric | Capacity charge |
| `sst_normal` | integer | SST component |
| `eei` | numeric | Energy Efficiency Index |
| `kwtbb_normal` | integer | KWTBB fund |
| `retail` | integer | Retail component |

### 8.2 Table: `bill_simulation_lookup` (Commercial)

| Column | Type | Description |
|--------|------|-------------|
| `tariff_group` | text | 'LV_COMMERCIAL' |
| `usage_kwh` | numeric | Monthly consumption |
| `total_bill` | numeric | Total bill amount |
| `energy_charge` | numeric | Energy component |
| `retail_charge` | numeric | Retail component |
| `capacity_charge` | numeric | Capacity charge |
| `network_charge` | numeric | Network charge |
| `kwtbb_fund` | numeric | KWTBB fund |
| `sst_tax` | numeric | SST component |

### 8.3 Table: `package`

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `bubble_id` | text | External identifier |
| `package_name` | text | Package name |
| `panel_qty` | integer | Number of panels |
| `price` | numeric | System cost (MYR) |
| `panel` | text | Reference to product |
| `type` | text | 'Residential' or 'Tariff B&D Low Voltage' |
| `active` | boolean | Is package active |
| `special` | boolean | Special package flag |
| `max_discount` | integer | Max discount % allowed |

### 8.4 Table: `product`

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `bubble_id` | text | External identifier |
| `name` | text | Product name |
| `solar_output_rating` | integer | Panel wattage (W) |

### 8.5 Essential SQL Queries

```sql
-- Get all active packages with panel wattage
SELECT p.*, pr.solar_output_rating
FROM package p
JOIN product pr ON (
  CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
  OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
)
WHERE p.active = true
ORDER BY p.price ASC;

-- Get all tariffs (for client-side caching)
SELECT usage_kwh, usage_normal, network, capacity, sst_normal, 
       eei, bill_total_normal, retail, kwtbb_normal 
FROM tnb_tariff_2025 
ORDER BY usage_kwh ASC;

-- Find package by quantity and wattage
SELECT p.*
FROM package p
JOIN product pr ON CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
WHERE p.panel_qty = $1
  AND p.active = true
  AND pr.solar_output_rating = $2
ORDER BY p.price ASC
LIMIT 1;
```

---

## 9. Key Formulas Summary

### Panel Recommendation
```
Domestic:   panels = floor(usage_kwh / sun_peak / 30 / 0.62)
Commercial: panels = ceil((usage_kwh * 0.8 / 30 / 3.4 * 1000) / panel_wattage)
```

### Solar Generation
```
daily_gen_kwh = (panel_qty * panel_watts * sun_peak_hours) / 1000
monthly_gen_kwh = daily_gen_kwh * 30
system_size_kwp = (panel_qty * panel_watts) / 1000
```

### Energy Flow
```
morning_self_consumption = min(monthly_gen, morning_usage_kwh)
net_usage = max(0, usage_kwh - morning_self_consumption - battery_discharge)
export_kwh = min(excess_solar, net_usage)  // Capped at reduced import
backup_gen = min(excess_after_export, net_usage * 0.1)
```

### Financial
```
bill_reduction = bill_before - bill_after
export_savings = export_kwh * export_rate
total_monthly_savings = bill_reduction + export_savings
annual_savings = total_monthly_savings * 12
payback_years = system_cost / annual_savings
roi_percent = (annual_savings / system_cost) * 100
```

### Export Rate Logic
```
if net_usage_kwh > 1500:
    export_rate = 0.3703  // Higher tier rate
else:
    export_rate = smp_price  // Usually 0.2703
```

---

## 10. Implementation Checklist

### Backend Requirements

- [ ] PostgreSQL database connection pool
- [ ] `tnb_tariff_2025` table for domestic tariffs
- [ ] `bill_simulation_lookup` table for commercial tariffs
- [ ] `package` table with panel quantities and pricing
- [ ] `product` table with panel wattage specifications
- [ ] API endpoint: `GET /api/calculate-bill?amount={amount}`
- [ ] API endpoint: `GET /api/solar-calculation` (with all params)
- [ ] API endpoint: `GET /api/all-data` (for client-side caching)

### Frontend Requirements

- [ ] Bill amount input form
- [ ] Bill breakdown display component
- [ ] Sun peak hour input (3.0 - 4.5)
- [ ] Morning usage % slider (1 - 100)
- [ ] Panel rating selector
- [ ] SMP price input (0.19 - 0.3703)
- [ ] Panel quantity display with +/- controls
- [ ] System cost display
- [ ] Monthly savings display
- [ ] Payback period display
- [ ] ROI percentage display

### Validation Rules

| Field | Min | Max | Default |
|-------|-----|-----|---------|
| Bill Amount | 1 | - | - |
| Sun Peak Hour | 3.0 | 4.5 | 3.4 |
| Morning Usage % | 1 | 100 | 30 |
| Panel Rating | 400 | 850 | 620 |
| SMP Price | 0.19 | 0.3703 | 0.2703 |
| Battery Size | 0 | 100 | 0 |

### Key Constants

```javascript
const CONSTANTS = {
    EFFICIENCY_FACTOR: 0.62,           // 62% system efficiency
    DAYS_PER_MONTH: 30,
    WEEKS_PER_MONTH: 4.33,             // 52 weeks / 12 months
    EXPORT_RATE_HIGH_TIER: 0.3703,     // For >1500 kWh usage
    SMP_DEFAULT: 0.2703,               // Standard export rate
    MORNING_USAGE_RATE: 0.4869,        // Rate for morning offset
    SEDA_LIMIT_1PHASE: 5,              // kW limit for 1-phase
    SEDA_LIMIT_3PHASE: 15,             // kW limit for 3-phase
    BACKUP_GENERATION_CAP: 0.10,       // 10% of reduced import
    CONSUMPTION_CAP_MULTIPLIER: 1.5    // Commercial safety factor
};
```

---

## Appendix A: Confidence Level Calculation

The confidence level decreases as sun peak hours exceed the standard 3.4h:

```javascript
let confidenceLevel = 90;  // Base confidence
if (sunPeakHour > 3.4) {
    const diff = sunPeakHour - 3.4;
    const penalty = (diff / 0.1) * 7;  // -7% per 0.1h above 3.4
    confidenceLevel = Math.max(0, 90 - penalty);
}
// Example: 4.0h → 90 - ((0.6/0.1)*7) = 48% confidence
```

## Appendix B: Output Data Structure

```javascript
{
  // Configuration
  config: {
    sunPeakHour: 3.4,
    morningUsage: 30,
    panelType: 620,
    smpPrice: 0.2703,
    afaRate: 0
  },
  
  // System Specs
  recommendedPanels: 20,
  actualPanels: 20,
  solarConfig: "20 x 620W panels (12.4 kW system)",
  systemSizeKwp: "12.4",
  requiresSedaFee: false,
  
  // Financial Summary
  monthlySavings: "1250.00",
  systemCostBeforeDiscount: "45000.00",
  finalSystemCost: "45000.00",
  paybackPeriod: "3.0",
  
  // Details
  details: {
    monthlyUsageKwh: 2000,
    monthlySolarGeneration: "2604.00",
    morningUsageKwh: "600.00",
    morningSaving: "292.14",
    exportKwh: "1600.00",
    exportSaving: "432.48",
    netUsageKwh: "800.00",
    billBefore: "850.00",
    billAfter: "350.00",
    billReduction: "500.00"
  },
  
  // Package Info
  selectedPackage: {
    packageName: "ATAP Premium 12kW",
    panelQty: 20,
    price: "45000.00",
    panelWattage: 620
  }
}
```

---

**End of Document**

For questions or clarifications, refer to the source code:
- Domestic: `src/modules/SolarCalculator/services/solarCalculatorService.js`
- Commercial: `public/js/non-domestic.js`
- Routes: `src/modules/SolarCalculator/api/routes.js`
