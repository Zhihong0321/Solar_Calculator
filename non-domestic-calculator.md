# Non-Domestic (Commercial) Solar Calculator - Specification Document

## Overview

This document explains the **Commercial/Non-Domestic Solar Calculator** logic for building a similar version. This calculator is designed for **Low Voltage General Commercial** tariffs ( shops, offices, small commercial buildings) as opposed to residential/domestic users.

---

## 1. Core Concept & User Flow

The calculator follows a **two-phase analysis**:

### Phase 1: Bill Intake & Reverse Lookup
1. User enters their **monthly TNB bill amount** (RM)
2. System looks up the closest matching commercial tariff from the database
3. Returns the **bill breakdown** (energy charge, retail, capacity, network, KWTBB, SST)
4. Extracts the **monthly usage (kWh)** from the matched record

### Phase 2: Solar Simulation & ROI Analysis
1. User configures **simulation parameters**:
   - Sun peak hours (3.0 - 4.5 hours)
   - Panel rating/wattage (e.g., 620W)
   - Building base load percentage
   - SMP export price (RM/kWh)
   - **Working hours per day** (Monday-Sunday, individual sliders)
2. System calculates recommended system size
3. Performs hourly modeling for each day of the week
4. Calculates savings from:
   - Direct bill reduction (offset consumption)
   - Export earnings (NEM NOVA)
5. Displays ROI including payback period

---

## 2. Database Schema

### Commercial Tariff Table (`bill_simulation_lookup`)

| Column | Description |
|--------|-------------|
| `tariff_group` | 'LV_COMMERCIAL' for commercial tariff |
| `usage_kwh` | Monthly consumption in kWh |
| `energy_charge` | Base energy cost (RM) |
| `retail_charge` | Retail charge component (RM) |
| `capacity_charge` | Capacity/demand charge (RM) |
| `network_charge` | Network transmission charge (RM) |
| `kwtbb_fund` | KWTBB fund contribution (RM) |
| `sst_tax` | Sales & Service Tax (RM) |
| `total_bill` | Total monthly bill (RM) |

### Package Table (`package`)

| Column | Description |
|--------|-------------|
| `id` / `bubble_id` | Package identifiers |
| `package_name` | Display name |
| `panel_qty` | Number of panels in package |
| `price` | System cost (RM) |
| `panel` | Reference to product ID |
| `type` | 'Tariff B&D Low Voltage' or 'Residential' |
| `active` | Boolean flag |

### Product Table (`product`)

| Column | Description |
|--------|-------------|
| `id` / `bubble_id` | Product identifiers |
| `solar_output_rating` | Panel wattage (W) |
| `name` | Product name |

---

## 3. Calculation Logic

### 3.1 Phase 1: Reverse Bill Lookup

**Input:** Monthly bill amount (RM)

**Query Logic:**
```sql
SELECT * FROM bill_simulation_lookup 
WHERE tariff_group = 'LV_COMMERCIAL' 
  AND total_bill <= $input_amount 
ORDER BY total_bill DESC 
LIMIT 1
```

**Fallback:** If no match, return the lowest tariff record.

**Output:**
- `usage_kwh`: Monthly consumption
- All bill component breakdowns
- `total_bill`: Matched bill amount

---

### 3.2 Phase 2: System Sizing

**Inputs:**
- `totalMonthlyKwh`: From Phase 1 lookup
- `sunPeak`: Sun peak hours (default 3.4)
- `panelRating`: Panel wattage in Watts (default 620)

**Calculation:**
```javascript
// Target 80% coverage of monthly usage
const targetMonthlyGen = totalMonthlyKwh * 0.8;

// Calculate required kWp
const sunPeakStandard = 3.4;
const recommendedKw = targetMonthlyGen / 30 / sunPeakStandard;

// Convert to number of panels
const recommendedPanels = Math.max(1, Math.ceil((recommendedKw * 1000) / panelRating));
```

**Package Selection:**
```javascript
// Find package with panel_qty >= recommendedPanels
// Filter: type = 'Tariff B&D Low Voltage' OR 'Residential'
// Sort by panel_qty ascending
// Fallback: closest match if no exact match
```

**System Specs:**
```javascript
finalPanels = pkg ? pkg.panel_qty : recommendedPanels;
systemSizeKwp = (finalPanels * panelRating) / 1000;
dailyGenKwh = systemSizeKwp * sunPeak;
```

---

### 3.3 Phase 2: Load Profile Modeling

**Inputs:**
- `baseLoadPercent`: Base load as % of total (default 1% = 0.01)
- `workingHours`: Object with start/end for each day

**Calculate Weekly Working Hours:**
```javascript
weeklyWorkingHours = sum of (end - start) for all 7 days
```

**Load Components:**
```javascript
// Base load runs 24/7 (e.g., security, refrigeration, servers)
hourlyBaseLoad = (totalMonthlyKwh * baseLoadPercent) / 720; // 720 = hours in 30 days

// Operational load only during working hours
hourlyOperationalLoad = weeklyWorkingHours > 0 
    ? (totalMonthlyKwh * (1 - baseLoadPercent)) / (weeklyWorkingHours * 4.33)
    : 0;
```

**Hourly Solar Generation Map:**
```javascript
HOURLY_SOLAR_MAP = {
    7: 0.02,   // 2% of daily yield
    8: 0.05,   // 5%
    9: 0.09,   // 9%
    10: 0.12,  // 12%
    11: 0.15,  // 15%
    12: 0.16,  // 16% (peak)
    13: 0.15,  // 15%
    14: 0.12,  // 12%
    15: 0.08,  // 8%
    16: 0.04,  // 4%
    17: 0.02   // 2%
}
// Hours 0-6 and 18-23 = 0% generation
```

---

### 3.4 Phase 2: Hourly Simulation (Per Day)

For each day (Monday-Sunday):
```javascript
dayOffset = 0;  // Self-consumed solar
dayExport = 0;  // Exported to grid

for (hour = 0 to 23) {
    // Determine if within working hours
    isWorking = (hour >= dayStart) && (hour < dayEnd);
    
    // Calculate load for this hour
    currentLoad = isWorking 
        ? (hourlyBaseLoad + hourlyOperationalLoad) 
        : hourlyBaseLoad;
    
    // Cap consumption at 1.5x calculated load (safety factor)
    consumptionCap = currentLoad * 1.5;
    
    // Calculate solar generation for this hour
    solarGenPct = HOURLY_SOLAR_MAP[hour] || 0;
    hourlySolarGen = dailyGenKwh * solarGenPct;
    
    // Offset = min(solar generation, consumption cap)
    offset = Math.min(hourlySolarGen, consumptionCap);
    
    // Export = excess after offset
    exportAmt = Math.max(0, hourlySolarGen - consumptionCap);
    
    dayOffset += offset;
    dayExport += exportAmt;
}
```

**Weekly Aggregation:**
```javascript
weeklyOffsetKwh = sum of dayOffset for all 7 days
weeklyExportKwh = sum of dayExport for all 7 days

monthlyOffsetKwh = weeklyOffsetKwh * 4.33;  // 4.33 weeks/month
monthlyExportKwh = weeklyExportKwh * 4.33;
newTotalUsageKwh = max(0, totalMonthlyKwh - monthlyOffsetKwh);
```

---

### 3.5 Phase 2: New Bill Calculation

**Lookup new tariff by reduced usage:**
```sql
SELECT * FROM bill_simulation_lookup 
WHERE tariff_group = 'LV_COMMERCIAL' 
  AND usage_kwh <= $newTotalUsageKwh 
ORDER BY usage_kwh DESC 
LIMIT 1
```

**Calculate Savings:**
```javascript
oldBill = matchedBillData.total_bill;
newBill = newBillData.total_bill;

billSaving = oldBill - newBill;
exportEarnings = monthlyExportKwh * smpPrice;
totalMonthlySavings = billSaving + exportEarnings;
```

---

### 3.6 Phase 2: ROI Calculation

```javascript
// System cost from package or estimate
systemCost = pkg ? pkg.price : (systemSizeKwp * 3500); // RM 3500/kWp fallback

// Payback period in years
paybackYears = systemCost / (totalMonthlySavings * 12);
```

---

## 4. API Endpoints Required

### 4.1 Commercial Bill Lookup by Amount
```
GET /api/commercial/calculate-bill?amount={billAmount}
```
**Returns:** Full tariff record with all bill components

### 4.2 Commercial Bill Lookup by Usage
```
GET /api/commercial/lookup-by-usage?usage={kWh}
```
**Returns:** Tariff record matching the reduced usage

### 4.3 Package Lookup
```
GET /api/packages?type=Tariff%20B&D%20Low%20Voltage
```
**Returns:** List of commercial packages with pricing

### 4.4 Get All Data (Initialization)
```
GET /api/all-data
```
**Returns:** Tariffs and packages for client-side caching

---

## 5. Input Validation Rules

| Field | Range | Default |
|-------|-------|---------|
| Bill Amount | > 0 | - |
| Sun Peak Hour | 3.0 - 4.5 | 3.4 |
| Panel Rating | 400 - 800 W | 620 |
| Base Load % | 0 - 100% | 1% |
| SMP Price | 0 - 0.50 RM | 0.20 |
| Working Hours | 0 - 24 per day | 8:00-18:00 |

---

## 6. Output Data Structure

### System Specification
```javascript
{
    systemSizeKwp: 12.40,        // Total kWp
    finalPanels: 20,             // Number of panels
    panelRating: 620,            // Watts per panel
    monthlyGen: 1264.8,          // Monthly generation (kWh)
    monthlyOffsetKwh: 850,       // Self-consumed (kWh)
    monthlyExportKwh: 414.8,     // Exported (kWh)
    efficiency: 67%              // Direct offset efficiency
}
```

### Daily Yield Data
```javascript
[
    { day: "Monday", offset: 28.5, export: 12.3 },
    { day: "Tuesday", offset: 28.5, export: 12.3 },
    // ... (different for each day based on working hours)
]
```

### Savings Analysis
```javascript
{
    oldBill: { total_bill: 5000.00, usage_kwh: 8000 },
    newBill: { total_bill: 2500.00, usage_kwh: 4000 },
    billSaving: 2500.00,         // From bill reduction
    exportEarnings: 414.80,      // From export credit
    totalMonthlySavings: 2914.80 // Combined
}
```

### ROI Summary
```javascript
{
    systemCost: 45000.00,        // Package price
    paybackYears: 1.3,           // Years to break even
    annualSavings: 34977.60      // totalMonthlySavings * 12
}
```

---

## 7. Key Differences from Domestic Calculator

| Aspect | Domestic | Commercial |
|--------|----------|------------|
| **Tariff Table** | `tnb_tariff_2025` | `bill_simulation_lookup` |
| **Tariff Type** | Residential tiers | `LV_COMMERCIAL` |
| **Working Hours** | Simple morning % | Per-day configurable |
| **Load Model** | Morning/Evening split | Base load + Operational load |
| **Hourly Calc** | Simplified | Hour-by-hour simulation |
| **Package Type** | `Residential` | `Tariff B&D Low Voltage` |
| **Bill Components** | Usage, Network, Capacity, SST, EEI, AFA | Energy, Retail, Capacity, Network, KWTBB, SST |
| **Battery Support** | Yes | No (typically) |

---

## 8. UI Components Required

1. **Bill Input Form**
   - Tariff category dropdown (LV_COMMERCIAL)
   - Monthly bill amount input

2. **Simulation Parameters**
   - Sun peak hours input
   - Panel rating input
   - Base load percentage input
   - SMP price input

3. **Working Hours Sliders**
   - 7 rows (Monday-Sunday)
   - Dual-thumb range slider per day (start time, end time)
   - "Close" button to set day off (0-0)
   - Visual highlight between thumbs

4. **Results Display**
   - Matched bill breakdown table
   - System specification card
   - Daily yield visualization (stacked bar chart)
   - Savings breakdown (before/after bill)
   - Export earnings card
   - Pie chart (bill reduction vs export credit)
   - Total economic benefit highlight
   - Payback period

---

## 9. Formula Summary

```
// System Sizing
recommendedKw = (monthlyKwh * 0.8) / 30 / 3.4
recommendedPanels = ceil((recommendedKw * 1000) / panelWattage)

// Load Modeling
hourlyBaseLoad = (monthlyKwh * baseLoadPct) / 720
hourlyOperationalLoad = (monthlyKwh * (1 - baseLoadPct)) / (weeklyHours * 4.33)

// Hourly Generation
hourlySolarGen = dailyGenKwh * HOURLY_SOLAR_MAP[hour]

// Monthly Totals
monthlyOffset = weeklyOffset * 4.33
monthlyExport = weeklyExport * 4.33

// Savings
billSaving = oldBill - newBill
exportEarnings = monthlyExport * smpPrice
totalSavings = billSaving + exportEarnings

// ROI
payback = systemCost / (totalSavings * 12)
```

---

## 10. Important Notes

1. **No Battery Logic**: Commercial calculator typically doesn't include battery storage calculations (unlike domestic)

2. **Consumption Cap**: Hourly consumption is capped at 1.5x the calculated load to prevent unrealistic offset calculations

3. **Weeks per Month**: Use 4.33 weeks (52 weeks / 12 months) for monthly projections from weekly data

4. **Fallback Pricing**: If no package found, use RM 3,500 per kWp as rough estimate

5. **Tariff Matching**: Always find the closest tariff WITHOUT exceeding the input amount (use `<=` and `DESC` ordering)

6. **Day Off Handling**: When a day is "closed", set start=0, end=0 (only base load applies for 24 hours)
