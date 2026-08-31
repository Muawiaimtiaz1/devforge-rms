const { requirePermission } = require('./middleware');

const RESOURCE_MODULE = {
  sales: 'orders', delivery: 'delivery', kds: 'kitchen_orders', products: 'products',
  'product-categories': 'products', 'raw-stock': 'raw_stock', recipes: 'recipes', brands: 'brands',
  customers: 'customers', expenses: 'expenses', 'expense-categories': 'expenses', tables: 'tables',
  analytics: 'analytics', ai: 'analytics', shifts: 'register', 'shop-settings': 'settings', printers: 'settings',
  users: 'users', staff: 'users', roles: 'roles', notifications: 'notifications', 'activity-logs': 'activity_logs', waste: 'waste',
  attendance: 'attendance',
  leave: 'leave',
  payroll: 'payroll',
  documents: 'documents',
  'staff-activity': 'staff_activity',
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
    if (/cash-drops\/pending/.test(path)) return 'verify_cash';
    if (/cash-drop/.test(path)) return path.includes('verify') ? 'verify_cash' : 'cash_drop';
    if (/handover/.test(path)) return path.includes('verify') ? 'verify_cash' : 'handover';
    if (/close/.test(path)) return 'close';
    return 'open';
  }
  if (resource === 'users' && /assignable/.test(path)) return 'view';
  if (resource === 'staff' && /\/access/.test(path)) return method === 'GET' ? 'view' : 'update';
  if (resource === 'attendance') {
    if (/\/shift-register/.test(path)) return method === 'GET' ? 'view' : 'mark_daily';
    if (/\/clock/.test(path)) return method === 'GET' ? 'view' : 'clock';
    if (/\/corrections\/\d+\/review/.test(path)) return 'approve';
    if (/\/corrections/.test(path)) return method === 'GET' ? 'approve' : 'correct';
    if (/\/templates|\/schedules|\/holidays/.test(path)) return method === 'GET' ? 'view' : 'manage_schedules';
    return 'view';
  }
  if (resource === 'leave') {
    if (/\/requests\/\d+\/decision/.test(path)) return 'approve';
    if (/\/types|\/balances/.test(path)) return method === 'GET' ? 'view' : 'manage';
    if (/\/requests/.test(path)) return method === 'GET' ? 'view' : 'request';
    return 'view';
  }
  if (resource === 'payroll') {
    if (/\/staff\/\d+\/salary/.test(path)) return method === 'GET' ? 'view' : 'configure';
    if (/\/salary-configs|\/recurring-items|\/advances|\/adjustments/.test(path)) return method === 'GET' ? 'view' : 'configure';
    if (/\/runs\/\d+\/transition/.test(path)) return ({ review:'review', approve:'approve', finalize:'finalize' }[req.body?.action] || 'view');
    if (/\/runs\/\d+\/reverse/.test(path)) return 'finalize';
    if (/\/runs/.test(path)) return method === 'GET' ? 'view' : 'run';
    if (/\/periods/.test(path)) return method === 'GET' ? 'view' : 'run';
    return 'view';
  }
  if (resource === 'documents') {
    if (/\/categories/.test(path)) return method === 'GET' ? 'view' : 'manage';
    if (/\/download$/.test(path)) return 'download'; if (/\/view$/.test(path)) return 'view'; if (/\/archive$/.test(path)) return 'manage';
    return method === 'GET' ? 'view' : 'upload';
  }
  if (resource === 'staff-activity') { if (/\/export$/.test(path)) return 'export'; if (/\/records/.test(path)) return method==='GET'?'view':'manage'; return 'view'; }
  if (resource === 'notifications') return method === 'GET' ? 'view' : (method === 'PATCH' && /read/.test(path) ? 'mark_read' : 'manage');
  if (resource === 'products' && /stock|harvest/.test(path)) return 'adjust_stock';
  if (resource === 'products' && /damage/.test(path)) return 'manage_damage';
  if (resource === 'raw-stock' && /\/stock$|\/details$/.test(path)) return 'adjust';
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
  // My Inbox is intrinsic to every authenticated shop user. Only requests
  // explicitly scoped to the private inbox bypass optional notification-panel
  // permissions; platform communication continues through notifications.*.
  if (resource === 'notifications') {
    const inboxChannel = req.query?.channel === 'inbox' || req.body?.channel === 'inbox';
    const inboxRead = req.method === 'GET' && inboxChannel;
    const inboxReadState = req.method === 'PATCH' && inboxChannel && /\/read(?:-all)?$|\/\d+\/read$/.test(req.path);
    if (inboxRead || inboxReadState) return next();
  }
  let action = actionFor(req, resource);
  // Reception operates its own drawer. Route-level shift checks still restrict
  // access to the logged-in user's shop and personal shift. Admin verification
  // and register history remain permission-controlled.
  if (
    resource === 'shifts' &&
    String(req.session?.user?.role || '').toLowerCase() === 'receptionist' &&
    ['view', 'open', 'close', 'cash_drop', 'handover'].includes(action)
  ) return next();
  if (
    resource === 'users' &&
    /assignable/.test(req.path) &&
    String(req.session?.user?.role || '').toLowerCase() === 'receptionist'
  ) return next();
  if (resource === 'shifts' && req.method === 'GET' && /pending-handovers/.test(req.path)) {
    return requirePermission('register.handover', 'register.verify_cash')(req, res, next);
  }
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
  if (resource === 'kds' && req.method === 'PATCH' && /served/i.test(JSON.stringify(req.body || {}))) {
    // The service validates that the actor is the assigned order taker or reception.
    return next();
  }
  if (resource === 'admin' && /financial-logs/.test(req.path)) return requirePermission(`platform_finance.${action}`)(req, res, next);
  if (resource === 'staff' && /\/access$/.test(req.path) && req.method === 'POST') {
    return requirePermission('users.create', 'users.update')(req, res, next);
  }
  if (resource === 'staff' && /\/access$/.test(req.path) && req.method === 'PATCH') {
    return requirePermission('users.update', 'users.assign_roles')(req, res, next);
  }
  if (resource === 'payroll' && /\/staff\/\d+\/salary/.test(req.path)) {
    return req.method === 'GET'
        ? requirePermission('users.view', 'users.update', 'payroll.view')(req, res, next)
      : requirePermission('users.update', 'payroll.configure')(req, res, next);
  }
  return requirePermission(`${module}.${action}`, ...supportingOrderReads)(req, res, next);
}

module.exports = { enforceApiPermissions, actionFor, RESOURCE_MODULE };
