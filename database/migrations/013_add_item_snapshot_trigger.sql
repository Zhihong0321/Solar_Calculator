-- 1. Function to 'touch' the parent invoice when an item changes
CREATE OR REPLACE FUNCTION public.trigger_touch_parent_invoice()
RETURNS TRIGGER AS $$
BEGIN
    -- We touch the parent invoice by updating its updated_at timestamp.
    -- This will trigger the 'trg_auto_snapshot_invoice' on the invoice table.
    
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.invoice 
        SET updated_at = NOW() 
        WHERE bubble_id = OLD.linked_invoice;
        RETURN OLD;
    ELSE
        UPDATE public.invoice 
        SET updated_at = NOW() 
        WHERE bubble_id = NEW.linked_invoice;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Apply Trigger to invoice_item table
DROP TRIGGER IF EXISTS trg_item_changes_trigger_snapshot ON public.invoice_item;

CREATE TRIGGER trg_item_changes_trigger_snapshot
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_item
FOR EACH ROW
EXECUTE FUNCTION public.trigger_touch_parent_invoice();
