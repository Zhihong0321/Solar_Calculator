const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function readSedaRegistrationSchema() {
  try {
    await client.connect();
    console.log('✅ Connected to production database\n');

    // Get all columns with full details
    const columnsQuery = `
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        numeric_precision,
        datetime_precision,
        is_nullable,
        column_default,
        udt_name
      FROM information_schema.columns
      WHERE table_name = 'seda_registration'
      ORDER BY ordinal_position;
    `;
    
    const columnsResult = await client.query(columnsQuery);
    
    if (columnsResult.rows.length === 0) {
      console.log('❌ Table seda_registration does not exist!');
      await client.end();
      return;
    }

    console.log('=== SEDA_REGISTRATION TABLE STRUCTURE ===\n');
    console.log(`Found ${columnsResult.rows.length} columns:\n`);
    console.log('COLUMN_NAME | DATA_TYPE | PRECISION | NULLABLE | DEFAULT');
    console.log('─'.repeat(120));
    
    columnsResult.rows.forEach(col => {
      const precision = col.numeric_precision || col.datetime_precision || col.character_maximum_length || 'N/A';
      console.log(`${col.column_name.padEnd(35)} | ${col.data_type.padEnd(20)} | ${precision.toString().padEnd(9)} | ${col.is_nullable.padEnd(10)} | ${col.column_default || 'NULL'}`);
    });

    // Get indexes
    const indexQuery = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'seda_registration'
      ORDER BY indexname;
    `;
    
    const indexResult = await client.query(indexQuery);
    console.log('\n\n=== INDEXES ===\n');
    if (indexResult.rows.length > 0) {
      indexResult.rows.forEach(idx => {
        console.log(`${idx.indexname}`);
        console.log(`  ${idx.indexdef}`);
      });
    } else {
      console.log('No indexes found');
    }

    // Get constraints
    const constraintQuery = `
      SELECT conname, contype, conkey, confkey, confrelid
      FROM pg_constraint
      WHERE conrelid = 'seda_registration'::regclass;
    `;
    
    const constraintResult = await client.query(constraintQuery);
    console.log('\n\n=== CONSTRAINTS ===\n');
    if (constraintResult.rows.length > 0) {
      constraintResult.rows.forEach(con => {
        console.log(`${con.conname} (${con.contype})`);
        console.log(`  Columns (conkey): ${JSON.stringify(con.conkey)}`);
        if (con.confkey) {
          console.log(`  Referenced (confkey): ${JSON.stringify(con.confkey)}`);
        }
      });
    } else {
      console.log('No constraints found');
    }

    // Get row count
    const countQuery = `SELECT COUNT(*) as row_count FROM seda_registration;`;
    const countResult = await client.query(countQuery);
    console.log(`\n\nTotal rows: ${countResult.rows[0].row_count}`);

    // Get sample data structure (first row)
    console.log('\n\n=== SAMPLE DATA (First Row) ===\n');
    
    const sampleQuery = `SELECT * FROM seda_registration LIMIT 1;`;
    const sampleResult = await client.query(sampleQuery);
    
    if (sampleResult.rows.length > 0) {
      console.log(JSON.stringify(sampleResult.rows[0], null, 2));
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  } finally {
    await client.end();
    console.log('\n✅ Database connection closed');
  }
}

readSedaRegistrationSchema();
