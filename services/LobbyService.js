const { getUserPermissions } = require('../authorization/service');
const shiftService = require('./ShiftService');

const MODULES = [
  { id: 'dashboard', label: 'Dashboards', desc: 'Overview of sales, revenue, and store health analytics.', icon: '<rect x="3" y="3" width="7" height="7" rx="1" fill="#4F46E5"/><rect x="14" y="3" width="7" height="7" rx="1" fill="#0EA5E9"/><rect x="3" y="14" width="7" height="7" rx="1" fill="#10B981"/><rect x="14" y="14" width="7" height="7" rx="1" fill="#F59E0B"/>' },
  { id: 'pos', label: 'POS Terminal', desc: 'Process sales, generate bills, and manage customer checkouts.', icon: '<path d="M4 6h16v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6z" fill="#F59E0B"/><path d="M3 6h18v2H3V6z" fill="#D97706"/><circle cx="12" cy="12" r="2" fill="white"/>' },
  { id: 'delivery', label: 'Delivery Panel', desc: 'Create shared delivery orders, update their status, and record who received payment.', icon: '<path d="M3 6h11v10H3z" fill="#2563EB"/><path d="M14 10h4l3 3v3h-7z" fill="#60A5FA"/><circle cx="7" cy="18" r="2" fill="#1D4ED8"/><circle cx="17" cy="18" r="2" fill="#1D4ED8"/>' },
  { id: 'brands', label: 'Brand Management', desc: 'Manage brand profiles and track their specific performance.', icon: '<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#8B5CF6"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'products', label: 'Menu', desc: 'Inventory tracking, stock alerts, and product catalog management.', icon: '<path d="M12 3L4 7v10l8 4 8-4V7l-8-4z" fill="#10B981"/><path d="M4 7l8 4 8-4M12 11v10" stroke="white" stroke-width="1.5"/>' },
  { id: 'sales-history', label: 'Sales', desc: 'Review past transactions, handle returns, and audit sales.', icon: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="#EF4444"/><path d="M7 7h10M7 12h10M7 17h7" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'analytics', label: 'Analytics & Reports', desc: 'Store performance, order rates, and activity heatmaps.', icon: '<path d="M3 3v18h18M7 16l4-4 4 4 6-6" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'expenses', label: 'Expenses', desc: 'Track operating costs, utilities, and brand expense shares.', icon: '<circle cx="12" cy="12" r="9" fill="#3B82F6"/><path d="M12 7v10M9 10l3-3 3 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'register', label: 'Register Shift', desc: 'Open your drawer, record cash drops, close shift, and review Z-report totals.', icon: '<rect x="4" y="5" width="16" height="14" rx="3" fill="#0F766E"/><path d="M8 9h8M8 13h3m4 0h1M8 17h8" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'customers', label: 'Customer Ledger', desc: 'Client relationship management and credit history tracking.', icon: '<circle cx="12" cy="8" r="4" fill="#10B981"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#10B981" opacity=".6"/>' },
  { id: 'notifications', label: 'Notifications', desc: 'Platform releases, assignments, and restaurant notices from the owner.', icon: '<rect x="4" y="4" width="16" height="16" rx="4" fill="#14B8A6" opacity=".18"/><path d="M7 8h10M7 12h7M7 16h5" stroke="#14B8A6" stroke-width="2" stroke-linecap="round"/><path d="M17 15l2 2 3-4" stroke="#14B8A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'notification-inbox', label: 'My Inbox', desc: 'Private order updates and operational messages relevant to you.', icon: '<rect x="3" y="5" width="18" height="15" rx="3" fill="#6366F1" opacity=".18"/><path d="M5 8l7 5 7-5M7 17h10" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'settings', label: 'Settings', desc: 'Configure shop preferences, receipts, and user access.', icon: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="#8B5CF6"/><path d="M19 12a7 7 0 01-.2 1.7l2 1.6-2 3.4-2.5-1a8 8 0 01-3 1.7L13 22H9l-.4-2.6a8 8 0 01-3-1.7l-2.5 1-2-3.4 2-1.6a7 7 0 010-3.4l-2-1.6 2-3.4 2.5 1a8 8 0 013-1.7L9 2h4l.4 2.6a8 8 0 013 1.7l2.5-1 2 3.4-2 1.6c.1.5.2 1.1.2 1.7z" fill="#8B5CF6" opacity=".25"/>' },
  { id: 'users', label: 'Staff Directory', desc: 'Manage team accounts, track shift access, and update permissions.', icon: '<circle cx="8" cy="8" r="3" fill="#6366F1"/><circle cx="16" cy="8" r="3" fill="#6366F1" opacity=".5"/><path d="M2 18c0-3 2.5-5 6-5s6 2 6 5M12 18c0-2.5 2-4 5-4s5 1.5 5 4" fill="#6366F1" opacity=".8"/>' },
  { id: 'hierarchy', label: 'Master Platform Hierarchy', desc: 'Create restaurants, connect services, and manage global settings.', icon: '<path d="M12 2L4 6v4c0 4.4 3.6 8 8 10 4.4-2 8-5.6 8-10V6l-8-4z" fill="#0EA5E9"/><path d="M12 7v5m-3-3h6" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'subscriptions', label: 'Platform Payments', desc: 'Central place for setup fees, advances, repairs, subscriptions, and platform income.', icon: '<rect x="3" y="4" width="18" height="16" rx="2" fill="#F59E0B"/><path d="M3 10h18" stroke="white" stroke-width="2"/><path d="M7 15h3M14 15h3" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'tables', label: 'Table Management', desc: 'View floor plan, monitor table status, assign guests and waiters.', icon: '<rect x="3" y="8" width="18" height="10" rx="2" fill="#10B981"/><rect x="7" y="4" width="2" height="4" fill="#10B981"/><rect x="15" y="4" width="2" height="4" fill="#10B981"/><rect x="7" y="18" width="2" height="4" fill="#10B981"/><rect x="15" y="18" width="2" height="4" fill="#10B981"/>' },
  { id: 'kds', label: 'Kitchen Display (KDS)', desc: 'Real-time order queue for the kitchen. Mark orders as ready.', icon: '<rect x="2" y="4" width="20" height="14" rx="2" fill="#F97316"/><path d="M7 9h10M7 12h7" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M2 20h20" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'raw-stock', label: 'Inventory', desc: 'Manage base stock and track ingredient batches.', icon: '<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#F97316"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'waste-management', label: 'Waste Management', desc: 'Record product, ingredient, recipe, order, and return waste.', icon: '<path d="M6 3h12l1 4H5l1-4z" fill="#E11D48" opacity=".25"/><path d="M7 7h10l-.8 13H7.8L7 7z" fill="#E11D48" opacity=".65"/><path d="M10 10v7M14 10v7M4 7h16" stroke="#E11D48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: 'logs', label: 'Logs', desc: 'Register, wastage, payment, sales, delivery, and activity audit records.', icon: '<path d="M4 4h16v16H4z" fill="#6366F1" opacity=".2"/><path d="M7 8h10M7 12h10M7 16h6" stroke="#6366F1" stroke-width="2" stroke-linecap="round"/><path d="M3 3h18v18H3V3z" fill="none" stroke="#6366F1" stroke-width="1.5"/>' },
];

const PLATFORM_OWNER_PANELS = new Set(['dashboard', 'hierarchy', 'subscriptions', 'notifications', 'settings', 'users', 'logs']);
const PANEL_MODULES = {
  dashboard: ['dashboard'], pos: ['orders'], delivery: ['delivery'], 'sales-history': ['orders'], customers: ['customers'],
  products: ['products'], brands: ['brands'], 'raw-stock': ['raw_stock', 'recipes'], 'waste-management': ['waste'],
  kds: ['kitchen_orders'], expenses: ['expenses'], tables: ['tables'], analytics: ['analytics'], register: ['register'],
  logs: ['activity_logs'], settings: ['settings'], users: ['users', 'roles'], notifications: ['notifications'],
};

function canManageRegister(user) {
  return Boolean(user.can_manage_register || ['admin', 'manager', 'receptionist'].includes(user.role));
}

async function getLobby(user, resolvedPermissions) {
  const permissions = Array.isArray(resolvedPermissions) ? resolvedPermissions : await getUserPermissions(user);
  const permissionSet = new Set(permissions);
  const manageRegister = user.role !== 'superadmin' && canManageRegister(user);
  let activeShift = null;
  if (user.role !== 'superadmin' && (permissionSet.has('register.view') || manageRegister)) {
    activeShift = await shiftService.getActiveShift(user.shop_id, user.id);
  }

  const allowedPanels = Array.isArray(user.allowed_panels) ? user.allowed_panels : [];
  const allowed = MODULES.filter(module => {
    if (module.id === 'notification-inbox') return user.role !== 'superadmin';
    if (module.id === 'pos') return permissionSet.has('orders.create') || permissionSet.has('orders.view');
    if (module.id === 'register') return manageRegister || activeShift?.status === 'open';
    if (module.id === 'logs') return user.role === 'superadmin' || permissionSet.has('activity_logs.view');
    if (user.role === 'superadmin') return PLATFORM_OWNER_PANELS.has(module.id);
    const isCoreAdministration = module.id === 'settings' || module.id === 'users';
    if (!isCoreAdministration && !allowedPanels.includes(module.id)) return false;
    const modules = PANEL_MODULES[module.id] || [];
    return modules.some(name => permissions.some(key => key.startsWith(`${name}.`)));
  });

  if (!allowed.length && user.role === 'admin') allowed.push(MODULES[0]);

  return {
    user: {
      id: user.id, name: user.name, username: user.username, role: user.role,
      shop_id: user.shop_id, shop_name: user.shop_name, subscription: user.subscription,
      can_manage_register: user.can_manage_register, permissions,
    },
    register: {
      can_manage: manageRegister,
      active: activeShift?.status === 'open',
      started_at: activeShift?.start_time || null,
    },
    modules: allowed.map(module => ({
      ...module,
      frontend: module.id === 'users' ? 'react' : 'legacy',
      target: module.id === 'users' ? '/app/staff' : `/dashboard#${module.id}`,
    })),
  };
}

module.exports = { getLobby, MODULES };
