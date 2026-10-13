const express = require('express');
const pool = require('../../../core/database/pool');
const tariffPool = require('../../../core/database/tariffPool');
const invoiceRepo = require('../services/invoiceRepo');
const { normalizeSolarEstimateFields } = require('../services/solarEstimateValues');
const { calculateSolarSavings } = require('../../SolarCalculator/services/solarCalculatorService');
const { getBillCycleMetrics } = require('../../SolarCalculator/services/billCycleModeService');

const router = express.Router();
const SOLAR_DEFAULTS = Object.freeze({
  sunPeakHour: 3.4,
  morningUsage: 30,
  smpPrice: 0.2703,
  percentDiscount: 0,
  fixedDiscount: 0,
  batterySize: 0,
  systemPhase: 3,
  panelType: 650
});

function digitsOnly(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : '';
}

function parseOptionalAmount(value, max) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
}

function parseInput(body) {
  const tnbBill = Number(body?.tnbBill);
  const afa = Number(body?.afa);
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : '';
  const customerPhone = typeof body?.customerPhone === 'string' ? body.customerPhone.trim() : '';
  const agentPhone = digitsOnly(body?.agentPhone);
  const discountPercent = parseOptionalAmount(body?.discountPercent, 100);
  const discountFixed = parseOptionalAmount(body?.discountFixed, Number.MAX_SAFE_INTEGER);

  if (!Number.isFinite(tnbBill) || tnbBill <= 0) return { error: 'tnbBill must be a number greater than 0.' };
  if (!Number.isFinite(afa) || afa < -0.5 || afa > 0.5) return { error: 'afa must be between -0.5 and 0.5 RM/kWh.' };
  if (!customerName) return { error: 'customerName is required.' };
  if (!agentPhone) return { error: 'agentPhone is required.' };
  if (Number.isNaN(discountPercent)) return { error: 'discountPercent must be a number between 0 and 100.' };
  if (Number.isNaN(discountFixed)) return { error: 'discountFixed must be a number of 0 or more.' };

  return {
    value: { tnbBill, afa, customerName, customerPhone: customerPhone || null, agentPhone, discountPercent, discountFixed }
  };
}

async function findAgentByPhone(client, phoneDigits) {
  const result = await client.query(
    `SELECT id, bubble_id, name, contact, access_level
     FROM "user"
     WHERE regexp_replace(COALESCE(contact, ''), '\\D', '', 'g') = $1
     LIMIT 2`,
    [phoneDigits]
  );
  return result.rows;
}

router.post('/api/external/v1/invoices', async (req, res) => {
  const parsed = parseInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, error: parsed.error });
  }
  const { tnbBill, afa, customerName, customerPhone, agentPhone, discountPercent, discountFixed } = parsed.value;

  let client;
  try {
    client = await pool.connect();

    const agents = await findAgentByPhone(client, agentPhone);
    if (agents.length === 0) {
      return res.status(404).json({ success: false, error: 'No agent found with this phone number.' });
    }
    if (agents.length > 1) {
      return res.status(409).json({ success: false, error: 'More than one agent uses this phone number.' });
    }
    const agent = agents[0];

    const calculation = await calculateSolarSavings(pool, tariffPool, {
      ...SOLAR_DEFAULTS,
      amount: tnbBill,
      afaRate: afa,
      historicalAfaRate: afa
    });

    const selectedPackage = calculation.selectedPackage;
    if (!selectedPackage?.linked_package) {
      return res.status(422).json({ success: false, error: 'No package matches the recommended system size for this bill.' });
    }

    const cycle = getBillCycleMetrics(calculation, 'fullMonth').selected;
    const estimate = normalizeSolarEstimateFields({
      requestedBillAmount: tnbBill,
      customerAverageTnb: calculation.details?.billBefore,
      estimatedSaving: cycle?.estimated_saving ?? calculation.monthlySavings,
      billAfterSolarBeforeExport: cycle?.bill_after_solar_before_export ?? calculation.details?.billAfter,
      exportEarning: cycle?.export_earning ?? calculation.details?.exportSaving,
      payableAfterSolar: cycle?.estimated_new_bill_amount ?? calculation.details?.estimatedPayableAfterSolar
    });

    const invoice = await invoiceRepo.createInvoiceOnTheFly(client, {
      userId: agent.bubble_id,
      packageId: selectedPackage.linked_package,
      customerName,
      customerPhone,
      extraItems: [],
      discountPercent,
      discountFixed,
      customerAverageTnb: estimate.beforeSolarBill,
      estimatedSaving: estimate.estimatedSaving,
      estimatedNewBillAmount: estimate.estimatedNewBillAmount,
      solarSunPeakHour: SOLAR_DEFAULTS.sunPeakHour,
      solarMorningUsagePercent: SOLAR_DEFAULTS.morningUsage,
      auditContext: {
        userId: agent.bubble_id,
        userName: agent.name,
        userPhone: agent.contact,
        userRole: agent.access_level,
        sourceApp: 'external-api'
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        bubbleId: invoice.bubble_id,
        invoiceNumber: invoice.invoice_number,
        status: invoice.status,
        totalAmount: invoice.total_amount,
        shareToken: invoice.share_token,
        invoiceLink: invoice.share_token ? `/view/${invoice.share_token}` : null,
        packageName: selectedPackage.packageName,
        panelQty: selectedPackage.panelQty,
        estimate: {
          customerAverageTnb: estimate.beforeSolarBill,
          estimatedSaving: estimate.estimatedSaving,
          estimatedNewBillAmount: estimate.estimatedNewBillAmount
        }
      }
    });
  } catch (err) {
    console.error('[External Invoice API] Create failed:', err);
    const status = /exceeds the allowed budget/.test(err.message) ? 422 : 500;
    return res.status(status).json({ success: false, error: err.message || 'Failed to create invoice' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
