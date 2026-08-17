-- Commercial STRING package sync from Google Sheet gid=2110465309 (fetched 2026-08-03)
-- Source of truth: database/package_import/commercial-string-2026-08-03.json
-- Scope: package.type = 'Tariff B&D Low Voltage'
-- 1) give product 122 (Astronergy 625W) a bubble_id   2) insert 61 Astronergy packages
-- 3) refresh invoice_desc on the 61 existing Jinko 650W packages   4) deactivate 318 legacy rows
BEGIN;

-- === STEP 1: Astronergy Astro N7 TOPCon 625W needs a bubble_id (package.panel is an FK to product.bubble_id)
UPDATE product SET bubble_id = '1785715200000x000000000000000122', updated_at = now()
WHERE id = 122 AND bubble_id IS NULL;

-- === STEP 2: 61 new COMMERCIAL nPCS ASTRONERGY 625W packages (items first, then package)
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO10P', '1785715200000x000000000000000122', 10, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO10I', '1776182987956x606618364561138300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO10', 'COMMERCIAL 10PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 10, 25260, 20600,
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
        ARRAY['1785715200000xITEMASTRO10P','1785715200000xITEMASTRO10I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO11P', '1785715200000x000000000000000122', 11, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO11I', '1776182987956x606618364561138300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO11', 'COMMERCIAL 11PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 11, 26470, 21550,
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
        ARRAY['1785715200000xITEMASTRO11P','1785715200000xITEMASTRO11I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO12P', '1785715200000x000000000000000122', 12, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO12I', '1776182987956x606618364561138300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO12', 'COMMERCIAL 12PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 12, 27750, 22560,
        '1785715200000x000000000000000122', '1776182987956x606618364561138300', '12X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO12P','1785715200000xITEMASTRO12I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO13P', '1785715200000x000000000000000122', 13, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO13I', '1776182988011x951519061695254500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO13', 'COMMERCIAL 13PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 13, 28960, 23510,
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
        ARRAY['1785715200000xITEMASTRO13P','1785715200000xITEMASTRO13I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO14P', '1785715200000x000000000000000122', 14, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO14I', '1776182988011x951519061695254500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO14', 'COMMERCIAL 14PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 14, 30300, 24560,
        '1785715200000x000000000000000122', '1776182988011x951519061695254500', '14X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO14P','1785715200000xITEMASTRO14I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO15P', '1785715200000x000000000000000122', 15, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO15I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO15', 'COMMERCIAL 15PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 15, 31520, 25520,
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
        ARRAY['1785715200000xITEMASTRO15P','1785715200000xITEMASTRO15I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO16P', '1785715200000x000000000000000122', 16, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO16I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO16', 'COMMERCIAL 16PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 16, 32720, 26470,
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
        ARRAY['1785715200000xITEMASTRO16P','1785715200000xITEMASTRO16I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO17P', '1785715200000x000000000000000122', 17, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO17I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO17', 'COMMERCIAL 17PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 17, 33920, 27420,
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
        ARRAY['1785715200000xITEMASTRO17P','1785715200000xITEMASTRO17I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO18P', '1785715200000x000000000000000122', 18, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO18I', '1776182987917x004362228963947001', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO18', 'COMMERCIAL 18PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 18, 35140, 28370,
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
        ARRAY['1785715200000xITEMASTRO18P','1785715200000xITEMASTRO18I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO19P', '1785715200000x000000000000000122', 19, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO19I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO19', 'COMMERCIAL 19PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 19, 36480, 29140,
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
        ARRAY['1785715200000xITEMASTRO19P','1785715200000xITEMASTRO19I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO20P', '1785715200000x000000000000000122', 20, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO20I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO20', 'COMMERCIAL 20PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 20, 37560, 29660,
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
        ARRAY['1785715200000xITEMASTRO20P','1785715200000xITEMASTRO20I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO21P', '1785715200000x000000000000000122', 21, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO21I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO21', 'COMMERCIAL 21PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 21, 38770, 30300,
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
        ARRAY['1785715200000xITEMASTRO21P','1785715200000xITEMASTRO21I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO22P', '1785715200000x000000000000000122', 22, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO22I', '1703753919775x906442469182537700', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO22', 'COMMERCIAL 22PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 22, 39960, 30920,
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
        ARRAY['1785715200000xITEMASTRO22P','1785715200000xITEMASTRO22I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO23P', '1785715200000x000000000000000122', 23, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO23I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO23', 'COMMERCIAL 23PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 23, 41280, 31610,
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
        ARRAY['1785715200000xITEMASTRO23P','1785715200000xITEMASTRO23I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO24P', '1785715200000x000000000000000122', 24, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO24I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO24', 'COMMERCIAL 24PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 24, 42490, 32510,
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
        ARRAY['1785715200000xITEMASTRO24P','1785715200000xITEMASTRO24I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO25P', '1785715200000x000000000000000122', 25, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO25I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO25', 'COMMERCIAL 25PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 25, 43680, 33390,
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
        ARRAY['1785715200000xITEMASTRO25P','1785715200000xITEMASTRO25I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO26P', '1785715200000x000000000000000122', 26, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO26I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO26', 'COMMERCIAL 26PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 26, 44880, 34280,
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
        ARRAY['1785715200000xITEMASTRO26P','1785715200000xITEMASTRO26I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO27P', '1785715200000x000000000000000122', 27, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO27I', '1703832424223x792437775786049500', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO27', 'COMMERCIAL 27PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 27, 46070, 35190,
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
        ARRAY['1785715200000xITEMASTRO27P','1785715200000xITEMASTRO27I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO28P', '1785715200000x000000000000000122', 28, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO28I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO28', 'COMMERCIAL 28PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 28, 48300, 36230,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '28X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO28P','1785715200000xITEMASTRO28I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO29P', '1785715200000x000000000000000122', 29, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO29I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO29', 'COMMERCIAL 29PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 29, 50000, 37050,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '29X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO29P','1785715200000xITEMASTRO29I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO30P', '1785715200000x000000000000000122', 30, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO30I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO30', 'COMMERCIAL 30PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 30, 51490, 38210,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '30X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO30P','1785715200000xITEMASTRO30I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO31P', '1785715200000x000000000000000122', 31, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO31I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO31', 'COMMERCIAL 31PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 31, 52680, 39070,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '31X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO31P','1785715200000xITEMASTRO31I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO32P', '1785715200000x000000000000000122', 32, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO32I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO32', 'COMMERCIAL 32PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 32, 53870, 39940,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '32X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO32P','1785715200000xITEMASTRO32I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO33P', '1785715200000x000000000000000122', 33, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO33I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO33', 'COMMERCIAL 33PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 33, 55060, 40800,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '33X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO33P','1785715200000xITEMASTRO33I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO34P', '1785715200000x000000000000000122', 34, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO34I', '1703833938773x838044780385534000', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO34', 'COMMERCIAL 34PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 34, 56250, 41660,
        '1785715200000x000000000000000122', '1703833938773x838044780385534000', '34X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO34P','1785715200000xITEMASTRO34I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO35P', '1785715200000x000000000000000122', 35, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO35I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO35', 'COMMERCIAL 35PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 35, 58020, 43080,
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
        ARRAY['1785715200000xITEMASTRO35P','1785715200000xITEMASTRO35I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO36P', '1785715200000x000000000000000122', 36, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO36I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO36', 'COMMERCIAL 36PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 36, 59200, 43930,
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
        ARRAY['1785715200000xITEMASTRO36P','1785715200000xITEMASTRO36I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO37P', '1785715200000x000000000000000122', 37, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO37I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO37', 'COMMERCIAL 37PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 37, 62500, 46950,
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
        ARRAY['1785715200000xITEMASTRO37P','1785715200000xITEMASTRO37I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO38P', '1785715200000x000000000000000122', 38, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO38I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO38', 'COMMERCIAL 38PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 38, 63680, 47810,
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
        ARRAY['1785715200000xITEMASTRO38P','1785715200000xITEMASTRO38I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO39P', '1785715200000x000000000000000122', 39, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO39I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO39', 'COMMERCIAL 39PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 39, 64860, 48680,
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
        ARRAY['1785715200000xITEMASTRO39P','1785715200000xITEMASTRO39I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO40P', '1785715200000x000000000000000122', 40, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO40I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO40', 'COMMERCIAL 40PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 40, 66280, 49760,
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
        ARRAY['1785715200000xITEMASTRO40P','1785715200000xITEMASTRO40I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO41P', '1785715200000x000000000000000122', 41, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO41I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO41', 'COMMERCIAL 41PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 41, 67460, 50620,
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
        ARRAY['1785715200000xITEMASTRO41P','1785715200000xITEMASTRO41I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO42P', '1785715200000x000000000000000122', 42, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO42I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO42', 'COMMERCIAL 42PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 42, 68650, 51470,
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
        ARRAY['1785715200000xITEMASTRO42P','1785715200000xITEMASTRO42I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO43P', '1785715200000x000000000000000122', 43, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO43I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO43', 'COMMERCIAL 43PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 43, 69830, 52330,
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
        ARRAY['1785715200000xITEMASTRO43P','1785715200000xITEMASTRO43I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO44P', '1785715200000x000000000000000122', 44, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO44I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO44', 'COMMERCIAL 44PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 44, 71010, 53190,
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
        ARRAY['1785715200000xITEMASTRO44P','1785715200000xITEMASTRO44I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO45P', '1785715200000x000000000000000122', 45, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO45I', '1724421132110x481560740678860800', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO45', 'COMMERCIAL 45PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 45, 72200, 54040,
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
        ARRAY['1785715200000xITEMASTRO45P','1785715200000xITEMASTRO45I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO46P', '1785715200000x000000000000000122', 46, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO46I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO46', 'COMMERCIAL 46PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 46, 74350, 55610,
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
        ARRAY['1785715200000xITEMASTRO46P','1785715200000xITEMASTRO46I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO47P', '1785715200000x000000000000000122', 47, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO47I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO47', 'COMMERCIAL 47PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 47, 75540, 56470,
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
        ARRAY['1785715200000xITEMASTRO47P','1785715200000xITEMASTRO47I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO48P', '1785715200000x000000000000000122', 48, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO48I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO48', 'COMMERCIAL 48PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 48, 76710, 57320,
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
        ARRAY['1785715200000xITEMASTRO48P','1785715200000xITEMASTRO48I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO49P', '1785715200000x000000000000000122', 49, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO49I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO49', 'COMMERCIAL 49PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 49, 77930, 58190,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '49X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO49P','1785715200000xITEMASTRO49I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO50P', '1785715200000x000000000000000122', 50, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO50I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO50', 'COMMERCIAL 50PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 50, 79150, 59070,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '50X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO50P','1785715200000xITEMASTRO50I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO51P', '1785715200000x000000000000000122', 51, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO51I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO51', 'COMMERCIAL 51PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 51, 80370, 59950,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '51X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO51P','1785715200000xITEMASTRO51I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO52P', '1785715200000x000000000000000122', 52, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO52I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO52', 'COMMERCIAL 52PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 52, 81590, 60820,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '52X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO52P','1785715200000xITEMASTRO52I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO53P', '1785715200000x000000000000000122', 53, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO53I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO53', 'COMMERCIAL 53PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 53, 82800, 61700,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '53X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO53P','1785715200000xITEMASTRO53I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO54P', '1785715200000x000000000000000122', 54, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO54I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO54', 'COMMERCIAL 54PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 54, 84020, 62570,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '54X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO54P','1785715200000xITEMASTRO54I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO55P', '1785715200000x000000000000000122', 55, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO55I', '1725960619328x718293570166456300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO55', 'COMMERCIAL 55PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 55, 85240, 63450,
        '1785715200000x000000000000000122', '1725960619328x718293570166456300', '55X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO55P','1785715200000xITEMASTRO55I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO56P', '1785715200000x000000000000000122', 56, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO56I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO56', 'COMMERCIAL 56PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 56, 88860, 66800,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '56X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO56P','1785715200000xITEMASTRO56I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO57P', '1785715200000x000000000000000122', 57, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO57I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO57', 'COMMERCIAL 57PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 57, 90070, 67670,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '57X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO57P','1785715200000xITEMASTRO57I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO58P', '1785715200000x000000000000000122', 58, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO58I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO58', 'COMMERCIAL 58PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 58, 91290, 68540,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '58X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO58P','1785715200000xITEMASTRO58I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO59P', '1785715200000x000000000000000122', 59, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO59I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO59', 'COMMERCIAL 59PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 59, 92500, 69410,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '59X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO59P','1785715200000xITEMASTRO59I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO60P', '1785715200000x000000000000000122', 60, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO60I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO60', 'COMMERCIAL 60PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 60, 93710, 70290,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '60X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO60P','1785715200000xITEMASTRO60I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO61P', '1785715200000x000000000000000122', 61, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO61I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO61', 'COMMERCIAL 61PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 61, 94930, 71170,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '61X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO61P','1785715200000xITEMASTRO61I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO62P', '1785715200000x000000000000000122', 62, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO62I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO62', 'COMMERCIAL 62PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 62, 96140, 72030,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '62X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO62P','1785715200000xITEMASTRO62I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO63P', '1785715200000x000000000000000122', 63, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO63I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO63', 'COMMERCIAL 63PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 63, 97350, 72910,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '63X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO63P','1785715200000xITEMASTRO63I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO64P', '1785715200000x000000000000000122', 64, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO64I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO64', 'COMMERCIAL 64PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 64, 98560, 73780,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '64X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO64P','1785715200000xITEMASTRO64I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO65P', '1785715200000x000000000000000122', 65, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO65I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO65', 'COMMERCIAL 65PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 65, 99770, 74650,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '65X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO65P','1785715200000xITEMASTRO65I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO66P', '1785715200000x000000000000000122', 66, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO66I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO66', 'COMMERCIAL 66PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 66, 100990, 75520,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '66X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO66P','1785715200000xITEMASTRO66I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO67P', '1785715200000x000000000000000122', 67, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO67I', '1725962092667x484135533310902300', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO67', 'COMMERCIAL 67PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 67, 102200, 76390,
        '1785715200000x000000000000000122', '1725962092667x484135533310902300', '67X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO67P','1785715200000xITEMASTRO67I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO68P', '1785715200000x000000000000000122', 68, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO68I', '1725962178479x327901387212455940', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO68', 'COMMERCIAL 68PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 68, 104870, 78770,
        '1785715200000x000000000000000122', '1725962178479x327901387212455940', '68X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO68P','1785715200000xITEMASTRO68I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO69P', '1785715200000x000000000000000122', 69, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO69I', '1725962178479x327901387212455940', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO69', 'COMMERCIAL 69PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 69, 106070, 79640,
        '1785715200000x000000000000000122', '1725962178479x327901387212455940', '69X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO69P','1785715200000xITEMASTRO69I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();
INSERT INTO package_item (bubble_id, product, qty, sort, total_cost, inventory, created_date, modified_date)
VALUES ('1785715200000xITEMASTRO70P', '1785715200000x000000000000000122', 70, 1, 0, NULL, now(), now()),
       ('1785715200000xITEMASTRO70I', '1725962178479x327901387212455940', 1, 2, 0, NULL, now(), now())
ON CONFLICT (bubble_id) DO UPDATE SET product=EXCLUDED.product, qty=EXCLUDED.qty, sort=EXCLUDED.sort, modified_date=now();
INSERT INTO package (bubble_id, package_name, type, panel_qty, price, nett_price, panel, inverter_1,
                     invoice_desc, linked_package_item, active, special, need_approval, modified_date)
VALUES ('1785715200000xPKGASTRO70', 'COMMERCIAL 70PCS ASTRONERGY 625W', 'Tariff B&D Low Voltage', 70, 107280, 80510,
        '1785715200000x000000000000000122', '1725962178479x327901387212455940', '70X 625W Astronergy ASTRO N7 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift',
        ARRAY['1785715200000xITEMASTRO70P','1785715200000xITEMASTRO70I']::text[], true, false, false, now())
ON CONFLICT (bubble_id) DO UPDATE SET package_name=EXCLUDED.package_name, panel_qty=EXCLUDED.panel_qty,
  price=EXCLUDED.price, nett_price=EXCLUDED.nett_price, panel=EXCLUDED.panel, inverter_1=EXCLUDED.inverter_1,
  invoice_desc=EXCLUDED.invoice_desc, linked_package_item=EXCLUDED.linked_package_item,
  active=true, type=EXCLUDED.type, modified_date=now();

-- === STEP 3: refresh the 61 existing Jinko 650W packages (sheet is authoritative; cable lines intentionally dropped)
UPDATE package SET invoice_desc='10X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=25960, nett_price=21300,
  panel_qty=10, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true, modified_date=now()
WHERE id=990;
UPDATE package SET invoice_desc='11X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=27240, nett_price=22320,
  panel_qty=11, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true, modified_date=now()
WHERE id=991;
UPDATE package SET invoice_desc='12X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=28590, nett_price=23400,
  panel_qty=12, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true, modified_date=now()
WHERE id=992;
UPDATE package SET invoice_desc='13X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=29870, nett_price=24420,
  panel_qty=13, panel='1771039183637x205243619540992000', inverter_1='1776182988011x951519061695254500', active=true, modified_date=now()
WHERE id=993;
UPDATE package SET invoice_desc='14X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=31280, nett_price=25540,
  panel_qty=14, panel='1771039183637x205243619540992000', inverter_1='1776182988011x951519061695254500', active=true, modified_date=now()
WHERE id=994;
UPDATE package SET invoice_desc='15X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=32570, nett_price=26570,
  panel_qty=15, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, modified_date=now()
WHERE id=995;
UPDATE package SET invoice_desc='16X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=33840, nett_price=27590,
  panel_qty=16, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, modified_date=now()
WHERE id=996;
UPDATE package SET invoice_desc='17X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=35110, nett_price=28610,
  panel_qty=17, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, modified_date=now()
WHERE id=997;
UPDATE package SET invoice_desc='18X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=36400, nett_price=29630,
  panel_qty=18, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true, modified_date=now()
WHERE id=998;
UPDATE package SET invoice_desc='19X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=37810, nett_price=30470,
  panel_qty=19, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, modified_date=now()
WHERE id=999;
UPDATE package SET invoice_desc='20X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=38960, nett_price=31060,
  panel_qty=20, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, modified_date=now()
WHERE id=1000;
UPDATE package SET invoice_desc='21X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=40240, nett_price=31770,
  panel_qty=21, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, modified_date=now()
WHERE id=1001;
UPDATE package SET invoice_desc='22X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=41500, nett_price=32460,
  panel_qty=22, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true, modified_date=now()
WHERE id=1002;
UPDATE package SET invoice_desc='23X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=42890, nett_price=33220,
  panel_qty=23, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, modified_date=now()
WHERE id=1003;
UPDATE package SET invoice_desc='24X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=44170, nett_price=34190,
  panel_qty=24, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, modified_date=now()
WHERE id=1004;
UPDATE package SET invoice_desc='25X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=45430, nett_price=35140,
  panel_qty=25, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, modified_date=now()
WHERE id=1005;
UPDATE package SET invoice_desc='26X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=46700, nett_price=36100,
  panel_qty=26, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, modified_date=now()
WHERE id=1006;
UPDATE package SET invoice_desc='27X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=47960, nett_price=37080,
  panel_qty=27, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true, modified_date=now()
WHERE id=1007;
UPDATE package SET invoice_desc='28X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=50260, nett_price=38190,
  panel_qty=28, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1008;
UPDATE package SET invoice_desc='29X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=52030, nett_price=39080,
  panel_qty=29, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1009;
UPDATE package SET invoice_desc='30X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=53590, nett_price=40310,
  panel_qty=30, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1010;
UPDATE package SET invoice_desc='31X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=54850, nett_price=41240,
  panel_qty=31, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1011;
UPDATE package SET invoice_desc='32X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=56110, nett_price=42180,
  panel_qty=32, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1012;
UPDATE package SET invoice_desc='33X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=57370, nett_price=43110,
  panel_qty=33, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1013;
UPDATE package SET invoice_desc='34X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=58630, nett_price=44040,
  panel_qty=34, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true, modified_date=now()
WHERE id=1014;
UPDATE package SET invoice_desc='35X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=60470, nett_price=45530,
  panel_qty=35, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1015;
UPDATE package SET invoice_desc='36X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=61720, nett_price=46450,
  panel_qty=36, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1016;
UPDATE package SET invoice_desc='37X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=65090, nett_price=49540,
  panel_qty=37, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1017;
UPDATE package SET invoice_desc='38X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=66340, nett_price=50470,
  panel_qty=38, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1018;
UPDATE package SET invoice_desc='39X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=67590, nett_price=51410,
  panel_qty=39, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1019;
UPDATE package SET invoice_desc='40X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=69080, nett_price=52560,
  panel_qty=40, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1020;
UPDATE package SET invoice_desc='41X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=70330, nett_price=53490,
  panel_qty=41, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1021;
UPDATE package SET invoice_desc='42X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=71590, nett_price=54410,
  panel_qty=42, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1022;
UPDATE package SET invoice_desc='43X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=72840, nett_price=55340,
  panel_qty=43, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1023;
UPDATE package SET invoice_desc='44X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=74090, nett_price=56270,
  panel_qty=44, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1024;
UPDATE package SET invoice_desc='45X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=75350, nett_price=57190,
  panel_qty=45, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true, modified_date=now()
WHERE id=1025;
UPDATE package SET invoice_desc='46X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=77570, nett_price=58830,
  panel_qty=46, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1026;
UPDATE package SET invoice_desc='47X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=78830, nett_price=59760,
  panel_qty=47, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1027;
UPDATE package SET invoice_desc='48X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=80070, nett_price=60680,
  panel_qty=48, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1028;
UPDATE package SET invoice_desc='49X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=81360, nett_price=61620,
  panel_qty=49, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1124;
UPDATE package SET invoice_desc='50X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=82650, nett_price=62570,
  panel_qty=50, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1125;
UPDATE package SET invoice_desc='51X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=83940, nett_price=63520,
  panel_qty=51, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1126;
UPDATE package SET invoice_desc='52X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=85230, nett_price=64460,
  panel_qty=52, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1127;
UPDATE package SET invoice_desc='53X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=86510, nett_price=65410,
  panel_qty=53, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1128;
UPDATE package SET invoice_desc='54X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=87800, nett_price=66350,
  panel_qty=54, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1129;
UPDATE package SET invoice_desc='55X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=89090, nett_price=67300,
  panel_qty=55, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true, modified_date=now()
WHERE id=1130;
UPDATE package SET invoice_desc='56X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=92780, nett_price=70720,
  panel_qty=56, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1131;
UPDATE package SET invoice_desc='57X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=94060, nett_price=71660,
  panel_qty=57, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1132;
UPDATE package SET invoice_desc='58X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=95350, nett_price=72600,
  panel_qty=58, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1133;
UPDATE package SET invoice_desc='59X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=96630, nett_price=73540,
  panel_qty=59, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1134;
UPDATE package SET invoice_desc='60X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=97910, nett_price=74490,
  panel_qty=60, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1135;
UPDATE package SET invoice_desc='61X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=99200, nett_price=75440,
  panel_qty=61, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1136;
UPDATE package SET invoice_desc='62X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=100480, nett_price=76370,
  panel_qty=62, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1137;
UPDATE package SET invoice_desc='63X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=101760, nett_price=77320,
  panel_qty=63, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1138;
UPDATE package SET invoice_desc='64X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=103040, nett_price=78260,
  panel_qty=64, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1139;
UPDATE package SET invoice_desc='65X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=104320, nett_price=79200,
  panel_qty=65, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1140;
UPDATE package SET invoice_desc='66X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=105610, nett_price=80140,
  panel_qty=66, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1141;
UPDATE package SET invoice_desc='67X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=106890, nett_price=81080,
  panel_qty=67, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true, modified_date=now()
WHERE id=1142;
UPDATE package SET invoice_desc='68X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=109630, nett_price=83530,
  panel_qty=68, panel='1771039183637x205243619540992000', inverter_1='1725962178479x327901387212455940', active=true, modified_date=now()
WHERE id=1143;
UPDATE package SET invoice_desc='69X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=110900, nett_price=84470,
  panel_qty=69, panel='1771039183637x205243619540992000', inverter_1='1725962178479x327901387212455940', active=true, modified_date=now()
WHERE id=1144;
UPDATE package SET invoice_desc='70X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift', price=112180, nett_price=85410,
  panel_qty=70, panel='1771039183637x205243619540992000', inverter_1='1725962178479x327901387212455940', active=true, modified_date=now()
WHERE id=1145;

-- === STEP 4: deactivate 318 legacy commercial packages absent from the sheet (590W / 620W Jinko generation)
UPDATE package SET active=false, modified_date=now() WHERE id IN (
  152, 154, 156, 158, 160, 162, 164, 166, 168, 170, 172, 174, 176, 178, 180, 182, 184, 186, 188, 190,
  192, 194, 196, 198, 200, 202, 204, 206, 208, 210, 212, 214, 216, 218, 220, 222, 224, 226, 228, 230,
  232, 234, 236, 238, 240, 242, 244, 246, 248, 250, 252, 254, 257, 259, 261, 263, 265, 267, 269, 271,
  273, 275, 277, 279, 281, 283, 285, 287, 289, 291, 293, 295, 297, 299, 301, 303, 305, 307, 309, 311,
  313, 315, 317, 319, 321, 323, 325, 327, 329, 331, 333, 335, 337, 339, 341, 343, 345, 347, 349, 351,
  353, 355, 357, 359, 361, 363, 365, 367, 369, 371, 373, 384, 385, 390, 533, 534, 535, 536, 537, 538,
  539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558,
  559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578,
  579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598,
  599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618,
  619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638,
  639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658,
  659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678,
  679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698,
  699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 718,
  719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 742
);

-- === VERIFY (run before COMMIT)
SELECT count(*) FILTER (WHERE active) AS active_now,
       count(*) FILTER (WHERE active AND package_name ILIKE '%ASTRONERGY 625W%') AS astro_active,
       count(*) FILTER (WHERE active AND package_name ILIKE '%JINKO 650W%')      AS jinko_active
FROM package WHERE type='Tariff B&D Low Voltage';   -- expect 122 / 61 / 61

SELECT count(*) AS unresolvable_panel FROM package p
LEFT JOIN product pr ON p.panel=pr.bubble_id
WHERE p.type='Tariff B&D Low Voltage' AND p.active AND pr.id IS NULL;   -- expect 0

COMMIT;
