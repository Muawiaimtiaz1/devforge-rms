let _registerPaymentShiftPage = 1;
let _registerPaymentShiftPages = 1;
let _registerPaymentOrderPage = 1;
let _registerPaymentSelectedShiftId = null;
let _registerPaymentLoadToken = 0;
let _registerPaymentSelectedDate = '';
let _registerPaymentShiftDates = null;
const _registerPaymentShiftCache = new Map();

function registerPaymentMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function registerPaymentDate(value, includeTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return includeTime
    ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : date.toLocaleDateString([], { dateStyle: 'medium' });
}

function registerPaymentContext(row) {
  if (row.order_type === 'dine_in') return row.table_number ? `Table ${escapeOrderValue(row.table_number)}` : 'Dine-in';
  if (row.order_type === 'delivery') return 'Delivery';
  return 'Takeaway';
}

async function renderRegisterPaymentsPanel(options = {}) {
  const container = document.getElementById('register-payments-panel');
  if (!container) return;
  if (options.refreshShifts) {
    _registerPaymentShiftCache.clear();
    _registerPaymentShiftDates = null;
  }
  const token = ++_registerPaymentLoadToken;
  if (!options.keepFilters || !container.children.length) {
    container.innerHTML = `<div class="flex min-h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-900">Loading received payments…</div>`;
  }

  try {
    const shiftParams = new URLSearchParams({ view: 'payment_shifts', page: String(_registerPaymentShiftPage), page_size: '8' });
    if (_registerPaymentSelectedDate) shiftParams.set('date', _registerPaymentSelectedDate);
    const shiftCacheKey = `${_registerPaymentSelectedDate || 'all'}:${_registerPaymentShiftPage}`;
    const [shiftData, shiftDatesData] = await Promise.all([
      _registerPaymentShiftCache.has(shiftCacheKey)
        ? Promise.resolve(_registerPaymentShiftCache.get(shiftCacheKey))
        : api(`/api/shifts/history?${shiftParams}`).then(data => {
          _registerPaymentShiftCache.set(shiftCacheKey, data);
          return data;
        }),
      _registerPaymentShiftDates
        ? Promise.resolve({ dates: _registerPaymentShiftDates })
        : api('/api/shifts/history?view=payment_shift_dates').then(data => {
          _registerPaymentShiftDates = Array.isArray(data.dates) ? data.dates : [];
          return data;
        })
    ]);
    if (token !== _registerPaymentLoadToken || !document.getElementById('register-payments-panel')) return;
    const shifts = Array.isArray(shiftData.items) ? shiftData.items : [];
    const availableDates = Array.isArray(shiftDatesData.dates) ? shiftDatesData.dates : [];
    _registerPaymentShiftPages = Number(shiftData.pagination?.total_pages || 1);
    if (!_registerPaymentSelectedShiftId || !shifts.some(shift => Number(shift.id) === Number(_registerPaymentSelectedShiftId))) {
      _registerPaymentSelectedShiftId = shifts[0]?.id || null;
      _registerPaymentOrderPage = 1;
    }

    if (!shifts.length) {
      container.innerHTML = `<div class="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900"><div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l2 2 4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><h4 class="text-lg font-black text-slate-900 dark:text-white">No register shifts yet</h4><p class="mt-2 text-sm text-slate-500">Your received order payments will appear here after you open a shift.</p></div>`;
      return;
    }

    const filters = options.keepFilters ? {
      search: document.getElementById('register-payment-search')?.value || '',
      payment_method: document.getElementById('register-payment-method')?.value || '',
      order_type: document.getElementById('register-payment-order-type')?.value || ''
    } : { search: '', payment_method: '', order_type: '' };
    const paymentParams = new URLSearchParams({
      view: 'received_payments', shift_id: String(_registerPaymentSelectedShiftId),
      page: String(_registerPaymentOrderPage), page_size: '10'
    });
    Object.entries(filters).forEach(([key, value]) => { if (value) paymentParams.set(key, value); });
    const paymentData = await api(`/api/shifts/history?${paymentParams}`);
    if (token !== _registerPaymentLoadToken || !document.getElementById('register-payments-panel')) return;
    const selectedShift = paymentData.shift || shifts.find(shift => Number(shift.id) === Number(_registerPaymentSelectedShiftId));
    const rows = Array.isArray(paymentData.items) ? paymentData.items : [];
    const pagination = paymentData.pagination || { page: 1, total_pages: 1, total: rows.length };

    container.innerHTML = `
      <div class="space-y-5">
        <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div class="flex items-start gap-3">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l2 2 4-4M7 7h10M7 11h10m-9 10h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg></div>
              <div><h4 class="text-xl font-black tracking-tight text-slate-950 dark:text-white">Payments by Shift</h4><p class="mt-1 text-sm text-slate-500">Orders for which you received payment during the selected shift.</p></div>
            </div>
            <div class="grid w-full gap-3 lg:w-[620px] sm:grid-cols-[190px_minmax(0,1fr)]">
              <div><label for="register-payment-date" class="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Available shift date</label><div class="relative"><svg class="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg><select id="register-payment-date" onchange="selectRegisterPaymentDate(this.value)" class="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-black text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">All shift dates</option>${availableDates.map(date => `<option value="${date}" ${date === _registerPaymentSelectedDate ? 'selected' : ''}>${registerPaymentDate(`${date}T12:00:00`, false)}</option>`).join('')}</select></div></div>
              <div><label for="register-payment-shift" class="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Shift filter</label>
              <div class="flex gap-2"><select id="register-payment-shift" onchange="selectRegisterPaymentShift(this.value)" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">${shifts.map(shift => `<option value="${shift.id}" ${Number(shift.id) === Number(_registerPaymentSelectedShiftId) ? 'selected' : ''}>Shift #${shift.id} · ${registerPaymentDate(shift.start_time, false)} · ${Number(shift.payment_order_count || 0)} orders · ${registerPaymentMoney(shift.payment_total)}</option>`).join('')}</select><button onclick="changeRegisterPaymentShiftPage(-1)" ${_registerPaymentShiftPage <= 1 ? 'disabled' : ''} class="h-12 w-12 rounded-xl border border-slate-200 text-slate-500 disabled:opacity-35 dark:border-slate-700" aria-label="Previous shifts">‹</button><button onclick="changeRegisterPaymentShiftPage(1)" ${_registerPaymentShiftPage >= _registerPaymentShiftPages ? 'disabled' : ''} class="h-12 w-12 rounded-xl border border-slate-200 text-slate-500 disabled:opacity-35 dark:border-slate-700" aria-label="Next shifts">›</button></div></div>
              <p class="mt-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Shift page ${_registerPaymentShiftPage} of ${_registerPaymentShiftPages}</p>
            </div>
          </div>
        </section>

        <section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"><div class="text-[10px] font-black uppercase tracking-widest text-indigo-500">Orders paid</div><div class="mt-2 text-3xl font-black text-indigo-950 dark:text-white">${Number(paymentData.summary?.total_orders || 0).toLocaleString()}</div></div>
          <div class="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30"><div class="text-[10px] font-black uppercase tracking-widest text-indigo-500">Total received</div><div class="mt-2 text-3xl font-black text-indigo-950 dark:text-white">${registerPaymentMoney(paymentData.summary?.total_amount)}</div></div>
          <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div class="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected shift</div><div class="mt-2 text-base font-black text-slate-900 dark:text-white">#${selectedShift.id} · ${String(selectedShift.status).toUpperCase()}</div><div class="mt-1 text-xs font-medium text-slate-500">${registerPaymentDate(selectedShift.start_time)}${selectedShift.end_time ? ` — ${registerPaymentDate(selectedShift.end_time)}` : ' — In progress'}</div></div>
        </section>

        <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-[minmax(180px,1fr)_180px_180px_auto]">
            <input id="register-payment-search" value="${escapeOrderValue(filters.search)}" onkeydown="if(event.key==='Enter') applyRegisterPaymentFilters()" placeholder="Search order ID or customer" class="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
            <select id="register-payment-method" class="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">All payment methods</option>${['cash','card','online','mixed'].map(value => `<option value="${value}" ${filters.payment_method === value ? 'selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select>
            <select id="register-payment-order-type" class="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">All order types</option><option value="dine_in" ${filters.order_type === 'dine_in' ? 'selected' : ''}>Dine-in</option><option value="takeaway" ${filters.order_type === 'takeaway' ? 'selected' : ''}>Takeaway</option><option value="delivery" ${filters.order_type === 'delivery' ? 'selected' : ''}>Delivery</option></select>
            <button id="register-payment-apply" onclick="applyRegisterPaymentFilters()" class="h-11 rounded-xl bg-indigo-600 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 disabled:opacity-60">Apply</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[820px] text-left"><thead class="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-950"><tr><th class="px-5 py-4">Order</th><th class="px-5 py-4">Context</th><th class="px-5 py-4">Method</th><th class="px-5 py-4">Received at</th><th class="px-5 py-4 text-right">Amount received</th></tr></thead><tbody id="register-payment-results" class="divide-y divide-slate-100 dark:divide-slate-800">${renderRegisterPaymentRows(rows)}</tbody></table>
          </div>
          <div id="register-payment-pagination">${renderRegisterPaymentPagination(pagination)}</div>
        </section>
      </div>`;
  } catch (error) {
    if (token !== _registerPaymentLoadToken) return;
    container.innerHTML = `<div class="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900"><h4 class="font-black text-slate-900 dark:text-white">Payments could not be loaded</h4><p class="mt-2 text-sm text-slate-500">${escapeOrderValue(error.message)}</p><button onclick="renderRegisterPaymentsPanel()" class="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">Try again</button></div>`;
  }
}

function renderRegisterPaymentRows(rows) {
  return rows.length ? rows.map(row => `<tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"><td class="px-5 py-4"><div class="font-black text-slate-900 dark:text-white">Order #${row.order_id}</div><div class="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">${escapeOrderValue(row.order_status || '—')}${row.customer_name ? ` · ${escapeOrderValue(row.customer_name)}` : ''}</div></td><td class="px-5 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">${registerPaymentContext(row)}</td><td class="px-5 py-4"><span class="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">${escapeOrderValue(row.payment_method)}</span></td><td class="px-5 py-4 text-xs font-bold text-slate-500">${registerPaymentDate(row.payment_time)}</td><td class="px-5 py-4 text-right text-sm font-black text-indigo-700 dark:text-indigo-300">${registerPaymentMoney(row.payment_amount)}</td></tr>`).join('') : `<tr><td colspan="5" class="px-6 py-16 text-center"><div class="font-black text-slate-700 dark:text-slate-200">No received payments found</div><p class="mt-2 text-sm text-slate-400">Try another shift or clear the filters.</p></td></tr>`;
}

function renderRegisterPaymentPagination(pagination) {
  return `<div class="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><p class="text-xs font-bold text-slate-400">${pagination.total ? `Showing ${(pagination.page - 1) * pagination.page_size + 1}–${Math.min(pagination.page * pagination.page_size, pagination.total)} of ${pagination.total} orders` : '0 orders'}</p><div class="flex gap-2"><button onclick="changeRegisterPaymentOrderPage(-1)" ${pagination.page <= 1 ? 'disabled' : ''} class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300">Previous</button><span class="px-3 py-2 text-xs font-black text-slate-500">${pagination.page} / ${pagination.total_pages}</span><button onclick="changeRegisterPaymentOrderPage(1)" ${pagination.page >= pagination.total_pages ? 'disabled' : ''} class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300">Next</button></div></div>`;
}

async function refreshRegisterPaymentResults() {
  const results = document.getElementById('register-payment-results');
  const paginationContainer = document.getElementById('register-payment-pagination');
  const applyButton = document.getElementById('register-payment-apply');
  if (!results || !paginationContainer || !_registerPaymentSelectedShiftId) return;
  const originalLabel = applyButton?.textContent || 'Apply';
  if (applyButton) { applyButton.disabled = true; applyButton.textContent = 'Searching…'; }
  try {
    const params = new URLSearchParams({ view: 'received_payments', shift_id: String(_registerPaymentSelectedShiftId), page: String(_registerPaymentOrderPage), page_size: '10' });
    const search = document.getElementById('register-payment-search')?.value || '';
    const paymentMethod = document.getElementById('register-payment-method')?.value || '';
    const orderType = document.getElementById('register-payment-order-type')?.value || '';
    if (search) params.set('search', search);
    if (paymentMethod) params.set('payment_method', paymentMethod);
    if (orderType) params.set('order_type', orderType);
    const data = await api(`/api/shifts/history?${params}`);
    if (!document.getElementById('register-payment-results')) return;
    results.innerHTML = renderRegisterPaymentRows(Array.isArray(data.items) ? data.items : []);
    paginationContainer.innerHTML = renderRegisterPaymentPagination(data.pagination || { page: 1, page_size: 10, total: 0, total_pages: 1 });
  } catch (error) {
    toast(error.message || 'Unable to search received payments', 'error');
  } finally {
    if (applyButton && document.body.contains(applyButton)) { applyButton.disabled = false; applyButton.textContent = originalLabel; }
  }
}

function selectRegisterPaymentShift(value) {
  _registerPaymentSelectedShiftId = Number(value) || null;
  _registerPaymentOrderPage = 1;
  renderRegisterPaymentsPanel({ keepFilters: true });
}

function selectRegisterPaymentDate(value) {
  _registerPaymentSelectedDate = value || '';
  _registerPaymentShiftPage = 1;
  _registerPaymentSelectedShiftId = null;
  _registerPaymentOrderPage = 1;
  renderRegisterPaymentsPanel();
}

function changeRegisterPaymentShiftPage(direction) {
  _registerPaymentShiftPage = Math.min(Math.max(_registerPaymentShiftPage + direction, 1), _registerPaymentShiftPages);
  _registerPaymentSelectedShiftId = null;
  _registerPaymentOrderPage = 1;
  renderRegisterPaymentsPanel();
}

function changeRegisterPaymentOrderPage(direction) {
  _registerPaymentOrderPage = Math.max(_registerPaymentOrderPage + direction, 1);
  refreshRegisterPaymentResults();
}

function applyRegisterPaymentFilters() {
  _registerPaymentOrderPage = 1;
  refreshRegisterPaymentResults();
}
