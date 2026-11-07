// Plausible (self-hosted, as on joekarlsson.com), skipped for bots and
// headless browsers. Also reports the 404 page and script errors as events.
(function () {
  if (navigator.webdriver || /bot|crawl|spider|scrape|headless/i.test(navigator.userAgent) || !navigator.languages || navigator.languages.length === 0) return;
  window.plausible =
    window.plausible ||
    function () {
      (window.plausible.q = window.plausible.q || []).push(arguments);
    };
  var s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = 'night-out.joekarlsson.com';
  s.src = 'https://plausible.joekarlsson.io/js/script.tagged-events.outbound-links.js';
  document.head.appendChild(s);

  if (document.body.dataset.notFound) window.plausible('404', { props: { path: location.pathname } });
  var report = function (message) {
    window.plausible('JS Error', { props: { message: String(message).slice(0, 200), path: location.pathname } });
  };
  window.addEventListener('error', function (e) {
    report(e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    report(e.reason && e.reason.message ? e.reason.message : e.reason);
  });
})();
