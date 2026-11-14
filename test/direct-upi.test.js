'use strict';

// Real application routes with disposable records. No UPI transaction is sent.
// Customer sessions are seeded only in the temporary SQLite database; provider
// calls, when tested, use a child-process preload with explicit fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sqlite3 = require('sqlite3');
const root = path.resolve(__dirname, '..');
const original = path.join(root, 'database.db');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const ownerPassword = 'Temporary-Direct-UPI-Test-Password-92!';
const fixtureVpa = 'shop-fixture@oksbi';
const providerSecret = 'temporary-direct-upi-provider-fixture-secret';

async function sql(file, query, values = []) {
  const db = await new Promise((resolve, reject) => {
    const opened = new sqlite3.Database(file, error => error ? reject(error) : resolve(opened));
  });
  try { return await new Promise((resolve, reject) => db.all(query, values, (error, rows) => error ? reject(error) : resolve(rows))); }
  finally { await new Promise(resolve => db.close(resolve)); }
}

async function launch(t, overrides = {}) {
  const originalHash = digest(await fs.readFile(original));
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'alagar-direct-upi-'));
  const database = path.join(scratch, 'database.db');
  await fs.copyFile(original, database);
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const preload = path.join(scratch, 'providers.cjs');
  await fs.writeFile(preload, `let sequence=0;const orders=new Map();
    global.fetch=async(url,options={})=>{
      const json=value=>({ok:true,status:200,json:async()=>value});
      if(String(url)==='https://api.razorpay.com/v1/orders'){
        const body=JSON.parse(options.body);const value={id:'order_UpiFixture'+(++sequence),amount:body.amount,currency:'INR',status:'created'};orders.set(value.id,value);return json(value);
      }
      if(String(url).startsWith('https://api.razorpay.com/v1/payments/')){
        const id=String(url).split('/').pop();const order=Array.from(orders.values()).at(-1);return json({id,order_id:order.id,amount:order.amount,currency:'INR',captured:true,status:'captured'});
      }
      throw new Error('Unexpected external request in isolated direct UPI test');
    };`);
  const child = spawn(process.execPath, ['--require', preload, 'server.js'], {
    cwd: root, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), APP_ORIGIN: base, DB_PATH: database,
      ADMIN_ID: '9344898473', ADMIN_PHONE: '9344898473', ADMIN_PASSWORD: ownerPassword,
      UPI_ID: fixtureVpa, UPI_PAYEE_NAME: 'Alagar Automobiles', GOOGLE_CLIENT_ID: '',
      TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_VERIFY_SERVICE_SID: '', TWILIO_FROM_NUMBER: '', TWILIO_MESSAGING_SERVICE_SID: '',
      RAZORPAY_KEY_ID: 'rzp_test_upi_fixture', RAZORPAY_KEY_SECRET: providerSecret, RAZORPAY_WEBHOOK_SECRET: 'upi-fixture-webhook', OPENAI_API_KEY: '', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  t.after(async () => {
    if (child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
    assert.equal(digest(await fs.readFile(original)), originalHash, 'Original database must remain byte-identical');
    await fs.rm(scratch, { recursive: true, force: true });
  });
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw Error(output);
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    if (i === 149) throw Error('Disposable server did not start: ' + output);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  async function request(url, body, cookie = '', method = body === undefined ? 'GET' : 'POST', headers = {}) {
    const response = await fetch(base + url, { method, headers: { Origin: base, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
  }
  const logged = await request('/auth/admin-login', { identifier: '9344898473', password: ownerPassword });
  assert.equal(logged.response.status, 200);
  const admin = logged.cookie;
  async function seedCustomer(sub, contact) {
    await sql(database, 'INSERT INTO users(google_sub,google_email,name,contact_phone) VALUES (?,?,?,?)', [sub, `${sub}@example.invalid`, sub, contact]);
    const user = (await sql(database, 'SELECT id FROM users WHERE google_sub=?', [sub]))[0];
    const token = crypto.randomBytes(32).toString('hex');
    await sql(database, 'INSERT INTO sessions(token_hash,phone,role,expires_at,user_id,auth_provider) VALUES (?,?,?,?,?,?)', [digest(token), `google:${user.id}`, 'customer', Date.now() + 3600000, user.id, 'google']);
    return `aamm_session=${token}`;
  }
  const alice = await seedCustomer('upi-alice', '9990000001');
  const bob = await seedCustomer('upi-bob', '9990000001');
  let sequence = 0;
  async function order(options = {}) {
    const product = await request('/products', { display_name: 'Isolated UPI test part ' + (++sequence), category: 'Test fixture', price: options.price ?? 125.25, stock_quantity: options.stock === undefined ? 8 : options.stock }, admin);
    assert.equal(product.response.status, 201);
    const created = await request('/orders', { name: 'UPI Test Customer', phone: '9990000001', address: options.delivery ? 'Test delivery address' : '', delivery: options.delivery ?? 'pickup', items: [{ id: product.data.id, qty: 2 }], idempotency_key: 'direct-upi-fixture-' + sequence }, options.guest ? '' : alice);
    assert.equal(created.response.status, 201);
    if (options.confirm !== false) {
      const confirmed = await request('/admin/orders/' + created.data.id, { status: 'Order Confirmed', ...(options.delivery ? { delivery_charges: options.deliveryCharge ?? 49.75 } : {}) }, admin, 'PATCH');
      assert.equal(confirmed.response.status, 200, JSON.stringify(confirmed.data));
    }
    return { ...created.data, product_id: product.data.id, expected: Math.round(((options.price ?? 125.25) * 2 + (options.delivery ? options.deliveryCharge ?? 49.75 : 0)) * 100) };
  }
  const details = (o, cookie = alice, extra = {}) => request('/payments/upi/details', { reference: o.reference, ...extra }, cookie);
  const submit = (o, ref, cookie = alice, extra = {}) => request('/payments/upi/submit', { reference: o.reference, transaction_reference: ref, ...extra }, cookie);
  const confirm = (o, ref, extra = {}) => request(`/admin/orders/${o.id}/upi/confirm`, { transaction_reference: ref, amount: o.expected, received: true, ...extra }, admin);
  return { request, database, admin, alice, bob, order, details, submit, confirm };
}

test('direct UPI preserves ownership and requires an actual owner bank confirmation', { timeout: 60000 }, async t => {
  const s = await launch(t);
  let settledOrder;
  await t.test('server produces exact receiving VPA, local QR and immutable invoice amount including delivery', async () => {
    const config = await s.request('/api/config'); assert.equal(config.data.direct_upi.configured, true); assert.equal(config.data.features.direct_upi, true);
    const o = await s.order({ delivery: 'bus' }); settledOrder = o;
    const result = await s.details(o); assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    assert.equal(result.data.amount, 30025); assert.equal(result.data.currency, 'INR'); assert.equal(result.data.upi_id, fixtureVpa);
    const uri = new URL(result.data.upi_uri); assert.equal(uri.protocol, 'upi:'); assert.equal(uri.hostname, 'pay'); assert.equal(uri.searchParams.get('pa'), fixtureVpa);
    assert.equal(uri.searchParams.get('am'), '300.25'); assert.equal(uri.searchParams.get('cu'), 'INR');
    assert.match(result.data.qr_data_url, /^data:image\/png;base64,/); assert.ok(Buffer.from(result.data.qr_data_url.split(',')[1], 'base64').length > 100);
    assert.equal((await sql(s.database, "SELECT COUNT(*) count FROM billing_documents WHERE order_id=? AND kind='receipt'", [o.id]))[0].count, 0);
    await s.request('/products/' + o.product_id, { price: 500 }, s.admin, 'PUT');
    assert.equal((await s.details(o)).data.amount, 30025, 'An issued invoice freezes its prices');
  });
  await t.test('unconfirmed/unknown stock cannot request payment; shared contact phone grants no ownership', async () => {
    const o = await s.order({ confirm: false }); assert.equal((await s.details(o)).response.status, 409);
    const unknown = await s.order({ stock: null }); assert.equal((await s.details(unknown)).response.status, 409);
    assert.ok([401, 404].includes((await s.details(settledOrder, '')).response.status));
    assert.equal((await s.details(settledOrder, s.bob)).response.status, 404);
    assert.equal((await s.submit(settledOrder, '611400000001', s.bob)).response.status, 404);
    assert.equal((await s.request(`/admin/orders/${settledOrder.id}/upi/confirm`, { amount: settledOrder.expected, transaction_reference: '611400000001', received: true }, s.alice)).response.status, 401);
    assert.equal((await s.details(settledOrder, s.alice, { token: '0'.repeat(64) })).response.status, 200, 'Authenticated owner does not need a guest token');
    const cross = await s.request('/payments/upi/details', { reference: settledOrder.reference }, s.alice, 'POST', { Origin: 'https://other.invalid' }); assert.equal(cross.response.status, 403);
  });
  await t.test('customer claim remains unpaid with no receipt, stock movement or sale', async () => {
    const o = settledOrder;
    const beforeSales = (await sql(s.database, 'SELECT COUNT(*) count FROM sales'))[0].count;
    for (const invalid of ['short', '123', '12345678901x', '<script>']) assert.equal((await s.submit(o, invalid)).response.status, 400);
    const claimed = await s.submit(o, '611400000001'); assert.ok([200, 201, 202].includes(claimed.response.status), JSON.stringify(claimed.data));
    assert.equal((await s.request('/products/' + o.product_id)).data.stock_quantity, 8);
    assert.equal((await sql(s.database, 'SELECT COUNT(*) count FROM sales'))[0].count, beforeSales);
    assert.equal((await sql(s.database, "SELECT COUNT(*) count FROM billing_documents WHERE order_id=? AND kind='receipt'", [o.id]))[0].count, 0);
    assert.equal((await sql(s.database, 'SELECT payment_status FROM orders WHERE id=?', [o.id]))[0].payment_status, 'manual_submitted');
    assert.equal((await s.request('/billing/guest', { reference: o.reference, token: o.tracking_token, type: 'receipt' })).response.status, 404);
  });
  await t.test('owner must affirm actual receipt and exact amount; duplicate confirmations book once', async () => {
    const o = settledOrder;
    assert.equal((await s.confirm(o, '611400000001', { received: false })).response.status, 400);
    assert.equal((await s.confirm(o, '611400000001', { amount: o.expected - 1 })).response.status, 409);
    assert.ok([400, 409].includes((await s.confirm(o, 'bad')).response.status));
    const beforeSales = (await sql(s.database, 'SELECT COUNT(*) count FROM sales'))[0].count;
    const results = await Promise.all([s.confirm(o, '611400000001'), s.confirm(o, '611400000001')]);
    results.forEach(result => assert.equal(result.response.status, 200, JSON.stringify(result.data)));
    assert.equal((await s.request('/products/' + o.product_id)).data.stock_quantity, 6);
    assert.equal((await sql(s.database, 'SELECT COUNT(*) count FROM sales'))[0].count, beforeSales + 1);
    assert.equal((await sql(s.database, 'SELECT payment_status FROM orders WHERE id=?', [o.id]))[0].payment_status, 'manual_verified');
    const receipt = (await s.request('/my/bills', undefined, s.alice)).data.find(x => x.order_id === o.id && x.kind === 'receipt'); assert.ok(receipt);
    const printed = await s.request(receipt.print_url, undefined, s.alice); assert.equal(printed.response.status, 200); assert.match(printed.data, /611400000001/);
    const renderedMarkup = printed.data.split('<script>')[0];
    assert.match(renderedMarkup, /owner|staff|manually/i); assert.doesNotMatch(renderedMarkup, /This receipt records the captured payment verified by the payment provider/);
    assert.equal((await s.request(receipt.print_url, undefined, s.bob)).response.status, 404);
    const snapshot = JSON.parse((await sql(s.database, "SELECT snapshot FROM billing_documents WHERE order_id=? AND kind='receipt'", [o.id]))[0].snapshot);
    assert.equal(snapshot.total, 300.25); assert.equal(snapshot.payment.status, 'manual_verified');
    await assert.rejects(sql(s.database, "UPDATE billing_documents SET total_paise=1 WHERE order_id=? AND kind='receipt'", [o.id]), /immutable/);
    const overview = await s.request('/admin/overview', undefined, s.admin); assert.ok(overview.data.verified_revenue >= 300.25);
    const audit = (await s.request('/admin/audit', undefined, s.admin)).data; assert.ok(audit.some(row => row.entity_id === String(o.id) && /upi|manual/.test(row.action)));
  });
  await t.test('same verified UTR cannot settle another order; rejected claims can be corrected', async () => {
    const o = await s.order();
    assert.ok((await s.submit(o, '611400000001')).response.status < 500);
    assert.equal((await s.confirm(o, '611400000001')).response.status, 409);
    await s.submit(o, '611400000002');
    const rejected = await s.request(`/admin/orders/${o.id}/upi/reject`, { reason: 'No credit matching the submitted reference' }, s.admin); assert.equal(rejected.response.status, 200, JSON.stringify(rejected.data));
    assert.equal((await sql(s.database, "SELECT COUNT(*) count FROM billing_documents WHERE order_id=? AND kind='receipt'", [o.id]))[0].count, 0);
    assert.ok((await s.submit(o, '611400000003')).response.status < 300);
    assert.equal((await s.confirm(o, '611400000003')).response.status, 200);
    assert.equal((await s.request('/products/' + o.product_id)).data.stock_quantity, 6);
  });
  await t.test('guest token grants only its order; no tokens in intent or QR', async () => {
    const o = await s.order({ guest: true });
    assert.ok([400, 401, 404].includes((await s.details(o, '', { token: '0'.repeat(64) })).response.status));
    const payload = { token: o.tracking_token };
    const details = await s.details(o, '', payload); assert.equal(details.response.status, 200);
    assert.ok(!details.data.upi_uri.includes(o.tracking_token));
    assert.equal((await s.details(o, s.bob, payload)).response.status, 200, 'Signing in later must preserve valid private guest receipt access');
    assert.equal((await s.details(o, s.bob, { token: '0'.repeat(64) })).response.status, 404);
    assert.equal((await s.submit(o, '611400000004', s.bob, { token: '0'.repeat(64) })).response.status, 404);
    assert.ok((await s.submit(o, '611400000004', s.bob, payload)).response.status < 300, 'Valid guest token also authorizes a later signed-in customer');
    assert.equal((await s.confirm(o, '611400000004')).response.status, 200);
    const bill = await s.request('/billing/guest', { reference: o.reference, token: o.tracking_token, type: 'receipt' }); assert.equal(bill.response.status, 200);
    assert.equal((await s.request('/billing/guest', { reference: o.reference, token: settledOrder.tracking_token, type: 'receipt' })).response.status, 404);
  });
  await t.test('owner can record received credit after stock changes without negative stock or fabricated sale', async () => {
    const o = await s.order(); await s.details(o); await s.submit(o, '611400000005');
    await s.request('/products/' + o.product_id, { stock_quantity: 0, stock_reason: 'Test concurrent sale' }, s.admin, 'PUT');
    const sales = (await sql(s.database, 'SELECT COUNT(*) count FROM sales'))[0].count;
    const result = await s.confirm(o, '611400000005'); assert.equal(result.response.status, 200, JSON.stringify(result.data));
    assert.equal((await sql(s.database, 'SELECT payment_status FROM orders WHERE id=?', [o.id]))[0].payment_status, 'manual_verified_review_required');
    assert.equal((await s.request('/products/' + o.product_id)).data.stock_quantity, 0);
    assert.equal((await sql(s.database, 'SELECT COUNT(*) count FROM sales'))[0].count, sales);
    assert.equal((await sql(s.database, "SELECT COUNT(*) count FROM billing_documents WHERE order_id=? AND kind='receipt'", [o.id]))[0].count, 1);
  });
  await t.test('UPI and provider attempts cannot double-charge or double-book the same order', async () => {
    assert.equal((await s.request('/payments/create', { reference: settledOrder.reference }, s.alice)).response.status, 409);
    const pending = await s.order(); const provider = await s.request('/payments/create', { reference: pending.reference }, s.alice); assert.equal(provider.response.status, 200, JSON.stringify(provider.data));
    assert.equal((await s.details(pending)).response.status, 409);
    assert.equal((await s.submit(pending, '611400000006')).response.status, 409);
    assert.equal((await s.confirm(pending, '611400000006')).response.status, 409);
    const paymentId = 'pay_UpiConflictFixture';
    const signature = crypto.createHmac('sha256', providerSecret).update(`${provider.data.order_id}|${paymentId}`).digest('hex');
    assert.equal((await s.request('/payments/verify', { order_id: provider.data.order_id, payment_id: paymentId, signature }, s.alice)).response.status, 200);
    assert.equal((await s.confirm(pending, '611400000006')).response.status, 409);
    assert.equal((await s.request('/products/' + pending.product_id)).data.stock_quantity, 6);
  });
});

test('phone-only or malformed UPI configuration never produces a guessed receiving address', { timeout: 20000 }, async t => {
  const s = await launch(t, { UPI_ID: '9344898473', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '' });
  const config = await s.request('/api/config'); assert.equal(config.data.direct_upi.configured, false); assert.equal(config.data.features.direct_upi, false);
  const o = await s.order(); const result = await s.details(o); assert.equal(result.response.status, 503);
  assert.ok(!JSON.stringify(result.data).includes('9344898473@'));
});
