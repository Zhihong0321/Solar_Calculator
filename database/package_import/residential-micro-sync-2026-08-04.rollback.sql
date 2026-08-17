-- ROLLBACK for residential-micro-sync-2026-08-04.sql
BEGIN;
DELETE FROM package      WHERE bubble_id LIKE '1785715200000xPKGMIC%';
DELETE FROM package_item WHERE bubble_id LIKE '1785715200000xITEMMIC%';
COMMIT;
