/**
 * [AI-CONTEXT]
 * Domain: Invoicing Dependency Support
 * Primary Responsibility: Customer and referral dependency helpers for invoice persistence flows.
 * Stability: Keep cross-table dependency lookup logic here so invoiceRepo can stay centered on invoice persistence decisions.
 */
const crypto = require('crypto');

async function findOrCreateCustomer(client, data) {
  const { name, phone, address, createdBy, profilePicture, leadSource, remark, existingCustomerBubbleId } = data;
  if (!name) return null;

  try {
    if (existingCustomerBubbleId) {
      const existingRes = await client.query(
        'SELECT id, customer_id, name, phone, address, profile_picture, lead_source, remark FROM customer WHERE customer_id = $1 LIMIT 1',
        [existingCustomerBubbleId]
      );

      if (existingRes.rows.length > 0) {
        const customer = existingRes.rows[0];
        const id = customer.id;
        const bubbleId = customer.customer_id;

        await client.query(
          `UPDATE customer 
           SET name = COALESCE($1, name),
               phone = COALESCE($2, phone), 
               address = COALESCE($3, address),
               profile_picture = COALESCE($6, profile_picture),
               lead_source = COALESCE($7, lead_source),
               remark = COALESCE($8, remark),
               updated_at = NOW(),
               updated_by = $5
           WHERE id = $4`,
          [name, phone, address, id, String(createdBy), profilePicture, leadSource, remark]
        );
        return { id, bubbleId };
      }
    }

    const findRes = await client.query(
      'SELECT id, customer_id, phone, address, profile_picture, lead_source, remark FROM customer WHERE name = $1 LIMIT 1',
      [name]
    );

    if (findRes.rows.length > 0) {
      const customer = findRes.rows[0];
      const id = customer.id;
      const bubbleId = customer.customer_id;

      if (
        (phone && phone !== customer.phone) ||
        (address && address !== customer.address) ||
        (profilePicture && profilePicture !== customer.profile_picture) ||
        (leadSource && leadSource !== customer.lead_source) ||
        (remark && remark !== customer.remark)
      ) {
        await client.query(
          `UPDATE customer 
           SET phone = COALESCE($1, phone), 
               address = COALESCE($2, address),
               profile_picture = COALESCE($5, profile_picture),
               lead_source = COALESCE($6, lead_source),
               remark = COALESCE($7, remark),
               updated_at = NOW(),
               updated_by = $4
           WHERE id = $3`,
          [phone, address, id, String(createdBy), profilePicture, leadSource, remark]
        );
      }
      return { id, bubbleId };
    }

    const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
    const insertRes = await client.query(
      `INSERT INTO customer (customer_id, name, phone, address, created_by, created_at, updated_at, profile_picture, lead_source, remark)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7, $8)
       RETURNING id`,
      [customerBubbleId, name, phone, address, createdBy, profilePicture, leadSource, remark]
    );
    return { id: insertRes.rows[0].id, bubbleId: customerBubbleId };
  } catch (err) {
    console.error('Error in findOrCreateCustomer:', err);
    return null;
  }
}

async function resolveLinkedReferral(client, userId, referralBubbleId, deps, currentInvoiceBubbleId = null) {
  if (!referralBubbleId) {
    return null;
  }

  const { referralRepo } = deps;
  const referral = await referralRepo.getReferralByBubbleId(client, referralBubbleId);

  if (!referral) {
    throw new Error('Selected referral was not found.');
  }

  const identifiers = await referralRepo.resolveAgentIdentifiers(client, userId);
  const currentAssignment = referral.assigned_agent || referral.linked_agent;

  if (!currentAssignment || !identifiers.includes(String(currentAssignment))) {
    throw new Error('Selected referral is not assigned to you.');
  }

  if (referral.linked_invoice && referral.linked_invoice !== currentInvoiceBubbleId) {
    const invoiceCheck = await client.query(
      `SELECT bubble_id FROM invoice WHERE bubble_id = $1 LIMIT 1`,
      [referral.linked_invoice]
    );

    if (invoiceCheck.rows.length > 0) {
      throw new Error('Selected referral is already linked to another quotation.');
    }
  }

  if (referral.linked_customer_profile) {
    const referrerResult = await client.query(
      `SELECT name
       FROM customer
       WHERE customer_id = $1
       LIMIT 1`,
      [referral.linked_customer_profile]
    );

    referral.referrer_customer_name = referrerResult.rows[0]?.name || null;
  }

  return referral;
}

async function syncReferralInvoiceLink(client, invoiceBubbleId, referralBubbleId) {
  await client.query(
    `UPDATE referral
     SET linked_invoice = NULL,
         updated_at = NOW()
     WHERE linked_invoice = $1
       AND ($2::text IS NULL OR bubble_id <> $2)`,
    [invoiceBubbleId, referralBubbleId || null]
  );

  if (!referralBubbleId) {
    return;
  }

  await client.query(
    `UPDATE referral
     SET linked_invoice = $1,
         updated_at = NOW()
     WHERE bubble_id = $2`,
    [invoiceBubbleId, referralBubbleId]
  );
}

async function fetchInvoiceDependencies(client, data, deps) {
  const {
    getPackageById,
    getTemplateById,
    getDefaultTemplate,
    findOrCreateCustomer
  } = deps;
  const { userId, packageId, customerName, customerPhone, customerAddress, templateId, profilePicture, leadSource, remark } = data;

  let linkedAgent = null;
  try {
    const userRes = await client.query(
      'SELECT linked_agent_profile FROM "user" WHERE id::text = $1 OR bubble_id = $1',
      [String(userId)]
    );
    if (userRes.rows.length > 0) {
      linkedAgent = userRes.rows[0].linked_agent_profile;
    }
  } catch (e) {
    console.warn('[DB] Agent lookup failed during invoice creation for user', userId);
  }

  const pkg = await getPackageById(client, packageId);
  if (!pkg) {
    throw new Error(`Package with ID '${packageId}' not found`);
  }

  const customerResult = await findOrCreateCustomer(client, {
    name: customerName,
    phone: customerPhone,
    address: customerAddress,
    createdBy: userId,
    profilePicture,
    leadSource,
    remark
  });

  const internalCustomerId = customerResult ? customerResult.id : null;
  const customerBubbleId = customerResult ? customerResult.bubbleId : null;

  let template;
  if (templateId) {
    template = await getTemplateById(client, templateId);
  }
  if (!template) {
    template = await getDefaultTemplate(client);
  }

  return { pkg, internalCustomerId, customerBubbleId, template, linkedAgent };
}

module.exports = {
  fetchInvoiceDependencies,
  findOrCreateCustomer,
  resolveLinkedReferral,
  syncReferralInvoiceLink
};
