const fs = require('fs');

const html = `
<style>
/* Auto Reveal Styles */
.card.locked { opacity: 1 !important; pointer-events: auto !important; }
.card.collapsed .card-body { display: block !important; }
.loading-spinner { display: none !important; }
</style>
<script>
// Mock data for preview
const MOCK_TARIFF = {
    usage_kwh: 950, usage_normal: 180.50, network: 50.00, capacity: 10.00, retail: 5.00,
    eei: -12.00, sst_normal: 20.00, kwtbb_normal: 8.00, bill_total_normal: 480.00, fuel_adjustment: 20.00
};
const MOCK_DATA = {
    details: {
        billBefore: 500, billAfter: 150, actualEeiSaving: 12, exportSaving: 80, billReduction: 350,
        estimatedPayableAfterSolar: 70
    },
    monthlySavings: 430,
    confidenceLevel: 92,
    paybackPeriod: "3.5",
    finalSystemCost: 18000,
    requiresSedaFee: true,
    config: { systemPhase: 3, panelType: 650 },
    systemSizeKwp: 6.5,
    actualPanels: 10,
    billBreakdownComparison: {
        items: [
            { label: 'SST', before: 20, after: 5 },
            { label: 'Capacity Fee', before: 10, after: 10 },
            { label: 'Usage', before: 450, after: 135 },
            { label: 'Network', before: 50, after: 50 }
        ]
    },
    selectedPackage: { packageName: "Premium Solar 6.5kW" },
    totalDiscountAmount: 0
};

// Override fetch to return mock data if it runs, but we also inject directly
window.fetch = async () => ({ ok: true, json: async () => MOCK_DATA });

// Force reveal immediately
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('billAmount').value = 500;
    document.getElementById('card2').classList.remove('locked');
    document.getElementById('card3').classList.remove('locked');
    document.getElementById('card4').classList.remove('locked');
    document.getElementById('card5').classList.remove('locked');
    
    // Actually we can just call the render functions with mock data!
    if (typeof renderBillBreakdown === 'function') renderBillBreakdown(MOCK_TARIFF, 0);
    if (typeof renderROICard === 'function') {
        selectedBillCycleMode = 'fullMonth';
        renderROICard(MOCK_DATA);
    }
});
</script>
`;
console.log(html);
