-- Residential STRING package sync from Google Sheet gid=694235366 (fetched 2026-08-03)
-- Source of truth: database/package_import/residential-string-2026-08-03.json
-- Scope: package.type = 'Residential', string inverters only. Hybrid and micro rows are NOT touched.
-- 1) insert 50 new Astronergy 625W packages   2) refresh the 50 existing Jinko 650W rows
BEGIN;

-- === STEP 1: 50 new [1P]/[3P] STRING SAJ ASTRONERGY packages
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO8P', '1785715200000x000000000000000122', 8, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO8I', '1703832486959x361642797057966100', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO8', '[1P] STRING SAJ ASTRONERGY 8 PCS 625W', 'Residential', 8, 16770, 13760,
        '1785715200000x000000000000000122', '1703832486959x361642797057966100', '8X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 4KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO8P','1785715200000xITEMRSTR1PASTRO8I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO9P', '1785715200000x000000000000000122', 9, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO9I', '1703832486959x361642797057966100', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO9', '[1P] STRING SAJ ASTRONERGY 9 PCS 625W', 'Residential', 9, 17930, 14700,
        '1785715200000x000000000000000122', '1703832486959x361642797057966100', '9X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 4KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO9P','1785715200000xITEMRSTR1PASTRO9I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO10P', '1785715200000x000000000000000122', 10, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO10I', '1703833932150x627237241211846700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO10', '[1P] STRING SAJ ASTRONERGY 10 PCS 625W', 'Residential', 10, 19400, 15910,
        '1785715200000x000000000000000122', '1703833932150x627237241211846700', '10X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO10P','1785715200000xITEMRSTR1PASTRO10I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO11P', '1785715200000x000000000000000122', 11, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO11I', '1703833932150x627237241211846700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO11', '[1P] STRING SAJ ASTRONERGY 11 PCS 625W', 'Residential', 11, 20560, 16850,
        '1785715200000x000000000000000122', '1703833932150x627237241211846700', '11X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO11P','1785715200000xITEMRSTR1PASTRO11I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO12P', '1785715200000x000000000000000122', 12, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO12I', '1703832475148x566437913026887700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO12', '[1P] STRING SAJ ASTRONERGY 12 PCS 625W', 'Residential', 12, 21710, 17790,
        '1785715200000x000000000000000122', '1703832475148x566437913026887700', '12X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO12P','1785715200000xITEMRSTR1PASTRO12I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO13P', '1785715200000x000000000000000122', 13, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO13I', '1703832475148x566437913026887700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO13', '[1P] STRING SAJ ASTRONERGY 13 PCS 625W', 'Residential', 13, 22940, 18790,
        '1785715200000x000000000000000122', '1703832475148x566437913026887700', '13X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO13P','1785715200000xITEMRSTR1PASTRO13I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO14P', '1785715200000x000000000000000122', 14, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO14I', '1703815277423x923633591226466300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO14', '[1P] STRING SAJ ASTRONERGY 14 PCS 625W', 'Residential', 14, 25190, 19530,
        '1785715200000x000000000000000122', '1703815277423x923633591226466300', '14X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO14P','1785715200000xITEMRSTR1PASTRO14I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO15P', '1785715200000x000000000000000122', 15, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO15I', '1703815277423x923633591226466300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO15', '[1P] STRING SAJ ASTRONERGY 15 PCS 625W', 'Residential', 15, 26340, 20410,
        '1785715200000x000000000000000122', '1703815277423x923633591226466300', '15X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO15P','1785715200000xITEMRSTR1PASTRO15I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO16P', '1785715200000x000000000000000122', 16, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO16I', '1703815277423x923633591226466300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO16', '[1P] STRING SAJ ASTRONERGY 16 PCS 625W', 'Residential', 16, 27500, 21300,
        '1785715200000x000000000000000122', '1703815277423x923633591226466300', '16X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO16P','1785715200000xITEMRSTR1PASTRO16I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO17P', '1785715200000x000000000000000122', 17, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO17I', '1703815277423x923633591226466300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO17', '[1P] STRING SAJ ASTRONERGY 17 PCS 625W', 'Residential', 17, 28650, 22190,
        '1785715200000x000000000000000122', '1703815277423x923633591226466300', '17X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO17P','1785715200000xITEMRSTR1PASTRO17I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR1PASTRO18P', '1785715200000x000000000000000122', 18, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR1PASTRO18I', '1703815277423x923633591226466300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR1PASTRO18', '[1P] STRING SAJ ASTRONERGY 18 PCS 625W', 'Residential', 18, 29810, 23080,
        '1785715200000x000000000000000122', '1703815277423x923633591226466300', '18X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR1PASTRO18P','1785715200000xITEMRSTR1PASTRO18I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO10P', '1785715200000x000000000000000122', 10, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO10I', '1776182987956x606618364561138300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO10', '[3P] STRING SAJ ASTRONERGY 10 PCS 625W', 'Residential', 10, 21730, 16700,
        '1785715200000x000000000000000122', '1776182987956x606618364561138300', '10X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO10P','1785715200000xITEMRSTR3PASTRO10I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO11P', '1785715200000x000000000000000122', 11, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO11I', '1776182987956x606618364561138300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO11', '[3P] STRING SAJ ASTRONERGY 11 PCS 625W', 'Residential', 11, 22890, 17580,
        '1785715200000x000000000000000122', '1776182987956x606618364561138300', '11X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO11P','1785715200000xITEMRSTR3PASTRO11I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO12P', '1785715200000x000000000000000122', 12, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO12I', '1776182988011x951519061695254500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO12', '[3P] STRING SAJ ASTRONERGY 12 PCS 625W', 'Residential', 12, 24110, 18510,
        '1785715200000x000000000000000122', '1776182988011x951519061695254500', '12X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO12P','1785715200000xITEMRSTR3PASTRO12I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO13P', '1785715200000x000000000000000122', 13, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO13I', '1776182988011x951519061695254500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO13', '[3P] STRING SAJ ASTRONERGY 13 PCS 625W', 'Residential', 13, 25260, 19390,
        '1785715200000x000000000000000122', '1776182988011x951519061695254500', '13X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO13P','1785715200000xITEMRSTR3PASTRO13I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO14P', '1785715200000x000000000000000122', 14, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO14I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO14', '[3P] STRING SAJ ASTRONERGY 14 PCS 625W', 'Residential', 14, 26560, 20380,
        '1785715200000x000000000000000122', '1776182987917x004362228963947001', '14X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO14P','1785715200000xITEMRSTR3PASTRO14I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO15P', '1785715200000x000000000000000122', 15, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO15I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO15', '[3P] STRING SAJ ASTRONERGY 15 PCS 625W', 'Residential', 15, 27720, 21260,
        '1785715200000x000000000000000122', '1776182987917x004362228963947001', '15X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO15P','1785715200000xITEMRSTR3PASTRO15I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO16P', '1785715200000x000000000000000122', 16, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO16I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO16', '[3P] STRING SAJ ASTRONERGY 16 PCS 625W', 'Residential', 16, 28870, 22140,
        '1785715200000x000000000000000122', '1776182987917x004362228963947001', '16X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO16P','1785715200000xITEMRSTR3PASTRO16I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO17P', '1785715200000x000000000000000122', 17, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO17I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO17', '[3P] STRING SAJ ASTRONERGY 17 PCS 625W', 'Residential', 17, 30020, 23020,
        '1785715200000x000000000000000122', '1776182987917x004362228963947001', '17X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO17P','1785715200000xITEMRSTR3PASTRO17I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO18P', '1785715200000x000000000000000122', 18, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO18I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO18', '[3P] STRING SAJ ASTRONERGY 18 PCS 625W', 'Residential', 18, 31180, 23900,
        '1785715200000x000000000000000122', '1776182987917x004362228963947001', '18X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO18P','1785715200000xITEMRSTR3PASTRO18I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO19P', '1785715200000x000000000000000122', 19, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO19I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO19', '[3P] STRING SAJ ASTRONERGY 19 PCS 625W', 'Residential', 19, 32480, 24620,
        '1785715200000x000000000000000122', '1703753919775x906442469182537700', '19X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO19P','1785715200000xITEMRSTR3PASTRO19I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO20P', '1785715200000x000000000000000122', 20, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO20I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO20', '[3P] STRING SAJ ASTRONERGY 20 PCS 625W', 'Residential', 20, 33630, 25220,
        '1785715200000x000000000000000122', '1703753919775x906442469182537700', '20X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO20P','1785715200000xITEMRSTR3PASTRO20I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO21P', '1785715200000x000000000000000122', 21, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO21I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO21', '[3P] STRING SAJ ASTRONERGY 21 PCS 625W', 'Residential', 21, 34790, 25810,
        '1785715200000x000000000000000122', '1703753919775x906442469182537700', '21X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO21P','1785715200000xITEMRSTR3PASTRO21I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO22P', '1785715200000x000000000000000122', 22, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO22I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO22', '[3P] STRING SAJ ASTRONERGY 22 PCS 625W', 'Residential', 22, 35940, 26390,
        '1785715200000x000000000000000122', '1703753919775x906442469182537700', '22X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO22P','1785715200000xITEMRSTR3PASTRO22I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO23P', '1785715200000x000000000000000122', 23, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO23I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO23', '[3P] STRING SAJ ASTRONERGY 23 PCS 625W', 'Residential', 23, 37220, 27040,
        '1785715200000x000000000000000122', '1703832424223x792437775786049500', '23X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO23P','1785715200000xITEMRSTR3PASTRO23I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO24P', '1785715200000x000000000000000122', 24, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO24I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO24', '[3P] STRING SAJ ASTRONERGY 24 PCS 625W', 'Residential', 24, 38380, 27880,
        '1785715200000x000000000000000122', '1703832424223x792437775786049500', '24X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO24P','1785715200000xITEMRSTR3PASTRO24I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO25P', '1785715200000x000000000000000122', 25, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO25I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO25', '[3P] STRING SAJ ASTRONERGY 25 PCS 625W', 'Residential', 25, 39530, 28710,
        '1785715200000x000000000000000122', '1703832424223x792437775786049500', '25X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO25P','1785715200000xITEMRSTR3PASTRO25I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO26P', '1785715200000x000000000000000122', 26, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO26I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO26', '[3P] STRING SAJ ASTRONERGY 26 PCS 625W', 'Residential', 26, 40690, 29540,
        '1785715200000x000000000000000122', '1703832424223x792437775786049500', '26X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO26P','1785715200000xITEMRSTR3PASTRO26I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO27P', '1785715200000x000000000000000122', 27, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO27I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO27', '[3P] STRING SAJ ASTRONERGY 27 PCS 625W', 'Residential', 27, 41840, 30380,
        '1785715200000x000000000000000122', '1703832424223x792437775786049500', '27X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO27P','1785715200000xITEMRSTR3PASTRO27I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO28P', '1785715200000x000000000000000122', 28, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO28I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO28', '[3P] STRING SAJ ASTRONERGY 28 PCS 625W', 'Residential', 28, 43740, 31120,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '28X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO28P','1785715200000xITEMRSTR3PASTRO28I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO29P', '1785715200000x000000000000000122', 29, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO29I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO29', '[3P] STRING SAJ ASTRONERGY 29 PCS 625W', 'Residential', 29, 45680, 32180,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '29X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO29P','1785715200000xITEMRSTR3PASTRO29I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO30P', '1785715200000x000000000000000122', 30, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO30I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO30', '[3P] STRING SAJ ASTRONERGY 30 PCS 625W', 'Residential', 30, 46840, 32990,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '30X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO30P','1785715200000xITEMRSTR3PASTRO30I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO31P', '1785715200000x000000000000000122', 31, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO31I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO31', '[3P] STRING SAJ ASTRONERGY 31 PCS 625W', 'Residential', 31, 47990, 33790,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '31X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO31P','1785715200000xITEMRSTR3PASTRO31I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO32P', '1785715200000x000000000000000122', 32, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO32I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO32', '[3P] STRING SAJ ASTRONERGY 32 PCS 625W', 'Residential', 32, 49140, 34600,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '32X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO32P','1785715200000xITEMRSTR3PASTRO32I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO33P', '1785715200000x000000000000000122', 33, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO33I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO33', '[3P] STRING SAJ ASTRONERGY 33 PCS 625W', 'Residential', 33, 50300, 35410,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '33X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO33P','1785715200000xITEMRSTR3PASTRO33I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO34P', '1785715200000x000000000000000122', 34, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO34I', '1741614860801x190167310062321660', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO34', '[3P] STRING SAJ ASTRONERGY 34 PCS 625W', 'Residential', 34, 51450, 36220,
        '1785715200000x000000000000000122', '1741614860801x190167310062321660', '34X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO34P','1785715200000xITEMRSTR3PASTRO34I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO35P', '1785715200000x000000000000000122', 35, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO35I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO35', '[3P] STRING SAJ ASTRONERGY 35 PCS 625W', 'Residential', 35, 52740, 37120,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '35X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO35P','1785715200000xITEMRSTR3PASTRO35I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO36P', '1785715200000x000000000000000122', 36, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO36I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO36', '[3P] STRING SAJ ASTRONERGY 36 PCS 625W', 'Residential', 36, 53890, 37930,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '36X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO36P','1785715200000xITEMRSTR3PASTRO36I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO37P', '1785715200000x000000000000000122', 37, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO37I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO37', '[3P] STRING SAJ ASTRONERGY 37 PCS 625W', 'Residential', 37, 55050, 38730,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '37X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO37P','1785715200000xITEMRSTR3PASTRO37I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO38P', '1785715200000x000000000000000122', 38, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO38I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO38', '[3P] STRING SAJ ASTRONERGY 38 PCS 625W', 'Residential', 38, 56200, 39540,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '38X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO38P','1785715200000xITEMRSTR3PASTRO38I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO39P', '1785715200000x000000000000000122', 39, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO39I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO39', '[3P] STRING SAJ ASTRONERGY 39 PCS 625W', 'Residential', 39, 57350, 40350,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '39X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO39P','1785715200000xITEMRSTR3PASTRO39I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO40P', '1785715200000x000000000000000122', 40, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO40I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO40', '[3P] STRING SAJ ASTRONERGY 40 PCS 625W', 'Residential', 40, 58510, 41160,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '40X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO40P','1785715200000xITEMRSTR3PASTRO40I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO41P', '1785715200000x000000000000000122', 41, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO41I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO41', '[3P] STRING SAJ ASTRONERGY 41 PCS 625W', 'Residential', 41, 59660, 41960,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '41X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO41P','1785715200000xITEMRSTR3PASTRO41I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO42P', '1785715200000x000000000000000122', 42, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO42I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO42', '[3P] STRING SAJ ASTRONERGY 42 PCS 625W', 'Residential', 42, 60820, 42770,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '42X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO42P','1785715200000xITEMRSTR3PASTRO42I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO43P', '1785715200000x000000000000000122', 43, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO43I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO43', '[3P] STRING SAJ ASTRONERGY 43 PCS 625W', 'Residential', 43, 61970, 43580,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '43X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO43P','1785715200000xITEMRSTR3PASTRO43I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO44P', '1785715200000x000000000000000122', 44, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO44I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO44', '[3P] STRING SAJ ASTRONERGY 44 PCS 625W', 'Residential', 44, 63120, 44390,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '44X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO44P','1785715200000xITEMRSTR3PASTRO44I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO45P', '1785715200000x000000000000000122', 45, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO45I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO45', '[3P] STRING SAJ ASTRONERGY 45 PCS 625W', 'Residential', 45, 64280, 45190,
        '1785715200000x000000000000000122', '1724421132110x481560740678860800', '45X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO45P','1785715200000xITEMRSTR3PASTRO45I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO46P', '1785715200000x000000000000000122', 46, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO46I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO46', '[3P] STRING SAJ ASTRONERGY 46 PCS 625W', 'Residential', 46, 66400, 46700,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '46X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO46P','1785715200000xITEMRSTR3PASTRO46I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO47P', '1785715200000x000000000000000122', 47, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO47I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO47', '[3P] STRING SAJ ASTRONERGY 47 PCS 625W', 'Residential', 47, 67560, 47510,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '47X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO47P','1785715200000xITEMRSTR3PASTRO47I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMRSTR3PASTRO48P', '1785715200000x000000000000000122', 48, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMRSTR3PASTRO48I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGRSTR3PASTRO48', '[3P] STRING SAJ ASTRONERGY 48 PCS 625W', 'Residential', 48, 68710, 48310,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '48X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMRSTR3PASTRO48P','1785715200000xITEMRSTR3PASTRO48I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, special=false, type=EXCLUDED.type, modified_date=now();

-- === STEP 2: refresh the 50 existing Jinko 650W residential string rows (sheet authoritative)
UPDATE package SET invoice_desc='8X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 4KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=17330, nett_price=14320,
  panel_qty=8, panel='1771039183637x205243619540992000', inverter_1='1703832486959x361642797057966100', active=true, special=false, modified_date=now()
WHERE id=748;
UPDATE package SET invoice_desc='9X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 4KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=18560, nett_price=15330,
  panel_qty=9, panel='1771039183637x205243619540992000', inverter_1='1703832486959x361642797057966100', active=true, special=false, modified_date=now()
WHERE id=749;
UPDATE package SET invoice_desc='10X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=20100, nett_price=16610,
  panel_qty=10, panel='1771039183637x205243619540992000', inverter_1='1703833932150x627237241211846700', active=true, special=false, modified_date=now()
WHERE id=811;
UPDATE package SET invoice_desc='11X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=21330, nett_price=17620,
  panel_qty=11, panel='1771039183637x205243619540992000', inverter_1='1703833932150x627237241211846700', active=true, special=false, modified_date=now()
WHERE id=812;
UPDATE package SET invoice_desc='12X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=22550, nett_price=18630,
  panel_qty=12, panel='1771039183637x205243619540992000', inverter_1='1703833932150x627237241211846700', active=true, special=false, modified_date=now()
WHERE id=813;
UPDATE package SET invoice_desc='13X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=23850, nett_price=19700,
  panel_qty=13, panel='1771039183637x205243619540992000', inverter_1='1703832475148x566437913026887700', active=true, special=false, modified_date=now()
WHERE id=814;
UPDATE package SET invoice_desc='14X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 7KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=26170, nett_price=20510,
  panel_qty=14, panel='1771039183637x205243619540992000', inverter_1='1703832445921x639989657399984100', active=true, special=false, modified_date=now()
WHERE id=815;
UPDATE package SET invoice_desc='15X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 7KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=27390, nett_price=21460,
  panel_qty=15, panel='1771039183637x205243619540992000', inverter_1='1703832445921x639989657399984100', active=true, special=false, modified_date=now()
WHERE id=816;
UPDATE package SET invoice_desc='16X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 7KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=28620, nett_price=22420,
  panel_qty=16, panel='1771039183637x205243619540992000', inverter_1='1703832445921x639989657399984100', active=true, special=false, modified_date=now()
WHERE id=817;
UPDATE package SET invoice_desc='17X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=29840, nett_price=23380,
  panel_qty=17, panel='1771039183637x205243619540992000', inverter_1='1703815277423x923633591226466300', active=true, special=false, modified_date=now()
WHERE id=818;
UPDATE package SET invoice_desc='18X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [1P] SAJ R5 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=31070, nett_price=24340,
  panel_qty=18, panel='1771039183637x205243619540992000', inverter_1='1703815277423x923633591226466300', active=true, special=false, modified_date=now()
WHERE id=819;
UPDATE package SET invoice_desc='10X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=22430, nett_price=17400,
  panel_qty=10, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true, special=false, modified_date=now()
WHERE id=820;
UPDATE package SET invoice_desc='11X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=23660, nett_price=18350,
  panel_qty=11, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true, special=false, modified_date=now()
WHERE id=821;
UPDATE package SET invoice_desc='12X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=24950, nett_price=19350,
  panel_qty=12, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true, special=false, modified_date=now()
WHERE id=822;
UPDATE package SET invoice_desc='13X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=26170, nett_price=20300,
  panel_qty=13, panel='1771039183637x205243619540992000', inverter_1='1776182988011x951519061695254500', active=true, special=false, modified_date=now()
WHERE id=823;
UPDATE package SET invoice_desc='14X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=27540, nett_price=21360,
  panel_qty=14, panel='1771039183637x205243619540992000', inverter_1='1776182988011x951519061695254500', active=true, special=false, modified_date=now()
WHERE id=824;
UPDATE package SET invoice_desc='15X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=28770, nett_price=22310,
  panel_qty=15, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, special=false, modified_date=now()
WHERE id=825;
UPDATE package SET invoice_desc='16X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=29990, nett_price=23260,
  panel_qty=16, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, special=false, modified_date=now()
WHERE id=826;
UPDATE package SET invoice_desc='17X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=31210, nett_price=24210,
  panel_qty=17, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, special=false, modified_date=now()
WHERE id=827;
UPDATE package SET invoice_desc='18X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=32440, nett_price=25160,
  panel_qty=18, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, special=false, modified_date=now()
WHERE id=828;
UPDATE package SET invoice_desc='19X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=33810, nett_price=25950,
  panel_qty=19, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, special=false, modified_date=now()
WHERE id=829;
UPDATE package SET invoice_desc='20X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=35030, nett_price=26620,
  panel_qty=20, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, special=false, modified_date=now()
WHERE id=830;
UPDATE package SET invoice_desc='21X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=36260, nett_price=27280,
  panel_qty=21, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, special=false, modified_date=now()
WHERE id=831;
UPDATE package SET invoice_desc='22X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=37480, nett_price=27930,
  panel_qty=22, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, special=false, modified_date=now()
WHERE id=832;
UPDATE package SET invoice_desc='23X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=38830, nett_price=28650,
  panel_qty=23, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, special=false, modified_date=now()
WHERE id=833;
UPDATE package SET invoice_desc='24X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=40060, nett_price=29560,
  panel_qty=24, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, special=false, modified_date=now()
WHERE id=834;
UPDATE package SET invoice_desc='25X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=41280, nett_price=30460,
  panel_qty=25, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, special=false, modified_date=now()
WHERE id=835;
UPDATE package SET invoice_desc='26X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=42510, nett_price=31360,
  panel_qty=26, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, special=false, modified_date=now()
WHERE id=836;
UPDATE package SET invoice_desc='27X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=43730, nett_price=32270,
  panel_qty=27, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, special=false, modified_date=now()
WHERE id=837;
UPDATE package SET invoice_desc='28X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=45700, nett_price=33080,
  panel_qty=28, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=838;
UPDATE package SET invoice_desc='29X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=47710, nett_price=34210,
  panel_qty=29, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=839;
UPDATE package SET invoice_desc='30X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=48940, nett_price=35090,
  panel_qty=30, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=840;
UPDATE package SET invoice_desc='31X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=50160, nett_price=35960,
  panel_qty=31, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=841;
UPDATE package SET invoice_desc='32X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=51380, nett_price=36840,
  panel_qty=32, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=842;
UPDATE package SET invoice_desc='33X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=52610, nett_price=37720,
  panel_qty=33, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=843;
UPDATE package SET invoice_desc='34X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12.5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=53830, nett_price=38600,
  panel_qty=34, panel='1771039183637x205243619540992000', inverter_1='1741614860801x190167310062321660', active=true, special=false, modified_date=now()
WHERE id=844;
UPDATE package SET invoice_desc='35X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=55190, nett_price=39570,
  panel_qty=35, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=845;
UPDATE package SET invoice_desc='36X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=56410, nett_price=40450,
  panel_qty=36, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=846;
UPDATE package SET invoice_desc='37X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=57640, nett_price=41320,
  panel_qty=37, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=847;
UPDATE package SET invoice_desc='38X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=58860, nett_price=42200,
  panel_qty=38, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=848;
UPDATE package SET invoice_desc='39X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=60080, nett_price=43080,
  panel_qty=39, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=849;
UPDATE package SET invoice_desc='40X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=61310, nett_price=43960,
  panel_qty=40, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=850;
UPDATE package SET invoice_desc='41X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=62530, nett_price=44830,
  panel_qty=41, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=851;
UPDATE package SET invoice_desc='42X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=63760, nett_price=45710,
  panel_qty=42, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=852;
UPDATE package SET invoice_desc='43X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=64980, nett_price=46590,
  panel_qty=43, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=853;
UPDATE package SET invoice_desc='44X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=66200, nett_price=47470,
  panel_qty=44, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=854;
UPDATE package SET invoice_desc='45X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=67430, nett_price=48340,
  panel_qty=45, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, special=false, modified_date=now()
WHERE id=855;
UPDATE package SET invoice_desc='46X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=69620, nett_price=49920,
  panel_qty=46, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, special=false, modified_date=now()
WHERE id=856;
UPDATE package SET invoice_desc='47X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=70850, nett_price=50800,
  panel_qty=47, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, special=false, modified_date=now()
WHERE id=857;
UPDATE package SET invoice_desc='48X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=72070, nett_price=51670,
  panel_qty=48, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, special=false, modified_date=now()
WHERE id=858;

-- === VERIFY (run before COMMIT)
SELECT count(*) FILTER (WHERE active AND package_name ILIKE '%STRING SAJ ASTRONERGY%') AS astro_active,
       count(*) FILTER (WHERE active AND package_name ILIKE '%STRING SAJ JINKO%')      AS jinko_active
FROM package WHERE type='Residential';   -- expect 50 / 50

SELECT count(*) AS unresolvable FROM package p
LEFT JOIN product pr ON p.panel=pr.bubble_id
LEFT JOIN product iv ON p.inverter_1=iv.bubble_id
WHERE p.type='Residential' AND p.active AND p.bubble_id LIKE '1785715200000xPKGRSTR%'
  AND (pr.id IS NULL OR iv.id IS NULL);   -- expect 0

COMMIT;
