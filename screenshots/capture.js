const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // 1 - Hero
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/01-hero.png' });

  // 2 - Dashboard preview + Stats
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/02-stats.png' });

  // 3 - Features
  await page.evaluate(() => window.scrollBy(0, 950));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/03-features.png' });

  // 4 - How It Works
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/04-how-it-works.png' });

  // 5 - Case Studies
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/05-case-studies.png' });

  // 6 - Pricing
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/06-pricing.png' });

  // 7 - CTA + Footer
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/07-cta-footer.png' });

  // 8 - Waitlist page
  await page.goto('http://localhost:3000/waitlist', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/08-waitlist.png' });

  // 9 - Case Studies listing
  await page.goto('http://localhost:3000/case-studies', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/09-case-studies-list.png' });

  // 10 - Case Study detail
  await page.goto('http://localhost:3000/case-studies/gianna-bellucci', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/urban-kids-club/screenshots/10-case-study-detail.png' });

  await browser.close();
  console.log('All screenshots captured!');
})();
