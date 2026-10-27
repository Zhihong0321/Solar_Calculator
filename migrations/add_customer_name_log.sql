-- Migration: customer.log records every customer name edit
-- A trigger appends one line per name change, so edits from every app (Agent OS, Admin OS, SEDA form,
-- direct SQL) are captured, not only the code paths in this repo.
-- Line format matches payment.log: "[<UTC ISO time>] <actor> changed Name from <old> to <new>"
-- Actor: app.user_name (set by the audit context), else app.user_id, else customer.updated_by,
-- else the connection's application_name.

ALTER TABLE customer ADD COLUMN IF NOT EXISTS log TEXT;

CREATE OR REPLACE FUNCTION append_customer_name_log()
RETURNS TRIGGER AS $$
DECLARE
    actor TEXT;
BEGIN
    IF NEW.name IS NOT DISTINCT FROM OLD.name THEN
        RETURN NEW;
    END IF;

    actor := COALESCE(
        NULLIF(current_setting('app.user_name', true), ''),
        NULLIF(current_setting('app.user_id', true), ''),
        NULLIF(NEW.updated_by, ''),
        NULLIF(current_setting('application_name', true), ''),
        'system'
    );

    NEW.log := CONCAT_WS(
        E'\n',
        NULLIF(OLD.log, ''),
        format(
            '[%s] %s changed Name from %s to %s',
            to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            actor,
            COALESCE(OLD.name, '(empty)'),
            COALESCE(NEW.name, '(empty)')
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_name_log ON customer;
CREATE TRIGGER trg_customer_name_log
    BEFORE UPDATE OF name ON customer
    FOR EACH ROW
    EXECUTE FUNCTION append_customer_name_log();
