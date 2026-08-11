(function () {
  function dismissLaunchScreen() {
    const screen = document.getElementById('app-launch-screen');
    if (!screen || screen.dataset.closing) return;
    screen.dataset.closing = 'true';
    screen.classList.add('app-launch--hidden');
    window.setTimeout(() => screen.remove(), 480);
  }

  const minimumDisplayTime = new Promise(resolve => window.setTimeout(resolve, 850));
  const pageReady = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));

  Promise.all([minimumDisplayTime, pageReady]).then(dismissLaunchScreen);
  window.setTimeout(dismissLaunchScreen, 3500);
}());
