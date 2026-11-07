import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// GitHub Pages serves the site under /night-out/ until the custom domain is
// set, then under /. The deploy workflow passes the path that
// actions/configure-pages reports, so 404.html links and assets work in both.
const base = `${(process.env.BASE_PATH || '').replace(/\/$/, '')}/`;

// The CSP goes in at build time only: the dev server injects <style> tags
// that a strict style-src would block.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://plausible.joekarlsson.io",
  "connect-src 'self' https://overpass-api.de https://plausible.joekarlsson.io",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "style-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const cspPlugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<meta name="viewport"',
      `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="viewport"`,
    );
  },
};

export default defineConfig({
  base,
  // Unknown paths 404 in preview, as on GitHub Pages (which also serves 404.html)
  appType: 'mpa',
  plugins: [cspPlugin],
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), notFound: resolve(import.meta.dirname, '404.html') },
    },
  },
});
