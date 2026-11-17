// Minimal Chrome DevTools driver: node cdp.mjs <url> <script.js> [timeoutSec]
// Launches headless Chrome, opens url, waits for window.state === 'ready', then evaluates script (async body) and prints its JSON result.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const [url, scriptPath, timeout = '180'] = process.argv.slice(2);
const port = 9333;
const chrome = spawn('google-chrome', [...(process.env.HEADFUL ? ['--window-position=-2400,0', '--no-first-run', '--no-default-browser-check'] : ['--headless=new']), `--remote-debugging-port=${port}`, ...(process.env.GL || '--use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu').split(' '),
  '--window-size=1200,800', '--user-data-dir=' + process.env.TMPDIR_CHROME, 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({id, method, params})); });
const evaluate = async expr => (await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true})).result;
await send('Page.navigate', {url});
const start = Date.now(); let state;
while (Date.now() - start < timeout * 1000) { state = (await evaluate('window.state'))?.result?.value; if (state === 'ready' || String(state).startsWith('error')) break; await sleep(1000); }
console.error('state', state, Math.round((Date.now() - start) / 1000) + 's');
if (state === 'ready' || process.env.FORCE) {
  await sleep(3000);
  if (process.env.PRE) { const r0 = await evaluate(`(async () => { ${readFileSync(process.env.PRE, 'utf8')} })()`); console.error('pre', JSON.stringify(r0.result?.value)); }
  if (process.env.DRAG) {
    const [x0, y0, dx] = process.env.DRAG.split(',').map(Number);
    await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1});
    for (let k = 1; k <= 12; k++) { await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: x0 + dx * k / 12, y: y0, button: 'left', buttons: 1}); await sleep(30); }
    await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: x0 + dx, y: y0, button: 'left', clickCount: 1});
    await sleep(1500);
  }
  const body = readFileSync(scriptPath, 'utf8');
  const r = await evaluate(`(async () => { ${body} })()`);
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 0));
  if (process.env.SHOT) { const s = await send('Page.captureScreenshot', {format: 'png'}); (await import('node:fs')).writeFileSync(process.env.SHOT, Buffer.from(s.result.data, 'base64')); }
}
chrome.kill();
process.exit(0);
