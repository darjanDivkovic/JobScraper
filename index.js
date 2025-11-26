const express = require('express');
const { chromium } = require('playwright');
const { scrollDown, sleep } = require('./utils');

const app = express();
const PORT = process.env.PORT || 5050;

// dev vs prod config
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// Launch browser once and reuse it
let browserPromise = chromium.launch({
  headless: false,
  slowMo: 1000,
});

app.get('/health', (_req, res) => res.send('ok'));

app.get('/scrape/remoterocketship', async (_req, res) => {
  const URL =
    'https://www.remoterocketship.com/?page=1&sort=DateAdded&locations=Worldwide%2CEurope&jobTitle=Frontend+Engineer';

  let context;
  let page;

  try {
    const browser = await browserPromise;

    context = await browser.newContext();

    page = await context.newPage();

    console.log('Loading page...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await scrollDown(page, 40)

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

app.post('/scrape/remoterocketship/pages', async (req, res) => {
  const { jobs } = req.body;
  if (!jobs || !Array.isArray(jobs)) {
    return res.status(400).json({ ok: false, error: 'jobs must be an array' });
  }

  const browser = await browserPromise;
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  for (const job of jobs) {
    console.log('Scraping:', job.link);

    try {
      await page.goto(job.link, { waitUntil: 'networkidle', timeout: 3000 });

      const blocked = await page.evaluate(() => 
        document.body.innerText.includes('Failed to verify your browser')
      );

      if (blocked) {
        results.push({ ...job, blocked: true, details: null });
        continue;
      }

      const details = await page.evaluate(() => {
        // Company name
        const companyName = document.querySelector('h2.text-lg.font-semibold.text-center.text-primary.mb-1.mt-2')?.textContent.trim() || null;

        // Company description
        const companyDescription = document.querySelector('p.text-lg.text-secondary.mb-4.mr-6.whitespace-pre-wrap')?.textContent.trim() || null;

        // Job pills + skills pills
        const containers = document.querySelectorAll('div.flex.flex-row.flex-wrap.items-center.mt-4.gap-2');
        const jobPills = containers[0] ? Array.from(containers[0].querySelectorAll('a')).map(a => a.innerText.trim()) : [];
        const skillsPills = containers[1] ? Array.from(containers[1].querySelectorAll('a')).map(a => a.innerText.trim()) : [];

        // Apply link
        const applyLink = document.querySelector('a[href*="apply."], a[href*="workable"], a[href*="greenhouse"], a[href*="lever"]')?.href || null;

        // Sections (Description, Requirements, Benefits...)
        const sections = Array.from(document.querySelectorAll('h3')).map(h3 => {
          const title = h3.textContent.trim();
          const content = [];
          let next = h3.nextElementSibling;
          while (next && next.tagName !== 'H3') {
            if (['P', 'UL', 'OL', 'DIV'].includes(next.tagName) && next.textContent.trim()) {
              content.push(next.textContent.trim());
            }
            next = next.nextElementSibling;
          }
          return content.length ? { section: title, content: content.join('\n\n') } : null;
        }).filter(Boolean);

        return { companyName, companyDescription, jobPills, skillsPills, applyLink, sections };
      });

      results.push({ ...job, blocked: false, ...details });

    } catch (err) {
      results.push({ ...job, blocked: false, error: err.message });
    }

    await sleep(3000);
  }

  await context.close();
  res.json({ ok: true, results });
});

app.listen(PORT, () => {
  console.log(`Scraper listening at http://localhost:${PORT}/scrape/remoterocketship`);
});
