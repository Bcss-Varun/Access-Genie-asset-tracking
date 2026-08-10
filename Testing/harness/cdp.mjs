// A small Chrome DevTools Protocol driver.
//
// There is no Playwright/Puppeteer/chromium-cli in this container, but there is
// a Chrome binary — so this speaks CDP over a WebSocket directly. Node 20 needs
// `--experimental-websocket` for the global; the runner passes it.
//
//   const b = await Browser.launch();
//   const p = await b.page();
//   await p.nav('http://localhost:5173/assets');
//   await p.waitForText('Asset Registry');
//   await p.shot('registry');
//
// Every page collects console output and failed requests as it goes, so a test
// can assert that a screen rendered *and* that nothing threw behind it.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SHOT_DIR = fileURLToPath(new URL('../evidence/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  constructor(proc, wsUrl) { this.proc = proc; this.wsUrl = wsUrl; }

  static async launch({ port = 9333, width = 1440, height = 900 } = {}) {
    const proc = spawn('google-chrome', [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--mute-audio',
      `--window-size=${width},${height}`,
      '--user-data-dir=/tmp/ag-qa-chrome',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    // Poll the JSON endpoint rather than sleeping — startup time varies.
    let version;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) { version = await r.json(); break; }
      } catch { /* not up yet */ }
      await sleep(250);
    }
    if (!version) { proc.kill('SIGKILL'); throw new Error('Chrome did not expose a CDP endpoint'); }
    return new Browser(proc, version.webSocketDebuggerUrl);
  }

  async page(width = 1440, height = 900) {
    const p = new Page(this.wsUrl);
    await p.connect();
    await p.setViewport(width, height);
    return p;
  }

  async close() { this.proc.kill('SIGKILL'); }
}

class Page {
  constructor(browserWs) {
    this.browserWs = browserWs;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.responses = [];
  }

  async connect() {
    // Attach to a fresh target so each Page is isolated from the last.
    const bws = new WebSocket(this.browserWs);
    await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej; });
    const targetId = await new Promise((res) => {
      bws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.targetId); };
      bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
    });
    bws.close();

    this.ws = new WebSocket(this.browserWs.replace(/\/devtools\/browser\/.*$/, `/devtools/page/${targetId}`));
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });

    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        const { resolve, reject } = this.pending.get(d.id);
        this.pending.delete(d.id);
        if (d.error) reject(new Error(d.error.message));
        else resolve(d.result);
        return;
      }
      switch (d.method) {
        case 'Runtime.consoleAPICalled':
          this.console.push({ type: d.params.type, text: d.params.args.map(argText).join(' ') });
          break;
        case 'Runtime.exceptionThrown':
          this.pageErrors.push(d.params.exceptionDetails.exception?.description
            ?? d.params.exceptionDetails.text ?? 'unknown error');
          break;
        case 'Network.loadingFailed':
          this.failedRequests.push({ id: d.params.requestId, error: d.params.errorText });
          break;
        case 'Network.responseReceived':
          this.responses.push({ url: d.params.response.url, status: d.params.response.status });
          break;
      }
    };

    for (const m of ['Page.enable', 'Runtime.enable', 'Network.enable', 'DOM.enable']) await this.send(m);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
      }, 45000);
    });
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 700,
    });
  }

  /** Evaluate in page context and return the JSON value. */
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(function(){ ${expr} })()`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  }

  async nav(url) {
    await this.send('Page.navigate', { url });
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const state = await this.eval('return document.readyState');
      if (state === 'complete') return true;
      await sleep(150);
    }
    return false;
  }

  /** Poll until the page's visible text contains `text`. */
  async waitForText(text, timeout = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const found = await this.eval(
        `return (document.body && document.body.innerText || '').includes(${JSON.stringify(text)})`);
      if (found) return true;
      await sleep(200);
    }
    return false;
  }

  async waitForSelector(sel, timeout = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.eval(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true;
      await sleep(200);
    }
    return false;
  }

  /**
   * Wait for the app-wide data gate to clear.
   *
   * There are two of them in sequence: "Restoring your session…" while the
   * refresh token is exchanged, then "Loading your workspace…" until the single
   * /dataset call resolves. Asserting on page content before both have cleared
   * is just a race against the network.
   */
  async waitForGate(timeout = 45000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const t = await this.eval('return document.body ? document.body.innerText : ""');
      const gated = !t
        || t.includes('Loading your workspace')
        || t.includes('Restoring your session');
      if (!gated) return true;
      await sleep(250);
    }
    return false;
  }

  async text() { return this.eval('return document.body ? document.body.innerText : ""'); }

  async click(sel) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      el.scrollIntoView({block:'center'});
      el.click();
      return true;`);
  }

  /** Click the first element of `sel` whose text contains `label`. */
  async clickText(sel, label) {
    return this.eval(`
      const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
      const el = els.find(e => (e.innerText||e.value||'').includes(${JSON.stringify(label)}));
      if (!el) return false;
      el.scrollIntoView({block:'center'});
      el.click();
      return true;`);
  }

  /**
   * Set a React-controlled input.
   *
   * Assigning `.value` alone does not reach React — its onChange listens to the
   * synthetic event, and React's own value tracker suppresses a duplicate. The
   * native setter plus a bubbling `input` event is what actually updates state.
   */
  async fill(sel, value) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
                  : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                  : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;`);
  }

  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(SHOT_DIR, `${name}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    return file;
  }

  /** Console entries that indicate something broke. */
  errors() {
    return [
      ...this.pageErrors,
      ...this.console.filter((c) => c.type === 'error').map((c) => c.text),
    ];
  }

  clearLogs() { this.console = []; this.pageErrors = []; this.failedRequests = []; this.responses = []; }

  async close() { try { this.ws.close(); } catch { /* already gone */ } }
}

function argText(a) {
  if (a.value !== undefined) return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
  return a.description ?? a.unserializableValue ?? a.type;
}
