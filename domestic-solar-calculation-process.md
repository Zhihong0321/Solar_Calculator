# Domestic Solar Calculation Process

This file documents the exact calculation flow used by `/domestic`, which serves `public/domestic-v4.html`.

It is written as a step-by-step process from user input to displayed output.

## 1. Entry point

- Route: `/domestic`
- Served file: `public/domestic-v4.html`
- Bill analysis API: `GET /api/calculate-bill`
- Solar plan API: `GET /api/solar-calculation`

## 2. Frontend inputs on `/domestic`

The page starts from these defaults:

```js
const DEFAULT_INPUTS = {
  billAmount: '500',
  historicalAfaRate: '-0.0047',
  systemPhase: 3,
  inverterType: 'string',
  sunPeakHour: '3.4',
  morningUsage: '30',
  overridePanels: '',
  panelType: '650',
  smpPrice: '0.2703',
  afaRate: '0.0000',
  percentDiscount: '0',
  fixedDiscount: '0',
  suriaRebate: true,
  batterySize: 0,
  batteryLossPercent: 0,
  batteryDodPercent: 5
};
```

### 2.1 Step 1 inputs used for bill matching

- `billAmount`: monthly TNB bill input
- `historicalAfaRate`: AFA used only to match the current bill to a tariff row

Only these two fields are used by `/api/calculate-bill`.

### 2.2 Step 3 inputs used for solar calculation

- `sunPeakHour`
- `morningUsage`
- `panelType`
- `smpPrice`
- `afaRate`
- `percentDiscount`
- `fixedDiscount`
- `suriaRebate`
- `batterySize`
- `batteryLossPercent`
- `batteryDodPercent`
- optional `overridePanels`
- `systemPhase`: 1-phase or 3-phase
- `inverterType`: `string` or `hybrid`

## 3. Step 1: bill analysis

When the user presses **Analyse Bill**, the page calls:

```text
/api/calculate-bill?amount=<billAmount>&afaRate=<historicalAfaRate>
```

Backend behavior:

1. `findClosestTariff()` searches `domestic_am_tariff`
2. It compares the input bill against:

```text
adjusted_total =
  (total_bill - fuel_adjustment)
  + (usage_kwh * historicalAfaRate)
```

3. It returns the closest tariff row not exceeding the target bill
4. If nothing matches, it falls back to the lowest tariff row

### 3.1 Bill breakdown shown on screen

Frontend builds the displayed bill breakdown from the matched tariff:

- `usageKwh = tariff.usage_kwh`
- `usage = energy_charge || usage_normal`
- `network = network_charge || network`
- `capacity = capacity_charge || capacity`
- `retail = retail_charge || retail`
- `eei = energy_efficiency_incentive || eei`
- `sst = sst_tax || sst_normal`
- `kwtbb = kwtbb_fund || kwtbb_normal`
- `fuelAdjustment = fuel_adjustment`
- `afa = usageKwh * historicalAfaRate`
- `total = (total_bill || bill_total_normal) + afa`

This step gives the current bill breakdown and the baseline monthly usage in kWh.

## 4. Step 2: collect solar-calculation request

When the user presses **Generate ROI**, the frontend sends:

```js
{
  amount,
  sunPeakHour,
  morningUsage,
  panelType,
  smpPrice,
  afaRate,
  historicalAfaRate,
  percentDiscount,
  fixedDiscount: fixedDiscount + suriaAmount,
  systemPhase,
  inverterType,
  batterySize,
  batteryLossPercent,
  batteryDodPercent,
  overridePanels // only if valid
}
```

Where:

- `suriaAmount = 3000` if SuRIA is checked, otherwise `0`

## 5. Backend validation in `calculateSolarSavings()`

The backend validates:

- `amount > 0`
- `sunPeakHour` between `3.0` and `4.5`
- `morningUsage` between `1` and `100`
- `smpPrice` between `0.19` and `0.2703`
- `batterySize` in `{0, 16, 32, 48}`

It then opens:

- one tariff DB client
- one main DB client

## 6. Base tariff and base monthly usage

If no future usage override is provided:

1. backend calls `findClosestTariff()` using:
   - `amount`
   - `historicalAfaRate`
2. monthly usage is taken from:

```text
monthlyUsageKwh = tariff.usage_kwh
```

So the user does not directly type kWh.
The bill input is first converted into a tariff row, then that tariff row provides the monthly usage.

## 7. Panel recommendation and panel quantity

Recommended panel quantity is:

```text
recommendedPanelsRaw = floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62)
recommendedPanels = max(1, recommendedPanelsRaw)
```

Panel gate:

- `min = 1`
- `max = recommendedPanels + 20`

Actual panel quantity:

- if `overridePanels` is provided, use it
- otherwise use `recommendedPanels`
- if gate is active, clamp override into `[min, max]`

## 8. Package lookup

Backend then calls `lookupBestPackage()` using:

- `panelQty = actualPanelQty`
- `panelBubbleId`
- `panelType = panelWattage`
- `type = Residential`
- `systemPhase`
- `inverterType`

This returns the selected package used for costing and quotation link generation.

## 9. Solar generation

Let:

- `panelWatts = panelType`
- `systemSizeKwp = (actualPanelQty * panelWatts) / 1000`

Then:

```text
dailySolarGeneration = (actualPanelQty * panelWatts * sunPeakHour) / 1000
monthlySolarGeneration = dailySolarGeneration * 30
```

SEDA oversize flag:

- if `systemPhase == 1`, SEDA limit is `5 kWp`
- if `systemPhase == 3`, SEDA limit is `15 kWp`
- `requiresSedaFee = systemSizeKwp > sedaLimit`

## 10. Morning offset / morning usage

This is one of the most important parts.

`morningUsage` is not applied to household load first.
It is applied to **monthly solar generation**:

```text
morningUsageKwh = (monthlySolarGeneration * morningUsagePercent) / 100
morningSelfConsumption = min(monthlySolarGeneration, morningUsageKwh)
```

Night usage used by battery logic:

```text
dailyNightUsage = max(0, monthlyUsageKwh - morningUsageKwh) / 30
```

## 11. Battery flow

Battery helper input:

- `monthlySolarGeneration`
- `morningUsageKwh`
- `dailyNightUsageKwh`
- `batterySize`
- `batteryLossPercent`
- `batteryDodPercent`

Key battery formulas:

```text
nonOffsetSolarKwh = max(0, monthlySolarGeneration - morningUsageKwh)
dailyNonOffsetSolarKwh = nonOffsetSolarKwh / 30

roundTripEfficiency = max(0, 1 - batteryLossPercent / 100)
oneWayEfficiency = sqrt(roundTripEfficiency)

usableBatteryCapacityKwh = max(0, batterySize * (1 - batteryDodPercent / 100))

dailyInputNeededForFullBatteryKwh = usableBatteryCapacityKwh / oneWayEfficiency
dailyInputNeededForNightLoadKwh = dailyNightUsageKwh / roundTripEfficiency

dailySolarToBatteryInputKwh =
  min(dailyNonOffsetSolarKwh, dailyInputNeededForFullBatteryKwh, dailyInputNeededForNightLoadKwh)

dailyStoredInternalKwh = dailySolarToBatteryInputKwh * oneWayEfficiency
dailyBatteryDeliveredKwh = min(dailyStoredInternalKwh * oneWayEfficiency, dailyNightUsageKwh)

monthlySolarToBatteryInputKwh = dailySolarToBatteryInputKwh * 30
monthlyBatteryStoredKwh = dailyBatteryDeliveredKwh * 30
```

Important outputs:

- `monthlySolarToBatteryInputKwh`
- `monthlyBatteryStoredKwh`

## 12. Baseline path: no battery

This is the comparison path used to measure battery value-add later.

```text
netUsageBaseline = max(0, monthlyUsageKwh - morningSelfConsumption)
```

Potential export before battery:

```text
potentialExportBaseline = max(0, monthlySolarGeneration - morningUsageKwh)
exportKwhBaseline = min(potentialExportBaseline, netUsageBaseline)
```

Excess and backup:

```text
exceededGenerationBaseline = max(0, potentialExportBaseline - exportKwhBaseline)
backupGenerationBaseline = min(exceededGenerationBaseline, netUsageBaseline * 0.1)
donatedKwhBaseline = max(0, exceededGenerationBaseline - backupGenerationBaseline)
```

Net import after export offset:

```text
netImportBaselineKwh = max(0, netUsageBaseline - exportKwhBaseline)
```

## 13. Main path: with battery

Usage after morning offset and battery discharge:

```text
netUsageKwh = max(0, monthlyUsageKwh - morningSelfConsumption - monthlyBatteryStoredKwh)
```

Potential export after sending some solar into battery:

```text
potentialExport = max(0, monthlySolarGeneration - morningUsageKwh - monthlySolarToBatteryInputKwh)
exportKwh = min(potentialExport, netUsageKwh)
```

Excess and backup:

```text
exceededGeneration = max(0, potentialExport - exportKwh)
backupGenerationKwh = min(exceededGeneration, netUsageKwh * 0.1)
donatedKwh = max(0, exceededGeneration - backupGenerationKwh)
```

Net import after export offset:

```text
netImportKwh = max(0, netUsageKwh - exportKwh)
```

This `netImportKwh` is returned as:

```text
details.actualUsageForEeiKwh
```

## 14. Tariff lookup after solar

The calculator looks up tariff rows again based on usage after solar.

For the main path:

```text
afterTariff = lookupTariffByUsage(floor(netUsageKwh))
```

For baseline:

```text
baselineTariff = lookupTariffByUsage(floor(netUsageBaseline))
```

## 15. Export income

Morning saving uses a fixed energy rate:

```text
morningUsageRate = 0.4869
morningSaving = morningUsageKwh * (morningUsageRate + afaRate)
```

Export rate:

```text
exportRate = netUsageKwh > 1500 ? 0.3703 : smpPrice
exportRateBaseline = netUsageBaseline > 1500 ? 0.3703 : smpPrice
```

Export values:

```text
exportSavingRaw = exportKwh * exportRate
backupGenerationSaving = backupGenerationKwh * exportRate
exportSavingBaselineRaw = exportKwhBaseline * exportRateBaseline
```

## 16. Bill breakdown before and after solar

The service builds breakdown objects using:

- usage charge
- network charge
- capacity charge
- SST
- EEI
- AFA

Total formula inside `buildBillBreakdown()`:

```text
afa = usageKwh * afaRate

baseTotal =
  if stored total exists:
    total_bill - fuel_adjustment - originalEei + eei
  else:
    usage + network + capacity + sst + eei

total = baseTotal + afa
```

## 17. EEI handling

EEI rate:

```text
eeiRatePerKwh = eeiAmount / usage_kwh
```

Actual EEI after solar is not the tariff row's original EEI total.
It is recalculated using net import:

```text
actualEei = eeiRatePerKwh * netImportKwh
```

If `netImportKwh <= 0`, EEI becomes `0`.

Same logic exists for baseline using `netImportBaselineKwh`.

## 18. Original bill, bill after solar, and total monthly savings

### 18.1 Original bill

The original bill shown by the solar result is:

```text
billBefore = beforeBreakdown.total
```

This is the matched bill from the pre-solar tariff row, with projected AFA applied.

### 18.2 Bill after solar before export credit

Main path:

```text
afterBill = afterBreakdown.total
```

This is the bill after solar usage reduction and EEI recalculation, but before subtracting export income.

### 18.3 Bill reduction

```text
actualEeiSaving = beforeEei - afterEei
grossBillReduction = max(0, billBefore - afterBill)
billReduction = max(0, grossBillReduction - actualEeiSaving)
```

This means bill reduction and EEI saving are tracked separately.

### 18.4 Export credit actually counted

```text
exportSaving =
  if afterBill exists:
    min(exportSavingRaw, afterBill)
  else:
    exportSavingRaw
```

### 18.5 Total monthly savings

This is the exact formula used by `/domestic`:

```text
totalMonthlySavings = billReduction + actualEeiSaving + exportSaving
```

### 18.6 Payable bill after solar

This is the exact main-path payable amount:

```text
estimatedPayableAfterSolar =
  if afterBill exists:
    max(0, afterBill - exportSavingRaw)
  else:
    max(0, billBefore - (billReduction + actualEeiSaving + exportSaving))
```

So:

- **original bill** = `billBefore`
- **bill after solar before export** = `afterBill`
- **bill after solar payable** = `estimatedPayableAfterSolar`

## 19. Costing and payback

If a package is found:

```text
systemCostBeforeDiscount = package.price
percentDiscountAmount = systemCostBeforeDiscount * percentDiscount / 100
priceAfterPercent = systemCostBeforeDiscount - percentDiscountAmount
finalSystemCost = max(0, priceAfterPercent - fixedDiscount)
totalDiscountAmount = systemCostBeforeDiscount - finalSystemCost
```

Payback:

```text
paybackPeriod = finalSystemCost / (totalMonthlySavings * 12)
```

If savings or final cost are not positive, payback becomes `N/A`.

## 20. Confidence level

The page returns a confidence score:

```text
base = 90
if sunPeakHour > 3.4:
  penalty = ((sunPeakHour - 3.4) / 0.1) * 7
  confidenceLevel = max(0, 90 - penalty)
else:
  confidenceLevel = 90
```

## 21. Bill cycle toggle on `/domestic`

The page has two display modes:

- `fullMonth`
- `under28Days`

`fullMonth` uses the returned result directly.

`under28Days` recalculates SST on the frontend/backend helper:

```text
shortCycleSstBase = after.usage + after.network + after.capacity
recalculatedSst = shortCycleSstBase * 0.08
under28BillAfter = max(0, fullBillAfter - currentSst + recalculatedSst)
under28GrossBillReduction = max(0, billBefore - under28BillAfter)
under28BillReduction = max(0, under28GrossBillReduction - actualEeiSaving)
under28TotalSavings = under28BillReduction + actualEeiSaving + exportSaving
under28PayableAfterSolar = max(0, under28BillAfter - exportSaving)
```

## 22. Exact energy-flow rendering on `/domestic`

The display card does not use a separate backend energy-flow object.
It derives the visual bars from `solarResult.details` and `solarResult.details.battery`.

### 22.1 Values used

- `usage = details.monthlyUsageKwh`
- `generated = details.monthlySolarGeneration`
- `exportKwh = details.exportKwh`
- `gridImport = details.actualUsageForEeiKwh`
- `batteryDischarge = details.battery.monthlyStoredKwh`

### 22.2 Derived display values

```text
solarToHome = max(0, usage - gridImport)
directSolar = max(0, solarToHome - batteryDischarge)

selfPct =
  generated > 0
    ? round((max(0, directSolar + batteryDischarge) / generated) * 100)
    : 0

exportPct =
  generated > 0
    ? max(0, 100 - selfPct)
    : 0

fromSolarPct =
  usage > 0
    ? round((solarToHome / usage) * 100)
    : 0
```

### 22.3 What the card shows

Solar Output block:

- total solar generation = `generated`
- self-use bar = `directSolar + batteryDischarge`
- self-use % = `selfPct`
- export bar = `exportKwh`
- export % = `exportPct`
- FiT income = `savingsBreakdown.exportCredit`

Home Consumption block:

- total home consumption = `usage`
- solar bar = `solarToHome`
- solar % = `fromSolarPct`
- grid import bar = `gridImport`
- grid import % = `100 - fromSolarPct`
- backup generation = `details.backupGenerationKwh`

## 23. Frontend cards mapped to backend outputs

### 23.1 Savings hero

- monthly savings displayed = selected bill-cycle `totalSavings`

### 23.2 Before vs after card

- before bill = `solarResult.details.billBefore`
- after bill = selected bill-cycle `payableAfterSolar`

### 23.3 Savings breakdown card

Uses:

- `savingsBreakdown.billReduction`
- `savingsBreakdown.eeiSaving`
- `savingsBreakdown.exportCredit`
- `details.actualEei`
- `details.actualEeiRatePerKwh`
- `details.exportKwh`
- `details.effectiveExportRate`

### 23.4 Quotation link output

When creating quotation:

- `customer_average_tnb = details.billBefore`
- `estimated_saving = activeCycle.totalSavings`
- `estimated_new_bill_amount = activeCycle.payableAfterSolar`
- `solar_sun_peak_hour = config.sunPeakHour`
- `solar_morning_usage_percent = config.morningUsage`

## 24. End-to-end summary

The full `/domestic` flow is:

1. User enters monthly bill and historical AFA month
2. System matches the bill to a tariff row
3. Matched tariff row gives baseline `usage_kwh`
4. User enters sun peak hour, morning offset, panel rating, AFA projection, discounts, battery settings
5. System calculates recommended panel quantity
6. System looks up the matching residential package
7. System calculates monthly solar generation
8. System converts morning offset into `morningUsageKwh` from solar generation
9. System runs battery flow logic
10. System computes:
    - post-offset usage
    - export
    - backup generation
    - donated energy
    - net import
11. System re-looks up tariff after solar
12. System recalculates EEI using net import
13. System builds before/after bill breakdowns
14. System calculates:
    - bill reduction
    - EEI saving
    - export credit
    - total monthly savings
    - payable bill after solar
15. Frontend derives energy-flow bars from `details` and `battery` fields
16. Frontend optionally recalculates `<28 Days` mode by replacing SST only
17. Frontend displays:
    - original bill
    - bill after solar
    - monthly savings
    - energy flow
    - savings breakdown
    - package cost
    - payback

## 25. Inputs and outputs requested in plain form

### Inputs

- Bill input: `billAmount`
- Sunpeak hours: `sunPeakHour`
- Morning offset: `morningUsage`
- AFA:
  - `historicalAfaRate` for matching the current bill
  - `afaRate` for projected solar calculation
- Panel rating: `panelType`
- Panel quantity:
  - recommended by formula
  - or overridden by `overridePanels`

### Main outputs

- Original bill: `details.billBefore`
- Bill after solar before export: `details.billAfter`
- Bill after solar payable: `details.estimatedPayableAfterSolar`
- Monthly savings: `monthlySavings`
- Export kWh: `details.exportKwh`
- Net grid import: `details.actualUsageForEeiKwh`
- Backup generation: `details.backupGenerationKwh`
