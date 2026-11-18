import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8');

// Runs analytics.js against a stand-in window and returns what it queued and loaded.
function loadAnalytics({ userAgent = 'Mozilla/5.0 (Macintosh)', notFound } = {}) {
  const listeners = {};
  const appended = [];
  const window = {
    navigator: { webdriver: false, userAgent, languages: ['en-US'] },
    location: { pathname: '/' },
    document: {
      body: { dataset: { notFound } },
      head: { appendChild: (element) => appended.push(element) },
      createElement: () => ({ dataset: {} }),
    },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
  };
  window.window = window;
  vm.runInNewContext(source, window);
  const events = () => JSON.parse(JSON.stringify((window.plausible.q || []).map((args) => [...args])));
  return { window, listeners, appended, events };
}

test('bots get the queue stub but no Plausible script', () => {
  const { window, appended } = loadAnalytics({ userAgent: 'Googlebot/2.1' });
  assert.equal(typeof window.plausible, 'function');
  assert.equal(appended.length, 0);
});

test('the 404 page sends its path', () => {
  const { events } = loadAnalytics({ notFound: 'true' });
  assert.deepEqual(events(), [['404', { props: { path: '/' } }]]);
});

test('only the first script error on a page is reported, extension errors never', () => {
  const { listeners, events } = loadAnalytics();
  listeners.error({ message: 'boom', filename: 'chrome-extension://abc/content.js', lineno: 3 });
  listeners.unhandledrejection({ reason: new Error("Failed to create 'TrustedTypePolicy' named 'ext'") });
  listeners.error({ message: 'x is undefined', filename: 'https://night-out.joekarlsson.com/assets/main.js', lineno: 12 });
  listeners.error({ message: 'second', filename: 'https://night-out.joekarlsson.com/assets/main.js', lineno: 20 });
  assert.deepEqual(events(), [
    ['JS Error', { props: { message: 'x is undefined', source: 'https://night-out.joekarlsson.com/assets/main.js:12', path: '/' } }],
  ]);
});
