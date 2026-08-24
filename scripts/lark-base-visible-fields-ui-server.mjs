#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const browserFile = resolve(__dirname, 'lark-base-visible-fields-ui.browser.js');
const contractFile = resolve(repoRoot, 'deploy/lark-base-ux-contract.json');
const sdkRoot = resolve(repoRoot, 'node_modules/@lark-base-open/js-sdk/dist');
const host = process.env.LARK_BASE_UI_HOST || '127.0.0.1';
const port = Number(process.env.LARK_BASE_UI_PORT || 4173);

await assertFile(browserFile, 'browser runner');
await assertFile(contractFile, 'UX contract');
await assertFile(resolve(sdkRoot, 'index.mjs'), 'Base JS SDK; run npm install first');

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Access-Control-Allow-Origin', '*');

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      send(response, 200, 'text/html; charset=utf-8', renderHtml());
      return;
    }
    if (url.pathname === '/app.js') {
      send(response, 200, 'text/javascript; charset=utf-8', await readFile(browserFile, 'utf8'));
      return;
    }
    if (url.pathname === '/contract.json') {
      send(response, 200, 'application/json; charset=utf-8', await readFile(contractFile, 'utf8'));
      return;
    }
    if (url.pathname === '/health') {
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, service: 'lark-base-visible-fields-ui', sdk: '@lark-base-open/js-sdk@1.0.2' }));
      return;
    }
    if (url.pathname.startsWith('/sdk/')) {
      const relative = normalize(url.pathname.slice('/sdk/'.length)).replace(/^([/\\])+/, '');
      const target = resolve(sdkRoot, relative);
      if (target !== sdkRoot && !target.startsWith(`${sdkRoot}${sep}`)) {
        send(response, 403, 'text/plain; charset=utf-8', 'Forbidden');
        return;
      }
      const body = await readFile(target);
      send(response, 200, mimeType(target), body);
      return;
    }
    send(response, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    send(response, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({
    ok: true,
    stage: 'lark_base_visible_fields_ui_server',
    status: 'READY',
    url: `http://${host}:${port}`,
    instruction: 'Open this URL from Lark Base > Add script, then click Apply visible fields.',
  }, null, 2));
});

function send(response, status, contentType, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.end(body);
}

function mimeType(path) {
  switch (extname(path)) {
    case '.mjs':
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

async function assertFile(path, label) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error();
  } catch {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function renderHtml() {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LINE OA Sales CRM — View Visible Fields</title>
  <style>
    body{font-family:Inter,system-ui,sans-serif;margin:24px;background:#f7f8fa;color:#1f2329}
    .card{max-width:860px;margin:auto;background:#fff;border:1px solid #dee0e3;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(31,35,41,.08)}
    h1{margin-top:0} button{border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;margin-right:8px}
    #apply{background:#1456f0;color:#fff} #inspect{background:#eff0f1;color:#1f2329}
    pre{white-space:pre-wrap;background:#111827;color:#e5e7eb;padding:16px;border-radius:12px;max-height:60vh;overflow:auto}
    .note{color:#646a73}.ok{color:#00a870}.warn{color:#d46b08}
  </style>
</head>
<body>
  <div class="card">
    <h1>✨ Premium View Visible Fields</h1>
    <p>แก้เฉพาะการแสดง/ซ่อน Field ของ 22 Views ใน Base นี้ด้วย Base JS SDK โดยตรง ไม่แตะ Table, Field schema หรือ Record</p>
    <p class="note">ใช้หลังจาก CLI สร้างชื่อ View แล้ว หาก API visible_fields ไม่ persist ให้ใช้หน้านี้แทน</p>
    <button id="apply">Apply visible fields</button>
    <button id="inspect">Inspect only</button>
    <p id="status">Ready</p>
    <pre id="output"></pre>
  </div>
  <script type="module" src="/app.js"></script>
</body>
</html>`;
}
