ALTER TABLE public.invoice_item
  ADD COLUMN IF NOT EXISTS linked_product text;

CREATE INDEX IF NOT EXISTS idx_invoice_item_linked_product
  ON public.invoice_item (linked_product);

COMMENT ON COLUMN public.invoice_item.linked_product IS
  'Direct product reference for invoice items that are not package-backed, such as batteries or accessories.';
