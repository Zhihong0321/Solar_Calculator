/**
 * Backfill script: Populate invoice_audit_log with historical payment activity
 *
 * Sources:
 *   1. submitted_payment (agent submissions, pending verification)
 *   2. payment (verified payments)
 *
 * Usage:
 *   node scripts/backfill-payment-audit.js [--dry-run] [--batch-size=100]
 *
 * Options:
 *   --dry-run       Preview without inserting
 *   --batch-size    Records per batch (default: 100)
 */

'use strict';

const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE_ARG = process.argv.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split('=')[1], 10) || 100 : 100;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DB_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Resolve invoice.id + invoice_number from bubble_id
async function resolveInvoice(client, bubbleId) {
    if (!bubbleId) return null;
    const r = await client.query(
        'SELECT id, invoice_number, bubble_id FROM invoice WHERE bubble_id = $1 LIMIT 1',
        [bubbleId]
    );
    return r.rows[0] || null;
}

// Resolve user info from various identifiers
async function resolveUser(client, identifier) {
    if (!identifier) return null;
    const r = await client.query(
        `SELECT bubble_id, name, contact, access_level
         FROM "user" 
         WHERE bubble_id = $1 OR id::text = $1 OR contact = $1 OR email = $1
         LIMIT 1`,
        [identifier]
    );
    return r.rows[0] || null;
}

// Build actor info from payment record
function buildActor(submittedByUser, verifiedByUser, recordType) {
    // For submitted_payment: submitted by agent
    // For payment (verified): verified by admin/verifier
    if (recordType === 'submitted_payment' && submittedByUser) {
        return {
            actor_user_id: submittedByUser.bubble_id || null,
            actor_name: submittedByUser.name || 'Agent',
            actor_phone: submittedByUser.contact || null,
            actor_role: Array.isArray(submittedByUser.access_level) 
                ? submittedByUser.access_level.join(', ') 
                : (submittedByUser.access_level || 'agent')
        };
    }
    if (recordType === 'payment' && verifiedByUser) {
        return {
            actor_user_id: verifiedByUser.bubble_id || null,
            actor_name: verifiedByUser.name || 'Verifier',
            actor_phone: verifiedByUser.contact || null,
            actor_role: Array.isArray(verifiedByUser.access_level)
                ? verifiedByUser.access_level.join(', ')
                : (verifiedByUser.access_level || 'admin')
        };
    }
    // Fallback
    return {
        actor_user_id: null,
        actor_name: recordType === 'submitted_payment' ? 'Agent (unknown)' : 'Verifier (unknown)',
        actor_phone: null,
        actor_role: recordType === 'submitted_payment' ? 'agent' : 'admin'
    };
}

// Insert single audit entry
async function insertAuditEntry(client, {
    invoice_id,
    invoice_number,
    entity_type,
    entity_id,
    action_type,
    changes,
    actor_user_id,
    actor_name,
    actor_phone,
    actor_role,
    source_app = 'agent-os',
    edited_at
}) {
    if (DRY_RUN) {
        console.log('[DRY-RUN] Would insert:', {
            invoice_id, entity_type, action_type, entity_id, actor_name, edited_at: edited_at?.toISOString?.() || edited_at
        });
        return { skipped: true };
    }

    const result = await client.query(
        `INSERT INTO invoice_audit_log 
            (invoice_id, invoice_number, entity_type, entity_id, action_type, changes,
             actor_user_id, actor_name, actor_phone, actor_role, source_app, edited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
            invoice_id,
            invoice_number || null,
            entity_type,
            entity_id || null,
            action_type,
            changes ? JSON.stringify(changes) : null,
            actor_user_id || null,
            actor_name || null,
            actor_phone || null,
            actor_role || null,
            source_app,
            edited_at || new Date()
        ]
    );
    return { inserted: result.rowCount > 0, id: result.rows[0]?.id };
}

// Process submitted_payment records
async function backfillSubmittedPayments(client, offset = 0) {
    const { rows } = await client.query(
        `SELECT 
            sp.bubble_id,
            sp.linked_invoice,
            sp.amount,
            sp.payment_method,
            sp.payment_date,
            sp.status,
            sp.created_by,
            sp.created_at,
            sp.epp_month,
            sp.epp_type,
            sp.issuer_bank
        FROM submitted_payment sp
        WHERE sp.linked_invoice IS NOT NULL
        ORDER BY sp.created_at ASC
        LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
    );

    if (rows.length === 0) return { count: 0, done: true };

    let processed = 0;
    let inserted = 0;
    let skipped = 0;

    for (const sp of rows) {
        const invoice = await resolveInvoice(client, sp.linked_invoice);
        if (!invoice) {
            console.log(`[SKIP] submitted_payment ${sp.bubble_id}: invoice not found`);
            skipped++;
            continue;
        }

        const user = await resolveUser(client, sp.created_by);
        const actor = buildActor(user, null, 'submitted_payment');

        const changes = [
            { field: 'Amount', after: sp.amount },
            { field: 'Method', after: sp.payment_method },
            { field: 'Date', after: sp.payment_date },
            { field: 'Status', after: sp.status || 'pending' }
        ];
        if (sp.epp_month) changes.push({ field: 'EPP Tenure', after: sp.epp_month });
        if (sp.epp_type) changes.push({ field: 'EPP Type', after: sp.epp_type });
        if (sp.issuer_bank) changes.push({ field: 'Issuer Bank', after: sp.issuer_bank });

        const result = await insertAuditEntry(client, {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            entity_type: 'submitted_payment',
            entity_id: sp.bubble_id,
            action_type: 'insert',
            changes,
            ...actor,
            edited_at: sp.created_at
        });

        processed++;
        if (result.inserted) inserted++;
    }

    return { count: processed, inserted, skipped, done: rows.length < BATCH_SIZE };
}

// Process verified payment records (legacy payment table)
async function backfillVerifiedPayments(client, offset = 0) {
    const { rows } = await client.query(
        `SELECT 
            p.bubble_id,
            p.linked_invoice,
            p.amount,
            p.payment_method,
            p.payment_date,
            p.created_by,
            p.created_at,
            p.issuer_bank,
            p.verification_date,
            p.verified_by
        FROM payment p
        WHERE p.linked_invoice IS NOT NULL
          AND p.status = 'verified'
        ORDER BY p.created_at ASC
        LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
    );

    if (rows.length === 0) return { count: 0, done: true };

    let processed = 0;
    let inserted = 0;
    let skipped = 0;

    for (const p of rows) {
        const invoice = await resolveInvoice(client, p.linked_invoice);
        if (!invoice) {
            console.log(`[SKIP] payment ${p.bubble_id}: invoice not found`);
            skipped++;
            continue;
        }

        // For verified payments, try to resolve the verifier if available
        const verifier = p.verified_by ? await resolveUser(client, p.verified_by) : null;
        const submitter = p.created_by ? await resolveUser(client, p.created_by) : null;
        
        // Prefer verifier info if available, else submitter
        const actor = verifier 
            ? buildActor(null, verifier, 'payment')
            : buildActor(submitter, null, 'payment');

        const changes = [
            { field: 'Amount', after: p.amount },
            { field: 'Method', after: p.payment_method },
            { field: 'Date', after: p.payment_date },
            { field: 'Status', after: 'verified' }
        ];
        if (p.issuer_bank) changes.push({ field: 'Issuer Bank', after: p.issuer_bank });

        // Use verification_date if available, else created_at, else payment_date
        const editedAt = p.verification_date || p.created_at || p.payment_date;

        const result = await insertAuditEntry(client, {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            entity_type: 'verified_payment',  // Different entity type for verified payments
            entity_id: p.bubble_id,
            action_type: 'insert',
            changes,
            ...actor,
            edited_at: editedAt
        });

        processed++;
        if (result.inserted) inserted++;
    }

    return { count: processed, inserted, skipped, done: rows.length < BATCH_SIZE };
}

// Main execution
async function main() {
    const client = await pool.connect();
    
    try {
        console.log('=== Payment Audit Backfill ===');
        console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no inserts)' : 'LIVE'}`);
        console.log(`Batch size: ${BATCH_SIZE}`);
        console.log('');

        // Verify table exists
        const tableCheck = await client.query(
            `SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'invoice_audit_log' 
             LIMIT 1`
        );
        if (tableCheck.rows.length === 0) {
            console.error('ERROR: invoice_audit_log table does not exist!');
            console.error('Run the migration first: 2026-05-06-create-invoice-audit-log.sql');
            process.exit(1);
        }

        // Phase 1: Submitted payments
        console.log('--- Phase 1: Submitted Payments (pending/unverified) ---');
        let spOffset = 0;
        let spTotal = 0;
        let spInserted = 0;
        
        while (true) {
            const result = await backfillSubmittedPayments(client, spOffset);
            spTotal += result.count;
            spInserted += result.inserted;
            
            if (result.count > 0) {
                console.log(`  Batch: ${result.count} processed, ${result.inserted} inserted, ${result.skipped} skipped`);
            }
            
            if (result.done) break;
            spOffset += BATCH_SIZE;
        }
        
        console.log(`Submitted Payments: ${spTotal} processed, ${spInserted} inserted\n`);

        // Phase 2: Verified payments
        console.log('--- Phase 2: Verified Payments ---');
        let pOffset = 0;
        let pTotal = 0;
        let pInserted = 0;
        
        while (true) {
            const result = await backfillVerifiedPayments(client, pOffset);
            pTotal += result.count;
            pInserted += result.inserted;
            
            if (result.count > 0) {
                console.log(`  Batch: ${result.count} processed, ${result.inserted} inserted, ${result.skipped} skipped`);
            }
            
            if (result.done) break;
            pOffset += BATCH_SIZE;
        }
        
        console.log(`Verified Payments: ${pTotal} processed, ${pInserted} inserted\n`);

        console.log('=== Summary ===');
        console.log(`Total processed: ${spTotal + pTotal}`);
        console.log(`Total inserted: ${spInserted + pInserted}`);
        
        if (DRY_RUN) {
            console.log('\n[DRY RUN] No records were actually inserted.');
            console.log('Remove --dry-run to execute for real.');
        }

    } catch (err) {
        console.error('Fatal error:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
