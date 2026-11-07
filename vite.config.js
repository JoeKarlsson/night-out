import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// GitHub Pages serves the site under /night-out/ until the custom domain is
// set, then under /. The deploy workflow passes the path that
// actions/configure-pages reports, so 404.html links and assets work in both.
const base = `${(process.env.BASE_PATH || '').replace(/\/$/, '')}/`;

// The CSP goes in at build time only: the dev server injects <style> tags
// that a strict style-src would block.
const csp = (styleHashes) => [
  "default-src 'self'",
  "script-src 'self' https://plausible.joekarlsson.io",
  "connect-src 'self' https://overpass-api.de https://nominatim.openstreetmap.org https://tiles.openfreemap.org https://plausible.joekarlsson.io",
  "img-src 'self' data: blob:",
  // MapLibre parses tiles in a web worker served from this site
  "worker-src 'self'",
  `style-src 'self' ${styleHashes.map((h) => `'${h}'`).join(' ')}`.trim(),
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// At build time: inline each page's small stylesheet (one less request
// before first paint on a phone) and allow exactly that <style> in the CSP.
const cspPlugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const hashes = [];
      html = html.replace(/<link rel="stylesheet"[^>]*href="[^"]*\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, file) => {
        const css = ctx.bundle?.[file]?.source;
        if (typeof css !== 'string') throw new Error(`Can't inline ${file}`);
        hashes.push(`sha256-${createHash('sha256').update(css).digest('base64')}`);
        return `<style>${css}</style>`;
      });
      return html.replace(
        '<meta name="viewport"',
        `<meta http-equiv="Content-Security-Policy" content="${csp(hashes)}">\n    <meta name="viewport"`,
      );
    },
  },
};

export default defineConfig({
  base,
  // Unknown paths 404 in preview, as on GitHub Pages (which also serves 404.html)
  appType: 'mpa',
  plugins: [cspPlugin],
  build: {
    // MapLibre is one ~300 KB gzipped chunk, loaded only when a map is shown
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), notFound: resolve(import.meta.dirname, '404.html') },
    },
  },
});
