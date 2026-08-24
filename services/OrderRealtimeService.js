const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

class OrderRealtimeService {
  constructor() {
    this.io = null;
  }

  initialize(httpServer, sessionMiddleware, options = {}) {
    if (this.io) return this.io;
    const io = new Server(httpServer, {
      path: '/socket.io',
      serveClient: true,
      cors: false,
      ...options,
    });

    io.engine.use(sessionMiddleware);
    io.use((socket, next) => {
      const user = socket.request.session?.user;
      const shopId = Number(user?.shop_id);
      const userId = Number(user?.id);
      if (!user || !Number.isInteger(shopId) || shopId <= 0 || !Number.isInteger(userId) || userId <= 0) {
        const error = new Error('Unauthorized');
        error.data = { code: 'UNAUTHORIZED' };
        return next(error);
      }
      socket.data.user = { id: userId, shopId, role: String(user.role || '').toLowerCase() };
      return next();
    });

    io.on('connection', socket => {
      const { id, shopId, role } = socket.data.user;
      socket.join(`shop:${shopId}:user:${id}`);
      if (role === 'kitchen') socket.join(`shop:${shopId}:kitchen:${id}`);
      else socket.join(`shop:${shopId}:orders`);
      socket.emit('realtime:ready', { connected: true });
    });

    this.io = io;
    return io;
  }

  publishOrderChange({ type, shopId, orderId, kitchenIds = [], version = null }) {
    if (!this.io) return false;
    const safeShopId = Number(shopId);
    const safeOrderId = Number(orderId);
    if (!Number.isInteger(safeShopId) || safeShopId <= 0 || !Number.isInteger(safeOrderId) || safeOrderId <= 0) {
      return false;
    }
    const event = {
      eventId: randomUUID(),
      type: String(type || 'order.updated'),
      orderId: safeOrderId,
      version,
      occurredAt: new Date().toISOString(),
    };
    this.io.to(`shop:${safeShopId}:orders`).emit('order:changed', event);
    [...new Set(kitchenIds.map(Number).filter(id => Number.isInteger(id) && id > 0))]
      .forEach(kitchenId => this.io.to(`shop:${safeShopId}:kitchen:${kitchenId}`).emit('order:changed', event));
    return true;
  }

  async close() {
    if (!this.io) return;
    const io = this.io;
    this.io = null;
    await new Promise(resolve => io.close(resolve));
  }
}

module.exports = new OrderRealtimeService();
module.exports.OrderRealtimeService = OrderRealtimeService;
