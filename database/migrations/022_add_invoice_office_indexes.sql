-- Reduce invoice office load latency by indexing the columns used by its
-- invoice/item/payment ownership and SEDA lookup queries.

CREATE INDEX IF NOT EXISTS idx_invoice_linked_customer
ON invoice(linked_customer);

CREATE INDEX IF NOT EXISTS idx_invoice_linked_package
ON invoice(linked_package);

CREATE INDEX IF NOT EXISTS idx_invoice_created_by
ON invoice(created_by);

CREATE INDEX IF NOT EXISTS idx_invoice_linked_agent
ON invoice(linked_agent);

CREATE INDEX IF NOT EXISTS idx_invoice_item_linked_invoice
ON invoice_item(linked_invoice);

CREATE INDEX IF NOT EXISTS idx_payment_linked_invoice
ON payment(linked_invoice);

CREATE INDEX IF NOT EXISTS idx_customer_name
ON customer(name);

CREATE INDEX IF NOT EXISTS idx_seda_registration_linked_invoice
ON seda_registration USING GIN(linked_invoice);
