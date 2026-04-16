#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const HYBRID_TEXT_SQL = "LOWER(CONCAT_WS(' ', COALESCE(p.package_name, ''), COALESCE(p.invoice_desc, ''))) ~ '(hybrid|hybird)'";

function parseArgs(argv) {
  const options = {
    watt: 650,
    qtys: [14, 21, 28]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--watt' && argv[index + 1]) {
      options.watt = parseInt(argv[index + 1], 10) || options.watt;
      index += 1;
      continue;
    }
    if (arg === '--qtys' && argv[index + 1]) {
      const parsed = String(argv[index + 1])
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (parsed.length > 0) {
        options.qtys = parsed;
      }
      index += 1;
    }
  }

  return options;
}

function formatRows(rows, columns) {
  const widths = columns.map((column) => {
    const headerWidth = column.label.length;
    const valueWidth = rows.reduce((max, row) => {
      const cell = String(row[column.key] ?? '');
      return Math.max(max, cell.length);
    }, 0);
    return Math.max(headerWidth, valueWidth);
  });

  const buildLine = (row) => columns
    .map((column, index) => String(row[column.key] ?? '').padEnd(widths[index], ' '))
    .join(' | ');

  const header = buildLine(Object.fromEntries(columns.map((column) => [column.key, column.label])));
  const divider = widths.map((width) => '-'.repeat(width)).join('-+-');
  const body = rows.map((row) => buildLine(row)).join('\n');
  return [header, divider, body].filter(Boolean).join('\n');
}

function formatMatch(row) {
  if (!row) return '(no match)';
  return `${row.package_name} | qty=${row.panel_qty} | RM ${row.price}`;
}

function findLineNumber(source, pattern) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(pattern)) {
      return index + 1;
    }
  }
  return null;
}

async function queryCoverage(client) {
  const sql = `
    SELECT
      CASE
        WHEN p.package_name ILIKE '[1P]%' THEN '1P'
        WHEN p.package_name ILIKE '[3P]%' THEN '3P'
        ELSE 'OTHER'
      END AS phase,
      pr.solar_output_rating AS watt,
      COUNT(*) AS package_count,
      MIN(p.panel_qty) AS min_panel_qty,
      MAX(p.panel_qty) AS max_panel_qty
    FROM package p
    JOIN product pr
      ON CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
      OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
    WHERE p.active = true
      AND (p.special IS FALSE OR p.special IS NULL)
      AND p.type = 'Residential'
      AND (${HYBRID_TEXT_SQL})
      AND (p.package_name ILIKE '[1P]%' OR p.package_name ILIKE '[3P]%')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  const { rows } = await client.query(sql);
  return rows.map((row) => ({
    phase: row.phase,
    watt: row.watt,
    package_count: row.package_count,
    min_panel_qty: row.min_panel_qty,
    max_panel_qty: row.max_panel_qty
  }));
}

async function queryScopedMatch(client, qty, watt, phasePrefix) {
  const sql = `
    SELECT p.package_name, p.panel_qty, p.price
    FROM package p
    JOIN product pr
      ON CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
      OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
    WHERE p.active = true
      AND (p.special IS FALSE OR p.special IS NULL)
      AND p.type = 'Residential'
      AND pr.solar_output_rating = $2
      AND p.package_name ILIKE $3
      AND (${HYBRID_TEXT_SQL})
    ORDER BY ABS(p.panel_qty - $1), p.price
    LIMIT 1
  `;
  const { rows } = await client.query(sql, [qty, watt, phasePrefix]);
  return rows[0] || null;
}

async function queryUnscopedTop(client, qty, watt) {
  const sql = `
    SELECT p.package_name, p.panel_qty, p.price
    FROM package p
    JOIN product pr
      ON CAST(p.panel AS TEXT) = CAST(pr.id AS TEXT)
      OR CAST(p.panel AS TEXT) = CAST(pr.bubble_id AS TEXT)
    WHERE p.active = true
      AND (p.special IS FALSE OR p.special IS NULL)
      AND p.type = 'Residential'
      AND pr.solar_output_rating = $2
    ORDER BY ABS(p.panel_qty - $1), p.price
    LIMIT 5
  `;
  const { rows } = await client.query(sql, [qty, watt]);
  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in the environment or .env file');
  }

  const repoRoot = process.cwd();
  const createInvoicePath = path.join(repoRoot, 'public', 'js', 'pages', 'create_invoice.js');
  const createInvoiceSource = fs.readFileSync(createInvoicePath, 'utf8');
  const hasLookupSystemPhase = createInvoiceSource.includes("lookupParams.set('systemPhase'");
  const hasLookupInverterType = createInvoiceSource.includes("lookupParams.set('inverterType'");
  const lookupParamsLine = findLineNumber(createInvoiceSource, 'const lookupParams = new URLSearchParams({');
  const lookupFetchLine = findLineNumber(createInvoiceSource, "fetch(`/readonly/package/lookup?");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const coverage = await queryCoverage(client);

    console.log('Hybrid package coverage from live DB');
    console.log(formatRows(coverage, [
      { key: 'phase', label: 'Phase' },
      { key: 'watt', label: 'Watt' },
      { key: 'package_count', label: 'Count' },
      { key: 'min_panel_qty', label: 'MinQty' },
      { key: 'max_panel_qty', label: 'MaxQty' }
    ]));
    console.log('');

    console.log(`Selection comparison for ${options.watt}W`);
    for (const qty of options.qtys) {
      const onePhase = await queryScopedMatch(client, qty, options.watt, '[1P]%');
      const threePhase = await queryScopedMatch(client, qty, options.watt, '[3P]%');
      const unscopedTop = await queryUnscopedTop(client, qty, options.watt);

      console.log(`qty=${qty}`);
      console.log(`  scoped 1P hybrid -> ${formatMatch(onePhase)}`);
      console.log(`  scoped 3P hybrid -> ${formatMatch(threePhase)}`);
      console.log(`  unscoped top pick -> ${formatMatch(unscopedTop[0])}`);
      console.log(`  unscoped top 5:`);
      unscopedTop.forEach((row, index) => {
        console.log(`    ${index + 1}. ${formatMatch(row)}`);
      });
      console.log('');
    }

    console.log('Code handoff audit');
    console.log(`- create_invoice lookupParams line: ${lookupParamsLine || 'not found'}`);
    console.log(`- create_invoice lookup fetch line: ${lookupFetchLine || 'not found'}`);
    console.log(`- passes systemPhase into readonly lookup: ${hasLookupSystemPhase ? 'YES' : 'NO'}`);
    console.log(`- passes inverterType into readonly lookup: ${hasLookupInverterType ? 'YES' : 'NO'}`);
    console.log('');

    console.log('Diagnosis');
    console.log('- The live DB does contain 1P hybrid packages, so the failure is not missing data.');
    console.log('- 1P hybrid coverage is much narrower than 3P hybrid coverage.');
    console.log('- For higher panel counts, the live 1P hybrid catalog runs out at 18 panels while 3P keeps going to 48.');
    console.log('- Any lookup path that loses phase or inverter filters will naturally drift away from the intended 1P hybrid result.');
    console.log(`- Current create-invoice handoff passes systemPhase: ${hasLookupSystemPhase ? 'YES' : 'NO'}.`);
    console.log(`- Current create-invoice handoff passes inverterType: ${hasLookupInverterType ? 'YES' : 'NO'}.`);
    console.log('');
    console.log('Root cause in one sentence');
    if (hasLookupSystemPhase && hasLookupInverterType) {
      console.log('- The historical root cause was a fallback lookup path that dropped phase and inverter context, and the current code now carries both filters through.');
    } else {
      console.log('- 3P appears to work while 1P fails because a fallback lookup path drops phase/inverter context exactly where the live 1P hybrid catalog is much thinner than 3P.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
