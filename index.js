const express = require('express');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 5050;

// dev vs prod config
const isProd = process.env.NODE_ENV === 'production';

// Launch browser once and reuse it
let browserPromise = chromium.launch({
  headless: isProd,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',  // ← crucial
  ],
});

app.get('/health', (_req, res) => res.send('ok'));

app.get('/scrape/remoterocketship', async (_req, res) => {
  const URL =
    'https://www.remoterocketship.com/?page=1&sort=DateAdded&locations=Worldwide%2CEurope&jobTitle=Frontend+Engineer';

  let context;
  let page;

  try {
    const browser = await browserPromise;

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      locale: 'en-US',
    });

    page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      delete navigator.__proto__.webdriver;
    });

    console.log('Loading page...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    console.log('Scrolling to bottom...');
    let previousHeight = 0;
    for (let i = 0; i < 40; i++) {
      const currentHeight = await page.evaluate('document.body.scrollHeight');
      if (currentHeight === previousHeight) break;
      previousHeight = currentHeight;

      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await page.waitForTimeout(1000);
    }

    console.log('Extracting titles + links...');

    const html = await page.content();
    console.log("HTML LENGTH:", html.length);
    console.log(html.slice(0, 1000));

    const jobs = await page.$$eval(
      'h3.text-lg.font-semibold.text-primary.mr-4',
      (titleNodes) =>
        titleNodes.map((h3) => {
          const linkEl = h3.querySelector('a[href]');
          const title = linkEl
            ? linkEl.innerText.trim()
            : h3.innerText.trim();

          const link = linkEl ? linkEl.href : null;

          return { title, link };
        })
    );

    // in prod we'll usually close the context to avoid leaks
    await context.close();

    res.json({
      ok: true,
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    console.error('ERROR:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper listening at http://localhost:${PORT}/scrape/remoterocketship`);
});
