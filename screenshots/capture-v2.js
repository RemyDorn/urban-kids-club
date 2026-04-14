const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  const sections = [
    { name: 'v2-01-hero', scroll: 0 },
    { name: 'v2-02-integrations', scroll: 1050 },
    { name: 'v2-03-stats-features', scroll: 900 },
    { name: 'v2-04-features-grid', scroll: 700 },
    { name: 'v2-05-how-it-works', scroll: 950 },
    { name: 'v2-06-case-studies', scroll: 1000 },
    { name: 'v2-07-testimonials', scroll: 1000 },
    { name: 'v2-08-pricing', scroll: 950 },
    { name: 'v2-09-faq', scroll: 950 },
    { name: 'v2-10-cta-footer', scroll: 1000 },
  ];

  for (const s of sections) {
    if (s.scroll > 0) {
      await page.evaluate((y) => window.scrollBy(0, y), s.scroll);
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `/home/user/urban-kids-club/screenshots/${s.name}.png` });
  }

  // Waitlist
  await page.goto('http://localhost:3000/waitlist', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/v2-11-waitlist.png' });

  await browser.close();
  console.log('v2 screenshots done!');
})();
