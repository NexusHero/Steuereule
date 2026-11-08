import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const playwrightPath = path.join(rootDir, 'apps/api/node_modules/playwright-core');
const { chromium } = require(playwrightPath);

const FORMS_MAP = [
  { name: 'est-1-a', idPrefix: '034037', type: 'makePDF' },
  { name: 'anlage-aussergewoehnliche-belastungen', idPrefix: '035007', type: 'makePDF' },
  { name: 'anlage-sonderausgaben', idPrefix: '035006', type: 'makePDF' },
  { name: 'anlage-haushaltsnahe-aufwendungen', idPrefix: '035009', type: 'makePDF' },
  { name: 'anlage-energetische-massnahmen', idPrefix: '035010', type: 'makePDF' },
  { name: 'anlage-sonstiges', idPrefix: '035008', type: 'makePDF' },
  { name: 'anlage-wa-est', idPrefix: '034138', type: 'makePDF' },
  { name: 'anlage-aus', idPrefix: '034010', type: 'makePDF' },
  { name: 'anlage-av', idPrefix: '034011', type: 'makePDF' },
  { name: 'anlage-kap', idPrefix: '034024', type: 'makePDF' },
  { name: 'anlage-kap-inv', idPrefix: '035004', type: 'makePDF' },
  { name: 'anlage-kind', idPrefix: '034025', type: 'makePDF' },
  { name: 'anlage-n', idPrefix: '034027', type: 'makePDF' },
  { name: 'anlage-r', idPrefix: '034028', type: 'makePDF' },
  { name: 'anlage-so', idPrefix: '034029', type: 'makePDF' },
  { name: 'anlage-v', idPrefix: '034032', type: 'makePDF' },
  { name: 'anlage-vorsorgeaufwand', idPrefix: '034098', type: 'makePDF' },
  { name: 'anlage-n-gre', idPrefix: '034049', type: 'interactive' },
];

async function downloadYear(year) {
  const yy = String(year).slice(-2);
  const outDir = path.resolve(rootDir, `apps/api/assets/vordrucke/${year}`);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Starting download for year ${year} (yy=${yy}) into ${outDir}...`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addCookies([
    { name: 'datenschutz', value: '1', domain: 'www.formulare-bfinv.de', path: '/' },
  ]);
  const page = await context.newPage();

  // Initialize session
  await page.goto(`https://www.formulare-bfinv.de/ffw/action/invoke.do?id=est${yy}`, { waitUntil: 'networkidle' });

  for (const form of FORMS_MAP) {
    const fullFormId = `${form.idPrefix}_${yy}`;
    const outPdf = path.join(outDir, `${form.name}.pdf`);
    console.log(`Downloading ${form.name} (${fullFormId})...`);

    if (form.type === 'makePDF') {
      const pdfUrl = `https://www.formulare-bfinv.de/ffw/catalog/makePDF.do?path=catalog%3A%2F%2FSteuerformulare%2Fest%2Fest${yy}%2F${fullFormId}`;
      const res = await page.request.get(pdfUrl);
      const buffer = await res.body();
      if (buffer.slice(0, 4).toString() !== '%PDF') {
        throw new Error(`Downloaded file for ${form.name} is not a PDF! Response size: ${buffer.length}`);
      }
      fs.writeFileSync(outPdf, buffer);
      console.log(`  Saved ${form.name}.pdf (${buffer.length} bytes)`);
    } else if (form.type === 'interactive') {
      let pdfUrl = null;
      const onResponse = async (res) => {
        if (res.url().includes('getViewEmbeddings')) {
          try {
            const text = await res.text();
            const m = text.match(/href=\\"([^\\"]+\.pdf)\\"/);
            if (m) {
              pdfUrl = m[1].replace(/\\/g, '');
            }
          } catch {
            // Ignore parse errors on other responses
          }
        }
      };
      page.on('response', onResponse);

      const openUrl = `https://www.formulare-bfinv.de/ffw/catalog/openForm.do?path=catalog%3A%2F%2FSteuerformulare%2Fest%2Fest${yy}%2F${fullFormId}&setCurrentFolder=true`;
      await page.goto(openUrl, { waitUntil: 'networkidle' });

      await page.evaluate(() => {
        const ds = document.getElementById('datenschutz');
        if (ds) ds.style.display = 'none';
      });

      const printButton = page.locator('input[name*="print.do"]');
      await printButton.first().click({ force: true });
      await page.waitForTimeout(4000);

      page.off('response', onResponse);

      if (!pdfUrl) {
        throw new Error(`Failed to find generated printout PDF URL for ${form.name}`);
      }

      const res = await page.request.get('https://www.formulare-bfinv.de' + pdfUrl);
      const buffer = await res.body();
      if (buffer.slice(0, 4).toString() !== '%PDF') {
        throw new Error(`Downloaded interactive file for ${form.name} is not a PDF!`);
      }
      fs.writeFileSync(outPdf, buffer);
      console.log(`  Saved ${form.name}.pdf (${buffer.length} bytes)`);
    }
  }

  await browser.close();
  console.log(`Download for year ${year} completed successfully.`);
}

const targetYear = parseInt(process.argv[2] || '2024', 10);
downloadYear(targetYear).catch((err) => {
  console.error('Download failed:', err);
  process.exit(1);
});
