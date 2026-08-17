-- Residential MICRO-inverter package sync from Google Sheet gid=1964999635 (fetched 2026-08-04)
-- Source of truth: database/package_import/residential-micro-2026-08-03.json
-- 33 inserts, all new: sheet names carry a [1P]/[3P] phase prefix that no prod micro row has.
-- Legacy 590W micro packages are NOT deactivated (different panel wattage; they do not collide in lookup).
BEGIN;

INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC1PJ8P', '1771039183637x205243619540992000', 8, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ8A', '1712027846244x376551508591509500', 2, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC1PJ8', '[1P]MICRO SAJ JINKO 8 PCS 650W', 'Residential', 8, 20600, 17440,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '8 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
2 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC1PJ8P','1785715200000xITEMMIC1PJ8A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC1PJ9P', '1771039183637x205243619540992000', 9, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ9A', '1712027846244x376551508591509500', 2, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ9B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC1PJ9', '[1P]MICRO SAJ JINKO 9 PCS 650W', 'Residential', 9, 22360, 18970,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '9 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
2 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC1PJ9P','1785715200000xITEMMIC1PJ9A','1785715200000xITEMMIC1PJ9B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC1PJ10P', '1771039183637x205243619540992000', 10, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ10A', '1712027846244x376551508591509500', 2, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ10B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC1PJ10', '[1P]MICRO SAJ JINKO 10 PCS 650W', 'Residential', 10, 23840, 20180,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '10 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
2 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC1PJ10P','1785715200000xITEMMIC1PJ10A','1785715200000xITEMMIC1PJ10B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC1PJ11P', '1771039183637x205243619540992000', 11, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ11A', '1712027846244x376551508591509500', 3, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC1PJ11', '[1P]MICRO SAJ JINKO 11 PCS 650W', 'Residential', 11, 25460, 21570,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '11 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
3 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC1PJ11P','1785715200000xITEMMIC1PJ11A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC1PJ12P', '1771039183637x205243619540992000', 12, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC1PJ12A', '1712027846244x376551508591509500', 3, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC1PJ12', '[1P]MICRO SAJ JINKO 12 PCS 650W', 'Residential', 12, 26740, 22630,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '12 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
3 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC1PJ12P','1785715200000xITEMMIC1PJ12A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ9P', '1771039183637x205243619540992000', 9, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ9A', '1712027846244x376551508591509500', 2, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ9B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ9', '[3P]MICRO SAJ JINKO 9 PCS 650W', 'Residential', 9, 24760, 19780,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '9 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
2 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ9P','1785715200000xITEMMIC3PJ9A','1785715200000xITEMMIC3PJ9B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ10P', '1771039183637x205243619540992000', 10, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ10A', '1712027846244x376551508591509500', 2, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ10B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ10', '[3P]MICRO SAJ JINKO 10 PCS 650W', 'Residential', 10, 26050, 20770,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '10 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
2 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ10P','1785715200000xITEMMIC3PJ10A','1785715200000xITEMMIC3PJ10B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ11P', '1771039183637x205243619540992000', 11, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ11A', '1712027846244x376551508591509500', 3, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ11', '[3P]MICRO SAJ JINKO 11 PCS 650W', 'Residential', 11, 27670, 22100,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '11 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
3 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ11P','1785715200000xITEMMIC3PJ11A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ12P', '1771039183637x205243619540992000', 12, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ12A', '1712027846244x376551508591509500', 3, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ12', '[3P]MICRO SAJ JINKO 12 PCS 650W', 'Residential', 12, 28990, 23120,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '12 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
3 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ12P','1785715200000xITEMMIC3PJ12A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ13P', '1771039183637x205243619540992000', 13, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ13A', '1712027846244x376551508591509500', 3, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ13B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ13', '[3P]MICRO SAJ JINKO 13 PCS 650W', 'Residential', 13, 30730, 24590,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '13 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
3 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ13P','1785715200000xITEMMIC3PJ13A','1785715200000xITEMMIC3PJ13B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ14P', '1771039183637x205243619540992000', 14, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ14A', '1712027846244x376551508591509500', 3, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ14B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ14', '[3P]MICRO SAJ JINKO 14 PCS 650W', 'Residential', 14, 32100, 25640,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '14 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
3 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ14P','1785715200000xITEMMIC3PJ14A','1785715200000xITEMMIC3PJ14B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ15P', '1771039183637x205243619540992000', 15, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ15A', '1712027846244x376551508591509500', 4, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ15', '[3P]MICRO SAJ JINKO 15 PCS 650W', 'Residential', 15, 33720, 26960,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '15 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
4 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ15P','1785715200000xITEMMIC3PJ15A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ16P', '1771039183637x205243619540992000', 16, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ16A', '1712027846244x376551508591509500', 4, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ16', '[3P]MICRO SAJ JINKO 16 PCS 650W', 'Residential', 16, 34990, 27960,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '16 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
4 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ16P','1785715200000xITEMMIC3PJ16A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ17P', '1771039183637x205243619540992000', 17, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ17A', '1712027846244x376551508591509500', 4, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ17B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ17', '[3P]MICRO SAJ JINKO 17 PCS 650W', 'Residential', 17, 36730, 29420,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '17 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
4 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ17P','1785715200000xITEMMIC3PJ17A','1785715200000xITEMMIC3PJ17B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ18P', '1771039183637x205243619540992000', 18, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ18A', '1712027846244x376551508591509500', 4, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ18B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ18', '[3P]MICRO SAJ JINKO 18 PCS 650W', 'Residential', 18, 38000, 30410,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '18 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
4 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ18P','1785715200000xITEMMIC3PJ18A','1785715200000xITEMMIC3PJ18B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ19P', '1771039183637x205243619540992000', 19, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ19A', '1712027846244x376551508591509500', 5, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ19', '[3P]MICRO SAJ JINKO 19 PCS 650W', 'Residential', 19, 39700, 31510,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '19 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
5 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ19P','1785715200000xITEMMIC3PJ19A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ20P', '1771039183637x205243619540992000', 20, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ20A', '1712027846244x376551508591509500', 5, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ20', '[3P]MICRO SAJ JINKO 20 PCS 650W', 'Residential', 20, 40970, 32210,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '20 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
5 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ20P','1785715200000xITEMMIC3PJ20A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ21P', '1771039183637x205243619540992000', 21, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ21A', '1712027846244x376551508591509500', 5, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ21B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ21', '[3P]MICRO SAJ JINKO 21 PCS 650W', 'Residential', 21, 42710, 33370,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '21 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
5 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ21P','1785715200000xITEMMIC3PJ21A','1785715200000xITEMMIC3PJ21B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ22P', '1771039183637x205243619540992000', 22, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ22A', '1712027846244x376551508591509500', 5, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ22B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ22', '[3P]MICRO SAJ JINKO 22 PCS 650W', 'Residential', 22, 43980, 34040,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '22 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
5 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ22P','1785715200000xITEMMIC3PJ22A','1785715200000xITEMMIC3PJ22B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ23P', '1771039183637x205243619540992000', 23, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ23A', '1712027846244x376551508591509500', 6, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ23', '[3P]MICRO SAJ JINKO 23 PCS 650W', 'Residential', 23, 45650, 35070,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '23 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
6 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ23P','1785715200000xITEMMIC3PJ23A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ24P', '1771039183637x205243619540992000', 24, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ24A', '1712027846244x376551508591509500', 6, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ24', '[3P]MICRO SAJ JINKO 24 PCS 650W', 'Residential', 24, 46920, 36020,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '24 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
6 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ24P','1785715200000xITEMMIC3PJ24A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ25P', '1771039183637x205243619540992000', 25, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ25A', '1712027846244x376551508591509500', 6, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ25B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ25', '[3P]MICRO SAJ JINKO 25 PCS 650W', 'Residential', 25, 48660, 37430,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '25 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
6 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ25P','1785715200000xITEMMIC3PJ25A','1785715200000xITEMMIC3PJ25B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ26P', '1771039183637x205243619540992000', 26, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ26A', '1712027846244x376551508591509500', 6, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ26B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ26', '[3P]MICRO SAJ JINKO 26 PCS 650W', 'Residential', 26, 49930, 38360,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '26 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
6 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ26P','1785715200000xITEMMIC3PJ26A','1785715200000xITEMMIC3PJ26B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ27P', '1771039183637x205243619540992000', 27, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ27A', '1712027846244x376551508591509500', 7, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ27', '[3P]MICRO SAJ JINKO 27 PCS 650W', 'Residential', 27, 51510, 39640,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '27 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
7 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ27P','1785715200000xITEMMIC3PJ27A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ28P', '1771039183637x205243619540992000', 28, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ28A', '1712027846244x376551508591509500', 7, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ28', '[3P]MICRO SAJ JINKO 28 PCS 650W', 'Residential', 28, 53250, 40180,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '28 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
7 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ28P','1785715200000xITEMMIC3PJ28A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ29P', '1771039183637x205243619540992000', 29, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ29A', '1712027846244x376551508591509500', 7, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ29B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ29', '[3P]MICRO SAJ JINKO 29 PCS 650W', 'Residential', 29, 55490, 41520,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '29 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
7 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ29P','1785715200000xITEMMIC3PJ29A','1785715200000xITEMMIC3PJ29B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ30P', '1771039183637x205243619540992000', 30, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ30A', '1712027846244x376551508591509500', 7, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ30B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ30', '[3P]MICRO SAJ JINKO 30 PCS 650W', 'Residential', 30, 56750, 42430,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '30 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
7 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ30P','1785715200000xITEMMIC3PJ30A','1785715200000xITEMMIC3PJ30B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ31P', '1771039183637x205243619540992000', 31, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ31A', '1712027846244x376551508591509500', 8, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ31', '[3P]MICRO SAJ JINKO 31 PCS 650W', 'Residential', 31, 58340, 43660,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '31 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
8 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ31P','1785715200000xITEMMIC3PJ31A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ32P', '1771039183637x205243619540992000', 32, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ32A', '1712027846244x376551508591509500', 8, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ32', '[3P]MICRO SAJ JINKO 32 PCS 650W', 'Residential', 32, 59590, 44570,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '32 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
8 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ32P','1785715200000xITEMMIC3PJ32A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ33P', '1771039183637x205243619540992000', 33, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ33A', '1712027846244x376551508591509500', 8, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ33B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ33', '[3P]MICRO SAJ JINKO 33 PCS 650W', 'Residential', 33, 61320, 45950,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '33 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
8 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ33P','1785715200000xITEMMIC3PJ33A','1785715200000xITEMMIC3PJ33B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ34P', '1771039183637x205243619540992000', 34, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ34A', '1712027846244x376551508591509500', 8, 2, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ34B', '1712027911264x544501973692448800', 1, 3, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ34', '[3P]MICRO SAJ JINKO 34 PCS 650W', 'Residential', 34, 62570, 46860,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', '1712027911264x544501973692448800', '34 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
8 X M2-1.8K-S4
1 X M2-1.0K-S2
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ34P','1785715200000xITEMMIC3PJ34A','1785715200000xITEMMIC3PJ34B']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ35P', '1771039183637x205243619540992000', 35, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ35A', '1712027846244x376551508591509500', 9, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ35', '[3P]MICRO SAJ JINKO 35 PCS 650W', 'Residential', 35, 64240, 48140,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '35 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
9 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ35P','1785715200000xITEMMIC3PJ35A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMMIC3PJ36P', '1771039183637x205243619540992000', 36, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMMIC3PJ36A', '1712027846244x376551508591509500', 9, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1, inverter_2,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGMIC3PJ36', '[3P]MICRO SAJ JINKO 36 PCS 650W', 'Residential', 36, 65490, 49050,
        '1771039183637x205243619540992000', '1712027846244x376551508591509500', NULL, '36 X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
9 X M2-1.8K-S4
1X SEDA ATAP SOLAR Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured',
        ARRAY['1785715200000xITEMMIC3PJ36P','1785715200000xITEMMIC3PJ36A']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel,
  inverter_1=EXCLUDED.inverter_1, inverter_2=EXCLUDED.inverter_2,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();

-- === VERIFY (run before COMMIT)
SELECT count(*) AS new_micro, count(*) FILTER (WHERE active) AS active_new
FROM package WHERE bubble_id LIKE '1785715200000xPKGMIC%';   -- expect 33 / 33

SELECT count(*) AS unresolvable FROM package p
LEFT JOIN product pr ON p.panel=pr.bubble_id
LEFT JOIN product i1 ON p.inverter_1=i1.bubble_id
WHERE p.bubble_id LIKE '1785715200000xPKGMIC%' AND (pr.id IS NULL OR i1.id IS NULL);   -- expect 0

COMMIT;
