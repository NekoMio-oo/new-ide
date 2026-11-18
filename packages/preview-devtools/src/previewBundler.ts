import type { FSProvider } from '@pocketforge/runtime-bridge';
import { normalizePath } from '@pocketforge/runtime-bridge';

export interface PreviewConsoleEntry {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'result';
  text: string;
  timestamp: string;
}

export interface PreviewNetworkEntry {
  id: number;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  responsePreview: string;
}

export interface PreviewDomSummaryNode {
  tag: string;
  id: string;
  className: string;
  childCount: number;
  rect: string;
}

const DEVTOOLS_PROBE_SCRIPT = `
<script>
(function() {
  const send = (kind, payload) => {
    try {
      window.parent.postMessage({ source: 'pocketforge-preview', kind, payload }, '*');
    } catch (_) {}
  };

  const formatArg = (v) => {
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  };

  ['log', 'info', 'warn', 'error'].forEach((level) => {
    const orig = console[level];
    console[level] = function(...args) {
      send('console', { level, text: args.map(formatArg).join(' ') });
      if (orig) orig.apply(console, args);
    };
  });

  window.addEventListener('error', (e) => {
    send('console', { level: 'error', text: e.message + ' (' + (e.lineno || 1) + ')' });
  });

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || 'GET';
      const t0 = performance.now();
      try {
        const res = await origFetch.apply(this, arguments);
        const clone = res.clone();
        const bodyText = await clone.text().catch(() => '');
        send('network', {
          method,
          url: url.slice(0, 120),
          status: res.status,
          durationMs: Math.round(performance.now() - t0),
          responsePreview: bodyText.slice(0, 240)
        });
        return res;
      } catch (err) {
        send('network', {
          method,
          url: url.slice(0, 120),
          status: 0,
          durationMs: Math.round(performance.now() - t0),
          responsePreview: String(err)
        });
        throw err;
      }
    };
  }

  function snapshotDomAndStorage() {
    const nodes = Array.from(document.querySelectorAll('body, body *')).slice(0, 40).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: typeof el.className === 'string' ? el.className : '',
        childCount: el.children.length,
        rect: Math.round(r.width) + 'x' + Math.round(r.height)
      };
    });
    const storage = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) storage[k] = localStorage.getItem(k);
      }
    } catch (_) {}
    send('snapshot', { dom: nodes, storage });
  }

  window.addEventListener('load', snapshotDomAndStorage);
  document.addEventListener('click', () => setTimeout(snapshotDomAndStorage, 50));

  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.target !== 'pocketforge-preview') return;
    if (ev.data.cmd === 'eval') {
      try {
        const out = (0, eval)(ev.data.expr);
        send('console', { level: 'result', text: '<- ' + formatArg(out) });
        snapshotDomAndStorage();
      } catch (err) {
        send('console', { level: 'error', text: String(err) });
      }
    } else if (ev.data.cmd === 'inspect') {
      snapshotDomAndStorage();
    }
  });
})();
</script>
`;

/**
 * Bundles an HTML file from the offline VFS by inlining relative CSS and JS assets
 * and injecting the mobile DevTools telemetry probe.
 */
export async function buildOfflinePreviewHtml(
  fs: FSProvider,
  htmlPath: string
): Promise<string> {
  const cleanHtml = normalizePath(htmlPath);
  const baseDir = cleanHtml.includes('/') ? cleanHtml.slice(0, cleanHtml.lastIndexOf('/')) : '';
  let html = await fs.readFile(cleanHtml);

  const resolveRel = (rel: string) =>
    normalizePath(baseDir ? `${baseDir}/${rel.replace(/^\.\//, '')}` : rel.replace(/^\.\//, ''));

  // Inline local <link rel="stylesheet" href="...">
  const linkRegex = /<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
  const links = Array.from(html.matchAll(linkRegex));
  for (const m of links) {
    const href = m[1];
    if (/^https?:\/\//i.test(href)) continue;
    try {
      const cssContent = await fs.readFile(resolveRel(href));
      html = html.replace(m[0], `<style data-source="${href}">\n${cssContent}\n</style>`);
    } catch {
      // leave tag untouched if missing
    }
  }

  // Inline local <script src="...">
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+\.[mc]?js)["'][^>]*><\/script>/gi;
  const scripts = Array.from(html.matchAll(scriptRegex));
  for (const m of scripts) {
    const src = m[1];
    if (/^https?:\/\//i.test(src)) continue;
    try {
      const jsContent = await fs.readFile(resolveRel(src));
      html = html.replace(m[0], `<script data-source="${src}">\n${jsContent}\n</script>`);
    } catch {
      // leave untouched
    }
  }

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${DEVTOOLS_PROBE_SCRIPT}\n</head>`);
  } else {
    html = `${DEVTOOLS_PROBE_SCRIPT}\n${html}`;
  }
  return html;
}
