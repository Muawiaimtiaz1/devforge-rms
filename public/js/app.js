// ─── Helpers ─────────────────────────────────────────────────────────
const $c = document.getElementById.bind(document);

function isActionControl(element) {
  return element?.closest?.('button, [role="button"], a[onclick], [onclick]:not(input):not(select):not(textarea)');
}

function showActionFeedback(control) {
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
  control.classList.remove('rms-action-feedback');
  // Restart the confirmation flash even when the same control is tapped quickly.
  void control.offsetWidth;
  control.classList.add('rms-action-feedback');
  setTimeout(() => control?.classList?.remove('rms-action-feedback'), 240);
  if (navigator.vibrate) navigator.vibrate(12);
}

document.addEventListener('pointerdown', event => {
  const control = isActionControl(event.target);
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
  control.classList.add('rms-action-pressed');
}, true);

['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, event => {
  document.querySelectorAll('.rms-action-pressed').forEach(control => control.classList.remove('rms-action-pressed'));
}, true));

document.addEventListener('click', event => showActionFeedback(isActionControl(event.target)), true);

function redirectToLoginForSession() {
  if (window._sessionRedirectInProgress) return;
  window._sessionRedirectInProgress = true;
  try {
    sessionStorage.removeItem("lobby_selected");
  } catch (e) {}
  setTimeout(() => {
    window.location.replace("/");
  }, 600);
}

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await res.json();
    if (res.status === 401) {
      toast("Session expired. Please login again.", "error");
      redirectToLoginForSession();
      throw new Error(data.error || "Session expired");
    }
    if (!res.ok) {
      const message = formatApiErrorMessage(data, res.status);
      toast(message, "error");
      const error = new Error(message);
      error.status = res.status;
      error.details = data.details;
      throw error;
    }
    return data;
  } else {
    const text = await res.text();
    if (res.status === 401) {
      toast("Session expired. Please login again.", "error");
      redirectToLoginForSession();
      throw new Error("Session expired");
    }
    if (!res.ok) {
      const message = `Server Error (${res.status}): ${text.substring(0, 100)}...`;
      toast(message, "error");
      throw new Error(message);
    }
    return text;
  }
}

function formatApiErrorMessage(data, status) {
  const base = data?.error || `API Error: ${status}`;
  if (Array.isArray(data?.details) && data.details.length) {
    return `${base} ${data.details.join(" ")}`;
  }
  if (typeof data?.details === "string" && data.details.trim()) {
    return `${base} ${data.details.trim()}`;
  }
  return base;
}

let _lastToast = { key: "", at: 0 };
const toast = (msg, type = "success") => {
  const key = `${type}:${msg}`;
  const now = Date.now();
  if (_lastToast.key === key && now - _lastToast.at < 1000) return;
  _lastToast = { key, at: now };

  const el = document.createElement("div");
  const base =
    "fixed top-8 right-8 z-[100] px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold animate-in fade-in slide-in-from-right-10 duration-300 transform flex items-center gap-3";
  el.className = `${base} ${type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`;
  const icon = document.createElement("span");
  icon.textContent = type === "success" ? "✓" : "✕";
  const label = document.createElement("span");
  label.textContent = msg;
  el.append(icon, label);
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("animate-out", "fade-out", "slide-out-to-right-10");
    setTimeout(() => el.remove(), 300);
  }, 3000);
};

// ─── Theme ───────────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  if (isDark) {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  } else {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }
  updateProfileThemeLabel();
}

function updateProfileThemeLabel() {
  const label = document.getElementById("profile-theme-label");
  if (label) label.textContent = document.documentElement.classList.contains("dark") ? "Switch to light mode" : "Switch to dark mode";
}

function toggleSettingsNav() {
  const nav = document.getElementById("settings-nav-drawer");
  const backdrop = document.getElementById("settings-nav-backdrop");
  if (!nav || !backdrop) return;
  if (nav.classList.contains("-translate-x-full")) {
    nav.classList.remove("-translate-x-full");
    backdrop.classList.remove("hidden");
    setTimeout(() => backdrop.classList.add("opacity-100"), 10);
  } else {
    nav.classList.add("-translate-x-full");
    backdrop.classList.remove("opacity-100");
    setTimeout(() => backdrop.classList.add("hidden"), 300);
  }
}


// ─── Dropdown ──────────────────────────────────────────────────────────
function toggleUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("profile-dropdown");
  const trigger = document.getElementById("profile-trigger");
  if (!dropdown) return;
  const isOpen = dropdown.classList.toggle("active");
  if (trigger) trigger.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) dropdown.querySelector('[role="menuitem"]')?.focus();
}

function closeUserDropdown() {
  document.getElementById("profile-dropdown")?.classList.remove("active");
  document.getElementById("profile-trigger")?.setAttribute("aria-expanded", "false");
}

window.addEventListener("click", (e) => {
  const dropdown = document.getElementById("profile-dropdown");
  const trigger = document.getElementById("profile-trigger");
  if (dropdown && dropdown.classList.contains("active")) {
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
      closeUserDropdown();
    }
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("profile-dropdown")?.classList.contains("active")) {
    closeUserDropdown();
    document.getElementById("profile-trigger")?.focus();
  }
});

// ─── State ──────────────────────────────────────────────────────────
let currentUser = null;
let cart = [];
let allProducts = [];
let productMap = {}; // Index for O(1) lookups
const POS_PRODUCTS_PER_PAGE = 20;
let _posProductPage = 1;
let _posProductCategory = "";
let _posProductSearch = "";
let _posServerPagination = null;
let _inventoryProductPage = 1;
const INVENTORY_PRODUCTS_PER_PAGE = 20;
let _posFilteredProducts = [];

function syncProductMap(products) {
  productMap = {};
  products.forEach((p) => (productMap[p.id] = p));
}

function debounce(func, timeout = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
}

function getLooseUnits(p) {
  if (!p.components || p.components.length === 0) return 0;
  let maxLoose = 0;
  p.components.forEach((c) => {
    const child = productMap[c.id]; // Fast O(1) lookup
    if (child && child.stock > 0) {
      const units = Math.ceil(child.stock / c.quantity);
      if (units > maxLoose) maxLoose = units;
    }
  });
  return maxLoose;
}
let _expenseView = "list";
let _expenseMonth = new Date().toISOString().slice(0, 7);
let _expensePage = 1;
let _posFloors = [];
let _posAllTables = [];
let _posTableSelectionView = "map";
let _posActiveOrders = [];
let _posOrdersLoadPromise = null;
let _posOrdersRenderPromise = null;
let _posOrdersPollingTimer = null;
const POS_ORDERS_POLL_INTERVAL_MS = 60 * 1000;
let _expenseCategories = [];
let _productCategories = [];
let _kdsOrdersCache = [];
let shops = [];
let managedShopId = null;
let _posCustomerResults = [];
let _posSelectedCustomer = null;
let _posCheckoutCloseTimer = null;
let _editingOrderId = null; // ID of the sale being edited in the POS
let _posCheckoutSubmitting = false;
let _posDiscountPresets = [];
let _posTaxPresets = [];
let _tempEditCart = []; // Temporary cart for the edit modal
let _tempEditSaleDetails = null; // Temporary sale details for the edit modal
let _currentPage = "dashboard";
let currentShift = null;
let _appHistoryReady = false;
let _handlingAppPopState = false;

function isPlatformOwner() {
  return currentUser?.role === "superadmin";
}

function returnToNavigationHome() {
  if (isPlatformOwner()) {
    window.location.href = "/admin/store-monitoring";
    return;
  }
  sessionStorage.removeItem("lobby_selected");
  history.pushState({ rmsView: 'lobby' }, '', `${location.pathname}#lobby`);
  renderLobby();
}

function openSaasCommandCenter(tab = "overview") {
  const validTabs = ["overview", "activity", "health", "ledger"];
  const targetTab = validTabs.includes(tab) ? tab : "overview";
  const hash = targetTab === "overview" ? "" : `#${targetTab}`;
  window.location.href = `/admin/store-monitoring${hash}`;
}

function openPlatformModule(page) {
  if (!PLATFORM_OWNER_PANELS.includes(page)) {
    toast("That platform area is not available.", "error");
    return;
  }
  sessionStorage.setItem("lobby_selected", "true");
  localStorage.setItem("pos_page", page);
  window.location.href = `/dashboard?platform_page=${encodeURIComponent(page)}`;
}

function setPlatformShellActive(page) {
  document
    .querySelectorAll("#saas-command-sidebar .rail-btn")
    .forEach((button) => button.classList.remove("active"));

  const activeButton = Array.from(
    document.querySelectorAll("#saas-command-sidebar [data-platform-page]")
  ).find((button) => button.dataset.platformPage === page);

  if (activeButton) activeButton.classList.add("active");
}

function configurePlatformOwnerShell(activePage) {
  if (!isPlatformOwner()) {
    document.body.classList.remove("platform-owner-shell");
    return;
  }
  document.body.classList.add("platform-owner-shell");
  setPlatformShellActive(activePage);
}

/**
 * ─── Shift Management ──────────────────────────────────────────────────
 */
async function fetchActiveShift() {
  if (isPlatformOwner()) {
    currentShift = null;
    updateShiftStatusUI();
    return;
  }

  if (!currentUserHasPermission('register.view') && !canCurrentUserManageRegister()) {
    currentShift = null;
    updateShiftStatusUI();
    return;
  }

  try {
    const shift = await api("/api/shifts/active");
    currentShift = shift && shift.status === 'open' ? shift : null;
    updateShiftStatusUI();
  } catch (err) {
    console.error("Shift fetch error:", err);
  }
}

function updateShiftStatusUI() {
  const badge = document.getElementById("shift-status-badge");
  if (!badge) return;

  if (isPlatformOwner()) {
    badge.classList.add("hidden");
    badge.innerHTML = "";
    badge.title = "";
    return;
  }

  badge.classList.remove("hidden");

  if (currentShift) {
    badge.className = "header-status-badge !bg-emerald-500 !text-white !shadow-emerald-500/20";
    badge.innerHTML = `
      <div class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
      Register Open
    `;
    badge.title = `Shift started at ${new Date(currentShift.start_time).toLocaleTimeString()}`;
  } else {
    const canManage = canCurrentUserManageRegister();
    
    if (canManage) {
        badge.className = "header-status-badge !bg-rose-500 !text-white !shadow-rose-500/20 cursor-pointer";
        badge.innerHTML = `
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          Register Closed
        `;
    } else {
        badge.className = "header-status-badge !bg-slate-400 !text-white !opacity-60";
        badge.innerHTML = `
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          Shift Required
        `;
    }
  }
}

function formatSubscriptionDate(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-GB");
}

function getSubscriptionQuotaTone(subscription) {
  if (!subscription || subscription.status === "expired") {
    return {
      badge: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
      progress: "bg-rose-500",
      card: "border-rose-100 dark:border-rose-500/20 bg-rose-50/70 dark:bg-rose-500/10",
    };
  }

  if (subscription.is_lifetime || Number(subscription.remaining_days || 0) > 7) {
    return {
      badge: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
      progress: "bg-emerald-500",
      card: "border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-500/10",
    };
  }

  return {
    badge: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    progress: "bg-amber-500",
    card: "border-amber-100 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-500/10",
  };
}

function getSubscriptionQuotaLabel(subscription) {
  if (!subscription) return "No active subscription";
  return subscription.label || (subscription.is_lifetime ? "Lifetime access" : "Subscription active");
}

function getSubscriptionTimelineLabel(subscription) {
  if (!subscription) return "No subscription timeline available";
  if (subscription.is_lifetime) return "Unlimited access";
  const remaining = Number(subscription.remaining_days || 0);
  const total = Number(subscription.total_days || 0);
  if (!total) return getSubscriptionQuotaLabel(subscription);
  return `${remaining} of ${total} day${total === 1 ? "" : "s"} remaining`;
}

function updateSubscriptionQuotaUI() {
  const badge = document.getElementById("subscription-quota-badge");
  if (!badge) return;

  if (!currentUser || currentUser.role === "superadmin") {
    badge.className = "hidden";
    badge.innerHTML = "";
    return;
  }

  const subscription = currentUser.subscription;
  const tone = getSubscriptionQuotaTone(subscription);
  const label = getSubscriptionQuotaLabel(subscription);
  const plan = subscription?.type_label || "Subscription";

  badge.className = `hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${tone.badge}`;
  badge.innerHTML = `
    <span class="w-1.5 h-1.5 rounded-full ${tone.progress}"></span>
    ${escapeOrderValue(label)}
  `;
  badge.title = subscription
    ? `${plan}: ${label}${subscription.end_date ? `, valid until ${formatSubscriptionDate(subscription.end_date)}` : ""}`
    : "No active subscription found";
}

function canCurrentUserManageRegister() {
  if (!currentUser || isPlatformOwner()) return false;
  return !!(currentUser.can_manage_register || ['admin', 'manager', 'receptionist'].includes(currentUser.role));
}

async function ensureOpenShiftForPayment() {
  if (isPlatformOwner()) {
    toast("Platform owners do not open shop registers or collect POS payments.", "error");
    return false;
  }

  await fetchActiveShift();
  if (currentShift) return true;

  if (canCurrentUserManageRegister()) {
    toast("Open your register shift before collecting payment.", "error");
    navigate("register");
  } else {
    toast("A cashier with an open register must collect this payment.", "error");
  }
  return false;
}

async function openShiftManagement() {
  if (isPlatformOwner()) {
    toast("Platform owners do not use shop register shifts.", "error");
    return false;
  }
  navigate("register");
}

// ─── Setup ────────────────────────────────────────────────────────────
const AVAILABLE_PANELS = [
  {
    id: "dashboard",
    icon: `<rect x="3" y="3" width="7" height="7" rx="1" fill="#4F46E5"/><rect x="14" y="3" width="7" height="7" rx="1" fill="#0EA5E9"/><rect x="3" y="14" width="7" height="7" rx="1" fill="#10B981"/><rect x="14" y="14" width="7" height="7" rx="1" fill="#F59E0B"/>`,
    label: "Dashboards",
    desc: "Overview of sales, revenue, and store health analytics."
  },
  {
    id: "pos",
    icon: `<path d="M4 6h16v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6z" fill="#F59E0B"/><path d="M3 6h18v2H3V6z" fill="#D97706"/><circle cx="12" cy="12" r="2" fill="white"/>`,
    label: "POS Terminal",
    desc: "Process sales, generate bills, and manage customer checkouts."
  },
  {
    id: "delivery",
    icon: `<path d="M3 6h11v10H3z" fill="#2563EB"/><path d="M14 10h4l3 3v3h-7z" fill="#60A5FA"/><circle cx="7" cy="18" r="2" fill="#1D4ED8"/><circle cx="17" cy="18" r="2" fill="#1D4ED8"/>`,
    label: "Delivery Panel",
    desc: "Create shared delivery orders, update their status, and record who received payment."
  },
  {
    id: "brands",
    icon: `<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#8B5CF6"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Brand Management",
    desc: "Manage brand profiles and track their specific performance."
  },
  {
    id: "products",
    icon: `<path d="M12 3L4 7v10l8 4 8-4V7l-8-4z" fill="#10B981"/><path d="M4 7l8 4 8-4M12 11v10" stroke="white" stroke-width="1.5"/>`,
    label: "Menu",
    desc: "Inventory tracking, stock alerts, and product catalog management."
  },
  {
    id: "sales-history",
    icon: `<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="#EF4444"/><path d="M7 7h10M7 12h10M7 17h7" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Sales",
    desc: "Review past transactions, handle returns, and audit sales."
  },
  {
    id: "analytics",
    icon: `<path d="M3 3v18h18M7 16l4-4 4 4 6-6" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Analytics & Reports",
    desc: "Store performance, order rates, and activity heatmaps."
  },
  {
    id: "expenses",
    icon: `<circle cx="12" cy="12" r="9" fill="#3B82F6"/><path d="M12 7v10M9 10l3-3 3 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Expenses",
    desc: "Track operating costs, utilities, and brand expense shares."
  },
  {
    id: "register",
    icon: `<rect x="4" y="5" width="16" height="14" rx="3" fill="#0F766E"/><path d="M8 9h8M8 13h3m4 0h1M8 17h8" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Register Shift",
    desc: "Open your drawer, record cash drops, close shift, and review Z-report totals."
  },
  {
    id: "customers",
    icon: `<circle cx="12" cy="8" r="4" fill="#10B981"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#10B981" opacity="0.6"/>`,
    label: "Customer Ledger",
    desc: "Client relationship management and credit history tracking."
  },
  {
    id: "notifications",
    icon: `<rect x="4" y="4" width="16" height="16" rx="4" fill="#14B8A6" opacity="0.18"/><path d="M7 8h10M7 12h7M7 16h5" stroke="#14B8A6" stroke-width="2" stroke-linecap="round"/><path d="M17 15l2 2 3-4" stroke="#14B8A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Notifications",
    desc: "Platform releases, assignments, and restaurant notices from the owner."
  },
  {
    id: "notification-inbox",
    icon: `<rect x="3" y="5" width="18" height="15" rx="3" fill="#6366F1" opacity="0.18"/><path d="M5 8l7 5 7-5M7 17h10" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "My Inbox",
    desc: "Private order updates and operational messages relevant to you."
  },
  {
    id: "settings",
    icon: `<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="#8B5CF6"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1h.09a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" fill="#8B5CF6" opacity="0.3"/>`,
    label: "Settings",
    desc: "Configure shop preferences, receipts, and user access."
  },
  {
    id: "users",
    icon: `<circle cx="8" cy="8" r="3" fill="#6366F1"/><circle cx="16" cy="8" r="3" fill="#6366F1" opacity="0.5"/><path d="M2 18c0-3 2.5-5 6-5s6 2 6 5M12 18c0-2.5 2-4 5-4s5 1.5 5 4" fill="#6366F1" opacity="0.8"/>`,
    label: "Staff Directory",
    desc: "Manage team accounts, track shift access, and update permissions."
  },
  {
    id: "hierarchy",
    icon: `<path d="M12 2L4 6v4c0 4.4 3.6 8 8 10 4.4-2 8-5.6 8-10V6l-8-4z" fill="#0EA5E9"/><path d="M12 7v5m-3-3h6" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Master Platform Hierarchy",
    desc: "Create restaurants, connect services, and manage global settings."
  },
  {
    id: "subscriptions",
    icon: `<rect x="3" y="4" width="18" height="16" rx="2" fill="#F59E0B"/><path d="M3 10h18" stroke="white" stroke-width="2"/><path d="M7 15h3M14 15h3" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
    label: "Platform Payments",
    desc: "Central place for setup fees, advances, repairs, subscriptions, and platform income."
  },
  {
    id: "tables",
    icon: `<rect x="3" y="8" width="18" height="10" rx="2" fill="#10B981"/><rect x="7" y="4" width="2" height="4" fill="#10B981"/><rect x="15" y="4" width="2" height="4" fill="#10B981"/><rect x="7" y="18" width="2" height="4" fill="#10B981"/><rect x="15" y="18" width="2" height="4" fill="#10B981"/>`,
    label: "Table Management",
    desc: "View floor plan, monitor table status, assign guests and waiters."
  },
  {
    id: "kds",
    icon: `<rect x="2" y="4" width="20" height="14" rx="2" fill="#F97316"/><path d="M7 9h10M7 12h7" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M2 20h20" stroke="#F97316" stroke-width="2" stroke-linecap="round"/>`,
    label: "Kitchen Display (KDS)",
    desc: "Real-time order queue for the kitchen. Mark orders as ready."
  },
  {
    id: "raw-stock",
    icon: `<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#F97316"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Inventory",
    desc: "Manage base stock and track ingredient batches."
  },
  {
    id: "waste-management",
    icon: `<path d="M6 3h12l1 4H5l1-4z" fill="#E11D48" opacity="0.25"/><path d="M7 7h10l-.8 13H7.8L7 7z" fill="#E11D48" opacity="0.65"/><path d="M10 10v7M14 10v7M4 7h16" stroke="#E11D48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: "Waste Management",
    desc: "Record product, ingredient, recipe, order, and return waste."
  },
  {
    id: "logs",
    icon: `<path d="M4 4h16v16H4z" fill="#6366F1" opacity="0.2"/><path d="M7 8h10M7 12h10M7 16h6" stroke="#6366F1" stroke-width="2" stroke-linecap="round"/><path d="M3 3h18v18H3V3z" fill="none" stroke="#6366F1" stroke-width="1.5"/>`,
    label: "Logs",
    desc: "Register, wastage, payment, sales, delivery, and activity audit records."
  },
];

const PLATFORM_OWNER_PANELS = ["dashboard", "hierarchy", "subscriptions", "notifications", "settings", "users", "logs"];

function canCurrentUserAccessRegister() {
  if (isPlatformOwner()) return false;
  return canCurrentUserManageRegister() || !!currentShift;
}

function isPanelAllowedForCurrentUser(panelId) {
  // Every signed-in user receives a private, relevance-filtered notification inbox.
  if (panelId === "notification-inbox") return !!currentUser && currentUser.role !== 'superadmin';
  // POS is useful only when the user may create a new order or view existing orders.
  // Other order permissions (pay, complete, return, etc.) must not expose the terminal alone.
  if (panelId === "pos") {
    return currentUserHasPermission('orders.create') || currentUserHasPermission('orders.view');
  }
  if (panelId === "register") return canCurrentUserAccessRegister();
  if (panelId === "logs") {
    return currentUser?.role === 'superadmin' || currentUserHasPermission('activity_logs.view');
  }
  if (currentUser.role === "superadmin") return PLATFORM_OWNER_PANELS.includes(panelId);
  const permissionModules = {
    dashboard: ['dashboard'], pos: ['orders'], delivery: ['delivery'], 'sales-history': ['orders'],
    customers: ['customers'], products: ['products'], brands: ['brands'], 'raw-stock': ['raw_stock', 'recipes'],
    'waste-management': ['waste'], kds: ['kitchen_orders'], expenses: ['expenses'], tables: ['tables'],
    analytics: ['analytics'], register: ['register'], logs: ['activity_logs'], settings: ['settings'],
    users: ['users', 'roles'], notifications: ['notifications']
  };
  const modules = permissionModules[panelId] || [];
  const allowedPanels = currentUser.allowed_panels || [];
  const isCoreAdministration = panelId === 'settings' || panelId === 'users';
  if (!isCoreAdministration && !allowedPanels.includes(panelId)) return false;
  if (Array.isArray(currentUser.permissions)) {
    return modules.some((module) => currentUser.permissions.some((key) => key.startsWith(`${module}.`)));
  }
  if (currentUser.role === "admin" && (panelId === "settings" || panelId === "users")) return true;
  return allowedPanels.includes(panelId);
}

function getAllowedPanelsForCurrentUser() {
  return AVAILABLE_PANELS.filter((panel) => isPanelAllowedForCurrentUser(panel.id));
}

async function updateNotificationTopbarBadge() {
  const button = document.getElementById("topbar-notification-btn");
  const badge = document.getElementById("topbar-notification-count");
  if (!button || !badge || !currentUser) return;

  if (!isPanelAllowedForCurrentUser("notifications")) {
    button.classList.add("hidden");
    badge.classList.add("hidden");
    return;
  }

  button.classList.remove("hidden");
  try {
    const data = await api("/api/notifications/unread-count");
    const count = Number(data.count || 0);
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "";
      badge.classList.add("hidden");
    }
  } catch (error) {
    badge.classList.add("hidden");
  }
}

function openNotificationsPanel() {
  if (!isPanelAllowedForCurrentUser("notifications")) {
    toast("You do not have permission to view notifications.", "error");
    return false;
  }
  sessionStorage.setItem("lobby_selected", "true");
  document.body.classList.remove("lobby-active");
  return navigate("notifications");
}

const MODULE_GROUPS = [
  {
    title: "Overview",
    desc: "Daily command center and performance visibility.",
    panels: ["dashboard", "notifications", "analytics"],
  },
  {
    title: "Sales",
    desc: "Checkout, active orders, customer records, and sales history.",
    panels: ["pos", "delivery", "sales-history", "customers"],
  },
  {
    title: "Inventory",
    desc: "Products, brands, ingredients, and kitchen preparation.",
    panels: ["products", "brands", "raw-stock", "waste-management", "kds"],
  },
  {
    title: "Finance & Accounting",
    desc: "Costs, subscriptions, billing controls, and money movement.",
    panels: ["register", "logs", "expenses", "subscriptions"],
  },
  {
    title: "Operations",
    desc: "Floor, table, and service management.",
    panels: ["tables"],
  },
  {
    title: "Administration",
    desc: "People, permissions, platform structure, and system setup.",
    panels: ["settings", "users", "hierarchy"],
  },
];

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      window.location.replace("/");
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    currentUser.total_users = data.total_users || 1;
    currentUser.total_brands = data.total_brands || 1;
    const requestedPlatformPage = new URLSearchParams(window.location.search).get("platform_page");

    if (currentUser.role === "superadmin") {
      if (!requestedPlatformPage || !PLATFORM_OWNER_PANELS.includes(requestedPlatformPage)) {
        window.location.replace("/admin/store-monitoring");
        return;
      }
      sessionStorage.setItem("lobby_selected", "true");
      localStorage.setItem("pos_page", requestedPlatformPage);
      configurePlatformOwnerShell(requestedPlatformPage);
    } else {
      configurePlatformOwnerShell(null);
    }

    const nameSidebar = document.getElementById("user-name-sidebar");
    const roleSidebar = document.getElementById("user-role-sidebar");
    const profileMenuName = document.getElementById("profile-menu-name");
    const profileMenuRole = document.getElementById("profile-menu-role");
    const avatarHeader = document.getElementById("user-avatar");

    if (nameSidebar) nameSidebar.textContent = currentUser.name || currentUser.username;
    if (roleSidebar) roleSidebar.textContent = currentUser.role;
    if (profileMenuName) profileMenuName.textContent = currentUser.name || currentUser.username;
    if (profileMenuRole) profileMenuRole.textContent = currentUser.role;
    if (avatarHeader) {
      avatarHeader.textContent = (currentUser.name || currentUser.username)[0].toUpperCase();
    }
    updateProfileThemeLabel();

    // Display Shop Name in header
    const shopNameHeader = document.getElementById("header-shop-name");
    const shopMgmtHeader = document.getElementById("header-shop-mgmt");
    const lobbyUserDisplay = document.getElementById("header-username-display");
    const switchModuleButton = document.getElementById("switch-module-btn");

    if (shopNameHeader)
      shopNameHeader.textContent = currentUser.shop_name || "POS System";
    if (shopMgmtHeader) {
      shopMgmtHeader.textContent =
        currentUser.role === "superadmin"
          ? "Master Control"
          : "Restaurant Management";
    }
    if (lobbyUserDisplay) {
      lobbyUserDisplay.textContent = currentUser.username || currentUser.name;
    }
    if (currentUser.role === "superadmin") {
      if (switchModuleButton) switchModuleButton.title = "SaaS Command Center";
    }
    updateSubscriptionQuotaUI();
    updateNotificationTopbarBadge();


    if (currentUser.role === "superadmin") {
      const sData = await fetch("/api/shops").then((r) => r.json());
      shops = Array.isArray(sData) ? sData : [];
    }

    await fetchCategories();
    await fetchActiveShift();


    if (!sessionStorage.getItem("lobby_selected")) {
      history.replaceState({ rmsView: 'lobby' }, '', `${location.pathname}#lobby`);
      _appHistoryReady = true;
      return renderLobby();
    }
    let startPage = currentUser.role === "superadmin"
      ? requestedPlatformPage
      : localStorage.getItem("pos_page") || "dashboard";
    if (!isPanelAllowedForCurrentUser(startPage)) {
      startPage = getAllowedPanelsForCurrentUser()[0]?.id || "dashboard";
    }
    // Always keep an in-app lobby entry behind the restored page. Android Back
    // returns here before the installed PWA is allowed to close.
    history.replaceState({ rmsView: 'lobby' }, '', `${location.pathname}#lobby`);
    _appHistoryReady = true;
    navigate(startPage);
  } catch (e) {
    console.error("Init Error:", e);
    window.location.replace("/");
  }
}

async function revalidateDashboardSessionOnRestore() {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) redirectToLoginForSession();
  } catch (e) {
    redirectToLoginForSession();
  }
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) revalidateDashboardSessionOnRestore();
});

// ─── Router ──────────────────────────────────────────────────────────
function navigate(page, options = {}) {
  if (page === "register" && !canCurrentUserAccessRegister()) {
    toast("You do not have permission to manage the register.", "error");
    return false;
  }
  if (page === "logs" && !isPanelAllowedForCurrentUser("logs")) {
    toast("You do not have permission to view logs.", "error");
    return false;
  }

  const parentMap = {
    "products-low-stock": "products",
    "menu-addons": "products",
    "product-categories": "products",
    "sales-pending": "sales-history",
    "pending-dues": "sales-history",
  };
  const permissionPanel = parentMap[page] || page;
  if (
    currentUser.role !== "superadmin" &&
    AVAILABLE_PANELS.some((panel) => panel.id === permissionPanel) &&
    !isPanelAllowedForCurrentUser(permissionPanel)
  ) {
    toast("You do not have permission to access this module.", "error");
    return false;
  }

  if (currentUser.role === "superadmin" && !PLATFORM_OWNER_PANELS.includes(page)) {
    // Superadmins can only access platform-level pages
    return false;
  }

  if (
    currentUser.role !== "superadmin" &&
    !AVAILABLE_PANELS.map((p) => p.id).includes(page)
  ) {
    // Check sub-pages
    const parent = parentMap[page];
    if (
      parent &&
      (!currentUser.allowed_panels ||
        !currentUser.allowed_panels.includes(parent))
    )
      return false;
    if (
      !parent &&
      page !== "users" &&
      page !== "settings" &&
      (!currentUser.allowed_panels ||
        !currentUser.allowed_panels.includes(page))
    )
      return false;
  }

  if (page !== "pos") stopPOSOrdersPolling();

  if (page === "pos" && !_editingOrderId) {
    window._posEntryOrderType = null;
  }

  _currentPage = page;
  if (_appHistoryReady && !_handlingAppPopState && options.history !== false) {
    const currentState = history.state;
    if (currentState?.rmsView !== 'page' || currentState.page !== page) {
      history.pushState({ rmsView: 'page', page }, '', `${location.pathname}#${encodeURIComponent(page)}`);
    }
  }
  localStorage.setItem("pos_page", page);
  sessionStorage.setItem("lobby_selected", "true");
  document.body.classList.remove("lobby-active");
  if (isPlatformOwner()) setPlatformShellActive(page);

  document
    .querySelectorAll(".nav-link")
    .forEach((l) => l.classList.remove("active"));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add("active");
  else if (parentMap[page]) document.getElementById(`nav-${parentMap[page]}`)?.classList.add('active');
  const titles = {
    dashboard: "Dashboard",
    brands: "Brands",
    products: "Menu",
    "product-categories": "Product Categories",
    "menu-addons": "Menu Add-ons",
    pos: "POS / Checkout",
    delivery: "Delivery Panel",
    "sales-history": "Sales History",
    expenses: "Expenses",
    register: "Register Shift",
    customers: "Customer Ledger",
    notifications: "Notifications",
    "notification-inbox": "My Inbox",
    settings: "System Settings",
    users: "Staff Directory",
    subscriptions: "Platform Payments",
    hierarchy: "Master Platform Hierarchy",
    tables: "Table Management",
    kds: "Kitchen Display System",
    "raw-stock": "Inventory",
    "waste-management": "Waste Management",
    recipes: "Manage Recipes",
    "pending-dues": "Pending Dues Ledger",
    analytics: "Analytics & Reports",
    logs: "Logs",
  };
  if (page === "dashboard" && currentUser.role === "superadmin")
    titles.dashboard = "System Overview (Master Admin)";
  document.getElementById("page-title").textContent = titles[page] || page;
  const content = document.getElementById("page-content");
  content.innerHTML =
    '<div class="flex items-center justify-center h-40 text-slate-600">Loading…</div>';

  const container = document.querySelector('main > div');
  const pageHeader = document.getElementById('page-header-wrap');
  setPOSTerminalTopNavHidden(false);
  if (page === 'settings' || page === 'pos' || page === 'delivery' || page === 'register' || page === 'kds') {
    container.classList.remove('container', 'mx-auto', 'px-6');
    container.classList.add('w-full', 'px-4', 'md:px-12');
    if (pageHeader) pageHeader.classList.add('hidden');
  } else {
    container.classList.add('container', 'mx-auto', 'px-6');
    container.classList.remove('w-full', 'px-4', 'md:px-12');
    if (pageHeader) pageHeader.classList.remove('hidden');
  }

  const pages = {
    dashboard: renderDashboard,
    brands: renderBrands,
    products: renderProducts,
    "product-categories": renderProductCategoriesPage,
    "menu-addons": renderMenuAddons,
    "products-low-stock": () => renderProducts(true),
    pos: renderPOS,
    delivery: renderDeliveryPanel,
    "sales-history": renderSalesHistory,
    "sales-pending": () => renderSalesHistory(true),
    expenses: renderExpenses,
    register: renderRegister,
    customers: renderCustomers,
    notifications: renderNotifications,
    "notification-inbox": renderNotificationInbox,
    settings: renderSettings,
    users: renderUsers,
    subscriptions: renderSubscriptions,
    hierarchy: renderHierarchy,
    tables: renderTables,
    kds: renderKDS,
    "raw-stock": renderRawStock,
    "waste-management": renderWasteManagement,
    recipes: renderRecipes,
    "pending-dues": () => renderSalesHistory(true),
    analytics: renderAnalytics,
    logs: renderLogs,
  };
  if (pages[page]) {
    try {
      const res = pages[page]();
      if (res instanceof Promise) {
        res.catch(err => {
          console.error("Page load error:", err);
          content.innerHTML = `<div class="flex items-center justify-center h-40 text-red-500 font-bold">Error loading page: ${err.message}</div>`;
        });
      }
    } catch (err) {
      console.error("Page load sync error:", err);
      content.innerHTML = `<div class="flex items-center justify-center h-40 text-red-500 font-bold">Error loading page: ${err.message}</div>`;
    }
  }

  // Highlight active menu for sub-filters
  if (page === "products-low-stock") {
    $c("page-title").textContent = "Low Stock Products";
    const navProducts = document.getElementById("nav-products");
    if (navProducts) navProducts.classList.add("active");
  } else if (page === "sales-pending") {
    $c("page-title").textContent = "Pending Dues";
    const navSales = document.getElementById("nav-sales-history");
    if (navSales) navSales.classList.add("active");
  }

  return false;
}

window.addEventListener('popstate', event => {
  if (!currentUser || isPlatformOwner()) return;
  _handlingAppPopState = true;
  try {
    closeUserDropdown();
    if (!$c('modal')?.classList.contains('hidden')) closeModal();
    const state = event.state;
    if (state?.rmsView === 'page' && state.page) {
      navigate(state.page, { history: false });
    } else {
      sessionStorage.removeItem('lobby_selected');
      renderLobby();
    }
  } finally {
    _handlingAppPopState = false;
  }
});

async function logout() {
  if (currentShift) {
    if (confirm("You have an active register shift open. It is recommended to close your shift and reconcile cash before logging out. Would you like to manage your shift now?")) {
      return openShiftManagement();
    }
    if (!confirm("Are you sure you want to logout WITHOUT closing your register? Your drawer totals will remain pending.")) {
      return;
    }
  }
  await fetch("/api/auth/logout", { method: "POST" });
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace("/");
}

async function fetchCategories() {
  const canReadProductCategories = [
    'products.view', 'orders.create'
  ].some(permission => currentUserHasPermission(permission));
  const canReadExpenseCategories = currentUserHasPermission('expenses.view');

  const [productResult, expenseResult] = await Promise.allSettled([
    canReadProductCategories ? api('/api/product-categories') : Promise.resolve([]),
    canReadExpenseCategories ? api('/api/expense-categories') : Promise.resolve([]),
  ]);
  _productCategories = productResult.status === 'fulfilled' && Array.isArray(productResult.value)
    ? productResult.value : [];
  _expenseCategories = expenseResult.status === 'fulfilled' && Array.isArray(expenseResult.value)
    ? expenseResult.value : [];
}

let _activeSettingsTab = localStorage.getItem("active_settings_tab") || "profile";
let _thirdPartyReportMonth = new Date().toISOString().slice(0, 7);
let _thirdPartyReportPersonId = "";

const PLATFORM_OWNER_HIDDEN_SETTINGS_TABS = new Set(["receipt", "printer-routing", "third-parties"]);

function getSettingsNavItems() {
  const items = [
    { id: 'profile', label: 'Account Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'category-order', label: 'POS Category Order', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: 'receipt', label: 'Receipt Settings', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'printer-routing', label: 'Printers & Routing', icon: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z' }
  ];

  if (!isPlatformOwner()) return items;
  return items.filter((item) => !PLATFORM_OWNER_HIDDEN_SETTINGS_TABS.has(item.id));
}

async function renderSettings(tab) {
  if (tab) {
    _activeSettingsTab = tab;
    localStorage.setItem("active_settings_tab", tab);
  }

  const navItems = getSettingsNavItems();
  if (!navItems.some((item) => item.id === _activeSettingsTab)) {
    _activeSettingsTab = navItems[0]?.id || "profile";
    localStorage.setItem("active_settings_tab", _activeSettingsTab);
  }

  // Fetch receipt settings if on receipt tab
  if (_activeSettingsTab === "receipt") {
    await fetchReceiptSettings();
  }
  if (_activeSettingsTab === "category-order") await fetchCategories();

  // Populate the Sidebar/Drawer content
  const navHtml = navItems.map(item => `
    <button onclick="renderSettings('${item.id}'); if(!document.getElementById('settings-nav-drawer').classList.contains('-translate-x-full')) toggleSettingsNav();" class="w-full flex items-center justify-between px-6 py-5 rounded-2xl text-sm font-black transition-all group ${_activeSettingsTab === item.id
      ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30"
      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
    }">
      <div class="flex items-center gap-4">
        <svg class="w-6 h-6 ${_activeSettingsTab === item.id ? "text-white" : "text-slate-400 group-hover:text-indigo-500"}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/></svg>
        ${item.label}
      </div>
      ${_activeSettingsTab === item.id ? '<div class="w-2 h-2 rounded-full bg-white animate-pulse"></div>' : ""}
    </button>
  `).join('');

  const drawerContent = document.getElementById("settings-nav-content");
  if (drawerContent) {
    drawerContent.innerHTML = `
      <div class="px-2 pb-6">
        <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-4">System Control</h4>
        <div class="space-y-2">
          ${navHtml}
        </div>
        <div class="mt-10 pt-10 border-t border-slate-100 dark:border-slate-800 px-4">
          <button onclick="logout()" class="flex items-center gap-3 text-rose-500 hover:text-rose-600 font-black text-xs uppercase tracking-widest transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Sign Out
          </button>
        </div>
      </div>
    `;
  }

  const activeLabel = navItems.find(i => i.id === _activeSettingsTab)?.label || "Settings";

  const contentHtml = `
    <div class="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <!-- Settings Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div class="flex items-center gap-6">
          <button onclick="toggleSettingsNav()" class="group relative flex items-center justify-center w-16 h-16 rounded-[2rem] bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:border-indigo-500 transition-all shadow-xl shadow-slate-200/50 dark:shadow-none active:scale-95">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16"/></svg>
            <div class="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-white dark:border-slate-900"></div>
          </button>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
              <h3 class="text-4xl font-black text-slate-950 dark:text-white tracking-tighter uppercase">${activeLabel}</h3>
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400 font-medium italic">Configure and personalize your RMS experience</p>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
            <div class="h-10 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden md:block"></div>
            <button onclick="navigate('dashboard')" class="px-6 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                Dashboard
            </button>
        </div>
      </div>

      <!-- Full Screen Settings Content -->
      <div class="w-full">
        ${await renderActiveSettingsContent()}
      </div>
    </div>
  `;

  document.getElementById("page-content").innerHTML = contentHtml;
}


async function renderActiveSettingsContent() {
  if (_activeSettingsTab === "profile") {
    return `
      <div class="w-full animate-in fade-in slide-in-from-right-4 duration-500">

        <header class="mb-12">
            <h3 class="text-3xl font-black text-slate-950 dark:text-white mb-2 tracking-tight">Account Profile</h3>
            <p class="text-slate-500 dark:text-slate-400 text-sm italic">Manage your identification and store assignment here.</p>
        </header>
        
        <div class="flex flex-col md:flex-row items-center gap-10 p-10 bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 mb-10 shadow-inner">
          <div class="relative">
              <div class="w-32 h-32 rounded-[2.5rem] bg-indigo-600 flex items-center justify-center text-white text-5xl font-black shadow-2xl relative z-10">
                ${(currentUser.name || "A")[0]}
              </div>
              <div class="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-indigo-600 shadow-lg z-20 border border-slate-100 dark:border-slate-700">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </div>
          </div>
          <div class="text-center md:text-left">
            <h4 class="text-3xl font-black text-slate-950 dark:text-white leading-tight mb-2 tracking-tight">${currentUser.name
      }</h4>
            <div class="flex flex-wrap items-center justify-center md:justify-start gap-3">
               <span class="px-4 py-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.15em] shadow-lg shadow-indigo-600/30">
                 ${currentUser.role}
               </span>
               <span class="px-4 py-1.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black tracking-widest lowercase border border-slate-300 dark:border-slate-700">
                 @${currentUser.username}
               </span>
            </div>
          </div>
        </div>

        ${renderSubscriptionQuotaCard()}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div class="space-y-3">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Shop Assignment</label>
            <div class="w-full px-6 py-5 rounded-[1.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-bold shadow-sm group hover:border-indigo-500 transition-colors">
              <div class="text-xs text-slate-400 font-normal mb-1">Company / Branch</div>
              ${currentUser.shop_name}
            </div>
          </div>
          <div class="space-y-3">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Access Credentials</label>
            <div class="w-full px-6 py-5 rounded-[1.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 font-black shadow-sm flex items-center justify-between group hover:border-emerald-500 transition-colors">
              <div>
                <div class="text-xs text-slate-400 font-normal mb-1">Status</div>
                VERIFIED ACTIVE
              </div>
              <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
            </div>
          </div>

          <div class="space-y-3 sm:col-span-2">
             <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Shop Metadata</label>
             <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
               <div class="px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                 <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">Business Type</div>
                 <div class="text-sm font-black text-slate-700 dark:text-slate-200 uppercase">Restaurant</div>
               </div>
               <div class="px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                 <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">Status</div>
                 <div class="text-sm font-black ${currentUser.shop_status === 'active' ? 'text-emerald-500' : 'text-rose-500'} uppercase">${currentUser.shop_status || 'Active'}</div>
               </div>
               <div class="px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                 <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">Contact Phone</div>
                 <div class="text-sm font-black text-slate-700 dark:text-slate-200">${currentUser.shop_phone || 'Not set'}</div>
               </div>
               <div class="px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                 <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">Member Since</div>
                 <div class="text-sm font-black text-slate-700 dark:text-slate-200">${currentUser.shop_created_at ? new Date(currentUser.shop_created_at).toLocaleDateString() : 'N/A'}</div>
               </div>
             </div>
             ${currentUser.shop_address ? `
             <div class="w-full px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mt-4">
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">Business Address</div>
                <div class="text-sm font-medium text-slate-700 dark:text-slate-200">${currentUser.shop_address}</div>
             </div>
             ` : ''}
          </div>

          <div class="space-y-3 sm:col-span-2">
             <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Internal Reference</label>
             <div class="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 text-slate-400 font-mono text-xs cursor-default flex items-center justify-between">
               <div>
                  <span class="text-slate-300 font-normal mr-2">UID:</span>${currentUser.id}
                  <span class="mx-4 text-slate-800 opacity-10">|</span>
                  <span class="text-slate-300 font-normal mr-2">SID:</span>${currentUser.shop_id || "GLOBAL"}
               </div>
               <span class="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg text-[9px] font-black uppercase text-slate-500 tracking-tighter">Read Only</span>
             </div>
          </div>
        </div>
      </div>
    `;
  }

  // Receipt Settings Tab
  if (_activeSettingsTab === "receipt") {
    return await renderReceiptSettings();
  }

  if (_activeSettingsTab === "category-order") return renderPosCategoryOrderSettings();

  // Printer Routing Tab
  if (_activeSettingsTab === "printer-routing") {
    return await renderPrinterRouting();
  }


  return "";
}

function renderPosCategoryOrderSettings() {
  return `
    <section class="mx-3 animate-in fade-in slide-in-from-right-4 duration-500">
      <header class="mb-6">
        <h3 class="text-3xl font-black tracking-tight text-slate-950 dark:text-white">POS Category Order</h3>
        <p class="mt-2 text-sm font-medium text-slate-500">Drag categories into the order staff should see while making an order. Changes save automatically.</p>
      </header>
      <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-3 flex items-center justify-between px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>Category</span><span id="category-order-status" role="status" aria-live="polite">Saved order</span>
        </div>
        <div id="pos-category-order-list" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" ondragover="dragOverPosCategory(event)" ondrop="dropPosCategory(event)">
          ${(_productCategories || []).map((category, index) => `
            <div class="pos-category-order-item flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition dark:border-slate-700 dark:bg-slate-950" draggable="true" data-category-id="${category.id}" ondragstart="startPosCategoryDrag(event)" ondragend="endPosCategoryDrag(event)">
              <button type="button" class="cursor-grab touch-none rounded-xl p-2 text-slate-400 active:cursor-grabbing" title="Drag to reorder" aria-label="Drag ${escapeOrderValue(category.name)} to reorder">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="7" r="1.5"/><circle cx="16" cy="7" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/></svg>
              </button>
              <span class="min-w-0 flex-1 truncate font-black text-slate-800 dark:text-slate-100" title="${escapeOrderValue(category.name)}">${escapeOrderValue(category.name)}</span>
              <div class="flex gap-1">
                <button type="button" onclick="movePosCategory(${category.id}, -1)" ${index === 0 ? 'disabled' : ''} class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black disabled:opacity-30 dark:border-slate-700" aria-label="Move ${escapeOrderValue(category.name)} up">&#8593;</button>
                <button type="button" onclick="movePosCategory(${category.id}, 1)" ${index === _productCategories.length - 1 ? 'disabled' : ''} class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black disabled:opacity-30 dark:border-slate-700" aria-label="Move ${escapeOrderValue(category.name)} down">&#8595;</button>
              </div>
            </div>`).join('') || '<p class="p-8 text-center text-sm font-bold text-slate-400">No product categories available.</p>'}
        </div>
      </div>
    </section>`;
}

let _draggedPosCategory = null;
function startPosCategoryDrag(event) {
  _draggedPosCategory = event.currentTarget;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', event.currentTarget.dataset.categoryId);
  event.currentTarget.classList.add('opacity-50');
}

function dragOverPosCategory(event) {
  event.preventDefault();
  if (!_draggedPosCategory) return;
  const target = event.target.closest('.pos-category-order-item');
  if (!target || target === _draggedPosCategory) return;
  const rect = target.getBoundingClientRect();
  const pointerIsOnSameRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
  const before = pointerIsOnSameRow ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
  target.parentNode.insertBefore(_draggedPosCategory, before ? target : target.nextSibling);
}

function endPosCategoryDrag(event) {
  event.currentTarget.classList.remove('opacity-50');
}

async function dropPosCategory(event) {
  event.preventDefault();
  _draggedPosCategory?.classList.remove('opacity-50');
  _draggedPosCategory = null;
  await savePosCategoryOrder();
}

function movePosCategory(categoryId, direction) {
  const index = _productCategories.findIndex(category => Number(category.id) === Number(categoryId));
  const nextIndex = index + Number(direction);
  if (index < 0 || nextIndex < 0 || nextIndex >= _productCategories.length) return;
  [_productCategories[index], _productCategories[nextIndex]] = [_productCategories[nextIndex], _productCategories[index]];
  document.getElementById('page-content').querySelector('section').outerHTML = renderPosCategoryOrderSettings();
  savePosCategoryOrder();
}

async function savePosCategoryOrder() {
  const list = document.getElementById('pos-category-order-list');
  const orderedIds = [...(list?.querySelectorAll('.pos-category-order-item') || [])].map(item => Number(item.dataset.categoryId));
  if (!orderedIds.length) return;
  const status = document.getElementById('category-order-status');
  if (status) status.textContent = 'Saving...';
  try {
    await api(`/api/product-categories/${orderedIds[0]}`, 'PATCH', { ordered_ids: orderedIds });
    const byId = new Map(_productCategories.map(category => [Number(category.id), category]));
    _productCategories = orderedIds.map(id => byId.get(id)).filter(Boolean);
    if (status) status.textContent = 'Saved';
  } catch (error) {
    if (status) status.textContent = 'Could not save';
    await fetchCategories();
    renderSettings('category-order');
  }
}

function toggleAddCategoryMenu() {
  const el = document.getElementById("add-category-menu");
  if (el) el.classList.toggle("hidden");
}

function toggleLobbyCategoryMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("lobby-category-menu");
  if (!menu) return;
  menu.classList.toggle("hidden");

  // Close menu when clicking outside
  if (!menu.classList.contains("hidden")) {
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.add("hidden");
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 10);
  }
}

async function ensurePrinterRouteChoicesLoaded() {
  const [printers, users] = await Promise.all([
    api('/api/printers').catch(() => []),
    api('/api/users').catch(() => [])
  ]);
  _allPrinters = Array.isArray(printers) ? printers : [];
  _printerRoutingKitchens = Array.isArray(users) ? users.filter(u => u.role === 'kitchen') : [];
}

function getPrinterRouteLabel(route) {
  if (!route) return "No Printer";

  if (typeof route === "string" && route.startsWith("KITCHEN:")) {
    const kitchenId = Number(route.replace("KITCHEN:", ""));
    const kitchen = _printerRoutingKitchens.find(k => Number(k.id) === kitchenId);
    if (!kitchen) return "Kitchen route";
    const printer = getPrinterByRoute(kitchen.printer_station);
    return `Kitchen: ${kitchen.name || kitchen.username}${printer ? ` (${printer.display_name})` : " (No printer assigned)"}`;
  }

  const printer = getPrinterByRoute(route);
  return printer ? `${printer.display_name} (${printer.system_name})` : route;
}

function getPrinterRouteValue(printer) {
  return `PRINTER:${printer.id}`;
}

function getPrinterByRoute(route) {
  if (!route) return null;
  if (typeof route === "string" && route.startsWith("PRINTER:")) {
    const printerId = Number(route.replace("PRINTER:", ""));
    return _allPrinters.find(p => Number(p.id) === printerId) || null;
  }
  return getFirstPrinterBySystemName(route);
}

function getFirstPrinterBySystemName(systemName) {
  return _allPrinters
    .filter(p => p.system_name === systemName)
    .sort((a, b) => Number(a.id) - Number(b.id))[0] || null;
}

function printerRouteMatches(route, printer) {
  if (!route || !printer) return false;
  if (route === getPrinterRouteValue(printer)) return true;
  if (route !== printer.system_name) return false;

  const firstPrinterForSystemName = getFirstPrinterBySystemName(route);
  return Number(firstPrinterForSystemName?.id) === Number(printer.id);
}

function renderPrinterRouteOptions(selectedRoute = "") {
  const selected = selectedRoute || "";
  const kitchenOptions = _printerRoutingKitchens.map(kitchen => {
    const value = `KITCHEN:${kitchen.id}`;
    const printer = getPrinterByRoute(kitchen.printer_station);
    const suffix = printer ? ` - ${printer.display_name}` : " - no printer assigned";
    return `<option value="${value}" ${selected === value ? "selected" : ""}>Kitchen: ${kitchen.name || kitchen.username}${suffix}</option>`;
  }).join("");
  const printerOptions = _allPrinters.map(printer => {
    const value = getPrinterRouteValue(printer);
    return `<option value="${value}" ${printerRouteMatches(selected, printer) ? "selected" : ""}>Printer: ${printer.display_name} (${printer.system_name})</option>`;
  }).join("");

  return `
    <option value="" ${!selected ? "selected" : ""}>No Printer</option>
    ${kitchenOptions ? `<optgroup label="Kitchen Terminals">${kitchenOptions}</optgroup>` : ""}
    ${printerOptions ? `<optgroup label="Direct Printers">${printerOptions}</optgroup>` : ""}
  `;
}

function getCategoryRouteTargetsForPage(category) {
  if (Array.isArray(category?.route_targets)) return category.route_targets;
  try {
    const parsed = JSON.parse(category?.route_targets || '[]');
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return category?.printer_station ? [category.printer_station] : [];
}

async function renderProductCategoriesPage() {
  const [categories] = await Promise.all([
    api('/api/product-categories'),
    ensurePrinterRouteChoicesLoaded()
  ]);
  _productCategories = Array.isArray(categories) ? categories : [];
  const totalLinked = _productCategories.reduce((sum, category) => sum + Number(category.product_count || 0), 0);
  $c('page-content').innerHTML = `
    <div class="space-y-6 animate-in fade-in duration-300">
      <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p class="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Menu setup</p><h2 class="mt-1 text-2xl font-black text-slate-950 dark:text-white">Product Categories</h2><p class="mt-1 text-sm font-medium text-slate-500">Create categories, manage routing, and see how many products use each category.</p></div>
          <div class="flex gap-3"><div class="rounded-2xl bg-slate-50 px-5 py-3 dark:bg-slate-950"><p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Categories</p><p class="text-xl font-black">${_productCategories.length}</p></div><div class="rounded-2xl bg-indigo-50 px-5 py-3 dark:bg-indigo-950/30"><p class="text-[10px] font-black uppercase tracking-widest text-indigo-400">Linked products</p><p class="text-xl font-black text-indigo-700 dark:text-indigo-300">${totalLinked}</p></div></div>
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div><label class="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">New category name</label><input id="category-page-name" onkeydown="if(event.key==='Enter') createProductCategoryFromPage()" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 font-bold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950" placeholder="e.g. Main Course"></div>
          <button onclick="createProductCategoryFromPage()" class="rounded-2xl bg-indigo-600 px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500">Add Category</button>
        </div>
        <details class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
          <summary class="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-500">Optional kitchen and printer routes</summary>
          <div class="mt-4 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            ${_allPrinters.map(printer => `<label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"><input type="checkbox" class="category-page-route h-4 w-4" value="PRINTER:${printer.id}"><span class="text-xs font-bold">Printer: ${escapeOrderValue(printer.display_name)}</span></label>`).join('')}
            ${_printerRoutingKitchens.map(kitchen => `<label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"><input type="checkbox" class="category-page-route h-4 w-4" value="KITCHEN:${kitchen.id}"><span class="text-xs font-bold">Kitchen: ${escapeOrderValue(kitchen.name || kitchen.username)}</span></label>`).join('')}
          </div>
        </details>
      </section>

      <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div class="relative w-full max-w-md"><input id="category-page-search" oninput="filterProductCategoryRows()" class="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950" placeholder="Search categories..."><span class="absolute left-4 top-3 text-slate-400">&#128269;</span></div><button id="category-delete-selected" onclick="deleteSelectedProductCategories()" class="hidden rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-600 dark:bg-rose-950/30">Delete selected</button></div>
        <div class="overflow-x-auto"><table class="w-full min-w-[720px] text-left"><thead class="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-950"><tr><th class="w-14 px-5 py-4"><input id="category-select-all" type="checkbox" onchange="toggleAllProductCategories(this.checked)" class="h-4 w-4 rounded"></th><th class="px-5 py-4">Category</th><th class="px-5 py-4">Linked products</th><th class="px-5 py-4">Print route</th><th class="px-5 py-4 text-right">Actions</th></tr></thead><tbody id="category-page-rows"></tbody></table></div>
        <div id="category-page-empty" class="hidden p-12 text-center text-sm font-bold text-slate-400">No matching categories found.</div>
      </section>
    </div>`;
  renderProductCategoryRows(_productCategories);
}

function renderProductCategoryRows(categories) {
  const body = $c('category-page-rows');
  if (!body) return;
  body.innerHTML = categories.map(category => {
    const routes = getCategoryRouteTargetsForPage(category);
    return `<tr class="category-page-row border-b border-slate-100 last:border-0 dark:border-slate-800" data-name="${escapeOrderValue(String(category.name || '').toLowerCase())}"><td class="px-5 py-4"><input type="checkbox" class="category-row-check h-4 w-4 rounded" value="${category.id}" onchange="updateCategorySelectionState()"></td><td class="px-5 py-4"><p class="font-black text-slate-900 dark:text-white">${escapeOrderValue(category.name)}</p></td><td class="px-5 py-4"><span class="inline-flex min-w-10 justify-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">${Number(category.product_count || 0)}</span></td><td class="px-5 py-4 text-xs font-bold text-slate-500">${routes.length ? routes.map(getPrinterRouteLabel).map(escapeOrderValue).join(', ') : 'No route assigned'}</td><td class="px-5 py-4"><div class="flex justify-end gap-2"><button onclick="editCategoryName('product', ${category.id})" class="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-600 dark:bg-indigo-950/30">Edit</button><button onclick="deleteCategoryFromPopup('product', ${category.id}, '${String(category.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" title="Delete category and unlink its products" class="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 dark:bg-rose-950/30">Delete</button></div></td></tr>`;
  }).join('');
  $c('category-page-empty')?.classList.toggle('hidden', categories.length > 0);
}

function filterProductCategoryRows() {
  const query = ($c('category-page-search')?.value || '').trim().toLowerCase();
  renderProductCategoryRows(_productCategories.filter(category => String(category.name || '').toLowerCase().includes(query)));
  updateCategorySelectionState();
}

function toggleAllProductCategories(checked) {
  document.querySelectorAll('.category-row-check').forEach(input => { input.checked = checked; });
  updateCategorySelectionState();
}

function updateCategorySelectionState() {
  const count = document.querySelectorAll('.category-row-check:checked').length;
  const button = $c('category-delete-selected');
  if (button) { button.classList.toggle('hidden', count === 0); button.textContent = `Delete selected (${count})`; }
}

async function createProductCategoryFromPage() {
  const input = $c('category-page-name');
  const name = input?.value.trim();
  if (!name) return toast('Category name is required', 'error');
  const routeTargets = [...document.querySelectorAll('.category-page-route:checked')].map(item => item.value);
  try {
    await api('/api/product-categories', 'POST', { name, route_targets: routeTargets });
    toast('Category added successfully', 'success');
    await fetchCategories();
    await renderProductCategoriesPage();
  } catch (_) {}
}

async function deleteSelectedProductCategories() {
  const ids = [...document.querySelectorAll('.category-row-check:checked')].map(input => Number(input.value));
  if (!ids.length || !confirm(`Delete ${ids.length} selected categories? Linked products will be left uncategorized.`)) return;
  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try { await api(`/api/product-categories/${id}`, 'DELETE'); deleted += 1; } catch (_) { failed += 1; }
  }
  if (deleted) toast(`${deleted} categories deleted`, 'success');
  if (failed) toast(`${failed} categories could not be deleted`, 'error');
  await fetchCategories();
  await renderProductCategoriesPage();
}

async function openAddCategoryPopup(type) {
  if (type === 'product') {
    navigate('product-categories');
    return;
  }
  // Hide both potential menus
  const menu1 = document.getElementById("add-category-menu");
  const menu2 = document.getElementById("lobby-category-menu");
  if (menu1) menu1.classList.add("hidden");
  if (menu2) menu2.classList.add("hidden");

  const isProduct = type === 'product';
  const title = isProduct ? 'Add Product Category' : 'Add Expense Category';
  if (isProduct) await ensurePrinterRouteChoicesLoaded();
  
  const emojiHtml = !isProduct ? `
    <div>
      <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Emoji</label>
      <input id="pop-cat-emoji" value="📦" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl text-xl text-center outline-none focus:border-indigo-500 transition-all font-bold" />
    </div>` : '';

  const extraHtml = isProduct ? `
    <div>
      <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Print & Kitchen Routes</label>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
        ${_allPrinters.map(printer => `<label class="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 cursor-pointer"><input type="checkbox" class="pop-cat-route h-4 w-4 rounded" value="PRINTER:${printer.id}"><span class="text-xs font-bold">Printer: ${escapeOrderValue(printer.display_name)}</span></label>`).join('')}
        ${_printerRoutingKitchens.map(kitchen => `<label class="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 cursor-pointer"><input type="checkbox" class="pop-cat-route h-4 w-4 rounded" value="KITCHEN:${kitchen.id}"><span class="text-xs font-bold">Kitchen: ${escapeOrderValue(kitchen.name || kitchen.username)}</span></label>`).join('')}
      </div>
      <p class="text-[9px] text-slate-400 mt-1 px-1 italic">Select any combination of printers and kitchen terminals.</p>
    </div>` : emojiHtml;

  openModal(
    title,
    `
    <div class="space-y-6">
      <div class="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
        <p class="text-[10px] font-black text-indigo-800 dark:text-indigo-200 uppercase tracking-[0.2em] mb-1">New Category</p>
        <p class="text-xs text-indigo-700/70 dark:text-indigo-400/70 italic">Organize your ${isProduct ? 'products' : 'expenses'} more effectively.</p>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Category Label</label>
          <input id="pop-cat-name" onkeydown="if(event.key==='Enter') submitPopCategory('${type}')" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-indigo-500 transition-all outline-none font-bold text-lg" placeholder="e.g. ${isProduct ? 'Beverages' : 'Rent'}" />
        </div>
        ${extraHtml}
        <button onclick="submitPopCategory('${type}')" class="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Save Category
        </button>
      </div>

      <div id="pop-cat-list-wrap" class="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
         <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-1">Manage Existing Categories</p>
         <div id="pop-cat-list" class="space-y-2 max-h-[250px] overflow-y-auto pr-2">
            <!-- List injected here -->
         </div>
      </div>
    </div>
    `
  );
  updateCategoryListInPopup(type);
  setTimeout(() => {
    const input = document.getElementById("pop-cat-name");
    if (input) input.focus();
  }, 50);
}

async function submitPopCategory(type) {
  const name = document.getElementById("pop-cat-name").value.trim();
  if (!name) return toast("Name required", "error");

  const payload = { name };
  if (type === "expense") {
    payload.emoji = document.getElementById("pop-cat-emoji")?.value || "📦";
  } else if (type === "product") {
    payload.route_targets = [...document.querySelectorAll('.pop-cat-route:checked')].map(input => input.value);
  }

  const url = type === "product" ? "/api/product-categories" : "/api/expense-categories";
  const r = await api(url, "POST", payload);
  if (r.error) return toast(r.error, "error");

  const input = document.getElementById("pop-cat-name");
  if (input) {
    input.value = "";
    input.focus();
  }

  toast("Category added successfully!");
  await fetchCategories();
  updateCategoryListInPopup(type);
  if (_currentPage === 'dashboard') renderDashboard();
}

function updateCategoryListInPopup(type) {
  const container = document.getElementById("pop-cat-list");
  if (!container) return;

  const categories = type === "product" ? _productCategories : _expenseCategories;

  if (categories.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 italic text-center py-4">No categories added yet.</div>`;
    return;
  }

  container.innerHTML = categories.map(c => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 transition-all hover:border-indigo-300 dark:hover:border-indigo-700 group">
      <div class="flex items-center gap-3">
        ${type === 'expense' && c.emoji ? `<span class="text-lg">${c.emoji}</span>` : `<div class="w-2 h-2 rounded-full bg-indigo-500"></div>`}
        <div>
          <span class="text-sm font-bold text-slate-800 dark:text-slate-200">${escapeOrderValue(c.name)}</span>
          ${type === 'product' ? `<div class="text-[9px] font-black text-indigo-500/60 uppercase tracking-tighter">${getPrinterRouteLabel(c.printer_station)}</div>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="editCategoryName('${type}', ${c.id})" class="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all" title="Edit category name" aria-label="Edit category name">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L12 13l-4 1 1-4 6.5-6.5z"/></svg>
        </button>
        <button onclick="deleteCategoryFromPopup('${type}', ${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all" title="Delete category" aria-label="Delete category">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

async function updateCategoryPrinter(id, current) {
  const newVal = prompt("Enter printer route value:", current);
  if (newVal === null) return;
  
  try {
    const r = await api(`/api/product-categories/${id}`, "PATCH", { printer_station: newVal.trim() || null });
    if (r.error) return toast(r.error, "error");
    toast("Station updated!");
    await fetchCategories();
    updateCategoryListInPopup('product');
  } catch (e) {
    toast("Update failed", "error");
  }
}

async function deleteCategoryFromPopup(type, id, name) {
  const unlinkNotice = type === 'product' ? ' Linked products will be left uncategorized.' : '';
  if (!confirm(`Are you sure you want to delete the "${name}" category?${unlinkNotice}`)) return;

  const url = type === 'product' ? `/api/product-categories/${id}` : `/api/expense-categories/${id}`;

  try {
    const r = await api(url, 'DELETE');
    if (r.error) return toast(r.error, 'error');

    const unlinked = Number(r.unlinked_products || 0);
    toast(unlinked ? `Category deleted and ${unlinked} product${unlinked === 1 ? '' : 's'} unlinked.` : 'Category deleted successfully!');
    await fetchCategories();
    if (type === 'product' && _currentPage === 'product-categories') await renderProductCategoriesPage();
    else updateCategoryListInPopup(type);
    if (_currentPage === 'dashboard') renderDashboard();
  } catch (e) {
    toast('Failed to delete category', 'error');
  }
}

async function addCategory(type) {
  const name = $c("new-cat-name").value.trim();
  const emoji = type === "expense" ? $c("new-cat-emoji").value.trim() : null;

  if (!name) return toast("Name label required", "error");

  const endpoint =
    type === "product" ? "/api/product-categories" : "/api/expense-categories";
  const payload = type === "product" ? { name } : { name, emoji };

  try {
    const r = await api(endpoint, "POST", payload);
    if (r.error) return toast(r.error, "error");

    toast("Architecture updated!");
    await fetchCategories();
    renderSettings();
  } catch (e) {
    toast("Network error while adding category", "error");
  }
}

async function deleteCategory(type, id) {
  if (
    !confirm(
      "Confirm permanent deletion of this category? It must be completely unused across all ledger entries.",
    )
  )
    return;

  const endpoint =
    type === "product"
      ? "/api/product-categories/" + id
      : "/api/expense-categories/" + id;

  try {
    const r = await api(endpoint, "DELETE");
    if (r.error) {
      if (r.error.includes("in use"))
        return toast(
          "Access denied: node is currently in use by active entries.",
          "error",
        );
      return toast(r.error, "error");
    }

    toast("Node decommissioned successfully.");
    await fetchCategories();
    renderSettings();
  } catch (e) {
    toast("Network error during decommission.", "error");
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────
// ─── Dashboard state ──────────────────────────────────────────────────────────
let _dashPeriod = "today";
let _dashBrandId = "";
let _dashFrom = "";
let _dashTo = "";

function getDashboardLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setDefaultDashboardCustomDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  _dashFrom = getDashboardLocalDateStr(start);
  _dashTo = getDashboardLocalDateStr(end);
}

function handleDashboardPeriodChange() {
  const periodEl = document.getElementById("dash-period-filter");
  const period = periodEl?.value || "today";
  if (period === "custom") {
    if (!_dashFrom || !_dashTo) setDefaultDashboardCustomDates();
    renderDashboard("custom", document.getElementById("dash-brand-filter")?.value, _dashFrom, _dashTo);
    return;
  }

  _dashFrom = "";
  _dashTo = "";
  renderDashboard(period, document.getElementById("dash-brand-filter")?.value, "", "");
}

function applyDashboardCustomDates() {
  const fromVal = document.getElementById("dash-from-filter")?.value || "";
  const toVal = document.getElementById("dash-to-filter")?.value || "";
  if (!fromVal || !toVal) return;

  _dashPeriod = "custom";
  renderDashboard("custom", document.getElementById("dash-brand-filter")?.value, fromVal, toVal);
}

function renderSubscriptionQuotaCard() {
  if (!currentUser || currentUser.role === "superadmin") return "";

  const subscription = currentUser.subscription;
  const tone = getSubscriptionQuotaTone(subscription);
  const label = getSubscriptionQuotaLabel(subscription);
  const timelineLabel = getSubscriptionTimelineLabel(subscription);
  const plan = subscription?.type_label || "No Plan";
  const percent = subscription?.is_lifetime
    ? 100
    : Math.max(0, Math.min(100, Number(subscription?.remaining_percent || 0)));
  const validity = subscription
    ? subscription.is_lifetime
      ? "No expiry date"
      : `Valid until ${formatSubscriptionDate(subscription.end_date)}`
    : "Contact administrator to renew access";

  return `
    <div class="mb-6 p-4 rounded-2xl border ${tone.card}">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Subscription Timeline</div>
          <div class="mt-1 text-xl font-black text-slate-900 dark:text-white">${escapeOrderValue(label)}</div>
          <div class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">${escapeOrderValue(plan)} · ${escapeOrderValue(timelineLabel)} · ${escapeOrderValue(validity)}</div>
        </div>
        <div class="w-full md:w-64">
          <div class="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            <span>Remaining</span>
            <span>${subscription?.is_lifetime ? "Unlimited" : `${percent}% left`}</span>
          </div>
          <div class="h-2 rounded-full bg-white/80 dark:bg-slate-950/60 overflow-hidden border border-white/80 dark:border-slate-800">
            <div class="h-full rounded-full ${tone.progress}" style="width: ${subscription?.is_lifetime ? 100 : percent}%"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderDashboard(period, brandId, from, to) {
  if (period !== undefined) _dashPeriod = period;
  if (brandId !== undefined) _dashBrandId = brandId;
  if (from !== undefined) _dashFrom = from;
  if (to !== undefined) _dashTo = to;

  // Build query string
  const qs = new URLSearchParams();
  if (_dashPeriod === "custom" && (_dashFrom || _dashTo)) {
    qs.set("period", "custom");
    if (_dashFrom) qs.set("from", _dashFrom);
    if (_dashTo) qs.set("to", _dashTo);
  } else if (_dashPeriod && _dashPeriod !== "all") {
    qs.set("period", _dashPeriod);
  }

  if (_dashBrandId && _dashBrandId !== "") qs.set("brand_id", _dashBrandId);
  const url = "/api/analytics" + (qs.toString() ? "?" + qs.toString() : "");

  const data = await api(url);
  if (data.isGlobal) return renderGlobalDashboard(data);

  const brands = data.brands || [];
  if (_dashBrandId && !data.selectedBrandId) _dashBrandId = "";

  const PERIOD_OPTS = [
    { val: "today", label: "Today" },
    { val: "all", label: "All Time" },
    { val: "1m", label: "Last 1 Month" },
    { val: "2m", label: "Last 2 Months" },
    { val: "6m", label: "Last 6 Months" },
    { val: "1y", label: "Last Year" },
    { val: "custom", label: "Custom Range" },
  ];

  const periodSelect = `
    <select id="dash-period-filter" onchange="handleDashboardPeriodChange()"
      class="bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none cursor-pointer">
      ${PERIOD_OPTS.map((o) => `<option value="${o.val}" ${_dashPeriod === o.val ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>`;

  const customDateInputs = `
    <div id="dash-custom-dates" class="${_dashPeriod === "custom" ? "flex" : "hidden"} items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
      <input type="date" id="dash-from-filter" value="${_dashFrom || ""}" onchange="applyDashboardCustomDates()"
        class="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[120px] cursor-pointer">
      <span class="text-slate-400 text-xs">to</span>
      <input type="date" id="dash-to-filter" value="${_dashTo || ""}" onchange="applyDashboardCustomDates()"
        class="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[120px] cursor-pointer">
    </div>`;

  const brandSelect =
    brands.length > 0
      ? `
    <select id="dash-brand-filter" onchange="renderDashboard(undefined, this.value)"
      class="text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
      <option value="">All Partners</option>
      ${brands.map((b) => `<option value="${b.id}" ${String(_dashBrandId) === String(b.id) ? "selected" : ""}>${b.name} (${b.partner_type === "product_based" ? "Product" : "Share"})</option>`).join("")}
    </select>`
      : "";

  // Determine whether any filter is active for a subtle badge
  const isFiltered =
    _dashPeriod !== "all" ||
    (_dashBrandId !== "" && _dashBrandId !== null) ||
    (_dashPeriod === "custom" && (_dashFrom !== "" || _dashTo !== ""));
  const brandPerformance = Array.isArray(data.brandPerformance) ? data.brandPerformance : [];
  const partnerProfitShares = Array.isArray(data.partnerProfitShares) ? data.partnerProfitShares : [];
  const shopProfitValue = Number(data.shopProfit ?? data.partnerProfitPool ?? data.netProfit ?? 0);
  const selectedPartnerAudit = data.selectedPartnerAudit || null;
  const selectedPartnerType = selectedPartnerAudit?.partner_type === "product_based" ? "product_based" : "share_based";
  const selectedPartnerAuditHtml = selectedPartnerAudit
    ? `
      <div class="px-6 py-4 bg-teal-50/70 dark:bg-teal-950/20 border-b border-teal-100 dark:border-teal-900/40">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Selected Partner Audit</div>
            <div class="text-sm font-black text-slate-900 dark:text-white mt-0.5">${selectedPartnerAudit.brand_name}</div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
            <div>
              <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">Type</div>
              <div class="text-xs font-black text-slate-800 dark:text-slate-100">${selectedPartnerType === "product_based" ? "Product Based" : "Share Based"}</div>
            </div>
            <div>
              <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">${selectedPartnerType === "product_based" ? "Product Profit" : "Share Pool"}</div>
              <div class="text-xs font-black text-slate-800 dark:text-slate-100">Rs. ${Number(selectedPartnerAudit.profit_pool || 0).toLocaleString()}</div>
            </div>
            <div>
              <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">Partner Share</div>
              <div class="text-xs font-black ${Number(selectedPartnerAudit.profit_share || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}">Rs. ${Number(selectedPartnerAudit.profit_share || 0).toLocaleString()}</div>
            </div>
            <div>
              <div class="text-[9px] uppercase font-black tracking-widest text-slate-400">${selectedPartnerType === "product_based" ? "Product Orders" : "Business Orders"}</div>
              <div class="text-xs font-black text-slate-800 dark:text-slate-100">${Number(selectedPartnerType === "product_based" ? (selectedPartnerAudit.product_brand_orders || 0) : (selectedPartnerAudit.business_orders || 0)).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>`
    : "";
  const partnerSplitHtml = partnerProfitShares.length
    ? `
    <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden mb-8">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a5 5 0 00-10 0v2m-2 0h14l-1 11H6L5 9z"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Whole Business Partner Split</h3>
          ${statInfoIcon("Shop profit allocated across partners. Product-based partners use their assigned product profit; share-based partners split the remaining shop profit by percentage. Partner profits add up to shop profit.")}
        </div>
        <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Rs. ${Number(data.totalPartnerProfit ?? shopProfitValue).toLocaleString()} allocated</span>
      </div>
      ${selectedPartnerAuditHtml}
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
              <th class="px-6 py-3">Partner</th>
              <th class="px-6 py-3">Type</th>
              <th class="px-6 py-3 text-right">Ownership</th>
              <th class="px-6 py-3 text-right">Profit Basis</th>
              <th class="px-6 py-3 text-right">Partner Profit</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${partnerProfitShares.map((share) => {
              const type = share.partner_type === "product_based" ? "product_based" : "share_based";
              return `
              <tr class="${share.is_selected ? "bg-teal-50/60 dark:bg-teal-950/20" : ""}">
                <td class="px-6 py-3 text-sm font-black text-slate-800 dark:text-slate-100">
                  ${share.brand_name}
                  ${share.is_selected ? `<span class="ml-2 align-middle text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Selected</span>` : ""}
                </td>
                <td class="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">${type === "product_based" ? "Product Based" : "Share Based"}</td>
                <td class="px-6 py-3 text-right text-xs font-bold text-slate-600 dark:text-slate-300">${type === "product_based" ? "Products" : `${Number(share.ownership_percent || 0).toFixed(2).replace(/\.00$/, "")}%`}</td>
                <td class="px-6 py-3 text-right text-xs font-bold text-slate-600 dark:text-slate-300">Rs. ${Number(share.profit_pool || 0).toLocaleString()}</td>
                <td class="px-6 py-3 text-right text-xs font-black ${Number(share.profit_share || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}">Rs. ${Number(share.profit_share || 0).toLocaleString()}</td>
              </tr>
            `}).join("")}
          </tbody>
        </table>
      </div>
    </div>`
    : "";
  const brandProfitHtml = brandPerformance.length
    ? `
    <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden mb-8">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v-1m9-4a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Product Brand Sales & Cost</h3>
          ${statInfoIcon("Product-assignment breakdown by brand. Partner profit is calculated from shop profit in the partner split table.")}
        </div>
        <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">${data.selectedBrandName || "All Partners"}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
              <th class="px-6 py-3">Product Brand</th>
              <th class="px-6 py-3 text-right">Net Revenue</th>
              <th class="px-6 py-3 text-right">COGS</th>
              <th class="px-6 py-3 text-right">Gross Profit</th>
              <th class="px-6 py-3 text-right">Damage / Loss</th>
              <th class="px-6 py-3 text-right">After Loss</th>
              <th class="px-6 py-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${brandPerformance.map((brand) => {
              const grossProfit = Number(brand.grossProfit || 0);
              const afterLoss = Number(brand.netAfterDamage || 0);
              const grossTone = grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
              const afterLossTone = afterLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
              return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="px-6 py-3">
                    <div class="text-sm font-black text-slate-800 dark:text-slate-100">${brand.brand_name}</div>
                    <div class="text-[10px] text-slate-400 font-bold">${Number(brand.orders || 0).toLocaleString()} order${Number(brand.orders || 0) === 1 ? "" : "s"}</div>
                  </td>
                  <td class="px-6 py-3 text-right text-xs font-black text-blue-600 dark:text-blue-400">Rs. ${Number(brand.netRevenue || 0).toLocaleString()}</td>
                  <td class="px-6 py-3 text-right text-xs font-bold text-slate-600 dark:text-slate-300">Rs. ${Number(brand.netCogs || 0).toLocaleString()}</td>
                  <td class="px-6 py-3 text-right text-xs font-black ${grossTone}">Rs. ${grossProfit.toLocaleString()}</td>
                  <td class="px-6 py-3 text-right text-xs font-bold text-rose-600 dark:text-rose-400">Rs. ${Number(brand.damageLoss || 0).toLocaleString()}</td>
                  <td class="px-6 py-3 text-right text-xs font-black ${afterLossTone}">Rs. ${afterLoss.toLocaleString()}</td>
                  <td class="px-6 py-3 text-right text-xs font-black text-slate-900 dark:text-white">${Number(brand.profitMargin || 0).toFixed(1)}%</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`
    : "";

  $c("page-content").innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <h3 class="text-3xl font-black text-gray-800 dark:text-gray-100 tracking-tight">Main Dashboard</h3>
        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">Real-time overview of your store performance</p>
      </div>
    </div>
    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
        </svg>
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Dashboard View</span>
        ${isFiltered ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800">ACTIVE</span>' : ""}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        ${customDateInputs}
        <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Period:</span>
          ${periodSelect}
        </div>
        ${brandSelect
      ? `<div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Profit Partner</span>
          ${brandSelect}
        </div>`
      : ""
    }
        ${isFiltered ? `<button onclick="_dashFrom='';_dashTo='';renderDashboard('all', '')" class="text-xs font-semibold text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-rose-200 dark:hover:border-rose-800 transition-all flex items-center gap-1.5"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>Clear</button>` : ""}
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7 gap-5 mb-8">
      ${statCard("Total Revenue", "Rs. " + Number(data.totalRevenue).toLocaleString(), `${data.totalSales} transaction${data.totalSales !== 1 ? "s" : ""}`, "blue", "Completed orders only. Revenue = bill subtotal - discount + tax - refunds. Includes both received money and pending dues.")}
      ${statCard("Payments Received", "Rs. " + Number(data.totalPaymentsReceived || 0).toLocaleString(), `${(data.staffPerformance || []).length} receiver${(data.staffPerformance || []).length !== 1 ? "s" : ""}`, "emerald", "Money actually marked received, attributed to the staff member who confirmed it.")}
      ${statCard("Pending Dues", "Rs. " + Number(data.totalPendingDues || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), `${data.pendingDuesCount || 0} bill${Number(data.pendingDuesCount || 0) !== 1 ? "s" : ""} pending`, "amber", "Completed bills where final total minus amount received is still greater than zero. Shows only the unpaid balance.")}
      ${statCard("Cost of Goods Sold", "Rs. " + Number(data.totalCOGS).toLocaleString(), "Sum of buying prices", "purple", "Buying cost of sold items from completed orders, reduced by the buying cost of returned items.")}
      ${statCard("Shop Profit", "Rs. " + shopProfitValue.toLocaleString(), "Sum of partner shares", "emerald", "Shop Profit = revenue - COGS - damage/loss. This equals the sum of partner shares.")}
      ${statCard("Damage Value", "Rs. " + Number(data.damageTotal || 0).toLocaleString(), "Inventory & Returns", "rose", "Current product damage/loss value tracked in inventory. This is separate from normal sales COGS.")}
      ${statCard("Products", data.totalProducts, "in catalog", "amber", "Count of active catalog products for this shop, excluding deleted products.")}
    </div>

    ${(data.staffPerformance || []).length ? `
    <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden mb-8">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800"><h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Sales by Payment Receiver</h3></div>
      <div class="divide-y divide-slate-100 dark:divide-slate-800">
        ${(data.staffPerformance || []).map(row => `<div class="px-6 py-3 flex items-center justify-between gap-4"><div><div class="text-sm font-black text-slate-800 dark:text-white">${escapeOrderValue(row.name || row.username || 'Unknown')}</div><div class="text-[10px] font-bold text-slate-400">${Number(row.orders || 0)} received payment${Number(row.orders || 0) !== 1 ? 's' : ''}</div></div><div class="text-sm font-black text-emerald-600 dark:text-emerald-400">Rs. ${Number(row.received_sales || 0).toLocaleString()}</div></div>`).join('')}
      </div>
    </div>` : ''}

    ${partnerSplitHtml}
    ${brandProfitHtml}

    <!-- Tables -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Top Products -->
      <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Top Products by Sales</h3>
          ${statInfoIcon("Ranked by sold quantity after returns. Product revenue is allocated from bill subtotal - discount + tax, then product refunds are subtracted.")}
        </div>
        <div class="p-4">
          ${data.topProducts.length
      ? `
            <div class="space-y-1">
              ${data.topProducts
        .map(
          (p, i) => `
                <div class="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <span class="w-6 h-6 flex-shrink-0 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">${i + 1}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-gray-800 dark:text-gray-200 font-semibold truncate">${p.name}</div>
                    ${p.brand_name ? `<div class="text-[10px] text-gray-400 uppercase tracking-wider font-medium">${p.brand_name}</div>` : ""}
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-semibold">${p.qty_sold} sold</span>
                    <div class="text-right">
                      <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">Rs. ${Number(p.revenue).toLocaleString()}</div>
                      <div class="text-[10px] text-rose-500 font-mono">COGS: Rs. ${Number(p.cogs || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>`,
        )
        .join("")}
            </div>`
      : '<p class="text-gray-400 text-sm italic text-center py-8">No sales in this period.</p>'
    }
        </div>
      </div>

      <!-- Recent Sales -->
      <div class="glass rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <h3 class="font-bold text-gray-700 dark:text-gray-200 text-sm">Recent Sales</h3>
          ${statInfoIcon("Latest sales records for this shop. Amount shown is each sale's bill total: bill subtotal - discount + tax.")}
        </div>
        <div class="p-4">
          ${data.recentSales.length
      ? `
            <div class="space-y-0.5">
              ${data.recentSales
        .map(
          (s) => `
                <div class="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                  <div class="text-xs text-gray-500 dark:text-gray-400">${new Date(s.created_at).toLocaleString()}</div>
                  <div class="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">Rs. ${Number(s.total).toLocaleString()}</div>
                </div>`,
        )
        .join("")}
            </div>`
      : '<p class="text-gray-400 text-sm italic text-center py-8">No sales in this period.</p>'
    }
        </div>
      </div>
    </div>`;
}

function renderGlobalDashboard(data) {
  $c("page-content").innerHTML = `
    <div class="max-w-4xl mx-auto mt-10">
      <div class="glass rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors duration-300">
         <h3 class="font-bold text-gray-700 dark:text-gray-200 mb-6 flex items-center gap-2 uppercase tracking-widest text-[12px]">
          <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          System Owner Quick Actions
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onclick="window.location.href = '/admin/store-monitoring'" class="flex flex-col items-start p-6 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all group shadow-sm hover:shadow-md h-full text-left">
            <svg class="w-8 h-8 text-indigo-500 mb-4 bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            <span class="block text-base font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-2">SaaS Command Center</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">Monitor all restaurants, view growth charts, and manage platform status</span>
          </button>
           <button onclick="navigate('subscriptions')" class="flex flex-col items-start p-6 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all group shadow-sm hover:shadow-md h-full text-left">
            <svg class="w-8 h-8 text-emerald-500 mb-4 bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="block text-base font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Track Payments</span>
            <span class="block text-sm text-slate-500 dark:text-slate-400">Manage setup fees, advances, repairs, subscriptions, and platform income</span>
          </button>
        </div>
      </div>
    </div>`;
}

// ─── Brands ───────────────────────────────────────────────────────
async function renderBrands(shopId = null) {
  // If we are coming from Master Hierarchy, shopId is provided.
  // If we are clicking 'Brands' from sidebar, shopId is null (defaults to current user's shop).
  managedShopId = shopId;
  const url = managedShopId
    ? `/api/brands?shopId=${managedShopId}`
    : "/api/brands";

  const brands = await api(url);

  const shopName = managedShopId
    ? ` for ${shops.find((s) => s.id === managedShopId)?.name}`
    : "";

  const getAvatar = (name) => {
    const init = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const colors = [
      "bg-indigo-500",
      "bg-rose-500",
      "bg-emerald-500",
      "bg-amber-500",
      "bg-blue-500",
      "bg-violet-500",
    ];
    const idx = (name.charCodeAt(0) + name.length) % colors.length;
    return { init, color: colors[idx] };
  };

  const cardsHtml = brands
    .map((b) => {
      const { init, color } = getAvatar(b.name);
      const ownershipPercent = Number(b.ownership_percent || 0);
      const partnerType = b.partner_type === "product_based" ? "product_based" : "share_based";
      const isOwnerPartner = Boolean(b.is_owner_partner);
      const typeLabel = isOwnerPartner ? "Owner/Admin" : partnerType === "product_based" ? "Product Based" : "Share Based";
      return `
      <div class="glass rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:shadow-xl hover:-translate-y-1 transition-all group bg-white dark:bg-gray-900">
         <div class="flex flex-col items-center text-center">
            <div class="w-20 h-20 rounded-2xl ${color} flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg shadow-${color.split("-")[1]}-500/20">
              ${init}
            </div>
            <h4 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">${b.name}</h4>
            <p class="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">${typeLabel}</p>
            ${partnerType === "share_based"
              ? `<p class="mt-3 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest">${ownershipPercent.toFixed(2).replace(/\.00$/, "")}% ${isOwnerPartner ? "Auto Share" : "Business Share"}</p>`
              : `<p class="mt-3 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest">Product Profit</p>`
            }
         </div>
         <div class="mt-8 pt-5 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Registered</span>
              <span class="text-xs text-gray-600 dark:text-gray-400 font-medium">${new Date(b.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric", day: "numeric" })}</span>
            </div>
            ${currentUser.role === "superadmin"
          ? `
            <div class="flex gap-2">
               <button onclick="openEditBrand(${b.id}, '${b.name.replace(/'/g, "\\'")}', ${ownershipPercent}, ${isOwnerPartner ? "true" : "false"}, '${partnerType}')" class="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-transparent hover:bg-indigo-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
               </button>
               ${isOwnerPartner ? "" : `
               <button onclick="deleteBrand(${b.id})" class="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-rose-600 dark:text-rose-400 border border-transparent hover:bg-red-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
               </button>
               `}
            </div>
            `
          : ""
        }
         </div>
      </div>
    `;
    })
    .join("");

  $c("page-content").innerHTML = `
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
      <div>
        <h3 class="text-3xl font-black text-gray-800 dark:text-gray-100 tracking-tight">Partner Brands${shopName}</h3>
        <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">Directory of ${brands.length} official brands in the system</p>
      </div>
      ${currentUser.role === "superadmin"
      ? `
        <button onclick="openAddBrand()" class="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 text-white text-sm font-bold transition-all active:scale-95">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Add Partner Brand
        </button>
      `
      : ""
    }
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
      ${cardsHtml ||
    `<div class="col-span-full py-32 text-center">
          <div class="text-gray-300 dark:text-gray-700 mb-4 flex justify-center">
            <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          </div>
          <p class="text-gray-400 italic">No brands found in the registry.</p>
        </div>`
    }
    </div>
  `;
}

function toggleBrandPartnerTypeFields() {
  const type = $c("brand-partner-type")?.value || "share_based";
  const shareWrap = $c("brand-share-wrap");
  const shareInput = $c("brand-ownership-percent");
  if (shareWrap) shareWrap.classList.toggle("hidden", type === "product_based");
  if (shareInput) {
    shareInput.disabled = type === "product_based" || shareInput.dataset.ownerPartner === "1";
    if (type === "product_based") shareInput.value = "0";
  }
}

function openAddBrand() {
  openModal(
    "Add Brand",
    `
    <div class="space-y-4">
      <div><label class="block text-xs text-slate-400 mb-1.5">Brand Name</label>
        <input id="brand-name" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Nike" /></div>
      <div><label class="block text-xs text-slate-400 mb-1.5">Partner Type</label>
        <select id="brand-partner-type" onchange="toggleBrandPartnerTypeFields()" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
          <option value="share_based">Share Based</option>
          <option value="product_based">Product Based</option>
        </select>
        <p class="mt-1 text-[10px] text-slate-500">Share based splits shop profit by percentage. Product based uses products assigned to this partner.</p></div>
      <div id="brand-share-wrap"><label class="block text-xs text-slate-400 mb-1.5">Business Share (%)</label>
        <input id="brand-ownership-percent" type="number" min="0" max="100" step="0.01" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. 50" />
        <p class="mt-1 text-[10px] text-slate-500">Owner/admin share is recalculated as the remaining percentage.</p></div>
      <button onclick="saveBrand()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Save Brand</button>
    </div>`,
  );
  toggleBrandPartnerTypeFields();
  setTimeout(() => $c("brand-name").focus(), 50);
}

function openEditBrand(id, name, ownershipPercent = 0, isOwnerPartner = false, partnerType = "share_based") {
  const normalizedPartnerType = isOwnerPartner ? "share_based" : (partnerType === "product_based" ? "product_based" : "share_based");
  openModal(
    "Edit Brand",
    `
    <div class="space-y-4">
      <div><label class="block text-xs text-slate-400 mb-1.5">Brand Name</label>
        <input id="brand-name" value="${name}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
      <div><label class="block text-xs text-slate-400 mb-1.5">Partner Type</label>
        <select id="brand-partner-type" onchange="toggleBrandPartnerTypeFields()" ${isOwnerPartner ? "disabled" : ""} class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
          <option value="share_based" ${normalizedPartnerType === "share_based" ? "selected" : ""}>Share Based</option>
          <option value="product_based" ${normalizedPartnerType === "product_based" ? "selected" : ""}>Product Based</option>
        </select>
        <p class="mt-1 text-[10px] text-slate-500">${isOwnerPartner ? "Owner/admin is always share based." : "Share based splits shop profit. Product based uses assigned products."}</p></div>
      <div id="brand-share-wrap" class="${normalizedPartnerType === "product_based" ? "hidden" : ""}"><label class="block text-xs text-slate-400 mb-1.5">Business Share (%)</label>
        <input id="brand-ownership-percent" data-owner-partner="${isOwnerPartner ? "1" : "0"}" type="number" min="0" max="100" step="0.01" value="${Number(ownershipPercent || 0)}" ${isOwnerPartner || normalizedPartnerType === "product_based" ? "disabled" : ""} class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
        <p class="mt-1 text-[10px] text-slate-500">${isOwnerPartner ? "Owner/admin share is calculated from the remaining share-based partner percentage." : "Owner/admin share is recalculated as the remaining percentage."}</p></div>
      <button onclick="saveBrand(${id})" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">Update Brand</button>
    </div>`,
  );
  toggleBrandPartnerTypeFields();
}

async function saveBrand(id) {
  const name = $c("brand-name").value.trim();
  if (!name) return toast("Brand name required", "error");
  const partnerType = $c("brand-partner-type")?.value === "product_based" ? "product_based" : "share_based";
  const ownershipPercent = partnerType === "product_based" ? 0 : parseFloat($c("brand-ownership-percent")?.value);
  if (partnerType === "share_based" && (!Number.isFinite(ownershipPercent) || ownershipPercent < 0 || ownershipPercent > 100)) {
    return toast("Business share must be between 0 and 100", "error");
  }

  const payload = { name, partner_type: partnerType, ownership_percent: ownershipPercent };
  if (managedShopId) payload.shopId = managedShopId;

  if (id) {
    await api(`/api/brands/${id}`, "PUT", payload);
  } else {
    await api("/api/brands", "POST", payload);
  }
  closeModal();
  toast("Brand saved!");
  if (typeof _currentPage !== 'undefined' && _currentPage === 'hierarchy' && typeof _managedShopId !== 'undefined' && _managedShopId !== null) {
    renderShopManagement(_managedShopId);
  } else {
    renderBrands(managedShopId);
  }
}

async function deleteBrand(id) {
  if (
    !confirm("Delete this brand? Products linked to it will also be deleted.")
  )
    return;
  const url = managedShopId
    ? `/api/brands/${id}?shopId=${managedShopId}`
    : `/api/brands/${id}`;
  const r = await api(url, "DELETE");
  if (r.error) return toast(r.error, "error");
  toast("Brand deleted");
  if (typeof _currentPage !== 'undefined' && _currentPage === 'hierarchy' && typeof _managedShopId !== 'undefined' && _managedShopId !== null) {
    renderShopManagement(_managedShopId);
  } else {
    renderBrands(managedShopId);
  }
}

// ─── Products ────────────────────────────────────────────────────────
const INVENTORY_STOCK_FILTER_LABELS = {
  all: "product(s)",
  low: "low stock product(s)",
  out: "out of stock product(s)",
};

function inventoryNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function inventoryIsRecipeProduct(product) {
  return product?.product_type === 'recipe_based' || (Array.isArray(product?.variants) && product.variants.length > 0) || (Array.isArray(product?.ingredients) && product.ingredients.length > 0);
}

function isProductPublishedToMenu(product) {
  if (inventoryIsRecipeProduct(product)) return true;
  return (product?.stock_variants || []).some(variant => variant.is_active !== false && variant.is_on_menu === true);
}

function getProductMenuStock(product) {
  if (inventoryIsRecipeProduct(product)) return Infinity;
  const variants = product?.stock_variants || [];
  if (variants.length) return variants.filter(variant => variant.is_on_menu).reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  return Number(product?.stock || 0);
}

function getProductMenuVariants(product) {
  if (inventoryIsRecipeProduct(product)) return product?.variants || [];
  return (product?.stock_variants || []).filter(variant => variant.is_on_menu).map(variant => ({ ...variant, price: Number(variant.selling_price) }));
}

function getInventoryStockStatus(product) {
  if (inventoryIsRecipeProduct(product)) return "recipe";
  const stock = inventoryNumber(product.stock);
  const minStock = inventoryNumber(product.min_stock_level);
  if (stock <= 0) return "out";
  if (stock <= minStock) return "low";
  return "ok";
}

function inventoryMatchesStockFilter(status, filter) {
  if (filter === "low") return status === "low" || status === "out";
  if (filter === "out") return status === "out";
  return true;
}

function inventoryStockFilterLabel(filter) {
  return INVENTORY_STOCK_FILTER_LABELS[filter] || INVENTORY_STOCK_FILTER_LABELS.all;
}

async function renderProducts(onlyLowStock = false, requestedPage = 1, state = {}) {
  const renderRequestId = (window._inventoryRenderRequestId || 0) + 1;
  window._inventoryRenderRequestId = renderRequestId;
  const currentSearchInput = document.getElementById('inventory-search');
  const searchWasFocused = document.activeElement === currentSearchInput;
  const searchSelectionStart = searchWasFocused ? currentSearchInput.selectionStart : null;
  const searchSelectionEnd = searchWasFocused ? currentSearchInput.selectionEnd : null;
  const selectedStockFilter = onlyLowStock ? "low" : (state.stockFilter || "all");
  const inventorySearch = String(state.search || '').trim();
  const productParams = new URLSearchParams({
    paginate: '1', page: String(requestedPage), page_size: String(INVENTORY_PRODUCTS_PER_PAGE),
    menu_only: '1', exclude_components: '1', stock_filter: selectedStockFilter
  });
  if (inventorySearch) productParams.set('search', inventorySearch);
  const [productResponse, brands, menuAddons] = await Promise.all([
    api(`/api/products?${productParams.toString()}`),
    window._productBrands ? Promise.resolve(window._productBrands) : api("/api/brands"),
    Array.isArray(window._menuAddons) ? Promise.resolve(window._menuAddons) : api("/api/products/menu-addons"),
  ]);
  if (renderRequestId !== window._inventoryRenderRequestId) return;
  if (currentSearchInput?.isConnected && currentSearchInput.value.trim() !== inventorySearch) return;
  const products = Array.isArray(productResponse?.items) ? productResponse.items : [];
  const productPagination = productResponse?.pagination || { page: 1, page_size: INVENTORY_PRODUCTS_PER_PAGE, total: products.length, total_pages: 1 };
  _inventoryProductPage = Number(productPagination.page || 1);
  window._menuAddons = menuAddons;
  // Filter out components from global list for UI purposes
  allProducts = products;
  syncProductMap(products);
  const mainProducts = products.filter((p) => p.is_component !== 1 && isProductPublishedToMenu(p));
  updateLowStockBadge(mainProducts);

  $c("page-content").innerHTML = `
    <div class="flex flex-col xl:flex-row xl:items-center gap-4 mb-8">
      <div class="flex-1 relative group w-full">
        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <input type="text" id="inventory-search" value="${escapeOrderValue(inventorySearch)}" oninput="filterInventory()"
               placeholder="Search by name or category..." 
               class="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm" />
      </div>

      <div class="relative shrink-0 w-full sm:w-[180px]">
        <label for="inventory-stock-filter" class="sr-only">Stock filter</label>
        <select id="inventory-stock-filter" onchange="changeInventoryFilter()" class="appearance-none w-full pl-4 pr-10 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm">
          <option value="all" ${selectedStockFilter === "all" ? "selected" : ""}>All Stock</option>
          <option value="low" ${selectedStockFilter === "low" ? "selected" : ""}>Low Stock</option>
          <option value="out" ${selectedStockFilter === "out" ? "selected" : ""}>Out of Stock</option>
        </select>
        <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button onclick="navigate('menu-addons')" class="px-5 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-sm font-bold hover:bg-amber-100 transition-all shadow-sm">Add-ons</button>
        <button onclick="openAddCategoryPopup('product')" class="px-5 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            Add Category
        </button>
        <button onclick="openAddProduct()" class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            Add Product
        </button>
      </div>
    </div>

    <div class="flex items-center gap-3 mb-4 px-2">
      <p class="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]"><span id="product-count">${Number(productPagination.total || 0)}</span> <span id="product-count-label">${inventoryStockFilterLabel(selectedStockFilter)}</span></p>
      <button id="inventory-clear-filter" onclick="resetInventoryFilters()" class="hidden text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">Clear Filter</button>
    </div>
    ${productPagination.total ? `<div class="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Showing ${((_inventoryProductPage - 1) * Number(productPagination.page_size)) + 1}-${Math.min(_inventoryProductPage * Number(productPagination.page_size), Number(productPagination.total))} of ${Number(productPagination.total)}</div>
      <div class="flex items-center gap-2">
        <button type="button" onclick="changeInventoryPage(${_inventoryProductPage - 1})" ${_inventoryProductPage <= 1 ? 'disabled' : ''} class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Previous</button>
        <span class="min-w-[5rem] text-center text-xs font-black">${_inventoryProductPage} / ${Number(productPagination.total_pages || 1)}</span>
        <button type="button" onclick="changeInventoryPage(${_inventoryProductPage + 1})" ${_inventoryProductPage >= Number(productPagination.total_pages || 1) ? 'disabled' : ''} class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Next</button>
      </div>
    </div>` : ''}
    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <table class="w-full text-sm" id="inventory-table">
        <thead><tr class="border-b border-slate-200 dark:border-slate-700 text-left bg-slate-50 dark:bg-black/20">
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">SKU</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Product</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Category</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Brand</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Batches (Cost)</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Fine Stock</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Selling Price</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Damaged</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800" id="inventory-table-body">
          ${mainProducts.length
      ? mainProducts
        .map(
          (p) => `
            <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group inventory-row" data-stock-status="${getInventoryStockStatus(p)}" data-barcode="${p.barcode || ''}">
              <td class="px-5 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">${p.sku}</td>
              <td class="px-5 py-4">
                <div class="font-bold text-slate-800 dark:text-slate-200 product-name">${p.name}</div>
                <div class="text-[10px] text-slate-500">${p.description || ""}</div>
              </td>
              <td class="px-5 py-4"><span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider product-category">${p.category}</span></td>
              <td class="px-5 py-4 text-slate-600 dark:text-slate-400 font-medium">${p.brand_name || "—"}</td>
              <td class="px-5 py-4">
                ${p.batches && p.batches.length > 1
              ? `
                  <div class="relative inline-block">
                    <select class="appearance-none text-xs bg-transparent text-indigo-600 dark:text-indigo-400 rounded-lg pl-0 pr-6 py-1 font-black cursor-pointer transition-all focus:outline-none focus:ring-0 uppercase tracking-tight">
                      <option disabled selected class="bg-white dark:bg-slate-900">Multiple Prices (${p.batches.length})</option>
                      ${p.batches.map(b => `<option class="bg-white dark:bg-slate-900 text-sm font-bold">Rs. ${b.buying_price} (${b.quantity} qty)</option>`).join('')}
                    </select>
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/50">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                `
              : (p.batches && p.batches.length === 1)
                ? `<div class="inline-flex flex-col">
                           <span class="text-[11px] font-black text-slate-900 dark:text-white">Rs. ${p.batches[0].buying_price}</span>
                           <span class="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Standard Cost</span>
                         </div>`
                : '<span class="text-slate-300">No Batches</span>'
            }
              </td>
              <td class="px-5 py-4">
                <div class="flex flex-col gap-1">
                  ${inventoryIsRecipeProduct(p)
              ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                        🍳 Recipe-Based
                       </span>`
              : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${p.stock > p.min_stock_level ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : p.stock > 0 ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300" : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"}">
                        ${getProductMenuStock(p)}${p.components && p.components.length > 0 ? " Full Kits" : ""}
                       </span>`
            }
                  ${(() => {
              if (!p.components || p.components.length === 0) return "";
              return p.components.map(c => {
                if (!c.stock || c.stock <= 0) return "";
                return `<div class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest pl-1">+ ${c.stock} ${c.name} (Loose)</div>`;
              }).join("");
            })()}
                  ${!inventoryIsRecipeProduct(p) ? `<div class="text-[10px] text-slate-500 pl-1 italic">Threshold: ${p.min_stock_level}</div>` : ""}
                </div>
              </td>
              <td class="px-5 py-4 text-slate-600 dark:text-slate-400">${getProductMenuVariants(p).length ? getProductMenuVariants(p).map(v => `<div class="text-xs"><strong>${escapeOrderValue(v.name)}:</strong> Rs. ${Number(v.price).toLocaleString()}</div>`).join('') : `Rs. ${p.selling_price || 0}`}</td>
              <td class="px-5 py-4">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${p.damage_stock > 0 ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}">
                  ${p.damage_stock || 0} Damaged
                </span>
              </td>
              <td class="px-5 py-4 text-right space-x-1 whitespace-nowrap">
                ${!inventoryIsRecipeProduct(p) && !(p.stock_variants || []).length
              ? `<button onclick="adjustStock(${p.id},'${p.name.replace(/'/g, "\\'")}',${p.stock},${p.buying_price})" class="px-2 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700">Stock</button>`
              : ""
                }
                ${!inventoryIsRecipeProduct(p) && !(p.stock_variants || []).length ? `<div class="inline-flex rounded-lg shadow-sm" role="group">
                  <button onclick="openLossPopup(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="px-2 py-1 text-xs rounded-l-lg bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-800/50 transition-all border border-rose-200 dark:border-rose-900/50 border-r-0">Loss</button>
                  <button onclick="openRecoveryPopup(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.damage_stock})" class="px-2 py-1 text-xs rounded-r-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/50 transition-all border border-emerald-200 dark:border-emerald-900/50">Recov</button>
                </div>` : ''}
                <button onclick="openEditProduct(${p.id})" class="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-all border border-indigo-200 dark:border-indigo-900/50">Edit</button>
                ${p.barcode ? `<button onclick="printBarcode('${p.barcode.replace(/'/g, "\\'")}')" title="Print barcode" aria-label="Print barcode" class="inline-flex shrink-0 items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all border border-slate-200 dark:border-slate-900/50"><svg class="block shrink-0 overflow-visible" style="width:20px;height:20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg></button>` : ""}
              </td>
            </tr>`,
        )
        .join("")
      : `<tr><td colspan="9" class="px-6 py-12 text-center text-slate-500">No products. Add brands first, then products.</td></tr>`
    }
        </tbody>
      </table>
    </div>`;
  const renderedSearchInput = document.getElementById('inventory-search');
  if (currentSearchInput && renderedSearchInput) {
    renderedSearchInput.replaceWith(currentSearchInput);
    if (searchWasFocused) {
      currentSearchInput.focus({ preventScroll: true });
      const caretStart = Math.min(searchSelectionStart ?? inventorySearch.length, currentSearchInput.value.length);
      const caretEnd = Math.min(searchSelectionEnd ?? caretStart, currentSearchInput.value.length);
      currentSearchInput.setSelectionRange(caretStart, caretEnd);
    }
  }
  window._productBrands = brands;
  const clearFilterBtn = document.getElementById("inventory-clear-filter");
  if (clearFilterBtn) clearFilterBtn.classList.toggle("hidden", !inventorySearch && selectedStockFilter === "all");
}

async function editCategoryName(type, id) {
  const categories = type === 'product' ? _productCategories : _expenseCategories;
  const category = categories.find(item => Number(item.id) === Number(id));
  if (!category) return toast('Category not found', 'error');
  const nextName = prompt('Enter the new category name:', category.name || '');
  if (nextName === null) return;
  const name = nextName.trim();
  if (!name) return toast('Category name is required', 'error');
  if (name.toLowerCase() === String(category.name || '').trim().toLowerCase()) return;
  const url = type === 'product' ? `/api/product-categories/${id}` : `/api/expense-categories/${id}`;
  try {
    await api(url, 'PATCH', { name });
    await fetchCategories();
    if (type === 'product' && _currentPage === 'product-categories') await renderProductCategoriesPage();
    else updateCategoryListInPopup(type);
    toast('Category name updated', 'success');
  } catch (error) {
    // The shared API helper already shows the server validation message.
  }
}

const filterInventory = debounce(() => {
  renderProducts(_currentPage === "products-low-stock", 1, {
    search: document.getElementById("inventory-search")?.value || "",
    stockFilter: document.getElementById("inventory-stock-filter")?.value || "all"
  });
}, 300);

function changeInventoryFilter() {
  renderProducts(_currentPage === "products-low-stock", 1, {
    search: document.getElementById("inventory-search")?.value || "",
    stockFilter: document.getElementById("inventory-stock-filter")?.value || "all"
  });
}

function changeInventoryPage(page) {
  renderProducts(_currentPage === "products-low-stock", page, {
    search: document.getElementById("inventory-search")?.value || "",
    stockFilter: document.getElementById("inventory-stock-filter")?.value || "all"
  });
}

function resetInventoryFilters() {
  if (_currentPage === "products-low-stock") {
    navigate("products");
    return;
  }
  const searchEl = document.getElementById("inventory-search");
  const stockFilterEl = document.getElementById("inventory-stock-filter");
  if (searchEl) searchEl.value = "";
  if (stockFilterEl) stockFilterEl.value = "all";
  filterInventory();
}



function productFormHtml(p = {}, brands = []) {
  const brandOptions = brands
    .map(
      (b) =>
        `<option value="${b.id}" ${p.brand_id == b.id ? "selected" : ""}>${b.name} (${b.partner_type === "product_based" ? "Product" : "Share"})</option>`,
    )
    .join("");

  // Helper for numeric inputs with +/- buttons
  const numInput = (id, label, value, placeholder = "") => `
    <div class="col-span-2 sm:col-span-1">
      <label class="block text-xs text-slate-400 mb-1">${label}</label>
      <div class="flex items-center gap-2">
        <button type="button" onclick="const inp = this.nextElementSibling; inp.stepDown(); inp.dispatchEvent(new Event('input', {bubbles:true})); ${id === "add-cart-qty" ? "" : "if(window.calculateCartTotal) calculateCartTotal();"}" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xl font-bold">-</button>
        <input id="${id}" type="number" value="${value}" class="flex-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="${placeholder}" />
        <button type="button" onclick="const inp = this.previousElementSibling; inp.stepUp(); inp.dispatchEvent(new Event('input', {bubbles:true})); ${id === "add-cart-qty" ? "" : "if(window.calculateCartTotal) calculateCartTotal();"}" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xl font-bold">+</button>
      </div>
    </div>`;

  const isRestaurant = currentUser.shop_type === "restaurant";
  const isRecipeProduct = isRestaurant && (p.product_type === 'recipe_based' || window._formProductType === 'recipe_based' || (p.variants || []).length > 0);
  const labelComp = isRestaurant ? "Ingredients (Recipe)" : "Unit Breakdown / Loose Items";
  const descComp = isRestaurant
    ? "Define raw ingredients for this item. Cost will be auto-calculated from raw stock prices."
    : "Define how many smaller items (e.g. pieces in a box) are in one unit. Selling these will automatically break a unit from stock.";
  const btnComp = isRestaurant ? "Add Ingredient" : "Add Loose Item";

  const hasCompositePermission =
    currentUser.allowed_panels &&
    currentUser.allowed_panels.includes("composite_products");
  const cropAspectOptions =
    window.ProductImageTools?.getAspectOptions?.("pos") ||
    '<option value="pos" selected>Product Card (4:3)</option>';

  const compHtml = hasCompositePermission
    ? `
    <div class="col-span-2 border-b border-slate-100 dark:border-slate-800 pb-2 mt-4 mb-2 flex items-center justify-between">
      <div>
        <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">${labelComp}</h4>
        <p class="text-[10px] text-slate-500 italic mt-0.5">${descComp}</p>
      </div>
      <button type="button" onclick="addComponentToForm(${isRestaurant})" class="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold hover:bg-emerald-100 transition-all flex items-center gap-1">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
        ${btnComp}
      </button>
    </div>
    <div class="col-span-2 space-y-2" id="pf-comp-list">
        <!-- Rendered by renderFormCompositionList() -->
    </div>
  `
    : "";

  const menuOptionsHtml = isRecipeProduct ? `
    <div class="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Required Variants</h4>
          <p class="text-[10px] text-slate-500 mt-0.5">Every product needs at least one size. Each size has its own price and ingredient quantities.</p>
        </div>
        <button type="button" onclick="addProductVariant()" class="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">+ Variant</button>
      </div>
      <div id="pf-variant-list" class="space-y-3"></div>
    </div>
    <div class="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Optional Add-ons</h4>
          <p class="text-[10px] text-slate-500 mt-0.5">Select reusable add-ons from the Menu Add-ons panel.</p>
        </div>
        <button type="button" onclick="closeModal(); navigate('menu-addons')" class="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold">Manage Add-ons</button>
      </div>
      <div id="pf-addon-list" class="space-y-2"></div>
    </div>` : '';
  const stockVariantsHtml = isRestaurant && !isRecipeProduct ? `
    <div class="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div><h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Stock Variants</h4><p class="text-[10px] text-slate-500 mt-0.5">Each size has independent cost, selling price, barcode, and stock. Publish variants to Menu when ready.</p></div>
        <button type="button" onclick="addStockProductVariant()" class="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">+ Variant</button>
      </div>
      <div id="pf-stock-variant-list" class="space-y-3"></div>
    </div>` : '';

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 sm:col-span-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Basic Information</h4>
        </div>
        <div class="col-span-2 sm:col-span-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2 hidden sm:block"></div>

        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">SKU *</label>
          <input id="pf-sku" value="${p.sku || ""}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Unique code" /></div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Barcode (Optional)</label>
          <div class="flex items-center gap-2">
            <input id="pf-barcode" value="${p.barcode || ""}" class="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Scan or enter barcode" />
            <button type="button" onclick="document.getElementById('pf-barcode').value = Math.floor(Math.random() * 1000000000000).toString()" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-xs font-bold whitespace-nowrap">Auto</button>
          </div>
        </div>
        <div class="col-span-2 sm:col-span-1"><label class="block text-xs text-slate-400 mb-1">Category *</label>
          <select id="pf-category" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm">
            <option value="">Select Category</option>
            ${_productCategories.map((c) => `<option value="${c.name}" ${p.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
          </select>
        </div>
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Product Name *</label>
          <input id="pf-name" value="${p.name || ""}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Product name" /></div>
        ${(isRestaurant || brands.length <= 1)
      ? `<input type="hidden" id="pf-brand" value="${brands[0] ? brands[0].id : ""}" />`
      : `<div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Brand *</label>
             <select id="pf-brand" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"><option value="">Select brand</option>${brandOptions}</select></div>`
    }
        <div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Description</label>
          <input id="pf-desc" value="${p.description || ""}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" placeholder="Optional description" /></div>

        <div class="col-span-2 border-b border-slate-100 dark:border-slate-800 pb-2 mt-4 mb-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Pricing & Inventory</h4>
        </div>

        <input id="pf-product-type" type="hidden" value="${isRecipeProduct ? 'recipe_based' : 'stock_based'}" />
        <div id="pricing-cost-container" class="${isRestaurant ? 'hidden' : 'col-span-2 sm:col-span-1'}">
          ${numInput("pf-buy", "Cost Price", p.buying_price ?? "")}
        </div>
        <div id="pricing-sell-container" class="${isRestaurant ? 'hidden' : 'col-span-2 sm:col-span-1'}">
          ${numInput("pf-sell", "Selling Price", p.selling_price ?? "")}
        </div>
        <div id="pricing-stock-container" class="${isRestaurant ? 'hidden' : 'col-span-2 sm:col-span-1'}">
          ${numInput("pf-stock", "Initial Stock", p.stock ?? "")}
        </div>
        <div id="pricing-min-stock-container" class="${isRestaurant ? 'hidden' : 'col-span-2 sm:col-span-1'}">
           ${numInput("pf-min-stock", "Minimum Stock Level", p.min_stock_level ?? "", "Alert threshold")}
        </div>

        ${menuOptionsHtml}
        ${stockVariantsHtml}
        ${isRestaurant ? '' : compHtml}

        <div class="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Product Image</h4>
          <div class="flex items-start gap-4">
            <div id="pf-img-preview" class="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center flex-shrink-0">
              ${p.image_url
      ? `<img src="${p.image_url}" class="w-full h-full object-cover" />`
      : `<svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
    }
            </div>
            <div class="flex-1">
              <label class="block text-xs text-slate-500 mb-2">Upload a photo of this product (JPG, PNG, WebP, max 2MB)</label>
              <label for="pf-image" class="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                Choose Image
              </label>
              <input id="pf-image" type="file" accept="image/*" class="hidden" onchange="previewProductImage(this)" />
            </div>
          </div>
          <div id="pf-crop-editor" class="hidden mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-4 space-y-4">
            <div>
              <div class="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h5 class="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Crop Image</h5>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Saved images are normalized to the POS product card shape.</p>
                </div>
                <button type="button" onclick="resetProductImageCrop()" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:text-indigo-600 transition-all">
                  Reset
                </button>
              </div>
              <canvas id="pf-crop-canvas" class="w-full rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-inner"></canvas>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                View
                <select id="pf-crop-aspect" onchange="setProductImageCropAspect(this.value)" class="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold outline-none focus:border-indigo-500">
                  ${cropAspectOptions}
                </select>
              </label>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Zoom
                <input id="pf-crop-zoom" type="range" min="1" max="3" step="0.01" value="1" oninput="updateProductImageCrop({ zoom: parseFloat(this.value) })" class="mt-3 w-full accent-indigo-600" />
              </label>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Horizontal
                <input id="pf-crop-x" type="range" min="-100" max="100" step="1" value="0" oninput="updateProductImageCrop({ offsetX: parseFloat(this.value) })" class="mt-3 w-full accent-indigo-600" />
              </label>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Vertical
                <input id="pf-crop-y" type="range" min="-100" max="100" step="1" value="0" oninput="updateProductImageCrop({ offsetY: parseFloat(this.value) })" class="mt-3 w-full accent-indigo-600" />
              </label>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                BG Sensitivity
                <input id="pf-bg-tolerance" type="range" min="18" max="120" step="1" value="46" oninput="updateProductImageBgTolerance(this.value)" class="mt-3 w-full accent-emerald-600" />
              </label>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" onclick="removeProductImageBackground()" class="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all">
                  Remove BG
                </button>
                <button type="button" onclick="restoreProductImageBackground()" class="h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 transition-all">
                  Restore
                </button>
              </div>
            </div>
            <p id="pf-image-tool-status" class="text-[11px] font-bold text-slate-500 dark:text-slate-400"></p>
            <button type="button" onclick="applyProductImageCrop()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20">
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function newMenuOptionId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rawStockOptions(selectedId) {
  return (window._rawStocksList || []).map((stock) =>
    `<option value="${stock.id}" ${Number(selectedId) === Number(stock.id) ? 'selected' : ''}>${escapeOrderValue(stock.name)} (${escapeOrderValue(stock.usage_unit || stock.unit || '')})</option>`
  ).join('');
}

function addProductVariant() {
  const firstStock = (window._rawStocksList || [])[0];
  window._formVariants = window._formVariants || [];
  window._formVariants.push({
    id: newMenuOptionId('variant'), name: '', price: 0,
    is_default: window._formVariants.length === 0,
    ingredients: firstStock ? [] : []
  });
  renderProductVariantsForm();
}

function removeProductVariant(index) {
  if ((window._formVariants || []).length <= 1) return toast('At least one variant is required', 'warning');
  window._formVariants.splice(index, 1);
  if (!window._formVariants.some(v => v.is_default)) window._formVariants[0].is_default = true;
  renderProductVariantsForm();
}

function updateProductVariant(index, field, value) {
  const variant = (window._formVariants || [])[index];
  if (!variant) return;
  if (field === 'price') variant[field] = Math.max(Number(value) || 0, 0);
  else variant[field] = value;
}

function setDefaultProductVariant(index) {
  (window._formVariants || []).forEach((variant, i) => { variant.is_default = i === index; });
  renderProductVariantsForm();
}

function addVariantIngredient(variantIndex) {
  const stock = (window._rawStocksList || [])[0];
  if (!stock) return toast('Add inventory ingredients first', 'error');
  window._formVariants[variantIndex].ingredients.push({ raw_stock_id: stock.id, quantity: 1 });
  renderProductVariantsForm();
}

function updateVariantIngredient(variantIndex, ingredientIndex, field, value) {
  const ingredient = window._formVariants?.[variantIndex]?.ingredients?.[ingredientIndex];
  if (!ingredient) return;
  ingredient[field] = field === 'raw_stock_id' ? Number(value) : Math.max(Number(value) || 0, 0);
  refreshProductVariantCost(variantIndex);
}

function calculateProductVariantCost(variant) {
  return (variant?.ingredients || []).reduce((total, ingredient) => {
    const stock = (window._rawStocksList || []).find(item => Number(item.id) === Number(ingredient.raw_stock_id));
    if (!stock) return total;
    return total + (Number(ingredient.quantity || 0) / Number(stock.conversion_factor || 1)) * Number(stock.buying_price || 0);
  }, 0);
}

function refreshProductVariantCost(variantIndex) {
  const value = calculateProductVariantCost(window._formVariants?.[variantIndex]);
  const target = $c(`pf-variant-cost-${variantIndex}`);
  if (target) target.textContent = `Rs. ${value.toFixed(2)}`;
}

function removeVariantIngredient(variantIndex, ingredientIndex) {
  window._formVariants[variantIndex].ingredients.splice(ingredientIndex, 1);
  renderProductVariantsForm();
}

function renderProductVariantsForm() {
  const host = $c('pf-variant-list');
  if (!host) return;
  host.innerHTML = (window._formVariants || []).map((variant, variantIndex) => `
    <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/40 space-y-3">
      <div class="grid grid-cols-12 gap-2 items-end">
        <label class="col-span-5 text-[10px] font-bold text-slate-500">Variant name
          <input value="${escapeOrderValue(variant.name)}" oninput="updateProductVariant(${variantIndex}, 'name', this.value)" placeholder="Small, Medium, Regular" class="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
        </label>
        <label class="col-span-4 text-[10px] font-bold text-slate-500">Selling price
          <input type="number" min="0.01" step="0.01" value="${Number(variant.price || 0)}" oninput="updateProductVariant(${variantIndex}, 'price', this.value)" class="mt-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
        </label>
        <label class="col-span-2 flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><span>Default</span><input type="radio" name="pf-default-variant" ${variant.is_default ? 'checked' : ''} onchange="setDefaultProductVariant(${variantIndex})" /></label>
        <button type="button" onclick="removeProductVariant(${variantIndex})" class="col-span-1 h-9 rounded-lg text-rose-500 hover:bg-rose-50" title="Remove variant">×</button>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between items-center"><span class="text-[10px] font-black uppercase tracking-wider text-slate-400">Ingredients for ${escapeOrderValue(variant.name || 'this variant')}</span><span class="text-[10px] font-black text-emerald-600">Calculated cost: <strong id="pf-variant-cost-${variantIndex}">Rs. ${calculateProductVariantCost(variant).toFixed(2)}</strong></span><button type="button" onclick="addVariantIngredient(${variantIndex})" class="text-[10px] font-bold text-emerald-600">+ Ingredient</button></div>
        ${(variant.ingredients || []).map((ingredient, ingredientIndex) => `
          <div class="grid grid-cols-12 gap-2">
            <select onchange="updateVariantIngredient(${variantIndex}, ${ingredientIndex}, 'raw_stock_id', this.value)" class="col-span-7 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">${rawStockOptions(ingredient.raw_stock_id)}</select>
            <input type="number" min="0.0001" step="0.01" value="${Number(ingredient.quantity || 0)}" onchange="updateVariantIngredient(${variantIndex}, ${ingredientIndex}, 'quantity', this.value)" class="col-span-4 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" placeholder="Qty" />
            <button type="button" onclick="removeVariantIngredient(${variantIndex}, ${ingredientIndex})" class="col-span-1 text-rose-500">×</button>
          </div>`).join('') || '<p class="text-[10px] text-slate-400 italic">No ingredients configured.</p>'}
      </div>
    </div>`).join('');
}

function toggleProductAddon(catalogId, checked) {
  const id = `addon-${catalogId}`;
  window._formAddons = (window._formAddons || []).filter(addon => String(addon.id) !== id);
  if (checked) {
    const addon = (window._menuAddons || []).find(item => Number(item.id) === Number(catalogId));
    if (addon) window._formAddons.push({ id, name: addon.name, price: Number(addon.price || 0), raw_stock_id: addon.raw_stock_id ? Number(addon.raw_stock_id) : null, quantity: Number(addon.quantity || 0) });
  }
  renderProductAddonsForm();
}

function renderProductAddonsForm() {
  const host = $c('pf-addon-list');
  if (!host) return;
  const selected = new Set((window._formAddons || []).map(addon => String(addon.id)));
  host.innerHTML = (window._menuAddons || []).map(addon => `
    <label class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
      <span class="flex items-center gap-3"><input type="checkbox" ${selected.has(`addon-${addon.id}`) ? 'checked' : ''} onchange="toggleProductAddon(${addon.id}, this.checked)" class="rounded text-amber-600"><span><strong class="block text-xs text-slate-800 dark:text-slate-100">${escapeOrderValue(addon.name)}</strong><small class="text-[10px] text-slate-500">${addon.inventory_name ? `${escapeOrderValue(addon.inventory_name)} · ${Number(addon.quantity)} used` : 'No inventory linked'}</small></span></span>
      <strong class="text-xs text-emerald-600">+ Rs. ${Number(addon.price || 0).toLocaleString()}</strong>
    </label>`).join('') || '<p class="text-[10px] text-slate-400 italic">No add-ons created. Use Manage Add-ons first.</p>';
  return;
  host.innerHTML = (window._formAddons || []).map((addon, index) => `
    <div class="grid grid-cols-12 gap-2 items-end rounded-xl border border-slate-200 dark:border-slate-700 p-2">
      <label class="col-span-3 text-[10px] text-slate-500">Display name<input value="${escapeOrderValue(addon.name)}" oninput="updateProductAddon(${index}, 'name', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" /></label>
      <label class="col-span-4 text-[10px] text-slate-500">Inventory item<select onchange="updateProductAddon(${index}, 'raw_stock_id', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">${rawStockOptions(addon.raw_stock_id)}</select></label>
      <label class="col-span-2 text-[10px] text-slate-500">Used qty<input type="number" min="0.0001" step="0.01" value="${Number(addon.quantity || 0)}" onchange="updateProductAddon(${index}, 'quantity', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" /></label>
      <label class="col-span-2 text-[10px] text-slate-500">Extra price<input type="number" min="0" step="0.01" value="${Number(addon.price || 0)}" onchange="updateProductAddon(${index}, 'price', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" /></label>
      <button type="button" onclick="removeProductAddon(${index})" class="col-span-1 h-9 text-rose-500">×</button>
    </div>`).join('') || '<p class="text-[10px] text-slate-400 italic">No optional add-ons configured.</p>';
}

let _editingMenuAddonId = null;

async function renderMenuAddons(editId = null) {
  _editingMenuAddonId = editId === null ? _editingMenuAddonId : editId;
  const [addons, stocks] = await Promise.all([api('/api/products/menu-addons'), api('/api/raw-stock')]);
  window._menuAddons = addons;
  window._rawStocksList = stocks;
  const editing = addons.find(addon => Number(addon.id) === Number(_editingMenuAddonId));
  if (_editingMenuAddonId && !editing) _editingMenuAddonId = null;
  const selectedStock = stocks.find(stock => Number(stock.id) === Number(editing?.raw_stock_id));
  const content = $c('page-content');
  content.innerHTML = `<div class="space-y-6">
    <div class="rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-6 sm:p-8 text-white shadow-xl shadow-amber-500/20">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><button onclick="navigate('products')" class="text-xs font-black uppercase tracking-widest text-amber-100 hover:text-white">← Back to Menu</button><h2 class="mt-3 text-3xl font-black">Reusable Add-ons</h2><p class="mt-2 max-w-2xl text-sm text-amber-50">Create each add-on once, optionally connect it to inventory, then select it on any product.</p></div><div class="rounded-2xl bg-white/15 px-5 py-4 backdrop-blur"><strong class="block text-3xl">${addons.length}</strong><span class="text-xs font-bold uppercase tracking-widest text-amber-100">Active add-ons</span></div></div>
    </div>
    ${currentUserHasPermission(editing ? 'products.update' : 'products.create') ? `<section class="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
      <div class="flex items-center justify-between gap-3 mb-5"><div><h3 class="text-lg font-black text-slate-900 dark:text-white">${editing ? 'Edit Add-on' : 'Create Add-on'}</h3><p class="text-xs text-slate-500 mt-1">Inventory usage is optional. When linked, enter consumption in the smaller usage unit.</p></div>${editing ? `<button onclick="cancelMenuAddonEdit()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Cancel Edit</button>` : ''}</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="text-xs font-bold text-slate-500">Add-on name<input id="menu-addon-name" value="${escapeOrderValue(editing?.name || '')}" placeholder="e.g. Ice Cream Scoop" class="mt-1.5 w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"></label>
        <label class="text-xs font-bold text-slate-500">Extra selling price<input id="menu-addon-price" type="number" min="0" step="0.01" value="${Number(editing?.price || 0)}" class="mt-1.5 w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"></label>
        <label class="text-xs font-bold text-slate-500 md:col-span-2">Search inventory ingredient (optional)
          <div class="relative mt-1.5"><input id="menu-addon-stock-search" list="menu-addon-stock-suggestions" value="${escapeOrderValue(selectedStock?.name || '')}" oninput="selectMenuAddonIngredient(this.value)" placeholder="Type ingredient name, e.g. Ice Cream" autocomplete="off" class="w-full px-4 py-3 pr-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"><span class="absolute right-4 top-3.5 text-slate-400">⌕</span></div>
          <datalist id="menu-addon-stock-suggestions">${stocks.map(stock => `<option value="${escapeOrderValue(stock.name)}">${escapeOrderValue(stock.ingredient_code || '')} · ${Number(stock.current_stock || 0)} ${escapeOrderValue(stock.unit || '')}</option>`).join('')}</datalist><input id="menu-addon-stock" type="hidden" value="${editing?.raw_stock_id || ''}">
        </label>
        <div id="menu-addon-usage-wrap" class="md:col-span-2 ${selectedStock ? '' : 'hidden'} rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-4">
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end"><label class="text-xs font-bold text-emerald-800 dark:text-emerald-300"><span id="menu-addon-qty-label">Quantity used per add-on (${escapeOrderValue(selectedStock?.usage_unit || selectedStock?.unit || 'unit')})</span><input id="menu-addon-qty" type="number" min="0.0001" step="0.01" value="${Number(editing?.quantity || 0)}" class="mt-1.5 w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-white"></label><div id="menu-addon-conversion-note" class="text-xs font-bold text-emerald-700 dark:text-emerald-400 pb-3">${selectedStock ? `1 ${escapeOrderValue(selectedStock.unit)} = ${Number(selectedStock.conversion_factor || 1)} ${escapeOrderValue(selectedStock.usage_unit || selectedStock.unit)}` : ''}</div></div>
        </div>
        <div class="md:col-span-2 flex justify-end"><button id="save-menu-addon" onclick="saveMenuAddon(${editing?.id || 'null'})" class="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black shadow-lg shadow-amber-500/20">${editing ? 'Update Add-on' : 'Save Add-on'}</button></div>
      </div>
    </section>` : ''}
    <section class="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5"><div><h3 class="text-lg font-black text-slate-900 dark:text-white">Add-on Catalog</h3><p class="text-xs text-slate-500 mt-1">Search and manage add-ons available for products.</p></div><input id="menu-addon-list-search" oninput="filterMenuAddonCards(this.value)" placeholder="Search add-ons or ingredients..." class="w-full sm:w-80 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"></div>
      <div id="menu-addon-card-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${addons.map(addon => `<article class="menu-addon-card rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-amber-300 transition-colors" data-search="${escapeOrderValue(`${addon.name} ${addon.inventory_name || ''}`.toLowerCase())}"><div class="flex justify-between gap-3"><div class="min-w-0"><h4 class="font-black text-slate-900 dark:text-white truncate">${escapeOrderValue(addon.name)}</h4><p class="mt-1 text-lg font-black text-emerald-600">+ Rs. ${Number(addon.price).toLocaleString()}</p></div><span class="h-fit px-2.5 py-1 rounded-full text-[10px] font-black ${addon.inventory_name ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${addon.inventory_name ? 'Inventory linked' : 'No inventory'}</span></div><div class="mt-4 min-h-10 text-xs text-slate-500">${addon.inventory_name ? `<strong class="text-slate-700 dark:text-slate-300">${escapeOrderValue(addon.inventory_name)}</strong><br>${Number(addon.quantity)} ${escapeOrderValue(stocks.find(s => Number(s.id) === Number(addon.raw_stock_id))?.usage_unit || stocks.find(s => Number(s.id) === Number(addon.raw_stock_id))?.unit || 'unit')} per sale` : 'This add-on changes price only.'}</div><div class="mt-4 flex gap-2">${currentUserHasPermission('products.update') ? `<button onclick="editMenuAddon(${addon.id})" class="flex-1 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-xs font-bold">Edit</button>` : ''}${currentUserHasPermission('products.delete') ? `<button onclick="deleteMenuAddon(${addon.id})" class="flex-1 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 text-xs font-bold">Remove</button>` : ''}</div></article>`).join('') || '<p class="md:col-span-2 xl:col-span-3 py-12 text-center text-slate-500">No add-ons created yet.</p>'}</div>
    </section>
  </div>`;
}

function selectMenuAddonIngredient(value) {
  const stock = (window._rawStocksList || []).find(item => item.name.trim().toLowerCase() === String(value || '').trim().toLowerCase());
  $c('menu-addon-stock').value = stock?.id || '';
  $c('menu-addon-usage-wrap')?.classList.toggle('hidden', !stock);
  if (!stock) return;
  const usageUnit = stock.usage_unit || stock.unit || 'unit';
  $c('menu-addon-qty-label').textContent = `Quantity used per add-on (${usageUnit})`;
  $c('menu-addon-conversion-note').textContent = `1 ${stock.unit} = ${Number(stock.conversion_factor || 1)} ${usageUnit}`;
  if (!$c('menu-addon-qty').value || Number($c('menu-addon-qty').value) <= 0) $c('menu-addon-qty').value = 1;
}

function filterMenuAddonCards(value) {
  const query = String(value || '').trim().toLowerCase();
  document.querySelectorAll('.menu-addon-card').forEach(card => card.classList.toggle('hidden', !card.dataset.search.includes(query)));
}

function editMenuAddon(id) { _editingMenuAddonId = Number(id); renderMenuAddons(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function cancelMenuAddonEdit() { _editingMenuAddonId = null; renderMenuAddons(null); }

async function openMenuAddonsPanel(editId = null) {
  showAppLoader('Opening add-ons', 'Loading reusable menu add-ons...');
  try {
    const [addons, stocks] = await Promise.all([api('/api/products/menu-addons'), api('/api/raw-stock')]);
    window._menuAddons = addons;
    window._rawStocksList = stocks;
    document.getElementById('menu-addons-modal')?.remove();
    const editing = addons.find(addon => Number(addon.id) === Number(editId));
    const modal = document.createElement('div');
    modal.id = 'menu-addons-modal';
    modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm';
    modal.innerHTML = `<div class="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
      <div class="flex items-start justify-between gap-4 mb-6"><div><h3 class="text-2xl font-black text-slate-900 dark:text-white">Menu Add-ons</h3><p class="text-xs text-slate-500 mt-1">Create once, then select the add-on for any product. Inventory is optional.</p></div><button onclick="this.closest('.fixed').remove()" class="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xl">×</button></div>
      ${currentUserHasPermission(editing ? 'products.update' : 'products.create') ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 mb-6">
        <input id="menu-addon-name" value="${escapeOrderValue(editing?.name || '')}" placeholder="Add-on name, e.g. Extra Cheese" class="px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold">
        <input id="menu-addon-price" type="number" min="0" step="0.01" value="${Number(editing?.price || 0)}" placeholder="Extra price" class="px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold">
        <select id="menu-addon-stock" onchange="$c('menu-addon-qty').disabled=!this.value" class="px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"><option value="">No inventory link (optional)</option>${stocks.map(stock => `<option value="${stock.id}" ${Number(editing?.raw_stock_id) === Number(stock.id) ? 'selected' : ''}>${escapeOrderValue(stock.name)}</option>`).join('')}</select>
        <input id="menu-addon-qty" type="number" min="0.0001" step="0.01" value="${Number(editing?.quantity || 0)}" ${editing?.raw_stock_id ? '' : 'disabled'} placeholder="Inventory quantity used" class="px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-50">
        <div class="sm:col-span-2 flex justify-end gap-2">${editing ? `<button onclick="openMenuAddonsPanel()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold">Cancel Edit</button>` : ''}<button id="save-menu-addon" onclick="saveMenuAddon(${editing?.id || 'null'})" class="px-5 py-2 rounded-xl bg-amber-500 text-white font-bold">${editing ? 'Update Add-on' : 'Add Add-on'}</button></div>
      </div>` : ''}
      <div class="space-y-2">${addons.map(addon => `<div class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"><div><strong class="text-sm text-slate-900 dark:text-white">${escapeOrderValue(addon.name)}</strong><p class="text-[11px] text-slate-500 mt-1">Rs. ${Number(addon.price).toLocaleString()} · ${addon.inventory_name ? `${escapeOrderValue(addon.inventory_name)} (${Number(addon.quantity)} used)` : 'No inventory linked'}</p></div><div class="flex gap-2">${currentUserHasPermission('products.update') ? `<button onclick="openMenuAddonsPanel(${addon.id})" class="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-xs font-bold">Edit</button>` : ''}${currentUserHasPermission('products.delete') ? `<button onclick="deleteMenuAddon(${addon.id})" class="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 text-xs font-bold">Remove</button>` : ''}</div></div>`).join('') || '<p class="py-10 text-center text-sm text-slate-500">No add-ons created yet.</p>'}</div>
    </div>`;
    document.body.appendChild(modal);
  } catch (error) { toast(error.message, 'error'); } finally { hideAppLoader(); }
}

async function saveMenuAddon(id) {
  const button = $c('save-menu-addon');
  if (button?.disabled) return;
  const rawStockId = $c('menu-addon-stock').value;
  const payload = { name: $c('menu-addon-name').value.trim(), price: Number($c('menu-addon-price').value), raw_stock_id: rawStockId ? Number(rawStockId) : null, quantity: rawStockId ? Number($c('menu-addon-qty').value) : 0 };
  if (!payload.name) return toast('Add-on name is required', 'error');
  button.disabled = true;
  showAppLoader(id ? 'Updating add-on' : 'Adding add-on', `Saving ${payload.name}...`);
  try {
    await api(id ? `/api/products/menu-addons/${id}` : '/api/products/menu-addons', id ? 'PUT' : 'POST', payload);
    toast(id ? 'Add-on updated' : 'Add-on added');
    hideAppLoader();
    if (_currentPage === 'menu-addons') { _editingMenuAddonId = null; await renderMenuAddons(null); }
    else await openMenuAddonsPanel();
  } catch (error) { toast(error.message, 'error'); button.disabled = false; hideAppLoader(); }
}

async function deleteMenuAddon(id) {
  if (!confirm('Remove this add-on? It will also be removed from products currently using it.')) return;
  showAppLoader('Removing add-on', 'Updating the menu add-on catalog...');
  try { await api(`/api/products/menu-addons/${id}`, 'DELETE'); toast('Add-on removed'); hideAppLoader(); if (_currentPage === 'menu-addons') { _editingMenuAddonId = null; await renderMenuAddons(null); } else await openMenuAddonsPanel(); }
  catch (error) { toast(error.message, 'error'); hideAppLoader(); }
}

function addStockProductVariant() {
  window._formStockVariants = window._formStockVariants || [];
  window._formStockVariants.push({
    name: '', sku: `VAR-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    barcode: '', buying_price: 0, selling_price: 0, stock: 0,
    min_stock_level: 0, is_default: window._formStockVariants.length === 0, is_on_menu: false
  });
  renderStockProductVariantsForm();
}

function updateStockProductVariant(index, field, value) {
  const variant = window._formStockVariants?.[index];
  if (!variant) return;
  if (['buying_price', 'selling_price', 'stock', 'min_stock_level'].includes(field)) variant[field] = Math.max(Number(value) || 0, 0);
  else if (['is_default', 'is_on_menu'].includes(field)) variant[field] = !!value;
  else variant[field] = value;
}

function setDefaultStockProductVariant(index) {
  (window._formStockVariants || []).forEach((variant, i) => { variant.is_default = i === index; });
  renderStockProductVariantsForm();
}

function removeStockProductVariant(index) {
  if ((window._formStockVariants || []).length <= 1) return toast('At least one stock variant is required', 'warning');
  window._formStockVariants.splice(index, 1);
  if (!window._formStockVariants.some(v => v.is_default)) window._formStockVariants[0].is_default = true;
  renderStockProductVariantsForm();
}

function renderStockProductVariantsForm() {
  const host = $c('pf-stock-variant-list');
  if (!host) return;
  host.innerHTML = (window._formStockVariants || []).map((variant, index) => `
    <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/40 space-y-3">
      <div class="grid grid-cols-12 gap-2">
        <label class="col-span-4 text-[10px] text-slate-500">Variant name<input value="${escapeOrderValue(variant.name)}" oninput="updateStockProductVariant(${index}, 'name', this.value)" placeholder="250ml, 500ml, 1 Liter" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <label class="col-span-4 text-[10px] text-slate-500">SKU<input value="${escapeOrderValue(variant.sku)}" oninput="updateStockProductVariant(${index}, 'sku', this.value)" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <label class="col-span-3 text-[10px] text-slate-500">Barcode<input value="${escapeOrderValue(variant.barcode || '')}" oninput="updateStockProductVariant(${index}, 'barcode', this.value)" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <button type="button" onclick="removeStockProductVariant(${index})" class="col-span-1 text-rose-500">×</button>
      </div>
      <div class="grid grid-cols-12 gap-2 items-end">
        <label class="col-span-2 text-[10px] text-slate-500">Cost<input type="number" min="0" step="0.01" value="${Number(variant.buying_price || 0)}" oninput="updateStockProductVariant(${index}, 'buying_price', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <label class="col-span-2 text-[10px] text-slate-500">Selling price<input type="number" min="0.01" step="0.01" value="${Number(variant.selling_price || 0)}" oninput="updateStockProductVariant(${index}, 'selling_price', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <label class="col-span-2 text-[10px] text-slate-500">Stock<input type="number" min="0" step="1" value="${Number(variant.stock || 0)}" oninput="updateStockProductVariant(${index}, 'stock', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <label class="col-span-2 text-[10px] text-slate-500">Min stock<input type="number" min="0" step="1" value="${Number(variant.min_stock_level || 0)}" oninput="updateStockProductVariant(${index}, 'min_stock_level', this.value)" class="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" /></label>
        <label class="col-span-2 flex items-center gap-2 text-[10px] font-bold text-slate-500"><input type="radio" name="pf-default-stock-variant" ${variant.is_default ? 'checked' : ''} onchange="setDefaultStockProductVariant(${index})"> Default</label>
        ${variant.id ? `<label class="col-span-2 flex items-center gap-2 text-[10px] font-bold text-emerald-600"><input type="checkbox" ${variant.is_on_menu ? 'checked' : ''} onchange="updateStockProductVariant(${index}, 'is_on_menu', this.checked)"> On Menu</label>` : '<span class="col-span-2 text-[10px] font-bold text-slate-400">Publish after saving</span>'}
      </div>
    </div>`).join('');
}

function openAddProduct() {
  if (currentUser.shop_type !== 'restaurant') return openAddProductForm('stock_based');
  openModal('Choose Product Type', `
    <div class="py-8">
      <p class="text-center text-sm text-slate-500 dark:text-slate-400 mb-8">Choose how this menu item consumes inventory.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
        <button type="button" onclick="openAddProductForm('recipe_based')" class="group p-7 rounded-3xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 hover:border-emerald-500 hover:-translate-y-1 transition-all text-left">
          <span class="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-5"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5h16M6 5l1 15h10l1-15M9 9v7m6-7v7M8 2h8"/></svg></span>
          <span class="block text-xl font-black text-slate-900 dark:text-white">Recipe-Based</span>
          <span class="block mt-2 text-xs leading-relaxed text-slate-500">Prepared from ingredients. Costs are calculated automatically for each required size.</span>
        </button>
        <button type="button" onclick="closeModal(); navigate('raw-stock')" class="group p-7 rounded-3xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 hover:border-indigo-500 hover:-translate-y-1 transition-all text-left">
          <span class="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-5"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg></span>
          <span class="block text-xl font-black text-slate-900 dark:text-white">Cost/Stock-Based</span>
          <span class="block mt-2 text-xs leading-relaxed text-slate-500">Purchased finished products are created in Inventory, then published to Menu by variant.</span>
        </button>
      </div>
    </div>`, 'max-w-4xl');
}

async function openAddProductForm(productType) {
  let brands = window._productBrands || (await api("/api/brands"));
  window._menuAddons = await api('/api/products/menu-addons');

  // GET /api/brands auto-creates a default brand if none exist
  if (!brands.length) {
    return toast("Failed to load brands. Please refresh and try again.", "error");
  }

  window._formComponents = [];
  window._productFormRequestId = (window.crypto?.randomUUID?.() || `product-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  window._formProductType = productType === 'recipe_based' ? 'recipe_based' : 'stock_based';
  if (window._formProductType === 'recipe_based') {
    const rawStocks = await api('/api/raw-stock');
    window._rawStocksList = Array.isArray(rawStocks) ? rawStocks : [];
    window._formVariants = ['Small', 'Medium', 'Large', 'Extra Large'].map((name, index) => ({
      id: newMenuOptionId('variant'), name, price: 0, is_default: index === 0, ingredients: []
    }));
    window._formAddons = [];
    window._formStockVariants = [];
  } else {
    window._formVariants = [];
    window._formAddons = [];
    window._formStockVariants = [{
      name: 'Regular', sku: `VAR-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      barcode: '', buying_price: 0, selling_price: 0, stock: 0,
      min_stock_level: 0, is_default: true, is_on_menu: false
    }];
  }
  window.ProductImageTools?.resetState?.();
  const randomSku = 'SKU-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  openModal(
    "Add Product",
    productFormHtml({ sku: randomSku, product_type: window._formProductType }, brands) +
    `<button id="product-save-button" type="button" onclick="saveProduct()" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 text-white font-medium transition-all">Save Product</button>`,
    "max-w-4xl",
  );
  renderFormCompositionList();
  renderProductVariantsForm();
  renderProductAddonsForm();
  renderStockProductVariantsForm();

  const buyEl = document.getElementById("pf-buy");
  const sellEl = document.getElementById("pf-sell");
  if (buyEl) buyEl.addEventListener("input", recalculateComponentPrices);
  if (sellEl) sellEl.addEventListener("input", recalculateComponentPrices);
}

async function openEditProduct(id) {
  const brands = window._productBrands || (await api("/api/brands"));
  window._menuAddons = await api('/api/products/menu-addons');
  const product = allProducts.find((p) => p.id === id) || {};
  window.ProductImageTools?.resetState?.();

  if (currentUser.shop_type === 'restaurant') {
    window._formProductType = product.product_type === 'recipe_based' || (product.variants && product.variants.length) ? 'recipe_based' : 'stock_based';
    if (window._formProductType === 'recipe_based') {
      const rawStocks = await api('/api/raw-stock');
      window._rawStocksList = Array.isArray(rawStocks) ? rawStocks : [];
      window._formVariants = (product.variants && product.variants.length)
        ? JSON.parse(JSON.stringify(product.variants))
        : [{ id: newMenuOptionId('variant'), name: 'Regular', price: Number(product.selling_price || 0), is_default: true, ingredients: (product.ingredients || []).map(i => ({ raw_stock_id: i.id, quantity: Number(i.quantity) })) }];
      window._formAddons = JSON.parse(JSON.stringify(product.addons || []));
      window._formStockVariants = [];
    } else {
      window._formVariants = [];
      window._formAddons = [];
      window._formStockVariants = (product.stock_variants || []).length
        ? JSON.parse(JSON.stringify(product.stock_variants))
        : [{ name: 'Regular', sku: product.sku, barcode: product.barcode || '', buying_price: Number(product.buying_price || 0), selling_price: Number(product.selling_price || 0), stock: Number(product.stock || 0), min_stock_level: Number(product.min_stock_level || 0), is_default: true, is_on_menu: true }];
    }
  }

  // Decide what to load into form components
  if (currentUser.shop_type === 'restaurant' && product.ingredients) {
    window._formComponents = product.ingredients.map(i => ({ ...i, is_ingredient: true, raw_stock_id: i.id }));
  } else {
    window._formComponents = product.components ? product.components.map(c => ({ ...c, is_ingredient: false })) : [];
  }

  openModal(
    "Edit Product",
    productFormHtml(product, brands) +
    `<button id="product-save-button" type="button" onclick="saveProduct(${id})" class="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 text-white font-medium transition-all">Update Product</button>`,
    "max-w-4xl",
  );
  recalculateComponentPrices(); // To handle readOnly/hidden states
  renderFormCompositionList();
  renderProductVariantsForm();
  renderProductAddonsForm();
  renderStockProductVariantsForm();

  // Attach redistribution listeners
  const buyEl = document.getElementById("pf-buy");
  const sellEl = document.getElementById("pf-sell");
  if (buyEl) buyEl.addEventListener("input", recalculateComponentPrices);
  if (sellEl) sellEl.addEventListener("input", recalculateComponentPrices);
}

async function saveProduct(id) {
  if (window._productSaveInProgress) return;

  window._productSaveInProgress = true;
  const saveButton = document.getElementById('product-save-button');
  const idleButtonLabel = id ? 'Update Product' : 'Save Product';
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.setAttribute('aria-busy', 'true');
    saveButton.textContent = id ? 'Updating Product...' : 'Saving Product...';
  }

  try {
    const isRestaurant = currentUser.shop_type === 'restaurant';
    const productType = $c('pf-product-type')?.value === 'recipe_based' ? 'recipe_based' : 'stock_based';
    const isRecipeProduct = isRestaurant && productType === 'recipe_based';
    const components = (isRestaurant) ? [] : (window._formComponents || []);
    const ingredients = [];
    const variants = isRecipeProduct ? (window._formVariants || []) : [];
    const addons = isRecipeProduct ? (window._formAddons || []) : [];
    const stockVariants = !isRecipeProduct && isRestaurant ? (window._formStockVariants || []) : [];

    if (isRecipeProduct) {
      if (!variants.length) return toast('At least one variant is required', 'error');
      if (variants.some(v => !v.name.trim() || Number(v.price) <= 0)) return toast('Every variant needs a name and selling price greater than zero', 'error');
      const variantNames = variants.map(v => v.name.trim().toLowerCase());
      if (new Set(variantNames).size !== variantNames.length) return toast('Variant names must be unique', 'error');
      if (variants.some(v => (v.ingredients || []).some(i => !i.raw_stock_id || Number(i.quantity) <= 0))) return toast('Every variant ingredient needs a valid quantity', 'error');
      if (addons.some(a => !a.name.trim() || Number(a.price) < 0 || (a.raw_stock_id && Number(a.quantity) <= 0))) return toast('Every add-on needs a name, valid price, and inventory quantity when inventory is linked', 'error');
      const addonNames = addons.map(a => a.name.trim().toLowerCase());
      if (new Set(addonNames).size !== addonNames.length) return toast('Add-on names must be unique', 'error');
      if (!variants.some(v => v.is_default)) variants[0].is_default = true;
    }
    if (!isRecipeProduct && isRestaurant) {
      if (!stockVariants.length) return toast('At least one stock variant is required', 'error');
      if (stockVariants.some(v => !v.name.trim() || !v.sku.trim() || Number(v.selling_price) <= 0)) return toast('Every stock variant needs a name, SKU, and selling price', 'error');
      const names = stockVariants.map(v => v.name.trim().toLowerCase());
      const skus = stockVariants.map(v => v.sku.trim().toLowerCase());
      if (new Set(names).size !== names.length || new Set(skus).size !== skus.length) return toast('Stock variant names and SKUs must be unique', 'error');
      if (!stockVariants.some(v => v.is_default)) stockVariants[0].is_default = true;
    }

    const imageFile = window.ProductImageTools
      ? await window.ProductImageTools.getUploadFile()
      : document.getElementById('pf-image')?.files?.[0];

    const sku = $c("pf-sku").value.trim();
    const name = $c("pf-name").value.trim();
    const category = $c("pf-category").value.trim();

    if (!sku || !category || !name) return toast("SKU, Category, and Name required", "error");
    let brand_id = parseInt($c("pf-brand").value);
    if (!brand_id) {
      // Auto-resolve: fetch brands and use first one
      try {
        const brands = await api("/api/brands");
        if (brands && brands.length > 0) {
          brand_id = brands[0].id;
          window._productBrands = brands;
        } else {
          return toast("No brands available. Contact an administrator.", "error");
        }
      } catch (e) {
        return toast("Could not load brands. Try again.", "error");
      }
    }

    const formData = new FormData();
    formData.append('sku', sku);
    formData.append('name', name);
    formData.append('category', category);
    formData.append('description', $c("pf-desc").value.trim());
    formData.append('product_type', productType);
    formData.append('brand_id', brand_id);
    if (document.getElementById("pf-barcode")) formData.append('barcode', document.getElementById("pf-barcode").value.trim());
    const defaultVariant = variants.find(v => v.is_default) || variants[0];
    const defaultStockVariant = stockVariants.find(v => v.is_default) || stockVariants[0];
    formData.append('buying_price', isRecipeProduct ? 0 : (isRestaurant ? Number(defaultStockVariant?.buying_price || 0) : (parseFloat($c("pf-buy").value) || 0)));
    formData.append('selling_price', isRecipeProduct ? Number(defaultVariant.price) : (isRestaurant ? Number(defaultStockVariant?.selling_price || 0) : (parseFloat($c("pf-sell").value) || 0)));
    formData.append('stock', isRecipeProduct ? 0 : (isRestaurant ? stockVariants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0) : (parseInt($c("pf-stock").value) || 0)));
    formData.append('min_stock_level', isRestaurant ? 0 : (parseInt($c("pf-min-stock").value) || 0));
    formData.append('components', JSON.stringify(components));
    formData.append('ingredients', JSON.stringify(ingredients));
    formData.append('variants', JSON.stringify(variants));
    formData.append('addons', JSON.stringify(addons));
    formData.append('stock_variants', JSON.stringify(stockVariants));
    if (!id && window._productFormRequestId) formData.append('client_request_id', window._productFormRequestId);
    if (imageFile) formData.append('image', imageFile);

    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { method, body: formData });

    let r;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      r = await res.json();
    } else {
      const errorText = await res.text();
      throw new Error(`Server returned non-JSON response (${res.status}): ${errorText.substring(0, 100)}...`);
    }

    if (!res.ok || r.error) return toast(r.error || 'Error saving product', 'error');

    closeModal();
    toast("Product saved successfully!");
    if (productType === 'stock_based' && currentUser.shop_type === 'restaurant') {
      navigate('raw-stock');
    } else {
      renderProducts();
    }
  } catch (err) {
    console.error("[CRITICAL] saveProduct failed:", err);
    toast("Error: " + err.message, "error");
  } finally {
    window._productSaveInProgress = false;
    const currentSaveButton = document.getElementById('product-save-button');
    if (currentSaveButton) {
      currentSaveButton.disabled = false;
      currentSaveButton.removeAttribute('aria-busy');
      currentSaveButton.textContent = idleButtonLabel;
    }
  }
}

async function addComponentToForm(isIngredient = false) {
  if (isIngredient) {
    const stocks = await api("/api/raw-stock");
    if (!stocks.length) return toast("Add Raw Ingredients first!", "error");
    window._formComponents.push({
      raw_stock_id: stocks[0].id,
      name: stocks[0].name,
      quantity: 1,
      cost: stocks[0].buying_price,
      unit: stocks[0].unit,
      usage_unit: stocks[0].usage_unit || stocks[0].unit,
      conversion_factor: stocks[0].conversion_factor || 1,
      is_ingredient: true
    });
    window._rawStocksList = stocks; // Cache for dropdown
  } else {
    window._formComponents.push({ name: "", quantity: 1, price: 0, cost: 0, is_ingredient: false });
  }
  recalculateComponentPrices();
  renderFormCompositionList();
}

function removeComponentFromForm(idx) {
  window._formComponents.splice(idx, 1);
  recalculateComponentPrices();
  renderFormCompositionList();
}

function updateComponentQtyInForm(index, qty) {
  const comp = window._formComponents[index];
  if (comp) comp.quantity = parseFloat(qty) || 1;
  recalculateComponentPrices();
}

function updateComponentNameInForm(index, name) {
  const comp = window._formComponents[index];
  if (comp) comp.name = name;
}

function updateComponentPriceInForm(index, price) {
  const comp = window._formComponents[index];
  if (comp) comp.price = parseFloat(price) || 0;
}

function updateIngredientInForm(index, rawStockId) {
  const comp = window._formComponents[index];
  const stock = window._rawStocksList.find(s => s.id == rawStockId);
  if (comp && stock) {
    comp.raw_stock_id = stock.id;
    comp.name = stock.name;
    comp.cost = stock.buying_price;
    comp.unit = stock.unit;
    comp.usage_unit = stock.usage_unit || stock.unit;
    comp.conversion_factor = stock.conversion_factor || 1;
    recalculateComponentPrices();
  }
}

function recalculateComponentPrices() {
  const buyEl = document.getElementById("pf-buy");
  const sellEl = document.getElementById("pf-sell");
  const stockCont = document.getElementById('pricing-stock-container');
  const minStockCont = document.getElementById('pricing-min-stock-container');

  if (!buyEl || !sellEl) return;

  const isRestaurant = currentUser.shop_type === 'restaurant';
  const components = window._formComponents || [];
  const count = components.length;

  if (isRestaurant) {
    let totalCost = 0;
    components.forEach(c => {
      const lineCost = (c.cost || 0) / (c.conversion_factor || 1);
      totalCost += lineCost * (c.quantity || 0);
    });
    if (count > 0) {
      buyEl.value = totalCost.toFixed(2);
      buyEl.readOnly = true;
      buyEl.classList.add('bg-slate-100', 'dark:bg-slate-800', 'cursor-not-allowed');
    } else {
      buyEl.readOnly = false;
      buyEl.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'cursor-not-allowed');
    }

    // Hide stock fields for recipe items
    if (stockCont) stockCont.classList.toggle('hidden', count > 0);
    if (minStockCont) minStockCont.classList.toggle('hidden', count > 0);

  } else {
    if (count === 0) return;
    const parentBuy = parseFloat(buyEl.value) || 0;
    const parentSell = parseFloat(sellEl.value) || 0;

    const shareBuy = parentBuy / count;
    const shareSell = parentSell / count;

    components.forEach((c, idx) => {
      // Auto-define price based on parent / quantity
      const qty = parseFloat(c.quantity) || 1;
      c.cost = Number((shareBuy / qty).toFixed(2));
      c.price = Number((shareSell / qty).toFixed(2));

      // Direct DOM Update to prevent focus loss
      const costEl = document.getElementById(`comp-cost-${idx}`);
      const priceEl = document.getElementById(`comp-price-${idx}`);
      if (costEl) costEl.value = c.cost;
      if (priceEl) priceEl.value = c.price;
    });
  }
}

function renderFormCompositionList() {
  const el = $c("pf-comp-list");
  if (!el) return;
  const isRestaurant = currentUser.shop_type === 'restaurant';

  if (!window._formComponents.length) {
    const msg = isRestaurant ? 'Click "+ Add Ingredient" to start building your recipe' : 'Click "+ Add Component" to start building your bundle';
    el.innerHTML = `<div class="p-6 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-xs text-slate-400 italic">${msg}</div>`;
    return;
  }

  el.innerHTML = window._formComponents
    .map(
      (c, idx) => `
    <div class="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800 group relative">
      <div class="grid grid-cols-12 gap-2 items-end">
        ${isRestaurant
          ? `<!-- Ingredient Selector -->
             <div class="col-span-12 sm:col-span-10">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Ingredient</label>
                <select onchange="updateIngredientInForm(${idx}, this.value)" class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none">
                    ${(window._rawStocksList || []).map(s => `<option value="${s.id}" ${s.id == c.raw_stock_id ? 'selected' : ''}>${s.name} (Rs. ${s.buying_price}/${s.unit})</option>`).join('')}
                </select>
             </div>`
          : `<!-- Part Name (Free Text) -->
             <div class="col-span-12 sm:col-span-5">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Part Name</label>
                <input type="text" value="${c.name || ""}" oninput="updateComponentNameInForm(${idx}, this.value)" placeholder="e.g. SSD 256GB"
                   class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold focus:border-indigo-500 outline-none" />
             </div>
             <!-- Cost -->
             <div class="col-span-4 sm:col-span-2">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Unit Cost</label>
                <input id="comp-cost-${idx}" type="number" value="${c.cost || 0}" readonly
                   class="w-full px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none text-rose-500 cursor-not-allowed" />
             </div>
             <!-- Price -->
             <div class="col-span-4 sm:col-span-3">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Unit Price (Sell)</label>
                <input id="comp-price-${idx}" type="number" value="${c.price || 0}" min="0" oninput="updateComponentPriceInForm(${idx}, this.value)"
                   class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold focus:border-indigo-500 outline-none text-indigo-500" />
             </div>`
        }

        <!-- Qty -->
        <div class="col-span-6 sm:col-span-2">
           <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1 block">Qty (${isRestaurant ? (c.usage_unit || c.unit || "unit") : (c.unit || "unit")})</label>
           <input type="number" value="${c.quantity || 1}" step="0.01" min="0.01" oninput="updateComponentQtyInForm(${idx}, this.value)"
              class="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-center focus:border-indigo-500 outline-none" />
        </div>

        <!-- Delete -->
        <div class="col-span-6 ${isRestaurant ? 'sm:col-span-12' : 'sm:col-span-2'} flex justify-end">
          <button onclick="removeComponentFromForm(${idx})" class="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all opacity-0 group-hover:opacity-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function removeComponentFromForm(idx) {
  window._formComponents.splice(idx, 1);
  renderFormCompositionList();
}

function adjustStock(id, name, current, buyingPrice) {
  openModal(
    `Stock: ${name}`,
    `
    <div class="space-y-4">
      <p class="text-slate-400 text-sm">Current stock: <strong class="text-white">${current}</strong></p>
      
      <div>
        <label class="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">Adjust by (use negative to reduce)</label>
        <input id="stock-delta" type="number" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" />
      </div>

      <div>
        <label class="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">Batch Buying Price (Rs.)</label>
        <input id="stock-buying-price" type="number" value="${buyingPrice || 0}" class="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 focus:outline-none focus:border-emerald-500 transition-all font-bold text-lg" />
        <p class="text-[10px] text-slate-500 mt-1 italic">When adding stock, this will create a new batch with this cost.</p>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="doAdjustStock(${id},1)" class="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-50 text-white hover:text-emerald-700 font-bold transition-all shadow-lg shadow-emerald-900/10">Add Stock</button>
        <button onclick="doAdjustStock(${id},-1)" class="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-50 text-white hover:text-rose-700 font-bold transition-all shadow-lg shadow-rose-900/10">Remove Stock</button>
      </div>
    </div>`,
  );
}

async function doAdjustStock(id, sign) {
  const delta = parseInt($c("stock-delta").value) * sign;
  const buyingPrice = parseFloat($c("stock-buying-price").value) || 0;

  const r = await api(`/api/products/${id}/stock`, "PATCH", { delta, buying_price: buyingPrice });
  if (r.error) return toast(r.error, "error");
  closeModal();
  toast(`Stock updated for ${id}`);
  renderProducts();
}

// ─── Damage Management ────────────────────────────────────────────────
async function toggleDamageAutoCalc(cb) {
  try {
    const autoCalc = cb.checked;
    const r = await api("/api/shop-settings", "POST", {
      auto_calculate_damage_to_loss: autoCalc
    });
    if (r.error) {
      cb.checked = !autoCalc;
      return toast(r.error, "error");
    }
    toast(`Auto calculation ${autoCalc ? "enabled" : "disabled"}`);
    // Update local settings if exists
    if (_receiptSettings) _receiptSettings.auto_calculate_damage_to_loss = autoCalc ? 1 : 0;
  } catch (e) {
    cb.checked = !cb.checked;
    toast("Error updating settings", "error");
  }
}

function openLossPopup(productId, productName) {
  if (typeof showWasteLogModal === "function") {
    return showWasteLogModal({
      source_type: "product",
      product_id: productId,
      title: productName
    });
  }

  openModal(
    `Report Loss: ${productName}`,
    `
    <div class="space-y-6 p-2">
      <div class="p-4 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/50">
        <p class="text-[10px] font-black text-rose-800 dark:text-rose-200 uppercase tracking-[0.2em] mb-1">Loss Management</p>
        <p class="text-xs text-rose-700/70 dark:text-rose-400/70 italic">Record inventory damage and wastage.</p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Number of Units Lost</label>
          <input id="loss-count" type="number" min="0" value="1" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 focus:border-rose-500 transition-all outline-none font-bold text-xl" />
        </div>

        ${(() => {
      const product = allProducts.find(p => p.id === productId);
      if (!product || !product.batches || product.batches.length === 0) return '';

      return `
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Select Batch to Deduct From</label>
            <select id="loss-batch-id" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 focus:border-indigo-500 transition-all outline-none font-bold text-sm">
              ${product.batches.map(b => `<option value="${b.id}">Cost: Rs. ${b.buying_price} (Available: ${b.quantity})</option>`).join('')}
            </select>
          </div>
          `;
    })()}

        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Additional Loss Amount (Optional, Rs.)</label>
          <input id="loss-manual-amount" type="number" min="0" value="0" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 focus:border-rose-500 transition-all outline-none font-bold text-xl" />
        </div>
      </div>

      <button onclick="submitLoss(${productId})" class="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
         Confirm Loss Record
      </button>
    </div>
  `,
    "max-w-md"
  );
}

async function submitLoss(productId) {
  const count = parseInt($c("loss-count").value) || 0;
  const manualLoss = parseFloat($c("loss-manual-amount").value) || 0;
  const batchId = $c("loss-batch-id") ? parseInt($c("loss-batch-id").value) : null;

  if (count <= 0 && manualLoss <= 0) return toast("Quantity or Loss Amount must be provided", "error");

  try {
    const r = await api(`/api/products/${productId}/damage/loss`, "PATCH", {
      damage_count: count,
      manual_loss_amount: manualLoss,
      batch_id: batchId
    });

    if (r.error) return toast(r.error, "error");

    toast("Loss recorded successfully!");
    closeModal();
    renderProducts();
  } catch (e) {
    toast("Network error", "error");
  }
}

function openRecoveryPopup(productId, productName, currentDamageStock) {
  openModal(
    `Report Recovery: ${productName}`,
    `
    <div class="space-y-6 p-2">
      <div class="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
        <p class="text-[10px] font-black text-emerald-800 dark:text-emerald-200 uppercase tracking-[0.2em] mb-1">Salvage & Recovery</p>
        <p class="text-xs text-emerald-700/70 dark:text-emerald-400/70 italic">Current Damaged Pool: <b>${currentDamageStock} units</b></p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Units Recovered (Back to Stock)</label>
          <input id="recovery-count" type="number" min="0" max="${currentDamageStock}" value="0" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 transition-all outline-none font-bold text-xl" />
        </div>

        ${(() => {
      const product = allProducts.find(p => p.id === productId);
      if (!product || !product.batches) return '';
      const damagedBatches = product.batches.filter(b => (b.damaged_quantity || 0) > 0);
      if (damagedBatches.length === 0) return '';

      return `
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Recover From Which Batch?</label>
            <select id="recovery-batch-id" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 focus:border-indigo-500 transition-all outline-none font-bold text-sm">
              ${damagedBatches.map(b => `<option value="${b.id}">Cost: Rs. ${b.buying_price} (${b.damaged_quantity} units damaged)</option>`).join('')}
            </select>
          </div>
          `;
    })()}

        <div class="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <input id="recovery-restock" type="checkbox" checked class="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
          <label for="recovery-restock" class="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">Add recovered units back to saleable stock?</label>
        </div>

        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Cash Recovered Amount (Rs.)</label>
          <input id="recovery-amount" type="number" min="0" value="0" 
                 class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 transition-all outline-none font-bold text-xl" />
        </div>
      </div>

      <button onclick="submitRecovery(${productId})" class="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/30 transition-all active:scale-95 flex items-center justify-center gap-2">
         Confirm Recovery Record
      </button>
    </div>
  `,
    "max-w-md"
  );
}

async function submitRecovery(productId) {
  const count = parseInt($c("recovery-count").value) || 0;
  const amount = parseFloat($c("recovery-amount").value) || 0;
  const batchId = $c("recovery-batch-id") ? parseInt($c("recovery-batch-id").value) : null;
  const isRestocking = $c("recovery-restock").checked;

  if (count <= 0 && amount <= 0) return toast("Recovery quantity or cash must be provided", "error");

  try {
    const r = await api(`/api/products/${productId}/damage/recovery`, "PATCH", {
      recovery_count: count,
      recovery_amount: amount,
      batch_id: batchId,
      is_restocking: isRestocking
    });

    if (r.error) return toast(r.error, "error");

    toast("Recovery recorded successfully!");
    closeModal();
    renderProducts();
  } catch (e) {
    toast("Network error", "error");
  }
}

// ─── POS ─────────────────────────────────────────────────────────────
function getPOSLayout() {
  return localStorage.getItem("pos_layout") === "split" ? "split" : "cards";
}

function capturePOSLayoutState() {
  const ids = [
    "pos-table", "pos-waiter", "pos-rider", "pos-delivery-addr",
    "pos-token", "pos-discount", "pos-discount-preset", "pos-tax", "pos-tax-preset",
    "pos-method", "pos-received", "pos-cust-name", "pos-cust-phone"
  ];
  const values = {};
  ids.forEach((id) => {
    const el = $c(id);
    if (el) values[id] = el.value;
  });
  return {
    values,
    orderType: window._posOrderType,
    quotation: !!$c("pos-is-quotation")?.checked,
    deliveryMoneyReceived: !!$c("delivery-money-received")?.checked,
    selectedCustomer: _posSelectedCustomer
  };
}

async function setPOSLayout(layout) {
  const nextLayout = layout === "split" ? "split" : "cards";
  if (getPOSLayout() === nextLayout) return;
  window._posLayoutRestore = {
    cart: cart.slice(),
    form: capturePOSLayoutState()
  };
  localStorage.setItem("pos_layout", nextLayout);
  await renderPOS();
}

function setPOSTerminalTopNavHidden(hidden) {
  const topNav = document.getElementById('top-nav');
  const mainContent = document.querySelector('main');
  if (topNav) topNav.classList.toggle('hidden', hidden);
  if (mainContent) {
    mainContent.classList.toggle('pt-20', !hidden);
    mainContent.classList.toggle('pt-4', hidden);
  }
}

function renderPOSLanding() {
  setPOSTerminalTopNavHidden(false);
  const canCreateOrders = currentUserHasPermission('orders.create');
  const canViewOrders = currentUserHasPermission('orders.view');
  $c("page-content").innerHTML = `
    <div class="min-h-[calc(100vh-7rem)] flex items-center justify-center px-4">
      <div class="w-full max-w-2xl text-center">
        <h2 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Ready to take an order?</h2>
        <p class="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">Start a new restaurant order or open the existing orders view.</p>
        <div class="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
          ${canCreateOrders ? `<button type="button" onclick="showPOSOrderTypeChooser()" class="group p-7 rounded-3xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/25 transition-all hover:-translate-y-0.5 active:translate-y-0 text-left">
            <span class="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-5">
              <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffffff" fill-opacity=".18"/><path d="M12 7v10M7 12h10" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/></svg>
            </span>
            <span class="block text-xl font-black">New Order</span>
            <span class="block mt-1 text-xs font-semibold text-indigo-100">Choose dine-in, takeaway, or delivery</span>
          </button>` : ''}
          ${canViewOrders ? `<button type="button" onclick="openPOSOrdersView()" class="group p-7 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-violet-500 hover:shadow-xl hover:shadow-violet-500/10 transition-all hover:-translate-y-0.5 active:translate-y-0 text-left">
            <span class="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center mb-5">
              <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="3" fill="#8b5cf6" fill-opacity=".16"/><path d="M9 9h6M9 13h6M9 17h4" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round"/><path d="M9 4.5h6" stroke="#c4b5fd" stroke-width="2.5" stroke-linecap="round"/></svg>
            </span>
            <span class="block text-xl font-black text-slate-900 dark:text-white">View Orders</span>
            <span class="block mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Open the Orders screen already inside POS</span>
          </button>` : ''}
        </div>
      </div>
    </div>`;
  // Warm the shared POS data while the user chooses an action.
  void loadPOSBootstrapData();
}

function currentUserHasPermission(permission) {
  if (currentUser?.role === 'superadmin') return true;
  return Array.isArray(currentUser?.permissions) && currentUser.permissions.includes(permission);
}

let _posBootstrapCache = null;
let _posBootstrapCachedAt = 0;
function loadPOSBootstrapData() {
  if (_posBootstrapCache && Date.now() - _posBootstrapCachedAt < 30000) return _posBootstrapCache;
  _posBootstrapCachedAt = Date.now();
  _posBootstrapCache = Promise.all([
    api(`/api/products?paginate=1&page=1&page_size=${POS_PRODUCTS_PER_PAGE}&menu_only=1&exclude_components=1`),
    api("/api/tables").catch(() => []), api("/api/users/assignable").catch(() => []),
    api("/api/tables/floors").catch(() => []), api("/api/shop-settings/discounts").catch(() => []), api("/api/shop-settings/taxes").catch(() => [])
  ]).catch(error => { _posBootstrapCache = null; throw error; });
  return _posBootstrapCache;
}

function showAppLoader(title = 'Please wait', detail = 'Processing your request...') {
  document.getElementById('app-action-loader')?.remove();
  const loader = document.createElement('div');
  loader.id = 'app-action-loader';
  loader.className = 'fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm animate-in fade-in duration-150';
  loader.innerHTML = `<div class="mx-4 w-full max-w-xs rounded-3xl border border-white/50 bg-white/95 p-7 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900/95"><div class="relative mx-auto h-16 w-16"><div class="absolute inset-0 rounded-full border-4 border-indigo-100 dark:border-indigo-950"></div><div class="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-600 border-r-violet-500"></div><div class="absolute inset-[18px] rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/30"></div></div><p class="mt-5 text-lg font-black text-slate-950 dark:text-white">${escapeOrderValue(title)}</p><p class="mt-1 text-xs font-bold text-slate-500">${escapeOrderValue(detail)}</p><div class="mx-auto mt-5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div class="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-indigo-600 to-violet-500"></div></div></div>`;
  document.body.appendChild(loader);
}

function hideAppLoader() {
  const loader = document.getElementById('app-action-loader');
  if (!loader) return;
  loader.classList.add('opacity-0');
  setTimeout(() => loader.remove(), 150);
}

async function withAppLoader(title, detail, action) {
  showAppLoader(title, detail);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try { return await action(); } finally { hideAppLoader(); }
}

function showPOSOrderTypeChooser() {
  setPOSTerminalTopNavHidden(false);
  if (!currentUserHasPermission('orders.create')) return toast('You do not have permission to create orders.', 'error');
  // Warm the shared POS data while the user is choosing an order type.
  loadPOSBootstrapData().catch(() => {});
  $c("page-content").innerHTML = `
    <div class="min-h-[calc(100vh-7rem)] flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-4xl">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Select Order Type</h2>
          <p class="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">Choose how this order will be served.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <button type="button" onclick="startPOSOrder('dine_in')" class="group p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all text-center">
            <span class="mx-auto w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg class="w-12 h-12" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="25" cy="25" r="14" fill="#c7d2fe"/><circle cx="25" cy="25" r="9" fill="#ffffff"/><path d="M10 8v13M6 8v8c0 3 2 5 4 5s4-2 4-5V8M10 21v19M39 8c-5 4-6 12-3 17h3v15" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="block mt-5 text-xl font-black text-slate-900 dark:text-white">Dine-in</span>
            <span class="block mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Table, waiter, and kitchen service</span>
          </button>
          <button type="button" onclick="startPOSOrder('takeaway')" class="group p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-amber-500 hover:shadow-2xl hover:shadow-amber-500/10 transition-all text-center">
            <span class="mx-auto w-20 h-20 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg class="w-12 h-12" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 17h24l-3 23H15l-3-23Z" fill="#fde68a"/><path d="M16 17c0-6 3-9 8-9s8 3 8 9" stroke="#d97706" stroke-width="3" stroke-linecap="round"/><path d="M12 17h24l-3 23H15l-3-23Z" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round"/><path d="M20 25h8" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/></svg>
            </span>
            <span class="block mt-5 text-xl font-black text-slate-900 dark:text-white">Takeaway</span>
            <span class="block mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Counter pickup and token service</span>
          </button>
          <button type="button" onclick="startPOSOrder('delivery')" class="group p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all text-center">
            <span class="mx-auto w-20 h-20 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg class="w-12 h-12" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 13h24v21H6z" fill="#a7f3d0"/><path d="M30 21h7l6 7v6H30V21Z" fill="#6ee7b7"/><path d="M6 13h24v21H6V13Zm24 8h7l6 7v6H30V21Z" stroke="#059669" stroke-width="3" stroke-linejoin="round"/><circle cx="15" cy="36" r="4" fill="#ffffff" stroke="#047857" stroke-width="3"/><circle cx="37" cy="36" r="4" fill="#ffffff" stroke="#047857" stroke-width="3"/><path d="M34 25h5" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/></svg>
            </span>
            <span class="block mt-5 text-xl font-black text-slate-900 dark:text-white">Delivery</span>
            <span class="block mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Customer address and rider service</span>
          </button>
        </div>
        <div class="mt-7 text-center">
          <button type="button" onclick="renderPOSLanding()" class="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Back</button>
        </div>
      </div>
    </div>`;
}

async function startPOSOrder(orderType) {
  if (!currentUserHasPermission('orders.create')) return toast('You do not have permission to create orders.', 'error');
  const allowedTypes = ['dine_in', 'takeaway', 'delivery'];
  if (!allowedTypes.includes(orderType)) return;
  const labels = { dine_in: ['Opening dine-in', 'Loading your floor and available tables...'], takeaway: ['Opening takeaway', 'Preparing the counter order screen...'], delivery: ['Opening delivery', 'Loading customers, riders, and menu...'] };
  const [title, detail] = labels[orderType];
  return withAppLoader(title, detail, async () => {
    if (orderType === 'dine_in') return renderPOSTableSelection();
    window._posSelectedTableId = null;
    window._posEntryOrderType = orderType;
    await renderPOS();
  });
}

async function renderPOSTableSelection() {
  setPOSTerminalTopNavHidden(false);
  if (!currentUserHasPermission('orders.create')) return toast('You do not have permission to create orders.', 'error');
  let tables = [];
  let floors = [];
  try {
    [tables, floors] = await Promise.all([
      api('/api/tables').catch(() => []),
      api('/api/tables/floors').catch(() => [])
    ]);
  } catch (error) {
    return toast('Unable to load tables', 'error');
  }
  _posAllTables = Array.isArray(tables) ? tables : [];
  _posFloors = Array.isArray(floors) ? floors : [];
  renderPOSTableSelectionContent();
}

async function changePOSTable() {
  window._posLayoutRestore = { cart: cart.slice(), form: capturePOSLayoutState() };
  await renderPOSTableSelection();
}

function setPOSTableSelectionView(view) {
  _posTableSelectionView = view === 'cards' ? 'cards' : 'map';
  renderPOSTableSelectionContent();
}

function getPOSTableStatusStyle(status, selected = false) {
  if (selected) return 'border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-600/25 ring-4 ring-indigo-100 dark:ring-indigo-950';
  if (status === 'occupied') return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300';
  if (status === 'reserved') return 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  return 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';
}

function renderPOSTableSelectionContent() {
  const selectedId = Number(window._posSelectedTableId || 0);
  const floorGroups = _posFloors.length
    ? _posFloors.map(floor => ({ ...floor, tables: _posAllTables.filter(table => Number(table.floor_id) === Number(floor.id)) }))
    : [{ id: 'all', name: 'Dining Area', tables: _posAllTables }];
  const unassigned = _posFloors.length ? _posAllTables.filter(table => !table.floor_id) : [];
  if (unassigned.length) floorGroups.push({ id: 'unassigned', name: 'Other Tables', tables: unassigned });
  const availableCount = _posAllTables.filter(table => table.status === 'available').length;
  const reservedCount = _posAllTables.filter(table => table.status === 'reserved').length;
  const occupiedCount = _posAllTables.filter(table => table.status === 'occupied').length;

  const tableButton = (table, mapView) => {
    const selected = Number(table.id) === selectedId;
    const disabled = table.status === 'occupied';
    const style = getPOSTableStatusStyle(table.status, selected);
    return `<button type="button" ${disabled ? 'disabled aria-disabled="true"' : ''} onclick="selectPOSTable(${table.id})"
      class="${mapView ? 'min-h-28 min-w-32' : 'min-h-36'} relative rounded-2xl border-2 p-4 text-left transition-all duration-200 ${style} ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:-translate-y-0.5 hover:shadow-lg'}">
      <span class="absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${table.status === 'available' ? 'bg-emerald-500' : table.status === 'reserved' ? 'bg-amber-500' : 'bg-rose-500'}"></span>
      <span class="block text-[10px] font-black uppercase tracking-[0.16em] opacity-70">${escapeOrderValue(table.status || 'available')}</span>
      <span class="mt-2 block text-xl font-black">Table ${escapeOrderValue(table.table_number)}</span>
      <span class="mt-1 block text-xs font-bold opacity-70">Up to ${Number(table.capacity || 4)} guests</span>
      ${selected ? '<span class="mt-3 inline-flex rounded-full bg-white/20 px-2 py-1 text-[10px] font-black uppercase">Selected</span>' : ''}
    </button>`;
  };

  const mapHtml = floorGroups.map(group => `
    <section class="rounded-3xl border border-slate-200 bg-slate-100/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div class="mb-4 flex items-center justify-between border-b border-dashed border-slate-300 pb-3 dark:border-slate-700">
        <div><h3 class="font-black text-slate-900 dark:text-white">${escapeOrderValue(group.name)}</h3><p class="text-xs font-medium text-slate-500">${group.tables.length} tables</p></div>
        <span class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-700 dark:bg-slate-900">Floor map</span>
      </div>
      <div class="flex min-h-40 flex-wrap items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
        ${group.tables.length ? group.tables.map(table => tableButton(table, true)).join('') : '<p class="text-sm font-bold text-slate-400">No tables on this floor</p>'}
      </div>
    </section>`).join('');

  const cardsHtml = `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    ${_posAllTables.length ? _posAllTables.map(table => tableButton(table, false)).join('') : '<div class="col-span-full rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center text-sm font-bold text-slate-400 dark:border-slate-800">No tables configured</div>'}
  </div>`;

  $c('page-content').innerHTML = `
    <div class="mx-auto max-w-7xl space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <header class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-6">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div><button type="button" onclick="renderPOSLanding()" class="mb-3 text-xs font-black text-slate-400 hover:text-indigo-600">&larr; Order types</button><h2 class="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Choose a table</h2><p class="mt-1 text-sm font-medium text-slate-500">Select an available or reserved table to begin the dine-in order.</p></div>
          <div class="flex flex-wrap gap-2"><span class="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">${availableCount} Available</span><span class="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">${reservedCount} Reserved</span><span class="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">${occupiedCount} Occupied</span></div>
        </div>
        <div class="mt-5 flex w-full rounded-xl bg-slate-100 p-1 dark:bg-slate-800 sm:ml-auto sm:w-fit">
          <button type="button" onclick="setPOSTableSelectionView('map')" class="flex-1 rounded-lg px-5 py-2 text-xs font-black transition ${_posTableSelectionView === 'map' ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300' : 'text-slate-500'}">Map view</button>
          <button type="button" onclick="setPOSTableSelectionView('cards')" class="flex-1 rounded-lg px-5 py-2 text-xs font-black transition ${_posTableSelectionView === 'cards' ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300' : 'text-slate-500'}">Card view</button>
        </div>
      </header>
      <main class="space-y-5">${_posTableSelectionView === 'map' ? mapHtml : cardsHtml}</main>
    </div>`;
}

async function selectPOSTable(tableId) {
  const table = _posAllTables.find(item => Number(item.id) === Number(tableId));
  if (!table || table.status === 'occupied') return toast('This table is currently occupied', 'error');
  window._posSelectedTableId = Number(table.id);
  window._posEntryOrderType = 'dine_in';
  if (window._posLayoutRestore?.form?.values) {
    window._posLayoutRestore.form.values['pos-table'] = String(table.id);
    window._posLayoutRestore.form.values['pos-waiter'] = table.assigned_waiter_id
      ? String(table.assigned_waiter_id)
      : '';
  }
  await renderPOS();
}

async function openPOSOrdersView() {
  if (!currentUserHasPermission('orders.view')) return toast('You do not have permission to view orders.', 'error');
  return withAppLoader('Opening orders', 'Loading active dine-in, takeaway, and delivery orders...', async () => {
    _posOrdersLoadPromise = api('/api/sales').catch(error => {
      _posOrdersLoadPromise = null;
      throw error;
    });
    window._posEntryOrderType = 'orders';
    await renderPOS();
  });
}

function returnToPOSOrderTypeSelection() {
  stopPOSOrdersPolling();
  closePOSCheckout(true);
  closePOSMobileCategories();
  cart = [];
  _editingOrderId = null;
  _tempEditSaleDetails = null;
  _posSelectedCustomer = null;
  _posCustomerResults = [];
  _posProductCategory = "";
  _posProductSearch = "";
  window._posEntryOrderType = null;
  window._posOrderType = null;
  window._posSelectedTableId = null;
  window._posLayoutRestore = null;
  showPOSOrderTypeChooser();
}

function startFreshPOSOrder() {
  stopPOSOrdersPolling();
  window._posEntryOrderType = null;
  cart = [];
  _posSelectedCustomer = null;
  renderPOSLanding();
}

function restorePOSLayoutState(restore) {
  if (!restore?.form) return;
  Object.entries(restore.form.values || {}).forEach(([id, value]) => {
    const el = $c(id);
    if (el) el.value = value;
  });
  const quotation = $c("pos-is-quotation");
  if (quotation) {
    quotation.checked = restore.form.quotation;
    toggleQuotationMode(quotation.checked);
  }
  const moneyReceived = $c("delivery-money-received");
  if (moneyReceived) moneyReceived.checked = restore.form.deliveryMoneyReceived;
  _posSelectedCustomer = restore.form.selectedCustomer || null;
  renderPOSSelectedCustomerBadge();
  calculateCartTotal();
}

async function renderPOS() {
  const deliveryOnly = _currentPage === 'delivery';
  const posTerminalPage = _currentPage === 'pos';
  if (!deliveryOnly && !_editingOrderId && !window._posEntryOrderType && !window._posLayoutRestore) {
    renderPOSLanding();
    return;
  }
  if (posTerminalPage) setPOSTerminalTopNavHidden(true);
  const splitLayout = !deliveryOnly && getPOSLayout() === "split";
  const layoutRestore = window._posLayoutRestore || null;
  window._posLayoutRestore = null;
  const [productResponse, tables, waiters, floors, discounts, taxes] = await loadPOSBootstrapData();
  // Consume the prefetch once so later visits refresh live table/order data.
  _posBootstrapCache = null;
  const products = Array.isArray(productResponse?.items) ? productResponse.items : [];
  const productPagination = productResponse?.pagination || { page: 1, page_size: POS_PRODUCTS_PER_PAGE, total: products.length, total_pages: 1 };
  allProducts = products;
  _posFloors = floors;
  _posAllTables = tables;
  _posDiscountPresets = Array.isArray(discounts) ? discounts : [];
  _posTaxPresets = Array.isArray(taxes) ? taxes : [];
  syncProductMap(products);

  if (!_editingOrderId && !layoutRestore) {
    cart = [];
    _posSelectedCustomer = null;
  } else if (layoutRestore) {
    cart = layoutRestore.cart;
  }
  _posCustomerResults = [];
  const waiterList = (waiters || []).filter(u => ['waiter', 'order_taker'].includes(u.role));
  const kitchenList = (waiters || []).filter(u => u.role === 'kitchen');
  const riderList = (waiters || []).filter(u => u.role === 'rider');
  const loggedInWaiter = ['waiter', 'order_taker'].includes(currentUser?.role) ? currentUser : null;
  // An order being edited already owns its dine-in table. Restore that table
  // from the sale instead of relying on the table-map selection from a
  // previous POS session (which may be empty or stale).
  const selectedPOSTableId = _editingOrderId
    ? _tempEditSaleDetails?.table_id
    : window._posSelectedTableId;
  const selectedPOSTable = (tables || []).find(table => Number(table.id) === Number(selectedPOSTableId));
  if (_editingOrderId && selectedPOSTable) {
    window._posSelectedTableId = Number(selectedPOSTable.id);
  }
  const assignedTableWaiterId = Number(selectedPOSTable?.assigned_waiter_id || 0);
  const selectedWaiterId = Number(
    (_editingOrderId ? _tempEditSaleDetails?.waiter_id : assignedTableWaiterId) ||
    loggedInWaiter?.id ||
    0
  );
  const selectedWaiter = waiterList.find(waiter => Number(waiter.id) === selectedWaiterId);
  const activePOSOrderType = layoutRestore?.form?.orderType || window._posEntryOrderType || (deliveryOnly ? 'delivery' : 'dine_in');
  const lockTableWaiter = activePOSOrderType === 'dine_in' && !!selectedPOSTable;
  const posOrderTypeMeta = {
    dine_in: {
      label: 'Dine-in Order',
      detail: selectedPOSTable ? `Table ${escapeOrderValue(selectedPOSTable.table_number)}` : 'Table service',
      icon: '🍽️',
      style: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
    },
    takeaway: {
      label: 'Takeaway Order',
      detail: 'Counter pickup',
      icon: '🛒',
      style: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
    },
    delivery: {
      label: 'Delivery Order',
      detail: 'Customer delivery',
      icon: '🚚',
      style: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
    }
  };
  const activePOSOrderMeta = posOrderTypeMeta[activePOSOrderType] || posOrderTypeMeta.dine_in;

  let baseShopType = currentUser.shop_type;
  if (currentUser.role === 'superadmin' && managedShopId) {
    const targetShop = (shops || []).find(s => s.id === managedShopId);
    if (targetShop) baseShopType = targetShop.shop_type;
  }
  const isRetail = false;
  window._posIsRetail = isRetail;

  const discountPresetOptions = _posDiscountPresets.map((preset) => {
    const type = preset.type === 'amount' ? 'amount' : 'percentage';
    const value = Number(preset.value || 0);
    const label = type === 'percentage' ? `${value}%` : `Rs. ${value}`;
    return `<option value="${value}" data-type="${type}">${escapeOrderValue(preset.name)} (${label})</option>`;
  }).join("");
  const taxPresetOptions = _posTaxPresets.map((preset) => {
    const percentage = Number(preset.percentage || 0);
    const method = preset.linked_payment_method || "";
    const methodLabel = method ? ` - ${method}` : "";
    return `<option value="${percentage}" data-method="${escapeOrderValue(method)}">${escapeOrderValue(preset.name)} (${percentage}%${methodLabel})</option>`;
  }).join("");

  $c("page-content").innerHTML = `
    ${splitLayout ? `<style>
      #pos-split-scroll-body input:not([type="checkbox"]),
      #pos-split-scroll-body select,
      #pos-cart-controls input:not([type="checkbox"]),
      #pos-cart-controls select { padding: 0.125rem 0.375rem !important; font-size: 0.7rem !important; min-height: 1.75rem; }
      #pos-split-scroll-body label,
      #pos-cart-controls label { margin-bottom: 0 !important; font-size: 0.55rem !important; }
      #pos-cart-controls label select { padding: 0 !important; min-height: 0 !important; }
      #pos-split-scroll-body .space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.25rem !important; }
      #pos-split-scroll-body .space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.125rem !important; }
      #pos-split-scroll-body #pos-dine-fields:not(.hidden) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.25rem; }
      #pos-split-scroll-body #pos-dine-fields:not(.hidden) > div { margin: 0 !important; }
      #pos-split-scroll-body #pos-dine-fields:not(.hidden) > div:last-child { grid-column: 1 / -1; }
      @media (min-width: 1024px) {
        #pos-checkout-backdrop {
          position: fixed;
          top: ${posTerminalPage ? '1rem' : '5rem'};
          right: 3rem;
          bottom: 0;
          width: calc(40vw - 2.8rem);
          height: auto;
        }
      }
    </style>` : ''}
    <div class="flex flex-col gap-4">
      <div id="pos-content-grid" class="h-full transition-all ${splitLayout ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)] gap-4 items-start' : ''}">
        <!-- Products Panel -->
        <div class="space-y-4 ${splitLayout ? 'min-w-0' : ''}">
          <div class="${splitLayout ? 'flex flex-col sm:flex-row gap-3' : 'flex flex-row flex-wrap items-center gap-2'}">
            <input id="pos-search" oninput="filterPOSProducts()" placeholder="Search products…"
              class="${splitLayout ? '' : 'order-1 min-w-0'} flex-1 h-12 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm" />
            <button type="button" onclick="returnToPOSOrderTypeSelection()"
              class="${splitLayout ? '' : 'order-2'} flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-indigo-400" title="Back to order types">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M15 19l-7-7 7-7"/></svg>
              <span class="hidden sm:inline">Back</span>
            </button>
            <button type="button" id="pos-orders-toolbar-btn" onclick="switchOrderType('orders')"
              class="${isRetail ? 'hidden' : 'flex'} ${splitLayout ? '' : 'order-5'} h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-sm font-black transition-all items-center justify-center gap-2 shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M9 5h6M9 9h6M9 13h4m-7 8h12a2 2 0 002-2V5a2 2 0 00-2-2H8l-4 4v12a2 2 0 002 2z"/></svg>
              <span>Orders</span>
            </button>
            <div class="${deliveryOnly ? 'hidden' : 'flex'} ${splitLayout ? '' : 'order-4'} h-12 items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shrink-0" aria-label="POS layout">
              <button type="button" onclick="setPOSLayout('cards')" title="Card layout"
                class="h-9 px-3 rounded-lg text-xs font-black transition-all ${!splitLayout ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">Cards</button>
              <button type="button" onclick="setPOSLayout('split')" title="Split table and cart layout"
                class="h-9 px-3 rounded-lg text-xs font-black transition-all ${splitLayout ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">Table + Cart</button>
            </div>
            <button type="button" id="pos-toolbar-checkout" onclick="openPOSCheckout()"
              class="${splitLayout ? 'hidden' : 'relative order-2 flex'} h-12 min-w-24 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-lg shadow-indigo-500/25 transition-all items-center justify-center gap-2 shrink-0 active:scale-95" title="Open checkout" aria-label="Open checkout">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.6 1.6A1 1 0 006.1 16H18M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"/></svg>
              <span id="pos-checkout-total" class="text-xs font-black text-indigo-50">Rs. 0.00</span>
              <span id="pos-checkout-count" class="absolute -right-1.5 -top-1.5 min-w-5 h-5 px-1 rounded-full border-2 border-gray-50 dark:border-gray-950 bg-rose-500 flex items-center justify-center text-[10px] leading-none">0</span>
            </button>
            ${splitLayout ? '' : '<span class="order-3 basis-full h-0" aria-hidden="true"></span>'}
          </div>
          <!-- Category pills -->
          ${splitLayout ? '' : `
          <button type="button" onclick="openPOSMobileCategories()" class="sm:hidden flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" aria-controls="pos-mobile-categories" aria-haspopup="dialog">
            <span class="flex items-center gap-2">
              <svg class="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
              Categories
            </span>
            <span id="pos-mobile-category-label" class="max-w-[55%] truncate text-xs font-bold text-indigo-600 dark:text-indigo-400">All</span>
          </button>`}
          <div id="pos-category-pills" class="${splitLayout ? 'flex' : 'hidden sm:flex'} flex-wrap gap-2">
            <button onclick="filterPOSByCategory(null)" class="cat-pill active px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold border border-transparent transition-all" data-cat="">All</button>
            ${(_productCategories || []).map(c => `<button onclick="filterPOSByCategory('${c.name}')" class="cat-pill px-4 py-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all" data-cat="${c.name}">${c.name}</button>`).join('')}
          </div>
          ${splitLayout ? '' : `
          <div id="pos-mobile-categories" class="hidden fixed inset-0 z-[60] sm:hidden" role="dialog" aria-modal="true" aria-label="Select product category" aria-hidden="true">
            <button type="button" class="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" onclick="closePOSMobileCategories()" aria-label="Close categories"></button>
            <aside class="relative flex h-full w-1/2 flex-col border-r border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div class="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <h3 class="text-sm font-black text-slate-900 dark:text-white">Categories</h3>
                <button type="button" onclick="closePOSMobileCategories()" class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-500 dark:bg-slate-800 dark:text-slate-300" aria-label="Close categories">&times;</button>
              </div>
              <div class="flex-1 space-y-2 overflow-y-auto p-3">
                <button type="button" onclick="selectPOSMobileCategory(this)" data-cat="" data-label="All" class="pos-mobile-category-option w-full rounded-xl bg-indigo-600 px-3 py-3 text-left text-xs font-black text-white">All</button>
                ${(_productCategories || []).map(c => `<button type="button" onclick="selectPOSMobileCategory(this)" data-cat="${escapeOrderValue(c.name)}" data-label="${escapeOrderValue(c.name)}" class="pos-mobile-category-option w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">${escapeOrderValue(c.name)}</button>`).join('')}
              </div>
            </aside>
          </div>`}
          <div id="pos-products-pagination" class="hidden"></div>
          <div id="pos-products" class="${splitLayout ? 'h-[calc(100vh-16rem)] min-h-0 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-start min-h-[50vh] max-h-[calc(100vh-21rem)] overflow-y-auto pr-1 pb-4'}"></div>
        </div>

        <!-- Checkout Drawer -->
        <div id="pos-checkout-backdrop" class="${splitLayout ? `relative block min-h-0 lg:sticky ${posTerminalPage ? 'lg:top-4 lg:h-[calc(100vh-1rem)]' : 'lg:top-20 lg:h-[calc(100vh-5rem)]'}` : `hidden fixed inset-x-0 ${posTerminalPage ? 'top-0' : 'top-20'} bottom-0 z-40`}" aria-hidden="${splitLayout ? 'false' : 'true'}">
          <div id="pos-checkout-shade"
            class="${splitLayout ? 'hidden' : 'absolute'} inset-y-0 left-0 right-0 lg:right-[33.333333%] bg-slate-200/90 dark:bg-slate-950/80 backdrop-blur-sm opacity-0 transition-opacity duration-300 flex items-center justify-center p-6 text-center">
            <div class="absolute inset-0 cursor-pointer" onclick="closePOSCheckout()"></div>
            <div class="relative z-10 w-full max-w-lg">
              <span class="block text-[11px] font-black uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400 mb-3">Grand Total</span>
              <span id="pos-checkout-overlay-total" class="block text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-10">Rs. 0.00</span>
              
              <p class="mt-8 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest opacity-50">Click background to return to cart</p>
            </div>
          </div>
          <div id="pos-checkout-drawer"
            class="${splitLayout ? 'relative w-full translate-x-0 rounded-none border overflow-y-auto p-1.5' : 'absolute right-0 top-0 w-full sm:w-[440px] md:w-[480px] lg:w-1/3 translate-x-full border-l overflow-y-auto p-4'} h-full bg-white dark:bg-slate-900 flex flex-col shadow-2xl border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-out">
          <div class="${splitLayout ? 'mb-1 p-1' : 'mb-3 pb-3'} flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 ${activePOSOrderMeta.style}">
              <span class="text-lg">${activePOSOrderMeta.icon}</span>
              <div class="min-w-0"><span class="block text-[9px] font-black uppercase tracking-widest opacity-60">Order Type</span><span class="block truncate text-xs font-black">${activePOSOrderMeta.label}${activePOSOrderType === 'dine_in' && selectedPOSTable ? ` · Table ${escapeOrderValue(selectedPOSTable.table_number)}` : ''}</span></div>
            </div>
            <button type="button" onclick="closePOSCheckout()" class="${splitLayout ? 'hidden' : 'flex'} w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-all items-center justify-center" title="Close checkout">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          
          <div id="cart-items" style="max-height: 30vh; overflow-y: auto;"
            class="relative isolate z-0 mb-4 min-h-20 shrink-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/40"></div>

          <!-- Restaurant Fields (Hidden for Retail) -->
          <div id="pos-restaurant-fields" class="${isRetail ? 'hidden' : ''} relative z-0 shrink-0 bg-white pt-2 dark:bg-slate-900">
            <!-- Dine-in specific: Table & Waiter -->
            <div id="pos-dine-fields" class="mb-2 space-y-2">
              <div class="grid grid-cols-1 gap-2">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Table</label>
                  <input id="pos-table" type="hidden" value="${selectedPOSTable?.id || ''}" />
                  <div class="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/30">
                    <div><span class="block text-sm font-black text-indigo-800 dark:text-indigo-200">${selectedPOSTable ? `Table ${escapeOrderValue(selectedPOSTable.table_number)}` : 'No table selected'}</span><span class="block text-[10px] font-bold uppercase tracking-wider text-indigo-500">${selectedPOSTable ? `${Number(selectedPOSTable.capacity || 4)} guests &middot; ${escapeOrderValue(selectedPOSTable.status)}` : 'Choose a table before checkout'}</span></div>
                    <button type="button" onclick="changePOSTable()" class="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black text-indigo-700 shadow-sm hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-300">Change</button>
                  </div>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Assigned Waiter</label>
                ${lockTableWaiter ? `
                  <input id="pos-waiter" type="hidden" value="${selectedWaiterId || ''}" />
                  <div class="w-full px-3 py-2 rounded-xl ${selectedWaiter ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'} border text-sm font-bold">
                    ${selectedWaiter ? escapeOrderValue(selectedWaiter.name || selectedWaiter.username || 'Order taker') : 'No order taker assigned to this table'}
                  </div>
                  ${selectedWaiter ? '' : '<p class="mt-1 text-[10px] font-bold text-amber-600">Assign an order taker from Table Management before checkout.</p>'}
                ` : loggedInWaiter ? `
                  <input id="pos-waiter" type="hidden" value="${loggedInWaiter.id}" />
                  <div class="w-full px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-sm font-bold">
                    ${escapeOrderValue(loggedInWaiter.name || loggedInWaiter.username || 'Waiter')}
                  </div>
                ` : `
                  <select id="pos-waiter" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                    <option value="">-- Select Waiter --</option>
                    ${waiterList.map(w => `<option value="${w.id}" ${Number(w.id) === selectedWaiterId ? 'selected' : ''}>${escapeOrderValue(w.name || w.username || 'Waiter')}</option>`).join('')}
                  </select>
                `}
              </div>
            </div>

            <!-- Delivery-specific address and rider. Customer identity uses the shared fields below. -->
            <div id="pos-delivery-fields" class="mb-2 space-y-2 hidden">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rider</label>
                <select id="pos-rider" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold">
                  <option value="">-- Rider --</option>
                  ${riderList.length
                    ? riderList.map(r => `<option value="${r.id}">${r.name}</option>`).join('')
                    : '<option value="" disabled>No riders available</option>'}
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Address</label>
                <input id="pos-delivery-addr" type="text" placeholder="Full address" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
              </div>
            </div>

            <!-- Takeaway token -->
            <div id="pos-takeaway-fields" class="mb-4 space-y-2 hidden">
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Token #</label>
              <input id="pos-token" type="text" placeholder="Auto or manual" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-sm font-bold" />
            </div>

            <div class="mb-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-[10px] font-bold text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300">Kitchen terminals are assigned automatically from product category routing.</div>
          </div>

          <div id="pos-cart-controls" class="border-t border-slate-200 dark:border-slate-700 ${splitLayout ? 'mt-0.5 pt-0.5 space-y-1 shrink-0' : 'mt-4 pt-4 space-y-4'}">
            <div class="hidden">
               <div class="flex justify-between ${splitLayout ? 'rounded-md bg-slate-50 dark:bg-slate-800 px-1.5 py-1' : ''}"><span>Subtotal</span><span id="cart-subtotal" class="font-bold text-slate-900 dark:text-white">Rs. 0</span></div>
               <div class="hidden"><span>Tax Amount</span><span id="cart-tax-amt">Rs. 0.00</span></div>
            </div>

            <div id="pos-grand-total-row" class="hidden">
              <span class="text-slate-900 dark:text-white ${splitLayout ? 'text-xs' : 'text-lg'}">Grand Total</span>
              <span id="cart-total" data-total="0">Rs. 0.00</span>
            </div>

            <div class="hidden">
               <div><label class="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">${splitLayout ? `
                 <span class="relative inline-flex h-5 w-5 items-center justify-center rounded-md bg-rose-100 text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-200 focus-within:ring-2 focus-within:ring-rose-500 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900" title="Choose discount preset">
                   −
                   <select id="pos-discount-preset" onchange="applyPOSDiscountPreset()" aria-label="Choose discount preset" class="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                     <option value="">Manual discount</option>${discountPresetOptions}
                   </select>
                 </span>` : ''}<span>Discount</span></label>
                 <div>
                 ${splitLayout ? '' : `
                 <select id="pos-discount-preset" onchange="applyPOSDiscountPreset()" class="w-full mb-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 transition-all text-xs font-black shadow-sm">
                   <option value="">Manual discount</option>${discountPresetOptions}
                 </select>`}
                 ${splitLayout ? `
                 <input id="pos-discount" type="number" min="0" value="" placeholder="Rs." oninput="clearPOSDiscountPreset();calculateCartTotal()" class="w-full min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                 ` : `
                 <div class="flex items-center gap-1">
                   <button type="button" onclick="$c('pos-discount').stepDown();clearPOSDiscountPreset();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">-</button>
                   <input id="pos-discount" type="number" min="0" value="" placeholder="Rs." oninput="clearPOSDiscountPreset();calculateCartTotal()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                   <button type="button" onclick="$c('pos-discount').stepUp();clearPOSDiscountPreset();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">+</button>
                 </div>`}
                 </div>
               </div>

               <div><label class="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">${splitLayout ? `
                 <span class="relative inline-flex h-5 w-5 items-center justify-center rounded-md bg-indigo-100 text-[9px] text-indigo-600 ring-1 ring-indigo-200 transition hover:bg-indigo-200 focus-within:ring-2 focus-within:ring-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-900" title="Choose tax preset">
                   %
                   <select id="pos-tax-preset" onchange="applyPOSTaxPreset()" aria-label="Choose tax preset" class="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                     <option value="">Manual tax</option>${taxPresetOptions}
                   </select>
                 </span>` : ''}<span>Tax</span></label>
                 <div>
                 ${splitLayout ? '' : `
                 <select id="pos-tax-preset" onchange="applyPOSTaxPreset()" class="w-full mb-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 transition-all text-xs font-black shadow-sm">
                   <option value="">Manual tax</option>${taxPresetOptions}
                 </select>`}
                 ${splitLayout ? `
                 <input id="pos-tax" type="number" min="0" value="" placeholder="%" oninput="clearPOSTaxPreset();calculateCartTotal()" class="w-full min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                 ` : `
                 <div class="flex items-center gap-1">
                   <button type="button" onclick="$c('pos-tax').stepDown();clearPOSTaxPreset();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">-</button>
                   <input id="pos-tax" type="number" min="0" value="" placeholder="%" oninput="clearPOSTaxPreset();calculateCartTotal()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                   <button type="button" onclick="$c('pos-tax').stepUp();clearPOSTaxPreset();calculateCartTotal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm font-bold shadow-sm">+</button>
                 </div>`}
                 </div>
               </div>
            </div>

            <div class="grid ${splitLayout ? 'grid-cols-4 gap-1 text-xs pt-0.5' : 'grid-cols-2 gap-4 text-base pt-2'} border-t border-slate-200 dark:border-slate-800">
               <!-- The cashier can link a customer for every order/payment type. -->
               <div id="pos-customer-identity-fields" class="contents hidden">
               <div class="col-span-1 relative">
                 <label id="pos-cust-name-label" class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Cust. Name</label>
                 <input id="pos-cust-name" type="text" placeholder="Optional" 
                        oninput="suggestPOSCustomers(this.value, 'pos-cust-name')"
                        autocomplete="off"
                        class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-bold shadow-sm" />
                 <!-- Suggestions Dropdown -->
                 <div id="pos-cust-name-suggestions" class="hidden absolute z-[100] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"></div>
               </div>
               <div class="col-span-1 relative">
                 <label id="pos-cust-phone-label" class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Cust. Phone</label>
                 <input id="pos-cust-phone" type="tel" placeholder="Optional" 
                        oninput="suggestPOSCustomers(this.value, 'pos-cust-phone')"
                        autocomplete="off"
                        class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-sm font-bold shadow-sm" />
                 <!-- Suggestions Dropdown -->
                 <div id="pos-cust-phone-suggestions" class="hidden absolute z-[100] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"></div>
               </div>
               </div>

               <div class="hidden"><label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">Payment</label>
               <select id="pos-method" onchange="handlePOSMethodChange(this.value)" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all text-base shadow-sm font-bold">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
               </select></div>

               <div class="hidden"><label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Received</label>
                 <div class="flex items-center gap-1">
                   <button type="button" onclick="$c('pos-received').stepDown();calculateRemaining()" class="${splitLayout ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all font-bold shadow-sm">-</button>
                   <input id="pos-received" type="number" min="0" value="" oninput="calculateRemaining()" class="flex-1 min-w-0 px-2 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 focus:outline-none focus:border-indigo-500 transition-all text-sm font-black shadow-sm text-center" />
                   <button type="button" onclick="$c('pos-received').stepUp();calculateRemaining()" class="${splitLayout ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all font-bold shadow-sm">+</button>
                 </div>
                 </div>
            </div>

            ${deliveryOnly ? `
            <label class="hidden">
              <div>
                <div class="text-xs font-black text-blue-800 dark:text-blue-300">Money received</div>
                <div class="text-[10px] font-bold text-blue-600/70 dark:text-blue-400/70">Credits this payment to your staff sales total</div>
              </div>
              <input id="delivery-money-received" type="checkbox" onchange="syncDeliveryMoneyReceived()" class="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
            </label>` : ''}

            <div class="hidden">
              <span class="text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-widest">Change / Dues</span>
              <span id="cart-remaining" class="text-emerald-600 dark:text-emerald-400">Rs. 0.00</span>
            </div>

            <div class="hidden">
              <input type="checkbox" id="pos-is-quotation" class="${splitLayout ? 'w-4 h-4' : 'w-5 h-5'} rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer" onchange="toggleQuotationMode(this.checked)" />
              <label for="pos-is-quotation" class="text-xs font-black text-amber-700 dark:text-amber-400 cursor-pointer select-none">
                Generate Quotation (Estimate Only)
              </label>
            </div>

            ${splitLayout ? `
            <div id="pos-split-action-host" class="shrink-0 space-y-1 border-t border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900"></div>
            ` : `
            <div class="pt-2"></div>
            `}
            <div id="pos-primary-action-wrap" class="grid grid-cols-1 gap-3">
              ${isRetail || deliveryOnly ? `
              <button onclick="checkout('${deliveryOnly ? 'pending' : 'completed'}')" id="checkout-btn"
                class="${splitLayout ? 'py-1 text-xs h-9' : 'py-3 text-base h-14'} rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-black shadow-xl transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2">
                <span>${deliveryOnly ? 'Place Delivery Order' : 'Place Order'}</span>
              </button>
              ` : `
              <button onclick="sendToKitchen()" id="kitchen-btn"
                class="${splitLayout ? 'py-1 text-xs h-9' : 'py-3 text-base h-14'} rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black shadow-xl transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2">
                <span>Kitchen</span>
              </button>
              `}
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- Orders View (Hidden by default) -->
      <div id="pos-orders-container" class="hidden">
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[70vh]">
          <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
            <h3 class="font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-sm">📋</span>
              Active Orders
            </h3>
            <div class="flex flex-wrap items-center justify-end gap-3">
              <button type="button" onclick="returnToPOSOrderTypeSelection()" class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition-all hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-indigo-400">
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M15 19l-7-7 7-7"/></svg>
                Back
              </button>
              ${currentUserHasPermission('orders.create') ? `<button onclick="showPOSOrderTypeChooser()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3" d="M12 5v14m7-7H5"/></svg>
                New Order
              </button>` : ''}
              <div class="relative">
                <input type="text" id="pos-orders-search" oninput="renderPOSOrders()" placeholder="Search Order ID..." class="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:border-indigo-500 w-40 transition-all" />
                <svg class="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
              <select id="pos-orders-type-filter" onchange="renderPOSOrders()" class="${deliveryOnly ? 'hidden' : ''} px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-all">
                <option value="">All Types</option>
                <option value="dine_in">Dine-in</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
              </select>
              <button onclick="renderPOSOrders()" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-400 transition-all active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
              <div class="flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800" aria-label="Order view">
                <button id="orders-view-cards-btn" onclick="setOrdersView('cards')" class="px-3 py-1.5 rounded-lg text-[10px] font-black">Mobile</button>
                <button id="orders-view-table-btn" onclick="setOrdersView('table')" class="px-3 py-1.5 rounded-lg text-[10px] font-black">Table</button>
              </div>
            </div>
          </div>
          <div id="pos-orders-cards" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3"></div>
          <div id="pos-orders-table" class="hidden overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800/50">
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Table / Details</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Waiter</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                  <th class="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="pos-orders-table-body">
                <tr>
                  <td colspan="7" class="px-4 py-20 text-center text-slate-400">
                    <div class="animate-pulse">Loading orders...</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  if (splitLayout) {
    const splitHost = $c("pos-split-action-host");
    const totalRow = $c("pos-grand-total-row");
    const actionWrap = $c("pos-primary-action-wrap");
    const drawer = $c("pos-checkout-drawer");
    const cartControls = $c("pos-cart-controls");
    if (splitHost && totalRow) splitHost.appendChild(totalRow);
    if (splitHost && actionWrap) {
      actionWrap.classList.remove("px-4");
      splitHost.appendChild(actionWrap);
    }
    if (drawer && splitHost) {
      const scrollBody = document.createElement("div");
      scrollBody.id = "pos-split-scroll-body";
      scrollBody.className = "min-h-0 flex flex-1 flex-col overflow-y-auto overflow-x-hidden pr-1 pb-1";
      splitHost.remove();
      if (cartControls) cartControls.remove();
      while (drawer.firstChild) scrollBody.appendChild(drawer.firstChild);
      drawer.appendChild(scrollBody);
      if (cartControls) drawer.appendChild(cartControls);
      drawer.appendChild(splitHost);
    }
  }

  // Track current order type state
  window._posDeliveryOnly = deliveryOnly;
  window._posOrderType = activePOSOrderType;
  window._posLastOrderType = window._posOrderType;
  switchOrderType(deliveryOnly ? 'orders' : window._posOrderType);

  // Input listener for pos-customer (legacy compatibility)
  const posCustomerInput = $c('pos-customer-input-compat');
  if (posCustomerInput) {
    posCustomerInput.addEventListener('input', function () {
      searchPOSCustomers(this.value);
      syncPOSCustomerManualEntry();
    });
  }

  _posProductCategory = "";
  _posProductSearch = "";
  _posServerPagination = productPagination;
  renderPOSProducts(products, productPagination.page, productPagination);
  renderCart();
  if (layoutRestore) restorePOSLayoutState(layoutRestore);
  else if (!_editingOrderId) {
    if ($c("pos-discount")) $c("pos-discount").value = "0";
    if ($c("pos-tax")) $c("pos-tax").value = "0";
    calculateCartTotal();
  }
}

async function renderDeliveryPanel() {
  return renderPOS();
}

function syncDeliveryMoneyReceived() {
  const checkbox = $c('delivery-money-received');
  const received = $c('pos-received');
  const total = parseFloat($c('cart-total')?.dataset.total) || 0;
  if (received) received.value = checkbox?.checked ? total.toFixed(2) : '0';
  calculateRemaining();
}

function syncPOSCheckoutSummary(totalOverride) {
  const grandTotal = typeof totalOverride === "number"
    ? totalOverride
    : parseFloat($c("cart-total")?.dataset.total) || 0;
  const totalText = "Rs. " + grandTotal.toFixed(2);
  const itemCount = cart.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

  const buttonTotal = $c("pos-checkout-total");
  const buttonCount = $c("pos-checkout-count");
  const overlayTotal = $c("pos-checkout-overlay-total");

  if (buttonTotal) buttonTotal.textContent = totalText;
  if (buttonCount) buttonCount.textContent = itemCount;
  if (overlayTotal) overlayTotal.textContent = totalText;
}

function openPOSCheckout() {
  if (getPOSLayout() === "split" && _currentPage === "pos") {
    syncPOSCheckoutSummary();
    return;
  }
  const backdrop = $c("pos-checkout-backdrop");
  const drawer = $c("pos-checkout-drawer");
  const shade = $c("pos-checkout-shade");
  if (!backdrop || !drawer) return;

  if (_posCheckoutCloseTimer) clearTimeout(_posCheckoutCloseTimer);
  syncPOSCheckoutSummary();
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("overflow-hidden");

  requestAnimationFrame(() => {
    drawer.classList.remove("translate-x-full");
    drawer.classList.add("translate-x-0");
    if (shade) {
      shade.classList.remove("opacity-0");
      shade.classList.add("opacity-100");
    }
  });
}

function closePOSCheckout(immediate = false) {
  if (getPOSLayout() === "split" && _currentPage === "pos") {
    document.body.classList.remove("overflow-hidden");
    return;
  }
  const backdrop = $c("pos-checkout-backdrop");
  const drawer = $c("pos-checkout-drawer");
  const shade = $c("pos-checkout-shade");
  if (!backdrop || !drawer) return;

  drawer.classList.add("translate-x-full");
  drawer.classList.remove("translate-x-0");
  if (shade) {
    shade.classList.add("opacity-0");
    shade.classList.remove("opacity-100");
  }
  backdrop.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overflow-hidden");

  if (immediate) {
    backdrop.classList.add("hidden");
    return;
  }

  _posCheckoutCloseTimer = setTimeout(() => {
    backdrop.classList.add("hidden");
  }, 300);
}

function switchOrderType(type) {
  const isRetail = false;
  if (type !== 'orders') {
    window._posOrderType = type;
    window._posLastOrderType = type;
  }

  const activeType = type === 'orders'
    ? (window._posOrderType || (isRetail ? 'takeaway' : 'dine_in'))
    : type;
  const compactOrderSelector = getPOSLayout() === "split" && _currentPage === "pos";
  const orderButtonSize = compactOrderSelector ? 'py-1.5 px-1 text-[10px]' : 'py-2.5 px-2 text-xs';
  const activeOrderClass = `flex items-center justify-center gap-1.5 ${orderButtonSize} rounded-xl bg-indigo-600 text-white font-bold transition-all`;
  const inactiveOrderClass = `flex items-center justify-center gap-1.5 ${orderButtonSize} rounded-xl text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all`;

  ['dine_in', 'takeaway', 'delivery'].forEach(t => {
    const btn = $c(`otype-${t}`);
    if (!btn) return;
    btn.className = t === activeType ? activeOrderClass : inactiveOrderClass;
  });

  const dineEl = $c('pos-dine-fields');
  const deliveryEl = $c('pos-delivery-fields');
  const takeawayEl = $c('pos-takeaway-fields');
  const customerIdentityEl = $c('pos-customer-identity-fields');
  const contentGrid = $c('pos-content-grid');
  const ordersContainer = $c('pos-orders-container');
  const ordersBtn = $c('pos-orders-toolbar-btn');
  if (ordersBtn) {
    const cardsToolbarOrder = compactOrderSelector ? '' : 'order-5';
    ordersBtn.className = type === 'orders'
      ? `${isRetail ? 'hidden' : 'flex'} ${cardsToolbarOrder} h-12 px-4 rounded-xl bg-indigo-600 text-white text-sm font-black transition-all items-center justify-center gap-2 shrink-0 shadow-lg shadow-indigo-600/20`
      : `${isRetail ? 'hidden' : 'flex'} ${cardsToolbarOrder} h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-sm font-black transition-all items-center justify-center gap-2 shrink-0`;
  }

  const kitchenBtn = $c('kitchen-btn');
  if (kitchenBtn) {
    kitchenBtn.classList.toggle('hidden', type === 'orders' || isRetail);
  }

  if (type === 'orders') {
    closePOSCheckout(true);
    if (contentGrid) contentGrid.classList.add('hidden');
    if (ordersContainer) ordersContainer.classList.remove('hidden');
    const refresh = renderPOSOrders();
    startPOSOrdersPolling();
    return refresh;
  } else {
    stopPOSOrdersPolling();
    if (contentGrid) contentGrid.classList.remove('hidden');
    if (ordersContainer) ordersContainer.classList.add('hidden');
    if (dineEl) dineEl.classList.toggle('hidden', type !== 'dine_in' || isRetail);
    if (deliveryEl) deliveryEl.classList.toggle('hidden', type !== 'delivery' || isRetail);
    if (takeawayEl) takeawayEl.classList.toggle('hidden', type !== 'takeaway' || isRetail);
    if (customerIdentityEl) customerIdentityEl.classList.remove('hidden');
  }
}

async function showPrintOptionsModal(id) {
  try {
    const [data, discounts, taxes] = await Promise.all([
      api(`/api/sales/${id}/bill`),
      api("/api/shop-settings/discounts"),
      api("/api/shop-settings/taxes")
    ]);
    const { sale, items } = data;
    window._printBillSelectedCustomer = sale.customer_id ? { id: sale.customer_id, name: sale.customer_name, phone: sale.customer_phone } : null;
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price_at_sale) * Number(item.quantity)), 0);

    openModal('Unpaid Bill Options', `
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-3">
          <div class="relative">
            <label id="pp-customer-name-label" class="block text-xs font-bold text-slate-500 mb-1">Customer Name <span class="font-normal">(optional)</span></label>
            <input id="pp-customer-name" type="text" value="${escapeOrderValue(sale.customer_name || '')}" autocomplete="off" oninput="suggestPrintBillCustomers(this.value, 'pp-customer-name'); updatePrintSummary(${subtotal}, '${sale.order_type}')" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
            <div id="pp-customer-name-suggestions" class="hidden absolute z-[120] left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"></div>
          </div>
          <div class="relative hidden">
            <label id="pp-customer-phone-label" class="block text-xs font-bold text-slate-500 mb-1">Phone Number ${sale.order_type === 'delivery' ? '<span class="text-rose-500">*</span>' : '<span class="font-normal">(optional)</span>'}</label>
            <input id="pp-customer-phone" type="tel" value="${escapeOrderValue(sale.customer_phone || '')}" autocomplete="off" oninput="suggestPrintBillCustomers(this.value, 'pp-customer-phone'); updatePrintSummary(${subtotal}, '${sale.order_type}')" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
            <div id="pp-customer-phone-suggestions" class="hidden absolute z-[120] left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"></div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-500 mb-1">Payment Method</label>
            <select id="pp-method" onchange="applyLinkedTax(${subtotal})" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold">
              <option value="cash" ${sale.payment_method === 'cash' ? 'selected' : ''}>Cash</option>
              <option value="card" ${sale.payment_method === 'card' ? 'selected' : ''}>Card</option>
              <option value="online" ${sale.payment_method === 'online' ? 'selected' : ''}>Online Transfer</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 mb-1">Tax (%)</label>
            <select id="pp-tax-preset" class="hidden">
              <option value="">Presets</option>
              ${taxes.map(t => `<option value="${t.percentage}" data-method="${t.linked_payment_method || ''}">${t.name} (${t.percentage}%)</option>`).join("")}
            </select>
            <input id="pp-tax" type="number" step="0.01" value="${sale.tax_percentage || 0}" 
              oninput="updatePrintSummary(${subtotal})"
              class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Discount</label>
          <div class="flex gap-2">
            <select id="pp-disc-preset" onchange="applyDiscPreset(${subtotal})" class="w-1/2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all">
              <option value="">Presets</option>
              ${discounts.map(d => `<option value="${d.value}" data-type="${d.type}">${d.name} (${d.type === 'percentage' ? d.value + '%' : 'Rs.' + d.value})</option>`).join("")}
            </select>
            <input id="pp-discount" type="number" step="0.01" value="${sale.discount || 0}" 
              oninput="updatePrintSummary(${subtotal})"
              class="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
          </div>
        </div>

        <!-- Bill Summary Section -->
        <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-slate-500 font-bold uppercase tracking-wider">Subtotal</span>
            <span class="text-slate-900 dark:text-white font-black">Rs. ${subtotal.toLocaleString()}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-slate-500 font-bold uppercase tracking-wider">Discount</span>
            <span id="ps-discount" class="text-rose-500 font-black">- Rs. ${Number(sale.discount || 0).toLocaleString()}</span>
          </div>
          <div class="flex justify-between text-xs border-b border-slate-100 dark:border-slate-700 pb-2">
            <span class="text-slate-500 font-bold uppercase tracking-wider">Tax</span>
            <span id="ps-tax" class="text-slate-900 dark:text-white font-black">Rs. 0</span>
          </div>
          <div class="flex justify-between items-center pt-1">
            <span class="text-slate-500 font-black uppercase tracking-widest text-[10px]">Grand Total</span>
            <span id="ps-total" class="text-lg font-black text-indigo-600 dark:text-indigo-400">Rs. ${Number(sale.total).toLocaleString()}</span>
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
            <span class="text-slate-500 font-black uppercase tracking-widest text-[10px]">Remaining Due</span>
            <span id="ps-due" class="text-lg font-black text-rose-500">Rs. ${Math.max(Number(sale.total) - Number(sale.amount_received || 0), 0).toLocaleString()}</span>
          </div>
        </div>

        <div class="pt-2">
          <button onclick="printUnpaidBillInquiry(${id})" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-lg shadow-indigo-600/25 transition-all">
            🖨️ Update & Print Unpaid Bill
          </button>
        </div>
      </div>
    `, 'max-w-md');

    // Initial sync
    setTimeout(() => {
      applyLinkedTax(subtotal);
      updatePrintSummary(subtotal, '${sale.order_type}');
    }, 0);
  } catch (err) {
    console.error(err);
    toast("Error loading print options", "error");
  }
}

function applyTaxPreset(subtotal) {
  const sel = document.getElementById("pp-tax-preset");
  const val = sel.value;
  if (val !== "") {
    document.getElementById("pp-tax").value = val;
    updatePrintSummary(subtotal);
  }
}

function applyDiscPreset(subtotal) {
  const sel = document.getElementById("pp-disc-preset");
  const opt = sel.options[sel.selectedIndex];
  if (sel.value !== "") {
    const type = opt.dataset.type;
    const val = parseFloat(sel.value);
    if (type === 'percentage') {
      const amount = (subtotal * val) / 100;
      document.getElementById("pp-discount").value = amount.toFixed(2);
    } else {
      document.getElementById("pp-discount").value = val;
    }
    updatePrintSummary(subtotal);
  }
}

function applyLinkedTax(subtotal) {
  const method = document.getElementById("pp-method").value;
  const taxPresetSel = document.getElementById("pp-tax-preset");
  // Find a preset linked to this method
  for (let i = 0; i < taxPresetSel.options.length; i++) {
    if (taxPresetSel.options[i].dataset.method === method) {
      taxPresetSel.selectedIndex = i;
      document.getElementById("pp-tax").value = taxPresetSel.options[i].value;
      break;
    }
  }
  updatePrintSummary(subtotal);
}





function updatePrintSummary(subtotal, orderType = '') {
  const discInp = document.getElementById('pp-discount');
  const taxInp = document.getElementById('pp-tax');
  if (!discInp || !taxInp) return;

  const discount = parseFloat(discInp.value) || 0;
  const taxPct = parseFloat(taxInp.value) || 0;

  const taxAmt = (subtotal - discount) * (taxPct / 100);
  const total = subtotal - discount + taxAmt;
  const received = Math.max(parseFloat(document.getElementById('pp-received')?.value) || 0, 0);
  const due = Math.max(total - received, 0);

  const ds = document.getElementById('ps-discount');
  const ts = document.getElementById('ps-tax');
  const gs = document.getElementById('ps-total');
  const dueEl = document.getElementById('ps-due');

  if (ds) ds.textContent = `- PKR ${discount.toLocaleString()}`;
  if (ts) ts.textContent = `PKR ${taxAmt.toLocaleString()}`;
  if (gs) gs.textContent = `PKR ${total.toLocaleString()}`;
  if (dueEl) dueEl.textContent = `PKR ${due.toLocaleString()}`;

  // An inquiry/unpaid bill is print-only. Customer identity and received
  // payment are deliberately not validated here.
}

async function updateAndPrintBill(id, orderType) {
  const customerName = $c('pp-customer-name').value.trim();
  const customerPhone = $c('pp-customer-phone').value.trim();
  const receivedInput = $c('pp-received');
  const amountReceived = Math.max(parseFloat(receivedInput.value) || 0, 0);
  const discount = parseFloat($c('pp-discount').value) || 0;
  const taxPercentage = parseFloat($c('pp-tax').value) || 0;
  const finalTotal = Number($c('ps-total').textContent.replace(/[^0-9.-]/g, '')) || 0;
  const fullyPaid = amountReceived >= finalTotal - 0.01;
  const identityRequired = !fullyPaid;

  if (identityRequired && (!customerName || !customerPhone)) {
    if (!customerName) $c('pp-customer-name').focus();
    else $c('pp-customer-phone').focus();
    return toast("Customer name and phone are required when a balance remains unpaid", "error");
  }

  const data = {
    customer_id: window._printBillSelectedCustomer?.id || null,
    customer_name: customerName,
    customer_phone: customerPhone,
    payment_method: $c('pp-method').value,
    tax_percentage: taxPercentage,
    discount
  };
  if (Math.abs(amountReceived - Number(receivedInput.dataset.original || 0)) > 0.01) {
    data.amount_received = amountReceived;
  }

  try {
    await api(`/api/sales/${id}/details`, 'PATCH', data);
    const completed = await completeOrderFromPOS(id, true);
    if (!completed) return;
    if (fullyPaid) {
      await printCustomerBill(id);
      toast('Customer linked and bill marked paid.', 'success');
    } else {
      await printUnpaidBill(id);
      toast('Sale closed and outstanding amount added to the customer ledger.', 'success');
    }
    closeModal();
    renderPOSOrders();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function escapeOrderValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseOrderOptionList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") return Object.values(value);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
  } catch (_) {
    return [];
  }
}

function configuredOrderItemName(baseName, variants, addons) {
  const variantNames = parseOrderOptionList(variants)
    .map(variant => variant?.name || variant?.label || variant?.value || variant)
    .filter(Boolean);
  const addonNames = parseOrderOptionList(addons)
    .map(addon => addon?.name || addon?.label || addon)
    .filter(Boolean);
  return `${baseName || "Item"}${variantNames.length ? ` ${variantNames.join(" ")}` : ""}${addonNames.length ? ` — ${addonNames.join(", ")} (Add-ons)` : ""}`;
}

function isPOSOrdersViewActive() {
  const ordersContainer = $c('pos-orders-container');
  return _currentPage === 'pos' && ordersContainer && !ordersContainer.classList.contains('hidden');
}

function stopPOSOrdersPolling() {
  if (_posOrdersPollingTimer) clearTimeout(_posOrdersPollingTimer);
  _posOrdersPollingTimer = null;
}

function startPOSOrdersPolling() {
  stopPOSOrdersPolling();
  if (!isPOSOrdersViewActive() || document.hidden) return;
  _posOrdersPollingTimer = setTimeout(async () => {
    _posOrdersPollingTimer = null;
    if (!isPOSOrdersViewActive() || document.hidden) return;
    await renderPOSOrders();
    startPOSOrdersPolling();
  }, POS_ORDERS_POLL_INTERVAL_MS);
}

async function renderPOSOrders() {
  if (_posOrdersRenderPromise) return _posOrdersRenderPromise;
  _posOrdersRenderPromise = renderPOSOrdersNow();
  try {
    return await _posOrdersRenderPromise;
  } finally {
    _posOrdersRenderPromise = null;
  }
}

async function renderPOSOrdersNow() {
  const tbody = $c('pos-orders-table-body');
  const cards = $c('pos-orders-cards');
  if (!tbody) return;
  applyOrdersView();

  const searchQuery = $c('pos-orders-search')?.value || '';
  const typeFilter = $c('pos-orders-type-filter')?.value || '';

  try {
    const deliveryPanel = _currentPage === 'delivery';
    const salesPromise = !deliveryPanel && _posOrdersLoadPromise
      ? _posOrdersLoadPromise
      : api(deliveryPanel ? '/api/delivery' : '/api/sales');
    _posOrdersLoadPromise = null;
    const sales = await salesPromise;
    // Keep operational states visible until payment/order completion.
    let filteredOrders = (sales || []).filter(s => s.order_status !== 'completed');
    if (deliveryPanel) filteredOrders = filteredOrders.filter(s => s.order_type === 'delivery');

    if (typeFilter) {
      filteredOrders = filteredOrders.filter(o => o.order_type === typeFilter);
    }

    if (searchQuery) {
      filteredOrders = filteredOrders.filter(o => String(o.order_number || o.id).includes(searchQuery));
    }

    filteredOrders = filteredOrders.slice(0, 50);

    _posActiveOrders = filteredOrders;

    if (filteredOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-20 text-center text-slate-400">No active orders found</td></tr>`;
      if (cards) cards.innerHTML = `<div class="sm:col-span-2 xl:col-span-3 py-20 text-center text-slate-400">No active orders found</div>`;
      return;
    }

    if (cards) cards.innerHTML = filteredOrders.map(renderActiveOrderCard).join('');

    tbody.innerHTML = filteredOrders.map(s => {
      const date = new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const typeLabel = s.order_type === 'dine_in' ? '🍽️ Dine-in' : s.order_type === 'takeaway' ? '🛍️ Takeaway' : '🚚 Delivery';
      const detail = s.order_type === 'dine_in'
        ? `Table: ${s.table_number || 'N/A'}`
        : s.order_type === 'delivery'
          ? `
            <div>${escapeOrderValue(s.customer_name || 'Walk-in')}</div>
            <div class="text-[10px] font-bold text-slate-400 mt-0.5">${escapeOrderValue(s.customer_phone || 'No phone')}</div>
            ${s.delivery_address ? `<div class="text-[10px] font-medium text-slate-400 truncate max-w-[180px]" title="${escapeOrderValue(s.delivery_address)}">${escapeOrderValue(s.delivery_address)}</div>` : ""}
          `
          : escapeOrderValue(s.customer_name || 'Walk-in');

      let statusColor = 'bg-slate-100 text-slate-600';
      if (s.order_status === 'pending') statusColor = 'bg-amber-100 text-amber-600';
      if (s.order_status === 'preparing') statusColor = 'bg-blue-100 text-blue-600';
      if (s.order_status === 'ready') statusColor = 'bg-emerald-100 text-emerald-600';
      if (s.order_status === 'served') statusColor = 'bg-violet-100 text-violet-700';
      const paymentPaid = Number(s.amount_received || 0) >= Number(s.total || 0) - 0.01;
      const paymentBadge = paymentPaid
        ? '<span class="inline-flex mt-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[9px] font-black uppercase tracking-wider">Paid</span>'
        : '<span class="inline-flex mt-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase tracking-wider">Unpaid</span>';
      const canMarkServed = Number(s.user_id) === Number(currentUser?.id) || Number(s.waiter_id) === Number(currentUser?.id) || currentUser?.role === 'receptionist';
      const primaryAction = s.order_type === 'dine_in' && s.order_status === 'ready' && canMarkServed
        ? `<button onclick="markOrderServed(${s.id})" class="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold text-[10px] uppercase hover:bg-violet-500 transition-all shadow-sm">Mark Served</button>`
        : s.order_type === 'delivery' && s.order_status !== 'ready'
        ? `<button onclick="viewOrderItems(${s.id})" class="px-3 py-1.5 rounded-lg bg-blue-500 text-white font-bold text-[10px] uppercase hover:bg-blue-600 transition-all shadow-sm">Out</button>`
        : currentUserHasPermission('orders.take_payment') && currentUserHasPermission('orders.complete')
          ? `<button onclick="showOrderCompleteModal(${s.id})" class="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-[10px] uppercase hover:bg-emerald-600 transition-all shadow-sm">Payment & Complete</button>`
          : currentUserHasPermission('orders.complete')
            ? `<button onclick="completeOrderFromPOS(${s.id})" class="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-[10px] uppercase hover:bg-emerald-600 transition-all shadow-sm">Complete</button>` : '';

      return `
        <tr class="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
          <td class="px-4 py-4 font-bold text-slate-900 dark:text-white text-sm">#${s.order_number || s.id}</td>
          <td class="px-4 py-4 text-xs font-bold text-slate-500">${typeLabel}</td>
          <td class="px-4 py-4">
            <div class="text-sm font-black text-slate-700 dark:text-slate-200">${detail}</div>
          </td>
          <td class="px-4 py-4 text-xs font-bold text-slate-500">
            ${s.waiter_name || '-'}
          </td>
          <td class="px-4 py-4">
            ${deliveryPanel ? `<select onchange="updateDeliveryStatus(${s.id}, this.value)" class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${statusColor} border-0 outline-none cursor-pointer"><option value="pending" ${s.order_status === 'pending' ? 'selected' : ''}>Pending</option><option value="preparing" ${s.order_status === 'preparing' ? 'selected' : ''}>Preparing</option><option value="ready" ${s.order_status === 'ready' ? 'selected' : ''}>Out for delivery</option></select>` : `<span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${statusColor}">${s.order_status}</span>`}
          </td>
          <td class="px-4 py-4 font-black text-slate-900 dark:text-white text-sm"><div>PKR ${Number(s.total).toLocaleString()}</div>${deliveryPanel ? paymentBadge : ''}</td>
          <td class="px-4 py-4 text-xs font-medium text-slate-400">${date}</td>
          <td class="px-4 py-4 text-right">
            <div class="flex justify-end gap-2">
              ${currentUserHasPermission('orders.view') ? `<button onclick="viewOrderItems(${s.id})" class="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase hover:bg-emerald-100 transition-all">
                View
              </button>` : ''}
              ${currentUserHasPermission('orders.update') ? `<button onclick="editOrder(${s.id})" class="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase hover:bg-indigo-100 transition-all">
                Edit
              </button>` : ''}
	              ${currentUserHasPermission('orders.view') ? `<button onclick="showReceiptPrintMenu(${s.id})" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[10px] uppercase hover:bg-slate-200 transition-all">
	                Print
	              </button>` : ''}
	              ${primaryAction}
	            </div>
	          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-20 text-center text-rose-500">Failed to load orders: ${e.message}</td></tr>`;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPOSOrdersPolling();
    return;
  }
  if (!isPOSOrdersViewActive()) return;
  void renderPOSOrders().finally(startPOSOrdersPolling);
});

window.addEventListener('beforeunload', stopPOSOrdersPolling);

function ordersViewPreference() {
  return localStorage.getItem('orders_view') === 'table' ? 'table' : 'cards';
}

function setOrdersView(view) {
  localStorage.setItem('orders_view', view === 'table' ? 'table' : 'cards');
  applyOrdersView();
}

function applyOrdersView() {
  const view = ordersViewPreference();
  const cards = $c('pos-orders-cards');
  const table = $c('pos-orders-table');
  if (cards) cards.classList.toggle('hidden', view !== 'cards');
  if (table) table.classList.toggle('hidden', view !== 'table');
  ['cards', 'table'].forEach(name => {
    const button = $c(`orders-view-${name}-btn`);
    if (!button) return;
    const active = name === view;
    button.className = `px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${active ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-400'}`;
  });
}

function relativeOrderTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function renderActiveOrderCard(order) {
  const type = order.order_type === 'dine_in' ? 'Dine-in' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
  const context = order.order_type === 'dine_in'
    ? `Table ${escapeOrderValue(order.table_number || 'N/A')}`
    : order.order_type === 'delivery'
      ? escapeOrderValue(order.customer_name || order.delivery_address || 'Delivery customer')
      : escapeOrderValue(order.customer_name || 'Counter order');
  const statusTone = order.order_status === 'served' ? 'bg-violet-100 text-violet-700' : order.order_status === 'ready' ? 'bg-emerald-100 text-emerald-700' : order.order_status === 'preparing' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
  const canPayAndComplete = currentUserHasPermission('orders.take_payment') && currentUserHasPermission('orders.complete');
  return `<article class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm active:scale-[0.99] transition-all">
    <div class="flex items-start justify-between gap-3">
      <div><div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Order #${order.order_number || order.id}</div><div class="mt-1 text-lg font-black text-slate-900 dark:text-white">${context}</div></div>
      <span class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${statusTone}">${escapeOrderValue(order.order_status || 'pending')}</span>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div><span class="block text-[9px] uppercase tracking-widest text-slate-400 font-black">Placed</span><span class="font-bold text-slate-700 dark:text-slate-200">${relativeOrderTime(order.created_at)}</span></div>
      <div><span class="block text-[9px] uppercase tracking-widest text-slate-400 font-black">Service</span><span class="font-bold text-slate-700 dark:text-slate-200">${type}</span></div>
      <div><span class="block text-[9px] uppercase tracking-widest text-slate-400 font-black">Waiter</span><span class="font-bold text-slate-700 dark:text-slate-200">${escapeOrderValue(order.waiter_name || '-')}</span></div>
      <div><span class="block text-[9px] uppercase tracking-widest text-slate-400 font-black">Total</span><span class="font-black text-indigo-600 dark:text-indigo-300">PKR ${Number(order.total || 0).toLocaleString()}</span></div>
    </div>
    <div class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
      ${currentUserHasPermission('orders.view') ? `<button onclick="viewOrderItems(${order.id})" class="flex-1 min-w-[120px] py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black">Order Details</button>` : ''}
      ${currentUserHasPermission('orders.update') ? `<button onclick="editOrder(${order.id})" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black">Edit</button>` : ''}
      ${order.order_type === 'dine_in' && order.order_status === 'ready' && (Number(order.user_id) === Number(currentUser?.id) || Number(order.waiter_id) === Number(currentUser?.id) || currentUser?.role === 'receptionist') ? `<button onclick="markOrderServed(${order.id})" class="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-black">Mark Served</button>` : canPayAndComplete ? `<button onclick="showOrderCompleteModal(${order.id})" class="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black">Pay</button>` : currentUserHasPermission('orders.complete') ? `<button onclick="completeOrderFromPOS(${order.id})" class="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black">Complete</button>` : ''}
    </div>
  </article>`;
}

async function markOrderServed(id) {
  if (!confirm('Confirm that this order has been handed to the guest?')) return;
  showAppLoader('Marking order served', `Updating order #${id}...`);
  try {
    const result = await api(`/api/kds/${id}/status`, 'PATCH', { status: 'served' });
    if (result?.error) throw new Error(result.error);
    toast('Order marked as served.', 'success');
    renderPOSOrders();
  } catch (error) {
    toast(error.message || 'Could not mark the order as served.', 'error');
  } finally {
    hideAppLoader();
  }
}

let _printBillCustomerSuggestTimer = null;
function suggestPrintBillCustomers(query, targetId) {
  const box = $c(`${targetId}-suggestions`);
  if (!box) return;
  const q = String(query || '').trim();
  if (window._printBillSelectedCustomer && ![window._printBillSelectedCustomer.name, window._printBillSelectedCustomer.phone].includes(q)) {
    window._printBillSelectedCustomer = null;
  }
  ['pp-customer-name-suggestions', 'pp-customer-phone-suggestions'].forEach(id => {
    if (id !== `${targetId}-suggestions`) $c(id)?.classList.add('hidden');
  });
  clearTimeout(_printBillCustomerSuggestTimer);
  if (!q) return box.classList.add('hidden');
  _printBillCustomerSuggestTimer = setTimeout(async () => {
    try {
      const customers = await api(`/api/customers?status=active&search=${encodeURIComponent(q)}`);
      const matches = Array.isArray(customers) ? customers.slice(0, 6) : [];
      box.innerHTML = matches.map(customer => `<button type="button" onclick="selectPrintBillCustomer(${Number(customer.id)})" class="w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"><span class="block text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(customer.name)}</span><span class="block text-xs text-slate-500">${escapeOrderValue(customer.phone || 'No phone')} · ${Number(customer.current_balance || 0) > 0.01 ? `Due Rs. ${Number(customer.current_balance).toFixed(2)}` : 'No due'}</span></button>`).join('');
      box.dataset.customers = JSON.stringify(matches);
      box.classList.toggle('hidden', !matches.length);
    } catch (_) { box.classList.add('hidden'); }
  }, 250);
}

function selectPrintBillCustomer(customerId) {
  const boxes = [$c('pp-customer-name-suggestions'), $c('pp-customer-phone-suggestions')];
  const customers = boxes.flatMap(box => { try { return JSON.parse(box?.dataset.customers || '[]'); } catch (_) { return []; } });
  const customer = customers.find(item => Number(item.id) === Number(customerId));
  if (!customer) return;
  window._printBillSelectedCustomer = customer;
  $c('pp-customer-name').value = customer.name || '';
  $c('pp-customer-phone').value = customer.phone || '';
  boxes.forEach(box => box?.classList.add('hidden'));
}

async function updateDeliveryStatus(id, status) {
  try {
    await api(`/api/delivery/${id}/status`, 'PATCH', { status });
    toast('Delivery status updated');
    renderPOSOrders();
  } catch (e) {
    toast(e.message, 'error');
    renderPOSOrders();
  }
}

async function viewOrderItems(id, readOnly = false) {
  showAppLoader('Opening order details', `Loading order #${id}...`);
  try {
    const [data, assignableUsers] = await Promise.all([
      api(`/api/sales/${id}/bill`),
      readOnly ? Promise.resolve([]) : api('/api/users/assignable').catch(() => [])
    ]);
    if (!data || !data.sale) return toast("Order not found", "error");
    const sale = data.sale;
    const isDelivery = sale.order_type === 'delivery';
    const isPaymentPaid = Number(sale.amount_received || 0) >= Number(sale.total || 0) - 0.01;
    const canEditOrder = !readOnly && currentUserHasPermission('orders.update');
    const canEditDelivery = canEditOrder && isDelivery && !['ready', 'completed'].includes(sale.order_status);
    const serviceLabel = sale.order_type === 'dine_in' ? 'Dine-in' : sale.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
    const currentRiderId = Number(sale.rider_id || 0);
    const riderList = Array.isArray(assignableUsers) ? [...assignableUsers] : [];
    if (currentRiderId && !riderList.some(u => Number(u.id) === currentRiderId)) {
      riderList.push({
        id: sale.rider_id,
        name: sale.rider_name || `Rider #${sale.rider_id}`,
        role: 'assigned'
      });
    }
    const riderOptions = [
      `<option value="">No rider assigned</option>`,
      ...riderList.map(u => `<option value="${Number(u.id)}" ${currentRiderId === Number(u.id) ? 'selected' : ''}>${escapeOrderValue(u.name)}${u.role ? ` (${escapeOrderValue(u.role)})` : ''}</option>`)
    ].join('');
    const kitchenStatusesHtml = Array.isArray(data.kitchen_statuses) && data.kitchen_statuses.length ? `
      <div class="p-4 rounded-2xl border border-orange-100 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20">
        <h4 class="mb-3 text-xs font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">Kitchen terminal status</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${data.kitchen_statuses.map(kitchen => `<label class="block"><span class="mb-1 block text-[10px] font-black text-slate-500">${escapeOrderValue(kitchen.kitchen_name || kitchen.kitchen_username || `Kitchen #${kitchen.kitchen_id}`)}</span><select disabled class="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-100 dark:border-orange-900 dark:bg-slate-900 dark:text-slate-200"><option selected>${escapeOrderValue(kitchen.status || 'pending')}</option></select></label>`).join('')}
        </div>
      </div>` : '';

    const itemsHtml = data.items.map(item => `
        <div class="flex items-center justify-between py-3 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
              ${item.quantity}x
            </div>
            <div>
              <div class="text-sm font-bold text-slate-800 dark:text-slate-200">${escapeOrderValue(configuredOrderItemName(item.product_name, item.variants_json, item.addons_json))}</div>
              ${item.special_instructions ? `<div class="text-[10px] italic text-amber-500">${escapeOrderValue(item.special_instructions)}</div>` : ''}
            </div>
          </div>
          <div class="text-sm font-black text-slate-700 dark:text-slate-300">
            PKR ${(item.quantity * item.price_at_sale).toLocaleString()}
          </div>
        </div>
    `).join('');

    const orderInfoHtml = isDelivery ? `
      <div class="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/40 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Delivery Info</h4>
            <p class="text-[10px] font-bold text-slate-500 mt-0.5">Edit before marking out for delivery</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg ${isPaymentPaid ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'} text-[10px] font-black uppercase">${isPaymentPaid ? 'Paid' : 'Unpaid'}</span>
            <span class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-[10px] font-black uppercase text-slate-500 border border-blue-100 dark:border-blue-900/40">${escapeOrderValue(sale.order_status || 'pending')}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer Name</label>
            <input id="order-info-name" value="${escapeOrderValue(sale.customer_name || '')}" ${canEditDelivery ? '' : 'disabled'} class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 text-sm font-bold text-slate-900 dark:text-white disabled:opacity-60 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone Number</label>
            <input id="order-info-phone" value="${escapeOrderValue(sale.customer_phone || '')}" ${canEditDelivery ? '' : 'disabled'} class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 text-sm font-bold text-slate-900 dark:text-white disabled:opacity-60 focus:outline-none focus:border-blue-500" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Address</label>
            <input id="order-info-address" value="${escapeOrderValue(sale.delivery_address || '')}" ${canEditDelivery ? '' : 'disabled'} class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 text-sm font-bold text-slate-900 dark:text-white disabled:opacity-60 focus:outline-none focus:border-blue-500" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rider</label>
            ${canEditDelivery
              ? `<select id="order-info-rider" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500">${riderOptions}</select>`
              : `<div class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 text-sm font-bold text-slate-600 dark:text-slate-300">${escapeOrderValue(sale.rider_name || 'No rider assigned')}</div>`
            }
          </div>
        </div>
        ${canEditDelivery ? `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <button onclick="saveDeliveryOrderInfo(${id})" class="py-2.5 rounded-xl bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-black text-xs uppercase tracking-widest hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">Save Info</button>
            <button onclick="saveDeliveryOrderInfo(${id}, 'ready')" class="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all">Mark Out for Delivery</button>
          </div>
        ` : `<p class="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 rounded-xl px-3 py-2">Delivery info is locked after the order is out for delivery.</p>`}
      </div>
    ` : `
      <div class="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
        <div><span class="block text-slate-400 font-black uppercase tracking-widest text-[9px]">Service</span><span class="font-bold text-slate-700 dark:text-slate-200">${serviceLabel}</span></div>
        <div><span class="block text-slate-400 font-black uppercase tracking-widest text-[9px]">Status</span><span class="font-bold text-slate-700 dark:text-slate-200">${escapeOrderValue(sale.order_status || 'pending')}</span></div>
        <div><span class="block text-slate-400 font-black uppercase tracking-widest text-[9px]">Customer</span><span class="font-bold text-slate-700 dark:text-slate-200">${escapeOrderValue(sale.customer_name || 'Walk-in')}</span></div>
        <div><span class="block text-slate-400 font-black uppercase tracking-widest text-[9px]">Phone</span><span class="font-bold text-slate-700 dark:text-slate-200">${escapeOrderValue(sale.customer_phone || 'No phone')}</span></div>
      </div>
    `;

    openModal(`Order #${sale.order_number || id} - Details`, `
      <div class="space-y-4">
        ${orderInfoHtml}
        ${kitchenStatusesHtml}
        <div class="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 max-h-[60vh] overflow-y-auto">
          ${itemsHtml}
        </div>
        <div class="flex justify-between items-center p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
          <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Total Amount</span>
          <span class="text-xl font-black text-indigo-700 dark:text-indigo-300">PKR ${data.sale.total.toLocaleString()}</span>
        </div>
        <div class="grid ${canEditOrder ? 'grid-cols-2' : 'grid-cols-1'} gap-3">
          <button onclick="closeModal()" class="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-200 transition-all">Close</button>
          ${canEditOrder ? `<button onclick="closeModal(); editOrder(${id})" class="py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20">Edit Order</button>` : ''}
        </div>
      </div>
    `, "max-w-2xl");
  } catch (e) {
    toast("Failed to load items: " + e.message, "error");
  } finally {
    hideAppLoader();
  }
}

async function saveDeliveryOrderInfo(id, nextStatus = null) {
  if (!currentUserHasPermission('orders.update')) return toast('You do not have permission to edit orders.', 'error');
  const payload = {
    customer_name: $c('order-info-name')?.value.trim() || '',
    customer_phone: $c('order-info-phone')?.value.trim() || '',
    delivery_address: $c('order-info-address')?.value.trim() || '',
    rider_id: $c('order-info-rider')?.value ? parseInt($c('order-info-rider').value, 10) : null,
  };

  if (nextStatus === 'ready') {
    if (!payload.customer_name) return toast("Customer name is required", "error");
    if (!payload.customer_phone) return toast("Phone number is required", "error");
    if (!payload.delivery_address) return toast("Delivery address is required", "error");
  }

  try {
    await api(`/api/sales/${id}/details`, 'PATCH', payload);
    if (nextStatus) {
      await api(_currentPage === 'delivery' ? `/api/delivery/${id}/status` : `/api/kds/${id}/status`, 'PATCH', { status: nextStatus });
      toast("Order marked out for delivery");
    } else {
      toast("Delivery info updated");
    }
    closeModal();
    renderPOSOrders();
  } catch (e) {
    toast(e.message, 'error');
  } finally { hideAppLoader(); }
}

async function editOrder(id) {
  if (!currentUserHasPermission('orders.update')) return toast('You do not have permission to edit orders.', 'error');
  showAppLoader('Opening order editor', 'Loading order and menu items...');
  try {
    if (!allProducts || allProducts.length === 0) {
      const products = await api("/api/products");
      allProducts = products;
      syncProductMap(products);
    }

    const details = await api(`/api/sales/${id}/bill`);
    if (!details || !details.sale) return toast("Order details not found", "error");

    _tempEditSaleDetails = details.sale;
    _tempEditCart = details.items.map(item => {
      const p = productMap[item.product_id];
      return {
        product_id: item.product_id,
        name: item.product_name,
        quantity: item.quantity,
        original_quantity: Number(item.quantity),
        selling_price: Number(item.price_at_sale),
        buying_price: Number(item.buying_price_at_sale),
        special_instructions: item.special_instructions,
        variants: item.variants_json ? JSON.parse(item.variants_json) : [],
        addons: item.addons_json ? JSON.parse(item.addons_json) : [],
        product: p || null,
        batch_id: item.batch_id,
        stock_variant_id: item.stock_variant_id,
        parent_id: item.parent_id
      };
    });

    renderEditOrderModal(id);
  } catch (e) {
    console.error(e);
    toast("Failed to load order for editing: " + e.message, "error");
  } finally { hideAppLoader(); }
}

function renderEditOrderModal(id) {
  const displayOrderNumber = _tempEditSaleDetails?.order_number || id;
  const itemsHtml = _tempEditCart.map((item, index) => `
    <div class="flex items-center justify-between py-4 border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-xl transition-all group">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shadow-sm">
          ${item.quantity}x
        </div>
        <div>
          <div class="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">${escapeOrderValue(configuredOrderItemName(item.name, item.variants, item.addons))}</div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">PKR ${item.selling_price.toLocaleString()} / unit</div>
          ${item.special_instructions ? `<div class="text-[10px] italic text-amber-500 font-medium mt-0.5">"${item.special_instructions}"</div>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl" aria-label="Change quantity for ${escapeOrderValue(item.name)}">
          <button type="button" onclick="updateTempOrderItemQty(${index}, ${item.quantity - 1}, ${id})"
            class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 font-black shadow-sm transition-all"
            title="${item.quantity > 1 ? 'Decrease quantity' : 'Remove product'}" aria-label="${item.quantity > 1 ? 'Decrease quantity' : 'Remove product'}">−</button>
          <span class="w-8 text-center text-sm font-black text-slate-800 dark:text-slate-100">${item.quantity}</span>
          <button type="button" onclick="updateTempOrderItemQty(${index}, ${item.quantity + 1}, ${id})"
            class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 font-black shadow-sm transition-all"
            title="Increase quantity" aria-label="Increase quantity">+</button>
        </div>
        <div class="text-sm font-black text-slate-900 dark:text-white">PKR ${(item.quantity * item.selling_price).toLocaleString()}</div>
        ${currentUserHasPermission('orders.remove_items') ? `<button type="button" onclick="removeTempOrderItem(${index}, ${id})" class="p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" title="Remove product" aria-label="Remove ${escapeOrderValue(item.name)} from order">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>` : ''}
      </div>
    </div>
  `).join('');

  openModal(`Edit Order #${displayOrderNumber}`, `
    <div class="space-y-6">
      <div class="p-1 px-1 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
        <button onclick="proceedToPOSUpdate(${id})" class="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          Update Order / Add More Items
        </button>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between px-2 mb-3">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Order Items</span>
          <span class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">${_tempEditCart.length} Active Items</span>
        </div>
        <div class="max-h-[50vh] overflow-y-auto custom-scrollbar space-y-1 pr-2">
          ${_tempEditCart.length ? itemsHtml : '<div class="py-10 text-center text-slate-400 text-xs font-bold uppercase tracking-widest italic opacity-50">No items remaining</div>'}
        </div>
      </div>

      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <div class="flex justify-between items-center mb-6 px-1">
          <div class="text-xs font-black text-slate-400 uppercase tracking-widest">Modified Total</div>
          <div class="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">PKR ${(_tempEditCart.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0)).toLocaleString()}</div>
        </div>
        <button onclick="closeModal()" class="w-full py-3 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-black text-xs uppercase tracking-[0.2em] transition-all">Cancel Changes</button>
      </div>
    </div>
  `, "max-w-xl");
}

function removeTempOrderItem(index, id) {
  if (!currentUserHasPermission('orders.remove_items')) return toast('You may add items, but cannot remove existing order items.', 'error');
  _tempEditCart.splice(index, 1);
  renderEditOrderModal(id);
}

function updateTempOrderItemQty(index, qty, id) {
  const item = _tempEditCart[index];
  if (!item) return;

  const nextQty = Number(qty);
  if (!Number.isFinite(nextQty)) return;
  if (nextQty < Number(item.original_quantity) && !currentUserHasPermission('orders.remove_items')) {
    return toast('Reducing or removing an existing product requires Remove Order Items access.', 'error');
  }
  if (nextQty < 1) return removeTempOrderItem(index, id);

  item.quantity = nextQty;
  renderEditOrderModal(id);
}

function proceedToPOSUpdate(id) {
  if (_tempEditCart.length === 0) {
    if (!confirm("Your order is empty. Proceed to POS to add new items?")) return;
  }

  cart = [..._tempEditCart];
  _editingOrderId = id;
  window._posEntryOrderType = _tempEditSaleDetails.order_type || 'dine_in';
  window._posSelectedTableId = _tempEditSaleDetails.table_id
    ? Number(_tempEditSaleDetails.table_id)
    : null;
  _posSelectedCustomer = _tempEditSaleDetails.customer_id ? { 
    id: _tempEditSaleDetails.customer_id, 
    name: _tempEditSaleDetails.customer_name, 
    phone: _tempEditSaleDetails.customer_phone 
  } : null;

  closeModal();
  navigate(_currentPage === 'delivery' ? 'delivery' : 'pos');

  // Restore checkout headers/extra info if needed
  setTimeout(() => {
    if ($c('pos-discount-preset')) $c('pos-discount-preset').value = '';
    if ($c('pos-tax-preset')) $c('pos-tax-preset').value = '';
    if ($c('pos-discount')) $c('pos-discount').value = _tempEditSaleDetails.discount || 0;
    if ($c('pos-tax')) $c('pos-tax').value = _tempEditSaleDetails.tax_percentage || 0;
    if ($c('pos-received')) $c('pos-received').value = _tempEditSaleDetails.amount_received || 0;
    if ($c('delivery-money-received')) $c('delivery-money-received').checked = Number(_tempEditSaleDetails.amount_received || 0) > 0.01;
    if ($c('pos-cust-name')) $c('pos-cust-name').value = _tempEditSaleDetails.customer_name || '';
    if ($c('pos-cust-phone')) $c('pos-cust-phone').value = _tempEditSaleDetails.customer_phone || '';
    
    switchOrderType(_tempEditSaleDetails.order_type || 'dine_in');
    
    renderCart();
    calculateCartTotal();
    toast(`Editing Order #${_tempEditSaleDetails?.order_number || id} in POS`, "info");
  }, 100);
}

function cancelEdit() {
  if (!confirm("Are you sure you want to cancel editing? Changes will be lost.")) return;
  _editingOrderId = null;
  cart = [];
  renderCart();
  calculateCartTotal();
  toast("Edit cancelled");
}

async function completeOrderFromPOS(id, skipConfirm = false) {
  if (!currentUserHasPermission('orders.complete')) return toast('You do not have permission to complete orders.', 'error');
  if (!skipConfirm && !confirm('Are you sure you want to complete this order and move it to sales history?')) return false;
  try {
    const result = await api(_currentPage === 'delivery' ? `/api/delivery/${id}/status` : `/api/kds/${id}/status`, 'PATCH', { status: 'completed' });
    if (result?.error) throw new Error(result.error);
    toast('Order completed!');
    renderPOSOrders();
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

async function showOrderCompleteModal(id) {
  if (!currentUserHasPermission('orders.take_payment') || !currentUserHasPermission('orders.complete')) {
    return toast('Payment and complete permissions are required for this action.', 'error');
  }
  const s = _posActiveOrders.find(o => o.id === id);
  if (!s) return toast('Order not found', 'error');
  showAppLoader('Preparing payment', `Opening payment for order #${id}...`);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const name = s.customer_name || '';
  const phone = s.customer_phone || '';
  const total = Number(s.total || 0);
  const discount = Number(s.discount || 0);
  const taxPercentage = Number(s.tax_percentage || 0);
  const taxableSubtotal = taxPercentage === -100 ? total : total / (1 + (taxPercentage / 100));
  const subtotal = taxableSubtotal + discount;
  const taxAmount = total - taxableSubtotal;
  const received = Number(s.amount_received || 0) > 0.01 ? Number(s.amount_received) : Number(s.total);
  window._completeOrderSelectedCustomer = s.customer_id ? { id: s.customer_id, name, phone } : null;

  openModal('Collect Payment', `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div class="relative">
          <label class="block text-xs font-bold text-slate-500 mb-1">Customer Name</label>
          <input id="op-name" type="text" autocomplete="off" placeholder="Search or enter customer" value="${name}" oninput="suggestCompleteOrderCustomers(this.value, 'op-name')" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
          <div id="op-name-suggestions" class="hidden absolute z-[130] left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"></div>
        </div>
        <div class="relative">
          <label class="block text-xs font-bold text-slate-500 mb-1">Phone Number</label>
          <input id="op-phone" type="text" autocomplete="off" placeholder="Search or enter phone" value="${phone}" oninput="suggestCompleteOrderCustomers(this.value, 'op-phone')" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
          <div id="op-phone-suggestions" class="hidden absolute z-[130] left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"></div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Amount Received</label>
          <input id="op-received" type="number" step="0.01" value="${received}" 
            oninput="updateCompleteOrderSummary(${total})"
            class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold text-xl text-emerald-600" />
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button type="button" onclick="$c('op-received').value='0';updateCompleteOrderSummary(${total})" class="py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-black">Pay 0</button>
            <button type="button" onclick="$c('op-received').value='${Number(total)}';updateCompleteOrderSummary(${total})" class="py-2 rounded-lg bg-emerald-600 text-white text-xs font-black">Pay Full</button>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">Payment Method</label>
          <select id="op-method" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold">
            <option value="cash" ${s.payment_method === 'cash' ? 'selected' : ''}>Cash</option>
            <option value="card" ${s.payment_method === 'card' ? 'selected' : ''}>Card</option>
            <option value="online" ${s.payment_method === 'online' ? 'selected' : ''}>Online</option>
          </select>
        </div>
      </div>

      <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-2">
        <div class="flex justify-between text-xs">
          <span class="text-slate-500 font-bold uppercase tracking-wider">Subtotal</span>
          <span class="text-slate-900 dark:text-white font-black">PKR ${subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-slate-500 font-bold uppercase tracking-wider">Tax Amount</span>
          <span class="text-slate-900 dark:text-white font-black">PKR ${taxAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div class="flex justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-700">
          <span class="text-slate-500 font-bold uppercase tracking-wider">Grand Total</span>
          <span class="text-slate-900 dark:text-white font-black">PKR ${total.toLocaleString()}</span>
        </div>
        <div id="oc-due-row" class="flex justify-between text-xs hidden">
          <span class="text-slate-500 font-bold uppercase tracking-wider">Remaining Due</span>
          <span id="oc-due" class="text-rose-500 font-black">PKR 0</span>
        </div>
        <div id="oc-change-row" class="flex justify-between text-xs hidden">
          <span class="text-slate-500 font-bold uppercase tracking-wider">Change to Give</span>
          <span id="oc-change" class="text-emerald-500 font-black">PKR 0</span>
        </div>
      </div>

      <div class="pt-2">
        <button onclick="updateAndCompleteOrder(${id})" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-600/25 transition-all">
          Complete Order
        </button>
      </div>
    </div>
  `, 'max-w-md');

  // Initial trigger to sync summary
  updateCompleteOrderSummary(total);
  hideAppLoader();
}

let _completeOrderCustomerSuggestTimer = null;
function suggestCompleteOrderCustomers(query, targetId) {
  const q = String(query || '').trim();
  const suggestionEl = document.getElementById(`${targetId}-suggestions`);
  if (!suggestionEl) return;
  const selectedValue = targetId === 'op-phone'
    ? String(window._completeOrderSelectedCustomer?.phone || '').trim()
    : String(window._completeOrderSelectedCustomer?.name || '').trim();
  if (window._completeOrderSelectedCustomer && q !== selectedValue) window._completeOrderSelectedCustomer = null;
  if (!q) {
    suggestionEl.classList.add('hidden');
    suggestionEl.innerHTML = '';
    return;
  }
  clearTimeout(_completeOrderCustomerSuggestTimer);
  _completeOrderCustomerSuggestTimer = setTimeout(async () => {
    try {
      const customers = await api(`/api/customers?status=active&search=${encodeURIComponent(q)}`);
      const results = Array.isArray(customers) ? customers.slice(0, 6) : [];
      suggestionEl.innerHTML = results.map((customer) => `
        <button type="button" onclick="selectCompleteOrderCustomer(${Number(customer.id)})" class="w-full px-4 py-3 text-left border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
          <span class="block text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(customer.name)}</span>
          <span class="block text-xs font-bold text-slate-500">${escapeOrderValue(customer.phone || 'No phone')} · Due: ${formatRegisterMoney(customer.current_balance)}</span>
        </button>`).join('');
      window._completeOrderCustomerResults = results;
      suggestionEl.classList.toggle('hidden', !results.length);
    } catch (_) {
      suggestionEl.classList.add('hidden');
    }
  }, 250);
}

function selectCompleteOrderCustomer(customerId) {
  const customer = (window._completeOrderCustomerResults || []).find((item) => Number(item.id) === Number(customerId));
  if (!customer) return;
  window._completeOrderSelectedCustomer = customer;
  if ($c('op-name')) $c('op-name').value = customer.name || '';
  if ($c('op-phone')) $c('op-phone').value = customer.phone || '';
  ['op-name-suggestions', 'op-phone-suggestions'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function updateCompleteOrderSummary(total) {
  const receivedInp = document.getElementById('op-received');
  if (!receivedInp) return;

  const received = parseFloat(receivedInp.value) || 0;
  const diff = received - total;

  const dueRow = document.getElementById('oc-due-row');
  const dueVal = document.getElementById('oc-due');
  const changeRow = document.getElementById('oc-change-row');
  const changeVal = document.getElementById('oc-change');

  if (diff < 0) {
    dueRow?.classList.remove('hidden');
    changeRow?.classList.add('hidden');
    if (dueVal) dueVal.textContent = `PKR ${Math.abs(diff).toLocaleString()}`;
  } else if (diff > 0) {
    dueRow?.classList.add('hidden');
    changeRow?.classList.remove('hidden');
    if (changeVal) changeVal.textContent = `PKR ${diff.toLocaleString()}`;
  } else {
    dueRow?.classList.add('hidden');
    changeRow?.classList.add('hidden');
  }
}

async function updateAndCompleteOrder(id) {
  const nameEl = $c('op-name');
  if (!nameEl) return;
  const s = _posActiveOrders.find(o => o.id === id);
  if (!s) return toast('Order not found', 'error');

  const customerName = nameEl.value.trim();
  const customerPhone = $c('op-phone').value.trim();
  const amountReceived = Math.max(parseFloat($c('op-received').value) || 0, 0);
  const previousReceived = Number(s.amount_received || 0);
  const total = Number(s.total || 0);
  const fullyPaid = amountReceived >= total - 0.01;

  if (!fullyPaid && (!customerName || !customerPhone)) {
    if (!customerName) nameEl.focus();
    else $c('op-phone').focus();
    return toast('Customer name and phone are required when a balance remains unpaid', 'error');
  }

  if (amountReceived > previousReceived + 0.01 && !(await ensureOpenShiftForPayment())) return;

  const data = {
    customer_id: window._completeOrderSelectedCustomer?.id || null,
    customer_name: customerName,
    customer_phone: customerPhone,
    payment_method: $c('op-method')?.value || s.payment_method || 'cash'
  };
  if (Math.abs(amountReceived - previousReceived) > 0.01) data.amount_received = amountReceived;

  showAppLoader(fullyPaid ? 'Completing payment' : 'Saving payment', `Processing order #${id}...`);
  try {
    const updateResult = await api(`/api/sales/${id}/details`, 'PATCH', data);
    if (updateResult?.error) throw new Error(updateResult.error);

    const completed = await completeOrderFromPOS(id, true);
    if (!completed) return;
    if (fullyPaid) await printCustomerBill(id);
    else await printUnpaidBill(id);
    closeModal();
    toast(fullyPaid
      ? 'Payment complete. Paid bill printed and order completed.'
      : 'Order completed. Remaining balance saved to the customer ledger.', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideAppLoader();
  }
}

function openPOSMobileCategories() {
  const drawer = $c('pos-mobile-categories');
  if (!drawer) return;
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
}

function closePOSMobileCategories() {
  const drawer = $c('pos-mobile-categories');
  if (!drawer) return;
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
}

function selectPOSMobileCategory(button) {
  filterPOSByCategory(button?.dataset.cat || null);
  closePOSMobileCategories();
}

function filterPOSByCategory(cat) {
  document.querySelectorAll('.cat-pill').forEach(pill => {
    const isActive = (!cat && !pill.dataset.cat) || pill.dataset.cat === cat;
    pill.className = isActive
      ? 'cat-pill active px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold border border-transparent transition-all'
      : 'cat-pill px-4 py-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all';
  });
  document.querySelectorAll('.pos-mobile-category-option').forEach(option => {
    const isActive = (!cat && !option.dataset.cat) || option.dataset.cat === cat;
    option.className = isActive
      ? 'pos-mobile-category-option w-full rounded-xl bg-indigo-600 px-3 py-3 text-left text-xs font-black text-white'
      : 'pos-mobile-category-option w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  });
  const mobileLabel = $c('pos-mobile-category-label');
  if (mobileLabel) mobileLabel.textContent = cat || 'All';
  _posProductCategory = cat || "";
  loadPOSProductsPage(1);
}

async function printUnpaidBillInquiry(id) {
  const customerName = $c('pp-customer-name')?.value.trim() || '';
  const paymentMethod = $c('pp-method')?.value || 'cash';
  const discount = Math.max(parseFloat($c('pp-discount')?.value) || 0, 0);
  const taxPercentage = Math.max(parseFloat($c('pp-tax')?.value) || 0, 0);
  try {
    await api(`/api/sales/${id}/inquiry-bill`, 'PATCH', {
      customer_name: customerName,
      payment_method: paymentMethod,
      discount,
      tax_percentage: taxPercentage
    });
    await printUnpaidBill(id);
    closeModal();
    await renderPOSOrders();
    toast('Unpaid bill printed. No payment was recorded.', 'success');
  } catch (e) {
    toast(e.message || 'Could not print unpaid bill', 'error');
  }
}

async function loadPOSProductsPage(page = 1) {
  const params = new URLSearchParams({
    paginate: '1', page: String(page), page_size: String(POS_PRODUCTS_PER_PAGE),
    menu_only: '1', exclude_components: '1'
  });
  if (_posProductSearch) params.set('search', _posProductSearch);
  if (_posProductCategory) params.set('category', _posProductCategory);
  const response = await api(`/api/products?${params.toString()}`);
  const products = Array.isArray(response?.items) ? response.items : [];
  _posServerPagination = response?.pagination || { page: 1, page_size: POS_PRODUCTS_PER_PAGE, total: products.length, total_pages: 1 };
  products.forEach(product => { productMap[product.id] = product; });
  allProducts = products;
  renderPOSProducts(products, _posServerPagination.page, _posServerPagination);
}

function renderPOSProducts(products, requestedPage = 1, serverPagination = null) {
  const el = $c("pos-products");
  if (!el) return;

  _posFilteredProducts = Array.isArray(products) ? products : [];
  const totalProducts = serverPagination ? Number(serverPagination.total || 0) : _posFilteredProducts.length;
  const totalPages = serverPagination ? Number(serverPagination.total_pages || 1) : Math.max(1, Math.ceil(totalProducts / POS_PRODUCTS_PER_PAGE));
  _posProductPage = Math.min(Math.max(Number(requestedPage) || 1, 1), totalPages);
  const pageStart = serverPagination ? (_posProductPage - 1) * Number(serverPagination.page_size || POS_PRODUCTS_PER_PAGE) : (_posProductPage - 1) * POS_PRODUCTS_PER_PAGE;
  products = serverPagination ? _posFilteredProducts : _posFilteredProducts.slice(pageStart, pageStart + POS_PRODUCTS_PER_PAGE);

  if (getPOSLayout() === "split" && _currentPage === "pos") {
    el.innerHTML = products.length ? `
      <table class="w-full min-w-[500px] text-left border-collapse">
        <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 shadow-sm">
          <tr>
            <th class="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Product</th>
            <th class="px-2 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Category</th>
            <th class="px-2 py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">Stock</th>
            <th class="px-2 py-2 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">Price</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          ${products.map((p) => {
            const isRecipe = inventoryIsRecipeProduct(p);
            const available = p.stock > 0 || isRecipe;
            const cartQty = cart.filter((item) => item.product_id === p.id).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return `
              <tr ${available ? `onclick="addToCart(${p.id})" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addToCart(${p.id}); }" tabindex="0" role="button"` : 'aria-disabled="true"'}
                class="group ${available ? 'cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 focus:bg-indigo-50 dark:focus:bg-indigo-950/20 focus:outline-none' : 'cursor-not-allowed opacity-50'} transition-colors" data-pos-product-id="${p.id}">
                <td class="px-3 py-1.5">
                  <div class="flex items-center gap-2">
                    <div class="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                      ${p.image_url
                        ? `<img src="${escapeOrderValue(p.image_url)}" alt="" class="h-full w-full object-cover" />`
                        : `<svg class="h-5 w-5 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`}
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <div class="truncate text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(p.name)}</div>
                        <span id="pos-table-cart-qty-${p.id}" class="${cartQty ? 'flex' : 'hidden'} min-w-6 h-6 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/60 px-1.5 text-[10px] font-black text-indigo-600 dark:text-indigo-400">${cartQty}</span>
                      </div>
                      <div class="mt-0.5 text-[10px] font-bold ${available ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}">${available ? (isRecipe ? 'Recipe available' : 'In stock') : 'Out of stock'}</div>
                    </div>
                  </div>
                </td>
                <td class="px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">${escapeOrderValue(p.category || '-')}</td>
                <td class="px-2 py-1.5 text-center text-xs font-black ${available ? 'text-slate-800 dark:text-slate-200' : 'text-rose-500'}">${isRecipe ? 'Recipe' : Number(p.stock || 0)}</td>
                <td class="px-2 py-1.5 text-right text-xs font-black text-emerald-700 dark:text-emerald-400">Rs. ${Number(p.selling_price || 0).toLocaleString()}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div class="p-12 text-center text-sm font-bold text-slate-400">No products matched your search.</div>';
    renderPOSProductsPagination(totalProducts, totalPages, pageStart);
    return;
  }

  el.innerHTML =
    products
      .map(
        (p) => `
    <button onclick="addToCart(${p.id})" ${getProductMenuStock(p) <= 0 ? "disabled" : ""}
      class="product-card group relative bg-white dark:bg-slate-900 rounded-3xl text-left flex flex-col p-4 border border-slate-100 dark:border-slate-800 ${getProductMenuStock(p) <= 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} transition-all overflow-hidden shadow-sm">
      
      <!-- Top Absolute Badges -->
      <div class="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full ${getProductMenuStock(p) > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-rose-50 dark:bg-rose-900/30'}">
        <div class="w-1.5 h-1.5 rounded-full ${getProductMenuStock(p) > 0 ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-rose-600 dark:bg-rose-500'}"></div>
        <span class="text-[10px] font-bold ${getProductMenuStock(p) > 0 ? 'text-emerald-800 dark:text-emerald-400' : 'text-rose-800 dark:text-rose-400'} pt-[0.5px]">
          ${getProductMenuStock(p) > 0 ? 'Available' : 'Out of stock'}
        </span>
      </div>

      <div class="absolute top-3 right-3 z-10 flex flex-col items-center justify-center px-2 py-1.5 rounded-xl ${getProductMenuStock(p) > 0 ? 'bg-emerald-50/90 dark:bg-emerald-900/40' : 'bg-rose-50/90 dark:bg-rose-900/40'} min-w-[2.5rem]">
        ${inventoryIsRecipeProduct(p)
            ? `<span class="text-xl font-black text-amber-500 leading-none">🍳</span>`
            : `<span class="text-xl font-black ${getProductMenuStock(p) > 0 ? 'text-emerald-800 dark:text-emerald-400' : 'text-rose-800 dark:text-rose-400'} leading-none tracking-tight">${getProductMenuStock(p)}</span>`
          }
      </div>

      <!-- Hero Image Layer -->
      ${p.image_url
            ? `<div class="w-full h-28 mt-5 mb-2 flex items-center justify-center">
                 <img src="${p.image_url}" alt="${p.name}" class="max-w-full max-h-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.1)]" />
               </div>`
            : `<div class="w-full h-28 mt-5 mb-2 flex items-center justify-center">
                 <svg class="w-10 h-10 text-slate-200 dark:text-slate-700 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
               </div>`
          }

      <div class="flex flex-col">
        
       

        <!-- Title -->
        <h4 class="text-lg font-black text-slate-900 dark:text-white leading-[1.1] mb-1 line-clamp-2 capitalize tracking-tight">${p.name}</h4>

        <!-- Decorative Dash -->
        <div class="flex items-center gap-1 mb-1.5">
          <div class="w-4 h-1 bg-indigo-500 rounded-full"></div>
          <div class="w-1 h-1 bg-indigo-500/60 rounded-full"></div>
        </div>

        <!-- Description (Optional Fallback) -->
        ${p.description ? `<p class="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug mb-1.5">${p.description}</p>` : ''}
        
        <div>
          <!-- Divider -->
          <div class="w-full h-px bg-slate-100 dark:bg-slate-800 mb-2 ${!p.description ? 'mt-2' : ''}"></div>

          <!-- Bottom Price Bar -->
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">${getProductMenuVariants(p).length > 1 ? 'Prices by size' : 'Price'}</span>
              <span class="text-[1rem] font-black text-emerald-950 dark:text-emerald-400 tracking-tight leading-none">${getProductMenuVariants(p).length > 1 ? `${getProductMenuVariants(p).length} options` : `Rs. <span class="pl-0.5">${getProductMenuVariants(p)[0]?.price ?? p.selling_price}</span>`}</span>
            </div>
            
            <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-800 dark:text-emerald-400 transition-colors duration-300 pointer-events-none">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </button>`
      )
      .join("") ||
    '<p class="text-slate-500 dark:text-slate-400 col-span-3 py-10 text-center italic text-lg">No products matched your search.</p>';
  renderPOSProductsPagination(totalProducts, totalPages, pageStart);
}

function renderPOSProductsPagination(totalProducts, totalPages, pageStart) {
  const pagination = $c("pos-products-pagination");
  if (!pagination) return;

  if (!totalProducts) {
    pagination.className = "hidden";
    pagination.innerHTML = "";
    return;
  }

  const firstProduct = pageStart + 1;
  const lastProduct = Math.min(pageStart + POS_PRODUCTS_PER_PAGE, totalProducts);
  const previousDisabled = _posProductPage <= 1;
  const nextDisabled = _posProductPage >= totalPages;

  pagination.className = "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  pagination.innerHTML = `
    <div class="min-w-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">
      <span class="hidden sm:inline">Showing </span>${firstProduct}-${lastProduct} of ${totalProducts}
    </div>
    <div class="flex items-center gap-2">
      <button type="button" onclick="changePOSProductsPage(${_posProductPage - 1})" ${previousDisabled ? "disabled" : ""}
        class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-400">
        Previous
      </button>
      <span class="min-w-[5rem] text-center text-xs font-black text-slate-700 dark:text-slate-200">${_posProductPage} / ${totalPages}</span>
      <button type="button" onclick="changePOSProductsPage(${_posProductPage + 1})" ${nextDisabled ? "disabled" : ""}
        class="h-8 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-400">
        Next
      </button>
    </div>`;
}

function changePOSProductsPage(page) {
  if (_posServerPagination) loadPOSProductsPage(page);
  else renderPOSProducts(_posFilteredProducts, page);
  $c("pos-products")?.scrollTo({ top: 0, behavior: "smooth" });
}

function refreshSplitPOSCartQuantities() {
  if (getPOSLayout() !== "split" || _currentPage !== "pos") return;
  allProducts.forEach((product) => {
    const badge = $c(`pos-table-cart-qty-${product.id}`);
    if (!badge) return;
    const quantity = cart
      .filter((item) => item.product_id === product.id)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    badge.textContent = quantity;
    badge.classList.toggle("hidden", !quantity);
    badge.classList.toggle("flex", !!quantity);
  });
}

var filterPOSProducts = debounce(() => {
  _posProductSearch = $c("pos-search")?.value.trim() || "";
  loadPOSProductsPage(1);
});

/**
 * Prompts user for quantity and selling price before adding to cart
 */
const POS_KITCHEN_NOTE_SUGGESTIONS = [
  "Less spicy", "More spicy", "No spice", "No salt", "Less salt",
  "No onion", "No garlic", "No sauce", "Sauce on side", "Extra cheese",
  "Well done", "Lightly cooked", "Cut in half", "Pack separately"
];

function kitchenNotePickerHtml() {
  return `
    <div class="space-y-2 pt-1">
      <div class="flex items-center justify-between gap-3">
        <label for="add-cart-note" class="text-sm font-bold text-slate-700 dark:text-slate-300">Kitchen / waiter note</label>
        <span class="text-[9px] font-black uppercase tracking-widest text-orange-500">Prints on kitchen ticket</span>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x" aria-label="Common kitchen note suggestions">
        ${POS_KITCHEN_NOTE_SUGGESTIONS.map(note => `<button type="button" data-kitchen-note="${escapeOrderValue(note)}" onclick="toggleKitchenNoteSuggestion(this)" class="shrink-0 snap-start rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[11px] font-bold text-orange-700 transition hover:border-orange-400 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300">${escapeOrderValue(note)}</button>`).join('')}
      </div>
      <textarea id="add-cart-note" rows="2" maxlength="300" placeholder="e.g. allergy alert, serve first, no garnish..." class="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"></textarea>
    </div>`;
}

function toggleKitchenNoteSuggestion(button) {
  const input = $c("add-cart-note");
  if (!input) return;
  const suggestion = String(button?.dataset?.kitchenNote || '').trim();
  const notes = input.value.split(',').map(value => value.trim()).filter(Boolean);
  const existingIndex = notes.findIndex(value => value.toLowerCase() === suggestion.toLowerCase());
  if (existingIndex >= 0) notes.splice(existingIndex, 1);
  else notes.push(suggestion);
  input.value = notes.join(', ');
  button.classList.toggle('bg-orange-500', existingIndex < 0);
  button.classList.toggle('text-white', existingIndex < 0);
  button.classList.toggle('border-orange-500', existingIndex < 0);
  button.setAttribute('aria-pressed', existingIndex < 0 ? 'true' : 'false');
}

function addToCart(productId) {
  const product = productMap[productId];
  if (!product) return;
  const isRecipe = inventoryIsRecipeProduct(product);
  if (!isRecipe && getProductMenuStock(product) <= 0) return toast("Out of stock", "error");

  // COMPOSITE PRODUCTS STILL NEED MODAL
  if (product.components && product.components.length > 0) {
    const compRows = product.components
      .map((c) => {
        const child = productMap[c.id];
        const looseStock = child ? child.stock : 0;
        const isOutOfStock = looseStock <= 0;
        const price = c.price || 0;

        return `
      <div class="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 px-2 -mx-2 rounded-xl transition-all">
        <div class="flex flex-col flex-1">
          <span class="text-xs font-bold text-slate-700 dark:text-slate-200">${c.name}</span>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">${c.quantity} per kit</span>
            <span class="text-[9px] font-medium text-slate-400 italic">| Rs. ${price}</span>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex flex-col items-end">
            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">In Bin</span>
            <span class="text-xs font-black ${isOutOfStock ? "text-rose-500" : "text-emerald-500"}">
              ${looseStock}
            </span>
          </div>

          <button onclick="sellPartModally(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${price}, ${product.id}, ${c.quantity})"
            class="px-3 py-1.5 rounded-xl ${isOutOfStock ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 border-amber-100" : "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 border-indigo-100"} text-[10px] font-bold hover:scale-105 transition-all border shadow-sm flex items-center gap-1.5">
            ${isOutOfStock ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Harvest & Sell' : "Sell Part"}
          </button>
        </div>
      </div>
    `;
      })
      .join("");

    const content = `
      <div class="space-y-6">
        <div class="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
          <div class="flex items-center gap-4 mb-3">
             <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
             </div>
             <div>
                <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-tight">${product.name}</h4>
                <div class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Full Product Composition</div>
             </div>
          </div>
          
          <div id="composite-stock-sum" class="p-3 mb-2 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-indigo-100 dark:border-indigo-800/50 flex gap-6">
             <div>
                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Complete Units</div>
                <div class="text-xl font-black text-indigo-600 dark:text-indigo-400">${product.stock}</div>
             </div>
             <div>
                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Current Loose</div>
                <div class="text-xl font-black text-amber-500">
                   ${(() => {
        const c = product.components[0];
        const child = productMap[c.id];
        if (!child || child.stock <= 0) return '0';

        const looseUnits = Math.ceil(child.stock / c.quantity);
        const remnant = child.stock % c.quantity;
        return `${looseUnits} <span class="text-[10px] font-black opacity-60">(${remnant || c.quantity} pcs left)</span>`;
      })()}
                </div>
             </div>
          </div>

          <p class="text-[11px] text-indigo-700/70 dark:text-indigo-300/60 leading-relaxed italic">This product is a bundle. Selling it will automatically deduct all components listed below from the inventory in the quantities specified.</p>
        </div>

        <div class="space-y-1">
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-1 h-1 rounded-full bg-slate-400"></span> Components Breakdown
          </div>
          <div class="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            ${compRows}
          </div>
        </div>

        <div class="flex justify-center pt-4 border-t border-slate-100 dark:border-slate-800">
          <div class="w-full max-w-xs space-y-1.5 text-center">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Sell Quantity</label>
            <input id="add-cart-qty" type="number" value="1" min="1" ${isRecipe ? '' : `max="${product.stock}"`} class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div class="hidden">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Bundle Price (Rs)</label>
            <input id="add-cart-price" type="number" value="${product.selling_price || 0}" min="0" class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
        </div>

        ${kitchenNotePickerHtml()}

        <div class="flex flex-col gap-2 pt-2">
        
          <button onclick="commitAddCart(${product.id})" class="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2">
             <span>Add Full Product to Cart</span>
             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          </button>
        </div>
      </div>
    `;
    openModal("Composite Product breakdown", content, "max-w-md");
    return;
  }

  // STANDARD MODAL FOR REGULAR PRODUCTS
  const configuredVariants = getProductMenuVariants(product);
  const configuredAddons = isRecipe ? (product.addons || []) : [];
  const defaultVariant = isRecipe
    ? (configuredVariants.find(v => v.is_default) || configuredVariants[0])
    : (configuredVariants.find(v => v.is_default && Number(v.stock) > 0) || configuredVariants.find(v => Number(v.stock) > 0));
  const content = `
    <div class="space-y-4 py-1">
      <div class="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
        <div class="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <div class="font-bold text-slate-900 dark:text-white">${product.name}</div>
          <div class="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 mt-0.5">
            SKU: ${product.sku} | ${isRecipe ? '🍳 Recipe-Based' : `In Stock: ${product.stock}`}
            ${product.batches && product.batches.length > 0 ? `<br/><span class="text-rose-500 font-bold uppercase">Cost: Rs. ${product.batches[0].buying_price}</span>` : ''}
          </div>
        </div>
      </div>

      ${configuredVariants.length ? `<div>
        <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select size <span class="text-rose-500">*</span></label>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${configuredVariants.map((variant) => `<label class="${!isRecipe && Number(variant.stock) <= 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"><input type="radio" name="pos-product-variant" value="${escapeOrderValue(variant.id)}" ${variant.id === defaultVariant?.id && (isRecipe || Number(variant.stock) > 0) ? 'checked' : ''} ${!isRecipe && Number(variant.stock) <= 0 ? 'disabled' : ''} onchange="updateConfiguredProductPrice(${productId})" class="peer sr-only"><span class="block p-3 text-center rounded-xl border border-slate-200 dark:border-slate-700 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 dark:peer-checked:bg-indigo-950/30"><strong class="block text-xs">${escapeOrderValue(variant.name)}</strong><small class="text-[10px] text-slate-500">Rs. ${Number(variant.price).toLocaleString()}${!isRecipe ? ` · ${Number(variant.stock)} left` : ''}</small></span></label>`).join('')}
        </div>
      </div>` : ''}

      ${configuredAddons.length ? `<div>
        <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Optional add-ons</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${configuredAddons.map((addon) => `<label class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"><span class="flex items-center gap-2"><input type="checkbox" name="pos-product-addon" value="${escapeOrderValue(addon.id)}" onchange="updateConfiguredProductPrice(${productId})" class="rounded text-indigo-600"><span class="text-xs font-bold">${escapeOrderValue(addon.name)}</span></span><span class="text-xs font-black text-emerald-600">+ Rs. ${Number(addon.price).toLocaleString()}</span></label>`).join('')}
        </div>
      </div>` : ''}

      <div class="flex justify-center">
        <div class="w-full max-w-sm space-y-2 text-center">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300">Quantity</label>
          <div class="flex items-center gap-2">
            <button type="button" onclick="$c('add-cart-qty').stepDown()" class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-black">-</button>
            <input id="add-cart-qty" type="number" value="1" min="1" ${isRecipe ? '' : `max="${product.stock}"`} class="flex-1 w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            <button type="button" onclick="$c('add-cart-qty').stepUp()" class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-black">+</button>
          </div>
        </div>
        <div class="hidden">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300">Selling Price (Rs)</label>
          <input id="add-cart-price" type="number" value="${defaultVariant ? Number(defaultVariant.price) : Number(product.selling_price || 0)}" min="0" class="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
        </div>
      </div>

      ${kitchenNotePickerHtml()}

      <div class="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <button onclick="closeModal()" class="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold transition-all">Cancel</button>
        <button onclick="commitAddCart(${productId})" class="flex-[2] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all">Add to Cart</button>
      </div>
    </div>
  `;
  openModal("Add to Cart", content, "max-w-xl");
}

function getConfiguredProductSelection(product) {
  const variants = getProductMenuVariants(product);
  const selectedVariantId = document.querySelector('input[name="pos-product-variant"]:checked')?.value;
  const variant = variants.length ? variants.find(v => String(v.id) === String(selectedVariantId)) : null;
  const selectedAddonIds = [...document.querySelectorAll('input[name="pos-product-addon"]:checked')].map(el => el.value);
  const addons = (product.addons || []).filter(addon => selectedAddonIds.includes(addon.id));
  return { variant, addons };
}

function updateConfiguredProductPrice(productId) {
  const product = productMap[productId];
  const priceInput = $c('add-cart-price');
  if (!product || !priceInput) return;
  const { variant, addons } = getConfiguredProductSelection(product);
  priceInput.value = (Number(variant?.price ?? product.selling_price ?? 0) + addons.reduce((sum, addon) => sum + Number(addon.price || 0), 0)).toFixed(2);
}

function commitAddCart(productId) {
  const qtyInput = $c("add-cart-qty");
  const priceInput = $c("add-cart-price");
  const qty = parseInt(qtyInput.value);
  const price = parseFloat(priceInput.value);
  const specialInstructions = String($c("add-cart-note")?.value || '').trim().replace(/\s+/g, ' ').slice(0, 300) || null;
  const product = allProducts.find((p) => p.id === productId);
  const isRecipe = inventoryIsRecipeProduct(product);
  const selection = getConfiguredProductSelection(product);

  if ((product.variants || []).length && !selection.variant) return toast('Select a size variant', 'error');
  if (!isRecipe && (product.stock_variants || []).length && !selection.variant) return toast('Select an available product variant', 'error');

  if (isNaN(qty) || qty <= 0) return toast("Invalid quantity", "error");
  if (isNaN(price) || price <= 0)
    return toast("Selling price must be greater than 0", "error");
  if (!isRecipe) {
    const availableStock = selection.variant ? Number(selection.variant.stock) : Number(product.stock);
    if (qty > availableStock)
      return toast(`Only ${availableStock} items available`, "error");

    const selectionKey = `${selection.variant?.id || 'regular'}:${selection.addons.map(a => a.id).sort().join(',')}:${(specialInstructions || '').toLowerCase()}`;
    const existing = cart.find((c) => c.product_id === productId && c.selection_key === selectionKey);
    if (existing) {
      if (existing.quantity + qty > availableStock)
        return toast("Exceeds available stock", "error");
      existing.quantity += qty;
      existing.selling_price = price;
    } else {
      addToCartObject();
    }
  } else {
    // Recipe item bypasses stock checks
    const selectionKey = `${selection.variant?.id || 'regular'}:${selection.addons.map(a => a.id).sort().join(',')}:${(specialInstructions || '').toLowerCase()}`;
    const existing = cart.find((c) => c.product_id === productId && c.selection_key === selectionKey);
    if (existing) {
      existing.quantity += qty;
      existing.selling_price = price;
    } else {
      addToCartObject();
    }
  }

  function addToCartObject() {
    const defaultBatch = (product.batches && product.batches.length > 0) ? product.batches[0].id : null;
    cart.push({
      product_id: productId,
      quantity: qty,
      selling_price: price,
      product,
      batch_id: defaultBatch,
      selection_key: `${selection.variant?.id || 'regular'}:${selection.addons.map(a => a.id).sort().join(',')}:${(specialInstructions || '').toLowerCase()}`,
      special_instructions: specialInstructions,
      variants: selection.variant ? [{ id: selection.variant.id, name: selection.variant.name, price: Number(selection.variant.price) }] : null,
      addons: selection.addons.map(addon => ({ id: addon.id, name: addon.name, price: Number(addon.price) })),
      stock_variant_id: !isRecipe && selection.variant ? Number(selection.variant.id) : null
    });
  }

  closeModal();
  renderCart();
  toast("Item added to cart", "success");
}

async function commitAddManualCart(name, price, parentId) {
  // Function logic improved and moved to commitSellPart
  sellPartModally(name, price, parentId, 1);
}

function sellPartModally(id, name, price, parentId, qtyInParent) {
  const parent = productMap[parentId];
  const content = `
    <div class="space-y-6">
      <div class="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
        <h4 class="font-bold text-slate-900 dark:text-white uppercase tracking-tight">${name}</h4>
        <div class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Selling from: ${parent.name}</div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</label>
          <input id="part-sell-qty" type="number" value="1" min="1" class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white outline-none" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Price (Rs)</label>
          <input id="part-sell-price" type="number" value="${price}" min="0" class="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-black text-center text-slate-900 dark:text-white outline-none" />
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="closeModal()" class="flex-1 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs">Cancel</button>
        <button onclick="commitSellPart(${id}, '${name.replace(/'/g, "\\'")}', ${parentId}, ${qtyInParent})" class="flex-[2] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 text-xs">
           Add Component to Cart
        </button>
      </div>
    </div>
  `;
  openModal("Sell Individual Component", content, "max-w-sm");
  setTimeout(() => $c("part-sell-qty").focus(), 100);
}

async function commitSellPart(id, name, parentId, qtyInParent) {
  const qty = parseInt($c("part-sell-qty").value);
  const price = parseFloat($c("part-sell-price").value);
  if (isNaN(qty) || qty <= 0) return toast("Invalid quantity", "error");

  let product = productMap[id];
  const parent = productMap[parentId];
  const currentStock = product ? product.stock : 0;

  // SMART HARVESTING LOGIC
  const neededStock = qty - currentStock;
  if (neededStock > 0) {
    const buildsToHarvest = Math.ceil(neededStock / qtyInParent);
    if (parent.stock < buildsToHarvest) {
      return toast(
        `Error: Even after breaking ${parent.stock} units of "${parent.name}", you only have ${currentStock + parent.stock * qtyInParent} pieces of "${name}" available.`,
        "error",
      );
    }

    try {
      toast(
        `Auto-harvesting ${buildsToHarvest} units of "${parent.name}"...`,
        "info",
      );
      const r = await api(`/api/products/${parentId}/harvest`, "POST", {
        count: buildsToHarvest,
      });
      if (r.error) return toast(r.error, "error");

      // Refresh local data
      allProducts = await api("/api/products");
      syncProductMap(allProducts); // Critical to update the map for child/parent links
      product = productMap[id];
      toast(`Successfully harvested ${name} from ${parent.name}`, "success");
    } catch (err) {
      return toast("Auto-harvest failed: " + err.message, "error");
    }
  }

  const productId = product ? product.id : null;
  // Key cart check: matches name AND parentId to keep rows distinct if needed
  const existing = cart.find(
    (c) =>
      (productId && c.product_id === productId && c.parent_id === parentId) ||
      (c.name === name && c.parent_id === parentId),
  );

  if (existing) {
    existing.quantity += qty;
    existing.selling_price = price;
  } else {
    // Default to first available batch
    const defaultBatch = (product && product.batches && product.batches.length > 0) ? product.batches[0].id : null;
    cart.push({
      product_id: productId,
      parent_id: parentId,
      name: name,
      quantity: qty,
      selling_price: price,
      product: product,
      batch_id: defaultBatch
    });
  }

  closeModal();
  renderCart();
  toast(`"${name}" added to cart`, "success");
}

async function harvestBuild(id) {
  try {
    const r = await api(`/api/products/${id}/harvest`, "POST");
    if (r.error) return toast(r.error, "error");
    toast("Build broken down into components!", "success");
    closeModal();
    renderProducts();
    renderPOS();
  } catch (err) {
    toast(err.message, "error");
  }
}

function updateCartQty(productId, qty) {
  const product = productMap[productId];
  const isRecipe = inventoryIsRecipeProduct(product);
  if (!isRecipe && product && qty > product.stock) return toast("Exceeds stock", "error");

  // Don't allow qty < 1. User must use delete button to remove.
  if (qty < 1) return toast("Quantity cannot be less than 1", "warning");

  const item = cart.find((c) => c.product_id === productId);
  if (_editingOrderId && item?.original_quantity && qty < Number(item.original_quantity) && !currentUserHasPermission('orders.remove_items')) {
    return toast('You may increase quantity, but reducing the original quantity requires Remove Order Items access.', 'error');
  }
  if (item) item.quantity = qty;

  renderCart();
}

function updateCartBatch(productId, batchId) {
  const item = cart.find((c) => c.product_id === productId);
  if (!item) return;
  item.batch_id = parseInt(batchId);
}

function removeFromCart(productId) {
  const item = cart.find((c) => c.product_id === productId);
  if (!canRemoveCartItem(item)) return toast('You cannot remove an existing item from this order.', 'error');
  cart = cart.filter((c) => c.product_id !== productId);
  renderCart();
}

function updateCartLineQty(index, qty) {
  const item = cart[index];
  if (!item) return;
  if (_editingOrderId && item.original_quantity && qty < Number(item.original_quantity) && !currentUserHasPermission('orders.remove_items')) {
    return toast('You may increase quantity, but reducing the original quantity requires Remove Order Items access.', 'error');
  }
  const product = item.product || productMap[item.product_id];
  const isRecipe = inventoryIsRecipeProduct(product);
  const stockVariant = item.stock_variant_id ? (product?.stock_variants || []).find(v => Number(v.id) === Number(item.stock_variant_id)) : null;
  if (!isRecipe && product && qty > Number(stockVariant?.stock ?? product.stock)) return toast('Exceeds stock', 'error');
  if (qty < 1) return toast('Quantity cannot be less than 1', 'warning');
  item.quantity = qty;
  renderCart();
}

function removeCartLine(index) {
  if (!canRemoveCartItem(cart[index])) return toast('You cannot remove an existing item from this order.', 'error');
  cart.splice(index, 1);
  renderCart();
}

function canRemoveCartItem(item) {
  return !_editingOrderId || currentUserHasPermission('orders.remove_items') || !item?.original_quantity;
}

function renderCart() {
  const cartEl = $c("cart-items");
  if (!cartEl) return;
  const compactCart = getPOSLayout() === "split" && _currentPage === "pos";

  if (!cart.length) {
    cartEl.innerHTML = `
      <div class="flex flex-col items-center justify-center ${compactCart ? 'py-2' : 'py-10'} opacity-30">
        <svg class="${compactCart ? 'w-6 h-6 mb-0.5' : 'w-12 h-12 mb-2'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        <p class="text-[10px] font-black uppercase tracking-widest">Cart is Empty</p>
      </div>`;
    calculateCartTotal();
    refreshSplitPOSCartQuantities();
    return;
  }

  cartEl.innerHTML = `
    <div class="${compactCart ? 'space-y-1' : 'space-y-3'}">
      ${cart.map((item, itemIndex) => `
        <div class="flex items-center justify-between ${compactCart ? 'p-1' : 'p-3'} rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative group">
          
          <div class="flex flex-col flex-1 ${compactCart ? 'pr-1' : 'pr-2'}">
            <span class="font-bold ${compactCart ? 'text-[11px]' : 'text-sm'} text-slate-800 dark:text-slate-200 leading-tight">${escapeOrderValue(configuredOrderItemName(item.product ? item.product.name : item.name, item.variants, item.addons))}</span>
            ${item.special_instructions ? `<span class="mt-0.5 text-[10px] font-bold italic text-orange-600 dark:text-orange-400">Note: ${escapeOrderValue(item.special_instructions)}</span>` : ''}
          </div>

          <div class="flex flex-col items-end ${compactCart ? 'gap-1' : 'gap-2'}">
            <div class="flex items-center ${compactCart ? 'gap-0.5 p-0' : 'gap-2 p-1'} bg-slate-50 dark:bg-slate-800 rounded-lg">
              <button onclick="if(${item.quantity} > 1) { updateCartLineQty(${itemIndex}, ${item.quantity - 1}); } else { toast('Use delete button to remove', 'info'); }"
                class="${compactCart ? 'w-4 h-4 text-[9px]' : 'w-6 h-6 text-xs'} flex items-center justify-center rounded bg-white dark:bg-slate-700 hover:bg-rose-50 text-slate-500 hover:text-rose-500 shadow-sm transition-all font-bold">−</button>
              <span class="${compactCart ? 'w-3 text-[10px]' : 'w-4 text-xs'} text-center font-black text-slate-800 dark:text-slate-200">${item.quantity}</span>
              <button onclick="updateCartLineQty(${itemIndex}, ${item.quantity + 1});"
                class="${compactCart ? 'w-4 h-4 text-[9px]' : 'w-6 h-6 text-xs'} flex items-center justify-center rounded bg-white dark:bg-slate-700 hover:bg-emerald-50 text-slate-500 hover:text-emerald-500 shadow-sm transition-all font-bold">+</button>
            </div>
          </div>

          <!-- Delete Button -->
          <button type="button" onclick="removeCartLine(${itemIndex});"
            class="${canRemoveCartItem(item) ? 'flex' : 'hidden'} ${compactCart ? 'ml-1 h-7 w-7' : 'ml-2 h-9 w-9'} shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-95 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60"
            title="Delete product" aria-label="Delete ${escapeOrderValue(item.product ? item.product.name : item.name)} from cart">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      `).join('')}
    </div>
  `;

  calculateCartTotal();
  refreshSplitPOSCartQuantities();
}

/**
 * Opens a large modal to manage cart items details (useful for long carts)
 */
function showCartModal() {
  if (!cart.length) return toast("Cart is empty", "info");

  const content = `
    <div class="max-h-[65vh] overflow-y-auto custom-scrollbar pr-2">
      <table class="w-full text-left border-collapse">
        <thead class="sticky top-0 bg-white dark:bg-slate-900 z-10">
          <tr class="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-extrabold tracking-widest border-b border-slate-100 dark:border-slate-800">
            <th class="py-3 px-2">Product Info</th>
            <th class="py-3 px-2">Unit Price</th>
            <th class="py-3 px-2 text-center">Quantity</th>
            <th class="py-3 px-2 text-right">Total</th>
            <th class="py-3 px-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50 dark:divide-slate-800/50">
          ${cart
      .map(
        (item) => `
            <tr class="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
              <td class="py-2 px-2">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm transition-transform hover:scale-110">
                    ${(item.product && item.product.image_url)
            ? `<img src="${item.product.image_url}" class="w-full h-full object-cover" />`
            : `<svg class="w-6 h-6 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`
          }
                  </div>
                  <div>
                    <div class="font-bold text-slate-800 dark:text-slate-200 leading-tight">${escapeOrderValue(configuredOrderItemName(item.product ? item.product.name : item.name, item.variants, item.addons))}</div>
                    ${item.special_instructions ? `<div class="mt-1 text-[10px] font-bold italic text-orange-600 dark:text-orange-400">Kitchen note: ${escapeOrderValue(item.special_instructions)}</div>` : ''}
                ${item.product && item.product.batches && item.product.batches.length > 1
            ? `
                  <div class="mt-2">
                    <label class="text-[9px] uppercase font-bold text-slate-400 block mb-1">Select Batch (Cost)</label>
                    <select onchange="updateCartBatch(${item.product_id}, this.value)" class="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1 font-bold text-indigo-600 dark:text-indigo-400">
                      ${item.product.batches.map(b => `<option value="${b.id}" ${item.batch_id == b.id ? 'selected' : ''}>Cost: Rs. ${b.buying_price} (Qty: ${b.quantity})</option>`).join('')}
                    </select>
                  </div>
                `
            : (item.product && item.product.batches && item.product.batches.length === 1)
              ? `<div class="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Cost: Rs. ${item.product.batches[0].buying_price}</div>`
              : ''
          }
                ${item.parent_id
            ? `
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded tracking-widest uppercase">Kit Component</span>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium italic">From: ${productMap[item.parent_id]?.name || "Unknown"}</span>
                  </div>
                `
            : `
                  <div class="text-[10px] font-mono text-slate-400 dark:text-indigo-400 mt-0.5">${item.product ? item.product.sku : "MANUAL ITEM"}</div>
                `
          }
                  </div>
              </td>
              <td class="py-2 px-2 text-slate-600 dark:text-slate-400 font-medium">Rs. ${item.selling_price}</td>
              <td class="py-2 px-2">
                <div class="flex items-center justify-center gap-3">
                  <button onclick="if(${item.quantity} > 1) { updateCartQty(${item.product_id}, ${item.quantity - 1}); showCartModal(); } else { toast('Use delete button to remove', 'info'); }"
                    class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 transition-all font-bold group-hover:shadow-sm">−</button>
                  <span class="w-6 text-center text-sm font-black text-slate-900 dark:text-slate-100">${item.quantity}</span>
                  <button onclick="updateCartQty(${item.product_id}, ${item.quantity + 1}); showCartModal();"
                    class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-600 dark:text-slate-400 hover:text-emerald-600 transition-all font-bold group-hover:shadow-sm">+</button>
                </div>
              </td>
              <td class="py-2 px-2 text-right font-black text-indigo-600 dark:text-indigo-400">
                Rs. ${(item.selling_price * item.quantity).toFixed(0)}
              </td>
              <td class="py-2 px-2 text-right">
                <button onclick="removeFromCart(${item.product_id}); cart.length ? showCartModal() : closeModal();"
                  class="${canRemoveCartItem(item) ? '' : 'hidden'} p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" title="Remove">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </td>
            </tr>
          `,
      )
      .join("")}
        </tbody>
      </table>
    </div>
    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 -mx-6 -mb-6 p-4 rounded-b-2xl">
       <div class="text-sm text-slate-500 dark:text-slate-400">Total Items: <span class="font-bold text-slate-900 dark:text-slate-100">${cart.reduce((a, b) => a + b.quantity, 0)}</span></div>
       <div class="text-xl font-black text-slate-900 dark:text-white flex items-baseline gap-2">
         <span class="text-sm font-bold text-slate-400 uppercase tracking-wider">Net Total:</span>
         Rs. ${cart.reduce((a, b) => a + b.selling_price * b.quantity, 0).toFixed(0)}
       </div>
    </div>
  `;
  openModal("Detailed Cart Management", content, "max-w-7xl");
}

function getPOSCartSubtotal() {
  return cart.reduce((s, c) => s + c.selling_price * c.quantity, 0);
}

function clearPOSDiscountPreset() {
  const sel = $c("pos-discount-preset");
  if (sel) sel.value = "";
}

function clearPOSTaxPreset() {
  const sel = $c("pos-tax-preset");
  if (sel) sel.value = "";
}

function syncPOSDiscountPresetAmount(subtotal = getPOSCartSubtotal()) {
  const sel = $c("pos-discount-preset");
  const inp = $c("pos-discount");
  if (!inp) return 0;
  if (!sel || sel.value === "") return parseFloat(inp.value) || 0;

  const opt = sel.options[sel.selectedIndex];
  const value = parseFloat(sel.value) || 0;
  const discount = opt?.dataset.type === "percentage"
    ? (subtotal * value) / 100
    : value;
  inp.value = discount.toFixed(2);
  return discount;
}

function applyPOSDiscountPreset() {
  syncPOSDiscountPresetAmount();
  calculateCartTotal();
}

function applyPOSTaxPreset() {
  const sel = $c("pos-tax-preset");
  const inp = $c("pos-tax");
  if (!sel || !inp || sel.value === "") return calculateCartTotal();

  inp.value = (parseFloat(sel.value) || 0).toString();
  calculateCartTotal();
}

function applyPOSLinkedTaxPreset(method) {
  const sel = $c("pos-tax-preset");
  const inp = $c("pos-tax");
  if (!sel || !inp || !method) return false;

  const options = Array.from(sel.options);
  const matchIndex = options.findIndex((opt, index) =>
    index > 0 && opt.dataset.method === method
  );
  if (matchIndex === -1) {
    const selectedMethod = sel.options[sel.selectedIndex]?.dataset.method || "";
    if (selectedMethod) {
      sel.value = "";
      inp.value = "";
      calculateCartTotal();
      return true;
    }
    return false;
  }

  sel.selectedIndex = matchIndex;
  inp.value = (parseFloat(sel.options[matchIndex].value) || 0).toString();
  calculateCartTotal();
  return true;
}

function calculateCartTotal() {
  const subtotal = getPOSCartSubtotal();
  const discount = syncPOSDiscountPresetAmount(subtotal);
  const taxPct = parseFloat($c("pos-tax").value) || 0;

  const taxable = subtotal - discount;
  const taxAmt = taxable > 0 ? taxable * (taxPct / 100) : 0;
  const grandTotal = taxable > 0 ? taxable + taxAmt : 0;

  $c("cart-subtotal").textContent = "Rs. " + subtotal.toLocaleString();
  $c("cart-tax-amt").textContent = "Rs. " + taxAmt.toFixed(2);
  $c("cart-total").textContent = "Rs. " + grandTotal.toFixed(2);
  $c("cart-total").dataset.total = grandTotal;
  syncPOSCheckoutSummary(grandTotal);

  // Automatically set received as the total bill amount
  if (cart.length > 0) {
    $c("pos-received").value = grandTotal.toFixed(2);
  } else {
    $c("pos-received").value = 0;
  }

  // Update the visible POS action button when editing an existing order.
  const checkoutBtn = $c("checkout-btn");
  const kitchenBtn = $c("kitchen-btn");
  const visibleActionBtn = checkoutBtn || kitchenBtn;
  const compactAction = getPOSLayout() === "split" && _currentPage === "pos";

  if (_editingOrderId && visibleActionBtn && !$c("cancel-edit-btn")) {
    const cancelBtn = document.createElement("button");
    cancelBtn.id = "cancel-edit-btn";
    cancelBtn.onclick = cancelEdit;
    cancelBtn.className = `${compactAction ? "mt-1 py-1.5" : "mt-4 py-3"} w-full rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all`;
    cancelBtn.textContent = "Cancel Editing";
    visibleActionBtn.parentElement.appendChild(cancelBtn);
  } else if (!_editingOrderId) {
    $c("cancel-edit-btn")?.remove();
  }

  if (checkoutBtn && !_posCheckoutSubmitting) {
    if (_editingOrderId) {
      checkoutBtn.innerHTML = `<span>Update Order #${_tempEditSaleDetails?.order_number || _editingOrderId}</span>`;
      checkoutBtn.className = `${compactAction ? "py-1 text-xs h-9 rounded-xl gap-2" : "py-4 text-xl h-20 rounded-2xl gap-3"} bg-amber-500 hover:bg-amber-400 text-white font-black shadow-2xl transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center w-full`;
    } else {
      checkoutBtn.innerHTML = `<span>Place Order</span>`;
      checkoutBtn.className = `${compactAction ? "py-1 text-xs h-9 rounded-xl gap-2" : "py-4 text-xl h-20 rounded-2xl gap-3"} bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-black shadow-2xl transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center`;
    }
  }

  if (kitchenBtn && !_posCheckoutSubmitting) {
    kitchenBtn.innerHTML = _editingOrderId
      ? `<span>Update Kitchen #${_tempEditSaleDetails?.order_number || _editingOrderId}</span>`
      : `<span>Kitchen</span>`;
  }

  calculateRemaining();
}

function calculateRemaining() {
  const grandTotal = parseFloat($c("cart-total").dataset.total) || 0;
  const received = parseFloat($c("pos-received").value) || 0;
  const remaining = Number((grandTotal - received).toFixed(2));

  const el = $c("cart-remaining");
  const nameInp = $c("pos-cust-name");
  const phoneInp = $c("pos-cust-phone");
  const nameLabel = $c("pos-cust-name-label");
  const phoneLabel = $c("pos-cust-phone-label");
  const remainingSize = getPOSLayout() === "split" && _currentPage === "pos" ? "text-xs" : "text-xl";

  if (remaining <= 0) {
    el.textContent = "Change: Rs. " + Math.abs(remaining).toFixed(2);
    el.className = `font-bold text-emerald-400 ${remainingSize}`;
    if (nameInp) {
      nameInp.placeholder = "Optional";
      nameInp.classList.remove("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (nameLabel) nameLabel.classList.remove("text-rose-500");
    if (phoneInp) {
      phoneInp.placeholder = "Optional";
      phoneInp.classList.remove("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (phoneLabel) phoneLabel.classList.remove("text-rose-500");
  } else {
    el.textContent = "Due: Rs. " + remaining.toFixed(2);
    el.className = `font-bold text-rose-400 ${remainingSize}`;
    if (nameInp) {
      nameInp.placeholder = "REQUIRED for Dues";
      nameInp.classList.add("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (nameLabel) nameLabel.classList.add("text-rose-500");
    if (phoneInp) {
      phoneInp.placeholder = "REQUIRED for Dues";
      phoneInp.classList.add("border-rose-500", "bg-rose-50", "dark:bg-rose-950/20");
    }
    if (phoneLabel) phoneLabel.classList.add("text-rose-500");
  }
}

let _posCustSuggestTimeout = null;
async function suggestPOSCustomers(query, targetId) {
  const q = String(query || "").trim();
  const suggestionEl = document.getElementById(targetId + "-suggestions");
  if (!suggestionEl) return;

  if (_posSelectedCustomer) {
    const selectedValue = targetId === 'pos-cust-phone'
      ? String(_posSelectedCustomer.phone || '').trim()
      : String(_posSelectedCustomer.name || '').trim();
    if (q !== selectedValue) {
      _posSelectedCustomer = null;
      renderPOSSelectedCustomerBadge();
    }
  }

  // Hide the other one if open
  const otherId = targetId === 'pos-cust-name' ? 'pos-cust-phone' : 'pos-cust-name';
  const otherEl = document.getElementById(otherId + "-suggestions");
  if (otherEl) otherEl.classList.add("hidden");

  if (q.length < 1) {
    suggestionEl.innerHTML = "";
    suggestionEl.classList.add("hidden");
    return;
  }

  // Clear previous timeout for debouncing
  if (_posCustSuggestTimeout) clearTimeout(_posCustSuggestTimeout);

  _posCustSuggestTimeout = setTimeout(async () => {
    try {
      const customers = await api(`/api/customers?status=active&search=${encodeURIComponent(q)}`);
      const results = Array.isArray(customers) ? customers.slice(0, 5) : [];

      if (results.length === 0) {
        suggestionEl.innerHTML = "";
        suggestionEl.classList.add("hidden");
        return;
      }

      suggestionEl.innerHTML = results.map(c => {
        const balBadge = c.current_balance > 0
          ? `<span class="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[8px] font-black">DUE: RS. ${c.current_balance}</span>`
          : '';

        return `
        <button type="button" onclick="selectSuggestedCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})" 
                class="w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border-b border-slate-100 dark:border-slate-800 last:border-0 flex flex-col gap-0.5">
          <div class="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">${c.name}</div>
          <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>${c.phone || 'No Phone'}</span>
            ${balBadge}
          </div>
        </button>`;
      }).join("");

      suggestionEl.classList.remove("hidden");
    } catch (err) {
      console.error("Suggestion error:", err);
    }
  }, 300);
}

function selectSuggestedCustomer(c) {
  const nameInp = document.getElementById("pos-cust-name");
  const phoneInp = document.getElementById("pos-cust-phone");

  if (nameInp) nameInp.value = c.name;
  if (phoneInp) phoneInp.value = c.phone || "";
  _posSelectedCustomer = c;
  renderPOSSelectedCustomerBadge();

  // Hide both containers
  ['pos-cust-name-suggestions', 'pos-cust-phone-suggestions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = "";
      el.classList.add("hidden");
    }
  });
}

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
  const nameInp = document.getElementById("pos-cust-name");
  const phoneInp = document.getElementById("pos-cust-phone");

  ['pos-cust-name-suggestions', 'pos-cust-phone-suggestions'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.contains(e.target) && e.target !== nameInp && e.target !== phoneInp) {
      el.classList.add("hidden");
    }
  });
});

function toggleQuotationMode(isQuotation) {
  const btn = $c("checkout-btn");
  if (!btn) return;
  if (isQuotation) {
    btn.textContent = "📑 Print Quotation";
    btn.classList.add("bg-amber-500", "dark:bg-amber-400", "text-amber-950", "dark:text-amber-950");
    btn.classList.remove("bg-slate-900", "dark:bg-white", "text-white", "dark:text-slate-900");
  } else {
    btn.textContent = "Place Order";
    btn.classList.remove("bg-amber-500", "dark:bg-amber-400", "text-amber-950", "dark:text-amber-950");
    btn.classList.add("bg-slate-900", "dark:bg-white", "text-white", "dark:text-slate-900");
  }
}


/**
 * Auto-fills Amount Received if method is Card or Online
 */
function handlePOSMethodChange(method) {
  if (method === "card" || method === "online") {
    const total = parseFloat($c("cart-total").dataset.total) || 0;
    if (total > 0) {
      $c("pos-received").value = total.toFixed(2);
      calculateRemaining();
    }
  } else {
    calculateRemaining();
  }
}

function getPOSActionButton(status = "completed") {
  return status === "pending"
    ? ($c("kitchen-btn") || $c("checkout-btn"))
    : ($c("checkout-btn") || $c("kitchen-btn"));
}

function getPOSActionLabel(status = "completed", isEditing = false) {
  if (isEditing) return status === "pending" ? "Update Kitchen" : "Update Order";
  return status === "pending" ? "Kitchen" : "Place Order";
}

function setPOSActionSubmitting(status = "completed", isSubmitting = true, fallbackIsEditing = false) {
  const btn = getPOSActionButton(status);
  if (!btn) return null;

  if (isSubmitting) {
    if (!btn.dataset.idleHtml) btn.dataset.idleHtml = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<span>Processing...</span>`;
    return btn;
  }

  btn.disabled = false;
  btn.removeAttribute("aria-busy");
  if (btn.dataset.idleHtml) {
    btn.innerHTML = btn.dataset.idleHtml;
    delete btn.dataset.idleHtml;
  } else {
    btn.innerHTML = `<span>${getPOSActionLabel(status, fallbackIsEditing)}</span>`;
  }
  return btn;
}

function resetPOSCheckoutSubmission(status = "completed", fallbackIsEditing = false) {
  _posCheckoutSubmitting = false;
  window._lastOrderAutoPrintKitchen = false;
  setPOSActionSubmitting(status, false, fallbackIsEditing);
}

async function checkout(status = 'completed') {
  if (_posCheckoutSubmitting) return;
  if (!cart.length) return toast("Cart is empty", "error");

  // CLIENT SIDE QUOTATION CHECK
  if ($c("pos-is-quotation")?.checked) {
    return generateQuotation();
  }

  const isEditing = _editingOrderId !== null;
  const btn = setPOSActionSubmitting(status, true, isEditing);
  _posCheckoutSubmitting = true;

  if (status === 'completed' && !(await ensureOpenShiftForPayment())) {
    resetPOSCheckoutSubmission(status, isEditing);
    return;
  }

  const discount = parseFloat($c("pos-discount").value) || 0;
  const tax_percentage = parseFloat($c("pos-tax").value) || 0;
  const payment_method = $c("pos-method").value;
  let amount_received = parseFloat($c("pos-received").value) || 0;
  const grandTotal = parseFloat($c("cart-total").dataset.total) || 0;
  const deliveryMoneyReceived = _currentPage === 'delivery' && !!$c('delivery-money-received')?.checked;
  if (deliveryMoneyReceived) amount_received = grandTotal;
  else if (status !== 'completed') amount_received = 0;

  // Gather restaurant-specific fields
  const orderType = window._posOrderType || 'dine_in';
  let table_id = null, waiter_id = null, rider_id = null, kitchen_id = null, token_number = null,
    delivery_address = '', customer_name = '', customer_phone = '', guest_count = 1;

  if (orderType === 'dine_in') {
    table_id = parseInt($c('pos-table')?.value) || null;
    waiter_id = parseInt($c('pos-waiter')?.value) || null;
    guest_count = 1;
    customer_name = '';
    customer_phone = '';
    if (!table_id) {
      resetPOSCheckoutSubmission(status, isEditing);
      toast('Please choose a table for this dine-in order', 'error');
      return renderPOSTableSelection();
    }
    if (!waiter_id) {
      resetPOSCheckoutSubmission(status, isEditing);
      return toast('This table has no assigned order taker. Assign one in Table Management first.', 'error');
    }
  } else if (orderType === 'delivery') {
    delivery_address = $c('pos-delivery-addr')?.value.trim() || '';
    rider_id = parseInt($c('pos-rider')?.value) || null;
  } else if (orderType === 'takeaway') {
    token_number = $c('pos-token')?.value.trim() || `TK-${Date.now()}`;
  }

  // Unified Customer Details (override if set in the new sidebar fields)
  const sidebarName = $c('pos-cust-name')?.value.trim();
  const sidebarPhone = $c('pos-cust-phone')?.value.trim();
  if (sidebarName) customer_name = sidebarName;
  if (sidebarPhone) customer_phone = sidebarPhone;

  // Validation for Pending Dues
  if (status === 'completed' && amount_received < grandTotal - 0.01) {
    if (!customer_name || !customer_phone) {
      $c('pos-cust-name').focus();
      resetPOSCheckoutSubmission(status, isEditing);
      return toast("Customer Name & Phone are REQUIRED for Pending Dues", "error");
    }
  }

  // Legacy credit validation: only apply for dine-in
  if (orderType === 'dine_in') {
    const legacy_name = $c('pos-customer') ? $c('pos-customer').value.trim() : '';
    const legacy_phone = $c('pos-phone') ? $c('pos-phone').value.trim() : '';
    if (amount_received < grandTotal - 0.01 && (!legacy_name || !legacy_phone)) {
      // Allow if customer not required in restaurant mode
    }
  }

  const payload = {
    items: cart.map((c) => ({
      product_id: c.product_id,
      parent_id: c.parent_id || null,
      name: c.name || null,
      quantity: c.quantity,
      selling_price: c.selling_price,
      special_instructions: c.special_instructions || null,
      variants: c.variants || null,
      addons: c.addons || null,
      stock_variant_id: c.stock_variant_id || null,
    })),
    discount,
    tax_percentage,
    payment_method,
    amount_received,
    customer_name,
    customer_phone,
    delivery_address,
    order_type: orderType,
    table_id,
    waiter_id,
    rider_id,
    kitchen_id,
    guest_count,
    token_number,
    order_status: status,
    money_received: deliveryMoneyReceived,
    customer_id: _posSelectedCustomer?.id || null,
    client_request_id: window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  const url = isEditing ? `/api/sales/${_editingOrderId}/items` : "/api/sales";
  const method = isEditing ? "PUT" : "POST";
  let orderPersisted = false;

  try {
    const r = await api(url, method, payload);
    if (r.error) {
      toast(r.error, "error");
      resetPOSCheckoutSubmission(status, isEditing);
      return;
    }
    orderPersisted = true;
    const completedSaleId = r.saleId || _editingOrderId;
    const completedOrderNumber = r.orderNumber || completedSaleId;
    
    if (isEditing) {
      toast("Order updated successfully!");
      _editingOrderId = null;
    } else {
      toast("Order placed! Rs. " + r.total);
    }

    closePOSCheckout(true);

    if (!isEditing && window._posIsRetail && status === 'completed') {
      printCustomerBill(completedSaleId);
    }

    // AUTO PRINT KITCHEN IF FLAG SET
    if (window._lastOrderAutoPrintKitchen) {
      if (Number(r.print_jobs_queued || 0) > 0) {
        toast("Kitchen print sent to configured printer");
      } else {
        printKitchenReceipt(completedSaleId);
      }
      window._lastOrderAutoPrintKitchen = false;
    }

    openModal(
      isEditing ? "Order Updated" : (status === 'completed' ? "Order Complete" : "Order Placed"),
      `
      <div class="text-center space-y-4">
        <div class="text-5xl">${isEditing ? '📝' : '🎉'}</div>
        <p class="text-sm font-bold text-slate-500 dark:text-slate-300">Order #${completedOrderNumber}</p>
        ${orderType === 'takeaway' ? `<p class="text-amber-400 font-bold text-lg">Token: ${token_number}</p>` : ''}
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p class="text-[10px] font-black uppercase tracking-widest text-emerald-600">Completed Amount</p>
          <p class="mt-1 text-3xl font-black text-emerald-700 dark:text-emerald-300">Rs. ${Number(r.total || 0).toFixed(2)}</p>
        </div>
        <div class="grid grid-cols-1 gap-2">
          <button onclick="closeModal()" class="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition-all shadow-lg shadow-indigo-600/20">Continue Ordering</button>
        </div>
      </div>`,
      "max-w-md",
      false,
    );
    window._modalOnClose = startFreshPOSOrder;
    _posCheckoutSubmitting = false;
    if (btn) btn.removeAttribute("aria-busy");
  } catch (err) {
    toast(err.message, "error");
    if (orderPersisted) {
      _posCheckoutSubmitting = false;
      if (btn) btn.removeAttribute("aria-busy");
      return;
    }
    resetPOSCheckoutSubmission(status, isEditing);
  }
}

function silentPrint(html, title = "Print") {
  // Use existing iframe or create one
  let iframe = document.getElementById("silent-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "silent-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for images and resources to load before printing
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
  }, 500); // Give it half a second to load images/fonts
}

async function printKitchenBill(saleId) {
  return printSaleReceiptUrl(getReceiptPrintUrl(saleId, RECEIPT_FORMATS.KITCHEN, true));

  const data = await api(`/api/sales/${saleId}/bill`);
  if (!data) return;
  const { sale, items } = data;

  const html = `<!DOCTYPE html><html><head><title>KITCHEN ORDER #${sale.id}</title>
  <style>
    @page { margin: 0; }
    body { margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; }
    .receipt { width: 80mm; margin: 0 auto; padding: 5mm; background: #fff; box-sizing: border-box; }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    h1 { font-size: 18px; margin: 0; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px; }
    .order-info { font-size: 12px; margin: 10px 0; border-bottom: 1px solid #000; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { text-align: left; font-size: 12px; border-bottom: 2px solid #000; padding: 5px 0; }
    td { padding: 4px 0; border-bottom: 1px solid #eee; vertical-align: top; }
    .item-name { font-size: 14px; font-weight: bold; }
    .item-details { font-size: 10px; color: #333; margin-top: 2px; }
    .special-note { font-size: 12px; color: #000; border: 1px solid #000; padding: 2px; display: inline-block; margin-top: 4px; font-weight: bold; }
    .qty { font-size: 18px; font-weight: 900; }
    .footer { font-size: 10px; margin-top: 15px; text-align: center; border-top: 1px dashed #000; padding-top: 10px; }
    @media print { .receipt { margin: 0; width: 100%; } }
  </style></head><body>
  <div class="receipt">
    <div class="text-center">
      <h1 class="bold">KITCHEN ORDER</h1>
      <h2 class="bold" style="font-size: 24px; margin: 8px 0;">#${sale.id}</h2>
    </div>

    <div class="order-info">
      <div class="bold" style="font-size: 14px;">${sale.order_type === 'dine_in' ? '🍽️ DINE-IN' : sale.order_type === 'takeaway' ? '🥡 TAKEAWAY' : '🚚 DELIVERY'}</div>
      ${sale.table_id ? `<div class="bold" style="font-size: 16px;">TABLE: ${sale.table_number || 'N/A'}</div>` : ''}
      ${sale.token_number ? `<div class="bold" style="font-size: 16px;">TOKEN: ${sale.token_number}</div>` : ''}
      <div style="margin-top: 3px;">Time: ${new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 20%;" class="text-center">Qty</th>
          <th>Item Description</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i => `
            <tr>
              <td class="qty text-center">x${i.quantity}</td>
              <td>
                <div class="item-name">${escapeOrderValue(configuredOrderItemName(i.product_name || i.custom_name, i.variants_json, i.addons_json))}</div>
                ${i.special_instructions ? `<div class="special-note">NOTE: ${escapeOrderValue(i.special_instructions)}</div>` : ''}
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table>

    ${sale.special_instructions ? `
      <div style="margin-top: 10px; padding: 8px; border: 1px solid #000;">
        <div class="bold" style="font-size: 10px; text-transform: uppercase;">Order Note:</div>
        <div style="font-size: 12px;">${escapeOrderValue(sale.special_instructions)}</div>
      </div>
    ` : ''}

    <div class="footer">
      Generated at ${new Date().toLocaleTimeString()}
    </div>
  </div>
  </body></html>`;

  silentPrint(html, `KITCHEN ORDER #${sale.id}`);
}

window._lastOrderAutoPrintKitchen = false;
function cartHasItemsWithoutCategoryRoute() {
  return cart.some((item) => {
    const category = item.product?.category || productMap[item.product_id]?.category || null;
    const categoryRoute = category
      ? _productCategories.find(cat => cat.name === category)?.printer_station
      : null;
    return !categoryRoute || categoryRoute === "NONE";
  });
}

async function sendToKitchen() {
  if (!cart.length) return toast("Add items to the order first", "error");

  window._lastOrderAutoPrintKitchen = true;
  return checkout('pending');
}

const RECEIPT_FORMATS = Object.freeze({
  KITCHEN: "kitchen",
  CUSTOMER: "customer",
  UNPAID: "unpaid",
});

function getReceiptPrintUrl(saleId, format = RECEIPT_FORMATS.CUSTOMER, autoPrint = true) {
  const params = new URLSearchParams({
    format,
    autoprint: autoPrint ? "1" : "0",
  });
  const shopId = managedShopId || currentUser?.shop_id;
  if (shopId) params.set("shop_id", shopId);
  return `/print/sales/${encodeURIComponent(saleId)}?${params.toString()}`;
}

function printSaleReceiptUrl(url) {
  let iframe = document.getElementById("silent-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "silent-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }

  iframe.src = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
}

function canPrintKitchenReceipt() {
  return currentUser?.shop_type === "restaurant" || window._posIsRetail === false;
}

async function printReceipt(saleId, format = RECEIPT_FORMATS.CUSTOMER, options = {}) {
  const { browserFallback = true, missingPrinterMessage = "No configured printer found" } = options;
  try {
    const shopId = managedShopId || currentUser?.shop_id;
    const result = await api("/api/print-jobs/queue", "POST", {
      sale_id: saleId,
      format,
      shop_id: shopId || null,
    });

    if (Number(result.queued || 0) > 0) {
      toast("Print sent to configured printer");
      return;
    }

    if (browserFallback) {
      printSaleReceiptUrl(getReceiptPrintUrl(saleId, format, true));
    } else {
      toast(missingPrinterMessage, "error");
    }
  } catch (err) {
    console.error("Receipt print error:", err);
    if (browserFallback) {
      printSaleReceiptUrl(getReceiptPrintUrl(saleId, format, true));
    } else {
      toast(err.message || "Print failed", "error");
    }
  }
}

function printCustomerBill(saleId) {
  return printReceipt(saleId, RECEIPT_FORMATS.CUSTOMER);
}

function printUnpaidBill(saleId) {
  return printReceipt(saleId, RECEIPT_FORMATS.UNPAID);
}

function printKitchenReceipt(saleId) {
  return printReceipt(saleId, RECEIPT_FORMATS.KITCHEN, {
    browserFallback: false,
    missingPrinterMessage: "No kitchen printer is assigned for this order",
  });
}

function showReceiptPrintMenu(saleId, includeKitchen = canPrintKitchenReceipt()) {
  openModal("Print Receipt", `
    <div class="space-y-3">
      ${includeKitchen ? `
        <button onclick="printKitchenReceipt(${saleId}); closeModal();" class="w-full text-left p-4 rounded-2xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 hover:border-orange-300 dark:hover:border-orange-400 transition-all">
          <div class="font-black text-orange-700 dark:text-orange-300 text-sm uppercase tracking-wide">Kitchen Order</div>
          <p class="text-xs text-orange-700/70 dark:text-orange-300/70 mt-1">Preparation ticket with quantities, notes, table/token, and no prices.</p>
        </button>
      ` : ""}

      <button onclick="printReceipt(${saleId}, 'customer'); closeModal();" class="w-full text-left p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 hover:border-indigo-300 dark:hover:border-indigo-400 transition-all">
        <div class="font-black text-indigo-700 dark:text-indigo-300 text-sm uppercase tracking-wide">Customer Bill</div>
        <p class="text-xs text-indigo-700/70 dark:text-indigo-300/70 mt-1">Customer copy with items, totals, received amount, due, and change.</p>
      </button>

      <button onclick="showPrintOptionsModal(${saleId})" class="w-full text-left p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 hover:border-rose-300 dark:hover:border-rose-400 transition-all">
        <div class="font-black text-rose-700 dark:text-rose-300 text-sm uppercase tracking-wide">Unpaid Bill</div>
        <p class="text-xs text-rose-700/70 dark:text-rose-300/70 mt-1">Pending-payment copy with editable tax/discount before printing.</p>
      </button>
    </div>
  `, "max-w-md");
}

async function printBill(saleId, isUnpaid = false) {
  return printSaleReceiptUrl(getReceiptPrintUrl(saleId, isUnpaid ? RECEIPT_FORMATS.UNPAID : RECEIPT_FORMATS.CUSTOMER, true));

  const data = await api(`/api/sales/${saleId}/bill`);
  const { sale, items, seller, shop } = data;

  const grandTotal = Number(sale.total);
  const discount = Number(sale.discount || 0);
  const taxPct = Number(sale.tax_percentage || 0);
  const methodMap = {
    'cash': 'Cash',
    'card': 'Card',
    'online': 'Online Transfer'
  };
  const method = methodMap[sale.payment_method] || sale.payment_method?.toUpperCase() || "Cash";
  const received = Math.max(0, Number(sale.amount_received || 0));
  const remaining = grandTotal - received;
  const balanceDue = Math.max(remaining, 0);
  const receiptTitle = isUnpaid ? "Unpaid Bill" : "Customer Bill";

  const subtotal = items.reduce((s, i) => s + i.quantity * i.price_at_sale, 0);
  const taxAmt = (subtotal - discount) * (taxPct / 100);
  const groupedItems = items; // Simply use items from backend response

  // Typography settings
  const headerFontSize = shop?.header_font_size || 18;
  const headerFontWeight = shop?.header_font_weight || "bold";
  const headerSpacing = shop?.header_spacing || 10;
  const contactFontSize = shop?.contact_font_size || 10;
  const contactAlign = shop?.contact_align || "center";
  const contactPadding = shop?.contact_padding || 10;
  const footerFontSize = shop?.footer_font_size || 9;
  const footerFontStyle = shop?.footer_font_style || "normal";
  const footerMargin = shop?.footer_margin || 10;
  const dividerStyle = shop?.divider_style || "dashed";
  const dividerWidth = shop?.divider_width || 1;
  const sectionGap = shop?.section_gap || 10;
  const dividerCss = dividerStyle === "none" ? "none" : `${dividerWidth}px ${dividerStyle} #111827`;

  // Build receipt header based on settings
  let headerHtml = "";
  const useLogo = shop?.use_logo_on_receipt && (shop?.logo_data || shop?.logo_path);
  const useText = shop?.use_text_on_receipt !== false; // Default true
  const headerText = shop?.receipt_header_text || shop?.name || "RESTAURANT";

  if (useLogo) {
    headerHtml += `<div style="margin-bottom: ${headerSpacing}px;"><img src="${shop.logo_data || shop.logo_path}" style="max-width: 60mm; max-height: 22mm; margin: 0 auto; display: block;" alt="${headerText}"></div>`;
  }
  if (useText) {
    headerHtml += `<h1 style="font-size: ${headerFontSize}px; font-weight: ${headerFontWeight}; margin: 0; text-transform: uppercase; text-align: center;">${headerText}</h1>`;
  }
  if (shop?.receipt_extended_name) {
    const extFontSize = shop.extended_name_font_size || 10;
    const extFontWeight = shop.extended_name_font_weight || "normal";
    const extSpacing = shop.extended_name_spacing || 2;
    headerHtml += `<div style="font-size: ${extFontSize}px; font-weight: ${extFontWeight}; margin-top: ${extSpacing}px; text-align: center; text-transform: none;">${shop.receipt_extended_name}</div>`;
  }

  // Build contact details section
  let contactHtml = "";
  if (shop?.receipt_phone || shop?.receipt_address) {
    contactHtml = `<div style="font-size: ${contactFontSize}px; margin-top: 5px; text-align: ${contactAlign}; border-bottom: ${dividerCss}; padding-bottom: ${contactPadding}px;">`;
    if (shop.receipt_phone) contactHtml += `<div style="display: flex; align-items: center; justify-content: ${contactAlign}; gap: 4px;"><svg width="${parseInt(contactFontSize) + 2}" height="${parseInt(contactFontSize) + 2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${shop.receipt_phone}</div>`;
    if (shop.receipt_address) contactHtml += `<div style="display: flex; align-items: center; justify-content: ${contactAlign}; gap: 4px;"><svg width="${parseInt(contactFontSize) + 2}" height="${parseInt(contactFontSize) + 2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${shop.receipt_address}</div>`;
    contactHtml += `</div>`;
  }

  // Build promotional images section
  let promoImagesHtml = "";
  if (shop?.receipt_images && shop.receipt_images.length > 0) {
    promoImagesHtml = `<div style="margin-top: ${sectionGap}px; border-top: ${dividerCss}; padding-top: ${sectionGap}px;">`;
    shop.receipt_images.forEach((img) => {
      promoImagesHtml += `<img src="${img.path}" style="max-width: 70mm; max-height: 25mm; margin: 3px auto; display: block;" alt="${img.description || ""}">`;
      if (img.description) {
        promoImagesHtml += `<div style="font-size: ${footerFontSize}px; text-align: center; margin-top: 2px;">${img.description}</div>`;
      }
    });
    promoImagesHtml += `</div>`;
  }

  // Build footer/policies section
  let footerHtml = `<div class="footer text-center">`;
  if (shop?.receipt_policies) {
    // Convert newlines to <br>
    const policies = shop.receipt_policies.replace(/\n/g, "<br>");
    footerHtml += `<div style="font-size: ${footerFontSize}px; font-style: ${footerFontStyle}; margin: ${footerMargin}px 0; white-space: pre-wrap;">${policies}</div>`;
  }
  footerHtml += `<div style="font-size: ${parseInt(footerFontSize) + 1}px; margin-top: ${footerMargin}px;">${isUnpaid ? "Payment pending. Please keep this bill for counter settlement." : "Thank you for your purchase!"}</div>`;
  if (shop?.name && !useLogo) {
    footerHtml += `<div style="font-size: ${parseInt(footerFontSize) + 1}px;">${shop.name}</div>`;
  }
  footerHtml += `<div style="font-size: ${footerFontSize}px; margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 5px; font-weight: bold;">Software by DEVFORGE - 03226155209</div>`;
  footerHtml += `</div>`;

  const html = `<!DOCTYPE html><html><head><title>${receiptTitle} #${sale.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'bit array-a2';
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot');
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot?#iefix') format('embedded-opentype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff2') format('woff2'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff') format('woff'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.ttf') format('truetype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.svg#BIT') format('svg');
      font-weight: normal;
      font-style: normal;
    }
    @page { margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .receipt {
      font-family: ${shop?.receipt_font_family || "'Courier New', Courier, monospace"};
      width: 80mm;
      margin: 0 auto;
      padding: 4mm;
      color: #111827;
      font-size: 11px;
      line-height: 1.2;
      background: #fff;
      box-sizing: border-box;
    }
    @media print {
      .receipt { margin: 0; width: 100%; }
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    h1 { font-size: 16px; margin: 0; text-transform: uppercase; }
    h2 { font-size: 12px; margin: 2px 0; }
    .divider { border: none; border-top: 1px dashed #111827; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; }
    th { text-align: left; font-size: 10px; border-bottom: 1px solid #111827; padding: 2px 0; }
    td { padding: 3px 0; vertical-align: top; }
    .total-row { font-size: 13px; }
    .footer { font-size: 9px; margin-top: 10px; }
  </style></head><body>
  <div class="receipt">
    <div class="text-center">
      ${headerHtml}
      <div class="bold">${receiptTitle}</div>
      ${contactHtml}
    </div>

    <hr class="divider" />

    <div style="font-size: 10px;">
      <strong>Bill #:</strong> ${sale.order_number || sale.id}<br>
      <strong>Date:</strong> ${new Date(sale.created_at).toLocaleString()}<br>
      <strong>Staff:</strong> ${seller ? seller.name : "Staff"}<br>
      <strong>Customer:</strong> ${sale.customer_name || "Walk-in"}<br>
      ${sale.customer_phone ? `<strong>Phone:</strong> ${sale.customer_phone}<br>` : ""}
      <strong>Type:</strong> ${sale.order_type === 'dine_in' ? 'Dine-in' : sale.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}<br>
      <strong>Payment:</strong> ${method}<br>
    </div>

    <hr class="divider" />

    <table>
      <thead>
        <tr>
          <th style="width: 50%;">Item</th>
          <th class="text-center">Qty</th>
          <th class="text-right">Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${groupedItems
      .map(
        (i) => `
          <tr>
            <td>${i.product_name}</td>
            <td class="text-center">${i.quantity}</td>
            <td class="text-right">${i.price_at_sale}</td>
            <td class="text-right">${(i.quantity * i.price_at_sale).toFixed(0)}</td>
          </tr>
        `,
      )
      .join("")}
      </tbody>
    </table>

    <hr class="divider" />

    <div class="text-right">
      <div>Subtotal: Rs. ${subtotal.toFixed(0)}</div>
      ${discount > 0 ? `<div>Discount: -Rs. ${discount.toFixed(0)}</div>` : ""}
      ${taxPct > 0 ? `<div>Tax (${taxPct}%): Rs. ${taxAmt.toFixed(0)}</div>` : ""}
      <div class="bold total-row" style="margin-top: 4px;">GRAND TOTAL: Rs. ${grandTotal.toFixed(0)}</div>
    </div>

    <hr class="divider" />

    <div style="font-size: 10px;">
      ${isUnpaid ? `
        <div style="text-align: center; border: 1px dashed #111827; padding: 5px; margin-top: 5px; font-weight: bold;">
          *** UNPAID BILL ***<br>
          Total: Rs. ${grandTotal.toFixed(0)}<br>
          Balance Due: Rs. ${balanceDue.toFixed(0)}
        </div>
      ` : `
        <div><strong>Method:</strong> ${method}</div>
        <div><strong>Received:</strong> Rs. ${received.toFixed(0)}</div>
        ${remaining > 0 ? `<div class="bold"><strong>Due:</strong> Rs. ${remaining.toFixed(0)}</div>` : ""}
        ${remaining < 0 ? `<div class="bold"><strong>Change:</strong> Rs. ${Math.abs(remaining).toFixed(0)}</div>` : ""}
      `}
    </div>

    <hr class="divider" />

    ${promoImagesHtml}
    ${footerHtml}
  </div>
  </body></html>`;

  silentPrint(html, `${receiptTitle} #${sale.id}`);
}

async function returnSaleItems(saleId) {
  try {
    const data = await api(`/api/sales/${saleId}/bill`);
    const { sale, items } = data;

    const itemsHtml = items
      .map((i) => {
        const available = i.quantity - (i.returned_qty || 0);
        const isFullyReturned = available <= 0;
        return `
      <div class="p-3 ${isFullyReturned ? "opacity-50 grayscale bg-slate-100" : "bg-slate-50 dark:bg-slate-800/50"} rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <label class="flex items-center gap-3 ${isFullyReturned ? "cursor-not-allowed" : "cursor-pointer"} flex-1">
          <input type="checkbox" class="return-item-check w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" 
            data-pid="${i.product_id}" data-id="${i.id}" data-max="${available}" ${isFullyReturned ? "disabled" : ""} />
          <div class="flex flex-col">
            <p class="font-bold text-sm text-slate-800 dark:text-slate-200">${i.product_name}</p>
            <span class="text-[10px] text-slate-500 uppercase font-black">Sold: ${i.quantity} @ Rs. ${i.price_at_sale}</span>
            <span class="text-[9px] text-emerald-500 font-bold block">Cost logic ID: ${i.id} (Cost: Rs. ${i.buying_price_at_sale || 0})</span>
            ${i.returned_qty > 0 ? `<span class="text-[9px] text-rose-500 font-bold italic">Already Returned: ${i.returned_qty}</span>` : ""}
          </div>
        </label>
        <div class="flex items-center gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] uppercase font-bold text-slate-400">Qty</span>
            <input type="number" class="return-item-qty w-14 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600" 
              value="${available}" min="1" max="${available}" ${isFullyReturned ? "disabled" : ""} />
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-[9px] uppercase font-bold text-slate-400">Refund/Unit</span>
            <input type="number" class="return-item-price w-16 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-emerald-600" 
              value="${i.price_at_sale}" step="0.01" ${isFullyReturned ? "disabled" : ""} />
          </div>
          <div class="flex flex-col items-center gap-1">
            <span class="text-[9px] uppercase font-bold text-slate-400">Damage?</span>
            <input type="checkbox" class="return-item-damage w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500" />
          </div>
        </div>
      </div>
    `;
      })
      .join("");

    openModal(
      `Return Items — Sale #${saleId}`,
      `
      <div class="space-y-4">
        <div class="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl">
           <p class="text-xs text-rose-600 dark:text-rose-400 font-medium">Select the items you wish to return. Quantities will be restocked automatically.</p>
        </div>

        <div class="space-y-2 max-h-[350px] overflow-y-auto px-1 no-scrollbar">
          ${itemsHtml}
        </div>

        <div class="space-y-2 pt-2">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Refund Method</label>
          <select id="return-method" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-rose-500 text-sm font-bold text-slate-700 dark:text-slate-200">
            <option value="cash">Cash Refund</option>
            <option value="online">Bank Transfer / Online</option>
            <option value="ledger">Credit to Customer Account (Store Credit)</option>
          </select>
        </div>

        <div class="space-y-2 pt-2">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Reason for Return</label>
          <textarea id="return-reason" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-rose-500 text-sm h-20 placeholder-slate-400" placeholder="Optional notes..."></textarea>
        </div>

        <div class="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button onclick="closeModal()" class="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold transition-all hover:bg-slate-200">Cancel</button>
          <button onclick="submitSaleReturn(${saleId})" class="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg shadow-rose-600/20">Process Return</button>
        </div>
      </div>
    `,
      "max-w-2xl",
    );
  } catch (err) {
    toast(err.message, "error");
  }
}

async function submitSaleReturn(saleId) {
  const checkboxElements = document.querySelectorAll(
    ".return-item-check:checked",
  );
  if (checkboxElements.length === 0)
    return toast("Please select at least one item to return", "error");

  const returns = [];
  let modalError = null;

  checkboxElements.forEach((cb) => {
    const parent = cb.closest(".p-3");
    const qtyInput = parent.querySelector(".return-item-qty");
    const priceInput = parent.querySelector(".return-item-price");

    const qty = parseInt(qtyInput.value) || 0;
    const max = parseInt(cb.dataset.max);
    const refundPrice = parseFloat(priceInput.value) || 0;
    const isDamage = parent.querySelector(".return-item-damage").checked;

    if (qty <= 0) modalError = "Return quantity must be greater than zero.";
    if (qty > max)
      modalError = `Return quantity exceeds original sold amount for some items.`;

    returns.push({
      sale_item_id: parseInt(cb.dataset.id) || null,
      product_id: parseInt(cb.dataset.pid) || null,
      quantity: qty,
      refund_price: refundPrice,
      is_damage: isDamage,
    });
  });

  if (modalError) return toast(modalError, "error");

  const reason = document.getElementById("return-reason").value.trim();
  const payment_method = document.getElementById("return-method").value;
  if (payment_method === "cash" && !(await ensureOpenShiftForPayment())) return;

  try {
    const res = await api(`/api/sales/${saleId}/return`, "POST", {
      items: returns,
      reason,
      payment_method,
    });
    if (res.error) throw new Error(res.error);

    toast(`Return process completed. Total Refund: Rs. ${res.totalRefund}`);

    // Prompt for return receipt
    openModal("Return Complete!", `
      <div class="text-center space-y-4">
        <div class="text-5xl">✅</div>
        <p class="text-slate-300">Return processed successfully — <span class="text-rose-400 font-bold">Refund: Rs. ${(res.totalRefund || 0).toFixed(2)}</span></p>
        <div class="flex gap-3">
          <button onclick="printReturnReceipt(${res.returnId || 0})" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all">🖨 Print Return Receipt</button>
          <button onclick="closeModal();renderSalesHistory();" class="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-all">Back to History</button>
        </div>
      </div>
    `, "max-w-md", true);

    _renderSalesTable(); // Refresh table
    renderProducts();   // Refresh product panel stocks
  } catch (err) {
    toast(err.message, "error");
  }
}

async function printReturnReceipt(returnId) {
  const data = await api(`/api/sales/returns/${returnId}/receipt`);
  const { return: ret, items, sale, user, shop } = data;

  // Build receipt header based on settings
  let headerHtml = "";
  const useLogo = shop?.use_logo_on_receipt && (shop?.logo_data || shop?.logo_path);
  const useText = shop?.use_text_on_receipt !== false;
  const headerText = shop?.receipt_header_text || shop?.name || "RESTAURANT";

  if (useLogo) {
    headerHtml += `<img src="${shop.logo_data || shop.logo_path}" style="max-width: 60mm; max-height: 20mm; margin: 0 auto; display: block;" alt="${headerText}">`;
  }
  if (useText) {
    headerHtml += `<h1>${headerText}</h1>`;
  }
  if (shop?.receipt_extended_name) {
    const extFontSize = shop.extended_name_font_size || 10;
    const extFontWeight = shop.extended_name_font_weight || "normal";
    const extSpacing = shop.extended_name_spacing || 2;
    headerHtml += `<div style="font-size: ${extFontSize}px; font-weight: ${extFontWeight}; margin-top: ${extSpacing}px; text-align: center; text-transform: none;">${shop.receipt_extended_name}</div>`;
  }

  // Build contact details section
  let contactHtml = "";
  if (shop?.receipt_phone || shop?.receipt_address) {
    contactHtml = `<div style="font-size: 10px; margin-top: 3px;">`;
    if (shop.receipt_phone) contactHtml += `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${shop.receipt_phone}</div>`;
    if (shop.receipt_address) contactHtml += `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${shop.receipt_address}</div>`;
    contactHtml += `</div>`;
  }

  // Build footer/policies section
  let footerHtml = `<div class="text-center" style="font-size: 10px; margin-top: 10px;">`;
  if (shop?.receipt_policies) {
    const policies = shop.receipt_policies.replace(/\n/g, "<br>");
    footerHtml += `<div style="font-size: 9px; margin-bottom: 5px; white-space: pre-wrap;">${policies}</div>`;
  }
  footerHtml += `Thank you for your visit!`;
  if (shop?.name && !useLogo) {
    footerHtml += `<br>${shop.name}`;
  }
  footerHtml += `<div style="font-size: 8px; margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 5px; font-weight: bold;">Software by DEVFORGE - 03226155209</div>`;
  footerHtml += `</div>`;

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Return Receipt #${ret.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'bit array-a2';
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot');
      src: url('/fonts/be69564cba72b68a4f28d2f3d3139513.eot?#iefix') format('embedded-opentype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff2') format('woff2'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.woff') format('woff'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.ttf') format('truetype'),
           url('/fonts/be69564cba72b68a4f28d2f3d3139513.svg#BIT') format('svg');
      font-weight: normal;
      font-style: normal;
    }
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; background: #f0f0f0; font-family: ${shop?.receipt_font_family || "'Courier New', Courier, monospace"}; }
    .receipt { width: 80mm; margin: 0 auto; padding: 4mm; color: #111827; font-size: 12px; line-height: 1.2; background: #f8fafc; min-height: 100vh; box-sizing: border-box; }
    @media print { html, body { background: #f8fafc; } .receipt { margin: 0; width: 100%; min-height: auto; } }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
    .divider { border: none; border-top: 1px dashed #111827; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 5px 0; }
    th { text-align: left; font-size: 10px; border-bottom: 1px solid #111827; padding: 2px 0; }
    td { padding: 3px 0; vertical-align: top; }
  </style></head><body>
  <div class="receipt">
    <div class="text-center">
      ${headerHtml}
      <div class="bold">RETURN RECEIPT</div>
      ${contactHtml}
    </div>
    <hr class="divider" />
    <div style="font-size: 11px;">
      <strong>Return #:</strong> ${ret.id}<br>
      <strong>Date:</strong> ${new Date(ret.created_at).toLocaleString()}<br>
      <strong>Orig. Sale:</strong> #${ret.sale_id}<br>
      <strong>Customer:</strong> ${sale.customer_name || "Walk-in"}<br>
      <strong>Processed By:</strong> ${user ? user.name : "Staff"}
    </div>
    <hr class="divider" />
    <table>
      <thead><tr><th>Item</th><th class="text-center">Qty</th><th class="text-right">Refund</th></tr></thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td>${i.product_name}${i.is_damage ? ' <span class="bold">(Damaged)</span>' : ''}</td>
            <td class="text-center">${i.quantity}</td>
            <td class="text-right">${(i.refund_price * i.quantity).toFixed(0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <hr class="divider" />
    <div class="text-right bold" style="font-size: 14px;">TOTAL REFUND: Rs. ${ret.total_refund.toFixed(0)}</div>
    <div class="text-right" style="font-size: 11px; margin-top: 4px;">Method: ${ret.payment_method.toUpperCase()}</div>
    ${ret.reason ? `<div style="font-size: 10px; margin-top: 5px;"><strong>Reason:</strong> ${ret.reason}</div>` : ''}
    <hr class="divider" />
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();setTimeout(()=>{if(!window.closed)window.close();},5000);}<\/script>
  </body></html>`);
  win.document.close();
}

// ─── Sales History ─────────────────────────────────────────────────────────
// ─── Sales History ─────────────────────────────────────────────────────────

let _salesRangeFilter = "today"; // today, last_week, etc. or null for manual
let _salesPendingFilter = false;
let _salesPage = 1;
const _salesPageSize = 25;

async function renderSalesHistory(onlyPendingDues = false) {
  try {
    const sales = await api("/api/sales");
    _allSalesCache = Array.isArray(sales)
      ? sales.filter((s) => s.order_status === "completed" || s.order_status === "payment_pending")
      : [];
    updatePendingDuesBadge(_allSalesCache);
    _salesPendingFilter = onlyPendingDues;
    _salesPage = 1;

    const today = new Date().toISOString().split("T")[0];
    const statusLabel = onlyPendingDues ? "PENDING DUES" : "PAID SLIPS";
    const statusColor = onlyPendingDues ? "text-rose-500" : "text-emerald-500";

    $c("page-content").innerHTML = `
    <div class="flex flex-col gap-6 mb-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 class="text-2xl font-bold ${statusColor} mb-1">${statusLabel}</h2>
          <div class="flex items-center gap-4">
            <p class="text-slate-500 dark:text-slate-400 text-sm">Showing <span id="sales-count" class="font-bold">0</span> records</p>
            ${onlyPendingDues ? `<p class="text-rose-500 font-black text-sm px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">Total Dues: Rs. <span id="sales-total-dues">0</span></p>` : ""}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">Range</label>
            <select id="sales-range-filter" onchange="setSalesHistoryRange(this.value)" class="bg-transparent text-sm focus:outline-none dark:text-white font-bold cursor-pointer">
              <option value="today" ${_salesRangeFilter === 'today' ? 'selected' : ''}>Today</option>
              <option value="last_week" ${_salesRangeFilter === 'last_week' ? 'selected' : ''}>Last Week</option>
              <option value="last_month" ${_salesRangeFilter === 'last_month' ? 'selected' : ''}>Last Month</option>
              <option value="6_month" ${_salesRangeFilter === '6_month' ? 'selected' : ''}>6 Months</option>
              <option value="last_year" ${_salesRangeFilter === 'last_year' ? 'selected' : ''}>Last Year</option>
              <option value="all" ${_salesRangeFilter === 'all' ? 'selected' : ''}>All Time</option>
              <option value="custom" ${_salesRangeFilter === null ? 'selected' : ''} disabled>Custom Range</option>
            </select>
          </div>
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">From</label>
            <input type="date" id="sales-from" value="" onchange="setSalesManualDate()" class="bg-transparent text-sm focus:outline-none dark:text-white" />
          </div>
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">To</label>
            <input type="date" id="sales-to" value="" onchange="setSalesManualDate()" class="bg-transparent text-sm focus:outline-none dark:text-white" />
          </div>
          <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm">
            <label class="text-[10px] uppercase font-bold text-slate-400">Type</label>
            <select id="sales-type-filter" onchange="_renderSalesTable()" class="bg-transparent text-sm focus:outline-none dark:text-white font-bold cursor-pointer">
              <option value="">All Types</option>
              <option value="dine_in">Dine-in</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <button onclick="navigate('${onlyPendingDues ? 'sales-history' : 'pending-dues'}')" class="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-100 dark:border-transparent hover:bg-indigo-100 transition-all text-xs">
            ${onlyPendingDues ? '📄 View Paid Slips' : '🔴 View Pending Dues'}
          </button>
          <div class="flex-1 min-w-[200px]">
             <input id="sales-search" oninput="_renderSalesTable()" placeholder="Search Bill #, Name, Phone..."
               class="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all text-sm shadow-sm" />
          </div>
        </div>
      </div>
    </div>

    <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
        <thead class="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-700"><tr>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Inv #</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Customer</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Total</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Paid</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Pending</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Served By</th>
          <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
        </tr></thead>
        <tbody id="sales-table-body" class="divide-y divide-slate-800">
        </tbody></table>
      </div>
      <div id="sales-pagination" class="bg-slate-50/50 dark:bg-black/20 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
      </div>
    </div>`;

    _renderSalesTable();
  } catch (err) {
    console.error("Sales History Error:", err);
    $c("page-content").innerHTML =
      `<div class="p-10 text-center text-rose-500 font-bold">Failed to load sales: ${err.message}</div>`;
  }
}

function setSalesHistoryRange(val) {
  _salesRangeFilter = val;

  // Clear manual inputs visually
  const fromInput = document.getElementById("sales-from");
  const toInput = document.getElementById("sales-to");
  if (fromInput) fromInput.value = "";
  if (toInput) toInput.value = "";

  _renderSalesTable();
}

function setSalesManualDate() {
  _salesRangeFilter = null;
  const rangeDropdown = document.getElementById("sales-range-filter");
  if (rangeDropdown) rangeDropdown.value = "custom";
  _renderSalesTable();
}

function _renderSalesTable() {
  try {
    const searchInput = $c("sales-search");
    const fromInput = $c("sales-from");
    const toInput = $c("sales-to");
    const typeFilter = $c("sales-type-filter")?.value;
    if (!searchInput || !fromInput || !toInput) return;

    const query = (searchInput.value || "").toLowerCase().trim();
    const fromDate = fromInput.value;
    const toDate = toInput.value;

    console.log(
      "Rendering table. Cache:",
      _allSalesCache.length,
      "Filter:",
      _salesPendingFilter,
      "Range:",
      fromDate,
      "to",
      toDate,
    );

    // Initial filter by Status (Paid/Pending)
    let displayList = _salesPendingFilter
      ? _allSalesCache.filter(
        (s) => Number(s.total || 0) - Number(s.amount_received || 0) > 0.01,
      )
      : _allSalesCache.filter(
        (s) => Number(s.total || 0) - Number(s.amount_received || 0) <= 0.01,
      );

    // Filter by Date (Quick Range OR Manual Range)
    if (_salesRangeFilter) {
      if (_salesRangeFilter !== 'all') {
        const now = new Date();
        let fromDateLimit = new Date();
        fromDateLimit.setHours(0, 0, 0, 0);

        if (_salesRangeFilter === 'last_week') fromDateLimit.setDate(now.getDate() - 7);
        else if (_salesRangeFilter === 'last_month') fromDateLimit.setMonth(now.getMonth() - 1);
        else if (_salesRangeFilter === '6_month') fromDateLimit.setMonth(now.getMonth() - 6);
        else if (_salesRangeFilter === 'last_year') fromDateLimit.setFullYear(now.getFullYear() - 1);
        // else today = already set to today

        displayList = displayList.filter((s) => {
          const sDate = new Date(s.created_at);
          return sDate >= fromDateLimit;
        });
      }
    } else if (fromDate || toDate) {
      displayList = displayList.filter((s) => {
        const sDate = s.created_at.split(" ")[0]; // Extract YYYY-MM-DD
        if (fromDate && sDate < fromDate) return false;
        if (toDate && sDate > toDate) return false;
        return true;
      });
    }

    // Filter by Order Type
    if (typeFilter) {
      displayList = displayList.filter(s => s.order_type === typeFilter);
    }

    // Filter by Search Query
    if (query) {
      displayList = displayList.filter((s) => {
        const orderNumber = (s.order_number || s.id || "").toString().toLowerCase();
        const name = (s.customer_name || "").toLowerCase();
        const phone = (s.customer_phone || "").toLowerCase();
        const sellerName = (s.served_by_name || "").toLowerCase();
        const sellerUser = (s.served_by_username || "").toLowerCase();
        return (
          orderNumber.includes(query) ||
          name.includes(query) ||
          phone.includes(query) ||
          sellerName.includes(query) ||
          sellerUser.includes(query)
        );
      });
    }

    if ($c("sales-count")) $c("sales-count").textContent = displayList.length;
    if ($c("sales-total-dues")) {
      const totalPending = displayList.reduce((sum, s) => sum + (Number(s.total || 0) - Number(s.amount_received || 0)), 0);
      $c("sales-total-dues").textContent = totalPending.toLocaleString("en-IN", { minimumFractionDigits: 0 });
    }

    const totalPages = Math.ceil(displayList.length / _salesPageSize) || 1;
    if (_salesPage > totalPages) _salesPage = 1;

    const startIdx = (_salesPage - 1) * _salesPageSize;
    const pageItems = displayList.slice(startIdx, startIdx + _salesPageSize);

    $c("sales-table-body").innerHTML = pageItems.length
      ? pageItems
        .map((s) => {
          const due = Number(s.total || 0) - Number(s.amount_received || 0);
          const isPending = due > 0.01;

          return `
        <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
          <td class="px-5 py-4 font-bold">
            <div class="text-indigo-600 dark:text-indigo-400">#${s.order_number || s.id}</div>
            ${s.items_returned > 0 ? `
              <div class="mt-1 flex items-center gap-1">
                <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-[9px] font-black text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                  RETURNED (${s.items_returned})
                </span>
              </div>
            ` : ""}
          </td>
          <td class="px-5 py-4">
             <div class="font-medium text-slate-700 dark:text-slate-200 text-sm mb-1">${new Date(s.created_at).toLocaleDateString()}</div>
             <div class="text-[10px] text-slate-500">${new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          </td>
          <td class="px-5 py-4">
             <div class="font-bold text-slate-800 dark:text-slate-200">${s.customer_name || '<span class="text-slate-400 dark:text-slate-500 italic font-normal">Walk-in</span>'}</div>
             <div class="text-xs ${s.customer_phone ? "text-slate-500 dark:text-slate-400" : "text-slate-400 dark:text-slate-600 italic"} mt-1 flex items-center gap-1">
               <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
               ${s.customer_phone || "No phone"}
             </div>
          </td>
          <td class="px-5 py-4 text-slate-700 dark:text-slate-200 font-bold">Rs. ${parseFloat(s.total || 0).toFixed(0)}</td>
          <td class="px-5 py-4 text-emerald-600 dark:text-emerald-400 font-medium">Rs. ${parseFloat(s.amount_received || 0).toFixed(0)}</td>
          <td class="px-5 py-4 font-black">
             ${isPending ? `<span class="text-rose-600 dark:text-rose-400">Rs. ${parseFloat(due).toFixed(0)}</span>` : `<span class="text-slate-400 dark:text-slate-600 font-normal">None</span>`}
          </td>
          <td class="px-5 py-4">
            <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-bold border border-slate-200 dark:border-slate-700 uppercase">${s.served_by_name || s.served_by_username || "Staff"}</span>
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button onclick="viewOrderItems(${s.id}, true)" class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20" title="View products sold in this order">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                View
              </button>
              ${s.customer_id && !_salesPendingFilter ? `<button onclick="viewCustomerLedger(${s.customer_id})" class="p-1.5 rounded bg-indigo-100 dark:bg-indigo-500/10 hover:bg-indigo-200 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 transition-colors" title="Open Customer Account"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></button>` : ""}
              ${isPending ? `<button onclick="markSalePaid(${s.id}, ${s.total}, ${s.amount_received})" class="p-1.5 rounded bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors" title="Collect Payment / Update Dues"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>` : ""}
              <button onclick="showSaleDuesDetails(${s.id})" class="p-1.5 rounded bg-blue-100 dark:bg-blue-500/10 hover:bg-blue-200 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 transition-colors" title="View Due Details & History">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              <button onclick="returnSaleItems(${s.id})" class="p-1.5 rounded bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 transition-colors" title="Return Items">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15L12 19M12 19L8 15M12 19V9C12 5.68629 14.6863 3 18 3" /></svg>
              </button>
              <button onclick="showReceiptPrintMenu(${s.id})" class="p-1.5 rounded bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 transition-colors" title="Print Receipt">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
        })
        .join("")
      : `<tr><td colspan="8" class="px-5 py-10 text-center text-slate-400 dark:text-slate-600 text-sm italic border-t border-slate-100 dark:border-slate-800">No sales found for this filter.</td></tr>`;

    $c("sales-pagination").innerHTML =
      totalPages > 1
        ? `
      <div class="text-xs text-slate-500 font-medium">
        Showing <span class="font-bold text-slate-900 dark:text-slate-200">${pageItems.length}</span> of <span class="font-bold text-slate-900 dark:text-slate-200">${displayList.length}</span> sales
      </div>
      <div class="flex items-center gap-2">
        <button onclick="changeSalesPage(${_salesPage - 1})" ${_salesPage <= 1 ? "disabled" : ""} class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Previous</button>
        <span class="text-xs font-bold text-slate-500 px-2">Page ${_salesPage} of ${totalPages}</span>
        <button onclick="changeSalesPage(${_salesPage + 1})" ${_salesPage >= totalPages ? "disabled" : ""} class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next</button>
      </div>
    `
        : "";
  } catch (err) {
    console.error("Table Render Error:", err);
  }
}

function changeSalesPage(page) {
  _salesPage = page;
  _renderSalesTable();
}

async function markSalePaid(saleId, grandTotal, currentReceived) {
  const currentDue = grandTotal - currentReceived;
  // Use a customized prompt to allow partial or full payment
  const html = `
    <div class="space-y-4">
      <p class="text-sm text-slate-500 dark:text-slate-400">Total remaining due is <strong>Rs. ${currentDue.toFixed(2)}</strong>.</p>
      <div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">How much is being received now?</label>
        <input id="dues-recvd-${saleId}" type="number" min="0.01" max="${currentDue.toFixed(2)}" step="0.01" value="${currentDue.toFixed(2)}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Payment Method</label>
        <select id="dues-method-${saleId}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold"><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online Transfer</option></select></div>
      <div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Payment Note (optional)</label>
        <input id="dues-note-${saleId}" type="text" placeholder="e.g. Cash received at counter" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
      <button onclick="doMarkSalePaid(${saleId}, ${currentReceived})" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg hover:shadow-emerald-500/25">Confirm Received</button>
    </div>
  `;
  openModal("Collect Dues: Bill #" + saleId, html);
}

async function doMarkSalePaid(saleId, currentReceived) {
  if (!(await ensureOpenShiftForPayment())) return;

  const amountInput = document.getElementById(`dues-recvd-${saleId}`);
  const methodInput = document.getElementById(`dues-method-${saleId}`);
  const noteInput = document.getElementById(`dues-note-${saleId}`);
  if (!amountInput) return toast("Input not found", "error");

  const adding = parseFloat(amountInput.value) || 0;
  if (adding <= 0) return toast("Amount must be > 0", "error");
  const maxDue = Number(amountInput.max || 0);
  if (maxDue > 0 && adding > maxDue + 0.01) return toast("Payment cannot exceed the remaining due.", "error");

  const totalRecvd = currentReceived + adding;
  const note = noteInput ? noteInput.value.trim() : "";
  const r = await api(`/api/sales/${saleId}/pay`, "PATCH", {
    amount: totalRecvd,
    payment_method: methodInput?.value || "cash",
    note,
  });
  if (r.error) return toast(r.error, "error");

  toast("Dues updated successfully!");
  closeModal();
  renderSalesHistory(_salesPendingFilter); // Refresh list
}

async function showSaleDuesDetails(saleId) {
  try {
    const data = await api(`/api/sales/${saleId}/bill`);
    const { sale, payments } = data;
    const totalDue = Number(sale.total || 0);
    const amountReceived = Number(sale.amount_received || 0);
    const balance = totalDue - amountReceived;

    const historyHtml = payments.length
      ? payments.map(p => `
          <div class="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div>
              <div class="text-sm font-bold text-slate-900 dark:text-white">Rs. ${Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
              <div class="text-[10px] text-slate-500">${new Date(p.created_at).toLocaleString()}</div>
            </div>
            <div class="text-[10px] text-slate-400 italic font-medium max-w-[150px] text-right truncate">${p.note || 'No note'}</div>
          </div>
        `).join('')
      : '<div class="py-10 text-center text-slate-400 text-sm italic">No installment payments recorded yet.</div>';

    const html = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
            <p class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Bill</p>
            <p class="text-xl font-black text-indigo-700 dark:text-indigo-300">Rs. ${totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </div>
          <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800">
            <p class="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Remaining Due</p>
            <p class="text-xl font-black text-rose-700 dark:text-rose-300">Rs. ${balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div>
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Payment Timeline</h4>
          <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 overflow-y-auto max-h-[300px]">
            ${historyHtml}
          </div>
        </div>

        <div class="text-center pt-2">
           <p class="text-xs text-slate-500 italic font-medium">Customer: <span class="font-bold text-slate-700 dark:text-slate-300">${sale.customer_name || 'Walk-in'}</span></p>
        </div>
      </div>
    `;

    openModal(`Due Details — SALE #${saleId}`, html, "max-w-md");
  } catch (err) {
    toast("Error loading details", "error");
  }
}

// ─── Expenses ───────────────────────────────────────────────────────
// ─── Expenses ───────────────────────────────────────────────────────
function getExpenseCategoryChoices() {
  const categories = Array.isArray(_expenseCategories) ? [..._expenseCategories] : [];
  if (!categories.some((category) => category.name === "Restaurant Expense")) {
    categories.unshift({
      name: "Restaurant Expense",
      emoji: "🏬",
      color_class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
    });
  }
  return categories;
}

function renderExpenseCategoryOptions(selected = "") {
  return getExpenseCategoryChoices().map((category) => {
    const label = `${category.emoji || ""} ${category.name}`.trim();
    return `<option value="${escapeOrderValue(category.name)}" ${selected === category.name ? "selected" : ""}>${escapeOrderValue(label)}</option>`;
  }).join("");
}

async function renderExpenses() {
  const [allExpenses, sharesRes, previousDues, categories] = await Promise.all([
    api("/api/expenses"),
    api(`/api/brands/expense-shares?month=${_expenseMonth}`),
    api("/api/brands/all-months-dues"),
    api("/api/expense-categories"),
  ]);

  _expenseCategories = categories;

  // Sort by date desc and filter by selected month (YYYY-MM)
  const filtered = allExpenses
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter((e) => e.date.startsWith(_expenseMonth));
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  // Pagination logic (10 per page)
  const pageSize = 5;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const startIdx = (_expensePage - 1) * pageSize;
  const pageExpenses = filtered.slice(startIdx, startIdx + pageSize);

  let contentHtml = "";

  if (_expenseView === "add") {
    // Render Add Form View
    contentHtml = `
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">Add New Expense</h3>
        <button onclick="toggleExpenseView('list')" class="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-sm font-medium flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back to List
        </button>
      </div>
      <div class="glass rounded-2xl p-8 max-w-2xl mx-auto border border-gray-200 dark:border-gray-800 shadow-sm">
        <div class="space-y-6">
          <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Title *</label>
            <input id="exp-title" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Electricity Bill" /></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
              <select id="exp-cat" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all">
                ${renderExpenseCategoryOptions()}
              </select></div>
            <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date</label>
              <input id="exp-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
          </div>
          <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Amount (Rs.) *</label>
            <input id="exp-amount" type="number" min="0" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" placeholder="0" /></div>
          <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Note (optional)</label>
            <textarea id="exp-note" rows="3" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all resize-none" placeholder="Add some details…"></textarea></div>
          <button onclick="saveExpense()" class="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/25">Save Expense</button>
        </div>
      </div>`;
  } else {
    // Render Expenses List View
    contentHtml = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div class="flex items-center gap-4">
          <div class="flex flex-col">
            <h2 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">Expenses Management - <span class="text-indigo-600 dark:text-indigo-400 font-black">${new Date(_expenseMonth + "-01").toLocaleDateString("default", { month: "long", year: "numeric" })}</span></h2>
            <div class="flex items-center gap-2 mt-1">
              <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Month: <span class="text-slate-900 dark:text-slate-200">${_expenseMonth}</span> — Total: <span class="text-rose-600 dark:text-rose-400">Rs. ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <!-- History Icon -->
          <button onclick="openExpensesHistory()" title="Expenses History" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-900 shadow-sm transition-all active:scale-95 group">
            <svg class="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>

          <button onclick="openPayBrandExpenses()" class="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-sm font-bold shadow-lg shadow-emerald-900/10 transition-all hover:-translate-y-0.5 active:scale-95">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
             Pay Brand
          </button>

          <button onclick="openAddCategoryPopup('expense')" class="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 group">
             <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
             Add Category
          </button>

          <button onclick="toggleExpenseView('add')" class="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white text-sm font-bold shadow-lg shadow-indigo-900/10 transition-all hover:-translate-y-0.5 active:scale-95">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Expense
          </button>
        </div>
      </div>

      <!-- Brand Payments Panel -->
      <div class="glass rounded-2xl border border-gray-200 dark:border-gray-800 mb-10 overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20">
           <div class="flex items-center gap-3">
             <h3 class="font-bold text-gray-800 dark:text-gray-100">Brand Expense Shares</h3>
             <span class="text-[10px] font-bold px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full text-indigo-500">${sharesRes.month}</span>
           </div>
           <div class="flex items-center gap-2">
             <!-- Edit Icon -->
             <button onclick="openBulkEditExpenses('${sharesRes.month}')" title="Bulk Edit Month Expenses" class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-indigo-500 transition-all shadow-sm">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
             </button>
             <!-- View Icon -->
             <button onclick="openViewExpenses('${sharesRes.month}')" title="View Monthly Report" class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-emerald-500 transition-all shadow-sm">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
             </button>
             <!-- Download Icon -->
             <button onclick="window.location.href='/api/brands/pdf/monthly-report?month=${sharesRes.month}&download=true'" title="Download Monthly Report PDF" class="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-amber-500 transition-all shadow-sm">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
             </button>
           </div>
        </div>
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-100 dark:border-gray-800">
          ${statCard("Total Month Expenses", "Rs. " + Number(sharesRes.totalExpenses).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "Operating costs", "rose", "All expense records dated inside the selected month, before brand payment settlement.")}
          ${statCard("Ownership Split", `${Number(sharesRes.totalOwnershipPercent || 0).toFixed(2).replace(/\.00$/, "")}% configured`, `${sharesRes.brandCount} share partners`, "blue", "Selected month's expenses split by share-based partner percentages. Product-based partners are audited through product profit.")}
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 bg-gray-50/30 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800">
                <th class="px-6 py-3 font-semibold text-[10px] uppercase">Brand</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Share %</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Target Share</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Paid</th>
                <th class="px-6 py-3 font-semibold text-[10px] uppercase text-right">Due</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              ${sharesRes.shares
        .map(
          (s) => `
                <tr class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td class="px-6 py-4 font-medium">${s.brand_name}</td>
                  <td class="px-6 py-4 text-right text-gray-500">${Number(s.ownership_percent || 0).toFixed(2).replace(/\.00$/, "")}%</td>
                  <td class="px-6 py-4 text-right text-gray-500">Rs. ${parseFloat(s.total_share).toFixed(2)}</td>
                  <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2 group">
                      <span class="text-emerald-600 dark:text-emerald-400 font-bold">Rs. ${parseFloat(s.paid).toFixed(2)}</span>
                      <button onclick="openEditBrandPayments(${s.brand_id}, '${sharesRes.month}')" class="p-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right text-rose-500 font-bold">Rs. ${parseFloat(s.due).toFixed(2)}</td>
                </tr>
              `,
        )
        .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="glass rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 mb-6">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">Operating Expenses</h3>
        </div>

        <table class="w-full text-sm">
          <thead><tr class="border-b border-gray-100 dark:border-gray-800 text-left bg-gray-50 dark:bg-gray-900/50">
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Title</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Category</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Added By</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Amount</th>
             <th class="px-6 py-4 text-xs font-semibold text-gray-500"></th>
           </tr></thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            ${pageExpenses.length
        ? pageExpenses
          .map(
            (e) => `
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td class="px-6 py-4">
                  <div class="font-medium text-gray-800 dark:text-gray-200">${e.title}</div>
                  ${e.note ? `<div class="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate" title="${e.note}">${e.note}</div>` : ""}
                </td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${catBadge(e.category)}">${catEmoji(e.category)} ${e.category}</span></td>
                 <td class="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">${e.date}</td>
                 <td class="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                   <div class="flex items-center gap-1.5">
                     <span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                     ${e.added_by || 'Admin'}
                   </div>
                 </td>
                 <td class="px-6 py-4 text-right text-rose-600 dark:text-rose-400 font-bold">Rs. ${Number(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                 <td class="px-6 py-4 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button onclick="openEditExpense(${e.id})" class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    <button onclick="deleteExpense(${e.id})" class="p-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                </td>
              </tr>`,
          )
          .join("")
        : `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No expenses found for this month.</td></tr>`
      }
          </tbody>
        </table>

        <!-- Pagination -->
        ${totalPages > 1
        ? `
        <div class="bg-gray-50/50 dark:bg-gray-900/20 px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div class="text-xs text-gray-500">
            Showing <span class="font-bold">${pageExpenses.length}</span> of <span class="font-bold">${filtered.length}</span> expenses
          </div>
          <div class="flex items-center gap-2">
            <button onclick="prevExpensePage()" ${_expensePage <= 1 ? "disabled" : ""} class="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
            <span class="text-xs text-gray-500 px-2">Page <span class="font-bold text-gray-800 dark:text-gray-200">${_expensePage}</span> of ${totalPages}</span>
            <button onclick="nextExpensePage(${totalPages})" ${_expensePage >= totalPages ? "disabled" : ""} class="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
          </div>
        </div>`
        : ""
      }
      </div>

      ${renderPreviousDuesCard(previousDues)}


    `;
  }

  $c("page-content").innerHTML = contentHtml;
}

// ─── Previous Months Dues Helpers ────────────────────────────────────
function renderPreviousDuesCard(previousDues) {
  if (!previousDues || previousDues.length === 0) return "";

  const totalOutstanding = previousDues.reduce((sum, m) => sum + m.totalDue, 0);

  return `
    <div class="glass rounded-2xl border border-rose-200 dark:border-rose-900/30 mb-10 overflow-hidden shadow-lg shadow-rose-500/5 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div class="px-6 py-4 flex items-center justify-between border-b border-rose-100 dark:border-rose-900/20 bg-rose-50/50 dark:bg-rose-950/10">
         <div class="flex items-center gap-3">
           <div class="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-white shadow-sm">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           </div>
           <h3 class="font-bold text-rose-900 dark:text-rose-200 uppercase tracking-tight">Previous Months Record/Dues</h3>
         </div>
         <button onclick="openPreviousDuesModal()" class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all active:scale-95">
           Details & Pay
         </button>
      </div>
      <div class="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <p class="text-sm text-rose-700 dark:text-rose-400 font-medium">There are outstanding dues from <span class="font-bold">${previousDues.length}</span> previous month(s).</p>
          <p class="text-[10px] text-rose-500/60 uppercase tracking-widest mt-1 font-bold">Please settle these amounts to clear individual brand ledgers.</p>
        </div>
        <div class="text-right">
          <div class="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Total Outstanding</div>
          <div class="text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tighter">Rs. ${totalOutstanding.toLocaleString()}</div>
        </div>
      </div>
    </div>
  `;
}

async function openPreviousDuesModal() {
  const previousDues = await api("/api/brands/all-months-dues");

  if (!previousDues || previousDues.length === 0) {
    return openModal("Previous Dues", '<p class="text-center py-10 text-slate-400 italic">No previous dues found. You are all caught up!</p>');
  }

  const html = `
    <div class="space-y-8 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      ${previousDues.map(m => `
        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/50">
          <div class="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">${new Date(m.month + "-01").toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
              <span class="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">Rs. ${m.totalExpenses.toLocaleString()} Total</span>
            </div>
            <button onclick="window.location.href='/api/brands/pdf/monthly-report?month=${m.month}&download=true'" class="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-amber-500 transition-colors" title="Download Monthly Report">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
          </div>
          <div class="p-4 space-y-3">
            ${m.brandDues.map(b => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/50 group">
                <div>
                  <div class="text-sm font-bold text-slate-800 dark:text-slate-200">${b.brand_name}</div>
                  <div class="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-0.5">Due: Rs. ${b.due.toFixed(2)}</div>
                </div>
                <div class="flex items-center gap-2">
                  <input id="prev-due-${m.month}-${b.brand_id}" type="number" value="${b.due.toFixed(2)}" class="w-24 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-right outline-none focus:border-indigo-500" />
                  <button onclick="doPayPreviousDue(${b.brand_id}, '${m.month}', 'prev-due-${m.month}-${b.brand_id}')" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">Pay</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  openModal("Previous Months Outstanding Dues", html, "max-w-3xl");
}

async function doPayPreviousDue(brandId, month, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast("Amount must be > 0", "error");

  const r = await api("/api/brands/expense-payments", "POST", {
    brand_id: brandId,
    amount,
    month,
  });
  if (r.error) return toast(r.error, "error");

  toast("Outstanding due settled!");
  openPreviousDuesModal(); // Refresh modal
  renderExpenses(); // Refresh background dashboard
}

// ─── Expense Helpers ────────────────────────────────────────────────
function toggleExpenseView(view) {
  _expenseView = view;
  _expensePage = 1;
  renderExpenses();
}

function filterExpenseMonth(val) {
  _expenseMonth = val;
  _expensePage = 1;
  renderExpenses();
}

function prevExpensePage() {
  if (_expensePage > 1) {
    _expensePage--;
    renderExpenses();
  }
}

function nextExpensePage(totalPages) {
  if (_expensePage < totalPages) {
    _expensePage++;
    renderExpenses();
  }
}

function openAddExpenseModal() {
  toggleExpenseView("add");
}

async function openPayBrandExpenses() {
  const sharesRes = await api(`/api/brands/expense-shares?month=${_expenseMonth}`);
  const rows = (sharesRes.shares || []).filter((s) => s.due > 0);

  if (!rows.length) {
    return openModal(
      "Pay Brand Expenses",
      `
      <p class="text-center text-gray-400 py-6">✔ All brands are fully paid for <strong>${sharesRes.month}</strong>.</p>
    `,
    );
  }

  openModal(
    "Pay Brand Expenses",
    `
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Month: <strong class="text-gray-800 dark:text-gray-200">${sharesRes.month}</strong></p>
    <div class="space-y-3">
      ${rows
      .map(
        (s) => `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div class="flex-1">
            <div class="font-semibold text-gray-800 dark:text-gray-200 text-sm">${s.brand_name}</div>
            <div class="text-xs text-gray-500">Due: <span class="text-rose-600 dark:text-rose-400 font-bold">Rs. ${Number(s.due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          </div>
          <input id="bep-${s.brand_id}" type="number" min="1" max="${s.due}" value="${s.due}"
            class="w-32 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-bold text-right"/>
          <button onclick="doPayBrandExpense(${s.brand_id}, '${sharesRes.month}')" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all">Pay</button>
        </div>
      `,
      )
      .join("")}
    </div>
    <div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
      <button onclick="closeModal()" class="px-6 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        Close
      </button>
    </div>
  `,
  );
}

async function doPayBrandExpense(brandId, month) {
  const input = document.getElementById("bep-" + brandId);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0) return toast("Amount must be > 0", "error");
  const r = await api("/api/brands/expense-payments", "POST", {
    brand_id: brandId,
    amount,
    month,
  });
  if (r.error) return toast(r.error, "error");
  toast("Payment recorded!");
  openPayBrandExpenses(); // Refresh modal content
  renderExpenses(); // Refresh background
}

function catBadge(c) {
  const cat = getExpenseCategoryChoices().find((x) => x.name === c);
  return cat ? cat.color_class : "bg-slate-700 text-slate-300";
}
function catEmoji(c) {
  const cat = getExpenseCategoryChoices().find((x) => x.name === c);
  return cat ? cat.emoji : "📦";
}


async function saveExpense() {
  const payload = {
    title: $c("exp-title").value.trim(),
    category: $c("exp-cat").value,
    amount: parseFloat($c("exp-amount").value),
    date: $c("exp-date").value,
    note: $c("exp-note").value.trim(),
  };
  if (!payload.title || !payload.amount)
    return toast("Title and amount required", "error");
  const r = await api("/api/expenses", "POST", payload);
  if (r.error) return toast(r.error, "error");
  toast("Expense added!");
  toggleExpenseView("list");
}

async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  try {
    await api(`/api/expenses/${id}`, "DELETE");
    toast("Expense removed");
    renderExpenses();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function openEditExpense(id) {
  const expenses = await api("/api/expenses");
  const e = expenses.find((x) => x.id === id);
  if (!e) return toast("Expense not found", "error");

  openModal(
    "Edit Expense",
    `
    <div class="space-y-4">
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title *</label>
        <input id="edit-exp-title" value="${e.title}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
        <select id="edit-exp-cat" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all">
          ${renderExpenseCategoryOptions(e.category)}
        </select></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Amount (Rs.) *</label>
          <input id="edit-exp-amount" type="number" min="0" value="${e.amount}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
        <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
          <input id="edit-exp-date" type="date" value="${e.date}" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all" /></div>
      </div>
      <div><label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Note (optional)</label>
        <textarea id="edit-exp-note" rows="2" class="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all resize-none">${e.note || ""}</textarea></div>
      <button onclick="updateExpense(${e.id})" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-md">Update Expense</button>
    </div>
  `,
  );
}

async function updateExpense(id) {
  const payload = {
    title: $c("edit-exp-title").value.trim(),
    category: $c("edit-exp-cat").value,
    amount: parseFloat($c("edit-exp-amount").value),
    date: $c("edit-exp-date").value,
    note: $c("edit-exp-note").value.trim(),
  };
  if (!payload.title || !payload.amount)
    return toast("Title and amount required", "error");
  try {
    await api("/api/expenses/" + id, "PUT", payload);
    closeModal();
    toast("Expense updated!");
    renderExpenses();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────
let _customersCache = [];
let _customersSearch = "";
let _customersStatus = "active";
let _customersFrom = "";
let _customersTo = "";
let _customersSort = "purchase_desc";
let _customersSearchTimer = null;

function captureCustomersFocusState(options = {}) {
  const active = document.activeElement;
  const filterIds = ["cust-search", "cust-from", "cust-to", "cust-status", "cust-sort"];
  const id = options.restoreFocusId || (filterIds.includes(active?.id) ? active.id : "");
  if (!id) return null;

  const state = { id, start: null, end: null };
  if (active?.id === id && typeof active.selectionStart === "number") {
    state.start = active.selectionStart;
    state.end = active.selectionEnd;
  }
  return state;
}

function restoreCustomersFocusState(state) {
  if (!state?.id) return;
  requestAnimationFrame(() => {
    const el = $c(state.id);
    if (!el) return;
    el.focus();
    if (typeof el.setSelectionRange === "function" && state.start !== null) {
      el.setSelectionRange(state.start, state.end ?? state.start);
    }
  });
}

function handleCustomerSearchInput(value) {
  _customersSearch = value;
  if (_customersSearchTimer) clearTimeout(_customersSearchTimer);
  _customersSearchTimer = setTimeout(() => {
    renderCustomers({ restoreFocusId: "cust-search" });
  }, 250);
}

async function renderCustomers(options = {}) {
  const focusState = captureCustomersFocusState(options);
  try {
    const canCreateCustomers = currentUserHasPermission('customers.create');
    const canUpdateCustomers = currentUserHasPermission('customers.update');
    const canManageCustomerLedger = currentUserHasPermission('customers.manage_ledger');
    const params = new URLSearchParams();
    params.set("status", _customersStatus);
    if (_customersSearch) params.set("search", _customersSearch);
    if (_customersFrom) params.set("from", _customersFrom);
    if (_customersTo) params.set("to", _customersTo);
    if (_customersSort) params.set("sort", _customersSort);

    _customersCache = await api(`/api/customers?${params.toString()}`);
    if (!Array.isArray(_customersCache)) _customersCache = [];

    const totalDue = _customersCache.reduce(
      (s, c) => s + Number(c.current_balance || 0),
      0,
    );
    const periodPurchases = _customersCache.reduce(
      (s, c) => s + Number(c.total_purchase_amount || 0),
      0,
    );
    const withDues = _customersCache.filter(
      (c) => Number(c.current_balance || 0) > 0.01,
    ).length;

    $c("page-content").innerHTML = `
      <div class="flex flex-col gap-6">
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-slate-800 dark:text-white">Customer Accounts</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              ${_customersCache.length} customers &nbsp;·&nbsp;
              <span class="text-emerald-600 dark:text-emerald-400 font-semibold">Purchases in filter: Rs. ${periodPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> &nbsp;·&nbsp;
              <span class="text-rose-500 font-semibold">${withDues} with dues</span> &nbsp;·&nbsp;
              Total outstanding: <span class="font-bold text-rose-600 dark:text-rose-400">Rs. ${totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          ${canCreateCustomers ? `<button onclick="openAddCustomerModal()"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Customer
          </button>` : ''}
        </div>

        <!-- Filters -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input id="cust-search" type="text" value="${escapeOrderValue(_customersSearch)}" placeholder="Search by name or phone…"
            oninput="handleCustomerSearchInput(this.value)"
            class="md:col-span-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm" />
          <input id="cust-from" type="date" value="${_customersFrom}" onchange="_customersFrom=this.value; renderCustomers()"
            class="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm" />
          <input id="cust-to" type="date" value="${_customersTo}" onchange="_customersTo=this.value; renderCustomers()"
            class="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm" />
          <div class="flex gap-3">
            <select id="cust-status" onchange="_customersStatus=this.value; renderCustomers()"
              class="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm">
              <option value="active" ${_customersStatus === "active" ? "selected" : ""}>Active</option>
              <option value="inactive" ${_customersStatus === "inactive" ? "selected" : ""}>Inactive</option>
              <option value="all" ${_customersStatus === "all" ? "selected" : ""}>All</option>
            </select>
            <select id="cust-sort" onchange="_customersSort=this.value; renderCustomers()"
              class="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all shadow-sm text-sm">
              <option value="purchase_desc" ${_customersSort === "purchase_desc" ? "selected" : ""}>Top Purchase</option>
              <option value="name_asc" ${_customersSort === "name_asc" ? "selected" : ""}>Name A-Z</option>
              <option value="recent_desc" ${_customersSort === "recent_desc" ? "selected" : ""}>Recent</option>
              <option value="due_desc" ${_customersSort === "due_desc" ? "selected" : ""}>Highest Due</option>
            </select>
          </div>
        </div>

        <!-- Table -->
        <div class="glass rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Customer</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Phone</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Purchases</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Sales Count</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Balance</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase">Last Purchase</th>
                  <th class="px-5 py-3 text-xs font-medium text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${_customersCache.length === 0
        ? `<tr><td colspan="7" class="px-5 py-12 text-center text-slate-400 italic">No customers found.</td></tr>`
        : _customersCache
          .map((c) => {
            const hasDue = Number(c.current_balance || 0) > 0.01;
            return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td class="px-5 py-4">
                        <div class="font-semibold text-slate-800 dark:text-slate-100">${c.name}</div>
                        ${c.email ? `<div class="text-xs text-slate-400 mt-0.5">${c.email}</div>` : ""}
                      </td>
                      <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">${c.phone || "—"}</td>
                      <td class="px-5 py-4">
                        <div class="font-bold text-emerald-600 dark:text-emerald-400">Rs. ${Number(c.total_purchase_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                        <div class="text-[11px] text-slate-400">Paid in filter: Rs. ${Number(c.total_paid_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td class="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">${c.total_sales || 0} sales</td>
                      <td class="px-5 py-4">
                        ${hasDue
                ? `<span class="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs font-bold">Rs. ${Number(c.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>`
                : `<span class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold">Cleared</span>`
              }
                      </td>
                      <td class="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">${c.last_purchase_at ? new Date(c.last_purchase_at).toLocaleDateString("en-GB") : "—"}</td>
                      <td class="px-5 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button onclick="viewCustomerLedger(${c.id})" title="View Ledger & Reports"
                            class="p-1.5 rounded bg-indigo-100 dark:bg-indigo-500/10 hover:bg-indigo-200 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                          </button>
                          ${hasDue && canManageCustomerLedger
                ? `
                          <button onclick="openPaymentModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.current_balance})" title="Record Payment"
                            class="p-1.5 rounded bg-emerald-100 dark:bg-emerald-500/10 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          </button>`
                : ""
              }
                          ${canUpdateCustomers ? `<button onclick="openEditCustomerModal(${c.id})" title="Edit Customer"
                            class="p-1.5 rounded bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          </button>` : ''}
                        </div>
                      </td>
                    </tr>`;
          })
          .join("")
      }
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    restoreCustomersFocusState(focusState);
  } catch (err) {
    $c("page-content").innerHTML =
      `<div class="p-10 text-center text-rose-500 font-bold">Failed to load customers: ${err.message}</div>`;
  }
}

function openAddCustomerModal() {
  if (!currentUserHasPermission('customers.create')) return toast('You do not have permission to create customers.', 'error');
  const html = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Full Name *</label>
          <input id="cust-name" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Ahmed Khan" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Phone</label>
          <input id="cust-phone" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="03xx-xxxxxxx" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Email</label>
          <input id="cust-email" type="email" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="email@example.com" /></div>
        <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Address</label>
          <input id="cust-address" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Street, City" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Opening Balance (Rs.)</label>
          <input id="cust-opening" type="number" min="0" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-400 focus:outline-none focus:border-indigo-500 transition-all font-bold" /></div>
        <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Credit Limit (Rs.)</label>
          <input id="cust-limit" type="number" min="0" value="0" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
        <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Notes</label>
          <input id="cust-notes" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Optional" /></div>
      </div>
      <button onclick="saveNewCustomer()" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg">Save Customer</button>
    </div>`;
  openModal("Add New Customer", html, "max-w-lg");
}

async function saveNewCustomer() {
  const name = $c("cust-name")?.value.trim();
  const phone = $c("cust-phone")?.value.trim();
  const email = $c("cust-email")?.value.trim();
  const address = $c("cust-address")?.value.trim();
  const credit_limit = parseFloat($c("cust-limit")?.value) || 0;
  const opening_balance = parseFloat($c("cust-opening")?.value) || 0;
  const notes = $c("cust-notes")?.value.trim();
  if (!name) return toast("Customer name is required", "error");
  try {
    await api("/api/customers", "POST", {
      name,
      phone,
      email,
      address,
      credit_limit,
      opening_balance,
      notes,
    });
    toast("Customer saved!");
    closeModal();
    renderCustomers();
  } catch (err) {
    toast(err.message, "error");
  }
}



async function openEditCustomerModal(customerId) {
  if (!currentUserHasPermission('customers.update')) return toast('You do not have permission to update customers.', 'error');
  try {
    const data = await api(`/api/customers/${customerId}`);
    const c = data.customer;
    const html = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Full Name *</label>
            <input id="edit-cust-name" value="${c.name}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Phone</label>
            <input id="edit-cust-phone" value="${c.phone || ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Email</label>
            <input id="edit-cust-email" value="${c.email || ""}" type="email" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Address</label>
            <input id="edit-cust-address" value="${c.address || ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Credit Limit (Rs.)</label>
            <input id="edit-cust-limit" type="number" min="0" value="${c.credit_limit || 0}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
          <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Status</label>
            <select id="edit-cust-status" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all">
              <option value="active" ${c.status === "active" ? "selected" : ""}>Active</option>
              <option value="inactive" ${c.status === "inactive" ? "selected" : ""}>Inactive</option>
            </select></div>
          <div class="col-span-2"><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Notes</label>
            <input id="edit-cust-notes" value="${c.notes || ""}" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" /></div>
        </div>
        <button onclick="saveEditCustomer(${c.id})" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg">Save Changes</button>
      </div>`;
    openModal("Edit Customer", html, "max-w-lg");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function saveEditCustomer(customerId) {
  const name = $c("edit-cust-name")?.value.trim();
  const phone = $c("edit-cust-phone")?.value.trim();
  const email = $c("edit-cust-email")?.value.trim();
  const address = $c("edit-cust-address")?.value.trim();
  const credit_limit = parseFloat($c("edit-cust-limit")?.value) || 0;
  const status = $c("edit-cust-status")?.value;
  const notes = $c("edit-cust-notes")?.value.trim();
  if (!name) return toast("Name required", "error");
  try {
    await api(`/api/customers/${customerId}`, "PUT", {
      name,
      phone,
      email,
      address,
      credit_limit,
      status,
      notes,
    });
    toast("Customer updated!");
    closeModal();
    renderCustomers();
  } catch (err) {
    toast(err.message, "error");
  }
}

function openPaymentModal(customerId, customerName, currentBalance) {
  if (!currentUserHasPermission('customers.manage_ledger')) return toast('You do not have permission to manage the customer ledger.', 'error');
  const html = `
    <div class="space-y-4">
      <div class="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30">
        <p class="text-sm font-medium text-rose-700 dark:text-rose-400">Outstanding Balance</p>
        <p class="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">Rs. ${Number(currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
      </div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Amount Received (Rs.) *</label>
        <input id="pay-amount" type="number" min="0.01" step="0.01" max="${currentBalance}" value="${currentBalance.toFixed(2)}"
          class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Payment Method *</label>
        <select id="pay-method" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold"><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online Transfer</option></select></div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Note (Optional)</label>
        <input id="pay-note" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Cash payment, cheque #1234" /></div>
      <button onclick="submitPayment(${customerId})" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg">Confirm Payment</button>
    </div>`;
  openModal(`Record Payment — ${customerName}`, html, "max-w-md");
}

async function submitPayment(customerId) {
  if (!(await ensureOpenShiftForPayment())) return;

  const amount = parseFloat($c("pay-amount")?.value) || 0;
  const payment_method = $c("pay-method")?.value || "cash";
  const note = $c("pay-note")?.value.trim();
  if (amount <= 0) return toast("Enter a valid amount", "error");
  try {
    const r = await api(`/api/customers/${customerId}/payment`, "POST", {
      amount,
      payment_method,
      note,
    });
    toast(
      `Payment of Rs. ${r.payment_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} recorded!`,
    );
    closeModal();
    if (_currentPage === 'pending-dues') {
      renderPendingDues();
    } else {
      renderCustomers();
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

async function viewCustomerLedger(customerId) {
  try {
    const from = $c("cust-from")?.value || "";
    const to = $c("cust-to")?.value || "";
    const params = new URLSearchParams();
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const data = await api(
      `/api/customers/${customerId}${params.toString() ? `?${params.toString()}` : ""}`,
    );
    const { customer, ledger, sales, summary } = data;

    const totalDebits =
      summary?.total_ledger_debit ||
      ledger.filter((e) => e.type === "sale").reduce((s, e) => s + e.amount, 0);
    const totalCredits =
      summary?.total_ledger_credit ||
      ledger
        .filter((e) => e.type === "payment")
        .reduce((s, e) => s + e.amount, 0);
    const fmt = (n) =>
      Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

    const ledgerRows = ledger.length
      ? ledger
        .map((e, idx) => {
          const d = new Date(e.created_at).toLocaleDateString("en-GB");

          let ref = "—";
          if (e.sale_id) {
            ref = `SALE-${String(e.sale_id).padStart(5, "0")}`;
          } else if (e.type === "payment") {
            ref = `PAY-${String(e.id).padStart(5, "0")}`;
          } else if (e.type === "return") {
            ref = `RET-${String(e.id).padStart(5, "0")}`;
          } else if (e.type === "adjustment") {
            ref = `ADJ-${String(e.id).padStart(5, "0")}`;
          } else if (e.type === "opening") {
            ref = `OPN-${String(e.id).padStart(5, "0")}`;
          }

          const isDebit =
            e.type === "sale" ||
            (e.type === "adjustment" &&
              e.balance_after >
              (idx > 0 ? ledger[idx - 1].balance_after : e.balance_after - e.amount)) ||
            (e.type === "opening" && e.amount > 0);

          // For returns, we want to know if it actually reduced the debt or was just a cash refund
          const prevBal = idx > 0 ? ledger[idx - 1].balance_after : (e.balance_after + (isDebit ? -e.amount : e.amount));
          const wasBalanceAffected = Math.abs(e.balance_after - prevBal) > 0.01;

          const typeMap = {
            sale: { label: "CREDIT SALE", color: "rose" },
            payment: { label: "PAYMENT", color: "emerald" },
            return: { label: wasBalanceAffected ? "RETURN (CREDIT)" : "RETURN (CASH)", color: "blue" },
            adjustment: { label: "ADJUSTMENT", color: "slate" },
            opening: { label: "OPENING", color: "indigo" },
          };
          const style = typeMap[e.type] || { label: e.type.toUpperCase(), color: "slate" };

          return `
            <tr class="${idx % 2 === 0 ? "" : "bg-slate-50 dark:bg-white/[0.02]"} border-b border-slate-100 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-white/[0.04]">
              <td class="px-4 py-2.5 text-sm text-slate-500">${d}</td>
              <td class="px-4 py-2.5 text-xs font-mono text-indigo-600 dark:text-indigo-400">${ref}</td>
              <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-${style.color}-100 dark:bg-${style.color}-500/10 text-${style.color}-700 dark:text-${style.color}-400">${style.label}</span></td>
              <td class="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title="${e.note || ""}">
                ${e.note || "—"}
              </td>
              <td class="px-4 py-2.5 text-right text-sm font-semibold ${isDebit ? "text-rose-600 dark:text-rose-400" : "text-slate-300 dark:text-slate-600"}">${isDebit ? "Rs. " + fmt(e.amount) : "—"}</td>
              <td class="px-4 py-2.5 text-right text-sm font-semibold ${!isDebit ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"}">${!isDebit ? "Rs. " + fmt(e.amount) : "—"}</td>
              <td class="px-4 py-2.5 text-right text-sm font-bold ${e.balance_after > 0.01 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}">Rs. ${fmt(e.balance_after)}</td>
            </tr>`;
        })
        .join("")
      : `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400 italic text-sm">No transactions yet.</td></tr>`;

    const salesRows =
      sales
        .slice(0, 8)
        .map((s) => {
          const due = s.total - s.amount_received;
          return `
        <tr class="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
          <td class="px-4 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">#${s.order_number || s.id}</td>
          <td class="px-4 py-2.5 text-sm text-slate-500">${new Date(s.created_at).toLocaleDateString("en-GB")}</td>
          <td class="px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100">Rs. ${fmt(s.total)}</td>
          <td class="px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">Rs. ${fmt(s.amount_received)}</td>
          <td class="px-4 py-2.5 text-sm font-bold ${due > 0.01 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}">Rs. ${fmt(due)}</td>
          <td class="px-4 py-2.5 text-right">
            <button onclick="showReceiptPrintMenu(${s.id})" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Print</button>
          </td>
        </tr>`;
        })
        .join("") ||
      `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic text-sm">No sales.</td></tr>`;

    const today = new Date().toISOString().slice(0, 10);
    const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const html = `
      <div class="space-y-6">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30 text-center">
            <p class="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase mb-1">Total Debited</p>
            <p class="text-lg font-bold text-rose-700 dark:text-rose-300">Rs. ${fmt(totalDebits)}</p>
          </div>
          <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 text-center">
            <p class="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1">Total Paid</p>
            <p class="text-lg font-bold text-emerald-700 dark:text-emerald-300">Rs. ${fmt(totalCredits)}</p>
          </div>
          <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-center">
            <p class="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Purchases</p>
            <p class="text-lg font-bold text-blue-700 dark:text-blue-300">Rs. ${fmt(summary?.total_purchase_amount || 0)}</p>
          </div>
          <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30 text-center">
            <p class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Sales Count</p>
            <p class="text-lg font-bold text-indigo-700 dark:text-indigo-300">${summary?.total_sales_count || sales.length}</p>
          </div>
          <div class="p-3 rounded-xl ${customer.current_balance > 0.01 ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/30" : "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"} border text-center">
            <p class="text-xs font-bold ${customer.current_balance > 0.01 ? "text-amber-600 dark:text-amber-400" : "text-slate-500"} uppercase mb-1">Balance Due</p>
            <p class="text-lg font-bold ${customer.current_balance > 0.01 ? "text-amber-700 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-400"}">Rs. ${fmt(customer.current_balance)}</p>
          </div>
        </div>

        <!-- PDF Download buttons -->
        <div class="flex flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <input type="date" id="ledger-from" value="${from30}" class="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-indigo-500 transition-all dark:text-white" />
            <span class="text-slate-400 text-sm">→</span>
            <input type="date" id="ledger-to" value="${today}" class="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-indigo-500 transition-all dark:text-white" />
          </div>
          <button onclick="downloadLedgerPDF(${customer.id})"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            Account Ledger PDF
          </button>
          <button onclick="downloadSalesReportPDF(${customer.id})"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Sales Report PDF
          </button>
          ${currentUserHasPermission('customers.manage_ledger') ? `<button onclick="openAdjustmentModal(${customer.id}, '${customer.name.replace(/'/g, "\\'")}')"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
            Adjust Balance
          </button>` : ''}
          ${customer.current_balance > 0.01 && currentUserHasPermission('customers.manage_ledger')
        ? `
          <button onclick="closeModal(); openPaymentModal(${customer.id}, '${customer.name.replace(/'/g, "\\'")}', ${customer.current_balance})"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-all shadow">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Record Payment
          </button>`
        : ""
      }
        </div>

        <!-- Ledger table -->
        <div>
          <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 uppercase tracking-wide">Transaction Ledger</h4>
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Ref</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Note</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Debit</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Credit</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Balance</th>
                </tr>
              </thead>
              <tbody>${ledgerRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Recent Sales -->
        <div>
          <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 uppercase tracking-wide">Recent Sales (last ${Math.min(8, sales.length)})</h4>
          <div class="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Sale #</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Total</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Paid</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Due</th>
                  <th class="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody>${salesRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    openModal(`${customer.name} — Account Ledger`, html, "max-w-4xl");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function extractLogoAccent(logoUrl) {
  if (!logoUrl) return '';
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 64, 64);
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        const buckets = new Map();
        for (let i = 0; i < pixels.length; i += 16) {
          const alpha = pixels[i + 3];
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (alpha < 160 || max > 242 || max - min < 22) continue;
          const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
          buckets.set(key, (buckets.get(key) || 0) + (max - min));
        }
        const dominant = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!dominant) return resolve('');
        const hex = dominant.split(',').map((value) => Math.min(255, Number(value)).toString(16).padStart(2, '0')).join('');
        resolve(`#${hex}`);
      } catch (_) { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = logoUrl;
  });
}

async function downloadLedgerPDF(customerId) {
  const reportWindow = window.open('', '_blank');
  const from = $c("ledger-from")?.value || "";
  const to = $c("ledger-to")?.value || "";
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  try {
    const settings = await api('/api/shop-settings');
    const logoUrl = settings?.logo_url || settings?.logo_data || settings?.logo_path || '';
    const accent = await extractLogoAccent(logoUrl);
    if (accent) params.append('accent', accent);
  } catch (_) {}
  const reportUrl = `/api/customers/${customerId}/ledger.pdf?${params}`;
  if (reportWindow) reportWindow.location.href = reportUrl;
  else window.location.href = reportUrl;
}

function downloadSalesReportPDF(customerId) {
  const from = $c("ledger-from")?.value || "";
  const to = $c("ledger-to")?.value || "";
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  window.open(`/api/customers/${customerId}/report.pdf?${params}`, "_blank");
}

function openAdjustmentModal(customerId, customerName) {
  if (!currentUserHasPermission('customers.manage_ledger')) return toast('You do not have permission to manage the customer ledger.', 'error');
  const html = `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Adjustment Type</label>
        <div class="grid grid-cols-2 gap-3">
          <button onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('bg-indigo-600','bg-slate-100')); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('text-white','text-slate-600')); this.classList.replace('bg-slate-100','bg-indigo-600'); this.classList.replace('text-slate-600','text-white');" id="adj-type-debit" data-type="debit" class="py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm transition-all border border-indigo-200 dark:border-indigo-900/50">Increase Debt</button>
          <button onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('bg-indigo-600','bg-slate-100')); this.parentElement.querySelectorAll('button').forEach(b=>b.classList.replace('text-white','text-slate-600')); this.classList.replace('bg-slate-100','bg-indigo-600'); this.classList.replace('text-slate-600','text-white');" id="adj-type-credit" data-type="credit" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-sm transition-all border border-slate-200 dark:border-slate-700">Decrease Debt</button>
        </div>
      </div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Amount (Rs.) *</label>
        <input id="adj-amount" type="number" min="0.01" step="0.01" placeholder="0.00"
          class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all font-bold text-lg" /></div>
      <div><label class="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Reason / Note *</label>
        <input id="adj-note" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition-all" placeholder="e.g. Service charge, previous discount, etc." /></div>
      <button onclick="submitAdjustment(${customerId})" class="w-full py-3 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white font-bold transition-all shadow-lg">Process Adjustment</button>
    </div>`;
  openModal(`Manual Adjustment — ${customerName}`, html, "max-w-md");
}

async function submitAdjustment(customerId) {
  const amount = parseFloat($c("adj-amount")?.value) || 0;
  const note = $c("adj-note")?.value.trim();
  const type = $c("adj-type-debit").classList.contains("bg-indigo-600") ? "debit" : "credit";

  if (amount <= 0) return toast("Enter a valid amount", "error");
  if (!note) return toast("Reason is required for adjustments", "error");

  try {
    const r = await api(`/api/customers/${customerId}/adjustment`, "POST", {
      amount,
      type,
      note,
    });
    toast(`Adjustment recorded! New balance: Rs. ${r.new_balance.toLocaleString()}`);
    closeModal();
    renderCustomers();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function searchPOSCustomers(query) {
  const resultsEl = $c("pos-customer-results");
  const hiddenIdEl = $c("pos-customer-id");
  if (!resultsEl || !hiddenIdEl) return;

  if (
    _posSelectedCustomer &&
    query !== (_posSelectedCustomer.name || "") &&
    query !== (_posSelectedCustomer.phone || "")
  ) {
    hiddenIdEl.value = "";
    _posSelectedCustomer = null;
    renderPOSSelectedCustomerBadge();
  }

  const q = String(query || "").trim();
  if (q.length < 1) {
    _posCustomerResults = [];
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    return;
  }

  try {
    const customers = await api(
      `/api/customers?status=active&search=${encodeURIComponent(q)}`,
    );
    _posCustomerResults = Array.isArray(customers) ? customers.slice(0, 8) : [];
    if (!_posCustomerResults.length) {
      resultsEl.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No customer found. Continue typing to create/link on checkout.</div>`;
      resultsEl.classList.remove("hidden");
      return;
    }

    resultsEl.innerHTML = _posCustomerResults
      .map(
        (c) => `
      <button type="button" onclick="selectPOSCustomer(${c.id})" class="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border-b border-slate-100 dark:border-slate-800 last:border-b-0">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-slate-800 dark:text-slate-100">${c.name}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">${c.phone || "No phone"}${c.email ? ` · ${c.email}` : ""}</div>
          </div>
          <div class="text-right">
            <div class="text-[11px] font-bold ${Number(c.current_balance || 0) > 0.01 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}">
              ${Number(c.current_balance || 0) > 0.01 ? `Due Rs. ${Number(c.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "Cleared"}
            </div>
          </div>
        </div>
      </button>
    `,
      )
      .join("");
    resultsEl.classList.remove("hidden");
  } catch (err) {
    resultsEl.innerHTML = `<div class="px-4 py-3 text-sm text-rose-500">Search failed: ${err.message}</div>`;
    resultsEl.classList.remove("hidden");
  }
}

function selectPOSCustomer(customerId) {
  const customer = _posCustomerResults.find((c) => c.id === customerId);
  if (!customer) return;

  _posSelectedCustomer = customer;
  if ($c("pos-customer-id")) $c("pos-customer-id").value = customer.id;
  if ($c("pos-customer")) $c("pos-customer").value = customer.name || "";
  if ($c("pos-phone")) $c("pos-phone").value = customer.phone || "";

  const resultsEl = $c("pos-customer-results");
  if (resultsEl) {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
  }

  renderPOSSelectedCustomerBadge();
}

function clearPOSCustomerSelection() {
  _posSelectedCustomer = null;
  _posCustomerResults = [];
  if ($c("pos-customer-id")) $c("pos-customer-id").value = "";
  if ($c("pos-customer")) $c("pos-customer").value = "";
  if ($c("pos-phone")) $c("pos-phone").value = "";
  const resultsEl = $c("pos-customer-results");
  if (resultsEl) {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
  }
  renderPOSSelectedCustomerBadge();
}

function syncPOSCustomerManualEntry() {
  const currentName = $c("pos-customer")?.value.trim() || "";
  const currentPhone = $c("pos-phone")?.value.trim() || "";
  if (_posSelectedCustomer) {
    const sameName = currentName === (_posSelectedCustomer.name || "");
    const samePhone = currentPhone === (_posSelectedCustomer.phone || "");
    if (!sameName || !samePhone) {
      _posSelectedCustomer = null;
      if ($c("pos-customer-id")) $c("pos-customer-id").value = "";
      renderPOSSelectedCustomerBadge();
    }
  }
}

function renderPOSSelectedCustomerBadge() {
  const badge = $c("pos-selected-customer-badge");
  if (!badge) return;

  if (!_posSelectedCustomer) {
    badge.classList.add("hidden");
    badge.innerHTML = "";
    return;
  }

  badge.classList.remove("hidden");
  badge.innerHTML = `
    <div class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30">
      <div>
        <div class="text-xs uppercase font-black tracking-widest text-indigo-500 dark:text-indigo-400">Linked Customer</div>
        <div class="font-semibold text-slate-800 dark:text-slate-100">${_posSelectedCustomer.name}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${_posSelectedCustomer.phone || "No phone"} · ${Number(_posSelectedCustomer.current_balance || 0) > 0.01 ? `Current Due Rs. ${Number(_posSelectedCustomer.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "No due balance"}</div>
      </div>
      <button type="button" onclick="clearPOSCustomerSelection()" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
        Unlink
      </button>
    </div>
  `;
}
// ─── Close modal on backdrop click (prevent if static) ───────────────────
$c("modal").addEventListener("click", (e) => {
  if (e.target === $c("modal")) {
    if ($c("modal").dataset.static === "true") return;
    closeModal();
  }
});

// ─── Start (moved to end of file after all functions are defined) ───
function renderLobby() {
  document.body.classList.add("lobby-active");
  const content = document.getElementById("page-content");

  // Filter panels based on user permissions
  const allowed = getAllowedPanelsForCurrentUser();

  if (allowed.length === 0 && currentUser.role === 'admin') {
    const dash = AVAILABLE_PANELS.find(p => p.id === 'dashboard');
    if (dash) allowed.push(dash);
  }

  content.innerHTML = `
    <div class="flex items-center justify-between gap-4 mb-10 pb-6 border-b border-indigo-200 dark:border-indigo-900/50">
      <div>
        <h3 class="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Switch Modules</h3>
        <p class="text-sm text-slate-500 font-medium italic mt-1">Select a workspace based on the kind of work you are doing.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      ${allowed.map((p, index) => {
    const delay = index * 40;
    return `
          <div onclick="navigate('${p.id}')" 
               style="animation: lobby-fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: ${delay}ms; opacity: 0;"
               class="group flex items-center gap-5 p-5 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1">
              
              <div class="w-14 h-14 min-w-[3.5rem] rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 group-hover:scale-110 transition-all duration-300 shadow-inner">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      ${p.icon}
                  </svg>
              </div>
              
              <div class="flex-1 min-w-0">
                  <div class="text-lg font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors tracking-tight truncate">${p.label}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 line-clamp-2 opacity-80">${p.desc || ""}</div>
              </div>

              <div class="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 shrink-0">
                  <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
              </div>
          </div>
        `;
  }).join("")}
    </div>
  `;
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
let _notificationFilter = "all";
let _notificationsData = [];
let _notificationShops = [];
let _notificationUsers = [];

function notificationTypeMeta(type) {
  const map = {
    announcement: { label: "Announcement", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20" },
    assignment: { label: "Assignment", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20" },
    release: { label: "Release", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" },
    billing: { label: "Billing", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20" },
    maintenance: { label: "Maintenance", dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/20" },
    support: { label: "Support", dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20" },
    system: { label: "System", dot: "bg-slate-500", chip: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  };
  return map[type] || map.announcement;
}

function notificationPriorityClass(priority) {
  const map = {
    low: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    normal: "bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",
    high: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    urgent: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  };
  return map[priority] || map.normal;
}

function formatNotificationDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function notificationTargetLabel(notification) {
  if (notification.target_user_name || notification.target_user_username) {
    return `Assigned to ${notification.target_user_name || notification.target_user_username}`;
  }
  if (notification.shop_name) return notification.shop_name;
  return "All restaurants";
}

function notificationAction(notification) {
  if (!notification) return;
  const url = String(notification.action_url || "").trim();
  if (!url) return;
  if (url.startsWith("page:")) {
    navigate(url.slice(5));
    return;
  }
  if (url.startsWith("/")) {
    window.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener");
}

function setNotificationFilter(filter) {
  _notificationFilter = filter;
  renderNotifications(_currentPage === 'notification-inbox' ? 'inbox' : 'platform');
}

function currentNotificationChannel() {
  return _currentPage === 'notification-inbox' ? 'inbox' : 'platform';
}

function notificationFilterButton(id, label, count = null) {
  const active = _notificationFilter === id;
  return `
    <button onclick="setNotificationFilter('${id}')" class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${active
      ? "bg-slate-950 text-white border-slate-950 dark:bg-white dark:text-slate-950 dark:border-white"
      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500"}">
      ${label}${count !== null ? ` <span class="ml-1 opacity-70">${count}</span>` : ""}
    </button>
  `;
}

function renderNotificationCards(notifications) {
  if (!notifications.length) {
    return `
      <div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
        <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 mx-auto mb-4 flex items-center justify-center">
          <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h8M8 14h5M5 5h14v14H5z" />
          </svg>
        </div>
        <h3 class="text-lg font-black text-slate-900 dark:text-white">No notifications found</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">New platform releases, assignments, and restaurant notices will appear here.</p>
      </div>
    `;
  }

  return notifications.map((notification) => {
    const meta = notificationTypeMeta(notification.type);
    const unread = !notification.read_at;
    const safeTitle = escapeOrderValue(notification.title);
    const safeMessage = escapeOrderValue(notification.message).replace(/\n/g, "<br>");
    const target = escapeOrderValue(notificationTargetLabel(notification));
    const created = formatNotificationDate(notification.created_at);
    const due = formatNotificationDate(notification.due_at);
    const expires = formatNotificationDate(notification.expires_at);
    const author = escapeOrderValue(notification.created_by_name || notification.created_by_username || "Platform Owner");
    const canArchive = currentUser.role === "superadmin" && notification.status !== "archived";

    return `
      <article class="relative overflow-hidden rounded-2xl border ${unread ? "border-teal-300 dark:border-teal-500/60 bg-teal-50/40 dark:bg-teal-500/5" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"} p-5 shadow-sm">
        <div class="flex flex-col lg:flex-row lg:items-start gap-4">
          <div class="w-11 h-11 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
            <span class="w-2.5 h-2.5 rounded-full ${meta.dot}"></span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${meta.chip}">${meta.label}</span>
              <span class="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${notificationPriorityClass(notification.priority)}">${escapeOrderValue(notification.priority || "normal")}</span>
              ${unread ? `<span class="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest">Unread</span>` : ""}
              ${notification.status === "archived" ? `<span class="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest">Archived</span>` : ""}
            </div>
            <h3 class="text-xl font-black text-slate-950 dark:text-white tracking-tight break-words">${safeTitle}</h3>
            <p class="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-6 break-words">${safeMessage}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              <span>${target}</span>
              <span>By ${author}</span>
              ${created ? `<span>${created}</span>` : ""}
              ${due ? `<span class="text-violet-500 dark:text-violet-300">Due ${due}</span>` : ""}
              ${expires ? `<span>Expires ${expires}</span>` : ""}
            </div>
          </div>
          <div class="flex lg:flex-col gap-2 shrink-0">
            ${notification.action_url ? `<button onclick="notificationAction(_notificationsData.find(n => Number(n.id) === ${Number(notification.id)}))" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all">${escapeOrderValue(notification.action_label || "Open")}</button>` : ""}
            ${unread ? `<button onclick="markNotificationRead(${Number(notification.id)})" class="px-4 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black hover:border-teal-400 transition-all">Mark Read</button>` : ""}
            ${canArchive ? `<button onclick="archiveNotification(${Number(notification.id)})" class="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-black hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all">Archive</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderNotificationInbox() {
  return renderNotifications('inbox');
}

async function renderNotifications(channel = 'platform') {
  const isInbox = channel === 'inbox';
  const availableFilters = isInbox
    ? new Set(['all', 'unread', 'assignment', 'system', 'announcement', 'support'])
    : new Set(['all', 'unread', 'assignment', 'release', 'announcement', 'billing', 'maintenance']);
  if (!availableFilters.has(_notificationFilter)) _notificationFilter = 'all';
  const content = document.getElementById("page-content");
  content.innerHTML = `
    <div class="flex items-center justify-center h-52 text-slate-400 font-bold">
      Loading notifications...
    </div>
  `;

  const params = new URLSearchParams({ limit: "150", channel });
  if (_notificationFilter === "unread") params.set("unread_only", "1");
  else if (_notificationFilter !== "all") params.set("type", _notificationFilter);
  if (currentUser.role === "superadmin") params.set("include_archived", "1");

  try {
    const [notifications, unreadData] = await Promise.all([
      api(`/api/notifications?${params.toString()}`),
      api(`/api/notifications/unread-count?channel=${channel}`).catch(() => ({ count: 0 })),
    ]);

    _notificationsData = Array.isArray(notifications) ? notifications : [];
    const unreadCount = Number(unreadData.count || 0);
    updateNotificationTopbarBadge();
    const assignmentCount = _notificationsData.filter((n) => n.type === "assignment").length;
    const releaseCount = _notificationsData.filter((n) => n.type === "release").length;
    const systemCount = _notificationsData.filter((n) => n.type === "system").length;

    content.innerHTML = `
      <div class="space-y-6">
        <section class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div class="text-xs font-black uppercase tracking-[0.2em] ${isInbox ? 'text-indigo-600 dark:text-indigo-300' : 'text-teal-600 dark:text-teal-300'}">${isInbox ? 'Personal Operations' : 'Restaurant Communication'}</div>
            <h2 class="text-3xl font-black text-slate-950 dark:text-white tracking-tight mt-1">${isInbox ? 'My Notification Inbox' : 'Notification Center'}</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">${isInbox ? 'Private order updates and messages from people in your restaurant, visible only when relevant to you.' : 'Platform notices, assigned work, release updates, billing reminders, and messages from the master owner.'}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            ${!isInbox && currentUser.role === "superadmin" ? `
              <button onclick="openNotificationComposer()" class="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-teal-600/20 transition-all">
                New Notice
              </button>
            ` : `
              <button onclick="markAllNotificationsRead()" class="px-5 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-950 text-xs font-black uppercase tracking-widest transition-all">
                Mark All Read
              </button>
            `}
          </div>
        </section>

        <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Unread</div>
            <div class="text-3xl font-black text-slate-950 dark:text-white mt-2">${unreadCount}</div>
          </div>
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">${isInbox ? 'Order Updates' : 'Assignments'}</div>
            <div class="text-3xl font-black text-slate-950 dark:text-white mt-2">${isInbox ? systemCount : assignmentCount}</div>
          </div>
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">${isInbox ? 'Assignments' : 'Releases'}</div>
            <div class="text-3xl font-black text-slate-950 dark:text-white mt-2">${isInbox ? assignmentCount : releaseCount}</div>
          </div>
        </section>

        <section class="flex flex-wrap gap-2">
          ${notificationFilterButton("all", "All", _notificationsData.length)}
          ${notificationFilterButton("unread", "Unread", unreadCount)}
          ${notificationFilterButton("assignment", "Assignments")}
          ${isInbox ? notificationFilterButton("system", "Order Updates") : notificationFilterButton("release", "Releases")}
          ${notificationFilterButton("announcement", "Announcements")}
          ${!isInbox ? notificationFilterButton("billing", "Billing") : ''}
          ${!isInbox ? notificationFilterButton("maintenance", "Maintenance") : notificationFilterButton("support", "Support")}
        </section>

        <section class="space-y-3">
          ${renderNotificationCards(_notificationsData)}
        </section>
      </div>
    `;
  } catch (error) {
    console.error("Notifications load error:", error);
    content.innerHTML = `
      <div class="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-8 text-rose-700 dark:text-rose-300 font-bold">
        ${escapeOrderValue(error.message || "Failed to load notifications.")}
      </div>
    `;
  }
}

async function openNotificationComposer() {
  if (currentUser.role !== "superadmin") return;
  try {
    const [shops, users] = await Promise.all([
      api("/api/shops"),
      api("/api/users"),
    ]);
    _notificationShops = Array.isArray(shops) ? shops : [];
    _notificationUsers = Array.isArray(users) ? users.filter((u) => u.role !== "superadmin" && u.shop_id) : [];

    openModal("New Notification", `
      <div class="space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Type</span>
            <select id="notif-type" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
              <option value="announcement">Announcement</option>
              <option value="assignment">Assignment</option>
              <option value="release">Release</option>
              <option value="billing">Billing</option>
              <option value="maintenance">Maintenance</option>
              <option value="support">Support</option>
              <option value="system">System</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Priority</span>
            <select id="notif-priority" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Target Restaurant</span>
            <select id="notif-shop" onchange="updateNotificationTargetUsers()" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
              <option value="">All Restaurants</option>
              ${_notificationShops.map((shop) => `<option value="${Number(shop.id)}">${escapeOrderValue(shop.name || `Shop #${shop.id}`)}</option>`).join("")}
            </select>
          </label>
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Assign To</span>
            <select id="notif-user" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
              <option value="">Whole selected audience</option>
            </select>
          </label>
        </div>

        <label class="block">
          <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Title</span>
          <input id="notif-title" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white" placeholder="Example: New sales report is available">
        </label>

        <label class="block">
          <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Message</span>
          <textarea id="notif-message" rows="5" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-800 dark:text-white" placeholder="Write the notice that restaurants should see."></textarea>
        </label>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Publish At</span>
            <input id="notif-publish" type="datetime-local" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
          </label>
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Due At</span>
            <input id="notif-due" type="datetime-local" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
          </label>
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Expires At</span>
            <input id="notif-expires" type="datetime-local" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white">
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Action Label</span>
            <input id="notif-action-label" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white" placeholder="Open">
          </label>
          <label class="block">
            <span class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Action URL</span>
            <input id="notif-action-url" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white" placeholder="page:analytics or https://...">
          </label>
        </div>

        <button onclick="submitNotification()" class="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black uppercase tracking-widest shadow-lg shadow-teal-600/20 transition-all">
          Publish Notification
        </button>
      </div>
    `, "max-w-3xl");
    updateNotificationTargetUsers();
  } catch (error) {
    toast(error.message || "Could not open notification composer", "error");
  }
}

function updateNotificationTargetUsers() {
  const select = document.getElementById("notif-user");
  const shopValue = document.getElementById("notif-shop")?.value || "";
  if (!select) return;

  const users = _notificationUsers.filter((user) => !shopValue || Number(user.shop_id) === Number(shopValue));
  select.innerHTML = `
    <option value="">Whole selected audience</option>
    ${users.map((user) => `<option value="${Number(user.id)}">${escapeOrderValue(user.name || user.username)} (${escapeOrderValue(user.shop_name || `Shop #${user.shop_id}`)})</option>`).join("")}
  `;
}

async function submitNotification() {
  const title = document.getElementById("notif-title")?.value.trim();
  const message = document.getElementById("notif-message")?.value.trim();
  if (!title || !message) return toast("Title and message are required.", "error");

  const shopId = document.getElementById("notif-shop")?.value || "";
  const targetUserId = document.getElementById("notif-user")?.value || "";
  const payload = {
    type: document.getElementById("notif-type")?.value || "announcement",
    priority: document.getElementById("notif-priority")?.value || "normal",
    title,
    message,
    action_label: document.getElementById("notif-action-label")?.value.trim() || null,
    action_url: document.getElementById("notif-action-url")?.value.trim() || null,
    publish_at: document.getElementById("notif-publish")?.value || null,
    due_at: document.getElementById("notif-due")?.value || null,
    expires_at: document.getElementById("notif-expires")?.value || null,
    status: "active",
  };
  if (shopId) payload.shop_id = Number(shopId);
  if (targetUserId) payload.target_user_id = Number(targetUserId);

  try {
    await api("/api/notifications", "POST", payload);
    toast("Notification published");
    closeModal();
    updateNotificationTopbarBadge();
    renderNotifications();
  } catch (error) {
    toast(error.message || "Failed to publish notification", "error");
  }
}

async function markNotificationRead(id) {
  try {
    await api(`/api/notifications/${id}/read`, "PATCH", { channel: currentNotificationChannel() });
    updateNotificationTopbarBadge();
    renderNotifications(currentNotificationChannel());
  } catch (error) {
    toast(error.message || "Failed to mark notification read", "error");
  }
}

async function markAllNotificationsRead() {
  try {
    const res = await api("/api/notifications/read-all", "PATCH", { channel: currentNotificationChannel() });
    toast(`${Number(res.count || 0)} notifications marked read`);
    updateNotificationTopbarBadge();
    renderNotifications(currentNotificationChannel());
  } catch (error) {
    toast(error.message || "Failed to mark notifications read", "error");
  }
}

async function archiveNotification(id) {
  if (!confirm("Archive this notification? Shops will no longer see it.")) return;
  try {
    await api(`/api/notifications/${id}`, "DELETE");
    toast("Notification archived");
    updateNotificationTopbarBadge();
    renderNotifications();
  } catch (error) {
    toast(error.message || "Failed to archive notification", "error");
  }
}

// ─── TABLE MANAGEMENT ────────────────────────────────────────────────────────
let _allTables = [];
let _currentTableFloorFilter = "";
let _tableAccessConfig = { mode: "all", order_takers: [] };

function canManageTableAction(action) {
  return currentUserHasPermission(`tables.${action}`) ||
    currentUserHasPermission('tables.manage');
}

async function renderTables() {
  let tables = [];
  let floors = [];
  try {
    const canConfigureAccess = canManageTableAction('manage');
    const data = await Promise.all([
      api("/api/tables"),
      api("/api/tables/floors"),
      canConfigureAccess ? api("/api/tables/access-config") : Promise.resolve(null),
    ]);
    tables = data[0] || [];
    floors = data[1] || [];
    if (data[2]) _tableAccessConfig = data[2];
  } catch (e) { }
  _allTables = tables;

  const filteredTables = _currentTableFloorFilter
    ? tables.filter((t) => t.floor_id == _currentTableFloorFilter)
    : tables;

  const isReadOnly =
    !canManageTableAction('manage') &&
    !canManageTableAction('create') &&
    !canManageTableAction('update') &&
    !canManageTableAction('delete');
  const statusColor = {
    available: "bg-emerald-500",
    occupied: "bg-red-500",
    reserved: "bg-amber-500",
  };
  const statusLabel = {
    available: "✅ Available",
    occupied: "🔴 Occupied",
    reserved: "🟡 Reserved",
  };
  const statusBg = {
    available:
      "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    occupied:
      "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
    reserved:
      "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  };

  $c("page-content").innerHTML = `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Header Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-xl">🪑</div>
          <div>
            <h3 class="font-black text-slate-900 dark:text-white text-sm">Floor Plan</h3>
            <p class="text-xs text-slate-500">${filteredTables.filter((t) => t.status === "available").length
    } available, ${filteredTables.filter((t) => t.status === "occupied").length
    } occupied</p>
          </div>
        </div>
        
        <div class="flex flex-wrap items-center gap-3">
          <!-- Floor Filter -->
          <div class="relative min-w-[160px]">
             <select onchange="_currentTableFloorFilter = this.value; renderTables()" class="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-white focus:outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer">
                <option value="">All Floors</option>
                ${floors
      .map(
        (f) =>
          `<option value="${f.id}" ${_currentTableFloorFilter == f.id ? "selected" : ""
          }>${f.name}</option>`
      )
      .join("")}
             </select>
             <div class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
             </div>
          </div>

          ${!isReadOnly
      ? `
          <div class="flex gap-2">
            <button onclick="renderFloors()" class="${canManageTableAction('manage') ? '' : 'hidden'} px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-2">
              🏢 Floors
            </button>
            <button onclick="showTableAccessModal()" class="${canManageTableAction('manage') ? '' : 'hidden'} px-5 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 text-violet-700 dark:text-violet-300 font-bold text-sm transition-all border border-violet-200 dark:border-violet-800">Table Access</button>
            ${canManageTableAction('create') ? `<button onclick="showAddTableModal()" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              Add Table
            </button>` : ''}
          </div>
          `
      : ""
    }
        </div>
      </div>

      <!-- Status Legend -->
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-emerald-500"></div><span class="text-xs font-bold text-slate-500">Available</span></div>
        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-red-500"></div><span class="text-xs font-bold text-slate-500">Occupied</span></div>
        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-amber-500"></div><span class="text-xs font-bold text-slate-500">Reserved</span></div>
      </div>

      <!-- Table Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        ${filteredTables.length === 0
      ? `
          <div class="col-span-full flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div class="text-5xl mb-3">🪑</div>
            <p class="text-slate-500 text-sm font-medium">No tables found in this section</p>
            ${canManageTableAction('create') ? '<button onclick="showAddTableModal()" class="mt-4 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-all">Add New Table</button>' : ''}
          </div>
        `
      : filteredTables
        .map(
          (t) => `
          <div class="group relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl ${statusBg[t.status] || "bg-white border-slate-200"
            }"
               onclick="showTableActions(${t.id})">
            <div class="absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${statusColor[t.status] || "bg-slate-400"
            }"></div>
            <div class="text-3xl mb-1">🪑</div>
            <div class="font-black text-slate-900 dark:text-white text-lg">${t.table_number
            }</div>
            <div class="text-xs font-medium text-slate-500 mt-1">Cap: ${t.capacity
            } guests</div>
            ${t.assigned_waiter_id ? `<div class="mt-1 text-[10px] font-bold text-violet-600">${escapeOrderValue(t.assigned_waiter_name || t.assigned_waiter_username || 'Assigned')}</div>` : ''}
            <div class="text-[10px] font-black uppercase tracking-wide mt-1 ${t.status === "available"
              ? "text-emerald-600"
              : t.status === "occupied"
                ? "text-red-600"
                : "text-amber-600"
            }">${t.status}</div>
          </div>
        `
        )
        .join("")
    }
      </div>
    </div>
  `;
}

// ─── FLOOR MANAGEMENT ─────────────────────────────────────────────────────────
function showTableAccessModal() {
  const assignedMode = _tableAccessConfig.mode === 'assigned';
  openModal('Waiter Table Access', `
    <div class="space-y-5">
      <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
        <p class="text-sm font-black text-slate-900 dark:text-white">Who can see dine-in tables?</p>
        <label class="mt-3 flex cursor-pointer items-start gap-3"><input type="radio" name="table-access-mode" value="all" ${!assignedMode ? 'checked' : ''} class="mt-1"><span><b class="text-sm dark:text-white">All tables</b><small class="block text-slate-500">Every waiter / order taker can see every table.</small></span></label>
        <label class="mt-3 flex cursor-pointer items-start gap-3"><input type="radio" name="table-access-mode" value="assigned" ${assignedMode ? 'checked' : ''} class="mt-1"><span><b class="text-sm dark:text-white">Assigned tables only</b><small class="block text-slate-500">Each waiter / order taker sees only assigned tables. Receptionists always see all tables.</small></span></label>
        <button onclick="saveTableAccessMode()" class="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-500">Save visibility</button>
      </div>
      <div><p class="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Table assignments</p><div class="max-h-80 space-y-2 overflow-y-auto">
        ${_allTables.map(table => `<label class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><span class="font-bold text-slate-800 dark:text-white">${escapeOrderValue(table.table_number)}</span><select onchange="assignTableWaiter(${table.id}, this.value)" class="max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="">Unassigned</option>${_tableAccessConfig.order_takers.map(user => `<option value="${user.id}" ${Number(table.assigned_waiter_id) === Number(user.id) ? 'selected' : ''}>${escapeOrderValue(user.name || user.username)} (${escapeOrderValue(user.role)})</option>`).join('')}</select></label>`).join('')}
      </div></div>
    </div>`, 'max-w-xl');
}

async function saveTableAccessMode() {
  const mode = document.querySelector('input[name="table-access-mode"]:checked')?.value || 'all';
  try {
    await api('/api/tables/access-config', 'PATCH', { mode });
    _tableAccessConfig.mode = mode;
    toast(mode === 'assigned' ? 'Waiters will see only their assigned tables' : 'Waiters will see all tables');
  } catch (e) { toast(e.message, 'error'); }
}

async function assignTableWaiter(tableId, value) {
  try {
    await api(`/api/tables/${tableId}/assignment`, 'PATCH', { waiter_id: value ? Number(value) : null });
    const table = _allTables.find(item => Number(item.id) === Number(tableId));
    if (table) table.assigned_waiter_id = value ? Number(value) : null;
    toast(value ? 'Table assigned' : 'Table unassigned');
  } catch (e) { toast(e.message, 'error'); }
}

async function renderFloors() {
  let floors = [];
  try { floors = await api('/api/tables/floors'); } catch (e) { }

  $c('page-content').innerHTML = `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white text-xl">🏢</div>
          <div>
            <h3 class="font-black text-slate-900 dark:text-white text-sm">Floor Management</h3>
            <p class="text-xs text-slate-500">${floors.length} floors configured</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="renderTables()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs transition-all">
            Back to Tables
          </button>
          <button onclick="showAddFloorModal()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2">
            + Add Floor
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${floors.length === 0 ? `
          <div class="col-span-full flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <p class="text-slate-500 text-sm font-medium">No floors configured yet</p>
          </div>
        ` : floors.map(f => `
          <div class="flex items-center justify-between p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
            <div class="flex items-center gap-4">
              <div class="text-2xl">🏢</div>
              <div class="font-black text-slate-900 dark:text-white">${f.name}</div>
            </div>
            <button onclick="deleteFloor(${f.id})" class="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function showAddFloorModal() {
  openModal('Add New Floor', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Floor Name</label>
        <input id="new-floor-name" type="text" placeholder="e.g. Ground Floor, Rooftop" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold" />
      </div>
      <button onclick="addFloor()" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all">Create Floor</button>
    </div>
  `, 'max-w-sm');
}

async function addFloor() {
  const name = $c('new-floor-name').value.trim();
  if (!name) return toast('Floor name is required', 'error');
  try {
    await api('/api/tables/floors', 'POST', { name });
    toast('Floor created!');
    closeModal();
    renderFloors();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteFloor(id) {
  if (!confirm('Are you sure you want to delete this floor? Tables assigned to it will remain but won\'t have a floor.')) return;
  try {
    await api(`/api/tables/floors/${id}`, 'DELETE');
    toast('Floor deleted');
    renderFloors();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showAddTableModal() {
  if (!canManageTableAction('create')) return toast('You do not have permission to add tables.', 'error');
  let floors = [];
  try { floors = await api('/api/tables/floors'); } catch (e) { }

  openModal('Add New Table', `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Floor</label>
        <select id="new-table-floor" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold">
          <option value="">-- No Floor --</option>
          ${floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Table Number / Name</label>
        <input id="new-table-number" type="text" placeholder="e.g. T5, VIP-1, Terrace-2" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold" />
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 mb-1">Capacity (guests)</label>
        <input id="new-table-capacity" type="number" min="1" value="4" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold" />
      </div>
      <button onclick="addTable()" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all">Add Table</button>
    </div>
  `, 'max-w-sm');
}

async function addTable() {
  if (!canManageTableAction('create')) return toast('You do not have permission to add tables.', 'error');
  const table_number = $c('new-table-number').value.trim();
  const capacity = parseInt($c('new-table-capacity').value) || 4;
  const floor_id = parseInt($c('new-table-floor')?.value) || null;
  if (!table_number) return toast('Table number/name is required', 'error');
  try {
    await api('/api/tables', 'POST', { table_number, capacity, floor_id });
    toast('Table added!');
    closeModal();
    renderTables();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function showTableActions(id) {
  const table = _allTables.find(item => Number(item.id) === Number(id));
  if (!table) return toast('Table not found', 'error');
  const status = table.status;
  const canChangeStatus = canManageTableAction('manage');
  const canEdit = canManageTableAction('update');
  const canDelete = canManageTableAction('delete');
  openModal(`Table ${escapeOrderValue(table.table_number)}`, `
    <div class="space-y-3">
      <p class="text-slate-500 text-sm">Current status: <span class="font-bold ${status === 'available' ? 'text-emerald-600' : status === 'occupied' ? 'text-red-600' : 'text-amber-600'}">${status.toUpperCase()}</span></p>
      <div class="grid grid-cols-1 gap-2">
        ${canEdit ? `<button onclick="showEditTableModal(${id})" class="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all">Edit Table</button>` : ''}
        ${canDelete ? `<button onclick="deleteTable(${id})" class="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold transition-all">Delete Table</button>` : ''}
        ${canChangeStatus ? `
        <button onclick="setTableStatus(${id},'available')" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all flex items-center justify-center gap-2">✅ Mark Available</button>
        <button onclick="setTableStatus(${id},'occupied')" class="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all flex items-center justify-center gap-2">🔴 Mark Occupied</button>
        <button onclick="setTableStatus(${id},'reserved')" class="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold transition-all flex items-center justify-center gap-2">🟡 Mark Reserved</button>
        ` : ''}
        <button onclick="closeModal();navigate('pos')" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center justify-center gap-2">🍽️ New Order for this Table</button>
      </div>
    </div>
  `, 'max-w-sm');
}

async function showEditTableModal(id) {
  if (!canManageTableAction('update')) return toast('You do not have permission to edit tables.', 'error');
  const table = _allTables.find(item => Number(item.id) === Number(id));
  if (!table) return toast('Table not found', 'error');
  let floors = [];
  try { floors = await api('/api/tables/floors'); } catch (e) { }
  openModal('Edit Table', `
    <div class="space-y-4">
      <div><label class="block text-xs font-bold text-slate-500 mb-1">Floor</label><select id="edit-table-floor" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"><option value="">-- No Floor --</option>${floors.map(f => `<option value="${f.id}" ${Number(f.id) === Number(table.floor_id) ? 'selected' : ''}>${escapeOrderValue(f.name)}</option>`).join('')}</select></div>
      <div><label class="block text-xs font-bold text-slate-500 mb-1">Table Number / Name</label><input id="edit-table-number" value="${escapeOrderValue(table.table_number)}" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"></div>
      <div><label class="block text-xs font-bold text-slate-500 mb-1">Capacity (guests)</label><input id="edit-table-capacity" type="number" min="1" value="${Number(table.capacity || 4)}" class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"></div>
      <button onclick="saveTableEdit(${id})" class="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold">Save Changes</button>
    </div>`, 'max-w-sm');
}

async function saveTableEdit(id) {
  if (!canManageTableAction('update')) return toast('You do not have permission to edit tables.', 'error');
  const table_number = $c('edit-table-number').value.trim();
  const capacity = Number($c('edit-table-capacity').value);
  const floor_id = Number($c('edit-table-floor').value) || null;
  if (!table_number) return toast('Table number/name is required', 'error');
  if (!Number.isInteger(capacity) || capacity < 1) return toast('Capacity must be at least 1', 'error');
  try {
    await api(`/api/tables/${id}/status`, 'PATCH', { action: 'update', table_number, capacity, floor_id });
    toast('Table updated');
    closeModal();
    renderTables();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTable(id) {
  if (!canManageTableAction('delete')) return toast('You do not have permission to delete tables.', 'error');
  const table = _allTables.find(item => Number(item.id) === Number(id));
  if (!table) return toast('Table not found', 'error');
  if (!confirm(`Delete table ${table.table_number}? This cannot be undone.`)) return;
  try {
    await api(`/api/tables/${id}/status`, 'PATCH', { action: 'delete' });
    toast('Table deleted');
    closeModal();
    renderTables();
  } catch (e) { toast(e.message, 'error'); }
}

async function setTableStatus(id, status) {
  try {
    await api(`/api/tables/${id}/status`, 'PATCH', { status });
    toast(`Table marked as ${status}!`);
    closeModal();
    renderTables();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Quotation System (Client Side) ───────────────────────────────────

async function generateQuotation() {
  if (!cart.length)
    return toast("No items in cart to generate quotation.", "error");

  const discount = parseFloat($c("pos-discount").value) || 0;
  const tax_percentage = parseFloat($c("pos-tax").value) || 0;

  // Get customer info based on order type
  const orderType = window._posOrderType || "dine_in";
  let customer_name = "Valued Customer";
  let customer_phone = "";

  if (orderType === "dine_in") {
    customer_name = $c("pos-customer")?.value.trim() || "Valued Customer";
    customer_phone = $c("pos-phone")?.value.trim() || "";
  } else if (orderType === "delivery") {
    customer_name = $c("pos-cust-name")?.value.trim() || "Valued Customer";
    customer_phone = $c("pos-cust-phone")?.value.trim() || "";
  } else if (orderType === "takeaway") {
    customer_name = "Valued Customer";
  }

  // Fetch shop settings for proper branding
  const shop = await fetchReceiptSettings();

  const quotationData = {
    items: cart.map((c) => ({
      name: c.product ? c.product.name : c.name || "Unknown Item",
      sku: c.product ? c.product.sku : "",
      brand: c.product ? c.product.brand_name : "",
      quantity: c.quantity,
      price: c.selling_price,
      total: c.quantity * c.selling_price,
    })),
    discount,
    tax_percentage,
    customer_name,
    customer_phone,
    shop,
    seller: currentUser.name || currentUser.username,
    date: new Date().toLocaleString(),
    orderType: orderType.toUpperCase(),
  };

  printQuotation(quotationData);
}

function printQuotation(data) {
  const {
    items,
    discount,
    tax_percentage,
    customer_name,
    customer_phone,
    shop,
    seller,
    date,
    orderType,
  } = data;

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmt = (subtotal - discount) * (tax_percentage / 100);
  const grandTotal = subtotal - discount + taxAmt;

  const shopName = shop?.name || "Our Menu";
  const logoPath = shop?.logo_path || "";
  const address = shop?.receipt_address || "";
  const phone = shop?.receipt_phone || "";
  const policies = shop?.receipt_policies || "";

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Estimate - ${customer_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 0; background: #f8fafc; }
        .page { width: 210mm; min-height: 297mm; margin: 10mm auto; background: #f8fafc; padding: 20mm; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); box-sizing: border-box; position: relative; }
        @media print {
            @page { size: A4; margin: 0; }
            body { background: #f8fafc; margin: 0; padding: 0; }
            .page { margin: 0; box-shadow: none; border: none; width: 210mm; height: 297mm; padding: 15mm; }
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
        .shop-info h1 { margin: 0; color: #4338ca; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase; }
        .shop-info p { margin: 2px 0; font-size: 13px; color: #64748b; font-weight: 500; }
        .quote-title-box { text-align: right; }
        .quote-title-box h2 { margin: 0; font-size: 32px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 2px; }
        .quote-title-box p { margin: 5px 0 0; font-size: 14px; font-weight: 600; color: #6366f1; }
        
        .meta-grid { display: flex; justify-content: space-between; margin-bottom: 40px; background: #fcfdfe; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
        .meta-col h3 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin: 0 0 8px; }
        .meta-col p { margin: 0; font-size: 14px; font-weight: 700; color: #334155; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
        td { padding: 15px 10px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #475569; }
        .col-qty { text-align: center; }
        .col-price, .col-total { text-align: right; }
        .row-item-name { font-weight: 700; color: #1e293b; }
        
        .footer-grid { display: flex; justify-content: space-between; margin-top: 20px; }
        .notes-section { width: 60%; }
        .notes-section h4 { font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 10px; text-transform: uppercase; text-decoration: underline; }
        .notes-content { font-size: 12px; color: #64748b; font-style: italic; white-space: pre-wrap; }
        
        .totals-section { width: 35%; }
        .total-item { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; font-weight: 500; color: #475569; }
        .total-grand { border-top: 2px solid #1e293b; margin-top: 10px; padding-top: 10px; font-size: 18px; font-weight: 800; color: #1e293b; }
        
        .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 120px; font-weight: 900; color: rgba(0,0,0,0.03); pointer-events: none; text-transform: uppercase; white-space: nowrap; }
    </style>
</head>
<body>
    <div class="page">
        <div class="watermark">QUOTATION</div>
        <div class="header">
            <div class="shop-info">
                ${logoPath ? `<img src="${logoPath}" style="max-height: 60px; margin-bottom: 10px; display: block;">` : `<h1>${shopName}</h1>`}
                <p>${address}</p>
                <p>Phone: ${phone}</p>
            </div>
            <div class="quote-title-box">
                <h2>ESTIMATE</h2>
                <p>Service Type: ${orderType}</p>
            </div>
        </div>

        <div class="meta-grid">
            <div class="meta-col">
                <h3>Customer</h3>
                <p>${customer_name}</p>
                <p style="font-weight: 500; font-size: 12px;">${customer_phone}</p>
            </div>
            <div class="meta-col">
                <h3>Quote Date</h3>
                <p>${date}</p>
            </div>
            <div class="meta-col">
                <h3>Wait Staff</h3>
                <p>${seller}</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 50%;">Menu Item</th>
                    <th class="col-qty">Quantity</th>
                    <th class="col-price">Unit Price</th>
                    <th class="col-total">Total</th>
                </tr>
            </thead>
            <tbody>
                ${items
      .map(
        (item) => `
                <tr>
                    <td>
                        <span class="row-item-name">${item.name}</span>
                        ${item.sku ? `<div style="font-size: 10px; color: #94a3b8;">Code: ${item.sku}</div>` : ""}
                    </td>
                    <td class="col-qty">${item.quantity}</td>
                    <td class="col-price">Rs. ${item.price.toFixed(0)}</td>
                    <td class="col-total">Rs. ${item.total.toFixed(0)}</td>
                </tr>
                `,
      )
      .join("")}
            </tbody>
        </table>

        <div class="footer-grid">
            <div class="notes-section">
                <h4>Terms & Conditions</h4>
                <div class="notes-content">
1. This is a price estimate only. 
2. Inventory is not reserved. Prices may vary.
3. This is NOT a taxable fiscal receipt. 
${policies ? `\n${policies}` : ""}
                </div>
            </div>
            <div class="totals-section">
                <div class="total-item">
                    <span>Subtotal</span>
                    <span>Rs. ${subtotal.toFixed(0)}</span>
                </div>
                ${discount > 0 ? `<div class="total-item" style="color: #ef4444;"><span>Discount</span><span>-Rs. ${discount.toFixed(0)}</span></div>` : ""}
                ${tax_percentage > 0 ? `<div class="total-item"><span>Tax (${tax_percentage}%)</span><span>Rs. ${taxAmt.toFixed(0)}</span></div>` : ""}
                <div class="total-item total-grand">
                    <span>Estimated Total</span>
                    <span>Rs. ${grandTotal.toFixed(0)}</span>
                </div>
            </div>
        </div>

        <div style="margin-top: 80px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">
           <p style="font-size: 11px; color: #94a3b8; font-weight: 600;">Computer Generated Estimate — Valid for 24 Hours</p>
        </div>
    </div>
    <script>
        window.onload = () => { window.print(); }
    <\/script>
</body>
</html>`);
  win.document.close();
}
function toggleQuickMenu() {
  if (document.body.classList.contains("lobby-active")) return;
  const sidebar = document.getElementById("quick-sidebar");
  const backdrop = document.getElementById("quick-sidebar-backdrop");
  const arrow = document.getElementById("quick-menu-arrow");
  if (!sidebar || !backdrop) return;

  const isOpen = !sidebar.classList.contains("-translate-x-full");

  if (isOpen) {
    sidebar.classList.add("-translate-x-full");
    backdrop.classList.add("opacity-0");
    if (arrow) arrow.classList.add("rotate-180");
    setTimeout(() => backdrop.classList.add("hidden"), 300);
  } else {
    renderQuickSidebar();
    backdrop.classList.remove("hidden");
    if (arrow) arrow.classList.remove("rotate-180");
    requestAnimationFrame(() => {
      sidebar.classList.remove("-translate-x-full");
      backdrop.classList.remove("opacity-0");
    });
  }
}

function renderQuickSidebar() {
  const container = document.getElementById("quick-sidebar-content");
  if (!container) return;

  // Filter panels based on user permissions (reuse logic from lobby)
  const allowed = getAllowedPanelsForCurrentUser();

  const allowedById = Object.fromEntries(allowed.map((panel) => [panel.id, panel]));
  const groupedModules = MODULE_GROUPS
    .map((group) => ({
      ...group,
      panels: group.panels.map((id) => allowedById[id]).filter(Boolean),
    }))
    .filter((group) => group.panels.length > 0);

  container.innerHTML = groupedModules.map(group => `
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <span class="w-1 h-3 bg-indigo-500 rounded-full"></span>
        <h4 class="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">${group.title}</h4>
      </div>
      <div class="grid grid-cols-1 gap-2">
        ${group.panels.map(p => `
          <div onclick="navigate('${p.id}'); toggleQuickMenu()" class="group flex items-center gap-4 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all cursor-pointer">
            <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-indigo-500 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                ${p.icon}
              </svg>
            </div>
            <div>
              <div class="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">${p.label}</div>
              <div class="text-[10px] text-slate-400 font-medium line-clamp-1">${p.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}



// --- Printer & Routing Logic ---
let _allPrinters = [];
let _printerRoutingKitchens = [];
let _printerRouteSettings = {};

async function renderPrinterRouting() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Initial load
  const [printers, users, settings] = await Promise.all([
    api('/api/printers'),
    api('/api/users').catch(() => []),
    fetchReceiptSettings()
  ]);
  _allPrinters = Array.isArray(printers) ? printers : [];
  _printerRoutingKitchens = Array.isArray(users) ? users.filter(u => u.role === 'kitchen') : [];
  _printerRouteSettings = settings || {};
  await fetchCategories();

  const contentHtml = `
    <div class="animate-in fade-in slide-in-from-right-4 duration-500 max-w-6xl mx-auto pb-20">
      <header class="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 class="text-3xl font-black text-slate-950 dark:text-white mb-2 tracking-tight">Printers & Routing</h3>
          <p class="text-slate-500 dark:text-slate-400 text-sm italic">Define physical printers and assign them to kitchens, customer bills, and unpaid bills.</p>
        </div>
        <a href="/api/download-print-agent" download class="inline-flex shrink-0 items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Download Print Agent
        </a>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <!-- Left: Registered Printers -->
        <div class="lg:col-span-12 xl:col-span-5 space-y-6">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest">1. Registered Printers</h4>
            <button onclick="openAddPrinterModal()" class="text-[10px] font-black text-indigo-600 hover:text-indigo-500 uppercase tracking-widest">+ Add Printer</button>
          </div>
          
          <div id="printers-list" class="space-y-3">
            ${renderPrintersListHtml()}
          </div>
        </div>

        <!-- Right: Kitchen and Bill Routing -->
        <div class="lg:col-span-12 xl:col-span-7 space-y-6">
          <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest">2. Kitchen Printer Routing</h4>
          <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black tracking-widest text-slate-400">
                <tr>
                  <th class="px-6 py-4">Kitchen Terminal</th>
                  <th class="px-6 py-4">Assigned Printer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
                ${renderKitchenRoutingRowsHtml()}
              </tbody>
            </table>
          </div>

          <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mt-8">3. Bill Printer Routing</h4>
          <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Customer Bill Printer</label>
              <select id="customer-bill-printer" onchange="saveDefaultPrinters()" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-bold cursor-pointer">
                <option value="">Browser Default / Print Dialog</option>
                ${_allPrinters.map(p => `
                  <option value="${getPrinterRouteValue(p)}" ${printerRouteMatches(settings?.customer_bill_printer, p) ? 'selected' : ''}>${p.display_name} (${p.system_name})</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unpaid Bill Printer</label>
              <select id="unpaid-bill-printer" onchange="saveDefaultPrinters()" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-bold cursor-pointer">
                <option value="">Browser Default / Print Dialog</option>
                ${_allPrinters.map(p => `
                  <option value="${getPrinterRouteValue(p)}" ${printerRouteMatches(settings?.unpaid_bill_printer, p) ? 'selected' : ''}>${p.display_name} (${p.system_name})</option>
                `).join('')}
              </select>
            </div>
          </div>
          <p class="text-[10px] text-slate-400 italic px-4">A printer can be selected for more than one route, for example Kitchen A and Customer Bill.</p>

          <h4 class="text-xs font-black text-slate-400 uppercase tracking-widest mt-8">4. Product Category Routing</h4>
          <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black tracking-widest text-slate-400">
                <tr>
                  <th class="px-6 py-4">Category</th>
                  <th class="px-6 py-4">Kitchen / Printer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
                ${renderCategoryRoutingRowsHtml()}
              </tbody>
            </table>
          </div>
          <p class="text-[10px] text-slate-400 italic px-4">Category routes are used first. Categories without a route use the selected kitchen on checkout.</p>
        </div>
      </div>
    </div>
  `;

  return contentHtml;
}

function renderPrintersListHtml() {
  if (_allPrinters.length === 0) {
    return `
      <div class="p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-800/40 border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
        <p class="text-xs text-slate-400 italic mb-4">No physical printers registered yet.</p>
        <button onclick="openAddPrinterModal()" class="px-6 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 transition-all">Register First Printer</button>
      </div>
    `;
  }

  return _allPrinters.map(p => {
    const kitchenRoutes = _printerRoutingKitchens
      .filter(k => printerRouteMatches(k.printer_station, p))
      .map(k => `Kitchen: ${k.name || k.username}`);
    const billRoutes = [];
    if (printerRouteMatches(_printerRouteSettings?.customer_bill_printer, p)) billRoutes.push("Customer Bill");
    if (printerRouteMatches(_printerRouteSettings?.unpaid_bill_printer, p)) billRoutes.push("Unpaid Bill");
    const badges = [...kitchenRoutes, ...billRoutes].map(label => `
      <span class="inline-flex px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[9px] font-black uppercase tracking-tighter text-indigo-600 dark:text-indigo-300">${label}</span>
    `).join('');

    return `
      <div class="group flex items-start justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 transition-all shadow-sm">
        <div class="flex items-start gap-4 min-w-0">
          <div class="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-indigo-500 shadow-inner shrink-0">
             <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-black text-slate-800 dark:text-slate-100">${p.display_name}</p>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter break-all">System ID: ${p.system_name}</p>
            ${badges ? `<div class="flex flex-wrap gap-1.5 mt-3">${badges}</div>` : `<p class="text-[10px] text-slate-400 italic mt-2">No routes assigned</p>`}
          </div>
        </div>
        <button onclick="deletePrinter(${p.id})" class="p-2.5 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100 shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;
  }).join('');
}

function renderKitchenRoutingRowsHtml() {
  if (_printerRoutingKitchens.length === 0) {
    return `
      <tr>
        <td colspan="2" class="px-6 py-10 text-center text-xs text-slate-400 italic">
          No kitchen terminals found. Create kitchen users first, then assign each one a printer here.
        </td>
      </tr>
    `;
  }

  return _printerRoutingKitchens.map(kitchen => `
    <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full bg-orange-500"></div>
          <div>
            <span class="block font-bold text-slate-700 dark:text-slate-300">${kitchen.name || kitchen.username}</span>
            <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-tighter">${kitchen.username}</span>
          </div>
        </div>
      </td>
      <td class="px-6 py-5">
        <select onchange="updateKitchenPrinterStation(${kitchen.id}, this.value)" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer">
          <option value="">No Printer</option>
          ${_allPrinters.map(p => `
            <option value="${getPrinterRouteValue(p)}" ${printerRouteMatches(kitchen.printer_station, p) ? 'selected' : ''}>${p.display_name} (${p.system_name})</option>
          `).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

function renderCategoryRoutingRowsHtml() {
  if (!_productCategories.length) {
    return `
      <tr>
        <td colspan="2" class="px-6 py-10 text-center text-xs text-slate-400 italic">
          No product categories found.
        </td>
      </tr>
    `;
  }

  return _productCategories.map(cat => `
    <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
      <td class="px-6 py-5">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
          <span class="font-bold text-slate-700 dark:text-slate-300">${cat.name}</span>
        </div>
      </td>
      <td class="px-6 py-5">
        ${renderCategoryRouteCheckboxes(cat)}
      </td>
    </tr>
  `).join('');
}

function getCategoryRouteTargets(category) {
  let targets = [];
  try {
    targets = Array.isArray(category?.route_targets)
      ? category.route_targets
      : JSON.parse(category?.route_targets || '[]');
  } catch (e) {
    targets = [];
  }
  targets = [...new Set((Array.isArray(targets) ? targets : []).map(String).filter(Boolean))];
  if (!targets.length && category?.printer_station) targets.push(String(category.printer_station));
  return targets;
}

function renderCategoryRouteCheckboxes(category) {
  const selected = new Set(getCategoryRouteTargets(category));
  const option = (value, label, tone) => `
    <label class="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 cursor-pointer hover:border-indigo-400 transition-colors">
      <input type="checkbox" data-category-route="${category.id}" value="${value}" ${selected.has(value) ? 'checked' : ''} onchange="updateCategoryRouteTargets(${category.id})" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
      <span class="h-2 w-2 rounded-full ${tone}"></span>
      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${label}</span>
    </label>`;
  const printers = _allPrinters.map(printer => option(`PRINTER:${printer.id}`, `Printer: ${escapeOrderValue(printer.display_name)} (${escapeOrderValue(printer.system_name)})`, 'bg-indigo-500')).join('');
  const kitchens = _printerRoutingKitchens.map(kitchen => option(`KITCHEN:${kitchen.id}`, `Kitchen: ${escapeOrderValue(kitchen.name || kitchen.username)}`, 'bg-orange-500')).join('');
  return `
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-2">
      ${printers || '<span class="text-xs italic text-slate-400">No printers registered</span>'}
      ${kitchens || '<span class="text-xs italic text-slate-400">No kitchen terminals</span>'}
    </div>
    <p class="mt-2 text-[10px] font-bold text-slate-400">Select any combination of printers and kitchen displays.</p>`;
}

function openAddPrinterModal() {
  openModal(
    "Register Physical Printer",
    `
    <div class="space-y-6">
      <div class="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/50">
        <p class="text-[10px] font-black text-amber-800 dark:text-amber-200 uppercase tracking-[0.2em] mb-1">Important Note</p>
        <p class="text-xs text-amber-700/70 dark:text-amber-400/70 italic">The "System Name" must EXACTLY match the printer name installed on your computer (e.g. <code>XP-80</code> or <code>POS-80</code>).</p>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Display Label</label>
          <input id="printer-display-name" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-indigo-500 transition-all outline-none font-bold text-lg" placeholder="e.g. Kitchen Printer" />
        </div>
        <div>
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">System Name (Actual Name)</label>
          <input id="printer-system-name" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-indigo-500 transition-all outline-none font-mono text-sm" placeholder="e.g. EPSON_L3110_Series" />
        </div>
        <button onclick="savePrinter()" class="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">Register Printer</button>
      </div>
    </div>
    `
  );
}

async function savePrinter() {
  const display_name = $c("printer-display-name").value.trim();
  const system_name = $c("printer-system-name").value.trim();

  if (!display_name || !system_name) return toast("Both names are required", "error");

  try {
    const r = await api("/api/printers", "POST", { display_name, system_name });
    if (r.error) return toast(r.error, "error");
    toast("Printer registered!");
    closeModal();
    renderSettings('printer-routing'); // Reload the tab
  } catch (err) {
    toast("Failed to save", "error");
  }
}

async function deletePrinter(id) {
  if (!confirm("Remove this printer registration? Kitchen and bill routes using it will be cleared.")) return;
  try {
    await api(`/api/printers/${id}`, "DELETE");
    toast("Printer removed");
    renderSettings('printer-routing');
  } catch (err) {
    toast("Delete failed", "error");
  }
}

async function updateKitchenPrinterStation(kitchenId, stationName) {
  try {
    const r = await api(`/api/printers/kitchen-routes/${kitchenId}`, "PATCH", { printer_station: stationName || null });
    if (r.error) return toast(r.error, "error");
    toast("Kitchen routing updated!");
    const kitchen = _printerRoutingKitchens.find(k => Number(k.id) === Number(kitchenId));
    if (kitchen) kitchen.printer_station = stationName || null;
    const list = document.getElementById("printers-list");
    if (list) list.innerHTML = renderPrintersListHtml();
  } catch (err) {
    toast("Update failed", "error");
  }
}

async function updateCategoryPrinterStation(catId, stationName) {
  try {
    const r = await api(`/api/product-categories/${catId}`, "PATCH", { printer_station: stationName || null });
    if (r.error) return toast(r.error, "error");
    toast("Routing updated!");
    await fetchCategories(); // Refresh local state
  } catch (err) {
    toast("Update failed", "error");
  }
}

async function updateCategoryRouteTargets(catId) {
  const inputs = [...document.querySelectorAll(`input[data-category-route="${catId}"]`)];
  const routeTargets = inputs.filter(input => input.checked).map(input => input.value);
  inputs.forEach(input => { input.disabled = true; });
  try {
    const r = await api(`/api/product-categories/${catId}`, "PATCH", { route_targets: routeTargets });
    if (r.error) throw new Error(r.error);
    const category = _productCategories.find(item => Number(item.id) === Number(catId));
    if (category) {
      category.route_targets = routeTargets;
      category.printer_station = routeTargets[0] || null;
    }
    toast("Category routing updated!");
  } catch (err) {
    toast(err.message || "Update failed", "error");
    await fetchCategories();
    const category = _productCategories.find(item => Number(item.id) === Number(catId));
    const cell = inputs[0]?.closest('td');
    if (cell && category) cell.innerHTML = renderCategoryRouteCheckboxes(category);
  } finally {
    inputs.forEach(input => { input.disabled = false; });
  }
}

async function saveDefaultPrinters() {
  try {
    const customer = document.getElementById('customer-bill-printer').value;
    const unpaid = document.getElementById('unpaid-bill-printer').value;
    
    const formData = new FormData();
    formData.append("customer_bill_printer", customer);
    formData.append("unpaid_bill_printer", unpaid);
    
    const res = await fetch("/api/shop-settings", {
      method: "POST",
      body: formData,
    });
    
    const data = await res.json();
    if (data.error) return toast(data.error, "error");
    
    toast("Bill printers saved!");
    _printerRouteSettings = await fetchReceiptSettings() || {};
    const list = document.getElementById("printers-list");
    if (list) list.innerHTML = renderPrintersListHtml();
  } catch(e) {
    toast("Failed to save default printers", "error");
  }
}

/**
 * ─── Shift Page & Actions ───────────────────────────────────────────
 */
function formatRegisterMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function renderRegisterMetric(label, value, tone = "slate", isNegative = false) {
  const tones = {
    slate: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white",
    emerald: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    blue: "bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300",
    rose: "bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-300",
    amber: "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-300",
    indigo: "bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300"
  };
  return `
    <div class="min-h-[112px] p-5 rounded-2xl border ${tones[tone] || tones.slate}">
      <div class="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">${label}</div>
      <div class="mt-3 text-2xl font-black tracking-tight">${isNegative ? "- " : ""}${formatRegisterMoney(value)}</div>
    </div>
  `;
}

function isCurrentUserShiftAdmin() {
  return currentUserHasPermission('register.verify_cash');
}

let pendingCashDropsLoadError = "";
let pendingCashHandoversLoadError = "";
let pendingCashHandoversAccessDenied = false;

async function fetchPendingCashDropsForAdmin() {
  if (!isCurrentUserShiftAdmin()) return [];
  pendingCashDropsLoadError = "";
  try {
    const drops = await api("/api/shifts/cash-drops/pending");
    return Array.isArray(drops) ? drops : [];
  } catch (err) {
    console.warn("Failed to load pending cash drops:", err);
    pendingCashDropsLoadError = err.message || "Failed to load pending cash drops.";
    return [];
  }
}

async function fetchPendingCashHandoversForRegister() {
  pendingCashHandoversLoadError = "";
  pendingCashHandoversAccessDenied = false;
  try {
    const handovers = await api("/api/shifts/pending-handovers");
    return Array.isArray(handovers) ? handovers : [];
  } catch (err) {
    const message = err.message || "Failed to load pending cash handovers.";
    pendingCashHandoversAccessDenied = /permission|forbidden|unauthori[sz]ed/i.test(message);
    if (!pendingCashHandoversAccessDenied) {
      console.warn("Failed to load pending cash handovers:", err);
      pendingCashHandoversLoadError = message;
    }
    return [];
  }
}

async function fetchRegisterHandoverRecipients() {
  try {
    const recipients = await api("/api/users/assignable");
    return Array.isArray(recipients)
      ? recipients.filter((user) => Number(user.id) !== Number(currentUser?.id))
      : [];
  } catch (err) {
    console.warn("Failed to load handover recipients:", err);
    return [];
  }
}

function renderPendingCashDropsSection(drops = []) {
  if (!isCurrentUserShiftAdmin()) return "";

  const rows = pendingCashDropsLoadError ? `
    <div class="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-sm font-bold text-rose-600 dark:text-rose-300">
      ${escapeOrderValue(pendingCashDropsLoadError)}
    </div>
  ` : drops.length ? drops.map((drop) => {
    const cashier = drop.cashier_username || drop.cashier_name || `User #${drop.requested_by_user_id}`;
    const shopLabel = drop.shop_name ? ` | ${drop.shop_name}` : "";
    const createdAt = drop.created_at ? new Date(drop.created_at).toLocaleString() : "Just now";
    return `
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(180px,0.9fr)_minmax(140px,0.45fr)_minmax(220px,1fr)_auto] gap-4 items-center p-4 rounded-2xl bg-white dark:bg-slate-950 border border-amber-100 dark:border-amber-900/40">
        <div>
	          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Requested By</div>
	          <div class="text-sm font-black text-slate-900 dark:text-white mt-1">${escapeOrderValue(cashier)}</div>
	          <div class="text-[11px] font-bold text-slate-400 mt-0.5">Demanded: ${escapeOrderValue(`${createdAt}${shopLabel}`)}</div>
        </div>
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Amount</div>
          <div class="text-lg font-black text-amber-600 dark:text-amber-300 mt-1">${formatRegisterMoney(drop.amount)}</div>
        </div>
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Note</div>
          <div class="text-sm font-bold text-slate-600 dark:text-slate-300 mt-1">${escapeOrderValue(drop.note || "No note")}</div>
        </div>
        <div class="flex items-center gap-2 justify-end">
          <button onclick="verifyCashDrop(${Number(drop.id)}, 'rejected')" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">Reject</button>
          <button onclick="verifyCashDrop(${Number(drop.id)}, 'verified')" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all">Verify</button>
        </div>
      </div>
    `;
  }).join("") : `
    <div class="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-500 dark:text-slate-400">
      No cash drops are waiting for admin verification.
    </div>
  `;

  return `
    <section class="p-6 rounded-3xl bg-amber-50/70 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/40 mb-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h4 class="text-xl font-black text-slate-900 dark:text-white tracking-tight">Cash Drop Verification</h4>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">Admin approval is required before a drop reduces the cashier drawer total.</p>
        </div>
        <span class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-amber-100 dark:border-amber-900/40 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">
          ${pendingCashDropsLoadError ? "Needs Attention" : `${drops.length} Pending`}
        </span>
      </div>
      <div class="space-y-3">
        ${rows}
      </div>
    </section>
  `;
}

function renderPendingCashHandoversSection(handovers = []) {
  if (pendingCashHandoversAccessDenied) return "";
  const shouldShow = pendingCashHandoversLoadError || handovers.length > 0;
  if (!shouldShow) return "";

  const rows = pendingCashHandoversLoadError ? `
    <div class="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-sm font-bold text-rose-600 dark:text-rose-300">
      ${escapeOrderValue(pendingCashHandoversLoadError)}
    </div>
  ` : handovers.map((handover) => {
    const sender = handover.sender_name || handover.sender_username || `User #${handover.sender_id}`;
    const receiver = handover.receiver_name || handover.receiver_username || `User #${handover.receiver_id}`;
    const shopLabel = handover.shop_name ? ` | ${handover.shop_name}` : "";
    const createdAt = handover.created_at ? new Date(handover.created_at).toLocaleString() : "Just now";
    return `
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(140px,0.45fr)_minmax(220px,1fr)_auto] gap-4 items-center p-4 rounded-2xl bg-white dark:bg-slate-950 border border-blue-100 dark:border-blue-900/40">
        <div>
	          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">From</div>
	          <div class="text-sm font-black text-slate-900 dark:text-white mt-1">${escapeOrderValue(sender)}</div>
	          <div class="text-[11px] font-bold text-slate-400 mt-0.5">Demanded: ${escapeOrderValue(`${createdAt}${shopLabel}`)}</div>
        </div>
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">To</div>
          <div class="text-sm font-black text-slate-900 dark:text-white mt-1">${escapeOrderValue(receiver)}</div>
        </div>
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Amount</div>
          <div class="text-lg font-black text-blue-600 dark:text-blue-300 mt-1">${formatRegisterMoney(handover.amount)}</div>
        </div>
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Note</div>
          <div class="text-sm font-bold text-slate-600 dark:text-slate-300 mt-1">${escapeOrderValue(handover.note || "No note")}</div>
        </div>
        <div class="flex items-center gap-2 justify-end">
          <button onclick="verifyCashHandover(${Number(handover.id)}, 'rejected')" class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">Reject</button>
          <button onclick="verifyCashHandover(${Number(handover.id)}, 'verified')" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all">Verify</button>
        </div>
      </div>
    `;
  }).join("");

  return `
    <section class="p-6 rounded-3xl bg-blue-50/70 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 mb-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h4 class="text-xl font-black text-slate-900 dark:text-white tracking-tight">Cash Handover Verification</h4>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">The receiver or an admin verifies before the sender drawer total is reduced.</p>
        </div>
        <span class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-blue-100 dark:border-blue-900/40 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-300">
          ${pendingCashHandoversLoadError ? "Needs Attention" : `${handovers.length} Pending`}
        </span>
      </div>
      <div class="space-y-3">
        ${rows}
      </div>
    </section>
  `;
}

function renderHandoverRecipientOptions(recipients = []) {
  if (!recipients.length) return `<option value="">No active staff found</option>`;
  return `<option value="">Select receiver</option>${recipients.map((user) => {
    const role = user.role ? ` (${user.role})` : "";
    return `<option value="${Number(user.id)}">${escapeOrderValue(`${user.name || user.username || "User"}${role}`)}</option>`;
  }).join("")}`;
}

async function hydrateRegisterOptionalSections() {
  const [pendingCashHandovers, handoverRecipients] = await Promise.all([
    fetchPendingCashHandoversForRegister(),
    fetchRegisterHandoverRecipients()
  ]);
  if (_currentPage !== 'register') return;

  const handoverMarkup = renderPendingCashHandoversSection(pendingCashHandovers);
  const activeHandovers = document.getElementById('register-cash-handovers');
  if (activeHandovers) activeHandovers.innerHTML = handoverMarkup;
  const closedHandovers = document.getElementById('register-closed-cash-flow');
  if (closedHandovers) closedHandovers.innerHTML = handoverMarkup;

  const recipientSelect = document.getElementById('cash-handover-recipient');
  if (recipientSelect) recipientSelect.innerHTML = renderHandoverRecipientOptions(handoverRecipients);
}

async function renderRegister() {
  const content = document.getElementById("page-content");
  if (!content) return;

  content.innerHTML = `
    <div class="min-h-[60vh] flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold">
      Loading register...
    </div>
  `;

  await fetchActiveShift();

  if (!canCurrentUserAccessRegister()) {
    content.innerHTML = `
      <div class="max-w-4xl mx-auto py-20">
        <div class="p-10 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-6">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <h3 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Register Access Required</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-2">Your account cannot open or manage a cash drawer.</p>
        </div>
      </div>
    `;
    return;
  }

  const pendingCashHandovers = [];
  const handoverRecipients = [];

  if (!currentShift) {
    content.innerHTML = `
      <div class="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
              <span class="w-2 h-2 rounded-full bg-rose-500"></span>
              Register Closed
            </div>
            <h3 class="text-4xl font-black text-slate-950 dark:text-white tracking-tight">Open Cash Register</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">Start your personal drawer before collecting cash, card payments, customer dues, or cash refunds.</p>
          </div>
          <button onclick="navigate('pos')" class="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
            Back to POS
          </button>
        </div>

        <div class="flex w-full sm:w-auto sm:inline-flex items-center gap-1.5 p-1.5 mb-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto" role="tablist" aria-label="Register sections">
          <button id="register-tab-cash-flow" type="button" role="tab" onclick="switchRegisterPanel('cash_flow')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">Cash Flow</button>
          <button id="register-tab-payments" type="button" role="tab" onclick="switchRegisterPanel('payments')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">Payments</button>
          <button id="register-tab-opening-closing" type="button" role="tab" onclick="switchRegisterPanel('opening_closing')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">Opening / Closing</button>
        </div>

        <div id="register-closed-cash-flow" class="hidden">${renderPendingCashHandoversSection(pendingCashHandovers)}</div>
        <section id="register-payments-panel" class="hidden"></section>

        <div id="register-closed-opening-closing" class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-6">
          <section class="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="flex items-center gap-4 mb-8">
              <div class="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>
              </div>
              <div>
                <h4 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Opening Float</h4>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cash counted in drawer</p>
              </div>
            </div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Opening Cash</label>
            <div class="relative mb-6">
              <span class="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">Rs.</span>
              <input id="opening-balance-input" type="number" step="0.01" class="w-full pl-20 pr-6 py-7 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-950 dark:text-white focus:border-indigo-500 transition-all outline-none font-black text-4xl tracking-tight" placeholder="0.00" autofocus />
            </div>
            <button onclick="performOpenShift()" class="w-full py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-[0.99] transition-all flex items-center justify-center gap-3">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              Start Shift
            </button>
          </section>

          <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3">Personal Drawer</div>
              <p class="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">Cash collected by this user is attached to this shift only.</p>
            </div>
            <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3">Closing Count</div>
              <p class="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">Expected cash is shown in Register so the drawer can be checked before close.</p>
            </div>
            <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 sm:col-span-2 xl:col-span-1">
              <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3">Drawer Formula</div>
              <p class="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">Opening + cash sales + due collections - cash refunds - verified cash drops - verified handovers.</p>
            </div>
          </section>
        </div>
      </div>
    `;
    window._registerActivePanel = 'opening_closing';
    switchRegisterPanel('opening_closing');
    hydrateRegisterOptionalSections();
    setTimeout(() => document.getElementById("opening-balance-input")?.focus(), 50);
    return;
  }

  let summary;
  try {
    summary = await api(`/api/shifts/summary/${currentShift.id}`);
  } catch (err) {
    content.innerHTML = `<div class="p-8 rounded-3xl bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-300 font-bold border border-rose-100 dark:border-rose-900/40">Failed to load register: ${err.message}</div>`;
    return;
  }

  const startedAt = new Date(currentShift.start_time);
  content.innerHTML = `
    <div class="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Register Open
          </div>
          <h3 class="text-4xl font-black text-slate-950 dark:text-white tracking-tight">Active Register Session</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">Started ${startedAt.toLocaleDateString()} at ${startedAt.toLocaleTimeString()}</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button onclick="renderRegister()" class="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">Refresh</button>
          <button onclick="navigate('pos')" class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all">Go to POS</button>
        </div>
      </div>

      <div class="flex w-full sm:w-auto sm:inline-flex items-center gap-1.5 p-1.5 mb-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto" role="tablist" aria-label="Register sections">
        <button id="register-tab-cash-flow" type="button" role="tab" onclick="switchRegisterPanel('cash_flow')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">
          Cash Flow
        </button>
        <button id="register-tab-payments" type="button" role="tab" onclick="switchRegisterPanel('payments')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">
          Payments
        </button>
        <button id="register-tab-cash-movement" type="button" role="tab" onclick="switchRegisterPanel('cash_movement')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">
          Cash Movement Request
        </button>
        <button id="register-tab-opening-closing" type="button" role="tab" onclick="switchRegisterPanel('opening_closing')" class="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all">
          Opening / Closing
        </button>
      </div>

      <section id="register-cash-summary" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        ${renderRegisterMetric("Expected Cash", summary.expected_balance, "emerald")}
        ${renderRegisterMetric("Opening Cash", summary.opening_balance, "indigo")}
        ${renderRegisterMetric("Cash Sales", summary.net_cash_sales, "emerald")}
        ${renderRegisterMetric("Due Collections", summary.debt_collections, "blue")}
        ${renderRegisterMetric("Card Sales", summary.net_card_sales, "slate")}
        ${renderRegisterMetric("Online Sales", summary.net_online_sales, "blue")}
        ${renderRegisterMetric("Cash Refunds", summary.total_cash_refunds, "rose", true)}
        ${renderRegisterMetric("Cash Drops", summary.cash_drops, "amber", true)}
        ${Number(summary.pending_cash_drops || 0) > 0 ? renderRegisterMetric("Pending Drops", summary.pending_cash_drops, "amber", true) : ""}
        ${renderRegisterMetric("Verified Handovers", summary.cash_handovers, "amber", true)}
        ${Number(summary.pending_cash_handovers || 0) > 0 ? renderRegisterMetric("Pending Handovers", summary.pending_cash_handovers, "blue", true) : ""}
      </section>

      <div id="register-cash-handovers">${renderPendingCashHandoversSection(pendingCashHandovers)}</div>
      <section id="register-payments-panel" class="hidden"></section>

      <div class="grid grid-cols-1 gap-6">
        <section id="register-cash-movement-panel" class="hidden p-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between gap-4 mb-6">
            <div>
              <h4 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Cash Movement</h4>
              <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Drop to safe, shop expense, or handover</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-300 flex items-center justify-center">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Movement Type</label>
              <select id="cash-movement-type" onchange="updateCashMovementTypeUI()" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-blue-500 transition-all outline-none font-black text-sm">
                <option value="cash_drop">Cash drop to safe/admin</option>
                <option value="shop_expense">Restaurant expense from drawer</option>
                <option value="handover">Handover to person</option>
              </select>
            </div>
            <div id="cash-handover-recipient-wrap" class="hidden">
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Receiver</label>
              <select id="cash-handover-recipient" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-blue-500 transition-all outline-none font-black text-sm">
                ${renderHandoverRecipientOptions(handoverRecipients)}
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Amount</label>
              <input id="cash-movement-amount" type="number" step="0.01" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-blue-500 transition-all outline-none font-black text-xl" placeholder="0.00" />
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Note</label>
              <textarea id="cash-movement-note" class="w-full min-h-[116px] px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-blue-500 transition-all outline-none font-medium text-sm resize-none" placeholder="Moved to safe, handed to manager, or drawer cleanup note."></textarea>
            </div>
            <button id="cash-movement-submit" onclick="performCashMovement()" class="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all">Request Cash Drop</button>
          </div>
        </section>

        <section id="register-opening-closing-panel" class="hidden p-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div class="flex items-center justify-between gap-4 mb-6">
            <div>
              <h4 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Close Register</h4>
              <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cash reconciliation</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-300 flex items-center justify-center">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] gap-5">
            <div class="space-y-4">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Actual Cash Count</label>
                <div class="relative">
                  <span class="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">Rs.</span>
                  <input id="closing-balance-input" type="number" step="0.01" class="w-full pl-20 pr-6 py-6 rounded-3xl bg-slate-950 border border-slate-800 text-white focus:border-rose-500 transition-all outline-none font-black text-4xl tracking-tight" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Closing Note (Public to Admins)</label>
                <textarea id="closing-note-input" class="w-full min-h-[100px] px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-rose-500 transition-all outline-none font-medium text-sm resize-none" placeholder="General context..."></textarea>
              </div>
              <div id="shortage-reason-wrap">
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Shortage/Overage Reason (Explain Discrepancies)</label>
                <textarea id="shortage-reason-input" class="w-full min-h-[100px] px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-rose-500 transition-all outline-none font-medium text-sm resize-none" placeholder="Why is there a difference? e.g. Forgotten cash drop, wrong return, etc."></textarea>
              </div>
            </div>
            <div class="rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-5">
              <div class="space-y-4">
                <div>
                  <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Expected Cash</div>
                  <div class="text-2xl font-black text-slate-900 dark:text-white mt-2">${formatRegisterMoney(summary.expected_balance)}</div>
                </div>
                <div class="h-px bg-slate-200 dark:bg-slate-800"></div>
                <div class="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">Use the physical cash in drawer. Card sales are shown for reporting, but they do not increase cash drawer balance.</div>
              </div>
              <button onclick="performCloseShift()" class="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all">Close Register</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
  switchRegisterPanel(window._registerActivePanel || 'cash_flow');
  hydrateRegisterOptionalSections();
}

function switchRegisterPanel(panel) {
  const availablePanels = ['cash_flow', 'payments', 'cash_movement', 'opening_closing'];
  const activePanel = availablePanels.includes(panel) ? panel : 'cash_flow';
  window._registerActivePanel = activePanel;
  const showingCashFlow = activePanel === 'cash_flow';
  const showingPayments = activePanel === 'payments';
  const showingCashMovement = activePanel === 'cash_movement';
  const showingOpeningClosing = activePanel === 'opening_closing';

  ['register-cash-summary', 'register-cash-handovers'].forEach((id) => {
    document.getElementById(id)?.classList.toggle('hidden', !showingCashFlow);
  });
  document.getElementById('register-cash-movement-panel')?.classList.toggle('hidden', !showingCashMovement);
  document.getElementById('register-payments-panel')?.classList.toggle('hidden', !showingPayments);
  document.getElementById('register-opening-closing-panel')?.classList.toggle('hidden', !showingOpeningClosing);
  document.getElementById('register-closed-cash-flow')?.classList.toggle('hidden', !showingCashFlow);
  document.getElementById('register-closed-opening-closing')?.classList.toggle('hidden', !showingOpeningClosing);
  if (showingPayments && typeof renderRegisterPaymentsPanel === 'function') renderRegisterPaymentsPanel({ refreshShifts: true });

  const activeClasses = ['bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/20'];
  const inactiveClasses = ['text-slate-500', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800'];
  [
    ['register-tab-cash-flow', showingCashFlow],
    ['register-tab-payments', showingPayments],
    ['register-tab-cash-movement', showingCashMovement],
    ['register-tab-opening-closing', showingOpeningClosing]
  ].forEach(([id, isActive]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.classList.remove(...activeClasses, ...inactiveClasses);
    button.classList.add(...(isActive ? activeClasses : inactiveClasses));
    button.setAttribute('aria-selected', String(isActive));
  });
}

function openRegisterModal() {
  if (!canCurrentUserManageRegister()) return toast("You do not have permission to manage the register.", "error");
  navigate("register");
}

async function performOpenShift() {
  const val = parseFloat(document.getElementById("opening-balance-input").value);
  if (isNaN(val) || val < 0) return toast("Please enter a valid opening balance.", "error");

  showAppLoader('Starting shift', 'Opening your cash register...');
  try {
    const res = await api("/api/shifts/open", "POST", { opening_balance: val });
    if (res.ok) {
      toast("Success! Register is now open.");
      closeModal();
      window._registerActivePanel = 'cash_flow';
      await fetchActiveShift();
      if (_currentPage === "register") {
        await renderRegister();
      } else {
        navigate("register");
      }
    }
  } catch (err) {
    toast(err.message, "error");
  } finally {
    hideAppLoader();
  }
}

async function openShiftSummaryModal() {
  if (!currentShift) return;
  
  openModal(
    "Active Register Session",
    `
    <div class="flex items-center justify-center h-40 text-slate-400 italic">Calculating drawer totals...</div>
    `
  );

  try {
    const summary = await api(`/api/shifts/summary/${currentShift.id}`);
    const pendingVerificationTotal = Number(summary.pending_cash_drops || 0) + Number(summary.pending_cash_handovers || 0);
    const hasPendingVerifications = pendingVerificationTotal > 0.01;
    const provisionalExpected = Number(summary.expected_balance || 0) - pendingVerificationTotal;
    
    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-6">
        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Started At</p>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-300">${new Date(currentShift.start_time).toLocaleTimeString()}</p>
          </div>
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Opening Cash</p>
            <p class="text-sm font-bold text-indigo-600 dark:text-indigo-400">Rs. ${summary.opening_balance.toFixed(2)}</p>
          </div>
          <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <p class="text-[9px] font-black text-emerald-600 dark:text-emerald-300 uppercase tracking-widest mb-1">Expected Cash</p>
            <p class="text-sm font-bold text-emerald-700 dark:text-emerald-300">Rs. ${Number(summary.expected_balance || 0).toFixed(2)}</p>
          </div>
          ${hasPendingVerifications ? `
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
            <p class="text-[9px] font-black text-amber-600 dark:text-amber-300 uppercase tracking-widest mb-1">Provisional Close Expected</p>
            <p class="text-sm font-bold text-amber-700 dark:text-amber-300">Rs. ${provisionalExpected.toFixed(2)}</p>
          </div>
          ` : ''}
        </div>

        ${hasPendingVerifications ? `
        <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
          <div class="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">Pending Verification</div>
          <p class="mt-2 text-xs font-bold text-amber-700 dark:text-amber-200 leading-relaxed">
            You can close this register now. Pending cash movement of Rs. ${pendingVerificationTotal.toFixed(2)} will keep this shift red until admin verifies or rejects it.
          </p>
        </div>
        ` : ''}

        <div class="space-y-3">
            <div class="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                <span>Net Cash Sales</span>
                <span>Rs. ${summary.net_cash_sales.toFixed(2)}</span>
            </div>
            ${summary.cash_drops > 0 ? `
            <div class="flex items-center justify-between p-4 rounded-xl bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 font-bold text-sm">
                <span>Cash Drops (Manager)</span>
                <span>- Rs. ${summary.cash_drops.toFixed(2)}</span>
            </div>
            ` : ''}
        </div>

        <div class="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 text-center">Closing Cash Reconciliation</label>
            <div class="relative">
              <span class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rs.</span>
              <input id="closing-balance-input" type="number" step="0.01" class="w-full pl-14 pr-5 py-5 rounded-2xl bg-slate-900 dark:bg-black border border-slate-800 text-white focus:border-rose-500 transition-all outline-none font-black text-2xl" placeholder="Count your cash..." />
            </div>
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Closing Note</label>
            <textarea id="closing-note-input" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-indigo-500 transition-all outline-none font-medium text-sm" placeholder="Explain shortage, overage, handover, or end-of-shift context..."></textarea>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
             <button onclick="closeModal(); window._registerActivePanel='cash_movement'; navigate('register')" class="py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-black text-xs uppercase tracking-widest hover:border-indigo-500 dark:hover:border-indigo-400 transition-all">Cash Movement</button>
             <button onclick="performCloseShift()" class="py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-600/20 transition-all">Close Register</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById("modal-body").innerHTML = `<div class="p-6 text-rose-500 font-bold">Error: ${err.message}</div>`;
  }
}

function openCashDropModal() {
  openModal(
    "Record Cash Drop",
    `
    <div class="space-y-4">
      <div class="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/50">
        <p class="text-[10px] text-amber-700 dark:text-amber-300 font-bold leading-relaxed italic">
          Use this to request cash removed from the drawer and put into the safe. It reduces the drawer total only after admin verification.
        </p>
      </div>
      <div>
        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Amount to Drop</label>
        <input id="drop-amount" type="number" step="0.01" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-indigo-500 transition-all outline-none font-bold text-xl" placeholder="0.00" />
      </div>
      <div>
        <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Note (Optional)</label>
        <textarea id="drop-note" class="w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:border-indigo-500 transition-all outline-none font-medium text-sm" placeholder="e.g. Moved to main safe"></textarea>
      </div>
      <button onclick="performCashDrop()" class="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm uppercase tracking-widest shadow-xl transition-all">Confirm Drop</button>
    </div>
    `
  );
}

async function performCashDrop() {
  const amount = parseFloat(document.getElementById("drop-amount").value);
  const note = document.getElementById("drop-note").value;
  if (isNaN(amount) || amount <= 0) return toast("Valid amount required.", "error");

  try {
    const res = await api("/api/shifts/cash-drop", "POST", { shift_id: currentShift.id, amount, note });
    if (res.ok) {
      toast("Cash drop sent for admin verification.");
      if (_currentPage === "register") {
        await renderRegister();
      } else {
        openShiftSummaryModal(); // Refresh summary
      }
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

function updateCashMovementTypeUI() {
  const type = document.getElementById("cash-movement-type")?.value || "cash_drop";
  const recipientWrap = document.getElementById("cash-handover-recipient-wrap");
  const submitButton = document.getElementById("cash-movement-submit");
  const noteInput = document.getElementById("cash-movement-note");

  if (recipientWrap) recipientWrap.classList.toggle("hidden", type !== "handover");
  if (submitButton) {
    submitButton.textContent = type === "handover"
      ? "Request Handover"
      : type === "shop_expense"
        ? "Request Restaurant Expense"
        : "Request Cash Drop";
  }
  if (noteInput) {
    noteInput.placeholder = type === "shop_expense"
      ? "Restaurant expense details, invoice, or reason."
      : "Moved to safe, handed to manager, or drawer cleanup note.";
  }
}

async function performCashMovement() {
  if (!currentShift) return toast("Open register first.", "error");

  const type = document.getElementById("cash-movement-type")?.value || "cash_drop";
  const amount = parseFloat(document.getElementById("cash-movement-amount")?.value);
  const note = document.getElementById("cash-movement-note")?.value || "";
  if (isNaN(amount) || amount <= 0) return toast("Valid amount required.", "error");

  try {
    if (type === "handover") {
      const receiverId = document.getElementById("cash-handover-recipient")?.value;
      if (!receiverId) return toast("Select the person receiving the cash.", "error");
      const res = await api("/api/shifts/handover", "POST", {
        shift_id: currentShift.id,
        receiver_id: receiverId,
        amount,
        note
      });
      if (res.ok) toast("Cash handover sent for verification.");
    } else {
      const movementNote = type === "shop_expense"
        ? `Restaurant Expense${note ? `: ${note}` : ""}`
        : note;
      const res = await api("/api/shifts/cash-drop", "POST", {
        shift_id: currentShift.id,
        amount,
        note: movementNote
      });
      if (res.ok) toast(type === "shop_expense" ? "Restaurant expense sent for admin verification." : "Cash drop sent for admin verification.");
    }

    if (_currentPage === "register") {
      await renderRegister();
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

async function verifyCashDrop(cashDropId, status) {
  if (!isCurrentUserShiftAdmin()) return toast("You do not have permission to verify cash drops.", "error");
  const label = status === "verified" ? "verify" : "reject";
  if (!confirm(`Are you sure you want to ${label} this cash drop?`)) return;

  try {
    await api(`/api/shifts/cash-drops/${cashDropId}/verify`, "POST", { status });
    toast(status === "verified" ? "Cash drop verified." : "Cash drop rejected.");
    await fetchActiveShift();
    if (_currentPage === "register") await renderRegister();
    if (_currentPage === "logs") await applyLogFilters();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function verifyCashHandover(handoverId, status) {
  const label = status === "verified" ? "verify" : "reject";
  if (!confirm(`Are you sure you want to ${label} this cash handover?`)) return;

  try {
    await api("/api/shifts/verify-handover", "POST", { handover_id: handoverId, status });
    toast(status === "verified" ? "Cash handover verified." : "Cash handover rejected.");
    await fetchActiveShift();
    if (_currentPage === "register") await renderRegister();
    if (_currentPage === "logs") await applyLogFilters();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function performCloseShift() {
  const actual = parseFloat(document.getElementById("closing-balance-input").value);
  const note = document.getElementById("closing-note-input")?.value.trim() || "Closed by user.";
  const shortage_reason = document.getElementById("shortage-reason-input")?.value.trim() || null;
  if (isNaN(actual)) return toast("Please count your cash and enter the total.", "error");

  if (!confirm("Are you sure you want to close this register? This action is permanent.")) return;

  showAppLoader('Closing register', 'Reconciling cash and generating the shift report...');
  try {
    const closingShiftId = currentShift.id;
    const res = await api("/api/shifts/close", "POST", {
      shift_id: closingShiftId,
      actual_balance: actual,
      note,
      shortage_reason
    });
    if (res.ok) {
      const diff = actual - res.summary.expected_balance;
      const diffMsg = diff === 0 ? "Perfect reconciliation." : (diff > 0 ? `Surplus of Rs. ${diff.toFixed(2)}` : `Shortage of Rs. ${Math.abs(diff).toFixed(2)}`);
      const pendingMsg = res.summary.has_pending_verifications ? " Pending verification remains." : "";

      toast(`Register closed! ${diffMsg}${pendingMsg}`);
      openShiftClosedReport(res.summary, closingShiftId);
      await printShiftCloseReceipt(closingShiftId);
      await fetchActiveShift();
      if (_currentPage === "register") await renderRegister();
    }
  } catch (err) {
    toast(err.message, "error");
  } finally {
    hideAppLoader();
  }
}

async function printShiftCloseReceipt(shiftId) {
  try {
    const result = await api('/api/print-jobs/queue-shift', 'POST', { shift_id: shiftId });
    if (Number(result.queued || 0) > 0) {
      toast('Shift summary sent to the receipt printer.');
      return;
    }
    printSaleReceiptUrl(`/print/shifts/${encodeURIComponent(shiftId)}?autoprint=1`);
  } catch (err) {
    console.error('Shift receipt print error:', err);
    printSaleReceiptUrl(`/print/shifts/${encodeURIComponent(shiftId)}?autoprint=1`);
  }
}

function openShiftClosedReport(summary, shiftId) {
  const diff = Number(summary.discrepancy || 0);
  const diffClass = Math.abs(diff) <= 0.01 ? "text-emerald-600 dark:text-emerald-400" : diff > 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400";
  const diffLabel = Math.abs(diff) <= 0.01 ? "Balanced" : diff > 0 ? "Over" : "Short";
  const pendingVerificationTotal = Number(summary.pending_verification_total || 0);
  openModal("Shift Closed - Z Report", `
    <div class="space-y-4">
      ${summary.has_pending_verifications ? `
      <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
        <div class="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">Closed with Pending Verification</div>
        <p class="mt-2 text-xs font-bold text-amber-700 dark:text-amber-200 leading-relaxed">
          Rs. ${pendingVerificationTotal.toFixed(2)} is still waiting for admin verification. This shift will stay red in logs until it is verified or rejected.
        </p>
      </div>
      ` : ''}
      <div class="grid grid-cols-2 gap-3">
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Expected Cash</div>
          <div class="text-xl font-black text-slate-900 dark:text-white mt-1">Rs. ${Number(summary.expected_balance || 0).toFixed(2)}</div>
        </div>
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Actual Count</div>
          <div class="text-xl font-black text-slate-900 dark:text-white mt-1">Rs. ${Number(summary.closing_balance || 0).toFixed(2)}</div>
        </div>
      </div>
      <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
        <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Discrepancy</div>
        <div class="text-3xl font-black mt-1 ${diffClass}">${diffLabel}: Rs. ${Math.abs(diff).toFixed(2)}</div>
      </div>
      <div class="space-y-2 text-sm font-bold">
        <div class="flex justify-between"><span>Opening Cash</span><span>Rs. ${Number(summary.opening_balance || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Cash Sales</span><span>Rs. ${Number(summary.net_cash_sales || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Card Sales</span><span>Rs. ${Number(summary.net_card_sales || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Online Sales</span><span>Rs. ${Number(summary.net_online_sales || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Cash Due Collections</span><span>Rs. ${Number(summary.debt_collections || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Card Due Collections</span><span>Rs. ${Number(summary.card_collections || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Online Due Collections</span><span>Rs. ${Number(summary.online_collections || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Cash Refunds</span><span>- Rs. ${Number(summary.total_cash_refunds || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Cash Drops</span><span>- Rs. ${Number(summary.cash_drops || 0).toFixed(2)}</span></div>
        <div class="flex justify-between"><span>Verified Handovers</span><span>- Rs. ${Number(summary.cash_handovers || 0).toFixed(2)}</span></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="printShiftCloseReceipt(${Number(shiftId)})" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest">Print Summary</button>
        <button onclick="closeModal()" class="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm uppercase tracking-widest">Done</button>
      </div>
    </div>
  `);
}

// ─── LOGS & AUDIT ────────────────────────────────────────────────────────────
let _logsData = [];
let _shiftHistoryData = [];
let _logsFilter = { from: '', to: '', action: '', userId: '' };
let _logsActiveTab = "register";

const LOG_TABS = [
  { id: "register", label: "Register Logs" },
  { id: "wastage", label: "Wastage Logs" },
  { id: "payments", label: "Payment Logs" },
  { id: "sales", label: "Sales Logs" },
  { id: "delivery", label: "Delivery Logs" },
  { id: "other", label: "All Logs" }
];

function _logsTableColspan() {
  return currentUser?.role === "superadmin" ? 5 : 4;
}

function renderLogsTabButtons() {
  return LOG_TABS.map((tab) => {
    const active = _logsActiveTab === tab.id;
    return `
      <button type="button" onclick="setLogsTab('${tab.id}')" class="shrink-0 px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${active
        ? "bg-slate-950 dark:bg-white text-white dark:text-slate-950 border-slate-950 dark:border-white shadow-lg"
        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700"}">
        ${tab.label}
      </button>
    `;
  }).join("");
}

function setLogsTab(tabId) {
  if (!LOG_TABS.some((tab) => tab.id === tabId)) return;
  const from = document.getElementById("log-filter-from")?.value;
  const to = document.getElementById("log-filter-to")?.value;
  if (from) _logsFilter.from = from;
  if (to) _logsFilter.to = to;
  _logsActiveTab = tabId;
  renderLogs();
}

function _renderLogsLoading(message = "Fetching logs...") {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;
  tabContent.innerHTML = `
    <div class="min-h-[320px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
      ${escapeOrderValue(message)}
    </div>
  `;
}

function _renderLogsError(message) {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;
  tabContent.innerHTML = `
    <div class="p-8 rounded-3xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-600 dark:text-rose-300 font-bold">
      ${escapeOrderValue(message || "Failed to load logs.")}
    </div>
  `;
}

function _activityLogTableShell(title = "Activity Trail", subtitle = "System activity records") {
  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[360px]">
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h4 class="text-base font-black text-slate-950 dark:text-white tracking-tight">${title}</h4>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">${subtitle}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
              <th class="px-6 py-4">Time</th>
              <th class="px-6 py-4">User</th>
              <th class="px-6 py-4">Action</th>
              <th class="px-6 py-4">Details</th>
              ${currentUser.role === 'superadmin' ? '<th class="px-6 py-4">Restaurant</th>' : ''}
            </tr>
          </thead>
          <tbody id="logs-table-body">
            <tr><td colspan="${_logsTableColspan()}" class="px-6 py-20 text-center text-slate-400 italic">No logs loaded.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _renderRegisterLogsTab(pendingCashDrops = [], pendingCashHandovers = []) {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;

  tabContent.innerHTML = `
    ${renderPendingCashDropsSection(pendingCashDrops)}
    ${renderPendingCashHandoversSection(pendingCashHandovers)}
    <div id="shift-history-table-wrap"></div>
    ${_activityLogTableShell("Register Activity Trail", "Shift openings, closings, cash drops, handovers, and drawer audit records")}
  `;

  _renderShiftHistoryTable();
  _renderLogsTable();
}

function _localDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function _isWithinLogDateRange(value) {
  const key = _localDateKey(value);
  if (!key) return false;
  if (_logsFilter.from && key < _logsFilter.from) return false;
  if (_logsFilter.to && key > _logsFilter.to) return false;
  return true;
}

function _formatLogDateTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function _formatOrderType(value) {
  return String(value || "sale").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function _statusPill(label, tone = "slate") {
  const tones = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/40",
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-900/40",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-900/40",
    rose: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-900/40",
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
  };
  return `<span class="inline-flex px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${tones[tone] || tones.slate}">${escapeOrderValue(label)}</span>`;
}

function _renderWastageLogsTab(wasteRows = []) {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;
  const colspan = currentUser.role === "superadmin" ? 8 : 7;

  const rows = wasteRows.map((row) => {
    const sourceType = row.source_type ? _formatOrderType(row.source_type) : "Raw Ingredient";
    const stockAction = row.stock_action ? _formatOrderType(row.stock_action) : "Deduct";
    const quantity = `${Number(row.quantity || 0).toFixed(2)}${row.unit ? ` ${escapeOrderValue(row.unit)}` : ""}`;
    const cost = Number(row.cost_amount || 0);

    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.01]">
        <td class="px-6 py-4 text-xs font-bold text-slate-900 dark:text-white">${_formatLogDateTime(row.created_at || row.date)}</td>
        <td class="px-6 py-4 text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(row.ingredient_name || `Waste #${row.id}`)}</td>
        <td class="px-6 py-4">
          <div class="flex flex-col gap-1">
            ${_statusPill(sourceType, row.source_type === "return" ? "amber" : row.source_type === "order" ? "blue" : "rose")}
            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">${escapeOrderValue(stockAction)}</span>
          </div>
        </td>
        <td class="px-6 py-4 text-sm font-black text-rose-600 dark:text-rose-300">${quantity}</td>
        <td class="px-6 py-4 text-xs font-black text-slate-700 dark:text-slate-200">${cost > 0 ? `Rs. ${cost.toFixed(2)}` : "-"}</td>
        <td class="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">${escapeOrderValue(row.reason || row.reason_code || "No reason recorded")}</td>
        <td class="px-6 py-4 text-xs font-black text-slate-700 dark:text-slate-200">${escapeOrderValue(row.user_name || "Unknown")}</td>
        ${currentUser.role === "superadmin" ? `<td class="px-6 py-4 text-xs font-bold text-indigo-500">${escapeOrderValue(row.shop_name || "Core System")}</td>` : ""}
      </tr>
    `;
  }).join("");

  tabContent.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h4 class="text-base font-black text-slate-950 dark:text-white tracking-tight">Wastage Logs</h4>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Product, ingredient, recipe, order, return, and stock loss records</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
              <th class="px-6 py-4">Time</th>
              <th class="px-6 py-4">Source</th>
              <th class="px-6 py-4">Type</th>
              <th class="px-6 py-4">Quantity</th>
              <th class="px-6 py-4">Cost</th>
              <th class="px-6 py-4">Reason</th>
              <th class="px-6 py-4">Staff</th>
              ${currentUser.role === "superadmin" ? '<th class="px-6 py-4">Restaurant</th>' : ""}
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${colspan}" class="px-6 py-20 text-center text-slate-400 italic font-medium">No wastage records found for the selected date range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _renderPaymentLogsTab(paymentRows = []) {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;

  const rows = paymentRows.map((payment) => `
    <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.01]">
      <td class="px-6 py-4 text-xs font-bold text-slate-900 dark:text-white">${_formatLogDateTime(payment.created_at)}</td>
      <td class="px-6 py-4">
        <div class="text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(payment.customer_name || "Walk-in customer")}</div>
        <div class="text-[10px] font-bold text-slate-400 mt-0.5">${escapeOrderValue(payment.customer_phone || "")}</div>
      </td>
      <td class="px-6 py-4 text-sm font-black text-emerald-600 dark:text-emerald-300">${formatRegisterMoney(payment.amount)}</td>
      <td class="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">${escapeOrderValue(payment.note || "Payment received")}</td>
      <td class="px-6 py-4">
        <div class="text-xs font-black text-slate-800 dark:text-white">${escapeOrderValue(payment.created_by_name || "Unknown")}</div>
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${payment.sale_id ? `Sale #${payment.sale_id}` : "Ledger payment"}</div>
      </td>
      ${currentUser.role === 'superadmin' ? `<td class="px-6 py-4 text-xs font-bold text-indigo-500">${escapeOrderValue(payment.shop_name || "Core System")}</td>` : ""}
    </tr>
  `).join("");

  tabContent.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h4 class="text-base font-black text-slate-950 dark:text-white tracking-tight">Payment Logs</h4>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Customer ledger payment events and due collections</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
              <th class="px-6 py-4">Time</th>
              <th class="px-6 py-4">Customer</th>
              <th class="px-6 py-4">Amount</th>
              <th class="px-6 py-4">Note</th>
              <th class="px-6 py-4">Collected By</th>
              ${currentUser.role === 'superadmin' ? '<th class="px-6 py-4">Restaurant</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${currentUser.role === 'superadmin' ? 6 : 5}" class="px-6 py-20 text-center text-slate-400 italic font-medium">No payment records found for the selected date range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _renderSalesLogsTab(salesRows = []) {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;
  const colspan = currentUser.role === "superadmin" ? 6 : 5;

  const rows = salesRows.map((sale) => {
    const total = Number(sale.total || 0);
    const paid = Number(sale.amount_received || 0);
    const due = Math.max(0, total - paid);
    const status = String(sale.order_status || "completed");
    const statusTone = status === "completed" ? "emerald" : status === "payment_pending" ? "amber" : "slate";
    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.01]">
        <td class="px-6 py-4">
          <div class="text-xs font-black text-slate-900 dark:text-white">#${sale.id}</div>
          <div class="text-[10px] font-bold text-slate-400 mt-0.5">${_formatLogDateTime(sale.created_at)}</div>
        </td>
        <td class="px-6 py-4">
          <div class="text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(sale.customer_name || "Walk-in customer")}</div>
          <div class="text-[10px] font-bold text-slate-400 mt-0.5">${escapeOrderValue(sale.customer_phone || _formatOrderType(sale.order_type))}</div>
        </td>
        <td class="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">${escapeOrderValue(sale.served_by_name || sale.served_by_username || "Unknown")}</td>
        <td class="px-6 py-4">
          <div class="text-sm font-black text-slate-900 dark:text-white">${formatRegisterMoney(total)}</div>
          <div class="text-[10px] font-bold ${due > 0.01 ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"} mt-0.5">Paid ${formatRegisterMoney(paid)}${due > 0.01 ? ` / Due ${formatRegisterMoney(due)}` : ""}</div>
        </td>
        <td class="px-6 py-4">
          <div class="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">${escapeOrderValue(sale.payment_method || "cash")}</div>
          <div class="mt-2">${_statusPill(status.replace(/_/g, " "), statusTone)}</div>
        </td>
        ${currentUser.role === "superadmin" ? `<td class="px-6 py-4 text-xs font-bold text-indigo-500">${escapeOrderValue(sale.shop_name || "Core System")}</td>` : ""}
      </tr>
    `;
  }).join("");

  tabContent.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h4 class="text-base font-black text-slate-950 dark:text-white tracking-tight">Sales Logs</h4>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Bills, payment status, sale type, and cashier activity</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
              <th class="px-6 py-4">Sale</th>
              <th class="px-6 py-4">Customer</th>
              <th class="px-6 py-4">Served By</th>
              <th class="px-6 py-4">Amount</th>
              <th class="px-6 py-4">Payment</th>
              ${currentUser.role === "superadmin" ? '<th class="px-6 py-4">Restaurant</th>' : ""}
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${colspan}" class="px-6 py-20 text-center text-slate-400 italic font-medium">No sales found for the selected date range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _renderDeliveryLogsTab(deliveryRows = []) {
  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;
  const colspan = currentUser.role === "superadmin" ? 6 : 5;

  const rows = deliveryRows.map((sale) => {
    const status = String(sale.order_status || "delivery");
    const statusTone = status === "completed" ? "emerald" : status === "payment_pending" ? "amber" : "blue";
    return `
      <tr class="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-white/[0.01]">
        <td class="px-6 py-4">
          <div class="text-xs font-black text-slate-900 dark:text-white">#${sale.id}</div>
          <div class="text-[10px] font-bold text-slate-400 mt-0.5">${_formatLogDateTime(sale.created_at)}</div>
        </td>
        <td class="px-6 py-4">
          <div class="text-sm font-black text-slate-900 dark:text-white">${escapeOrderValue(sale.customer_name || "Delivery customer")}</div>
          <div class="text-[10px] font-bold text-slate-400 mt-0.5">${escapeOrderValue(sale.customer_phone || "")}</div>
        </td>
        <td class="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 max-w-xs">${escapeOrderValue(sale.delivery_address || "No address recorded")}</td>
        <td class="px-6 py-4 text-xs font-black text-slate-800 dark:text-white">${escapeOrderValue(sale.rider_name || "No rider assigned")}</td>
        <td class="px-6 py-4">
          <div class="text-sm font-black text-slate-900 dark:text-white">${formatRegisterMoney(sale.total)}</div>
          <div class="mt-2">${_statusPill(status.replace(/_/g, " "), statusTone)}</div>
        </td>
        ${currentUser.role === "superadmin" ? `<td class="px-6 py-4 text-xs font-bold text-indigo-500">${escapeOrderValue(sale.shop_name || "Core System")}</td>` : ""}
      </tr>
    `;
  }).join("");

  tabContent.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h4 class="text-base font-black text-slate-950 dark:text-white tracking-tight">Delivery Logs</h4>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Delivery orders, rider assignment, address, and order status</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
              <th class="px-6 py-4">Order</th>
              <th class="px-6 py-4">Customer</th>
              <th class="px-6 py-4">Address</th>
              <th class="px-6 py-4">Rider</th>
              <th class="px-6 py-4">Status</th>
              ${currentUser.role === "superadmin" ? '<th class="px-6 py-4">Restaurant</th>' : ""}
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${colspan}" class="px-6 py-20 text-center text-slate-400 italic font-medium">No delivery records found for the selected date range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _renderOtherLogsTab(logs = []) {
  _logsData = Array.isArray(logs) ? logs : [];

  const tabContent = document.getElementById("logs-tab-content");
  if (!tabContent) return;
  tabContent.innerHTML = _activityLogTableShell("All Logs", "Complete activity trail for the selected period");
  _renderLogsTable();
}

async function renderLogs() {
  const content = document.getElementById("page-content");
  if (!content) return;

  const today = _localDateKey(new Date());
  const defaultFromDate = new Date();
  defaultFromDate.setDate(defaultFromDate.getDate() - 30);
  if (!_logsFilter.from) _logsFilter.from = _localDateKey(defaultFromDate);
  if (!_logsFilter.to) _logsFilter.to = today;

  content.innerHTML = `
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <div>
              <h3 class="text-xl font-black text-slate-950 dark:text-white tracking-tight">Logs</h3>
              <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Register, wastage, payment, sales, delivery, and activity trails</p>
            </div>
          </div>
          
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span class="text-[10px] font-black text-slate-400 uppercase">From</span>
              <input type="date" id="log-filter-from" value="${_logsFilter.from}" class="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-white focus:ring-0 p-0" />
            </div>
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span class="text-[10px] font-black text-slate-400 uppercase">To</span>
              <input type="date" id="log-filter-to" value="${_logsFilter.to}" class="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-white focus:ring-0 p-0" />
            </div>
            <button onclick="applyLogFilters()" class="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg active:scale-95">Fetch Logs</button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <div class="min-w-max flex items-center gap-2 pb-1">
          ${renderLogsTabButtons()}
        </div>
      </div>

      <div id="logs-tab-content" class="space-y-6"></div>
    </div>
  `;

  await applyLogFilters();
}

async function applyLogFilters() {
  const from = document.getElementById("log-filter-from")?.value;
  const to = document.getElementById("log-filter-to")?.value;
  
  if (from) _logsFilter.from = from;
  if (to) _logsFilter.to = to;

  _renderLogsLoading(`Fetching ${LOG_TABS.find((tab) => tab.id === _logsActiveTab)?.label || "logs"}...`);

  try {
    const params = new URLSearchParams();
    if (_logsFilter.from) params.append('from', _logsFilter.from + ' 00:00:00');
    if (_logsFilter.to) params.append('to', _logsFilter.to + ' 23:59:59');

    if (_logsActiveTab === "register") {
      const [logs, history, pendingCashDrops, pendingCashHandovers] = await Promise.all([
        api(`/api/activity-logs?${params.toString()}`),
        api(`/api/shifts/history?${params.toString()}`),
        fetchPendingCashDropsForAdmin(),
        fetchPendingCashHandoversForRegister()
      ]);

      _logsData = Array.isArray(logs) ? logs : [];
      _shiftHistoryData = Array.isArray(history) ? history : [];
      _renderRegisterLogsTab(pendingCashDrops, pendingCashHandovers);
      return;
    }

    if (_logsActiveTab === "wastage") {
      const waste = await api(`/api/activity-logs/wastage?${params.toString()}`);
      _renderWastageLogsTab(Array.isArray(waste) ? waste : []);
      return;
    }

    if (_logsActiveTab === "payments") {
      const payments = await api(`/api/activity-logs/payments?${params.toString()}`);
      _renderPaymentLogsTab(Array.isArray(payments) ? payments : []);
      return;
    }

    if (_logsActiveTab === "sales" || _logsActiveTab === "delivery") {
      const salesParams = new URLSearchParams(params);
      if (_logsActiveTab === "delivery") {
        salesParams.append("order_type", "delivery");
      }
      const sales = await api(`/api/activity-logs/sales?${salesParams.toString()}`);
      const salesRows = Array.isArray(sales) ? sales : [];
      if (_logsActiveTab === "delivery") {
        _renderDeliveryLogsTab(salesRows);
      } else {
        _renderSalesLogsTab(salesRows);
      }
      return;
    }

    const logs = await api(`/api/activity-logs?${params.toString()}`);
    _renderOtherLogsTab(logs);
  } catch (err) {
    toast(err.message, "error");
    _renderLogsError(err.message);
  }
}

function _shiftCount(value, fallback = 0) {
  const count = Number(value);
  return Number.isFinite(count) ? count : fallback;
}

function _hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function _formatAuditTimestamp(value, fallback = "None") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function _fallbackShiftLogCounts(shiftId) {
  const related = _logsData.filter((log) =>
    log.reference_type === "shift" && Number(log.reference_id) === Number(shiftId)
  );

  return {
    audit: related.length,
    open: related.filter((log) => log.action === "SHIFT_OPEN").length,
    close: related.filter((log) => log.action === "SHIFT_CLOSE").length
  };
}

function _buildShiftHealth(shift) {
  const fallbackCounts = _fallbackShiftLogCounts(shift.id);
  const status = String(shift.status || "open").toLowerCase();
  const isClosed = status === "closed";
  const openLogCount = _shiftCount(shift.open_log_count, fallbackCounts.open);
  const closeLogCount = _shiftCount(shift.close_log_count, fallbackCounts.close);
  const auditLogCount = _shiftCount(shift.audit_log_count, fallbackCounts.audit);
  const pendingDrops = _shiftCount(shift.pending_cash_drop_count);
  const pendingHandovers = _shiftCount(shift.pending_cash_handover_count);
  const rejectedDrops = _shiftCount(shift.rejected_cash_drop_count);
  const rejectedHandovers = _shiftCount(shift.rejected_cash_handover_count);
  const issues = [];
  let discrepancy = 0;

  if (auditLogCount === 0) issues.push("No linked audit logs");
  if (openLogCount === 0) issues.push("Missing open log");
  if (openLogCount > 1) issues.push("Duplicate open logs");

  if (isClosed) {
    if (closeLogCount === 0) issues.push("Missing close log");
    if (closeLogCount > 1) issues.push("Duplicate close logs");
    if (!_hasNumericValue(shift.expected_balance)) issues.push("Expected balance missing");
    if (!_hasNumericValue(shift.closing_balance)) issues.push("Closing count missing");

    if (_hasNumericValue(shift.expected_balance) && _hasNumericValue(shift.closing_balance)) {
      discrepancy = Number(shift.closing_balance) - Number(shift.expected_balance);
      if (Math.abs(discrepancy) > 0.01) {
        issues.push(`${discrepancy < 0 ? "Short" : "Over"} ${formatRegisterMoney(Math.abs(discrepancy))}`);
      }
    }
  } else if (closeLogCount > 0) {
    issues.push("Close log exists while shift is open");
  }

  if (pendingDrops > 0) issues.push(`${pendingDrops} pending cash drop${pendingDrops === 1 ? "" : "s"}`);
  if (pendingHandovers > 0) issues.push(`${pendingHandovers} pending handover${pendingHandovers === 1 ? "" : "s"}`);
  if (rejectedDrops > 0) issues.push(`${rejectedDrops} rejected cash drop${rejectedDrops === 1 ? "" : "s"}`);
  if (rejectedHandovers > 0) issues.push(`${rejectedHandovers} rejected handover${rejectedHandovers === 1 ? "" : "s"}`);

  return {
    isClosed,
    isOk: issues.length === 0,
    issues,
    discrepancy,
    openLogCount,
    closeLogCount,
    auditLogCount,
    pendingDrops,
    pendingHandovers,
    verificationRequestedAt: shift.verification_requested_at || null,
    verificationCompletedAt: shift.verification_completed_at || null
  };
}

function _renderShiftHistoryTable() {
  const container = document.getElementById("shift-history-table-wrap");
  if (!container) return;

  if (!_shiftHistoryData.length) {
    container.innerHTML = `
      <div class="py-10 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400">
        <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span class="text-xs font-bold uppercase tracking-widest">No shift history for this period</span>
      </div>
    `;
    return;
  }

  const issuePreview = (issues) => {
    if (!issues.length) {
      return `<span class="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Error proof</span>`;
    }

    const visible = issues.slice(0, 3);
    const remaining = issues.length - visible.length;
    return `
      <div class="flex flex-wrap gap-1.5">
        ${visible.map((issue) => `<span class="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 text-[10px] font-bold">${issue}</span>`).join("")}
        ${remaining > 0 ? `<span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-[10px] font-bold">+${remaining} more</span>` : ""}
      </div>
    `;
  };

  const rows = _shiftHistoryData.map((shift) => {
    const start = new Date(shift.start_time);
    const end = shift.end_time ? new Date(shift.end_time) : null;
    const dayName = start.toLocaleDateString(undefined, { weekday: 'long' });
    const dateStr = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    
    const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ACTIVE';
    const health = _buildShiftHealth(shift);
    const dotClass = health.isOk ? "bg-emerald-500 shadow-emerald-500/30" : "bg-rose-500 shadow-rose-500/30";
    const rowTint = health.isOk ? "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10" : "bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/60 dark:hover:bg-rose-950/20";
    const statusPill = health.isOk
      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/40"
      : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-900/40";
    const statusText = health.isOk ? "Error proof" : "Needs review";
    const openingText = _hasNumericValue(shift.opening_balance) ? formatRegisterMoney(shift.opening_balance) : "Missing";
    const expectedText = _hasNumericValue(shift.expected_balance) ? formatRegisterMoney(shift.expected_balance) : "Missing";
    const closingText = _hasNumericValue(shift.closing_balance) ? formatRegisterMoney(shift.closing_balance) : (health.isClosed ? "Missing" : "Open");
    const verificationDemandedText = _formatAuditTimestamp(health.verificationRequestedAt);
    const verificationCompletedText = _formatAuditTimestamp(health.verificationCompletedAt, health.verificationRequestedAt ? "Pending" : "None");
    const discrepancyTone = Math.abs(health.discrepancy) <= 0.01
      ? "text-emerald-600 dark:text-emerald-400"
      : health.discrepancy > 0
        ? "text-blue-600 dark:text-blue-400"
        : "text-rose-600 dark:text-rose-400";

    return `
      <tr class="${rowTint} transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
        <td class="relative w-14 px-5 py-5 align-middle">
          <span class="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-slate-200 dark:bg-slate-800"></span>
          <span class="relative z-10 mx-auto block h-3.5 w-3.5 rounded-full ${dotClass} ring-4 ring-white dark:ring-slate-900 shadow-lg"></span>
        </td>
        <td class="px-4 py-5 align-middle min-w-[190px]">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest">${dayName}</span>
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">${dateStr}</span>
          </div>
          <div class="mt-2 text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>${startTime}</span>
            <span class="text-slate-300 dark:text-slate-600">to</span>
            <span>${endTime}</span>
          </div>
          <div class="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Shift #${shift.id} · ${String(shift.status || "open").toUpperCase()}</div>
        </td>
        <td class="px-4 py-5 align-middle min-w-[150px]">
          <div class="text-xs font-black text-slate-800 dark:text-white">${shift.cashier_name || "System"}</div>
          <div class="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Closed by ${shift.closed_by_name || (health.isClosed ? "Unknown" : "Open")}</div>
        </td>
        <td class="px-4 py-5 align-middle min-w-[130px]">
          <div class="font-black uppercase tracking-widest text-slate-400 text-[9px]">Opening Cash</div>
          <div class="mt-1 text-sm font-black text-indigo-600 dark:text-indigo-300">${openingText}</div>
        </td>
        <td class="px-4 py-5 align-middle min-w-[260px]">
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div class="font-black uppercase tracking-widest text-slate-400 text-[9px]">Expected</div>
              <div class="mt-1 font-black text-slate-800 dark:text-white">${expectedText}</div>
            </div>
            <div>
              <div class="font-black uppercase tracking-widest text-slate-400 text-[9px]">Counted</div>
              <div class="mt-1 font-black text-slate-800 dark:text-white">${closingText}</div>
            </div>
          </div>
          <div class="mt-2 text-[11px] font-black ${discrepancyTone}">
            Difference: ${health.isClosed && _hasNumericValue(shift.expected_balance) && _hasNumericValue(shift.closing_balance) ? formatRegisterMoney(Math.abs(health.discrepancy)) : "Pending"}
          </div>
        </td>
        <td class="px-4 py-5 align-middle min-w-[160px]">
          <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Open logs: <span class="text-slate-900 dark:text-white">${health.openLogCount}</span></div>
          <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">Close logs: <span class="text-slate-900 dark:text-white">${health.closeLogCount}</span></div>
          <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">Total audit logs: <span class="text-slate-900 dark:text-white">${health.auditLogCount}</span></div>
        </td>
        <td class="px-4 py-5 align-middle min-w-[170px]">
          <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Pending drops: <span class="text-slate-900 dark:text-white">${health.pendingDrops}</span></div>
          <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">Pending handovers: <span class="text-slate-900 dark:text-white">${health.pendingHandovers}</span></div>
          <div class="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Demanded</div>
          <div class="mt-1 text-[11px] font-bold text-slate-700 dark:text-slate-200">${verificationDemandedText}</div>
          <div class="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Admin Verified/Rejected</div>
          <div class="mt-1 text-[11px] font-bold ${health.verificationCompletedAt ? "text-emerald-600 dark:text-emerald-400" : health.verificationRequestedAt ? "text-amber-600 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}">${verificationCompletedText}</div>
          <div class="mt-2 px-2.5 py-1 rounded-lg border ${statusPill} text-[10px] font-black inline-flex">${statusText}</div>
        </td>
        <td class="px-4 py-5 align-middle min-w-[220px]">
          ${issuePreview(health.issues)}
        </td>
        ${currentUser.role === 'superadmin' ? `<td class="px-4 py-5 align-middle text-xs font-bold text-indigo-500 min-w-[140px]">${shift.shop_name || "Core System"}</td>` : ""}
        <td class="px-4 py-5 align-middle text-right">
            <button onclick="viewShiftAuditFlow(${shift.id})" class="w-9 h-9 rounded-full bg-slate-900 dark:bg-indigo-600 text-white flex items-center justify-center hover:scale-105 transition-all shadow-lg ml-auto" title="View Full Shift Audit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </button>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 class="text-base font-black text-slate-950 dark:text-white tracking-tight">Shift Health</h4>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Audit completeness and register calculation checks</p>
        </div>
        <div class="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
          <span class="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>Error proof</span>
          <span class="inline-flex items-center gap-2 text-rose-600 dark:text-rose-400"><span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>Problem found</span>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700">
              <th class="w-14 px-5 py-4"></th>
              <th class="px-4 py-4">Shift</th>
              <th class="px-4 py-4">Cashier</th>
              <th class="px-4 py-4">Opening Cash</th>
              <th class="px-4 py-4">Calculations</th>
              <th class="px-4 py-4">Logs</th>
              <th class="px-4 py-4">Cash Movement</th>
              <th class="px-4 py-4">Status</th>
              ${currentUser.role === 'superadmin' ? '<th class="px-4 py-4">Restaurant</th>' : ''}
              <th class="px-4 py-4 text-right">Audit</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _renderLogsTable() {
  const tbody = document.getElementById("logs-table-body");
  if (!tbody) return;

  if (!_logsData.length) {
    tbody.innerHTML = `<tr><td colspan="${_logsTableColspan()}" class="px-6 py-20 text-center text-slate-400 italic font-medium">No activity records found for the selected date range.</td></tr>`;
    return;
  }

  tbody.innerHTML = _logsData.map(log => {
    const time = new Date(log.created_at);
    let detailsHtml = "";
    
    try {
      if (log.details && log.details.startsWith('{')) {
        const d = JSON.parse(log.details);
        if (log.action === 'SHIFT_CLOSE') {
          const diff = Number(d.actual) - Number(d.expected);
          const diffClass = Math.abs(diff) <= 0.01 ? "text-emerald-500" : diff > 0 ? "text-blue-500" : "text-rose-500";
          detailsHtml = `
            <div class="space-y-1 text-[11px]">
              <div class="flex gap-2"><span>Expected: Rs.${Number(d.expected).toFixed(0)}</span> | <span>Actual: Rs.${Number(d.actual).toFixed(0)}</span></div>
              <div class="font-bold ${diffClass}">Discrepancy: Rs.${diff.toFixed(2)}</div>
              ${d.provisional_close ? `<div class="font-bold text-amber-600 dark:text-amber-300">Pending verification: Rs.${Number(d.pending_verification_total || 0).toFixed(2)}</div>` : ""}
              ${d.shortage_reason ? `<div class="mt-1 p-2 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-900/30 font-medium">Reason: ${d.shortage_reason}</div>` : ""}
            </div>`;
        } else if (log.action === 'SHIFT_OPEN') {
           detailsHtml = `<span class="text-xs font-bold text-emerald-600">Opened with Rs. ${Number(d.opening_balance).toFixed(0)}</span>`;
        } else if (log.action === 'CASH_DROP_REQUEST') {
           detailsHtml = `
            <div class="space-y-1 text-xs font-bold">
              <div>Amount: <span class="text-amber-600">Rs. ${Number(d.amount).toFixed(0)}</span> ${d.note ? `<span class="text-slate-400 font-normal ml-1 italic">(${d.note})</span>` : ""}</div>
              <div class="text-[10px] text-slate-400 uppercase tracking-widest">Demanded: ${time.toLocaleString()}</div>
            </div>`;
        } else if (log.action === 'CASH_DROP_VERIFIED' || log.action === 'CASH_DROP_REJECTED') {
           const statusTone = log.action.includes('REJECTED') ? 'text-rose-600' : 'text-emerald-600';
           const statusLabel = log.action.includes('REJECTED') ? 'Admin rejected' : 'Admin verified';
           detailsHtml = `
            <div class="space-y-1 text-xs font-bold">
              <div>${statusLabel}: <span class="${statusTone}">Rs. ${Number(d.amount).toFixed(0)}</span></div>
              <div class="text-[10px] text-slate-400 uppercase tracking-widest">Demanded: ${_formatAuditTimestamp(d.requested_at, "Unknown")}</div>
              <div class="text-[10px] text-slate-400 uppercase tracking-widest">${statusLabel}: ${time.toLocaleString()}</div>
            </div>`;
        } else if (log.action.includes('HANDOVER')) {
           const handoverTone = log.action.includes('REJECTED') ? 'text-rose-600' : 'text-blue-600';
           const handoverStatus = log.action.includes('REQUEST')
            ? 'Demanded'
            : log.action.includes('REJECTED')
              ? 'Admin rejected'
              : 'Admin verified';
           detailsHtml = `
            <div class="space-y-1 text-xs font-bold">
              <div>Amount: <span class="${handoverTone}">Rs. ${Number(d.amount).toFixed(0)}</span></div>
              <div class="text-[10px] text-slate-400 uppercase tracking-widest">Demanded: ${log.action.includes('REQUEST') ? time.toLocaleString() : _formatAuditTimestamp(d.requested_at, "Unknown")}</div>
              ${log.action.includes('REQUEST') ? "" : `<div class="text-[10px] text-slate-400 uppercase tracking-widest">${handoverStatus}: ${time.toLocaleString()}</div>`}
            </div>`;
        } else {
           detailsHtml = `<pre class="text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800 p-1 rounded max-w-xs truncate">${JSON.stringify(d)}</pre>`;
        }
      } else {
        detailsHtml = `<span class="text-xs text-slate-500">${log.details || ''}</span>`;
      }
    } catch(e) {
      detailsHtml = `<span class="text-xs text-slate-500">${log.details || ''}</span>`;
    }

    const actionClass = {
      'SHIFT_OPEN': 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
      'SHIFT_CLOSE': 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
      'CASH_DROP_REQUEST': 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
      'CASH_DROP_VERIFIED': 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
      'CASH_DROP_REJECTED': 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
      'HANDOVER_REQUEST': 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
      'HANDOVER_VERIFIED': 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
      'HANDOVER_REJECTED': 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
    }[log.action] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 grow">
        <td class="px-6 py-4">
          <div class="text-xs font-bold text-slate-900 dark:text-white uppercase">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="text-[10px] font-medium text-slate-400 mt-0.5">${time.toLocaleDateString()}</div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500">${log.user_name?.substring(0,2).toUpperCase() || '??'}</div>
            <div>
              <div class="text-xs font-black text-slate-800 dark:text-white">${log.user_name || 'System'}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">${log.user_role || 'No Role'}</div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight ${actionClass}">${log.action.replace(/_/g, ' ')}</span>
        </td>
        <td class="px-6 py-4 flex items-center justify-between gap-4">
          <div class="flex-1">${detailsHtml}</div>
          ${log.reference_type === 'shift' ? `
            <button onclick="viewShiftAuditFlow(${log.reference_id})" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-all shadow-sm" title="View Full Shift Audit">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </button>
          ` : ""}
        </td>
        ${currentUser.role === 'superadmin' ? `<td class="px-6 py-4 text-xs font-bold text-indigo-500">${log.shop_name || 'Core System'}</td>` : ''}
      </tr>`;
  }).join("");
}

async function viewShiftAuditFlow(shiftId) {
  openModal("Shift Activity Timeline", `<div class="p-20 text-center text-slate-400 italic">Gathering shift records...</div>`, "max-w-3xl");
  
  try {
    const logs = await api(`/api/activity-logs/shift/${shiftId}`);
    if (!logs.length) {
      document.getElementById("modal-body").innerHTML = `<div class="p-20 text-center text-slate-400 italic">No activity records found for this shift.</div>`;
      return;
    }

    const opener = logs.find(l => l.action === 'SHIFT_OPEN');
    const closer = logs.find(l => l.action === 'SHIFT_CLOSE');
    const openTime = opener ? new Date(opener.created_at).toLocaleString() : 'Unknown';
    const closeTime = closer ? new Date(closer.created_at).toLocaleString() : 'Active/Unknown';

    let timelineHtml = `
      <div class="space-y-6">
        <!-- Summary Header -->
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <div class="text-[9px] font-black uppercase text-emerald-500 tracking-widest pl-1">Shift Started</div>
            <div class="text-xs font-black text-slate-900 dark:text-white mt-1">${openTime}</div>
          </div>
          <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
            <div class="text-[9px] font-black uppercase text-rose-500 tracking-widest pl-1">Shift Ended</div>
            <div class="text-xs font-black text-slate-900 dark:text-white mt-1">${closeTime}</div>
          </div>
        </div>

        <!-- Flow List -->
        <div class="relative pl-8 space-y-8 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
    `;

    logs.forEach(log => {
      const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const actionClass = {
        'SHIFT_OPEN': 'bg-emerald-500',
        'SHIFT_CLOSE': 'bg-rose-500',
        'CASH_DROP_REQUEST': 'bg-amber-500',
        'CASH_DROP_VERIFIED': 'bg-emerald-500',
        'CASH_DROP_REJECTED': 'bg-rose-500',
        'HANDOVER_REQUEST': 'bg-blue-500',
        'HANDOVER_VERIFIED': 'bg-indigo-500',
        'HANDOVER_REJECTED': 'bg-rose-500',
      }[log.action] || 'bg-slate-400';

      let description = log.action.replace(/_/g, ' ');
      let detailsText = "";
      try {
        if (log.details && log.details.startsWith('{')) {
          const d = JSON.parse(log.details);
          if (log.action === 'SHIFT_CLOSE') {
            const diff = Number(d.actual) - Number(d.expected);
            detailsText = `Drawer checked. Discrepancy: Rs. ${diff.toFixed(2)}. ${d.provisional_close ? `Pending verification: Rs. ${Number(d.pending_verification_total || 0).toFixed(2)}. ` : ""}${d.shortage_reason ? `Reason: ${d.shortage_reason}` : ""}`;
          } else if (log.action === 'SHIFT_OPEN') {
            detailsText = `Opened with float: Rs. ${Number(d.opening_balance).toFixed(0)}`;
          } else if (log.action.includes('CASH_DROP') || log.action.includes('HANDOVER')) {
            const demandedAt = log.action.includes('REQUEST')
              ? new Date(log.created_at).toLocaleString()
              : _formatAuditTimestamp(d.requested_at, "Unknown");
            const verifiedAt = log.action.includes('REQUEST') ? "" : ` Verified: ${new Date(log.created_at).toLocaleString()}.`;
            detailsText = `Amount: Rs. ${Number(d.amount).toFixed(0)}. Demanded: ${demandedAt}.${verifiedAt} ${d.note ? `(${d.note})` : ""}`;
          }
        } else {
          detailsText = log.details || "";
        }
      } catch(e) {}

      timelineHtml += `
        <div class="relative">
          <div class="absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full ${actionClass} border-4 border-white dark:border-slate-900 ring-1 ring-slate-100 dark:ring-slate-800"></div>
          <div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-[10px] font-black uppercase tracking-widest ${actionClass.replace('bg-', 'text-')}">${description}</span>
              <span class="text-[10px] font-bold text-slate-400">${time}</span>
            </div>
            <div class="text-sm font-black text-slate-800 dark:text-white mt-1">${log.user_name}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">${detailsText}</div>
          </div>
        </div>
      `;
    });

    timelineHtml += `</div></div>`;
    document.getElementById("modal-body").innerHTML = timelineHtml;
  } catch (err) {
    document.getElementById("modal-body").innerHTML = `<div class="p-20 text-center text-rose-500 font-bold">Error: ${err.message}</div>`;
  }
}

init();

function printBarcode(barcode) {
  if (!barcode) return toast("No barcode to print", "error");
  const container = document.getElementById("barcode-print-area");
  if (!container) return;
  
  container.innerHTML = '<svg id="barcode-svg"></svg>';
  
  // Inject print styles for specific barcode dimensions (30mm x 15mm)
  const printStyle = document.createElement('style');
  printStyle.id = 'barcode-page-style';
  printStyle.innerHTML = `
    @media print {
      @page {
        size: 30mm 15mm;
        margin: 0;
      }
      body > *:not(#barcode-print-area) {
        display: none !important;
      }
      body { margin: 0; padding: 0; background: white; }
      #barcode-print-area {
        width: 30mm;
        height: 15mm;
        display: flex !important;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        background: white;
      }
      #barcode-svg {
        max-width: 95%;
        max-height: 95%;
      }
    }
  `;
  document.head.appendChild(printStyle);
  
  try {
    if (typeof JsBarcode === "undefined") {
        document.head.removeChild(printStyle);
        return toast("Barcode library not loaded yet. Please wait.", "error");
    }
    JsBarcode("#barcode-svg", barcode, {
      format: "CODE128",
      displayValue: false,
      width: 1.5,
      height: 40,
      margin: 0
    });
  } catch(e) {
    if (document.head.contains(printStyle)) document.head.removeChild(printStyle);
    toast("Error generating barcode", "error");
    console.error(e);
    return;
  }
  
  // Wait a small bit for SVG to render then print
  setTimeout(() => {
    window.print();
    setTimeout(() => {
        container.innerHTML = "";
        if (document.head.contains(printStyle)) document.head.removeChild(printStyle);
    }, 1000);
  }, 100);
}
