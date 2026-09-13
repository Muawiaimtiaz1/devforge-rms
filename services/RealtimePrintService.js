const db = require('../db/knex');
const { pool } = require('../db/postgres');
const { verifyRealtimePrintToken } = require('./RealtimePrintAgentAuth');

class RealtimePrintService {
  constructor() {
    this.namespace = null;
    this.listener = null;
    this.stopping = false;
    this.reconnectTimer = null;
    this.lastNotificationAt = null;
    this.agentState = new Map();
    this.retryTimer = null;
  }

  stationRoom(shopId, stationName) {
    return `shop:${Number(shopId)}:printer:${Buffer.from(String(stationName)).toString('base64url')}`;
  }

  async authorize(token) {
    const identity = verifyRealtimePrintToken(token);
    if (!identity) return null;
    const shop = await db('shops').where({ id: identity.shopId }).select('realtime_printing_enabled').first();
    if (!Number(shop?.realtime_printing_enabled)) return null;
    const printers = await db('printers').where({ shop_id: identity.shopId }).whereIn('system_name', identity.printers).pluck('system_name');
    if (!printers.length) return null;
    return { shopId: identity.shopId, printers: printers.map(String) };
  }

  initialize(io) {
    if (this.namespace) return this.namespace;
    this.namespace = io.of('/realtime-print-agent');
    this.namespace.use(async (socket, next) => {
      try {
        const identity = await this.authorize(socket.handshake.auth?.token);
        if (!identity) return next(new Error('Unauthorized realtime print agent'));
        socket.data.printAgent = identity;
        next();
      } catch (error) { next(error); }
    });
    this.namespace.on('connection', socket => {
      const identity = socket.data.printAgent;
      identity.printers.forEach(station => socket.join(this.stationRoom(identity.shopId, station)));
      this.agentState.set(identity.shopId, { connected: true, printers: identity.printers, connectedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
      socket.on('print:heartbeat', () => {
        const state = this.agentState.get(identity.shopId);
        if (state) state.lastSeenAt = new Date().toISOString();
      });
      socket.on('disconnect', () => {
        const connected = [...this.namespace.sockets.values()].some(candidate => Number(candidate.data.printAgent?.shopId) === Number(identity.shopId));
        const state = this.agentState.get(identity.shopId) || { printers: identity.printers };
        this.agentState.set(identity.shopId, { ...state, connected, disconnectedAt: new Date().toISOString() });
      });
      socket.emit('print:ready', { printers: identity.printers });
    });
    this.connectPostgresListener().catch(error => console.error('[Realtime Print] Listener startup failed:', error.message));
    this.retryTimer = setInterval(() => this.releaseDueRetries().catch(error => console.error('[Realtime Print] Retry release failed:', error.message)), 15000);
    this.retryTimer.unref?.();
    return this.namespace;
  }

  publish(payload) {
    if (!this.namespace || !payload?.shop_id || !payload?.station_name) return false;
    this.lastNotificationAt = new Date().toISOString();
    this.namespace.to(this.stationRoom(payload.shop_id, payload.station_name)).emit('print:available', {
      stationName: payload.station_name,
      occurredAt: new Date().toISOString(),
    });
    return true;
  }

  async connectPostgresListener() {
    if (this.stopping || process.env.DB_CLIENT !== 'postgres') return;
    const client = await pool.connect();
    this.listener = client;
    client.on('notification', message => {
      if (message.channel !== 'rms_print_jobs') return;
      try { this.publish(JSON.parse(message.payload)); }
      catch (error) { console.error('[Realtime Print] Invalid database notification:', error.message); }
    });
    client.on('error', error => {
      console.error('[Realtime Print] PostgreSQL listener error:', error.message);
      this.reconnect();
    });
    await client.query('LISTEN rms_print_jobs');
    console.log('[Realtime Print] PostgreSQL listener active.');
    await this.reconcilePendingJobs();
  }

  async reconcilePendingJobs() {
    const pending = await db('print_queue as pq')
      .join('shops as s', 's.id', 'pq.shop_id')
      .where('pq.status', 'pending')
      .where('s.realtime_printing_enabled', 1)
      .distinct('pq.shop_id', 'pq.station_name');
    pending.forEach(row => this.publish(row));
  }

  status(shopId) {
    return this.agentState.get(Number(shopId)) || { connected: false, printers: [], lastSeenAt: null };
  }

  async releaseDueRetries() {
    if (process.env.DB_CLIENT !== 'postgres') return;
    await db('print_queue').where({ status: 'retry_wait' }).where('available_at', '<=', db.fn.now()).update({ status: 'pending', claimed_at: null, updated_at: db.fn.now() });
  }

  disconnectShop(shopId) {
    if (!this.namespace) return;
    for (const socket of this.namespace.sockets.values()) {
      if (Number(socket.data.printAgent?.shopId) === Number(shopId)) socket.disconnect(true);
    }
  }

  reconnect() {
    if (this.listener) { try { this.listener.release(true); } catch (_) {} this.listener = null; }
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectPostgresListener().catch(error => { console.error('[Realtime Print] Reconnect failed:', error.message); this.reconnect(); });
    }, 5000);
    this.reconnectTimer.unref?.();
  }
}

module.exports = new RealtimePrintService();
module.exports.RealtimePrintService = RealtimePrintService;
