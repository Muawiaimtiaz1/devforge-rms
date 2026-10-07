const repository = require('./print-analytics.repository');
const realtimePrintService = require('../../../services/RealtimePrintService');

const num = (value) => Number(value || 0);
const elapsed = (from, to) => from && to ? Math.max(0, new Date(to) - new Date(from)) : null;
const average = (values) => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  : null;

function daySeries(days) {
  const start = repository.windowStart(days);
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    return { day: date.toISOString().slice(0, 10), total: 0, printed: 0, failed: 0 };
  });
}

async function shops(days) {
  const rows = await repository.listShops(days);
  return {
    days,
    generated_at: new Date().toISOString(),
    shops: rows.map((shop) => {
      const total = Object.values(shop.counts).reduce((sum, value) => sum + num(value), 0);
      const printed = num(shop.counts.printed);
      const failed = num(shop.counts.failed);
      const agent = realtimePrintService.status(shop.id);
      return {
        id: Number(shop.id),
        name: shop.name,
        status: shop.status,
        realtime_enabled: Boolean(num(shop.realtime_printing_enabled)),
        agent_connected: Boolean(agent.connected),
        last_seen_at: agent.lastSeenAt || null,
        printer_count: num(shop.printer_count),
        total_jobs: total,
        printed_jobs: printed,
        failed_jobs: failed,
        pending_jobs: num(shop.counts.pending) + num(shop.counts.printing) + num(shop.counts.retry_wait),
        success_rate: printed + failed ? Number((printed * 100 / (printed + failed)).toFixed(1)) : null,
      };
    }),
  };
}

async function detail(shopId, days) {
  const shop = await repository.findShop(shopId);
  if (!shop) throw Object.assign(new Error('Shop not found.'), { status: 404 });
  const [jobs, printers] = await Promise.all([
    repository.shopJobs(shopId, days),
    repository.shopPrinters(shopId),
  ]);
  const counts = {};
  const daily = daySeries(days);
  const dailyByDate = new Map(daily.map((row) => [row.day, row]));
  const stations = new Map();
  jobs.forEach((job) => {
    const status = job.status || 'unknown';
    counts[status] = num(counts[status]) + 1;
    const row = dailyByDate.get(new Date(job.created_at).toISOString().slice(0, 10));
    if (row) {
      row.total += 1;
      if (status === 'printed') row.printed += 1;
      if (status === 'failed') row.failed += 1;
    }
    const station = stations.get(job.station_name)
      || { station_name: job.station_name, total: 0, printed: 0, failed: 0 };
    station.total += 1;
    if (status === 'printed') station.printed += 1;
    if (status === 'failed') station.failed += 1;
    stations.set(job.station_name, station);
  });
  const printed = num(counts.printed);
  const failed = num(counts.failed);
  const agent = realtimePrintService.status(shopId);
  return {
    days,
    generated_at: new Date().toISOString(),
    shop: {
      id: Number(shop.id),
      name: shop.name,
      status: shop.status,
      realtime_enabled: Boolean(num(shop.realtime_printing_enabled)),
    },
    transport: {
      agent_connected: Boolean(agent.connected),
      connected_at: agent.connectedAt || null,
      last_seen_at: agent.lastSeenAt || null,
      websocket_enabled: Boolean(num(shop.realtime_printing_enabled)),
      polling_fallback_seconds: 5,
      attribution_available: false,
    },
    summary: {
      total_jobs: jobs.length,
      printed_jobs: printed,
      failed_jobs: failed,
      pending_jobs: num(counts.pending),
      printing_jobs: num(counts.printing),
      retry_wait_jobs: num(counts.retry_wait),
      retried_jobs: jobs.filter((job) => num(job.attempts) > 1).length,
      success_rate: printed + failed ? Number((printed * 100 / (printed + failed)).toFixed(1)) : null,
      avg_claim_ms: average(jobs.map((job) => elapsed(job.created_at, job.claimed_at)).filter(Number.isFinite)),
      avg_completion_ms: average(jobs.map((job) => elapsed(job.created_at, job.printed_at)).filter(Number.isFinite)),
      printer_count: printers.length,
    },
    daily,
    stations: [...stations.values()].sort((a, b) => b.total - a.total),
    printers,
    recent_failures: jobs
      .filter((job) => job.status === 'failed' || job.last_error)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 20)
      .map((job) => ({
        id: Number(job.id),
        station_name: job.station_name,
        status: job.status,
        attempts: num(job.attempts),
        error: job.last_error || 'Unknown error',
        occurred_at: job.updated_at,
      })),
  };
}

module.exports = { shops, detail };
