'use strict';

// Real browser + application + disposable database. No payment app is opened,
// no money is moved, and the owner's bank-credit confirmation is test input.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const original = path.join(root, 'database.db');
const hash = async () => crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex');
const password = 'Direct-UPI-E2E-Only-Password-92!';
let child, browser, scratch, before;

(async () => {
  before = await hash(); scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'alagar-upi-browser-'));
  const database = path.join(scratch, 'database.db'); await fs.copyFile(original, database);
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_PATH: database, APP_ORIGIN: base,
    ADMIN_ID: 'upi-e2e-owner', ADMIN_PHONE: '', ADMIN_PASSWORD: password, UPI_ID: 'e2e-fixture@oksbi', UPI_PAYEE_NAME: 'Alagar Automobiles',
    GOOGLE_CLIENT_ID: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_VERIFY_SERVICE_SID: '', TWILIO_FROM_NUMBER: '', TWILIO_MESSAGING_SERVICE_SID: '',
    RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '', OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', x => logs += x); child.stderr.on('data', x => logs += x);
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw Error(logs);
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    if (i === 149) throw Error(logs);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  async function request(endpoint, body, cookie = '', method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + endpoint, { method, headers: { Origin: base, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.ok(response.ok, endpoint + ': ' + JSON.stringify(data));
    return { data, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
  }
  const owner = (await request('/auth/admin-login', { identifier: 'upi-e2e-owner', password })).cookie;
  const product = (await request('/products', { display_name: 'Disposable UPI E2E part', category: 'E2E', price: 125.25, stock_quantity: 6 }, owner)).data;
  const order = (await request('/orders', { name: 'Disposable UPI E2E customer', phone: '9990000006', address: 'Disposable fixture address', delivery: 'bus', items: [{ id: product.id, qty: 2 }] })).data;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/payments/upi/')) calls.push({ url: r.url(), body: r.postDataJSON() }); });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base + '/track-order.html');
  await page.evaluate(value => localStorage.setItem('aamm_order_refs', JSON.stringify([value])), { reference: order.reference, tracking_token: order.tracking_token });
  await page.reload(); await page.locator('[data-ref-index="0"]').click();
  await page.locator('#trackResult .tracking-panel').waitFor();
  assert.equal(await page.locator('[data-upi-pay]').count(), 0, 'Unconfirmed enquiry has no pay button');
  await request('/admin/orders/' + order.id, { status: 'Order Confirmed', delivery_charges: 49.75 }, owner, 'PATCH');
  await page.locator('[data-ref-index="0"]').click();
  await page.locator('[data-upi-pay]').click(); await page.locator('#upiPaymentForm').waitFor();
  assert.match(await page.locator('.upi-payment-total').innerText(), /300\.25/);
  assert.equal(await page.locator('.upi-id').innerText(), 'e2e-fixture@oksbi');
  const intent = new URL(await page.locator('#upiOpenApp').getAttribute('href'));
  assert.equal(intent.searchParams.get('pa'), 'e2e-fixture@oksbi'); assert.equal(intent.searchParams.get('am'), '300.25');
  assert.ok(!intent.href.includes(order.tracking_token));
  await page.locator('.upi-qr-option summary').click();
  assert.equal(await page.locator('.upi-qr').evaluate(node => node.complete && node.naturalWidth > 100), true, 'Real QR image loads locally');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#upiPaymentForm [name=transaction_reference]').fill('611400000090');
  await page.locator('#upiLanguageToggle').click();
  assert.equal(await page.locator('#upiPaymentForm [name=transaction_reference]').inputValue(), '611400000090');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#upiPaymentForm button[type=submit]').click();
  await page.locator('#upiPaymentStatus').waitFor();
  assert.equal(await page.locator('#upiPaymentForm').count(), 0);
  const pending = (await request('/tracking-guest', { reference: order.reference, token: order.tracking_token })).data;
  assert.equal(pending.payment_status, 'manual_submitted'); assert.equal(pending.bills.filter(b => b.kind === 'receipt').length, 0);
  assert.equal((await request('/products/' + product.id)).data.stock_quantity, 6);
  await page.keyboard.press('Escape');
  await request(`/admin/orders/${order.id}/upi/confirm`, { transaction_reference: '611400000090', amount: 30025, received: true }, owner);
  await page.locator('[data-ref-index="0"]').click();
  await page.locator('[data-guest-bill="receipt"]').waitFor();
  assert.equal(await page.locator('[data-upi-pay]').count(), 0);
  const popupPromise = page.waitForEvent('popup'); await page.locator('[data-guest-bill="receipt"]').click(); const popup = await popupPromise;
  await popup.waitForFunction(() => document.body.textContent.includes('611400000090'));
  assert.match(await popup.locator('body').innerText(), /owner|staff|manually/i);
  assert.equal((await request('/products/' + product.id)).data.stock_quantity, 4);
  assert.equal(calls.length, 2, 'One real details request and one claim request');
  calls.forEach(call => { assert.ok(!call.url.includes(order.tracking_token)); assert.equal(call.body.token, order.tracking_token); });
  assert.deepEqual(errors, []);
  console.log('PASS real direct UPI flow: enquiry→owner confirmation→exact-amount local QR/intent→guest UTR→pending, then owner-confirmed receipt and stock once; Tamil/mobile fit and tokens remain POST-only.');
  console.log('No payment app or bank was contacted. Bank credit confirmation was an isolated test fixture.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (child?.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  if (before) assert.equal(await hash(), before, 'Original database unchanged');
  if (scratch) await fs.rm(scratch, { recursive: true, force: true });
});
