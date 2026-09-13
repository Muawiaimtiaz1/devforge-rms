const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('analytics uses returns, dated waste, batch valuation and receivables sources', () => {
  const service = read('services/AnalyticsService.js');
  assert.match(service, /topProductReturns/);
  assert.match(service, /returned_quantity/);
  assert.match(service, /refunded_revenue/);
  assert.match(service, /waste_events as we/);
  assert.match(service, /product_batches as pb/);
  assert.match(service, /raw_stock_batches as rb/);
  assert.match(service, /\['completed', 'payment_pending'\]/);
  assert.match(service, /retainedOwnerProfit/);
  assert.match(service, /reconciliation:/);
});

test('React analytics contains no fabricated percentages or recipe stock claim', () => {
  const overview = read('frontend/src/modules/analytics/OverviewTab.jsx');
  const ai = read('frontend/src/modules/analytics/AiTab.jsx');
  assert.doesNotMatch(overview, /15\.4%|5\.3%|3\.1%|2\.4%|11\.3%|9\.8%|6\.7%/);
  assert.match(overview, /p\.product_type !== 'recipe_based'/);
  assert.doesNotMatch(ai, /aiConfidence/);
  assert.match(ai, /Evidence level/);
});

test('React activity heatmap ships an explicit sales color scale', () => {
  const overview = read('frontend/src/modules/analytics/OverviewTab.jsx');
  const styles = read('frontend/src/modules/analytics/analytics.source.css');
  assert.match(overview, /Math\.log1p\(salesValue\) \/ Math\.log1p\(maxVolume\)/);
  assert.match(overview, /analytics-heatmap-level-/);
  for (let level = 1; level <= 9; level += 1) assert.match(styles, new RegExp(`analytics-heatmap-level-${level}`));
});

test('PostgreSQL analytics buckets night sales in the shop reporting timezone', () => {
  const service = read('services/AnalyticsService.js');
  assert.match(service, /attendance_settings/);
  assert.match(service, /AT TIME ZONE \?/);
  assert.match(service, /FLOOR\(EXTRACT\(HOUR/);
  assert.match(service, /reportingTimezone/);
});

test('AI rules use observed data and disclose their actual grain', () => {
  const analyst = read('services/AIAnalystService.js');
  assert.match(analyst, /Number\(b\.orders/);
  assert.match(analyst, /Return invoices equal/);
  assert.doesNotMatch(analyst, /industry average/);
  assert.doesNotMatch(analyst, /healthy benchmark/);
  assert.doesNotMatch(analyst, /aiConfidence/);
});

test('React analytics has a persistent collapsible desktop sidebar and mobile drawer', () => {
  const frame = read('frontend/src/modules/analytics/AnalyticsFrame.jsx');
  assert.match(frame, /rms_analytics_sidebar_collapsed/);
  assert.match(frame, /analytics-fixed-sidebar fixed top-20 bottom-4/);
  assert.match(frame, /hidden lg:block shrink-0/);
  assert.doesNotMatch(frame, /sticky top-20/);
  assert.match(frame, /\{pageHeader\}/);
  assert.match(frame, /sidebarCollapsed \? "w-20" : "w-72"/);
  assert.match(frame, /lg:hidden fixed top-0 left-0/);
  assert.match(frame, /lg:hidden p-2\.5/);
});

test('React analytics provides mobile page, filters, cards and overflow behavior', () => {
  const page = read('frontend/src/modules/analytics/AnalyticsPage.jsx');
  const frame = read('frontend/src/modules/analytics/AnalyticsFrame.jsx');
  const overview = read('frontend/src/modules/analytics/OverviewTab.jsx');
  assert.match(page, /px-3 sm:px-6/);
  assert.match(page, /left-3 right-3 sm:bottom-6/);
  assert.match(frame, /grid grid-cols-1 sm:flex/);
  assert.match(frame, /w-full sm:w-auto justify-center/);
  assert.match(overview, /grid-cols-1 min-\[380px\]:grid-cols-2/);
  assert.doesNotMatch(overview, /lg:grid-cols-7|lg:grid-cols-6/);
  assert.match(overview, /w-full overflow-x-auto/);
});

test('React analytics uses compact scoped scrollbars', () => {
  const styles = read('frontend/src/modules/analytics/analytics.source.css');
  assert.match(styles, /scrollbar-width: thin/);
  assert.match(styles, /::-webkit-scrollbar \{ width: 6px; height: 6px; \}/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
});
