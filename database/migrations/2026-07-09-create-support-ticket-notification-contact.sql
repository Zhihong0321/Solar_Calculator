CREATE TABLE IF NOT EXISTS support_ticket_notification_contact (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(50) NOT NULL,
  label VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_ticket_notification_contact_phone
  ON support_ticket_notification_contact(phone_number);
