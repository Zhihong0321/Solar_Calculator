-- Migration: 014_add_customer_snapshot_isolation.sql

-- 1. Create the customer_snapshot table (JSONB style, matching invoice_snapshot)
CREATE TABLE IF NOT EXISTS public.customer_snapshot (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    snapshot_data JSONB NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_snapshot_customer_id ON public.customer_snapshot(customer_id);

-- 2. Create the function that generates the JSONB snapshot
CREATE OR REPLACE FUNCTION public.create_customer_snapshot_func()
RETURNS TRIGGER AS $$
DECLARE
    v_snapshot_data JSONB;
BEGIN
    -- Construct the Snapshot JSON (Full State)
    v_snapshot_data := jsonb_build_object(
        'meta', jsonb_build_object(
            'generated_at', NOW(),
            'trigger_event', TG_OP,
            'schema_version', 1
        ),
        'customer_details', to_jsonb(NEW) -- Capture the entire row
    );

    -- Insert into customer_snapshot table
    INSERT INTO public.customer_snapshot (
        customer_id,
        version,
        snapshot_data,
        created_by,
        created_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.version, 1),
        v_snapshot_data,
        COALESCE(NEW.updated_by, NEW.created_by, 'system'),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the Trigger
DROP TRIGGER IF EXISTS trg_auto_snapshot_customer ON public.customer;

CREATE TRIGGER trg_auto_snapshot_customer
AFTER INSERT OR UPDATE ON public.customer
FOR EACH ROW
EXECUTE FUNCTION public.create_customer_snapshot_func();
