let deferredPWAInstallPrompt = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPWAInstallPrompt = event;
  refreshPWAButton();
});

function pwaIsStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function refreshPWAButton() {
  const button = document.getElementById('pwa-device-btn');
  if (!button) return;
  button.classList.remove('hidden');
  const enabled = 'Notification' in window && Notification.permission === 'granted';
  button.title = `${pwaIsStandalone() ? 'App installed' : 'Install app'} · Notifications ${enabled ? 'enabled' : 'disabled'}`;
  button.classList.toggle('text-emerald-600', enabled);
}

async function installRMSApp() {
  if (deferredPWAInstallPrompt) {
    await deferredPWAInstallPrompt.prompt();
    await deferredPWAInstallPrompt.userChoice;
    deferredPWAInstallPrompt = null;
  } else if (!pwaIsStandalone()) {
    toast('On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app.', 'info');
  }
  refreshPWAButton();
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function enableRMSNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push notifications are not supported on this device.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await fetch('/api/notifications/push/public-key');
  if (!keyResponse.ok) throw new Error('Could not load notification configuration.');
  const { publicKey } = await keyResponse.json();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const response = await fetch('/api/notifications/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), device_name: navigator.userAgent }),
  });
  if (!response.ok) throw new Error((await response.json()).error || 'Could not register this device.');
  toast('Notifications enabled for this device.', 'success');
  refreshPWAButton();
  await loadRMSPushStatus();
}

async function disableRMSNotifications() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await fetch('/api/notifications/push/unsubscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
  }
  toast('Notifications disabled on this device.', 'success');
  refreshPWAButton();
  await loadRMSPushStatus();
}

function openPWASetup() {
  openModal('Install App & Notifications', `<div class="space-y-4"><div id="rms-push-status" class="p-3 rounded-xl bg-amber-50 text-amber-700 text-sm font-bold">Checking this device...</div><p class="text-sm text-slate-500">Install RMS on this device for an app-like experience, then enable order alerts.</p><button onclick="installRMSApp()" class="w-full h-12 rounded-xl bg-indigo-600 text-white font-black">Install RMS App</button><button onclick="enableRMSNotifications().catch(e => { toast(e.message, 'error'); loadRMSPushStatus(e.message); })" class="w-full h-12 rounded-xl bg-emerald-600 text-white font-black">Enable Notifications</button><button onclick="sendRMSTestNotification()" class="w-full h-12 rounded-xl bg-orange-500 text-white font-black">Send Test Notification</button><button onclick="disableRMSNotifications().catch(e => toast(e.message, 'error'))" class="w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white font-black">Disable on This Device</button><p class="text-xs text-slate-400">iPhone requires Add to Home Screen before Web Push can be enabled. Notification sound and vibration are controlled by phone settings.</p></div>`);
  loadRMSPushStatus();
}

async function loadRMSPushStatus(errorMessage = '') {
  const box = document.getElementById('rms-push-status');
  if (!box) return;
  if (errorMessage) {
    box.className = 'p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-bold';
    box.textContent = `Not registered: ${errorMessage}`;
    return;
  }
  try {
    const response = await fetch('/api/notifications/push/status');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Status check failed');
    box.className = `p-3 rounded-xl text-sm font-bold ${data.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`;
    box.textContent = data.enabled ? `Registered: ${data.devices.length} notification device(s)` : 'Not registered for RMS notifications';
  } catch (error) {
    box.className = 'p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-bold';
    box.textContent = error.message;
  }
}

async function sendRMSTestNotification() {
  try {
    const response = await fetch('/api/notifications/push/test', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Test notification failed');
    toast(`Test sent to ${data.devices} device(s).`, 'success');
  } catch (error) { toast(error.message, 'error'); loadRMSPushStatus(error.message); }
}

function playOrderReadyBeep() {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.28].forEach(delay => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.2);
    });
  } catch (_) {}
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(() => refreshPWAButton()).catch(console.error);
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'RMS_PUSH') return;
    playOrderReadyBeep();
    const payload = event.data.payload || {};
    toast(payload.body || payload.title || 'New notification', 'success');
    if (typeof updateNotificationTopbarBadge === 'function') updateNotificationTopbarBadge();
  });
}
document.addEventListener('DOMContentLoaded', refreshPWAButton);
