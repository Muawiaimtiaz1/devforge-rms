
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<style>.hidden { display: none; }</style><div id="modal"></div>');
    await page.evaluate(() => {
      window.currentUserHasPermission = () => true;
      window.openModal = (_title, content) => { document.getElementById('modal').innerHTML = content; };
      window.toast = () => {};
      window.escapeOrderValue = value => String(value);
      window.formatRegisterMoney = value => 'Rs. ' + value;
      window.requests = [];
      window.api = async url => {
        const params = new URL(url, 'http://localhost').searchParams;
        window.requests.push(Object.fromEntries(params));
        if (window.tipResponseDelay) await new Promise(resolve => setTimeout(resolve, window.tipResponseDelay));
        return { orders: [{ id: 1, order_number: 101, total: 100, order_type: 'takeaway', payment_method: 'cash' }], tables: [{ id: 1, table_number: 'A1' }] };
      };
    });
    const app = fs.readFileSync(path.resolve(__dirname, '../../public/js/app.js'), 'utf8');
    await page.addScriptTag({ content: app.slice(app.indexOf('let _tipOrderOptions'), app.indexOf('async function submitRecordedTip')) });
    await page.evaluate(() => openRecordTipModal());
    assert.equal(await page.locator('#tip-date-filter').inputValue(), 'today');
    assert.equal(await page.evaluate(() => requests.at(-1).period), 'today');

    const suggestions = page.locator('#tip-order-options');
    assert.equal(await suggestions.isVisible(), false, 'Suggestions stay closed after initial loading');
    await page.locator('#tip-order-search').click();
    assert.equal(await suggestions.isVisible(), true, 'Clicking search opens suggestions');
    await page.locator('#tip-order-search').press('Escape');
    assert.equal(await suggestions.isVisible(), false, 'Escape closes suggestions');
    await page.locator('#tip-order-search').click();
    assert.equal(await suggestions.isVisible(), true, 'Clicking the focused search reopens suggestions');
    await page.getByText('Completed paid orders', { exact: true }).click();
    assert.equal(await suggestions.isVisible(), false, 'Clicking outside closes suggestions');
    await page.locator('#tip-order-search').click();
    await suggestions.locator('button').first().click();
    assert.equal(await suggestions.isVisible(), false, 'Selecting an order closes suggestions');
    await page.evaluate(() => { window.tipResponseDelay = 180; });
    await page.locator('#tip-order-search').fill('Delayed search');
    await page.waitForTimeout(270);
    await page.getByText('Completed paid orders', { exact: true }).click();
    await page.waitForTimeout(220);
    assert.equal(await suggestions.isVisible(), false, 'A late response cannot reopen suggestions');
    await page.evaluate(() => { window.tipResponseDelay = 0; openRecordTipModal(); });
    for (const period of ['yesterday', '2days', 'all']) {
      await page.locator('#tip-date-filter').selectOption(period);
      await page.waitForTimeout(20);
      assert.equal(await page.evaluate(() => requests.at(-1).period), period);
      assert.equal(await suggestions.isVisible(), false, 'Changing filters keeps suggestions closed');
    }
    await page.locator('#tip-order-search').fill('Old Guest');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => requests.at(-1)), { search: 'Old Guest', period: 'all' });
    await page.locator('#tip-date-filter').selectOption('custom');
    await page.locator('#tip-date-from').fill('2026-09-01');
    await page.locator('#tip-date-to').fill('2026-09-08');
    assert.deepEqual(await page.evaluate(() => requests.at(-1)), { search: 'Old Guest', period: 'custom', from: '2026-09-01', to: '2026-09-08' });
    const count = await page.evaluate(() => requests.length);
    await page.locator('#tip-date-to').fill('2026-08-01');
    assert.equal(await page.evaluate(() => requests.length), count);
    assert.match(await page.locator('#tip-order-options').textContent(), /valid date range/);
    await page.locator('#tip-date-filter').selectOption('all');
    await page.evaluate(() => selectTipOrder(1));
    await page.locator('#tip-amount').fill('10');
    assert.equal(await page.locator('#record-tip-submit').isDisabled(), false);
    await page.locator('#tip-date-filter').selectOption('yesterday');
    assert.equal(await page.locator('#record-tip-submit').isDisabled(), true);
    assert.equal(await page.locator('#tip-order-search').inputValue(), '');
    await page.evaluate(() => openRecordTipModal());
    assert.equal(await page.locator('#tip-date-filter').inputValue(), 'today');
    assert.deepEqual(errors, []);
    console.log('PASS: dropdown opens on search, closes outside/on Escape/on selection, stays closed after late responses and filter changes; date-filter checks pass.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

