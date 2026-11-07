import { chromium } from 'playwright';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    console.error('Page error:', err);
  });

  console.log('Navigating to http://localhost:4200...');
  await page.goto('http://localhost:4200', { waitUntil: 'networkidle' });

  // Wait 1 second for PixiJS to render initial frame
  await page.waitForTimeout(1000);

  // Take screenshot of initial state
  const screenshotPath1 = './screenshot_initial.png';
  await page.screenshot({ path: screenshotPath1 });
  console.log('Initial screenshot saved to:', screenshotPath1);

  // Click "Play" button to let the simulation run a few cycles
  console.log('Clicking Play button...');
  const playBtn = await page.$('.btn-play');
  if (playBtn) {
    await playBtn.click();
    console.log('Waiting 5 seconds of active execution...');
    await page.waitForTimeout(5000);
  }

  // Take screenshot while running
  const screenshotPath2 = './screenshot_running.png';
  await page.screenshot({ path: screenshotPath2 });
  console.log('Running screenshot saved to:', screenshotPath2);

  console.log('Console logs count:', consoleLogs.length);
  const errors = consoleLogs.filter(l => l.type === 'error');
  console.log('Console errors:', errors);

  await browser.close();
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
