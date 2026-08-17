-- ROLLBACK for commercial-string-sync-2026-08-03.sql
-- snapshot taken from prod_main before the sync (2026-08-03)
BEGIN;

-- undo step 4: reactivate the 318 legacy packages
UPDATE package SET active=true WHERE id IN (
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

-- undo step 3: restore the 61 Jinko 650W rows to their pre-sync values
UPDATE package SET invoice_desc='10X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=25960, nett_price=21300, panel_qty=10, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true WHERE id=990;
UPDATE package SET invoice_desc='11X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=27240, nett_price=22320, panel_qty=11, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true WHERE id=991;
UPDATE package SET invoice_desc='12X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 5KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=28590, nett_price=23400, panel_qty=12, panel='1771039183637x205243619540992000', inverter_1='1776182987956x606618364561138300', active=true WHERE id=992;
UPDATE package SET invoice_desc='13X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=29870, nett_price=24420, panel_qty=13, panel='1771039183637x205243619540992000', inverter_1='1776182988011x951519061695254500', active=true WHERE id=993;
UPDATE package SET invoice_desc='14X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 6KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=31280, nett_price=25540, panel_qty=14, panel='1771039183637x205243619540992000', inverter_1='1776182988011x951519061695254500', active=true WHERE id=994;
UPDATE package SET invoice_desc='15X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=32570, nett_price=26570, panel_qty=15, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true WHERE id=995;
UPDATE package SET invoice_desc='16X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=33840, nett_price=27590, panel_qty=16, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true WHERE id=996;
UPDATE package SET invoice_desc='17X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=35110, nett_price=28610, panel_qty=17, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true WHERE id=997;
UPDATE package SET invoice_desc='18X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 8KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=36400, nett_price=29630, panel_qty=18, panel='1771039183637x205243619540992000', inverter_1='1776182987917x004362228963947001', active=true WHERE id=998;
UPDATE package SET invoice_desc='19X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=37810, nett_price=30470, panel_qty=19, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true WHERE id=999;
UPDATE package SET invoice_desc='20X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=38960, nett_price=31060, panel_qty=20, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true WHERE id=1000;
UPDATE package SET invoice_desc='21X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=40240, nett_price=31770, panel_qty=21, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true WHERE id=1001;
UPDATE package SET invoice_desc='22X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 10KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=41500, nett_price=32460, panel_qty=22, panel='1771039183637x205243619540992000', inverter_1='1703753919775x906442469182537700', active=true WHERE id=1002;
UPDATE package SET invoice_desc='23X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=42890, nett_price=33220, panel_qty=23, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true WHERE id=1003;
UPDATE package SET invoice_desc='24X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=44170, nett_price=34190, panel_qty=24, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true WHERE id=1004;
UPDATE package SET invoice_desc='25X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=45430, nett_price=35140, panel_qty=25, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true WHERE id=1005;
UPDATE package SET invoice_desc='26X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=46700, nett_price=36100, panel_qty=26, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true WHERE id=1006;
UPDATE package SET invoice_desc='27X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 12KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=47960, nett_price=37080, panel_qty=27, panel='1771039183637x205243619540992000', inverter_1='1703832424223x792437775786049500', active=true WHERE id=1007;
UPDATE package SET invoice_desc='28X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=50260, nett_price=38190, panel_qty=28, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1008;
UPDATE package SET invoice_desc='29X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=52030, nett_price=39080, panel_qty=29, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1009;
UPDATE package SET invoice_desc='30X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=53590, nett_price=40310, panel_qty=30, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1010;
UPDATE package SET invoice_desc='31X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=54850, nett_price=41240, panel_qty=31, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1011;
UPDATE package SET invoice_desc='32X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=56110, nett_price=42180, panel_qty=32, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1012;
UPDATE package SET invoice_desc='33X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=57370, nett_price=43110, panel_qty=33, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1013;
UPDATE package SET invoice_desc='34X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 15KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 6mm, Earth Cable: 6mm
Master Tec 6mm DC Cable', price=58630, nett_price=44040, panel_qty=34, panel='1771039183637x205243619540992000', inverter_1='1703833938773x838044780385534000', active=true WHERE id=1014;
UPDATE package SET invoice_desc='35X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=60470, nett_price=45530, panel_qty=35, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1015;
UPDATE package SET invoice_desc='36X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=61720, nett_price=46450, panel_qty=36, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1016;
UPDATE package SET invoice_desc='37X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=65090, nett_price=49540, panel_qty=37, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1017;
UPDATE package SET invoice_desc='38X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=66340, nett_price=50470, panel_qty=38, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1018;
UPDATE package SET invoice_desc='39X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=67590, nett_price=51410, panel_qty=39, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1019;
UPDATE package SET invoice_desc='40X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=69080, nett_price=52560, panel_qty=40, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1020;
UPDATE package SET invoice_desc='41X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=70330, nett_price=53490, panel_qty=41, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1021;
UPDATE package SET invoice_desc='42X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=71590, nett_price=54410, panel_qty=42, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1022;
UPDATE package SET invoice_desc='43X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=72840, nett_price=55340, panel_qty=43, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1023;
UPDATE package SET invoice_desc='44X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=74090, nett_price=56270, panel_qty=44, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1024;
UPDATE package SET invoice_desc='45X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 20KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 10mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=75350, nett_price=57190, panel_qty=45, panel='1771039183637x205243619540992000', inverter_1='1724421132110x481560740678860800', active=true WHERE id=1025;
UPDATE package SET invoice_desc='46X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=77570, nett_price=58830, panel_qty=46, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1026;
UPDATE package SET invoice_desc='47X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=78830, nett_price=59760, panel_qty=47, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1027;
UPDATE package SET invoice_desc='48X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon  
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=80070, nett_price=60680, panel_qty=48, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1028;
UPDATE package SET invoice_desc='49X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=81360, nett_price=61620, panel_qty=49, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1124;
UPDATE package SET invoice_desc='50X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=82650, nett_price=62570, panel_qty=50, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1125;
UPDATE package SET invoice_desc='51X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=83940, nett_price=63520, panel_qty=51, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1126;
UPDATE package SET invoice_desc='52X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=85230, nett_price=64460, panel_qty=52, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1127;
UPDATE package SET invoice_desc='53X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=86510, nett_price=65410, panel_qty=53, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1128;
UPDATE package SET invoice_desc='54X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=87800, nett_price=66350, panel_qty=54, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1129;
UPDATE package SET invoice_desc='55X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 25KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 16mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=89090, nett_price=67300, panel_qty=55, panel='1771039183637x205243619540992000', inverter_1='1725960619328x718293570166456300', active=true WHERE id=1130;
UPDATE package SET invoice_desc='56X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=92780, nett_price=70720, panel_qty=56, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1131;
UPDATE package SET invoice_desc='57X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=94060, nett_price=71660, panel_qty=57, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1132;
UPDATE package SET invoice_desc='58X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=95350, nett_price=72600, panel_qty=58, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1133;
UPDATE package SET invoice_desc='59X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=96630, nett_price=73540, panel_qty=59, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1134;
UPDATE package SET invoice_desc='60X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=97910, nett_price=74490, panel_qty=60, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1135;
UPDATE package SET invoice_desc='61X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=99200, nett_price=75440, panel_qty=61, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1136;
UPDATE package SET invoice_desc='62X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=100480, nett_price=76370, panel_qty=62, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1137;
UPDATE package SET invoice_desc='63X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=101760, nett_price=77320, panel_qty=63, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1138;
UPDATE package SET invoice_desc='64X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=103040, nett_price=78260, panel_qty=64, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1139;
UPDATE package SET invoice_desc='65X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=104320, nett_price=79200, panel_qty=65, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1140;
UPDATE package SET invoice_desc='66X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=105610, nett_price=80140, panel_qty=66, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1141;
UPDATE package SET invoice_desc='67X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 30KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=106890, nett_price=81080, panel_qty=67, panel='1771039183637x205243619540992000', inverter_1='1725962092667x484135533310902300', active=true WHERE id=1142;
UPDATE package SET invoice_desc='68X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=109630, nett_price=83530, panel_qty=68, panel='1771039183637x205243619540992000', inverter_1='1725962178479x327901387212455940', active=true WHERE id=1143;
UPDATE package SET invoice_desc='69X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=110900, nett_price=84470, panel_qty=69, panel='1771039183637x205243619540992000', inverter_1='1725962178479x327901387212455940', active=true WHERE id=1144;
UPDATE package SET invoice_desc='70X 650W JinkoSolar TIGER NEO 3.0 Panel N-Type TOPCon
1X [3P] SAJ R6 40KW String Inverter
1X SEDA ATAP Application
TNB Smart Meter Application
Solar System Architecture Design
Electrical System Design
Roof and Site Surveying
Roof Panel Installation
Electrical Works
SkyLift
MEGA Cable AC Cable: 25mm, Earth Cable: 10mm
Master Tec 6mm DC Cable', price=112180, nett_price=85410, panel_qty=70, panel='1771039183637x205243619540992000', inverter_1='1725962178479x327901387212455940', active=true WHERE id=1145;

-- undo step 2: remove the inserted Astronergy packages and their items
DELETE FROM package      WHERE bubble_id LIKE '1785715200000xPKGASTRO%';
DELETE FROM package_item WHERE bubble_id LIKE '1785715200000xITEMASTRO%';

-- undo step 1: product 122 bubble_id back to NULL
UPDATE product SET bubble_id=NULL WHERE id=122 AND bubble_id='1785715200000x000000000000000122';

COMMIT;
