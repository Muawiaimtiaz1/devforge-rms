const { requirePermission } = require('./middleware');

const RESOURCE_MODULE = {
  sales: 'orders', delivery: 'delivery', kds: 'kitchen_orders', products: 'products',
  'product-categories': 'products', 'raw-stock': 'raw_stock', recipes: 'recipes', brands: 'brands',
  customers: 'customers', expenses: 'expenses', 'expense-categories': 'expenses', tables: 'tables',
  analytics: 'analytics', ai: 'analytics', shifts: 'register', 'shop-settings': 'settings', printers: 'settings',
  users: 'users', roles: 'roles', notifications: 'notifications', 'activity-logs': 'activity_logs', waste: 'waste',
  shops: 'platform_shops', subscriptions: 'platform_subscriptions', admin: 'platform_shops',
};

function actionFor(req, resource) {
  const method = req.method;
  const path = req.path;
  if (resource === 'sales') {
    if (method === 'POST' && /\/return$/.test(path)) return 'return';
    if (method === 'PATCH' && /\/pay$/.test(path)) return 'take_payment';
    if (method === 'POST') return 'create';
    if (method === 'GET') return 'view';
    return 'update';
  }
  if (resource === 'kds') return method === 'GET' ? 'view' : (/complete/i.test(JSON.stringify(req.body || {})) ? 'complete' : 'update_status');
  if (resource === 'delivery') return method === 'GET' ? 'view' : (/\/payment$/.test(path) ? 'take_payment' : 'update_status');
  if (resource === 'shifts') {
    if (/history|details|summary|active/.test(path) && method === 'GET') return path.includes('history') ? 'view_history' : 'view';
    if (/cash-drop/.test(path)) return path.includes('verify') ? 'verify_cash' : 'cash_drop';
    if (/handover/.test(path)) return path.includes('verify') ? 'verify_cash' : 'handover';
    if (/close/.test(path)) return 'close';
    return 'open';
  }
  if (resource === 'users' && /assignable/.test(path)) return 'view';
  if (resource === 'notifications') return method === 'GET' ? 'view' : (method === 'PATCH' && /read/.test(path) ? 'mark_read' : 'manage');
  if (resource === 'products' && /stock|harvest/.test(path)) return 'adjust_stock';
  if (resource === 'products' && /damage/.test(path)) return 'manage_damage';
  if (resource === 'raw-stock' && /waste/.test(path)) return method === 'GET' ? 'view' : 'record_waste';
  if (resource === 'recipes' && /link-product|product-links/.test(path)) return method === 'GET' ? 'view' : 'link_product';
  if (resource === 'customers' && /payment|adjustment/.test(path)) return 'manage_ledger';
  if (resource === 'brands' && /payment|dues|shares/.test(path)) return method === 'GET' ? 'view' : 'manage_payments';
  if (resource === 'expenses' && /pdf/.test(path)) return 'export';
  if (resource === 'shop-settings') {
    if (/discount/.test(path)) return method === 'GET' ? 'view' : 'manage_discounts';
    if (/tax/.test(path)) return method === 'GET' ? 'view' : 'manage_taxes';
    return method === 'GET' ? 'view' : 'update';
  }
  if (resource === 'printers') return method === 'GET' ? 'view' : 'manage_printers';
  if (resource === 'tables') return method === 'GET' ? 'view' : 'manage';
  if (resource === 'admin') return /financial-logs/.test(path) ? (method === 'GET' ? 'view' : 'manage') : ({ GET: 'view', POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete' }[method]);
  if (resource === 'subscriptions') return method === 'GET' ? 'view' : 'manage';
  return ({ GET: 'view', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[method] || 'view');
}

function enforceApiPermissions(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/auth/')) return next();
  if (req.path.startsWith('/api/notifications/push/')) return next();
  // Print agents authenticate using per-job tokens rather than employee sessions.
  if (req.path.startsWith('/api/print-jobs/') || req.path === '/api/download-print-agent') return next();
  const resource = req.path.split('/')[2];
  const module = RESOURCE_MODULE[resource];
  if (!module) return next();
  let action = actionFor(req, resource);
  const supportingOrderReads = [];
  if (req.method === 'GET' && ['products', 'product-categories', 'tables', 'customers'].includes(resource)) {
    supportingOrderReads.push('orders.create');
  }
  if (req.method === 'GET' && resource === 'products') supportingOrderReads.push('orders.view');
  if (req.method === 'GET' && resource === 'users' && /assignable/.test(req.path)) supportingOrderReads.push('orders.create');
  if (req.method === 'GET' && resource === 'shop-settings' && /discounts|taxes/.test(req.path)) supportingOrderReads.push('orders.create');
  if (resource === 'kds' && req.method === 'PATCH' && /ready|completed/i.test(JSON.stringify(req.body || {}))) {
    return requirePermission('kitchen_orders.complete', 'orders.complete')(req, res, next);
  }
  if (resource === 'admin' && /financial-logs/.test(req.path)) return requirePermission(`platform_finance.${action}`)(req, res, next);
  return requirePermission(`${module}.${action}`, ...supportingOrderReads)(req, res, next);
}

module.exports = { enforceApiPermissions };
