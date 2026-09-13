const express = require('express');
const db = require('../db/knex');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { issueRealtimePrintToken } = require('../services/RealtimePrintAgentAuth');

const router = express.Router();
const STALE_MINUTES = Math.max(1, Number(process.env.PRINT_JOB_STALE_MINUTES || 10));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.REALTIME_PRINT_MAX_ATTEMPTS || 5));

function buildRealtimeAgentSource(template, profile) {
  let source = template.replace("const axios = require('axios');", "const axios = require('axios');\nconst { io } = require('socket.io-client');");
  source = source.replace('Requires: npm install axios', 'Requires: npm install axios socket.io-client');
  source = source.replace('RMS UNIFIED SMART PRINT AGENT', 'RMS REALTIME PRINT AGENT');
  source = source.replace(/const AGENT_PROFILE = Object\.freeze\(\{[^\r\n]*\}\);/, `const AGENT_PROFILE = Object.freeze(${JSON.stringify(profile)});`);
  const laneController = [
    'const MAX_CONCURRENT_PDF_RENDERS = Math.max(1, Number(process.env.MAX_CONCURRENT_PDF_RENDERS || 2));',
    'let activePdfRenders = 0;',
    'const pdfRenderWaiters = [];',
    'async function acquirePdfRenderSlot() {',
    '    if (activePdfRenders < MAX_CONCURRENT_PDF_RENDERS) { activePdfRenders += 1; return; }',
    '    await new Promise(resolve => pdfRenderWaiters.push(resolve));',
    '    activePdfRenders += 1;',
    '}',
    'function releasePdfRenderSlot() {',
    '    activePdfRenders = Math.max(0, activePdfRenders - 1);',
    '    const next = pdfRenderWaiters.shift();',
    '    if (next) next();',
    '}',
    '',
    'const printerLanes = new Map(ASSIGNED_PRINTERS.map(stationName => [stationName, { running: false, requested: false }]));',
    '',
    'function requestPrinterDrain(stationName) {',
    "    const lane = printerLanes.get(String(stationName || ''));",
    '    if (!lane) return;',
    '    if (lane.running) { lane.requested = true; return; }',
    '    void drainPrinterLane(String(stationName));',
    '}',
    '',
    'async function drainPrinterLane(stationName) {',
    '    const lane = printerLanes.get(stationName);',
    '    if (!lane || lane.running) return;',
    '    lane.running = true;',
    '    try {',
    '        do {',
    '            lane.requested = false;',
    '            const res = await axios.post(`${CONFIG.SERVER_URL}/api/realtime-print-jobs/claim`, { station_name: stationName }, { headers: { Authorization: `Bearer ${AGENT_PROFILE.realtimeToken}` } });',
    '            const jobs = Array.isArray(res.data) ? res.data : [];',
    '            if (!jobs.length) break;',
    '            for (const job of jobs) await processJob(job);',
    '        } while (true);',
    '    } catch (error) {',
    '        console.error(`Realtime lane ${stationName} error:`, error.message);',
    '    } finally {',
    '        lane.running = false;',
    '        if (lane.requested) setImmediate(() => requestPrinterDrain(stationName));',
    '    }',
    '}',
    '',
    'function pollJobs() {',
    '    ASSIGNED_PRINTERS.forEach(requestPrinterDrain);',
    '}',
    '',
  ].join('\n');
  source = source.replace(/let isPolling = false;[\s\S]*?\r?\n\}\r?\n\r?\nasync function processJob/, `${laneController}\nasync function processJob`);
  source = source.replace("`${CONFIG.SERVER_URL}/api/print-jobs/${id}/${path}`", "`${CONFIG.SERVER_URL}/api/realtime-print-jobs/${id}/${path}`");
  source = source.replace("await axios.post(`${CONFIG.SERVER_URL}/api/realtime-print-jobs/${id}/${path}`, body);", "await axios.post(`${CONFIG.SERVER_URL}/api/realtime-print-jobs/${id}/${path}`, body, { headers: { Authorization: `Bearer ${AGENT_PROFILE.realtimeToken}` } });");
  source = source.replace(
    '    try {\r\n        await renderUrlToPdf(url, pdfPath);',
    '    await acquirePdfRenderSlot();\r\n    try {\r\n        await renderUrlToPdf(url, pdfPath);'
  );
  source = source.replace(
    '    } finally {\r\n        setTimeout(() => {\r\n            try {\r\n                if (fs.existsSync(pdfPath))',
    '    } finally {\r\n        releasePdfRenderSlot();\r\n        setTimeout(() => {\r\n            try {\r\n                if (fs.existsSync(pdfPath))'
  );
  source = source.replace(/setInterval\(pollJobs, CONFIG\.POLL_INTERVAL_MS\);\r?\npollJobs\(\);/, "const socket = io(`${CONFIG.SERVER_URL}/realtime-print-agent`, { auth: { token: AGENT_PROFILE.realtimeToken }, transports: ['websocket'], reconnection: true });\nsocket.on('print:ready', event => (event.printers || ASSIGNED_PRINTERS).forEach(requestPrinterDrain));\nsocket.on('print:available', event => requestPrinterDrain(event.stationName));\nsocket.on('connect_error', error => console.error('Realtime connection error:', error.message));\nsetInterval(() => socket.connected && socket.emit('print:heartbeat'), 30000);\n// A slow safety reconciliation recovers any event missed during an unusual disconnect.\nsetInterval(pollJobs, 15 * 60 * 1000);\npollJobs();");
  return source;
}

async function authenticateAgent(req, res, next) {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const identity = await require('../services/RealtimePrintService').authorize(token);
    if (!identity) return res.status(401).json({ error: 'Unauthorized realtime print agent' });
    req.realtimePrintAgent = identity;
    next();
  } catch (error) { next(error); }
}

router.post('/claim', authenticateAgent, async (req, res) => {
  const { shopId, printers } = req.realtimePrintAgent;
  const stationName = String(req.body?.station_name || '').trim();
  if (!stationName || !printers.includes(stationName)) return res.status(403).json({ error: 'Printer is not assigned to this realtime agent' });
  await db.raw(`UPDATE print_queue SET status='pending', claimed_at=NULL, updated_at=NOW(), last_error=COALESCE(last_error, 'Realtime print lease expired; retrying.') WHERE shop_id=? AND status='printing' AND claimed_at < NOW() - (? * INTERVAL '1 minute')`, [shopId, STALE_MINUTES]);
  const result = await db.raw(`
    WITH next_job AS (
      SELECT id FROM print_queue
      WHERE shop_id = ? AND status = 'pending' AND station_name = ANY(?::text[])
        AND COALESCE(available_at, NOW()) <= NOW() AND COALESCE(attempts, 0) < ?
      ORDER BY CASE WHEN content_json LIKE '%"type":"CASH_DRAWER"%' THEN 0 ELSE 1 END, created_at ASC, id ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE print_queue pq SET status='printing', claimed_at=NOW(), updated_at=NOW(), last_error=NULL,
      attempts=COALESCE(pq.attempts,0)+1
    FROM next_job WHERE pq.id=next_job.id RETURNING pq.*
  `, [shopId, [stationName], MAX_ATTEMPTS]);
  res.json(result.rows || []);
});

router.post('/:id/confirm', authenticateAgent, async (req, res) => {
  const { shopId, printers } = req.realtimePrintAgent;
  const updated = await db('print_queue').where({ id: req.params.id, shop_id: shopId, status: 'printing' })
    .whereIn('station_name', printers).update({ status: 'printed', printed_at: db.fn.now(), updated_at: db.fn.now(), last_error: null });
  if (!updated) {
    const alreadyPrinted = await db('print_queue').where({ id: req.params.id, shop_id: shopId, status: 'printed' }).whereIn('station_name', printers).first('id');
    if (!alreadyPrinted) return res.status(404).json({ error: 'Claimed job not found' });
  }
  res.json({ success: true });
});

router.post('/:id/fail', authenticateAgent, async (req, res) => {
  const { shopId, printers } = req.realtimePrintAgent;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1000) : 'Realtime print agent failure.';
  const job = await db('print_queue').where({ id: req.params.id, shop_id: shopId, status: 'printing' }).whereIn('station_name', printers).first('id', 'attempts');
  if (!job) return res.status(404).json({ error: 'Claimed job not found' });
  const attempts = Number(job.attempts || 0);
  const exhausted = attempts >= MAX_ATTEMPTS;
  const retrySeconds = Math.min(300, 10 * (2 ** Math.max(0, attempts - 1)));
  const updated = await db('print_queue').where({ id: job.id, shop_id: shopId, status: 'printing' }).update({
    status: exhausted ? 'failed' : 'retry_wait',
    claimed_at: null,
    available_at: exhausted ? db.fn.now() : db.raw("NOW() + (? * INTERVAL '1 second')", [retrySeconds]),
    failed_at: exhausted ? db.fn.now() : null,
    updated_at: db.fn.now(),
    last_error: reason
  });
  if (!updated) return res.status(404).json({ error: 'Claimed job not found' });
  res.json({ success: true, status: exhausted ? 'failed' : 'retry_wait', retry_in_seconds: exhausted ? null : retrySeconds });
});

router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  const shopId = Number(req.session.user.shop_id);
  const counts = await db('print_queue').where({ shop_id: shopId }).whereIn('status', ['pending', 'printing', 'retry_wait', 'failed']).groupBy('status').select('status').count({ count: '*' });
  res.json({ agent: require('../services/RealtimePrintService').status(shopId), queue: Object.fromEntries(counts.map(row => [row.status, Number(row.count)])) });
});

router.get('/failed', requireAuth, requireAdmin, async (req, res) => {
  res.json(await db('print_queue').where({ shop_id: req.session.user.shop_id, status: 'failed' }).orderBy('failed_at', 'desc').limit(50));
});

router.post('/:id/retry', requireAuth, requireAdmin, async (req, res) => {
  const updated = await db('print_queue').where({ id: req.params.id, shop_id: req.session.user.shop_id, status: 'failed' }).update({
    status: 'pending', attempts: 0, claimed_at: null, available_at: db.fn.now(), failed_at: null, updated_at: db.fn.now(), last_error: null
  });
  if (!updated) return res.status(404).json({ error: 'Failed print job not found' });
  res.json({ success: true });
});

router.get('/download', requireAuth, requireAdmin, async (req, res) => {
  const shopId = Number(req.session.user.shop_id);
  const [shop, printers] = await Promise.all([
    db('shops').where({ id: shopId }).select('id', 'name', 'realtime_printing_enabled').first(),
    db('printers').where({ shop_id: shopId }).orderBy('display_name').select('system_name'),
  ]);
  if (!Number(shop?.realtime_printing_enabled)) return res.status(403).json({ error: 'Enable realtime printing before downloading its agent.' });
  if (!printers.length) return res.status(400).json({ error: 'Register at least one printer first.' });
  const protocol = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const profile = { websiteName: req.get('host'), shopName: shop.name, shopId, serverUrl: `${protocol}://${req.get('host')}`, printers: printers.map(p => p.system_name), realtimeToken: issueRealtimePrintToken(shopId, printers.map(p => p.system_name)) };
  const template = await require('fs').promises.readFile(require('path').join(__dirname, '..', 'print-agent.js'), 'utf8');
  const source = buildRealtimeAgentSource(template, profile);
  res.type('application/javascript').attachment(`realtime-print-agent-${String(shop.name).replace(/[^a-z0-9_-]+/gi, '-')}.js`).send(source);
});

module.exports = router;
module.exports.buildRealtimeAgentSource = buildRealtimeAgentSource;
