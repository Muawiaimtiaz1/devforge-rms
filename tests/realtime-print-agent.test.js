const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { issueRealtimePrintToken, verifyRealtimePrintToken } = require('../services/RealtimePrintAgentAuth');
const { RealtimePrintService } = require('../services/RealtimePrintService');
const { buildRealtimeAgentSource } = require('../routes/realtime-print-jobs');

test('realtime print token is signed and detects tampering', () => {
  const token = issueRealtimePrintToken(7, ['Kitchen A', 'Kitchen B']);
  const verified = verifyRealtimePrintToken(token);
  assert.equal(verified.shopId, 7);
  assert.deepEqual(verified.printers, ['Kitchen A', 'Kitchen B']);
  assert.ok(verified.expiresAt > Date.now());
  assert.equal(verifyRealtimePrintToken(`${token}x`), null);
  assert.equal(verifyRealtimePrintToken(issueRealtimePrintToken(7, ['Kitchen A'], { expiresAt: Date.now() - 1 })), null);
});

test('realtime agent is generated separately without changing polling template', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', 'print-agent.js'), 'utf8');
  const generated = buildRealtimeAgentSource(template, {
    websiteName: 'test', shopName: 'Test', shopId: 7, serverUrl: 'https://example.test', printers: ['Kitchen A'], realtimeToken: 'token'
  });
  assert.match(template, /api\/print-jobs\/poll/);
  assert.match(template, /setInterval\(pollJobs, CONFIG\.POLL_INTERVAL_MS\)/);
  assert.doesNotMatch(generated, /api\/print-jobs\/poll/);
  assert.match(generated, /api\/realtime-print-jobs\/claim/);
  assert.match(generated, /realtime-print-agent/);
  assert.match(generated, /RMS REALTIME PRINT AGENT/);
  assert.match(generated, /const printerLanes = new Map/);
  assert.match(generated, /station_name: stationName/);
  assert.match(generated, /if \(lane\.running\) \{ lane\.requested = true; return; \}/);
  assert.match(generated, /event => requestPrinterDrain\(event\.stationName\)/);
  assert.match(generated, /MAX_CONCURRENT_PDF_RENDERS/);
  assert.match(generated, /acquirePdfRenderSlot/);
  assert.match(generated, /releasePdfRenderSlot/);
  assert.match(generated, /await acquirePdfRenderSlot\(\);\r?\n\s*try \{/);
  assert.match(generated, /finally \{\r?\n\s*releasePdfRenderSlot\(\);/);
  assert.match(generated, /Authorization: `Bearer/);
  assert.match(generated, /api\/realtime-print-jobs\/\$\{id\}\/\$\{path\}/);
  assert.match(generated, /15 \* 60 \* 1000/);
  assert.match(generated, /print:heartbeat/);
  new vm.Script(generated);
});

function waitFor(socket, event, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
    socket.once(event, value => { clearTimeout(timer); resolve(value); });
  });
}

function expectNoEvent(socket, event, timeout = 250) {
  return new Promise((resolve, reject) => {
    const listener = value => { clearTimeout(timer); reject(new Error(`Unexpected ${event}: ${JSON.stringify(value)}`)); };
    const timer = setTimeout(() => { socket.off(event, listener); resolve(); }, timeout);
    socket.once(event, listener);
  });
}

test('virtual realtime printing isolates PostgreSQL notifications by shop and physical printer', async t => {
  const httpServer = http.createServer((_req, res) => res.end('ok'));
  const io = new Server(httpServer, { serveClient: false });
  const realtime = new RealtimePrintService();
  realtime.connectPostgresListener = async () => {};
  realtime.authorize = async token => ({
    agentA: { shopId: 1, printers: ['Kitchen A'] },
    agentB: { shopId: 1, printers: ['Kitchen B'] },
    otherShop: { shopId: 2, printers: ['Kitchen A'] },
  }[token] || null);
  realtime.initialize(io);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}/realtime-print-agent`;
  const clients = ['agentA', 'agentB', 'otherShop'].map(token => createClient(url, {
    auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false,
  }));
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await new Promise(resolve => io.close(resolve));
  });
  await Promise.all(clients.map(client => waitFor(client, 'print:ready')));

  const kitchenAReceives = waitFor(clients[0], 'print:available');
  const kitchenBDoesNot = expectNoEvent(clients[1], 'print:available');
  const otherShopDoesNot = expectNoEvent(clients[2], 'print:available');
  assert.equal(realtime.publish({ shop_id: 1, station_name: 'Kitchen A', job_id: 501 }), true);
  const event = await kitchenAReceives;
  await Promise.all([kitchenBDoesNot, otherShopDoesNot]);
  assert.equal(event.stationName, 'Kitchen A');
  assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('PostgreSQL queue trigger and realtime claim preserve after-commit and atomic claiming', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'db-init.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'realtime-print-jobs.js'), 'utf8');
  assert.match(migration, /AFTER INSERT OR UPDATE OF status ON print_queue/);
  assert.match(migration, /IF NEW\.status = 'pending'/);
  assert.match(migration, /pg_notify\('rms_print_jobs'/);
  assert.match(migration, /idx_print_queue_pending_claim/);
  assert.match(route, /FOR UPDATE SKIP LOCKED/);
  assert.match(route, /station_name = ANY\(\?::text\[\]\)/);
  assert.match(route, /printers\.includes\(stationName\)/);
  assert.match(route, /status='printing'/);
  assert.match(route, /status: exhausted \? 'failed' : 'retry_wait'/);
  assert.match(route, /COALESCE\(available_at, NOW\(\)\) <= NOW\(\)/);
  assert.match(route, /router\.get\('\/status'/);
  assert.match(route, /router\.post\('\/:id\/retry'/);
});
