// End-to-end smoke test against a running preview server (npm run build && npm run preview).
// Usage: node scripts/e2e.cjs [baseUrl] [screenshotDir]
// Uses the Playwright install available in the environment (not a project dependency).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.argv[2] || 'http://localhost:4173';
const SHOTS = process.argv[3];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const step = (name) => console.log('✓', name);
  const shot = async (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });

  // Home + search with suggestions
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('combobox').first().fill('niacin');
  await page.getByRole('option', { name: /Niacinamide/ }).first().waitFor();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/search\?q=niacin/);
  await page.getByRole('heading', { name: 'Niacinamide', exact: true }).waitFor();
  step('search suggestions and results');

  // Synonym + typo + empty state
  await page.goto(BASE + '/search?q=haldi');
  await page.getByRole('heading', { name: 'Turmeric' }).first().waitFor();
  await page.goto(BASE + '/search?q=niacinmide%20serum');
  await page.getByText('Did you mean').waitFor();
  await page.goto(BASE + '/search?q=zzqqxx');
  await page.getByText(/No results for/).waitFor();
  step('synonyms, did-you-mean and empty state');

  // Category navigation and filters
  await page.goto(BASE + '/category/skin');
  await page.getByRole('button', { name: 'Sunscreens', exact: true }).click();
  await page.waitForURL(/sub=sunscreens/);
  const productsSection = page.locator('section', { has: page.getByRole('heading', { name: 'Products' }) });
  assert.equal(await productsSection.locator('a[href^="/product/"]').count(), 3);
  step('category subcategory filter');

  // Ingredient detail + 5W1H
  await page.goto(BASE + '/ingredient/niacinamide?section=how');
  await page.getByText(/Apply a few drops/).first().waitFor();
  await page.getByRole('tab', { name: 'Safety' }).click();
  await page.getByText('Potential side effects').waitFor();
  await page.goto(BASE + '/guide/ingredient/niacinamide');
  await page.getByText('5W1H Guide').waitFor();
  await page.getByRole('button', { name: /Why\?/ }).click();
  await page.locator('#w1h-body-why').getByText(/Evidence: moderate/).waitFor();
  step('ingredient detail and 5W1H guide');

  // Product detail
  await page.goto(BASE + '/product/demo-niacinamide-10-zinc');
  await page.getByText('Fictional demonstration record').waitFor();
  await page.getByRole('link', { name: /Zinc PCA/ }).first().waitFor();
  step('product detail');

  // Analyser
  await page.goto(BASE + '/analyse');
  await page.getByLabel('Ingredient list').fill('Aqua, Glycerin, Niacinamide (5%), Mystery Extract, Parfum');
  await page.getByRole('button', { name: 'Analyse' }).click();
  await page.getByText(/Not in the CareLens database/).waitFor();
  await page.getByText(/common cause of cosmetic contact allergy/).waitFor();
  await shot('analyser');
  step('ingredient-list analyser');

  // Compare: add, replace, remove
  await page.goto(BASE + '/compare?p=demo-niacinamide-10-zinc,demo-niacinamide-5-ha');
  await page.getByText('Key differences').waitFor();
  await page.getByRole('button', { name: /Add product/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Vitamin C 15% Serum/ }).click();
  await page.waitForURL(/demo-vitamin-c-serum/);
  await page.getByRole('button', { name: 'Remove Niacinamide 10% + Zinc 1% Serum' }).click();
  await page.waitForURL((u) => !u.toString().includes('demo-niacinamide-10-zinc'));
  await page.getByRole('button', { name: 'Save comparison' }).click();
  await shot('compare');
  step('compare add/remove/save');

  // Personalisation changes results
  await page.goto(BASE + '/profile/personalise');
  await page.getByRole('button', { name: 'Dry', exact: true }).click();
  await page.getByRole('button', { name: 'Dryness', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.goto(BASE + '/search?q=moisturiser&type=product');
  await page.getByText('Personalised for you').waitFor();
  await page.getByText(/Relevant to dry skin/).first().waitFor();
  step('personalisation affects results');

  // Saved items persist across reload
  await page.goto(BASE + '/ingredient/ceramides');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await page.goto(BASE + '/profile/saved');
  await page.getByRole('link', { name: /Ceramides/ }).waitFor();
  await page.goto(BASE + '/profile/comparisons');
  await page.getByText(/Niacinamide 5% \+ Hyaluronic Serum vs Vitamin C/).waitFor();
  step('saved items and comparisons persist');

  // Manifest + service worker + offline
  const manifest = await (await page.request.get(BASE + '/manifest.json')).json();
  assert.equal(manifest.scope, './');
  assert.equal(manifest.id, 'fivew-oneh-carelens');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const swInfo = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await new Promise((r) => (navigator.serviceWorker.controller ? r() : navigator.serviceWorker.addEventListener('controllerchange', r)));
    return { scope: reg.scope, caches: await caches.keys() };
  });
  assert.deepEqual(swInfo.caches, ['fivew-oneh-v1']);
  await ctx.setOffline(true);
  await page.goto(BASE + '/topic/dandruff', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Dandruff' }).waitFor();
  await page.getByText(/You're offline/).waitFor();
  await shot('offline');
  await ctx.setOffline(false);
  step(`service worker (scope ${swInfo.scope}) and offline navigation`);

  // Desktop layout
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/compare?p=demo-mineral-sunscreen,demo-chemical-sunscreen');
  await page.locator('aside nav').getByRole('link', { name: 'Learn' }).click();
  await page.waitForURL(/\/learn$/);
  await shot('desktop-learn');
  step('desktop sidebar navigation');

  assert.deepEqual(errors, []);
  console.log('All e2e checks passed');
  await browser.close();
})().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
