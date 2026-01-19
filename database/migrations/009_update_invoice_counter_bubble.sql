-- Update the invoice_count to continue from the highest Bubble Data API series number (1007865)
UPDATE system_parameter 
SET value = '1007865',
    description = 'Updated to follow Bubble Data API series max (1007865)'
WHERE key = 'invoice_count';
