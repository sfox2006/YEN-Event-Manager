import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const appSource = fs.readFileSync(new URL('js/app.js', root), 'utf8');
const workerSource = fs.readFileSync(new URL('service-worker.js', root), 'utf8');

function pngSize(relativePath) {
  const buffer = fs.readFileSync(new URL(relativePath, root));
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('web app manifest contains installable GitHub Pages metadata', () => {
  assert.equal(manifest.name, 'YEN Event Manager');
  assert.equal(manifest.start_url, './#/dashboard');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#12304a');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
});

test('phone icons are present at their declared square dimensions', () => {
  assert.deepEqual(pngSize('assets/icons/apple-touch-icon.png'), { width: 180, height: 180 });
  assert.deepEqual(pngSize('assets/icons/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(pngSize('assets/icons/icon-512.png'), { width: 512, height: 512 });
  assert.deepEqual(pngSize('assets/icons/icon-maskable-512.png'), { width: 512, height: 512 });
});

test('HTML advertises the manifest, theme and Apple touch icon', () => {
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /name="theme-color" content="#12304a"/);
  assert.match(html, /rel="apple-touch-icon"[^>]+apple-touch-icon\.png/);
  assert.match(appSource, /navigator\.serviceWorker\.register\('\.\/service-worker\.js'\)/);
});

test('service worker caches the interface but ignores Apps Script and all cross-origin data', async () => {
  const listeners = {};
  let cachedShell = [];
  const cache = { addAll: async items => { cachedShell = items; }, put: async () => {} };
  const context = vm.createContext({
    console,
    URL,
    Promise,
    fetch: async request => ({ ok: true, clone: () => ({}), request }),
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined
    },
    self: {
      location: { origin: 'https://sfox2006.github.io' },
      clients: { claim: () => {} },
      skipWaiting: () => {},
      addEventListener: (name, handler) => { listeners[name] = handler; }
    }
  });
  vm.runInContext(workerSource, context);

  let installPromise;
  listeners.install({ waitUntil: promise => { installPromise = promise; } });
  await installPromise;
  assert.ok(cachedShell.includes('./index.html'));
  assert.ok(cachedShell.includes('./manifest.webmanifest'));

  let crossOriginHandled = false;
  listeners.fetch({
    request: { method: 'GET', mode: 'cors', url: 'https://script.google.com/macros/s/example/exec?action=bootstrap' },
    respondWith: () => { crossOriginHandled = true; }
  });
  assert.equal(crossOriginHandled, false);

  let sameOriginHandled = false;
  listeners.fetch({
    request: { method: 'GET', mode: 'cors', url: 'https://sfox2006.github.io/YEN-Event-Manager/css/styles.css' },
    respondWith: () => { sameOriginHandled = true; }
  });
  assert.equal(sameOriginHandled, true);
});
