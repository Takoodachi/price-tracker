// Runs before the app renders so there's no flash of the wrong theme.
(function () {
  var pref = 'system';
  try {
    pref = localStorage.getItem('pt-theme') || 'system';
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
