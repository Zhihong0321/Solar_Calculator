-- Set EV Charger type for the 5 EV charger packages
UPDATE package
SET type = 'EV Charger'
WHERE id IN (1029, 1030, 1031, 1032, 1033);
