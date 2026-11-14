import fs from 'node:fs';
import puppeteer from 'puppeteer';

function resolvePuppeteerExecutablePath(): string | undefined {
  const envPath = process.env['PUPPETEER_EXECUTABLE_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const candidatePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return (
      d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ' ' +
      d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  } catch {
    return String(dateStr);
  }
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const executablePath = resolvePuppeteerExecutablePath();
  const browser = await puppeteer.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
      displayHeaderFooter: false,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
