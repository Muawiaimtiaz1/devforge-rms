// WebSockets only invalidate local views. HTTP remains the authoritative data source.
(() => {
  if (typeof window.io !== 'function') return;
  let refreshTimer = null;
  let staleWhileHidden = false;

  function setStatus(state) {
    document.querySelectorAll('[data-realtime-status]').forEach(element => {
      const labels = { live: 'Live', reconnecting: 'Reconnecting', offline: 'Offline' };
      const label = element.querySelector('[data-realtime-label]');
      if (label) label.textContent = labels[state] || state;
      element.classList.toggle('text-emerald-600', state === 'live');
      element.classList.toggle('text-amber-600', state === 'reconnecting');
      element.classList.toggle('text-rose-600', state === 'offline');
    });
  }

  async function refreshActiveOrderView() {
    if (document.hidden) { staleWhileHidden = true; return; }
    if (typeof _currentPage !== 'undefined' && _currentPage === 'kds' && typeof loadKDSOrders === 'function') {
      await loadKDSOrders();
    } else if (typeof isPOSOrdersViewActive === 'function' && isPOSOrdersViewActive()) {
      await renderPOSOrders();
    }
  }

  function scheduleRefresh() {
    if (document.hidden) { staleWhileHidden = true; return; }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshTimer = null; void refreshActiveOrderView(); }, 250);
  }

  const socket = window.io({ path: '/socket.io', withCredentials: true });
  window.orderRealtimeSocket = socket;
  setStatus('reconnecting');
  socket.on('connect', () => setStatus('live'));
  socket.on('realtime:ready', () => { setStatus('live'); scheduleRefresh(); });
  socket.on('order:changed', scheduleRefresh);
  socket.on('disconnect', reason => setStatus(reason === 'io server disconnect' ? 'offline' : 'reconnecting'));
  socket.on('connect_error', error => setStatus(error?.data?.code === 'UNAUTHORIZED' ? 'offline' : 'reconnecting'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && staleWhileHidden) { staleWhileHidden = false; scheduleRefresh(); }
  });
})();
