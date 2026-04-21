/**
 * [AI-CONTEXT]
 * Domain: Invoicing Schema Support
 * Primary Responsibility: Cached schema introspection helpers for invoicing persistence code.
 * Stability: Keep this file business-rule free so repository files stay focused on data access flows.
 */
const tablePresenceCache = new Map();

async function getInvoiceColumns(client) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoice'`
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function hasTable(client, tableName) {
  if (tablePresenceCache.has(tableName)) {
    return tablePresenceCache.get(tableName);
  }

  const result = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );

  const exists = result.rows.length > 0;
  tablePresenceCache.set(tableName, exists);
  return exists;
}

async function getTableColumns(client, tableName) {
  const cacheKey = `${tableName}:columns`;
  if (tablePresenceCache.has(cacheKey)) {
    return tablePresenceCache.get(cacheKey);
  }

  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  tablePresenceCache.set(cacheKey, columns);
  return columns;
}

module.exports = {
  getInvoiceColumns,
  getTableColumns,
  hasTable
};
