-- Migration: 012_migrate_snapshot_logic_to_db_trigger.sql

-- 1. Create the function that generates the JSONB snapshot
CREATE OR REPLACE FUNCTION public.create_invoice_snapshot_func()
RETURNS TRIGGER AS $$
DECLARE
    v_customer JSONB;
    v_agent JSONB;
    v_items JSONB;
    v_snapshot_data JSONB;
    v_invoice_id INTEGER;
    v_invoice_bubble_id TEXT;
BEGIN
    -- Determine if we are in an INSERT or UPDATE
    v_invoice_id := NEW.id;
    v_invoice_bubble_id := NEW.bubble_id;

    -- 1. Fetch Linked Customer Details
    -- We try to fetch from the 'customer' table using the link.
    -- If link is null, we default to empty/null.
    SELECT jsonb_build_object(
        'name', c.name,
        'phone', c.phone,
        'email', c.email,
        'address', c.address,
        'customer_id', c.customer_id
    ) INTO v_customer
    FROM public.customer c
    WHERE c.customer_id = NEW.linked_customer;

    -- 2. Fetch Linked Agent Name
    SELECT jsonb_build_object(
        'name', a.name,
        'bubble_id', a.bubble_id
    ) INTO v_agent
    FROM public.agent a
    WHERE a.bubble_id = NEW.linked_agent;

    -- 3. Fetch All Invoice Items
    -- We aggregate them into a JSON array.
    SELECT jsonb_agg(jsonb_build_object(
        'description', ii.description,
        'title', ii.inv_item_type, -- Using item type as 'title' or category
        'qty', ii.qty,
        'amount', ii.amount,       -- Total for this line item
        'unit_price', ii.unit_price
    )) INTO v_items
    FROM public.invoice_item ii
    WHERE ii.linked_invoice = v_invoice_bubble_id;

    -- 4. Construct the Final Snapshot JSON
    v_snapshot_data := jsonb_build_object(
        'meta', jsonb_build_object(
            'generated_at', NOW(),
            'trigger_event', TG_OP
        ),
        'invoice_details', jsonb_build_object(
            'invoice_number', NEW.invoice_number,
            'total_amount', NEW.total_amount,
            'date', NEW.invoice_date,
            'status', NEW.status
        ),
        'customer', COALESCE(v_customer, '{}'::jsonb),
        'agent', COALESCE(v_agent, '{}'::jsonb),
        'items', COALESCE(v_items, '[]'::jsonb)
    );

    -- 5. Insert into invoice_snapshot table
    -- We check if a snapshot for this specific version/state already exists to avoid spamming?
    -- For "Total Isolation" safety, we just log it. 
    -- We can rely on the app to manage 'version' incrementing, or just log every change.
    -- Given the user's request for robustness, we log every significant change.
    
    INSERT INTO public.invoice_snapshot (
        invoice_id,
        version,
        snapshot_data,
        created_by,
        created_at
    ) VALUES (
        v_invoice_id,
        COALESCE(NEW.version, 1),
        v_snapshot_data,
        COALESCE(NEW.created_by, 'system'),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the Trigger
-- We use AFTER INSERT OR UPDATE.
-- Note: items must exist for them to be snapshot. 
-- If the App inserts Invoice -> Then Items, the Insert trigger might have empty items.
-- But usually the App updates the Invoice Total after inserting items, which triggers UPDATE.
-- This ensures we catch the final state.

DROP TRIGGER IF EXISTS trg_auto_snapshot_invoice ON public.invoice;

CREATE TRIGGER trg_auto_snapshot_invoice
AFTER INSERT OR UPDATE ON public.invoice
FOR EACH ROW
EXECUTE FUNCTION public.create_invoice_snapshot_func();