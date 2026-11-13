// Builds google-review-bonus.html (1080x1080) and exports google-review-bonus.png.
// Run: node google-review-campaign/build.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');

const REVIEW_URL =
  'https://www.google.com/maps/place/Eternalgy+Sdn+Bhd/@1.5519339,103.7825061,17z/data=!4m8!3m7!1s0x31da6db9f2e0d68f:0xe30f21260dcdbc70!8m2!3d1.5519285!4d103.785081!9m1!1b1!16s%2Fg%2F11l5l59cd3?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D';

const star = '<svg viewBox="0 0 24 24" width="62" height="62"><path fill="#F6A81C" d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.8 5.6 21.4 7 14.3 1.7 9.3l7.2-.9z"/></svg>';

(async () => {
  // Official white logo (public/logo.png), trimmed to its artwork so it sits flush on the navy header.
  const logoBuf = await sharp(path.join(__dirname, '../public/logo.png')).extract({ left: 32, top: 44, width: 906, height: 121 }).png().toBuffer();
  const logo = `data:image/png;base64,${logoBuf.toString('base64')}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Eternalgy Google Map Review Bonus Campaign</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --navy:#0E2A47; --navy2:#1D4A78; --blue:#2F6DA8; --sky:#E9F1FA; --sun:#F6A81C; --sunbg:#FFF3D9; --sunink:#7A4B00;
    --ink:#14263A; --mut:#5A6B7D; --line:#D5DFEA; --bg:#FFFFFF; --onnavy:#FFFFFF; --onnavy2:#BBD0E6;
  }
  * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html, body { width:1080px; height:1080px; background:var(--bg); }
  body { font-family:"Inter","Noto Sans SC","Microsoft YaHei",sans-serif; color:var(--ink); }
  .card { width:1080px; height:1080px; display:flex; flex-direction:column; overflow:hidden; }

  .hero { background:var(--navy); color:var(--onnavy); padding:46px 72px 36px; border-bottom:6px solid var(--sun); position:relative; }
  .logo { display:block; height:62px; width:auto; }
  .tag { display:block; margin-top:26px; font-weight:800; font-size:21px; letter-spacing:.14em; text-transform:uppercase; color:var(--onnavy2); }
  .tag b { color:var(--sun); font-weight:800; }
  h1 { font-weight:900; font-size:78px; line-height:1.04; margin-top:14px; letter-spacing:-.01em; }
  .bonusrow { display:flex; align-items:center; gap:26px; margin-top:24px; }
  .rm { background:var(--sun); color:var(--navy); font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:128px; line-height:1; padding:6px 26px 2px; border-radius:4px; }
  .bonus-text { font-size:38px; font-weight:700; line-height:1.25; color:var(--onnavy); }
  .bonus-text span { color:var(--onnavy2); font-weight:600; font-size:30px; display:block; }

  .stars { display:flex; gap:10px; padding:20px 72px 0; }

  .steps { padding:6px 72px 0; flex:1; display:flex; flex-direction:column; justify-content:space-evenly; min-height:0; }
  .step { display:flex; align-items:center; gap:30px; padding:16px 0; border-bottom:1px solid var(--line); }
  .step:last-child { border-bottom:0; }
  .num { font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:96px; line-height:.9; color:var(--navy2); width:60px; text-align:center; }
  .step p { font-size:37px; font-weight:700; line-height:1.28; color:var(--ink); flex:1; }
  .step p em { font-style:normal; color:var(--navy2); }
  .step p .hl { white-space:nowrap; background:var(--sunbg); color:var(--sunink); padding:0 8px; border-radius:3px; }

  .foot { background:var(--sky); padding:22px 72px; display:flex; justify-content:space-between; align-items:center; }
  .foot b { font-weight:900; font-size:26px; color:var(--navy); letter-spacing:.04em; }
  .foot span { font-size:21px; color:var(--mut); font-weight:600; }
</style>
</head>
<body>
<div class="card">
  <div class="hero">
    <img class="logo" src="${logo}" alt="Eternalgy">
    <div class="tag">Google Map Review Bonus Campaign</div>
    <h1>Give us a 5 star review</h1>
    <div class="bonusrow">
      <div class="rm">RM15</div>
      <div class="bonus-text">Touch 'n Go top-up bonus<span>for your 5 star review</span></div>
    </div>
  </div>

  <div class="stars">${star.repeat(5)}</div>

  <div class="steps">
    <div class="step">
      <div class="num">1</div>
      <p>Follow the link to leave us a <span class="hl">5 star review</span></p>
    </div>
    <div class="step">
      <div class="num">2</div>
      <p>Send us a <em>screenshot</em> of your review</p>
    </div>
    <div class="step">
      <div class="num">3</div>
      <p><span class="hl">5 working days</span> to receive your TNG Bonus</p>
    </div>
  </div>

  <div class="foot"><b>ETERNALGY SDN BHD</b><span>Thank you for choosing solar with us</span></div>
</div>
</body>
</html>`;

  const htmlPath = path.join(__dirname, 'google-review-bonus.html');
  fs.writeFileSync(htmlPath, html);

  const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    .find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(__dirname, 'google-review-bonus.png'), clip: { x: 0, y: 0, width: 1080, height: 1080 } });
  } finally {
    await browser.close();
  }
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
