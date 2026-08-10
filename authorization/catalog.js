const MODULES = {
  dashboard: ['view'],
  orders: ['view', 'create', 'update', 'remove_items', 'complete', 'take_payment', 'return'],
  delivery: ['view', 'update_status', 'take_payment'],
  kitchen_orders: ['view', 'update_status', 'complete'],
  products: ['view', 'create', 'update', 'delete', 'adjust_stock', 'manage_damage'],
  raw_stock: ['view', 'create', 'adjust', 'record_waste'],
  recipes: ['view', 'create', 'update', 'delete', 'link_product'],
  brands: ['view', 'create', 'update', 'delete', 'manage_payments'],
  customers: ['view', 'create', 'update', 'delete', 'manage_ledger'],
  expenses: ['view', 'create', 'update', 'delete', 'export'],
  tables: ['view', 'manage'],
  analytics: ['view'],
  register: ['view', 'open', 'close', 'cash_drop', 'verify_cash', 'handover', 'view_history'],
  settings: ['view', 'update', 'manage_discounts', 'manage_taxes', 'manage_printers'],
  users: ['view', 'create', 'update', 'delete', 'assign_roles'],
  roles: ['view', 'create', 'update', 'delete', 'assign_permissions'],
  notifications: ['view', 'mark_read', 'manage'],
  activity_logs: ['view'],
  waste: ['view', 'create'],
  platform_shops: ['view', 'create', 'update', 'delete'],
  platform_subscriptions: ['view', 'manage'],
  platform_finance: ['view', 'manage'],
};

const PERMISSIONS = Object.entries(MODULES).flatMap(([module, actions]) =>
  actions.map((action) => ({
    key: `${module}.${action}`,
    module,
    action,
    label: `${action.replace(/_/g, ' ')} ${module.replace(/_/g, ' ')}`,
  })),
);

const ALL_PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);

const STANDARD_ROLES = {
  'Restaurant Admin': ALL_PERMISSION_KEYS.filter(key => !key.startsWith('platform_')),
  Manager: ALL_PERMISSION_KEYS.filter(key => !key.startsWith('platform_') && !key.startsWith('roles.') && !key.startsWith('users.')),
  Cashier: ['dashboard.view', 'orders.view', 'orders.create', 'orders.update', 'orders.complete', 'orders.take_payment', 'customers.view', 'customers.create', 'register.view', 'register.open', 'register.close', 'register.cash_drop'],
  Waiter: ['dashboard.view', 'orders.view', 'orders.create', 'customers.view', 'tables.view'],
  Kitchen: ['kitchen_orders.view', 'kitchen_orders.update_status', 'kitchen_orders.complete'],
  Rider: ['delivery.view', 'delivery.update_status', 'delivery.take_payment', 'orders.view'],
  'Inventory Staff': ['products.view', 'products.adjust_stock', 'raw_stock.view', 'raw_stock.create', 'raw_stock.adjust', 'raw_stock.record_waste', 'recipes.view', 'waste.view', 'waste.create'],
  Accountant: ['dashboard.view', 'orders.view', 'expenses.view', 'expenses.create', 'expenses.update', 'expenses.export', 'analytics.view', 'activity_logs.view'],
};

const PANEL_MODULES = {
  dashboard: ['dashboard'], pos: ['orders'], 'sales-history': ['orders'], delivery: ['delivery'],
  kds: ['kitchen_orders'], products: ['products'], brands: ['brands'], 'raw-stock': ['raw_stock'],
  'waste-management': ['waste'], 'raw-stock': ['raw_stock', 'recipes'], customers: ['customers'], expenses: ['expenses'], tables: ['tables'],
  analytics: ['analytics'], register: ['register'], logs: ['activity_logs'], settings: ['settings'],
  users: ['users', 'roles'], notifications: ['notifications'],
};

function permissionsForPanels(panels = []) {
  const modules = new Set(panels.flatMap((panel) => PANEL_MODULES[panel] || []));
  return PERMISSIONS.filter((permission) => modules.has(permission.module)).map((permission) => permission.key);
}

module.exports = { MODULES, PERMISSIONS, ALL_PERMISSION_KEYS, STANDARD_ROLES, permissionsForPanels };
