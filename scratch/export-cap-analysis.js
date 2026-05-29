// Demonstrate why export cap makes total savings insensitive to battery efficiency

// Simple scenario
const billBefore = 500;
const exportRate = 0.25;

function calcTotal(beforeBill, netUsage, exportKwh) {
    const afterBill = Math.max(0, netUsage * 0.50); // simplified: 0.50/kWh + fixed
    const exportSavingRaw = exportKwh * exportRate;
    const exportSaving = Math.min(exportSavingRaw, afterBill);
    const billReduction = Math.max(0, beforeBill - afterBill);
    return {
        afterBill,
        exportSavingRaw,
        exportSaving,
        billReduction,
        total: billReduction + exportSaving
    };
}

console.log("Case A: Low net usage (battery very effective)");
console.log("NetUsage | Export | AfterBill | ExportRaw | ExportSaved | BillReduction | TOTAL");
for (const [nu, ex] of [[100, 50], [120, 40], [140, 30]]) {
    const r = calcTotal(billBefore, nu, ex);
    console.log(`${nu.toString().padStart(8)} | ${ex.toString().padStart(6)} | ${r.afterBill.toFixed(2).padStart(9)} | ${r.exportSavingRaw.toFixed(2).padStart(9)} | ${r.exportSaving.toFixed(2).padStart(11)} | ${r.billReduction.toFixed(2).padStart(13)} | ${r.total.toFixed(2)}`);
}

console.log("\nCase B: Higher net usage (battery less effective)");
for (const [nu, ex] of [[200, 200], [220, 180], [240, 160]]) {
    const r = calcTotal(billBefore, nu, ex);
    console.log(`${nu.toString().padStart(8)} | ${ex.toString().padStart(6)} | ${r.afterBill.toFixed(2).padStart(9)} | ${r.exportSavingRaw.toFixed(2).padStart(9)} | ${r.exportSaving.toFixed(2).padStart(11)} | ${r.billReduction.toFixed(2).padStart(13)} | ${r.total.toFixed(2)}`);
}
