const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:WZnCkFsqaiMpYjliaJcJzBLelEplpZJA@shinkansen.proxy.rlwy.net:24032/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // 1. Show ALL tables in the database
    const tables = await pool.query(
      "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename"
    );
    console.log('=== ALL TABLES IN DATABASE ===');
    console.log('Total tables:', tables.rows.length);
    console.log('');
    tables.rows.forEach(r => console.log(`  ${r.schemaname}.${r.tablename}`));

    // 2. Search for anything content/book/article/post/page related
    console.log('\n=== SEARCH FOR CONTENT-RELATED TABLES ===');
    const contentSearch = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename ILIKE '%content%' OR tablename ILIKE '%book%' OR tablename ILIKE '%article%' OR tablename ILIKE '%post%' OR tablename ILIKE '%page%' OR tablename ILIKE '%writing%' OR tablename ILIKE '%sermon%' OR tablename ILIKE '%devotion%')"
    );
    if (contentSearch.rows.length === 0) {
      console.log('  NONE FOUND. Zero content-related tables exist.');
    } else {
      contentSearch.rows.forEach(r => console.log(' ', r.tablename));
    }

    // 3. Show all databases available
    console.log('\n=== ALL DATABASES ON THIS SERVER ===');
    const dbs = await pool.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname");
    dbs.rows.forEach(r => console.log(' ', r.datname));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

main();
